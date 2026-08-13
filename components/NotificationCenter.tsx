import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Bell, BellOff, Check, CheckCheck, Loader2, Settings2, Trash2, X,
  Trophy, Calendar, ShieldCheck, ShieldX, Banknote, Users, Megaphone, Newspaper, Clock,
  HeartHandshake,
} from 'lucide-react';
import { NotificationItem, useNotifications } from '../hooks/useNotifications';
import {
  pushSupported, pushPermission, enablePush, disablePush, sendTestNotification,
} from '../services/pushNotifications';
import { apiGet, apiPost } from '../services/apiConfig';

/**
 * กล่องแจ้งเตือน + ตั้งค่าการรับแจ้งเตือน
 *
 * รวมสองเรื่องไว้ในแผ่นเดียวโดยตั้งใจ — ตอนที่คนสนใจเรื่องการแจ้งเตือนมากที่สุด
 * คือตอนเปิดดูกล่อง ถ้าแยกหน้าตั้งค่าไปไว้ที่อื่นจะไม่มีใครหาเจอ
 */

interface Props {
  open: boolean;
  onClose: () => void;
  notify: (title: string, msg?: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
  onNavigate?: (url: string) => void;
  feed: ReturnType<typeof useNotifications>;
}

/** ไอคอนและสีต่อประเภท — ให้กวาดตาแล้วรู้ทันทีว่าเรื่องอะไร */
const LOOK: Record<string, { icon: React.ReactNode; cls: string }> = {
  team_approved:    { icon: <ShieldCheck className="w-4 h-4" />, cls: 'bg-emerald-100 text-emerald-700' },
  team_rejected:    { icon: <ShieldX className="w-4 h-4" />,     cls: 'bg-rose-100 text-rose-700' },
  payment_verified: { icon: <Banknote className="w-4 h-4" />,    cls: 'bg-amber-100 text-amber-700' },
  roster_reminder:  { icon: <Users className="w-4 h-4" />,       cls: 'bg-sky-100 text-sky-700' },
  match_scheduled:  { icon: <Calendar className="w-4 h-4" />,    cls: 'bg-indigo-100 text-indigo-700' },
  match_result:     { icon: <Trophy className="w-4 h-4" />,      cls: 'bg-violet-100 text-violet-700' },
  match_starting:   { icon: <Clock className="w-4 h-4" />,       cls: 'bg-orange-100 text-orange-700' },
  team_submitted:   { icon: <Users className="w-4 h-4" />,       cls: 'bg-indigo-100 text-indigo-700' },
  payment_submitted:{ icon: <Banknote className="w-4 h-4" />,    cls: 'bg-amber-100 text-amber-700' },
  team_reedited:    { icon: <Users className="w-4 h-4" />,       cls: 'bg-orange-100 text-orange-700' },
  donation_received:{ icon: <HeartHandshake className="w-4 h-4" />, cls: 'bg-pink-100 text-pink-700' },
  donation_verified:{ icon: <HeartHandshake className="w-4 h-4" />, cls: 'bg-emerald-100 text-emerald-700' },
  donation_rejected:{ icon: <HeartHandshake className="w-4 h-4" />, cls: 'bg-rose-100 text-rose-700' },
  news:             { icon: <Newspaper className="w-4 h-4" />,   cls: 'bg-slate-100 text-slate-600' },
  system_announcement: { icon: <Megaphone className="w-4 h-4" />, cls: 'bg-slate-100 text-slate-600' },
};

const TYPE_LABEL: Record<string, string> = {
  team_approved: 'ทีมได้รับอนุมัติ',
  team_rejected: 'ทีมถูกตีกลับให้แก้ไข',
  payment_verified: 'ยืนยันการชำระค่าสมัคร',
  roster_reminder: 'เตือนให้ส่งรายชื่อนักกีฬา',
  match_scheduled: 'กำหนด/เปลี่ยนเวลาแข่ง',
  match_result: 'ผลการแข่งขันออกแล้ว',
  match_starting: 'ใกล้ถึงเวลาแข่ง',
  team_submitted: 'มีทีมส่งใบสมัครใหม่',
  payment_submitted: 'มีทีมแนบสลิปค่าสมัคร',
  team_reedited: 'ทีมที่อนุมัติแล้วถูกแก้ไข',
  donation_received: 'มีการบริจาคใหม่รอตรวจสลิป',
  donation_verified: 'ยืนยันการบริจาคของฉันแล้ว',
  donation_rejected: 'สลิปบริจาคของฉันไม่ผ่าน',
  news: 'ข่าวประชาสัมพันธ์',
  system_announcement: 'ประกาศจากผู้ดูแลระบบ',
};

const TYPE_GROUPS: { title: string; note: string; types: string[] }[] = [
  {
    title: 'ทีมของฉัน', note: 'เรื่องที่เกิดกับทีมที่โรงเรียนส่งเข้าแข่งขัน',
    types: ['team_approved', 'team_rejected', 'payment_verified', 'roster_reminder'],
  },
  {
    title: 'การแข่งขัน', note: 'ตารางแข่งและผลการแข่งขัน',
    types: ['match_scheduled', 'match_result', 'match_starting'],
  },
  {
    title: 'การบริจาค', note: 'เรื่องที่เกิดกับเงินที่คุณบริจาคเข้ามา',
    types: ['donation_verified', 'donation_rejected'],
  },
  {
    title: 'งานผู้ดูแล', note: 'สำหรับผู้จัดการแข่งขัน — เรื่องที่ต้องลงมือทำ',
    types: ['team_submitted', 'payment_submitted', 'team_reedited', 'donation_received'],
  },
  {
    title: 'ทั่วไป', note: 'ข่าวสารและประกาศ',
    types: ['news', 'system_announcement'],
  },
];

const timeAgo = (iso: string): string => {
  const t = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T')).getTime();
  if (Number.isNaN(t)) return '';
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return 'เมื่อสักครู่';
  if (s < 3600) return `${Math.floor(s / 60)} นาทีที่แล้ว`;
  if (s < 86400) return `${Math.floor(s / 3600)} ชั่วโมงที่แล้ว`;
  if (s < 604800) return `${Math.floor(s / 86400)} วันที่แล้ว`;
  return new Date(t).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
};

const NotificationCenter: React.FC<Props> = ({ open, onClose, notify, onNavigate, feed }) => {
  const [tab, setTab] = useState<'inbox' | 'settings'>('inbox');
  const [prefs, setPrefs] = useState<Record<string, boolean> | null>(null);
  const [prefsLoading, setPrefsLoading] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushOn, setPushOn] = useState(pushPermission() === 'granted');

