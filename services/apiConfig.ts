/**
 * ปลายทาง API และตัวช่วยเรียก
 *
 * ทุก action วิ่งไป PHP/MySQL บนโฮสต์เดียวกับหน้าเว็บแล้ว — ไม่มีอะไรเหลืออยู่
 * บน Google Apps Script อีก ปิดชีตทิ้งได้โดยระบบไม่กระทบ
 */

const isDev = import.meta.env?.DEV === true;

/**
 * production ใช้ path สัมพัทธ์ `/api/` โดยตั้งใจ ไม่ใช่ URL เต็ม
 *
 * ถ้า hardcode เป็น https://kickoff.bwd.ac.th/api/ แล้วผู้ใช้เปิดเว็บผ่าน
 * https://www.kickoff.bwd.ac.th จะกลายเป็นคนละ origin ทันที -> เบราว์เซอร์
 * บล็อกด้วย CORS ทั้งที่เป็นเซิร์ฟเวอร์เครื่องเดียวกัน
 *
 * path สัมพัทธ์ทำให้เรียก API ที่ origin เดียวกับหน้าเว็บเสมอ ไม่ว่าจะเข้ามา
 * ทาง www หรือไม่ก็ตาม — ไม่ต้องพึ่ง CORS เลย
 */
export const DB_API =
  (import.meta.env?.VITE_API_URL as string | undefined)
  ?? (isDev ? 'http://127.0.0.1:8899/' : '/api/');

const TOKEN_KEY = 'penalty_pro_token';
const TOKEN_KIND_KEY = 'penalty_pro_token_kind';
const USER_TOKEN_BACKUP = 'penalty_pro_user_token';

/**
 * ระบบมี session 2 ชนิดที่ใช้ช่องเดียวกัน
 *
 *   user — เข้าด้วยชื่อผู้ใช้หรือ LINE
 *   team — เข้าหน้าโรงเรียนด้วยรหัส 8 ตัว (ผูกกับโรงเรียน ไม่ใช่บัญชีคน)
 *
 * ⚠️ ต้องรู้ว่าตอนนี้ถืออันไหนอยู่ ไม่งั้นเกิดอาการนี้:
 *    ครูล็อกอินด้วย LINE (ได้ user token) → เข้าหน้าโรงเรียน (ทับด้วย team token)
 *    → ตัวเช็คการแจ้งเตือนที่ยิงทุก 25 วินาทีใช้ team token ไปเรียก endpoint ของผู้ใช้
 *    → ได้ 401 → ระบบเด้ง "เซสชันหมดอายุ" ทั้งที่เพิ่งเข้ามาเอง
 *
 * และเก็บ user token สำรองไว้ เพื่อคืนให้ตอนออกจากหน้าโรงเรียน
 * ครูจะได้ไม่หลุดจากบัญชีตัวเองเพราะเข้าไปกรอกรายชื่อทีม
 */
export type TokenKind = 'user' | 'team';

export const getToken = (): string | null => localStorage.getItem(TOKEN_KEY);
export const getTokenKind = (): TokenKind | null =>
  (localStorage.getItem(TOKEN_KIND_KEY) as TokenKind | null);

export const setToken = (t: string, kind: TokenKind = 'user') => {
  if (kind === 'team') {
    // เก็บ token ของบัญชีไว้ก่อนถูกทับ
    const prev = localStorage.getItem(TOKEN_KEY);
    const prevKind = localStorage.getItem(TOKEN_KIND_KEY);
    if (prev && prevKind !== 'team') localStorage.setItem(USER_TOKEN_BACKUP, prev);
  } else {
    localStorage.removeItem(USER_TOKEN_BACKUP);
  }
  localStorage.setItem(TOKEN_KEY, t);
  localStorage.setItem(TOKEN_KIND_KEY, kind);
};

export const clearToken = () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(TOKEN_KIND_KEY);
  localStorage.removeItem(USER_TOKEN_BACKUP);
};

