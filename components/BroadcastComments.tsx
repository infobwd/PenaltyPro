import React, { useCallback, useEffect, useState } from 'react';
import {
  BroadcastComment,
  fetchBroadcastComments,
  fetchBroadcastQueue,
  moderateBroadcastComments,
  submitBroadcastComment,
} from '../services/sheetService';

/**
 * ข้อความจากผู้ชม สำหรับขึ้นแถบวิ่งบนจอถ่ายทอดสด
 *
 * ── สีต้องเป็นชุดเดียวกับหน้าอื่นของเว็บ ─────────────────────────────
 * ⚠️ เคยเขียนด้วยชุดสีพื้นเข้ม (text-white บนพื้นโปร่ง) ซึ่งเป็นสีของหน้าคุมงาน
 * ไม่ใช่ของเว็บนี้ — พอขึ้นจริงบนพื้นขาวคือตัวหนังสือขาวบนพื้นขาว อ่านไม่ออกทั้งหน้า
 * เว็บนี้ใช้พื้นขาว ตัวอักษร slate และสีหลักเป็น indigo
 *
 * ── ทำไมต้องบอกให้ชัดว่า "รอตรวจ" ────────────────────────────────────
 * คนส่งข้อความแล้วไม่เห็นมันขึ้นจอจะสรุปว่าระบบเสียแล้วส่งซ้ำอีกหลายรอบ
 * — บอกตั้งแต่ตอนกดส่งว่าต้องผ่านการตรวจก่อน จะได้ไม่ต้องเดา
 *
 * ── ทำไมหน้าคัดกรองแสดงข้อความเต็ม ไม่ตัดท้าย ────────────────────────
 * คนตรวจต้องเห็นทุกตัวอักษรก่อนกดอนุมัติ ข้อความที่ถูกตัดท้ายอาจซ่อนส่วนที่
 * ไม่เหมาะสมไว้พอดี แล้วมันจะขึ้นจอเต็ม ๆ ตอนออกอากาศ
 */

interface Props {
  tournamentId: string;
  matchId?: string;
  /** เจ้าหน้าที่ของรายการนี้เห็นแท็บคัดกรองด้วย */
  canModerate?: boolean;
}

/**
 * เวลาแบบที่คนดูงานสดอยากรู้
 *
 * ระหว่างถ่ายทอด คำถามคือ "เพิ่งส่งมาหรือส่งนานแล้ว" ไม่ใช่ "ส่งกี่โมง"
 * — บอกเป็นระยะเวลาที่ผ่านมาสำหรับของใหม่ แล้วค่อยเปลี่ยนเป็นเวลานาฬิกา
 * เมื่อนานพอจนตัวเลข "กี่ชั่วโมงที่แล้ว" เริ่มนึกภาพไม่ออก
 */
const timeAgo = (raw?: string): string => {
  if (!raw) return '';
  // MySQL DATETIME เป็นเวลาท้องถิ่นของเซิร์ฟเวอร์ ไม่มีโซนเวลาติดมา
  // ถ้าปล่อยให้เบราว์เซอร์เดา จะตีเป็น UTC แล้วเพี้ยนไป 7 ชั่วโมง
  const t = new Date(raw.replace(' ', 'T'));
  if (Number.isNaN(t.getTime())) return raw;

  const sec = Math.floor((Date.now() - t.getTime()) / 1000);
  if (sec < 0) return 'เมื่อครู่';
  if (sec < 60) return 'เมื่อครู่';
  if (sec < 3600) return Math.floor(sec / 60) + ' นาทีที่แล้ว';
  if (sec < 6 * 3600) return Math.floor(sec / 3600) + ' ชั่วโมงที่แล้ว';

  const hh = String(t.getHours()).padStart(2, '0');
  const mm = String(t.getMinutes()).padStart(2, '0');
  const sameDay = t.toDateString() === new Date().toDateString();
  if (sameDay) return hh + ':' + mm + ' น.';
  return t.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }) + ' ' + hh + ':' + mm + ' น.';
};

/**
 * รูปผู้ส่ง — มีบ้างไม่มีบ้าง
 *
 * คนส่วนใหญ่ส่งโดยไม่ล็อกอินจึงไม่มีรูป ถ้าปล่อยเป็นช่องว่างการ์ดจะเรียงไม่ตรงกัน
 * ใช้วงกลมตัวอักษรแรกของชื่อแทน — ยังแยกออกว่าใครเป็นใครโดยไม่มีกรอบรูปแตก
 */
const Avatar: React.FC<{ name?: string; src?: string; size?: number }> = ({ name, src, size = 40 }) => {
  const [broken, setBroken] = useState(false);
  const letter = (name || '').trim().charAt(0) || '👤';
  const px = { width: size, height: size, minWidth: size };

  if (src && !broken) {
    return (
      <img
        src={src}
        alt=""
        style={px}
        onError={() => setBroken(true)}
        className="rounded-full object-cover bg-slate-200 border border-slate-200"
      />
    );
  }
  return (
    <div
      style={px}
      className="rounded-full bg-slate-200 text-slate-500 font-bold flex items-center justify-center select-none"
    >
      <span style={{ fontSize: size * 0.42 }}>{letter}</span>
    </div>
  );
};

