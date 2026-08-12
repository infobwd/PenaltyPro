import { apiGet, apiPost } from './apiConfig';

/**
 * เปิด/ปิดการแจ้งเตือนเข้าเครื่อง (Web Push)
 *
 * ลำดับที่ต้องเป็นแบบนี้เท่านั้น:
 *   1. ผู้ใช้ "กดปุ่ม" ก่อน — ห้ามขอสิทธิ์ตอนโหลดหน้า เบราว์เซอร์จะบล็อกถาวร
 *      และ Chrome ยังลดคะแนนเว็บที่ขอพร่ำเพรื่อด้วย
 *   2. ขอสิทธิ์จากเบราว์เซอร์
 *   3. ขอ subscription จาก service worker
 *   4. ส่งขึ้นเซิร์ฟเวอร์เก็บไว้
 *
 * ถ้าผู้ใช้เคยกด "ไม่อนุญาต" ไปแล้ว เราขอใหม่ไม่ได้ — ต้องไปเปิดเองในตั้งค่าเบราว์เซอร์
 */

export const pushSupported = (): boolean =>
  typeof window !== 'undefined'
  && 'serviceWorker' in navigator
  && 'PushManager' in window
  && 'Notification' in window;

export const pushPermission = (): NotificationPermission | 'unsupported' =>
  pushSupported() ? Notification.permission : 'unsupported';

/** base64url ของ VAPID -> Uint8Array ที่ PushManager ต้องการ */
const urlBase64ToUint8Array = (base64: string): Uint8Array => {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = window.atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
};

export const getExistingSubscription = async (): Promise<PushSubscription | null> => {
  if (!pushSupported()) return null;
  try {
    const reg = await navigator.serviceWorker.ready;
    return await reg.pushManager.getSubscription();
  } catch {
    return null;
  }
};

/** เปิดรับการแจ้งเตือน — โยน Error พร้อมข้อความภาษาไทยเมื่อทำไม่ได้ */
export const enablePush = async (): Promise<void> => {
  if (!pushSupported()) {
    throw new Error('เบราว์เซอร์นี้ยังไม่รองรับการแจ้งเตือน — ลองเปิดผ่าน Chrome หรือติดตั้งแอปก่อน');
  }

  const cfg = await apiGet('pushConfig');
  if (!cfg.enabled || !cfg.vapidPublicKey) {
    throw new Error('ผู้ดูแลระบบยังไม่ได้เปิดใช้งานการแจ้งเตือน');
  }

  const permission = await Notification.requestPermission();
  if (permission === 'denied') {
    throw new Error('คุณเคยปิดการแจ้งเตือนไว้ — เปิดใหม่ได้ที่ตั้งค่าเว็บไซต์ในเบราว์เซอร์');
  }
  if (permission !== 'granted') {
    throw new Error('ยังไม่ได้อนุญาตการแจ้งเตือน');
  }

  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();

  // subscription เดิมอาจผูกกับ VAPID key เก่า (กรณีผู้ดูแลสร้างคีย์ใหม่)
  // ถ้าไม่ตรงต้องยกเลิกแล้วสมัครใหม่ ไม่งั้น push จะถูกปฏิเสธที่ปลายทางเงียบ ๆ
  if (sub) {
    const current = new Uint8Array(sub.options.applicationServerKey ?? new ArrayBuffer(0));
    const wanted = urlBase64ToUint8Array(cfg.vapidPublicKey);
    const same = current.length === wanted.length
      && current.every((b, i) => b === wanted[i]);
    if (!same) {
      await sub.unsubscribe().catch(() => {});
      sub = null;
    }
  }

  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(cfg.vapidPublicKey),
    });
  }

  await apiPost('savePushSubscription', { subscription: sub.toJSON() });
};

/** ปิดรับ — ล้างทั้งฝั่งเซิร์ฟเวอร์และเบราว์เซอร์ */
export const disablePush = async (): Promise<void> => {
  // ล้างฝั่งเซิร์ฟเวอร์ก่อนเสมอ ต่อให้ยกเลิกฝั่งเบราว์เซอร์ไม่สำเร็จ
  // ระบบก็จะไม่ยิงไปที่ endpoint เดิมอีก
  await apiPost('deletePushSubscription').catch(() => {});
  try {
    const sub = await getExistingSubscription();
    await sub?.unsubscribe();
  } catch { /* ไม่สำเร็จก็ไม่เป็นไร ฝั่งเซิร์ฟเวอร์ล้างแล้ว */ }
};

export const sendTestNotification = async (): Promise<void> => {
  await apiPost('sendTestNotification');
};
