import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Enemy, Tower, Projectile, Point } from '../types';
import { TOWER_STATS } from '../constants';

interface GameCanvasProps {
  onEnemyReachedBase: () => void;
  onEnemyKilled: (reward: number) => void;
  onTowerClick: (tower: Tower) => void;
  onPlacementClick: (x: number, y: number) => void;
  onWaveCleared: () => void;
  onPathGenerated: (path: Point[]) => void;
  towers: Tower[];
  path: Point[];
  isPaused: boolean;
  isGameOver: boolean;
  gameSpeed: number;
  wave: number;
  selectedTowerType: Tower['type'] | null;
  resetTrigger: number;
}

const GRID_SIZE = 40;
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;
const BASE_X = CANVAS_WIDTH - 40;
const BASE_Y = CANVAS_HEIGHT / 2;

import { soundManager } from '../services/soundManager';

const GameCanvas: React.FC<GameCanvasProps> = ({
  onEnemyReachedBase,
  onEnemyKilled,
  onTowerClick,
  onPlacementClick,
  onWaveCleared,
  onPathGenerated,
  towers,
  path: currentPath,
  isPaused,
  isGameOver,
  gameSpeed,
  wave,
  selectedTowerType,
  resetTrigger
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [enemies, setEnemies] = useState<Enemy[]>([]);
  const [projectiles, setProjectiles] = useState<Projectile[]>([]);
  const [mousePos, setMousePos] = useState<Point | null>(null);
  const requestRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const virtualTimeRef = useRef<number>(0);
  const lastSpawnRef = useRef<number>(0);
  const spawnCountRef = useRef<number>(0);
  const waveStartTimeRef = useRef<number>(0);
  const lastParticleUpdateRef = useRef<number>(0);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [particles, setParticles] = useState<{x: number, y: number, vx: number, vy: number, life: number, color: string, size: number}[]>([]);
  const [baseHitEffect, setBaseHitEffect] = useState(0);

  // Reset wave start time when wave changes
  useEffect(() => {
    waveStartTimeRef.current = virtualTimeRef.current;
    lastSpawnRef.current = virtualTimeRef.current;
    spawnCountRef.current = 0;
    setEnemies([]); // Clear enemies on wave change
    setCurrentTime(virtualTimeRef.current);
  }, [wave]);

  // Handle manual reset/retry
  useEffect(() => {
    if (resetTrigger > 0) {
      setEnemies([]);
      spawnCountRef.current = 0;
      virtualTimeRef.current = 0;
      lastTimeRef.current = 0;
      lastSpawnRef.current = 0;
      waveStartTimeRef.current = 0;
      lastParticleUpdateRef.current = 0;
      setCurrentTime(0);
    }
  }, [resetTrigger]);

  // Generate random path ending at the World Tree
  useEffect(() => {
    const generatePath = () => {
      const newPath: Point[] = [];
      let current: Point = { x: 0, y: Math.floor(Math.random() * (CANVAS_HEIGHT / GRID_SIZE)) * GRID_SIZE + GRID_SIZE / 2 };
      newPath.push({ ...current });

      // Path length increases by 10% per wave
      const baseSegments = 10;
      const targetSegments = Math.floor(baseSegments * (1 + (wave - 1) * 0.1));
      let segments = 0;

      while (current.x < BASE_X - GRID_SIZE || segments < targetSegments) {
        const move = Math.random();
        if (move < 0.6 || current.x < 100) {
          current.x += GRID_SIZE;
        } else if (move < 0.8 && current.y > GRID_SIZE) {
          current.y -= GRID_SIZE;
        } else if (current.y < CANVAS_HEIGHT - GRID_SIZE) {
          current.y += GRID_SIZE;
        }
        newPath.push({ ...current });
        segments++;
        
        // Safety break to prevent infinite loops if path gets stuck
        if (segments > 100) break;
      }
      // Final segment to reach the World Tree
      newPath.push({ x: BASE_X, y: BASE_Y });
      onPathGenerated(newPath);
    };
    generatePath();
  }, [wave, onPathGenerated]); // Regenerate path on wave change

  const spawnEnemy = useCallback(() => {
    if (currentPath.length === 0) return;
    
    // Enemy types pool increases by 1 per wave
    const availableTypes = ['basic', 'fast', 'tank', 'shield', 'jammer', 'sprayer', 'titan'];
    const maxTypeIndex = Math.min(wave, availableTypes.length);
    const typePool = availableTypes.slice(0, maxTypeIndex);
    
    // Boss wave every 5 waves
    const isBossWave = wave % 5 === 0;
    const isLastEnemyInWave = spawnCountRef.current === (20 + (wave - 1) * 5) - 1;
    
    let enemyType = typePool[Math.floor(Math.random() * typePool.length)];
    let isBoss = false;

    if (isBossWave && isLastEnemyInWave) {
      enemyType = 'titan';
      isBoss = true;
    }

    const multiplier = wave === 1 ? 0.6 : 1 + (wave - 1) * 0.15;
    const speedMultiplier = wave === 1 ? 0.7 : 1 + (wave - 1) * 0.15;
    
    let baseHealth = 65;
    let baseSpeed = 0.75;
    let reward = 8;

    switch(enemyType) {
      case 'fast': baseHealth = 39; baseSpeed = 1.25; reward = 10; break;
      case 'tank': baseHealth = 195; baseSpeed = 0.4; reward = 20; break;
      case 'shield': baseHealth = 260; baseSpeed = 0.5; reward = 25; break;
      case 'jammer': baseHealth = 104; baseSpeed = 0.8; reward = 30; break;
      case 'sprayer': baseHealth = 130; baseSpeed = 0.6; reward = 35; break;
      case 'titan': baseHealth = 1300; baseSpeed = 0.3; reward = 125; break;
    }

    if (isBoss) {
      baseHealth *= 2;
      reward *= 2;
    }

    const newEnemy: Enemy = {
      id: Math.random().toString(36).substr(2, 9),
      x: currentPath[0].x,
      y: currentPath[0].y,
      pathIndex: 0,
      health: baseHealth * multiplier,
      maxHealth: baseHealth * multiplier,
      speed: baseSpeed * speedMultiplier,
      type: enemyType as any,
      reward: reward,
      isBoss: isBoss,
    };
    setEnemies(prev => [...prev, newEnemy]);
  }, [currentPath, wave]);

  const handleCanvasClick = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    // Check if clicked on a tower
    const clickedTower = towers.find(t => {
      const dx = t.x - x;
      const dy = t.y - y;
      return Math.sqrt(dx * dx + dy * dy) < 20;
    });

    if (clickedTower) {
      onTowerClick(clickedTower);
    } else {
      onPlacementClick(x, y);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    setMousePos({
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    });
  };

  const handlePointerLeave = () => {
    setMousePos(null);
  };

  const update = useCallback((time: number) => {
    if (lastTimeRef.current === 0) lastTimeRef.current = time;
    const dt = time - lastTimeRef.current;
    lastTimeRef.current = time;

    if (isPaused || isGameOver) {
      requestRef.current = requestAnimationFrame(update);
      return;
    }

    const effectiveDt = dt * gameSpeed;
    virtualTimeRef.current += effectiveDt;
    const virtualTime = virtualTimeRef.current;
    setCurrentTime(virtualTime);

    // Update Particles
    setParticles(prev => prev.map(p => ({
      ...p,
      x: p.x + p.vx * gameSpeed,
      y: p.y + p.vy * gameSpeed,
      life: p.life - 0.02 * gameSpeed
    })).filter(p => p.life > 0));

    // Ambient particles for World Tree
    if (virtualTime - lastParticleUpdateRef.current > 100) {
      setParticles(prev => [
        ...prev,
        {
          x: BASE_X + (Math.random() - 0.5) * 60,
          y: BASE_Y + (Math.random() - 0.5) * 60,
          vx: (Math.random() - 0.5) * 0.5,
          vy: -Math.random() * 1,
          life: 1,
          color: '#10b981',
          size: Math.random() * 3 + 1
        }
      ]);
      lastParticleUpdateRef.current = virtualTime;
    }

    // Spawn enemies - 20 + 5 per wave
    const totalEnemies = 20 + (wave - 1) * 5;
    const waveDelay = 3000; // 3 seconds delay
    const isWaveStarting = virtualTime < waveStartTimeRef.current + waveDelay;

    if (!isWaveStarting && virtualTime - lastSpawnRef.current > 2000 / (1 + wave * 0.1) && spawnCountRef.current < totalEnemies) {
      spawnEnemy();
      lastSpawnRef.current = virtualTime;
      spawnCountRef.current++;
    }

    // Reset spawn count for next wave if all enemies are gone
    if (enemies.length === 0 && spawnCountRef.current >= totalEnemies) {
      onWaveCleared();
      spawnCountRef.current = 0;
      waveStartTimeRef.current = virtualTime;
    }

    setEnemies(prevEnemies => {
      const nextEnemies: Enemy[] = [];
      prevEnemies.forEach(enemy => {
        const target = currentPath[enemy.pathIndex + 1];
        if (!target) {
          onEnemyReachedBase();
          soundManager.playBaseHit();
          setBaseHitEffect(15); // Shake intensity
          return;
        }

        const dx = target.x - enemy.x;
        const dy = target.y - enemy.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const moveDist = enemy.speed * gameSpeed;

        if (dist < moveDist) {
          enemy.x = target.x;
          enemy.y = target.y;
          enemy.pathIndex++;
        } else {
          enemy.x += (dx / dist) * moveDist;
          enemy.y += (dy / dist) * moveDist;
          // Play subtle movement sound occasionally
          if (Math.random() < 0.005) soundManager.playStep();
        }

        if (enemy.health > 0) {
          nextEnemies.push(enemy);
        } else {
          onEnemyKilled(enemy.reward);
          soundManager.playExplosion();
        }
      });
      return nextEnemies;
    });

    // Tower firing logic
    towers.forEach(tower => {
      // Check if tower is disabled
      if (tower.disabledUntil && virtualTime < tower.disabledUntil) return;

      if (virtualTime - tower.lastFired > (TOWER_STATS[tower.type].fireRate || 1000)) {
        const inRange = enemies.find(e => {
          const dx = e.x - tower.x;
          const dy = e.y - tower.y;
          return Math.sqrt(dx * dx + dy * dy) < (TOWER_STATS[tower.type].range || 100);
        });

        if (inRange) {
          setProjectiles(prev => [...prev, {
            id: Math.random().toString(36).substr(2, 9),
            x: tower.x,
            y: tower.y,
            targetId: inRange.id,
            damage: TOWER_STATS[tower.type].damage || 10,
            speed: 5
          }]);
          tower.lastFired = virtualTime;
          soundManager.playFire(tower.type);
        }
      }
    });

    // Enemy abilities logic
    enemies.forEach(enemy => {
      if (enemy.type === 'jammer') {
        // Disable nearby towers
        towers.forEach(tower => {
          const dx = tower.x - enemy.x;
          const dy = tower.y - enemy.y;
          if (Math.sqrt(dx * dx + dy * dy) < 80) {
            tower.disabledUntil = virtualTime + 1000; // Disable for 1 second
          }
        });
      } else if (enemy.type === 'sprayer') {
        // Disable towers in a larger range but less frequently
        if (Math.random() < 0.01) {
          towers.forEach(tower => {
            const dx = tower.x - enemy.x;
            const dy = tower.y - enemy.y;
            if (Math.sqrt(dx * dx + dy * dy) < 150) {
              tower.disabledUntil = virtualTime + 2000; // Disable for 2 seconds
            }
          });
        }
      }
    });

    // Projectile movement and collision
    setProjectiles(prevProjectiles => {
      const nextProjectiles: Projectile[] = [];
      prevProjectiles.forEach(p => {
        const target = enemies.find(e => e.id === p.targetId);
        if (!target) return;

        const dx = target.x - p.x;
        const dy = target.y - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const moveDist = p.speed * gameSpeed;

        if (dist < moveDist) {
          target.health -= p.damage;
        } else {
          p.x += (dx / dist) * moveDist;
          p.y += (dy / dist) * moveDist;
          nextProjectiles.push(p);
        }
      });
      return nextProjectiles;
    });

    // Update base hit effect
    if (baseHitEffect > 0) {
      setBaseHitEffect(prev => Math.max(0, prev - 0.5 * gameSpeed));
    }

    requestRef.current = requestAnimationFrame(update);
  }, [isPaused, isGameOver, gameSpeed, currentPath, enemies, towers, wave, spawnEnemy, onEnemyReachedBase, onEnemyKilled, baseHitEffect]);

  useEffect(() => {
    requestRef.current = requestAnimationFrame(update);
    return () => cancelAnimationFrame(requestRef.current);
  }, [update]);

  // Reset spawn count when wave changes
  useEffect(() => {
    spawnCountRef.current = 0;
  }, [wave]);

  // Rendering
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Draw Background
    const bgGradient = ctx.createRadialGradient(CANVAS_WIDTH/2, CANVAS_HEIGHT/2, 0, CANVAS_WIDTH/2, CANVAS_HEIGHT/2, CANVAS_WIDTH);
    bgGradient.addColorStop(0, '#0f172a');
    bgGradient.addColorStop(1, '#020617');
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Draw Grid (Subtle)
    ctx.strokeStyle = 'rgba(30, 41, 59, 0.5)';
    ctx.lineWidth = 1;
    for (let x = 0; x < CANVAS_WIDTH; x += GRID_SIZE) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, CANVAS_HEIGHT); ctx.stroke();
    }
    for (let y = 0; y < CANVAS_HEIGHT; y += GRID_SIZE) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CANVAS_WIDTH, y); ctx.stroke();
    }

    // Draw Path
    ctx.shadowBlur = 15;
    ctx.shadowColor = 'rgba(139, 69, 19, 0.3)';
    ctx.strokeStyle = '#2d1b0d';
    ctx.lineWidth = GRID_SIZE + 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    currentPath.forEach((p, i) => {
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();

    ctx.strokeStyle = '#4a2c16';
    ctx.lineWidth = GRID_SIZE;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Draw World Tree (Base)
    const drawWorldTree = (x: number, y: number) => {
      ctx.save();
      
      const time = currentTime / 1000;
      const pulse = Math.sin(time * 2) * 0.1 + 1;
      
      // Apply shake effect
      if (baseHitEffect > 0) {
        const shakeX = (Math.random() - 0.5) * baseHitEffect;
        const shakeY = (Math.random() - 0.5) * baseHitEffect;
        ctx.translate(x + shakeX, y + shakeY);
      } else {
        ctx.translate(x, y);
      }
      
      // Ambient Glow - More intense
      const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, 100);
      glow.addColorStop(0, baseHitEffect > 5 ? 'rgba(239, 68, 68, 0.6)' : 'rgba(16, 185, 129, 0.4)');
      glow.addColorStop(0.6, 'rgba(16, 185, 129, 0.1)');
      glow.addColorStop(1, 'rgba(16, 185, 129, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(0, 0, 100, 0, Math.PI * 2); ctx.fill();

      // Roots (Detailed & Shaded)
      ctx.strokeStyle = '#3d2b1f';
      ctx.lineWidth = 6;
      for(let i=0; i<8; i++) {
        ctx.beginPath();
        ctx.moveTo(0, 20);
        const angle = (Math.PI / 4) * i + Math.sin(time * 0.5) * 0.1;
        ctx.quadraticCurveTo(Math.cos(angle) * 40, 50, Math.cos(angle) * 70, 55);
        ctx.stroke();
        // Root texture
        ctx.strokeStyle = '#2d1f1f';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, 20);
        ctx.quadraticCurveTo(Math.cos(angle) * 35, 45, Math.cos(angle) * 65, 50);
        ctx.stroke();
        ctx.strokeStyle = '#3d2b1f';
        ctx.lineWidth = 6;
      }

      // Trunk (Detailed Shading & Runes)
      const trunkGrad = ctx.createLinearGradient(-20, 0, 20, 0);
      trunkGrad.addColorStop(0, '#2d1f1f');
      trunkGrad.addColorStop(0.5, '#5d3a1a');
      trunkGrad.addColorStop(1, '#2d1f1f');
      ctx.fillStyle = baseHitEffect > 5 ? '#ef4444' : trunkGrad;
      
      ctx.beginPath();
      ctx.moveTo(-20, 50);
      ctx.quadraticCurveTo(-10, 10, -25, -40);
      ctx.lineTo(25, -40);
      ctx.quadraticCurveTo(10, 10, 20, 50);
      ctx.fill();

      // Glowing Runes - More complex
      if (baseHitEffect <= 5) {
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#34d399';
        ctx.strokeStyle = `rgba(52, 211, 153, ${0.4 + Math.sin(time * 4) * 0.3})`;
        ctx.lineWidth = 2;
        for(let i=0; i<3; i++) {
          ctx.beginPath();
          ctx.moveTo(-8, 30 - i * 25);
          ctx.lineTo(8, 20 - i * 25);
          ctx.lineTo(-8, 10 - i * 25);
          ctx.stroke();
        }
        ctx.shadowBlur = 0;
      }

      // Foliage Layers (Rich & Animated)
      const drawFoliageLayer = (r: number, color: string, ox: number, oy: number, phase: number) => {
        const scale = 1 + Math.sin(time * 1.5 + phase) * 0.05;
        const grad = ctx.createRadialGradient(ox, oy, 0, ox, oy, r);
        grad.addColorStop(0, color);
        grad.addColorStop(0.8, color);
        grad.addColorStop(1, '#064e3b');
        
        ctx.fillStyle = baseHitEffect > 5 ? '#ef4444' : grad;
        ctx.beginPath();
        ctx.arc(ox, oy, r * scale, 0, Math.PI * 2);
        ctx.fill();
        
        // Leaf Highlights
        ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
        for(let i=0; i<5; i++) {
          const la = (Math.PI * 2 / 5) * i + time * 0.3;
          ctx.beginPath();
          ctx.ellipse(ox + Math.cos(la) * r * 0.5, oy + Math.sin(la) * r * 0.5, r * 0.2, r * 0.1, la, 0, Math.PI * 2);
          ctx.fill();
        }
      };

      drawFoliageLayer(55, '#065f46', 0, -60, 0);
      drawFoliageLayer(50, '#059669', -40, -40, 1);
      drawFoliageLayer(50, '#059669', 40, -40, 2);
      drawFoliageLayer(45, '#10b981', 0, -90, 3);
      
      // Floating Magic Particles
      for(let i=0; i<10; i++) {
        const pTime = time * 0.4 + i * (Math.PI * 2 / 10);
        const px = Math.sin(pTime) * (80 + Math.sin(time) * 15);
        const py = -60 + Math.cos(pTime * 1.5) * 60;
        ctx.fillStyle = `rgba(52, 211, 153, ${0.5 + Math.sin(time + i) * 0.4})`;
        ctx.shadowBlur = 8;
        ctx.shadowColor = '#34d399';
        ctx.beginPath(); ctx.arc(px, py, 2.5, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
      }

      // Magic Core (Pulsing & Energy Rings)
      const coreY = -30;
      ctx.shadowBlur = 30 * pulse;
      ctx.shadowColor = baseHitEffect > 5 ? '#ef4444' : '#34d399';
      ctx.fillStyle = baseHitEffect > 5 ? '#fca5a5' : '#ecfdf5';
      ctx.beginPath(); ctx.arc(0, coreY, 12 * pulse, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;

      // Rotating Energy Rings
      ctx.lineWidth = 2;
      for(let i=0; i<2; i++) {
        ctx.save();
        ctx.translate(0, coreY);
        ctx.rotate(time * (i === 0 ? 1.2 : -0.8));
        ctx.scale(1, 0.4);
        ctx.strokeStyle = i === 0 ? 'rgba(52, 211, 153, 0.6)' : 'rgba(16, 185, 129, 0.4)';
        ctx.beginPath(); ctx.arc(0, 0, 30 + i * 15, 0, Math.PI * 2); ctx.stroke();
        // Energy nodes
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(30 + i * 15, 0, 3, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }

      // Damage Flash Overlay
      if (baseHitEffect > 0) {
        ctx.fillStyle = `rgba(239, 68, 68, ${baseHitEffect / 30})`;
        ctx.beginPath(); ctx.arc(0, coreY, 130, 0, Math.PI * 2); ctx.fill();
      }

      ctx.restore();
    };
    drawWorldTree(BASE_X, BASE_Y);

    // Draw Towers
    towers.forEach(t => {
      ctx.save();
      ctx.translate(t.x, t.y);

      const isDisabled = t.disabledUntil && currentTime < t.disabledUntil;
      const level = t.level;
      const timeOffset = currentTime / 1000;
      const towerPulse = 1 + Math.sin(timeOffset * 3) * 0.05;

      // Base Platform - Mechanical & Detailed
      const baseGrad = ctx.createRadialGradient(0, 15, 0, 0, 15, 25 + level * 2);
      baseGrad.addColorStop(0, isDisabled ? '#475569' : '#334155');
      baseGrad.addColorStop(1, isDisabled ? '#1e293b' : '#0f172a');
      
      ctx.fillStyle = baseGrad;
      ctx.strokeStyle = isDisabled ? '#64748b' : '#334155';
      ctx.lineWidth = 2;
      ctx.beginPath(); 
      ctx.ellipse(0, 15, 24 + level * 2, 14 + level, 0, 0, Math.PI * 2); 
      ctx.fill(); 
      ctx.stroke();

      // Mechanical Bolts on Base
      ctx.fillStyle = '#94a3b8';
      for(let i=0; i<6; i++) {
        const ba = (Math.PI * 2 / 6) * i;
        ctx.beginPath();
        ctx.arc(Math.cos(ba) * 20, 15 + Math.sin(ba) * 10, 2, 0, Math.PI * 2);
        ctx.fill();
      }

      // Tower Body & Head
      let mainColor = '#10b981';
      let accentColor = '#34d399';
      let glowColor = 'rgba(52, 211, 153, 0.5)';
      
      if (t.type === 'root') { mainColor = '#8b5e3c'; accentColor = '#f59e0b'; glowColor = 'rgba(245, 158, 11, 0.5)'; }
      if (t.type === 'stem') { mainColor = '#059669'; accentColor = '#34d399'; glowColor = 'rgba(52, 211, 153, 0.5)'; }
      if (t.type === 'leaf') { mainColor = '#0d9488'; accentColor = '#2dd4bf'; glowColor = 'rgba(45, 212, 191, 0.5)'; }
      if (t.type === 'flower') { mainColor = '#db2777'; accentColor = '#f472b6'; glowColor = 'rgba(244, 114, 182, 0.5)'; }

      if (isDisabled) {
        mainColor = '#64748b';
        accentColor = '#94a3b8';
        glowColor = 'transparent';
      }

      // Draw specific tower designs
      if (t.type === 'root') {
        // Root Tower: Earthy, strong, crystalline
        // Trunk with texture
        ctx.fillStyle = mainColor;
        ctx.beginPath();
        ctx.moveTo(-10 - level, 15);
        ctx.quadraticCurveTo(0, 0, -6 - level, -15 - level * 4);
        ctx.lineTo(6 + level, -15 - level * 4);
        ctx.quadraticCurveTo(0, 0, 10 + level, 15);
        ctx.fill();
        
        // Glowing Veins
        if (!isDisabled) {
          ctx.strokeStyle = accentColor;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(0, 10);
          ctx.lineTo(0, -10);
          ctx.stroke();
        }

        // Roots spreading out
        ctx.strokeStyle = mainColor;
        ctx.lineWidth = 3 + level;
        for(let i=0; i<4 + level; i++) {
          ctx.beginPath();
          ctx.moveTo(0, 10);
          const angle = (Math.PI / (3 + level)) * i - Math.PI/2;
          ctx.quadraticCurveTo(Math.cos(angle) * 10, 12, Math.cos(angle) * (20 + level * 5), 15 + Math.sin(angle) * 8);
          ctx.stroke();
        }

        // Crystal Head - Faceted
        const headY = -20 - level * 5;
        const headSize = 12 + level * 3;
        const crystalGrad = ctx.createRadialGradient(0, headY, 0, 0, headY, headSize);
        crystalGrad.addColorStop(0, '#fff');
        crystalGrad.addColorStop(0.5, accentColor);
        crystalGrad.addColorStop(1, mainColor);
        
        ctx.fillStyle = crystalGrad;
        ctx.shadowBlur = isDisabled ? 0 : 15 + level * 5;
        ctx.shadowColor = accentColor;
        
        ctx.beginPath();
        ctx.moveTo(0, headY - headSize);
        ctx.lineTo(headSize, headY);
        ctx.lineTo(0, headY + headSize);
        ctx.lineTo(-headSize, headY);
        ctx.closePath();
        ctx.fill();
        
        // Internal facets
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, headY - headSize); ctx.lineTo(0, headY + headSize); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-headSize, headY); ctx.lineTo(headSize, headY); ctx.stroke();
        
        ctx.shadowBlur = 0;

      } else if (t.type === 'stem') {
        // Stem Tower: Mechanical, multi-barreled
        const barrelCount = Math.min(4, level + 1);
        const bodyWidth = 14 + level * 2;
        
        // Main Stalk - Mechanical look
        ctx.fillStyle = '#334155';
        ctx.beginPath();
        ctx.roundRect(-bodyWidth/2, -15 - level * 5, bodyWidth, 30, 4);
        ctx.fill();
        ctx.strokeStyle = mainColor;
        ctx.lineWidth = 2;
        ctx.stroke();

        // Barrels with recoil animation (subtle pulse)
        ctx.fillStyle = accentColor;
        for(let i=0; i<barrelCount; i++) {
          const offsetX = (i - (barrelCount-1)/2) * 14;
          const recoil = Math.sin(timeOffset * 10 + i) * 2;
          ctx.save();
          ctx.translate(offsetX, recoil);
          ctx.beginPath();
          ctx.roundRect(-5, -30 - level * 5, 10, 25 + level * 2, 3);
          ctx.fill();
          // Barrel details
          ctx.strokeStyle = 'rgba(0,0,0,0.2)';
          ctx.stroke();
          // Muzzle glow
          if (!isDisabled) {
            ctx.shadowBlur = 10;
            ctx.shadowColor = '#fff';
            ctx.fillStyle = '#fff';
            ctx.beginPath(); ctx.arc(0, -30 - level * 5, 3, 0, Math.PI * 2); ctx.fill();
            ctx.shadowBlur = 0;
          }
          ctx.restore();
        }

      } else if (t.type === 'leaf') {
        // Leaf Tower: Sharp, fan-like, vibrating
        // Central Hub
        ctx.fillStyle = '#1e293b';
        ctx.beginPath(); ctx.arc(0, 0, 8 + level, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = mainColor;
        ctx.stroke();

        const leafCount = 3 + level;
        for(let i=0; i<leafCount; i++) {
          ctx.save();
          const baseAngle = (Math.PI * 2 / leafCount) * i;
          const vibration = Math.sin(timeOffset * 20 + i) * 0.05;
          ctx.rotate(baseAngle + vibration);
          
          // Leaf Blade
          const leafGrad = ctx.createLinearGradient(0, 0, 30 + level * 5, 0);
          leafGrad.addColorStop(0, mainColor);
          leafGrad.addColorStop(1, accentColor);
          ctx.fillStyle = leafGrad;
          
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.quadraticCurveTo(15 + level * 2, -10 - level, 35 + level * 6, 0);
          ctx.quadraticCurveTo(15 + level * 2, 10 + level, 0, 0);
          ctx.fill();
          
          // Blade Edge
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 1;
          ctx.globalAlpha = 0.3;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.quadraticCurveTo(15 + level * 2, -10 - level, 35 + level * 6, 0);
          ctx.stroke();
          ctx.globalAlpha = 1;
          
          ctx.restore();
        }

      } else if (t.type === 'flower') {
        // Flower Tower: Exotic, layered, beam-emitter
        // Stalk with glowing thorns
        ctx.beginPath();
        ctx.moveTo(0, 15);
        ctx.quadraticCurveTo(15 * Math.sin(timeOffset), 0, 0, -20 - level * 3);
        ctx.strokeStyle = mainColor;
        ctx.lineWidth = 4 + level;
        ctx.stroke();

        // Petals - Layered and Animated
        ctx.save();
        ctx.translate(0, -20 - level * 3);
        const petals = 6 + level;
        const rotation = timeOffset * (0.8 + level * 0.1);
        ctx.rotate(rotation);
        
        for(let layer=0; layer < 2; layer++) {
          const layerScale = 1 - layer * 0.4;
          const petalPulse = 1 + Math.sin(timeOffset * 4 + layer) * 0.1;
          ctx.fillStyle = layer === 0 ? mainColor : accentColor;
          for(let i=0; i<petals; i++) {
            ctx.save();
            ctx.rotate((Math.PI * 2 / petals) * i);
            ctx.beginPath();
            ctx.ellipse(15 + level * 2, 0, (12 + level * 4) * layerScale * petalPulse, (6 + level) * layerScale, 0, 0, Math.PI * 2);
            ctx.fill();
            // Petal Vein
            ctx.strokeStyle = 'rgba(255,255,255,0.2)';
            ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(20, 0); ctx.stroke();
            ctx.restore();
          }
        }

        // Core Emitter - Flashy
        ctx.shadowBlur = 25;
        ctx.shadowColor = '#fff';
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(0, 0, 6 + level * towerPulse, 0, Math.PI * 2); ctx.fill();
        
        // Energy Flares
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 2;
        for(let i=0; i<4; i++) {
          ctx.rotate(Math.PI / 2);
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(15 + level * 5, 0); ctx.stroke();
        }
        ctx.restore();
      }

      // Level Indicator - Stylish Orbs
      for(let i=0; i<level; i++) {
        const orbX = -18 + i * 12;
        const orbY = 32 + level;
        ctx.shadowBlur = 5;
        ctx.shadowColor = '#fbbf24';
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath(); ctx.arc(orbX, orbY, 4, 0, Math.PI * 2); ctx.fill();
        // Orb highlight
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(orbX - 1, orbY - 1, 1.5, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
      }

      // Range indicator (Subtle)
      ctx.restore();
      ctx.strokeStyle = isDisabled ? 'rgba(255, 255, 255, 0.02)' : 'rgba(255, 255, 255, 0.08)';
      ctx.setLineDash([2, 4]);
      ctx.beginPath(); ctx.arc(t.x, t.y, t.range, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    });

    // Draw Preview Tower
    if (selectedTowerType && mousePos) {
      const stats = TOWER_STATS[selectedTowerType];
      const isOnPath = currentPath.some(p => Math.sqrt((p.x - mousePos.x)**2 + (p.y - mousePos.y)**2) < 25);
      const isOnTower = towers.some(t => Math.sqrt((t.x - mousePos.x)**2 + (t.y - mousePos.y)**2) < 30);
      const isValid = !isOnPath && !isOnTower;

      ctx.save();
      ctx.globalAlpha = 0.4;
      ctx.translate(mousePos.x, mousePos.y);
      ctx.fillStyle = isValid ? '#10b981' : '#ef4444';
      ctx.beginPath(); ctx.arc(0, 0, 20, 0, Math.PI * 2); ctx.fill();
      
      ctx.restore();
      ctx.strokeStyle = isValid ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)';
      ctx.setLineDash([5, 5]);
      ctx.beginPath(); ctx.arc(mousePos.x, mousePos.y, stats.range || 100, 0, Math.PI * 2); ctx.stroke();
    }

    // Draw Enemies (Mechanical Insects)
    enemies.forEach(e => {
      ctx.save();
      ctx.translate(e.x, e.y);
      
      const time = currentTime / 1000;
      const moveAnim = Math.sin(time * 10) * 2;
      const wingAnim = Math.sin(time * 35) * 0.6;
      const pulse = 1 + Math.sin(time * 5) * 0.05;
      
      let bodyColor = '#64748b';
      let accentColor = '#94a3b8';
      let eyeColor = '#ef4444';
      let size = 12;

      // Cartoon Eye Helper
      const drawCartoonEyes = (ex: number, ey: number, s: number) => {
        ctx.shadowBlur = 10;
        ctx.shadowColor = eyeColor;
        // White part
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(ex, ey - 3, s, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(ex, ey + 3, s, 0, Math.PI * 2); ctx.fill();
        // Pupil
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.arc(ex + s*0.3, ey - 3, s*0.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(ex + s*0.3, ey + 3, s*0.5, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
      };

      // Determine Insect Type Design
      const drawInsect = () => {
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = '#0f172a';
        ctx.lineJoin = 'round';

        if (e.type === 'fast') {
          // Dragonfly Style - Cute & Sleek
          size = 10;
          bodyColor = '#38bdf8';
          accentColor = '#0ea5e9';
          
          // Wings (Animated) - Iridescent effect
          for(let i=0; i<4; i++) {
            ctx.save();
            ctx.rotate((Math.PI/2) * i + wingAnim * (i < 2 ? 1 : -1));
            const wingGrad = ctx.createLinearGradient(0, 0, 20, 0);
            wingGrad.addColorStop(0, 'rgba(255, 255, 255, 0.6)');
            wingGrad.addColorStop(1, 'rgba(56, 189, 248, 0.2)');
            ctx.fillStyle = wingGrad;
            ctx.beginPath(); ctx.ellipse(18, 0, 15, 5, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            ctx.restore();
          }
          // Body - Segments
          ctx.fillStyle = bodyColor;
          ctx.beginPath(); ctx.ellipse(0, 0, 14, 5, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          // Tail with stripes
          ctx.fillStyle = accentColor;
          ctx.beginPath(); ctx.roundRect(-22, -2.5, 12, 5, 2.5); ctx.fill(); ctx.stroke();
          drawCartoonEyes(10, 0, 4);
        } 
        else if (e.type === 'tank' || e.type === 'titan') {
          // Beetle Style - Heavy & Cartoonish
          size = e.type === 'titan' ? 32 : 20;
          bodyColor = e.type === 'titan' ? '#1e293b' : '#334155';
          accentColor = '#475569';
          
          // Legs - Chunky
          ctx.strokeStyle = bodyColor;
          ctx.lineWidth = 4;
          for(let i=0; i<6; i++) {
            ctx.save();
            const angle = (Math.PI / 3) * i + moveAnim * 0.15;
            ctx.rotate(angle);
            ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(size + 8, 0); ctx.stroke();
            ctx.restore();
          }
          // Shell - Glossy
          const shellGrad = ctx.createRadialGradient(-size/2, -size/2, 0, 0, 0, size);
          shellGrad.addColorStop(0, '#64748b');
          shellGrad.addColorStop(1, bodyColor);
          ctx.fillStyle = shellGrad;
          ctx.beginPath(); ctx.arc(0, 0, size, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          // Shell Split
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(0, -size); ctx.lineTo(0, size); ctx.stroke();
          // Horns - Big & Bold
          ctx.fillStyle = bodyColor;
          ctx.beginPath();
          ctx.moveTo(size-5, -8); ctx.quadraticCurveTo(size+20, -15, size+15, -25);
          ctx.lineTo(size+10, -20); ctx.quadraticCurveTo(size+15, -10, size-5, -5);
          ctx.fill(); ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(size-5, 8); ctx.quadraticCurveTo(size+20, 15, size+15, 25);
          ctx.lineTo(size+10, 20); ctx.quadraticCurveTo(size+15, 10, size-5, 5);
          ctx.fill(); ctx.stroke();
          
          drawCartoonEyes(size-8, 0, size/5);
        }
        else if (e.type === 'shield') {
          // Ladybug/Shield Beetle Style
          size = 18;
          bodyColor = '#475569';
          eyeColor = '#38bdf8';
          
          // Shield Aura - Pulsing Hexagons
          ctx.save();
          ctx.rotate(time);
          ctx.strokeStyle = 'rgba(56, 189, 248, 0.3)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          for(let i=0; i<6; i++) {
            const a = (Math.PI / 3) * i;
            const r = size + 12 + Math.sin(time*4)*3;
            ctx.lineTo(Math.cos(a)*r, Math.sin(a)*r);
          }
          ctx.closePath(); ctx.stroke();
          ctx.restore();
          
          // Body - Round & Cute
          ctx.fillStyle = bodyColor;
          ctx.beginPath(); ctx.arc(0, 0, size, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          // Pattern
          ctx.fillStyle = '#1e293b';
          for(let i=0; i<3; i++) {
            const a = (Math.PI * 2 / 3) * i + time;
            ctx.beginPath(); ctx.arc(Math.cos(a)*10, Math.sin(a)*10, 4, 0, Math.PI * 2); ctx.fill();
          }
          drawCartoonEyes(size-6, 0, 5);
        }
        else if (e.type === 'jammer' || e.type === 'sprayer') {
          // Wasp/Bee Style - Vibrant
          size = 16;
          bodyColor = e.type === 'jammer' ? '#7c3aed' : '#059669';
          accentColor = '#fde047';
          
          // Wings (Fast Animation)
          ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
          ctx.save(); ctx.rotate(wingAnim * 2.5);
          ctx.beginPath(); ctx.ellipse(0, -12, 18, 7, Math.PI/4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          ctx.beginPath(); ctx.ellipse(0, -12, 18, 7, -Math.PI/4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          ctx.restore();

          // Body Segments - Striped
          ctx.fillStyle = bodyColor;
          ctx.beginPath(); ctx.ellipse(-10, 0, 10, 8, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          ctx.fillStyle = accentColor;
          ctx.beginPath(); ctx.ellipse(4, 0, 12, 10, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          // Stripes
          ctx.strokeStyle = '#000';
          ctx.lineWidth = 3;
          ctx.beginPath(); ctx.moveTo(4, -10); ctx.lineTo(4, 10); ctx.stroke();
          // Stinger
          ctx.fillStyle = '#000';
          ctx.beginPath(); ctx.moveTo(-20, 0); ctx.lineTo(-28, 0); ctx.lineTo(-20, 4); ctx.fill();
          
          drawCartoonEyes(12, 0, 5);
        }
        else {
          // Basic Ant Style - Cute
          size = 14;
          bodyColor = '#64748b';
          
          // Legs
          ctx.strokeStyle = bodyColor;
          ctx.lineWidth = 3;
          for(let i=0; i<6; i++) {
            const side = i < 3 ? 1 : -1;
            const phase = (i % 3) * (Math.PI / 2);
            const legAnim = Math.sin(time * 18 + phase) * 6;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(side * 18, -8 + (i%3)*8 + legAnim);
            ctx.stroke();
          }
          // Segments - Bubbly
          ctx.fillStyle = bodyColor;
          ctx.beginPath(); ctx.arc(-10, 0, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          ctx.beginPath(); ctx.arc(10, 0, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          
          drawCartoonEyes(14, 0, 4);
        }

        // Flashy Effects - Small Sparks
        if (!isPaused && Math.random() > 0.9) {
          ctx.fillStyle = '#fff';
          ctx.beginPath(); ctx.arc(Math.random()*size*2 - size, Math.random()*size*2 - size, 2, 0, Math.PI * 2); ctx.fill();
        }
      };

      drawInsect();

      // Jammer/Sprayer Aura - Flashy
      if (e.type === 'jammer' || e.type === 'sprayer') {
        const auraColor = e.type === 'jammer' ? 'rgba(124, 58, 237, 0.15)' : 'rgba(5, 150, 105, 0.15)';
        ctx.fillStyle = auraColor;
        ctx.beginPath(); ctx.arc(0, 0, (e.type === 'jammer' ? 80 : 150) * pulse, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = auraColor.replace('0.15', '0.4');
        ctx.setLineDash([8, 8]);
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, 0, (e.type === 'jammer' ? 80 : 150) * pulse, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
      }

      // Boss Indicator - Flashy Crown
      if (e.isBoss) {
        ctx.save();
        ctx.translate(0, -size - 25);
        ctx.fillStyle = '#fbbf24';
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#fbbf24';
        ctx.beginPath();
        ctx.moveTo(-10, 0); ctx.lineTo(-15, -15); ctx.lineTo(-5, -8);
        ctx.lineTo(0, -20); ctx.lineTo(5, -8); ctx.lineTo(15, -15); ctx.lineTo(10, 0);
        ctx.fill();
        ctx.restore();
      }

      // Health bar (Sleek & Detailed)
      ctx.restore();
      const barW = size * 2.8;
      const barH = 6;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
      ctx.beginPath();
      ctx.roundRect(e.x - barW/2, e.y - size - 20, barW, barH, 3);
      ctx.fill();
      
      const healthPct = e.health / e.maxHealth;
      const healthColor = healthPct > 0.5 ? '#10b981' : healthPct > 0.2 ? '#f59e0b' : '#ef4444';
      
      const healthGrad = ctx.createLinearGradient(e.x - barW/2, 0, e.x + barW/2, 0);
      healthGrad.addColorStop(0, healthColor);
      healthGrad.addColorStop(1, healthColor + 'aa');
      
      ctx.fillStyle = healthGrad;
      ctx.beginPath();
      ctx.roundRect(e.x - barW/2, e.y - size - 20, barW * healthPct, barH, 3);
      ctx.fill();
      
      // Health bar highlight & border
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.lineWidth = 1;
      ctx.strokeRect(e.x - barW/2, e.y - size - 20, barW, barH);
    });

    // Draw Projectiles
    projectiles.forEach(p => {
      ctx.save();
      ctx.shadowBlur = 10;
      ctx.shadowColor = '#fbbf24';
      ctx.fillStyle = '#fef3c7';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fill();
      
      // Trail
      const trail = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 8);
      trail.addColorStop(0, 'rgba(251, 191, 36, 0.4)');
      trail.addColorStop(1, 'rgba(251, 191, 36, 0)');
      ctx.fillStyle = trail;
      ctx.beginPath(); ctx.arc(p.x, p.y, 8, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    });

    // Draw Particles
    particles.forEach(p => {
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;

  }, [currentPath, enemies, towers, projectiles, particles, mousePos, selectedTowerType, currentTime, wave]);

  return (
    <div className="relative border-4 border-slate-800 rounded-lg overflow-hidden bg-slate-900 shadow-2xl aspect-[4/3] w-full max-w-[800px] mx-auto">
      <canvas
        ref={canvasRef}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        onPointerDown={handleCanvasClick}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        className="cursor-crosshair w-full h-full object-contain touch-none"
      />
      {isPaused && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
          <span className="text-white text-4xl font-bold tracking-widest uppercase">일시 정지</span>
        </div>
      )}
      {!isPaused && currentTime < waveStartTimeRef.current + 3000 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="bg-slate-900/80 backdrop-blur-md px-8 py-4 rounded-2xl border border-emerald-500/30 text-center animate-in fade-in zoom-in duration-300">
            <p className="text-emerald-500 text-xs font-bold uppercase tracking-widest mb-1">WAVE {wave} STARTING IN</p>
            <span className="text-white text-5xl font-black tabular-nums">
              {Math.ceil((waveStartTimeRef.current + 3000 - currentTime) / 1000)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default GameCanvas;
