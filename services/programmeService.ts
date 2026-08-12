import { AppSettings, Match, Player, Team, Tournament, TournamentConfig } from '../types';

/**
 * สร้างสูจิบัตรการแข่งขันเป็นหน้าเว็บสำหรับสั่งพิมพ์ / บันทึกเป็น PDF
 *
 * ทำไมเป็น HTML แล้วให้เบราว์เซอร์พิมพ์ ไม่ใช่ generate PDF เอง:
 *   - โฮสต์เป็น shared hosting ไม่มีไลบรารีทำ PDF ที่รองรับฟอนต์ไทยได้ดี
 *   - ไลบรารี PDF ฝั่งเบราว์เซอร์ต้องฝังฟอนต์ไทยเอง ไฟล์บวมหลายร้อย KB
 *     และตัดคำไทยผิดบ่อย (สระลอย วรรณยุกต์ซ้อน)
 *   - เบราว์เซอร์พิมพ์ด้วยฟอนต์ระบบ ตัดคำไทยถูก และเลือก "บันทึกเป็น PDF"
 *     ได้ในตัวทุกเครื่อง รวมถึงมือถือ
 *
 * เปิดในแท็บใหม่แล้วสั่ง print ให้เลย ครูจึงได้ไฟล์ทันทีโดยไม่ต้องตั้งค่าอะไร
 */

interface ProgrammeInput {
  tournament?: Tournament | null;
  config: AppSettings;
  teams: Team[];
  players: Player[];
  matches: Match[];
}

const esc = (v: unknown): string =>
  String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const thaiDate = (v?: string | null): string => {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });
};

const thaiTime = (v?: string | null): string => {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
};

const age = (birthDate?: string | null): string => {
  if (!birthDate) return '-';
  const d = new Date(birthDate);
  if (Number.isNaN(d.getTime())) return '-';
  const now = new Date();
  let a = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a--;
  return a >= 0 && a < 100 ? String(a) : '-';
};

