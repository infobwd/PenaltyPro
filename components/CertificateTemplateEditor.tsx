import React, { useEffect, useState } from 'react';
import {
  BookmarkPlus, ChevronDown, Image as ImageIcon, Loader2, Plus, QrCode, Save,
  Trash2, Type, X,
} from 'lucide-react';
import { apiGet, apiPost } from '../services/apiConfig';
import { fileToBase64 } from '../services/sheetService';
import {
  CERT_GAP_PARTS, CERT_PARTS, type CertPreset, type CertTemplate, type Signatory,
} from './CertificatePage';

/**
 * ตัวแก้เทมเพลตเกียรติบัตร
 *
 * โครงการตั้งค่าปรับมาจากระบบ Sillapa — แยกข้อความเป็นส่วน ๆ แทนก้อนเดียว
 * รองรับผู้ลงนามหลายคน โลโก้สองข้าง และปรับตำแหน่งเป็นมิลลิเมตร
 *
 * ทุกอย่างที่นี่ต้องส่งไปวาดด้วย mPDF ฝั่ง server จึงมีข้อจำกัดสองข้อที่
 * ต่างจากต้นแบบซึ่งวาดด้วยเบราว์เซอร์:
 *   - ไม่มี text-shadow (ใช้ "แถบพื้นรองข้อความ" แทน)
 *   - ฟอนต์เลือกได้เฉพาะที่ฝังไว้ใน api/fonts/ ไม่ใช่ทุกฟอนต์บน Google Fonts
 */

