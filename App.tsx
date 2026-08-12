
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { KickResult, MatchState, Kick, Team, Player, AppSettings, School, NewsItem, Match, UserProfile, Tournament, MatchEvent, TournamentConfig, TournamentPrize, Donation, Prediction } from './types';
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
import SchoolChooserDialog from './components/SchoolChooserDialog';
import TeamListDialog, { TeamListKind } from './components/TeamListDialog';
import ProgrammePage from './components/ProgrammePage';
import InstallPrompt from './components/InstallPrompt';
import NotificationBell from './components/NotificationBell';
import NotificationCenter from './components/NotificationCenter';
import { useNotifications } from './hooks/useNotifications';
import { useSWUpdate, usePWABadge, clearPWABadge, canInstallApp, promptInstall } from './hooks/usePWA';
import PinDialog from './components/PinDialog'; 
import ScheduleList from './components/ScheduleList'; 
import NewsFeed from './components/NewsFeed'; 
import TournamentSelector from './components/TournamentSelector';
import DonationDialog from './components/DonationDialog';
import SupportDialog from './components/SupportDialog';
import TeamEditModal from './components/TeamEditModal';
import ContestGallery from './components/ContestGallery';
import LiveWall from './components/LiveWall';
import SchoolPortal from './components/SchoolPortal';
import LoginPage from './components/LoginPage';
import SystemDialogHost from './components/SystemDialogHost';
import TeamOverviewDialog from './components/TeamOverviewDialog';
import { ToastContainer, ToastMessage, ToastType } from './components/Toast';
import { fetchDatabase, saveMatchToSheet, authenticateUser, saveMatchEventsToSheet, updateMyTeam, saveSettings, downloadSchoolAccessCodes } from './services/sheetService';
import { initializeLiff, sharePrizeSummary, getLineIdToken } from './services/liffService';
import { checkSession, logout as authLogout } from './services/authService';
import { setUnauthorizedHandler, clearToken, getToken } from './services/apiConfig';
import { RefreshCw, Clipboard, Trophy, Settings, UserPlus, LayoutList, BarChart3, Lock, Home, CheckCircle2, XCircle, ShieldAlert, MapPin, Loader2, Undo2, Edit2, Trash2, AlertTriangle, Bell, CalendarDays, WifiOff, ListChecks, ChevronRight, Share2, Megaphone, Video, Play, LogOut, User, LogIn, Heart, Navigation, Target, ChevronLeft, ArrowLeftRight, Edit3, ArrowLeft, Star, Coins, DollarSign, FileText, Download, Users, Camera, Gift, Monitor, School as SchoolIcon, ClipboardPenLine, Eye, ArrowUp, MoreVertical } from 'lucide-react';
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
  objectiveImageUrl: "",
  liffId: "",
  showPenaltyModeCard: true,
  showSupportButton: true,
};

