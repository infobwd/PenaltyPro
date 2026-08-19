import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, Award, Check, Download, Image as ImageIcon, Loader2, Palette, Printer,
  Save, Search, Settings, Upload, Users, X,
} from 'lucide-react';
import { apiDownload, apiGet, apiPost } from '../services/apiConfig';
import { fileToBase64 } from '../services/sheetService';
import CertificateTemplateEditor from './CertificateTemplateEditor';

/**
 * ใบเกียรติบัตร — เลือกผู้รับแล้วสั่งพิมพ์เป็น PDF
 *
 * ทำไมใช้หน้าต่างพิมพ์แทนไลบรารีสร้าง PDF:
 *   - เอกสารทุกใบในระบบนี้ (ใบอนุโมทนา รหัสโรงเรียน ใบสมัคร) ใช้ทางเดียวกันอยู่แล้ว
 *   - เลือกคนเดียว = ได้ไฟล์เดียว / เลือกทั้งทีม = ได้ไฟล์เดียวหลายหน้า
 *     โดยไม่ต้องเขียนตัวรวมไฟล์เอง
 *   - ไม่ต้องเพิ่ม dependency ที่ต้องไปติดตั้งบนโฮสต์
 *
 * เลขที่ใบถูกจองไว้กับคนตั้งแต่ก่อนพิมพ์ (issueCertificates) คนเดิมจึงได้เลขเดิม
 * เสมอแม้จะพิมพ์ซ้ำอีกกี่ครั้ง หรือมีคนเพิ่ม/ถอนออกจากรายการทีหลัง
 */

type Notice = (title: string, message?: string, type?: 'success' | 'error' | 'info' | 'warning') => void;

/** Sponsor มีเลขชุดของตัวเองแต่ออกใบจากหน้า /sponsors ไม่ใช่หน้านี้ */
type Role = 'Player' | 'Coach' | 'Referee';
type NumberedRole = Role | 'Sponsor';

const ROLES: { key: Role; label: string; hint: string }[] = [
  { key: 'Player',  label: 'นักกีฬา',      hint: 'จากทีมที่อนุมัติแล้ว' },
  { key: 'Coach',   label: 'ผู้ควบคุมทีม', hint: 'ผู้จัดการทีมและผู้ฝึกสอน' },
  { key: 'Referee', label: 'กรรมการ',      hint: 'บัญชีกรรมการและผู้ดูแลรายการ' },
];

type Person = {
  key: string;
  name: string;
  team: string;
  teamId: string;
  seq: number | null;
  certNo: string;
};

type CertSettings = {
  title: string;
  signerName: string;
  signerTitle: string;
  signatureUrl: string;
  body: Record<Role, string>;
  numberFormat: Record<NumberedRole, string>;
  digits: number;
  /** เปิดให้ผู้ใช้ทั่วไปเข้าหน้านี้และโหลดใบของตัวเองได้ */
  isPublic: boolean;
  /** ภาพพื้นหลังต่อบทบาท — ว่างคือใช้กรอบเรียบที่ระบบวาดให้ */
  background: Record<Role, string>;
  /** โซนที่วางบล็อกข้อความ ให้เลี่ยงลวดลายของพื้นหลัง */
  zone: Record<Role, Zone>;
};

type Zone = 'top' | 'middle' | 'bottom';

const ZONES: { key: Zone; label: string }[] = [
  { key: 'top', label: 'บน' },
  { key: 'middle', label: 'กลาง' },
  { key: 'bottom', label: 'ล่าง' },
];

export type Signatory = { name: string; position: string; signatureUrl: string };

/** เทมเพลตของบทบาทหนึ่ง — โครงเดียวกับ api/lib/CertTemplate.php */
/** ส่วนข้อความที่เลือกฟอนต์และขอบขาวแยกกันได้ — ตรงกับ CERT_PARTS ฝั่ง PHP */
export const CERT_PARTS = [
  { key: 'Header', label: 'ชื่อหน่วยงาน' },
  { key: 'Title', label: 'หัวเรื่อง' },
  { key: 'SubHeader', label: 'คำนำหน้าชื่อ' },
  { key: 'Name', label: 'ชื่อผู้รับ' },
  { key: 'Body', label: 'เนื้อความ' },
  { key: 'Date', label: 'บรรทัดวันที่' },
  { key: 'Sign', label: 'ผู้ลงนาม' },
  { key: 'Serial', label: 'เลขที่ใบ' },
] as const;

/** แม่แบบที่บันทึกไว้ ใช้ข้ามบทบาทและข้ามรายการได้ */
export type CertPreset = {
  id: string;
  name: string;
  updatedAt: string;
  template: CertTemplate;
  canDelete: boolean;
};

