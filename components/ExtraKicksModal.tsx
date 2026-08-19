import React, { useState } from 'react';
import { Scale, Users, Minus, Plus, PlayCircle } from 'lucide-react';
import { Team } from '../types';

type Props = {
  teamA: Team;
  teamB: Team;
  scoreA: number;
  scoreB: number;
  /** ทีมที่แนะนำให้แตะก่อนในรอบนี้ — ค่าเริ่มต้นที่ตั้งไว้ กรรมการเปลี่ยนได้เสมอ */
  suggestedFirstTeam: 'A' | 'B';
  onConfirm: (firstTeam: 'A' | 'B', size: number) => void;
};

const SIZE_PRESETS = [1, 2, 3, 5];
const MAX_SIZE = 20;

/**
 * เสมอกันหลังแตะครบตามกำหนด (รอบปกติหรือรอบต่อเวลาก่อนหน้า)
 *
 * แทนที่จะสลับทีมแตะทีละคนไปเรื่อย ๆ อัตโนมัติแบบเดิม ให้กรรมการเลือกเองว่า
 * ทีมไหนแตะก่อนของรอบต่อเวลานี้ และจะแตะกี่คนต่อทีมก่อนจะกลับมาเช็กผลอีกครั้ง
 * ค่าเริ่มต้น 1 คน (sudden death มาตรฐาน) แต่ปรับเป็นชุดใหญ่กว่าได้ถ้าไม่อยากเด้ง
 * มาเลือกใหม่ทุกรอบ
 */
const ExtraKicksModal: React.FC<Props> = ({ teamA, teamB, scoreA, scoreB, suggestedFirstTeam, onConfirm }) => {
  const [firstTeam, setFirstTeam] = useState<'A' | 'B'>(suggestedFirstTeam);
  const [size, setSize] = useState(1);

  const clampSize = (v: number) => Math.min(MAX_SIZE, Math.max(1, v));

  return (
    <div className="w-full max-w-md mx-auto bg-white rounded-2xl shadow-lg overflow-hidden border border-gray-100 animate-in zoom-in duration-200">
      <div className="p-4 text-center bg-amber-500 text-white">
        <Scale className="w-7 h-7 mx-auto mb-1" />
        <p className="font-black text-lg">เสมอกัน {scoreA}-{scoreB}</p>
        <p className="text-xs text-amber-50 mt-0.5">ต้องแตะต่อ — เลือกทีมที่แตะก่อนและจำนวนคนของรอบนี้</p>
      </div>

      <div className="p-4 md:p-6 space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">ทีมที่แตะก่อน</label>
          <div className="grid grid-cols-2 gap-2">
            {([['A', teamA], ['B', teamB]] as const).map(([side, team]) => (
              <button key={side} onClick={() => setFirstTeam(side)}
                className={`rounded-xl border-2 p-3 flex flex-col items-center gap-1.5 transition
                  ${firstTeam === side ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                {team.logoUrl
                  ? <img src={team.logoUrl} alt="" className="w-10 h-10 object-contain" />
                  : <Users className="w-8 h-8 text-gray-300" />}
                <span className="text-xs font-black text-gray-900 text-center line-clamp-2">{team.name}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">จำนวนคนที่จะแตะรอบนี้ (ต่อทีม)</label>
          <div className="flex items-center gap-2">
            <button onClick={() => setSize(v => clampSize(v - 1))} aria-label="ลดจำนวนคน"
              className="w-11 h-11 rounded-xl border-2 border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-50 shrink-0">
              <Minus className="w-4 h-4" />
            </button>
            <input type="number" inputMode="numeric" min={1} max={MAX_SIZE} value={size}
              onChange={e => setSize(clampSize(parseInt(e.target.value, 10) || 1))}
              className="w-full h-11 text-center text-lg font-black border-2 border-gray-200 rounded-xl outline-none focus:border-indigo-500" />
            <button onClick={() => setSize(v => clampSize(v + 1))} aria-label="เพิ่มจำนวนคน"
              className="w-11 h-11 rounded-xl border-2 border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-50 shrink-0">
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <div className="flex gap-1.5 mt-2">
            {SIZE_PRESETS.map(n => (
              <button key={n} onClick={() => setSize(n)}
                className={`flex-1 h-8 rounded-lg text-xs font-bold transition
                  ${size === n ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {n} คน
              </button>
            ))}
          </div>
        </div>

        <button onClick={() => onConfirm(firstTeam, size)}
          className="w-full h-12 rounded-xl bg-emerald-600 text-white font-black text-sm
                     flex items-center justify-center gap-2 active:scale-95 transition">
          <PlayCircle className="w-5 h-5" /> เริ่มแตะต่อ
        </button>
      </div>
    </div>
  );
};

export default ExtraKicksModal;
