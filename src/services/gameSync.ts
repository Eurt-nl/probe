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

export interface LobbyGameSummary {
  id: string;
  ownerId: string;
  ownerName: string;
  participantCount: number;
  maxPlayers: number;
  status: 'lobby' | 'active' | 'finished';
  hasJoined: boolean;
  canJoin: boolean;
}

export interface ActiveGameLink {
  gameId: string;
  ownerName: string;
  participantCount: number;
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

function hiddenCountFromMask(mask: unknown, fallbackLength: number): number {
  if (Array.isArray(mask)) {
    return mask.filter((item) => item === false).length;
  }
  return fallbackLength;
}

export async function createRemoteGame(
  ownerUserId: string,
  mode: RemoteGame['rule_mode'] = 'classic'
): Promise<RemoteGame> {
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

export async function listLobbyGames(currentUserId: string): Promise<LobbyGameSummary[]> {
  const games = await pb.collection(collections.games).getFullList({
    filter: 'status = "lobby"',
    expand: 'owner',
    sort: '-created'
  });

  const summaries = await Promise.all(
    games.map(async (game) => {
      const players = await listRemotePlayers(game.id).catch(() => []);
      const participantCount = players.length;
      const hasJoined = players.some((player) => player.player === currentUserId);
      const maxPlayers = Number(game.max_players ?? 4);

      return {
        id: game.id,
        ownerId: String(game.owner ?? ''),
        ownerName: String(game.expand?.owner?.display_name ?? game.expand?.owner?.name ?? game.owner ?? ''),
        participantCount,
        maxPlayers,
        status: String(game.status) as LobbyGameSummary['status'],
        hasJoined,
        canJoin: !hasJoined && participantCount < maxPlayers
      };
    })
  );

  return summaries;
}

export async function listActiveGameLinks(currentUserId: string): Promise<ActiveGameLink[]> {
  const memberships = await pb.collection(collections.players).getFullList({
    filter: pb.filter('player = {:userId}', { userId: currentUserId }),
    expand: 'game,game.owner',
    sort: '-created'
  });

  const activeMemberships = memberships.filter((membership) => membership.expand?.game?.status === 'active');
  const dedup = new Map<string, ActiveGameLink>();

  for (const membership of activeMemberships) {
    const game = membership.expand?.game;
    if (!game?.id) continue;
    if (dedup.has(game.id)) continue;

    const players = await listRemotePlayers(game.id).catch(() => []);
    dedup.set(game.id, {
      gameId: game.id,
      ownerName: String(game.expand?.owner?.display_name ?? game.expand?.owner?.name ?? game.owner ?? ''),
      participantCount: players.length
    });
  }

  return Array.from(dedup.values());
}

export async function joinRemoteGame(gameId: string, userId: string, secret: string): Promise<void> {
  const normalizedSecret = normalizeSecret(secret);
  if (!normalizedSecret.length) {
    throw new Error('Geheim woord is leeg of ongeldig');
  }

  const game = await getRemoteGame(gameId);
  if (game.status !== 'lobby') {
    throw new Error('Dit spel is al gestart; deelnemen is gesloten');
  }

  const existingPlayers = await listRemotePlayers(gameId).catch(() => []);
  if (!existingPlayers.some((player) => player.player === userId) && existingPlayers.length >= 4) {
    throw new Error('Dit spel heeft al het maximum van 4 spelers bereikt');
  }

  const dotCount = normalizedSecret.split('').filter((char) => char === '.').length;
  const ownPlayerRecord = await pb
    .collection(collections.players)
    .getFirstListItem(`game = \"${gameId}\" && player = \"${userId}\"`)
    .catch(() => null);

  if (!ownPlayerRecord) {
    let created = false;
    const usedSeats = new Set(existingPlayers.map((player) => player.seat_index));
    for (let seat = 0; seat < 4; seat += 1) {
      if (usedSeats.has(seat)) continue;
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
        throw new Error(`Player create failed: ${pbErrorString(error)}`);
      }
    }

    if (!created) {
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
