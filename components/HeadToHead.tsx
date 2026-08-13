import React, { useMemo } from 'react';
import { History, Trophy } from 'lucide-react';
import { Match, Team } from '../types';
import { headToHead, recentForm } from '../services/headToHead';

/**
 * สถิติการเจอกันของสองทีม — แบบที่เห็นก่อนเริ่มรายการถ่ายทอดสด
 *
 * นับข้ามรายการแข่งขันโดยยึด "โรงเรียน" ไม่ใช่ทีม เพราะทีมเป็นของแต่ละปี
 * โรงเรียนเดิมที่ลงแข่งปีนี้กับปีที่แล้วคือคนละ team_id กัน
 */

type Props = {
  teamA?: Team | null;
  teamB?: Team | null;
  matches: Match[];
  teams: Team[];
  /** นัดที่กำลังดูอยู่ — ไม่นับตัวเองเป็นประวัติ */
  currentMatchId?: string;
  /** โทนเข้ม (จอถ่ายทอด/หน้าบันทึกผล) หรือโทนสว่าง (การ์ดในหน้าปกติ) */
  dark?: boolean;
  className?: string;
};

const FORM_STYLE = {
  win:  { light: 'bg-emerald-500 text-white', dark: 'bg-emerald-500 text-white', text: 'ช' },
  loss: { light: 'bg-rose-500 text-white',    dark: 'bg-rose-500 text-white',    text: 'พ' },
  draw: { light: 'bg-slate-400 text-white',   dark: 'bg-slate-500 text-white',   text: 'ส' },
} as const;

const FormRow: React.FC<{ form: ('win' | 'loss' | 'draw')[]; dark?: boolean }> = ({ form, dark }) => (
  <div className="flex gap-1">
    {form.length === 0
      ? <span className={`text-[11px] ${dark ? 'text-slate-500' : 'text-slate-400'}`}>ยังไม่มีประวัติ</span>
      : form.map((f, i) => (
          <span key={i}
            className={`w-5 h-5 rounded text-[10px] font-black flex items-center justify-center
                        ${dark ? FORM_STYLE[f].dark : FORM_STYLE[f].light}`}
            title={f === 'win' ? 'ชนะ' : f === 'loss' ? 'แพ้' : 'เสมอ'}>
            {FORM_STYLE[f].text}
          </span>
        ))}
  </div>
);

