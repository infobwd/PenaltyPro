
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Match, Team, Standing, Player, KickResult, AppSettings, Prediction, ContestEntry } from '../types';
import { Trophy, Clock, Calendar, MapPin, Activity, Award, Megaphone, Monitor, Maximize2, X, ChevronRight, Hand, Sparkles, Camera, Heart, User } from 'lucide-react';
import { fetchContests } from '../services/sheetService';

interface LiveWallProps {
  matches: Match[];
  teams: Team[];
  players: Player[];
  config: AppSettings;
  predictions: Prediction[];
  onClose: () => void;
  onRefresh: (silent?: boolean) => void;
}

const BASE_SLIDE_DURATION = 12000; // 12 Seconds per standard slide
const HIGHLIGHT_SLIDE_DURATION = 15000; // Give more time for highlights/loading

const LiveWall: React.FC<LiveWallProps> = ({ matches, teams, players, config, predictions, onClose, onRefresh }) => {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [standingsPage, setStandingsPage] = useState(0);
  const [contestEntries, setContestEntries] = useState<ContestEntry[]>([]);
  const [highlightIndex, setHighlightIndex] = useState(0);
  
  // Slides: 
  // 0=Matches, 1=Standings, 2=Results, 3=TopScorers, 4=TopKeepers, 5=FanPrediction, 6=Highlights(Load)
  const totalSlides = 7;

  const announcements = useMemo(() => {
      return config.announcement ? config.announcement.split('|').filter(s => s.trim() !== '') : [];
  }, [config.announcement]);

  // --- Initial Data Fetch for Highlights ---
  useEffect(() => {
      const loadExtras = async () => {
          try {
              const data = await fetchContests();
              // Filter only approved or active if needed, for now take all unique photos
              const uniquePhotos = data.entries.filter((e, i, a) => a.findIndex(t => t.photoUrl === e.photoUrl) === i);
              setContestEntries(uniquePhotos);
          } catch (e) {
              console.error("Failed to load live wall extras");
          }
      };
      loadExtras();
  }, []);

  // --- Data Processing Helpers ---

  const resolveTeam = (t: string | Team) => typeof t === 'string' ? (teams.find(x => x.name === t) || {name: t, logoUrl:''} as Team) : t;

  // 1. Matches (Live or Next)
  const upcomingMatches = useMemo(() => {
      const live = matches.filter(m => m.livestreamUrl && !m.winner);
      const scheduled = matches
        .filter(m => !m.winner && !m.livestreamUrl)
        .sort((a, b) => new Date(a.scheduledTime || a.date).getTime() - new Date(b.scheduledTime || b.date).getTime());
      return [...live, ...scheduled].slice(0, 4);
  }, [matches]);

  // 2. Recent Results
  const recentResults = useMemo(() => {
      return matches
        .filter(m => m.winner)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 6);
  }, [matches]);

  // 3. Standings
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

  // 4. Top Scorers (With Photo Lookup)
  const topScorers = useMemo(() => {
      const scores: Record<string, {name: string, team: string, goals: number, photoUrl?: string}> = {};
      matches.forEach(m => {
          const processGoal = (player: string, teamId: string) => {
              const pName = String(player).split('(')[0].replace(/[#0-9]/g,'').trim();
              const teamName = teamId === 'A' || (typeof m.teamA==='string'?m.teamA:m.teamA.name) === teamId ? (typeof m.teamA==='string'?m.teamA:m.teamA.name) : (typeof m.teamB==='string'?m.teamB:m.teamB.name);
              const key = `${pName}_${teamName}`;
              
              if (!scores[key]) {
                  // Find Player Photo
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

  // 5. Top Keepers (Clean Sheets & Saves)
  const topKeepers = useMemo(() => {
      const savesMap: Record<string, { teamName: string, saves: number, cleanSheets: number, logoUrl?: string }> = {};
      teams.forEach(t => {
          if(t.status === 'Approved') savesMap[t.name] = { teamName: t.name, saves: 0, cleanSheets: 0, logoUrl: t.logoUrl };
      });

      matches.forEach(m => {
          if (!m.winner) return;
          const tA = typeof m.teamA === 'string' ? m.teamA : m.teamA.name;
          const tB = typeof m.teamB === 'string' ? m.teamB : m.teamB.name;

          if (savesMap[tA] && m.scoreB === 0) savesMap[tA].cleanSheets++;
          if (savesMap[tB] && m.scoreA === 0) savesMap[tB].cleanSheets++;

          m.kicks?.forEach(k => {
              if (k.result === KickResult.SAVED) {
                  const saverTeam = (k.teamId === 'A' || tA === k.teamId) ? tB : tA; // Opposite of kicker
                  if (savesMap[saverTeam]) savesMap[saverTeam].saves++;
              }
          });
      });

      return Object.values(savesMap)
        .filter(k => k.saves > 0 || k.cleanSheets > 0)
        .sort((a, b) => (b.saves * 2 + b.cleanSheets * 5) - (a.saves * 2 + a.cleanSheets * 5))
        .slice(0, 5);
  }, [matches, teams]);

  // 6. Fan Predictions
  const fanRankings = useMemo(() => {
      const scores: Record<string, { name: string, pic: string, points: number, correct: number }> = {};
      const results: Record<string, string> = {};
      
      matches.forEach(m => {
          if (m.winner) {
              results[m.id] = m.winner === 'A' || m.winner === (typeof m.teamA==='string'?m.teamA:m.teamA.name) ? 'A' : 'B';
          }
      });

      predictions.forEach(p => {
          if (results[p.matchId] && results[p.matchId] === p.prediction) {
              if (!scores[p.userId]) scores[p.userId] = { name: p.userDisplayName || 'User', pic: p.userPictureUrl || '', points: 0, correct: 0 };
              scores[p.userId].points += 10;
              scores[p.userId].correct++;
          }
      });

      return Object.values(scores).sort((a, b) => b.points - a.points).slice(0, 5);
  }, [matches, predictions]);

  // --- Timers & Rotation ---

  useEffect(() => {
    const clockTimer = setInterval(() => setCurrentTime(new Date()), 1000);
    
    // Slide Rotation
    const rotateSlide = () => {
        setCurrentSlide(prev => {
            const next = (prev + 1) % totalSlides;
            // Reset sub-pages when leaving their main slide
            if (next === 1) setStandingsPage(0); 
            if (next === 6) setHighlightIndex(0);
            return next;
        });
    };

    let duration = BASE_SLIDE_DURATION;
    if (currentSlide === 1) duration = Math.max(BASE_SLIDE_DURATION, standingsGroups.length * 8000); // Standings pagination
    if (currentSlide === 6) duration = HIGHLIGHT_SLIDE_DURATION; // Highlights (Loading time)

    const slideTimer = setInterval(rotateSlide, duration);

    // Sub-rotations
    let subTimer: any;
    if (currentSlide === 1 && standingsGroups.length > 1) {
        subTimer = setInterval(() => setStandingsPage(p => (p + 1) % standingsGroups.length), 8000);
    }
    if (currentSlide === 6 && contestEntries.length > 1) {
        // Faster rotation for images
        subTimer = setInterval(() => setHighlightIndex(p => (p + 1) % contestEntries.length), 3000);
    }

    // STEALTH REFRESH TRIGGER
    if (currentSlide === 6) {
        console.log("Stealth Refresh Triggered");
        onRefresh(true); // Call refresh silently
    }

    return () => {
      clearInterval(clockTimer);
      clearInterval(slideTimer);
      if (subTimer) clearInterval(subTimer);
    };
  }, [currentSlide, standingsGroups.length, contestEntries.length]);

  const enterFullScreen = () => {
      const elem = document.documentElement;
      if (elem.requestFullscreen) elem.requestFullscreen();
  };

  return (
    <div className="fixed inset-0 z-[5000] bg-slate-950 text-white overflow-hidden flex flex-col font-kanit select-none cursor-none" style={{ fontFamily: "'Kanit', sans-serif" }}>
        
        {/* ANIMATED BACKGROUND */}
        <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
            <div className="absolute top-[-50%] left-[-50%] w-[200%] h-[200%] bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-indigo-900/40 via-slate-950 to-black animate-slow-spin opacity-50"></div>
            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-20 mix-blend-overlay"></div>
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]"></div>
        </div>

        {/* TOP BAR */}
        <div className="h-24 bg-gradient-to-b from-slate-900 to-transparent flex items-center justify-between px-8 relative z-20 pt-4">
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
                    </div>
                </div>
            </div>
            
            <div className="flex items-center gap-8">
                <div className="text-right">
                    <div className="text-5xl font-black font-mono leading-none tracking-widest text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.6)]">
                        {currentTime.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                    <div className="text-sm text-slate-400 font-bold uppercase tracking-widest mt-1">
                        {currentTime.toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                    </div>
                </div>
                <div className="h-16 w-[1px] bg-gradient-to-b from-transparent via-white/20 to-transparent"></div>
                <div className="flex gap-2">
                    <button onClick={enterFullScreen} className="p-3 bg-white/5 hover:bg-white/10 rounded-full text-slate-300 hover:text-white transition backdrop-blur-sm"><Maximize2 className="w-6 h-6"/></button>
                    <button onClick={onClose} className="p-3 bg-red-500/10 hover:bg-red-500/20 rounded-full text-red-400 hover:text-red-300 transition backdrop-blur-sm"><X className="w-6 h-6"/></button>
                </div>
            </div>
        </div>

        {/* MAIN CONTENT AREA */}
        <div className="flex-1 relative z-10 w-full h-full flex flex-col p-8 pb-4">
            
            {/* SLIDE 0: MATCH CENTER */}
            {currentSlide === 0 && (
                <div className="h-full flex flex-col animate-in fade-in zoom-in-95 duration-700">
                    <div className="flex items-center gap-4 mb-8">
                        <div className="bg-red-600 p-2 rounded-lg shadow-[0_0_20px_rgba(220,38,38,0.5)]"><Activity className="w-8 h-8 text-white" /></div>
                        <h2 className="text-4xl font-black text-white uppercase tracking-tight">Match Center</h2>
                    </div>
                    
                    <div className="flex-1 flex items-center justify-center">
                        {upcomingMatches.length > 0 ? (
                            <div className="grid grid-cols-1 gap-6 w-full max-w-6xl">
                                {upcomingMatches.map((m, idx) => {
                                    const tA = resolveTeam(m.teamA);
                                    const tB = resolveTeam(m.teamB);
                                    const isLive = m.livestreamUrl && !m.winner;
                                    return (
                                        <div key={m.id} className={`relative group bg-slate-900/60 backdrop-blur-xl rounded-3xl border p-6 flex items-center justify-between transition-all duration-500 ${isLive ? 'border-red-500/50 shadow-[0_0_40px_rgba(220,38,38,0.15)] bg-gradient-to-r from-red-950/30 to-slate-900/60' : 'border-white/10 hover:border-indigo-500/30'} ${idx === 0 ? 'scale-105 z-10' : 'scale-100 opacity-90'}`}>
                                            <div className="flex items-center gap-6 w-[40%]">
                                                <div className="w-20 h-20 bg-white/5 rounded-2xl p-2 shadow-inner border border-white/5 flex items-center justify-center shrink-0">
                                                    {tA.logoUrl ? <img src={tA.logoUrl} className="w-full h-full object-contain drop-shadow-md"/> : <div className="text-2xl font-black text-slate-600">{tA.name.substring(0,1)}</div>}
                                                </div>
                                                <span className="text-3xl font-bold truncate">{tA.name}</span>
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
                                                <span className="text-3xl font-bold truncate text-right">{tB.name}</span>
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
                <div className="h-full flex flex-col animate-in fade-in slide-in-from-right-10 duration-700">
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
                            <div className="grid grid-cols-2 gap-8 content-start animate-in fade-in zoom-in-95 duration-500 key={standingsPage}">
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
                                                {Array.from({ length: Math.max(0, 4 - group.teams.length) }).map((_, i) => <tr key={`empty-${i}`} className="h-[60px]"><td colSpan={4}></td></tr>)}
                                            </tbody>
                                        </table>
                                    </div>
                                ))}
                            </div>
                        ) : <div className="flex items-center justify-center h-full text-slate-500 text-2xl font-bold">Waiting for standings...</div>}
                    </div>
                </div>
            )}

            {/* SLIDE 2: RESULTS */}
            {currentSlide === 2 && (
                <div className="h-full flex flex-col animate-in fade-in slide-in-from-bottom-10 duration-700">
                    <div className="flex items-center gap-4 mb-8">
                        <div className="bg-green-600 p-2 rounded-lg shadow-[0_0_20px_rgba(22,163,74,0.5)]"><Calendar className="w-8 h-8 text-white" /></div>
                        <h2 className="text-4xl font-black text-white uppercase tracking-tight">Full Time Results</h2>
                    </div>
                    <div className="grid grid-cols-2 gap-6 content-start">
                        {recentResults.map(m => {
                            const tA = resolveTeam(m.teamA);
                            const tB = resolveTeam(m.teamB);
                            return (
                                <div key={m.id} className="bg-slate-900/40 border border-white/10 rounded-2xl p-6 flex items-center justify-between backdrop-blur-sm hover:bg-slate-800/60 transition duration-500">
                                    <div className={`flex items-center gap-4 flex-1 justify-end ${m.winner === 'A' || m.winner === tA.name ? 'opacity-100' : 'opacity-40 grayscale'}`}>
                                        <span className="text-2xl font-bold text-right">{tA.name}</span>
                                        <div className="w-14 h-14 bg-white/5 rounded-xl p-1 flex items-center justify-center border border-white/10">
                                            {tA.logoUrl ? <img src={tA.logoUrl} className="w-full h-full object-contain" /> : <span className="font-bold">{tA.name[0]}</span>}
                                        </div>
                                    </div>
                                    <div className="mx-8 text-center relative">
                                        <div className="bg-black/40 border border-white/10 px-8 py-3 rounded-xl text-4xl font-black font-mono shadow-inner text-white tracking-widest">
                                            {m.scoreA}<span className="mx-2 text-slate-600">:</span>{m.scoreB}
                                        </div>
                                        <div className="absolute -bottom-6 left-0 right-0 text-[10px] text-green-400 font-bold uppercase tracking-widest">Full Time</div>
                                    </div>
                                    <div className={`flex items-center gap-4 flex-1 justify-start ${m.winner === 'B' || m.winner === tB.name ? 'opacity-100' : 'opacity-40 grayscale'}`}>
                                        <div className="w-14 h-14 bg-white/5 rounded-xl p-1 flex items-center justify-center border border-white/10">
                                            {tB.logoUrl ? <img src={tB.logoUrl} className="w-full h-full object-contain" /> : <span className="font-bold">{tB.name[0]}</span>}
                                        </div>
                                        <span className="text-2xl font-bold text-left">{tB.name}</span>
                                    </div>
                                </div>
                            );
                        })}
                        {recentResults.length === 0 && <div className="col-span-2 text-center py-20 text-slate-500 text-xl font-bold">No results yet</div>}
                    </div>
                </div>
            )}

            {/* SLIDE 3: TOP SCORERS */}
            {currentSlide === 3 && (
                <div className="h-full flex flex-col animate-in fade-in zoom-in-95 duration-700">
                    <div className="flex items-center gap-4 mb-8">
                        <div className="bg-yellow-500 p-2 rounded-lg shadow-[0_0_20px_rgba(234,179,8,0.5)]"><Award className="w-8 h-8 text-white" /></div>
                        <h2 className="text-4xl font-black text-white uppercase tracking-tight">Golden Boot</h2>
                    </div>
                    <div className="flex flex-col gap-4 max-w-5xl mx-auto w-full">
                        {topScorers.map((p, idx) => (
                            <div key={idx} className="relative overflow-hidden bg-gradient-to-r from-slate-900 to-slate-900/50 border border-white/10 rounded-2xl p-4 flex items-center justify-between shadow-lg transform transition hover:scale-105 group h-32">
                                <div className="absolute inset-0 bg-gradient-to-r from-indigo-600/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                <div className="flex items-center gap-8 relative z-10 h-full">
                                    <div className={`w-20 h-full flex items-center justify-center font-black text-4xl rounded-xl shadow-inner border-t border-white/20 ${idx === 0 ? 'bg-gradient-to-br from-yellow-400 to-yellow-600 text-white' : 'bg-slate-800 text-slate-500'}`}>{idx + 1}</div>
                                    <div className="flex items-center gap-6 h-full">
                                        {p.photoUrl ? <img src={p.photoUrl} className="h-full w-24 object-contain drop-shadow-md rounded-md" /> : <div className="h-full w-24 bg-slate-800 rounded-md flex items-center justify-center"><User className="w-10 h-10 text-slate-600"/></div>}
                                        <div>
                                            <div className="text-4xl font-black text-white tracking-tight">{p.name}</div>
                                            <div className="text-xl text-indigo-300 font-bold">{p.team}</div>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4 pr-4 relative z-10">
                                    <span className="text-7xl font-black text-transparent bg-clip-text bg-gradient-to-b from-white to-slate-400 drop-shadow-lg">{p.goals}</span>
                                    <div className="flex flex-col items-center"><div className="w-1 h-8 bg-white/20 mb-1"></div><span className="text-xs text-white/50 font-bold uppercase tracking-widest rotate-90 origin-center translate-y-2">Goals</span></div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* SLIDE 4: TOP KEEPERS */}
            {currentSlide === 4 && (
                <div className="h-full flex flex-col animate-in fade-in zoom-in-95 duration-700">
                    <div className="flex items-center gap-4 mb-8">
                        <div className="bg-blue-500 p-2 rounded-lg shadow-[0_0_20px_rgba(59,130,246,0.5)]"><Hand className="w-8 h-8 text-white" /></div>
                        <h2 className="text-4xl font-black text-white uppercase tracking-tight">Golden Glove</h2>
                    </div>
                    <div className="grid grid-cols-2 gap-6 content-start max-w-6xl mx-auto w-full">
                        {topKeepers.map((k, idx) => (
                            <div key={idx} className="bg-slate-900/60 border border-white/10 rounded-2xl p-6 flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className={`w-12 h-12 rounded-full flex items-center justify-center font-black text-xl ${idx === 0 ? 'bg-yellow-400 text-black' : 'bg-slate-700 text-slate-400'}`}>{idx + 1}</div>
                                    {k.logoUrl && <img src={k.logoUrl} className="w-16 h-16 object-contain" />}
                                    <div>
                                        <h3 className="text-2xl font-bold">{k.teamName}</h3>
                                        <p className="text-slate-400">Goalkeeper Team</p>
                                    </div>
                                </div>
                                <div className="flex gap-6 text-center">
                                    <div><div className="text-4xl font-black text-blue-400">{k.saves}</div><div className="text-[10px] uppercase font-bold text-slate-500">Saves</div></div>
                                    <div><div className="text-4xl font-black text-green-400">{k.cleanSheets}</div><div className="text-[10px] uppercase font-bold text-slate-500">Clean Sheet</div></div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* SLIDE 5: FAN PREDICTIONS */}
            {currentSlide === 5 && (
                <div className="h-full flex flex-col animate-in fade-in zoom-in-95 duration-700">
                    <div className="flex items-center gap-4 mb-8">
                        <div className="bg-purple-600 p-2 rounded-lg shadow-[0_0_20px_rgba(147,51,234,0.5)]"><Sparkles className="w-8 h-8 text-white" /></div>
                        <h2 className="text-4xl font-black text-white uppercase tracking-tight">Fan Prediction Leaderboard</h2>
                    </div>
                    <div className="flex flex-col gap-4 max-w-4xl mx-auto w-full">
                        {fanRankings.map((fan, idx) => (
                            <div key={idx} className="flex items-center justify-between bg-white/5 rounded-2xl p-4 border border-white/5">
                                <div className="flex items-center gap-6">
                                    <div className={`w-16 h-16 flex items-center justify-center font-black text-3xl rounded-xl ${idx === 0 ? 'bg-yellow-400 text-black' : 'bg-slate-800 text-slate-500'}`}>{idx+1}</div>
                                    <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-white/20">{fan.pic ? <img src={fan.pic} className="w-full h-full object-cover"/> : <div className="w-full h-full bg-slate-700 flex items-center justify-center"><User className="w-8 h-8"/></div>}</div>
                                    <div className="text-2xl font-bold">{fan.name}</div>
                                </div>
                                <div className="text-right">
                                    <div className="text-4xl font-black text-purple-400">{fan.points}</div>
                                    <div className="text-xs text-slate-500 uppercase font-bold">Points</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* SLIDE 6: HIGHLIGHTS (STEALTH REFRESH) */}
            {currentSlide === 6 && (
                <div className="h-full flex flex-col animate-in fade-in duration-1000">
                    <div className="flex items-center gap-4 mb-4">
                        <div className="bg-pink-600 p-2 rounded-lg shadow-[0_0_20px_rgba(219,39,119,0.5)]"><Camera className="w-8 h-8 text-white" /></div>
                        <h2 className="text-4xl font-black text-white uppercase tracking-tight">Tournament Highlights</h2>
                    </div>
                    <div className="flex-1 relative overflow-hidden rounded-3xl border border-white/10 bg-black/50 backdrop-blur-sm">
                        {contestEntries.length > 0 ? (
                            <div className="absolute inset-0 flex items-center justify-center">
                                <img 
                                    src={contestEntries[highlightIndex].photoUrl} 
                                    className="w-full h-full object-contain animate-in zoom-in-105 duration-[10000ms]" 
                                    key={highlightIndex}
                                />
                                <div className="absolute bottom-0 left-0 right-0 p-8 bg-gradient-to-t from-black/90 to-transparent">
                                    <div className="flex items-center gap-4">
                                        {contestEntries[highlightIndex].userPictureUrl ? <img src={contestEntries[highlightIndex].userPictureUrl} className="w-12 h-12 rounded-full border-2 border-white"/> : <div className="w-12 h-12 rounded-full bg-slate-700"></div>}
                                        <div>
                                            <p className="text-xl font-bold text-white">{contestEntries[highlightIndex].caption}</p>
                                            <p className="text-sm text-slate-300">Photo by {contestEntries[highlightIndex].userDisplayName}</p>
                                        </div>
                                        <div className="ml-auto flex items-center gap-2 bg-pink-600 px-4 py-2 rounded-full">
                                            <Heart className="w-5 h-5 fill-white"/> <span className="font-bold">{contestEntries[highlightIndex].likeCount}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="flex items-center justify-center h-full flex-col">
                                <Sparkles className="w-24 h-24 text-slate-600 mb-4 animate-pulse"/>
                                <h3 className="text-2xl font-bold text-slate-500">Updating Live Data...</h3>
                            </div>
                        )}
                    </div>
                </div>
            )}

        </div>

        {/* BOTTOM TICKER */}
        <div className="h-16 bg-white text-slate-900 flex items-center relative z-20 shadow-[0_-10px_50px_rgba(0,0,0,0.5)]">
            <div className="bg-red-600 h-full px-8 flex items-center justify-center shrink-0 skew-x-[-10deg] -ml-4 shadow-lg z-20">
                <span className="text-white font-black uppercase tracking-widest flex items-center gap-2 skew-x-[10deg] text-xl">
                    <Megaphone className="w-6 h-6 animate-bounce" /> UPDATE
                </span>
            </div>
            <div className="flex-1 overflow-hidden relative h-full flex items-center bg-white z-10">
                <div className="absolute whitespace-nowrap animate-marquee px-4 text-2xl font-bold text-slate-800 uppercase tracking-wide flex items-center">
                    {announcements.length > 0 ? announcements.map((a, i) => (
                        <React.Fragment key={i}>
                            <span className="mx-8">{a}</span>
                            <span className="text-red-500 text-3xl">•</span>
                        </React.Fragment>
                    )) : (
                        <span className="pl-6 text-slate-400 font-bold uppercase tracking-widest">PENALTY PRO ARENA - OFFICIAL TOURNAMENT SYSTEM - LIVE SCORING & STATISTICS</span>
                    )}
                </div>
            </div>
            <div className="bg-slate-900 h-full px-8 flex items-center justify-center shrink-0 text-white z-20 shadow-[-10px_0_20px_rgba(0,0,0,0.2)]">
                <span className="text-xs font-bold opacity-50 tracking-widest">POWERED BY PENALTY PRO</span>
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
            ::-webkit-scrollbar { display: none; }
        `}</style>
    </div>
  );
};

export default LiveWall;
