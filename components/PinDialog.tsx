
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Lock, ArrowRight, Loader2 } from 'lucide-react';

/**
 * ช่องกรอกรหัสเริ่มแข่ง
 *
 * ── ทำไมต้องให้เซิร์ฟเวอร์เป็นคนตัดสิน ────────────────────────────────
 * เดิมกล่องนี้เทียบรหัสในเบราว์เซอร์แล้วเปิดหน้าจอถัดไปให้เอง ซึ่งพังสองทาง:
 *
 *   1. รหัสจริงไม่เคยถูกส่งมาให้คนทั่วไป (adminPin ถูกกรองออกฝั่ง server)
 *      ค่าที่เทียบจึงตกไปเป็น '1234' เสมอ — ใครกรอก 1234 ก็ผ่าน
 *   2. ต่อให้ผ่าน พอกดบันทึกจริง server ตอบ 401 เพราะไม่มี session
 *      อาการที่ผู้ใช้เห็นคือ "กรอกรหัสผ่านแล้ว แต่ผลไม่ถูกบันทึก"
 *
 * ตอนนี้กล่องนี้ส่งรหัสไปให้ server ตรวจ แล้วได้ token กลับมาใช้บันทึกผลจริง
 * — การตรวจกับสิทธิ์ที่ได้จึงเป็นเรื่องเดียวกัน ไม่ใช่คนละเรื่องเหมือนเดิม
 *
 * ── ทำไมมีช่องชื่อ ────────────────────────────────────────────────────
 * รหัสนี้ไม่ผูกกับบัญชีใคร ถ้าไม่ถามชื่อไว้ ประวัติจะบอกได้แค่ว่า
 * "มีคนถือรหัสของงานนี้บันทึกผล" ซึ่งตามย้อนหลังไม่ได้เลยเมื่อผลผิด
 * ไม่บังคับกรอก เพราะหน้าสนามต้องเร็วกว่าครบ
 */

interface PinDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** ตรวจรหัสกับเซิร์ฟเวอร์ — โยน error พร้อมข้อความถ้าไม่ผ่าน */
  onVerify: (pin: string, label: string) => Promise<void>;
  onSuccess: () => void;
  title?: string;
  subtitle?: string;
}

const PinDialog: React.FC<PinDialogProps> = ({
  isOpen, onClose, onVerify, onSuccess,
  title = 'กรุณากรอกรหัส PIN',
  subtitle = 'สำหรับกรรมการที่ไม่ได้เข้าสู่ระบบ',
}) => {
  const [pin, setPin] = useState('');
  const [label, setLabel] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setPin('');
      setError('');
      setBusy(false);
      // ชื่อผู้จดผลมักเป็นคนเดิมทั้งวัน — จำไว้ให้ไม่ต้องพิมพ์ซ้ำทุกแมตช์
      setLabel(localStorage.getItem('penalty_pro_scorer_label') || '');
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const code = pin.trim();
    if (!code) { setError('ยังไม่ได้กรอกรหัส'); return; }

    setBusy(true);
    setError('');
    try {
      await onVerify(code, label.trim());
      if (label.trim()) localStorage.setItem('penalty_pro_scorer_label', label.trim());
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'รหัสไม่ถูกต้อง');
      setPin('');
    } finally {
      setBusy(false);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 bg-black/65 backdrop-blur-sm modal-sheet modal-center flex items-center justify-center p-4"
      style={{ zIndex: 2147483646 }}
      onClick={() => { if (!busy) onClose(); }}
    >
      <div
        className="bg-white w-full max-w-xs rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in duration-200"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6 text-center">
          <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Lock className="w-6 h-6 text-indigo-600" />
          </div>
          <h3 className="text-lg font-bold text-slate-800 mb-1">{title}</h3>
          <p className="text-xs text-slate-500 mb-4">{subtitle}</p>

          <form onSubmit={handleSubmit}>
            <input
              type="password"
              inputMode="numeric"
              enterKeyHint="done"
              pattern="[0-9]*"
              value={pin}
              onChange={e => { setPin(e.target.value); setError(''); }}
              disabled={busy}
              className={`w-full p-3 text-center text-2xl font-mono tracking-widest border rounded-xl focus:outline-none focus:ring-2 mb-2 disabled:bg-slate-50 ${
                error ? 'border-red-300 ring-red-100 bg-red-50' : 'border-slate-200 ring-indigo-100 focus:border-indigo-500'
              }`}
              placeholder="••••••"
              autoFocus
              maxLength={10}
            />

            <input
              type="text"
              value={label}
              onChange={e => setLabel(e.target.value)}
              disabled={busy}
              maxLength={80}
              className="w-full p-2.5 text-center text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 ring-indigo-100 focus:border-indigo-500 mb-2 disabled:bg-slate-50"
              placeholder="ชื่อผู้จดผล (ไม่ใส่ก็ได้)"
            />

            {error && <p className="text-red-600 text-xs mb-3 leading-relaxed">{error}</p>}

            <button
              type="submit"
              disabled={busy}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white rounded-xl font-bold transition flex items-center justify-center gap-2 shadow-lg shadow-indigo-200 active:scale-95"
            >
              {busy
                ? <><Loader2 className="w-4 h-4 animate-spin" /> กำลังตรวจสอบ</>
                : <>ยืนยัน <ArrowRight className="w-4 h-4" /></>}
            </button>
          </form>
        </div>
        <div className="bg-slate-50 p-3 text-center border-t border-slate-100">
          <button onClick={onClose} disabled={busy} className="text-slate-400 hover:text-slate-600 text-xs font-medium disabled:opacity-50">
            ยกเลิก
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default PinDialog;
