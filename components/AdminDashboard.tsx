import React, { useState, useEffect, useRef, useMemo } from 'react';
import AdminTools from './AdminTools';
import AdminTournaments from './AdminTournaments';
import SearchPicker, { PickerItem } from './SearchPicker';
import LineupMediaEditor from './LineupMediaEditor';
import { PLAYER_POSITIONS, normalizePlayerPosition } from '../services/playerPositions';
import { isSupportedImage, resizeImageBeforeUpload, SUPPORTED_IMAGE_ACCEPT } from '../services/imageResize';
import AdminSchedule from './AdminSchedule';
import { Team, Player, AppSettings, NewsItem, Tournament, UserProfile, Donation, Contest, Match } from '../types';
import { ShieldCheck, ShieldAlert, Users, LogOut, Eye, X, Settings, MapPin, CreditCard, Save, Image, Search, FileText, Bell, Plus, Trash2, Loader2, Grid, Edit3, Paperclip, Download, Upload, Copy, Phone, User, Camera, AlertTriangle, CheckCircle2, UserPlus, ArrowRight, Hash, Palette, Briefcase, ExternalLink, FileCheck, Info, Calendar, Trophy, Lock, Heart, Target, Smartphone, ChevronLeft, ChevronRight, UserCog, Globe, DollarSign, Check, Shuffle, LayoutGrid, List, PlayCircle, StopCircle, SkipForward, Minus, Layers, RotateCcw, Sparkles, RefreshCw, MessageCircle, Printer, Share2, FileCode, Banknote, Clock, Power } from 'lucide-react';
import { apiGet, apiPost } from '../services/apiConfig';
import { updateTeamStatus, saveSettings, manageNews, fileToBase64, uploadFile, updateTeamData, fetchUsers, updateUserRole, verifyDonation, createUser, updateUserDetails, deleteUser, updateDonationDetails, fetchDatabase, deleteTeam, fetchContests, manageContest } from '../services/sheetService';
import confetti from 'canvas-confetti';
import { confirmAction, notifyUser } from '../services/uiService';

interface AdminDashboardProps {
  teams: Team[];
  players: Player[];
  settings: AppSettings;
  onLogout: () => void;
  onRefresh: () => void;
  news?: NewsItem[];
  showNotification?: (title: string, message: string, type: 'success' | 'error' | 'info' | 'warning') => void;
  initialTeamId?: string | null;
  currentTournament?: Tournament;
  tournaments?: Tournament[];
  /** ทีมทุกทัวร์นาเมนต์ — แผงเครื่องมือสลับรายการได้จึงต้องใช้ทั้งหมด */
  allTeams?: Team[];
  /** นัดแข่งทั้งหมด — หน้าจัดตารางต้องใช้ */
  allMatches?: Match[];
  donations?: Donation[];
  isLoading?: boolean;
}

const MAX_IMAGE_SIZE = 2 * 1024 * 1024; // 2MB
const MAX_DOC_SIZE = 3 * 1024 * 1024;   // 3MB

