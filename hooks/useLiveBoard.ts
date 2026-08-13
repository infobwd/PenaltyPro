import { useCallback, useEffect, useRef, useState } from 'react';
import { Match } from '../types';
import { fetchLiveBoard, LiveBoard, EMPTY_BOARD } from '../services/liveBoard';

/**
 * ดึงผลสดเองเป็นระยะ สำหรับหน้าที่ต้องเห็นสกอร์ทันทีที่กรรมการกดบันทึก
 *
 * สิ่งที่ตั้งใจให้เป็นแบบนี้:
 *
 *   - **หยุด poll เมื่อแท็บไม่ได้อยู่หน้าจอ** ผู้พากย์เปิดค้างไว้ทั้งวัน
 *     ถ้ายิงต่อตอนสลับไปแอปอื่นคือยิงเปล่าหลายพันครั้งต่อวัน แล้วกลับมาดู
 *     ก็ยังต้องรอรอบถัดไปอยู่ดี — จึงยิงทันทีตอนกลับมาแทน
 *
 *   - **ถอยห่างเมื่อเน็ตล่ม** สนามใช้เน็ตมือถือ พอสัญญาณหาย การยิงทุก 8 วินาที
 *     ต่อไปเรื่อย ๆ ไม่ได้ช่วยอะไรนอกจากกินแบตกับทำให้ log เต็ม
 *
 *   - **ไม่แตะ state ถ้าลายเซ็นเท่าเดิม** ส่วนใหญ่ของรอบ poll คือ "ไม่มีอะไร
 *     เปลี่ยน" ถ้า setState ทุกครั้ง React จะ re-render ทั้งหน้าทุก 8 วินาที
 *     เอฟเฟกต์ไฮไลต์ลูกใหม่จะกะพริบใหม่หมดโดยไม่มีเหตุ
 */

const POLL_MS = 8_000;
const POLL_MS_MAX = 60_000;

export type LiveBoardState = {
  matches: Match[];
  /** เวลาที่ข้อมูลชุดนี้เข้ามาจริง (เวลาเครื่องผู้ใช้) — ใช้บอก "อัปเดตเมื่อ x วินาทีที่แล้ว" */
  updatedAt: number | null;
  /** เปลี่ยนไปจากรอบก่อน — ให้หน้าจอรู้ว่าควรเล่นเอฟเฟกต์ */
  changedAt: number | null;
  loading: boolean;
  error: string | null;
  fallback: boolean;
  /** ดึงใหม่เดี๋ยวนี้ (ปุ่มรีเฟรชด้วยมือ) */
  refresh: () => void;
};

export function useLiveBoard(
  tournamentId: string | undefined,
  enabled = true,
): LiveBoardState {
  const [board, setBoard] = useState<LiveBoard>(EMPTY_BOARD);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [changedAt, setChangedAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const versionRef = useRef('');
  const delayRef = useRef(POLL_MS);
  const timerRef = useRef<number | null>(null);
  // กันคำขอที่ตอบช้าจากรอบก่อนมาทับข้อมูลใหม่กว่า (เกิดตอนเน็ตกระตุก)
  const seqRef = useRef(0);
  // เวลาที่ข้อมูลเข้ามาล่าสุด เก็บใน ref ด้วย เพื่อให้รอบที่ "ไม่มีอะไรเปลี่ยน"
  // ไม่ต้องแตะ state เลย — ดู setUpdatedAt ด้านล่าง
  const updatedAtRef = useRef<number | null>(null);

  /**
   * @param background รอบที่ตัว poll ยิงเอง — ห้ามขยับ loading
   *
   * ถ้าตั้ง loading ทุกรอบ หน้าจะ re-render สองครั้งทุก 8 วินาทีตลอดเวลา
   * ซึ่งลบล้างเหตุผลทั้งหมดที่เทียบ version ไว้ตั้งแต่แรก
   */
  const load = useCallback(async (background = true) => {
    if (!enabled) return;
    const seq = ++seqRef.current;
    if (!background) setLoading(true);
    try {
      const fresh = await fetchLiveBoard(tournamentId);
      if (seq !== seqRef.current) return;

      setError(prev => (prev === null ? prev : null));
      delayRef.current = POLL_MS;
      updatedAtRef.current = Date.now();

      // version เท่าเดิม = ไม่มีอะไรเปลี่ยน ไม่ต้อง re-render ทั้งหน้า
      if (fresh.version !== '' && fresh.version === versionRef.current) return;
      versionRef.current = fresh.version;
      setBoard(fresh);
      setUpdatedAt(updatedAtRef.current);
      setChangedAt(updatedAtRef.current);
    } catch (e) {
      if (seq !== seqRef.current) return;
      setError((e as Error).message);
      // ถอยห่างแบบทวีคูณ แต่ไม่เกินหนึ่งนาที — เน็ตกลับมาแล้วต้องไม่รอนานเกินไป
      delayRef.current = Math.min(delayRef.current * 2, POLL_MS_MAX);
    } finally {
      if (seq === seqRef.current && !background) setLoading(false);
    }
  }, [tournamentId, enabled]);

  // ── ตัว poll ────────────────────────────────────────────────────────────
  //
  // ตั้งเวลาใหม่หลังคำขอจบทุกครั้ง ไม่ใช่ setInterval — ไม่งั้นตอนเซิร์ฟเวอร์
  // ตอบช้ากว่าช่วงเวลาที่ตั้งไว้ คำขอจะซ้อนกันขึ้นเรื่อย ๆ จนถล่มตัวเอง
  useEffect(() => {
    if (!enabled) return;

    let stopped = false;
    // สายการวนที่ถือว่า "ตัวจริง" — ตัวปลุกด้านล่างเริ่มสายใหม่แล้วทิ้งสายเก่า
    // ถ้าไม่มีตัวนับนี้ การสลับแท็บไปมาระหว่างที่คำขอยังค้างอยู่จะได้สายซ้อนกัน
    // ทีละสาย แล้วความถี่ในการยิงจะเพิ่มเป็นทวีคูณโดยไม่มีใครสังเกต
    let chain = 0;

    const tick = async (mine: number) => {
      if (stopped || mine !== chain) return;
      if (!document.hidden) await load();
      if (stopped || mine !== chain) return;
      timerRef.current = window.setTimeout(() => void tick(mine), delayRef.current);
    };
    void tick(++chain);

    // กลับมาที่แท็บ/แอป → ดึงทันที ไม่ต้องรอรอบถัดไป
    const onWake = () => {
      if (document.hidden) return;
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      delayRef.current = POLL_MS;
      void tick(++chain);
    };
    document.addEventListener('visibilitychange', onWake);
    window.addEventListener('online', onWake);

    return () => {
      stopped = true;
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      document.removeEventListener('visibilitychange', onWake);
      window.removeEventListener('online', onWake);
    };
  }, [load, enabled]);

  const refresh = useCallback(() => {
    delayRef.current = POLL_MS;
    void load(false);
  }, [load]);

  return {
    matches: board.matches,
    updatedAt,
    changedAt,
    loading,
    error,
    fallback: board.fallback,
    refresh,
  };
}
