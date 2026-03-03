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

function normalizeWordGuess(raw) {
  return String(raw || '').trim().toUpperCase().replace(/[^A-Z]/g, '');
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
    sort: 'seat_index',
    expand: 'player'
  });
}

async function getEnabledActivityCards() {
  return await pb.collection('probe_activity_cards').getFullList({
    filter: 'enabled = true',
    sort: 'id'
  }).catch(() => []);
}

function randomItem(items) {
  if (!items.length) return null;
  const idx = Math.floor(Math.random() * items.length);
  return items[idx] ?? null;
}

async function createNextTurn(gameId, playerUserId) {
  const existingTurns = await pb.collection('probe_turns').getFullList({
    filter: `game = "${gameId}"`,
    sort: '-turn_index'
  }).catch(() => []);

  for (const turn of existingTurns.filter((entry) => String(entry.status) === 'active')) {
    await pb.collection('probe_turns').update(turn.id, { status: 'ended' }).catch(() => {});
  }

  const nextTurnIndex = Number(existingTurns[0]?.turn_index ?? -1) + 1;
  const cards = await getEnabledActivityCards();
  const pickedCard = randomItem(cards);
  const payload = {
    game: gameId,
    player: playerUserId,
    turn_index: nextTurnIndex,
    multiplier: 1,
    status: 'active'
  };

  if (pickedCard?.id) {
    payload.activity_card = pickedCard.id;
  }

  await pb.collection('probe_turns').create(payload).catch(() => {});
}

async function ensureInitialTurnForGame(gameId) {
  const game = await pb.collection('probe_games').getOne(gameId).catch(() => null);
  if (!game || String(game.status) !== 'active') return;

  const turns = await pb.collection('probe_turns').getFullList({
    filter: `game = "${gameId}"`,
    sort: '-turn_index'
  }).catch(() => []);

  if (turns.length > 0) return;
  const turnPlayer = String(game.turn_player || '');
  if (!turnPlayer) return;
  await createNextTurn(gameId, turnPlayer);
}

async function getSecret(gameId, playerUserId) {
  return await pb.collection('probe_secret_words').getFirstListItem(
    `game = "${gameId}" && player = "${playerUserId}"`
  );
}

async function createNotification(userId, gameId, title, body, type = 'game_update') {
  await pb.collection('in_app_notifications').create({
    user: userId,
    game: gameId,
    type,
    title,
    body,
    is_read: 'false',
    sent_ntfy: 'false',
    ntfy_topic: ''
  });
}

const lastTurnNotificationKeyByGame = new Map();

async function notifyTurnStart(gameId, turnPlayerUserId) {
  const key = `${gameId}:${turnPlayerUserId}`;
  if (lastTurnNotificationKeyByGame.get(gameId) === key) return;
  lastTurnNotificationKeyByGame.set(gameId, key);

  const players = await getPlayers(gameId);
  const turnPlayer = players.find((entry) => String(entry.player) === String(turnPlayerUserId));
  const turnPlayerName = String(turnPlayer?.expand?.player?.display_name || turnPlayer?.expand?.player?.name || turnPlayerUserId);

  const cards = await getEnabledActivityCards();
  const pickedCard = randomItem(cards);
  const cardLabel = String(pickedCard?.label || 'Geen kaart');
  const body = `${turnPlayerName} trok: ${cardLabel}`;

  await Promise.all(
    players.map((entry) =>
      createNotification(String(entry.player), gameId, 'Activity card', body, 'turn_start').catch(() => {})
    )
  );
}

async function finalizeGame(gameId) {
  await pb.collection('probe_games').update(gameId, {
    status: 'finished',
    ended_at: new Date().toISOString()
  });

  const chatMessages = await pb.collection('probe_chat_messages').getFullList({
    filter: `game = "${gameId}"`,
    sort: '-id'
  }).catch(() => []);

  for (const message of chatMessages) {
    await pb.collection('probe_chat_messages').delete(message.id).catch(() => {});
  }
}

async function processGuess(record) {
  const gameId = String(record.game);
  const actorUserId = String(record.actor);
  const targetUserId = String(record.target_player);
  const guessChar = normalizeGuess(record.guess_char);
  const isInterruptive = Boolean(record.is_interruptive);

  const game = await pb.collection('probe_games').getOne(gameId);
  if (String(game.status) !== 'active') {
    await pb.collection('probe_guesses').update(record.id, {
      success: 'false',
      points_delta: '0',
      reason: 'Game is not active'
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
    : Array.from({ length: Number(target.secret_length || secret.length) }, () => null);

  if (isInterruptive) {
    const guessedWord = normalizeWordGuess(record.guess_word);
    const secretWordOnly = secret.replace(/\./g, '');

    if (guessedWord === secretWordOnly && guessedWord.length > 0) {
      const pointsDelta = 100;
      const fullyRevealedMask = secret.split('');

      await pb.collection('probe_players').update(actor.id, {
        score: Number(actor.score || 0) + pointsDelta
      });

      await pb.collection('probe_players').update(target.id, {
        revealed_mask: fullyRevealedMask,
        is_word_revealed: true
      });

      await pb.collection('probe_guesses').update(record.id, {
        success: 'true',
        points_delta: String(pointsDelta),
        reason: 'Interruptive word guess correct (+100)'
      });

      await createNotification(actorUserId, gameId, 'Supergok goed', `Je supergok "${guessedWord}" was correct (+100).`);
      await createNotification(targetUserId, gameId, 'Woord geraden', 'Een speler heeft jouw woord in 1 keer geraden.');

      const allRevealed = players
        .map((entry) => (String(entry.id) === String(target.id) ? { ...entry, is_word_revealed: true } : entry))
        .every((entry) => Boolean(entry.is_word_revealed));

      if (allRevealed) {
        await finalizeGame(gameId);
      }

      return;
    }

    await pb.collection('probe_players').update(actor.id, {
      score: Number(actor.score || 0) - 100
    });

    await pb.collection('probe_guesses').update(record.id, {
      success: 'false',
      points_delta: '-100',
      reason: 'Interruptive word guess failed (-100)'
    });

    await createNotification(actorUserId, gameId, 'Supergok fout', `Je supergok "${guessedWord || '-'}" was fout (-100).`);
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

  const matchingIndexes = [];
  for (let i = 0; i < secret.length; i += 1) {
    if (secret[i] === guessChar && !revealedMask[i]) {
      matchingIndexes.push(i);
    }
  }

  if (matchingIndexes.length > 0) {
    const revealIndex = matchingIndexes[0];
    // Store the revealed character directly so clients can render public board state.
    revealedMask[revealIndex] = secret[revealIndex];

    let pointsDelta = slotPoints(revealIndex);
    const isNowFullyRevealed = revealedMask.every((value) => typeof value === 'string' && value.length > 0);
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
      await finalizeGame(gameId);
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
    await notifyTurnStart(gameId, nextUser);
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
      await processGuess(record);
      console.log(`[referee] processed guess ${record.id}`);
    } catch (error) {
      console.error('[referee] processing error', error);
    }
  });

  await pb.collection('probe_games').subscribe('*', async (event) => {
    if (event.action !== 'update' && event.action !== 'create') return;
    try {
      const gameId = String(event.record?.id || '');
      if (!gameId) return;
      const status = String(event.record?.status || '');
      const turnPlayer = String(event.record?.turn_player || '');
      if (status === 'active' && turnPlayer) {
        await notifyTurnStart(gameId, turnPlayer);
      }
    } catch (error) {
      console.error('[referee] turn init error', error);
    }
  });

  console.log('[referee] listening for guess events');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
