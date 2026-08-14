import React, { useMemo, useState } from 'react';
import {
  Trophy, Plus, Save, Trash2, Loader2, X, Calendar, Users, MapPin,
  Banknote, Target, AlertTriangle, Pencil, Award, Upload, FileText, ImageIcon, X as XIcon,
} from 'lucide-react';
import { apiPost, apiUploadProgress } from '../services/apiConfig';
import { Tournament, TournamentConfig, Team, Match, ProjectImage } from '../types';

/**
 * กลุ่มรูปโครงการที่หน้าเว็บใช้เรียงลำดับ
 *
 * ค่า key ตรงกับ ProjectImage['type'] ห้ามเปลี่ยน — ข้อมูลเก่าที่อัปไว้แล้วอ้างค่านี้อยู่
 */
const IMAGE_GROUPS: {
  key: ProjectImage['type']; label: string; short: string;
  hint: string; box: string; text: string;
}[] = [
  { key: 'before',  label: 'ก่อนดำเนินโครงการ', short: 'ก่อน',
    hint: 'สภาพเดิมก่อนเริ่ม — ใช้คู่กับรูปหลังเพื่อให้เห็นความต่าง',
    box: 'border-amber-200 bg-amber-50/60',   text: 'text-amber-700' },
  { key: 'after',   label: 'หลังดำเนินโครงการ', short: 'หลัง',
    hint: 'ผลที่เกิดขึ้นจริงหลังใช้เงินบริจาค',
    box: 'border-emerald-200 bg-emerald-50/60', text: 'text-emerald-700' },
  { key: 'general', label: 'รูปทั่วไป', short: 'ทั่วไป',
    hint: 'บรรยากาศ กิจกรรม หรือรูปอื่นที่ไม่ใช่ก่อน/หลัง',
    box: 'border-slate-200 bg-slate-50',      text: 'text-slate-600' },
];

/**
 * จัดการรายการแข่งขัน (CRUD) สำหรับแอดมินส่วนกลาง
 *
 * แยกออกมาจากแท็บ "ตั้งค่า" เพราะคนละระดับกัน:
 *   - ตั้งค่า      = ตั้งค่าทั้งระบบ (โลโก้เว็บ, LIFF, PIN)
 *   - หน้านี้      = ตัวรายการแข่งขันแต่ละรายการ
 *
 * ⚠️ ข้อควรระวังตอนบันทึก: ฝั่ง server เขียนทับคอลัมน์ config ทั้งชุด
 * ฟอร์มจึงต้องโหลดค่าเดิมมาให้ครบก่อนเสมอ ไม่งั้นค่าที่ไม่ได้แตะจะถูกล้าง
 * (รูปโครงการก็ส่งกลับไปตามเดิม เพราะหน้านี้ไม่ได้แก้รูป)
 */

