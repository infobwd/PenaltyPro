
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Match, Team, Standing, Player, KickResult, AppSettings, Prediction, ContestEntry, Sponsor, MusicTrack, TickerMessage } from '../types';
import { Trophy, Clock, Calendar, MapPin, Activity, Award, Megaphone, Monitor, Maximize2, X, ChevronRight, Hand, Sparkles, Camera, Heart, User, QrCode, Settings, Plus, Trash2, Upload, Loader2, Save, Music, Play, Pause, SkipForward, Youtube, Volume2, VolumeX, Star, Zap, Keyboard, Info, Swords, Timer, Lock, Gamepad2, Coins, Cast, Signal, History, GitMerge, CheckCircle2, AlertCircle, Globe, Edit2, AlertTriangle, Layers, LayoutGrid, Type } from 'lucide-react';
import { fetchContests, fetchSponsors, manageSponsor, fileToBase64, fetchMusicTracks, manageMusicTrack, saveSettings, fetchTickerMessages, manageTickerMessage } from '../services/sheetService';

interface LiveWallProps {
  matches: Match[];
  teams: Team[];
  players: Player[];
  config: AppSettings;
  predictions: Prediction[];
  onClose: () => void;
  onRefresh: (silent?: boolean) => void;
  tournamentId?: string; // Added to support filtering
}

// --- UTILS ---

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
                const MAX_WIDTH = 512;
                const scaleSize = MAX_WIDTH / img.width;
                const width = (scaleSize < 1) ? MAX_WIDTH : img.width;
                const height = (scaleSize < 1) ? img.height * scaleSize : img.height;
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx?.drawImage(img, 0, 0, width, height);
                canvas.toBlob((blob) => {
                    if (blob) {
                        const newFile = new File([blob], file.name, { type: 'image/jpeg', lastModified: Date.now() });
                        resolve(newFile);
                    } else reject(new Error('Canvas is empty'));
                }, 'image/jpeg', 0.8);
            };
        };
        reader.onerror = (error) => reject(error);
    });
};

const getEmbedUrl = (url: string, autoplay: boolean = true, muted: boolean = true) => { 
    if (!url) return null; 
    const muteParam = muted ? 1 : 0;
    const autoParam = autoplay ? 1 : 0;

    if (url.includes('youtube.com') || url.includes('youtu.be')) { 
        let videoId = ''; 
        if (url.includes('v=')) videoId = url.split('v=')[1].split('&')[0]; 
        else if (url.includes('youtu.be/')) videoId = url.split('youtu.be/')[1].split('?')[0]; 
        
        if (videoId) return `https://www.youtube.com/embed/${videoId}?autoplay=${autoParam}&mute=${muteParam}&controls=0&showinfo=0&rel=0&loop=1&playlist=${videoId}&playsinline=1`; 
    } 
    if (url.includes('facebook.com')) { 
        const encodedUrl = encodeURIComponent(url); 
        return `https://www.facebook.com/plugins/video.php?href=${encodedUrl}&show_text=false&t=0&autoplay=${autoParam}&mute=${muteParam}`; 
    } 
    return null; 
};

// Animated Counter Component
const NumberCounter = ({ target, duration = 2000 }: { target: number; duration?: number }) => {
    const [count, setCount] = useState(0);
    
    useEffect(() => {
        let startTime: number;
        let animationFrameId: number;
        
        const step = (timestamp: number) => {
            if (!startTime) startTime = timestamp;
            const progress = Math.min((timestamp - startTime) / duration, 1);
            
            if (progress < 1) {
                const randomVal = Math.floor(Math.random() * (Math.max(10, target * 1.5)));
                setCount(randomVal);
                animationFrameId = window.requestAnimationFrame(step);
            } else {
                setCount(target);
            }
        };
        
        setCount(0);
        animationFrameId = window.requestAnimationFrame(step);
        
        return () => window.cancelAnimationFrame(animationFrameId);
    }, [target, duration]);

    return <>{count}</>;
};

