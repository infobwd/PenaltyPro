import { Match, NewsItem, RegistrationData, KickResult, Team, Player, Tournament, Donation, TournamentPrize } from '../types';

declare global {
  interface Window {
    liff: any;
  }
}

export const initializeLiff = async (liffId?: string) => {
  try {
    if (!window.liff) return;
    if (!liffId) {
        console.warn("LIFF ID not provided in config");
        return;
    }
    await window.liff.init({ liffId });
  } catch (error) {
    console.error('LIFF Init Failed', error);
  }
};

const truncate = (str: string, length: number) => {
  if (!str) return "";
  if (str.length <= length) return str;
  return str.substring(0, length - 3) + "...";
};

export const shareMatchSummary = async (match: Match, summary: string, teamAName: string, teamBName: string, competitionName: string = "Penalty Pro Recorder") => {
    if (!window.liff?.isLoggedIn()) { window.liff?.login(); return; }
    const safeSummary = truncate(summary || "สรุปผลการแข่งขัน", 500);
    const safeAltText = truncate(`ผลบอล: ${teamAName} vs ${teamBName}`, 100);
    
    // Simplified Match Summary
    const flexMessage = { 
      type: "flex", 
      altText: safeAltText, 
      contents: { 
        "type": "bubble", 
        "body": { 
          "type": "box", 
          "layout": "vertical", 
          "contents": [ 
            { "type": "text", "text": "MATCH REPORT", "weight": "bold", "color": "#1e3a8a", "size": "xxs", "align": "center" }, 
            { "type": "text", "text": `${match.scoreA} - ${match.scoreB}`, "weight": "bold", "size": "4xl", "color": "#1e3a8a", "align": "center", "margin": "md" }, 
            { "type": "text", "text": `${truncate(teamAName, 15)} vs ${truncate(teamBName, 15)}`, "size": "sm", "color": "#64748b", "align": "center", "margin": "sm" },
            { "type": "separator", "margin": "lg" },
            { "type": "text", "text": safeSummary, "wrap": true, "size": "sm", "color": "#334155", "margin": "lg" } 
          ], 
          "paddingAll": "xl" 
        }
      } 
    };
    try { await window.liff.shareTargetPicker([flexMessage]); } catch (error: any) { alert(`ไม่สามารถแชร์ได้: ${error.message}`); }
};

export const sharePlayerCardFlex = async (player: Player, team: Team, stats: any) => {
    if (!window.liff?.isLoggedIn()) { window.liff?.login(); return; }
    const createStatRow = (l1: string, v1: number, l2: string, v2: number) => ({ "type": "box", "layout": "horizontal", "contents": [ { "type": "text", "text": `${v1}`, "weight": "bold", "color": "#fbbf24", "flex": 1, "align": "end", "size": "sm" }, { "type": "text", "text": l1, "size": "xxs", "color": "#94a3b8", "flex": 1, "margin": "sm", "align": "start", "gravity": "center" }, { "type": "text", "text": `${v2}`, "weight": "bold", "color": "#fbbf24", "flex": 1, "align": "end", "size": "sm" }, { "type": "text", "text": l2, "size": "xxs", "color": "#94a3b8", "flex": 1, "margin": "sm", "align": "start", "gravity": "center" } ], "margin": "sm" });
    const flexMessage = { type: "flex", altText: `Player Card: ${player.name}`, contents: { "type": "bubble", "styles": { "body": { "backgroundColor": "#1e293b" }, "footer": { "backgroundColor": "#0f172a" } }, "body": { "type": "box", "layout": "vertical", "contents": [ { "type": "box", "layout": "horizontal", "contents": [ { "type": "box", "layout": "vertical", "contents": [ { "type": "text", "text": `${stats.ovr}`, "size": "3xl", "weight": "bold", "color": "#fbbf24", "lineHeight": "30px" }, { "type": "text", "text": player.position ? player.position.substring(0,3).toUpperCase() : "PLY", "size": "xs", "weight": "bold", "color": "#ffffff" } ], "flex": 1 }, { "type": "image", "url": team.logoUrl || "https://via.placeholder.com/100?text=Logo", "align": "end", "size": "xs", "aspectMode": "fit", "flex": 1 } ] }, { "type": "image", "url": player.photoUrl || "https://img.icons8.com/ios-filled/200/ffffff/user-male-circle.png", "size": "xl", "aspectMode": "cover", "margin": "md" }, { "type": "text", "text": truncate(player.name, 25), "weight": "bold", "size": "xl", "color": "#ffffff", "align": "center", "margin": "md", "wrap": true }, { "type": "text", "text": truncate(team.name, 30), "size": "xs", "color": "#94a3b8", "align": "center", "margin": "xs", "wrap": true }, { "type": "separator", "margin": "md", "color": "#334155" }, { "type": "box", "layout": "vertical", "contents": [ createStatRow("PAC", stats.pac, "DRI", stats.dri), createStatRow("SHO", stats.sho, "DEF", stats.def), createStatRow("PAS", stats.pas, "PHY", stats.phy) ], "margin": "md" } ] }, "footer": { "type": "box", "layout": "vertical", "contents": [ { "type": "text", "text": "Penalty Pro Official Card", "size": "xxs", "color": "#64748b", "align": "center" } ] } } };
    try { await window.liff.shareTargetPicker([flexMessage]); } catch (error: any) { alert(`ไม่สามารถแชร์ได้: ${error.message}`); }
};

