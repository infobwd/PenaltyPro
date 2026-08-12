import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronLeft, Search, Loader2, CheckCircle2, XCircle, AlertTriangle,
  RefreshCw, UserCheck, Users, Phone, ShieldCheck, X,
} from 'lucide-react';
import { apiGet, apiPost, ApiError } from '../services/apiConfig';
import { ToastType } from './Toast';

/**
 * รายงานตัวนักกีฬาหน้างาน — สำหรับเจ้าภาพ/กรรมการ
 *
 * ใช้งานจริงคือยืนอยู่ข้างสนาม ถือมือถือหรือแท็บเล็ต มีทีมมายืนรอเป็นแถว
 * ข้อจำกัดที่ออกแบบตาม:
 *   - รูปต้องใหญ่พอเทียบหน้าคนจริงได้ ไม่ใช่ thumbnail 40px
 *   - ปุ่มต้องกดโดนตั้งแต่ครั้งแรก มือเดียว ไม่ต้องเล็ง (สูงอย่างน้อย 44px)
 *   - บันทึกทันทีทีละคน ไม่มีปุ่ม "บันทึกทั้งหมด" เพราะเน็ตสนามหลุดบ่อย
 *     ถ้าเก็บไว้กดทีเดียวตอนท้ายแล้วหลุด งานที่ทำมาทั้งทีมหายหมด
 *   - แท็บเล็ตแนวนอนมีที่ว่างเยอะ ใช้เป็น 2-3 คอลัมน์ ไม่ปล่อยว่าง
 */

type Player = {
  id: string;
  name: string;
  number: string;
  position: string;
  photoUrl: string;
  birthDate: string | null;
  status: 'present' | 'absent' | 'issue' | null;
  note: string;
  checkedAt: string | null;
};

type TeamRow = {
  id: string; name: string; logoUrl: string; group: string; schoolName: string;
  total: number; present: number; absent: number; issue: number;
};

type TeamDetail = {
  id: string; name: string; logoUrl: string; group: string; schoolName: string;
  managerName: string; managerPhone: string; coachName: string; coachPhone: string;
};

type Props = {
  onExit: () => void;
  notify: (title: string, msg?: string, type?: ToastType) => void;
  tournamentId?: string;
};

const STATUS_UI = {
  present: { label: 'มารายงานตัว', short: 'มา',    cls: 'bg-emerald-600 text-white', ring: 'ring-emerald-500', soft: 'bg-emerald-50 border-emerald-300', icon: CheckCircle2 },
  absent:  { label: 'ไม่มา',        short: 'ไม่มา', cls: 'bg-rose-600 text-white',    ring: 'ring-rose-500',    soft: 'bg-rose-50 border-rose-300',       icon: XCircle },
  issue:   { label: 'ติดปัญหา',     short: 'ติดปัญหา', cls: 'bg-amber-500 text-white', ring: 'ring-amber-500',  soft: 'bg-amber-50 border-amber-300',     icon: AlertTriangle },
} as const;

const ORDER: (keyof typeof STATUS_UI)[] = ['present', 'absent', 'issue'];

const calcAge = (birth: string | null): string => {
  if (!birth) return '';
  const d = new Date(birth);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age >= 0 && age < 100 ? `${age} ปี` : '';
};

