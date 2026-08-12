/**
 * ชุดออกแบบกลางสำหรับ Flex Message ที่แชร์เข้า LINE
 *
 * ที่ต้องมี: ของเดิมแต่ละที่เขียนโครง bubble แยกกันเอง สี ขนาดตัวอักษร และ
 * ระยะห่างจึงไม่ตรงกันสักอัน แชร์ออกไปแล้วเหมือนมาจากคนละระบบ
 * ที่นี่รวมเป็น "ส่วนประกอบ" ชุดเดียว ทุกการ์ดจึงหน้าตาเป็นตระกูลเดียวกัน
 *
 * ข้อจำกัดของ Flex ที่ต้องระวัง (ไม่มี error ให้เห็น แต่การ์ดจะไม่ขึ้นเลย):
 *   - รูปต้องเป็น https เท่านั้น ถ้าเป็น http หรือ URL เสีย ทั้งการ์ดจะพัง
 *   - ข้อความว่าง ("") ทำให้ทั้ง bubble ไม่ถูกส่ง ต้องกันไว้ทุกจุด
 *   - altText ยาวได้ไม่เกิน 400 ตัวอักษร
 *   - ปุ่ม uri ต้องเป็น https หรือ line:// เท่านั้น
 */

export const FLEX = {
  brand:      '#4338CA',   // indigo-700 — สีหลักของระบบ
  brandDark:  '#312E81',
  brandLight: '#EEF2FF',
  gold:       '#F59E0B',
  goldDark:   '#B45309',
  green:      '#059669',
  red:        '#DC2626',
  ink:        '#0F172A',   // ตัวอักษรหลัก
  muted:      '#64748B',   // ตัวอักษรรอง
  faint:      '#94A3B8',
  line:       '#E2E8F0',
  white:      '#FFFFFF',
} as const;

/** รูปสำรองเมื่อทีมไม่มีโลโก้ — ต้องมีเสมอ ไม่งั้น Flex ทั้งการ์ดไม่ขึ้น */
const FALLBACK_LOGO = 'https://cdn-icons-png.flaticon.com/128/1099/1099680.png';

export const truncate = (str: string | undefined | null, length: number): string => {
  const s = (str ?? '').toString().trim();
  if (s === '') return '';
  return s.length <= length ? s : s.substring(0, length - 1) + '…';
};

/** ข้อความที่ห้ามว่าง — Flex จะไม่ส่งการ์ดถ้ามี text ว่างแม้แต่ช่องเดียว */
export const safeText = (v: string | undefined | null, fallback = '-'): string => {
  const s = (v ?? '').toString().trim();
  return s === '' ? fallback : s;
};

/** URL รูปที่ Flex ยอมรับ (https เท่านั้น) */
export const safeImage = (url: string | undefined | null, fallback = FALLBACK_LOGO): string => {
  const u = (url ?? '').toString().trim();
  return u.startsWith('https://') ? u : fallback;
};

/** ลิงก์ที่ปุ่มกดได้ — คืน null ถ้าใช้ไม่ได้ ผู้เรียกจะได้ไม่ใส่ปุ่มมาเลย */
export const safeUri = (url: string | undefined | null): string | null => {
  const u = (url ?? '').toString().trim();
  return (u.startsWith('https://') || u.startsWith('line://')) ? u : null;
};

// ── ส่วนประกอบมาตรฐาน ─────────────────────────────────────────────────────

/**
 * แถบหัวการ์ด — พื้นสีเข้ม มีป้ายหมวดตัวเล็กและชื่อเรื่องตัวใหญ่
 * ทำให้ทุกการ์ดอ่านออกตั้งแต่แวบแรกว่าเป็นเรื่องอะไรของงานไหน
 */
export const flexHeader = (
  label: string,
  title: string,
  opts: { color?: string; accent?: string } = {},
) => ({
  type: 'box',
  layout: 'vertical',
  backgroundColor: opts.color ?? FLEX.brand,
  paddingAll: '16px',
  paddingBottom: '14px',
  contents: [
    {
      type: 'text',
      text: truncate(safeText(label, 'PENALTY PRO'), 30),
      size: 'xxs',
      weight: 'bold',
      color: opts.accent ?? '#C7D2FE',
    },
    {
      type: 'text',
      text: truncate(safeText(title, 'Penalty Pro'), 60),
      size: 'lg',
      weight: 'bold',
      color: FLEX.white,
      wrap: true,
      margin: 'xs',
    },
  ],
});

