import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import PaymentInfoCard from './PaymentInfoCard';
import {
  Cloud, CloudOff,
  KeyRound, Loader2, LogOut, Plus, Trash2, Save, Send, CheckCircle2,
  AlertTriangle, ChevronLeft, Users, ShieldQuestion, Clock, XCircle, Info,
  Camera, Upload, FileText, Download,
} from 'lucide-react';
import { apiGet, apiPost, apiUpload, ApiError, setToken, clearTeamToken, getToken, getTokenKind } from '../services/apiConfig';
import { confirmAction } from '../services/uiService';
import { PLAYER_POSITIONS, normalizePlayerPosition } from '../services/playerPositions';

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
  /** บัญชีที่กำลังใช้งาน — ถ้าผู้ดูแลผูกกับโรงเรียนไว้แล้วจะเข้าได้เลยไม่ต้องกรอกรหัส */
  currentUser?: { displayName?: string; schoolId?: string | null;
                  schoolName?: string | null; schoolVerified?: boolean } | null;
}

interface PlayerRow {
  // id ของแถวเดิมในฐานข้อมูล — ต้องส่งกลับไปตอนบันทึก ไม่งั้น server แยกไม่ออก
  // ว่าเป็นคนเดิมที่แก้ชื่อ หรือคนใหม่ แล้วจะลบแถวเดิมทิ้งพร้อมสถิติและผลรายงานตัว
  // แถวว่างที่เติมให้กรอกจะไม่มี id (undefined) = คนใหม่
  id?: string;
  name: string;
  number: string;
  position: string;
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
  registrationFee?: number;
  /** นโยบายเอกสารรับรอง (db/20) — Off = ไม่รับ, Required = ต้องแนบก่อนส่ง */
  docMode?: 'Off' | 'Optional' | 'Required';
  /** แบบฟอร์ม/ตัวอย่างที่เจ้าภาพเตรียมไว้ให้ดาวน์โหลด */
  docTemplateUrl?: string;
  bankName?: string;
  bankAccount?: string;
  accountName?: string;
  playersPerTeam: number;
  maxSubs: number;
}

interface TournamentOption {
  id: string;
  name: string;
  status: string;
  teamCount: number;
}

/**
 * ร่างในเครื่อง — กันข้อมูลหายตอนเน็ตหลุดหรือปิดแท็บกลางคัน
 *
 * ⚠️ ร่างจะ "เก่ากว่าของจริง" ได้ ตั้งแต่มีการบันทึกอัตโนมัติขึ้น server
 * เคสที่เจอ: ครูอัปรูปใหม่ -> บันทึกขึ้น server แล้ว -> วันต่อมากดเข้าแก้ไข
 * แล้วกด "กรอกต่อ" จากร่างเก่า -> รูปเก่าถูกเขียนทับรูปใหม่
 * แย่กว่านั้นคือร่างพา rowVersion เก่ามาด้วย พอชนกันได้ 409 ตัวลองใหม่
 * อัตโนมัติจะดึงเลขล่าสุดมาแล้วส่งของเก่าทับสำเร็จ
 *
 * จึงต้อง:
 *   - แยกคีย์ตามทีม ไม่ใช่คีย์เดียวทั้งระบบ
 *   - เก็บ rowVersion ตอนที่บันทึกร่างไว้ด้วย เอาไว้เทียบกับของ server
 *   - หมดอายุ 24 ชม. ร่างจากเมื่อวานไม่ควรเด้งถามอีก
 */
const DRAFT_PREFIX = 'kickoff_school_draft:';
const DRAFT_LEGACY_KEY = 'kickoff_school_draft';   // คีย์เดิม ล้างทิ้งครั้งเดียว
const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

type StoredDraft = { savedAt: number; rowVersion?: number; team: TeamData };

const draftKey = (teamId: string) => DRAFT_PREFIX + teamId;

const todayForInput = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

const normalizeBirthDateForInput = (value?: string): string => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const legacy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  let year = iso ? Number(iso[1]) : legacy ? Number(legacy[3]) : 0;
  const month = iso ? Number(iso[2]) : legacy ? Number(legacy[2]) : 0;
  const day = iso ? Number(iso[3]) : legacy ? Number(legacy[1]) : 0;
  if (year > 2400) year -= 543;
  if (!year || !month || !day || !Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return '';
  const parsed = new Date(year, month - 1, day);
  if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) return '';
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

/** รองรับทั้ง YYYY-MM-DD จากฐานข้อมูลและ DD/MM/YYYY จากข้อมูลรุ่นเก่า */
const playerAgeLabel = (value?: string): string | null => {
  const normalized = normalizeBirthDateForInput(value);
  if (!normalized) return null;
  const [year, month, day] = normalized.split('-').map(Number);

  const birth = new Date(year, month - 1, day);
  if (birth.getFullYear() !== year || birth.getMonth() !== month - 1 || birth.getDate() !== day) return null;
  const today = new Date();
  const current = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (birth > current) return 'วันเกิดอยู่ในอนาคต';

  let years = current.getFullYear() - birth.getFullYear();
  let months = current.getMonth() - birth.getMonth();
  if (current.getDate() < birth.getDate()) months--;
  if (months < 0) { years--; months += 12; }
  if (years <= 0) return `อายุ ${Math.max(0, months)} เดือน`;
  return `อายุ ${years} ปี${months > 0 ? ` ${months} เดือน` : ''}`;
};

const writeDraft = (t: TeamData) => {
  try {
    localStorage.setItem(draftKey(t.id), JSON.stringify({
      savedAt: Date.now(), rowVersion: t.rowVersion, team: t,
    } satisfies StoredDraft));
  } catch { /* โควตาเต็มหรือโหมดส่วนตัว — ไม่ใช่เรื่องที่ต้องหยุดการกรอก */ }
};

const clearDraft = (teamId: string) => {
  try { localStorage.removeItem(draftKey(teamId)); } catch {}
};

/** ล้างร่างทั้งหมดของเครื่องนี้ — ใช้ตอนออกจากระบบ */
const clearAllDrafts = () => {
  try {
    localStorage.removeItem(DRAFT_LEGACY_KEY);
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k?.startsWith(DRAFT_PREFIX)) localStorage.removeItem(k);
    }
  } catch {}
};