// --- CUSTOM CONFIRMATION MODAL ---
interface ConfirmationModalProps {
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    type?: 'danger' | 'info';
    onConfirm: () => void;
    onCancel: () => void;
}

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({ isOpen, title, message, confirmText = "Confirm", cancelText = "Cancel", type = "danger", onConfirm, onCancel }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-[7000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in zoom-in duration-200 cursor-auto" onClick={(e) => e.stopPropagation()}>
            <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full border border-slate-100">
                <div className={`flex items-center gap-3 mb-4 ${type === 'danger' ? 'text-red-600' : 'text-slate-800'}`}>
                    <div className={`p-3 rounded-full ${type === 'danger' ? 'bg-red-50' : 'bg-slate-100'}`}>
                        {type === 'danger' ? <AlertTriangle className="w-6 h-6" /> : <Info className="w-6 h-6" />}
                    </div>
                    <h3 className="font-bold text-lg">{title}</h3>
                </div>
                <p className="text-slate-600 mb-6 text-sm leading-relaxed">{message}</p>
                <div className="flex gap-3">
                    <button onClick={onCancel} className="flex-1 py-2.5 border border-slate-200 rounded-xl font-bold text-slate-500 hover:bg-slate-50 transition text-sm">
                        {cancelText}
                    </button>
                    <button onClick={onConfirm} className={`flex-1 py-2.5 rounded-xl font-bold text-white shadow-lg transition text-sm flex items-center justify-center gap-2 ${type === 'danger' ? 'bg-red-500 hover:bg-red-600 shadow-red-200' : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200'}`}>
                        {confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
};

// --- SETTINGS MODAL ---

const SettingsManagerModal: React.FC<{ 
    isOpen: boolean, 
    onClose: () => void, 
    sponsors: Sponsor[], 
    onUpdateSponsors: () => void, 
    musicTracks: MusicTrack[], 
    onUpdateMusic: () => void, 
    onPlayMusic: (track: MusicTrack) => void,
    tickerMessages: TickerMessage[],
    onUpdateTicker: () => void,
    notify: (msg: string, type: 'success' | 'error') => void,
    tournamentId: string
}> = ({ isOpen, onClose, sponsors, onUpdateSponsors, musicTracks, onUpdateMusic, onPlayMusic, tickerMessages, onUpdateTicker, notify, tournamentId }) => {
    const [tab, setTab] = useState<'sponsors' | 'music' | 'ticker'>('sponsors');
    const [scope, setScope] = useState<'tournament' | 'global'>('tournament'); // Scope Filter
    
    // Add Forms
    const [name, setName] = useState('');
    const [file, setFile] = useState<File | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Music Form
    const [musicName, setMusicName] = useState('');
    const [musicUrl, setMusicUrl] = useState('');
    const [musicType, setMusicType] = useState<'Youtube' | 'Spotify' | 'Suno' | 'Other'>('Youtube');

    // Ticker Form
    const [tickerText, setTickerText] = useState('');

    // Editing State
    const [editingItem, setEditingItem] = useState<{ id: string, name: string, type: 'sponsor' | 'music' | 'ticker' } | null>(null);

    // Confirmation State
    const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean, title: string, message: string, onConfirm: () => void } | null>(null);

    // Auto-detect music type
    useEffect(() => {
        if (musicUrl.includes('youtube') || musicUrl.includes('youtu.be')) setMusicType('Youtube');
        else if (musicUrl.includes('suno.com')) setMusicType('Suno');
        else if (musicUrl.includes('spotify')) setMusicType('Spotify');
        else setMusicType('Other');
    }, [musicUrl]);

    if (!isOpen) return null;

    // Filter Logic
    const filterByScope = (itemType: string | undefined) => {
        if (scope === 'global') {
            return !itemType || !itemType.includes('::');
        } else {
            return itemType && itemType.includes(`::${tournamentId}`);
        }
    };

    const visibleSponsors = sponsors.filter(s => filterByScope(s.type));
    const visibleTracks = musicTracks.filter(m => filterByScope(m.type));
    const visibleTicker = tickerMessages.filter(t => filterByScope(t.type));

    const getScopedType = (baseType: string) => {
        if (scope === 'tournament') return `${baseType}::${tournamentId}`;
        return baseType;
    };

    // --- SPONSOR ACTIONS ---

    const handleAddSponsor = async () => {
        if (!name || !file) return;
        setIsSubmitting(true);
        try {
            const compressed = await compressImage(file);
            const base64 = await fileToBase64(compressed);
            // Append scope to type
            const finalType = getScopedType('Main');
            await manageSponsor({ subAction: 'add', name, logoFile: base64, type: finalType });
            onUpdateSponsors();
            setName('');
            setFile(null);
            notify("Sponsor added successfully", 'success');
        } catch (e) {
            console.error(e);
            notify("Failed to add sponsor", 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const requestDeleteSponsor = (id: string, sponsorName: string) => {
        setConfirmModal({
            isOpen: true,
            title: "Remove Sponsor?",
            message: `Are you sure you want to remove "${sponsorName}"? This cannot be undone.`,
            onConfirm: () => handleDeleteSponsor(id)
        });
    };

    const handleDeleteSponsor = async (id: string) => {
        setConfirmModal(null);
        setIsSubmitting(true);
        try {
            await manageSponsor({ subAction: 'delete', id });
            onUpdateSponsors();
            notify("Sponsor removed", 'success');
        } catch (e) { console.error(e); } finally { setIsSubmitting(false); }
    };

    // --- MUSIC ACTIONS ---

    const handleAddMusic = async () => {
        if (!musicName || !musicUrl) return;
        setIsSubmitting(true);
        try {
            const finalType = getScopedType(musicType);
            await manageMusicTrack({ subAction: 'add', name: musicName, url: musicUrl, type: finalType });
            onUpdateMusic();
            setMusicName('');
            setMusicUrl('');
            notify("Track added successfully", 'success');
        } catch(e) {
            console.error(e);
            notify("Failed to add track", 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const requestDeleteMusic = (id: string, trackName: string) => {
        setConfirmModal({
            isOpen: true,
            title: "Remove Track?",
            message: `Are you sure you want to remove "${trackName}" from the playlist?`,
            onConfirm: () => handleDeleteMusic(id)
        });
    };

    const handleDeleteMusic = async (id: string) => {
        setConfirmModal(null);
        setIsSubmitting(true);
        try {
            await manageMusicTrack({ subAction: 'delete', id });
            onUpdateMusic();
            notify("Track removed", 'success');
        } catch(e) { console.error(e); } finally { setIsSubmitting(false); }
    };

    // --- TICKER ACTIONS ---

    const handleAddTicker = async () => {
        if (!tickerText) return;
        setIsSubmitting(true);
        try {
            const finalType = getScopedType('ticker');
            await manageTickerMessage({ subAction: 'add', message: tickerText, type: finalType, isActive: true });
            onUpdateTicker();
            setTickerText('');
            notify("Message added", 'success');
        } catch(e) {
            console.error(e);
            notify("Failed to add message", 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleToggleTicker = async (id: string, currentStatus: boolean) => {
        // Optimistic UI update
        // (In real app, update local state first)
        await manageTickerMessage({ subAction: 'toggle', id, isActive: !currentStatus });
        onUpdateTicker();
    };

    const handleDeleteTicker = async (id: string) => {
        if (!confirm("Delete this message?")) return;
        setIsSubmitting(true);
        try {
            await manageTickerMessage({ subAction: 'delete', id });
            onUpdateTicker();
        } catch(e) { console.error(e); } finally { setIsSubmitting(false); }
    };

    // --- EDITING ACTIONS ---

    const handleEditSave = async () => {
        if (!editingItem) return;
        setIsSubmitting(true);
        try {
            if (editingItem.type === 'music') {
                await manageMusicTrack({ subAction: 'edit' as any, id: editingItem.id, name: editingItem.name });
                onUpdateMusic();
            } else if (editingItem.type === 'sponsor') {
                await manageSponsor({ subAction: 'edit' as any, id: editingItem.id, name: editingItem.name });
                onUpdateSponsors();
            } else if (editingItem.type === 'ticker') {
                await manageTickerMessage({ subAction: 'edit' as any, id: editingItem.id, message: editingItem.name });
                onUpdateTicker();
            }
            setEditingItem(null);
            notify("Updated successfully", 'success');
        } catch (e) {
            console.error(e);
            notify("Update failed", 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[6000] bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm cursor-auto" onClick={onClose}>
            
            {/* Custom Confirm Modal */}
            {confirmModal && (
                <ConfirmationModal 
                    isOpen={confirmModal.isOpen} 
                    title={confirmModal.title} 
                    message={confirmModal.message} 
                    onConfirm={confirmModal.onConfirm} 
                    onCancel={() => setConfirmModal(null)} 
                />
            )}

            <div className="bg-white rounded-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[85vh] text-slate-800 shadow-2xl animate-in zoom-in duration-200 relative" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="flex justify-between items-center p-5 border-b bg-slate-50">
                    <div>
                        <h3 className="font-bold text-xl flex items-center gap-2 text-slate-800"><Settings className="w-6 h-6 text-indigo-600"/> Live Wall Settings</h3>
                        <p className="text-xs text-slate-500">Manage content for {scope === 'tournament' ? 'current tournament' : 'all events'}</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition"><X className="w-5 h-5"/></button>
                </div>
                
                {/* Scope Filter Tabs */}
                <div className="flex p-2 bg-slate-100 gap-1 mx-4 mt-4 rounded-xl">
                    <button 
                        onClick={() => setScope('tournament')} 
                        className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${scope==='tournament' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        <Trophy className="w-3 h-3"/> Current Tournament
                    </button>
                    <button 
                        onClick={() => setScope('global')} 
                        className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${scope==='global' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        <Globe className="w-3 h-3"/> Global Assets
                    </button>
                </div>

                {/* Main Tabs */}
                <div className="flex border-b border-slate-200 px-4 mt-2 bg-white">
                    <button onClick={() => setTab('sponsors')} className={`flex-1 py-3 font-bold text-sm border-b-2 transition-all ${tab==='sponsors' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>Sponsors</button>
                    <button onClick={() => setTab('music')} className={`flex-1 py-3 font-bold text-sm border-b-2 transition-all ${tab==='music' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>Music</button>
                    <button onClick={() => setTab('ticker')} className={`flex-1 py-3 font-bold text-sm border-b-2 transition-all ${tab==='ticker' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>Ticker</button>
                </div>

                <div className="p-5 overflow-y-auto flex-1 bg-slate-50/50">
                    {/* SPONSORS TAB */}
                    {tab === 'sponsors' && (
                        <div className="space-y-4">
                            {/* Add Sponsor Form */}
                            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                                <h4 className="text-xs font-bold text-slate-400 uppercase mb-3 flex items-center gap-1"><Plus className="w-3 h-3"/> Add {scope === 'tournament' ? 'Tournament' : 'Global'} Sponsor</h4>
                                <div className="space-y-3">
                                    <input type="text" placeholder="Sponsor Name" className="w-full p-3 border rounded-lg text-sm bg-slate-50 focus:bg-white transition outline-none focus:ring-2 focus:ring-indigo-500" value={name} onChange={e => setName(e.target.value)} />
                                    <div className="relative">
                                        <input type="file" accept="image/*" onChange={e => setFile(e.target.files?.[0] || null)} className="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100" />
                                    </div>
                                    <button onClick={handleAddSponsor} disabled={isSubmitting || !name || !file} className="w-full py-2.5 bg-indigo-600 text-white rounded-lg font-bold flex items-center justify-center gap-2 text-sm hover:bg-indigo-700 transition disabled:opacity-50 shadow-md shadow-indigo-200">
                                        {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin"/> : 'Add Sponsor'}
                                    </button>
                                </div>
                            </div>
                            
                            {/* Sponsor List */}
                            <div className="space-y-2">
                                <h4 className="text-xs font-bold text-slate-400 uppercase ml-1">Active List ({visibleSponsors.length})</h4>
                                {visibleSponsors.length === 0 ? <div className="text-center text-slate-400 text-sm py-8 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50">No sponsors in this list.</div> : visibleSponsors.map(s => (
                                    <div key={s.id} className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-100 shadow-sm group hover:border-indigo-200 transition">
                                        <div className="flex items-center gap-3 flex-1">
                                            <div className="w-10 h-10 rounded-lg border bg-slate-50 p-1 flex items-center justify-center"><img src={s.logoUrl} className="max-w-full max-h-full object-contain" /></div>
                                            {editingItem?.id === s.id ? (
                                                <input 
                                                    type="text" 
                                                    value={editingItem.name} 
                                                    onChange={e => setEditingItem({...editingItem, name: e.target.value})}
                                                    className="border border-indigo-300 rounded px-2 py-1 text-sm w-full focus:outline-none focus:ring-2 focus:ring-indigo-200"
                                                    autoFocus
                                                />
                                            ) : (
                                                <span className="font-bold text-sm text-slate-700 truncate">{s.name}</span>
                                            )}
                                        </div>
                                        <div className="flex gap-1">
                                            {editingItem?.id === s.id ? (
                                                <>
                                                    <button onClick={handleEditSave} className="text-green-600 hover:bg-green-50 p-2 rounded-lg transition"><CheckCircle2 className="w-4 h-4"/></button>
                                                    <button onClick={() => setEditingItem(null)} className="text-slate-400 hover:bg-slate-100 p-2 rounded-lg transition"><X className="w-4 h-4"/></button>
                                                </>
                                            ) : (
                                                <>
                                                    <button onClick={() => setEditingItem({id: s.id, name: s.name, type: 'sponsor'})} className="text-slate-400 hover:text-indigo-600 p-2 hover:bg-indigo-50 rounded-lg transition"><Edit2 className="w-4 h-4"/></button>
                                                    <button onClick={() => requestDeleteSponsor(s.id, s.name)} className="text-slate-400 hover:text-red-500 p-2 hover:bg-red-50 rounded-lg transition"><Trash2 className="w-4 h-4"/></button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* MUSIC TAB */}
                    {tab === 'music' && (
                        <div className="space-y-4">
                            {/* Add Music Form */}
                            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                                <h4 className="text-xs font-bold text-slate-400 uppercase mb-3 flex items-center gap-1"><Plus className="w-3 h-3"/> Add {scope === 'tournament' ? 'Tournament' : 'Global'} Track</h4>
                                <div className="space-y-3">
                                    <input type="text" placeholder="Track Name" className="w-full p-3 border rounded-lg text-sm bg-slate-50 focus:bg-white transition outline-none focus:ring-2 focus:ring-indigo-500" value={musicName} onChange={e => setMusicName(e.target.value)} />
                                    <input type="text" placeholder="URL (YouTube / Suno / MP3)" className="w-full p-3 border rounded-lg text-sm bg-slate-50 focus:bg-white transition outline-none focus:ring-2 focus:ring-indigo-500" value={musicUrl} onChange={e => setMusicUrl(e.target.value)} />
                                    <select className="w-full p-3 border rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-indigo-500" value={musicType} onChange={(e:any) => setMusicType(e.target.value)}>
                                        <option value="Youtube">YouTube</option>
                                        <option value="Suno">Suno AI</option>
                                        <option value="Other">Direct File (MP3)</option>
                                    </select>
                                    <button onClick={handleAddMusic} disabled={isSubmitting || !musicName || !musicUrl} className="w-full py-2.5 bg-pink-600 text-white rounded-lg font-bold flex items-center justify-center gap-2 text-sm hover:bg-pink-700 transition disabled:opacity-50 shadow-md shadow-pink-200">
                                        {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin"/> : 'Add Track'}
                                    </button>
                                </div>
                            </div>
                            
                            {/* Music List */}
                            <div className="space-y-2">
                                <h4 className="text-xs font-bold text-slate-400 uppercase ml-1">Playlist ({visibleTracks.length})</h4>
                                {visibleTracks.length === 0 ? <div className="text-center text-slate-400 text-sm py-8 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50">No music tracks.</div> : visibleTracks.map(m => (
                                    <div key={m.id} className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-100 shadow-sm group hover:border-indigo-200 transition">
                                        <div className="flex items-center gap-3 overflow-hidden flex-1">
                                            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                                                {m.type.includes('Youtube') ? <Youtube className="w-4 h-4 text-red-600"/> : m.type.includes('Suno') ? <Sparkles className="w-4 h-4 text-purple-600"/> : <Music className="w-4 h-4 text-blue-500"/>}
                                            </div>
                                            {editingItem?.id === m.id ? (
                                                <input 
                                                    type="text" 
                                                    value={editingItem.name} 
                                                    onChange={e => setEditingItem({...editingItem, name: e.target.value})}
                                                    className="border border-indigo-300 rounded px-2 py-1 text-sm w-full focus:outline-none focus:ring-2 focus:ring-indigo-200"
                                                    autoFocus
                                                />
                                            ) : (
                                                <span className="font-bold text-sm text-slate-700 truncate">{m.name}</span>
                                            )}
                                        </div>
                                        <div className="flex gap-1">
                                            {editingItem?.id === m.id ? (
                                                <>
                                                    <button onClick={handleEditSave} className="text-green-600 hover:bg-green-50 p-2 rounded-lg transition"><CheckCircle2 className="w-4 h-4"/></button>
                                                    <button onClick={() => setEditingItem(null)} className="text-slate-400 hover:bg-slate-100 p-2 rounded-lg transition"><X className="w-4 h-4"/></button>
                                                </>
                                            ) : (
                                                <>
                                                    <button onClick={() => onPlayMusic(m)} className="bg-green-100 text-green-700 px-3 py-1.5 rounded-lg hover:bg-green-200 text-xs font-bold transition mr-1">Play</button>
                                                    <button onClick={() => setEditingItem({id: m.id, name: m.name, type: 'music'})} className="text-slate-400 hover:text-indigo-600 p-2 hover:bg-indigo-50 rounded-lg transition"><Edit2 className="w-4 h-4"/></button>
                                                    <button onClick={() => requestDeleteMusic(m.id, m.name)} className="text-slate-400 hover:text-red-500 p-2 hover:bg-red-50 rounded-lg transition"><Trash2 className="w-4 h-4"/></button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* TICKER TAB */}
                    {tab === 'ticker' && (
                        <div className="space-y-4">
                            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                                <h4 className="text-xs font-bold text-slate-400 uppercase mb-3 flex items-center gap-1"><Type className="w-3 h-3"/> Add {scope === 'tournament' ? 'Tournament' : 'Global'} Message</h4>
                                <div className="space-y-3">
                                    <input type="text" placeholder="Ticker Message..." className="w-full p-3 border rounded-lg text-sm bg-slate-50 focus:bg-white transition outline-none focus:ring-2 focus:ring-indigo-500" value={tickerText} onChange={e => setTickerText(e.target.value)} />
                                    <button onClick={handleAddTicker} disabled={isSubmitting || !tickerText} className="w-full py-2.5 bg-blue-600 text-white rounded-lg font-bold flex items-center justify-center gap-2 text-sm hover:bg-blue-700 transition disabled:opacity-50 shadow-md shadow-blue-200">
                                        {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin"/> : 'Add Message'}
                                    </button>
                                </div>
                            </div>
                            
                            <div className="space-y-2">
                                <h4 className="text-xs font-bold text-slate-400 uppercase ml-1">Messages ({visibleTicker.length})</h4>
                                {visibleTicker.length === 0 ? <div className="text-center text-slate-400 text-sm py-8 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50">No ticker messages.</div> : visibleTicker.map(t => (
                                    <div key={t.id} className={`flex items-center justify-between p-3 bg-white rounded-xl border shadow-sm group transition ${t.isActive ? 'border-green-200' : 'border-slate-100 opacity-60'}`}>
                                        <div className="flex items-center gap-3 overflow-hidden flex-1">
                                            <input type="checkbox" checked={t.isActive} onChange={() => handleToggleTicker(t.id, t.isActive)} className="w-4 h-4 accent-green-600 cursor-pointer" />
                                            {editingItem?.id === t.id ? (
                                                <input 
                                                    type="text" 
                                                    value={editingItem.name} 
                                                    onChange={e => setEditingItem({...editingItem, name: e.target.value})}
                                                    className="border border-indigo-300 rounded px-2 py-1 text-sm w-full focus:outline-none focus:ring-2 focus:ring-indigo-200"
                                                    autoFocus
                                                />
                                            ) : (
                                                <span className="font-bold text-sm text-slate-700 truncate">{t.message}</span>
                                            )}
                                        </div>
                                        <div className="flex gap-1">
                                            {editingItem?.id === t.id ? (
                                                <>
                                                    <button onClick={handleEditSave} className="text-green-600 hover:bg-green-50 p-2 rounded-lg transition"><CheckCircle2 className="w-4 h-4"/></button>
                                                    <button onClick={() => setEditingItem(null)} className="text-slate-400 hover:bg-slate-100 p-2 rounded-lg transition"><X className="w-4 h-4"/></button>
                                                </>
                                            ) : (
                                                <>
                                                    <button onClick={() => setEditingItem({id: t.id, name: t.message, type: 'ticker'})} className="text-slate-400 hover:text-indigo-600 p-2 hover:bg-indigo-50 rounded-lg transition"><Edit2 className="w-4 h-4"/></button>
                                                    <button onClick={() => handleDeleteTicker(t.id)} className="text-slate-400 hover:text-red-500 p-2 hover:bg-red-50 rounded-lg transition"><Trash2 className="w-4 h-4"/></button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const LiveWall: React.FC<LiveWallProps> = ({ matches, teams, players, config, predictions, onClose, onRefresh, tournamentId = 'default' }) => {
  // Auth State
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);

  const [currentSlide, setCurrentSlide] = useState(0);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [standingsPage, setStandingsPage] = useState(0);
  const [contestEntries, setContestEntries] = useState<ContestEntry[]>([]);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [uiScale, setUiScale] = useState(1);
  const [countdown, setCountdown] = useState<string>('');
  
  // Notification State
  const [toasts, setToasts] = useState<Array<{id: number, msg: string, type: 'success' | 'error'}>>([]);

  // Video State
  const [videoPlaying, setVideoPlaying] = useState(true);
  const [videoMuted, setVideoMuted] = useState(true);
  
  // Sponsors & Tickers
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  const [tickerMessages, setTickerMessages] = useState<TickerMessage[]>([]);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Music System
  const [musicTracks, setMusicTracks] = useState<MusicTrack[]>([]);
  const [currentTrack, setCurrentTrack] = useState<MusicTrack | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  
  const audioRef = useRef<HTMLAudioElement>(null);
  
  // Slides Configuration
  const slides = [
      'Matches', 'Standings', 'Bracket', 'Results', 'TopScorers', 'TopKeepers', 'FanPrediction', 'Highlights', 'Sponsors', 'Versus', 'LiveStream'
  ];
  const totalSlides = slides.length;

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
      const id = Date.now();
      setToasts(prev => [...prev, { id, msg, type }]);
      setTimeout(() => {
          setToasts(prev => prev.filter(t => t.id !== id));
      }, 3000);
  };

  // New Wave Gradient Background Logic
  const getGradientColors = (index: number) => {
      switch (index) {
          case 0: return 'from-blue-900 via-indigo-950 to-slate-950'; // Matches
          case 1: return 'from-indigo-900 via-purple-950 to-slate-950'; // Standings
          case 2: return 'from-slate-800 via-zinc-900 to-black'; // Bracket
          case 3: return 'from-emerald-900 via-green-950 to-slate-950'; // Results
          case 4: return 'from-amber-900 via-orange-950 to-slate-950'; // Top Scorers
          case 5: return 'from-cyan-900 via-blue-950 to-slate-950'; // Keepers
          case 6: return 'from-fuchsia-900 via-pink-950 to-slate-950'; // Fan
          case 7: return 'from-rose-900 via-red-950 to-slate-950'; // Highlights
          case 8: return 'from-slate-800 via-gray-900 to-black'; // Sponsors
          case 9: return 'from-red-900 via-orange-900 to-slate-950'; // Versus
          case 10: return 'from-black via-slate-950 to-black'; // Stream (Darker for video)
          default: return 'from-slate-900 via-slate-950 to-black';
      }
  };

  // TICKER CONTENT LOGIC: Use Sheet Ticker if available, else Config
  const announcements = useMemo(() => {
      // Filter active tickers for current scope
      const activeTickers = tickerMessages.filter(t => t.isActive && (!t.type || !t.type.includes('::') || t.type.includes(`::${tournamentId}`)));
      
      if (activeTickers.length > 0) {
          return activeTickers.map(t => t.message);
      }
      return config.announcement ? config.announcement.split('|').filter(s => s.trim() !== '') : [];
  }, [tickerMessages, config.announcement, tournamentId]);

  const currentUrl = window.location.href.split('?')[0];

  const loadExtras = async () => {
      try {
          const [contestData, sponsorData, musicData, tickerData] = await Promise.all([
              fetchContests(),
              fetchSponsors(),
              fetchMusicTracks(),
              fetchTickerMessages()
          ]);
          const uniquePhotos = contestData.entries.filter((e, i, a) => a.findIndex(t => t.photoUrl === e.photoUrl) === i);
          setContestEntries(uniquePhotos);
          
          // Filter Sponsors and Music for Display (Include Global AND Tournament Specific)
          const filterForDisplay = (itemType: string | undefined) => {
              if (!itemType || !itemType.includes('::')) return true; // Global
              return itemType.includes(`::${tournamentId}`); // Tournament specific
          };

          setSponsors(sponsorData.filter(s => filterForDisplay(s.type)));
          setMusicTracks(musicData.filter(m => filterForDisplay(m.type)));
          setTickerMessages(tickerData); // Ticker data filtered in useMemo
      } catch (e) {
          console.error("Failed to load live wall extras");
      }
  };

  useEffect(() => {
      if (isAuthenticated) {
          loadExtras();
          // Responsive Scaling Logic
          const handleResize = () => {
              const width = window.innerWidth;
              const newScale = Math.max(1, width / 1920);
              setUiScale(newScale);
          };
          
          window.addEventListener('resize', handleResize);
          handleResize(); // Init
          
          return () => window.removeEventListener('resize', handleResize);
      }
  }, [isAuthenticated]);

  // --- AUDIO LOGIC ---
  const handlePlayMusic = (track: MusicTrack) => {
      setCurrentTrack(track);
      setIsPlaying(true);
      setIsMuted(false); 
      showToast(`Now Playing: ${track.name}`, 'success');
  };

  const togglePlayback = () => {
      setIsPlaying(!isPlaying);
  };

  const handleNextTrack = () => {
      if (musicTracks.length === 0) return;
      let nextIdx = 0;
      if (currentTrack) {
          const idx = musicTracks.findIndex(t => t.id === currentTrack.id);
          nextIdx = (idx + 1) % musicTracks.length;
      }
      handlePlayMusic(musicTracks[nextIdx]);
  };

  const toggleMute = () => {
      setIsMuted(!isMuted);
  };

  const enterFullScreen = () => {
      if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(err => {
              console.log(`Error attempting to enable fullscreen: ${err.message}`);
          });
      } else {
          if (document.exitFullscreen) {
              document.exitFullscreen();
          }
      }
  };

  // --- KEYBOARD SHORTCUTS ---
  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;

          switch(e.code) {
              case 'Space':
                  e.preventDefault();
                  togglePlayback();
                  break;
              case 'ArrowRight':
              case 'KeyN':
                  handleNextTrack();
                  break;
              case 'KeyM':
                  toggleMute();
                  break;
              case 'KeyF':
                  enterFullScreen();
                  break;
              case 'KeyS':
                  setIsSettingsOpen(prev => !prev);
                  break;
              case 'Escape':
                  onClose();
                  break;
              case 'ArrowLeft':
                  setCurrentSlide(prev => (prev - 1 + totalSlides) % totalSlides);
                  break;
              case 'ArrowUp':
              case 'ArrowDown':
                  setCurrentSlide(prev => (prev + 1) % totalSlides);
                  break;
          }
      };

      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentTrack, isPlaying, musicTracks, isMuted, totalSlides, onClose]);

  const handlePinSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      const correctPin = config.adminPin || "1234";
      if (pinInput.trim() === correctPin) {
          setIsAuthenticated(true);
          setPinError(false);
      } else {
          setPinError(true);
          setPinInput('');
      }
  };

  const handleStartExperience = () => {
      setHasInteracted(true);
      
      // Auto-play music if playlist exists
      if (musicTracks.length > 0 && !currentTrack) {
          const startIdx = Math.floor(Math.random() * musicTracks.length);
          handlePlayMusic(musicTracks[startIdx]);
      } else if (currentTrack) {
          setIsPlaying(true);
      }
      
      if (audioRef.current) {
          audioRef.current.play().catch(e => console.log("Audio play caught", e));
      }
  };

  const resolveTeam = (t: string | Team) => typeof t === 'string' ? (teams.find(x => x.name === t) || {name: t, logoUrl:''} as Team) : t;

  // --- DATA PROCESSING MEMOS ---
  const upcomingMatches = useMemo(() => {
      const live = matches.filter(m => m.livestreamUrl && !m.winner);
      const scheduled = matches
        .filter(m => !m.winner && !m.livestreamUrl)
        .sort((a, b) => new Date(a.scheduledTime || a.date).getTime() - new Date(b.scheduledTime || b.date).getTime());
      return [...live, ...scheduled];
  }, [matches]);

  const liveStreamingMatches = useMemo(() => {
      // Prioritize LIVE, then finished matches with video
      const live = matches.filter(m => m.livestreamUrl && !m.winner);
      if (live.length > 0) return live;
      return matches.filter(m => m.livestreamUrl && m.winner).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [matches]);

  // Force mute when entering Live Stream Slide (Slide 10)
  useEffect(() => {
      if (currentSlide === 10) {
          setVideoMuted(true); // Always start muted
          setVideoPlaying(true);
      }
  }, [currentSlide]);

  const nextMatch = upcomingMatches.length > 0 ? upcomingMatches[0] : null;

  const h2hStats = useMemo(() => {
      if (!nextMatch) return null;
      const tA_Name = typeof nextMatch.teamA === 'string' ? nextMatch.teamA : nextMatch.teamA.name;
      const tB_Name = typeof nextMatch.teamB === 'string' ? nextMatch.teamB : nextMatch.teamB.name;
      
      const finished = matches.filter(m => m.winner);
      let winsA = 0;
      let winsB = 0;
      let draws = 0;
      
      finished.forEach(m => {
          const matchA = typeof m.teamA === 'string' ? m.teamA : m.teamA.name;
          const matchB = typeof m.teamB === 'string' ? m.teamB : m.teamB.name;
          
          if ((matchA === tA_Name && matchB === tB_Name) || (matchA === tB_Name && matchB === tA_Name)) {
              if (m.winner === 'A' || m.winner === matchA) {
                  if (matchA === tA_Name) winsA++; else winsB++;
              } else if (m.winner === 'B' || m.winner === matchB) {
                  if (matchB === tB_Name) winsB++; else winsA++;
              } else {
                  draws++;
              }
          }
      });
      return { winsA, winsB, draws };
  }, [nextMatch, matches]);

  useEffect(() => {
      if (!nextMatch || !nextMatch.scheduledTime) {
          setCountdown('');
          return;
      }
      const target = new Date(nextMatch.scheduledTime).getTime();
      const interval = setInterval(() => {
          const now = new Date().getTime();
          const dist = target - now;
          if (dist < 0) {
              setCountdown('LIVE NOW');
          } else {
              const h = Math.floor((dist % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
              const m = Math.floor((dist % (1000 * 60 * 60)) / (1000 * 60));
              const s = Math.floor((dist % (1000 * 60)) / 1000);
              setCountdown(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
          }
      }, 1000);
      return () => clearInterval(interval);
  }, [nextMatch]);

  const recentResults = useMemo(() => {
      return matches
        .filter(m => m.winner)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 6);
  }, [matches]);

  const standingsGroups = useMemo(() => {
      const map: Record<string, Standing> = {};
      teams.forEach(t => {
          if(t.status === 'Approved') {
              map[t.name] = { teamId: t.id, teamName: t.name, logoUrl: t.logoUrl, group: t.group || 'A', played: 0, won: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0 };
          }
      });
      matches.forEach(m => {
          if (!m.winner || !m.roundLabel?.match(/group|กลุ่ม/i)) return;
          const tA = map[typeof m.teamA === 'string' ? m.teamA : m.teamA.name];
          const tB = map[typeof m.teamB === 'string' ? m.teamB : m.teamB.name];
          if (tA && tB) {
              tA.played++; tB.played++;
              tA.goalsFor += m.scoreA; tA.goalsAgainst += m.scoreB;
              tB.goalsFor += m.scoreB; tB.goalsAgainst += m.scoreA;
              if (m.winner === 'A' || m.winner === tA.teamName) { tA.won++; tA.points += 3; tB.lost++; }
              else if (m.winner === 'B' || m.winner === tB.teamName) { tB.won++; tB.points += 3; tA.lost++; }
              else { tA.points++; tB.points++; }
          }
      });
      const groups: Record<string, Standing[]> = {};
      Object.values(map).forEach(s => {
          if (!groups[s.group]) groups[s.group] = [];
          groups[s.group].push(s);
      });
      const sortedKeys = Object.keys(groups).sort();
      sortedKeys.forEach(k => {
          groups[k].sort((a,b) => b.points - a.points || (b.goalsFor-b.goalsAgainst) - (a.goalsFor-a.goalsAgainst) || b.goalsFor - a.goalsFor);
      });
      const chunkSize = 4;
      const pages = [];
      for (let i = 0; i < sortedKeys.length; i += chunkSize) {
          const groupKeys = sortedKeys.slice(i, i + chunkSize);
          pages.push(groupKeys.map(k => ({ name: k, teams: groups[k] })));
      }
      return pages;
  }, [matches, teams]);

  const topScorers = useMemo(() => {
      const scores: Record<string, {name: string, team: string, goals: number, photoUrl?: string}> = {};
      matches.forEach(m => {
          const processGoal = (player: string, teamId: string) => {
              const pName = String(player).split('(')[0].replace(/[#0-9]/g,'').trim();
              const teamName = teamId === 'A' || (typeof m.teamA==='string'?m.teamA:m.teamA.name) === teamId ? (typeof m.teamA==='string'?m.teamA:m.teamA.name) : (typeof m.teamB==='string'?m.teamB:m.teamB.name);
              const key = `${pName}_${teamName}`;
              if (!scores[key]) {
                  const teamObj = teams.find(t => t.name === teamName);
                  const playerObj = players.find(p => p.teamId === teamObj?.id && p.name.includes(pName));
                  scores[key] = { name: pName, team: teamName, goals: 0, photoUrl: playerObj?.photoUrl };
              }
              scores[key].goals++;
          };
          m.events?.forEach(e => { if (e.type === 'GOAL') processGoal(e.player, e.teamId); });
          m.kicks?.forEach(k => { if (k.result === KickResult.GOAL) processGoal(k.player, k.teamId); });
      });
      return Object.values(scores).sort((a,b) => b.goals - a.goals).slice(0, 5);
  }, [matches, teams, players]);

  const topKeepers = useMemo(() => {
      const savesMap: Record<string, { teamName: string, saves: number, cleanSheets: number, logoUrl?: string }> = {};
      teams.forEach(t => { if(t.status === 'Approved') savesMap[t.name] = { teamName: t.name, saves: 0, cleanSheets: 0, logoUrl: t.logoUrl }; });
      matches.forEach(m => {
          if (!m.winner) return;
          const tA = typeof m.teamA === 'string' ? m.teamA : m.teamA.name;
          const tB = typeof m.teamB === 'string' ? m.teamB : m.teamB.name;
          if (savesMap[tA] && m.scoreB === 0) savesMap[tA].cleanSheets++;
          if (savesMap[tB] && m.scoreA === 0) savesMap[tB].cleanSheets++;
          m.kicks?.forEach(k => {
              if (k.result === KickResult.SAVED) {
                  const saverTeam = (k.teamId === 'A' || tA === k.teamId) ? tB : tA;
                  if (savesMap[saverTeam]) savesMap[saverTeam].saves++;
              }
          });
      });
      return Object.values(savesMap).filter(k => k.saves > 0 || k.cleanSheets > 0).sort((a, b) => (b.saves * 2 + b.cleanSheets * 5) - (a.saves * 2 + a.cleanSheets * 5)).slice(0, 5);
  }, [matches, teams]);

  const bracketData = useMemo(() => {
      const semiFinals = matches.filter(m => m.roundLabel?.match(/semi|sf|รองชนะเลิศ/i));
      const final = matches.find(m => m.roundLabel?.match(/final|ching|ชิงชนะเลิศ/i));
      const qf = matches.filter(m => m.roundLabel?.match(/quarter|qf|8/i));
      return { qf, semiFinals, final };
  }, [matches]);

  const fanRankings = useMemo(() => {
      const scores: Record<string, { name: string, pic: string, points: number, correct: number }> = {};
      const results: Record<string, string> = {};
      matches.forEach(m => { if (m.winner) { results[m.id] = m.winner === 'A' || m.winner === (typeof m.teamA==='string'?m.teamA:m.teamA.name) ? 'A' : 'B'; } });
      predictions.forEach(p => {
          if (results[p.matchId] && results[p.matchId] === p.prediction) {
              if (!scores[p.userId]) scores[p.userId] = { name: p.userDisplayName || 'User', pic: p.userPictureUrl || '', points: 0, correct: 0 };
              scores[p.userId].points += 10;
              scores[p.userId].correct++;
          }
      });
      return Object.values(scores).sort((a, b) => b.points - a.points).slice(0, 5);
  }, [matches, predictions]);

  // --- TIMER & SLIDE LOGIC ---
  useEffect(() => {
    const clockTimer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(clockTimer);
  }, []);

  useEffect(() => {
      if (!isAuthenticated) return;
      
      const SLIDE_DURATIONS: Record<number, number> = {
          10: 45000, // Live Stream
      };
      const defaultDuration = 15000;
      const duration = SLIDE_DURATIONS[currentSlide] || defaultDuration;
      
      const timer = setTimeout(() => {
          setCurrentSlide(prev => {
              const next = (prev + 1) % totalSlides;
              if (next === 1) setStandingsPage(0); 
              return next;
          });
      }, duration);

      return () => clearTimeout(timer);
  }, [totalSlides, isAuthenticated, currentSlide]);

  useEffect(() => {
      if (!isAuthenticated) return;
      let subTimer: any;
      if (currentSlide === 1 && standingsGroups.length > 1) {
          subTimer = setInterval(() => setStandingsPage(p => (p + 1) % standingsGroups.length), 5000);
      }
      if (currentSlide === 7 && contestEntries.length > 1) { 
          subTimer = setInterval(() => setHighlightIndex(p => (p + 1) % contestEntries.length), 4000);
      }
      if (currentSlide === 0) {
          onRefresh(true);
          loadExtras();
      }
      return () => {
          if (subTimer) clearInterval(subTimer);
      };
  }, [currentSlide, standingsGroups.length, contestEntries.length, isAuthenticated]);

  const renderMusicPlayer = () => {
      if (!currentTrack || !isPlaying) return null;

      if (currentTrack.type === 'Suno' || (currentTrack.url && currentTrack.url.includes('suno.com'))) {
          // Extract Suno ID from URL
          const parts = currentTrack.url.split('/');
          const id = parts[parts.length - 1]; // Get last part
          const embedUrl = `https://suno.com/embed/${id}/?autoplay=true`;
          
          return (
              <div className="absolute top-0 left-0 w-1 h-1 overflow-hidden opacity-0 pointer-events-none">
                  <iframe 
                      width="100%" 
                      height="100%" 
                      src={embedUrl} 
                      title="bg-music-suno" 
                      frameBorder="0" 
                      allow="autoplay; encrypted-media; clipboard-write" 
                      allowFullScreen 
                  />
              </div>
          );
      }

      if (currentTrack.type === 'Youtube' || (currentTrack.url && currentTrack.url.includes('youtu'))) {
          let videoId = '';
          if (currentTrack.url.includes('v=')) videoId = currentTrack.url.split('v=')[1].split('&')[0];
          else if (currentTrack.url.includes('youtu.be/')) videoId = currentTrack.url.split('youtu.be/')[1].split('?')[0];
          else videoId = currentTrack.url; 

          const src = `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=${isMuted ? 1 : 0}&loop=1&playlist=${videoId}&controls=0&showinfo=0&modestbranding=1&enablejsapi=1&playsinline=1`;
          return (
              <div className="absolute top-0 left-0 w-1 h-1 overflow-hidden opacity-0 pointer-events-none">
                  <iframe width="100%" height="100%" src={src} title="bg-music" frameBorder="0" allow="autoplay; encrypted-media" allowFullScreen />
              </div>
          );
      } 
      const isDirectAudio = currentTrack.url.match(/\.(mp3|wav|ogg|m4a)$/i);
      if (isDirectAudio) {
          return <audio ref={audioRef} src={currentTrack.url} autoPlay loop muted={isMuted} onError={handleNextTrack} preload="auto" className="hidden" />;
      }
      return <div className="absolute top-0 left-0 w-1 h-1 overflow-hidden opacity-0 pointer-events-none"><iframe src={currentTrack.url} allow="autoplay" /></div>;
  };

  if (!isAuthenticated) {
      return (
          <div className="fixed inset-0 z-[6000] bg-slate-950 flex flex-col items-center justify-center font-kanit">
              <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-20"></div>
              <div className="relative z-10 w-full max-w-sm bg-white/10 backdrop-blur-xl p-8 rounded-2xl shadow-2xl border border-white/10 flex flex-col items-center animate-in zoom-in duration-300">
                  <div className="w-16 h-16 bg-indigo-600 rounded-full flex items-center justify-center mb-6 shadow-[0_0_20px_rgba(99,102,241,0.5)]"><Lock className="w-8 h-8 text-white" /></div>
                  <h2 className="text-2xl font-black text-white mb-2 tracking-wide">LOCKED</h2>
                  <p className="text-slate-400 text-sm mb-6 text-center">กรุณากรอกรหัส PIN เพื่อเข้าสู่ Live Wall</p>
                  <form onSubmit={handlePinSubmit} className="w-full flex flex-col gap-4">
                      <input type="password" inputMode="numeric" pattern="[0-9]*" value={pinInput} onChange={(e) => { setPinInput(e.target.value); setPinError(false); }} className={`w-full p-4 text-center text-3xl tracking-[0.5em] font-mono bg-black/40 border rounded-xl text-white focus:outline-none focus:ring-2 transition ${pinError ? 'border-red-500 focus:ring-red-500' : 'border-white/20 focus:ring-indigo-500'}`} placeholder="••••" autoFocus maxLength={6} />
                      {pinError && <div className="text-red-400 text-xs font-bold text-center bg-red-900/20 p-2 rounded animate-pulse">รหัสไม่ถูกต้อง</div>}
                      <button type="submit" className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold shadow-lg transition transform active:scale-95 mt-2">UNLOCK</button>
                  </form>
                  <button onClick={onClose} className="mt-6 text-slate-500 hover:text-white text-xs flex items-center gap-1 transition"><X className="w-3 h-3"/> ยกเลิก</button>
              </div>
              <div className="absolute bottom-8 text-slate-600 text-xs font-mono">Penalty Pro Arena Live System</div>
          </div>
      );
  }

  if (!hasInteracted) {
      return (
          <div className="fixed inset-0 z-[5000] bg-slate-950 flex flex-col items-center justify-center cursor-pointer" onClick={handleStartExperience}>
              <div className="animate-pulse mb-4 p-6 bg-white/10 rounded-full"><Play className="w-20 h-20 text-indigo-500 fill-indigo-500" /></div>
              <h1 className="text-3xl font-black text-white uppercase tracking-widest mb-2">{config.competitionName}</h1>
              <p className="text-slate-400 font-bold text-lg animate-bounce">CLICK ANYWHERE TO START</p>
              <p className="text-xs text-slate-600 mt-4">Enabling Audio & Visuals</p>
          </div>
      );
  }

  return (
    <div className="fixed inset-0 z-[5000] bg-slate-950 text-white overflow-hidden flex flex-col font-kanit select-none cursor-none" style={{ fontFamily: "'Kanit', sans-serif" }}>
        
        <SettingsManagerModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} sponsors={sponsors} onUpdateSponsors={loadExtras} musicTracks={musicTracks} onUpdateMusic={loadExtras} onPlayMusic={handlePlayMusic} tickerMessages={tickerMessages} onUpdateTicker={loadExtras} notify={showToast} tournamentId={tournamentId} />
        {renderMusicPlayer()}

        {/* NOTIFICATIONS */}
        <div className="absolute top-28 right-8 z-[7000] flex flex-col gap-3 pointer-events-none">
            {toasts.map(t => (
                <div key={t.id} className={`flex items-center gap-3 px-4 py-3 rounded-xl border backdrop-blur-md shadow-2xl animate-slide-in-right ${t.type === 'success' ? 'bg-green-900/80 border-green-500/50 text-green-100' : 'bg-red-900/80 border-red-500/50 text-red-100'}`}>
                    {t.type === 'success' ? <CheckCircle2 className="w-5 h-5"/> : <AlertCircle className="w-5 h-5"/>}
                    <span className="font-bold text-sm">{t.msg}</span>
                </div>
            ))}
        </div>

        {/* DYNAMIC ANIMATED BACKGROUND */}
        <div className={`absolute inset-0 z-0 overflow-hidden pointer-events-none transition-colors duration-2000 bg-gradient-to-br ${getGradientColors(currentSlide)} bg-[length:400%_400%] animate-gradient-xy`}>
            <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(0,0,0,0)_50%,rgba(0,0,0,0.1)_50%)] bg-[length:100%_4px] pointer-events-none z-[5] animate-scanlines opacity-20"></div>
            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10 mix-blend-overlay animate-pan-pattern"></div>
            <div className="absolute inset-0 opacity-20 mix-blend-screen animate-gradient-wave bg-[radial-gradient(circle_at_50%_50%,_rgba(255,255,255,0.1),_transparent_70%)] bg-[length:100%_100%]"></div>
            <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-white/5 rounded-full blur-[100px] animate-float-orb"></div>
            <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-white/5 rounded-full blur-[80px] animate-float-orb delay-1000"></div>
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:40px_40px]"></div>
            
            {/* WATERMARK */}
            <div className="absolute bottom-32 right-10 opacity-[0.03] select-none pointer-events-none z-0 transform -rotate-6 origin-bottom-right">
                 <h1 className="text-[12rem] font-black text-white uppercase tracking-tighter whitespace-nowrap leading-none text-right">
                    {config.competitionName}
                 </h1>
            </div>
        </div>

        {/* TOP BAR */}
        <div className="h-24 bg-gradient-to-b from-slate-900 to-transparent flex items-center justify-between px-8 relative z-30 pt-4 group shrink-0 animate-slide-in-down">
            <div className="flex items-center gap-6">
                <div className="w-16 h-16 bg-white/10 backdrop-blur-md rounded-2xl p-2 shadow-[0_0_20px_rgba(99,102,241,0.3)] border border-white/20">
                    <img src={config.competitionLogo} className="w-full h-full object-contain drop-shadow-md" />
                </div>
                <div>
                    <h1 className="text-4xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-white via-indigo-100 to-indigo-300 uppercase drop-shadow-sm">{config.competitionName}</h1>
                    <div className="flex items-center gap-3 mt-1">
                        <span className="flex h-3 w-3 relative"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span><span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span></span>
                        <span className="text-sm font-bold text-red-400 tracking-widest uppercase">Live Coverage</span>
                        {currentTrack ? (
                            <div className={`flex items-center gap-3 ml-6 bg-white/10 backdrop-blur-lg px-4 py-1.5 rounded-full border border-white/10 shadow-lg cursor-pointer hover:bg-white/20 transition-all duration-300 ${!isPlaying ? 'opacity-50 grayscale' : 'opacity-100'}`} onClick={toggleMute}>
                                {isPlaying && !isMuted ? <div className="flex items-end gap-1 h-4"><div className="w-1 bg-green-400 animate-[music-bar_0.5s_infinite] rounded-t-sm"></div><div className="w-1 bg-green-400 animate-[music-bar_0.7s_infinite] rounded-t-sm"></div><div className="w-1 bg-green-400 animate-[music-bar_0.4s_infinite] rounded-t-sm"></div><div className="w-1 bg-green-400 animate-[music-bar_0.6s_infinite] rounded-t-sm"></div></div> : <Music className="w-4 h-4 text-slate-400" />}
                                <div className="flex flex-col"><span className="text-[10px] text-indigo-300 font-bold uppercase tracking-wider leading-none">Now Playing</span><div className="text-xs text-white font-medium font-mono max-w-[200px] overflow-hidden whitespace-nowrap relative"><span className={`${isPlaying && currentTrack.name.length > 25 ? 'animate-marquee-sponsors' : ''} inline-block`}>{currentTrack.name}</span></div></div>
                                {isMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4 text-green-400" />}
                            </div>
                        ) : (
                            <div className="flex items-center gap-1 ml-4 text-xs text-slate-500"><VolumeX className="w-3 h-3"/> Audio Off</div>
                        )}
                    </div>
                </div>
            </div>
            <div className="flex items-center gap-8">
                <div className="hidden md:flex bg-white p-1 rounded-lg shadow-[0_0_15px_rgba(255,255,255,0.3)] items-center gap-2 pr-3 transition hover:scale-105">
                    <img src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(currentUrl)}`} className="w-10 h-10 md:w-12 md:h-12" />
                    <div className="text-slate-900 leading-tight"><div className="text-[10px] font-bold uppercase">Scan to</div><div className="text-xs md:text-sm font-black">PLAY NOW</div></div>
                </div>
                {nextMatch && (
                    <div className="hidden xl:flex flex-col items-end bg-black/40 backdrop-blur-md px-4 py-2 rounded-lg border border-white/5">
                        <div className="text-[10px] text-indigo-300 font-bold uppercase tracking-wider mb-1 flex items-center gap-1"><Clock className="w-3 h-3"/> Next Match</div>
                        <div className="text-sm font-bold text-white flex items-center gap-2"><span>{resolveTeam(nextMatch.teamA).shortName || 'TBA'}</span><span className="text-slate-400 text-xs">vs</span><span>{resolveTeam(nextMatch.teamB).shortName || 'TBA'}</span></div>
                        <div className="text-[10px] text-slate-400 mt-0.5">{new Date(nextMatch.scheduledTime || nextMatch.date).toLocaleTimeString('th-TH', {hour:'2-digit', minute:'2-digit'})}</div>
                    </div>
                )}
                <div className="h-12 w-[1px] bg-slate-700 hidden lg:block"></div>
                <div className="text-right">
                    <div className="text-5xl font-black font-mono leading-none tracking-widest text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.6)]">{currentTime.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
                    <div className="text-sm text-slate-400 font-bold uppercase tracking-widest mt-1">{currentTime.toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div>
                </div>
                <div className="flex gap-2">
                    <button onClick={() => setIsSettingsOpen(true)} className="p-3 bg-slate-800/80 hover:bg-slate-700 rounded-full text-indigo-400 hover:text-white transition backdrop-blur-sm pointer-events-auto"><Settings className="w-6 h-6"/></button>
                    {currentTrack && <button onClick={handleNextTrack} className="p-3 bg-slate-800/80 hover:bg-slate-700 rounded-full text-indigo-400 hover:text-white transition backdrop-blur-sm pointer-events-auto"><SkipForward className="w-6 h-6"/></button>}
                    <button onClick={enterFullScreen} className="p-3 bg-white/10 hover:bg-white/20 rounded-full text-slate-300 hover:text-white transition backdrop-blur-sm pointer-events-auto"><Maximize2 className="w-6 h-6"/></button>
                    <button onClick={onClose} className="p-3 bg-red-500/20 hover:bg-red-500/40 rounded-full text-red-400 hover:text-red-300 transition backdrop-blur-sm pointer-events-auto"><X className="w-6 h-6"/></button>
                </div>
            </div>
        </div>

        {/* MAIN CONTENT WRAPPER */}
        <div className="flex-1 relative z-10 w-full flex items-center justify-center overflow-hidden">
            <div className="w-full h-full flex flex-col px-12 py-6 origin-center transition-transform duration-300" style={{ transform: `scale(${uiScale})`, width: `${100 / uiScale}%`, height: `${100 / uiScale}%` }}>
            
            {/* SLIDE 0: MATCH CENTER */}
            {currentSlide === 0 && (
                <div className="h-full flex flex-col animate-broadcast-reveal">
                    <div className="flex items-center gap-4 mb-6 mt-2">
                        <div className="bg-red-600 p-2 rounded-lg shadow-[0_0_20px_rgba(220,38,38,0.5)]"><Activity className="w-8 h-8 text-white" /></div>
                        <h2 className="text-4xl font-black text-white uppercase tracking-tight">Match Center</h2>
                    </div>
                    <div className="flex-1 flex items-center justify-center">
                        {upcomingMatches.length > 0 ? (
                            <div className="grid grid-cols-1 gap-6 w-full max-w-6xl">
                                {upcomingMatches.slice(0, 4).map((m, idx) => {
                                    const tA = resolveTeam(m.teamA);
                                    const tB = resolveTeam(m.teamB);
                                    const isLive = m.livestreamUrl && !m.winner;
                                    return (
                                        <div key={m.id} className={`relative bg-slate-900/60 backdrop-blur-xl rounded-3xl border p-6 flex items-center justify-between transition-all duration-500 opacity-0 animate-card-enter ${isLive ? 'border-red-500/50 shadow-[0_0_40px_rgba(220,38,38,0.15)] bg-gradient-to-r from-red-950/30 to-slate-900/60' : 'border-white/10'} ${idx === 0 ? 'scale-105 z-10' : 'scale-100'}`} style={{ animationDelay: `${idx * 150}ms` }}>
                                            <div className="flex items-center gap-6 w-[40%]"><div className="w-20 h-20 bg-white/5 rounded-2xl p-2 shadow-inner border border-white/5 flex items-center justify-center shrink-0">{tA.logoUrl ? <img src={tA.logoUrl} className="w-full h-full object-contain drop-shadow-md"/> : <div className="text-2xl font-black text-slate-600">{tA.name.substring(0,1)}</div>}</div><span className="text-3xl font-bold truncate text-white">{tA.name}</span></div>
                                            <div className="flex flex-col items-center w-[20%] relative">
                                                {isLive ? <div className="absolute -top-10 bg-red-600 text-white px-3 py-0.5 rounded text-xs font-bold uppercase tracking-wider animate-pulse shadow-lg">Live</div> : <div className="absolute -top-10 bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-3 py-0.5 rounded text-xs font-bold uppercase tracking-wider">{new Date(m.scheduledTime || m.date).toLocaleTimeString('th-TH', {hour:'2-digit', minute:'2-digit'})}</div>}
                                                <div className="flex items-center gap-4 text-6xl font-black font-mono tracking-tighter text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]"><span>{m.scoreA}</span><span className="text-slate-600 text-4xl">:</span><span>{m.scoreB}</span></div>
                                                <div className="text-indigo-400 font-bold text-sm tracking-widest mt-2">{m.roundLabel?.split(':')[0]}</div>
                                            </div>
                                            <div className="flex items-center gap-6 w-[40%] justify-end"><span className="text-3xl font-bold truncate text-right text-white">{tB.name}</span><div className="w-20 h-20 bg-white/5 rounded-2xl p-2 shadow-inner border border-white/5 flex items-center justify-center shrink-0">{tB.logoUrl ? <img src={tB.logoUrl} className="w-full h-full object-contain drop-shadow-md"/> : <div className="text-2xl font-black text-slate-600">{tB.name.substring(0,1)}</div>}</div></div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : <div className="text-center opacity-40 flex flex-col items-center"><div className="w-32 h-32 bg-white/5 rounded-full flex items-center justify-center mb-6 animate-pulse"><Clock className="w-16 h-16 text-slate-400" /></div><h3 className="text-4xl font-black tracking-widest">NO MATCHES NOW</h3></div>}
                    </div>
                </div>
            )}

            {/* SLIDE 1: STANDINGS */}
            {currentSlide === 1 && (
                <div className="h-full flex flex-col animate-broadcast-reveal">
                    <div className="flex items-center justify-between mb-6 mt-2">
                        <div className="flex items-center gap-4"><div className="bg-indigo-600 p-2 rounded-lg shadow-[0_0_20px_rgba(79,70,229,0.5)]"><Trophy className="w-8 h-8 text-white" /></div><h2 className="text-4xl font-black text-white uppercase tracking-tight">Current Standings</h2></div>
                        {standingsGroups.length > 1 && <div className="flex items-center gap-2">{standingsGroups.map((_, idx) => <div key={idx} className={`h-2 transition-all duration-300 rounded-full ${idx === standingsPage ? 'w-8 bg-white' : 'w-2 bg-white/20'}`}></div>)}</div>}
                    </div>
                    <div className="flex-1 relative">
                        {standingsGroups.length > 0 ? (
                            <div className="grid grid-cols-2 gap-8 content-start key={standingsPage}">
                                {standingsGroups[standingsPage]?.map((group, groupIdx) => (
                                    <div key={group.name} className="bg-slate-900/80 border border-white/10 rounded-2xl overflow-hidden backdrop-blur-md shadow-2xl opacity-0 animate-card-enter" style={{ animationDelay: `${groupIdx * 150}ms` }}>
                                        <div className="bg-gradient-to-r from-indigo-900/50 to-slate-900/50 px-6 py-4 border-b border-white/5 flex justify-between items-center"><h3 className="font-black text-2xl text-white flex items-center gap-2"><span className="text-indigo-400">GROUP</span> {group.name}</h3><div className="text-xs font-bold text-slate-500 bg-white/5 px-2 py-1 rounded">Top 2 Qualify</div></div>
                                        <table className="w-full text-lg"><thead className="bg-white/5 text-slate-400 text-sm uppercase tracking-wider font-bold"><tr><th className="p-3 text-left pl-6 w-[50%]">Team</th><th className="p-3 text-center">P</th><th className="p-3 text-center">GD</th><th className="p-3 text-center text-white bg-white/5">PTS</th></tr></thead><tbody className="divide-y divide-white/5">{group.teams.map((team, idx) => (<tr key={team.teamId} className={`transition-colors ${idx < 2 ? "bg-green-500/5" : ""}`}><td className="p-3 pl-6 font-bold flex items-center gap-4"><div className={`w-6 h-6 rounded flex items-center justify-center text-xs font-black ${idx < 2 ? 'bg-green-500 text-black' : 'bg-slate-700 text-slate-400'}`}>{idx+1}</div>{team.logoUrl && <img src={team.logoUrl} className="w-8 h-8 object-contain" />}<span className="truncate max-w-[220px] text-xl">{team.teamName}</span></td><td className="p-3 text-center text-slate-400 font-mono">{team.played}</td><td className="p-3 text-center text-slate-400 font-mono">{team.goalsFor - team.goalsAgainst}</td><td className="p-3 text-center font-black text-yellow-400 text-2xl bg-white/5">{team.points}</td></tr>))}</tbody></table>
                                    </div>
                                ))}
                            </div>
                        ) : <div className="flex items-center justify-center h-full text-slate-500 text-2xl font-bold">Waiting for standings...</div>}
                    </div>
                </div>
            )}

            {/* SLIDE 2: BRACKET */}
            {currentSlide === 2 && (
                <div className="h-full flex flex-col animate-broadcast-reveal">
                    <div className="flex items-center justify-center mb-6 mt-2">
                        <div className="bg-white/10 p-4 rounded-full border-4 border-white/20 shadow-2xl flex items-center justify-center backdrop-blur-md">
                            <GitMerge className="w-12 h-12 text-white" />
                        </div>
                    </div>
                    <h2 className="text-5xl font-black text-center text-white uppercase tracking-tighter mb-12 drop-shadow-lg">Road to Final</h2>
                    
                    <div className="flex-1 flex items-center justify-center gap-8 md:gap-16 w-full max-w-6xl mx-auto px-4">
                        {/* Semi Final 1 */}
                        <div className="flex flex-col gap-8 w-1/4">
                            {[0, 1].map((idx) => {
                                const m = bracketData.semiFinals[idx];
                                const tA = resolveTeam(m?.teamA || '');
                                const tB = resolveTeam(m?.teamB || '');
                                return (
                                    <div key={idx} className="bg-slate-800/80 border border-white/10 rounded-xl p-4 relative shadow-lg">
                                        <div className="absolute -left-3 top-1/2 -translate-y-1/2 w-3 h-[2px] bg-slate-600"></div>
                                        <div className="absolute -right-8 top-1/2 -translate-y-1/2 w-8 h-[2px] bg-slate-600"></div>
                                        <div className="text-[10px] text-slate-400 font-bold uppercase mb-2 tracking-widest text-center">Semi Final</div>
                                        <div className={`flex justify-between items-center mb-2 ${m?.winner==='A'?'text-green-400 font-bold':''}`}><span>{tA.name || 'TBA'}</span><span>{m?.scoreA}</span></div>
                                        <div className={`flex justify-between items-center ${m?.winner==='B'?'text-green-400 font-bold':''}`}><span>{tB.name || 'TBA'}</span><span>{m?.scoreB}</span></div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Connector Vertical */}
                        <div className="flex flex-col justify-around h-64 w-8 border-r-2 border-t-2 border-b-2 border-slate-600 rounded-r-xl opacity-30"></div>

                        {/* FINAL */}
                        <div className="w-1/3 z-10">
                            <div className="bg-gradient-to-b from-yellow-500 to-amber-600 rounded-2xl p-1 shadow-[0_0_60px_rgba(234,179,8,0.4)] transform scale-110">
                                <div className="bg-slate-900 rounded-xl p-6 text-center">
                                    <Trophy className="w-16 h-16 text-yellow-400 mx-auto mb-4 animate-bounce" />
                                    <h3 className="text-2xl font-black text-white uppercase tracking-widest mb-4">CHAMPIONSHIP</h3>
                                    {bracketData.final ? (
                                        <div className="space-y-4">
                                            <div className="flex justify-between items-center text-xl font-bold">
                                                <div className="flex flex-col items-center">
                                                    {resolveTeam(bracketData.final.teamA).logoUrl ? <img src={resolveTeam(bracketData.final.teamA).logoUrl} className="w-12 h-12 object-contain mb-2"/> : <div className="w-12 h-12 bg-white/10 rounded-full flex items-center justify-center">A</div>}
                                                    <span>{resolveTeam(bracketData.final.teamA).name}</span>
                                                </div>
                                                <div className="text-4xl font-mono text-yellow-400">
                                                    {bracketData.final.scoreA}-{bracketData.final.scoreB}
                                                </div>
                                                <div className="flex flex-col items-center">
                                                    {resolveTeam(bracketData.final.teamB).logoUrl ? <img src={resolveTeam(bracketData.final.teamB).logoUrl} className="w-12 h-12 object-contain mb-2"/> : <div className="w-12 h-12 bg-white/10 rounded-full flex items-center justify-center">B</div>}
                                                    <span>{resolveTeam(bracketData.final.teamB).name}</span>
                                                </div>
                                            </div>
                                            {bracketData.final.winner && <div className="bg-yellow-500/20 text-yellow-200 px-4 py-1 rounded-full text-sm font-bold inline-block">WINNER: {bracketData.final.winner === 'A' ? resolveTeam(bracketData.final.teamA).name : resolveTeam(bracketData.final.teamB).name}</div>}
                                        </div>
                                    ) : (
                                        <div className="text-slate-500 font-bold text-xl py-4">WAITING FOR FINALISTS</div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* SLIDE 3: RESULTS */}
            {currentSlide === 3 && (
                <div className="h-full flex flex-col animate-broadcast-reveal relative">
                    <div className="flex items-center justify-between mb-6 mt-2 px-4">
                        <div className="flex items-center gap-4">
                            <div className="bg-green-600 p-2 rounded-lg shadow-[0_0_20px_rgba(22,163,74,0.5)]"><Award className="w-8 h-8 text-white" /></div>
                            <h2 className="text-4xl font-black text-white uppercase tracking-tight">Match Results</h2>
                        </div>
                        <div className="flex items-center gap-4 bg-white/10 border border-white/20 p-2 pr-6 rounded-xl backdrop-blur-md shadow-lg animate-pulse-slow"><div className="bg-white p-1.5 rounded-lg shadow-inner"><img src={`https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(currentUrl)}`} className="w-12 h-12" /></div><div className="flex flex-col"><div className="text-yellow-400 font-black text-sm flex items-center gap-1"><Gamepad2 className="w-4 h-4"/> PREDICT</div><div className="text-[10px] text-slate-300 leading-tight">Scan to play & win points</div></div></div>
                    </div>
                    {recentResults.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 flex-1 content-center">
                            {recentResults.map((m, idx) => {
                                const tA = resolveTeam(m.teamA);
                                const tB = resolveTeam(m.teamB);
                                const winnerA = m.winner === 'A' || m.winner === tA.name;
                                const winnerB = m.winner === 'B' || m.winner === tB.name;
                                return (
                                    <div key={m.id} className={`relative bg-slate-900/80 backdrop-blur-md rounded-2xl border border-white/10 p-0 overflow-hidden shadow-2xl transition-all duration-500 hover:border-white/30 opacity-0 animate-card-enter`} style={{ animationDelay: `${idx * 150}ms` }}>
                                        <div className="bg-white/5 px-4 py-2 flex justify-between items-center text-xs font-bold text-slate-400"><span>{new Date(m.date).toLocaleDateString('th-TH', {day:'numeric', month:'short'})}</span><span className="uppercase tracking-widest">{m.roundLabel?.split(':')[0] || 'Match'}</span></div>
                                        <div className="p-6 flex items-center justify-between">
                                            <div className={`flex flex-col items-center gap-3 flex-1 ${winnerA ? 'opacity-100 scale-105' : 'opacity-60 grayscale-[0.5]'}`}><div className={`w-20 h-20 rounded-2xl p-2 flex items-center justify-center bg-gradient-to-br ${winnerA ? 'from-green-500/20 to-emerald-900/40 border border-green-500/50 shadow-[0_0_20px_rgba(34,197,94,0.2)]' : 'from-slate-800 to-slate-900 border border-white/5'}`}>{tA.logoUrl ? <img src={tA.logoUrl} className="w-full h-full object-contain drop-shadow-md"/> : <div className="text-2xl font-black text-slate-500">{tA.name.substring(0,1)}</div>}</div><span className={`text-sm font-bold text-center leading-tight ${winnerA ? 'text-white' : 'text-slate-400'}`}>{tA.name}</span>{winnerA && <div className="absolute top-12 left-8"><Sparkles className="w-8 h-8 text-yellow-400 animate-spin-slow opacity-80"/></div>}</div>
                                            <div className="flex flex-col items-center px-4"><div className="text-5xl font-black font-mono text-white tracking-tighter drop-shadow-[0_4px_10px_rgba(0,0,0,0.5)]">{m.scoreA}-{m.scoreB}</div><div className="mt-2 bg-white/10 px-2 py-0.5 rounded text-[10px] font-bold text-yellow-400 border border-yellow-500/30 uppercase tracking-widest">Full Time</div></div>
                                            <div className={`flex flex-col items-center gap-3 flex-1 ${winnerB ? 'opacity-100 scale-105' : 'opacity-60 grayscale-[0.5]'}`}><div className={`w-20 h-20 rounded-2xl p-2 flex items-center justify-center bg-gradient-to-br ${winnerB ? 'from-green-500/20 to-emerald-900/40 border border-green-500/50 shadow-[0_0_20px_rgba(34,197,94,0.2)]' : 'from-slate-800 to-slate-900 border border-white/5'}`}>{tB.logoUrl ? <img src={tB.logoUrl} className="w-full h-full object-contain drop-shadow-md"/> : <div className="text-2xl font-black text-slate-500">{tB.name.substring(0,1)}</div>}</div><span className={`text-sm font-bold text-center leading-tight ${winnerB ? 'text-white' : 'text-slate-400'}`}>{tB.name}</span>{winnerB && <div className="absolute top-12 right-8"><Sparkles className="w-8 h-8 text-yellow-400 animate-spin-slow opacity-80"/></div>}</div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : <div className="flex-1 flex items-center justify-center text-slate-500 text-2xl font-bold">No finished matches yet</div>}
                </div>
            )}

            {/* SLIDE 4: TOP SCORERS */}
            {currentSlide === 4 && (
                <div className="h-full flex flex-col animate-broadcast-reveal">
                    <div className="text-center mb-6 mt-2">
                        <h2 className="text-5xl font-black text-yellow-400 uppercase tracking-tighter drop-shadow-lg">Golden Boot</h2>
                        <p className="text-slate-400 font-bold uppercase tracking-widest mt-1">Top Goal Scorers</p>
                    </div>
                    {topScorers.length > 0 ? (
                        <div className="flex-1 flex items-end justify-center gap-8 pb-12">
                            {topScorers[1] && <div className="flex flex-col items-center w-64 animate-in slide-in-from-bottom-20 duration-1000 delay-100"><div className="w-32 h-32 bg-slate-800 rounded-full mb-4 border-4 border-slate-600 overflow-hidden shadow-2xl">{topScorers[1].photoUrl ? <img src={topScorers[1].photoUrl} className="w-full h-full object-cover"/> : <User className="w-full h-full p-6 text-slate-600"/>}</div><div className="bg-slate-800 w-full p-4 rounded-t-2xl text-center border-t-4 border-slate-500 relative"><div className="absolute -top-5 left-1/2 -translate-x-1/2 bg-slate-600 text-white w-10 h-10 rounded-full flex items-center justify-center font-black border-4 border-slate-800">2</div><h3 className="font-bold text-lg truncate mt-2">{topScorers[1].name}</h3><p className="text-xs text-slate-400 uppercase mb-2">{topScorers[1].team}</p><div className="text-4xl font-black text-white">{topScorers[1].goals}</div><div className="text-[10px] uppercase font-bold text-slate-500">Goals</div></div><div className="h-32 w-full bg-slate-800/50 rounded-b-lg"></div></div>}
                            {topScorers[0] && <div className="flex flex-col items-center w-72 z-10 animate-in slide-in-from-bottom-32 duration-1000"><Trophy className="w-16 h-16 text-yellow-400 mb-4 animate-bounce" /><div className="w-40 h-40 bg-yellow-500 rounded-full mb-4 border-4 border-yellow-300 overflow-hidden shadow-[0_0_50px_rgba(234,179,8,0.4)]">{topScorers[0].photoUrl ? <img src={topScorers[0].photoUrl} className="w-full h-full object-cover"/> : <User className="w-full h-full p-8 text-yellow-800"/>}</div><div className="bg-gradient-to-b from-yellow-600 to-yellow-700 w-full p-6 rounded-t-3xl text-center border-t-4 border-yellow-300 relative shadow-2xl"><div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-yellow-400 text-yellow-900 w-12 h-12 rounded-full flex items-center justify-center font-black text-2xl border-4 border-yellow-600">1</div><h3 className="font-black text-2xl truncate mt-2 text-white">{topScorers[0].name}</h3><p className="text-sm text-yellow-200 uppercase mb-3 font-bold">{topScorers[0].team}</p><div className="text-6xl font-black text-white drop-shadow-md">{topScorers[0].goals}</div><div className="text-xs uppercase font-bold text-yellow-200/80 tracking-widest">Goals Scored</div></div><div className="h-48 w-full bg-yellow-800/50 rounded-b-lg"></div></div>}
                            {topScorers[2] && <div className="flex flex-col items-center w-64 animate-in slide-in-from-bottom-20 duration-1000 delay-200"><div className="w-32 h-32 bg-orange-800 rounded-full mb-4 border-4 border-orange-600 overflow-hidden shadow-2xl">{topScorers[2].photoUrl ? <img src={topScorers[2].photoUrl} className="w-full h-full object-cover"/> : <User className="w-full h-full p-6 text-orange-600"/>}</div><div className="bg-orange-900 w-full p-4 rounded-t-2xl text-center border-t-4 border-orange-600 relative"><div className="absolute -top-5 left-1/2 -translate-x-1/2 bg-orange-600 text-white w-10 h-10 rounded-full flex items-center justify-center font-black border-4 border-orange-900">3</div><h3 className="font-bold text-lg truncate mt-2 text-orange-100">{topScorers[2].name}</h3><p className="text-xs text-orange-400 uppercase mb-2">{topScorers[2].team}</p><div className="text-4xl font-black text-white">{topScorers[2].goals}</div><div className="text-[10px] uppercase font-bold text-orange-400">Goals</div></div><div className="h-24 w-full bg-orange-950/50 rounded-b-lg"></div></div>}
                        </div>
                    ) : <div className="flex-1 flex items-center justify-center text-slate-500 text-2xl font-bold">No Goalscorers Yet</div>}
                </div>
            )}

            {/* SLIDE 5: TOP KEEPERS (Modified for Logo) */}
            {currentSlide === 5 && (
                <div className="h-full flex flex-col animate-broadcast-reveal">
                    <div className="flex items-center gap-4 mb-6 mt-2">
                        <div className="bg-blue-600 p-2 rounded-lg shadow-[0_0_20px_rgba(37,99,235,0.5)]"><Hand className="w-8 h-8 text-white" /></div>
                        <h2 className="text-4xl font-black text-white uppercase tracking-tight">Golden Glove</h2>
                    </div>
                    <div className="grid grid-cols-2 gap-6">
                        {topKeepers.length > 0 ? topKeepers.map((k, idx) => (
                            <div key={idx} className="bg-slate-900/80 border border-blue-500/20 rounded-2xl p-6 flex items-center justify-between shadow-lg">
                                <div className="flex items-center gap-4">
                                    <div className={`w-12 h-12 rounded-full flex items-center justify-center font-black text-xl ${idx === 0 ? 'bg-yellow-400 text-yellow-900' : 'bg-slate-700 text-white'}`}>{idx+1}</div>
                                    <div className="flex items-center gap-3">
                                        {k.logoUrl ? <img src={k.logoUrl} className="w-16 h-16 object-contain bg-white rounded-xl p-1" /> : <div className="w-16 h-16 bg-white/10 rounded-xl flex items-center justify-center text-2xl font-bold">{k.teamName.substring(0,1)}</div>}
                                        <div>
                                            <h3 className="text-xl font-bold">{k.teamName}</h3>
                                            <p className="text-xs text-blue-400 uppercase font-bold">Goalkeeper</p>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex gap-4 text-center">
                                    <div><div className="text-3xl font-black text-white"><NumberCounter target={k.cleanSheets} /></div><div className="text-[10px] uppercase text-slate-500 font-bold">Clean Sheets</div></div>
                                    <div><div className="text-3xl font-black text-blue-400"><NumberCounter target={k.saves} /></div><div className="text-[10px] uppercase text-slate-500 font-bold">PK Saves</div></div>
                                </div>
                            </div>
                        )) : <div className="col-span-2 flex items-center justify-center h-64 text-slate-500 text-2xl font-bold">No Goalkeeper Data</div>}
                    </div>
                </div>
            )}

            {/* SLIDE 6: FAN PREDICTION */}
            {currentSlide === 6 && (
                <div className="h-full flex flex-col animate-broadcast-reveal relative">
                    <div className="text-center mb-6 mt-2"><h2 className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400 uppercase tracking-tighter drop-shadow-lg">Fan Zone Leaderboard</h2></div>
                    <div className="flex-1 flex flex-col gap-4 max-w-4xl mx-auto w-full">
                        {fanRankings.length > 0 ? fanRankings.map((fan, idx) => (
                            <div key={idx} className={`bg-white/5 rounded-2xl p-4 flex items-center justify-between border border-white/10 opacity-0 animate-card-enter ${idx === 0 ? 'bg-gradient-to-r from-yellow-500/20 to-purple-500/20 border-yellow-500/50' : ''}`} style={{ animationDelay: `${idx * 100}ms` }}>
                                <div className="flex items-center gap-4"><div className={`w-10 h-10 flex items-center justify-center font-black rounded-full ${idx < 3 ? 'bg-white text-black' : 'bg-slate-700 text-slate-400'}`}>{idx + 1}</div><div className="w-12 h-12 rounded-full overflow-hidden border-2 border-white/20">{fan.pic ? <img src={fan.pic} className="w-full h-full object-cover"/> : <User className="w-full h-full p-2 text-slate-500 bg-slate-800"/>}</div><span className="text-xl font-bold">{fan.name}</span></div>
                                <div className="text-right"><div className="text-3xl font-black text-purple-400">{fan.points} <span className="text-sm text-slate-500 font-bold">PTS</span></div><div className="text-xs text-slate-400">Correct: {fan.correct}</div></div>
                            </div>
                        )) : <div className="flex items-center justify-center h-full text-slate-500 text-2xl font-bold">No Predictions Yet</div>}
                    </div>
                </div>
            )}

            {/* SLIDE 7: HIGHLIGHTS */}
            {currentSlide === 7 && (
                contestEntries.length > 0 ? (
                    <div key={highlightIndex} className="h-full flex flex-col items-center justify-center relative overflow-hidden rounded-3xl animate-broadcast-reveal">
                        <div className="absolute inset-0 z-0"><img src={contestEntries[highlightIndex].photoUrl} className="w-full h-full object-cover blur-3xl opacity-30 scale-110 animate-pulse-slow" /></div>
                        <div className="relative z-10 flex flex-col items-center w-full max-w-4xl animate-photo-fade-zoom">
                            <div className="relative w-full aspect-video rounded-3xl overflow-hidden shadow-2xl border-4 border-white/20 group"><img src={contestEntries[highlightIndex].photoUrl} className="w-full h-full object-cover transform" /><div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/90 to-transparent p-8 translate-y-0"><div className="flex items-center gap-4"><img src={contestEntries[highlightIndex].userPictureUrl} className="w-12 h-12 rounded-full border-2 border-white" /><div><h3 className="text-2xl font-bold text-white">{contestEntries[highlightIndex].caption}</h3><p className="text-slate-300 font-medium">By {contestEntries[highlightIndex].userDisplayName}</p></div><div className="ml-auto flex items-center gap-2 bg-pink-600 px-4 py-2 rounded-full shadow-lg"><Heart className="w-5 h-5 fill-white" /><span className="font-bold text-xl">{contestEntries[highlightIndex].likeCount}</span></div></div></div></div>
                            <h2 className="text-3xl font-black text-white uppercase tracking-widest mt-8 flex items-center gap-3"><Camera className="w-8 h-8 text-pink-500" /> Photo Contest Highlights</h2>
                        </div>
                    </div>
                ) : <div className="flex items-center justify-center h-full text-slate-500 text-2xl font-bold animate-broadcast-reveal">No Photos Yet</div>
            )}

            {/* SLIDE 8: SPONSORS (REDESIGNED) */}
            {currentSlide === 8 && (
                <div className="h-full w-full flex flex-col items-center justify-center relative overflow-hidden animate-broadcast-reveal">
                    <div className="relative z-10 w-full max-w-7xl px-8 flex flex-col items-center justify-center h-full pt-8 pb-12">
                        
                        {/* Header */}
                        <div className="text-center mb-10 animate-in slide-in-from-top-10 duration-1000 shrink-0 z-20">
                            <div className="inline-flex items-center gap-3 bg-gradient-to-r from-yellow-600 to-amber-600 px-8 py-3 rounded-full border border-yellow-400 shadow-[0_0_50px_rgba(251,191,36,0.3)] mb-4 animate-pulse-slow">
                                <Star className="w-5 h-5 text-white fill-white" />
                                <span className="text-base font-black text-white tracking-widest uppercase">Our Partners</span>
                                <Star className="w-5 h-5 text-white fill-white" />
                            </div>
                            <h2 className="text-6xl md:text-8xl font-black text-transparent bg-clip-text bg-gradient-to-b from-white via-slate-200 to-slate-500 uppercase tracking-tighter drop-shadow-2xl">
                                Official Sponsors
                            </h2>
                        </div>
                        
                        {sponsors.length > 0 ? (
                            <div className="flex-1 w-full flex items-center justify-center overflow-y-auto p-4 custom-scrollbar">
                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 w-full max-w-6xl">
                                    {sponsors.map((s, idx) => (
                                        <div 
                                            key={`${s.id}-${idx}`}
                                            className="group relative bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 p-6 flex flex-col items-center gap-4 shadow-xl transition-all duration-700 animate-in zoom-in slide-in-from-bottom-8 fill-mode-backwards"
                                            style={{ animationDelay: `${idx * 150}ms` }}
                                        >
                                            {/* Logo Area */}
                                            <div className="w-full aspect-[3/2] flex items-center justify-center bg-white/5 rounded-xl p-4 overflow-hidden relative">
                                                <div className="absolute inset-0 bg-gradient-to-tr from-indigo-500/10 to-purple-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                                                <img 
                                                    src={s.logoUrl} 
                                                    alt={s.name}
                                                    className="w-full h-full object-contain filter drop-shadow-lg transform transition-transform duration-1000 hover:scale-110"
                                                />
                                                {/* Automatic shimmer effect */}
                                                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full animate-[shimmer_3s_infinite]"></div>
                                            </div>
                                            
                                            {/* Name Tag */}
                                            <div className="text-center w-full">
                                                <div className="bg-slate-900/50 rounded-lg py-2 px-4 border border-white/5">
                                                    <h3 className="text-lg font-bold text-slate-100 truncate">{s.name}</h3>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center animate-pulse mt-10">
                                <div className="w-24 h-24 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-4">
                                    <Zap className="w-10 h-10 text-yellow-400" />
                                </div>
                                <div className="text-2xl font-bold text-slate-500">No Sponsors Yet</div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* SLIDE 9: VERSUS */}
            {currentSlide === 9 && (
                <div className="h-full w-full relative overflow-hidden bg-slate-950 flex flex-col animate-broadcast-reveal">
                    {nextMatch ? (
                        <>
                            <div className="absolute inset-0 z-0 flex"><div className="w-1/2 h-full bg-gradient-to-r from-blue-900 to-slate-900 opacity-50 relative overflow-hidden"><div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-20"></div><div className="absolute bottom-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_bottom_left,_var(--tw-gradient-stops))] from-blue-500/20 to-transparent animate-pulse"></div></div><div className="w-1/2 h-full bg-gradient-to-l from-red-900 to-slate-900 opacity-50 relative overflow-hidden"><div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-20"></div><div className="absolute bottom-0 right-0 w-full h-full bg-[radial-gradient(ellipse_at_bottom_right,_var(--tw-gradient-stops))] from-red-500/20 to-transparent animate-pulse"></div></div></div>
                            <div className="relative z-10 flex-1 flex flex-col justify-center items-center w-full max-w-7xl mx-auto px-4">
                                <div className="text-center mb-8"><span className="bg-white/10 backdrop-blur-md border border-white/20 px-4 py-1 rounded-full text-indigo-300 font-bold tracking-widest text-sm uppercase mb-2 inline-block">Coming Up Next</span><h2 className="text-4xl font-black text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.5)]">{nextMatch.roundLabel?.split(':')[0] || 'MATCH DAY'}</h2></div>
                                <div className="flex items-center justify-center w-full gap-8 md:gap-20">
                                    <div className="flex flex-col items-center w-1/3 animate-in slide-in-from-left-20 duration-1000"><div className="w-48 h-48 md:w-64 md:h-64 bg-white/5 rounded-full p-4 border-4 border-blue-500/50 shadow-[0_0_60px_rgba(59,130,246,0.3)] backdrop-blur-sm flex items-center justify-center mb-6 relative group"><div className="absolute inset-0 rounded-full border-2 border-white/10 animate-[spin_10s_linear_infinite]"></div>{resolveTeam(nextMatch.teamA).logoUrl ? <img src={resolveTeam(nextMatch.teamA).logoUrl} className="w-full h-full object-contain drop-shadow-2xl transform group-hover:scale-110 transition duration-500" /> : <div className="text-8xl font-black text-white/20">A</div>}</div><h3 className="text-4xl md:text-5xl font-black text-white text-center leading-tight drop-shadow-lg uppercase">{resolveTeam(nextMatch.teamA).name}</h3></div>
                                    <div className="flex flex-col items-center justify-center relative z-20"><div className="text-8xl font-black text-transparent bg-clip-text bg-gradient-to-b from-yellow-300 to-yellow-600 italic tracking-tighter drop-shadow-[0_5px_5px_rgba(0,0,0,0.5)] transform scale-150 mb-8">VS</div>{h2hStats && (<div className="mb-6 bg-white/5 border border-white/10 px-6 py-2 rounded-full backdrop-blur-md flex items-center gap-6 shadow-xl"><div className="flex flex-col items-center"><span className="text-2xl font-black text-blue-400">{h2hStats.winsA}</span><span className="text-[9px] uppercase text-slate-400 font-bold">WINS</span></div><div className="h-8 w-[1px] bg-white/20"></div><div className="flex flex-col items-center"><span className="text-2xl font-black text-slate-300">{h2hStats.draws}</span><span className="text-[9px] uppercase text-slate-400 font-bold">DRAWS</span></div><div className="h-8 w-[1px] bg-white/20"></div><div className="flex flex-col items-center"><span className="text-2xl font-black text-red-400">{h2hStats.winsB}</span><span className="text-[9px] uppercase text-slate-400 font-bold">WINS</span></div></div>)}{countdown && <div className="bg-black/50 backdrop-blur-md border border-white/10 px-6 py-3 rounded-2xl flex flex-col items-center gap-1 shadow-2xl"><span className="text-xs text-slate-400 font-bold uppercase tracking-widest">Kick Off In</span><div className="text-4xl font-mono font-bold text-white tracking-widest tabular-nums text-shadow-glow">{countdown}</div></div>}</div>
                                    <div className="flex flex-col items-center w-1/3 animate-in slide-in-from-right-20 duration-1000"><div className="w-48 h-48 md:w-64 md:h-64 bg-white/5 rounded-full p-4 border-4 border-red-500/50 shadow-[0_0_60px_rgba(239,68,68,0.3)] backdrop-blur-sm flex items-center justify-center mb-6 relative group"><div className="absolute inset-0 rounded-full border-2 border-white/10 animate-[spin_10s_linear_infinite_reverse]"></div>{resolveTeam(nextMatch.teamB).logoUrl ? <img src={resolveTeam(nextMatch.teamB).logoUrl} className="w-full h-full object-contain drop-shadow-2xl transform group-hover:scale-110 transition duration-500" /> : <div className="text-8xl font-black text-white/20">B</div>}</div><h3 className="text-4xl md:text-5xl font-black text-white text-center leading-tight drop-shadow-lg uppercase">{resolveTeam(nextMatch.teamB).name}</h3></div>
                                </div>
                                <div className="mt-12 flex items-center gap-6 text-slate-300 text-xl font-bold bg-black/30 px-8 py-3 rounded-full border border-white/5 backdrop-blur-sm"><span className="flex items-center gap-2"><MapPin className="w-6 h-6 text-red-500"/> {nextMatch.venue || 'Main Stadium'}</span><span className="w-1.5 h-1.5 bg-slate-500 rounded-full"></span><span className="flex items-center gap-2"><Clock className="w-6 h-6 text-indigo-500"/> {new Date(nextMatch.scheduledTime || nextMatch.date).toLocaleTimeString('th-TH', {hour:'2-digit', minute:'2-digit'})}</span></div>
                            </div>
                        </>
                    ) : <div className="flex-1 flex flex-col items-center justify-center text-slate-500"><Swords className="w-24 h-24 mb-4 opacity-20" /><h2 className="text-4xl font-black uppercase tracking-widest opacity-50">Tournament Continues</h2><p className="text-xl mt-2">Stay Tuned for More Action</p></div>}
                </div>
            )}

            {/* SLIDE 10: LIVE STREAM (AUTO PLAY & CONTROLS) */}
            {currentSlide === 10 && (
                <div className="h-full w-full relative flex flex-col bg-black animate-broadcast-reveal">
                    {liveStreamingMatches.length > 0 ? (
                        <div className="flex-1 relative w-full h-full flex items-center justify-center">
                            {videoPlaying ? (
                                <iframe 
                                    src={getEmbedUrl(liveStreamingMatches[0].livestreamUrl, true, videoMuted) || ""} 
                                    className="w-full h-full absolute inset-0 object-cover pointer-events-auto" 
                                    allow="autoplay; encrypted-media; picture-in-picture"
                                    allowFullScreen
                                    title="Live Match"
                                />
                            ) : (
                                <div className="absolute inset-0 bg-black/80 flex items-center justify-center flex-col z-10">
                                    <h3 className="text-2xl font-bold text-white mb-4">PAUSED</h3>
                                    <button onClick={() => setVideoPlaying(true)} className="p-4 bg-white/20 rounded-full hover:bg-white/30 transition pointer-events-auto"><Play className="w-12 h-12 text-white"/></button>
                                </div>
                            )}
                            
                            {/* VIDEO CONTROL BAR */}
                            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-black/60 backdrop-blur-md px-6 py-3 rounded-full border border-white/20 flex items-center gap-6 z-30 transition-opacity duration-300 opacity-0 hover:opacity-100 pointer-events-auto">
                                <button onClick={() => setVideoPlaying(!videoPlaying)} className="hover:scale-110 transition">
                                    {videoPlaying ? <Pause className="w-6 h-6 text-white"/> : <Play className="w-6 h-6 text-white"/>}
                                </button>
                                <div className="h-6 w-[1px] bg-white/20"></div>
                                <button onClick={() => setVideoMuted(!videoMuted)} className="hover:scale-110 transition">
                                    {videoMuted ? <VolumeX className="w-6 h-6 text-red-400"/> : <Volume2 className="w-6 h-6 text-green-400"/>}
                                </button>
                            </div>

                            {/* Overlay Info (Top Left) */}
                            <div className="absolute top-8 left-8 bg-gradient-to-r from-black/80 to-transparent p-4 rounded-xl flex items-center gap-4 z-20 animate-slide-in-left pointer-events-none">
                                <div className={`flex items-center gap-2 px-3 py-1 rounded text-xs font-bold uppercase animate-pulse ${liveStreamingMatches[0].winner ? 'bg-indigo-600' : 'bg-red-600'}`}>
                                    <span className="w-2 h-2 bg-white rounded-full"></span> {liveStreamingMatches[0].winner ? 'REPLAY' : 'LIVE'}
                                </div>
                                <div>
                                    <div className="text-2xl font-black uppercase drop-shadow-md">
                                        {resolveTeam(liveStreamingMatches[0].teamA).name} <span className="text-yellow-400">vs</span> {resolveTeam(liveStreamingMatches[0].teamB).name}
                                    </div>
                                    <div className="text-sm font-bold text-slate-300">{liveStreamingMatches[0].roundLabel}</div>
                                </div>
                            </div>

                            {/* Score Overlay (Bottom Center - Hidden if paused) */}
                            {videoPlaying && (
                                <div className="absolute bottom-10 right-10 bg-black/60 backdrop-blur-md px-8 py-3 rounded-2xl border border-white/10 flex items-center gap-6 z-20 pointer-events-none">
                                    <div className="text-center">
                                        <div className="text-3xl font-black">{liveStreamingMatches[0].scoreA}</div>
                                        <div className="text-[10px] uppercase font-bold text-slate-400">{resolveTeam(liveStreamingMatches[0].teamA).shortName}</div>
                                    </div>
                                    <div className="text-xl font-bold text-slate-500">:</div>
                                    <div className="text-center">
                                        <div className="text-3xl font-black">{liveStreamingMatches[0].scoreB}</div>
                                        <div className="text-[10px] uppercase font-bold text-slate-400">{resolveTeam(liveStreamingMatches[0].teamB).shortName}</div>
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-slate-500 relative overflow-hidden">
                            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/tv-noise.png')] opacity-10 animate-pulse"></div>
                            <div className="z-10 bg-slate-900/50 p-12 rounded-3xl border border-white/5 backdrop-blur-sm flex flex-col items-center">
                                <Cast className="w-24 h-24 mb-6 opacity-30 animate-pulse" />
                                <h2 className="text-5xl font-black uppercase tracking-widest opacity-80 mb-2">Signal Lost</h2>
                                <p className="text-2xl mt-2 font-mono text-red-400 flex items-center gap-2"><Signal className="w-5 h-5"/> Waiting for Live Stream</p>
                            </div>
                        </div>
                    )}
                </div>
            )}

            </div>
        </div>

        {/* BOTTOM TICKER & SPONSORS */}
        <div className="h-24 bg-white/95 backdrop-blur-xl text-slate-900 flex items-center relative z-30 shadow-[0_-10px_50px_rgba(0,0,0,0.5)] border-t border-slate-200 shrink-0">
            <div className="bg-red-600 h-full px-12 flex items-center justify-center shrink-0 skew-x-[-10deg] -ml-6 shadow-xl z-20 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-red-600 to-red-500"></div>
                <span className="text-white font-black uppercase tracking-widest flex items-center gap-2 skew-x-[10deg] text-2xl relative z-10 drop-shadow-md"><Megaphone className="w-8 h-8 animate-bounce" /> UPDATE</span>
            </div>
            <div className="flex-1 overflow-hidden relative h-full flex items-center z-10">
                <div className="absolute whitespace-nowrap animate-marquee px-4 text-3xl font-black text-slate-800 uppercase tracking-wide flex items-center" style={{ animationDuration: '80s' }}>
                    {announcements.length > 0 ? announcements.map((a, i) => (<React.Fragment key={i}><span className="mx-12">{a}</span><span className="text-red-500 text-3xl">•</span></React.Fragment>)) : <span className="pl-6 text-slate-300 font-bold uppercase tracking-widest">{config.competitionName}</span>}
                </div>
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1 z-30 bg-white/80 px-2 py-1 rounded-full backdrop-blur-sm border border-slate-200">{slides.map((_, idx) => <div key={idx} className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${currentSlide === idx ? 'bg-indigo-600 w-3' : 'bg-slate-300'}`}></div>)}</div>
            </div>
            <div className="h-full bg-gradient-to-l from-slate-100 to-white flex items-center px-8 gap-6 z-20 border-l border-slate-200 min-w-[300px] justify-end relative overflow-hidden mask-gradient-x"><span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest absolute top-2 right-4">Official Partners</span>{sponsors.length > 0 ? <div className="flex gap-8 items-center overflow-hidden w-full justify-end"><div className="flex gap-8 animate-marquee-sponsors items-center">{[...sponsors, ...sponsors].map((s, i) => <img key={i} src={s.logoUrl} className="h-12 object-contain grayscale opacity-60 transition duration-300" title={s.name} />)}</div></div> : <div className="flex gap-4 opacity-30 grayscale"><div className="w-10 h-10 bg-slate-400 rounded-full"></div><div className="w-10 h-10 bg-slate-400 rounded-full"></div></div>}</div>
        </div>

        {/* PROGRESS BAR */}
        <div className="absolute bottom-0 left-0 w-full h-1.5 bg-slate-900 z-50"><div className="h-full bg-gradient-to-r from-red-500 via-yellow-500 to-indigo-500 transition-all duration-1000 ease-linear shadow-[0_0_10px_rgba(255,255,255,0.5)]" style={{ width: `${((currentSlide + 1) / totalSlides) * 100}%` }}></div></div>

        <style>{`
            @keyframes broadcast-reveal { 0% { opacity: 0; transform: scale(1.05); filter: blur(10px); } 100% { opacity: 1; transform: scale(1); filter: blur(0); } }
            .animate-broadcast-reveal { animation: broadcast-reveal 1.2s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
            @keyframes slow-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            .animate-slow-spin { animation: slow-spin 60s linear infinite; }
            @keyframes marquee { 0% { transform: translateX(100%); } 100% { transform: translateX(-100%); } }
            .animate-marquee { animation: marquee 80s linear infinite; }
            @keyframes marquee-sponsors { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
            .animate-marquee-sponsors { animation: marquee-sponsors 20s linear infinite; display: flex; width: max-content; }
            @keyframes pulse-slow { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.02); opacity: 0.95; } }
            .animate-pulse-slow { animation: pulse-slow 4s ease-in-out infinite; }
            @keyframes music-bar { 0%, 100% { height: 20%; } 50% { height: 100%; } }
            @keyframes auto-scroll { 0% { transform: translateY(0); } 100% { transform: translateY(-50%); } }
            .animate-auto-scroll { animation: auto-scroll 40s linear infinite; }
            .mask-image-linear-gradient { mask-image: linear-gradient(to bottom, transparent 0%, black 10%, black 90%, transparent 100%); -webkit-mask-image: linear-gradient(to bottom, transparent 0%, black 10%, black 90%, transparent 100%); }
            .mask-gradient-x { mask-image: linear-gradient(to right, transparent, black 10%, black 90%, transparent); -webkit-mask-image: linear-gradient(to right, transparent, black 10%, black 90%, transparent); }
            @keyframes pan-pattern { 0% { background-position: 0% 0%; } 100% { background-position: 100% 100%; } }
            .animate-pan-pattern { animation: pan-pattern 120s linear infinite; }
            @keyframes float-orb { 0%, 100% { transform: translate(0, 0) scale(1); } 33% { transform: translate(30px, -50px) scale(1.1); } 66% { transform: translate(-20px, 20px) scale(0.9); } }
            .animate-float-orb { animation: float-orb 20s ease-in-out infinite; }
            @keyframes gradient-wave { 0% { background-position: 0% 50%; transform: scale(1); } 50% { background-position: 100% 50%; transform: scale(1.1); } 100% { background-position: 0% 50%; transform: scale(1); } }
            .animate-gradient-wave { animation: gradient-wave 15s ease infinite; }
            @keyframes gradient-xy { 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }
            .animate-gradient-xy { animation: gradient-xy 15s ease infinite; }
            @keyframes slide-up-fade { from { opacity: 0; transform: translateY(50px); } to { opacity: 1; transform: translateY(0); } }
            .animate-slide-up-fade { animation: slide-up-fade 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
            @keyframes card-entrance { 0% { opacity: 0; transform: translateY(100px) scale(0.9); } 100% { opacity: 1; transform: translateY(0) scale(1); } }
            .animate-card-enter { animation: card-entrance 0.8s cubic-bezier(0.2, 0.8, 0.2, 1) forwards; }
            @keyframes photo-fade-zoom { 0% { opacity: 0; transform: scale(1); } 10% { opacity: 1; } 90% { opacity: 1; } 100% { opacity: 0; transform: scale(1.1); } }
            .animate-photo-fade-zoom { animation: photo-fade-zoom 4s cubic-bezier(0.4, 0, 0.2, 1) forwards; }
            @keyframes scanlines { 0% { background-position: 0% 0%; } 100% { background-position: 0% 100%; } }
            .animate-scanlines { animation: scanlines 4s linear infinite; }
            .text-shadow-glow { text-shadow: 0 0 10px rgba(255,255,255,0.8), 0 0 20px rgba(99,102,241,0.5); }
            ::-webkit-scrollbar { display: none; }
            .perspective-1000 { perspective: 1000px; }
            .fill-mode-backwards { animation-fill-mode: backwards; }
            @keyframes slide-in-right { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
            .animate-slide-in-right { animation: slide-in-right 0.3s ease-out forwards; }
            
            /* Sponsor Animations */
            @keyframes shimmer {
              0% { transform: translateX(-100%); }
              100% { transform: translateX(100%); }
            }
            
            @keyframes bounce-slow {
              0%, 100% { transform: translateY(-5%); }
              50% { transform: translateY(5%); }
            }
            .animate-bounce-slow { animation: bounce-slow 3s infinite ease-in-out; }
        `}</style>
    </div>
  );
};

export default LiveWall;
