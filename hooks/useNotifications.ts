import { useCallback, useEffect, useRef, useState } from 'react';
import { apiGet, apiPost, getToken, getTokenKind } from '../services/apiConfig';

/**
 * กล่องแจ้งเตือนในแอป
 *
 * วิธีอัปเดตข้อมูล เรียงตามความถูกต้อง/ต้นทุน:
 *   1. service worker ส่งข้อความมาเมื่อ push เข้า → รีเฟรชทันที (ตรงและฟรี)
 *   2. กลับมาโฟกัสที่แท็บ → เช็คจำนวนที่ยังไม่อ่าน
 *   3. poll ทุก 25 วินาที เป็นตาข่ายสุดท้าย เผื่อผู้ใช้ไม่ได้เปิด push
 *
 * poll ยิง endpoint ที่นับอย่างเดียว (เบามาก) แล้ว "ค่อยดึงรายการเมื่อจำนวนเพิ่ม"
 * เท่านั้น — ผู้ใช้ที่เปิดแอปค้างไว้จึงเห็นของใหม่เด้งขึ้นมาเองโดยไม่ต้องกดอะไร
 * และ shared hosting ก็ไม่ต้องรับภาระดึงรายการทุก 25 วินาทีตลอดวันแข่ง
 */

export interface NotificationItem {
  id: number;
  type: string;
  title: string;
  body: string | null;
  url: string | null;
  metadata: Record<string, any> | null;
  readAt: string | null;
  createdAt: string;
  isRead: boolean;
}

const PAGE_SIZE = 20;
const POLL_MS = 25_000;

/**
 * @param onNew เรียกเมื่อมีเรื่องใหม่เข้ามาขณะเปิดแอปอยู่ — ใช้เด้งข้อความให้เห็น
 *              เดิมมีแค่ตัวเลขบนกระดิ่งซึ่งผู้ใช้ไม่ได้จ้องอยู่ จึงไม่รู้ว่ามีของใหม่
 */
