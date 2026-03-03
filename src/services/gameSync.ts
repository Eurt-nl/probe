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
  revealed_mask: Array<string | null>;
}

export interface RemoteGuess {
  id: string;
  actor: string;
  target_player: string;
  turn_index?: number;
  guess_at?: string;
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
  ownerId: string;
  ownerName: string;
  participantCount: number;
  status: 'lobby' | 'active' | 'finished';
}

function fakeHash(secret: string): string {
  // Placeholder hash so schema constraints are met; authoritative validation happens in backend hooks.
  return btoa(unescape(encodeURIComponent(secret))).padEnd(16, 'x').slice(0, 64);
}

function normalizeSecret(secret: string): string {
  const cleaned = secret.trim().toUpperCase();
  if (!cleaned.length) {
    throw new Error('Vul een geheim woord in van 8 t/m 12 letters');
  }
  if (!/^[A-Z.]+$/.test(cleaned)) {
    throw new Error('Gebruik alleen letters (A-Z) en optioneel stippen (.)');
  }
  if (!/^\.*[A-Z]+\.*$/.test(cleaned)) {
    throw new Error('Stippen mogen alleen voor of na het woord staan');
  }

  const letterCount = cleaned.replace(/\./g, '').length;
  if (letterCount < 8) {
    throw new Error('Geheim woord te kort: minimaal 8 letters');
  }
  if (letterCount > 12) {
    throw new Error('Geheim woord te lang: maximaal 12 letters');
  }

  const dotCount = cleaned.length - letterCount;
  if (dotCount > 4) {
    throw new Error('Je mag maximaal 4 stippen gebruiken');
  }
  if (cleaned.length > 12) {
    throw new Error('Totaal (letters + stippen) mag maximaal 12 tekens zijn');
  }

  // Probe gebruikt altijd 12 posities; ontbrekende posities vullen we met dots op.
  const missing = 12 - cleaned.length;
  if (dotCount + missing > 4) {
    throw new Error('Met dit woord zou je meer dan 4 stippen nodig hebben');
  }
  return `${cleaned}${'.'.repeat(missing)}`;
}

function pbErrorString(error: unknown): string {
  const anyError = error as {
    response?: { message?: string; data?: Record<string, unknown> };
    message?: string;
  };
  const details = anyError?.response?.data ? ` ${JSON.stringify(anyError.response.data)}` : '';
  return `${anyError?.response?.message ?? anyError?.message ?? String(error)}${details}`;
}

function hiddenCountFromMask(mask: unknown, fallbackLength: number): number {
  if (Array.isArray(mask)) {
    return mask.filter((item) => item === false || item === null || item === '').length;
  }
  return fallbackLength;
}

function normalizeRevealedMask(mask: unknown, fallbackLength: number): Array<string | null> {
  if (!Array.isArray(mask)) {
    return Array.from({ length: fallbackLength }, () => null);
  }

  return mask.map((item) => {
    if (typeof item === 'string' && item.length > 0) return item[0].toUpperCase();
    return null;
  });
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
    requestKey: null,
    filter: pb.filter('game = {:gameId}', { gameId }),
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
    display_name: String(record.expand?.player?.display_name ?? record.expand?.player?.name ?? record.player),
    revealed_mask: normalizeRevealedMask(record.revealed_mask, Number(record.secret_length ?? 0))
  }));
}

export async function listLobbyGames(currentUserId: string): Promise<LobbyGameSummary[]> {
  const games = await pb.collection(collections.games).getFullList({
    requestKey: null,
    filter: pb.filter('status = {:status}', { status: 'lobby' }),
    expand: 'owner',
    sort: '-id'
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
    requestKey: null,
    filter: pb.filter('player = {:userId}', { userId: currentUserId }),
    expand: 'game,game.owner',
    sort: '-id'
  });

  // Show all joined games that are still relevant in lobby/home context.
  const activeMemberships = memberships.filter((membership) => {
    const status = String(membership.expand?.game?.status ?? '');
    return status === 'lobby' || status === 'active';
  });
  const dedup = new Map<string, ActiveGameLink>();

  for (const membership of activeMemberships) {
    const game = membership.expand?.game;
    if (!game?.id) continue;
    if (dedup.has(game.id)) continue;

    const players = await listRemotePlayers(game.id).catch(() => []);
    dedup.set(game.id, {
      gameId: game.id,
      ownerId: String(game.owner ?? ''),
      ownerName: String(game.expand?.owner?.display_name ?? game.expand?.owner?.name ?? game.owner ?? ''),
      participantCount: players.length,
      status: String(game.status ?? 'lobby') as ActiveGameLink['status']
    });
  }

  return Array.from(dedup.values());
}

