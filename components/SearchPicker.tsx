import React, { useEffect, useRef, useState } from 'react';
import { Search, Check, X, Loader2 } from 'lucide-react';

/**
 * ช่องเลือกแบบค้นหาได้
 *
 * ที่ต้องมี: หน้าแอดมินเดิมให้พิมพ์ `school_id` / `user_id` เอง (เช่น 71020010,
 * U_1699...) ซึ่งไม่มีใครจำได้ และพิมพ์ผิดไปนิดเดียวก็ผูกผิดคน/ผิดโรงเรียน
 * โดยระบบไม่มีทางรู้ เพราะเป็น id ที่ถูกต้องตามรูปแบบเหมือนกัน
 */

export interface PickerItem {
  id: string;
  label: string;
  sub?: string;
  badge?: string;
}

interface Props {
  value: string;
  onChange: (id: string, item?: PickerItem) => void;
  /** โหลดรายการ — ถ้ารับ query ไปด้วยแปลว่าค้นหาที่ server */
  load: (query: string) => Promise<PickerItem[]>;
  placeholder?: string;
  /** ค้นที่ server (debounce) แทนการกรองในเครื่อง */
  serverSearch?: boolean;
  emptyText?: string;
}

const SearchPicker: React.FC<Props> = ({
  value, onChange, load, placeholder = 'ค้นหา...', serverSearch = false,
  emptyText = 'ไม่พบรายการ',
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<PickerItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<PickerItem | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  // โหลดรายการตั้งต้นครั้งเดียว เพื่อให้กดแล้วเห็นตัวเลือกทันทีโดยไม่ต้องพิมพ์
  useEffect(() => {
    let alive = true;
    setLoading(true);
    load('').then(list => { if (alive) setItems(list); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  // ค้นที่ server แบบหน่วง — ไม่ยิงทุกตัวอักษร
  useEffect(() => {
    if (!serverSearch || !open) return;
    const t = setTimeout(() => {
      setLoading(true);
      load(query).then(setItems).finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(t);
  }, [query, serverSearch, open]);

  // ปิดเมื่อคลิกนอกกล่อง
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  useEffect(() => {
    if (value && !selected) {
      const found = items.find(i => i.id === value);
      if (found) setSelected(found);
    }
    if (!value) setSelected(null);
  }, [value, items]);

  const visible = serverSearch
    ? items
    : items.filter(i =>
        !query
        || i.label.toLowerCase().includes(query.toLowerCase())
        || i.sub?.toLowerCase().includes(query.toLowerCase())
        || i.id.toLowerCase().includes(query.toLowerCase()));

  const pick = (item: PickerItem) => {
    setSelected(item);
    onChange(item.id, item);
    setOpen(false);
    setQuery('');
  };

  return (
    <div className="relative" ref={boxRef}>
      {selected ? (
        <div className="flex items-center gap-2 w-full px-3 py-2.5 border border-indigo-300 bg-indigo-50 rounded-xl">
          <Check className="w-4 h-4 text-indigo-600 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-800 truncate">{selected.label}</p>
            {selected.sub && <p className="text-[11px] text-slate-500 truncate">{selected.sub}</p>}
          </div>
          <button type="button"
            onClick={() => { setSelected(null); onChange(''); setOpen(true); }}
            className="p-1 text-slate-400 hover:text-rose-600 shrink-0" title="เปลี่ยน">
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={e => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            placeholder={placeholder}
            className="w-full pl-9 pr-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none"
          />
          {loading && (
            <Loader2 className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 animate-spin" />
          )}
        </div>
      )}

      {open && !selected && (
        <div className="absolute z-50 mt-1 w-full max-h-64 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-lg">
          {visible.length === 0 && !loading && (
            <p className="px-3 py-4 text-sm text-slate-400 text-center">{emptyText}</p>
          )}
          {visible.map(item => (
            <button
              key={item.id}
              type="button"
              onClick={() => pick(item)}
              className="w-full text-left px-3 py-2.5 hover:bg-indigo-50 border-b border-slate-100 last:border-0 flex items-center gap-2"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm text-slate-800 truncate">{item.label}</p>
                {item.sub && <p className="text-[11px] text-slate-500 truncate">{item.sub}</p>}
              </div>
              {item.badge && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 shrink-0">
                  {item.badge}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default SearchPicker;
