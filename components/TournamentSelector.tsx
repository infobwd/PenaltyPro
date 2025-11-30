


import React, { useState, useEffect } from 'react';
import { Tournament, TournamentConfig, ProjectImage, TournamentPrize, Team, Donation } from '../types';
import { Trophy, Plus, ArrowRight, Loader2, Calendar, Target, CheckCircle2, Users, Settings, Edit2, X, Save, ArrowLeft, FileCheck, Clock, Shield, AlertTriangle, Heart, Image as ImageIcon, Trash2, Layout, MapPin, CreditCard, Banknote, Star, Share2, DollarSign, Wallet, FileText, Upload } from 'lucide-react';
import { createTournament, updateTournament, fileToBase64 } from '../services/sheetService';
import { shareTournament } from '../services/liffService';

interface TournamentSelectorProps {
  tournaments: Tournament[];
  onSelect: (id: string) => void;
  isAdmin: boolean;
  onRefresh: () => void;
  showNotification?: (title: string, message: string, type: 'success' | 'error' | 'info' | 'warning') => void;
  isLoading?: boolean;
  teams?: Team[]; 
  donations?: Donation[]; 
  defaultFee?: number;
}

// Helper for Drive Images
const getDisplayUrl = (url: string) => {
    if (!url) return '';
    if (url.includes('drive.google.com') && url.includes('/view')) {
        const idMatch = url.match(/\/d\/(.*?)\//);
        if (idMatch && idMatch[1]) return `https://lh3.googleusercontent.com/d/${idMatch[1]}`;
    }
    return url;
};

// Image compression utility
const compressImage = async (file: File): Promise<File> => {
    if (file.type === 'application/pdf') return file; // Skip PDF
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target?.result as string;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 1024;
                const scaleSize = MAX_WIDTH / img.width;
                const width = (scaleSize < 1) ? MAX_WIDTH : img.width;
                const height = (scaleSize < 1) ? img.height * scaleSize : img.height;

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx?.drawImage(img, 0, 0, width, height);

                canvas.toBlob((blob) => {
                    if (blob) {
                        const newFile = new File([blob], file.name, {
                            type: 'image/jpeg',
                            lastModified: Date.now(),
                        });
                        resolve(newFile);
                    } else {
                        reject(new Error('Canvas is empty'));
                    }
                }, 'image/jpeg', 0.7); // 70% Quality
            };
        };
        reader.onerror = (error) => reject(error);
    });
};

