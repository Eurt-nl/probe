import process from 'node:process';
import PocketBase from 'pocketbase';
import { EventSource } from 'eventsource';

// PocketBase realtime in Node requires an EventSource implementation.
if (!globalThis.EventSource) {
  globalThis.EventSource = EventSource;
}

const pbUrl = process.env.PB_URL || 'https://pb.pitch-putt.live';
const adminEmail = process.env.PB_ADMIN_EMAIL;
const adminPassword = process.env.PB_ADMIN_PASSWORD;

if (!adminEmail || !adminPassword) {
  console.error('Missing PB_ADMIN_EMAIL or PB_ADMIN_PASSWORD');
  process.exit(1);
}

const pb = new PocketBase(pbUrl);

function slotPoints(index) {
  const values = [5, 10, 15, 15, 10, 5, 5, 10, 15, 15, 10, 5];
  return values[index] ?? 0;
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

function cardType(card) {
  return String(card?.type || card?.code || 'NORMAL_TURN');
}

function cardValue(card) {
  return Number(card?.value || 0);
}

async function getSecret(gameId, playerUserId) {
  return await pb.collection('probe_secret_words').getFirstListItem(
    `game = "${gameId}" && player = "${playerUserId}"`
  );
}

async function createNotification(userId, gameId, title, body, type = 'game_update') {
  await pb.collection('probe_in_app_notifications').create(
    {
      user: userId,
      game: gameId,
      type,
      title,
      body,
      is_read: false,
      sent_ntfy: false,
      ntfy_topic: ''
    },
    { requestKey: null }
  );
}

const lastTurnNotificationKeyByGame = new Map();
const turnStateByGame = new Map();
const finalRoundsByGame = new Map();

function isMaskFullyRevealed(mask) {
  return Array.isArray(mask) && mask.every((value) => typeof value === 'string' && value.length > 0);
}

async function exposeOneHiddenSlot(gameId, targetPlayerRecord, secret, includeOnlyDot = false) {
  const revealedMask = Array.isArray(targetPlayerRecord.revealed_mask)
    ? [...targetPlayerRecord.revealed_mask]
    : Array.from({ length: Number(targetPlayerRecord.secret_length || secret.length) }, () => null);

  const hiddenIndexes = [];
  for (let i = 0; i < secret.length; i += 1) {
    if (revealedMask[i]) continue;
    if (includeOnlyDot && secret[i] !== '.') continue;
    hiddenIndexes.push(i);
  }
  if (!hiddenIndexes.length) return null;

  // Probe preference: reveal from the lowest available slot value first (5 -> 10 -> 15),
  // but still random within that bucket.
  const groupedByValue = new Map();
  for (const idx of hiddenIndexes) {
    const value = slotPoints(idx);
    if (!groupedByValue.has(value)) groupedByValue.set(value, []);
    groupedByValue.get(value).push(idx);
  }
  const availableValues = Array.from(groupedByValue.keys()).sort((a, b) => a - b);
  const candidateIndexes = groupedByValue.get(availableValues[0]) || hiddenIndexes;
  const revealIndex = candidateIndexes[Math.floor(Math.random() * candidateIndexes.length)];
  revealedMask[revealIndex] = secret[revealIndex];
  const isWordRevealed = isMaskFullyRevealed(revealedMask);

  await pb.collection('probe_players').update(targetPlayerRecord.id, {
    revealed_mask: revealedMask,
    is_word_revealed: isWordRevealed
  }, { requestKey: null });

  return {
    revealIndex,
    char: secret[revealIndex],
    points: slotPoints(revealIndex),
    isWordRevealed
  };
}

async function maybeFinalizeIfAllRevealed(gameId) {
  const players = await getPlayers(gameId);
  if (!players.length) return false;
  if (!players.every((entry) => Boolean(entry.is_word_revealed))) return false;
  await finalizeGame(gameId);
  finalRoundsByGame.delete(gameId);
  turnStateByGame.delete(gameId);
  lastTurnNotificationKeyByGame.delete(gameId);
  return true;
}

async function notifyFinalRoundsStart(gameId) {
  const players = await getPlayers(gameId);
  if (!players.length) return;
  const body = 'Het einde nadert. Er is nog een woord niet geraden, iedereen krijgt nog maximaal 2 beurten.';
  await Promise.all(
    players.map((entry) =>
      createNotification(String(entry.player), gameId, 'Eindfase', body, 'system').catch(() => {})
    )
  );
}

async function maybeEnterFinalRounds(gameId) {
  const players = await getPlayers(gameId);
  const unrevealed = players.filter((entry) => !Boolean(entry.is_word_revealed));
  if (unrevealed.length !== 1) return null;

  const holderUserId = String(unrevealed[0].player);
  const existing = finalRoundsByGame.get(gameId);
  if (existing && String(existing.holderUserId) === holderUserId) {
    return existing;
  }

  const turnsLeftByOpponent = {};
  for (const player of players) {
    const playerUserId = String(player.player);
    if (playerUserId === holderUserId) continue;
    turnsLeftByOpponent[playerUserId] = 2;
  }

  const state = {
    holderUserId,
    turnsLeftByOpponent
  };
  finalRoundsByGame.set(gameId, state);
  await notifyFinalRoundsStart(gameId);
  return state;
}

async function applyFinalRoundAutoReveal(gameId, holderUserId) {
  const players = await getPlayers(gameId);
  const holder = players.find((entry) => String(entry.player) === String(holderUserId));
  if (!holder) return;

  const secretRecord = await getSecret(gameId, holderUserId).catch(() => null);
  const secret = String(secretRecord?.secret_word || '').toUpperCase();
  if (!secret) return;

  const revealedMask = Array.isArray(holder.revealed_mask)
    ? [...holder.revealed_mask]
    : Array.from({ length: Number(holder.secret_length || secret.length) }, () => null);
  const hiddenIndexes = [];
  for (let i = 0; i < revealedMask.length; i += 1) {
    if (!revealedMask[i]) hiddenIndexes.push(i);
  }

  const revealPoints = hiddenIndexes.reduce((sum, index) => sum + slotPoints(index), 0);
  const hiddenCount = hiddenIndexes.length;
  const bonus50 = 50;
  const bonus100 = hiddenCount >= 5 ? 100 : 0;
  const totalDelta = revealPoints + bonus50 + bonus100;

  await pb.collection('probe_players').update(holder.id, {
    score: Number(holder.score || 0) + totalDelta,
    revealed_mask: secret.split(''),
    is_word_revealed: true
  }, { requestKey: null });

  await createNotification(
    holderUserId,
    gameId,
    'Eindfase bonus',
    `Jouw laatste woord bleef staan: +${revealPoints} +50 bonus${bonus100 ? ' +100 bonus' : ''}.`,
    'game_update'
  ).catch(() => {});

  await finalizeGame(gameId);
  finalRoundsByGame.delete(gameId);
  turnStateByGame.delete(gameId);
  lastTurnNotificationKeyByGame.delete(gameId);
}

async function applyTurnStartEffects(gameId, turnPlayerUserId, card) {
  const game = await pb.collection('probe_games').getOne(gameId).catch(() => null);
  if (!game || String(game.status) !== 'active') return;

  const players = await getPlayers(gameId);
  const player = players.find((entry) => String(entry.player) === String(turnPlayerUserId));
  if (!player) return;

  const type = cardType(card);
  const value = cardValue(card);

  if (type === 'ADD_SCORE' || type === 'DEDUCT_SCORE') {
    if (value !== 0) {
      await pb.collection('probe_players').update(player.id, {
        score: Number(player.score || 0) + value
      }, { requestKey: null });
    }
    return `score ${value >= 0 ? '+' : ''}${value}`;
  }

  if (type === 'EXPOSE_OWN_DOT') {
    const secretRecord = await getSecret(gameId, String(player.player)).catch(() => null);
    const secret = String(secretRecord?.secret_word || '').toUpperCase();
    if (!secret) return;
    const exposed = await exposeOneHiddenSlot(gameId, player, secret, true);
    await maybeFinalizeIfAllRevealed(gameId);
    if (!exposed) return 'geen verborgen dot om te openen';
    return 'eigen dot geopend';
  }

  if (type === 'LEFT_EXPOSES' || type === 'RIGHT_EXPOSES') {
    const sorted = [...players].sort((a, b) => Number(a.seat_index) - Number(b.seat_index));
    const currentIndex = sorted.findIndex((entry) => String(entry.player) === String(player.player));
    if (currentIndex < 0 || sorted.length < 2) return;

    const targetIndex = type === 'LEFT_EXPOSES'
      ? (currentIndex - 1 + sorted.length) % sorted.length
      : (currentIndex + 1) % sorted.length;
    const target = sorted[targetIndex];
    const secretRecord = await getSecret(gameId, String(target.player)).catch(() => null);
    const secret = String(secretRecord?.secret_word || '').toUpperCase();
    if (!secret) return;

    const exposed = await exposeOneHiddenSlot(gameId, target, secret, false);
    if (!exposed) return 'geen verborgen slot om te openen';

    const points = Number(exposed.points || 0);
    await pb.collection('probe_players').update(player.id, {
      score: Number(player.score || 0) + points
    }, { requestKey: null });

    await maybeFinalizeIfAllRevealed(gameId);
    const displayedChar = exposed.char === '.' ? 'stip' : exposed.char;
    return `${target.expand?.player?.display_name || target.expand?.player?.name || 'opponent'} opende ${displayedChar} (+${points})`;
  }

  return '';
}

async function initTurnStateForPlayer(gameId, playerUserId) {
  const cards = await getEnabledActivityCards();
  const pickedCard = randomItem(cards);
  const multiplier = cardType(pickedCard) === 'MULTIPLY_FIRST_GUESS'
    ? Math.max(1, cardValue(pickedCard))
    : 1;
  const state = {
    player: playerUserId,
    card: pickedCard || { code: 'NORMAL_TURN', type: 'NORMAL_TURN', label: 'Take your normal turn' },
    multiplier,
    guessCount: 0,
    additionalMissConsumed: false,
    effectText: ''
  };
  turnStateByGame.set(gameId, state);
  state.effectText = String(await applyTurnStartEffects(gameId, playerUserId, state.card) || '');
  await maybeEnterFinalRounds(gameId).catch(() => null);
  turnStateByGame.set(gameId, state);
  return state;
}

async function ensureTurnState(gameId, turnPlayer) {
  const game = await pb.collection('probe_games').getOne(gameId).catch(() => null);
  if (!game || String(game.status) !== 'active') return null;
  const currentPlayer = String(turnPlayer || game.turn_player || '');
  if (!currentPlayer) return null;

  const existing = turnStateByGame.get(gameId);
  if (existing && String(existing.player) === currentPlayer) {
    return existing;
  }

  return await initTurnStateForPlayer(gameId, currentPlayer);
}

async function maybeAutoPassFinalHolderTurn(gameId, turnPlayerUserId) {
  const finalState = finalRoundsByGame.get(gameId);
  if (!finalState) return false;
  if (String(finalState.holderUserId) !== String(turnPlayerUserId)) return false;

  const players = await getPlayers(gameId);
  const nextUser = nextPlayerUserId(players, turnPlayerUserId);
  if (!nextUser || String(nextUser) === String(turnPlayerUserId)) return false;

  turnStateByGame.delete(gameId);
  await pb.collection('probe_games').update(gameId, { turn_player: nextUser }, { requestKey: null });
  return true;
}

async function maybeAutoPassUsingCurrentTurnPlayer(gameId) {
  const game = await pb.collection('probe_games').getOne(gameId).catch(() => null);
  if (!game || String(game.status) !== 'active') return false;
  const turnPlayerUserId = String(game.turn_player || '');
  if (!turnPlayerUserId) return false;
  return await maybeAutoPassFinalHolderTurn(gameId, turnPlayerUserId);
}

async function notifyTurnStart(gameId, turnPlayerUserId, state = null) {
  const turnState = state || turnStateByGame.get(gameId) || await ensureTurnState(gameId, turnPlayerUserId);
  if (!turnState) return;

  const key = `${gameId}:${turnPlayerUserId}:${turnState.card?.id || turnState.card?.code || turnState.card?.label}`;
  if (lastTurnNotificationKeyByGame.get(gameId) === key) return;
  lastTurnNotificationKeyByGame.set(gameId, key);

  const players = await getPlayers(gameId);
  const turnPlayer = players.find((entry) => String(entry.player) === String(turnPlayerUserId));
  const turnPlayerName = String(turnPlayer?.expand?.player?.display_name || turnPlayer?.expand?.player?.name || turnPlayerUserId);

  const cardLabel = String(turnState.card?.label || 'Geen kaart');
  const effectSuffix = turnState.effectText ? ` — ${turnState.effectText}` : '';
  const body = `${turnPlayerName} trok: ${cardLabel}${effectSuffix}`;

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

async function maybeAutoStartGameWhenFull(gameId) {
  if (!gameId) return;
  const game = await pb.collection('probe_games').getOne(gameId).catch(() => null);
  if (!game || String(game.status) !== 'lobby') return;

  const players = await getPlayers(gameId);
  if (players.length < 4) return;

  const sorted = [...players].sort((a, b) => Number(a.seat_index) - Number(b.seat_index));
  const firstPlayerUserId = String(sorted[0]?.player || '');
  if (!firstPlayerUserId) return;

  await pb.collection('probe_games').update(gameId, {
    status: 'active',
    turn_player: firstPlayerUserId
  }, { requestKey: null });
}

async function pruneLobbyChatArchive() {
  const all = await pb.collection('probe_lobby_chat_messages').getFullList({
    sort: '+message_at,+id',
    requestKey: null
  }).catch(() => []);

  const maxMessages = 100;
  if (all.length <= maxMessages) return;

  const toDelete = all.slice(0, all.length - maxMessages);
  for (const record of toDelete) {
    await pb.collection('probe_lobby_chat_messages').delete(record.id, { requestKey: null }).catch(() => {});
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
    const hiddenIndexes = [];
    for (let i = 0; i < revealedMask.length; i += 1) {
      if (!revealedMask[i]) hiddenIndexes.push(i);
    }

    // Official interruptive gate: only allowed when target still has 5+ hidden slots.
    // If not, treat as "no reply" (no penalty / no reveal).
    if (hiddenIndexes.length < 5) {
      await pb.collection('probe_guesses').update(record.id, {
        success: 'false',
        points_delta: '0',
        reason: 'Interruptive ignored (<5 hidden slots)'
      });
      return;
    }

    if (guessedWord === secretWordOnly && guessedWord.length > 0) {
      const revealPoints = hiddenIndexes.reduce((sum, idx) => sum + slotPoints(idx), 0);
      const pointsDelta = revealPoints + 100;
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
        reason: `Interruptive word guess correct (+${revealPoints} +100 bonus)`
      });

      await createNotification(actorUserId, gameId, 'Supergok goed', `Je supergok "${guessedWord}" was correct (+${revealPoints} +100 bonus).`);
      await createNotification(targetUserId, gameId, 'Woord geraden', 'Een speler heeft jouw woord in 1 keer geraden.');

      const allRevealed = players
        .map((entry) => (String(entry.id) === String(target.id) ? { ...entry, is_word_revealed: true } : entry))
        .every((entry) => Boolean(entry.is_word_revealed));

      if (allRevealed) {
        await finalizeGame(gameId);
        finalRoundsByGame.delete(gameId);
        turnStateByGame.delete(gameId);
        lastTurnNotificationKeyByGame.delete(gameId);
      } else {
        await maybeEnterFinalRounds(gameId).catch(() => null);
        await maybeAutoPassUsingCurrentTurnPlayer(gameId).catch(() => null);
      }

      return;
    }

    await pb.collection('probe_players').update(actor.id, {
      score: Number(actor.score || 0) - 50
    });

    await pb.collection('probe_guesses').update(record.id, {
      success: 'false',
      points_delta: '-50',
      reason: 'Interruptive word guess failed (-50)'
    });

    await createNotification(actorUserId, gameId, 'Supergok fout', `Je supergok "${guessedWord || '-'}" was fout (-50).`);
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

  const turnState = await ensureTurnState(gameId, actorUserId);
  if (!turnState || String(turnState.player) !== actorUserId) {
    await pb.collection('probe_guesses').update(record.id, {
      success: 'false',
      points_delta: '0',
      reason: 'Turn state not ready'
    }, { requestKey: null });
    return;
  }

  const turnType = cardType(turnState.card);
  const isFirstGuessInTurn = Number(turnState.guessCount || 0) === 0;

  const matchingIndexes = [];
  for (let i = 0; i < secret.length; i += 1) {
    if (secret[i] === guessChar && !revealedMask[i]) {
      matchingIndexes.push(i);
    }
  }

  if (matchingIndexes.length > 0) {
    const revealIndex = matchingIndexes[Math.floor(Math.random() * matchingIndexes.length)];
    // Store the revealed character directly so clients can render public board state.
    revealedMask[revealIndex] = secret[revealIndex];

    let pointsDelta = slotPoints(revealIndex);
    if (isFirstGuessInTurn && turnType === 'MULTIPLY_FIRST_GUESS') {
      pointsDelta *= Math.max(1, Number(turnState.multiplier || 1));
    }
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
      finalRoundsByGame.delete(gameId);
      turnStateByGame.delete(gameId);
      lastTurnNotificationKeyByGame.delete(gameId);
    } else {
      await maybeEnterFinalRounds(gameId).catch(() => null);
      await maybeAutoPassUsingCurrentTurnPlayer(gameId).catch(() => null);
    }

    turnState.guessCount = Number(turnState.guessCount || 0) + 1;
    turnStateByGame.set(gameId, turnState);
    return;
  }

  const penalty = guessChar === '.' ? -50 : 0;
  if (penalty !== 0) {
    await pb.collection('probe_players').update(actor.id, {
      score: Number(actor.score || 0) + penalty
    });
  }

  const nextUser = nextPlayerUserId(players, actorUserId);
  const keepTurnByAdditionalCard = turnType === 'ADDITIONAL_TURN' && !turnState.additionalMissConsumed;

  if (keepTurnByAdditionalCard) {
    turnState.guessCount = Number(turnState.guessCount || 0) + 1;
    turnState.additionalMissConsumed = true;
    turnStateByGame.set(gameId, turnState);
    await pb.collection('probe_guesses').update(record.id, {
      success: 'false',
      points_delta: String(penalty),
      reason: penalty < 0
        ? 'Dot penalty applied (-50), additional turn remains'
        : 'Missed guess, additional turn remains'
    }, { requestKey: null });
    return;
  }
  turnStateByGame.delete(gameId);

  const finalState = finalRoundsByGame.get(gameId);
  if (finalState && String(actorUserId) !== String(finalState.holderUserId)) {
    const current = Number(finalState.turnsLeftByOpponent[actorUserId] || 0);
    finalState.turnsLeftByOpponent[actorUserId] = Math.max(0, current - 1);
    finalRoundsByGame.set(gameId, finalState);

    const allDone = Object.values(finalState.turnsLeftByOpponent).every((value) => Number(value) <= 0);
    if (allDone) {
      await applyFinalRoundAutoReveal(gameId, String(finalState.holderUserId));
      return;
    }
  }

  if (nextUser) {
    await pb.collection('probe_games').update(gameId, { turn_player: nextUser }, { requestKey: null });
  }

  await pb.collection('probe_guesses').update(record.id, {
    success: 'false',
    points_delta: String(penalty),
    reason: penalty < 0 ? 'Dot penalty applied (-50)' : 'Missed guess'
  }, { requestKey: null });
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
        const state = await ensureTurnState(gameId, turnPlayer);
        await notifyTurnStart(gameId, turnPlayer, state);
        await maybeEnterFinalRounds(gameId).catch(() => null);
        await maybeAutoPassFinalHolderTurn(gameId, turnPlayer).catch(() => null);
      }
      if (status !== 'active') {
        turnStateByGame.delete(gameId);
        lastTurnNotificationKeyByGame.delete(gameId);
        finalRoundsByGame.delete(gameId);
      }
    } catch (error) {
      console.error('[referee] turn init error', error);
    }
  });

  await pb.collection('probe_players').subscribe('*', async (event) => {
    if (event.action !== 'create' && event.action !== 'update' && event.action !== 'delete') return;
    try {
      const gameId = String(event.record?.game || '');
      if (!gameId) return;
      await maybeAutoStartGameWhenFull(gameId);
    } catch (error) {
      console.error('[referee] auto-start error', error);
    }
  });

  await pb.collection('probe_lobby_chat_messages').subscribe('*', async (event) => {
    if (event.action !== 'create') return;
    try {
      await pruneLobbyChatArchive();
    } catch (error) {
      console.error('[referee] lobby chat prune error', error);
    }
  }).catch(() => {
    console.warn('[referee] probe_lobby_chat_messages collection not available yet');
  });

  console.log('[referee] listening for guess events');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
