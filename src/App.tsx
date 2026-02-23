/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Shield, Target, Trophy, RotateCcw, Languages, Info, AlertTriangle } from 'lucide-react';

// --- Types & Constants ---

type Point = { x: number; y: number };

interface Entity {
  update(dt: number): boolean; // returns false if entity should be removed
  draw(ctx: CanvasRenderingContext2D): void;
}

enum GameStatus {
  START = 'START',
  PLAYING = 'PLAYING',
  ROUND_END = 'ROUND_END',
  GAME_OVER = 'GAME_OVER',
  WIN = 'WIN'
}

const COLORS = {
  bg: '#1a1a1a', // Dark gray background
  enemy: '#ffffff', // White dog
  interceptor: '#000000', // Black cat
  explosion: '#cccccc', // Light gray explosion
  city: '#888888', // Medium gray city
  battery: '#444444', // Darker gray battery
  text: '#ffffff',
  target: '#ffffff'
};

// --- Helper for Pixel Art ---

function drawPixelArt(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, grid: number[][], color: string) {
  const pixelSize = size / grid.length;
  ctx.fillStyle = color;
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      if (grid[r][c] === 1) {
        ctx.fillRect(x + c * pixelSize - size / 2, y + r * pixelSize - size / 2, pixelSize, pixelSize);
      }
    }
  }
}

// Dog Grid (5x5)
const DOG_GRID = [
  [0, 1, 0, 1, 0],
  [1, 1, 1, 1, 1],
  [1, 0, 1, 0, 1],
  [1, 1, 1, 1, 1],
  [0, 1, 0, 1, 0]
];

// Cat Grid (5x5)
const CAT_GRID = [
  [1, 0, 0, 0, 1],
  [1, 1, 1, 1, 1],
  [1, 0, 1, 0, 1],
  [1, 1, 1, 1, 1],
  [0, 1, 1, 1, 0]
];

// Bone Grid (8x8)
const BONE_GRID = [
  [1, 1, 0, 0, 0, 0, 1, 1],
  [1, 1, 0, 0, 0, 0, 1, 1],
  [0, 0, 1, 1, 1, 1, 0, 0],
  [0, 0, 1, 1, 1, 1, 0, 0],
  [0, 0, 1, 1, 1, 1, 0, 0],
  [0, 0, 1, 1, 1, 1, 0, 0],
  [1, 1, 0, 0, 0, 0, 1, 1],
  [1, 1, 0, 0, 0, 0, 1, 1]
];

// Fish Grid (8x8)
const FISH_GRID = [
  [0, 0, 1, 1, 1, 1, 0, 0],
  [0, 1, 1, 1, 1, 1, 1, 0],
  [1, 1, 1, 1, 1, 1, 1, 1],
  [1, 1, 0, 1, 1, 1, 1, 1],
  [1, 1, 1, 1, 1, 1, 1, 1],
  [0, 1, 1, 1, 1, 1, 1, 0],
  [0, 0, 1, 1, 1, 1, 0, 0],
  [0, 0, 1, 0, 0, 1, 0, 0]
];

function drawPlanet(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.fillStyle = '#444';
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.fillStyle = '#222';
  ctx.fillRect(x - r * 0.6, y - r * 0.6, r * 0.4, r * 0.4);
  ctx.fillRect(x + r * 0.2, y + r * 0.1, r * 0.5, r * 0.5);
}

const WIN_SCORE = 1000;
const INITIAL_AMMO = [20, 40, 20]; // Left, Center, Right

// --- Translations ---