const TournamentSelector: React.FC<TournamentSelectorProps> = ({ tournaments, onSelect, isAdmin, onRefresh, showNotification, isLoading, teams = [], donations = [], defaultFee = 0 }) => {
  const [isCreating, setIsCreating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingTournament, setEditingTournament] = useState<Tournament | null>(null);
  const [newTourneyName, setNewTourneyName] = useState('');
  const [newTourneyType, setNewTourneyType] = useState('Penalty');
  const [editConfig, setEditConfig] = useState<TournamentConfig>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editStep, setEditStep] = useState<'general' | 'rules' | 'location' | 'objective' | 'prizes' | 'summary'>('general');

  // FILTER LOGIC: Show only Active or Upcoming tournaments
  const visibleTournaments = tournaments.filter(t => t.status === 'Active' || t.status === 'Upcoming');

  const notify = (title: string, msg: string, type: 'success' | 'error' | 'info' | 'warning') => {
      if (showNotification) showNotification(title, msg, type);
      else alert(`${title}: ${msg}`);
  };

  const handleShare = (e: React.MouseEvent, tournament: Tournament, teamCount: number, maxTeams: number) => {
      e.stopPropagation();
      shareTournament(tournament, teamCount, maxTeams);
  };

  const handleCreate = async () => {
      if (!newTourneyName) return;
      setIsSubmitting(true);
      try {
          const newId = await createTournament(newTourneyName, newTourneyType);
          if (newId) {
              await onRefresh();
              onSelect(newId);
              notify("สำเร็จ", "สร้างรายการแข่งขันใหม่เรียบร้อย", "success");
          } else {
              notify("ผิดพลาด", "สร้างรายการไม่สำเร็จ", "error");
          }
      } catch (e) {
          console.error(e);
          notify("ผิดพลาด", "เกิดข้อผิดพลาดในการเชื่อมต่อ", "error");
      } finally {
          setIsSubmitting(false);
          setIsCreating(false);
      }
  };

  const handleUpdate = async () => {
      if (!editingTournament) return;
      setIsSubmitting(true);
      try {
          const finalConfig = { ...editConfig };
          // Ensure defaults
          if (editingTournament.type !== 'Penalty') {
              if (finalConfig.halfTimeDuration === undefined) finalConfig.halfTimeDuration = 20;
              if (finalConfig.playersPerTeam === undefined) finalConfig.playersPerTeam = 7;
              if (finalConfig.maxSubs === undefined) finalConfig.maxSubs = 0;
              if (finalConfig.extraTime === undefined) finalConfig.extraTime = false;
          }

          const updatedTournament = {
              ...editingTournament,
              config: JSON.stringify(finalConfig)
          };
          
          const success = await updateTournament(updatedTournament);
          
          if (success) {
              await onRefresh(); 
              setIsEditing(false);
              setEditingTournament(null);
              notify("บันทึกสำเร็จ", "อัปเดตข้อมูลทัวร์นาเมนต์เรียบร้อยแล้ว", "success");
          } else {
              notify("บันทึกไม่สำเร็จ", "ไม่สามารถอัปเดตข้อมูลได้ กรุณาลองใหม่", "error");
          }
      } catch (e) {
          console.error(e);
          notify("ผิดพลาด", "เกิดข้อผิดพลาดในการเชื่อมต่อ", "error");
      } finally {
          setIsSubmitting(false);
      }
  };

  const openEdit = (e: React.MouseEvent, t: Tournament) => {
      e.stopPropagation();
      setEditingTournament({...t}); 
      try {
          const parsed = JSON.parse(t.config || '{}');
          setEditConfig(parsed);
      } catch(e) {
          setEditConfig({});
      }
      setEditStep('general');
      setIsEditing(true);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'before' | 'after' | 'general') => {
      if (!e.target.files || !e.target.files[0]) return;
      let file = e.target.files[0];
      
      try {
          // Compress before encoding to base64
          if (file.type.startsWith('image/')) {
              file = await compressImage(file);
          }
          
          const base64 = await fileToBase64(file);
          setEditConfig(prev => {
              const currentImages = prev.objective?.images || [];
              const newImage: ProjectImage = {
                  id: Date.now().toString(),
                  url: base64,
                  type: type
              };
              return {
                  ...prev,
                  objective: {
                      ...prev.objective,
                      isEnabled: true,
                      title: prev.objective?.title || '',
                      description: prev.objective?.description || '',
                      goal: prev.objective?.goal || 0,
                      images: [...currentImages, newImage]
                  }
              };
          });
      } catch (err) {
          notify("Error", "อัปโหลดรูปไม่สำเร็จ", "error");
      }
  };

  const handleDocUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!e.target.files || !e.target.files[0]) return;
      const file = e.target.files[0];
      if (file.size > 5 * 1024 * 1024) {
          notify("ไฟล์ใหญ่เกิน", "ขนาดไฟล์ต้องไม่เกิน 5MB", "warning");
          return;
      }
      try {
          const base64 = await fileToBase64(file);
          setEditConfig(prev => ({
              ...prev,
              objective: {
                  ...prev.objective,
                  isEnabled: true,
                  title: prev.objective?.title || '',
                  description: prev.objective?.description || '',
                  goal: prev.objective?.goal || 0,
                  images: prev.objective?.images || [],
                  docUrl: base64
              }
          }));
          notify("สำเร็จ", "อัปโหลดเอกสารเรียบร้อย", "success");
      } catch (err) {
          notify("Error", "อัปโหลดเอกสารไม่สำเร็จ", "error");
      }
  };

  const removeImage = (imgId: string) => {
      setEditConfig(prev => ({
          ...prev,
          objective: {
              ...prev.objective!,
              images: prev.objective?.images.filter(img => img.id !== imgId) || []
          }
      }));
  };

  const addPrize = () => {
      const newPrize: TournamentPrize = {
          id: Date.now().toString(),
          rankLabel: '',
          amount: '',
          description: ''
      };
      setEditConfig(prev => ({
          ...prev,
          prizes: [...(prev.prizes || []), newPrize]
      }));
  };

  const updatePrize = (id: string, field: keyof TournamentPrize, value: string) => {
      setEditConfig(prev => ({
          ...prev,
          prizes: (prev.prizes || []).map(p => p.id === id ? { ...p, [field]: value } : p)
      }));
  };

  const removePrize = (id: string) => {
      setEditConfig(prev => ({
          ...prev,
          prizes: (prev.prizes || []).filter(p => p.id !== id)
      }));
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 flex flex-col items-center justify-center font-sans" style={{ fontFamily: "'Kanit', sans-serif" }}>
        <div className="max-w-4xl w-full">
            {/* Header Section */}
            <div className="text-center mb-12 animate-in slide-in-from-top-10 duration-700">
                <div className="inline-flex p-5 bg-white rounded-full shadow-xl mb-6 ring-4 ring-indigo-50">
                    <Trophy className="w-16 h-16 text-yellow-500 drop-shadow-md" />
                </div>
                <h1 className="text-4xl md:text-5xl font-black text-slate-800 mb-4 tracking-tight">
                    Penalty Pro <span className="text-indigo-600">Arena</span>
                </h1>
                <p className="text-slate-500 text-lg max-w-lg mx-auto leading-relaxed">
                    แพลตฟอร์มบริหารจัดการการแข่งขันฟุตบอลครบวงจร<br/>
                    <span className="text-sm text-slate-400">เลือกรายการแข่งขันเพื่อเริ่มต้นใช้งาน</span>
                </p>
            </div>

            {/* Grid Layout */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in duration-1000 delay-200">
                
                {isLoading ? (
                    // Skeleton Loading
                    Array(3).fill(0).map((_, i) => (
                        <div key={i} className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 h-[280px] flex flex-col justify-between animate-pulse">
                            <div className="flex justify-between">
                                <div className="h-6 w-20 bg-slate-200 rounded-full"></div>
                                <div className="h-6 w-16 bg-slate-200 rounded-full"></div>
                            </div>
                            <div className="space-y-2">
                                <div className="h-8 w-3/4 bg-slate-200 rounded"></div>
                                <div className="h-4 w-1/2 bg-slate-200 rounded"></div>
                            </div>
                            <div className="h-2 w-full bg-slate-200 rounded mt-4"></div>
                            <div className="h-10 w-full bg-slate-200 rounded-xl mt-4"></div>
                        </div>
                    ))
                ) : (
                    <>
                        {visibleTournaments.map(t => {
                            // --- LOGIC SECTION ---
                            const config = t.config ? JSON.parse(t.config) : {};
                            const maxTeams = parseInt(String(config.maxTeams || 0));
                            
                            // Fee Calculation: Use specific fee if exists, else fallback to defaultFee (global), else 0
                            const configFee = config.registrationFee;
                            const feeToUse = (configFee !== undefined && configFee !== null && configFee !== '') ? configFee : defaultFee;
                            const regFee = parseInt(String(feeToUse || 0).replace(/,/g, '')) || 0;

                            const objective = config.objective || {};
                            const prizes = config.prizes || [];
                            const deadline = config.registrationDeadline ? new Date(config.registrationDeadline) : null;
                            const isPastDeadline = deadline && new Date() > deadline;

                            // Teams
                            const teamCount = teams.filter(team => (team.tournamentId === t.id || (!team.tournamentId && t.id === 'default')) && team.status !== 'Rejected').length;
                            const approvedTeamCount = teams.filter(team => (team.tournamentId === t.id || (!team.tournamentId && t.id === 'default')) && team.status === 'Approved').length;
                            const percentage = maxTeams > 0 ? Math.min(100, (teamCount / maxTeams) * 100) : 0;

                            // Financials: Income
                            // 1. Fees from Approved Teams
                            const incomeFromFees = approvedTeamCount * regFee;
                            // 2. Verified Donations
                            const tournamentDonations = donations.filter(d => d.tournamentId === t.id && d.status === 'Verified');
                            const totalDonations = tournamentDonations.reduce((sum, d) => sum + Number(d.amount), 0);
                            const totalIncome = incomeFromFees + totalDonations;

                            // Financials: Expenses (Prizes)
                            const totalPrizes = prizes.reduce((sum: number, p: any) => {
                                const amt = parseInt(String(p.amount).replace(/,/g, '')) || 0;
                                return sum + amt;
                            }, 0);

                            // Financials: Net Raised
                            // Formula: (Approved Teams * Fee) + Verified Donations - Total Prizes
                            const netRaised = totalIncome - totalPrizes;
                            const displayNetRaised = Math.max(0, netRaised); 

                            // Goal Progress
                            const goal = parseInt(String(objective.goal || 0).replace(/,/g, ''));
                            const fundProgress = goal > 0 ? Math.min(100, (displayNetRaised / goal) * 100) : 0;

                            // Image Logic - prioritize 'before' image
                            const beforeImage = objective.images?.find((img: any) => img.type === 'before')?.url;

                            return (
                                <div key={t.id} className="relative group perspective-1000 h-full">
                                    <button 
                                        onClick={() => onSelect(t.id)}
                                        className="w-full bg-white rounded-3xl shadow-sm border border-slate-100 hover:shadow-2xl hover:-translate-y-2 hover:border-indigo-200 transition-all duration-300 text-left relative overflow-hidden h-full flex flex-col justify-between group-hover:bg-gradient-to-b from-white to-indigo-50/30 min-h-[300px]"
                                    >
                                        {/* Cover Image Area */}
                                        <div className="relative h-40 w-full bg-slate-100 overflow-hidden shrink-0">
                                            {beforeImage ? (
                                                <>
                                                    <img src={getDisplayUrl(beforeImage)} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
                                                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent"></div>
                                                </>
                                            ) : (
                                                <div className="absolute inset-0 bg-gradient-to-br from-indigo-500 to-purple-600 opacity-90 group-hover:opacity-100 transition-opacity">
                                                    <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-white opacity-10 rounded-full blur-xl"></div>
                                                </div>
                                            )}
                                            
                                            {/* Status Badge Overlay */}
                                            <div className="absolute top-3 left-3 flex gap-2">
                                                <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider shadow-sm flex items-center gap-1 border border-white/20 backdrop-blur-sm ${t.status === 'Active' ? 'bg-green-500/80 text-white' : 'bg-blue-500/80 text-white'}`}>
                                                    <span className={`w-1.5 h-1.5 rounded-full bg-white ${t.status === 'Active' ? 'animate-pulse' : ''}`}></span>
                                                    {t.status}
                                                </span>
                                                <span className="px-2 py-1 bg-black/40 text-white backdrop-blur-md rounded-full text-[10px] font-bold shadow-sm border border-white/10">
                                                    {t.type}
                                                </span>
                                            </div>
                                            
                                            {/* Title Overlay */}
                                            <div className="absolute bottom-3 left-3 right-3 text-white">
                                                <h3 className="font-bold text-lg leading-tight line-clamp-2 drop-shadow-md">{t.name}</h3>
                                            </div>
                                        </div>
                                        
                                        <div className="relative z-10 w-full flex-1 flex flex-col p-4">
                                            
                                            {/* Objective Title */}
                                            {objective.title && objective.isEnabled && (
                                                <p className="text-xs text-slate-500 font-medium mb-3 line-clamp-1 flex items-center gap-1">
                                                    <Target className="w-3 h-3 text-indigo-500"/> {objective.title}
                                                </p>
                                            )}

                                            {/* Fundraising / Financial Logic - Enhanced Breakdown */}
                                            {goal > 0 && (
                                                <div className="mb-4 bg-white/50 p-3 rounded-xl border border-slate-200/60 backdrop-blur-sm">
                                                    <div className="flex justify-between items-center mb-2">
                                                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                                                            <Heart className="w-3 h-3 text-rose-500 fill-rose-500"/> Fund Progress
                                                        </span>
                                                        <span className={`text-xs font-bold ${fundProgress >= 100 ? 'text-green-600' : 'text-indigo-600'}`}>
                                                            {fundProgress.toFixed(0)}%
                                                        </span>
                                                    </div>
                                                    
                                                    {/* Progress Bar */}
                                                    <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden mb-2 shadow-inner">
                                                        <div 
                                                            className={`h-full rounded-full transition-all duration-1000 ${fundProgress >= 100 ? 'bg-gradient-to-r from-green-400 to-emerald-500' : 'bg-gradient-to-r from-rose-400 to-indigo-500'}`} 
                                                            style={{ width: `${fundProgress}%` }}
                                                        ></div>
                                                    </div>

                                                    {/* Detailed Breakdown */}
                                                    <div className="space-y-1">
                                                        <div className="flex justify-between items-center text-[10px] text-slate-600">
                                                            <span className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div> ค่าสมัคร ({approvedTeamCount} ทีม x {regFee})</span>
                                                            <span className="font-mono opacity-80">+{incomeFromFees.toLocaleString()}</span>
                                                        </div>
                                                        <div className="flex justify-between items-center text-[10px] text-slate-600">
                                                            <span className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-blue-400"></div> ยอดบริจาค</span>
                                                            <span className="font-mono opacity-80">+{totalDonations.toLocaleString()}</span>
                                                        </div>
                                                        <div className="flex justify-between items-center text-[10px] text-rose-600">
                                                            <span className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-rose-500"></div> หักเงินรางวัล</span>
                                                            <span className="font-mono opacity-80">-{totalPrizes.toLocaleString()}</span>
                                                        </div>
                                                    </div>

                                                    <div className="mt-2 pt-2 border-t border-slate-200/50 flex justify-between items-end">
                                                        <div className="text-[9px] text-slate-400">เป้าหมาย {goal.toLocaleString()}</div>
                                                        <div className="text-right leading-none">
                                                            <span className="text-[9px] text-slate-400 block mb-0.5">ยอดสุทธิ</span>
                                                            <span className="text-sm font-black text-slate-800">{displayNetRaised.toLocaleString()} <span className="text-[9px] font-normal text-slate-400">บาท</span></span>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Deadline */}
                                            {deadline && (
                                                <div className={`text-xs flex items-center gap-1 mb-2 ${isPastDeadline ? 'text-red-500 font-bold' : 'text-slate-400'}`}>
                                                    <Calendar className="w-3 h-3" />
                                                    {isPastDeadline ? 'ปิดรับสมัครแล้ว' : `ปิดรับ: ${deadline.toLocaleDateString('th-TH')}`}
                                                </div>
                                            )}

                                            {/* Team Stats */}
                                            <div className="mt-auto">
                                                <div className="flex justify-between text-[10px] text-slate-500 mb-1">
                                                    <span>ทีมสมัครแล้ว</span>
                                                    <span className="font-bold">{teamCount} {maxTeams > 0 ? `/ ${maxTeams}` : ''}</span>
                                                </div>
                                                <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                                                    <div 
                                                        className={`h-full rounded-full transition-all duration-1000 ${percentage >= 100 ? 'bg-red-500' : 'bg-green-500'}`} 
                                                        style={{ width: `${maxTeams > 0 ? percentage : (teamCount > 0 ? 100 : 0)}%` }}
                                                    ></div>
                                                </div>
                                            </div>
                                        </div>
                                    </button>
                                    
                                    {/* Share Button */}
                                    <button 
                                        onClick={(e) => handleShare(e, t, teamCount, maxTeams)}
                                        className="absolute bottom-[4.5rem] right-2 bg-white/90 backdrop-blur border border-slate-200 text-slate-400 hover:text-green-600 hover:border-green-300 p-2 rounded-full shadow-sm transition z-20 hover:scale-110 duration-200"
                                        title="แชร์รายการนี้"
                                    >
                                        <Share2 className="w-4 h-4" />
                                    </button>

                                    {/* Admin Config Button */}
                                    {isAdmin && (
                                        <button 
                                            onClick={(e) => openEdit(e, t)}
                                            className="absolute top-2 right-2 bg-white/20 backdrop-blur text-white hover:bg-white hover:text-indigo-600 p-1.5 rounded-full shadow-sm transition z-20 hover:rotate-90 duration-300"
                                            title="ตั้งค่ารายการ"
                                        >
                                            <Settings className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                            );
                        })}

                        {isAdmin && (
                            <button 
                                onClick={() => setIsCreating(true)}
                                className="bg-slate-100 p-6 rounded-3xl border-2 border-dashed border-slate-300 hover:border-indigo-400 hover:bg-indigo-50/50 transition-all flex flex-col items-center justify-center text-slate-400 hover:text-indigo-600 min-h-[300px] group cursor-pointer h-full"
                            >
                                <div className="w-16 h-16 bg-white rounded-full shadow-sm flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
                                    <Plus className="w-8 h-8 text-indigo-400 group-hover:text-indigo-600" />
                                </div>
                                <span className="font-bold text-sm tracking-wide">สร้างรายการใหม่</span>
                            </button>
                        )}
                    </>
                )}
            </div>
        </div>

        {/* Create Modal */}
        {isCreating && (
            <div className="fixed inset-0 z-[1500] bg-black/60 backdrop-blur-md flex items-center justify-center p-4" style={{ fontFamily: "'Kanit', sans-serif" }}>
                <div className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-sm animate-in zoom-in duration-300 border border-white/20 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-indigo-500 to-purple-500"></div>
                    <h3 className="font-black text-2xl text-slate-800 mb-6">สร้างทัวร์นาเมนต์ใหม่</h3>
                    <div className="space-y-5">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">ชื่อรายการแข่งขัน</label>
                            <input 
                                type="text" 
                                value={newTourneyName} 
                                onChange={e => setNewTourneyName(e.target.value)} 
                                className="w-full p-4 border border-slate-200 rounded-xl focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition font-bold text-slate-700 bg-slate-50 focus:bg-white"
                                placeholder="เช่น ฟุตบอลประเพณี 2024"
                                autoFocus
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">รูปแบบการแข่ง</label>
                            <div className="grid grid-cols-2 gap-3">
                                <button onClick={() => setNewTourneyType('Penalty')} className={`p-4 rounded-xl border-2 text-sm font-bold flex flex-col items-center gap-2 transition-all ${newTourneyType === 'Penalty' ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg scale-105' : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-200 hover:bg-slate-50'}`}>
                                    <Target className="w-6 h-6" /> จุดโทษ
                                </button>
                                <button onClick={() => setNewTourneyType('7v7')} className={`p-4 rounded-xl border-2 text-sm font-bold flex flex-col items-center gap-2 transition-all ${newTourneyType === '7v7' ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg scale-105' : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-200 hover:bg-slate-50'}`}>
                                    <Users className="w-6 h-6" /> ฟุตบอล 7 คน
                                </button>
                            </div>
                        </div>
                    </div>
                    <div className="flex gap-3 mt-8">
                        <button onClick={() => setIsCreating(false)} className="flex-1 py-3 border border-slate-200 rounded-xl text-slate-500 hover:bg-slate-50 font-bold transition">ยกเลิก</button>
                        <button onClick={handleCreate} disabled={isSubmitting} className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 flex items-center justify-center gap-2 shadow-lg shadow-indigo-200 transition transform active:scale-95">
                            {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin"/> : 'สร้างเลย'}
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* Edit Modal */}
        {isEditing && editingTournament && (
            <div className="fixed inset-0 z-[1500] bg-black/60 backdrop-blur-md flex items-center justify-center p-4" style={{ fontFamily: "'Kanit', sans-serif" }}>
                <div className="bg-white rounded-3xl shadow-2xl p-0 w-full max-w-2xl animate-in zoom-in duration-300 relative overflow-hidden flex flex-col max-h-[90vh]">
                    {/* Modal Header */}
                    <div className="bg-slate-900 p-6 text-white flex justify-between items-center shrink-0">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-white/10 rounded-lg">
                                <Settings className="w-6 h-6 text-indigo-300" />
                            </div>
                            <div>
                                <h3 className="font-bold text-lg">ตั้งค่าทัวร์นาเมนต์</h3>
                                <p className="text-xs text-slate-400">แก้ไขข้อมูล, กติกา และวัตถุประสงค์</p>
                            </div>
                        </div>
                        <button onClick={() => setIsEditing(false)} className="bg-white/10 hover:bg-white/20 p-2 rounded-full transition"><X className="w-5 h-5"/></button>
                    </div>

                    {/* Navigation Tabs */}
                    <div className="flex border-b border-slate-200 bg-slate-50 overflow-x-auto shrink-0">
                        <button onClick={() => setEditStep('general')} className={`flex-1 py-3 px-4 text-sm font-bold flex items-center justify-center gap-2 whitespace-nowrap ${editStep === 'general' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-white' : 'text-slate-500 hover:bg-slate-100'}`}>
                            <Layout className="w-4 h-4"/> ข้อมูลทั่วไป
                        </button>
                        <button onClick={() => setEditStep('rules')} className={`flex-1 py-3 px-4 text-sm font-bold flex items-center justify-center gap-2 whitespace-nowrap ${editStep === 'rules' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-white' : 'text-slate-500 hover:bg-slate-100'}`}>
                            <Shield className="w-4 h-4"/> กติกา
                        </button>
                        <button onClick={() => setEditStep('location')} className={`flex-1 py-3 px-4 text-sm font-bold flex items-center justify-center gap-2 whitespace-nowrap ${editStep === 'location' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-white' : 'text-slate-500 hover:bg-slate-100'}`}>
                            <MapPin className="w-4 h-4"/> สถานที่/บัญชี
                        </button>
                        <button onClick={() => setEditStep('objective')} className={`flex-1 py-3 px-4 text-sm font-bold flex items-center justify-center gap-2 whitespace-nowrap ${editStep === 'objective' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-white' : 'text-slate-500 hover:bg-slate-100'}`}>
                            <Heart className="w-4 h-4"/> โครงการ
                        </button>
                        <button onClick={() => setEditStep('prizes')} className={`flex-1 py-3 px-4 text-sm font-bold flex items-center justify-center gap-2 whitespace-nowrap ${editStep === 'prizes' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-white' : 'text-slate-500 hover:bg-slate-100'}`}>
                            <Banknote className="w-4 h-4"/> เงินรางวัล
                        </button>
                        <button onClick={() => setEditStep('summary')} className={`flex-1 py-3 px-4 text-sm font-bold flex items-center justify-center gap-2 whitespace-nowrap ${editStep === 'summary' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-white' : 'text-slate-500 hover:bg-slate-100'}`}>
                            <FileCheck className="w-4 h-4"/> ยืนยัน
                        </button>
                    </div>
                    
                    {/* Content Area */}
                    <div className="p-6 overflow-y-auto flex-1 bg-slate-50">
                        {editStep === 'general' && (
                            <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 space-y-4">
                                <h4 className="font-bold text-sm text-slate-400 uppercase tracking-wider mb-2 border-b pb-2">Basic Info</h4>
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 mb-1">ชื่อรายการ</label>
                                    <input 
                                        type="text" 
                                        value={editingTournament.name} 
                                        onChange={e => setEditingTournament({...editingTournament, name: e.target.value})} 
                                        className="w-full p-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 outline-none font-bold"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 mb-1">สถานะ</label>
                                        <select 
                                            value={editingTournament.status}
                                            onChange={e => setEditingTournament({...editingTournament, status: e.target.value as any})}
                                            className="w-full p-3 border border-slate-200 rounded-xl text-sm bg-white"
                                        >
                                            <option value="Active">Active (เปิดใช้งาน)</option>
                                            <option value="Upcoming">Upcoming (เร็วๆนี้)</option>
                                            <option value="Archived">Archived (เก็บถาวร)</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 mb-1">ประเภท</label>
                                        <select 
                                            value={editingTournament.type}
                                            onChange={e => setEditingTournament({...editingTournament, type: e.target.value as any})}
                                            className="w-full p-3 border border-slate-200 rounded-xl text-sm bg-white"
                                        >
                                            <option value="Penalty">Penalty (จุดโทษ)</option>
                                            <option value="7v7">7v7 (ฟุตบอล 7 คน)</option>
                                            <option value="11v11">11v11 (ฟุตบอล 11 คน)</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                        )}

                        {editStep === 'rules' && (
                            <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1 flex items-center gap-1"><Calendar className="w-3 h-3"/> วันปิดรับสมัคร</label>
                                        <input 
                                            type="date" 
                                            value={editConfig.registrationDeadline || ''} 
                                            onChange={e => setEditConfig({...editConfig, registrationDeadline: e.target.value})} 
                                            className="w-full p-2 border border-slate-200 rounded-lg text-sm bg-white"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1 flex items-center gap-1"><Users className="w-3 h-3"/> จำกัดจำนวนทีม</label>
                                        <input 
                                            type="number" 
                                            value={editConfig.maxTeams || ''} 
                                            onChange={e => setEditConfig({...editConfig, maxTeams: parseInt(e.target.value) || 0})} 
                                            className="w-full p-2 border border-slate-200 rounded-lg text-sm bg-white"
                                            placeholder="0 = ไม่จำกัด"
                                        />
                                    </div>
                                </div>

                                {editingTournament.type !== 'Penalty' ? (
                                    <>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className="block text-xs font-bold text-slate-700 mb-1">เวลาแข่งขัน (นาที/ครึ่ง)</label>
                                                <input 
                                                    type="number" 
                                                    value={editConfig.halfTimeDuration || 20} 
                                                    onChange={e => setEditConfig({...editConfig, halfTimeDuration: parseInt(e.target.value)})} 
                                                    className="w-full p-3 border border-slate-200 rounded-xl text-sm text-center font-bold text-indigo-600"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-slate-700 mb-1">ผู้เล่นตัวจริง (คน)</label>
                                                <input 
                                                    type="number" 
                                                    value={editConfig.playersPerTeam || 7} 
                                                    onChange={e => setEditConfig({...editConfig, playersPerTeam: parseInt(e.target.value)})} 
                                                    className="w-full p-3 border border-slate-200 rounded-xl text-sm text-center font-bold text-indigo-600"
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-700 mb-1">จำนวนเปลี่ยนตัวสูงสุด (0 = ไม่จำกัด)</label>
                                            <input 
                                                type="number" 
                                                value={editConfig.maxSubs || 0} 
                                                onChange={e => setEditConfig({...editConfig, maxSubs: parseInt(e.target.value)})} 
                                                className="w-full p-3 border border-slate-200 rounded-xl text-sm"
                                            />
                                        </div>
                                        <label className="flex items-center gap-3 p-3 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50 transition">
                                            <input 
                                                type="checkbox" 
                                                checked={editConfig.extraTime || false}
                                                onChange={e => setEditConfig({...editConfig, extraTime: e.target.checked})}
                                                className="w-5 h-5 rounded border-slate-300 text-indigo-600"
                                            />
                                            <span className="text-sm font-bold text-slate-700">มีการต่อเวลาพิเศษ (Extra Time)</span>
                                        </label>
                                    </>
                                ) : (
                                    <div className="text-center p-4 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                                        <Target className="w-8 h-8 text-slate-300 mx-auto mb-2"/>
                                        <p className="text-xs text-slate-400">โหมดจุดโทษใช้กติกามาตรฐาน FIFA<br/>ไม่มีการตั้งค่าเวลาเพิ่มเติม</p>
                                    </div>
                                )}
                            </div>
                        )}

                        {editStep === 'location' && (
                            <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 space-y-4">
                                <div className="text-xs text-slate-400 mb-2 italic">* เว้นว่างไว้หากต้องการใช้ค่าเริ่มต้นจาก Global Settings</div>
                                
                                <h4 className="font-bold text-sm text-slate-700 flex items-center gap-2 border-b pb-1"><MapPin className="w-4 h-4"/> สถานที่แข่งขัน</h4>
                                <div className="space-y-3">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1">ชื่อสถานที่</label>
                                        <input type="text" className="w-full p-2 border rounded-lg text-sm" placeholder="Default: ใช้ค่าเดิม" value={editConfig.locationName || ''} onChange={e => setEditConfig({...editConfig, locationName: e.target.value})} />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1">Google Maps Link</label>
                                        <input type="text" className="w-full p-2 border rounded-lg text-sm" placeholder="https://maps..." value={editConfig.locationLink || ''} onChange={e => setEditConfig({...editConfig, locationLink: e.target.value})} />
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <input type="number" step="any" className="w-full p-2 border rounded-lg text-sm" placeholder="Lat" value={editConfig.locationLat || ''} onChange={e => setEditConfig({...editConfig, locationLat: parseFloat(e.target.value)})} />
                                        <input type="number" step="any" className="w-full p-2 border rounded-lg text-sm" placeholder="Lng" value={editConfig.locationLng || ''} onChange={e => setEditConfig({...editConfig, locationLng: parseFloat(e.target.value)})} />
                                    </div>
                                </div>

                                <h4 className="font-bold text-sm text-slate-700 flex items-center gap-2 border-b pb-1 pt-4"><CreditCard className="w-4 h-4"/> บัญชีรับโอนเงิน</h4>
                                <div className="space-y-3">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1">ค่าสมัคร (บาท)</label>
                                        <input type="number" className="w-full p-2 border rounded-lg text-sm" placeholder="0" value={editConfig.registrationFee || ''} onChange={e => setEditConfig({...editConfig, registrationFee: parseInt(e.target.value)})} />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1">ชื่อธนาคาร</label>
                                        <input type="text" className="w-full p-2 border rounded-lg text-sm" placeholder="Default: ใช้ค่าเดิม" value={editConfig.bankName || ''} onChange={e => setEditConfig({...editConfig, bankName: e.target.value})} />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1">เลขบัญชี</label>
                                        <input type="text" className="w-full p-2 border rounded-lg text-sm" placeholder="xxx-x-xxxxx-x" value={editConfig.bankAccount || ''} onChange={e => setEditConfig({...editConfig, bankAccount: e.target.value})} />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1">ชื่อบัญชี</label>
                                        <input type="text" className="w-full p-2 border rounded-lg text-sm" placeholder="นาย..." value={editConfig.accountName || ''} onChange={e => setEditConfig({...editConfig, accountName: e.target.value})} />
                                    </div>
                                </div>
                            </div>
                        )}

                        {editStep === 'objective' && (
                            <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 space-y-4">
                                <div className="flex items-center justify-between mb-2">
                                    <h4 className="font-bold text-sm text-slate-400 uppercase tracking-wider">Project & Fundraising</h4>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input type="checkbox" className="sr-only peer" checked={editConfig.objective?.isEnabled || false} onChange={e => setEditConfig(prev => ({...prev, objective: {...(prev.objective || {title:'', description:'', goal:0, images:[]}), isEnabled: e.target.checked}}))} />
                                        <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                                        <span className="ml-2 text-xs font-medium text-gray-900">เปิดใช้งาน</span>
                                    </label>
                                </div>

                                {editConfig.objective?.isEnabled && (
                                    <div className="space-y-4 animate-in fade-in">
                                        <div>
                                            <label className="block text-xs font-bold text-slate-700 mb-1">ชื่อโครงการ</label>
                                            <input type="text" className="w-full p-2 border rounded-lg text-sm" placeholder="เช่น สร้างสนามเด็กเล่น..." value={editConfig.objective.title} onChange={e => setEditConfig({...editConfig, objective: {...editConfig.objective!, title: e.target.value}})} />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-700 mb-1">รายละเอียด</label>
                                            <textarea className="w-full p-2 border rounded-lg text-sm h-24" placeholder="รายละเอียดโครงการ..." value={editConfig.objective.description} onChange={e => setEditConfig({...editConfig, objective: {...editConfig.objective!, description: e.target.value}})}></textarea>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-700 mb-1">เป้าหมายระดมทุน (บาท)</label>
                                            <input type="number" className="w-full p-2 border rounded-lg text-sm" value={editConfig.objective.goal} onChange={e => setEditConfig({...editConfig, objective: {...editConfig.objective!, goal: parseInt(e.target.value)}})} />
                                        </div>
                                        
                                        {/* Document Upload */}
                                        <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                                            <label className="block text-xs font-bold text-slate-700 mb-2 flex items-center gap-1">
                                                <FileText className="w-4 h-4"/> เอกสารรายละเอียดโครงการ (PDF)
                                            </label>
                                            <div className="flex items-center gap-2">
                                                <label className="cursor-pointer bg-white hover:bg-slate-100 p-2 rounded-lg border border-slate-300 text-xs font-bold text-indigo-600 flex items-center gap-2 shadow-sm transition">
                                                    <Upload className="w-3 h-3"/> อัปโหลดไฟล์
                                                    <input type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={handleDocUpload} />
                                                </label>
                                                {editConfig.objective.docUrl ? (
                                                    <div className="text-xs text-green-600 flex items-center gap-1 font-bold">
                                                        <CheckCircle2 className="w-3 h-3"/> มีเอกสารแล้ว
                                                    </div>
                                                ) : (
                                                    <div className="text-xs text-slate-400">ยังไม่มีเอกสาร</div>
                                                )}
                                            </div>
                                        </div>

                                        <div className="border-t pt-4">
                                            <label className="block text-xs font-bold text-slate-700 mb-2">รูปภาพโครงการ (Before / After / General)</label>
                                            <div className="flex gap-2 mb-2">
                                                <label className="flex-1 cursor-pointer bg-slate-100 hover:bg-slate-200 p-2 rounded-lg text-center text-xs text-slate-600 border border-slate-300 border-dashed">
                                                    + เพิ่มรูป (ทั่วไป)
                                                    <input type="file" accept="image/*" className="hidden" onChange={e => handleImageUpload(e, 'general')} />
                                                </label>
                                                <label className="flex-1 cursor-pointer bg-red-50 hover:bg-red-100 p-2 rounded-lg text-center text-xs text-red-600 border border-red-200 border-dashed">
                                                    + รูป Before
                                                    <input type="file" accept="image/*" className="hidden" onChange={e => handleImageUpload(e, 'before')} />
                                                </label>
                                                <label className="flex-1 cursor-pointer bg-green-50 hover:bg-green-100 p-2 rounded-lg text-center text-xs text-green-600 border border-green-200 border-dashed">
                                                    + รูป After
                                                    <input type="file" accept="image/*" className="hidden" onChange={e => handleImageUpload(e, 'after')} />
                                                </label>
                                            </div>
                                            
                                            {/* Image List */}
                                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                                {editConfig.objective.images && editConfig.objective.images.map((img, idx) => (
                                                    <div key={idx} className="relative group aspect-square rounded-lg overflow-hidden border border-slate-200">
                                                        <img src={getDisplayUrl(img.url)} className="w-full h-full object-cover" />
                                                        <div className={`absolute top-0 left-0 px-2 py-0.5 text-[10px] font-bold text-white ${img.type === 'before' ? 'bg-red-500' : img.type === 'after' ? 'bg-green-500' : 'bg-slate-500'}`}>
                                                            {img.type.toUpperCase()}
                                                        </div>
                                                        <button onClick={() => removeImage(img.id)} className="absolute top-1 right-1 bg-black/50 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition">
                                                            <Trash2 className="w-3 h-3" />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {editStep === 'prizes' && (
                            <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 space-y-4">
                                <div className="flex justify-between items-center border-b pb-2">
                                    <h4 className="font-bold text-sm text-slate-700 flex items-center gap-2"><Star className="w-4 h-4 text-yellow-500"/> ตั้งค่าเงินรางวัล</h4>
                                    <button onClick={addPrize} className="text-xs bg-indigo-50 text-indigo-600 px-3 py-1.5 rounded-lg font-bold flex items-center gap-1 hover:bg-indigo-100"><Plus className="w-3 h-3"/> เพิ่มรางวัล</button>
                                </div>
                                <div className="space-y-2">
                                    {editConfig.prizes && editConfig.prizes.length > 0 ? (
                                        editConfig.prizes.map((prize, idx) => (
                                            <div key={prize.id || idx} className="grid grid-cols-12 gap-2 items-center bg-slate-50 p-2 rounded-lg border border-slate-200">
                                                <div className="col-span-3">
                                                    <input type="text" placeholder="อันดับ (เช่น 1, Top Score)" className="w-full p-2 border rounded text-xs" value={prize.rankLabel} onChange={e => updatePrize(prize.id, 'rankLabel', e.target.value)} />
                                                </div>
                                                <div className="col-span-3">
                                                    <input type="text" placeholder="รางวัล (เช่น 5,000)" className="w-full p-2 border rounded text-xs font-bold text-green-700" value={prize.amount} onChange={e => updatePrize(prize.id, 'amount', e.target.value)} />
                                                </div>
                                                <div className="col-span-5">
                                                    <input type="text" placeholder="รายละเอียดเพิ่มเติม" className="w-full p-2 border rounded text-xs" value={prize.description || ''} onChange={e => updatePrize(prize.id, 'description', e.target.value)} />
                                                </div>
                                                <div className="col-span-1 flex justify-center">
                                                    <button onClick={() => removePrize(prize.id)} className="text-red-400 hover:text-red-600 p-1"><Trash2 className="w-4 h-4"/></button>
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="text-center py-8 text-slate-400 text-sm border-2 border-dashed border-slate-200 rounded-xl">ยังไม่มีการตั้งค่ารางวัล</div>
                                    )}
                                </div>
                            </div>
                        )}

                        {editStep === 'summary' && (
                            <div className="space-y-4">
                                <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-5 shadow-sm">
                                    <h4 className="font-bold text-indigo-800 text-sm mb-3 uppercase tracking-wider">สรุปข้อมูล</h4>
                                    <ul className="space-y-2 text-sm text-slate-700">
                                        <li className="flex justify-between"><span>ชื่อ:</span> <span className="font-bold">{editingTournament.name}</span></li>
                                        <li className="flex justify-between"><span>ประเภท:</span> <span className="font-bold">{editingTournament.type}</span></li>
                                        <li className="flex justify-between"><span>ปิดรับสมัคร:</span> <span className="font-bold">{editConfig.registrationDeadline ? new Date(editConfig.registrationDeadline).toLocaleDateString() : '-'}</span></li>
                                        <li className="flex justify-between"><span>จำกัดทีม:</span> <span className="font-bold">{editConfig.maxTeams ? editConfig.maxTeams + ' ทีม' : 'ไม่จำกัด'}</span></li>
                                        <li className="flex justify-between"><span>สถานที่:</span> <span className="font-bold">{editConfig.locationName || 'Global Default'}</span></li>
                                        {editConfig.objective?.isEnabled && (
                                            <li className="flex justify-between border-t pt-2 mt-2">
                                                <span className="flex items-center gap-1 text-pink-600 font-bold"><Heart className="w-3 h-3"/> โครงการ:</span> 
                                                <span className="font-bold">{editConfig.objective.title}</span>
                                            </li>
                                        )}
                                        {editConfig.prizes && editConfig.prizes.length > 0 && (
                                            <li className="flex justify-between border-t pt-2 mt-2">
                                                <span className="flex items-center gap-1 text-yellow-600 font-bold"><Trophy className="w-3 h-3"/> รางวัล:</span>
                                                <span className="font-bold">{editConfig.prizes.length} รายการ</span>
                                            </li>
                                        )}
                                    </ul>
                                </div>
                                <p className="text-center text-xs text-slate-400 bg-yellow-50 text-yellow-700 p-2 rounded-lg border border-yellow-100 flex items-center justify-center gap-1">
                                    <AlertTriangle className="w-3 h-3"/> กรุณาตรวจสอบความถูกต้องก่อนบันทึก
                                </p>
                            </div>
                        )}
                    </div>

                    <div className="p-4 border-t bg-white flex gap-3 shrink-0">
                        <button onClick={handleUpdate} disabled={isSubmitting} className="w-full py-3 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 flex items-center justify-center gap-2 shadow-lg shadow-green-200 transition transform active:scale-95">
                            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin"/> : <><Save className="w-4 h-4"/> ยืนยันบันทึก</>}
                        </button>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};

export default TournamentSelector;