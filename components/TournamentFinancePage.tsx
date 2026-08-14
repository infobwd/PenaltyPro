import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft, BadgeDollarSign, BanknoteArrowDown, BanknoteArrowUp, Download,
  FileText, HandCoins, Loader2, Paperclip, Pencil, Plus, ReceiptText, Save,
  Search, Trash2, UserMinus, UserPlus, Users, WalletCards, X,
} from 'lucide-react';
import { apiGet, apiPost, ApiError } from '../services/apiConfig';
import { fileToBase64 } from '../services/sheetService';
import { confirmAction } from '../services/uiService';

type Notice = (title: string, message?: string, type?: 'success' | 'error' | 'info' | 'warning') => void;

type FinanceEntry = {
  id: string;
  type: 'Income' | 'Expense';
  category: string;
  description: string;
  amount: number;
  date: string;
  evidenceUrl: string;
  fundingSource: 'Tournament' | 'HostSponsor';
  createdByName?: string;
  updatedByName?: string;
  updatedAt?: string;
};

type FinanceUser = {
  userId: string;
  displayName: string;
  username?: string;
  role?: string;
  pictureUrl?: string;
  assignedAt?: string;
};

type FinanceData = {
  entries: FinanceEntry[];
  members: FinanceUser[];
  users: FinanceUser[];
  canManage: boolean;
  canEdit: boolean;
  summary: {
    income: number;
    expense: number;
    hostSupport: number;
    cashExpense: number;
    balance: number;
    missingEvidence: number;
  };
};

type Props = {
  tournamentId: string;
  tournamentName: string;
  onBack: () => void;
  notify: Notice;
};

const ENTRY_CATEGORIES = {
  Income: ['ค่าสมัครทีม', 'เงินบริจาค', 'เงินสนับสนุน', 'จำหน่ายสินค้า', 'รายรับอื่น ๆ'],
  Expense: ['ค่ากระดาษ/เอกสาร', 'ค่าถ้วยรางวัล/เหรียญ', 'ค่าอาหารและเครื่องดื่ม', 'ค่าอุปกรณ์กีฬา', 'ค่าสถานที่', 'ค่าเดินทาง', 'ค่าประชาสัมพันธ์', 'ค่าใช้จ่ายอื่น ๆ'],
} as const;

const emptySummary: FinanceData['summary'] = {
  income: 0, expense: 0, hostSupport: 0, cashExpense: 0, balance: 0, missingEvidence: 0,
};

const localDate = () => {
  const date = new Date();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
};

const money = (value: number) => value.toLocaleString('th-TH', {
  minimumFractionDigits: 0, maximumFractionDigits: 2,
});

const inputClass = 'w-full min-h-12 rounded-xl border border-slate-300 bg-white px-3.5 text-base text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';

