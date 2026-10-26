import { useState, useEffect, useRef, useCallback } from 'react';
import { useSnakeGame, Direction, Difficulty } from './hooks/useSnakeGame';

export default function SnakeGame() {
  const {
    snake,
    food,
    score,
    highScore,
    difficulty,
    status,
    gridSize,
    startGame,
    togglePause,
    restartGame,
    changeDirection,
    changeDifficulty,
  } = useSnakeGame();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState(400);

  // Responsive canvas sizing
  useEffect(() => {
    function updateSize() {
      const maxWidth = Math.min(window.innerWidth - 32, 500);
      const maxHeight = window.innerHeight - 320;
      const size = Math.min(maxWidth, maxHeight, 500);
      setCanvasSize(Math.max(280, size));
    }
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  // Draw game on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const cellSize = canvasSize / gridSize;
    const dpr = window.devicePixelRatio || 1;

    canvas.width = canvasSize * dpr;
    canvas.height = canvasSize * dpr;
    ctx.scale(dpr, dpr);

    // Background
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, canvasSize, canvasSize);

    // Grid lines (subtle)
    ctx.strokeStyle = 'rgba(51, 65, 85, 0.3)';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= gridSize; i++) {
      ctx.beginPath();
      ctx.moveTo(i * cellSize, 0);
      ctx.lineTo(i * cellSize, canvasSize);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * cellSize);
      ctx.lineTo(canvasSize, i * cellSize);
      ctx.stroke();
    }

    // Food with glow effect
    const foodX = food.x * cellSize + cellSize / 2;
    const foodY = food.y * cellSize + cellSize / 2;
    const foodRadius = cellSize * 0.4;

    // Glow
    const gradient = ctx.createRadialGradient(foodX, foodY, 0, foodX, foodY, cellSize);
    gradient.addColorStop(0, 'rgba(239, 68, 68, 0.4)');
    gradient.addColorStop(1, 'rgba(239, 68, 68, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(food.x * cellSize - cellSize / 2, food.y * cellSize - cellSize / 2, cellSize * 2, cellSize * 2);

    // Food circle
    ctx.beginPath();
    ctx.arc(foodX, foodY, foodRadius, 0, Math.PI * 2);
    ctx.fillStyle = '#ef4444';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(foodX - foodRadius * 0.3, foodY - foodRadius * 0.3, foodRadius * 0.25, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.fill();

    // Snake
    snake.forEach((segment, index) => {
      const x = segment.x * cellSize;
      const y = segment.y * cellSize;
      const padding = 1;
      const radius = cellSize * 0.15;

      // Color gradient from head to tail
      const progress = index / Math.max(snake.length - 1, 1);
      const r = Math.round(34 + progress * (16 - 34));
      const g = Math.round(197 + progress * (185 - 197));
      const b = Math.round(94 + progress * (129 - 94));

      ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;

      // Rounded rectangle for each segment
      const rx = x + padding;
      const ry = y + padding;
      const rw = cellSize - padding * 2;
      const rh = cellSize - padding * 2;

      ctx.beginPath();
      ctx.moveTo(rx + radius, ry);
      ctx.lineTo(rx + rw - radius, ry);
      ctx.quadraticCurveTo(rx + rw, ry, rx + rw, ry + radius);
      ctx.lineTo(rx + rw, ry + rh - radius);
      ctx.quadraticCurveTo(rx + rw, ry + rh, rx + rw - radius, ry + rh);
      ctx.lineTo(rx + radius, ry + rh);
      ctx.quadraticCurveTo(rx, ry + rh, rx, ry + rh - radius);
      ctx.lineTo(rx, ry + radius);
      ctx.quadraticCurveTo(rx, ry, rx + radius, ry);
      ctx.closePath();
      ctx.fill();

      // Head eyes
      if (index === 0) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        const eyeSize = cellSize * 0.12;
        const eyeOffset = cellSize * 0.22;
        ctx.beginPath();
        ctx.arc(x + cellSize / 2 - eyeOffset, y + cellSize / 2 - eyeOffset * 0.3, eyeSize, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x + cellSize / 2 + eyeOffset, y + cellSize / 2 - eyeOffset * 0.3, eyeSize, 0, Math.PI * 2);
        ctx.fill();

        // Pupils
        ctx.fillStyle = '#0f172a';
        const pupilSize = eyeSize * 0.55;
        ctx.beginPath();
        ctx.arc(x + cellSize / 2 - eyeOffset, y + cellSize / 2 - eyeOffset * 0.3, pupilSize, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x + cellSize / 2 + eyeOffset, y + cellSize / 2 - eyeOffset * 0.3, pupilSize, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    // Overlay for non-playing states
    if (status === 'paused' || status === 'gameover' || status === 'idle') {
      ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
      ctx.fillRect(0, 0, canvasSize, canvasSize);

      ctx.fillStyle = '#f8fafc';
      ctx.font = `bold ${canvasSize * 0.06}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      if (status === 'idle') {
        ctx.fillText('🐍 SNAKE', canvasSize / 2, canvasSize / 2 - canvasSize * 0.08);
        ctx.font = `${canvasSize * 0.035}px system-ui, sans-serif`;
        ctx.fillStyle = '#94a3b8';
        ctx.fillText('Press Start or Space to begin', canvasSize / 2, canvasSize / 2 + canvasSize * 0.04);
      } else if (status === 'paused') {
        ctx.fillText('⏸ PAUSED', canvasSize / 2, canvasSize / 2);
        ctx.font = `${canvasSize * 0.03}px system-ui, sans-serif`;
        ctx.fillStyle = '#94a3b8';
        ctx.fillText('Press Space to resume', canvasSize / 2, canvasSize / 2 + canvasSize * 0.06);
      } else if (status === 'gameover') {
        ctx.fillStyle = '#ef4444';
        ctx.fillText('GAME OVER', canvasSize / 2, canvasSize / 2 - canvasSize * 0.06);
        ctx.fillStyle = '#f8fafc';
        ctx.font = `${canvasSize * 0.04}px system-ui, sans-serif`;
        ctx.fillText(`Score: ${score}`, canvasSize / 2, canvasSize / 2 + canvasSize * 0.02);
        ctx.font = `${canvasSize * 0.03}px system-ui, sans-serif`;
        ctx.fillStyle = '#94a3b8';
        ctx.fillText('Press Restart to play again', canvasSize / 2, canvasSize / 2 + canvasSize * 0.08);
      }
    }
  }, [snake, food, status, score, gridSize, canvasSize]);

  // Keyboard controls
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const keyMap: Record<string, Direction> = {
        ArrowUp: 'UP',
        ArrowDown: 'DOWN',
        ArrowLeft: 'LEFT',
        ArrowRight: 'RIGHT',
        w: 'UP',
        s: 'DOWN',
        a: 'LEFT',
        d: 'RIGHT',
        W: 'UP',
        S: 'DOWN',
        A: 'LEFT',
        D: 'RIGHT',
      };

      if (e.key === ' ' || e.key === 'Escape') {
        e.preventDefault();
        if (status === 'idle') {
          startGame();
        } else if (status === 'gameover') {
          restartGame();
        } else {
          togglePause();
        }
        return;
      }

      const dir = keyMap[e.key];
      if (dir) {
        e.preventDefault();
        if (status === 'idle') {
          startGame();
        }
        changeDirection(dir);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [status, changeDirection, startGame, togglePause, restartGame]);

  // Touch controls
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - touchStartRef.current.x;
    const dy = touch.clientY - touchStartRef.current.y;
    const minSwipe = 30;

    if (Math.abs(dx) < minSwipe && Math.abs(dy) < minSwipe) {
      // Tap - toggle pause or start
      if (status === 'idle') startGame();
      else if (status === 'gameover') restartGame();
      else togglePause();
      touchStartRef.current = null;
      return;
    }

    let dir: Direction;
    if (Math.abs(dx) > Math.abs(dy)) {
      dir = dx > 0 ? 'RIGHT' : 'LEFT';
    } else {
      dir = dy > 0 ? 'DOWN' : 'UP';
    }

    if (status === 'idle') startGame();
    changeDirection(dir);
    touchStartRef.current = null;
  }, [status, changeDirection, startGame, togglePause, restartGame]);

  const difficulties: { key: Difficulty; label: string; color: string }[] = [
    { key: 'easy', label: 'Easy', color: 'bg-green-500/20 text-green-400 border-green-500/40' },
    { key: 'medium', label: 'Medium', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40' },
    { key: 'hard', label: 'Hard', color: 'bg-red-500/20 text-red-400 border-red-500/40' },
  ];

  return (
    <div
      ref={containerRef}
      className="flex flex-col items-center justify-center min-h-screen bg-slate-900 p-4 select-none"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Header */}
      <div className="w-full max-w-[500px] mb-4">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <span className="text-3xl">🐍</span> Snake
          </h1>
          <div className="flex gap-3">
            <div className="text-center">
              <div className="text-xs text-slate-400 uppercase tracking-wider">Score</div>
              <div className="text-xl font-bold text-emerald-400 tabular-nums">{score}</div>
            </div>
            <div className="text-center">
              <div className="text-xs text-slate-400 uppercase tracking-wider">Best</div>
              <div className="text-xl font-bold text-amber-400 tabular-nums">{highScore}</div>
            </div>
          </div>
        </div>

        {/* Difficulty selector */}
        <div className="flex gap-2 mb-3">
          {difficulties.map(d => (
            <button
              key={d.key}
              onClick={() => {
                changeDifficulty(d.key);
                if (status === 'idle' || status === 'gameover') {
                  // Will apply on next start
                }
              }}
              className={`flex-1 py-1.5 px-3 rounded-lg text-sm font-medium border transition-all duration-200 ${
                difficulty === d.key
                  ? d.color + ' scale-105 shadow-lg'
                  : 'bg-slate-800/50 text-slate-400 border-slate-700 hover:border-slate-500'
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>

      {/* Game Canvas */}
      <div className="relative rounded-xl overflow-hidden shadow-2xl shadow-emerald-500/10 border border-slate-700/50">
        <canvas
          ref={canvasRef}
          style={{ width: canvasSize, height: canvasSize }}
          className="block"
        />
      </div>

      {/* Controls */}
      <div className="w-full max-w-[500px] mt-4">
        <div className="flex gap-2 mb-4">
          {status === 'idle' || status === 'gameover' ? (
            <button
              onClick={status === 'gameover' ? restartGame : startGame}
              className="flex-1 py-3 px-6 bg-emerald-500 hover:bg-emerald-400 text-white font-bold rounded-xl transition-all duration-200 hover:scale-[1.02] active:scale-95 shadow-lg shadow-emerald-500/25"
            >
              {status === 'gameover' ? '🔄 Restart' : '▶ Start Game'}
            </button>
          ) : (
            <>
              <button
                onClick={togglePause}
                className="flex-1 py-3 px-6 bg-slate-700 hover:bg-slate-600 text-white font-bold rounded-xl transition-all duration-200 hover:scale-[1.02] active:scale-95"
              >
                {status === 'paused' ? '▶ Resume' : '⏸ Pause'}
              </button>
              <button
                onClick={restartGame}
                className="py-3 px-6 bg-slate-700 hover:bg-slate-600 text-white font-bold rounded-xl transition-all duration-200 hover:scale-[1.02] active:scale-95"
              >
                🔄
              </button>
            </>
          )}
        </div>

        {/* Mobile D-Pad */}
        <div className="md:hidden grid grid-cols-3 gap-2 max-w-[200px] mx-auto">
          <div />
          <button
            onTouchStart={(e) => { e.stopPropagation(); if (status === 'idle') startGame(); changeDirection('UP'); }}
            className="aspect-square bg-slate-700/80 hover:bg-slate-600 active:bg-slate-500 rounded-xl flex items-center justify-center text-2xl text-white transition-colors"
          >
            ↑
          </button>
          <div />
          <button
            onTouchStart={(e) => { e.stopPropagation(); if (status === 'idle') startGame(); changeDirection('LEFT'); }}
            className="aspect-square bg-slate-700/80 hover:bg-slate-600 active:bg-slate-500 rounded-xl flex items-center justify-center text-2xl text-white transition-colors"
          >
            ←
          </button>
          <button
            onTouchStart={(e) => { e.stopPropagation(); if (status === 'idle') startGame(); changeDirection('DOWN'); }}
            className="aspect-square bg-slate-700/80 hover:bg-slate-600 active:bg-slate-500 rounded-xl flex items-center justify-center text-2xl text-white transition-colors"
          >
            ↓
          </button>
          <button
            onTouchStart={(e) => { e.stopPropagation(); if (status === 'idle') startGame(); changeDirection('RIGHT'); }}
            className="aspect-square bg-slate-700/80 hover:bg-slate-600 active:bg-slate-500 rounded-xl flex items-center justify-center text-2xl text-white transition-colors"
          >
            →
          </button>
        </div>

        {/* Instructions */}
        <div className="mt-4 text-center text-xs text-slate-500 space-y-1">
          <p className="hidden md:block">Arrow keys or WASD to move • Space to pause/resume</p>
          <p className="md:hidden">Swipe to move • Tap to pause</p>
        </div>
      </div>
    </div>
  );
}


