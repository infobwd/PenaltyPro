import React, { useState } from 'react';
import { Lock, X, ArrowRight, Loader2, AlertTriangle } from 'lucide-react';
import { UserProfile } from '../types';
import { authenticateUser } from '../services/sheetService';
import { ApiError } from '../services/apiConfig';

/**
 * เข้าสู่ระบบผู้ดูแล
 *
 * เดิมเช็ครหัสแบบ hardcode ในไฟล์นี้ (`password === '1234'`) แล้วเปิดหน้าแอดมิน
 * ให้เลย โดยไม่คุยกับ server สักครั้ง ผลคือ UI บอกว่า "เข้าสู่ระบบแล้ว" แต่ไม่มี
 * token จริง พอกดบันทึกอะไรก็ได้ 401 กลับมาโดยผู้ใช้ไม่รู้ว่าเพราะอะไร
 *
 * ตอนนี้ล็อกอินจริงกับ API แล้วเก็บ token — ปุ่มที่กดได้ = ทำได้จริง
 */

interface LoginDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onLogin: (user: UserProfile) => void;
}

const LoginDialog: React.FC<LoginDialogProps> = ({ isOpen, onClose, onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError('กรุณากรอกชื่อผู้ใช้และรหัสผ่าน');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const user = await authenticateUser({
        authType: 'login', username: username.trim(), password,
      });
      if (!user) throw new Error('เข้าสู่ระบบไม่สำเร็จ');
      onLogin(user);
      onClose();
      setUsername(''); setPassword('');
    } catch (err) {
      const e2 = err as ApiError;
      setError(e2.message || 'เข้าสู่ระบบไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm modal-sheet flex items-end xl:items-center justify-center z-[1200] p-0 xl:p-4"
      onClick={onClose}>
      <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in duration-200"
        onClick={e => e.stopPropagation()}>
        <div className="p-6">
          <button onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:bg-slate-100">
            <X className="w-5 h-5" />
          </button>

          <div className="text-center">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Lock className="w-8 h-8 text-slate-500" />
            </div>
            <h2 className="text-xl font-bold text-slate-800 mb-1">เข้าสู่ระบบผู้ดูแล</h2>
            <p className="text-slate-500 text-sm mb-6">สำหรับผู้ดูแลระบบและโรงเรียนเจ้าภาพ</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-3">
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              placeholder="ชื่อผู้ใช้"
              className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none"
            />
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="current-password"
              placeholder="รหัสผ่าน"
              className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none"
            />

            {error && (
              <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 rounded-lg p-2.5">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <p className="text-xs text-rose-700">{error}</p>
              </div>
            )}

            <button type="submit" disabled={busy}
              className="w-full py-3 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-900 disabled:opacity-50 flex items-center justify-center gap-2">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
              เข้าสู่ระบบ
            </button>
          </form>

          <p className="text-[11px] text-slate-400 text-center mt-4 leading-relaxed">
            โรงเรียนที่ต้องการแก้ไขข้อมูลทีม ใช้ <b>รหัสโรงเรียน 8 ตัว</b> ที่หน้า “สำหรับโรงเรียน”
            ไม่ต้องใช้ชื่อผู้ใช้
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginDialog;