type DraftCheck =
  | { kind: 'none' }
  | { kind: 'usable'; team: TeamData }
  | { kind: 'stale' };     // มีร่างแต่เก่ากว่าของ server — ทิ้ง แต่ต้องบอกผู้ใช้

/**
 * ร่างนี้ใช้ได้ไหม
 *
 * เทียบ rowVersion เป็นหลัก: ถ้าของ server เดินไปไกลกว่าตอนที่เก็บร่างไว้
 * แปลว่ามีการบันทึกเกิดขึ้นหลังจากนั้น ร่างจึงเก่าและห้ามเอามาทับ
 * เท่ากัน = ยังไม่มีใครบันทึกทับ ร่างคือของที่ใหม่กว่าจริง ๆ
 */
const readDraft = (server: TeamData): DraftCheck => {
  try {
    const raw = localStorage.getItem(draftKey(server.id));
    if (!raw) return { kind: 'none' };
    const d = JSON.parse(raw) as StoredDraft;
    if (!d?.team || d.team.id !== server.id) { clearDraft(server.id); return { kind: 'none' }; }
    if (Date.now() - (d.savedAt ?? 0) > DRAFT_TTL_MS) { clearDraft(server.id); return { kind: 'none' }; }
    if ((d.rowVersion ?? -1) < (server.rowVersion ?? 0)) {
      clearDraft(server.id);
      return { kind: 'stale' };
    }
    return { kind: 'usable', team: d.team };
  } catch {
    clearDraft(server.id);
    return { kind: 'none' };
  }
};

