import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Building2, Check, Loader2, Search, X } from 'lucide-react';
import { apiGet, apiPost, ApiError } from '../services/apiConfig';

/**
 * ถามโรงเรียนต้นสังกัดตอนเข้าระบบครั้งแรก
 *
 * ที่ต้องมี: ผู้ใช้ที่เข้าผ่าน LINE เดิมเป็นแค่ "คนหนึ่ง" ระบบไม่รู้ว่ามาจาก
 * โรงเรียนไหน จึงทำอะไรที่อิงโรงเรียนไม่ได้เลย และแอดมินก็ไล่จับคู่เองไม่ไหว
 * เพราะชื่อ LINE ไม่ได้บอกว่าเป็นครูโรงเรียนอะไร
 *
 * ออกแบบให้ตอบจบใน 2 แตะบนมือถือ เพราะเด้งขึ้นมาขวางตอนเปิดแอปครั้งแรก:
 *   - เลือกจากรายการที่มีในระบบเท่านั้น ไม่ให้พิมพ์ชื่ออิสระ (ชื่อที่พิมพ์เอง
 *     ต่างกันนิดเดียวจะกลายเป็นคนละโรงเรียน แล้วตามรวมทีหลังไม่ได้)
 *   - มีปุ่ม "ไม่ได้สังกัดโรงเรียน" เพราะผู้ปกครองและผู้ชมทั่วไปก็เข้ามาดูเหมือนกัน
 *     ถ้าไม่มีทางออกนี้ เขาจะถูกบังคับให้เลือกมั่ว ๆ แล้วข้อมูลเสียทั้งระบบ
 */

interface SchoolOption {
  schoolId: string;
  schoolName: string;
  district?: string;
  province?: string;
}

interface Props {
  open: boolean;
  displayName?: string;
  onDone: (schoolId: string | null, schoolName: string | null) => void;
  notify?: (title: string, msg?: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
}

const SchoolChooserDialog: React.FC<Props> = ({ open, displayName, onDone, notify }) => {
  const [schools, setSchools] = useState<SchoolOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<SchoolOption | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    apiGet('publicSchools')
      .then(r => { if (alive) setSchools(r.schools ?? []); })
      .catch(() => { if (alive) setSchools([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === '') return schools;
    return schools.filter(s =>
      s.schoolName.toLowerCase().includes(q)
      || (s.district ?? '').toLowerCase().includes(q)
      || (s.province ?? '').toLowerCase().includes(q));
  }, [schools, query]);

  const save = async (school: SchoolOption | null) => {
    setSaving(true);
    try {
      const r = await apiPost('setMySchool', { schoolId: school?.schoolId ?? '' });
      onDone(r.schoolId ?? null, r.schoolName ?? null);
    } catch (e) {
      const err = e as ApiError;
      notify?.('บันทึกไม่สำเร็จ', err.message, 'error');
    } finally { setSaving(false); }
  };

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 flex items-end md:items-center justify-center modal-sheet"
      style={{ zIndex: 2147483644, backgroundColor: 'rgba(2,6,23,0.72)' }}
      role="presentation"
    >
      <div
        className="w-full md:max-w-md rounded-3xl overflow-hidden flex flex-col"
        style={{ backgroundColor: '#ffffff', height: 'min(86vh, 44rem)', maxHeight: 'calc(100vh - 1rem)' }}
        role="dialog"
        aria-modal="true"
        aria-label="เลือกโรงเรียนต้นสังกัด"
        onClick={e => e.stopPropagation()}
      >
        {/* หัวใช้ inline style — คอมโพเนนต์นี้ render ผ่าน portal เหมือนกัน
            คลาสเฉพาะที่นี่อาจไม่ถูกสร้างทันในเบราว์เซอร์ของแอป LINE */}
        <div
          className="px-5 pt-5 pb-4 shrink-0"
          style={{
            backgroundColor: '#4338ca',
            backgroundImage: 'linear-gradient(to bottom right, #4338ca, #6d28d9)',
            color: '#ffffff',
          }}
        >
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 shrink-0" />
            <h2 className="font-black text-lg" style={{ color: '#ffffff' }}>คุณอยู่โรงเรียนอะไร</h2>
          </div>
          <p className="text-xs mt-1.5 leading-relaxed" style={{ color: '#c7d2fe' }}>
            {displayName ? `สวัสดีคุณ ${displayName} — ` : ''}
            เลือกโรงเรียนต้นสังกัดครั้งเดียว ระบบจะจำไว้ให้
            แก้ไขภายหลังได้โดยแจ้งผู้ดูแลระบบ
          </p>
        </div>

        <div className="px-4 pt-3 pb-2 shrink-0">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
            <input
              autoFocus
              className="w-full pl-9 pr-9 py-2.5 border border-slate-300 rounded-xl text-sm"
              placeholder="พิมพ์ชื่อโรงเรียน หรือ อำเภอ"
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
            {query !== '' && (
              <button onClick={() => setQuery('')} className="absolute right-2 top-2.5 p-1 rounded-lg hover:bg-slate-100">
                <X className="w-4 h-4 text-slate-400" />
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 modal-scroll-region">
          {loading ? (
            <div className="py-12 flex justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-400">
              {schools.length === 0
                ? 'โหลดรายชื่อโรงเรียนไม่สำเร็จ — ข้ามไปก่อนได้'
                : 'ไม่พบโรงเรียนที่ค้นหา'}
            </p>
          ) : (
            <div className="space-y-1.5 pb-2">
              {filtered.map(s => {
                const on = picked?.schoolId === s.schoolId;
                return (
                  <button
                    key={s.schoolId}
                    onClick={() => setPicked(s)}
                    className="w-full text-left px-3 py-2.5 rounded-xl border flex items-center gap-2"
                    style={{
                      borderColor: on ? '#6366f1' : '#e2e8f0',
                      backgroundColor: on ? '#eef2ff' : '#ffffff',
                    }}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-slate-800 truncate">{s.schoolName}</p>
                      {(s.district || s.province) && (
                        <p className="text-[11px] text-slate-500 truncate">
                          {[s.district, s.province].filter(Boolean).join(' · ')}
                        </p>
                      )}
                    </div>
                    {on && <Check className="w-4 h-4 shrink-0" style={{ color: '#4f46e5' }} />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div
          className="border-t border-slate-200 p-3 flex gap-2 shrink-0"
          style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
        >
          <button
            onClick={() => save(null)}
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl border-2 border-slate-300 font-bold text-sm text-slate-600 disabled:opacity-50"
          >
            ไม่ได้สังกัดโรงเรียน
          </button>
          <button
            onClick={() => picked && save(picked)}
            disabled={saving || !picked}
            className="flex-[2] py-2.5 rounded-xl font-bold text-sm text-white disabled:opacity-40 flex items-center justify-center gap-2"
            style={{ backgroundColor: picked && !saving ? '#4f46e5' : '#94a3b8' }}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            ยืนยัน
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default SchoolChooserDialog;
