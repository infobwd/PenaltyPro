import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft, BadgeDollarSign, Banknote, Building2, CalendarDays, Edit2, FileSignature,
  Gift, Handshake, ImagePlus, Loader2, Package, Plus, Printer, Save, Share2,
  Sparkles, Trash2, Trophy, Upload, X, QrCode, Settings,
} from 'lucide-react';
import { AppSettings, Sponsor } from '../types';
import { fetchSponsorPageData, fileToBase64, manageSponsor, saveSponsorPaymentSettings } from '../services/sheetService';
import { resizeImageBeforeUpload, SUPPORTED_IMAGE_ACCEPT } from '../services/imageResize';
import { confirmAction } from '../services/uiService';
import SponsorDonationCard from './SponsorDonationCard';

type NoticeType = 'success' | 'error' | 'info' | 'warning';
type Notice = (title: string, message?: string, type?: NoticeType) => void;

type Props = {
  tournamentId: string;
  tournamentName: string;
  config: AppSettings;
  canManage?: boolean;
  onBack: () => void;
  onDonate: () => void;
  onRefresh?: () => Promise<void> | void;
  notify: Notice;
};

type SponsorEditorProps = {
  sponsor: Sponsor | null;
  tournamentId: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
  notify: Notice;
};

type AcknowledgementProps = {
  sponsor: Sponsor;
  tournamentName: string;
  competitionLogo?: string;
  signerDefaults?: Pick<Sponsor, 'signerName' | 'signerTitle' | 'signatureUrl'>;
  onClose: () => void;
  onSaved: () => Promise<void>;
  notify: Notice;
};

type PaymentSettingsProps = {
  tournamentId: string;
  config: AppSettings;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
  notify: Notice;
};

type SponsorAccountSource = 'tournament' | 'education' | 'custom';

type BankAccountChoice = {
  bankName: string;
  bankAccount: string;
  accountName: string;
};

const inputClass = 'w-full min-h-12 rounded-xl border border-slate-300 bg-white px-3.5 text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';

const sponsorTier = (sponsor: Sponsor): 'Main' | 'Support' =>
  String(sponsor.type || '').split('::')[0] === 'Support' ? 'Support' : 'Main';

const localIsoDate = () => {
  const date = new Date();
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
};

const formatMoney = (amount?: number | null) =>
  Number(amount || 0).toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

const sameBankAccount = (left: BankAccountChoice, right: BankAccountChoice) =>
  left.bankName.trim() === right.bankName.trim()
  && left.bankAccount.replace(/\s/g, '') === right.bankAccount.replace(/\s/g, '')
  && left.accountName.trim() === right.accountName.trim();

const contributionLabel = (sponsor: Sponsor) => {
  if (sponsor.contributionType === 'Money') {
    return sponsor.contributionAmount
      ? `สนับสนุนเงิน ${formatMoney(sponsor.contributionAmount)} บาท`
      : 'สนับสนุนเป็นเงิน';
  }
  if (sponsor.contributionType === 'Goods') {
    return sponsor.contributionDetail ? `สิ่งของ · ${sponsor.contributionDetail}` : 'สนับสนุนสิ่งของ';
  }
  return 'ผู้สนับสนุนการแข่งขัน';
};