export const shareRegistration = async (data: RegistrationData, teamId: string) => {
  const liffId = window.liff?.id; 
  if (!window.liff?.isLoggedIn()) { window.liff?.login(); return; }
  
  const baseUrl = `https://liff.line.me/${liffId}`;
  const adminLink = `${baseUrl}?view=admin&teamId=${teamId}`;
  
  const flexMessage = { type: "flex", altText: `ใบสมัคร: ${truncate(data.schoolName, 20)}`, contents: { "type": "bubble", "body": { "type": "box", "layout": "vertical", "contents": [ { "type": "text", "text": "ใบสมัครแข่งขัน", "weight": "bold", "color": "#166534", "size": "xs" }, { "type": "text", "text": truncate(data.schoolName, 40), "weight": "bold", "size": "xl", "color": "#1F2937", "wrap": true, "margin": "sm" }, { "type": "text", "text": `ผู้ติดต่อ: ${data.phone}`, "size": "xs", "color": "#4B5563", "margin": "md", "wrap": true }, { "type": "separator", "margin": "lg" }, { "type": "box", "layout": "vertical", "margin": "lg", "spacing": "sm", "contents": [ { "type": "button", "style": "primary", "height": "sm", "action": { "type": "uri", "label": "ตรวจสอบ/อนุมัติ", "uri": adminLink }, "color": "#2563EB" } ] } ], "paddingAll": "xl" } } };
  try { await window.liff.shareTargetPicker([flexMessage]); } catch (error: any) { alert(`แชร์ไม่สำเร็จ: ${error.message}`); }
};

export const shareNews = async (news: NewsItem) => {
  const liffId = window.liff?.id;
  if (!window.liff?.isLoggedIn()) { window.liff?.login(); return; }
  const liffUrl = `https://liff.line.me/${liffId}?view=news&id=${news.id}`;
  const flexMessage = { type: "flex", altText: truncate(`ข่าวสาร: ${news.title}`, 100), contents: { "type": "bubble", "body": { "type": "box", "layout": "vertical", "contents": [ { "type": "text", "text": "NEWS UPDATE", "size": "xxs", "color": "#1e40af", "weight": "bold" }, { "type": "text", "text": truncate(news.title, 60), "weight": "bold", "size": "lg", "wrap": true, "margin": "sm" }, { "type": "text", "text": truncate(news.content, 100), "size": "xs", "color": "#666666", "wrap": true, "margin": "md", "maxLines": 3 }, { "type": "button", "action": { "type": "uri", "label": "อ่านต่อ", "uri": liffUrl }, "style": "link", "margin": "md" } ], "paddingAll": "xl" } } };
  try { await window.liff.shareTargetPicker([flexMessage]); } catch (error: any) { alert(`แชร์ไม่สำเร็จ: ${error.message}`); }
};

