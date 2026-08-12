import React, { useEffect, useState } from 'react';
import {
  Copy, KeyRound, CheckCircle2, XCircle, UserCog, RefreshCw,
  Printer, Loader2, AlertTriangle, ShieldCheck, Search, ReceiptText,
  Eye, Clock3, WalletCards, UserMinus, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { Tournament, Team } from '../types';
import { apiGet, apiPost, ApiError } from '../services/apiConfig';
import SearchPicker, { PickerItem } from './SearchPicker';
import { confirmAction, promptAction } from '../services/uiService';

/**
 * เครื่องมือผู้ดูแล — งานที่ทำผ่านหน้าจอไม่ได้มาก่อน ต้องยิง API เอง
 *
 * แยกเป็นไฟล์ของตัวเองแทนที่จะยัดเพิ่มใน AdminDashboard.tsx ที่ยาว 2,400 บรรทัด
 * เพื่อให้ยังหาของเจอ และให้ส่วนนี้ทดสอบ/แก้แยกได้โดยไม่กระทบของเดิม
 */

interface Props {
  tournaments: Tournament[];
  teams: Team[];
  currentTournamentId: string;
  onRefresh: () => void;
  notify: (title: string, msg?: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
}

type IssuedCode = { schoolId: string; schoolName: string; accessCode: string };
type PaymentStatus = 'Unpaid' | 'Pending' | 'Verified' | 'Rejected';
type TournamentManagerInfo = {
  userId: string;
  displayName: string;
  username?: string;
  role?: string;
  schoolId?: string | null;
  schoolName?: string | null;
  grantedAt?: string;
};
type TournamentAssignment = {
  hostSchoolId?: string | null;
  hostSchoolName?: string | null;
  managers: TournamentManagerInfo[];
};

const Card: React.FC<{ title: string; desc: string; icon: React.ReactNode; children: React.ReactNode }> =
  ({ title, desc, icon, children }) => (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
          {icon}
        </div>
        <div className="min-w-0">
          <h3 className="font-bold text-slate-800">{title}</h3>
          <p className="text-xs text-slate-500 leading-relaxed mt-0.5">{desc}</p>
        </div>
      </div>
      {children}
    </div>
  );

const AdminTools: React.FC<Props> = ({
  tournaments, teams, currentTournamentId, onRefresh, notify,
}) => {
  const [busy, setBusy] = useState<string | null>(null);
  const [target, setTarget] = useState(currentTournamentId || tournaments[0]?.id || '');
  const [source, setSource] = useState('');
  const [issued, setIssued] = useState<IssuedCode[] | null>(() => {
    try {
      const saved = sessionStorage.getItem('kickoff_issued_codes');
      return saved ? (JSON.parse(saved) as IssuedCode[]) : null;
    } catch { return null; }
  });

  /** รหัสแสดงครั้งเดียว — กันหายถ้าแผงถูก unmount ก่อนแอดมินพิมพ์เก็บ */
  const rememberIssued = (list: IssuedCode[]) => {
    setIssued(list);
    try { sessionStorage.setItem('kickoff_issued_codes', JSON.stringify(list)); } catch {}
  };
  const [managerUserId, setManagerUserId] = useState('');
  const [hostSchoolId, setHostSchoolId] = useState('');
  const [teamFilter, setTeamFilter] = useState('');
  const [schoolList, setSchoolList] = useState<any[] | null>(null);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [schoolFilter, setSchoolFilter] = useState('');
  const [assignment, setAssignment] = useState<TournamentAssignment | null>(null);
  const [assignmentLoading, setAssignmentLoading] = useState(false);
  const [paymentFilter, setPaymentFilter] = useState<'All' | PaymentStatus>('All');
  const [paymentSearch, setPaymentSearch] = useState('');
  const [paymentPage, setPaymentPage] = useState(1);
  const [paymentOverrides, setPaymentOverrides] = useState<Record<string, {
    status: PaymentStatus;
    note: string;
  }>>({});

  const targetTournament = tournaments.find(t => t.id === target);
  const targetTeams = teams.filter(t => t.tournamentId === target);
  const pendingTeams = teams.filter(
    t => t.tournamentId === target && (t.status === 'Submitted' || t.status === 'Draft'),
  );

  const effectivePayment = (team: Team): { status: PaymentStatus; note: string } => {
    const override = paymentOverrides[team.id];
    if (override) return override;
    return {
      status: team.paymentStatus || (team.slipUrl ? 'Pending' : 'Unpaid'),
      note: team.paymentNote || '',
    };
  };

  const paymentCounts: Record<PaymentStatus, number> = targetTeams.reduce((acc: Record<PaymentStatus, number>, team: Team) => {
    acc[effectivePayment(team).status] += 1;
    return acc;
  }, { Unpaid: 0, Pending: 0, Verified: 0, Rejected: 0 });

  const paymentPageSize = 20;
  const paymentStatusOrder: Record<PaymentStatus, number> = {
    Pending: 0, Rejected: 1, Unpaid: 2, Verified: 3,
  };
  const normalizedPaymentSearch = paymentSearch.trim().toLocaleLowerCase('th-TH');
  const filteredPaymentTeams = targetTeams
    .filter(team => paymentFilter === 'All' || effectivePayment(team).status === paymentFilter)
    .filter(team => !normalizedPaymentSearch || [team.name, team.schoolName, team.group]
      .filter(Boolean)
      .some(value => String(value).toLocaleLowerCase('th-TH').includes(normalizedPaymentSearch)))
    .sort((a, b) => {
      const byStatus = paymentStatusOrder[effectivePayment(a).status] - paymentStatusOrder[effectivePayment(b).status];
      return byStatus || a.name.localeCompare(b.name, 'th');
    });
  const paymentPageCount = Math.max(1, Math.ceil(filteredPaymentTeams.length / paymentPageSize));
  const visiblePaymentTeams = filteredPaymentTeams.slice(
    (paymentPage - 1) * paymentPageSize,
    paymentPage * paymentPageSize,
  );

  useEffect(() => {
    setPaymentPage(1);
  }, [target, paymentFilter, paymentSearch]);

  useEffect(() => {
    if (paymentPage > paymentPageCount) setPaymentPage(paymentPageCount);
  }, [paymentPage, paymentPageCount]);

  const reloadAssignments = async () => {
    if (!target) {
      setAssignment(null);
      return;
    }
    const r = await apiGet('listTournamentManagers', { tournamentId: target });
    const next: TournamentAssignment = {
      hostSchoolId: r.hostSchoolId ?? null,
      hostSchoolName: r.hostSchoolName ?? null,
      managers: r.managers ?? [],
    };
    setAssignment(next);
    if (next.hostSchoolId) setHostSchoolId(next.hostSchoolId);
  };

  useEffect(() => {
    let active = true;
    setAssignmentLoading(true);
    setAssignment(null);
    setHostSchoolId('');
    apiGet('listTournamentManagers', { tournamentId: target })
      .then(r => {
        if (!active) return;
        const next: TournamentAssignment = {
          hostSchoolId: r.hostSchoolId ?? null,
          hostSchoolName: r.hostSchoolName ?? null,
          managers: r.managers ?? [],
        };
        setAssignment(next);
        if (next.hostSchoolId) setHostSchoolId(next.hostSchoolId);
      })
      .catch(() => {
        if (active) setAssignment({ managers: [] });
      })
      .finally(() => {
        if (active) setAssignmentLoading(false);
      });
    return () => { active = false; };
  }, [target]);

  /**
   * เรียก API แล้วแสดงผลจริง — ไม่กลืน error เหมือนโค้ดเดิมที่ใช้ no-cors
   *
   * `refresh: false` จำเป็นสำหรับงานที่ต้องเก็บผลลัพธ์ไว้บนจอ เพราะ onRefresh
   * ไปเรียก loadData ซึ่งทำให้ App แสดงหน้าจอ "กำลังโหลด" ทับทั้งหน้า
   * (App.tsx: `if (isLoadingData) return ...`) แผงนี้จึงถูก unmount และ state หาย
   */
  const run = async <T,>(
    key: string,
    fn: () => Promise<T>,
    refresh = true,
  ): Promise<T | null> => {
    setBusy(key);
    try {
      const res = await fn();
      if (refresh) onRefresh();
      return res;
    } catch (e) {
      const err = e as ApiError;
      // 409 = ระบบกันไว้โดยตั้งใจ ไม่ใช่ระบบพัง จึงแจ้งเป็นคำเตือน
      notify(err.status === 409 ? 'ต้องยืนยันก่อน' : 'ทำรายการไม่สำเร็จ',
        err.message, err.status === 409 ? 'warning' : 'error');
      return null;
    } finally {
      setBusy(null);
    }
  };

  const doClone = () => run('clone', async () => {
    const r = await apiPost('cloneTeams', {
      fromTournamentId: source, toTournamentId: target, force: true,
    });
    notify('คัดลอกทีมสำเร็จ',
      `สร้าง ${r.created} ทีม${r.withoutRoster ? ` · ${r.withoutRoster} ทีมไม่มีรายชื่อผู้เล่นติดมา` : ''}`,
      'success');
    return r;
  });

  const doIssueCodes = () => run('codes', async () => {
    const r = await apiPost('issueAccessCodes', { tournamentId: target });
    rememberIssued(r.issued ?? []);
    notify('ออกรหัสแล้ว',
      `${r.issued?.length ?? 0} โรงเรียน${r.skippedExisting?.length ? ` · ข้าม ${r.skippedExisting.length} ที่มีรหัสอยู่แล้ว` : ''}`,
      'success');
    return r;
  }, false);

  const doReview = (teamId: string, decision: 'approve' | 'reject') => run(`rev_${teamId}`, async () => {
    let reason = '';
    if (decision === 'reject') {
      reason = await promptAction('โรงเรียนจะเห็นข้อความนี้เพื่อกลับไปแก้ไขข้อมูล', {
        title: 'เหตุผลที่ปฏิเสธ', placeholder: 'ระบุสิ่งที่ต้องแก้ไข', required: true,
        confirmText: 'ส่งให้โรงเรียน',
      }) ?? '';
      if (!reason.trim()) {
        notify('ยกเลิก', 'ต้องระบุเหตุผล ไม่งั้นโรงเรียนจะไม่รู้ว่าต้องแก้อะไร', 'info');
        throw new ApiError('ยกเลิกโดยผู้ใช้', 0);
      }
    }
    const r = await apiPost('reviewTeam', { teamId, decision, reason });
    notify(decision === 'approve' ? 'อนุมัติแล้ว' : 'ปฏิเสธแล้ว', '', 'success');
    return r;
  });

  const doAssignManager = () => run('mgr', async () => {
    const r = await apiPost('assignTournamentManager', {
      tournamentId: target, userId: managerUserId.trim(), schoolId: hostSchoolId.trim() || undefined,
    });
    notify('มอบสิทธิ์แล้ว', `${r.displayName} ดูแลรายการนี้ได้แล้ว`, 'success');
    setManagerUserId('');
    await reloadAssignments();
    return r;
  }, false);

  const doSetHost = () => run('host', async () => {
    const r = await apiPost('setTournamentHost', {
      tournamentId: target, hostSchoolId: hostSchoolId.trim(),
    });
    notify('บันทึกเจ้าภาพแล้ว', '', 'success');
    await reloadAssignments();
    return r;
  }, false);

  const doRemoveManager = async (manager: TournamentManagerInfo) => {
    const ok = await confirmAction(
      `ถอนสิทธิ์ดูแลรายการของ “${manager.displayName}” หรือไม่?`,
      { title: 'ถอนสิทธิ์ผู้ดูแล', dangerous: true, confirmText: 'ถอนสิทธิ์' },
    );
    if (!ok) return;
    await run(`remove_mgr_${manager.userId}`, async () => {
      const r = await apiPost('assignTournamentManager', {
        tournamentId: target,
        userId: manager.userId,
        remove: true,
      });
      notify('ถอนสิทธิ์แล้ว', `${manager.displayName} ไม่สามารถจัดการรายการนี้แล้ว`, 'success');
      await reloadAssignments();
      return r;
    }, false);
  };

  const doReviewPayment = async (
    team: Team,
    decision: 'verify' | 'reject' | 'reset',
  ) => {
    let note = '';
    if (decision === 'reject') {
      note = await promptAction('ระบุเหตุผล เช่น ยอดเงินไม่ตรง สลิปไม่ชัด หรือไม่พบรายการโอน', {
        title: `สลิปของ ${team.name} ไม่ผ่าน`,
        placeholder: 'เหตุผลที่ต้องส่งสลิปใหม่',
        required: true,
        confirmText: 'ยืนยันว่าไม่ผ่าน',
      }) ?? '';
      if (!note.trim()) return;
    }

    await run(`pay_${team.id}`, async () => {
      const r = await apiPost('reviewRegistrationPayment', {
        teamId: team.id,
        decision,
        note,
      });
      setPaymentOverrides(prev => ({
        ...prev,
        [team.id]: { status: r.paymentStatus, note: r.paymentNote || '' },
      }));
      notify(
        decision === 'verify' ? 'ยืนยันการชำระเงินแล้ว'
          : decision === 'reject' ? 'บันทึกว่าสลิปไม่ผ่านแล้ว'
            : 'คืนสถานะเป็นรอตรวจแล้ว',
        team.name,
        decision === 'reject' ? 'warning' : 'success',
      );
      return r;
    });
  };

  const loadSchoolList = () => run('list', async () => {
    const r = await apiGet('listSchools', { tournamentId: target, onlyWithTeams: '1' });
    setSchoolList(r.schools ?? []);
  }, false);

  /** เปิดดูรหัสเดิม — ไม่ทำให้รหัสที่แจกไปแล้วตาย ต่างจากการออกใหม่ */
  const doReveal = (schoolId: string) => run(`rev_${schoolId}`, async () => {
    const r = await apiPost('revealAccessCode', { schoolId });
    setRevealed(prev => ({ ...prev, [schoolId]: r.accessCode }));
  }, false);

  const doRegenOne = async (school: any) => {
    const warn = [
      `ออกรหัสใหม่ให้ "${school.schoolName}" ?`,
      '',
      '⚠️ รหัสเดิมของโรงเรียนนี้จะใช้ไม่ได้ทันที',
      'และผู้ที่กำลังใช้งานอยู่จะถูกออกจากระบบ',
      '',
      'ถ้าแค่ลืมรหัส ให้กด "ดูรหัส" แทน — ไม่ต้องออกใหม่',
    ].join('\n');
    if (!await confirmAction(warn, { title: `ออกรหัสใหม่ให้ ${school.schoolName}?`, dangerous: true, confirmText: 'ออกรหัสใหม่' })) return;
    return run('regen_' + school.schoolId, async () => {
      const r = await apiPost('regenerateAccessCode', { schoolId: school.schoolId });
      setRevealed(prev => ({ ...prev, [school.schoolId]: r.accessCode }));
      notify('ออกรหัสใหม่แล้ว', r.schoolName + ' → ' + r.accessCode, 'success');
    }, false);
  };

  const doRegenAll = async () => {
    const n = schoolList?.length ?? 0;
    const warn = [
      `ออกรหัสใหม่ให้ทุกโรงเรียนในรายการนี้ (${n} โรงเรียน) ?`,
      '',
      '⚠️ รหัสเดิมทั้งหมดที่แจกไปแล้วจะใช้ไม่ได้ทันที',
      'ครูที่ถือใบรหัสเดิมอยู่จะเข้าระบบไม่ได้ ต้องแจกใบใหม่ทุกโรงเรียน',
      '',
      'ใช้เมื่อสงสัยว่ารหัสรั่วเท่านั้น',
      'ถ้าแค่บางโรงเรียนลืมรหัส ให้ออกทีละโรงเรียนแทน',
    ].join('\n');
    if (!await confirmAction(warn, { title: 'ออกรหัสใหม่ทุกโรงเรียน?', dangerous: true, confirmText: 'ออกรหัสทั้งหมด' })) return;
    return run('regenall', async () => {
      const r = await apiPost('issueAccessCodes', {
        tournamentId: target, regenerateExisting: true,
      });
      rememberIssued(r.issued ?? []);
      notify('ออกรหัสใหม่ทั้งหมดแล้ว',
        (r.issued?.length ?? 0) + ' โรงเรียน — พิมพ์เก็บก่อนปิดหน้านี้', 'success');
      setSchoolList(null);
    }, false);
  };

  const doFlush = () => run('flush', async () => {
    const r = await apiPost('flushCache');
    // แคชฝั่งเบราว์เซอร์ต้องล้างด้วย ไม่งั้นยังเห็นของเก่าอีก 1 นาที
    localStorage.removeItem('penalty_pro_db_cache');
    localStorage.removeItem('penalty_pro_db_timestamp');
    notify('ล้างแคชแล้ว', 'ข้อมูลล่าสุดจะแสดงทันที', 'success');
    return r;
  });

  const printCodes = () => {
    if (!issued?.length) return;
    const w = window.open('', '_blank');
    if (!w) { notify('เปิดหน้าพิมพ์ไม่ได้', 'เบราว์เซอร์บล็อกป๊อปอัป', 'warning'); return; }
    w.document.write(`
      <html><head><title>รหัสเข้าใช้งาน — ${targetTournament?.name ?? ''}</title>
      <style>
        body{font-family:'Sarabun',sans-serif;padding:24px}
        h1{font-size:18px} table{width:100%;border-collapse:collapse;margin-top:12px}
        td,th{border:1px solid #cbd5e1;padding:8px;font-size:14px;text-align:left}
        code{font-family:monospace;font-size:18px;letter-spacing:2px;font-weight:bold}
        @media print{.no-print{display:none}}
      </style></head><body>
      <h1>รหัสเข้าใช้งานสำหรับโรงเรียน — ${targetTournament?.name ?? ''}</h1>
      <p style="font-size:13px;color:#475569">
        โรงเรียนใช้รหัสนี้เข้าไปยืนยันการเข้าร่วมและกรอกรายชื่อนักกีฬา ·
        รหัสนี้แสดงเพียงครั้งเดียว หากทำหาย ให้ผู้ดูแลออกรหัสใหม่</p>
      <table><tr><th style="width:60%">โรงเรียน</th><th>รหัส</th></tr>
      ${issued.map(i => `<tr><td>${i.schoolName}</td><td><code>${i.accessCode}</code></td></tr>`).join('')}
      </table>
      <button class="no-print" onclick="window.print()" style="margin-top:16px;padding:8px 16px">พิมพ์</button>
      </body></html>`);
    w.document.close();
  };

  const btn = 'px-4 py-2 rounded-lg text-sm font-bold transition disabled:opacity-50 disabled:cursor-not-allowed';
  const sel = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white';
  const inp = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm';

  return (
    <div className="space-y-4">
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
        <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">
          รายการแข่งขันที่จะจัดการ
        </label>
        <select className={`${sel} mt-1`} value={target} onChange={e => setTarget(e.target.value)}>
          {tournaments.map(t => (
            <option key={t.id} value={t.id}>{t.name} ({t.status})</option>
          ))}
        </select>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* ── คัดลอกทีม ─────────────────────────────────────────── */}
        <Card
          icon={<Copy className="w-5 h-5" />}
          title="คัดลอกทีมจากรายการก่อนหน้า"
          desc="ดึงทีมเดิมมาเป็นสถานะ “รอยืนยัน” โรงเรียนต้องเข้ามายืนยันเองก่อนถึงจะนับเป็นผู้เข้าแข่งขัน"
        >
          <select className={sel} value={source} onChange={e => setSource(e.target.value)}>
            <option value="">— เลือกรายการต้นทาง —</option>
            {tournaments.filter(t => t.id !== target).map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <button
            onClick={doClone}
            disabled={!source || !target || busy === 'clone'}
            className={`${btn} bg-indigo-600 text-white hover:bg-indigo-700 mt-3 w-full flex items-center justify-center gap-2`}
          >
            {busy === 'clone' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Copy className="w-4 h-4" />}
            คัดลอกทีม
          </button>
        </Card>

        {/* ── ออกรหัสโรงเรียน ───────────────────────────────────── */}
        <Card
          icon={<KeyRound className="w-5 h-5" />}
          title="ออกรหัสให้โรงเรียน"
          desc="รหัส 8 ตัวสำหรับให้โรงเรียนเข้ามาแก้ข้อมูลทีมตัวเอง — แสดงครั้งเดียว ต้องพิมพ์เก็บทันที"
        >
          <button
            onClick={doIssueCodes}
            disabled={!target || busy === 'codes'}
            className={`${btn} bg-amber-500 text-white hover:bg-amber-600 w-full flex items-center justify-center gap-2`}
          >
            {busy === 'codes' ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
            ออกรหัส
          </button>

          <div className="grid grid-cols-2 gap-2 mt-2">
            <button onClick={loadSchoolList} disabled={busy === 'list' || !target}
              className={`${btn} border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs`}>
              {busy === 'list' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
              ดู/จัดการรหัสรายโรงเรียน
            </button>
            <button onClick={doRegenAll} disabled={busy === 'regenall' || !schoolList?.length}
              className={`${btn} border border-rose-300 text-rose-700 hover:bg-rose-50 text-xs`}>
              <KeyRound className="w-3.5 h-3.5" /> ออกรหัสใหม่ทั้งหมด
            </button>
          </div>

          {schoolList && (
            <div className="mt-3 border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
                <Search className="w-3.5 h-3.5 text-slate-400" />
                <input value={schoolFilter} onChange={e => setSchoolFilter(e.target.value)}
                  placeholder={`ค้นหาใน ${schoolList.length} โรงเรียน`}
                  className="flex-1 bg-transparent text-xs outline-none" />
              </div>
              <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
                {schoolList
                  .filter(s => !schoolFilter || s.schoolName.includes(schoolFilter))
                  .map(s => (
                  <div key={s.schoolId} className="px-3 py-2 flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-slate-800 truncate">{s.schoolName}</p>
                      <p className="text-[10px] text-slate-400">
                        {s.hasAccessCode
                          ? `ออกรหัสแล้ว${s.codeUsedAt ? ' · เคยเข้าใช้งาน' : ' · ยังไม่เคยเข้า'}`
                          : 'ยังไม่มีรหัส'}
                      </p>
                    </div>
                    {revealed[s.schoolId] ? (
                      <code className="font-mono font-bold text-sm tracking-widest text-indigo-700 shrink-0">
                        {revealed[s.schoolId]}
                      </code>
                    ) : (
                      <button onClick={() => doReveal(s.schoolId)}
                        disabled={!s.hasAccessCode || busy === `rev_${s.schoolId}`}
                        className="px-2 py-1 rounded-lg bg-slate-100 text-slate-700 text-[11px] font-bold hover:bg-slate-200 disabled:opacity-40 shrink-0">
                        ดูรหัส
                      </button>
                    )}
                    <button onClick={() => doRegenOne(s)} disabled={busy === `regen_${s.schoolId}`}
                      title="ออกรหัสใหม่ (รหัสเดิมจะใช้ไม่ได้)"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 shrink-0">
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
              <p className="px-3 py-2 text-[10px] text-slate-500 bg-slate-50 border-t border-slate-200">
                “ดูรหัส” ไม่ทำให้รหัสเดิมตาย — ใช้ตอนครูโทรมาบอกว่าทำใบหาย ·
                ทุกครั้งที่เปิดดูจะถูกบันทึกไว้ว่าใครดูเมื่อไหร่
              </p>
            </div>
          )}

          {issued && (
            <div className="mt-3 border border-amber-200 bg-amber-50 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-amber-800 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" /> แสดงครั้งเดียว — พิมพ์เก็บก่อนปิดหน้านี้
                </span>
                <div className="flex items-center gap-3">
                  <button onClick={printCodes}
                    className="text-xs font-bold text-amber-800 flex items-center gap-1 hover:underline">
                    <Printer className="w-3.5 h-3.5" /> พิมพ์
                  </button>
                  <button onClick={() => { setIssued(null); sessionStorage.removeItem('kickoff_issued_codes'); }}
                    className="text-xs text-amber-700 hover:underline">ปิด</button>
                </div>
              </div>
              <div className="max-h-48 overflow-y-auto text-xs divide-y divide-amber-200">
                {issued.length === 0 && <p className="text-slate-500 py-2">ทุกโรงเรียนมีรหัสอยู่แล้ว</p>}
                {issued.map(i => (
                  <div key={i.schoolId} className="flex justify-between py-1.5 gap-2">
                    <span className="truncate">{i.schoolName}</span>
                    <code className="font-mono font-bold tracking-widest">{i.accessCode}</code>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>

        {/* ── มอบสิทธิ์เจ้าภาพ ──────────────────────────────────── */}
        <Card
          icon={<UserCog className="w-5 h-5" />}
          title="ผู้ดูแลประจำรายการ (โรงเรียนเจ้าภาพ)"
          desc="ให้ครูของโรงเรียนเจ้าภาพตั้งค่าเฉพาะรายการนี้ได้ แต่แตะรายการอื่นไม่ได้ · ต้องเป็นบัญชีที่มีรหัสผ่าน"
        >
          <label className="text-xs text-slate-500">โรงเรียนเจ้าภาพ</label>
          <SearchPicker
            value={hostSchoolId}
            onChange={id => setHostSchoolId(id)}
            placeholder="ค้นหาโรงเรียน (ชื่อ/อำเภอ)"
            emptyText="ไม่พบโรงเรียนในระบบ"
            load={async () => {
              const r = await apiGet('listSchools');
              return (r.schools ?? []).map((s: any): PickerItem => ({
                id: s.schoolId,
                label: s.schoolName,
                sub: [s.district, s.province].filter(Boolean).join(' · '),
                badge: s.teamCount ? `${s.teamCount} ทีม` : undefined,
              }));
            }}
          />
          <button onClick={doSetHost} disabled={busy === 'host' || !target || !hostSchoolId}
            className={`${btn} bg-slate-700 text-white hover:bg-slate-800 mt-2 w-full`}>
            บันทึกโรงเรียนเจ้าภาพ
          </button>

          <label className="text-xs text-slate-500 block mt-4">ครูผู้ดูแลรายการนี้</label>
          <SearchPicker
            value={managerUserId}
            onChange={id => setManagerUserId(id)}
            serverSearch
            placeholder="ค้นหาชื่อ / ชื่อผู้ใช้ / เบอร์โทร"
            emptyText="ไม่พบผู้ใช้ — ต้องมีบัญชีในระบบก่อน"
            load={async (q) => {
              const r = await apiGet('searchUsers', { q });
              return (r.users ?? []).map((u: any): PickerItem => ({
                id: u.userId,
                label: u.displayName || u.username || u.userId,
                sub: [u.username, u.phoneHint].filter(Boolean).join(' · '),
                badge: u.role,
              }));
            }}
          />
          <button onClick={doAssignManager} disabled={!managerUserId.trim() || busy === 'mgr'}
            className={`${btn} bg-emerald-600 text-white hover:bg-emerald-700 mt-2 w-full flex items-center justify-center gap-2`}>
            {busy === 'mgr' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
            มอบสิทธิ์ดูแลรายการนี้
          </button>

          <div className="mt-4 rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-3 py-2.5 bg-slate-50 border-b border-slate-200">
              <p className="text-xs font-bold text-slate-700">ผู้ที่ได้รับมอบหมายแล้ว</p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                เจ้าภาพ: {assignment?.hostSchoolName || 'ยังไม่ได้กำหนด'}
              </p>
            </div>
            {assignmentLoading ? (
              <div className="py-5 flex items-center justify-center text-xs text-slate-400">
                <Loader2 className="w-4 h-4 animate-spin mr-2" /> กำลังโหลดรายชื่อ
              </div>
            ) : assignment?.managers.length ? (
              <div className="divide-y divide-slate-100">
                {assignment.managers.map(manager => (
                  <div key={manager.userId} className="px-3 py-2.5 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
                      <ShieldCheck className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-slate-800 truncate">{manager.displayName}</p>
                      <p className="text-[11px] text-slate-500 truncate">
                        {[manager.username, manager.schoolName].filter(Boolean).join(' · ') || 'ผู้ดูแลรายการ'}
                      </p>
                    </div>
                    <button type="button" onClick={() => doRemoveManager(manager)}
                      disabled={busy === `remove_mgr_${manager.userId}`}
                      className="p-2 rounded-lg text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                      title="ถอนสิทธิ์ผู้ดูแล">
                      {busy === `remove_mgr_${manager.userId}`
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : <UserMinus className="w-4 h-4" />}
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="px-3 py-4 text-xs text-slate-500 text-center">ยังไม่มีผู้ดูแลที่ได้รับมอบหมาย</p>
            )}
          </div>
        </Card>

        {/* ── ล้างแคช ───────────────────────────────────────────── */}
        <Card
          icon={<RefreshCw className="w-5 h-5" />}
          title="ล้างแคช"
          desc="ใช้เมื่อแก้ข้อมูลในฐานข้อมูลโดยตรง (phpMyAdmin) แล้วหน้าเว็บยังแสดงของเก่า — การแก้ผ่านระบบล้างให้เองอยู่แล้ว"
        >
          <button onClick={doFlush} disabled={busy === 'flush'}
            className={`${btn} bg-sky-600 text-white hover:bg-sky-700 w-full flex items-center justify-center gap-2`}>
            {busy === 'flush' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            ล้างแคชทั้งระบบ
          </button>
        </Card>
      </div>

      {/* ── ตรวจสลิปค่าสมัคร ──────────────────────────────────── */}
      <Card
        icon={<ReceiptText className="w-5 h-5" />}
        title="ตรวจสอบสลิปค่าสมัคร"
        desc={`ตรวจสถานะการชำระเงินแยกจากการอนุมัติใบสมัคร · ${targetTournament?.name || 'เลือกรายการแข่งขัน'}`}
      >
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-4">
          {([
            ['Verified', 'จ่ายแล้ว', paymentCounts.Verified, 'bg-emerald-50 text-emerald-700 border-emerald-200'],
            ['Pending', 'รอตรวจ', paymentCounts.Pending, 'bg-amber-50 text-amber-700 border-amber-200'],
            ['Unpaid', 'ยังไม่ส่งสลิป', paymentCounts.Unpaid, 'bg-slate-50 text-slate-700 border-slate-200'],
            ['Rejected', 'สลิปไม่ผ่าน', paymentCounts.Rejected, 'bg-rose-50 text-rose-700 border-rose-200'],
          ] as const).map(([status, label, count, color]) => (
            <button key={status} type="button"
              onClick={() => setPaymentFilter(paymentFilter === status ? 'All' : status)}
              className={`rounded-xl border p-3 text-left transition ${color} ${paymentFilter === status ? 'ring-2 ring-indigo-400 ring-offset-1' : ''}`}>
              <span className="text-2xl font-black block">{count}</span>
              <span className="text-xs font-bold">{label}</span>
            </button>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
          <div className="relative w-full sm:max-w-sm">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={paymentSearch} onChange={e => setPaymentSearch(e.target.value)}
              className={`${inp} pl-9`} placeholder="ค้นหาชื่อทีม โรงเรียน หรือสาย" />
          </div>
          {paymentFilter !== 'All' && (
            <button type="button" onClick={() => setPaymentFilter('All')}
              className="text-xs font-bold text-indigo-600 hover:underline self-start sm:self-auto">
              แสดงทุกสถานะ
            </button>
          )}
        </div>

        {targetTeams.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 py-10 text-center text-slate-500">
            <WalletCards className="w-8 h-8 mx-auto mb-2 text-slate-300" />
            <p className="text-sm font-semibold">ยังไม่มีทีมในรายการนี้</p>
          </div>
        ) : filteredPaymentTeams.length === 0 ? (
          <div className="rounded-xl bg-slate-50 py-8 text-center text-sm text-slate-500">ไม่มีทีมในสถานะนี้</div>
        ) : (
          <div className="space-y-2">
            {visiblePaymentTeams.map(team => {
              const payment = effectivePayment(team);
              const statusStyle: Record<PaymentStatus, string> = {
                Verified: 'bg-emerald-100 text-emerald-700',
                Pending: 'bg-amber-100 text-amber-700',
                Unpaid: 'bg-slate-100 text-slate-600',
                Rejected: 'bg-rose-100 text-rose-700',
              };
              const statusLabel: Record<PaymentStatus, string> = {
                Verified: 'จ่ายแล้ว', Pending: 'รอตรวจ',
                Unpaid: 'ยังไม่ส่งสลิป', Rejected: 'สลิปไม่ผ่าน',
              };
              return (
                <div key={team.id} className="rounded-xl border border-slate-200 p-3 sm:p-4">
                  <div className="flex flex-col lg:flex-row lg:items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-bold text-slate-800 truncate">{team.name}</p>
                        <span className={`px-2 py-1 rounded-full text-[11px] font-bold ${statusStyle[payment.status]}`}>
                          {statusLabel[payment.status]}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        {[team.schoolName, team.group ? `สาย ${team.group}` : ''].filter(Boolean).join(' · ') || 'ไม่ระบุโรงเรียน/สาย'}
                      </p>
                      {payment.note && <p className="text-xs text-rose-600 mt-1">หมายเหตุ: {payment.note}</p>}
                      {team.paymentReviewedAt && payment.status === 'Verified' && (
                        <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
                          <Clock3 className="w-3 h-3" /> ตรวจเมื่อ {new Date(team.paymentReviewedAt).toLocaleString('th-TH')}
                        </p>
                      )}
                    </div>

                    <div className="grid grid-cols-2 sm:flex gap-2 shrink-0">
                      {team.slipUrl ? (
                        <a href={team.slipUrl} target="_blank" rel="noreferrer"
                          className={`${btn} border border-indigo-200 text-indigo-700 hover:bg-indigo-50 flex items-center justify-center gap-1.5`}>
                          <Eye className="w-4 h-4" /> ดูสลิป
                        </a>
                      ) : (
                        <span className={`${btn} border border-slate-200 text-slate-400 flex items-center justify-center gap-1.5 cursor-default`}>ไม่มีสลิป</span>
                      )}
                      {team.slipUrl && payment.status !== 'Verified' && (
                        <button type="button" onClick={() => doReviewPayment(team, 'verify')}
                          disabled={busy === `pay_${team.id}`}
                          className={`${btn} bg-emerald-600 text-white hover:bg-emerald-700 flex items-center justify-center gap-1.5`}>
                          <CheckCircle2 className="w-4 h-4" /> ยืนยันจ่ายแล้ว
                        </button>
                      )}
                      {team.slipUrl && payment.status !== 'Rejected' && (
                        <button type="button" onClick={() => doReviewPayment(team, 'reject')}
                          disabled={busy === `pay_${team.id}`}
                          className={`${btn} border border-rose-200 text-rose-700 hover:bg-rose-50 flex items-center justify-center gap-1.5`}>
                          <XCircle className="w-4 h-4" /> สลิปไม่ผ่าน
                        </button>
                      )}
                      {(payment.status === 'Verified' || payment.status === 'Rejected') && (
                        <button type="button" onClick={() => doReviewPayment(team, 'reset')}
                          disabled={busy === `pay_${team.id}`}
                          className={`${btn} border border-slate-200 text-slate-600 hover:bg-slate-50 flex items-center justify-center gap-1.5`}>
                          <RefreshCw className="w-4 h-4" /> ตรวจใหม่
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {filteredPaymentTeams.length > 0 && (
          <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-100 pt-4">
            <p className="text-xs text-slate-500">
              แสดง {(paymentPage - 1) * paymentPageSize + 1}–{Math.min(paymentPage * paymentPageSize, filteredPaymentTeams.length)} จาก {filteredPaymentTeams.length} ทีม
            </p>
            {paymentPageCount > 1 && (
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setPaymentPage(page => Math.max(1, page - 1))}
                  disabled={paymentPage === 1}
                  className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                  aria-label="หน้าก่อนหน้า"><ChevronLeft className="w-4 h-4" /></button>
                <span className="text-xs font-bold text-slate-600 min-w-20 text-center">หน้า {paymentPage} / {paymentPageCount}</span>
                <button type="button" onClick={() => setPaymentPage(page => Math.min(paymentPageCount, page + 1))}
                  disabled={paymentPage === paymentPageCount}
                  className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                  aria-label="หน้าถัดไป"><ChevronRight className="w-4 h-4" /></button>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* ── อนุมัติทีม ─────────────────────────────────────────── */}
      <Card
        icon={<CheckCircle2 className="w-5 h-5" />}
        title={`ทีมที่รอตรวจ (${pendingTeams.length})`}
        desc="ทีมที่โรงเรียนส่งเข้ามาแล้วรอการอนุมัติ · การปฏิเสธต้องระบุเหตุผลเสมอเพื่อให้โรงเรียนแก้ได้ถูกจุด"
      >
        {pendingTeams.length > 3 && (
          <div className="relative mb-3">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className={`${inp} pl-9`} placeholder="ค้นหาชื่อทีม"
              value={teamFilter} onChange={e => setTeamFilter(e.target.value)} />
          </div>
        )}
        {pendingTeams.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-4">ไม่มีทีมรอตรวจ</p>
        ) : (
          <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
            {pendingTeams
              .filter(t => !teamFilter || t.name.includes(teamFilter))
              .map(t => (
                <div key={t.id} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm text-slate-800 truncate">{t.name}</p>
                    <p className="text-[11px] text-slate-500">
                      {t.status === 'Draft' ? 'โรงเรียนกำลังกรอก (ยังไม่ส่ง)' : 'รออนุมัติ'}
                    </p>
                  </div>
                  <button onClick={() => doReview(t.id, 'approve')} disabled={busy === `rev_${t.id}`}
                    title="อนุมัติ"
                    className="p-2 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 disabled:opacity-40">
                    <CheckCircle2 className="w-4 h-4" />
                  </button>
                  <button onClick={() => doReview(t.id, 'reject')} disabled={busy === `rev_${t.id}`}
                    title="ปฏิเสธ"
                    className="p-2 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 disabled:opacity-40">
                    <XCircle className="w-4 h-4" />
                  </button>
                </div>
              ))}
          </div>
        )}
      </Card>

      {/* การสร้าง/แก้ไข/ลบรายการแข่งขันย้ายไปแท็บ "รายการแข่งขัน" แล้ว
          เพื่อไม่ให้มีสองที่ทำเรื่องเดียวกัน */}
    </div>
  );
};

export default AdminTools;
