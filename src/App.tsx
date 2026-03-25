import React, { useState, useCallback, useEffect } from 'react';
import GameCanvas from './components/GameCanvas';
import QuizModal from './components/QuizModal';
import Shop from './components/Shop';
import { Tower, GameState } from './types';
import { TOWER_STATS, QUIZZES } from './constants';
import { soundManager } from './services/soundManager';
import { motion, AnimatePresence } from 'motion/react';
import { Heart, Trophy, Play, Pause, RefreshCcw, HelpCircle, Coins, TreePine, Zap, Volume2, VolumeX, Info, BookOpen, MousePointer2, Target, X } from 'lucide-react';

export default function App() {
  const [gameState, setGameState] = useState<GameState>({
    coins: 100,
    health: 10,
    wave: 1,
    isGameOver: false,
    isPaused: false,
    score: 0,
    resetTrigger: 0,
    gameSpeed: 1,
  });

  const [towers, setTowers] = useState<Tower[]>([]);
  const [path, setPath] = useState<{x: number, y: number}[]>([]);
  const [isQuizOpen, setIsQuizOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isMuted, setIsMuted] = useState(soundManager.isMuted());
  const [quizHistory, setQuizHistory] = useState<number[]>([]);
  const [failedQuizzes, setFailedQuizzes] = useState<number[]>([]);
  const [currentQuizId, setCurrentQuizId] = useState<number | null>(null);
  const [selectedTowerType, setSelectedTowerType] = useState<Tower['type'] | null>(null);
  const [showLearningObjectives, setShowLearningObjectives] = useState(true);
  const [learningObjectivesCountdown, setLearningObjectivesCountdown] = useState(6);

  useEffect(() => {
    if (showLearningObjectives || isHelpOpen) {
      setGameState(prev => ({ ...prev, isPaused: true }));
    } else if (!showLearningObjectives && !isHelpOpen) {
      setGameState(prev => ({ ...prev, isPaused: false }));
    }
  }, [showLearningObjectives, isHelpOpen]);

  const [pendingAction, setPendingAction] = useState<{
    type: 'place' | 'upgrade';
    towerType?: Tower['type'];
    towerId?: string;
    x?: number;
    y?: number;
  } | null>(null);

  useEffect(() => {
    if (showLearningObjectives && learningObjectivesCountdown > 0) {
      const timer = setInterval(() => {
        setLearningObjectivesCountdown(prev => {
          if (prev <= 1) {
            setShowLearningObjectives(false);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [showLearningObjectives, learningObjectivesCountdown]);

  const handleEnemyReachedBase = useCallback(() => {
    setGameState(prev => {
      const newHealth = prev.health - 1;
      if (newHealth <= 0) {
        soundManager.playGameOver();
        return { ...prev, health: 0, isGameOver: true };
      }
      return { ...prev, health: newHealth };
    });
  }, []);

  const handleEnemyKilled = useCallback((reward: number) => {
    setGameState(prev => ({
      ...prev,
      coins: prev.coins + reward,
      score: prev.score + reward * 10,
    }));
  }, []);

  const handleWaveCleared = useCallback(() => {
    setGameState(prev => ({ ...prev, wave: prev.wave + 1 }));
    setTowers([]); // Reset towers every wave
    soundManager.playWaveStart();
  }, []);

  const toggleGameSpeed = () => {
    soundManager.playClick();
    setGameState(prev => ({
      ...prev,
      gameSpeed: prev.gameSpeed === 1 ? 2 : prev.gameSpeed === 2 ? 4 : 1
    }));
  };

  const handleQuizClose = (correct: boolean) => {
    setIsQuizOpen(false);
    setGameState(prev => ({ ...prev, isPaused: false }));

    if (currentQuizId !== null) {
      if (correct) {
        // Remove from failed quizzes if it was there
        setFailedQuizzes(prev => prev.filter(id => id !== currentQuizId));
        // Add to history
        setQuizHistory(prev => {
          const newHistory = [...prev, currentQuizId];
          if (newHistory.length > 10) return newHistory.slice(newHistory.length - 10);
          return newHistory;
        });
      } else {
        // Penalty for incorrect answer: -100 coins, min 0
        soundManager.playFailure();
        setGameState(prev => ({
          ...prev,
          coins: Math.max(0, prev.coins - 100)
        }));
        
        // Add to failed quizzes if not already there
        setFailedQuizzes(prev => {
          if (prev.includes(currentQuizId)) return prev;
          return [...prev, currentQuizId];
        });
      }
    }

    if (correct && pendingAction) {
      // Reward for correct answer
      soundManager.playSuccess();
      setGameState(prev => ({
        ...prev,
        coins: prev.coins + 30,
        score: prev.score + 100,
      }));

      if (pendingAction.type === 'place' && pendingAction.towerType && pendingAction.x !== undefined && pendingAction.y !== undefined) {
        const cost = TOWER_STATS[pendingAction.towerType].cost || 0;
        const newTower: Tower = {
          id: Math.random().toString(36).substr(2, 9),
          x: pendingAction.x,
          y: pendingAction.y,
          type: pendingAction.towerType,
          level: 1,
          range: TOWER_STATS[pendingAction.towerType].range || 100,
          damage: TOWER_STATS[pendingAction.towerType].damage || 10,
          fireRate: TOWER_STATS[pendingAction.towerType].fireRate || 1000,
          lastFired: 0,
          cost,
          upgradeCost: TOWER_STATS[pendingAction.towerType].upgradeCost || 25,
        };
        setTowers(prev => [...prev, newTower]);
        setGameState(prev => ({ ...prev, coins: prev.coins - cost }));
        soundManager.playPlacement();
      } else if (pendingAction.type === 'upgrade' && pendingAction.towerId) {
        setTowers(prev => prev.map(t => {
          if (t.id === pendingAction.towerId) {
            const nextLevel = t.level + 1;
            const upgradeCost = t.upgradeCost;
            setGameState(gs => ({ ...gs, coins: gs.coins - upgradeCost }));
            soundManager.playUpgrade();
            return {
              ...t,
              level: nextLevel,
              damage: t.damage * 1.5,
              range: t.range * 1.1,
              fireRate: t.fireRate * 0.9,
              upgradeCost: Math.floor(t.upgradeCost * 1.5),
            };
          }
          return t;
        }));
      }
    }
    setPendingAction(null);
    setSelectedTowerType(null);
  };

  const handleBuyTower = (type: Tower['type']) => {
    soundManager.playClick();
    if (selectedTowerType === type) {
      setSelectedTowerType(null);
    } else {
      setSelectedTowerType(type);
    }
  };

  const openQuiz = () => {
    let nextQuizId: number;
    
    // Filter failed quizzes to avoid consecutive repeats
    const failedCandidates = failedQuizzes.filter(id => id !== currentQuizId);
    
    // 40% chance to pick a failed quiz if candidates exist, 
    // or if we have too many failed quizzes pending
    if (failedCandidates.length > 0 && (Math.random() < 0.4 || failedQuizzes.length > 3)) {
      const randomIndex = Math.floor(Math.random() * failedCandidates.length);
      nextQuizId = failedCandidates[randomIndex];
      // Note: We don't remove it from failedQuizzes here; 
      // it gets removed in handleQuizClose if answered correctly.
    } else {
      // Pick a random quiz not in recent history (last 10)
      const availableQuizzes = QUIZZES.filter(q => !quizHistory.includes(q.id) && q.id !== currentQuizId);
      
      if (availableQuizzes.length > 0) {
        nextQuizId = availableQuizzes[Math.floor(Math.random() * availableQuizzes.length)].id;
      } else {
        // If all quizzes used, clear history and pick any (except consecutive)
        setQuizHistory([]);
        const fallbackQuizzes = QUIZZES.filter(q => q.id !== currentQuizId);
        nextQuizId = fallbackQuizzes[Math.floor(Math.random() * fallbackQuizzes.length)].id;
      }
    }

    setCurrentQuizId(nextQuizId);
    setIsQuizOpen(true);
  };

  const handleTowerClick = (tower: Tower) => {
    if (gameState.coins >= tower.upgradeCost) {
      setPendingAction({ type: 'upgrade', towerId: tower.id });
      setGameState(prev => ({ ...prev, isPaused: true }));
      openQuiz();
    }
  };

  const handlePlacement = (x: number, y: number) => {
    if (!selectedTowerType) return;
    
    // 1. Check for path overlap
    const isOnPath = path.some(p => {
      const dx = p.x - x;
      const dy = p.y - y;
      return Math.sqrt(dx * dx + dy * dy) < 25; // Path width is 40, so 20-25 is a good buffer
    });

    if (isOnPath) {
      return;
    }

    // 2. Check for tower overlap
    const isOnTower = towers.some(t => {
      const dx = t.x - x;
      const dy = t.y - y;
      return Math.sqrt(dx * dx + dy * dy) < 30; // Tower size is 30
    });

    if (isOnTower) {
      return;
    }

    const cost = TOWER_STATS[selectedTowerType].cost || 0;
    if (gameState.coins >= cost) {
      setPendingAction({ type: 'place', towerType: selectedTowerType, x, y });
      setGameState(prev => ({ ...prev, isPaused: true }));
      openQuiz();
    }
  };

  const resetGame = (fromBeginning: boolean = true) => {
    soundManager.playClick();
    if (fromBeginning) {
      setGameState({
        coins: 100,
        health: 10,
        wave: 1,
        isGameOver: false,
        isPaused: false, // Start unpaused for countdown
        score: 0,
        resetTrigger: Date.now(),
        gameSpeed: 1,
      });
      setTowers([]);
    } else {
      // Retry current level: -10000 points, reset health, keep wave
      setGameState(prev => ({
        ...prev,
        health: 10,
        coins: Math.max(prev.coins, 100 + (prev.wave - 1) * 50), // Ensure they have enough to start
        score: Math.max(0, prev.score - 10000),
        isGameOver: false,
        isPaused: false, // Start unpaused for countdown
        resetTrigger: Date.now(),
      }));
      setTowers([]); // Start wave fresh
    }
  };

  const toggleMute = () => {
    soundManager.playClick();
    const newMuted = soundManager.toggleMute();
    setIsMuted(newMuted);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-emerald-500/30">
      {/* Header */}
      <header className="bg-slate-900/50 backdrop-blur-xl border-b border-slate-800 p-2 sm:p-3 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2 sm:gap-4">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="p-1.5 sm:p-2 bg-emerald-500/20 rounded-xl border border-emerald-500/30">
              <TreePine className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-500" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-bold tracking-tight text-slate-100">식물 수호대</h1>
              <p className="text-[10px] sm:text-xs text-slate-500 font-medium uppercase tracking-widest">세계수를 지켜라!</p>
            </div>
          </div>

          <div className="flex items-center gap-3 sm:gap-6 order-last sm:order-none w-full sm:w-auto justify-center sm:justify-start">
            <div className="flex items-center gap-2 bg-rose-500/10 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full border border-rose-500/30">
              <Heart className="w-4 h-4 sm:w-5 sm:h-5 text-rose-500 fill-rose-500/20" />
              <span className="font-bold text-rose-500 tabular-nums text-sm sm:text-base">{gameState.health}</span>
            </div>
            <div className="flex items-center gap-2 bg-emerald-500/10 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full border border-emerald-500/30">
              <Trophy className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-500" />
              <span className="font-bold text-emerald-500 tabular-nums text-sm sm:text-base">{gameState.score}</span>
            </div>
            <div className="flex items-center gap-2 bg-slate-800 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full border border-slate-700">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">WAVE</span>
              <span className="font-bold text-slate-100 tabular-nums text-sm sm:text-base">{gameState.wave}</span>
            </div>
            <button 
              onClick={toggleGameSpeed}
              className="flex items-center gap-1.5 bg-emerald-500/10 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full border border-emerald-500/30 text-emerald-500 hover:bg-emerald-500 hover:text-white transition-all font-bold text-sm sm:text-base min-w-[60px] sm:min-w-[80px] justify-center"
              title="게임 속도 조절"
            >
              <Zap className="w-4 h-4 sm:w-5 sm:h-5" />
              <span>{gameState.gameSpeed}X</span>
            </button>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <button 
              onClick={toggleMute}
              className="p-2 sm:p-2.5 bg-slate-800 hover:bg-slate-700 rounded-xl border border-slate-700 transition-colors"
              title={isMuted ? "소리 켜기" : "소리 끄기"}
            >
              {isMuted ? <VolumeX className="w-4 h-4 sm:w-5 sm:h-5 text-rose-500" /> : <Volume2 className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-500" />}
            </button>
            <button 
              onClick={() => {
                soundManager.playClick();
                setGameState(prev => ({ ...prev, isPaused: !prev.isPaused }));
              }}
              className="p-2 sm:p-2.5 bg-slate-800 hover:bg-slate-700 rounded-xl border border-slate-700 transition-colors"
              title={gameState.isPaused ? "게임 재개" : "게임 일시정지"}
            >
              {gameState.isPaused ? <Play className="w-4 h-4 sm:w-5 sm:h-5" /> : <Pause className="w-4 h-4 sm:w-5 sm:h-5" />}
            </button>
            <button 
              onClick={() => {
                soundManager.playClick();
                setIsHelpOpen(true);
              }}
              className="p-2 sm:p-2.5 bg-emerald-600 hover:bg-emerald-500 rounded-xl border border-emerald-400/30 transition-colors shadow-lg shadow-emerald-600/20"
              title="도움말"
            >
              <HelpCircle className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-1.5 sm:p-2 flex flex-col lg:flex-row gap-1.5 sm:gap-2">
        {/* Game Area (Middle on Mobile) */}
        <div className="flex-1 space-y-1.5 sm:space-y-2 w-full order-2 lg:order-1">
          <div className="relative">
            <GameCanvas 
              onEnemyReachedBase={handleEnemyReachedBase}
              onEnemyKilled={handleEnemyKilled}
              onTowerClick={handleTowerClick}
              onPlacementClick={handlePlacement}
              onWaveCleared={handleWaveCleared}
              onPathGenerated={setPath}
              towers={towers}
              path={path}
              isPaused={gameState.isPaused}
              isGameOver={gameState.isGameOver}
              gameSpeed={gameState.gameSpeed}
              wave={gameState.wave}
              selectedTowerType={selectedTowerType}
              resetTrigger={gameState.resetTrigger || 0}
            />
            {selectedTowerType && (
              <div className="absolute top-4 left-4 bg-emerald-500 text-slate-900 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-[10px] sm:text-sm font-bold shadow-xl animate-pulse flex items-center gap-2 z-10">
                <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-slate-900 rounded-full" />
                타워를 배치할 위치를 클릭하세요
              </div>
            )}
          </div>
        </div>

        {/* Sidebar / Bottom Area (Bottom on Mobile) */}
        <div className="flex flex-col gap-1.5 sm:gap-2 w-full lg:w-auto order-3 lg:order-2">
          <div className="flex-1 lg:flex-none">
            <Shop 
              coins={gameState.coins}
              onBuy={handleBuyTower}
              selectedType={selectedTowerType}
            />
          </div>
          
          {/* Upgrade Info */}
          <div className="bg-slate-900/80 backdrop-blur-md border-2 border-slate-800 rounded-2xl p-2.5 sm:p-4 w-full lg:max-w-xs shadow-xl flex-1 lg:flex-none">
            <h4 className="text-xs sm:text-sm font-bold text-slate-400 uppercase tracking-widest mb-1.5">업그레이드 가이드</h4>
            <p className="text-[11px] sm:text-xs text-slate-500 leading-relaxed">
              이미 배치된 식물 타워를 클릭하면 업그레이드 퀴즈가 시작됩니다.<br />
              퀴즈를 맞히면 타워의 레벨이 올라가며 공격력, 사거리, 연사 속도가 대폭 강화되어 더 강력한 방어가 가능합니다.
            </p>
          </div>
        </div>
      </main>

      {/* Modals */}
      <QuizModal 
        isOpen={isQuizOpen}
        onClose={handleQuizClose}
        quizId={currentQuizId}
        title={pendingAction?.type === 'place' ? '타워 설치 퀴즈' : '타워 업그레이드 퀴즈'}
      />

      <AnimatePresence>
        {isHelpOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-slate-900 border-2 border-emerald-500/30 rounded-3xl p-3 sm:p-4 max-w-lg w-full shadow-2xl relative"
            >
              <button 
                onClick={() => setIsHelpOpen(false)}
                className="absolute top-2.5 right-2.5 p-1 hover:bg-slate-800 rounded-full text-slate-400 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-2.5 mb-3">
                <div className="p-1.5 bg-emerald-500/20 rounded-lg border border-emerald-500/30">
                  <BookOpen className="w-5 h-5 text-emerald-500" />
                </div>
                <div>
                  <h2 className="text-xl font-black text-white tracking-tight leading-none">게임 가이드</h2>
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest mt-0.5">식물 수호대: 세계수를 지켜라!</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
                <div className="flex items-start gap-2 bg-slate-800/30 p-2.5 rounded-xl border border-slate-800">
                  <Target className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <h3 className="font-bold text-slate-100 text-xs leading-none mb-1">게임 목표</h3>
                    <p className="text-[10px] text-slate-400 leading-relaxed">기계 곤충들의 공격으로부터 세계수를 지켜내세요. 체력이 0이 되면 게임이 종료됩니다.</p>
                  </div>
                </div>
                <div className="flex items-start gap-2 bg-slate-800/30 p-2.5 rounded-xl border border-slate-800">
                  <MousePointer2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <h3 className="font-bold text-slate-100 text-xs leading-none mb-1">타워 배치</h3>
                    <p className="text-[10px] text-slate-400 leading-relaxed">상점에서 식물을 선택하고 빈 땅을 클릭하여 배치하세요. 설치 시 퀴즈가 나타납니다.</p>
                  </div>
                </div>
                <div className="flex items-start gap-2 bg-slate-800/30 p-2.5 rounded-xl border border-slate-800">
                  <HelpCircle className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <h3 className="font-bold text-slate-100 text-xs leading-none mb-1">과학 퀴즈</h3>
                    <p className="text-[10px] text-slate-400 leading-relaxed">설치나 업그레이드 시 퀴즈를 맞히면 보너스 코인과 점수를 획득할 수 있습니다.</p>
                  </div>
                </div>
                <div className="flex items-start gap-2 bg-slate-800/30 p-2.5 rounded-xl border border-slate-800">
                  <Zap className="w-4 h-4 text-purple-500 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <h3 className="font-bold text-slate-100 text-xs leading-none mb-1">업그레이드</h3>
                    <p className="text-[10px] text-slate-400 leading-relaxed">배치된 타워를 클릭하여 강화하세요. 공격력과 사거리가 비약적으로 상승합니다.</p>
                  </div>
                </div>
              </div>

              <div className="p-2.5 bg-slate-800/50 rounded-xl border border-slate-700 mb-3">
                <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">타워 종류 및 특징</h4>
                <div className="grid grid-cols-4 gap-1">
                  <div className="text-center">
                    <div className="text-base mb-0.5">🟤</div>
                    <div className="text-[10px] font-bold text-slate-300 leading-none">뿌리</div>
                    <div className="text-[9px] text-slate-500">기본 방어</div>
                  </div>
                  <div className="text-center">
                    <div className="text-base mb-0.5">🟢</div>
                    <div className="text-[10px] font-bold text-slate-300 leading-none">줄기</div>
                    <div className="text-[9px] text-slate-500">강력한 한방</div>
                  </div>
                  <div className="text-center">
                    <div className="text-base mb-0.5">🍃</div>
                    <div className="text-[10px] font-bold text-slate-300 leading-none">잎</div>
                    <div className="text-[9px] text-slate-500">빠른 연사</div>
                  </div>
                  <div className="text-center">
                    <div className="text-base mb-0.5">🌸</div>
                    <div className="text-[10px] font-bold text-slate-300 leading-none">꽃</div>
                    <div className="text-[9px] text-slate-500">범위 공격</div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <div className="text-center">
                  <p className="text-[11px] text-slate-500 font-medium">
                    제작자 : 열혈교사 최영환(teacher@happyclass.kr)
                  </p>
                </div>
                <button 
                  onClick={() => setIsHelpOpen(false)}
                  className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-lg transition-all shadow-lg shadow-emerald-600/20 text-sm"
                >
                  확인했습니다
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {showLearningObjectives && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-slate-900 border-2 border-emerald-500/30 rounded-3xl p-8 max-w-md w-full shadow-2xl text-center relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-slate-800">
                <motion.div 
                  initial={{ width: "100%" }}
                  animate={{ width: "0%" }}
                  transition={{ duration: 6, ease: "linear" }}
                  className="h-full bg-emerald-500"
                />
              </div>
              
              <div className="mb-6 inline-flex p-4 bg-emerald-500/20 rounded-2xl border border-emerald-500/30">
                <TreePine className="w-10 h-10 text-emerald-500" />
              </div>
              
              <h2 className="text-2xl font-black text-white mb-4 tracking-tight">학습 목표</h2>
              
              <div className="space-y-4 text-slate-300 leading-relaxed mb-8">
                <p className="text-lg font-bold text-emerald-400">
                  6학년 과학: 식물의 구조와 기능
                </p>
                <p className="text-base">
                  식물의 뿌리, 줄기, 잎, 꽃, 열매가 하는 일을 이해하고 기계 곤충들의 공격으로부터 세계수를 안전하게 지켜내세요! 퀴즈를 맞히면 추가 코인을 얻어 더 강력한 식물을 배치할 수 있습니다.
                </p>
              </div>

              <div className="flex flex-col items-center gap-2">
                <div className="text-4xl font-black text-white tabular-nums">
                  {learningObjectivesCountdown}
                </div>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">잠시 후 게임이 시작됩니다</p>
              </div>
              
              <button 
                onClick={() => setShowLearningObjectives(false)}
                className="mt-8 w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-2xl transition-all shadow-lg shadow-emerald-600/20"
              >
                바로 시작하기
              </button>
            </motion.div>
          </motion.div>
        )}

        {gameState.isGameOver && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-slate-900 border-2 border-rose-500/30 rounded-3xl p-12 max-w-md w-full text-center shadow-[0_0_100px_rgba(244,63,94,0.2)]"
            >
              <div className="w-24 h-24 bg-rose-500/20 rounded-full flex items-center justify-center mx-auto mb-8 border-2 border-rose-500/30">
                <RefreshCcw className="w-12 h-12 text-rose-500" />
              </div>
              <h2 className="text-4xl font-black text-slate-100 mb-4 tracking-tighter uppercase">게임 종료</h2>
              <p className="text-slate-400 mb-8 text-lg">세계수가 파괴되었습니다...<br />다시 도전하여 식물의 지혜를 모아보세요!</p>
              
              <div className="bg-slate-800/50 rounded-2xl p-6 mb-8 border border-slate-700">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-widest block mb-1">최종 점수</span>
                <span className="text-4xl font-black text-emerald-500 tabular-nums">{gameState.score}</span>
              </div>

              <div className="flex flex-col gap-3">
                <button 
                  onClick={() => resetGame(false)}
                  className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-bold text-xl transition-all shadow-lg shadow-emerald-600/20 flex flex-col items-center justify-center gap-1"
                >
                  <div className="flex items-center gap-3">
                    <Play className="w-6 h-6" />
                    현재 레벨 재도전 (WAVE {gameState.wave})
                  </div>
                  <span className="text-[10px] opacity-70 font-medium tracking-wider">-10,000 SCORE</span>
                </button>
                <button 
                  onClick={() => resetGame(true)}
                  className="w-full py-4 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-2xl font-bold text-xl transition-all border border-slate-700 flex items-center justify-center gap-3"
                >
                  <RefreshCcw className="w-6 h-6" />
                  처음부터 다시 시작
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Footer / Instructions */}
      <footer className="max-w-7xl mx-auto p-8 border-t border-slate-900 mt-12 text-center text-slate-600 text-sm">
        <p>© 2026 식물 구조 수호대 - 6학년 과학 교육용 게임</p>
      </footer>
    </div>
  );
}
