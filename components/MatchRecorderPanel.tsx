import React, { useMemo, useState } from 'react';
import {
  ClipboardList, Pencil, Trash2, Target, ShieldCheck, XCircle, ChevronDown, ChevronUp,
} from 'lucide-react';
import { Kick, KickResult, Team, Player } from '../types';

/**
 * แผงของคนบันทึกผล — รายการลูกยิงที่แก้ได้ + สถิติสด
 *
 * ทำไมต้องแก้ทีละลูกได้: กรรมการกดผิดคนหรือผิดผลเกิดขึ้นจริงและบ่อย
 * เดิมมีแต่ปุ่ม "ย้อนลูกล่าสุด" ถ้ารู้ตัวตอนยิงไปแล้ว 6 ลูกก็ต้องย้อนทิ้ง 6 ลูก
 * แล้วกดใหม่ทั้งหมด ซึ่งระหว่างนั้นคะแนนบนจอถ่ายทอดก็เพี้ยนไปด้วย
 *
 * ฝั่ง server ลบลูกทั้งนัดแล้วเขียนใหม่ทุกครั้งที่บันทึก (live.php)
 * การแก้/ลบตรงนี้จึงแค่ส่งรายการชุดใหม่ไป ไม่ต้องมี API เพิ่ม
 *
 * ⚠️ แผงนี้ต้องสั้นที่สุดเท่าที่ทำได้ กรรมการยืนถือมือถือข้างสนาม
 * ทุกบรรทัดที่เพิ่มคือระยะที่ต้องเลื่อนก่อนถึงปุ่มที่กดสิบกว่าครั้งต่อนัด
 * สถิติการเจอกันจึงย้ายไปอยู่หน้าตารางแข่ง — เป็นข้อมูลก่อนเกม ไม่ใช่ระหว่างจด
 * และรายการลูกยิงย่อไว้ เปิดเฉพาะตอนต้องแก้
 */

type Props = {
  kicks: Kick[];
  teamA: Team;
  teamB: Team;
  rosterA: Player[];
  rosterB: Player[];
  onEditKick: (kickId: string, patch: { result?: KickResult; player?: string }) => void;
  onDeleteKick: (kickId: string) => void;
  readOnly?: boolean;
};

const RESULT_UI: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
  GOAL:   { label: 'เข้า',   cls: 'bg-emerald-500 text-white', icon: <Target className="w-3.5 h-3.5" /> },
  SAVED:  { label: 'เซฟได้', cls: 'bg-sky-600 text-white',     icon: <ShieldCheck className="w-3.5 h-3.5" /> },
  MISSED: { label: 'พลาด',   cls: 'bg-rose-600 text-white',    icon: <XCircle className="w-3.5 h-3.5" /> },
};

const ORDER: KickResult[] = ['GOAL' as KickResult, 'SAVED' as KickResult, 'MISSED' as KickResult];

