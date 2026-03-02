import { pb, collections } from '@/services/pocketbase';

export interface RemoteGame {
  id: string;
  status: 'lobby' | 'active' | 'finished';
  owner: string;
  turn_player: string;
  max_players: number;
  rule_mode: 'classic' | 'two_player' | 'progressive';
  seed?: string;
}

export interface RemotePlayer {
  id: string;
  game: string;
  player: string;
  seat_index: number;
  score: number;
  secret_length: number;
  dot_count: number;
  hidden_count: number;
  is_word_revealed: boolean;
  display_name: string;
}

export interface RemoteGuess {
  id: string;
  actor: string;
  target_player: string;
  guess_char?: string;
  guess_word?: string;
  is_interruptive: boolean;
  success: boolean;
  points_delta: number;
  reason?: string;
  created: string;
}

function fakeHash(secret: string): string {
  // Placeholder hash so schema constraints are met; authoritative validation happens in backend hooks.
  return btoa(unescape(encodeURIComponent(secret))).padEnd(16, 'x').slice(0, 64);
}

function normalizeSecret(secret: string): string {
  return secret.trim().toUpperCase().replace(/[^A-Z.]/g, '').slice(0, 12);
}

function pbErrorString(error: unknown): string {
  const anyError = error as {
    response?: { message?: string; data?: Record<string, unknown> };
    message?: string;
  };
  return anyError?.response?.message ?? anyError?.message ?? String(error);
}

function isSeatConflictError(error: unknown): boolean {
  const raw = JSON.stringify((error as { response?: { data?: unknown } })?.response?.data ?? {});
  return raw.includes('idx_probe_players_game_seat') || raw.includes('seat_index');
}

function isGamePlayerConflictError(error: unknown): boolean {
  const raw = JSON.stringify((error as { response?: { data?: unknown } })?.response?.data ?? {});
  return raw.includes('idx_probe_players_game_player') || raw.includes('(game, player)');
}

function hiddenCountFromMask(mask: unknown, fallbackLength: number): number {
  if (Array.isArray(mask)) {
    return mask.filter((item) => item === false).length;
  }
  return fallbackLength;
}

export async function createRemoteGame(
  ownerUserId: string,
  mode: RemoteGame['rule_mode'] = 'classic',
  joinCode?: string
): Promise<RemoteGame> {
  const normalizedCode = joinCode?.trim();

  const created = await pb.collection(collections.games).create({
    status: 'lobby',
    owner: ownerUserId,
    turn_player: ownerUserId,
    max_players: 4,
    rule_mode: mode,
    seed: normalizedCode || ''
  });
  return created as unknown as RemoteGame;
}

export async function getRemoteGame(gameId: string): Promise<RemoteGame> {
  const game = await pb.collection(collections.games).getOne(gameId);
  return game as unknown as RemoteGame;
}

export async function resolveRemoteGameId(gameIdOrCode: string): Promise<string> {
  const value = gameIdOrCode.trim();
  if (!value) {
    throw new Error('Game ID/code is leeg');
  }

  const byId = await pb.collection(collections.games).getOne(value).catch(() => null);
  if (byId?.id) {
    return byId.id;
  }

  const byCode = await pb
    .collection(collections.games)
    .getFirstListItem(pb.filter('seed = {:code}', { code: value }))
    .catch(() => null);

  if (byCode?.id) {
    return byCode.id;
  }

  throw new Error('Lobby niet gevonden voor deze game-id/join-code');
}

export async function listRemotePlayers(gameId: string): Promise<RemotePlayer[]> {
  const records = await pb.collection(collections.players).getFullList({
    filter: `game = \"${gameId}\"`,
    expand: 'player',
    sort: 'seat_index'
  });

  return records.map((record) => ({
    id: record.id,
    game: String(record.game),
    player: String(record.player),
    seat_index: Number(record.seat_index ?? 0),
    score: Number(record.score ?? 0),
    secret_length: Number(record.secret_length ?? 0),
    dot_count: Number(record.dot_count ?? 0),
    hidden_count: hiddenCountFromMask(record.revealed_mask, Number(record.secret_length ?? 0)),
    is_word_revealed: Boolean(record.is_word_revealed),
    display_name: String(record.expand?.player?.display_name ?? record.expand?.player?.name ?? record.player)
  }));
}

