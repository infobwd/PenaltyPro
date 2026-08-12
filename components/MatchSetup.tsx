import React, { useState } from 'react';
import { Trophy, ArrowRight, Users, ChevronDown, ChevronUp, EyeOff } from 'lucide-react';
import { Team } from '../types';

interface MatchSetupProps {
  onStart: (teamA: Team, teamB: Team) => void;
  availableTeams: Team[];
  isLoadingData: boolean;
  isAdmin?: boolean;
  onHide?: () => void;
}

const createManualTeam = (name: string, id: string, color: string): Team => ({
  id,
  name,
  shortName: name.substring(0, 3).toUpperCase(),
  color,
  logoUrl: ''
});

const MatchSetup: React.FC<MatchSetupProps> = ({ onStart, availableTeams, isLoadingData, isAdmin = false, onHide }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [teamAId, setTeamAId] = useState<string>('');
  const [teamBId, setTeamBId] = useState<string>('');
  
  const [manualTeamA, setManualTeamA] = useState('');
  const [manualTeamB, setManualTeamB] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    let teamAObj: Team;
    let teamBObj: Team;

    if (availableTeams.length > 0 && teamAId && teamBId) {
      teamAObj = availableTeams.find(t => t.id === teamAId)!;
      teamBObj = availableTeams.find(t => t.id === teamBId)!;
    } else {
      if (!manualTeamA || !manualTeamB) return;
      teamAObj = createManualTeam(manualTeamA, 'manual_a', '#2563EB');
      teamBObj = createManualTeam(manualTeamB, 'manual_b', '#E11D48');
    }
    onStart(teamAObj, teamBObj);
  };

  return (
    <div className="w-full">
      <div className="w-full flex items-center bg-indigo-600 text-white rounded-t-2xl shadow-md overflow-hidden">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="min-w-0 flex-1 flex items-center justify-between p-4 font-bold text-base sm:text-lg hover:bg-indigo-700 transition text-left"
          aria-expanded={isOpen}
        >
          <div className="flex items-center gap-2 min-w-0">
              <Trophy className="w-6 h-6 text-yellow-300 shrink-0" />
              <span className="truncate">โหมดการดวลจุดโทษ (Shootout)</span>
          </div>
          {isOpen ? <ChevronUp className="w-6 h-6 shrink-0" /> : <ChevronDown className="w-6 h-6 shrink-0" />}
        </button>
        {isAdmin && onHide && (
          <button
            type="button"
            onClick={onHide}
            className="self-stretch px-3 border-l border-white/20 hover:bg-indigo-800 transition flex items-center gap-1 text-xs font-bold"
            title="ซ่อนการ์ดนี้จากหน้าหลัก"
          >
            <EyeOff className="w-4 h-4" />
            <span className="hidden sm:inline">ซ่อน</span>
          </button>
        )}
      </div>

      {isOpen && (
        <div className="bg-white rounded-b-2xl shadow-xl p-6 border border-t-0 border-slate-200 animate-in slide-in-from-top-2">
            <div className="flex justify-end mb-2">
                
            </div>
            <form onSubmit={handleSubmit} className="space-y-6">
            {availableTeams.length > 0 ? (
                <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">ทีมเหย้า (Home)</label>
                        <div className="relative">
                        <select value={teamAId} onChange={(e) => setTeamAId(e.target.value)} className="w-full p-3 border border-slate-300 rounded-lg bg-white appearance-none" required>
                            <option value="">เลือกทีม...</option>
                            {availableTeams.map(t => <option key={t.id} value={t.id} disabled={t.id === teamBId}>{t.name}</option>)}
                        </select>
                        <Users className="absolute right-3 top-3.5 w-4 h-4 text-slate-400 pointer-events-none" />
                        </div>
                    </div>
                    <div className="hidden md:flex justify-center pb-3"><span className="text-slate-400 font-bold">VS</span></div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">ทีมเยือน (Away)</label>
                        <div className="relative">
                        <select value={teamBId} onChange={(e) => setTeamBId(e.target.value)} className="w-full p-3 border border-slate-300 rounded-lg bg-white appearance-none" required>
                            <option value="">เลือกทีม...</option>
                            {availableTeams.map(t => <option key={t.id} value={t.id} disabled={t.id === teamAId}>{t.name}</option>)}
                        </select>
                        <Users className="absolute right-3 top-3.5 w-4 h-4 text-slate-400 pointer-events-none" />
                        </div>
                    </div>
                </div>
                </>
            ) : (
                <>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">ทีมเหย้า</label><input type="text" value={manualTeamA} onChange={(e) => setManualTeamA(e.target.value)} className="w-full p-3 border rounded-lg" required placeholder="ชื่อทีม A" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">ทีมเยือน</label><input type="text" value={manualTeamB} onChange={(e) => setManualTeamB(e.target.value)} className="w-full p-3 border rounded-lg" required placeholder="ชื่อทีม B" /></div>
                </>
            )}

            <button type="submit" className="w-full flex items-center justify-center bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-xl transition shadow-lg">
                เริ่มการแข่งขัน <ArrowRight className="ml-2 w-5 h-5" />
            </button>
            </form>
        </div>
      )}
    </div>
  );
};

export default MatchSetup;
