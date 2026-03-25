export interface Point {
  x: number;
  y: number;
}

export interface Enemy {
  id: string;
  x: number;
  y: number;
  pathIndex: number;
  health: number;
  maxHealth: number;
  speed: number;
  type: 'basic' | 'fast' | 'tank' | 'shield' | 'jammer' | 'sprayer' | 'titan';
  reward: number;
  isBoss?: boolean;
}

export interface Tower {
  id: string;
  x: number;
  y: number;
  type: 'root' | 'stem' | 'leaf' | 'flower';
  level: number;
  range: number;
  damage: number;
  fireRate: number;
  lastFired: number;
  cost: number;
  upgradeCost: number;
  disabledUntil?: number; // For jammer/sprayer abilities
}

export interface Projectile {
  id: string;
  x: number;
  y: number;
  targetId: string;
  damage: number;
  speed: number;
}

export interface Quiz {
  id: number;
  question: string;
  options: string[];
  answer: number;
  explanation: string;
}

export interface GameState {
  coins: number;
  health: number;
  wave: number;
  isGameOver: boolean;
  isPaused: boolean;
  score: number;
  resetTrigger?: number;
  gameSpeed: 1 | 2 | 4;
}
