import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Banknote, Search, ShieldAlert, Users, X } from 'lucide-react';
import { Player, Team } from '../types';

/**
 * รายการทีมแบบเจาะดูจากตัวเลขบนการ์ด "ภาพรวมการแข่งขัน"
 *
 * ที่ต้องมี: ตัวเลขบนการ์ดบอกแค่ "กี่ทีม" แต่คำถามถัดไปของครูเสมอคือ
 * "แล้วทีมไหนบ้าง" / "ของโรงเรียนเราจ่ายหรือยัง" ซึ่งเดิมต้องไล่เปิดทีละทีม
 *
 * ใช้ inline style กับส่วนหัวเหมือน TeamOverviewDialog เพราะ render ผ่าน portal
 * เหมือนกัน — กันกรณีสไตล์ไม่ถูกใช้แล้วตัวอักษรขาวจมไปกับพื้นขาว
 */

export type TeamListKind = 'paid' | 'roster';

interface Props {
  kind: TeamListKind | null;
  teams: Team[];
  players: Player[];
  onClose: () => void;
  onPickTeam?: (team: Team) => void;
}

const KIND: Record<TeamListKind, {
  label: string; title: string; empty: string; color: string; accent: string;
}> = {
  paid: {
    label: 'PAYMENT · ค่าสมัคร',
    title: 'ทีมที่ชำระค่าสมัครแล้ว',
    empty: 'ยังไม่มีทีมที่ผู้ดูแลยืนยันการชำระเงิน',
    color: '#B45309',
    accent: '#FDE68A',
  },
  roster: {
    label: 'SQUAD · รายชื่อนักกีฬา',
    title: 'ทีมที่ส่งรายชื่อแล้ว',
    empty: 'ยังไม่มีทีมที่กรอกรายชื่อนักกีฬา',
    color: '#4338CA',
    accent: '#C7D2FE',
  },
};

const TeamListDialog: React.FC<Props> = ({ kind, teams, players, onClose, onPickTeam }) => {
  const [query, setQuery] = useState('');

  const rosterCount = useMemo(() => {
    const map: Record<string, number> = {};
    players.forEach(p => { map[p.teamId] = (map[p.teamId] ?? 0) + 1; });
    return map;
  }, [players]);

  const list = useMemo(() => {
    if (!kind) return [];
    const base = kind === 'paid'
      ? teams.filter(t => t.isPaid)
      : teams.filter(t => (rosterCount[t.id] ?? 0) > 0);
    const q = query.trim().toLowerCase();
    const filtered = q === ''
      ? base
      : base.filter(t => t.name.toLowerCase().includes(q)
        || (t.group ?? '').toLowerCase().includes(q));
    return [...filtered].sort((a, b) => a.name.localeCompare(b.name, 'th'));
  }, [kind, teams, rosterCount, query]);

  // ⚠️ return ก่อนเรียก hook ครบทุกตัวไม่ได้ — React นับลำดับ hook ต่อการ render
  // ถ้าจำนวนไม่เท่าเดิมจะพังทั้งหน้า ("Rendered more hooks than during the previous render")
  // จึงต้องเช็ค kind ที่นี่ หลัง useState/useMemo ทั้งหมด
  if (!kind) return null;
  const meta = KIND[kind];
  const totalPlayers = list.reduce((sum, t) => sum + (rosterCount[t.id] ?? 0), 0);

  return createPortal(
    <div
      className="fixed inset-0 modal-sheet modal-inset-mobile modal-contained flex items-end xl:items-center justify-center p-0 xl:p-4 overflow-hidden"
      style={{ zIndex: 2147483645, backgroundColor: 'rgba(2,6,23,0.65)' }}
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-md rounded-3xl shadow-2xl overflow-hidden flex flex-col"
        style={{
          backgroundColor: '#ffffff',
          height: 'min(86vh, 46rem)',
          maxHeight: 'calc(100vh - 1rem)',
          isolation: 'isolate',
        }}
        role="dialog"
        aria-modal="true"
        aria-label={meta.title}
        onClick={e => e.stopPropagation()}
      >
        <div
          className="relative shrink-0 px-4 pt-5 pb-4"
          style={{ backgroundColor: meta.color, color: '#ffffff' }}
        >
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-full"
            style={{ backgroundColor: 'rgba(255,255,255,0.18)', color: '#ffffff' }}
            aria-label="ปิด"
          >
            <X className="w-5 h-5" />
          </button>
          <p className="text-xs font-bold" style={{ color: meta.accent }}>{meta.label}</p>
          <h2 className="text-xl font-black leading-tight mt-1 pr-10" style={{ color: '#ffffff' }}>
            {meta.title}
          </h2>
          <p className="text-xs mt-1.5" style={{ color: meta.accent }}>
            {kind === 'paid'
              ? `${list.length} ทีม`
              : `${list.length} ทีม · นักกีฬารวม ${totalPlayers} คน`}
          </p>
        </div>

        <div className="px-4 pt-3 pb-2 shrink-0">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
            <input
              className="w-full pl-9 pr-3 py-2.5 border border-slate-300 rounded-xl text-sm"
              placeholder="ค้นหาชื่อทีม หรือ สาย"
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-4 modal-scroll-region">
          {list.length === 0 ? (
            <p className="py-12 text-center text-sm text-slate-400">
              {query.trim() !== '' ? 'ไม่พบทีมที่ค้นหา' : meta.empty}
            </p>
          ) : (
            <div className="space-y-2">
              {list.map(team => {
                const n = rosterCount[team.id] ?? 0;
                return (
                  <button
                    key={team.id}
                    onClick={() => onPickTeam?.(team)}
                    className="w-full text-left rounded-2xl border border-slate-200 p-3 flex items-center gap-3 hover:border-indigo-300 hover:bg-indigo-50/40 active:scale-[0.99] transition"
                  >
                    <div className="w-11 h-11 rounded-xl bg-slate-50 border border-slate-100 p-1.5 flex items-center justify-center shrink-0">
                      {team.logoUrl
                        ? <img src={team.logoUrl} alt="" className="w-full h-full object-contain" />
                        : <ShieldAlert className="w-5 h-5 text-slate-300" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-sm text-slate-800 truncate">{team.name}</p>
                      <p className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                        <span className="text-indigo-600 font-bold">สาย {team.group || 'ยังไม่จัด'}</span>
                        <span className="flex items-center gap-0.5">
                          <Users className="w-3 h-3" /> {n} คน
                        </span>
                      </p>
                    </div>
                    {kind === 'roster' && team.isPaid && (
                      <Banknote className="w-4 h-4 text-emerald-600 shrink-0" aria-label="ชำระค่าสมัครแล้ว" />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default TeamListDialog;
