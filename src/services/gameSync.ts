import { pb, collections } from '@/services/pocketbase';
import type { ProbeGameState } from '@/types/game';

// Minimal PocketBase sync service: keep local game state and backend records aligned.
export async function createRemoteGame(game: ProbeGameState): Promise<string> {
  const created = await pb.collection(collections.games).create({
    status: game.status,
    owner: game.ownerPlayerId,
    turn_player: game.turnPlayerId,
    max_players: 4,
    rule_mode: 'classic'
  });

  return created.id;
}

export async function updateRemoteTurn(gameId: string, turnPlayerId: string): Promise<void> {
  await pb.collection(collections.games).update(gameId, {
    turn_player: turnPlayerId
  });
}

export async function appendGuess(remoteGameId: string, payload: {
  actor: string;
  target_player: string;
  guess_char?: string;
  guess_word?: string;
  is_interruptive: boolean;
  success: boolean;
  points_delta: number;
  reason?: string;
}): Promise<void> {
  await pb.collection(collections.guesses).create({
    game: remoteGameId,
    ...payload
  });
}

export async function subscribeToGame(remoteGameId: string, onChange: () => void): Promise<() => void> {
  await pb.collection(collections.games).subscribe(remoteGameId, () => {
    onChange();
  });

  return () => {
    pb.collection(collections.games).unsubscribe(remoteGameId);
  };
}
