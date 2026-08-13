import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft, ChevronRight, Pause, Play, Maximize2, Minimize2, Users, X,
  PlayCircle, LayoutGrid, Shirt,
} from 'lucide-react';
import { Team, Player, AppSettings } from '../types';
import { youTubeEmbed, youTubeId } from '../services/youtube';

/**
 * ผังตัวผู้เล่นแบบรายการทีวี — วนทีละทีมเอง หรือเลื่อนดูเองก็ได้
 *
 * ใช้ตอนขึ้นจอโปรเจกเตอร์ที่สนามระหว่างรอเริ่มแข่ง และให้ผู้ปกครองเปิดดูบนมือถือ
 * ข้อมูลมาจาก getData ที่หน้าอื่นโหลดไว้แล้ว — ไม่มีคำขอเพิ่ม เปิดแล้วขึ้นทันที
 *
 * แต่ละทีมมีสองช่วง:
 *   แนะนำทีม  เล่นคลิปเต็มจอเป็นพื้นหลัง ชื่อทีมกับคำโปรยลอยขึ้นมา (เฉพาะทีมที่มีคลิป)
 *   ผังตัว    การ์ดนักกีฬาไล่โผล่ทีละใบ กดที่การ์ดที่มี ▶ เพื่อดูคลิปแนะนำรายคน
 *
 * สิ่งที่ตั้งใจให้เป็นแบบนี้:
 *   - หยุดวนทันทีที่ผู้ใช้แตะอะไรก็ตาม การสไลด์หนีตอนกำลังอ่านคือสิ่งที่น่ารำคาญที่สุด
 *   - ข้ามทีมที่ยังไม่มีรายชื่อ ขึ้นจอใหญ่แล้วเจอทีมว่างดูเหมือนระบบพัง
 *   - เบอร์เสื้ออ่านออกจากท้ายห้อง จึงใหญ่กว่าชื่อ
 */

type Props = {
  teams: Team[];
  players: Player[];
  config: AppSettings;
  tournamentName?: string;
  onBack: () => void;
};

/** วินาทีต่อทีมช่วงผังตัว — พอให้กวาดตาอ่านครบ 12 ชื่อโดยไม่ต้องรีบ */
const ROSTER_MS = 12000;
/** ช่วงแนะนำทีม — ยาวกว่านี้แล้วคนดูเริ่มรอ สั้นกว่านี้อ่านคำโปรยไม่ทัน */
const INTRO_MS = 9000;
const TICK_MS = 100;

const POSITION_LABEL: Record<string, string> = {
  GK: 'ผู้รักษาประตู',
  DF: 'กองหลัง',
  MF: 'กองกลาง',
  FW: 'กองหน้า',
  Player: 'นักกีฬา',
};

/** แถวบนแผนผังสนาม เรียงจากหลังไปหน้าเหมือนที่รายการถ่ายทอดวางไว้ */
const FORMATION_ROWS: { key: string; label: string }[] = [
  { key: 'GK', label: 'ผู้รักษาประตู' },
  { key: 'DF', label: 'กองหลัง' },
  { key: 'MF', label: 'กองกลาง' },
  { key: 'FW', label: 'กองหน้า' },
];

/**
 * สีประจำทีม
 *
 * teams.color จาก API เป็นสตริง JSON `["#สีหลัก","#สีรอง"]` ไม่ใช่ค่าสีตรง ๆ
 * (รูปแบบเดิมจากสมัย Google Sheets ที่ frontend เก็บไว้แบบนี้)
 * ถ้าเอาไปใส่ CSS ทั้งก้อนจะกลายเป็นค่าที่ใช้ไม่ได้แล้วสีหายไปเงียบ ๆ
 */
const teamColor = (raw?: string): string => {
  if (!raw) return '#4f46e5';
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && typeof parsed[0] === 'string' && parsed[0].trim() !== '') {
      return parsed[0];
    }
  } catch { /* ไม่ใช่ JSON — เป็นค่าสีตรง ๆ อยู่แล้ว */ }
  return raw.startsWith('#') ? raw : '#4f46e5';
};

