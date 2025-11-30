import React, { useState } from 'react';
import { MessageCircle, User, ArrowRight, X, UserPlus, LogIn, Loader2, Phone, Lock } from 'lucide-react';
import { loginWithLine } from '../services/authService';
import { UserProfile } from '../types';
import { authenticateUser } from '../services/sheetService';

interface UserLoginDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (user: UserProfile) => void;
}

const UserLoginDialog: React.FC<UserLoginDialogProps> = ({ isOpen, onClose, onLoginSuccess }) => {
  const [activeTab, setActiveTab] = useState<'login' | 'register'>('login');
  
  // Login State
  const [loginData, setLoginData] = useState({ username: '', password: '' });
  
  // Register State
  const [regData, setRegData] = useState({ username: '', password: '', confirmPassword: '', displayName: '', phone: '' });
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleLogin = async (e: React.FormEvent) => {
      e.preventDefault();
      setIsLoading(true);
      setError(null);
      try {
          const user = await authenticateUser({
              authType: 'login',
              username: loginData.username,
              password: loginData.password
          });
          if (user) {
              onLoginSuccess(user);
              onClose();
          }
      } catch (err: any) {
          setError(err.message || "เข้าสู่ระบบไม่สำเร็จ");
      } finally {
          setIsLoading(false);
      }
  };

  const handleRegister = async (e: React.FormEvent) => {
      e.preventDefault();
      if (regData.password !== regData.confirmPassword) {
          setError("รหัสผ่านไม่ตรงกัน");
          return;
      }
      setIsLoading(true);
      setError(null);
      try {
          const user = await authenticateUser({
              authType: 'register',
              username: regData.username,
              password: regData.password,
              displayName: regData.displayName,
              phone: regData.phone
          });
          if (user) {
              onLoginSuccess(user);
              onClose();
          }
      } catch (err: any) {
          setError(err.message || "สมัครสมาชิกไม่สำเร็จ");
      } finally {
          setIsLoading(false);
      }
  };

  const handleLineLogin = () => {
      onClose(); // Close dialog first
      loginWithLine(); // Redirects to LINE login
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[1300] p-4" onClick={onClose}>
      <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in duration-200 relative" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-3 right-3 p-1 rounded-full hover:bg-slate-100 text-slate-400 z-10">
            <X className="w-5 h-5" />
        </button>

        {/* Tab Header */}
        <div className="flex border-b border-slate-100">
            <button 
                onClick={() => { setActiveTab('login'); setError(null); }} 
                className={`flex-1 py-4 text-sm font-bold flex items-center justify-center gap-2 ${activeTab === 'login' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50' : 'text-slate-500 hover:bg-slate-50'}`}
            >
                <LogIn className="w-4 h-4" /> เข้าสู่ระบบ
            </button>
            <button 
                onClick={() => { setActiveTab('register'); setError(null); }} 
                className={`flex-1 py-4 text-sm font-bold flex items-center justify-center gap-2 ${activeTab === 'register' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50' : 'text-slate-500 hover:bg-slate-50'}`}
            >
                <UserPlus className="w-4 h-4" /> สมัครสมาชิก
            </button>
        </div>

        <div className="p-6">
            {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-xs font-bold text-center">
                    {error}
                </div>
            )}

            {activeTab === 'login' && (
                <div className="space-y-4">
                    <button 
                        onClick={handleLineLogin}
                        className="w-full py-3 bg-[#06C755] hover:bg-[#05b34c] text-white rounded-xl font-bold transition flex items-center justify-center gap-3 shadow-md"
                    >
                        <MessageCircle className="w-6 h-6 fill-white" />
                        เข้าสู่ระบบด้วย LINE
                    </button>
                    
                    <div className="relative py-2">
                        <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200"></div></div>
                        <div className="relative flex justify-center"><span className="bg-white px-2 text-xs text-slate-400">หรือ</span></div>
                    </div>

                    <form onSubmit={handleLogin} className="space-y-3">
                        <div>
                            <input 
                                type="text" 
                                placeholder="ชื่อผู้ใช้ (Username)" 
                                value={loginData.username}
                                onChange={e => setLoginData({...loginData, username: e.target.value})}
                                className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                required
                            />
                        </div>
                        <div>
                            <input 
                                type="password" 
                                placeholder="รหัสผ่าน (Password)" 
                                value={loginData.password}
                                onChange={e => setLoginData({...loginData, password: e.target.value})}
                                className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                required
                            />
                        </div>
                        <button 
                            type="submit" 
                            disabled={isLoading}
                            className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition flex items-center justify-center gap-2"
                        >
                            {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <>เข้าสู่ระบบ <ArrowRight className="w-4 h-4" /></>}
                        </button>
                    </form>
                </div>
            )}

            {activeTab === 'register' && (
                <form onSubmit={handleRegister} className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                        <div className="col-span-2">
                            <input 
                                type="text" 
                                placeholder="ชื่อที่ใช้แสดง (Display Name)" 
                                value={regData.displayName}
                                onChange={e => setRegData({...regData, displayName: e.target.value})}
                                className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                                required
                            />
                        </div>
                        <div className="col-span-2">
                            <div className="relative">
                                <Phone className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                                <input 
                                    type="tel" 
                                    placeholder="เบอร์โทรศัพท์ (ถ้ามี)" 
                                    value={regData.phone}
                                    onChange={e => setRegData({...regData, phone: e.target.value})}
                                    className="w-full p-3 pl-10 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                                />
                            </div>
                        </div>
                        <div className="col-span-2">
                            <div className="relative">
                                <User className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                                <input 
                                    type="text" 
                                    placeholder="ชื่อผู้ใช้ (Username)" 
                                    value={regData.username}
                                    onChange={e => setRegData({...regData, username: e.target.value})}
                                    className="w-full p-3 pl-10 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                                    required
                                />
                            </div>
                        </div>
                        <div>
                            <div className="relative">
                                <Lock className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                                <input 
                                    type="password" 
                                    placeholder="รหัสผ่าน" 
                                    value={regData.password}
                                    onChange={e => setRegData({...regData, password: e.target.value})}
                                    className="w-full p-3 pl-10 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                                    required
                                />
                            </div>
                        </div>
                        <div>
                            <div className="relative">
                                <Lock className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                                <input 
                                    type="password" 
                                    placeholder="ยืนยันรหัส" 
                                    value={regData.confirmPassword}
                                    onChange={e => setRegData({...regData, confirmPassword: e.target.value})}
                                    className="w-full p-3 pl-10 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                                    required
                                />
                            </div>
                        </div>
                    </div>
                    <button 
                        type="submit" 
                        disabled={isLoading}
                        className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition flex items-center justify-center gap-2 mt-4"
                    >
                        {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'สมัครสมาชิก'}
                    </button>
                </form>
            )}
        </div>
      </div>
    </div>
  );
};

export default UserLoginDialog;