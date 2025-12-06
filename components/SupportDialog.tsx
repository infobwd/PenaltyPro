import React, { useState, useEffect } from 'react';
import { Coffee, GraduationCap, X, Copy, Check, Upload, ArrowRight, Loader2, QrCode, Settings, Save, ArrowLeft } from 'lucide-react';
import { AppSettings, UserProfile } from '../types';
import { fileToBase64, saveSettings } from '../services/sheetService';

interface SupportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  config: AppSettings;
  currentUser?: UserProfile | null;
  onRefresh?: () => void;
}

const SupportDialog: React.FC<SupportDialogProps> = ({ isOpen, onClose, config, currentUser, onRefresh }) => {
  const [activeTab, setActiveTab] = useState<'coffee' | 'education'>('coffee');
  const [copied, setCopied] = useState(false);
  const [amount, setAmount] = useState('');
  const [donorName, setDonorName] = useState(currentUser?.displayName || '');
  const [slipFile, setSlipFile] = useState<File | null>(null);
  const [slipPreview, setSlipPreview] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  // Admin Config State
  const [isEditing, setIsEditing] = useState(false);
  const [editConfig, setEditConfig] = useState<AppSettings>(config);
  const isAdmin = currentUser?.role === 'admin';

  useEffect(() => {
    if (isOpen) {
      setAmount('');
      setSlipFile(null);
      setSlipPreview(null);
      setIsSuccess(false);
      setDonorName(currentUser?.displayName || '');
      setIsEditing(false); // Reset to view mode
      setEditConfig(config); // Reset config form
    }
  }, [isOpen, currentUser, config]);

  if (!isOpen) return null;

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSlipFile(file);
      setSlipPreview(URL.createObjectURL(file));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || !donorName || !slipFile) return;

    setIsSubmitting(true);
    try {
      const slipBase64 = await fileToBase64(slipFile);
      const tournamentId = activeTab === 'coffee' ? '_SYS_COFFEE' : '_SYS_EDUCATION';
      
      const payload = {
        action: 'submitDonation',
        tournamentId: tournamentId,
        amount: parseFloat(amount),
        donorName: donorName,
        donorPhone: currentUser?.phoneNumber || '',
        isEdonation: false,
        slipFile: slipBase64,
        lineUserId: currentUser?.userId || '',
        isAnonymous: false
      };

      await fetch("https://script.google.com/macros/s/AKfycbztQtSLYW3wE5j-g2g7OMDxKL6WFuyUymbGikt990wn4gCpwQN_MztGCcBQJgteZQmvyg/exec", {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
      });

      setIsSuccess(true);
      if (onRefresh) onRefresh();
    } catch (e) {
      alert("เกิดข้อผิดพลาด");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveConfig = async () => {
      setIsSubmitting(true);
      try {
          await saveSettings(editConfig);
          setIsEditing(false);
          if(onRefresh) onRefresh();
      } catch(e) {
          alert("บันทึกการตั้งค่าไม่สำเร็จ");
      } finally {
          setIsSubmitting(false);
      }
  };

  const handleQrUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
          const file = e.target.files[0];
          try {
              const base64 = await fileToBase64(file);
              setEditConfig(prev => ({ ...prev, educationSupportQrUrl: base64 }));
          } catch (error) {
              alert("อัปโหลดรูปภาพไม่สำเร็จ");
          }
      }
  };

  const coffeePhone = isEditing ? (editConfig.coffeeSupportPhone || '') : (config.coffeeSupportPhone || '0836645989');
  const coffeeQrUrl = `https://promptpay.io/${coffeePhone}/${amount || ''}`;

  return (
    <div className="fixed inset-0 z-[2000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in zoom-in duration-200">
      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden relative flex flex-col max-h-[90vh]">
        
        {/* Header Actions */}
        <div className="absolute top-4 left-4 z-10">
            {isAdmin && !isEditing && !isSuccess && (
                <button onClick={() => setIsEditing(true)} className="p-2 bg-slate-100 rounded-full hover:bg-slate-200 transition text-slate-500" title="ตั้งค่า">
                    <Settings className="w-5 h-5"/>
                </button>
            )}
            {isEditing && (
                <button onClick={() => setIsEditing(false)} className="p-2 bg-slate-100 rounded-full hover:bg-slate-200 transition text-slate-500" title="ย้อนกลับ">
                    <ArrowLeft className="w-5 h-5"/>
                </button>
            )}
        </div>
        <button onClick={onClose} className="absolute top-4 right-4 p-2 bg-slate-100 rounded-full hover:bg-slate-200 z-10 transition"><X className="w-5 h-5 text-slate-500"/></button>

        {/* Header Tabs */}
        <div className="flex bg-slate-50 border-b border-slate-200 pt-2">
          <button 
            onClick={() => setActiveTab('coffee')}
            className={`flex-1 py-4 flex flex-col items-center gap-1 transition ${activeTab === 'coffee' ? 'bg-white border-b-2 border-orange-500 text-orange-600' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <Coffee className="w-6 h-6" />
            <span className="text-xs font-bold">เลี้ยงกาแฟ</span>
          </button>
          <button 
            onClick={() => setActiveTab('education')}
            className={`flex-1 py-4 flex flex-col items-center gap-1 transition ${activeTab === 'education' ? 'bg-white border-b-2 border-indigo-500 text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <GraduationCap className="w-6 h-6" />
            <span className="text-xs font-bold">สนับสนุนการศึกษา</span>
          </button>
        </div>

        {isSuccess ? (
          <div className="p-8 text-center flex flex-col items-center justify-center h-full min-h-[400px]">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-4 text-green-600 animate-bounce">
              <Check className="w-10 h-10" />
            </div>
            <h3 className="text-2xl font-black text-slate-800 mb-2">ขอบคุณครับ!</h3>
            <p className="text-slate-500 mb-6">ข้อมูลการสนับสนุนของคุณถูกบันทึกแล้ว</p>
            <button onClick={onClose} className="px-8 py-3 bg-slate-900 text-white rounded-xl font-bold">ปิดหน้าต่าง</button>
          </div>
        ) : isEditing ? (
            // EDIT MODE
            <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50/50">
                <div className="text-center mb-4">
                    <h3 className="font-bold text-lg text-slate-800 flex items-center justify-center gap-2"><Settings className="w-5 h-5"/> ตั้งค่าการรับสนับสนุน</h3>
                    <p className="text-xs text-slate-500">แก้ไขข้อมูลบัญชีและ QR Code</p>
                </div>

                {activeTab === 'coffee' ? (
                    <div className="space-y-4">
                        <div className="bg-orange-50 p-4 rounded-xl border border-orange-100">
                            <h4 className="font-bold text-orange-800 mb-3 text-sm">ตั้งค่า PromptPay (เลี้ยงกาแฟ)</h4>
                            <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">เบอร์พร้อมเพย์ / รหัสบัตรประชาชน</label>
                                <input 
                                    type="text" 
                                    value={editConfig.coffeeSupportPhone || ''} 
                                    onChange={e => setEditConfig({...editConfig, coffeeSupportPhone: e.target.value})} 
                                    className="w-full p-3 border rounded-lg text-sm bg-white"
                                    placeholder="08x-xxx-xxxx"
                                />
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100 space-y-3">
                            <h4 className="font-bold text-indigo-800 mb-3 text-sm">ตั้งค่าบัญชี (การศึกษา)</h4>
                            
                            <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">รูป QR Code</label>
                                <div className="flex items-center gap-3">
                                    {editConfig.educationSupportQrUrl ? (
                                        <img src={editConfig.educationSupportQrUrl} className="w-16 h-16 object-contain bg-white rounded p-1 border" />
                                    ) : (
                                        <div className="w-16 h-16 bg-slate-200 rounded flex items-center justify-center text-slate-400 text-xs">No QR</div>
                                    )}
                                    <label className="cursor-pointer bg-white border border-indigo-200 text-indigo-600 px-3 py-2 rounded-lg text-xs font-bold hover:bg-indigo-50 transition shadow-sm">
                                        อัปโหลดรูปใหม่
                                        <input type="file" accept="image/*" className="hidden" onChange={handleQrUpload} />
                                    </label>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">ชื่อธนาคาร</label>
                                <input 
                                    type="text" 
                                    value={editConfig.educationSupportBankName || ''} 
                                    onChange={e => setEditConfig({...editConfig, educationSupportBankName: e.target.value})} 
                                    className="w-full p-2 border rounded-lg text-sm bg-white"
                                    placeholder="เช่น กสิกรไทย"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">เลขบัญชี</label>
                                <input 
                                    type="text" 
                                    value={editConfig.educationSupportAccountNumber || ''} 
                                    onChange={e => setEditConfig({...editConfig, educationSupportAccountNumber: e.target.value})} 
                                    className="w-full p-2 border rounded-lg text-sm bg-white"
                                    placeholder="xxx-x-xxxxx-x"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">ชื่อบัญชี</label>
                                <input 
                                    type="text" 
                                    value={editConfig.educationSupportAccountName || ''} 
                                    onChange={e => setEditConfig({...editConfig, educationSupportAccountName: e.target.value})} 
                                    className="w-full p-2 border rounded-lg text-sm bg-white"
                                    placeholder="นาย..."
                                />
                            </div>
                        </div>
                    </div>
                )}

                <button 
                    onClick={handleSaveConfig}
                    disabled={isSubmitting} 
                    className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg hover:bg-indigo-700 transition"
                >
                    {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin"/> : <><Save className="w-5 h-5"/> บันทึกการตั้งค่า</>}
                </button>
            </div>
        ) : (
          // VIEW MODE
          <div className="overflow-y-auto flex-1 p-6 space-y-6">
            {/* QR Section */}
            <div className="flex flex-col items-center text-center space-y-3">
              <div className="bg-white p-3 rounded-2xl shadow-lg border border-slate-100">
                {activeTab === 'coffee' ? (
                  <img src={coffeeQrUrl} className="w-48 h-48 object-contain" />
                ) : (
                  config.educationSupportQrUrl ? (
                    <img src={config.educationSupportQrUrl} className="w-48 h-48 object-contain" />
                  ) : (
                    <div className="w-48 h-48 bg-slate-100 flex flex-col items-center justify-center text-slate-400">
                      <QrCode className="w-12 h-12 mb-2 opacity-50"/>
                      <span className="text-xs">ไม่มี QR Code</span>
                    </div>
                  )
                )}
              </div>
              
              <div className="space-y-1">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  {activeTab === 'coffee' ? 'PromptPay (พร้อมเพย์)' : (config.educationSupportBankName || 'บัญชีธนาคาร')}
                </p>
                <div 
                  className="flex items-center gap-2 bg-slate-100 px-4 py-2 rounded-lg cursor-pointer hover:bg-slate-200 transition group"
                  onClick={() => handleCopy(activeTab === 'coffee' ? coffeePhone : (config.educationSupportAccountNumber || ''))}
                >
                  <span className="text-xl font-black text-slate-700 font-mono tracking-widest">
                    {activeTab === 'coffee' ? coffeePhone : (config.educationSupportAccountNumber || '-')}
                  </span>
                  {copied ? <Check className="w-4 h-4 text-green-500"/> : <Copy className="w-4 h-4 text-slate-400 group-hover:text-slate-600"/>}
                </div>
                {activeTab === 'education' && config.educationSupportAccountName && (
                  <p className="text-sm font-bold text-indigo-700">{config.educationSupportAccountName}</p>
                )}
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4 pt-4 border-t border-slate-100">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-500 mb-1 block">ชื่อผู้โอน</label>
                  <input type="text" value={donorName} onChange={e => setDonorName(e.target.value)} className="w-full p-2 border rounded-lg text-sm" placeholder="ระบุชื่อ" required />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 mb-1 block">จำนวนเงิน</label>
                  <input type="number" value={amount} onChange={e => setAmount(e.target.value)} className="w-full p-2 border rounded-lg text-sm" placeholder="0.00" required />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 mb-1 block">หลักฐานการโอน (สลิป)</label>
                <label className="flex items-center justify-center border-2 border-dashed border-slate-300 rounded-xl p-4 cursor-pointer hover:bg-slate-50 transition relative overflow-hidden h-32 group">
                  {slipPreview ? (
                    <img src={slipPreview} className="absolute inset-0 w-full h-full object-contain p-2" />
                  ) : (
                    <div className="flex flex-col items-center text-slate-400 group-hover:text-slate-600">
                      <Upload className="w-6 h-6 mb-1" />
                      <span className="text-xs">แตะเพื่ออัปโหลด</span>
                    </div>
                  )}
                  <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} required />
                </label>
              </div>

              <button 
                type="submit" 
                disabled={isSubmitting} 
                className={`w-full py-3 rounded-xl font-bold text-white flex items-center justify-center gap-2 shadow-lg transition transform active:scale-95 ${activeTab === 'coffee' ? 'bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 shadow-orange-200' : 'bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 shadow-indigo-200'}`}
              >
                {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin"/> : <>ยืนยันการโอน <ArrowRight className="w-5 h-5"/></>}
              </button>
            </form>

          </div>
        )}
      </div>
    </div>
  );
};

export default SupportDialog;