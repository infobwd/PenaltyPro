
import React, { useState, useEffect, useMemo } from 'react';
import { Contest, ContestEntry, UserProfile } from '../types';
import { fetchContests, submitContestEntry, toggleEntryLike, fileToBase64 } from '../services/sheetService';
import { Camera, Heart, Upload, Loader2, X, Plus, Image as ImageIcon, User, AlertCircle, Check, ArrowLeft, Calendar, Clock, Trophy, Flame, Sparkles } from 'lucide-react';

interface ContestGalleryProps {
  user: UserProfile | null;
  onLoginRequest: () => void;
  showNotification: (title: string, message: string, type: 'success' | 'error' | 'info') => void;
}

const ITEMS_PER_PAGE = 20;

const ContestGallery: React.FC<ContestGalleryProps> = ({ user, onLoginRequest, showNotification }) => {
  const [view, setView] = useState<'list' | 'gallery'>('list');
  const [contests, setContests] = useState<Contest[]>([]);
  const [allEntries, setAllEntries] = useState<ContestEntry[]>([]);
  
  const [activeContest, setActiveContest] = useState<Contest | null>(null);
  const [page, setPage] = useState(1);
  
  const [isLoading, setIsLoading] = useState(true);
  const [sortBy, setSortBy] = useState<'popular' | 'latest'>('popular');
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [uploadCaption, setUploadCaption] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<ContestEntry | null>(null);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const data = await fetchContests();
      // Sort: Open contests first, then by creation date
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

  // Filter and Sort Entries (Memoized for performance)
  const processedEntries = useMemo(() => {
      if (!activeContest) return [];
      const filtered = allEntries.filter(e => e.contestId === activeContest.id);
      
      return filtered.sort((a, b) => {
          if (sortBy === 'popular') {
              // Primary: Likes, Secondary: Timestamp (Newer wins ties)
              if (b.likeCount !== a.likeCount) return b.likeCount - a.likeCount;
              return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
          } else {
              // Latest
              return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
          }
      });
  }, [allEntries, activeContest, sortBy]);

  const displayedEntries = useMemo(() => {
      return processedEntries.slice(0, page * ITEMS_PER_PAGE);
  }, [processedEntries, page]);

  const topThree = useMemo(() => {
      if (!activeContest || sortBy !== 'popular' || processedEntries.length < 3) return [];
      // Only show top 3 if they have at least 1 like
      return processedEntries.slice(0, 3).filter(e => e.likeCount > 0);
  }, [processedEntries, sortBy, activeContest]);

  const handleSelectContest = (contest: Contest) => {
      setActiveContest(contest);
      setView('gallery');
      setPage(1);
      setSortBy('popular');
  };

  const handleLoadMore = () => {
      setPage(prev => prev + 1);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > 5 * 1024 * 1024) {
        showNotification("ไฟล์ใหญ่เกิน", "ขนาดรูปภาพต้องไม่เกิน 5MB", "error");
        return;
      }
      setUploadFile(file);
      setUploadPreview(URL.createObjectURL(file));
    }
  };

  const handleUpload = async () => {
    if (!user || !activeContest || !uploadFile) return;
    setIsSubmitting(true);
    try {
      const base64 = await fileToBase64(uploadFile);
      const success = await submitContestEntry({
        contestId: activeContest.id,
        userId: user.userId,
        userDisplayName: user.displayName,
        userPic: user.pictureUrl || '',
        photoFile: base64,
        caption: uploadCaption
      });

      if (success) {
        showNotification("สำเร็จ", "ส่งภาพประกวดเรียบร้อย", "success");
        setIsUploadOpen(false);
        setUploadFile(null);
        setUploadPreview(null);
        setUploadCaption('');
        loadData(); // Reload to see new entry
      } else {
        showNotification("ผิดพลาด", "ไม่สามารถส่งภาพได้ หรือคุณส่งครบจำนวนแล้ว", "error");
      }
    } catch (e: any) {
      showNotification("ผิดพลาด", e.message || "เกิดข้อผิดพลาดในการเชื่อมต่อ", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLike = async (entry: ContestEntry) => {
    if (!user) {
      onLoginRequest();
      return;
    }
    
    // Optimistic Update
    const isLiked = entry.likedBy.includes(user.userId);
    const newCount = isLiked ? entry.likeCount - 1 : entry.likeCount + 1;
    const newLikedBy = isLiked ? entry.likedBy.filter(id => id !== user.userId) : [...entry.likedBy, user.userId];
    
    // Update local state immediately
    const updatedAll = allEntries.map(e => e.id === entry.id ? { ...e, likeCount: newCount, likedBy: newLikedBy } : e);
    setAllEntries(updatedAll);
    
    if (selectedEntry && selectedEntry.id === entry.id) {
        setSelectedEntry({ ...selectedEntry, likeCount: newCount, likedBy: newLikedBy });
    }

    try {
      await toggleEntryLike(entry.id, user.userId);
    } catch (e) {
      console.error(e);
      // Fallback: reload data if failed
      loadData();
    }
  };

  const isContestClosed = (c: Contest) => {
      if (c.status === 'Closed') return true;
      if (c.closingDate && new Date() > new Date(c.closingDate)) return true;
      return false;
  };

  const userEntriesCount = (contestId: string) => user ? allEntries.filter(e => e.userId === user.userId && e.contestId === contestId).length : 0;

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
                                          <img src={topImage} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
                                      ) : (
                                          <div className="w-full h-full bg-gradient-to-br from-indigo-500 to-purple-500 opacity-80 flex items-center justify-center">
                                              <ImageIcon className="w-12 h-12 text-white/50" />
                                          </div>
                                      )}
                                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
                                      
                                      {/* Status Badge */}
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
                                      
                                      {/* Title overlay */}
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
      {/* Top Navigation */}
      <div className="flex items-center justify-between mb-4">
          <button onClick={() => setView('list')} className="text-slate-500 hover:text-indigo-600 flex items-center gap-2 text-sm font-bold transition bg-white px-4 py-2 rounded-full shadow-sm border border-slate-200">
              <ArrowLeft className="w-4 h-4"/> กิจกรรมทั้งหมด
          </button>
      </div>

      {/* Hero Header */}
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

      {/* Podium Section (Top 3) - Only visible when sorting by Popular */}
      {sortBy === 'popular' && topThree.length > 0 && (
          <div className="mb-10 px-4">
              <h2 className="text-center font-black text-slate-800 mb-6 flex items-center justify-center gap-2 text-xl">
                  <Trophy className="w-6 h-6 text-yellow-500" /> TOP 3 LEADERS
              </h2>
              <div className="flex flex-col md:flex-row items-end justify-center gap-4 md:gap-8 h-auto md:h-64">
                  {/* 2nd Place */}
                  {topThree[1] && (
                      <div className="order-2 md:order-1 flex flex-col items-center w-full md:w-48 animate-in slide-in-from-bottom-8 duration-700 delay-100">
                          <div className="relative w-full aspect-square rounded-2xl overflow-hidden border-4 border-slate-300 shadow-lg mb-2 group cursor-pointer" onClick={() => setSelectedEntry(topThree[1])}>
                              <img src={topThree[1].photoUrl} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                              <div className="absolute top-2 left-2 bg-slate-300 text-slate-700 w-8 h-8 rounded-full flex items-center justify-center font-black text-sm border-2 border-white shadow-sm">2</div>
                              <div className="absolute bottom-0 w-full bg-black/60 backdrop-blur-sm p-2 text-white text-center">
                                  <p className="text-xs font-bold truncate">{topThree[1].userDisplayName}</p>
                                  <p className="text-[10px] flex items-center justify-center gap-1"><Heart className="w-3 h-3 fill-pink-500 text-pink-500"/> {topThree[1].likeCount}</p>
                              </div>
                          </div>
                          <div className="h-16 w-full bg-slate-200 rounded-t-xl hidden md:block opacity-50"></div>
                      </div>
                  )}
                  {/* 1st Place */}
                  {topThree[0] && (
                      <div className="order-1 md:order-2 flex flex-col items-center w-full md:w-56 animate-in slide-in-from-bottom-8 duration-700 z-10 -mt-8 md:mt-0">
                          <div className="relative w-full aspect-square rounded-2xl overflow-hidden border-4 border-yellow-400 shadow-xl shadow-yellow-200 mb-2 group cursor-pointer" onClick={() => setSelectedEntry(topThree[0])}>
                              <img src={topThree[0].photoUrl} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                              <div className="absolute top-2 left-2 bg-yellow-400 text-yellow-900 w-10 h-10 rounded-full flex items-center justify-center font-black text-lg border-2 border-white shadow-sm">1</div>
                              <div className="absolute bottom-0 w-full bg-gradient-to-t from-yellow-900/90 to-transparent p-3 text-white text-center pt-8">
                                  <p className="text-sm font-bold truncate">{topThree[0].userDisplayName}</p>
                                  <p className="text-xs flex items-center justify-center gap-1 font-bold"><Heart className="w-3 h-3 fill-white text-white"/> {topThree[0].likeCount}</p>
                              </div>
                          </div>
                          <div className="h-24 w-full bg-yellow-100 rounded-t-xl hidden md:block opacity-50"></div>
                      </div>
                  )}
                  {/* 3rd Place */}
                  {topThree[2] && (
                      <div className="order-3 flex flex-col items-center w-full md:w-48 animate-in slide-in-from-bottom-8 duration-700 delay-200">
                          <div className="relative w-full aspect-square rounded-2xl overflow-hidden border-4 border-orange-300 shadow-lg mb-2 group cursor-pointer" onClick={() => setSelectedEntry(topThree[2])}>
                              <img src={topThree[2].photoUrl} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
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

      {/* Toolbar */}
      <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4 bg-white p-3 rounded-2xl shadow-sm border border-slate-100 sticky top-2 z-20">
        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-full md:w-auto">
            <button 
                onClick={() => setSortBy('popular')}
                className={`flex-1 md:flex-none px-6 py-2 rounded-lg text-sm font-bold transition flex items-center justify-center gap-2 ${sortBy === 'popular' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
                <Flame className={`w-4 h-4 ${sortBy === 'popular' ? 'fill-orange-500 text-orange-500' : ''}`} /> ยอดนิยม
            </button>
            <button 
                onClick={() => setSortBy('latest')}
                className={`flex-1 md:flex-none px-6 py-2 rounded-lg text-sm font-bold transition flex items-center justify-center gap-2 ${sortBy === 'latest' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
                <Sparkles className={`w-4 h-4 ${sortBy === 'latest' ? 'text-indigo-500' : ''}`} /> ล่าสุด
            </button>
        </div>
        <div className="text-sm font-medium text-slate-500 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
            ทั้งหมด <span className="font-bold text-slate-800">{totalEntriesInContest}</span> ภาพ
        </div>
      </div>

      {/* Masonry Grid */}
      <div className="columns-2 md:columns-3 lg:columns-4 gap-4 space-y-4">
        {displayedEntries.map((entry) => (
            <div key={entry.id} className="break-inside-avoid bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden hover:shadow-lg transition-all duration-300 group relative">
                <div 
                    className="relative cursor-pointer overflow-hidden"
                    onClick={() => setSelectedEntry(entry)}
                >
                    <img src={entry.photoUrl} alt={entry.caption} className="w-full h-auto object-cover transform transition-transform duration-700 group-hover:scale-105" loading="lazy" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-4">
                        <p className="text-white text-xs font-medium line-clamp-2">{entry.caption || "ไม่มีคำบรรยาย"}</p>
                    </div>
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

      {displayedEntries.length < totalEntriesInContest && (
          <div className="mt-12 text-center">
              <button onClick={handleLoadMore} className="bg-white border border-slate-200 text-slate-600 hover:text-indigo-600 hover:border-indigo-200 px-8 py-3 rounded-full font-bold text-sm transition shadow-sm hover:shadow-md">
                  โหลดเพิ่มเติม
              </button>
          </div>
      )}

      {totalEntriesInContest === 0 && (
          <div className="text-center py-24 text-slate-400 bg-slate-50/50 rounded-3xl border-2 border-dashed border-slate-200">
              <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm">
                  <Camera className="w-10 h-10 text-slate-300" />
              </div>
              <h3 className="font-bold text-lg text-slate-600">ยังไม่มีภาพส่งเข้าประกวด</h3>
              {!isClosed && <p className="text-sm mt-1">เป็นคนแรกที่ส่งภาพ!</p>}
          </div>
      )}

      {/* Upload Modal */}
      {isUploadOpen && (
          <div className="fixed inset-0 z-[1500] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden animate-in zoom-in duration-200 shadow-2xl">
                  <div className="p-5 border-b flex justify-between items-center bg-slate-50">
                      <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2"><Camera className="w-5 h-5 text-indigo-600"/> ส่งภาพเข้าประกวด</h3>
                      <button onClick={() => setIsUploadOpen(false)} className="bg-white p-1 rounded-full hover:bg-slate-200 transition"><X className="w-5 h-5 text-slate-500" /></button>
                  </div>
                  <div className="p-6 space-y-5">
                      <div className="border-2 border-dashed border-slate-300 rounded-2xl p-4 text-center hover:bg-slate-50 transition relative min-h-[240px] flex flex-col items-center justify-center bg-slate-50/50 group">
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
                                  <span className="text-xs text-slate-400 mt-1">รองรับ JPG, PNG (Max 5MB)</span>
                                  <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                              </label>
                          )}
                      </div>
                      
                      <div>
                          <label className="block text-xs font-bold text-slate-500 mb-1 ml-1">แคปชั่นโดนๆ (Caption)</label>
                          <textarea 
                              className="w-full p-4 border border-slate-200 rounded-2xl text-sm focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 outline-none resize-none h-28 bg-slate-50 focus:bg-white transition"
                              placeholder="เล่าเรื่องราวของภาพนี้..."
                              value={uploadCaption}
                              onChange={(e) => setUploadCaption(e.target.value)}
                          ></textarea>
                      </div>

                      <div className="flex gap-2 text-xs text-orange-600 bg-orange-50 p-3 rounded-xl border border-orange-100">
                          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                          <span>กรุณาตรวจสอบความถูกต้อง ภาพและข้อความไม่สามารถแก้ไขได้หลังจากส่งเข้าระบบ</span>
                      </div>

                      <button 
                          onClick={handleUpload}
                          disabled={!uploadFile || isSubmitting}
                          className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-indigo-200 active:scale-95"
                      >
                          {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : 'ยืนยันการส่งภาพ'}
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* View Entry Modal (Lightbox Style) */}
      {selectedEntry && (
          <div className="fixed inset-0 z-[2000] bg-black/95 backdrop-blur-md flex items-center justify-center p-0 md:p-4 animate-in fade-in duration-200" onClick={() => setSelectedEntry(null)}>
              <div className="w-full h-full md:max-w-6xl md:h-[90vh] flex flex-col md:flex-row bg-black md:bg-[#1a1a1a] md:rounded-2xl overflow-hidden shadow-2xl relative" onClick={e => e.stopPropagation()}>
                  
                  {/* Close Button Mobile */}
                  <button onClick={() => setSelectedEntry(null)} className="absolute top-4 right-4 md:hidden z-50 bg-black/50 text-white p-2 rounded-full backdrop-blur-md">
                      <X className="w-6 h-6" />
                  </button>

                  {/* Image Section */}
                  <div className="flex-1 bg-black flex items-center justify-center relative group">
                      <img src={selectedEntry.photoUrl} className="max-w-full max-h-[100vh] md:max-h-[90vh] object-contain" />
                  </div>

                  {/* Details Sidebar */}
                  <div className="w-full md:w-96 bg-white flex flex-col border-l border-slate-800 md:relative absolute bottom-0 rounded-t-3xl md:rounded-none h-auto md:h-full max-h-[60vh] md:max-h-full">
                      
                      {/* Desktop Close */}
                      <button onClick={() => setSelectedEntry(null)} className="hidden md:block absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1">
                          <X className="w-6 h-6" />
                      </button>

                      {/* User Info */}
                      <div className="p-5 border-b border-slate-100 flex items-center gap-3">
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
                      
                      {/* Caption */}
                      <div className="flex-1 overflow-y-auto p-5 custom-scrollbar">
                          <p className="text-slate-700 text-sm leading-relaxed whitespace-pre-wrap">{selectedEntry.caption || "ไม่มีคำบรรยาย"}</p>
                      </div>

                      {/* Actions */}
                      <div className="p-5 border-t border-slate-100 bg-slate-50">
                          <div className="flex items-center justify-between mb-4">
                              <div className="flex items-center gap-1">
                                  <Heart className="w-5 h-5 text-pink-500 fill-pink-500" />
                                  <span className="font-bold text-slate-800">{selectedEntry.likeCount}</span>
                                  <span className="text-slate-500 text-sm">คนถูกใจสิ่งนี้</span>
                              </div>
                          </div>
                          
                          <button 
                              onClick={() => handleLike(selectedEntry)}
                              className={`w-full py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 transition active:scale-95 shadow-sm ${user && selectedEntry.likedBy.includes(user.userId) ? 'bg-pink-500 text-white hover:bg-pink-600 shadow-pink-200' : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'}`}
                          >
                              <Heart className={`w-5 h-5 ${user && selectedEntry.likedBy.includes(user.userId) ? 'fill-white' : ''}`} />
                              {user && selectedEntry.likedBy.includes(user.userId) ? 'ถูกใจแล้ว' : 'กดถูกใจ'}
                          </button>
                      </div>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default ContestGallery;
