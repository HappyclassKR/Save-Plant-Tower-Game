import React from 'react';
import { Tower } from '../types';
import { TOWER_STATS } from '../constants';
import { Coins, Shield, Leaf, Flower, TreePine, Sprout } from 'lucide-react';
import { motion } from 'motion/react';

interface ShopProps {
  coins: number;
  onBuy: (type: Tower['type']) => void;
  selectedType: Tower['type'] | null;
}

const Shop: React.FC<ShopProps> = ({ coins, onBuy, selectedType }) => {
  const towerTypes: Tower['type'][] = ['root', 'stem', 'leaf', 'flower'];

  const getIcon = (type: Tower['type']) => {
    const iconClass = "w-full h-full drop-shadow-[0_2px_2px_rgba(0,0,0,0.3)]";
    switch (type) {
      case 'root': 
        return (
          <div className="relative w-full h-full flex items-center justify-center">
            <div className="absolute inset-0 bg-amber-900/40 rounded-full blur-[2px] scale-75 translate-y-1" />
            <Sprout className={`${iconClass} text-amber-600`} />
          </div>
        );
      case 'stem': 
        return (
          <div className="relative w-full h-full flex items-center justify-center">
             <div className="absolute inset-x-0 bottom-0 h-1/3 bg-emerald-900/40 rounded-full blur-[2px] scale-90" />
             <TreePine className={`${iconClass} text-emerald-500`} />
          </div>
        );
      case 'leaf': 
        return (
          <div className="relative w-full h-full flex items-center justify-center">
            <div className="absolute top-1 right-1 w-1.5 h-1.5 bg-white/60 rounded-full blur-[0.5px] z-10" />
            <Leaf className={`${iconClass} text-lime-400`} />
          </div>
        );
      case 'flower': 
        return (
          <div className="relative w-full h-full flex items-center justify-center">
            <div className="absolute inset-0 bg-pink-500/30 rounded-full animate-pulse blur-[3px]" />
            <Flower className={`${iconClass} text-pink-300`} />
          </div>
        );
    }
  };

  const getName = (type: Tower['type']) => {
    switch (type) {
      case 'root': return '뿌리 타워';
      case 'stem': return '줄기 타워';
      case 'leaf': return '잎 타워';
      case 'flower': return '꽃 타워';
    }
  };

  const getDescription = (type: Tower['type']) => {
    switch (type) {
      case 'root': return '기본적인 방어 타워';
      case 'stem': return '강력한 한 방 데미지';
      case 'leaf': return '매우 빠른 연사 속도';
      case 'flower': return '넓은 범위와 높은 데미지';
    }
  };

  return (
    <div className="bg-slate-900/80 backdrop-blur-md border-2 border-slate-800 rounded-2xl p-2.5 sm:p-4 w-full lg:max-w-xs h-fit shadow-xl">
      <div className="flex items-center justify-between mb-2 sm:mb-4">
        <h3 className="text-sm sm:text-base font-bold text-slate-100 flex items-center gap-1.5 tracking-tight">
          <Shield className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-500" />
          상점
        </h3>
        <div className="flex items-center gap-1.5 bg-amber-500/10 px-2 sm:px-3 py-1 rounded-full border border-amber-500/30">
          <Coins className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-500" />
          <span className="text-amber-500 font-bold tabular-nums text-xs sm:text-sm">{coins}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-1 gap-1.5 sm:gap-2">
        {towerTypes.map((type) => {
          const stats = TOWER_STATS[type];
          const canAfford = coins >= (stats.cost || 0);
          const isSelected = selectedType === type;

          return (
            <motion.button
              key={type}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onBuy(type)}
              disabled={!canAfford}
              className={`w-full p-1.5 sm:p-3 rounded-xl border-2 transition-all duration-200 text-left relative group ${
                isSelected 
                  ? 'border-emerald-500 bg-emerald-500/10 shadow-[0_0_20px_rgba(16,185,129,0.1)]' 
                  : canAfford 
                    ? 'border-slate-800 bg-slate-800/50 hover:border-slate-700' 
                    : 'border-slate-800 bg-slate-800/20 opacity-50 cursor-not-allowed'
              }`}
            >
              <div className="flex flex-row items-center gap-2 sm:gap-4">
                <div className={`w-8 h-8 sm:w-12 sm:h-12 p-1 sm:p-1.5 rounded-xl shrink-0 flex items-center justify-center ${isSelected ? 'bg-emerald-500/20' : 'bg-slate-700/30'}`}>
                  {getIcon(type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-row items-center justify-between mb-0.5 sm:mb-1">
                    <span className="font-bold text-slate-100 text-[10px] sm:text-base truncate">{getName(type)}</span>
                    <span className={`text-[9px] sm:text-sm font-bold flex items-center gap-0.5 shrink-0 ${canAfford ? 'text-amber-500' : 'text-slate-500'}`}>
                      <Coins className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5" />
                      {stats.cost}
                    </span>
                  </div>
                  <div className="flex flex-row gap-x-1.5 sm:gap-x-2 text-[7px] sm:text-[10px] font-mono text-slate-500 uppercase tracking-wider">
                    <span className="shrink-0">D:{stats.damage}</span>
                    <span className="shrink-0">R:{stats.range}</span>
                    <span className="shrink-0">S:{stats.fireRate}</span>
                  </div>
                </div>
              </div>
              {isSelected && (
                <div className="absolute -right-1 -top-1 bg-emerald-500 text-slate-900 text-[6px] sm:text-[10px] font-black px-1.5 sm:px-2 py-0.5 rounded-md uppercase tracking-tighter shadow-lg z-10">
                  배치 중
                </div>
              )}
            </motion.button>
          );
        })}
      </div>
      
      <div className="mt-3 sm:mt-4 p-2 sm:p-3 bg-slate-800/30 rounded-xl border border-slate-800 hidden sm:block">
        <p className="text-[9px] sm:text-[10px] text-slate-500 text-center leading-relaxed">
          퀴즈를 풀어서 타워를 설치하고 업그레이드 하세요!<br />
          타워를 선택하고 숲의 빈 공간을 클릭하여 배치하세요.
        </p>
      </div>
    </div>
  );
};

export default Shop;