const initials = (name: string): string => {
  const clean = name.replace(/^(ด\.ช\.|ด\.ญ\.|นาย|นางสาว|นาง)\s*/, '').trim();
  return clean.slice(0, 2) || '?';
};

// ─────────────────────────────────────────────────────────────────────────

/**
 * การ์ดนักกีฬาหนึ่งใบ
 *
 * @param delay หน่วงก่อนโผล่ (มิลลิวินาที) — ไล่ทีละใบแบบที่รายการถ่ายทอดทำ
 *              ถ้าโผล่พร้อมกันทั้งกริดจะเหมือนหน้าเว็บธรรมดา ไม่ใช่การเปิดตัว
 */
const PlayerCard: React.FC<{
  player: Player;
  accent: string;
  delay: number;
  compact?: boolean;
  onPlay?: () => void;
}> = ({ player: p, accent, delay, compact = false, onPlay }) => {
  const hasVideo = youTubeId(p.introVideoUrl) !== '';
  const Tag = hasVideo ? 'button' : 'div';

  return (
    <Tag
      {...(hasVideo ? { onClick: onPlay, 'aria-label': `ดูคลิปแนะนำ ${p.name}` } : {})}
      className={`group relative w-full rounded-2xl bg-white/[0.06] border border-white/10
                  overflow-hidden text-left animate-in fade-in slide-in-from-bottom-3
                  fill-mode-backwards duration-500
                  ${hasVideo ? 'cursor-pointer hover:border-white/40 transition-colors' : ''}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className={`relative bg-slate-900 ${compact ? 'aspect-square' : 'aspect-[3/4]'}`}>
        {p.photoUrl
          ? <img src={p.photoUrl} alt={p.name} className="w-full h-full object-cover" />
          : <div className="w-full h-full flex items-center justify-center">
              <span className={`font-black text-slate-700 ${compact ? 'text-2xl' : 'text-3xl sm:text-5xl'}`}>
                {initials(p.name)}
              </span>
            </div>}

        {/* เบอร์เสื้อทับมุมรูป — ตัวใหญ่สุดในการ์ด อ่านออกจากท้ายห้อง */}
        {p.number && (
          <div
            className={`absolute top-0 left-0 px-2 py-1 rounded-br-2xl font-black text-center
                        tabular-nums ${compact
                          ? 'min-w-[2rem] text-base' : 'min-w-[2.5rem] sm:min-w-[3.5rem] text-xl sm:text-3xl'}`}
            style={{ backgroundColor: accent, color: '#ffffff' }}
          >
            {p.number}
          </div>
        )}

        {/* ป้ายคลิป — ต้องเห็นชัดว่าใบไหนกดได้ ไม่งั้นไม่มีใครรู้ว่ามีคลิป */}
        {hasVideo && (
          <span className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-black/60
                           backdrop-blur flex items-center justify-center
                           group-hover:bg-rose-600 transition-colors">
            <PlayCircle className="w-4 h-4" />
          </span>
        )}

        {/* ไล่สีให้ชื่อบนพื้นรูปยังอ่านออกไม่ว่ารูปจะสว่างแค่ไหน */}
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-slate-950 via-slate-950/80 to-transparent" />

        {/* ชื่ออยู่ในกรอบรูป การ์ดจึงสูงเท่ารูปพอดีทุกใบ
            ถ้าวางไว้นอกกรอบแล้วดึงขึ้นด้วย margin ติดลบ ชื่อที่ยาวสองบรรทัด
            จะล้นออกนอกการ์ด และการ์ดแต่ละใบสูงไม่เท่ากันจนตารางเบี้ยว */}
        <div className={`absolute inset-x-0 bottom-0 ${compact ? 'p-1.5' : 'p-2 sm:p-3'}`}>
          <p className={`font-black leading-snug line-clamp-2 break-words
                         ${compact ? 'text-[11px]' : 'text-sm sm:text-lg'}`}>
            {p.name || <span className="text-slate-500">ไม่ระบุชื่อ</span>}
          </p>
          {!compact && (
            <p className="text-[11px] sm:text-sm mt-0.5" style={{ color: accent }}>
              {POSITION_LABEL[p.position] ?? p.position ?? 'นักกีฬา'}
            </p>
          )}
        </div>
      </div>
    </Tag>
  );
};

// ─────────────────────────────────────────────────────────────────────────

const LineupWall: React.FC<Props> = ({ teams, players, config, tournamentName, onBack }) => {
  // จับผู้เล่นเข้าทีมรอบเดียว ไม่ใช่ filter ซ้ำทุกครั้งที่เปลี่ยนสไลด์
  const roster = useMemo(() => {
    const byTeam = new Map<string, Player[]>();
    for (const p of players) {
      if (!byTeam.has(p.teamId)) byTeam.set(p.teamId, []);
      byTeam.get(p.teamId)!.push(p);
    }
    return teams
      .filter(t => t.status !== 'Rejected' && t.status !== 'Withdrawn')
      .map(t => ({ team: t, list: byTeam.get(t.id) ?? [] }))
      // ทีมที่ยังไม่ส่งรายชื่อไม่ต้องขึ้นจอ — ช่องว่างเปล่าดูเหมือนระบบพัง
      .filter(x => x.list.length > 0)
      .sort((a, b) =>
        (a.team.group ?? '').localeCompare(b.team.group ?? '', 'th')
        || a.team.name.localeCompare(b.team.name, 'th'));
  }, [teams, players]);

  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const [full, setFull] = useState(false);
  const [formation, setFormation] = useState(false);
  /** คลิปรายคนที่เปิดอยู่ — null คือไม่ได้เปิด */
  const [watching, setWatching] = useState<Player | null>(null);
  const touchX = useRef<number | null>(null);

  const count = roster.length;
  const safeIndex = count === 0 ? 0 : Math.min(index, count - 1);
  const current = roster[safeIndex];

  /**
   * ความยาวของสไลด์นี้ และตอนนี้อยู่ช่วงไหน
   *
   * คำนวณจาก elapsed ตรง ๆ ไม่เก็บเป็น state แยก — ถ้าเก็บแยกจะมีสองแหล่งความจริง
   * ที่ต้องคอยให้ตรงกัน แล้วพอผู้ใช้กดข้ามสไลด์กลางช่วงแนะนำ ช่วงจะค้างผิดที่
   */
  const introUrl = current?.team.introVideoUrl;
  const introMs = youTubeId(introUrl) !== '' ? INTRO_MS : 0;
  const slideMs = introMs + ROSTER_MS;
  const inIntro = elapsed < introMs;

  const go = useCallback((delta: number) => {
    if (count === 0) return;
    setIndex(prev => (prev + delta + count) % count);
    setElapsed(0);
  }, [count]);

  /** ผู้ใช้ลงมือเอง = หยุดวนทันที ไม่ต้องให้ไปหาปุ่ม pause */
  const manual = useCallback((delta: number) => {
    setPlaying(false);
    go(delta);
  }, [go]);

  /** ข้ามช่วงแนะนำทีมไปดูรายชื่อเลย — ไม่ใช่การหยุดวน จึงไม่แตะ playing */
  const skipIntro = useCallback(() => setElapsed(introMs), [introMs]);

  // ── ตัววนสไลด์ ─────────────────────────────────────────────────────────
  //
  // นับจากเวลาจริง ไม่ใช่บวกทีละ tick
  //
  // เบราว์เซอร์หน่วง setInterval ของแท็บที่ไม่ได้อยู่หน้าจอเหลือประมาณวินาทีละครั้ง
  // ถ้าบวกทีละ 100ms สะสม เวลาที่นับได้จะช้ากว่าความจริงหลายเท่า พอสลับกลับมาดู
  // สไลด์จะค้างอยู่ทีมเดิมนานผิดปกติ วิธีนี้แก้ตัวเองได้เสมอไม่ว่าถูกหน่วงแค่ไหน
  useEffect(() => {
    // เปิดคลิปรายคนอยู่ = หยุดนับ ไม่งั้นสไลด์เลื่อนหนีระหว่างที่กำลังดู
    if (!playing || count <= 1 || watching !== null) return;
    const startedAt = Date.now() - elapsed;
    const id = setInterval(() => {
      const spent = Date.now() - startedAt;
      if (spent >= slideMs) {
        setIndex(i => (i + 1) % count);
        setElapsed(0);
      } else {
        setElapsed(spent);
      }
    }, TICK_MS);
    return () => clearInterval(id);
    // ผูกกับ index เพื่อเริ่มจับเวลาใหม่ทุกครั้งที่เปลี่ยนทีม
    // ตั้งใจไม่ผูก elapsed ไม่งั้นจะสร้าง interval ใหม่ทุก 100ms
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, count, safeIndex, slideMs, watching]);

  // ── คีย์บอร์ด — จอโปรเจกเตอร์มักต่อกับโน้ตบุ๊กหรือรีโมตพรีเซนต์ ────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // ปิดคลิปก่อนเป็นอันดับแรก ไม่งั้น Escape จะพากลับหน้าหลักทั้งที่ตั้งใจแค่ปิดคลิป
      if (watching !== null) {
        if (e.key === 'Escape') { e.preventDefault(); setWatching(null); }
        return;
      }
      if (e.key === 'ArrowRight' || e.key === 'PageDown') manual(1);
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') manual(-1);
      else if (e.key === ' ') { e.preventDefault(); setPlaying(p => !p); }
      else if (e.key === 'Escape' && !document.fullscreenElement) onBack();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [manual, onBack, watching]);

  useEffect(() => {
    const onFs = () => setFull(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  const toggleFull = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      // บางเบราว์เซอร์บนมือถือไม่ให้ — ไม่ใช่เรื่องที่ต้องแจ้ง ปุ่มก็แค่ไม่ทำงาน
    }
  };

  const openVideo = useCallback((p: Player) => {
    setPlaying(false);
    setWatching(p);
  }, []);

  if (count === 0) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6 text-center">
        <Users className="w-12 h-12 text-slate-700 mb-4" />
        <p className="font-black text-lg">ยังไม่มีทีมที่ส่งรายชื่อนักกีฬา</p>
        <p className="text-sm text-slate-400 mt-1.5">
          หน้านี้จะแสดงผลเมื่อมีทีมกรอกรายชื่อเข้ามาแล้วอย่างน้อยหนึ่งทีม
        </p>
        <button onClick={onBack}
          className="mt-6 px-5 py-2.5 rounded-xl bg-white/10 border border-white/20 font-bold">
          กลับหน้าหลัก
        </button>
      </div>
    );
  }

  const { team, list } = current;
  const accent = teamColor(team.color);

  // จัดคนเข้าแถวตามตำแหน่ง — คนที่ไม่ระบุตำแหน่งไปรวมแถวล่างสุด ไม่ใช่หายไป
  const byPosition = FORMATION_ROWS.map(row => ({
    ...row,
    men: list.filter(p => p.position === row.key),
  })).filter(r => r.men.length > 0);
  const unplaced = list.filter(p => !FORMATION_ROWS.some(r => r.key === p.position));

  return (
    <div
      // h-screen ไม่ใช่ min-h-screen — เวทีต้องสูงเท่าจอพอดี
      // ให้เฉพาะผังตัวผู้เล่นเลื่อน ส่วนหัวเรื่องกับแถบควบคุมตรึงอยู่กับที่เสมอ
      // ถ้าใช้ min-h-screen ทั้งหน้าจะเลื่อนแล้วแถบควบคุมหลุดออกนอกจอ
      className="h-screen overflow-hidden bg-slate-950 text-white flex flex-col select-none relative"
      onTouchStart={e => { touchX.current = e.touches[0].clientX; }}
      onTouchEnd={e => {
        // ปัดซ้าย/ขวาเพื่อเปลี่ยนทีม — ท่าที่คนคาดหวังบนมือถือ
        if (touchX.current === null) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        touchX.current = null;
        if (Math.abs(dx) > 60) manual(dx < 0 ? 1 : -1);
      }}
    >
      {/* แสงสีประจำทีมอาบพื้นหลัง — ทำให้แต่ละทีมรู้สึกต่างกันแม้ยังไม่ทันอ่านชื่อ */}
      <div className="pointer-events-none absolute inset-0 opacity-25 transition-colors duration-700"
        style={{ background: `radial-gradient(120% 80% at 50% 0%, ${accent} 0%, transparent 60%)` }} />

      {/* แถบความคืบหน้า บอกว่าอีกนานแค่ไหนจะเปลี่ยนทีม */}
      <div className="h-1 bg-white/10 shrink-0 relative z-10">
        <div
          className="h-full transition-[width] duration-100 ease-linear"
          style={{
            width: playing && count > 1 ? `${(elapsed / slideMs) * 100}%` : '0%',
            backgroundColor: accent,
          }}
        />
      </div>

      {inIntro ? (
        /* ══ ช่วงแนะนำทีม ══════════════════════════════════════════════ */
        <div key={`intro-${team.id}`} className="flex-1 relative overflow-hidden">
          {/* คลิปเป็นพื้นหลัง ไม่ใช่เนื้อหาหลัก จึงไม่มีแถบควบคุมและปิดเสียงเสมอ
              (autoplay ที่ไม่ mute ถูกเบราว์เซอร์บล็อก — ดู youTubeEmbed) */}
          <iframe
            src={youTubeEmbed(introUrl, {
              autoplay: true, loop: true, controls: false, end: Math.ceil(INTRO_MS / 1000),
            })}
            title={`คลิปแนะนำ ${team.name}`}
            tabIndex={-1}
            className="absolute inset-0 w-full h-full pointer-events-none
                       scale-150 object-cover"
            allow="autoplay; encrypted-media; picture-in-picture"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/70 to-slate-950/40" />

          <div className="relative h-full flex flex-col items-center justify-center text-center px-6">
            <div
              className="w-24 h-24 sm:w-36 sm:h-36 rounded-3xl flex items-center justify-center
                         overflow-hidden border-4 bg-slate-950/60 backdrop-blur
                         animate-in zoom-in duration-700"
              style={{ borderColor: accent }}
            >
              {team.logoUrl
                ? <img src={team.logoUrl} alt="" className="w-full h-full object-contain" />
                : <span className="font-black text-4xl sm:text-6xl" style={{ color: accent }}>
                    {team.shortName || initials(team.name)}
                  </span>}
            </div>

            <p className="mt-5 text-xs sm:text-base font-bold tracking-[0.3em] uppercase
                          animate-in fade-in slide-in-from-bottom-2 duration-700 delay-200 fill-mode-backwards"
              style={{ color: accent }}>
              {[tournamentName || config.competitionName, team.group && `สาย ${team.group}`]
                .filter(Boolean).join(' · ')}
            </p>

            <h1 className="mt-2 font-black text-4xl sm:text-7xl leading-tight
                           animate-in fade-in slide-in-from-bottom-4 duration-700 delay-300 fill-mode-backwards">
              {team.name}
            </h1>

            {team.hypeText && (
              <p className="mt-3 text-base sm:text-2xl text-slate-200 font-bold
                            animate-in fade-in slide-in-from-bottom-4 duration-700 delay-500 fill-mode-backwards">
                {team.hypeText}
              </p>
            )}

            <p className="mt-6 text-sm text-slate-400
                          animate-in fade-in duration-700 delay-700 fill-mode-backwards">
              {list.length} นักกีฬา
            </p>

            <button onClick={skipIntro}
              className="mt-8 px-5 py-2.5 rounded-xl bg-white/10 border border-white/20
                         backdrop-blur font-bold text-sm hover:bg-white/20 transition">
              ดูรายชื่อเลย
            </button>
          </div>
        </div>
      ) : (
        /* ══ ช่วงผังตัวนักกีฬา ═════════════════════════════════════════ */
        <>
          {/* หัวเรื่อง */}
          <div className="px-4 sm:px-8 pt-4 pb-3 flex items-center gap-3 sm:gap-5 shrink-0 relative z-10">
            <button onClick={onBack} aria-label="กลับ"
              className="p-2 -ml-2 rounded-xl hover:bg-white/10 shrink-0">
              <X className="w-6 h-6" />
            </button>

            <div
              className="w-14 h-14 sm:w-20 sm:h-20 rounded-2xl shrink-0 flex items-center justify-center
                         overflow-hidden border-2 bg-white/5"
              style={{ borderColor: accent }}
            >
              {team.logoUrl
                ? <img src={team.logoUrl} alt="" className="w-full h-full object-contain" />
                : <span className="font-black text-xl sm:text-3xl" style={{ color: accent }}>
                    {team.shortName || initials(team.name)}
                  </span>}
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-[11px] sm:text-sm font-bold tracking-widest uppercase"
                style={{ color: accent }}>
                {[tournamentName || config.competitionName, team.group && `สาย ${team.group}`]
                  .filter(Boolean).join(' · ')}
              </p>
              <h1 className="font-black text-2xl sm:text-5xl leading-tight truncate">{team.name}</h1>
              {team.hypeText
                ? <p className="text-slate-300 text-xs sm:text-lg truncate font-bold">{team.hypeText}</p>
                : team.schoolName && team.schoolName !== team.name && (
                    <p className="text-slate-400 text-xs sm:text-lg truncate">{team.schoolName}</p>
                  )}
            </div>

            <div className="text-right shrink-0 hidden sm:block">
              <p className="text-4xl font-black tabular-nums">{list.length}</p>
              <p className="text-xs text-slate-400">นักกีฬา</p>
            </div>
          </div>

          {/* ผังตัวผู้เล่น
              มือถือ 2 คอลัมน์ / แท็บเล็ต 3-4 / จอใหญ่ 5-6 — จอโปรเจกเตอร์กว้างมาก
              ถ้าจำกัดไว้ 3 คอลัมน์จะเหลือขอบดำสองข้างเปล่า ๆ */}
          <div className="flex-1 overflow-y-auto px-3 sm:px-8 pb-4 relative z-10">
            {formation ? (
              /* แผนผังสนาม — แบบที่รายการถ่ายทอดขึ้นก่อนเขี่ยลูก
                 พื้นสีเขียวกับเส้นสนามทำให้รู้ทันทีว่ากำลังดูตำแหน่งในสนาม
                 ไม่ใช่แค่รายชื่อที่บังเอิญจัดกลุ่ม */
              <div className="rounded-3xl bg-emerald-950/40 border border-emerald-500/20 p-3 sm:p-6
                              space-y-4 sm:space-y-6 relative overflow-hidden">
                <div className="pointer-events-none absolute inset-x-8 top-1/2 h-px bg-white/10" />
                <div className="pointer-events-none absolute left-1/2 top-1/2 w-24 h-24 sm:w-32 sm:h-32
                                -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/10" />
                {[...byPosition, ...(unplaced.length > 0
                  ? [{ key: 'other', label: 'ยังไม่ระบุตำแหน่ง', men: unplaced }] : [])].map((row, ri) => (
                  <div key={row.key} className="relative">
                    <p className="text-[11px] sm:text-xs font-black tracking-widest uppercase mb-2 text-center"
                      style={{ color: accent }}>
                      {row.label}
                    </p>
                    <div className="flex flex-wrap justify-center gap-2 sm:gap-4">
                      {row.men.map((p, i) => (
                        <div key={p.id ?? `${ri}-${i}`} className="w-24 sm:w-32">
                          <PlayerCard player={p} accent={accent} compact
                            delay={ri * 150 + i * 60} onPlay={() => openVideo(p)} />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-2.5 sm:gap-4">
                {list.map((p, i) => (
                  <PlayerCard key={p.id ?? i} player={p} accent={accent}
                    delay={i * 60} onPlay={() => openVideo(p)} />
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* แถบควบคุมล่าง */}
      <div className="shrink-0 border-t border-white/10 bg-slate-950/95 backdrop-blur px-3 sm:px-8 py-2.5
                      flex items-center gap-2 sm:gap-4 safe-area-bottom relative z-10">
        <button onClick={() => manual(-1)} aria-label="ทีมก่อนหน้า"
          className="w-11 h-11 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center shrink-0">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <button onClick={() => setPlaying(p => !p)}
          aria-label={playing ? 'หยุดวนอัตโนมัติ' : 'เล่นวนอัตโนมัติ'}
          className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 font-bold"
          style={{ backgroundColor: playing ? accent : 'rgba(255,255,255,0.1)' }}>
          {playing ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
        </button>
        <button onClick={() => manual(1)} aria-label="ทีมถัดไป"
          className="w-11 h-11 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center shrink-0">
          <ChevronRight className="w-5 h-5" />
        </button>

        {/* จุดบอกตำแหน่ง — เกิน 20 ทีมจุดจะเล็กจนไร้ประโยชน์ เปลี่ยนเป็นตัวเลขแทน */}
        {count <= 20 ? (
          <div className="flex-1 flex items-center justify-center gap-1.5 flex-wrap min-w-0">
            {roster.map((r, i) => (
              <button key={r.team.id} onClick={() => { setPlaying(false); setIndex(i); setElapsed(0); }}
                title={r.team.name} aria-label={r.team.name}
                className="h-2.5 rounded-full transition-all"
                style={{
                  width: i === safeIndex ? 28 : 10,
                  backgroundColor: i === safeIndex ? accent : 'rgba(255,255,255,0.25)',
                }} />
            ))}
          </div>
        ) : (
          <div className="flex-1 text-center text-sm font-bold tabular-nums text-slate-300">
            {safeIndex + 1} / {count}
          </div>
        )}

        <button onClick={() => setFormation(f => !f)}
          aria-label={formation ? 'ดูแบบตาราง' : 'ดูแบบแผนผังสนาม'}
          title={formation ? 'ดูแบบตาราง' : 'ดูแบบแผนผังสนาม'}
          className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transition
            ${formation ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-white/10 hover:bg-white/20'}`}>
          {formation ? <LayoutGrid className="w-5 h-5" /> : <Shirt className="w-5 h-5" />}
        </button>
        <button onClick={toggleFull} aria-label="เต็มจอ"
          className="w-11 h-11 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center shrink-0">
          {full ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
        </button>
      </div>

      {/* ══ คลิปแนะนำรายคน ═══════════════════════════════════════════ */}
      {watching && (
        <div
          className="fixed inset-0 z-[200] bg-black/90 backdrop-blur flex items-center justify-center p-4
                     animate-in fade-in duration-200"
          onClick={() => setWatching(null)}
        >
          <div className="w-full max-w-4xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-3">
              {watching.number && (
                <span className="w-11 h-11 rounded-xl font-black text-xl flex items-center
                                 justify-center tabular-nums shrink-0"
                  style={{ backgroundColor: accent }}>
                  {watching.number}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="font-black text-lg sm:text-2xl truncate">{watching.name}</p>
                <p className="text-sm" style={{ color: accent }}>
                  {POSITION_LABEL[watching.position] ?? watching.position} · {team.name}
                </p>
              </div>
              <button onClick={() => setWatching(null)} aria-label="ปิดคลิป"
                className="w-11 h-11 rounded-xl bg-white/10 hover:bg-white/20
                           flex items-center justify-center shrink-0">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* 16:9 เสมอ — ปล่อยให้ iframe กำหนดเองแล้วจะเตี้ยผิดสัดส่วน
                คลิปแนวตั้ง (Shorts) จะมีขอบดำสองข้าง ซึ่งดีกว่าภาพถูกครอบ */}
            <div className="relative w-full rounded-2xl overflow-hidden bg-black border border-white/10"
              style={{ aspectRatio: '16 / 9' }}>
              <iframe
                key={watching.id}
                src={youTubeEmbed(watching.introVideoUrl, { autoplay: true })}
                title={`คลิปแนะนำ ${watching.name}`}
                className="absolute inset-0 w-full h-full"
                allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LineupWall;
