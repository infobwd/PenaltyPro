import React, { useState, useEffect, useRef } from 'react';
import { Team, Player, MatchState, MatchEvent, KickResult } from '../types';
import { Play, Pause, Square, Plus, Flag, User, Clock, ArrowRight, RotateCcw, Save, Check } from 'lucide-react';
import confetti from 'canvas-confetti';

interface RegularMatchInterfaceProps {
  teamA: Team;
  teamB: Team;
  matchId: string;
  tournamentId: string;
  roster: Player[];
  onFinishMatch: (finalState: MatchState) => void;
  onUpdateState: (currentState: MatchState) => void;
}

const RegularMatchInterface: React.FC<RegularMatchInterfaceProps> = ({ teamA, teamB, matchId, tournamentId, roster, onFinishMatch, onUpdateState }) => {
  const [seconds, setSeconds] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [scoreA, setScoreA] = useState(0);
  const [scoreB, setScoreB] = useState(0);
  const [events, setEvents] = useState<MatchEvent[]>([]);
  
  const [eventModal, setEventModal] = useState<{ isOpen: boolean, type: 'GOAL' | 'YELLOW_CARD' | 'RED_CARD', teamId: 'A' | 'B' } | null>(null);
  
  // Ref for interval
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (isRunning) {
      timerRef.current = window.setInterval(() => {
        setSeconds(prev => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isRunning]);

  const formatTime = (totalSeconds: number) => {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleStartStop = () => setIsRunning(!isRunning);
  
  const handleResetTimer = () => {
      if(window.confirm("ต้องการรีเซ็ตเวลาหรือไม่?")) {
          setIsRunning(false);
          setSeconds(0);
      }
  };

  const handleAddEvent = (type: 'GOAL' | 'YELLOW_CARD' | 'RED_CARD', teamId: 'A' | 'B') => {
      setEventModal({ isOpen: true, type, teamId });
  };

  const confirmEvent = (player: Player | string) => {
      if (!eventModal) return;
      
      const playerName = typeof player === 'string' ? player : player.name;
      const newEvent: MatchEvent = {
          id: `E_${Date.now()}`,
          matchId,
          tournamentId,
          minute: Math.ceil(seconds / 60) || 1,
          type: eventModal.type,
          player: playerName,
          teamId: eventModal.teamId,
          timestamp: Date.now()
      };

      const updatedEvents = [newEvent, ...events]; // Newest first
      setEvents(updatedEvents);

      if (eventModal.type === 'GOAL') {
          if (eventModal.teamId === 'A') setScoreA(prev => prev + 1);
          else setScoreB(prev => prev + 1);
      }

      setEventModal(null);
      
      // Auto-save state hook
      // onUpdateState({ ... });
  };

  const finishMatch = () => {
      if (!window.confirm("ยืนยันจบการแข่งขัน?")) return;
      
      setIsRunning(false);
      let winner: 'A' | 'B' | null = null;
      if (scoreA > scoreB) winner = 'A';
      else if (scoreB > scoreA) winner = 'B';

      const finalState: MatchState = {
          matchId,
          tournamentId,
          teamA,
          teamB,
          scoreA,
          scoreB,
          winner,
          isFinished: true,
          events: events,
          kicks: [], // Empty kicks for regular match unless PKs
          currentRound: 0,
          currentTurn: 'A'
      };
      
      if (winner) {
          confetti({
            particleCount: 150,
            spread: 70,
            origin: { y: 0.6 },
            colors: winner === 'A' ? ['#2563EB', '#60A5FA'] : ['#E11D48', '#FB7185']
          });
      }

      onFinishMatch(finalState);
  };

  const getTeamRoster = (teamId: string) => roster.filter(p => p.teamId === teamId);

  return (
    <div className="w-full max-w-4xl mx-auto p-4 space-y-6">
       
       {/* Scoreboard */}
       <div className="bg-slate-900 rounded-2xl p-6 text-white shadow-2xl relative overflow-hidden">
           {/* Background Accents */}
           <div className="absolute top-0 left-0 w-32 h-32 bg-blue-500 opacity-10 rounded-full -translate-x-10 -translate-y-10 blur-xl"></div>
           <div className="absolute bottom-0 right-0 w-32 h-32 bg-red-500 opacity-10 rounded-full translate-x-10 translate-y-10 blur-xl"></div>

           <div className="flex justify-between items-center relative z-10">
               {/* Team A */}
               <div className="flex flex-col items-center flex-1">
                   {teamA.logoUrl ? <img src={teamA.logoUrl} className="w-16 h-16 bg-white rounded-xl p-1 mb-2" /> : <div className="w-16 h-16 bg-white/10 rounded-xl flex items-center justify-center text-2xl font-bold">A</div>}
                   <h2 className="font-bold text-lg text-center leading-tight">{teamA.name}</h2>
               </div>

               {/* Score & Timer */}
               <div className="flex flex-col items-center mx-4">
                   <div className="text-5xl md:text-7xl font-mono font-black tracking-widest mb-2 flex items-center gap-4">
                       <span className="text-blue-400">{scoreA}</span>
                       <span className="text-slate-600 text-3xl">:</span>
                       <span className="text-red-400">{scoreB}</span>
                   </div>
                   <div className={`font-mono text-2xl font-bold px-4 py-1 rounded-lg border ${isRunning ? 'bg-green-900/50 border-green-500 text-green-400' : 'bg-slate-800 border-slate-600 text-slate-400'}`}>
                       {formatTime(seconds)}
                   </div>
               </div>

               {/* Team B */}
               <div className="flex flex-col items-center flex-1">
                   {teamB.logoUrl ? <img src={teamB.logoUrl} className="w-16 h-16 bg-white rounded-xl p-1 mb-2" /> : <div className="w-16 h-16 bg-white/10 rounded-xl flex items-center justify-center text-2xl font-bold">B</div>}
                   <h2 className="font-bold text-lg text-center leading-tight">{teamB.name}</h2>
               </div>
           </div>
       </div>

       {/* Controls */}
       <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
           {/* Team A Actions */}
           <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 space-y-3">
               <h3 className="font-bold text-blue-700 text-center border-b pb-2 mb-2">Team A Controls</h3>
               <button onClick={() => handleAddEvent('GOAL', 'A')} className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold flex items-center justify-center gap-2 shadow-sm transition transform active:scale-95">
                   ⚽ Goal (+1)
               </button>
               <div className="grid grid-cols-2 gap-2">
                   <button onClick={() => handleAddEvent('YELLOW_CARD', 'A')} className="py-2 bg-yellow-400 hover:bg-yellow-500 text-yellow-900 rounded-lg font-bold text-sm shadow-sm">🟨 Yellow</button>
                   <button onClick={() => handleAddEvent('RED_CARD', 'A')} className="py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold text-sm shadow-sm">🟥 Red</button>
               </div>
           </div>

           {/* Timer Controls */}
           <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col justify-center gap-3">
               <button onClick={handleStartStop} className={`w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-2 shadow-md transition ${isRunning ? 'bg-orange-100 text-orange-600 hover:bg-orange-200' : 'bg-green-600 text-white hover:bg-green-700'}`}>
                   {isRunning ? <><Pause className="w-6 h-6"/> Pause</> : <><Play className="w-6 h-6"/> Start Match</>}
               </button>
               <div className="grid grid-cols-2 gap-2">
                   <button onClick={() => setSeconds(s => s + 60)} className="py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg font-bold text-xs flex items-center justify-center gap-1"><Plus className="w-3 h-3"/> 1 Min</button>
                   <button onClick={handleResetTimer} className="py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg font-bold text-xs flex items-center justify-center gap-1"><RotateCcw className="w-3 h-3"/> Reset</button>
               </div>
               <button onClick={finishMatch} className="w-full py-3 border-2 border-slate-800 text-slate-800 hover:bg-slate-800 hover:text-white rounded-xl font-bold transition flex items-center justify-center gap-2 mt-auto">
                   <Flag className="w-5 h-5" /> จบการแข่งขัน
               </button>
           </div>

           {/* Team B Actions */}
           <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 space-y-3">
               <h3 className="font-bold text-red-700 text-center border-b pb-2 mb-2">Team B Controls</h3>
               <button onClick={() => handleAddEvent('GOAL', 'B')} className="w-full py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold flex items-center justify-center gap-2 shadow-sm transition transform active:scale-95">
                   ⚽ Goal (+1)
               </button>
               <div className="grid grid-cols-2 gap-2">
                   <button onClick={() => handleAddEvent('YELLOW_CARD', 'B')} className="py-2 bg-yellow-400 hover:bg-yellow-500 text-yellow-900 rounded-lg font-bold text-sm shadow-sm">🟨 Yellow</button>
                   <button onClick={() => handleAddEvent('RED_CARD', 'B')} className="py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold text-sm shadow-sm">🟥 Red</button>
               </div>
           </div>
       </div>

       {/* Timeline */}
       <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
           <div className="bg-slate-50 p-3 border-b border-slate-200 font-bold text-slate-700 flex items-center gap-2">
               <Clock className="w-4 h-4"/> Match Timeline
           </div>
           <div className="max-h-64 overflow-y-auto p-4 space-y-4">
               {events.length === 0 ? (
                   <div className="text-center text-slate-400 text-sm py-4">ยังไม่มีเหตุการณ์</div>
               ) : (
                   events.map((e) => (
                       <div key={e.id} className={`flex items-center gap-4 ${e.teamId === 'A' ? 'flex-row' : 'flex-row-reverse text-right'}`}>
                           <div className={`text-xs font-bold w-10 text-center ${e.teamId === 'A' ? 'text-blue-600' : 'text-red-600'}`}>
                               {e.minute}'
                           </div>
                           <div className={`flex-1 p-3 rounded-lg border ${e.type === 'GOAL' ? 'bg-green-50 border-green-200' : e.type === 'YELLOW_CARD' ? 'bg-yellow-50 border-yellow-200' : 'bg-red-50 border-red-200'}`}>
                               <div className="font-bold text-sm text-slate-800">
                                   {e.type === 'GOAL' ? '⚽ GOAL!' : e.type === 'YELLOW_CARD' ? '🟨 Yellow Card' : '🟥 Red Card'}
                               </div>
                               <div className="text-xs text-slate-500">{e.player} ({e.teamId === 'A' ? teamA.name : teamB.name})</div>
                           </div>
                       </div>
                   ))
               )}
           </div>
       </div>

       {/* Modal for Player Selection */}
       {eventModal && (
           <div className="fixed inset-0 z-[1500] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setEventModal(null)}>
               <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden animate-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
                   <div className="p-4 bg-slate-50 border-b flex justify-between items-center">
                       <h3 className="font-bold text-slate-800">เลือกผู้เล่น ({eventModal.teamId === 'A' ? teamA.name : teamB.name})</h3>
                       <button onClick={() => setEventModal(null)}><div className="bg-slate-200 p-1 rounded-full"><Plus className="w-4 h-4 rotate-45"/></div></button>
                   </div>
                   <div className="p-2 max-h-80 overflow-y-auto">
                       {getTeamRoster(eventModal.teamId === 'A' ? teamA.id : teamB.id).map(p => (
                           <button key={p.id} onClick={() => confirmEvent(p)} className="w-full text-left p-3 hover:bg-indigo-50 rounded-lg flex items-center gap-3 transition border-b border-slate-50 last:border-0">
                               <div className="w-8 h-8 bg-slate-200 rounded-full flex items-center justify-center font-bold text-xs text-slate-500">{p.number}</div>
                               <div className="flex-1 font-bold text-slate-700">{p.name}</div>
                               <Check className="w-4 h-4 text-indigo-300 opacity-0 hover:opacity-100" />
                           </button>
                       ))}
                       <div className="p-2 pt-4 border-t mt-2">
                           <p className="text-xs text-slate-400 mb-2">หรือระบุชื่อเอง:</p>
                           <form onSubmit={(e) => { e.preventDefault(); const val = (e.currentTarget.elements[0] as HTMLInputElement).value; if(val) confirmEvent(val); }}>
                               <input type="text" className="w-full p-2 border rounded-lg text-sm" placeholder="พิมพ์ชื่อนักเตะ..." autoFocus />
                           </form>
                       </div>
                   </div>
               </div>
           </div>
       )}

    </div>
  );
};

export default RegularMatchInterface;