export const shareMatch = async (match: Match, teamAName: string, teamBName: string, teamALogo: string, teamBLogo: string) => {
  const liffId = window.liff?.id;
  if (!window.liff?.isLoggedIn()) { window.liff?.login(); return; }
  const liffUrl = `https://liff.line.me/${liffId}?view=match_detail&id=${match.id}`;
  const isFinished = !!match.winner;
  const title = isFinished ? "ผลการแข่งขัน" : "โปรแกรมแข่ง";
  const color = isFinished ? "#166534" : "#1e40af"; 
  
  const flexMessage = { 
      type: "flex", 
      altText: truncate(`${title}: ${teamAName} vs ${teamBName}`, 100), 
      contents: { 
          "type": "bubble", 
          "body": { 
              "type": "box", 
              "layout": "vertical", 
              "contents": [ 
                  { "type": "text", "text": title, "color": color, "weight": "bold", "size": "xs", "align": "center" }, 
                  { "type": "box", "layout": "horizontal", "contents": [ 
                      { "type": "text", "text": truncate(teamAName, 12), "align": "center", "size": "xs", "wrap": true, "weight": "bold", "flex": 1 }, 
                      { "type": "text", "text": isFinished ? `${match.scoreA}-${match.scoreB}` : "VS", "weight": "bold", "size": "xl", "align": "center", "color": "#000000", "flex": 0, "margin": "md" }, 
                      { "type": "text", "text": truncate(teamBName, 12), "align": "center", "size": "xs", "wrap": true, "weight": "bold", "flex": 1 } 
                  ], "margin": "md", "alignItems": "center" },
                  { "type": "button", "action": { "type": "uri", "label": "ดูรายละเอียด", "uri": liffUrl }, "style": "secondary", "margin": "lg", "height": "sm" } 
              ], 
              "paddingAll": "xl" 
          } 
      } 
  };
  try { await window.liff.shareTargetPicker([flexMessage]); } catch (error: any) { alert(`แชร์ไม่สำเร็จ: ${error.message}`); }
};

export const shareTournament = async (tournament: Tournament, teamCount: number = 0, maxTeams: number = 0) => {
    const liffId = window.liff?.id;
    if (!window.liff) { alert("LIFF SDK not loaded"); return; }
    if (!window.liff.isLoggedIn()) { window.liff.login(); return; }
    
    const liffUrl = `https://liff.line.me/${liffId}?tournamentId=${tournament.id}`;
    const altText = `เชิญสมัคร: ${truncate(tournament.name, 50)}`;

    const flexMessage = {
      type: "flex",
      altText: altText,
      contents: {
        type: "bubble",
        body: {
          type: "box",
          layout: "vertical",
          contents: [
            { type: "text", text: "เปิดรับสมัครแข่งขัน", weight: "bold", color: "#2563EB", size: "xs" },
            { type: "text", text: truncate(tournament.name, 60), weight: "bold", size: "lg", wrap: true, margin: "sm" },
            { type: "text", text: `สมัครแล้ว: ${teamCount}${maxTeams > 0 ? '/' + maxTeams : ''} ทีม`, size: "xs", color: "#666666", margin: "md" },
            { type: "button", style: "primary", action: { type: "uri", label: "สมัครเลย", uri: liffUrl }, margin: "lg" }
          ],
          paddingAll: "xl"
        }
      }
    };

    try {
        if (window.liff.isApiAvailable('shareTargetPicker')) {
            await window.liff.shareTargetPicker([flexMessage]);
        } else {
            alert("อุปกรณ์ของคุณไม่รองรับฟีเจอร์การแชร์");
        }
    } catch (error: any) { 
        console.error("Share Error", error);
        alert(`แชร์ไม่สำเร็จ: ${error.message}`); 
    }
};