export async function joinRemoteGame(gameId: string, userId: string, secret: string): Promise<void> {
  const normalizedSecret = normalizeSecret(secret);
  if (!normalizedSecret.length) {
    throw new Error('Geheim woord is leeg of ongeldig');
  }

  const dotCount = normalizedSecret.split('').filter((char) => char === '.').length;
  const ownPlayerRecord = await pb
    .collection(collections.players)
    .getFirstListItem(`game = \"${gameId}\" && player = \"${userId}\"`)
    .catch(() => null);

  if (!ownPlayerRecord) {
    let created = false;
    let alreadyJoined = false;
    for (let seat = 0; seat < 4; seat += 1) {
      try {
        await pb.collection(collections.players).create({
          game: gameId,
          player: userId,
          seat_index: String(seat),
          score: '0',
          secret_word_hash: fakeHash(normalizedSecret),
          secret_length: String(normalizedSecret.length),
          dot_count: String(dotCount),
          revealed_mask: JSON.stringify(Array.from({ length: normalizedSecret.length }, () => false)),
          is_word_revealed: 'false',
          misspelled: 'false'
        });
        created = true;
        break;
      } catch (error) {
        if (isGamePlayerConflictError(error)) {
          alreadyJoined = true;
          break;
        }

        if (isSeatConflictError(error)) {
          // Try the next seat index if this one is taken.
          continue;
        }

        throw new Error(`Player create failed: ${pbErrorString(error)}`);
      }
    }

    if (!created && !alreadyJoined) {
      throw new Error('Geen vrije plek beschikbaar in deze lobby');
    }
  } else {
    await pb.collection(collections.players).update(ownPlayerRecord.id, {
      secret_word_hash: fakeHash(normalizedSecret),
      secret_length: String(normalizedSecret.length),
      dot_count: String(dotCount),
      revealed_mask: JSON.stringify(Array.from({ length: normalizedSecret.length }, () => false)),
      is_word_revealed: 'false',
      misspelled: 'false'
    });
  }

  const existingSecret = await pb.collection(collections.secretWords)
    .getFirstListItem(`game = \"${gameId}\" && player = \"${userId}\"`)
    .catch(() => null);

  if (existingSecret) {
    await pb.collection(collections.secretWords).update(existingSecret.id, {
      secret_word: normalizedSecret
    });
    return;
  }

  await pb.collection(collections.secretWords).create({
    game: gameId,
    player: userId,
    secret_word: normalizedSecret
  });
}

export async function startRemoteGame(gameId: string): Promise<void> {
  const players = await listRemotePlayers(gameId);
  if (!players.length) return;

  await pb.collection(collections.games).update(gameId, {
    status: 'active',
    turn_player: players[0].player
  });
}

export async function advanceTurn(gameId: string, nextPlayerUserId: string): Promise<void> {
  await pb.collection(collections.games).update(gameId, {
    turn_player: nextPlayerUserId
  });
}

export async function submitRemoteGuess(remoteGameId: string, payload: {
  actor: string;
  target_player: string;
  guess_char: string;
}): Promise<void> {
  await pb.collection(collections.guesses).create({
    game: remoteGameId,
    actor: payload.actor,
    target_player: payload.target_player,
    guess_char: payload.guess_char.toUpperCase()[0],
    is_interruptive: 'false',
    success: 'false',
    points_delta: '0',
    reason: 'Pending validation'
  });
}

export async function listRemoteGuesses(gameId: string): Promise<RemoteGuess[]> {
  const records = await pb.collection(collections.guesses).getFullList({
    filter: `game = \"${gameId}\"`,
    sort: '-created'
  });

  return records.map((record) => ({
    id: record.id,
    actor: String(record.actor),
    target_player: String(record.target_player),
    guess_char: record.guess_char ? String(record.guess_char) : undefined,
    guess_word: record.guess_word ? String(record.guess_word) : undefined,
    is_interruptive: Boolean(record.is_interruptive),
    success: Boolean(record.success),
    points_delta: Number(record.points_delta ?? 0),
    reason: record.reason ? String(record.reason) : undefined,
    created: String(record.created)
  }));
}

export async function subscribeRemoteGame(gameId: string, onChange: () => void): Promise<() => void> {
  const unsubs: Array<() => void> = [];

  await pb.collection(collections.games).subscribe(gameId, onChange);
  unsubs.push(() => pb.collection(collections.games).unsubscribe(gameId));

  await pb.collection(collections.players).subscribe('*', onChange, {
    filter: `game = \"${gameId}\"`
  });
  unsubs.push(() => pb.collection(collections.players).unsubscribe('*'));

  await pb.collection(collections.guesses).subscribe('*', onChange, {
    filter: `game = \"${gameId}\"`
  });
  unsubs.push(() => pb.collection(collections.guesses).unsubscribe('*'));

  return () => {
    unsubs.forEach((unsubscribe) => unsubscribe());
  };
}
