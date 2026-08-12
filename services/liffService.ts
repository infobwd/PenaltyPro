
import { Match, NewsItem, RegistrationData, KickResult, Team, Player, Tournament, Donation, TournamentPrize, ContestEntry } from '../types';
import { notifyUser } from './uiService';
import {
  FLEX, flexBubble, flexHeader, flexRow, flexTeamColumn, flexButton,
  truncate as cut, safeText, safeImage, safeUri,
} from './flexTheme';

declare global {
  interface Window {
    liff: any;
  }
}

/**
 * สถานะการเริ่มระบบ LINE
 *
 * ต้องเก็บไว้เพราะ `window.liff` มีอยู่ทันทีที่สคริปต์ของ LINE โหลดเสร็จ
 * แต่เรียกอะไรไม่ได้เลยจนกว่า init() จะสำเร็จ — ถ้าเผลอเรียก isLoggedIn()
 * ก่อนหน้านั้น SDK จะ throw แล้วฟังก์ชัน async จะ reject เงียบ ๆ
 * ผู้ใช้กดปุ่มแชร์แล้วไม่มีอะไรเกิดขึ้นและไม่มีข้อความบอกสาเหตุ
 */
type LiffState = 'idle' | 'ready' | 'no-sdk' | 'no-id' | 'failed';
let liffState: LiffState = 'idle';
let liffInitError = '';
let activeLiffId = '';
let liffInitPromise: Promise<void> | null = null;

export const getLiffState = (): { state: LiffState; error: string } =>
  ({ state: liffState, error: liffInitError });

export const initializeLiff = async (liffId?: string) => {
  if (!window.liff) { liffState = 'no-sdk'; return; }
  if (!liffId) {
    liffState = 'no-id';
    console.warn('ยังไม่ได้ตั้งค่า LIFF ID ในหน้าตั้งค่าระบบ');
    return;
  }
  activeLiffId = liffId;
  liffInitPromise = (async () => {
    try {
      await window.liff.init({ liffId });
      liffState = 'ready';
      liffInitError = '';
    } catch (error: any) {
      liffState = 'failed';
      liffInitError = error?.message ?? String(error);
      console.error('LIFF Init Failed', error);
    }
  })();
  await liffInitPromise;
};

const truncate = (str: string, length: number) => {
  if (!str) return "";
  if (str.length <= length) return str;
  return str.substring(0, length - 3) + "...";
};


/**
 * ส่งการ์ดเข้ากล่องแชร์ของ LINE
 *
 * รวมไว้ที่เดียวเพราะเดิมแต่ละฟังก์ชัน try/catch เองแล้วเช็คไม่ครบ —
 * บางที่ไม่ได้เช็คว่าเครื่องรองรับ shareTargetPicker ไหม ผู้ใช้กดแล้วเงียบ
 * โดยไม่มีอะไรบอกว่าทำไมไม่เกิดอะไรขึ้น
 */
const compactFlex = (altText: string) => ({
  type: 'bubble',
  size: 'kilo',
  body: {
    type: 'box', layout: 'vertical', spacing: 'md',
    contents: [
      { type: 'text', text: 'PENALTY PRO', size: 'xs', weight: 'bold', color: FLEX.brand },
      { type: 'text', text: cut(safeText(altText, 'Penalty Pro'), 220), size: 'md', weight: 'bold', color: FLEX.ink, wrap: true },
      { type: 'text', text: 'แตะเพื่อเปิดดูรายละเอียดในระบบ', size: 'xs', color: FLEX.muted, wrap: true },
      ...(window.location.origin.startsWith('https://') ? [{
        type: 'button', style: 'primary', height: 'sm', color: FLEX.brand,
        action: { type: 'uri', label: 'เปิด Penalty Pro', uri: window.location.origin },
      }] : []),
    ],
  },
});

const shareWithPicker = async (message: any): Promise<'success' | 'cancelled'> => {
  const result = await window.liff.shareTargetPicker([message], { isMultiple: true });
  return result?.status === 'success' ? 'success' : 'cancelled';
};

/**
 * ปรับ payload ก่อนส่งจริง เพราะ LINE ปฏิเสธทั้ง Flex หากมี text ว่างเพียงจุดเดียว
 * หรือมี URI ที่ไม่ใช่ https/line แม้ component อื่นทั้งหมดจะถูกต้อง
 */
