import { Match, Team } from '../types';

/**
 * สถิติการเจอกันของสองทีม ข้ามรายการแข่งขัน
 *
 * จับคู่ด้วย **school_id ไม่ใช่ team_id** เพราะ teams เป็นของแต่ละรายการ
 * โรงเรียนเดิมที่ลงแข่งปีนี้กับปีที่แล้วคือคนละ team_id กัน
 * ถ้าเทียบด้วย team_id จะไม่เจอประวัติเก่าเลยแม้แต่นัดเดียว
 *
 * ข้อมูลมาจาก getData ที่โหลดไว้แล้วทั้งหมด (matchesLog ครอบทุกรายการ)
 * จึงไม่ต้องยิง API เพิ่ม — เปิดหน้าไหนก็คำนวณได้ทันที
 */

export type H2HMatch = {
  match: Match;
  /** ประตูของฝั่งที่เราถือเป็น "ทีมเรา" — พลิกให้แล้วตามที่ทีมไหนเป็น A ในนัดนั้น */
  goalsFor: number;
  goalsAgainst: number;
  outcome: 'win' | 'loss' | 'draw';
  tournamentId?: string;
};

export type H2H = {
  played: number;
  wins: number;      // ของทีมแรกที่ส่งเข้ามา
  losses: number;
  draws: number;
  goalsFor: number;
  goalsAgainst: number;
  /** เรียงใหม่สุดก่อน */
  recent: H2HMatch[];
  /** ผลล่าสุดของทีมแรก ไม่เกิน 5 นัด ใหม่ไปเก่า */
  form: ('win' | 'loss' | 'draw')[];
};

const EMPTY: H2H = {
  played: 0, wins: 0, losses: 0, draws: 0,
  goalsFor: 0, goalsAgainst: 0, recent: [], form: [],
};

/** เวลาที่ใช้เรียงนัด — played_at มีเฉพาะนัดที่บันทึกผลแล้ว */
const timeOf = (m: Match): number => {
  const t = new Date(m.date || m.scheduledTime || 0).getTime();
  return Number.isNaN(t) ? 0 : t;
};

/**
 * ตัวระบุโรงเรียนของทีมหนึ่ง
 *
 * ทีมที่ไม่มี schoolId (ข้อมูลเก่าที่ ETL จับคู่ไม่ได้) ให้ถอยไปใช้ชื่อทีม
 * ดีกว่าไม่นับเลย แต่ต้องเป็นชื่อที่ normalize แล้ว ไม่งั้นเว้นวรรคต่างกัน
 * จะกลายเป็นคนละโรงเรียน
 */
const identityOf = (teamId: string | undefined, teams: Team[]): string | null => {
  if (!teamId) return null;
  const t = teams.find(x => x.id === teamId);
  if (!t) return null;
  if (t.schoolId) return 'S:' + t.schoolId;
  return 'N:' + t.name.replace(/\s+/g, '').toLowerCase();
};

/**
 * ประวัติการเจอกันระหว่าง teamA กับ teamB
 *
 * @param excludeMatchId นัดที่กำลังดูอยู่ ไม่ควรนับตัวเองเป็นสถิติในอดีต
 */
export const headToHead = (
  teamAId: string | undefined,
  teamBId: string | undefined,
  matches: Match[],
  teams: Team[],
  excludeMatchId?: string,
): H2H => {
  const us = identityOf(teamAId, teams);
  const them = identityOf(teamBId, teams);
  if (!us || !them || us === them) return EMPTY;

  const rows: H2HMatch[] = [];

  for (const m of matches) {
    if (excludeMatchId && m.id === excludeMatchId) continue;
    // นับเฉพาะนัดที่มีผลจริง — นัดที่ตั้งตารางไว้เฉย ๆ ไม่ใช่ประวัติ
    if (!m.winner && (m.scoreA ?? 0) === 0 && (m.scoreB ?? 0) === 0) continue;

    const idA = identityOf(m.teamAId, teams);
    const idB = identityOf(m.teamBId, teams);
    if (!idA || !idB) continue;

    let goalsFor: number;
    let goalsAgainst: number;
    let weWereA: boolean;
    if (idA === us && idB === them) { weWereA = true; }
    else if (idA === them && idB === us) { weWereA = false; }
    else continue;

    goalsFor = weWereA ? (m.scoreA ?? 0) : (m.scoreB ?? 0);
    goalsAgainst = weWereA ? (m.scoreB ?? 0) : (m.scoreA ?? 0);

    // winner เก็บเป็น 'A'/'B' ของนัดนั้น ต้องพลิกให้ตรงกับฝั่งเราในนัดนี้
    let outcome: H2HMatch['outcome'];
    if (m.winner === 'A' || m.winner === 'B') {
      outcome = (m.winner === 'A') === weWereA ? 'win' : 'loss';
    } else if (goalsFor === goalsAgainst) {
      outcome = 'draw';
    } else {
      outcome = goalsFor > goalsAgainst ? 'win' : 'loss';
    }

    rows.push({ match: m, goalsFor, goalsAgainst, outcome, tournamentId: m.tournamentId });
  }

  rows.sort((a, b) => timeOf(b.match) - timeOf(a.match));

  return {
    played: rows.length,
    wins:   rows.filter(r => r.outcome === 'win').length,
    losses: rows.filter(r => r.outcome === 'loss').length,
    draws:  rows.filter(r => r.outcome === 'draw').length,
    goalsFor:     rows.reduce((s, r) => s + r.goalsFor, 0),
    goalsAgainst: rows.reduce((s, r) => s + r.goalsAgainst, 0),
    recent: rows,
    form: rows.slice(0, 5).map(r => r.outcome),
  };
};

/**
 * ฟอร์มการแข่งล่าสุดของทีมเดียว (ไม่จำกัดคู่แข่ง) ข้ามรายการ
 *
 * ใช้คู่กับสถิติเจอกัน — "เจอกัน 3 ครั้ง ชนะ 2" อย่างเดียวยังไม่พอ
 * ถ้าอีกทีมกำลังฟอร์มดีมากในรายการนี้ ตัวเลขในอดีตจะหลอกตา
 */
export const recentForm = (
  teamId: string | undefined,
  matches: Match[],
  teams: Team[],
  limit = 5,
  excludeMatchId?: string,
): ('win' | 'loss' | 'draw')[] => {
  const us = identityOf(teamId, teams);
  if (!us) return [];

  const rows: { t: number; outcome: 'win' | 'loss' | 'draw' }[] = [];
  for (const m of matches) {
    if (excludeMatchId && m.id === excludeMatchId) continue;
    if (!m.winner && (m.scoreA ?? 0) === 0 && (m.scoreB ?? 0) === 0) continue;
    const idA = identityOf(m.teamAId, teams);
    const idB = identityOf(m.teamBId, teams);
    const weWereA = idA === us;
    if (!weWereA && idB !== us) continue;

    const gf = weWereA ? (m.scoreA ?? 0) : (m.scoreB ?? 0);
    const ga = weWereA ? (m.scoreB ?? 0) : (m.scoreA ?? 0);
    let outcome: 'win' | 'loss' | 'draw';
    if (m.winner === 'A' || m.winner === 'B') {
      outcome = (m.winner === 'A') === weWereA ? 'win' : 'loss';
    } else {
      outcome = gf === ga ? 'draw' : (gf > ga ? 'win' : 'loss');
    }
    rows.push({ t: timeOf(m), outcome });
  }
  return rows.sort((a, b) => b.t - a.t).slice(0, limit).map(r => r.outcome);
};
