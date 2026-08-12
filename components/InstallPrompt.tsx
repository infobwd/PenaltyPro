import React, { useEffect, useState } from 'react';
import { Download, Share2, X, Plus } from 'lucide-react';
import { canInstallApp, promptInstall } from '../hooks/usePWA';

/**
 * ชวนติดตั้งแอปลงหน้าจอโฮม
 *
 * ทำไมต้องมี: ในสนามสัญญาณไม่ดี แอปที่ติดตั้งแล้วเปิดเร็วกว่ามาก (shell อยู่ในเครื่อง)
 * และได้การแจ้งเตือนเข้าเครื่องด้วย แต่ผู้ใช้ส่วนใหญ่ไม่รู้ว่าเว็บนี้ติดตั้งได้
 *
 * กติกาที่ยึด เพื่อไม่ให้กลายเป็นป้ายกวนใจ:
 *   - ไม่ขึ้นถ้าติดตั้งไปแล้ว (display-mode: standalone)
 *   - ไม่ขึ้นทันทีที่เปิดหน้า รอให้ผู้ใช้อยู่สักพักก่อน
 *   - ปิดแล้วเงียบไป 14 วัน
 *   - iOS ไม่มี beforeinstallprompt จึงต้องบอกวิธีทำเอง (แชร์ → เพิ่มไปยังหน้าจอโฮม)
 */

const DISMISS_KEY = 'kickoff_install_dismissed_at';
const QUIET_DAYS = 14;
const SHOW_AFTER_MS = 20_000;

const isStandalone = (): boolean =>
  window.matchMedia?.('(display-mode: standalone)').matches
  || (window.navigator as any).standalone === true;

const isIOS = (): boolean =>
  /iphone|ipad|ipod/i.test(navigator.userAgent)
  && !/crios|fxios/i.test(navigator.userAgent);

const recentlyDismissed = (): boolean => {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
    return at > 0 && Date.now() - at < QUIET_DAYS * 24 * 60 * 60 * 1000;
  } catch { return false; }
};

const InstallPrompt: React.FC = () => {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isStandalone() || recentlyDismissed()) return;
    const t = setTimeout(() => {
      // Android/Chrome มี beforeinstallprompt ให้เรียกกล่องติดตั้งจริง
      // iOS ไม่มี จึงแสดงคำแนะนำแทน (ยังคุ้มเพราะติดตั้งแล้วได้แจ้งเตือนด้วย)
      if (canInstallApp() || isIOS()) setShow(true);
    }, SHOW_AFTER_MS);
    return () => clearTimeout(t);
  }, []);

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch {}
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className="fixed inset-x-0 bottom-20 z-[1600] px-3 pointer-events-none">
      <div className="mx-auto w-full max-w-md rounded-2xl shadow-2xl border border-slate-200
                      bg-white p-3 flex items-start gap-3 pointer-events-auto
                      animate-in slide-in-from-bottom-4">
        <div className="w-11 h-11 rounded-xl shrink-0 flex items-center justify-center"
          style={{ backgroundColor: '#EEF2FF' }}>
          <img src="/icons/icon-192.png" alt="" className="w-8 h-8 rounded-lg" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="font-bold text-sm text-slate-800">ติดตั้งแอปลงหน้าจอโฮม</p>
          {isIOS() && !canInstallApp() ? (
            <p className="text-[11px] text-slate-500 leading-relaxed mt-0.5">
              กดปุ่ม <Share2 className="w-3 h-3 inline mx-0.5" /> ด้านล่างของ Safari
              แล้วเลือก <b>เพิ่มไปยังหน้าจอโฮม</b> <Plus className="w-3 h-3 inline" />
            </p>
          ) : (
            <p className="text-[11px] text-slate-500 leading-relaxed mt-0.5">
              เปิดเร็วขึ้นแม้สัญญาณไม่ดี และรับการแจ้งเตือนผลการแข่งขันได้
            </p>
          )}

          {(!isIOS() || canInstallApp()) && (
            <button
              onClick={async () => {
                setBusy(true);
                const ok = await promptInstall();
                setBusy(false);
                if (ok) setShow(false); else dismiss();
              }}
              disabled={busy}
              className="mt-2 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-bold
                         flex items-center gap-1.5 disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" /> ติดตั้งเลย
            </button>
          )}
        </div>

        <button onClick={dismiss} aria-label="ปิด"
          className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export default InstallPrompt;
