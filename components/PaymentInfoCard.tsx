import React, { useState } from 'react';
import { Banknote, Copy, Check, Landmark, User, Info } from 'lucide-react';

/**
 * บัญชีรับค่าสมัคร — ใช้ทั้งหน้าหลักและหน้าโรงเรียน
 *
 * เขียนเป็นตัวเดียวใช้สองที่ เพราะเลขบัญชีที่แสดงไม่ตรงกันคือความผิดพลาดที่
 * แพงที่สุดในหน้านี้ ถ้าแยกโค้ดกัน วันหนึ่งจะมีที่หนึ่งถูกแก้แล้วอีกที่ไม่ถูกแก้
 *
 * สิ่งที่ทำให้ครูโอนถูกตั้งแต่ครั้งแรก:
 *   - ปุ่มคัดลอกเลขบัญชี ไม่ต้องจดใส่กระดาษแล้วพิมพ์ใหม่ในแอปธนาคาร
 *   - เลขบัญชีเว้นวรรคเป็นกลุ่มให้อ่านทีละท่อน แต่คัดลอกได้เฉพาะตัวเลขล้วน
 *     (แอปธนาคารส่วนใหญ่ไม่รับเลขที่มีขีดหรือเว้นวรรค)
 *   - จำนวนเงินอยู่ใหญ่ที่สุด เพราะเป็นสิ่งที่กรอกผิดบ่อยที่สุด
 */

type Props = {
  fee?: number;
  bankName?: string;
  bankAccount?: string;
  accountName?: string;
  /** ข้อความเพิ่มใต้การ์ด เช่น บอกว่าให้แนบสลิปที่ไหน */
  note?: React.ReactNode;
  className?: string;
};

/** 1234567890 -> 123-4-56789-0 อ่านง่ายขึ้นเวลาเทียบกับหน้าจอแอปธนาคาร */
const prettyAccount = (raw: string): string => {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 4)}-${digits.slice(4, 9)}-${digits.slice(9)}`;
  }
  if (digits.length === 12) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 11)}-${digits.slice(11)}`;
  }
  return raw;
};

const PaymentInfoCard: React.FC<Props> = ({
  fee, bankName, bankAccount, accountName, note, className = '',
}) => {
  const [copied, setCopied] = useState(false);

  const account = (bankAccount ?? '').trim();
  const hasAccount = account !== '' && account !== '-';

  // ยังไม่ได้ตั้งค่าบัญชี — ไม่ต้องขึ้นการ์ดเปล่าที่มีแต่ขีด
  if (!hasAccount && !fee) return null;

  const copy = async () => {
    const digits = account.replace(/\D/g, '') || account;
    try {
      await navigator.clipboard.writeText(digits);
    } catch {
      // บางเบราว์เซอร์ในแอป (LINE) ไม่ให้ใช้ clipboard API — ถอยไปวิธีเดิม
      const ta = document.createElement('textarea');
      ta.value = digits;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch { /* ทำอะไรไม่ได้แล้ว */ }
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`rounded-2xl border border-emerald-200 bg-emerald-50 overflow-hidden ${className}`}>
      <div className="px-4 py-2.5 bg-emerald-600 text-white flex items-center gap-2">
        <Banknote className="w-4 h-4 shrink-0" />
        <p className="font-bold text-sm">บัญชีสำหรับโอนค่าสมัคร</p>
      </div>

      <div className="p-4 space-y-3">
        {fee !== undefined && fee > 0 && (
          <div className="flex items-baseline gap-2">
            <span className="text-xs text-emerald-800">ค่าสมัครทีมละ</span>
            <span className="text-3xl font-black text-emerald-700 tabular-nums">
              {fee.toLocaleString('th-TH')}
            </span>
            <span className="text-sm font-bold text-emerald-800">บาท</span>
          </div>
        )}

        {hasAccount && (
          <>
            <div className="rounded-xl bg-white border border-emerald-200 p-3">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Landmark className="w-3.5 h-3.5 shrink-0" />
                {bankName || 'ธนาคาร'}
              </div>
              <p className="font-black text-xl sm:text-2xl text-slate-900 tabular-nums mt-1 tracking-wide break-all">
                {prettyAccount(account)}
              </p>
              {accountName && accountName !== '-' && (
                <div className="flex items-center gap-2 text-xs text-slate-600 mt-1.5">
                  <User className="w-3.5 h-3.5 shrink-0" />
                  <span className="break-words">{accountName}</span>
                </div>
              )}
            </div>

            {/* ปุ่มสูง 48px กดด้วยนิ้วโป้งได้ขณะถือมือถืออีกมือเปิดแอปธนาคาร */}
            <button
              type="button"
              onClick={copy}
              className={`w-full h-12 rounded-xl font-black text-sm flex items-center justify-center gap-2
                          transition ${copied
                            ? 'bg-emerald-700 text-white'
                            : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}
            >
              {copied
                ? <><Check className="w-4 h-4" /> คัดลอกเลขบัญชีแล้ว</>
                : <><Copy className="w-4 h-4" /> คัดลอกเลขบัญชี</>}
            </button>
            <p className="text-[11px] text-emerald-800 text-center -mt-1">
              คัดลอกเป็นตัวเลขล้วน วางในแอปธนาคารได้ทันที
            </p>
          </>
        )}

        {note && (
          <div className="flex gap-2 rounded-xl bg-white border border-emerald-200 p-3">
            <Info className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div className="text-xs text-slate-700 leading-relaxed">{note}</div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PaymentInfoCard;
