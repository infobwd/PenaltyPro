import React, { useState } from 'react';
import { Lock, X, ArrowRight } from 'lucide-react';

interface LoginDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onLogin: () => void;
}

const LoginDialog: React.FC<LoginDialogProps> = ({ isOpen, onClose, onLogin }) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    // Mock password check
    if (password === '1234' || password === 'admin') {
      onLogin();
      onClose();
      setPassword('');
      setError(false);
    } else {
      setError(true);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[1200] p-4" onClick={onClose}>
      <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
        <div className="p-6 text-center">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Lock className="w-8 h-8 text-slate-500" />
            </div>
            <h2 className="text-xl font-bold text-slate-800 mb-1">เข้าสู่ระบบผู้ดูแล</h2>
            <p className="text-slate-500 text-sm mb-6">กรุณากรอกรหัสผ่านเพื่อจัดการระบบ</p>
            
            <form onSubmit={handleLogin}>
                <input 
                    type="password" 
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className={`w-full p-3 border rounded-lg text-center text-2xl tracking-widest font-mono focus:ring-2 focus:outline-none mb-2 ${error ? 'border-red-500 focus:ring-red-200' : 'border-slate-300 focus:ring-indigo-200'}`}
                    placeholder="PIN"
                    autoFocus
                />
                {error && <p className="text-red-500 text-xs mb-4">รหัสผ่านไม่ถูกต้อง</p>}
                
                <button type="submit" className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition flex items-center justify-center gap-2">
                    ยืนยัน <ArrowRight className="w-4 h-4" />
                </button>
            </form>
        </div>
        <div className="bg-slate-50 p-3 text-center">
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-sm">ยกเลิก</button>
        </div>
      </div>
    </div>
  );
};

export default LoginDialog;