const EntryDialog: React.FC<{
  tournamentId: string;
  entry: FinanceEntry | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
  notify: Notice;
}> = ({ tournamentId, entry, onClose, onSaved, notify }) => {
  const [type, setType] = useState<'Income' | 'Expense'>(entry?.type || 'Expense');
  const [category, setCategory] = useState(entry?.category || '');
  const [description, setDescription] = useState(entry?.description || '');
  const [amount, setAmount] = useState(entry ? String(entry.amount) : '');
  const [date, setDate] = useState(entry?.date || localDate());
  const [paidByHost, setPaidByHost] = useState(entry?.fundingSource === 'HostSponsor');
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [removeEvidence, setRemoveEvidence] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || !category.trim() || !description.trim() || Number(amount) <= 0) return;
    setBusy(true);
    try {
      const payload: Record<string, unknown> = {
        tournamentId, id: entry?.id, type, category: category.trim(),
        description: description.trim(), amount: Number(amount), date,
        paidByHost: type === 'Expense' && paidByHost, removeEvidence,
      };
      if (evidenceFile) payload.evidenceFile = await fileToBase64(evidenceFile);
      await apiPost('saveFinanceEntry', payload);
      await onSaved();
      notify(entry ? 'แก้ไขรายการบัญชีแล้ว' : 'เพิ่มรายการบัญชีแล้ว',
        paidByHost && type === 'Expense' ? 'ยอดสนับสนุนของเจ้าภาพในหน้า Sponsors ถูกปรับแล้ว' : '', 'success');
      onClose();
    } catch (error: any) {
      notify('บันทึกไม่สำเร็จ', error?.message || 'กรุณาลองใหม่', 'error');
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 bg-slate-950/65 backdrop-blur-sm modal-sheet flex items-end md:items-center justify-center p-0 md:p-4 overflow-hidden"
      style={{ zIndex: 2147483646 }} onClick={onClose} role="presentation">
      <form onSubmit={submit} onClick={event => event.stopPropagation()}
        className="w-full md:max-w-2xl max-h-[calc(100dvh-env(safe-area-inset-top))] md:max-h-[92vh]
                   rounded-t-3xl md:rounded-3xl bg-white shadow-2xl flex flex-col overflow-hidden safe-area-bottom"
        role="dialog" aria-modal="true" aria-label={entry ? 'แก้ไขรายการบัญชี' : 'เพิ่มรายการบัญชี'}>
        <header className="flex items-center gap-3 border-b border-slate-200 px-5 py-4 shrink-0">
          <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${type === 'Income' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
            {type === 'Income' ? <BanknoteArrowUp className="w-5 h-5" /> : <BanknoteArrowDown className="w-5 h-5" />}
          </div>
          <div className="min-w-0 flex-1"><h2 className="font-black text-xl text-slate-900">{entry ? 'แก้ไขรายการ' : 'เพิ่มรายการบัญชี'}</h2><p className="text-xs text-slate-500">แนบใบเสร็จ รูปหลักฐาน หรือ PDF รวมไว้กับรายการได้</p></div>
          <button type="button" onClick={onClose} aria-label="ปิด" className="w-10 h-10 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center"><X className="w-5 h-5" /></button>
        </header>

        <div className="overflow-y-auto overscroll-contain p-5 space-y-4">
          <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1.5">
            {(['Income', 'Expense'] as const).map(value => (
              <button key={value} type="button" onClick={() => { setType(value); if (value === 'Income') setPaidByHost(false); }}
                className={`min-h-11 rounded-xl font-black ${type === value ? value === 'Income' ? 'bg-emerald-600 text-white shadow' : 'bg-rose-600 text-white shadow' : 'text-slate-500'}`}>
                {value === 'Income' ? 'รายรับ' : 'รายจ่าย'}
              </button>
            ))}
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <label><span className="text-xs font-bold text-slate-600">หมวดหมู่</span>
              <input list={`finance-categories-${type}`} value={category} onChange={event => setCategory(event.target.value)} className={`${inputClass} mt-1`} placeholder="เลือกหรือพิมพ์หมวดใหม่" />
              <datalist id={`finance-categories-${type}`}>{ENTRY_CATEGORIES[type].map(item => <option key={item} value={item} />)}</datalist>
            </label>
            <label><span className="text-xs font-bold text-slate-600">วันที่</span><input type="date" value={date} onChange={event => setDate(event.target.value)} className={`${inputClass} mt-1`} required /></label>
            <label className="sm:col-span-2"><span className="text-xs font-bold text-slate-600">รายละเอียด</span><textarea value={description} onChange={event => setDescription(event.target.value)} className={`${inputClass} mt-1 min-h-24 py-3 resize-y`} placeholder="เช่น กระดาษ A4 สำหรับพิมพ์ใบสมัคร 5 รีม" required /></label>
            <label className="sm:col-span-2"><span className="text-xs font-bold text-slate-600">จำนวนเงิน (บาท)</span><input type="number" min="0.01" step="0.01" inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)} className={`${inputClass} mt-1 font-black text-lg`} placeholder="0.00" required /></label>
          </div>

          {type === 'Expense' && (
            <label className={`flex items-start gap-3 rounded-2xl border-2 p-4 cursor-pointer ${paidByHost ? 'border-amber-400 bg-amber-50' : 'border-slate-200'}`}>
              <input type="checkbox" checked={paidByHost} onChange={event => setPaidByHost(event.target.checked)} className="mt-0.5 w-5 h-5 accent-amber-600" />
              <span><span className="block font-black text-slate-800">เจ้าภาพสนับสนุนค่าใช้จ่ายรายการนี้</span><span className="block text-xs text-slate-500 mt-1">นับเป็นรายจ่ายของงาน แต่ไม่หักจากเงินสดของรายการ และนำยอดไปรวมในหน้า Sponsors</span></span>
            </label>
          )}

          <div className="rounded-2xl border-2 border-dashed border-slate-300 p-4">
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0"><Paperclip className="w-5 h-5" /></div>
              <div className="min-w-0 flex-1">
                <p className="font-black text-slate-800">หลักฐานรายการ</p>
                <p className="text-xs text-slate-500">รูปใบเสร็จหรือ PDF ไม่เกินขนาดอัปโหลดของระบบ</p>
                <label className="mt-3 inline-flex cursor-pointer rounded-xl bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-700">
                  {evidenceFile ? evidenceFile.name : entry?.evidenceUrl && !removeEvidence ? 'เปลี่ยนหลักฐาน' : 'เลือกไฟล์หลักฐาน'}
                  <input type="file" accept="image/*,application/pdf" className="sr-only" onChange={event => { setEvidenceFile(event.target.files?.[0] || null); setRemoveEvidence(false); }} />
                </label>
                {entry?.evidenceUrl && !evidenceFile && !removeEvidence && <button type="button" onClick={() => setRemoveEvidence(true)} className="ml-2 text-xs font-bold text-rose-600">นำออก</button>}
                {removeEvidence && <button type="button" onClick={() => setRemoveEvidence(false)} className="ml-2 text-xs font-bold text-slate-600">ยกเลิกการนำออก</button>}
              </div>
            </div>
          </div>
        </div>

        <footer className="grid grid-cols-[0.75fr_1.25fr] gap-3 border-t border-slate-200 p-4 shrink-0">
          <button type="button" onClick={onClose} className="min-h-12 rounded-xl bg-slate-100 font-black text-slate-700">ยกเลิก</button>
          <button type="submit" disabled={busy || !category.trim() || !description.trim() || Number(amount) <= 0}
            className="min-h-12 rounded-xl bg-indigo-600 text-white font-black flex items-center justify-center gap-2 disabled:opacity-50">
            {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />} บันทึกรายการ
          </button>
        </footer>
      </form>
    </div>, document.body,
  );
};