const TRANSLATIONS = {
  en: {
    title: 'Sun & Light',
    start: 'Start Game',
    restart: 'Play Again',
    score: 'Score',
    round: 'Round',
    ammo: 'Ammo',
    win: 'Cats Win! Dried Fish Tonight!',
    gameOver: 'Dogs Win! Bones Tonight!',
    winDesc: 'You reached 1000 points and saved the remaining cities!',
    lossDesc: 'All missile batteries have been destroyed.',
    instructions: 'Click anywhere to launch interceptors. Aim ahead of enemy rockets!',
    nextRound: 'Next Round',
    totalScore: 'Total Score',
    bonus: 'Ammo Bonus',
  },
  zh: {
    title: 'Sun & Light',
    start: '开始游戏',
    restart: '再玩一次',
    score: '得分',
    round: '关卡',
    ammo: '弹药',
    win: '猫猫胜利，今晚吃小鱼干！',
    gameOver: '狗狗胜利，今晚吃小骨头！',
    winDesc: '你达到了1000分并保卫了剩余的城市！',
    lossDesc: '所有导弹发射塔已被摧毁。',
    instructions: '点击屏幕发射拦截导弹。请预判敌方火箭的路径！',
    nextRound: '下一轮',
    totalScore: '总得分',
    bonus: '弹药奖励',
  }
};

// --- Game Classes ---

class EnemyRocket implements Entity {
  start: Point;
  end: Point;
  pos: Point;
  speed: number;
  targetIndex: number; // Index of city or battery

  constructor(width: number, height: number, targetX: number, targetIndex: number, speed: number) {
    this.start = { x: Math.random() * width, y: 0 };
    this.end = { x: targetX, y: height - 40 };
    this.pos = { ...this.start };
    this.targetIndex = targetIndex;
    this.speed = speed * (2 / 3); // Slowed down by 1/3
  }

  update(dt: number): boolean {
    const dx = this.end.x - this.pos.x;
    const dy = this.end.y - this.pos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    if (dist < 2) return false;

    const vx = (dx / dist) * this.speed * dt;
    const vy = (dy / dist) * this.speed * dt;
    
    this.pos.x += vx;
    this.pos.y += vy;
    
    return true;
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.beginPath();
    ctx.strokeStyle = COLORS.enemy;
    ctx.lineWidth = 3; // Doubled thickness
    ctx.moveTo(this.start.x, this.start.y);
    ctx.lineTo(this.pos.x, this.pos.y);
    ctx.stroke();
    
    // Pixel Dog Head
    drawPixelArt(ctx, this.pos.x, this.pos.y, 15, DOG_GRID, COLORS.enemy);
  }
}

class InterceptorMissile implements Entity {
  start: Point;
  target: Point;
  pos: Point;
  speed: number = 400;

  constructor(start: Point, target: Point) {
    this.start = { ...start };
    this.target = { ...target };
    this.pos = { ...start };
  }

  update(dt: number): boolean {
    const dx = this.target.x - this.pos.x;
    const dy = this.target.y - this.pos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    if (dist < 5) return false;

    const vx = (dx / dist) * this.speed * dt;
    const vy = (dy / dist) * this.speed * dt;
    
    this.pos.x += vx;
    this.pos.y += vy;
    
    return true;
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.beginPath();
    ctx.strokeStyle = COLORS.interceptor;
    ctx.lineWidth = 2; // Doubled thickness
    ctx.moveTo(this.start.x, this.start.y);
    ctx.lineTo(this.pos.x, this.pos.y);
    ctx.stroke();
    
    // Pixel Cat Head
    drawPixelArt(ctx, this.pos.x, this.pos.y, 15, CAT_GRID, COLORS.interceptor);

    // Target marker
    ctx.strokeStyle = COLORS.target;
    ctx.beginPath();
    const s = 6;
    ctx.moveTo(this.target.x - s, this.target.y - s);
    ctx.lineTo(this.target.x + s, this.target.y + s);
    ctx.moveTo(this.target.x + s, this.target.y - s);
    ctx.lineTo(this.target.x - s, this.target.y + s);
    ctx.stroke();
  }
}

class Explosion implements Entity {
  pos: Point;
  radius: number = 0;
  maxRadius: number = 45;
  growing: boolean = true;
  speed: number = 60;

  constructor(pos: Point) {
    this.pos = { ...pos };
  }

  update(dt: number): boolean {
    if (this.growing) {
      this.radius += this.speed * dt;
      if (this.radius >= this.maxRadius) {
        this.growing = false;
      }
    } else {
      this.radius -= (this.speed * 0.6) * dt;
    }
    return this.radius > 0;
  }

