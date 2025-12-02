
import React, { useState, useEffect, useRef } from 'react';
import { Team, Player, AppSettings, NewsItem, Tournament, UserProfile, Donation } from '../types';
import { ShieldCheck, ShieldAlert, Users, LogOut, Eye, X, Settings, MapPin, CreditCard, Save, Image, Search, FileText, Bell, Plus, Trash2, Loader2, Grid, Edit3, Paperclip, Download, Upload, Copy, Phone, User, Camera, AlertTriangle, CheckCircle2, UserPlus, ArrowRight, Hash, Palette, Briefcase, ExternalLink, FileCheck, Info, Calendar, Trophy, Lock, Heart, Target, UserCog, Globe, DollarSign, Check, Shuffle, LayoutGrid, List, PlayCircle, StopCircle, SkipForward, Minus, Layers, RotateCcw, Sparkles, RefreshCw, MessageCircle, Printer, Share2 } from 'lucide-react';
import { updateTeamStatus, saveSettings, manageNews, fileToBase64, updateTeamData, fetchUsers, updateUserRole, verifyDonation, createUser, updateUserDetails, deleteUser, updateDonationDetails, fetchDatabase } from '../services/sheetService';
import { shareNews } from '../services/liffService';
import confetti from 'canvas-confetti';

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
  donations?: Donation[];
  isLoading?: boolean;
}

const MAX_IMAGE_SIZE = 2 * 1024 * 1024; // 2MB
const MAX_DOC_SIZE = 3 * 1024 * 1024;   // 3MB

const AdminSkeleton = () => (
  <div className="animate-in fade-in duration-300 w-full py-8">
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {[1,2,3].map(i => <div key={i} className="h-32 bg-white rounded-xl border border-slate-200 shadow-sm animate-pulse relative overflow-hidden"><div className="absolute inset-0 bg-gradient-to-r from-slate-100 via-white to-slate-100 -translate-x-full animate-[shimmer_1.5s_infinite]"></div></div>)}
    </div>
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex justify-between">
            <div className="h-8 bg-slate-200 rounded w-1/4 animate-pulse"></div>
            <div className="h-8 bg-slate-200 rounded w-1/6 animate-pulse"></div>
        </div>
        <div className="p-6 space-y-4">
            {[1,2,3,4,5,6].map(i => (
                <div key={i} className="h-20 bg-slate-50 rounded-xl border border-slate-100 animate-pulse relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-r from-slate-50 via-white to-slate-50 -translate-x-full animate-[shimmer_1.5s_infinite]"></div>
                </div>
            ))}
        </div>
    </div>
  </div>
);