const TournamentFinancePage: React.FC<Props> = ({ tournamentId, tournamentName, onBack, notify }) => {
  const [data, setData] = useState<FinanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessError, setAccessError] = useState('');
  const [editor, setEditor] = useState<FinanceEntry | null | undefined>(undefined);
  const [filter, setFilter] = useState<'All' | 'Income' | 'Expense' | 'MissingEvidence'>('All');
  const [query, setQuery] = useState('');
  const [userQuery, setUserQuery] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [busy, setBusy] = useState('');
  const [visibleCount, setVisibleCount] = useState(30);

  const load = async () => {
    setLoading(true);
    setAccessError('');
    try {
      const response = await apiGet<FinanceData>('getFinanceData', { tournamentId });
      setData(response);
    } catch (error) {
      const apiError = error as ApiError;
      setAccessError(apiError.message || 'โหลดข้อมูลบัญชีไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); }, [tournamentId]);

  const entries = useMemo(() => (data?.entries || []).filter(entry => {
    if (filter === 'MissingEvidence' && entry.evidenceUrl) return false;
    if (filter === 'Income' && entry.type !== 'Income') return false;
    if (filter === 'Expense' && entry.type !== 'Expense') return false;
    const text = `${entry.category} ${entry.description} ${entry.createdByName || ''}`.toLowerCase();
    return text.includes(query.trim().toLowerCase());
  }), [data?.entries, filter, query]);

  const userChoices = useMemo(() => {
    const assigned = new Set((data?.members || []).map(member => member.userId));
    const q = userQuery.trim().toLowerCase();
    return (data?.users || []).filter(user => !assigned.has(user.userId)
      && (`${user.displayName} ${user.username || ''} ${user.role || ''}`).toLowerCase().includes(q)).slice(0, 30);
  }, [data?.users, data?.members, userQuery]);

  const assign = async () => {
    if (!selectedUserId || busy) return;
    setBusy('assign');
    try {
      const response = await apiPost('assignFinanceAccountant', { tournamentId, userId: selectedUserId });
      notify('มอบหมายผู้ทำบัญชีแล้ว', response.displayName, 'success');
      setSelectedUserId(''); setUserQuery(''); await load();
    } catch (error: any) { notify('มอบหมายไม่สำเร็จ', error?.message, 'error'); }
    finally { setBusy(''); }
  };

  const removeMember = async (member: FinanceUser) => {
    if (!await confirmAction(`ถอนสิทธิ์ทำบัญชีของ “${member.displayName}” หรือไม่?`, { title: 'ถอนผู้ทำบัญชี?', dangerous: true, confirmText: 'ถอนสิทธิ์' })) return;
    setBusy(`member:${member.userId}`);
    try {
      await apiPost('assignFinanceAccountant', { tournamentId, userId: member.userId, remove: true });
      notify('ถอนสิทธิ์แล้ว', member.displayName, 'info'); await load();
    } catch (error: any) { notify('ถอนสิทธิ์ไม่สำเร็จ', error?.message, 'error'); }
    finally { setBusy(''); }
  };

  const removeEntry = async (entry: FinanceEntry) => {
    if (!await confirmAction(`ลบ “${entry.description}” จำนวน ${money(entry.amount)} บาท หรือไม่?`, { title: 'ลบรายการบัญชี?', dangerous: true, confirmText: 'ลบรายการ' })) return;
    setBusy(`entry:${entry.id}`);
    try {
      await apiPost('deleteFinanceEntry', { tournamentId, id: entry.id });
      notify('ลบรายการแล้ว', '', 'info'); await load();
    } catch (error: any) { notify('ลบไม่สำเร็จ', error?.message, 'error'); }
    finally { setBusy(''); }
  };

  const exportCsv = () => {
    const rows = [['วันที่', 'ประเภท', 'หมวดหมู่', 'รายละเอียด', 'จำนวนเงิน', 'แหล่งเงิน', 'หลักฐาน', 'ผู้บันทึก'],
      ...(data?.entries || []).map(entry => [entry.date, entry.type === 'Income' ? 'รายรับ' : 'รายจ่าย', entry.category,
        entry.description, String(entry.amount), entry.fundingSource === 'HostSponsor' ? 'เจ้าภาพสนับสนุน' : 'งบรายการ',
        entry.evidenceUrl, entry.createdByName || ''])];
    const csv = '\uFEFF' + rows.map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `finance-${tournamentId}.csv`; anchor.click(); URL.revokeObjectURL(url);
  };

  if (loading) return <div className="min-h-[100dvh] bg-slate-50 flex items-center justify-center text-slate-500"><Loader2 className="w-6 h-6 animate-spin mr-2" /> กำลังโหลดบัญชี…</div>;
  if (accessError) return <div className="min-h-[100dvh] bg-slate-50 p-5"><button onClick={onBack} className="min-h-11 px-4 rounded-xl bg-white border font-bold flex items-center gap-2"><ArrowLeft className="w-4 h-4" /> กลับ</button><div className="max-w-md mx-auto mt-16 rounded-3xl bg-white border p-8 text-center"><WalletCards className="w-12 h-12 text-slate-300 mx-auto" /><h1 className="font-black text-xl mt-3">ไม่สามารถเปิดหน้าการเงิน</h1><p className="text-sm text-slate-500 mt-2">{accessError}</p></div></div>;

  const summary = data?.summary || emptySummary;
  return (
    <div className="min-h-[100dvh] bg-slate-50 pb-24">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="max-w-6xl mx-auto h-16 px-3 sm:px-5 flex items-center gap-3">
          <button onClick={onBack} aria-label="กลับ" className="w-10 h-10 rounded-xl hover:bg-slate-100 flex items-center justify-center"><ArrowLeft className="w-5 h-5" /></button>
          <div className="min-w-0 flex-1"><h1 className="font-black text-slate-900 truncate">การเงินรายการ</h1><p className="text-[11px] text-slate-500 truncate">{tournamentName}</p></div>
          {data?.canEdit && <button onClick={() => setEditor(null)} className="min-h-10 px-3 rounded-xl bg-indigo-600 text-white text-sm font-black flex items-center gap-2"><Plus className="w-4 h-4" /><span className="hidden sm:inline">เพิ่มรายการ</span></button>}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-3 sm:px-5 py-5 space-y-5">
        <section className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {[
            { label: 'รายรับทั้งหมด', value: summary.income, icon: BanknoteArrowUp, cls: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
            { label: 'รายจ่ายทั้งหมด', value: summary.expense, icon: BanknoteArrowDown, cls: 'bg-rose-50 text-rose-700 border-rose-100' },
            { label: 'เจ้าภาพสนับสนุน', value: summary.hostSupport, icon: HandCoins, cls: 'bg-amber-50 text-amber-700 border-amber-100' },
            { label: 'ใช้งบรายการ', value: summary.cashExpense, icon: BadgeDollarSign, cls: 'bg-indigo-50 text-indigo-700 border-indigo-100' },
            { label: 'คงเหลือสุทธิ', value: summary.balance, icon: WalletCards, cls: summary.balance >= 0 ? 'bg-sky-50 text-sky-700 border-sky-100' : 'bg-rose-50 text-rose-700 border-rose-100' },
          ].map(card => <article key={card.label} className={`rounded-2xl border p-4 ${card.cls}`}><card.icon className="w-5 h-5" /><p className="text-[11px] font-bold mt-3">{card.label}</p><p className="text-xl sm:text-2xl font-black mt-0.5 break-all">{money(card.value)} <span className="text-[10px]">บาท</span></p></article>)}
        </section>

        {data?.canManage && (
          <section className="rounded-3xl bg-white border border-slate-200 shadow-sm p-4 sm:p-6">
            <div className="flex items-start gap-3"><div className="w-11 h-11 rounded-2xl bg-violet-100 text-violet-700 flex items-center justify-center shrink-0"><Users className="w-5 h-5" /></div><div><h2 className="font-black text-lg">ผู้รับผิดชอบบัญชี</h2><p className="text-xs text-slate-500">แอดมินหรือเจ้าภาพเลือกผู้ใช้คนใดก็ได้ โดยไม่ต้องเปลี่ยนบทบาทของบัญชีนั้น</p></div></div>
            <div className="mt-4 flex flex-wrap gap-2">{(data.members || []).length === 0 ? <span className="text-sm text-slate-400">ยังไม่ได้มอบหมายผู้ทำบัญชี</span> : data.members.map(member => <span key={member.userId} className="inline-flex items-center gap-2 rounded-xl bg-violet-50 border border-violet-100 px-3 py-2 text-sm font-bold text-violet-800">{member.displayName}<button onClick={() => void removeMember(member)} disabled={busy !== ''} aria-label={`ถอน ${member.displayName}`} className="text-rose-500"><UserMinus className="w-4 h-4" /></button></span>)}</div>
            <div className="mt-4 grid sm:grid-cols-[1fr_1fr_auto] gap-2">
              <div className="relative"><Search className="absolute left-3 top-3.5 w-4 h-4 text-slate-400" /><input value={userQuery} onChange={event => setUserQuery(event.target.value)} className={`${inputClass} pl-9`} placeholder="ค้นหาชื่อหรือชื่อผู้ใช้" /></div>
              <select value={selectedUserId} onChange={event => setSelectedUserId(event.target.value)} className={inputClass}><option value="">เลือกผู้ใช้ ({userChoices.length})</option>{userChoices.map(user => <option key={user.userId} value={user.userId}>{user.displayName}{user.username ? ` · ${user.username}` : ''} ({user.role})</option>)}</select>
              <button onClick={() => void assign()} disabled={!selectedUserId || busy !== ''} className="min-h-12 px-5 rounded-xl bg-violet-600 text-white font-black flex items-center justify-center gap-2 disabled:opacity-50"><UserPlus className="w-4 h-4" /> มอบหมาย</button>
            </div>
          </section>
        )}

        <section className="rounded-3xl bg-white border border-slate-200 shadow-sm overflow-hidden">
          <header className="p-4 sm:p-5 border-b border-slate-200 space-y-3">
            <div className="flex items-center gap-3"><ReceiptText className="w-5 h-5 text-indigo-600" /><div className="flex-1"><h2 className="font-black text-lg">สมุดบัญชีการแข่งขัน</h2><p className="text-xs text-slate-500">{data?.entries.length || 0} รายการ · ไม่มีหลักฐาน {summary.missingEvidence} รายการ</p></div><button onClick={exportCsv} className="min-h-10 px-3 rounded-xl bg-slate-100 text-slate-700 text-xs font-black flex items-center gap-2"><Download className="w-4 h-4" /> CSV</button></div>
            <div className="grid sm:grid-cols-[1fr_auto] gap-2"><div className="relative"><Search className="absolute left-3 top-3.5 w-4 h-4 text-slate-400" /><input value={query} onChange={event => { setQuery(event.target.value); setVisibleCount(30); }} className={`${inputClass} pl-9`} placeholder="ค้นหาหมวด รายละเอียด หรือผู้บันทึก" /></div><div className="flex gap-1.5 overflow-x-auto">{([['All', 'ทั้งหมด'], ['Income', 'รายรับ'], ['Expense', 'รายจ่าย'], ['MissingEvidence', 'ไม่มีหลักฐาน']] as const).map(([key, label]) => <button key={key} onClick={() => { setFilter(key); setVisibleCount(30); }} className={`shrink-0 min-h-12 px-3 rounded-xl text-xs font-black ${filter === key ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>{label}</button>)}</div></div>
          </header>

          {entries.length === 0 ? <div className="py-16 text-center text-slate-400"><ReceiptText className="w-10 h-10 mx-auto text-slate-300" /><p className="font-bold mt-3">ยังไม่มีรายการที่ตรงกับตัวกรอง</p></div> : <div className="divide-y divide-slate-100">{entries.slice(0, visibleCount).map(entry => <article key={entry.id} className="p-4 sm:p-5 hover:bg-slate-50/70"><div className="flex items-start gap-3"><div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${entry.type === 'Income' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>{entry.type === 'Income' ? <BanknoteArrowUp className="w-5 h-5" /> : <BanknoteArrowDown className="w-5 h-5" />}</div><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-3"><div><p className="font-black text-slate-800 break-words">{entry.description}</p><p className="text-xs text-slate-500 mt-0.5">{entry.category} · {new Date(`${entry.date}T12:00:00`).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}</p></div><p className={`font-black text-lg shrink-0 ${entry.type === 'Income' ? 'text-emerald-600' : 'text-rose-600'}`}>{entry.type === 'Income' ? '+' : '-'}{money(entry.amount)}</p></div><div className="mt-2 flex flex-wrap items-center gap-2">{entry.fundingSource === 'HostSponsor' && <span className="rounded-full bg-amber-100 text-amber-800 px-2 py-1 text-[10px] font-black">เจ้าภาพสนับสนุน · แสดงใน Sponsors</span>}{entry.evidenceUrl ? <a href={entry.evidenceUrl} target="_blank" rel="noreferrer" className="rounded-full bg-indigo-50 text-indigo-700 px-2 py-1 text-[10px] font-black flex items-center gap-1"><FileText className="w-3 h-3" /> ดูหลักฐาน</a> : <span className="rounded-full bg-slate-100 text-slate-500 px-2 py-1 text-[10px] font-black">ยังไม่มีหลักฐาน</span>}<span className="text-[10px] text-slate-400">บันทึกโดย {entry.createdByName || 'ไม่ระบุ'}</span></div></div>{data?.canEdit && <div className="flex flex-col gap-1 shrink-0"><button onClick={() => setEditor(entry)} aria-label={`แก้ไข ${entry.description}`} className="w-9 h-9 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center"><Pencil className="w-4 h-4" /></button><button onClick={() => void removeEntry(entry)} disabled={busy !== ''} aria-label={`ลบ ${entry.description}`} className="w-9 h-9 rounded-xl bg-rose-50 text-rose-700 flex items-center justify-center disabled:opacity-40"><Trash2 className="w-4 h-4" /></button></div>}</div></article>)}</div>}
          {entries.length > visibleCount && <button onClick={() => setVisibleCount(count => count + 30)} className="w-full min-h-12 border-t border-slate-200 text-sm font-black text-indigo-600">แสดงเพิ่มอีก {Math.min(30, entries.length - visibleCount)} รายการ</button>}
        </section>
      </main>

      {editor !== undefined && <EntryDialog tournamentId={tournamentId} entry={editor} onClose={() => setEditor(undefined)} onSaved={load} notify={notify} />}
    </div>
  );
};

export default TournamentFinancePage;
