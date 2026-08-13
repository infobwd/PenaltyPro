import { Match } from '../types';
import { apiGet } from './apiConfig';

/**
 * กระดานผลสด — ข้อมูลชุดเล็กที่ยิงซ้ำได้ถี่
 *
 * ต่างจาก fetchDatabase (getData) ที่คืนทีม/นักกีฬา/ข่าว/บริจาคของทั้งระบบ
 * มาทั้งก้อนและแคชไว้ใน localStorage นาน 60 วินาที — ซึ่งใช้กับหน้าที่ต้อง
 * เห็นสกอร์ทันทีไม่ได้ ที่นี่คืนเฉพาะนัดที่กำลังเกิดขึ้นและไม่แคชฝั่งเว็บเลย
 *
 * ⚠️ ต้องไม่เก็บลง localStorage — ผลสดที่ค้างอยู่ในเครื่องคือผลที่ผิด
 * และไฟล์ cache ของ getData ก็จะโดนเขียนทับด้วยข้อมูลที่ไม่ครบ
 */

export type LiveBoard = {
  matches: Match[];
  /** ลายเซ็นของกระดานทั้งใบ — เท่าเดิมแปลว่าไม่มีอะไรเปลี่ยน */
  version: string;
  serverTime: string;
  /** กำลังแสดงนัดล่าสุดแทน เพราะไม่มีนัดไหนอยู่ในช่วงเวลาแข่ง */
  fallback: boolean;
};

export const EMPTY_BOARD: LiveBoard = {
  matches: [], version: '', serverTime: '', fallback: false,
};

/**
 * @param tournamentId ว่างคือทุกรายการ — หน้าที่เปิดจากลิงก์แชร์อาจยังไม่ได้เลือก
 */
export const fetchLiveBoard = async (tournamentId?: string): Promise<LiveBoard> => {
  // background: true — 401 ของคำขอที่แอปยิงเองต้องไม่เด้งผู้ใช้ออกจากระบบ
  // (endpoint นี้เปิดสาธารณะ แต่ token ที่หมดอายุอยู่ก็ยังถูกแนบไปด้วย)
  const r = await apiGet<any>('liveBoard', { tournamentId }, { background: true });
  return {
    matches: r.matches ?? [],
    version: r.version ?? '',
    serverTime: r.serverTime ?? '',
    fallback: r.fallback === true,
  };
};