const SponsorEditorDialog: React.FC<SponsorEditorProps> = ({
  sponsor, tournamentId, onClose, onSaved, notify,
}) => {
  const [name, setName] = useState(sponsor?.name || '');
  const [tier, setTier] = useState<'Main' | 'Support'>(sponsor ? sponsorTier(sponsor) : 'Support');
  const [contributionType, setContributionType] = useState<'Money' | 'Goods'>(
    sponsor?.contributionType === 'Goods' ? 'Goods' : 'Money',
  );
  const [amount, setAmount] = useState(sponsor?.contributionAmount != null ? String(sponsor.contributionAmount) : '');
  const [detail, setDetail] = useState(sponsor?.contributionDetail || '');
  const [logo, setLogo] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      const payload: Record<string, unknown> = {
        subAction: sponsor ? 'edit' : 'add',
        ...(sponsor ? { id: sponsor.id } : {}),
        name: name.trim(),
        type: `${tier}::${tournamentId}`,
        contributionType,
        contributionAmount: amount.trim(),
        contributionDetail: detail.trim(),
      };
      if (logo) {
        payload.logoFile = await fileToBase64(await resizeImageBeforeUpload(logo));
      }
      await manageSponsor(payload);
      await onSaved();
      notify(sponsor ? 'บันทึกข้อมูลสปอนเซอร์แล้ว' : 'เพิ่มสปอนเซอร์แล้ว',
        'ข้อมูลชุดเดียวกันจะเชื่อมไปแสดงบน Live Wall อัตโนมัติ', 'success');
      onClose();
    } catch (error: any) {
      notify('บันทึกไม่สำเร็จ', error?.message || 'กรุณาลองใหม่อีกครั้ง', 'error');
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 bg-slate-950/65 backdrop-blur-sm modal-sheet flex items-end md:items-center justify-center p-0 md:p-4 overflow-hidden"
      style={{ zIndex: 2147483646 }} role="presentation" onClick={onClose}>
      <form onSubmit={save} onClick={event => event.stopPropagation()}
        className="w-full md:max-w-2xl max-h-[calc(100dvh-env(safe-area-inset-top))] md:max-h-[92vh] bg-white rounded-t-3xl md:rounded-3xl shadow-2xl flex flex-col overflow-hidden safe-area-bottom"
        role="dialog" aria-modal="true" aria-label={sponsor ? 'แก้ไขสปอนเซอร์' : 'เพิ่มสปอนเซอร์'}>
        <header className="px-5 py-4 border-b border-slate-200 flex items-center gap-3 shrink-0">
          <div className="w-11 h-11 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center">
            <Handshake className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-black text-xl text-slate-900">{sponsor ? 'แก้ไขสปอนเซอร์' : 'เพิ่มสปอนเซอร์'}</h2>
            <p className="text-xs text-slate-500">ระบุว่าเป็นเงินหรือสิ่งของเพื่อแสดงผลและออกเอกสารได้ถูกต้อง</p>
          </div>
          <button type="button" onClick={onClose} aria-label="ปิด" className="w-10 h-10 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center">
            <X className="w-5 h-5" />
          </button>
        </header>

        <div className="overflow-y-auto overscroll-contain p-5 space-y-5">
          <label className="block">
            <span className="text-sm font-bold text-slate-700">ชื่อองค์กร ร้านค้า หรือผู้สนับสนุน <span className="text-rose-500">*</span></span>
            <input value={name} onChange={event => setName(event.target.value)} className={`${inputClass} mt-1.5`} placeholder="เช่น บริษัท ตัวอย่าง จำกัด" autoFocus />
          </label>

          <div className="grid sm:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-sm font-bold text-slate-700">ระดับผู้สนับสนุน</span>
              <select value={tier} onChange={event => setTier(event.target.value as 'Main' | 'Support')} className={`${inputClass} mt-1.5`}>
                <option value="Main">ผู้สนับสนุนหลัก</option>
                <option value="Support">ผู้ร่วมสนับสนุน</option>
              </select>
            </label>
            <div>
              <span className="text-sm font-bold text-slate-700">รูปแบบการสนับสนุน</span>
              <div className="grid grid-cols-2 gap-2 mt-1.5">
                <button type="button" onClick={() => setContributionType('Money')}
                  className={`min-h-12 rounded-xl border-2 font-black flex items-center justify-center gap-2 ${contributionType === 'Money' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-500'}`}>
                  <BadgeDollarSign className="w-5 h-5" /> เงิน
                </button>
                <button type="button" onClick={() => setContributionType('Goods')}
                  className={`min-h-12 rounded-xl border-2 font-black flex items-center justify-center gap-2 ${contributionType === 'Goods' ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-slate-200 text-slate-500'}`}>
                  <Package className="w-5 h-5" /> สิ่งของ
                </button>
              </div>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-sm font-bold text-slate-700">
                {contributionType === 'Money' ? 'จำนวนเงิน (บาท)' : 'มูลค่าโดยประมาณ (บาท)'}
              </span>
              <input type="number" min="0" step="0.01" inputMode="decimal" value={amount}
                onChange={event => setAmount(event.target.value)} className={`${inputClass} mt-1.5`} placeholder="0.00" />
            </label>
            <label className="block">
              <span className="text-sm font-bold text-slate-700">รายละเอียด{contributionType === 'Goods' ? 'สิ่งของ' : 'การสนับสนุน'}</span>
              <input value={detail} onChange={event => setDetail(event.target.value)} className={`${inputClass} mt-1.5`}
                placeholder={contributionType === 'Goods' ? 'เช่น น้ำดื่ม 100 แพ็ก' : 'เช่น สนับสนุนค่าอุปกรณ์กีฬา'} />
            </label>
          </div>

          <label className="block rounded-2xl border-2 border-dashed border-slate-300 p-4 hover:border-indigo-400 transition cursor-pointer">
            <span className="flex items-center gap-3">
              <span className="w-11 h-11 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center"><ImagePlus className="w-5 h-5" /></span>
              <span className="min-w-0">
                <span className="block font-black text-slate-800">{sponsor?.logoUrl ? 'เปลี่ยนโลโก้' : 'เพิ่มโลโก้'}</span>
                <span className="block text-xs text-slate-500 truncate">{logo?.name || 'PNG, JPG หรือ WebP (ไม่บังคับ)'}</span>
              </span>
            </span>
            <input type="file" accept={SUPPORTED_IMAGE_ACCEPT} onChange={event => setLogo(event.target.files?.[0] || null)} className="sr-only" />
          </label>
        </div>

        <footer className="p-4 border-t border-slate-200 bg-white grid grid-cols-[0.75fr_1.25fr] gap-3 shrink-0">
          <button type="button" onClick={onClose} className="min-h-12 rounded-xl bg-slate-100 text-slate-700 font-black">ยกเลิก</button>
          <button type="submit" disabled={busy || !name.trim()} className="min-h-12 rounded-xl bg-indigo-600 text-white font-black flex items-center justify-center gap-2 disabled:opacity-50">
            {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />} บันทึกข้อมูล
          </button>
        </footer>
      </form>
    </div>, document.body,
  );
};

