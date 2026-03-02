import { defineStore } from 'pinia';
import type { ActivityCard, GuessEvent, PlayerState, ProbeGameState } from '@/types/game';

function slotPoints(index: number): 5 | 10 | 15 {
  // Front/back slots are 5 points, mid slots are 10/15 to mimic physical board pressure.
  if (index <= 1 || index >= 10) return 5;
  if (index <= 3 || index >= 8) return 10;
  return 15;
}

function buildSlots(secretInput: string): PlayerState['slots'] {
  return secretInput
    .toUpperCase()
    .split('')
    .slice(0, 12)
    .map((char, index) => ({
      index,
      char,
      isDot: char === '.',
      revealed: false,
      points: slotPoints(index)
    }));
}

function toGuessEvent(partial: Omit<GuessEvent, 'id' | 'createdAt'>): GuessEvent {
  return {
    ...partial,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString()
  };
}

export const useGameStore = defineStore('game', {
  state: () => ({
    game: null as ProbeGameState | null,
    guessLog: [] as GuessEvent[]
  }),
  getters: {
    activePlayer(state): PlayerState | null {
      if (!state.game) return null;
      return state.game.players.find((player: PlayerState) => player.id === state.game?.turnPlayerId) ?? null;
    }
  },
  actions: {
    createGame(ownerName: string, ownSecret: string): ProbeGameState {
      const ownerId = crypto.randomUUID();

      this.game = {
        id: crypto.randomUUID(),
        status: 'lobby',
        ownerPlayerId: ownerId,
        turnPlayerId: ownerId,
        players: [
          {
            id: ownerId,
            name: ownerName,
            score: 0,
            eliminated: false,
            slots: buildSlots(ownSecret)
          }
        ],
        activityDiscard: [],
        turnMultiplier: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      this.guessLog = [];
      return this.game;
    },
    addPlayer(name: string, secret: string): void {
      if (!this.game || this.game.status !== 'lobby') return;

      this.game.players.push({
        id: crypto.randomUUID(),
        name,
        score: 0,
        eliminated: false,
        slots: buildSlots(secret)
      });
      this.game.updatedAt = new Date().toISOString();
    },
    startGame(): void {
      if (!this.game || this.game.players.length < 2) return;
      this.game.status = 'active';
      this.game.updatedAt = new Date().toISOString();
    },
    applyGuess(actorPlayerId: string, targetPlayerId: string, guess: string): boolean {
      if (!this.game) return false;
      const game = this.game as ProbeGameState;

      const target = game.players.find((p: PlayerState) => p.id === targetPlayerId);
      const actor = game.players.find((p: PlayerState) => p.id === actorPlayerId);
      if (!target || !actor) return false;

      const normalizedGuess = guess.toUpperCase();
      const matchingSlot = target.slots.find((slot: PlayerState['slots'][number]) => slot.char === normalizedGuess && !slot.revealed);
      if (!matchingSlot) {
        const dotPenalty = normalizedGuess === '.' ? -50 : 0;
        actor.score += dotPenalty;

        this.guessLog.unshift(
          toGuessEvent({
            actorPlayerId,
            targetPlayerId,
            guess: normalizedGuess,
            success: false,
            pointsDelta: dotPenalty,
            note: dotPenalty < 0 ? 'Dot penalty applied' : 'Missed guess'
          })
        );

        this.endTurn(actorPlayerId);
        return false;
      }

      matchingSlot.revealed = true;
      let pointsEarned = matchingSlot.points * game.turnMultiplier;

      const hiddenCount = target.slots.filter((slot: PlayerState['slots'][number]) => !slot.revealed).length;
      if (hiddenCount === 0) {
        pointsEarned += 50;
      }

      actor.score += pointsEarned;
      game.turnMultiplier = 1;

      this.guessLog.unshift(
        toGuessEvent({
          actorPlayerId,
          targetPlayerId,
          guess: normalizedGuess,
          success: true,
          pointsDelta: pointsEarned,
          note: hiddenCount === 0 ? 'Word completed +50 bonus' : 'Correct guess'
        })
      );

      return true;
    },
    setTurnMultiplier(multiplier: number): void {
      if (!this.game) return;
      this.game.turnMultiplier = Math.max(multiplier, 1);
    },
    applyScoreAdjustment(playerId: string, delta: number, reason: string): void {
      if (!this.game) return;
      const game = this.game as ProbeGameState;
      const player = game.players.find((entry: PlayerState) => entry.id === playerId);
      if (!player) return;

      player.score += delta;
      this.guessLog.unshift(
        toGuessEvent({
          actorPlayerId: playerId,
          targetPlayerId: playerId,
          guess: '-',
          success: delta >= 0,
          pointsDelta: delta,
          note: reason
        })
      );
    },
    interruptiveGuess(actorPlayerId: string, targetPlayerId: string, proposedWord: string): boolean {
      if (!this.game) return false;
      const game = this.game as ProbeGameState;
      const actor = game.players.find((entry: PlayerState) => entry.id === actorPlayerId);
      const target = game.players.find((entry: PlayerState) => entry.id === targetPlayerId);
      if (!actor || !target) return false;

      const hiddenCount = target.slots.filter((slot: PlayerState['slots'][number]) => !slot.revealed).length;
      if (hiddenCount < 5) {
        return false;
      }

      const actualWord = target.slots.map((slot: PlayerState['slots'][number]) => slot.char).join('');
      const normalizedWord = proposedWord.toUpperCase();
      if (normalizedWord === actualWord) {
        let revealPoints = 0;
        target.slots.forEach((slot: PlayerState['slots'][number]) => {
          if (!slot.revealed) {
            revealPoints += slot.points;
            slot.revealed = true;
          }
        });
        actor.score += revealPoints + 100;
        return true;
      }

      actor.score -= 50;
      return false;
    },
    endTurn(currentPlayerId: string): void {
      if (!this.game) return;
      const game = this.game as ProbeGameState;
      const playerIndex = game.players.findIndex((player: PlayerState) => player.id === currentPlayerId);
      if (playerIndex < 0) return;
      const nextIndex = (playerIndex + 1) % game.players.length;
      game.turnPlayerId = game.players[nextIndex].id;
      game.turnMultiplier = 1;
      game.updatedAt = new Date().toISOString();
    }
  }
});