const CheckInPage: React.FC<Props> = ({ onExit, notify, tournamentId }) => {
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [openTeam, setOpenTeam] = useState<TeamDetail | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loadingTeam, setLoadingTeam] = useState(false);
  // กำลังบันทึกอยู่คนไหน — ปุ่มของคนอื่นต้องกดต่อได้ ไม่ล็อกทั้งหน้า
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [zoom, setZoom] = useState<Player | null>(null);

  const loadTeams = async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const r = await apiGet('checkinTeams', tournamentId ? { tournamentId } : {});
      setTeams(r.teams ?? []);
    } catch (e) {
      notify('โหลดรายชื่อทีมไม่สำเร็จ', (e as ApiError).message, 'error');
    } finally { setLoading(false); }
  };

  useEffect(() => { loadTeams(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [tournamentId]);

  const openTeamDetail = async (t: TeamRow) => {
    setLoadingTeam(true);
    setOpenTeam({
      id: t.id, name: t.name, logoUrl: t.logoUrl, group: t.group,
      schoolName: t.schoolName, managerName: '', managerPhone: '',
      coachName: '', coachPhone: '',
    });
    try {
      const r = await apiGet('checkinTeam', { teamId: t.id });
      setOpenTeam(r.team);
      setPlayers(r.players ?? []);
    } catch (e) {
      notify('โหลดรายชื่อนักกีฬาไม่สำเร็จ', (e as ApiError).message, 'error');
      setOpenTeam(null);
    } finally { setLoadingTeam(false); }
  };

  /**
   * กดสถานะ — เปลี่ยนหน้าจอก่อน แล้วค่อยยิงไป server
   *
   * กรรมการกดรัวทีละคน ถ้ารอ response ก่อนค่อยเปลี่ยนสี จะรู้สึกเหมือนปุ่มไม่ติด
   * แล้วกดซ้ำ พลาดแล้วค่อยย้อนกลับพร้อมข้อความ
   */
  const setStatus = async (p: Player, next: Player['status']) => {
    const value = p.status === next ? null : next;   // กดซ้ำ = ยกเลิก
    const before = players;
    setPlayers(prev => prev.map(x => x.id === p.id ? { ...x, status: value } : x));
    setSaving(prev => new Set(prev).add(p.id));
    try {
      await apiPost('savePlayerCheckin', { playerId: p.id, status: value ?? '' });
      setTeams(prev => prev.map(t => t.id === openTeam?.id
        ? recount(t, before, p.id, value)
        : t));
    } catch (e) {
      setPlayers(before);
      notify('บันทึกไม่สำเร็จ', (e as ApiError).message, 'error');
    } finally {
      setSaving(prev => { const n = new Set(prev); n.delete(p.id); return n; });
    }
  };

  /** อัปเดตตัวเลขสรุปบนการ์ดทีมโดยไม่ต้องโหลดรายการทั้งหมดใหม่ */
  const recount = (t: TeamRow, before: Player[], playerId: string, next: Player['status']): TeamRow => {
    const old = before.find(x => x.id === playerId)?.status ?? null;
    const bump = (k: 'present' | 'absent' | 'issue') =>
      t[k] - (old === k ? 1 : 0) + (next === k ? 1 : 0);
    return { ...t, present: bump('present'), absent: bump('absent'), issue: bump('issue') };
  };

  const bulk = async (status: 'present' | '') => {
    if (!openTeam) return;
    setBulkBusy(true);
    try {
      await apiPost('checkinTeamBulk', { teamId: openTeam.id, status });
      const r = await apiGet('checkinTeam', { teamId: openTeam.id });
      setPlayers(r.players ?? []);
      await loadTeams(true);
      notify(status === '' ? 'ล้างผลรายงานตัวแล้ว' : 'บันทึกว่ามาครบแล้ว',
        status === '' ? 'ทั้งทีมกลับไปเป็นยังไม่ได้เช็ก' : 'เฉพาะคนที่ยังไม่ได้เช็ก', 'success');
    } catch (e) {
      notify('ทำรายการไม่สำเร็จ', (e as ApiError).message, 'error');
    } finally { setBulkBusy(false); }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return teams;
    return teams.filter(t =>
      t.name.toLowerCase().includes(q) || t.schoolName.toLowerCase().includes(q));
  }, [teams, search]);

  const totals = useMemo(() => teams.reduce(
    (a, t) => ({
      players: a.players + t.total,
      present: a.present + t.present,
      pending: a.pending + (t.total - t.present - t.absent - t.issue),
    }), { players: 0, present: 0, pending: 0 }), [teams]);

  const photoZoom = zoom ? createPortal(
    <div className="fixed inset-0 z-[2000] bg-black/90 flex items-center justify-center p-4"
      onClick={() => setZoom(null)} role="dialog" aria-modal="true">
      <button onClick={() => setZoom(null)} aria-label="ปิด"
        className="absolute top-4 right-4 p-2 rounded-full"
        style={{ backgroundColor: 'rgba(255,255,255,0.2)', color: '#fff' }}>
        <X className="w-6 h-6" />
      </button>
      <div className="max-w-md w-full" onClick={e => e.stopPropagation()}>
        {zoom.photoUrl
          ? <img src={zoom.photoUrl} alt={zoom.name}
              className="w-full max-h-[70vh] object-contain rounded-2xl" />
          : <div className="aspect-square rounded-2xl bg-slate-800 flex items-center justify-center">
              <Users className="w-20 h-20 text-slate-600" />
            </div>}
        <p className="text-center font-black text-lg mt-3" style={{ color: '#fff' }}>
          {zoom.number ? `#${zoom.number} ` : ''}{zoom.name || 'ไม่ระบุชื่อ'}
        </p>
        <p className="text-center text-sm mt-1" style={{ color: '#cbd5e1' }}>
          {[zoom.position, calcAge(zoom.birthDate)].filter(Boolean).join(' · ') || 'ไม่มีข้อมูลเพิ่มเติม'}
        </p>
      </div>
    </div>, document.body) : null;

  // ── รายชื่อนักกีฬาของทีมที่เลือก ───────────────────────────────────────
  if (openTeam) {
    const done = players.filter(p => p.status).length;
    return (
      <div className="min-h-screen bg-slate-100 pb-24">
        <div className="sticky top-0 z-20 bg-white border-b border-slate-200 shadow-sm">
          <div className="max-w-5xl mx-auto px-3 py-2.5 flex items-center gap-3">
            <button onClick={() => { setOpenTeam(null); setPlayers([]); }}
              className="p-2 -ml-2 rounded-lg hover:bg-slate-100 shrink-0" aria-label="กลับ">
              <ChevronLeft className="w-5 h-5" />
            </button>
            {openTeam.logoUrl
              ? <img src={openTeam.logoUrl} alt="" className="w-9 h-9 rounded-lg object-contain bg-slate-50 shrink-0" />
              : <div className="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
                  <Users className="w-5 h-5 text-indigo-400" />
                </div>}
            <div className="min-w-0 flex-1">
              <p className="font-black text-slate-900 truncate leading-tight">{openTeam.name}</p>
              <p className="text-[11px] text-slate-500 truncate">
                {[openTeam.schoolName, openTeam.group && `สาย ${openTeam.group}`]
                  .filter(Boolean).join(' · ')}
              </p>
            </div>
            <span className="text-sm font-black text-slate-700 shrink-0 tabular-nums">
              {done}/{players.length}
            </span>
          </div>
        </div>

        <div className="max-w-5xl mx-auto p-3 space-y-3">
          {/* ผู้ติดต่อทีม — กรรมการต้องโทรตามเมื่อคนไม่ครบ */}
          {(openTeam.managerPhone || openTeam.coachPhone) && (
            <div className="bg-white rounded-xl border border-slate-200 p-3 flex flex-wrap gap-x-5 gap-y-2">
              {openTeam.managerName && (
                <a href={`tel:${openTeam.managerPhone}`} className="flex items-center gap-2 text-sm min-w-0">
                  <Phone className="w-4 h-4 text-indigo-600 shrink-0" />
                  <span className="truncate">
                    <span className="text-slate-500">ผู้จัดการทีม</span>{' '}
                    <span className="font-bold text-slate-800">{openTeam.managerName}</span>
                    {openTeam.managerPhone && <span className="text-indigo-600"> {openTeam.managerPhone}</span>}
                  </span>
                </a>
              )}
              {openTeam.coachName && (
                <a href={`tel:${openTeam.coachPhone}`} className="flex items-center gap-2 text-sm min-w-0">
                  <Phone className="w-4 h-4 text-indigo-600 shrink-0" />
                  <span className="truncate">
                    <span className="text-slate-500">ผู้ฝึกสอน</span>{' '}
                    <span className="font-bold text-slate-800">{openTeam.coachName}</span>
                    {openTeam.coachPhone && <span className="text-indigo-600"> {openTeam.coachPhone}</span>}
                  </span>
                </a>
              )}
            </div>
          )}

          {loadingTeam ? (
            <div className="py-20 flex justify-center"><Loader2 className="w-7 h-7 animate-spin text-indigo-500" /></div>
          ) : players.length === 0 ? (
            <p className="text-center text-sm text-slate-400 py-16">ทีมนี้ยังไม่มีรายชื่อนักกีฬาในระบบ</p>
          ) : (
            /* มือถือ 1 คอลัมน์ / แท็บเล็ต 2 / จอใหญ่ 3 — แท็บเล็ตแนวนอนมีที่พอวาง 2 ใบเต็ม ๆ */
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {players.map(p => {
                const ui = p.status ? STATUS_UI[p.status] : null;
                return (
                  <div key={p.id}
                    className={`bg-white rounded-2xl border-2 p-3 transition ${ui ? ui.soft : 'border-slate-200'}`}>
                    <div className="flex gap-3">
                      {/* รูปใหญ่พอเทียบหน้าคนจริง — แตะเพื่อขยายอีกชั้น */}
                      <button onClick={() => setZoom(p)}
                        title="แตะเพื่อดูรูปใหญ่"
                        className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl overflow-hidden bg-slate-100 shrink-0 border border-slate-200">
                        {p.photoUrl
                          ? <img src={p.photoUrl} alt="" className="w-full h-full object-cover" />
                          : <div className="w-full h-full flex items-center justify-center">
                              <Users className="w-8 h-8 text-slate-300" />
                            </div>}
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start gap-2">
                          {p.number && (
                            <span className="shrink-0 w-8 h-8 rounded-lg bg-slate-900 text-white
                                             font-black text-sm flex items-center justify-center tabular-nums">
                              {p.number}
                            </span>
                          )}
                          <p className="font-black text-slate-900 leading-snug break-words flex-1">
                            {p.name || <span className="text-rose-500">ยังไม่กรอกชื่อ</span>}
                          </p>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-1">
                          {[p.position, calcAge(p.birthDate)].filter(Boolean).join(' · ') || '—'}
                        </p>
                        {!p.photoUrl && (
                          <p className="text-[11px] text-amber-700 mt-1 font-bold">ไม่มีรูปในระบบ — ตรวจบัตรแทน</p>
                        )}
                      </div>
                      {saving.has(p.id) && <Loader2 className="w-4 h-4 animate-spin text-slate-400 shrink-0" />}
                    </div>

                    {/* ปุ่มสูง 48px กดด้วยนิ้วโป้งข้างสนามได้โดยไม่ต้องเล็ง */}
                    <div className="grid grid-cols-3 gap-2 mt-3">
                      {ORDER.map(k => {
                        const cfg = STATUS_UI[k];
                        const Icon = cfg.icon;
                        const on = p.status === k;
                        return (
                          <button key={k} onClick={() => setStatus(p, k)}
                            aria-pressed={on}
                            className={`h-12 rounded-xl text-xs font-black flex flex-col items-center justify-center gap-0.5 transition
                                        ${on ? cfg.cls : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                            <Icon className="w-4 h-4" />
                            {cfg.short}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* แถบล่างติดหน้าจอ — ทีมมาครบทั้งทีมคือกรณีปกติ กดปุ่มเดียวจบ */}
        {!loadingTeam && players.length > 0 && (
          <div className="fixed bottom-0 inset-x-0 bg-white border-t border-slate-200 p-3 safe-area-bottom">
            <div className="max-w-5xl mx-auto flex gap-2">
              <button onClick={() => bulk('present')} disabled={bulkBusy}
                className="flex-1 h-12 rounded-xl bg-emerald-600 text-white font-black text-sm
                           disabled:opacity-50 flex items-center justify-center gap-2">
                {bulkBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserCheck className="w-4 h-4" />}
                มาครบทั้งทีม
              </button>
              <button onClick={() => bulk('')} disabled={bulkBusy}
                className="px-4 h-12 rounded-xl border-2 border-slate-300 text-slate-600 font-bold text-sm
                           disabled:opacity-50">
                ล้างผล
              </button>
            </div>
          </div>
        )}
        {photoZoom}
      </div>
    );
  }

  // ── รายการทีม ──────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-100 pb-10">
      <div className="sticky top-0 z-20 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-3 py-2.5 flex items-center gap-2">
          <button onClick={onExit} className="p-2 -ml-2 rounded-lg hover:bg-slate-100 shrink-0" aria-label="กลับ">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="font-black text-slate-900 leading-tight flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-indigo-600 shrink-0" /> รายงานตัวนักกีฬา
            </p>
            <p className="text-[11px] text-slate-500">เทียบรูปในระบบกับตัวจริงก่อนลงแข่ง</p>
          </div>
          <button onClick={() => loadTeams()} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 shrink-0"
            aria-label="โหลดใหม่">
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto p-3 space-y-3">
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'นักกีฬาทั้งหมด', value: totals.players, cls: 'text-slate-900' },
            { label: 'รายงานตัวแล้ว', value: totals.present, cls: 'text-emerald-600' },
            { label: 'ยังไม่ได้เช็ก', value: totals.pending, cls: 'text-amber-600' },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-xl border border-slate-200 p-3 text-center">
              <p className={`text-2xl font-black tabular-nums ${s.cls}`}>{s.value}</p>
              <p className="text-[11px] text-slate-500 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="ค้นหาชื่อทีมหรือโรงเรียน"
            className="w-full h-12 pl-9 pr-3 rounded-xl border border-slate-300 bg-white text-base
                       outline-none focus:ring-2 focus:ring-indigo-400" />
        </div>

        {loading ? (
          <div className="py-20 flex justify-center"><Loader2 className="w-7 h-7 animate-spin text-indigo-500" /></div>
        ) : filtered.length === 0 ? (
          <p className="text-center text-sm text-slate-400 py-16">
            {teams.length === 0
              ? 'ยังไม่มีทีมที่อนุมัติในรายการแข่งขันนี้'
              : 'ไม่พบทีมที่ค้นหา'}
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filtered.map(t => {
              const pending = t.total - t.present - t.absent - t.issue;
              const pct = t.total === 0 ? 0 : Math.round(((t.total - pending) / t.total) * 100);
              return (
                <button key={t.id} onClick={() => openTeamDetail(t)}
                  className="bg-white rounded-2xl border border-slate-200 p-3 text-left
                             hover:border-indigo-300 hover:shadow-md transition">
                  <div className="flex items-center gap-3">
                    {t.logoUrl
                      ? <img src={t.logoUrl} alt="" className="w-12 h-12 rounded-xl object-contain bg-slate-50 shrink-0" />
                      : <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
                          <Users className="w-6 h-6 text-indigo-400" />
                        </div>}
                    <div className="min-w-0 flex-1">
                      <p className="font-black text-slate-900 truncate">{t.name}</p>
                      <p className="text-[11px] text-slate-500 truncate">
                        {[t.schoolName, t.group && `สาย ${t.group}`].filter(Boolean).join(' · ') || '—'}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-lg font-black tabular-nums ${pending === 0 ? 'text-emerald-600' : 'text-slate-800'}`}>
                        {t.total - pending}/{t.total}
                      </p>
                      <p className="text-[10px] text-slate-400">เช็กแล้ว</p>
                    </div>
                  </div>
                  <div className="mt-2.5 h-1.5 rounded-full bg-slate-200 overflow-hidden">
                    <div className={`h-full transition-all ${pending === 0 ? 'bg-emerald-500' : 'bg-indigo-500'}`}
                      style={{ width: `${pct}%` }} />
                  </div>
                  {(t.absent > 0 || t.issue > 0) && (
                    <div className="flex gap-3 mt-2 text-[11px] font-bold">
                      {t.absent > 0 && <span className="text-rose-600">ไม่มา {t.absent}</span>}
                      {t.issue > 0 && <span className="text-amber-600">ติดปัญหา {t.issue}</span>}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
      {photoZoom}
    </div>
  );
};

export default CheckInPage;
