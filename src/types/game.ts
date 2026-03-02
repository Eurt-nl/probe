export type ActivityCardType =
  | 'NORMAL_TURN'
  | 'ADDITIONAL_TURN'
  | 'LEFT_EXPOSES'
  | 'RIGHT_EXPOSES'
  | 'EXPOSE_OWN_DOT'
  | 'MULTIPLY_FIRST_GUESS'
  | 'ADD_SCORE'
  | 'DEDUCT_SCORE';

export interface ActivityCard {
  id: string;
  type: ActivityCardType;
  value?: number;
  label: string;
}

export interface LetterSlot {
  index: number;
  char: string;
  isDot: boolean;
  revealed: boolean;
  points: 5 | 10 | 15;
}

export interface PlayerState {
  id: string;
  name: string;
  score: number;
  slots: LetterSlot[];
  eliminated: boolean;
}

export interface GuessEvent {
  id: string;
  actorPlayerId: string;
  targetPlayerId: string;
  guess: string;
  success: boolean;
  pointsDelta: number;
  createdAt: string;
  note?: string;
}

export interface ProbeGameState {
  id: string;
  status: 'lobby' | 'active' | 'finished';
  ownerPlayerId: string;
  turnPlayerId: string;
  players: PlayerState[];
  activityDiscard: ActivityCard[];
  turnMultiplier: number;
  createdAt: string;
  updatedAt: string;
}
