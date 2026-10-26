import { Difficulty, GameStats, DEFAULT_STATS, ArenaId, ObjectiveId } from './types';

const STORAGE_KEYS = {
  highScores: 'snake3d.highscores',
  stats: 'snake3d.stats',
  challenges: 'snake3d.challenges',
  arenas: 'snake3d.arenasUnlocked',
  settings: 'snake3d.settings',
};

// Migrate old keys
function migrateOldKeys() {
  const difficulties: Difficulty[] = ['easy', 'normal', 'hard', 'insane'];
  const oldPrefix = 'snake3d-hs-';
  const newScores: Record<string, number> = {};
  
  difficulties.forEach(diff => {
    const oldVal = localStorage.getItem(oldPrefix + diff);
    if (oldVal) {
      newScores[diff] = parseInt(oldVal, 10) || 0;
      localStorage.removeItem(oldPrefix + diff);
    }
  });
  
  if (Object.keys(newScores).length > 0) {
    const existing = getHighScores();
    localStorage.setItem(STORAGE_KEYS.highScores, JSON.stringify({ ...existing, ...newScores }));
  }
}

// Run migration once
if (typeof window !== 'undefined') {
  try { migrateOldKeys(); } catch (error) { console.warn("Storage migration skipped:", error); }
}

// High scores per difficulty
export function getHighScores(): Record<Difficulty, number> {
  try {
    const val = localStorage.getItem(STORAGE_KEYS.highScores);
    if (val) return JSON.parse(val);
  } catch {}
  return { easy: 0, normal: 0, hard: 0, insane: 0 };
}

export function getHighScore(difficulty: Difficulty): number {
  return getHighScores()[difficulty] || 0;
}

export function setHighScore(difficulty: Difficulty, score: number): boolean {
  const scores = getHighScores();
  if (score > (scores[difficulty] || 0)) {
    scores[difficulty] = score;
    localStorage.setItem(STORAGE_KEYS.highScores, JSON.stringify(scores));
    return true;
  }
  return false;
}

// Game stats
export function getStats(): GameStats {
  try {
    const val = localStorage.getItem(STORAGE_KEYS.stats);
    if (val) return { ...DEFAULT_STATS, ...JSON.parse(val) };
  } catch {}
  return { ...DEFAULT_STATS };
}

export function updateStats(updates: Partial<GameStats>): GameStats {
  const current = getStats();
  const updated = { ...current, ...updates };
  localStorage.setItem(STORAGE_KEYS.stats, JSON.stringify(updated));
  return updated;
}

// Completed challenges
export function getCompletedChallenges(): ObjectiveId[] {
  try {
    const val = localStorage.getItem(STORAGE_KEYS.challenges);
    if (val) return JSON.parse(val);
  } catch {}
  return [];
}

export function completeChallenge(id: ObjectiveId): boolean {
  const completed = getCompletedChallenges();
  if (!completed.includes(id)) {
    completed.push(id);
    localStorage.setItem(STORAGE_KEYS.challenges, JSON.stringify(completed));
    return true;
  }
  return false;
}

// Unlocked arenas
export function getUnlockedArenas(): ArenaId[] {
  try {
    const val = localStorage.getItem(STORAGE_KEYS.arenas);
    if (val) return JSON.parse(val);
  } catch {}
  return ['arena1'];
}

export function unlockArena(id: ArenaId): boolean {
  const unlocked = getUnlockedArenas();
  if (!unlocked.includes(id)) {
    unlocked.push(id);
    localStorage.setItem(STORAGE_KEYS.arenas, JSON.stringify(unlocked));
    return true;
  }
  return false;
}

// Settings
export interface MinimapSettings {
  show: boolean;
  mode: 'rotating' | 'fixed';
  opacity: number;
  size: 'small' | 'medium' | 'large';
}

export interface GameSettings {
  mute: boolean;
  difficulty: Difficulty;
  arena: ArenaId;
  particleQuality: 'low' | 'medium' | 'high';
  snakeTheme: 'mint' | 'sunset' | 'galaxy';
  gemShape: 'star' | 'gem' | 'halo';
  viewMode: 'firstPerson' | 'chase' | 'shoulder' | 'topDown';
  minimap: MinimapSettings;
}

export function getSettings(): GameSettings {
  try {
    const val = localStorage.getItem(STORAGE_KEYS.settings);
    if (val) return { ...getDefaultSettings(), ...JSON.parse(val) };
  } catch {}
  return getDefaultSettings();
}

function getDefaultSettings(): GameSettings {
  return {
    mute: false,
    difficulty: 'normal',
    arena: 'arena1',
    particleQuality: 'high',
    snakeTheme: 'mint',
    gemShape: 'star',
    viewMode: 'firstPerson',
    minimap: {
      show: true,
      mode: 'rotating',
      opacity: 0.8,
      size: 'medium',
    },
  };
}

export function saveSettings(settings: Partial<GameSettings>): GameSettings {
  const current = getSettings();
  const updated = { ...current, ...settings };
  localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(updated));
  return updated;
}

export function getMinimapSettings(): MinimapSettings {
  const settings = getSettings();
  return settings.minimap;
}

export function saveMinimapSettings(minimap: Partial<MinimapSettings>): MinimapSettings {
  const settings = getSettings();
  const updated = { ...settings.minimap, ...minimap };
  settings.minimap = updated;
  localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(settings));
  return updated;
}
