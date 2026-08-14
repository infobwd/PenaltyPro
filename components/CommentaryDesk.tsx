import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft, Radio, RefreshCw, Mic, History, Target, ShieldCheck, XCircle,
  Users, NotebookPen, WifiOff, Clock, MapPin, Flame, AlertTriangle, Trophy,
  Search, X, BarChart3, CalendarClock, Undo2, Loader2, Handshake, Building2,
  BadgeDollarSign, Package,
} from 'lucide-react';
import { AppSettings, Kick, Match, MatchEvent, Player, Sponsor, Team, Tournament } from '../types';
import { useLiveBoard } from '../hooks/useLiveBoard';
import { headToHead, recentForm, schoolRecord } from '../services/headToHead';
import { confirmAction } from '../services/uiService';
import { fetchSponsors } from '../services/sheetService';

/**
 * โต๊ะพากย์ — หน้าสำหรับคนถือไมค์ข้างสนาม
 *
 * ทำไมต้องเป็นหน้าแยก ไม่ใช่ปรับหน้าเดิม:
 *   - จอใหญ่ (live_wall) ออกแบบให้คนดูมองจากไกล ตัวใหญ่ ข้อมูลน้อย
 *     ผู้พากย์ต้องการตรงข้าม คือข้อมูลแน่นที่สุดในจอเดียวโดยไม่ต้องเลื่อน
 *   - หน้าบันทึกผลเป็นหน้า "เขียน" ของกรรมการ และตั้งใจให้สั้นที่สุด
 *     ทุกบรรทัดที่เพิ่มคือระยะที่กรรมการต้องเลื่อนก่อนถึงปุ่มที่กดสิบกว่าครั้งต่อนัด
 *
 * ข้อมูลสองชั้น:
 *   สด    — useLiveBoard ดึงเองทุก 8 วินาที (สกอร์ ลูกยิง เหตุการณ์)
 *   นิ่ง  — teams/players/allMatches ที่หน้าอื่นโหลดไว้แล้ว ใช้คำนวณสถิติย้อนหลัง
 *          ไม่ต้องยิงเพิ่มเพราะประวัติเก่าไม่เปลี่ยนระหว่างเกม
 */

type Props = {
  tournamentId?: string;
  tournamentName?: string;
  /** ทีมในรายการนี้ — ใช้หาคู่ที่กำลังแข่งและรายชื่อนักกีฬา */
  teams: Team[];
  players: Player[];
  /** ทุกนัดข้ามรายการ — สถิติการเจอกันนับย้อนไปถึงปีก่อน ๆ */
  allMatches: Match[];
  /**
   * ทีมของ **ทุกรายการ** — จำเป็นสำหรับสถิติการเจอกันเท่านั้น
   *
   * headToHead จับคู่ด้วยโรงเรียน แต่ต้องเดินจาก team_id ของนัดนั้นไปหา school_id
   * ก่อน ถ้าส่งมาเฉพาะทีมของรายการปัจจุบัน ทีมปีก่อน (คนละ team_id) จะหาไม่เจอ
   * แล้วประวัติเก่าถูกข้ามทิ้งทั้งหมดเงียบ ๆ — หน้าจะขึ้นว่า "ยังไม่เคยเจอกัน"
   * ทั้งที่สองโรงเรียนนี้เจอกันมาแล้วทุกปี
   */
  allTeams: Team[];
  /** ใช้แปลง tournamentId เป็นชื่อรายการในตารางสถิติย้อนหลัง */
  tournaments: Tournament[];
  config: AppSettings;
  onBack: () => void;
  /** มีเฉพาะผู้ดูแล/กรรมการที่ผ่านการเข้าสู่ระบบ ฝั่ง server ตรวจสิทธิ์ซ้ำอีกชั้น */
  onCancelKick?: (match: Match, kick: Kick) => Promise<boolean>;
  onCancelGoal?: (match: Match, event: MatchEvent) => Promise<boolean>;
};

const POSITION_LABEL: Record<string, string> = {
  GK: 'ผู้รักษาประตู', DF: 'กองหลัง', MF: 'กองกลาง', FW: 'กองหน้า', Player: 'นักกีฬา',
};

const RESULT_UI: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
  GOAL:   { label: 'เข้า',   cls: 'bg-emerald-500', icon: <Target className="w-3 h-3" /> },
  SAVED:  { label: 'เซฟได้', cls: 'bg-sky-600',     icon: <ShieldCheck className="w-3 h-3" /> },
  MISSED: { label: 'พลาด',   cls: 'bg-rose-600',    icon: <XCircle className="w-3 h-3" /> },
};

const EVENT_UI: Record<string, { label: string; cls: string }> = {
  GOAL:        { label: 'ประตู',      cls: 'bg-emerald-500' },
  OWN_GOAL:    { label: 'ทำเข้าตัวเอง', cls: 'bg-orange-500' },
  YELLOW_CARD: { label: 'ใบเหลือง',   cls: 'bg-amber-400 text-amber-950' },
  RED_CARD:    { label: 'ใบแดง',      cls: 'bg-rose-600' },
  BLUE_CARD:   { label: 'ใบฟ้า',      cls: 'bg-sky-500' },
  SUB_IN:      { label: 'เปลี่ยนตัวเข้า', cls: 'bg-slate-600' },
  SUB_OUT:     { label: 'เปลี่ยนตัวออก', cls: 'bg-slate-600' },
};

/**
 * ตัวระบุลูกยิงที่ "อยู่กับที่" ข้ามการบันทึกซ้ำ
 *
 * ⚠️ ห้ามใช้ kick.id — ฝั่ง server ลบลูกทั้งนัดแล้วเขียนใหม่ทุกครั้งที่กดบันทึก
 * (ดู live.php) และ kick_id เป็น AUTO_INCREMENT ทุกลูกจึงได้เลขใหม่หมดทุกครั้ง
 * ถ้าเอา id มาเทียบว่าอันไหน "เพิ่งเข้ามา" ทั้งกระดานจะกะพริบใหม่ทุกรอบ
 *
 * ที่ไม่เปลี่ยนคือช่องของมันเอง ซึ่งฐานข้อมูลก็บังคับให้ไม่ซ้ำอยู่แล้ว
 * (UNIQUE KEY match_id, round_no, team_side)
 */
const kickSlot = (k: Kick): string => `${k.round}:${k.teamId}`;
const eventSlot = (e: MatchEvent): string => `${e.minute}:${e.type}:${e.teamId}:${e.player}`;

const teamNameOf = (t: Team | string | undefined): string =>
  typeof t === 'string' ? t : (t?.name ?? 'ไม่ระบุ');

/** ทีมจาก id ก่อน แล้วค่อยถอยไปเทียบชื่อ — นัดเก่าบางนัดไม่มี team id ผูกไว้ */
const findTeam = (id: string | undefined, name: string, teams: Team[]): Team | null =>
  (id ? teams.find(t => t.id === id) : undefined) ?? teams.find(t => t.name === name) ?? null;

