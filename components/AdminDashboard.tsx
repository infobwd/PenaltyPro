
import React, { useState, useEffect, useRef } from 'react';
import { Team, Player, AppSettings, NewsItem, Tournament, UserProfile, Donation } from '../types';
import { ShieldCheck, ShieldAlert, Users, LogOut, Eye, X, Settings, MapPin, CreditCard, Save, Image, Search, FileText, Bell, Plus, Trash2, Loader2, Grid, Edit3, Paperclip, Download, Upload, Copy, Phone, User, Camera, AlertTriangle, CheckCircle2, UserPlus, ArrowRight, Hash, Palette, Briefcase, ExternalLink, FileCheck, Info, Calendar, Trophy, Lock, Heart, Target, UserCog, Globe, DollarSign, Check, Shuffle, LayoutGrid, List, PlayCircle, StopCircle, SkipForward, Minus, Layers, RotateCcw, Sparkles } from 'lucide-react';
import { updateTeamStatus, saveSettings, manageNews, fileToBase64, updateTeamData, fetchUsers, updateUserRole, verifyDonation, createUser, updateUserDetails, deleteUser } from '../services/sheetService';
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
  donations?: Donation[];
}

const MAX_IMAGE_SIZE = 2 * 1024 * 1024; // 2MB
const MAX_DOC_SIZE = 3 * 1024 * 1024;   // 3MB

