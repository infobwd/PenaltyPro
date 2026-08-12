import React from 'react';
import { Bell } from 'lucide-react';

/**
 * กระดิ่งแจ้งเตือนพร้อมตัวเลขที่ยังไม่อ่าน
 *
 * แยกจาก NotificationCenter เพราะกระดิ่งอยู่บนแถบหัวที่ render ตลอดเวลา
 * ส่วนกล่องข้อความสร้างเมื่อเปิดเท่านั้น — ไม่ต้องโหลดรายการถ้าผู้ใช้ไม่ได้กด
 */

interface Props {
  unreadCount: number;
  onClick: () => void;
  /** true เมื่ออยู่บนพื้นเข้ม (แถบหัวสีม่วง) */
  onDark?: boolean;
  className?: string;
}

const NotificationBell: React.FC<Props> = ({ unreadCount, onClick, onDark = false, className = '' }) => (
  <button
    onClick={onClick}
    aria-label={unreadCount > 0 ? `การแจ้งเตือน ${unreadCount} รายการที่ยังไม่อ่าน` : 'การแจ้งเตือน'}
    className={`relative p-2 rounded-full transition ${
      onDark ? 'hover:bg-white/20 text-white' : 'hover:bg-slate-100 text-slate-600'
    } ${className}`}
  >
    <Bell className="w-5 h-5" />
    {unreadCount > 0 && (
      <span
        className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full
                   text-[10px] font-black flex items-center justify-center"
        style={{ backgroundColor: '#E11D48', color: '#ffffff' }}
      >
        {unreadCount > 99 ? '99+' : unreadCount}
      </span>
    )}
  </button>
);

export default NotificationBell;
