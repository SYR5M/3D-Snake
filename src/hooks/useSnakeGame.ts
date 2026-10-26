import { useState, useCallback, useEffect, useRef } from 'react';

export type Direction = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';
export type Position = { x: number; y: number };
export type Difficulty = 'easy' | 'medium' | 'hard';
export type GameStatus = 'idle' | 'playing' | 'paused' | 'gameover';

const GRID_SIZE = 20;
const SPEEDS: Record<Difficulty, number> = {
  easy: 180,
  medium: 120,
  hard: 75,
};

function getRandomPosition(snake: Position[]): Position {
  let pos: Position;
  do {
    pos = {
      x: Math.floor(Math.random() * GRID_SIZE),
      y: Math.floor(Math.random() * GRID_SIZE),
    };
  } while (snake.some(seg => seg.x === pos.x && seg.y === pos.y));
  return pos;
}

function getInitialSnake(): Position[] {
  const mid = Math.floor(GRID_SIZE / 2);
  return [
    { x: mid, y: mid },
    { x: mid - 1, y: mid },
    { x: mid - 2, y: mid },
  ];
}

export function useSnakeGame() {
  const [snake, setSnake] = useState<Position[]>(getInitialSnake());
  const [food, setFood] = useState<Position>(() => getRandomPosition(getInitialSnake()));
  const [direction, setDirection] = useState<Direction>('RIGHT');
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(() => {
    const saved = localStorage.getItem('snake-high-score');
    return saved ? parseInt(saved, 10) : 0;
  });
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [status, setStatus] = useState<GameStatus>('idle');

  const directionRef = useRef<Direction>('RIGHT');
  const nextDirectionRef = useRef<Direction | null>(null);
  const gameLoopRef = useRef<number | null>(null);
  const statusRef = useRef<GameStatus>('idle');

  // Keep refs in sync
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    directionRef.current = direction;
  }, [direction]);

  const stopGameLoop = useCallback(() => {
    if (gameLoopRef.current !== null) {
      clearInterval(gameLoopRef.current);
      gameLoopRef.current = null;
    }
  }, []);

  const moveSnake = useCallback(() => {
    if (statusRef.current !== 'playing') return;

    setSnake(prevSnake => {
      // Apply queued direction change
      if (nextDirectionRef.current) {
        directionRef.current = nextDirectionRef.current;
        setDirection(nextDirectionRef.current);
        nextDirectionRef.current = null;
      }

      const head = prevSnake[0];
      const dir = directionRef.current;
      let newHead: Position;

      switch (dir) {
        case 'UP':
          newHead = { x: head.x, y: head.y - 1 };
          break;
        case 'DOWN':
          newHead = { x: head.x, y: head.y + 1 };
          break;
        case 'LEFT':
          newHead = { x: head.x - 1, y: head.y };
          break;
        case 'RIGHT':
          newHead = { x: head.x + 1, y: head.y };
          break;
      }

      // Check wall collision
      if (
        newHead.x < 0 ||
        newHead.x >= GRID_SIZE ||
        newHead.y < 0 ||
        newHead.y >= GRID_SIZE
      ) {
        setStatus('gameover');
        stopGameLoop();
        return prevSnake;
      }

      // Check self collision
      if (prevSnake.some(seg => seg.x === newHead.x && seg.y === newHead.y)) {
        setStatus('gameover');
        stopGameLoop();
        return prevSnake;
      }

      const newSnake = [newHead, ...prevSnake];

      // Check food collision
      setFood(prevFood => {
        if (newHead.x === prevFood.x && newHead.y === prevFood.y) {
          setScore(prev => {
            const newScore = prev + 10;
            setHighScore(currentHigh => {
              if (newScore > currentHigh) {
                localStorage.setItem('snake-high-score', newScore.toString());
                return newScore;
              }
              return currentHigh;
            });
            return newScore;
          });
          const newFood = getRandomPosition(newSnake);
          return newFood;
        }
        // Remove tail if no food eaten
        newSnake.pop();
        return prevFood;
      });

      return newSnake;
    });
  }, [stopGameLoop]);

  const startGameLoop = useCallback(() => {
    stopGameLoop();
    gameLoopRef.current = window.setInterval(moveSnake, SPEEDS[difficulty]);
  }, [moveSnake, difficulty, stopGameLoop]);

  const startGame = useCallback(() => {
    const initialSnake = getInitialSnake();
    setSnake(initialSnake);
    setFood(getRandomPosition(initialSnake));
    setDirection('RIGHT');
    directionRef.current = 'RIGHT';
    nextDirectionRef.current = null;
    setScore(0);
    setStatus('playing');
  }, []);

  const togglePause = useCallback(() => {
    if (status === 'playing') {
      setStatus('paused');
      stopGameLoop();
    } else if (status === 'paused') {
      setStatus('playing');
    }
  }, [status, stopGameLoop]);

  const restartGame = useCallback(() => {
    stopGameLoop();
    startGame();
  }, [stopGameLoop, startGame]);

  const changeDifficulty = useCallback((newDifficulty: Difficulty) => {
    setDifficulty(newDifficulty);
  }, []);

  // Start/stop game loop based on status and difficulty
  useEffect(() => {
    if (status === 'playing') {
      startGameLoop();
    } else {
      stopGameLoop();
    }
    return () => stopGameLoop();
  }, [status, difficulty, startGameLoop, stopGameLoop]);

  const changeDirection = useCallback((newDir: Direction) => {
    const current = nextDirectionRef.current || directionRef.current;
    const opposites: Record<Direction, Direction> = {
      UP: 'DOWN',
      DOWN: 'UP',
      LEFT: 'RIGHT',
      RIGHT: 'LEFT',
    };

    if (opposites[newDir] !== current) {
      nextDirectionRef.current = newDir;
    }
  }, []);

  return {
    snake,
    food,
    direction,
    score,
    highScore,
    difficulty,
    status,
    gridSize: GRID_SIZE,
    startGame,
    togglePause,
    restartGame,
    changeDirection,
    changeDifficulty,
  };
}
