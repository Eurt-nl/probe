import { pb, collections } from '@/services/pocketbase';

export interface RemoteGame {
  id: string;
  status: 'lobby' | 'active' | 'finished';
  owner: string;
  turn_player: string;
  max_players: number;
  rule_mode: 'classic' | 'two_player' | 'progressive';
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

function hiddenCountFromMask(mask: unknown, fallbackLength: number): number {
  if (Array.isArray(mask)) {
    return mask.filter((item) => item === false).length;
  }
  return fallbackLength;
}

export async function createRemoteGame(ownerUserId: string, mode: RemoteGame['rule_mode'] = 'classic'): Promise<RemoteGame> {
  const created = await pb.collection(collections.games).create({
    status: 'lobby',
    owner: ownerUserId,
    turn_player: ownerUserId,
    max_players: 4,
    rule_mode: mode
  });
  return created as unknown as RemoteGame;
}

export async function getRemoteGame(gameId: string): Promise<RemoteGame> {
  const game = await pb.collection(collections.games).getOne(gameId);
  return game as unknown as RemoteGame;
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
  const players = await listRemotePlayers(gameId);
  const existing = players.find((player) => player.player === userId);

  const normalizedSecret = normalizeSecret(secret);
  if (!normalizedSecret.length) {
    throw new Error('Geheim woord is leeg of ongeldig');
  }

  if (existing) {
    // User already joined; make sure secret exists/updates for hook-based validation.
    const existingSecret = await pb.collection(collections.secretWords)
      .getFirstListItem(`game = \"${gameId}\" && player = \"${userId}\"`)
      .catch(() => null);

    if (existingSecret) {
      await pb.collection(collections.secretWords).update(existingSecret.id, {
        secret_word: normalizedSecret
      });
    } else {
      await pb.collection(collections.secretWords).create({
        game: gameId,
        player: userId,
        secret_word: normalizedSecret
      });
    }
    return;
  }

  const usedSeats = new Set(players.map((player) => player.seat_index));
  let seat = 0;
  while (usedSeats.has(seat) && seat < 4) {
    seat += 1;
  }

  const dotCount = normalizedSecret.split('').filter((char) => char === '.').length;

  await pb.collection(collections.players).create({
    game: gameId,
    player: userId,
    seat_index: seat,
    score: 0,
    secret_word_hash: fakeHash(normalizedSecret),
    secret_length: normalizedSecret.length,
    dot_count: dotCount,
    revealed_mask: Array.from({ length: normalizedSecret.length }, () => false),
    is_word_revealed: false,
    misspelled: false
  });

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
    is_interruptive: false,
    success: false,
    points_delta: 0,
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
