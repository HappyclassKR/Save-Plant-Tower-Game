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

    // Draw Background - Enhanced for high-quality vector anime look
    const bgGradient = ctx.createRadialGradient(CANVAS_WIDTH/2, CANVAS_HEIGHT/2, 0, CANVAS_WIDTH/2, CANVAS_HEIGHT/2, CANVAS_WIDTH);
    bgGradient.addColorStop(0, '#0f172a');
    bgGradient.addColorStop(0.5, '#020617');
    bgGradient.addColorStop(1, '#000000');
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Magical Floating Particles in Background
    const time = currentTime / 1000;
    for (let i = 0; i < 30; i++) {
      const px = (Math.sin(i * 123.45) * 0.5 + 0.5) * CANVAS_WIDTH;
      const py = (Math.cos(i * 543.21) * 0.5 + 0.5) * CANVAS_HEIGHT + Math.sin(time * 0.5 + i) * 20;
      const size = (Math.sin(time + i) * 0.5 + 0.5) * 2 + 1;
      const alpha = (Math.sin(time * 0.8 + i) * 0.5 + 0.5) * 0.3;
      
      ctx.fillStyle = `rgba(110, 231, 183, ${alpha})`;
      ctx.shadowBlur = 10;
      ctx.shadowColor = '#34d399';
      ctx.beginPath(); ctx.arc(px, py, size, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
    }

    // Draw Grid (Subtle & Stylish)
    ctx.strokeStyle = 'rgba(30, 41, 59, 0.3)';
    ctx.lineWidth = 1;
    for (let x = 0; x < CANVAS_WIDTH; x += GRID_SIZE) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, CANVAS_HEIGHT); ctx.stroke();
    }
    for (let y = 0; y < CANVAS_HEIGHT; y += GRID_SIZE) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CANVAS_WIDTH, y); ctx.stroke();
    }

    // Draw Path - Enhanced with glowing moss and energy runes
    ctx.shadowBlur = 20;
    ctx.shadowColor = 'rgba(16, 185, 129, 0.2)';
    ctx.strokeStyle = '#1a0f0f';
    ctx.lineWidth = GRID_SIZE + 8;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    currentPath.forEach((p, i) => {
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();

    // Main Path Color
    ctx.strokeStyle = '#2d1b0d';
    ctx.lineWidth = GRID_SIZE + 2;
    ctx.stroke();

    // Glowing Moss/Runes along the path
    ctx.strokeStyle = '#065f46';
    ctx.lineWidth = GRID_SIZE - 4;
    ctx.stroke();

    ctx.strokeStyle = `rgba(52, 211, 153, ${0.1 + Math.sin(time * 2) * 0.05})`;
    ctx.lineWidth = GRID_SIZE - 10;
    ctx.stroke();

    // Detailed Path Texture (Anime style)
    ctx.shadowBlur = 0;
    currentPath.forEach((p, i) => {
      if (i < currentPath.length - 1) {
        const nextP = currentPath[i+1];
        const midX = (p.x + nextP.x) / 2;
        const midY = (p.y + nextP.y) / 2;
        
        // Small glowing stones
        if (i % 2 === 0) {
          ctx.fillStyle = 'rgba(110, 231, 183, 0.2)';
          ctx.beginPath(); ctx.arc(midX + Math.sin(i) * 10, midY + Math.cos(i) * 10, 3, 0, Math.PI * 2); ctx.fill();
        }
      }
    });

    // Draw World Tree (Base) - Enhanced for high-quality vector anime look
    const drawWorldTree = (x: number, y: number) => {
      ctx.save();
      
      const time = currentTime / 1000;
      const pulse = Math.sin(time * 2) * 0.1 + 1;
      const rotateAnim = time * 0.5;
      
      // Apply shake effect
      if (baseHitEffect > 0) {
        const shakeX = (Math.random() - 0.5) * baseHitEffect;
        const shakeY = (Math.random() - 0.5) * baseHitEffect;
        ctx.translate(x + shakeX, y + shakeY);
      } else {
        ctx.translate(x, y);
      }
      
      // 1. Massive Magical Aura - Multi-layered
      const auraCount = 3;
      for (let i = 0; i < auraCount; i++) {
        const auraSize = 120 + i * 40 + Math.sin(time * (1 + i)) * 10;
        const auraGlow = ctx.createRadialGradient(0, 0, 0, 0, 0, auraSize);
        const alpha = (0.3 / (i + 1)) * (0.7 + Math.sin(time * 2) * 0.3);
        auraGlow.addColorStop(0, baseHitEffect > 5 ? `rgba(239, 68, 68, ${alpha})` : `rgba(52, 211, 153, ${alpha})`);
        auraGlow.addColorStop(1, 'rgba(16, 185, 129, 0)');
        ctx.fillStyle = auraGlow;
        ctx.beginPath(); ctx.arc(0, 0, auraSize, 0, Math.PI * 2); ctx.fill();
      }

      // 2. Roots (Detailed, Shaded, and Organic)
      ctx.strokeStyle = '#2d1f1f';
      ctx.lineWidth = 8;
      ctx.lineCap = 'round';
      for(let i=0; i<10; i++) {
        ctx.save();
        const angle = (Math.PI * 2 / 10) * i + Math.sin(time * 0.3) * 0.1;
        ctx.rotate(angle);
        
        // Main root
        ctx.beginPath();
        ctx.moveTo(0, 20);
        ctx.quadraticCurveTo(30, 40, 60, 45);
        ctx.stroke();
        
        // Root highlight
        ctx.strokeStyle = '#5d3a1a';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(2, 18);
        ctx.quadraticCurveTo(32, 38, 58, 43);
        ctx.stroke();
        
        // Small root branch
        ctx.strokeStyle = '#2d1f1f';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(30, 40);
        ctx.quadraticCurveTo(45, 60, 55, 65);
        ctx.stroke();
        
        ctx.restore();
      }

      // 3. Trunk (Detailed Shading, Glossy Highlights & Glowing Runes)
      const trunkGrad = ctx.createLinearGradient(-30, 0, 30, 0);
      trunkGrad.addColorStop(0, '#1a0f0f');
      trunkGrad.addColorStop(0.3, '#3d2b1f');
      trunkGrad.addColorStop(0.5, '#78350f');
      trunkGrad.addColorStop(0.7, '#3d2b1f');
      trunkGrad.addColorStop(1, '#1a0f0f');
      
      ctx.fillStyle = baseHitEffect > 5 ? '#ef4444' : trunkGrad;
      ctx.beginPath();
      ctx.moveTo(-25, 55);
      ctx.bezierCurveTo(-15, 20, -35, -20, -30, -50);
      ctx.lineTo(30, -50);
      ctx.bezierCurveTo(35, -20, 15, 20, 25, 55);
      ctx.closePath();
      ctx.fill();
      
      // Trunk Glossy Highlight
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(-15, 40);
      ctx.bezierCurveTo(-5, 10, -20, -20, -18, -45);
      ctx.stroke();

      // Glowing Runes - Intricate & Flashy
      if (baseHitEffect <= 5) {
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#6ee7b7';
        ctx.strokeStyle = `rgba(110, 231, 183, ${0.6 + Math.sin(time * 5) * 0.4})`;
        ctx.lineWidth = 3;
        for(let i=0; i<4; i++) {
          const ry = 30 - i * 28;
          ctx.beginPath();
          ctx.moveTo(-10, ry);
          ctx.lineTo(0, ry - 10);
          ctx.lineTo(10, ry);
          ctx.moveTo(0, ry - 10);
          ctx.lineTo(0, ry + 5);
          ctx.stroke();
        }
        ctx.shadowBlur = 0;
      }

      // 4. Foliage Layers (Lush, Multi-toned, and Animated)
      const drawFoliageLayer = (r: number, color: string, ox: number, oy: number, phase: number) => {
        const scale = 1 + Math.sin(time * 1.2 + phase) * 0.06;
        const grad = ctx.createRadialGradient(ox - r*0.3, oy - r*0.3, 0, ox, oy, r);
        grad.addColorStop(0, color);
        grad.addColorStop(0.7, color);
        grad.addColorStop(1, '#064e3b');
        
        ctx.fillStyle = baseHitEffect > 5 ? '#f87171' : grad;
        ctx.beginPath();
        ctx.arc(ox, oy, r * scale, 0, Math.PI * 2);
        ctx.fill();
        
        // Leaf Highlights (Vector style)
        ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
        for(let i=0; i<6; i++) {
          const la = (Math.PI * 2 / 6) * i + time * 0.4;
          const lx = ox + Math.cos(la) * r * 0.6;
          const ly = oy + Math.sin(la) * r * 0.6;
          ctx.beginPath();
          ctx.ellipse(lx, ly, r * 0.25, r * 0.12, la, 0, Math.PI * 2);
          ctx.fill();
        }
        
        // Inner Glow
        const innerGlow = ctx.createRadialGradient(ox, oy, r * 0.5, ox, oy, r);
        innerGlow.addColorStop(0, 'transparent');
        innerGlow.addColorStop(1, 'rgba(0, 0, 0, 0.2)');
        ctx.fillStyle = innerGlow;
        ctx.beginPath(); ctx.arc(ox, oy, r * scale, 0, Math.PI * 2); ctx.fill();
      };

      drawFoliageLayer(70, '#065f46', 0, -70, 0);
      drawFoliageLayer(60, '#059669', -50, -50, 1.5);
      drawFoliageLayer(60, '#059669', 50, -50, 3);
      drawFoliageLayer(55, '#10b981', 0, -110, 4.5);
      
      // 5. Floating Magic Particles (Enhanced)
      for(let i=0; i<15; i++) {
        const pTime = time * 0.3 + i * (Math.PI * 2 / 15);
        const dist = 100 + Math.sin(time * 0.8 + i) * 20;
        const px = Math.sin(pTime) * dist;
        const py = -70 + Math.cos(pTime * 1.2) * 80;
        
        ctx.fillStyle = `rgba(255, 255, 255, ${0.4 + Math.sin(time * 2 + i) * 0.4})`;
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#34d399';
        ctx.beginPath(); 
        // Star shape
        for(let j=0; j<4; j++) {
          const sa = (Math.PI / 2) * j;
          ctx.lineTo(px + Math.cos(sa) * 4, py + Math.sin(sa) * 4);
          ctx.lineTo(px + Math.cos(sa + Math.PI/4) * 1.5, py + Math.sin(sa + Math.PI/4) * 1.5);
        }
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // 6. Magic Core (Intense Pulsing & Flashy Energy Rings)
      const coreY = -40;
      const coreSize = 18 * pulse;
      
      // Core Glow
      const coreGlow = ctx.createRadialGradient(0, coreY, 0, 0, coreY, coreSize * 5);
      coreGlow.addColorStop(0, baseHitEffect > 5 ? 'rgba(254, 202, 202, 0.9)' : 'rgba(209, 250, 229, 0.9)');
      coreGlow.addColorStop(0.4, baseHitEffect > 5 ? 'rgba(239, 68, 68, 0.4)' : 'rgba(52, 211, 153, 0.4)');
      coreGlow.addColorStop(1, 'rgba(16, 185, 129, 0)');
      ctx.fillStyle = coreGlow;
      ctx.beginPath(); ctx.arc(0, coreY, coreSize * 5, 0, Math.PI * 2); ctx.fill();

      // Core Center - Flashy Anime Star
      ctx.shadowBlur = 50 * pulse;
      ctx.shadowColor = baseHitEffect > 5 ? '#ef4444' : '#6ee7b7';
      ctx.fillStyle = '#fff';
      ctx.beginPath(); 
      for(let i=0; i<8; i++) {
        const sa = (Math.PI / 4) * i + time * 2;
        const sr = i % 2 === 0 ? coreSize * 1.5 : coreSize * 0.6;
        ctx.lineTo(Math.cos(sa) * sr, coreY + Math.sin(sa) * sr);
      }
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;

      // Rotating Energy Rings (Flashy Vector Style)
      for(let i=0; i<3; i++) {
        ctx.save();
        ctx.translate(0, coreY);
        ctx.rotate(time * (1 + i * 0.5) * (i % 2 === 0 ? 1 : -1));
        ctx.scale(1, 0.35);
        
        ctx.lineWidth = 4 - i * 0.5;
        ctx.strokeStyle = i === 0 ? 'rgba(110, 231, 183, 0.9)' : i === 1 ? 'rgba(52, 211, 153, 0.7)' : 'rgba(255, 255, 255, 0.5)';
        ctx.beginPath(); 
        ctx.arc(0, 0, 45 + i * 25, 0, Math.PI * 2); 
        ctx.stroke();
        
        // Energy Orbs on Rings - Glowing
        const nodeCount = 4 + i;
        for(let k=0; k<nodeCount; k++) {
          const na = (Math.PI * 2 / nodeCount) * k;
          const nx = Math.cos(na) * (45 + i * 25);
          const ny = Math.sin(na) * (45 + i * 25);
          
          ctx.fillStyle = '#fff';
          ctx.shadowBlur = 12;
          ctx.shadowColor = '#fff';
          ctx.beginPath(); ctx.arc(nx, ny, 5, 0, Math.PI * 2); ctx.fill();
          
          // Energy Sparkles
          if (Math.random() > 0.8) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
            ctx.beginPath(); ctx.arc(nx + (Math.random()-0.5)*10, ny + (Math.random()-0.5)*10, 2, 0, Math.PI * 2); ctx.fill();
          }
          ctx.shadowBlur = 0;
        }
        ctx.restore();
      }

      // Damage Flash Overlay
      if (baseHitEffect > 0) {
        ctx.fillStyle = `rgba(239, 68, 68, ${baseHitEffect / 25})`;
        ctx.beginPath(); ctx.arc(0, coreY, 150, 0, Math.PI * 2); ctx.fill();
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

      // Shadow under enemy
      ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
      ctx.beginPath(); ctx.ellipse(0, 15, 20, 8, 0, 0, Math.PI * 2); ctx.fill();

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
          
          // Speed Trail (Flashy)
          ctx.strokeStyle = 'rgba(56, 189, 248, 0.3)';
          ctx.lineWidth = 4;
          ctx.beginPath(); ctx.moveTo(-15, -5); ctx.lineTo(-35, -5); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(-15, 5); ctx.lineTo(-35, 5); ctx.stroke();
          
          // Wings (Animated) - Iridescent effect
          for(let i=0; i<4; i++) {
            ctx.save();
            ctx.rotate((Math.PI/2) * i + wingAnim * (i < 2 ? 1 : -1));
            const wingGrad = ctx.createLinearGradient(0, 0, 20, 0);
            wingGrad.addColorStop(0, 'rgba(255, 255, 255, 0.7)');
            wingGrad.addColorStop(0.5, 'rgba(56, 189, 248, 0.4)');
            wingGrad.addColorStop(1, 'rgba(56, 189, 248, 0.1)');
            ctx.fillStyle = wingGrad;
            ctx.beginPath(); ctx.ellipse(18, 0, 16, 6, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            ctx.restore();
          }
          // Body - Segments
          const bodyGrad = ctx.createLinearGradient(-14, 0, 14, 0);
          bodyGrad.addColorStop(0, accentColor);
          bodyGrad.addColorStop(0.5, bodyColor);
          bodyGrad.addColorStop(1, accentColor);
          ctx.fillStyle = bodyGrad;
          ctx.beginPath(); ctx.ellipse(0, 0, 14, 5, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          // Tail with stripes
          ctx.fillStyle = accentColor;
          ctx.beginPath(); ctx.roundRect(-22, -2.5, 12, 5, 2.5); ctx.fill(); ctx.stroke();
          drawCartoonEyes(10, 0, 4.5);
        } 
        else if (e.type === 'tank' || e.type === 'titan') {
          // Beetle Style - Heavy & Cartoonish
          size = e.type === 'titan' ? 32 : 20;
          bodyColor = e.type === 'titan' ? '#1e293b' : '#334155';
          accentColor = '#475569';
          
          // Exhaust Pipes (Flashy)
          ctx.fillStyle = '#1e293b';
          ctx.beginPath(); ctx.roundRect(-size-5, -10, 10, 5, 2); ctx.fill();
          ctx.beginPath(); ctx.roundRect(-size-5, 5, 10, 5, 2); ctx.fill();
          // Exhaust Glow
          ctx.fillStyle = `rgba(239, 68, 68, ${0.4 + Math.sin(time*10)*0.3})`;
          ctx.beginPath(); ctx.arc(-size-6, -7.5, 3, 0, Math.PI*2); ctx.fill();
          ctx.beginPath(); ctx.arc(-size-6, 7.5, 3, 0, Math.PI*2); ctx.fill();

          // Legs - Chunky Mechanical
          ctx.strokeStyle = bodyColor;
          ctx.lineWidth = 5;
          for(let i=0; i<6; i++) {
            ctx.save();
            const angle = (Math.PI / 3) * i + moveAnim * 0.15;
            ctx.rotate(angle);
            ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(size + 10, 0); ctx.stroke();
            // Joint
            ctx.fillStyle = accentColor;
            ctx.beginPath(); ctx.arc(size + 5, 0, 3, 0, Math.PI * 2); ctx.fill();
            ctx.restore();
          }
          // Shell - Glossy & Detailed
          const shellGrad = ctx.createRadialGradient(-size/3, -size/3, 0, 0, 0, size);
          shellGrad.addColorStop(0, '#94a3b8');
          shellGrad.addColorStop(0.5, '#475569');
          shellGrad.addColorStop(1, bodyColor);
          ctx.fillStyle = shellGrad;
          ctx.beginPath(); ctx.arc(0, 0, size, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          // Shell Split & Rivets
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(0, -size); ctx.lineTo(0, size); ctx.stroke();
          ctx.fillStyle = '#1e293b';
          for(let i=0; i<4; i++) {
            ctx.beginPath(); ctx.arc(0, -size + 10 + i*(size/2), 2, 0, Math.PI*2); ctx.fill();
          }
          // Horns - Big & Bold
          ctx.fillStyle = bodyColor;
          ctx.beginPath();
          ctx.moveTo(size-5, -8); ctx.quadraticCurveTo(size+25, -15, size+20, -30);
          ctx.lineTo(size+12, -22); ctx.quadraticCurveTo(size+18, -12, size-5, -5);
          ctx.fill(); ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(size-5, 8); ctx.quadraticCurveTo(size+25, 15, size+20, 30);
          ctx.lineTo(size+12, 22); ctx.quadraticCurveTo(size+18, 10, size-5, 5);
          ctx.fill(); ctx.stroke();
          
          drawCartoonEyes(size-8, 0, size/4.5);
        }
        else if (e.type === 'shield') {
          // Ladybug/Shield Beetle Style
          size = 18;
          bodyColor = '#475569';
          eyeColor = '#38bdf8';
          
          // Shield Aura - Pulsing Hexagons (Flashy)
          ctx.save();
          ctx.rotate(time * 0.5);
          ctx.strokeStyle = `rgba(56, 189, 248, ${0.4 + Math.sin(time*5)*0.2})`;
          ctx.lineWidth = 3;
          for(let j=0; j<2; j++) {
            ctx.beginPath();
            const rBase = size + 14 + j*8 + Math.sin(time*4)*3;
            for(let i=0; i<6; i++) {
              const a = (Math.PI / 3) * i;
              ctx.lineTo(Math.cos(a)*rBase, Math.sin(a)*rBase);
            }
            ctx.closePath(); ctx.stroke();
          }
          ctx.restore();
          
          // Body - Round & Cute Mechanical
          const bodyGrad = ctx.createRadialGradient(-5, -5, 0, 0, 0, size);
          bodyGrad.addColorStop(0, '#94a3b8');
          bodyGrad.addColorStop(1, bodyColor);
          ctx.fillStyle = bodyGrad;
          ctx.beginPath(); ctx.arc(0, 0, size, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          // Pattern - Glowing Dots
          for(let i=0; i<3; i++) {
            const a = (Math.PI * 2 / 3) * i + time;
            const px = Math.cos(a)*10;
            const py = Math.sin(a)*10;
            ctx.fillStyle = '#1e293b';
            ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = `rgba(56, 189, 248, ${0.5 + Math.sin(time*8)*0.5})`;
            ctx.beginPath(); ctx.arc(px, py, 2, 0, Math.PI * 2); ctx.fill();
          }
          drawCartoonEyes(size-6, 0, 5.5);
        }
        else if (e.type === 'jammer' || e.type === 'sprayer') {
          // Wasp/Bee Style - Vibrant & Flashy
          size = 16;
          bodyColor = e.type === 'jammer' ? '#7c3aed' : '#059669';
          accentColor = '#fde047';
          
          // Wings (Fast Animation & Blur)
          ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
          ctx.save(); ctx.rotate(wingAnim * 3);
          ctx.beginPath(); ctx.ellipse(0, -14, 20, 8, Math.PI/4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          ctx.beginPath(); ctx.ellipse(0, -14, 20, 8, -Math.PI/4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          ctx.restore();

          // Body Segments - Striped & Glossy
          const tailGrad = ctx.createRadialGradient(-10, 0, 0, -10, 0, 10);
          tailGrad.addColorStop(0, '#a78bfa');
          tailGrad.addColorStop(1, bodyColor);
          ctx.fillStyle = tailGrad;
          ctx.beginPath(); ctx.ellipse(-10, 0, 12, 9, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          
          const headGrad = ctx.createRadialGradient(4, 0, 0, 4, 0, 12);
          headGrad.addColorStop(0, '#fef08a');
          headGrad.addColorStop(1, accentColor);
          ctx.fillStyle = headGrad;
          ctx.beginPath(); ctx.ellipse(4, 0, 14, 11, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          
          // Stripes - Mechanical
          ctx.strokeStyle = '#000';
          ctx.lineWidth = 4;
          ctx.beginPath(); ctx.moveTo(4, -11); ctx.lineTo(4, 11); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(-2, -10); ctx.lineTo(-2, 10); ctx.stroke();
          
          // Stinger - Glowing
          ctx.fillStyle = '#000';
          ctx.beginPath(); ctx.moveTo(-22, 0); ctx.lineTo(-32, 0); ctx.lineTo(-22, 5); ctx.fill();
          ctx.fillStyle = '#ef4444';
          ctx.beginPath(); ctx.arc(-24, 0, 2, 0, Math.PI*2); ctx.fill();
          
          drawCartoonEyes(14, 0, 5.5);
        }
        else {
          // Basic Ant Style - Cute & Mechanical
          size = 14;
          bodyColor = '#64748b';
          accentColor = '#94a3b8';
          
          // Legs - Mechanical joints
          ctx.strokeStyle = bodyColor;
          ctx.lineWidth = 3;
          for(let i=0; i<6; i++) {
            const side = i < 3 ? 1 : -1;
            const phase = (i % 3) * (Math.PI / 2);
            const legAnim = Math.sin(time * 18 + phase) * 6;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(side * 12, -4 + (i%3)*4);
            ctx.lineTo(side * 20, -8 + (i%3)*8 + legAnim);
            ctx.stroke();
            
            // Joint
            ctx.fillStyle = accentColor;
            ctx.beginPath(); ctx.arc(side * 12, -4 + (i%3)*4, 2, 0, Math.PI * 2); ctx.fill();
          }
          // Segments - Bubbly & Glossy
          const drawSegment = (sx: number, sy: number, sr: number) => {
            const grad = ctx.createRadialGradient(sx - sr*0.3, sy - sr*0.3, 0, sx, sy, sr);
            grad.addColorStop(0, '#94a3b8');
            grad.addColorStop(1, bodyColor);
            ctx.fillStyle = grad;
            ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            // Gloss
            ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
            ctx.beginPath(); ctx.ellipse(sx - sr*0.4, sy - sr*0.4, sr*0.3, sr*0.15, -Math.PI/4, 0, Math.PI * 2); ctx.fill();
          };
          
          drawSegment(-12, 0, 9);
          drawSegment(0, 0, 7);
          drawSegment(12, 0, 9);
          
          // Antennae
          ctx.strokeStyle = bodyColor;
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(18, -3); ctx.quadraticCurveTo(25, -15, 30, -10); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(18, 3); ctx.quadraticCurveTo(25, 15, 30, 10); ctx.stroke();
          
          drawCartoonEyes(16, 0, 4.5);
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

    // Draw Projectiles - Enhanced for high-quality vector anime look
    projectiles.forEach(p => {
      ctx.save();
      const pTime = currentTime / 1000;
      const pPulse = 1 + Math.sin(pTime * 10) * 0.2;
      
      // Energy Trail (Motion Blur)
      const trailLen = 15;
      const trailGrad = ctx.createLinearGradient(p.x, p.y, p.x - Math.cos(pTime) * trailLen, p.y - Math.sin(pTime) * trailLen);
      trailGrad.addColorStop(0, 'rgba(251, 191, 36, 0.6)');
      trailGrad.addColorStop(1, 'rgba(251, 191, 36, 0)');
      
      ctx.strokeStyle = trailGrad;
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      // We don't have velocity vector here, so we use a simple trail
      // In a real game, we'd use the direction of travel
      ctx.lineTo(p.x - 10, p.y); 
      ctx.stroke();

      // Main Projectile - Glowing Seed/Energy Bolt
      ctx.shadowBlur = 15;
      ctx.shadowColor = '#fbbf24';
      
      const pGrad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 5 * pPulse);
      pGrad.addColorStop(0, '#fff');
      pGrad.addColorStop(0.6, '#fbbf24');
      pGrad.addColorStop(1, '#d97706');
      
      ctx.fillStyle = pGrad;
      ctx.beginPath();
      // Star/Diamond shape for anime look
      for(let i=0; i<4; i++) {
        const sa = (Math.PI / 2) * i;
        ctx.lineTo(p.x + Math.cos(sa) * 6 * pPulse, p.y + Math.sin(sa) * 6 * pPulse);
        ctx.lineTo(p.x + Math.cos(sa + Math.PI/4) * 2.5 * pPulse, p.y + Math.sin(sa + Math.PI/4) * 2.5 * pPulse);
      }
      ctx.closePath();
      ctx.fill();
      
      ctx.shadowBlur = 0;
      ctx.restore();
    });

    // Draw Particles - Flashy & Anime Style
    particles.forEach(p => {
      ctx.save();
      ctx.globalAlpha = p.life;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.life * Math.PI);
      
      ctx.fillStyle = p.color;
      ctx.shadowBlur = 10 * p.life;
      ctx.shadowColor = p.color;
      
      ctx.beginPath();
      // Star shape for particles
      for(let i=0; i<4; i++) {
        const sa = (Math.PI / 2) * i;
        ctx.lineTo(Math.cos(sa) * p.size, Math.sin(sa) * p.size);
        ctx.lineTo(Math.cos(sa + Math.PI/4) * p.size * 0.4, Math.sin(sa + Math.PI/4) * p.size * 0.4);
      }
      ctx.closePath();
      ctx.fill();
      
      ctx.restore();
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
