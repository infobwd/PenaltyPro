
import React, { useState, useEffect } from 'react';
import { Lock, ArrowRight, X } from 'lucide-react';

interface PinDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  correctPin: string;
  title?: string;
}

const PinDialog: React.FC<PinDialogProps> = ({ isOpen, onClose, onSuccess, correctPin, title = "กรุณากรอกรหัส PIN" }) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setPin('');
      setError(false);
    }
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (String(pin).trim() === String(correctPin).trim()) {
      onSuccess();
      onClose();
    } else {
      setError(true);
      setPin('');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[1200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white w-full max-w-xs rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
        <div className="p-6 text-center">
          <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Lock className="w-6 h-6 text-indigo-600" />
          </div>
          <h3 className="text-lg font-bold text-slate-800 mb-1">{title}</h3>
          <p className="text-xs text-slate-500 mb-4">เพื่อความปลอดภัยในการเข้าถึง</p>
          
          <form onSubmit={handleSubmit}>
            <input 
              type="password" 
              inputMode="numeric"
              pattern="[0-9]*"
              value={pin}
              onChange={(e) => { setPin(e.target.value); setError(false); }}
              className={`w-full p-3 text-center text-2xl font-mono tracking-widest border rounded-xl focus:outline-none focus:ring-2 mb-2 ${error ? 'border-red-300 ring-red-100 bg-red-50' : 'border-slate-200 ring-indigo-100 focus:border-indigo-500'}`}
              placeholder="••••"
              autoFocus
              maxLength={6}
            />
            {error && <p className="text-red-500 text-xs mb-3 animate-pulse">รหัสไม่ถูกต้อง ลองใหม่</p>}
            
            <button 
              type="submit" 
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition flex items-center justify-center gap-2 shadow-lg shadow-indigo-200 active:scale-95"
            >
              ยืนยัน <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        </div>
        <div className="bg-slate-50 p-3 text-center border-t border-slate-100">
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xs font-medium">ยกเลิก</button>
        </div>
      </div>
    </div>
  );
};

export default PinDialog;