const sponsorTier = (sponsor: Sponsor): 'Main' | 'Support' =>
  String(sponsor.type || '').split('::')[0] === 'Support' ? 'Support' : 'Main';

const sponsorContribution = (sponsor: Sponsor): string => {
  if (sponsor.contributionType === 'Money') {
    const amount = Number(sponsor.contributionAmount || 0);
    return amount > 0
      ? `สนับสนุนเงิน ${amount.toLocaleString('th-TH', { maximumFractionDigits: 2 })} บาท`
      : 'สนับสนุนเป็นเงิน';
  }
  if (sponsor.contributionType === 'Goods') {
    const value = Number(sponsor.contributionAmount || 0);
    const detail = sponsor.contributionDetail?.trim();
    return value > 0
      ? `${detail || 'สนับสนุนสิ่งของ'} · มูลค่าประมาณ ${value.toLocaleString('th-TH', { maximumFractionDigits: 2 })} บาท`
      : detail ? `สนับสนุนสิ่งของ · ${detail}` : 'สนับสนุนสิ่งของ';
  }
  return sponsorTier(sponsor) === 'Main' ? 'ผู้สนับสนุนหลัก' : 'ผู้ร่วมสนับสนุน';
};

const ageOf = (birthDate?: string): number | null => {
  // มาจาก API เป็น dd/mm/yyyy — Date() อ่านรูปแบบนี้ผิดถ้าโยนเข้าไปตรง ๆ
  if (!birthDate) return null;
  const m = birthDate.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const born = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  if (Number.isNaN(born.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - born.getFullYear();
  const monthDiff = now.getMonth() - born.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < born.getDate())) age--;
  return age >= 0 && age < 100 ? age : null;
};

/** "ชนะ 3 นัดรวด" / "ไม่ชนะ 4 นัดติด" — ประโยคที่ผู้พากย์หยิบไปใช้ได้ทันที */
const streakPhrase = (form: ('win' | 'loss' | 'draw')[]): string | null => {
  if (form.length < 2) return null;
  const first = form[0];
  let n = 1;
  while (n < form.length && form[n] === first) n++;
  if (n < 2) {
    // ไม่ชนะติดต่อกัน นับรวมทั้งแพ้และเสมอ — มีความหมายกว่าการแยกนับ
    let dry = 0;
    while (dry < form.length && form[dry] !== 'win') dry++;
    return dry >= 2 ? `ยังไม่ชนะใครใน ${dry} นัดหลังสุด` : null;
  }
  return first === 'win' ? `ชนะ ${n} นัดรวด`
       : first === 'loss' ? `แพ้ ${n} นัดติด`
       : `เสมอ ${n} นัดติด`;
};

type Point = { key: string; text: string; tone: 'hot' | 'stat' | 'neutral' };

/**
 * ประโยคพร้อมพูด สร้างจากข้อมูลจริงล้วน ไม่มีการเดา
 *
 * ทำไมต้อง generate ให้: ผู้พากย์ในงานโรงเรียนส่วนใหญ่เป็นครูหรือนักเรียนที่
 * ไม่ได้เตรียมบทมาก่อน ตัวเลขดิบอย่าง "ชนะ 3 แพ้ 1" ต้องแปลงเป็นประโยคในหัว
 * ระหว่างที่เกมกำลังดำเนินอยู่ ซึ่งเป็นตอนที่ไม่มีสมาธิเหลือให้ทำแบบนั้น
 */
const buildPoints = (
  m: Match, teamA: Team | null, teamB: Team | null,
  nameA: string, nameB: string,
  allMatches: Match[], allTeams: Team[], players: Player[],
  tournamentId: string | undefined,
): Point[] => {
  const points: Point[] = [];
  const kicks = m.kicks ?? [];

  // ── รอบที่แข่ง ────────────────────────────────────────────────────────
  const round = (m.roundLabel ?? '').toLowerCase();
  if (round.includes('final') || m.roundLabel?.includes('ชิงชนะเลิศ')) {
    points.push({ key: 'final', tone: 'hot', text: 'นัดชิงชนะเลิศ — ผู้ชนะคู่นี้คือแชมป์ของรายการ' });
  }

  // ── สถิติการเจอกัน ────────────────────────────────────────────────────
  const h2h = headToHead(teamA?.id, teamB?.id, allMatches, allTeams, m.id);
  if (h2h.played === 0) {
    points.push({ key: 'h2h', tone: 'neutral',
      text: `${nameA} กับ ${nameB} ยังไม่เคยเจอกันมาก่อน นี่คือนัดแรกของสองโรงเรียนนี้` });
  } else {
    const lead = h2h.wins > h2h.losses ? nameA : h2h.losses > h2h.wins ? nameB : null;
    points.push({ key: 'h2h', tone: 'stat',
      text: `เจอกันมาแล้ว ${h2h.played} นัด — ${nameA} ชนะ ${h2h.wins}, ${nameB} ชนะ ${h2h.losses}`
        + (h2h.draws > 0 ? `, เสมอ ${h2h.draws}` : '')
        + (lead ? ` · ${lead} ได้เปรียบสถิติ` : ' · สูสีกันมาตลอด') });
  }

  // ── ฟอร์มล่าสุด ───────────────────────────────────────────────────────
  for (const [team, name] of [[teamA, nameA], [teamB, nameB]] as const) {
    const phrase = streakPhrase(recentForm(team?.id, allMatches, allTeams, 5, m.id));
    if (phrase) points.push({ key: `form-${name}`, tone: 'stat', text: `${name} ${phrase}` });
  }

  // ── สถิติจุดโทษของนัดนี้ ──────────────────────────────────────────────
  for (const side of ['A', 'B'] as const) {
    const own = kicks.filter(k => k.teamId === side);
    if (own.length === 0) continue;
    const goals = own.filter(k => k.result === 'GOAL').length;
    const name = side === 'A' ? nameA : nameB;
    points.push({ key: `conv-${side}`, tone: 'stat',
      text: `${name} ยิงจุดโทษเข้า ${goals} จาก ${own.length} ลูกในนัดนี้`
        + ` (${Math.round((goals / own.length) * 100)}%)` });
  }

  // ── ผู้รักษาประตูที่กำลังเป็นพระเอก ────────────────────────────────────
  for (const side of ['A', 'B'] as const) {
    // ลูกที่ถูกเซฟของฝ่ายตรงข้าม = ผลงานของผู้รักษาประตูฝั่งนี้
    const saves = kicks.filter(k => k.teamId !== side && k.result === 'SAVED').length;
    if (saves >= 2) {
      const name = side === 'A' ? nameA : nameB;
      const gk = players.find(p =>
        p.teamId === (side === 'A' ? teamA?.id : teamB?.id) && p.position === 'GK');
      points.push({ key: `gk-${side}`, tone: 'hot',
        text: `ผู้รักษาประตูของ ${name}${gk ? ` (${gk.name})` : ''} เซฟไปแล้ว ${saves} ลูกในนัดนี้` });
    }
  }

  // ── ยิงทีละคู่ตัดสิน ──────────────────────────────────────────────────
  const maxRound = kicks.reduce((n, k) => Math.max(n, k.round), 0);
  if (maxRound > 5) {
    points.push({ key: 'sudden', tone: 'hot',
      text: `ครบ 5 คนแล้วยังไม่รู้ผล เข้าสู่ช่วงยิงทีละคู่ตัดสิน (รอบที่ ${maxRound})` });
  }

  // ── ดาวยิงของแต่ละทีมในรายการนี้ ──────────────────────────────────────
  const scoped = allMatches.filter(x =>
    tournamentId ? x.tournamentId === tournamentId : true);
  for (const [team, name] of [[teamA, nameA], [teamB, nameB]] as const) {
    if (!team) continue;
    const tally = new Map<string, number>();
    for (const x of scoped) {
      if (x.id === m.id) continue;
      const side = x.teamAId === team.id ? 'A' : x.teamBId === team.id ? 'B' : null;
      if (!side) continue;
      for (const k of x.kicks ?? []) {
        if (k.teamId === side && k.result === 'GOAL' && k.player) {
          tally.set(k.player, (tally.get(k.player) ?? 0) + 1);
        }
      }
      for (const e of x.events ?? []) {
        if (e.teamId === side && e.type === 'GOAL' && e.player) {
          tally.set(e.player, (tally.get(e.player) ?? 0) + 1);
        }
      }
    }
    const top = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
    if (top && top[1] >= 2) {
      points.push({ key: `scorer-${team.id}`, tone: 'stat',
        text: `ดาวยิงของ ${name} ในรายการนี้คือ ${top[0]} ทำไปแล้ว ${top[1]} ประตู` });
    }
  }

  // ── ขนาดและอายุของทีม ─────────────────────────────────────────────────
  for (const [team, name] of [[teamA, nameA], [teamB, nameB]] as const) {
    if (!team) continue;
    const roster = players.filter(p => p.teamId === team.id);
    if (roster.length === 0) continue;
    const ages = roster.map(p => ageOf(p.birthDate)).filter((a): a is number => a !== null);
    const avg = ages.length > 0
      ? ` อายุเฉลี่ย ${(ages.reduce((s, a) => s + a, 0) / ages.length).toFixed(1)} ปี` : '';
    points.push({ key: `roster-${team.id}`, tone: 'neutral',
      text: `${name} ส่งนักกีฬาลงทะเบียน ${roster.length} คน${avg}` });
  }

  return points;
};