  const loadPrefs = async () => {
    setPrefsLoading(true);
    try {
      const r = await apiGet('getNotificationPrefs');
      setPrefs(r.preferences ?? {});
      setPushOn(!!r.pushEnabled && pushPermission() === 'granted');
    } catch (e) {
      notify('โหลดการตั้งค่าไม่สำเร็จ', (e as Error).message, 'error');
    } finally { setPrefsLoading(false); }
  };

  const openSettings = () => {
    setTab('settings');
    if (!prefs) loadPrefs();
  };

  const togglePref = async (type: string) => {
    if (!prefs) return;
    const next = { ...prefs, [type]: !prefs[type] };
    setPrefs(next);   // ปรับทันที ไม่ให้สวิตช์หน่วง
    try {
      await apiPost('saveNotificationPrefs', { preferences: next });
    } catch (e) {
      setPrefs(prefs);   // ย้อนกลับถ้าบันทึกไม่ผ่าน
      notify('บันทึกไม่สำเร็จ', (e as Error).message, 'error');
    }
  };

  const togglePush = async () => {
    setPushBusy(true);
    try {
      if (pushOn) {
        await disablePush();
        setPushOn(false);
        notify('ปิดการแจ้งเตือนแล้ว', 'ยังดูย้อนหลังได้ในกล่องนี้', 'info');
      } else {
        await enablePush();
        setPushOn(true);
        notify('เปิดการแจ้งเตือนแล้ว', 'จะได้รับแจ้งแม้ไม่ได้เปิดแอปอยู่', 'success');
      }
    } catch (e) {
      notify('ทำรายการไม่สำเร็จ', (e as Error).message, 'warning');
    } finally { setPushBusy(false); }
  };