/** ส่วนที่ตั้งระยะห่างเหนือข้อความได้ (ผู้ลงนามใช้ signBottom แทน) */
export const CERT_GAP_PARTS = [
  { key: 'Header', label: 'ชื่อหน่วยงาน' },
  { key: 'Title', label: 'หัวเรื่อง' },
  { key: 'SubHeader', label: 'คำนำหน้าชื่อ' },
  { key: 'Name', label: 'ชื่อผู้รับ' },
  { key: 'Body', label: 'เนื้อความ' },
  { key: 'Date', label: 'บรรทัดวันที่' },
] as const;

export type CertTemplate = {
  headerText: string;
  /** 0 = ไหลอยู่หัวบล็อกข้อความ / >0 = ตรึงห่างจากขอบบนเท่านี้ */
  headerTop: number;
  subHeaderText: string;
  title: string;
  showTitle: boolean;
  bodyText: string;
  dateText: string;
  showRank: boolean;

  backgroundUrl: string;
  frameStyle: string;
  logoLeftUrl: string;
  logoRightUrl: string;
  logoHeight: number;
  /** 0 = วางหัวบล็อกข้อความ / >0 = ตรึงห่างจากขอบบนเท่านี้ */
  logoTop: number;

  signatories: Signatory[];
  showSignatureLine: boolean;
  signatureSpacing: number;
  /** 0 = ต่อท้ายเนื้อความ / >0 = ตรึงชิดขอบล่างเท่านี้ */
  signBottom: number;
  signatureHeight: number;

  zone: Zone;
  contentOffset: number;
  contentWidth: number;
  serialTop: number;
  serialRight: number;
  serialPlate: boolean;
  serialPlateColor: string;
  serialPlatePad: number;
  sizeSerial: number;
  colorSerial: string;
  qrBottom: number;
  qrRight: number;
  qrPlate: boolean;
  qrPlatePad: number;
  qrPlateBorder: boolean;
  qrCaption: string;
  qrSize: number;

  fontFamily: string;
  lineHeight: number;
  blockGap: number;
  sizeHeader: number;
  sizeSubHeader: number;
  sizeTitle: number;
  sizeName: number;
  sizeBody: number;
  sizeSign: number;
  colorTitle: string;
  colorName: string;
  colorText: string;

  /** แถบพื้นโปร่งใต้ข้อความทั้งบล็อก */
  textPlate: boolean;
  textPlateOpacity: number;
  /** ความหนาขอบขาวรอบตัวอักษร (mm) */
  outlineWidth: number;
} & Record<`font${typeof CERT_PARTS[number]['key']}`, string>
  & Record<`outline${typeof CERT_PARTS[number]['key']}`, boolean>
  /** null = ใช้ระยะห่างกลางของทั้งใบ (blockGap) */
  & Record<`gap${typeof CERT_GAP_PARTS[number]['key']}`, number | null>;

const FRAME_LABELS: Record<string, string> = {
  'none': 'ไม่มีกรอบ',
  'gold-double': 'เส้นคู่สีทอง',
  'gold-corners': 'มุมทอง',
  'navy-line': 'เส้นเดี่ยวน้ำเงิน',
  'thai-premium': 'ทองหนา 2 ชั้น',
};

type CertData = {
  settings: CertSettings;
  templates: Record<Role, CertTemplate>;
  /** รายชื่อฟอนต์ที่ฝังไว้ฝั่ง server — key -> ชื่อที่แสดง */
  fonts: Record<string, string>;
  frames: string[];
  verifyEnabled: boolean;
  /** สิทธิ์จาก server เท่านั้น — ห้ามเดาจากฝั่งหน้าเว็บ */
  canManage: boolean;
  people: Record<Role, Person[]>;
  teams: { id: string; name: string }[];
  tournamentName: string;
};

type Props = {
  tournamentId: string;
  tournamentName: string;
  competitionLogo?: string;
  onBack: () => void;
  notify: Notice;
};

const esc = (v: string): string => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

/** แทนช่องในข้อความ — เว้นบรรทัดของผู้ใช้ต้องกลายเป็น <br> ไม่ใช่หายไป */
const fillBody = (tpl: string, p: Person, tournament: string): string =>
  esc(tpl)
    .replace(/\{name\}/g, `<b>${esc(p.name)}</b>`)
    .replace(/\{team\}/g, esc(p.team))
    .replace(/\{tournament\}/g, esc(tournament))
    .replace(/\n/g, '<br>');

const inputClass = 'w-full min-h-11 rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-indigo-500';

