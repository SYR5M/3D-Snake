// Pure, engine-independent game rules.
// These helpers are the single source of truth for collision/spawn math so that
// they can be unit-tested without a WebGL context and reused by the Engine.
import { Difficulty, DIFFICULTY_CONFIGS, FoodType } from './types';

export const HEAD_RADIUS = 0.3;
export const SEGMENT_RADIUS = 0.2;
export const COLLISION_SAFETY_MARGIN = 1.15;
export const FOOD_COLLECT_RADIUS = 0.8;
export const WALL_COLLISION_MARGIN = 0.5;
export const FOOD_SPAWN_CLEARANCE = 2;
export const FOOD_MIN_SPACING = 1.6;
export const OBSTACLE_FOOD_CLEARANCE = 1;
export const SNAKE_SPAWN_CLEARANCE = 2;

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Playable radius for a difficulty (physics, world rendering and minimap must agree). */
export function getArenaRadius(difficulty: Difficulty): number {
  return DIFFICULTY_CONFIGS[difficulty].arenaRadius;
}

/** Head-vs-wall test: deadly when the head reaches within margin of the arena rim. */
export function isWallCollision(x: number, z: number, arenaRadius: number, margin = WALL_COLLISION_MARGIN): boolean {
  return Math.hypot(x, z) > arenaRadius - margin;
}

/** Distance from a point to a line segment (XZ-plane swept collision helper). */
export function distancePointToSegment(
  px: number, pz: number,
  ax: number, az: number,
  bx: number, bz: number,
): number {
  const dx = bx - ax;
  const dz = bz - az;
  const lenSq = dx * dx + dz * dz;
  if (lenSq === 0) return Math.hypot(px - ax, pz - az);
  let t = ((px - ax) * dx + (pz - az) * dz) / lenSq;
  t = clamp(t, 0, 1);
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

/** Swept self-collision: did the head path (prev -> current) touch a body segment? */
export function isSelfCollisionSwept(
  prevX: number, prevZ: number,
  headX: number, headZ: number,
  segX: number, segZ: number,
  safetyMargin = COLLISION_SAFETY_MARGIN,
): boolean {
  const collisionRadius = (HEAD_RADIUS + SEGMENT_RADIUS) * safetyMargin;
  return distancePointToSegment(segX, segZ, prevX, prevZ, headX, headZ) < collisionRadius;
}

/** Obstacle collision (head vs obstacle center). */
export function isObstacleCollision(headX: number, headZ: number, obsX: number, obsZ: number, obsRadius: number): boolean {
  return Math.hypot(headX - obsX, headZ - obsZ) < HEAD_RADIUS + obsRadius;
}

/** Head is close enough to a reward to collect it. */
export function isFoodCollected(headX: number, headZ: number, foodX: number, foodZ: number, radius = FOOD_COLLECT_RADIUS): boolean {
  return Math.hypot(headX - foodX, headZ - foodZ) < radius;
}

export interface SpawnCandidate { x: number; z: number }

/**
 * Validate a candidate food spawn position:
 * inside the playable area (with clearance), away from the snake, other rewards and obstacles.
 */
export function isValidFoodSpawn(
  x: number, z: number,
  arenaRadius: number,
  occupied: SpawnCandidate[],
  existingFoods: SpawnCandidate[],
  obstacles: Array<SpawnCandidate & { radius: number }>,
): boolean {
  // Must be strictly inside the playable disc.
  if (Math.hypot(x, z) > arenaRadius - 3) return false;
  if (occupied.some(p => Math.hypot(p.x - x, p.z - z) < SNAKE_SPAWN_CLEARANCE)) return false;
  if (existingFoods.some(p => Math.hypot(p.x - x, p.z - z) < FOOD_MIN_SPACING)) return false;
  if (obstacles.some(o => Math.hypot(o.x - x, o.z - z) < o.radius + OBSTACLE_FOOD_CLEARANCE)) return false;
  return true;
}

/** Uniform random point inside a disc of the given radius. */
export function randomPointInDisc(rng: () => number, radius: number): SpawnCandidate {
  const angle = rng() * Math.PI * 2;
  const dist = Math.sqrt(rng()) * Math.max(1, radius - 3);
  return { x: Math.cos(angle) * dist, z: Math.sin(angle) * dist };
}

export interface FoodRoll { type: FoodType; value: number; lifetime: number }

/** Deterministic reward-type roll (injectable RNG for testing). */
export function rollFoodType(rng: () => number): FoodRoll {
  const rand = rng();
  if (rand < 0.08) return { type: 'golden', value: 50, lifetime: 12 };
  if (rand < 0.10) return { type: 'shrink', value: 5, lifetime: -1 };
  if (rand < 0.15) return { type: 'shield', value: 10, lifetime: -1 };
  if (rand < 0.20) return { type: 'slowmo', value: 10, lifetime: -1 };
  if (rand < 0.25) return { type: 'magnet', value: 10, lifetime: -1 };
  return { type: 'normal', value: 10, lifetime: -1 };
}

/** Speed ramp from snake length (capped at +60%). */
export function computeSpeedRamp(activeSegments: number): number {
  return Math.min(0.6, (activeSegments / 3) * 0.02);
}

export const COMBO_WINDOW = 3;
export const COMBO_MULTIPLIERS = [1, 1.5, 2, 2.5, 3];

export function comboMultiplier(comboCount: number): number {
  return COMBO_MULTIPLIERS[Math.min(comboCount, COMBO_MULTIPLIERS.length - 1)];
}

/** Points awarded for eating a food of base value with difficulty multiplier and combo. */
export function computeEatPoints(baseValue: number, difficulty: Difficulty, comboCount: number): number {
  return Math.round(baseValue * DIFFICULTY_CONFIGS[difficulty].scoreMultiplier * comboMultiplier(comboCount));
}
