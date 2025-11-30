
import { generateGeminiContent } from './sheetService';
import { KickResult, Kick, Team } from '../types';

// NOTE: We now proxy the request through Google Apps Script (Code.gs)
// to hide the API Key from the client side and use Script Properties.

export const generateCommentary = async (
  player: string,
  team: string,
  result: KickResult
): Promise<string> => {
  try {
    // Keep prompt very short for quick response
    const prompt = `พากย์บอลสั้นๆ 1 ประโยค: ${player} (${team}) ${result === 'GOAL' ? 'ยิงเข้า' : 'พลาด'}`;
    // Explicitly pass the model to avoid default fallback issues on backend
    const text = await generateGeminiContent(prompt, 'gemini-1.5-flash');
    return text || "";
  } catch (error) {
    console.error("Error generating commentary:", error);
    return "";
  }
};

export const generateMatchSummary = async (
  teamA: string,
  teamB: string,
  scoreA: number,
  scoreB: number,
  winner: string | null,
  kicks: Kick[],
  model: string = 'gemini-1.5-flash' // Changed default to 1.5-flash for speed/stability
): Promise<string> => {
  try {
    // 1. Extract Scorers & Heroes (Clean Names)
    const cleanName = (name: any) => {
        if (!name) return '';
        // Ensure it's a string before calling replace
        const strName = String(name);
        return strName.replace(/[0-9#]/g, '').split('(')[0].trim();
    };

    const scorersA = kicks.filter(k => k.teamId === 'A' && k.result === KickResult.GOAL).map(k => cleanName(k.player));
    const scorersB = kicks.filter(k => k.teamId === 'B' && k.result === KickResult.GOAL).map(k => cleanName(k.player));
    const savedKicks = kicks.filter(k => k.result === KickResult.SAVED).map(k => cleanName(k.player));
    
    // 2. Determine Winner Name
    const winnerName = winner === 'A' ? teamA : winner === 'B' ? teamB : winner || 'เสมอ';

    const prompt = `
      บทบาท: นักพากย์ฟุตบอลไทย
      งาน: สรุปผลแข่งสั้นๆ
      คู่: ${teamA} vs ${teamB}
      ผล: ${scoreA}-${scoreB} (${winnerName} ชนะ)
      คนยิงเข้า: ${[...scorersA, ...scorersB].filter(n => n).join(', ') || '-'}
      คนเซฟ: ${savedKicks.filter(n => n).join(', ') || '-'}

      คำสั่ง:
      ขอสรุปข่าว 3 บรรทัดจบ:
      1. พาดหัว
      2. รายละเอียดสั้นๆ (ใส่ชื่อคนยิง/คนเซฟ)
      3. ประโยคปิดท้ายมันส์ๆ
    `;

    // Call Proxy with model
    const text = await generateGeminiContent(prompt, model);
    return text || "ระบบ AI กำลังประมวลผล...";
  } catch (error) {
    console.error("Error generating summary:", error);
    throw error;
  }
};

// Fallback System: Local Template Generator
export const generateLocalSummary = (
  teamA: Team,
  teamB: Team,
  scoreA: number,
  scoreB: number,
  winner: string | null,
  kicks: Kick[]
): string => {
  const isWinnerA = winner === 'A' || winner === teamA.name;
  const winnerTeam = isWinnerA ? teamA : teamB;
  const loserTeam = isWinnerA ? teamB : teamA;
  const winScore = isWinnerA ? scoreA : scoreB;
  const loseScore = isWinnerA ? scoreB : scoreA;

  // Helper to extract clean names
  const cleanName = (name: any) => String(name || '').replace(/[0-9#]/g, '').split('(')[0].trim();

  // Extract Scorers for the winning team
  const winnerKicks = kicks.filter(k => (k.teamId === (isWinnerA ? 'A' : 'B') || k.teamId === winnerTeam.name) && k.result === KickResult.GOAL);
  const winnerScorers = winnerKicks.map(k => cleanName(k.player)).filter(n => n).join(', ');
  
  // Extract Keeper (Savior) if any
  const savedKicks = kicks.filter(k => k.result === KickResult.SAVED && (k.teamId === (isWinnerA ? 'B' : 'A') || k.teamId === loserTeam.name));
  const hasSaves = savedKicks.length > 0;

  const patterns = [
    // Pattern 1: Formal / Manager Quote
    `สรุปผลการแข่งขัน: ${winnerTeam.name} เฉือนชนะ ${loserTeam.name} ด้วยสกอร์ ${winScore}-${loseScore} ในการดวลจุดโทษตัดสิน! \n\nโดย ${winnerTeam.name} ได้ประตูจาก ${winnerScorers || 'ความสามารถเฉพาะตัวของนักกีฬา'} \n\nทางด้านผู้จัดการทีม ${winnerTeam.managerName || 'ของทีม'} กล่าวชื่นชมความมุ่งมั่นของน้องๆ ทุกคน`,
    
    // Pattern 2: Excited / Director Mention
    `สุดมันส์! ${winnerTeam.name} คว้าชัยเหนือ ${loserTeam.name} ${winScore}-${loseScore} 🔥\n\nเกมการแข่งขันเต็มไปด้วยความกดดัน แต่สุดท้ายเป็น ${winnerTeam.name} ที่แม่นกว่า ยิงเข้าโดย ${winnerScorers || 'นักเตะคนเก่ง'} \n\nผอ. ${winnerTeam.directorName || winnerTeam.name} ยิ้มแก้มปริ พร้อมสนับสนุนทีมต่อไป!`,
    
    // Pattern 3: Short / Coach Focus
    `✨ ผลบอลจบ: ${winnerTeam.name} ${winScore} - ${loseScore} ${loserTeam.name} (จุดโทษ)\n\nโค้ช${winnerTeam.coachName || ''} วางแผนมาดี พาทีมคว้าชัยชนะในนัดนี้ ผู้ทำประตูสำคัญได้แก่ ${winnerScorers || 'ทุกคนในทีม'} \n\n#${winnerTeam.shortName} #${loserTeam.shortName} #PenaltyPro`,
    
    // Pattern 4: Action / Hero Focus
    `${winnerTeam.name} แม่นโทษ! เอาชนะ ${loserTeam.name} ไปได้ ${winScore}-${loseScore}\n\n${hasSaves ? 'ผู้รักษาประตูโชว์ซูเปอร์เซฟช่วยทีมไว้ได้' : 'เป็นการดวลที่สูสี'} และปิดท้ายด้วยการยิงของ ${winnerScorers || 'ทีมงานคุณภาพ'} พาทีมเข้ารอบต่อไป!`
  ];

  // Randomly select a pattern
  const randomIndex = Math.floor(Math.random() * patterns.length);
  return patterns[randomIndex];
};