interface Props {
  tournaments: Tournament[];
  /** ใช้แสดงว่าการลบจะพาอะไรหายไปบ้าง ก่อนแอดมินกดยืนยัน */
  teams?: Team[];
  matches?: Match[];
  onRefresh: (refresh?: boolean) => void | Promise<void>;
  notify: (title: string, msg?: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
}

const parseConfig = (raw?: string): TournamentConfig => {
  if (!raw) return {};
  try { return JSON.parse(raw) as TournamentConfig; } catch { return {}; }
};

/** ISO -> ค่าใส่ใน <input type="datetime-local"> (ต้องเป็นเวลาท้องถิ่น ไม่มี Z) */
const toLocalInput = (iso?: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    + `T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const STATUS: Record<string, { text: string; cls: string }> = {
  Upcoming: { text: 'กำลังจะแข่ง', cls: 'bg-amber-100 text-amber-800' },
  Active:   { text: 'กำลังแข่ง', cls: 'bg-emerald-100 text-emerald-800' },
  Archived: { text: 'จบแล้ว', cls: 'bg-slate-200 text-slate-600' },
};

const inp = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm';
const lbl = 'block text-xs font-bold text-slate-600 mb-1';

const AdminTournaments: React.FC<Props> = ({
  tournaments, teams = [], matches = [], onRefresh, notify,
}) => {
  const [busy, setBusy] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<Tournament | null>(null);
  const [cfg, setCfg] = useState<TournamentConfig>({});
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<'penalty' | '7v7' | '11v11'>('penalty');
  const [delId, setDelId] = useState<string | null>(null);
  const [confirmName, setConfirmName] = useState('');
  // ความคืบหน้าอัปโหลดแยกตามช่อง — ไฟล์โครงการมักหลายเมกะไบต์
  // ถ้าไม่มีแถบบอก ผู้ใช้จะนึกว่าค้างแล้วกดซ้ำจนได้ไฟล์ซ้ำหลายอัน
  const [uploadPct, setUploadPct] = useState<Record<string, number>>({});

  const sorted = useMemo(() => {
    const order: Record<string, number> = { Active: 0, Upcoming: 1, Archived: 2 };
    return [...tournaments].sort(
      (a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9) || a.name.localeCompare(b.name, 'th'));
  }, [tournaments]);

  const openEdit = (t: Tournament) => {
    setForm({ ...t });
    setCfg(parseConfig(t.config));
    setEditId(t.id);
  };

  const closeEdit = () => { setEditId(null); setForm(null); setCfg({}); };

  const setC = <K extends keyof TournamentConfig>(k: K, v: TournamentConfig[K]) =>
    setCfg(prev => ({ ...prev, [k]: v }));

  const doCreate = async () => {
    const name = newName.trim();
    if (name === '') { notify('ยังสร้างไม่ได้', 'ต้องใส่ชื่อรายการก่อน', 'warning'); return; }
    setBusy('create');
    try {
      await apiPost('createTournament', { name, type: newType });
      notify('สร้างรายการแล้ว', name, 'success');
      setNewName('');
      await onRefresh(true);
    } catch (e) {
      notify('สร้างไม่สำเร็จ', (e as Error).message, 'error');
    } finally { setBusy(null); }
  };

  const doSave = async () => {
    if (!form) return;
    if (form.name.trim() === '') { notify('บันทึกไม่ได้', 'ต้องใส่ชื่อรายการ', 'warning'); return; }
    setBusy('save');
    try {
      await apiPost('updateTournament', {
        tournament: {
          id: form.id,
          name: form.name.trim(),
          type: form.type,
          status: form.status,
          // ส่ง config ทั้งก้อนกลับไป — server เขียนทับทุกคอลัมน์
          config: JSON.stringify(cfg),
        },
      });
      notify('บันทึกแล้ว', form.name, 'success');
      closeEdit();
      await onRefresh(true);
    } catch (e) {
      notify('บันทึกไม่สำเร็จ', (e as Error).message, 'error');
    } finally { setBusy(null); }
  };

  const doDelete = async () => {
    const t = tournaments.find(x => x.id === delId);
    if (!t) return;
    setBusy('del');
    try {
      const r = await apiPost('deleteTournament', {
        tournamentId: t.id, confirmName: confirmName.trim(), force: true,
      });

      // ฝั่ง server ลบและล้าง cache ให้แล้ว แต่เบราว์เซอร์ยังถือสำเนาไว้อีก 60 วิ
      // ถ้าไม่ล้างตรงนี้ ทีมที่เพิ่งลบจะยังโชว์อยู่ทั้งที่หายจากฐานข้อมูลแล้ว
      localStorage.removeItem('penalty_pro_db_cache');
      localStorage.removeItem('penalty_pro_db_timestamp');
      // ถ้ารายการที่ลบคือรายการที่กำลังเปิดอยู่ ต้องเลิกอ้างถึง ไม่งั้นทั้งแอป
      // ค้างอยู่กับ id ที่ไม่มีแล้ว แล้วทุกหน้าโชว์ว่าง ๆ โดยไม่บอกสาเหตุ
      if (localStorage.getItem('current_tournament_id') === t.id) {
        localStorage.removeItem('current_tournament_id');
      }

      const d = r.deleted ?? {};
      notify('ลบรายการแล้ว',
        `${t.name} · ลบทีม ${d.teams ?? 0} · นักกีฬา ${d.players ?? 0} · นัดแข่ง ${d.matches ?? 0}`
        + (r.donationsKept ? ` · เก็บยอดบริจาค ${r.donationsKept} รายการไว้` : ''),
        'success');
      setDelId(null); setConfirmName('');
      await onRefresh(true);
    } catch (e) {
      notify('ลบไม่สำเร็จ', (e as Error).message, 'error');
    } finally { setBusy(null); }
  };

  /** อัปโหลดไฟล์แล้วคืน URL พร้อมรายงานความคืบหน้าให้ช่องนั้น */
  const uploadFile = async (file: File, kind: string, slot: string): Promise<string | null> => {
    // ตรวจขนาดก่อนส่ง — ให้รู้ตั้งแต่ต้นแทนที่จะรอ 8 MB แล้วค่อยโดนปฏิเสธ
    if (file.size > 8 * 1024 * 1024) {
      notify('ไฟล์ใหญ่เกินไป', `${file.name} มีขนาด ${(file.size / 1048576).toFixed(1)} MB (จำกัด 8 MB)`, 'warning');
      return null;
    }
    setUploadPct(prev => ({ ...prev, [slot]: 0 }));
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('kind', kind);
      const r = await apiUploadProgress('uploadFile', fd,
        pct => setUploadPct(prev => ({ ...prev, [slot]: pct })));
      return r.url as string;
    } catch (e) {
      notify('อัปโหลดไม่สำเร็จ', (e as Error).message, 'error');
      return null;
    } finally {
      // หน่วงนิดให้เห็น 100% ก่อนแถบหาย ไม่งั้นดูเหมือนไม่ได้ทำอะไร
      setTimeout(() => setUploadPct(prev => {
        const next = { ...prev }; delete next[slot]; return next;
      }), 600);
    }
  };

  /** แก้รายการรูปโครงการ — ใช้ prev เสมอ เพราะอัปหลายไฟล์ต่อกันเร็วกว่า state จะตามทัน */
  const setImages = (fn: (prev: ProjectImage[]) => ProjectImage[]) => {
    setCfg(prev => ({
      ...prev,
      objective: {
        ...(prev.objective ?? { isEnabled: true, title: '', description: '', goal: 0, images: [] }),
        images: fn((prev.objective?.images ?? []) as ProjectImage[]),
      },
    }));
  };

  const setPrize = (i: number, field: string, v: string) => {
    const prizes = [...(cfg.prizes ?? [])] as any[];
    prizes[i] = { ...prizes[i], [field]: v };
    setC('prizes', prizes as any);
  };

  const delTarget = tournaments.find(x => x.id === delId);

  /** สรุปสิ่งที่จะหายไปพร้อมรายการ — นับจากข้อมูลที่หน้าเว็บถืออยู่ */
  const delImpact = useMemo(() => {
    if (!delId) return { teams: 0, matches: 0, played: 0 };
    const ts = teams.filter(t => t.tournamentId === delId);
    const ms = matches.filter(m => m.tournamentId === delId);
    return {
      teams: ts.length,
      matches: ms.length,
      played: ms.filter(m => m.status !== 'Scheduled').length,
    };
  }, [delId, teams, matches]);

  return (
    <div className="space-y-4 animate-in fade-in duration-300">

      {/* ── สร้างรายการใหม่ ─────────────────────────────────── */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
        <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-3">
          <Plus className="w-5 h-5 text-indigo-600" /> สร้างรายการแข่งขันใหม่
        </h3>
        <div className="flex flex-col sm:flex-row gap-2">
          <input className={`${inp} flex-1`} placeholder="ชื่อรายการ เช่น ฟุตบอลจุดโทษ ปีการศึกษา 2569"
            value={newName} onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') doCreate(); }} />
          <select className={`${inp} sm:w-40`} value={newType}
            onChange={e => setNewType(e.target.value as any)}>
            <option value="penalty">ยิงจุดโทษ</option>
            <option value="7v7">7 คน</option>
            <option value="11v11">11 คน</option>
          </select>
          <button onClick={doCreate} disabled={busy === 'create' || newName.trim() === ''}
            className="px-5 py-2 rounded-lg bg-indigo-600 text-white font-bold text-sm
                       hover:bg-indigo-700 disabled:opacity-40 flex items-center justify-center gap-2">
            {busy === 'create' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            สร้าง
          </button>
        </div>
        <p className="text-[11px] text-slate-400 mt-2">
          สร้างแล้วค่อยกด "แก้ไข" เพื่อตั้งวันปิดรับสมัคร จำนวนผู้เล่น สนาม และเงินรางวัล
        </p>
      </div>

      {/* ── รายการทั้งหมด ──────────────────────────────────── */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center gap-2">
          <Trophy className="w-5 h-5 text-indigo-600" />
          <h3 className="font-bold text-slate-800">รายการแข่งขันทั้งหมด</h3>
          <span className="text-xs text-slate-400">({tournaments.length})</span>
        </div>

        {sorted.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-400">ยังไม่มีรายการแข่งขัน</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {sorted.map(t => {
              const c = parseConfig(t.config);
              const st = STATUS[t.status] ?? { text: t.status, cls: 'bg-slate-100 text-slate-600' };
              return (
                <div key={t.id} className="p-4 flex flex-wrap items-center gap-3">
                  <div className="flex-1 min-w-[200px]">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-slate-800">{t.name}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${st.cls}`}>
                        {st.text}
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[11px] bg-slate-100 text-slate-600">
                        {t.type}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1 flex flex-wrap gap-x-3 gap-y-1">
                      <span>ผู้เล่น {c.playersPerTeam ?? 7} คน + สำรอง {c.maxSubs ?? 0}</span>
                      {c.maxTeams ? <span>เพดาน {c.maxTeams} ทีม</span> : null}
                      <span className={c.registrationEnabled === false ? 'text-rose-600 font-bold' : 'text-emerald-700'}>
                        {c.registrationEnabled === false ? 'ปิดรับสมัครด้วยตนเอง' : c.registrationDeadline
                          ? `รับสมัครถึง ${new Date(c.registrationDeadline).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })}`
                          : 'เปิดรับสมัคร ไม่กำหนดวันปิด'}
                      </span>
                      <span className={c.teamEditingEnabled === false ? 'text-rose-600 font-bold' : 'text-indigo-700'}>
                        {c.teamEditingEnabled === false ? 'ปิดแก้ไขข้อมูลทีมด้วยตนเอง' : c.teamEditDeadline
                          ? `แก้ไขข้อมูลถึง ${new Date(c.teamEditDeadline).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })}`
                          : 'เปิดแก้ไขข้อมูลทีม ไม่กำหนดวันปิด'}
                      </span>
                    </p>
                  </div>
                  <button onClick={() => openEdit(t)}
                    className="px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 text-sm font-bold
                               hover:bg-indigo-100 flex items-center gap-1.5">
                    <Pencil className="w-3.5 h-3.5" /> แก้ไข
                  </button>
                  <button onClick={() => { setDelId(t.id); setConfirmName(''); }}
                    title="ลบรายการนี้"
                    className="p-2 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── ฟอร์มแก้ไข ─────────────────────────────────────── */}
      {editId && form && (
        <div className="fixed inset-0 z-[1400] bg-black/60 backdrop-blur-sm modal-sheet
                        flex items-end md:items-center justify-center p-0 md:p-4"
          onClick={closeEdit}>
          <div className="bg-white w-full md:max-w-3xl rounded-2xl
                          max-h-[92vh] overflow-y-auto flex flex-col"
            onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b border-slate-200 px-4 py-3
                            flex items-center justify-between z-10">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <Trophy className="w-5 h-5 text-indigo-600" /> แก้ไขรายการแข่งขัน
              </h3>
              <button onClick={closeEdit} className="p-1.5 rounded-lg hover:bg-slate-100">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <div className="p-4 space-y-5">
              {/* ข้อมูลหลัก */}
              <section className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 border-b pb-1">
                  ข้อมูลหลัก
                </h4>
                <div>
                  <label className={lbl}>ชื่อรายการ</label>
                  <input className={inp} value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={lbl}>ประเภท</label>
                    <select className={inp} value={form.type}
                      onChange={e => setForm({ ...form, type: e.target.value as Tournament['type'] })}>
                      <option value="Penalty">ยิงจุดโทษ</option>
                      <option value="7v7">7 คน</option>
                      <option value="11v11">11 คน</option>
                    </select>
                  </div>
                  <div>
                    <label className={lbl}>สถานะ</label>
                    <select className={inp} value={form.status}
                      onChange={e => setForm({ ...form, status: e.target.value as Tournament['status'] })}>
                      <option value="Upcoming">กำลังจะแข่ง</option>
                      <option value="Active">กำลังแข่ง</option>
                      <option value="Archived">จบแล้ว</option>
                    </select>
                  </div>
                </div>

                {/* โลโก้และประกาศ ย้ายมาจากแท็บตั้งค่าระบบ
                    ทุกปีเปลี่ยนโลโก้และประกาศใหม่ ถ้าเก็บระดับระบบ พอเปิดดูรายการเก่า
                    จะเห็นโลโก้ของปีปัจจุบันติดอยู่ ซึ่งไม่ตรงกับความจริง */}
                <div>
                  <label className={lbl}>โลโก้รายการ</label>
                  <div className="flex items-center gap-3">
                    {cfg.competitionLogo
                      ? <img src={cfg.competitionLogo} alt=""
                          className="w-16 h-16 object-contain border border-slate-200 rounded-xl p-1 bg-white shrink-0" />
                      : <div className="w-16 h-16 rounded-xl bg-slate-100 border border-slate-200 shrink-0
                                        flex items-center justify-center text-[10px] text-slate-400">ยังไม่มี</div>}
                    <div className="flex-1 min-w-0">
                      <label className="inline-flex cursor-pointer">
                        <input type="file" accept="image/*" className="hidden"
                          onChange={async e => {
                            const f = e.target.files?.[0];
                            e.target.value = '';
                            if (!f) return;
                            const url = await uploadFile(f, 'logo', 'logo');
                            if (url) setC('competitionLogo', url);
                          }} />
                        <span className="px-3 py-1.5 rounded-lg border border-slate-300 bg-slate-50
                                         text-xs font-bold hover:bg-slate-100">
                          {cfg.competitionLogo ? 'เปลี่ยนรูป' : 'เลือกรูป'}
                        </span>
                      </label>
                      {cfg.competitionLogo && (
                        <button onClick={() => setC('competitionLogo', '' as any)}
                          className="ml-2 text-xs text-rose-600 font-bold hover:underline">เอาออก</button>
                      )}
                      {uploadPct.logo !== undefined && (
                        <div className="mt-2 h-1.5 rounded-full bg-slate-200 overflow-hidden">
                          <div className="h-full bg-indigo-600 transition-all duration-200"
                            style={{ width: `${uploadPct.logo}%` }} />
                        </div>
                      )}
                      <p className="text-[11px] text-slate-400 mt-1">ไม่ใส่ก็ได้ ระบบจะใช้โลโก้กลางแทน</p>
                    </div>
                  </div>
                </div>
                <div>
                  <label className={lbl}>ประกาศวิ่งหน้าแรก</label>
                  <textarea className={`${inp} h-20`} value={cfg.announcement ?? ''}
                    onChange={e => setC('announcement', e.target.value as any)}
                    placeholder="เช่น ปิดรับสมัคร 25 ส.ค. นี้|ประชุมผู้จัดการทีม 27 ส.ค." />
                  <p className="text-[11px] text-slate-400 mt-1">
                    ใส่หลายข้อความได้ คั่นด้วยเครื่องหมาย <code className="font-mono">|</code> ระบบจะสลับแสดงทีละอัน
                  </p>
                </div>
              </section>

              {/* รับสมัคร */}
              <section className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 border-b pb-1
                               flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" /> การรับสมัคร
                </h4>
                <label className={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition ${cfg.registrationEnabled !== false ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50'}`}>
                  <input type="checkbox" className="w-5 h-5 mt-0.5 accent-emerald-600" checked={cfg.registrationEnabled !== false}
                    onChange={e => setC('registrationEnabled', e.target.checked)} />
                  <span>
                    <span className="block text-sm font-bold text-slate-800">เปิดรับสมัครและแสดงปุ่ม “กรอกใบสมัครส่งทีม”</span>
                    <span className="block text-[11px] text-slate-500 mt-0.5">เมื่อปิด ผู้ใช้จะเห็นสถานะปิดรับสมัครและไม่สามารถส่งใบสมัครผ่าน API ได้</span>
                  </span>
                </label>
                <div>
                  <label className={lbl}>ปิดรับสมัคร (เว้นว่าง = ไม่จำกัด)</label>
                  <input type="datetime-local" className={inp}
                    value={toLocalInput(cfg.registrationDeadline)}
                    onChange={e => setC('registrationDeadline', e.target.value || undefined)} />
                </div>
                <label className={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition ${cfg.teamEditingEnabled !== false ? 'border-indigo-200 bg-indigo-50' : 'border-slate-200 bg-slate-50'}`}>
                  <input type="checkbox" className="w-5 h-5 mt-0.5 accent-indigo-600" checked={cfg.teamEditingEnabled !== false}
                    onChange={e => setC('teamEditingEnabled', e.target.checked)} />
                  <span>
                    <span className="block text-sm font-bold text-slate-800">เปิดกรอก/แก้ไขข้อมูลทีมและรายชื่อนักกีฬา</span>
                    <span className="block text-[11px] text-slate-500 mt-0.5">เมื่อปิด ปุ่มแก้ไขจะถูกแทนด้วยสถานะปิด และโรงเรียนบันทึกข้อมูลเพิ่มไม่ได้</span>
                  </span>
                </label>
                <div>
                  <label className={lbl}>ปิดแก้ไขข้อมูลทีมและรายชื่อนักกีฬา (เว้นว่าง = ไม่จำกัด)</label>
                  <input type="datetime-local" className={inp}
                    value={toLocalInput(cfg.teamEditDeadline)}
                    onChange={e => setC('teamEditDeadline', e.target.value || undefined)} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={lbl}>เพดานจำนวนทีม</label>
                    <input type="number" min={0} className={inp} placeholder="ไม่จำกัด"
                      value={cfg.maxTeams ?? ''}
                      onChange={e => setC('maxTeams', e.target.value === '' ? undefined : Number(e.target.value))} />
                  </div>
                  <div>
                    <label className={lbl}>ส่งได้กี่ทีมต่อโรงเรียน</label>
                    <input type="number" min={1} className={inp}
                      value={(cfg as any).maxTeamsPerSchool ?? 1}
                      onChange={e => setC('maxTeamsPerSchool' as any, Math.max(1, Number(e.target.value)) as any)} />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className={lbl}>ผู้เล่นต่อทีม</label>
                    <input type="number" min={1} className={inp} value={cfg.playersPerTeam ?? 7}
                      onChange={e => setC('playersPerTeam', Math.max(1, Number(e.target.value)))} />
                  </div>
                  <div>
                    <label className={lbl}>สำรองสูงสุด</label>
                    <input type="number" min={0} className={inp} value={cfg.maxSubs ?? 0}
                      onChange={e => setC('maxSubs', Math.max(0, Number(e.target.value)))} />
                  </div>
                  <div>
                    <label className={lbl}>ครึ่งละ (นาที)</label>
                    <input type="number" min={0} className={inp} placeholder="—"
                      value={cfg.halfTimeDuration ?? ''}
                      onChange={e => setC('halfTimeDuration', e.target.value === '' ? undefined : Number(e.target.value))} />
                  </div>
                </div>

                {/* ── เอกสารรับรองของทีม (db/20) ─────────────────────────
                    แต่ละงานขอไม่เหมือนกัน — เดิมช่องอัปโหลดขึ้นให้ทุกโรงเรียนเสมอ
                    ครูจึงต้องไปถามในไลน์กลุ่มทุกปีว่าต้องส่งเอกสารไหม */}
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-3">
                  <label className={lbl}>เอกสารรับรองของทีม (หน้าโรงเรียน)</label>
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      ['Off', 'ไม่รับ', 'ซ่อนช่องอัปโหลด'],
                      ['Optional', 'รับ ไม่บังคับ', 'แนบหรือไม่ก็ได้'],
                      ['Required', 'ต้องแนบ', 'ไม่แนบ = ส่งรายชื่อไม่ได้'],
                    ] as const).map(([value, label, hint]) => (
                      <button key={value} type="button" onClick={() => setC('docMode', value)}
                        className={`min-h-16 rounded-xl border-2 px-2 py-1.5 text-center transition
                          ${(cfg.docMode ?? 'Optional') === value
                            ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                            : 'border-slate-200 bg-white text-slate-500'}`}>
                        <span className="block text-xs font-black">{label}</span>
                        <span className="block text-[10px] leading-tight mt-0.5 opacity-80">{hint}</span>
                      </button>
                    ))}
                  </div>

                  {(cfg.docMode ?? 'Optional') !== 'Off' && (
                    <div>
                      <label className={lbl}>ไฟล์ตัวอย่าง / แบบฟอร์มให้ดาวน์โหลด</label>
                      <div className="flex items-center gap-2 flex-wrap">
                        <label className="cursor-pointer bg-white border border-slate-300 px-3 py-2 rounded-lg text-xs font-bold hover:bg-slate-100 flex items-center gap-1.5">
                          <Upload className="w-3.5 h-3.5 text-indigo-600" />
                          {cfg.docTemplateUrl ? 'เปลี่ยนไฟล์' : 'อัปโหลดไฟล์'}
                          <input type="file" accept="image/*,application/pdf,.doc,.docx" className="hidden"
                            onChange={async e => {
                              const f = e.target.files?.[0];
                              if (!f) return;
                              const url = await uploadFile(f, 'doc', 'doctpl');
                              if (url) setC('docTemplateUrl', url);
                            }} />
                        </label>
                        {cfg.docTemplateUrl && (
                          <>
                            <a href={cfg.docTemplateUrl} target="_blank" rel="noreferrer"
                              className="px-3 py-2 rounded-lg bg-indigo-50 text-indigo-700 text-xs font-bold">
                              เปิดดูไฟล์
                            </a>
                            <button type="button" onClick={() => setC('docTemplateUrl', '')}
                              className="px-3 py-2 rounded-lg bg-rose-50 text-rose-600 text-xs font-bold">
                              เอาออก
                            </button>
                          </>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1.5">
                        โรงเรียนจะเห็นปุ่มดาวน์โหลดไฟล์นี้ในหน้าส่งรายชื่อ — ว่างไว้ได้ถ้าไม่มีแบบฟอร์ม
                      </p>
                    </div>
                  )}
                </div>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" className="w-4 h-4" checked={!!cfg.extraTime}
                    onChange={e => setC('extraTime', e.target.checked)} />
                  มีต่อเวลาพิเศษ
                </label>
                <p className="text-[11px] text-slate-400 flex items-start gap-1">
                  <Users className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  จำนวนผู้เล่นมีผลกับหน้าโรงเรียนทันที — ระบบจะเตรียมช่องกรอกให้ครบตามนี้
                </p>
              </section>

              {/* การเงิน */}
              <section className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 border-b pb-1
                               flex items-center gap-1.5">
                  <Banknote className="w-3.5 h-3.5" /> ค่าสมัครและบัญชีรับเงิน
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={lbl}>ค่าสมัคร (บาท)</label>
                    <input type="number" min={0} className={inp} value={cfg.registrationFee ?? 0}
                      onChange={e => setC('registrationFee', Number(e.target.value) || 0)} />
                  </div>
                  <div>
                    <label className={lbl}>ธนาคาร</label>
                    <input className={inp} value={cfg.bankName ?? ''}
                      onChange={e => setC('bankName', e.target.value)} />
                  </div>
                  <div>
                    <label className={lbl}>เลขบัญชี</label>
                    <input className={inp} value={cfg.bankAccount ?? ''}
                      onChange={e => setC('bankAccount', e.target.value)} />
                  </div>
                  <div>
                    <label className={lbl}>ชื่อบัญชี</label>
                    <input className={inp} value={cfg.accountName ?? ''}
                      onChange={e => setC('accountName', e.target.value)} />
                  </div>
                </div>
              </section>

              {/* สนาม */}
              <section className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 border-b pb-1
                               flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5" /> สนามแข่งขัน
                </h4>
                <div>
                  <label className={lbl}>ชื่อสนาม</label>
                  <input className={inp} value={cfg.locationName ?? ''}
                    onChange={e => setC('locationName', e.target.value)} />
                </div>
                <div>
                  <label className={lbl}>ลิงก์ Google Maps</label>
                  <input className={`${inp} text-xs`} value={cfg.locationLink ?? ''}
                    onChange={e => setC('locationLink', e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={lbl}>ละติจูด</label>
                    <input className={inp} value={cfg.locationLat ?? ''}
                      onChange={e => setC('locationLat', e.target.value === '' ? undefined : Number(e.target.value))} />
                  </div>
                  <div>
                    <label className={lbl}>ลองจิจูด</label>
                    <input className={inp} value={cfg.locationLng ?? ''}
                      onChange={e => setC('locationLng', e.target.value === '' ? undefined : Number(e.target.value))} />
                  </div>
                </div>
              </section>

              {/* เงินรางวัล */}
              <section className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 border-b pb-1
                               flex items-center gap-1.5">
                  <Award className="w-3.5 h-3.5" /> เงินรางวัล
                </h4>
                {(cfg.prizes ?? []).map((p: any, i: number) => (
                  <div key={i} className="flex gap-2">
                    <input className={`${inp} w-28`} placeholder="ชนะเลิศ"
                      value={p.rankLabel ?? ''} onChange={e => setPrize(i, 'rankLabel', e.target.value)} />
                    <input className={`${inp} w-28`} placeholder="5,000"
                      value={p.amount ?? ''} onChange={e => setPrize(i, 'amount', e.target.value)} />
                    <input className={`${inp} flex-1`} placeholder="รายละเอียด (ไม่บังคับ)"
                      value={p.description ?? ''} onChange={e => setPrize(i, 'description', e.target.value)} />
                    <button onClick={() => setC('prizes',
                      (cfg.prizes ?? []).filter((_: any, j: number) => j !== i) as any)}
                      className="p-2 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 shrink-0">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                <button onClick={() => setC('prizes',
                  [...(cfg.prizes ?? []), { rankLabel: '', amount: '', description: '' }] as any)}
                  className="text-sm text-indigo-600 font-bold flex items-center gap-1 hover:underline">
                  <Plus className="w-4 h-4" /> เพิ่มรางวัล
                </button>
              </section>

              {/* โครงการระดมทุน */}
              <section className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 border-b pb-1
                               flex items-center gap-1.5">
                  <Target className="w-3.5 h-3.5" /> โครงการระดมทุน
                </h4>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" className="w-4 h-4" checked={!!cfg.objective?.isEnabled}
                    onChange={e => setC('objective', {
                      ...(cfg.objective ?? { title: '', description: '', goal: 0, images: [] }),
                      isEnabled: e.target.checked,
                    } as any)} />
                  เปิดรับบริจาคสำหรับรายการนี้
                </label>
                {cfg.objective?.isEnabled && (
                  <div className="space-y-3 pl-6">
                    {/* เอกสารโครงการ — ไฟล์เดียว เปลี่ยนทับได้ */}
                    <div>
                      <label className={lbl}>เอกสารโครงการ (PDF หรือรูป)</label>
                      {cfg.objective?.docUrl ? (
                        <div className="flex items-center gap-2 rounded-xl border border-slate-200 p-2">
                          <FileText className="w-5 h-5 text-indigo-600 shrink-0" />
                          <a href={cfg.objective.docUrl} target="_blank" rel="noreferrer"
                            className="text-xs text-indigo-600 underline flex-1 truncate">
                            เปิดดูเอกสารที่แนบไว้
                          </a>
                          <button
                            onClick={() => setC('objective',
                              { ...(cfg.objective as any), docUrl: '' } as any)}
                            title="เอาไฟล์ออก"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50">
                            <XIcon className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <label className="block cursor-pointer">
                          <input type="file" accept="image/*,application/pdf" className="hidden"
                            onChange={async e => {
                              const f = e.target.files?.[0];
                              e.target.value = '';
                              if (!f) return;
                              const url = await uploadFile(f, 'doc', 'objdoc');
                              if (url) setC('objective', { ...(cfg.objective as any), docUrl: url } as any);
                            }} />
                          <div className="rounded-xl border-2 border-dashed border-slate-300 p-3
                                          flex items-center gap-2 text-slate-500 hover:border-indigo-300">
                            <Upload className="w-4 h-4" />
                            <span className="text-xs">แตะเพื่อเลือกไฟล์ (ไม่เกิน 8 MB)</span>
                          </div>
                        </label>
                      )}
                      {uploadPct.objdoc !== undefined && (
                        <div className="mt-2">
                          <div className="h-1.5 rounded-full bg-slate-200 overflow-hidden">
                            <div className="h-full bg-indigo-600 transition-all duration-200"
                              style={{ width: `${uploadPct.objdoc}%` }} />
                          </div>
                          <p className="text-[11px] text-slate-500 mt-1">
                            กำลังอัปโหลด {uploadPct.objdoc}%
                          </p>
                        </div>
                      )}
                    </div>

                    {/* รูปประกอบโครงการ — หลายรูปได้ */}
                    {/* รูปโครงการแยก 3 กลุ่ม — ก่อน / หลัง / ทั่วไป
                        โครงการระดมทุนต้องโชว์ให้ผู้บริจาคเห็นว่าเงินไปทำอะไร
                        รูป "ก่อน" คู่กับ "หลัง" คือหลักฐานที่มีน้ำหนักที่สุด
                        เดิมอัปได้กองเดียวไม่มีที่ระบุ ทำให้หน้าเว็บเรียงเป็นก่อน/หลังไม่ได้
                        ชนิดของรูปมีใน ProjectImage อยู่แล้ว แค่ไม่เคยมี UI ให้เลือก */}
                    <div className="space-y-3">
                      <label className={lbl}>รูปภาพโครงการ</label>
                      {IMAGE_GROUPS.map(g => {
                        const rows = ((cfg.objective?.images ?? []) as ProjectImage[])
                          .map((im, i) => ({ im, i }))
                          .filter(r => (r.im.type ?? 'general') === g.key);
                        return (
                          <div key={g.key} className={`rounded-xl border p-3 ${g.box}`}>
                            <div className="flex items-center justify-between gap-2 mb-2">
                              <div className="min-w-0">
                                <p className={`text-xs font-black ${g.text}`}>{g.label}</p>
                                <p className="text-[11px] text-slate-500">{g.hint}</p>
                              </div>
                              <span className="text-[11px] text-slate-400 shrink-0">{rows.length} รูป</span>
                            </div>
                            <div className="grid grid-cols-4 gap-2">
                              {rows.map(({ im, i }) => (
                                <div key={im.id ?? i} className="space-y-1">
                                  <div className="relative aspect-square rounded-lg overflow-hidden border border-slate-200 bg-white">
                                    <img src={im.url} className="w-full h-full object-cover" alt={im.caption ?? ''} />
                                    <button
                                      onClick={() => setImages(prev => prev.filter((_, j) => j !== i))}
                                      title="ลบรูปนี้"
                                      className="absolute top-1 right-1 p-1 rounded-full bg-black/60 text-white">
                                      <XIcon className="w-3 h-3" />
                                    </button>
                                  </div>
                                  {/* ย้ายกลุ่มได้ทีหลัง — เลือกผิดตอนอัปเป็นเรื่องปกติ
                                      ถ้าไม่มีตรงนี้ต้องลบแล้วอัปใหม่ */}
                                  <select
                                    value={im.type ?? 'general'}
                                    onChange={e => setImages(prev => prev.map((x, j) =>
                                      j === i ? { ...x, type: e.target.value as ProjectImage['type'] } : x))}
                                    className="w-full text-[10px] border border-slate-200 rounded-md px-1 py-0.5 bg-white">
                                    {IMAGE_GROUPS.map(o => (
                                      <option key={o.key} value={o.key}>{o.short}</option>
                                    ))}
                                  </select>
                                  <input
                                    value={im.caption ?? ''}
                                    onChange={e => setImages(prev => prev.map((x, j) =>
                                      j === i ? { ...x, caption: e.target.value } : x))}
                                    placeholder="คำบรรยาย"
                                    className="w-full text-[10px] border border-slate-200 rounded-md px-1 py-0.5" />
                                </div>
                              ))}
                              <label className="aspect-square cursor-pointer">
                                <input type="file" accept="image/*" multiple className="hidden"
                                  onChange={async e => {
                                    const files: File[] = Array.from(e.target.files ?? []);
                                    e.target.value = '';
                                    // อัปทีละไฟล์ ไม่ยิงพร้อมกัน — shared hosting รับพร้อมกันหลายไฟล์ไม่ไหว
                                    for (let i = 0; i < files.length; i++) {
                                      const url = await uploadFile(files[i], 'objective', `objimg_${g.key}`);
                                      if (!url) continue;
                                      setImages(prev => [...prev, {
                                        id: `${g.key}_${prev.length}_${url.slice(-12)}`,
                                        url, type: g.key, caption: '',
                                      }]);
                                    }
                                  }} />
                                <div className="w-full h-full rounded-lg border-2 border-dashed border-slate-300
                                                flex flex-col items-center justify-center gap-1 text-slate-400
                                                hover:border-indigo-300 bg-white/60">
                                  <ImageIcon className="w-5 h-5" />
                                  <span className="text-[10px]">เพิ่มรูป</span>
                                </div>
                              </label>
                            </div>
                            {uploadPct[`objimg_${g.key}`] !== undefined && (
                              <div className="mt-2">
                                <div className="h-1.5 rounded-full bg-slate-200 overflow-hidden">
                                  <div className="h-full bg-indigo-600 transition-all duration-200"
                                    style={{ width: `${uploadPct[`objimg_${g.key}`]}%` }} />
                                </div>
                                <p className="text-[11px] text-slate-500 mt-1">
                                  กำลังอัปโหลด {uploadPct[`objimg_${g.key}`]}%
                                </p>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    <div>
                      <label className={lbl}>ชื่อโครงการ</label>
                      <input className={inp} value={cfg.objective?.title ?? ''}
                        onChange={e => setC('objective', { ...(cfg.objective as any), title: e.target.value } as any)} />
                    </div>
                    <div>
                      <label className={lbl}>รายละเอียด</label>
                      <textarea className={`${inp} h-20`} value={cfg.objective?.description ?? ''}
                        onChange={e => setC('objective', { ...(cfg.objective as any), description: e.target.value } as any)} />
                    </div>
                    <div>
                      <label className={lbl}>เป้าหมาย (บาท)</label>
                      <input type="number" min={0} className={inp} value={cfg.objective?.goal ?? 0}
                        onChange={e => setC('objective', { ...(cfg.objective as any), goal: Number(e.target.value) || 0 } as any)} />
                    </div>
                  </div>
                )}
              </section>
            </div>

            <div className="sticky bottom-0 bg-white border-t border-slate-200 p-3 flex gap-2 safe-area-bottom">
              <button onClick={closeEdit}
                className="flex-1 py-2.5 rounded-lg border border-slate-300 text-slate-700 font-bold text-sm">
                ยกเลิก
              </button>
              <button onClick={doSave} disabled={busy === 'save'}
                className="flex-[2] py-2.5 rounded-lg bg-indigo-600 text-white font-bold text-sm
                           hover:bg-indigo-700 disabled:opacity-40 flex items-center justify-center gap-2">
                {busy === 'save' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                บันทึก
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── ยืนยันการลบ ────────────────────────────────────── */}
      {delId && delTarget && (
        <div className="fixed inset-0 z-[1500] bg-black/60 backdrop-blur-sm modal-sheet
                        flex items-end md:items-center justify-center p-0 md:p-4"
          onClick={() => setDelId(null)}>
          <div className="bg-white w-full md:max-w-md rounded-2xl p-4 space-y-3"
            onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-rose-700 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" /> ลบรายการแข่งขัน
            </h3>
            <p className="text-sm text-slate-600">
              ทีม ผู้เล่น นัดแข่ง และผลการแข่งของ <b>{delTarget.name}</b> จะหายทั้งหมด
              กู้คืนไม่ได้
            </p>

            <div className="bg-rose-50 border border-rose-100 rounded-xl p-3 space-y-1">
              <p className="text-xs font-bold text-rose-800">สิ่งที่จะถูกลบไปด้วย</p>
              <ul className="text-xs text-rose-700 space-y-0.5">
                <li>· ทีมในรายการนี้ {delImpact.teams} ทีม (พร้อมรายชื่อนักกีฬาทั้งหมด)</li>
                <li>· นัดแข่ง {delImpact.matches} นัด
                  {delImpact.played > 0 && ` — ในนั้นแข่งไปแล้ว ${delImpact.played} นัด`}</li>
                <li>· ลูกจุดโทษ เหตุการณ์ในเกม ตารางคะแนน สาย ข่าว ผู้สนับสนุน และรหัสเข้าใช้งานของรายการนี้</li>
              </ul>
              <p className="text-[11px] text-rose-600 pt-1">
                ข้อมูลโรงเรียนและยอดบริจาคยังอยู่ในระบบ (บริจาคจะถูกตัดความเชื่อมโยงกับรายการนี้)
              </p>
            </div>
            <div>
              <label className={lbl}>พิมพ์ชื่อรายการให้ตรงเพื่อยืนยัน</label>
              <input className={inp} placeholder={delTarget.name}
                value={confirmName} onChange={e => setConfirmName(e.target.value)} />
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setDelId(null)}
                className="flex-1 py-2.5 rounded-lg border border-slate-300 text-slate-700 font-bold text-sm">
                ยกเลิก
              </button>
              <button onClick={doDelete}
                disabled={busy === 'del' || confirmName.trim() !== delTarget.name}
                className="flex-1 py-2.5 rounded-lg bg-rose-600 text-white font-bold text-sm
                           hover:bg-rose-700 disabled:opacity-40 flex items-center justify-center gap-2">
                {busy === 'del' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                ลบถาวร
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminTournaments;
