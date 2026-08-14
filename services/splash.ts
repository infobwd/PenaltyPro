import { AppSettings } from '../types';

/**
 * หน้าจอต้อนรับก่อนเข้าเว็บ — ตั้งค่าได้จากหน้าผู้ดูแลส่วนกลาง
 *
 * ⚠️ ปัญหาที่ต้องแก้ให้ได้: หน้านี้ถูกวาด "ก่อน" ข้อมูลตั้งค่าจะมาถึง
 * เพราะมันคือหน้าจอที่แสดงระหว่างรอโหลดนั่นเอง ถ้ารอ config ก่อนค่อยวาด
 * ก็จะไม่มีหน้าจอต้อนรับให้เห็นเลย
 *
 * จึงเก็บสำเนาไว้ในเครื่องทุกครั้งที่โหลดข้อมูลสำเร็จ แล้วครั้งถัดไปหยิบมาใช้ทันที
 * ผู้ชมจะเห็นค่าที่ตั้งไว้ตั้งแต่การเข้าครั้งที่สองเป็นต้นไป — ครั้งแรกสุดของเครื่อง
 * ยังเป็นค่าเริ่มต้น ซึ่งยอมรับได้เพราะเป็นแค่หน้าจอคั่น
 */

const CACHE_KEY = 'penalty_pro_splash';

export type SplashConfig = {
  logoUrl: string;
  title: string;
  subtitle: string;
  footer: string;
  /** วินาทีที่ให้ค้างจออย่างน้อย — 0 = ปิดทันทีที่โหลดข้อมูลเสร็จ */
  seconds: number;
};

export const DEFAULT_SPLASH: SplashConfig = {
  logoUrl: '',
  title: 'Penalty Pro Arena',
  subtitle: 'กำลังโหลดข้อมูลการแข่งขัน...',
  footer: '',
  seconds: 0,
};

/** ไฟล์วิดีโอต้องเล่นด้วย <video> ไม่ใช่ <img> — GIF/WebP เคลื่อนไหวใช้ <img> ได้ปกติ */
export const isVideoSource = (url: string): boolean =>
  /\.(mp4|webm|ogv|ogg|mov|m4v)(\?|#|$)/i.test((url || '').trim());

const clampSeconds = (raw: unknown): number => {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  // เกินสิบวินาทีคือกำลังกันคนออกจากเว็บ ไม่ใช่หน้าจอต้อนรับแล้ว
  return Math.min(10, Math.round(n * 10) / 10);
};

/** อ่านค่าจาก config ที่ getData ส่งมา (คีย์มาจากตาราง app_settings) */
export const splashFromSettings = (config: Partial<AppSettings> | null | undefined): SplashConfig => ({
  logoUrl:  (config?.splashLogoUrl  ?? '').trim(),
  title:    (config?.splashTitle    ?? '').trim() || DEFAULT_SPLASH.title,
  subtitle: (config?.splashSubtitle ?? '').trim() || DEFAULT_SPLASH.subtitle,
  footer:   (config?.splashFooter   ?? '').trim(),
  seconds:  clampSeconds(config?.splashSeconds),
});

/** สำเนาที่เก็บไว้ในเครื่อง — ใช้วาดหน้าจอต้อนรับก่อนข้อมูลจริงจะมาถึง */
export const readCachedSplash = (): SplashConfig => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return DEFAULT_SPLASH;
    const parsed = JSON.parse(raw);
    return {
      logoUrl:  typeof parsed.logoUrl === 'string' ? parsed.logoUrl : '',
      title:    typeof parsed.title === 'string' && parsed.title ? parsed.title : DEFAULT_SPLASH.title,
      subtitle: typeof parsed.subtitle === 'string' && parsed.subtitle ? parsed.subtitle : DEFAULT_SPLASH.subtitle,
      footer:   typeof parsed.footer === 'string' ? parsed.footer : '',
      seconds:  clampSeconds(parsed.seconds),
    };
  } catch {
    return DEFAULT_SPLASH;
  }
};

export const cacheSplash = (config: Partial<AppSettings> | null | undefined): void => {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(splashFromSettings(config)));
  } catch {
    // โควตา localStorage เต็มหรือโหมดส่วนตัว — ไม่ใช่เรื่องที่ต้องล้มการโหลดเว็บ
  }
};