const MatchRecorderPanel: React.FC<Props> = ({
  kicks, teamA, teamB, rosterA, rosterB, onEditKick, onDeleteKick, readOnly = false,
}) => {
  const [editing, setEditing] = useState<string | null>(null);
  // ย่อไว้ก่อน — คนจดต้องการมันเฉพาะตอนกดผิด ไม่ใช่ทุกลูก
  const [showLog, setShowLog] = useState(false);

  /** สถิติของนัดนี้ แยกทีม — คนจดอยากเห็นว่ายิงเข้ากี่จาก กี่ */
  const stats = useMemo(() => {
    const calc = (side: 'A' | 'B') => {
      const own = kicks.filter(k => k.teamId === side);
      const goals = own.filter(k => k.result === 'GOAL').length;
      const saved = own.filter(k => k.result === 'SAVED').length;
      const missed = own.filter(k => k.result === 'MISSED').length;
      return {
        taken: own.length, goals, saved, missed,
        pct: own.length === 0 ? 0 : Math.round((goals / own.length) * 100),
      };
    };
    return { A: calc('A'), B: calc('B') };
  }, [kicks]);

  // เรียงตามลำดับที่ยิงจริง ไม่ใช่ตามรอบ — คนจดไล่ย้อนจากลูกล่าสุดเป็นหลัก
  const ordered = useMemo(
    () => [...kicks].sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0)),
    [kicks]);

  const Row: React.FC<{ k: Kick }> = ({ k }) => {
    const side = k.teamId === 'A' ? teamA : teamB;
    const roster = k.teamId === 'A' ? rosterA : rosterB;
    const ui = RESULT_UI[k.result as string] ?? RESULT_UI.MISSED;
    const isOpen = editing === k.id;

    return (
      <div className={`rounded-xl border transition ${isOpen
        ? 'border-indigo-400 bg-indigo-500/10' : 'border-white/10 bg-white/[0.04]'}`}>
        <div className="flex items-center gap-2 p-2">
          <span className="w-7 h-7 rounded-lg bg-white/10 text-[11px] font-black
                           flex items-center justify-center shrink-0 tabular-nums">
            {k.round}
          </span>
          <span className={`px-2 py-0.5 rounded text-[10px] font-black shrink-0
            ${k.teamId === 'A' ? 'bg-blue-500/25 text-blue-200' : 'bg-rose-500/25 text-rose-200'}`}>
            {side.shortName || (k.teamId === 'A' ? 'ทีม A' : 'ทีม B')}
          </span>
          <span className="text-xs text-white truncate flex-1 min-w-0">
            {k.player || <span className="text-slate-500">ไม่ระบุผู้ยิง</span>}
          </span>
          <span className={`px-2 py-1 rounded-lg text-[10px] font-black flex items-center gap-1 shrink-0 ${ui.cls}`}>
            {ui.icon} {ui.label}
          </span>
          {!readOnly && (
            <button onClick={() => setEditing(isOpen ? null : k.id)}
              aria-label="แก้ไขลูกนี้"
              className="w-9 h-9 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center shrink-0">
              <Pencil className="w-4 h-4 text-white" />
            </button>
          )}
        </div>

        {isOpen && !readOnly && (
          <div className="px-2 pb-2 space-y-2 border-t border-white/10 pt-2">
            <div>
              <p className="text-[11px] text-slate-400 mb-1">ผลการยิง</p>
              <div className="grid grid-cols-3 gap-1.5">
                {ORDER.map(r => (
                  <button key={r as string}
                    onClick={() => { onEditKick(k.id, { result: r }); setEditing(null); }}
                    className={`h-11 rounded-lg text-xs font-black flex items-center justify-center gap-1
                      ${k.result === r ? RESULT_UI[r as string].cls : 'bg-white/10 text-slate-300'}`}>
                    {RESULT_UI[r as string].icon} {RESULT_UI[r as string].label}
                  </button>
                ))}
              </div>
            </div>

            {roster.length > 0 && (
              <div>
                <p className="text-[11px] text-slate-400 mb-1">ผู้ยิง</p>
                <select
                  value={k.player ?? ''}
                  onChange={e => onEditKick(k.id, { player: e.target.value })}
                  className="w-full h-11 rounded-lg bg-slate-800 border border-white/15 text-white text-sm px-2">
                  <option value="">ไม่ระบุผู้ยิง</option>
                  {roster.map(p => (
                    <option key={p.id} value={p.name}>
                      {p.number ? `#${p.number} ` : ''}{p.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <button onClick={() => { onDeleteKick(k.id); setEditing(null); }}
              className="w-full h-11 rounded-lg bg-rose-600/20 border border-rose-500/40 text-rose-200
                         text-xs font-black flex items-center justify-center gap-1.5">
              <Trash2 className="w-4 h-4" /> ลบลูกนี้ออกจากรายการ
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {/* สถิติสด — แถวเดียวพอ
          สกอร์กับผลรายลูกมี ScoreVisualizer ด้านบนแสดงอยู่แล้ว
          ที่เพิ่มมาจริง ๆ คืออัตราการยิงเข้า จึงเหลือแค่นั้น */}
      <div className="rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2
                      flex items-center gap-2 text-xs">
        {([[teamA, stats.A], [teamB, stats.B]] as const).map(([team, st], i) => (
          <React.Fragment key={team.id}>
            {i === 1 && <span className="w-px h-6 bg-white/15 shrink-0" />}
            <div className="min-w-0 flex-1">
              <p className="text-slate-400 truncate text-[11px]">{team.name}</p>
              <p className="text-white font-black tabular-nums">
                {st.goals}/{st.taken}
                <span className="text-slate-500 font-normal"> · เข้า {st.pct}%</span>
              </p>
            </div>
          </React.Fragment>
        ))}
      </div>

      {/* รายการลูกยิงที่แก้ได้ */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.06] overflow-hidden">
        <button onClick={() => setShowLog(v => !v)}
          className="w-full px-4 py-3 flex items-center gap-2 text-left">
          <ClipboardList className="w-4 h-4 text-slate-400 shrink-0" />
          <span className="text-xs font-black text-slate-300 flex-1">
            รายการลูกยิง ({kicks.length})
          </span>
          {showLog ? <ChevronUp className="w-4 h-4 text-slate-400" />
                   : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </button>

        {showLog && (
          <div className="px-3 pb-3 space-y-1.5 max-h-80 overflow-y-auto">
            {ordered.length === 0
              ? <p className="text-xs text-slate-500 text-center py-4">ยังไม่มีการยิง</p>
              : ordered.map(k => <Row key={k.id} k={k} />)}
            {!readOnly && ordered.length > 0 && (
              <p className="text-[11px] text-slate-500 pt-1">
                แตะรูปดินสอเพื่อแก้ผลหรือเปลี่ยนผู้ยิง — คะแนนจะคำนวณใหม่ทันที
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default MatchRecorderPanel;
