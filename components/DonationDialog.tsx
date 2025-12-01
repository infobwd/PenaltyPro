
import React, { useState, useEffect } from 'react';
import { Heart, X, Copy, Check, CreditCard, Upload, FileText, Loader2, ArrowRight, ShieldAlert, CheckCircle2, FileCheck } from 'lucide-react';
import { AppSettings, UserProfile } from '../types';
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
  const [uploadProgress, setUploadProgress] = useState(0);
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
  const [taxFile, setTaxFile] = useState<File | null>(null); 
  const [isAnonymous, setIsAnonymous] = useState(false);

  useEffect(() => {
      if (currentUser && isOpen) {
          if (!donorName && currentUser.displayName) setDonorName(currentUser.displayName);
          if (!donorPhone && currentUser.phoneNumber) setDonorPhone(currentUser.phoneNumber);
      }
  }, [currentUser, isOpen]);

  useEffect(() => {
      if (isOpen) {
          setShowErrors(false);
          setIsSuccess(false);
          setUploadProgress(0);
          setTaxFile(null);
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
          setShowErrors(false); 
      }
  };

  const handleTaxFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
          const file = e.target.files[0];
          setTaxFile(file);
      }
  };

  const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      setShowErrors(true);

      if (!amount || !donorName || !slipFile) {
          return;
      }

      if (isEdonation && !taxId) {
          alert("กรุณากรอกเลขบัตรประชาชน/ผู้เสียภาษี สำหรับ e-Donation");
          return;
      }

      setIsSubmitting(true);
      setUploadProgress(10);
      
      try {
          // Simulate progress for UX
          const interval = setInterval(() => {
              setUploadProgress(prev => {
                  if (prev >= 90) {
                      clearInterval(interval);
                      return 90;
                  }
                  return prev + 10;
              });
          }, 300);

          const slipBase64 = await fileToBase64(slipFile);
          let taxFileBase64 = "";
          if (isEdonation && taxFile) {
              taxFileBase64 = await fileToBase64(taxFile);
          }
          
          const payload: any = { 
              action: 'submitDonation',
              tournamentId: tournamentId || 'default', 
              amount: parseFloat(amount),
              donorName,
              donorPhone,
              isEdonation,
              taxId: isEdonation ? taxId : '',
              address: isEdonation ? address : '',
              slipFile: slipBase64,
              lineUserId: currentUser?.userId || '', 
              isAnonymous: isAnonymous,
              taxFile: taxFileBase64 
          };

          const API_URL = "https://script.google.com/macros/s/AKfycbztQtSLYW3wE5j-g2g7OMDxKL6WFuyUymbGikt990wn4gCpwQN_MztGCcBQJgteZQmvyg/exec"; 
          await fetch(API_URL, {
              method: 'POST',
              mode: 'no-cors', 
              headers: { 'Content-Type': 'text/plain;charset=utf-8' },
              body: JSON.stringify(payload)
          });

          clearInterval(interval);
          setUploadProgress(100);
          setTimeout(() => setIsSuccess(true), 500);

      } catch (error) {
          alert("เกิดข้อผิดพลาดในการส่งข้อมูล กรุณาลองใหม่");
          setUploadProgress(0);
      } finally {
          setIsSubmitting(false);
      }
  };

  if (isSuccess) {
      return (
        <div className="fixed inset-0 z-[2000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in zoom-in duration-200">
            <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl p-8 text-center relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-green-400 to-emerald-600"></div>
                <div className="w-24 h-24 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-6 animate-bounce border-4 border-green-100">
                    <CheckCircle2 className="w-12 h-12 text-green-600" />
                </div>
                <h3 className="font-black text-2xl text-slate-800 mb-2">แจ้งโอนสำเร็จ!</h3>
                <p className="text-slate-500 text-sm mb-6 leading-relaxed">
                    ขอบคุณที่ร่วมสนับสนุนโครงการ<br/>
                    <span className="font-bold text-slate-700">"{tournamentName}"</span>
                    <br/>
                    {isEdonation && <span className="text-xs text-indigo-600 bg-indigo-50 px-2 py-1 rounded-full mt-2 inline-block">บันทึกข้อมูล e-Donation แล้ว</span>}
                </p>
                <button onClick={onClose} className="w-full py-3.5 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition shadow-lg">ปิดหน้าต่าง</button>
            </div>
        </div>
      );
  }

  return (
    <div className="fixed inset-0 z-[2000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in zoom-in duration-200 overflow-y-auto">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden relative flex flex-col max-h-[90vh]">
        <button onClick={onClose} className="absolute top-3 right-3 p-1 rounded-full bg-white/20 hover:bg-white/40 transition text-white z-10">
            <X className="w-5 h-5" />
        </button>

        <div className="bg-gradient-to-br from-pink-600 to-rose-600 p-6 text-white text-center shrink-0 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white opacity-10 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl"></div>
            <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3 backdrop-blur-sm shadow-inner border border-white/30">
                <Heart className="w-7 h-7 text-white fill-white" />
            </div>
            <h3 className="font-bold text-xl mb-1">ร่วมสนับสนุนโครงการ</h3>
            <p className="text-pink-100 text-xs opacity-90">{tournamentName}</p>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-6 relative">
            {isSubmitting && (
                <div className="absolute inset-0 z-50 bg-white/95 backdrop-blur-[2px] flex flex-col items-center justify-center rounded-xl p-6 text-center">
                    <div className="w-20 h-20 relative mb-4">
                        <svg className="transform -rotate-90 w-20 h-20">
                            <circle cx="40" cy="40" r="36" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-slate-100" />
                            <circle cx="40" cy="40" r="36" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-pink-600 transition-all duration-300 ease-in-out" strokeDasharray={`${uploadProgress * 2.26}, 226`} />
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center text-sm font-black text-pink-600">{uploadProgress}%</div>
                    </div>
                    <h4 className="font-bold text-slate-800 mb-1">กำลังบันทึกข้อมูล...</h4>
                    <p className="text-xs text-slate-500">กรุณารอสักครู่ ระบบกำลังอัปโหลดสลิปและบันทึกข้อมูลการบริจาค</p>
                </div>
            )}

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
                                <button type="button" onClick={() => {setSlipFile(null); setSlipPreview(null);}} className="absolute -top-2 -right-2 bg-red-500 text-white p-1 rounded-full shadow-md hover:bg-red-600"><X className="w-3 h-3"/></button>
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
                    <label className="flex items-center gap-3 cursor-pointer p-2 hover:bg-slate-50 rounded-lg transition">
                        <div className={`w-5 h-5 rounded border flex items-center justify-center transition ${isAnonymous ? 'bg-slate-600 border-slate-600' : 'bg-white border-slate-300'}`}>
                            {isAnonymous && <Check className="w-3 h-3 text-white" />}
                        </div>
                        <input type="checkbox" checked={isAnonymous} onChange={e => setIsAnonymous(e.target.checked)} className="hidden" />
                        <span className="text-sm font-bold text-slate-700">ไม่ประสงค์ออกนาม (Anonymous)</span>
                    </label>
                </div>

                <div className="pt-2 border-t">
                    <label className="flex items-center gap-3 cursor-pointer p-2 hover:bg-indigo-50 rounded-lg transition">
                        <div className={`w-5 h-5 rounded border flex items-center justify-center transition ${isEdonation ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-slate-300'}`}>
                            {isEdonation && <Check className="w-3 h-3 text-white" />}
                        </div>
                        <input type="checkbox" checked={isEdonation} onChange={e => setIsEdonation(e.target.checked)} className="hidden" />
                        <div className="flex-1">
                            <span className="text-sm font-bold text-slate-700 block">ต้องการลดหย่อนภาษี (e-Donation)</span>
                            <span className="text-[10px] text-slate-400">ระบบจะส่งข้อมูลไปยังกรมสรรพากร</span>
                        </div>
                    </label>
                </div>

                {isEdonation && (
                    <div className="bg-indigo-50 p-4 rounded-xl space-y-3 animate-in fade-in slide-in-from-top-2 border border-indigo-100">
                        <div>
                            <label className="block text-xs font-bold text-indigo-800 mb-1">เลขประจำตัวผู้เสียภาษี / บัตรประชาชน <span className="text-red-500">*</span></label>
                            <input type="text" required={isEdonation} value={taxId} onChange={e => setTaxId(e.target.value)} className="w-full p-2 border border-indigo-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-200" placeholder="13 หลัก" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-indigo-800 mb-1">ที่อยู่ (สำหรับออกใบเสร็จ)</label>
                            <textarea value={address} onChange={e => setAddress(e.target.value)} className="w-full p-2 border border-indigo-200 rounded-lg text-sm h-16 focus:ring-2 focus:ring-indigo-200" placeholder="บ้านเลขที่, ถนน, แขวง/ตำบล..."></textarea>
                        </div>
                        
                        {/* TAX FILE UPLOAD - Only shows if eDonation is checked */}
                        <div>
                            <label className="block text-xs font-bold text-indigo-800 mb-1">แนบไฟล์บัตรประชาชน/เอกสาร (ถ้ามี)</label>
                            <label className={`flex items-center gap-2 cursor-pointer bg-white border p-3 rounded-lg text-sm transition hover:shadow-sm ${taxFile ? 'border-green-300 text-green-700 bg-green-50' : 'border-indigo-200 text-indigo-600 hover:bg-white'}`}>
                                {taxFile ? <CheckCircle2 className="w-5 h-5"/> : <Upload className="w-5 h-5" />}
                                <div className="flex-1 overflow-hidden">
                                    <span className="truncate font-bold block">{taxFile ? taxFile.name : 'แตะเพื่อเลือกไฟล์'}</span>
                                    <span className="text-[10px] opacity-70">รองรับ .JPG, .PNG, .PDF</span>
                                </div>
                                <input type="file" accept="image/*,.pdf" className="hidden" onChange={handleTaxFileChange} />
                            </label>
                        </div>
                    </div>
                )}

                {/* Deterrent / Info Message */}
                <div className="bg-orange-50 p-3 rounded-lg border border-orange-100 flex gap-2 items-start text-xs text-orange-700">
                    <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                    <p>ระบบจะตรวจสอบยอดเงินกับธนาคารโดยละเอียด หากตรวจพบสลิปปลอม จะถูกดำเนินคดีตามกฎหมาย</p>
                </div>

                <button type="submit" disabled={isSubmitting} className="w-full py-4 bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-700 hover:to-rose-700 text-white rounded-xl font-bold shadow-lg shadow-pink-200 flex items-center justify-center gap-2 transition transform active:scale-95 disabled:opacity-70 disabled:active:scale-100">
                    {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <>ยืนยันการบริจาค <ArrowRight className="w-5 h-5" /></>}
                </button>
            </form>
        </div>
      </div>
    </div>
  );
};

export default DonationDialog;