// ─────────────────────────────────────────────────────────────────────────

/**
 * "อัปเดตเมื่อ x วินาทีที่แล้ว"
 *
 * แยกเป็นคอมโพเนนต์ของตัวเองเพราะต้องเดินทุกวินาที ถ้าให้ตัวจับเวลาอยู่ในหน้าหลัก
 * ทั้งหน้าจะ re-render วินาทีละครั้งตลอดเวลาที่เปิดค้างไว้
 */
const Freshness: React.FC<{ at: number | null; stale: boolean }> = ({ at, stale }) => {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick(n => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  if (at === null) return <span className="text-slate-500">กำลังเชื่อมต่อ…</span>;
  const secs = Math.max(0, Math.round((Date.now() - at) / 1000));
  return (
    <span className={stale ? 'text-amber-400' : 'text-slate-400'}>
      อัปเดตเมื่อ {secs < 60 ? `${secs} วินาที` : `${Math.floor(secs / 60)} นาที`}ที่แล้ว
    </span>
  );
};

const Panel: React.FC<{ title: string; icon: React.ReactNode; children: React.ReactNode }> =
  ({ title, icon, children }) => (
    <section className="rounded-2xl border border-white/10 bg-white/[0.04] overflow-hidden">
      <h2 className="px-4 py-2.5 text-xs font-black text-slate-300 flex items-center gap-2
                     border-b border-white/10 bg-white/[0.03]">
        {icon} {title}
      </h2>
      <div className="p-4">{children}</div>
    </section>
  );

// ─────────────────────────────────────────────────────────────────────────

const CommentaryDesk: React.FC<Props> = ({
  tournamentId, tournamentName, teams, players, allMatches, allTeams, tournaments,
  config, onBack, onCancelKick, onCancelGoal,
}) => {
  const tournamentNames = useMemo(
    () => new Map(tournaments.map(t => [t.id, t.name])), [tournaments]);
  const { matches, updatedAt, error, fallback, loading, refresh } = useLiveBoard(tournamentId);

  const [pickedId, setPickedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [mobileSection, setMobileSection] = useState<'match' | 'talk' | 'teams'>('match');
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  const [sponsorLoading, setSponsorLoading] = useState(true);
  const [sponsorError, setSponsorError] = useState(false);

  const loadSponsors = useCallback(async () => {
    setSponsorLoading(true);
    setSponsorError(false);
    try {
      setSponsors(await fetchSponsors());
    } catch (loadError) {
      console.error('Failed to load commentary sponsors', loadError);
      setSponsorError(true);
    } finally {
      setSponsorLoading(false);
    }
  }, []);

  useEffect(() => { void loadSponsors(); }, [loadSponsors, tournamentId]);

  const visibleSponsors = useMemo(() => sponsors
    .filter(sponsor => {
      const type = String(sponsor.type || '');
      return !type.includes('::') || (!!tournamentId && type.endsWith(`::${tournamentId}`));
    })
    .sort((a, b) => {
      const tierOrder = Number(sponsorTier(a) === 'Support') - Number(sponsorTier(b) === 'Support');
      return tierOrder || a.name.localeCompare(b.name, 'th');
    }), [sponsors, tournamentId]);

  /**
   * ทุกนัดของรายการนี้ — ค้นหาได้แม้ยังไม่เริ่มแข่ง
   *
   * กระดานผลสดคืนเฉพาะนัดที่อยู่ในช่วงเวลาแข่ง ซึ่งพอดีกับตอนออกอากาศ
   * แต่ผู้พากย์เตรียมบทล่วงหน้าทีละหลายคู่ จึงต้องเลือกนัดที่ยังไม่ถึงคิวได้ด้วย
   */
  const searchable = useMemo(() => {
    const scoped = tournamentId
      ? allMatches.filter(m => m.tournamentId === tournamentId)
      : allMatches;
    return [...scoped].sort((a, b) =>
      new Date(b.scheduledTime || b.date || 0).getTime()
      - new Date(a.scheduledTime || a.date || 0).getTime());
  }, [allMatches, tournamentId]);

  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q === '') return [];
    return searchable.filter(m =>
      (teamNameOf(m.teamA) + ' ' + teamNameOf(m.teamB) + ' ' + (m.roundLabel ?? '')
        + ' ' + (m.venue ?? '')).toLowerCase().includes(q)).slice(0, 12);
  }, [searchable, search]);

  /**
   * นัดที่กำลังพากย์
   *
   * ยึดที่ผู้ใช้เลือกไว้ก่อนเสมอ ถ้ายังไม่ได้เลือกค่อยหยิบนัดแรกที่กำลังแข่ง
   * ห้ามสลับให้เองเมื่อกระดานเปลี่ยน — ผู้พากย์กำลังพูดถึงคู่นี้อยู่
   *
   * หากระดานก่อนเสมอ แล้วค่อยถอยไปหาในรายการทั้งหมด — นัดที่ค้นเจอตอนยังไม่เริ่ม
   * จะสลับมาใช้ข้อมูลสดให้เองทันทีที่กรรมการเริ่มบันทึกผล โดยไม่ต้องเลือกใหม่
   */
  const match = useMemo(() => {
    const fromBoard = pickedId ? matches.find(m => m.id === pickedId) : undefined;
    if (fromBoard) return fromBoard;
    const fromAll = pickedId ? searchable.find(m => m.id === pickedId) : undefined;
    if (fromAll) return fromAll;
    if (matches.length === 0) return null;
    return matches.find(m => m.status === 'Live') ?? matches[0];
  }, [matches, searchable, pickedId]);

  /** นัดที่เลือกอยู่นอกกระดานผลสด = ยังไม่เริ่ม กำลังใช้เตรียมบท */
  const offBoard = match !== null && !matches.some(m => m.id === match.id);

  const nameA = teamNameOf(match?.teamA);
  const nameB = teamNameOf(match?.teamB);
  const teamA = useMemo(
    () => (match ? findTeam(match.teamAId, nameA, teams) : null), [match, nameA, teams]);
  const teamB = useMemo(
    () => (match ? findTeam(match.teamBId, nameB, teams) : null), [match, nameB, teams]);

  // ── ลูกยิงเรียงตามลำดับที่ยิงจริง ────────────────────────────────────
  //
  // เรียงตามรอบและฝั่ง ไม่ใช่ timestamp — server เขียนลูกทั้งนัดใหม่ทุกครั้ง
  // ที่กดบันทึก kicked_at ของทุกลูกจึงเท่ากันหมด เรียงตามเวลาแล้วลำดับจะมั่ว
  const kicks = useMemo(() => {
    const list = [...(match?.kicks ?? [])];
    list.sort((a, b) => (b.round - a.round) || (a.teamId === 'A' ? 1 : -1));
    return list;
  }, [match]);

  const events = useMemo(
    () => [...(match?.events ?? [])].sort((a, b) => b.minute - a.minute), [match]);

  // ── ไฮไลต์สิ่งที่เพิ่งเข้ามา ──────────────────────────────────────────
  const seenRef = useRef<{ id: string; slots: Set<string> } | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!match) return;
    const slots = new Set([
      ...kicks.map(kickSlot), ...events.map(eventSlot),
    ]);

    // เพิ่งเปิดหน้า หรือเพิ่งสลับนัด — ของที่มีอยู่แล้วไม่ใช่ "ของใหม่"
    if (seenRef.current?.id !== match.id) {
      seenRef.current = { id: match.id, slots };
      setFresh(new Set());
      return;
    }

    const added = [...slots].filter(s => !seenRef.current!.slots.has(s));
    seenRef.current = { id: match.id, slots };
    if (added.length === 0) return;

    setFresh(new Set(added));
    const timer = setTimeout(() => setFresh(new Set()), 8000);
    return () => clearTimeout(timer);
  }, [match, kicks, events]);

  // ── โน้ตของผู้พากย์ ───────────────────────────────────────────────────
  //
  // เก็บในเครื่อง ไม่ส่งขึ้น server โดยตั้งใจ — เป็นคำอ่านชื่อและกันลืมส่วนตัว
  // ไม่ใช่ข้อมูลของรายการแข่งขัน และผู้พากย์มักไม่มีบัญชีในระบบอยู่แล้ว
  const noteKey = match ? `penalty_pro_desk_note_${match.id}` : '';
  const [note, setNote] = useState('');
  useEffect(() => {
    setNote(noteKey ? (localStorage.getItem(noteKey) ?? '') : '');
  }, [noteKey]);
  const saveNote = useCallback((v: string) => {
    setNote(v);
    if (noteKey) localStorage.setItem(noteKey, v);
  }, [noteKey]);

  const points = useMemo(
    () => (match ? buildPoints(match, teamA, teamB, nameA, nameB,
      allMatches, allTeams, players, tournamentId) : []),
    [match, teamA, teamB, nameA, nameB, allMatches, allTeams, players, tournamentId]);

  const rosterA = useMemo(
    () => players.filter(p => p.teamId === teamA?.id), [players, teamA]);
  const rosterB = useMemo(
    () => players.filter(p => p.teamId === teamB?.id), [players, teamB]);

  const stale = updatedAt !== null && Date.now() - updatedAt > 30_000;

  const requestCancelKick = async (kick: Kick) => {
    if (!match || !onCancelKick || cancelling !== null) return;
    const teamName = kick.teamId === 'A' ? nameA : nameB;
    const confirmed = await confirmAction(
      `ผลการยิงรอบ ${kick.round} ของ ${teamName} จะถูกลบ และคะแนนจะคำนวณใหม่ทันที`,
      { title: 'ยกเลิกผลการยิงนี้?', confirmText: 'ยกเลิกผลการยิง', dangerous: true },
    );
    if (!confirmed) return;
    const key = `kick:${kickSlot(kick)}`;
    setCancelling(key);
    try {
      if (await onCancelKick(match, kick)) refresh();
    } finally {
      setCancelling(null);
    }
  };

  const requestCancelGoal = async (event: MatchEvent) => {
    if (!match || !onCancelGoal || cancelling !== null) return;
    const teamName = event.teamId === 'A' ? nameA : nameB;
    const confirmed = await confirmAction(
      `ประตูของ ${teamName}${event.player ? ` (${event.player})` : ''} จะถูกลบ และคะแนนจะลดลง 1 ประตู`,
      { title: 'ยกเลิกประตูนี้?', confirmText: 'ยกเลิกประตู', dangerous: true },
    );
    if (!confirmed) return;
    const key = `goal:${event.id}`;
    setCancelling(key);
    try {
      if (await onCancelGoal(match, event)) refresh();
    } finally {
      setCancelling(null);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-slate-950 text-white pb-[calc(2.5rem+env(safe-area-inset-bottom))] overflow-x-hidden">
      {/* ── แถบบน ───────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 bg-slate-950/95 backdrop-blur border-b border-white/10">
        <div className="max-w-[1600px] mx-auto px-3 py-2.5 flex items-center gap-3">
          <button onClick={onBack} aria-label="กลับ"
            className="p-2 -ml-2 rounded-lg hover:bg-white/10 shrink-0">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="font-black leading-tight flex items-center gap-2">
              <Mic className="w-4 h-4 text-indigo-400 shrink-0" /> โต๊ะพากย์
            </p>
            <p className="text-[11px] truncate">
              <span className="text-slate-400">{tournamentName || config.competitionName}</span>
              <span className="mx-1.5 text-slate-600">·</span>
              <Freshness at={updatedAt} stale={stale} />
            </p>
          </div>
          <button onClick={() => { refresh(); void loadSponsors(); }} aria-label="ดึงข้อมูลใหม่"
            className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-bold
                       flex items-center gap-1.5 shrink-0">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">รีเฟรช</span>
          </button>
        </div>

        {/* ค้นหาคู่แข่งขัน — เตรียมบทล่วงหน้าได้โดยไม่ต้องรอให้นัดนั้นเริ่ม */}
        <div className="max-w-[1600px] mx-auto px-3 pb-2 relative">
          <Search className="w-4 h-4 text-slate-500 absolute left-6 top-1/2 -translate-y-1/2 -mt-1" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="ค้นหาคู่แข่งขัน — ชื่อโรงเรียน รอบ หรือสนาม"
            className="w-full h-10 pl-9 pr-9 rounded-xl bg-white/[0.06] border border-white/10
                       text-sm outline-none focus:border-indigo-500" />
          {search !== '' && (
            <button onClick={() => setSearch('')} aria-label="ล้างคำค้น"
              className="absolute right-6 top-1/2 -translate-y-1/2 -mt-1 p-1 rounded hover:bg-white/10">
              <X className="w-4 h-4 text-slate-400" />
            </button>
          )}

          {search.trim() !== '' && (
            <div className="absolute left-3 right-3 top-full z-40 rounded-xl border border-white/15
                            bg-slate-900 shadow-2xl overflow-hidden max-h-80 overflow-y-auto">
              {results.length === 0 ? (
                <p className="px-4 py-3 text-sm text-slate-400">ไม่พบคู่ที่ค้นหา</p>
              ) : results.map(m => (
                <button key={m.id}
                  onClick={() => { setPickedId(m.id); setSearch(''); }}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-left
                             hover:bg-white/10 border-b border-white/5 last:border-0">
                  <span className="text-sm font-bold flex-1 min-w-0 truncate">
                    {teamNameOf(m.teamA)} พบ {teamNameOf(m.teamB)}
                  </span>
                  {m.roundLabel && (
                    <span className="text-[11px] text-slate-400 shrink-0">{m.roundLabel}</span>
                  )}
                  <span className="text-[11px] text-slate-500 shrink-0 w-16 text-right">
                    {m.status === 'Live' ? 'กำลังแข่ง'
                      : m.scheduledTime
                        ? new Date(m.scheduledTime).toLocaleDateString('th-TH',
                            { day: 'numeric', month: 'short' })
                        : ''}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* เลือกนัด — วันแข่งมีหลายสนามพร้อมกัน */}
        {matches.length > 1 && (
          <div className="max-w-[1600px] mx-auto px-3 pb-2 flex gap-2 overflow-x-auto">
            {matches.map(m => {
              const on = m.id === match?.id;
              return (
                <button key={m.id} onClick={() => setPickedId(m.id)}
                  className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold border transition
                    ${on ? 'bg-indigo-600 border-indigo-500'
                         : 'bg-white/[0.06] border-white/10 hover:border-white/30'}`}>
                  {m.status === 'Live' && (
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-rose-500 mr-1.5 align-middle" />
                  )}
                  {teamNameOf(m.teamA)} พบ {teamNameOf(m.teamB)}
                </button>
              );
            })}
          </div>
        )}

        {/* มือถือแสดงข้อมูลทีละหมวด ไม่บังคับเลื่อนผ่านสามคอลัมน์ยาวหลายจอ */}
        <nav className="lg:hidden max-w-[1600px] mx-auto px-3 pb-2 grid grid-cols-3 gap-1.5"
          aria-label="หมวดข้อมูลโต๊ะพากย์">
          {([
            ['match', 'ผลสด'], ['talk', 'บทพากย์'], ['teams', 'รายชื่อ'],
          ] as const).map(([key, label]) => (
            <button key={key} onClick={() => setMobileSection(key)}
              aria-pressed={mobileSection === key}
              className={`min-h-10 rounded-xl text-xs font-black border transition
                ${mobileSection === key
                  ? 'bg-indigo-600 border-indigo-500 text-white'
                  : 'bg-white/[0.05] border-white/10 text-slate-300'}`}>
              {label}
            </button>
          ))}
        </nav>
      </header>

      {error && (
        <div className="max-w-[1600px] mx-auto px-3 pt-3">
          <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2.5
                        text-sm text-amber-200 flex items-center gap-2">
            <WifiOff className="w-4 h-4 shrink-0" />
            ดึงข้อมูลไม่สำเร็จ กำลังลองใหม่ให้เอง — ตัวเลขที่เห็นอาจไม่ใช่ล่าสุด
          </p>
        </div>
      )}

      {offBoard ? (
        <div className="max-w-[1600px] mx-auto px-3 pt-3">
          <p className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-4 py-2.5
                        text-sm text-indigo-100 flex items-center gap-2">
            <CalendarClock className="w-4 h-4 shrink-0" />
            โหมดเตรียมบท — นัดนี้ยังไม่เริ่มแข่ง สถิติและรายชื่อใช้ได้ครบ
            ส่วนสกอร์จะขึ้นเองเมื่อกรรมการเริ่มบันทึกผล
          </p>
        </div>
      ) : fallback && (
        <div className="max-w-[1600px] mx-auto px-3 pt-3">
          <p className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5
                        text-sm text-slate-300 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
            ตอนนี้ไม่มีนัดที่กำลังแข่ง กำลังแสดงนัดล่าสุดแทน —
            นัดจะขึ้นเองเมื่อกรรมการบันทึกลูกแรก หรือใช้ช่องค้นหาด้านบนเลือกคู่ที่ต้องการ
          </p>
        </div>
      )}

      {match === null ? (
        <div className="max-w-md mx-auto mt-16 px-4 text-center">
          <Radio className="w-10 h-10 text-slate-700 mx-auto mb-3" />
          <p className="font-black">ยังไม่มีนัดให้พากย์</p>
          <p className="text-sm text-slate-400 mt-1.5">
            เมื่อกรรมการบันทึกลูกแรกของนัดไหน นัดนั้นจะขึ้นที่นี่เองภายในไม่กี่วินาที
            หรือใช้ช่องค้นหาด้านบนเลือกคู่ที่ต้องการเพื่อเตรียมบทล่วงหน้า
          </p>
        </div>
      ) : (
        <div className="max-w-[1600px] mx-auto px-3 py-3 sm:py-4 grid gap-4 lg:grid-cols-12">

          {/* ══ ซ้าย — สกอร์และไทม์ไลน์ ══════════════════════════════ */}
          <div className={`${mobileSection === 'match' ? 'block' : 'hidden'} lg:block lg:col-span-4 space-y-4`}>
            <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.08] to-white/[0.02] p-4">
              <div className="flex items-center justify-between gap-2 mb-3">
                <span className={`px-2.5 py-1 rounded-full text-[11px] font-black flex items-center gap-1.5
                  ${match.status === 'Live' ? 'bg-rose-600' : 'bg-slate-700'}`}>
                  {match.status === 'Live' && (
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
                    </span>
                  )}
                  {match.status === 'Live' ? 'กำลังแข่ง'
                    : match.status === 'Scheduled' ? 'ยังไม่เริ่ม' : 'จบแล้ว'}
                </span>
                {match.roundLabel && (
                  <span className="text-xs font-bold text-slate-300 truncate">{match.roundLabel}</span>
                )}
              </div>

              <div className="flex items-center gap-3">
                {[{ name: nameA, logo: match.teamALogo, score: match.scoreA, win: match.winner === 'A' },
                  { name: nameB, logo: match.teamBLogo, score: match.scoreB, win: match.winner === 'B' }]
                  .map((s, i) => (
                    <React.Fragment key={i}>
                      {i === 1 && <span className="text-slate-600 font-black shrink-0">–</span>}
                      <div className="flex-1 min-w-0 text-center">
                        {s.logo
                          ? <img src={s.logo} alt="" className="w-10 h-10 mx-auto object-contain rounded bg-white/10" />
                          : <div className="w-10 h-10 mx-auto rounded bg-white/10" />}
                        <p className={`text-5xl font-black tabular-nums mt-1.5
                          ${s.win ? 'text-emerald-400' : ''}`}>{s.score}</p>
                        <p className="text-xs font-bold mt-1 leading-snug break-words">{s.name}</p>
                      </div>
                    </React.Fragment>
                  ))}
              </div>

              <p className="text-[11px] text-slate-400 mt-3 flex items-center gap-3 flex-wrap justify-center">
                {match.venue && (
                  <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{match.venue}</span>
                )}
                {match.scheduledTime && (
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {new Date(match.scheduledTime).toLocaleTimeString('th-TH',
                      { hour: '2-digit', minute: '2-digit' })} น.
                  </span>
                )}
              </p>
            </div>

            {kicks.length > 0 && (
              <Panel title={`ลูกจุดโทษ (${kicks.length} ลูก)`} icon={<Target className="w-4 h-4" />}>
                <div className="space-y-1.5 max-h-[26rem] overflow-y-auto">
                  {kicks.map(k => {
                    const ui = RESULT_UI[k.result as string] ?? RESULT_UI.MISSED;
                    const isNew = fresh.has(kickSlot(k));
                    return (
                      <div key={kickSlot(k)}
                        className={`flex items-center gap-2 rounded-xl border px-2.5 py-2 transition
                          ${isNew ? 'border-amber-400 bg-amber-400/15 animate-pulse'
                                  : 'border-white/10 bg-white/[0.04]'}`}>
                        <span className="w-6 h-6 rounded-lg bg-white/10 text-[11px] font-black shrink-0
                                         flex items-center justify-center tabular-nums">{k.round}</span>
                        <span className="text-xs font-bold shrink-0 w-16 truncate text-slate-400">
                          {k.teamId === 'A' ? nameA : nameB}
                        </span>
                        <span className="text-sm font-bold flex-1 min-w-0 truncate">
                          {k.player || <span className="text-slate-500">ไม่ระบุชื่อ</span>}
                        </span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-black shrink-0
                                          flex items-center gap-1 text-white ${ui.cls}`}>
                          {ui.icon} {ui.label}
                        </span>
                        {onCancelKick && (
                          <button type="button"
                            onClick={() => void requestCancelKick(k)}
                            disabled={cancelling !== null}
                            aria-label={`ยกเลิกผลการยิงรอบ ${k.round} ของ ${k.teamId === 'A' ? nameA : nameB}`}
                            title="ยกเลิกผลการยิง"
                            className="w-8 h-8 -my-1 rounded-lg border border-rose-400/30 bg-rose-500/10
                                       text-rose-300 hover:bg-rose-500/25 disabled:opacity-40
                                       flex items-center justify-center shrink-0">
                            {cancelling === `kick:${kickSlot(k)}`
                              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              : <Undo2 className="w-3.5 h-3.5" />}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Panel>
            )}

            {events.length > 0 && (
              <Panel title={`เหตุการณ์ในเกม (${events.length})`} icon={<Flame className="w-4 h-4" />}>
                <div className="space-y-1.5 max-h-80 overflow-y-auto">
                  {events.map(e => {
                    const ui = EVENT_UI[e.type] ?? { label: e.type, cls: 'bg-slate-600' };
                    const isNew = fresh.has(eventSlot(e));
                    return (
                      <div key={eventSlot(e)}
                        className={`flex items-center gap-2 rounded-xl border px-2.5 py-2 transition
                          ${isNew ? 'border-amber-400 bg-amber-400/15 animate-pulse'
                                  : 'border-white/10 bg-white/[0.04]'}`}>
                        <span className="text-xs font-black tabular-nums w-8 shrink-0 text-slate-400">
                          {e.minute}′
                        </span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-black shrink-0 text-white ${ui.cls}`}>
                          {ui.label}
                        </span>
                        <span className="text-sm font-bold flex-1 min-w-0 truncate">{e.player}</span>
                        <span className="text-[11px] text-slate-400 shrink-0 truncate max-w-[6rem]">
                          {e.teamId === 'A' ? nameA : nameB}
                        </span>
                        {onCancelGoal && (e.type === 'GOAL' || e.type === 'OWN_GOAL') && (
                          <button type="button"
                            onClick={() => void requestCancelGoal(e)}
                            disabled={cancelling !== null}
                            aria-label={`ยกเลิกประตูของ ${e.teamId === 'A' ? nameA : nameB}`}
                            title="ยกเลิกประตู"
                            className="w-8 h-8 -my-1 rounded-lg border border-rose-400/30 bg-rose-500/10
                                       text-rose-300 hover:bg-rose-500/25 disabled:opacity-40
                                       flex items-center justify-center shrink-0">
                            {cancelling === `goal:${e.id}`
                              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              : <Undo2 className="w-3.5 h-3.5" />}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Panel>
            )}
          </div>

          {/* ══ กลาง — บทพูด ═══════════════════════════════════════ */}
          <div className={`${mobileSection === 'talk' ? 'block' : 'hidden'} lg:block lg:col-span-4 space-y-4`}>
            <Panel title={`ผู้สนับสนุนการแข่งขัน${visibleSponsors.length > 0 ? ` (${visibleSponsors.length})` : ''}`}
              icon={<Handshake className="w-4 h-4" />}>
              {sponsorLoading ? (
                <div className="flex items-center gap-2 py-2 text-sm text-slate-400">
                  <Loader2 className="w-4 h-4 animate-spin" /> กำลังโหลดข้อมูลผู้สนับสนุน…
                </div>
              ) : sponsorError ? (
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm text-amber-200">โหลดข้อมูลผู้สนับสนุนไม่สำเร็จ</p>
                  <button type="button" onClick={() => void loadSponsors()}
                    className="min-h-9 shrink-0 rounded-lg border border-white/10 bg-white/[0.06] px-3 text-xs font-black hover:bg-white/10">
                    ลองใหม่
                  </button>
                </div>
              ) : visibleSponsors.length === 0 ? (
                <p className="text-sm text-slate-400">รายการนี้ยังไม่มีข้อมูลผู้สนับสนุน</p>
              ) : (
                <>
                  <p className="mb-3 text-[11px] leading-relaxed text-slate-400">
                    ข้อมูลพร้อมอ่านขอบคุณระหว่างการพากย์ · เลื่อนด้านข้างเพื่อดูทั้งหมด
                  </p>
                  <div className="-mx-1 flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-1 pb-2
                                  [scrollbar-width:thin] [scrollbar-color:rgb(71_85_105)_transparent]">
                    {visibleSponsors.map(sponsor => {
                      const isMoney = sponsor.contributionType === 'Money';
                      const isGoods = sponsor.contributionType === 'Goods';
                      return (
                        <article key={sponsor.id}
                          className="w-[min(78vw,17rem)] shrink-0 snap-start rounded-xl border border-white/10
                                     bg-white/[0.05] p-3 sm:w-64">
                          <div className="flex items-start gap-3">
                            <div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden
                                            rounded-xl border border-white/10 bg-white text-slate-400">
                              <Building2 className="h-6 w-6" />
                              {sponsor.logoUrl && (
                                <img src={sponsor.logoUrl} alt={`โลโก้ ${sponsor.name}`}
                                  onError={event => { event.currentTarget.style.display = 'none'; }}
                                  className="absolute inset-1 h-10 w-10 bg-white object-contain" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="break-words text-sm font-black leading-snug text-white">{sponsor.name}</p>
                              <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-black
                                ${sponsorTier(sponsor) === 'Main'
                                  ? 'bg-amber-400/15 text-amber-200'
                                  : 'bg-indigo-400/15 text-indigo-200'}`}>
                                {sponsorTier(sponsor) === 'Main' ? 'ผู้สนับสนุนหลัก' : 'ผู้ร่วมสนับสนุน'}
                              </span>
                            </div>
                          </div>
                          <p className={`mt-2.5 flex items-start gap-1.5 rounded-lg px-2.5 py-2 text-xs font-bold leading-relaxed
                            ${isMoney ? 'bg-emerald-400/10 text-emerald-200'
                              : isGoods ? 'bg-amber-400/10 text-amber-100'
                                : 'bg-white/[0.05] text-slate-300'}`}>
                            {isMoney ? <BadgeDollarSign className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                              : isGoods ? <Package className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                : <Handshake className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
                            <span className="break-words">{sponsorContribution(sponsor)}</span>
                          </p>
                        </article>
                      );
                    })}
                  </div>
                </>
              )}
            </Panel>

            <Panel title="ประเด็นพร้อมพูด" icon={<Mic className="w-4 h-4" />}>
              {points.length === 0 ? (
                <p className="text-sm text-slate-400">
                  ยังไม่มีข้อมูลพอจะสรุปประเด็น — จะขึ้นเองเมื่อเริ่มบันทึกผล
                </p>
              ) : (
                <ul className="space-y-2">
                  {points.map(p => (
                    <li key={p.key}
                      className={`rounded-xl border px-3 py-2.5 text-sm leading-relaxed
                        ${p.tone === 'hot' ? 'border-amber-500/40 bg-amber-500/10 text-amber-100'
                          : p.tone === 'stat' ? 'border-indigo-500/30 bg-indigo-500/10 text-indigo-50'
                          : 'border-white/10 bg-white/[0.04] text-slate-200'}`}>
                      {p.text}
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel title="โน้ตของผู้พากย์" icon={<NotebookPen className="w-4 h-4" />}>
              <textarea value={note} onChange={e => saveNote(e.target.value)}
                rows={7} placeholder="คำอ่านชื่อโรงเรียน ชื่อนักกีฬาที่อ่านยาก ข้อความขอบคุณผู้สนับสนุน…"
                className="w-full rounded-xl bg-white/[0.06] border border-white/10 p-3
                           text-base sm:text-sm outline-none focus:border-indigo-500 resize-y" />
              <p className="text-[11px] text-slate-500 mt-2">
                เก็บไว้ในเครื่องนี้เท่านั้น แยกตามนัด ไม่ส่งขึ้นระบบ
              </p>
            </Panel>
          </div>

          {/* ══ ขวา — รายชื่อสองทีม ═══════════════════════════════ */}
          <div className={`${mobileSection === 'teams' ? 'block' : 'hidden'} lg:block lg:col-span-4 space-y-4`}>
            {[{ team: teamA, name: nameA, roster: rosterA },
              { team: teamB, name: nameB, roster: rosterB }].map(({ team, name, roster }, i) => (
              <Panel key={team?.id ?? i} title={name} icon={<Users className="w-4 h-4" />}>
                {roster.length === 0 ? (
                  <p className="text-sm text-slate-400">ทีมนี้ยังไม่ได้ส่งรายชื่อนักกีฬาเข้าระบบ</p>
                ) : (
                  <div className="space-y-1 max-h-72 overflow-y-auto">
                    {[...roster]
                      .sort((a, b) => (Number(a.number) || 999) - (Number(b.number) || 999))
                      .map(p => {
                        const age = ageOf(p.birthDate);
                        return (
                          <div key={p.id} className="flex items-center gap-2.5 px-1 py-1">
                            <span className="w-8 text-center text-sm font-black tabular-nums
                                             text-indigo-400 shrink-0">{p.number || '–'}</span>
                            <span className="text-sm font-bold flex-1 min-w-0 truncate">{p.name}</span>
                            <span className="text-[11px] text-slate-400 shrink-0">
                              {POSITION_LABEL[p.position] ?? p.position}
                              {age !== null && ` · ${age} ปี`}
                            </span>
                          </div>
                        );
                      })}
                  </div>
                )}
              </Panel>
            ))}

            <Panel title="สถิติการเจอกัน" icon={<History className="w-4 h-4" />}>
              <H2HSummary teamA={teamA} teamB={teamB} matches={allMatches}
                teams={allTeams} currentMatchId={match.id} />
            </Panel>

            {/* ประวัติของแต่ละโรงเรียนแยกกัน — ตอบคำถามที่ผู้พากย์ถามบ่อยที่สุด
                ก่อนเริ่มเกม ซึ่งสถิติการเจอกันตอบไม่ได้ถ้าสองทีมนี้ไม่เคยเจอกัน */}
            {[{ team: teamA, name: nameA }, { team: teamB, name: nameB }].map(({ team, name }, i) => (
              <Panel key={`rec-${team?.id ?? i}`} title={`สถิติย้อนหลัง · ${name}`}
                icon={<BarChart3 className="w-4 h-4" />}>
                <SchoolHistory team={team} matches={allMatches} teams={allTeams}
                  tournaments={tournamentNames} currentMatchId={match.id} />
              </Panel>
            ))}

            {matches.length > 1 && (
              <Panel title="คู่อื่นในกระดาน" icon={<Trophy className="w-4 h-4" />}>
                <div className="space-y-1.5">
                  {matches.filter(m => m.id !== match.id).map(m => (
                    <button key={m.id} onClick={() => setPickedId(m.id)}
                      className="w-full flex items-center gap-2 rounded-xl border border-white/10
                                 bg-white/[0.04] px-3 py-2 hover:border-white/30 transition text-left">
                      <span className="text-sm font-bold flex-1 min-w-0 truncate">
                        {teamNameOf(m.teamA)} พบ {teamNameOf(m.teamB)}
                      </span>
                      <span className="text-sm font-black tabular-nums shrink-0">
                        {m.scoreA}–{m.scoreB}
                      </span>
                    </button>
                  ))}
                </div>
              </Panel>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * ประวัติของโรงเรียนหนึ่ง ข้ามทุกรายการที่เคยลงแข่ง
 *
 * นับด้วยโรงเรียนไม่ใช่ทีม (ดู schoolRecord) — ทีมเป็นของแต่ละปี
 * โรงเรียนเดิมที่มาแข่งทุกปีจึงต่อประวัติกันได้
 */
const SchoolHistory: React.FC<{
  team: Team | null; matches: Match[]; teams: Team[];
  tournaments: Map<string, string>; currentMatchId: string;
}> = ({ team, matches, teams, tournaments, currentMatchId }) => {
  const rec = useMemo(
    () => schoolRecord(team?.id, matches, teams, currentMatchId),
    [team?.id, matches, teams, currentMatchId]);

  if (rec.played === 0) {
    return (
      <p className="text-sm text-slate-400">
        ยังไม่มีผลการแข่งขันที่ผ่านมาของโรงเรียนนี้ในระบบ — นี่คือรายการแรก
      </p>
    );
  }

  const winPct = Math.round((rec.wins / rec.played) * 100);

  return (
    <>
      <div className="grid grid-cols-4 gap-2 text-center">
        {[
          { v: rec.played, l: 'ลงแข่ง', c: '' },
          { v: rec.wins,   l: 'ชนะ',    c: 'text-emerald-400' },
          { v: rec.draws,  l: 'เสมอ',   c: 'text-slate-300' },
          { v: rec.losses, l: 'แพ้',    c: 'text-rose-400' },
        ].map(x => (
          <div key={x.l}>
            <p className={`text-2xl font-black tabular-nums ${x.c}`}>{x.v}</p>
            <p className="text-[11px] text-slate-400">{x.l}</p>
          </div>
        ))}
      </div>

      <div className="flex h-2 rounded-full overflow-hidden mt-3 bg-white/10">
        {([['wins', 'bg-emerald-500'], ['draws', 'bg-slate-400'], ['losses', 'bg-rose-500']] as const)
          .map(([k, cls]) => rec[k] > 0 && (
            <div key={k} className={cls} style={{ width: `${(rec[k] / rec.played) * 100}%` }} />
          ))}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px] text-slate-400">
        <p>ชนะ <span className="font-black text-slate-200 tabular-nums">{winPct}%</span> ของนัดที่ลง</p>
        <p>ลงแข่งมาแล้ว <span className="font-black text-slate-200 tabular-nums">{rec.seasons}</span> รายการ</p>
        <p>ประตู <span className="font-black text-slate-200 tabular-nums">{rec.goalsFor}–{rec.goalsAgainst}</span>
          {' '}<span className={rec.goalDiff >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
            ({rec.goalDiff >= 0 ? '+' : ''}{rec.goalDiff})
          </span></p>
        {rec.bestStreak >= 2 && (
          <p>ชนะรวดสูงสุด <span className="font-black text-slate-200 tabular-nums">{rec.bestStreak}</span> นัด</p>
        )}
      </div>

      {rec.bySeason.length > 0 && (
        <div className="mt-3 pt-3 border-t border-white/10 space-y-1.5 max-h-56 overflow-y-auto">
          {rec.bySeason.map(s => (
            <div key={s.tournamentId} className="flex items-center gap-2 text-xs">
              <span className="truncate flex-1 min-w-0 text-slate-300">
                {tournaments.get(s.tournamentId) || 'ไม่ระบุรายการ'}
              </span>
              {s.bestRound && (
                <span className="text-[10px] text-slate-500 shrink-0 truncate max-w-[6.5rem]">
                  {s.bestRound}
                </span>
              )}
              <span className="font-black tabular-nums shrink-0">
                <span className="text-emerald-400">{s.wins}</span>
                <span className="text-slate-600">-</span>
                <span className="text-slate-300">{s.draws}</span>
                <span className="text-slate-600">-</span>
                <span className="text-rose-400">{s.losses}</span>
              </span>
            </div>
          ))}
          <p className="text-[10px] text-slate-500 pt-1">ชนะ-เสมอ-แพ้ ของแต่ละรายการ ใหม่ไปเก่า</p>
        </div>
      )}
    </>
  );
};

/** สรุปการเจอกันแบบย่อ — เวอร์ชันเต็มอยู่ในการ์ด HeadToHead ของหน้าตารางแข่ง */
const H2HSummary: React.FC<{
  teamA: Team | null; teamB: Team | null; matches: Match[];
  teams: Team[]; currentMatchId: string;
}> = ({ teamA, teamB, matches, teams, currentMatchId }) => {
  const h2h = useMemo(
    () => headToHead(teamA?.id, teamB?.id, matches, teams, currentMatchId),
    [teamA?.id, teamB?.id, matches, teams, currentMatchId]);

  if (h2h.played === 0) {
    return <p className="text-sm text-slate-400">ยังไม่เคยเจอกัน — นี่คือนัดแรกของสองโรงเรียนนี้</p>;
  }

  return (
    <>
      <div className="flex items-center gap-3">
        <div className="flex-1 text-center">
          <p className="text-3xl font-black tabular-nums text-emerald-400">{h2h.wins}</p>
          <p className="text-[11px] text-slate-400 truncate">{teamA?.name} ชนะ</p>
        </div>
        <div className="text-center shrink-0">
          <p className="text-2xl font-black tabular-nums">{h2h.draws}</p>
          <p className="text-[11px] text-slate-400">เสมอ</p>
        </div>
        <div className="flex-1 text-center">
          <p className="text-3xl font-black tabular-nums text-rose-400">{h2h.losses}</p>
          <p className="text-[11px] text-slate-400 truncate">{teamB?.name} ชนะ</p>
        </div>
      </div>
      <p className="text-[11px] text-slate-400 mt-3">
        เจอกัน {h2h.played} นัด · ประตูรวม {h2h.goalsFor} – {h2h.goalsAgainst}
      </p>
      <div className="mt-3 pt-3 border-t border-white/10 space-y-1">
        {h2h.recent.slice(0, 5).map(r => (
          <div key={r.match.id} className="flex items-center gap-2 text-xs">
            <span className={`w-5 h-5 rounded text-[10px] font-black flex items-center justify-center shrink-0
              ${r.outcome === 'win' ? 'bg-emerald-500' : r.outcome === 'loss' ? 'bg-rose-500' : 'bg-slate-500'}`}>
              {r.outcome === 'win' ? 'ช' : r.outcome === 'loss' ? 'พ' : 'ส'}
            </span>
            <span className="font-black tabular-nums shrink-0">{r.goalsFor}–{r.goalsAgainst}</span>
            <span className="truncate flex-1 min-w-0 text-slate-400">
              {r.match.roundLabel || 'ไม่ระบุรอบ'}
            </span>
          </div>
        ))}
      </div>
    </>
  );
};

export default CommentaryDesk;
