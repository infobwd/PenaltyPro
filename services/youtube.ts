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
  opts: {
    autoplay?: boolean; muted?: boolean; loop?: boolean;
    /** ตัดช่วงที่จะเล่น (วินาที) — ใช้ตอนคลิปที่เจ้าภาพให้มายาวกว่าที่จอมีเวลาให้ */
    start?: number; end?: number;
    /** ซ่อนแถบควบคุม — สำหรับคลิปที่เล่นเป็นพื้นหลัง ไม่ได้ให้ใครกด */
    controls?: boolean;
  } = {},
): string => {
  const id = youTubeId(raw);
  if (id === '') return '';
  const q = new URLSearchParams({
    rel: '0',              // ไม่แนะนำคลิปช่องอื่นตอนจบ
    modestbranding: '1',
    playsinline: '1',      // iOS ไม่เด้งเป็นเต็มจอเอง
  });
  // ⚠️ autoplay ที่ไม่ mute ถูกเบราว์เซอร์บล็อกเงียบ ๆ ทุกตัว — บนจอโปรเจกเตอร์
  // อาการคือขึ้นจอดำค้างโดยไม่มีข้อความอะไรบอก จึงบังคับ mute ให้เลยเมื่อสั่ง autoplay
  if (opts.autoplay) { q.set('autoplay', '1'); q.set('mute', '1'); }
  else if (opts.muted) q.set('mute', '1');
  if (opts.loop) { q.set('loop', '1'); q.set('playlist', id); }
  if (opts.start !== undefined) q.set('start', String(Math.max(0, Math.floor(opts.start))));
  if (opts.end !== undefined) q.set('end', String(Math.max(1, Math.floor(opts.end))));
  if (opts.controls === false) q.set('controls', '0');
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
