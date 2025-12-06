import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Match, Team, Standing, Player, KickResult, AppSettings, Prediction, ContestEntry, Sponsor, MusicTrack } from '../types';
import { Trophy, Clock, Calendar, MapPin, Activity, Award, Megaphone, Monitor, Maximize2, X, ChevronRight, Hand, Sparkles, Camera, Heart, User, QrCode, Settings, Plus, Trash2, Upload, Loader2, Save, Music, Play, Pause, SkipForward, Youtube, Volume2, VolumeX, Star, Zap, Keyboard, AlertTriangle, Info, Swords, Timer, Lock, MessageSquare } from 'lucide-react';
import { fetchContests, fetchSponsors, manageSponsor, fileToBase64, fetchMusicTracks, manageMusicTrack } from '../services/sheetService';

interface LiveWallProps {
  matches: Match[];
  teams: Team[];
  players: Player[];
  config: AppSettings;
  predictions: Prediction[];
  onClose: () => void;
  onRefresh: (silent?: boolean) => void;
}

// Consistent duration to prevent "speed up" feeling
const SLIDE_DURATION = 15000; 

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

interface AlertConfig {
    isActive: boolean;
    message: string;
    type: 'info' | 'warning' | 'urgent';
}

const SettingsManagerModal: React.FC<{ 
    isOpen: boolean, 
    onClose: () => void, 
    sponsors: Sponsor[], 
    onUpdateSponsors: () => void, 
    musicTracks: MusicTrack[], 
    onUpdateMusic: () => void, 
    onPlayMusic: (track: MusicTrack) => void,
}> = ({ isOpen, onClose, sponsors, onUpdateSponsors, musicTracks, onUpdateMusic, onPlayMusic }) => {
    const [tab, setTab] = useState<'sponsors' | 'music'>('sponsors');
    const [name, setName] = useState('');
    const [file, setFile] = useState<File | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Music Form
    const [musicName, setMusicName] = useState('');
    const [musicUrl, setMusicUrl] = useState('');
    const [musicType, setMusicType] = useState<'Youtube' | 'Spotify' | 'Suno' | 'Other'>('Youtube');

    if (!isOpen) return null;

    const handleAddSponsor = async () => {
        if (!name || !file) return;
        setIsSubmitting(true);
        try {
            const compressed = await compressImage(file);
            const base64 = await fileToBase64(compressed);
            await manageSponsor({ subAction: 'add', name, logoFile: base64 });
            onUpdateSponsors();
            setName('');
            setFile(null);
        } catch (e) {
            console.error(e);
            alert("Error adding sponsor");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDeleteSponsor = async (id: string) => {
        if (!confirm("Remove this sponsor?")) return;
        setIsSubmitting(true);
        try {
            await manageSponsor({ subAction: 'delete', id });
            onUpdateSponsors();
        } catch (e) { console.error(e); } finally { setIsSubmitting(false); }
    };

    const handleAddMusic = async () => {
        if (!musicName || !musicUrl) return;
        setIsSubmitting(true);
        try {
            await manageMusicTrack({ subAction: 'add', name: musicName, url: musicUrl, type: musicType });
            onUpdateMusic();
            setMusicName('');
            setMusicUrl('');
        } catch(e) {
            console.error(e);
            alert("Error adding track");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDeleteMusic = async (id: string) => {
        if(!confirm("Remove track?")) return;
        setIsSubmitting(true);
        try {
            await manageMusicTrack({ subAction: 'delete', id });
            onUpdateMusic();
        } catch(e) { console.error(e); } finally { setIsSubmitting(false); }
    };

    return (
        <div className="fixed inset-0 z-[6000] bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[80vh] text-slate-800" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center p-4 border-b">
                    <h3 className="font-bold text-lg flex items-center gap-2"><Settings className="w-5 h-5"/> Live Wall Settings</h3>
                    <button onClick={onClose}><X className="w-5 h-5"/></button>
                </div>
                
                <div className="flex border-b bg-slate-50">
                    <button onClick={() => setTab('sponsors')} className={`flex-1 py-3 font-bold text-sm ${tab==='sponsors' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-white' : 'text-slate-500 hover:bg-slate-100'}`}>Sponsors</button>
                    <button onClick={() => setTab('music')} className={`flex-1 py-3 font-bold text-sm ${tab==='music' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-white' : 'text-slate-500 hover:bg-slate-100'}`}>Music Player</button>
                </div>

                <div className="p-4 overflow-y-auto flex-1">
                    {tab === 'sponsors' && (
                        <>
                            <div className="space-y-3 mb-6 p-3 bg-slate-50 rounded border">
                                <input type="text" placeholder="Sponsor Name" className="w-full p-2 border rounded text-sm" value={name} onChange={e => setName(e.target.value)} />
                                <input type="file" accept="image/*" onChange={e => setFile(e.target.files?.[0] || null)} className="text-sm w-full" />
                                <button onClick={handleAddSponsor} disabled={isSubmitting || !name || !file} className="w-full py-2 bg-indigo-600 text-white rounded font-bold flex items-center justify-center gap-2 text-sm">
                                    {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin"/> : <><Plus className="w-4 h-4"/> Add Sponsor</>}
                                </button>
                            </div>
                            <div className="space-y-2">
                                {sponsors.length === 0 ? <p className="text-center text-slate-400 text-sm">No sponsors yet.</p> : sponsors.map(s => (
                                    <div key={s.id} className="flex items-center justify-between p-2 bg-slate-50 rounded border">
                                        <div className="flex items-center gap-2">
                                            <img src={s.logoUrl} className="w-8 h-8 object-contain bg-white rounded p-0.5 border" />
                                            <span className="font-bold text-sm truncate w-32">{s.name}</span>
                                        </div>
                                        <button onClick={() => handleDeleteSponsor(s.id)} className="text-red-500 hover:bg-red-50 p-1 rounded"><Trash2 className="w-4 h-4"/></button>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}

                    {tab === 'music' && (
                        <>
                            <div className="space-y-3 mb-6 p-3 bg-slate-50 rounded border">
                                <h4 className="text-xs font-bold text-slate-500 uppercase">Add Track Link</h4>
                                <input type="text" placeholder="Track Name" className="w-full p-2 border rounded text-sm" value={musicName} onChange={e => setMusicName(e.target.value)} />
                                <input type="text" placeholder="URL (YouTube / Suno / MP3)" className="w-full p-2 border rounded text-sm" value={musicUrl} onChange={e => setMusicUrl(e.target.value)} />
                                <select className="w-full p-2 border rounded text-sm bg-white" value={musicType} onChange={(e:any) => setMusicType(e.target.value)}>
                                    <option value="Youtube">YouTube</option>
                                    <option value="Suno">Suno / Web / MP3</option>
                                </select>
                                <button onClick={handleAddMusic} disabled={isSubmitting || !musicName || !musicUrl} className="w-full py-2 bg-pink-600 text-white rounded font-bold flex items-center justify-center gap-2 text-sm">
                                    {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin"/> : <><Plus className="w-4 h-4"/> Add Track</>}
                                </button>
                            </div>
                            <div className="space-y-2">
                                {musicTracks.length === 0 ? <p className="text-center text-slate-400 text-sm">No music tracks.</p> : musicTracks.map(m => (
                                    <div key={m.id} className="flex items-center justify-between p-2 bg-slate-50 rounded border group">
                                        <div className="flex items-center gap-2 overflow-hidden">
                                            {m.type === 'Youtube' ? <Youtube className="w-4 h-4 text-red-600"/> : m.type === 'Spotify' ? <div className="w-4 h-4 bg-green-500 rounded-full"/> : <Music className="w-4 h-4 text-blue-500"/>}
                                            <span className="font-bold text-sm truncate max-w-[120px]">{m.name}</span>
                                        </div>
                                        <div className="flex gap-1">
                                            <button onClick={() => onPlayMusic(m)} className="bg-green-100 text-green-700 p-1.5 rounded hover:bg-green-200 text-xs font-bold">Play</button>
                                            <button onClick={() => handleDeleteMusic(m.id)} className="text-red-500 hover:bg-red-50 p-1.5 rounded"><Trash2 className="w-4 h-4"/></button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

const AlertControlModal: React.FC<{ 
    isOpen: boolean; 
    onClose: () => void; 
    alertConfig: AlertConfig; 
    setAlertConfig: (config: AlertConfig) => void;
    adminPin: string;
}> = ({ isOpen, onClose, alertConfig, setAlertConfig, adminPin }) => {
    const [pinInput, setPinInput] = useState('');
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [error, setError] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setPinInput('');
            setIsAuthenticated(false);
            setError(false);
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const handlePinSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (pinInput === adminPin || pinInput === '1234') { // Fallback to 1234
            setIsAuthenticated(true);
        } else {
            setError(true);
            setPinInput('');
        }
    };

    return (
        <div className="fixed inset-0 z-[6000] bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center p-4 border-b bg-indigo-900 text-white">
                    <h3 className="font-bold text-lg flex items-center gap-2"><Megaphone className="w-5 h-5"/> Breaking News Control</h3>
                    <button onClick={onClose}><X className="w-5 h-5 text-indigo-200 hover:text-white"/></button>
                </div>

                <div className="p-6">
                    {!isAuthenticated ? (
                        <div className="text-center">
                            <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4 text-indigo-600">
                                <Lock className="w-6 h-6"/>
                            </div>
                            <h4 className="font-bold text-slate-800 mb-2">Admin Access Required</h4>
                            <form onSubmit={handlePinSubmit}>
                                <input 
                                    type="password" 
                                    value={pinInput}
                                    onChange={e => { setPinInput(e.target.value); setError(false); }}
                                    className={`w-full p-3 text-center text-xl tracking-widest font-mono border rounded-xl mb-3 focus:outline-none focus:ring-2 ${error ? 'border-red-300 bg-red-50 focus:ring-red-200' : 'border-slate-200 focus:ring-indigo-500'}`}
                                    placeholder="Enter PIN"
                                    autoFocus
                                />
                                {error && <p className="text-xs text-red-500 mb-3 font-bold">Incorrect PIN</p>}
                                <button type="submit" className="w-full py-2 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700">Unlock</button>
                            </form>
                        </div>
                    ) : (
                        <div className="space-y-4 animate-in fade-in zoom-in-95 duration-200">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Message</label>
                                <textarea 
                                    className="w-full p-3 border rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-slate-50" 
                                    rows={3} 
                                    placeholder="Type urgent announcement here..."
                                    value={alertConfig.message}
                                    onChange={e => setAlertConfig({...alertConfig, message: e.target.value})}
                                ></textarea>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Alert Type</label>
                                <div className="flex gap-2">
                                    {['info', 'warning', 'urgent'].map(t => (
                                        <button 
                                            key={t}
                                            onClick={() => setAlertConfig({...alertConfig, type: t as any})}
                                            className={`flex-1 py-2 rounded-lg text-xs font-bold capitalize transition-all ${
                                                alertConfig.type === t 
                                                ? (t === 'urgent' ? 'bg-red-600 text-white' : t === 'warning' ? 'bg-orange-500 text-white' : 'bg-indigo-600 text-white')
                                                : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-50'
                                            }`}
                                        >
                                            {t}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <button 
                                onClick={() => setAlertConfig({...alertConfig, isActive: !alertConfig.isActive})}
                                className={`w-full py-4 rounded-xl font-bold text-white flex items-center justify-center gap-2 transition-all shadow-lg ${
                                    alertConfig.isActive 
                                    ? 'bg-slate-800 hover:bg-slate-900' 
                                    : 'bg-green-600 hover:bg-green-700'
                                }`}
                            >
                                {alertConfig.isActive ? <><Monitor className="w-5 h-5"/> HIDE OVERLAY</> : <><Monitor className="w-5 h-5"/> SHOW OVERLAY</>}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const LiveWall: React.FC<LiveWallProps> = ({ matches, teams, players, config, predictions, onClose, onRefresh }) => {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [standingsPage, setStandingsPage] = useState(0);
  const [contestEntries, setContestEntries] = useState<ContestEntry[]>([]);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [uiScale, setUiScale] = useState(1);
  const [countdown, setCountdown] = useState<string>('');
  
  // Sponsors
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Admin Alerts
  const [alertConfig, setAlertConfig] = useState<AlertConfig>({ isActive: false, message: '', type: 'info' });
  const [isAlertControlOpen, setIsAlertControlOpen] = useState(false);

  // Side Panel State
  const [sidePanelIndex, setSidePanelIndex] = useState(0);

  // Music System
  const [musicTracks, setMusicTracks] = useState<MusicTrack[]>([]);
  const [currentTrack, setCurrentTrack] = useState<MusicTrack | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  
  const audioRef = useRef<HTMLAudioElement>(null);
  
  // Slides Configuration
  const slides = [
      'Matches', 'Standings', 'Results', 'TopScorers', 'TopKeepers', 'FanPrediction', 'Highlights', 'Sponsors', 'Versus'
  ];
  const totalSlides = slides.length;

  const announcements = useMemo(() => {
      return config.announcement ? config.announcement.split('|').filter(s => s.trim() !== '') : [];
  }, [config.announcement]);

  const currentUrl = window.location.href.split('?')[0];

  // QR Code Panel Data
  const qrCodes = [
      { label: 'Join Prediction', desc: 'Scan to Play', url: `${currentUrl}?view=schedule`, icon: Zap, color: 'text-yellow-400' },
      { label: 'Photo Contest', desc: 'Share your moments', url: `${currentUrl}?view=contest`, icon: Camera, color: 'text-pink-400' },
      { label: 'Live Standings', desc: 'Check results', url: `${currentUrl}?view=standings`, icon: Activity, color: 'text-green-400' }
  ];

  const loadExtras = async () => {
      try {
          const [contestData, sponsorData, musicData] = await Promise.all([
              fetchContests(),
              fetchSponsors(),
              fetchMusicTracks()
          ]);
          const uniquePhotos = contestData.entries.filter((e, i, a) => a.findIndex(t => t.photoUrl === e.photoUrl) === i);
          setContestEntries(uniquePhotos);
          setSponsors(sponsorData);
          setMusicTracks(musicData);
      } catch (e) {
          console.error("Failed to load live wall extras");
      }
  };

  useEffect(() => {
      loadExtras();
      // Responsive Scaling Logic
      const handleResize = () => {
          const width = window.innerWidth;
          // Base scale on 1920px width. If wider, scale up.
          const newScale = Math.max(1, width / 1920);
          setUiScale(newScale);
      };
      
      window.addEventListener('resize', handleResize);
      handleResize(); // Init
      
      return () => window.removeEventListener('resize', handleResize);
  }, []);

  // --- SIDE PANEL ROTATION ---
  useEffect(() => {
      const interval = setInterval(() => {
          setSidePanelIndex(prev => (prev + 1) % qrCodes.length);
      }, 15000); // Change every 15s
      return () => clearInterval(interval);
  }, []);

  // --- AUDIO LOGIC ---
  const handlePlayMusic = (track: MusicTrack) => {
      setCurrentTrack(track);
      setIsPlaying(true);
      setIsMuted(false); 
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
      const elem = document.documentElement;
      if (elem.requestFullscreen) {
          elem.requestFullscreen();
          // Auto play logic on user interaction
          if (!isPlaying && musicTracks.length > 0) {
              handlePlayMusic(musicTracks[0]);
          }
      }
  };

  // --- KEYBOARD SHORTCUTS ---
  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          // Ignore if typing in an input
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
          }
      };

      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentTrack, isPlaying, musicTracks, isMuted]);

  const handleStartExperience = () => {
      setHasInteracted(true);
      // Play default track if none selected
      if (musicTracks.length > 0 && !currentTrack) {
          handlePlayMusic(musicTracks[0]);
      } else if (currentTrack) {
          setIsPlaying(true);
      }
      
      // Force audio context for HTML5 audio
      if (audioRef.current) {
          audioRef.current.play().catch(e => console.log("Audio play caught", e));
      }
  };

  // Helper to resolve Team Object
  const resolveTeam = (t: string | Team) => typeof t === 'string' ? (teams.find(x => x.name === t) || {name: t, logoUrl:''} as Team) : t;

  // --- DATA PROCESSING MEMOS ---
  const upcomingMatches = useMemo(() => {
      const live = matches.filter(m => m.livestreamUrl && !m.winner);
      const scheduled = matches
        .filter(m => !m.winner && !m.livestreamUrl)
        .sort((a, b) => new Date(a.scheduledTime || a.date).getTime() - new Date(b.scheduledTime || b.date).getTime());
      return [...live, ...scheduled];
  }, [matches]);

  const nextMatch = upcomingMatches.length > 0 ? upcomingMatches[0] : null;

  // Countdown Logic
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

  // Decoupled timer logic to prevent speed up on re-render
  const slideTimerRef = useRef<any>(null);
  
  useEffect(() => {
      const rotate = () => {
          setCurrentSlide(prev => {
              const next = (prev + 1) % totalSlides;
              if (next === 1) setStandingsPage(0); // Reset standing page on entry
              return next;
          });
      };

      slideTimerRef.current = setInterval(rotate, SLIDE_DURATION);
      return () => {
          if (slideTimerRef.current) clearInterval(slideTimerRef.current);
      };
  }, [totalSlides]); // Only depends on totalSlides, NOT data.

  // Sub-rotation for paginated content (Standings, Highlights)
  useEffect(() => {
      let subTimer: any;
      if (currentSlide === 1 && standingsGroups.length > 1) {
          subTimer = setInterval(() => setStandingsPage(p => (p + 1) % standingsGroups.length), 5000);
      }
      if (currentSlide === 6 && contestEntries.length > 1) {
          subTimer = setInterval(() => setHighlightIndex(p => (p + 1) % contestEntries.length), 4000);
      }
      
      // Auto-refresh data logic (Only on specific slides to be less intrusive)
      if (currentSlide === 0) {
          onRefresh(true);
          loadExtras();
      }

      return () => {
          if (subTimer) clearInterval(subTimer);
      };
  }, [currentSlide, standingsGroups.length, contestEntries.length]);

  // --- RENDER MUSIC PLAYER ---
  const renderMusicPlayer = () => {
      if (!currentTrack || !isPlaying) return null;

      if (currentTrack.type === 'Youtube' || (currentTrack.url && currentTrack.url.includes('youtu'))) {
          // Convert regular link to embed
          let videoId = '';
          if (currentTrack.url.includes('v=')) videoId = currentTrack.url.split('v=')[1].split('&')[0];
          else if (currentTrack.url.includes('youtu.be/')) videoId = currentTrack.url.split('youtu.be/')[1].split('?')[0];
          else videoId = currentTrack.url; // Assume ID if no URL pattern match

          // Params: autoplay=1, loop=1, playlist=ID (required for loop), enablejsapi=1 (control)
          const src = `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=${isMuted ? 1 : 0}&loop=1&playlist=${videoId}&controls=0&showinfo=0&modestbranding=1&enablejsapi=1`;
          
          return (
              <div className="absolute top-0 left-0 w-1 h-1 overflow-hidden opacity-0 pointer-events-none">
                  <iframe 
                      width="100%" 
                      height="100%" 
                      src={src} 
                      title="bg-music"
                      frameBorder="0" 
                      allow="autoplay; encrypted-media" 
                      allowFullScreen
                  />
              </div>
          );
      } 
      
      // HTML5 Audio for Direct MP3 or Suno (if direct link available)
      const isDirectAudio = currentTrack.url.match(/\.(mp3|wav|ogg|m4a)$/i);
      
      if (isDirectAudio) {
          return (
              <audio 
                  ref={audioRef}
                  src={currentTrack.url} 
                  autoPlay 
                  loop 
                  muted={isMuted} 
                  onError={handleNextTrack}
                  className="hidden"
              />
          );
      }

      // Fallback iframe for other web players (Suno share pages)
      return (
          <div className="absolute top-0 left-0 w-1 h-1 overflow-hidden opacity-0 pointer-events-none">
             <iframe src={currentTrack.url} allow="autoplay" />
          </div>
      );
  };

  const CurrentIcon = qrCodes[sidePanelIndex].icon;

  if (!hasInteracted) {
      return (
          <div className="fixed inset-0 z-[5000] bg-slate-950 flex flex-col items-center justify-center cursor-pointer" onClick={handleStartExperience}>
              <div className="animate-pulse mb-4 p-6 bg-white/10 rounded-full">
                  <Play className="w-20 h-20 text-indigo-500 fill-indigo-500" />
              </div>
              <h1 className="text-3xl font-black text-white uppercase tracking-widest mb-2">{config.competitionName}</h1>
              <p className="text-slate-400 font-bold text-lg animate-bounce">CLICK ANYWHERE TO START</p>
              <p className="text-xs text-slate-600 mt-4">Enabling Audio & Visuals</p>
          </div>
      );
  }

  return (
    <div className="fixed inset-0 z-[5000] bg-slate-950 text-white overflow-hidden flex flex-col font-kanit select-none cursor-none" style={{ fontFamily: "'Kanit', sans-serif" }}>
        
        <SettingsManagerModal 
            isOpen={isSettingsOpen} 
            onClose={() => setIsSettingsOpen(false)} 
            sponsors={sponsors} 
            onUpdateSponsors={loadExtras}
            musicTracks={musicTracks}
            onUpdateMusic={loadExtras}
            onPlayMusic={handlePlayMusic}
        />

        <AlertControlModal 
            isOpen={isAlertControlOpen}
            onClose={() => setIsAlertControlOpen(false)}
            alertConfig={alertConfig}
            setAlertConfig={setAlertConfig}
            adminPin={String(config.adminPin || "1234")}
        />

        {renderMusicPlayer()}

        {/* ALERT OVERLAY */}
        {alertConfig.isActive && (
            <div className={`fixed top-24 left-0 right-0 z-[6000] p-4 flex justify-center animate-in slide-in-from-top-10 duration-500`}>
                <div className={`
                    max-w-4xl w-full rounded-2xl shadow-2xl border-l-8 p-6 flex items-start gap-4 backdrop-blur-md
                    ${alertConfig.type === 'urgent' ? 'bg-red-600/90 border-red-800 text-white animate-pulse' : 
                      alertConfig.type === 'warning' ? 'bg-orange-500/90 border-orange-700 text-white' : 
                      'bg-indigo-600/90 border-indigo-800 text-white'}
                `}>
                    <div className="bg-white/20 p-3 rounded-full shrink-0">
                        {alertConfig.type === 'urgent' ? <Megaphone className="w-8 h-8 animate-bounce" /> : <Info className="w-8 h-8" />}
                    </div>
                    <div>
                        <h3 className="font-black text-xl uppercase tracking-widest mb-1">
                            {alertConfig.type === 'urgent' ? 'BREAKING NEWS' : alertConfig.type === 'warning' ? 'ANNOUNCEMENT' : 'UPDATE'}
                        </h3>
                        <p className="text-lg font-medium leading-relaxed opacity-95">{alertConfig.message}</p>
                    </div>
                </div>
            </div>
        )}

        {/* FLOATING ALERT CONTROL BUTTON */}
        <button 
            onClick={() => setIsAlertControlOpen(true)}
            className="fixed bottom-28 left-4 z-[7000] bg-white/10 hover:bg-white/30 backdrop-blur-sm p-3 rounded-full text-slate-300 hover:text-white transition group border border-white/10 shadow-lg"
            title="Manage Alert"
        >
            <MessageSquare className="w-6 h-6 group-hover:scale-110 transition-transform" />
        </button>

        {/* ANIMATED BACKGROUND */}
        <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
            <div className="absolute top-[-50%] left-[-50%] w-[200%] h-[200%] bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-indigo-900/40 via-slate-950 to-black animate-slow-spin opacity-50"></div>
            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-20 mix-blend-overlay"></div>
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]"></div>
        </div>

        {/* SIDE PANEL (Rotating QR) */}
        <div className="absolute right-0 top-24 bottom-24 w-24 md:w-32 z-40 flex flex-col items-center justify-center pointer-events-none pr-4">
            <div className="bg-slate-900/80 backdrop-blur-md border border-slate-700 rounded-2xl p-3 flex flex-col items-center gap-3 shadow-2xl animate-in slide-in-from-right duration-700">
                <div className={`p-2 rounded-full bg-white/10 ${qrCodes[sidePanelIndex].color} animate-pulse`}>
                    <CurrentIcon className="w-6 h-6" />
                </div>
                <div className="bg-white p-1 rounded-lg">
                    <img 
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(qrCodes[sidePanelIndex].url)}`} 
                        className="w-20 h-20 md:w-24 md:h-24 object-contain"
                    />
                </div>
                <div className="text-center">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{qrCodes[sidePanelIndex].desc}</div>
                    <div className="text-xs font-black text-white leading-tight">{qrCodes[sidePanelIndex].label}</div>
                </div>
                {/* Progress Indicator */}
                <div className="flex gap-1 mt-2">
                    {qrCodes.map((_, idx) => (
                        <div key={idx} className={`w-1.5 h-1.5 rounded-full transition-all duration-500 ${idx === sidePanelIndex ? 'bg-white scale-125' : 'bg-slate-600'}`}></div>
                    ))}
                </div>
            </div>
        </div>

        {/* TOP BAR - Fixed Scale relative to viewport height/width or just keep it static and scalable via wrapper */}
        <div className="h-24 bg-gradient-to-b from-slate-900 to-transparent flex items-center justify-between px-8 relative z-20 pt-4 group shrink-0">
            <div className="flex items-center gap-6">
                <div className="w-16 h-16 bg-white/10 backdrop-blur-md rounded-2xl p-2 shadow-[0_0_20px_rgba(99,102,241,0.3)] border border-white/20">
                    <img src={config.competitionLogo} className="w-full h-full object-contain drop-shadow-md" />
                </div>
                <div>
                    <h1 className="text-4xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-white via-indigo-100 to-indigo-300 uppercase drop-shadow-sm">
                        {config.competitionName}
                    </h1>
                    <div className="flex items-center gap-3 mt-1">
                        <span className="flex h-3 w-3 relative">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                        </span>
                        <span className="text-sm font-bold text-red-400 tracking-widest uppercase">Live Coverage</span>
                        {currentTrack ? (
                            <div className={`flex items-center gap-2 ml-4 bg-white/10 px-3 py-1 rounded-full cursor-pointer hover:bg-white/20 transition ${!isPlaying ? 'opacity-50 grayscale' : ''}`} onClick={toggleMute}>
                                {/* Audio Visualizer Animation */}
                                {isPlaying ? (
                                    <div className="flex gap-0.5 items-end h-3">
                                        <span className={`w-1 bg-indigo-400 rounded-t ${!isMuted ? 'animate-[bounce_0.5s_infinite]' : 'h-1'}`}></span>
                                        <span className={`w-1 bg-indigo-400 rounded-t ${!isMuted ? 'animate-[bounce_0.7s_infinite]' : 'h-1'}`}></span>
                                        <span className={`w-1 bg-indigo-400 rounded-t ${!isMuted ? 'animate-[bounce_0.4s_infinite]' : 'h-1'}`}></span>
                                        <span className={`w-1 bg-indigo-400 rounded-t ${!isMuted ? 'animate-[bounce_0.6s_infinite]' : 'h-1'}`}></span>
                                    </div>
                                ) : (
                                    <Pause className="w-3 h-3 text-yellow-400" />
                                )}
                                <span className="text-xs text-indigo-300 max-w-[150px] truncate font-mono">{currentTrack.name}</span>
                                {isMuted ? <VolumeX className="w-3 h-3 text-red-400 ml-1" /> : <Volume2 className="w-3 h-3 text-green-400 ml-1" />}
                            </div>
                        ) : (
                            <div className="flex items-center gap-1 ml-4 text-xs text-slate-500"><VolumeX className="w-3 h-3"/> Audio Off</div>
                        )}
                    </div>
                </div>
            </div>
            
            <div className="flex items-center gap-8">
                <div className="bg-white p-1 rounded-lg shadow-lg flex items-center gap-2 pr-3">
                    <img src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(currentUrl)}`} className="w-12 h-12" />
                    <div className="text-slate-900 leading-tight">
                        <div className="text-[10px] font-bold uppercase">Scan to</div>
                        <div className="text-sm font-black">PLAY NOW</div>
                    </div>
                </div>

                <div className="h-12 w-[1px] bg-slate-700"></div>

                <div className="text-right">
                    <div className="text-5xl font-black font-mono leading-none tracking-widest text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.6)]">
                        {currentTime.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                    <div className="text-sm text-slate-400 font-bold uppercase tracking-widest mt-1">
                        {currentTime.toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                    </div>
                </div>
                
                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <button onClick={() => setIsSettingsOpen(true)} className="p-3 bg-slate-800 hover:bg-slate-700 rounded-full text-indigo-400 hover:text-white transition backdrop-blur-sm"><Settings className="w-6 h-6"/></button>
                    {currentTrack && <button onClick={handleNextTrack} className="p-3 bg-slate-800 hover:bg-slate-700 rounded-full text-indigo-400 hover:text-white transition backdrop-blur-sm"><SkipForward className="w-6 h-6"/></button>}
                    <button onClick={enterFullScreen} className="p-3 bg-white/5 hover:bg-white/10 rounded-full text-slate-300 hover:text-white transition backdrop-blur-sm"><Maximize2 className="w-6 h-6"/></button>
                    <button onClick={onClose} className="p-3 bg-red-500/10 hover:bg-red-500/20 rounded-full text-red-400 hover:text-red-300 transition backdrop-blur-sm"><X className="w-6 h-6"/></button>
                </div>
            </div>
        </div>

        {/* MAIN CONTENT AREA with Dynamic Scaling for Large Screens */}
        <div 
            className="flex-1 relative z-10 w-full h-full flex flex-col p-8 pb-4 origin-center transition-transform duration-300"
            style={{ 
                transform: `scale(${uiScale})`,
                width: `${100 / uiScale}%`,
                height: `${100 / uiScale}%`,
                marginLeft: `${(100 - (100/uiScale)) / 2}%` // Center correction
            }}
        >
            
            {/* SLIDE 0: MATCH CENTER */}
            {currentSlide === 0 && (
                <div className="h-full flex flex-col animate-in fade-in zoom-in-95 duration-1000">
                    <div className="flex items-center gap-4 mb-8">
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
                                        <div key={m.id} className={`relative bg-slate-900/60 backdrop-blur-xl rounded-3xl border p-6 flex items-center justify-between transition-all duration-500 ${isLive ? 'border-red-500/50 shadow-[0_0_40px_rgba(220,38,38,0.15)] bg-gradient-to-r from-red-950/30 to-slate-900/60' : 'border-white/10'} ${idx === 0 ? 'scale-105 z-10' : 'scale-100 opacity-90'}`}>
                                            <div className="flex items-center gap-6 w-[40%]">
                                                <div className="w-20 h-20 bg-white/5 rounded-2xl p-2 shadow-inner border border-white/5 flex items-center justify-center shrink-0">
                                                    {tA.logoUrl ? <img src={tA.logoUrl} className="w-full h-full object-contain drop-shadow-md"/> : <div className="text-2xl font-black text-slate-600">{tA.name.substring(0,1)}</div>}
                                                </div>
                                                <span className="text-3xl font-bold truncate text-white">{tA.name}</span>
                                            </div>
                                            <div className="flex flex-col items-center w-[20%] relative">
                                                {isLive ? (
                                                    <div className="absolute -top-10 bg-red-600 text-white px-3 py-0.5 rounded text-xs font-bold uppercase tracking-wider animate-pulse shadow-lg">Live</div>
                                                ) : (
                                                    <div className="absolute -top-10 bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-3 py-0.5 rounded text-xs font-bold uppercase tracking-wider">
                                                        {new Date(m.scheduledTime || m.date).toLocaleTimeString('th-TH', {hour:'2-digit', minute:'2-digit'})}
                                                    </div>
                                                )}
                                                <div className="flex items-center gap-4 text-6xl font-black font-mono tracking-tighter text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]">
                                                    <span>{m.scoreA}</span>
                                                    <span className="text-slate-600 text-4xl">:</span>
                                                    <span>{m.scoreB}</span>
                                                </div>
                                                <div className="text-indigo-400 font-bold text-sm tracking-widest mt-2">{m.roundLabel?.split(':')[0]}</div>
                                            </div>
                                            <div className="flex items-center gap-6 w-[40%] justify-end">
                                                <span className="text-3xl font-bold truncate text-right text-white">{tB.name}</span>
                                                <div className="w-20 h-20 bg-white/5 rounded-2xl p-2 shadow-inner border border-white/5 flex items-center justify-center shrink-0">
                                                    {tB.logoUrl ? <img src={tB.logoUrl} className="w-full h-full object-contain drop-shadow-md"/> : <div className="text-2xl font-black text-slate-600">{tB.name.substring(0,1)}</div>}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="text-center opacity-40 flex flex-col items-center">
                                <div className="w-32 h-32 bg-white/5 rounded-full flex items-center justify-center mb-6 animate-pulse"><Clock className="w-16 h-16 text-slate-400" /></div>
                                <h3 className="text-4xl font-black tracking-widest">NO MATCHES NOW</h3>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* SLIDE 1: STANDINGS */}
            {currentSlide === 1 && (
                <div className="h-full flex flex-col animate-in fade-in slide-in-from-right-10 duration-1000">
                    <div className="flex items-center justify-between mb-8">
                        <div className="flex items-center gap-4">
                            <div className="bg-indigo-600 p-2 rounded-lg shadow-[0_0_20px_rgba(79,70,229,0.5)]"><Trophy className="w-8 h-8 text-white" /></div>
                            <h2 className="text-4xl font-black text-white uppercase tracking-tight">Current Standings</h2>
                        </div>
                        {standingsGroups.length > 1 && (
                            <div className="flex items-center gap-2">
                                {standingsGroups.map((_, idx) => (
                                    <div key={idx} className={`h-2 transition-all duration-300 rounded-full ${idx === standingsPage ? 'w-8 bg-white' : 'w-2 bg-white/20'}`}></div>
                                ))}
                            </div>
                        )}
                    </div>
                    <div className="flex-1 relative">
                        {standingsGroups.length > 0 ? (
                            <div className="grid grid-cols-2 gap-8 content-start animate-in fade-in zoom-in-95 duration-1000 key={standingsPage}">
                                {standingsGroups[standingsPage]?.map(group => (
                                    <div key={group.name} className="bg-slate-900/80 border border-white/10 rounded-2xl overflow-hidden backdrop-blur-md shadow-2xl">
                                        <div className="bg-gradient-to-r from-indigo-900/50 to-slate-900/50 px-6 py-4 border-b border-white/5 flex justify-between items-center">
                                            <h3 className="font-black text-2xl text-white flex items-center gap-2"><span className="text-indigo-400">GROUP</span> {group.name}</h3>
                                            <div className="text-xs font-bold text-slate-500 bg-white/5 px-2 py-1 rounded">Top 2 Qualify</div>
                                        </div>
                                        <table className="w-full text-lg">
                                            <thead className="bg-white/5 text-slate-400 text-sm uppercase tracking-wider font-bold">
                                                <tr><th className="p-3 text-left pl-6 w-[50%]">Team</th><th className="p-3 text-center">P</th><th className="p-3 text-center">GD</th><th className="p-3 text-center text-white bg-white/5">PTS</th></tr>
                                            </thead>
                                            <tbody className="divide-y divide-white/5">
                                                {group.teams.map((team, idx) => (
                                                    <tr key={team.teamId} className={`transition-colors ${idx < 2 ? "bg-green-500/5" : ""}`}>
                                                        <td className="p-3 pl-6 font-bold flex items-center gap-4">
                                                            <div className={`w-6 h-6 rounded flex items-center justify-center text-xs font-black ${idx < 2 ? 'bg-green-500 text-black' : 'bg-slate-700 text-slate-400'}`}>{idx+1}</div>
                                                            {team.logoUrl && <img src={team.logoUrl} className="w-8 h-8 object-contain" />}
                                                            <span className="truncate max-w-[220px] text-xl">{team.teamName}</span>
                                                        </td>
                                                        <td className="p-3 text-center text-slate-400 font-mono">{team.played}</td>
                                                        <td className="p-3 text-center text-slate-400 font-mono">{team.goalsFor - team.goalsAgainst}</td>
                                                        <td className="p-3 text-center font-black text-yellow-400 text-2xl bg-white/5">{team.points}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                ))}
                            </div>
                        ) : <div className="flex items-center justify-center h-full text-slate-500 text-2xl font-bold">Waiting for standings...</div>}
                    </div>
                </div>
            )}

            {/* SLIDE 2: RECENT RESULTS */}
            {currentSlide === 2 && (
                <div className="h-full flex flex-col animate-in fade-in slide-in-from-bottom-10 duration-1000">
                    <div className="flex items-center gap-4 mb-8">
                        <div className="bg-green-600 p-2 rounded-lg shadow-[0_0_20px_rgba(22,163,74,0.5)]"><Award className="w-8 h-8 text-white" /></div>
                        <h2 className="text-4xl font-black text-white uppercase tracking-tight">Match Results</h2>
                    </div>
                    
                    {recentResults.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 flex-1 content-center">
                            {recentResults.map((m) => {
                                const tA = resolveTeam(m.teamA);
                                const tB = resolveTeam(m.teamB);
                                const winnerA = m.winner === 'A' || m.winner === tA.name;
                                const winnerB = m.winner === 'B' || m.winner === tB.name;

                                return (
                                    <div key={m.id} className="relative bg-slate-900/80 backdrop-blur-md rounded-2xl border border-white/10 p-0 overflow-hidden shadow-2xl transition-all duration-500">
                                        <div className="bg-white/5 px-4 py-2 flex justify-between items-center text-xs font-bold text-slate-400">
                                            <span>{new Date(m.date).toLocaleDateString('th-TH', {day:'numeric', month:'short'})}</span>
                                            <span className="uppercase tracking-widest">{m.roundLabel?.split(':')[0] || 'Match'}</span>
                                        </div>
                                        
                                        <div className="p-6 flex items-center justify-between">
                                            {/* Team A */}
                                            <div className={`flex flex-col items-center gap-3 flex-1 ${winnerA ? 'opacity-100 scale-105' : 'opacity-60 grayscale-[0.5]'}`}>
                                                <div className={`w-20 h-20 rounded-2xl p-2 flex items-center justify-center bg-gradient-to-br ${winnerA ? 'from-green-500/20 to-emerald-900/40 border border-green-500/50 shadow-[0_0_20px_rgba(34,197,94,0.2)]' : 'from-slate-800 to-slate-900 border border-white/5'}`}>
                                                    {tA.logoUrl ? <img src={tA.logoUrl} className="w-full h-full object-contain drop-shadow-md"/> : <div className="text-2xl font-black text-slate-500">{tA.name.substring(0,1)}</div>}
                                                </div>
                                                <span className={`text-sm font-bold text-center leading-tight ${winnerA ? 'text-white' : 'text-slate-400'}`}>{tA.name}</span>
                                            </div>

                                            {/* Score */}
                                            <div className="flex flex-col items-center px-4">
                                                <div className="text-5xl font-black font-mono text-white tracking-tighter drop-shadow-[0_4px_10px_rgba(0,0,0,0.5)]">
                                                    {m.scoreA}-{m.scoreB}
                                                </div>
                                                <div className="mt-2 bg-white/10 px-2 py-0.5 rounded text-[10px] font-bold text-yellow-400 border border-yellow-500/30 uppercase tracking-widest">
                                                    Full Time
                                                </div>
                                            </div>

                                            {/* Team B */}
                                            <div className={`flex flex-col items-center gap-3 flex-1 ${winnerB ? 'opacity-100 scale-105' : 'opacity-60 grayscale-[0.5]'}`}>
                                                <div className={`w-20 h-20 rounded-2xl p-2 flex items-center justify-center bg-gradient-to-br ${winnerB ? 'from-green-500/20 to-emerald-900/40 border border-green-500/50 shadow-[0_0_20px_rgba(34,197,94,0.2)]' : 'from-slate-800 to-slate-900 border border-white/5'}`}>
                                                    {tB.logoUrl ? <img src={tB.logoUrl} className="w-full h-full object-contain drop-shadow-md"/> : <div className="text-2xl font-black text-slate-500">{tB.name.substring(0,1)}</div>}
                                                </div>
                                                <span className={`text-sm font-bold text-center leading-tight ${winnerB ? 'text-white' : 'text-slate-400'}`}>{tB.name}</span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="flex-1 flex items-center justify-center text-slate-500 text-2xl font-bold">No finished matches yet</div>
                    )}
                </div>
            )}

            {/* SLIDE 3: TOP SCORERS */}
            {currentSlide === 3 && (
                <div className="h-full flex flex-col animate-in zoom-in-95 duration-1000">
                    <div className="text-center mb-8">
                        <h2 className="text-5xl font-black text-yellow-400 uppercase tracking-tighter drop-shadow-lg">Golden Boot</h2>
                        <p className="text-slate-400 font-bold uppercase tracking-widest mt-1">Top Goal Scorers</p>
                    </div>
                    {topScorers.length > 0 ? (
                        <div className="flex-1 flex items-end justify-center gap-8 pb-12">
                            {/* 2nd */}
                            {topScorers[1] && (
                                <div className="flex flex-col items-center w-64 animate-in slide-in-from-bottom-20 duration-1000 delay-100">
                                    <div className="w-32 h-32 bg-slate-800 rounded-full mb-4 border-4 border-slate-600 overflow-hidden shadow-2xl">
                                        {topScorers[1].photoUrl ? <img src={topScorers[1].photoUrl} className="w-full h-full object-cover"/> : <User className="w-full h-full p-6 text-slate-600"/>}
                                    </div>
                                    <div className="bg-slate-800 w-full p-4 rounded-t-2xl text-center border-t-4 border-slate-500 relative">
                                        <div className="absolute -top-5 left-1/2 -translate-x-1/2 bg-slate-600 text-white w-10 h-10 rounded-full flex items-center justify-center font-black border-4 border-slate-800">2</div>
                                        <h3 className="font-bold text-lg truncate mt-2">{topScorers[1].name}</h3>
                                        <p className="text-xs text-slate-400 uppercase mb-2">{topScorers[1].team}</p>
                                        <div className="text-4xl font-black text-white">{topScorers[1].goals}</div>
                                        <div className="text-[10px] uppercase font-bold text-slate-500">Goals</div>
                                    </div>
                                    <div className="h-32 w-full bg-slate-800/50 rounded-b-lg"></div>
                                </div>
                            )}
                            {/* 1st */}
                            {topScorers[0] && (
                                <div className="flex flex-col items-center w-72 z-10 animate-in slide-in-from-bottom-32 duration-1000">
                                    <Trophy className="w-16 h-16 text-yellow-400 mb-4 animate-bounce" />
                                    <div className="w-40 h-40 bg-yellow-500 rounded-full mb-4 border-4 border-yellow-300 overflow-hidden shadow-[0_0_50px_rgba(234,179,8,0.4)]">
                                        {topScorers[0].photoUrl ? <img src={topScorers[0].photoUrl} className="w-full h-full object-cover"/> : <User className="w-full h-full p-8 text-yellow-800"/>}
                                    </div>
                                    <div className="bg-gradient-to-b from-yellow-600 to-yellow-700 w-full p-6 rounded-t-3xl text-center border-t-4 border-yellow-300 relative shadow-2xl">
                                        <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-yellow-400 text-yellow-900 w-12 h-12 rounded-full flex items-center justify-center font-black text-2xl border-4 border-yellow-600">1</div>
                                        <h3 className="font-black text-2xl truncate mt-2 text-white">{topScorers[0].name}</h3>
                                        <p className="text-sm text-yellow-200 uppercase mb-3 font-bold">{topScorers[0].team}</p>
                                        <div className="text-6xl font-black text-white drop-shadow-md">{topScorers[0].goals}</div>
                                        <div className="text-xs uppercase font-bold text-yellow-200/80 tracking-widest">Goals Scored</div>
                                    </div>
                                    <div className="h-48 w-full bg-yellow-800/50 rounded-b-lg"></div>
                                </div>
                            )}
                            {/* 3rd */}
                            {topScorers[2] && (
                                <div className="flex flex-col items-center w-64 animate-in slide-in-from-bottom-20 duration-1000 delay-200">
                                    <div className="w-32 h-32 bg-orange-800 rounded-full mb-4 border-4 border-orange-600 overflow-hidden shadow-2xl">
                                        {topScorers[2].photoUrl ? <img src={topScorers[2].photoUrl} className="w-full h-full object-cover"/> : <User className="w-full h-full p-6 text-orange-600"/>}
                                    </div>
                                    <div className="bg-orange-900 w-full p-4 rounded-t-2xl text-center border-t-4 border-orange-600 relative">
                                        <div className="absolute -top-5 left-1/2 -translate-x-1/2 bg-orange-600 text-white w-10 h-10 rounded-full flex items-center justify-center font-black border-4 border-orange-900">3</div>
                                        <h3 className="font-bold text-lg truncate mt-2 text-orange-100">{topScorers[2].name}</h3>
                                        <p className="text-xs text-orange-400 uppercase mb-2">{topScorers[2].team}</p>
                                        <div className="text-4xl font-black text-white">{topScorers[2].goals}</div>
                                        <div className="text-[10px] uppercase font-bold text-orange-400">Goals</div>
                                    </div>
                                    <div className="h-24 w-full bg-orange-950/50 rounded-b-lg"></div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="flex-1 flex items-center justify-center text-slate-500 text-2xl font-bold">No Goalscorers Yet</div>
                    )}
                </div>
            )}

            {/* SLIDE 4: TOP KEEPERS */}
            {currentSlide === 4 && (
                <div className="h-full flex flex-col animate-in fade-in slide-in-from-right-10 duration-1000">
                    <div className="flex items-center gap-4 mb-8">
                        <div className="bg-blue-600 p-2 rounded-lg shadow-[0_0_20px_rgba(37,99,235,0.5)]"><Hand className="w-8 h-8 text-white" /></div>
                        <h2 className="text-4xl font-black text-white uppercase tracking-tight">Golden Glove</h2>
                    </div>
                    <div className="grid grid-cols-2 gap-6">
                        {topKeepers.length > 0 ? topKeepers.map((k, idx) => (
                            <div key={idx} className="bg-slate-900/80 border border-blue-500/20 rounded-2xl p-6 flex items-center justify-between shadow-lg">
                                <div className="flex items-center gap-4">
                                    <div className={`w-12 h-12 rounded-full flex items-center justify-center font-black text-xl ${idx === 0 ? 'bg-yellow-400 text-yellow-900' : 'bg-slate-700 text-white'}`}>{idx+1}</div>
                                    <div>
                                        <h3 className="text-xl font-bold">{k.teamName}</h3>
                                        <p className="text-xs text-blue-400 uppercase font-bold">Goalkeeper</p>
                                    </div>
                                </div>
                                <div className="flex gap-4 text-center">
                                    <div>
                                        <div className="text-3xl font-black text-white">{k.cleanSheets}</div>
                                        <div className="text-[10px] uppercase text-slate-500 font-bold">Clean Sheets</div>
                                    </div>
                                    <div>
                                        <div className="text-3xl font-black text-blue-400">{k.saves}</div>
                                        <div className="text-[10px] uppercase text-slate-500 font-bold">PK Saves</div>
                                    </div>
                                </div>
                            </div>
                        )) : <div className="col-span-2 flex items-center justify-center h-64 text-slate-500 text-2xl font-bold">No Goalkeeper Data</div>}
                    </div>
                </div>
            )}

            {/* SLIDE 5: FAN PREDICTION */}
            {currentSlide === 5 && (
                <div className="h-full flex flex-col animate-in zoom-in-95 duration-1000 relative">
                    <div className="text-center mb-8">
                        <h2 className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400 uppercase tracking-tighter drop-shadow-lg">Fan Zone Leaderboard</h2>
                    </div>
                    <div className="flex-1 flex flex-col gap-4 max-w-4xl mx-auto w-full">
                        {fanRankings.length > 0 ? fanRankings.map((fan, idx) => (
                            <div key={idx} className={`bg-white/5 rounded-2xl p-4 flex items-center justify-between border border-white/10 ${idx === 0 ? 'bg-gradient-to-r from-yellow-500/20 to-purple-500/20 border-yellow-500/50' : ''}`}>
                                <div className="flex items-center gap-4">
                                    <div className={`w-10 h-10 flex items-center justify-center font-black rounded-full ${idx < 3 ? 'bg-white text-black' : 'bg-slate-700 text-slate-400'}`}>
                                        {idx + 1}
                                    </div>
                                    <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-white/20">
                                        {fan.pic ? <img src={fan.pic} className="w-full h-full object-cover"/> : <User className="w-full h-full p-2 text-slate-500 bg-slate-800"/>}
                                    </div>
                                    <span className="text-xl font-bold">{fan.name}</span>
                                </div>
                                <div className="text-right">
                                    <div className="text-3xl font-black text-purple-400">{fan.points} <span className="text-sm text-slate-500 font-bold">PTS</span></div>
                                    <div className="text-xs text-slate-400">Correct: {fan.correct}</div>
                                </div>
                            </div>
                        )) : <div className="flex items-center justify-center h-full text-slate-500 text-2xl font-bold">No Predictions Yet</div>}
                    </div>
                </div>
            )}

            {/* SLIDE 6: HIGHLIGHTS */}
            {currentSlide === 6 && (
                contestEntries.length > 0 ? (
                    <div className="h-full flex flex-col items-center justify-center relative overflow-hidden rounded-3xl">
                        <div className="absolute inset-0 z-0">
                            <img 
                                src={contestEntries[highlightIndex].photoUrl} 
                                className="w-full h-full object-cover blur-3xl opacity-30 scale-110" 
                            />
                        </div>
                        <div className="relative z-10 flex flex-col items-center animate-in zoom-in duration-1000 w-full max-w-4xl">
                            <div className="relative w-full aspect-video rounded-3xl overflow-hidden shadow-2xl border-4 border-white/20 group">
                                <img 
                                    src={contestEntries[highlightIndex].photoUrl} 
                                    className="w-full h-full object-cover transform scale-105 transition-transform duration-[20s] ease-linear" 
                                />
                                <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent p-8">
                                    <div className="flex items-center gap-4">
                                        <img src={contestEntries[highlightIndex].userPictureUrl} className="w-12 h-12 rounded-full border-2 border-white" />
                                        <div>
                                            <h3 className="text-2xl font-bold text-white">{contestEntries[highlightIndex].caption}</h3>
                                            <p className="text-slate-300 font-medium">By {contestEntries[highlightIndex].userDisplayName}</p>
                                        </div>
                                        <div className="ml-auto flex items-center gap-2 bg-pink-600 px-4 py-2 rounded-full">
                                            <Heart className="w-5 h-5 fill-white" />
                                            <span className="font-bold text-xl">{contestEntries[highlightIndex].likeCount}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <h2 className="text-3xl font-black text-white uppercase tracking-widest mt-8 flex items-center gap-3">
                                <Camera className="w-8 h-8 text-pink-500" /> Photo Contest Highlights
                            </h2>
                        </div>
                    </div>
                ) : <div className="flex items-center justify-center h-full text-slate-500 text-2xl font-bold">No Photos Yet</div>
            )}

            {/* SLIDE 7: SPONSORS (SPECTACULAR REDESIGN) */}
            {currentSlide === 7 && (
                <div className="h-full w-full flex flex-col items-center justify-center relative overflow-hidden">
                    {/* Background Effects */}
                    <div className="absolute inset-0 bg-slate-900">
                        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-20"></div>
                        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full bg-gradient-to-b from-indigo-900/50 via-slate-900 to-black pointer-events-none"></div>
                        {/* Moving Spotlights */}
                        <div className="absolute top-[-50%] left-[-50%] w-[200%] h-[200%] bg-[conic-gradient(from_0deg_at_50%_50%,transparent_0deg,rgba(99,102,241,0.1)_60deg,transparent_120deg)] animate-slow-spin opacity-50"></div>
                    </div>

                    <div className="relative z-10 w-full max-w-7xl px-8 flex flex-col items-center justify-center h-full">
                        
                        <div className="text-center mb-16 animate-in slide-in-from-top-10 duration-1000">
                            <div className="inline-flex items-center gap-3 bg-white/10 backdrop-blur-md px-6 py-2 rounded-full border border-white/20 shadow-[0_0_30px_rgba(255,255,255,0.1)] mb-4">
                                <Star className="w-5 h-5 text-yellow-400 fill-yellow-400 animate-pulse" />
                                <span className="text-sm font-bold text-white tracking-widest uppercase">Premium Partners</span>
                                <Star className="w-5 h-5 text-yellow-400 fill-yellow-400 animate-pulse" />
                            </div>
                            <h2 className="text-6xl md:text-8xl font-black text-transparent bg-clip-text bg-gradient-to-b from-white via-indigo-100 to-slate-500 uppercase tracking-tighter drop-shadow-2xl">
                                Official Sponsors
                            </h2>
                        </div>

                        {/* Sponsor Showcase Grid - 3D Perspective */}
                        {sponsors.length > 0 ? (
                            <div className="grid grid-cols-3 gap-12 w-full perspective-1000">
                                {sponsors.map((s, idx) => (
                                    <div 
                                        key={s.id} 
                                        className="relative aspect-video bg-white/5 backdrop-blur-xl rounded-3xl border border-white/10 flex items-center justify-center p-8 animate-in zoom-in slide-in-from-bottom-10 fill-mode-backwards animate-pulse-slow"
                                        style={{ animationDelay: `${idx * 200}ms` }}
                                    >
                                        <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 to-transparent opacity-50 rounded-3xl"></div>
                                        {/* Sparkle Effect */}
                                        <div className="absolute -top-2 -right-2 opacity-80">
                                            <Sparkles className="w-8 h-8 text-yellow-300 animate-pulse" />
                                        </div>
                                        
                                        <img 
                                            src={s.logoUrl} 
                                            className="w-full h-full object-contain filter drop-shadow-xl" 
                                            alt={s.name} 
                                        />
                                        
                                        {/* Name Label */}
                                        <div className="absolute bottom-4 left-0 right-0 text-center">
                                            <span className="text-sm font-bold text-white bg-black/50 px-3 py-1 rounded-full backdrop-blur-sm">
                                                {s.name}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="flex flex-col items-center animate-pulse">
                                <div className="w-32 h-32 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-4">
                                    <Zap className="w-12 h-12 text-yellow-400" />
                                </div>
                                <div className="text-3xl font-bold text-slate-500">Become a Partner</div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* SLIDE 8: VERSUS / COMING UP NEXT */}
            {currentSlide === 8 && (
                <div className="h-full w-full relative overflow-hidden bg-slate-950 flex flex-col animate-in fade-in duration-1000">
                    {/* Dynamic Backgrounds based on team colors if possible, otherwise generic */}
                    {nextMatch ? (
                        <>
                            {/* Background Split */}
                            <div className="absolute inset-0 z-0 flex">
                                <div className="w-1/2 h-full bg-gradient-to-r from-blue-900 to-slate-900 opacity-50 relative overflow-hidden">
                                    <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-20"></div>
                                    {/* Animated Particles */}
                                    <div className="absolute bottom-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_bottom_left,_var(--tw-gradient-stops))] from-blue-500/20 to-transparent animate-pulse"></div>
                                </div>
                                <div className="w-1/2 h-full bg-gradient-to-l from-red-900 to-slate-900 opacity-50 relative overflow-hidden">
                                    <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-20"></div>
                                    <div className="absolute bottom-0 right-0 w-full h-full bg-[radial-gradient(ellipse_at_bottom_right,_var(--tw-gradient-stops))] from-red-500/20 to-transparent animate-pulse"></div>
                                </div>
                            </div>

                            {/* Content */}
                            <div className="relative z-10 flex-1 flex flex-col justify-center items-center w-full max-w-7xl mx-auto px-4">
                                
                                {/* Header */}
                                <div className="text-center mb-8">
                                    <span className="bg-white/10 backdrop-blur-md border border-white/20 px-4 py-1 rounded-full text-indigo-300 font-bold tracking-widest text-sm uppercase mb-2 inline-block">
                                        Coming Up Next
                                    </span>
                                    <h2 className="text-4xl font-black text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.5)]">
                                        {nextMatch.roundLabel?.split(':')[0] || 'MATCH DAY'}
                                    </h2>
                                </div>

                                {/* VS Section */}
                                <div className="flex items-center justify-center w-full gap-8 md:gap-20">
                                    {/* Team A */}
                                    <div className="flex flex-col items-center w-1/3 animate-in slide-in-from-left-20 duration-1000">
                                        <div className="w-48 h-48 md:w-64 md:h-64 bg-white/5 rounded-full p-4 border-4 border-blue-500/50 shadow-[0_0_60px_rgba(59,130,246,0.3)] backdrop-blur-sm flex items-center justify-center mb-6 relative group">
                                            <div className="absolute inset-0 rounded-full border-2 border-white/10 animate-[spin_10s_linear_infinite]"></div>
                                            {resolveTeam(nextMatch.teamA).logoUrl ? (
                                                <img src={resolveTeam(nextMatch.teamA).logoUrl} className="w-full h-full object-contain drop-shadow-2xl transform group-hover:scale-110 transition duration-500" />
                                            ) : (
                                                <div className="text-8xl font-black text-white/20">A</div>
                                            )}
                                        </div>
                                        <h3 className="text-4xl md:text-5xl font-black text-white text-center leading-tight drop-shadow-lg uppercase">
                                            {resolveTeam(nextMatch.teamA).name}
                                        </h3>
                                    </div>

                                    {/* VS & Timer */}
                                    <div className="flex flex-col items-center justify-center relative z-20">
                                        <div className="text-8xl font-black text-transparent bg-clip-text bg-gradient-to-b from-yellow-300 to-yellow-600 italic tracking-tighter drop-shadow-[0_5px_5px_rgba(0,0,0,0.5)] transform scale-150 mb-8">
                                            VS
                                        </div>
                                        
                                        {countdown && (
                                            <div className="bg-black/50 backdrop-blur-md border border-white/10 px-6 py-3 rounded-2xl flex flex-col items-center gap-1 shadow-2xl">
                                                <span className="text-xs text-slate-400 font-bold uppercase tracking-widest">Kick Off In</span>
                                                <div className="text-4xl font-mono font-bold text-white tracking-widest tabular-nums text-shadow-glow">
                                                    {countdown}
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Team B */}
                                    <div className="flex flex-col items-center w-1/3 animate-in slide-in-from-right-20 duration-1000">
                                        <div className="w-48 h-48 md:w-64 md:h-64 bg-white/5 rounded-full p-4 border-4 border-red-500/50 shadow-[0_0_60px_rgba(239,68,68,0.3)] backdrop-blur-sm flex items-center justify-center mb-6 relative group">
                                            <div className="absolute inset-0 rounded-full border-2 border-white/10 animate-[spin_10s_linear_infinite_reverse]"></div>
                                            {resolveTeam(nextMatch.teamB).logoUrl ? (
                                                <img src={resolveTeam(nextMatch.teamB).logoUrl} className="w-full h-full object-contain drop-shadow-2xl transform group-hover:scale-110 transition duration-500" />
                                            ) : (
                                                <div className="text-8xl font-black text-white/20">B</div>
                                            )}
                                        </div>
                                        <h3 className="text-4xl md:text-5xl font-black text-white text-center leading-tight drop-shadow-lg uppercase">
                                            {resolveTeam(nextMatch.teamB).name}
                                        </h3>
                                    </div>
                                </div>

                                {/* Venue Info */}
                                <div className="mt-12 flex items-center gap-6 text-slate-300 text-xl font-bold bg-black/30 px-8 py-3 rounded-full border border-white/5 backdrop-blur-sm">
                                    <span className="flex items-center gap-2"><MapPin className="w-6 h-6 text-red-500"/> {nextMatch.venue || 'Main Stadium'}</span>
                                    <span className="w-1.5 h-1.5 bg-slate-500 rounded-full"></span>
                                    <span className="flex items-center gap-2"><Clock className="w-6 h-6 text-indigo-500"/> {new Date(nextMatch.scheduledTime || nextMatch.date).toLocaleTimeString('th-TH', {hour:'2-digit', minute:'2-digit'})}</span>
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-slate-500">
                            <Swords className="w-24 h-24 mb-4 opacity-20" />
                            <h2 className="text-4xl font-black uppercase tracking-widest opacity-50">Tournament Continues</h2>
                            <p className="text-xl mt-2">Stay Tuned for More Action</p>
                        </div>
                    )}
                </div>
            )}

        </div>

        {/* BOTTOM TICKER & SPONSORS */}
        <div className="h-24 bg-white/95 backdrop-blur-xl text-slate-900 flex items-center relative z-20 shadow-[0_-10px_50px_rgba(0,0,0,0.5)] border-t border-slate-200 shrink-0">
            <div className="bg-red-600 h-full px-12 flex items-center justify-center shrink-0 skew-x-[-10deg] -ml-6 shadow-xl z-20 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-red-600 to-red-500"></div>
                <span className="text-white font-black uppercase tracking-widest flex items-center gap-2 skew-x-[10deg] text-2xl relative z-10 drop-shadow-md">
                    <Megaphone className="w-8 h-8 animate-bounce" /> UPDATE
                </span>
            </div>
            
            <div className="flex-1 overflow-hidden relative h-full flex items-center z-10">
                <div className="absolute whitespace-nowrap animate-marquee px-4 text-3xl font-black text-slate-800 uppercase tracking-wide flex items-center">
                    {announcements.length > 0 ? announcements.map((a, i) => (
                        <React.Fragment key={i}>
                            <span className="mx-12">{a}</span>
                            <span className="text-red-500 text-3xl">•</span>
                        </React.Fragment>
                    )) : (
                        <span className="pl-6 text-slate-300 font-bold uppercase tracking-widest">OFFICIAL TOURNAMENT SYSTEM</span>
                    )}
                </div>
            </div>
            
            <div className="h-full bg-gradient-to-l from-slate-100 to-white flex items-center px-8 gap-6 z-20 border-l border-slate-200 min-w-[300px] justify-end relative overflow-hidden">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest absolute top-2 right-4">Official Partners</span>
                {sponsors.length > 0 ? (
                    <div className="flex gap-8 items-center overflow-hidden w-full justify-end">
                        <div className="flex gap-8 animate-marquee-sponsors items-center">
                            {[...sponsors, ...sponsors].map((s, i) => (
                                <img key={i} src={s.logoUrl} className="h-12 object-contain grayscale opacity-60 transition duration-300" title={s.name} />
                            ))}
                        </div>
                    </div>
                ) : (
                    <div className="flex gap-4 opacity-30 grayscale">
                        <div className="w-10 h-10 bg-slate-400 rounded-full"></div>
                        <div className="w-10 h-10 bg-slate-400 rounded-full"></div>
                    </div>
                )}
            </div>
        </div>

        {/* PROGRESS BAR */}
        <div className="absolute bottom-0 left-0 w-full h-1.5 bg-slate-900 z-50">
            <div 
                className="h-full bg-gradient-to-r from-red-500 via-yellow-500 to-indigo-500 transition-all duration-1000 ease-linear shadow-[0_0_10px_rgba(255,255,255,0.5)]"
                style={{ width: `${((currentSlide + 1) / totalSlides) * 100}%` }}
            ></div>
        </div>

        <style>{`
            @keyframes slow-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            .animate-slow-spin { animation: slow-spin 60s linear infinite; }
            @keyframes marquee { 0% { transform: translateX(100%); } 100% { transform: translateX(-100%); } }
            .animate-marquee { animation: marquee 30s linear infinite; }
            @keyframes marquee-sponsors { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
            .animate-marquee-sponsors { animation: marquee-sponsors 20s linear infinite; display: flex; width: max-content; }
            
            @keyframes pulse-slow {
                0%, 100% { transform: scale(1); opacity: 1; }
                50% { transform: scale(1.02); opacity: 0.95; }
            }
            .animate-pulse-slow { animation: pulse-slow 4s ease-in-out infinite; }

            .text-shadow-glow {
                text-shadow: 0 0 10px rgba(255,255,255,0.8), 0 0 20px rgba(99,102,241,0.5);
            }

            ::-webkit-scrollbar { display: none; }
            .perspective-1000 { perspective: 1000px; }
            .fill-mode-backwards { animation-fill-mode: backwards; }
        `}</style>
    </div>
  );
};

export default LiveWall;