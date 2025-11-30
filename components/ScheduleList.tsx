import React, { useState, useRef, useEffect } from 'react';
import { Match, Team, Player, AppSettings, KickResult } from '../types';
import { ArrowLeft, Calendar, MapPin, Clock, Trophy, Plus, X, Save, Loader2, Search, ChevronDown, Check, Share2, Edit2, Trash2, AlertTriangle, User, ListPlus, PlusCircle, Users, ArrowRight, PlayCircle, ClipboardCheck, RotateCcw, Flag, Video, Image, Youtube, Facebook, BarChart2, ImageIcon, Download, Camera, Filter, Sparkles, MessageSquare, Cpu, FileText, PenTool, LayoutTemplate } from 'lucide-react';
import { scheduleMatch, deleteMatch, saveMatchToSheet, fileToBase64 } from '../services/sheetService';
import { generateMatchSummary, generateLocalSummary } from '../services/geminiService';
import { shareMatch } from '../services/liffService';

interface ScheduleListProps {
  matches: Match[];
  teams: Team[];
  players?: Player[]; 
  onBack: () => void;
  isAdmin?: boolean;
  isLoading?: boolean;
  onRefresh?: () => void;
  showNotification?: (title: string, message: string, type: 'success' | 'error' | 'info' | 'warning') => void;
  onStartMatch: (teamA: Team, teamB: Team, matchId: string) => void;
  config: AppSettings;
  initialMatchId?: string | null;
  currentTournamentId?: string | null;
}

