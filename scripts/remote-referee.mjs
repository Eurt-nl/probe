import process from 'node:process';
import PocketBase from 'pocketbase';
import { EventSource } from 'eventsource';

// PocketBase realtime in Node requires an EventSource implementation.
if (!globalThis.EventSource) {
  globalThis.EventSource = EventSource;
}

const pbUrl = process.env.PB_URL || 'https://pb.9621da15.cloud';
const adminEmail = process.env.PB_ADMIN_EMAIL;
const adminPassword = process.env.PB_ADMIN_PASSWORD;

if (!adminEmail || !adminPassword) {
  console.error('Missing PB_ADMIN_EMAIL or PB_ADMIN_PASSWORD');
  process.exit(1);
}

const pb = new PocketBase(pbUrl);

function slotPoints(index) {
  if (index <= 1 || index >= 10) return 5;
  if (index <= 3 || index >= 8) return 10;
  return 15;
}

function normalizeGuess(raw) {
  return String(raw || '').trim().toUpperCase().slice(0, 1);
}

function nextPlayerUserId(players, currentUserId) {
  const sorted = [...players].sort((a, b) => Number(a.seat_index) - Number(b.seat_index));
  const idx = sorted.findIndex((p) => String(p.player) === String(currentUserId));
  if (idx < 0) return sorted[0]?.player;
  return sorted[(idx + 1) % sorted.length]?.player;
}

async function getPlayers(gameId) {
  return await pb.collection('probe_players').getFullList({
    filter: `game = "${gameId}"`,
    sort: 'seat_index'
  });
}

async function getSecret(gameId, playerUserId) {
  return await pb.collection('probe_secret_words').getFirstListItem(
    `game = "${gameId}" && player = "${playerUserId}"`
  );
}

async function createNotification(userId, gameId, title, body) {
  await pb.collection('in_app_notifications').create({
    user: userId,
    game: gameId,
    type: 'game_update',
    title,
    body,
    is_read: 'false',
    sent_ntfy: 'false',
    ntfy_topic: ''
  });
}

async function processGuess(record) {
  const gameId = String(record.game);
  const actorUserId = String(record.actor);
  const targetUserId = String(record.target_player);
  const guessChar = normalizeGuess(record.guess_char);

  const game = await pb.collection('probe_games').getOne(gameId);
  if (String(game.status) !== 'active') {
    await pb.collection('probe_guesses').update(record.id, {
      success: 'false',
      points_delta: '0',
      reason: 'Game is not active'
    });
    return;
  }

  if (String(game.turn_player) !== actorUserId) {
    await pb.collection('probe_guesses').update(record.id, {
      success: 'false',
      points_delta: '0',
      reason: 'Not your turn'
    });
    return;
  }

  const players = await getPlayers(gameId);
  const actor = players.find((entry) => String(entry.player) === actorUserId);
  const target = players.find((entry) => String(entry.player) === targetUserId);

  if (!actor || !target) {
    await pb.collection('probe_guesses').update(record.id, {
      success: 'false',
      points_delta: '0',
      reason: 'Invalid actor/target'
    });
    return;
  }

  const secretRecord = await getSecret(gameId, targetUserId);
  const secret = String(secretRecord.secret_word || '').toUpperCase();
  const revealedMask = Array.isArray(target.revealed_mask)
    ? [...target.revealed_mask]
    : Array.from({ length: Number(target.secret_length || secret.length) }, () => false);

  const matchingIndexes = [];
  for (let i = 0; i < secret.length; i += 1) {
    if (secret[i] === guessChar && !revealedMask[i]) {
      matchingIndexes.push(i);
    }
  }

  if (matchingIndexes.length > 0) {
    const revealIndex = matchingIndexes[0];
    revealedMask[revealIndex] = true;

    let pointsDelta = slotPoints(revealIndex);
    const isNowFullyRevealed = revealedMask.every((value) => value === true);
    if (isNowFullyRevealed) {
      pointsDelta += 50;
    }

    await pb.collection('probe_players').update(actor.id, {
      score: Number(actor.score || 0) + pointsDelta
    });

    await pb.collection('probe_players').update(target.id, {
      revealed_mask: revealedMask,
      is_word_revealed: isNowFullyRevealed
    });

    await pb.collection('probe_guesses').update(record.id, {
      success: 'true',
      points_delta: String(pointsDelta),
      reason: isNowFullyRevealed ? 'Correct + word complete bonus' : 'Correct guess'
    });

    await createNotification(actorUserId, gameId, 'Correcte gok', `Je gok ${guessChar} was correct (+${pointsDelta}).`);

    if (isNowFullyRevealed) {
      await createNotification(targetUserId, gameId, 'Woord blootgelegd', 'Jouw woord is volledig blootgelegd.');
    }

    const allRevealed = players
      .map((entry) => (String(entry.id) === String(target.id) ? { ...entry, is_word_revealed: isNowFullyRevealed } : entry))
      .every((entry) => Boolean(entry.is_word_revealed));

    if (allRevealed) {
      await pb.collection('probe_games').update(gameId, {
        status: 'finished',
        ended_at: new Date().toISOString()
      });
    }

    return;
  }

  const penalty = guessChar === '.' ? -50 : 0;
  if (penalty !== 0) {
    await pb.collection('probe_players').update(actor.id, {
      score: Number(actor.score || 0) + penalty
    });
  }

  const nextUser = nextPlayerUserId(players, actorUserId);
  if (nextUser) {
    await pb.collection('probe_games').update(gameId, { turn_player: nextUser });
    await createNotification(nextUser, gameId, 'Jouw beurt', 'De beurt is naar jou gegaan.');
  }

  await pb.collection('probe_guesses').update(record.id, {
    success: 'false',
    points_delta: String(penalty),
    reason: penalty < 0 ? 'Dot penalty applied (-50)' : 'Missed guess'
  });
}

async function main() {
  await pb.collection('_superusers').authWithPassword(adminEmail, adminPassword);
  console.log(`[referee] connected to ${pbUrl}`);

  await pb.collection('probe_guesses').subscribe('*', async (event) => {
    if (event.action !== 'create') return;

    try {
      const record = event.record;
      if (String(record.reason || '') !== 'Pending validation') {
        return;
      }

      await processGuess(record);
      console.log(`[referee] processed guess ${record.id}`);
    } catch (error) {
      console.error('[referee] processing error', error);
    }
  });

  console.log('[referee] listening for guess events');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