const AdminDashboard: React.FC<AdminDashboardProps> = ({ teams: initialTeams, players: initialPlayers, settings, onLogout, onRefresh, news = [], showNotification, initialTeamId, currentTournament, donations = [] }) => {
  const [activeTab, setActiveTab] = useState<'teams' | 'settings' | 'news' | 'users' | 'donations'>('teams');
  const [localTeams, setLocalTeams] = useState<Team[]>(initialTeams);
  const [localPlayers, setLocalPlayers] = useState<Player[]>(initialPlayers);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  
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

  // Draw Logic State
  const [isDrawModalOpen, setIsDrawModalOpen] = useState(false);
  const [drawGroupCount, setDrawGroupCount] = useState(4);
  const [teamsPerGroup, setTeamsPerGroup] = useState(4); // New State: Teams per group
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
  const [latestReveal, setLatestReveal] = useState<Team | null>(null); // New: For Big Reveal Animation

  // Confetti Canvas Ref
  const confettiCanvasRef = useRef<HTMLCanvasElement>(null);

  // View States
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [isEditingTeam, setIsEditingTeam] = useState(false);
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
  const [isEditingNews, setIsEditingNews] = useState(false);
  const [deleteNewsId, setDeleteNewsId] = useState<string | null>(null);
  
  const [settingsLogoPreview, setSettingsLogoPreview] = useState<string | null>(null);
  const [objectiveImagePreview, setObjectiveImagePreview] = useState<string | null>(null);
  const [rejectModal, setRejectModal] = useState<{ isOpen: boolean, teamId: string | null }>({ isOpen: false, teamId: null });
  const [rejectReasonInput, setRejectReasonInput] = useState('');

  useEffect(() => {
    setLocalTeams(initialTeams);
    setLocalPlayers(initialPlayers);
    setDonationList(donations);
  }, [initialTeams, initialPlayers, donations]);
  
  useEffect(() => {
      if (activeTab === 'users') {
          loadUsers();
      }
  }, [activeTab]);

  const loadUsers = async () => {
      setIsLoadingUsers(true);
      const users = await fetchUsers();
      setUserList(users);
      setIsLoadingUsers(false);
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
      
      setIsLoadingUsers(true);
      let success = false;
      
      if (editingUser) {
          // Update
          success = await updateUserDetails({ userId: editingUser.userId, ...userForm });
      } else {
          // Create
          if (!userForm.password) {
              notify("ข้อมูลไม่ครบ", "กรุณากรอกรหัสผ่านสำหรับผู้ใช้ใหม่", "warning");
              setIsLoadingUsers(false);
              return;
          }
          success = await createUser(userForm);
      }

      if (success) {
          notify("สำเร็จ", editingUser ? "แก้ไขข้อมูลผู้ใช้เรียบร้อย" : "สร้างผู้ใช้ใหม่เรียบร้อย", "success");
          setIsUserModalOpen(false);
          loadUsers();
      } else {
          notify("ผิดพลาด", "ดำเนินการไม่สำเร็จ อาจมีชื่อผู้ใช้ซ้ำ", "error");
      }
      setIsLoadingUsers(false);
  };

  const handleDeleteUser = async (userId: string) => {
      if (!confirm("ยืนยันการลบผู้ใช้งานนี้?")) return;
      setIsLoadingUsers(true);
      const success = await deleteUser(userId);
      if (success) {
          notify("สำเร็จ", "ลบผู้ใช้เรียบร้อย", "success");
          loadUsers();
      } else {
          notify("ผิดพลาด", "ลบไม่สำเร็จ", "error");
      }
      setIsLoadingUsers(false);
  };

  const handleVerifyDonation = async (donationId: string, status: 'Verified' | 'Rejected') => {
      setIsVerifyingDonation(true);
      const success = await verifyDonation(donationId, status);
      if (success) {
          notify("สำเร็จ", `สถานะบริจาค: ${status}`, "success");
          setDonationList(prev => prev.map(d => d.id === donationId ? { ...d, status } : d));
          setSelectedDonation(null);
          onRefresh();
      } else {
          notify("ผิดพลาด", "บันทึกไม่สำเร็จ", "error");
      }
      setIsVerifyingDonation(false);
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
        setEditForm({ team: { ...selectedTeam }, players: JSON.parse(JSON.stringify(teamPlayers)), newLogo: null, newSlip: null, newDoc: null });
        setIsEditingTeam(false); // Default to view mode, admin can click edit
    }
  }, [selectedTeam]);

  const notify = (title: string, msg: string, type: 'success' | 'error' | 'info' | 'warning') => { if (showNotification) showNotification(title, msg, type); else alert(`${title}: ${msg}`); };
  const validateFile = (file: File, type: 'image' | 'doc') => {
    const limit = type === 'image' ? MAX_IMAGE_SIZE : MAX_DOC_SIZE;
    if (file.size > limit) { notify("ไฟล์ใหญ่เกินไป", `ขนาดไฟล์ต้องไม่เกิน ${limit / 1024 / 1024}MB`, "error"); return false; }
    return true;
  };

  // ... (Keep existing Draw Logic & Team Update Logic here) ...
  // [Code shortened for brevity, keeping all Draw logic logic intact]
  const handleStatusUpdate = async (teamId: string, status: 'Approved' | 'Rejected') => { 
      const currentTeam = editForm?.team || localTeams.find(t => t.id === teamId); 
      if (!currentTeam) return; 
      if (status === 'Rejected') { setRejectReasonInput(''); setRejectModal({ isOpen: true, teamId }); return; } 
      await performStatusUpdate(teamId, status, currentTeam.group, '');
  };

  const confirmReject = async () => {
      if (!rejectModal.teamId) return;
      if (!rejectReasonInput.trim()) { notify("แจ้งเตือน", "กรุณาระบุเหตุผล", "warning"); return; }
      const currentTeam = editForm?.team || localTeams.find(t => t.id === rejectModal.teamId);
      if (!currentTeam) return;
      setRejectModal({ isOpen: false, teamId: null });
      await performStatusUpdate(currentTeam.id, 'Rejected', currentTeam.group, rejectReasonInput);
  };

  const performStatusUpdate = async (teamId: string, status: 'Approved' | 'Rejected', group?: string, reason?: string) => {
      // Optimistic Update
      const updatedTeam = { ...localTeams.find(t => t.id === teamId)!, status, rejectReason: reason || '' }; 
      setLocalTeams(prev => prev.map(t => t.id === teamId ? updatedTeam : t)); 
      if (editForm) setEditForm({ ...editForm, team: updatedTeam }); 
      
      try { 
          await updateTeamStatus(teamId, status, group, reason); 
          notify("สำเร็จ", status === 'Approved' ? "อนุมัติทีมเรียบร้อย" : "บันทึกการไม่อนุมัติเรียบร้อย", "success"); 
      } catch (e) { 
          console.error(e); 
          notify("ผิดพลาด", "บันทึกสถานะไม่สำเร็จ", "error"); 
      }
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
  const handleSaveDrawResults = async () => { setIsDrawing(true); const updates: { teamId: string, group: string }[] = []; Object.entries(liveGroups).forEach(([groupName, teams]) => { (teams as Team[]).forEach(t => { updates.push({ teamId: t.id, group: groupName }); }); }); try { setLocalTeams(prev => prev.map(t => { const update = updates.find(u => u.teamId === t.id); return update ? { ...t, group: update.group } : t; })); const promises = updates.map(u => updateTeamStatus(u.teamId, 'Approved', u.group, '')); await Promise.all(promises); notify("บันทึกเสร็จสิ้น", "อัปเดตกลุ่มการแข่งขันเรียบร้อยแล้ว", "success"); setIsLiveDrawActive(false); } catch (e) { notify("ผิดพลาด", "บันทึกผลไม่สำเร็จบางรายการ", "error"); } finally { setIsDrawing(false); } };

  const handleSettingsLogoChange = async (file: File) => {
      if (!file || !validateFile(file, 'image')) return;
      try { const preview = URL.createObjectURL(file); setSettingsLogoPreview(preview); const base64 = await fileToBase64(file); setConfigForm(prev => ({ ...prev, competitionLogo: base64 })); } catch (e) { console.error("Logo Error", e); }
  };

  const handleObjectiveImageChange = async (file: File) => {
      if (!file || !validateFile(file, 'image')) return;
      try { const preview = URL.createObjectURL(file); setObjectiveImagePreview(preview); const base64 = await fileToBase64(file); setConfigForm(prev => ({ ...prev, objectiveImageUrl: base64 })); } catch (e) { console.error("Obj Img Error", e); }
  };

  const handleSaveConfig = async () => { setIsSavingSettings(true); await saveSettings(configForm); await onRefresh(); setIsSavingSettings(false); notify("สำเร็จ", "บันทึกการตั้งค่าเรียบร้อย", "success"); };
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
          if (type === 'logo') setEditForm({ ...editForm, newLogo: file, logoPreview: previewUrl }); else if (type === 'slip') setEditForm({ ...editForm, newSlip: file, slipPreview: previewUrl }); else if (type === 'doc') setEditForm({ ...editForm, newDoc: file });
      }
  };
  const handleAddPlayer = () => { if (!editForm) return; const newPlayer: Player = { id: `TEMP_${Date.now()}_${Math.floor(Math.random()*1000)}`, teamId: editForm.team.id, name: '', number: '', position: 'Player', photoUrl: '', birthDate: '' }; setEditForm({ ...editForm, players: [...editForm.players, newPlayer] }); };
  const removePlayer = (index: number) => { if (!editForm) return; const updatedPlayers = editForm.players.filter((_, i) => i !== index); setEditForm({ ...editForm, players: updatedPlayers }); };
  const removePlayerPhoto = (index: number) => {
      if (editForm) {
          const updatedPlayers = [...editForm.players];
          updatedPlayers[index] = { ...updatedPlayers[index], photoUrl: '' }; // Clear photo URL
          setEditForm({ ...editForm, players: updatedPlayers });
      }
  };

  const handleSaveTeamChanges = async () => {
      if (!editForm) return;
      setIsSavingTeam(true);
      try {
          let logoBase64 = editForm.team.logoUrl; let slipBase64 = editForm.team.slipUrl; let docBase64 = editForm.team.docUrl;
          if (editForm.newLogo) logoBase64 = await fileToBase64(editForm.newLogo);
          if (editForm.newSlip) slipBase64 = await fileToBase64(editForm.newSlip);
          if (editForm.newDoc) docBase64 = await fileToBase64(editForm.newDoc);
          const teamToSave = { ...editForm.team, logoUrl: logoBase64, slipUrl: slipBase64, docUrl: docBase64 };
          await updateTeamData(teamToSave, editForm.players);
          setLocalTeams(prev => prev.map(t => t.id === teamToSave.id ? teamToSave : t));
          setLocalPlayers(prev => { const others = prev.filter(p => p.teamId !== teamToSave.id); return [...others, ...editForm.players]; });
          setSelectedTeam(teamToSave); setIsEditingTeam(false); notify("สำเร็จ", "บันทึกผลการแก้ไขแล้ว", "success"); onRefresh();
      } catch (error) { console.error(error); notify("ผิดพลาด", "เกิดข้อผิดพลาดในการบันทึก", "error"); } finally { setIsSavingTeam(false); }
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
      setIsEditingNews(true); 
      const formElement = document.getElementById('news-form-anchor'); 
      if (formElement) formElement.scrollIntoView({ behavior: 'smooth' }); 
  };

  const handleSaveNews = async () => { 
      if(!newsForm.title || !newsForm.content) { notify("ข้อมูลไม่ครบ", "กรุณาระบุหัวข้อและเนื้อหาข่าว", "warning"); return; } 
      if (newsForm.imageFile && !validateFile(newsForm.imageFile, 'image')) return;
      if (newsForm.docFile && !validateFile(newsForm.docFile, 'doc')) return;
      setIsSavingNews(true); 
      try { 
          const imageBase64 = newsForm.imageFile ? await fileToBase64(newsForm.imageFile) : undefined; const docBase64 = newsForm.docFile ? await fileToBase64(newsForm.docFile) : undefined; 
          const newsData: Partial<NewsItem> = { 
              id: newsForm.id || Date.now().toString(), 
              title: newsForm.title, 
              content: newsForm.content, 
              timestamp: Date.now(),
              tournamentId: newsForm.tournamentId 
          }; 
          if (imageBase64) newsData.imageUrl = imageBase64; if (docBase64) newsData.documentUrl = docBase64; 
          const action = isEditingNews ? 'edit' : 'add'; await manageNews(action, newsData); 
          setNewsForm({ id: null, title: '', content: '', imageFile: null, imagePreview: null, docFile: null, tournamentId: 'global' }); 
          setIsEditingNews(false); notify("สำเร็จ", isEditingNews ? "แก้ไขข่าวเรียบร้อย" : "เพิ่มข่าวเรียบร้อย", "success"); 
          await onRefresh(); 
      } catch (e) { notify("ผิดพลาด", "เกิดข้อผิดพลาด: " + e, "error"); } finally { setIsSavingNews(false); } 
  };
  
  const triggerDeleteNews = (id: string) => { setDeleteNewsId(id); };
  const confirmDeleteNews = async () => { if (!deleteNewsId) return; try { await manageNews('delete', { id: deleteNewsId }); await onRefresh(); setDeleteNewsId(null); notify("สำเร็จ", "ลบข่าวเรียบร้อย", "success"); } catch (e) { notify("ผิดพลาด", "ลบข่าวไม่สำเร็จ", "error"); } };
  const handleSort = (key: string) => { let direction: 'asc' | 'desc' = 'asc'; if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') { direction = 'desc'; } setSortConfig({ key, direction }); };
  const sortedTeams = [...localTeams].sort((a: any, b: any) => { if (!sortConfig) return 0; if (a[sortConfig.key] < b[sortConfig.key]) return sortConfig.direction === 'asc' ? -1 : 1; if (a[sortConfig.key] > b[sortConfig.key]) return sortConfig.direction === 'asc' ? 1 : -1; return 0; });
  const filteredTeams = sortedTeams.filter(t => t.name.toLowerCase().includes(searchTerm.toLowerCase()) || t.province?.toLowerCase().includes(searchTerm.toLowerCase()) || t.district?.toLowerCase().includes(searchTerm.toLowerCase()));
  const downloadCSV = () => { try { const headers = "ID,ชื่อทีม,ตัวย่อ,สถานะ,กลุ่ม,อำเภอ,จังหวัด,ผู้อำนวยการ,ผู้จัดการ,เบอร์โทร,ผู้ฝึกสอน,เบอร์โทรโค้ช"; const rows = filteredTeams.map(t => `"${t.id}","${t.name}","${t.shortName}","${t.status}","${t.group || ''}","${t.district}","${t.province}","${t.directorName || ''}","${t.managerName}","'${t.managerPhone || ''}","${t.coachName}","'${t.coachPhone || ''}"` ); const csvContent = [headers, ...rows].join("\n"); const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.setAttribute("href", url); link.setAttribute("download", "teams_data.csv"); document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url); } catch (e) { console.error("CSV Download Error:", e); notify("ผิดพลาด", "ดาวน์โหลด CSV ไม่สำเร็จ", "error"); } };
  const copyToClipboard = (text: string) => { navigator.clipboard.writeText(text); notify("คัดลอกแล้ว", text, "info"); };

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

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-8 pb-24">
      {/* ... [Keep Preview Image Modal] ... */}
      {previewImage && (
          <div className="fixed inset-0 z-[1400] bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setPreviewImage(null)}>
              <div className="relative max-w-4xl max-h-[90vh]">
                  <img src={previewImage} className="max-w-full max-h-[90vh] rounded shadow-lg" />
                  <button className="absolute -top-4 -right-4 bg-white rounded-full p-2 text-slate-800" onClick={() => setPreviewImage(null)}><X className="w-6 h-6"/></button>
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
                          <div className="text-sm text-slate-500 mb-1">ผู้บริจาค</div>
                          <div className="text-xl font-bold text-slate-800">{selectedDonation.donorName}</div>
                          <div className="text-2xl font-bold text-indigo-600 my-2">{selectedDonation.amount.toLocaleString()} บาท</div>
                          <div className="text-xs text-slate-400">{selectedDonation.timestamp}</div>
                      </div>
                      <div className="bg-slate-100 rounded-xl p-2 mb-4 border border-slate-200">
                          {selectedDonation.slipUrl ? (
                              <img src={selectedDonation.slipUrl} className="w-full h-auto rounded-lg" />
                          ) : (
                              <div className="h-32 flex items-center justify-center text-slate-400">No Image</div>
                          )}
                      </div>
                      <div className="space-y-2 text-sm text-slate-600 bg-slate-50 p-4 rounded-lg">
                          <p><b>เบอร์โทร:</b> {selectedDonation.phone}</p>
                          <p><b>e-Donation:</b> {selectedDonation.isEdonation ? 'ใช่' : 'ไม่'}</p>
                          {selectedDonation.isEdonation && <p><b>Tax ID:</b> {selectedDonation.taxId}</p>}
                          {selectedDonation.isEdonation && <p><b>ที่อยู่:</b> {selectedDonation.address}</p>}
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
                        className="flex-1 py-3 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 shadow-md"
                      >
                          {isVerifyingDonation ? <Loader2 className="w-5 h-5 animate-spin mx-auto"/> : 'ยืนยันยอด'}
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* LIVE DRAW OVERLAYS ... */}
      {/* ... [Keep Draw UI] ... */}
      {isLiveDrawActive && (
          <div className="fixed inset-0 z-[2000] bg-slate-900 flex flex-col p-0 text-white overflow-hidden">
              {/* Confetti Canvas - Local to this modal */}
              <canvas 
                  ref={confettiCanvasRef} 
                  className="absolute inset-0 pointer-events-none z-[2001] w-full h-full"
              />

              <div className="flex justify-between items-center p-4 md:p-6 bg-slate-900/90 backdrop-blur z-10 border-b border-white/10">
                  <div className="flex items-center gap-3">
                      <div className="p-2 bg-indigo-600 rounded-lg shadow-lg shadow-indigo-500/50">
                          <Shuffle className="w-6 h-6 text-white" />
                      </div>
                      <div>
                          <h1 className="text-2xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-cyan-400">LIVE DRAW STUDIO</h1>
                          <p className="text-xs text-slate-400 font-mono">Official Tournament Draw</p>
                      </div>
                  </div>
                  <div className="flex items-center gap-4">
                      {liveDrawStep === 'finished' && (
                          <button 
                              onClick={handleSaveDrawResults} 
                              className="px-6 py-3 bg-green-500 hover:bg-green-600 text-white rounded-full font-bold shadow-lg shadow-green-500/30 flex items-center gap-2 transition animate-bounce"
                              disabled={isDrawing}
                          >
                              {isDrawing ? <Loader2 className="w-5 h-5 animate-spin"/> : <Save className="w-5 h-5" />} บันทึกผล
                          </button>
                      )}
                      <button onClick={() => setIsLiveDrawActive(false)} className="text-slate-400 hover:text-white p-2 bg-slate-800 hover:bg-slate-700 rounded-full transition"><X className="w-6 h-6"/></button>
                  </div>
              </div>

              <div className="flex-1 grid grid-cols-12 gap-6 overflow-hidden p-4 md:p-6 relative">
                  
                  {/* BIG REVEAL OVERLAY */}
                  {latestReveal && (
                      <div className="absolute inset-0 z-[2002] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
                          <div className="flex flex-col items-center animate-in zoom-in-50 duration-500">
                              <div className="w-64 h-64 bg-white rounded-3xl p-4 shadow-[0_0_100px_rgba(255,215,0,0.5)] border-4 border-yellow-400 mb-6 flex items-center justify-center relative overflow-hidden">
                                  <div className="absolute inset-0 bg-gradient-to-tr from-yellow-200/50 to-transparent animate-pulse"></div>
                                  {latestReveal.logoUrl ? (
                                      <img src={latestReveal.logoUrl} className="w-full h-full object-contain drop-shadow-xl" />
                                  ) : (
                                      <div className="text-9xl font-black text-slate-800 opacity-20">{latestReveal.shortName.charAt(0)}</div>
                                  )}
                              </div>
                              <h2 className="text-6xl font-black text-white drop-shadow-[0_4px_10px_rgba(0,0,0,0.8)] text-center tracking-tighter uppercase">
                                  {latestReveal.name}
                              </h2>
                              <div className="mt-4 px-6 py-2 bg-indigo-600 text-white rounded-full font-bold text-xl shadow-xl border border-indigo-400">
                                  GROUP {currentSpinGroup}
                              </div>
                          </div>
                      </div>
                  )}

                  {/* LEFT: POOL & CONTROLS */}
                  <div className="col-span-12 md:col-span-3 flex flex-col bg-slate-800/50 rounded-2xl border border-slate-700/50 overflow-hidden backdrop-blur-sm shadow-xl">
                      <div className="p-4 bg-slate-800 border-b border-slate-700 font-bold flex flex-col gap-2">
                          <div className="flex justify-between items-center">
                              <span>ทีมในโถ ({poolTeams.length})</span>
                              {drawnCount > 0 && liveDrawStep !== 'spinning' && (
                                  <button onClick={resetDraw} className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1 bg-red-900/30 px-2 py-1 rounded border border-red-900/50">
                                      <RotateCcw className="w-3 h-3"/> รีเซ็ต
                                  </button>
                              )}
                          </div>
                          
                          {/* Control Buttons */}
                          {liveDrawStep === 'idle' && poolTeams.length > 0 && (
                              <div className="grid grid-cols-2 gap-2 mt-2">
                                  <button onClick={() => startLiveDrawSequence(false)} className="text-xs bg-indigo-600 px-2 py-3 rounded-lg hover:bg-indigo-500 transition shadow-lg shadow-indigo-500/30 flex flex-col items-center justify-center gap-1">
                                      <PlayCircle className="w-4 h-4" /> สุ่มทีละใบ
                                  </button>
                                  <button onClick={drawRoundBatch} className="text-xs bg-cyan-600 px-2 py-3 rounded-lg hover:bg-cyan-500 transition shadow-lg shadow-cyan-500/30 flex flex-col items-center justify-center gap-1">
                                      <Layers className="w-4 h-4" /> สุ่มยกแผง
                                  </button>
                              </div>
                          )}
                      </div>
                      <div className="flex-1 overflow-y-auto p-2 space-y-1">
                          {poolTeams.map((t, idx) => (
                              <div key={t.id} className="text-sm text-slate-400 p-2 bg-slate-900/50 rounded border border-slate-700/50 flex items-center gap-2">
                                  <div className="w-5 h-5 rounded-full bg-slate-700 flex items-center justify-center text-[10px] font-mono">{idx + 1}</div>
                                  <span className="truncate">{t.name}</span>
                              </div>
                          ))}
                          {poolTeams.length === 0 && <div className="text-center py-10 text-slate-500 italic">จับครบแล้ว</div>}
                      </div>
                  </div>

                  {/* CENTER: STAGE */}
                  <div className="col-span-12 md:col-span-9 flex flex-col gap-6 overflow-y-auto pr-2 custom-scrollbar">
                      
                      {/* SPOTLIGHT */}
                      <div className="h-48 shrink-0 bg-gradient-to-br from-indigo-900 to-slate-900 rounded-3xl border border-indigo-500/30 flex flex-col items-center justify-center relative overflow-hidden shadow-2xl shadow-indigo-900/50 group">
                          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
                          {/* Animated Background */}
                          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:animate-[shimmer_2s_infinite]"></div>

                          {liveDrawStep === 'spinning' && (
                              <>
                                  <div className="text-indigo-300 text-sm font-bold uppercase tracking-[0.3em] mb-2 animate-pulse flex items-center gap-2">
                                      <Sparkles className="w-4 h-4"/> กำลังสุ่มเข้าสู่กลุ่ม <span className="text-white text-lg bg-indigo-600 px-3 py-0.5 rounded shadow-lg ml-1">{currentSpinGroup}</span>
                                  </div>
                                  <div className="text-5xl md:text-7xl font-black text-transparent bg-clip-text bg-gradient-to-b from-white to-slate-400 drop-shadow-xl transition-all duration-75 scale-110 tracking-tight">
                                      {currentSpinName}
                                  </div>
                              </>
                          )}
                          {liveDrawStep === 'idle' && (
                              <div className="text-slate-500 flex flex-col items-center gap-4">
                                  <div className="w-20 h-20 bg-slate-800 rounded-full flex items-center justify-center border-4 border-slate-700 shadow-inner">
                                      <PlayCircle className="w-10 h-10 opacity-50" />
                                  </div>
                                  <span className="text-lg font-medium">พร้อมเริ่มการจับฉลาก</span>
                              </div>
                          )}
                          {liveDrawStep === 'finished' && (
                              <div className="text-green-400 flex flex-col items-center gap-3">
                                  <div className="w-20 h-20 bg-green-900/30 rounded-full flex items-center justify-center border-4 border-green-600 shadow-[0_0_30px_rgba(22,163,74,0.3)] animate-pulse">
                                      <CheckCircle2 className="w-10 h-10" />
                                  </div>
                                  <div>
                                      <div className="text-3xl font-bold text-center">การจับฉลากเสร็จสิ้น</div>
                                      <div className="text-sm text-slate-400 text-center mt-1">กรุณาตรวจสอบผลและกดปุ่ม <span className="text-green-400 font-bold">บันทึกผล</span></div>
                                  </div>
                              </div>
                          )}
                      </div>

                      {/* GROUPS GRID */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pb-10">
                          {Object.keys(liveGroups).sort().map(group => {
                              const isFull = liveGroups[group].length >= teamsPerGroup;
                              return (
                                  <div key={group} className={`bg-slate-800 rounded-xl border ${currentSpinGroup === group && liveDrawStep === 'spinning' ? 'border-indigo-500 shadow-[0_0_20px_rgba(99,102,241,0.3)] ring-2 ring-indigo-500/50' : isFull ? 'border-emerald-700/50 shadow-[0_0_10px_rgba(16,185,129,0.1)]' : 'border-slate-700'} overflow-hidden transition-all duration-300 hover:border-indigo-400/50`}>
                                      <div className={`p-3 font-bold text-center border-b border-slate-700 flex justify-between items-center ${currentSpinGroup === group && liveDrawStep === 'spinning' ? 'bg-indigo-600 text-white' : isFull ? 'bg-emerald-800 text-white' : 'bg-slate-900 text-slate-300'}`}>
                                          <span className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-white"></div> GROUP {group}</span>
                                          <span className="text-xs bg-black/20 px-2 py-0.5 rounded-full">({liveGroups[group].length}/{teamsPerGroup})</span>
                                      </div>
                                      <div className="p-2 space-y-2 min-h-[180px]">
                                          {liveGroups[group].map((team, idx) => (
                                              <div key={team.id} className="p-2 bg-slate-700/50 rounded flex items-center justify-between gap-2 animate-in zoom-in slide-in-from-bottom-2 duration-300 group border border-transparent hover:border-slate-600 hover:bg-slate-700 transition">
                                                  <div className="flex items-center gap-3 min-w-0">
                                                      <div className="w-8 h-8 rounded bg-slate-600 flex items-center justify-center shrink-0 overflow-hidden shadow-sm">
                                                          {team.logoUrl ? <img src={team.logoUrl} className="w-full h-full object-cover" /> : <span className="text-xs font-bold text-slate-300">{team.shortName.charAt(0)}</span>}
                                                      </div>
                                                      <div className="flex flex-col min-w-0">
                                                          <span className="text-sm font-bold text-slate-200 truncate leading-tight">{team.name}</span>
                                                          <span className="text-[10px] text-slate-500 truncate">{team.province}</span>
                                                      </div>
                                                  </div>
                                                  {/* Remove Button - Always visible for ease of use */}
                                                  <button 
                                                      onClick={() => requestRemoveTeam(team, group)}
                                                      className="text-slate-500 hover:text-red-400 p-1.5 rounded-full hover:bg-red-900/20 transition"
                                                      title="ลบออกจากกลุ่ม"
                                                      disabled={liveDrawStep === 'spinning'}
                                                  >
                                                      <X className="w-3 h-3" />
                                                  </button>
                                              </div>
                                          ))}
                                          {liveGroups[group].length === 0 && <div className="text-center text-slate-600 text-xs py-8 opacity-30 flex flex-col items-center"><div className="w-8 h-8 border-2 border-dashed border-slate-600 rounded-full mb-1"></div>ว่าง</div>}
                                      </div>
                                  </div>
                              );
                          })}
                      </div>
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

      {/* CONFIRM REMOVE TEAM MODAL */}
      {removeConfirmModal.isOpen && removeConfirmModal.team && (
          <div className="fixed inset-0 z-[2100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full animate-in zoom-in duration-200 border border-red-100">
                  <div className="flex flex-col items-center text-center gap-4">
                      <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mb-2">
                          <Trash2 className="w-8 h-8 text-red-500" />
                      </div>
                      <div>
                          <h3 className="text-lg font-bold text-slate-800">ยืนยันการลบทีม</h3>
                          <p className="text-sm text-slate-500 mt-1">
                              ต้องการนำทีม <span className="font-bold text-slate-800">{removeConfirmModal.team.name}</span> <br/>
                              ออกจาก <span className="font-bold text-indigo-600">กลุ่ม {removeConfirmModal.group}</span> ใช่หรือไม่?
                          </p>
                          <p className="text-xs text-slate-400 mt-2 bg-slate-50 p-2 rounded">
                              ทีมจะถูกย้ายกลับไปที่ "โถจับฉลาก" เพื่อสุ่มใหม่
                          </p>
                      </div>
                      <div className="grid grid-cols-2 gap-3 w-full mt-2">
                          <button 
                              onClick={() => setRemoveConfirmModal({ isOpen: false, team: null, group: null })}
                              className="py-2.5 px-4 bg-white border border-slate-200 text-slate-600 rounded-xl font-bold hover:bg-slate-50 transition"
                          >
                              ยกเลิก
                          </button>
                          <button 
                              onClick={confirmRemoveTeam}
                              className="py-2.5 px-4 bg-red-500 hover:bg-red-600 text-white rounded-xl font-bold shadow-lg shadow-red-200 transition"
                          >
                              ลบออก
                          </button>
                      </div>
                  </div>
              </div>
          </div>
      )}

      {/* CONFIRM RESET DRAW MODAL */}
      {resetConfirmModal && (
          <div className="fixed inset-0 z-[2200] bg-black/70 backdrop-blur-md flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full animate-in zoom-in duration-200 border-2 border-red-100">
                  <div className="flex flex-col items-center text-center gap-4">
                      <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mb-2 animate-pulse">
                          <RotateCcw className="w-10 h-10 text-red-600" />
                      </div>
                      <div>
                          <h3 className="text-xl font-black text-slate-800">รีเซ็ตการจับฉลากทั้งหมด?</h3>
                          <p className="text-sm text-slate-500 mt-2">
                              การดำเนินการนี้จะ <span className="text-red-600 font-bold">ล้างข้อมูลกลุ่มทั้งหมด</span><br/>
                              และนำทุกทีมกลับเข้าสู่โถจับฉลากใหม่
                          </p>
                      </div>
                      <div className="flex gap-3 w-full mt-4">
                          <button 
                              onClick={() => setResetConfirmModal(false)}
                              className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition"
                          >
                              ยกเลิก
                          </button>
                          <button 
                              onClick={confirmResetDraw}
                              className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 shadow-lg shadow-red-200 transition flex items-center justify-center gap-2"
                          >
                              <RotateCcw className="w-4 h-4"/> รีเซ็ตเดี๋ยวนี้
                          </button>
                      </div>
                  </div>
              </div>
          </div>
      )}

      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
            <div>
                <h1 className="text-3xl font-bold text-slate-800">ระบบจัดการการแข่งขัน</h1>
                <p className="text-slate-500 flex items-center gap-2">
                    Admin Control Panel
                    {currentTournament && (
                        <span className="bg-indigo-100 text-indigo-700 text-xs px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                            <Trophy className="w-3 h-3"/> กำลังจัดการ: {currentTournament.name}
                        </span>
                    )}
                </p>
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
                            <button 
                                onClick={() => setIsDrawModalOpen(true)}
                                className="flex items-center gap-1 text-xs bg-gradient-to-r from-indigo-500 to-purple-500 text-white px-4 py-2 rounded-lg hover:from-indigo-600 hover:to-purple-600 transition font-bold shadow-md transform hover:scale-105"
                            >
                                <Shuffle className="w-4 h-4" /> Live Draw
                            </button>
                        </div>
                        <div className="flex gap-2 w-full md:w-auto items-center">
                            <div className="flex bg-slate-100 rounded-lg p-1">
                                <button onClick={() => setViewMode('grid')} className={`p-1.5 rounded ${viewMode === 'grid' ? 'bg-white shadow text-indigo-600' : 'text-slate-400'}`}><LayoutGrid className="w-4 h-4"/></button>
                                <button onClick={() => setViewMode('list')} className={`p-1.5 rounded ${viewMode === 'list' ? 'bg-white shadow text-indigo-600' : 'text-slate-400'}`}><List className="w-4 h-4"/></button>
                            </div>
                            <div className="relative flex-1 md:w-64">
                                <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                                <input type="text" placeholder="ค้นหาทีม / จังหวัด..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full pl-9 pr-4 py-2 border rounded-lg text-sm" />
                            </div>
                            <button onClick={downloadCSV} className="flex items-center gap-2 text-sm px-3 py-2 bg-indigo-50 hover:bg-indigo-100 rounded-lg text-indigo-700 font-medium"><Download className="w-4 h-4" /> CSV</button>
                            <button onClick={onRefresh} className="text-sm px-3 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-600">รีเฟรช</button>
                        </div>
                    </div>

                    {/* CONTENT AREA */}
                    <div className="p-4 bg-slate-50 min-h-[400px]">
                        {viewMode === 'list' ? (
                            // LIST VIEW (TABLE)
                            <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-x-auto">
                                <table className="w-full text-left">
                                    <thead className="bg-slate-50 text-slate-500 text-sm"><tr><th className="p-4 font-medium cursor-pointer" onClick={() => handleSort('name')}>ชื่อทีม/โรงเรียน</th><th className="p-4 font-medium cursor-pointer" onClick={() => handleSort('group')}>กลุ่ม</th><th className="p-4 font-medium">ผู้ติดต่อ</th><th className="p-4 font-medium text-center cursor-pointer" onClick={() => handleSort('status')}>สถานะ</th><th className="p-4 font-medium text-right">จัดการ</th></tr></thead>
                                    <tbody className="divide-y divide-slate-100">{filteredTeams.map(team => (<tr key={team.id} className="hover:bg-slate-50"><td className="p-4"><div className="flex items-center gap-3">{team.logoUrl ? <img src={team.logoUrl} className="w-8 h-8 rounded object-cover" /> : <div className="w-8 h-8 rounded bg-slate-200 flex items-center justify-center font-bold text-slate-500 text-xs">{team.shortName}</div>}<div><p className="font-bold text-slate-800 text-sm">{team.name}</p><p className="text-[10px] text-slate-500">{team.province}</p></div></div></td><td className="p-4">{team.group || '-'}</td><td className="p-4 text-xs">{team.managerPhone}</td><td className="p-4 text-center"><span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${team.status === 'Approved' ? 'bg-green-100 text-green-700' : team.status === 'Rejected' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>{team.status}</span></td><td className="p-4 text-right"><button onClick={() => setSelectedTeam(team)} className="text-indigo-600 hover:underline text-xs">ดูข้อมูล</button></td></tr>))}</tbody>
                                </table>
                            </div>
                        ) : (
                            // GRID VIEW (CARDS)
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                {filteredTeams.map(team => (
                                    <div key={team.id} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col hover:shadow-md transition group">
                                        <div className="p-4 flex items-start justify-between">
                                            <div className="flex items-center gap-3">
                                                {team.logoUrl ? <img src={team.logoUrl} className="w-12 h-12 rounded-lg object-contain bg-slate-50 border border-slate-100 p-0.5" /> : <div className="w-12 h-12 rounded-lg bg-slate-100 flex items-center justify-center font-bold text-slate-400">{team.shortName}</div>}
                                                <div>
                                                    <h3 className="font-bold text-slate-800 line-clamp-1">{team.name}</h3>
                                                    <p className="text-xs text-slate-500 flex items-center gap-1"><MapPin className="w-3 h-3"/> {team.province}</p>
                                                </div>
                                            </div>
                                            <div className="flex flex-col items-end gap-1">
                                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${team.status === 'Approved' ? 'bg-green-100 text-green-700' : team.status === 'Rejected' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                                    {team.status}
                                                </span>
                                                {team.group && <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded text-[10px] font-bold">Gr. {team.group}</span>}
                                            </div>
                                        </div>
                                        
                                        {/* Quick View Slip/Doc */}
                                        <div className="px-4 py-2 bg-slate-50 border-y border-slate-100 flex gap-2">
                                            {team.slipUrl ? (
                                                <button onClick={() => setPreviewImage(team.slipUrl!)} className="flex-1 py-1.5 bg-white border border-slate-200 rounded text-xs font-bold text-slate-600 hover:text-indigo-600 hover:border-indigo-300 flex items-center justify-center gap-1 transition">
                                                    <CreditCard className="w-3 h-3"/> ดูสลิป
                                                </button>
                                            ) : (
                                                <div className="flex-1 py-1.5 text-center text-xs text-slate-400 italic">ไม่มีสลิป</div>
                                            )}
                                            {team.docUrl ? (
                                                <a href={team.docUrl} target="_blank" className="flex-1 py-1.5 bg-white border border-slate-200 rounded text-xs font-bold text-slate-600 hover:text-indigo-600 hover:border-indigo-300 flex items-center justify-center gap-1 transition">
                                                    <FileText className="w-3 h-3"/> ดูเอกสาร
                                                </a>
                                            ) : (
                                                <div className="flex-1 py-1.5 text-center text-xs text-slate-400 italic">ไม่มีเอกสาร</div>
                                            )}
                                        </div>

                                        <div className="mt-auto p-3 flex gap-2">
                                            {team.status === 'Pending' ? (
                                                <>
                                                    <button onClick={() => handleStatusUpdate(team.id, 'Approved')} className="flex-1 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg text-xs font-bold transition flex items-center justify-center gap-1">
                                                        <Check className="w-3 h-3"/> อนุมัติ
                                                    </button>
                                                    <button onClick={() => handleStatusUpdate(team.id, 'Rejected')} className="flex-1 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-xs font-bold transition flex items-center justify-center gap-1">
                                                        <X className="w-3 h-3"/> ปฏิเสธ
                                                    </button>
                                                </>
                                            ) : (
                                                <div className="flex-1 text-center text-xs text-slate-400 py-2">จัดการแล้ว</div>
                                            )}
                                            <button onClick={() => setSelectedTeam(team)} className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg transition">
                                                <Edit3 className="w-4 h-4"/>
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

        {/* --- NEWS TAB --- */}
        {activeTab === 'news' && (
            <div className="animate-in fade-in duration-300">
                {/* News Form: Update to support Tournament Selection and File Upload */}
                <div id="news-form-anchor" className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 mb-8">
                    <h3 className="font-bold text-lg text-slate-800 mb-4 flex items-center gap-2">
                        {isEditingNews ? <Edit3 className="w-5 h-5 text-orange-500"/> : <Plus className="w-5 h-5 text-green-500"/>}
                        {isEditingNews ? 'แก้ไขข่าวสาร' : 'สร้างข่าวสารใหม่'}
                    </h3>
                    <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">หัวข้อข่าว</label>
                                <input type="text" value={newsForm.title} onChange={e => setNewsForm({...newsForm, title: e.target.value})} className="w-full p-2 border rounded-lg text-sm" placeholder="เช่น กำหนดการแข่งขัน..." />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">ประกาศสำหรับ</label>
                                <select 
                                    value={newsForm.tournamentId} 
                                    onChange={e => setNewsForm({...newsForm, tournamentId: e.target.value})} 
                                    className="w-full p-2 border rounded-lg text-sm bg-white"
                                >
                                    <option value="global">ทุกรายการ (Global)</option>
                                    {currentTournament && <option value={currentTournament.id}>{currentTournament.name}</option>}
                                </select>
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-1">เนื้อหาข่าว</label>
                            <textarea value={newsForm.content} onChange={e => setNewsForm({...newsForm, content: e.target.value})} className="w-full p-2 border rounded-lg text-sm h-32" placeholder="รายละเอียด..." />
                        </div>
                        
                        {/* News File Inputs */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-2">รูปภาพปก</label>
                                <div className="flex items-center gap-4">
                                    {newsForm.imagePreview ? <img src={newsForm.imagePreview} className="w-16 h-16 object-cover rounded-lg border"/> : <div className="w-16 h-16 bg-slate-100 rounded-lg flex items-center justify-center text-slate-400"><Image className="w-6 h-6"/></div>}
                                    <label className="cursor-pointer bg-slate-50 border border-slate-300 px-3 py-1.5 rounded-lg text-sm hover:bg-slate-100 transition">
                                        เลือกรูปภาพ
                                        <input type="file" accept="image/*" className="hidden" onChange={handleNewsImageChange} />
                                    </label>
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-2">เอกสารแนบ (PDF)</label>
                                <div className="flex items-center gap-4">
                                    <div className={`w-16 h-16 rounded-lg flex items-center justify-center ${newsForm.docFile || newsForm.title ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-400'}`}>
                                        <FileText className="w-6 h-6"/>
                                    </div>
                                    <div className="flex-1">
                                        <label className="cursor-pointer bg-slate-50 border border-slate-300 px-3 py-1.5 rounded-lg text-sm hover:bg-slate-100 transition inline-block mb-1">
                                            เลือกไฟล์เอกสาร
                                            <input type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={handleNewsDocChange} />
                                        </label>
                                        <p className="text-xs text-slate-500 truncate">{newsForm.docFile ? newsForm.docFile.name : (isEditingNews && 'เอกสารเดิม (ถ้ามี)')}</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 pt-4">
                            {isEditingNews && <button onClick={() => { setIsEditingNews(false); setNewsForm({id: null, title: '', content: '', imageFile: null, imagePreview: null, docFile: null, tournamentId: 'global'}); }} className="px-4 py-2 border rounded-lg text-slate-500 hover:bg-slate-50">ยกเลิก</button>}
                            <button onClick={handleSaveNews} disabled={isSavingNews} className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-bold flex items-center gap-2">
                                {isSavingNews ? <Loader2 className="w-4 h-4 animate-spin"/> : <Save className="w-4 h-4"/>} บันทึก
                            </button>
                        </div>
                    </div>
                </div>
                
                {/* News List */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {news.map(item => (
                        <div key={item.id} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden relative group">
                            <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition z-10">
                                <button onClick={() => handleEditNews(item)} className="p-1.5 bg-white text-orange-500 rounded shadow hover:bg-orange-50"><Edit3 className="w-4 h-4"/></button>
                                <button onClick={() => triggerDeleteNews(item.id)} className="p-1.5 bg-white text-red-500 rounded shadow hover:bg-red-50"><Trash2 className="w-4 h-4"/></button>
                            </div>
                            {item.imageUrl && <div className="h-40 bg-slate-100"><img src={item.imageUrl} className="w-full h-full object-cover"/></div>}
                            <div className="p-4">
                                <div className="flex justify-between items-start mb-2">
                                    <h4 className="font-bold text-slate-800 line-clamp-1">{item.title}</h4>
                                    {(!item.tournamentId || item.tournamentId === 'global') && (
                                        <span title="Global News">
                                            <Globe className="w-4 h-4 text-slate-400 shrink-0" />
                                        </span>
                                    )}
                                </div>
                                <p className="text-xs text-slate-500 mb-2">{new Date(item.timestamp).toLocaleDateString()}</p>
                                <p className="text-sm text-slate-600 line-clamp-2">{item.content}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        )}

        {/* --- USERS TAB --- */}
        {activeTab === 'users' && (
            <div className="animate-in fade-in duration-300 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                    <h2 className="font-bold text-lg text-slate-800 flex items-center gap-2"><UserCog className="w-5 h-5 text-indigo-600"/> จัดการผู้ใช้งาน</h2>
                    <div className="flex gap-2">
                        <button onClick={() => handleOpenUserModal(null)} className="flex items-center gap-1 text-sm px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold"><Plus className="w-4 h-4"/> เพิ่มผู้ใช้</button>
                        <button onClick={loadUsers} className="text-sm px-3 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-600">รีเฟรช</button>
                    </div>
                </div>
                {isLoadingUsers ? <div className="p-8 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-indigo-600"/></div> : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-slate-50 text-slate-500 text-sm">
                                <tr>
                                    <th className="p-4 font-medium">ชื่อผู้ใช้ / Display Name</th>
                                    <th className="p-4 font-medium">Username / Login ID</th>
                                    <th className="p-4 font-medium">เบอร์โทร</th>
                                    <th className="p-4 font-medium">สิทธิ์ (Role)</th>
                                    <th className="p-4 font-medium text-right">จัดการ</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {userList.map(u => (
                                    <tr key={u.userId} className="hover:bg-slate-50">
                                        <td className="p-4">
                                            <div className="flex items-center gap-3">
                                                {u.pictureUrl ? <img src={u.pictureUrl} className="w-8 h-8 rounded-full"/> : <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center"><User className="w-4 h-4 text-slate-500"/></div>}
                                                <div className="flex flex-col">
                                                    <span className="font-bold text-slate-700">{u.displayName}</span>
                                                    {u.lineUserId && <span className="text-[10px] text-green-600">LINE Connected</span>}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="p-4 text-sm text-slate-500">{u.username || 'LINE User'}</td>
                                        <td className="p-4 text-sm text-slate-500">{u.phoneNumber || '-'}</td>
                                        <td className="p-4">
                                            <span className={`px-2 py-1 rounded text-xs font-bold uppercase ${u.role === 'admin' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
                                                {u.role}
                                            </span>
                                        </td>
                                        <td className="p-4 text-right">
                                            <div className="flex justify-end gap-2">
                                                <button onClick={() => handleOpenUserModal(u)} className="p-1.5 bg-slate-100 hover:bg-slate-200 rounded text-slate-600"><Edit3 className="w-4 h-4"/></button>
                                                <button onClick={() => handleDeleteUser(u.userId)} className="p-1.5 bg-red-50 hover:bg-red-100 rounded text-red-600"><Trash2 className="w-4 h-4"/></button>
                                            </div>
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
            <div className="animate-in fade-in duration-300 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                    <h2 className="font-bold text-lg text-slate-800 flex items-center gap-2"><DollarSign className="w-5 h-5 text-green-600"/> ตรวจสอบยอดบริจาค</h2>
                    <button onClick={onRefresh} className="text-sm px-3 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-600">รีเฟรช</button>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-slate-50 text-slate-500 text-sm">
                            <tr>
                                <th className="p-4 font-medium">วันที่ / เวลา</th>
                                <th className="p-4 font-medium">ผู้บริจาค</th>
                                <th className="p-4 font-medium">ยอดเงิน</th>
                                <th className="p-4 font-medium">สถานะ</th>
                                <th className="p-4 font-medium text-right">จัดการ</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {donationList.map((d) => (
                                <tr key={d.id} className="hover:bg-slate-50">
                                    <td className="p-4 text-sm text-slate-500">
                                        {new Date(d.timestamp).toLocaleString('th-TH')}
                                    </td>
                                    <td className="p-4">
                                        <div className="font-bold text-slate-700">{d.donorName}</div>
                                        <div className="text-xs text-slate-400">{d.phone}</div>
                                    </td>
                                    <td className="p-4 font-mono font-bold text-indigo-600">
                                        {d.amount.toLocaleString()}
                                    </td>
                                    <td className="p-4">
                                        <span className={`px-2 py-1 rounded text-xs font-bold ${
                                            d.status === 'Verified' ? 'bg-green-100 text-green-700' : 
                                            d.status === 'Rejected' ? 'bg-red-100 text-red-700' : 
                                            'bg-yellow-100 text-yellow-700'
                                        }`}>
                                            {d.status}
                                        </span>
                                    </td>
                                    <td className="p-4 text-right">
                                        <button 
                                            onClick={() => setSelectedDonation(d)}
                                            className="text-sm text-indigo-600 hover:bg-indigo-50 px-3 py-1 rounded-lg font-bold"
                                        >
                                            ตรวจสอบ
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {donationList.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="p-8 text-center text-slate-400">
                                        ยังไม่มีข้อมูลการบริจาค
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        )}
      </div>
    </div>
  );
};

export default AdminDashboard;
