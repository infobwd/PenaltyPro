
import React, { useState, useEffect, useMemo } from 'react';
import { Match, Team, Standing, Player, KickResult, AppSettings } from '../types';
import { Trophy, Clock, Calendar, MapPin, Activity, Award, Megaphone, Monitor, Maximize2, X } from 'lucide-react';

interface LiveWallProps {
  matches: Match[];
  teams: Team[];
  players: Player[];
  config: AppSettings;
  onClose: () => void;
  onRefresh: () => void;
}

const SLIDE_DURATION = 15000; // 15 Seconds per slide
const DATA_REFRESH_INTERVAL = 60000; // 1 Minute

const LiveWall: React.FC<LiveWallProps> = ({ matches, teams, players, config, onClose, onRefresh }) => {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [tickerIndex, setTickerIndex] = useState(0);

  // Slides configuration: 0=Matches, 1=Standings, 2=Results, 3=Stats
  const totalSlides = 4;

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    const slideTimer = setInterval(() => setCurrentSlide(prev => (prev + 1) % totalSlides), SLIDE_DURATION);
    const refreshTimer = setInterval(onRefresh, DATA_REFRESH_INTERVAL);
    
    // Announcement Ticker
    const announcementList = config.announcement ? config.announcement.split('|').filter(s => s.trim()) : [];
    const tickerTimer = announcementList.length > 1 ? setInterval(() => {
        setTickerIndex(prev => (prev + 1) % announcementList.length);
    }, 8000) : null;

    return () => {
      clearInterval(timer);
      clearInterval(slideTimer);
      clearInterval(refreshTimer);
      if (tickerTimer) clearInterval(tickerTimer);
    };
  }, [config.announcement]);

  // --- Data Processing ---

  // 1. Matches (Live or Next)
  const upcomingMatches = useMemo(() => {
      return matches
        .filter(m => !m.winner)
        .sort((a, b) => new Date(a.scheduledTime || a.date).getTime() - new Date(b.scheduledTime || b.date).getTime())
        .slice(0, 3); // Top 3
  }, [matches]);

  // 2. Recent Results
  const recentResults = useMemo(() => {
      return matches
        .filter(m => m.winner)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 5); // Top 5
  }, [matches]);

  // 3. Standings
  const standings = useMemo(() => {
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
      // Grouping
      const groups: Record<string, Standing[]> = {};
      Object.values(map).forEach(s => {
          if (!groups[s.group]) groups[s.group] = [];
          groups[s.group].push(s);
      });
      Object.keys(groups).forEach(k => {
          groups[k].sort((a,b) => b.points - a.points || (b.goalsFor-b.goalsAgainst) - (a.goalsFor-a.goalsAgainst));
      });
      return groups;
  }, [matches, teams]);

  // 4. Top Scorers
  const topScorers = useMemo(() => {
      const scores: Record<string, {name: string, team: string, goals: number, pic?: string}> = {};
      matches.forEach(m => {
          // Regular Goals
          m.events?.forEach(e => {
              if (e.type === 'GOAL') {
                  const key = `${e.player}_${e.teamId}`;
                  if (!scores[key]) scores[key] = { name: e.player, team: e.teamId === 'A' ? (typeof m.teamA==='string'?m.teamA:m.teamA.name) : (typeof m.teamB==='string'?m.teamB:m.teamB.name), goals: 0 };
                  scores[key].goals++;
              }
          });
          // Penalties
          m.kicks?.forEach(k => {
              if (k.result === KickResult.GOAL) {
                  const pName = String(k.player).split('(')[0].trim();
                  const key = `${pName}_${k.teamId}`;
                  const teamName = k.teamId === 'A' || (typeof m.teamA==='string'?m.teamA:m.teamA.name) === k.teamId ? (typeof m.teamA==='string'?m.teamA:m.teamA.name) : (typeof m.teamB==='string'?m.teamB:m.teamB.name);
                  if (!scores[key]) scores[key] = { name: pName, team: teamName, goals: 0 };
                  scores[key].goals++;
              }
          });
      });
      return Object.values(scores).sort((a,b) => b.goals - a.goals).slice(0, 5);
  }, [matches]);

  // Helper
  const resolveTeam = (t: string | Team) => typeof t === 'string' ? (teams.find(x => x.name === t) || {name: t, logoUrl:''} as Team) : t;
  const announcements = config.announcement ? config.announcement.split('|').filter(s => s.trim()) : [];

  const enterFullScreen = () => {
      const elem = document.documentElement;
      if (elem.requestFullscreen) elem.requestFullscreen();
  };

  return (
    <div className="fixed inset-0 z-[5000] bg-slate-950 text-white overflow-hidden flex flex-col font-sans select-none">
        
        {/* TOP BAR */}
        <div className="h-20 bg-gradient-to-r from-slate-900 to-indigo-950 border-b border-white/10 flex items-center justify-between px-8 shadow-2xl relative z-20">
            <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-white rounded-full p-1 shadow-lg shadow-indigo-500/20">
                    <img src={config.competitionLogo} className="w-full h-full object-contain" />
                </div>
                <div>
                    <h1 className="text-2xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white to-indigo-200 uppercase">
                        {config.competitionName}
                    </h1>
                    <div className="flex items-center gap-2 text-xs text-indigo-300 font-mono tracking-widest">
                        <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span> LIVE COVERAGE
                    </div>
                </div>
            </div>
            
            <div className="flex items-center gap-6">
                <div className="text-right">
                    <div className="text-3xl font-black font-mono leading-none tracking-widest text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.5)]">
                        {currentTime.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                    <div className="text-xs text-slate-400 font-bold uppercase tracking-widest">
                        {currentTime.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'short' })}
                    </div>
                </div>
                <div className="h-10 w-[1px] bg-white/10"></div>
                <button onClick={enterFullScreen} className="p-2 hover:bg-white/10 rounded-full text-slate-400 hover:text-white transition"><Maximize2 className="w-6 h-6"/></button>
                <button onClick={onClose} className="p-2 hover:bg-red-500/20 rounded-full text-slate-400 hover:text-red-400 transition"><X className="w-6 h-6"/></button>
            </div>
        </div>

        {/* MAIN CONTENT AREA */}
        <div className="flex-1 relative overflow-hidden bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] bg-fixed">
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/20 via-slate-900/50 to-black/80"></div>
            
            <div className="relative z-10 w-full h-full flex flex-col p-8">
                
                {/* SLIDE 1: MATCH CENTER */}
                {currentSlide === 0 && (
                    <div className="h-full flex flex-col animate-in fade-in zoom-in-95 duration-700">
                        <h2 className="text-3xl font-black text-white mb-8 flex items-center gap-3 border-l-8 border-red-500 pl-4">
                            <Activity className="w-8 h-8 text-red-500" /> MATCH CENTER
                        </h2>
                        
                        <div className="flex-1 flex items-center justify-center">
                            {upcomingMatches.length > 0 ? (
                                <div className="grid grid-cols-1 gap-8 w-full max-w-5xl">
                                    {upcomingMatches.map((m, idx) => {
                                        const tA = resolveTeam(m.teamA);
                                        const tB = resolveTeam(m.teamB);
                                        const isLive = m.livestreamUrl && !m.winner;
                                        return (
                                            <div key={m.id} className={`relative bg-slate-800/80 backdrop-blur-md rounded-3xl border ${isLive ? 'border-red-500/50 shadow-[0_0_50px_rgba(239,68,68,0.2)]' : 'border-white/10'} p-8 flex items-center justify-between transform ${idx === 0 ? 'scale-110 z-10' : 'scale-95 opacity-80'}`}>
                                                <div className="flex flex-col items-center w-1/3">
                                                    <div className="w-24 h-24 bg-white rounded-2xl p-2 shadow-lg mb-4">
                                                        {tA.logoUrl ? <img src={tA.logoUrl} className="w-full h-full object-contain"/> : <div className="w-full h-full flex items-center justify-center text-slate-800 font-bold text-3xl">{tA.name.substring(0,1)}</div>}
                                                    </div>
                                                    <span className="text-2xl font-bold text-center leading-tight">{tA.name}</span>
                                                </div>
                                                
                                                <div className="flex flex-col items-center w-1/3">
                                                    {isLive ? (
                                                        <div className="bg-red-600 text-white px-4 py-1 rounded-full text-sm font-bold animate-pulse mb-4">LIVE NOW</div>
                                                    ) : (
                                                        <div className="bg-indigo-600 text-white px-4 py-1 rounded-full text-sm font-bold mb-4">
                                                            {new Date(m.scheduledTime || m.date).toLocaleTimeString('th-TH', {hour:'2-digit', minute:'2-digit'})}
                                                        </div>
                                                    )}
                                                    
                                                    <div className="text-6xl font-black font-mono tracking-widest text-white drop-shadow-2xl">
                                                        {m.scoreA} <span className="text-slate-500 text-4xl align-middle mx-2">-</span> {m.scoreB}
                                                    </div>
                                                    <div className="text-indigo-300 font-bold mt-2 tracking-widest uppercase">{m.roundLabel?.split(':')[0]}</div>
                                                    {m.venue && <div className="text-slate-400 text-sm mt-1 flex items-center gap-1"><MapPin className="w-3 h-3"/> {m.venue}</div>}
                                                </div>

                                                <div className="flex flex-col items-center w-1/3">
                                                    <div className="w-24 h-24 bg-white rounded-2xl p-2 shadow-lg mb-4">
                                                        {tB.logoUrl ? <img src={tB.logoUrl} className="w-full h-full object-contain"/> : <div className="w-full h-full flex items-center justify-center text-slate-800 font-bold text-3xl">{tB.name.substring(0,1)}</div>}
                                                    </div>
                                                    <span className="text-2xl font-bold text-center leading-tight">{tB.name}</span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="text-center opacity-50">
                                    <Clock className="w-24 h-24 mx-auto mb-4 text-slate-500" />
                                    <h3 className="text-3xl font-bold">NO UPCOMING MATCHES</h3>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* SLIDE 2: STANDINGS */}
                {currentSlide === 1 && (
                    <div className="h-full flex flex-col animate-in fade-in slide-in-from-right-10 duration-700">
                        <h2 className="text-3xl font-black text-white mb-8 flex items-center gap-3 border-l-8 border-indigo-500 pl-4">
                            <Trophy className="w-8 h-8 text-indigo-500" /> STANDINGS
                        </h2>
                        
                        <div className="flex-1 grid grid-cols-2 gap-8 content-start">
                            {Object.keys(standings).sort().map(group => (
                                <div key={group} className="bg-slate-800/60 border border-white/10 rounded-2xl overflow-hidden backdrop-blur-md">
                                    <div className="bg-indigo-600/20 px-6 py-3 border-b border-white/5 flex justify-between items-center">
                                        <h3 className="font-bold text-xl text-indigo-300">GROUP {group}</h3>
                                        <Trophy className="w-5 h-5 text-yellow-500" />
                                    </div>
                                    <table className="w-full text-lg">
                                        <thead className="bg-white/5 text-slate-400">
                                            <tr>
                                                <th className="p-3 text-left pl-6">TEAM</th>
                                                <th className="p-3 text-center">P</th>
                                                <th className="p-3 text-center">GD</th>
                                                <th className="p-3 text-center text-white font-black bg-indigo-600/20">PTS</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-white/5">
                                            {standings[group].map((team, idx) => (
                                                <tr key={team.teamId} className={idx < 2 ? "bg-green-500/10" : ""}>
                                                    <td className="p-4 pl-6 font-bold flex items-center gap-3">
                                                        <span className="text-slate-500 font-mono w-4">{idx+1}</span>
                                                        {team.logoUrl && <img src={team.logoUrl} className="w-8 h-8 object-contain" />}
                                                        <span className="truncate max-w-[200px]">{team.teamName}</span>
                                                    </td>
                                                    <td className="p-4 text-center text-slate-300">{team.played}</td>
                                                    <td className="p-4 text-center text-slate-300">{team.goalsFor - team.goalsAgainst}</td>
                                                    <td className="p-4 text-center font-black text-yellow-400 text-xl bg-indigo-600/10">{team.points}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* SLIDE 3: RESULTS */}
                {currentSlide === 2 && (
                    <div className="h-full flex flex-col animate-in fade-in slide-in-from-bottom-10 duration-700">
                        <h2 className="text-3xl font-black text-white mb-8 flex items-center gap-3 border-l-8 border-green-500 pl-4">
                            <Calendar className="w-8 h-8 text-green-500" /> LATEST RESULTS
                        </h2>
                        
                        <div className="grid grid-cols-2 gap-6">
                            {recentResults.map(m => {
                                const tA = resolveTeam(m.teamA);
                                const tB = resolveTeam(m.teamB);
                                return (
                                    <div key={m.id} className="bg-white/5 border border-white/10 rounded-2xl p-6 flex items-center justify-between">
                                        <div className={`flex items-center gap-4 flex-1 justify-end ${m.winner === 'A' || m.winner === tA.name ? 'opacity-100' : 'opacity-50'}`}>
                                            <span className="text-xl font-bold text-right">{tA.name}</span>
                                            {tA.logoUrl && <img src={tA.logoUrl} className="w-12 h-12 bg-white rounded-full p-1" />}
                                        </div>
                                        <div className="mx-6 text-center">
                                            <div className="bg-slate-800 border border-slate-600 px-6 py-2 rounded-lg text-3xl font-black font-mono shadow-inner">
                                                {m.scoreA} - {m.scoreB}
                                            </div>
                                            {m.winner && <div className="text-[10px] text-green-400 font-bold mt-1 tracking-widest">FULL TIME</div>}
                                        </div>
                                        <div className={`flex items-center gap-4 flex-1 justify-start ${m.winner === 'B' || m.winner === tB.name ? 'opacity-100' : 'opacity-50'}`}>
                                            {tB.logoUrl && <img src={tB.logoUrl} className="w-12 h-12 bg-white rounded-full p-1" />}
                                            <span className="text-xl font-bold text-left">{tB.name}</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* SLIDE 4: TOP SCORERS */}
                {currentSlide === 3 && (
                    <div className="h-full flex flex-col animate-in fade-in zoom-in-95 duration-700">
                        <h2 className="text-3xl font-black text-white mb-8 flex items-center gap-3 border-l-8 border-yellow-500 pl-4">
                            <Award className="w-8 h-8 text-yellow-500" /> TOP SCORERS
                        </h2>
                        
                        <div className="flex flex-col gap-4 max-w-4xl mx-auto w-full">
                            {topScorers.map((p, idx) => (
                                <div key={idx} className="bg-gradient-to-r from-slate-800 to-slate-900 border border-white/10 rounded-2xl p-4 flex items-center justify-between shadow-lg transform transition hover:scale-105">
                                    <div className="flex items-center gap-6">
                                        <div className={`w-16 h-16 flex items-center justify-center font-black text-3xl rounded-full shadow-inner ${idx === 0 ? 'bg-yellow-400 text-yellow-900' : idx === 1 ? 'bg-slate-300 text-slate-900' : idx === 2 ? 'bg-orange-400 text-orange-900' : 'bg-slate-700 text-slate-400'}`}>
                                            {idx + 1}
                                        </div>
                                        <div>
                                            <div className="text-2xl font-bold text-white">{p.name}</div>
                                            <div className="text-slate-400">{p.team}</div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-b from-yellow-300 to-yellow-600">{p.goals}</span>
                                        <span className="text-xs text-yellow-500 font-bold uppercase tracking-widest -rotate-90 origin-bottom-left">Goals</span>
                                    </div>
                                </div>
                            ))}
                            {topScorers.length === 0 && <div className="text-center text-slate-500 text-2xl py-20">No goals recorded yet</div>}
                        </div>
                    </div>
                )}

            </div>
        </div>

        {/* BOTTOM TICKER */}
        <div className="h-14 bg-white text-slate-900 flex items-center relative z-20 shadow-[0_-10px_40px_rgba(0,0,0,0.5)]">
            <div className="bg-red-600 h-full px-6 flex items-center justify-center shrink-0">
                <span className="text-white font-black uppercase tracking-widest flex items-center gap-2">
                    <Megaphone className="w-5 h-5 animate-bounce" /> NEWS
                </span>
            </div>
            <div className="flex-1 overflow-hidden relative h-full flex items-center bg-white">
                {announcements.length > 0 ? (
                    <div className="absolute whitespace-nowrap animate-marquee px-4 text-xl font-bold text-slate-800 uppercase tracking-wide">
                        {announcements.map((a, i) => (
                            <span key={i} className="mx-8 inline-block">
                                <span className="text-red-500 mr-2">●</span> {a}
                            </span>
                        ))}
                    </div>
                ) : (
                    <span className="pl-6 text-slate-400 font-bold uppercase tracking-widest">Penalty Pro Arena - Professional Tournament System</span>
                )}
            </div>
            <div className="bg-slate-100 h-full px-6 flex items-center justify-center shrink-0 border-l border-slate-200">
                <span className="text-slate-400 text-xs font-bold">POWERED BY PENALTY PRO</span>
            </div>
        </div>

        {/* Progress Bar for Slide */}
        <div className="h-1 w-full bg-slate-800">
            <div 
                className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-1000 ease-linear"
                style={{ width: `${((currentSlide + 1) / totalSlides) * 100}%` }}
            ></div>
        </div>

        <style>{`
            @keyframes marquee {
                0% { transform: translateX(100%); }
                100% { transform: translateX(-100%); }
            }
            .animate-marquee {
                animation: marquee 20s linear infinite;
            }
        `}</style>
    </div>
  );
};

export default LiveWall;
