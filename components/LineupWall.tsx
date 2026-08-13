import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft, ChevronRight, Pause, Play, Maximize2, Minimize2, Users, X,
} from 'lucide-react';
import { Team, Player, AppSettings } from '../types';

/**
 * ผังตัวผู้เล่นแบบรายการทีวี — วนทีละทีมเอง หรือเลื่อนดูเองก็ได้
 *
 * ใช้ตอนขึ้นจอโปรเจกเตอร์ที่สนามระหว่างรอเริ่มแข่ง และให้ผู้ปกครองเปิดดูบนมือถือ
 * ข้อมูลมาจาก getData ที่หน้าอื่นโหลดไว้แล้ว — ไม่มีคำขอเพิ่ม เปิดแล้วขึ้นทันที
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

/** วินาทีต่อทีม — พอให้กวาดตาอ่านครบ 12 ชื่อโดยไม่ต้องรีบ */
const DWELL_MS = 12000;
const TICK_MS = 100;

const POSITION_LABEL: Record<string, string> = {
  GK: 'ผู้รักษาประตู',
  DF: 'กองหลัง',
  MF: 'กองกลาง',
  FW: 'กองหน้า',
  Player: 'นักกีฬา',
};

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
  const touchX = useRef<number | null>(null);

  const count = roster.length;
  const safeIndex = count === 0 ? 0 : Math.min(index, count - 1);
  const current = roster[safeIndex];

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

  // ── ตัววนสไลด์ ─────────────────────────────────────────────────────────
  //
  // นับจากเวลาจริง ไม่ใช่บวกทีละ tick
  //
  // เบราว์เซอร์หน่วง setInterval ของแท็บที่ไม่ได้อยู่หน้าจอเหลือประมาณวินาทีละครั้ง
  // ถ้าบวกทีละ 100ms สะสม เวลาที่นับได้จะช้ากว่าความจริงหลายเท่า พอสลับกลับมาดู
  // สไลด์จะค้างอยู่ทีมเดิมนานผิดปกติ วิธีนี้แก้ตัวเองได้เสมอไม่ว่าถูกหน่วงแค่ไหน
  useEffect(() => {
    if (!playing || count <= 1) return;
    const startedAt = Date.now() - elapsed;
    const id = setInterval(() => {
      const spent = Date.now() - startedAt;
      if (spent >= DWELL_MS) {
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
  }, [playing, count, safeIndex]);

  // ── คีย์บอร์ด — จอโปรเจกเตอร์มักต่อกับโน้ตบุ๊กหรือรีโมตพรีเซนต์ ────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'PageDown') manual(1);
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') manual(-1);
      else if (e.key === ' ') { e.preventDefault(); setPlaying(p => !p); }
      else if (e.key === 'Escape' && !document.fullscreenElement) onBack();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [manual, onBack]);

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

  return (
    <div
      // h-screen ไม่ใช่ min-h-screen — เวทีต้องสูงเท่าจอพอดี
      // ให้เฉพาะผังตัวผู้เล่นเลื่อน ส่วนหัวเรื่องกับแถบควบคุมตรึงอยู่กับที่เสมอ
      // ถ้าใช้ min-h-screen ทั้งหน้าจะเลื่อนแล้วแถบควบคุมหลุดออกนอกจอ
      className="h-screen overflow-hidden bg-slate-950 text-white flex flex-col select-none"
      onTouchStart={e => { touchX.current = e.touches[0].clientX; }}
      onTouchEnd={e => {
        // ปัดซ้าย/ขวาเพื่อเปลี่ยนทีม — ท่าที่คนคาดหวังบนมือถือ
        if (touchX.current === null) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        touchX.current = null;
        if (Math.abs(dx) > 60) manual(dx < 0 ? 1 : -1);
      }}
    >
      {/* แถบความคืบหน้า บอกว่าอีกนานแค่ไหนจะเปลี่ยนทีม */}
      <div className="h-1 bg-white/10 shrink-0">
        <div
          className="h-full transition-[width] duration-100 ease-linear"
          style={{
            width: playing && count > 1 ? `${(elapsed / DWELL_MS) * 100}%` : '0%',
            backgroundColor: accent,
          }}
        />
      </div>

      {/* หัวเรื่อง */}
      <div className="px-4 sm:px-8 pt-4 pb-3 flex items-center gap-3 sm:gap-5 shrink-0">
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
          {team.schoolName && team.schoolName !== team.name && (
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
      <div className="flex-1 overflow-y-auto px-3 sm:px-8 pb-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-2.5 sm:gap-4">
          {list.map((p, i) => (
            <div key={p.id ?? i}
              className="rounded-2xl bg-white/[0.06] border border-white/10 overflow-hidden
                         animate-in fade-in duration-500">
              <div className="relative aspect-[3/4] bg-slate-900">
                {p.photoUrl
                  ? <img src={p.photoUrl} alt={p.name} className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center">
                      <span className="text-3xl sm:text-5xl font-black text-slate-700">
                        {initials(p.name)}
                      </span>
                    </div>}

                {/* เบอร์เสื้อทับมุมรูป — ตัวใหญ่สุดในการ์ด อ่านออกจากท้ายห้อง */}
                {p.number && (
                  <div
                    className="absolute top-0 left-0 min-w-[2.5rem] sm:min-w-[3.5rem] px-2 py-1
                               rounded-br-2xl font-black text-xl sm:text-3xl text-center tabular-nums"
                    style={{ backgroundColor: accent, color: '#ffffff' }}
                  >
                    {p.number}
                  </div>
                )}

                {/* ไล่สีให้ชื่อบนพื้นรูปยังอ่านออกไม่ว่ารูปจะสว่างแค่ไหน */}
                <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-slate-950 via-slate-950/80 to-transparent" />

                {/* ชื่ออยู่ในกรอบรูป การ์ดจึงสูงเท่ารูปพอดีทุกใบ
                    ถ้าวางไว้นอกกรอบแล้วดึงขึ้นด้วย margin ติดลบ ชื่อที่ยาวสองบรรทัด
                    จะล้นออกนอกการ์ด และการ์ดแต่ละใบสูงไม่เท่ากันจนตารางเบี้ยว */}
                <div className="absolute inset-x-0 bottom-0 p-2 sm:p-3">
                  <p className="font-black text-sm sm:text-lg leading-snug line-clamp-2 break-words">
                    {p.name || <span className="text-slate-500">ไม่ระบุชื่อ</span>}
                  </p>
                  <p className="text-[11px] sm:text-sm mt-0.5" style={{ color: accent }}>
                    {POSITION_LABEL[p.position] ?? p.position ?? 'นักกีฬา'}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* แถบควบคุมล่าง */}
      <div className="shrink-0 border-t border-white/10 bg-slate-950/95 backdrop-blur px-3 sm:px-8 py-2.5
                      flex items-center gap-2 sm:gap-4 safe-area-bottom">
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

        <button onClick={toggleFull} aria-label="เต็มจอ"
          className="w-11 h-11 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center shrink-0">
          {full ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
        </button>
      </div>
    </div>
  );
};

export default LineupWall;