const SponsorPaymentSettingsDialog: React.FC<PaymentSettingsProps> = ({
  tournamentId, config, onClose, onSaved, notify,
}) => {
  const tournamentAccount: BankAccountChoice = {
    bankName: config.bankName || '', bankAccount: config.bankAccount || '', accountName: config.accountName || '',
  };
  const educationAccount: BankAccountChoice = {
    bankName: config.educationSupportBankName || '',
    bankAccount: config.educationSupportAccountNumber || '',
    accountName: config.educationSupportAccountName || '',
  };
  const savedSponsorAccount: BankAccountChoice = {
    bankName: config.sponsorDonationBankName || '',
    bankAccount: config.sponsorDonationBankAccount || '',
    accountName: config.sponsorDonationAccountName || '',
  };
  const initialSource: SponsorAccountSource = config.sponsorDonationUseExistingBank !== false
    ? 'tournament'
    : educationAccount.bankAccount && sameBankAccount(savedSponsorAccount, educationAccount)
      ? 'education'
      : 'custom';

  const [enabled, setEnabled] = useState(config.sponsorDonationEnabled !== false);
  const [accountSource, setAccountSource] = useState<SponsorAccountSource>(initialSource);
  const [bankName, setBankName] = useState(config.sponsorDonationBankName || '');
  const [bankAccount, setBankAccount] = useState(config.sponsorDonationBankAccount || '');
  const [accountName, setAccountName] = useState(config.sponsorDonationAccountName || '');
  const [qrFile, setQrFile] = useState<File | null>(null);
  const [qrPreview, setQrPreview] = useState(config.sponsorDonationQrUrl || '');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!qrFile) return;
    const url = URL.createObjectURL(qrFile);
    setQrPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [qrFile]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const selectedAccount: BankAccountChoice = accountSource === 'education'
        ? educationAccount
        : { bankName, bankAccount, accountName };
      const payload: Parameters<typeof saveSponsorPaymentSettings>[0] = {
        tournamentId, enabled, useExistingAccount: accountSource === 'tournament',
        bankName: selectedAccount.bankName.trim(), bankAccount: selectedAccount.bankAccount.trim(),
        accountName: selectedAccount.accountName.trim(),
        qrUrl: qrPreview === config.sponsorDonationQrUrl ? config.sponsorDonationQrUrl : (qrFile ? undefined : qrPreview),
      };
      if (qrFile) payload.qrFile = await fileToBase64(qrFile);
      await saveSponsorPaymentSettings(payload);
      await onSaved();
      notify('บันทึกช่องทางรับการสนับสนุนแล้ว', 'ผู้บริจาคยังแนบสลิปและรอผู้ดูแลตรวจสอบผ่านระบบเดิม', 'success');
      onClose();
    } catch (error: any) {
      notify('บันทึกไม่สำเร็จ', error?.message || 'กรุณาลองใหม่อีกครั้ง', 'error');
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 bg-slate-950/65 backdrop-blur-sm modal-sheet flex items-end md:items-center justify-center p-0 md:p-4 overflow-hidden"
      style={{ zIndex: 2147483646 }} role="presentation" onClick={onClose}>
      <form onSubmit={save} onClick={event => event.stopPropagation()}
        className="w-full md:max-w-2xl max-h-[calc(100dvh-env(safe-area-inset-top))] md:max-h-[92vh] bg-white rounded-t-3xl md:rounded-3xl shadow-2xl flex flex-col overflow-hidden safe-area-bottom"
        role="dialog" aria-modal="true" aria-label="ตั้งค่าช่องทางรับการสนับสนุน">
        <header className="px-5 py-4 border-b border-slate-200 flex items-center gap-3 shrink-0">
          <div className="w-11 h-11 rounded-2xl bg-pink-100 text-pink-700 flex items-center justify-center"><Banknote className="w-5 h-5" /></div>
          <div className="min-w-0 flex-1">
            <h2 className="font-black text-xl text-slate-900">ช่องทางรับการสนับสนุน</h2>
            <p className="text-xs text-slate-500">เลือกบัญชีธนาคารที่ต้องการแสดงในหน้า Sponsors และ Standings</p>
          </div>
          <button type="button" onClick={onClose} aria-label="ปิด" className="w-10 h-10 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center"><X className="w-5 h-5" /></button>
        </header>

        <div className="overflow-y-auto overscroll-contain p-5 space-y-5">
          <label className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 p-4 cursor-pointer">
            <span><span className="block font-black text-slate-800">แสดงช่องทางรับบริจาค</span><span className="block text-xs text-slate-500">แสดงในหน้า Sponsors และ Standings</span></span>
            <input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} className="w-6 h-6 accent-pink-600" />
          </label>

          <div>
            <p className="mb-2 text-sm font-black text-slate-800">เลือกบัญชีที่จะแสดง</p>
            <div className="grid md:grid-cols-3 gap-3">
              {([
                {
                  id: 'tournament' as const, title: 'บัญชีค่าสมัครของรายการ', account: tournamentAccount,
                  available: Boolean(tournamentAccount.bankAccount && tournamentAccount.bankAccount !== '-'),
                  accent: 'indigo',
                },
                {
                  id: 'education' as const, title: 'บัญชีสนับสนุนการศึกษา', account: educationAccount,
                  available: Boolean(educationAccount.bankAccount && educationAccount.bankAccount !== '-'),
                  accent: 'emerald',
                },
                {
                  id: 'custom' as const, title: 'บัญชีเฉพาะ Sponsors', account: null,
                  available: true, accent: 'pink',
                },
              ]).map(option => {
                const selected = accountSource === option.id;
                const selectedClass = option.accent === 'emerald'
                  ? 'border-emerald-500 bg-emerald-50'
                  : option.accent === 'pink' ? 'border-pink-500 bg-pink-50' : 'border-indigo-500 bg-indigo-50';
                return (
                  <button key={option.id} type="button" onClick={() => setAccountSource(option.id)}
                    disabled={!option.available} aria-pressed={selected}
                    className={`relative min-h-32 rounded-2xl border-2 p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-45
                      ${selected ? selectedClass : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                    <span className="flex items-start justify-between gap-2">
                      <span className="font-black text-slate-800 leading-snug">{option.title}</span>
                      <span className={`mt-0.5 h-5 w-5 rounded-full border-2 p-0.5 shrink-0 ${selected ? 'border-indigo-600' : 'border-slate-300'}`}>
                        {selected && <span className="block h-full w-full rounded-full bg-indigo-600" />}
                      </span>
                    </span>
                    {option.account ? (
                      <>
                        <span className="block text-xs text-slate-500 mt-2 break-words">
                          {option.available ? `${option.account.bankName || 'ธนาคาร'} · ${option.account.bankAccount}` : 'ยังไม่ได้ตั้งค่าเลขบัญชี'}
                        </span>
                        <span className="block text-xs text-slate-500 mt-0.5 break-words">{option.account.accountName || 'ยังไม่ระบุชื่อบัญชี'}</span>
                      </>
                    ) : (
                      <span className="block text-xs text-slate-500 mt-2">กรอกบัญชีอื่นสำหรับรับเงินจากผู้สนับสนุน หรือแสดงเฉพาะ QR Code</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {accountSource === 'custom' && (
            <div className="grid sm:grid-cols-2 gap-4 rounded-2xl bg-slate-50 border border-slate-200 p-4">
              <label><span className="text-xs font-bold text-slate-600">ธนาคาร</span><input value={bankName} onChange={event => setBankName(event.target.value)} className={`${inputClass} mt-1`} placeholder="ชื่อธนาคาร" /></label>
              <label><span className="text-xs font-bold text-slate-600">เลขบัญชี</span><input value={bankAccount} onChange={event => setBankAccount(event.target.value)} className={`${inputClass} mt-1`} inputMode="numeric" placeholder="xxx-x-xxxxx-x" /></label>
              <label className="sm:col-span-2"><span className="text-xs font-bold text-slate-600">ชื่อบัญชี</span><input value={accountName} onChange={event => setAccountName(event.target.value)} className={`${inputClass} mt-1`} placeholder="ชื่อเจ้าของบัญชี" /></label>
            </div>
          )}

          <div className="rounded-2xl border-2 border-dashed border-slate-300 p-4">
            <div className="flex items-center gap-4">
              {qrPreview ? <img src={qrPreview} alt="ตัวอย่าง QR Code" className="w-24 h-24 rounded-xl border bg-white object-contain p-1" />
                : <div className="w-24 h-24 rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center"><QrCode className="w-10 h-10" /></div>}
              <div className="min-w-0 flex-1">
                <p className="font-black text-slate-800">QR Code สำหรับรับเงิน</p>
                <p className="text-xs text-slate-500 mt-1">แนบได้ทั้ง QR ธนาคารและ PromptPay</p>
                <label className="inline-flex mt-3 cursor-pointer rounded-xl bg-indigo-50 text-indigo-700 px-3 py-2 text-xs font-bold">
                  เลือกรูป QR Code
                  <input type="file" accept={SUPPORTED_IMAGE_ACCEPT} className="sr-only" onChange={event => setQrFile(event.target.files?.[0] || null)} />
                </label>
                {qrPreview && <button type="button" onClick={() => { setQrFile(null); setQrPreview(''); }} className="ml-2 text-xs font-bold text-rose-600">นำออก</button>}
              </div>
            </div>
          </div>

          <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-3 text-xs text-emerald-800">
            ผู้สนับสนุนที่โอนเงินจะกรอกยอดและแนบสลิปเข้าตารางบริจาคเดิม ผู้ดูแลจึงตรวจสอบ อนุมัติ หรือปฏิเสธได้จากเครื่องมือเดิมทั้งหมด
          </div>
        </div>

        <footer className="p-4 border-t border-slate-200 grid grid-cols-[0.75fr_1.25fr] gap-3 shrink-0">
          <button type="button" onClick={onClose} className="min-h-12 rounded-xl bg-slate-100 text-slate-700 font-black">ยกเลิก</button>
          <button type="submit" disabled={busy} className="min-h-12 rounded-xl bg-pink-600 text-white font-black flex items-center justify-center gap-2 disabled:opacity-50">
            {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />} บันทึกช่องทางรับเงิน
          </button>
        </footer>
      </form>
    </div>, document.body,
  );
};

const SponsorAcknowledgementDialog: React.FC<AcknowledgementProps> = ({
  sponsor, tournamentName, competitionLogo, signerDefaults, onClose, onSaved, notify,
}) => {
  const [documentNo, setDocumentNo] = useState(sponsor.acknowledgementNo || '');
  const [documentDate, setDocumentDate] = useState(sponsor.acknowledgementDate || localIsoDate());
  const [signerName, setSignerName] = useState(sponsor.signerName || signerDefaults?.signerName || '');
  const [signerTitle, setSignerTitle] = useState(sponsor.signerTitle || signerDefaults?.signerTitle || '');
  const [signatureFile, setSignatureFile] = useState<File | null>(null);
  const [signaturePreview, setSignaturePreview] = useState(sponsor.signatureUrl || signerDefaults?.signatureUrl || '');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!signatureFile) return;
    const url = URL.createObjectURL(signatureFile);
    setSignaturePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [signatureFile]);

  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const payload: Record<string, unknown> = {
        subAction: 'edit', id: sponsor.id,
        acknowledgementNo: documentNo.trim(), acknowledgementDate: documentDate,
        signerName: signerName.trim(), signerTitle: signerTitle.trim(),
      };
      if (signatureFile) payload.signatureFile = await fileToBase64(signatureFile);
      else if (signaturePreview !== (sponsor.signatureUrl || '')) payload.signatureUrl = signaturePreview;
      await manageSponsor(payload);
      await onSaved();
      notify('บันทึกข้อมูลใบอนุโมทนาแล้ว', 'พร้อมพิมพ์หรือเลือกบันทึกเป็น PDF จากหน้าต่างพิมพ์', 'success');
    } catch (error: any) {
      notify('บันทึกใบอนุโมทนาไม่สำเร็จ', error?.message || 'กรุณาลองใหม่อีกครั้ง', 'error');
    } finally {
      setBusy(false);
    }
  };

  const thaiDate = documentDate
    ? new Date(`${documentDate}T12:00:00`).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })
    : '........................................................';
  const contributionSentence = sponsor.contributionType === 'Goods'
    ? <>ได้ให้การสนับสนุนเป็นสิ่งของ <strong>{sponsor.contributionDetail || 'ตามรายการที่มอบให้'}</strong>
        {sponsor.contributionAmount ? <> คิดเป็นมูลค่าประมาณ <strong>{formatMoney(sponsor.contributionAmount)} บาท</strong></> : null}</>
    : <>ได้ให้การสนับสนุนเป็นเงินจำนวน <strong>{sponsor.contributionAmount ? `${formatMoney(sponsor.contributionAmount)} บาท` : 'ตามจำนวนที่มอบให้'}</strong>
        {sponsor.contributionDetail ? <> เพื่อ{sponsor.contributionDetail}</> : null}</>;

  return createPortal(
    <div data-sponsor-print-root className="fixed inset-0 bg-slate-950/75 backdrop-blur-sm flex items-end xl:items-center justify-center p-0 xl:p-4 overflow-hidden"
      style={{ zIndex: 2147483646 }} role="presentation" onClick={onClose}>
      <div onClick={event => event.stopPropagation()}
        className="w-full xl:max-w-7xl h-[calc(100dvh-env(safe-area-inset-top))] xl:h-[94vh] bg-slate-100 rounded-t-3xl xl:rounded-3xl overflow-hidden flex flex-col shadow-2xl safe-area-bottom"
        role="dialog" aria-modal="true" aria-label="ออกใบอนุโมทนา">
        <header className="h-16 px-4 sm:px-5 bg-white border-b border-slate-200 flex items-center gap-3 shrink-0">
          <div className="w-10 h-10 rounded-xl bg-violet-100 text-violet-700 flex items-center justify-center"><FileSignature className="w-5 h-5" /></div>
          <div className="min-w-0 flex-1">
            <h2 className="font-black text-lg text-slate-900 truncate">ออกใบอนุโมทนา</h2>
            <p className="text-xs text-slate-500 truncate">{sponsor.name}</p>
          </div>
          <button onClick={() => window.print()} className="hidden sm:flex min-h-10 px-4 rounded-xl bg-slate-900 text-white font-black items-center gap-2">
            <Printer className="w-4 h-4" /> พิมพ์ / PDF
          </button>
          <button onClick={onClose} aria-label="ปิด" className="w-10 h-10 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center"><X className="w-5 h-5" /></button>
        </header>

        <div className="flex-1 min-h-0 grid xl:grid-cols-[23rem_1fr]">
          <aside className="bg-white border-r border-slate-200 overflow-y-auto p-4 sm:p-5 space-y-4">
            <div className="rounded-2xl bg-indigo-50 border border-indigo-100 p-4">
              <p className="font-black text-indigo-900">ข้อมูลสำหรับแทรกในเอกสาร</p>
              <p className="text-xs text-indigo-700 mt-1">ระบบจะใช้ข้อมูลเงิน/สิ่งของจากรายการสปอนเซอร์โดยอัตโนมัติ</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs font-bold text-slate-600">เลขที่เอกสาร</span>
                <input value={documentNo} onChange={event => setDocumentNo(event.target.value)} className={`${inputClass} mt-1`} placeholder="เช่น 001/2569" />
              </label>
              <label className="block">
                <span className="text-xs font-bold text-slate-600">วันที่ออก</span>
                <input type="date" value={documentDate} onChange={event => setDocumentDate(event.target.value)} className={`${inputClass} mt-1`} />
              </label>
            </div>
            <label className="block">
              <span className="text-xs font-bold text-slate-600">ชื่อผู้ลงนาม</span>
              <input value={signerName} onChange={event => setSignerName(event.target.value)} className={`${inputClass} mt-1`} placeholder="ชื่อ–นามสกุล" />
            </label>
            <label className="block">
              <span className="text-xs font-bold text-slate-600">ตำแหน่งผู้ลงนาม</span>
              <input value={signerTitle} onChange={event => setSignerTitle(event.target.value)} className={`${inputClass} mt-1`} placeholder="เช่น ผู้อำนวยการโรงเรียน" />
            </label>
            <label className="block rounded-2xl border-2 border-dashed border-slate-300 p-4 cursor-pointer hover:border-violet-400">
              <span className="flex items-center gap-3">
                <Upload className="w-5 h-5 text-violet-600" />
                <span><span className="block font-black text-sm">อัปโหลดลายเซ็น</span><span className="block text-[11px] text-slate-500">แนะนำ PNG พื้นหลังโปร่งใส</span></span>
              </span>
              <input type="file" accept={SUPPORTED_IMAGE_ACCEPT} className="sr-only" onChange={event => setSignatureFile(event.target.files?.[0] || null)} />
            </label>
            {signaturePreview && (
              <div className="rounded-xl border border-slate-200 p-3 flex items-center gap-3">
                <img src={signaturePreview} alt="ตัวอย่างลายเซ็น" className="h-12 w-28 object-contain" />
                <button type="button" onClick={() => { setSignatureFile(null); setSignaturePreview(''); }} className="ml-auto text-xs font-bold text-rose-600">นำออก</button>
              </div>
            )}
            <button onClick={() => void save()} disabled={busy || !signerName.trim()} className="w-full min-h-12 rounded-xl bg-indigo-600 text-white font-black flex items-center justify-center gap-2 disabled:opacity-50">
              {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />} บันทึกข้อมูลเอกสาร
            </button>
            <button onClick={() => window.print()} className="sm:hidden w-full min-h-12 rounded-xl bg-slate-900 text-white font-black flex items-center justify-center gap-2">
              <Printer className="w-5 h-5" /> พิมพ์ / บันทึก PDF
            </button>
          </aside>

          <main id="sponsor-ack-print-host" className="hidden xl:flex min-h-0 overflow-auto p-6 items-start justify-center bg-slate-200">
            <section id="sponsor-ack-document" className="bg-white text-slate-900 shadow-xl relative overflow-hidden shrink-0"
              style={{ width: '210mm', minHeight: '297mm', padding: '18mm 20mm', fontFamily: "'Sarabun', 'Kanit', sans-serif" }}>
              <div className="absolute inset-3 border-4 border-double border-amber-500 pointer-events-none" />
              <div className="relative min-h-[255mm] flex flex-col text-center">
                <div className="flex justify-between text-sm text-slate-600">
                  <span>เลขที่ {documentNo || '....................'}</span><span>{thaiDate}</span>
                </div>
                <div className="relative w-28 h-28 rounded-full bg-indigo-50 text-indigo-600 mx-auto mt-7 flex items-center justify-center overflow-hidden">
                  <Trophy className="w-12 h-12" />
                  {competitionLogo && <img src={competitionLogo} alt="ตราการแข่งขัน"
                    onError={event => { event.currentTarget.style.display = 'none'; }}
                    className="absolute inset-0 w-full h-full object-contain bg-white" />}
                </div>
                <p className="text-sm tracking-[0.35em] text-amber-700 font-bold mt-5">CERTIFICATE OF APPRECIATION</p>
                <h1 className="text-5xl font-black text-indigo-950 mt-2">ใบอนุโมทนา</h1>
                <p className="text-lg mt-8">มอบไว้เพื่อแสดงว่า</p>
                <h2 className="text-3xl font-black text-violet-800 mt-3 border-b-2 border-amber-400 pb-3 mx-12">{sponsor.name}</h2>
                <p className="text-lg leading-loose mt-8 px-6">
                  {contributionSentence}<br />เพื่อร่วมสนับสนุนการจัดการแข่งขัน <strong>“{tournamentName}”</strong><br />
                  ขออำนาจคุณพระศรีรัตนตรัยและกุศลเจตนาในครั้งนี้ จงดลบันดาลให้ท่านประสบแต่ความสุข ความเจริญ และความสำเร็จสืบไป
                </p>
                <div className="mt-auto flex justify-end pr-12 pb-5">
                  <div className="w-72 text-center">
                    {signaturePreview ? <img src={signaturePreview} alt="ลายเซ็น" className="h-20 w-48 mx-auto object-contain -mb-2" /> : <div className="h-16" />}
                    <p className="border-b border-slate-500 pb-1">({signerName || '................................................'})</p>
                    <p className="text-sm mt-2">{signerTitle || 'ตำแหน่งผู้ลงนาม'}</p>
                  </div>
                </div>
              </div>
            </section>
          </main>
        </div>
        <style>{`@media print {
          @page { size: A4 portrait; margin: 0; }
          body > * { display: none !important; }
          body > [data-sponsor-print-root] { display: block !important; position: static !important; background: white !important; }
          [data-sponsor-print-root] > div { display: block !important; width: auto !important; height: auto !important; overflow: visible !important; box-shadow: none !important; }
          [data-sponsor-print-root] header, [data-sponsor-print-root] aside { display: none !important; }
          #sponsor-ack-print-host { display: block !important; padding: 0 !important; overflow: visible !important; background: white !important; }
          #sponsor-ack-document { display: block !important; position: static !important; width: 210mm !important; min-height: 297mm !important; box-shadow: none !important; }
        }`}</style>
      </div>
    </div>, document.body,
  );
};

const SponsorPage: React.FC<Props> = ({
  tournamentId, tournamentName, config, canManage = false, onBack, onDonate, onRefresh, notify,
}) => {
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  const [serverCanManage, setServerCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editor, setEditor] = useState<{ sponsor: Sponsor | null } | null>(null);
  const [acknowledgementSponsor, setAcknowledgementSponsor] = useState<Sponsor | null>(null);
  const [paymentSettingsOpen, setPaymentSettingsOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchSponsorPageData(tournamentId);
      setSponsors(data.sponsors);
      setServerCanManage(data.canManage);
    } catch (error: any) {
      notify('โหลดข้อมูลสปอนเซอร์ไม่สำเร็จ', error?.message || 'กรุณาลองใหม่อีกครั้ง', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [tournamentId]);

  const visible = useMemo(() => sponsors.filter(sponsor => {
    const type = String(sponsor.type || '');
    return !type.includes('::') || type.endsWith(`::${tournamentId}`);
  }), [sponsors, tournamentId]);
  const tournamentSponsors = useMemo(() => visible.filter(sponsor =>
    String(sponsor.type || '').endsWith(`::${tournamentId}`)), [visible, tournamentId]);
  const mayManage = canManage || serverCanManage;
  const mainSponsors = visible.filter(sponsor => sponsorTier(sponsor) === 'Main');
  const supportingSponsors = visible.filter(sponsor => sponsorTier(sponsor) === 'Support');
  const moneyTotal = visible.filter(item => item.contributionType === 'Money')
    .reduce((sum, item) => sum + Number(item.contributionAmount || 0), 0);
  const goodsCount = visible.filter(item => item.contributionType === 'Goods').length;
  const signerDefaults = tournamentSponsors.find(item => item.signerName || item.signatureUrl);

  const removeSponsor = async (sponsor: Sponsor) => {
    if (!await confirmAction(`“${sponsor.name}” จะถูกนำออกจากหน้านี้และ Live Wall`, {
      title: 'ลบสปอนเซอร์นี้?', confirmText: 'ลบสปอนเซอร์', dangerous: true,
    })) return;
    setBusy(true);
    try {
      await manageSponsor({ subAction: 'delete', id: sponsor.id });
      await load();
      notify('ลบสปอนเซอร์แล้ว', '', 'info');
    } catch (error: any) {
      notify('ลบไม่สำเร็จ', error?.message || 'กรุณาลองใหม่อีกครั้ง', 'error');
    } finally {
      setBusy(false);
    }
  };

  const sharePage = async () => {
    const data = { title: `ร่วมสนับสนุน ${tournamentName}`, text: `ขอเชิญร่วมเป็นผู้สนับสนุนการแข่งขัน ${tournamentName}`, url: window.location.href };
    try {
      if (navigator.share) await navigator.share(data);
      else {
        await navigator.clipboard.writeText(window.location.href);
        notify('คัดลอกลิงก์แล้ว', 'นำลิงก์ไปส่งให้ผู้สนับสนุนได้ทันที', 'success');
      }
    } catch { /* ผู้ใช้ปิดหน้าต่างแชร์ */ }
  };

  const SponsorGrid = ({ items }: { items: Sponsor[] }) => (
    <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5">
      {items.map(sponsor => {
        const editable = mayManage && tournamentSponsors.some(item => item.id === sponsor.id);
        return (
          <article key={sponsor.id} className="relative rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition">
            <div className="relative aspect-[4/3] rounded-xl bg-slate-50 border border-slate-100 p-3 flex items-center justify-center overflow-hidden">
              <Building2 className="w-12 h-12 text-slate-300" />
              {sponsor.logoUrl && <img src={sponsor.logoUrl} alt={sponsor.name}
                onError={event => { event.currentTarget.style.display = 'none'; }}
                className="absolute inset-3 w-[calc(100%-1.5rem)] h-[calc(100%-1.5rem)] object-contain bg-slate-50" />}
            </div>
            <h3 className="font-black text-base text-slate-800 text-center mt-3 break-words">{sponsor.name}</h3>
            <div className={`mt-2 min-h-9 rounded-xl px-2.5 py-2 text-xs font-bold text-center ${sponsor.contributionType === 'Money' ? 'bg-emerald-50 text-emerald-700' : sponsor.contributionType === 'Goods' ? 'bg-amber-50 text-amber-700' : 'bg-slate-50 text-slate-500'}`}>
              {contributionLabel(sponsor)}
              {sponsor.contributionType === 'Goods' && sponsor.contributionAmount
                ? <span className="block text-[10px] opacity-80 mt-0.5">มูลค่าประมาณ {formatMoney(sponsor.contributionAmount)} บาท</span> : null}
            </div>
            {editable && (
              <div className="mt-3 grid grid-cols-3 gap-2">
                <button type="button" onClick={() => setEditor({ sponsor })} disabled={busy}
                  className="min-h-10 rounded-xl bg-indigo-50 text-indigo-700 font-bold text-[11px] flex flex-col sm:flex-row items-center justify-center gap-1 disabled:opacity-50">
                  <Edit2 className="w-3.5 h-3.5" /> แก้ไข
                </button>
                <button type="button" onClick={() => setAcknowledgementSponsor(sponsor)} disabled={busy}
                  className="min-h-10 rounded-xl bg-violet-50 text-violet-700 font-bold text-[11px] flex flex-col sm:flex-row items-center justify-center gap-1 disabled:opacity-50">
                  <FileSignature className="w-3.5 h-3.5" /> ใบอนุโมทนา
                </button>
                <button type="button" onClick={() => void removeSponsor(sponsor)} disabled={busy}
                  className="min-h-10 rounded-xl bg-rose-50 text-rose-700 font-bold text-[11px] flex flex-col sm:flex-row items-center justify-center gap-1 disabled:opacity-50">
                  <Trash2 className="w-3.5 h-3.5" /> ลบ
                </button>
              </div>
            )}
          </article>
        );
      })}
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 pb-28">
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200">
        <div className="max-w-6xl mx-auto h-16 px-3 sm:px-5 flex items-center gap-3">
          <button onClick={onBack} aria-label="กลับ" className="w-10 h-10 rounded-xl hover:bg-slate-100 flex items-center justify-center"><ArrowLeft className="w-5 h-5" /></button>
          <div className="min-w-0 flex-1"><p className="font-black text-slate-900 truncate">ผู้สนับสนุนการแข่งขัน</p><p className="text-[11px] text-slate-500 truncate">{tournamentName}</p></div>
          <button onClick={() => void sharePage()} className="min-h-10 px-3 rounded-xl bg-indigo-50 text-indigo-700 font-bold text-sm flex items-center gap-2">
            <Share2 className="w-4 h-4" /> <span className="hidden sm:inline">แชร์หน้านี้</span>
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-3 sm:px-5 py-5 space-y-6">
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-700 via-violet-700 to-fuchsia-700 text-white p-6 sm:p-10 shadow-xl">
          <div className="absolute -right-16 -top-20 w-64 h-64 rounded-full bg-white/10" />
          <div className="relative max-w-4xl">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/15 border border-white/20 px-3 py-1.5 text-xs font-bold"><Handshake className="w-4 h-4" /> PARTNERSHIP OPPORTUNITY</span>
            <h1 className="text-3xl sm:text-5xl font-black leading-tight mt-4">ร่วมเป็นพลังสำคัญของการแข่งขัน</h1>
            <p className="text-indigo-100 mt-3 leading-relaxed max-w-2xl">ขอเชิญองค์กร ร้านค้า และผู้สนับสนุนร่วมจัดงานกับ {tournamentName} โลโก้ของท่านจะปรากฏบนหน้าผู้สนับสนุนและสไลด์ประชาสัมพันธ์ใน Live Wall</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mt-6">
              {[
                [visible.length, 'ผู้สนับสนุน'], [mainSponsors.length, 'ผู้สนับสนุนหลัก'],
                [formatMoney(moneyTotal), 'ยอดสนับสนุน (บาท)'], [goodsCount, 'สนับสนุนสิ่งของ'],
              ].map(([value, label]) => (
                <div key={String(label)} className="rounded-2xl bg-slate-950/20 border border-white/15 p-3 text-center">
                  <p className="text-xl sm:text-2xl font-black truncate">{value}</p><p className="text-[10px] sm:text-xs text-indigo-100 mt-0.5">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {mayManage && (
          <section className="rounded-3xl bg-white border border-indigo-100 shadow-sm p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0"><ImagePlus className="w-6 h-6" /></div>
            <div className="flex-1"><h2 className="font-black text-lg">จัดการสปอนเซอร์ของรายการ</h2><p className="text-xs text-slate-500 mt-0.5">เพิ่ม แก้ไข ลบ แยกเงิน/สิ่งของ และออกใบอนุโมทนาได้จากหน้านี้</p></div>
            <div className="grid sm:grid-cols-2 gap-2 w-full sm:w-auto">
              <button onClick={() => setPaymentSettingsOpen(true)} className="min-h-12 px-4 rounded-xl bg-pink-50 text-pink-700 border border-pink-200 font-black flex items-center justify-center gap-2"><Settings className="w-5 h-5" /> บัญชี / QR รับเงิน</button>
              <button onClick={() => setEditor({ sponsor: null })} className="min-h-12 px-5 rounded-xl bg-indigo-600 text-white font-black flex items-center justify-center gap-2"><Plus className="w-5 h-5" /> เพิ่มสปอนเซอร์</button>
            </div>
          </section>
        )}

        {loading ? (
          <div className="py-16 flex items-center justify-center text-slate-500"><Loader2 className="w-6 h-6 animate-spin mr-2" /> กำลังโหลด…</div>
        ) : visible.length === 0 ? (
          <section className="rounded-3xl border-2 border-dashed border-slate-300 bg-white py-16 px-5 text-center">
            <Gift className="w-12 h-12 text-indigo-300 mx-auto" /><h2 className="font-black text-xl mt-3">เปิดรับผู้สนับสนุนร่วมจัดงาน</h2><p className="text-sm text-slate-500 mt-2">สนใจร่วมสนับสนุน กรุณาติดต่อโรงเรียนเจ้าภาพหรือผู้ดูแลการแข่งขัน</p>
          </section>
        ) : (
          <>
            {mainSponsors.length > 0 && <section><h2 className="font-black text-xl flex items-center gap-2 mb-4"><Trophy className="w-5 h-5 text-amber-500" /> ผู้สนับสนุนหลัก</h2><SponsorGrid items={mainSponsors} /></section>}
            {supportingSponsors.length > 0 && <section><h2 className="font-black text-xl flex items-center gap-2 mb-4"><Sparkles className="w-5 h-5 text-indigo-500" /> ผู้ร่วมสนับสนุน</h2><SponsorGrid items={supportingSponsors} /></section>}
          </>
        )}

        <SponsorDonationCard config={config} onDonate={onDonate} />

        <section className="rounded-3xl bg-slate-900 text-white p-6 sm:p-8 flex flex-col sm:flex-row gap-5 sm:items-center">
          <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center shrink-0"><Handshake className="w-7 h-7 text-indigo-300" /></div>
          <div className="flex-1"><h2 className="font-black text-xl">สนใจร่วมจัดงานกับเรา</h2><p className="text-sm text-slate-300 mt-1">ติดต่อโรงเรียนเจ้าภาพหรือผู้ดูแล {tournamentName} เพื่อพูดคุยรูปแบบการสนับสนุนที่เหมาะสม{config.locationName ? ` ณ ${config.locationName}` : ''}</p></div>
          <button onClick={() => void sharePage()} className="min-h-12 px-5 rounded-xl bg-white text-slate-900 font-black flex items-center justify-center gap-2 shrink-0"><Share2 className="w-4 h-4" /> ส่งต่อโอกาสนี้</button>
        </section>
      </main>

      {editor && <SponsorEditorDialog sponsor={editor.sponsor} tournamentId={tournamentId} onClose={() => setEditor(null)} onSaved={load} notify={notify} />}
      {acknowledgementSponsor && (
        <SponsorAcknowledgementDialog sponsor={acknowledgementSponsor} tournamentName={tournamentName}
          competitionLogo={config.competitionLogo} signerDefaults={signerDefaults}
          onClose={() => setAcknowledgementSponsor(null)} onSaved={load} notify={notify} />
      )}
      {paymentSettingsOpen && (
        <SponsorPaymentSettingsDialog tournamentId={tournamentId} config={config}
          onClose={() => setPaymentSettingsOpen(false)} onSaved={async () => { await onRefresh?.(); }} notify={notify} />
      )}
    </div>
  );
};

export default SponsorPage;