export async function deleteLobbyGame(gameId: string): Promise<void> {
  const game = await getRemoteGame(gameId);
  if (game.status !== 'lobby') {
    throw new Error('Alleen lobby-spellen kunnen verwijderd worden');
  }
  await pb.collection(collections.games).delete(gameId);
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
    .getFirstListItem(pb.filter('game = {:gameId} && player = {:userId}', { gameId, userId }))
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
          revealed_mask: JSON.stringify(Array.from({ length: normalizedSecret.length }, () => null)),
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
      revealed_mask: JSON.stringify(Array.from({ length: normalizedSecret.length }, () => null)),
      is_word_revealed: 'false',
      misspelled: 'false'
    });
  }

  const existingSecret = await pb.collection(collections.secretWords)
    .getFirstListItem(pb.filter('game = {:gameId} && player = {:userId}', { gameId, userId }))
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
  const authUserId = String((pb.authStore.model as { id?: string } | null)?.id ?? '');
  if (!authUserId) {
    throw new Error('Niet ingelogd');
  }
  if (authUserId !== String(payload.actor)) {
    throw new Error('Sessie mismatch; herlaad de app en log opnieuw in');
  }

  const latestGame = await getRemoteGame(remoteGameId);
  if (latestGame.status !== 'active') {
    throw new Error('Spel is nog niet actief');
  }
  if (String(latestGame.turn_player) !== String(payload.actor)) {
    throw new Error('Je bent niet aan de beurt');
  }

  try {
    await pb.collection(collections.guesses).create({
      game: remoteGameId,
      actor: payload.actor,
      target_player: payload.target_player,
      guess_char: payload.guess_char.toUpperCase()[0],
      is_interruptive: 'false'
    });
  } catch (error) {
    throw new Error(`Gok opslaan mislukt: ${pbErrorString(error)}`);
  }
}

export async function listRemoteGuesses(gameId: string): Promise<RemoteGuess[]> {
  const records = await pb.collection(collections.guesses).getFullList({
    requestKey: null,
    filter: pb.filter('game = {:gameId}', { gameId }),
    sort: '-guess_at,-id'
  });

  return records.map((record) => ({
    id: record.id,
    actor: String(record.actor),
    target_player: String(record.target_player),
    turn_index: record.turn_index !== undefined && record.turn_index !== null
      ? Number(record.turn_index)
      : undefined,
    guess_at: record.guess_at ? String(record.guess_at) : undefined,
    guess_char: record.guess_char ? String(record.guess_char) : undefined,
    guess_word: record.guess_word ? String(record.guess_word) : undefined,
    is_interruptive: Boolean(record.is_interruptive),
    success: Boolean(record.success),
    points_delta: Number(record.points_delta ?? 0),
    reason: record.reason ? String(record.reason) : undefined,
    created: record.created ? String(record.created) : ''
  }));
}

export async function subscribeRemoteGame(gameId: string, onChange: () => void): Promise<() => void> {
  const unsubs: Array<() => void> = [];

  await pb.collection(collections.games).subscribe(gameId, onChange);
  unsubs.push(() => pb.collection(collections.games).unsubscribe(gameId));

  await pb.collection(collections.players).subscribe('*', onChange, {
    filter: pb.filter('game = {:gameId}', { gameId })
  });
  unsubs.push(() => pb.collection(collections.players).unsubscribe('*'));

  await pb.collection(collections.guesses).subscribe('*', onChange, {
    filter: pb.filter('game = {:gameId}', { gameId })
  });
  unsubs.push(() => pb.collection(collections.guesses).unsubscribe('*'));

  return () => {
    unsubs.forEach((unsubscribe) => unsubscribe());
  };
}