const STATUS_LABEL: Record<string, string> = {
  pending: 'รอตรวจ',
  approved: 'อนุมัติแล้ว',
  rejected: 'ไม่อนุมัติ',
};

const BroadcastComments: React.FC<Props> = ({ tournamentId, matchId, canModerate = false }) => {
  const [tab, setTab] = useState<'send' | 'queue'>('send');

  // ── ฝั่งผู้ชม ──
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState('');
  const [error, setError] = useState('');
  const [approved, setApproved] = useState<BroadcastComment[]>([]);

  const loadApproved = useCallback(async () => {
    if (!tournamentId) return;
    try { setApproved(await fetchBroadcastComments(tournamentId, 30)); } catch { /* ไม่มีก็ปล่อยว่าง */ }
  }, [tournamentId]);

  useEffect(() => { void loadApproved(); }, [loadApproved]);

  const send = async () => {
    const msg = message.trim();
    if (!msg) { setError('ยังไม่ได้พิมพ์ข้อความ'); return; }
    setSending(true); setError(''); setSent('');
    try {
      const r = await submitBroadcastComment({
        tournamentId, message: msg, authorName: name.trim(), matchId,
      });
      setSent(r.note || 'ส่งแล้ว รอเจ้าหน้าที่ตรวจก่อนขึ้นจอ');
      setMessage('');
    } catch (e: any) {
      setError(e?.message || 'ส่งไม่สำเร็จ');
    } finally {
      setSending(false);
    }
  };

  // ── ฝั่งเจ้าหน้าที่ ──
  const [queueStatus, setQueueStatus] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [queue, setQueue] = useState<BroadcastComment[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);

  const loadQueue = useCallback(async () => {
    if (!canModerate || !tournamentId) return;
    try {
      const r = await fetchBroadcastQueue(tournamentId, queueStatus);
      setQueue(r.comments); setCounts(r.counts);
    } catch { /* ไม่มีสิทธิ์ก็ไม่ต้องแสดง */ }
  }, [canModerate, tournamentId, queueStatus]);

  useEffect(() => { void loadQueue(); }, [loadQueue]);

  // คิวเปลี่ยนตลอดระหว่างงาน — ตามให้เองจะได้ไม่ต้องกดรีเฟรชเอง
  useEffect(() => {
    if (!canModerate || tab !== 'queue') return;
    const t = setInterval(() => { void loadQueue(); }, 15000);
    return () => clearInterval(t);
  }, [canModerate, tab, loadQueue]);

  const decide = async (ids: string[], status: 'approved' | 'rejected' | 'pending') => {
    if (!ids.length) return;
    setBusy(true);
    try {
      await moderateBroadcastComments(tournamentId, ids, status);
      await loadQueue();
      await loadApproved();
    } catch (e: any) {
      setError(e?.message || 'ทำไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  const left = 300 - message.length;

  const tabBtn = (active: boolean) =>
    `px-4 py-2 rounded-full text-xs font-bold transition ${
      active ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white text-slate-500 border border-slate-200'
    }`;

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-5 sm:p-6">
      <div className="flex items-start gap-3 mb-1 flex-wrap">
        <div className="min-w-0">
          <h3 className="font-bold text-xl text-slate-800 leading-tight">ส่งกำลังใจขึ้นจอ</h3>
          <p className="text-sm text-slate-500 mt-0.5">ข้อความจะวิ่งบนจอถ่ายทอดสด</p>
        </div>
        {canModerate && (
          <div className="ml-auto flex gap-2">
            <button onClick={() => setTab('send')} className={tabBtn(tab === 'send')}>ส่งข้อความ</button>
            <button onClick={() => setTab('queue')} className={tabBtn(tab === 'queue')}>
              คัดกรอง
              {counts.pending
                ? <span className="ml-1.5 bg-amber-400 text-amber-950 rounded-full px-1.5">{counts.pending}</span>
                : null}
            </button>
          </div>
        )}
      </div>

      {tab === 'send' && (
        <div className="mt-5">
          <label className="block text-sm font-bold text-slate-700 mb-1">ชื่อของคุณ</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            maxLength={80}
            placeholder="ไม่ใส่ก็ได้"
            className="w-full mb-4 bg-white border border-slate-300 rounded-xl px-4 py-3 text-slate-800 placeholder-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition"
          />

          <label className="block text-sm font-bold text-slate-700 mb-1">ข้อความ</label>
          <textarea
            value={message}
            onChange={e => setMessage(e.target.value.slice(0, 300))}
            rows={3}
            placeholder="เช่น ส่งกำลังใจให้นักกีฬาทุกคน"
            className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-slate-800 placeholder-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition resize-y"
          />

          <div className="flex items-center gap-3 mt-3 flex-wrap">
            <span className={`text-xs font-bold ${left < 30 ? 'text-amber-600' : 'text-slate-400'}`}>
              เหลือ {left} ตัวอักษร
            </span>
            <button
              onClick={send}
              disabled={sending || !message.trim()}
              className="ml-auto bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold px-7 py-3 rounded-xl shadow-lg shadow-indigo-100 active:scale-95 transition"
            >
              {sending ? 'กำลังส่ง...' : 'ส่งข้อความ'}
            </button>
          </div>

          {/* บอกตั้งแต่ก่อนกดส่ง ไม่ใช่รอให้เขาสงสัยว่าทำไมไม่ขึ้นจอ */}
          <div className="mt-4 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
            <p className="text-xs text-slate-600 leading-relaxed">
              ข้อความจะขึ้นจอถ่ายทอด<b className="text-slate-800">หลังเจ้าหน้าที่ตรวจแล้ว</b>เท่านั้น
              <br />ส่งได้ 5 ข้อความต่อ 10 นาที
            </p>
          </div>

          {sent && (
            <p className="mt-3 text-sm font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
              {sent}
            </p>
          )}
          {error && (
            <p className="mt-3 text-sm font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">
              {error}
            </p>
          )}

          {approved.length > 0 && (
            <div className="mt-6">
              <p className="text-xs font-bold text-slate-400 tracking-widest mb-2 uppercase">
                ข้อความที่ขึ้นจอแล้ว
              </p>
              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {approved.map(c => (
                  <div key={c.id} className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 flex gap-3">
                    <Avatar name={c.author} src={c.picture} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="text-slate-700 text-sm font-bold">{c.author || 'ผู้ชม'}</span>
                        <span className="text-slate-400 text-xs">{timeAgo(c.at)}</span>
                      </div>
                      <p className="text-slate-800 text-sm break-words leading-relaxed mt-0.5">{c.message}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'queue' && canModerate && (
        <div className="mt-5">
          <div className="flex gap-2 mb-4 flex-wrap">
            {(['pending', 'approved', 'rejected'] as const).map(st => (
              <button
                key={st}
                onClick={() => setQueueStatus(st)}
                className={`px-3.5 py-2 rounded-full text-xs font-bold transition ${
                  queueStatus === st
                    ? 'bg-slate-800 text-white'
                    : 'bg-white text-slate-500 border border-slate-200'
                }`}
              >
                {STATUS_LABEL[st]}{counts[st] ? ` (${counts[st]})` : ''}
              </button>
            ))}
            <button
              onClick={() => void loadQueue()}
              className="ml-auto px-3.5 py-2 rounded-full text-xs font-bold bg-white text-slate-500 border border-slate-200"
            >โหลดใหม่</button>
          </div>

          {queueStatus === 'pending' && queue.length > 1 && (
            <button
              onClick={() => decide(queue.map(c => c.id), 'approved')}
              disabled={busy}
              className="w-full mb-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-bold py-3 rounded-xl text-sm shadow-lg shadow-emerald-100 active:scale-95 transition"
            >
              อนุมัติทั้งหมด {queue.length} ข้อความ
            </button>
          )}

          {queue.length === 0 && (
            <div className="flex flex-col items-center justify-center h-40 text-slate-400 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
              <p className="text-sm font-bold">ไม่มีข้อความในหมวดนี้</p>
            </div>
          )}

          <div className="space-y-3 max-h-[28rem] overflow-y-auto pr-1">
            {queue.map(c => (
              <div key={c.id} className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
                <div className="flex gap-3">
                  <Avatar name={c.author} src={c.picture} size={36} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="text-slate-700 text-sm font-bold">{c.author || 'ผู้ชม'}</span>
                      {/* เวลาเต็มใน title — คนตรวจอาจต้องอ้างอิงเวลาแน่นอนภายหลัง */}
                      <span className="text-slate-400 text-xs" title={c.at}>{timeAgo(c.at)}</span>
                    </div>
                    {/* ข้อความเต็มเสมอ ไม่ตัดท้าย — คนตรวจต้องเห็นทุกตัวอักษรก่อนอนุมัติ */}
                    <p className="text-slate-800 text-sm break-words whitespace-pre-wrap leading-relaxed mt-0.5">
                      {c.message}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  {c.status !== 'approved' && (
                    <button
                      onClick={() => decide([c.id], 'approved')}
                      disabled={busy}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-bold py-2.5 rounded-xl text-xs active:scale-95 transition"
                    >อนุมัติขึ้นจอ</button>
                  )}
                  {c.status !== 'rejected' && (
                    <button
                      onClick={() => decide([c.id], 'rejected')}
                      disabled={busy}
                      className="flex-1 bg-white hover:bg-rose-50 border border-rose-300 text-rose-700 disabled:opacity-40 font-bold py-2.5 rounded-xl text-xs active:scale-95 transition"
                    >{c.status === 'approved' ? 'เอาลงจากจอ' : 'ไม่อนุมัติ'}</button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <p className="text-xs text-slate-500 mt-4 leading-relaxed">
            ข้อความที่อนุมัติแล้วขึ้นจอภายในประมาณ 20 วินาที
            · เอาลงได้ตลอดโดยกด "เอาลงจากจอ" ไม่ต้องลบทิ้ง
          </p>
        </div>
      )}
    </div>
  );
};

export default BroadcastComments;