const settingEnabled = (value: boolean | string | undefined, fallback = true): boolean => {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  return !['0', 'false', 'off', 'no'].includes(String(value).toLowerCase());
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

// Beautiful Loading Component
const LoadingScreen = () => {
  return (
    <div className="fixed inset-0 z-[9999] bg-white flex flex-col items-center justify-center animate-in fade-in duration-500">
      <div className="relative mb-8">
        <div className="absolute inset-0 bg-indigo-500 rounded-full blur-xl opacity-20 animate-pulse"></div>
        <div className="relative w-24 h-24 bg-white rounded-full shadow-xl flex items-center justify-center p-4 border border-slate-100">
           <img 
             src="https://raw.githubusercontent.com/noppharutlubbuangam-dot/vichakan/refs/heads/main/cup.gif" 
             className="w-full h-full object-contain"
             alt="Logo"
           />
        </div>
      </div>
      <h1 className="text-2xl font-black text-slate-800 tracking-tight mb-2">Penalty Pro <span className="text-indigo-600">Arena</span></h1>
      <div className="flex items-center gap-2 text-slate-400 text-sm font-medium">
        <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
        <span>กำลังโหลดข้อมูลการแข่งขัน...</span>
      </div>
      
      <div className="absolute bottom-10 text-xs text-slate-300 font-mono">
        Powered by Google Gemini
      </div>
    </div>
  );
};

export default function App() {
  const [currentView, setCurrentView] = useState<string>('home');
  const [viewKey, setViewKey] = useState<number>(0); 
  const [authReason, setAuthReason] = useState<string>('');
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  // ถามโรงเรียนต้นสังกัดครั้งแรกที่เข้าระบบ (ส่วนใหญ่คือคนที่เปิดผ่าน LINE)
  const [askSchool, setAskSchool] = useState(false);
  // เจาะดูรายชื่อทีมจากตัวเลขบนการ์ดภาพรวม (ชำระค่าสมัครแล้ว / ส่งรายชื่อแล้ว)
  const [teamListKind, setTeamListKind] = useState<TeamListKind | null>(null);
  const [notifOpen, setNotifOpen] = useState(false);
  // เมนูรวมปุ่มบนแถบหัวสำหรับจอเล็ก
  const [moreOpen, setMoreOpen] = useState(false);
  // ประกาศฉบับเต็มที่กำลังเปิดอ่าน (ประกาศยาวถูกตัดในแถบเลื่อน)
  const [readingAnnouncement, setReadingAnnouncement] = useState<string | null>(null);
  // เก็บฟังก์ชันสั่งใช้เวอร์ชันใหม่ไว้ผูกกับปุ่มในแถบแจ้งเตือน
  const [pendingUpdate, setPendingUpdate] = useState<(() => void) | null>(null);
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
  const [predictions, setPredictions] = useState<Prediction[]>([]);

  const [isLoadingData, setIsLoadingData] = useState(true);
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
  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean; title: string; message: string; onConfirm: () => void; isDangerous?: boolean; confirmText?: string; } | null>(null);
  const [userLocation, setUserLocation] = useState<{lat: number, lng: number} | null>(null);
  const [distanceToVenue, setDistanceToVenue] = useState<string | null>(null);
  const [announcementIndex, setAnnouncementIndex] = useState(0);
  const [isDonationOpen, setIsDonationOpen] = useState(false);
  const [isDonorListOpen, setIsDonorListOpen] = useState(false); 
  const [activeImageMode, setActiveImageMode] = useState<'before' | 'after'>('before');
  const [isSupportOpen, setIsSupportOpen] = useState(false);
  
  // Team Edit Modal State
  const [isTeamEditModalOpen, setIsTeamEditModalOpen] = useState(false);
  const [teamToEdit, setTeamToEdit] = useState<{team: Team, players: Player[]} | null>(null);
  const [selectedHomeTeam, setSelectedHomeTeam] = useState<Team | null>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);

  const activeTeams = currentTournamentId ? availableTeams.filter(t => t.tournamentId === currentTournamentId || (!t.tournamentId && currentTournamentId === 'default')) : [];
  const activePlayers = currentTournamentId ? availablePlayers.filter(p => p.tournamentId === currentTournamentId || (!p.tournamentId && currentTournamentId === 'default')) : [];
  const activeMatches = currentTournamentId ? matchesLog.filter(m => m.tournamentId === currentTournamentId || (!m.tournamentId && currentTournamentId === 'default')) : [];
  const activeTournament = tournaments.find(t => t.id === currentTournamentId);
  const activeDonations = currentTournamentId ? donations.filter(d => d.tournamentId === currentTournamentId) : [];
  const activePredictions = currentTournamentId ? predictions.filter(p => p.tournamentId === currentTournamentId) : [];
  const participatingTeams = useMemo(
    () => activeTeams.filter(team => team.status !== 'Rejected'),
    [activeTeams],
  );
  const activeGroupNames = useMemo(
    () => Array.from(new Set(participatingTeams.map(team => team.group?.trim()).filter((group): group is string => Boolean(group)))).sort(),
    [participatingTeams],
  );
  const rosterStats = useMemo(() => {
    const participatingIds = new Set(participatingTeams.map(team => team.id));
    const registeredPlayers = activePlayers.filter(player => participatingIds.has(player.teamId));
    return {
      teams: new Set(registeredPlayers.map(player => player.teamId)).size,
      players: registeredPlayers.length,
      // ทีมที่เจ้าหน้าที่ตรวจสลิปแล้วว่าจ่ายจริง (ไม่ใช่แค่แนบสลิปมา)
      paid: participatingTeams.filter(team => team.isPaid).length,
    };
  }, [activePlayers, participatingTeams]);

  const getTournamentConfig = (): TournamentConfig => { try { return activeTournament?.config ? JSON.parse(activeTournament.config) : {}; } catch(e) { return {}; } };
  const tConfig = getTournamentConfig();
  
  const effectiveSettings: AppSettings = {
      ...appConfig,
      competitionName: activeTournament ? activeTournament.name : appConfig.competitionName,
      bankName: tConfig.bankName || appConfig.bankName,
      bankAccount: tConfig.bankAccount || appConfig.bankAccount,
      accountName: tConfig.accountName || appConfig.accountName,
      locationName: tConfig.locationName || appConfig.locationName,
      locationLink: tConfig.locationLink || appConfig.locationLink,
      locationLat: tConfig.locationLat || appConfig.locationLat,
      locationLng: tConfig.locationLng || appConfig.locationLng,
  };

  const registrationDeadline = tConfig.registrationDeadline;
  const registrationEnabled = tConfig.registrationEnabled !== false;
  const teamEditingEnabled = tConfig.teamEditingEnabled !== false;
  const teamEditDeadline = tConfig.teamEditDeadline;
  const maxTeams = tConfig.maxTeams || 0;
  const currentTeamCount = activeTeams.filter(t => t.status !== 'Rejected').length;
  const isRegistrationFull = maxTeams > 0 && currentTeamCount >= maxTeams;
  const deadlineHasPassed = (value?: string) => {
      if (!value) return false;
      const timestamp = new Date(value).getTime();
      return !Number.isNaN(timestamp) && timestamp < Date.now();
  };
  const formatDeadline = (value?: string) => {
      if (!value) return 'ไม่กำหนดวันปิด';
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return 'ไม่กำหนดวันปิด';
      return date.toLocaleString('th-TH', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };
  const isRegistrationOpen = registrationEnabled && !deadlineHasPassed(registrationDeadline) && !isRegistrationFull;
  const isTeamEditingOpen = teamEditingEnabled && !deadlineHasPassed(teamEditDeadline);

  // Objective Data
  const objectiveData = tConfig.objective?.isEnabled ? {
      title: tConfig.objective.title,
      description: tConfig.objective.description,
      goal: tConfig.objective.goal,
      images: tConfig.objective.images || [],
      docUrl: tConfig.objective.docUrl
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
  
  const totalPrizeAmount = prizes.reduce((sum, p) => {
      const num = parseInt(p.amount.replace(/,/g, ''));
      return isNaN(num) ? sum : sum + num;
  }, 0);
  
  const totalIncome = verifiedDonations + incomeFromFees;
  const netRaised = Math.max(0, totalIncome - totalPrizeAmount);
  const goal = objectiveData.goal || 0;
  const fundraisingProgress = goal > 0 ? Math.min(100, (netRaised / goal) * 100) : 0;

  useEffect(() => {
    // 1. Load Data First
    const init = async () => {
        setIsLoadingData(true);
        try {
            // Initial load - can use cache
            const data = await fetchDatabase(false);
            let configData = DEFAULT_SETTINGS;
            
            if (data) {
                setAvailableTeams(data.teams);
                setAvailablePlayers(data.players);
                setMatchesLog(data.matches || []);
                configData = { ...DEFAULT_SETTINGS, ...data.config };
                setAppConfig(configData); 
                setSchools(data.schools || []);
                setNewsItems(data.news || []);
                setTournaments(data.tournaments || []);
                setDonations(data.donations || []);
                setPredictions(data.predictions || []);
                
                // Logic for tournament ID selection
                if (!currentTournamentId) { 
                    const savedTId = localStorage.getItem('current_tournament_id'); 
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

            // 2. Initialize LIFF with ID from config
            if (configData.liffId) {
                await initializeLiff(configData.liffId);
            }

            // 3. Check Session
            const liffUser = await checkSession(); 
            if (liffUser) {
                try {
                    if (liffUser.type === 'line') {
                        const idToken = getLineIdToken();
                        // server ไม่รับ lineUserId ดิบ ๆ อีกแล้ว (ปลอมได้) ถ้าไม่มี
                        // idToken ก็ใช้โปรไฟล์จาก LIFF แสดงผลไปก่อน แต่จะไม่มีสิทธิ์ใด ๆ
                        const backendUser = idToken
                            ? await authenticateUser({ authType: 'line', idToken })
                            : null;
                        if (backendUser) {
                            setCurrentUser(backendUser);
                            if (backendUser.role === 'admin') setIsAdmin(true);
                            // ยังไม่เคยเลือกโรงเรียน -> ถามก่อนใช้งาน
                            if (backendUser.needsSchool) setAskSchool(true);
                        } else { setCurrentUser(liffUser); }
                    } else if (liffUser.role) { setCurrentUser(liffUser); if (liffUser.role === 'admin') setIsAdmin(true); } else { setCurrentUser(liffUser); }
                } catch (e) { console.warn("Backend Auth Sync Failed", e); setCurrentUser(liffUser); }
            }

        } catch (e: any) { 
            console.warn("Database/Init Error", e); 
            setConnectionError(e.message); 
            showNotification("เชื่อมต่อไม่ได้", e.message, 'error'); 
        } finally { 
            setIsLoadingData(false); 
        }
    };

    init();

  }, []); // Run once

  useEffect(() => { if (userLocation && effectiveSettings.locationLat && effectiveSettings.locationLng) { const dist = calculateDistance(userLocation.lat, userLocation.lng, effectiveSettings.locationLat, effectiveSettings.locationLng); setDistanceToVenue(dist); } }, [userLocation, effectiveSettings.locationLat, effectiveSettings.locationLng]);
  useEffect(() => { if (announcements.length > 1) { const interval = setInterval(() => setAnnouncementIndex(prev => (prev + 1) % announcements.length), 5000); return () => clearInterval(interval); } }, [announcements.length]);
  useEffect(() => {
    const updateScrollButton = () => setShowScrollTop(window.scrollY > 500);
    updateScrollButton();
    window.addEventListener('scroll', updateScrollButton, { passive: true });
    return () => window.removeEventListener('scroll', updateScrollButton);
  }, []);
  useEffect(() => { 
      if (!isLoadingData && availableTeams.length > 0) { 
          const params = new URLSearchParams(window.location.search); 
          const view = params.get('view'); 
          const id = params.get('id'); 
          const teamId = params.get('teamId'); 
          const tournamentIdParam = params.get('tournamentId');

          if (tournamentIdParam && tournamentIdParam !== currentTournamentId) {
              setCurrentTournamentId(tournamentIdParam);
          } else if (view === 'match_detail' && id) { 
              setInitialMatchId(id); 
              goTo('schedule'); 
          } else if (view === 'news' && id) { 
              setInitialNewsId(id); 
              goTo('home'); 
          } else if (view === 'school') {
              goTo('school');
          } else if (view === 'schedule') { 
              goTo('schedule'); 
          } else if (view === 'standings') { 
              goTo('standings'); 
          } else if (view === 'tournament') { 
              goTo('tournament'); 
          } else if (view === 'admin' && teamId) { 
              setInitialTeamId(teamId); 
              if (!isAdmin) { 
                  setIsLoginOpen(true); 
                  goTo('admin'); 
              } else { 
                  goTo('admin'); 
              } 
          } 
      } 
  }, [isLoadingData, availableTeams.length, isAdmin]);

  /**
   * เปลี่ยนหน้าพร้อมเปลี่ยน URL — แต่ละหน้าจึงมี URL ของตัวเองและรีเฟรชได้
   *
   * เดิมทุกหน้าคือ URL เดียวกัน (state ล้วน) กด F5 แล้วเด้งกลับหน้าแรกเสมอ
   * และแชร์ลิงก์หน้าใดหน้าหนึ่งไม่ได้ — .htaccess ทำ SPA fallback ไว้แล้ว
   * ทุก path จึงเสิร์ฟ index.html ได้โดยไม่ 404
   */
  const goTo = (view: string, replace = false) => {
    setCurrentView(view);
    const path = view === 'home' ? '/' : `/${view}`;
    const url = path + window.location.search.replace(/[?&]view=[^&]*/g, '').replace(/^&/, '?');
    if (window.location.pathname !== path) {
      replace ? window.history.replaceState({ view }, '', url)
              : window.history.pushState({ view }, '', url);
    }
  };

  // ปุ่มย้อนกลับของเบราว์เซอร์/มือถือต้องพากลับหน้าก่อนหน้า ไม่ใช่ออกจากแอป
  useEffect(() => {
    const onPop = () => {
      const seg = window.location.pathname.replace(/^\/+|\/+$/g, '');
      setCurrentView(seg === '' ? 'home' : seg);
    };
    window.addEventListener('popstate', onPop);
    onPop();
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  /**
   * session หมดอายุ = บอกให้รู้ทันที ไม่ใช่ปล่อยให้กดบันทึกแล้วเงียบ
   *
   * ของเดิม UI ถือสถานะ isAdmin ของตัวเองแยกจาก token จริง พอ token หมดอายุ
   * ปุ่มยังกดได้แต่ server ตอบ 401 แล้วข้อมูล "หายไปเฉย ๆ" โดยไม่มีอะไรแจ้ง
   */
  useEffect(() => {
    setUnauthorizedHandler((msg) => {
      setIsAdmin(false);
      setAuthReason(`${msg} — กรุณาเข้าสู่ระบบใหม่ แล้วทำรายการเดิมอีกครั้ง`);
      showNotification('เซสชันหมดอายุ', 'กรุณาเข้าสู่ระบบใหม่', 'error');
      // ส่งไปหน้า /login ที่มี URL จริง — รีเฟรชแล้วยังอยู่ ต่างจากโมดัลที่หายไป
      goTo('login');
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  const handleAdminLogin = (user: UserProfile) => {
    setCurrentUser(user);
    const admin = user.role === 'admin' || user.role === 'staff';
    setIsAdmin(admin);
    // ผู้ใช้ทั่วไปที่เข้าทางหน้า /login ก็ต้องถูกถามโรงเรียนเหมือนกัน
    // (server ไม่ตั้ง needsSchool ให้แอดมิน/เจ้าหน้าที่อยู่แล้ว)
    if (user.needsSchool) setAskSchool(true);
    localStorage.setItem('penalty_pro_user', JSON.stringify(user));
    showNotification('เข้าสู่ระบบแล้ว', `สวัสดีคุณ ${user.displayName}`, 'success');
    if (!admin) {
      showNotification('สิทธิ์จำกัด',
        'บัญชีนี้ไม่มีสิทธิ์ผู้ดูแล จะเข้าถึงหน้าจัดการไม่ได้', 'warning');
    }
  };

  const showNotification = useCallback((title: string, message: string = '', type: ToastType = 'success') => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    setToasts(prev => [...prev, { id, title, message, type }]);
  }, []);

  // ── PWA + กล่องแจ้งเตือน ────────────────────────────────────────────
  // กล่องทำงานเฉพาะเมื่อล็อกอินแล้ว — การแจ้งเตือนผูกกับบัญชี ไม่มีบัญชีก็ไม่มีอะไรให้ดึง
  const notifications = useNotifications(!!currentUser, (n) => {
    // เด้งให้เห็นทันทีแม้ผู้ใช้เปิดแอปค้างไว้และไม่ได้จ้องกระดิ่ง
    showNotification(n.title, n.body ?? '', 'info');
  });
  usePWABadge(notifications.unreadCount);

  // มีเวอร์ชันใหม่รออยู่ → บอกผู้ใช้ให้กดโหลดใหม่ ไม่รีโหลดเองเพราะอาจกำลังกรอกข้อมูลค้างอยู่
  const handleSWUpdate = useCallback((apply: () => void) => {
    setPendingUpdate(() => apply);
  }, []);
  useSWUpdate(handleSWUpdate);

  const requestLocationForNavigation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      position => setUserLocation({ lat: position.coords.latitude, lng: position.coords.longitude }),
      error => {
        // การนำทางยังเปิดได้แม้ผู้ใช้ไม่อนุญาตตำแหน่ง เพียงไม่แสดงระยะห่าง
        console.info('Location permission was not granted:', error.code);
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 },
    );
  };
  const removeToast = useCallback((id: string) => setToasts(prev => prev.filter(t => t.id !== id)), []);

  const setPenaltyCardVisibility = async (visible: boolean) => {
    const previous = appConfig.showPenaltyModeCard;
    setAppConfig(prev => ({ ...prev, showPenaltyModeCard: visible }));
    try {
      await saveSettings({ showPenaltyModeCard: visible });
      showNotification(
        visible ? 'แสดงการ์ดแล้ว' : 'ซ่อนการ์ดแล้ว',
        visible ? 'ผู้เข้าชมจะเห็นโหมดการดวลจุดโทษบนหน้าหลัก' : 'การ์ดโหมดการดวลจุดโทษถูกซ่อนจากผู้เข้าชมแล้ว',
        'success',
      );
    } catch (error) {
      setAppConfig(prev => ({ ...prev, showPenaltyModeCard: previous }));
      showNotification('บันทึกไม่สำเร็จ', 'ไม่สามารถเปลี่ยนการแสดงการ์ดได้ กรุณาลองใหม่', 'error');
    }
  };

  // Modified loadData to accept silent refresh
  const loadData = async (forceRefresh: boolean = false, isSilent: boolean = false) => {
    if (!isSilent) setIsLoadingData(true);
    setConnectionError(null);
    try {
      const data = await fetchDatabase(forceRefresh);
      if (data) {
        setAvailableTeams(data.teams);
        setAvailablePlayers(data.players);
        setMatchesLog(data.matches || []);
        setAppConfig({ ...DEFAULT_SETTINGS, ...data.config }); 
        setSchools(data.schools || []);
        setNewsItems(data.news || []);
        setTournaments(data.tournaments || []);
        setDonations(data.donations || []);
        setPredictions(data.predictions || []);
      }
    } catch (e: any) { console.warn("Database Error", e); setConnectionError(e.message); showNotification("เชื่อมต่อไม่ได้", e.message, 'error'); } finally { setIsLoadingData(false); }
  };

  const handleRegisterClick = () => {
    if (!registrationEnabled || deadlineHasPassed(registrationDeadline)) { showNotification("ปิดรับสมัครแล้ว", registrationDeadline ? `ปิดรับสมัครเมื่อ ${formatDeadline(registrationDeadline)}` : "ผู้ดูแลระบบปิดการรับสมัครแล้ว", "info"); return; }
    if (isRegistrationFull) { showNotification("ขออภัย", "การลงทะเบียนเต็มจำนวนแล้ว", "info"); return; }
    setEditingTeamData(null);
    setIsUserLoginOpen(false);
    goTo('register');
  };

  const handleDownloadSchoolCodes = async () => {
    if (!currentTournamentId) {
      showNotification('ยังไม่มีรายการแข่งขัน', 'กรุณาเลือกรายการแข่งขันก่อน', 'warning');
      return;
    }
    try {
      const result = await downloadSchoolAccessCodes(currentTournamentId);
      const csvCell = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
      const rows = result.schools.map(s => [
        csvCell(s.schoolName),
        csvCell(s.accessCode || 'ยังไม่มีรหัส/ต้องออกรหัสใหม่'),
      ].join(','));
      const csv = ['โรงเรียน,รหัสโรงเรียน', ...rows].join('\r\n');
      const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `รหัสโรงเรียน-${(result.tournamentName || 'การแข่งขัน').replace(/[\\/:*?"<>|]/g, '')}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      const missing = result.schools.filter(s => !s.accessCode).length;
      showNotification(
        'ดาวน์โหลดรหัสโรงเรียนแล้ว',
        missing > 0
          ? `${result.schools.length} โรงเรียน · ${missing} โรงเรียนยังไม่มีรหัสหรือเป็นรหัสรุ่นเก่า`
          : `${result.schools.length} โรงเรียน`,
        missing > 0 ? 'warning' : 'success',
      );
    } catch (error: any) {
      showNotification('ดาวน์โหลดไม่สำเร็จ', error?.message || 'กรุณาลองใหม่อีกครั้ง', 'error');
    }
  };
  
  const handleEditMyTeam = (team: Team) => { 
      if (!isAdmin && !isTeamEditingOpen) {
          showNotification("ปิดแก้ไขข้อมูลทีมแล้ว", teamEditDeadline ? `ปิดแก้ไขเมื่อ ${formatDeadline(teamEditDeadline)}` : "ผู้ดูแลระบบปิดการแก้ไขรายชื่อแล้ว", "warning");
          return;
      }
      const teamPlayers = activePlayers.filter(p => p.teamId === team.id); 
      setTeamToEdit({ team, players: teamPlayers }); 
      setIsTeamEditModalOpen(true);
  };

  const handleSaveTeamEdit = async (updatedTeam: Team, updatedPlayers: Player[]) => {
      try {
          await updateMyTeam(updatedTeam, updatedPlayers, currentUser?.userId || '');
          showNotification("สำเร็จ", "บันทึกข้อมูลเรียบร้อย", "success");
          loadData(true); // Force refresh
      } catch (error) {
          showNotification("ผิดพลาด", "บันทึกข้อมูลไม่สำเร็จ", "error");
      }
  };

  const handleUserLoginSuccess = (user: UserProfile) => {
    setCurrentUser(user);
    if (user.role === 'admin') setIsAdmin(true);
    if (user.type === 'credentials') localStorage.setItem('penalty_pro_user', JSON.stringify(user));
    if (user.needsSchool) setAskSchool(true);
    showNotification("ยินดีต้อนรับ", `สวัสดีคุณ ${user.displayName}`, "success");
  };

  /** ผู้ใช้ตอบเรื่องโรงเรียนแล้ว — จำไว้ในโปรไฟล์ที่ถืออยู่ จะได้ไม่ถามซ้ำ */
  const handleSchoolChosen = (schoolId: string | null, schoolName: string | null) => {
    setAskSchool(false);
    setCurrentUser(prev => prev
      ? { ...prev, schoolId, schoolName, needsSchool: false }
      : prev);
    if (schoolName) showNotification("บันทึกแล้ว", `ต้นสังกัด: ${schoolName}`, "success");
  };
  const handleLogout = () => { authLogout(); setCurrentUser(null); setIsAdmin(false); setAskSchool(false); clearPWABadge(); showNotification("ออกจากระบบแล้ว"); };
  
  const startMatchSession = (teamA: Team, teamB: Team, matchId?: string) => { 
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
      goTo('match'); 
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
          matchId: matchState.matchId || '' 
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
              Promise.all([ saveMatchToSheet(nextState, "", false, currentTournamentId || 'default') ]).then(() => { setIsSaving(false); loadData(true); showNotification("บันทึกผลการแข่งขันเรียบร้อย", "", "success"); }); 
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
  const requestExitMatchWithoutSaving = () => {
    setConfirmModal({
      isOpen: true,
      title: 'ออกจากหน้าบันทึกผล?',
      message: 'คะแนน เวลา และเหตุการณ์ที่ยังไม่ได้จบการแข่งขันจะไม่ถูกบันทึก',
      isDangerous: true,
      confirmText: 'ออกโดยไม่บันทึก',
      onConfirm: () => {
        setConfirmModal(null);
        setMatchState(null);
        goTo('schedule');
      },
    });
  };
  const handleNavClick = (view: string) => { if (view === 'schedule') setInitialMatchId(null); if (currentView === view) setViewKey(prev => prev + 1); else goTo(view); };
  const BottomNav = () => ( <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 px-2 py-2 flex justify-around items-center z-[100] shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] safe-area-bottom"> <NavButton view="home" icon={Home} label="หน้าหลัก" /> <NavButton view="schedule" icon={CalendarDays} label="ตาราง" /> <NavButton view="standings" icon={ListChecks} label="คะแนน" /> <NavButton view="tournament" icon={Trophy} label="ผังแข่ง" /> <NavButton view="admin" icon={isAdmin ? Settings : Lock} label="ระบบ" onClick={isAdmin ? undefined : () => setIsLoginOpen(true)} /> </div> );
  const NavButton = ({ view, icon: Icon, label, onClick }: { view: string, icon: any, label: string, onClick?: () => void }) => { const isActive = currentView === view; const handleClick = onClick || (() => handleNavClick(view)); return ( <button onClick={handleClick} className={`flex flex-col items-center justify-center p-2 rounded-xl transition-all w-16 ${isActive ? 'text-indigo-600 bg-indigo-50' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}><Icon className={`w-6 h-6 mb-1 ${isActive ? 'fill-indigo-200' : ''}`} /><span className="text-[10px] font-bold">{label}</span></button> ) };
  // หน้าโรงเรียนมีแถบปุ่ม "บันทึกร่าง / ยืนยันและส่ง" ตรึงอยู่ล่างจอของตัวเอง
  // ถ้าโชว์เมนูหลักด้วย เมนู (z-100) จะทับปุ่มจนกดไม่ได้บนมือถือ
  const showBottomNav = currentView !== 'match' && currentView !== 'live_wall'
    && currentView !== 'school' && currentView !== 'login';
  const resolveTeam = (t: string | Team | null | undefined): Team => { if (!t) return { id: 'unknown', name: 'Unknown Team', shortName: 'N/A', color: '#94a3b8', logoUrl: '' } as Team; if (typeof t === 'object' && 'name' in t) return t as Team; const teamName = typeof t === 'string' ? t : 'Unknown'; return availableTeams.find(team => team.name === teamName) || { id: 'temp', name: teamName, color: '#94a3b8', logoUrl: '', shortName: teamName.substring(0, 3).toUpperCase() } as Team; };
  const liveMatches = activeMatches.filter(m => m.livestreamUrl && !m.winner);
  const recentFinishedMatches = activeMatches.filter(m => m.winner).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 5);
  const handleFinishRegularMatch = async (finalState: MatchState) => { setIsSaving(true); try { await saveMatchToSheet(finalState, '', false, currentTournamentId || 'default'); if (finalState.events && finalState.events.length > 0) { await saveMatchEventsToSheet(finalState.events); } showNotification("บันทึกผลเรียบร้อย", "จบการแข่งขันแล้ว", "success"); loadData(true); goTo('home'); } catch (e) { console.error(e); showNotification("ผิดพลาด", "บันทึกไม่สำเร็จ", "error"); } finally { setIsSaving(false); } };
  const handleUpdateRegularMatchState = (state: MatchState) => { };

  const handleSharePrizeSummary = () => {
      sharePrizeSummary(activeTournament?.name || "Tournament Results", prizes, activeTeams);
  };

  if (isLoadingData) {
      return <LoadingScreen />;
  }

  if (currentView === 'live_wall') {
      return (
          <LiveWall 
              matches={activeMatches} 
              teams={activeTeams} 
              players={activePlayers} 
              config={effectiveSettings} 
              predictions={activePredictions}
              onClose={() => goTo('tournament')} 
              onRefresh={(silent) => loadData(true, silent)}
              currentUser={currentUser}
          />
      );
  }

  /**
   * หน้าที่เข้าได้โดยไม่ต้องเลือกรายการแข่งขันก่อน
   *
   * ครูที่ได้ลิงก์ /school มาพร้อมรหัส 8 ตัว เปิดจากมือถือเครื่องใหม่จะยังไม่มี
   * รายการที่เลือกไว้ใน localStorage ถ้าไม่ยกเว้นตรงนี้จะเด้งไปหน้าเลือกรายการ
   * ทั้งที่หน้าโรงเรียนหารายการของตัวเองจากรหัสได้อยู่แล้ว (และ /login ก็ไม่ต้องใช้)
   */
  if (!currentTournamentId && currentView === 'school') {
      return (
          <SchoolPortal
              onExit={() => goTo('home')}
              notify={(t, m = '', ty: ToastType = 'success') => showNotification(t, m, ty)}
          />
      );
  }

  if (!currentTournamentId && currentView === 'programme') {
      return (
          <ProgrammePage
              tournament={activeTournament}
              config={effectiveSettings}
              teams={activeTeams}
              players={activePlayers}
              matches={activeMatches}
              onBack={() => goTo('home')}
          />
      );
  }

  if (!currentTournamentId && currentView === 'login') {
      return (
          <LoginPage
              reason={authReason}
              onBack={() => { setAuthReason(''); goTo('home'); }}
              onLogin={(u) => {
                  handleAdminLogin(u);
                  setAuthReason('');
                  goTo(u.role === 'admin' || u.role === 'staff' ? 'admin' : 'home');
              }}
          />
      );
  }

  if (!currentTournamentId) {
      return (
          <div className="bg-slate-50 min-h-screen font-sans" style={{ fontFamily: "'Kanit', sans-serif" }}>
              <TournamentSelector
                  tournaments={tournaments} 
                  teams={availableTeams} 
                  donations={donations} 
                  onSelect={(id) => { setCurrentTournamentId(id); localStorage.setItem('current_tournament_id', id); }} 
                  isAdmin={isAdmin} 
                  onRefresh={() => loadData(true)}
                  showNotification={showNotification}
                  isLoading={isLoadingData}
                  defaultFee={appConfig.registrationFee} 
              />
              {!isAdmin && tournaments.length === 0 && (<div className="fixed bottom-4 right-4"><button onClick={() => setIsLoginOpen(true)} className="bg-white/50 p-2 rounded-full hover:bg-white transition text-slate-400"><Lock className="w-4 h-4"/></button></div>)}
              <LoginDialog isOpen={isLoginOpen} onClose={() => setIsLoginOpen(false)} onLogin={handleAdminLogin} />
          </div>
      );
  }

  if (currentView === 'register') {
      if (!currentUser) {
          return (
            <div className="min-h-screen font-sans" style={{ fontFamily: "'Kanit', sans-serif" }}>
              <ToastContainer toasts={toasts} removeToast={removeToast} />
              <SystemDialogHost onNotify={showNotification} />
              <UserLoginDialog
                isOpen
                variant="page"
                title="เข้าสู่ระบบเพื่อสมัครแข่งขัน"
                onClose={() => goTo('home')}
                onLoginSuccess={handleUserLoginSuccess}
              />
            </div>
          );
      }
      return (
          <>
            <ToastContainer toasts={toasts} removeToast={removeToast} />
            <SystemDialogHost onNotify={showNotification} />
            <RegistrationForm
              key={viewKey}
              onBack={() => { loadData(true); goTo('home'); setEditingTeamData(null); }}
              schools={schools}
              config={effectiveSettings}
              showNotification={showNotification}
              user={currentUser}
              initialData={editingTeamData}
              registrationDeadline={registrationDeadline}
              registrationEnabled={registrationEnabled}
            />
          </>
      );
  }

  return (
    <div className="bg-slate-50 min-h-screen text-slate-900 font-sans pb-24" style={{ fontFamily: "'Kanit', sans-serif" }}>
      <ToastContainer toasts={toasts} removeToast={removeToast} />
      <SystemDialogHost onNotify={showNotification} />
      <SettingsDialog isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} onSave={() => loadData(true)} currentSettings={appConfig} />
      <LoginDialog isOpen={isLoginOpen} onClose={() => setIsLoginOpen(false)} onLogin={(u) => { handleAdminLogin(u); if (currentView !== 'tournament') goTo('admin'); }} />
      <PinDialog isOpen={isPinOpen} onClose={() => { setIsPinOpen(false); setPendingMatchSetup(null); }} onSuccess={handlePinSuccess} correctPin={String(appConfig.adminPin || "1234")} title="กรุณากรอกรหัสเริ่มแข่ง" />
      <UserLoginDialog isOpen={isUserLoginOpen} onClose={() => setIsUserLoginOpen(false)} onLoginSuccess={handleUserLoginSuccess} />
      {currentUser && (
        <NotificationCenter
          open={notifOpen}
          onClose={() => setNotifOpen(false)}
          notify={showNotification}
          onNavigate={(url) => {
            // ลิงก์ในแจ้งเตือนเป็นเส้นทางภายในแอป เช่น /schedule?match=M_1
            const path = url.split('?')[0].replace(/^\/+/, '');
            goTo(path === '' ? 'home' : path);
          }}
          feed={notifications}
        />
      )}

      {/* มีเวอร์ชันใหม่รออยู่ — ไม่รีโหลดเองเพราะผู้ใช้อาจกรอกข้อมูลค้างไว้ */}
      {pendingUpdate && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[2000] w-[min(92vw,26rem)]
                        bg-slate-900 text-white rounded-2xl shadow-2xl p-3 flex items-center gap-3
                        animate-in slide-in-from-bottom-4">
          <div className="min-w-0 flex-1">
            <p className="font-bold text-sm">มีเวอร์ชันใหม่ของระบบ</p>
            <p className="text-[11px] text-slate-300">กดโหลดใหม่เพื่อใช้เวอร์ชันล่าสุด</p>
          </div>
          <button onClick={() => setPendingUpdate(null)}
            className="px-2 py-1.5 text-xs text-slate-300">ภายหลัง</button>
          <button onClick={() => { const apply = pendingUpdate; setPendingUpdate(null); apply?.(); }}
            className="px-3 py-1.5 rounded-lg bg-white text-slate-900 text-xs font-bold shrink-0">
            โหลดใหม่
          </button>
        </div>
      )}

      {readingAnnouncement && (
        <div className="fixed inset-0 z-[1500] bg-black/60 backdrop-blur-sm modal-sheet modal-contained
                        flex items-end xl:items-center justify-center p-0 xl:p-4 overflow-hidden"
          onClick={() => setReadingAnnouncement(null)}>
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl flex flex-col"
            style={{ maxHeight: 'min(88vh, 44rem)' }}
            onClick={e => e.stopPropagation()}
            role="dialog" aria-modal="true" aria-label="ประกาศ">
            <div className="shrink-0 px-5 pt-5 pb-3 flex items-start justify-between gap-3"
              style={{ backgroundColor: '#4338CA', color: '#ffffff', borderRadius: '1rem 1rem 0 0' }}>
              <div className="flex items-center gap-2">
                <Megaphone className="w-5 h-5" />
                <h3 className="font-black text-lg" style={{ color: '#ffffff' }}>ประกาศ</h3>
              </div>
              <button onClick={() => setReadingAnnouncement(null)} aria-label="ปิด"
                className="p-2 rounded-full shrink-0"
                style={{ backgroundColor: 'rgba(255,255,255,0.18)', color: '#ffffff' }}>
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 flex-1 overflow-y-auto modal-scroll-region">
              <p className="text-slate-700 whitespace-pre-line leading-relaxed text-[15px] break-words">
                {readingAnnouncement}
              </p>
            </div>
            {announcements.length > 1 && (
              <div className="shrink-0 border-t border-slate-100 p-3 flex items-center justify-between">
                <button
                  onClick={() => {
                    const i = (announcementIndex - 1 + announcements.length) % announcements.length;
                    setAnnouncementIndex(i); setReadingAnnouncement(announcements[i]);
                  }}
                  className="px-3 py-2 rounded-lg text-sm font-bold text-slate-600 hover:bg-slate-100 flex items-center gap-1">
                  <ChevronLeft className="w-4 h-4" /> ก่อนหน้า
                </button>
                <span className="text-xs text-slate-400">
                  {announcementIndex + 1} / {announcements.length}
                </span>
                <button
                  onClick={() => {
                    const i = (announcementIndex + 1) % announcements.length;
                    setAnnouncementIndex(i); setReadingAnnouncement(announcements[i]);
                  }}
                  className="px-3 py-2 rounded-lg text-sm font-bold text-slate-600 hover:bg-slate-100 flex items-center gap-1">
                  ถัดไป <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <TeamListDialog
        kind={teamListKind}
        teams={participatingTeams}
        players={activePlayers}
        onClose={() => setTeamListKind(null)}
        onPickTeam={(t) => { setTeamListKind(null); setSelectedHomeTeam(t); }}
      />
      <SchoolChooserDialog
        open={askSchool}
        displayName={currentUser?.displayName}
        onDone={handleSchoolChosen}
        notify={showNotification}
      />
      <DonationDialog 
        isOpen={isDonationOpen} 
        onClose={() => setIsDonationOpen(false)} 
        config={effectiveSettings} 
        tournamentName={activeTournament?.name || ''} 
        tournamentId={currentTournamentId}
        currentUser={currentUser}
      />
      
      <SupportDialog 
        isOpen={isSupportOpen} 
        onClose={() => setIsSupportOpen(false)} 
        config={effectiveSettings} 
        currentUser={currentUser}
        onRefresh={() => loadData(true)}
      />

      {/* ปุ่มสนับสนุนแสดงเฉพาะหน้าหลัก เพื่อไม่บังช่องกรอก ปุ่มบันทึกผล
          และ navigation สำคัญบนหน้าจอมือถือ */}
      {currentView === 'home' && settingEnabled(appConfig.showSupportButton) && (
      <button
        onClick={() => setIsSupportOpen(true)}
        className="fixed bottom-24 right-4 md:right-8 md:bottom-24 z-[90] bg-gradient-to-r from-orange-500 to-pink-500 text-white p-4 rounded-full shadow-2xl hover:scale-110 transition-transform duration-300 group border-4 border-white/20 animate-in slide-in-from-bottom-10"
      >
        <Gift className="w-6 h-6 animate-pulse" />
        <span className="absolute right-full mr-3 top-1/2 -translate-y-1/2 bg-white text-slate-800 text-xs font-bold px-2 py-1 rounded shadow-md opacity-0 group-hover:opacity-100 transition whitespace-nowrap pointer-events-none">
          Support Us
        </span>
      </button>
      )}

      {/* Team Edit Modal for Users */}
      {isTeamEditModalOpen && teamToEdit && (
          <TeamEditModal
              isOpen={isTeamEditModalOpen}
              onClose={() => setIsTeamEditModalOpen(false)}
              team={teamToEdit.team}
              currentPlayers={teamToEdit.players}
              onSave={handleSaveTeamEdit}
              isAdmin={isAdmin}
          />
      )}
      
      {/* Donor List Modal */}
      {isDonorListOpen && (
          <div className="fixed inset-0 z-[1200] bg-black/60 backdrop-blur-sm modal-sheet flex items-end xl:items-center justify-center p-0 xl:p-4" onClick={() => setIsDonorListOpen(false)}>
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

      {confirmModal && confirmModal.isOpen && (
        <div className="fixed inset-0 z-[1100] bg-black/50 modal-sheet flex items-end xl:items-center justify-center p-0 xl:p-4 backdrop-blur-sm" onClick={() => setConfirmModal(null)}>
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full animate-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
            <div className={`flex items-center gap-3 mb-4 ${confirmModal.isDangerous ? 'text-red-600' : 'text-slate-700'}`}>
              <AlertTriangle className="w-6 h-6" />
              <h3 className="font-bold text-lg">{confirmModal.title}</h3>
            </div>
            <p className="text-slate-600 mb-6">{confirmModal.message}</p>
            <div className="flex flex-col-reverse sm:flex-row gap-3">
              <button onClick={() => setConfirmModal(null)} className="flex-1 min-h-12 px-4 border-2 border-slate-300 rounded-xl hover:bg-slate-50 font-bold text-slate-700">ยกเลิก</button>
              <button onClick={confirmModal.onConfirm} className={`flex-1 min-h-12 px-4 rounded-xl font-black !text-white border-2 shadow-lg ${confirmModal.isDangerous ? 'bg-red-600 border-red-800 hover:bg-red-700 shadow-red-200' : 'bg-indigo-600 border-indigo-800 hover:bg-indigo-700 shadow-indigo-200'}`}>{confirmModal.confirmText || 'ยืนยัน'}</button>
            </div>
          </div>
        </div>
      )}

      {showScrollTop && showBottomNav && (
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className={`fixed right-4 md:right-8 z-[89] w-12 h-12 rounded-full bg-slate-900/90 text-white border border-white/20 shadow-xl backdrop-blur flex items-center justify-center hover:bg-indigo-700 active:scale-95 transition-all ${currentView === 'home' && settingEnabled(appConfig.showSupportButton) ? 'bottom-44' : 'bottom-24'}`}
          aria-label="กลับขึ้นด้านบน"
          title="กลับขึ้นด้านบน"
        >
          <ArrowUp className="w-5 h-5" />
        </button>
      )}

      <TeamOverviewDialog team={selectedHomeTeam} players={activePlayers} onClose={() => setSelectedHomeTeam(null)} />
      {editingKick && activeTournament?.type === 'Penalty' && (
        <div className="fixed inset-0 bg-black/60 modal-sheet flex items-end xl:items-center justify-center z-[1100] p-0 xl:p-4 backdrop-blur-sm" onClick={() => setEditingKick(null)}>
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm animate-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-4">
              <h3 className="font-bold text-lg text-slate-800">แก้ไขผลการยิง</h3>
              <button onClick={() => confirmDeleteKick(editingKick.id)} className="text-red-500 hover:bg-red-50 p-1 rounded transition" title="ลบรายการนี้"><Trash2 className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4">
              <div><label className="block text-sm text-slate-500 mb-1">ชื่อผู้เล่น</label><input type="text" className="w-full p-2 border rounded-lg" defaultValue={editingKick.player} id="edit-player-name" /></div>
              <div><label className="block text-sm text-slate-500 mb-1">ผลการยิง</label><select className="w-full p-2 border rounded-lg" defaultValue={editingKick.result} id="edit-kick-result"><option value={KickResult.GOAL}>เข้าประตู (GOAL)</option><option value={KickResult.SAVED}>เซฟได้ (SAVED)</option><option value={KickResult.MISSED}>ยิงพลาด (MISSED)</option></select></div>
              <div className="flex gap-2 pt-4">
                <button onClick={() => setEditingKick(null)} className="flex-1 py-2 border rounded-lg text-slate-600 hover:bg-slate-50">ยกเลิก</button>
                <button onClick={() => { const name = (document.getElementById('edit-player-name') as HTMLInputElement).value; const res = (document.getElementById('edit-kick-result') as HTMLSelectElement).value as KickResult; handleUpdateOldKick(editingKick.id, res, name); }} className="flex-1 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-bold">บันทึก</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {currentView === 'tournament' && (
          <TournamentView 
              key={viewKey} 
              teams={activeTeams} 
              matches={activeMatches} 
              onSelectMatch={handleStartMatchRequest} 
              onBack={() => goTo('home')} 
              isAdmin={isAdmin} 
              onRefresh={() => loadData(true)} 
              onLoginClick={() => setIsLoginOpen(true)} 
              isLoading={isLoadingData} 
              showNotification={showNotification} 
              tournamentId={currentTournamentId} 
              onOpenLiveWall={() => goTo('live_wall')}
          />
      )}
      
      {currentView === 'schedule' && ( 
        <ScheduleList 
            key={viewKey} 
            matches={activeMatches} 
            teams={activeTeams} 
            players={activePlayers} 
            onBack={() => goTo('home')} 
            isAdmin={isAdmin} 
            isLoading={isLoadingData} 
            onRefresh={() => loadData(true)} 
            showNotification={showNotification} 
            onStartMatch={handleStartMatchRequest} 
            config={effectiveSettings} 
            initialMatchId={initialMatchId} 
            currentTournamentId={currentTournamentId} 
            predictions={activePredictions}
            currentUser={currentUser}
            tournament={activeTournament}
            onOpenProgramme={() => goTo('programme')}
            onLoginRequest={() => setIsUserLoginOpen(true)}
        /> 
      )}
      
      {currentView === 'standings' && <StandingsView key={viewKey} matches={activeMatches} teams={activeTeams} players={activePlayers} onBack={() => goTo('home')} isLoading={isLoadingData} predictions={activePredictions} />}
      {currentView === 'contest' && <ContestGallery user={currentUser} onLoginRequest={() => setIsUserLoginOpen(true)} showNotification={showNotification} />}
      {currentView === 'login' && (
        <LoginPage
          reason={authReason}
          onBack={() => { setAuthReason(''); goTo('home'); }}
          onLogin={(u) => {
            handleAdminLogin(u);
            setAuthReason('');
            goTo(u.role === 'admin' || u.role === 'staff' ? 'admin' : 'home');
          }}
        />
      )}

      {currentView === 'programme' && (
        <ProgrammePage
          tournament={activeTournament}
          config={effectiveSettings}
          teams={activeTeams}
          players={activePlayers}
          matches={activeMatches}
          onBack={() => goTo('schedule')}
        />
      )}

      {currentView === 'school' && (
        <SchoolPortal
          onExit={() => goTo('home')}
          notify={(t, m = '', ty: ToastType = 'success') => showNotification(t, m, ty)}
        />
      )}

      {currentView === 'admin' && ( <AdminDashboard key={viewKey} teams={activeTeams} players={activePlayers} settings={appConfig} onLogout={() => { setIsAdmin(false); goTo('home'); }} onRefresh={() => loadData(true)} news={newsItems} showNotification={showNotification} initialTeamId={initialTeamId} currentTournament={activeTournament} tournaments={tournaments} allTeams={availableTeams} allMatches={matchesLog} donations={donations} isLoading={isLoadingData} /> )}

      {currentView === 'match' && matchState && (
        <div className="min-h-screen bg-slate-900 pb-20">
            {activeTournament?.type === 'Penalty' ? (
                <div className="p-4 space-y-6 max-w-md mx-auto">
                    <div className="grid grid-cols-[2.5rem_1fr_2.5rem] items-center text-white">
                        <button onClick={requestExitMatchWithoutSaving} className="p-2 bg-white/10 rounded-full hover:bg-white/20 transition" aria-label="ออกโดยไม่บันทึก"><ArrowLeft className="w-5 h-5"/></button>
                        <h2 className="font-bold text-lg">การดวลจุดโทษ</h2>
                        <button onClick={requestUndoLastKick} disabled={matchState.kicks.length === 0} className="p-2 bg-white/10 rounded-full hover:bg-white/20 transition disabled:opacity-30" aria-label="ย้อนกลับผลการยิงล่าสุด"><Undo2 className="w-5 h-5"/></button>
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
                                onClick={() => { goTo('home'); setMatchState(null); loadData(true); }} 
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
                    onBack={requestExitMatchWithoutSaving}
                />
            )}
        </div>
      )}

      {currentView === 'home' && (
        <div className="min-h-screen bg-slate-100">
          {connectionError && <div className="bg-red-50 border-b border-red-200 p-3 flex items-center justify-between gap-4"><div className="flex items-center gap-2 text-red-700 text-sm font-bold"><WifiOff className="w-4 h-4" /><span>{connectionError}</span></div><button onClick={() => loadData(true)} className="text-xs bg-white border border-red-200 text-red-600 px-2 py-1 rounded hover:bg-red-50">ลองใหม่</button></div>}
          
          {/* Top Navbar Optimized for Mobile */}
          <div className="bg-white sticky top-0 z-40 border-b border-slate-200 shadow-sm px-3 py-2 flex justify-between items-center h-16">
              <div className="flex items-center gap-2 min-w-0">
                  <img src={effectiveSettings.competitionLogo || "https://via.placeholder.com/40"} className="w-8 h-8 object-contain shrink-0" onError={(e) => e.currentTarget.style.display = 'none'} />
                  <h1 className="font-bold text-slate-800 truncate text-sm sm:text-base">
                      {activeTournament ? activeTournament.name : appConfig.competitionName}
                  </h1>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                  {currentUser && (
                    <NotificationBell
                      unreadCount={notifications.unreadCount}
                      onClick={() => setNotifOpen(true)}
                    />
                  )}

                  {/* ── ปุ่มหลักที่เห็นเสมอ ─────────────────────────────
                      จอ 375px วางปุ่มได้จริงราว 3 ปุ่มเท่านั้น ก่อนหน้านี้ยัด 6 ปุ่ม
                      จนชื่อรายการถูกบีบเหลือไม่กี่ตัวอักษรและปุ่มเล็กจนกดพลาด
                      จึงเหลือไว้แค่ "สมัครแข่ง" ซึ่งเป็นสิ่งที่คนเข้ามาทำมากที่สุด
                      ที่เหลือย้ายเข้าเมนู — จอ sm ขึ้นไปยังแสดงครบเหมือนเดิม */}
                  <button
                    onClick={handleRegisterClick}
                    className={`text-white px-2.5 py-1.5 rounded-full text-[11px] sm:text-xs font-bold flex items-center gap-1 shadow-sm transition ${isRegistrationFull ? 'bg-slate-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'}`}
                    disabled={isRegistrationFull}
                  >
                      {isRegistrationFull ? (
                          <>เต็ม</>
                      ) : (
                          <><UserPlus className="w-3.5 h-3.5" /> <span className="hidden sm:inline">สมัครแข่ง</span></>
                      )}
                  </button>

                  {/* ปุ่มที่ซ่อนบนจอเล็ก — ขึ้นมาอยู่ในเมนูแทน */}
                  <button
                    onClick={() => goTo('contest')}
                    className="hidden sm:flex items-center gap-1 text-xs text-white bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-600 hover:to-indigo-600 px-2 py-1.5 rounded-full transition shadow-sm font-bold"
                  >
                      <Camera className="w-3 h-3 mr-1"/> ประกวดภาพ
                  </button>
                  <button onClick={() => setCurrentTournamentId(null)}
                    className="hidden sm:flex items-center gap-1 text-xs text-slate-500 hover:text-indigo-600 bg-slate-100 px-2 py-1.5 rounded-full transition">
                      <ArrowLeftRight className="w-3 h-3 mr-1"/> เปลี่ยนรายการ
                  </button>
                  <button
                    onClick={() => goTo('school')}
                    title="สำหรับโรงเรียนที่ส่งทีมเข้าแข่งขัน — เข้าด้วยรหัส 8 ตัว"
                    className="hidden sm:flex text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-1.5 rounded-full text-xs font-bold items-center gap-1 hover:bg-indigo-100 transition"
                  >
                      <Lock className="w-3 h-3" /> โรงเรียน
                  </button>

                  {currentUser ? (
                      <div className="hidden sm:flex items-center gap-1 pl-1 ml-1 border-l border-slate-200">
                          {currentUser.pictureUrl ? (
                              <img src={currentUser.pictureUrl} className="w-7 h-7 rounded-full border border-slate-200" />
                          ) : (
                              <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-xs">
                                  {String(currentUser.displayName || 'U').charAt(0)}
                              </div>
                          )}
                          <button onClick={handleLogout} className="text-slate-400 hover:text-red-500"><LogOut className="w-4 h-4" /></button>
                      </div>
                  ) : (
                      <button onClick={() => setIsUserLoginOpen(true)} className="hidden sm:flex text-indigo-600 bg-indigo-50 px-2 py-1.5 rounded-full text-xs font-bold items-center gap-1 hover:bg-indigo-100 ml-1">
                          <LogIn className="w-3 h-3" /> Login
                      </button>
                  )}

                  {/* ── เมนูรวมสำหรับจอเล็ก ───────────────────────────── */}
                  <button
                    onClick={() => setMoreOpen(v => !v)}
                    aria-label="เมนูเพิ่มเติม"
                    aria-expanded={moreOpen}
                    className="sm:hidden p-2 rounded-full text-slate-600 hover:bg-slate-100"
                  >
                      <MoreVertical className="w-5 h-5" />
                  </button>
              </div>
          </div>

          {moreOpen && (
            <>
              <div className="sm:hidden fixed inset-0 z-40" onClick={() => setMoreOpen(false)} />
              <div className="sm:hidden fixed right-2 top-16 z-50 w-56 bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in slide-in-from-top-2">
                {currentUser && (
                  <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
                    {currentUser.pictureUrl ? (
                      <img src={currentUser.pictureUrl} className="w-8 h-8 rounded-full border border-slate-200" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-xs">
                        {String(currentUser.displayName || 'U').charAt(0)}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-800 truncate">{currentUser.displayName}</p>
                      {currentUser.schoolName && (
                        <p className="text-[11px] text-slate-500 truncate">{currentUser.schoolName}</p>
                      )}
                    </div>
                  </div>
                )}

                {[
                  { icon: <Lock className="w-4 h-4" />, label: 'สำหรับโรงเรียน', onClick: () => goTo('school') },
                  { icon: <Camera className="w-4 h-4" />, label: 'ประกวดภาพ', onClick: () => goTo('contest') },
                  { icon: <ArrowLeftRight className="w-4 h-4" />, label: 'เปลี่ยนรายการแข่งขัน', onClick: () => setCurrentTournamentId(null) },
                ].map(item => (
                  <button key={item.label}
                    onClick={() => { setMoreOpen(false); item.onClick(); }}
                    className="w-full px-4 py-3 flex items-center gap-3 text-sm text-slate-700 hover:bg-slate-50 text-left">
                    <span className="text-indigo-600">{item.icon}</span> {item.label}
                  </button>
                ))}

                {/* ปุ่มติดตั้งขึ้นเฉพาะตอนที่เบราว์เซอร์ยอมให้ติดตั้งจริง
                    ถ้าโชว์ตลอดแล้วกดไม่ได้จะดูเหมือนระบบเสีย */}
                {canInstallApp() && (
                  <button
                    onClick={async () => {
                      setMoreOpen(false);
                      const done = await promptInstall();
                      if (done) showNotification('ติดตั้งแล้ว', 'เปิดจากหน้าจอโฮมได้เลย', 'success');
                    }}
                    className="w-full px-4 py-3 flex items-center gap-3 text-sm text-slate-700 hover:bg-slate-50 text-left border-t border-slate-100">
                    <span className="text-indigo-600"><Download className="w-4 h-4" /></span> ติดตั้งแอปลงหน้าจอโฮม
                  </button>
                )}

                <div className="border-t border-slate-100">
                  {currentUser ? (
                    <button onClick={() => { setMoreOpen(false); handleLogout(); }}
                      className="w-full px-4 py-3 flex items-center gap-3 text-sm text-rose-600 hover:bg-rose-50 text-left">
                      <LogOut className="w-4 h-4" /> ออกจากระบบ
                    </button>
                  ) : (
                    <button onClick={() => { setMoreOpen(false); setIsUserLoginOpen(true); }}
                      className="w-full px-4 py-3 flex items-center gap-3 text-sm text-indigo-600 hover:bg-indigo-50 text-left">
                      <LogIn className="w-4 h-4" /> เข้าสู่ระบบ
                    </button>
                  )}
                </div>
              </div>
            </>
          )}

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
                        {/*
                          กล่องนี้สูงคงที่ 48px และซ่อนส่วนที่ล้น ประกาศยาว ๆ จึงถูกตัดทิ้ง
                          และไม่มีทางอ่านต่อได้เลย — แตะเพื่อเปิดอ่านฉบับเต็มที่เลื่อนได้
                        */}
                        <button
                          onClick={() => setReadingAnnouncement(announcements[announcementIndex])}
                          className="flex-1 overflow-hidden relative h-12 flex items-center text-left min-w-0"
                          title="แตะเพื่ออ่านทั้งหมด"
                        >
                            {announcements.map((text, idx) => (
                                <p key={idx} className={`text-xs text-slate-200 leading-relaxed absolute w-full line-clamp-2 transition-opacity duration-500 ${idx === announcementIndex ? 'opacity-100 z-10' : 'opacity-0 z-0'}`}>
                                    {text}
                                </p>
                            ))}
                        </button>
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
                        onClick={requestLocationForNavigation}
                        className="bg-blue-600 text-white px-4 py-2 rounded-full text-xs font-bold flex items-center gap-1 shadow-sm hover:bg-blue-700 transition shrink-0"
                      >
                        <Navigation className="w-3 h-3" /> นำทาง
                      </a>
                  )}
              </div>

              <div className="bg-gradient-to-br from-indigo-600 via-indigo-700 to-violet-700 rounded-2xl shadow-xl p-5 text-white overflow-hidden relative animate-in slide-in-from-bottom-2">
                  <div className="absolute -right-10 -top-10 w-36 h-36 rounded-full bg-white/10" />
                  <div className="relative flex items-start gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-white/15 border border-white/20 flex items-center justify-center shrink-0">
                          <SchoolIcon className="w-7 h-7" />
                      </div>
                      <div className="min-w-0 flex-1">
                          <p className="text-indigo-100 text-xs font-bold tracking-wide">สำหรับโรงเรียนและครูผู้ประสานงาน</p>
                          <h3 className="font-black text-xl mt-1">สมัครส่งทีม หรือกรอกรายละเอียดทีม</h3>
                          <p className="text-indigo-100 text-sm mt-1">เลือกเมนูที่ต้องการ ระบบจะพาไปยังแบบฟอร์มโดยตรง</p>
                      </div>
                  </div>
                  <div className="relative grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 mt-5">
                      {isRegistrationOpen ? (
                        <button onClick={handleRegisterClick} className="min-h-16 rounded-xl bg-white text-indigo-700 font-black flex items-center justify-center gap-3 px-4 shadow-lg hover:bg-indigo-50 transition">
                            <UserPlus className="w-5 h-5 shrink-0" />
                            <span className="text-left leading-tight">กรอกใบสมัครส่งทีม<span className="block text-[11px] font-medium text-indigo-500 mt-1">{registrationDeadline ? `เปิดถึง ${formatDeadline(registrationDeadline)}` : 'เปิดรับสมัครอยู่'}</span></span>
                        </button>
                      ) : (
                        <div className="min-h-16 rounded-xl bg-white/10 border border-white/25 text-white px-4 py-3 flex items-center justify-center gap-3" role="status">
                            <XCircle className="w-5 h-5 shrink-0 text-rose-200" />
                            <span className="font-black leading-tight">ปิดรับสมัครแล้ว<span className="block text-[11px] font-medium text-indigo-100 mt-1">{isRegistrationFull ? 'ทีมครบจำนวนที่กำหนดแล้ว' : registrationDeadline ? `ตั้งแต่ ${formatDeadline(registrationDeadline)}` : 'ปิดโดยผู้ดูแลระบบ'}</span></span>
                        </div>
                      )}
                      {isTeamEditingOpen ? (
                        <button onClick={() => goTo('school')} className="min-h-16 rounded-xl bg-indigo-950/35 border border-white/30 text-white font-black flex items-center justify-center gap-3 px-4 hover:bg-indigo-950/55 transition">
                            <ClipboardPenLine className="w-5 h-5 shrink-0" />
                            <span className="text-left leading-tight">กรอก/แก้ไขข้อมูลทีม<span className="block text-[11px] font-medium text-indigo-100 mt-1">{teamEditDeadline ? `แก้ไขได้ถึง ${formatDeadline(teamEditDeadline)}` : 'เปิดให้แก้ไขข้อมูลอยู่'}</span></span>
                        </button>
                      ) : (
                        <div className="min-h-16 rounded-xl bg-indigo-950/25 border border-white/20 text-white px-4 py-3 flex items-center justify-center gap-3" role="status">
                            <XCircle className="w-5 h-5 shrink-0 text-amber-200" />
                            <span className="font-black leading-tight">ปิดแก้ไขข้อมูลทีมแล้ว<span className="block text-[11px] font-medium text-indigo-100 mt-1">{teamEditDeadline ? `ตั้งแต่ ${formatDeadline(teamEditDeadline)}` : 'ปิดโดยผู้ดูแลระบบ'}</span></span>
                        </div>
                      )}
                      <button onClick={() => goTo('programme')} className="min-h-16 rounded-xl bg-white/10 border border-white/30 text-white font-black flex items-center justify-center gap-3 px-4 hover:bg-white/20 transition">
                          <FileText className="w-5 h-5 shrink-0" />
                          <span className="text-left leading-tight">ดูสูจิบัตร<span className="block text-[11px] font-medium text-indigo-100 mt-1">กำหนดการ ทีม และตารางแข่งขัน</span></span>
                      </button>
                      {isAdmin && (
                        <button onClick={handleDownloadSchoolCodes} className="min-h-16 rounded-xl bg-amber-400 text-amber-950 font-black flex items-center justify-center gap-3 px-4 shadow-lg hover:bg-amber-300 transition">
                            <Download className="w-5 h-5 shrink-0" />
                            <span className="text-left leading-tight">โหลดรหัสโรงเรียน<span className="block text-[11px] font-medium text-amber-800 mt-1">ไฟล์ CSV เฉพาะผู้ดูแล</span></span>
                        </button>
                      )}
                  </div>
              </div>

              <section className="bg-white rounded-2xl shadow-lg border border-slate-100 overflow-hidden animate-in slide-in-from-bottom-2">
                <div className="p-5 border-b border-slate-100 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold text-indigo-600">ภาพรวมการแข่งขัน</p>
                    <h3 className="font-black text-lg text-slate-900 mt-0.5">ทีมที่อยู่ในระบบแล้ว</h3>
                    <p className="text-xs text-slate-500 mt-1">แตะที่ทีมเพื่อดูรายละเอียดและรายชื่อนักกีฬา</p>
                  </div>
                  <button onClick={() => goTo('standings')} className="text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-2 rounded-full hover:bg-indigo-100 shrink-0">ดูคะแนน</button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 border-b border-slate-100">
                  <button onClick={() => goTo('standings')} className="p-4 text-center hover:bg-slate-50 transition">
                    <p className="text-2xl font-black text-indigo-600">{participatingTeams.length}</p>
                    <p className="text-[11px] text-slate-500">ทีมทั้งหมด</p>
                  </button>
                  <button onClick={() => goTo('standings')} className="p-4 text-center hover:bg-slate-50 transition">
                    <p className="text-2xl font-black text-violet-600">{activeGroupNames.length}</p>
                    <p className="text-[11px] text-slate-500">สายการแข่งขัน</p>
                  </button>
                  <button onClick={() => goTo('schedule')} className="p-4 text-center hover:bg-slate-50 transition">
                    <p className="text-2xl font-black text-emerald-600">{activeMatches.length}</p>
                    <p className="text-[11px] text-slate-500">คู่แข่งขัน</p>
                  </button>
                  <button onClick={() => setTeamListKind('roster')} className="p-4 text-center hover:bg-sky-50 transition border-t lg:border-t-0 border-slate-100">
                    <p className="text-2xl font-black text-sky-600">{rosterStats.teams}</p>
                    <p className="text-[11px] text-slate-500 underline decoration-dotted underline-offset-2">ทีมที่ส่งรายชื่อ</p>
                  </button>
                  <button onClick={() => goTo('standings')} className="p-4 text-center hover:bg-slate-50 transition border-t lg:border-t-0 border-slate-100">
                    <p className="text-2xl font-black text-rose-600">{rosterStats.players}</p>
                    <p className="text-[11px] text-slate-500">นักกีฬาทั้งหมด</p>
                  </button>
                  <button onClick={() => setTeamListKind('paid')} className="p-4 text-center hover:bg-amber-50 transition border-t lg:border-t-0 border-slate-100">
                    <p className="text-2xl font-black text-amber-600">{rosterStats.paid}</p>
                    <p className="text-[11px] text-slate-500 underline decoration-dotted underline-offset-2">ทีมที่ชำระค่าสมัคร</p>
                  </button>
                </div>
                {participatingTeams.length === 0 ? (
                  <div className="p-6 text-center text-sm text-slate-400">ยังไม่มีทีมในรายการนี้</div>
                ) : (
                  <div className="p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {participatingTeams.slice(0, 8).map(team => (
                      <button
                        key={team.id}
                        onClick={() => setSelectedHomeTeam(team)}
                        className="rounded-2xl border border-slate-200 p-3 text-left hover:border-indigo-300 hover:bg-indigo-50/40 active:scale-[0.98] transition min-w-0"
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-11 h-11 rounded-xl bg-slate-50 border border-slate-100 p-1.5 flex items-center justify-center shrink-0">
                            {team.logoUrl ? <img src={team.logoUrl} alt="" className="w-full h-full object-contain" /> : <ShieldAlert className="w-5 h-5 text-slate-300" />}
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-sm text-slate-800 truncate">{team.name}</p>
                            <p className="text-[11px] text-indigo-600 font-bold">สาย {team.group || 'ยังไม่จัด'}</p>
                            {team.isPaid && (
                              <p className="text-[10px] text-emerald-700 font-bold flex items-center gap-0.5 mt-0.5">
                                <CheckCircle2 className="w-3 h-3 shrink-0" /> ชำระค่าสมัครแล้ว
                              </p>
                            )}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {participatingTeams.length > 8 && (
                  <button onClick={() => goTo('standings')} className="w-full py-3 border-t border-slate-100 text-sm font-bold text-indigo-600 hover:bg-indigo-50">ดูทีมทั้งหมดอีก {participatingTeams.length - 8} ทีม</button>
                )}
              </section>

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
                                  <div key={m.id} onClick={() => { setInitialMatchId(m.id); goTo('schedule'); }} className="min-w-[280px] bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden cursor-pointer hover:shadow-md transition snap-center">
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

              {activeTournament?.type === 'Penalty' && settingEnabled(appConfig.showPenaltyModeCard) && (
                <div className="animate-in slide-in-from-bottom-3">
                    <MatchSetup
                        onStart={handleStartMatchRequest}
                        availableTeams={activeTeams}
                        onOpenSettings={() => setIsSettingsOpen(true)}
                        isLoadingData={isLoadingData}
                        isAdmin={isAdmin}
                        onHide={isAdmin ? () => setPenaltyCardVisibility(false) : undefined}
                    />
                </div>
              )}

              {activeTournament?.type === 'Penalty' && !settingEnabled(appConfig.showPenaltyModeCard) && isAdmin && (
                <button
                  type="button"
                  onClick={() => setPenaltyCardVisibility(true)}
                  className="w-full py-3 px-4 rounded-xl border border-dashed border-indigo-300 bg-indigo-50 text-indigo-700 font-bold flex items-center justify-center gap-2 hover:bg-indigo-100 transition"
                >
                  <Eye className="w-4 h-4" /> แสดงการ์ดโหมดการดวลจุดโทษ
                </button>
              )}

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

              {prizes.length > 0 && (
                  <div className="bg-white rounded-2xl shadow-lg border border-slate-100 overflow-hidden">
                      <div className="bg-gradient-to-r from-yellow-500 to-amber-500 p-4 text-white flex justify-between items-center">
                          <h3 className="font-bold text-lg flex items-center gap-2"><Trophy className="w-6 h-6 text-white" /> รางวัลการแข่งขัน</h3>
                          <button onClick={() => handleSharePrizeSummary()} className="text-xs bg-white/20 hover:bg-white/30 text-white px-3 py-1.5 rounded-full backdrop-blur-sm transition flex items-center gap-1 font-bold">
                              <Share2 className="w-3 h-3" /> แชร์ผล
                          </button>
                      </div>
                      <div className="p-0">
                          {prizes.map((prize, idx) => {
                              let winnerTeam = null;
                              if (prize.winnerTeamId) {
                                  winnerTeam = activeTeams.find(t => t.id === prize.winnerTeamId);
                              }
                              
                              return (
                                  <div key={idx} className="flex items-center justify-between p-4 border-b border-slate-100 last:border-0 hover:bg-slate-50 transition">
                                      <div className="flex items-center gap-4 flex-1">
                                          <div className={`w-10 h-10 shrink-0 rounded-full flex items-center justify-center bg-yellow-100 text-yellow-600 font-bold shadow-sm`}>
                                              {prize.rankLabel.replace(/[^0-9]/g, '') || (idx + 1)}
                                          </div>
                                          <div className="min-w-0">
                                              <div className="font-bold text-slate-800 text-sm">{prize.rankLabel}</div>
                                              {winnerTeam ? (
                                                  <div className="flex items-center gap-1 mt-1 animate-in fade-in">
                                                      {winnerTeam.logoUrl && <img src={winnerTeam.logoUrl} className="w-4 h-4 object-contain" />}
                                                      <span className="text-sm font-bold text-green-600 truncate">{winnerTeam.name}</span>
                                                  </div>
                                              ) : (
                                                  prize.description && <div className="text-xs text-slate-500 truncate">{prize.description}</div>
                                              )}
                                          </div>
                                      </div>
                                      <div className="font-bold text-indigo-600 text-lg">{prize.amount}</div>
                                  </div>
                              );
                          })}
                      </div>
                  </div>
              )}

              {recentFinishedMatches.length > 0 && (
                  <div className="space-y-3 animate-in slide-in-from-right-4">
                      <div className="flex items-center justify-between px-1">
                          <div className="flex items-center gap-2">
                              <ListChecks className="w-5 h-5 text-green-600" />
                              <h3 className="font-bold text-slate-800">ผลการแข่งขันล่าสุด</h3>
                          </div>
                          <button onClick={() => goTo('schedule')} className="text-xs text-indigo-500 font-bold hover:underline">ดูทั้งหมด</button>
                      </div>
                      <div className="flex gap-4 overflow-x-auto pb-4 -mx-4 px-4 snap-x scrollbar-hide">
                          {recentFinishedMatches.map(m => {
                              const tA = resolveTeam(m.teamA);
                              const tB = resolveTeam(m.teamB);
                              return (
                                  <div 
                                      key={m.id} 
                                      onClick={() => { setInitialMatchId(m.id); goTo('schedule'); }} 
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

              <div className="pt-2">
                  <NewsFeed 
                      news={newsItems} 
                      isLoading={isLoadingData} 
                      initialNewsId={initialNewsId} 
                      currentTournamentId={currentTournamentId}
                      onRefresh={() => loadData(true)} 
                  />
              </div>
          </div>
        </div>
      )}

      {showBottomNav && <BottomNav />}
    </div>
  );
}
