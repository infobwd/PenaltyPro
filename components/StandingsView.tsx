
import React, { useState, useEffect } from 'react';
import { Team, Standing, Match, KickResult, Player } from '../types'; 
import { Trophy, ArrowLeft, Calendar, LayoutGrid, X, User, Phone, MapPin, Info, BarChart3, History, Sparkles } from 'lucide-react'; 
import PlayerCard from './PlayerCard'; 

interface StandingsViewProps {
  matches: Match[]; 
  teams: Team[];
  onBack: () => void;
  isLoading?: boolean;
}

const StandingsView: React.FC<StandingsViewProps> = ({ matches, teams, onBack, isLoading }) => {
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  
  if (isLoading) {
      return (
        <div className="min-h-screen bg-slate-50 p-4 md:p-8 pb-24">
            <div className="max-w-5xl mx-auto animate-pulse">
                <div className="h-8 w-64 bg-slate-200 rounded mb-8"></div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
                    <div className="h-64 bg-slate-200 rounded-2xl"></div>
                    <div className="h-64 bg-slate-200 rounded-2xl"></div>
                </div>
                <div className="h-96 bg-slate-200 rounded-2xl"></div>
            </div>
        </div>
      );
  }

  const standings: Record<string, Standing> = {};
  
  // Filter only Approved teams
  teams.forEach(t => {
    if (t.status !== 'Approved') return; // Skip if not approved

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
    
    // STRICT FILTER FOR GROUP STAGE
    const label = m.roundLabel || '';
    if (!label.toLowerCase().match(/group|กลุ่ม|สาย/)) return;

    const teamA = standings[typeof m.teamA === 'object' ? m.teamA.name : m.teamA];
    const teamB = standings[typeof m.teamB === 'object' ? m.teamB.name : m.teamB];
    
    // Only calculate if BOTH teams are in the standings object (meaning both are Approved)
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

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 pb-24">
        <div className="max-w-5xl mx-auto">
            <div className="flex items-center gap-4 mb-8">
                <button onClick={onBack} className="p-2 bg-white rounded-full shadow-sm hover:bg-slate-100 transition text-slate-600">
                    <ArrowLeft className="w-5 h-5" />
                </button>
                <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                    <Trophy className="w-8 h-8 text-yellow-500" /> ตารางคะแนน (Round Robin)
                </h1>
            </div>

            {/* Render Tables per Group */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
                {sortedGroupKeys.map(groupName => (
                    <div key={groupName} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden animate-in slide-in-from-bottom-4">
                        <div className="p-4 bg-indigo-900 text-white font-bold flex items-center justify-between">
                            <div className="flex items-center gap-2"><LayoutGrid className="w-5 h-5" /> Group {groupName}</div>
                            <div className="text-xs bg-indigo-800 px-2 py-1 rounded text-indigo-200">สาย {groupName}</div>
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

            {/* Match History */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden animate-in slide-in-from-bottom-8">
                <div className="p-4 bg-slate-800 text-white font-bold flex items-center gap-2 sticky top-0 z-10">
                    <Calendar className="w-5 h-5" /> ผลการแข่งขันล่าสุด
                </div>
                <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto custom-scrollbar">
                    {matches.length === 0 ? (
                         <div className="p-8 text-center text-slate-400">ยังไม่มีบันทึกการแข่งขัน</div>
                    ) : (
                        matches.slice().reverse().map((m, idx) => (
                            <div key={idx} className="p-4 flex flex-col md:flex-row items-center justify-between hover:bg-slate-50 gap-4">
                                <div className="flex items-center justify-center gap-6 flex-1">
                                    <div className="text-right flex-1 font-bold text-slate-700">{typeof m.teamA === 'string' ? m.teamA : m.teamA.name}</div>
                                    <div className="bg-slate-100 px-4 py-2 rounded-lg font-mono font-bold text-xl text-indigo-600 shadow-inner border border-slate-200">
                                        {m.scoreA} - {m.scoreB}
                                    </div>
                                    <div className="text-left flex-1 font-bold text-slate-700">{typeof m.teamB === 'string' ? m.teamB : m.teamB.name}</div>
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

interface TeamDetailModalProps {
    team: Team;
    matches: Match[];
    onClose: () => void;
}

const TeamDetailModal: React.FC<TeamDetailModalProps> = ({ team, matches, onClose }) => {
    const [tab, setTab] = useState<'info' | 'form' | 'stats' | 'cards'>('info'); 
    const [formLimit, setFormLimit] = useState(5);
    const [players, setPlayers] = useState<Player[]>([]);
    const [cardPlayer, setCardPlayer] = useState<Player | null>(null);

    useEffect(() => {
        import('../services/sheetService').then(service => {
            service.fetchDatabase().then(data => {
                if (data && data.players) {
                    setPlayers(data.players.filter(p => p.teamId === team.id));
                }
            });
        });
    }, [team.id]);

    // Calculate Form (Last 5 matches)
    const teamMatches = matches
        .filter(m => {
            const nameA = typeof m.teamA === 'string' ? m.teamA : m.teamA.name;
            const nameB = typeof m.teamB === 'string' ? m.teamB : m.teamB.name;
            return (nameA === team.name || nameB === team.name) && m.winner;
        })
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const recentMatches = teamMatches.slice(0, formLimit);

    // Calculate Player Stats
    const playerGoals: Record<string, number> = {};
    matches.forEach(m => {
        if (m.kicks) {
            m.kicks.forEach(k => {
                if (k.result === KickResult.GOAL && (k.teamId === team.name || k.teamId === 'A' && (typeof m.teamA === 'string' ? m.teamA : m.teamA.name) === team.name || k.teamId === 'B' && (typeof m.teamB === 'string' ? m.teamB : m.teamB.name) === team.name)) {
                    // Fix: Ensure player name is a string before trimming
                    let pName = String(k.player || '').trim();
                    if (pName.includes('(#')) {
                         pName = pName.split('(#')[0].trim();
                    } else {
                         pName = pName.replace(/[0-9]/g, '').replace('#','').trim();
                    }
                    if(!pName) pName = "ไม่ระบุชื่อ";
                    playerGoals[pName] = (playerGoals[pName] || 0) + 1;
                }
            });
        }
    });
    
    const topScorers = Object.entries(playerGoals)
        .map(([name, goals]) => ({ name, goals }))
        .sort((a, b) => b.goals - a.goals);

    return (
        <div className="fixed inset-0 z-[1200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
            {cardPlayer && (
                <PlayerCard player={cardPlayer} team={team} onClose={() => setCardPlayer(null)} />
            )}

            <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in duration-200 flex flex-col max-h-[85vh]" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="bg-slate-900 p-6 text-white relative shrink-0">
                    <button onClick={onClose} className="absolute top-4 right-4 bg-white/20 hover:bg-white/40 p-2 rounded-full transition"><X className="w-5 h-5"/></button>
                    <div className="flex flex-col items-center">
                        {team.logoUrl ? (
                            <img src={team.logoUrl} className="w-20 h-20 bg-white rounded-2xl p-1 mb-3 shadow-lg object-contain" />
                        ) : (
                            <div className="w-20 h-20 bg-white/20 rounded-2xl flex items-center justify-center text-2xl font-bold mb-3">
                                {team.shortName}
                            </div>
                        )}
                        <h2 className="text-xl font-bold text-center">{team.name}</h2>
                        {team.group && <span className="mt-1 px-3 py-1 bg-indigo-600 rounded-full text-xs font-bold shadow-sm">Group {team.group}</span>}
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex border-b shrink-0 overflow-x-auto">
                    <button onClick={() => setTab('info')} className={`flex-1 py-3 text-sm font-bold flex items-center justify-center gap-2 transition min-w-[80px] ${tab === 'info' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50' : 'text-slate-500 hover:bg-slate-50'}`}><Info className="w-4 h-4"/> ข้อมูล</button>
                    <button onClick={() => setTab('form')} className={`flex-1 py-3 text-sm font-bold flex items-center justify-center gap-2 transition min-w-[80px] ${tab === 'form' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50' : 'text-slate-500 hover:bg-slate-50'}`}><History className="w-4 h-4"/> ฟอร์ม</button>
                    <button onClick={() => setTab('stats')} className={`flex-1 py-3 text-sm font-bold flex items-center justify-center gap-2 transition min-w-[80px] ${tab === 'stats' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50' : 'text-slate-500 hover:bg-slate-50'}`}><BarChart3 className="w-4 h-4"/> สถิติ</button>
                    <button onClick={() => setTab('cards')} className={`flex-1 py-3 text-sm font-bold flex items-center justify-center gap-2 transition min-w-[80px] ${tab === 'cards' ? 'text-yellow-600 border-b-2 border-yellow-500 bg-yellow-50' : 'text-slate-500 hover:bg-slate-50'}`}><Sparkles className="w-4 h-4 text-yellow-500"/> Cards</button>
                </div>

                {/* Content */}
                <div className="p-4 overflow-y-auto bg-slate-50 flex-1">
                    {tab === 'info' && (
                        <div className="space-y-4">
                            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
                                <h4 className="font-bold text-slate-700 mb-3 flex items-center gap-2 text-sm"><MapPin className="w-4 h-4 text-indigo-500"/> ที่ตั้ง</h4>
                                <div className="grid grid-cols-2 gap-4 text-sm">
                                    <div><span className="text-slate-400 text-xs block">อำเภอ</span>{team.district}</div>
                                    <div><span className="text-slate-400 text-xs block">จังหวัด</span>{team.province}</div>
                                </div>
                            </div>
                            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
                                <h4 className="font-bold text-slate-700 mb-3 flex items-center gap-2 text-sm"><User className="w-4 h-4 text-indigo-500"/> บุคลากร</h4>
                                <div className="space-y-3 text-sm">
                                    <div><span className="text-slate-400 text-xs block">ผอ.โรงเรียน</span>{team.directorName || '-'}</div>
                                    <div className="flex justify-between">
                                        <div><span className="text-slate-400 text-xs block">ผู้จัดการทีม</span>{team.managerName || '-'}</div>
                                        {team.managerPhone && <a href={`tel:${team.managerPhone}`} className="text-indigo-600 bg-indigo-50 px-2 py-1 rounded text-xs flex items-center gap-1 h-fit"><Phone className="w-3 h-3"/> โทร</a>}
                                    </div>
                                    <div className="flex justify-between">
                                        <div><span className="text-slate-400 text-xs block">ผู้ฝึกสอน</span>{team.coachName || '-'}</div>
                                        {team.coachPhone && <a href={`tel:${team.coachPhone}`} className="text-indigo-600 bg-indigo-50 px-2 py-1 rounded text-xs flex items-center gap-1 h-fit"><Phone className="w-3 h-3"/> โทร</a>}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {tab === 'form' && (
                        <div className="space-y-3">
                            {recentMatches.length > 0 ? (
                                <>
                                    {recentMatches.map(m => {
                                        const isHome = (typeof m.teamA === 'string' ? m.teamA : m.teamA.name) === team.name;
                                        const opponent = isHome ? (typeof m.teamB === 'string' ? m.teamB : m.teamB.name) : (typeof m.teamA === 'string' ? m.teamA : m.teamA.name);
                                        const myScore = isHome ? m.scoreA : m.scoreB;
                                        const opScore = isHome ? m.scoreB : m.scoreA;
                                        const isWin = (m.winner === 'A' && isHome) || (m.winner === 'B' && !isHome) || (m.winner === team.name);
                                        
                                        return (
                                            <div key={m.id} className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-2 h-10 rounded-full ${isWin ? 'bg-green-500' : 'bg-red-500'}`}></div>
                                                    <div>
                                                        <div className="text-xs text-slate-400">{new Date(m.date).toLocaleDateString('th-TH', {day:'numeric', month:'short'})} • {m.roundLabel?.split(':')[0]}</div>
                                                        <div className="font-bold text-slate-700 text-sm">vs {opponent}</div>
                                                    </div>
                                                </div>
                                                <div className={`text-xl font-mono font-black ${isWin ? 'text-green-600' : 'text-slate-400'}`}>
                                                    {myScore}-{opScore}
                                                </div>
                                            </div>
                                        );
                                    })}
                                    {teamMatches.length > formLimit && (
                                        <button onClick={() => setFormLimit(prev => prev + 5)} className="w-full py-2 text-xs text-slate-500 bg-slate-200 rounded-lg hover:bg-slate-300 font-bold">
                                            ดูเพิ่มเติม
                                        </button>
                                    )}
                                </>
                            ) : (
                                <div className="text-center text-slate-400 py-8">ยังไม่มีประวัติการแข่งขัน</div>
                            )}
                        </div>
                    )}

                    {tab === 'stats' && (
                        <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
                            <div className="p-3 bg-slate-50 border-b text-xs font-bold text-slate-500 uppercase flex justify-between">
                                <span>ผู้เล่น</span>
                                <span>ประตู (จุดโทษ)</span>
                            </div>
                            <div className="divide-y divide-slate-100">
                                {topScorers.length > 0 ? topScorers.map((p, i) => (
                                    <div key={p.name} className="p-3 flex justify-between items-center">
                                        <div className="flex items-center gap-3">
                                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${i === 0 ? 'bg-yellow-100 text-yellow-700' : 'bg-slate-100 text-slate-500'}`}>
                                                {i + 1}
                                            </div>
                                            <span className="font-medium text-slate-700 text-sm">{p.name}</span>
                                        </div>
                                        <div className="font-mono font-bold text-indigo-600">{p.goals}</div>
                                    </div>
                                )) : (
                                    <div className="text-center text-slate-400 py-6 text-sm">ไม่มีข้อมูลการทำประตู</div>
                                )}
                            </div>
                        </div>
                    )}

                    {tab === 'cards' && (
                        <div className="space-y-4">
                            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 flex items-start gap-3">
                                <Sparkles className="w-5 h-5 text-yellow-600 mt-0.5"/>
                                <div>
                                    <h4 className="font-bold text-yellow-800 text-sm">Player Spotlight Cards</h4>
                                    <p className="text-xs text-yellow-700">เลือกนักเตะเพื่อสร้างการ์ดเท่ๆ แชร์ลงโซเชียล!</p>
                                </div>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-3">
                                {players.length > 0 ? players.map(p => (
                                    <button 
                                        key={p.id} 
                                        onClick={() => setCardPlayer(p)}
                                        className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm hover:border-yellow-400 hover:ring-2 hover:ring-yellow-100 transition flex flex-col items-center gap-2 group"
                                    >
                                        <div className="w-16 h-16 rounded-full bg-slate-100 overflow-hidden border-2 border-slate-200 group-hover:border-yellow-400 transition">
                                            {p.photoUrl ? (
                                                <img src={p.photoUrl} className="w-full h-full object-cover" />
                                            ) : (
                                                <User className="w-full h-full p-3 text-slate-400" />
                                            )}
                                        </div>
                                        <div className="text-center">
                                            <div className="font-bold text-slate-800 text-sm truncate w-24">{p.name}</div>
                                            <div className="text-xs text-slate-500">#{p.number}</div>
                                        </div>
                                    </button>
                                )) : (
                                    <div className="col-span-2 text-center py-8 text-slate-400 flex flex-col items-center">
                                        <User className="w-12 h-12 mb-2 text-slate-200" />
                                        <span>กำลังโหลดข้อมูลนักเตะ...</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default StandingsView;
