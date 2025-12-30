
export type Team = 'p1' | 'p2';
export type PlayerRole = 'gk' | 'fwd' | 'def' | 'mid';
export type NetworkRole = 'host' | 'client' | 'local';

export interface Point {
  x: number;
  y: number;
}

export interface Player {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  team: Team;
  color: string;
  role: PlayerRole;
  target: Point | null;
  immune: number;
  kickCooldown: number;
}

export interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  lastTeam: Team;
}

export interface MoveCache {
  vx: number;
  vy: number;
  playerID: number;
  timestamp: number;
}

export interface GameState {
  players: Player[];
  ball: Ball;
  score: { p1: number; p2: number };
  timeRemaining: number;
  gameRunning: boolean;
  isPaused: boolean;
  isGoal: boolean;
  isOut: boolean;
  turnToKick: Team | null;
  kickTimer: number;
  ballOwner: Player | null;
  moveCache: { p1: MoveCache | null; p2: MoveCache | null };
}

// Mensajes de red
export type NetworkMessage = 
  | { type: 'STATE_UPDATE'; state: GameState }
  | { type: 'INPUT_ACTION'; patch: Partial<GameState> }
  | { type: 'START_GAME' };