const normalizeFlexPayload = (value: any): any => {
  if (Array.isArray(value)) return value.map(normalizeFlexPayload).filter(Boolean);
  if (!value || typeof value !== 'object') return value;

  const node: any = {};
  for (const [key, child] of Object.entries(value)) {
    if (child !== undefined && child !== null) node[key] = normalizeFlexPayload(child);
  }

  if (node.type === 'text' && typeof node.text === 'string' && node.text.trim() === '' && !node.contents) {
    node.text = '-';
  }
  if (node.action?.type === 'uri' && !safeUri(node.action.uri)) {
    delete node.action;
  }
  if (node.type === 'button' && !node.action) return null;
  if (Array.isArray(node.contents) && node.contents.length === 0 && node.type === 'box') {
    node.contents = [{ type: 'text', text: '-', size: 'xs', color: FLEX.faint }];
  }
  return node;
};

const sendFlex = async (altText: string, bubble: any): Promise<boolean> => {
  const cleanAltText = cut(safeText(altText, 'Penalty Pro'), 400);
  try {
    // ไม่มี SDK ของ LINE เลย (เปิดจากเบราว์เซอร์ปกติ) → ทางสำรอง
    if (!window.liff || typeof window.liff.shareTargetPicker !== 'function') {
      return shareFallback(cleanAltText);
    }

    // ผู้ใช้กดแชร์ระหว่างที่หน้าเพิ่งเปิดได้ โดยเฉพาะ LINE iOS WebView
    // ต้องรอ init ตัวเดียวกับหน้าแอปให้เสร็จ ไม่ยิง shareTargetPicker แข่งกับ init
    if (liffInitPromise) await liffInitPromise;

    // ⚠️ ห้ามใช้ liffState เป็นเงื่อนไขว่าจะแชร์ได้ไหม
    // เคยลองแล้วพัง: initializeLiff() ถูกเรียกเฉพาะตอนที่ตั้ง LIFF ID ไว้ในระบบ
    // ถ้ายังไม่ได้ตั้ง (หรือ init ยังไม่เสร็จตอนผู้ใช้กด) สถานะจะไม่เป็น 'ready'
    // แล้วปุ่มแชร์จะตกไปทางสำรองทุกครั้ง — แผงแชร์ของ LINE ไม่เคยเปิดเลย
    // ทั้งที่ SDK ใช้งานได้จริง จึงลองเรียกของจริงก่อนเสมอ แล้วค่อยสำรองตอนล้มเหลว

    // isLoggedIn() throw ได้ถ้า init ไม่สำเร็จ — จับไว้แล้วไปต่อ ไม่ปิดทางแชร์
    try {
      if (window.liff.isLoggedIn && !window.liff.isLoggedIn()) {
        window.liff.login();
        return false;
      }
    } catch { /* เช็คสถานะล็อกอินไม่ได้ ก็ลองแชร์ไปเลย */ }

    // ⚠️ ไม่ใช้ isApiAvailable เป็นตัวตัดสินว่าจะแชร์ได้ไหม
    // ของจริงมันคืน false ในหลายกรณีที่แชร์ได้จริง (เช่นเปิดจากห้องแชท
    // หรือ LIFF ที่ตั้ง scope ไม่ครบ) ถ้าเอามาบล็อกไว้ ปุ่มแชร์จะตายทั้งที่ใช้ได้
    // จึงลองยิงเลยแล้วค่อยจัดการตอนล้มเหลว
    const message = { type: 'flex', altText: cleanAltText, contents: normalizeFlexPayload(bubble) };
    const payloadBytes = new Blob([JSON.stringify(message)]).size;
    if (payloadBytes > 50000) {
      console.warn('Flex payload ใหญ่เกินค่าปลอดภัย ใช้การ์ดฉบับย่อ', { payloadBytes });
      message.contents = compactFlex(cleanAltText);
    }

    let pickerResult: 'success' | 'cancelled';
    try {
      pickerResult = await shareWithPicker(message);
    } catch (flexError) {
      // Flex ที่ซับซ้อนอาจถูก LINE บางเวอร์ชันปฏิเสธก่อนเปิด target picker
      // ลองการ์ดมาตรฐานที่ใช้เฉพาะ component พื้นฐานก่อน เพื่อให้ยังแชร์เป็น Flex ได้
      console.warn('Flex หลักถูกปฏิเสธ กำลังลอง Flex ฉบับย่อ', flexError);
      try {
        pickerResult = await shareWithPicker({
          type: 'flex', altText: cleanAltText, contents: compactFlex(cleanAltText),
        });
      } catch (compactError) {
        console.error('Flex ฉบับย่อถูกปฏิเสธ กำลังลองข้อความ LINE', compactError);
        try {
          pickerResult = await shareWithPicker({
            type: 'text', text: cut(`${cleanAltText}\n${window.location.origin}`, 4900),
          });
        } catch (textError) {
          throw textError;
        }
      }
    }

    // ผู้ใช้กดยกเลิกในหน้าเลือกผู้รับ — ไม่ใช่ข้อผิดพลาด ไม่ต้องแจ้งอะไร
    if (pickerResult === 'cancelled') return false;
    notifyUser('แชร์แล้ว', 'ส่งการ์ดเข้าแชทเรียบร้อย', 'success');
    return true;
  } catch (error: any) {
    const msg = String(error?.message ?? error ?? '');
    console.error('shareTargetPicker ล้มเหลว', error);

    // LINE ปิด share target picker ของ LIFF ตัวนี้ → บอกให้ชัดว่าต้องแก้ที่ Console
    if (/permission|scope|chat_message/i.test(msg)) {
      notifyUser('แชร์ไม่ได้',
        'กรุณาเปิด Share target picker ของ LIFF ใน LINE Developers Console แล้วลองใหม่', 'warning');
      return false;
    }
    // ใช้ระบบแชร์ของ LINE ไม่ได้ในสภาพแวดล้อมนี้ → ใช้ทางสำรอง
    notifyUser('แชร์ผ่าน LINE ไม่สำเร็จ', msg || 'กรุณาลองใหม่อีกครั้ง', 'warning');
    return shareFallback(cleanAltText);
  }
};

