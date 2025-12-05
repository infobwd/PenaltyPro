
import React, { useState, useEffect, useMemo } from 'react';
import { Team, Standing, Match, KickResult, Player, MatchEvent, Prediction } from '../types'; 
import { Trophy, ArrowLeft, Calendar, LayoutGrid, X, User, Phone, MapPin, Info, BarChart3, History, Sparkles, Share2, Medal, AlertTriangle, ShieldCheck, Hand, Goal, Star, ChevronRight, Crown } from 'lucide-react'; 
import PlayerCard from './PlayerCard'; 
import { shareGroupStandings } from '../services/liffService';

interface StandingsViewProps {
  matches: Match[]; 
  teams: Team[];
  onBack: () => void;
  isLoading?: boolean;
  predictions?: Prediction[];
}

const StandingsView: React.FC<StandingsViewProps> = ({ matches, teams, onBack, isLoading, predictions = [] }) => {
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [activeTab, setActiveTab] = useState<'table' | 'scorers' | 'keepers' | 'fairplay' | 'fan'>('table');
  
  if (isLoading) {
      return (
        <div className="min-h-screen bg-slate-50 p-4 md:p-8 pb-24">
            <div className="max-w-5xl mx-auto animate-pulse">
                <div className="h-8 w-64 bg-slate-200 rounded mb-8"></div>
                <div className="flex gap-4 mb-6"><div className="h-10 w-32 bg-slate-200 rounded-full"></div><div className="h-10 w-32 bg-slate-200 rounded-full"></div></div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
                    <div className="h-64 bg-slate-200 rounded-2xl"></div>
                    <div className="h-64 bg-slate-200 rounded-2xl"></div>
                </div>
            </div>
        </div>
      );
  }

  // --- LOGIC: Standings Calculation ---
  const standings: Record<string, Standing> = {};
  teams.forEach(t => {
    if (t.status !== 'Approved') return;
    standings[t.name] = {
      teamId: t.id,
      teamName: t.name,
      logoUrl: t.logoUrl,
      group: t.group || 'General', 
      played: 0,
      won: 0,
      lost: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      points: 0
    };
  });

  matches.forEach(m => {
    if (!m.winner || m.winner === '') return; 
    const label = m.roundLabel || '';
    // Process only group matches for the table
    if (!label.toLowerCase().match(/group|กลุ่ม|สาย/)) return;

    const teamA = standings[typeof m.teamA === 'object' ? m.teamA.name : m.teamA];
    const teamB = standings[typeof m.teamB === 'object' ? m.teamB.name : m.teamB];
    
    if (teamA && teamB) {
        teamA.played++;
        teamB.played++;
        const scoreA = parseInt(m.scoreA.toString() || '0');
        const scoreB = parseInt(m.scoreB.toString() || '0');
        teamA.goalsFor += scoreA;
        teamA.goalsAgainst += scoreB;
        teamB.goalsFor += scoreB;
        teamB.goalsAgainst += scoreA;

        if (m.winner === 'A' || m.winner === teamA.teamName) {
            teamA.won++;
            teamA.points += 3;
            teamB.lost++;
        } else if (m.winner === 'B' || m.winner === teamB.teamName) {
            teamB.won++;
            teamB.points += 3;
            teamA.lost++;
        } else {
            // Draw logic if needed (currently winner is forced)
            teamA.points += 1;
            teamB.points += 1;
        }
    }
  });

  const groupedStandings: Record<string, Standing[]> = {};
  Object.values(standings).forEach(s => {
      const g = s.group || 'Unassigned';
      if (!groupedStandings[g]) groupedStandings[g] = [];
      groupedStandings[g].push(s);
  });

  Object.keys(groupedStandings).forEach(key => {
      groupedStandings[key].sort((a, b) => {
          if (b.points !== a.points) return b.points - a.points;
          if (b.won !== a.won) return b.won - a.won;
          return (b.goalsFor - b.goalsAgainst) - (a.goalsFor - a.goalsAgainst);
      });
  });

  const sortedGroupKeys = Object.keys(groupedStandings).sort();

  // --- LOGIC: Fan Leaderboard ---
  const fanLeaderboard = useMemo(() => {
      const scores: Record<string, { name: string, pic: string, points: number, correct: number }> = {};
      
      // Map match results for quick lookup
      const results: Record<string, 'A' | 'B' | null> = {};
      matches.forEach(m => {
          if (m.winner) {
              if (m.winner === 'A' || m.winner === (typeof m.teamA === 'string' ? m.teamA : m.teamA.name)) results[m.id] = 'A';
              else if (m.winner === 'B' || m.winner === (typeof m.teamB === 'string' ? m.teamB : m.teamB.name)) results[m.id] = 'B';
          }
      });

      predictions.forEach(p => {
          const winner = results[p.matchId];
          if (!winner) return; // Match not finished yet

          if (!scores[p.userId]) {
              scores[p.userId] = { name: p.userDisplayName || 'User', pic: p.userPictureUrl || '', points: 0, correct: 0 };
          }

          if (p.prediction === winner) {
              scores[p.userId].points += 10;
              scores[p.userId].correct += 1;
          }
      });

      return Object.values(scores).sort((a, b) => b.points - a.points).slice(0, 50); // Top 50
  }, [matches, predictions]);

  // --- LOGIC: Top Scorers ---
  const topScorers = useMemo(() => {
      const scorerMap: Record<string, { name: string, teamName: string, totalGoals: number, regularGoals: number, penGoals: number, teamLogo?: string }> = {};
      
      matches.forEach(m => {
          // 1. Regular Match Goals (Events)
          if (m.events) {
              m.events.forEach(e => {
                  if (e.type === 'GOAL') {
                      const key = `${e.player}_${e.teamId}`; 
                      const teamName = e.teamId === 'A' 
                          ? (typeof m.teamA === 'string' ? m.teamA : m.teamA.name)
                          : (typeof m.teamB === 'string' ? m.teamB : m.teamB.name);
                      const teamObj = teams.find(t => t.name === teamName);

                      if (!scorerMap[key]) {
                          scorerMap[key] = { name: e.player, teamName, totalGoals: 0, regularGoals: 0, penGoals: 0, teamLogo: teamObj?.logoUrl };
                      }
                      scorerMap[key].totalGoals += 1;
                      scorerMap[key].regularGoals += 1;
                  }
              });
          }

          // 2. Penalty Kicks
          if (m.kicks) {
              m.kicks.forEach(k => {
                  if (k.result === KickResult.GOAL) {
                      let pName = String(k.player || '').trim();
                      if (pName.includes('(#')) pName = pName.split('(#')[0].trim();
                      else pName = pName.replace(/[0-9]/g, '').replace('#','').trim();
                      if(!pName) return;

                      const teamName = k.teamId === 'A' || (typeof m.teamA === 'string' ? m.teamA : m.teamA.name) === k.teamId
                          ? (typeof m.teamA === 'string' ? m.teamA : m.teamA.name)
                          : (typeof m.teamB === 'string' ? m.teamB : m.teamB.name);
                      const teamObj = teams.find(t => t.name === teamName);
                      const key = `${pName}_${teamName}`;

                      if (!scorerMap[key]) {
                          scorerMap[key] = { name: pName, teamName, totalGoals: 0, regularGoals: 0, penGoals: 0, teamLogo: teamObj?.logoUrl };
                      }
                      scorerMap[key].totalGoals += 1;
                      scorerMap[key].penGoals += 1;
                  }
              });
          }
      });

      return Object.values(scorerMap).sort((a, b) => {
          if (b.totalGoals !== a.totalGoals) return b.totalGoals - a.totalGoals;
          return b.regularGoals - a.regularGoals;
      }).slice(0, 20); 
  }, [matches, teams]);

  // --- LOGIC: Top Keepers (Golden Glove & Clean Sheets) ---
  const topKeepers = useMemo(() => {
      const savesMap: Record<string, { teamName: string, saves: number, cleanSheets: number, teamLogo?: string }> = {};

      // Initialize all approved teams
      teams.forEach(t => {
          if(t.status === 'Approved') {
              savesMap[t.name] = { teamName: t.name, saves: 0, cleanSheets: 0, teamLogo: t.logoUrl };
          }
      });

      matches.forEach(m => {
          if (!m.winner) return;
          const tA = typeof m.teamA === 'string' ? m.teamA : m.teamA.name;
          const tB = typeof m.teamB === 'string' ? m.teamB : m.teamB.name;

          // Clean Sheets Logic (Regular Time)
          if (savesMap[tA] && m.scoreB === 0) savesMap[tA].cleanSheets += 1;
          if (savesMap[tB] && m.scoreA === 0) savesMap[tB].cleanSheets += 1;

          // Saves Logic (Penalty Shootouts)
          if (m.kicks) {
              m.kicks.forEach(k => {
                  if (k.result === KickResult.SAVED) {
                      const kickerTeam = k.teamId === 'A' || tA === k.teamId ? 'A' : 'B';
                      const saverTeamName = kickerTeam === 'A' ? tB : tA;
                      
                      if (savesMap[saverTeamName]) {
                          savesMap[saverTeamName].saves += 1;
                      }
                  }
              });
          }
      });

      return Object.values(savesMap)
        .filter(k => k.saves > 0 || k.cleanSheets > 0)
        .sort((a, b) => (b.saves * 2 + b.cleanSheets * 5) - (a.saves * 2 + a.cleanSheets * 5)) // Weighted score
        .slice(0, 10);
  }, [matches, teams]);

  // --- LOGIC: Fair Play ---
  const fairPlayRankings = useMemo(() => {
      const fpMap: Record<string, { team: Team, yellow: number, red: number, points: number }> = {};
      teams.forEach(t => { if (t.status === 'Approved') fpMap[t.name] = { team: t, yellow: 0, red: 0, points: 0 }; });

      matches.forEach(m => {
          if (m.events) {
              m.events.forEach(e => {
                  const teamName = e.teamId === 'A' 
                      ? (typeof m.teamA === 'string' ? m.teamA : m.teamA.name)
                      : (typeof m.teamB === 'string' ? m.teamB : m.teamB.name);
                  
                  if (fpMap[teamName]) {
                      if (e.type === 'YELLOW_CARD') {
                          fpMap[teamName].yellow += 1;
                          fpMap[teamName].points += 1;
                      } else if (e.type === 'RED_CARD') {
                          fpMap[teamName].red += 1;
                          fpMap[teamName].points += 3;
                      }
                  }
              });
          }
      });

      return Object.values(fpMap)
        .filter(t => true) 
        .sort((a, b) => a.points - b.points) 
        .slice(0, 20); 
  }, [matches, teams]);

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 pb-24" style={{ fontFamily: "'Kanit', sans-serif" }}>
        <div className="max-w-5xl mx-auto">
            <div className="flex items-center gap-4 mb-6">
                <button onClick={onBack} className="p-2 bg-white rounded-full shadow-sm hover:bg-slate-100 transition text-slate-600">
                    <ArrowLeft className="w-5 h-5" />
                </button>
                <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                    <Trophy className="w-8 h-8 text-yellow-500" /> สรุปผลการแข่งขัน
                </h1>
            </div>

            {/* Navigation Tabs */}
            <div className="flex overflow-x-auto gap-2 mb-8 pb-2 scrollbar-hide">
                <button onClick={() => setActiveTab('table')} className={`px-5 py-2.5 rounded-full font-bold text-sm whitespace-nowrap transition flex items-center gap-2 ${activeTab === 'table' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'bg-white text-slate-500 hover:bg-slate-100 border border-slate-200'}`}>
                    <LayoutGrid className="w-4 h-4"/> ตารางคะแนน
                </button>
                <button onClick={() => setActiveTab('scorers')} className={`px-5 py-2.5 rounded-full font-bold text-sm whitespace-nowrap transition flex items-center gap-2 ${activeTab === 'scorers' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'bg-white text-slate-500 hover:bg-slate-100 border border-slate-200'}`}>
                    <Medal className="w-4 h-4"/> ดาวซัลโว
                </button>
                <button onClick={() => setActiveTab('keepers')} className={`px-5 py-2.5 rounded-full font-bold text-sm whitespace-nowrap transition flex items-center gap-2 ${activeTab === 'keepers' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'bg-white text-slate-500 hover:bg-slate-100 border border-slate-200'}`}>
                    <Hand className="w-4 h-4"/> จอมหนึบ
                </button>
                <button onClick={() => setActiveTab('fairplay')} className={`px-5 py-2.5 rounded-full font-bold text-sm whitespace-nowrap transition flex items-center gap-2 ${activeTab === 'fairplay' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'bg-white text-slate-500 hover:bg-slate-100 border border-slate-200'}`}>
                    <ShieldCheck className="w-4 h-4"/> Fair Play
                </button>
                <button onClick={() => setActiveTab('fan')} className={`px-5 py-2.5 rounded-full font-bold text-sm whitespace-nowrap transition flex items-center gap-2 ${activeTab === 'fan' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'bg-white text-slate-500 hover:bg-slate-100 border border-slate-200'}`}>
                    <Sparkles className="w-4 h-4"/> Fan Zone
                </button>
            </div>

            {/* Content: Standings Table */}
            {activeTab === 'table' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12 animate-in fade-in slide-in-from-bottom-4">
                    {sortedGroupKeys.map(groupName => (
                        <div key={groupName} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                            <div className="p-4 bg-indigo-900 text-white font-bold flex items-center justify-between">
                                <div className="flex items-center gap-2"><LayoutGrid className="w-5 h-5" /> Group {groupName}</div>
                                <div className="flex items-center gap-2">
                                    <button 
                                        onClick={() => shareGroupStandings(groupName, groupedStandings[groupName])}
                                        className="p-1.5 bg-white/10 rounded-full hover:bg-white/20 transition text-white"
                                        title="แชร์ตารางคะแนน"
                                    >
                                        <Share2 className="w-4 h-4" />
                                    </button>
                                    <div className="text-xs bg-indigo-800 px-2 py-1 rounded text-indigo-200">สาย {groupName}</div>
                                </div>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-slate-50 text-slate-500 font-medium border-b">
                                        <tr>
                                            <th className="p-3 text-left w-10">#</th>
                                            <th className="p-3 text-left">ทีม</th>
                                            <th className="p-3 text-center">P</th>
                                            <th className="p-3 text-center">W</th>
                                            <th className="p-3 text-center">L</th>
                                            <th className="p-3 text-center text-green-600">GF</th>
                                            <th className="p-3 text-center text-red-500">GA</th>
                                            <th className="p-3 text-center font-bold bg-slate-100">Pts</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {groupedStandings[groupName].map((team, index) => (
                                            <tr 
                                                key={team.teamId} 
                                                className="hover:bg-slate-50 transition cursor-pointer"
                                                onClick={() => {
                                                    const realTeam = teams.find(t => t.id === team.teamId);
                                                    if (realTeam) setSelectedTeam(realTeam);
                                                }}
                                            >
                                                <td className="p-3 text-center font-bold text-slate-400">
                                                    {index + 1}
                                                </td>
                                                <td className="p-3">
                                                    <div className="flex items-center gap-2">
                                                        {team.logoUrl ? (
                                                            <img src={team.logoUrl} className="w-6 h-6 rounded bg-slate-200 object-cover" />
                                                        ) : (
                                                            <div className="w-6 h-6 rounded bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-[10px]">{team.teamName.substring(0,2)}</div>
                                                        )}
                                                        <span className="font-bold text-slate-700 truncate max-w-[120px]">{team.teamName}</span>
                                                    </div>
                                                </td>
                                                <td className="p-3 text-center text-slate-500">{team.played}</td>
                                                <td className="p-3 text-center text-indigo-600 font-bold">{team.won}</td>
                                                <td className="p-3 text-center text-slate-400">{team.lost}</td>
                                                <td className="p-3 text-center text-green-600 text-xs">{team.goalsFor}</td>
                                                <td className="p-3 text-center text-red-500 text-xs">{team.goalsAgainst}</td>
                                                <td className="p-3 text-center font-black text-slate-800 bg-slate-50">{team.points}</td>
                                            </tr>
                                        ))}
                                        {groupedStandings[groupName].length === 0 && (
                                            <tr><td colSpan={8} className="p-4 text-center text-slate-400 text-xs">ยังไม่มีทีมในสายนี้</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Content: Top Scorers (Enhanced Podium) */}
            {activeTab === 'scorers' && (
                <div className="animate-in fade-in slide-in-from-bottom-4 space-y-6">
                    <div className="bg-gradient-to-r from-yellow-500 to-amber-600 rounded-3xl p-6 text-white shadow-xl relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-white opacity-10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
                        <h2 className="text-2xl font-black flex items-center gap-3 relative z-10"><Medal className="w-8 h-8"/> ดาวซัลโว (Golden Boot)</h2>
                        <p className="text-amber-100 mt-1 relative z-10">สุดยอดนักล่าประตูประจำทัวร์นาเมนต์</p>
                    </div>

                    {topScorers.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end mb-8">
                            {/* 2nd Place */}
                            {topScorers[1] && (
                                <div className="bg-white rounded-2xl p-4 shadow-md border-b-4 border-slate-300 order-2 md:order-1 flex flex-col items-center">
                                    <div className="w-8 h-8 bg-slate-200 text-slate-600 rounded-full flex items-center justify-center font-black mb-3">2</div>
                                    <div className="w-20 h-20 bg-slate-100 rounded-full mb-3 overflow-hidden border-2 border-slate-200">
                                        {topScorers[1].teamLogo ? <img src={topScorers[1].teamLogo} className="w-full h-full object-contain p-2"/> : <User className="w-full h-full p-4 text-slate-300"/>}
                                    </div>
                                    <h3 className="font-bold text-slate-800 text-center">{topScorers[1].name}</h3>
                                    <p className="text-xs text-slate-500 mb-2">{topScorers[1].teamName}</p>
                                    <div className="text-3xl font-black text-slate-700">{topScorers[1].totalGoals}</div>
                                    <p className="text-[10px] text-slate-400">ประตู</p>
                                </div>
                            )}
                            
                            {/* 1st Place */}
                            {topScorers[0] && (
                                <div className="bg-gradient-to-b from-white to-yellow-50 rounded-2xl p-6 shadow-xl border-b-4 border-yellow-400 order-1 md:order-2 flex flex-col items-center transform md:-translate-y-4 relative">
                                    <div className="absolute -top-4"><Trophy className="w-8 h-8 text-yellow-500 fill-yellow-500 animate-bounce"/></div>
                                    <div className="w-24 h-24 bg-yellow-100 rounded-full mb-3 overflow-hidden border-4 border-yellow-400 shadow-inner">
                                        {topScorers[0].teamLogo ? <img src={topScorers[0].teamLogo} className="w-full h-full object-contain p-2"/> : <User className="w-full h-full p-4 text-yellow-300"/>}
                                    </div>
                                    <h3 className="font-black text-xl text-slate-800 text-center">{topScorers[0].name}</h3>
                                    <p className="text-sm text-slate-500 mb-3">{topScorers[0].teamName}</p>
                                    <div className="text-5xl font-black text-yellow-500 drop-shadow-sm">{topScorers[0].totalGoals}</div>
                                    <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Goals</p>
                                </div>
                            )}

                            {/* 3rd Place */}
                            {topScorers[2] && (
                                <div className="bg-white rounded-2xl p-4 shadow-md border-b-4 border-orange-300 order-3 flex flex-col items-center">
                                    <div className="w-8 h-8 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center font-black mb-3">3</div>
                                    <div className="w-20 h-20 bg-orange-50 rounded-full mb-3 overflow-hidden border-2 border-orange-200">
                                        {topScorers[2].teamLogo ? <img src={topScorers[2].teamLogo} className="w-full h-full object-contain p-2"/> : <User className="w-full h-full p-4 text-orange-200"/>}
                                    </div>
                                    <h3 className="font-bold text-slate-800 text-center">{topScorers[2].name}</h3>
                                    <p className="text-xs text-slate-500 mb-2">{topScorers[2].teamName}</p>
                                    <div className="text-3xl font-black text-orange-500">{topScorers[2].totalGoals}</div>
                                    <p className="text-[10px] text-slate-400">ประตู</p>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="p-12 text-center text-slate-400 bg-white rounded-xl border-dashed border-2 border-slate-200">ยังไม่มีการทำประตูเกิดขึ้น</div>
                    )}

                    {/* List for the rest */}
                    {topScorers.length > 3 && (
                        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                            <div className="bg-slate-50 p-3 text-xs font-bold text-slate-500 uppercase tracking-wider">อันดับอื่นๆ</div>
                            <div className="divide-y divide-slate-100">
                                {topScorers.slice(3).map((player, idx) => (
                                    <div key={idx} className="flex items-center justify-between p-4 hover:bg-slate-50 transition">
                                        <div className="flex items-center gap-4">
                                            <div className="w-6 text-center font-bold text-slate-400">{idx + 4}</div>
                                            <div className="flex flex-col">
                                                <span className="font-bold text-slate-800">{player.name}</span>
                                                <div className="flex items-center gap-1 text-xs text-slate-500">
                                                    {player.teamLogo && <img src={player.teamLogo} className="w-3 h-3 object-contain"/>}
                                                    {player.teamName}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <div className="text-right text-[10px] text-slate-400">
                                                <div>Reg: {player.regularGoals}</div>
                                                <div>Pen: {player.penGoals}</div>
                                            </div>
                                            <span className="text-xl font-bold text-indigo-600 w-8 text-center">{player.totalGoals}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Content: Top Keepers */}
            {activeTab === 'keepers' && (
                <div className="animate-in fade-in slide-in-from-bottom-4 space-y-6">
                    <div className="bg-gradient-to-r from-blue-600 to-cyan-500 rounded-3xl p-6 text-white shadow-xl relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-white opacity-10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
                        <h2 className="text-2xl font-black flex items-center gap-3 relative z-10"><Hand className="w-8 h-8"/> จอมหนึบ (Golden Glove)</h2>
                        <p className="text-blue-100 mt-1 relative z-10">ผู้รักษาประตูที่ทำผลงานยอดเยี่ยมที่สุด</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {topKeepers.map((keeperTeam, idx) => (
                            <div key={idx} className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex items-center justify-between hover:shadow-md transition group">
                                <div className="flex items-center gap-4">
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-lg ${idx === 0 ? 'bg-yellow-100 text-yellow-600' : 'bg-slate-100 text-slate-500'}`}>
                                        {idx + 1}
                                    </div>
                                    <div className="flex items-center gap-3">
                                        {keeperTeam.teamLogo ? <img src={keeperTeam.teamLogo} className="w-12 h-12 object-contain rounded-xl bg-slate-50 p-1" /> : <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center font-bold text-slate-400">{keeperTeam.teamName.substring(0,1)}</div>}
                                        <div>
                                            <h3 className="font-bold text-slate-800">ผู้รักษาประตู</h3>
                                            <p className="text-xs text-slate-500">{keeperTeam.teamName}</p>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex gap-3">
                                    {keeperTeam.cleanSheets > 0 && (
                                        <div className="flex flex-col items-center bg-green-50 p-2 rounded-lg border border-green-100">
                                            <span className="text-lg font-black text-green-600">{keeperTeam.cleanSheets}</span>
                                            <span className="text-[9px] text-green-500 font-bold uppercase">Clean Sheets</span>
                                        </div>
                                    )}
                                    {keeperTeam.saves > 0 && (
                                        <div className="flex flex-col items-center bg-blue-50 p-2 rounded-lg border border-blue-100">
                                            <span className="text-lg font-black text-blue-600">{keeperTeam.saves}</span>
                                            <span className="text-[9px] text-blue-500 font-bold uppercase">PK Saves</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                        {topKeepers.length === 0 && (
                            <div className="col-span-full p-12 text-center text-slate-400 bg-white rounded-xl border-dashed border-2 border-slate-200">ยังไม่มีข้อมูลการเซฟหรือคลีนชีต</div>
                        )}
                    </div>
                </div>
            )}

            {/* Content: Fair Play */}
            {activeTab === 'fairplay' && (
                <div className="animate-in fade-in slide-in-from-bottom-4 space-y-6">
                    <div className="bg-gradient-to-r from-emerald-500 to-green-600 rounded-3xl p-6 text-white shadow-xl relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-white opacity-10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
                        <h2 className="text-2xl font-black flex items-center gap-3 relative z-10"><ShieldCheck className="w-8 h-8"/> คะแนน Fair Play</h2>
                        <p className="text-green-100 mt-1 relative z-10">ทีมที่มีน้ำใจนักกีฬา (คะแนนน้อย = มารยาทดี)</p>
                    </div>

                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                        <div className="bg-slate-50 p-3 flex justify-between text-xs font-bold text-slate-500 uppercase tracking-wider">
                            <span>ทีม</span>
                            <div className="flex gap-4 pr-2">
                                <span className="w-8 text-center text-yellow-600">Yellow</span>
                                <span className="w-8 text-center text-red-600">Red</span>
                                <span className="w-12 text-center text-slate-700">Pts</span>
                            </div>
                        </div>
                        <div className="divide-y divide-slate-100">
                            {fairPlayRankings.map((fp, idx) => (
                                <div key={fp.team.id} className="flex items-center justify-between p-4 hover:bg-slate-50 transition">
                                    <div className="flex items-center gap-4">
                                        <div className={`w-6 text-center font-bold text-sm ${idx < 3 ? 'text-green-600' : 'text-slate-400'}`}>
                                            {idx + 1}
                                        </div>
                                        <div className="flex items-center gap-3">
                                            {fp.team.logoUrl ? <img src={fp.team.logoUrl} className="w-8 h-8 object-contain" /> : <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center font-bold text-slate-400">{fp.team.shortName}</div>}
                                            <span className="font-bold text-slate-800 text-sm md:text-base">{fp.team.name}</span>
                                        </div>
                                    </div>
                                    <div className="flex gap-4">
                                        <div className="w-8 flex justify-center">
                                            {fp.yellow > 0 ? <span className="bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded font-bold">{fp.yellow}</span> : <span className="text-slate-200">-</span>}
                                        </div>
                                        <div className="w-8 flex justify-center">
                                            {fp.red > 0 ? <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded font-bold">{fp.red}</span> : <span className="text-slate-200">-</span>}
                                        </div>
                                        <div className="w-12 text-center font-mono font-black text-slate-700 text-lg">
                                            {fp.points}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Content: Fan Zone */}
            {activeTab === 'fan' && (
                <div className="animate-in fade-in slide-in-from-bottom-4 space-y-6">
                    <div className="bg-gradient-to-r from-purple-600 to-indigo-600 rounded-3xl p-6 text-white shadow-xl relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-white opacity-10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
                        <h2 className="text-2xl font-black flex items-center gap-3 relative z-10"><Sparkles className="w-8 h-8"/> Fan Leaderboard</h2>
                        <p className="text-purple-100 mt-1 relative z-10">อันดับกองเชียร์ตาทิพย์ ทายผลแม่นยำ</p>
                    </div>

                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                        <div className="divide-y divide-slate-100">
                            {fanLeaderboard.length === 0 ? (
                                <div className="p-12 text-center text-slate-400">ยังไม่มีข้อมูลการทายผล</div>
                            ) : (
                                fanLeaderboard.map((fan, idx) => (
                                    <div key={idx} className="flex items-center justify-between p-4 hover:bg-slate-50 transition">
                                        <div className="flex items-center gap-4">
                                            <div className={`w-8 h-8 flex items-center justify-center font-black rounded-full ${idx === 0 ? 'bg-yellow-100 text-yellow-600' : idx === 1 ? 'bg-slate-200 text-slate-600' : idx === 2 ? 'bg-orange-100 text-orange-600' : 'text-slate-400'}`}>
                                                {idx < 3 ? <Crown className="w-4 h-4"/> : idx + 1}
                                            </div>
                                            <div className="flex items-center gap-3">
                                                {fan.pic ? (
                                                    <img src={fan.pic} className="w-10 h-10 rounded-full object-cover border border-slate-200" />
                                                ) : (
                                                    <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center"><User className="w-5 h-5 text-slate-400"/></div>
                                                )}
                                                <div>
                                                    <div className="font-bold text-slate-800 text-sm">{fan.name}</div>
                                                    <div className="text-xs text-slate-400">ทายถูก {fan.correct} คู่</div>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-xl font-black text-indigo-600">{fan.points}</div>
                                            <div className="text-[10px] text-slate-400 uppercase font-bold">Points</div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Match History (Always Visible) */}
            <div className="mt-12 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden animate-in slide-in-from-bottom-8">
                <div className="p-4 bg-slate-800 text-white font-bold flex items-center gap-2 sticky top-0 z-10">
                    <Calendar className="w-5 h-5" /> ผลการแข่งขันล่าสุด
                </div>
                <div className="divide-y divide-slate-100 max-h-[400px] overflow-y-auto custom-scrollbar">
                    {matches.length === 0 ? (
                         <div className="p-8 text-center text-slate-400">ยังไม่มีบันทึกการแข่งขัน</div>
                    ) : (
                        matches.slice().reverse().map((m, idx) => (
                            <div key={idx} className="p-4 flex flex-col md:flex-row items-center justify-between hover:bg-slate-50 gap-4">
                                <div className="flex items-center justify-center gap-6 flex-1">
                                    <div className="text-right flex-1 font-bold text-slate-700 truncate">{typeof m.teamA === 'string' ? m.teamA : m.teamA.name}</div>
                                    <div className="bg-slate-100 px-4 py-2 rounded-lg font-mono font-bold text-xl text-indigo-600 shadow-inner border border-slate-200">
                                        {m.scoreA} - {m.scoreB}
                                    </div>
                                    <div className="text-left flex-1 font-bold text-slate-700 truncate">{typeof m.teamB === 'string' ? m.teamB : m.teamB.name}</div>
                                </div>
                                <div className="text-xs text-slate-400 md:w-32 text-center">
                                    {new Date(m.date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit'})}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {selectedTeam && (
                <TeamDetailModal 
                    team={selectedTeam} 
                    matches={matches} 
                    onClose={() => setSelectedTeam(null)} 
                />
            )}
        </div>
    </div>
  );
};

export default StandingsView;