const CertificatePage: React.FC<Props> = ({
  tournamentId, tournamentName, competitionLogo, onBack, notify,
}) => {
  const [data, setData] = useState<CertData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [role, setRole] = useState<Role>('Player');
  const [teamFilter, setTeamFilter] = useState('');
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [designOpen, setDesignOpen] = useState(false);
  const [form, setForm] = useState<CertSettings | null>(null);
  const [signatureFile, setSignatureFile] = useState<File | null>(null);
  /** พื้นหลังที่เพิ่งเลือกแต่ยังไม่กดบันทึก — เก็บเป็น data URL ไว้พรีวิว */
  const [bgDraft, setBgDraft] = useState<Partial<Record<Role, string>>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await apiGet<any>('getCertificateData', { tournamentId });
      setData(d);
      setForm(d.settings);
    } catch (error: any) {
      notify('เปิดหน้าเกียรติบัตรไม่ได้', error?.message || 'กรุณาลองใหม่', 'error');
    } finally {
      setLoading(false);
    }
  }, [tournamentId, notify]);

  useEffect(() => { void load(); }, [load]);

  // เปลี่ยนบทบาท = เริ่มเลือกใหม่ ไม่งั้นจะพิมพ์คนของบทบาทก่อนหน้าติดไปด้วย
  useEffect(() => { setPicked(new Set()); setTeamFilter(''); }, [role]);

  const people = data?.people[role] ?? [];

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return people.filter(p =>
      (teamFilter === '' || p.teamId === teamFilter)
      && (q === '' || (p.name + ' ' + p.team).toLowerCase().includes(q)));
  }, [people, teamFilter, search]);

  const toggle = (key: string) => setPicked(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const allVisiblePicked = visible.length > 0 && visible.every(p => picked.has(p.key));
  const toggleAllVisible = () => setPicked(prev => {
    const next = new Set(prev);
    if (allVisiblePicked) visible.forEach(p => next.delete(p.key));
    else visible.forEach(p => next.add(p.key));
    return next;
  });

  const saveSettings = async () => {
    if (!form || busy) return;
    setBusy(true);
    try {
      const payload: Record<string, unknown> = {
        tournamentId,
        title: form.title, signerName: form.signerName, signerTitle: form.signerTitle,
        signatureUrl: form.signatureUrl,
        body: form.body, numberFormat: form.numberFormat, digits: form.digits,
        isPublic: form.isPublic,
        // ส่ง data URL เมื่อเพิ่งเลือกไฟล์ ไม่งั้นส่ง URL เดิม (ว่าง = เอาออก)
        background: {
          Player: bgDraft.Player ?? form.background.Player,
          Coach: bgDraft.Coach ?? form.background.Coach,
          Referee: bgDraft.Referee ?? form.background.Referee,
        },
        zone: form.zone,
      };
      if (signatureFile) payload.signatureFile = await fileToBase64(signatureFile);
      await apiPost('saveCertificateSettings', payload);
      setSignatureFile(null);
      setBgDraft({});
      await load();
      setSettingsOpen(false);
      notify('บันทึกค่าตั้งเกียรติบัตรแล้ว', 'ใบที่ออกหลังจากนี้จะใช้ค่าใหม่', 'success');
    } catch (error: any) {
      notify('บันทึกไม่สำเร็จ', error?.message || 'กรุณาลองใหม่', 'error');
    } finally {
      setBusy(false);
    }
  };

  /**
   * ดาวน์โหลดเป็นไฟล์ PDF — ทางหลัก
   *
   * ให้ server สร้างด้วย mPDF เพราะการพิมพ์ผ่านเบราว์เซอร์ตัดภาพพื้นหลังทิ้ง
   * เว้นแต่ผู้ใช้จะไปติ๊ก "Background graphics" เอง และผลลัพธ์ยังต่างกัน
   * ไปตามเบราว์เซอร์จนใบในงานเดียวกันไม่เหมือนกัน
   */
  const downloadPdf = async () => {
    if (!data || picked.size === 0 || busy) return;
    setBusy(true);
    try {
      const chosen = people.filter(p => picked.has(p.key));
      await apiDownload('downloadCertificates', {
        tournamentId, role,
        subjects: chosen.map(p => ({ key: p.key, name: p.name, team: p.team })),
      }, 'เกียรติบัตร.pdf');
      await load();   // ดึงเลขที่ที่เพิ่งจองกลับมาแสดงในรายการ
      notify('ดาวน์โหลดแล้ว',
        chosen.length === 1 ? 'ไฟล์ PDF 1 ใบ' : `ไฟล์เดียว ${chosen.length} หน้า`, 'success');
    } catch (error: any) {
      notify('ออกไฟล์ PDF ไม่สำเร็จ', error?.message || 'กรุณาลองใหม่', 'error');
    } finally {
      setBusy(false);
    }
  };

  /**
   * พิมพ์ผ่านเบราว์เซอร์ — ทางสำรอง
   *
   * เก็บไว้เผื่อ mPDF บนโฮสต์ใช้ไม่ได้ (ยังไม่ได้อัป vendor หรือฟอนต์)
   * ทางนี้ไม่มีภาพพื้นหลัง จึงไม่ใช่ทางหลักอีกต่อไป
   */
  const print = async () => {
    if (!data || picked.size === 0 || busy) return;
    setBusy(true);
    try {
      const chosen = people.filter(p => picked.has(p.key));
      const r = await apiPost<any>('issueCertificates', {
        tournamentId, role,
        subjects: chosen.map(p => ({ key: p.key, name: p.name, team: p.team })),
      });
      const noByKey = new Map<string, string>(
        (r.issued ?? []).map((x: any) => [x.key, x.certNo]));

      const s = data.settings;
      const pages = chosen.map(p => `
        <section class="cert">
          ${s.title ? `<div class="cert-no">เลขที่ ${esc(noByKey.get(p.key) || p.certNo)}</div>` : ''}
          ${competitionLogo ? `<img class="logo" src="${esc(competitionLogo)}" alt="">` : ''}
          <h1>${esc(s.title)}</h1>
          <div class="body">${fillBody(s.body[role], p, data.tournamentName || tournamentName)}</div>
          <div class="sign">
            ${s.signatureUrl ? `<img class="sig" src="${esc(s.signatureUrl)}" alt="">` : '<div class="sig-gap"></div>'}
            <div class="line"></div>
            <div class="signer">( ${esc(s.signerName || '.'.repeat(20))} )</div>
            <div class="signer-title">${esc(s.signerTitle)}</div>
          </div>
        </section>`).join('');

      const win = window.open('', '_blank');
      if (!win) {
        notify('เปิดหน้าต่างพิมพ์ไม่ได้', 'เบราว์เซอร์บล็อกป๊อปอัป กรุณาอนุญาตแล้วลองใหม่', 'warning');
        return;
      }
      win.document.write(`<!doctype html><html lang="th"><head><meta charset="utf-8">
        <title>เกียรติบัตร — ${esc(tournamentName)}</title>
        <style>
          /* แนวนอน A4 — ใบเกียรติบัตรไทยใช้แนวนี้เป็นมาตรฐาน */
          @page { size: A4 landscape; margin: 0; }
          * { box-sizing: border-box; }
          body { margin: 0; font-family: 'Sarabun', 'TH Sarabun New', sans-serif; color: #1e293b; }
          .cert {
            width: 297mm; height: 210mm; padding: 22mm 26mm;
            display: flex; flex-direction: column; align-items: center; justify-content: center;
            text-align: center; position: relative;
            border: 6px double #c7a44a; page-break-after: always;
          }
          /* หน้าสุดท้ายไม่ต้องขึ้นหน้าใหม่ ไม่งั้นได้หน้าว่างท้ายไฟล์ */
          .cert:last-child { page-break-after: auto; }
          .cert-no { position: absolute; top: 14mm; right: 20mm; font-size: 14pt; color: #64748b; }
          .logo { height: 26mm; object-fit: contain; margin-bottom: 6mm; }
          h1 { font-size: 40pt; margin: 0 0 10mm; letter-spacing: .04em; color: #0f172a; }
          .body { font-size: 22pt; line-height: 1.9; max-width: 220mm; }
          .sign { margin-top: 14mm; }
          .sig { height: 20mm; object-fit: contain; display: block; margin: 0 auto -4mm; }
          .sig-gap { height: 16mm; }
          .line { width: 70mm; border-bottom: 1px dotted #475569; margin: 0 auto 3mm; }
          .signer { font-size: 18pt; }
          .signer-title { font-size: 16pt; color: #475569; }
          @media screen {
            body { background: #e2e8f0; padding: 16px; }
            .cert { background: #fff; margin: 0 auto 16px; box-shadow: 0 10px 30px rgba(0,0,0,.15); }
          }
        </style></head><body>${pages}
        <script>window.onload = function () { window.focus(); window.print(); };<\/script>
        </body></html>`);
      win.document.close();

      await load();   // ดึงเลขที่ที่เพิ่งจองกลับมาแสดงในรายการ
    } catch (error: any) {
      notify('ออกเกียรติบัตรไม่สำเร็จ', error?.message || 'กรุณาลองใหม่', 'error');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[100dvh] bg-slate-50 flex items-center justify-center text-slate-500">
        <Loader2 className="w-6 h-6 animate-spin mr-2" /> กำลังโหลด…
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-slate-50 pb-28">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="max-w-5xl mx-auto h-16 px-3 sm:px-5 flex items-center gap-3">
          <button onClick={onBack} aria-label="กลับ"
            className="w-10 h-10 rounded-xl hover:bg-slate-100 flex items-center justify-center">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="font-black text-slate-900 truncate flex items-center gap-2">
              <Award className="w-5 h-5 text-amber-500 shrink-0" /> ใบเกียรติบัตร
            </h1>
            <p className="text-[11px] text-slate-500 truncate">{tournamentName}</p>
          </div>
          {/* ปุ่มตั้งค่าโผล่เฉพาะคนที่ server ยืนยันว่าจัดการรายการนี้ได้ */}
          {data?.canManage && (
            <>
              <button onClick={() => setDesignOpen(true)}
                title={`ออกแบบใบของ${ROLES.find(r => r.key === role)?.label}`}
                className="min-h-10 px-3 rounded-xl bg-indigo-50 text-indigo-700 text-xs font-black flex items-center gap-2">
                <Palette className="w-4 h-4" /> <span className="hidden sm:inline">ออกแบบใบ</span>
              </button>
              <button onClick={() => setSettingsOpen(true)}
                className="min-h-10 px-3 rounded-xl bg-slate-100 text-slate-700 text-xs font-black flex items-center gap-2">
                <Settings className="w-4 h-4" /> <span className="hidden sm:inline">ตั้งค่า</span>
              </button>
            </>
          )}
        </div>

        <div className="max-w-5xl mx-auto px-3 sm:px-5 pb-3 flex gap-2">
          {ROLES.map(r => (
            <button key={r.key} onClick={() => setRole(r.key)}
              className={`flex-1 min-h-11 rounded-xl border-2 px-2 text-center transition
                ${role === r.key
                  ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                  : 'border-slate-200 bg-white text-slate-500'}`}>
              <span className="block text-sm font-black">{r.label}</span>
              <span className="block text-[10px] opacity-80">{data?.people[r.key].length ?? 0} คน</span>
            </button>
          ))}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-3 sm:px-5 py-4 space-y-4">
        {data?.canManage && !data.settings.signerName && (
          <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
            ยังไม่ได้ตั้งชื่อผู้ลงนาม — กด “ตั้งค่า” เพื่อกำหนดชื่อ ตำแหน่ง และลายเซ็นครั้งเดียว
            แล้วทุกใบจะใช้ค่านี้เอง
          </p>
        )}
        {/* เจ้าภาพต้องรู้ว่าตอนนี้ผู้ปกครองเห็นหน้านี้อยู่หรือยัง ไม่ต้องเปิดเข้าไปดูในตั้งค่า */}
        {data?.canManage && !data.settings.isPublic && (
          <p className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
            ตอนนี้หน้านี้ <b className="text-slate-900">เห็นเฉพาะผู้ดูแล</b> —
            เปิดให้ผู้ใช้ทั่วไปโหลดใบเองได้ที่ “ตั้งค่า”
          </p>
        )}

        <div className="grid gap-2 sm:grid-cols-2">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="ค้นหาชื่อหรือโรงเรียน" className={`${inputClass} pl-9`} />
          </div>
          {role !== 'Referee' && (
            <select value={teamFilter} onChange={e => setTeamFilter(e.target.value)}
              className={`${inputClass} bg-white`}>
              <option value="">ทุกทีม ({people.length} คน)</option>
              {data?.teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 bg-slate-50">
            <button onClick={toggleAllVisible} disabled={visible.length === 0}
              className="min-h-9 px-3 rounded-lg bg-white border border-slate-300 text-xs font-bold disabled:opacity-50">
              {allVisiblePicked ? 'ยกเลิกทั้งหมด' : 'เลือกทั้งหมด'}
            </button>
            <p className="text-xs text-slate-500 flex-1">
              แสดง {visible.length} คน · เลือกแล้ว <b className="text-slate-800">{picked.size}</b>
            </p>
          </div>

          {visible.length === 0 ? (
            <div className="py-10 text-center text-slate-400 text-sm">
              <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
              ไม่มีรายชื่อในกลุ่มนี้
            </div>
          ) : (
            <div className="divide-y divide-slate-100 max-h-[26rem] overflow-y-auto">
              {visible.map(p => (
                <label key={p.key}
                  className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-slate-50">
                  <input type="checkbox" checked={picked.has(p.key)} onChange={() => toggle(p.key)}
                    className="w-4 h-4 accent-indigo-600 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-slate-800 truncate">{p.name}</span>
                    {p.team && <span className="block text-[11px] text-slate-500 truncate">{p.team}</span>}
                  </span>
                  {p.certNo && (
                    <span className="shrink-0 text-[11px] font-bold text-emerald-700 bg-emerald-50
                                     border border-emerald-200 rounded-full px-2 py-0.5">
                      {p.certNo}
                    </span>
                  )}
                </label>
              ))}
            </div>
          )}
        </div>

        <p className="text-[11px] text-slate-500 leading-relaxed">
          เลือกคนเดียวได้ไฟล์ PDF หนึ่งใบ · เลือกทั้งทีมได้ไฟล์เดียวหลายหน้า
          <br />
          เลขที่ใบถูกจองไว้กับคนตั้งแต่โหลดครั้งแรก โหลดซ้ำอีกกี่ครั้งก็ได้เลขเดิม
        </p>
      </main>

      {/* แถบสั่งงานตรึงล่างจอ — ปุ่มหลักต้องอยู่ในระยะนิ้วโป้งบนมือถือ */}
      <div className="fixed bottom-0 inset-x-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur
                      px-3 sm:px-5 py-3 safe-area-bottom">
        <div className="max-w-5xl mx-auto flex items-center gap-2">
          <p className="text-xs text-slate-500 flex-1 min-w-0 truncate">
            {picked.size === 0 ? 'ยังไม่ได้เลือกผู้รับ' : `เตรียมออก ${picked.size} ใบ`}
          </p>
          {/* ทางสำรองเมื่อ mPDF บนโฮสต์ใช้ไม่ได้ — ไม่มีภาพพื้นหลัง */}
          <button onClick={() => void print()} disabled={picked.size === 0 || busy}
            title="พิมพ์ผ่านเบราว์เซอร์ (ไม่มีภาพพื้นหลัง)"
            className="min-h-12 px-3 rounded-xl bg-slate-100 text-slate-700 font-bold
                       flex items-center gap-2 disabled:opacity-50">
            <Printer className="w-5 h-5" />
            <span className="hidden sm:inline text-sm">พิมพ์แบบเรียบ</span>
          </button>
          <button onClick={() => void downloadPdf()} disabled={picked.size === 0 || busy}
            className="min-h-12 px-5 rounded-xl bg-indigo-600 text-white font-black
                       flex items-center gap-2 disabled:opacity-50">
            {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
            ดาวน์โหลด PDF
          </button>
        </div>
      </div>

      {settingsOpen && form && (
        <div className="fixed inset-0 z-[2000] bg-slate-950/60 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4"
          onClick={() => setSettingsOpen(false)}>
          <div className="w-full md:max-w-2xl max-h-[92dvh] bg-white rounded-t-3xl md:rounded-3xl
                          flex flex-col overflow-hidden safe-area-bottom"
            onClick={e => e.stopPropagation()}>
            <header className="flex items-center gap-3 border-b border-slate-200 px-5 py-4 shrink-0">
              <h2 className="font-black text-lg flex-1">ตั้งค่าเกียรติบัตร</h2>
              <button onClick={() => setSettingsOpen(false)} aria-label="ปิด"
                className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
                <X className="w-5 h-5" />
              </button>
            </header>

            <div className="overflow-y-auto p-5 space-y-5">
              {/* สวิตช์เปิด-ปิดหน้าอยู่บนสุด เพราะเป็นสิ่งเดียวที่คนนอกมองเห็นผล */}
              <label className="flex items-start gap-3 rounded-2xl border-2 border-indigo-200 bg-indigo-50 p-4 cursor-pointer">
                <input type="checkbox" checked={form.isPublic}
                  onChange={e => setForm({ ...form, isPublic: e.target.checked })}
                  className="w-5 h-5 accent-indigo-600 mt-0.5 shrink-0" />
                <span className="min-w-0">
                  <span className="block text-sm font-black text-indigo-900">
                    เปิดให้ผู้ใช้ทั่วไปเข้าหน้านี้
                  </span>
                  <span className="block text-[11px] text-indigo-700 mt-1 leading-relaxed">
                    เปิดแล้วปุ่ม “เกียรติบัตร” จะขึ้นที่หน้าแรกให้ทุกคน นักกีฬาและผู้ปกครอง
                    ค้นชื่อตัวเองแล้วบันทึกเป็น PDF ได้เอง · ปิดไว้ระหว่างยังตั้งค่าไม่เสร็จ
                    เพื่อไม่ให้มีใครโหลดใบที่ยังไม่มีลายเซ็นออกไป
                  </span>
                </span>
              </label>

              <label className="block">
                <span className="text-xs font-bold text-slate-600">หัวเรื่องบนใบ</span>
                <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
                  placeholder="เกียรติบัตร" className={`${inputClass} mt-1`} />
              </label>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                <p className="text-sm font-black text-slate-800">ผู้ลงนาม</p>
                <label className="block">
                  <span className="text-xs font-bold text-slate-600">ชื่อ-สกุล</span>
                  <input value={form.signerName}
                    onChange={e => setForm({ ...form, signerName: e.target.value })}
                    placeholder="นายสมชาย ใจดี" className={`${inputClass} mt-1`} />
                </label>
                <label className="block">
                  <span className="text-xs font-bold text-slate-600">ตำแหน่ง</span>
                  <input value={form.signerTitle}
                    onChange={e => setForm({ ...form, signerTitle: e.target.value })}
                    placeholder="ผู้อำนวยการโรงเรียน..." className={`${inputClass} mt-1`} />
                </label>
                <div>
                  <span className="text-xs font-bold text-slate-600">ลายเซ็น (PNG พื้นหลังโปร่งใสจะสวยที่สุด)</span>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <label className="cursor-pointer bg-white border border-slate-300 px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5">
                      <Upload className="w-3.5 h-3.5 text-indigo-600" />
                      {signatureFile ? signatureFile.name : (form.signatureUrl ? 'เปลี่ยนลายเซ็น' : 'อัปโหลดลายเซ็น')}
                      <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
                        onChange={e => setSignatureFile(e.target.files?.[0] || null)} />
                    </label>
                    {form.signatureUrl && !signatureFile && (
                      <>
                        <img src={form.signatureUrl} alt=""
                          className="h-10 object-contain border border-slate-200 rounded bg-white px-2" />
                        <button type="button" onClick={() => setForm({ ...form, signatureUrl: '' })}
                          className="px-3 py-2 rounded-lg bg-rose-50 text-rose-600 text-xs font-bold">
                          เอาออก
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {ROLES.map(r => (
                <div key={r.key} className="rounded-2xl border border-slate-200 p-4 space-y-3">
                  <p className="text-sm font-black text-slate-800">{r.label}</p>
                  <label className="block">
                    <span className="text-xs font-bold text-slate-600">
                      ข้อความกลางใบ — ใช้ <code>{'{name}'}</code> <code>{'{team}'}</code> <code>{'{tournament}'}</code> แทนค่าได้
                    </span>
                    <textarea value={form.body[r.key]}
                      onChange={e => setForm({ ...form, body: { ...form.body, [r.key]: e.target.value } })}
                      className={`${inputClass} mt-1 min-h-24 py-2 resize-y`} />
                  </label>
                  <label className="block">
                    <span className="text-xs font-bold text-slate-600">
                      รูปแบบเลขที่ — <code>{'{n}'}</code> คือช่องเลขลำดับ
                    </span>
                    <input value={form.numberFormat[r.key]}
                      onChange={e => setForm({ ...form,
                        numberFormat: { ...form.numberFormat, [r.key]: e.target.value } })}
                      placeholder="ก.ท. {n}/2569" className={`${inputClass} mt-1`} />
                  </label>

                  {/* ภาพพื้นหลังของบทบาทนี้ */}
                  <div>
                    <span className="text-xs font-bold text-slate-600">
                      ภาพพื้นหลัง — แนวนอน A4 (แนะนำ 3508 × 2480 px)
                    </span>
                    <div className="flex items-start gap-3 mt-1">
                      <label className="shrink-0 cursor-pointer bg-white border border-slate-300 px-3 py-2
                                        rounded-lg text-xs font-bold flex items-center gap-1.5">
                        <ImageIcon className="w-3.5 h-3.5 text-indigo-600" />
                        {(bgDraft[r.key] ?? form.background[r.key]) ? 'เปลี่ยนภาพ' : 'อัปโหลดภาพ'}
                        <input type="file" accept="image/png,image/jpeg" className="hidden"
                          onChange={async e => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            try {
                              const dataUrl = await fileToBase64(file);
                              setBgDraft(prev => ({ ...prev, [r.key]: dataUrl }));
                            } catch {
                              notify('อ่านไฟล์ภาพไม่สำเร็จ', 'ลองเลือกไฟล์ใหม่', 'error');
                            }
                          }} />
                      </label>
                      {(bgDraft[r.key] ?? form.background[r.key]) ? (
                        <>
                          <img src={bgDraft[r.key] ?? form.background[r.key]} alt=""
                            className="h-16 w-[5.7rem] object-cover rounded border border-slate-200 bg-white" />
                          <button type="button"
                            onClick={() => {
                              setBgDraft(prev => ({ ...prev, [r.key]: '' }));
                              setForm({ ...form, background: { ...form.background, [r.key]: '' } });
                            }}
                            className="px-3 py-2 rounded-lg bg-rose-50 text-rose-600 text-xs font-bold">
                            เอาออก
                          </button>
                        </>
                      ) : (
                        <p className="text-[11px] text-slate-500 leading-snug pt-1">
                          ยังไม่มีภาพ — ระบบจะวาดกรอบเรียบให้แทน
                        </p>
                      )}
                    </div>
                  </div>

                  {/* โซนวางข้อความ — ให้เลี่ยงลวดลายของพื้นหลังได้ */}
                  <div>
                    <span className="text-xs font-bold text-slate-600">
                      วางข้อความไว้โซนไหนของหน้า
                    </span>
                    <div className="grid grid-cols-3 gap-2 mt-1">
                      {ZONES.map(z => (
                        <button key={z.key} type="button"
                          onClick={() => setForm({ ...form, zone: { ...form.zone, [r.key]: z.key } })}
                          className={`min-h-11 rounded-xl border-2 text-sm font-bold transition
                            ${form.zone[r.key] === z.key
                              ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                              : 'border-slate-200 bg-white text-slate-500'}`}>
                          {z.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ))}

              {/* ใบอนุโมทนาออกจากหน้า /sponsors แต่รูปแบบเลขอยู่ที่เดียวกับใบอื่น
                  จะได้ไม่ต้องจำว่าตั้งค่าเลขที่ของงานนี้ไว้กี่ที่ */}
              <div className="rounded-2xl border border-slate-200 p-4 space-y-2">
                <p className="text-sm font-black text-slate-800">ใบอนุโมทนาผู้สนับสนุน</p>
                <label className="block">
                  <span className="text-xs font-bold text-slate-600">
                    รูปแบบเลขที่ — <code>{'{n}'}</code> คือช่องเลขลำดับ
                  </span>
                  <input value={form.numberFormat.Sponsor || ''}
                    onChange={e => setForm({ ...form,
                      numberFormat: { ...form.numberFormat, Sponsor: e.target.value } })}
                    placeholder="อศ. {n}/2569" className={`${inputClass} mt-1`} />
                </label>
                <p className="text-[11px] text-slate-500">
                  ใบอนุโมทนาออกจากหน้า “ผู้สนับสนุนการแข่งขัน” และใช้ชื่อผู้ลงนาม
                  ตำแหน่ง และลายเซ็นชุดเดียวกับด้านบน
                </p>
              </div>

              <label className="block">
                <span className="text-xs font-bold text-slate-600">จำนวนหลักของเลขลำดับ (เติมศูนย์หน้า)</span>
                <input type="number" min={1} max={6} value={form.digits}
                  onChange={e => setForm({ ...form, digits: Number(e.target.value) })}
                  className={`${inputClass} mt-1`} />
                <span className="block text-[11px] text-slate-500 mt-1">
                  3 หลัก = 001 · ตัวอย่าง: {form.numberFormat.Player
                    ? form.numberFormat.Player.replace('{n}', '1'.padStart(form.digits, '0'))
                    : '1'.padStart(form.digits, '0')}
                </span>
              </label>
            </div>

            <footer className="border-t border-slate-200 p-4 shrink-0">
              <button onClick={() => void saveSettings()} disabled={busy}
                className="w-full min-h-12 rounded-xl bg-indigo-600 text-white font-black
                           flex items-center justify-center gap-2 disabled:opacity-60">
                {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Save className="w-5 h-5" /> บันทึกค่าตั้ง</>}
              </button>
              <p className="text-[11px] text-slate-500 text-center mt-2">
                ตั้งครั้งเดียวใช้ได้ทั้งรายการ ไม่ต้องกรอกใหม่ทุกครั้งที่ออกใบ
              </p>
            </footer>
          </div>
        </div>
      )}

      {designOpen && data?.templates?.[role] && (
        <CertificateTemplateEditor
          key={role}
          tournamentId={tournamentId}
          role={role}
          roleLabel={ROLES.find(r => r.key === role)?.label || role}
          template={data.templates[role]}
          fonts={data.fonts || {}}
          frames={data.frames || []}
          frameLabels={FRAME_LABELS}
          zones={ZONES}
          verifyEnabled={Boolean(data.verifyEnabled)}
          onSaved={load}
          onClose={() => setDesignOpen(false)}
          notify={notify}
        />
      )}
    </div>
  );
};

export default CertificatePage;