export const shareDonation = async (donation: Donation, tournamentName: string) => {
  if (!window.liff?.isLoggedIn()) { window.liff?.login(); return; }
  
  const amount = donation.amount.toLocaleString();
  const safeDonorName = truncate(donation.donorName, 40);
  const safeTournamentName = truncate(tournamentName, 50);
  
  // Minimalist Flex Message Structure
  const flexMessage = {
    type: "flex",
    altText: `อนุโมทนา: ${safeDonorName}`,
    contents: {
      type: "bubble",
      size: "kilo",
      body: {
        type: "box",
        layout: "vertical",
        contents: [
          { type: "text", text: "ใบอนุโมทนาบัตร", weight: "bold", color: "#B45309", size: "xs", align: "center", letterSpacing: "1px" },
          { type: "text", text: safeDonorName, weight: "bold", size: "xl", margin: "md", align: "center", wrap: true, color: "#1e293b" },
          { type: "text", text: `${amount} บาท`, weight: "bold", size: "xxl", color: "#16a34a", margin: "sm", align: "center" },
          { type: "separator", margin: "lg" },
          { type: "text", text: safeTournamentName, size: "xs", color: "#9ca3af", margin: "md", align: "center", wrap: true }
        ],
        paddingAll: "xl",
        backgroundColor: "#ffffff"
      }
    }
  };
  
  try { 
      await window.liff.shareTargetPicker([flexMessage]); 
  } catch (error: any) { 
      alert(`แชร์ไม่สำเร็จ: ${error.message}`); 
  }
};

export const sharePrizeSummary = async (tournamentName: string, prizes: TournamentPrize[], teams: Team[]) => {
    if (!window.liff?.isLoggedIn()) { window.liff?.login(); return; }

    const prizeRows = prizes.map(p => {
        let winnerName = "-";
        if (p.winnerTeamId) {
            const team = teams.find(t => t.id === p.winnerTeamId);
            if (team) winnerName = team.name;
        }
        
        return {
            "type": "box",
            "layout": "horizontal",
            "contents": [
                { "type": "text", "text": truncate(p.rankLabel, 15), "size": "xs", "color": "#334155", "flex": 2, "weight": "bold" },
                { "type": "text", "text": truncate(winnerName, 20), "size": "xs", "color": "#16a34a", "flex": 3, "align": "end", "weight": "bold" },
                { "type": "text", "text": p.amount ? `${parseInt(p.amount.replace(/,/g, '')).toLocaleString()}` : "", "size": "xxs", "color": "#94a3b8", "flex": 2, "align": "end" }
            ],
            "margin": "sm"
        };
    });

    const flexMessage = {
        type: "flex",
        altText: `สรุปผลการแข่งขัน: ${truncate(tournamentName, 30)}`,
        contents: {
            "type": "bubble",
            "size": "mega",
            "body": {
                "type": "box",
                "layout": "vertical",
                "contents": [
                    { "type": "text", "text": "OFFICIAL RESULTS", "weight": "bold", "color": "#ca8a04", "size": "xxs", "align": "center", "letterSpacing": "1px" },
                    { "type": "text", "text": truncate(tournamentName, 40), "weight": "bold", "size": "lg", "align": "center", "wrap": true, "margin": "sm", "color": "#1e293b" },
                    { "type": "separator", "margin": "lg" },
                    { 
                        "type": "box", 
                        "layout": "vertical", 
                        "margin": "lg", 
                        "contents": prizeRows.length > 0 ? prizeRows : [{ "type": "text", "text": "ยังไม่มีการประกาศผล", "size": "sm", "color": "#94a3b8", "align": "center" }]
                    },
                    { "type": "separator", "margin": "lg" },
                    { "type": "text", "text": "Penalty Pro Arena", "size": "xxs", "color": "#cbd5e1", "align": "center", "margin": "md" }
                ],
                "paddingAll": "xl"
            }
        }
    };

    try { await window.liff.shareTargetPicker([flexMessage]); } catch (error: any) { alert(`แชร์ไม่สำเร็จ: ${error.message}`); }
};