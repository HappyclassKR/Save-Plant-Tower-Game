import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { QUIZZES } from '../constants';
import { Quiz } from '../types';
import { CheckCircle2, XCircle, HelpCircle } from 'lucide-react';

interface QuizModalProps {
  isOpen: boolean;
  onClose: (correct: boolean) => void;
  quizId: number | null;
  title?: string;
}

const QuizModal: React.FC<QuizModalProps> = ({ isOpen, onClose, quizId, title = "식물 과학 퀴즈" }) => {
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [shuffledOptions, setShuffledOptions] = useState<{ text: string, originalIndex: number }[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [isDelayed, setIsDelayed] = useState(true);

  useEffect(() => {
    if (isOpen && quizId !== null) {
      const selectedQuiz = QUIZZES.find(q => q.id === quizId) || QUIZZES[0];
      setQuiz(selectedQuiz);
      
      // Shuffle options
      const optionsWithIndices = selectedQuiz.options.map((text, index) => ({ text, originalIndex: index }));
      for (let i = optionsWithIndices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [optionsWithIndices[i], optionsWithIndices[j]] = [optionsWithIndices[j], optionsWithIndices[i]];
      }
      setShuffledOptions(optionsWithIndices);
      
      setSelected(null);
      setIsAnswered(false);
      setIsDelayed(true);

      const timer = setTimeout(() => {
        setIsDelayed(false);
      }, 500); // 0.5s delay

      return () => clearTimeout(timer);
    }
  }, [isOpen, quizId]);

  if (!quiz) return null;

  const handleSelect = (shuffledIndex: number) => {
    if (isAnswered || isDelayed) return;
    setSelected(shuffledIndex);
    setIsAnswered(true);
    
    const originalIndex = shuffledOptions[shuffledIndex].originalIndex;
    
    setTimeout(() => {
      onClose(originalIndex === quiz.answer);
    }, 2500);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className="bg-slate-900 border-2 border-emerald-500/30 rounded-2xl p-8 max-w-lg w-full shadow-[0_0_50px_rgba(16,185,129,0.2)]"
          >
            {isDelayed ? (
              <div className="flex flex-col items-center justify-center py-12 gap-4">
                <motion.div 
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  className="w-12 h-12 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full"
                />
                <p className="text-emerald-500 font-bold animate-pulse">퀴즈 준비 중...</p>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3 mb-6 text-emerald-400">
                  <HelpCircle className="w-8 h-8" />
                  <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
                </div>

                <p className="text-xl text-slate-100 mb-8 leading-relaxed font-medium">
                  {quiz.question}
                </p>

                <div className="space-y-3">
                  {shuffledOptions.map((option, index) => {
                    const isCorrect = option.originalIndex === quiz.answer;
                    const isSelected = index === selected;
                    
                    let bgColor = "bg-slate-800 hover:bg-slate-700 border-slate-700";
                    if (isAnswered) {
                      if (isCorrect) bgColor = "bg-emerald-500/20 border-emerald-500 text-emerald-400";
                      else if (isSelected) bgColor = "bg-rose-500/20 border-rose-500 text-rose-400";
                      else bgColor = "bg-slate-800/50 border-slate-800 text-slate-500";
                    }

                    return (
                      <button
                        key={index}
                        onClick={() => handleSelect(index)}
                        disabled={isAnswered}
                        className={`w-full p-4 rounded-xl border-2 transition-all duration-200 text-left flex items-center justify-between group ${bgColor}`}
                      >
                        <span className="text-lg">{option.text}</span>
                        {isAnswered && isCorrect && <CheckCircle2 className="w-6 h-6" />}
                        {isAnswered && isSelected && !isCorrect && <XCircle className="w-6 h-6" />}
                      </button>
                    );
                  })}
                </div>

                {isAnswered && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`mt-6 p-4 rounded-xl border-l-4 ${
                      shuffledOptions[selected!].originalIndex === quiz.answer ? 'bg-emerald-500/10 border-emerald-500' : 'bg-rose-500/10 border-rose-500'
                    }`}
                  >
                    <p className="text-sm font-semibold uppercase tracking-wider mb-1 opacity-70">
                      {shuffledOptions[selected!].originalIndex === quiz.answer ? '정답입니다!' : '틀렸습니다...'}
                    </p>
                    <p className="text-slate-300 italic">
                      {quiz.explanation}
                    </p>
                  </motion.div>
                )}
              </>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default QuizModal;