type Notice = (title: string, message?: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
type Role = 'Player' | 'Coach' | 'Referee';

type Props = {
  tournamentId: string;
  role: Role;
  roleLabel: string;
  template: CertTemplate;
  fonts: Record<string, string>;
  frames: string[];
  frameLabels: Record<string, string>;
  zones: { key: 'top' | 'middle' | 'bottom'; label: string }[];
  verifyEnabled: boolean;
  onSaved: () => Promise<void>;
  onClose: () => void;
  notify: Notice;
};

const input = 'w-full min-h-11 rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-indigo-500';
const label = 'text-xs font-bold text-slate-600';

/** ส่วนที่พับเก็บได้ — ค่าตั้งมี 30 กว่าตัว ถ้ากางหมดจะหาไม่เจอ */
const Section: React.FC<{
  title: string; hint?: string; open: boolean; onToggle: () => void;
  children: React.ReactNode;
}> = ({ title, hint, open, onToggle, children }) => (
  <div className="rounded-2xl border border-slate-200 overflow-hidden">
    <button type="button" onClick={onToggle}
      className="w-full flex items-center gap-2 px-4 py-3 bg-slate-50 text-left">
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-black text-slate-800">{title}</span>
        {hint && <span className="block text-[11px] text-slate-500 mt-0.5">{hint}</span>}
      </span>
      <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition ${open ? 'rotate-180' : ''}`} />
    </button>
    {open && <div className="p-4 space-y-3">{children}</div>}
  </div>
);

/** ช่องอัปโหลดรูปพร้อมตัวอย่าง */
const ImageField: React.FC<{
  value: string; onChange: (v: string) => void; notify: Notice;
  title: string; hint?: string; tall?: boolean;
}> = ({ value, onChange, notify, title, hint, tall }) => (
  <div>
    <span className={label}>{title}</span>
    {hint && <span className="block text-[11px] text-slate-500">{hint}</span>}
    <div className="flex items-start gap-3 mt-1">
      <label className="shrink-0 cursor-pointer bg-white border border-slate-300 px-3 py-2
                        rounded-lg text-xs font-bold flex items-center gap-1.5">
        <ImageIcon className="w-3.5 h-3.5 text-indigo-600" />
        {value ? 'เปลี่ยน' : 'อัปโหลด'}
        <input type="file" accept="image/png,image/jpeg" className="hidden"
          onChange={async e => {
            const f = e.target.files?.[0];
            if (!f) return;
            try { onChange(await fileToBase64(f)); }
            catch { notify('อ่านไฟล์ภาพไม่สำเร็จ', 'ลองเลือกไฟล์ใหม่', 'error'); }
          }} />
      </label>
      {value ? (
        <>
          <img src={value} alt=""
            className={`${tall ? 'h-16 w-[5.7rem] object-cover' : 'h-10 object-contain px-2'}
                        rounded border border-slate-200 bg-white`} />
          <button type="button" onClick={() => onChange('')}
            className="px-3 py-2 rounded-lg bg-rose-50 text-rose-600 text-xs font-bold">
            เอาออก
          </button>
        </>
      ) : (
        <p className="text-[11px] text-slate-400 pt-2">ยังไม่มี</p>
      )}
    </div>
  </div>
);

/** ช่องตัวเลขพร้อมหน่วย */
const NumField: React.FC<{
  value: number; onChange: (v: number) => void; title: string;
  min: number; max: number; unit?: string; step?: number;
}> = ({ value, onChange, title, min, max, unit = 'mm', step = 1 }) => (
  <label className="block">
    <span className={label}>{title} <span className="text-slate-400">({unit})</span></span>
    <input type="number" value={value} min={min} max={max} step={step}
      onChange={e => onChange(Number(e.target.value))} className={`${input} mt-1`} />
  </label>
);

const CertificateTemplateEditor: React.FC<Props> = ({
  tournamentId, role, roleLabel, template, fonts, frames, frameLabels, zones,
  verifyEnabled, onSaved, onClose, notify,
}) => {
  const [t, setT] = useState<CertTemplate>(template);
  const [verify, setVerify] = useState(verifyEnabled);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string>('text');
  const [presets, setPresets] = useState<CertPreset[]>([]);
  const [presetName, setPresetName] = useState('');

  const loadPresets = async () => {
    try {
      const r = await apiGet<{ presets: CertPreset[] }>('listCertificatePresets');
      setPresets(r.presets ?? []);
    } catch {
      // ไม่มีแม่แบบก็ใช้งานหน้านี้ได้ตามปกติ ไม่ต้องรบกวนผู้ใช้
    }
  };
  useEffect(() => { void loadPresets(); }, []);

  /**
   * ใช้แม่แบบ = ทับค่าทั้งหมดในฟอร์ม แต่ยังไม่บันทึก
   * ผู้ใช้ยังกดปิดหนีได้ถ้าเปลี่ยนใจ และยังปรับต่อก่อนบันทึกได้
   */
  const applyPreset = (p: CertPreset) => {
    setT({ ...p.template });
    notify('ใช้แม่แบบแล้ว', `${p.name} — ตรวจแล้วกดบันทึกเพื่อให้มีผลจริง`, 'info');
  };

  const savePreset = async () => {
    const name = presetName.trim();
    if (name === '' || busy) return;
    setBusy(true);
    try {
      const r = await apiPost<any>('saveCertificatePreset', { name, template: t });
      setPresetName('');
      await loadPresets();
      notify(r.replaced ? 'อัปเดตแม่แบบแล้ว' : 'บันทึกแม่แบบแล้ว',
        `เรียกใช้กับบทบาทอื่นหรือรายการอื่นได้เลย`, 'success');
    } catch (error: any) {
      notify('บันทึกแม่แบบไม่สำเร็จ', error?.message || 'กรุณาลองใหม่', 'error');
    } finally {
      setBusy(false);
    }
  };

  const deletePreset = async (p: CertPreset) => {
    if (busy) return;
    setBusy(true);
    try {
      await apiPost('deleteCertificatePreset', { presetId: p.id });
      await loadPresets();
      notify('ลบแม่แบบแล้ว', p.name, 'success');
    } catch (error: any) {
      notify('ลบไม่สำเร็จ', error?.message || 'กรุณาลองใหม่', 'error');
    } finally {
      setBusy(false);
    }
  };

  const set = <K extends keyof CertTemplate>(k: K, v: CertTemplate[K]) =>
    setT(prev => ({ ...prev, [k]: v }));

  const setSig = (i: number, k: keyof Signatory, v: string) =>
    setT(prev => ({
      ...prev,
      signatories: prev.signatories.map((s, j) => (j === i ? { ...s, [k]: v } : s)),
    }));

  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await apiPost('saveCertificateTemplate', {
        tournamentId, role, template: t, verifyEnabled: verify,
      });
      await onSaved();
      notify('บันทึกเทมเพลตแล้ว', `ใบของ${roleLabel}ที่ออกหลังจากนี้จะใช้แบบใหม่`, 'success');
      onClose();
    } catch (error: any) {
      notify('บันทึกไม่สำเร็จ', error?.message || 'กรุณาลองใหม่', 'error');
    } finally {
      setBusy(false);
    }
  };

  const toggle = (k: string) => setOpen(prev => (prev === k ? '' : k));

  return (
    <div className="fixed inset-0 z-[2000] bg-slate-950/60 backdrop-blur-sm
                    flex items-end md:items-center justify-center p-0 md:p-4"
      onClick={onClose}>
      <div className="w-full md:max-w-2xl max-h-[92dvh] bg-white rounded-t-3xl md:rounded-3xl
                      flex flex-col overflow-hidden safe-area-bottom"
        onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">

        <header className="flex items-center gap-3 border-b border-slate-200 px-5 py-4 shrink-0">
          <div className="min-w-0 flex-1">
            <h2 className="font-black text-lg text-slate-900">แบบใบเกียรติบัตร</h2>
            <p className="text-xs text-slate-500">{roleLabel}</p>
          </div>
          <button onClick={onClose} aria-label="ปิด"
            className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
            <X className="w-5 h-5" />
          </button>
        </header>

        <div className="overflow-y-auto p-4 space-y-3">

          <Section title="แม่แบบที่บันทึกไว้" open={open === 'preset'}
            onToggle={() => toggle('preset')}
            hint="ออกแบบครั้งเดียว ใช้ได้ทุกบทบาทและทุกรายการแข่งขัน">
            {presets.length === 0 ? (
              <p className="text-[11px] text-slate-500">
                ยังไม่มีแม่แบบ — ออกแบบใบให้เสร็จก่อน แล้วตั้งชื่อบันทึกไว้ด้านล่าง
              </p>
            ) : (
              <div className="space-y-2">
                {presets.map(p => (
                  <div key={p.id} className="flex items-center gap-2 rounded-xl
                                             border border-slate-200 px-3 py-2">
                    <span className="flex-1 min-w-0 text-sm font-bold text-slate-800 truncate">
                      {p.name}
                    </span>
                    <button type="button" onClick={() => applyPreset(p)}
                      className="shrink-0 min-h-9 px-3 rounded-lg bg-indigo-50
                                 text-indigo-700 text-xs font-black">
                      ใช้แม่แบบนี้
                    </button>
                    {p.canDelete && (
                      <button type="button" onClick={() => void deletePreset(p)}
                        aria-label={`ลบแม่แบบ ${p.name}`}
                        className="shrink-0 text-rose-600 p-1">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center gap-2 pt-1">
              <input value={presetName} onChange={e => setPresetName(e.target.value)}
                placeholder="ตั้งชื่อแม่แบบ เช่น แบบทางการสีทอง"
                className={`${input} flex-1 min-w-0`} />
              <button type="button" onClick={() => void savePreset()}
                disabled={busy || presetName.trim() === ''}
                className="shrink-0 min-h-11 px-3 rounded-xl bg-slate-900 text-white
                           text-xs font-black flex items-center gap-1.5 disabled:opacity-40">
                <BookmarkPlus className="w-4 h-4" /> บันทึก
              </button>
            </div>
            <p className="text-[11px] text-slate-500">
              บันทึกแบบที่กำลังแก้อยู่ตอนนี้ · ชื่อซ้ำของเดิม = เขียนทับ ·
              ทุกคนที่ดูแลรายการหยิบไปใช้ได้ แต่ลบได้เฉพาะคนที่บันทึกไว้เอง
            </p>
          </Section>

          <Section title="ข้อความบนใบ" open={open === 'text'} onToggle={() => toggle('text')}
            hint="ใช้ {name} {team} {tournament} {award} {no} แทนค่าได้">
            <label className="block">
              <span className={label}>ชื่อหน่วยงาน (บรรทัดบนสุด)</span>
              <input value={t.headerText} onChange={e => set('headerText', e.target.value)}
                placeholder="เช่น สำนักงานเขตพื้นที่การศึกษาประถมศึกษา..." className={`${input} mt-1`} />
            </label>
            {t.headerText !== '' && (
              <>
                <NumField value={t.headerTop} onChange={v => set('headerTop', v)}
                  title="ตรึงชื่อหน่วยงานห่างจากขอบบน" min={0} max={150} />
                <p className="text-[11px] text-slate-500 -mt-1">
                  0 = อยู่หัวบล็อกข้อความตามปกติ · ใส่ตัวเลขคือตรึงไว้ที่เดิมทุกใบ
                  ไม่ขยับตามความยาวชื่อผู้รับ
                </p>
              </>
            )}
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={t.showTitle}
                onChange={e => set('showTitle', e.target.checked)}
                className="w-5 h-5 accent-indigo-600" />
              <span className="text-sm font-bold text-slate-700">
                แสดงหัวเรื่อง
                <span className="block text-[11px] font-normal text-slate-500">
                  ปิดเมื่อพื้นหลังมีคำว่า “เกียรติบัตร” พิมพ์มาอยู่แล้ว
                </span>
              </span>
            </label>
            {t.showTitle && (
              <label className="block">
                <span className={label}>หัวเรื่อง</span>
                <input value={t.title} onChange={e => set('title', e.target.value)}
                  placeholder="เกียรติบัตร" className={`${input} mt-1`} />
              </label>
            )}
            <label className="block">
              <span className={label}>คำนำหน้าชื่อผู้รับ</span>
              <input value={t.subHeaderText} onChange={e => set('subHeaderText', e.target.value)}
                placeholder="เกียรติบัตรฉบับนี้ให้ไว้เพื่อแสดงว่า" className={`${input} mt-1`} />
            </label>
            <label className="block">
              <span className={label}>เนื้อความ (ใต้ชื่อผู้รับ)</span>
              <textarea value={t.bodyText} onChange={e => set('bodyText', e.target.value)}
                className={`${input} mt-1 min-h-24 py-2 resize-y`} />
            </label>
            <label className="block">
              <span className={label}>บรรทัดวันที่ — เว้นว่างคือไม่พิมพ์</span>
              <input value={t.dateText} onChange={e => set('dateText', e.target.value)}
                placeholder="ให้ไว้ ณ วันที่ 15 สิงหาคม 2569" className={`${input} mt-1`} />
            </label>
            <label className="flex items-start gap-3 rounded-xl bg-slate-50 p-3 cursor-pointer">
              <input type="checkbox" checked={t.showRank}
                onChange={e => set('showRank', e.target.checked)}
                className="w-5 h-5 accent-indigo-600 mt-0.5 shrink-0" />
              <span className="min-w-0">
                <span className="block text-sm font-bold text-slate-800">ใส่ผลรางวัลให้อัตโนมัติ</span>
                <span className="block text-[11px] text-slate-500 mt-0.5">
                  ช่อง <code>{'{award}'}</code> จะกลายเป็น “ได้รับรางวัลชนะเลิศ” /
                  “รองชนะเลิศ” / “ได้เข้าร่วมการแข่งขัน” ตามผลนัดชิงชนะเลิศจริง
                </span>
              </span>
            </label>
          </Section>

          <Section title="ภาพพื้นหลังและกรอบ" open={open === 'bg'} onToggle={() => toggle('bg')}
            hint="ไม่มีภาพพื้นหลัง = ใช้กรอบสำเร็จรูปแทน">
            <ImageField value={t.backgroundUrl} onChange={v => set('backgroundUrl', v)}
              notify={notify} tall title="ภาพพื้นหลัง"
              hint="แนวนอน A4 แนะนำ 3508 × 2480 px (ระบบแปลงเป็น JPEG ให้เอง)" />
            {!t.backgroundUrl && (
              <label className="block">
                <span className={label}>กรอบสำเร็จรูป</span>
                <select value={t.frameStyle} onChange={e => set('frameStyle', e.target.value)}
                  className={`${input} mt-1 bg-white`}>
                  {frames.map(f => <option key={f} value={f}>{frameLabels[f] || f}</option>)}
                </select>
              </label>
            )}
            <div className="grid sm:grid-cols-2 gap-3">
              <ImageField value={t.logoLeftUrl} onChange={v => set('logoLeftUrl', v)}
                notify={notify} title="โลโก้ซ้าย" />
              <ImageField value={t.logoRightUrl} onChange={v => set('logoRightUrl', v)}
                notify={notify} title="โลโก้ขวา" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <NumField value={t.logoHeight} onChange={v => set('logoHeight', v)}
                title="ความสูงโลโก้" min={8} max={45} />
              <NumField value={t.logoTop} onChange={v => set('logoTop', v)}
                title="ตรึงห่างจากขอบบน" min={0} max={150} />
            </div>
            <p className="text-[11px] text-slate-500 -mt-1">
              ระยะจากขอบบน = 0 คือวางไว้หัวบล็อกข้อความตามปกติ · ใส่ตัวเลข
              คือตรึงไว้ที่เดิมทุกใบ ไม่ขยับตามความยาวชื่อ
            </p>
            <label className="flex items-start gap-3 rounded-xl bg-slate-50 p-3 cursor-pointer">
              <input type="checkbox" checked={t.textPlate}
                onChange={e => set('textPlate', e.target.checked)}
                className="w-5 h-5 accent-indigo-600 mt-0.5 shrink-0" />
              <span className="min-w-0">
                <span className="block text-sm font-bold text-slate-800">แถบพื้นรองข้อความ</span>
                <span className="block text-[11px] text-slate-500 mt-0.5">
                  เปิดเมื่อพื้นหลังมีลายเยอะจนตัวหนังสืออ่านยาก
                </span>
              </span>
            </label>
            {t.textPlate && (
              <NumField value={t.textPlateOpacity} onChange={v => set('textPlateOpacity', v)}
                title="ความทึบของแถบ" min={10} max={100} unit="%" step={5} />
            )}
          </Section>

          <Section title={`ผู้ลงนาม (${t.signatories.length} คน)`}
            open={open === 'sign'} onToggle={() => toggle('sign')}
            hint="ใส่ได้สูงสุด 3 คน เรียงข้างกันบนใบ">
            {t.signatories.map((s, i) => (
              <div key={i} className="rounded-xl border border-slate-200 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black text-slate-700 flex-1">คนที่ {i + 1}</span>
                  <button type="button"
                    onClick={() => set('signatories', t.signatories.filter((_, j) => j !== i))}
                    className="text-rose-600 p-1" aria-label="ลบผู้ลงนาม">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <input value={s.name} onChange={e => setSig(i, 'name', e.target.value)}
                  placeholder="ชื่อ–สกุล" className={input} />
                <input value={s.position} onChange={e => setSig(i, 'position', e.target.value)}
                  placeholder="ตำแหน่ง" className={input} />
                <ImageField value={s.signatureUrl} onChange={v => setSig(i, 'signatureUrl', v)}
                  notify={notify} title="ลายเซ็น" hint="PNG พื้นหลังโปร่งใสจะสวยที่สุด" />
              </div>
            ))}
            {t.signatories.length < 3 && (
              <button type="button"
                onClick={() => set('signatories',
                  [...t.signatories, { name: '', position: '', signatureUrl: '' }])}
                className="w-full min-h-11 rounded-xl border-2 border-dashed border-slate-300
                           text-sm font-bold text-slate-600 flex items-center justify-center gap-2">
                <Plus className="w-4 h-4" /> เพิ่มผู้ลงนาม
              </button>
            )}
            <label className="flex items-center gap-3 pt-1 cursor-pointer">
              <input type="checkbox" checked={t.showSignatureLine}
                onChange={e => set('showSignatureLine', e.target.checked)}
                className="w-5 h-5 accent-indigo-600" />
              <span className="text-sm font-bold text-slate-700">แสดงเส้นประใต้ลายเซ็น</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <NumField value={t.signatureSpacing} onChange={v => set('signatureSpacing', v)}
                title="ระยะห่างชื่อจากเส้น" min={0} max={15} />
              <NumField value={t.signatureHeight} onChange={v => set('signatureHeight', v)}
                title="ความสูงลายเซ็น" min={6} max={40} />
            </div>
            <NumField value={t.signBottom} onChange={v => set('signBottom', v)}
              title="ตรึงชิดขอบล่าง" min={0} max={120} />
            <p className="text-[11px] text-slate-500 -mt-1">
              0 = ต่อท้ายเนื้อความ (ตำแหน่งขยับตามความยาวข้อความแต่ละคน) ·
              ใส่ตัวเลขคือตรึงชิดขอบล่าง ชุดลายเซ็นจะอยู่ที่เดิมทุกใบ
            </p>
          </Section>

          <Section title="การจัดวาง" open={open === 'layout'} onToggle={() => toggle('layout')}
            hint="เลือกโซนก่อน แล้วค่อยขยับละเอียดถ้ายังไม่พอดีกับพื้นหลัง">
            <div>
              <span className={label}>โซนของบล็อกข้อความ</span>
              <div className="grid grid-cols-3 gap-2 mt-1">
                {zones.map(z => (
                  <button key={z.key} type="button" onClick={() => set('zone', z.key)}
                    className={`min-h-11 rounded-xl border-2 text-sm font-bold transition
                      ${t.zone === z.key
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                        : 'border-slate-200 bg-white text-slate-500'}`}>
                    {z.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <NumField value={t.contentOffset} onChange={v => set('contentOffset', v)}
                title="ขยับขึ้น(−)/ลง(+)" min={-60} max={60} />
              <NumField value={t.contentWidth} onChange={v => set('contentWidth', v)}
                title="ความกว้างข้อความ" min={120} max={275} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <NumField value={t.serialTop} onChange={v => set('serialTop', v)}
                title="เลขที่ — จากขอบบน" min={4} max={100} />
              <NumField value={t.serialRight} onChange={v => set('serialRight', v)}
                title="เลขที่ — จากขอบขวา" min={4} max={140} />
            </div>

            {/* เลขที่มักตกไปอยู่บนลายมุมกระดาษจนอ่านไม่ออก */}
            <div className="rounded-xl border border-slate-200 p-3 space-y-3">
              <p className="text-xs font-black text-slate-700">หน้าตาเลขที่ใบ</p>
              <div className="grid grid-cols-2 gap-3">
                <NumField value={t.sizeSerial} onChange={v => set('sizeSerial', v)}
                  title="ขนาด" min={6} max={24} unit="pt" />
                <label className="block">
                  <span className={label}>สีตัวอักษร</span>
                  <input type="color" value={t.colorSerial}
                    onChange={e => set('colorSerial', e.target.value)}
                    className="w-full h-11 rounded-xl border border-slate-300 mt-1 bg-white" />
                </label>
              </div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={t.outlineSerial}
                  onChange={e => set('outlineSerial', e.target.checked)}
                  className="w-5 h-5 accent-indigo-600" />
                <span className="text-sm font-bold text-slate-700">
                  ขอบขาวรอบตัวเลข
                  <span className="block text-[11px] font-normal text-slate-500">
                    ใช้เมื่อเลขไปตกบนลายมุมกระดาษ
                  </span>
                </span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={t.serialPlate}
                  onChange={e => set('serialPlate', e.target.checked)}
                  className="w-5 h-5 accent-indigo-600" />
                <span className="text-sm font-bold text-slate-700">พื้นรองหลังเลขที่</span>
              </label>
              {t.serialPlate && (
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className={label}>สีพื้นรอง</span>
                    <input type="color" value={t.serialPlateColor}
                      onChange={e => set('serialPlateColor', e.target.value)}
                      className="w-full h-11 rounded-xl border border-slate-300 mt-1 bg-white" />
                  </label>
                  <NumField value={t.serialPlatePad} onChange={v => set('serialPlatePad', v)}
                    title="ระยะเว้นในพื้นรอง" min={0} max={8} step={0.5} />
                </div>
              )}
            </div>
            {verify && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <NumField value={t.qrBottom} onChange={v => set('qrBottom', v)}
                    title="QR — จากขอบล่าง" min={4} max={100} />
                  <NumField value={t.qrRight} onChange={v => set('qrRight', v)}
                    title="QR — จากขอบขวา" min={4} max={140} />
                </div>
                <NumField value={t.qrSize} onChange={v => set('qrSize', v)}
                  title="ขนาด QR" min={10} max={45} />
                <label className="block">
                  <span className={label}>ข้อความใต้ QR — เว้นว่างคือไม่พิมพ์</span>
                  <input value={t.qrCaption} onChange={e => set('qrCaption', e.target.value)}
                    placeholder="สแกนเพื่อตรวจสอบ" className={`${input} mt-1`} />
                </label>
                <label className="flex items-start gap-3 rounded-xl bg-slate-50 p-3 cursor-pointer">
                  <input type="checkbox" checked={t.qrPlate}
                    onChange={e => set('qrPlate', e.target.checked)}
                    className="w-5 h-5 accent-indigo-600 mt-0.5 shrink-0" />
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-slate-800">กรอบขาวรอง QR</span>
                    <span className="block text-[11px] text-slate-500 mt-0.5">
                      ช่วยให้กล้องจับติดบนพื้นหลังลายจัด · ปิดถ้าอยากให้ QR ลอยบนลาย
                    </span>
                  </span>
                </label>
                {t.qrPlate && (
                  <div className="grid grid-cols-2 gap-3 items-end">
                    <NumField value={t.qrPlatePad} onChange={v => set('qrPlatePad', v)}
                      title="ระยะเว้นในกรอบ" min={0} max={10} />
                    <label className="flex items-center gap-2 min-h-11 cursor-pointer">
                      <input type="checkbox" checked={t.qrPlateBorder}
                        onChange={e => set('qrPlateBorder', e.target.checked)}
                        className="w-5 h-5 accent-indigo-600" />
                      <span className="text-sm font-bold text-slate-700">มีเส้นขอบ</span>
                    </label>
                  </div>
                )}
              </>
            )}
          </Section>

          <Section title="ตัวอักษร" open={open === 'font'} onToggle={() => toggle('font')}
            hint="ฟอนต์ที่ฝังไว้ในระบบ ใช้ได้ทั้งบนจอและในไฟล์ PDF">
            <label className="block">
              <span className={label}>ฟอนต์หลักของทั้งใบ</span>
              <select value={t.fontFamily} onChange={e => set('fontFamily', e.target.value)}
                className={`${input} mt-1 bg-white`}>
                {Object.entries(fonts).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <NumField value={t.lineHeight} onChange={v => set('lineHeight', v)}
                title="ระยะห่างบรรทัด" min={1} max={3} unit="เท่า" step={0.1} />
              <NumField value={t.blockGap} onChange={v => set('blockGap', v)}
                title="ระยะห่างกลาง" min={0} max={30} />
            </div>

            {/* ระยะห่างเหนือข้อความแต่ละชุด — เว้นว่างคือใช้ระยะห่างกลาง */}
            <div className="rounded-xl border border-slate-200 p-3 space-y-2">
              <p className="text-xs font-black text-slate-700">
                ระยะห่างเหนือข้อความแต่ละชุด
              </p>
              <p className="text-[11px] text-slate-500">
                ตัวเลขคือระยะจาก “ชุดที่อยู่เหนือมัน” เช่น ใส่ที่บรรทัดวันที่
                เพื่อดันบรรทัดวันที่ให้ห่างจากเนื้อความ
                <br />
                เว้นว่าง = ใช้ระยะห่างกลาง · ใส่ 0 ได้ถ้าอยากให้ชิดกันสนิท ·
                ชุดแรกสุดไม่ใช้ค่านี้ (คุมด้วยโซนและการขยับขึ้น-ลงแทน)
              </p>
              {CERT_GAP_PARTS.map(p => {
                const k = `gap${p.key}` as keyof CertTemplate;
                const v = t[k] as number | null;
                return (
                  <div key={p.key} className="flex items-center gap-2">
                    <span className="w-24 shrink-0 text-xs font-bold text-slate-700">{p.label}</span>
                    <input type="number" min={0} max={40} value={v ?? ''}
                      placeholder={`${t.blockGap}`}
                      onChange={e => set(k, (e.target.value === ''
                        ? null : Number(e.target.value)) as never)}
                      className="flex-1 min-w-0 min-h-10 rounded-lg border border-slate-300 px-2 text-sm" />
                    <span className="text-[11px] text-slate-400 w-6 shrink-0">mm</span>
                  </div>
                );
              })}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <NumField value={t.sizeTitle} onChange={v => set('sizeTitle', v)}
                title="หัวเรื่อง" min={12} max={60} unit="pt" />
              <NumField value={t.sizeName} onChange={v => set('sizeName', v)}
                title="ชื่อผู้รับ" min={12} max={50} unit="pt" />
              <NumField value={t.sizeBody} onChange={v => set('sizeBody', v)}
                title="เนื้อความ" min={8} max={30} unit="pt" />
              <NumField value={t.sizeSign} onChange={v => set('sizeSign', v)}
                title="ผู้ลงนาม" min={8} max={24} unit="pt" />
              <NumField value={t.sizeHeader} onChange={v => set('sizeHeader', v)}
                title="ชื่อหน่วยงาน" min={8} max={40} unit="pt" />
              <NumField value={t.sizeSubHeader} onChange={v => set('sizeSubHeader', v)}
                title="คำนำหน้าชื่อ" min={8} max={40} unit="pt" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              {([['colorTitle', 'สีหัวเรื่อง'], ['colorName', 'สีชื่อ'],
                 ['colorText', 'สีเนื้อความ']] as const).map(([k, lb]) => (
                <label key={k} className="block">
                  <span className={label}>{lb}</span>
                  <input type="color" value={t[k]} onChange={e => set(k, e.target.value)}
                    className="w-full h-11 rounded-xl border border-slate-300 mt-1 bg-white" />
                </label>
              ))}
            </div>
          </Section>

          <Section title="ฟอนต์และขอบขาวรายส่วน" open={open === 'parts'}
            onToggle={() => toggle('parts')}
            hint="แต่ละบรรทัดใช้ฟอนต์คนละแบบได้ และใส่ขอบขาวเฉพาะส่วนที่จมพื้นหลัง">
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-3">
              <p className="text-[11px] text-amber-800 leading-relaxed">
                ขอบขาวช่วยให้อ่านออกเมื่อวางบนพื้นหลังลายจัด เปิดเฉพาะส่วนที่ต้องการ
                เพราะเปิดหมดจะดูฟุ้ง
              </p>
            </div>
            {CERT_PARTS.map(p => {
              const fk = `font${p.key}` as keyof CertTemplate;
              const ok = `outline${p.key}` as keyof CertTemplate;
              return (
                <div key={p.key} className="flex items-center gap-2">
                  <span className="w-24 shrink-0 text-xs font-bold text-slate-700">{p.label}</span>
                  <select value={t[fk] as string}
                    onChange={e => set(fk, e.target.value as never)}
                    className="flex-1 min-w-0 min-h-10 rounded-lg border border-slate-300 px-2 text-xs bg-white">
                    <option value="">— ใช้ฟอนต์หลัก —</option>
                    {Object.entries(fonts).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                  <label className="shrink-0 flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" checked={t[ok] as boolean}
                      onChange={e => set(ok, e.target.checked as never)}
                      className="w-4 h-4 accent-indigo-600" />
                    <span className="text-[11px] font-bold text-slate-600">ขอบขาว</span>
                  </label>
                </div>
              );
            })}
            <NumField value={t.outlineWidth} onChange={v => set('outlineWidth', v)}
              title="ความหนาขอบขาว" min={0.1} max={1.5} step={0.1} />
          </Section>

          <Section title="QR ตรวจสอบ" open={open === 'qr'} onToggle={() => toggle('qr')}
            hint="ตั้งครั้งเดียวใช้ทุกบทบาทของรายการนี้">
            <label className="flex items-start gap-3 rounded-2xl border-2 border-indigo-200
                              bg-indigo-50 p-4 cursor-pointer">
              <input type="checkbox" checked={verify}
                onChange={e => setVerify(e.target.checked)}
                className="w-5 h-5 accent-indigo-600 mt-0.5 shrink-0" />
              <span className="min-w-0">
                <span className="block text-sm font-black text-indigo-900 flex items-center gap-1.5">
                  <QrCode className="w-4 h-4" /> พิมพ์ QR ตรวจสอบลงใบ
                </span>
                <span className="block text-[11px] text-indigo-700 mt-1 leading-relaxed">
                  สแกนแล้วเข้าหน้าตรวจสอบว่าเลขที่ใบนี้ออกให้ใครจริง ใช้รหัสสุ่ม
                  ไม่ใช่เลขเรียง จึงไล่ดูรายชื่อคนอื่นไม่ได้ · ปิดเมื่อไหร่หน้าตรวจสอบ
                  จะตอบว่าไม่พบทันที แม้จะเคยพิมพ์ QR ไปแล้ว
                </span>
              </span>
            </label>
          </Section>
        </div>

        <footer className="border-t border-slate-200 p-4 shrink-0">
          <button onClick={() => void save()} disabled={busy}
            className="w-full min-h-12 rounded-xl bg-indigo-600 text-white font-black
                       flex items-center justify-center gap-2 disabled:opacity-60">
            {busy ? <Loader2 className="w-5 h-5 animate-spin" />
                  : <><Save className="w-5 h-5" /> บันทึกแบบใบ{roleLabel}</>}
          </button>
          <p className="text-[11px] text-slate-500 text-center mt-2 flex items-center justify-center gap-1">
            <Type className="w-3 h-3" /> ตัวอย่างจริงดูได้ด้วยการเลือกคนเดียวแล้วกดดาวน์โหลด PDF
          </p>
        </footer>
      </div>
    </div>
  );
};

export default CertificateTemplateEditor;
