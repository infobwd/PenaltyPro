
import React, { useState, useEffect } from 'react';
import { Contest, ContestEntry, UserProfile } from '../types';
import { fetchContests, submitContestEntry, toggleEntryLike, fileToBase64 } from '../services/sheetService';
import { Camera, Heart, Upload, Loader2, X, Plus, Image as ImageIcon, User, AlertCircle, Check, ArrowLeft, Calendar, Clock } from 'lucide-react';

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
  const [displayedEntries, setDisplayedEntries] = useState<ContestEntry[]>([]);
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
      // Filter out Closed contests from list view only if you want to hide them, but usually displaying history is good.
      // Sorting: Open first, then by date
      const sortedContests = data.contests.sort((a, b) => {
          if (a.status === 'Open' && b.status !== 'Open') return -1;
          if (a.status !== 'Open' && b.status === 'Open') return 1;
          return new Date(b.createdDate).getTime() - new Date(a.createdDate).getTime();
      });
      setContests(sortedContests);
      setAllEntries(data.entries);
      
      // If we are already inside a gallery, refresh its entries
      if (activeContest) {
          const contestEntries = data.entries.filter(e => e.contestId === activeContest.id);
          // Re-apply sorting and pagination logic
          updateDisplayedEntries(contestEntries, sortBy, page);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
      if (activeContest) {
          const contestEntries = allEntries.filter(e => e.contestId === activeContest.id);
          updateDisplayedEntries(contestEntries, sortBy, page);
      }
  }, [activeContest, allEntries, sortBy, page]);

  const updateDisplayedEntries = (entries: ContestEntry[], sort: string, currentPage: number) => {
      let sorted = [...entries];
      if (sort === 'popular') {
          sorted.sort((a, b) => b.likeCount - a.likeCount);
      } else {
          sorted.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      }
      setDisplayedEntries(sorted.slice(0, currentPage * ITEMS_PER_PAGE));
  };

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
      // Catch specific error message from backend
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
      // Revert on error - essentially reload data
      console.error(e);
      loadData();
    }
  };

  // Helper to check if closed
  const isContestClosed = (c: Contest) => {
      if (c.status === 'Closed') return true;
      if (c.closingDate && new Date() > new Date(c.closingDate)) return true;
      return false;
  };

  const userEntriesCount = (contestId: string) => user ? allEntries.filter(e => e.userId === user.userId && e.contestId === contestId).length : 0;

  if (isLoading && contests.length === 0) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  // --- LIST VIEW ---
  if (view === 'list') {
      return (
          <div className="pb-20 max-w-4xl mx-auto p-4 animate-in fade-in">
              <div className="text-center mb-8">
                  <h1 className="text-2xl font-bold text-slate-800 flex items-center justify-center gap-2">
                      <Camera className="w-8 h-8 text-indigo-600" /> กิจกรรมประกวดภาพถ่าย
                  </h1>
                  <p className="text-slate-500">ร่วมสนุกส่งภาพประทับใจ ลุ้นรับรางวัล</p>
              </div>

              {contests.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-48 text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                      <ImageIcon className="w-12 h-12 mb-2 opacity-50" />
                      <p>ยังไม่มีกิจกรรมในขณะนี้</p>
                  </div>
              ) : (
                  <div className="grid gap-4">
                      {contests.map(c => {
                          const closed = isContestClosed(c);
                          const count = allEntries.filter(e => e.contestId === c.id).length;
                          return (
                              <button 
                                  key={c.id} 
                                  onClick={() => handleSelectContest(c)}
                                  className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 hover:shadow-md hover:border-indigo-200 transition text-left group relative overflow-hidden"
                              >
                                  {closed && <div className="absolute top-0 right-0 bg-slate-100 text-slate-500 text-xs px-3 py-1 rounded-bl-xl font-bold z-10">ปิดรับสมัคร</div>}
                                  {!closed && <div className="absolute top-0 right-0 bg-green-100 text-green-700 text-xs px-3 py-1 rounded-bl-xl font-bold z-10 flex items-center gap-1"><span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span> เปิดรับภาพ</div>}
                                  
                                  <h3 className="font-bold text-lg text-slate-800 mb-1 group-hover:text-indigo-600 transition">{c.title}</h3>
                                  <p className="text-sm text-slate-500 line-clamp-2 mb-3">{c.description}</p>
                                  
                                  <div className="flex items-center gap-4 text-xs text-slate-400 border-t pt-3 mt-1">
                                      <span className="flex items-center gap-1"><ImageIcon className="w-3 h-3"/> {count} ภาพ</span>
                                      {c.closingDate && (
                                          <span className={`flex items-center gap-1 ${closed ? 'text-red-400' : 'text-orange-500'}`}>
                                              <Clock className="w-3 h-3"/> ปิด: {new Date(c.closingDate).toLocaleDateString('th-TH', {day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'})}
                                          </span>
                                      )}
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
  const totalEntriesInContest = allEntries.filter(e => e.contestId === activeContest.id).length;

  return (
    <div className="pb-20 max-w-6xl mx-auto p-4 animate-in slide-in-from-right-4 duration-300">
      <button onClick={() => setView('list')} className="mb-4 text-slate-500 hover:text-indigo-600 flex items-center gap-1 text-sm font-bold transition">
          <ArrowLeft className="w-4 h-4"/> กลับหน้ารวมกิจกรรม
      </button>

      {/* Header */}
      <div className="text-center mb-8 relative bg-gradient-to-r from-purple-600 to-indigo-600 rounded-3xl p-8 text-white overflow-hidden shadow-lg">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white opacity-10 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl"></div>
        <h1 className="text-2xl md:text-3xl font-black mb-2 relative z-10">{activeContest.title}</h1>
        <p className="text-indigo-100 max-w-2xl mx-auto relative z-10 text-sm md:text-base mb-4">{activeContest.description}</p>
        
        {isClosed ? (
            <div className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-md px-4 py-2 rounded-full font-bold text-red-100 border border-red-200/30 relative z-10">
                <Clock className="w-4 h-4" /> ปิดรับสมัครแล้ว
            </div>
        ) : (
            user ? (
                <div className="mt-4 flex justify-center relative z-10">
                    {canUpload ? (
                        <button 
                            onClick={() => setIsUploadOpen(true)}
                            className="bg-white text-indigo-600 px-6 py-3 rounded-full font-bold shadow-lg hover:bg-indigo-50 transition flex items-center gap-2 transform hover:scale-105 active:scale-95"
                        >
                            <Camera className="w-5 h-5" /> ส่งภาพเข้าประกวด ({myCount}/5)
                        </button>
                    ) : (
                        <div className="bg-white/20 backdrop-blur-sm px-4 py-2 rounded-full text-xs font-bold border border-white/30 flex items-center gap-2 text-green-100">
                            <Check className="w-4 h-4" /> คุณส่งครบ 5 ภาพแล้ว
                        </div>
                    )}
                </div>
            ) : (
                <div className="mt-4 flex justify-center relative z-10">
                    <button 
                        onClick={onLoginRequest}
                        className="bg-white/20 backdrop-blur-sm hover:bg-white/30 text-white px-6 py-2 rounded-full font-bold border border-white/50 transition"
                    >
                        เข้าสู่ระบบเพื่อส่งภาพ
                    </button>
                </div>
            )
        )}
      </div>

      {/* Toolbar */}
      <div className="flex justify-between items-center mb-6">
        <div className="flex gap-2 bg-slate-100 p-1 rounded-lg">
            <button 
                onClick={() => setSortBy('popular')}
                className={`px-4 py-1.5 rounded-md text-sm font-bold transition ${sortBy === 'popular' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
                ยอดนิยม
            </button>
            <button 
                onClick={() => setSortBy('latest')}
                className={`px-4 py-1.5 rounded-md text-sm font-bold transition ${sortBy === 'latest' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
                ล่าสุด
            </button>
        </div>
        <div className="text-sm text-slate-500 font-medium">
            {totalEntriesInContest} ภาพ
        </div>
      </div>

      {/* Grid */}
      <div className="columns-2 md:columns-3 lg:columns-4 gap-4 space-y-4">
        {displayedEntries.map((entry) => (
            <div key={entry.id} className="break-inside-avoid bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden hover:shadow-md transition group relative">
                <div 
                    className="relative cursor-pointer"
                    onClick={() => setSelectedEntry(entry)}
                >
                    <img src={entry.photoUrl} alt={entry.caption} className="w-full h-auto object-cover" loading="lazy" />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition"></div>
                </div>
                <div className="p-3">
                    <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-2 overflow-hidden">
                            {entry.userPictureUrl ? (
                                <img src={entry.userPictureUrl} className="w-6 h-6 rounded-full object-cover" />
                            ) : (
                                <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center"><User className="w-3 h-3 text-slate-400"/></div>
                            )}
                            <span className="text-xs font-bold text-slate-700 truncate">{entry.userDisplayName}</span>
                        </div>
                    </div>
                    {entry.caption && <p className="text-xs text-slate-600 line-clamp-2 mb-3">{entry.caption}</p>}
                    <div className="flex justify-between items-center border-t border-slate-50 pt-2">
                        <button 
                            onClick={(e) => { e.stopPropagation(); handleLike(entry); }}
                            className={`flex items-center gap-1.5 text-sm font-bold transition ${user && entry.likedBy.includes(user.userId) ? 'text-pink-500' : 'text-slate-400 hover:text-pink-400'}`}
                        >
                            <Heart className={`w-4 h-4 ${user && entry.likedBy.includes(user.userId) ? 'fill-pink-500' : ''}`} />
                            {entry.likeCount}
                        </button>
                        <span className="text-[10px] text-slate-300">{new Date(entry.timestamp).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}</span>
                    </div>
                </div>
            </div>
        ))}
      </div>

      {displayedEntries.length < totalEntriesInContest && (
          <div className="mt-8 text-center">
              <button onClick={handleLoadMore} className="bg-slate-100 hover:bg-slate-200 text-slate-600 px-6 py-2 rounded-full font-bold text-sm transition">
                  โหลดเพิ่มเติม
              </button>
          </div>
      )}

      {totalEntriesInContest === 0 && (
          <div className="text-center py-20 text-slate-400">
              <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Camera className="w-10 h-10 text-slate-300" />
              </div>
              <p>ยังไม่มีภาพส่งเข้าประกวด</p>
              {!isClosed && <p className="text-sm">เป็นคนแรกที่ส่งภาพ!</p>}
          </div>
      )}

      {/* Upload Modal */}
      {isUploadOpen && (
          <div className="fixed inset-0 z-[1500] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden animate-in zoom-in duration-200">
                  <div className="p-4 border-b flex justify-between items-center">
                      <h3 className="font-bold text-lg text-slate-800">ส่งภาพเข้าประกวด</h3>
                      <button onClick={() => setIsUploadOpen(false)}><X className="w-6 h-6 text-slate-400 hover:text-slate-600" /></button>
                  </div>
                  <div className="p-6 space-y-4">
                      <div className="border-2 border-dashed border-slate-300 rounded-xl p-4 text-center hover:bg-slate-50 transition relative min-h-[200px] flex flex-col items-center justify-center">
                          {uploadPreview ? (
                              <div className="relative w-full">
                                  <img src={uploadPreview} className="max-h-64 mx-auto rounded-lg shadow-sm" />
                                  <button onClick={() => {setUploadFile(null); setUploadPreview(null);}} className="absolute -top-2 -right-2 bg-red-500 text-white p-1 rounded-full shadow-md"><X className="w-4 h-4"/></button>
                              </div>
                          ) : (
                              <label className="cursor-pointer flex flex-col items-center w-full h-full justify-center py-8">
                                  <Upload className="w-10 h-10 text-slate-300 mb-2" />
                                  <span className="text-sm font-bold text-slate-600">คลิกเพื่อเลือกรูปภาพ</span>
                                  <span className="text-xs text-slate-400 mt-1">ขนาดไม่เกิน 5MB</span>
                                  <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                              </label>
                          )}
                      </div>
                      <div>
                          <label className="block text-sm font-bold text-slate-700 mb-1">คำบรรยายภาพ (Caption)</label>
                          <textarea 
                              className="w-full p-3 border rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none h-24"
                              placeholder="เขียนคำบรรยายสั้นๆ..."
                              value={uploadCaption}
                              onChange={(e) => setUploadCaption(e.target.value)}
                          ></textarea>
                      </div>
                      <div className="flex gap-2 text-xs text-orange-600 bg-orange-50 p-2 rounded-lg">
                          <AlertCircle className="w-4 h-4 shrink-0" />
                          <span>กรุณาตรวจสอบภาพให้เรียบร้อย ไม่สามารถแก้ไขได้หลังจากส่ง</span>
                      </div>
                      <button 
                          onClick={handleUpload}
                          disabled={!uploadFile || isSubmitting}
                          className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                          {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : 'ส่งภาพประกวด'}
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* View Entry Modal */}
      {selectedEntry && (
          <div className="fixed inset-0 z-[1600] bg-black/90 backdrop-blur-md flex items-center justify-center p-4" onClick={() => setSelectedEntry(null)}>
              <div className="max-w-4xl w-full max-h-[90vh] flex flex-col md:flex-row bg-black rounded-2xl overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
                  <div className="flex-1 bg-black flex items-center justify-center relative">
                      <img src={selectedEntry.photoUrl} className="max-w-full max-h-[60vh] md:max-h-[90vh] object-contain" />
                  </div>
                  <div className="w-full md:w-80 bg-white p-6 flex flex-col">
                      <div className="flex items-center gap-3 mb-4">
                          {selectedEntry.userPictureUrl ? (
                              <img src={selectedEntry.userPictureUrl} className="w-10 h-10 rounded-full object-cover border border-slate-200" />
                          ) : (
                              <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center"><User className="w-5 h-5 text-slate-400"/></div>
                          )}
                          <div>
                              <div className="font-bold text-slate-800 text-sm">{selectedEntry.userDisplayName}</div>
                              <div className="text-xs text-slate-400">{new Date(selectedEntry.timestamp).toLocaleString('th-TH')}</div>
                          </div>
                      </div>
                      
                      <div className="flex-1 overflow-y-auto">
                          <p className="text-slate-600 text-sm whitespace-pre-wrap">{selectedEntry.caption || "ไม่มีคำบรรยาย"}</p>
                      </div>

                      <div className="pt-4 mt-4 border-t border-slate-100">
                          <button 
                              onClick={() => handleLike(selectedEntry)}
                              className={`w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition ${user && selectedEntry.likedBy.includes(user.userId) ? 'bg-pink-50 text-pink-600 border border-pink-200' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                          >
                              <Heart className={`w-5 h-5 ${user && selectedEntry.likedBy.includes(user.userId) ? 'fill-pink-600' : ''}`} />
                              {selectedEntry.likeCount} ถูกใจ
                          </button>
                          <button onClick={() => setSelectedEntry(null)} className="w-full mt-2 py-2 text-slate-400 hover:text-slate-600 text-sm">ปิด</button>
                      </div>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default ContestGallery;