/** ออกจากหน้าโรงเรียน — คืน session ของบัญชีเดิมถ้ามี */
export const clearTeamToken = () => {
  const backup = localStorage.getItem(USER_TOKEN_BACKUP);
  localStorage.removeItem(USER_TOKEN_BACKUP);
  if (backup) {
    localStorage.setItem(TOKEN_KEY, backup);
    localStorage.setItem(TOKEN_KIND_KEY, 'user');
  } else {
    clearToken();
  }
};

/**
 * session หมดอายุ — ล้างเท่าที่หมดจริง
 *
 * ถ้าใบที่หมดคือ token ของหน้าโรงเรียน (อายุสั้นกว่าของบัญชี) ให้คืน session
 * บัญชีเดิมกลับมา ครูจะได้แค่ต้องเข้าหน้าโรงเรียนใหม่ ไม่ใช่หลุดออกจากระบบทั้งหมด
 */
const clearExpiredToken = () => {
  if (getTokenKind() === 'team') clearTeamToken();
  else clearToken();
};

const authHeaders = (): Record<string, string> => {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
};

/**
 * ตัวจับ session หมดอายุระดับแอป
 *
 * ที่ต้องมี: UI เคยถือสถานะ "เข้าสู่ระบบแล้ว" ของตัวเองแยกจาก token จริง
 * พอ token หมดอายุ ปุ่มยังกดได้แต่ server ตอบ 401 แล้วผู้ใช้เห็นแค่ "บันทึกหาย"
 * โดยไม่มีอะไรบอก — ตรงนี้ทำให้ 401 ทุกที่ในระบบแจ้งเตือนแบบเดียวกันเสมอ
 */
type UnauthorizedHandler = (message: string) => void;
let onUnauthorized: UnauthorizedHandler | null = null;

export const setUnauthorizedHandler = (fn: UnauthorizedHandler | null) => {
  onUnauthorized = fn;
};

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly payload?: any) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * ไม่ปล่อยให้คำขอค้างตาม timeout ของเบราว์เซอร์ซึ่งอาจนานหลายนาที
 * และแปลง TypeError: Failed to fetch ให้เป็นข้อความที่ผู้ใช้เข้าใจได้
 */
const fetchWithTimeout = async (
  url: string,
  init: RequestInit,
  timeoutMs = 30000,
): Promise<Response> => {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      throw new ApiError('เซิร์ฟเวอร์ใช้เวลาตอบนานเกินไป กรุณาลองใหม่อีกครั้ง', 0);
    }
    throw new ApiError(
      navigator.onLine
        ? 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่อีกครั้ง'
        : 'อุปกรณ์ไม่ได้เชื่อมต่ออินเทอร์เน็ต',
      0,
    );
  } finally {
    window.clearTimeout(timer);
  }
};

/**
 * เรียก API แล้ว "ตรวจผลลัพธ์จริง"
 *
 * ของเดิมใช้ mode:'no-cors' ทำให้ response เป็น opaque แล้ว return true เสมอ
 * ผู้ใช้จึงเห็น "บันทึกสำเร็จ" ทั้งที่เซิร์ฟเวอร์ล้มเหลว — เป็นที่มาของอาการ
 * "บันทึกแล้วข้อมูลหาย" ที่หาสาเหตุไม่เจอ
 */
export async function apiGet<T = any>(
  action: string,
  params: Record<string, string | number | undefined> = {},
  opts: { background?: boolean } = {},
): Promise<T> {
  // ต้องส่ง base เพราะ DB_API เป็น path สัมพัทธ์บน production
  const url = new URL(DB_API, window.location.origin);
  url.searchParams.set('action', action);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
  }

  const res = await fetchWithTimeout(url.toString(), {
    method: 'GET',
    headers: { ...authHeaders() },
  });

  const text = await res.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ApiError(`เซิร์ฟเวอร์ตอบกลับไม่ใช่ JSON (HTTP ${res.status})`, res.status);
  }
  if (!res.ok || data?.status === 'error') {
    const err = new ApiError(
      data?.message ?? `คำขอล้มเหลว (HTTP ${res.status})`, res.status, data);
    // คำขอเบื้องหลัง (เช่น poll การแจ้งเตือน) ห้ามสั่ง logout ทั้งระบบ
    // ผู้ใช้ไม่ได้กดอะไรเลย การเด้งออกจึงดูเหมือนระบบพังโดยไม่มีสาเหตุ
    if (res.status === 401 && !opts.background) {
      clearExpiredToken();
      onUnauthorized?.(err.message);
    }
    throw err;
  }
  return data as T;
}