export const buildProgrammeHtml = (input: ProgrammeInput): string => {
  const { tournament, config, teams, players, matches } = input;

  let cfg: TournamentConfig = {};
  try { cfg = tournament?.config ? JSON.parse(tournament.config) : {}; } catch { cfg = {}; }

  const title = tournament?.name || config.competitionName || 'สูจิบัตรการแข่งขัน';
  const logo = config.competitionLogo || '';

  // เอาเฉพาะทีมที่อนุมัติแล้ว — สูจิบัตรคือเอกสารทางการ ทีมที่ยังไม่ผ่านการ
  // ตรวจสอบไม่ควรอยู่ในนั้น (ของเดิมพิมพ์รวมหมดจนต้องมาขีดฆ่าทีหลัง)
  const approved = teams.filter(t => t.status === 'Approved' || t.status === 'Submitted');

  const byGroup = new Map<string, Team[]>();
  approved.forEach(t => {
    const g = t.group?.trim() || 'ยังไม่จัดสาย';
    if (!byGroup.has(g)) byGroup.set(g, []);
    byGroup.get(g)!.push(t);
  });
  const groups = [...byGroup.entries()].sort((a, b) => a[0].localeCompare(b[0], 'th'));

  const rosterOf = (teamId: string) =>
    players.filter(p => p.teamId === teamId)
      .sort((a, b) => (Number(a.number) || 999) - (Number(b.number) || 999));

  // ── ตารางแข่ง จัดกลุ่มตามวัน ────────────────────────────────────────
  const byDate = new Map<string, Match[]>();
  matches.forEach(m => {
    const raw = m.scheduledTime || m.date;
    const d = raw ? new Date(raw) : null;
    const key = d && !Number.isNaN(d.getTime())
      ? d.toISOString().slice(0, 10)
      : 'ยังไม่กำหนดวัน';
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key)!.push(m);
  });
  const dates = [...byDate.keys()].sort((a, b) => {
    if (a === 'ยังไม่กำหนดวัน') return 1;
    if (b === 'ยังไม่กำหนดวัน') return -1;
    return a.localeCompare(b);
  });

  const infoRows: [string, string][] = [
    ['สนามแข่งขัน', cfg.locationName || config.locationName || ''],
    ['วันแข่งขัน', dates.filter(d => d !== 'ยังไม่กำหนดวัน').map(thaiDate).join(' · ')],
    ['จำนวนทีม', `${approved.length} ทีม`],
    ['จำนวนนักกีฬา', `${players.filter(p => approved.some(t => t.id === p.teamId)).length} คน`],
    ['จำนวนนัด', `${matches.length} นัด`],
    ['ผู้เล่นต่อทีม', cfg.playersPerTeam
      ? `${cfg.playersPerTeam} คน${cfg.maxSubs ? ` (สำรอง ${cfg.maxSubs} คน)` : ''}` : ''],
  ].filter((row): row is [string, string] => row[1] !== '');

  const prizes = (cfg.prizes ?? []).filter(p => p.rankLabel);

  return `<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>สูจิบัตร ${esc(title)}</title>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  /* ขนาดกระดาษ A4 และระยะขอบสั่งจากตรงนี้ เบราว์เซอร์จะใช้เป็นค่าเริ่มต้น
     ในกล่องพิมพ์ ครูจึงไม่ต้องตั้งค่าอะไรเอง */
  @page { size: A4; margin: 14mm 12mm; }

  * { box-sizing: border-box; }
  body {
    font-family: 'Sarabun', 'Tahoma', sans-serif;
    color: #0f172a; margin: 0; padding: 18px;
    background: #f1f5f9; font-size: 13px; line-height: 1.5;
  }
  .paper {
    background: #fff; max-width: 210mm; margin: 0 auto;
    padding: 16mm 14mm; box-shadow: 0 10px 30px rgba(0,0,0,.12);
  }
  h1 { font-size: 24px; margin: 0 0 4px; }
  h2 {
    font-size: 16px; margin: 26px 0 10px; padding-bottom: 6px;
    border-bottom: 2px solid #4338ca; color: #312e81;
  }
  h3 { font-size: 13px; margin: 14px 0 6px; color: #4338ca; }
  table { width: 100%; border-collapse: collapse; margin-top: 6px; }
  th, td { border: 1px solid #cbd5e1; padding: 5px 7px; text-align: left; vertical-align: top; }
  th { background: #eef2ff; font-weight: 700; font-size: 12px; }
  td { font-size: 12px; }
  .cover { text-align: center; padding: 8mm 0 10mm; border-bottom: 3px double #4338ca; }
  .cover img { max-height: 90px; margin-bottom: 10px; }
  .cover .sub { color: #475569; font-size: 14px; }
  .info { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 18px; margin-top: 12px; }
  .info div { display: flex; gap: 8px; font-size: 12px; }
  .info b { color: #475569; min-width: 92px; font-weight: 600; }
  /* จอแคบ (ดูบนมือถือก่อนสั่งพิมพ์) สองคอลัมน์จะบีบจนคำแตกเป็นตัว ๆ
     บนกระดาษ A4 ยังใช้สองคอลัมน์เหมือนเดิมเพราะกว้างพอ */
  @media screen and (max-width: 640px) {
    body { padding: 8px; }
    .paper { padding: 10mm 6mm; }
    .info { grid-template-columns: 1fr; }
    h1 { font-size: 20px; }
    table { font-size: 11px; }
    th, td { padding: 4px 5px; }
    /* ตารางกว้างเกินจอให้เลื่อนในกรอบของตัวเอง ไม่ดันทั้งหน้าให้เลื่อนข้าง */
    .day table, .team-card table { display: block; overflow-x: auto; white-space: nowrap; }
  }
  .team-card { border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px 10px; margin-bottom: 10px; }
  .team-head { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
  .team-head .name { font-weight: 700; font-size: 14px; }
  .team-head .meta { font-size: 11px; color: #64748b; }
  .staff { font-size: 11px; color: #475569; margin-top: 2px; }
  .num { width: 42px; text-align: center; }
  .idx { width: 34px; text-align: center; color: #64748b; }
  .muted { color: #94a3b8; }
  .paper { padding-bottom: 26mm; }
  .sign { margin-top: 26px; display: flex; justify-content: space-around; text-align: center; font-size: 12px; }
  .sign div { width: 46%; }
  .sign .line { margin-top: 46px; border-top: 1px dotted #475569; padding-top: 5px; }

  /* หลีกเลี่ยงการตัดกลางตาราง/กลางการ์ดทีมเวลาขึ้นหน้าใหม่ */
  .team-card, table, .day { break-inside: avoid; page-break-inside: avoid; }
  h2 { break-after: avoid; page-break-after: avoid; }
  .page-break { break-before: page; page-break-before: always; }

  .toolbar {
    max-width: 210mm; margin: 0 auto 14px; display: flex; gap: 8px; justify-content: flex-end;
  }
  .toolbar button {
    font-family: inherit; font-size: 14px; font-weight: 700; cursor: pointer;
    border: 0; border-radius: 10px; padding: 10px 18px; background: #4338ca; color: #fff;
  }
  .toolbar .ghost { background: #fff; color: #334155; border: 1px solid #cbd5e1; }
  @media print {
    body { background: #fff; padding: 0; font-size: 12px; }
    .paper { box-shadow: none; max-width: none; padding: 0; }
    .toolbar { display: none; }
  }
</style>
</head>
<body>
<div class="toolbar">
  <button class="ghost" onclick="window.close()">ปิด</button>
  <button onclick="window.print()">พิมพ์ / บันทึกเป็น PDF</button>
</div>

<div class="paper">
  <div class="cover">
    ${logo ? `<img src="${esc(logo)}" alt="">` : ''}
    <h1>${esc(title)}</h1>
    <div class="sub">สูจิบัตรการแข่งขัน</div>
    ${cfg.locationName ? `<div class="sub" style="margin-top:6px">ณ ${esc(cfg.locationName)}</div>` : ''}
  </div>

  <div class="info">
    ${infoRows.map(([k, v]) => `<div><b>${esc(k)}</b><span>${esc(v)}</span></div>`).join('')}
  </div>

  ${prizes.length > 0 ? `
  <h2>รางวัลการแข่งขัน</h2>
  <table>
    <thead><tr><th style="width:34%">รางวัล</th><th style="width:26%">เงินรางวัล</th><th>หมายเหตุ</th></tr></thead>
    <tbody>
      ${prizes.map(pz => `<tr>
        <td>${esc(pz.rankLabel)}</td>
        <td>${pz.amount ? esc(pz.amount) + ' บาท' : '<span class="muted">-</span>'}</td>
        <td>${esc(pz.description || '')}</td>
      </tr>`).join('')}
    </tbody>
  </table>` : ''}

  <h2>การแบ่งสาย</h2>
  ${groups.length === 0 ? '<p class="muted">ยังไม่มีทีมเข้าแข่งขัน</p>' : `
  <table>
    <thead><tr><th style="width:22%">สาย</th><th>ทีมในสาย</th><th style="width:14%">จำนวน</th></tr></thead>
    <tbody>
      ${groups.map(([g, list]) => `<tr>
        <td><b>${esc(g === 'ยังไม่จัดสาย' ? g : 'สาย ' + g)}</b></td>
        <td>${list.map(t => esc(t.name)).join(' · ')}</td>
        <td>${list.length} ทีม</td>
      </tr>`).join('')}
    </tbody>
  </table>`}

  <h2>โปรแกรมการแข่งขัน</h2>
  ${dates.length === 0 ? '<p class="muted">ยังไม่มีการจัดตารางแข่ง</p>' : dates.map(d => {
    const list = byDate.get(d)!.sort((a, b) =>
      String(a.scheduledTime || a.date || '').localeCompare(String(b.scheduledTime || b.date || '')));
    return `<div class="day">
      <h3>${d === 'ยังไม่กำหนดวัน' ? 'ยังไม่กำหนดวัน' : esc(thaiDate(d))}</h3>
      <table>
        <thead><tr>
          <th class="idx">คู่</th><th style="width:15%">เวลา</th>
          <th>คู่แข่งขัน</th><th style="width:20%">รอบ / สาย</th><th style="width:16%">สนาม</th>
        </tr></thead>
        <tbody>
          ${list.map((m, i) => `<tr>
            <td class="idx">${i + 1}</td>
            <td>${esc(thaiTime(m.scheduledTime || m.date) || '-')}</td>
            <td>${esc(m.teamA)} <span class="muted">พบ</span> ${esc(m.teamB)}${
              m.winner ? ` <b>(${m.scoreA}-${m.scoreB})</b>` : ''}</td>
            <td>${esc(m.roundLabel || '-')}</td>
            <td>${esc(m.venue || '-')}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
  }).join('')}

  <h2 class="page-break">รายชื่อนักกีฬา</h2>
  ${groups.map(([g, list]) => `
    <h3>${esc(g === 'ยังไม่จัดสาย' ? g : 'สาย ' + g)}</h3>
    ${list.map(t => {
      const roster = rosterOf(t.id);
      return `<div class="team-card">
        <div class="team-head">
          <span class="name">${esc(t.name)}</span>
          <span class="meta">${roster.length} คน${t.shortName ? ` · ${esc(t.shortName)}` : ''}</span>
        </div>
        ${(t.managerName || t.coachName) ? `<div class="staff">
          ${t.managerName ? `ผู้จัดการทีม: ${esc(t.managerName)}` : ''}
          ${t.managerName && t.coachName ? ' · ' : ''}
          ${t.coachName ? `ผู้ฝึกสอน: ${esc(t.coachName)}` : ''}
        </div>` : ''}
        ${roster.length === 0
          ? '<div class="staff muted">ยังไม่ได้ส่งรายชื่อนักกีฬา</div>'
          : `<table>
              <thead><tr>
                <th class="idx">ที่</th><th class="num">เบอร์</th>
                <th>ชื่อ-สกุล</th><th style="width:16%">วันเกิด</th><th style="width:10%">อายุ</th>
              </tr></thead>
              <tbody>
                ${roster.map((pl, i) => `<tr>
                  <td class="idx">${i + 1}</td>
                  <td class="num">${esc(pl.number || '-')}</td>
                  <td>${esc(pl.name)}</td>
                  <td>${esc(pl.birthDate || '-')}</td>
                  <td class="num">${esc(age(pl.birthDate))}</td>
                </tr>`).join('')}
              </tbody>
            </table>`}
      </div>`;
    }).join('')}
  `).join('')}

  <div class="sign">
    <div><div class="line">ผู้จัดการแข่งขัน</div></div>
    <div><div class="line">ประธานจัดการแข่งขัน</div></div>
  </div>
</div>
</body>
</html>`;
};

/**
 * เปิดสูจิบัตรในแท็บใหม่
 *
 * คืน false เมื่อเบราว์เซอร์บล็อกป๊อปอัป — ผู้เรียกต้องบอกผู้ใช้ให้อนุญาต
 * ไม่งั้นกดปุ่มแล้วเงียบไปเฉย ๆ โดยไม่รู้ว่าเกิดอะไรขึ้น
 */
export const openProgramme = (input: ProgrammeInput): boolean => {
  const w = window.open('', '_blank');
  if (!w) return false;
  w.document.write(buildProgrammeHtml(input));
  w.document.close();
  return true;
};
