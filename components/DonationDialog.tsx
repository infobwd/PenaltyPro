import React, { useState, useRef, useEffect } from 'react';
import { Heart, X, Copy, Check, CreditCard, Share2, Upload, FileText, Loader2, ArrowRight, AlertTriangle, ShieldAlert } from 'lucide-react';
import { AppSettings, DonationRequest, UserProfile } from '../types';
import { fileToBase64 } from '../services/sheetService';

interface DonationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  config: AppSettings;
  tournamentName: string;
  tournamentId?: string; 
  currentUser?: UserProfile | null; 
}

const DonationDialog: React.FC<DonationDialogProps> = ({ isOpen, onClose, config, tournamentName, tournamentId, currentUser }) => {
  const [copied, setCopied] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [showErrors, setShowErrors] = useState(false);

  // Form State
  const [amount, setAmount] = useState('');
  const [donorName, setDonorName] = useState('');
  const [donorPhone, setDonorPhone] = useState('');
  const [isEdonation, setIsEdonation] = useState(false);
  const [taxId, setTaxId] = useState('');
  const [address, setAddress] = useState('');
  const [slipFile, setSlipFile] = useState<File | null>(null);
  const [slipPreview, setSlipPreview] = useState<string | null>(null);
  const [isAnonymous, setIsAnonymous] = useState(false);

  useEffect(() => {
      if (currentUser && isOpen) {
          if (!donorName && currentUser.displayName) setDonorName(currentUser.displayName);
          if (!donorPhone && currentUser.phoneNumber) setDonorPhone(currentUser.phoneNumber);
      }
  }, [currentUser, isOpen]);

  // Reset state when closed or opened
  useEffect(() => {
      if (isOpen) {
          setShowErrors(false);
          setIsSuccess(false);
          // Optional: Clear form if needed, currently keeping it for UX if re-opened
      }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(config.bankAccount);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
          const file = e.target.files[0];
          setSlipFile(file);
          setSlipPreview(URL.createObjectURL(file));
          setShowErrors(false); // Clear error when file is selected
      }
  };

  const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      setShowErrors(true);

      // Strict Validation
      if (!amount || !donorName || !slipFile) {
          // Visual cues are handled by showErrors state in render
          return;
      }

      setIsSubmitting(true);
      
      try {
          const slipBase64 = await fileToBase64(slipFile);
          
          const payload: any = { 
              action: 'submitDonation',
              tournamentId: tournamentId || 'default', 
              amount: parseFloat(amount),
              donorName,
              donorPhone,
              isEdonation,
              taxId,
              address,
              slipFile: slipBase64,
              lineUserId: currentUser?.userId || '', 
              isAnonymous: isAnonymous
          };

          const API_URL = "https://script.google.com/macros/s/AKfycbztQtSLYW3wE5j-g2g7OMDxKL6WFuyUymbGikt990wn4gCpwQN_MztGCcBQJgteZQmvyg/exec"; 
          await fetch(API_URL, {
              method: 'POST',
              mode: 'no-cors', 
              headers: { 'Content-Type': 'text/plain;charset=utf-8' },
              body: JSON.stringify(payload)
          });

          setIsSuccess(true);
      } catch (error) {
          alert("เกิดข้อผิดพลาดในการส่งข้อมูล กรุณาลองใหม่");
      } finally {
          setIsSubmitting(false);
      }
  };

  if (isSuccess) {
      return (
        <div className="fixed inset-0 z-[2000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in zoom-in duration-200">
            <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl p-8 text-center">
                <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4 animate-bounce">
                    <Check className="w-10 h-10 text-green-600" />
                </div>
                <h3 className="font-bold text-xl text-slate-800 mb-2">ส่งข้อมูลสำเร็จ!</h3>
                <p className="text-slate-500 text-sm mb-6">
                    ขอบคุณที่ร่วมสนับสนุน<br/>
                    เจ้าหน้าที่จะตรวจสอบยอดเงินและอนุมัติในเร็วๆ นี้
                </p>
                <button onClick={onClose} className="w-full py-3 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-900 transition">ปิดหน้าต่าง</button>
            </div>
        </div>
      );
  }

  return (
    <div className="fixed inset-0 z-[2000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in zoom-in duration-200 overflow-y-auto">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden relative flex flex-col max-h-[90vh]">
        <button onClick={onClose} className="absolute top-3 right-3 p-1 rounded-full bg-slate-100 hover:bg-slate-200 transition text-slate-500 z-10">
            <X className="w-5 h-5" />
        </button>

        <div className="bg-pink-600 p-6 text-white text-center shrink-0">
            <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-2 backdrop-blur-sm">
                <Heart className="w-6 h-6 text-white fill-white" />
            </div>
            <h3 className="font-bold text-lg mb-1">ร่วมสนับสนุนโครงการ</h3>
            <p className="text-pink-100 text-xs">{tournamentName}</p>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-6">
            {/* Step 1: Bank Info */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-center space-y-3 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-pink-500 to-indigo-500"></div>
                <p className="text-slate-500 text-xs uppercase tracking-wider font-bold">โอนเงินได้ที่</p>
                <div className="flex flex-col items-center">
                    <p className="font-bold text-slate-800">{config.bankName}</p>
                    <div className="flex items-center gap-2 my-1 cursor-pointer hover:bg-slate-200 px-3 py-1 rounded transition group" onClick={handleCopy}>
                        <span className="text-2xl font-mono font-black text-indigo-600 tracking-wider group-hover:scale-105 transition-transform">{config.bankAccount}</span>
                        {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4 text-slate-400 group-hover:text-indigo-500" />}
                    </div>
                    <p className="text-sm text-slate-600">{config.accountName}</p>
                </div>
            </div>

            {/* Step 2: Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="flex items-center gap-2 mb-2">
                    <FileText className="w-4 h-4 text-pink-600"/> 
                    <h4 className="font-bold text-slate-800 text-sm">แจ้งหลักฐานการโอน</h4>
                </div>
                
                <div>
                    <label className={`block text-xs font-bold mb-1 ${showErrors && !amount ? 'text-red-500' : 'text-slate-500'}`}>ยอดเงินบริจาค (บาท) <span className="text-red-500">*</span></label>
                    <input 
                        type="number" 
                        required 
                        value={amount} 
                        onChange={e => setAmount(e.target.value)} 
                        className={`w-full p-3 border rounded-xl text-lg font-bold text-indigo-700 bg-slate-50 focus:bg-white transition ${showErrors && !amount ? 'border-red-500 ring-2 ring-red-100 bg-red-50' : 'border-slate-200'}`} 
                        placeholder="0.00" 
                    />
                </div>

                <div>
                    <label className={`block text-xs font-bold mb-1 ${showErrors && !slipFile ? 'text-red-500' : 'text-slate-500'}`}>หลักฐานการโอน (สลิป) <span className="text-red-500">*</span></label>
                    <div className={`border-2 border-dashed rounded-xl p-4 text-center hover:bg-slate-50 transition relative ${showErrors && !slipFile ? 'border-red-500 bg-red-50 animate-pulse' : 'border-slate-300'}`}>
                        {slipPreview ? (
                            <div className="relative">
                                <img src={slipPreview} className="max-h-40 mx-auto rounded shadow-sm" />
                                <button type="button" onClick={() => {setSlipFile(null); setSlipPreview(null);}} className="absolute -top-2 -right-2 bg-red-500 text-white p-1 rounded-full"><X className="w-3 h-3"/></button>
                            </div>
                        ) : (
                            <label className="cursor-pointer block w-full h-full py-4">
                                <Upload className={`w-8 h-8 mx-auto mb-2 ${showErrors && !slipFile ? 'text-red-500' : 'text-slate-300'}`} />
                                <span className={`text-xs ${showErrors && !slipFile ? 'text-red-500 font-bold' : 'text-slate-500'}`}>
                                    {showErrors && !slipFile ? 'กรุณาแนบสลิปการโอน' : 'แตะเพื่ออัปโหลดรูปภาพ'}
                                </span>
                                <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                            </label>
                        )}
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className={`block text-xs font-bold mb-1 ${showErrors && !donorName ? 'text-red-500' : 'text-slate-500'}`}>ชื่อผู้บริจาค <span className="text-red-500">*</span></label>
                        <input 
                            type="text" 
                            required 
                            value={donorName} 
                            onChange={e => setDonorName(e.target.value)} 
                            className={`w-full p-2 border rounded-lg text-sm ${showErrors && !donorName ? 'border-red-500 bg-red-50' : ''}`}
                            placeholder="ชื่อ-นามสกุล" 
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">เบอร์โทรศัพท์</label>
                        <input type="tel" value={donorPhone} onChange={e => setDonorPhone(e.target.value)} className="w-full p-2 border rounded-lg text-sm" placeholder="08x-xxx-xxxx" />
                    </div>
                </div>

                {/* Anonymous Checkbox */}
                <div className="pt-2">
                    <label className="flex items-center gap-3 cursor-pointer">
                        <div className={`w-5 h-5 rounded border flex items-center justify-center transition ${isAnonymous ? 'bg-slate-600 border-slate-600' : 'bg-white border-slate-300'}`}>
                            {isAnonymous && <Check className="w-3 h-3 text-white" />}
                        </div>
                        <input type="checkbox" checked={isAnonymous} onChange={e => setIsAnonymous(e.target.checked)} className="hidden" />
                        <span className="text-sm font-bold text-slate-700">ไม่ประสงค์ออกนาม (Anonymous)</span>
                    </label>
                </div>

                <div className="pt-2 border-t">
                    <label className="flex items-center gap-3 cursor-pointer">
                        <div className={`w-5 h-5 rounded border flex items-center justify-center transition ${isEdonation ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-slate-300'}`}>
                            {isEdonation && <Check className="w-3 h-3 text-white" />}
                        </div>
                        <input type="checkbox" checked={isEdonation} onChange={e => setIsEdonation(e.target.checked)} className="hidden" />
                        <span className="text-sm font-bold text-slate-700">ขอใบรับรองภาษี (e-Donation)</span>
                    </label>
                </div>

                {isEdonation && (
                    <div className="bg-indigo-50 p-4 rounded-xl space-y-3 animate-in fade-in slide-in-from-top-2">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">เลขประจำตัวผู้เสียภาษี / บัตรประชาชน <span className="text-red-500">*</span></label>
                            <input type="text" required={isEdonation} value={taxId} onChange={e => setTaxId(e.target.value)} className="w-full p-2 border border-indigo-200 rounded-lg text-sm" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">ที่อยู่ (สำหรับออกใบเสร็จ)</label>
                            <textarea value={address} onChange={e => setAddress(e.target.value)} className="w-full p-2 border border-indigo-200 rounded-lg text-sm h-20" placeholder="บ้านเลขที่, ถนน, แขวง/ตำบล..."></textarea>
                        </div>
                    </div>
                )}

                {/* Deterrent / Info Message */}
                <div className="bg-orange-50 p-3 rounded-lg border border-orange-100 flex gap-2 items-start text-xs text-orange-700">
                    <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                    <p>ระบบจะตรวจสอบยอดเงินกับธนาคารโดยละเอียด หากตรวจพบสลิปปลอม จะถูกดำเนินคดีตามกฎหมาย</p>
                </div>

                <button type="submit" disabled={isSubmitting} className="w-full py-4 bg-pink-600 hover:bg-pink-700 text-white rounded-xl font-bold shadow-lg shadow-pink-200 flex items-center justify-center gap-2 transition transform active:scale-95 disabled:opacity-50">
                    {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <>ยืนยันการบริจาค <ArrowRight className="w-5 h-5" /></>}
                </button>
            </form>
        </div>
      </div>
    </div>
  );
};

export default DonationDialog;