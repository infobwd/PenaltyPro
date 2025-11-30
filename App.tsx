import React, { useState, useEffect } from 'react';
import { KickResult, MatchState, Kick, Team, Player, AppSettings, School, NewsItem, Match, UserProfile, Tournament, MatchEvent, TournamentConfig, TournamentPrize, Donation } from './types';
import MatchSetup from './components/MatchSetup';
import ScoreVisualizer from './components/ScoreVisualizer';
import PenaltyInterface from './components/PenaltyInterface';
import RegularMatchInterface from './components/RegularMatchInterface';
import SettingsDialog from './components/SettingsDialog';
import RegistrationForm from './components/RegistrationForm';
import TournamentView from './components/TournamentView';
import StandingsView from './components/StandingsView';
import AdminDashboard from './components/AdminDashboard';
import LoginDialog from './components/LoginDialog';
import UserLoginDialog from './components/UserLoginDialog';
import PinDialog from './components/PinDialog'; 
import ScheduleList from './components/ScheduleList'; 
import NewsFeed from './components/NewsFeed'; 
import TournamentSelector from './components/TournamentSelector';
import DonationDialog from './components/DonationDialog';
import { ToastContainer, ToastMessage, ToastType } from './components/Toast';
import { fetchDatabase, saveMatchToSheet, authenticateUser, saveMatchEventsToSheet } from './services/sheetService';
import { initializeLiff } from './services/liffService';
import { checkSession, logout as authLogout } from './services/authService';
import { RefreshCw, Clipboard, Trophy, Settings, UserPlus, LayoutList, BarChart3, Lock, Home, CheckCircle2, XCircle, ShieldAlert, MapPin, Loader2, Undo2, Edit2, Trash2, AlertTriangle, Bell, CalendarDays, WifiOff, ListChecks, ChevronRight, Share2, Megaphone, Video, Play, LogOut, User, LogIn, Heart, Navigation, Target, ChevronLeft, ArrowLeftRight, Edit3, ArrowLeft, Star, Coins, DollarSign, FileText, Download, Users } from 'lucide-react';
import confetti from 'canvas-confetti';

const DEFAULT_SETTINGS: AppSettings = {
  competitionName: "Penalty Pro Arena",
  competitionLogo: "https://raw.githubusercontent.com/noppharutlubbuangam-dot/vichakan/refs/heads/main/cup.gif",
  bankName: "ธนาคาร",
  bankAccount: "-",
  accountName: "-",
  locationName: "-",
  locationLink: "",
  announcement: "",
  adminPin: "1234",
  registrationFee: 0,
  fundraisingGoal: 0,
  objectiveTitle: "",
  objectiveDescription: "",
  objectiveImageUrl: ""
};

const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371; 
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return (R * c).toFixed(1);
};

