import React, { useEffect, useRef, useState } from 'react';
import {
  KeyRound, Loader2, LogOut, Plus, Trash2, Save, Send, CheckCircle2,
  AlertTriangle, ChevronLeft, Users, ShieldQuestion, Clock, XCircle, Info,
  Camera, Upload, FileText,
} from 'lucide-react';
import { apiGet, apiPost, apiUpload, ApiError, setToken, clearToken, getToken } from '../services/apiConfig';
import { confirmAction } from '../services/uiService';

/**
 * หน้าสำหรับโรงเรียน — ใส่รหัส 8 ตัว แล้วยืนยัน/แก้ไขข้อมูลทีมของตัวเอง
 *
 * ออกแบบมาให้ใช้บนมือถือเป็นหลัก เพราะครูส่วนใหญ่กรอกจากมือถือ และงานจริง
 * ของฤดูนี้คือ 28 จาก 30 ทีม "ไม่มีรายชื่อผู้เล่นเลย" ต้องพิมพ์ใหม่ทั้งหมด
 * ทุกอย่างจึงเน้นให้กรอกจบเร็วที่สุด:
 *   - ช่องกรอกใหญ่พอกดด้วยนิ้ว ไม่ต้องซูม
 *   - Enter ที่ช่องชื่อ = ไปคนถัดไปทันที ไม่ต้องยกมือไปแตะ
 *   - รูปนักกีฬาไม่บังคับ (ของเดิมมีรูปแค่ครึ่งเดียว ถ้าบังคับจะกรอกไม่จบ)
 *   - บันทึกร่างอัตโนมัติ เน็ตหลุดกลางคันแล้วกลับมากรอกต่อได้
 */

