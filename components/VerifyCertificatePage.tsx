import React, { useEffect, useState } from 'react';
import { BadgeCheck, Home, Loader2, ShieldAlert } from 'lucide-react';
import { apiGet } from '../services/apiConfig';

/**
 * หน้าตรวจสอบเกียรติบัตร — เปิดสาธารณะ ปลายทางของ QR บนใบ
 *
 * แสดงเฉพาะสิ่งที่พิมพ์อยู่บนใบอยู่แล้ว (ชื่อ ทีม บทบาท เลขที่ รายการ)
 * ไม่มีข้อมูลอื่นของนักเรียนเพิ่ม และรหัสใน URL เป็นตัวสุ่ม ไม่ใช่เลขเรียง
 * จึงไล่ดูรายชื่อคนอื่นด้วยการนับเลขไม่ได้
 */

type Result = {
  found: boolean;
  name?: string;
  team?: string;
  roleLabel?: string;
  certNo?: string;
  tournament?: string;
  issuedAt?: string;
};

type Props = { token: string; onHome: () => void };

const VerifyCertificatePage: React.FC<Props> = ({ token, onHome }) => {
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await apiGet<Result>('verifyCertificate', { token });
        if (alive) setResult(r);
      } catch {
        // ไม่แยกแยะ "หาไม่เจอ" กับ "เรียกไม่ได้" ให้ผู้ใช้เห็น เพราะทั้งสองกรณี
        // สิ่งที่ต้องทำเหมือนกันคือติดต่อผู้จัดงาน
        if (alive) setResult({ found: false });
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [token]);

  const thaiDate = (v?: string) => {
    if (!v) return '';
    const d = new Date(v.replace(' ', 'T'));
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('th-TH',
      { day: 'numeric', month: 'long', year: 'numeric' });
  };

  return (
    <div className="min-h-[100dvh] bg-slate-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        {loading ? (
          <div className="rounded-3xl bg-white border border-slate-200 p-10 text-center text-slate-500">
            <Loader2 className="w-7 h-7 animate-spin mx-auto mb-3" />
            กำลังตรวจสอบ…
          </div>
        ) : result?.found ? (
          <div className="rounded-3xl bg-white border border-emerald-200 overflow-hidden shadow-sm">
            <div className="bg-emerald-50 px-6 py-6 text-center border-b border-emerald-100">
              <BadgeCheck className="w-12 h-12 text-emerald-600 mx-auto" />
              <p className="font-black text-lg text-emerald-900 mt-2">เกียรติบัตรถูกต้อง</p>
              <p className="text-xs text-emerald-700 mt-1">ออกโดยระบบของผู้จัดการแข่งขัน</p>
            </div>
            <dl className="p-6 space-y-4">
              {([['ชื่อผู้รับ', result.name], ['บทบาท', result.roleLabel],
                 ['ทีม / โรงเรียน', result.team], ['เลขที่เกียรติบัตร', result.certNo],
                 ['รายการแข่งขัน', result.tournament],
                 ['วันที่ออกใบ', thaiDate(result.issuedAt)]] as const)
                .filter(([, v]) => Boolean(v))
                .map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-[11px] font-bold text-slate-500">{k}</dt>
                    <dd className="text-sm font-bold text-slate-900 mt-0.5 break-words">{v}</dd>
                  </div>
                ))}
            </dl>
          </div>
        ) : (
          <div className="rounded-3xl bg-white border border-amber-200 overflow-hidden shadow-sm">
            <div className="bg-amber-50 px-6 py-8 text-center border-b border-amber-100">
              <ShieldAlert className="w-12 h-12 text-amber-600 mx-auto" />
              <p className="font-black text-lg text-amber-900 mt-2">ไม่พบเกียรติบัตรนี้</p>
            </div>
            <p className="p-6 text-sm text-slate-600 leading-relaxed">
              รหัสตรวจสอบไม่ถูกต้อง หรือผู้จัดการแข่งขันปิดการตรวจสอบของรายการนี้แล้ว
              หากมั่นใจว่าใบถูกต้อง กรุณาติดต่อผู้จัดงานโดยตรง
            </p>
          </div>
        )}

        <button onClick={onHome}
          className="w-full min-h-12 mt-4 rounded-xl bg-white border border-slate-300
                     font-bold text-slate-700 flex items-center justify-center gap-2">
          <Home className="w-4 h-4" /> ไปหน้าหลัก
        </button>
      </div>
    </div>
  );
};

export default VerifyCertificatePage;