const HeadToHead: React.FC<Props> = ({
  teamA, teamB, matches, teams, currentMatchId, dark = false, className = '',
}) => {
  const h2h = useMemo(
    () => headToHead(teamA?.id, teamB?.id, matches, teams, currentMatchId),
    [teamA?.id, teamB?.id, matches, teams, currentMatchId]);

  const formA = useMemo(
    () => recentForm(teamA?.id, matches, teams, 5, currentMatchId),
    [teamA?.id, matches, teams, currentMatchId]);
  const formB = useMemo(
    () => recentForm(teamB?.id, matches, teams, 5, currentMatchId),
    [teamB?.id, matches, teams, currentMatchId]);

  if (!teamA || !teamB) return null;

  const box = dark
    ? 'bg-white/[0.06] border-white/10 text-white'
    : 'bg-white border-slate-200 text-slate-900';
  const sub = dark ? 'text-slate-400' : 'text-slate-500';

  // ไม่เคยเจอกันเลยก็ยังมีประโยชน์ — ฟอร์มล่าสุดของแต่ละทีมยังบอกอะไรได้
  const neverMet = h2h.played === 0;

  return (
    <div className={`rounded-2xl border p-4 ${box} ${className}`}>
      <p className={`text-xs font-black flex items-center gap-1.5 ${sub}`}>
        <History className="w-4 h-4" /> สถิติการเจอกัน
      </p>

      {neverMet ? (
        <p className={`text-sm mt-2 ${sub}`}>
          ยังไม่เคยเจอกันในรายการที่ผ่านมา — นี่คือนัดแรกของสองโรงเรียนนี้
        </p>
      ) : (
        <>
          <div className="flex items-center gap-3 mt-3">
            <div className="flex-1 text-center">
              <p className="text-3xl font-black tabular-nums text-emerald-500">{h2h.wins}</p>
              <p className={`text-[11px] ${sub} truncate`}>{teamA.name} ชนะ</p>
            </div>
            <div className="text-center shrink-0">
              <p className="text-2xl font-black tabular-nums">{h2h.draws}</p>
              <p className={`text-[11px] ${sub}`}>เสมอ</p>
            </div>
            <div className="flex-1 text-center">
              <p className="text-3xl font-black tabular-nums text-rose-500">{h2h.losses}</p>
              <p className={`text-[11px] ${sub} truncate`}>{teamB.name} ชนะ</p>
            </div>
          </div>

          {/* แถบสัดส่วน อ่านผลรวมได้ในแวบเดียวโดยไม่ต้องคิดเลข */}
          <div className={`flex h-2 rounded-full overflow-hidden mt-3 ${dark ? 'bg-white/10' : 'bg-slate-100'}`}>
            {(['wins', 'draws', 'losses'] as const).map(k => (
              h2h[k] > 0 && (
                <div key={k}
                  className={k === 'wins' ? 'bg-emerald-500' : k === 'draws' ? 'bg-slate-400' : 'bg-rose-500'}
                  style={{ width: `${(h2h[k] / h2h.played) * 100}%` }} />
              )
            ))}
          </div>

          <p className={`text-[11px] mt-2 ${sub}`}>
            เจอกัน {h2h.played} นัด · ประตูรวม {h2h.goalsFor} – {h2h.goalsAgainst}
          </p>
        </>
      )}

      {/* ฟอร์มล่าสุด — "เจอกัน 3 ครั้ง ชนะ 2" อย่างเดียวยังไม่พอ
          ถ้าอีกทีมกำลังฟอร์มดีมากในรายการนี้ ตัวเลขในอดีตจะหลอกตา */}
      <div className={`mt-3 pt-3 border-t space-y-2 ${dark ? 'border-white/10' : 'border-slate-100'}`}>
        {[{ t: teamA, f: formA }, { t: teamB, f: formB }].map(({ t, f }) => (
          <div key={t.id} className="flex items-center gap-2">
            <span className="text-xs font-bold truncate flex-1 min-w-0">{t.name}</span>
            <FormRow form={f} dark={dark} />
          </div>
        ))}
        <p className={`text-[10px] ${sub}`}>ฟอร์ม 5 นัดล่าสุด (ใหม่ไปเก่า) · ช=ชนะ ส=เสมอ พ=แพ้</p>
      </div>

      {/* นัดที่เคยเจอกัน — ดูได้ว่าแต่ละครั้งผลเป็นยังไง */}
      {h2h.recent.length > 0 && (
        <div className={`mt-3 pt-3 border-t ${dark ? 'border-white/10' : 'border-slate-100'}`}>
          <p className={`text-[11px] font-bold mb-1.5 ${sub}`}>นัดที่เคยเจอกัน</p>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {h2h.recent.slice(0, 8).map(r => (
              <div key={r.match.id} className="flex items-center gap-2 text-xs">
                <span className={`w-5 h-5 rounded shrink-0 text-[10px] font-black flex items-center justify-center
                                  ${dark ? FORM_STYLE[r.outcome].dark : FORM_STYLE[r.outcome].light}`}>
                  {FORM_STYLE[r.outcome].text}
                </span>
                <span className="font-black tabular-nums shrink-0">{r.goalsFor}–{r.goalsAgainst}</span>
                <span className={`truncate flex-1 min-w-0 ${sub}`}>
                  {r.match.roundLabel || 'ไม่ระบุรอบ'}
                </span>
                <span className={`text-[10px] shrink-0 ${sub}`}>
                  {r.match.date || r.match.scheduledTime
                    ? new Date(r.match.date || r.match.scheduledTime!)
                        .toLocaleDateString('th-TH', { month: 'short', year: '2-digit' })
                    : ''}
                </span>
              </div>
            ))}
          </div>
          {h2h.recent.length > 8 && (
            <p className={`text-[10px] mt-1 ${sub}`}>และอีก {h2h.recent.length - 8} นัด</p>
          )}
        </div>
      )}
    </div>
  );
};

export default HeadToHead;
