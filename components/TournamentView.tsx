
import React, { useState, useEffect, useMemo } from 'react';
import { Team, Match, KickResult } from '../types';
import { Trophy, Edit2, Check, ArrowRight, UserX, ShieldAlert, Sparkles, GripVertical, PlayCircle, AlertCircle, Lock, Eraser, MapPin, Clock, Calendar, RefreshCw, Minimize2, Maximize2, X, Share2, Info, LayoutGrid, List } from 'lucide-react';
import { scheduleMatch, saveMatchToSheet } from '../services/sheetService';
import { shareMatch } from '../services/liffService';

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
  
  const [selectedMatch, setSelectedMatch] = useState<{match: Match, label: string} | null>(null);
  const [walkoverModal, setWalkoverModal] = useState<{match: Match, label: string} | null>(null);
  
  // New: Slot Selection for "Click to Assign"
  const [slotSelection, setSlotSelection] = useState<{ matchId: string, roundLabel: string, slot: 'A' | 'B', currentName: string } | null>(null);

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

  // --- Logic for Standings Calculation (copied/adapted from StandingsView) ---
  const groupStandings = useMemo(() => {
      const standings: Record<string, { team: Team, points: number, gd: number, rank: number }> = {};
      
      // Initialize
      teams.forEach(t => {
          if (t.status === 'Approved') {
              standings[t.id] = { team: t, points: 0, gd: 0, rank: 0 };
          }
      });

      // Process Matches
      matches.forEach(m => {
          if (!m.winner || !m.roundLabel?.match(/group|กลุ่ม|สาย/i)) return;
          
          // Resolve Team IDs
          const tA = teams.find(t => t.name === (typeof m.teamA === 'string' ? m.teamA : m.teamA.name));
          const tB = teams.find(t => t.name === (typeof m.teamB === 'string' ? m.teamB : m.teamB.name));

          if (tA && standings[tA.id] && tB && standings[tB.id]) {
              const scoreA = parseInt(m.scoreA.toString() || '0');
              const scoreB = parseInt(m.scoreB.toString() || '0');
              
              standings[tA.id].gd += (scoreA - scoreB);
              standings[tB.id].gd += (scoreB - scoreA);

              if (m.winner === 'A' || m.winner === tA.name) standings[tA.id].points += 3;
              else if (m.winner === 'B' || m.winner === tB.name) standings[tB.id].points += 3;
              else {
                  standings[tA.id].points += 1;
                  standings[tB.id].points += 1;
              }
          }
      });

      // Group and Sort
      const grouped: Record<string, typeof standings[string][]> = {};
      Object.values(standings).forEach(s => {
          const g = s.team.group || 'Unassigned';
          if (!grouped[g]) grouped[g] = [];
          grouped[g].push(s);
      });

      Object.keys(grouped).forEach(key => {
          grouped[key].sort((a, b) => {
              if (b.points !== a.points) return b.points - a.points;
              return b.gd - a.gd;
          });
          // Assign Rank
          grouped[key].forEach((s, idx) => s.rank = idx + 1);
      });

      return grouped;
  }, [matches, teams]);

  const handleUpdateSlot = async (teamName: string) => {
      if (!slotSelection) return;
      const { roundLabel, slot } = slotSelection;
      
      const finalName = teamName === 'CLEAR_SLOT' ? '' : teamName;

      let updatedMatch: Match | null = null;
      setLocalMatches(prev => {
          const newMatches = [...prev];
          const existingIndex = newMatches.findIndex(m => m.roundLabel === roundLabel);

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
          const uMatch = updatedMatch as Match; // Cast to ensure type
          const teamA = typeof uMatch.teamA === 'object' ? uMatch.teamA.name : uMatch.teamA;
          const teamB = typeof uMatch.teamB === 'object' ? uMatch.teamB.name : uMatch.teamB;
          await scheduleMatch(uMatch.id, teamA as string, teamB as string, roundLabel, uMatch.venue, uMatch.scheduledTime);
          setTimeout(onRefresh, 500);
      }
      setSlotSelection(null);
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
     setSelectedMatch(null);
     if (showNotification) showNotification("เรียบร้อย", "บันทึกผลชนะบายแล้ว", "success");
     onRefresh();
  };

  const handleStartMatch = () => {
      if (!selectedMatch) return;
      const m = selectedMatch.match;
      const tA = teams.find(t => t.name === (typeof m.teamA === 'string' ? m.teamA : m.teamA.name)) || { id: 'tempA', name: m.teamA as string } as Team;
      const tB = teams.find(t => t.name === (typeof m.teamB === 'string' ? m.teamB : m.teamB.name)) || { id: 'tempB', name: m.teamB as string } as Team;
      
      onSelectMatch(tA, tB, m.id || `M_${selectedMatch.label}_${Date.now()}`);
      setSelectedMatch(null);
  };

  // Pairings for connector lines
  const round32_A_Pairs = chunkArray(Array(8).fill(null).map((_, i) => ({ label: `R32-${i+1}`, title: `คู่ที่ ${i+1}` })), 2);
  const round16_A_Pairs = chunkArray(Array(4).fill(null).map((_, i) => ({ label: `R16-${i+1}`, title: `คู่ที่ ${i+1}` })), 2);
  const quarters_A_Pairs = chunkArray(Array(2).fill(null).map((_, i) => ({ label: `QF${i+1}`, title: `QF ${i+1}` })), 2);
  const semis_A = [{ label: `SF1`, title: `SF A` }];
  
  const round32_B_Pairs = chunkArray(Array(8).fill(null).map((_, i) => ({ label: `R32-${i+9}`, title: `คู่ที่ ${i+9}` })), 2);
  const round16_B_Pairs = chunkArray(Array(4).fill(null).map((_, i) => ({ label: `R16-${i+5}`, title: `คู่ที่ ${i+5}` })), 2);
  const quarters_B_Pairs = chunkArray(Array(2).fill(null).map((_, i) => ({ label: `QF${i+3}`, title: `QF ${i+3}` })), 2);
  const semis_B = [{ label: `SF2`, title: `SF B` }];
  
  const final = [{ label: `FINAL`, title: `ชิงชนะเลิศ` }];

  // Helper component to trigger the slot selection modal
  const handleSlotClick = (matchId: string, roundLabel: string, slot: 'A' | 'B', currentName: string) => {
      if (editMode && isAdmin) {
          setSlotSelection({ matchId, roundLabel, slot, currentName });
      } else {
          // Normal View mode logic handled by node click
      }
  };

  return (
    <div className="w-full max-w-[98%] mx-auto p-2 md:p-4 min-h-screen flex flex-col bg-slate-50">
      <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-200 sticky top-0 z-30">
         <div className="w-full md:w-auto">
             <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                <Trophy className="w-6 h-6 text-yellow-500" /> แผนผัง <span className="hidden md:inline">การแข่งขัน</span>
             </h2>
             <p className="text-xs text-slate-500">
                {isAdmin ? (editMode ? "แตะที่ชื่อทีมในผังเพื่อเปลี่ยนหรือลบ" : "คลิก 'จัดการ' เพื่อแก้ไขผัง") : "คลิกที่คู่แข่งขันเพื่อดูรายละเอียด"}
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
          
          {/* Note: Sidebar removed in favor of modal based selection for better mobile support */}

          <div className="flex-1 w-full overflow-x-auto pb-10 custom-scrollbar -webkit-overflow-scrolling-touch px-2">
             <div className="md:hidden text-center text-slate-400 text-xs mb-2 flex items-center justify-center gap-2 opacity-50">
                 <ArrowRight className="w-3 h-3" /> เลื่อนเพื่อดูสายการแข่งขัน <ArrowRight className="w-3 h-3" />
             </div>

             <div className={`flex flex-col gap-8 ${isLargeBracket ? 'min-w-[1400px]' : 'min-w-[1100px]'}`}>
                 
                 {/* LINE A */}
                 <div className="bg-blue-50/30 p-4 md:p-6 rounded-3xl border border-blue-100 shadow-inner relative">
                     <div className="absolute top-0 left-0 bg-blue-600 text-white px-3 py-1 rounded-br-xl text-xs font-bold shadow-sm z-10">สาย A</div>
                     <div className="flex justify-start gap-0 items-stretch pt-4">
                        {isLargeBracket && (
                            <BracketColumn title="รอบ 32">
                                {isLoading ? <BracketSkeleton count={4} /> : round32_A_Pairs.map((pair, i) => <BracketPair key={i} pair={pair} getMatch={getScheduledMatch} isEditing={editMode} isAdmin={isAdmin} onSlotClick={handleSlotClick} onSelect={setSelectedMatch} fullTeams={teams} onUpdateDetails={handleMatchDetailsUpdate} />)}
                            </BracketColumn>
                        )}
                        <BracketColumn title="รอบ 16">
                             {isLoading ? <BracketSkeleton count={2} /> : round16_A_Pairs.map((pair, i) => <BracketPair key={i} pair={pair} getMatch={getScheduledMatch} isEditing={editMode} isAdmin={isAdmin} onSlotClick={handleSlotClick} onSelect={setSelectedMatch} fullTeams={teams} onUpdateDetails={handleMatchDetailsUpdate} />)}
                        </BracketColumn>
                        <BracketColumn title="รอบ 8">
                             {isLoading ? <BracketSkeleton count={1} /> : quarters_A_Pairs.map((pair, i) => <BracketPair key={i} pair={pair} getMatch={getScheduledMatch} isEditing={editMode} isAdmin={isAdmin} onSlotClick={handleSlotClick} onSelect={setSelectedMatch} fullTeams={teams} onUpdateDetails={handleMatchDetailsUpdate} />)}
                        </BracketColumn>
                        <BracketColumn title="รองชนะเลิศ" isSingle>
                             {isLoading ? <BracketSkeleton count={1} /> : semis_A.map(slot => <BracketNode key={slot.label} slot={slot} match={getScheduledMatch(slot.label)} isEditing={editMode} isAdmin={isAdmin} onSlotClick={handleSlotClick} onSelect={setSelectedMatch} fullTeams={teams} onUpdateDetails={handleMatchDetailsUpdate} showConnector={true} />)}
                        </BracketColumn>
                     </div>
                 </div>

                 {/* FINAL */}
                 <div className="flex justify-end pr-32 -my-4 relative z-20 pointer-events-none">
                     <div className="flex flex-col items-center justify-center pointer-events-auto">
                        <div className="h-8 w-0.5 bg-yellow-400"></div>
                        <div className="bg-gradient-to-b from-yellow-50 to-yellow-100 p-4 rounded-xl border-2 border-yellow-400 shadow-[0_0_30px_rgba(250,204,21,0.2)] transform scale-110">
                             <h3 className="text-center font-black text-yellow-700 text-lg mb-2 uppercase tracking-widest flex items-center justify-center gap-2"><Trophy className="w-5 h-5" /> Final</h3>
                             {isLoading ? <BracketSkeleton count={1} /> : final.map(slot => <BracketNode key={slot.label} slot={slot} match={getScheduledMatch(slot.label)} isEditing={editMode} isAdmin={isAdmin} onSlotClick={handleSlotClick} onSelect={setSelectedMatch} fullTeams={teams} onUpdateDetails={handleMatchDetailsUpdate} isFinal />)}
                        </div>
                        <div className="h-8 w-0.5 bg-yellow-400"></div>
                     </div>
                 </div>

                 {/* LINE B */}
                 <div className="bg-red-50/30 p-4 md:p-6 rounded-3xl border border-red-100 shadow-inner relative">
                     <div className="absolute top-0 left-0 bg-red-600 text-white px-3 py-1 rounded-br-xl text-xs font-bold shadow-sm z-10">สาย B</div>
                     <div className="flex justify-start gap-0 items-stretch pt-4">
                        {isLargeBracket && (
                            <BracketColumn title="รอบ 32">
                                {isLoading ? <BracketSkeleton count={4} /> : round32_B_Pairs.map((pair, i) => <BracketPair key={i} pair={pair} getMatch={getScheduledMatch} isEditing={editMode} isAdmin={isAdmin} onSlotClick={handleSlotClick} onSelect={setSelectedMatch} fullTeams={teams} onUpdateDetails={handleMatchDetailsUpdate} />)}
                            </BracketColumn>
                        )}
                        <BracketColumn title="รอบ 16">
                             {isLoading ? <BracketSkeleton count={2} /> : round16_B_Pairs.map((pair, i) => <BracketPair key={i} pair={pair} getMatch={getScheduledMatch} isEditing={editMode} isAdmin={isAdmin} onSlotClick={handleSlotClick} onSelect={setSelectedMatch} fullTeams={teams} onUpdateDetails={handleMatchDetailsUpdate} />)}
                        </BracketColumn>
                        <BracketColumn title="รอบ 8">
                             {isLoading ? <BracketSkeleton count={1} /> : quarters_B_Pairs.map((pair, i) => <BracketPair key={i} pair={pair} getMatch={getScheduledMatch} isEditing={editMode} isAdmin={isAdmin} onSlotClick={handleSlotClick} onSelect={setSelectedMatch} fullTeams={teams} onUpdateDetails={handleMatchDetailsUpdate} />)}
                        </BracketColumn>
                        <BracketColumn title="รองชนะเลิศ" isSingle>
                             {isLoading ? <BracketSkeleton count={1} /> : semis_B.map(slot => <BracketNode key={slot.label} slot={slot} match={getScheduledMatch(slot.label)} isEditing={editMode} isAdmin={isAdmin} onSlotClick={handleSlotClick} onSelect={setSelectedMatch} fullTeams={teams} onUpdateDetails={handleMatchDetailsUpdate} showConnector={true} />)}
                        </BracketColumn>
                     </div>
                 </div>

             </div>
          </div>
      </div>
      
      {/* SLOT ASSIGNMENT MODAL (Replaces Side Panel for Mobile Friendliness) */}
      {slotSelection && (
          <TeamAssignmentModal 
              isOpen={!!slotSelection}
              onClose={() => setSlotSelection(null)}
              onAssign={(teamName) => handleUpdateSlot(teamName)}
              teams={teams}
              groupStandings={groupStandings}
              currentSlotName={slotSelection.currentName}
              slotLabel={`${slotSelection.roundLabel} - Team ${slotSelection.slot}`}
          />
      )}

      {/* MATCH DETAIL MODAL */}
      {selectedMatch && (
          <div className="fixed inset-0 z-[1100] bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setSelectedMatch(null)}>
              <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden animate-in zoom-in duration-200 flex flex-col" onClick={e => e.stopPropagation()}>
                  
                  {/* Header */}
                  <div className="bg-slate-900 p-4 text-white flex justify-between items-start">
                      <div>
                          <div className="text-xs text-slate-400 font-bold uppercase tracking-wider">{selectedMatch.match.roundLabel?.split(':')[0] || selectedMatch.label}</div>
                          <div className="text-lg font-bold mt-1">รายละเอียดการแข่งขัน</div>
                      </div>
                      <button onClick={() => setSelectedMatch(null)} className="p-1 hover:bg-white/20 rounded-full"><X className="w-5 h-5"/></button>
                  </div>

                  {/* Body */}
                  <div className="p-6">
                      <div className="flex justify-between items-center mb-6">
                          <div className="flex flex-col items-center w-1/3">
                              <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mb-2 overflow-hidden border border-slate-200">
                                  {teams.find(t => t.name === (typeof selectedMatch.match.teamA === 'string' ? selectedMatch.match.teamA : selectedMatch.match.teamA?.name))?.logoUrl ? 
                                    <img src={teams.find(t => t.name === (typeof selectedMatch.match.teamA === 'string' ? selectedMatch.match.teamA : selectedMatch.match.teamA?.name))?.logoUrl} className="w-full h-full object-cover" /> 
                                    : <div className="font-bold text-slate-300">A</div>
                                  }
                              </div>
                              <span className="text-xs font-bold text-center leading-tight line-clamp-2">{typeof selectedMatch.match.teamA === 'string' ? selectedMatch.match.teamA : selectedMatch.match.teamA?.name || 'รอคู่แข่ง'}</span>
                          </div>
                          
                          <div className="flex flex-col items-center">
                              {selectedMatch.match.winner ? (
                                  <div className="text-3xl font-black text-slate-800">{selectedMatch.match.scoreA} - {selectedMatch.match.scoreB}</div>
                              ) : (
                                  <div className="text-xl font-bold text-slate-300">VS</div>
                              )}
                              {selectedMatch.match.scheduledTime && (
                                  <div className="mt-2 flex flex-col items-center text-[10px] text-slate-500 bg-slate-100 px-2 py-1 rounded">
                                      <span className="flex items-center gap-1"><Calendar className="w-3 h-3"/> {new Date(selectedMatch.match.scheduledTime).toLocaleDateString('th-TH', {day: 'numeric', month:'short'})}</span>
                                      <span className="flex items-center gap-1"><Clock className="w-3 h-3"/> {new Date(selectedMatch.match.scheduledTime).toLocaleTimeString('th-TH', {hour: '2-digit', minute:'2-digit'})}</span>
                                  </div>
                              )}
                          </div>

                          <div className="flex flex-col items-center w-1/3">
                              <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mb-2 overflow-hidden border border-slate-200">
                                  {teams.find(t => t.name === (typeof selectedMatch.match.teamB === 'string' ? selectedMatch.match.teamB : selectedMatch.match.teamB?.name))?.logoUrl ? 
                                    <img src={teams.find(t => t.name === (typeof selectedMatch.match.teamB === 'string' ? selectedMatch.match.teamB : selectedMatch.match.teamB?.name))?.logoUrl} className="w-full h-full object-cover" /> 
                                    : <div className="font-bold text-slate-300">B</div>
                                  }
                              </div>
                              <span className="text-xs font-bold text-center leading-tight line-clamp-2">{typeof selectedMatch.match.teamB === 'string' ? selectedMatch.match.teamB : selectedMatch.match.teamB?.name || 'รอคู่แข่ง'}</span>
                          </div>
                      </div>

                      {selectedMatch.match.venue && (
                          <div className="flex items-center justify-center gap-2 text-xs text-slate-500 mb-6">
                              <MapPin className="w-3 h-3"/> สนาม: {selectedMatch.match.venue}
                          </div>
                      )}

                      {/* Actions */}
                      <div className="space-y-2">
                          {!selectedMatch.match.winner && (isAdmin || false) && (
                              <button onClick={handleStartMatch} className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-indigo-200 transition">
                                  <PlayCircle className="w-5 h-5" /> เริ่มการแข่งขัน / บันทึกผล
                              </button>
                          )}
                          
                          <button onClick={() => {
                              const tA = teams.find(t => t.name === (typeof selectedMatch.match.teamA === 'string' ? selectedMatch.match.teamA : selectedMatch.match.teamA?.name)) || { name: 'A', logoUrl: '' } as Team;
                              const tB = teams.find(t => t.name === (typeof selectedMatch.match.teamB === 'string' ? selectedMatch.match.teamB : selectedMatch.match.teamB?.name)) || { name: 'B', logoUrl: '' } as Team;
                              shareMatch(selectedMatch.match, tA.name, tB.name, tA.logoUrl, tB.logoUrl);
                          }} className="w-full py-3 bg-[#06C755] hover:bg-[#05b34c] text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-sm transition">
                              <Share2 className="w-5 h-5" /> แชร์ผลไปยัง LINE
                          </button>

                          {isAdmin && !selectedMatch.match.winner && (
                              <button onClick={() => { setWalkoverModal({match: selectedMatch.match, label: selectedMatch.label}); setSelectedMatch(null); }} className="w-full py-3 border border-orange-200 text-orange-600 hover:bg-orange-50 rounded-xl font-bold flex items-center justify-center gap-2 transition">
                                  <ShieldAlert className="w-5 h-5" /> บันทึกชนะบาย (Walkover)
                              </button>
                          )}
                      </div>
                  </div>
              </div>
          </div>
      )}

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

// --- Sub Components ---

const TeamAssignmentModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onAssign: (teamName: string) => void;
    teams: Team[];
    groupStandings: Record<string, { team: Team, points: number, gd: number, rank: number }[]>;
    currentSlotName: string;
    slotLabel: string;
}> = ({ isOpen, onClose, onAssign, teams, groupStandings, currentSlotName, slotLabel }) => {
    const [tab, setTab] = useState<'all' | 'standings'>('standings');
    const [search, setSearch] = useState('');

    if (!isOpen) return null;

    const filteredAllTeams = teams
        .filter(t => t.status === 'Approved')
        .filter(t => t.name.toLowerCase().includes(search.toLowerCase()));

    return (
        <div className="fixed inset-0 z-[1400] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in duration-200 flex flex-col max-h-[85vh]" onClick={e => e.stopPropagation()}>
                <div className="bg-slate-900 p-4 text-white flex justify-between items-center shrink-0">
                    <div>
                        <div className="text-xs text-indigo-300 font-bold uppercase tracking-wider">{slotLabel}</div>
                        <h3 className="font-bold text-lg">เลือกทีมลงผังแข่งขัน</h3>
                    </div>
                    <button onClick={onClose}><X className="w-5 h-5"/></button>
                </div>

                <div className="flex border-b border-slate-200 bg-slate-50 shrink-0">
                    <button onClick={() => setTab('standings')} className={`flex-1 py-3 text-sm font-bold transition ${tab === 'standings' ? 'bg-white text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-500 hover:bg-slate-100'}`}><LayoutGrid className="w-4 h-4 inline mr-1"/> อันดับกลุ่ม</button>
                    <button onClick={() => setTab('all')} className={`flex-1 py-3 text-sm font-bold transition ${tab === 'all' ? 'bg-white text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-500 hover:bg-slate-100'}`}><List className="w-4 h-4 inline mr-1"/> ทีมทั้งหมด</button>
                </div>

                <div className="flex-1 overflow-y-auto p-2 bg-slate-50">
                    {/* Clear Slot Option */}
                    <button onClick={() => onAssign('CLEAR_SLOT')} className="w-full p-3 mb-3 bg-red-50 border border-red-200 text-red-600 rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-red-100 transition">
                        <Eraser className="w-4 h-4"/> ล้างช่อง (Clear Slot)
                    </button>

                    {tab === 'standings' && (
                        <div className="space-y-4">
                            {Object.keys(groupStandings).sort().map(group => (
                                <div key={group} className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
                                    <div className="bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600 flex justify-between">
                                        <span>Group {group}</span>
                                        <span className="text-indigo-500">Pts</span>
                                    </div>
                                    <div className="divide-y divide-slate-50">
                                        {groupStandings[group].map((entry) => (
                                            <button 
                                                key={entry.team.id}
                                                onClick={() => onAssign(entry.team.name)}
                                                className="w-full text-left p-3 hover:bg-indigo-50 flex items-center justify-between transition group"
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${entry.rank <= 2 ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                                                        {entry.rank}
                                                    </div>
                                                    {entry.team.logoUrl && <img src={entry.team.logoUrl} className="w-6 h-6 object-contain"/>}
                                                    <span className={`text-sm font-medium ${entry.team.name === currentSlotName ? 'text-indigo-600 font-bold' : 'text-slate-700'}`}>{entry.team.name}</span>
                                                </div>
                                                <span className="font-mono font-bold text-sm text-slate-400 group-hover:text-indigo-600">{entry.points}</span>
                                            </button>
                                        ))}
                                        {groupStandings[group].length === 0 && <div className="p-3 text-center text-xs text-slate-400">ยังไม่มีทีม</div>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {tab === 'all' && (
                        <div className="space-y-2">
                            <div className="sticky top-0 bg-slate-50 pb-2 z-10">
                                <input 
                                    type="text" 
                                    placeholder="ค้นหาทีม..." 
                                    className="w-full p-3 border rounded-xl text-sm shadow-sm"
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                />
                            </div>
                            <button onClick={() => onAssign("Wildcard")} className="w-full p-3 bg-purple-50 text-purple-700 rounded-xl font-bold text-sm flex items-center gap-2 border border-purple-100 hover:bg-purple-100">
                                <Sparkles className="w-4 h-4"/> Wildcard Team
                            </button>
                            {filteredAllTeams.map(t => (
                                <button 
                                    key={t.id}
                                    onClick={() => onAssign(t.name)}
                                    className="w-full bg-white p-3 rounded-xl border border-slate-200 flex items-center gap-3 hover:border-indigo-300 hover:shadow-md transition text-left"
                                >
                                    {t.logoUrl ? <img src={t.logoUrl} className="w-8 h-8 object-contain"/> : <div className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-xs font-bold text-slate-400">{t.name.substring(0,1)}</div>}
                                    <div>
                                        <div className={`text-sm font-bold ${t.name === currentSlotName ? 'text-indigo-600' : 'text-slate-700'}`}>{t.name}</div>
                                        <div className="text-[10px] text-slate-400">{t.province} {t.group ? `• Gr. ${t.group}` : ''}</div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const BracketSkeleton: React.FC<{count: number}> = ({count}) => (
    <div className="flex flex-col justify-around h-full w-full gap-4">
        {Array(count).fill(0).map((_, i) => (
            <div key={i} className="w-[240px] h-[80px] bg-white rounded-xl border border-slate-200 shadow-sm animate-pulse flex flex-col p-2 gap-2 mx-auto">
                <div className="h-4 w-1/3 bg-slate-100 rounded"></div>
                <div className="h-8 bg-slate-100 rounded"></div>
            </div>
        ))}
    </div>
);

const BracketColumn: React.FC<{title: string, children: React.ReactNode, isSingle?: boolean}> = ({ title, children, isSingle }) => (
    <div className={`flex flex-col min-w-[260px] relative px-4 ${isSingle ? 'justify-center' : 'justify-around'}`}>
        <h4 className="absolute top-[-20px] left-0 right-0 text-center font-bold text-slate-400 uppercase text-[10px] tracking-widest">{title}</h4>
        <div className={`flex flex-col h-full w-full ${isSingle ? 'justify-center' : 'justify-around'}`}>
            {children}
        </div>
    </div>
);

const chunkArray = (arr: any[], size: number) => {
    return Array.from({ length: Math.ceil(arr.length / size) }, (v, i) =>
        arr.slice(i * size, i * size + size)
    );
};

// Component for a Pair of Matches + Connector
const BracketPair: React.FC<any> = ({ pair, getMatch, ...props }) => {
    return (
        <div className="flex flex-col justify-center gap-2 relative py-4">
            {/* The two nodes */}
            <BracketNode slot={pair[0]} match={getMatch(pair[0].label)} {...props} showConnector="bottom" />
            <BracketNode slot={pair[1]} match={getMatch(pair[1].label)} {...props} showConnector="top" />
            
            {/* Vertical Connector */}
            <div className="absolute right-[-16px] top-[25%] bottom-[25%] w-4 border-r-2 border-slate-300 rounded-r-lg pointer-events-none"></div>
            {/* Horizontal Line to next round */}
            <div className="absolute right-[-32px] top-1/2 w-4 h-[2px] bg-slate-300 pointer-events-none"></div>
        </div>
    );
};

interface BracketNodeProps {
    slot: { label: string, title: string };
    match?: Match;
    isEditing: boolean;
    isAdmin: boolean;
    onSlotClick: (matchId: string, roundLabel: string, slot: 'A' | 'B', currentName: string) => void;
    onSelect: (data: {match: Match, label: string}) => void;
    fullTeams: Team[];
    onUpdateDetails: (match: Match, updates: Partial<Match>) => void;
    isFinal?: boolean;
    showConnector?: string | boolean;
}

const BracketNode: React.FC<BracketNodeProps> = ({ slot, match, isEditing, isAdmin, onSlotClick, onSelect, fullTeams, onUpdateDetails, isFinal, showConnector }) => {
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

    const handleNodeClick = () => {
        // If viewing mode, open match details
        if (!isEditing) {
            if (!tA && !tB) return;
            const currentMatch = match || {
                id: `M_${slot.label}_TEMP`,
                teamA: teamA_Name || '',
                teamB: teamB_Name || '',
                roundLabel: slot.label,
                status: 'Scheduled',
                scoreA: 0, scoreB: 0, winner: null
            } as Match;
            onSelect({ match: currentMatch, label: slot.label });
        }
    };

    return (
        <div className="relative flex items-center">
            <div 
                className={`relative flex flex-col rounded-xl border w-full transition-all ${isFinal ? 'border-yellow-300 shadow-md bg-yellow-50/50' : 'border-slate-200 shadow-sm bg-white hover:border-indigo-300'} overflow-hidden min-w-[220px]`}
                onClick={handleNodeClick}
            >
                 <div className="bg-slate-50/80 px-2 py-1 text-[9px] text-slate-400 font-bold border-b flex justify-between items-center backdrop-blur-sm">
                     <span>{slot.title}</span>
                     {match && match.winner && <span className="text-green-600 flex items-center gap-1"><Check className="w-3 h-3" /> จบแล้ว</span>}
                     {match && !match.winner && match.scheduledTime && <span className="text-slate-500 flex items-center gap-1"><Clock className="w-3 h-3" /> {new Date(match.scheduledTime).toLocaleTimeString('th-TH', {hour:'2-digit', minute:'2-digit'})}</span>}
                 </div>
                 
                 <div className="divide-y divide-slate-100 text-xs">
                     {/* TEAM A */}
                     <div 
                        className={`p-2 flex justify-between items-center h-9 transition-all duration-200 ${tA ? (match?.winner === 'A' ? 'bg-green-50' : 'bg-white') : isEditing ? 'bg-indigo-50/50 cursor-pointer hover:bg-indigo-100' : 'bg-slate-50/30'}`}
                        onClick={(e) => {
                            if (isEditing) {
                                e.stopPropagation();
                                onSlotClick(match?.id || '', slot.label, 'A', teamA_Name || '');
                            }
                        }}
                     >
                         {tA ? (
                             <div className="flex items-center gap-2 overflow-hidden w-full">
                                 {tA.logo ? <img src={tA.logo} className="w-5 h-5 object-contain bg-white rounded-full border border-slate-100 p-0.5 shrink-0" /> : <div className="w-5 h-5 rounded-full bg-slate-200 shrink-0"></div>}
                                 <span className={`font-bold truncate ${match?.winner === 'A' ? 'text-slate-900' : 'text-slate-600'}`}>{tA.name}</span>
                             </div>
                         ) : <span className={`text-[10px] italic select-none ${isEditing ? 'text-indigo-400 font-bold' : 'text-slate-300'}`}>{isEditing ? '+ เลือกทีม A' : 'รอคู่แข่ง'}</span>}
                         {match && match.winner && <span className={`font-bold px-1.5 rounded ${match.winner === 'A' ? 'bg-green-600 text-white' : 'text-slate-400'}`}>{match.scoreA}</span>}
                     </div>

                     {/* TEAM B */}
                     <div 
                        className={`p-2 flex justify-between items-center h-9 transition-all duration-200 ${tB ? (match?.winner === 'B' ? 'bg-green-50' : 'bg-white') : isEditing ? 'bg-indigo-50/50 cursor-pointer hover:bg-indigo-100' : 'bg-slate-50/30'}`}
                        onClick={(e) => {
                            if (isEditing) {
                                e.stopPropagation();
                                onSlotClick(match?.id || '', slot.label, 'B', teamB_Name || '');
                            }
                        }}
                     >
                         {tB ? (
                             <div className="flex items-center gap-2 overflow-hidden w-full">
                                 {tB.logo ? <img src={tB.logo} className="w-5 h-5 object-contain bg-white rounded-full border border-slate-100 p-0.5 shrink-0" /> : <div className="w-5 h-5 rounded-full bg-slate-200 shrink-0"></div>}
                                 <span className={`font-bold truncate ${match?.winner === 'B' ? 'text-slate-900' : 'text-slate-600'}`}>{tB.name}</span>
                             </div>
                         ) : <span className={`text-[10px] italic select-none ${isEditing ? 'text-indigo-400 font-bold' : 'text-slate-300'}`}>{isEditing ? '+ เลือกทีม B' : 'รอคู่แข่ง'}</span>}
                         {match && match.winner && <span className={`font-bold px-1.5 rounded ${match.winner === 'B' ? 'bg-green-600 text-white' : 'text-slate-400'}`}>{match.scoreB}</span>}
                     </div>
                 </div>

                 {/* Editing Inputs */}
                 {isEditing && match && (tA || tB) && (
                     <div className="px-2 py-1 bg-slate-100 border-t border-slate-200 grid grid-cols-2 gap-1 animate-in slide-in-from-top-1" onClick={e => e.stopPropagation()}>
                         <input type="text" placeholder="สนาม" className="w-full p-1 text-[9px] border rounded" defaultValue={match.venue || ''} onBlur={(e) => onUpdateDetails(match, { venue: e.target.value })} />
                         <input type="datetime-local" className="w-full p-1 text-[9px] border rounded" defaultValue={match.scheduledTime ? new Date(match.scheduledTime).toISOString().slice(0, 16) : ''} onBlur={(e) => onUpdateDetails(match, { scheduledTime: e.target.value })} />
                     </div>
                 )}
            </div>

            {/* Individual Connector (Simple line to right) */}
            {showConnector === true && (
                <div className="absolute right-[-16px] top-1/2 w-4 h-[2px] bg-slate-300 pointer-events-none"></div>
            )}
            {/* Connector Curve logic handles by Parent 'BracketPair' mostly, but if single node needs curve: */}
            {showConnector === 'top' && <div className="absolute right-[-16px] top-[-50%] bottom-1/2 w-4 border-b-2 border-r-2 border-slate-300 rounded-br-lg pointer-events-none"></div>}
            {showConnector === 'bottom' && <div className="absolute right-[-16px] top-1/2 bottom-[-50%] w-4 border-t-2 border-r-2 border-slate-300 rounded-tr-lg pointer-events-none"></div>}
        </div>
    );
};

export default TournamentView;