/**
 * @param opts.background  คำขอที่แอปยิงเองโดยผู้ใช้ไม่ได้สั่ง
 *
 * 401 ของคำขอแบบนี้ **ห้าม** ไปปลุกตัวจัดการ session หมดอายุ
 *
 * เคสจริงที่ทำให้หน้า /school ใช้งานไม่ได้บนของจริง: พอเปิดหน้า แอปลองเข้า
 * ด้วยบัญชีที่ผูกโรงเรียนไว้ให้อัตโนมัติ (teamLoginByAccount) ถ้าบัญชีนั้น
 * ยังไม่ได้รับการรับรอง หรือ token ที่ถืออยู่เป็นของทีมไม่ใช่ของผู้ใช้
 * server จะตอบ 401 ตามปกติ — แต่ตัวจัดการกลางล้าง token แล้วเด้งไป /login
 * ครูจึงเจอ "เซสชันหมดอายุ" และกรอกอะไรไม่ได้เลย ทั้งที่แค่ทางลัดใช้ไม่ได้
 * ซึ่งไม่ใช่ความผิดพลาดที่ต้องบอกผู้ใช้ด้วยซ้ำ
 */
export async function apiPost<T = any>(
  action: string, body: any = {}, opts: { background?: boolean } = {},
): Promise<T> {
  // ต้องส่ง base เพราะ DB_API เป็น path สัมพัทธ์บน production
  const url = new URL(DB_API, window.location.origin);
  url.searchParams.set('action', action);

  const res = await fetchWithTimeout(url.toString(), {
    method: 'POST',
    // text/plain เพื่อเลี่ยง CORS preflight — เหมือนที่ของเดิมทำ
    headers: { 'Content-Type': 'text/plain;charset=utf-8', ...authHeaders() },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ApiError(`เซิร์ฟเวอร์ตอบกลับไม่ใช่ JSON (HTTP ${res.status})`, res.status);
  }
  if (!res.ok || data?.status === 'error') {
    const err = new ApiError(
      data?.message ?? `คำขอล้มเหลว (HTTP ${res.status})`, res.status, data);
    if (res.status === 401 && !opts.background) {
      clearExpiredToken();
      onUnauthorized?.(err.message);
    }
    throw err;
  }
  return data as T;
}

/**
 * ขอไฟล์จาก API แล้วสั่งดาวน์โหลด
 *
 * ทำไมไม่เปิดลิงก์ตรง ๆ: การยืนยันตัวตนของระบบนี้อยู่ใน Authorization header
 * ไม่ใช่คุกกี้ ถ้าเปิดลิงก์ด้วย window.open หรือ <a href> เบราว์เซอร์จะไม่แนบ
 * header ไปด้วย ทางเลือกเดียวคือยัด token ลง URL ซึ่งจะไปโผล่ใน log ของ
 * เซิร์ฟเวอร์และในประวัติเบราว์เซอร์ จึงดึงเป็น blob แล้วค่อยสั่งบันทึกแทน
 *
 * ชื่อไฟล์อ่านจาก Content-Disposition ที่ server ส่งมา (รองรับชื่อภาษาไทย)
 */
export async function apiDownload(
  action: string, body: any = {}, fallbackName = 'download.pdf',
): Promise<void> {
  const url = new URL(DB_API, window.location.origin);
  url.searchParams.set('action', action);

  const res = await fetchWithTimeout(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8', ...authHeaders() },
    body: JSON.stringify(body),
  }, 120000);   // สร้าง PDF หลายร้อยหน้าใช้เวลากว่าคำขอปกติ

  // ผิดพลาด = server ตอบ JSON กลับมาแทนไฟล์
  if (!res.ok || (res.headers.get('Content-Type') || '').includes('json')) {
    const text = await res.text();
    let data: any = null;
    try { data = JSON.parse(text); } catch { /* ไม่ใช่ JSON ก็ใช้ข้อความมาตรฐาน */ }
    const err = new ApiError(
      data?.message ?? `ดาวน์โหลดไม่สำเร็จ (HTTP ${res.status})`, res.status, data);
    if (res.status === 401) {
      clearExpiredToken();
      onUnauthorized?.(err.message);
    }
    throw err;
  }

  const disposition = res.headers.get('Content-Disposition') || '';
  const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
  const plain = /filename="([^"]+)"/i.exec(disposition);
  let name = fallbackName;
  if (utf8) {
    try { name = decodeURIComponent(utf8[1]); } catch { name = plain?.[1] || fallbackName; }
  } else if (plain) {
    name = plain[1];
  }

  const blob = await res.blob();
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // ปล่อยช้าหน่อย บาง browser ยังอ่าน blob อยู่ตอน click เพิ่งจบ
  window.setTimeout(() => URL.revokeObjectURL(href), 10000);
}

