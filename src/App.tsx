import { useState, useEffect, useRef, useCallback } from 'react';
import { SnakeGameEngine } from './game/Engine';
import { Difficulty, GameState, DIFFICULTY_CONFIGS, PowerUpType, Objective, RunStats, ArenaId, ARENAS, OBJECTIVES, GameStats, SnakeTheme, GemShape, ViewMode } from './game/types';
import { getHighScore, getStats, getCompletedChallenges, getUnlockedArenas, getSettings, saveSettings } from './game/Storage';
import * as Audio from './game/Audio';

function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<SnakeGameEngine | null>(null);

  const [gameState, setGameState] = useState<GameState>('menu');
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [score, setScore] = useState(0);
  const [highScore, setHighScoreState] = useState(0);
  const [difficulty, setDifficulty] = useState<Difficulty>(() => getSettings().difficulty);
  const [arena, setArena] = useState<ArenaId>(() => getSettings().arena);
  const [snakeLength, setSnakeLength] = useState(5);
  const [isNewRecord, setIsNewRecord] = useState(false);
  const [stamina, setStamina] = useState(100);
  const [showHelp, setShowHelp] = useState(false);
  const [showChallenges, setShowChallenges] = useState(false);
  const [vignetteOpacity, setVignetteOpacity] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const [scorePopup, setScorePopup] = useState<{ points: number; combo: number; id: number } | null>(null);
  const [combo, setCombo] = useState(0);
  const [comboMultiplier, setComboMultiplier] = useState(1);
  const [comboTimer, setComboTimer] = useState(0);
  const [activePowerUp, setActivePowerUp] = useState<{ type: PowerUpType; remaining: number } | null>(null);
  const [currentObjective, setCurrentObjective] = useState<Objective | null>(null);
  const [objectiveProgress, setObjectiveProgress] = useState(0);
  const [objectiveComplete, setObjectiveComplete] = useState(false);
  const [runStats, setRunStats] = useState<RunStats | null>(null);
  const [speedRamp, setSpeedRamp] = useState(0);
  const [gameStats, setGameStats] = useState<GameStats>(getStats());
  const [completedChallenges, setCompletedChallenges] = useState<string[]>(getCompletedChallenges());
  const [unlockedArenas, setUnlockedArenas] = useState<ArenaId[]>(getUnlockedArenas());
  const [deathCause, setDeathCause] = useState<string>('');
  const [muted, setMuted] = useState(() => getSettings().mute);
  const [snakeTheme, setSnakeTheme] = useState<SnakeTheme>(() => getSettings().snakeTheme);
  const [gemShape, setGemShape] = useState<GemShape>(() => getSettings().gemShape);
  const [viewMode, setViewMode] = useState<ViewMode>(() => getSettings().viewMode);
  const [viewToast, setViewToast] = useState<string | null>(null);
  const popupIdRef = useRef(0);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768 || 'ontouchstart' in window);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;

    let engine: SnakeGameEngine;
    try {
    engine = new SnakeGameEngine(containerRef.current, {
      onScoreChange: (s) => setScore(s),
      onHighScoreChange: (hs) => setHighScoreState(hs),
      onStateChange: (state) => {
        setGameState(state);
        if (state === 'gameover') setRunStats(engine.getRunStats());
      },
      onLengthChange: (len) => setSnakeLength(len),
      onNewRecord: () => setIsNewRecord(true),
      onEat: (points, isGolden, comboCount) => {
        popupIdRef.current += 1;
        setScorePopup({ points, combo: comboCount, id: popupIdRef.current });
        setTimeout(() => setScorePopup(null), 1000);
      },
      onComboChange: (c, m) => { setCombo(c); setComboMultiplier(m); },
      onPowerUp: (type, remaining) => {
        setActivePowerUp(type ? { type, remaining } : null);
      },
      onObjectiveProgress: (obj, progress) => {
        setCurrentObjective(obj);
        setObjectiveProgress(progress);
      },
      onObjectiveComplete: () => {
        setObjectiveComplete(true);
        setCompletedChallenges(getCompletedChallenges());
        setTimeout(() => setObjectiveComplete(false), 3000);
      },
      onNearMiss: () => {},
      onDeath: (cause) => setDeathCause(cause),
      onSpeedRamp: (ramp) => setSpeedRamp(ramp),
      onViewChange: (view) => setViewMode(view),
    });

    } catch (error) {
      console.error("Could not start 3D engine:", error);
      setFatalError(error instanceof Error ? error.message : String(error));
      return;
    }

    engine.setDifficulty(difficulty);
    engine.setArena(arena);
    engine.setSnakeTheme(snakeTheme);
    engine.setGemShape(gemShape);
    setHighScoreState(getHighScore(difficulty));
    engineRef.current = engine;

    return () => { engine.destroy(); engineRef.current = null; };
  }, [retryKey]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (engineRef.current && gameState === 'playing') {
        setStamina(engineRef.current.getStamina());
        setVignetteOpacity(engineRef.current.getVignetteFlash() * 0.4);
        setComboTimer(engineRef.current.getComboTimer());
      }
    }, 50);
    return () => clearInterval(interval);
  }, [gameState]);

  const handleStart = useCallback(() => {
    Audio.initAudio();
    Audio.playClick();
    setIsNewRecord(false);
    setObjectiveComplete(false);
    setDeathCause('');
    engineRef.current?.setDifficulty(difficulty);
    engineRef.current?.setArena(arena);
    saveSettings({ difficulty, arena });
    engineRef.current?.startGame();
  }, [difficulty, arena]);

  const handlePause = useCallback(() => { Audio.playClick(); engineRef.current?.pause(); }, []);
  const handleResume = useCallback(() => { Audio.playClick(); engineRef.current?.resume(); }, []);
  const handleRestart = useCallback(() => {
    Audio.playClick();
    setIsNewRecord(false);
    setObjectiveComplete(false);
    setDeathCause('');
    engineRef.current?.restart();
  }, []);
  const handleMenu = useCallback(() => {
    Audio.playClick();
    setIsNewRecord(false);
    setObjectiveComplete(false);
    setDeathCause('');
    setGameStats(getStats());
    setCompletedChallenges(getCompletedChallenges());
    setUnlockedArenas(getUnlockedArenas());
    engineRef.current?.goToMenu();
  }, []);

  const handleDifficultyChange = useCallback((diff: Difficulty) => {
    Audio.playClick();
    setDifficulty(diff);
    setHighScoreState(getHighScore(diff));
    engineRef.current?.setDifficulty(diff);
  }, []);

  const handleArenaChange = useCallback((a: ArenaId) => {
    if (unlockedArenas.includes(a)) {
      Audio.playClick();
      setArena(a);
      engineRef.current?.setArena(a);
    }
  }, [unlockedArenas]);

  const toggleMute = useCallback(() => {
    const newMuted = !muted;
    setMuted(newMuted);
    Audio.setMuted(newMuted);
    saveSettings({ mute: newMuted });
  }, [muted]);

  const handleSnakeThemeChange = useCallback((theme: SnakeTheme) => {
    Audio.playClick();
    setSnakeTheme(theme);
    engineRef.current?.setSnakeTheme(theme);
    saveSettings({ snakeTheme: theme });
  }, []);

  const handleGemShapeChange = useCallback((shape: GemShape) => {
    Audio.playClick();
    setGemShape(shape);
    engineRef.current?.setGemShape(shape);
    saveSettings({ gemShape: shape });
  }, []);

  const handleViewModeChange = useCallback(() => {
    Audio.playClick();
    engineRef.current?.cycleViewMode();
    const viewNames: Record<ViewMode, string> = {
      firstPerson: 'First Person',
      chase: 'Chase',
      shoulder: 'Shoulder',
      topDown: 'Top Down'
    };
    const newView = engineRef.current?.getViewMode();
    if (newView) {
      setViewToast(viewNames[newView]);
      setTimeout(() => setViewToast(null), 1500);
    }
  }, []);

  const difficulties: Difficulty[] = ['easy', 'normal', 'hard', 'insane'];

  const powerUpIcons: Record<PowerUpType, string> = {
    shield: '🛡️', slowmo: '⏳', magnet: '🧲', shrink: '📏',
  };
  const powerUpColors: Record<PowerUpType, string> = {
    shield: '#8affd6', slowmo: '#c9a8ff', magnet: '#ffb88c', shrink: '#8ecaff',
  };

  return (
    <div className="game-shell relative w-screen h-screen overflow-hidden bg-[#1a1033] select-none font-nunito">
      <div ref={containerRef} className="game-render-layer absolute inset-0" style={{ zIndex: 0 }} />
      {fatalError && (
        <div role="alert" className="absolute inset-0 z-50 flex items-center justify-center bg-[#1a1033] p-8 text-center">
          <div className="glass-panel-large max-w-md p-6"><h1 className="text-2xl font-bold">3D game could not start</h1><p className="mt-4">Please enable WebGL / hardware acceleration, then retry.</p><pre className="mt-3 max-h-32 overflow-auto whitespace-pre-wrap text-xs">{fatalError}</pre><button className="mt-5 rounded-full bg-mint px-6 py-3 font-bold text-[#1a1033]" onClick={() => { setFatalError(null); setRetryKey(k => k + 1); }}>Retry graphics</button></div>
        </div>
      )}

      {/* Vignette overlay */}
      <div
        className="absolute inset-0 pointer-events-none transition-opacity duration-100"
        style={{
          background: `radial-gradient(ellipse at center, transparent 40%, rgba(180,140,255,${vignetteOpacity * 0.6}) 70%, rgba(100,50,150,${vignetteOpacity}) 100%)`,
        }}
      />

      {/* Soft violet vignette always present */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at center, transparent 50%, rgba(26,16,51,0.4) 100%)',
        }}
      />

      {/* HUD - Playing */}
      {gameState === 'playing' && (
        <>
          <div className="absolute top-4 left-4 md:top-6 md:left-6 space-y-2">
            <div className="glass-panel px-4 py-2">
              <div className="text-[10px] text-violet-200/60 uppercase tracking-widest font-semibold">Score</div>
              <div className="text-2xl md:text-3xl font-black text-warmWhite tabular-nums drop-shadow-glow">
                {score}
              </div>
            </div>
            <div className="glass-panel px-4 py-2">
              <div className="text-[10px] text-violet-200/60 uppercase tracking-widest font-semibold">Length</div>
              <div className="text-base font-bold text-mint tabular-nums">🐍 {snakeLength}</div>
            </div>
            {currentObjective && (
              <div className="glass-panel px-4 py-2">
                <div className="text-[10px] text-violet-200/60 uppercase tracking-widest font-semibold">Objective</div>
                <div className="text-xs text-cyan-300 font-semibold">{currentObjective.title}: {objectiveProgress}/{currentObjective.target}</div>
              </div>
            )}
          </div>

          <div className="absolute top-4 right-4 md:top-6 md:right-6 flex flex-col items-end gap-2">
            <div className="glass-panel px-4 py-2">
              <div className="text-[10px] text-amber-200/60 uppercase tracking-widest font-semibold">Best</div>
              <div className="text-2xl md:text-3xl font-black text-peachGold tabular-nums">{highScore}</div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleViewModeChange}
                className="glass-panel p-2 hover:bg-white/10 transition-colors"
                title="Cycle Camera View (V)"
              >
                📹
              </button>
              <button
                onClick={toggleMute}
                className="glass-panel p-2 hover:bg-white/10 transition-colors"
              >
                {muted ? '🔇' : '🔊'}
              </button>
            </div>
          </div>

          {/* View mode toast */}
          {viewToast && (
            <div className="absolute top-20 left-1/2 -translate-x-1/2 animate-fadeIn">
              <div className="glass-panel px-6 py-3 text-center">
                <div className="text-sm font-bold text-warmWhite">View: {viewToast}</div>
              </div>
            </div>
          )}

          {/* Combo */}
          {combo > 0 && (
            <div className="absolute top-20 left-1/2 -translate-x-1/2">
              <div className="glass-panel-glow px-5 py-2 text-center" style={{ borderColor: 'rgba(255,180,140,0.4)' }}>
                <div className="text-2xl font-black text-peachGold drop-shadow-glow">×{comboMultiplier.toFixed(1)}</div>
                <div className="text-[10px] text-violet-200/60 uppercase tracking-wider">{combo} chain</div>
                <div className="mt-1 w-full h-1 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-100"
                    style={{
                      width: `${(comboTimer / 3) * 100}%`,
                      background: 'linear-gradient(90deg, #ffb88c, #ffd479)',
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Active power-up */}
          {activePowerUp && (
            <div className="absolute top-36 left-1/2 -translate-x-1/2">
              <div
                className="glass-panel rounded-full px-4 py-2 text-center"
                style={{ borderColor: powerUpColors[activePowerUp.type] + '60' }}
              >
                <div className="text-xl">{powerUpIcons[activePowerUp.type]}</div>
                <div className="text-xs font-bold" style={{ color: powerUpColors[activePowerUp.type] }}>
                  {activePowerUp.remaining.toFixed(1)}s
                </div>
              </div>
            </div>
          )}

          {/* Speed ramp */}
          {speedRamp > 0 && (
            <div className="absolute bottom-20 left-4 hidden md:block">
              <div className="glass-panel px-3 py-1.5">
                <div className="text-[10px] text-violet-200/60">Speed +{Math.round(speedRamp * 100)}%</div>
              </div>
            </div>
          )}

          {/* Pause button */}
          <button
            onClick={handlePause}
            className="absolute top-4 right-4 md:top-6 md:right-36 glass-panel p-3 hover:bg-white/10 transition-colors"
          >
            <svg className="w-4 h-4 text-warmWhite" fill="currentColor" viewBox="0 0 20 20">
              <rect x="5" y="4" width="3" height="12" rx="1.5" />
              <rect x="12" y="4" width="3" height="12" rx="1.5" />
            </svg>
          </button>

          {/* Stamina bar */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-48 md:w-64">
            <div className="glass-pill p-1">
              <div className="h-2 rounded-full overflow-hidden bg-white/5">
                <div
                  className="h-full rounded-full transition-all duration-100"
                  style={{
                    width: `${stamina}%`,
                    background: stamina > 30
                      ? 'linear-gradient(90deg, #7fffe0, #b48cff)'
                      : 'linear-gradient(90deg, #ff9e8c, #ffb88c)',
                  }}
                />
              </div>
            </div>
            <div className="text-center text-[10px] text-violet-200/40 mt-1 tracking-wider">BOOST · SHIFT</div>
          </div>

          {/* Soft crosshair */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
            <div className="w-3 h-3 rounded-full bg-mint/30 border border-mint/20 shadow-[0_0_8px_rgba(127,255,224,0.3)]" />
          </div>

          {/* Score popup */}
          {scorePopup && (
            <div key={scorePopup.id} className="absolute top-1/3 left-1/2 -translate-x-1/2 pointer-events-none animate-scorePopup">
              <div className={`text-2xl font-black drop-shadow-glow ${scorePopup.combo > 0 ? 'text-peachGold' : 'text-mint'}`}>
                +{scorePopup.points}
              </div>
            </div>
          )}

          {/* Objective complete toast */}
          {objectiveComplete && currentObjective && (
            <div className="absolute top-1/4 left-1/2 -translate-x-1/2 animate-fadeIn">
              <div className="glass-panel-glow px-6 py-3 text-center" style={{ borderColor: 'rgba(127,255,224,0.5)' }}>
                <div className="text-base font-bold text-mint">🎯 Objective Complete!</div>
                <div className="text-xs text-violet-200/60">+{currentObjective.reward} points</div>
              </div>
            </div>
          )}

          {isMobile && (
            <div className="absolute bottom-20 left-8 pointer-events-none">
              <div className="w-24 h-24 rounded-full border border-mint/10 flex items-center justify-center">
                <div className="w-10 h-10 rounded-full bg-mint/10" />
              </div>
            </div>
          )}
        </>
      )}

      {/* Start Screen */}
      {gameState === 'menu' && (
        <div className="game-menu-panel absolute inset-0 overflow-y-auto overscroll-contain py-5 md:py-8">
          <div className="glass-panel-large p-5 sm:p-8 md:p-10 max-w-md w-[calc(100%-2rem)] mx-auto text-center animate-fadeIn">
            {/* Title */}
            <div className="mb-6 animate-float">
              <div className="text-5xl mb-2">🐍</div>
              <h1 className="text-4xl md:text-5xl font-black text-gradient-title mb-2">
                SERPET
              </h1>
              <p className="text-xs text-violet-200/50 tracking-widest uppercase">A Dreamy Snake Adventure</p>
            </div>

            {/* Stats */}
            <div className="mb-5 flex justify-center gap-4 text-[10px] text-violet-200/40 tracking-wider">
              <div>🏃 {gameStats.totalRuns} runs</div>
              <div>🐍 Best: {gameStats.longestSnake}</div>
              <div>🔥 ×{gameStats.bestCombo}</div>
            </div>

            {/* Difficulty */}
            <div className="mb-4">
              <div className="text-[10px] text-violet-200/40 uppercase tracking-widest mb-2">Difficulty</div>
              <div className="flex gap-2 justify-center flex-wrap">
                {difficulties.map(diff => {
                  const config = DIFFICULTY_CONFIGS[diff];
                  const isActive = difficulty === diff;
                  return (
                    <button
                      key={diff}
                      onClick={() => handleDifficultyChange(diff)}
                      className={`px-4 py-2 rounded-full text-xs font-bold transition-all duration-300 border ${
                        isActive
                          ? 'scale-105 shadow-lg'
                          : 'opacity-60 hover:opacity-100 border-white/10 bg-white/5 text-violet-200/70'
                      }`}
                      style={isActive ? {
                        borderColor: config.color + '80',
                        backgroundColor: config.color + '20',
                        color: config.color,
                        boxShadow: `0 0 20px ${config.color}30`,
                      } : {}}
                    >
                      {config.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Arena */}
            <div className="mb-4">
              <div className="text-[10px] text-violet-200/40 uppercase tracking-widest mb-2">Arena</div>
              <div className="flex gap-2 justify-center flex-wrap">
                {ARENAS.map(a => {
                  const isUnlocked = unlockedArenas.includes(a.id);
                  const isActive = arena === a.id;
                  return (
                    <button
                      key={a.id}
                      onClick={() => handleArenaChange(a.id)}
                      disabled={!isUnlocked}
                      className={`px-3 py-1.5 rounded-full text-[10px] font-bold transition-all border ${
                        !isUnlocked
                          ? 'opacity-30 cursor-not-allowed border-white/5 bg-white/5 text-violet-200/30'
                          : isActive
                            ? 'scale-105 border-cyan-300/50 bg-cyan-300/10 text-cyan-300'
                            : 'opacity-70 hover:opacity-100 border-white/10 bg-white/5 text-violet-200/70'
                      }`}
                    >
                      {isUnlocked ? a.name : `🔒 ${a.unlockScore.toLocaleString()}`}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Snake Theme */}
            <div className="mb-4">
              <div className="text-[10px] text-violet-200/40 uppercase tracking-widest mb-2">Snake Theme</div>
              <div className="flex gap-2 justify-center">
                <button
                  onClick={() => handleSnakeThemeChange('mint')}
                  className={`px-3 py-1.5 rounded-full text-[10px] font-bold transition-all border ${
                    snakeTheme === 'mint'
                      ? 'scale-105 border-[#7fffe0]/50 bg-[#7fffe0]/10 text-[#7fffe0]'
                      : 'opacity-70 hover:opacity-100 border-white/10 bg-white/5 text-violet-200/70'
                  }`}
                >
                  🌿 Mint
                </button>
                <button
                  onClick={() => handleSnakeThemeChange('sunset')}
                  className={`px-3 py-1.5 rounded-full text-[10px] font-bold transition-all border ${
                    snakeTheme === 'sunset'
                      ? 'scale-105 border-[#ffb347]/50 bg-[#ffb347]/10 text-[#ffb347]'
                      : 'opacity-70 hover:opacity-100 border-white/10 bg-white/5 text-violet-200/70'
                  }`}
                >
                  🌅 Sunset
                </button>
                <button
                  onClick={() => handleSnakeThemeChange('galaxy')}
                  className={`px-3 py-1.5 rounded-full text-[10px] font-bold transition-all border ${
                    snakeTheme === 'galaxy'
                      ? 'scale-105 border-[#87ceeb]/50 bg-[#87ceeb]/10 text-[#87ceeb]'
                      : 'opacity-70 hover:opacity-100 border-white/10 bg-white/5 text-violet-200/70'
                  }`}
                >
                  🌌 Galaxy
                </button>
              </div>
            </div>

            {/* Gem Shape */}
            <div className="mb-4">
              <div className="text-[10px] text-violet-200/40 uppercase tracking-widest mb-2">Crown Gem</div>
              <div className="flex gap-2 justify-center">
                <button
                  onClick={() => handleGemShapeChange('star')}
                  className={`px-3 py-1.5 rounded-full text-[10px] font-bold transition-all border ${
                    gemShape === 'star'
                      ? 'scale-105 border-[#ffd479]/50 bg-[#ffd479]/10 text-[#ffd479]'
                      : 'opacity-70 hover:opacity-100 border-white/10 bg-white/5 text-violet-200/70'
                  }`}
                >
                  ⭐ Star
                </button>
                <button
                  onClick={() => handleGemShapeChange('gem')}
                  className={`px-3 py-1.5 rounded-full text-[10px] font-bold transition-all border ${
                    gemShape === 'gem'
                      ? 'scale-105 border-[#b48cff]/50 bg-[#b48cff]/10 text-[#b48cff]'
                      : 'opacity-70 hover:opacity-100 border-white/10 bg-white/5 text-violet-200/70'
                  }`}
                >
                  💎 Gem
                </button>
                <button
                  onClick={() => handleGemShapeChange('halo')}
                  className={`px-3 py-1.5 rounded-full text-[10px] font-bold transition-all border ${
                    gemShape === 'halo'
                      ? 'scale-105 border-[#ff9ee8]/50 bg-[#ff9ee8]/10 text-[#ff9ee8]'
                      : 'opacity-70 hover:opacity-100 border-white/10 bg-white/5 text-violet-200/70'
                  }`}
                >
                  👑 Halo
                </button>
              </div>
            </div>

            {highScore > 0 && (
              <div className="mb-4 text-peachGold/80 text-xs">
                🏆 Best: <span className="font-bold">{highScore}</span>
              </div>
            )}

            {/* Play Button */}
            <button
              onClick={handleStart}
              className="w-full py-4 rounded-full bg-gradient-to-r from-mint/80 to-lavender/80 text-[#1a1033] font-black text-lg hover:from-mint hover:to-lavender transition-all duration-300 hover:scale-[1.02] active:scale-95 shadow-lg shadow-mint/20 mb-3 animate-breathe"
            >
              ▶ PLAY
            </button>

            <div className="flex gap-2">
              <button
                onClick={() => { Audio.playClick(); setShowChallenges(true); }}
                className="flex-1 py-2 rounded-full glass-panel text-violet-200/70 text-xs hover:bg-white/10 transition-colors"
              >
                🎯 Challenges ({completedChallenges.length})
              </button>
              <button
                onClick={() => { Audio.playClick(); setShowHelp(true); }}
                className="flex-1 py-2 rounded-full glass-panel text-violet-200/70 text-xs hover:bg-white/10 transition-colors"
              >
                ❓ How to Play
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pause Screen */}
      {gameState === 'paused' && (
        <div className="absolute inset-0 flex items-center justify-center overflow-y-auto p-3">
          <div className="glass-panel-large p-6 max-w-sm w-full mx-4 text-center animate-fadeIn">
            <h2 className="text-3xl font-black text-warmWhite mb-2">⏸ Paused</h2>
            <div className="text-violet-200/50 text-sm mb-4">
              Score: <span className="text-mint font-bold">{score}</span> · Length: {snakeLength}
            </div>

            {currentObjective && (
              <div className="mb-4 text-xs text-cyan-300/70">
                Objective: {currentObjective.title} ({objectiveProgress}/{currentObjective.target})
              </div>
            )}

            <div className="space-y-2">
              <button onClick={handleResume} className="w-full py-3 rounded-full bg-mint/80 text-[#1a1033] font-bold transition-all hover:bg-mint hover:scale-[1.02] active:scale-95">
                ▶ Resume
              </button>
              <button onClick={handleRestart} className="w-full py-3 rounded-full bg-lavender/60 text-warmWhite font-bold transition-all hover:bg-lavender/80 hover:scale-[1.02] active:scale-95">
                🔄 Restart
              </button>

              <div className="pt-2 border-t border-white/10">
                <div className="text-[10px] text-violet-200/40 uppercase tracking-widest mb-2">Difficulty</div>
                <div className="flex gap-1 justify-center">
                  {difficulties.map(diff => {
                    const config = DIFFICULTY_CONFIGS[diff];
                    const isActive = difficulty === diff;
                    return (
                      <button
                        key={diff}
                        onClick={() => handleDifficultyChange(diff)}
                        className={`px-2 py-1 rounded-full text-[10px] font-bold transition-all border ${
                          isActive ? 'border-current' : 'border-white/10 bg-white/5 text-violet-200/50'
                        }`}
                        style={isActive ? { color: config.color, borderColor: config.color + '60' } : {}}
                      >
                        {config.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <button onClick={handleMenu} className="w-full py-3 rounded-full glass-panel text-violet-200/70 font-bold transition-all hover:bg-white/10">
                🏠 Main Menu
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Game Over Screen */}
      {gameState === 'gameover' && (
        <div className="absolute inset-0 flex items-center justify-center overflow-y-auto p-3 animate-fadeIn">
          <div className={`glass-panel-large p-6 max-w-sm w-full mx-4 text-center ${isNewRecord ? 'border-amber-300/30' : 'border-rose-300/20'}`}>
            <h2 className="text-3xl font-black text-rose-300 mb-1">GAME OVER</h2>
            <div className="text-violet-200/40 text-xs mb-2">
              {deathCause === 'wall' ? '💫 Hit the wall' : deathCause === 'self' ? '🐍 Bit yourself' : '⚡ Hit an obstacle'}
            </div>

            {isNewRecord && (
              <div className="text-peachGold font-bold text-base mb-3 animate-bounce drop-shadow-glow">
                🎉 NEW RECORD! 🎉
              </div>
            )}

            <div className="my-4 space-y-1">
              <div className="text-violet-200/40 text-[10px] uppercase tracking-widest">Score</div>
              <div className="text-3xl font-black text-warmWhite tabular-nums drop-shadow-glow">{score}</div>
              <div className="text-violet-200/30 text-[10px]">
                Best: <span className="text-peachGold">{highScore}</span>
              </div>
            </div>

            {runStats && (
              <div className="grid grid-cols-2 gap-2 my-4 text-[10px]">
                <div className="glass-panel p-2 rounded-xl">
                  <div className="text-violet-200/40">Length</div>
                  <div className="text-mint font-bold">{runStats.maxLength}</div>
                </div>
                <div className="glass-panel p-2 rounded-xl">
                  <div className="text-violet-200/40">Foods</div>
                  <div className="text-rose-300 font-bold">{runStats.foodsEaten}</div>
                </div>
                <div className="glass-panel p-2 rounded-xl">
                  <div className="text-violet-200/40">Max Combo</div>
                  <div className="text-peachGold font-bold">×{runStats.maxCombo}</div>
                </div>
                <div className="glass-panel p-2 rounded-xl">
                  <div className="text-violet-200/40">Time</div>
                  <div className="text-cyan-300 font-bold">{Math.floor(runStats.survivalTime)}s</div>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <button onClick={handleRestart} className="w-full py-3 rounded-full bg-gradient-to-r from-mint/80 to-lavender/80 text-[#1a1033] font-bold transition-all hover:scale-[1.02] active:scale-95 shadow-lg shadow-mint/20">
                🔄 Try Again
              </button>
              <button onClick={handleMenu} className="w-full py-3 rounded-full glass-panel text-violet-200/70 font-bold transition-all hover:bg-white/10">
                🏠 Main Menu
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Help Modal */}
      {showHelp && (
        <div className="absolute inset-0 flex items-center justify-center z-50 bg-[#1a1033]/60 backdrop-blur-sm">
          <div className="glass-panel-large p-6 max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto animate-fadeIn">
            <h3 className="text-xl font-black text-warmWhite mb-3">How to Play</h3>
            <div className="space-y-3 text-xs text-violet-200/70">
              <div>
                <h4 className="text-warmWhite font-bold mb-1">🖥️ Desktop</h4>
                <ul className="space-y-0.5">
                  <li><kbd className="kbd">W</kbd> / <kbd className="kbd">↑</kbd> — Speed up</li>
                  <li><kbd className="kbd">A</kbd> <kbd className="kbd">D</kbd> — Turn</li>
                  <li><kbd className="kbd">Mouse</kbd> — Look (click to lock)</li>
                  <li><kbd className="kbd">Shift</kbd> — Boost</li>
                  <li><kbd className="kbd">Space</kbd> — Pause</li>
                </ul>
              </div>
              <div>
                <h4 className="text-warmWhite font-bold mb-1">🍬 Food Types</h4>
                <ul className="space-y-0.5">
                  <li><span className="text-[#ffd479]">●</span> Normal — +1 segment</li>
                  <li><span className="text-[#ffe9a8]">●</span> Golden — +2 segments, ×3 pts (timed!)</li>
                  <li><span className="text-[#8ecaff]">●</span> Shrink — Removes 3 segments</li>
                  <li><span className="text-[#8affd6]">●</span> Shield — 1-hit protection (8s)</li>
                  <li><span className="text-[#c9a8ff]">●</span> Slow-mo — Slows world (4s)</li>
                  <li><span className="text-[#ffb88c]">●</span> Magnet — Pulls food closer (6s)</li>
                </ul>
              </div>
              <div>
                <h4 className="text-warmWhite font-bold mb-1">🔥 Combo System</h4>
                <p>Eat food within 3s to chain combos! Multiplier goes up to ×3.</p>
              </div>
              <div>
                <h4 className="text-warmWhite font-bold mb-1">⚠️ Hazards</h4>
                <p>Soft coral obstacles spawn as you play. Walls and your own body are deadly!</p>
              </div>
            </div>
            <button onClick={() => setShowHelp(false)} className="w-full mt-4 py-3 rounded-full glass-panel text-warmWhite font-bold transition-all hover:bg-white/10">
              Got it!
            </button>
          </div>
        </div>
      )}

      {/* Challenges Modal */}
      {showChallenges && (
        <div className="absolute inset-0 flex items-center justify-center z-50 bg-[#1a1033]/60 backdrop-blur-sm">
          <div className="glass-panel-large p-6 max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto animate-fadeIn">
            <h3 className="text-xl font-black text-warmWhite mb-2">🎯 Challenges</h3>
            <div className="text-[10px] text-violet-200/40 mb-3 tracking-wider">{completedChallenges.length} completed</div>
            <div className="space-y-2">
              {OBJECTIVES.map((obj) => {
                const completed = completedChallenges.includes(obj.id);
                return (
                  <div
                    key={obj.id}
                    className={`rounded-2xl p-3 border transition-all ${
                      completed
                        ? 'bg-mint/10 border-mint/30'
                        : 'bg-white/5 border-white/10'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-xs font-bold text-warmWhite">
                          {completed ? '✅' : '⬜'} {obj.title}
                        </div>
                        <div className="text-[10px] text-violet-200/50">{obj.description}</div>
                      </div>
                      <div className="text-[10px] text-peachGold font-bold">+{obj.reward}</div>
                    </div>
                  </div>
                );
              })}
            </div>
            <button onClick={() => setShowChallenges(false)} className="w-full mt-4 py-3 rounded-full glass-panel text-warmWhite font-bold transition-all hover:bg-white/10">
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