const AdminDashboard: React.FC<AdminDashboardProps> = ({ 
  teams: initialTeams, 
  players: initialPlayers, 
  settings, 
  onLogout, 
  onRefresh, 
  news = [], 
  showNotification, 
  initialTeamId, 
  currentTournament, 
  tournaments = [], 
  allTeams = [],
  allMatches = [],
  donations = [], 
  isLoading 
}) => {
  // Tab Persistence Logic
  // ── เพิ่มทีมโดยแอดมิน ──────────────────────────────────────────────
  // ต้องผูกกับโรงเรียนที่มีในระบบเสมอ ไม่ให้พิมพ์ชื่อโรงเรียนอิสระ ไม่งั้น
  // พิมพ์ต่างกันนิดเดียวกลายเป็นคนละโรงเรียนแล้วรวมประวัติข้ามฤดูไม่ได้
  const [addTeamOpen, setAddTeamOpen] = useState(false);
  const [addTeamForm, setAddTeamForm] = useState({
    schoolId: '', schoolName: '', name: '', shortName: '',
    managerName: '', managerPhone: '', groupName: '', status: 'Approved',
  });
  const [addTeamBusy, setAddTeamBusy] = useState(false);

  const submitAddTeam = async () => {
    if (!addTeamForm.schoolId) {
      showNotification?.('ยังเพิ่มไม่ได้', 'ต้องเลือกโรงเรียนก่อน', 'warning');
      return;
    }
    setAddTeamBusy(true);
    try {
      const r = await apiPost('createTeam', {
        tournamentId: currentTournament?.id || '',
        schoolId: addTeamForm.schoolId,
        name: addTeamForm.name.trim() || addTeamForm.schoolName,
        shortName: addTeamForm.shortName.trim(),
        managerName: addTeamForm.managerName.trim(),
        managerPhone: addTeamForm.managerPhone.trim(),
        groupName: addTeamForm.groupName.trim(),
        status: addTeamForm.status,
      });
      showNotification?.('เพิ่มทีมแล้ว', r.name, 'success');
      setAddTeamOpen(false);
      setAddTeamForm({ schoolId: '', schoolName: '', name: '', shortName: '',
        managerName: '', managerPhone: '', groupName: '', status: 'Approved' });
      onRefresh();
    } catch (e: any) {
      // 409 = ชนเพดานทีมต่อโรงเรียน หรือชื่อซ้ำ — ระบบกันไว้ ไม่ใช่ระบบพัง
      showNotification?.(e?.status === 409 ? 'เพิ่มไม่ได้' : 'ผิดพลาด',
        e?.message ?? 'เพิ่มทีมไม่สำเร็จ', e?.status === 409 ? 'warning' : 'error');
    } finally { setAddTeamBusy(false); }
  };

  const [activeTab, setActiveTab] = useState<'teams' | 'settings' | 'news' | 'users' | 'donations' | 'contests' | 'tools' | 'schedule' | 'tournaments'>(() => {
      const savedTab = localStorage.getItem('adminActiveTab');
      return (savedTab as any) || 'teams';
  });

  const [localTeams, setLocalTeams] = useState<Team[]>(initialTeams);
  const [localPlayers, setLocalPlayers] = useState<Player[]>(initialPlayers);
  const [localNews, setLocalNews] = useState<NewsItem[]>(news);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  
  // Specific Loading State (String message instead of boolean)
  const [reloadMessage, setReloadMessage] = useState<string | null>(null);
  
  // User Management State
  const [userList, setUserList] = useState<UserProfile[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [userForm, setUserForm] = useState({ username: '', password: '', displayName: '', phone: '', role: 'user', schoolId: '' });

  // Donation Management State
  const [donationList, setDonationList] = useState<Donation[]>(donations);
  const [selectedDonation, setSelectedDonation] = useState<Donation | null>(null);
  const [isVerifyingDonation, setIsVerifyingDonation] = useState(false);
  const [donationViewMode, setDonationViewMode] = useState<'grid' | 'list'>('grid');
  const [adminTaxFile, setAdminTaxFile] = useState<File | null>(null);
  const [isGeneratingCert, setIsGeneratingCert] = useState(false); // Certificate Loading State

  // Contest Management State
  const [contestList, setContestList] = useState<Contest[]>([]);
  const [contestEntries, setContestEntries] = useState<any[]>([]); // To count entries
  const [isContestModalOpen, setIsContestModalOpen] = useState(false);
  const [contestForm, setContestForm] = useState<{id: string | null, title: string, description: string, closingDate: string, status: 'Open'|'Closed', tournamentId: string}>({ id: null, title: '', description: '', closingDate: '', status: 'Open', tournamentId: 'global' });
  const [isSavingContest, setIsSavingContest] = useState(false);
  const [contestViewMode, setContestViewMode] = useState<'grid' | 'list'>('grid');
  const [contestFilter, setContestFilter] = useState<'All' | 'Open' | 'Closed'>('All');
  const [contestSearch, setContestSearch] = useState('');

  // Teams Filter State
  const [filterStatus, setFilterStatus] = useState<string>('All');

  // Search States
  const [searchTerm, setSearchTerm] = useState('');
  const [newsSearch, setNewsSearch] = useState('');
  const [donationSearch, setDonationSearch] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState<'all' | 'admin' | 'staff' | 'referee' | 'user'>('all');
  const [userSchoolFilter, setUserSchoolFilter] = useState<'all' | 'verified' | 'self' | 'none'>('all');
  const [userPage, setUserPage] = useState(1);

  // Draw Logic State
  const [isDrawModalOpen, setIsDrawModalOpen] = useState(false);
  const [drawGroupCount, setDrawGroupCount] = useState(4);
  const [teamsPerGroup, setTeamsPerGroup] = useState(4);
  const [isDrawing, setIsDrawing] = useState(false);
  
  // LIVE DRAW STATES
  const [isLiveDrawActive, setIsLiveDrawActive] = useState(false);
  const [liveDrawStep, setLiveDrawStep] = useState<'idle' | 'spinning' | 'revealed' | 'finished'>('idle');
  const [liveGroups, setLiveGroups] = useState<Record<string, Team[]>>({});
  const [currentSpinName, setCurrentSpinName] = useState("...");
  const [currentSpinGroup, setCurrentSpinGroup] = useState("");
  const [poolTeams, setPoolTeams] = useState<Team[]>([]);
  const [drawnCount, setDrawnCount] = useState(0);
  const [removeConfirmModal, setRemoveConfirmModal] = useState<{ isOpen: boolean, team: Team | null, group: string | null }>({ isOpen: false, team: null, group: null });
  const [resetConfirmModal, setResetConfirmModal] = useState(false);
  const [latestReveal, setLatestReveal] = useState<Team | null>(null); 

  // Confetti Canvas Ref
  const confettiCanvasRef = useRef<HTMLCanvasElement>(null);
  const certificateCanvasRef = useRef<HTMLCanvasElement>(null);

  // View States
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [newsViewMode, setNewsViewMode] = useState<'grid' | 'list'>('grid'); // News View Toggle
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [isEditingTeam, setIsEditingTeam] = useState(false);
  const [modalTab, setModalTab] = useState<'info' | 'players' | 'docs' | 'media'>('info');
  const [editForm, setEditForm] = useState<{ 
      team: Team, 
      players: Player[], 
      newLogo?: File | null, 
      newSlip?: File | null, 
      newDoc?: File | null,
      logoPreview?: string | null, 
      slipPreview?: string | null 
  } | null>(null);
  const [editPrimaryColor, setEditPrimaryColor] = useState('#2563EB');
  const [editSecondaryColor, setEditSecondaryColor] = useState('#FFFFFF');
  const [isSavingTeam, setIsSavingTeam] = useState(false);
  const [configForm, setConfigForm] = useState<AppSettings>(settings);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  
  // News Form with Tournament ID
  const [newsForm, setNewsForm] = useState<{ id: string | null, title: string, content: string, imageFile: File | null, imagePreview: string | null, docFile: File | null, tournamentId: string }>({ id: null, title: '', content: '', imageFile: null, imagePreview: null, docFile: null, tournamentId: 'global' });
  const [isSavingNews, setIsSavingNews] = useState(false);
  const [isNewsModalOpen, setIsNewsModalOpen] = useState(false);
  
  // News Delete Confirmation
  const [newsToDelete, setNewsToDelete] = useState<string | null>(null);
  const [isDeletingNews, setIsDeletingNews] = useState(false);
  
  const [settingsLogoPreview, setSettingsLogoPreview] = useState<string | null>(null);
  const [objectiveImagePreview, setObjectiveImagePreview] = useState<string | null>(null);
  const [rejectModal, setRejectModal] = useState<{ isOpen: boolean, teamId: string | null }>({ isOpen: false, teamId: null });
  const [rejectReasonInput, setRejectReasonInput] = useState('');

  // Persist Active Tab
  useEffect(() => {
      localStorage.setItem('adminActiveTab', activeTab);
  }, [activeTab]);

  useEffect(() => {
    setLocalTeams(initialTeams);
    setLocalPlayers(initialPlayers);
    setDonationList(donations);
    setLocalNews(news);
  }, [initialTeams, initialPlayers, donations, news]);
  
  useEffect(() => {
      if (activeTab === 'users' || activeTab === 'donations') {
          if (userList.length === 0) loadUsers();
      }
      if (activeTab === 'contests') {
          loadContests();
      }
  }, [activeTab]);

  useEffect(() => {
      // Reset admin tax file when donation selection changes
      setAdminTaxFile(null);
  }, [selectedDonation]);

  const loadUsers = async () => {
      setIsLoadingUsers(true);
      const users = await fetchUsers();
      setUserList(users);
      setIsLoadingUsers(false);
  };

  const loadContests = async () => {
      // Background load
      const data = await fetchContests();
      setContestList(data.contests);
      setContestEntries(data.entries);
  };

  const handleLocalRefresh = async () => {
      setReloadMessage("กำลังโหลดข้อมูลล่าสุด...");
      try {
          await onRefresh();
          notify("รีเฟรชข้อมูล", "โหลดข้อมูลล่าสุดเรียบร้อย", "info");
      } catch(e) {
          console.error(e);
          notify("ผิดพลาด", "รีเฟรชข้อมูลไม่สำเร็จ", "error");
      } finally {
          setReloadMessage(null);
      }
  };

  // Helper for reload sequence with specific message
  const executeWithReload = async (action: () => Promise<void>, successMsg: string, loadingMsg: string) => {
      setReloadMessage(loadingMsg);
      try {
          await action();
          await onRefresh(); 
          // If active tab is contests, reload contests too
          if (activeTab === 'contests') await loadContests();
          notify("สำเร็จ", successMsg, "success");
      } catch (error: any) {
          console.error(error);
          notify("ผิดพลาด", error.message || "เกิดข้อผิดพลาดในการบันทึก", "error");
      } finally {
          setReloadMessage(null);
      }
  };

  // --- CONTEST LOGIC ---
  const handleCreateContest = () => {
      setContestForm({ id: null, title: '', description: '', closingDate: '', status: 'Open',
          tournamentId: currentTournament?.id || 'global' });
      setIsContestModalOpen(true);
  };

  const handleEditContest = (contest: Contest) => {
      // Format date correctly for datetime-local input (YYYY-MM-DDTHH:mm)
      let formattedDate = '';
      if (contest.closingDate) {
          try {
              const d = new Date(contest.closingDate);
              const pad = (n:number) => n < 10 ? '0'+n : n;
              formattedDate = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
          } catch(e) {}
      }

      setContestForm({
          id: contest.id,
          title: contest.title,
          description: contest.description,
          closingDate: formattedDate,
          status: contest.status,
          tournamentId: contest.tournamentId || 'global',
      });
      setIsContestModalOpen(true);
  };

  const handleSaveContest = async () => {
      if (!contestForm.title) {
          notify("ข้อมูลไม่ครบ", "กรุณาระบุหัวข้อกิจกรรม", "warning");
          return;
      }
      setIsContestModalOpen(false);
      executeWithReload(async () => {
          const action = contestForm.id ? 'edit' : 'create';
          await manageContest({
              subAction: action,
              contestId: contestForm.id,
              title: contestForm.title,
              description: contestForm.description,
              closingDate: contestForm.closingDate,
              // ผูกกับรายการที่กำลังดูอยู่ — จอในสนามกรองภาพด้วยค่านี้ (db/19)
              // ส่ง 'global' เพื่อให้ใช้ได้ทุกรายการ
              tournamentId: contestForm.tournamentId,
          });
      }, contestForm.id ? "แก้ไขกิจกรรมเรียบร้อย" : "สร้างกิจกรรมใหม่เรียบร้อย", "กำลังบันทึกกิจกรรม...");
  };

  const handleToggleContestStatus = async (contest: Contest) => {
      const newStatus = contest.status === 'Open' ? 'Closed' : 'Open';
      executeWithReload(async () => {
          await manageContest({ subAction: 'updateStatus', contestId: contest.id, status: newStatus });
      }, `เปลี่ยนสถานะเป็น ${newStatus} เรียบร้อย`, "กำลังอัปเดตสถานะ...");
  };

  const filteredContests = useMemo(() => {
      return contestList.filter(c => {
          const matchesSearch = c.title.toLowerCase().includes(contestSearch.toLowerCase()) || c.description.toLowerCase().includes(contestSearch.toLowerCase());
          const matchesFilter = contestFilter === 'All' || c.status === contestFilter;
          return matchesSearch && matchesFilter;
      });
  }, [contestList, contestSearch, contestFilter]);

  // User Management Handlers
  const handleOpenUserModal = (user: UserProfile | null) => {
      setEditingUser(user);
      if (user) {
          setUserForm({ username: user.username || '', password: '', displayName: user.displayName || '', phone: user.phoneNumber || '', role: user.role || 'user', schoolId: user.schoolId || '' });
      } else {
          setUserForm({ username: '', password: '', displayName: '', phone: '', role: 'user', schoolId: '' });
      }
      setIsUserModalOpen(true);
  };

  const handleSaveUser = async () => {
      // บัญชีที่เข้าผ่าน LINE ไม่มี username และแก้ไม่ได้ด้วย จึงบังคับเฉพาะ
      // ตอนสร้างใหม่ ไม่งั้นแอดมินจะผูกโรงเรียนให้ผู้ใช้ LINE ไม่ได้เลย
      if (!editingUser && !userForm.username) {
          notify("ข้อมูลไม่ครบ", "กรุณากรอก Username", "warning");
          return;
      }
      if (!userForm.displayName) {
          notify("ข้อมูลไม่ครบ", "กรุณากรอกชื่อที่แสดง", "warning");
          return;
      }
      
      const targetUserId = editingUser ? editingUser.userId : `U_${Date.now()}`;
      setIsUserModalOpen(false);

      executeWithReload(async () => {
          let success = false;
          if (editingUser) {
              success = await updateUserDetails({ userId: editingUser.userId, ...userForm });
          } else {
              if (!userForm.password) throw new Error("กรุณากรอกรหัสผ่าน");
              success = await createUser(userForm);
          }
          if (!success) throw new Error("Backend operation failed");
          // Also reload user list explicitly
          await loadUsers();
      }, editingUser ? "แก้ไขข้อมูลผู้ใช้เรียบร้อย" : "สร้างผู้ใช้ใหม่เรียบร้อย", editingUser ? "กำลังแก้ไขผู้ใช้..." : "กำลังสร้างผู้ใช้...");
  };

  const handleDeleteUser = async (userId: string) => {
      if (!await confirmAction('ยืนยันการลบผู้ใช้งานนี้?', { title: 'ลบผู้ใช้งาน', dangerous: true, confirmText: 'ลบผู้ใช้งาน' })) return;
      executeWithReload(async () => {
          const success = await deleteUser(userId);
          if (!success) throw new Error("Failed to delete");
          await loadUsers();
      }, "ลบผู้ใช้เรียบร้อย", "กำลังลบผู้ใช้...");
  };

  const handleVerifyDonation = async (donationId: string, status: 'Verified' | 'Rejected' | 'Pending') => {
      // Optimistic update for selectedDonation if modal is open
      if (selectedDonation && selectedDonation.id === donationId) {
          setSelectedDonation({ ...selectedDonation, status });
      }
      
      executeWithReload(async () => {
          await verifyDonation(donationId, status as 'Verified' | 'Rejected');
      }, `อัปเดตสถานะเป็น ${status} เรียบร้อย`, "กำลังอัปเดตสถานะการเงิน...");
  };

  const handleUpdateDonationAnonymous = async (isAnon: boolean) => {
      if (!selectedDonation) return;
      // Optimistic update for UI responsiveness in modal
      setSelectedDonation({...selectedDonation, isAnonymous: isAnon});
      
      executeWithReload(async () => {
          await updateDonationDetails(selectedDonation.id, { isAnonymous: isAnon });
      }, "อัปเดตสถานะการแสดงชื่อเรียบร้อย", "กำลังอัปเดตข้อมูล...");
  };

  const handleTaxFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
          setAdminTaxFile(e.target.files[0]);
      }
  };

  const handleSaveTaxFile = async () => {
      if (!selectedDonation || !adminTaxFile) {
          notify("แจ้งเตือน", "กรุณาเลือกไฟล์ก่อนบันทึก", "warning");
          return;
      }
      // Note: We use executeWithReload to show the global loader properly above the modal
      executeWithReload(async () => {
          const base64 = await fileToBase64(adminTaxFile);
          await updateDonationDetails(selectedDonation.id, { taxFile: base64 });
          setAdminTaxFile(null);
      }, "อัปโหลดไฟล์เรียบร้อย", "กำลังอัปโหลดเอกสาร...");
  };

  // ... (Certificate Generation Code) ...
  const handlePrintCertificate = async (donation: Donation) => {
      if (!certificateCanvasRef.current) return;
      setIsGeneratingCert(true);
      
      // Delay to allow React to render loading state
      await new Promise(resolve => setTimeout(resolve, 100));

      const canvas = certificateCanvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
          setIsGeneratingCert(false);
          return;
      }

      const width = 800;
      const height = 1131; // A4 Ratio approx
      canvas.width = width;
      canvas.height = height;

      // 1. Background
      const gradient = ctx.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, '#fffbfb'); // Warm white
      gradient.addColorStop(1, '#fff0f0'); // Very soft pink
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);

      // 2. Borders
      // Outer Line (Gold)
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#d4af37'; 
      ctx.strokeRect(20, 20, width - 40, height - 40);
      
      // Inner Line (Dashed Pink)
      ctx.lineWidth = 1;
      ctx.strokeStyle = '#f472b6'; // Pink-400
      ctx.setLineDash([5, 5]);
      ctx.strokeRect(35, 35, width - 70, height - 70);
      ctx.setLineDash([]); // Reset

      // 3. Decorations (Corner Circles)
      ctx.fillStyle = 'rgba(251, 191, 36, 0.1)'; // Amber-400 transparent
      ctx.beginPath(); ctx.arc(0, 0, 150, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(width, height, 150, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(244, 114, 182, 0.1)'; // Pink-400 transparent
      ctx.beginPath(); ctx.arc(width, 0, 100, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(0, height, 100, 0, Math.PI * 2); ctx.fill();

      // 4. Central Icon: Vector Heart (Gold/Pink Gradient)
      const centerX = width / 2;
      const heartY = 180;
      const heartSize = 2.5; // Adjusted size
      
      ctx.save();
      ctx.translate(centerX, heartY);
      ctx.scale(heartSize, heartSize);
      ctx.beginPath();
      // Heart Path
      ctx.moveTo(0, -10);
      ctx.bezierCurveTo(0, -15, -10, -25, -25, -25);
      ctx.bezierCurveTo(-55, -25, -55, 10, -55, 10);
      ctx.bezierCurveTo(-55, 30, -35, 52, 0, 70);
      ctx.bezierCurveTo(35, 52, 55, 30, 55, 10);
      ctx.bezierCurveTo(55, 10, 55, -25, 25, -25);
      ctx.bezierCurveTo(10, -25, 0, -15, 0, -10);
      
      // Heart Fill (Pure Gold)
      ctx.fillStyle = '#D4AF37';
      ctx.fill();
      
      // Heart Outline (Darker Gold)
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#B45309';
      ctx.stroke();
      ctx.restore();

      // 5. Text Content
      ctx.textAlign = 'center';
      
      // Header
      ctx.fillStyle = '#b45309'; // Amber-700 (Gold-ish dark)
      ctx.font = 'bold 50px "Kanit", sans-serif'; 
      ctx.fillText('ใบประกาศเกียรติคุณ', width / 2, 330);
      
      ctx.fillStyle = '#64748b'; // Slate-500
      ctx.font = '300 24px "Kanit", sans-serif'; 
      ctx.fillText('ขอมอบให้ไว้เพื่อแสดงว่า', width / 2, 380);

      // Donor Name
      ctx.fillStyle = '#be185d'; // Pink-700
      ctx.font = 'bold 65px "Sarabun", sans-serif'; 
      ctx.fillText(donation.donorName, width / 2, 480);

      // Body
      ctx.fillStyle = '#334155'; 
      ctx.font = '24px "Kanit", sans-serif'; 
      ctx.fillText(`ได้ร่วมบริจาคเงินสนับสนุน`, width / 2, 560);
      
      // Competition Name
      ctx.font = 'bold 32px "Kanit", sans-serif'; 
      ctx.fillStyle = '#d97706'; // Amber-600
      const compName = currentTournament ? currentTournament.name : settings.competitionName;
      ctx.fillText(`"${compName}"`, width / 2, 610);

      // Amount
      ctx.fillStyle = '#334155'; 
      ctx.font = '24px "Kanit", sans-serif'; 
      ctx.fillText(`จำนวนเงิน ${donation.amount.toLocaleString()} บาท`, width / 2, 680);

      // Blessing (Detailed)
      ctx.fillStyle = '#475569'; // Slate-600
      ctx.font = 'italic 18px "Sarabun", sans-serif';
      const blessingLine1 = "ขออำนาจคุณพระศรีรัตนตรัยและสิ่งศักดิ์สิทธิ์";
      const blessingLine2 = "จงดลบันดาลให้ท่านและครอบครัว ประสบแต่ความสุขความเจริญ";
      const blessingLine3 = "สุขภาพแข็งแรง สมปรารถนาทุกประการ";
      
      ctx.fillText(blessingLine1, width / 2, 750);
      ctx.fillText(blessingLine2, width / 2, 780);
      ctx.fillText(blessingLine3, width / 2, 810);

      // Date
      ctx.fillStyle = '#94a3b8'; // Slate-400
      ctx.font = '20px "Kanit", sans-serif';
      const dateStr = new Date(donation.timestamp).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });
      ctx.fillText(`ให้ไว้ ณ วันที่ ${dateStr}`, width / 2, 890);

      // Signature Line
      ctx.beginPath(); ctx.moveTo(width / 2 - 120, 980); ctx.lineTo(width / 2 + 120, 980); 
      ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 1; ctx.stroke();
      ctx.font = '20px "Kanit", sans-serif'; ctx.fillStyle = '#64748b'; 
      ctx.fillText('ผู้อำนวยการ / ผู้จัดโครงการ', width / 2, 1020);

      // QR Code (Bottom Right) if exists
      if (donation.taxFileUrl) {
          try {
              const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(donation.taxFileUrl)}`;
              const qrImg = new window.Image();
              qrImg.crossOrigin = "Anonymous";
              qrImg.src = qrUrl;
              await new Promise((resolve) => { qrImg.onload = resolve; qrImg.onerror = resolve; });
              ctx.drawImage(qrImg, width - 130, height - 130, 90, 90);
              ctx.font = '10px "Kanit", sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#94a3b8'; 
              ctx.fillText('Scan e-Donation', width - 85, height - 30);
          } catch (e) {}
      }

      // ID (Bottom Left)
      ctx.textAlign = 'left';
      ctx.fillStyle = '#cbd5e1'; // Slate-300
      ctx.font = '10px monospace';
      ctx.fillText(`ID: ${donation.id}`, 40, height - 20);

      // Download
      const link = document.createElement('a');
      link.download = `Certificate_${donation.donorName.replace(/\s/g,'_')}.jpg`;
      link.href = canvas.toDataURL('image/jpeg', 0.95);
      link.click();
      
      setIsGeneratingCert(false);
  };

  useEffect(() => {
      if (initialTeamId && localTeams.length > 0) {
          const found = localTeams.find(t => t.id === initialTeamId);
          if (found) {
              setSelectedTeam(found);
          }
      }
  }, [initialTeamId, localTeams]);

  useEffect(() => {
      setConfigForm(settings);
      setSettingsLogoPreview(settings.competitionLogo);
      setObjectiveImagePreview(settings.objectiveImageUrl || null);
  }, [settings]);

  useEffect(() => {
    if (selectedTeam) {
        const teamPlayers = localPlayers.filter(p => p.teamId === selectedTeam.id);
        let pColor = '#2563EB';
        let sColor = '#FFFFFF';
        try {
            const parsed = JSON.parse(selectedTeam.color);
            if (Array.isArray(parsed)) {
                pColor = parsed[0] || '#2563EB';
                sColor = parsed[1] || '#FFFFFF';
            } else {
                pColor = selectedTeam.color; 
            }
        } catch (e) { pColor = selectedTeam.color || '#2563EB'; }
        
        setEditPrimaryColor(pColor);
        setEditSecondaryColor(sColor);
        setEditForm({ team: { ...selectedTeam }, players: JSON.parse(JSON.stringify(teamPlayers)), newLogo: null, newSlip: null, newDoc: null, logoPreview: selectedTeam.logoUrl || null, slipPreview: selectedTeam.slipUrl || null });
        setIsEditingTeam(false); 
        setModalTab('info'); 
    }
  }, [selectedTeam]);

  const notify = (title: string, msg: string, type: 'success' | 'error' | 'info' | 'warning') => { if (showNotification) showNotification(title, msg, type); else notifyUser(title, msg, type); };
  const validateFile = (file: File, type: 'image' | 'doc') => {
    const limit = type === 'image' ? MAX_IMAGE_SIZE : MAX_DOC_SIZE;
    if (file.size > limit) { notify("ไฟล์ใหญ่เกินไป", `ขนาดไฟล์ต้องไม่เกิน ${limit / 1024 / 1024}MB`, "error"); return false; }
    return true;
  };

  const handleStatusUpdate = async (teamId: string, status: 'Approved' | 'Rejected') => { 
      const currentTeam = editForm?.team || localTeams.find(t => t.id === teamId); 
      if (!currentTeam) return; 
      if (status === 'Rejected') { setRejectReasonInput(''); setRejectModal({ isOpen: true, teamId }); return; } 
      
      executeWithReload(async () => {
          await updateTeamStatus(teamId, status, currentTeam.group, '');
      }, status === 'Approved' ? "อนุมัติทีมเรียบร้อย" : "บันทึกการไม่อนุมัติเรียบร้อย", "กำลังอัปเดตสถานะทีม...");
  };

  const confirmReject = async () => {
      if (!rejectModal.teamId) return;
      if (!rejectReasonInput.trim()) { notify("แจ้งเตือน", "กรุณาระบุเหตุผล", "warning"); return; }
      const currentTeam = editForm?.team || localTeams.find(t => t.id === rejectModal.teamId);
      if (!currentTeam) return;
      setRejectModal({ isOpen: false, teamId: null });
      
      executeWithReload(async () => {
          await updateTeamStatus(currentTeam.id, 'Rejected', currentTeam.group, rejectReasonInput);
      }, "บันทึกการไม่อนุมัติเรียบร้อย", "กำลังบันทึกสถานะ...");
  };
  
  const handleDeleteTeam = async (teamId: string) => {
      if (!await confirmAction('การกระทำนี้ไม่สามารถย้อนกลับได้', { title: 'ยืนยันการลบทีมนี้?', dangerous: true, confirmText: 'ลบทีม' })) return;
      executeWithReload(async () => {
          await deleteTeam(teamId);
      }, "ลบทีมเรียบร้อย", "กำลังลบข้อมูลทีม...");
  };

  // --- LIVE DRAW LOGIC ---
  const prepareLiveDraw = () => {
      const approvedTeams = localTeams.filter(t => t.status === 'Approved');
      if (approvedTeams.length === 0) { 
          notify("แจ้งเตือน", "ไม่มีทีมที่ Approved เพื่อจับฉลาก", "warning"); 
          return; 
      }
      
      const groups: Record<string, Team[]> = {};
      const groupNames = Array(Math.max(1, drawGroupCount)).fill(null).map((_, i) => String.fromCharCode(65 + i));
      groupNames.forEach(g => groups[g] = []);
      
      setPoolTeams([...approvedTeams]); 
      setLiveGroups(groups); 
      setDrawnCount(0); 
      setIsLiveDrawActive(true); 
      setLiveDrawStep('idle'); 
      setIsDrawModalOpen(false);
  };

  const fireLocalConfetti = (opts: any) => { 
      if (confettiCanvasRef.current) { 
          const myConfetti = confetti.create(confettiCanvasRef.current, { resize: true, useWorker: true }); 
          myConfetti(opts); 
      } 
  };

  const getNextTargetGroup = () => { 
      const groupNames = Object.keys(liveGroups).sort(); 
      let minCount = Infinity; 
      let target = groupNames[0]; 
      
      for (const g of groupNames) { 
          if (liveGroups[g].length < minCount) { 
              minCount = liveGroups[g].length; 
              target = g; 
          } 
      } 
      
      // If the smallest group is already full, then ALL groups are full
      if (minCount >= teamsPerGroup) return null; 
      return target; 
  };

  const requestRemoveTeam = (team: Team, group: string) => { 
      if (liveDrawStep === 'spinning') return; 
      setRemoveConfirmModal({ isOpen: true, team, group }); 
  };

  const confirmRemoveTeam = () => { 
      const { team, group } = removeConfirmModal; 
      if (!team || !group) return; 
      
      setLiveGroups(prev => ({ 
          ...prev, 
          [group]: prev[group].filter(t => t.id !== team.id) 
      })); 
      
      setPoolTeams(prev => [team, ...prev]); 
      setDrawnCount(prev => prev - 1); 
      
      if (liveDrawStep === 'finished') { 
          setLiveDrawStep('idle'); 
          setCurrentSpinName("..."); 
          setCurrentSpinGroup(""); 
      } 
      
      setRemoveConfirmModal({ isOpen: false, team: null, group: null }); 
  };

  const resetDraw = () => { setResetConfirmModal(true); };

  const confirmResetDraw = () => { 
      const allTeams: Team[] = []; 
      Object.values(liveGroups).forEach((groupTeams: Team[]) => { allTeams.push(...groupTeams); });
      
      setPoolTeams(prev => { 
          const existingIds = new Set(prev.map(t => t.id)); 
          const uniqueReturning = allTeams.filter(t => !existingIds.has(t.id)); 
          return [...prev, ...uniqueReturning]; 
      }); 
      
      const groups: Record<string, Team[]> = {}; 
      Object.keys(liveGroups).forEach(g => groups[g] = []); 
      setLiveGroups(groups); 
      setDrawnCount(0); 
      setLiveDrawStep('idle'); 
      setCurrentSpinName("..."); 
      setCurrentSpinGroup(""); 
      setResetConfirmModal(false); 
      notify("Reset", "รีเซ็ตข้อมูลเรียบร้อย", "info"); 
  };

  const startLiveDrawSequence = async (isFastMode: boolean = false) => { 
      if (isDrawing || liveDrawStep === 'spinning') return;
      
      const targetGroup = getNextTargetGroup(); 
      if (!targetGroup) { 
          notify("เต็มแล้ว", "ทุกกลุ่มมีจำนวนทีมครบตามที่กำหนด", "warning"); 
          setLiveDrawStep('finished'); 
          return; 
      } 
      
      if (poolTeams.length === 0) { 
          notify("หมดทีม", "ไม่มีทีมในโถแล้ว", "warning"); 
          setLiveDrawStep('finished'); 
          return; 
      } 
      
      setIsDrawing(true);
      setLiveDrawStep('spinning'); 
      setCurrentSpinGroup(targetGroup); 
      
      let currentPool = [...poolTeams]; 
      
      // Shuffle pool for randomness
      for (let i = currentPool.length - 1; i > 0; i--) { 
          const j = Math.floor(Math.random() * (i + 1)); 
          const temp = currentPool[i]; 
          currentPool[i] = currentPool[j]; 
          currentPool[j] = temp; 
      } 
      
      const spinDuration = isFastMode ? 300 : 1500; 
      const interval = 80; 
      const steps = spinDuration / interval; 
      
      for (let s = 0; s < steps; s++) { 
          const randomTeam = currentPool[Math.floor(Math.random() * currentPool.length)]; 
          setCurrentSpinName(randomTeam.name); 
          await new Promise(r => setTimeout(r, interval)); 
      } 
      
      // Pick the winner
      const pickedTeam = currentPool.shift(); 
      if (!pickedTeam) { 
          setLiveDrawStep('finished'); 
          setIsDrawing(false);
          return; 
      } 
      
      setCurrentSpinName(pickedTeam.name); 
      
      if (!isFastMode) { 
          setLatestReveal(pickedTeam); 
          fireLocalConfetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } }); 
          await new Promise(r => setTimeout(r, 2000)); 
          setLatestReveal(null); 
      } 
      
      setLiveGroups(prev => ({ 
          ...prev, 
          [targetGroup]: [...(prev[targetGroup] || []), pickedTeam] 
      })); 
      
      setDrawnCount(prev => prev + 1); 
      setPoolTeams([...currentPool]); 
      
      const nextTarget = getNextTargetGroup(); 
      if (currentPool.length === 0 || !nextTarget) { 
          if (!isFastMode) { 
              setLiveDrawStep('finished'); 
              setCurrentSpinName("เสร็จสิ้น!"); 
              setCurrentSpinGroup("-"); 
              fireLocalConfetti({ particleCount: 200, spread: 100, origin: { y: 0.5 } }); 
          } else {
              setLiveDrawStep('finished'); 
          }
      } else { 
          setLiveDrawStep('idle'); 
      } 
      setIsDrawing(false);
  };

  const drawRoundBatch = async () => { 
      if (isDrawing || liveDrawStep === 'spinning') return; 
      
      setIsDrawing(true); 
      setLiveDrawStep('spinning');
      
      let localPool = [...poolTeams]; 
      const groupNames = Object.keys(liveGroups).sort(); 
      
      // Try to fill one spot in each group (Round Robin filling)
      for (const groupName of groupNames) { 
          if (localPool.length === 0) break; 
          if (liveGroups[groupName].length >= teamsPerGroup) continue; 
          
          setCurrentSpinGroup(groupName); 
          
          // Short spin animation
          const steps = 6; 
          for (let s = 0; s < steps; s++) { 
              const randomIdx = Math.floor(Math.random() * localPool.length); 
              setCurrentSpinName(localPool[randomIdx].name); 
              await new Promise(r => setTimeout(r, 50)); 
          } 
          
          const winnerIdx = Math.floor(Math.random() * localPool.length); 
          const winner = localPool[winnerIdx]; 
          localPool.splice(winnerIdx, 1); 
          
          setCurrentSpinName(winner.name); 
          
          // Update state step by step visually
          setLiveGroups(prev => ({ ...prev, [groupName]: [...(prev[groupName] || []), winner] })); 
          setPoolTeams(prev => prev.filter(t => t.id !== winner.id)); 
          setDrawnCount(prev => prev + 1); 
          
          await new Promise(r => setTimeout(r, 300)); 
      } 
      
      setLiveDrawStep('idle'); 
      setCurrentSpinGroup(""); 
      
      if (localPool.length === 0) { 
          setLiveDrawStep('finished'); 
          setCurrentSpinName("เสร็จสิ้น!"); 
          setCurrentSpinGroup("-"); 
          fireLocalConfetti({ particleCount: 300, spread: 150, origin: { y: 0.5 }, colors: ['#f43f5e', '#8b5cf6', '#10b981'] }); 
      } 
      setIsDrawing(false);
  };
  
  const handleSaveDrawResults = async () => { 
      setIsDrawing(true); 
      const updates: { teamId: string, group: string }[] = []; 
      
      if (liveGroups) {
          // Use standard loops to avoid potential iterator issues on some platforms
          const groupNames = Object.keys(liveGroups);
          for (let i = 0; i < groupNames.length; i++) {
              const groupName = groupNames[i];
              const teams = liveGroups[groupName];
              if (teams) {
                  for (let j = 0; j < teams.length; j++) {
                      updates.push({ teamId: teams[j].id, group: groupName });
                  }
              }
          }
      }
      
      executeWithReload(async () => {
          const promises = updates.map(u => updateTeamStatus(u.teamId, 'Approved', u.group, '')); 
          await Promise.all(promises); 
          setIsLiveDrawActive(false);
      }, "อัปเดตกลุ่มการแข่งขันเรียบร้อยแล้ว", "กำลังบันทึกผลการจับฉลาก...");
      
      setIsDrawing(false); 
  };

  const handleSettingsLogoChange = async (file: File) => {
      if (!file || !validateFile(file, 'image')) return;
      try { const preview = URL.createObjectURL(file); setSettingsLogoPreview(preview); const base64 = await fileToBase64(file); setConfigForm(prev => ({ ...prev, competitionLogo: base64 })); } catch (e) { console.error("Logo Error", e); }
  };

  const handleObjectiveImageChange = async (file: File) => {
      if (!file || !validateFile(file, 'image')) return;
      try { const preview = URL.createObjectURL(file); setObjectiveImagePreview(preview); const base64 = await fileToBase64(file); setConfigForm(prev => ({ ...prev, objectiveImageUrl: base64 })); } catch (e) { console.error("Obj Img Error", e); }
  };

  const handleSaveConfig = async () => { 
      setIsSavingSettings(true); 
      executeWithReload(async () => {
          await saveSettings(configForm);
      }, "บันทึกการตั้งค่าเรียบร้อย", "กำลังบันทึกการตั้งค่า...");
      setIsSavingSettings(false); 
  };

  const handleEditFieldChange = (field: keyof Team, value: string) => { if (editForm) setEditForm({ ...editForm, team: { ...editForm.team, [field]: value } }); };
  const handleColorChange = (type: 'primary' | 'secondary', color: string) => {
      if (!editForm) return;
      const p = type === 'primary' ? color : editPrimaryColor;
      const s = type === 'secondary' ? color : editSecondaryColor;
      if (type === 'primary') setEditPrimaryColor(color); else setEditSecondaryColor(color);
      handleEditFieldChange('color', JSON.stringify([p, s]));
  };
  const handlePlayerChange = (index: number, field: keyof Player, value: string) => { if (editForm) { const updatedPlayers = [...(editForm.players as Player[])]; updatedPlayers[index] = { ...updatedPlayers[index], [field]: value }; setEditForm({ ...editForm, players: updatedPlayers }); } };
  const handleDateInput = (index: number, value: string) => {
      let cleaned = value.replace(/[^0-9]/g, ''); if (cleaned.length > 8) cleaned = cleaned.substring(0, 8);
      let formatted = cleaned; if (cleaned.length > 2) formatted = cleaned.substring(0, 2) + '/' + cleaned.substring(2); if (cleaned.length > 4) formatted = formatted.substring(0, 5) + '/' + cleaned.substring(4);
      handlePlayerChange(index, 'birthDate', formatted);
  };
  const handlePlayerPhotoChange = async (index: number, file: File) => {
      if (editForm && file) { if (!validateFile(file, 'image')) return; try { const base64 = await fileToBase64(file); const updatedPlayers = [...(editForm.players as Player[])]; updatedPlayers[index] = { ...updatedPlayers[index], photoUrl: base64 }; setEditForm({ ...editForm, players: updatedPlayers }); } catch (e) { console.error("Error converting player photo", e); } }
  };
  const handleFileChange = (type: 'logo' | 'slip' | 'doc', file: File) => {
      if (editForm && file) {
          if (type === 'doc') { if (!validateFile(file, 'doc')) return; } else { if (!validateFile(file, 'image')) return; }
          const previewUrl = URL.createObjectURL(file);
          if (type === 'logo') {
              setEditForm({ ...editForm, newLogo: file, logoPreview: previewUrl }); 
          } else if (type === 'slip') {
              setEditForm({ ...editForm, newSlip: file, slipPreview: previewUrl }); 
          } else if (type === 'doc') {
              setEditForm({ ...editForm, newDoc: file });
          }
      }
  };
  const handleAddPlayer = () => { if (!editForm) return; const newPlayer: Player = { id: `TEMP_${Date.now()}_${Math.floor(Math.random()*1000)}`, teamId: editForm.team.id, name: '', number: '', position: 'Player', photoUrl: '', birthDate: '' }; setEditForm({ ...editForm, players: [...(editForm.players as Player[]), newPlayer] }); };
  const removePlayer = (index: number) => { if (!editForm) return; const updatedPlayers = (editForm.players as Player[]).filter((_, i) => i !== index); setEditForm({ ...editForm, players: updatedPlayers }); };

  const handleSaveTeamChanges = async (updatedTeam: Team, updatedPlayers: Player[]) => {
      // เก็บไฟล์ที่เลือกไว้ก่อนปิดโมดัล — setEditForm(null) ทำให้อ้างถึงไม่ได้แล้ว
      const pendingLogo = editForm?.newLogo ?? null;
      const pendingDoc  = editForm?.newDoc ?? null;
      const pendingSlip = editForm?.newSlip ?? null;

      // Close modal immediately to show the skeleton on main page
      setIsEditingTeam(false);
      setEditForm(null);
      setSelectedTeam(null); // Deselect team

      // updateTeamData ส่ง status/group/schoolId ไปด้วยแล้วในคำสั่งเดียว
      // ถ้าเรียก updateTeamStatus ซ้ำอีกรอบ กรณี "ปฏิเสธ" จะไปเข้า reviewTeam
      // ที่บังคับต้องมีเหตุผล แล้วขึ้น error ทั้งที่บันทึกสำเร็จไปแล้ว
      executeWithReload(async () => {
          /**
           * อัปไฟล์ก่อน แล้วค่อยส่ง URL ไปกับข้อมูลทีม
           *
           * ของเดิมเก็บ File ไว้ใน editForm แล้วโชว์ preview จาก blob URL
           * แต่ไม่เคยอัปขึ้น server และ updateTeamData ก็ไม่ได้ส่ง logoUrl ไปเลย
           * แอดมินจึงเห็นรูปเปลี่ยนบนจอ กดบันทึกขึ้นว่าสำเร็จ แล้วโลโก้เหมือนเดิม
           */
          const files: { logoUrl?: string; docUrl?: string; slipUrl?: string } = {};
          if (pendingLogo) files.logoUrl = await uploadFile(pendingLogo, 'logo');
          if (pendingDoc)  files.docUrl  = await uploadFile(pendingDoc, 'doc');
          if (pendingSlip) files.slipUrl = await uploadFile(pendingSlip, 'slip');

          await updateTeamData(updatedTeam, updatedPlayers, files);
      }, "อัปเดตข้อมูลและรีโหลดเรียบร้อย", "กำลังอัปเดตข้อมูลทีม...");
  };
  
  const handleAddNewNews = () => {
      setNewsForm({ id: null, title: '', content: '', imageFile: null, imagePreview: null, docFile: null, tournamentId: 'global' });
      setIsNewsModalOpen(true);
  };

  const handleEditNews = (item: NewsItem) => { 
      setNewsForm({ 
          id: item.id, 
          title: item.title, 
          content: item.content, 
          imageFile: null, 
          imagePreview: item.imageUrl || null, 
          docFile: null,
          tournamentId: item.tournamentId || 'global' 
      }); 
      setIsNewsModalOpen(true);
  };

  const handleSaveNews = async () => { 
      if(!newsForm.title || !newsForm.content) { notify("ข้อมูลไม่ครบ", "กรุณาระบุหัวข้อและเนื้อหาข่าว", "warning"); return; } 
      if (newsForm.imageFile && !validateFile(newsForm.imageFile, 'image')) return;
      if (newsForm.docFile && !validateFile(newsForm.docFile, 'doc')) return;
      
      const isEditing = !!newsForm.id;
      setIsNewsModalOpen(false); // Close first for UX
      
      executeWithReload(async () => {
          // อัปโหลดไฟล์แยกก่อน แล้วส่งเฉพาะ URL เข้า manageNews
          // การยัด Base64 ทั้งไฟล์ลง JSON ทำให้ request บวมและ proxy timeout
          const [uploadedImageUrl, uploadedDocumentUrl] = await Promise.all([
              newsForm.imageFile ? uploadFile(newsForm.imageFile, 'news') : Promise.resolve(undefined),
              newsForm.docFile ? uploadFile(newsForm.docFile, 'doc') : Promise.resolve(undefined),
          ]);
          
          const newsData: Partial<NewsItem> = { 
              id: newsForm.id || Date.now().toString(), 
              title: newsForm.title, 
              content: newsForm.content, 
              timestamp: Date.now(), 
              tournamentId: newsForm.tournamentId,
              imageUrl: uploadedImageUrl || newsForm.imagePreview || undefined,
              documentUrl: uploadedDocumentUrl,
          }; 
          
          const action = isEditing ? 'edit' : 'add'; 
          await manageNews(action, newsData); 
          setNewsForm({ id: null, title: '', content: '', imageFile: null, imagePreview: null, docFile: null, tournamentId: 'global' }); 
      }, isEditing ? "แก้ไขข่าวเรียบร้อย" : "เพิ่มข่าวเรียบร้อย", isEditing ? "กำลังแก้ไขข่าว..." : "กำลังเพิ่มข่าว...");
  };
  
  const triggerDeleteNews = (id: string) => { 
      setNewsToDelete(id);
  };
  
  const confirmDeleteNews = async () => {
      if (!newsToDelete) return;
      
      // 1. Close Modal immediately
      const idToDelete = newsToDelete;
      setNewsToDelete(null); 
      setIsDeletingNews(true); // Optional local state, but overlay takes over

      // 2. Execute with global loader
      executeWithReload(async () => {
          await manageNews('delete', { id: idToDelete }); 
      }, "ลบข่าวเรียบร้อย", "กำลังลบข่าวสาร...");
      
      setIsDeletingNews(false);
  };

  const handleSort = (key: string) => { let direction: 'asc' | 'desc' = 'asc'; if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') { direction = 'desc'; } setSortConfig({ key, direction }); };
  const sortedTeams = [...localTeams].sort((a: any, b: any) => { if (!sortConfig) return 0; if (a[sortConfig.key] < b[sortConfig.key]) return sortConfig.direction === 'asc' ? -1 : 1; if (a[sortConfig.key] > b[sortConfig.key]) return sortConfig.direction === 'asc' ? 1 : -1; return 0; });
  
  const filteredTeams = sortedTeams.filter(t => {
      const matchSearch = t.name.toLowerCase().includes(searchTerm.toLowerCase()) || t.province?.toLowerCase().includes(searchTerm.toLowerCase()) || t.district?.toLowerCase().includes(searchTerm.toLowerCase());
      // 'Pending' คือกลุ่ม ไม่ใช่สถานะเดียว — ตรงกับการ์ด "รอการอนุมัติ"
      // ที่นับทุกทีมที่ยังไม่ถูกตัดสิน (ยังไม่อนุมัติ และยังไม่ถูกตีกลับ)
      const matchStatus = filterStatus === 'All'
        || (filterStatus === 'Pending'
              ? (t.status !== 'Approved' && t.status !== 'Rejected' && t.status !== 'Withdrawn')
              : t.status === filterStatus);
      return matchSearch && matchStatus;
  });

  const downloadCSV = () => { try { const headers = "ID,ชื่อทีม,ตัวย่อ,สถานะ,กลุ่ม,อำเภอ,จังหวัด,ผู้อำนวยการ,ผู้จัดการ,เบอร์โทร,ผู้ฝึกสอน,เบอร์โทรโค้ช"; const rows: string[] = filteredTeams.map(t => `"${t.id}","${t.name}","${t.shortName}","${t.status}","${t.group || ''}","${t.district}","${t.province}","${t.directorName || ''}","${t.managerName}","'${t.managerPhone || ''}","${t.coachName}","'${t.coachPhone || ''}"` ); const csvContent = [headers, ...rows].join("\n"); const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.setAttribute("href", url); link.setAttribute("download", "teams_data.csv"); document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url); } catch (e) { console.error("CSV Download Error:", e); notify("ผิดพลาด", "ดาวน์โหลด CSV ไม่สำเร็จ", "error"); } };
  
  /**
   * เลือกรูปข่าว — ย่อและแปลงเป็น WebP ตั้งแต่ในเครื่องก่อนเก็บเข้าฟอร์ม
   *
   * เจ้าภาพอัปรูปจากกล้องมือถือเต็มใบ (3-5 MB) ย่อก่อนเหลือหลักร้อย KB
   * ทำให้ส่งเร็วขึ้นสิบเท่าบนเน็ตมือถือที่สนาม และไม่กินหน่วยความจำโฮสต์ตอน decode
   * ฝั่ง server ยังแปลงซ้ำอีกชั้นเสมอ เผื่อเบราว์เซอร์เก่าที่ทำตรงนี้ไม่ได้
   */
  const handleNewsImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const picked = e.target.files?.[0];
      if (!picked) return;

      if (!isSupportedImage(picked)) {
          notify('ไฟล์ไม่รองรับ', 'เลือกได้เฉพาะรูป JPG, PNG, WebP หรือ HEIC', 'warning');
          return;
      }

      // ตั้งรูปตัวอย่างจากไฟล์ต้นฉบับทันที ไม่ต้องรอบีบเสร็จ
      // การบีบรูปใหญ่ใช้เวลาเป็นวินาที ถ้ารอจะเหมือนกดแล้วไม่มีอะไรเกิดขึ้น
      setNewsForm(prev => ({ ...prev, imageFile: picked, imagePreview: URL.createObjectURL(picked) }));

      const resized = await resizeImageBeforeUpload(picked);
      setNewsForm(prev =>
          // ผู้ใช้อาจเลือกรูปใหม่หรือกดลบทิ้งระหว่างที่กำลังบีบอยู่ — อย่าเขียนทับ
          prev.imageFile === picked ? { ...prev, imageFile: resized } : prev);
  };

  const handleNewsDocChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
          setNewsForm({ ...newsForm, docFile: e.target.files[0] });
      }
  };

  // Filtered Lists for other tabs
  const filteredNews = localNews.filter(n => {
      const matchesContext = !currentTournament || n.tournamentId === 'global' || String(n.tournamentId) === String(currentTournament.id);
      const matchesSearch = n.title.toLowerCase().includes(newsSearch.toLowerCase()) || n.content.toLowerCase().includes(newsSearch.toLowerCase());
      return matchesContext && matchesSearch;
  });

  const filteredDonations = donationList.filter(d => {
      const matchesContext = !currentTournament || String(d.tournamentId) === String(currentTournament.id);
      const matchesSearch = d.donorName.toLowerCase().includes(donationSearch.toLowerCase()) || d.phone.includes(donationSearch);
      return matchesContext && matchesSearch;
  });

  /**
   * สถิติผู้ใช้ — นับจากรายการทั้งหมด ไม่ใช่เฉพาะที่กรองอยู่
   *
   * ตัวเลขบนการ์ดต้องคงที่ไม่ว่าจะพิมพ์ค้นหาอะไรอยู่ ไม่งั้นมันจะกลายเป็น
   * "ผลการค้นหา" ที่หน้าตาเหมือนสถิติ ซึ่งอ่านผิดได้ง่ายมาก
   */
  const userStats = React.useMemo(() => {
      const st = {
          total: userList.length,
          crew: 0,        // แอดมิน + เจ้าหน้าที่
          line: 0,
          verified: 0,    // ผูกโรงเรียนและผู้ดูแลรับรองแล้ว
          selfPicked: 0,  // ผู้ใช้เลือกโรงเรียนเอง ยังไม่รับรอง
          noSchool: 0,    // ยังไม่เคยตอบเรื่องโรงเรียน
      };
      for (const u of userList) {
          if (u.role === 'admin' || u.role === 'staff') st.crew++;
          if (u.type === 'line') st.line++;
          if (u.schoolName) { u.schoolVerified ? st.verified++ : st.selfPicked++; }
          else if (!u.schoolChosen) st.noSchool++;
      }
      return st;
  }, [userList]);

  const filteredUsers = React.useMemo(() => userList.filter(u => {
      const s = userSearch.trim().toLowerCase();
      const hit = s === ''
          || (u.displayName || '').toLowerCase().includes(s)
          || (u.username || '').toLowerCase().includes(s)
          || (u.phoneNumber || '').includes(s)
          || (u.schoolName || '').toLowerCase().includes(s);
      if (!hit) return false;
      if (userRoleFilter !== 'all' && (u.role ?? 'user') !== userRoleFilter) return false;
      if (userSchoolFilter === 'verified' && !(u.schoolName && u.schoolVerified)) return false;
      if (userSchoolFilter === 'self' && !(u.schoolName && !u.schoolVerified)) return false;
      if (userSchoolFilter === 'none' && (u.schoolName || u.schoolChosen)) return false;
      return true;
  }), [userList, userSearch, userRoleFilter, userSchoolFilter]);

  // แบ่งหน้า — โรงเรียนในเขตมีครูหลายร้อยคน เรนเดอร์ทีเดียวหมดทำให้หน้าค้าง
  const USERS_PER_PAGE = 25;
  const userPageCount = Math.max(1, Math.ceil(filteredUsers.length / USERS_PER_PAGE));
  const pagedUsers = filteredUsers.slice(
      (Math.min(userPage, userPageCount) - 1) * USERS_PER_PAGE,
      Math.min(userPage, userPageCount) * USERS_PER_PAGE);

  // เปลี่ยนคำค้นหรือตัวกรองแล้วต้องกลับหน้าแรก
  // ไม่งั้นจะค้างอยู่หน้า 7 ของผลลัพธ์ที่เหลือ 2 หน้า แล้วเห็นหน้าว่าง
  React.useEffect(() => { setUserPage(1); },
      [userSearch, userRoleFilter, userSchoolFilter]);

  /** รายชื่อโรงเรียนสำหรับตัวเลือก — โหลดครั้งเดียวแล้วใช้ซ้ำ */
  const schoolCacheRef = React.useRef<PickerItem[] | null>(null);
  const loadSchoolOptions = async (): Promise<PickerItem[]> => {
      if (schoolCacheRef.current) return schoolCacheRef.current;
      const r = await apiGet('listSchools');
      const list = (r.schools ?? []).map((s: any): PickerItem => ({
          id: s.schoolId,
          label: s.schoolName,
          sub: [s.district, s.province].filter(Boolean).join(' · '),
          badge: s.hasAccessCode ? 'มีรหัส' : undefined,
      }));
      schoolCacheRef.current = list;
      return list;
  };

  const formData = editForm?.team;

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-8 pb-24">
      {/* GLOBAL LOADING OVERLAY - Z-Index Higher than Modals */}
      {reloadMessage && (
          <div className="fixed inset-0 z-[2200] bg-white/90 backdrop-blur-sm flex items-center justify-center animate-in fade-in duration-300">
              <div className="relative flex flex-col items-center justify-center p-8 bg-white rounded-2xl shadow-2xl border border-slate-100">
                  <div className="relative w-16 h-16 mb-4">
                      <div className="absolute inset-0 border-4 border-slate-100 rounded-full"></div>
                      <div className="absolute inset-0 border-4 border-indigo-600 rounded-full border-t-transparent animate-spin"></div>
                  </div>
                  <h3 className="text-xl font-bold text-slate-800 animate-pulse">{reloadMessage}</h3>
                  <p className="text-sm text-slate-400 mt-2">กรุณารอสักครู่...</p>
              </div>
          </div>
      )}

      {/* Modals and Overlays */}
      {previewImage && (
          <div className="fixed inset-0 z-[1400] bg-black/80 modal-sheet flex items-end md:items-center justify-center p-0 md:p-4 backdrop-blur-sm" onClick={() => setPreviewImage(null)}>
              <div className="relative max-w-4xl max-h-[90vh]">
                  <img src={previewImage} className="max-w-full max-h-[90vh] rounded shadow-lg" />
                  <button className="absolute -top-4 -right-4 bg-white rounded-full p-2 text-slate-800" onClick={() => setPreviewImage(null)}><X className="w-6 h-6"/></button>
              </div>
          </div>
      )}
      
      {/* NEWS MODAL */}
      {isNewsModalOpen && (
          <div className="fixed inset-0 z-[1400] bg-black/60 backdrop-blur-sm modal-sheet flex items-end md:items-center justify-center p-0 md:p-4">
              <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 animate-in zoom-in duration-200 flex flex-col max-h-[90vh]">
                  <div className="flex justify-between items-center mb-4 border-b pb-2">
                      <h3 className="font-bold text-lg text-slate-800">{newsForm.id ? 'แก้ไขข่าวสาร' : 'เพิ่มข่าวสาร'}</h3>
                      <button onClick={() => setIsNewsModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5"/></button>
                  </div>
                  <div className="space-y-4 overflow-y-auto flex-1 p-1">
                      <div>
                          <label className="block text-sm font-bold text-slate-700 mb-1">หัวข้อข่าว</label>
                          <input type="text" value={newsForm.title} onChange={e => setNewsForm({...newsForm, title: e.target.value})} className="w-full p-2 border rounded-lg" placeholder="หัวข้อข่าว..." />
                      </div>
                      <div>
                          <label className="block text-sm font-bold text-slate-700 mb-1">เนื้อหา</label>
                          <textarea value={newsForm.content} onChange={e => setNewsForm({...newsForm, content: e.target.value})} className="w-full p-2 border rounded-lg h-32" placeholder="รายละเอียด..." />
                      </div>
                      
                      {/* Scope Selection */}
                      <div>
                          <label className="block text-sm font-bold text-slate-700 mb-1">การแสดงผล</label>
                          <select value={newsForm.tournamentId} onChange={e => setNewsForm({...newsForm, tournamentId: e.target.value})} className="w-full p-2 border rounded-lg bg-white">
                              <option value="global">Global (แสดงหน้าแรก)</option>
                              {tournaments?.map(t => (
                                  <option key={t.id} value={t.id}>เฉพาะรายการ: {t.name}</option>
                              ))}
                          </select>
                      </div>

                      <div>
                          <label className="block text-sm font-bold text-slate-700 mb-1">รูปภาพประกอบ</label>
                          <div className="border-2 border-dashed border-slate-300 rounded-xl p-4 text-center hover:bg-slate-50 transition relative">
                              {newsForm.imagePreview ? (
                                  <div className="relative">
                                      <img src={newsForm.imagePreview} className="max-h-40 mx-auto rounded shadow-sm" />
                                      <button onClick={() => setNewsForm({...newsForm, imageFile: null, imagePreview: null})} className="absolute -top-2 -right-2 bg-red-500 text-white p-1 rounded-full"><X className="w-3 h-3"/></button>
                                  </div>
                              ) : (
                                  <label className="cursor-pointer block w-full h-full">
                                      <Image className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                                      <span className="text-xs text-slate-500">คลิกเพื่ออัปโหลดรูป</span>
                                      <input type="file" accept={SUPPORTED_IMAGE_ACCEPT} className="hidden" onChange={handleNewsImageChange} />
                                  </label>
                              )}
                          </div>
                      </div>

                      <div>
                          <label className="block text-sm font-bold text-slate-700 mb-1">เอกสารแนบ (PDF/Doc)</label>
                          <div className="flex items-center gap-2">
                              <label className="cursor-pointer bg-white border px-3 py-2 rounded-lg text-sm hover:bg-slate-50 flex items-center gap-2">
                                  <Paperclip className="w-4 h-4"/> เลือกไฟล์
                                  <input type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={handleNewsDocChange} />
                              </label>
                              {newsForm.docFile ? <span className="text-xs text-green-600 font-bold truncate">{newsForm.docFile.name}</span> : (newsForm.id && newsForm.docFile === null) ? <span className="text-xs text-slate-400">ยังไม่เปลี่ยนไฟล์</span> : null}
                          </div>
                      </div>
                  </div>
                  <div className="flex gap-3 mt-6 shrink-0">
                      <button onClick={() => setIsNewsModalOpen(false)} className="flex-1 py-2 border rounded-lg text-slate-600 hover:bg-slate-50">ยกเลิก</button>
                      <button onClick={handleSaveNews} disabled={isSavingNews} className="flex-1 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-bold flex items-center justify-center gap-2">
                          {isSavingNews ? <Loader2 className="w-4 h-4 animate-spin"/> : 'บันทึก'}
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* DONATION DETAIL MODAL */}
      {selectedDonation && (
          <div className="fixed inset-0 z-[1400] bg-black/60 backdrop-blur-sm modal-sheet flex items-end md:items-center justify-center p-0 md:p-4" onClick={() => setSelectedDonation(null)}>
              <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full flex flex-col md:flex-row overflow-hidden animate-in zoom-in duration-200 max-h-[90vh]" onClick={e => e.stopPropagation()}>
                  {/* Left: Slip Image */}
                  <div className="w-full md:w-1/2 bg-slate-900 flex items-center justify-center p-4 relative group">
                      {selectedDonation.slipUrl ? (
                          <img src={selectedDonation.slipUrl} className="max-w-full max-h-[40vh] md:max-h-full object-contain cursor-zoom-in" onClick={() => setPreviewImage(selectedDonation.slipUrl)} />
                      ) : (
                          <div className="text-slate-500 flex flex-col items-center"><Image className="w-12 h-12 mb-2 opacity-20"/><span>ไม่มีรูปสลิป</span></div>
                      )}
                      {/* Zoom hint */}
                      {selectedDonation.slipUrl && <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/50 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition">คลิกเพื่อขยาย</div>}
                  </div>
                  
                  {/* Right: Info & Actions */}
                  <div className="w-full md:w-1/2 p-6 flex flex-col overflow-y-auto">
                      <div className="flex justify-between items-start mb-4">
                          <div>
                              <h3 className="font-bold text-lg text-slate-800">{selectedDonation.donorName}</h3>
                              <p className="text-xs text-slate-500">{new Date(selectedDonation.timestamp).toLocaleString('th-TH')}</p>
                          </div>
                          <button onClick={() => setSelectedDonation(null)}><X className="w-5 h-5 text-slate-400 hover:text-slate-600"/></button>
                      </div>

                      <div className="space-y-4 flex-1">
                          <div className="bg-indigo-50 p-3 rounded-xl border border-indigo-100">
                              <p className="text-xs text-indigo-500 font-bold uppercase">จำนวนเงิน</p>
                              <p className="text-2xl font-black text-indigo-700">{selectedDonation.amount.toLocaleString()} บาท</p>
                          </div>

                          <div className="space-y-2 text-sm">
                              <div className="flex justify-between border-b border-slate-100 pb-1">
                                  <span className="text-slate-500">เบอร์โทร:</span>
                                  <span className="font-medium">{selectedDonation.phone}</span>
                              </div>
                              <div className="flex justify-between border-b border-slate-100 pb-1 items-center">
                                  <span className="text-slate-500">สถานะ:</span>
                                  <div className="flex items-center gap-2">
                                      <span className={`font-bold ${selectedDonation.status === 'Verified' ? 'text-green-600' : selectedDonation.status === 'Rejected' ? 'text-red-600' : 'text-orange-500'}`}>{selectedDonation.status}</span>
                                  </div>
                              </div>
                              {/* Status Edit Controls */}
                              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                                  <label className="block text-xs font-bold text-slate-500 mb-2">ปรับปรุงสถานะ</label>
                                  <div className="grid grid-cols-2 gap-2">
                                      <button 
                                          onClick={() => handleVerifyDonation(selectedDonation.id, 'Verified')} 
                                          disabled={selectedDonation.status === 'Verified'}
                                          className={`py-1.5 text-xs font-bold rounded border ${selectedDonation.status === 'Verified' ? 'bg-green-100 text-green-700 border-green-200 cursor-default' : 'bg-white text-slate-600 border-slate-300 hover:bg-green-50 hover:text-green-600 hover:border-green-200'}`}
                                      >
                                          {selectedDonation.status === 'Verified' ? 'Verified ✓' : 'Set Verified'}
                                      </button>
                                      <button 
                                          onClick={() => handleVerifyDonation(selectedDonation.id, 'Rejected')} 
                                          disabled={selectedDonation.status === 'Rejected'}
                                          className={`py-1.5 text-xs font-bold rounded border ${selectedDonation.status === 'Rejected' ? 'bg-red-100 text-red-700 border-red-200 cursor-default' : 'bg-white text-slate-600 border-slate-300 hover:bg-red-50 hover:text-red-600 hover:border-red-200'}`}
                                      >
                                          {selectedDonation.status === 'Rejected' ? 'Rejected ✗' : 'Set Rejected'}
                                      </button>
                                  </div>
                              </div>

                              <div className="flex justify-between items-center border-b border-slate-100 pb-1">
                                  <span className="text-slate-500">แสดงชื่อ:</span>
                                  <button 
                                      onClick={() => handleUpdateDonationAnonymous(!selectedDonation.isAnonymous)}
                                      className={`text-xs font-bold px-2 py-0.5 rounded transition ${selectedDonation.isAnonymous ? 'bg-slate-200 text-slate-600' : 'bg-green-100 text-green-700'}`}
                                  >
                                      {selectedDonation.isAnonymous ? 'ไม่แสดง (Anon)' : 'แสดงปกติ'}
                                  </button>
                              </div>
                          </div>

                          {selectedDonation.isEdonation && (
                              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-sm">
                                  <div className="flex items-center gap-2 mb-2 text-blue-600 font-bold">
                                      <FileCheck className="w-4 h-4"/> ขอ e-Donation
                                  </div>
                                  <p className="text-xs text-slate-500 mb-1">Tax ID: <span className="text-slate-800 font-mono">{selectedDonation.taxId}</span></p>
                                  <p className="text-xs text-slate-500 mb-2">ที่อยู่: {selectedDonation.address}</p>
                                  
                                  {/* Admin File Upload for Tax Receipt */}
                                  <div className="mt-2 pt-2 border-t border-slate-200">
                                      <p className="text-xs font-bold mb-1">หลักฐานการลดหย่อน (Admin Upload)</p>
                                      <div className="flex gap-2 items-center">
                                          <input type="file" accept="image/*,.pdf" className="text-xs w-full" onChange={handleTaxFileSelect} />
                                          {adminTaxFile && (
                                              <button onClick={handleSaveTaxFile} className="bg-blue-600 text-white text-xs px-2 py-1 rounded hover:bg-blue-700">Save</button>
                                          )}
                                      </div>
                                      {selectedDonation.taxFileUrl && (
                                          <a href={selectedDonation.taxFileUrl} target="_blank" className="text-[10px] text-blue-500 underline mt-1 block">ดูไฟล์ที่อัปโหลดแล้ว</a>
                                      )}
                                  </div>
                              </div>
                          )}
                      </div>

                      {/* Footer Actions */}
                      <div className="mt-6 pt-4 border-t border-slate-100">
                          <button onClick={() => handlePrintCertificate(selectedDonation)} disabled={isGeneratingCert} className="w-full bg-slate-800 text-white py-2 rounded-lg font-bold hover:bg-slate-900 transition flex items-center justify-center gap-2">
                              {isGeneratingCert ? <Loader2 className="w-4 h-4 animate-spin"/> : <Printer className="w-4 h-4"/>} พิมพ์เกียรติบัตร
                          </button>
                      </div>
                  </div>
              </div>
          </div>
      )}

      {/* CONFIRM REMOVE TEAM FROM LIVE DRAW */}
      {removeConfirmModal.isOpen && (
          <div className="fixed inset-0 z-[2200] bg-black/60 backdrop-blur-sm modal-sheet flex items-end md:items-center justify-center p-0 md:p-4">
              <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full animate-in zoom-in duration-200">
                  <div className="flex items-center gap-3 text-red-600 mb-4 border-b pb-2">
                      <Trash2 className="w-6 h-6" />
                      <h3 className="font-bold text-lg">นำทีมออก?</h3>
                  </div>
                  <p className="text-slate-600 mb-2 text-sm">คุณต้องการนำทีม <span className="font-bold text-slate-900">{removeConfirmModal.team?.name}</span> ออกจากกลุ่ม <span className="font-bold text-indigo-600">{removeConfirmModal.group}</span></p>
                  <p className="text-xs text-slate-400 mb-6 bg-slate-50 p-2 rounded border">ทีมจะถูกส่งกลับไปยังโถจับฉลาก เพื่อสุ่มใหม่</p>
                  <div className="flex gap-3">
                      <button onClick={() => setRemoveConfirmModal({ isOpen: false, team: null, group: null })} className="flex-1 py-2 border rounded-lg hover:bg-slate-50 text-slate-600 font-bold transition text-sm">ยกเลิก</button>
                      <button onClick={confirmRemoveTeam} className="flex-1 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 font-bold shadow-md transition text-sm">ยืนยันลบ</button>
                  </div>
              </div>
          </div>
      )}

      {/* CONFIRM RESET LIVE DRAW */}
      {resetConfirmModal && (
          <div className="fixed inset-0 z-[2200] bg-black/60 backdrop-blur-sm modal-sheet flex items-end md:items-center justify-center p-0 md:p-4">
              <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full animate-in zoom-in duration-200">
                  <div className="flex items-center gap-3 text-orange-600 mb-4 border-b pb-2">
                      <RotateCcw className="w-6 h-6" />
                      <h3 className="font-bold text-lg">รีเซ็ตการจับฉลาก?</h3>
                  </div>
                  <p className="text-slate-600 mb-6 text-sm">ผลการจับฉลากทั้งหมดจะถูกล้าง และทุกทีมจะกลับเข้าสู่โถจับฉลาก คุณแน่ใจหรือไม่?</p>
                  <div className="flex gap-3">
                      <button onClick={() => setResetConfirmModal(false)} className="flex-1 py-2 border rounded-lg hover:bg-slate-50 text-slate-600 font-bold transition text-sm">ยกเลิก</button>
                      <button onClick={confirmResetDraw} className="flex-1 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 font-bold shadow-md transition text-sm">ยืนยันรีเซ็ต</button>
                  </div>
              </div>
          </div>
      )}
      
      {/* HIDDEN CANVAS FOR CERTIFICATE */}
      <canvas ref={certificateCanvasRef} className="hidden"></canvas>

      {/* CONFIRM DELETE NEWS MODAL */}
      {newsToDelete && (
          <div className="fixed inset-0 z-[1500] bg-black/50 modal-sheet flex items-end md:items-center justify-center p-0 md:p-4 backdrop-blur-sm">
              <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-xs w-full animate-in zoom-in duration-200 text-center">
                  <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Trash2 className="w-8 h-8 text-red-500" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-800 mb-2">ยืนยันการลบข่าว?</h3>
                  <p className="text-sm text-slate-500 mb-6">คุณต้องการลบข่าวสารนี้ออกจากระบบใช่หรือไม่ การกระทำนี้ไม่สามารถย้อนกลับได้</p>
                  <div className="flex gap-3">
                      <button onClick={() => setNewsToDelete(null)} className="flex-1 py-2 border rounded-lg hover:bg-slate-50 text-slate-600 font-bold transition">ยกเลิก</button>
                      <button onClick={confirmDeleteNews} disabled={isDeletingNews} className="flex-1 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 font-bold shadow-md transition flex items-center justify-center gap-2">
                          {isDeletingNews ? <Loader2 className="w-4 h-4 animate-spin"/> : 'ลบเลย'}
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* Live Draw & Setup Modals */}
      {isLiveDrawActive && (
          <div className="fixed inset-0 z-[2000] bg-slate-900 flex flex-col p-0 text-white overflow-hidden">
              <canvas ref={confettiCanvasRef} className="absolute inset-0 pointer-events-none z-[2001] w-full h-full" />
              <div className="flex justify-between items-center p-4 md:p-6 bg-slate-900/90 backdrop-blur z-10 border-b border-white/10">
                  <div className="flex items-center gap-3">
                      <div className="p-2 bg-indigo-600 rounded-lg shadow-lg shadow-indigo-500/50"><Shuffle className="w-6 h-6 text-white" /></div>
                      <div><h1 className="text-2xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-cyan-400">LIVE DRAW STUDIO</h1><p className="text-xs text-slate-400 font-mono">Official Tournament Draw</p></div>
                  </div>
                  <div className="flex items-center gap-4">
                      {liveDrawStep === 'finished' && <button onClick={handleSaveDrawResults} className="px-6 py-3 bg-green-500 hover:bg-green-600 text-white rounded-full font-bold shadow-lg shadow-green-500/30 flex items-center gap-2 transition animate-bounce" disabled={isDrawing}>{isDrawing ? <Loader2 className="w-5 h-5 animate-spin"/> : <Save className="w-5 h-5" />} บันทึกผล</button>}
                      <button onClick={() => setIsLiveDrawActive(false)} className="text-slate-400 hover:text-white p-2 bg-slate-800 hover:bg-slate-700 rounded-full transition"><X className="w-6 h-6"/></button>
                  </div>
              </div>
              {/* Draw Logic UI */}
              <div className="flex-1 grid grid-cols-12 gap-6 overflow-hidden p-4 md:p-6 relative">
                  {latestReveal && (
                      <div className="absolute inset-0 z-[2002] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
                          <div className="flex flex-col items-center animate-in zoom-in-50 duration-500">
                              <div className="w-64 h-64 bg-white rounded-3xl p-4 shadow-[0_0_100px_rgba(255,215,0,0.5)] border-4 border-yellow-400 mb-6 flex items-center justify-center relative overflow-hidden"><div className="absolute inset-0 bg-gradient-to-tr from-yellow-200/50 to-transparent animate-pulse"></div>{latestReveal.logoUrl ? <img src={latestReveal.logoUrl} className="w-full h-full object-contain drop-shadow-xl" /> : <div className="text-9xl font-black text-slate-800 opacity-20">{latestReveal.shortName.charAt(0)}</div>}</div>
                              <h2 className="text-6xl font-black text-white drop-shadow-[0_4px_10px_rgba(0,0,0,0.8)] text-center tracking-tighter uppercase">{latestReveal.name}</h2>
                              <div className="mt-4 px-6 py-2 bg-indigo-600 text-white rounded-full font-bold text-xl shadow-xl border border-indigo-400">GROUP {currentSpinGroup}</div>
                          </div>
                      </div>
                  )}
                  <div className="col-span-12 md:col-span-3 flex flex-col bg-slate-800/50 rounded-2xl border border-slate-700/50 overflow-hidden backdrop-blur-sm shadow-xl">
                      <div className="p-4 bg-slate-800 border-b border-slate-700 font-bold flex flex-col gap-2"><div className="flex justify-between items-center"><span>ทีมในโถ ({poolTeams.length})</span>{drawnCount > 0 && liveDrawStep !== 'spinning' && <button onClick={resetDraw} className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1 bg-red-900/30 px-2 py-1 rounded border border-red-900/50"><RotateCcw className="w-3 h-3"/> รีเซ็ต</button>}</div>{liveDrawStep === 'idle' && poolTeams.length > 0 && <div className="grid grid-cols-2 gap-2 mt-2"><button onClick={() => startLiveDrawSequence(false)} className="text-xs bg-indigo-600 px-2 py-3 rounded-lg hover:bg-indigo-500 transition shadow-lg shadow-indigo-500/30 flex flex-col items-center justify-center gap-1"><PlayCircle className="w-4 h-4" /> สุ่มทีละใบ</button><button onClick={drawRoundBatch} className="text-xs bg-cyan-600 px-2 py-3 rounded-lg hover:bg-cyan-500 transition shadow-lg shadow-cyan-500/30 flex flex-col items-center justify-center gap-1"><Layers className="w-4 h-4" /> สุ่มยกแผง</button></div>}</div>
                      <div className="flex-1 overflow-y-auto p-2 space-y-1">{poolTeams.map((t, idx) => <div key={t.id} className="text-sm text-slate-400 p-2 bg-slate-900/50 rounded border border-slate-700/50 flex items-center gap-2"><div className="w-5 h-5 rounded-full bg-slate-700 flex items-center justify-center text-[10px] font-mono">{idx + 1}</div><span className="truncate">{t.name}</span></div>)}{poolTeams.length === 0 && <div className="text-center py-10 text-slate-500 italic">จับครบแล้ว</div>}</div>
                  </div>
                  <div className="col-span-12 md:col-span-9 flex flex-col gap-6 overflow-y-auto pr-2 custom-scrollbar">
                      <div className="h-48 shrink-0 bg-gradient-to-br from-indigo-900 to-slate-900 rounded-3xl border border-indigo-500/30 flex flex-col items-center justify-center relative overflow-hidden shadow-2xl shadow-indigo-900/50 group"><div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div><div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:animate-[shimmer_2s_infinite]"></div>{liveDrawStep === 'spinning' && <><div className="text-indigo-300 text-sm font-bold uppercase tracking-[0.3em] mb-2 animate-pulse flex items-center gap-2"><Sparkles className="w-4 h-4"/> กำลังสุ่มเข้าสู่กลุ่ม <span className="text-white text-lg bg-indigo-600 px-3 py-0.5 rounded shadow-lg ml-1">{currentSpinGroup}</span></div><div className="text-5xl md:text-7xl font-black text-transparent bg-clip-text bg-gradient-to-b from-white to-slate-400 drop-shadow-xl transition-all duration-75 scale-110 tracking-tight">{currentSpinName}</div></>}{liveDrawStep === 'idle' && <div className="text-slate-500 flex flex-col items-center gap-4"><div className="w-20 h-20 bg-slate-800 rounded-full flex items-center justify-center border-4 border-slate-700 shadow-inner"><PlayCircle className="w-10 h-10 opacity-50" /></div><span className="text-lg font-medium">พร้อมเริ่มการจับฉลาก</span></div>}{liveDrawStep === 'finished' && <div className="text-green-400 flex flex-col items-center gap-3"><div className="w-20 h-20 bg-green-900/30 rounded-full flex items-center justify-center border-4 border-green-600 shadow-[0_0_30px_rgba(22,163,74,0.3)] animate-pulse"><CheckCircle2 className="w-10 h-10" /></div><div><div className="text-3xl font-bold text-center">การจับฉลากเสร็จสิ้น</div><div className="text-sm text-slate-400 text-center mt-1">กรุณาตรวจสอบผลและกดปุ่ม <span className="text-green-400 font-bold">บันทึกผล</span></div></div></div>}</div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pb-10">{Object.keys(liveGroups).sort().map(group => { const isFull = liveGroups[group].length >= teamsPerGroup; return (<div key={group} className={`bg-slate-800 rounded-xl border ${currentSpinGroup === group && liveDrawStep === 'spinning' ? 'border-indigo-500 shadow-[0_0_20px_rgba(99,102,241,0.3)] ring-2 ring-indigo-500/50' : isFull ? 'border-emerald-700/50 shadow-[0_0_10px_rgba(16,185,129,0.1)]' : 'border-slate-700'} overflow-hidden transition-all duration-300 hover:border-indigo-400/50`}><div className={`p-3 font-bold text-center border-b border-slate-700 flex justify-between items-center ${currentSpinGroup === group && liveDrawStep === 'spinning' ? 'bg-indigo-600 text-white' : isFull ? 'bg-emerald-800 text-white' : 'bg-slate-900 text-slate-300'}`}><span className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-white"></div> GROUP {group}</span><span className="text-xs bg-black/20 px-2 py-0.5 rounded-full">({liveGroups[group].length}/{teamsPerGroup})</span></div><div className="p-2 space-y-2 min-h-[180px]">{liveGroups[group].map((team, idx) => (<div key={team.id} className="p-2 bg-slate-700/50 rounded flex items-center justify-between gap-2 animate-in zoom-in slide-in-from-bottom-2 duration-300 group border border-transparent hover:border-slate-600 hover:bg-slate-700 transition"><div className="flex items-center gap-3 min-w-0"><div className="w-8 h-8 rounded bg-slate-600 flex items-center justify-center shrink-0 overflow-hidden shadow-sm">{team.logoUrl ? <img src={team.logoUrl} className="w-full h-full object-cover" /> : <span className="text-xs font-bold text-slate-300">{team.shortName.charAt(0)}</span>}</div><div className="flex flex-col min-w-0"><span className="text-sm font-bold text-slate-200 truncate leading-tight">{team.name}</span><span className="text-[10px] text-slate-500 truncate">{team.province}</span></div></div><button onClick={() => requestRemoveTeam(team, group)} className="text-slate-500 hover:text-red-400 p-1.5 rounded-full hover:bg-red-900/20 transition" title="ลบออกจากกลุ่ม" disabled={liveDrawStep === 'spinning'}><X className="w-3 h-3" /></button></div>))}{liveGroups[group].length === 0 && <div className="text-center text-slate-600 text-xs py-8 opacity-30 flex flex-col items-center"><div className="w-8 h-8 border-2 border-dashed border-slate-600 rounded-full mb-1"></div>ว่าง</div>}</div></div>);})}</div>
                  </div>
              </div>
          </div>
      )}

      {/* DRAW SETUP MODAL */}
      {isDrawModalOpen && (
          <div className="fixed inset-0 z-[1300] bg-black/50 modal-sheet flex items-end md:items-center justify-center p-0 md:p-4 backdrop-blur-sm">
              <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full animate-in zoom-in duration-200">
                  <div className="flex items-center gap-3 text-indigo-600 mb-4 border-b pb-2">
                      <Shuffle className="w-6 h-6" />
                      <h3 className="font-bold text-lg">ตั้งค่าการจับฉลาก</h3>
                  </div>
                  <p className="text-sm text-slate-600 mb-4">ระบบจะทำการสุ่มทีม "Approved" ลงกลุ่มแบบ Round-Robin (A-B-C...)</p>
                  
                  <div className="mb-4">
                      <label className="block text-sm font-bold text-slate-700 mb-2">จำนวนกลุ่ม (Groups)</label>
                      <div className="flex items-center gap-4">
                          <button onClick={() => setDrawGroupCount(Math.max(2, drawGroupCount - 1))} className="p-2 bg-slate-100 rounded-lg hover:bg-slate-200"><Minus className="w-4 h-4" /></button>
                          <span className="text-2xl font-black text-indigo-600 w-12 text-center">{drawGroupCount}</span>
                          <button onClick={() => setDrawGroupCount(Math.min(16, drawGroupCount + 1))} className="p-2 bg-slate-100 rounded-lg hover:bg-slate-200"><Plus className="w-4 h-4" /></button>
                      </div>
                      <p className="text-xs text-slate-400 mt-2">กลุ่มจะเป็น A - {String.fromCharCode(65 + drawGroupCount - 1)}</p>
                  </div>

                  <div className="mb-6">
                      <label className="block text-sm font-bold text-slate-700 mb-2">จำนวนทีมต่อกลุ่ม (Teams/Group)</label>
                      <div className="flex items-center gap-4">
                          <button onClick={() => setTeamsPerGroup(Math.max(2, teamsPerGroup - 1))} className="p-2 bg-slate-100 rounded-lg hover:bg-slate-200"><Minus className="w-4 h-4" /></button>
                          <span className="text-2xl font-black text-green-600 w-12 text-center">{teamsPerGroup}</span>
                          <button onClick={() => setTeamsPerGroup(Math.min(16, teamsPerGroup + 1))} className="p-2 bg-slate-100 rounded-lg hover:bg-slate-200"><Plus className="w-4 h-4" /></button>
                      </div>
                      <p className="text-xs text-slate-400 mt-2">รองรับสูงสุด {drawGroupCount * teamsPerGroup} ทีม</p>
                  </div>

                  <div className="flex gap-3 flex-col">
                      <button onClick={prepareLiveDraw} className="w-full py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-bold text-sm shadow-lg shadow-indigo-200 flex items-center justify-center gap-2 transition transform active:scale-95">
                          <PlayCircle className="w-5 h-5"/> เข้าสู่ Live Draw Studio
                      </button>
                      <button onClick={() => setIsDrawModalOpen(false)} className="w-full py-2 text-slate-400 hover:text-slate-600 text-sm font-medium">ยกเลิก</button>
                  </div>
              </div>
          </div>
      )}

      {editForm && formData && (
        <div className="fixed inset-0 z-[1300] bg-black/60 backdrop-blur-sm modal-sheet flex items-end md:items-center justify-center p-0 md:p-4 overflow-y-auto" onClick={() => { setEditForm(null); setSelectedTeam(null); }}>
            <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in duration-200 flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="bg-indigo-900 text-white p-4 flex justify-between items-center shrink-0">
                    <div className="flex items-center gap-3">
                        {editForm.team.logoUrl ? <img src={editForm.team.logoUrl} className="w-10 h-10 bg-white rounded-lg p-0.5 object-contain" /> : <div className="w-10 h-10 bg-white/10 rounded-lg flex items-center justify-center font-bold">{editForm.team.shortName}</div>}
                        <div>
                            <h3 className="font-bold text-lg">{editForm.team.name}</h3>
                            <div className="flex items-center gap-2 text-xs text-indigo-200">
                                <span>{editForm.team.province}</span>
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold text-white ${editForm.team.status === 'Approved' ? 'bg-green-500' : editForm.team.status === 'Rejected' ? 'bg-red-500' : 'bg-yellow-500'}`}>{editForm.team.status}</span>
                            </div>
                        </div>
                    </div>
                    <button onClick={() => { setEditForm(null); setSelectedTeam(null); }} className="hover:bg-white/20 p-1 rounded-full transition"><X className="w-5 h-5"/></button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-slate-200 bg-slate-50 shrink-0">
                    <button onClick={() => setModalTab('info')} className={`flex-1 py-3 text-sm font-bold transition ${modalTab === 'info' ? 'bg-white text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-500 hover:bg-slate-100'}`}>ข้อมูลทั่วไป</button>
                    <button onClick={() => setModalTab('players')} className={`flex-1 py-3 text-sm font-bold transition ${modalTab === 'players' ? 'bg-white text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-500 hover:bg-slate-100'}`}>รายชื่อนักกีฬา</button>
                    <button onClick={() => setModalTab('docs')} className={`flex-1 py-3 text-sm font-bold transition ${modalTab === 'docs' ? 'bg-white text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-500 hover:bg-slate-100'}`}>เอกสารหลักฐาน</button>
                    <button onClick={() => setModalTab('media')} className={`flex-1 py-3 text-sm font-bold transition ${modalTab === 'media' ? 'bg-white text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-500 hover:bg-slate-100'}`}>ออกอากาศ</button>
                </div>

                {/* Content */}
                <div className="p-6 overflow-y-auto flex-1 bg-white">
                    {modalTab === 'info' && (
                        <div className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="col-span-2">
                                    <label className="block text-xs font-bold text-slate-500 mb-1">ชื่อทีม/โรงเรียน</label>
                                    <input type="text" value={formData.name} onChange={e => handleEditFieldChange('name', e.target.value)} className="w-full p-3 border rounded-lg text-sm" />
                                </div>
                                <div className="col-span-2">
                                    {/* ผูกทีมกับโรงเรียนในระบบ — ของเดิมเก็บชื่อโรงเรียนเป็นข้อความ
                                        พิมพ์ต่างกันนิดเดียวก็กลายเป็นคนละโรงเรียน รวมประวัติข้ามฤดูไม่ได้
                                        และออกรหัสเข้าใช้งานให้ถูกโรงเรียนไม่ได้ด้วย */}
                                    <label className="block text-xs font-bold text-slate-500 mb-1">
                                        โรงเรียนที่สังกัด
                                        {(formData as any).schoolName && (
                                            <span className="ml-2 font-normal text-slate-400">
                                                ปัจจุบัน: {(formData as any).schoolName}
                                            </span>
                                        )}
                                    </label>
                                    <SearchPicker
                                        value={(formData as any).schoolId || ''}
                                        onChange={id => handleEditFieldChange('schoolId' as any, id)}
                                        load={loadSchoolOptions}
                                        placeholder={(formData as any).schoolName || 'ค้นหาโรงเรียนในระบบ'}
                                        emptyText="ไม่พบโรงเรียน"
                                    />
                                    <a href="/school" target="_blank" rel="noreferrer"
                                       className="inline-flex items-center gap-1 mt-2 text-xs font-bold text-indigo-600 hover:underline">
                                        เปิดหน้าโรงเรียน (ให้ครูกรอกรายชื่อนักกีฬาเอง) →
                                    </a>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">ชื่อย่อ</label>
                                    <input type="text" value={formData.shortName} onChange={e => handleEditFieldChange('shortName', e.target.value)} className="w-full p-3 border rounded-lg text-sm" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">สถานะ</label>
                                    <select 
                                        value={formData.status} 
                                        onChange={e => handleEditFieldChange('status', e.target.value)} 
                                        className={`w-full p-3 border rounded-lg text-sm font-bold ${formData.status === 'Approved' ? 'text-green-600 bg-green-50 border-green-200' : formData.status === 'Rejected' ? 'text-red-600 bg-red-50 border-red-200' : 'text-yellow-600 bg-yellow-50 border-yellow-200'}`}
                                    >
                                        <option value="Invited">รอโรงเรียนยืนยัน</option>
                                        <option value="Draft">โรงเรียนกำลังกรอก</option>
                                        <option value="Submitted">รออนุมัติ</option>
                                        <option value="Approved">อนุมัติแล้ว</option>
                                        <option value="Rejected">ถูกตีกลับ</option>
                                        <option value="Withdrawn">ไม่เข้าร่วม</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">กลุ่ม (Group)</label>
                                    <input type="text" value={formData.group || ''} onChange={e => handleEditFieldChange('group', e.target.value)} className="w-full p-3 border rounded-lg text-sm" placeholder="เช่น A, B" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">อำเภอ</label>
                                    <input type="text" value={formData.district || ''} onChange={e => handleEditFieldChange('district', e.target.value)} className="w-full p-3 border rounded-lg text-sm" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">จังหวัด</label>
                                    <input type="text" value={formData.province || ''} onChange={e => handleEditFieldChange('province', e.target.value)} className="w-full p-3 border rounded-lg text-sm" />
                                </div>
                            </div>

                            <div className="border-t pt-4">
                                <h4 className="font-bold text-sm text-slate-700 mb-3">อัตลักษณ์ทีม</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div><label className="block text-sm font-medium text-slate-700 mb-1">สีหลัก</label><div className="flex items-center gap-3"><input type="color" value={editPrimaryColor} onChange={e => handleColorChange('primary', e.target.value)} className="w-12 h-12 rounded-lg cursor-pointer border-0 p-0" /><span className="text-sm text-slate-500 font-mono">{editPrimaryColor}</span></div></div>
                                    <div><label className="block text-sm font-medium text-slate-700 mb-1">สีรอง</label><div className="flex items-center gap-3"><input type="color" value={editSecondaryColor} onChange={e => handleColorChange('secondary', e.target.value)} className="w-12 h-12 rounded-lg cursor-pointer border-0 p-0" /><span className="text-sm text-slate-500 font-mono">{editSecondaryColor}</span></div></div>
                                    <div className="md:col-span-2"><label className="block text-sm font-medium text-slate-700 mb-1">ตราสโมสร</label><div className="flex items-center gap-4">{editForm.logoPreview ? <img src={editForm.logoPreview} className="w-16 h-16 object-contain border rounded-lg p-1"/> : <div className="w-16 h-16 bg-slate-100 rounded-lg flex items-center justify-center text-slate-400 text-xs">No Logo</div>}<label className="cursor-pointer bg-slate-50 border border-slate-300 px-4 py-2 rounded-lg text-sm hover:bg-slate-100 transition">เปลี่ยนโลโก้<input type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && handleFileChange('logo', e.target.files[0])} /></label></div></div>
                                </div>
                            </div>

                            <div className="border-t pt-4">
                                <h4 className="font-bold text-sm text-slate-700 mb-3">ข้อมูลติดต่อ</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <div><label className="block text-xs font-bold text-slate-500 mb-1">ผู้จัดการทีม</label><input type="text" value={formData.managerName || ''} onChange={e => handleEditFieldChange('managerName', e.target.value)} className="w-full p-3 border rounded-lg text-sm" /></div>
                                    <div><label className="block text-xs font-bold text-slate-500 mb-1">เบอร์โทร (ผจก)</label><input type="text" value={formData.managerPhone || ''} onChange={e => handleEditFieldChange('managerPhone', e.target.value)} className="w-full p-3 border rounded-lg text-sm" /></div>
                                    <div><label className="block text-xs font-bold text-slate-500 mb-1">ผู้ฝึกสอน</label><input type="text" value={formData.coachName || ''} onChange={e => handleEditFieldChange('coachName', e.target.value)} className="w-full p-3 border rounded-lg text-sm" /></div>
                                    <div><label className="block text-xs font-bold text-slate-500 mb-1">เบอร์โทร (โค้ช)</label><input type="text" value={formData.coachPhone || ''} onChange={e => handleEditFieldChange('coachPhone', e.target.value)} className="w-full p-3 border rounded-lg text-sm" /></div>
                                </div>
                            </div>
                        </div>
                    )}

                    {modalTab === 'players' && (
                        <div className="space-y-4">
                            <div className="flex justify-between items-center mb-2">
                                <h4 className="font-bold text-sm text-slate-700">รายชื่อนักกีฬา ({editForm.players.length})</h4>
                                <button onClick={handleAddPlayer} className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg font-bold flex items-center gap-1 hover:bg-indigo-700 transition"><Plus className="w-3 h-3"/> เพิ่มนักกีฬา</button>
                            </div>
                            <div className="space-y-3">
                                {editForm.players.map((p, idx) => (
                                    <div key={idx} className="flex items-start gap-2 p-3 border rounded-xl bg-slate-50">
                                        <div className="w-16 h-20 bg-white rounded-lg border flex items-center justify-center shrink-0 overflow-hidden relative group">
                                            {p.photoUrl ? <img src={p.photoUrl} className="w-full h-full object-cover" /> : <User className="w-8 h-8 text-slate-300"/>}
                                            <label className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 cursor-pointer transition">
                                                <Camera className="w-5 h-5 text-white"/>
                                                <input type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && handlePlayerPhotoChange(idx, e.target.files[0])} />
                                            </label>
                                        </div>
                                        <div className="flex-1 grid grid-cols-12 gap-2">
                                            <div className="col-span-3"><input type="text" placeholder="เบอร์" value={p.number} onChange={e => handlePlayerChange(idx, 'number', e.target.value)} className="w-full p-2 border rounded-lg text-xs text-center font-bold" /></div>
                                            <div className="col-span-9"><input type="text" placeholder="ชื่อ-นามสกุล" value={p.name} onChange={e => handlePlayerChange(idx, 'name', e.target.value)} className="w-full p-2 border rounded-lg text-xs" /></div>
                                            <div className="col-span-6"><input type="text" placeholder="วันเกิด (วว/ดด/ปปปป)" value={p.birthDate || ''} onChange={e => handleDateInput(idx, e.target.value)} className="w-full p-2 border rounded-lg text-xs" /></div>
                                            <div className="col-span-6"><select value={normalizePlayerPosition(p.position)} onChange={e => handlePlayerChange(idx, 'position', e.target.value)} className="w-full p-2 border rounded-lg text-xs bg-white">{PLAYER_POSITIONS.map(pos => <option key={pos.value} value={pos.value}>{pos.label}</option>)}</select></div>
                                        </div>
                                        <button onClick={() => removePlayer(idx)} className="text-red-400 hover:text-red-600 p-2"><Trash2 className="w-4 h-4"/></button>
                                    </div>
                                ))}
                                {editForm.players.length === 0 && <div className="text-center py-8 text-slate-400 text-sm">ไม่มีรายชื่อนักกีฬา</div>}
                            </div>
                        </div>
                    )}

                    {modalTab === 'docs' && (
                        <div className="space-y-6">
                            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                                <label className="block text-sm font-bold text-slate-700 mb-2">เอกสารใบสมัคร (PDF/Word)</label>
                                <div className="flex items-center gap-3">
                                    <label className="cursor-pointer bg-white border border-slate-300 px-4 py-2 rounded-lg text-sm hover:bg-slate-100 transition flex items-center gap-2 shadow-sm">
                                        <FileText className="w-4 h-4 text-indigo-600"/>
                                        {editForm.newDoc ? editForm.newDoc.name : (formData.docUrl ? 'เปลี่ยนไฟล์' : 'อัปโหลดไฟล์')}
                                        <input type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={e => e.target.files?.[0] && handleFileChange('doc', e.target.files[0])} />
                                    </label>
                                    {formData.docUrl && (
                                        <a href={formData.docUrl} target="_blank" className="p-2 bg-indigo-50 text-indigo-600 rounded-lg border border-indigo-100 hover:bg-indigo-100 text-xs flex items-center gap-1">
                                            <ExternalLink className="w-3 h-3" /> ดูไฟล์เดิม
                                        </a>
                                    )}
                                </div>
                            </div>

                            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                                <label className="block text-sm font-bold text-slate-700 mb-2">หลักฐานการโอนเงิน (สลิป)</label>
                                <div className="flex flex-col gap-4">
                                    <label className="cursor-pointer block w-full border-2 border-dashed border-slate-300 rounded-xl p-6 text-center hover:bg-white transition">
                                        <CreditCard className="w-8 h-8 text-slate-300 mx-auto mb-2"/>
                                        <span className="text-xs text-slate-500 font-bold block">{editForm.newSlip ? editForm.newSlip.name : 'แตะเพื่อเปลี่ยนรูปสลิป'}</span>
                                        <input type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && handleFileChange('slip', e.target.files[0])} />
                                    </label>
                                    {editForm.slipPreview && (
                                        <div className="relative mx-auto">
                                            <img src={editForm.slipPreview} className="max-h-64 rounded-lg shadow-sm border" />
                                            <div className="text-center text-xs text-slate-400 mt-1">ตัวอย่างรูปสลิป</div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* คลิปแนะนำสำหรับหน้าผังตัวนักกีฬา — ใช้ตัวแก้ไขตัวเดียวกับ
                        โมดัลของโรงเรียนเจ้าของทีม จะได้ไม่ต้องดูแลฟอร์มสองชุด
                        ส่ง editForm.team ไม่ใช่ formData — formData คือค่าที่กำลังพิมพ์ค้างอยู่
                        ในแท็บอื่น ส่วนตัวแก้ไขนี้อ่านค่าคลิปจากของที่บันทึกไว้จริง */}
                    {modalTab === 'media' && (
                        <LineupMediaEditor team={editForm.team} players={editForm.players} />
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t bg-white flex gap-3 shrink-0">
                    <button onClick={() => { setEditForm(null); setSelectedTeam(null); }} className="flex-1 py-3 border border-slate-200 rounded-xl font-bold text-slate-500 hover:bg-slate-50 transition">ยกเลิก</button>
                    {/* Status Button for Admin only (in modal logic, although here it's implicit) */}
                    {formData.status === 'Pending' && (
                        <>
                            <button onClick={() => handleSaveTeamChanges(formData, editForm.players)} disabled={isSavingTeam} className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition flex items-center justify-center gap-2 shadow-lg shadow-indigo-200 disabled:opacity-70">
                                {isSavingTeam ? <Loader2 className="w-5 h-5 animate-spin"/> : <><Save className="w-5 h-5"/> บันทึกข้อมูล</>}
                            </button>
                        </>
                    )}

                    <button onClick={() => handleSaveTeamChanges(formData, editForm.players)} disabled={isSavingTeam} className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition flex items-center justify-center gap-2 shadow-lg shadow-indigo-200 disabled:opacity-70">
                        {isSavingTeam ? <Loader2 className="w-5 h-5 animate-spin"/> : <><Save className="w-5 h-5"/> บันทึกข้อมูล</>}
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* USER MANAGEMENT MODAL */}
      {isUserModalOpen && (
          <div className="fixed inset-0 z-[1400] bg-black/50 modal-sheet flex items-end md:items-center justify-center p-0 md:p-4 backdrop-blur-sm">
              <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 animate-in zoom-in duration-200">
                  <div className="flex justify-between items-center mb-4 border-b pb-2">
                      <h3 className="font-bold text-lg text-slate-800">{editingUser ? 'แก้ไขข้อมูลผู้ใช้' : 'เพิ่มผู้ใช้ใหม่'}</h3>
                      <button onClick={() => setIsUserModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5"/></button>
                  </div>
                  <div className="space-y-3">
                      <div>
                          <label className="block text-sm font-bold text-slate-700 mb-1">Username (ใช้สำหรับเข้าสู่ระบบ)</label>
                          <input 
                              type="text" 
                              value={userForm.username} 
                              onChange={e => setUserForm({...userForm, username: e.target.value})} 
                              className="w-full p-2 border rounded-lg" 
                              disabled={!!editingUser} // Cannot change username on edit
                          />
                      </div>
                      <div>
                          <label className="block text-sm font-bold text-slate-700 mb-1">ชื่อที่แสดง (Display Name)</label>
                          <input type="text" value={userForm.displayName} onChange={e => setUserForm({...userForm, displayName: e.target.value})} className="w-full p-2 border rounded-lg" />
                      </div>
                      <div>
                          <label className="block text-sm font-bold text-slate-700 mb-1">เบอร์โทรศัพท์</label>
                          <input type="tel" value={userForm.phone} onChange={e => setUserForm({...userForm, phone: e.target.value})} className="w-full p-2 border rounded-lg" />
                      </div>
                      <div>
                          <label className="block text-sm font-bold text-slate-700 mb-1">สิทธิ์ (Role)</label>
                          <select value={userForm.role} onChange={e => setUserForm({...userForm, role: e.target.value})} className="w-full p-2 border rounded-lg bg-white">
                              <option value="user">ผู้ใช้ทั่วไป</option>
                              <option value="referee">กรรมการบันทึกผล</option>
                              <option value="staff">เจ้าหน้าที่</option>
                              <option value="admin">ผู้ดูแลระบบ</option>
                          </select>
                      </div>
                      <div>
                          <label className="block text-sm font-bold text-slate-700 mb-1">โรงเรียนต้นสังกัด</label>
                          <SearchPicker
                              value={userForm.schoolId}
                              onChange={id => setUserForm({...userForm, schoolId: id})}
                              load={loadSchoolOptions}
                              placeholder="พิมพ์ชื่อโรงเรียนเพื่อค้นหา..."
                              emptyText="ไม่พบโรงเรียนนี้ในระบบ"
                          />
                          <p className="text-[11px] text-slate-400 mt-1">
                              เว้นว่าง = ไม่สังกัดโรงเรียนใด · ผู้ใช้ที่เข้าผ่าน LINE จะถูกถามเองตอนเข้าครั้งแรก
                              แต่แอดมินแก้ทับได้ตรงนี้
                          </p>
                          <p className="text-[11px] text-indigo-600 mt-1 leading-relaxed">
                              เมื่อคุณเป็นคนกำหนดโรงเรียนให้ = <b>รับรองแล้ว</b> ผู้ใช้คนนี้จะเข้าหน้า
                              "สำหรับโรงเรียน" เพื่อกรอก/แก้ไขข้อมูลทีมได้ทันที โดยไม่ต้องกรอกรหัส 8 ตัว
                              (โรงเรียนที่ผู้ใช้เลือกเองจะยังเข้าไม่ได้ เพราะใครก็เลือกได้)
                          </p>
                      </div>
                      <div>
                          <label className="block text-sm font-bold text-slate-700 mb-1">
                              {editingUser ? 'รหัสผ่านใหม่ (เว้นว่างหากไม่ต้องการเปลี่ยน)' : 'รหัสผ่าน'}
                          </label>
                          <input type="password" value={userForm.password} onChange={e => setUserForm({...userForm, password: e.target.value})} className="w-full p-2 border rounded-lg" />
                      </div>
                  </div>
                  <div className="flex gap-3 mt-6">
                      <button onClick={() => setIsUserModalOpen(false)} className="flex-1 py-2 border rounded-lg text-slate-600 hover:bg-slate-50">ยกเลิก</button>
                      <button onClick={handleSaveUser} disabled={isLoadingUsers} className="flex-1 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-bold flex items-center justify-center gap-2">
                          {isLoadingUsers ? <Loader2 className="w-4 h-4 animate-spin"/> : 'บันทึก'}
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* CONTEST MODAL */}
      {isContestModalOpen && (
          <div className="fixed inset-0 z-[1400] bg-black/60 backdrop-blur-sm modal-sheet flex items-end md:items-center justify-center p-0 md:p-4">
              <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 animate-in zoom-in duration-200">
                  <div className="flex justify-between items-center mb-4 border-b pb-2">
                      <h3 className="font-bold text-lg text-slate-800">{contestForm.id ? 'แก้ไขกิจกรรม' : 'สร้างกิจกรรมใหม่'}</h3>
                      <button onClick={() => setIsContestModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5"/></button>
                  </div>
                  <div className="space-y-4">
                      <div>
                          <label className="block text-sm font-bold text-slate-700 mb-1">หัวข้อกิจกรรม</label>
                          <input 
                              type="text" 
                              value={contestForm.title} 
                              onChange={e => setContestForm({...contestForm, title: e.target.value})} 
                              className="w-full p-2 border rounded-lg"
                              placeholder="เช่น ประกวดภาพเชียร์มันส์ๆ"
                          />
                      </div>
                      <div>
                          <label className="block text-sm font-bold text-slate-700 mb-1">รายละเอียด</label>
                          <textarea 
                              value={contestForm.description} 
                              onChange={e => setContestForm({...contestForm, description: e.target.value})} 
                              className="w-full p-2 border rounded-lg h-24"
                              placeholder="รายละเอียดกติกา..."
                          />
                      </div>
                      <div>
                          <label className="block text-sm font-bold text-slate-700 mb-1">วันปิดรับภาพ</label>
                          <input 
                              type="datetime-local" 
                              value={contestForm.closingDate} 
                              onChange={e => setContestForm({...contestForm, closingDate: e.target.value})} 
                              className="w-full p-2 border rounded-lg"
                          />
                      </div>
                      {/* จอในสนามกรองภาพด้วยค่านี้ — ถ้าไม่ผูกรายการ ภาพของงานปีก่อน
                          จะขึ้นปนกับงานที่กำลังจัดอยู่ (db/19) */}
                      <div>
                          <label className="block text-sm font-bold text-slate-700 mb-1">แสดงในรายการแข่งขัน</label>
                          <select
                              value={contestForm.tournamentId}
                              onChange={e => setContestForm({...contestForm, tournamentId: e.target.value})}
                              className="w-full p-2 border rounded-lg bg-white"
                          >
                              <option value="global">ทุกรายการ (ส่วนกลาง)</option>
                              {tournaments.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                          </select>
                          <p className="text-xs text-slate-500 mt-1">
                              เลือกรายการเพื่อให้ภาพขึ้นเฉพาะจอของงานนั้น
                          </p>
                      </div>
                  </div>
                  <div className="flex gap-3 mt-6">
                      <button onClick={() => setIsContestModalOpen(false)} className="flex-1 py-2 border rounded-lg text-slate-600 hover:bg-slate-50">ยกเลิก</button>
                      <button onClick={handleSaveContest} disabled={isSavingContest} className="flex-1 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-bold flex items-center justify-center gap-2">
                          {isSavingContest ? <Loader2 className="w-4 h-4 animate-spin"/> : 'บันทึก'}
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* REJECT MODAL */}
      {rejectModal.isOpen && (
          <div className="fixed inset-0 z-[1300] bg-black/50 modal-sheet flex items-end md:items-center justify-center p-0 md:p-4 backdrop-blur-sm">
              <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full animate-in zoom-in duration-200">
                  <div className="flex justify-between items-start mb-4">
                      <div className="flex items-center gap-3 text-red-600">
                          <ShieldAlert className="w-6 h-6" />
                          <h3 className="font-bold text-lg">ระบุเหตุผลที่ไม่อนุมัติ</h3>
                      </div>
                      <button onClick={() => setRejectModal({ isOpen: false, teamId: null })} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5"/></button>
                  </div>
                  <textarea className="w-full p-3 border border-slate-300 rounded-lg text-sm h-32 focus:ring-2 focus:ring-red-200 focus:border-red-400 mb-4" placeholder="เช่น เอกสารไม่ครบถ้วน, สลิปไม่ชัดเจน..." value={rejectReasonInput} onChange={(e) => setRejectReasonInput(e.target.value)} autoFocus></textarea>
                  <div className="flex gap-3"><button onClick={() => setRejectModal({ isOpen: false, teamId: null })} className="flex-1 py-2 border rounded-lg hover:bg-slate-50 text-sm font-bold text-slate-600">ยกเลิก</button><button onClick={confirmReject} className="flex-1 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-bold text-sm shadow-sm flex items-center justify-center gap-2">{isSavingTeam ? <Loader2 className="w-4 h-4 animate-spin"/> : 'ยืนยันไม่อนุมัติ'}</button></div>
              </div>
          </div>
      )}

      {/* NEWS MODAL */}
      {isNewsModalOpen && (
          <div className="fixed inset-0 z-[1400] bg-black/60 backdrop-blur-sm modal-sheet flex items-end md:items-center justify-center p-0 md:p-4">
              <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 animate-in zoom-in duration-200 flex flex-col max-h-[90vh]">
                  <div className="flex justify-between items-center mb-4 border-b pb-2">
                      <h3 className="font-bold text-lg text-slate-800">{newsForm.id ? 'แก้ไขข่าวสาร' : 'เพิ่มข่าวสาร'}</h3>
                      <button onClick={() => setIsNewsModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5"/></button>
                  </div>
                  <div className="space-y-4 overflow-y-auto flex-1 p-1">
                      <div>
                          <label className="block text-sm font-bold text-slate-700 mb-1">หัวข้อข่าว</label>
                          <input type="text" value={newsForm.title} onChange={e => setNewsForm({...newsForm, title: e.target.value})} className="w-full p-2 border rounded-lg" placeholder="หัวข้อข่าว..." />
                      </div>
                      <div>
                          <label className="block text-sm font-bold text-slate-700 mb-1">เนื้อหา</label>
                          <textarea value={newsForm.content} onChange={e => setNewsForm({...newsForm, content: e.target.value})} className="w-full p-2 border rounded-lg h-32" placeholder="รายละเอียด..." />
                      </div>
                      
                      {/* Scope Selection */}
                      <div>
                          <label className="block text-sm font-bold text-slate-700 mb-1">การแสดงผล</label>
                          <select value={newsForm.tournamentId} onChange={e => setNewsForm({...newsForm, tournamentId: e.target.value})} className="w-full p-2 border rounded-lg bg-white">
                              <option value="global">Global (แสดงหน้าแรก)</option>
                              {tournaments?.map(t => (
                                  <option key={t.id} value={t.id}>เฉพาะรายการ: {t.name}</option>
                              ))}
                          </select>
                      </div>

                      <div>
                          <label className="block text-sm font-bold text-slate-700 mb-1">รูปภาพประกอบ</label>
                          <div className="border-2 border-dashed border-slate-300 rounded-xl p-4 text-center hover:bg-slate-50 transition relative">
                              {newsForm.imagePreview ? (
                                  <div className="relative">
                                      <img src={newsForm.imagePreview} className="max-h-40 mx-auto rounded shadow-sm" />
                                      <button onClick={() => setNewsForm({...newsForm, imageFile: null, imagePreview: null})} className="absolute -top-2 -right-2 bg-red-500 text-white p-1 rounded-full"><X className="w-3 h-3"/></button>
                                  </div>
                              ) : (
                                  <label className="cursor-pointer block w-full h-full">
                                      <Image className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                                      <span className="text-xs text-slate-500">คลิกเพื่ออัปโหลดรูป</span>
                                      <input type="file" accept={SUPPORTED_IMAGE_ACCEPT} className="hidden" onChange={handleNewsImageChange} />
                                  </label>
                              )}
                          </div>
                      </div>

                      <div>
                          <label className="block text-sm font-bold text-slate-700 mb-1">เอกสารแนบ (PDF/Doc)</label>
                          <div className="flex items-center gap-2">
                              <label className="cursor-pointer bg-white border px-3 py-2 rounded-lg text-sm hover:bg-slate-50 flex items-center gap-2">
                                  <Paperclip className="w-4 h-4"/> เลือกไฟล์
                                  <input type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={handleNewsDocChange} />
                              </label>
                              {newsForm.docFile ? <span className="text-xs text-green-600 font-bold truncate">{newsForm.docFile.name}</span> : (newsForm.id && newsForm.docFile === null) ? <span className="text-xs text-slate-400">ยังไม่เปลี่ยนไฟล์</span> : null}
                          </div>
                      </div>
                  </div>
                  <div className="flex gap-3 mt-6 shrink-0">
                      <button onClick={() => setIsNewsModalOpen(false)} className="flex-1 py-2 border rounded-lg text-slate-600 hover:bg-slate-50">ยกเลิก</button>
                      <button onClick={handleSaveNews} disabled={isSavingNews} className="flex-1 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-bold flex items-center justify-center gap-2">
                          {isSavingNews ? <Loader2 className="w-4 h-4 animate-spin"/> : 'บันทึก'}
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* DONATION DETAIL MODAL */}
      {selectedDonation && (
          <div className="fixed inset-0 z-[1400] bg-black/60 backdrop-blur-sm modal-sheet flex items-end md:items-center justify-center p-0 md:p-4" onClick={() => setSelectedDonation(null)}>
              <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full flex flex-col md:flex-row overflow-hidden animate-in zoom-in duration-200 max-h-[90vh]" onClick={e => e.stopPropagation()}>
                  {/* Left: Slip Image */}
                  <div className="w-full md:w-1/2 bg-slate-900 flex items-center justify-center p-4 relative group">
                      {selectedDonation.slipUrl ? (
                          <img src={selectedDonation.slipUrl} className="max-w-full max-h-[40vh] md:max-h-full object-contain cursor-zoom-in" onClick={() => setPreviewImage(selectedDonation.slipUrl)} />
                      ) : (
                          <div className="text-slate-500 flex flex-col items-center"><Image className="w-12 h-12 mb-2 opacity-20"/><span>ไม่มีรูปสลิป</span></div>
                      )}
                      {/* Zoom hint */}
                      {selectedDonation.slipUrl && <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/50 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition">คลิกเพื่อขยาย</div>}
                  </div>
                  
                  {/* Right: Info & Actions */}
                  <div className="w-full md:w-1/2 p-6 flex flex-col overflow-y-auto">
                      <div className="flex justify-between items-start mb-4">
                          <div>
                              <h3 className="font-bold text-lg text-slate-800">{selectedDonation.donorName}</h3>
                              <p className="text-xs text-slate-500">{new Date(selectedDonation.timestamp).toLocaleString('th-TH')}</p>
                          </div>
                          <button onClick={() => setSelectedDonation(null)}><X className="w-5 h-5 text-slate-400 hover:text-slate-600"/></button>
                      </div>

                      <div className="space-y-4 flex-1">
                          <div className="bg-indigo-50 p-3 rounded-xl border border-indigo-100">
                              <p className="text-xs text-indigo-500 font-bold uppercase">จำนวนเงิน</p>
                              <p className="text-2xl font-black text-indigo-700">{selectedDonation.amount.toLocaleString()} บาท</p>
                          </div>

                          <div className="space-y-2 text-sm">
                              <div className="flex justify-between border-b border-slate-100 pb-1">
                                  <span className="text-slate-500">เบอร์โทร:</span>
                                  <span className="font-medium">{selectedDonation.phone}</span>
                              </div>
                              <div className="flex justify-between border-b border-slate-100 pb-1 items-center">
                                  <span className="text-slate-500">สถานะ:</span>
                                  <div className="flex items-center gap-2">
                                      <span className={`font-bold ${selectedDonation.status === 'Verified' ? 'text-green-600' : selectedDonation.status === 'Rejected' ? 'text-red-600' : 'text-orange-500'}`}>{selectedDonation.status}</span>
                                  </div>
                              </div>
                              {/* Status Edit Controls */}
                              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                                  <label className="block text-xs font-bold text-slate-500 mb-2">ปรับปรุงสถานะ</label>
                                  <div className="grid grid-cols-2 gap-2">
                                      <button 
                                          onClick={() => handleVerifyDonation(selectedDonation.id, 'Verified')} 
                                          disabled={selectedDonation.status === 'Verified'}
                                          className={`py-1.5 text-xs font-bold rounded border ${selectedDonation.status === 'Verified' ? 'bg-green-100 text-green-700 border-green-200 cursor-default' : 'bg-white text-slate-600 border-slate-300 hover:bg-green-50 hover:text-green-600 hover:border-green-200'}`}
                                      >
                                          {selectedDonation.status === 'Verified' ? 'Verified ✓' : 'Set Verified'}
                                      </button>
                                      <button 
                                          onClick={() => handleVerifyDonation(selectedDonation.id, 'Rejected')} 
                                          disabled={selectedDonation.status === 'Rejected'}
                                          className={`py-1.5 text-xs font-bold rounded border ${selectedDonation.status === 'Rejected' ? 'bg-red-100 text-red-700 border-red-200 cursor-default' : 'bg-white text-slate-600 border-slate-300 hover:bg-red-50 hover:text-red-600 hover:border-red-200'}`}
                                      >
                                          {selectedDonation.status === 'Rejected' ? 'Rejected ✗' : 'Set Rejected'}
                                      </button>
                                  </div>
                              </div>

                              <div className="flex justify-between items-center border-b border-slate-100 pb-1">
                                  <span className="text-slate-500">แสดงชื่อ:</span>
                                  <button 
                                      onClick={() => handleUpdateDonationAnonymous(!selectedDonation.isAnonymous)}
                                      className={`text-xs font-bold px-2 py-0.5 rounded transition ${selectedDonation.isAnonymous ? 'bg-slate-200 text-slate-600' : 'bg-green-100 text-green-700'}`}
                                  >
                                      {selectedDonation.isAnonymous ? 'ไม่แสดง (Anon)' : 'แสดงปกติ'}
                                  </button>
                              </div>
                          </div>

                          {selectedDonation.isEdonation && (
                              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-sm">
                                  <div className="flex items-center gap-2 mb-2 text-blue-600 font-bold">
                                      <FileCheck className="w-4 h-4"/> ขอ e-Donation
                                  </div>
                                  <p className="text-xs text-slate-500 mb-1">Tax ID: <span className="text-slate-800 font-mono">{selectedDonation.taxId}</span></p>
                                  <p className="text-xs text-slate-500 mb-2">ที่อยู่: {selectedDonation.address}</p>
                                  
                                  {/* Admin File Upload for Tax Receipt */}
                                  <div className="mt-2 pt-2 border-t border-slate-200">
                                      <p className="text-xs font-bold mb-1">หลักฐานการลดหย่อน (Admin Upload)</p>
                                      <div className="flex gap-2 items-center">
                                          <input type="file" accept="image/*,.pdf" className="text-xs w-full" onChange={handleTaxFileSelect} />
                                          {adminTaxFile && (
                                              <button onClick={handleSaveTaxFile} className="bg-blue-600 text-white text-xs px-2 py-1 rounded hover:bg-blue-700">Save</button>
                                          )}
                                      </div>
                                      {selectedDonation.taxFileUrl && (
                                          <a href={selectedDonation.taxFileUrl} target="_blank" className="text-[10px] text-blue-500 underline mt-1 block">ดูไฟล์ที่อัปโหลดแล้ว</a>
                                      )}
                                  </div>
                              </div>
                          )}
                      </div>

                      {/* Footer Actions */}
                      <div className="mt-6 pt-4 border-t border-slate-100">
                          <button onClick={() => handlePrintCertificate(selectedDonation)} disabled={isGeneratingCert} className="w-full bg-slate-800 text-white py-2 rounded-lg font-bold hover:bg-slate-900 transition flex items-center justify-center gap-2">
                              {isGeneratingCert ? <Loader2 className="w-4 h-4 animate-spin"/> : <Printer className="w-4 h-4"/>} พิมพ์เกียรติบัตร
                          </button>
                      </div>
                  </div>
              </div>
          </div>
      )}

      {/* Main Content Area */}
      <div className="max-w-7xl mx-auto relative">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
            <div>
                <h1 className="text-3xl font-bold text-slate-800">ระบบจัดการการแข่งขัน</h1>
                <p className="text-slate-500 flex items-center gap-2">Admin Control Panel {currentTournament && (<span className="bg-indigo-100 text-indigo-700 text-xs px-2 py-0.5 rounded-full font-bold flex items-center gap-1"><Trophy className="w-3 h-3"/> กำลังจัดการ: {currentTournament.name}</span>)}</p>
            </div>
            <div className="flex gap-3 flex-wrap">
                <button onClick={() => setActiveTab('teams')} className={`px-4 py-2 rounded-lg font-medium transition ${activeTab === 'teams' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>จัดการทีม</button>
                <button onClick={() => setActiveTab('news')} className={`px-4 py-2 rounded-lg font-medium transition flex items-center gap-2 ${activeTab === 'news' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-white text-slate-600 hover:bg-slate-50'}`}><Bell className="w-4 h-4" /> ข่าวสาร</button>
                <button onClick={() => setActiveTab('donations')} className={`px-4 py-2 rounded-lg font-medium transition flex items-center gap-2 ${activeTab === 'donations' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-white text-slate-600 hover:bg-slate-50'}`}><DollarSign className="w-4 h-4" /> เงินบริจาค</button>
                <button onClick={() => setActiveTab('contests')} className={`px-4 py-2 rounded-lg font-medium transition flex items-center gap-2 ${activeTab === 'contests' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-white text-slate-600 hover:bg-slate-50'}`}><Camera className="w-4 h-4" /> ประกวดภาพ</button>
                <button onClick={() => setActiveTab('schedule')} className={`px-4 py-2 rounded-lg font-medium transition flex items-center gap-2 ${activeTab === 'schedule' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-white text-slate-600 hover:bg-slate-50'}`}><Calendar className="w-4 h-4" /> ตารางแข่ง</button>
                <button onClick={() => setActiveTab('tournaments')} className={`px-4 py-2 rounded-lg font-medium transition flex items-center gap-2 ${activeTab === 'tournaments' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-white text-slate-600 hover:bg-slate-50'}`}><Trophy className="w-4 h-4" /> รายการแข่งขัน</button>
                <button onClick={() => setActiveTab('tools')} className={`px-4 py-2 rounded-lg font-medium transition flex items-center gap-2 ${activeTab === 'tools' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-white text-slate-600 hover:bg-slate-50'}`}><Settings className="w-4 h-4" /> เครื่องมือผู้ดูแล</button>
                <button onClick={() => setActiveTab('users')} className={`px-4 py-2 rounded-lg font-medium transition flex items-center gap-2 ${activeTab === 'users' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-white text-slate-600 hover:bg-slate-50'}`}><UserCog className="w-4 h-4" /> ผู้ใช้งาน</button>
                <button onClick={() => setActiveTab('settings')} className={`px-4 py-2 rounded-lg font-medium transition flex items-center gap-2 ${activeTab === 'settings' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-white text-slate-600 hover:bg-slate-50'}`}><Settings className="w-4 h-4" /> ตั้งค่า</button>
                <button onClick={onLogout} className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition border border-red-100"><LogOut className="w-4 h-4" /></button>
            </div>
        </div>

        {/* --- TEAMS TAB --- */}
        {activeTab === 'teams' && (
            <div className="animate-in fade-in duration-300">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 mb-8">
                    {/* กดการ์ดเพื่อกรอง — เร็วกว่าไปหา dropdown แล้วเลือกเอง
                        กดซ้ำที่การ์ดเดิมเพื่อกลับไปดูทั้งหมด */}
                    {([
                      { key: 'All',      label: 'ทีมทั้งหมด',    count: localTeams.length,
                        color: 'text-indigo-600', bg: 'bg-indigo-50', icon: <Users className="w-6 h-6 text-indigo-600" /> },
                      { key: 'Pending',  label: 'รอการอนุมัติ',  // ทีมที่แจ้งไม่เข้าร่วมแล้วไม่ได้ "รออนุมัติ" — เขาตอบไปแล้วว่าไม่มา
                        // เดิมนับรวมไว้ ทำให้ตัวเลขบนการ์ดสูงกว่างานที่ต้องทำจริง
                        count: localTeams.filter(t => t.status !== 'Approved' && t.status !== 'Rejected' && t.status !== 'Withdrawn').length,
                        color: 'text-orange-500', bg: 'bg-orange-50', icon: <ShieldAlert className="w-6 h-6 text-orange-500" /> },
                      { key: 'Approved', label: 'อนุมัติแล้ว',   count: localTeams.filter(t => t.status === 'Approved').length,
                        color: 'text-green-600', bg: 'bg-green-50', icon: <ShieldCheck className="w-6 h-6 text-green-600" /> },
                    ]).map(c => {
                      const active = filterStatus === c.key;
                      return (
                        <button key={c.key} type="button"
                          onClick={() => setFilterStatus(active && c.key !== 'All' ? 'All' : c.key)}
                          aria-pressed={active}
                          className={`bg-white p-5 md:p-6 rounded-xl shadow-sm border text-left transition
                            ${active ? 'border-indigo-500 ring-2 ring-indigo-100' : 'border-slate-200 hover:border-indigo-300'}`}>
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-slate-500 text-sm">{c.label}</p>
                              <p className={`text-3xl font-bold ${c.color} tabular-nums`}>{c.count}</p>
                              <p className="text-[11px] text-slate-400 mt-0.5">
                                {active && c.key !== 'All' ? 'แตะอีกครั้งเพื่อดูทั้งหมด' : 'แตะเพื่อกรองเฉพาะกลุ่มนี้'}
                              </p>
                            </div>
                            <div className={`p-3 ${c.bg} rounded-full shrink-0`}>{c.icon}</div>
                          </div>
                        </button>
                      );
                    })}
                </div>
                
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    {/* Tool Bar */}
                    <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row justify-between items-center gap-4 sticky top-0 bg-white z-20">
                        <div className="flex items-center gap-3">
                            <h2 className="font-bold text-lg text-slate-800">รายชื่อทีมลงทะเบียน</h2>
                            <button onClick={() => setAddTeamOpen(true)} className="flex items-center gap-1 text-xs bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition font-bold shadow-md"><UserPlus className="w-4 h-4" /> เพิ่มทีม</button>
                            <button onClick={prepareLiveDraw} className="flex items-center gap-1 text-xs bg-gradient-to-r from-indigo-500 to-purple-500 text-white px-4 py-2 rounded-lg hover:from-indigo-600 hover:to-purple-600 transition font-bold shadow-md transform hover:scale-105"><Shuffle className="w-4 h-4" /> Live Draw</button>
                        </div>
                        <div className="flex gap-2 w-full md:w-auto items-center">
                            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="px-3 py-2 border rounded-lg text-sm bg-slate-50 focus:bg-white outline-none focus:ring-2 focus:ring-indigo-500">
                                <option value="All">สถานะ: ทั้งหมด</option>
                                <option value="Pending">รอการอนุมัติ (ทุกขั้น)</option>
                                <option value="Invited">รอโรงเรียนยืนยัน</option>
                                <option value="Draft">โรงเรียนกำลังกรอก</option>
                                <option value="Submitted">รออนุมัติ</option>
                                <option value="Approved">อนุมัติแล้ว</option>
                                <option value="Rejected">ถูกตีกลับ</option>
                                <option value="Withdrawn">ไม่เข้าร่วม</option>
                            </select>
                            <div className="relative flex-1 md:flex-none">
                                <input 
                                    type="text" 
                                    placeholder="ค้นหาทีม..." 
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="pl-9 pr-4 py-2 border rounded-lg text-sm w-full bg-slate-50 focus:bg-white outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                            </div>
                            <div className="flex border rounded-lg overflow-hidden shrink-0">
                                <button onClick={() => setViewMode('grid')} className={`p-2 ${viewMode === 'grid' ? 'bg-indigo-50 text-indigo-600' : 'bg-white text-slate-400 hover:text-slate-600'}`}><Grid className="w-4 h-4"/></button>
                                <button onClick={() => setViewMode('list')} className={`p-2 ${viewMode === 'list' ? 'bg-indigo-50 text-indigo-600' : 'bg-white text-slate-400 hover:text-slate-600'}`}><List className="w-4 h-4"/></button>
                            </div>
                            <button onClick={downloadCSV} className="p-2 border rounded-lg hover:bg-slate-50 text-slate-500" title="Download CSV"><Download className="w-4 h-4"/></button>
                            <button onClick={handleLocalRefresh} className="p-2 border rounded-lg hover:bg-slate-50 text-slate-500" title="Refresh"><RefreshCw className="w-4 h-4"/></button>
                        </div>
                    </div>

                    {/* Content */}
                    <div className="p-6 bg-slate-50 min-h-[400px]">
                        {viewMode === 'grid' ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                                {filteredTeams.map(team => (
                                    <div key={team.id} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-md transition group relative">
                                        <div className="p-4 flex items-start justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className="w-12 h-12 rounded-lg bg-slate-100 flex items-center justify-center overflow-hidden border border-slate-100 relative">
                                                    {team.logoUrl ? <img src={team.logoUrl} className="w-full h-full object-contain p-1" /> : <div className="text-lg font-bold text-slate-400">{team.shortName.charAt(0)}</div>}
                                                </div>
                                                <div>
                                                    <h3 className="font-bold text-slate-800 text-sm truncate w-32" title={team.name}>{team.name}</h3>
                                                    <p className="text-xs text-slate-500">{team.province}</p>
                                                </div>
                                            </div>
                                            <span className={`px-2 py-1 rounded-full text-[10px] font-bold ${team.status === 'Approved' ? 'bg-green-100 text-green-700' : team.status === 'Rejected' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                                {team.status}
                                            </span>
                                        </div>
                                        <div className="px-4 pb-4 space-y-2">
                                            <div className="text-xs text-slate-500 flex justify-between"><span>ผู้จัดการ:</span> <span className="font-medium text-slate-700">{team.managerName}</span></div>
                                            <div className="text-xs text-slate-500 flex justify-between"><span>เบอร์โทร:</span> <span className="font-medium text-slate-700">{team.managerPhone}</span></div>
                                            {team.group && <div className="text-xs text-slate-500 flex justify-between"><span>กลุ่ม:</span> <span className="font-bold text-indigo-600 bg-indigo-50 px-2 rounded">{team.group}</span></div>}
                                        </div>
                                        <div className="border-t bg-slate-50 p-2 flex justify-between items-center">
                                            <div className="flex gap-1">
                                                {team.slipUrl && <button onClick={() => setPreviewImage(team.slipUrl)} className="p-1.5 hover:bg-white rounded text-slate-400 hover:text-indigo-600" title="ดูสลิป"><CreditCard className="w-4 h-4"/></button>}
                                                {team.docUrl && <a href={team.docUrl} target="_blank" className="p-1.5 hover:bg-white rounded text-slate-400 hover:text-indigo-600" title="ดูเอกสาร"><FileText className="w-4 h-4"/></a>}
                                            </div>
                                            <div className="flex gap-2">
                                                <button onClick={() => { setSelectedTeam(team); setIsEditingTeam(true); }} className="text-xs font-bold text-indigo-600 bg-white border border-indigo-200 px-3 py-1.5 rounded-lg hover:bg-indigo-50 flex items-center gap-1">
                                                    <Edit3 className="w-3 h-3"/> จัดการ
                                                </button>
                                                <button onClick={() => handleDeleteTeam(team.id)} className="text-xs font-bold text-red-600 bg-white border border-red-200 px-2 py-1.5 rounded-lg hover:bg-red-50">
                                                    <Trash2 className="w-3 h-3"/>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
                                        <tr>
                                            <th className="p-4 cursor-pointer hover:bg-slate-100" onClick={() => handleSort('name')}>ชื่อทีม</th>
                                            <th className="p-4 cursor-pointer hover:bg-slate-100" onClick={() => handleSort('province')}>จังหวัด</th>
                                            <th className="p-4 cursor-pointer hover:bg-slate-100" onClick={() => handleSort('status')}>สถานะ</th>
                                            <th className="p-4 cursor-pointer hover:bg-slate-100" onClick={() => handleSort('group')}>กลุ่ม</th>
                                            <th className="p-4 text-right">จัดการ</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {filteredTeams.map(team => (
                                            <tr key={team.id} className="hover:bg-slate-50 transition">
                                                <td className="p-4 font-bold text-slate-700 flex items-center gap-3">
                                                    {team.logoUrl && <img src={team.logoUrl} className="w-6 h-6 object-contain rounded bg-slate-100" />}
                                                    {team.name}
                                                </td>
                                                <td className="p-4 text-slate-600">{team.province}</td>
                                                <td className="p-4"><span className={`px-2 py-1 rounded-full text-xs font-bold ${team.status === 'Approved' ? 'bg-green-100 text-green-700' : team.status === 'Rejected' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>{team.status}</span></td>
                                                <td className="p-4 font-mono font-bold text-indigo-600">{team.group || '-'}</td>
                                                <td className="p-4 text-right flex justify-end gap-2">
                                                    <button onClick={() => { setSelectedTeam(team); setIsEditingTeam(true); }} className="p-1.5 hover:bg-indigo-50 text-indigo-600 rounded"><Edit3 className="w-4 h-4"/></button>
                                                    <button onClick={() => handleDeleteTeam(team.id)} className="p-1.5 hover:bg-red-50 text-red-600 rounded"><Trash2 className="w-4 h-4"/></button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        )}

        {/* --- CONTESTS TAB --- */}
        {activeTab === 'schedule' && (
            <div className="animate-in fade-in duration-300">
                <AdminSchedule
                    tournaments={tournaments || []}
                    teams={allTeams.length ? allTeams : localTeams}
                    matches={allMatches}
                    currentTournamentId={currentTournament?.id || ''}
                    onRefresh={onRefresh}
                    notify={(title, msg = '', type = 'success') =>
                        showNotification?.(title, msg, type)}
                />
            </div>
        )}

        {/* --- เพิ่มทีมโดยแอดมิน --- */}
        {addTeamOpen && (
          <div className="fixed inset-0 z-[1400] bg-black/60 backdrop-blur-sm modal-sheet flex items-end md:items-center justify-center p-0 md:p-4"
            onClick={() => setAddTeamOpen(false)}>
            <div className="bg-white w-full md:max-w-lg rounded-2xl max-h-[92vh] overflow-y-auto"
              onClick={e => e.stopPropagation()}>
              <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-3 flex items-center justify-between">
                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-indigo-600" /> เพิ่มทีมเข้าแข่งขัน
                </h3>
                <button onClick={() => setAddTeamOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-100">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-5 space-y-4">
                <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3 text-xs text-indigo-800">
                  เพิ่มเข้ารายการ <b>{currentTournament?.name ?? 'ยังไม่ได้เลือกรายการ'}</b>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">
                    โรงเรียน <span className="text-rose-500">*</span>
                  </label>
                  <SearchPicker
                    value={addTeamForm.schoolId}
                    onChange={(id, item) => setAddTeamForm(f => ({
                      ...f, schoolId: id, schoolName: item?.label ?? '',
                      name: f.name || (item?.label ?? ''),
                    }))}
                    load={loadSchoolOptions}
                    placeholder="พิมพ์ชื่อโรงเรียนเพื่อค้นหา..."
                    emptyText="ไม่พบโรงเรียนนี้ในระบบ"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    ทีมต้องผูกกับโรงเรียนที่มีในระบบ เพื่อให้ตามประวัติข้ามรายการได้
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">ชื่อทีม</label>
                    <input className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                      placeholder={addTeamForm.schoolName || 'ใช้ชื่อโรงเรียน'}
                      value={addTeamForm.name}
                      onChange={e => setAddTeamForm(f => ({ ...f, name: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">ชื่อย่อ</label>
                    <input className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                      placeholder="เช่น T01" value={addTeamForm.shortName}
                      onChange={e => setAddTeamForm(f => ({ ...f, shortName: e.target.value }))} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">ผู้จัดการทีม</label>
                    <input className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                      value={addTeamForm.managerName}
                      onChange={e => setAddTeamForm(f => ({ ...f, managerName: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">เบอร์ติดต่อ</label>
                    <input className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                      value={addTeamForm.managerPhone}
                      onChange={e => setAddTeamForm(f => ({ ...f, managerPhone: e.target.value }))} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">สาย (ไม่บังคับ)</label>
                    <input className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                      placeholder="A" value={addTeamForm.groupName}
                      onChange={e => setAddTeamForm(f => ({ ...f, groupName: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">สถานะ</label>
                    <select className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                      value={addTeamForm.status}
                      onChange={e => setAddTeamForm(f => ({ ...f, status: e.target.value }))}>
                      <option value="Approved">อนุมัติแล้ว (ลงแข่งได้ทันที)</option>
                      <option value="Invited">รอโรงเรียนยืนยัน</option>
                      <option value="Draft">โรงเรียนกำลังกรอก</option>
                      <option value="Submitted">รออนุมัติ</option>
                    </select>
                  </div>
                </div>

                <p className="text-[11px] text-slate-400">
                  เพิ่มทีมแล้วรายชื่อนักกีฬายังว่าง ให้โรงเรียนกรอกเองผ่านหน้า /school
                  ด้วยรหัสเข้าใช้งาน หรือกดปุ่มจัดการที่การ์ดทีมเพื่อกรอกแทน
                </p>
              </div>

              <div className="sticky bottom-0 bg-white border-t border-slate-100 p-4 flex gap-2 safe-area-bottom">
                <button onClick={() => setAddTeamOpen(false)}
                  className="flex-1 py-2.5 rounded-xl border-2 border-slate-300 font-bold text-slate-700">
                  ยกเลิก
                </button>
                <button onClick={submitAddTeam}
                  disabled={addTeamBusy || !addTeamForm.schoolId || !currentTournament?.id}
                  className="flex-[2] py-2.5 rounded-xl bg-indigo-600 text-white font-bold disabled:opacity-50 flex items-center justify-center gap-2">
                  {addTeamBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                  เพิ่มทีม
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'tournaments' && (
            <AdminTournaments
                tournaments={tournaments || []}
                teams={allTeams.length ? allTeams : localTeams}
                matches={allMatches || []}
                onRefresh={onRefresh}
                notify={(title, msg = '', type = 'success') =>
                    showNotification?.(title, msg, type)}
            />
        )}

        {activeTab === 'tools' && (
            <div className="animate-in fade-in duration-300">
                <AdminTools
                    tournaments={tournaments || []}
                    teams={allTeams.length ? allTeams : localTeams}
                    currentTournamentId={currentTournament?.id || ''}
                    onRefresh={onRefresh}
                    notify={(title, msg = '', type = 'success') =>
                        showNotification?.(title, msg, type)}
                />
            </div>
        )}

        {activeTab === 'contests' && (
            <div className="animate-in fade-in duration-300">
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row justify-between items-center gap-4 sticky top-0 bg-white z-10">
                        <div className="flex items-center gap-3">
                            <h2 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                                <Camera className="w-6 h-6 text-indigo-600" /> จัดการประกวดภาพถ่าย
                            </h2>
                        </div>
                        <div className="flex gap-2 w-full md:w-auto items-center">
                            <select value={contestFilter} onChange={(e) => setContestFilter(e.target.value as any)} className="px-3 py-2 border rounded-lg text-sm bg-slate-50 focus:bg-white outline-none focus:ring-2 focus:ring-indigo-500">
                                <option value="All">ทั้งหมด</option>
                                <option value="Open">เปิดรับสมัคร</option>
                                <option value="Closed">ปิดแล้ว</option>
                            </select>
                            <div className="relative flex-1 md:flex-none">
                                <input 
                                    type="text" 
                                    placeholder="ค้นหากิจกรรม..." 
                                    value={contestSearch}
                                    onChange={(e) => setContestSearch(e.target.value)}
                                    className="pl-9 pr-4 py-2 border rounded-lg text-sm w-full bg-slate-50 focus:bg-white outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                            </div>
                            <div className="flex border rounded-lg overflow-hidden shrink-0">
                                <button onClick={() => setContestViewMode('grid')} className={`p-2 ${contestViewMode === 'grid' ? 'bg-indigo-50 text-indigo-600' : 'bg-white text-slate-400 hover:text-slate-600'}`}><Grid className="w-4 h-4"/></button>
                                <button onClick={() => setContestViewMode('list')} className={`p-2 ${contestViewMode === 'list' ? 'bg-indigo-50 text-indigo-600' : 'bg-white text-slate-400 hover:text-slate-600'}`}><List className="w-4 h-4"/></button>
                            </div>
                            <button onClick={handleLocalRefresh} className="p-2 border rounded-lg hover:bg-slate-50 text-slate-500" title="Refresh"><RefreshCw className="w-4 h-4"/></button>
                            <button onClick={handleCreateContest} className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg font-bold text-sm hover:bg-indigo-700 transition">
                                <Plus className="w-4 h-4" /> สร้างกิจกรรม
                            </button>
                        </div>
                    </div>
                    
                    <div className="p-6 bg-slate-50 min-h-[400px]">
                        {contestViewMode === 'grid' ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {filteredContests.map(contest => {
                                    const entryCount = contestEntries.filter(e => e.contestId === contest.id).length;
                                    return (
                                        <div key={contest.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition group relative flex flex-col">
                                            <div className="p-5 flex-1">
                                                <div className="flex justify-between items-start mb-3">
                                                    <div className={`text-xs px-2 py-1 rounded-full font-bold ${contest.status === 'Open' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                                                        {contest.status === 'Open' ? 'เปิดรับสมัคร' : 'ปิดแล้ว'}
                                                    </div>
                                                    <div className="text-xs text-slate-400 flex items-center gap-2">
                                                        <span className="flex items-center gap-1 bg-slate-50 px-2 py-0.5 rounded border border-slate-100"><Image className="w-3 h-3"/> {entryCount}</span>
                                                        {contest.closingDate && (
                                                            <span className="flex items-center gap-1"><Clock className="w-3 h-3"/> {new Date(contest.closingDate).toLocaleDateString('th-TH')}</span>
                                                        )}
                                                    </div>
                                                </div>
                                                <h3 className="font-bold text-lg text-slate-800 mb-2">{contest.title}</h3>
                                                <p className="text-sm text-slate-500 line-clamp-3">{contest.description}</p>
                                            </div>
                                            <div className="bg-slate-50 p-3 flex justify-between items-center border-t border-slate-100">
                                                <div className="text-xs text-slate-400">Created: {new Date(contest.createdDate).toLocaleDateString('th-TH')}</div>
                                                <div className="flex gap-2">
                                                    <button 
                                                        onClick={() => handleToggleContestStatus(contest)} 
                                                        className={`p-1.5 rounded-lg border text-xs font-bold flex items-center gap-1 transition ${contest.status === 'Open' ? 'border-red-200 text-red-600 hover:bg-red-50' : 'border-green-200 text-green-600 hover:bg-green-50'}`}
                                                    >
                                                        <Power className="w-3 h-3"/> {contest.status === 'Open' ? 'ปิด' : 'เปิด'}
                                                    </button>
                                                    <button onClick={() => handleEditContest(contest)} className="p-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg hover:text-indigo-600 hover:border-indigo-200 transition">
                                                        <Edit3 className="w-4 h-4"/>
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
                                        <tr>
                                            <th className="p-4">หัวข้อกิจกรรม</th>
                                            <th className="p-4 text-center">สถานะ</th>
                                            <th className="p-4 text-center">จำนวนภาพ</th>
                                            <th className="p-4">ปิดรับเมื่อ</th>
                                            <th className="p-4 text-right">จัดการ</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {filteredContests.map(contest => {
                                            const entryCount = contestEntries.filter(e => e.contestId === contest.id).length;
                                            return (
                                                <tr key={contest.id} className="hover:bg-slate-50 transition">
                                                    <td className="p-4 font-bold text-slate-700">
                                                        {contest.title}
                                                        <p className="text-xs text-slate-400 font-normal truncate max-w-[200px]">{contest.description}</p>
                                                    </td>
                                                    <td className="p-4 text-center">
                                                        <span className={`text-xs px-2 py-1 rounded-full font-bold ${contest.status === 'Open' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                                                            {contest.status}
                                                        </span>
                                                    </td>
                                                    <td className="p-4 text-center font-mono text-indigo-600 font-bold">{entryCount}</td>
                                                    <td className="p-4 text-slate-500 text-xs">
                                                        {contest.closingDate ? new Date(contest.closingDate).toLocaleString('th-TH') : '-'}
                                                    </td>
                                                    <td className="p-4 text-right flex justify-end gap-2">
                                                        <button 
                                                            onClick={() => handleToggleContestStatus(contest)} 
                                                            className={`p-1.5 rounded border text-xs font-bold transition ${contest.status === 'Open' ? 'text-red-600 border-red-200 hover:bg-red-50' : 'text-green-600 border-green-200 hover:bg-green-50'}`}
                                                            title={contest.status === 'Open' ? 'ปิดกิจกรรม' : 'เปิดกิจกรรม'}
                                                        >
                                                            <Power className="w-4 h-4"/>
                                                        </button>
                                                        <button onClick={() => handleEditContest(contest)} className="p-1.5 hover:bg-indigo-50 text-indigo-600 rounded border border-slate-200 hover:border-indigo-200"><Edit3 className="w-4 h-4"/></button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                        
                        {filteredContests.length === 0 && (
                            <div className="col-span-full text-center py-12 text-slate-400 border-2 border-dashed border-slate-200 rounded-xl">
                                ไม่พบกิจกรรมตามเงื่อนไข
                            </div>
                        )}
                    </div>
                </div>
            </div>
        )}

        {/* --- SETTINGS TAB --- */}
        {activeTab === 'settings' && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 animate-in fade-in duration-300">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2"><Settings className="w-6 h-6 text-indigo-600" /> ตั้งค่าระบบ</h2>
                    <button onClick={handleSaveConfig} disabled={isSavingSettings} className="bg-indigo-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-indigo-700 transition flex items-center gap-2 shadow-lg shadow-indigo-200">
                        {isSavingSettings ? <Loader2 className="w-4 h-4 animate-spin"/> : <Save className="w-4 h-4"/>} บันทึก
                    </button>
                </div>
                
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <div className="space-y-4">
                        <h3 className="font-bold text-slate-500 text-sm uppercase tracking-wider border-b pb-2">ค่าเริ่มต้นของระบบ</h3>
                        {/* ชื่อรายการ ประกาศ และโลโก้ ย้ายไปตั้งที่ "รายการแข่งขัน" แล้ว
                            ที่เหลือไว้ตรงนี้เป็นค่าสำรอง ใช้ตอนที่ยังไม่มีรายการใดถูกเลือก
                            (เช่น เปิดเว็บครั้งแรกก่อนสร้างรายการแรก) */}
                        <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-3">
                            <p className="text-xs text-indigo-800 leading-relaxed">
                                ช่องด้านล่างเป็น <strong>ค่าสำรอง</strong> ใช้เฉพาะตอนที่รายการแข่งขันไม่ได้ตั้งค่าของตัวเองไว้
                                ปกติให้ตั้งที่แท็บ "รายการแข่งขัน" เพราะแต่ละปีใช้ชื่อ โลโก้ และประกาศคนละชุด
                            </p>
                        </div>
                        <div><label className="block text-sm font-bold text-slate-700 mb-1">ชื่อเว็บ (ค่าสำรอง)</label><input type="text" value={configForm.competitionName} onChange={e => setConfigForm({...configForm, competitionName: e.target.value})} className="w-full p-2 border rounded-lg" /></div>
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-1">โลโก้กลาง (ค่าสำรอง)</label>
                            <div className="flex items-center gap-4">
                                {settingsLogoPreview ? <img src={settingsLogoPreview} className="w-16 h-16 object-contain border rounded-lg p-1" /> : <div className="w-16 h-16 bg-slate-100 rounded-lg flex items-center justify-center text-slate-400 text-xs">No Logo</div>}
                                <label className="cursor-pointer bg-slate-50 border border-slate-300 px-4 py-2 rounded-lg text-sm hover:bg-slate-100 transition">เปลี่ยนรูป<input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && handleSettingsLogoChange(e.target.files[0])} className="hidden" /></label>
                            </div>
                        </div>
                        <div><label className="block text-sm font-bold text-slate-700 mb-1">รหัส Admin PIN</label><input type="text" value={configForm.adminPin || ''} onChange={e => setConfigForm({...configForm, adminPin: e.target.value})} className="w-full p-2 border rounded-lg font-mono tracking-widest" /></div>
                        <label className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 cursor-pointer hover:border-indigo-200 transition">
                            <div>
                                <p className="font-bold text-sm text-slate-800">แสดงปุ่ม Support Us</p>
                                <p className="text-xs text-slate-500 mt-0.5">ปิดเพื่อซ่อนปุ่มสนับสนุนจากหน้าหลักของผู้ใช้ทุกคน</p>
                            </div>
                            <span className="relative inline-flex items-center shrink-0">
                                <input
                                  type="checkbox"
                                  className="sr-only peer"
                                  checked={configForm.showSupportButton === undefined || configForm.showSupportButton === true || ['1', 'true', 'on', 'yes'].includes(String(configForm.showSupportButton).toLowerCase())}
                                  onChange={e => setConfigForm({...configForm, showSupportButton: e.target.checked})}
                                />
                                <span className="w-11 h-6 bg-slate-300 rounded-full peer peer-checked:bg-indigo-600 transition-colors after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:w-5 after:h-5 after:bg-white after:rounded-full after:shadow after:transition-transform peer-checked:after:translate-x-5" />
                            </span>
                        </label>
                    </div>

                    {/* ── หน้าจอต้อนรับก่อนเข้าเว็บ ────────────────────────
                        ค่าที่นี่ถูกอ่านจากสำเนาในเครื่องผู้ชม จึงมีผลตั้งแต่การเข้า
                        ครั้งถัดไปเป็นต้นไป (ครั้งแรกสุดของเครื่องยังเป็นค่าเริ่มต้น
                        เพราะหน้านี้ถูกวาดก่อนข้อมูลตั้งค่าจะมาถึง) */}
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                        <div>
                            <h4 className="font-bold text-slate-800 text-sm">หน้าจอต้อนรับก่อนเข้าเว็บ</h4>
                            <p className="text-xs text-slate-500 mt-0.5">
                                จอที่แสดงโลโก้และข้อความระหว่างรอโหลดข้อมูล — เว้นว่างไว้เพื่อใช้ค่าเริ่มต้น
                            </p>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-600 mb-1">
                                โลโก้ / ภาพเคลื่อนไหว / วิดีโอ (ลิงก์)
                            </label>
                            <input type="text" placeholder="https://... (.png .gif .webp .mp4 .webm)"
                                value={configForm.splashLogoUrl || ''}
                                onChange={e => setConfigForm({...configForm, splashLogoUrl: e.target.value})}
                                className="w-full p-2 border rounded-lg text-sm" />
                            <p className="text-[11px] text-slate-500 mt-1">
                                รองรับรูปนิ่ง, GIF/WebP เคลื่อนไหว และไฟล์วิดีโอ (.mp4 .webm) — วิดีโอจะเล่นวนแบบไม่มีเสียง
                            </p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-bold text-slate-600 mb-1">ข้อความหลัก</label>
                                <input type="text" placeholder="Penalty Pro Arena"
                                    value={configForm.splashTitle || ''}
                                    onChange={e => setConfigForm({...configForm, splashTitle: e.target.value})}
                                    className="w-full p-2 border rounded-lg text-sm" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-600 mb-1">ข้อความรอง</label>
                                <input type="text" placeholder="กำลังโหลดข้อมูลการแข่งขัน..."
                                    value={configForm.splashSubtitle || ''}
                                    onChange={e => setConfigForm({...configForm, splashSubtitle: e.target.value})}
                                    className="w-full p-2 border rounded-lg text-sm" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-600 mb-1">ข้อความด้านล่าง</label>
                                <input type="text" placeholder="เว้นว่าง = ไม่แสดง"
                                    value={configForm.splashFooter || ''}
                                    onChange={e => setConfigForm({...configForm, splashFooter: e.target.value})}
                                    className="w-full p-2 border rounded-lg text-sm" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-600 mb-1">
                                    ค้างจออย่างน้อย (วินาที)
                                </label>
                                <input type="number" min={0} max={10} step={0.5} placeholder="0"
                                    value={configForm.splashSeconds ?? ''}
                                    onChange={e => setConfigForm({...configForm, splashSeconds: e.target.value})}
                                    className="w-full p-2 border rounded-lg text-sm" />
                                <p className="text-[11px] text-slate-500 mt-1">
                                    0 = ปิดทันทีที่โหลดเสร็จ · สูงสุด 10 วินาที
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* ค่าสมัคร บัญชีรับเงิน และสนาม ย้ายไปอยู่ที่ "รายการแข่งขัน" ที่เดียว
                        เพราะเป็นค่าประจำแต่ละรายการ (คนละปีเก็บเงินไม่เท่ากัน คนละบัญชี คนละสนาม)
                        เดิมมีให้กรอก 2 ที่ แก้ที่นี่แล้วหน้าเว็บไม่เปลี่ยนเพราะค่าของรายการทับอยู่ */}
                    <div className="space-y-3">
                        <h3 className="font-bold text-slate-500 text-sm uppercase tracking-wider border-b pb-2">ตั้งค่ารายการแข่งขัน</h3>
                        <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-4">
                            <p className="text-sm text-indigo-900 font-bold flex items-center gap-2">
                                <Info className="w-4 h-4" /> ย้ายไปที่แท็บ "รายการแข่งขัน" แล้ว
                            </p>
                            <p className="text-xs text-indigo-700 mt-1.5 leading-relaxed">
                                ค่าพวกนี้เป็นของแต่ละรายการ ไม่ใช่ของทั้งระบบ เดิมมีให้กรอก 2 ที่
                                แก้ที่นี่แล้วหน้าเว็บไม่เปลี่ยน เพราะค่าของรายการทับอยู่
                            </p>
                            <ul className="text-xs text-indigo-800 mt-2.5 space-y-1">
                                <li>ชื่อรายการ โลโก้ และประกาศวิ่งหน้าแรก</li>
                                <li>ค่าสมัคร ธนาคาร และเลขบัญชี</li>
                                <li>สนามแข่งขันและลิงก์แผนที่</li>
                                <li>เงินรางวัลแต่ละอันดับ</li>
                                <li>โครงการระดมทุน เอกสาร และรูปก่อน/หลัง</li>
                            </ul>
                            <button
                                onClick={() => setActiveTab('tournaments')}
                                className="mt-3 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 flex items-center gap-2"
                            >
                                <Trophy className="w-4 h-4" /> ไปที่รายการแข่งขัน
                            </button>
                        </div>
                    </div>
                    
                    <div className="space-y-4 lg:col-span-2">
                        <h3 className="font-bold text-slate-500 text-sm uppercase tracking-wider border-b pb-2">การเชื่อมต่อระบบ (Integration)</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">LIFF ID (LINE Front-end Framework)</label>
                                <input 
                                    type="text" 
                                    value={configForm.liffId || ''} 
                                    onChange={e => setConfigForm({...configForm, liffId: e.target.value})} 
                                    className="w-full p-2 border rounded-lg font-mono text-xs" 
                                    placeholder="เช่น 1657xxxxxx-xxxxxxx"
                                />
                                <p className="text-[10px] text-slate-400 mt-1">ใช้สำหรับการแชร์ผลบอลและการยืนยันตัวตนผ่าน LINE</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        )}

        {/* --- NEWS TAB --- */}
        {activeTab === 'news' && (
            <div className="animate-in fade-in duration-300">
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="p-6 border-b border-slate-100 flex justify-between items-center sticky top-0 bg-white z-10">
                        <h2 className="font-bold text-lg text-slate-800">จัดการข่าวสาร</h2>
                        <div className="flex gap-2">
                            <input 
                                type="text" 
                                placeholder="ค้นหาข่าว..." 
                                value={newsSearch}
                                onChange={e => setNewsSearch(e.target.value)}
                                className="p-2 border rounded-lg text-sm w-48 focus:w-64 transition-all outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                            <div className="flex border rounded-lg overflow-hidden shrink-0">
                                <button onClick={() => setNewsViewMode('grid')} className={`p-2 ${newsViewMode === 'grid' ? 'bg-indigo-50 text-indigo-600' : 'bg-white text-slate-400 hover:text-slate-600'}`}><Grid className="w-4 h-4"/></button>
                                <button onClick={() => setNewsViewMode('list')} className={`p-2 ${newsViewMode === 'list' ? 'bg-indigo-50 text-indigo-600' : 'bg-white text-slate-400 hover:text-slate-600'}`}><List className="w-4 h-4"/></button>
                            </div>
                            <button onClick={handleLocalRefresh} className="p-2 border rounded-lg hover:bg-slate-50 text-slate-500" title="Refresh"><RefreshCw className="w-4 h-4"/></button>
                            <button onClick={handleAddNewNews} className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg font-bold text-sm hover:bg-indigo-700 transition">
                                <Plus className="w-4 h-4" /> เพิ่มข่าว
                            </button>
                        </div>
                    </div>
                    
                    <div className="p-6 bg-slate-50 min-h-[400px]">
                        {newsViewMode === 'grid' ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {filteredNews.map(item => (
                                    <div key={item.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition group relative">
                                        <div className="h-40 bg-slate-100 relative overflow-hidden">
                                            {item.imageUrl ? (
                                                <img src={item.imageUrl} className="w-full h-full object-cover transition duration-500 group-hover:scale-105"/>
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-slate-300"><Image className="w-12 h-12"/></div>
                                            )}
                                            {(!item.tournamentId || item.tournamentId === 'global') && (
                                                <div className="absolute top-2 right-2 bg-black/50 text-white text-[10px] px-2 py-1 rounded-full backdrop-blur-sm flex items-center gap-1">
                                                    <Globe className="w-3 h-3" /> Global
                                                </div>
                                            )}
                                        </div>
                                        <div className="p-4">
                                            <div className="flex justify-between items-start mb-2">
                                                <div className="text-xs text-slate-400 flex items-center gap-1"><Calendar className="w-3 h-3"/> {new Date(item.timestamp).toLocaleDateString('th-TH')}</div>
                                                <div className="flex gap-1">
                                                    <button onClick={() => handleEditNews(item)} className="p-1 text-slate-400 hover:text-indigo-600 rounded hover:bg-indigo-50"><Edit3 className="w-4 h-4"/></button>
                                                    <button onClick={() => triggerDeleteNews(item.id)} className="p-1 text-slate-400 hover:text-red-600 rounded hover:bg-red-50"><Trash2 className="w-4 h-4"/></button>
                                                </div>
                                            </div>
                                            <h3 className="font-bold text-slate-800 line-clamp-1 mb-2">{item.title}</h3>
                                            <p className="text-xs text-slate-500 line-clamp-2">{item.content}</p>
                                            {item.documentUrl && <div className="mt-2 flex items-center gap-1 text-[10px] text-indigo-500 font-bold"><Paperclip className="w-3 h-3"/> มีไฟล์แนบ</div>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
                                        <tr>
                                            <th className="p-4">หัวข้อข่าว</th>
                                            <th className="p-4">วันที่</th>
                                            <th className="p-4">ประเภท</th>
                                            <th className="p-4 text-right">จัดการ</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {filteredNews.map(item => (
                                            <tr key={item.id} className="hover:bg-slate-50 transition">
                                                <td className="p-4 font-bold text-slate-700">{item.title}</td>
                                                <td className="p-4 text-slate-500">{new Date(item.timestamp).toLocaleDateString('th-TH')}</td>
                                                <td className="p-4"><span className="text-xs bg-slate-100 px-2 py-1 rounded text-slate-600">{(!item.tournamentId || item.tournamentId === 'global') ? 'Global' : 'Tournament'}</span></td>
                                                <td className="p-4 text-right flex justify-end gap-2">
                                                    <button onClick={() => handleEditNews(item)} className="p-1.5 hover:bg-indigo-50 text-indigo-600 rounded"><Edit3 className="w-4 h-4"/></button>
                                                    <button onClick={() => triggerDeleteNews(item.id)} className="p-1.5 hover:bg-red-50 text-red-600 rounded"><Trash2 className="w-4 h-4"/></button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                        {filteredNews.length === 0 && <div className="text-center py-12 text-slate-400">ยังไม่มีข่าวสาร</div>}
                    </div>
                </div>
            </div>
        )}

        {/* ... DONATIONS TAB ... */}
        {activeTab === 'donations' && (
            <div className="animate-in fade-in duration-300">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200"><div className="flex items-center justify-between"><div><p className="text-slate-500 text-sm">ยอดรวมทั้งหมด</p><p className="text-3xl font-bold text-green-600">{filteredDonations.filter(d => d.status === 'Verified').reduce((sum, d) => sum + d.amount, 0).toLocaleString()}</p></div><div className="p-3 bg-green-50 rounded-full"><DollarSign className="w-6 h-6 text-green-600" /></div></div></div>
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200"><div className="flex items-center justify-between"><div><p className="text-slate-500 text-sm">รายการรอตรวจสอบ</p><p className="text-3xl font-bold text-orange-500">{filteredDonations.filter(d => d.status === 'Pending').length}</p></div><div className="p-3 bg-orange-50 rounded-full"><Clock className="w-6 h-6 text-orange-500" /></div></div></div>
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200"><div className="flex items-center justify-between"><div><p className="text-slate-500 text-sm">ขอ e-Donation</p><p className="text-3xl font-bold text-blue-600">{filteredDonations.filter(d => d.isEdonation).length}</p></div><div className="p-3 bg-blue-50 rounded-full"><FileText className="w-6 h-6 text-blue-600" /></div></div></div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="p-6 border-b border-slate-100 flex justify-between items-center sticky top-0 bg-white z-10">
                        <h2 className="font-bold text-lg text-slate-800">รายการบริจาค</h2>
                        <div className="flex gap-2">
                            <input 
                                type="text" 
                                placeholder="ค้นหาผู้บริจาค..." 
                                value={donationSearch}
                                onChange={e => setDonationSearch(e.target.value)}
                                className="p-2 border rounded-lg text-sm w-48 focus:w-64 transition-all outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                            <div className="flex border rounded-lg overflow-hidden shrink-0">
                                <button onClick={() => setDonationViewMode('grid')} className={`p-2 ${donationViewMode === 'grid' ? 'bg-indigo-50 text-indigo-600' : 'bg-white text-slate-400 hover:text-slate-600'}`}><Grid className="w-4 h-4"/></button>
                                <button onClick={() => setDonationViewMode('list')} className={`p-2 ${donationViewMode === 'list' ? 'bg-indigo-50 text-indigo-600' : 'bg-white text-slate-400 hover:text-slate-600'}`}><List className="w-4 h-4"/></button>
                            </div>
                            <button onClick={handleLocalRefresh} className="p-2 border rounded-lg hover:bg-slate-50 text-slate-500" title="Refresh"><RefreshCw className="w-4 h-4"/></button>
                        </div>
                    </div>

                    <div className="p-6 bg-slate-50 min-h-[400px]">
                        {donationViewMode === 'grid' ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                                {filteredDonations.map(don => (
                                    <div key={don.id} onClick={() => setSelectedDonation(don)} className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-md transition cursor-pointer relative overflow-hidden group">
                                        <div className="flex justify-between items-start mb-2">
                                            <div className="flex items-center gap-2">
                                                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${don.isAnonymous ? 'bg-slate-100 text-slate-500' : 'bg-indigo-100 text-indigo-600'}`}>
                                                    {don.isAnonymous ? <User className="w-4 h-4"/> : don.donorName.charAt(0)}
                                                </div>
                                                <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${don.status === 'Verified' ? 'bg-green-100 text-green-700' : don.status === 'Rejected' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>{don.status}</span>
                                            </div>
                                            {don.isEdonation && <div className="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded border border-blue-100 font-bold">e-Donation</div>}
                                        </div>
                                        <div className="mb-2">
                                            <h4 className="font-bold text-slate-800 text-sm truncate">{don.donorName}</h4>
                                            <p className="text-xl font-black text-indigo-600">{don.amount.toLocaleString()}</p>
                                        </div>
                                        <div className="text-xs text-slate-400 flex justify-between items-center border-t pt-2 mt-2">
                                            <span>{new Date(don.timestamp).toLocaleDateString('th-TH')}</span>
                                            {don.slipUrl && <CreditCard className="w-4 h-4 text-slate-300"/>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
                                        <tr>
                                            <th className="p-4">วันที่</th>
                                            <th className="p-4">ผู้บริจาค</th>
                                            <th className="p-4 text-right">จำนวนเงิน</th>
                                            <th className="p-4 text-center">สถานะ</th>
                                            <th className="p-4 text-center">e-Donation</th>
                                            <th className="p-4 text-right">จัดการ</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {filteredDonations.map(don => (
                                            <tr key={don.id} onClick={() => setSelectedDonation(don)} className="hover:bg-slate-50 transition cursor-pointer">
                                                <td className="p-4 text-slate-500">{new Date(don.timestamp).toLocaleDateString('th-TH')}</td>
                                                <td className="p-4 font-bold text-slate-700">{don.donorName} {don.isAnonymous && <span className="text-[10px] text-slate-400">(Anon)</span>}</td>
                                                <td className="p-4 text-right font-mono font-bold text-indigo-600">{don.amount.toLocaleString()}</td>
                                                <td className="p-4 text-center"><span className={`px-2 py-1 rounded-full text-xs font-bold ${don.status === 'Verified' ? 'bg-green-100 text-green-700' : don.status === 'Rejected' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>{don.status}</span></td>
                                                <td className="p-4 text-center">{don.isEdonation ? <CheckCircle2 className="w-4 h-4 text-blue-500 mx-auto"/> : '-'}</td>
                                                <td className="p-4 text-right"><button className="text-xs bg-white border px-2 py-1 rounded hover:bg-slate-50">ตรวจสอบ</button></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                        {filteredDonations.length === 0 && <div className="text-center py-12 text-slate-400">ไม่มีรายการบริจาค</div>}
                    </div>
                </div>
            </div>
        )}

        {/* --- USERS TAB --- */}
        {activeTab === 'users' && (
            <div className="animate-in fade-in duration-300 space-y-4">

                {/* การ์ดสถิติ — นับจากผู้ใช้ทั้งหมด ไม่ขึ้นกับตัวกรองที่เลือกอยู่
                    กดการ์ดเพื่อกรองได้ทันที เร็วกว่าไปหาตัวกรองอีกที */}
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 sm:gap-3">
                    {([
                        { key: 'all',      label: 'ผู้ใช้ทั้งหมด', value: userStats.total,      cls: 'text-slate-900', icon: <UserCog className="w-4 h-4" />, on: userRoleFilter === 'all' && userSchoolFilter === 'all' },
                        { key: 'crew',     label: 'ผู้ดูแล/เจ้าหน้าที่', value: userStats.crew, cls: 'text-purple-600', icon: <ShieldCheck className="w-4 h-4" />, on: userRoleFilter === 'admin' },
                        { key: 'line',     label: 'เข้าด้วย LINE',  value: userStats.line,       cls: 'text-emerald-600', icon: <Smartphone className="w-4 h-4" />, on: false },
                        { key: 'verified', label: 'รับรองโรงเรียนแล้ว', value: userStats.verified, cls: 'text-sky-600', icon: <CheckCircle2 className="w-4 h-4" />, on: userSchoolFilter === 'verified' },
                        { key: 'pending',  label: 'รอรับรอง/ยังไม่เลือก', value: userStats.selfPicked + userStats.noSchool, cls: 'text-amber-600', icon: <AlertTriangle className="w-4 h-4" />, on: userSchoolFilter === 'self' },
                    ]).map(c => (
                        <button key={c.key}
                            onClick={() => {
                                if (c.key === 'all') { setUserRoleFilter('all'); setUserSchoolFilter('all'); }
                                else if (c.key === 'crew') { setUserSchoolFilter('all'); setUserRoleFilter(userRoleFilter === 'admin' ? 'all' : 'admin'); }
                                else if (c.key === 'verified') { setUserRoleFilter('all'); setUserSchoolFilter(userSchoolFilter === 'verified' ? 'all' : 'verified'); }
                                else if (c.key === 'pending') { setUserRoleFilter('all'); setUserSchoolFilter(userSchoolFilter === 'self' ? 'all' : 'self'); }
                            }}
                            disabled={c.key === 'line'}
                            className={`bg-white rounded-xl border p-3 text-left transition
                                ${c.on ? 'border-indigo-500 ring-2 ring-indigo-100' : 'border-slate-200'}
                                ${c.key === 'line' ? 'cursor-default' : 'hover:border-indigo-300'}`}>
                            <div className="flex items-center gap-1.5 text-slate-400">{c.icon}
                                <span className="text-[11px] font-bold leading-tight">{c.label}</span>
                            </div>
                            <p className={`text-2xl sm:text-3xl font-black tabular-nums mt-1 ${c.cls}`}>{c.value}</p>
                        </button>
                    ))}
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    {/* หัวข้อ — บนมือถือเรียงลงมาเป็นแถว ไม่ใช่บีบให้อยู่บรรทัดเดียวจนกดไม่ถูก */}
                    <div className="p-4 sm:p-5 border-b border-slate-100 space-y-3">
                        <div className="flex items-center justify-between gap-2">
                            <h2 className="font-bold text-lg text-slate-800">จัดการผู้ใช้งาน</h2>
                            <div className="flex gap-2 shrink-0">
                                <button onClick={loadUsers} className="p-2.5 border rounded-lg hover:bg-slate-50 text-slate-500" title="โหลดใหม่">
                                    <RefreshCw className="w-4 h-4"/>
                                </button>
                                <button onClick={() => handleOpenUserModal(null)} className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2.5 rounded-lg font-bold text-sm hover:bg-indigo-700 transition">
                                    <UserPlus className="w-4 h-4" /> <span className="hidden sm:inline">เพิ่มผู้ใช้</span>
                                </button>
                            </div>
                        </div>

                        <div className="relative">
                            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                            <input
                                type="text"
                                placeholder="ค้นหาชื่อ ชื่อผู้ใช้ เบอร์โทร หรือโรงเรียน"
                                value={userSearch}
                                onChange={e => setUserSearch(e.target.value)}
                                className="w-full h-11 pl-9 pr-3 border border-slate-300 rounded-lg text-base outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>

                        {/* ตัวกรอง — เลื่อนแนวนอนบนมือถือ ไม่ตัดบรรทัดจนสูงเกินครึ่งจอ */}
                        <div className="flex gap-2 overflow-x-auto -mx-1 px-1 pb-1">
                            {([
                                { v: 'all',   t: 'ทุกบทบาท' },
                                { v: 'admin', t: 'ผู้ดูแล' },
                                { v: 'staff', t: 'เจ้าหน้าที่' },
                                { v: 'referee', t: 'กรรมการ' },
                                { v: 'user',  t: 'ผู้ใช้ทั่วไป' },
                            ] as const).map(o => (
                                <button key={o.v} onClick={() => setUserRoleFilter(o.v)}
                                    className={`px-4 h-10 rounded-full text-xs font-bold whitespace-nowrap shrink-0 border transition
                                        ${userRoleFilter === o.v ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'}`}>
                                    {o.t}
                                </button>
                            ))}
                            <span className="w-px bg-slate-200 shrink-0 my-1" />
                            {([
                                { v: 'all',      t: 'ทุกสถานะโรงเรียน' },
                                { v: 'verified', t: 'รับรองแล้ว' },
                                { v: 'self',     t: 'ผู้ใช้เลือกเอง' },
                                { v: 'none',     t: 'ยังไม่ได้เลือก' },
                            ] as const).map(o => (
                                <button key={o.v} onClick={() => setUserSchoolFilter(o.v)}
                                    className={`px-4 h-10 rounded-full text-xs font-bold whitespace-nowrap shrink-0 border transition
                                        ${userSchoolFilter === o.v ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'}`}>
                                    {o.t}
                                </button>
                            ))}
                        </div>

                        <p className="text-xs text-slate-500">
                            พบ <strong className="text-slate-800">{filteredUsers.length}</strong> คน
                            {filteredUsers.length > USERS_PER_PAGE && (
                                <> · แสดงหน้า {Math.min(userPage, userPageCount)} จาก {userPageCount}</>
                            )}
                        </p>
                    </div>

                    {isLoadingUsers ? (
                        <div className="p-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-indigo-500"/></div>
                    ) : filteredUsers.length === 0 ? (
                        <div className="p-12 text-center text-slate-400">
                            <UserCog className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                            <p className="text-sm">ไม่พบผู้ใช้งานตามเงื่อนไขที่เลือก</p>
                        </div>
                    ) : (
                    <>
                        {/* มือถือ: การ์ด — ตารางกว้าง 6 คอลัมน์บีบลงจอ 375px แล้วอ่านไม่ออก */}
                        <div className="lg:hidden divide-y divide-slate-100">
                            {pagedUsers.map(user => (
                                <div key={user.userId} className="p-4">
                                    <div className="flex items-start gap-3">
                                        {user.pictureUrl
                                            ? <img src={user.pictureUrl} className="w-11 h-11 rounded-full object-cover border border-slate-200 shrink-0"/>
                                            : <div className="w-11 h-11 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 font-bold shrink-0">{user.displayName?.charAt(0)}</div>}
                                        <div className="min-w-0 flex-1">
                                            <p className="font-bold text-slate-800 break-words">{user.displayName}</p>
                                            <p className="text-xs text-slate-400 break-all">{user.username || user.lineUserId}</p>
                                            <div className="flex flex-wrap items-center gap-1.5 mt-2">
                                                <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${user.role === 'admin' ? 'bg-purple-100 text-purple-700' : user.role === 'staff' ? 'bg-blue-100 text-blue-700' : user.role === 'referee' ? 'bg-teal-100 text-teal-700' : 'bg-slate-100 text-slate-600'}`}>{user.role}</span>
                                                <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 text-slate-500">{user.type === 'line' ? 'LINE' : 'รหัสผ่าน'}</span>
                                                {user.schoolName ? (
                                                    user.schoolVerified
                                                        ? <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-700">รับรองแล้ว</span>
                                                        : <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-700">ผู้ใช้เลือกเอง</span>
                                                ) : !user.schoolChosen
                                                    ? <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-700">ยังไม่ได้เลือก</span>
                                                    : null}
                                            </div>
                                            {user.schoolName && <p className="text-xs text-slate-600 mt-1.5 break-words">{user.schoolName}</p>}
                                            <p className="text-[11px] text-slate-400 mt-1">
                                                เข้าล่าสุด {user.lastLogin ? new Date(user.lastLogin).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }) : 'ยังไม่เคย'}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex gap-2 mt-3">
                                        <button onClick={() => handleOpenUserModal(user)} className="flex-1 h-11 rounded-lg border border-slate-300 text-indigo-600 font-bold text-sm flex items-center justify-center gap-1.5">
                                            <Edit3 className="w-4 h-4"/> แก้ไข
                                        </button>
                                        <button onClick={() => handleDeleteUser(user.userId)} className="w-14 h-11 rounded-lg border border-slate-300 text-red-600 flex items-center justify-center">
                                            <Trash2 className="w-4 h-4"/>
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* จอคอม: ตารางเหมือนเดิม */}
                        <div className="hidden lg:block overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
                                    <tr>
                                        <th className="p-4">ผู้ใช้</th>
                                        <th className="p-4">บทบาท</th>
                                        <th className="p-4">โรงเรียน</th>
                                        <th className="p-4">ช่องทางเข้า</th>
                                        <th className="p-4">เข้าล่าสุด</th>
                                        <th className="p-4 text-right">จัดการ</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {pagedUsers.map(user => (
                                        <tr key={user.userId} className="hover:bg-slate-50 transition">
                                            <td className="p-4">
                                                <div className="flex items-center gap-3">
                                                    {user.pictureUrl ? <img src={user.pictureUrl} className="w-8 h-8 rounded-full object-cover border border-slate-200"/> : <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 font-bold">{user.displayName?.charAt(0)}</div>}
                                                    <div className="min-w-0">
                                                        <div className="font-bold text-slate-800 truncate">{user.displayName}</div>
                                                        <div className="text-xs text-slate-400 truncate">{user.username || user.lineUserId}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="p-4"><span className={`px-2 py-1 rounded text-xs font-bold ${user.role === 'admin' ? 'bg-purple-100 text-purple-700' : user.role === 'staff' ? 'bg-blue-100 text-blue-700' : user.role === 'referee' ? 'bg-teal-100 text-teal-700' : 'bg-slate-100 text-slate-600'}`}>{user.role}</span></td>
                                            <td className="p-4 text-xs">
                                                {user.schoolName ? (
                                                    <div className="flex flex-col gap-0.5">
                                                        <span className="text-slate-700">{user.schoolName}</span>
                                                        {/* รับรองแล้ว = เข้าจัดการทีมได้โดยไม่ต้องกรอกรหัส 8 ตัว
                                                            ยังไม่รับรอง = ผู้ใช้เลือกเอง ยังเชื่อไม่ได้ */}
                                                        {user.schoolVerified ? (
                                                            <span className="text-[10px] text-emerald-700 font-bold flex items-center gap-0.5">
                                                                <CheckCircle2 className="w-3 h-3" /> รับรองแล้ว
                                                            </span>
                                                        ) : (
                                                            <span className="text-[10px] text-amber-600 font-bold" title="ผู้ใช้เลือกเอง — ยังเข้าจัดการทีมโดยไม่กรอกรหัสไม่ได้">
                                                                ผู้ใช้เลือกเอง
                                                            </span>
                                                        )}
                                                    </div>
                                                ) : user.schoolChosen
                                                    ? <span className="text-slate-400">ไม่สังกัดโรงเรียน</span>
                                                    : <span className="text-amber-600 font-bold">ยังไม่ได้เลือก</span>}
                                            </td>
                                            <td className="p-4 text-slate-500 text-xs">{user.type === 'line' ? 'LINE' : 'รหัสผ่าน'}</td>
                                            <td className="p-4 text-slate-400 text-xs">{user.lastLogin ? new Date(user.lastLogin).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }) : '-'}</td>
                                            <td className="p-4">
                                                <div className="flex justify-end gap-2">
                                                    <button onClick={() => handleOpenUserModal(user)} className="p-1.5 hover:bg-indigo-50 text-indigo-600 rounded"><Edit3 className="w-4 h-4"/></button>
                                                    <button onClick={() => handleDeleteUser(user.userId)} className="p-1.5 hover:bg-red-50 text-red-600 rounded"><Trash2 className="w-4 h-4"/></button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* แบ่งหน้า */}
                        {userPageCount > 1 && (
                            <div className="p-4 border-t border-slate-100 flex items-center justify-between gap-2">
                                <button onClick={() => setUserPage(p => Math.max(1, p - 1))}
                                    disabled={userPage <= 1}
                                    className="h-11 px-4 rounded-lg border border-slate-300 text-sm font-bold disabled:opacity-40 flex items-center gap-1">
                                    <ChevronLeft className="w-4 h-4" /> ก่อนหน้า
                                </button>
                                <span className="text-sm font-bold text-slate-600 tabular-nums">
                                    {Math.min(userPage, userPageCount)} / {userPageCount}
                                </span>
                                <button onClick={() => setUserPage(p => Math.min(userPageCount, p + 1))}
                                    disabled={userPage >= userPageCount}
                                    className="h-11 px-4 rounded-lg border border-slate-300 text-sm font-bold disabled:opacity-40 flex items-center gap-1">
                                    ถัดไป <ChevronRight className="w-4 h-4" />
                                </button>
                            </div>
                        )}
                    </>
                    )}
                </div>
            </div>
        )}

      </div>
    </div>
  );
};

export default AdminDashboard;
