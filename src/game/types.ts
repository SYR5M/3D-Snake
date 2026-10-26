export type Difficulty = 'easy' | 'normal' | 'hard' | 'insane';
export type GameState = 'menu' | 'playing' | 'paused' | 'gameover';
export type PowerUpType = 'shrink' | 'shield' | 'slowmo' | 'magnet';
export type FoodType = 'normal' | 'golden' | 'shrink' | 'shield' | 'slowmo' | 'magnet';
export type ArenaId = 'arena1' | 'arena2' | 'arena3';
export type ObjectiveId = string;
export type SnakeTheme = 'mint' | 'sunset' | 'galaxy';
export type GemShape = 'star' | 'gem' | 'halo';
export type ViewMode = 'firstPerson' | 'chase' | 'shoulder' | 'topDown';

export interface DifficultyConfig {
  speed: number;
  turnRate: number;
  foodCount: number;
  scoreMultiplier: number;
  arenaRadius: number;
  label: string;
  color: string;
  obstacleRate: number; // obstacles per minute
  tightTurnAssist: boolean;
}

export const DIFFICULTY_CONFIGS: Record<Difficulty, DifficultyConfig> = {
  easy: {
    speed: 6,
    turnRate: 1.8,
    foodCount: 3,
    scoreMultiplier: 1,
    arenaRadius: 35,
    label: 'Easy',
    color: '#4ade80',
    obstacleRate: 0.5,
    tightTurnAssist: true,
  },
  normal: {
    speed: 9,
    turnRate: 2.4,
    foodCount: 2,
    scoreMultiplier: 1.5,
    arenaRadius: 30,
    label: 'Normal',
    color: '#facc15',
    obstacleRate: 1,
    tightTurnAssist: true,
  },
  hard: {
    speed: 13,
    turnRate: 3.0,
    foodCount: 1,
    scoreMultiplier: 2,
    arenaRadius: 28,
    label: 'Hard',
    color: '#f97316',
    obstacleRate: 1.5,
    tightTurnAssist: false,
  },
  insane: {
    speed: 17,
    turnRate: 3.6,
    foodCount: 1,
    scoreMultiplier: 3,
    arenaRadius: 22,
    label: 'Insane',
    color: '#ef4444',
    obstacleRate: 2,
    tightTurnAssist: false,
  },
};

export interface PowerUpState {
  type: PowerUpType;
  remaining: number; // seconds
}

export interface Objective {
  id: ObjectiveId;
  title: string;
  description: string;
  target: number;
  reward: number;
  check: (stats: RunStats) => boolean;
  progress: (stats: RunStats) => number;
}

export interface RunStats {
  foodsEaten: number;
  goldenEaten: number;
  maxLength: number;
  maxCombo: number;
  survivalTime: number;
  powerUpsUsed: number;
}

export const OBJECTIVES: Objective[] = [
  {
    id: 'eat10',
    title: 'Hungry Snake',
    description: 'Eat 10 foods in one run',
    target: 10,
    reward: 500,
    check: (s) => s.foodsEaten >= 10,
    progress: (s) => Math.min(s.foodsEaten, 10),
  },
  {
    id: 'length25',
    title: 'Long Boi',
    description: 'Reach length 25',
    target: 25,
    reward: 750,
    check: (s) => s.maxLength >= 25,
    progress: (s) => Math.min(s.maxLength, 25),
  },
  {
    id: 'golden3',
    title: 'Gold Rush',
    description: 'Collect 3 golden orbs',
    target: 3,
    reward: 1000,
    check: (s) => s.goldenEaten >= 3,
    progress: (s) => Math.min(s.goldenEaten, 3),
  },
  {
    id: 'survive120',
    title: 'Marathon',
    description: 'Survive 2 minutes',
    target: 120,
    reward: 600,
    check: (s) => s.survivalTime >= 120,
    progress: (s) => Math.min(s.survivalTime, 120),
  },
  {
    id: 'combo3',
    title: 'Combo Master',
    description: 'Get a ×3 combo',
    target: 3,
    reward: 800,
    check: (s) => s.maxCombo >= 3,
    progress: (s) => Math.min(s.maxCombo, 3),
  },
  {
    id: 'length50',
    title: 'Serpent King',
    description: 'Reach length 50',
    target: 50,
    reward: 2000,
    check: (s) => s.maxLength >= 50,
    progress: (s) => Math.min(s.maxLength, 50),
  },
  {
    id: 'eat25',
    title: 'Feast Mode',
    description: 'Eat 25 foods in one run',
    target: 25,
    reward: 1200,
    check: (s) => s.foodsEaten >= 25,
    progress: (s) => Math.min(s.foodsEaten, 25),
  },
  {
    id: 'survive300',
    title: 'Endurance',
    description: 'Survive 5 minutes',
    target: 300,
    reward: 1500,
    check: (s) => s.survivalTime >= 300,
    progress: (s) => Math.min(s.survivalTime, 300),
  },
];

export interface ArenaConfig {
  id: ArenaId;
  name: string;
  unlockScore: number;
  description: string;
}

export const ARENAS: ArenaConfig[] = [
  { id: 'arena1', name: 'Neon Circle', unlockScore: 0, description: 'Classic circular arena' },
  { id: 'arena2', name: 'Crystal Square', unlockScore: 5000, description: 'Rounded square with central pillar' },
  { id: 'arena3', name: 'Quadrant Ring', unlockScore: 15000, description: 'Large arena with 4 pillars' },
];

export interface GameStats {
  totalFoods: number;
  longestSnake: number;
  bestCombo: number;
  totalRuns: number;
  totalTimePlayed: number;
  totalScore: number;
}

export const DEFAULT_STATS: GameStats = {
  totalFoods: 0,
  longestSnake: 0,
  bestCombo: 0,
  totalRuns: 0,
  totalTimePlayed: 0,
  totalScore: 0,
};