  const openItem = (n: NotificationItem) => {
    if (!n.isRead) feed.markRead(n.id);
    if (n.url) {
      onClose();
      onNavigate?.(n.url);
    }
  };

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 modal-sheet modal-inset-mobile modal-contained flex items-end xl:items-center justify-center p-0 xl:p-4 overflow-hidden"
      style={{ zIndex: 2147483645, backgroundColor: 'rgba(2,6,23,0.65)' }}
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-md rounded-3xl shadow-2xl overflow-hidden flex flex-col"
        style={{
          backgroundColor: '#ffffff',
          height: 'min(86vh, 46rem)',
          maxHeight: 'calc(100vh - 1rem)',
          isolation: 'isolate',
        }}
        role="dialog"
        aria-modal="true"
        aria-label="การแจ้งเตือน"
        onClick={e => e.stopPropagation()}
      >
        {/* หัวใช้ inline style เพราะ render ผ่าน portal เหมือน dialog อื่นในระบบ */}
        <div
          className="relative shrink-0 px-4 pt-5 pb-3"
          style={{ backgroundColor: '#4338CA', color: '#ffffff' }}
        >
          <button onClick={onClose} aria-label="ปิด"
            className="absolute top-4 right-4 p-2 rounded-full"
            style={{ backgroundColor: 'rgba(255,255,255,0.18)', color: '#ffffff' }}>
            <X className="w-5 h-5" />
          </button>
          <p className="text-xs font-bold" style={{ color: '#C7D2FE' }}>NOTIFICATIONS</p>
          <h2 className="text-xl font-black leading-tight mt-1 pr-10" style={{ color: '#ffffff' }}>
            การแจ้งเตือน
          </h2>

          <div className="flex gap-2 mt-3">
            <button onClick={() => setTab('inbox')}
              className="px-3 py-1.5 rounded-lg text-xs font-bold"
              style={tab === 'inbox'
                ? { backgroundColor: '#ffffff', color: '#3730A3' }
                : { backgroundColor: 'rgba(255,255,255,0.16)', color: '#ffffff' }}>
              กล่องข้อความ {feed.unreadCount > 0 ? `(${feed.unreadCount})` : ''}
            </button>
            <button onClick={openSettings}
              className="px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1"
              style={tab === 'settings'
                ? { backgroundColor: '#ffffff', color: '#3730A3' }
                : { backgroundColor: 'rgba(255,255,255,0.16)', color: '#ffffff' }}>
              <Settings2 className="w-3.5 h-3.5" /> ตั้งค่า
            </button>
          </div>
        </div>