const VENUE_OPTIONS = ["สนาม 1", "สนาม 2", "สนาม 3", "สนาม 4", "สนามกลาง (Main Stadium)"];
const AI_MODELS = [
    { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash (เร็ว/เสถียร)' },
    { id: 'gemini-2.0-flash-lite', name: 'Gemini 2.0 Flash Lite (Preview)' },
    { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite (New)' },
    { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash (Standard)' },
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash (Smart)' },
    { id: 'gemini-3-pro', name: 'Gemini 3 Pro (Experimental)' },
];

interface TeamSelectorProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (team: Team) => void;
    teams: Team[];
    title?: string;
}

const TeamSelectorModal: React.FC<TeamSelectorProps> = ({ isOpen, onClose, onSelect, teams, title }) => {
    const [search, setSearch] = useState('');
    
    useEffect(() => {
        if(isOpen) setSearch('');
    }, [isOpen]);

    if (!isOpen) return null;

    const filtered = teams.filter(t => t.name.toLowerCase().includes(search.toLowerCase()));

    return (
        <div className="fixed inset-0 z-[1300] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh] animate-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
                <div className="p-4 border-b flex justify-between items-center bg-slate-50">
                    <h3 className="font-bold text-slate-800">{title || "เลือกทีม"}</h3>
                    <button onClick={onClose} className="p-1 hover:bg-slate-200 rounded-full"><X className="w-5 h-5 text-slate-500"/></button>
                </div>
                <div className="p-3 border-b">
                    <div className="relative">
                        <Search className="absolute left-3 top-2.5 w-5 h-5 text-slate-400" />
                        <input 
                            type="text" 
                            className="w-full pl-10 pr-4 py-2 border rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none transition" 
                            placeholder="ค้นหาชื่อทีม..." 
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            autoFocus
                        />
                    </div>
                </div>
                <div className="overflow-y-auto flex-1 p-2">
                    {filtered.length > 0 ? (
                        <div className="grid grid-cols-1 gap-2">
                            {filtered.map(t => (
                                <button 
                                    key={t.id} 
                                    onClick={() => { onSelect(t); onClose(); }}
                                    className="flex items-center gap-3 p-3 hover:bg-indigo-50 rounded-xl transition text-left group border border-transparent hover:border-indigo-100"
                                >
                                    {t.logoUrl ? (
                                        <img src={t.logoUrl} className="w-10 h-10 rounded-lg object-contain bg-white border border-slate-100 p-0.5" />
                                    ) : (
                                        <div className="w-10 h-10 rounded-lg bg-slate-200 flex items-center justify-center font-bold text-slate-500 text-sm">
                                            {t.name.substring(0,1)}
                                        </div>
                                    )}
                                    <div className="flex-1">
                                        <div className="font-bold text-slate-800 group-hover:text-indigo-700">{t.name}</div>
                                        {t.group && <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-bold">Group {t.group}</span>}
                                    </div>
                                    <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-400" />
                                </button>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-8 text-slate-400">ไม่พบทีมที่ค้นหา</div>
                    )}
                </div>
            </div>
        </div>
    );
};

const ScheduleList: React.FC<ScheduleListProps> = ({ matches, teams, players = [], onBack, isAdmin, isLoading, onRefresh, showNotification, onStartMatch, config, initialMatchId, currentTournamentId }) => {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  const [isDeleting, setIsDeleting] = useState(false);
  const [matchToDelete, setMatchToDelete] = useState<string | null>(null);
  const [matchToReset, setMatchToReset] = useState<string | null>(null);
  
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [detailTab, setDetailTab] = useState<'overview' | 'stats' | 'share'>('overview');
  
  const [activeMatchType, setActiveMatchType] = useState<'group' | 'knockout' | 'custom'>('group');
  
  const [matchForm, setMatchForm] = useState({ id: '', teamA: '', teamB: '', date: '', time: '', venue: '', roundLabel: 'Group A', livestreamUrl: '' });
  const [matchCover, setMatchCover] = useState<{file: File | null, preview: string | null}>({file: null, preview: null});
  const [bulkMatches, setBulkMatches] = useState<Array<{ tempId: string, teamA: string, teamB: string, time: string, venue: string }>>([]);

  const [quickScoreA, setQuickScoreA] = useState('');
  const [quickScoreB, setQuickScoreB] = useState('');
  const [isQuickSaving, setIsQuickSaving] = useState(false);

  const [isEditResultOpen, setIsEditResultOpen] = useState(false);
  const [editResultForm, setEditResultForm] = useState({ matchId: '', teamA: '', teamB: '', scoreA: '', scoreB: '' });

  const [selectorConfig, setSelectorConfig] = useState<{ 
      isOpen: boolean; 
      mode: 'singleA' | 'singleB' | 'bulkA' | 'bulkB'; 
      rowIndex?: number; 
      currentValue?: string;
  }>({ isOpen: false, mode: 'singleA' });

  // Filter States
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [filterGroup, setFilterGroup] = useState('All');

  // AI Summary State
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [selectedAiModel, setSelectedAiModel] = useState('gemini-1.5-flash');
  const [isEditingSummary, setIsEditingSummary] = useState(false);
  const [isSavingSummary, setIsSavingSummary] = useState(false);

  // FIX: Deep Linking Logic
  const hasProcessedDeepLink = useRef(false);

  useEffect(() => {
    // Only process deep link ONCE on mount/data load
    if (initialMatchId && matches.length > 0 && !hasProcessedDeepLink.current) {
        const found = matches.find(m => m.id === initialMatchId);
        if (found) {
            setSelectedMatch(found);
            setDetailTab('overview');
            hasProcessedDeepLink.current = true;
        }
    }
    // Do NOT reset selectedMatch to null in the else block here
    // This allows manual selection to persist
  }, [initialMatchId, matches]);

  // Validate AI Model Selection
  useEffect(() => {
    if (!AI_MODELS.find(m => m.id === selectedAiModel)) {
        setSelectedAiModel('gemini-1.5-flash');
    }
  }, [selectedAiModel]);

  useEffect(() => {
    if (selectedMatch) {
        setQuickScoreA(selectedMatch.scoreA?.toString() || '');
        setQuickScoreB(selectedMatch.scoreB?.toString() || '');
        // Load summary if exists from database
        setAiSummary(selectedMatch.summary || null);
        setIsEditingSummary(false);
    } else {
        setQuickScoreA('');
        setQuickScoreB('');
        setAiSummary(null);
        setDetailTab('overview');
    }
  }, [selectedMatch]);

  const scheduledMatches = matches.filter(m => !m.winner).sort((a, b) => new Date(a.scheduledTime || a.date).getTime() - new Date(b.scheduledTime || b.date).getTime());
  const finishedMatches = matches.filter(m => m.winner).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const resolveTeam = (t: string | Team | null | undefined): Team => {
    if (!t) return { id: 'unknown', name: 'Unknown Team', shortName: 'N/A', color: '#94a3b8', logoUrl: '' } as Team;
    if (typeof t === 'object' && 'name' in t) return t as Team;
    const teamName = typeof t === 'string' ? t : 'Unknown';
    return teams.find(team => team.name === teamName) || { 
        id: 'temp', 
        name: teamName, 
        color: '#94a3b8', 
        logoUrl: '',
        shortName: teamName.substring(0, 3).toUpperCase()
    } as Team;
  };
  
  const formatDate = (dateStr: string) => { try { return new Date(dateStr).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' }); } catch(e) { return dateStr; } };
  const formatTime = (dateStr: string) => { try { return new Date(dateStr).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }); } catch(e) { return ''; } };

  const getRoundName = (label: string) => {
    if (!label) return 'อื่นๆ';
    const groupMatch = label.match(/Group\s+[A-Z0-9]+/i);
    if (groupMatch) return groupMatch[0];
    if (label.includes(':')) return label.split(':')[0].trim();
    return label;
  };

  const uniqueRounds = Array.from(new Set(scheduledMatches.map(m => getRoundName(m.roundLabel || '')))).sort();

  const filteredScheduled = scheduledMatches.filter(m => {
    const tA = resolveTeam(m.teamA).name.toLowerCase();
    const tB = resolveTeam(m.teamB).name.toLowerCase();
    const search = searchTerm.toLowerCase();
    const matchesSearch = !search || tA.includes(search) || tB.includes(search) || (m.venue || '').toLowerCase().includes(search);
    const mDate = new Date(m.scheduledTime || m.date).toISOString().split('T')[0];
    const matchesDate = !filterDate || mDate === filterDate;
    const mRound = getRoundName(m.roundLabel || '');
    const matchesRound = filterGroup === 'All' || mRound === filterGroup;
    return matchesSearch && matchesDate && matchesRound;
  });

  const groupedScheduled = filteredScheduled.reduce((acc, m) => {
    const d = new Date(m.scheduledTime || m.date).toISOString().split('T')[0];
    if (!acc[d]) acc[d] = [];
    acc[d].push(m);
    return acc;
  }, {} as Record<string, Match[]>);

  const sortedDates = Object.keys(groupedScheduled).sort();

  const handleOpenAdd = () => { 
      const today = new Date().toISOString().split('T')[0];
      setMatchForm({ id: '', teamA: '', teamB: '', date: today, time: '09:00', venue: '', roundLabel: 'Group A', livestreamUrl: '' });
      setMatchCover({file: null, preview: null});
      setBulkMatches([{ tempId: Date.now().toString(), teamA: '', teamB: '', time: '09:00', venue: '' }]);
      setActiveMatchType('group');
      setIsAddModalOpen(true); 
  };
  
  const handleEditMatch = (e: React.MouseEvent, match: Match) => { 
      e.stopPropagation(); 
      const dateObj = new Date(match.scheduledTime || match.date); 
      const label = match.roundLabel || '';
      let type: 'group' | 'knockout' | 'custom' = 'custom';
      let uiLabel = label;
      if (label.match(/^Group\s+[A-H]/i) || label.includes('กลุ่ม')) {
          type = 'group';
          if (label.includes(':')) uiLabel = label.split(':')[0].trim();
      }
      else if (label.match(/round|final|qf|sf|ชิง|place/i)) type = 'knockout';

      setMatchForm({ 
          id: match.id, 
          teamA: typeof match.teamA === 'string' ? match.teamA : match.teamA.name, 
          teamB: typeof match.teamB === 'string' ? match.teamB : match.teamB.name, 
          date: dateObj.toISOString().split('T')[0], 
          time: dateObj.toTimeString().slice(0, 5), 
          venue: match.venue || '', 
          roundLabel: uiLabel,
          livestreamUrl: match.livestreamUrl || ''
      }); 
      setMatchCover({ file: null, preview: match.livestreamCover || null });
      setActiveMatchType(type);
      setIsAddModalOpen(true); 
  };

  const handleOpenEditResult = (e: React.MouseEvent, match: Match) => {
      e.stopPropagation();
      setEditResultForm({
          matchId: match.id,
          teamA: typeof match.teamA === 'string' ? match.teamA : match.teamA.name,
          teamB: typeof match.teamB === 'string' ? match.teamB : match.teamB.name,
          scoreA: match.scoreA.toString(),
          scoreB: match.scoreB.toString()
      });
      setIsEditResultOpen(true);
  };

  const handleSaveEditedResult = async () => {
      setIsSaving(true);
      try {
          const sA = parseInt(editResultForm.scoreA);
          const sB = parseInt(editResultForm.scoreB);
          if (isNaN(sA) || isNaN(sB)) throw new Error("Invalid score");
          let winnerName = null;
          if (sA > sB) winnerName = editResultForm.teamA;
          else if (sB > sA) winnerName = editResultForm.teamB;
          const payload: any = {
            matchId: editResultForm.matchId,
            teamA: resolveTeam(editResultForm.teamA),
            teamB: resolveTeam(editResultForm.teamB),
            scoreA: sA, scoreB: sB,
            winner: winnerName ? (winnerName === editResultForm.teamA ? 'A' : 'B') : null,
            kicks: [], isFinished: true
        };
        await saveMatchToSheet(payload, "Result Edited (Admin)");
        if(showNotification) showNotification("สำเร็จ", "แก้ไขผลการแข่งขันเรียบร้อย", "success");
        setIsEditResultOpen(false);
        if(onRefresh) onRefresh();
      } catch (e) {
          if(showNotification) showNotification("ผิดพลาด", "บันทึกไม่สำเร็จ", "error");
      } finally { setIsSaving(false); }
  };

  const handleDeleteMatch = async () => { 
      if(!matchToDelete) return; 
      setIsDeleting(true); 
      try { 
          await deleteMatch(matchToDelete); 
          if(showNotification) showNotification("สำเร็จ", "ลบตารางแข่งเรียบร้อย", "success"); 
          setMatchToDelete(null); 
          if(onRefresh) onRefresh(); 
      } catch(e) { if(showNotification) showNotification("ผิดพลาด", "ลบไม่สำเร็จ", "error"); } finally { setIsDeleting(false); } 
  };
  
  const handleResetMatch = async () => {
      if(!matchToReset) return;
      setIsDeleting(true); 
      try {
          const match = matches.find(m => m.id === matchToReset);
          if (!match) throw new Error("Match not found");
          await deleteMatch(match.id);
          const newMatchId = `M_${Date.now()}_RESET`;
          await scheduleMatch(
              newMatchId, 
              typeof match.teamA === 'string' ? match.teamA : match.teamA.name,
              typeof match.teamB === 'string' ? match.teamB : match.teamB.name,
              match.roundLabel || '', match.venue, match.scheduledTime, match.livestreamUrl, match.livestreamCover,
              match.tournamentId || currentTournamentId || 'default'
          );
          if(showNotification) showNotification("สำเร็จ", "รีเซ็ตสถานะเป็น 'รอแข่ง' เรียบร้อย", "success");
          setMatchToReset(null); setSelectedMatch(null);
          if(onRefresh) setTimeout(() => onRefresh(), 1500);
      } catch (e) {
          if(showNotification) showNotification("ผิดพลาด", "รีเซ็ตไม่สำเร็จ", "error");
      } finally { setIsDeleting(false); }
  };

  const handleSaveMatch = async () => { 
      setIsSaving(true); 
      try { 
          let coverBase64 = matchCover.preview;
          if (matchCover.file) coverBase64 = await fileToBase64(matchCover.file);
          const tournamentIdToSave = currentTournamentId || 'default';

          if (matchForm.id) {
               let finalLabel = matchForm.roundLabel;
               if (activeMatchType === 'group') {
                   const teamAObj = teams.find(t => t.name === matchForm.teamA);
                   const teamBObj = teams.find(t => t.name === matchForm.teamB);
                   const groupName = matchForm.roundLabel.replace('Group ', '').trim();
                   finalLabel = `Group ${groupName}: ${teamAObj?.shortName || matchForm.teamA} vs ${teamBObj?.shortName || matchForm.teamB}`;
               }
               await scheduleMatch(matchForm.id, matchForm.teamA, matchForm.teamB, finalLabel, matchForm.venue, new Date(`${matchForm.date}T${matchForm.time}`).toISOString(), matchForm.livestreamUrl, coverBase64 || undefined, tournamentIdToSave);
          } else {
              if (activeMatchType === 'group') {
                  for (const m of bulkMatches) {
                       if (!m.teamA || !m.teamB || !m.time) continue;
                       const newId = `M_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
                       const teamAObj = teams.find(t => t.name === m.teamA);
                       const teamBObj = teams.find(t => t.name === m.teamB);
                       const groupName = matchForm.roundLabel.replace('Group ', '').trim();
                       const uniqueLabel = `Group ${groupName}: ${teamAObj?.shortName || m.teamA} vs ${teamBObj?.shortName || m.teamB}`;
                       await scheduleMatch(newId, m.teamA, m.teamB, uniqueLabel, m.venue, new Date(`${matchForm.date}T${m.time}`).toISOString(), undefined, undefined, tournamentIdToSave);
                       await new Promise(r => setTimeout(r, 100));
                  }
              } else {
                  const newId = `M_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
                  await scheduleMatch(newId, matchForm.teamA, matchForm.teamB, matchForm.roundLabel, matchForm.venue, new Date(`${matchForm.date}T${matchForm.time}`).toISOString(), matchForm.livestreamUrl, coverBase64 || undefined, tournamentIdToSave);
              }
          }
          if (showNotification) showNotification("สำเร็จ", "บันทึกข้อมูลเรียบร้อย", "success"); 
          setIsAddModalOpen(false); 
          if(onRefresh) onRefresh(); 
      } catch(e) { if (showNotification) showNotification("ผิดพลาด", "กรุณากรอกข้อมูลให้ครบถ้วน", "error"); } finally { setIsSaving(false); } 
  };

  const handleCoverChange = (file: File) => {
      if (file.size > 2 * 1024 * 1024) { if(showNotification) showNotification("ไฟล์ใหญ่เกินไป", "ขนาดรูปปกต้องไม่เกิน 2MB", "warning"); return; }
      const preview = URL.createObjectURL(file);
      setMatchCover({ file, preview });
  };

  const handleQuickSaveResult = async () => {
    if (!selectedMatch) return;
    setIsQuickSaving(true);
    try {
        const sA = parseInt(quickScoreA); const sB = parseInt(quickScoreB);
        const tA = resolveTeam(selectedMatch.teamA); const tB = resolveTeam(selectedMatch.teamB);
        const payload: any = {
            matchId: selectedMatch.id, teamA: tA, teamB: tB, scoreA: sA, scoreB: sB,
            winner: sA > sB ? 'A' : sB > sA ? 'B' : null, kicks: [], isFinished: true,
            livestreamUrl: selectedMatch.livestreamUrl, livestreamCover: selectedMatch.livestreamCover
        };
        await saveMatchToSheet(payload, "Quick Result (Admin)");
        if (showNotification) showNotification("สำเร็จ", "บันทึกผลการแข่งขันเรียบร้อย", "success");
        if (onRefresh) onRefresh();
        setSelectedMatch(null);
    } catch (e) { if (showNotification) showNotification("ผิดพลาด", "บันทึกผลไม่สำเร็จ", "error"); } finally { setIsQuickSaving(false); }
  };

  const handleWalkover = async (winnerSide: 'A' | 'B') => {
      if (!selectedMatch) return;
      setIsQuickSaving(true);
      try {
          const tA = resolveTeam(selectedMatch.teamA); const tB = resolveTeam(selectedMatch.teamB);
          const payload: any = {
              matchId: selectedMatch.id, teamA: tA, teamB: tB, scoreA: winnerSide === 'A' ? 3 : 0, scoreB: winnerSide === 'B' ? 3 : 0,
              winner: winnerSide, kicks: [], isFinished: true, status: 'Walkover',
              livestreamUrl: selectedMatch.livestreamUrl, livestreamCover: selectedMatch.livestreamCover
          };
          await saveMatchToSheet(payload, "Walkover (Forfeit)");
          if (showNotification) showNotification("สำเร็จ", "บันทึกชนะบายเรียบร้อย", "success");
          if (onRefresh) onRefresh();
          setSelectedMatch(null);
      } catch (e) { if (showNotification) showNotification("ผิดพลาด", "บันทึกไม่สำเร็จ", "error"); } finally { setIsQuickSaving(false); }
  };

  // Generate Match Summary Logic (AI or Local Template)
  const handleGenerateSummary = async (forceLocal: boolean = false) => {
      if (!selectedMatch) return;
      setIsGeneratingSummary(true);
      try {
          const tA = resolveTeam(selectedMatch.teamA);
          const tB = resolveTeam(selectedMatch.teamB);
          
          if (forceLocal) {
              // Local Template Mode with full team objects
              const localSummary = generateLocalSummary(
                  tA, tB, selectedMatch.scoreA, selectedMatch.scoreB,
                  selectedMatch.winner || '', selectedMatch.kicks || []
              );
              setAiSummary(localSummary);
              setIsEditingSummary(true);
              if (showNotification) showNotification("Template Generated", "สร้างข่าวจากแม่แบบสำเร็จ", "success");
          } else {
              // AI Mode
              const summary = await generateMatchSummary(
                  tA.name, tB.name, selectedMatch.scoreA, selectedMatch.scoreB, 
                  selectedMatch.winner || '', selectedMatch.kicks || [],
                  selectedAiModel
              );
              setAiSummary(summary);
              setIsEditingSummary(true); 
          }
      } catch (error) {
          console.error("AI Gen Error", error);
          if (showNotification) showNotification("AI Error", "ระบบ AI มีปัญหา กำลังใช้ระบบแม่แบบแทน...", "warning");
          // Fallback to local template automatically on error
          handleGenerateSummary(true);
      } finally {
          setIsGeneratingSummary(false);
      }
  };

  const handleSaveSummary = async () => {
      if (!selectedMatch || !aiSummary) return;
      setIsSavingSummary(true);
      try {
          // Pass true as last arg to skip saving kicks again, focusing on summary update
          const matchPayload = { ...selectedMatch, summary: aiSummary };
          // IMPORTANT: Pass the variable aiSummary, NOT the string description
          await saveMatchToSheet(matchPayload, aiSummary, true);
          
          if (showNotification) showNotification("สำเร็จ", "บันทึกข่าวสรุปเรียบร้อย", "success");
          setIsEditingSummary(false);
          // Optional: Refresh data to sync
          if(onRefresh) onRefresh();
      } catch (e) {
          if (showNotification) showNotification("ผิดพลาด", "บันทึกข่าวไม่สำเร็จ", "error");
      } finally {
          setIsSavingSummary(false);
      }
  };
  
  const handleShare = (e: React.MouseEvent, match: Match) => { e.stopPropagation(); const tA = resolveTeam(match.teamA); const tB = resolveTeam(match.teamB); shareMatch(match, tA.name, tB.name, tA.logoUrl, tB.logoUrl); };
  const handleStart = (e: React.MouseEvent, match: Match) => { e.stopPropagation(); const tA = resolveTeam(match.teamA); const tB = resolveTeam(match.teamB); onStartMatch(tA, tB, match.id); };
  const setGroupRound = (group: string) => { const newLabel = `Group ${group}`; setMatchForm(prev => ({ ...prev, roundLabel: newLabel })); setBulkMatches(prev => prev.map(m => ({ ...m, teamA: '', teamB: '' }))); };
  const calculateAge = (birthDateString?: string) => { if (!birthDateString) return '-'; const parts = birthDateString.split('/'); let birthDate: Date; if (parts.length === 3) birthDate = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0])); else birthDate = new Date(birthDateString); if (isNaN(birthDate.getTime())) return '-'; const today = new Date(); let age = today.getFullYear() - birthDate.getFullYear(); if (today.getMonth() < birthDate.getMonth() || (today.getMonth() === birthDate.getMonth() && today.getDate() < birthDate.getDate())) age--; return age; };
  const getEmbedUrl = (url: string) => { if (!url) return null; if (url.includes('youtube.com') || url.includes('youtu.be')) { let videoId = ''; if (url.includes('v=')) videoId = url.split('v=')[1].split('&')[0]; else if (url.includes('youtu.be/')) videoId = url.split('youtu.be/')[1].split('?')[0]; if (videoId) return `https://www.youtube.com/embed/${videoId}?autoplay=1`; } if (url.includes('facebook.com')) { const encodedUrl = encodeURIComponent(url); return `https://www.facebook.com/plugins/video.php?href=${encodedUrl}&show_text=false&t=0&autoplay=1`; } return null; };
  const renderRoster = (teamName: string) => { const team = teams.find(t => t.name === teamName); if (!team) return <div className="text-center text-slate-400 py-4">ไม่พบข้อมูลทีม</div>; const roster = players.filter(p => p.teamId === team.id); return ( <div className="space-y-3"> <div className="flex items-center gap-2 mb-3 bg-slate-50 p-2 rounded-lg border border-slate-100"> {team.logoUrl && <img src={team.logoUrl} className="w-8 h-8 object-contain" />} <div><div className="font-bold text-slate-800 text-sm">{team.name}</div><div className="text-xs text-slate-500">{team.managerName ? `ผจก: ${team.managerName}` : ''}</div></div> </div> {roster.length > 0 ? ( <div className="grid grid-cols-1 gap-2"> {roster.map(p => ( <div key={p.id} className="flex items-center gap-3 p-2 bg-white border border-slate-100 rounded-lg shadow-sm hover:shadow-md transition"> <div className="w-16 h-20 bg-slate-200 rounded-md overflow-hidden shrink-0 border border-slate-200"> {p.photoUrl ? <img src={p.photoUrl} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-slate-400"><User className="w-6 h-6" /></div>} </div> <div className="flex-1 min-w-0"> <div className="flex items-center gap-2 mb-1"><span className="text-xl font-black text-indigo-700 font-mono italic">#{p.number}</span><span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">{p.position || 'Player'}</span></div> <div className="font-bold text-slate-800 text-sm truncate leading-tight mb-1">{p.name}</div> <div className="flex items-center gap-2 text-[10px] text-slate-500"><span>เกิด: {p.birthDate || '-'}</span><span className="bg-indigo-50 text-indigo-600 px-1 rounded font-bold">อายุ {calculateAge(p.birthDate)}</span></div> </div> </div> ))} </div> ) : <div className="text-center text-slate-400 text-xs py-4 bg-slate-50 rounded-lg border border-dashed border-slate-200">ไม่มีรายชื่อนักกีฬา</div>} </div> ); };
  const getFilteredTeams = (excludeName?: string) => { const currentGroup = activeMatchType === 'group' && matchForm.roundLabel.startsWith('Group ') ? matchForm.roundLabel.replace('Group ', '').trim() : null; return teams.filter(t => { if (excludeName && t.name === excludeName) return false; if (currentGroup && t.group?.toUpperCase() !== currentGroup.toUpperCase()) return false; return true; }); };
  const openTeamSelector = (mode: 'singleA' | 'singleB' | 'bulkA' | 'bulkB', rowIndex?: number, currentVal?: string) => setSelectorConfig({ isOpen: true, mode, rowIndex, currentValue: currentVal });
  const handleTeamSelect = (team: Team) => { const { mode, rowIndex } = selectorConfig; if (mode === 'singleA') setMatchForm(prev => ({ ...prev, teamA: team.name })); else if (mode === 'singleB') setMatchForm(prev => ({ ...prev, teamB: team.name })); else if (mode === 'bulkA' && typeof rowIndex === 'number') updateBulkRow(rowIndex, 'teamA', team.name); else if (mode === 'bulkB' && typeof rowIndex === 'number') updateBulkRow(rowIndex, 'teamB', team.name); };
  const addBulkRow = () => { const last = bulkMatches[bulkMatches.length - 1]; setBulkMatches([...bulkMatches, { tempId: Date.now().toString(), teamA: '', teamB: '', time: last ? last.time : '09:00', venue: last ? last.venue : '' }]); };
  const removeBulkRow = (idx: number) => { if (bulkMatches.length > 1) setBulkMatches(bulkMatches.filter((_, i) => i !== idx)); };
  const updateBulkRow = (idx: number, field: keyof typeof bulkMatches[0], value: string) => { const newRows = [...bulkMatches]; newRows[idx] = { ...newRows[idx], [field]: value }; setBulkMatches(newRows); };
  const TeamSelectionButton = ({ value, placeholder, onClick, disabled }: { value: string, placeholder: string, onClick: () => void, disabled?: boolean }) => { const team = teams.find(t => t.name === value); return ( <button type="button" onClick={onClick} disabled={disabled} className={`w-full p-2.5 border rounded-lg flex items-center justify-center text-left transition ${disabled ? 'bg-slate-50 opacity-50 cursor-not-allowed' : 'bg-white hover:border-indigo-400 hover:ring-2 hover:ring-indigo-100'}`}> <div className="flex items-center gap-2 overflow-hidden">{team ? (<>{team.logoUrl ? <img src={team.logoUrl} className="w-6 h-6 rounded-md object-contain border border-slate-100 p-0.5" /> : <div className="w-6 h-6 rounded-md bg-slate-200 flex items-center justify-center font-bold text-[10px] text-slate-500">{team.name.substring(0,1)}</div>}<span className="font-bold text-slate-700 truncate text-sm">{team.name}</span></>) : (<span className="text-slate-400 text-sm flex items-center gap-1"><Users className="w-4 h-4"/> {placeholder}</span>)}</div><ChevronDown className="w-4 h-4 text-slate-300" /> </button> ); };
  const renderScorers = (match: Match, teamName: string, side: 'A' | 'B') => { const scorers = (match.kicks || []).filter(k => (k.teamId === teamName || k.teamId === 'A' || k.teamId === 'B') && k.result === KickResult.GOAL).filter(k => { if (k.teamId === 'A' && side === 'A') return true; if (k.teamId === 'B' && side === 'B') return true; if (k.teamId === teamName) return true; return false; }); if (scorers.length === 0) return <div className="text-xs text-indigo-300 italic text-center py-2 opacity-50">-</div>; return (<div className={`flex flex-wrap gap-2 ${side === 'A' ? 'justify-end' : 'justify-start'}`}>{scorers.map((k, i) => (<div key={i} className="text-xs font-bold text-indigo-900 bg-white/90 shadow-sm border border-white px-2.5 py-1 rounded-lg flex items-center gap-1.5 whitespace-nowrap"><span>⚽ {String(k.player || '').split('(')[0].replace(/[#0-9]/g, '').trim()}</span><span className="text-indigo-400 font-mono text-[10px] border-l border-indigo-100 pl-1.5 ml-1">({k.round}')</span></div>))}</div>); };
  const calculateTeamStats = (teamName: string) => { const teamFinishedMatches = matches.filter(m => m.winner && ( (typeof m.teamA === 'string' ? m.teamA : m.teamA.name) === teamName || (typeof m.teamB === 'string' ? m.teamB : m.teamB.name) === teamName )); const totalPlayed = teamFinishedMatches.length; let wins = 0; let goals = 0; let form: ('W'|'L')[] = []; teamFinishedMatches.sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime()).forEach(m => { const isA = (typeof m.teamA === 'string' ? m.teamA : m.teamA.name) === teamName; const isWinner = m.winner === (isA ? 'A' : 'B') || m.winner === teamName; if (isWinner) wins++; goals += isA ? m.scoreA : m.scoreB; form.push(isWinner ? 'W' : 'L'); }); return { played: totalPlayed, wins, goals, winRate: totalPlayed > 0 ? Math.round((wins / totalPlayed) * 100) : 0, form: form.slice(-5) }; };
  const renderStatsComparison = (tA: Team, tB: Team) => { const statsA = calculateTeamStats(tA.name); const statsB = calculateTeamStats(tB.name); const StatBar = ({ label, valA, valB, suffix = '' }: { label: string, valA: number, valB: number, suffix?: string }) => { const total = valA + valB; const percentA = total === 0 ? 50 : (valA / total) * 100; return ( <div className="mb-4"> <div className="flex justify-between text-xs font-bold mb-1"> <span className="text-slate-600">{valA}{suffix}</span> <span className="text-slate-400">{label}</span> <span className="text-slate-600">{valB}{suffix}</span> </div> <div className="flex h-2 bg-slate-100 rounded-full overflow-hidden"> <div className="bg-blue-500 h-full" style={{ width: `${percentA}%` }}></div> <div className="bg-red-500 h-full" style={{ width: `${100 - percentA}%` }}></div> </div> </div> ); }; return ( <div className="p-4 space-y-6"> <div className="grid grid-cols-2 gap-8 text-center"> <div> <h4 className="font-bold text-slate-800 truncate">{tA.name}</h4> <div className="flex justify-center gap-1 mt-1"> {statsA.form.map((r, i) => ( <span key={i} className={`w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold text-white ${r === 'W' ? 'bg-green-500' : 'bg-red-500'}`}>{r}</span> ))} </div> </div> <div> <h4 className="font-bold text-slate-800 truncate">{tB.name}</h4> <div className="flex justify-center gap-1 mt-1"> {statsB.form.map((r, i) => ( <span key={i} className={`w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold text-white ${r === 'W' ? 'bg-green-500' : 'bg-red-500'}`}>{r}</span> ))} </div> </div> </div> <div className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm"> <StatBar label="Matches Played" valA={statsA.played} valB={statsB.played} /> <StatBar label="Win Rate" valA={statsA.winRate} valB={statsB.winRate} suffix="%" /> <StatBar label="Total Goals" valA={statsA.goals} valB={statsB.goals} /> </div> </div> ); };

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 pb-24">
      <TeamSelectorModal isOpen={selectorConfig.isOpen} onClose={() => setSelectorConfig(prev => ({ ...prev, isOpen: false }))} onSelect={handleTeamSelect} teams={getFilteredTeams(selectorConfig.mode === 'singleA' ? matchForm.teamB : selectorConfig.mode === 'singleB' ? matchForm.teamA : selectorConfig.mode === 'bulkA' && typeof selectorConfig.rowIndex === 'number' ? bulkMatches[selectorConfig.rowIndex].teamB : selectorConfig.mode === 'bulkB' && typeof selectorConfig.rowIndex === 'number' ? bulkMatches[selectorConfig.rowIndex].teamA : undefined)} title={selectorConfig.mode.includes('A') ? "เลือกทีมเหย้า" : "เลือกทีมเยือน"} />

      <div className="max-w-4xl mx-auto">
        {/* ... (Header and search UI) ... */}
        <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4"><button onClick={onBack} className="p-2 bg-white rounded-full shadow-sm hover:bg-slate-100 transition text-slate-600"><ArrowLeft className="w-5 h-5" /></button><h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><Calendar className="w-6 h-6 text-blue-600" /> ตารางการแข่งขัน</h1></div>
            {isAdmin && <button onClick={handleOpenAdd} className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg shadow hover:bg-indigo-700 transition font-bold text-sm"><Plus className="w-4 h-4" /> เพิ่มคู่แข่ง</button>}
        </div>

        <div className="mb-8">
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 mb-6 sticky top-0 z-20">
                <div className="flex flex-col md:flex-row gap-4">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                        <input type="text" placeholder="ค้นหาทีม / สนามแข่ง..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2 border rounded-lg bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none transition text-sm" />
                    </div>
                    <div className="flex gap-2">
                        <div className="relative"><input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} className="w-full md:w-auto p-2 border rounded-lg bg-slate-50 text-sm focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none" /></div>
                        <div className="relative flex-1 md:flex-none md:min-w-[140px]"><select value={filterGroup} onChange={e => setFilterGroup(e.target.value)} className="w-full p-2 pr-8 border rounded-lg bg-slate-50 text-sm appearance-none focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none"><option value="All">ทุกรอบ</option>{uniqueRounds.map(r => <option key={r} value={r}>{r}</option>)}</select><ChevronDown className="absolute right-3 top-3 w-4 h-4 text-slate-400 pointer-events-none" /></div>
                    </div>
                </div>
            </div>
             {isLoading ? (
                <div className="space-y-3">
                   {Array(3).fill(0).map((_, i) => <div key={i} className="bg-white rounded-xl shadow-sm p-4 h-24 animate-pulse"></div>)}
                </div>
            ) : sortedDates.length === 0 ? (
                <div className="bg-white p-10 rounded-xl shadow-sm text-center text-slate-400 border border-slate-200 border-dashed">
                    <Filter className="w-12 h-12 mx-auto mb-3 text-slate-300"/>
                    <p>ไม่พบรายการแข่งขันตามเงื่อนไข</p>
                    <button onClick={() => {setSearchTerm(''); setFilterDate(''); setFilterGroup('All');}} className="mt-3 text-indigo-600 text-sm font-bold hover:underline">
                        ล้างตัวกรองทั้งหมด
                    </button>
                </div>
            ) : (
                <div className="space-y-8">
                    {sortedDates.map(dateKey => (
                        <div key={dateKey}>
                             <div className="flex items-center gap-2 mb-3 bg-indigo-50 px-3 py-1.5 rounded-lg w-fit border border-indigo-100 shadow-sm sticky top-20 z-10 backdrop-blur-sm">
                                <Calendar className="w-4 h-4 text-indigo-600" />
                                <span className="font-bold text-indigo-900 text-sm">
                                    {new Date(dateKey).toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                                </span>
                                <span className="text-xs text-indigo-400 bg-white px-1.5 rounded-full ml-1 font-bold">{groupedScheduled[dateKey].length} คู่</span>
                            </div>
                            <div className="space-y-3">
                                {groupedScheduled[dateKey].map(match => {
                                    const tA = resolveTeam(match.teamA); 
                                    const tB = resolveTeam(match.teamB);
                                    return (
                                        <div key={match.id} onClick={() => setSelectedMatch(match)} className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex flex-col items-center gap-4 hover:shadow-md transition relative cursor-pointer">
                                             <div className="flex flex-col md:flex-row items-center w-full gap-2 md:gap-4">
                                                <div className="flex md:flex-col items-center md:items-start justify-center min-w-[100px] text-slate-500 text-sm gap-2 md:gap-0 w-full md:w-auto bg-slate-50 md:bg-transparent p-2 md:p-0 rounded-lg shrink-0">
                                                    {match.scheduledTime ? (
                                                        <span className="flex items-center gap-1 text-indigo-600 font-bold text-lg md:text-xl font-mono"><Clock className="w-4 h-4 md:w-5 md:h-5" /> {formatTime(match.scheduledTime)}</span>
                                                    ) : (
                                                        <span className="text-xs text-slate-400">ไม่ระบุเวลา</span>
                                                    )}
                                                </div>
                                                <div className="flex-1 flex flex-col md:flex-row items-center justify-center gap-2 md:gap-4 w-full py-2 md:py-0">
                                                    <div className="flex items-center justify-center md:justify-end gap-3 flex-1 w-full"><span className="font-bold text-slate-800 text-base md:text-lg truncate text-center md:text-right w-full">{tA.name}</span>{tA.logoUrl ? <img src={tA.logoUrl} className="w-8 h-8 md:w-10 md:h-10 object-contain rounded bg-slate-50 shrink-0"/> : <div className="w-8 h-8 md:w-10 md:h-10 shrink-0 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 text-xs font-bold">A</div>}</div>
                                                    <div className="px-3 py-1 bg-slate-100 rounded text-xs text-slate-500 font-bold whitespace-nowrap shrink-0">VS</div>
                                                    <div className="flex items-center justify-center md:justify-start gap-3 flex-1 w-full">{tB.logoUrl ? <img src={tB.logoUrl} className="w-8 h-8 md:w-10 md:h-10 object-contain rounded bg-slate-50 shrink-0"/> : <div className="w-8 h-8 md:w-10 md:h-10 shrink-0 bg-red-100 rounded-full flex items-center justify-center text-red-600 text-xs font-bold">B</div>}<span className="font-bold text-slate-800 text-base md:text-lg truncate text-center md:text-left w-full">{tB.name}</span></div>
                                                </div>
                                                <div className="w-full md:w-auto min-w-[140px] flex flex-row md:flex-col items-center justify-between md:justify-end md:items-end text-sm gap-1 border-t md:border-t-0 pt-2 md:pt-0 mt-1 md:mt-0">
                                                    <span className="px-2 py-1 bg-blue-50 text-blue-600 rounded text-xs font-bold">{match.roundLabel?.split(':')[0] || 'รอบทั่วไป'}</span>
                                                    {match.livestreamUrl && <span className="px-2 py-1 bg-red-600 text-white rounded text-xs font-bold flex items-center gap-1 animate-pulse"><Video className="w-3 h-3" /> LIVE</span>}
                                                    {match.venue && <span className="flex items-center gap-1 text-slate-500 text-xs"><MapPin className="w-3 h-3" /> {match.venue}</span>}
                                                </div>
                                            </div>
                                            <div className="w-full pt-3 mt-1 border-t border-slate-100 flex justify-end gap-2 flex-wrap">
                                                <button onClick={(e) => handleStart(e, match)} className="flex-1 md:flex-none flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold border border-indigo-100"><PlayCircle className="w-3 h-3" /> บันทึกผล</button>
                                                <button onClick={(e) => handleShare(e, match)} className="flex-1 md:flex-none flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg bg-[#00B900] hover:bg-[#009900] text-white text-xs font-bold"><Share2 className="w-3 h-3" /> แชร์ LINE</button>
                                                {isAdmin && <><button onClick={(e) => handleEditMatch(e, match)} className="flex-none flex items-center gap-1 px-3 py-1.5 rounded-lg bg-orange-100 text-orange-600 hover:bg-orange-200 text-xs font-bold"><Edit2 className="w-3 h-3" /></button><button onClick={(e) => { e.stopPropagation(); setMatchToDelete(match.id); }} className="flex-none flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-100 text-red-600 hover:bg-red-200 text-xs font-bold"><Trash2 className="w-3 h-3" /></button></>}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>

        {/* Finished Matches List */}
        <div>
            <h2 className="text-lg font-bold text-slate-700 mb-4 px-2 border-l-4 border-green-500">ผลการแข่งขัน</h2>
            <div className="space-y-3">
                 {isLoading ? Array(3).fill(0).map((_, i) => <div key={i} className="bg-slate-50 rounded-xl border border-slate-200 p-4 h-16 animate-pulse"></div>) : finishedMatches.length === 0 ? <div className="bg-white p-6 rounded-xl shadow-sm text-center text-slate-400 border border-slate-200">ยังไม่มีผลการแข่งขัน</div> : finishedMatches.map(match => { const tA = resolveTeam(match.teamA); const tB = resolveTeam(match.teamB); 
                return (
                    <div key={match.id} onClick={() => setSelectedMatch(match)} className="bg-slate-50 rounded-xl border border-slate-200 p-3 md:p-4 flex flex-col items-center gap-3 opacity-80 hover:opacity-100 transition cursor-pointer">
                        <div className="flex flex-col md:flex-row items-center w-full gap-2 md:gap-4">
                            <div className="flex justify-between w-full md:w-auto md:flex-col md:items-start min-w-[120px] text-slate-400 text-[10px] md:text-xs border-b md:border-b-0 pb-2 md:pb-0 mb-1 md:mb-0"><span>{formatDate(match.date)}</span><span>{match.roundLabel?.split(':')[0]}</span></div>
                            <div className="flex-1 w-full grid grid-cols-[1fr_auto_1fr] md:flex md:items-center md:justify-center gap-2 md:gap-4 items-center">
                                <div className={`flex items-center justify-end gap-2 md:gap-3 w-full overflow-hidden ${match.winner === 'A' || match.winner === tA.name ? 'text-green-600' : 'text-slate-600'}`}><span className="font-bold text-sm md:text-lg truncate text-right w-full">{tA.name}</span>{tA.logoUrl && <img src={tA.logoUrl} className="w-6 h-6 md:w-6 md:h-6 object-contain rounded opacity-80 shrink-0"/>}</div>
                                <div className="bg-slate-800 text-white px-3 py-1 md:px-4 rounded-lg font-mono font-bold text-base md:text-lg shadow-inner whitespace-nowrap shrink-0 text-center min-w-[60px]">{match.scoreA} - {match.scoreB}</div>
                                <div className={`flex items-center justify-start gap-2 md:gap-3 w-full overflow-hidden ${match.winner === 'B' || match.winner === tB.name ? 'text-green-600' : 'text-slate-600'}`}>{tB.logoUrl && <img src={tB.logoUrl} className="w-6 h-6 md:w-6 md:h-6 object-contain rounded opacity-80 shrink-0"/>}<span className="font-bold text-sm md:text-lg truncate text-left w-full">{tB.name}</span></div>
                            </div>
                            <div className="hidden md:flex min-w-[100px] justify-end"><Trophy className="w-5 h-5 text-yellow-500" /></div>
                        </div>
                        <div className="w-full pt-2 mt-1 border-t border-slate-200 flex justify-end gap-2 flex-wrap">
                            <button onClick={(e) => handleShare(e, match)} className="flex-1 md:flex-none flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg bg-[#00B900] hover:bg-[#009900] text-white text-xs font-bold"><Share2 className="w-3 h-3" /> แชร์ผล</button>
                            {isAdmin && (<><button onClick={(e) => handleOpenEditResult(e, match)} className="flex-1 md:flex-none flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg bg-blue-100 text-blue-600 hover:bg-blue-200 text-xs font-bold"><Edit2 className="w-3 h-3" /> แก้ไขผล</button><button onClick={(e) => { e.stopPropagation(); setMatchToReset(match.id); }} className="flex-1 md:flex-none flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg bg-orange-100 text-orange-600 hover:bg-orange-200 text-xs font-bold"><RotateCcw className="w-3 h-3" /> รีเซ็ต</button></>)}
                        </div>
                    </div>
                ); 
                })}
            </div>
        </div>

        {selectedMatch && (
            <div className="fixed inset-0 z-[1000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setSelectedMatch(null)}>
                <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in duration-200 my-8 relative flex flex-col h-[90vh] md:h-auto md:max-h-[90vh]" onClick={e => e.stopPropagation()}>
                    
                    <button onClick={() => setSelectedMatch(null)} className="absolute top-2 right-2 md:top-4 md:right-4 bg-black/40 hover:bg-black/60 text-white p-2 rounded-full z-[60] transition"><X className="w-5 h-5" /></button>

                    <div className="overflow-y-auto flex-1 custom-scrollbar">
                        {/* Match Header Section */}
                        {selectedMatch.livestreamUrl && (
                            <div className="w-full aspect-video bg-black relative">
                                {getEmbedUrl(selectedMatch.livestreamUrl) ? <iframe src={getEmbedUrl(selectedMatch.livestreamUrl)!} className="w-full h-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen></iframe> : <div className="flex flex-col items-center justify-center h-full text-white"><p>ไม่สามารถโหลดวิดีโอได้</p><a href={selectedMatch.livestreamUrl} target="_blank" className="text-blue-400 underline mt-2 text-sm">เปิดในแอปภายนอก</a></div>}
                            </div>
                        )}
                        <div className="bg-indigo-900 p-0 text-white text-center relative overflow-hidden">
                             <div className="absolute top-0 left-0 w-32 h-32 bg-white opacity-5 rounded-full -translate-x-10 -translate-y-10 blur-2xl pointer-events-none"></div>
                             <div className="absolute bottom-0 right-0 w-40 h-40 bg-indigo-500 opacity-20 rounded-full translate-x-10 translate-y-10 blur-3xl pointer-events-none"></div>
                             
                             <div className="p-6 pb-4 relative z-10">
                                {!selectedMatch.livestreamUrl && config.competitionLogo && <img src={config.competitionLogo} className="w-10 h-10 md:w-16 md:h-16 mx-auto mb-2 object-contain bg-white rounded-full p-1 shadow-lg" />}
                                <h3 className="text-xs md:text-lg font-bold opacity-90 tracking-wide mb-3">{selectedMatch.roundLabel?.split(':')[0] || 'การแข่งขัน'}</h3>
                                
                                <div className="flex flex-row items-center justify-between w-full px-2 gap-4">
                                    <div className={`flex flex-col items-center flex-1 p-2 rounded-xl transition-all duration-300 relative ${selectedMatch.winner === 'A' || selectedMatch.winner === resolveTeam(selectedMatch.teamA).name ? 'bg-gradient-to-b from-green-600/30 to-green-900/40 border-2 border-green-400 shadow-[0_0_20px_rgba(34,197,94,0.4)] scale-105 z-10' : 'opacity-80'}`}>
                                        {resolveTeam(selectedMatch.teamA).logoUrl ? <img src={resolveTeam(selectedMatch.teamA).logoUrl} className="w-12 h-12 md:w-20 md:h-20 bg-white rounded-xl p-1 object-contain shadow-md" /> : <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center text-xl font-bold">A</div>}
                                        <span className="mt-2 font-bold text-xs md:text-xl leading-tight line-clamp-1 max-w-[80px] md:max-w-none">{resolveTeam(selectedMatch.teamA).name}</span>
                                        {selectedMatch.winner === 'A' && <div className="absolute -top-3 bg-yellow-400 text-yellow-900 text-[10px] md:text-xs font-black px-3 py-1 rounded-full shadow-lg flex items-center gap-1 border border-yellow-200"><Trophy className="w-3 h-3" /> WINNER</div>}
                                    </div>
                                    <div className="text-center shrink-0 flex flex-col items-center px-2">
                                        {selectedMatch.winner ? <div className="text-3xl md:text-6xl font-mono font-black text-white drop-shadow-[0_4px_4px_rgba(0,0,0,0.5)] whitespace-nowrap">{selectedMatch.scoreA} - {selectedMatch.scoreB}</div> : <div className="text-xl md:text-2xl font-bold text-indigo-200/50 my-1">VS</div>}
                                        <div className="mt-2 flex flex-col items-center gap-0.5 text-indigo-200 text-[10px] md:text-xs"><span className="flex items-center gap-1"><Calendar className="w-3 h-3"/> {formatDate(selectedMatch.scheduledTime || selectedMatch.date)}</span><span className="flex items-center gap-1"><Clock className="w-3 h-3"/> {formatTime(selectedMatch.scheduledTime || selectedMatch.date)} น.</span></div>
                                    </div>
                                    <div className={`flex flex-col items-center flex-1 p-2 rounded-xl transition-all duration-300 relative ${selectedMatch.winner === 'B' || selectedMatch.winner === resolveTeam(selectedMatch.teamB).name ? 'bg-gradient-to-b from-green-600/30 to-green-900/40 border-2 border-green-400 shadow-[0_0_20px_rgba(34,197,94,0.4)] scale-105 z-10' : 'opacity-80'}`}>
                                        {resolveTeam(selectedMatch.teamB).logoUrl ? <img src={resolveTeam(selectedMatch.teamB).logoUrl} className="w-12 h-12 md:w-20 md:h-20 bg-white rounded-xl p-1 object-contain shadow-md" /> : <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center text-xl font-bold">B</div>}
                                        <span className="mt-2 font-bold text-xs md:text-xl leading-tight line-clamp-1 max-w-[80px] md:max-w-none">{resolveTeam(selectedMatch.teamB).name}</span>
                                        {selectedMatch.winner === 'B' && <div className="absolute -top-3 bg-yellow-400 text-yellow-900 text-[10px] md:text-xs font-black px-3 py-1 rounded-full shadow-lg flex items-center gap-1 border border-yellow-200"><Trophy className="w-3 h-3" /> WINNER</div>}
                                    </div>
                                 </div>
                             </div>
                        </div>

                        <div className="sticky top-0 z-50 bg-indigo-900/95 backdrop-blur-sm border-t border-white/10 shadow-lg">
                             <div className="flex w-full">
                                 <button onClick={() => setDetailTab('overview')} className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition ${detailTab === 'overview' ? 'text-white border-b-4 border-white bg-white/10' : 'text-indigo-300 hover:text-white hover:bg-white/5'}`}>
                                     <ListPlus className="w-4 h-4" /> ภาพรวม
                                 </button>
                                 <button onClick={() => setDetailTab('stats')} className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition ${detailTab === 'stats' ? 'text-white border-b-4 border-white bg-white/10' : 'text-indigo-300 hover:text-white hover:bg-white/5'}`}>
                                     <BarChart2 className="w-4 h-4" /> วิเคราะห์
                                 </button>
                                 <button onClick={() => setDetailTab('share')} className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition ${detailTab === 'share' ? 'text-white border-b-4 border-white bg-white/10' : 'text-indigo-300 hover:text-white hover:bg-white/5'}`}>
                                     <ImageIcon className="w-4 h-4" /> แชร์การ์ด
                                 </button>
                             </div>
                        </div>

                        <div className="bg-slate-50 min-h-[400px]">
                            {/* TAB: OVERVIEW */}
                            {detailTab === 'overview' && (
                                <div className="p-4 md:p-6 space-y-6 animate-in fade-in duration-300">
                                    
                                    {/* News / Match Reporter Section */}
                                    {selectedMatch.winner && (
                                        <div className={`bg-white p-4 rounded-xl shadow-sm border ${aiSummary && aiSummary.startsWith('⚠️') ? 'border-orange-200 bg-orange-50' : 'border-slate-200'} relative overflow-hidden`}>
                                            <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-500 opacity-10 rounded-bl-full"></div>
                                            <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
                                                <h4 className={`font-bold text-sm flex items-center gap-2 ${aiSummary && aiSummary.startsWith('⚠️') ? 'text-orange-700' : 'text-indigo-800'}`}>
                                                    <Sparkles className={`w-4 h-4 ${aiSummary && aiSummary.startsWith('⚠️') ? 'text-orange-500' : 'text-purple-500'}`} /> 
                                                    {aiSummary && aiSummary.startsWith('⚠️') ? 'แจ้งเตือนระบบ' : 'ข่าวสรุปผลการแข่งขัน'}
                                                </h4>
                                                
                                                {/* Action Buttons: Only visible to Admin */}
                                                {isAdmin ? (
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        {!aiSummary || aiSummary.startsWith('⚠️') ? (
                                                            <>
                                                                <div className="flex items-center gap-1 bg-slate-100 rounded px-1">
                                                                    <Cpu className="w-3 h-3 text-slate-400"/>
                                                                    <select 
                                                                        value={selectedAiModel} 
                                                                        onChange={(e) => setSelectedAiModel(e.target.value)}
                                                                        className="text-xs p-1 bg-transparent text-slate-600 focus:outline-none max-w-[100px]"
                                                                    >
                                                                        {AI_MODELS.map(m => <option key={m.id} value={m.id}>{m.name.split('(')[0]}</option>)}
                                                                    </select>
                                                                </div>
                                                                <button 
                                                                    onClick={() => handleGenerateSummary(false)}
                                                                    disabled={isGeneratingSummary}
                                                                    className="text-xs bg-purple-100 text-purple-700 border border-purple-200 px-2 py-1 rounded font-bold flex items-center gap-1 hover:bg-purple-200"
                                                                >
                                                                    {isGeneratingSummary ? <Loader2 className="w-3 h-3 animate-spin"/> : <MessageSquare className="w-3 h-3"/>} AI
                                                                </button>
                                                                <button 
                                                                    onClick={() => handleGenerateSummary(true)}
                                                                    className="text-xs bg-blue-100 text-blue-700 border border-blue-200 px-2 py-1 rounded font-bold flex items-center gap-1 hover:bg-blue-200"
                                                                >
                                                                    <LayoutTemplate className="w-3 h-3"/> Template
                                                                </button>
                                                            </>
                                                        ) : (
                                                            <button 
                                                                onClick={() => setIsEditingSummary(!isEditingSummary)}
                                                                className="text-xs bg-indigo-50 text-indigo-600 border border-indigo-100 px-2 py-1 rounded font-bold flex items-center gap-1 hover:bg-indigo-100"
                                                            >
                                                                <Edit2 className="w-3 h-3" /> {isEditingSummary ? 'ยกเลิก' : 'แก้ไข'}
                                                            </button>
                                                        )}
                                                    </div>
                                                ) : null}
                                            </div>
                                            
                                            {/* Summary Content / Editor */}
                                            {isEditingSummary ? (
                                                <div className="space-y-3">
                                                    <textarea 
                                                        value={aiSummary || ''} 
                                                        onChange={(e) => setAiSummary(e.target.value)}
                                                        className="w-full p-3 border rounded-lg text-sm h-32 focus:ring-2 focus:ring-indigo-200 outline-none"
                                                        placeholder="พาดหัวข่าว...&#10;รายละเอียดการแข่งขัน...&#10;สรุปผล..."
                                                    />
                                                    <div className="flex justify-end gap-2">
                                                        <button 
                                                            onClick={handleSaveSummary}
                                                            disabled={isSavingSummary}
                                                            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-bold flex items-center gap-2 hover:bg-indigo-700 disabled:opacity-50"
                                                        >
                                                            {isSavingSummary ? <Loader2 className="w-4 h-4 animate-spin"/> : <Save className="w-4 h-4"/>} บันทึกข่าว
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                aiSummary ? (
                                                    <div className="space-y-3">
                                                        <div className={`text-sm leading-relaxed p-3 rounded-lg border whitespace-pre-line ${aiSummary.startsWith('⚠️') ? 'text-orange-800 bg-white border-orange-200' : 'text-slate-600 bg-slate-50 border-slate-100'}`}>
                                                            {aiSummary}
                                                        </div>
                                                    </div>
                                                ) : (
                                                    isAdmin ? (
                                                        <div className="text-center py-6 bg-slate-50 rounded-lg border border-dashed border-slate-200 flex flex-col items-center gap-3">
                                                            <p className="text-xs text-slate-400">เลือกโหมดสร้างข่าว</p>
                                                            <div className="flex gap-2">
                                                                <button 
                                                                    onClick={() => handleGenerateSummary(false)}
                                                                    disabled={isGeneratingSummary}
                                                                    className="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-lg text-xs font-bold shadow-md transition flex items-center justify-center gap-2"
                                                                >
                                                                    {isGeneratingSummary ? <Loader2 className="w-4 h-4 animate-spin"/> : <Sparkles className="w-4 h-4" />}
                                                                    AI Writer
                                                                </button>
                                                                <button 
                                                                    onClick={() => handleGenerateSummary(true)}
                                                                    className="px-4 py-2 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-lg text-xs font-bold shadow-sm transition flex items-center justify-center gap-2"
                                                                >
                                                                    <LayoutTemplate className="w-4 h-4" />
                                                                    Template
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="text-center py-4 text-slate-400 text-xs italic">
                                                            รอผู้ดูแลระบบอัปเดตข่าวสรุปผล
                                                        </div>
                                                    )
                                                )
                                            )}
                                        </div>
                                    )}

                                    {/* Penalties, Roster, etc. - No changes below */}
                                    {selectedMatch.winner && selectedMatch.kicks && selectedMatch.kicks.length > 0 && (
                                         <div className="grid grid-cols-2 gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                                             <div className="text-right border-r border-slate-100 pr-4">
                                                 <h5 className="text-[10px] text-indigo-400 uppercase tracking-widest font-bold mb-2">Penalties (A)</h5>
                                                 {renderScorers(selectedMatch, typeof selectedMatch.teamA === 'string' ? selectedMatch.teamA : selectedMatch.teamA.name, 'A')}
                                             </div>
                                             <div className="text-left pl-4">
                                                 <h5 className="text-[10px] text-indigo-400 uppercase tracking-widest font-bold mb-2">Penalties (B)</h5>
                                                 {renderScorers(selectedMatch, typeof selectedMatch.teamB === 'string' ? selectedMatch.teamB : selectedMatch.teamB.name, 'B')}
                                             </div>
                                         </div>
                                    )}

                                    {!selectedMatch.winner && (
                                        <button onClick={(e) => handleStart(e, selectedMatch)} className="w-full max-w-sm mx-auto flex items-center justify-center gap-2 bg-green-500 hover:bg-green-600 text-white py-3 rounded-xl font-bold shadow-lg shadow-green-900/20 transition transform hover:scale-105 active:scale-95 text-sm">
                                            <PlayCircle className="w-5 h-5" /> เริ่มบันทึกผลการแข่งขัน
                                        </button>
                                    )}

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="bg-white p-3 md:p-4 rounded-xl border shadow-sm">
                                            <div className="mb-2 text-xs font-bold text-slate-400 uppercase tracking-wider">Team A</div>
                                            {renderRoster(typeof selectedMatch.teamA === 'string' ? selectedMatch.teamA : selectedMatch.teamA.name)}
                                        </div>
                                        <div className="bg-white p-3 md:p-4 rounded-xl border shadow-sm">
                                            <div className="mb-2 text-xs font-bold text-slate-400 uppercase tracking-wider">Team B</div>
                                            {renderRoster(typeof selectedMatch.teamB === 'string' ? selectedMatch.teamB : selectedMatch.teamB.name)}
                                        </div>
                                    </div>
                                    
                                    {isAdmin && (
                                        <div className="bg-white p-4 rounded-xl border border-indigo-100 mt-4">
                                            <div className="text-indigo-600 text-xs font-bold mb-3 flex items-center justify-center gap-2"><ClipboardCheck className="w-3 h-3" /> ผู้ดูแล: บันทึกผลด่วน</div>
                                            <div className="flex flex-col items-center gap-3">
                                                <div className="flex items-center justify-center gap-2">
                                                    <input type="number" placeholder="0" value={quickScoreA} onChange={(e) => setQuickScoreA(e.target.value)} className="w-16 p-2 text-center rounded-lg border bg-slate-50 font-bold" />
                                                    <span className="font-bold">:</span>
                                                    <input type="number" placeholder="0" value={quickScoreB} onChange={(e) => setQuickScoreB(e.target.value)} className="w-16 p-2 text-center rounded-lg border bg-slate-50 font-bold" />
                                                    <button onClick={handleQuickSaveResult} disabled={isQuickSaving} className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-xs font-bold shadow-sm">{isQuickSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : "บันทึก"}</button>
                                                </div>
                                                {!selectedMatch.winner && (
                                                    <div className="flex gap-2 w-full justify-center">
                                                        <button onClick={() => handleWalkover('A')} className="px-3 py-1 bg-slate-100 text-slate-600 border rounded text-xs font-bold flex items-center gap-1">A ชนะบาย</button>
                                                        <button onClick={() => handleWalkover('B')} className="px-3 py-1 bg-slate-100 text-slate-600 border rounded text-xs font-bold flex items-center gap-1">B ชนะบาย</button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* ... Other tabs ... */}
                            {detailTab === 'stats' && (
                                <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                                    <div className="bg-white p-4 border-b border-slate-100">
                                        <h3 className="font-bold text-slate-700 flex items-center gap-2"><BarChart2 className="w-5 h-5 text-indigo-600" /> วิเคราะห์ก่อนเกม (Head-to-Head)</h3>
                                    </div>
                                    {renderStatsComparison(resolveTeam(selectedMatch.teamA), resolveTeam(selectedMatch.teamB))}
                                </div>
                            )}

                            {detailTab === 'share' && (
                                 <div className="p-8 flex flex-col items-center justify-center animate-in fade-in slide-in-from-right-4 duration-300 h-full min-h-[400px]">
                                     <div className="relative bg-gradient-to-br from-indigo-900 to-slate-900 w-full max-w-sm aspect-[4/5] rounded-2xl shadow-2xl overflow-hidden flex flex-col items-center justify-between p-8 text-white select-none ring-4 ring-white border border-slate-200">
                                         {/* Background Decor */}
                                         <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500 rounded-full mix-blend-overlay filter blur-3xl opacity-20 -translate-y-1/2 translate-x-1/2"></div>
                                         <div className="absolute bottom-0 left-0 w-64 h-64 bg-blue-500 rounded-full mix-blend-overlay filter blur-3xl opacity-20 translate-y-1/2 -translate-x-1/2"></div>
                                         
                                         {/* Header */}
                                         <div className="text-center relative z-10">
                                             {config.competitionLogo && <img src={config.competitionLogo} className="w-16 h-16 mx-auto mb-2 object-contain" />}
                                             <h3 className="font-bold text-sm tracking-widest uppercase opacity-80">{config.competitionName}</h3>
                                             <div className="text-xs text-indigo-300 mt-1">{selectedMatch.roundLabel?.split(':')[0]}</div>
                                         </div>

                                         {/* Matchup */}
                                         <div className="flex items-center justify-between w-full relative z-10 my-4">
                                             <div className="flex flex-col items-center w-1/3">
                                                 {resolveTeam(selectedMatch.teamA).logoUrl ? <img src={resolveTeam(selectedMatch.teamA).logoUrl} className="w-20 h-20 bg-white rounded-xl p-1 shadow-lg object-contain" /> : <div className="w-20 h-20 bg-white/20 rounded-xl flex items-center justify-center text-3xl font-bold">A</div>}
                                                 <span className="font-bold mt-3 text-center leading-tight">{resolveTeam(selectedMatch.teamA).name}</span>
                                             </div>
                                             <div className="flex flex-col items-center w-1/3">
                                                 <div className="text-4xl font-black font-mono tracking-tighter drop-shadow-lg">
                                                     {selectedMatch.winner ? `${selectedMatch.scoreA} - ${selectedMatch.scoreB}` : 'VS'}
                                                 </div>
                                                 {selectedMatch.winner && <div className="bg-white text-indigo-900 text-[10px] font-black px-2 py-0.5 rounded mt-1">FULL TIME</div>}
                                             </div>
                                             <div className="flex flex-col items-center w-1/3">
                                                 {resolveTeam(selectedMatch.teamB).logoUrl ? <img src={resolveTeam(selectedMatch.teamB).logoUrl} className="w-20 h-20 bg-white rounded-xl p-1 shadow-lg object-contain" /> : <div className="w-20 h-20 bg-white/20 rounded-xl flex items-center justify-center text-3xl font-bold">B</div>}
                                                 <span className="font-bold mt-3 text-center leading-tight">{resolveTeam(selectedMatch.teamB).name}</span>
                                             </div>
                                         </div>
                                         
                                         {/* Footer */}
                                         <div className="w-full border-t border-white/20 pt-4 relative z-10">
                                             <div className="flex justify-between items-end">
                                                 <div className="text-left">
                                                     <div className="text-[10px] text-indigo-300">DATE</div>
                                                     <div className="text-xs font-bold">{formatDate(selectedMatch.scheduledTime || selectedMatch.date)}</div>
                                                 </div>
                                                 <div className="text-right">
                                                     <div className="text-[10px] text-indigo-300">VENUE</div>
                                                     <div className="text-xs font-bold">{selectedMatch.venue || 'Main Stadium'}</div>
                                                 </div>
                                             </div>
                                             <div className="text-center mt-4 text-[10px] opacity-50 font-mono">Powered by Penalty Pro</div>
                                         </div>
                                     </div>
                                     <p className="mt-4 text-slate-500 text-xs flex items-center gap-2"><Camera className="w-4 h-4" /> แคปหน้าจอนี้เพื่อแชร์ลงโซเชียล</p>
                                 </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        )}

        {/* ... (Add Modal and Edit Modals code remains the same) ... */}
        {isAddModalOpen && (
            <div className="fixed inset-0 z-[1100] bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm overflow-y-auto" onClick={() => setIsAddModalOpen(false)}>
                <div className={`bg-white rounded-2xl shadow-2xl p-6 w-full ${activeMatchType === 'group' && !matchForm.id ? 'max-w-4xl' : 'max-w-md'} animate-in zoom-in duration-200 my-8 transition-all relative`} onClick={e => e.stopPropagation()}>
                    <div className="flex justify-between items-center mb-4 border-b pb-2">
                        <h3 className="text-lg font-bold text-slate-800">{matchForm.id ? 'แก้ไขตาราง' : 'เพิ่มตารางการแข่งขัน'}</h3>
                        <button onClick={() => setIsAddModalOpen(false)} className="p-1 hover:bg-slate-100 rounded-full"><X className="w-5 h-5 text-slate-500"/></button>
                    </div>
                    <div className="space-y-4">
                         {!matchForm.id && (
                        <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 mb-2">
                            <label className="text-xs font-bold text-slate-500 mb-2 block">ประเภทการแข่งขัน</label>
                            <div className="flex bg-white rounded-lg p-1 border border-slate-200 mb-3 shadow-sm">
                                <button onClick={() => setActiveMatchType('group')} className={`flex-1 py-1.5 text-xs font-bold rounded-md transition ${activeMatchType === 'group' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}>รอบแบ่งกลุ่ม</button>
                                <button onClick={() => setActiveMatchType('knockout')} className={`flex-1 py-1.5 text-xs font-bold rounded-md transition ${activeMatchType === 'knockout' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}>น็อคเอาท์</button>
                                <button onClick={() => setActiveMatchType('custom')} className={`flex-1 py-1.5 text-xs font-bold rounded-md transition ${activeMatchType === 'custom' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}>ทั่วไป</button>
                            </div>
                            {activeMatchType === 'group' && (
                                <div className="animate-in slide-in-from-top-2 fade-in duration-200">
                                    <label className="text-xs font-bold text-slate-500 mb-2 block flex items-center justify-between"><span>เลือกกลุ่ม</span><span className="text-[10px] font-normal text-slate-400">ระบุกลุ่ม A-H</span></label>
                                    <div className="flex flex-wrap gap-2">{['A','B','C','D','E','F','G','H'].map(g => (<button key={g} onClick={() => setGroupRound(g)} className={`w-9 h-9 rounded-lg border text-sm font-bold transition hover:scale-105 active:scale-95 ${matchForm.roundLabel === `Group ${g}` ? 'bg-indigo-600 text-white border-indigo-600 shadow-md ring-2 ring-indigo-200' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'}`}>{g}</button>))}</div>
                                    <p className="text-[10px] text-indigo-600 mt-2 flex items-center gap-1 bg-indigo-50 p-1 rounded"><ListPlus className="w-3 h-3"/> แสดงเฉพาะทีมในกลุ่ม {matchForm.roundLabel.replace('Group ', '')}</p>
                                </div>
                            )}
                            {activeMatchType === 'knockout' && (
                                <div className="animate-in slide-in-from-top-2 fade-in duration-200">
                                    <label className="text-xs font-bold text-slate-500 mb-1 block">เลือกรอบการแข่งขัน</label>
                                    <div className="relative"><select value={matchForm.roundLabel} onChange={e => setMatchForm({...matchForm, roundLabel: e.target.value})} className="w-full p-2.5 bg-white border border-slate-300 rounded-lg text-sm appearance-none focus:ring-2 focus:ring-indigo-500 outline-none"><option value="Round of 32">Round of 32 (32 ทีม)</option><option value="Round of 16">Round of 16 (16 ทีม)</option><option value="Quarter Final">Quarter Final (8 ทีม)</option><option value="Semi Final">Semi Final (รองชนะเลิศ)</option><option value="Final">Final (ชิงชนะเลิศ)</option><option value="3rd Place">3rd Place (ชิงที่ 3)</option></select><ChevronDown className="absolute right-3 top-3 w-4 h-4 text-slate-400 pointer-events-none" /></div>
                                </div>
                            )}
                            {activeMatchType === 'custom' && (
                                <div className="animate-in slide-in-from-top-2 fade-in duration-200">
                                    <label className="text-xs font-bold text-slate-500 mb-1 block">ชื่อรายการ / รอบ</label>
                                    <input type="text" value={matchForm.roundLabel} onChange={e => setMatchForm({...matchForm, roundLabel: e.target.value})} className="w-full p-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="เช่น กระชับมิตร, รอบพิเศษ..." />
                                </div>
                            )}
                        </div>
                        )}
                        <div><label className="text-xs font-bold text-slate-500 mb-1 block">{activeMatchType === 'group' && !matchForm.id ? 'วันที่แข่ง (ใช้ร่วมกัน)' : 'วันที่'}</label><input type="date" value={matchForm.date} onChange={e => setMatchForm({...matchForm, date: e.target.value})} className="w-full p-2.5 border border-slate-300 rounded-lg text-sm" /></div>

                        {activeMatchType === 'group' && !matchForm.id ? (
                            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                                <div className="bg-slate-100 p-2 grid grid-cols-12 gap-2 text-xs font-bold text-slate-500 text-center"><div className="col-span-2">เวลา</div><div className="col-span-3">ทีมเหย้า</div><div className="col-span-3">ทีมเยือน</div><div className="col-span-3">สนาม</div><div className="col-span-1">ลบ</div></div>
                                <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 bg-white"><datalist id="venue-list">{VENUE_OPTIONS.map(v => <option key={v} value={v} />)}</datalist>{bulkMatches.map((row, idx) => (<div key={row.tempId} className="grid grid-cols-12 gap-2 p-2 items-center text-sm"><div className="col-span-2"><input type="time" value={row.time} onChange={(e) => updateBulkRow(idx, 'time', e.target.value)} className="w-full p-1 border rounded text-center text-xs" /></div><div className="col-span-3"><TeamSelectionButton value={row.teamA} placeholder="เหย้า" onClick={() => openTeamSelector('bulkA', idx, row.teamA)} /></div><div className="col-span-3"><TeamSelectionButton value={row.teamB} placeholder="เยือน" onClick={() => openTeamSelector('bulkB', idx, row.teamB)} /></div><div className="col-span-3"><input type="text" list="venue-list" value={row.venue} onChange={(e) => updateBulkRow(idx, 'venue', e.target.value)} className="w-full p-1.5 border rounded text-xs" placeholder="สนาม..." /></div><div className="col-span-1 flex justify-center"><button onClick={() => removeBulkRow(idx)} className="text-slate-300 hover:text-red-500 disabled:opacity-30" disabled={bulkMatches.length <= 1}><X className="w-4 h-4" /></button></div></div>))}</div>
                                <div className="bg-slate-50 p-2 text-center"><button onClick={addBulkRow} className="text-indigo-600 text-xs font-bold hover:underline flex items-center justify-center gap-1 w-full"><PlusCircle className="w-4 h-4"/> เพิ่มคู่แข่งขันอีก</button></div>
                            </div>
                        ) : (
                        <>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4"><div><label className="text-xs font-bold text-slate-500 mb-1 block">ทีมเหย้า (Home)</label><TeamSelectionButton value={matchForm.teamA} placeholder="เลือกทีม..." onClick={() => openTeamSelector('singleA')} /></div><div><label className="text-xs font-bold text-slate-500 mb-1 block">ทีมเยือน (Away)</label><TeamSelectionButton value={matchForm.teamB} placeholder="เลือกทีม..." onClick={() => openTeamSelector('singleB')} /></div></div>
                            <div className="grid grid-cols-2 gap-4"><div><label className="text-xs font-bold text-slate-500 mb-1 block">เวลา</label><input type="time" value={matchForm.time} onChange={e => setMatchForm({...matchForm, time: e.target.value})} className="w-full p-2.5 border border-slate-300 rounded-lg text-sm" /></div><div><label className="text-xs font-bold text-slate-500 mb-1 block">สนามแข่ง</label><div className="relative"><input type="text" list="single-venue-list" value={matchForm.venue} onChange={e => setMatchForm({...matchForm, venue: e.target.value})} className="w-full p-2.5 border border-slate-300 rounded-lg text-sm" placeholder="สนาม..." /><datalist id="single-venue-list">{VENUE_OPTIONS.map(v => <option key={v} value={v} />)}</datalist></div></div></div>
                            <div className="border-t border-slate-100 pt-3 mt-2"><label className="text-xs font-bold text-slate-500 mb-2 block flex items-center gap-2"><Video className="w-4 h-4" /> Live Stream (Youtube/Facebook)</label><div className="grid grid-cols-1 md:grid-cols-2 gap-4"><div><input type="text" value={matchForm.livestreamUrl} onChange={e => setMatchForm({...matchForm, livestreamUrl: e.target.value})} className="w-full p-2.5 border border-slate-300 rounded-lg text-sm" placeholder="https://www.youtube.com/watch?v=..." /><p className="text-[10px] text-slate-400 mt-1 flex gap-2"><span className="flex items-center gap-1"><Youtube className="w-3 h-3"/> Support Youtube</span><span className="flex items-center gap-1"><Facebook className="w-3 h-3"/> Support FB Watch</span></p></div><div><label className="flex items-center gap-2 p-2 border border-dashed border-slate-300 rounded-lg cursor-pointer hover:bg-slate-50 transition"><div className="w-8 h-8 bg-slate-100 rounded flex items-center justify-center shrink-0">{matchCover.preview ? <img src={matchCover.preview} className="w-full h-full object-cover rounded" /> : <Image className="w-4 h-4 text-slate-400" />}</div><span className="text-xs text-slate-500 truncate">{matchCover.file ? matchCover.file.name : 'อัปโหลดรูปปก Live (ถ้ามี)'}</span><input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && handleCoverChange(e.target.files[0])} /></label></div></div></div>
                        </>
                        )}
                        <button onClick={handleSaveMatch} disabled={isSaving} className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition flex items-center justify-center gap-2 shadow-lg shadow-indigo-200 mt-2">{isSaving ? <Loader2 className="w-4 h-4 animate-spin"/> : <Save className="w-4 h-4"/>} บันทึกตารางแข่ง</button>
                    </div>
                </div>
            </div>
        )}
        
         {isEditResultOpen && (
            <div className="fixed inset-0 z-[1100] bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setIsEditResultOpen(false)}>
                 <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm animate-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
                     <div className="flex justify-between items-center mb-4 border-b pb-2">
                         <h3 className="font-bold text-lg text-slate-800">แก้ไขผลการแข่งขัน</h3>
                         <button onClick={() => setIsEditResultOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5"/></button>
                     </div>
                     <div className="mb-6 flex items-center justify-between gap-4">
                         <div className="text-center flex-1">
                             <div className="font-bold text-slate-700 mb-2 truncate text-sm">{editResultForm.teamA}</div>
                             <input type="number" value={editResultForm.scoreA} onChange={e => setEditResultForm({...editResultForm, scoreA: e.target.value})} className="w-full p-3 border rounded-lg text-center font-bold text-xl bg-slate-50 focus:ring-2 focus:ring-blue-500 outline-none" />
                         </div>
                         <span className="font-bold text-slate-300 text-xl mt-6">:</span>
                         <div className="text-center flex-1">
                             <div className="font-bold text-slate-700 mb-2 truncate text-sm">{editResultForm.teamB}</div>
                             <input type="number" value={editResultForm.scoreB} onChange={e => setEditResultForm({...editResultForm, scoreB: e.target.value})} className="w-full p-3 border rounded-lg text-center font-bold text-xl bg-slate-50 focus:ring-2 focus:ring-red-500 outline-none" />
                         </div>
                     </div>
                     <button onClick={handleSaveEditedResult} disabled={isSaving} className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition flex items-center justify-center gap-2 shadow-lg shadow-indigo-200">
                         {isSaving ? <Loader2 className="w-4 h-4 animate-spin"/> : "บันทึกผลใหม่"}
                     </button>
                 </div>
            </div>
        )}

        {(matchToDelete || matchToReset) && (
            <div className="fixed inset-0 z-[1100] bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => { setMatchToDelete(null); setMatchToReset(null); }}>
                <div className="bg-white rounded-xl p-6 max-w-sm w-full shadow-2xl animate-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center gap-3 text-red-600 mb-4">
                        <AlertTriangle className="w-8 h-8" />
                        <h3 className="font-bold text-lg">ยืนยันการ{matchToReset ? 'รีเซ็ต' : 'ลบ'}?</h3>
                    </div>
                    <p className="text-slate-600 mb-6">{matchToReset ? "การรีเซ็ตจะล้างผลการแข่งขัน คะแนน และผู้ชนะ กลับไปเป็นสถานะ 'รอแข่ง' (Scheduled) และล้างข้อมูลการยิงประตูทั้งหมด" : "คุณต้องการลบตารางการแข่งขันนี้ใช่หรือไม่?"}</p>
                    <div className="flex gap-3">
                        <button onClick={() => { setMatchToDelete(null); setMatchToReset(null); }} disabled={isDeleting} className="flex-1 py-2 border rounded-lg hover:bg-slate-50 disabled:opacity-50">ยกเลิก</button>
                        <button onClick={matchToReset ? handleResetMatch : handleDeleteMatch} disabled={isDeleting} className={`flex-1 py-2 text-white rounded-lg font-bold flex items-center justify-center gap-2 disabled:opacity-50 ${matchToReset ? 'bg-orange-500 hover:bg-orange-600' : 'bg-red-600 hover:bg-red-700'}`}>{isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : (matchToReset ? "รีเซ็ตผล" : "ลบรายการ")}</button>
                    </div>
                </div>
            </div>
        )}
      </div>
    </div>
  );
};

export default ScheduleList;