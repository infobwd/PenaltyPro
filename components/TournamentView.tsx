
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Team, Match, KickResult } from '../types';
import { Trophy, Edit2, Check, ArrowRight, UserX, ShieldAlert, Sparkles, GripVertical, PlayCircle, AlertCircle, Lock, Eraser, MapPin, Clock, Calendar, RefreshCw, Minimize2, Maximize2, X, Share2, Info, LayoutGrid, List, Medal, Save, Loader2, Trash2, Plus, Download, Image as ImageIcon, Monitor } from 'lucide-react';
import { scheduleMatch, saveMatchToSheet, deleteMatch } from '../services/sheetService';
import { shareMatch } from '../services/liffService';
import html2canvas from 'html2canvas';

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
  tournamentId: string;
  onOpenLiveWall?: () => void;
}

const TournamentView: React.FC<TournamentViewProps> = ({ teams, matches, onSelectMatch, onBack, isAdmin, onRefresh, onLoginClick, isLoading, showNotification, tournamentId, onOpenLiveWall }) => {
  const [editMode, setEditMode] = useState(false);
  const [localMatches, setLocalMatches] = useState<Match[]>([]);
  const [isLargeBracket, setIsLargeBracket] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  
  const bracketRef = useRef<HTMLDivElement>(null);

  // Batch Save State
  const [pendingUpdates, setPendingUpdates] = useState<Map<string, Match>>(new Map());
  const [pendingDeletes, setPendingDeletes] = useState<Set<string>>(new Set());
  const [isSaving, setIsSaving] = useState(false);
  
  const [selectedMatch, setSelectedMatch] = useState<{match: Match, label: string} | null>(null);
  const [walkoverModal, setWalkoverModal] = useState<{match: Match, label: string} | null>(null);
  
  // New: Slot Selection for "Click to Assign"
  const [slotSelection, setSlotSelection] = useState<{ matchId: string, roundLabel: string, slot: 'A' | 'B', currentName: string } | null>(null);

  // Ref to track if we have already auto-sized the bracket based on data
  const hasAutoAdjusted = useRef(false);

  useEffect(() => {
      // If we have already auto-adjusted, don't do it again.
      if (hasAutoAdjusted.current) return;

      // Only attempt to adjust if data is present
      if (teams.length > 0 || matches.length > 0) {
          const hasR32Matches = matches.some(m => m.roundLabel && m.roundLabel.startsWith('R32'));
          // Default to large if lots of teams or R32 matches exist
          if (teams.length > 16 || hasR32Matches) {
              setIsLargeBracket(true);
          }
          // Mark as done so we don't override user later
          hasAutoAdjusted.current = true;
      }
  }, [teams.length, matches]);

  useEffect(() => {
      // CRITICAL: Stop Auto-Refresh Logic
      // If user has unsaved changes (pendingUpdates/Deletes), DO NOT overwrite local state with props.matches.
      // This prevents the UI from "refreshing on its own" while the user is working.
      if (pendingUpdates.size > 0 || pendingDeletes.size > 0) {
          return;
      }

      // Standard Slot Definitions
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
          // Find strictly from server matches first
          const serverMatch = matches.find(m => m.roundLabel === label);
          if (serverMatch) {
              combinedMatches.push(serverMatch);
          } 
      });
      
      // Add any other matches that don't fit the standard slots (custom rounds, groups, etc.)
      matches.forEach(m => {
          if (!m.roundLabel || !combinedMatches.find(cm => cm.id === m.id)) {
              combinedMatches.push(m);
          }
      });

      setLocalMatches(combinedMatches);
      
      // Note: We don't clear pending updates here because of the guard clause at the top.
      // If this runs, it means there were no pending updates anyway.
  }, [matches, pendingUpdates.size, pendingDeletes.size]);

  const getScheduledMatch = (label: string) => localMatches.find(m => m.roundLabel === label);

  // --- Logic for Standings Calculation ---
  const groupStandings = useMemo(() => {
      const standings: Record<string, { team: Team, points: number, gd: number, rank: number }> = {};
      teams.forEach(t => { if (t.status === 'Approved') standings[t.id] = { team: t, points: 0, gd: 0, rank: 0 }; });
      matches.forEach(m => {
          if (!m.winner || !m.roundLabel?.match(/group|กลุ่ม|สาย/i)) return;
          const tA = teams.find(t => t.name === (typeof m.teamA === 'string' ? m.teamA : m.teamA.name));
          const tB = teams.find(t => t.name === (typeof m.teamB === 'string' ? m.teamB : m.teamB.name));
          if (tA && standings[tA.id] && tB && standings[tB.id]) {
              const scoreA = parseInt(m.scoreA.toString() || '0');
              const scoreB = parseInt(m.scoreB.toString() || '0');
              standings[tA.id].gd += (scoreA - scoreB); standings[tB.id].gd += (scoreB - scoreA);
              if (m.winner === 'A' || m.winner === tA.name) standings[tA.id].points += 3;
              else if (m.winner === 'B' || m.winner === tB.name) standings[tB.id].points += 3;
              else { standings[tA.id].points += 1; standings[tB.id].points += 1; }
          }
      });
      const grouped: Record<string, typeof standings[string][]> = {};
      Object.values(standings).forEach(s => { const g = s.team.group || 'Unassigned'; if (!grouped[g]) grouped[g] = []; grouped[g].push(s); });
      Object.keys(grouped).forEach(key => { grouped[key].sort((a, b) => { if (b.points !== a.points) return b.points - a.points; return b.gd - a.gd; }); grouped[key].forEach((s, idx) => s.rank = idx + 1); });
      return grouped;
  }, [matches, teams]);

  // Identify Winning Teams for Selection
  const winningTeams = useMemo(() => {
      const winners = new Set<string>();
      matches.forEach(m => {
          if (m.winner) {
              const wName = m.winner === 'A' 
                  ? (typeof m.teamA === 'string' ? m.teamA : m.teamA.name)
                  : m.winner === 'B' 
                      ? (typeof m.teamB === 'string' ? m.teamB : m.teamB.name)
                      : m.winner;
              if (wName) winners.add(wName);
          }
      });
      return teams.filter(t => winners.has(t.name));
  }, [matches, teams]);

  const handleExportImage = async () => {
      if (!bracketRef.current) return;
      setIsExporting(true);
      try {
          const element = bracketRef.current;
          
          // Temporary style adjustment to capture full width
          const originalWidth = element.style.width;
          const originalOverflow = element.style.overflow;
          const originalMinHeight = element.style.minHeight;
          const originalPadding = element.style.padding;
          
          // Show Export Header & Footer
          const header = element.querySelector('#bracket-export-header') as HTMLElement;
          const footer = element.querySelector('#bracket-export-footer') as HTMLElement;
          if (header) header.style.display = 'block';
          if (footer) footer.style.display = 'block';

          // Add padding for better look and ensure height allows for all content
          element.style.padding = '40px';
          element.style.width = 'fit-content';
          element.style.minWidth = `${element.scrollWidth + 100}px`;
          // Ensure container expands to fit taller nodes if needed
          element.style.minHeight = `fit-content`; 
          element.style.overflow = 'visible';
          element.style.backgroundColor = '#f8fafc'; 

          const canvas = await html2canvas(element, {
              scale: 3, 
              useCORS: true,
              backgroundColor: '#f8fafc',
              ignoreElements: (el) => el.classList.contains('no-export'),
              windowWidth: element.scrollWidth + 100, 
              windowHeight: element.scrollHeight,
              logging: false
          });

          // Restore styles
          element.style.width = originalWidth;
          element.style.overflow = originalOverflow;
          element.style.minHeight = originalMinHeight;
          element.style.padding = originalPadding;
          if (header) header.style.display = 'none';
          if (footer) footer.style.display = 'none';

          const image = canvas.toDataURL("image/jpeg", 0.9);
          const link = document.createElement("a");
          link.href = image;
          link.download = `tournament_bracket_${Date.now()}.jpg`;
          link.click();
          
          if (showNotification) showNotification("สำเร็จ", "ดาวน์โหลดรูปผังการแข่งขันเรียบร้อย", "success");
      } catch (err) {
          console.error("Export failed", err);
          if (showNotification) showNotification("ผิดพลาด", "ไม่สามารถดาวน์โหลดรูปภาพได้", "error");
      } finally {
          setIsExporting(false);
      }
  };

  const handleUpdateSlot = async (teamName: string, targetSelection?: any) => {
      // Allow passing selection directly or using state
      const selection = targetSelection || slotSelection;
      if (!selection) return;
      
      const { roundLabel, slot, matchId: existingMatchId } = selection;
      const isClear = teamName === 'CLEAR_SLOT';

      // Current State in Local
      let matchIndex = localMatches.findIndex(m => m.roundLabel === roundLabel);
      let matchToUpdate = matchIndex >= 0 ? localMatches[matchIndex] : null;

      // Calculate ID: Strict Check
      // 1. Try to use the ID from the existing local object
      let finalMatchId = matchToUpdate?.id;
      // 2. If not found or is temp, try to find in server matches props to prevent duplicate
      if (!finalMatchId || finalMatchId.includes('TEMP')) {
           const existingServerMatch = matches.find(m => m.roundLabel === roundLabel);
           if (existingServerMatch) {
               finalMatchId = existingServerMatch.id;
           } else {
               // 3. Fallback to generating a new ID
               finalMatchId = (existingMatchId && !existingMatchId.includes('TEMP')) ? existingMatchId : `M_${roundLabel}_${Date.now()}`;
           }
      }

      const currentA = matchToUpdate ? (typeof matchToUpdate.teamA === 'object' ? matchToUpdate.teamA.name : matchToUpdate.teamA) : '';
      const currentB = matchToUpdate ? (typeof matchToUpdate.teamB === 'object' ? matchToUpdate.teamB.name : matchToUpdate.teamB) : '';

      const newTeamA = slot === 'A' ? (isClear ? '' : teamName) : currentA;
      const newTeamB = slot === 'B' ? (isClear ? '' : teamName) : currentB;

      // Determine if this results in an empty match (deletion)
      const isBothEmpty = (!newTeamA || newTeamA === '') && (!newTeamB || newTeamB === '');

      // 1. Update Local UI State
      setLocalMatches(prev => {
          const newMatches = [...prev];
          if (isBothEmpty) {
              // Only remove from local array if it's already there
              if (matchIndex >= 0) newMatches.splice(matchIndex, 1);
          } else {
              const newMatchObj: Match = {
                  ...(matchToUpdate || {
                      scoreA: 0, scoreB: 0, winner: null, date: new Date().toISOString(), status: 'Scheduled', tournamentId
                  }),
                  id: finalMatchId,
                  roundLabel,
                  teamA: newTeamA,
                  teamB: newTeamB
              };
              if (matchIndex >= 0) newMatches[matchIndex] = newMatchObj;
              else newMatches.push(newMatchObj);
          }
          return newMatches;
      });

      // 2. Track Pending Changes
      if (isBothEmpty) {
          // DELETE
          setPendingUpdates(prev => {
              const newMap = new Map(prev);
              newMap.delete(finalMatchId);
              return newMap;
          });
          // If it exists in Server Data (prop matches), mark for delete
          const existsInServer = matches.find(m => m.id === finalMatchId);
          if (existsInServer) {
              setPendingDeletes(prev => new Set(prev).add(finalMatchId));
          }
      } else {
          // UPDATE / CREATE
          const newMatchObj: Match = {
              ...(matchToUpdate || {
                  scoreA: 0, scoreB: 0, winner: null, date: new Date().toISOString(), status: 'Scheduled', tournamentId
              }),
              id: finalMatchId,
              roundLabel,
              teamA: newTeamA,
              teamB: newTeamB
          };
          
          setPendingUpdates(prev => new Map(prev).set(finalMatchId, newMatchObj));
          setPendingDeletes(prev => {
              const newSet = new Set(prev);
              newSet.delete(finalMatchId);
              return newSet;
          });
      }

      setSlotSelection(null);
  };

  const handleMatchDetailsUpdate = (match: Match, updates: Partial<Match>) => {
      const updatedMatch = { ...match, ...updates };
      setLocalMatches(prev => prev.map(m => m.id === match.id ? updatedMatch : m));
      setPendingUpdates(prev => new Map(prev).set(updatedMatch.id, updatedMatch));
  };

  const handleSaveChanges = async () => {
      setIsSaving(true);
      try {
          // Process Deletes
          for (const id of pendingDeletes) {
              await deleteMatch(id);
          }
          // Process Updates
          for (const match of pendingUpdates.values()) {
               await scheduleMatch(
                match.id, 
                typeof match.teamA === 'string' ? match.teamA : match.teamA.name, 
                typeof match.teamB === 'string' ? match.teamB : match.teamB.name, 
                match.roundLabel || '', 
                match.venue, 
                match.scheduledTime, 
                undefined, 
                undefined, 
                tournamentId
            );
          }
          
          setPendingUpdates(new Map());
          setPendingDeletes(new Set());
          if (showNotification) showNotification("บันทึกสำเร็จ", "อัปเดตผังการแข่งขันเรียบร้อย", "success");
          onRefresh(); // Refresh from server to sync final IDs/state
      } catch (e) {
          if (showNotification) showNotification("ผิดพลาด", "เกิดข้อผิดพลาดในการบันทึก", "error");
      } finally {
          setIsSaving(false);
          setEditMode(false);
      }
  };

  const handleWalkover = async (winner: string) => {
     if (!walkoverModal) return;
     const matchId = walkoverModal.match.id || `M_${walkoverModal.label}_${Date.now()}`;
     
     // Update Local UI immediately
     setLocalMatches(prev => prev.map(m => m.id === matchId ? { 
         ...m, 
         scoreA: winner === (typeof m.teamA === 'object' ? m.teamA.name : m.teamA) ? 3 : 0,
         scoreB: winner === (typeof m.teamB === 'object' ? m.teamB.name : m.teamB) ? 3 : 0,
         winner: winner === (typeof m.teamA === 'object' ? m.teamA.name : m.teamA) ? 'A' : 'B',
         status: 'Finished'
     } : m));

     const dummyMatch: any = {
         matchId: matchId,
         teamA: { name: typeof walkoverModal.match.teamA === 'string' ? walkoverModal.match.teamA : (walkoverModal.match.teamA as Team).name }, 
         teamB: { name: typeof walkoverModal.match.teamB === 'string' ? walkoverModal.match.teamB : (walkoverModal.match.teamB as Team).name },
         scoreA: winner === walkoverModal.match.teamA ? 3 : 0,
         scoreB: winner === walkoverModal.match.teamB ? 3 : 0,
         winner: winner === walkoverModal.match.teamA ? 'A' : 'B',
         kicks: [],
         roundLabel: walkoverModal.label
     };
     await saveMatchToSheet(dummyMatch, "ชนะบาย (Walkover) / สละสิทธิ์", false, tournamentId);
     
     setWalkoverModal(null);
     setSelectedMatch(null);
     if (showNotification) showNotification("เรียบร้อย", "บันทึกผลชนะบายเรียบร้อย (กรุณาเลือกทีมชนะในรอบถัดไปเอง)", "success");
  };

  const handleStartMatch = () => {
      if (!selectedMatch) return;
      const m = selectedMatch.match;
      const tA = teams.find(t => t.name === (typeof m.teamA === 'string' ? m.teamA : m.teamA.name)) || { id: 'tempA', name: m.teamA as string } as Team;
      const tB = teams.find(t => t.name === (typeof m.teamB === 'string' ? m.teamB : m.teamB.name)) || { id: 'tempB', name: m.teamB as string } as Team;
      
      const validId = (m.id && !m.id.includes('TEMP')) ? m.id : `M_${selectedMatch.label}_${Date.now()}`;
      onSelectMatch(tA, tB, validId);
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

  const handleSlotClick = (matchId: string, roundLabel: string, slot: 'A' | 'B', currentName: string) => {
      if (editMode && isAdmin) {
          setSlotSelection({ matchId, roundLabel, slot, currentName });
      }
  };

  const handleQuickRemove = (matchId: string, roundLabel: string, slot: 'A' | 'B', currentName: string) => {
      // Direct call to update slot with CLEAR_SLOT without opening modal
      handleUpdateSlot('CLEAR_SLOT', { matchId, roundLabel, slot, currentName });
  };

  return (
    <div className="w-full max-w-[98%] mx-auto p-2 md:p-4 min-h-screen flex flex-col bg-slate-50 relative">
      
      {/* LOADING OVERLAY */}
      {isSaving && (
          <div className="fixed inset-0 z-[2000] bg-black/70 backdrop-blur-sm flex items-center justify-center flex-col text-white animate-in fade-in duration-300">
              <div className="bg-white/10 p-6 rounded-3xl backdrop-blur-md flex flex-col items-center border border-white/20 shadow-2xl">
                  <Loader2 className="w-12 h-12 animate-spin mb-4 text-indigo-400" />
                  <h3 className="text-xl font-bold mb-1">กำลังบันทึกข้อมูล...</h3>
                  <p className="text-sm text-slate-300">กรุณารอสักครู่ ห้ามปิดหน้าต่าง</p>
              </div>
          </div>
      )}

      {/* EXPORT OVERLAY */}
      {isExporting && (
          <div className="fixed inset-0 z-[2000] bg-black/70 backdrop-blur-sm flex items-center justify-center flex-col text-white animate-in fade-in duration-300">
              <div className="bg-white/10 p-6 rounded-3xl backdrop-blur-md flex flex-col items-center border border-white/20 shadow-2xl">
                  <Loader2 className="w-12 h-12 animate-spin mb-4 text-green-400" />
                  <h3 className="text-xl font-bold mb-1">กำลังสร้างรูปภาพ...</h3>
                  <p className="text-sm text-slate-300">ความละเอียดสูง (High Quality)</p>
              </div>
          </div>
      )}

      <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-200 sticky top-0 z-30">
         <div className="w-full md:w-auto">
             <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                <Trophy className="w-6 h-6 text-yellow-500" /> แผนผัง <span className="hidden md:inline">การแข่งขัน</span>
             </h2>
             <div className="flex items-center gap-2">
                 {editMode && <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-[10px] font-bold rounded-full animate-pulse border border-orange-200">EDIT MODE</span>}
                 <p className="text-xs text-slate-500">
                    {isAdmin ? (editMode ? "แตะช่องว่างเพื่อเพิ่มทีม หรือแตะที่ทีมเพื่อแก้ไข" : "คลิก 'จัดการ' เพื่อแก้ไขผัง") : "คลิกที่คู่แข่งขันเพื่อดูรายละเอียด"}
                 </p>
             </div>
         </div>
         <div className="flex gap-2 w-full md:w-auto overflow-x-auto pb-2 md:pb-0">
            {/* SAVE BUTTON */}
            {(pendingUpdates.size > 0 || pendingDeletes.size > 0) && isAdmin && (
                <button 
                    onClick={handleSaveChanges} 
                    disabled={isSaving}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-bold text-xs whitespace-nowrap shadow-md animate-pulse"
                >
                    <Save className="w-4 h-4"/>
                    บันทึก ({pendingUpdates.size + pendingDeletes.size})
                </button>
            )}

            {/* LIVE WALL BUTTON (Hidden on Mobile) */}
            {onOpenLiveWall && (
                <button onClick={onOpenLiveWall} className="hidden md:flex items-center gap-2 px-3 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition text-xs font-bold whitespace-nowrap shadow-sm">
                    <Monitor className="w-4 h-4" /> Live Wall
                </button>
            )}

            <button onClick={handleExportImage} disabled={isExporting} className="flex items-center gap-2 px-3 py-2 bg-slate-100 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-200 transition text-xs whitespace-nowrap">
                {isExporting ? <Loader2 className="w-4 h-4 animate-spin"/> : <ImageIcon className="w-4 h-4" />} รูปภาพ
            </button>

            <button onClick={() => setIsLargeBracket(!isLargeBracket)} className="flex items-center gap-2 px-3 py-2 bg-slate-100 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-200 transition text-xs whitespace-nowrap">
                {isLargeBracket ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />} {isLargeBracket ? 'ลด (16)' : 'ขยาย (32)'}
            </button>
            <button onClick={onRefresh} className="flex items-center gap-2 px-3 py-2 bg-slate-100 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-200 transition text-xs whitespace-nowrap">
                <RefreshCw className="w-4 h-4" /> Refresh
            </button>
            {!isAdmin && <button onClick={onLoginClick} className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 text-slate-600 rounded-lg hover:bg-slate-50 transition font-bold text-xs whitespace-nowrap"><Lock className="w-4 h-4" /> Login</button>}
            {isAdmin && (
                <button onClick={() => setEditMode(!editMode)} className={`flex items-center gap-2 px-4 py-2 rounded-lg transition font-bold text-xs whitespace-nowrap ${editMode ? 'bg-orange-500 hover:bg-orange-600 text-white shadow-lg ring-2 ring-orange-200' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}>
                    {editMode ? <Check className="w-4 h-4" /> : <Edit2 className="w-4 h-4" />} {editMode ? 'เสร็จสิ้น' : 'จัดการผัง'}
                </button>
            )}
            <button onClick={onBack} className="text-xs text-slate-500 hover:text-indigo-600 px-4 py-2 font-medium whitespace-nowrap">กลับ</button>
         </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 flex-1 items-start relative overflow-x-auto">
          
          <div ref={bracketRef} className={`flex-1 w-full pb-10 px-4 pt-4 bg-slate-50 relative ${isLargeBracket ? 'min-h-[1200px]' : 'min-h-[900px]'}`}>
             
             {/* Hidden Export Header - Visually Appealing */}
             <div id="bracket-export-header" className="hidden p-8 mb-8 text-center bg-gradient-to-r from-indigo-900 to-slate-900 text-white rounded-3xl shadow-lg border-b-8 border-yellow-400 overflow-hidden relative">
                <div className="absolute top-0 right-0 w-64 h-64 bg-white opacity-5 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl"></div>
                <div className="flex flex-col items-center gap-4 relative z-10">
                    <div className="w-20 h-20 bg-white/10 rounded-full flex items-center justify-center border-4 border-yellow-400 shadow-xl backdrop-blur-sm">
                        <Trophy className="w-10 h-10 text-yellow-400 drop-shadow-md" />
                    </div>
                    <div>
                        <h1 className="text-4xl font-black tracking-widest uppercase mb-2 drop-shadow-md font-sans">Official Bracket</h1>
                        <p className="text-indigo-200 font-medium text-lg flex items-center justify-center gap-2">
                            <Calendar className="w-5 h-5"/> {new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })}
                        </p>
                    </div>
                </div>
             </div>

             <div className={`flex flex-col gap-10 mx-auto ${isLargeBracket ? 'min-w-[1400px]' : 'min-w-[1100px]'}`}>
                 
                 {/* LINE A */}
                 <div className="bg-blue-50/30 p-4 md:p-6 rounded-3xl border border-blue-100 shadow-inner relative">
                     <div className="absolute top-0 left-0 bg-blue-600 text-white px-3 py-1 rounded-br-xl text-xs font-bold shadow-sm z-10">สาย A</div>
                     <div className="flex justify-start gap-0 items-stretch pt-6">
                        {isLargeBracket && (
                            <BracketColumn title="รอบ 32">
                                {isLoading ? <BracketSkeleton count={4} /> : round32_A_Pairs.map((pair, i) => <BracketPair key={i} pair={pair} getMatch={getScheduledMatch} isEditing={editMode} isAdmin={isAdmin} onSlotClick={handleSlotClick} onQuickRemove={handleQuickRemove} onSelect={setSelectedMatch} fullTeams={teams} onUpdateDetails={handleMatchDetailsUpdate} />)}
                            </BracketColumn>
                        )}
                        <BracketColumn title="รอบ 16">
                             {isLoading ? <BracketSkeleton count={2} /> : round16_A_Pairs.map((pair, i) => <BracketPair key={i} pair={pair} getMatch={getScheduledMatch} isEditing={editMode} isAdmin={isAdmin} onSlotClick={handleSlotClick} onQuickRemove={handleQuickRemove} onSelect={setSelectedMatch} fullTeams={teams} onUpdateDetails={handleMatchDetailsUpdate} />)}
                        </BracketColumn>
                        <BracketColumn title="รอบ 8">
                             {isLoading ? <BracketSkeleton count={1} /> : quarters_A_Pairs.map((pair, i) => <BracketPair key={i} pair={pair} getMatch={getScheduledMatch} isEditing={editMode} isAdmin={isAdmin} onSlotClick={handleSlotClick} onQuickRemove={handleQuickRemove} onSelect={setSelectedMatch} fullTeams={teams} onUpdateDetails={handleMatchDetailsUpdate} />)}
                        </BracketColumn>
                        <BracketColumn title="รองชนะเลิศ" isSingle>
                             {isLoading ? <BracketSkeleton count={1} /> : semis_A.map(slot => <BracketNode key={slot.label} slot={slot} match={getScheduledMatch(slot.label)} isEditing={editMode} isAdmin={isAdmin} onSlotClick={handleSlotClick} onQuickRemove={handleQuickRemove} onSelect={setSelectedMatch} fullTeams={teams} onUpdateDetails={handleMatchDetailsUpdate} showConnector={true} />)}
                        </BracketColumn>
                     </div>
                 </div>

                 {/* FINAL */}
                 <div className="flex justify-end pr-32 -my-4 relative z-20 pointer-events-none">
                     <div className="flex flex-col items-center justify-center pointer-events-auto">
                        <div className="h-8 w-0.5 bg-yellow-400"></div>
                        <div className="bg-gradient-to-b from-yellow-50 to-yellow-100 p-4 rounded-xl border-2 border-yellow-400 shadow-[0_0_30px_rgba(250,204,21,0.2)] transform scale-110">
                             <h3 className="text-center font-black text-yellow-700 text-lg mb-2 uppercase tracking-widest flex items-center justify-center gap-2"><Trophy className="w-5 h-5" /> Final</h3>
                             {isLoading ? <BracketSkeleton count={1} /> : final.map(slot => <BracketNode key={slot.label} slot={slot} match={getScheduledMatch(slot.label)} isEditing={editMode} isAdmin={isAdmin} onSlotClick={handleSlotClick} onQuickRemove={handleQuickRemove} onSelect={setSelectedMatch} fullTeams={teams} onUpdateDetails={handleMatchDetailsUpdate} isFinal />)}
                        </div>
                        <div className="h-8 w-0.5 bg-yellow-400"></div>
                     </div>
                 </div>

                 {/* LINE B */}
                 <div className="bg-red-50/30 p-4 md:p-6 rounded-3xl border border-red-100 shadow-inner relative">
                     <div className="absolute top-0 left-0 bg-red-600 text-white px-3 py-1 rounded-br-xl text-xs font-bold shadow-sm z-10">สาย B</div>
                     <div className="flex justify-start gap-0 items-stretch pt-6">
                        {isLargeBracket && (
                            <BracketColumn title="รอบ 32">
                                {isLoading ? <BracketSkeleton count={4} /> : round32_B_Pairs.map((pair, i) => <BracketPair key={i} pair={pair} getMatch={getScheduledMatch} isEditing={editMode} isAdmin={isAdmin} onSlotClick={handleSlotClick} onQuickRemove={handleQuickRemove} onSelect={setSelectedMatch} fullTeams={teams} onUpdateDetails={handleMatchDetailsUpdate} />)}
                            </BracketColumn>
                        )}
                        <BracketColumn title="รอบ 16">
                             {isLoading ? <BracketSkeleton count={2} /> : round16_B_Pairs.map((pair, i) => <BracketPair key={i} pair={pair} getMatch={getScheduledMatch} isEditing={editMode} isAdmin={isAdmin} onSlotClick={handleSlotClick} onQuickRemove={handleQuickRemove} onSelect={setSelectedMatch} fullTeams={teams} onUpdateDetails={handleMatchDetailsUpdate} />)}
                        </BracketColumn>
                        <BracketColumn title="รอบ 8">
                             {isLoading ? <BracketSkeleton count={1} /> : quarters_B_Pairs.map((pair, i) => <BracketPair key={i} pair={pair} getMatch={getScheduledMatch} isEditing={editMode} isAdmin={isAdmin} onSlotClick={handleSlotClick} onQuickRemove={handleQuickRemove} onSelect={setSelectedMatch} fullTeams={teams} onUpdateDetails={handleMatchDetailsUpdate} />)}
                        </BracketColumn>
                        <BracketColumn title="รองชนะเลิศ" isSingle>
                             {isLoading ? <BracketSkeleton count={1} /> : semis_B.map(slot => <BracketNode key={slot.label} slot={slot} match={getScheduledMatch(slot.label)} isEditing={editMode} isAdmin={isAdmin} onSlotClick={handleSlotClick} onQuickRemove={handleQuickRemove} onSelect={setSelectedMatch} fullTeams={teams} onUpdateDetails={handleMatchDetailsUpdate} showConnector={true} />)}
                        </BracketColumn>
                     </div>
                 </div>

             </div>

             {/* Hidden Export Footer */}
             <div id="bracket-export-footer" className="hidden mt-12 text-center">
                <div className="inline-flex items-center gap-2 px-6 py-3 bg-white rounded-full shadow-md border border-slate-200 text-slate-400 text-sm font-bold tracking-wider">
                    <img src="https://raw.githubusercontent.com/noppharutlubbuangam-dot/vichakan/refs/heads/main/cup.gif" className="w-5 h-5 opacity-50 grayscale" />
                    <span>POWERED BY PENALTY PRO ARENA</span>
                </div>
             </div>
          </div>
      </div>
      
      {/* SLOT ASSIGNMENT MODAL */}
      {slotSelection && (
          <TeamAssignmentModal 
              isOpen={!!slotSelection}
              onClose={() => setSlotSelection(null)}
              onAssign={(teamName) => handleUpdateSlot(teamName)}
              teams={teams}
              winningTeams={winningTeams}
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
                  <p className="text-slate-600 mb-6">กรุณาเลือกทีมที่ <b>ชนะ</b> (ทีมอีกฝ่ายจะถูกปรับแพ้ 0-3)<br/>และระบบจะส่งทีมชนะเข้ารอบถัดไปทันที</p>
                  
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

// ... (Rest of the component remains same: TeamAssignmentModal, BracketSkeleton, BracketColumn)

const TeamAssignmentModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onAssign: (teamName: string) => void;
    teams: Team[];
    winningTeams: Team[];
    groupStandings: Record<string, { team: Team, points: number, gd: number, rank: number }[]>;
    currentSlotName: string;
    slotLabel: string;
}> = ({ isOpen, onClose, onAssign, teams, winningTeams, groupStandings, currentSlotName, slotLabel }) => {
    const [tab, setTab] = useState<'winners' | 'standings' | 'all'>('winners');
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
                    <button onClick={() => setTab('winners')} className={`flex-1 py-3 text-sm font-bold transition ${tab === 'winners' ? 'bg-white text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-500 hover:bg-slate-100'}`}><Medal className="w-4 h-4 inline mr-1"/> ผู้ชนะ</button>
                    <button onClick={() => setTab('standings')} className={`flex-1 py-3 text-sm font-bold transition ${tab === 'standings' ? 'bg-white text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-500 hover:bg-slate-100'}`}><LayoutGrid className="w-4 h-4 inline mr-1"/> อันดับ</button>
                    <button onClick={() => setTab('all')} className={`flex-1 py-3 text-sm font-bold transition ${tab === 'all' ? 'bg-white text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-500 hover:bg-slate-100'}`}><List className="w-4 h-4 inline mr-1"/> ทั้งหมด</button>
                </div>

                <div className="flex-1 overflow-y-auto p-2 bg-slate-50">
                    {/* Clear Slot Option */}
                    <button onClick={() => onAssign('CLEAR_SLOT')} className="w-full p-3 mb-3 bg-red-50 border border-red-200 text-red-600 rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-red-100 transition">
                        <Eraser className="w-4 h-4"/> ล้างช่อง / ลบทีมออก (Clear)
                    </button>

                    {tab === 'winners' && (
                        <div className="space-y-2">
                            <p className="text-xs text-slate-400 pl-2 mb-2">ทีมที่ชนะในรอบก่อนหน้า</p>
                            {winningTeams.length === 0 ? (
                                <div className="text-center py-8 text-slate-400 italic">ยังไม่มีทีมชนะ</div>
                            ) : (
                                winningTeams.map(t => (
                                    <button 
                                        key={t.id}
                                        onClick={() => onAssign(t.name)}
                                        className="w-full bg-white p-3 rounded-xl border border-green-200 flex items-center gap-3 hover:border-green-400 hover:shadow-md transition text-left"
                                    >
                                        <div className="w-8 h-8 bg-green-100 text-green-600 rounded-full flex items-center justify-center font-bold">
                                            <Trophy className="w-4 h-4" />
                                        </div>
                                        <div>
                                            <div className={`text-sm font-bold ${t.name === currentSlotName ? 'text-indigo-600' : 'text-slate-700'}`}>{t.name}</div>
                                            <div className="text-[10px] text-green-600 font-medium">Winner</div>
                                        </div>
                                    </button>
                                ))
                            )}
                        </div>
                    )}

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
            <div key={i} className="w-[240px] h-[180px] bg-white rounded-xl border border-slate-200 shadow-sm animate-pulse flex flex-col p-2 gap-2 mx-auto">
                <div className="h-4 w-1/3 bg-slate-100 rounded"></div>
                <div className="h-20 bg-slate-100 rounded"></div>
                <div className="h-20 bg-slate-100 rounded"></div>
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

const BracketPair: React.FC<any> = ({ pair, getMatch, ...props }) => {
    return (
        <div className="flex flex-col justify-center gap-6 relative py-4">
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
    onQuickRemove: (matchId: string, roundLabel: string, slot: 'A' | 'B', currentName: string) => void;
    onSelect: (data: {match: Match, label: string}) => void;
    fullTeams: Team[];
    onUpdateDetails: (match: Match, updates: Partial<Match>) => void;
    isFinal?: boolean;
    showConnector?: string | boolean;
}

const BracketNode: React.FC<BracketNodeProps> = ({ slot, match, isEditing, isAdmin, onSlotClick, onQuickRemove, onSelect, fullTeams, onUpdateDetails, isFinal, showConnector }) => {
    const teamA_Name = typeof match?.teamA === 'object' ? match.teamA.name : match?.teamA;
    const teamB_Name = typeof match?.teamB === 'object' ? match.teamB.name : match?.teamB;
    
    // Time & Date Rendering Logic
    const dateStr = match?.scheduledTime ? new Date(match.scheduledTime).toLocaleDateString('th-TH', {day: 'numeric', month: 'short'}) : '';
    const timeStr = match?.scheduledTime ? new Date(match.scheduledTime).toLocaleTimeString('th-TH', {hour: '2-digit', minute: '2-digit'}) : '';
    const venueStr = match?.venue || '';

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
                 <div className="bg-slate-50/80 px-2 py-1.5 text-[9px] text-slate-500 font-bold border-b flex flex-col gap-0.5 backdrop-blur-sm">
                     <div className="flex justify-between items-center w-full">
                        <span>{slot.title}</span>
                        {match && match.winner && <span className="text-green-600 flex items-center gap-1"><Check className="w-3 h-3" /> จบแล้ว</span>}
                        {match && !match.winner && dateStr && <span className="text-slate-500 flex items-center gap-1"><Calendar className="w-3 h-3" /> {dateStr} {timeStr}</span>}
                     </div>
                     {venueStr && (
                         <div className="flex items-center gap-1 justify-end text-indigo-500 font-medium border-t border-slate-100 pt-0.5 mt-0.5">
                             <MapPin className="w-2.5 h-2.5" /> {venueStr}
                         </div>
                     )}
                 </div>
                 
                 <div className="divide-y divide-slate-100 text-xs md:text-sm">
                     {/* TEAM A */}
                     <div 
                        className={`p-2 flex justify-between items-center min-h-[100px] transition-all duration-200 ${tA ? (match?.winner === 'A' ? 'bg-green-50' : 'bg-white') : isEditing ? 'bg-indigo-50/50 cursor-pointer hover:bg-indigo-100 group' : 'bg-slate-50/30'}`}
                        onClick={(e) => {
                            if (isEditing) {
                                e.stopPropagation();
                                onSlotClick(match?.id || '', slot.label, 'A', teamA_Name || '');
                            }
                        }}
                     >
                         {tA ? (
                             <div className="flex items-center gap-2 overflow-hidden w-full relative">
                                 {tA.logo ? <img src={tA.logo} className="w-10 h-10 object-contain bg-white rounded-full border border-slate-100 p-0.5 shrink-0" /> : <div className="w-10 h-10 rounded-full bg-slate-200 shrink-0"></div>}
                                 <span className={`font-bold leading-snug w-full whitespace-normal text-sm md:text-base ${match?.winner === 'A' ? 'text-slate-900' : 'text-slate-600'}`}>{tA.name}</span>
                                 
                                 {/* Quick Remove Button (Edit Mode Only) */}
                                 {isEditing && (
                                     <button 
                                        className="absolute right-0 bg-red-100 hover:bg-red-500 hover:text-white text-red-500 p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onQuickRemove(match?.id || '', slot.label, 'A', teamA_Name || '');
                                        }}
                                        title="ลบทีมนี้"
                                     >
                                         <Trash2 className="w-3 h-3" />
                                     </button>
                                 )}
                             </div>
                         ) : (
                             <div className="flex items-center gap-2 w-full text-slate-400 opacity-70 group-hover:opacity-100 group-hover:text-indigo-600">
                                 {isEditing ? <Plus className="w-4 h-4 border border-dashed border-indigo-300 rounded-full" /> : <div className="w-4 h-4"></div>}
                                 <span className={`text-[10px] italic select-none ${isEditing ? 'font-bold' : ''}`}>{isEditing ? 'เลือกทีม A' : 'รอคู่แข่ง'}</span>
                             </div>
                         )}
                         {match && match.winner && <span className={`font-bold px-2 py-1 rounded text-sm ${match.winner === 'A' ? 'bg-green-600 text-white' : 'text-slate-400 bg-slate-100'}`}>{match.scoreA}</span>}
                     </div>

                     {/* TEAM B */}
                     <div 
                        className={`p-2 flex justify-between items-center min-h-[100px] transition-all duration-200 ${tB ? (match?.winner === 'B' ? 'bg-green-50' : 'bg-white') : isEditing ? 'bg-indigo-50/50 cursor-pointer hover:bg-indigo-100 group' : 'bg-slate-50/30'}`}
                        onClick={(e) => {
                            if (isEditing) {
                                e.stopPropagation();
                                onSlotClick(match?.id || '', slot.label, 'B', teamB_Name || '');
                            }
                        }}
                     >
                         {tB ? (
                             <div className="flex items-center gap-2 overflow-hidden w-full relative">
                                 {tB.logo ? <img src={tB.logo} className="w-10 h-10 object-contain bg-white rounded-full border border-slate-100 p-0.5 shrink-0" /> : <div className="w-10 h-10 rounded-full bg-slate-200 shrink-0"></div>}
                                 <span className={`font-bold leading-snug w-full whitespace-normal text-sm md:text-base ${match?.winner === 'B' ? 'text-slate-900' : 'text-slate-600'}`}>{tB.name}</span>
                                 
                                 {/* Quick Remove Button (Edit Mode Only) */}
                                 {isEditing && (
                                     <button 
                                        className="absolute right-0 bg-red-100 hover:bg-red-500 hover:text-white text-red-500 p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onQuickRemove(match?.id || '', slot.label, 'B', teamB_Name || '');
                                        }}
                                        title="ลบทีมนี้"
                                     >
                                         <Trash2 className="w-3 h-3" />
                                     </button>
                                 )}
                             </div>
                         ) : (
                             <div className="flex items-center gap-2 w-full text-slate-400 opacity-70 group-hover:opacity-100 group-hover:text-indigo-600">
                                 {isEditing ? <Plus className="w-4 h-4 border border-dashed border-indigo-300 rounded-full" /> : <div className="w-4 h-4"></div>}
                                 <span className={`text-[10px] italic select-none ${isEditing ? 'font-bold' : ''}`}>{isEditing ? 'เลือกทีม B' : 'รอคู่แข่ง'}</span>
                             </div>
                         )}
                         {match && match.winner && <span className={`font-bold px-2 py-1 rounded text-sm ${match.winner === 'B' ? 'bg-green-600 text-white' : 'text-slate-400 bg-slate-100'}`}>{match.scoreB}</span>}
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
