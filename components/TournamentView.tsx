import React, { useState, useEffect } from 'react';
import { Team, Match } from '../types';
import { Trophy, Edit2, Check, ArrowRight, UserX, ShieldAlert, Sparkles, GripVertical, PlayCircle, AlertCircle, Lock, Eraser, MapPin, Clock, Calendar, RefreshCw, Minimize2, Maximize2 } from 'lucide-react';
import { scheduleMatch, saveMatchToSheet } from '../services/sheetService';

interface TournamentViewProps {
  teams: Team[];
  matches: Match[]; 
  onSelectMatch: (teamA: Team, teamB: Team, matchId?: string) => void;
  onBack: () => void;
  isAdmin: boolean;
  onRefresh: () => void;
  onLoginClick: () => void;
  isLoading?: boolean;
  showNotification?: (title: string, message: string, type: 'success' | 'error' | 'info' | 'warning') => void;
}

const TournamentView: React.FC<TournamentViewProps> = ({ teams, matches, onSelectMatch, onBack, isAdmin, onRefresh, onLoginClick, isLoading, showNotification }) => {
  const [editMode, setEditMode] = useState(false);
  const [localMatches, setLocalMatches] = useState<Match[]>([]);
  const [isLargeBracket, setIsLargeBracket] = useState(false);
  
  const [walkoverModal, setWalkoverModal] = useState<{match: Match, label: string} | null>(null);

  useEffect(() => {
      if (teams.length > 16) {
          setIsLargeBracket(true);
      }
  }, [teams.length]);

  useEffect(() => {
      const savedLayout = localStorage.getItem('bracket_layout_backup');
      let cachedMatches: Match[] = [];
      if (savedLayout) {
          try {
              cachedMatches = JSON.parse(savedLayout);
          } catch (e) {}
      }

      const allSlots = [
          ...Array(8).fill(null).map((_, i) => `R32-${i+1}`),
          ...Array(4).fill(null).map((_, i) => `R16-${i+1}`),
          ...Array(2).fill(null).map((_, i) => `QF${i+1}`),
          'SF1',
          ...Array(8).fill(null).map((_, i) => `R32-${i+9}`),
          ...Array(4).fill(null).map((_, i) => `R16-${i+5}`),
          ...Array(2).fill(null).map((_, i) => `QF${i+3}`),
          'SF2',
          'FINAL'
      ];

      const combinedMatches: Match[] = [];
      allSlots.forEach(label => {
          const serverMatch = matches.find(m => m.roundLabel === label);
          if (serverMatch) {
              combinedMatches.push(serverMatch);
          } else {
              const localMatch = cachedMatches.find(m => m.roundLabel === label);
              if (localMatch) combinedMatches.push(localMatch);
          }
      });
      
      matches.forEach(m => {
          if (!m.roundLabel || !combinedMatches.find(cm => cm.id === m.id)) {
              combinedMatches.push(m);
          }
      });

      setLocalMatches(combinedMatches);
  }, [matches]);

  useEffect(() => {
      if (localMatches.length > 0) {
          localStorage.setItem('bracket_layout_backup', JSON.stringify(localMatches));
      }
  }, [localMatches]);

  const getScheduledMatch = (label: string) => localMatches.find(m => m.roundLabel === label);

  const handleDragStart = (e: React.DragEvent, name: string) => {
      e.dataTransfer.setData('text/plain', name);
      e.dataTransfer.effectAllowed = 'copyMove';
  };

  const handleDrop = async (teamName: string, roundLabel: string, slot: 'A' | 'B') => {
      let updatedMatch: Match | null = null;
      setLocalMatches(prev => {
          const newMatches = [...prev];
          const existingIndex = newMatches.findIndex(m => m.roundLabel === roundLabel);
          const finalName = teamName === 'CLEAR_SLOT' ? '' : teamName;

          if (existingIndex >= 0) {
              const m = newMatches[existingIndex];
              updatedMatch = {
                  ...m,
                  teamA: slot === 'A' ? finalName : typeof m.teamA === 'object' ? m.teamA.name : m.teamA,
                  teamB: slot === 'B' ? finalName : typeof m.teamB === 'object' ? m.teamB.name : m.teamB,
              };
              newMatches[existingIndex] = updatedMatch;
          } else {
              updatedMatch = {
                  id: `M_${roundLabel}_${Date.now()}`,
                  teamA: slot === 'A' ? finalName : '',
                  teamB: slot === 'B' ? finalName : '',
                  scoreA: 0, scoreB: 0, winner: null, date: new Date().toISOString(),
                  roundLabel: roundLabel, status: 'Scheduled'
              } as Match;
              newMatches.push(updatedMatch);
          }
          return newMatches;
      });

      if (updatedMatch) {
          const teamA = typeof updatedMatch.teamA === 'object' ? updatedMatch.teamA.name : updatedMatch.teamA;
          const teamB = typeof updatedMatch.teamB === 'object' ? updatedMatch.teamB.name : updatedMatch.teamB;
          await scheduleMatch(updatedMatch.id, teamA as string, teamB as string, roundLabel, updatedMatch.venue, updatedMatch.scheduledTime);
          setTimeout(onRefresh, 1500);
      }
  };

  const handleMatchDetailsUpdate = async (match: Match, updates: Partial<Match>) => {
      const updatedMatch = { ...match, ...updates };
      setLocalMatches(prev => prev.map(m => m.id === match.id ? updatedMatch : m));
      const teamA = typeof updatedMatch.teamA === 'object' ? updatedMatch.teamA.name : updatedMatch.teamA;
      const teamB = typeof updatedMatch.teamB === 'object' ? updatedMatch.teamB.name : updatedMatch.teamB;
      await scheduleMatch(updatedMatch.id, teamA as string, teamB as string, updatedMatch.roundLabel || '', updatedMatch.venue, updatedMatch.scheduledTime);
      onRefresh();
  };

  const handleWalkover = async (winner: string) => {
     if (!walkoverModal) return;
     const matchId = walkoverModal.match.id || `M_${walkoverModal.label}_${Date.now()}`;
     const dummyMatch: any = {
         matchId: matchId,
         teamA: { name: typeof walkoverModal.match.teamA === 'string' ? walkoverModal.match.teamA : (walkoverModal.match.teamA as Team).name }, 
         teamB: { name: typeof walkoverModal.match.teamB === 'string' ? walkoverModal.match.teamB : (walkoverModal.match.teamB as Team).name },
         scoreA: winner === walkoverModal.match.teamA ? 3 : 0,
         scoreB: winner === walkoverModal.match.teamB ? 3 : 0,
         winner: winner === walkoverModal.match.teamA ? 'A' : 'B',
         kicks: []
     };
     const payload = { ...dummyMatch, roundLabel: walkoverModal.label };
     await saveMatchToSheet(payload, "ชนะบาย (Walkover) / สละสิทธิ์");
     setWalkoverModal(null);
     if (showNotification) showNotification("เรียบร้อย", "บันทึกผลชนะบายแล้ว", "success");
     onRefresh();
  };

  const approvedTeams = teams.filter(t => t.status === 'Approved');

  const round32_A = Array(8).fill(null).map((_, i) => ({ label: `R32-${i+1}`, title: `R32 คู่ที่ ${i+1}` }));
  const round16_A = Array(4).fill(null).map((_, i) => ({ label: `R16-${i+1}`, title: `R16 คู่ที่ ${i+1}` }));
  const quarters_A = Array(2).fill(null).map((_, i) => ({ label: `QF${i+1}`, title: `QF คู่ที่ ${i+1}` }));
  const semis_A = [{ label: `SF1`, title: `SF สาย A` }];
  const round32_B = Array(8).fill(null).map((_, i) => ({ label: `R32-${i+9}`, title: `R32 คู่ที่ ${i+9}` }));
  const round16_B = Array(4).fill(null).map((_, i) => ({ label: `R16-${i+5}`, title: `R16 คู่ที่ ${i+5}` }));
  const quarters_B = Array(2).fill(null).map((_, i) => ({ label: `QF${i+3}`, title: `QF คู่ที่ ${i+3}` }));
  const semis_B = [{ label: `SF2`, title: `SF สาย B` }];
  const final = [{ label: `FINAL`, title: `ชิงชนะเลิศ` }];

  return (
    <div className="w-full max-w-[98%] mx-auto p-2 md:p-4 min-h-screen flex flex-col">
      <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-200 sticky top-0 z-30">
         <div className="w-full md:w-auto">
             <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                <Trophy className="w-6 h-6 text-yellow-500" /> แผนผัง <span className="hidden md:inline">การแข่งขัน</span>
             </h2>
             <p className="text-xs text-slate-500">
                {isAdmin ? "ลากทีมเพื่อจับคู่" : "เลื่อนซ้าย-ขวาเพื่อดู"}
             </p>
         </div>
         <div className="flex gap-2 w-full md:w-auto overflow-x-auto pb-2 md:pb-0">
            <button onClick={() => setIsLargeBracket(!isLargeBracket)} className="flex items-center gap-2 px-3 py-2 bg-slate-100 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-200 transition text-xs whitespace-nowrap">
                {isLargeBracket ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />} {isLargeBracket ? 'ลด (16)' : 'ขยาย (32)'}
            </button>
            <button onClick={onRefresh} className="flex items-center gap-2 px-3 py-2 bg-slate-100 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-200 transition text-xs whitespace-nowrap">
                <RefreshCw className="w-4 h-4" /> Refresh
            </button>
            {!isAdmin && <button onClick={onLoginClick} className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 text-slate-600 rounded-lg hover:bg-slate-50 transition font-bold text-xs whitespace-nowrap"><Lock className="w-4 h-4" /> Login</button>}
            {isAdmin && (
                <button onClick={() => setEditMode(!editMode)} className={`flex items-center gap-2 px-4 py-2 rounded-lg transition font-bold text-xs whitespace-nowrap ${editMode ? 'bg-indigo-600 text-white shadow-lg ring-2 ring-indigo-200' : 'bg-white border border-slate-300 text-slate-600'}`}>
                    {editMode ? <Check className="w-4 h-4" /> : <Edit2 className="w-4 h-4" />} {editMode ? 'เสร็จสิ้น' : 'จัดการ'}
                </button>
            )}
            <button onClick={onBack} className="text-xs text-slate-500 hover:text-indigo-600 px-4 py-2 font-medium whitespace-nowrap">กลับ</button>
         </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 flex-1 items-start relative">
          
          {editMode && isAdmin && (
            <div className="lg:w-64 w-full bg-white rounded-xl shadow-lg border border-slate-200 p-4 lg:sticky top-28 max-h-[300px] lg:max-h-[calc(100vh-120px)] overflow-y-auto z-40">
                <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2"><UserX className="w-4 h-4" /> ทีม</h3>
                <div className="mb-4 pb-4 border-b border-slate-100">
                    <div draggable onDragStart={(e) => handleDragStart(e, "Wildcard")} className="p-3 bg-purple-50 border border-purple-200 text-purple-700 rounded-lg cursor-grab text-sm font-bold flex gap-2 mb-2"><Sparkles className="w-4 h-4" /> Wildcard</div>
                    <div draggable onDragStart={(e) => handleDragStart(e, "CLEAR_SLOT")} className="p-2 bg-red-50 border border-red-200 text-red-500 rounded-lg cursor-grab text-xs text-center"><Eraser className="w-3 h-3 inline" /> ล้างช่อง</div>
                </div>
                <div className="space-y-2 mb-4">
                    {approvedTeams.map(t => (
                        <div key={t.id} draggable onDragStart={(e) => handleDragStart(e, t.name)} className="p-2 bg-slate-50 border border-slate-200 rounded cursor-grab text-sm font-medium truncate flex gap-2"><GripVertical className="w-3 h-3 text-slate-300" />{t.name}</div>
                    ))}
                </div>
            </div>
          )}

          <div className="flex-1 w-full overflow-x-auto pb-10 custom-scrollbar -webkit-overflow-scrolling-touch">
             <div className="md:hidden text-center text-slate-400 text-xs mb-2 flex items-center justify-center gap-2 opacity-50">
                 <ArrowRight className="w-3 h-3" /> เลื่อนเพื่อดูสายการแข่งขัน <ArrowRight className="w-3 h-3" />
             </div>

             <div className={`flex flex-col gap-8 ${isLargeBracket ? 'min-w-[1400px]' : 'min-w-[1100px]'}`}>
                 
                 <div className="bg-blue-50/50 p-4 md:p-6 rounded-3xl border border-blue-100 shadow-inner">
                     <div className="mb-6 flex items-center gap-2 text-blue-800 font-bold uppercase tracking-wider border-b border-blue-200 pb-2">
                        <span className="bg-blue-600 text-white px-3 py-1 rounded-full text-xs shadow-sm">Line A</span> สายบน
                     </div>
                     <div className="flex justify-start gap-4 md:gap-8 items-center">
                        {isLargeBracket && (
                            <>
                                <BracketColumn title="รอบ 32" color="border-slate-300">
                                    {isLoading ? <BracketSkeleton count={8} /> : round32_A.map(slot => <BracketNode key={slot.label} slot={slot} match={getScheduledMatch(slot.label)} isEditing={editMode} isAdmin={isAdmin} onDrop={handleDrop} onPlay={onSelectMatch} fullTeams={teams} onWalkover={(m) => setWalkoverModal({match: m, label: slot.label})} onUpdateDetails={handleMatchDetailsUpdate} showNotification={showNotification} />)}
                                </BracketColumn>
                                <ArrowRight className="text-slate-300 w-4" />
                            </>
                        )}
                        <BracketColumn title="รอบ 16" color="border-slate-300">
                             {isLoading ? <BracketSkeleton count={4} /> : round16_A.map(slot => <BracketNode key={slot.label} slot={slot} match={getScheduledMatch(slot.label)} isEditing={editMode} isAdmin={isAdmin} onDrop={handleDrop} onPlay={onSelectMatch} fullTeams={teams} onWalkover={(m) => setWalkoverModal({match: m, label: slot.label})} onUpdateDetails={handleMatchDetailsUpdate} showNotification={showNotification} />)}
                        </BracketColumn>
                        <ArrowRight className="text-blue-200 w-6" />
                        <BracketColumn title="รอบ 8" color="border-indigo-300">
                             {isLoading ? <BracketSkeleton count={2} /> : quarters_A.map(slot => <BracketNode key={slot.label} slot={slot} match={getScheduledMatch(slot.label)} isEditing={editMode} isAdmin={isAdmin} onDrop={handleDrop} onPlay={onSelectMatch} fullTeams={teams} onWalkover={(m) => setWalkoverModal({match: m, label: slot.label})} onUpdateDetails={handleMatchDetailsUpdate} showNotification={showNotification} />)}
                        </BracketColumn>
                         <ArrowRight className="text-indigo-200 w-6" />
                        <BracketColumn title="รอบรองฯ" color="border-orange-300">
                             {isLoading ? <BracketSkeleton count={1} /> : semis_A.map(slot => <BracketNode key={slot.label} slot={slot} match={getScheduledMatch(slot.label)} isEditing={editMode} isAdmin={isAdmin} onDrop={handleDrop} onPlay={onSelectMatch} fullTeams={teams} onWalkover={(m) => setWalkoverModal({match: m, label: slot.label})} onUpdateDetails={handleMatchDetailsUpdate} showNotification={showNotification} />)}
                        </BracketColumn>
                     </div>
                 </div>

                 <div className="flex justify-end pr-20 -my-4 relative z-10">
                     <div className="flex flex-col items-center justify-center gap-2">
                        <div className="h-8 w-0.5 bg-slate-300"></div>
                        <div className="bg-gradient-to-b from-yellow-50 to-yellow-100 p-6 rounded-xl border-2 border-yellow-400 shadow-xl relative transform scale-110">
                             <h3 className="text-center font-black text-yellow-700 text-lg mb-2 uppercase tracking-widest flex items-center justify-center gap-2"><Trophy className="w-5 h-5" /> Final</h3>
                             {isLoading ? <BracketSkeleton count={1} /> : final.map(slot => <BracketNode key={slot.label} slot={slot} match={getScheduledMatch(slot.label)} isEditing={editMode} isAdmin={isAdmin} onDrop={handleDrop} onPlay={onSelectMatch} fullTeams={teams} onWalkover={(m) => setWalkoverModal({match: m, label: slot.label})} onUpdateDetails={handleMatchDetailsUpdate} isFinal showNotification={showNotification} />)}
                        </div>
                        <div className="h-8 w-0.5 bg-slate-300"></div>
                     </div>
                 </div>

                 <div className="bg-red-50/50 p-4 md:p-6 rounded-3xl border border-red-100 shadow-inner">
                     <div className="mb-6 flex items-center gap-2 text-red-800 font-bold uppercase tracking-wider border-b border-red-200 pb-2">
                        <span className="bg-red-600 text-white px-3 py-1 rounded-full text-xs shadow-sm">Line B</span> สายล่าง
                     </div>
                     <div className="flex justify-start gap-4 md:gap-8 items-center">
                        {isLargeBracket && (
                            <>
                                <BracketColumn title="รอบ 32" color="border-slate-300">
                                    {isLoading ? <BracketSkeleton count={8} /> : round32_B.map(slot => <BracketNode key={slot.label} slot={slot} match={getScheduledMatch(slot.label)} isEditing={editMode} isAdmin={isAdmin} onDrop={handleDrop} onPlay={onSelectMatch} fullTeams={teams} onWalkover={(m) => setWalkoverModal({match: m, label: slot.label})} onUpdateDetails={handleMatchDetailsUpdate} showNotification={showNotification} />)}
                                </BracketColumn>
                                <ArrowRight className="text-slate-300 w-4" />
                            </>
                        )}
                        <BracketColumn title="รอบ 16" color="border-slate-300">
                             {isLoading ? <BracketSkeleton count={4} /> : round16_B.map(slot => <BracketNode key={slot.label} slot={slot} match={getScheduledMatch(slot.label)} isEditing={editMode} isAdmin={isAdmin} onDrop={handleDrop} onPlay={onSelectMatch} fullTeams={teams} onWalkover={(m) => setWalkoverModal({match: m, label: slot.label})} onUpdateDetails={handleMatchDetailsUpdate} showNotification={showNotification} />)}
                        </BracketColumn>
                        <ArrowRight className="text-red-200 w-6" />
                        <BracketColumn title="รอบ 8" color="border-indigo-300">
                             {isLoading ? <BracketSkeleton count={2} /> : quarters_B.map(slot => <BracketNode key={slot.label} slot={slot} match={getScheduledMatch(slot.label)} isEditing={editMode} isAdmin={isAdmin} onDrop={handleDrop} onPlay={onSelectMatch} fullTeams={teams} onWalkover={(m) => setWalkoverModal({match: m, label: slot.label})} onUpdateDetails={handleMatchDetailsUpdate} showNotification={showNotification} />)}
                        </BracketColumn>
                         <ArrowRight className="text-indigo-200 w-6" />
                        <BracketColumn title="รอบรองฯ" color="border-orange-300">
                             {isLoading ? <BracketSkeleton count={1} /> : semis_B.map(slot => <BracketNode key={slot.label} slot={slot} match={getScheduledMatch(slot.label)} isEditing={editMode} isAdmin={isAdmin} onDrop={handleDrop} onPlay={onSelectMatch} fullTeams={teams} onWalkover={(m) => setWalkoverModal({match: m, label: slot.label})} onUpdateDetails={handleMatchDetailsUpdate} showNotification={showNotification} />)}
                        </BracketColumn>
                     </div>
                 </div>

             </div>
          </div>
      </div>
      
      {walkoverModal && (
          <div className="fixed inset-0 z-[1100] bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setWalkoverModal(null)}>
              <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 animate-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
                  <div className="flex items-center gap-3 text-orange-600 mb-4 border-b pb-2">
                      <ShieldAlert className="w-6 h-6" />
                      <h3 className="font-bold text-lg">บันทึกผลชนะบาย / ปรับแพ้</h3>
                  </div>
                  <p className="text-slate-600 mb-6">กรุณาเลือกทีมที่ <b>ชนะ</b> (ทีมอีกฝ่ายจะถูกปรับแพ้ 0-3)</p>
                  
                  <div className="grid grid-cols-2 gap-4">
                      {walkoverModal.match.teamA && (
                          <button 
                            onClick={() => handleWalkover(typeof walkoverModal.match.teamA === 'object' ? walkoverModal.match.teamA.name : walkoverModal.match.teamA as string)}
                            className="p-4 bg-slate-50 hover:bg-green-50 border border-slate-200 hover:border-green-500 rounded-xl transition group"
                          >
                              <span className="font-bold block text-lg mb-1 group-hover:text-green-700">
                                {typeof walkoverModal.match.teamA === 'object' ? walkoverModal.match.teamA.name : walkoverModal.match.teamA}
                              </span>
                              <span className="text-xs text-slate-400 group-hover:text-green-600">ชนะผ่าน</span>
                          </button>
                      )}
                      {walkoverModal.match.teamB && (
                          <button 
                            onClick={() => handleWalkover(typeof walkoverModal.match.teamB === 'object' ? walkoverModal.match.teamB.name : walkoverModal.match.teamB as string)}
                            className="p-4 bg-slate-50 hover:bg-green-50 border border-slate-200 hover:border-green-500 rounded-xl transition group"
                          >
                              <span className="font-bold block text-lg mb-1 group-hover:text-green-700">
                                {typeof walkoverModal.match.teamB === 'object' ? walkoverModal.match.teamB.name : walkoverModal.match.teamB}
                              </span>
                              <span className="text-xs text-slate-400 group-hover:text-green-600">ชนะผ่าน</span>
                          </button>
                      )}
                  </div>
                  <button onClick={() => setWalkoverModal(null)} className="w-full mt-6 py-2 text-slate-400 hover:text-slate-600 border rounded-lg">ยกเลิก</button>
              </div>
          </div>
      )}
    </div>
  );
};

const BracketSkeleton: React.FC<{count: number}> = ({count}) => (
    <>
        {Array(count).fill(0).map((_, i) => (
            <div key={i} className="w-[240px] h-[90px] bg-white rounded-xl border border-slate-200 shadow-sm animate-pulse flex flex-col p-2 gap-2">
                <div className="h-4 w-1/3 bg-slate-100 rounded"></div>
                <div className="h-8 bg-slate-100 rounded"></div>
                <div className="h-8 bg-slate-100 rounded"></div>
            </div>
        ))}
    </>
);

const BracketColumn: React.FC<{title: string, children: React.ReactNode, color: string}> = ({ title, children, color }) => (
    <div className={`flex flex-col gap-4 min-w-[260px] border-l-4 ${color} pl-6 py-2`}>
        <h4 className="font-bold text-slate-400 uppercase text-xs tracking-widest mb-2">{title}</h4>
        <div className="flex flex-col justify-around flex-1 gap-6">
            {children}
        </div>
    </div>
);

interface BracketNodeProps {
    slot: { label: string, title: string };
    match?: Match;
    isEditing: boolean;
    isAdmin: boolean;
    onDrop: (teamName: string, roundLabel: string, slot: 'A' | 'B') => void;
    onPlay: (teamA: Team, teamB: Team, matchId: string) => void;
    fullTeams: Team[];
    onWalkover: (match: Match) => void;
    onUpdateDetails: (match: Match, updates: Partial<Match>) => void;
    isFinal?: boolean;
    showNotification?: (title: string, message: string, type: 'success' | 'error' | 'info' | 'warning') => void;
}

const BracketNode: React.FC<BracketNodeProps> = ({ slot, match, isEditing, isAdmin, onDrop, onPlay, fullTeams, onWalkover, onUpdateDetails, isFinal, showNotification }) => {
    const [isDragOverA, setIsDragOverA] = useState(false);
    const [isDragOverB, setIsDragOverB] = useState(false);
    const teamA_Name = typeof match?.teamA === 'object' ? match.teamA.name : match?.teamA;
    const teamB_Name = typeof match?.teamB === 'object' ? match.teamB.name : match?.teamB;
    
    const resolveTeamDisplay = (name: string | undefined) => {
        if (!name) return null;
        if (name === 'Wildcard') return { name: 'Wildcard', style: 'bg-purple-50 text-purple-700 border-purple-300 border-dashed', isWildcard: true };
        const realTeam = fullTeams.find((t: Team) => t.name === name);
        if (realTeam) return { name: realTeam.name, style: 'bg-white border-slate-200 text-slate-800 shadow-sm', logo: realTeam.logoUrl, isWildcard: false };
        return { name: name, style: 'bg-white border-slate-200 text-slate-800 shadow-sm', isWildcard: false };
    };
    const tA = resolveTeamDisplay(teamA_Name);
    const tB = resolveTeamDisplay(teamB_Name);

    const handleDropEvent = (e: React.DragEvent, slotKey: 'A' | 'B') => {
        e.preventDefault(); e.stopPropagation();
        if (slotKey === 'A') setIsDragOverA(false); else setIsDragOverB(false);
        const teamName = e.dataTransfer.getData('text/plain');
        if (isAdmin && teamName) onDrop(teamName, slot.label, slotKey);
    };

    return (
        <div className={`relative flex flex-col rounded-xl border ${isFinal ? 'border-yellow-200 shadow-md bg-white' : 'border-slate-200 shadow-md bg-white'} overflow-hidden min-w-[240px]`}>
             <div className="bg-slate-50 px-3 py-1.5 text-[10px] text-slate-400 font-bold border-b flex justify-between items-center"><span>{slot.title}</span>{match && match.winner && <span className="text-green-600 flex items-center gap-1"><Check className="w-3 h-3" /> จบแล้ว</span>}</div>
             <div className="divide-y divide-slate-100">
                 <div className={`p-3 flex justify-between items-center transition-all duration-200 ${tA ? tA.style : 'bg-slate-50/50'} ${isDragOverA ? 'bg-green-100 ring-2 ring-inset ring-green-400' : ''}`} onDragOver={(e) => { e.preventDefault(); setIsDragOverA(true); }} onDragLeave={() => setIsDragOverA(false)} onDrop={(e) => handleDropEvent(e, 'A')}>
                     {tA ? <div className="flex items-center gap-2 overflow-hidden">{tA.logo && <img src={tA.logo} className="w-6 h-6 object-contain bg-white rounded-full border border-slate-100 p-0.5" />}<span className="font-bold text-sm truncate max-w-[140px]">{tA.name}</span></div> : <span className="text-xs text-slate-300 italic select-none">รอคู่แข่ง A</span>}{match && match.winner && <span className={`text-sm font-bold px-2 py-0.5 rounded ${match.winner === 'A' ? 'bg-green-100 text-green-700' : 'text-slate-300'}`}>{match.scoreA}</span>}
                 </div>
                 <div className={`p-3 flex justify-between items-center transition-all duration-200 ${tB ? tB.style : 'bg-slate-50/50'} ${isDragOverB ? 'bg-green-100 ring-2 ring-inset ring-green-400' : ''}`} onDragOver={(e) => { e.preventDefault(); setIsDragOverB(true); }} onDragLeave={() => setIsDragOverB(false)} onDrop={(e) => handleDropEvent(e, 'B')}>
                     {tB ? <div className="flex items-center gap-2 overflow-hidden">{tB.logo && <img src={tB.logo} className="w-6 h-6 object-contain bg-white rounded-full border border-slate-100 p-0.5" />}<span className="font-bold text-sm truncate max-w-[140px]">{tB.name}</span></div> : <span className="text-xs text-slate-300 italic select-none">รอคู่แข่ง B</span>}{match && match.winner && <span className={`text-sm font-bold px-2 py-0.5 rounded ${match.winner === 'B' ? 'bg-green-100 text-green-700' : 'text-slate-300'}`}>{match.scoreB}</span>}
                 </div>
             </div>
             {match && (match.venue || match.scheduledTime) && !isEditing && (<div className="px-3 py-2 bg-indigo-50 border-t border-indigo-100 flex flex-col gap-1">{match.venue && <div className="flex items-center gap-1.5 text-indigo-700 text-[10px] font-bold"><MapPin className="w-3 h-3" /> {match.venue}</div>}{match.scheduledTime && <div className="flex items-center gap-1.5 text-indigo-600 text-[10px]"><Calendar className="w-3 h-3" /> {new Date(match.scheduledTime).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })} <span className="mx-0.5">|</span><Clock className="w-3 h-3" />{new Date(match.scheduledTime).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}</div>}</div>)}
             {isEditing && match && (tA || tB) && (<div className="px-3 py-2 bg-slate-100 border-t border-slate-200 space-y-2"><input type="text" placeholder="สนาม" className="w-full p-1 text-xs border rounded" defaultValue={match.venue || ''} onBlur={(e) => onUpdateDetails(match, { venue: e.target.value })} /><input type="datetime-local" className="w-full p-1 text-xs border rounded" defaultValue={match.scheduledTime ? new Date(match.scheduledTime).toISOString().slice(0, 16) : ''} onBlur={(e) => onUpdateDetails(match, { scheduledTime: e.target.value })} /></div>)}
             {!isEditing && tA && tB && !match?.winner && (<div className="absolute inset-0 bg-white/80 opacity-0 hover:opacity-100 flex items-center justify-center gap-3 transition backdrop-blur-sm z-10"><button onClick={() => { const objA = fullTeams.find((t: any) => t.name === tA.name) || { id: 'tempA', name: tA.name, color: '#2563EB' } as any; const objB = fullTeams.find((t: any) => t.name === tB.name) || { id: 'tempB', name: tB.name, color: '#E11D48' } as any; if(tA.isWildcard || tB.isWildcard) { if (showNotification) showNotification("แจ้งเตือน", "ใช้ Wildcard ไม่ได้", "warning"); else alert("ใช้ Wildcard ไม่ได้"); return; } onPlay(objA, objB, match?.id || `M_${slot.label}_${Date.now()}`); }} className="p-3 bg-indigo-600 text-white rounded-full hover:scale-110 transition shadow-lg hover:bg-indigo-700"><PlayCircle className="w-8 h-8" /></button>{isAdmin && <button onClick={() => match && onWalkover(match)} className="p-3 bg-orange-100 text-orange-600 rounded-full hover:scale-110 transition shadow-sm border border-orange-200"><AlertCircle className="w-6 h-6" /></button>}</div>)}
        </div>
    );
};

export default TournamentView;