import React, { useState } from 'react';
import { Lock, Loader2, ArrowRight, AlertTriangle, KeyRound, ChevronLeft } from 'lucide-react';
import { UserProfile } from '../types';
import { authenticateUser } from '../services/sheetService';
import { ApiError } from '../services/apiConfig';

/**
 * หน้าเข้าสู่ระบบ (มี URL ของตัวเองที่ /login)
 *
 * เดิมมีแต่โมดัลลอยขึ้นมา ซึ่งใช้เป็นปลายทางตอน session หมดอายุไม่ได้ —
 * พอ token หมดกลางทาง ระบบไม่มีหน้าให้ส่งผู้ใช้ไป และรีเฟรชแล้วโมดัลก็หาย
 */

interface Props {
  onLogin: (user: UserProfile) => void;
  onBack: () => void;
  /** ข้อความอธิบายว่าทำไมถึงมาอยู่หน้านี้ เช่น เซสชันหมดอายุ */
  reason?: string;
}

const LoginPage: React.FC<Props> = ({ onLogin, onBack, reason }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError('กรุณากรอกชื่อผู้ใช้และรหัสผ่าน');
      return;
    }
    setBusy(true); setError('');
    try {
      const user = await authenticateUser({
        authType: 'login', username: username.trim(), password,
      });
      if (!user) throw new Error('เข้าสู่ระบบไม่สำเร็จ');
      onLogin(user);
    } catch (err) {
      setError((err as ApiError).message || 'เข้าสู่ระบบไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  const inp = 'w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none';

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-5">
      <div className="w-full max-w-sm">
        <button onClick={onBack}
          className="text-slate-500 text-sm flex items-center gap-1 mb-6 hover:text-slate-700">
          <ChevronLeft className="w-4 h-4" /> กลับหน้าหลัก
        </button>

        <div className="bg-white rounded-3xl shadow-lg border border-slate-200 p-7">
          <div className="w-14 h-14 rounded-2xl bg-slate-800 text-white flex items-center justify-center mb-5">
            <Lock className="w-7 h-7" />
          </div>
          <h1 className="text-xl font-bold text-slate-800">เข้าสู่ระบบผู้ดูแล</h1>
          <p className="text-sm text-slate-500 mt-1">สำหรับผู้ดูแลระบบและโรงเรียนเจ้าภาพ</p>

          {reason && (
            <div className="mt-4 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800">{reason}</p>
            </div>
          )}

          <form onSubmit={submit} className="space-y-3 mt-5">
            <input className={inp} value={username} onChange={e => setUsername(e.target.value)}
              placeholder="ชื่อผู้ใช้" autoComplete="username" autoCapitalize="none" />
            <input className={inp} type="password" value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="รหัสผ่าน" autoComplete="current-password" />

            {error && (
              <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 rounded-lg p-2.5">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <p className="text-xs text-rose-700">{error}</p>
              </div>
            )}

            <button type="submit" disabled={busy}
              className="w-full py-3.5 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-900 disabled:opacity-50 flex items-center justify-center gap-2">
              {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <ArrowRight className="w-5 h-5" />}
              เข้าสู่ระบบ
            </button>
          </form>
        </div>

        <div className="mt-4 bg-indigo-50 border border-indigo-200 rounded-2xl p-4">
          <p className="text-xs text-indigo-900 font-bold flex items-center gap-1.5">
            <KeyRound className="w-4 h-4" /> เป็นโรงเรียนที่ส่งทีมเข้าแข่งขัน?
          </p>
          <p className="text-[11px] text-indigo-800 mt-1 leading-relaxed">
            ใช้ <b>รหัสโรงเรียน 8 ตัว</b> ที่ได้รับจากผู้จัดการแข่งขัน ไม่ต้องใช้ชื่อผู้ใช้
          </p>
          <a href="/school"
            className="inline-block mt-2 text-xs font-bold text-indigo-700 hover:underline">
            ไปหน้าสำหรับโรงเรียน →
          </a>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
