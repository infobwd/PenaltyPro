
import React, { useState } from 'react';
import { KickResult, Player, Team } from '../types';
import { Loader2, Goal, XOctagon, Hand, User } from 'lucide-react';

interface PenaltyInterfaceProps {
  currentTurn: 'A' | 'B';
  team: Team;
  roster: Player[];
  onRecordResult: (player: string, result: KickResult) => void;
  isProcessing: boolean;
}

const PenaltyInterface: React.FC<PenaltyInterfaceProps> = ({ 
  currentTurn, 
  team,
  roster,
  onRecordResult,
  isProcessing 
}) => {
  const [playerInput, setPlayerInput] = useState('');
  const [selectedPlayerId, setSelectedPlayerId] = useState('');

  const handleRecord = (result: KickResult) => {
    let finalPlayerName = playerInput;
    
    if (roster.length > 0) {
        if (!selectedPlayerId) {
             alert("กรุณาเลือกนักเตะ");
             return;
        }
        const p = roster.find(x => x.id === selectedPlayerId);
        finalPlayerName = p ? `${p.name} (#${p.number})` : 'ไม่ระบุ';
    } else {
        if (!playerInput.trim()) {
            alert("กรุณากรอกชื่อหรือเบอร์เสื้อนักเตะ");
            return;
        }
    }

    onRecordResult(finalPlayerName, result);
    setPlayerInput(''); 
    setSelectedPlayerId('');
  };

  return (
    <div className="w-full max-w-md mx-auto bg-white rounded-2xl shadow-lg overflow-hidden border border-gray-100">
      <div 
        className="p-4 text-center text-white font-bold text-xl flex items-center justify-center gap-3 relative overflow-hidden"
        style={{ backgroundColor: team.color }}
      >
        {team.logoUrl && <img src={team.logoUrl} alt={team.name} className="w-10 h-10 object-contain bg-white rounded-full p-1" />}
        <span className="z-10 relative">ตาของทีม {team.name}</span>
      </div>

      <div className="p-4 md:p-6 space-y-6">
        
        {/* Player Selection */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">เลือกคนยิง</label>
          
          {roster.length > 0 ? (
             <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-48 overflow-y-auto p-1">
                {roster.map(p => (
                    <button
                        key={p.id}
                        onClick={() => setSelectedPlayerId(p.id)}
                        className={`flex flex-col items-center p-2 rounded-lg border transition active:scale-95 touch-manipulation ${selectedPlayerId === p.id ? 'ring-2 ring-indigo-500 border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:bg-gray-50'}`}
                    >
                        <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-200 mb-1 shrink-0">
                            {p.photoUrl ? (
                                <img src={p.photoUrl} alt={p.name} className="w-full h-full object-cover" />
                            ) : (
                                <User className="w-full h-full p-2 text-gray-400" />
                            )}
                        </div>
                        <span className="text-xs font-bold text-gray-900 truncate w-full text-center">#{p.number}</span>
                        <span className="text-[10px] text-gray-500 truncate w-full text-center leading-tight">{p.name}</span>
                    </button>
                ))}
             </div>
          ) : (
            <input
                type="text"
                value={playerInput}
                onChange={(e) => setPlayerInput(e.target.value)}
                placeholder="เช่น #10 เมสซี่"
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition"
                disabled={isProcessing}
            />
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