  draw(ctx: CanvasRenderingContext2D) {
    const alpha = Math.max(0, Math.min(1, this.radius / this.maxRadius));
    ctx.beginPath();
    // Square explosion for pixel feel
    const s = this.radius * 1.5;
    ctx.fillStyle = `rgba(200, 200, 200, ${alpha * 0.8})`;
    ctx.fillRect(this.pos.x - s/2, this.pos.y - s/2, s, s);
    
    const s2 = this.radius * 0.8;
    ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.5})`;
    ctx.fillRect(this.pos.x - s2/2, this.pos.y - s2/2, s2, s2);
  }
}

// --- Main Component ---

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [lang, setLang] = useState<'en' | 'zh'>('zh');
  const [status, setStatus] = useState<GameStatus>(GameStatus.START);
  const [score, setScore] = useState(0);
  const [round, setRound] = useState(1);
  const [ammo, setAmmo] = useState([...INITIAL_AMMO]);
  const [cities, setCities] = useState(new Array(6).fill(true));
  const [batteries, setBatteries] = useState(new Array(3).fill(true));
  
  const t = TRANSLATIONS[lang];

  // Game state refs for the loop
  const stateRef = useRef({
    enemies: [] as EnemyRocket[],
    interceptors: [] as InterceptorMissile[],
    explosions: [] as Explosion[],
    lastTime: 0,
    spawnTimer: 0,
    enemiesToSpawn: 10,
    enemiesDestroyed: 0,
    roundActive: false,
    width: 0,
    height: 0
  });

  const initRound = useCallback(() => {
    stateRef.current.enemies = [];
    stateRef.current.interceptors = [];
    stateRef.current.explosions = [];
    stateRef.current.enemiesToSpawn = 10 + round * 5;
    stateRef.current.enemiesDestroyed = 0;
    stateRef.current.spawnTimer = 0;
    stateRef.current.roundActive = true;
    setAmmo([...INITIAL_AMMO]);
  }, [round]);

  const startGame = () => {
    setScore(0);
    setRound(1);
    setCities(new Array(6).fill(true));
    setBatteries(new Array(3).fill(true));
    setStatus(GameStatus.PLAYING);
    initRound();
  };

  const nextRound = () => {
    // Add bonus for remaining ammo
    const ammoBonus = ammo.reduce((a, b) => a + b, 0) * 5;
    setScore(s => s + ammoBonus);
    setRound(r => r + 1);
    setStatus(GameStatus.PLAYING);
    initRound();
  };

  const handleCanvasClick = (e: React.MouseEvent | React.TouchEvent) => {
    if (status !== GameStatus.PLAYING) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    let clientX, clientY;
    
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }

    const x = clientX - rect.left;
    const y = clientY - rect.top;

    // Don't fire if clicking too low
    if (y > stateRef.current.height - 60) return;

    // Find nearest battery with ammo
    const batteryPositions = [
      { x: 40, index: 0 },
      { x: stateRef.current.width / 2, index: 1 },
      { x: stateRef.current.width - 40, index: 2 }
    ];

    let bestBattery = -1;
    let minDist = Infinity;

    batteryPositions.forEach((bp, i) => {
      if (batteries[i] && ammo[i] > 0) {
        const d = Math.abs(x - bp.x);
        if (d < minDist) {
          minDist = d;
          bestBattery = i;
        }
      }
    });

    if (bestBattery !== -1) {
      const startPos = { x: batteryPositions[bestBattery].x, y: stateRef.current.height - 40 };
      stateRef.current.interceptors.push(new InterceptorMissile(startPos, { x, y }));
      
      const newAmmo = [...ammo];
      newAmmo[bestBattery]--;
      setAmmo(newAmmo);
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      const container = canvas.parentElement;
      if (container) {
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
        stateRef.current.width = canvas.width;
        stateRef.current.height = canvas.height;
      }
    };

    window.addEventListener('resize', resize);
    resize();

    let animationFrameId: number;

    const loop = (time: number) => {
      const dt = Math.min(0.1, (time - stateRef.current.lastTime) / 1000);
      stateRef.current.lastTime = time;

      // Clear
      ctx.fillStyle = COLORS.bg;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw Space Background
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 50; i++) {
        const x = (Math.sin(i * 123.45) * 0.5 + 0.5) * canvas.width;
        const y = (Math.cos(i * 678.90) * 0.5 + 0.5) * canvas.height;
        const size = (i % 3) + 1;
        ctx.fillRect(x, y, size, size);
      }
      drawPlanet(ctx, canvas.width * 0.8, canvas.height * 0.2, 40);
      drawPlanet(ctx, canvas.width * 0.15, canvas.height * 0.4, 20);

      if (status === GameStatus.PLAYING || status === GameStatus.ROUND_END) {
        // Update & Draw Entities
        stateRef.current.interceptors = stateRef.current.interceptors.filter(m => {
          const alive = m.update(dt);
          if (!alive) {
            stateRef.current.explosions.push(new Explosion(m.target));
          }
          m.draw(ctx);
          return alive;
        });

        stateRef.current.explosions = stateRef.current.explosions.filter(e => {
          const alive = e.update(dt);
          e.draw(ctx);
          
          // Collision with enemies
          stateRef.current.enemies = stateRef.current.enemies.filter(enemy => {
            const dx = enemy.pos.x - e.pos.x;
            const dy = enemy.pos.y - e.pos.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < e.radius) {
              setScore(s => s + 20);
              stateRef.current.enemiesDestroyed++;
              return false;
            }
            return true;
          });
          
          return alive;
        });

        stateRef.current.enemies = stateRef.current.enemies.filter(enemy => {
          const alive = enemy.update(dt);
          if (!alive) {
            // Hit target!
            const idx = enemy.targetIndex;
            if (idx < 6) {
              // Hit city
              setCities(prev => {
                const next = [...prev];
                next[idx] = false;
                return next;
              });
            } else {
              // Hit battery
              const bIdx = idx - 6;
              setBatteries(prev => {
                const next = [...prev];
                next[bIdx] = false;
                return next;
              });
            }
            stateRef.current.explosions.push(new Explosion(enemy.pos));
          }
          enemy.draw(ctx);
          return alive;
        });

        // Spawning
        if (status === GameStatus.PLAYING && stateRef.current.enemiesToSpawn > 0) {
          stateRef.current.spawnTimer -= dt;
          if (stateRef.current.spawnTimer <= 0) {
            // Pick a target (city or battery)
            const availableTargets: number[] = [];
            cities.forEach((alive, i) => alive && availableTargets.push(i));
            batteries.forEach((alive, i) => alive && availableTargets.push(i + 6));

            if (availableTargets.length > 0) {
              const targetIdx = availableTargets[Math.floor(Math.random() * availableTargets.length)];
              let targetX = 0;
              if (targetIdx < 6) {
                // Cities are spaced out
                const spacing = canvas.width / 9;
                const cityPositions = [spacing * 1.5, spacing * 2.5, spacing * 3.5, spacing * 5.5, spacing * 6.5, spacing * 7.5];
                targetX = cityPositions[targetIdx];
              } else {
                // Batteries
                const bIdx = targetIdx - 6;
                const bPos = [40, canvas.width / 2, canvas.width - 40];
                targetX = bPos[bIdx];
              }

              const speed = 40 + round * 10;
              stateRef.current.enemies.push(new EnemyRocket(canvas.width, canvas.height, targetX, targetIdx, speed));
              stateRef.current.enemiesToSpawn--;
              stateRef.current.spawnTimer = 1.5 - Math.min(1, round * 0.1) + Math.random();
            }
          }
        }

        // Check Round End
        if (status === GameStatus.PLAYING && stateRef.current.enemiesToSpawn === 0 && stateRef.current.enemies.length === 0) {
          setStatus(GameStatus.ROUND_END);
        }
      }

      // Draw Ground & Structures
      const groundY = canvas.height - 20;
      ctx.fillStyle = '#333';
      ctx.fillRect(0, groundY, canvas.width, 20);

      // Draw Cities
      const spacing = canvas.width / 9;
      const cityPositions = [spacing * 1.5, spacing * 2.5, spacing * 3.5, spacing * 5.5, spacing * 6.5, spacing * 7.5];
      cityPositions.forEach((x, i) => {
        if (cities[i]) {
          ctx.fillStyle = COLORS.city;
          // Pixelated buildings
          ctx.fillRect(x - 15, groundY - 20, 10, 20);
          ctx.fillRect(x - 5, groundY - 30, 10, 30);
          ctx.fillRect(x + 5, groundY - 15, 10, 15);
        } else {
          ctx.fillStyle = '#111';
          ctx.fillRect(x - 15, groundY - 5, 30, 5);
        }
      });

      // Draw Batteries
      const bPos = [40, canvas.width / 2, canvas.width - 40];
      bPos.forEach((x, i) => {
        if (batteries[i]) {
          ctx.fillStyle = COLORS.battery;
          // Pixelated battery
          ctx.fillRect(x - 20, groundY - 15, 40, 15);
          ctx.fillRect(x - 5, groundY - 25, 10, 10);
          
          // Ammo count text
          ctx.fillStyle = COLORS.text;
          ctx.font = '12px "Press Start 2P"';
          ctx.textAlign = 'center';
          ctx.fillText(ammo[i].toString(), x, groundY + 15);
        } else {
          ctx.fillStyle = '#111';
          ctx.fillRect(x - 15, groundY - 5, 30, 5);
        }
      });

      animationFrameId = requestAnimationFrame(loop);
    };

    animationFrameId = requestAnimationFrame(loop);
    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationFrameId);
    };
  }, [status, round, cities, batteries, ammo]);

  // Win/Loss Condition Checks
  useEffect(() => {
    if (status === GameStatus.PLAYING) {
      if (score >= WIN_SCORE) {
        setStatus(GameStatus.WIN);
      }
      if (batteries.every(b => !b)) {
        setStatus(GameStatus.GAME_OVER);
      }
    }
  }, [score, batteries, status]);

  return (
    <div className="relative w-full h-screen bg-[#050505] text-white font-sans overflow-hidden flex flex-col">
      {/* Header UI */}
      <div className="absolute top-0 left-0 w-full p-4 flex justify-between items-start z-10 pointer-events-none">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 bg-black/60 backdrop-blur-md px-4 py-3 rounded-none border-2 border-white/20">
            <Trophy className="w-4 h-4 text-white" />
            <span className="text-[10px] tracking-tight">{t.score}: {score}</span>
          </div>
          <div className="flex items-center gap-2 bg-black/60 backdrop-blur-md px-4 py-3 rounded-none border-2 border-white/20">
            <Target className="w-4 h-4 text-white" />
            <span className="text-[10px] tracking-tight">{t.round}: {round}</span>
          </div>
        </div>

        <div className="flex gap-2 pointer-events-auto">
          <button 
            onClick={() => setLang(l => l === 'en' ? 'zh' : 'en')}
            className="p-3 bg-white/10 hover:bg-white/20 rounded-none transition-colors backdrop-blur-md border-2 border-white/20"
          >
            <Languages className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Game Canvas */}
      <div className="flex-1 relative cursor-crosshair touch-none">
        <canvas 
          ref={canvasRef}
          onMouseDown={handleCanvasClick}
          onTouchStart={handleCanvasClick}
          className="w-full h-full block"
        />
      </div>

      {/* Overlays */}
      <AnimatePresence>
        {status === GameStatus.START && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/90 z-20 flex flex-col items-center justify-center p-6 text-center"
          >
            <motion.h1 
              initial={{ y: -20 }}
              animate={{ y: 0 }}
              className="text-4xl md:text-6xl font-black mb-8 tracking-tighter uppercase leading-tight"
            >
              {t.title}
            </motion.h1>
            <p className="text-white/60 max-w-md mb-12 text-xs leading-relaxed">
              {t.instructions}
            </p>
            <button 
              onClick={startGame}
              className="px-10 py-5 bg-white text-black font-bold text-sm rounded-none hover:bg-gray-200 transition-colors border-4 border-gray-400"
            >
              {t.start}
            </button>
          </motion.div>
        )}

        {status === GameStatus.ROUND_END && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="absolute inset-0 z-20 flex flex-col items-center justify-center p-6 bg-black/60 backdrop-blur-sm"
          >
            <div className="bg-zinc-900 border-4 border-white/20 p-10 rounded-none shadow-2xl text-center max-w-sm w-full">
              <h2 className="text-xl font-bold mb-8 uppercase tracking-tight">{t.nextRound}</h2>
              <div className="space-y-6 mb-10">
                <div className="flex justify-between items-center text-white/60 text-[10px]">
                  <span>{t.bonus}</span>
                  <span className="text-white">+{ammo.reduce((a, b) => a + b, 0) * 5}</span>
                </div>
                <div className="h-0.5 bg-white/10" />
                <div className="flex justify-between items-center text-sm font-bold">
                  <span>{t.totalScore}</span>
                  <span className="text-white">{score}</span>
                </div>
              </div>
              <button 
                onClick={nextRound}
                className="w-full py-5 bg-white text-black font-bold text-xs rounded-none hover:bg-gray-200 transition-colors border-4 border-gray-400 flex items-center justify-center gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                {t.nextRound}
              </button>
            </div>
          </motion.div>
        )}

        {(status === GameStatus.GAME_OVER || status === GameStatus.WIN) && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 bg-black/95 z-30 flex flex-col items-center justify-center p-6 text-center"
          >
            <div className={`w-20 h-20 rounded-none border-4 flex items-center justify-center mb-8 ${status === GameStatus.WIN ? 'border-white text-white' : 'border-gray-600 text-gray-600'}`}>
              {status === GameStatus.WIN ? <Shield className="w-10 h-10" /> : <AlertTriangle className="w-10 h-10" />}
            </div>
            <h2 className={`text-2xl md:text-4xl font-black mb-6 uppercase ${status === GameStatus.WIN ? 'text-white' : 'text-gray-500'}`}>
              {status === GameStatus.WIN ? t.win : t.gameOver}
            </h2>
            
            {/* Rotating Flashing Reward */}
            <motion.div
              animate={{ rotate: 360, opacity: [1, 0.5, 1] }}
              transition={{ rotate: { duration: 4, repeat: Infinity, ease: "linear" }, opacity: { duration: 0.5, repeat: Infinity } }}
              className="mb-10"
            >
              <canvas 
                width={80} 
                height={80} 
                ref={(el) => {
                  if (el) {
                    const ctx = el.getContext('2d');
                    if (ctx) {
                      ctx.clearRect(0, 0, 80, 80);
                      // Draw border
                      const grid = status === GameStatus.WIN ? FISH_GRID : BONE_GRID;
                      const color = status === GameStatus.WIN ? '#ffffff' : '#ffffff';
                      
                      // Draw shadow/border by drawing slightly larger or shifted
                      ctx.fillStyle = '#000000';
                      drawPixelArt(ctx, 42, 42, 60, grid, '#000000');
                      drawPixelArt(ctx, 38, 38, 60, grid, '#000000');
                      drawPixelArt(ctx, 40, 40, 60, grid, color);
                    }
                  }
                }}
              />
            </motion.div>

            <p className="text-white/60 max-w-md mb-10 text-[10px] leading-relaxed">
              {status === GameStatus.WIN ? t.winDesc : t.lossDesc}
            </p>
            <div className="mb-12">
              <span className="text-white/40 uppercase tracking-widest text-[8px] block mb-4">{t.totalScore}</span>
              <span className="text-4xl font-bold text-white">{score}</span>
            </div>
            <button 
              onClick={startGame}
              className="px-10 py-5 bg-white text-black font-bold text-sm rounded-none hover:bg-gray-200 transition-colors border-4 border-gray-400 flex items-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              {t.restart}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom Info Bar */}
      <div className="bg-black border-t-4 border-white/10 p-4 flex justify-center gap-8 items-center z-10">
        <div className="flex items-center gap-2 text-[8px] text-white/40 uppercase tracking-tight">
          <Info className="w-3 h-3" />
          <span>{t.instructions}</span>
        </div>
      </div>
    </div>
  );
}