/**
 * อัปโหลดไฟล์แบบ multipart
 *
 * ห้ามตั้ง Content-Type เอง — เบราว์เซอร์ต้องใส่ boundary ให้ ถ้าตั้งทับ
 * ฝั่ง PHP จะแยก field ไม่ออกและได้ $_FILES ว่างเปล่า
 */
export async function apiUpload<T = any>(action: string, form: FormData): Promise<T> {
  const url = new URL(DB_API, window.location.origin);
  url.searchParams.set('action', action);

  const res = await fetchWithTimeout(url.toString(), {
    method: 'POST',
    headers: { ...authHeaders() },
    body: form,
  }, 120000);

  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); }
  catch { throw new ApiError(`เซิร์ฟเวอร์ตอบกลับไม่ใช่ JSON (HTTP ${res.status})`, res.status); }
  if (!res.ok || data?.status === 'error') {
    const err = new ApiError(data?.message ?? `อัปโหลดไม่สำเร็จ (HTTP ${res.status})`, res.status, data);
    if (res.status === 401) { clearExpiredToken(); onUnauthorized?.(err.message); }
    throw err;
  }
  return data as T;
}

/**
 * อัปโหลดพร้อมรายงานความคืบหน้า
 *
 * ต้องใช้ XMLHttpRequest ไม่ใช่ fetch เพราะ fetch ยังบอกความคืบหน้า "ขาส่ง" ไม่ได้
 * ไฟล์เอกสารโครงการมักหลายเมกะไบต์ ถ้าไม่มีแถบบอก ผู้ใช้จะนึกว่าค้างแล้วกดซ้ำ
 * จนได้ไฟล์ซ้ำหลายอัน
 */
export function apiUploadProgress<T = any>(
  action: string,
  form: FormData,
  onProgress?: (percent: number) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const url = new URL(DB_API, window.location.origin);
    url.searchParams.set('action', action);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', url.toString());
    const t = getToken();
    if (t) xhr.setRequestHeader('Authorization', `Bearer ${t}`);
    // ห้ามตั้ง Content-Type เอง — เบราว์เซอร์ต้องใส่ boundary ให้

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100));
    };

    xhr.onload = () => {
      let data: any;
      try { data = JSON.parse(xhr.responseText); }
      catch {
        reject(new ApiError(`เซิร์ฟเวอร์ตอบกลับไม่ใช่ JSON (HTTP ${xhr.status})`, xhr.status));
        return;
      }
      if (xhr.status >= 400 || data?.status === 'error') {
        const err = new ApiError(data?.message ?? `อัปโหลดไม่สำเร็จ (HTTP ${xhr.status})`,
          xhr.status, data);
        if (xhr.status === 401) { clearExpiredToken(); onUnauthorized?.(err.message); }
        reject(err);
        return;
      }
      onProgress?.(100);
      resolve(data as T);
    };
    xhr.onerror = () => reject(new ApiError('เชื่อมต่อไม่ได้ระหว่างอัปโหลด', 0));
    xhr.onabort = () => reject(new ApiError('ยกเลิกการอัปโหลด', 0));
    xhr.send(form);
  });
}
