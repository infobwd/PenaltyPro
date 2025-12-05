
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Contest, ContestEntry, UserProfile, ContestComment } from '../types';
import { fetchContests, submitContestEntry, toggleEntryLike, fileToBase64, deleteContestEntry, fetchContestComments, submitContestComment } from '../services/sheetService';
import { shareContestEntry } from '../services/liffService';
import { Camera, Heart, Upload, Loader2, X, Plus, Image as ImageIcon, User, AlertCircle, Check, ArrowLeft, Calendar, Clock, Trophy, Flame, Sparkles, Trash2, Info, Link, ExternalLink, MessageCircle, Send, Calculator, Share2 } from 'lucide-react';

interface ContestGalleryProps {
  user: UserProfile | null;
  onLoginRequest: () => void;
  showNotification: (title: string, message: string, type: 'success' | 'error' | 'info' | 'warning') => void;
}

const ITEMS_PER_PAGE = 20;

// Shared Compression Logic
const compressImage = async (file: File): Promise<File> => {
    if (file.type === 'application/pdf') return file; 
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target?.result as string;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 1280; // Optimize for mobile viewing
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

const ContestGallery: React.FC<ContestGalleryProps> = ({ user, onLoginRequest, showNotification }) => {
  const [view, setView] = useState<'list' | 'gallery'>('list');
  const [contests, setContests] = useState<Contest[]>([]);
  const [allEntries, setAllEntries] = useState<ContestEntry[]>([]);
  
  const [activeContest, setActiveContest] = useState<Contest | null>(null);
  const [page, setPage] = useState(1);
  
  const [isLoading, setIsLoading] = useState(true);
  const [sortBy, setSortBy] = useState<'popular' | 'latest'>('popular');
  const [filterTab, setFilterTab] = useState<'all' | 'my'>('all'); // NEW: My Photos Tab
  
  // Upload State
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [uploadMode, setUploadMode] = useState<'file' | 'link'>('file');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [externalLink, setExternalLink] = useState('');
  const [uploadCaption, setUploadCaption] = useState('');
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatusText, setUploadStatusText] = useState('');
  
  const [selectedEntry, setSelectedEntry] = useState<ContestEntry | null>(null);
  
  // Custom Delete Modal State
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean, entryId: string | null }>({ isOpen: false, entryId: null });

  // Comment System State
  const [comments, setComments] = useState<ContestComment[]>([]);
  const [isLoadingComments, setIsLoadingComments] = useState(false);
  const [commentInput, setCommentInput] = useState('');
  const [isSendingComment, setIsSendingComment] = useState(false);
  
  // Anti-Bot Challenge
  const [antiBot, setAntiBot] = useState<{ q: string, a: number, userA: string }>({ q: '', a: 0, userA: '' });
  const [isBotVerified, setIsBotVerified] = useState(false);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const data = await fetchContests();
      const sortedContests = data.contests.sort((a, b) => {
          if (a.status === 'Open' && b.status !== 'Open') return -1;
          if (a.status !== 'Open' && b.status === 'Open') return 1;
          return new Date(b.createdDate).getTime() - new Date(a.createdDate).getTime();
      });
      setContests(sortedContests);
      setAllEntries(data.entries);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Fetch comments when opening an entry
  useEffect(() => {
      if (selectedEntry) {
          setIsLoadingComments(true);
          setComments([]); // Clear prev
          generateBotChallenge(); // New challenge per entry view
          fetchContestComments(selectedEntry.id).then(cmts => {
              setComments(cmts.sort((a,b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()));
              setIsLoadingComments(false);
          });
      }
  }, [selectedEntry]);

  const generateBotChallenge = () => {
      const n1 = Math.floor(Math.random() * 10) + 1;
      const n2 = Math.floor(Math.random() * 10) + 1;
      setAntiBot({ q: `${n1} + ${n2} = ?`, a: n1 + n2, userA: '' });
      setIsBotVerified(false);
  };

  const checkBotAnswer = () => {
      if (parseInt(antiBot.userA) === antiBot.a) {
          setIsBotVerified(true);
      } else {
          showNotification("คำตอบผิด", "กรุณาลองใหม่", "error");
          generateBotChallenge();
      }
  };

  const handleSendComment = async () => {
      if (!user || !selectedEntry) return;
      if (!commentInput.trim()) return;
      if (!isBotVerified) {
          showNotification("Anti-Bot", "กรุณาตอบคำถามยืนยันตัวตนก่อน", "warning");
          return;
      }

      setIsSendingComment(true);
      const newComment: ContestComment = {
          id: `TEMP_${Date.now()}`,
          entryId: selectedEntry.id,
          userId: user.userId,
          userDisplayName: user.displayName,
          userPictureUrl: user.pictureUrl,
          message: commentInput,
          timestamp: new Date().toISOString()
      };
      
      // Optimistic Update
      setComments(prev => [...prev, newComment]);
      setCommentInput('');
      // Reset bot check to prevent spam
      generateBotChallenge(); 

      try {
          await submitContestComment({
              entryId: selectedEntry.id,
              userId: user.userId,
              userDisplayName: user.displayName,
              userPic: user.pictureUrl || '',
              message: newComment.message
          });
      } catch (e) {
          showNotification("ผิดพลาด", "ส่งความคิดเห็นไม่สำเร็จ", "error");
      } finally {
          setIsSendingComment(false);
      }
  };

  const processedEntries = useMemo(() => {
      if (!activeContest) return [];
      let filtered = allEntries.filter(e => e.contestId === activeContest.id);
      
      // Filter by Tab
      if (filterTab === 'my') {
          if (user) {
              filtered = filtered.filter(e => e.userId === user.userId);
          } else {
              filtered = []; // No user logged in
          }
      }
      
      return filtered.sort((a, b) => {
          if (sortBy === 'popular') {
              if (b.likeCount !== a.likeCount) return b.likeCount - a.likeCount;
              return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
          } else {
              return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
          }
      });
  }, [allEntries, activeContest, sortBy, filterTab, user]);

  const displayedEntries = useMemo(() => {
      return processedEntries.slice(0, page * ITEMS_PER_PAGE);
  }, [processedEntries, page]);

  const topThree = useMemo(() => {
      // Only show podium in "All" view and "Popular" sort
      if (!activeContest || sortBy !== 'popular' || filterTab !== 'all' || processedEntries.length < 3) return [];
      return processedEntries.slice(0, 3).filter(e => e.likeCount > 0);
  }, [processedEntries, sortBy, activeContest, filterTab]);

  const handleSelectContest = (contest: Contest) => {
      setActiveContest(contest);
      setView('gallery');
      setPage(1);
      setSortBy('popular');
      setFilterTab('all');
  };

  const handleLoadMore = () => {
      setPage(prev => prev + 1);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      // Max raw size check before compression attempt (e.g. 20MB limit to prevent browser crash)
      if (file.size > 20 * 1024 * 1024) {
        showNotification("ไฟล์ใหญ่เกิน", "ขนาดรูปภาพต้นฉบับต้องไม่เกิน 20MB", "error");
        return;
      }
      setUploadFile(file);
      setUploadPreview(URL.createObjectURL(file));
    }
  };

  const handleUpload = async () => {
    if (!user || !activeContest) return;
    
    if (uploadMode === 'file' && !uploadFile) {
        showNotification("ข้อมูลไม่ครบ", "กรุณาเลือกรูปภาพ", "error");
        return;
    }
    if (uploadMode === 'link' && !externalLink) {
        showNotification("ข้อมูลไม่ครบ", "กรุณาวางลิงก์รูปภาพ", "error");
        return;
    }

    setIsSubmitting(true);
    setUploadProgress(0);
    setUploadStatusText("กำลังเตรียมข้อมูล...");

    try {
      let finalPhotoData = "";
      
      if (uploadMode === 'file' && uploadFile) {
          // 1. Compress
          setUploadProgress(20);
          setUploadStatusText("กำลังบีบอัดรูปภาพ...");
          const compressedFile = await compressImage(uploadFile);
          
          // 2. Encode
          setUploadProgress(50);
          setUploadStatusText("กำลังเข้ารหัสข้อมูล...");
          finalPhotoData = await fileToBase64(compressedFile);
      } else {
          finalPhotoData = externalLink;
      }

      // 3. Send
      setUploadProgress(70);
      setUploadStatusText("กำลังส่งข้อมูลไปยังเซิร์ฟเวอร์...");
      
      // Simulate progress for the fetch duration
      const progressInterval = setInterval(() => {
          setUploadProgress(prev => Math.min(prev + 5, 95));
      }, 500);

      const success = await submitContestEntry({
        contestId: activeContest.id,
        userId: user.userId,
        userDisplayName: user.displayName,
        userPic: user.pictureUrl || '',
        photoFile: uploadMode === 'file' ? finalPhotoData : undefined,
        photoUrl: uploadMode === 'link' ? finalPhotoData : undefined,
        caption: uploadCaption
      });

      clearInterval(progressInterval);
      setUploadProgress(100);
      setUploadStatusText("เสร็จสิ้น!");

      if (success) {
        showNotification("สำเร็จ", "ส่งภาพประกวดเรียบร้อย", "success");
        setIsUploadOpen(false);
        setUploadFile(null);
        setUploadPreview(null);
        setExternalLink('');
        setUploadCaption('');
        setUploadMode('file');
        loadData(); 
      } else {
        showNotification("ผิดพลาด", "ไม่สามารถส่งภาพได้ หรือคุณส่งครบจำนวนแล้ว", "error");
      }
    } catch (e: any) {
      showNotification("ผิดพลาด", e.message || "เกิดข้อผิดพลาดในการเชื่อมต่อ", "error");
    } finally {
      setIsSubmitting(false);
      setUploadProgress(0);
    }
  };

  const handleLike = async (entry: ContestEntry) => {
    if (!user) {
      showNotification("แจ้งเตือน", "กรุณาเข้าสู่ระบบก่อนกดถูกใจ", "info");
      onLoginRequest();
      return;
    }
    
    const isLiked = entry.likedBy.includes(user.userId);
    const newCount = isLiked ? entry.likeCount - 1 : entry.likeCount + 1;
    const newLikedBy = isLiked ? entry.likedBy.filter(id => id !== user.userId) : [...entry.likedBy, user.userId];
    
    const updatedAll = allEntries.map(e => e.id === entry.id ? { ...e, likeCount: newCount, likedBy: newLikedBy } : e);
    setAllEntries(updatedAll);
    
    if (selectedEntry && selectedEntry.id === entry.id) {
        setSelectedEntry({ ...selectedEntry, likeCount: newCount, likedBy: newLikedBy });
    }

    try {
      await toggleEntryLike(entry.id, user.userId);
    } catch (e) {
      console.error(e);
      loadData();
    }
  };

  const requestDelete = (entry: ContestEntry) => {
      setDeleteModal({ isOpen: true, entryId: entry.id });
  };

  const confirmDelete = async () => {
      if (!user || !deleteModal.entryId) return;
      const entryId = deleteModal.entryId;
      setDeleteModal({ isOpen: false, entryId: null }); // Close modal first

      setAllEntries(prev => prev.filter(e => e.id !== entryId));
      if (selectedEntry?.id === entryId) setSelectedEntry(null);

      try {
          await deleteContestEntry(entryId, user.userId);
          showNotification("สำเร็จ", "ลบภาพเรียบร้อยแล้ว", "success");
      } catch (e) {
          console.error(e);
          showNotification("ผิดพลาด", "ลบภาพไม่สำเร็จ กรุณาลองใหม่", "error");
          loadData(); 
      }
  };

  const handleShare = () => {
      if (!selectedEntry || !activeContest) return;
      shareContestEntry(selectedEntry, activeContest.title);
  };

  const isContestClosed = (c: Contest) => {
      if (c.status === 'Closed') return true;
      if (c.closingDate && new Date() > new Date(c.closingDate)) return true;
      return false;
  };

  const userEntriesCount = (contestId: string) => user ? allEntries.filter(e => e.userId === user.userId && e.contestId === contestId).length : 0;

  const GalleryImage = ({ src, alt, className }: { src: string, alt?: string, className?: string }) => {
      const [error, setError] = useState(false);
      if (error || !src) {
          return (
              <div className={`flex flex-col items-center justify-center bg-slate-100 text-slate-400 p-4 ${className}`}>
                  <ImageIcon className="w-8 h-8 mb-2 opacity-50" />
                  <span className="text-[10px] text-center font-medium">รูปภาพไม่แสดง</span>
                  <a href={src} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="mt-2 text-[10px] bg-white border border-slate-300 px-2 py-1 rounded-full flex items-center gap-1 hover:text-indigo-600 transition">
                      <ExternalLink className="w-3 h-3"/> ดูต้นฉบับ
                  </a>
              </div>
          );
      }
      return <img src={src} alt={alt} className={className} loading="lazy" onError={() => setError(true)} />;
  };

  if (isLoading && contests.length === 0) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="flex flex-col items-center gap-2">
            <Loader2 className="w-10 h-10 animate-spin text-indigo-500" />
            <span className="text-slate-400 text-sm">กำลังโหลดกิจกรรม...</span>
        </div>
      </div>
    );
  }

  // --- LIST VIEW ---
  if (view === 'list') {
      return (
          <div className="pb-20 max-w-5xl mx-auto p-4 animate-in fade-in">
              <div className="text-center mb-10 mt-4">
                  <h1 className="text-3xl font-black text-slate-800 flex items-center justify-center gap-3 mb-2">
                      <Camera className="w-8 h-8 text-pink-500" /> Photo Contest
                  </h1>
                  <p className="text-slate-500 text-lg">พื้นที่ปล่อยของประลองไอเดีย ลุ้นรางวัลสุดพิเศษ</p>
              </div>

              {contests.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-64 text-slate-400 bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200">
                      <ImageIcon className="w-16 h-16 mb-4 opacity-30" />
                      <p className="font-bold">ยังไม่มีกิจกรรมในขณะนี้</p>
                      <p className="text-sm">โปรดติดตามตอนต่อไป</p>
                  </div>
              ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {contests.map(c => {
                          const closed = isContestClosed(c);
                          const count = allEntries.filter(e => e.contestId === c.id).length;
                          const topImage = allEntries.filter(e => e.contestId === c.id).sort((a,b) => b.likeCount - a.likeCount)[0]?.photoUrl;

                          return (
                              <button 
                                  key={c.id} 
                                  onClick={() => handleSelectContest(c)}
                                  className="bg-white rounded-3xl shadow-sm border border-slate-100 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 text-left group flex flex-col overflow-hidden h-full"
                              >
                                  <div className="h-40 bg-slate-100 relative overflow-hidden">
                                      {topImage ? (
                                          <img src={topImage} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" onError={(e) => e.currentTarget.style.display = 'none'} />
                                      ) : (
                                          <div className="w-full h-full bg-gradient-to-br from-indigo-500 to-purple-500 opacity-80 flex items-center justify-center">
                                              <ImageIcon className="w-12 h-12 text-white/50" />
                                          </div>
                                      )}
                                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
                                      <div className="absolute top-3 right-3">
                                          {closed ? (
                                              <span className="bg-black/60 text-white backdrop-blur-md text-[10px] px-3 py-1 rounded-full font-bold flex items-center gap-1 border border-white/20">
                                                  <Clock className="w-3 h-3"/> ปิดแล้ว
                                              </span>
                                          ) : (
                                              <span className="bg-green-500 text-white text-[10px] px-3 py-1 rounded-full font-bold flex items-center gap-1 shadow-lg animate-pulse">
                                                  <span className="w-1.5 h-1.5 bg-white rounded-full"></span> เปิดรับภาพ
                                              </span>
                                          )}
                                      </div>
                                      <div className="absolute bottom-3 left-4 right-4 text-white">
                                          <h3 className="font-bold text-lg leading-tight line-clamp-1 shadow-black drop-shadow-md">{c.title}</h3>
                                      </div>
                                  </div>
                                  <div className="p-5 flex-1 flex flex-col">
                                      <p className="text-sm text-slate-500 line-clamp-2 mb-4 flex-1">{c.description}</p>
                                      <div className="flex items-center justify-between text-xs text-slate-400 border-t border-slate-50 pt-3">
                                          <span className="flex items-center gap-1 font-medium"><ImageIcon className="w-3 h-3 text-indigo-400"/> {count} รายการ</span>
                                          {c.closingDate && (
                                              <span className="flex items-center gap-1">
                                                  <Calendar className="w-3 h-3"/> {new Date(c.closingDate).toLocaleDateString('th-TH')}
                                              </span>
                                          )}
                                      </div>
                                  </div>
                              </button>
                          );
                      })}
                  </div>
              )}
          </div>
      );
  }

  // --- GALLERY VIEW ---
  if (!activeContest) return null;
  const isClosed = isContestClosed(activeContest);
  const myCount = userEntriesCount(activeContest.id);
  const canUpload = !isClosed && myCount < 5;
  const totalEntriesInContest = processedEntries.length;

  return (
    <div className="pb-20 max-w-7xl mx-auto p-2 md:p-6 animate-in slide-in-from-right-4 duration-300">
      
      {/* HEADER & NAV */}
      <div className="flex items-center justify-between mb-4">
          <button onClick={() => setView('list')} className="text-slate-500 hover:text-indigo-600 flex items-center gap-2 text-sm font-bold transition bg-white px-4 py-2 rounded-full shadow-sm border border-slate-200">
              <ArrowLeft className="w-4 h-4"/> กิจกรรมทั้งหมด
          </button>
      </div>

      <div className="text-center mb-8 relative bg-gradient-to-r from-violet-600 to-indigo-600 rounded-[2rem] p-8 md:p-10 text-white overflow-hidden shadow-xl ring-4 ring-indigo-50">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white opacity-10 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl"></div>
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-pink-500 opacity-20 rounded-full translate-y-1/2 -translate-x-1/2 blur-3xl"></div>
        
        <h1 className="text-2xl md:text-4xl font-black mb-3 relative z-10 drop-shadow-md">{activeContest.title}</h1>
        <p className="text-indigo-100 max-w-2xl mx-auto relative z-10 text-sm md:text-base mb-6 leading-relaxed bg-black/10 backdrop-blur-sm p-4 rounded-xl border border-white/10">
            {activeContest.description}
        </p>
        
        {isClosed ? (
            <div className="inline-flex items-center gap-2 bg-red-500/20 backdrop-blur-md px-5 py-2.5 rounded-full font-bold text-red-100 border border-red-400/30 relative z-10">
                <Clock className="w-4 h-4" /> ปิดรับสมัครแล้ว
            </div>
        ) : (
            <div className="relative z-10">
                {user ? (
                    canUpload ? (
                        <button 
                            onClick={() => setIsUploadOpen(true)}
                            className="bg-white text-indigo-600 px-8 py-3 rounded-full font-bold shadow-lg hover:shadow-xl hover:bg-indigo-50 transition flex items-center gap-2 transform hover:-translate-y-1 mx-auto group"
                        >
                            <Camera className="w-5 h-5 group-hover:scale-110 transition-transform" /> 
                            ส่งภาพเข้าประกวด <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full text-xs ml-1">{myCount}/5</span>
                        </button>
                    ) : (
                        <div className="inline-flex items-center gap-2 bg-green-500/20 backdrop-blur-md px-5 py-2.5 rounded-full font-bold text-green-100 border border-green-400/30">
                            <Check className="w-4 h-4" /> คุณส่งครบจำนวนแล้ว
                        </div>
                    )
                ) : (
                    <button 
                        onClick={onLoginRequest}
                        className="bg-black/20 backdrop-blur-sm hover:bg-black/30 text-white px-8 py-3 rounded-full font-bold border border-white/30 transition hover:border-white/50"
                    >
                        เข้าสู่ระบบเพื่อส่งภาพ
                    </button>
                )}
            </div>
        )}
      </div>

      {/* TABS & FILTERS */}
      <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4 bg-white p-3 rounded-2xl shadow-sm border border-slate-100 sticky top-2 z-20">
        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-full md:w-auto">
            <button 
                onClick={() => setFilterTab('all')}
                className={`flex-1 md:flex-none px-6 py-2 rounded-lg text-sm font-bold transition flex items-center justify-center gap-2 ${filterTab === 'all' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
                ภาพทั้งหมด
            </button>
            <button 
                onClick={() => user ? setFilterTab('my') : onLoginRequest()}
                className={`flex-1 md:flex-none px-6 py-2 rounded-lg text-sm font-bold transition flex items-center justify-center gap-2 ${filterTab === 'my' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
                ภาพของฉัน
            </button>
        </div>

        <div className="flex gap-2 items-center w-full md:w-auto">
            <div className="flex gap-1 bg-slate-100 p-1 rounded-xl flex-1 md:flex-none">
                <button 
                    onClick={() => setSortBy('popular')}
                    className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-2 ${sortBy === 'popular' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    <Flame className={`w-3 h-3 ${sortBy === 'popular' ? 'fill-orange-500 text-orange-500' : ''}`} /> ยอดนิยม
                </button>
                <button 
                    onClick={() => setSortBy('latest')}
                    className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-2 ${sortBy === 'latest' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    <Sparkles className={`w-3 h-3 ${sortBy === 'latest' ? 'text-indigo-500' : ''}`} /> ล่าสุด
                </button>
            </div>
            <div className="text-xs font-medium text-slate-500 bg-slate-50 px-3 py-2 rounded-lg border border-slate-200 hidden md:block">
                {totalEntriesInContest} ภาพ
            </div>
        </div>
      </div>

      {/* TOP 3 PODIUM (Only on 'All' Tab & 'Popular' Sort) */}
      {filterTab === 'all' && sortBy === 'popular' && topThree.length > 0 && (
          <div className="mb-10 px-4">
              <h2 className="text-center font-black text-slate-800 mb-6 flex items-center justify-center gap-2 text-xl">
                  <Trophy className="w-6 h-6 text-yellow-500" /> TOP 3 LEADERS
              </h2>
              <div className="flex flex-col md:flex-row items-end justify-center gap-4 md:gap-8 h-auto md:h-64">
                  {/* 2nd */}
                  {topThree[1] && (
                      <div className="order-2 md:order-1 flex flex-col items-center w-full md:w-48 animate-in slide-in-from-bottom-8 duration-700 delay-100">
                          <div className="relative w-full aspect-square rounded-2xl overflow-hidden border-4 border-slate-300 shadow-lg mb-2 group cursor-pointer" onClick={() => setSelectedEntry(topThree[1])}>
                              <GalleryImage src={topThree[1].photoUrl} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                              <div className="absolute top-2 left-2 bg-slate-300 text-slate-700 w-8 h-8 rounded-full flex items-center justify-center font-black text-sm border-2 border-white shadow-sm">2</div>
                              <div className="absolute bottom-0 w-full bg-black/60 backdrop-blur-sm p-2 text-white text-center">
                                  <p className="text-xs font-bold truncate">{topThree[1].userDisplayName}</p>
                                  <p className="text-[10px] flex items-center justify-center gap-1"><Heart className="w-3 h-3 fill-pink-500 text-pink-500"/> {topThree[1].likeCount}</p>
                              </div>
                          </div>
                          <div className="h-16 w-full bg-slate-200 rounded-t-xl hidden md:block opacity-50"></div>
                      </div>
                  )}
                  {/* 1st */}
                  {topThree[0] && (
                      <div className="order-1 md:order-2 flex flex-col items-center w-full md:w-56 animate-in slide-in-from-bottom-8 duration-700 z-10 -mt-8 md:mt-0">
                          <div className="relative w-full aspect-square rounded-2xl overflow-hidden border-4 border-yellow-400 shadow-xl shadow-yellow-200 mb-2 group cursor-pointer" onClick={() => setSelectedEntry(topThree[0])}>
                              <GalleryImage src={topThree[0].photoUrl} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                              <div className="absolute top-2 left-2 bg-yellow-400 text-yellow-900 w-10 h-10 rounded-full flex items-center justify-center font-black text-lg border-2 border-white shadow-sm">1</div>
                              <div className="absolute bottom-0 w-full bg-gradient-to-t from-yellow-900/90 to-transparent p-3 text-white text-center pt-8">
                                  <p className="text-sm font-bold truncate">{topThree[0].userDisplayName}</p>
                                  <p className="text-xs flex items-center justify-center gap-1 font-bold"><Heart className="w-3 h-3 fill-white text-white"/> {topThree[0].likeCount}</p>
                              </div>
                          </div>
                          <div className="h-24 w-full bg-yellow-100 rounded-t-xl hidden md:block opacity-50"></div>
                      </div>
                  )}
                  {/* 3rd */}
                  {topThree[2] && (
                      <div className="order-3 flex flex-col items-center w-full md:w-48 animate-in slide-in-from-bottom-8 duration-700 delay-200">
                          <div className="relative w-full aspect-square rounded-2xl overflow-hidden border-4 border-orange-300 shadow-lg mb-2 group cursor-pointer" onClick={() => setSelectedEntry(topThree[2])}>
                              <GalleryImage src={topThree[2].photoUrl} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                              <div className="absolute top-2 left-2 bg-orange-300 text-orange-800 w-8 h-8 rounded-full flex items-center justify-center font-black text-sm border-2 border-white shadow-sm">3</div>
                              <div className="absolute bottom-0 w-full bg-black/60 backdrop-blur-sm p-2 text-white text-center">
                                  <p className="text-xs font-bold truncate">{topThree[2].userDisplayName}</p>
                                  <p className="text-xs flex items-center justify-center gap-1"><Heart className="w-3 h-3 fill-pink-500 text-pink-500"/> {topThree[2].likeCount}</p>
                              </div>
                          </div>
                          <div className="h-12 w-full bg-orange-100 rounded-t-xl hidden md:block opacity-50"></div>
                      </div>
                  )}
              </div>
          </div>
      )}

      {/* GRID */}
      {displayedEntries.length === 0 ? (
          <div className="text-center py-24 text-slate-400 bg-slate-50/50 rounded-3xl border-2 border-dashed border-slate-200">
              <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm">
                  <Camera className="w-10 h-10 text-slate-300" />
              </div>
              <h3 className="font-bold text-lg text-slate-600">
                  {filterTab === 'my' ? "คุณยังไม่มีภาพที่ส่งเข้าประกวด" : "ยังไม่มีภาพในรายการนี้"}
              </h3>
              {!isClosed && filterTab === 'my' && <button onClick={() => setIsUploadOpen(true)} className="text-indigo-600 font-bold mt-2 hover:underline">ส่งภาพเลย!</button>}
          </div>
      ) : (
          <div className="columns-2 md:columns-3 lg:columns-4 gap-4 space-y-4">
            {displayedEntries.map((entry) => (
                <div key={entry.id} className="break-inside-avoid bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden hover:shadow-lg transition-all duration-300 group relative">
                    <div 
                        className="relative cursor-pointer overflow-hidden"
                        onClick={() => setSelectedEntry(entry)}
                    >
                        <GalleryImage src={entry.photoUrl} alt={entry.caption} className="w-full h-auto object-cover transform transition-transform duration-700 group-hover:scale-105" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-4">
                            <p className="text-white text-xs font-medium line-clamp-2">{entry.caption || "ไม่มีคำบรรยาย"}</p>
                        </div>
                        {user && (user.userId === entry.userId || user.role === 'admin') && (
                            <button 
                                onClick={(e) => { e.stopPropagation(); requestDelete(entry); }}
                                className="absolute top-2 right-2 bg-red-500 text-white p-2 rounded-full shadow-lg transition hover:bg-red-600 z-20 md:opacity-0 md:group-hover:opacity-100"
                                title="ลบภาพ"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                    
                    <div className="p-3">
                        <div className="flex justify-between items-center mb-2">
                            <div className="flex items-center gap-2 overflow-hidden">
                                {entry.userPictureUrl ? (
                                    <img src={entry.userPictureUrl} className="w-6 h-6 rounded-full object-cover ring-1 ring-slate-100" />
                                ) : (
                                    <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center"><User className="w-3 h-3 text-slate-400"/></div>
                                )}
                                <span className="text-xs font-bold text-slate-700 truncate max-w-[80px]">{entry.userDisplayName}</span>
                            </div>
                            <span className="text-[10px] text-slate-400">{new Date(entry.timestamp).toLocaleDateString('th-TH', { month: 'short', day: 'numeric' })}</span>
                        </div>
                        
                        <button 
                            onClick={(e) => { e.stopPropagation(); handleLike(entry); }}
                            className={`w-full py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition active:scale-95 ${user && entry.likedBy.includes(user.userId) ? 'bg-pink-50 text-pink-600 border border-pink-100' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}
                        >
                            <Heart className={`w-3.5 h-3.5 transition-transform duration-300 ${user && entry.likedBy.includes(user.userId) ? 'fill-pink-500 scale-110' : ''}`} />
                            {entry.likeCount > 0 ? `${entry.likeCount}` : 'ถูกใจ'}
                        </button>
                    </div>
                </div>
            ))}
          </div>
      )}

      {displayedEntries.length < totalEntriesInContest && (
          <div className="mt-12 text-center">
              <button onClick={handleLoadMore} className="bg-white border border-slate-200 text-slate-600 hover:text-indigo-600 hover:border-indigo-200 px-8 py-3 rounded-full font-bold text-sm transition shadow-sm hover:shadow-md">
                  โหลดเพิ่มเติม
              </button>
          </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteModal.isOpen && (
          <div className="fixed inset-0 z-[2200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-xs w-full animate-in zoom-in duration-200 text-center">
                  <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4 border-4 border-red-50">
                      <Trash2 className="w-8 h-8 text-red-500" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-800 mb-2">ลบภาพนี้?</h3>
                  <p className="text-sm text-slate-500 mb-6">คุณแน่ใจหรือไม่ที่จะลบภาพนี้ การกระทำนี้ไม่สามารถย้อนกลับได้</p>
                  <div className="flex gap-3">
                      <button onClick={() => setDeleteModal({ isOpen: false, entryId: null })} className="flex-1 py-2.5 border rounded-xl hover:bg-slate-50 text-slate-600 font-bold transition">ยกเลิก</button>
                      <button onClick={confirmDelete} className="flex-1 py-2.5 bg-red-500 text-white rounded-xl hover:bg-red-600 font-bold shadow-md transition flex items-center justify-center gap-2">
                          ยืนยันลบ
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* Upload Modal */}
      {isUploadOpen && (
          <div className="fixed inset-0 z-[1500] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden animate-in zoom-in duration-200 shadow-2xl relative">
                  
                  {isSubmitting && (
                      <div className="absolute inset-0 z-50 bg-white/95 backdrop-blur-md flex flex-col items-center justify-center p-8">
                          <div className="w-24 h-24 mb-6 relative">
                               <svg className="w-full h-full transform -rotate-90">
                                   <circle cx="48" cy="48" r="40" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-slate-100" />
                                   <circle cx="48" cy="48" r="40" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-indigo-600 transition-all duration-300 ease-out" strokeDasharray={`${uploadProgress * 2.51}, 251.2`} strokeLinecap="round" />
                               </svg>
                               <div className="absolute inset-0 flex items-center justify-center text-xl font-black text-indigo-600">
                                   {Math.round(uploadProgress)}%
                               </div>
                          </div>
                          <h4 className="text-xl font-bold text-slate-800 mb-2 animate-pulse">{uploadStatusText}</h4>
                          <p className="text-sm text-slate-500">ระบบกำลังประมวลผล กรุณารอสักครู่</p>
                      </div>
                  )}

                  <div className="p-5 border-b flex justify-between items-center bg-slate-50">
                      <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2"><Camera className="w-5 h-5 text-indigo-600"/> ส่งภาพเข้าประกวด</h3>
                      <button onClick={() => setIsUploadOpen(false)} className="bg-white p-1 rounded-full hover:bg-slate-200 transition"><X className="w-5 h-5 text-slate-500" /></button>
                  </div>
                  
                  <div className="flex border-b border-slate-200">
                      <button 
                          onClick={() => setUploadMode('file')}
                          className={`flex-1 py-3 text-sm font-bold flex items-center justify-center gap-2 ${uploadMode === 'file' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/50' : 'text-slate-500 hover:bg-slate-50'}`}
                      >
                          <Upload className="w-4 h-4"/> อัปโหลดไฟล์
                      </button>
                      <button 
                          onClick={() => setUploadMode('link')}
                          className={`flex-1 py-3 text-sm font-bold flex items-center justify-center gap-2 ${uploadMode === 'link' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/50' : 'text-slate-500 hover:bg-slate-50'}`}
                      >
                          <Link className="w-4 h-4"/> แนบลิงก์
                      </button>
                  </div>

                  <div className="p-6 space-y-5">
                      {uploadMode === 'file' ? (
                          <div className="border-2 border-dashed border-slate-300 rounded-2xl p-4 text-center hover:bg-slate-50 transition relative min-h-[200px] flex flex-col items-center justify-center bg-slate-50/50 group">
                              {uploadPreview ? (
                                  <div className="relative w-full h-full flex items-center justify-center">
                                      <img src={uploadPreview} className="max-h-60 rounded-lg shadow-sm object-contain" />
                                      <button onClick={() => {setUploadFile(null); setUploadPreview(null);}} className="absolute -top-3 -right-3 bg-red-500 text-white p-1.5 rounded-full shadow-md hover:bg-red-600 transition"><X className="w-4 h-4"/></button>
                                  </div>
                              ) : (
                                  <label className="cursor-pointer flex flex-col items-center w-full h-full justify-center py-8">
                                      <div className="w-16 h-16 bg-white rounded-full shadow-sm flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                                          <Upload className="w-8 h-8 text-indigo-400" />
                                      </div>
                                      <span className="text-sm font-bold text-slate-600">แตะเพื่อเลือกรูปภาพ</span>
                                      <span className="text-xs text-slate-400 mt-1">ระบบจะบีบอัดภาพอัตโนมัติ</span>
                                      <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                                  </label>
                              )}
                          </div>
                      ) : (
                          <div className="space-y-3">
                              <label className="block text-xs font-bold text-slate-500">ลิงก์รูปภาพ (Direct URL) หรือลิงก์จากโซเชียล</label>
                              <div className="relative">
                                  <Link className="absolute left-3 top-3.5 w-4 h-4 text-slate-400" />
                                  <input 
                                      type="text" 
                                      value={externalLink} 
                                      onChange={(e) => setExternalLink(e.target.value)}
                                      className="w-full pl-10 p-3 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                                      placeholder="https://..."
                                  />
                              </div>
                              <p className="text-[10px] text-slate-400 bg-slate-50 p-2 rounded">
                                  หากเป็นลิงก์โพสต์ (เช่น Facebook Post) รูปอาจจะไม่แสดงตัวอย่าง แต่ผู้คนสามารถกดเข้าไปดูได้
                              </p>
                          </div>
                      )}
                      
                      <div>
                          <label className="block text-xs font-bold text-slate-500 mb-1 ml-1">แคปชั่นโดนๆ (Caption)</label>
                          <textarea 
                              className="w-full p-4 border border-slate-200 rounded-2xl text-sm focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 outline-none resize-none h-24 bg-slate-50 focus:bg-white transition"
                              placeholder="เล่าเรื่องราวของภาพนี้..."
                              value={uploadCaption}
                              onChange={(e) => setUploadCaption(e.target.value)}
                          ></textarea>
                      </div>

                      <div className="flex gap-2 text-xs text-orange-600 bg-orange-50 p-3 rounded-xl border border-orange-100">
                          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                          <span>ตรวจสอบความถูกต้อง ภาพและข้อความไม่สามารถแก้ไขได้</span>
                      </div>

                      <button 
                          onClick={handleUpload}
                          disabled={isSubmitting || (uploadMode === 'file' && !uploadFile) || (uploadMode === 'link' && !externalLink)}
                          className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-indigo-200 active:scale-95"
                      >
                          ยืนยันการส่งภาพ
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* View Entry Modal (Lightbox with Comments) */}
      {selectedEntry && (
          <div className="fixed inset-0 z-[2000] bg-black/95 backdrop-blur-md flex items-center justify-center p-0 md:p-4 animate-in fade-in duration-200" onClick={() => setSelectedEntry(null)}>
              <div className="w-full h-full md:max-w-6xl md:h-[90vh] flex flex-col md:flex-row bg-black md:bg-[#1a1a1a] md:rounded-2xl overflow-hidden shadow-2xl relative" onClick={e => e.stopPropagation()}>
                  
                  <button onClick={() => setSelectedEntry(null)} className="absolute top-4 right-4 md:hidden z-50 bg-black/50 text-white p-2 rounded-full backdrop-blur-md">
                      <X className="w-6 h-6" />
                  </button>

                  {/* Left: Image */}
                  <div className="flex-1 bg-black flex items-center justify-center relative group">
                      <GalleryImage src={selectedEntry.photoUrl} className="max-w-full max-h-[100vh] md:max-h-[90vh] object-contain" />
                  </div>

                  {/* Right: Details & Comments */}
                  <div className="w-full md:w-[400px] bg-white flex flex-col border-l border-slate-800 md:relative absolute bottom-0 rounded-t-3xl md:rounded-none h-[60vh] md:h-full shadow-[0_-10px_40px_rgba(0,0,0,0.5)] md:shadow-none">
                      
                      {/* Header Actions */}
                      <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
                          {user && (user.userId === selectedEntry.userId || user.role === 'admin') && (
                              <button onClick={() => requestDelete(selectedEntry)} className="text-red-500 hover:text-red-700 bg-red-50 p-2 rounded-full md:bg-transparent md:p-1 transition" title="ลบภาพ">
                                  <Trash2 className="w-5 h-5" />
                              </button>
                          )}
                          <button onClick={() => setSelectedEntry(null)} className="text-slate-400 hover:text-slate-600 p-1 hidden md:block">
                              <X className="w-6 h-6" />
                          </button>
                      </div>

                      {/* User Info */}
                      <div className="p-5 border-b border-slate-100 flex items-center gap-3 bg-white rounded-t-3xl md:rounded-none relative z-0">
                          {selectedEntry.userPictureUrl ? (
                              <img src={selectedEntry.userPictureUrl} className="w-10 h-10 rounded-full object-cover ring-2 ring-slate-100" />
                          ) : (
                              <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center"><User className="w-5 h-5 text-slate-400"/></div>
                          )}
                          <div>
                              <div className="font-bold text-slate-800 text-sm">{selectedEntry.userDisplayName}</div>
                              <div className="text-xs text-slate-400">{new Date(selectedEntry.timestamp).toLocaleString('th-TH')}</div>
                          </div>
                      </div>
                      
                      {/* Scrollable Content: Caption + Comments */}
                      <div className="flex-1 overflow-y-auto p-5 custom-scrollbar bg-slate-50">
                          {selectedEntry.caption && (
                              <div className="bg-white p-3 rounded-xl border border-slate-100 mb-4 shadow-sm">
                                  <p className="text-slate-700 text-sm leading-relaxed whitespace-pre-wrap">{selectedEntry.caption}</p>
                              </div>
                          )}

                          <div className="mb-2 flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-wider">
                              <MessageCircle className="w-3 h-3"/> ความคิดเห็น ({comments.length})
                          </div>

                          <div className="space-y-3 pb-4">
                              {isLoadingComments ? (
                                  <div className="flex justify-center py-4"><Loader2 className="w-6 h-6 animate-spin text-slate-300"/></div>
                              ) : comments.length === 0 ? (
                                  <p className="text-center text-slate-400 text-xs py-4">ยังไม่มีความคิดเห็น เป็นคนแรกที่แสดงความเห็น!</p>
                              ) : (
                                  comments.map((cmt) => (
                                      <div key={cmt.id} className="flex gap-2">
                                          <div className="shrink-0">
                                              {cmt.userPictureUrl ? <img src={cmt.userPictureUrl} className="w-8 h-8 rounded-full object-cover"/> : <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center"><User className="w-4 h-4 text-slate-400"/></div>}
                                          </div>
                                          <div className="bg-white p-2.5 rounded-2xl rounded-tl-none border border-slate-200 text-sm shadow-sm max-w-[85%]">
                                              <span className="font-bold text-slate-800 block text-xs mb-0.5">{cmt.userDisplayName}</span>
                                              <p className="text-slate-600 leading-snug">{cmt.message}</p>
                                              <span className="text-[9px] text-slate-300 block mt-1">{new Date(cmt.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                                          </div>
                                      </div>
                                  ))
                              )}
                          </div>
                      </div>

                      {/* Footer: Interactions & Comment Input */}
                      <div className="p-4 border-t border-slate-100 bg-white">
                          <div className="flex gap-2 mb-3">
                              <button 
                                  onClick={() => handleLike(selectedEntry)}
                                  className={`flex-1 py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 transition active:scale-95 shadow-sm text-sm ${user && selectedEntry.likedBy.includes(user.userId) ? 'bg-pink-50 text-pink-600 border border-pink-100' : 'bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100'}`}
                              >
                                  <Heart className={`w-4 h-4 ${user && selectedEntry.likedBy.includes(user.userId) ? 'fill-pink-600' : ''}`} />
                                  {selectedEntry.likeCount}
                              </button>
                              <button 
                                  onClick={handleShare}
                                  className="flex-1 py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 transition active:scale-95 shadow-sm text-sm bg-[#06C755] hover:bg-[#05b34c] text-white"
                              >
                                  <Share2 className="w-4 h-4" /> แชร์โหวต
                              </button>
                          </div>

                          {user ? (
                              <div className="relative">
                                  {/* Anti-Bot Challenge Overlay if not verified and focusing */}
                                  {!isBotVerified && commentInput.length > 0 && (
                                      <div className="absolute bottom-full left-0 right-0 mb-2 bg-indigo-600 text-white p-3 rounded-xl shadow-xl animate-in slide-in-from-bottom-2 z-10">
                                          <div className="flex justify-between items-center mb-2">
                                              <span className="text-xs font-bold flex items-center gap-1"><Calculator className="w-3 h-3"/> Security Check</span>
                                              <button onClick={() => setCommentInput('')}><X className="w-3 h-3"/></button>
                                          </div>
                                          <p className="text-sm mb-2 text-center">บวกเลขเพื่อยืนยัน: <span className="font-bold text-lg">{antiBot.q}</span></p>
                                          <div className="flex gap-2">
                                              <input 
                                                  type="number" 
                                                  className="flex-1 rounded-lg text-slate-900 px-2 text-center font-bold outline-none" 
                                                  value={antiBot.userA}
                                                  onChange={e => setAntiBot({...antiBot, userA: e.target.value})}
                                                  placeholder="?"
                                              />
                                              <button onClick={checkBotAnswer} className="bg-white/20 hover:bg-white/30 px-3 rounded-lg font-bold text-xs">OK</button>
                                          </div>
                                      </div>
                                  )}

                                  <div className="flex gap-2">
                                      <input 
                                          type="text" 
                                          value={commentInput}
                                          onChange={e => setCommentInput(e.target.value)}
                                          placeholder="แสดงความคิดเห็น..." 
                                          className="flex-1 bg-slate-100 border-0 rounded-full px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:bg-white transition outline-none"
                                          onFocus={() => { if(!isBotVerified) generateBotChallenge(); }}
                                      />
                                      <button 
                                          onClick={handleSendComment}
                                          disabled={isSendingComment || !commentInput.trim() || !isBotVerified}
                                          className="bg-indigo-600 text-white p-2 rounded-full hover:bg-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                                      >
                                          {isSendingComment ? <Loader2 className="w-5 h-5 animate-spin"/> : <Send className="w-5 h-5" />}
                                      </button>
                                  </div>
                              </div>
                          ) : (
                              <button onClick={onLoginRequest} className="w-full py-2 bg-slate-100 text-slate-500 rounded-full text-xs font-bold hover:bg-slate-200 transition">
                                  เข้าสู่ระบบเพื่อแสดงความคิดเห็น
                              </button>
                          )}
                      </div>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default ContestGallery;