export default function AdminDashboard({ teams: initialTeams, players: initialPlayers, settings, onLogout, onRefresh, news = [], showNotification, initialTeamId, currentTournament, tournaments = [], donations = [], isLoading }: AdminDashboardProps) {
  const [activeTab, setActiveTab] = useState<'teams' | 'settings' | 'news' | 'users' | 'donations'>('teams');
  const [localTeams, setLocalTeams] = useState<Team[]>(initialTeams);
  const [localPlayers, setLocalPlayers] = useState<Player[]>(initialPlayers);
  const [localNews, setLocalNews] = useState<NewsItem[]>(news);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [isReloading, setIsReloading] = useState(false);
  
  // User Management State
  const [userList, setUserList] = useState<UserProfile[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [userForm, setUserForm] = useState({ username: '', password: '', displayName: '', phone: '', role: 'user' });

  // Donation Management State
  const [donationList, setDonationList] = useState<Donation[]>(donations);
  const [selectedDonation, setSelectedDonation] = useState<Donation | null>(null);
  const [isVerifyingDonation, setIsVerifyingDonation] = useState(false);
  const [donationViewMode, setDonationViewMode] = useState<'grid' | 'list'>('grid');
  const [adminTaxFile, setAdminTaxFile] = useState<File | null>(null);

  // Teams Filter State
  const [filterStatus, setFilterStatus] = useState<string>('All');

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
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [isEditingTeam, setIsEditingTeam] = useState(false);
  const [modalTab, setModalTab] = useState<'info' | 'players' | 'docs'>('info'); 
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

  useEffect(() => {
    setLocalTeams(initialTeams);
    setLocalPlayers(initialPlayers);
    setDonationList(donations);
    setLocalNews(news);
  }, [initialTeams, initialPlayers, donations, news]);
  
  useEffect(() => {
      if (activeTab === 'users' || activeTab === 'donations') {
          // Load users if on users or donations tab (to get profile pics)
          if (userList.length === 0) loadUsers();
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

  const handleLocalRefresh = async () => {
      setIsReloading(true);
      try {
          await onRefresh();
          notify("รีเฟรชข้อมูล", "โหลดข้อมูลล่าสุดเรียบร้อย", "info");
      } catch(e) {
          console.error(e);
          notify("ผิดพลาด", "รีเฟรชข้อมูลไม่สำเร็จ", "error");
      } finally {
          setIsReloading(false);
      }
  };

  // Helper for reload sequence
  const executeWithReload = async (action: () => Promise<void>, successMsg: string) => {
      setIsReloading(true);
      try {
          await action();
          await onRefresh(); // Sync from backend
          notify("สำเร็จ", successMsg, "success");
      } catch (error: any) {
          console.error(error);
          notify("ผิดพลาด", error.message || "เกิดข้อผิดพลาดในการบันทึก", "error");
      } finally {
          setIsReloading(false);
      }
  };

  // User Management Handlers
  const handleOpenUserModal = (user: UserProfile | null) => {
      setEditingUser(user);
      if (user) {
          setUserForm({ username: user.username || '', password: '', displayName: user.displayName || '', phone: user.phoneNumber || '', role: user.role || 'user' });
      } else {
          setUserForm({ username: '', password: '', displayName: '', phone: '', role: 'user' });
      }
      setIsUserModalOpen(true);
  };

  const handleSaveUser = async () => {
      if (!userForm.username || !userForm.displayName) {
          notify("ข้อมูลไม่ครบ", "กรุณากรอก Username และ Display Name", "warning");
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
      }, editingUser ? "แก้ไขข้อมูลผู้ใช้เรียบร้อย" : "สร้างผู้ใช้ใหม่เรียบร้อย");
  };

  const handleDeleteUser = async (userId: string) => {
      if (!confirm("ยืนยันการลบผู้ใช้งานนี้?")) return;
      executeWithReload(async () => {
          const success = await deleteUser(userId);
          if (!success) throw new Error("Failed to delete");
          await loadUsers();
      }, "ลบผู้ใช้เรียบร้อย");
  };

  const handleVerifyDonation = async (donationId: string, status: 'Verified' | 'Rejected') => {
      executeWithReload(async () => {
          await verifyDonation(donationId, status);
      }, `อัปเดตสถานะเป็น ${status} เรียบร้อย`);
  };

  const handleUpdateDonationAnonymous = async (isAnon: boolean) => {
      if (!selectedDonation) return;
      // Optimistic update for UI responsiveness in modal
      setSelectedDonation({...selectedDonation, isAnonymous: isAnon});
      
      executeWithReload(async () => {
          await updateDonationDetails(selectedDonation.id, { isAnonymous: isAnon });
      }, "อัปเดตสถานะการแสดงชื่อเรียบร้อย");
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
      setIsVerifyingDonation(true); // Loading inside modal
      try {
          const base64 = await fileToBase64(adminTaxFile);
          await updateDonationDetails(selectedDonation.id, { taxFile: base64 });
          setAdminTaxFile(null);
          // Reload everything
          await onRefresh();
          notify("สำเร็จ", "อัปโหลดไฟล์เรียบร้อย", "success");
      } catch (error) {
          notify("ผิดพลาด", "เกิดข้อผิดพลาดในการอัปโหลด", "error");
      } finally {
          setIsVerifyingDonation(false);
      }
  };

  // ... (Certificate Generation Code) ...
  const handlePrintCertificate = async (donation: Donation) => {
      if (!certificateCanvasRef.current) return;
      const canvas = certificateCanvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const width = 800;
      const height = 1131; 
      canvas.width = width;
      canvas.height = height;
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);
      ctx.lineWidth = 1;
      ctx.strokeStyle = '#e2e8f0'; 
      ctx.strokeRect(40, 40, width - 80, height - 80);
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#d4af37'; 
      ctx.strokeRect(50, 50, width - 100, height - 100);
      ctx.fillStyle = '#1e293b'; 
      ctx.textAlign = 'center';
      if (settings.competitionLogo) {
          try {
              const logoImg = new window.Image();
              logoImg.crossOrigin = "Anonymous";
              logoImg.src = settings.competitionLogo;
              await new Promise((resolve) => { logoImg.onload = resolve; logoImg.onerror = resolve; });
              const logoSize = 100;
              ctx.drawImage(logoImg, width / 2 - logoSize / 2, 100, logoSize, logoSize);
          } catch(e) {}
      } else {
          ctx.fillStyle = '#d4af37';
          ctx.font = '50px Kanit';
          ctx.fillText('★', width / 2, 150);
      }
      ctx.fillStyle = '#1e3a8a'; ctx.font = 'bold 50px "Kanit", sans-serif'; ctx.fillText('ใบประกาศเกียรติคุณ', width / 2, 260);
      ctx.fillStyle = '#64748b'; ctx.font = '300 24px "Kanit", sans-serif'; ctx.fillText('ขอมอบให้ไว้เพื่อแสดงว่า', width / 2, 320);
      ctx.fillStyle = '#1e293b'; ctx.font = 'bold 70px "Sarabun", sans-serif'; ctx.fillText(donation.donorName, width / 2, 450);
      ctx.fillStyle = '#334155'; ctx.font = '24px "Kanit", sans-serif'; ctx.fillText(`ได้ร่วมบริจาคเงินสนับสนุน`, width / 2, 550);
      ctx.font = 'bold 30px "Kanit", sans-serif'; ctx.fillStyle = '#d4af37'; ctx.fillText(`"${settings.competitionName}"`, width / 2, 600);
      ctx.fillStyle = '#334155'; ctx.font = '24px "Kanit", sans-serif'; ctx.fillText(`จำนวนเงิน ${donation.amount.toLocaleString()} บาท`, width / 2, 680);
      ctx.fillStyle = '#94a3b8'; ctx.font = 'italic 20px "Kanit", sans-serif';
      const dateStr = new Date(donation.timestamp).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });
      ctx.fillText(`ให้ไว้ ณ วันที่ ${dateStr}`, width / 2, 850);
      ctx.beginPath(); ctx.moveTo(width / 2 - 120, 950); ctx.lineTo(width / 2 + 120, 950); ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 1; ctx.stroke();
      ctx.font = '20px "Kanit", sans-serif'; ctx.fillStyle = '#64748b'; ctx.fillText('ผู้อำนวยการ / ผู้จัดโครงการ', width / 2, 990);
      if (donation.taxFileUrl) {
          try {
              const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(donation.taxFileUrl)}`;
              const qrImg = new window.Image();
              qrImg.crossOrigin = "Anonymous";
              qrImg.src = qrUrl;
              await new Promise((resolve) => { qrImg.onload = resolve; qrImg.onerror = resolve; });
              ctx.drawImage(qrImg, width - 160, height - 160, 100, 100);
              ctx.font = '12px "Kanit", sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#94a3b8'; ctx.fillText('Scan E-Donation', width - 110, height - 45);
          } catch (e) {}
      }
      const link = document.createElement('a');
      link.download = `Certificate_${donation.donorName.replace(/\s/g,'_')}.jpg`;
      link.href = canvas.toDataURL('image/jpeg', 0.95);
      link.click();
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

  const notify = (title: string, msg: string, type: 'success' | 'error' | 'info' | 'warning') => { if (showNotification) showNotification(title, msg, type); else alert(`${title}: ${msg}`); };
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
      }, status === 'Approved' ? "อนุมัติทีมเรียบร้อย" : "บันทึกการไม่อนุมัติเรียบร้อย");
  };

  const confirmReject = async () => {
      if (!rejectModal.teamId) return;
      if (!rejectReasonInput.trim()) { notify("แจ้งเตือน", "กรุณาระบุเหตุผล", "warning"); return; }
      const currentTeam = editForm?.team || localTeams.find(t => t.id === rejectModal.teamId);
      if (!currentTeam) return;
      setRejectModal({ isOpen: false, teamId: null });
      
      executeWithReload(async () => {
          await updateTeamStatus(currentTeam.id, 'Rejected', currentTeam.group, rejectReasonInput);
      }, "บันทึกการไม่อนุมัติเรียบร้อย");
  };

  // ... [Draw Logic methods] ...
  const prepareLiveDraw = () => {
      const approvedTeams = localTeams.filter(t => t.status === 'Approved');
      if (approvedTeams.length === 0) { notify("แจ้งเตือน", "ไม่มีทีมที่ Approved เพื่อจับฉลาก", "warning"); return; }
      const groups: Record<string, Team[]> = {};
      const groupNames = Array(drawGroupCount).fill(null).map((_, i) => String.fromCharCode(65 + i));
      groupNames.forEach(g => groups[g] = []);
      setPoolTeams([...approvedTeams]); setLiveGroups(groups); setDrawnCount(0); setIsLiveDrawActive(true); setLiveDrawStep('idle'); setIsDrawModalOpen(false);
  };
  const fireLocalConfetti = (opts: any) => { if (confettiCanvasRef.current) { const myConfetti = confetti.create(confettiCanvasRef.current, { resize: true, useWorker: true }); myConfetti(opts); } };
  const getNextTargetGroup = () => { const groupNames = Object.keys(liveGroups).sort(); let minCount = Infinity; let target = groupNames[0]; for (const g of groupNames) { if (liveGroups[g].length < minCount) { minCount = liveGroups[g].length; target = g; } } if (minCount >= teamsPerGroup) return null; return target; };
  const requestRemoveTeam = (team: Team, group: string) => { if (liveDrawStep === 'spinning') return; setRemoveConfirmModal({ isOpen: true, team, group }); };
  const confirmRemoveTeam = () => { const { team, group } = removeConfirmModal; if (!team || !group) return; setLiveGroups(prev => ({ ...prev, [group]: prev[group].filter(t => t.id !== team.id) })); setPoolTeams(prev => [team, ...prev]); setDrawnCount(prev => prev - 1); if (liveDrawStep === 'finished') { setLiveDrawStep('idle'); setCurrentSpinName("..."); setCurrentSpinGroup(""); } setRemoveConfirmModal({ isOpen: false, team: null, group: null }); };
  const resetDraw = () => { setResetConfirmModal(true); };
  const confirmResetDraw = () => { const allTeams: Team[] = []; Object.values(liveGroups).forEach(groupTeams => { allTeams.push(...groupTeams); }); setPoolTeams(prev => { const existingIds = new Set(prev.map(t => t.id)); const uniqueReturning = allTeams.filter(t => !existingIds.has(t.id)); return [...prev, ...uniqueReturning]; }); const groups: Record<string, Team[]> = {}; Object.keys(liveGroups).forEach(g => groups[g] = []); setLiveGroups(groups); setDrawnCount(0); setLiveDrawStep('idle'); setCurrentSpinName("..."); setCurrentSpinGroup(""); setResetConfirmModal(false); notify("Reset", "รีเซ็ตข้อมูลเรียบร้อย", "info"); };
  const startLiveDrawSequence = async (isFastMode: boolean = false) => { const targetGroup = getNextTargetGroup(); if (!targetGroup) { notify("เต็มแล้ว", "ทุกกลุ่มมีจำนวนทีมครบตามที่กำหนด", "warning"); setLiveDrawStep('finished'); return false; } if (poolTeams.length === 0) { notify("หมดทีม", "ไม่มีทีมในโถแล้ว", "warning"); setLiveDrawStep('finished'); return false; } setLiveDrawStep('spinning'); setCurrentSpinGroup(targetGroup); let currentPool = [...poolTeams]; for (let i = currentPool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const temp = currentPool[i]; currentPool[i] = currentPool[j]; currentPool[j] = temp; } const spinDuration = isFastMode ? 300 : 1000; const interval = 50; const steps = spinDuration / interval; for (let s = 0; s < steps; s++) { const randomTeam = currentPool[Math.floor(Math.random() * currentPool.length)]; setCurrentSpinName(randomTeam.name); await new Promise(r => setTimeout(r, interval)); } const pickedTeam = currentPool.shift(); if (!pickedTeam) { setLiveDrawStep('finished'); return false; } setCurrentSpinName(pickedTeam.name); if (!isFastMode) { setLatestReveal(pickedTeam); fireLocalConfetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } }); await new Promise(r => setTimeout(r, 2000)); setLatestReveal(null); } setLiveGroups(prev => ({ ...prev, [targetGroup]: [...prev[targetGroup], pickedTeam] })); setDrawnCount(prev => prev + 1); setPoolTeams([...currentPool]); const nextTarget = getNextTargetGroup(); if (currentPool.length === 0 || !nextTarget) { if (!isFastMode) { setLiveDrawStep('finished'); setCurrentSpinName("เสร็จสิ้น!"); setCurrentSpinGroup("-"); fireLocalConfetti({ particleCount: 200, spread: 100, origin: { y: 0.5 } }); } } else { setLiveDrawStep('idle'); } return true; };
  const drawRoundBatch = async () => { if (isDrawing || liveDrawStep === 'spinning') return; setIsDrawing(true); let localPool = [...poolTeams]; const groupNames = Object.keys(liveGroups).sort(); for (const groupName of groupNames) { if (localPool.length === 0) break; if (liveGroups[groupName].length >= teamsPerGroup) continue; setLiveDrawStep('spinning'); setCurrentSpinGroup(groupName); const steps = 6; for (let s = 0; s < steps; s++) { const randomIdx = Math.floor(Math.random() * localPool.length); setCurrentSpinName(localPool[randomIdx].name); await new Promise(r => setTimeout(r, 50)); } const winnerIdx = Math.floor(Math.random() * localPool.length); const winner = localPool[winnerIdx]; localPool.splice(winnerIdx, 1); setCurrentSpinName(winner.name); setLiveGroups(prev => ({ ...prev, [groupName]: [...prev[groupName], winner] })); setPoolTeams(prev => prev.filter(t => t.id !== winner.id)); setDrawnCount(prev => prev + 1); await new Promise(r => setTimeout(r, 300)); } setLiveDrawStep('idle'); setIsDrawing(false); setCurrentSpinGroup(""); if (localPool.length === 0) { setLiveDrawStep('finished'); setCurrentSpinName("เสร็จสิ้น!"); setCurrentSpinGroup("-"); fireLocalConfetti({ particleCount: 300, spread: 150, origin: { y: 0.5 }, colors: ['#f43f5e', '#8b5cf6', '#10b981'] }); } };
  
  const handleSaveDrawResults = async () => { 
      setIsDrawing(true); 
      const updates: { teamId: string, group: string }[] = []; 
      
      if (liveGroups) {
          Object.entries(liveGroups).forEach(([groupName, teams]) => { 
              (teams as Team[]).forEach(t => { updates.push({ teamId: t.id, group: groupName }); }); 
          }); 
      }
      
      executeWithReload(async () => {
          const promises = updates.map(u => updateTeamStatus(u.teamId, 'Approved', u.group, '')); 
          await Promise.all(promises); 
          setIsLiveDrawActive(false);
      }, "อัปเดตกลุ่มการแข่งขันเรียบร้อยแล้ว");
      
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
      }, "บันทึกการตั้งค่าเรียบร้อย");
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
  const handlePlayerChange = (index: number, field: keyof Player, value: string) => { if (editForm) { const updatedPlayers = [...editForm.players]; updatedPlayers[index] = { ...updatedPlayers[index], [field]: value }; setEditForm({ ...editForm, players: updatedPlayers }); } };
  const handleDateInput = (index: number, value: string) => {
      let cleaned = value.replace(/[^0-9]/g, ''); if (cleaned.length > 8) cleaned = cleaned.substring(0, 8);
      let formatted = cleaned; if (cleaned.length > 2) formatted = cleaned.substring(0, 2) + '/' + cleaned.substring(2); if (cleaned.length > 4) formatted = formatted.substring(0, 5) + '/' + cleaned.substring(4);
      handlePlayerChange(index, 'birthDate', formatted);
  };
  const handlePlayerPhotoChange = async (index: number, file: File) => {
      if (editForm && file) { if (!validateFile(file, 'image')) return; try { const base64 = await fileToBase64(file); const updatedPlayers = [...editForm.players]; updatedPlayers[index] = { ...updatedPlayers[index], photoUrl: base64 }; setEditForm({ ...editForm, players: updatedPlayers }); } catch (e) { console.error("Error converting player photo", e); } }
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
  const handleAddPlayer = () => { if (!editForm) return; const newPlayer: Player = { id: `TEMP_${Date.now()}_${Math.floor(Math.random()*1000)}`, teamId: editForm.team.id, name: '', number: '', position: 'Player', photoUrl: '', birthDate: '' }; setEditForm({ ...editForm, players: [...editForm.players, newPlayer] }); };
  const removePlayer = (index: number) => { if (!editForm) return; const updatedPlayers = editForm.players.filter((_, i) => i !== index); setEditForm({ ...editForm, players: updatedPlayers }); };

  const handleSaveTeamChanges = async (updatedTeam: Team, updatedPlayers: Player[]) => {
      // Close modal immediately to show the skeleton on main page
      setIsEditingTeam(false); 
      setEditForm(null); 
      setSelectedTeam(null); // Deselect team

      executeWithReload(async () => {
          await updateTeamData(updatedTeam, updatedPlayers);
          if (updatedTeam.status !== selectedTeam?.status) {
              await updateTeamStatus(updatedTeam.id, updatedTeam.status as any, updatedTeam.group, '');
          }
      }, "อัปเดตข้อมูลและรีโหลดเรียบร้อย");
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
          // Async file processing first
          const imageBase64 = newsForm.imageFile ? await fileToBase64(newsForm.imageFile) : undefined; 
          const docBase64 = newsForm.docFile ? await fileToBase64(newsForm.docFile) : undefined; 
          
          const newsData: Partial<NewsItem> = { 
              id: newsForm.id || Date.now().toString(), 
              title: newsForm.title, 
              content: newsForm.content, 
              timestamp: Date.now(), 
              tournamentId: newsForm.tournamentId,
              imageUrl: imageBase64 || newsForm.imagePreview || undefined,
              documentUrl: docBase64
          }; 
          
          const action = isEditing ? 'edit' : 'add'; 
          await manageNews(action, newsData); 
          setNewsForm({ id: null, title: '', content: '', imageFile: null, imagePreview: null, docFile: null, tournamentId: 'global' }); 
      }, isEditing ? "แก้ไขข่าวเรียบร้อย" : "เพิ่มข่าวเรียบร้อย");
  };
  
  const triggerDeleteNews = (id: string) => { 
      setNewsToDelete(id);
  };
  
  const confirmDeleteNews = async () => {
      if (!newsToDelete) return;
      setIsDeletingNews(true);
      executeWithReload(async () => {
          await manageNews('delete', { id: newsToDelete }); 
          setNewsToDelete(null); 
      }, "ลบข่าวเรียบร้อย");
      setIsDeletingNews(false);
  };

  const handleSort = (key: string) => { let direction: 'asc' | 'desc' = 'asc'; if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') { direction = 'desc'; } setSortConfig({ key, direction }); };
  const sortedTeams = [...localTeams].sort((a: any, b: any) => { if (!sortConfig) return 0; if (a[sortConfig.key] < b[sortConfig.key]) return sortConfig.direction === 'asc' ? -1 : 1; if (a[sortConfig.key] > b[sortConfig.key]) return sortConfig.direction === 'asc' ? 1 : -1; return 0; });
  
  const filteredTeams = sortedTeams.filter(t => {
      const matchSearch = t.name.toLowerCase().includes(searchTerm.toLowerCase()) || t.province?.toLowerCase().includes(searchTerm.toLowerCase()) || t.district?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchStatus = filterStatus === 'All' || t.status === filterStatus;
      return matchSearch && matchStatus;
  });

  const downloadCSV = () => { try { const headers = "ID,ชื่อทีม,ตัวย่อ,สถานะ,กลุ่ม,อำเภอ,จังหวัด,ผู้อำนวยการ,ผู้จัดการ,เบอร์โทร,ผู้ฝึกสอน,เบอร์โทรโค้ช"; const rows = filteredTeams.map(t => `"${t.id}","${t.name}","${t.shortName}","${t.status}","${t.group || ''}","${t.district}","${t.province}","${t.directorName || ''}","${t.managerName}","'${t.managerPhone || ''}","${t.coachName}","'${t.coachPhone || ''}"` ); const csvContent = [headers, ...rows].join("\n"); const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.setAttribute("href", url); link.setAttribute("download", "teams_data.csv"); document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url); } catch (e) { console.error("CSV Download Error:", e); notify("ผิดพลาด", "ดาวน์โหลด CSV ไม่สำเร็จ", "error"); } };
  
  const handleNewsImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
          const file = e.target.files[0];
          setNewsForm({ ...newsForm, imageFile: file, imagePreview: URL.createObjectURL(file) });
      }
  };

  const handleNewsDocChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
          setNewsForm({ ...newsForm, docFile: e.target.files[0] });
      }
  };

  const formData = editForm?.team;

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-8 pb-24">
      {/* Modals and Overlays */}
      {previewImage && (
          <div className="fixed inset-0 z-[1400] bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setPreviewImage(null)}>
              <div className="relative max-w-4xl max-h-[90vh]">
                  <img src={previewImage} className="max-w-full max-h-[90vh] rounded shadow-lg" />
                  <button className="absolute -top-4 -right-4 bg-white rounded-full p-2 text-slate-800" onClick={() => setPreviewImage(null)}><X className="w-6 h-6"/></button>
              </div>
          </div>
      )}
      
      {/* CONFIRM REMOVE TEAM FROM LIVE DRAW */}
      {removeConfirmModal.isOpen && (
          <div className="fixed inset-0 z-[2200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
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
          <div className="fixed inset-0 z-[2200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
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
          <div className="fixed inset-0 z-[1500] bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm">
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
          <div className="fixed inset-0 z-[1300] bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm">
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
        <div className="fixed inset-0 z-[1300] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto" onClick={() => { setEditForm(null); setSelectedTeam(null); }}>
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
                                        <option value="Pending">Pending (รออนุมัติ)</option>
                                        <option value="Approved">Approved (อนุมัติ)</option>
                                        <option value="Rejected">Rejected (ปฏิเสธ)</option>
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
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1">สีหลัก</label>
                                        <div className="flex items-center gap-2">
                                            <input type="color" value={editPrimaryColor} onChange={e => handleColorChange('primary', e.target.value)} className="h-10 w-full p-0 border-0 rounded cursor-pointer" />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1">สีรอง</label>
                                        <div className="flex items-center gap-2">
                                            <input type="color" value={editSecondaryColor} onChange={e => handleColorChange('secondary', e.target.value)} className="h-10 w-full p-0 border-0 rounded cursor-pointer" />
                                        </div>
                                    </div>
                                </div>
                                <div className="mt-4 flex items-center gap-4">
                                    {editForm.logoPreview ? <img src={editForm.logoPreview} className="w-16 h-16 object-contain border rounded-lg p-1"/> : <div className="w-16 h-16 bg-slate-100 rounded-lg flex items-center justify-center text-slate-400 text-xs">No Logo</div>}
                                    <label className="cursor-pointer bg-slate-50 border border-slate-300 px-4 py-2 rounded-lg text-sm hover:bg-slate-100 transition">
                                        เปลี่ยนโลโก้
                                        <input type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && handleFileChange('logo', e.target.files[0])} />
                                    </label>
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
                                            <div className="col-span-6"><input type="text" placeholder="ตำแหน่ง" value={p.position || 'Player'} onChange={e => handlePlayerChange(idx, 'position', e.target.value)} className="w-full p-2 border rounded-lg text-xs" /></div>
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
                </div>

                {/* Footer */}
                <div className="p-4 border-t bg-white flex gap-3 shrink-0">
                    <button onClick={() => { setEditForm(null); setSelectedTeam(null); }} className="flex-1 py-3 border border-slate-200 rounded-xl font-bold text-slate-500 hover:bg-slate-50 transition">ยกเลิก</button>
                    {/* Status Button for Admin only (in modal logic, although here it's implicit) */}
                    <button onClick={() => handleSaveTeamChanges(formData, editForm.players)} disabled={isSavingTeam} className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition flex items-center justify-center gap-2 shadow-lg shadow-indigo-200 disabled:opacity-70">
                        {isSavingTeam ? <Loader2 className="w-5 h-5 animate-spin"/> : <><Save className="w-5 h-5"/> บันทึกข้อมูล</>}
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* USER MANAGEMENT MODAL */}
      {isUserModalOpen && (
          <div className="fixed inset-0 z-[1400] bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm">
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
                              <option value="user">User</option>
                              <option value="staff">Staff</option>
                              <option value="admin">Admin</option>
                          </select>
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

      {/* NEWS MANAGEMENT MODAL */}
      {isNewsModalOpen && (
          <div className="fixed inset-0 z-[1400] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6 animate-in zoom-in duration-200 overflow-y-auto max-h-[90vh]">
                  <div className="flex justify-between items-center mb-4 border-b pb-2">
                      <h3 className="font-bold text-lg text-indigo-900">{newsForm.id ? 'แก้ไขข่าว' : 'เพิ่มข่าวใหม่'}</h3>
                      <button onClick={() => setIsNewsModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5"/></button>
                  </div>
                  <div className="space-y-4">
                      <div>
                          <label className="block text-sm font-bold text-slate-700 mb-1">หัวข้อข่าว</label>
                          <input type="text" value={newsForm.title} onChange={e => setNewsForm({...newsForm, title: e.target.value})} className="w-full p-2 border rounded-lg" />
                      </div>
                      
                      <div>
                          <label className="block text-sm font-bold text-slate-700 mb-1">เป้าหมายการแสดงผล (Target Audience)</label>
                          <select 
                              value={newsForm.tournamentId} 
                              onChange={e => setNewsForm({...newsForm, tournamentId: e.target.value})}
                              className="w-full p-2 border rounded-lg bg-white"
                          >
                              <option value="global">Global (แสดงทุกรายการ)</option>
                              {tournaments.length > 0 && <optgroup label="Specific Tournament">
                                  {tournaments.map(t => (
                                      <option key={t.id} value={t.id}>{t.name}</option>
                                  ))}
                              </optgroup>}
                          </select>
                          <p className="text-xs text-slate-400 mt-1">เลือก 'Global' เพื่อให้ข่าวนี้แสดงในทุกหน้า หรือเลือกรายการเฉพาะเจาะจง</p>
                      </div>

                      <div>
                          <label className="block text-sm font-bold text-slate-700 mb-1">เนื้อหา</label>
                          <textarea value={newsForm.content} onChange={e => setNewsForm({...newsForm, content: e.target.value})} className="w-full p-2 border rounded-lg h-32" />
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                              <label className="block text-sm font-bold text-slate-700 mb-1">รูปภาพประกอบ</label>
                              <div className="flex items-center gap-4">
                                  {newsForm.imagePreview ? (
                                      <div className="relative">
                                          <img src={newsForm.imagePreview} className="w-20 h-20 object-cover rounded-lg border"/>
                                          <button onClick={() => setNewsForm({...newsForm, imagePreview: null, imageFile: null})} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-0.5"><X className="w-3 h-3"/></button>
                                      </div>
                                  ) : (
                                      <div className="w-20 h-20 bg-slate-100 rounded-lg flex items-center justify-center text-slate-400 border border-dashed border-slate-300">No Image</div>
                                  )}
                                  <label className="cursor-pointer bg-slate-50 border border-slate-300 px-3 py-1.5 rounded-lg text-xs hover:bg-slate-100 transition">
                                      เลือกรูปภาพ
                                      <input type="file" accept="image/*" onChange={handleNewsImageChange} className="hidden"/>
                                  </label>
                              </div>
                          </div>
                          <div>
                              <label className="block text-sm font-bold text-slate-700 mb-1">เอกสารแนบ (PDF)</label>
                              <div className="flex items-center gap-4">
                                  {newsForm.docFile ? (
                                      <div className="text-xs bg-indigo-50 px-2 py-1 rounded text-indigo-700 font-bold flex items-center gap-1">
                                          <FileText className="w-3 h-3"/> {newsForm.docFile.name}
                                      </div>
                                  ) : <div className="text-xs text-slate-400 italic">ไม่มีไฟล์แนบ</div>}
                                  <label className="cursor-pointer bg-slate-50 border border-slate-300 px-3 py-1.5 rounded-lg text-xs hover:bg-slate-100 transition">
                                      เลือกไฟล์ PDF
                                      <input type="file" accept=".pdf,.doc,.docx" onChange={handleNewsDocChange} className="hidden"/>
                                  </label>
                              </div>
                          </div>
                      </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-6 border-t mt-4">
                      <button onClick={() => setIsNewsModalOpen(false)} className="px-4 py-2 border rounded-lg hover:bg-slate-50 text-slate-600 font-bold text-sm">ยกเลิก</button>
                      <button onClick={handleSaveNews} disabled={isSavingNews} className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-bold text-sm flex items-center gap-2 shadow-lg shadow-indigo-200">
                          {isSavingNews ? <Loader2 className="w-4 h-4 animate-spin"/> : <><Save className="w-4 h-4"/> บันทึก</>}
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* REJECT MODAL */}
      {rejectModal.isOpen && (
          <div className="fixed inset-0 z-[1300] bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm">
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

      {/* DONATION MODAL */}
      {selectedDonation && (
          <div className="fixed inset-0 z-[1200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setSelectedDonation(null)}>
              <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
                  <div className="p-4 bg-slate-900 text-white flex justify-between items-center">
                      <h3 className="font-bold text-lg">ตรวจสอบยอดบริจาค</h3>
                      <button onClick={() => setSelectedDonation(null)}><X className="w-5 h-5"/></button>
                  </div>
                  <div className="p-6 overflow-y-auto max-h-[70vh]">
                      <div className="mb-4 text-center">
                          <div className="flex justify-center mb-2">
                              {(() => {
                                  const donorProfile = userList.find(u => u.lineUserId === selectedDonation.lineUserId);
                                  return donorProfile?.pictureUrl ? (
                                      <img src={donorProfile.pictureUrl} className="w-20 h-20 rounded-full border-4 border-slate-100 object-cover shadow-sm" />
                                  ) : (
                                      <div className="w-20 h-20 rounded-full bg-slate-200 flex items-center justify-center text-slate-400">
                                          <User className="w-8 h-8" />
                                      </div>
                                  );
                              })()}
                          </div>
                          <div className="text-xl font-bold text-slate-800">{selectedDonation.donorName}</div>
                          <div className="text-2xl font-bold text-indigo-600 my-2">{selectedDonation.amount.toLocaleString()} บาท</div>
                          <div className="text-xs text-slate-400">{selectedDonation.timestamp}</div>
                      </div>
                      
                      <div className="flex items-center justify-center mb-4">
                          <label className="flex items-center gap-2 text-sm text-slate-600 bg-slate-100 px-3 py-1 rounded-full cursor-pointer hover:bg-slate-200 transition">
                              <input 
                                  type="checkbox" 
                                  checked={selectedDonation.isAnonymous} 
                                  onChange={(e) => handleUpdateDonationAnonymous(e.target.checked)}
                                  disabled={isVerifyingDonation}
                                  className="w-4 h-4 rounded border-slate-300 text-indigo-600"
                              />
                              ไม่ประสงค์ออกนาม (Anonymous)
                          </label>
                      </div>

                      <div className="flex gap-2 mb-4">
                          {selectedDonation.slipUrl ? (
                              <button onClick={() => setPreviewImage(selectedDonation.slipUrl)} className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition border border-slate-200">
                                  <CreditCard className="w-3 h-3"/> ดูสลิป
                              </button>
                          ) : (
                              <button disabled className="flex-1 py-2 bg-slate-50 text-slate-400 rounded-lg text-xs font-bold cursor-not-allowed">ไม่มีสลิป</button>
                          )}
                          
                          {selectedDonation.taxFileUrl && (
                              <a href={selectedDonation.taxFileUrl} target="_blank" className="flex-1 py-2 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition border border-blue-200">
                                  <FileText className="w-3 h-3"/> ไฟล์ e-Donation
                              </a>
                          )}
                      </div>
                      
                      {selectedDonation.status === 'Verified' && (
                          <button onClick={() => handlePrintCertificate(selectedDonation)} className="w-full py-2.5 mb-4 bg-gradient-to-r from-amber-200 to-yellow-400 hover:from-amber-300 hover:to-yellow-500 text-yellow-900 rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow-sm transition">
                              <Printer className="w-4 h-4" /> พิมพ์ใบประกาศเกียรติคุณ (Portrait)
                          </button>
                      )}

                      <div className="space-y-2 text-sm text-slate-600 bg-slate-50 p-4 rounded-lg border border-slate-100">
                          <p><b>เบอร์โทร:</b> {selectedDonation.phone}</p>
                          <p><b>e-Donation:</b> {selectedDonation.isEdonation ? 'ต้องการ' : 'ไม่ต้องการ'}</p>
                          {selectedDonation.isEdonation && <p><b>Tax ID:</b> {selectedDonation.taxId}</p>}
                          {selectedDonation.isEdonation && <p><b>ที่อยู่:</b> {selectedDonation.address}</p>}
                      </div>

                      {/* ADMIN UPLOAD TAX FILE */}
                      <div className="mt-4 pt-4 border-t border-slate-200">
                          <label className="block text-xs font-bold text-slate-500 mb-2">อัปโหลดไฟล์ e-Donation / ลดหย่อนภาษี (Admin)</label>
                          <div className="flex gap-2">
                              <label className={`flex-1 cursor-pointer bg-white border text-xs font-bold text-center flex items-center justify-center gap-2 transition p-2 rounded-lg ${adminTaxFile ? 'border-indigo-500 text-indigo-600 bg-indigo-50' : 'border-slate-300 text-slate-500 hover:bg-slate-50'}`}>
                                  <Upload className="w-3 h-3"/> {adminTaxFile ? adminTaxFile.name : 'เลือกไฟล์'}
                                  <input type="file" onChange={handleTaxFileSelect} className="hidden" accept="image/*,.pdf" />
                              </label>
                              {adminTaxFile && (
                                  <button 
                                      onClick={handleSaveTaxFile}
                                      disabled={isVerifyingDonation}
                                      className="px-4 py-2 bg-green-600 text-white rounded-lg font-bold text-xs hover:bg-green-700 transition flex items-center gap-1 shadow-sm"
                                  >
                                      {isVerifyingDonation ? <Loader2 className="w-3 h-3 animate-spin"/> : <Save className="w-3 h-3"/>}
                                      อัปโหลด
                                  </button>
                              )}
                          </div>
                      </div>
                  </div>
                  <div className="p-4 border-t bg-slate-50 flex gap-3">
                      <button 
                        onClick={() => handleVerifyDonation(selectedDonation.id, 'Rejected')} 
                        disabled={isVerifyingDonation}
                        className="flex-1 py-3 border border-red-200 text-red-600 rounded-xl font-bold hover:bg-red-50"
                      >
                          ปฏิเสธ
                      </button>
                      <button 
                        onClick={() => handleVerifyDonation(selectedDonation.id, 'Verified')} 
                        disabled={isVerifyingDonation}
                        className="flex-1 py-3 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 shadow-md flex items-center justify-center gap-2"
                      >
                          {isVerifyingDonation ? <Loader2 className="w-5 h-5 animate-spin"/> : 'ยืนยันยอด'}
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* Main Content Area */}
      <div className="max-w-7xl mx-auto relative">
        {/* RELOADING SKELETON OVERLAY */}
        {isReloading && (
            <div className="absolute inset-0 z-50 bg-white/90 backdrop-blur-sm rounded-xl p-4 flex items-start justify-center h-full min-h-screen">
                <AdminSkeleton />
            </div>
        )}

        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
            <div>
                <h1 className="text-3xl font-bold text-slate-800">ระบบจัดการการแข่งขัน</h1>
                <p className="text-slate-500 flex items-center gap-2">Admin Control Panel {currentTournament && (<span className="bg-indigo-100 text-indigo-700 text-xs px-2 py-0.5 rounded-full font-bold flex items-center gap-1"><Trophy className="w-3 h-3"/> กำลังจัดการ: {currentTournament.name}</span>)}</p>
            </div>
            <div className="flex gap-3 flex-wrap">
                <button onClick={() => setActiveTab('teams')} className={`px-4 py-2 rounded-lg font-medium transition ${activeTab === 'teams' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>จัดการทีม</button>
                <button onClick={() => setActiveTab('news')} className={`px-4 py-2 rounded-lg font-medium transition flex items-center gap-2 ${activeTab === 'news' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-white text-slate-600 hover:bg-slate-50'}`}><Bell className="w-4 h-4" /> ข่าวสาร</button>
                <button onClick={() => setActiveTab('donations')} className={`px-4 py-2 rounded-lg font-medium transition flex items-center gap-2 ${activeTab === 'donations' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-white text-slate-600 hover:bg-slate-50'}`}><DollarSign className="w-4 h-4" /> เงินบริจาค</button>
                <button onClick={() => setActiveTab('users')} className={`px-4 py-2 rounded-lg font-medium transition flex items-center gap-2 ${activeTab === 'users' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-white text-slate-600 hover:bg-slate-50'}`}><UserCog className="w-4 h-4" /> ผู้ใช้งาน</button>
                <button onClick={() => setActiveTab('settings')} className={`px-4 py-2 rounded-lg font-medium transition flex items-center gap-2 ${activeTab === 'settings' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-white text-slate-600 hover:bg-slate-50'}`}><Settings className="w-4 h-4" /> ตั้งค่า</button>
                <button onClick={onLogout} className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition border border-red-100"><LogOut className="w-4 h-4" /></button>
            </div>
        </div>

        {/* --- TEAMS TAB --- */}
        {activeTab === 'teams' && (
            <div className="animate-in fade-in duration-300">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8"><div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200"><div className="flex items-center justify-between"><div><p className="text-slate-500 text-sm">ทีมทั้งหมด</p><p className="text-3xl font-bold text-indigo-600">{localTeams.length}</p></div><div className="p-3 bg-indigo-50 rounded-full"><Users className="w-6 h-6 text-indigo-600" /></div></div></div><div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200"><div className="flex items-center justify-between"><div><p className="text-slate-500 text-sm">รอการอนุมัติ</p><p className="text-3xl font-bold text-orange-500">{localTeams.filter(t => t.status !== 'Approved' && t.status !== 'Rejected').length}</p></div><div className="p-3 bg-orange-50 rounded-full"><ShieldAlert className="w-6 h-6 text-orange-500" /></div></div></div><div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200"><div className="flex items-center justify-between"><div><p className="text-slate-500 text-sm">อนุมัติแล้ว</p><p className="text-3xl font-bold text-green-600">{localTeams.filter(t => t.status === 'Approved').length}</p></div><div className="p-3 bg-green-50 rounded-full"><ShieldCheck className="w-6 h-6 text-green-600" /></div></div></div></div>
                
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    {/* Tool Bar */}
                    <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row justify-between items-center gap-4 sticky top-0 bg-white z-20">
                        <div className="flex items-center gap-3">
                            <h2 className="font-bold text-lg text-slate-800">รายชื่อทีมลงทะเบียน</h2>
                            <button onClick={() => setIsDrawModalOpen(true)} className="flex items-center gap-1 text-xs bg-gradient-to-r from-indigo-500 to-purple-500 text-white px-4 py-2 rounded-lg hover:from-indigo-600 hover:to-purple-600 transition font-bold shadow-md transform hover:scale-105"><Shuffle className="w-4 h-4" /> Live Draw</button>
                        </div>
                        <div className="flex gap-2 w-full md:w-auto items-center">
                            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="px-3 py-2 border rounded-lg text-sm bg-slate-50 focus:bg-white outline-none"><option value="All">ทุกสถานะ</option><option value="Pending">รออนุมัติ</option><option value="Approved">อนุมัติแล้ว</option><option value="Rejected">ปฏิเสธ</option></select>
                            <div className="flex bg-slate-100 rounded-lg p-1"><button onClick={() => setViewMode('grid')} className={`p-1.5 rounded ${viewMode === 'grid' ? 'bg-white shadow text-indigo-600' : 'text-slate-400'}`}><Grid className="w-4 h-4"/></button><button onClick={() => setViewMode('list')} className={`p-1.5 rounded ${viewMode === 'list' ? 'bg-white shadow text-indigo-600' : 'text-slate-400'}`}><List className="w-4 h-4"/></button></div>
                            <div className="relative flex-1 md:w-64"><Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" /><input type="text" placeholder="ค้นหาทีม / จังหวัด..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full pl-9 pr-4 py-2 border rounded-lg text-sm" /></div>
                            <button onClick={downloadCSV} className="flex items-center gap-2 text-sm px-3 py-2 bg-indigo-50 hover:bg-indigo-100 rounded-lg text-indigo-700 font-medium"><Download className="w-4 h-4" /> CSV</button>
                            <button onClick={handleLocalRefresh} className="text-sm px-3 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-600 flex items-center gap-1">
                                {isReloading ? <Loader2 className="w-4 h-4 animate-spin"/> : <RefreshCw className="w-4 h-4"/>} รีเฟรช
                            </button>
                        </div>
                    </div>

                    {/* CONTENT AREA */}
                    <div className="p-4 bg-slate-50 min-h-[400px]">
                        {viewMode === 'list' ? (
                            <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-x-auto">
                                <table className="w-full text-left"><thead className="bg-slate-50 text-slate-500 text-sm"><tr><th className="p-4 font-medium cursor-pointer" onClick={() => handleSort('name')}>ชื่อทีม/โรงเรียน</th><th className="p-4 font-medium cursor-pointer" onClick={() => handleSort('group')}>กลุ่ม</th><th className="p-4 font-medium">ผู้ติดต่อ</th><th className="p-4 font-medium text-center cursor-pointer" onClick={() => handleSort('status')}>สถานะ</th><th className="p-4 font-medium text-right">จัดการ</th></tr></thead><tbody className="divide-y divide-slate-100">{filteredTeams.map(team => (<tr key={team.id} className="hover:bg-slate-50"><td className="p-4"><div className="flex items-center gap-3">{team.logoUrl ? <img src={team.logoUrl} className="w-8 h-8 rounded object-cover" /> : <div className="w-8 h-8 rounded bg-slate-200 flex items-center justify-center font-bold text-slate-500 text-xs">{team.shortName}</div>}<div><p className="font-bold text-slate-800 text-sm">{team.name}</p><p className="text-[10px] text-slate-500">{team.province}</p></div></div></td><td className="p-4">{team.group || '-'}</td><td className="p-4 text-xs">{team.managerPhone}</td><td className="p-4 text-center"><span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${team.status === 'Approved' ? 'bg-green-100 text-green-700' : team.status === 'Rejected' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>{team.status}</span></td><td className="p-4 text-right flex justify-end gap-2">{team.status === 'Pending' && (<><button onClick={() => handleStatusUpdate(team.id, 'Approved')} className="p-2 text-green-600 hover:bg-green-50 rounded bg-green-50/50 border border-green-200" title="อนุมัติ"><Check className="w-4 h-4"/></button><button onClick={() => handleStatusUpdate(team.id, 'Rejected')} className="p-2 text-red-600 hover:bg-red-50 rounded bg-red-50/50 border border-red-200" title="ปฏิเสธ"><X className="w-4 h-4"/></button></>)}<button onClick={() => setSelectedTeam(team)} className="text-indigo-600 hover:bg-indigo-50 p-2 rounded border border-indigo-200"><Edit3 className="w-4 h-4"/></button></td></tr>))}</tbody></table>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                {filteredTeams.map(team => (
                                    <div key={team.id} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col hover:shadow-md transition group">
                                        <div className="p-4 flex items-start justify-between">
                                            <div className="flex items-center gap-3">{team.logoUrl ? <img src={team.logoUrl} className="w-12 h-12 rounded-lg object-contain bg-slate-50 border border-slate-100 p-0.5" /> : <div className="w-12 h-12 rounded-lg bg-slate-100 flex items-center justify-center font-bold text-slate-400">{team.shortName}</div>}<div><h3 className="font-bold text-slate-800 line-clamp-1">{team.name}</h3><p className="text-xs text-slate-500 flex items-center gap-1"><MapPin className="w-3 h-3"/> {team.province}</p></div></div>
                                            <div className="flex flex-col items-end gap-1"><span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${team.status === 'Approved' ? 'bg-green-100 text-green-700' : team.status === 'Rejected' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>{team.status}</span>{team.group && <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded text-[10px] font-bold">Gr. {team.group}</span>}</div>
                                        </div>
                                        
                                        <div className="p-4 pt-0 border-t border-slate-100 mt-auto">
                                            <div className="grid grid-cols-2 gap-2 pt-3 mb-2">
                                                {team.slipUrl ? 
                                                    <button onClick={() => setPreviewImage(team.slipUrl!)} className="py-1.5 bg-white border border-slate-200 rounded text-xs font-bold text-slate-600 hover:text-indigo-600 hover:border-indigo-300 flex items-center justify-center gap-1 transition">
                                                        <CreditCard className="w-3 h-3"/> ดูสลิป
                                                    </button> : 
                                                    <div className="py-1.5 text-center text-xs text-slate-400 italic bg-slate-50 rounded border border-slate-100">ไม่มีสลิป</div>
                                                }
                                                {team.docUrl ? 
                                                    <a href={team.docUrl} target="_blank" className="py-1.5 bg-white border border-slate-200 rounded text-xs font-bold text-slate-600 hover:text-indigo-600 hover:border-indigo-300 flex items-center justify-center gap-1 transition">
                                                        <FileText className="w-3 h-3"/> ดูเอกสาร
                                                    </a> : 
                                                    <div className="py-1.5 text-center text-xs text-slate-400 italic bg-slate-50 rounded border border-slate-100">ไม่มีเอกสาร</div>
                                                }
                                            </div>

                                            <div className="flex gap-2 mb-2">
                                                <button onClick={() => handleStatusUpdate(team.id, 'Approved')} className="flex-1 py-1.5 bg-green-50 text-green-600 border border-green-200 hover:bg-green-100 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1 shadow-sm">
                                                    <Check className="w-3 h-3"/> อนุมัติ
                                                </button>
                                                <button onClick={() => handleStatusUpdate(team.id, 'Rejected')} className="flex-1 py-1.5 bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1 shadow-sm">
                                                    <X className="w-3 h-3"/> ปฏิเสธ
                                                </button>
                                            </div>
                                            
                                            <button onClick={() => setSelectedTeam(team)} className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg transition text-xs font-bold flex items-center justify-center gap-1">
                                                <Edit3 className="w-3 h-3"/> จัดการทีม / แก้ไข
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                        {filteredTeams.length === 0 && <div className="text-center py-12 text-slate-400">ไม่พบข้อมูลทีม</div>}
                    </div>
                </div>
            </div>
        )}

        {/* --- SETTINGS TAB --- */}
        {activeTab === 'settings' && (
            <div className="animate-in fade-in duration-300 max-w-2xl mx-auto">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-6">
                    <h3 className="font-bold text-lg border-b pb-2">ตั้งค่าทั่วไป</h3>
                    <div><label className="block text-sm font-bold text-slate-700 mb-1">ชื่อรายการแข่งขัน</label><input type="text" value={configForm.competitionName} onChange={e => setConfigForm({...configForm, competitionName: e.target.value})} className="w-full p-2 border rounded-lg" /></div>
                    <div><label className="block text-sm font-bold text-slate-700 mb-2">โลโก้การแข่งขัน</label><div className="flex items-center gap-4">{settingsLogoPreview && <img src={settingsLogoPreview} className="w-16 h-16 object-contain border rounded-lg p-1"/>}<input type="file" accept="image/*" onChange={e => e.target.files?.[0] && handleSettingsLogoChange(e.target.files[0])} className="text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"/></div></div>
                    <h3 className="font-bold text-lg border-b pb-2 pt-4">การระดมทุน (Objective)</h3>
                    <div><label className="block text-sm font-bold text-slate-700 mb-1">เป้าหมายระดมทุน (บาท)</label><input type="number" value={configForm.fundraisingGoal} onChange={e => setConfigForm({...configForm, fundraisingGoal: Number(e.target.value)})} className="w-full p-2 border rounded-lg" /></div>
                    <div><label className="block text-sm font-bold text-slate-700 mb-1">ชื่อโครงการ</label><input type="text" value={configForm.objectiveTitle} onChange={e => setConfigForm({...configForm, objectiveTitle: e.target.value})} className="w-full p-2 border rounded-lg" /></div>
                    <div><label className="block text-sm font-bold text-slate-700 mb-1">รายละเอียดโครงการ</label><textarea value={configForm.objectiveDescription} onChange={e => setConfigForm({...configForm, objectiveDescription: e.target.value})} className="w-full p-2 border rounded-lg h-24" /></div>
                    <div><label className="block text-sm font-bold text-slate-700 mb-2">รูปภาพโครงการ</label><div className="flex items-center gap-4">{objectiveImagePreview && <img src={objectiveImagePreview} className="w-16 h-16 object-cover border rounded-lg"/>}<input type="file" accept="image/*" onChange={e => e.target.files?.[0] && handleObjectiveImageChange(e.target.files[0])} className="text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"/></div></div>
                    <h3 className="font-bold text-lg border-b pb-2 pt-4">ระบบ</h3>
                    <div><label className="block text-sm font-bold text-slate-700 mb-1">Admin PIN</label><input type="text" value={configForm.adminPin} onChange={e => setConfigForm({...configForm, adminPin: e.target.value})} className="w-full p-2 border rounded-lg" /></div>
                    <div><label className="block text-sm font-bold text-slate-700 mb-1">LIFF ID</label><input type="text" value={configForm.liffId} onChange={e => setConfigForm({...configForm, liffId: e.target.value})} className="w-full p-2 border rounded-lg" /></div>
                    <div className="pt-6 border-t"><button onClick={handleSaveConfig} disabled={isSavingSettings} className="w-full py-3 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 transition flex items-center justify-center gap-2">{isSavingSettings ? <Loader2 className="w-5 h-5 animate-spin"/> : 'บันทึกการตั้งค่า'}</button></div>
                </div>
            </div>
        )}

        {/* --- NEWS TAB --- */}
        {activeTab === 'news' && (
            <div className="animate-in fade-in duration-300 max-w-4xl mx-auto">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="font-bold text-xl text-slate-800">จัดการข่าวสาร</h2>
                    <button onClick={() => { setNewsForm({ id: null, title: '', content: '', imageFile: null, imagePreview: null, docFile: null, tournamentId: currentTournament ? currentTournament.id : 'global' }); setIsNewsModalOpen(true); }} className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-indigo-700 transition text-sm"><Plus className="w-4 h-4"/> เพิ่มข่าว</button>
                </div>

                <div className="space-y-4">
                    {localNews.length === 0 ? <div className="text-center py-12 text-slate-400 bg-white rounded-xl border border-dashed border-slate-200">ไม่มีข่าวสาร</div> : localNews.sort((a,b) => b.timestamp - a.timestamp).map(item => (
                        <div key={item.id} className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col md:flex-row gap-4 hover:shadow-md transition group">
                            <div className="w-full md:w-48 h-32 bg-slate-100 rounded-lg overflow-hidden shrink-0 relative">
                                {item.imageUrl ? <img src={item.imageUrl} className="w-full h-full object-cover group-hover:scale-105 transition duration-500" /> : <div className="w-full h-full flex items-center justify-center text-slate-300"><Image className="w-8 h-8"/></div>}
                                <div className={`absolute top-2 left-2 text-[10px] px-2 py-0.5 rounded-full font-bold ${item.tournamentId === 'global' ? 'bg-green-500 text-white' : 'bg-blue-500 text-white'}`}>
                                    {item.tournamentId === 'global' ? 'Global' : 'Specific'}
                                </div>
                            </div>
                            <div className="flex-1">
                                <div className="flex justify-between items-start mb-2">
                                    <h3 className="font-bold text-lg text-slate-800 line-clamp-1 group-hover:text-indigo-600 transition">{item.title}</h3>
                                    <div className="flex items-center gap-1">
                                        <button onClick={() => shareNews(item)} className="p-2 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded-full transition"><Share2 className="w-4 h-4"/></button>
                                        <button onClick={() => handleEditNews(item)} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition"><Edit3 className="w-4 h-4"/></button>
                                        <button onClick={() => triggerDeleteNews(item.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-full transition"><Trash2 className="w-4 h-4"/></button>
                                    </div>
                                </div>
                                <p className="text-slate-600 text-sm line-clamp-2 mb-2">{item.content}</p>
                                <div className="flex items-center gap-4 text-xs text-slate-400">
                                    <span className="flex items-center gap-1"><Calendar className="w-3 h-3"/> {new Date(item.timestamp).toLocaleDateString()}</span>
                                    {item.documentUrl && <span className="flex items-center gap-1 text-indigo-500 font-bold"><Paperclip className="w-3 h-3"/> มีเอกสารแนบ</span>}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        )}

        {/* --- USERS TAB --- */}
        {activeTab === 'users' && (
            <div className="animate-in fade-in duration-300">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="font-bold text-xl text-slate-800">จัดการผู้ใช้งาน ({userList.length})</h2>
                    <button onClick={() => handleOpenUserModal(null)} className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-indigo-700 transition text-sm"><UserPlus className="w-4 h-4"/> เพิ่มผู้ใช้</button>
                </div>
                
                {isLoadingUsers ? <div className="text-center py-12"><Loader2 className="w-8 h-8 animate-spin mx-auto text-indigo-600 mb-2"/><p className="text-slate-500">กำลังโหลดข้อมูลผู้ใช้...</p></div> : (
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-50 text-slate-500 font-medium border-b">
                                <tr>
                                    <th className="p-4">User</th>
                                    <th className="p-4">Role</th>
                                    <th className="p-4">Phone</th>
                                    <th className="p-4">Login Type</th>
                                    <th className="p-4 text-right">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {userList.map(u => (
                                    <tr key={u.userId} className="hover:bg-slate-50">
                                        <td className="p-4">
                                            <div className="flex items-center gap-3">
                                                {u.pictureUrl ? <img src={u.pictureUrl} className="w-8 h-8 rounded-full object-cover border border-slate-200"/> : <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-500">{u.displayName?.substring(0,1) || 'U'}</div>}
                                                <div>
                                                    <div className="font-bold text-slate-800">{u.displayName}</div>
                                                    <div className="text-xs text-slate-400">@{u.username}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="p-4"><span className={`px-2 py-1 rounded text-xs font-bold uppercase ${u.role === 'admin' ? 'bg-purple-100 text-purple-700' : u.role === 'staff' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>{u.role}</span></td>
                                        <td className="p-4 text-slate-600">{u.phoneNumber || '-'}</td>
                                        <td className="p-4"><span className="text-xs bg-slate-100 px-2 py-1 rounded text-slate-500">{u.lineUserId ? 'LINE' : 'Standard'}</span></td>
                                        <td className="p-4 text-right flex justify-end gap-2">
                                            <button onClick={() => handleOpenUserModal(u)} className="p-2 text-indigo-600 hover:bg-indigo-50 rounded border border-indigo-100 transition"><Edit3 className="w-4 h-4"/></button>
                                            <button onClick={() => handleDeleteUser(u.userId)} className="p-2 text-red-600 hover:bg-red-50 rounded border border-red-100 transition"><Trash2 className="w-4 h-4"/></button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        )}

        {/* --- DONATIONS TAB --- */}
        {activeTab === 'donations' && (
            <div className="animate-in fade-in duration-300">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h2 className="font-bold text-xl text-slate-800">รายการบริจาค</h2>
                        <p className="text-slate-500 text-sm">ยอดรวมที่ยืนยันแล้ว: <span className="font-bold text-green-600 text-lg">{donationList.filter(d => d.status === 'Verified' && (!currentTournament || d.tournamentId === currentTournament.id)).reduce((sum, d) => sum + d.amount, 0).toLocaleString()} บาท</span></p>
                    </div>
                    <div className="flex bg-white rounded-lg p-1 border shadow-sm">
                        <button onClick={() => setDonationViewMode('grid')} className={`p-2 rounded ${donationViewMode === 'grid' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-400'}`}><Grid className="w-4 h-4"/></button>
                        <button onClick={() => setDonationViewMode('list')} className={`p-2 rounded ${donationViewMode === 'list' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-400'}`}><List className="w-4 h-4"/></button>
                    </div>
                </div>

                <div className={donationViewMode === 'grid' ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" : "space-y-2"}>
                    {donationList.filter(d => !currentTournament || d.tournamentId === currentTournament.id).sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).map(d => (
                        <div key={d.id} className={`bg-white rounded-xl shadow-sm border p-4 transition hover:shadow-md cursor-pointer relative overflow-hidden ${d.status === 'Verified' ? 'border-green-200' : d.status === 'Rejected' ? 'border-red-200' : 'border-orange-200'}`} onClick={() => setSelectedDonation(d)}>
                            <div className={`absolute top-0 left-0 w-1 h-full ${d.status === 'Verified' ? 'bg-green-500' : d.status === 'Rejected' ? 'bg-red-500' : 'bg-orange-500'}`}></div>
                            <div className="flex justify-between items-start mb-2 pl-2">
                                <div className="flex items-center gap-3">
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white ${d.status === 'Verified' ? 'bg-green-500' : d.status === 'Rejected' ? 'bg-red-500' : 'bg-orange-500'}`}>
                                        <DollarSign className="w-5 h-5"/>
                                    </div>
                                    <div>
                                        <div className="font-bold text-slate-800">{d.donorName} {d.isAnonymous && <span className="text-[10px] bg-slate-100 text-slate-500 px-1 rounded ml-1">Anon</span>}</div>
                                        <div className="text-xs text-slate-400">{new Date(d.timestamp).toLocaleString()}</div>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="font-black text-lg text-slate-700">{d.amount.toLocaleString()}</div>
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${d.status === 'Verified' ? 'bg-green-100 text-green-700' : d.status === 'Rejected' ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>{d.status}</span>
                                </div>
                            </div>
                            {d.isEdonation && <div className="mt-2 pl-2 flex items-center gap-1 text-xs text-blue-600 font-bold bg-blue-50 w-fit px-2 py-1 rounded"><FileCheck className="w-3 h-3"/> e-Donation Request</div>}
                        </div>
                    ))}
                    {donationList.length === 0 && <div className="col-span-full text-center py-12 text-slate-400">ไม่มีรายการบริจาค</div>}
                </div>
            </div>
        )}
      </div>
    </div>
  );
}