/**
 * ทางสำรองเมื่อแชร์ผ่าน LINE ไม่ได้ (เปิดจากเบราว์เซอร์ปกติ / LIFF ยังไม่พร้อม)
 *
 * เดิมกรณีนี้คือ "กดแล้วไม่เกิดอะไรขึ้น" ซึ่งผู้ใช้แยกไม่ออกจากระบบพัง
 * ตอนนี้ใช้ปุ่มแชร์ของเครื่อง (Android/iOS มีให้อยู่แล้ว) ถ้าไม่มีก็คัดลอกลิงก์ให้
 */
const shareFallback = async (text: string): Promise<boolean> => {
  const url = window.location.origin;
  const payload = `${text}
${url}`;

  try {
    if (navigator.share) {
      await navigator.share({ title: 'Penalty Pro Arena', text, url });
      return true;
    }
  } catch (e: any) {
    // ผู้ใช้กดยกเลิกแผงแชร์ของเครื่อง — เงียบไว้ ไม่ใช่ข้อผิดพลาด
    if (e?.name === 'AbortError') return false;
  }

  try {
    await navigator.clipboard.writeText(payload);
    notifyUser('คัดลอกแล้ว', 'วางลงแชทที่ต้องการได้เลย', 'success');
    return true;
  } catch {
    notifyUser('แชร์ไม่ได้',
      liffState === 'no-id'
        ? 'ยังไม่ได้ตั้งค่า LIFF ID ในหน้าตั้งค่าระบบ'
        : 'เปิดหน้านี้ผ่านแอป LINE เพื่อแชร์การ์ดเข้าแชท', 'warning');
    return false;
  }
};

/** ลิงก์กลับเข้าแอปผ่าน LIFF — ถ้ายังไม่ได้ตั้ง LIFF ID จะคืน null แล้วปุ่มจะไม่ถูกใส่ */
const liffLink = (query = ''): string | null => {
  const id = activeLiffId;
  return id ? `https://liff.line.me/${id}${query}` : null;
};