interface Props {
  onExit: () => void;
  notify: (title: string, msg?: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
}

interface PlayerRow {
  name: string;
  number: string;
  birthDate: string;
  photoUrl: string;
}

interface TeamData {
  id: string;
  name: string;
  shortName: string;
  logoUrl: string;
  docUrl: string;
  slipUrl: string;
  status: string;
  rejectReason: string;
  managerName: string;
  managerPhone: string;
  coachName: string;
  coachPhone: string;
  directorName: string;
  rowVersion: number;
  players: PlayerRow[];
}

interface TournamentInfo {
  id: string;
  name: string;
  registrationDeadline: string | null;
  teamEditDeadline?: string | null;
  isOpen: boolean;
  playersPerTeam: number;
  maxSubs: number;
}

interface TournamentOption {
  id: string;
  name: string;
  status: string;
  teamCount: number;
}

const DRAFT_KEY = 'kickoff_school_draft';

const STATUS_LABEL: Record<string, { text: string; cls: string; icon: React.ReactNode }> = {
  Invited:   { text: 'รอยืนยันการเข้าร่วม', cls: 'bg-amber-100 text-amber-800', icon: <ShieldQuestion className="w-3.5 h-3.5" /> },
  Draft:     { text: 'กำลังกรอก (ยังไม่ส่ง)', cls: 'bg-sky-100 text-sky-800', icon: <Clock className="w-3.5 h-3.5" /> },
  Submitted: { text: 'ส่งแล้ว รอตรวจ', cls: 'bg-indigo-100 text-indigo-800', icon: <Send className="w-3.5 h-3.5" /> },
  Approved:  { text: 'อนุมัติแล้ว', cls: 'bg-emerald-100 text-emerald-800', icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
  Rejected:  { text: 'ถูกตีกลับให้แก้ไข', cls: 'bg-rose-100 text-rose-800', icon: <XCircle className="w-3.5 h-3.5" /> },
  Withdrawn: { text: 'ไม่เข้าร่วมปีนี้', cls: 'bg-slate-200 text-slate-600', icon: <XCircle className="w-3.5 h-3.5" /> },
};

const SchoolPortal: React.FC<Props> = ({ onExit, notify }) => {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [schoolName, setSchoolName] = useState('');
  const [tournament, setTournament] = useState<TournamentInfo | null>(null);
  const [teams, setTeams] = useState<TeamData[]>([]);
  const [editing, setEditing] = useState<TeamData | null>(null);
  const [dirty, setDirty] = useState(false);
  const nameRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [options, setOptions] = useState<TournamentOption[]>([]);
  const [uploading, setUploading] = useState<string | null>(null);
  // เก็บรหัสไว้เพื่อสลับรายการแข่งขันได้โดยไม่ต้องพิมพ์ใหม่
  const [lastCode, setLastCode] = useState('');

  // ── ร่างอัตโนมัติ — เน็ตหลุด/ปิดแท็บแล้วกลับมากรอกต่อได้ ────────────────
  useEffect(() => {
    if (!editing || !dirty) return;
    const t = setTimeout(() => {
      try { localStorage.setItem(DRAFT_KEY, JSON.stringify(editing)); } catch {}
    }, 800);
    return () => clearTimeout(t);
  }, [editing, dirty]);

  const loadTeams = async () => {
    const r = await apiGet('myTeams');
    setSchoolName(prev => prev || r.schoolName || '');
    setTournament(r.tournament);
    setTeams(r.teams);
    return r;
  };

  const doLogin = async () => {
    const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (clean.length !== 8) { notify('รหัสไม่ครบ', 'รหัสมี 8 ตัวอักษร', 'warning'); return; }
    setBusy('login');
    try {
      const r = await apiPost('teamLogin', { accessCode: clean });
      setToken(r.token);
      setSchoolName(r.schoolName);
      setOptions(r.availableTournaments ?? []);
      setLastCode(clean);
      await loadTeams();
      notify('เข้าสู่ระบบแล้ว', r.schoolName, 'success');
    } catch (e) {
      const err = e as ApiError;
      notify(err.status === 429 ? 'ลองมากเกินไป' : 'เข้าไม่ได้', err.message, 'error');
    } finally { setBusy(null); }
  };

  /** สลับไปดูทีมในอีกรายการแข่งขัน — session ผูกรายการเดียว จึงต้องออก token ใหม่ */
  const switchTournament = async (tournamentId: string) => {
    if (!lastCode) { notify('สลับไม่ได้', 'กรุณาเข้าสู่ระบบใหม่', 'warning'); return; }
    setBusy('switch');
    try {
      const r = await apiPost('teamLogin', { accessCode: lastCode, tournamentId });
      setToken(r.token);
      setOptions(r.availableTournaments ?? []);
      await loadTeams();
    } catch (e) {
      notify('สลับรายการไม่สำเร็จ', (e as ApiError).message, 'error');
    } finally { setBusy(null); }
  };

  /** อัปโหลดไฟล์แล้วคืน URL — ใช้ทั้งรูปนักกีฬา โลโก้ และเอกสาร */
  const upload = async (file: File, kind: 'player' | 'logo' | 'doc' | 'slip', key: string) => {
    setUploading(key);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('kind', kind);
      const r = await apiUpload('uploadFile', fd);
      return r.url as string;
    } catch (e) {
      notify('อัปโหลดไม่สำเร็จ', (e as ApiError).message, 'error');
      return null;
    } finally { setUploading(null); }
  };

  const doLogout = () => {
    clearToken();
    localStorage.removeItem(DRAFT_KEY);
    setTeams([]); setEditing(null); setSchoolName(''); setCode('');
  };

  const openTeam = async (t: TeamData) => {
    let data = { ...t, players: [...t.players] };
    try {
      const draft = localStorage.getItem(DRAFT_KEY);
      if (draft) {
        const d = JSON.parse(draft) as TeamData;
        if (d.id === t.id && await confirmAction('พบข้อมูลที่กรอกค้างไว้ในอุปกรณ์นี้', { title: 'กรอกต่อจากเดิมไหม?', confirmText: 'กรอกต่อ' })) {
          data = d;
        }
      }
    } catch {}
    // เตรียมช่องว่างให้ครบจำนวนที่กำหนด จะได้กรอกรวดเดียวไม่ต้องกดเพิ่มทีละคน
    const want = (tournament?.playersPerTeam ?? 7) + (tournament?.maxSubs ?? 0);
    while (data.players.length < want) {
      data.players.push({ name: '', number: '', birthDate: '', photoUrl: '' });
    }
    setEditing(data);
    setDirty(false);
  };

  const setPlayer = (i: number, field: keyof PlayerRow, value: string) => {
    if (!editing) return;
    const players = [...editing.players];
    players[i] = { ...players[i], [field]: value };
    setEditing({ ...editing, players });
    setDirty(true);
  };

  const save = async (thenSubmit = false) => {
    if (!editing) return;
    const players = editing.players
      .filter(p => p.name.trim() !== '')
      .map(p => ({
        name: p.name.trim(), number: p.number.trim(),
        birthDate: p.birthDate, photoUrl: p.photoUrl || '',
      }));

    if (thenSubmit && players.length === 0) {
      notify('ยังส่งไม่ได้', 'ต้องกรอกรายชื่อผู้เล่นอย่างน้อย 1 คน', 'warning');
      return;
    }
    setBusy('save');
    try {
      await apiPost('saveTeam', {
        teamId: editing.id,
        name: editing.name,
        shortName: editing.shortName,
        managerName: editing.managerName,
        managerPhone: editing.managerPhone,
        coachName: editing.coachName,
        coachPhone: editing.coachPhone,
        directorName: editing.directorName,
        logoUrl: editing.logoUrl || '',
        docUrl: editing.docUrl || '',
        slipUrl: editing.slipUrl || '',
        rowVersion: editing.rowVersion,
        players,
      });
      if (thenSubmit) {
        await apiPost('submitTeam', { teamId: editing.id });
        notify('ส่งข้อมูลแล้ว', 'รอผู้ดูแลตรวจสอบและอนุมัติ', 'success');
      } else {
        notify('บันทึกแล้ว', `รายชื่อ ${players.length} คน`, 'success');
      }
      localStorage.removeItem(DRAFT_KEY);
      setDirty(false);
      await loadTeams();
      setEditing(null);
    } catch (e) {
      const err = e as ApiError;
      // 409 = มีคนอื่นแก้ไปก่อน ต้องโหลดใหม่ ไม่ใช่เขียนทับ
      notify(err.status === 409 ? 'ข้อมูลถูกแก้ไปแล้ว' : 'บันทึกไม่สำเร็จ', err.message, 'error');
      if (err.status === 409) { await loadTeams(); setEditing(null); }
    } finally { setBusy(null); }
  };

  const withdraw = async (teamId: string) => {
    if (!await confirmAction('ทีมนี้จะถูกถอนออกจากรายการแข่งขันปีนี้', { title: 'ยืนยันไม่ส่งทีม?', dangerous: true, confirmText: 'ยืนยันการถอนทีม' })) return;
    setBusy('wd');
    try {
      await apiPost('submitTeam', { teamId, withdraw: true });
      notify('บันทึกแล้ว', 'แจ้งไม่เข้าร่วมเรียบร้อย', 'info');
      await loadTeams();
    } catch (e) {
      notify('ทำรายการไม่สำเร็จ', (e as ApiError).message, 'error');
    } finally { setBusy(null); }
  };

  const inp = 'w-full px-3 py-2.5 border border-slate-300 rounded-xl text-base focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 outline-none';

  // ── ยังไม่ได้เข้าสู่ระบบ ────────────────────────────────────────────────
  if (!teams.length && !schoolName) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-5">
        <div className="w-full max-w-sm">
          <button onClick={onExit}
            className="text-slate-500 text-sm flex items-center gap-1 mb-6 hover:text-slate-700">
            <ChevronLeft className="w-4 h-4" /> กลับหน้าหลัก
          </button>
          <div className="bg-white rounded-3xl shadow-lg border border-slate-200 p-7">
            <div className="w-14 h-14 rounded-2xl bg-indigo-600 text-white flex items-center justify-center mb-5">
              <KeyRound className="w-7 h-7" />
            </div>
            <h1 className="text-xl font-bold text-slate-800">สำหรับโรงเรียน</h1>
            <p className="text-sm text-slate-500 mt-1 leading-relaxed">
              ใส่รหัส 8 ตัวที่ได้รับจากผู้จัดการแข่งขัน เพื่อยืนยันการเข้าร่วมและกรอกรายชื่อนักกีฬา
            </p>

            <input
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && doLogin()}
              placeholder="ABCD2345"
              autoCapitalize="characters"
              autoComplete="off"
              maxLength={12}
              className="w-full mt-5 px-4 py-4 border-2 border-slate-300 rounded-2xl text-center text-2xl font-mono font-bold tracking-[0.3em] focus:ring-2 focus:ring-indigo-400 focus:border-indigo-500 outline-none"
            />
            <button onClick={doLogin} disabled={busy === 'login'}
              className="w-full mt-4 py-3.5 bg-indigo-600 text-white rounded-2xl font-bold text-base hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2">
              {busy === 'login' ? <Loader2 className="w-5 h-5 animate-spin" /> : <KeyRound className="w-5 h-5" />}
              เข้าสู่ระบบ
            </button>
            <p className="text-xs text-slate-400 mt-4 text-center leading-relaxed">
              ลืมรหัส? ติดต่อผู้จัดการแข่งขันเพื่อขอรหัสใหม่<br />รหัสเดิมจะใช้ไม่ได้ทันทีเมื่อออกรหัสใหม่
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── กำลังแก้ไขทีม ───────────────────────────────────────────────────────
  if (editing) {
    const limit = (tournament?.playersPerTeam ?? 7) + (tournament?.maxSubs ?? 0);
    const filled = editing.players.filter(p => p.name.trim()).length;
    return (
      <div className="min-h-screen bg-slate-50 pb-32">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3 z-20">
          <button onClick={async () => { if (!dirty || await confirmAction('ข้อมูลที่แก้ไขจะไม่ถูกบันทึก', { title: 'ออกจากหน้านี้?', dangerous: true, confirmText: 'ออกโดยไม่บันทึก' })) setEditing(null); }}
            className="p-1.5 -ml-1.5 rounded-lg hover:bg-slate-100">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-slate-800 truncate text-sm">{editing.name}</p>
            <p className="text-[11px] text-slate-500">
              กรอกแล้ว {filled}/{limit} คน{dirty && ' · ยังไม่บันทึก'}
            </p>
          </div>
        </div>

        <div className="p-4 space-y-4 max-w-lg mx-auto">
          {editing.status === 'Rejected' && editing.rejectReason && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 flex gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-rose-800">ผู้ดูแลขอให้แก้ไข</p>
                <p className="text-xs text-rose-700 mt-0.5">{editing.rejectReason}</p>
              </div>
            </div>
          )}

          <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
            <h2 className="font-bold text-slate-800 text-sm">ข้อมูลทีม</h2>
            <div>
              <label className="text-xs text-slate-500">ชื่อทีม</label>
              <input className={inp} value={editing.name}
                onChange={e => { setEditing({ ...editing, name: e.target.value }); setDirty(true); }} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-500">ผู้จัดการทีม</label>
                <input className={inp} value={editing.managerName}
                  onChange={e => { setEditing({ ...editing, managerName: e.target.value }); setDirty(true); }} />
              </div>
              <div>
                <label className="text-xs text-slate-500">เบอร์ผู้จัดการ</label>
                <input className={inp} type="tel" inputMode="numeric" value={editing.managerPhone}
                  onChange={e => { setEditing({ ...editing, managerPhone: e.target.value }); setDirty(true); }} />
              </div>
              <div>
                <label className="text-xs text-slate-500">ผู้ฝึกสอน</label>
                <input className={inp} value={editing.coachName}
                  onChange={e => { setEditing({ ...editing, coachName: e.target.value }); setDirty(true); }} />
              </div>
              <div>
                <label className="text-xs text-slate-500">เบอร์ผู้ฝึกสอน</label>
                <input className={inp} type="tel" inputMode="numeric" value={editing.coachPhone}
                  onChange={e => { setEditing({ ...editing, coachPhone: e.target.value }); setDirty(true); }} />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
            <h2 className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
              <FileText className="w-4 h-4" /> โลโก้และเอกสารหลักฐาน
            </h2>
            <div className="grid grid-cols-3 gap-2">
              {([
                { key: 'logo', label: 'โลโก้ทีม', field: 'logoUrl' as const, accept: 'image/*' },
                { key: 'doc',  label: 'เอกสารรับรอง', field: 'docUrl' as const, accept: 'image/*,application/pdf' },
                { key: 'slip', label: 'หลักฐานโอนเงิน', field: 'slipUrl' as const, accept: 'image/*,application/pdf' },
              ]).map(f => {
                const val = (editing as any)[f.field] as string;
                return (
                  <label key={f.key} className="cursor-pointer">
                    <input type="file" accept={f.accept} className="hidden"
                      onChange={async e => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const url = await upload(file, f.key as any, f.key);
                        if (url) { setEditing({ ...editing, [f.field]: url } as TeamData); setDirty(true); }
                      }} />
                    <div className="aspect-square rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 flex flex-col items-center justify-center gap-1 overflow-hidden">
                      {uploading === f.key ? (
                        <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                      ) : val ? (
                        val.toLowerCase().endsWith('.pdf')
                          ? <><FileText className="w-6 h-6 text-rose-500" /><span className="text-[9px] text-slate-500">PDF</span></>
                          : <img src={val} className="w-full h-full object-cover" />
                      ) : (
                        <><Upload className="w-5 h-5 text-slate-400" /><span className="text-[9px] text-slate-400">แตะเพื่อเลือก</span></>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-500 text-center mt-1">{f.label}</p>
                  </label>
                );
              })}
            </div>
            <p className="text-[11px] text-slate-400">
              รองรับรูปภาพและ PDF ไม่เกิน 8 MB · ไม่บังคับ แต่ผู้ดูแลอาจขอเพิ่มภายหลัง
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
                <Users className="w-4 h-4" /> รายชื่อนักกีฬา
              </h2>
              <span className="text-xs text-slate-500">สูงสุด {limit} คน</span>
            </div>
            <p className="text-[11px] text-slate-400 mb-3">
              กรอกเฉพาะชื่อก็พอ · เลขเสื้อและวันเกิดใส่ทีหลังได้ · แถวที่เว้นว่างจะไม่ถูกบันทึก
            </p>

            <div className="space-y-2">
              {editing.players.map((p, i) => (
                <div key={i} className="flex gap-2 items-start">
                  {/* รูปนักกีฬา — แตะกรอบเพื่อถ่าย/เลือกรูป ไม่บังคับ */}
                  <label className="shrink-0 cursor-pointer" title="แตะเพื่อใส่รูป">
                    <input type="file" accept="image/*" className="hidden"
                      onChange={async e => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        const url = await upload(f, 'player', `p${i}`);
                        if (url) setPlayer(i, 'photoUrl', url);
                      }} />
                    <div className="w-11 h-11 rounded-xl border-2 border-dashed border-slate-300 overflow-hidden flex items-center justify-center bg-slate-50">
                      {uploading === `p${i}`
                        ? <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                        : p.photoUrl
                          ? <img src={p.photoUrl} className="w-full h-full object-cover" />
                          : <Camera className="w-4 h-4 text-slate-400" />}
                    </div>
                  </label>
                  <span className="w-4 pt-3 text-xs text-slate-400 text-right shrink-0">{i + 1}</span>
                  <div className="flex-1 space-y-2">
                    <input
                      ref={el => { nameRefs.current[i] = el; }}
                      className={inp}
                      placeholder={`ชื่อ-สกุล นักกีฬาคนที่ ${i + 1}`}
                      value={p.name}
                      onChange={e => setPlayer(i, 'name', e.target.value)}
                      onKeyDown={e => {
                        // Enter = ข้ามไปคนถัดไป ทำให้กรอกรวดเดียวจบโดยไม่ต้องแตะจอ
                        if (e.key === 'Enter') { e.preventDefault(); nameRefs.current[i + 1]?.focus(); }
                      }}
                    />
                    {p.name.trim() !== '' && (
                      <div className="grid grid-cols-2 gap-2">
                        <input className={`${inp} py-2 text-sm`} placeholder="เลขเสื้อ"
                          inputMode="numeric" value={p.number}
                          onChange={e => setPlayer(i, 'number', e.target.value)} />
                        <input className={`${inp} py-2 text-sm`} type="date"
                          value={p.birthDate || ''}
                          onChange={e => setPlayer(i, 'birthDate', e.target.value)} />
                      </div>
                    )}
                  </div>
                  {p.name.trim() !== '' && (
                    <button onClick={() => setPlayer(i, 'name', '')}
                      className="p-2 mt-0.5 text-slate-400 hover:text-rose-600 shrink-0" title="ล้างแถวนี้">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {editing.players.length < limit && (
              <button
                onClick={() => { setEditing({ ...editing, players: [...editing.players, { name: '', number: '', birthDate: '', photoUrl: '' }] }); setDirty(true); }}
                className="mt-3 w-full py-2.5 border-2 border-dashed border-slate-300 rounded-xl text-sm text-slate-500 hover:border-indigo-400 hover:text-indigo-600 flex items-center justify-center gap-1">
                <Plus className="w-4 h-4" /> เพิ่มแถว
              </button>
            )}
          </div>
        </div>

        {/* ปุ่มลอยด้านล่าง — นิ้วโป้งเอื้อมถึงตอนถือมือถือมือเดียว */}
        <div className="fixed bottom-0 inset-x-0 bg-white border-t border-slate-200 p-3 flex gap-2 safe-area-bottom">
          <button onClick={() => save(false)} disabled={busy === 'save'}
            className="flex-1 py-3 rounded-xl border-2 border-slate-300 font-bold text-slate-700 disabled:opacity-50 flex items-center justify-center gap-2">
            {busy === 'save' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            บันทึกร่าง
          </button>
          <button onClick={() => save(true)} disabled={busy === 'save' || filled === 0}
            className="flex-1 py-3 rounded-xl bg-indigo-600 text-white font-bold disabled:opacity-50 flex items-center justify-center gap-2">
            <Send className="w-4 h-4" /> ยืนยันและส่ง
          </button>
        </div>
      </div>
    );
  }

  // ── รายการทีมของโรงเรียน ────────────────────────────────────────────────
  const closed = tournament && !tournament.isOpen;
  return (
    <div className="min-h-screen bg-slate-50 pb-10">
      <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-bold text-slate-800 truncate">{schoolName}</p>
          <p className="text-[11px] text-slate-500 truncate">{tournament?.name}</p>
        </div>
        <button onClick={doLogout} className="p-2 text-slate-500 hover:text-rose-600" title="ออกจากระบบ">
          <LogOut className="w-5 h-5" />
        </button>
      </div>

      <div className="p-4 space-y-3 max-w-lg mx-auto">
        {options.length > 1 && (
          <div className="bg-white border border-slate-200 rounded-2xl p-3">
            <label className="text-xs text-slate-500">รายการแข่งขัน</label>
            <select
              className="w-full mt-1 px-3 py-2.5 border border-slate-300 rounded-xl text-sm"
              value={tournament?.id ?? ''}
              disabled={busy === 'switch'}
              onChange={e => switchTournament(e.target.value)}
            >
              {options.map(o => (
                <option key={o.id} value={o.id}>
                  {o.name} ({o.teamCount} ทีม)
                </option>
              ))}
            </select>
            <p className="text-[11px] text-slate-400 mt-1">
              โรงเรียนของคุณมีทีมอยู่ {options.length} รายการ — เลือกรายการที่ต้องการจัดการ
            </p>
          </div>
        )}

        {closed && (
          <div className="bg-slate-100 border border-slate-300 rounded-xl p-3 flex gap-2">
            <Info className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
            <p className="text-xs text-slate-600">
              ปิดแก้ไขข้อมูลทีมแล้ว{tournament?.teamEditDeadline ? ` (ตั้งแต่ ${new Date(tournament.teamEditDeadline).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })})` : ''} — แก้ไขข้อมูลไม่ได้
              หากจำเป็นต้องแก้ กรุณาติดต่อผู้จัดการแข่งขัน
            </p>
          </div>
        )}

        {teams.map(t => {
          const st = STATUS_LABEL[t.status] ?? STATUS_LABEL.Invited;
          const filled = t.players.filter(p => p.name?.trim()).length;
          return (
            <div key={t.id} className="bg-white rounded-2xl border border-slate-200 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="font-bold text-slate-800 truncate">{t.name}</h3>
                  <span className={`inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold ${st.cls}`}>
                    {st.icon} {st.text}
                  </span>
                </div>
                <span className="text-xs text-slate-500 shrink-0 pt-1">
                  {filled === 0
                    ? <span className="text-rose-600 font-bold">ยังไม่มีรายชื่อ</span>
                    : `${filled} คน`}
                </span>
              </div>

              {t.status === 'Rejected' && t.rejectReason && (
                <p className="mt-2 text-xs text-rose-700 bg-rose-50 rounded-lg p-2">
                  เหตุผล: {t.rejectReason}
                </p>
              )}

              {!closed && t.status !== 'Withdrawn' && (
                <div className="flex gap-2 mt-3">
                  <button onClick={() => openTeam(t)}
                    className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700">
                    {t.status === 'Invited' ? 'ยืนยันเข้าร่วม + กรอกรายชื่อ' : 'แก้ไขข้อมูล'}
                  </button>
                  {t.status === 'Invited' && (
                    <button onClick={() => withdraw(t.id)} disabled={busy === 'wd'}
                      className="px-3 py-2.5 rounded-xl border border-slate-300 text-sm text-slate-600 hover:bg-slate-50">
                      ไม่เข้าร่วม
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {teams.length === 0 && (
          <p className="text-center text-sm text-slate-400 py-10">
            ยังไม่มีทีมของโรงเรียนนี้ในรายการแข่งขัน
          </p>
        )}
      </div>
    </div>
  );
};

export default SchoolPortal;
