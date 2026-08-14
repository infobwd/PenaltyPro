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
 * นัดนี้จบแล้วจริงหรือยัง — นับเป็นประวัติได้ไหม
 *
 * ⚠️ ต้องดู status ไม่ใช่แค่สกอร์ ตั้งแต่กรรมการซิงก์ผลระหว่างแข่ง นัดที่กำลัง
 * ยิงจุดโทษอยู่จะมีสกอร์แล้ว ถ้านับด้วยจะกลายเป็น "ประวัติ" ทั้งที่ยังไม่รู้ผล
 * และตัวเลขบนหน้าโต๊ะพากย์จะขยับเองระหว่างที่ผู้พากย์กำลังอ่านออกไมค์
 *
 * นัดเก่าก่อนมีช่อง status ไม่มีค่าตรงนี้ จึงถอยไปใช้เกณฑ์เดิม (มีผู้ชนะหรือมีสกอร์)
 */
const isDecided = (m: Match): boolean => {
  if (m.status === 'Live' || m.status === 'Scheduled') return false;
  return !!m.winner || (m.scoreA ?? 0) !== 0 || (m.scoreB ?? 0) !== 0;
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
    if (!isDecided(m)) continue;

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
    if (!isDecided(m)) continue;
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

export type SeasonRecord = {
  tournamentId: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  /** ชื่อรอบที่ไปได้ไกลที่สุดในรายการนั้น — ว่างคือไม่มีนัดที่ระบุรอบไว้ */
  bestRound: string;
};

export type SchoolRecord = {
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  /** ชนะรวดสูงสุดที่เคยทำได้ */
  bestStreak: number;
  /** จำนวนรายการที่เคยลงแข่ง */
  seasons: number;
  /** แยกรายรายการ ใหม่ไปเก่า */
  bySeason: SeasonRecord[];
  /** ผลต่างประตูรวม */
  goalDiff: number;
};

const EMPTY_RECORD: SchoolRecord = {
  played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0,
  bestStreak: 0, seasons: 0, bySeason: [], goalDiff: 0,
};

/**
 * ลำดับความลึกของรอบ ใช้หา "ไปได้ไกลสุดแค่ไหน" ในแต่ละรายการ
 *
 * ป้ายรอบเป็นข้อความอิสระที่เจ้าภาพพิมพ์เอง จึงเทียบด้วยคำที่พบจริงในข้อมูล
 * ทั้งไทยและอังกฤษ ค่าที่จับไม่ได้ให้เป็น 0 (ไม่ใช่รอบลึก) ไม่ใช่ทิ้งไป
 */
const roundDepth = (label?: string): number => {
  const s = (label ?? '').toLowerCase();
  if (s.includes('ชิงชนะเลิศ') && !s.includes('รอง')) return 5;
  if (s.includes('final') && !s.includes('semi') && !s.includes('quarter')) return 5;
  if (s.includes('รองชนะเลิศ') || s.includes('semi') || s.includes('sf')) return 4;
  if (s.includes('ก่อนรองชนะเลิศ') || s.includes('quarter') || s.includes('qf')) return 3;
  if (s.includes('16') || s.includes('r16')) return 2;
  if (s.includes('กลุ่ม') || s.includes('สาย') || s.includes('group')) return 1;
  return 0;
};

/**
 * สถิติสะสมของโรงเรียนหนึ่ง ข้ามทุกรายการที่เคยลงแข่ง
 *
 * ต่างจาก headToHead ตรงที่ไม่จำกัดคู่แข่ง — ตอบคำถามที่ผู้พากย์ถามบ่อยที่สุด
 * ก่อนเริ่มเกม: "โรงเรียนนี้มาแข่งกี่ปีแล้ว ทำผลงานไว้ยังไงบ้าง"
 *
 * ยึดโรงเรียนเหมือน headToHead ไม่ใช่ team_id — ทีมเป็นของแต่ละปี
 */
export const schoolRecord = (
  teamId: string | undefined,
  matches: Match[],
  teams: Team[],
  excludeMatchId?: string,
): SchoolRecord => {
  const us = identityOf(teamId, teams);
  if (!us) return EMPTY_RECORD;

  type Row = {
    t: number; outcome: 'win' | 'loss' | 'draw';
    gf: number; ga: number; tid: string; round?: string;
  };
  const rows: Row[] = [];

  for (const m of matches) {
    if (excludeMatchId && m.id === excludeMatchId) continue;
    if (!isDecided(m)) continue;
    const idA = identityOf(m.teamAId, teams);
    const idB = identityOf(m.teamBId, teams);
    const weWereA = idA === us;
    if (!weWereA && idB !== us) continue;

    const gf = weWereA ? (m.scoreA ?? 0) : (m.scoreB ?? 0);
    const ga = weWereA ? (m.scoreB ?? 0) : (m.scoreA ?? 0);
    let outcome: Row['outcome'];
    if (m.winner === 'A' || m.winner === 'B') {
      outcome = (m.winner === 'A') === weWereA ? 'win' : 'loss';
    } else {
      outcome = gf === ga ? 'draw' : (gf > ga ? 'win' : 'loss');
    }
    rows.push({
      t: timeOf(m), outcome, gf, ga,
      tid: m.tournamentId ?? '', round: m.roundLabel,
    });
  }

  if (rows.length === 0) return EMPTY_RECORD;
  rows.sort((a, b) => b.t - a.t);

  // ชนะรวดสูงสุด — ไล่จากเก่าไปใหม่ ไม่งั้นได้ "รวด" ที่กลับหัว
  let bestStreak = 0;
  let run = 0;
  for (const r of [...rows].reverse()) {
    run = r.outcome === 'win' ? run + 1 : 0;
    if (run > bestStreak) bestStreak = run;
  }

  const seasonMap = new Map<string, SeasonRecord & { _depth: number; _time: number }>();
  for (const r of rows) {
    let s = seasonMap.get(r.tid);
    if (!s) {
      s = {
        tournamentId: r.tid, played: 0, wins: 0, draws: 0, losses: 0,
        goalsFor: 0, goalsAgainst: 0, bestRound: '', _depth: -1, _time: r.t,
      };
      seasonMap.set(r.tid, s);
    }
    s.played++;
    if (r.outcome === 'win') s.wins++;
    else if (r.outcome === 'draw') s.draws++;
    else s.losses++;
    s.goalsFor += r.gf;
    s.goalsAgainst += r.ga;
    const d = roundDepth(r.round);
    if (r.round && d > s._depth) { s._depth = d; s.bestRound = r.round; }
    if (r.t > s._time) s._time = r.t;
  }

  const bySeason = [...seasonMap.values()]
    .sort((a, b) => b._time - a._time)
    .map(({ _depth, _time, ...rest }) => rest);

  const goalsFor = rows.reduce((s, r) => s + r.gf, 0);
  const goalsAgainst = rows.reduce((s, r) => s + r.ga, 0);

  return {
    played: rows.length,
    wins:   rows.filter(r => r.outcome === 'win').length,
    draws:  rows.filter(r => r.outcome === 'draw').length,
    losses: rows.filter(r => r.outcome === 'loss').length,
    goalsFor,
    goalsAgainst,
    goalDiff: goalsFor - goalsAgainst,
    bestStreak,
    seasons: seasonMap.size,
    bySeason,
  };
};
