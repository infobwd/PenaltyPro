/**
 * แปลงลิงก์ YouTube ที่ผู้ใช้วางมาแบบไหนก็ได้ ให้เป็นสิ่งที่เอาไปใช้ต่อได้
 *
 * เจ้าภาพจะก๊อปลิงก์มาจากหลายที่: ปุ่มแชร์บนมือถือได้ youtu.be, แถบที่อยู่บน
 * คอมได้ watch?v=, บางคนก๊อป embed code มาทั้งก้อน, ไลฟ์สดได้ /live/
 * ถ้าบังคับให้กรอกรูปแบบเดียวจะมีคนกรอกผิดแน่นอน แล้วคลิปไม่ขึ้นโดยไม่มีคำอธิบาย
 */

/** ดึงรหัสวิดีโอออกมา — คืน '' ถ้าไม่ใช่ลิงก์ YouTube */
export const youTubeId = (raw?: string): string => {
  const url = (raw ?? '').trim();
  if (url === '') return '';

  // วางรหัส 11 ตัวมาตรง ๆ ก็รับ
  if (/^[\w-]{11}$/.test(url)) return url;

  const patterns = [
    /youtu\.be\/([\w-]{11})/,
    /[?&]v=([\w-]{11})/,
    /\/embed\/([\w-]{11})/,
    /\/live\/([\w-]{11})/,
    /\/shorts\/([\w-]{11})/,
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m) return m[1];
  }
  return '';
};

/**
 * URL สำหรับฝัง iframe
 *
 * ใช้ youtube-nocookie.com — ผู้ชมส่วนใหญ่เป็นนักเรียนและผู้ปกครอง
 * ไม่มีเหตุผลที่ต้องปล่อยให้ตามรอยจากหน้าเว็บของโรงเรียน
 */
export const youTubeEmbed = (
  raw?: string,
  opts: { autoplay?: boolean; muted?: boolean; loop?: boolean } = {},
): string => {
  const id = youTubeId(raw);
  if (id === '') return '';
  const q = new URLSearchParams({
    rel: '0',              // ไม่แนะนำคลิปช่องอื่นตอนจบ
    modestbranding: '1',
    playsinline: '1',      // iOS ไม่เด้งเป็นเต็มจอเอง
  });
  if (opts.autoplay) q.set('autoplay', '1');
  if (opts.muted) q.set('mute', '1');
  if (opts.loop) { q.set('loop', '1'); q.set('playlist', id); }
  return `https://www.youtube-nocookie.com/embed/${id}?${q.toString()}`;
};

/** รูปปกจาก YouTube — ไม่ต้องให้เจ้าภาพอัปรูปปกเองอีกใบ */
export const youTubeThumb = (raw?: string): string => {
  const id = youTubeId(raw);
  return id === '' ? '' : `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
};

export const youTubeWatch = (raw?: string): string => {
  const id = youTubeId(raw);
  return id === '' ? '' : `https://www.youtube.com/watch?v=${id}`;
};
