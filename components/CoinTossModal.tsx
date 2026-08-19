import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Coins, Dices, Users, X, ArrowRight, Hand } from 'lucide-react';
import { Team } from '../types';

type Props = {
  teamA: Team;
  teamB: Team;
  onConfirm: (firstKicker: 'A' | 'B') => void;
  onCancel: () => void;
};

const teamAccent = (t: Team, fallback: string) => {
  try {
    const parsed = JSON.parse(t.color || '');
    if (Array.isArray(parsed) && typeof parsed[0] === 'string') return parsed[0];
  } catch {}
  return /^#[0-9a-f]{3,8}$/i.test(t.color || '') ? t.color : fallback;
};

const SPIN_MS = 1450;

/**
 * เสี่ยงทายหัวก้อยหรือเลือกเองว่าทีมไหนแตะก่อน — แสดงก่อนเข้าหน้าบันทึกผลจุดโทษ
 *
 * ของเดิมทีม A แตะก่อนเสมอโดยไม่มีทางเลือก กรรมการหน้างานบางสนามต้องการเสี่ยงทายจริง
 * (โยนเหรียญ) บางสนามให้กัปตันสองทีมตกลงกันเอง แอปจึงรองรับทั้งสองทาง
 */
const CoinTossModal: React.FC<Props> = ({ teamA, teamB, onConfirm, onCancel }) => {
  const [mode, setMode] = useState<'toss' | 'manual'>('toss');
  const [spinning, setSpinning] = useState(false);
  const [spinDeg, setSpinDeg] = useState(0);
  const [result, setResult] = useState<'A' | 'B' | null>(null);
  // ทีมที่เลือก "หัว" — อีกทีมได้ "ก้อย" อัตโนมัติ เพราะมีแค่สองหน้าเหรียญ
  const [headsTeam, setHeadsTeam] = useState<'A' | 'B'>('A');
  const tailsTeam: 'A' | 'B' = headsTeam === 'A' ? 'B' : 'A';

  const colorA = teamAccent(teamA, '#2563eb');
  const colorB = teamAccent(teamB, '#e11d48');
  const teamOf = (side: 'A' | 'B') => (side === 'A' ? teamA : teamB);
  const colorOf = (side: 'A' | 'B') => (side === 'A' ? colorA : colorB);

  const switchMode = (next: 'toss' | 'manual') => {
    setMode(next);
    setResult(null);
    setSpinning(false);
  };

  const pickHeads = (side: 'A' | 'B') => {
    if (spinning || side === headsTeam) return;
    setHeadsTeam(side);
    setResult(null);   // สลับหัว/ก้อยแล้ว ผลเดิมอ้างอิงหน้าเหรียญที่เปลี่ยนไปแล้ว ต้องโยนใหม่
  };

  const doToss = () => {
    if (spinning) return;
    setResult(null);
    setSpinning(true);
    const landsHeads = Math.random() < 0.5;
    const winner: 'A' | 'B' = landsHeads ? headsTeam : tailsTeam;
    // เดินหน้าเสมอจากจุดหมุนล่าสุด ไม่ย้อนกลับ ให้เห็นเหรียญหมุนจริงทุกครั้งที่กดโยนใหม่
    const base = spinDeg - (spinDeg % 360);
    setSpinDeg(base + 1800 + (landsHeads ? 0 : 180));
    window.setTimeout(() => { setSpinning(false); setResult(winner); }, SPIN_MS);
  };

  const resultTeam = result === 'A' ? teamA : result === 'B' ? teamB : null;

  return createPortal(
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      style={{ zIndex: 2147483646 }} role="dialog" aria-modal="true" aria-label="เลือกทีมที่แตะก่อน">
      <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in duration-200">
        <div className="p-5 pb-3 text-center relative">
          <button onClick={onCancel} aria-label="ปิด"
            className="absolute right-3 top-3 p-1.5 rounded-full text-slate-400 hover:bg-slate-100">
            <X className="w-5 h-5" />
          </button>
          <h3 className="text-lg font-black text-slate-800">ใครแตะก่อน?</h3>
          <p className="text-xs text-slate-500 mt-0.5">เลือกก่อนเริ่มบันทึกผลการดวลจุดโทษ</p>
        </div>

        {/* แท็บ: เสี่ยงทายจริง หรือข้ามไปเลือกเอง */}
        <div className="mx-5 mb-3 grid grid-cols-2 gap-1.5 bg-slate-100 rounded-xl p-1">
          <button onClick={() => switchMode('toss')}
            className={`h-10 rounded-lg text-xs font-black flex items-center justify-center gap-1.5 transition
              ${mode === 'toss' ? 'bg-white shadow text-indigo-700' : 'text-slate-500'}`}>
            <Coins className="w-4 h-4" /> เสี่ยงทายหัวก้อย
          </button>
          <button onClick={() => switchMode('manual')}
            className={`h-10 rounded-lg text-xs font-black flex items-center justify-center gap-1.5 transition
              ${mode === 'manual' ? 'bg-white shadow text-indigo-700' : 'text-slate-500'}`}>
            <Hand className="w-4 h-4" /> เลือกเอง
          </button>
        </div>

        <div className="px-5 pb-2">
          {mode === 'toss' ? (
            <div className="flex flex-col items-center py-2">
              {/* เลือกก่อนว่าทีมไหนเลือก "หัว" — อีกทีมได้ "ก้อย" ให้เองโดยอัตโนมัติ */}
              <div className="w-full mb-4">
                <p className="text-[11px] font-bold text-slate-500 text-center mb-1.5">ใครเลือกหัว?</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {(['A', 'B'] as const).map(side => (
                    <button key={side} onClick={() => pickHeads(side)} disabled={spinning}
                      className={`h-10 rounded-lg text-xs font-bold border-2 transition truncate px-2
                        disabled:opacity-50 ${headsTeam === side
                          ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                          : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
                      {teamOf(side).name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="w-28 h-28" style={{ perspective: '600px' }}>
                <button onClick={doToss} disabled={spinning} aria-label="โยนเหรียญ"
                  className="relative w-full h-full rounded-full disabled:cursor-wait"
                  style={{
                    transformStyle: 'preserve-3d',
                    transform: `rotateY(${spinDeg}deg)`,
                    transition: `transform ${SPIN_MS}ms cubic-bezier(.2,.7,.3,1)`,
                  }}>
                  {/* หน้าหัว — ทีมที่เลือกไว้ */}
                  <div className="absolute inset-0 rounded-full flex flex-col items-center justify-center
                                  text-white shadow-lg border-4 border-white"
                    style={{ backgroundColor: colorOf(headsTeam), backfaceVisibility: 'hidden' }}>
                    {teamOf(headsTeam).logoUrl
                      ? <img src={teamOf(headsTeam).logoUrl} alt="" className="w-10 h-10 object-contain bg-white rounded-full p-1" />
                      : <Users className="w-8 h-8" />}
                    <span className="text-[10px] font-black mt-1">หัว</span>
                  </div>
                  {/* หน้าก้อย — อีกทีม */}
                  <div className="absolute inset-0 rounded-full flex flex-col items-center justify-center
                                  text-white shadow-lg border-4 border-white"
                    style={{ backgroundColor: colorOf(tailsTeam), backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}>
                    {teamOf(tailsTeam).logoUrl
                      ? <img src={teamOf(tailsTeam).logoUrl} alt="" className="w-10 h-10 object-contain bg-white rounded-full p-1" />
                      : <Users className="w-8 h-8" />}
                    <span className="text-[10px] font-black mt-1">ก้อย</span>
                  </div>
                </button>
              </div>

              <p className="text-[11px] text-slate-400 mt-3 text-center">
                {teamOf(headsTeam).name} = หัว · {teamOf(tailsTeam).name} = ก้อย
              </p>

              {!result && (
                <button onClick={doToss} disabled={spinning}
                  className="mt-3 px-5 h-11 rounded-xl bg-indigo-600 text-white font-black text-sm
                             disabled:opacity-50 flex items-center gap-2">
                  <Dices className="w-4 h-4" /> {spinning ? 'กำลังโยน...' : 'โยนเหรียญ'}
                </button>
              )}

              {result && !spinning && (
                <div className="mt-3 text-center animate-in zoom-in duration-300">
                  <p className="text-sm text-slate-500">ผลเสี่ยงทาย</p>
                  <p className="font-black text-indigo-700">{resultTeam?.name} ได้แตะก่อน</p>
                  <button onClick={doToss} className="text-[11px] text-slate-400 underline mt-1">
                    โยนใหม่
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 py-2">
              {([['A', teamA, colorA], ['B', teamB, colorB]] as const).map(([side, team, color]) => (
                <button key={side} onClick={() => setResult(side)}
                  className={`rounded-2xl border-2 p-3 flex flex-col items-center gap-1.5 transition
                    ${result === side ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:bg-slate-50'}`}>
                  <div className="w-14 h-14 rounded-full flex items-center justify-center text-white shrink-0"
                    style={{ backgroundColor: color }}>
                    {team.logoUrl
                      ? <img src={team.logoUrl} alt="" className="w-10 h-10 object-contain bg-white rounded-full p-1" />
                      : <Users className="w-7 h-7" />}
                  </div>
                  <span className="text-xs font-black text-slate-800 text-center line-clamp-2">{team.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 pt-2 border-t border-slate-100 flex gap-2">
          <button onClick={onCancel}
            className="px-4 h-11 rounded-xl border-2 border-slate-300 text-slate-600 font-bold text-sm">
            ยกเลิก
          </button>
          <button onClick={() => result && onConfirm(result)} disabled={!result}
            className="flex-1 h-11 rounded-xl bg-emerald-600 text-white font-black text-sm
                       disabled:opacity-40 flex items-center justify-center gap-2">
            เริ่มการแข่งขัน <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default CoinTossModal;