const getDisplayUrl = (url: string) => {
    if (!url) return '';
    if (url.includes('drive.google.com') && url.includes('/view')) {
        const idMatch = url.match(/\/d\/(.*?)\//);
        if (idMatch && idMatch[1]) return `https://lh3.googleusercontent.com/d/${idMatch[1]}`;
    }
    return url;
};

function App() {
  const [currentView, setCurrentView] = useState<string>('home');
  const [viewKey, setViewKey] = useState<number>(0); 
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [isUserLoginOpen, setIsUserLoginOpen] = useState(false);
  const [initialMatchId, setInitialMatchId] = useState<string | null>(null);
  const [initialNewsId, setInitialNewsId] = useState<string | null>(null);
  const [initialTeamId, setInitialTeamId] = useState<string | null>(null);
  const [editingTeamData, setEditingTeamData] = useState<{team: Team, players: Player[]} | null>(null);

  const [availableTeams, setAvailableTeams] = useState<Team[]>([]);
  const [availablePlayers, setAvailablePlayers] = useState<Player[]>([]);
  const [matchesLog, setMatchesLog] = useState<any[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [appConfig, setAppConfig] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [newsItems, setNewsItems] = useState<NewsItem[]>([]);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [currentTournamentId, setCurrentTournamentId] = useState<string | null>(null);
  const [donations, setDonations] = useState<Donation[]>([]); 

  const [isLoadingData, setIsLoadingData] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [matchState, setMatchState] = useState<MatchState | null>(null);
  const [pendingMatchSetup, setPendingMatchSetup] = useState<{teamA: Team, teamB: Team, matchId?: string} | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingKick, setEditingKick] = useState<Kick | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isLoginOpen, setIsLoginOpen] = useState(false); 
  const [isPinOpen, setIsPinOpen] = useState(false); 
  const [isAdmin, setIsAdmin] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean; title: string; message: string; onConfirm: () => void; isDangerous?: boolean; } | null>(null);
  const [userLocation, setUserLocation] = useState<{lat: number, lng: number} | null>(null);
  const [distanceToVenue, setDistanceToVenue] = useState<string | null>(null);
  const [announcementIndex, setAnnouncementIndex] = useState(0);
  const [isDonationOpen, setIsDonationOpen] = useState(false);
  const [isDonorListOpen, setIsDonorListOpen] = useState(false); // New State
  const [activeImageMode, setActiveImageMode] = useState<'before' | 'after'>('before');

  const activeTeams = currentTournamentId ? availableTeams.filter(t => t.tournamentId === currentTournamentId || (!t.tournamentId && currentTournamentId === 'default')) : [];
  const activePlayers = currentTournamentId ? availablePlayers.filter(p => p.tournamentId === currentTournamentId || (!p.tournamentId && currentTournamentId === 'default')) : [];
  const activeMatches = currentTournamentId ? matchesLog.filter(m => m.tournamentId === currentTournamentId || (!m.tournamentId && currentTournamentId === 'default')) : [];
  const activeTournament = tournaments.find(t => t.id === currentTournamentId);
  const activeDonations = currentTournamentId ? donations.filter(d => d.tournamentId === currentTournamentId) : [];

  const getTournamentConfig = (): TournamentConfig => { try { return activeTournament?.config ? JSON.parse(activeTournament.config) : {}; } catch(e) { return {}; } };
  const tConfig = getTournamentConfig();
  
  const effectiveSettings: AppSettings = {
      ...appConfig,
      bankName: tConfig.bankName || appConfig.bankName,
      bankAccount: tConfig.bankAccount || appConfig.bankAccount,
      accountName: tConfig.accountName || appConfig.accountName,
      locationName: tConfig.locationName || appConfig.locationName,
      locationLink: tConfig.locationLink || appConfig.locationLink,
      locationLat: tConfig.locationLat || appConfig.locationLat,
      locationLng: tConfig.locationLng || appConfig.locationLng,
  };

  const registrationDeadline = tConfig.registrationDeadline;
  const maxTeams = tConfig.maxTeams || 0;
  const currentTeamCount = activeTeams.filter(t => t.status !== 'Rejected').length;
  const isRegistrationFull = maxTeams > 0 && currentTeamCount >= maxTeams;

  // Objective Data
  const objectiveData = tConfig.objective?.isEnabled ? {
      title: tConfig.objective.title,
      description: tConfig.objective.description,
      goal: tConfig.objective.goal,
      images: tConfig.objective.images || [],
      docUrl: tConfig.objective.docUrl // New
  } : {
      title: appConfig.objectiveTitle,
      description: appConfig.objectiveDescription,
      goal: appConfig.fundraisingGoal,
      images: appConfig.objectiveImageUrl ? [{ id: 'legacy', url: appConfig.objectiveImageUrl, type: 'general' }] : [],
      docUrl: null
  };

  const hasComparisonImages = objectiveData.images.some(i => i.type === 'before') && objectiveData.images.some(i => i.type === 'after');
  const prizes = tConfig.prizes || [];
  const myTeams = currentUser ? activeTeams.filter(t => t.creatorId === currentUser.userId) : [];
  const announcements = effectiveSettings.announcement ? effectiveSettings.announcement.split('|').filter(s => s.trim() !== '') : [];

  // Financial Calculations
  const approvedTeamsCount = activeTeams.filter(t => t.status === 'Approved').length;
  const regFee = tConfig.registrationFee || appConfig.registrationFee || 0; 
  const incomeFromFees = approvedTeamsCount * regFee;
  const verifiedDonations = activeDonations.filter(d => d.status === 'Verified').reduce((sum, d) => sum + d.amount, 0);
  
  // Total Prizes
  const totalPrizeAmount = prizes.reduce((sum, p) => {
      const num = parseInt(p.amount.replace(/,/g, ''));
      return isNaN(num) ? sum : sum + num;
  }, 0);
  
  // Total Income (Donations + Fees)
  const totalIncome = verifiedDonations + incomeFromFees;

  // Net Raised (Income - Prizes)
  const netRaised = Math.max(0, totalIncome - totalPrizeAmount);

  // Goal
  const goal = objectiveData.goal || 0;

  // Progress based on Net Raised vs Goal
  const fundraisingProgress = goal > 0 ? Math.min(100, (netRaised / goal) * 100) : 0;

  useEffect(() => {
    const init = async () => {
        await initializeLiff();
        const liffUser = await checkSession(); 
        if (liffUser) {
            try {
                if (liffUser.type === 'line') {
                    const backendUser = await authenticateUser({ authType: 'line', lineUserId: liffUser.userId, displayName: liffUser.displayName, pictureUrl: liffUser.pictureUrl });
                    if (backendUser) { setCurrentUser(backendUser); if (backendUser.role === 'admin') setIsAdmin(true); } else { setCurrentUser(liffUser); }
                } else if (liffUser.role) { setCurrentUser(liffUser); if (liffUser.role === 'admin') setIsAdmin(true); } else { setCurrentUser(liffUser); }
            } catch (e) { console.warn("Backend Auth Sync Failed", e); setCurrentUser(liffUser); }
        }
    };
    loadData();
    init();
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition((position) => setUserLocation({ lat: position.coords.latitude, lng: position.coords.longitude }), (error) => console.log("Geolocation error:", error));
    }
    const savedTId = localStorage.getItem('current_tournament_id');
    if (savedTId) setCurrentTournamentId(savedTId);
  }, []);

  useEffect(() => { if (userLocation && effectiveSettings.locationLat && effectiveSettings.locationLng) { const dist = calculateDistance(userLocation.lat, userLocation.lng, effectiveSettings.locationLat, effectiveSettings.locationLng); setDistanceToVenue(dist); } }, [userLocation, effectiveSettings.locationLat, effectiveSettings.locationLng]);
  useEffect(() => { if (announcements.length > 1) { const interval = setInterval(() => setAnnouncementIndex(prev => (prev + 1) % announcements.length), 5000); return () => clearInterval(interval); } }, [announcements.length]);
  useEffect(() => { 
      if (!isLoadingData && availableTeams.length > 0) { 
          const params = new URLSearchParams(window.location.search); 
          const view = params.get('view'); 
          const id = params.get('id'); 
          const teamId = params.get('teamId'); 
          const tournamentIdParam = params.get('tournamentId');

          // Handle Deep Link for Tournament
          if (tournamentIdParam) {
              setCurrentTournamentId(tournamentIdParam);
              // Clean up URL if possible, or just let it be
          } else if (view === 'match_detail' && id) { 
              setInitialMatchId(id); 
              setCurrentView('schedule'); 
          } else if (view === 'news' && id) { 
              setInitialNewsId(id); 
              setCurrentView('home'); 
          } else if (view === 'schedule') { 
              setCurrentView('schedule'); 
          } else if (view === 'standings') { 
              setCurrentView('standings'); 
          } else if (view === 'tournament') { 
              setCurrentView('tournament'); 
          } else if (view === 'admin' && teamId) { 
              setInitialTeamId(teamId); 
              if (!isAdmin) { 
                  setIsLoginOpen(true); 
                  setCurrentView('admin'); 
              } else { 
                  setCurrentView('admin'); 
              } 
          } 
      } 
  }, [isLoadingData, availableTeams.length, isAdmin]);

  const showNotification = (title: string, message: string = '', type: ToastType = 'success') => { const id = Date.now().toString(); setToasts(prev => [...prev, { id, title, message, type }]); };
  const removeToast = (id: string) => setToasts(prev => prev.filter(t => t.id !== id));

  const loadData = async () => {
    setIsLoadingData(true);
    setConnectionError(null);
    try {
      const data = await fetchDatabase();
      if (data) {
        setAvailableTeams(data.teams);
        setAvailablePlayers(data.players);
        setMatchesLog(data.matches || []);
        setAppConfig({ ...DEFAULT_SETTINGS, ...data.config }); 
        setSchools(data.schools || []);
        setNewsItems(data.news || []);
        setTournaments(data.tournaments || []);
        setDonations(data.donations || []);
        if (!currentTournamentId) { 
            const savedTId = localStorage.getItem('current_tournament_id'); 
            // Also check URL param for tournamentId here in case of race condition
            const params = new URLSearchParams(window.location.search);
            const urlTId = params.get('tournamentId');

            if (urlTId && data.tournaments.find(t => t.id === urlTId)) {
                setCurrentTournamentId(urlTId);
            } else if (savedTId && data.tournaments.find(t => t.id === savedTId)) { 
                setCurrentTournamentId(savedTId); 
            } else if (data.tournaments.length === 1) { 
                setCurrentTournamentId(data.tournaments[0].id); 
            } 
        }
      }
    } catch (e: any) { console.warn("Database Error", e); setConnectionError(e.message); showNotification("เชื่อมต่อไม่ได้", e.message, 'error'); } finally { setIsLoadingData(false); }
  };

  const handleRegisterClick = () => { if (isRegistrationFull) { showNotification("ขออภัย", "การลงทะเบียนเต็มจำนวนแล้ว", "info"); return; } setEditingTeamData(null); if (currentUser) setCurrentView('register'); else setIsUserLoginOpen(true); };
  const handleEditMyTeam = (team: Team) => { if (registrationDeadline) { const deadline = new Date(registrationDeadline); if (new Date() > deadline && !isAdmin) { showNotification("ปิดรับสมัครแล้ว", "ไม่สามารถแก้ไขข้อมูลได้เนื่องจากเลยกำหนด", "warning"); return; } } const teamPlayers = activePlayers.filter(p => p.teamId === team.id); setEditingTeamData({ team, players: teamPlayers }); setCurrentView('register'); };
  const handleUserLoginSuccess = (user: UserProfile) => { setCurrentUser(user); if (user.role === 'admin') setIsAdmin(true); if (user.type === 'credentials') localStorage.setItem('penalty_pro_user', JSON.stringify(user)); showNotification("ยินดีต้อนรับ", `สวัสดีคุณ ${user.displayName}`, "success"); };
  const handleLogout = () => { authLogout(); setCurrentUser(null); setIsAdmin(false); showNotification("ออกจากระบบแล้ว"); };
  
  const startMatchSession = (teamA: Team, teamB: Team, matchId?: string) => { 
      // Ensure we have a match ID, create one if not provided (e.g. ad-hoc match)
      const finalMatchId = matchId || `M_${Date.now()}`;
      
      setMatchState({ 
          matchId: finalMatchId, 
          teamA, 
          teamB, 
          currentRound: 1, 
          currentTurn: 'A', 
          scoreA: 0, 
          scoreB: 0, 
          kicks: [], 
          events: [], 
          isFinished: false, 
          winner: null, 
          tournamentId: currentTournamentId || 'default' 
      }); 
      setCurrentView('match'); 
      showNotification("เริ่มการแข่งขัน", "เข้าสู่โหมดบันทึกผล", "success"); 
  };

  const handleStartMatchRequest = (teamA: Team, teamB: Team, matchId?: string) => { if (isAdmin || (currentUser && currentUser.role === 'staff')) { startMatchSession(teamA, teamB, matchId); } else { setPendingMatchSetup({ teamA, teamB, matchId }); setIsPinOpen(true); } };
  const handlePinSuccess = () => { if (pendingMatchSetup) { const { teamA, teamB, matchId } = pendingMatchSetup; startMatchSession(teamA, teamB, matchId); setPendingMatchSetup(null); setIsPinOpen(false); } };
  const checkWinCondition = (state: MatchState): MatchState => { const kicksA = state.kicks.filter(k => k.teamId === 'A'); const kicksB = state.kicks.filter(k => k.teamId === 'B'); const scoreA = kicksA.filter(k => k.result === KickResult.GOAL).length; const scoreB = kicksB.filter(k => k.result === KickResult.GOAL).length; const roundsPlayedA = kicksA.length; const roundsPlayedB = kicksB.length; let newState = { ...state, scoreA, scoreB, winner: null, isFinished: false }; if (roundsPlayedA <= 5 && roundsPlayedB <= 5) { const remainingKicksA = 5 - roundsPlayedA; const remainingKicksB = 5 - roundsPlayedB; if (scoreA > scoreB + remainingKicksB) { newState.winner = 'A'; newState.isFinished = true; } else if (scoreB > scoreA + remainingKicksA) { newState.winner = 'B'; newState.isFinished = true; } } else { if (roundsPlayedA === roundsPlayedB && roundsPlayedA >= 5) { if (scoreA !== scoreB) { newState.winner = scoreA > scoreB ? 'A' : 'B'; newState.isFinished = true; } } } return newState; };
  
  const handleRecordKick = async (player: string, result: KickResult) => { 
      if (!matchState || matchState.isFinished) return; 
      setIsProcessing(true); 
      const newKick: Kick = { 
          id: Date.now().toString(), 
          round: matchState.currentRound, 
          teamId: matchState.currentTurn, 
          player, 
          result, 
          timestamp: Date.now(), 
          tournamentId: currentTournamentId || 'default',
          matchId: matchState.matchId || '' // Include Match ID
      }; 
      setMatchState(prev => { 
          if (!prev) return null; 
          const updatedKicks = [...prev.kicks, newKick]; 
          const nextTurn = prev.currentTurn === 'A' ? 'B' : 'A'; 
          const nextRound = prev.currentTurn === 'B' ? prev.currentRound + 1 : prev.currentRound; 
          let nextState: MatchState = { ...prev, kicks: updatedKicks, currentTurn: nextTurn, currentRound: nextRound }; 
          nextState = checkWinCondition(nextState); 
          if (nextState.isFinished) { 
              confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 }, colors: nextState.winner === 'A' ? ['#2563EB', '#60A5FA'] : ['#E11D48', '#FB7185'] }); 
              setIsSaving(true); 
              Promise.all([ saveMatchToSheet(nextState, "", false, currentTournamentId || 'default') ]).then(() => { setIsSaving(false); loadData(); showNotification("บันทึกผลการแข่งขันเรียบร้อย", "", "success"); }); 
          } 
          return nextState; 
      }); 
      setIsProcessing(false); 
  };

  const handleUpdateOldKick = (kickId: string, newResult: KickResult, newPlayerName: string) => { setMatchState(prev => { if (!prev) return null; const updatedKicks = prev.kicks.map(k => k.id === kickId ? { ...k, result: newResult, player: newPlayerName } : k); let nextState = { ...prev, kicks: updatedKicks }; nextState = checkWinCondition(nextState); return nextState; }); setEditingKick(null); showNotification("แก้ไขผลการยิงเรียบร้อย", "", "success"); };
  const confirmDeleteKick = (kickId: string) => { setConfirmModal({ isOpen: true, title: "ลบรายการนี้?", message: "ยืนยันการลบผลการยิงนี้?", isDangerous: true, onConfirm: () => { handleDeleteKick(kickId); setConfirmModal(null); } }); };
  const handleDeleteKick = (kickId: string) => { setMatchState(prev => { if (!prev) return null; const newKicks = prev.kicks.filter(k => k.id !== kickId); const kicksA = newKicks.filter(k => k.teamId === 'A'); const kicksB = newKicks.filter(k => k.teamId === 'B'); const currentTurn: 'A' | 'B' = kicksA.length > kicksB.length ? 'B' : 'A'; const currentRound = Math.floor(newKicks.length / 2) + 1; let tempState = { ...prev, kicks: newKicks, currentTurn, currentRound }; return checkWinCondition(tempState); }); setEditingKick(null); showNotification("ลบรายการเรียบร้อย", "", "warning"); };
  const requestUndoLastKick = () => { if (!matchState || matchState.kicks.length === 0) return; setConfirmModal({ isOpen: true, title: "ยกเลิกการยิงล่าสุด", message: "ต้องการลบผลการยิงลูกล่าสุดใช่หรือไม่?", onConfirm: () => { handleUndoLastKick(); setConfirmModal(null); } }); };
  const handleUndoLastKick = () => { setMatchState(prev => { if (!prev) return null; const newKicks = [...prev.kicks]; newKicks.pop(); const kicksA = newKicks.filter(k => k.teamId === 'A'); const kicksB = newKicks.filter(k => k.teamId === 'B'); const currentTurn: 'A' | 'B' = kicksA.length > kicksB.length ? 'B' : 'A'; const currentRound = Math.floor(newKicks.length / 2) + 1; const tempState = { ...prev, kicks: newKicks, currentTurn, currentRound }; return checkWinCondition(tempState); }); showNotification("ย้อนกลับรายการล่าสุดแล้ว", "", "info"); };
  const resetMatch = () => { setConfirmModal({ isOpen: true, title: "เริ่มแมตช์ใหม่?", message: "ข้อมูลการแข่งขันปัจจุบันจะหายไป ต้องการเริ่มใหม่หรือไม่?", isDangerous: true, onConfirm: () => { setCurrentView('home'); setMatchState(null); setConfirmModal(null); } }); };
  const handleNavClick = (view: string) => { if (view === 'schedule') setInitialMatchId(null); if (currentView === view) setViewKey(prev => prev + 1); else setCurrentView(view); };
  const BottomNav = () => ( <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 px-2 py-2 flex justify-around items-center z-[100] shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] safe-area-bottom"> <NavButton view="home" icon={Home} label="หน้าหลัก" /> <NavButton view="schedule" icon={CalendarDays} label="ตาราง" /> <NavButton view="standings" icon={ListChecks} label="คะแนน" /> <NavButton view="tournament" icon={Trophy} label="ผังแข่ง" /> <NavButton view="admin" icon={isAdmin ? Settings : Lock} label="ระบบ" onClick={isAdmin ? undefined : () => setIsLoginOpen(true)} /> </div> );
  const NavButton = ({ view, icon: Icon, label, onClick }: { view: string, icon: any, label: string, onClick?: () => void }) => { const isActive = currentView === view; const handleClick = onClick || (() => handleNavClick(view)); return ( <button onClick={handleClick} className={`flex flex-col items-center justify-center p-2 rounded-xl transition-all w-16 ${isActive ? 'text-indigo-600 bg-indigo-50' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}><Icon className={`w-6 h-6 mb-1 ${isActive ? 'fill-indigo-200' : ''}`} /><span className="text-[10px] font-bold">{label}</span></button> ) };
  const showBottomNav = currentView !== 'match';
  const resolveTeam = (t: string | Team | null | undefined): Team => { if (!t) return { id: 'unknown', name: 'Unknown Team', shortName: 'N/A', color: '#94a3b8', logoUrl: '' } as Team; if (typeof t === 'object' && 'name' in t) return t as Team; const teamName = typeof t === 'string' ? t : 'Unknown'; return availableTeams.find(team => team.name === teamName) || { id: 'temp', name: teamName, color: '#94a3b8', logoUrl: '', shortName: teamName.substring(0, 3).toUpperCase() } as Team; };
  const liveMatches = activeMatches.filter(m => m.livestreamUrl && !m.winner);
  const recentFinishedMatches = activeMatches.filter(m => m.winner).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 5);
  const handleFinishRegularMatch = async (finalState: MatchState) => { setIsSaving(true); try { await saveMatchToSheet(finalState, '', false, currentTournamentId || 'default'); if (finalState.events && finalState.events.length > 0) { await saveMatchEventsToSheet(finalState.events); } showNotification("บันทึกผลเรียบร้อย", "จบการแข่งขันแล้ว", "success"); loadData(); setCurrentView('home'); } catch (e) { console.error(e); showNotification("ผิดพลาด", "บันทึกไม่สำเร็จ", "error"); } finally { setIsSaving(false); } };
  const handleUpdateRegularMatchState = (state: MatchState) => { };

  if (!currentTournamentId) {
      return (
          <div className="bg-slate-50 min-h-screen font-sans" style={{ fontFamily: "'Kanit', sans-serif" }}>
              <TournamentSelector 
                  tournaments={tournaments} 
                  teams={availableTeams} // Pass teams data here
                  donations={donations} // Pass donations here
                  onSelect={(id) => { setCurrentTournamentId(id); localStorage.setItem('current_tournament_id', id); }} 
                  isAdmin={isAdmin} 
                  onRefresh={loadData}
                  showNotification={showNotification}
                  isLoading={isLoadingData}
                  defaultFee={appConfig.registrationFee} // Pass default fee from global config
              />
              {!isAdmin && tournaments.length === 0 && (<div className="fixed bottom-4 right-4"><button onClick={() => setIsLoginOpen(true)} className="bg-white/50 p-2 rounded-full hover:bg-white transition text-slate-400"><Lock className="w-4 h-4"/></button></div>)}
              <LoginDialog isOpen={isLoginOpen} onClose={() => setIsLoginOpen(false)} onLogin={() => { setIsAdmin(true); showNotification('เข้าสู่ระบบผู้ดูแลแล้ว'); }} />
          </div>
      );
  }

  if (currentView === 'register') {
      return (
          <RegistrationForm 
            key={viewKey} 
            onBack={() => { loadData(); setCurrentView('home'); setEditingTeamData(null); }} 
            schools={schools} 
            config={effectiveSettings} 
            showNotification={showNotification} 
            user={currentUser} 
            initialData={editingTeamData}
            registrationDeadline={registrationDeadline}
          />
      );
  }

  return (
    <div className="bg-slate-50 min-h-screen text-slate-900 font-sans pb-24" style={{ fontFamily: "'Kanit', sans-serif" }}>
      <ToastContainer toasts={toasts} removeToast={removeToast} />
      {/* ... (rest of the render is unchanged) ... */}
      <SettingsDialog isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} onSave={loadData} currentSettings={appConfig} />
      <LoginDialog isOpen={isLoginOpen} onClose={() => setIsLoginOpen(false)} onLogin={() => { setIsAdmin(true); if(currentView !== 'tournament') setCurrentView('admin'); showNotification('เข้าสู่ระบบผู้ดูแลแล้ว'); }} />
      <PinDialog isOpen={isPinOpen} onClose={() => { setIsPinOpen(false); setPendingMatchSetup(null); }} onSuccess={handlePinSuccess} correctPin={String(appConfig.adminPin || "1234")} title="กรุณากรอกรหัสเริ่มแข่ง" />
      <UserLoginDialog isOpen={isUserLoginOpen} onClose={() => setIsUserLoginOpen(false)} onLoginSuccess={handleUserLoginSuccess} />
      <DonationDialog 
        isOpen={isDonationOpen} 
        onClose={() => setIsDonationOpen(false)} 
        config={effectiveSettings} 
        tournamentName={activeTournament?.name || ''} 
        tournamentId={currentTournamentId}
        currentUser={currentUser}
      />
      
      {/* Donor List Modal */}
      {isDonorListOpen && (
          <div className="fixed inset-0 z-[1200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setIsDonorListOpen(false)}>
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in duration-200 flex flex-col max-h-[80vh]" onClick={e => e.stopPropagation()}>
                  <div className="p-4 bg-pink-600 text-white flex justify-between items-center">
                      <div className="flex items-center gap-2">
                          <Heart className="w-5 h-5 fill-white" />
                          <h3 className="font-bold text-lg">รายนามผู้บริจาค</h3>
                      </div>
                      <button onClick={() => setIsDonorListOpen(false)}><XCircle className="w-6 h-6 text-pink-200 hover:text-white" /></button>
                  </div>
                  <div className="overflow-y-auto p-4 space-y-2 flex-1">
                      {activeDonations.filter(d => d.status === 'Verified').length === 0 ? (
                          <div className="text-center text-slate-400 py-8">ยังไม่มีรายการบริจาค</div>
                      ) : (
                          activeDonations.filter(d => d.status === 'Verified').sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).map(d => (
                              <div key={d.id} className="flex justify-between items-center p-3 bg-slate-50 rounded-xl border border-slate-100">
                                  <div>
                                      <p className="font-bold text-slate-800 text-sm">{d.isAnonymous ? 'ผู้ใจบุญ (ไม่ประสงค์ออกนาม)' : d.donorName}</p>
                                      <p className="text-[10px] text-slate-400">{new Date(d.timestamp).toLocaleDateString('th-TH')}</p>
                                  </div>
                                  <span className="font-mono font-bold text-pink-600">+{d.amount.toLocaleString()}</span>
                              </div>
                          ))
                      )}
                  </div>
                  <div className="p-4 border-t bg-slate-50 text-center text-xs text-slate-400">
                      ขอบคุณทุกท่านที่ร่วมสนับสนุนโครงการ
                  </div>
              </div>
          </div>
      )}

      {confirmModal && confirmModal.isOpen && (<div className="fixed inset-0 z-[1100] bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setConfirmModal(null)}><div className="bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full animate-in zoom-in duration-200" onClick={e => e.stopPropagation()}><div className={`flex items-center gap-3 mb-4 ${confirmModal.isDangerous ? 'text-red-600' : 'text-slate-700'}`}><AlertTriangle className="w-6 h-6" /><h3 className="font-bold text-lg">{confirmModal.title}</h3></div><p className="text-slate-600 mb-6">{confirmModal.message}</p><div className="flex gap-3"><button onClick={() => setConfirmModal(null)} className="flex-1 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 font-medium text-slate-600">ยกเลิก</button><button onClick={confirmModal.onConfirm} className={`flex-1 py-2 rounded-lg font-bold text-white ${confirmModal.isDangerous ? 'bg-red-600 hover:bg-red-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}>ยืนยัน</button></div></div></div>)}
      {editingKick && activeTournament?.type === 'Penalty' && (<div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[1100] p-4 backdrop-blur-sm" onClick={() => setEditingKick(null)}><div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm animate-in zoom-in duration-200" onClick={e => e.stopPropagation()}><div className="flex justify-between items-start mb-4"><h3 className="font-bold text-lg text-slate-800">แก้ไขผลการยิง</h3><button onClick={() => confirmDeleteKick(editingKick.id)} className="text-red-500 hover:bg-red-50 p-1 rounded transition" title="ลบรายการนี้"><Trash2 className="w-5 h-5" /></button></div><div className="space-y-4"><div><label className="block text-sm text-slate-500 mb-1">ชื่อผู้เล่น</label><input type="text" className="w-full p-2 border rounded-lg" defaultValue={editingKick.player} id="edit-player-name" /></div><div><label className="block text-sm text-slate-500 mb-1">ผลการยิง</label><select className="w-full p-2 border rounded-lg" defaultValue={editingKick.result} id="edit-kick-result"><option value={KickResult.GOAL}>เข้าประตู (GOAL)</option><option value={KickResult.SAVED}>เซฟได้ (SAVED)</option><option value={KickResult.MISSED}>ยิงพลาด (MISSED)</option></select></div><div className="flex gap-2 pt-4"><button onClick={() => setEditingKick(null)} className="flex-1 py-2 border rounded-lg text-slate-600 hover:bg-slate-50">ยกเลิก</button><button onClick={() => { const name = (document.getElementById('edit-player-name') as HTMLInputElement).value; const res = (document.getElementById('edit-kick-result') as HTMLSelectElement).value as KickResult; handleUpdateOldKick(editingKick.id, res, name); }} className="flex-1 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-bold">บันทึก</button></div></div></div></div>)}

      {currentView === 'tournament' && <TournamentView key={viewKey} teams={activeTeams} matches={activeMatches} onSelectMatch={handleStartMatchRequest} onBack={() => setCurrentView('home')} isAdmin={isAdmin} onRefresh={loadData} onLoginClick={() => setIsLoginOpen(true)} isLoading={isLoadingData} showNotification={showNotification} />}
      {currentView === 'schedule' && ( <ScheduleList key={viewKey} matches={activeMatches} teams={activeTeams} players={activePlayers} onBack={() => setCurrentView('home')} isAdmin={isAdmin} isLoading={isLoadingData} onRefresh={loadData} showNotification={showNotification} onStartMatch={handleStartMatchRequest} config={effectiveSettings} initialMatchId={initialMatchId} currentTournamentId={currentTournamentId} /> )}
      {currentView === 'standings' && <StandingsView key={viewKey} matches={activeMatches} teams={activeTeams} onBack={() => setCurrentView('home')} isLoading={isLoadingData} />}
      {currentView === 'admin' && ( <AdminDashboard key={viewKey} teams={activeTeams} players={activePlayers} settings={appConfig} onLogout={() => { setIsAdmin(false); setCurrentView('home'); }} onRefresh={loadData} news={newsItems} showNotification={showNotification} initialTeamId={initialTeamId} currentTournament={activeTournament} donations={donations} /> )}

      {currentView === 'match' && matchState && (
        <div className="min-h-screen bg-slate-900 pb-20">
            {activeTournament?.type === 'Penalty' ? (
                <div className="p-4 space-y-6 max-w-md mx-auto">
                    <div className="flex justify-between items-center text-white">
                        <button onClick={resetMatch} className="p-2 bg-white/10 rounded-full hover:bg-white/20 transition"><Undo2 className="w-5 h-5"/></button>
                        <h2 className="font-bold text-lg">การดวลจุดโทษ</h2>
                        <button onClick={requestUndoLastKick} className="p-2 bg-white/10 rounded-full hover:bg-white/20 transition"><Undo2 className="w-5 h-5"/></button>
                    </div>
                    
                    <ScoreVisualizer kicks={matchState.kicks} teamId="A" team={matchState.teamA} />
                    <ScoreVisualizer kicks={matchState.kicks} teamId="B" team={matchState.teamB} />
                    
                    {!matchState.isFinished ? (
                        <PenaltyInterface 
                            currentTurn={matchState.currentTurn} 
                            team={matchState.currentTurn === 'A' ? matchState.teamA : matchState.teamB}
                            roster={matchState.currentTurn === 'A' ? activePlayers.filter(p => p.teamId === matchState.teamA.id) : activePlayers.filter(p => p.teamId === matchState.teamB.id)}
                            onRecordResult={handleRecordKick}
                            isProcessing={isProcessing}
                        />
                    ) : (
                        <div className="bg-white rounded-2xl p-6 text-center animate-in zoom-in duration-300">
                            <Trophy className="w-16 h-16 mx-auto text-yellow-500 mb-4 animate-bounce" />
                            <h2 className="text-2xl font-bold text-slate-800 mb-2">จบการแข่งขัน!</h2>
                            <p className="text-lg text-slate-600 mb-6">
                                ผู้ชนะคือ <span className="font-bold text-indigo-600">{matchState.winner === 'A' ? matchState.teamA.name : matchState.teamB.name}</span>
                            </p>
                            <button 
                                onClick={() => { setCurrentView('home'); setMatchState(null); loadData(); }} 
                                className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition"
                            >
                                กลับหน้าหลัก
                            </button>
                        </div>
                    )}
                </div>
            ) : (
                <RegularMatchInterface 
                    teamA={matchState.teamA} 
                    teamB={matchState.teamB} 
                    matchId={matchState.matchId || `match_${Date.now()}`}
                    tournamentId={currentTournamentId || 'default'}
                    roster={activePlayers}
                    onFinishMatch={handleFinishRegularMatch}
                    onUpdateState={handleUpdateRegularMatchState}
                />
            )}
        </div>
      )}

      {currentView === 'home' && (
        <div className="min-h-screen bg-slate-100">
          {connectionError && <div className="bg-red-50 border-b border-red-200 p-3 flex items-center justify-between gap-4"><div className="flex items-center gap-2 text-red-700 text-sm font-bold"><WifiOff className="w-4 h-4" /><span>{connectionError}</span></div><button onClick={loadData} className="text-xs bg-white border border-red-200 text-red-600 px-2 py-1 rounded hover:bg-red-50">ลองใหม่</button></div>}
          
          {/* Top Bar */}
          <div className="bg-white sticky top-0 z-40 border-b border-slate-200 shadow-sm px-4 py-3 flex justify-between items-center">
              <div className="flex items-center gap-2">
                  <img src={effectiveSettings.competitionLogo || "https://via.placeholder.com/40"} className="w-8 h-8 object-contain" onError={(e) => e.currentTarget.style.display = 'none'} />
                  <h1 className="font-bold text-slate-800 truncate max-w-[100px] sm:max-w-[200px] text-sm sm:text-base">
                      {activeTournament ? activeTournament.name : appConfig.competitionName}
                  </h1>
              </div>
              <div className="flex items-center gap-2">
                  <button onClick={() => setCurrentTournamentId(null)} className="hidden md:flex items-center gap-1 text-xs text-slate-500 hover:text-indigo-600 bg-slate-100 px-2 py-1 rounded-full transition">
                      <ArrowLeftRight className="w-3 h-3"/> เปลี่ยนรายการ
                  </button>
                  <button 
                    onClick={handleRegisterClick} 
                    className={`text-white px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1 shadow-sm transition ${isRegistrationFull ? 'bg-slate-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'}`}
                    disabled={isRegistrationFull}
                  >
                      {isRegistrationFull ? (
                          <>เต็มแล้ว (Full)</>
                      ) : (
                          <><UserPlus className="w-3 h-3" /> สมัครแข่ง</>
                      )}
                  </button>
                  {currentUser ? (
                      <div className="flex items-center gap-2 pl-2 ml-2 border-l border-slate-200">
                          {currentUser.pictureUrl ? (
                              <img src={currentUser.pictureUrl} className="w-8 h-8 rounded-full border border-slate-200" />
                          ) : (
                              <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-xs">
                                  {String(currentUser.displayName || 'U').charAt(0)}
                              </div>
                          )}
                          <button onClick={handleLogout} className="ml-1 text-slate-400 hover:text-red-500"><LogOut className="w-4 h-4" /></button>
                      </div>
                  ) : (
                      <button onClick={() => setIsUserLoginOpen(true)} className="text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1 hover:bg-indigo-100 ml-1">
                          <LogIn className="w-3 h-3" /> เข้าสู่ระบบ
                      </button>
                  )}
              </div>
          </div>

          {/* Banner & Hero */}
          <div className="bg-gradient-to-br from-indigo-900 to-slate-900 text-white p-6 pb-12 relative overflow-hidden transition-all duration-300">
              <div className="absolute top-0 right-0 w-64 h-64 bg-white opacity-5 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl"></div>
              <div className="relative z-10 max-w-4xl mx-auto">
                  <div className="flex flex-col items-center text-center mb-6">
                      <div className="bg-white/10 p-4 rounded-full mb-4 backdrop-blur-sm border border-white/20">
                          <img src={effectiveSettings.competitionLogo} className="w-20 h-20 object-contain" onError={(e) => e.currentTarget.src = 'https://raw.githubusercontent.com/noppharutlubbuangam-dot/vichakan/refs/heads/main/cup.gif'}/>
                      </div>
                      <h2 className="text-2xl font-bold mb-2">{activeTournament ? activeTournament.name : appConfig.competitionName}</h2>
                      <div className="flex items-center gap-2 flex-wrap justify-center">
                          <button onClick={() => setCurrentTournamentId(null)} className="md:hidden text-xs bg-white/20 px-2 py-1 rounded text-white hover:bg-white/30">เปลี่ยนรายการ</button>
                      </div>
                  </div>
                  
                  {announcements.length > 0 && !isLoadingData && (
                    <div className="bg-white/10 border border-white/20 rounded-xl p-3 backdrop-blur-md flex items-center gap-3 mb-6 relative group">
                        <div className="shrink-0"><Bell className="w-5 h-5 text-yellow-400 animate-pulse" /></div>
                        <div className="flex-1 overflow-hidden relative h-12 flex items-center">
                            {announcements.map((text, idx) => (
                                <p key={idx} className={`text-xs text-slate-200 leading-relaxed absolute w-full transition-opacity duration-500 ${idx === announcementIndex ? 'opacity-100 z-10' : 'opacity-0 z-0'}`}>
                                    {text}
                                </p>
                            ))}
                        </div>
                        {announcements.length > 1 && (
                             <div className="flex items-center gap-1">
                                <button onClick={() => setAnnouncementIndex(prev => (prev - 1 + announcements.length) % announcements.length)} className="p-1 hover:bg-white/20 rounded-full text-slate-300 hover:text-white transition"><ChevronLeft className="w-4 h-4" /></button>
                                <button onClick={() => setAnnouncementIndex(prev => (prev + 1) % announcements.length)} className="p-1 hover:bg-white/20 rounded-full text-slate-300 hover:text-white transition"><ChevronRight className="w-4 h-4" /></button>
                             </div>
                        )}
                    </div>
                  )}
              </div>
          </div>

          <div className="max-w-4xl mx-auto px-4 -mt-8 relative z-20 space-y-6">
              
              {/* Location Card */}
              <div className="bg-white rounded-xl shadow-lg p-4 flex items-center justify-between animate-in slide-in-from-bottom-2">
                  <div>
                    <h3 className="font-bold text-slate-800 flex items-center gap-2 text-sm sm:text-base">
                      <MapPin className="w-5 h-5 text-indigo-500" />
                      สถานที่: {effectiveSettings.locationName || 'ไม่ระบุ'}
                    </h3>
                    {distanceToVenue && (
                      <p className="text-xs text-slate-500 ml-7 mt-1">
                        <span className="inline-block w-2 h-2 rounded-full bg-blue-500 mr-1 animate-pulse"></span>
                        ห่างจากคุณ {distanceToVenue} กม.
                      </p>
                    )}
                  </div>
                  {effectiveSettings.locationLink && (
                      <a
                        href={effectiveSettings.locationLink}
                        target="_blank"
                        rel="noreferrer"
                        className="bg-blue-600 text-white px-4 py-2 rounded-full text-xs font-bold flex items-center gap-1 shadow-sm hover:bg-blue-700 transition shrink-0"
                      >
                        <Navigation className="w-3 h-3" /> นำทาง
                      </a>
                  )}
              </div>

              {/* Fundraising / Objective Card */}
              {(objectiveData.goal > 0 || objectiveData.title) && (
                  <div className="bg-white rounded-2xl shadow-lg border border-slate-100 overflow-hidden animate-in slide-in-from-bottom-2">
                      <div className="p-0 relative">
                          {hasComparisonImages ? (
                              <div className="relative h-64 bg-slate-900 group">
                                  {objectiveData.images.filter(i => i.type === activeImageMode).map((img, idx) => (
                                      <img key={idx} src={getDisplayUrl(img.url)} className="w-full h-full object-cover animate-in fade-in" />
                                  ))}
                                  <div className="absolute top-4 right-4 flex bg-black/50 backdrop-blur rounded-lg p-1">
                                      <button onClick={() => setActiveImageMode('before')} className={`px-3 py-1 rounded-md text-xs font-bold transition ${activeImageMode === 'before' ? 'bg-red-500 text-white' : 'text-slate-300 hover:text-white'}`}>Before</button>
                                      <button onClick={() => setActiveImageMode('after')} className={`px-3 py-1 rounded-md text-xs font-bold transition ${activeImageMode === 'after' ? 'bg-green-500 text-white' : 'text-slate-300 hover:text-white'}`}>After</button>
                                  </div>
                              </div>
                          ) : (
                              objectiveData.images.length > 0 && <img src={getDisplayUrl(objectiveData.images[0].url)} className="w-full h-48 object-cover" />
                          )}
                          <div className="p-6">
                              <div className="flex justify-between items-start mb-2 flex-wrap gap-2">
                                  <h3 className="font-bold text-xl text-slate-800">{objectiveData.title || "โครงการพัฒนาโรงเรียน"}</h3>
                                  <div className="flex gap-2">
                                      {objectiveData.docUrl && (
                                          <a href={objectiveData.docUrl} target="_blank" className="bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 px-3 py-2 rounded-full font-bold text-xs shadow-sm transition flex items-center gap-1">
                                              <Download className="w-3 h-3" /> รายละเอียด
                                          </a>
                                      )}
                                      <button onClick={() => setIsDonationOpen(true)} className="bg-pink-600 hover:bg-pink-700 text-white px-4 py-2 rounded-full font-bold text-sm shadow-md transition flex items-center gap-1 active:scale-95">
                                          <Heart className="w-4 h-4 fill-white" /> ร่วมบริจาค
                                      </button>
                                  </div>
                              </div>
                              <p className="text-slate-500 text-sm mb-4 line-clamp-2">{objectiveData.description}</p>
                              
                              {objectiveData.goal > 0 && (
                                  <div className="space-y-2">
                                      <div className="flex justify-between text-sm mb-1">
                                          <span className="font-bold text-indigo-600">{fundraisingProgress.toFixed(1)}%</span>
                                          <span className="text-slate-500">เป้าหมาย: {objectiveData.goal.toLocaleString()} บาท</span>
                                      </div>
                                      <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                                          <div className="h-full bg-gradient-to-r from-pink-500 to-indigo-500 transition-all duration-1000" style={{ width: `${fundraisingProgress}%` }}></div>
                                      </div>
                                      <div className="flex justify-between items-center text-xs pt-2">
                                          <div className="flex gap-4">
                                              <div>
                                                  <span className="text-slate-400 block text-[10px]">รายรับรวม</span>
                                                  <span className="font-bold text-green-600">+{totalIncome.toLocaleString()}</span>
                                              </div>
                                              <button onClick={() => setIsDonorListOpen(true)} className="text-indigo-600 hover:underline flex items-center gap-1">
                                                  <Users className="w-3 h-3"/> ดูรายชื่อผู้บริจาค
                                              </button>
                                          </div>
                                          <div className="text-right">
                                              <span className="text-slate-500 block text-[10px]">ยอดสุทธิ</span>
                                              <span className="font-bold text-slate-800 text-sm">{netRaised.toLocaleString()}</span>
                                          </div>
                                      </div>
                                  </div>
                              )}
                          </div>
                      </div>
                  </div>
              )}

              {/* LIVE MATCHES SCROLLER */}
              {liveMatches.length > 0 && (
                  <div className="space-y-2 animate-in slide-in-from-right-4">
                      <div className="flex items-center gap-2 px-1">
                          <span className="relative flex h-3 w-3"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span><span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span></span>
                          <h3 className="font-bold text-slate-800">ถ่ายทอดสด (LIVE)</h3>
                      </div>
                      <div className="flex gap-4 overflow-x-auto pb-4 -mx-4 px-4 snap-x scrollbar-hide">
                          {liveMatches.map(m => {
                              const tA = resolveTeam(m.teamA);
                              const tB = resolveTeam(m.teamB);
                              return (
                                  <div key={m.id} onClick={() => { setInitialMatchId(m.id); setCurrentView('schedule'); }} className="min-w-[280px] bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden cursor-pointer hover:shadow-md transition snap-center">
                                      <div className="relative h-32 bg-black">
                                          {m.livestreamCover ? <img src={m.livestreamCover} className="w-full h-full object-cover opacity-80" /> : <div className="w-full h-full flex items-center justify-center text-white/20"><Video className="w-12 h-12"/></div>}
                                          <div className="absolute inset-0 flex items-center justify-center"><div className="bg-red-600 text-white px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 shadow-lg"><Play className="w-3 h-3 fill-white" /> ดูถ่ายทอดสด</div></div>
                                      </div>
                                      <div className="p-3">
                                          <div className="flex justify-between items-center text-sm font-bold text-slate-800">
                                              <span className="truncate max-w-[100px]">{tA.name}</span>
                                              <span className="text-slate-400 text-xs">VS</span>
                                              <span className="truncate max-w-[100px] text-right">{tB.name}</span>
                                          </div>
                                      </div>
                                  </div>
                              );
                          })}
                      </div>
                  </div>
              )}

              {/* Penalty Mode / Match Setup */}
              {activeTournament?.type === 'Penalty' && (
                  <div className="animate-in slide-in-from-bottom-3">
                      <MatchSetup 
                          onStart={handleStartMatchRequest} 
                          availableTeams={activeTeams} 
                          onOpenSettings={() => setIsSettingsOpen(true)}
                          isLoadingData={isLoadingData}
                      />
                  </div>
              )}

              {/* My Teams Section */}
              {currentUser && myTeams.length > 0 && (
                  <div className="bg-white rounded-2xl shadow-lg border border-slate-100 p-4 animate-in slide-in-from-bottom-2">
                      <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2"><User className="w-5 h-5 text-indigo-600" /> ทีมของคุณ</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {myTeams.map(t => (
                              <div key={t.id} className="flex items-center justify-between p-3 rounded-xl border border-slate-200 hover:border-indigo-300 transition bg-slate-50">
                                  <div className="flex items-center gap-3">
                                      {t.logoUrl ? <img src={t.logoUrl} className="w-10 h-10 rounded-lg bg-white object-contain" /> : <div className="w-10 h-10 rounded-lg bg-white flex items-center justify-center font-bold text-slate-400">{t.shortName}</div>}
                                      <div>
                                          <div className="font-bold text-slate-800">{t.name}</div>
                                          <div className={`text-xs font-bold ${t.status === 'Approved' ? 'text-green-600' : t.status === 'Rejected' ? 'text-red-600' : 'text-yellow-600'}`}>{t.status || 'Pending'}</div>
                                      </div>
                                  </div>
                                  <button onClick={() => handleEditMyTeam(t)} className="text-xs bg-white border border-slate-300 px-3 py-1.5 rounded-lg hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200 font-bold flex items-center gap-1 transition">
                                      <Edit3 className="w-3 h-3" /> แก้ไข
                                  </button>
                              </div>
                          ))}
                      </div>
                  </div>
              )}

              {/* Prize Summary Card */}
              {prizes.length > 0 && (
                  <div className="bg-white rounded-2xl shadow-lg border border-slate-100 overflow-hidden">
                      <div className="bg-gradient-to-r from-yellow-500 to-amber-500 p-4 text-white">
                          <h3 className="font-bold text-lg flex items-center gap-2"><Trophy className="w-6 h-6 text-white" /> รางวัลการแข่งขัน</h3>
                      </div>
                      <div className="p-0">
                          {prizes.map((prize, idx) => (
                              <div key={idx} className="flex items-center justify-between p-4 border-b border-slate-100 last:border-0 hover:bg-slate-50 transition">
                                  <div className="flex items-center gap-4">
                                      <div className={`w-10 h-10 rounded-full flex items-center justify-center bg-yellow-100 text-yellow-600 font-bold`}>
                                          {prize.rankLabel.replace(/[^0-9]/g, '') || (idx + 1)}
                                      </div>
                                      <div>
                                          <div className="font-bold text-slate-800">{prize.rankLabel}</div>
                                          {prize.description && <div className="text-xs text-slate-500">{prize.description}</div>}
                                      </div>
                                  </div>
                                  <div className="font-bold text-indigo-600 text-lg">{prize.amount}</div>
                              </div>
                          ))}
                      </div>
                  </div>
              )}

              {/* Recent Results (Horizontal Scroll) */}
              {recentFinishedMatches.length > 0 && (
                  <div className="space-y-3 animate-in slide-in-from-right-4">
                      <div className="flex items-center justify-between px-1">
                          <div className="flex items-center gap-2">
                              <ListChecks className="w-5 h-5 text-green-600" />
                              <h3 className="font-bold text-slate-800">ผลการแข่งขันล่าสุด</h3>
                          </div>
                          <button onClick={() => setCurrentView('schedule')} className="text-xs text-indigo-500 font-bold hover:underline">ดูทั้งหมด</button>
                      </div>
                      <div className="flex gap-4 overflow-x-auto pb-4 -mx-4 px-4 snap-x scrollbar-hide">
                          {recentFinishedMatches.map(m => {
                              const tA = resolveTeam(m.teamA);
                              const tB = resolveTeam(m.teamB);
                              return (
                                  <div 
                                      key={m.id} 
                                      onClick={() => { setInitialMatchId(m.id); setCurrentView('schedule'); }} 
                                      className="min-w-[260px] bg-white rounded-xl shadow-sm border border-slate-200 p-3 snap-center cursor-pointer hover:shadow-md transition active:scale-95 flex flex-col justify-between"
                                  >
                                      <div className="flex justify-between items-center text-[10px] text-slate-400 mb-2 border-b border-slate-50 pb-2">
                                          <span>{new Date(m.date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short'})}</span>
                                          <span className="bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-bold">{m.roundLabel?.split(':')[0] || 'Match'}</span>
                                      </div>
                                      <div className="flex items-center justify-between gap-3">
                                          <div className="flex flex-col items-center w-1/3 gap-1">
                                              {tA.logoUrl ? <img src={tA.logoUrl} className="w-10 h-10 object-contain rounded-lg" /> : <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center font-bold text-slate-400 text-xs">A</div>}
                                              <span className="text-xs font-bold text-slate-800 truncate w-full text-center">{tA.name}</span>
                                          </div>
                                          <div className="flex flex-col items-center">
                                              <span className="text-xl font-black text-slate-800 bg-slate-50 px-3 py-1 rounded-lg border border-slate-100 tracking-widest">{m.scoreA}-{m.scoreB}</span>
                                              {m.winner && <span className="text-[10px] text-green-600 font-bold mt-1">FT</span>}
                                          </div>
                                          <div className="flex flex-col items-center w-1/3 gap-1">
                                              {tB.logoUrl ? <img src={tB.logoUrl} className="w-10 h-10 object-contain rounded-lg" /> : <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center font-bold text-slate-400 text-xs">B</div>}
                                              <span className="text-xs font-bold text-slate-800 truncate w-full text-center">{tB.name}</span>
                                          </div>
                                      </div>
                                  </div>
                              );
                          })}
                      </div>
                  </div>
              )}

              {/* News Feed */}
              <div className="pt-2">
                  <div className="flex items-center justify-between mb-4">
                      <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                          <Megaphone className="w-5 h-5 text-indigo-600" /> ข่าวสารและประกาศ
                      </h3>
                  </div>
                  <NewsFeed 
                      news={newsItems} 
                      isLoading={isLoadingData} 
                      initialNewsId={initialNewsId} 
                      currentTournamentId={currentTournamentId} 
                  />
              </div>
          </div>
        </div>
      )}

      {showBottomNav && <BottomNav />}
    </div>
  );
}

export default App;