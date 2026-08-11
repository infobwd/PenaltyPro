/**
 * ปลายทาง API และตัวช่วยเรียก
 *
 * ระบบกำลังย้ายจาก Google Apps Script -> PHP/MySQL ทีละส่วน
 * ช่วงเปลี่ยนผ่านจึงมี 2 ปลายทางอยู่พร้อมกัน:
 *
 *   DB_API   = PHP/MySQL  (ปลายทางใหม่ — ย้ายมาแล้วบางส่วน)
 *   LEGACY_API = Apps Script (ของเดิม — ส่วนที่ยังไม่ได้ย้าย)
 *
 * ⚠️ ข้อควรระวังระหว่างเปลี่ยนผ่าน: ส่วนที่ยัง "เขียน" ลง Apps Script จะไม่ไป
 * โผล่ในข้อมูลที่อ่านจาก MySQL จนกว่าจะย้ายเสร็จ — ดูรายการใน MIGRATION_STATUS
 */

const isDev = import.meta.env?.DEV === true;

export const DB_API =
  (import.meta.env?.VITE_API_URL as string | undefined)
  ?? (isDev ? 'http://127.0.0.1:8899/' : 'https://kickoff.bwd.ac.th/api/');

export const LEGACY_API =
  'https://script.google.com/macros/s/AKfycbztQtSLYW3wE5j-g2g7OMDxKL6WFuyUymbGikt990wn4gCpwQN_MztGCcBQJgteZQmvyg/exec';

/** action ที่ย้ายมา PHP/MySQL แล้ว — ที่เหลือยังวิ่งไป Apps Script */
export const MIGRATED_ACTIONS = new Set([
  'getData',
  'health',
  'auth',
  'login',
  'logout',
  'me',
  'teamLogin',
  'changePassword',
  'createTournament',
  'updateTournament',
  'deleteTournament',
  'setRegistrationWindow',
  // โรงเรียนและรหัสเข้าใช้งาน
  'issueAccessCodes',
  'regenerateAccessCode',
  'listSchools',
  // ทีม
  'cloneTeams',
  'myTeams',
  'saveTeam',
  'submitTeam',
  'reviewTeam',
]);

const TOKEN_KEY = 'penalty_pro_token';

export const getToken = (): string | null => localStorage.getItem(TOKEN_KEY);
export const setToken = (t: string) => localStorage.setItem(TOKEN_KEY, t);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

const authHeaders = (): Record<string, string> => {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
};

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly payload?: any) {
    super(message);
    this.name = 'ApiError';
  }
}

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
  const url = new URL(DB_API);
  url.searchParams.set('action', action);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
  }

  const res = await fetch(url.toString(), {
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
    throw new ApiError(data?.message ?? `คำขอล้มเหลว (HTTP ${res.status})`, res.status, data);
  }
  return data as T;
}

export async function apiPost<T = any>(action: string, body: any = {}): Promise<T> {
  const url = new URL(DB_API);
  url.searchParams.set('action', action);

  const res = await fetch(url.toString(), {
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
    throw new ApiError(data?.message ?? `คำขอล้มเหลว (HTTP ${res.status})`, res.status, data);
  }
  return data as T;
}
