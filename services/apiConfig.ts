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

export const getToken = (): string | null => localStorage.getItem(TOKEN_KEY);
export const setToken = (t: string) => localStorage.setItem(TOKEN_KEY, t);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

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
    if (res.status === 401) {
      clearToken();
      onUnauthorized?.(err.message);
    }
    throw err;
  }
  return data as T;
}

export async function apiPost<T = any>(action: string, body: any = {}): Promise<T> {
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
    if (res.status === 401) {
      clearToken();
      onUnauthorized?.(err.message);
    }
    throw err;
  }
  return data as T;
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
    if (res.status === 401) { clearToken(); onUnauthorized?.(err.message); }
    throw err;
  }
  return data as T;
}