export function useNotifications(enabled: boolean, onNew?: (n: NotificationItem) => void) {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const offsetRef = useRef(0);
  // จำ id ล่าสุดที่เคยเห็น เพื่อรู้ว่าอันไหน "เพิ่งเข้ามา" ระหว่างเปิดแอปอยู่
  const seenTopIdRef = useRef<number | null>(null);
  const onNewRef = useRef(onNew);
  onNewRef.current = onNew;
  // จำนวนที่ยังไม่อ่านล่าสุด เก็บใน ref เพื่อเทียบได้โดยไม่ต้องพึ่ง state updater
  const countRef = useRef(0);

  const fetchList = useCallback(async (append = false) => {
    // ต้องเป็น session ของบัญชีเท่านั้น — ระหว่างอยู่หน้าโรงเรียนจะถือ team token
    // ซึ่งเรียก endpoint ของผู้ใช้ไม่ได้ ถ้ายิงไปจะได้ 401 แล้วเด้ง "เซสชันหมดอายุ"
    if (!enabled || !getToken() || getTokenKind() === 'team') return;
    if (!append) setLoading(true);
    setError(null);
    try {
      const offset = append ? offsetRef.current : 0;
      const r = await apiGet('getNotifications', { limit: PAGE_SIZE, offset }, { background: true });
      const list: NotificationItem[] = r.items ?? [];

      // มีของใหม่เข้ามาหลังจากที่เคยโหลดไปแล้ว → แจ้งให้เห็นทันที
      if (!append) {
        const prevTop = seenTopIdRef.current;
        if (prevTop !== null) {
          const fresh = list.filter(n => n.id > prevTop && !n.isRead);
          // เด้งเฉพาะอันล่าสุด ถ้ามาพร้อมกันหลายอันจะได้ไม่ท่วมจอ
          if (fresh.length > 0) onNewRef.current?.(fresh[0]);
        }
        if (list.length > 0) seenTopIdRef.current = list[0].id;
      }

      setItems(prev => (append ? [...prev, ...list] : list));
      countRef.current = r.unreadCount ?? 0;
      setUnreadCount(countRef.current);
      setTotal(r.total ?? 0);
      offsetRef.current = offset + (r.items?.length ?? 0);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  const fetchCount = useCallback(async () => {
    if (!enabled || !getToken() || getTokenKind() === 'team') return;
    try {
      const r = await apiGet('notificationCount', {}, { background: true });
      const n = r.unreadCount ?? 0;
      // เทียบกับค่าที่เก็บใน ref ไม่ใช่ใน state updater —
      // ตัว updater ถูกเรียกซ้ำได้ใน StrictMode ซึ่งจะทำให้ยิงโหลดรายการสองรอบ
      const grew = n > countRef.current;
      countRef.current = n;
      setUnreadCount(n);
      // จำนวนเพิ่มขึ้น = มีของใหม่ → ดึงรายการมาเพื่อเด้งให้เห็นและอัปเดตกล่อง
      if (grew) fetchList(false);
    } catch { /* เงียบไว้ — การนับพลาดไม่ควรรบกวนผู้ใช้ */ }
  }, [enabled, fetchList]);

  const markRead = useCallback(async (id: number) => {
    // ปรับหน้าจอก่อนแล้วค่อยยิง — การกดอ่านต้องรู้สึกทันที
    setItems(prev => prev.map(n =>
      n.id === id && !n.isRead ? { ...n, isRead: true, readAt: new Date().toISOString() } : n));
    countRef.current = Math.max(0, countRef.current - 1);
    setUnreadCount(countRef.current);
    try { await apiPost('readNotification', { id }); } catch { fetchCount(); }
  }, [fetchCount]);

  const markAllRead = useCallback(async () => {
    setItems(prev => prev.map(n => (n.isRead ? n : { ...n, isRead: true, readAt: new Date().toISOString() })));
    countRef.current = 0;
    setUnreadCount(0);
    try { await apiPost('readAllNotifications'); } catch { fetchCount(); }
  }, [fetchCount]);

  const remove = useCallback(async (id: number) => {
    const target = items.find(n => n.id === id);
    setItems(prev => prev.filter(n => n.id !== id));
    setTotal(t => Math.max(0, t - 1));
    if (target && !target.isRead) {
      countRef.current = Math.max(0, countRef.current - 1);
      setUnreadCount(countRef.current);
    }
    try { await apiPost('deleteNotification', { id }); } catch { fetchList(); }
  }, [items, fetchList]);

  const clearAll = useCallback(async () => {
    setItems([]); setUnreadCount(0); setTotal(0); countRef.current = 0;
    try { await apiPost('clearNotifications'); } catch { fetchList(); }
  }, [fetchList]);

  // โหลดครั้งแรก + poll
  useEffect(() => {
    if (!enabled) { setItems([]); setUnreadCount(0); setTotal(0); countRef.current = 0; return; }
    fetchList();
    const id = setInterval(fetchCount, POLL_MS);
    return () => clearInterval(id);
  }, [enabled, fetchList, fetchCount]);

  // push เข้ามา → รีเฟรชทันที
  useEffect(() => {
    if (!enabled || !('serviceWorker' in navigator)) return;
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'push-received') fetchList();
    };
    navigator.serviceWorker.addEventListener('message', handler);
    return () => navigator.serviceWorker.removeEventListener('message', handler);
  }, [enabled, fetchList]);

  // กลับมาที่แท็บ → เช็คจำนวนใหม่
  useEffect(() => {
    if (!enabled) return;
    const onFocus = () => fetchCount();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [enabled, fetchCount]);

  return {
    items, unreadCount, total, loading, error,
    refresh: () => fetchList(false),
    loadMore: () => fetchList(true),
    hasMore: items.length < total,
    markRead, markAllRead, remove, clearAll,
  };
}