        {tab === 'inbox' ? (
          <>
            {feed.items.length > 0 && (
              <div className="px-4 py-2 border-b border-slate-100 flex items-center justify-between shrink-0">
                <button onClick={feed.markAllRead} disabled={feed.unreadCount === 0}
                  className="text-xs font-bold text-indigo-600 flex items-center gap-1 disabled:text-slate-300">
                  <CheckCheck className="w-3.5 h-3.5" /> อ่านทั้งหมด
                </button>
                <button
                  onClick={() => {
                    if (window.confirm('ลบการแจ้งเตือนทั้งหมด?')) feed.clearAll();
                  }}
                  className="text-xs font-bold text-slate-400 hover:text-rose-600 flex items-center gap-1">
                  <Trash2 className="w-3.5 h-3.5" /> ล้างกล่อง
                </button>
              </div>
            )}

            <div className="flex-1 overflow-y-auto modal-scroll-region">
              {feed.loading && feed.items.length === 0 ? (
                <div className="py-16 flex justify-center">
                  <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
                </div>
              ) : feed.items.length === 0 ? (
                <div className="py-16 text-center px-6">
                  <Bell className="w-10 h-10 mx-auto text-slate-200 mb-3" />
                  <p className="text-sm text-slate-400">ยังไม่มีการแจ้งเตือน</p>
                  <p className="text-xs text-slate-400 mt-1">
                    เมื่อมีผลการแข่งขันหรือความคืบหน้าของทีม จะแจ้งที่นี่
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {feed.items.map(n => {
                    const look = LOOK[n.type] ?? LOOK.system_announcement;
                    return (
                      <div key={n.id}
                        className={`px-4 py-3 flex gap-3 ${n.isRead ? '' : 'bg-indigo-50/50'}`}>
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${look.cls}`}>
                          {look.icon}
                        </div>
                        <button onClick={() => openItem(n)} className="min-w-0 flex-1 text-left">
                          <p className={`text-sm truncate ${n.isRead ? 'text-slate-700' : 'font-bold text-slate-900'}`}>
                            {n.title}
                          </p>
                          {n.body && (
                            <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{n.body}</p>
                          )}
                          <p className="text-[11px] text-slate-400 mt-1">{timeAgo(n.createdAt)}</p>
                        </button>
                        <div className="flex flex-col gap-1 shrink-0">
                          {!n.isRead && (
                            <button onClick={() => feed.markRead(n.id)} title="ทำเครื่องหมายว่าอ่านแล้ว"
                              className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50">
                              <Check className="w-4 h-4" />
                            </button>
                          )}
                          <button onClick={() => feed.remove(n.id)} title="ลบ"
                            className="p-1.5 rounded-lg text-slate-300 hover:text-rose-600 hover:bg-rose-50">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {feed.hasMore && (
                    <button onClick={feed.loadMore}
                      className="w-full py-3 text-sm font-bold text-indigo-600 hover:bg-indigo-50">
                      โหลดเพิ่ม
                    </button>
                  )}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 overflow-y-auto modal-scroll-region p-4 space-y-4">
            {/* เปิด/ปิดการแจ้งเตือนเข้าเครื่อง */}
            <div className="rounded-2xl border border-slate-200 p-3">
              <div className="flex items-start gap-3">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                  pushOn ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                  {pushOn ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-sm text-slate-800">แจ้งเตือนเข้าเครื่อง</p>
                  <p className="text-[11px] text-slate-500 leading-relaxed mt-0.5">
                    {!pushSupported()
                      ? 'เบราว์เซอร์นี้ยังไม่รองรับ — ลองติดตั้งแอปลงหน้าจอโฮมก่อน'
                      : pushPermission() === 'denied'
                        ? 'คุณเคยปิดไว้ — เปิดใหม่ได้ที่ตั้งค่าเว็บไซต์ในเบราว์เซอร์'
                        : 'ได้รับแจ้งแม้ไม่ได้เปิดแอปอยู่ เช่น ผลแข่งออกหรือทีมถูกตีกลับ'}
                  </p>
                </div>
                <button onClick={togglePush}
                  disabled={pushBusy || !pushSupported() || pushPermission() === 'denied'}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold shrink-0 disabled:opacity-40 ${
                    pushOn ? 'bg-slate-100 text-slate-600' : 'bg-indigo-600 text-white'}`}>
                  {pushBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : (pushOn ? 'ปิด' : 'เปิด')}
                </button>
              </div>
              {pushOn && (
                <button
                  onClick={async () => {
                    try {
                      await sendTestNotification();
                      notify('ส่งแล้ว', 'ถ้าไม่เห็นการแจ้งเตือน ให้ตรวจการตั้งค่าของเครื่อง', 'info');
                    } catch (e) {
                      notify('ส่งไม่สำเร็จ', (e as Error).message, 'error');
                    }
                  }}
                  className="mt-2 w-full py-2 rounded-lg border border-slate-200 text-xs font-bold text-slate-600">
                  ส่งการแจ้งเตือนทดสอบให้ตัวเอง
                </button>
              )}
            </div>

            {prefsLoading || !prefs ? (
              <div className="py-10 flex justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
              </div>
            ) : (
              TYPE_GROUPS.map(g => (
                <div key={g.title}>
                  <p className="text-xs font-bold text-slate-700">{g.title}</p>
                  <p className="text-[11px] text-slate-400 mb-2">{g.note}</p>
                  <div className="rounded-2xl border border-slate-200 divide-y divide-slate-100">
                    {g.types.map(t => (
                      <label key={t} className="flex items-center gap-3 px-3 py-2.5 cursor-pointer">
                        <span className="text-sm text-slate-700 flex-1">{TYPE_LABEL[t] ?? t}</span>
                        <input
                          type="checkbox"
                          className="w-5 h-5 accent-indigo-600"
                          checked={!!prefs[t]}
                          onChange={() => togglePref(t)}
                        />
                      </label>
                    ))}
                  </div>
                </div>
              ))
            )}

            <p className="text-[11px] text-slate-400 leading-relaxed">
              ปิดประเภทไหนไว้ เรื่องนั้นจะไม่เข้ากล่องและไม่ส่งเข้าเครื่อง ·
              ประกาศจากผู้ดูแลระบบจะส่งเสมอเพราะเป็นเรื่องที่กระทบทุกคน
            </p>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
};

export default NotificationCenter;
