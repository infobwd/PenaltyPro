
import React, { useState } from 'react';
import { Match, Team } from '../types';
import { X, Trophy, AlertTriangle, Check, Loader2 } from 'lucide-react';

interface PredictionModalProps {
  match: Match;
  teamA: Team;
  teamB: Team;
  currentPrediction?: 'A' | 'B';
  stats?: { a: number, b: number, total: number };
  onClose: () => void;
  onPredict: (teamId: 'A' | 'B') => Promise<void>;
}

const PredictionModal: React.FC<PredictionModalProps> = ({ match, teamA, teamB, currentPrediction, stats, onClose, onPredict }) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selected, setSelected] = useState<'A' | 'B' | null>(currentPrediction || null);

  const handlePredict = async (side: 'A' | 'B') => {
    if (isSubmitting) return;
    setSelected(side);
    setIsSubmitting(true);
    await onPredict(side);
    setIsSubmitting(false);
    // Ideally close after success or show animation
    setTimeout(onClose, 800);
  };

  const calculatePercent = (votes: number) => {
      if (!stats || stats.total === 0) return 0;
      return Math.round((votes / stats.total) * 100);
  };

  return (
    <div className="fixed inset-0 z-[1600] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in zoom-in duration-200" onClick={onClose}>
      <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden relative" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 bg-slate-100 p-2 rounded-full hover:bg-slate-200 z-10">
            <X className="w-5 h-5 text-slate-500" />
        </button>

        <div className="pt-8 pb-4 text-center px-6">
            <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight mb-1">Match Prediction</h3>
            <p className="text-slate-500 text-sm">ทายผลผู้ชนะเพื่อสะสมแต้ม Fan Zone</p>
        </div>

        <div className="p-6 pt-2">
            <div className="flex justify-between items-stretch gap-4 mb-6">
                {/* Team A Option */}
                <button 
                    onClick={() => handlePredict('A')}
                    disabled={isSubmitting}
                    className={`flex-1 flex flex-col items-center p-4 rounded-2xl border-2 transition-all relative ${selected === 'A' ? 'bg-indigo-50 border-indigo-600 shadow-md transform scale-105' : 'bg-white border-slate-200 hover:border-indigo-300'}`}
                >
                    {selected === 'A' && <div className="absolute -top-3 right-[-10px] bg-green-500 text-white p-1 rounded-full shadow-sm"><Check className="w-4 h-4"/></div>}
                    <div className="w-16 h-16 mb-3 relative">
                        {teamA.logoUrl ? <img src={teamA.logoUrl} className="w-full h-full object-contain drop-shadow-md" /> : <div className="w-full h-full bg-slate-100 rounded-full flex items-center justify-center font-bold text-slate-400">A</div>}
                    </div>
                    <span className="font-bold text-slate-800 text-sm leading-tight line-clamp-2">{teamA.name}</span>
                    {stats && (
                        <div className="mt-2 text-xs font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded-full">
                            {calculatePercent(stats.a)}% picked
                        </div>
                    )}
                </button>

                <div className="flex flex-col justify-center items-center">
                    <span className="text-2xl font-black text-slate-200">VS</span>
                </div>

                {/* Team B Option */}
                <button 
                    onClick={() => handlePredict('B')}
                    disabled={isSubmitting}
                    className={`flex-1 flex flex-col items-center p-4 rounded-2xl border-2 transition-all relative ${selected === 'B' ? 'bg-red-50 border-red-600 shadow-md transform scale-105' : 'bg-white border-slate-200 hover:border-red-300'}`}
                >
                    {selected === 'B' && <div className="absolute -top-3 right-[-10px] bg-green-500 text-white p-1 rounded-full shadow-sm"><Check className="w-4 h-4"/></div>}
                    <div className="w-16 h-16 mb-3 relative">
                        {teamB.logoUrl ? <img src={teamB.logoUrl} className="w-full h-full object-contain drop-shadow-md" /> : <div className="w-full h-full bg-slate-100 rounded-full flex items-center justify-center font-bold text-slate-400">B</div>}
                    </div>
                    <span className="font-bold text-slate-800 text-sm leading-tight line-clamp-2">{teamB.name}</span>
                    {stats && (
                        <div className="mt-2 text-xs font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded-full">
                            {calculatePercent(stats.b)}% picked
                        </div>
                    )}
                </button>
            </div>

            {isSubmitting && (
                <div className="text-center text-indigo-600 text-sm font-bold flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin"/> กำลังบันทึกคำทำนาย...
                </div>
            )}
            
            <div className="bg-yellow-50 p-3 rounded-xl border border-yellow-100 flex gap-2 items-start text-xs text-yellow-800 mt-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <p>ทายถูกรับ 10 คะแนน! คุณสามารถเปลี่ยนใจได้จนกว่าการแข่งขันจะเริ่ม</p>
            </div>
        </div>
      </div>
    </div>
  );
};

export default PredictionModal;
