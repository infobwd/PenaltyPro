import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronLeft, Search, Loader2, CheckCircle2, XCircle, AlertTriangle,
  RefreshCw, UserCheck, Users, Phone, ShieldCheck, X, Printer, CloudOff, RotateCcw,
  Camera, Pencil, UserCog,
} from 'lucide-react';
import { apiGet, apiPost, ApiError } from '../services/apiConfig';
import { uploadFile } from '../services/sheetService';
import { resizeImageBeforeUpload, SUPPORTED_IMAGE_ACCEPT } from '../services/imageResize';
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
  /** ข้อมูลคนนี้ถูกแก้หลังจากที่กรรมการเช็กไปแล้ว — ต้องตรวจซ้ำ */
  stale?: boolean;
  updatedAt?: string | null;
};

type TeamRow = {
  id: string; name: string; logoUrl: string; group: string; schoolName: string;
  total: number; present: number; absent: number; issue: number; stale?: number;
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

/**
 * ตัวกรองรายชื่อในทีม — กรรมการยืนโต๊ะแล้วอยากเห็น "คนที่ยังไม่ได้เช็ก" ทันที
 * ไม่ต้องเลื่อนผ่านคนที่เช็กไปแล้ว และเวลาตามหาคนที่ติดปัญหาก็กดดูเฉพาะกลุ่มได้
 */
type PlayerFilter = 'all' | 'pending' | 'present' | 'absent' | 'issue';
const PLAYER_FILTERS: { key: PlayerFilter; label: string; active: string }[] = [
  { key: 'all',     label: 'ทั้งหมด',  active: 'bg-slate-900 border-slate-900 text-white' },
  { key: 'pending', label: 'ค้างอยู่', active: 'bg-indigo-600 border-indigo-600 text-white' },
  { key: 'present', label: 'มา',       active: 'bg-emerald-600 border-emerald-600 text-white' },
  { key: 'absent',  label: 'ไม่มา',    active: 'bg-rose-600 border-rose-600 text-white' },
  { key: 'issue',   label: 'ติดปัญหา', active: 'bg-amber-500 border-amber-500 text-white' },
];

const QUEUE_KEY = 'penalty_pro_checkin_queue';

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

/**
 * ช่องหมายเหตุรายคน — เก็บสถานะพิมพ์ไว้ในตัวเอง แล้วค่อยบันทึกตอน blur/Enter
 *
 * ไม่ยิงทุกตัวอักษรเพราะสนามเน็ตแย่ และไม่ดัน state ของทั้งกริดให้ re-render
 * ทุกครั้งที่พิมพ์ กรรมการพิมพ์เสร็จแล้วแตะที่อื่น = บันทึกทันที
 */
const NoteField: React.FC<{
  value: string; placeholder: string; issue: boolean; onSave: (t: string) => void;
}> = ({ value, placeholder, issue, onSave }) => {
  const [text, setText] = useState(value);
  useEffect(() => { setText(value); }, [value]);
  return (
    <input
      value={text}
      onChange={e => setText(e.target.value)}
      onBlur={() => onSave(text.trim())}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      placeholder={placeholder}
      maxLength={255}
      className={`mt-2 w-full h-10 px-3 rounded-lg border text-sm outline-none transition
                  focus:ring-2 ${issue
        ? 'border-amber-300 bg-amber-50/60 focus:ring-amber-400 placeholder:text-amber-600/60'
        : 'border-slate-300 bg-white focus:ring-indigo-400'}`}
    />
  );
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
  // งานที่ยังส่งไม่สำเร็จ — สนามคือที่ที่เน็ตแย่ที่สุด
  // ถ้ากดแล้วเด้ง error ทิ้งไว้เฉย ๆ กรรมการจะไม่รู้ว่าคนไหนยังไม่ได้บันทึกจริง
  // เก็บไว้ใน localStorage ด้วย เผื่อเบราว์เซอร์ถูกปิดหรือรีเฟรชกลางคัน
  const [queue, setQueue] = useState<{ playerId: string; status: string }[]>(() => {
    try { return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]'); } catch { return []; }
  });
  const [flushing, setFlushing] = useState(false);
  const [allBusy, setAllBusy] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);
  // ตัวกรอง + ค้นหาภายในทีมที่เปิดอยู่ — รีเซ็ตทุกครั้งที่เปิดทีมใหม่
  const [pFilter, setPFilter] = useState<PlayerFilter>('all');
  const [pSearch, setPSearch] = useState('');
  // เปลี่ยนตัวหน้างาน — แก้ชื่อ/ถ่ายรูปคนที่มาแทน
  const [editing, setEditing] = useState<Player | null>(null);
  const [editName, setEditName] = useState('');
  const [editFile, setEditFile] = useState<File | null>(null);
  const [editPreview, setEditPreview] = useState('');   // object URL ของรูปที่เพิ่งถ่าย
  const [editSaving, setEditSaving] = useState(false);

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
    setPFilter('all'); setPSearch('');   // เริ่มทีมใหม่ = เห็นทุกคนก่อนเสมอ
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
    // ยกเลิกสถานะ = ลบแถวทั้งหมดฝั่ง server หมายเหตุจึงหายไปด้วย ล้างในจอให้ตรงกัน
    setPlayers(prev => prev.map(x => x.id === p.id
      ? { ...x, status: value, note: value ? x.note : '' } : x));
    setSaving(prev => new Set(prev).add(p.id));
    try {
      // ส่ง note เดิมไปด้วยเมื่อยังมีสถานะ ไม่งั้น ON DUPLICATE KEY UPDATE จะทับ note เป็นค่าว่าง
      await apiPost('savePlayerCheckin',
        { playerId: p.id, status: value ?? '', note: value ? (p.note || '') : '' });
      setTeams(prev => prev.map(t => t.id === openTeam?.id
        ? recount(t, before, p.id, value)
        : t));
      dequeue(p.id);
    } catch (e) {
      const err = e as ApiError;
      // 4xx = server ปฏิเสธจริง (สิทธิ์ไม่พอ ไม่พบคนนี้) ต้องย้อนและบอกทันที
      // ส่วนเน็ตหลุดจะไม่มี status — เก็บเข้าคิวแล้วส่งใหม่ทีหลัง หน้าจอคงค่าที่กดไว้
      if (err.status && err.status < 500) {
        setPlayers(before);
        notify('บันทึกไม่สำเร็จ', err.message, 'error');
      } else {
        enqueue(p.id, value ?? '');
      }
    } finally {
      setSaving(prev => { const n = new Set(prev); n.delete(p.id); return n; });
    }
  };

  /**
   * บันทึกหมายเหตุของคนที่มีสถานะแล้ว (เช่น ระบุว่าติดปัญหาอะไร)
   *
   * ต้องมีสถานะก่อนถึงจะมีแถวให้ผูกหมายเหตุ — ส่ง status เดิมไปพร้อมกันเสมอ
   * หมายเหตุเป็นข้อมูลรอง ถ้าเน็ตหลุดไม่เข้าคิวเหมือนสถานะ แต่คงข้อความไว้บนจอ
   * ให้กรรมการแตะแก้แล้วลองใหม่ได้เอง
   */
  const saveNote = async (p: Player, text: string) => {
    if (!p.status) return;
    if ((p.note || '') === text) return;   // ไม่เปลี่ยน ไม่ต้องยิง
    const before = players;
    setPlayers(prev => prev.map(x => x.id === p.id ? { ...x, note: text } : x));
    setSaving(prev => new Set(prev).add(p.id));
    try {
      await apiPost('savePlayerCheckin', { playerId: p.id, status: p.status, note: text });
    } catch (e) {
      const err = e as ApiError;
      if (err.status && err.status < 500) {
        setPlayers(before);
        notify('บันทึกหมายเหตุไม่สำเร็จ', err.message, 'error');
      } else {
        notify('หมายเหตุยังไม่ถูกส่ง', 'เน็ตไม่พร้อม แตะที่ช่องแล้วลองใหม่เมื่อสัญญาณกลับมา', 'warning');
      }
    } finally {
      setSaving(prev => { const n = new Set(prev); n.delete(p.id); return n; });
    }
  };

  /**
   * เปิด/ปิดกล่องเปลี่ยนตัว
   *
   * รูปพรีวิวเป็น object URL ต้อง revoke เองตอนปิด ไม่งั้นรั่วหน่วยความจำ
   * ถ้ากรรมการเปลี่ยนตัวหลายทีมติดกันในกะเดียว
   */
  const openEdit = (p: Player) => {
    setEditing(p);
    setEditName(p.name);
    setEditFile(null);
    setEditPreview('');
  };

  const closeEdit = () => {
    if (editPreview) URL.revokeObjectURL(editPreview);
    setEditing(null);
    setEditFile(null);
    setEditPreview('');
  };

  const pickEditPhoto = async (file: File) => {
    if (editPreview) URL.revokeObjectURL(editPreview);
    const resized = await resizeImageBeforeUpload(file);
    setEditFile(resized);
    setEditPreview(URL.createObjectURL(resized));
  };

  /**
   * บันทึกตัวที่มาแทน — อัปโหลดรูปก่อน (ถ้าถ่ายใหม่) แล้วค่อยผูกชื่อ+รูปกับคนเดิม
   *
   * ไม่ล้างผลรายงานตัวเดิมทิ้ง เพราะคนที่โต๊ะอาจกดสถานะให้ตัวสำรองไว้ก่อนแล้ว
   * ค่อยกดใหม่ทีหลังก็ได้ ระบบจะขึ้นธง "แก้ข้อมูลหลังรายงานตัว" ให้เตือนตรวจซ้ำเอง
   */
  const saveSubstitute = async () => {
    if (!editing) return;
    const name = editName.trim();
    if (!name) {
      notify('กรุณากรอกชื่อนักกีฬา', '', 'warning');
      return;
    }
    setEditSaving(true);
    try {
      let photoUrl = '';
      if (editFile) {
        photoUrl = await uploadFile(editFile, 'player');
      }
      const r = await apiPost('updateCheckinPlayer',
        { playerId: editing.id, name, photoUrl });
      setPlayers(prev => prev.map(x => x.id === editing.id
        ? { ...x, name: r.name ?? name, photoUrl: r.photoUrl ?? (photoUrl || x.photoUrl) }
        : x));
      notify('เปลี่ยนตัวแล้ว', `บันทึกเป็น ${name}`, 'success');
      closeEdit();
    } catch (e) {
      notify('เปลี่ยนตัวไม่สำเร็จ', (e as ApiError).message, 'error');
    } finally {
      setEditSaving(false);
    }
  };

  const enqueue = (playerId: string, status: string) => {
    setQueue(prev => {
      // เก็บครั้งล่าสุดของแต่ละคนพอ กดเปลี่ยนใจ 3 รอบไม่ต้องส่ง 3 ครั้ง
      const next = [...prev.filter(q => q.playerId !== playerId), { playerId, status }];
      localStorage.setItem(QUEUE_KEY, JSON.stringify(next));
      return next;
    });
  };

  const dequeue = (playerId: string) => {
    setQueue(prev => {
      if (!prev.some(q => q.playerId === playerId)) return prev;
      const next = prev.filter(q => q.playerId !== playerId);
      localStorage.setItem(QUEUE_KEY, JSON.stringify(next));
      return next;
    });
  };

  /** ส่งงานที่ค้างอยู่ใหม่ — ทีละชิ้น ไม่ยิงพร้อมกันตอนเน็ตเพิ่งกลับมา */
  const flushQueue = async () => {
    if (flushing || queue.length === 0) return;
    setFlushing(true);
    let sent = 0;
    try {
      for (const job of [...queue]) {
        try {
          await apiPost('savePlayerCheckin', { playerId: job.playerId, status: job.status });
          dequeue(job.playerId);
          sent++;
        } catch (e) {
          const err = e as ApiError;
          // ปฏิเสธถาวรก็เอาออกจากคิว ไม่งั้นค้างวนไม่จบ
          if (err.status && err.status < 500) { dequeue(job.playerId); continue; }
          break;   // ยังหลุดอยู่ — หยุดไว้ก่อน เดี๋ยวลองใหม่
        }
      }
      if (sent > 0) {
        notify('ส่งข้อมูลที่ค้างแล้ว', `${sent} รายการ`, 'success');
        await loadTeams(true);
      }
    } finally { setFlushing(false); }
  };

  // เน็ตกลับมาเมื่อไหร่ส่งต่อทันที ไม่ต้องรอให้กรรมการนึกได้เอง
  useEffect(() => {
    if (queue.length === 0) return;
    const onOnline = () => { flushQueue(); };
    window.addEventListener('online', onOnline);
    if (navigator.onLine) flushQueue();
    return () => window.removeEventListener('online', onOnline);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue.length]);

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

  /**
   * พิมพ์รายชื่อพร้อมผลรายงานตัว
   *
   * กรรมการต้องมีหลักฐานกระดาษให้ผู้จัดการทีมเซ็นกำกับ และเผื่อกรณีที่แย่ที่สุด
   * คือมือถือแบตหมดกลางงาน เขียนหน้าใหม่แล้วสั่งพิมพ์แทนการ print หน้าจอ
   * เพราะหน้าจอมีปุ่มเต็มไปหมดและตัดหน้ากระดาษไม่สวย
   */
  const printRoster = () => {
    if (!openTeam) return;
    const esc = (v: string) => v.replace(/[&<>"]/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
    const label = (st: Player['status']) =>
      st ? STATUS_UI[st].label : 'ยังไม่ได้เช็ก';
    const rows = players.map((p, i) => `<tr>
        <td>${i + 1}</td><td>${esc(p.number)}</td><td>${esc(p.name)}</td>
        <td>${esc(p.position)}</td><td>${esc(calcAge(p.birthDate))}</td>
        <td>${esc(label(p.status))}</td><td>${esc(p.note || '')}</td></tr>`).join('');
    const html = `<!doctype html><html lang="th"><head><meta charset="utf-8">
      <title>รายงานตัว ${esc(openTeam.name)}</title><style>
      *{font-family:'Sarabun','TH Sarabun New',sans-serif}
      body{margin:16mm}h1{font-size:18pt;margin:0 0 2mm}
      p.sub{font-size:11pt;color:#444;margin:0 0 6mm}
      table{width:100%;border-collapse:collapse;font-size:11pt}
      th,td{border:1px solid #999;padding:4px 6px;text-align:left}
      th{background:#eee}
      td:last-child{width:28mm}
      .sign{margin-top:12mm;font-size:11pt;display:flex;gap:20mm}
      @media print{@page{size:A4;margin:12mm}}
      </style></head><body>
      <h1>ใบรายงานตัวนักกีฬา — ${esc(openTeam.name)}</h1>
      <p class="sub">${esc([openTeam.schoolName, openTeam.group && 'สาย ' + openTeam.group]
        .filter(Boolean).join(' · '))}</p>
      <table><thead><tr>
        <th>#</th><th>เบอร์</th><th>ชื่อ-สกุล</th><th>ตำแหน่ง</th>
        <th>อายุ</th><th>ผลรายงานตัว</th><th>หมายเหตุ</th>
      </tr></thead><tbody>${rows}</tbody></table>
      <div class="sign">
        <div>ลงชื่อ ...................................... ผู้จัดการทีม</div>
        <div>ลงชื่อ ...................................... กรรมการ</div>
      </div></body></html>`;

    // เปิดหน้าต่างใหม่แล้วสั่งพิมพ์ ถ้าถูกบล็อกป๊อปอัปให้บอกตรง ๆ
    const w = window.open('', '_blank');
    if (!w) {
      notify('เปิดหน้าพิมพ์ไม่ได้', 'เบราว์เซอร์บล็อกป๊อปอัป กรุณาอนุญาตแล้วลองใหม่', 'warning');
      return;
    }
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
  };

  /**
   * รายงานตัวทุกทีมในรายการรวดเดียว
   *
   * ทีมทยอยมาตั้งแต่เช้า พอถึงเวลาประชุมผู้จัดการทีมก็มากันเกือบครบแล้ว
   * กดทีเดียวแล้วตามแก้เฉพาะทีมที่ขาด เร็วกว่าเข้าไปกดทีละทีม 30 กว่าครั้ง
   *
   * เขียนเฉพาะคนที่ยังไม่ได้เช็ก — ผลที่กรรมการตั้งใจกดไว้แล้วต้องไม่ถูกลบ
   */
  const markAll = async () => {
    if (!tournamentId) {
      notify('ยังไม่ได้เลือกรายการแข่งขัน', 'กลับไปหน้าหลักแล้วเลือกรายการก่อน', 'warning');
      return;
    }
    setAllBusy(true);
    try {
      const r = await apiPost('checkinAllBulk', { tournamentId, status: 'present' });
      await loadTeams(true);
      notify('บันทึกรายงานตัวแล้ว',
        `${r.affected ?? 0} คน จาก ${r.teams ?? 0} ทีม (เฉพาะคนที่ยังไม่ได้เช็ก)`, 'success');
    } catch (e) {
      notify('ทำรายการไม่สำเร็จ', (e as ApiError).message, 'error');
    } finally {
      setAllBusy(false);
      setConfirmAll(false);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return teams;
    return teams.filter(t =>
      t.name.toLowerCase().includes(q) || t.schoolName.toLowerCase().includes(q));
  }, [teams, search]);

  // จำนวนต่อสถานะ ใช้โชว์บนชิปตัวกรอง กรรมการเห็นเลย "ค้างอยู่กี่คน" ไม่ต้องนับเอง
  const playerCounts = useMemo(() => ({
    all:     players.length,
    pending: players.filter(p => !p.status).length,
    present: players.filter(p => p.status === 'present').length,
    absent:  players.filter(p => p.status === 'absent').length,
    issue:   players.filter(p => p.status === 'issue').length,
  }), [players]);

  const visiblePlayers = useMemo(() => {
    const q = pSearch.trim().toLowerCase();
    return players.filter(p => {
      const okStatus =
        pFilter === 'all'     ? true
        : pFilter === 'pending' ? !p.status
        : p.status === pFilter;
      if (!okStatus) return false;
      if (!q) return true;
      return p.name.toLowerCase().includes(q) || p.number.toLowerCase().includes(q);
    });
  }, [players, pFilter, pSearch]);

  const totals = useMemo(() => teams.reduce(
    (a, t) => ({
      players: a.players + t.total,
      present: a.present + t.present,
      pending: a.pending + (t.total - t.present - t.absent - t.issue),
      stale: a.stale + (t.stale ?? 0),
    }), { players: 0, present: 0, pending: 0, stale: 0 }), [teams]);

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

  /**
   * กล่องเปลี่ยนตัวหน้างาน
   *
   * ปุ่ม "ถ่ายรูปใหม่" ใช้ input[type=file] ซ่อนไว้ พร้อม capture="environment"
   * เพื่อเปิดกล้องหลังตรงบนมือถือทันที ไม่ต้องเข้าคลังรูปก่อน — กรรมการยืนหน้า
   * ตัวจริงอยู่แล้ว ถ่ายสดย่อมตรงกว่าไปควานรูปเก่าในเครื่อง
   */
  const substituteModal = editing ? createPortal(
    <div className="fixed inset-0 z-[2100] bg-black/60 flex items-center justify-center p-4"
      onClick={closeEdit} role="dialog" aria-modal="true">
      <div className="bg-white rounded-2xl w-full max-w-sm p-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <p className="font-black text-slate-900 flex items-center gap-1.5">
            <UserCog className="w-4 h-4 text-indigo-600" /> เปลี่ยนตัวหน้างาน
          </p>
          <button onClick={closeEdit} aria-label="ปิด" className="p-1.5 -m-1.5 rounded-lg hover:bg-slate-100">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>
        <p className="text-[11px] text-slate-500 mb-3">
          {editing.number ? `เบอร์ ${editing.number} · ` : ''}เดิมชื่อ {editing.name || 'ไม่ระบุชื่อ'}
        </p>

        <label className="relative block w-28 h-28 mx-auto rounded-xl overflow-hidden bg-slate-100
                           border-2 border-dashed border-slate-300 cursor-pointer group">
          <input type="file" accept={SUPPORTED_IMAGE_ACCEPT} capture="environment" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) pickEditPhoto(f); e.target.value = ''; }} />
          {editPreview
            ? <img src={editPreview} alt="" className="w-full h-full object-cover" />
            : editing.photoUrl
              ? <img src={editing.photoUrl} alt="" className="w-full h-full object-cover opacity-60" />
              : <div className="w-full h-full flex items-center justify-center">
                  <Users className="w-8 h-8 text-slate-300" />
                </div>}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition flex items-center justify-center">
            <span className="flex flex-col items-center gap-1 text-white opacity-0 group-hover:opacity-100 transition">
              <Camera className="w-6 h-6" />
              <span className="text-[10px] font-bold">ถ่ายรูปใหม่</span>
            </span>
          </div>
          {editFile && (
            <span className="absolute bottom-1 right-1 bg-emerald-600 text-white rounded-full p-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
            </span>
          )}
        </label>
        <p className="text-center text-[11px] text-slate-400 mt-1.5">แตะรูปเพื่อถ่ายรูปคนที่มาแทน</p>

        <label className="block text-xs font-bold text-slate-500 mt-4 mb-1">ชื่อ-สกุลตัวจริง</label>
        <div className="relative">
          <Pencil className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={editName} onChange={e => setEditName(e.target.value)}
            placeholder="ชื่อนักกีฬาที่มาแทน" autoFocus
            className="w-full h-11 pl-9 pr-3 rounded-xl border border-slate-300 text-base
                       outline-none focus:ring-2 focus:ring-indigo-400" />
        </div>

        <div className="flex gap-2 mt-4">
          <button onClick={closeEdit} disabled={editSaving}
            className="px-4 h-11 rounded-xl border-2 border-slate-300 text-slate-600 font-bold text-sm">
            ยกเลิก
          </button>
          <button onClick={saveSubstitute} disabled={editSaving || !editName.trim()}
            className="flex-1 h-11 rounded-xl bg-indigo-600 text-white font-black text-sm
                       disabled:opacity-50 flex items-center justify-center gap-2">
            {editSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserCog className="w-4 h-4" />}
            บันทึกตัวที่มาแทน
          </button>
        </div>
      </div>
    </div>, document.body) : null;

  const queueBanner = queue.length > 0 ? (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 flex items-center gap-3">
      <CloudOff className="w-5 h-5 text-amber-600 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-amber-900">ยังส่งไม่ครบ {queue.length} รายการ</p>
        <p className="text-[11px] text-amber-700">
          บันทึกไว้ในเครื่องแล้ว จะส่งให้เองเมื่อเน็ตกลับมา — ปิดหน้านี้ได้ ข้อมูลไม่หาย
        </p>
      </div>
      <button onClick={flushQueue} disabled={flushing}
        className="px-3 py-2 rounded-lg bg-amber-600 text-white text-xs font-bold
                   disabled:opacity-50 shrink-0 flex items-center gap-1.5">
        {flushing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
        ส่งใหม่
      </button>
    </div>
  ) : null;

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
            <button onClick={printRoster} title="พิมพ์ใบรายงานตัว"
              className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 shrink-0">
              <Printer className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="max-w-5xl mx-auto p-3 space-y-3">
          {queueBanner}
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
           <>
            {/* ค้นหา + กรองตามสถานะ — ทีมใหญ่ ๆ หาคนที่ยังค้างหรือคนที่เดินมาโต๊ะได้เร็ว */}
            <div className="space-y-2">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input value={pSearch} onChange={e => setPSearch(e.target.value)}
                  placeholder="ค้นหาชื่อหรือเบอร์เสื้อในทีมนี้"
                  className="w-full h-11 pl-9 pr-9 rounded-xl border border-slate-300 bg-white text-base
                             outline-none focus:ring-2 focus:ring-indigo-400" />
                {pSearch && (
                  <button onClick={() => setPSearch('')} aria-label="ล้างคำค้น"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-full text-slate-400 hover:bg-slate-100">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                {PLAYER_FILTERS.map(f => {
                  const on = pFilter === f.key;
                  return (
                    <button key={f.key} onClick={() => setPFilter(f.key)} aria-pressed={on}
                      className={`shrink-0 h-9 px-3 rounded-full text-xs font-black border-2 transition tabular-nums
                                  ${on ? f.active : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                      {f.label} {playerCounts[f.key]}
                    </button>
                  );
                })}
              </div>
            </div>

            {visiblePlayers.length === 0 ? (
              <p className="text-center text-sm text-slate-400 py-16">ไม่พบนักกีฬาที่ตรงกับตัวกรอง</p>
            ) : (
            /* มือถือ 1 คอลัมน์ / แท็บเล็ต 2 / จอใหญ่ 3 — แท็บเล็ตแนวนอนมีที่พอวาง 2 ใบเต็ม ๆ */
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {visiblePlayers.map(p => {
                const ui = p.status ? STATUS_UI[p.status] : null;
                return (
                  <div key={p.id}
                    className={`bg-white rounded-2xl border-2 p-3 transition ${
                      p.stale ? 'bg-orange-50 border-orange-400'
                              : ui ? ui.soft : 'border-slate-200'}`}>
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
                          {/* เปลี่ยนตัวหน้างาน — ทีมส่งตัวสำรองมาแทนคนในเบอร์เดิม */}
                          <button onClick={() => openEdit(p)} title="เปลี่ยนตัว (แก้ชื่อ/ถ่ายรูปใหม่)"
                            className="shrink-0 p-1.5 -m-1 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50">
                            <UserCog className="w-4 h-4" />
                          </button>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-1">
                          {[p.position, calcAge(p.birthDate)].filter(Boolean).join(' · ') || '—'}
                        </p>
                        {!p.photoUrl && (
                          <p className="text-[11px] text-amber-700 mt-1 font-bold">ไม่มีรูปในระบบ — ตรวจบัตรแทน</p>
                        )}
                        {/* ข้อมูลถูกแก้หลังรายงานตัว — ไม่ลบผลที่กดไว้ แต่ต้องบอก
                            เพราะสิ่งที่กรรมการเทียบไว้ (รูป/เบอร์เสื้อ) เปลี่ยนไปแล้ว
                            จะตรวจซ้ำหรือปล่อยผ่าน ให้กรรมการตัดสินเอง */}
                        {p.stale && (
                          <p className="text-[11px] text-orange-700 mt-1 font-bold flex items-center gap-1">
                            <RotateCcw className="w-3 h-3 shrink-0" /> แก้ข้อมูลหลังรายงานตัว — ตรวจซ้ำ
                          </p>
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

                    {/* หมายเหตุ — โผล่เมื่อมีสถานะแล้ว โดยเฉพาะ "ติดปัญหา" ที่ต้องบอกเหตุ */}
                    {p.status && (
                      <NoteField
                        value={p.note}
                        issue={p.status === 'issue'}
                        placeholder={p.status === 'issue'
                          ? 'ระบุปัญหา เช่น ไม่มีบัตร / อายุเกิน / รูปไม่ตรง'
                          : 'หมายเหตุ (ถ้ามี)'}
                        onSave={t => saveNote(p, t)} />
                    )}
                  </div>
                );
              })}
            </div>
            )}
           </>
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
        {substituteModal}
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
        {queueBanner}
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

        {/* กระทบทุกทีมพร้อมกัน จึงต้องยืนยันอีกชั้น
            กดพลาดตอนถือมือถืออยู่ข้างสนามเกิดขึ้นได้ง่ายมาก */}
        {totals.pending > 0 && (
          confirmAll ? (
            <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3">
              <p className="text-sm font-bold text-emerald-900">
                บันทึกว่า "มารายงานตัว" ให้ {totals.pending} คนที่ยังไม่ได้เช็ก?
              </p>
              <p className="text-[11px] text-emerald-700 mt-1">
                คนที่กดไว้แล้วจะไม่ถูกเปลี่ยน — แก้ทีละคนทีหลังได้ตลอด
              </p>
              <div className="flex gap-2 mt-3">
                <button onClick={markAll} disabled={allBusy}
                  className="flex-1 h-11 rounded-xl bg-emerald-600 text-white font-black text-sm
                             disabled:opacity-50 flex items-center justify-center gap-2">
                  {allBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserCheck className="w-4 h-4" />}
                  ยืนยัน
                </button>
                <button onClick={() => setConfirmAll(false)} disabled={allBusy}
                  className="px-5 h-11 rounded-xl border-2 border-slate-300 text-slate-600 font-bold text-sm">
                  ยกเลิก
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => setConfirmAll(true)}
              className="w-full h-12 rounded-xl border-2 border-emerald-500 text-emerald-700
                         font-black text-sm flex items-center justify-center gap-2 hover:bg-emerald-50">
              <UserCheck className="w-4 h-4" />
              รายงานตัวทั้งรายการรวดเดียว ({totals.pending} คนที่ยังไม่ได้เช็ก)
            </button>
          )
        )}

        {totals.stale > 0 && (
          <div className="rounded-xl border border-orange-300 bg-orange-50 p-3 flex items-center gap-3">
            <RotateCcw className="w-5 h-5 text-orange-600 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-orange-900">
                มี {totals.stale} คนที่ข้อมูลถูกแก้หลังรายงานตัวแล้ว
              </p>
              <p className="text-[11px] text-orange-700">
                รูปหรือเบอร์เสื้อเปลี่ยนไปหลังจากที่เช็กไว้ — ควรตรวจซ้ำก่อนปล่อยลงแข่ง
              </p>
            </div>
          </div>
        )}

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
                  {(t.absent > 0 || t.issue > 0 || (t.stale ?? 0) > 0) && (
                    <div className="flex flex-wrap gap-3 mt-2 text-[11px] font-bold">
                      {t.absent > 0 && <span className="text-rose-600">ไม่มา {t.absent}</span>}
                      {t.issue > 0 && <span className="text-amber-600">ติดปัญหา {t.issue}</span>}
                      {(t.stale ?? 0) > 0 && (
                        <span className="text-orange-700 flex items-center gap-1">
                          <RotateCcw className="w-3 h-3" /> ต้องตรวจซ้ำ {t.stale}
                        </span>
                      )}
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