/** แถวข้อมูล "หัวข้อ — ค่า" ใช้ซ้ำในทุกการ์ดที่มีรายละเอียด */
export const flexRow = (
  label: string,
  value: string,
  opts: { valueColor?: string; bold?: boolean } = {},
) => ({
  type: 'box',
  layout: 'horizontal',
  margin: 'md',
  contents: [
    {
      type: 'text', text: truncate(safeText(label), 14), size: 'sm',
      color: FLEX.muted, flex: 2,
    },
    {
      type: 'text', text: truncate(safeText(value), 30), size: 'sm',
      color: opts.valueColor ?? FLEX.ink, flex: 3, align: 'end',
      weight: opts.bold ? 'bold' : 'regular', wrap: true,
    },
  ],
});

/** โลโก้ทีม + ชื่อ จัดกลางในคอลัมน์เดียว ใช้ทั้งฝั่งซ้ายและขวาของสกอร์ */
export const flexTeamColumn = (name: string, logoUrl?: string | null) => {
  // Do not inject a third-party fallback image. A URL that LINE cannot fetch can
  // make an otherwise valid Flex card appear blank in some WebView versions.
  const logo = safeImage(logoUrl, '');
  return {
    type: 'box',
    layout: 'vertical',
    flex: 2,
    alignItems: 'center',
    spacing: 'sm',
    contents: [
      ...(logo ? [{
        type: 'image',
        url: logo,
        size: 'xl',
        aspectMode: 'fit',
        aspectRatio: '1:1',
      }] : []),
      {
        type: 'text',
        text: truncate(safeText(name, 'ทีม'), 22),
        size: 'sm',
        weight: 'bold',
        color: FLEX.ink,
        align: 'center',
        wrap: true,
      },
    ],
  };
};

/** ปุ่มหลักของการ์ด — คืน array เพื่อให้ผู้เรียก spread ได้ และหายไปเองถ้าลิงก์ใช้ไม่ได้ */
export const flexButton = (label: string, uri: string | null | undefined,
                           color: string = FLEX.brand) => {
  const safe = safeUri(uri);
  if (!safe) return [];
  return [{
    type: 'button',
    style: 'primary',
    height: 'sm',
    color,
    margin: 'lg',
    action: { type: 'uri', label: truncate(safeText(label, 'ดูรายละเอียด'), 20), uri: safe },
  }];
};

/** ท้ายการ์ด — เส้นคั่นบาง ๆ กับชื่อระบบ ให้ทุกการ์ดจบเหมือนกัน */
export const flexFooter = (note?: string) => ({
  type: 'box',
  layout: 'vertical',
  paddingAll: '12px',
  paddingTop: '4px',
  contents: [
    { type: 'separator', color: FLEX.line },
    {
      type: 'text',
      text: truncate(safeText(note, 'Penalty Pro Arena · kickoff.bwd.ac.th'), 45),
      size: 'xxs',
      color: FLEX.faint,
      align: 'center',
      margin: 'md',
    },
  ],
});

/** ประกอบ bubble ให้ครบรูปแบบเดียวกันทุกใบ */
export const flexBubble = (
  header: any,
  bodyContents: any[],
  opts: { size?: 'nano' | 'micro' | 'kilo' | 'mega' | 'giga'; note?: string } = {},
) => ({
  type: 'bubble',
  size: opts.size ?? 'kilo',
  // Use LINE's native bubble sections. Keeping the header as a nested box in
  // body worked in the simulator, but has rendered as an empty card in some
  // older iOS/LIFF clients.
  header,
  body: {
    type: 'box',
    layout: 'vertical',
    paddingAll: '16px',
    spacing: 'md',
    contents: bodyContents.length > 0
      ? bodyContents
      : [{ type: 'text', text: '-', size: 'sm', color: FLEX.muted }],
  },
  footer: flexFooter(opts.note),
});