export const shareMatchSummary = async (
  match: Match, summary: string, teamAName: string, teamBName: string,
  competitionName: string = 'Penalty Pro Arena',
) => {
  const win = match.scoreA === match.scoreB ? 'draw' : (match.scoreA > match.scoreB ? 'A' : 'B');
  const bubble = flexBubble(
    flexHeader('MATCH REPORT · ผลการแข่งขัน', competitionName),
    [
      // สกอร์เป็นพระเอกของการ์ด — โลโก้สองข้าง ตัวเลขตรงกลาง
      {
        type: 'box', layout: 'horizontal', alignItems: 'center',
        contents: [
          flexTeamColumn(teamAName, (match as any).teamALogo),
          {
            type: 'box', layout: 'vertical', flex: 3, alignItems: 'center',
            contents: [
              {
                type: 'text', text: `${match.scoreA} - ${match.scoreB}`,
                size: 'xxl', weight: 'bold', align: 'center',
                color: FLEX.ink,
              },
              {
                type: 'text',
                text: win === 'draw' ? 'เสมอ' : `${cut(safeText(win === 'A' ? teamAName : teamBName), 14)} ชนะ`,
                size: 'xxs', align: 'center', color: FLEX.green, weight: 'bold', margin: 'sm',
              },
            ],
          },
          flexTeamColumn(teamBName, (match as any).teamBLogo),
        ],
      },
      { type: 'separator', margin: 'xl', color: FLEX.line },
      ...(safeText(match.roundLabel, '') !== '-' && match.roundLabel
        ? [flexRow('รอบ', match.roundLabel)] : []),
      ...(match.venue ? [flexRow('สนาม', match.venue)] : []),
      ...(summary && summary.trim() !== '' ? [{
        type: 'text', text: cut(summary, 220), wrap: true, size: 'sm',
        color: FLEX.muted, margin: 'lg',
      }] : []),
      ...flexButton('ดูรายละเอียดนัดนี้', liffLink(`?view=match_detail&id=${match.id}`)),
    ],
    { size: 'mega' },
  );
  return sendFlex(`ผลการแข่งขัน ${teamAName} ${match.scoreA}-${match.scoreB} ${teamBName}`, bubble);
};

export const sharePlayerCardFlex = async (player: Player, team: Team, stats: any) => {
  const statCell = (label: string, value: number) => ({
    type: 'box', layout: 'vertical', flex: 1, alignItems: 'center',
    contents: [
      { type: 'text', text: `${value ?? 0}`, size: 'lg', weight: 'bold', color: FLEX.gold, align: 'center' },
      { type: 'text', text: label, size: 'xxs', color: '#94A3B8', align: 'center' },
    ],
  });

  // การ์ดนักกีฬาใช้พื้นเข้มทั้งใบ ต่างจากการ์ดอื่นโดยตั้งใจ — เป็นของสะสม
  // ที่ผู้เล่นเอาไปอวด ไม่ใช่ประกาศทางการ จึงประกอบ bubble เองไม่ผ่าน flexBubble
  const bubble = {
    type: 'bubble',
    size: 'kilo',
    body: {
      type: 'box', layout: 'vertical', backgroundColor: '#0F172A', paddingAll: '18px',
      contents: [
        {
          type: 'box', layout: 'horizontal', alignItems: 'center',
          contents: [
            {
              type: 'box', layout: 'vertical', flex: 2,
              contents: [
                { type: 'text', text: `${stats?.ovr ?? 0}`, size: 'xxl', weight: 'bold', color: FLEX.gold },
                {
                  type: 'text',
                  text: cut(safeText(player.position, 'PLAYER').toUpperCase(), 10),
                  size: 'xxs', weight: 'bold', color: '#E2E8F0', letterSpacing: '1px',
                },
              ],
            },
            {
              type: 'image', url: safeImage(team.logoUrl), flex: 1,
              size: '44px', aspectMode: 'fit', align: 'end',
            },
          ],
        },
        {
          type: 'image', url: safeImage(player.photoUrl,
            'https://cdn-icons-png.flaticon.com/128/1077/1077114.png'),
          size: 'full', aspectMode: 'cover', aspectRatio: '1:1', margin: 'lg',
        },
        {
          type: 'text', text: cut(safeText(player.name, 'นักกีฬา'), 26),
          size: 'lg', weight: 'bold', color: FLEX.white, align: 'center',
          wrap: true, margin: 'lg',
        },
        {
          type: 'text',
          text: `${player.number ? `#${player.number} · ` : ''}${cut(safeText(team.name, ''), 24)}`,
          size: 'xs', color: '#94A3B8', align: 'center', margin: 'xs', wrap: true,
        },
        { type: 'separator', margin: 'lg', color: '#1E293B' },
        {
          type: 'box', layout: 'horizontal', margin: 'lg',
          contents: [statCell('PAC', stats?.pac), statCell('SHO', stats?.sho), statCell('PAS', stats?.pas)],
        },
        {
          type: 'box', layout: 'horizontal', margin: 'md',
          contents: [statCell('DRI', stats?.dri), statCell('DEF', stats?.def), statCell('PHY', stats?.phy)],
        },
        {
          type: 'text', text: 'PENALTY PRO OFFICIAL CARD',
          size: 'xxs', color: '#475569', align: 'center', margin: 'xl', letterSpacing: '2px',
        },
      ],
    },
  };
  return sendFlex(`การ์ดนักกีฬา: ${player.name} (${team.name})`, bubble);
};

