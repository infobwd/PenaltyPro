
import React, { useMemo, useState } from 'react';
import { Kick, KickResult, Player, Team } from '../types';
import { Loader2, Goal, XOctagon, Hand, User, UserRoundX, Check } from 'lucide-react';
import { notifyUser } from '../services/uiService';

interface PenaltyInterfaceProps {
  currentTurn: 'A' | 'B';
  team: Team;
  roster: Player[];
  /** ลูกที่ทีมนี้แตะไปแล้ว — ใช้ทำเครื่องหมายคนที่แตะแล้วในตัวเลือก ไม่ได้ห้ามเลือกซ้ำ
   *  (รอบต่อเวลาใช้คนเดิมซ้ำได้) แค่กันเลือกผิดคนเพราะจำไม่ได้ว่าใครแตะไปแล้ว */
  takenKicks?: Kick[];
  onRecordResult: (player: string, result: KickResult) => void;
  isProcessing: boolean;
}

/** ต้องตรงกับรูปแบบชื่อที่บันทึกตอนยิงจริง (ดู handleRecord ด้านล่าง) */
const formatPlayerLabel = (p: Player) => `${p.name} (#${p.number})`;

const PenaltyInterface: React.FC<PenaltyInterfaceProps> = ({
  currentTurn,
  team,
  roster,
  takenKicks = [],
  onRecordResult,
  isProcessing
}) => {
  const [selectedPlayerId, setSelectedPlayerId] = useState('');
  const takenLabels = useMemo(
    () => new Set(takenKicks.map(k => k.player).filter(Boolean)),
    [takenKicks]);
  const teamColor = (() => {
    try {
      const parsed = JSON.parse(team.color || '');
      if (Array.isArray(parsed) && typeof parsed[0] === 'string') return parsed[0];
    } catch {}
    return /^#[0-9a-f]{3,8}$/i.test(team.color || '') ? team.color : '#3730a3';
  })();

  const handleRecord = (result: KickResult) => {
    let finalPlayerName = '';
    
    if (roster.length > 0) {
        if (!selectedPlayerId) {
             notifyUser('ยังไม่ได้เลือกนักเตะ', 'กรุณาเลือกนักเตะก่อนบันทึกผล', 'warning');
             return;
        }
        const p = roster.find(x => x.id === selectedPlayerId);
        finalPlayerName = p ? `${p.name} (#${p.number})` : 'ไม่ระบุ';
    }

    onRecordResult(finalPlayerName, result);
    setSelectedPlayerId('');
  };

  return (
    <div className="w-full max-w-md mx-auto bg-white rounded-2xl shadow-lg overflow-hidden border border-gray-100">
      <div 
        className="p-4 text-center text-white font-bold text-xl flex items-center justify-center gap-3 relative overflow-hidden"
        style={{ backgroundColor: teamColor }}
      >
        <div className="absolute inset-0 bg-slate-950/55" aria-hidden="true" />
        {team.logoUrl && <img src={team.logoUrl} alt={team.name} className="w-10 h-10 object-contain bg-white rounded-full p-1 z-10 relative" />}
        <span className="z-10 relative text-white drop-shadow-[0_2px_3px_rgba(0,0,0,0.9)]">ตาของทีม {team.name}</span>
      </div>

      <div className="p-4 md:p-6 space-y-6">
        
        {/* Player Selection */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">
            {roster.length > 0 ? 'เลือกคนยิง' : 'ผู้ยิง'}
          </label>
          
          {roster.length > 0 ? (
             <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-48 overflow-y-auto p-1">
                {roster.map(p => {
                    const taken = takenLabels.has(formatPlayerLabel(p));
                    return (
                    <button
                        key={p.id}
                        onClick={() => setSelectedPlayerId(p.id)}
                        title={taken ? `${p.name} แตะไปแล้ว — เลือกซ้ำได้ถ้าเป็นรอบต่อเวลา` : undefined}
                        className={`relative flex flex-col items-center p-2 rounded-lg border transition active:scale-95 touch-manipulation ${selectedPlayerId === p.id ? 'ring-2 ring-indigo-500 border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:bg-gray-50'}`}
                    >
                        <div className={`w-10 h-10 rounded-full overflow-hidden bg-gray-200 mb-1 shrink-0 ${taken ? 'opacity-60' : ''}`}>
                            {p.photoUrl ? (
                                <img src={p.photoUrl} alt={p.name} className="w-full h-full object-cover" />
                            ) : (
                                <User className="w-full h-full p-2 text-gray-400" />
                            )}
                        </div>
                        {/* แตะไปแล้ว — บอกเฉย ๆ ไม่ห้ามเลือกซ้ำ เพราะรอบต่อเวลาใช้คนเดิมซ้ำได้ */}
                        {taken && (
                            <span className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-emerald-500
                                              text-white flex items-center justify-center shadow">
                                <Check className="w-2.5 h-2.5" strokeWidth={3} />
                            </span>
                        )}
                        <span className={`text-xs font-bold truncate w-full text-center ${taken ? 'text-gray-400' : 'text-gray-900'}`}>#{p.number}</span>
                        <span className={`text-[10px] truncate w-full text-center leading-tight ${taken ? 'text-gray-400' : 'text-gray-500'}`}>{p.name}</span>
                    </button>
                    );
                })}
             </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3
                            flex items-start gap-3 text-left">
              <UserRoundX className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-slate-700">ทีมนี้ยังไม่มีรายชื่อนักกีฬา</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  กดผลการยิงได้ทันที ระบบจะบันทึกโดยไม่ระบุชื่อผู้ยิง
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons - Mobile Optimized */}
        <div className="grid grid-cols-3 gap-3">
          <button
            onClick={() => handleRecord(KickResult.GOAL)}
            disabled={isProcessing}
            className="flex flex-col items-center justify-center p-4 rounded-xl bg-green-50 hover:bg-green-100 border-2 border-green-200 text-green-700 transition active:scale-95 disabled:opacity-50 touch-manipulation min-h-[100px]"
          >
            <Goal className="w-8 h-8 mb-2" />
            <span className="font-bold text-sm">เข้าประตู</span>
          </button>

          <button
            onClick={() => handleRecord(KickResult.SAVED)}
            disabled={isProcessing}
            className="flex flex-col items-center justify-center p-4 rounded-xl bg-orange-50 hover:bg-orange-100 border-2 border-orange-200 text-orange-700 transition active:scale-95 disabled:opacity-50 touch-manipulation min-h-[100px]"
          >
            <Hand className="w-8 h-8 mb-2" />
            <span className="font-bold text-sm">เซฟได้</span>
          </button>

          <button
            onClick={() => handleRecord(KickResult.MISSED)}
            disabled={isProcessing}
            className="flex flex-col items-center justify-center p-4 rounded-xl bg-red-50 hover:bg-red-100 border-2 border-red-200 text-red-700 transition active:scale-95 disabled:opacity-50 touch-manipulation min-h-[100px]"
          >
            <XOctagon className="w-8 h-8 mb-2" />
            <span className="font-bold text-sm">ยิงพลาด</span>
          </button>
        </div>

        {isProcessing && (
          <div className="flex items-center justify-center text-gray-500 text-sm animate-pulse">
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            กำลังบันทึก...
          </div>
        )}
      </div>
    </div>
  );
};

export default PenaltyInterface;