const STATUS_LABEL: Record<string, { text: string; cls: string; icon: React.ReactNode }> = {
  Invited:   { text: 'รอยืนยันการเข้าร่วม', cls: 'bg-amber-100 text-amber-800', icon: <ShieldQuestion className="w-3.5 h-3.5" /> },
  Draft:     { text: 'กำลังกรอก (ยังไม่ส่ง)', cls: 'bg-sky-100 text-sky-800', icon: <Clock className="w-3.5 h-3.5" /> },
  Submitted: { text: 'ส่งแล้ว รอตรวจ', cls: 'bg-indigo-100 text-indigo-800', icon: <Send className="w-3.5 h-3.5" /> },
  Approved:  { text: 'อนุมัติแล้ว', cls: 'bg-emerald-100 text-emerald-800', icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
  Rejected:  { text: 'ถูกตีกลับให้แก้ไข', cls: 'bg-rose-100 text-rose-800', icon: <XCircle className="w-3.5 h-3.5" /> },
  Withdrawn: { text: 'ไม่เข้าร่วมปีนี้', cls: 'bg-slate-200 text-slate-600', icon: <XCircle className="w-3.5 h-3.5" /> },
};

const SchoolPortal: React.FC<Props> = ({ onExit, notify, currentUser }) => {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [schoolName, setSchoolName] = useState('');
  const [tournament, setTournament] = useState<TournamentInfo | null>(null);
  /**
   * ชื่อทีมที่เพิ่งส่งสำเร็จ — ใช้แสดงหน้าจบงานพร้อมทางออกที่ชัดเจน
   *
   * เดิมกดส่งแล้วเด้งกลับไปหน้ารายการทีมเฉย ๆ ครูที่ทำงานเสร็จแล้วต้องไล่กด
   * ปุ่มย้อนกลับอีกหลายครั้งกว่าจะออกไปหน้าหลัก ทั้งที่งานจบตั้งแต่กดส่งแล้ว
   */
  const [justSubmitted, setJustSubmitted] = useState<string | null>(null);
  const [teams, setTeams] = useState<TeamData[]>([]);
  const [editing, setEditing] = useState<TeamData | null>(null);
  const [dirty, setDirty] = useState(false);
  const nameRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [options, setOptions] = useState<TournamentOption[]>([]);
  const [uploading, setUploading] = useState<string | null>(null);
  // เก็บรหัสไว้เพื่อสลับรายการแข่งขันได้โดยไม่ต้องพิมพ์ใหม่
  const [lastCode, setLastCode] = useState('');
  // รูปที่กำลังเปิดดูแบบเต็ม — ครูมักอยากตรวจว่ารูปที่อัปไปชัดพอไหม
  // ก่อนหน้านี้เห็นแค่กรอบ 44px จะดูว่าใช่คนถูกคนหรือเปล่ายังยาก
  const [viewPhoto, setViewPhoto] = useState<{ url: string; name: string } | null>(null);
  // สถานะการบันทึกอัตโนมัติ — ครูกรอกบนมือถือแล้วออกจากแอปกลางคันบ่อยมาก
  // ('idle' = ยังไม่มีอะไรค้าง, 'pending' = รอครบเวลา, 'saving', 'saved', 'error')
  const [autoState, setAutoState] = useState<'idle' | 'pending' | 'saving' | 'saved' | 'error'>('idle');
  const [autoAt, setAutoAt] = useState<Date | null>(null);
  const [autoErr, setAutoErr] = useState('');
  const savingRef = useRef(false);
  const autoTriedRef = useRef(false);
  // ตัวล่าสุดที่อยู่บนหน้าจอ ณ ตอนนี้ — ใช้เทียบว่าครูพิมพ์ต่อระหว่างที่กำลังบันทึกไหม
  const latestRef = useRef<TeamData | null>(null);
  // row_version ล่าสุดที่ server ยืนยันแล้ว
  //
  // เก็บใน ref ไม่ใช่ state เพราะการบันทึกอัตโนมัติกับปุ่มบันทึกอาจยิงห่างกันไม่ถึง
  // หนึ่ง render — ถ้าอ่านจาก state ตัวที่สองจะได้เลขเก่าแล้วโดน 409 ทันที
  const rowVersionRef = useRef<number | undefined>(undefined);

  /**
   * เลขเสื้อที่ซ้ำกันในทีมเดียวกัน
   *
   * ฝั่ง server ปฏิเสธอยู่แล้ว (uq_player_shirt) แต่กว่าจะรู้ก็ตอนกดบันทึก
   * แล้วต้องไล่หาเองว่าซ้ำที่แถวไหน — บอกตั้งแต่ตอนพิมพ์ทำให้แก้ได้ทันที
   * และทำให้การบันทึกอัตโนมัติไม่ไปชนข้อผิดพลาดนี้ซ้ำ ๆ เบื้องหลัง
   */
  const dupNumbers = useMemo(() => {
    if (!editing) return new Set<string>();
    const seen = new Map<string, number>();
    for (const p of editing.players) {
      if (p.name.trim() === '') continue;          // แถวว่างไม่ถูกบันทึกอยู่แล้ว
      const n = p.number.trim();
      if (n === '') continue;                      // ไม่ใส่เลขได้ ไม่นับว่าซ้ำ
      seen.set(n, (seen.get(n) ?? 0) + 1);
    }
    return new Set([...seen.entries()].filter(([, c]) => c > 1).map(([n]) => n));
  }, [editing]);

  const hasDup = dupNumbers.size > 0;

  useEffect(() => { latestRef.current = editing; }, [editing]);

  // ── ร่างในเครื่อง — เน็ตหลุด/ปิดแท็บแล้วกลับมากรอกต่อได้ ────────────────
  useEffect(() => {
    if (!editing || !dirty) return;
    const t = setTimeout(() => writeDraft(editing), 800);
    return () => clearTimeout(t);
  }, [editing, dirty]);

  /**
   * บันทึกขึ้น server อัตโนมัติหลังหยุดพิมพ์
   *
   * ครูกรอกบนมือถือ ระหว่างทางมีสายเข้า มีคนเรียก แอปถูกสลับออกไป
   * ร่างในเครื่องช่วยได้เฉพาะกรณีที่กลับมาใช้เครื่องเดิมเบราว์เซอร์เดิม
   * ถ้าเปลี่ยนเครื่องหรือล้างข้อมูลก็หายอยู่ดี — ต้องขึ้น server ถึงจะปลอดภัยจริง
   *
   * หน่วง 2.5 วินาที ไม่ใช่ทุกตัวอักษร: ยิงถี่กว่านี้ shared hosting รับไม่ไหว
   * และ row_version จะเดินเร็วจนชนกันเอง
   *
   * ไม่บันทึกเมื่อ: มีเลขเสื้อซ้ำ (server ปฏิเสธแน่นอน จะกลายเป็นลูป error),
   * กำลังอัปโหลดไฟล์อยู่, หรือกำลังบันทึกด้วยปุ่มอยู่แล้ว
   */
  useEffect(() => {
    if (!editing || !dirty || hasDup || uploading || busy === 'save') {
      if (dirty && hasDup) setAutoState('idle');
      return;
    }
    setAutoState('pending');
    const t = setTimeout(async () => {
      if (savingRef.current) return;
      savingRef.current = true;
      setAutoState('saving');
      const snapshot = editing;
      try {
        const fresh = await pushTeam(snapshot);
        // อัปเดตแค่ rowVersion ไม่แตะ players — ครูอาจกำลังพิมพ์อยู่ตอนนี้
        // ถ้าเอาข้อมูลจาก server มาทับทั้งก้อน ตัวอักษรที่เพิ่งพิมพ์จะหายไปต่อหน้า
        if (fresh?.rowVersion !== undefined) {
          setEditing(prev => prev ? { ...prev, rowVersion: fresh.rowVersion } : prev);
        }
        setAutoAt(new Date());
        if (latestRef.current === snapshot) {
          setDirty(false);
          setAutoErr('');
          setAutoState('saved');
          clearDraft(snapshot.id);
        } else {
          // ครูพิมพ์ต่อระหว่างที่กำลังส่ง — ห้ามล้าง dirty ไม่งั้นตัวที่พิมพ์ทีหลัง
          // จะค้างอยู่แค่ในเครื่อง ไม่ถูกบันทึกจนกว่าจะมีคนกดปุ่มเอง
          setAutoState('pending');
        }
      } catch (e) {
        // ไม่เด้ง toast — ครูกำลังพิมพ์อยู่ การขัดจังหวะทุก 2.5 วิ น่ารำคาญกว่าปัญหา
        // แต่ต้องโชว์ข้อความจริงจาก server ในแถบสถานะ ไม่ใช่แค่ "ไม่สำเร็จ"
        // ไม่งั้นเวลามีปัญหาบนโฮสต์จะไม่มีใครรู้ว่าเกิดอะไรขึ้น
        setAutoErr((e as ApiError).message || '');
        setAutoState('error');
      } finally {
        savingRef.current = false;
      }
    }, 2500);
    return () => clearTimeout(t);
    // ตั้งใจไม่ผูก pushTeam ที่สร้างใหม่ทุก render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, dirty, hasDup, uploading, busy]);

  const loadTeams = async () => {
    const r = await apiGet('myTeams');
    setSchoolName(prev => prev || r.schoolName || '');
    setTournament(r.tournament);
    setTeams(r.teams);
    return r;
  };

  /**
   * เข้าจัดการทีมด้วยบัญชีที่ผู้ดูแลผูกไว้แล้ว — ไม่ต้องกรอกรหัส 8 ตัว
   *
   * ใช้ได้เฉพาะบัญชีที่ "ผู้ดูแลรับรอง" เท่านั้น (schoolVerified) เพราะโรงเรียน
   * ที่ผู้ใช้เลือกเองตอนเข้าครั้งแรกเป็นแค่คำบอกเล่า ถ้ายอมให้ผ่านด้วย
   * ใครก็ตามที่เลือกว่า "อยู่โรงเรียนนี้" จะแก้รายชื่อนักกีฬาของโรงเรียนนั้นได้
   */
  const loginWithAccount = async (silent = false) => {
    setBusy('account');
    try {
      // silent = แอปลองเองตอนเปิดหน้า ยังไม่มีใครสั่ง
      // ถ้าไม่ได้ก็แค่ให้กรอกรหัสตามปกติ ห้ามล้าง session แล้วเด้งไป /login
      const r = await apiPost('teamLoginByAccount', {}, { background: silent });
      setToken(r.token, 'team');
      setSchoolName(r.schoolName);
      setOptions(r.availableTournaments ?? []);
      setLastCode('');
      await loadTeams();
      notify('เข้าสู่ระบบแล้ว', `${r.schoolName} · เข้าด้วยบัญชีของคุณ`, 'success');
      return true;
    } catch (e) {
      const err = e as ApiError;
      // เข้าอัตโนมัติไม่ได้ก็แค่ให้กรอกรหัสตามปกติ ไม่ต้องขึ้นข้อความรบกวน
      if (!silent) notify('เข้าด้วยบัญชีไม่ได้', err.message, 'warning');
      return false;
    } finally { setBusy(null); }
  };

  // ผู้ใช้ที่ผูกและรับรองแล้ว — พาเข้าให้เลยตั้งแต่เปิดหน้า
  useEffect(() => {
    if (getTokenKind() === 'team' && teams.length > 0) return;   // เข้าหน้าโรงเรียนอยู่แล้ว
    if (!currentUser?.schoolId || !currentUser.schoolVerified) return;
    if (!getToken()) return;        // ไม่มี token ก็เรียกไปก็ได้ 401 เปล่า ๆ
    if (autoTriedRef.current) return;   // ลองแล้วไม่ได้ อย่าวนลองซ้ำ
    autoTriedRef.current = true;
    loginWithAccount(true);
    // ตั้งใจให้ทำครั้งเดียวตอนเปิดหน้า ไม่ผูกกับ loginWithAccount ที่สร้างใหม่ทุก render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.schoolId, currentUser?.schoolVerified]);

  const doLogin = async () => {
    const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (clean.length !== 8) { notify('รหัสไม่ครบ', 'รหัสมี 8 ตัวอักษร', 'warning'); return; }
    setBusy('login');
    try {
      const r = await apiPost('teamLogin', { accessCode: clean });
      setToken(r.token, 'team');
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
    setBusy('switch');
    try {
      // เข้าด้วยรหัสก็ใช้รหัสเดิม เข้าด้วยบัญชีก็ออก session ใหม่จากบัญชี
      const r = lastCode
        ? await apiPost('teamLogin', { accessCode: lastCode, tournamentId })
        : await apiPost('teamLoginByAccount', { tournamentId });
      setToken(r.token, 'team');
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
    // คืน session ของบัญชีเดิม (ถ้าเข้าด้วย LINE/ชื่อผู้ใช้มาก่อน) ไม่ใช่ล้างทิ้งทั้งหมด
    clearTeamToken();
    clearAllDrafts();
    setTeams([]); setEditing(null); setSchoolName(''); setCode('');
  };

  const openTeam = async (t: TeamData) => {
    let data = { ...t, players: [...t.players] };

    const draft = readDraft(t);
    if (draft.kind === 'stale') {
      // ทิ้งไปแล้วแต่ต้องบอก ไม่ใช่หายเงียบ ๆ
      // ครูจะได้รู้ว่าที่พิมพ์ค้างไว้ในเครื่องนี้ไม่ได้ถูกนำมาใช้ และเพราะอะไร
      notify('ไม่ได้ใช้ข้อมูลที่ค้างในเครื่อง',
        'ข้อมูลบนระบบถูกแก้ไขหลังจากนั้น จึงใช้ข้อมูลล่าสุดจากระบบแทน', 'info');
    } else if (draft.kind === 'usable'
        && await confirmAction('พบข้อมูลที่กรอกค้างไว้ในอุปกรณ์นี้', { title: 'กรอกต่อจากเดิมไหม?', confirmText: 'กรอกต่อ' })) {
      // ใช้เนื้อหาจากร่าง แต่ rowVersion ต้องเป็นของ server เสมอ
      // ถ้าใช้ของร่างจะชน 409 ตั้งแต่บันทึกครั้งแรก
      data = { ...draft.team, rowVersion: t.rowVersion };
    } else if (draft.kind === 'usable') {
      // ตอบว่าไม่กรอกต่อ = ไม่ต้องการร่างนี้แล้ว อย่าเก็บไว้ถามซ้ำรอบหน้า
      clearDraft(t.id);
    }
    // ร่างเก่าอาจยังไม่มี position และข้อมูลเดิมอาจเป็นคำไทย/อังกฤษเต็ม
    // แปลงเข้ารหัสชุดเดียวกับ Lineup ก่อนให้ครูแก้ไขและบันทึกกลับ
    data.players = data.players.map(player => ({
      ...player,
      position: normalizePlayerPosition(player.position),
      birthDate: normalizeBirthDateForInput(player.birthDate),
    }));
    // เตรียมช่องว่างให้ครบจำนวนที่กำหนด จะได้กรอกรวดเดียวไม่ต้องกดเพิ่มทีละคน
    const want = (tournament?.playersPerTeam ?? 7) + (tournament?.maxSubs ?? 0);
    while (data.players.length < want) {
      data.players.push({ name: '', number: '', position: 'Player', birthDate: '', photoUrl: '' });
    }
    rowVersionRef.current = data.rowVersion;
    setEditing(data);
    setDirty(false);
    setAutoState('idle');
    setAutoErr('');
  };

  const setPlayer = (i: number, field: keyof PlayerRow, value: string) => {
    if (!editing) return;
    const players = [...editing.players];
    players[i] = { ...players[i], [field]: value };
    setEditing({ ...editing, players });
    setDirty(true);
  };

  /**
   * ส่งข้อมูลทีมขึ้น server — ใช้ทั้งปุ่มบันทึกและการบันทึกอัตโนมัติ
   *
   * คืน rowVersion ใหม่ที่ server ให้มา ถ้าไม่อัปเดตกลับเข้า state
   * การบันทึกครั้งถัดไปจะโดน 409 "ข้อมูลถูกแก้ไปแล้ว" ทั้งที่เป็นเราเองที่บันทึก
   */
  const pushTeam = async (data: TeamData, rowVersion?: number) => {
    const players = data.players
      .filter(p => p.name.trim() !== '')
      .map(p => ({
        id: p.id, name: p.name.trim(), number: p.number.trim(),
        position: normalizePlayerPosition(p.position), birthDate: p.birthDate, photoUrl: p.photoUrl || '',
      }));
    const body = {
      teamId: data.id,
      name: data.name,
      shortName: data.shortName,
      managerName: data.managerName,
      managerPhone: data.managerPhone,
      coachName: data.coachName,
      coachPhone: data.coachPhone,
      directorName: data.directorName,
      logoUrl: data.logoUrl || '',
      docUrl: data.docUrl || '',
      slipUrl: data.slipUrl || '',
      rowVersion: rowVersion ?? rowVersionRef.current ?? data.rowVersion,
      players,
    };
    try {
      const r = await apiPost('saveTeam', body);
      if (r.team?.rowVersion !== undefined) rowVersionRef.current = r.team.rowVersion;
      return r.team as TeamData | undefined;
    } catch (e) {
      const err = e as ApiError;
      // 409 = row_version ไม่ตรง
      //
      // เกือบทุกครั้งคือ "เราชนกับตัวเอง": การบันทึกอัตโนมัติเพิ่งเดิน row_version
      // ไปหนึ่งขั้น แล้วครูกดปุ่มบันทึกด้วยเลขเดิมพอดี ไม่ใช่คนอื่นมาแก้จริง ๆ
      // เดิมเจอแล้วเด้งออกจากหน้าแก้ไขทันที ครูเห็นเป็น "กดบันทึกแล้วไม่บันทึก"
      //
      // ดึงเลขล่าสุดมาแล้วส่งซ้ำหนึ่งครั้ง — ข้อมูลที่ครูกรอกคือฉบับที่ถูกต้อง
      // ถ้ายังชนอีกจึงค่อยถือว่าเป็นการชนกับคนอื่นจริง แล้วโยนต่อ
      const current = (err.payload as any)?.currentRowVersion;
      if (err.status === 409 && current !== undefined
          && rowVersionRef.current !== current) {
        rowVersionRef.current = current;
        const r = await apiPost('saveTeam', { ...body, rowVersion: current });
        if (r.team?.rowVersion !== undefined) rowVersionRef.current = r.team.rowVersion;
        return r.team as TeamData | undefined;
      }
      throw e;
    }
  };

  const save = async (thenSubmit = false) => {
    if (!editing) return;
    if (hasDup) {
      notify('เลขเสื้อซ้ำ', `เลข ${[...dupNumbers].join(', ')} ถูกใช้มากกว่าหนึ่งคน`, 'warning');
      return;
    }
    const players = editing.players
      .filter(p => p.name.trim() !== '')
      .map(p => ({
        id: p.id, name: p.name.trim(), number: p.number.trim(),
        position: normalizePlayerPosition(p.position), birthDate: p.birthDate, photoUrl: p.photoUrl || '',
      }));

    if (thenSubmit && players.length === 0) {
      notify('ยังส่งไม่ได้', 'ต้องกรอกรายชื่อผู้เล่นอย่างน้อย 1 คน', 'warning');
      return;
    }
    setBusy('save');
    try {
      // รอให้การบันทึกอัตโนมัติที่ค้างอยู่จบก่อน ไม่งั้นสองคำขอจะถือ row_version
      // คนละเลขแล้วชนกันเอง (นี่คือที่มาของ "กดบันทึกแล้วเด้งออก")
      for (let i = 0; i < 40 && savingRef.current; i++) {
        await new Promise(r => setTimeout(r, 100));
      }
      savingRef.current = true;
      try {
        await pushTeam(editing);
      } finally {
        savingRef.current = false;
      }
      if (thenSubmit) {
        await apiPost('submitTeam', { teamId: editing.id });
        notify('ส่งข้อมูลแล้ว', 'รอผู้ดูแลตรวจสอบและอนุมัติ', 'success');
        setJustSubmitted(editing.name || 'ทีมของคุณ');
      } else {
        notify('บันทึกแล้ว', `รายชื่อ ${players.length} คน`, 'success');
      }
      clearDraft(editing.id);
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

  /**
   * ตัวดูรูปนักกีฬาแบบเต็มจอ
   *
   * ประกาศไว้ตรงนี้แล้ววางในทุกหน้าย่อย เพราะ component นี้ return หลายจุด
   * (ยังไม่เข้าระบบ / แก้ไขทีม / รายการทีม) ตอนแรกวาง JSX ไว้ในหน้ารายการทีม
   * อันเดียว แต่รูปที่กดได้อยู่ในหน้าแก้ไขทีม กดแล้ว state เปลี่ยนจริงแต่ไม่มี
   * อะไรเรนเดอร์ออกมา
   *
   * portal ไป body ด้วย เพื่อไม่ให้ไปชน z-index กับแถบ sticky ด้านบนและปุ่มลอยด้านล่าง
   */
  const photoViewer = viewPhoto ? createPortal(
    <div
      className="fixed inset-0 z-[2000] bg-black/85 flex items-center justify-center p-4"
      onClick={() => setViewPhoto(null)}
      role="dialog" aria-modal="true" aria-label={`รูป ${viewPhoto.name}`}
    >
      <button
        onClick={() => setViewPhoto(null)}
        aria-label="ปิด"
        className="absolute top-4 right-4 p-2 rounded-full"
        style={{ backgroundColor: 'rgba(255,255,255,0.2)', color: '#ffffff' }}
      >
        <XCircle className="w-6 h-6" />
      </button>
      <div className="max-w-lg w-full" onClick={e => e.stopPropagation()}>
        <img
          src={viewPhoto.url}
          alt={viewPhoto.name}
          className="w-full max-h-[75vh] object-contain rounded-2xl"
        />
        <p className="text-center text-sm mt-3" style={{ color: '#ffffff' }}>
          {viewPhoto.name}
        </p>
        <p className="text-center text-xs mt-1" style={{ color: '#cbd5e1' }}>
          แตะนอกรูปเพื่อปิด
        </p>
      </div>
    </div>,
    document.body
  ) : null;

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

            {/* บัญชีที่ผู้ดูแลผูกกับโรงเรียนไว้แล้ว เข้าได้เลยไม่ต้องหารหัส */}
            {currentUser?.schoolId && currentUser.schoolVerified && (
              <div className="mt-4 mb-1 rounded-2xl border border-indigo-200 bg-indigo-50 p-3">
                <p className="text-xs text-indigo-800">
                  บัญชีของคุณผูกกับ <b>{currentUser.schoolName}</b> แล้ว
                </p>
                <button
                  onClick={() => loginWithAccount(false)}
                  disabled={busy === 'account'}
                  className="mt-2 w-full py-2.5 rounded-xl bg-indigo-600 text-white font-bold text-sm
                             flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {busy === 'account'
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <CheckCircle2 className="w-4 h-4" />}
                  เข้าจัดการทีมด้วยบัญชีนี้
                </button>
                <p className="text-[11px] text-indigo-500 mt-2 text-center">หรือใช้รหัสโรงเรียนด้านล่าง</p>
              </div>
            )}

            {currentUser?.schoolId && !currentUser.schoolVerified && (
              <div className="mt-4 mb-1 rounded-2xl border border-amber-200 bg-amber-50 p-3">
                <p className="text-xs text-amber-800 leading-relaxed">
                  บัญชีของคุณเลือกไว้ว่าอยู่ <b>{currentUser.schoolName}</b> แต่ผู้จัดการแข่งขัน
                  ยังไม่ได้รับรอง จึงต้องใช้รหัสโรงเรียนก่อน — แจ้งผู้ดูแลให้รับรองบัญชีของคุณ
                  แล้วครั้งต่อไปจะเข้าได้เลย
                </p>
              </div>
            )}

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

  // ── ส่งเรียบร้อยแล้ว ────────────────────────────────────────────────────
  //
  // ขั้นตอนของครูจบตรงนี้จริง ๆ จึงต้องมีทางออกที่กดครั้งเดียวถึง
  // ไม่ใช่ปล่อยกลับไปหน้ารายการทีมแล้วให้ไล่กดย้อนกลับเอง
  if (justSubmitted) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-5">
        <div className="w-full max-w-sm rounded-3xl bg-white border border-slate-200 p-6 text-center shadow-sm">
          <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-9 h-9" />
          </div>
          <h1 className="font-black text-xl text-slate-900 mt-4">ส่งรายชื่อเรียบร้อย</h1>
          <p className="text-sm text-slate-500 mt-2 leading-relaxed">
            {justSubmitted} ถูกส่งให้ผู้ดูแลตรวจสอบแล้ว<br />
            ผลการอนุมัติจะแจ้งกลับผ่านระบบ
          </p>

          <button onClick={onExit}
            className="mt-6 w-full min-h-12 rounded-xl bg-indigo-600 text-white font-black
                       flex items-center justify-center gap-2">
            <ChevronLeft className="w-5 h-5" /> ไปหน้าหลัก
          </button>
          <button onClick={() => setJustSubmitted(null)}
            className="mt-2 w-full min-h-12 rounded-xl border border-slate-200 text-slate-600 font-bold">
            ดูทีมของฉันต่อ
          </button>
        </div>
      </div>
    );
  }

  // ── กำลังแก้ไขทีม ───────────────────────────────────────────────────────
  if (editing) {
    const limit = (tournament?.playersPerTeam ?? 7) + (tournament?.maxSubs ?? 0);
    const filled = editing.players.filter(p => p.name.trim()).length;
    // รายการเก่าที่ยังไม่ได้ตั้งค่า (หรือโค้ดขึ้นก่อนรัน db/20) = พฤติกรรมเดิม
    const docMode = tournament?.docMode ?? 'Optional';
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
          {/* สถานะการบันทึก — ครูต้องรู้ว่าที่พิมพ์ไปแล้วปลอดภัยหรือยัง
              โดยไม่ต้องกดปุ่มบันทึกเพื่อความสบายใจทุก 2 นาที */}
          <div className={`rounded-xl border p-2.5 flex items-center gap-2 text-xs ${
            autoState === 'error' ? 'border-rose-200 bg-rose-50 text-rose-800'
              : autoState === 'saved' ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-slate-200 bg-slate-50 text-slate-600'}`}>
            {autoState === 'saving' ? <Loader2 className="w-4 h-4 animate-spin shrink-0" />
              : autoState === 'error' ? <CloudOff className="w-4 h-4 shrink-0" />
              : <Cloud className="w-4 h-4 shrink-0" />}
            <span className="flex-1 min-w-0">
              {autoState === 'saving' ? 'กำลังบันทึก...'
                : autoState === 'error'
                  ? `บันทึกอัตโนมัติไม่สำเร็จ${autoErr ? ' — ' + autoErr : ''} · กดปุ่ม "บันทึกร่าง" ด้านล่างอีกครั้ง`
                  : autoState === 'pending' ? 'ยังไม่ได้บันทึก จะบันทึกให้เองในอีกครู่'
                  : hasDup ? 'หยุดบันทึกอัตโนมัติไว้จนกว่าจะแก้เลขเสื้อซ้ำ'
                  : autoAt
                    ? `บันทึกอัตโนมัติแล้ว ${autoAt.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.`
                    : 'ระบบจะบันทึกให้เองทุกครั้งที่หยุดพิมพ์'}
            </span>
          </div>

          {/* เลขเสื้อซ้ำ — บอกตั้งแต่ตอนพิมพ์ ไม่ใช่ตอนกดส่งแล้วโดนปฏิเสธ */}
          {hasDup && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 flex gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-900 leading-relaxed">
                <strong>เลขเสื้อ {[...dupNumbers].join(', ')} ซ้ำกัน</strong> —
                นักกีฬาในทีมเดียวกันใส่เลขซ้ำไม่ได้ กรุณาแก้ก่อนจึงจะบันทึกได้
                (ช่องที่ซ้ำมีกรอบสีส้ม)
              </p>
            </div>
          )}

          {editing.status === 'Approved' && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 flex gap-2">
              <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-900 leading-relaxed">
                <p className="font-bold">ทีมนี้ผ่านการอนุมัติแล้ว</p>
                <p className="mt-1">
                  ถ้าบันทึกการแก้ไข สถานะจะกลับไปเป็น "ส่งแล้ว รอตรวจ"
                  และเจ้าภาพจะต้องตรวจรายชื่อใหม่ก่อนอนุมัติอีกครั้ง
                  หากไม่ได้ตั้งใจเปลี่ยนอะไร ให้กดย้อนกลับโดยไม่บันทึก
                </p>
              </div>
            </div>
          )}

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
            {/* รายการที่ตั้งเป็น "ไม่รับเอกสาร" ให้ซ่อนช่องไปเลย ดีกว่าปล่อยให้ครู
                เดาว่าต้องส่งหรือไม่ แล้วไปตามถามในไลน์กลุ่ม (db/20) */}
            <div className={`grid gap-2 ${docMode === 'Off' ? 'grid-cols-2' : 'grid-cols-3'}`}>
              {([
                { key: 'logo', label: 'โลโก้ทีม', field: 'logoUrl' as const, accept: 'image/*' },
                ...(docMode === 'Off' ? [] : [{
                  key: 'doc',
                  label: docMode === 'Required' ? 'เอกสารรับรอง *' : 'เอกสารรับรอง',
                  field: 'docUrl' as const, accept: 'image/*,application/pdf',
                }]),
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
              รองรับรูปภาพและ PDF ไม่เกิน 8 MB
              {docMode === 'Required'
                ? ' · เอกสารรับรองต้องแนบก่อนกดยืนยันส่งรายชื่อ'
                : ' · ไม่บังคับ แต่ผู้ดูแลอาจขอเพิ่มภายหลัง'}
            </p>

            {docMode !== 'Off' && tournament?.docTemplateUrl && (
              <a href={tournament.docTemplateUrl} target="_blank" rel="noreferrer"
                className="flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50
                           px-3 py-2.5 text-xs font-bold text-indigo-700">
                <Download className="w-4 h-4 shrink-0" />
                <span className="flex-1 min-w-0">ดาวน์โหลดแบบฟอร์มเอกสารรับรอง</span>
              </a>
            )}

            {/* ซ้ำกับหน้ารายการทีมโดยตั้งใจ — ตรงนี้คือวินาทีที่ครูกำลังจะโอนจริง
                ถ้าต้องย้อนกลับไปดูเลขบัญชีหน้าก่อน ข้อมูลที่กรอกค้างไว้จะเสี่ยงหาย */}
            <PaymentInfoCard
              fee={tournament?.registrationFee}
              bankName={tournament?.bankName}
              bankAccount={tournament?.bankAccount}
              accountName={tournament?.accountName}
              className="!border-emerald-200"
            />
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
                <Users className="w-4 h-4" /> รายชื่อนักกีฬา
              </h2>
              <span className="text-xs text-slate-500">สูงสุด {limit} คน</span>
            </div>
            <p className="text-[11px] text-slate-400 mb-3">
              กรอกเฉพาะชื่อก็พอ · เลขเสื้อ ตำแหน่ง และวันเกิดใส่ทีหลังได้ · ระบบคำนวณอายุให้อัตโนมัติ
            </p>

            <div className="space-y-2">
              {editing.players.map((p, i) => (
                <div key={i} className="flex gap-2 items-start">
                  {/* รูปนักกีฬา — แตะกรอบเพื่อถ่าย/เลือกรูป ไม่บังคับ */}
                  {/* พื้นที่กดต้องไม่ต่ำกว่า 44px ตามที่นิ้วโป้งกดโดนจริง
                      ของเดิมคำว่า "เปลี่ยน" เป็นตัวอักษร 9px สูงราว 12px
                      บนมือถือแทบกดไม่โดน ต้องซูมหน้าจอก่อนถึงจะกดติด */}
                  <div className="shrink-0 flex flex-col items-center gap-1.5 w-14">
                    {p.photoUrl ? (
                      <>
                        {/* แตะที่รูป = ดูใหญ่ ส่วนเปลี่ยนรูปอยู่ปุ่มด้านล่าง
                            แยกกันเพราะแตะรูปเพื่อ "ดู" เป็นสิ่งที่คนคาดหวังมากกว่า */}
                        <button
                          type="button"
                          onClick={() => setViewPhoto({ url: p.photoUrl, name: p.name || `นักกีฬาคนที่ ${i + 1}` })}
                          title="แตะเพื่อดูรูปใหญ่"
                          className="w-14 h-14 rounded-xl border border-slate-200 overflow-hidden bg-slate-50"
                        >
                          {uploading === `p${i}`
                            ? <Loader2 className="w-5 h-5 animate-spin text-slate-400 mx-auto" />
                            : <img src={p.photoUrl} className="w-full h-full object-cover" alt="" />}
                        </button>
                        <label className="cursor-pointer w-full h-11 rounded-lg bg-indigo-50 border border-indigo-200
                                          text-indigo-700 text-[11px] font-bold
                                          flex items-center justify-center gap-1 active:bg-indigo-100">
                          <input type="file" accept="image/*" className="hidden"
                            onChange={async e => {
                              const f = e.target.files?.[0];
                              e.target.value = '';
                              if (!f) return;
                              const url = await upload(f, 'player', `p${i}`);
                              if (url) setPlayer(i, 'photoUrl', url);
                            }} />
                          <Camera className="w-3.5 h-3.5" /> เปลี่ยน
                        </label>
                      </>
                    ) : (
                      <label className="cursor-pointer w-full" title="แตะเพื่อใส่รูป">
                        <input type="file" accept="image/*" className="hidden"
                          onChange={async e => {
                            const f = e.target.files?.[0];
                            e.target.value = '';
                            if (!f) return;
                            const url = await upload(f, 'player', `p${i}`);
                            if (url) setPlayer(i, 'photoUrl', url);
                          }} />
                        <div className="w-14 h-14 rounded-xl border-2 border-dashed border-slate-300 overflow-hidden flex items-center justify-center bg-slate-50">
                          {uploading === `p${i}`
                            ? <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                            : <Camera className="w-5 h-5 text-slate-400" />}
                        </div>
                        <span className="block text-[11px] font-bold text-indigo-700 text-center mt-1.5 h-11
                                         leading-[2.75rem] rounded-lg bg-indigo-50 border border-indigo-200">
                          ใส่รูป
                        </span>
                      </label>
                    )}
                  </div>
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
                        <input
                          className={`${inp} py-2 text-sm ${
                            p.number.trim() !== '' && dupNumbers.has(p.number.trim())
                              ? 'border-amber-500 bg-amber-50 ring-1 ring-amber-400' : ''}`}
                          placeholder="เลขเสื้อ"
                          inputMode="numeric" value={p.number}
                          aria-invalid={dupNumbers.has(p.number.trim())}
                          onChange={e => setPlayer(i, 'number', e.target.value)} />
                        <label className="min-w-0">
                          <span className="sr-only">วันเกิดของ {p.name}</span>
                          <input className={`${inp} py-2 text-sm`} type="date"
                            aria-label={`วันเกิดของ ${p.name}`} max={todayForInput()}
                            value={p.birthDate || ''}
                            onChange={e => setPlayer(i, 'birthDate', e.target.value)} />
                          {p.birthDate && (
                            <span className={`mt-1 block rounded-lg px-2 py-1 text-center text-[11px] font-bold
                              ${playerAgeLabel(p.birthDate) === 'วันเกิดอยู่ในอนาคต'
                                ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>
                              {playerAgeLabel(p.birthDate) || 'รูปแบบวันเกิดไม่ถูกต้อง'}
                            </span>
                          )}
                        </label>
                        <label className="col-span-2 min-w-0">
                          <span className="mb-1 block text-[11px] font-bold text-slate-500">ตำแหน่งนักกีฬา</span>
                          <select className={`${inp} py-2 text-sm bg-white`}
                            aria-label={`ตำแหน่งของ ${p.name}`}
                            value={normalizePlayerPosition(p.position)}
                            onChange={e => setPlayer(i, 'position', e.target.value)}>
                            {PLAYER_POSITIONS.map(position => (
                              <option key={position.value} value={position.value}>{position.label}</option>
                            ))}
                          </select>
                        </label>
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
                onClick={() => { setEditing({ ...editing, players: [...editing.players, { name: '', number: '', position: 'Player', birthDate: '', photoUrl: '' }] }); setDirty(true); }}
                className="mt-3 w-full py-2.5 border-2 border-dashed border-slate-300 rounded-xl text-sm text-slate-500 hover:border-indigo-400 hover:text-indigo-600 flex items-center justify-center gap-1">
                <Plus className="w-4 h-4" /> เพิ่มแถว
              </button>
            )}
          </div>
        </div>

        {/* ปุ่มลอยด้านล่าง — นิ้วโป้งเอื้อมถึงตอนถือมือถือมือเดียว */}
        <div className="fixed bottom-0 inset-x-0 bg-white border-t border-slate-200 p-3 flex gap-2 safe-area-bottom">
          <button onClick={() => save(false)} disabled={busy === 'save' || hasDup}
            className="flex-1 py-3 rounded-xl border-2 border-slate-300 font-bold text-slate-700 disabled:opacity-50 flex items-center justify-center gap-2">
            {busy === 'save' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            บันทึกร่าง
          </button>
          <button onClick={() => save(true)} disabled={busy === 'save' || filled === 0 || hasDup}
            className="flex-1 py-3 rounded-xl bg-indigo-600 text-white font-bold disabled:opacity-50 flex items-center justify-center gap-2">
            <Send className="w-4 h-4" /> ยืนยันและส่ง
          </button>
        </div>
        {photoViewer}
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

              {/* ทีมที่อนุมัติแล้วยังต้องเปลี่ยนตัวได้ ตราบใดที่ยังไม่หมดเขต
                  (นักกีฬาเจ็บหรือติดสอบเป็นเรื่องที่เกิดหลังอนุมัติเสมอ)
                  แต่ต้องบอกล่วงหน้าว่าแก้แล้วสถานะจะกลับไปรอตรวจ
                  ไม่งั้นครูจะตกใจว่าทำไมทีมหลุดจากอนุมัติแล้ว */}
              {t.status === 'Approved' && !closed && (
                <div className="mt-2 flex gap-2 rounded-lg bg-amber-50 border border-amber-200 p-2">
                  <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-amber-800 leading-relaxed">
                    ยังเปลี่ยนตัวนักกีฬาได้จนถึงวันปิดแก้ไข
                    แต่เมื่อแก้แล้ว <strong>เจ้าภาพต้องตรวจและอนุมัติใหม่</strong>
                    สถานะจะกลับไปเป็น "ส่งแล้ว รอตรวจ" จนกว่าจะตรวจเสร็จ
                  </p>
                </div>
              )}

              {!closed && t.status !== 'Withdrawn' && (
                <div className="flex gap-2 mt-3">
                  <button onClick={() => openTeam(t)}
                    className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700">
                    {t.status === 'Invited'
                      ? 'ยืนยันเข้าร่วม + กรอกรายชื่อ'
                      : t.status === 'Approved' ? 'ขอเปลี่ยนตัวนักกีฬา' : 'แก้ไขข้อมูล'}
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

        {/* บัญชีรับค่าสมัคร — วางท้ายรายการทีม ครูเห็นตั้งแต่หน้าแรกที่เข้ามา
            ไม่ต้องเข้าไปในหน้าแก้ไขทีมก่อนถึงจะรู้ว่าโอนไปที่ไหน */}
        <PaymentInfoCard
          fee={tournament?.registrationFee}
          bankName={tournament?.bankName}
          bankAccount={tournament?.bankAccount}
          accountName={tournament?.accountName}
          note={<>โอนแล้วแนบสลิปได้ที่ปุ่ม <strong>แก้ไขข้อมูล</strong> ของทีม
            ในหัวข้อ &quot;หลักฐานโอนเงิน&quot; — ผู้จัดการแข่งขันจะตรวจสอบและยืนยันให้</>}
        />
      </div>
      {photoViewer}
    </div>
  );
};

export default SchoolPortal;
