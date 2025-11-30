
import { LIFF_ID, Match, NewsItem, RegistrationData, KickResult, Team, Player, Tournament } from '../types';

declare global {
  interface Window {
    liff: any;
  }
}

export const initializeLiff = async () => {
  try {
    if (!window.liff) return;
    await window.liff.init({ liffId: LIFF_ID });
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
    const safeSummary = truncate(summary || "สรุปผลการแข่งขัน", 1000);
    const safeAltText = truncate(`ข่าวด่วน: ${teamAName} vs ${teamBName} - ${summary || ''}`, 350);
    const flexMessage = { type: "flex", altText: safeAltText, contents: { "type": "bubble", "size": "mega", "header": { "type": "box", "layout": "vertical", "contents": [ { "type": "text", "text": "OFFICIAL MATCH REPORT", "weight": "bold", "color": "#FFFFFF", "size": "xxs", "align": "center", "letterSpacing": "2px" }, { "type": "text", "text": "สรุปผลการแข่งขัน", "weight": "bold", "size": "xl", "margin": "md", "color": "#FFFFFF", "align": "center" } ], "backgroundColor": "#1e3a8a", "paddingAll": "lg" }, "hero": { "type": "box", "layout": "vertical", "contents": [ { "type": "box", "layout": "horizontal", "contents": [ { "type": "text", "text": truncate(teamAName, 20), "align": "center", "weight": "bold", "size": "sm", "wrap": true, "flex": 1, "gravity": "center" }, { "type": "text", "text": `${match.scoreA} - ${match.scoreB}`, "align": "center", "weight": "bold", "size": "4xl", "color": "#1e3a8a", "flex": 0, "margin": "md" }, { "type": "text", "text": truncate(teamBName, 20), "align": "center", "weight": "bold", "size": "sm", "wrap": true, "flex": 1, "gravity": "center" } ], "alignItems": "center" }, { "type": "text", "text": match.roundLabel ? match.roundLabel.split(':')[0] : "การแข่งขัน", "size": "xs", "color": "#94a3b8", "align": "center", "margin": "sm" } ], "paddingAll": "xl", "backgroundColor": "#f1f5f9" }, "body": { "type": "box", "layout": "vertical", "contents": [ { "type": "text", "text": safeSummary, "wrap": true, "size": "sm", "color": "#334155", "lineSpacing": "5px" } ], "paddingAll": "lg" }, "footer": { "type": "box", "layout": "vertical", "contents": [ { "type": "separator", "color": "#e2e8f0" }, { "type": "box", "layout": "horizontal", "contents": [ { "type": "text", "text": truncate(competitionName, 25), "size": "xxs", "color": "#94a3b8", "flex": 1, "align": "start" }, { "type": "text", "text": "Penalty Pro", "size": "xxs", "color": "#94a3b8", "flex": 1, "align": "end", "weight": "bold" } ], "margin": "md" } ], "paddingAll": "md" } } };
    try { await window.liff.shareTargetPicker([flexMessage]); } catch (error: any) { alert(`ไม่สามารถแชร์ได้: ${error.message}`); }
};

export const sharePlayerCardFlex = async (player: Player, team: Team, stats: any) => {
    if (!window.liff?.isLoggedIn()) { window.liff?.login(); return; }
    const createStatRow = (l1: string, v1: number, l2: string, v2: number) => ({ "type": "box", "layout": "horizontal", "contents": [ { "type": "text", "text": `${v1}`, "weight": "bold", "color": "#fbbf24", "flex": 1, "align": "end", "size": "sm" }, { "type": "text", "text": l1, "size": "xxs", "color": "#94a3b8", "flex": 1, "margin": "sm", "align": "start", "gravity": "center" }, { "type": "text", "text": `${v2}`, "weight": "bold", "color": "#fbbf24", "flex": 1, "align": "end", "size": "sm" }, { "type": "text", "text": l2, "size": "xxs", "color": "#94a3b8", "flex": 1, "margin": "sm", "align": "start", "gravity": "center" } ], "margin": "sm" });
    const flexMessage = { type: "flex", altText: `Player Card: ${player.name}`, contents: { "type": "bubble", "styles": { "body": { "backgroundColor": "#1e293b" }, "footer": { "backgroundColor": "#0f172a" } }, "body": { "type": "box", "layout": "vertical", "contents": [ { "type": "box", "layout": "horizontal", "contents": [ { "type": "box", "layout": "vertical", "contents": [ { "type": "text", "text": `${stats.ovr}`, "size": "3xl", "weight": "bold", "color": "#fbbf24", "lineHeight": "30px" }, { "type": "text", "text": player.position ? player.position.substring(0,3).toUpperCase() : "PLY", "size": "xs", "weight": "bold", "color": "#ffffff" } ], "flex": 1 }, { "type": "image", "url": team.logoUrl || "https://via.placeholder.com/100?text=Logo", "align": "end", "size": "xs", "aspectMode": "fit", "flex": 1 } ] }, { "type": "image", "url": player.photoUrl || "https://img.icons8.com/ios-filled/200/ffffff/user-male-circle.png", "size": "xl", "aspectMode": "cover", "margin": "md" }, { "type": "text", "text": truncate(player.name, 25), "weight": "bold", "size": "xl", "color": "#ffffff", "align": "center", "margin": "md", "wrap": true }, { "type": "text", "text": truncate(team.name, 30), "size": "xs", "color": "#94a3b8", "align": "center", "margin": "xs", "wrap": true }, { "type": "separator", "margin": "md", "color": "#334155" }, { "type": "box", "layout": "vertical", "contents": [ createStatRow("PAC", stats.pac, "DRI", stats.dri), createStatRow("SHO", stats.sho, "DEF", stats.def), createStatRow("PAS", stats.pas, "PHY", stats.phy) ], "margin": "md" } ] }, "footer": { "type": "box", "layout": "vertical", "contents": [ { "type": "text", "text": "Penalty Pro Official Card", "size": "xxs", "color": "#64748b", "align": "center" } ] } } };
    try { await window.liff.shareTargetPicker([flexMessage]); } catch (error: any) { alert(`ไม่สามารถแชร์ได้: ${error.message}`); }
};

export const shareRegistration = async (data: RegistrationData, teamId: string) => {
  if (!window.liff?.isLoggedIn()) { window.liff?.login(); return; }
  const adminLink = `https://liff.line.me/${LIFF_ID}?view=admin&teamId=${teamId}`;
  const statusLink = `https://liff.line.me/${LIFF_ID}`;
  const flexMessage = { type: "flex", altText: `ใบสมัคร: ${truncate(data.schoolName, 20)}`, contents: { "type": "bubble", "header": { "type": "box", "layout": "vertical", "contents": [ { "type": "text", "text": "ใบสมัครเข้าร่วมการแข่งขัน", "weight": "bold", "color": "#FFFFFF", "size": "md" } ], "backgroundColor": "#166534", "paddingAll": "lg" }, "body": { "type": "box", "layout": "vertical", "contents": [ { "type": "text", "text": truncate(data.schoolName, 50), "weight": "bold", "size": "xl", "color": "#1F2937", "wrap": true }, { "type": "text", "text": `ทีม: ${truncate(data.schoolName, 30)} (${data.shortName})`, "size": "sm", "color": "#4B5563", "margin": "md", "wrap": true }, { "type": "separator", "margin": "lg" }, { "type": "box", "layout": "vertical", "margin": "lg", "spacing": "sm", "contents": [ { "type": "box", "layout": "baseline", "contents": [ { "type": "text", "text": "ผู้ติดต่อ", "color": "#9CA3AF", "size": "xs", "flex": 2 }, { "type": "text", "text": data.phone, "color": "#4B5563", "size": "xs", "flex": 4 } ] }, { "type": "box", "layout": "baseline", "contents": [ { "type": "text", "text": "เวลาสมัคร", "color": "#9CA3AF", "size": "xs", "flex": 2 }, { "type": "text", "text": new Date().toLocaleString('th-TH'), "color": "#4B5563", "size": "xs", "flex": 4 } ] } ] } ] }, "footer": { "type": "box", "layout": "vertical", "spacing": "sm", "contents": [ { "type": "button", "style": "primary", "height": "sm", "action": { "type": "uri", "label": "สำหรับแอดมิน: ตรวจสอบ/อนุมัติ", "uri": adminLink }, "color": "#2563EB" }, { "type": "button", "style": "secondary", "height": "sm", "action": { "type": "uri", "label": "ตรวจสอบสถานะ", "uri": statusLink } } ] } } };
  try { await window.liff.shareTargetPicker([flexMessage]); } catch (error: any) { alert(`แชร์ไม่สำเร็จ: ${error.message}`); }
};

export const shareNews = async (news: NewsItem) => {
  if (!window.liff?.isLoggedIn()) { window.liff?.login(); return; }
  const liffUrl = `https://liff.line.me/${LIFF_ID}?view=news&id=${news.id}`;
  const flexMessage = { type: "flex", altText: truncate(`ข่าวสาร: ${news.title}`, 350), contents: { "type": "bubble", "size": "mega", "hero": news.imageUrl ? { "type": "image", "url": news.imageUrl, "size": "full", "aspectRatio": "20:13", "aspectMode": "cover", "action": { "type": "uri", "uri": liffUrl } } : undefined, "body": { "type": "box", "layout": "vertical", "contents": [ { "type": "text", "text": truncate(news.title, 100), "weight": "bold", "size": "xl", "wrap": true }, { "type": "text", "text": new Date(news.timestamp).toLocaleDateString('th-TH'), "size": "xs", "color": "#aaaaaa", "margin": "xs" }, { "type": "text", "text": truncate(news.content, 200), "size": "sm", "color": "#666666", "wrap": true, "margin": "md", "maxLines": 3 } ] }, "footer": { "type": "box", "layout": "vertical", "contents": [ { "type": "button", "action": { "type": "uri", "label": "อ่านเพิ่มเติม", "uri": liffUrl }, "style": "primary", "color": "#1e40af" } ] } } };
  try { await window.liff.shareTargetPicker([flexMessage]); } catch (error: any) { alert(`แชร์ไม่สำเร็จ: ${error.message}`); }
};

export const shareMatch = async (match: Match, teamAName: string, teamBName: string, teamALogo: string, teamBLogo: string) => {
  if (!window.liff?.isLoggedIn()) { window.liff?.login(); return; }
  const liffUrl = `https://liff.line.me/${LIFF_ID}?view=match_detail&id=${match.id}`;
  const isFinished = !!match.winner;
  const title = isFinished ? "ผลการแข่งขัน" : "โปรแกรมการแข่งขัน";
  const headerColor = isFinished ? "#166534" : "#1e40af"; 
  const statusText = isFinished ? "จบการแข่งขัน" : "กำลังจะเริ่ม";
  const dateObj = new Date(match.scheduledTime || match.date);
  const dateStr = dateObj.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
  const timeStr = dateObj.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  const scorersA: string[] = []; const scorersB: string[] = [];
  if (isFinished && match.kicks) { match.kicks.forEach(k => { if (k.result === KickResult.GOAL) { const playerName = String(k.player || '').split('(')[0].replace(/[#0-9]/g, '').trim(); if (k.teamId === 'A' || k.teamId === teamAName) scorersA.push(playerName); else if (k.teamId === 'B' || k.teamId === teamBName) scorersB.push(playerName); } }); }
  const scorersSection = (scorersA.length > 0 || scorersB.length > 0) ? { "type": "box", "layout": "vertical", "margin": "md", "contents": [ { "type": "text", "text": "ผู้ทำประตู (จุดโทษ)", "size": "xs", "color": "#aaaaaa", "weight": "bold", "margin": "md" }, { "type": "box", "layout": "horizontal", "contents": [ { "type": "box", "layout": "vertical", "contents": scorersA.map(name => ({ "type": "text", "text": `• ${truncate(name, 15)}`, "size": "xxs", "color": "#4B5563", "wrap": true })) }, { "type": "box", "layout": "vertical", "contents": scorersB.map(name => ({ "type": "text", "text": `• ${truncate(name, 15)}`, "size": "xxs", "color": "#4B5563", "wrap": true, "align": "end" })) } ] } ] } : null;
  const flexContents: any[] = [ { "type": "box", "layout": "horizontal", "contents": [ { "type": "box", "layout": "vertical", "contents": [ { "type": "image", "url": teamALogo || "https://via.placeholder.com/100?text=A", "size": "md", "aspectMode": "cover", "aspectRatio": "1:1" }, { "type": "text", "text": truncate(teamAName, 15), "align": "center", "size": "xs", "wrap": true, "weight": "bold", "margin": "sm" } ], "width": "35%" }, { "type": "box", "layout": "vertical", "contents": [ { "type": "text", "text": isFinished ? `${match.scoreA} - ${match.scoreB}` : "VS", "weight": "bold", "size": isFinished ? "xl" : "lg", "align": "center", "color": isFinished ? "#000000" : "#aaaaaa" }, { "type": "text", "text": statusText, "size": "xxs", "color": "#aaaaaa", "align": "center", "margin": "xs" } ], "width": "30%", "justifyContent": "center" }, { "type": "box", "layout": "vertical", "contents": [ { "type": "image", "url": teamBLogo || "https://via.placeholder.com/100?text=B", "size": "md", "aspectMode": "cover", "aspectRatio": "1:1" }, { "type": "text", "text": truncate(teamBName, 15), "align": "center", "size": "xs", "wrap": true, "weight": "bold", "margin": "sm" } ], "width": "35%" } ] }, { "type": "separator", "margin": "lg" }, { "type": "box", "layout": "vertical", "contents": [ { "type": "box", "layout": "baseline", "contents": [{ "type": "text", "text": "วันที่", "size": "xs", "color": "#aaaaaa", "flex": 1 }, { "type": "text", "text": dateStr, "size": "xs", "color": "#666666", "flex": 3 }], "margin": "sm" }, { "type": "box", "layout": "baseline", "contents": [{ "type": "text", "text": "เวลา", "size": "xs", "color": "#aaaaaa", "flex": 1 }, { "type": "text", "text": timeStr + " น.", "size": "xs", "color": "#666666", "flex": 3 }], "margin": "sm" }, { "type": "box", "layout": "baseline", "contents": [{ "type": "text", "text": "สนาม", "size": "xs", "color": "#aaaaaa", "flex": 1 }, { "type": "text", "text": match.venue || "ไม่ระบุ", "size": "xs", "color": "#666666", "flex": 3 }], "margin": "sm" } ], "margin": "lg" } ];
  if (scorersSection) { flexContents.push(scorersSection); }
  const flexMessage = { type: "flex", altText: truncate(`${title}: ${teamAName} vs ${teamBName}`, 350), contents: { "type": "bubble", "size": "mega", "header": { "type": "box", "layout": "vertical", "contents": [ { "type": "text", "text": title, "color": "#ffffff", "weight": "bold", "size": "lg" }, { "type": "text", "text": match.roundLabel || "ทั่วไป", "color": "#e0e7ff", "size": "xs" } ], "backgroundColor": headerColor, "paddingAll": "lg", "action": { "type": "uri", "uri": liffUrl } }, "body": { "type": "box", "layout": "vertical", "contents": flexContents, "paddingAll": "lg", "action": { "type": "uri", "uri": liffUrl } }, "footer": { "type": "box", "layout": "vertical", "contents": [ { "type": "button", "action": { "type": "uri", "label": "ดูรายละเอียด", "uri": liffUrl }, "style": "primary", "color": headerColor } ] } } };
  try { await window.liff.shareTargetPicker([flexMessage]); } catch (error: any) { alert(`แชร์ไม่สำเร็จ: ${error.message}`); }
};

export const shareTournament = async (tournament: Tournament, teamCount: number = 0, maxTeams: number = 0) => {
    if (!window.liff) { alert("LIFF SDK not loaded"); return; }
    if (!window.liff.isLoggedIn()) {
        window.liff.login();
        return;
    }
    
    // Construct Deep Link with tournamentId
    const liffUrl = `https://liff.line.me/${LIFF_ID}?tournamentId=${tournament.id}`;
    
    // Simple Alt Text
    const altText = `เชิญสมัคร: ${tournament.name}`;

    // Simple Minimalist Flex Message
    const flexMessage = {
      type: "flex",
      altText: altText,
      contents: {
        type: "bubble",
        body: {
          type: "box",
          layout: "vertical",
          contents: [
            {
              type: "text",
              text: truncate(tournament.name, 60),
              weight: "bold",
              size: "xl",
              wrap: true
            },
            {
              type: "text",
              text: `ประเภท: ${tournament.type}`,
              size: "sm",
              color: "#666666",
              margin: "md"
            },
            {
              type: "text",
              text: `สมัครแล้ว: ${teamCount}${maxTeams > 0 ? ' / ' + maxTeams : ''} ทีม`,
              size: "sm",
              color: "#666666",
              margin: "sm"
            }
          ]
        },
        footer: {
          type: "box",
          layout: "vertical",
          contents: [
            {
              type: "button",
              style: "primary",
              color: "#2563EB",
              action: {
                type: "uri",
                label: "สมัครแข่งขัน",
                uri: liffUrl
              }
            }
          ],
          paddingAll: "lg"
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
