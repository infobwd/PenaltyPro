import React, { useMemo, useState } from 'react';
import {
  Wand2, Shuffle, Plus, Trash2, Loader2, Calendar, MapPin, Save,
  AlertTriangle, X, Clock, Swords, CheckSquare, Square, Trophy, ExternalLink,
} from 'lucide-react';
import { Team, Tournament, Match } from '../types';
import { apiPost, ApiError } from '../services/apiConfig';

/**
 * จัดตารางแข่ง — ประกบคู่อัตโนมัติ + แก้ด้วยมือ
 *
 * ของเดิมแอดมินต้องพิมพ์คู่แข่งทีละนัด (ครั้งที่ 3 มี 57 นัด) ซึ่งกินเวลาและ
 * พลาดง่าย ที่นี่กดปุ่มเดียวได้คู่ครบทั้งสายแบบพบกันหมด แล้วค่อยไล่ใส่
 * วัน-เวลา-สนาม ทีหลัง หรือแก้/ลบรายนัดได้ตามปกติ
 */

interface Props {
  tournaments: Tournament[];
  teams: Team[];
  matches: Match[];
  currentTournamentId: string;
  onRefresh: () => void;
  notify: (title: string, msg?: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
}

/**
 * ชื่อรอบที่หน้า "ผังการแข่งขัน" รู้จัก
 *
 * TournamentView หานัดด้วย `m.roundLabel === label` ตรง ๆ จากรายการนี้
 * ถ้าพิมพ์ชื่อรอบเป็นอย่างอื่น นัดนั้นจะไม่ขึ้นบนผังเลย (ตกไปอยู่กลุ่ม "อื่น ๆ")
 * จึงให้เลือกจากรายการแทนการพิมพ์เอง เพื่อให้ตารางนัดกับผังแข่งเป็นเรื่องเดียวกัน
 */
const BRACKET_SLOTS: { group: string; labels: string[] }[] = [
  { group: 'รอบชิงชนะเลิศ', labels: ['FINAL'] },
  { group: 'รองชนะเลิศ', labels: ['SF1', 'SF2'] },
  { group: 'ก่อนรองชนะเลิศ', labels: ['QF1', 'QF2', 'QF3', 'QF4'] },
  { group: 'รอบ 16 ทีม', labels: Array.from({ length: 8 }, (_, i) => `R16-${i + 1}`) },
  { group: 'รอบ 32 ทีม', labels: Array.from({ length: 16 }, (_, i) => `R32-${i + 1}`) },
];
const ALL_SLOTS = BRACKET_SLOTS.flatMap(g => g.labels);

interface MatchEdit {
  matchId: string;
  teamAId: string;
  teamBId: string;
  roundLabel: string;
  venue: string;
  scheduledTime: string;
}

const AdminSchedule: React.FC<Props> = ({
  tournaments, teams, matches, currentTournamentId, onRefresh, notify,
}) => {
  const [target, setTarget] = useState(currentTournamentId || tournaments[0]?.id || '');
  const [busy, setBusy] = useState<string | null>(null);
  const [groupCount, setGroupCount] = useState(8);
  const [editing, setEditing] = useState<MatchEdit | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [customRound, setCustomRound] = useState(false);

  const myTeams = useMemo(
    () => teams.filter(t => t.tournamentId === target && t.status === 'Approved'),
    [teams, target]);

  const myMatches = useMemo(
    () => matches.filter(m => m.tournamentId === target)
      .sort((a, b) => (a.roundLabel ?? '').localeCompare(b.roundLabel ?? '')),
    [matches, target]);

  const grouped = useMemo(() => {
    const g: Record<string, Team[]> = {};
    myTeams.forEach(t => { (g[t.group || '— ยังไม่จัดสาย'] ??= []).push(t); });
    return g;
  }, [myTeams]);

  const ungrouped = myTeams.filter(t => !t.group).length;

  /** นัดที่ถูกวางไว้บนผังแข่งแล้ว — ใช้บอกว่าผังยังขาดรอบไหน */
  const onBracket = useMemo(
    () => new Set(myMatches.filter(m => ALL_SLOTS.includes(m.roundLabel ?? ''))
      .map(m => m.roundLabel as string)),
    [myMatches]);

  /** เลือกได้เฉพาะนัดที่ยังอยู่ในรายการปัจจุบัน กันลบนัดที่มองไม่เห็น */
  const pickedHere = useMemo(
    () => myMatches.filter(m => picked.has(m.id)), [myMatches, picked]);

  const togglePick = (id: string) => setPicked(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const toggleAll = () => setPicked(prev =>
    pickedHere.length === myMatches.length ? new Set() : new Set(myMatches.map(m => m.id)));

  const run = async <T,>(key: string, fn: () => Promise<T>): Promise<T | null> => {
    setBusy(key);
    try { const r = await fn(); onRefresh(); return r; }
    catch (e) {
      const err = e as ApiError;
      notify(err.status === 409 ? 'ต้องยืนยันก่อน' : 'ทำรายการไม่สำเร็จ',
        err.message, err.status === 409 ? 'warning' : 'error');
      return null;
    } finally { setBusy(null); }
  };

  const doAutoGroups = () => {
    if (!window.confirm(`สุ่มแบ่ง ${myTeams.length} ทีมออกเป็น ${groupCount} สาย?\nสายเดิมจะถูกเขียนทับ`)) return;
    return run('groups', async () => {
      const r = await apiPost('autoAssignGroups', { tournamentId: target, groupCount });
      notify('แบ่งสายแล้ว', r.notice, 'success');
    });
  };

  const doGenerate = (replace: boolean) => run('gen', async () => {
    const r = await apiPost('generateFixtures', { tournamentId: target, replace });
    notify('สร้างตารางแข่งแล้ว',
      `${r.created} นัด${r.skipped?.length ? ` · ข้าม ${r.skipped.length} รายการ` : ''}`,
      'success');
  });

  const doDeleteMatch = (m: Match) => {
    if (!window.confirm(`ลบนัด ${m.teamA} พบ ${m.teamB} ?`)) return;
    return run(`del_${m.id}`, async () => {
      await apiPost('deleteMatch', { matchId: m.id, force: true });
      notify('ลบนัดแล้ว', '', 'success');
    });
  };

  /**
   * ลบหลายนัดพร้อมกัน
   *
   * ยิงทีละนัดแบบเรียงลำดับ ไม่ใช่ Promise.all เพราะแต่ละนัดคำนวณตารางคะแนน
   * ใหม่ฝั่ง server การยิงพร้อมกัน 20 นัดบน shared hosting ทำให้ล้มกลางคัน
   * แล้วเหลือลบไปครึ่ง ๆ กลาง ๆ โดยไม่รู้ว่าค้างที่ไหน
   */
  const doDeletePicked = () => {
    const list = pickedHere;
    if (list.length === 0) return;
    const played = list.filter(m => m.status !== 'Scheduled').length;
    const msg = `ลบ ${list.length} นัดที่เลือก?`
      + (played > 0 ? `

⚠️ มีนัดที่แข่งไปแล้ว ${played} นัด — ผลการแข่งและตารางคะแนนจะเปลี่ยน` : '');
    if (!window.confirm(msg)) return;

    return run('delpicked', async () => {
      let ok = 0;
      const failed: string[] = [];
      for (const m of list) {
        try {
          await apiPost('deleteMatch', { matchId: m.id, force: true });
          ok++;
        } catch {
          failed.push(`${m.teamA} พบ ${m.teamB}`);
        }
      }
      setPicked(new Set());
      notify(failed.length === 0 ? 'ลบแล้ว' : 'ลบได้บางส่วน',
        `สำเร็จ ${ok} นัด` + (failed.length ? ` · ล้มเหลว ${failed.length} นัด: ${failed[0]}${failed.length > 1 ? ' ฯลฯ' : ''}` : ''),
        failed.length === 0 ? 'success' : 'warning');
    });
  };

  const doDeleteAll = (keepPlayed: boolean) => {
    const played = myMatches.filter(m => m.status !== 'Scheduled').length;
    const msg = keepPlayed
      ? `ลบเฉพาะนัดที่ยังไม่แข่ง (${myMatches.length - played} นัด)?`
      : `ลบตารางแข่งทั้งหมด ${myMatches.length} นัด?` +
        (played > 0 ? `

⚠️ มีนัดที่แข่งไปแล้ว ${played} นัด — ผลการแข่งและตารางคะแนนจะหายไปด้วย` : '');
    if (!window.confirm(msg)) return;
    return run('delall', async () => {
      const r = await apiPost('deleteAllMatches', {
        tournamentId: target, keepPlayed, force: !keepPlayed,
      });
      setPicked(new Set());
      notify('ลบแล้ว', r.message, 'success');
    });
  };

  const doSaveMatch = () => editing && run('save', async () => {
    await apiPost('saveMatch', { tournamentId: target, ...editing });
    notify('บันทึกนัดแล้ว', '', 'success');
    setEditing(null);
  });

  const openNew = () => {
    setCustomRound(true);
    setEditing({
      matchId: '', teamAId: '', teamBId: '', roundLabel: '', venue: '', scheduledTime: '',
    });
  };

  const openEdit = (m: Match) => {
    setCustomRound(!ALL_SLOTS.includes(m.roundLabel ?? ''));
    setEditing({
      matchId: m.id,
      teamAId: (m as any).teamAId ?? '',
      teamBId: (m as any).teamBId ?? '',
      roundLabel: m.roundLabel ?? '',
      venue: m.venue ?? '',
      scheduledTime: m.scheduledTime ? m.scheduledTime.slice(0, 16) : '',
    });
  };

  const inp = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none';
  const lbl = 'text-xs text-slate-500';
  const btn = 'px-4 py-2 rounded-lg text-sm font-bold transition disabled:opacity-50 flex items-center justify-center gap-2';

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-slate-200 p-4">
        <label className={lbl}>รายการแข่งขัน</label>
        <select className={inp} value={target} onChange={e => setTarget(e.target.value)}>
          {tournaments.map(t => <option key={t.id} value={t.id}>{t.name} ({t.status})</option>)}
        </select>
        <div className="flex flex-wrap gap-4 mt-3 text-xs text-slate-600">
          <span>ทีมอนุมัติแล้ว <b>{myTeams.length}</b></span>
          <span>สาย <b>{Object.keys(grouped).filter(g => !g.startsWith('—')).length}</b></span>
          <span>นัดในตาราง <b>{myMatches.length}</b></span>
          {ungrouped > 0 && (
            <span className="text-amber-700 font-bold">ยังไม่จัดสาย {ungrouped} ทีม</span>
          )}
        </div>
      </div>

      {/* ── ขั้นที่ 1: แบ่งสาย ─────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <div className="flex items-start gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <Shuffle className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-slate-800">ขั้นที่ 1 — แบ่งสาย</h3>
            <p className="text-xs text-slate-500 leading-relaxed mt-0.5">
              สุ่มแบ่งทีมที่อนุมัติแล้วลงสาย พยายามไม่ให้โรงเรียนเดียวกันอยู่สายเดียวกัน ·
              ย้ายทีมด้วยมือทีหลังได้ที่หน้าจัดการทีม
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <div className="w-28">
            <label className={lbl}>จำนวนสาย</label>
            <input type="number" min={2} max={16} className={inp} value={groupCount}
              onChange={e => setGroupCount(Number(e.target.value))} />
          </div>
          <button onClick={doAutoGroups} disabled={busy === 'groups' || myTeams.length === 0}
            className={`${btn} bg-amber-500 text-white hover:bg-amber-600 flex-1 self-end`}>
            {busy === 'groups' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shuffle className="w-4 h-4" />}
            สุ่มแบ่งสาย
          </button>
        </div>

        {Object.keys(grouped).length > 0 && (
          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-2">
            {(Object.entries(grouped) as [string, Team[]][]).sort().map(([g, list]) => (
              <div key={g} className="border border-slate-200 rounded-xl p-2.5">
                <p className="text-xs font-bold text-slate-700 mb-1">
                  {g.startsWith('—') ? g : `สาย ${g}`}
                  <span className="text-slate-400 font-normal"> ({list.length})</span>
                </p>
                <ul className="text-[11px] text-slate-500 space-y-0.5">
                  {list.map(t => <li key={t.id} className="truncate">{t.name}</li>)}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── ขั้นที่ 2: ประกบคู่ ─────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <div className="flex items-start gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
            <Wand2 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-slate-800">ขั้นที่ 2 — ประกบคู่อัตโนมัติ</h3>
            <p className="text-xs text-slate-500 leading-relaxed mt-0.5">
              สร้างคู่แข่งแบบพบกันหมดในแต่ละสาย ทุกทีมได้ลงเล่นเท่ากัน ·
              <b className="text-slate-700"> นัดที่แข่งไปแล้วจะไม่ถูกลบ</b>
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => doGenerate(false)} disabled={busy === 'gen' || ungrouped === myTeams.length}
            className={`${btn} bg-indigo-600 text-white hover:bg-indigo-700 flex-1`}>
            {busy === 'gen' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
            สร้างตารางแข่ง
          </button>
          {myMatches.length > 0 && (
            <button onClick={() => {
              if (window.confirm('สร้างใหม่ทั้งหมด?\nนัดที่ยังไม่แข่งจะถูกลบและสร้างใหม่ (นัดที่แข่งแล้วยังอยู่)')) doGenerate(true);
            }} disabled={busy === 'gen'}
              className={`${btn} border-2 border-indigo-300 text-indigo-700 hover:bg-indigo-50`}>
              สร้างใหม่
            </button>
          )}
        </div>
      </div>

      {/* ── ขั้นที่ 3: ตารางนัด ─────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-2 flex-wrap">
          <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
            <Calendar className="w-4 h-4" /> ตารางนัด ({myMatches.length})
          </h3>
          <div className="flex items-center gap-2">
            {myMatches.length > 0 && (
              <>
                <button onClick={toggleAll}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs font-bold text-slate-600 hover:bg-slate-100 flex items-center gap-1">
                  {pickedHere.length === myMatches.length
                    ? <><CheckSquare className="w-3.5 h-3.5" /> ไม่เลือกเลย</>
                    : <><Square className="w-3.5 h-3.5" /> เลือกทั้งหมด</>}
                </button>
                <button onClick={() => doDeleteAll(true)} disabled={busy === 'delall'}
                  title="ลบเฉพาะนัดที่ยังไม่ได้แข่ง ผลที่บันทึกไว้แล้วยังอยู่"
                  className="px-2.5 py-1.5 rounded-lg border border-amber-300 text-xs font-bold text-amber-700 hover:bg-amber-50">
                  ลบนัดที่ยังไม่แข่ง
                </button>
                <button onClick={() => doDeleteAll(false)} disabled={busy === 'delall'}
                  className="px-2.5 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-bold hover:bg-rose-700 flex items-center gap-1">
                  {busy === 'delall' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  ลบทั้งหมด
                </button>
              </>
            )}
            <button onClick={openNew}
              className="px-3 py-1.5 rounded-lg bg-slate-800 text-white text-xs font-bold flex items-center gap-1">
              <Plus className="w-3.5 h-3.5" /> เพิ่มนัด
            </button>
          </div>
        </div>

        {/* แถบทำงานกับนัดที่เลือก — โผล่เมื่อเลือกอย่างน้อย 1 นัด */}
        {pickedHere.length > 0 && (
          <div className="px-4 py-2.5 bg-indigo-50 border-b border-indigo-100 flex items-center justify-between gap-2 flex-wrap">
            <span className="text-sm font-bold text-indigo-900">
              เลือกไว้ {pickedHere.length} นัด
              {pickedHere.filter(m => m.status !== 'Scheduled').length > 0 && (
                <span className="font-normal text-indigo-700">
                  {' '}(แข่งแล้ว {pickedHere.filter(m => m.status !== 'Scheduled').length} นัด)
                </span>
              )}
            </span>
            <div className="flex gap-2">
              <button onClick={() => setPicked(new Set())}
                className="px-3 py-1.5 rounded-lg border border-indigo-300 text-xs font-bold text-indigo-700">
                ยกเลิกการเลือก
              </button>
              <button onClick={doDeletePicked} disabled={busy === 'delpicked'}
                className="px-3 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-bold hover:bg-rose-700 flex items-center gap-1">
                {busy === 'delpicked' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                ลบที่เลือก
              </button>
            </div>
          </div>
        )}

        {myMatches.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-10">
            ยังไม่มีนัด — แบ่งสายแล้วกด “สร้างตารางแข่ง”
          </p>
        ) : (
          <div className="divide-y divide-slate-100 max-h-[28rem] overflow-y-auto">
            {myMatches.map(m => (
              <div key={m.id}
                className={`px-4 py-2.5 flex items-center gap-3 ${picked.has(m.id) ? 'bg-indigo-50/60' : 'hover:bg-slate-50'}`}>
                <button onClick={() => togglePick(m.id)} title="เลือกนัดนี้"
                  className="p-1 -m-1 text-slate-400 hover:text-indigo-600 shrink-0">
                  {picked.has(m.id)
                    ? <CheckSquare className="w-4 h-4 text-indigo-600" />
                    : <Square className="w-4 h-4" />}
                </button>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-slate-800 truncate flex items-center gap-1.5">
                    <span className="truncate">{m.teamA}</span>
                    <Swords className="w-3 h-3 text-slate-400 shrink-0" />
                    <span className="truncate">{m.teamB}</span>
                  </p>
                  <p className="text-[11px] text-slate-500 truncate">
                    {m.roundLabel}
                    {m.scheduledTime && ` · ${new Date(m.scheduledTime).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })}`}
                    {m.venue && ` · ${m.venue}`}
                    {m.status !== 'Scheduled' && ` · ${m.scoreA}-${m.scoreB}`}
                  </p>
                </div>
                {ALL_SLOTS.includes(m.roundLabel ?? '') && (
                  <span title="นัดนี้แสดงบนหน้าผังการแข่งขัน"
                    className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 shrink-0 flex items-center gap-0.5">
                    <Trophy className="w-2.5 h-2.5" /> ผังแข่ง
                  </span>
                )}
                {m.status !== 'Scheduled' && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 shrink-0">
                    แข่งแล้ว
                  </span>
                )}
                <button onClick={() => openEdit(m)}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs font-bold text-slate-600 hover:bg-slate-100">
                  แก้ไข
                </button>
                <button onClick={() => doDeleteMatch(m)} disabled={busy === `del_${m.id}`}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── ความสัมพันธ์กับผังการแข่งขัน ───────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <div className="flex items-start gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <Trophy className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-slate-800">ผังการแข่งขัน (รอบแพ้คัดออก)</h3>
            <p className="text-xs text-slate-500 leading-relaxed mt-0.5">
              หน้าผังแข่งแสดงเฉพาะนัดที่ตั้งชื่อรอบตรงกับช่องบนผัง ·
              นัดรอบแบ่งสายจะไม่ขึ้นที่นี่ ซึ่งถูกต้องแล้ว
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {BRACKET_SLOTS.filter(g => g.group !== 'รอบ 32 ทีม').map(g => (
            <div key={g.group} className="flex items-center gap-1">
              {g.labels.map(l => (
                <span key={l}
                  title={onBracket.has(l) ? `${l} — มีนัดแล้ว` : `${l} — ยังว่าง`}
                  className={`text-[10px] font-bold px-1.5 py-1 rounded ${onBracket.has(l)
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-slate-100 text-slate-400'}`}>
                  {l}
                </span>
              ))}
            </div>
          ))}
        </div>
        <p className="text-[11px] text-slate-500 mt-2">
          วางแล้ว <b>{onBracket.size}</b> รอบ · แก้นัดแล้วเลือก "รอบบนผังแข่ง" เพื่อวางลงช่อง
        </p>
        <a href="/tournament"
          className="inline-flex items-center gap-1.5 mt-3 text-sm font-bold text-indigo-600 hover:underline">
          เปิดหน้าผังการแข่งขัน <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>

      {editing && (
        <div className="fixed inset-0 z-[1150] bg-black/50 backdrop-blur-sm modal-sheet flex items-end md:items-center justify-center p-0 md:p-4"
          onClick={() => setEditing(null)}>
          <div className="bg-white w-full md:max-w-md rounded-2xl max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-3 flex items-center justify-between">
              <h3 className="font-bold text-slate-800">
                {editing.matchId ? 'แก้ไขนัด' : 'เพิ่มนัดใหม่'}
              </h3>
              <button onClick={() => setEditing(null)} className="p-1.5 rounded-lg hover:bg-slate-100">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className={lbl}>ทีม A</label>
                <select className={inp} value={editing.teamAId}
                  onChange={e => setEditing({ ...editing, teamAId: e.target.value })}>
                  <option value="">— เลือกทีม —</option>
                  {myTeams.map(t => <option key={t.id} value={t.id}>{t.group ? `[${t.group}] ` : ''}{t.name}</option>)}
                </select>
              </div>
              <div>
                <label className={lbl}>ทีม B</label>
                <select className={inp} value={editing.teamBId}
                  onChange={e => setEditing({ ...editing, teamBId: e.target.value })}>
                  <option value="">— เลือกทีม —</option>
                  {myTeams.map(t => <option key={t.id} value={t.id}>{t.group ? `[${t.group}] ` : ''}{t.name}</option>)}
                </select>
              </div>
              {editing.teamAId && editing.teamAId === editing.teamBId && (
                <p className="text-xs text-rose-600 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" /> ทีมเดียวกันแข่งกับตัวเองไม่ได้
                </p>
              )}
              <div>
                <label className={lbl}>รอบ / สาย</label>
                <div className="flex gap-2 mb-1.5">
                  <button type="button"
                    onClick={() => { setCustomRound(false); setEditing({ ...editing, roundLabel: '' }); }}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold border-2 ${!customRound
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                      : 'border-slate-200 text-slate-500'}`}>
                    รอบบนผังแข่ง
                  </button>
                  <button type="button"
                    onClick={() => { setCustomRound(true); setEditing({ ...editing, roundLabel: '' }); }}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold border-2 ${customRound
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                      : 'border-slate-200 text-slate-500'}`}>
                    รอบแบ่งสาย (พิมพ์เอง)
                  </button>
                </div>

                {customRound ? (
                  <>
                    <input className={inp} value={editing.roundLabel} placeholder="เช่น สาย A นัดที่ 1"
                      onChange={e => setEditing({ ...editing, roundLabel: e.target.value })} />
                    <p className="text-[11px] text-slate-400 mt-1">
                      รอบแบ่งสายจะขึ้นในตารางแข่งและตารางคะแนน แต่ไม่ขึ้นบนผังการแข่งขัน
                    </p>
                  </>
                ) : (
                  <>
                    <select className={inp} value={editing.roundLabel}
                      onChange={e => setEditing({ ...editing, roundLabel: e.target.value })}>
                      <option value="">— เลือกรอบ —</option>
                      {BRACKET_SLOTS.map(g => (
                        <optgroup key={g.group} label={g.group}>
                          {g.labels.map(l => (
                            <option key={l} value={l}>
                              {l}{onBracket.has(l) && l !== editing.roundLabel ? ' (มีนัดอยู่แล้ว)' : ''}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                    <p className="text-[11px] text-indigo-600 mt-1 flex items-start gap-1">
                      <Trophy className="w-3 h-3 shrink-0 mt-0.5" />
                      เลือกรอบจากรายการนี้ นัดจะไปโผล่บนหน้า "ผังการแข่งขัน" ทันที
                    </p>
                    {editing.roundLabel !== '' && onBracket.has(editing.roundLabel)
                      && editing.roundLabel !== (matches.find(m => m.id === editing.matchId)?.roundLabel ?? '') && (
                      <p className="text-xs text-amber-700 mt-1 flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        รอบนี้มีนัดอยู่แล้ว — ผังแข่งจะแสดงนัดใดนัดหนึ่งเท่านั้น
                      </p>
                    )}
                  </>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={`${lbl} flex items-center gap-1`}><Clock className="w-3 h-3" /> วัน-เวลา</label>
                  <input type="datetime-local" className={inp} value={editing.scheduledTime}
                    onChange={e => setEditing({ ...editing, scheduledTime: e.target.value })} />
                </div>
                <div>
                  <label className={`${lbl} flex items-center gap-1`}><MapPin className="w-3 h-3" /> สนาม</label>
                  <input className={inp} value={editing.venue}
                    onChange={e => setEditing({ ...editing, venue: e.target.value })} />
                </div>
              </div>
            </div>
            <div className="sticky bottom-0 bg-white border-t border-slate-100 p-4 flex gap-2">
              <button onClick={() => setEditing(null)}
                className="flex-1 py-2.5 rounded-xl border-2 border-slate-300 font-bold text-slate-700">
                ยกเลิก
              </button>
              <button onClick={doSaveMatch}
                disabled={busy === 'save' || (!!editing.teamAId && editing.teamAId === editing.teamBId)}
                className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white font-bold disabled:opacity-50 flex items-center justify-center gap-2">
                {busy === 'save' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                บันทึก
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminSchedule;