export const shareRegistration = async (data: RegistrationData, teamId: string) => {
  const bubble = flexBubble(
    flexHeader('NEW ENTRY · ใบสมัครใหม่', data.schoolName, { color: FLEX.green, accent: '#A7F3D0' }),
    [
      flexRow('ผู้จัดการทีม', safeText(data.managerName, '-')),
      flexRow('เบอร์ติดต่อ', safeText(data.managerPhone || data.phone, '-'), { bold: true }),
      ...(data.coachName ? [flexRow('ผู้ฝึกสอน', data.coachName)] : []),
      flexRow('จำนวนนักกีฬา', `${(data.players ?? []).filter(pl => pl.name?.trim()).length} คน`),
      ...(data.district || data.province
        ? [flexRow('พื้นที่', [data.district, data.province].filter(Boolean).join(' · '))] : []),
      ...flexButton('ตรวจสอบและอนุมัติ', liffLink(`?view=admin&teamId=${teamId}`), FLEX.green),
    ],
  );
  return sendFlex(`ใบสมัครใหม่: ${data.schoolName}`, bubble);
};

export const shareNews = async (news: NewsItem) => {
  const bubble = flexBubble(
    flexHeader('NEWS · ข่าวประชาสัมพันธ์', news.title),
    [
      {
        type: 'text', text: cut(safeText(news.content, 'อ่านรายละเอียดในระบบ'), 260),
        wrap: true, size: 'sm', color: FLEX.muted,
      },
      ...(news.timestamp ? [flexRow('ประกาศเมื่อ',
        new Date(news.timestamp).toLocaleDateString('th-TH',
          { day: 'numeric', month: 'long', year: 'numeric' }))] : []),
      ...flexButton('อ่านข่าวฉบับเต็ม', liffLink('?view=news')),
    ],
    { size: 'mega' },
  );
  return sendFlex(`ข่าวสาร: ${news.title}`, bubble);
};

