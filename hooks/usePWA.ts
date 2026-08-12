import { useEffect } from 'react';

/**
 * แจ้งเมื่อมีเวอร์ชันใหม่รออยู่
 *
 * ปัญหาที่แก้: service worker เก็บ shell ไว้ พอ deploy ใหม่แล้วผู้ใช้ที่เปิดแอปค้างไว้
 * จะยังใช้ของเก่าจนกว่าจะปิดทุกแท็บ ซึ่งบนมือถือแทบไม่เกิดขึ้นเลย
 * ตรงนี้จับ SW ที่ติดตั้งเสร็จแล้วรออยู่ แล้วบอกผู้ใช้ให้กดโหลดใหม่
 *
 * onUpdate จะได้รับฟังก์ชัน apply() ไปผูกกับปุ่มในการแจ้งเตือนของแอป
 */
export function useSWUpdate(onUpdate: (apply: () => void) => void) {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    let announced = false;

    const announce = (worker: ServiceWorker) => {
      if (announced) return;
      announced = true;
      onUpdate(() => worker.postMessage('SKIP_WAITING'));
      // SW ใหม่เข้าควบคุมเมื่อไหร่ค่อยรีโหลด — รีโหลดก่อนหน้านั้นจะได้ของเก่าอีกรอบ
      navigator.serviceWorker.addEventListener(
        'controllerchange', () => window.location.reload(), { once: true });
    };

    let timer: number | undefined;
    navigator.serviceWorker.ready.then(reg => {
      if (reg.waiting) announce(reg.waiting);

      reg.addEventListener('updatefound', () => {
        const installing = reg.installing;
        if (!installing) return;
        installing.addEventListener('statechange', () => {
          // ต้องมี controller อยู่ก่อน ไม่งั้นนี่คือการติดตั้งครั้งแรก ไม่ใช่การอัปเดต
          if (installing.state === 'installed' && navigator.serviceWorker.controller) {
            announce(installing);
          }
        });
      });

      // เช็คทุกชั่วโมง เผื่อเปิดแอปค้างไว้ทั้งวัน
      timer = window.setInterval(() => { reg.update().catch(() => {}); }, 60 * 60 * 1000);
    }).catch(() => {});

    return () => { if (timer) clearInterval(timer); };
  }, [onUpdate]);
}

/**
 * ตัวเลขบนไอคอนแอป (Badge API)
 *
 * รองรับ Chrome บน Android/เดสก์ท็อป และ Safari iOS 16.4+ เมื่อติดตั้งเป็นแอปแล้ว
 * เบราว์เซอร์ที่ไม่รองรับจะข้ามไปเงียบ ๆ ไม่ต้องดักเพิ่ม
 */
export function usePWABadge(count: number) {
  useEffect(() => {
    const nav = navigator as any;
    if (!('setAppBadge' in navigator)) return;
    if (count > 0) nav.setAppBadge(count).catch(() => {});
    else nav.clearAppBadge?.().catch(() => {});
  }, [count]);
}

export const clearPWABadge = () => {
  const nav = navigator as any;
  if ('clearAppBadge' in navigator) nav.clearAppBadge().catch(() => {});
};

/**
 * ปุ่ม "ติดตั้งแอป" ของเราเอง
 *
 * Chrome ยิง beforeinstallprompt แล้วให้เราเก็บ event ไว้เรียกทีหลังได้
 * ต้องเก็บไว้เพราะเรียก prompt() ได้เฉพาะจากการกดของผู้ใช้เท่านั้น
 */
let deferredPrompt: any = null;
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e: any) => {
    e.preventDefault();
    deferredPrompt = e;
  });
  window.addEventListener('appinstalled', () => { deferredPrompt = null; });
}

export const canInstallApp = (): boolean => deferredPrompt !== null;

export const promptInstall = async (): Promise<boolean> => {
  if (!deferredPrompt) return false;
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  deferredPrompt = null;
  return outcome === 'accepted';
};