export const shareMatch = async (
  match: Match, teamAName: string, teamBName: string,
  teamALogo: string, teamBLogo: string,
) => {
  const isFinished = !!match.winner;
  const kickoff = match.scheduledTime || match.date;
  const when = kickoff
    ? new Date(kickoff).toLocaleString('th-TH',
        { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : '';

  const bubble = flexBubble(
    flexHeader(
      isFinished ? 'FULL TIME · จบการแข่งขัน' : 'FIXTURE · โปรแกรมแข่ง',
      safeText(match.roundLabel, 'นัดการแข่งขัน'),
      isFinished ? { color: FLEX.brandDark } : {},
    ),
    [
      {
        type: 'box', layout: 'horizontal', alignItems: 'center',
        contents: [
          flexTeamColumn(teamAName, teamALogo),
          {
            type: 'box', layout: 'vertical', flex: 3, alignItems: 'center', justifyContent: 'center',
            contents: [{
              type: 'text',
              text: isFinished ? `${match.scoreA} - ${match.scoreB}` : 'VS',
              size: isFinished ? 'xxl' : 'xl',
              weight: 'bold', align: 'center',
              color: isFinished ? FLEX.ink : FLEX.faint,
            }],
          },
          flexTeamColumn(teamBName, teamBLogo),
        ],
      },
      { type: 'separator', margin: 'xl', color: FLEX.line },
      ...(when ? [flexRow('วัน-เวลา', when, { bold: true })] : []),
      ...(match.venue ? [flexRow('สนาม', match.venue)] : []),
      ...flexButton(isFinished ? 'ดูผลการแข่งขัน' : 'ดูรายละเอียด',
        liffLink(`?view=match_detail&id=${match.id}`)),
    ],
    { size: 'mega' },
  );
  return sendFlex(
    isFinished
      ? `ผลบอล ${teamAName} ${match.scoreA}-${match.scoreB} ${teamBName}`
      : `โปรแกรมแข่ง ${teamAName} พบ ${teamBName}${when ? ` ${when}` : ''}`,
    bubble);
};

export const shareTournament = async (
  tournament: Tournament, teamCount: number = 0, maxTeams: number = 0,
) => {
  let cfg: any = {};
  try { cfg = tournament.config ? JSON.parse(tournament.config) : {}; } catch { cfg = {}; }

  const deadline = cfg.registrationDeadline
    ? new Date(cfg.registrationDeadline).toLocaleDateString('th-TH',
        { day: 'numeric', month: 'long', year: 'numeric' })
    : '';
  const isOpen = !cfg.registrationDeadline
    || new Date(cfg.registrationDeadline).getTime() > Date.now();
  const slots = maxTeams > 0 ? `${teamCount}/${maxTeams} ทีม` : `${teamCount} ทีม`;

  const bubble = flexBubble(
    flexHeader(isOpen ? 'OPEN · เปิดรับสมัคร' : 'CLOSED · ปิดรับสมัครแล้ว',
      tournament.name,
      isOpen ? {} : { color: '#475569', accent: '#CBD5E1' }),
    [
      flexRow('สมัครแล้ว', slots, { bold: true,
        valueColor: maxTeams > 0 && teamCount >= maxTeams ? FLEX.red : FLEX.green }),
      ...(deadline ? [flexRow(isOpen ? 'ปิดรับสมัคร' : 'ปิดเมื่อ', deadline)] : []),
      ...(cfg.registrationFee ? [flexRow('ค่าสมัคร',
        `${Number(cfg.registrationFee).toLocaleString()} บาท`)] : []),
      ...(cfg.locationName ? [flexRow('สนาม', cfg.locationName)] : []),
      ...(cfg.playersPerTeam ? [flexRow('ผู้เล่นต่อทีม',
        `${cfg.playersPerTeam} คน${cfg.maxSubs ? ` + สำรอง ${cfg.maxSubs}` : ''}`)] : []),
      ...(isOpen
        ? flexButton('สมัครเข้าแข่งขัน', liffLink(`?tournamentId=${tournament.id}`))
        : flexButton('ดูรายละเอียดรายการ', liffLink(`?tournamentId=${tournament.id}`), '#475569')),
    ],
    { size: 'mega' },
  );
  return sendFlex(`${isOpen ? 'เชิญสมัคร' : 'รายการแข่งขัน'}: ${tournament.name}`, bubble);
};

export const shareDonation = async (donation: Donation, tournamentName: string) => {
  const bubble = flexBubble(
    flexHeader('THANK YOU · อนุโมทนาบัตร', tournamentName,
      { color: FLEX.goldDark, accent: '#FDE68A' }),
    [
      {
        type: 'text', text: 'ขออนุโมทนาบุญกับ', size: 'xs',
        color: FLEX.muted, align: 'center',
      },
      {
        type: 'text', text: cut(safeText(donation.donorName, 'ผู้ไม่ประสงค์ออกนาม'), 40),
        size: 'lg', weight: 'bold', align: 'center', wrap: true,
        color: FLEX.ink, margin: 'sm',
      },
      {
        type: 'text', text: `${Number(donation.amount || 0).toLocaleString()} บาท`,
        size: 'xxl', weight: 'bold', align: 'center', color: FLEX.gold, margin: 'md',
      },
      { type: 'separator', margin: 'xl', color: FLEX.line },
      {
        type: 'text',
        text: 'ที่ร่วมสนับสนุนการแข่งขันกีฬาของนักเรียน',
        size: 'xxs', color: FLEX.faint, align: 'center', wrap: true, margin: 'lg',
      },
      ...flexButton('ร่วมสนับสนุนด้วย', liffLink('?view=donate'), FLEX.gold),
    ],
  );
  return sendFlex(`อนุโมทนาบัตร: ${donation.donorName} ${Number(donation.amount || 0).toLocaleString()} บาท`, bubble);
};

export const sharePrizeSummary = async (
  tournamentName: string, prizes: TournamentPrize[], teams: Team[],
) => {
  const rows = (prizes ?? []).slice(0, 8).map((pz, i) => {
    const winner = pz.winnerTeamId
      ? (teams.find(t => t.id === pz.winnerTeamId)?.name ?? '')
      : '';
    const medal = ['🥇', '🥈', '🥉'][i] ?? '🏅';
    return {
      type: 'box', layout: 'horizontal', margin: 'md', alignItems: 'center',
      contents: [
        { type: 'text', text: medal, size: 'sm', flex: 0 },
        {
          type: 'box', layout: 'vertical', flex: 5, margin: 'sm',
          contents: [
            {
              type: 'text', text: cut(safeText(pz.rankLabel, 'รางวัล'), 18),
              size: 'xs', color: FLEX.muted,
            },
            {
              type: 'text', text: cut(safeText(winner, 'ยังไม่ประกาศ'), 24),
              size: 'sm', weight: 'bold',
              color: winner ? FLEX.ink : FLEX.faint, wrap: true,
            },
          ],
        },
        // เงินรางวัลที่ยังไม่กำหนดต้อง "ไม่ใส่ node" ไม่ใช่ใส่ข้อความว่าง
        // เพราะ text ว่างแม้ช่องเดียวทำให้ LINE ไม่ส่งการ์ดทั้งใบโดยไม่แจ้งอะไรเลย
        ...(pz.amount && String(pz.amount).trim() !== '' ? [{
          type: 'text',
          text: `${Number(String(pz.amount).replace(/[^0-9.]/g, '') || 0).toLocaleString()} ฿`,
          size: 'xs', color: FLEX.gold, weight: 'bold', flex: 2, align: 'end', gravity: 'center',
        }] : []),
      ],
    };
  });

  const bubble = flexBubble(
    flexHeader('OFFICIAL RESULTS · ผลรางวัล', tournamentName,
      { color: FLEX.goldDark, accent: '#FDE68A' }),
    rows.length > 0
      ? [...rows, ...flexButton('ดูผลการแข่งขันทั้งหมด', liffLink('?view=standings'), FLEX.goldDark)]
      : [{
          type: 'text', text: 'ยังไม่มีการประกาศผลรางวัล',
          size: 'sm', color: FLEX.faint, align: 'center', margin: 'lg',
        }],
    { size: 'mega' },
  );
  return sendFlex(`ผลรางวัล: ${tournamentName}`, bubble);
};

export const shareGroupStandings = async (
  groupName: string, standings: any[], tournamentName: string = 'ตารางคะแนน',
) => {
  const head = {
    type: 'box', layout: 'horizontal', margin: 'md',
    contents: [
      { type: 'text', text: '#', size: 'xxs', color: FLEX.faint, flex: 1, weight: 'bold' },
      { type: 'text', text: 'ทีม', size: 'xxs', color: FLEX.faint, flex: 6, weight: 'bold' },
      { type: 'text', text: 'แข่ง', size: 'xxs', color: FLEX.faint, flex: 2, align: 'center', weight: 'bold' },
      { type: 'text', text: 'ได้-เสีย', size: 'xxs', color: FLEX.faint, flex: 3, align: 'center', weight: 'bold' },
      { type: 'text', text: 'คะแนน', size: 'xxs', color: FLEX.faint, flex: 3, align: 'end', weight: 'bold' },
    ],
  };

  const rows = (standings ?? []).slice(0, 10).map((t: any, i: number) => {
    // สองอันดับแรกเข้ารอบ — เน้นให้เห็นทันทีว่าใครอยู่ในโซนผ่าน
    const qualified = i < 2;
    return {
      type: 'box', layout: 'horizontal', margin: 'md', alignItems: 'center',
      contents: [
        {
          type: 'text', text: `${i + 1}`, size: 'xs', flex: 1, weight: 'bold',
          color: qualified ? FLEX.green : FLEX.faint,
        },
        {
          type: 'text', text: cut(safeText(t.teamName ?? t.name, 'ทีม'), 20),
          size: 'xs', flex: 6, weight: qualified ? 'bold' : 'regular',
          color: FLEX.ink, wrap: false,
        },
        { type: 'text', text: `${t.played ?? 0}`, size: 'xs', flex: 2, align: 'center', color: FLEX.muted },
        {
          type: 'text', text: `${t.goalsFor ?? 0}-${t.goalsAgainst ?? 0}`,
          size: 'xs', flex: 3, align: 'center', color: FLEX.muted,
        },
        {
          type: 'text', text: `${t.points ?? 0}`, size: 'sm', flex: 3, align: 'end',
          weight: 'bold', color: qualified ? FLEX.green : FLEX.ink,
        },
      ],
    };
  });

  const bubble = flexBubble(
    flexHeader(`STANDINGS · สาย ${safeText(groupName, '-')}`, tournamentName),
    rows.length > 0
      ? [
          head,
          { type: 'separator', margin: 'sm', color: FLEX.line },
          ...rows,
          {
            type: 'text', text: '● สองอันดับแรกเข้ารอบต่อไป',
            size: 'xxs', color: FLEX.green, margin: 'lg',
          },
          ...flexButton('ดูตารางคะแนนเต็ม', liffLink('?view=standings')),
        ]
      : [{
          type: 'text', text: 'ยังไม่มีผลการแข่งขันในสายนี้',
          size: 'sm', color: FLEX.faint, align: 'center', margin: 'lg',
        }],
    { size: 'giga' },
  );
  return sendFlex(`ตารางคะแนน สาย ${groupName} · ${tournamentName}`, bubble);
};

export const shareContestEntry = async (entry: ContestEntry, contestTitle: string) => {
  const link = liffLink('?view=contest');
  const photo = safeImage(entry.photoUrl, '');
  // ไม่มีรูปที่ใช้ได้ = ไม่ต้องแชร์ เพราะการ์ดประกวดภาพที่ไม่มีภาพก็ไม่มีความหมาย
  // (และถ้าใส่ URL เสียลงไป Flex จะไม่ส่งการ์ดเลยโดยไม่บอกสาเหตุ)
  if (photo === '') {
    notifyUser('แชร์ไม่ได้', 'ภาพนี้ยังอัปโหลดไม่สมบูรณ์', 'warning');
    return false;
  }

  const bubble = {
    type: 'bubble',
    size: 'mega',
    hero: {
      type: 'image', url: photo, size: 'full',
      aspectRatio: '1:1', aspectMode: 'cover',
      ...(link ? { action: { type: 'uri', uri: link } } : {}),
    },
    body: {
      type: 'box', layout: 'vertical', paddingAll: '16px',
      contents: [
        {
          type: 'text', text: cut(safeText(contestTitle, 'ประกวดภาพถ่าย'), 30),
          size: 'xxs', weight: 'bold', color: FLEX.brand, letterSpacing: '1px',
        },
        {
          type: 'text',
          text: cut(safeText(entry.caption, 'ร่วมโหวตให้ภาพนี้กันครับ'), 60),
          size: 'md', weight: 'bold', color: FLEX.ink, wrap: true, margin: 'sm',
        },
        {
          type: 'box', layout: 'horizontal', margin: 'lg', alignItems: 'center',
          contents: [
            {
              type: 'text', text: `♥ ${entry.likeCount ?? 0} โหวต`,
              size: 'sm', color: FLEX.red, weight: 'bold', flex: 0,
            },
            {
              type: 'text', text: cut(safeText(entry.userDisplayName, 'ผู้ส่งภาพ'), 20),
              size: 'xxs', color: FLEX.faint, align: 'end',
            },
          ],
        },
        ...flexButton('กดโหวตให้ภาพนี้', link, FLEX.brand),
      ],
    },
    footer: {
      type: 'box', layout: 'vertical', paddingAll: '12px', paddingTop: '0px',
      contents: [{
        type: 'text', text: 'Penalty Pro Arena · kickoff.bwd.ac.th',
        size: 'xxs', color: FLEX.faint, align: 'center',
      }],
    },
  };
  return sendFlex(`ร่วมโหวตภาพถ่าย: ${cut(safeText(entry.caption, contestTitle), 40)}`, bubble);
};

/**
 * ดึง ID token จาก LIFF เพื่อส่งให้ server ตรวจสอบ
 *
 * ระบบใหม่ไม่รับ `lineUserId` ที่ client ส่งมาตรง ๆ อีกแล้ว เพราะปลอมได้
 * (ใครก็ส่ง lineUserId ของแอดมินแล้วได้สิทธิ์แอดมิน) server จะ verify token นี้
 * กับเซิร์ฟเวอร์ LINE แล้วเชื่อเฉพาะ `sub` ที่ได้กลับมา
 */
export const getLineIdToken = (): string | null => {
  try {
    if (!window.liff || !window.liff.isLoggedIn()) return null;
    return window.liff.getIDToken() || null;
  } catch (e) {
    console.warn('getIDToken failed', e);
    return null;
  }
};
