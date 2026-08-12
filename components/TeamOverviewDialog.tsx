import React from 'react';
import { createPortal } from 'react-dom';
import { MapPin, Shield, Shirt, UserRound, Users, X } from 'lucide-react';
import { Player, Team } from '../types';

interface TeamOverviewDialogProps {
  team: Team | null;
  players: Player[];
  onClose: () => void;
}

const TeamOverviewDialog: React.FC<TeamOverviewDialogProps> = ({ team, players, onClose }) => {
  if (!team) return null;
  const roster = players.filter(player => player.teamId === team.id);
  const location = [team.district, team.province].filter(Boolean).join(', ');

  return createPortal(
    <div
      className="fixed inset-0 bg-slate-950/65 backdrop-blur-sm modal-sheet modal-inset-mobile modal-contained flex items-end xl:items-center justify-center p-0 xl:p-4 overflow-hidden"
      style={{ zIndex: 2147483645 }}
      onClick={onClose}
      role="presentation"
    >
      <div
        className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden flex flex-col"
        style={{
          // ความสูงคุมด้วย inline เพราะคลาส h-[min(88dvh,...)] มีที่นี่ที่เดียว
          // เบราว์เซอร์เก่าที่ไม่รู้จัก dvh จะข้ามบรรทัดนี้แล้วใช้ vh แทนเอง
          height: 'min(88vh, 52rem)',
          maxHeight: 'calc(100vh - 1rem)',
          isolation: 'isolate',
        }}
        role="dialog"
        aria-modal="true"
        aria-label={`รายละเอียดทีม ${team.name}`}
        onClick={event => event.stopPropagation()}
      >
        {/*
          ส่วนหัวใช้ inline style ไม่ใช่คลาส Tailwind โดยตั้งใจ

          Tailwind ในโปรเจกต์นี้โหลดจาก cdn.tailwindcss.com ซึ่งคอมไพล์คลาสตอน
          รันในเบราว์เซอร์ กล่องนี้ถูก render ผ่าน createPortal เข้า DOM ทีหลัง
          คลาสที่ "มีที่นี่ที่เดียว" (from-indigo-700, text-indigo-200, bg-white/15)
          จึงมีโอกาสไม่ถูกสร้าง CSS ให้ทันในเบราว์เซอร์ในแอป LINE
          ผลคือพื้นหลังหายกลายเป็นขาว แล้วตัวอักษรสีขาวจมหายไปทั้งบล็อก
          (คลาสอย่าง text-white / rounded-full ยังทำงาน เพราะหน้าอื่นใช้อยู่แล้ว)

          inline style ไม่พึ่ง Tailwind เลย จึงแสดงผลถูกต้องทุกเบราว์เซอร์
          และ backgroundColor ทึบทำหน้าที่เป็นพื้นสำรองถ้า gradient ไม่รองรับ
        */}
        <div
          className="relative shrink-0 px-4 sm:px-5 pt-5 sm:pt-6 pb-10 sm:pb-12"
          style={{
            backgroundColor: '#4338ca',
            backgroundImage: 'linear-gradient(to bottom right, #4338ca, #6d28d9)',
            color: '#ffffff',
          }}
        >
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-full"
            style={{ backgroundColor: 'rgba(255,255,255,0.18)', color: '#ffffff' }}
            aria-label="ปิด"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-4 pr-10">
            <div
              className="w-20 h-20 rounded-2xl p-2 flex items-center justify-center shrink-0"
              style={{ backgroundColor: '#ffffff', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.25)' }}
            >
              {team.logoUrl ? <img src={team.logoUrl} alt="" className="w-full h-full object-contain" /> : <Shield className="w-10 h-10" style={{ color: '#a5b4fc' }} />}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold" style={{ color: '#c7d2fe' }}>ทีมแข่งขัน</p>
              <h2 className="text-xl font-black leading-tight mt-1" style={{ color: '#ffffff' }}>{team.name}</h2>
              <div className="flex flex-wrap gap-2 mt-2 text-xs">
                <span
                  className="px-2.5 py-1 rounded-full"
                  style={{ backgroundColor: 'rgba(255,255,255,0.18)', color: '#ffffff' }}
                >
                  สาย {team.group || 'ยังไม่จัดสาย'}
                </span>
                <span
                  className="px-2.5 py-1 rounded-full"
                  style={{ backgroundColor: 'rgba(52,211,153,0.25)', color: '#d1fae5' }}
                >
                  {team.status === 'Approved' ? 'ยืนยันแล้ว' : 'รอตรวจสอบ'}
                </span>
                {team.isPaid && (
                  <span
                    className="px-2.5 py-1 rounded-full font-bold"
                    style={{ backgroundColor: 'rgba(250,204,21,0.28)', color: '#fef9c3' }}
                  >
                    ชำระค่าสมัครแล้ว
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div
          className="relative flex-1 modal-scroll-region bg-white rounded-t-3xl px-4 pt-5"
          style={{
            marginTop: '-1.25rem',
            paddingLeft: 'max(1rem, env(safe-area-inset-left))',
            paddingRight: 'max(1rem, env(safe-area-inset-right))',
            paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom))',
          }}
        >
          <div className="grid grid-cols-2 gap-3 mb-5">
            <div className="rounded-2xl bg-indigo-50 p-3">
              <Users className="w-5 h-5 text-indigo-600 mb-2" />
              <p className="text-2xl font-black text-slate-900">{roster.length}</p>
              <p className="text-xs text-slate-500">นักกีฬาในระบบ</p>
            </div>
            <div className="rounded-2xl p-3" style={{ backgroundColor: '#f5f3ff' }}>
              <Shirt className="w-5 h-5 text-violet-600 mb-2" />
              <p className="text-lg font-black text-slate-900 truncate">{team.shortName || '-'}</p>
              <p className="text-xs text-slate-500">ชื่อย่อทีม</p>
            </div>
          </div>

          {(location || team.managerName || team.coachName) && (
            <div className="space-y-2 mb-5 text-sm text-slate-600">
              {location && <div className="flex gap-2"><MapPin className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" /><span>{location}</span></div>}
              {team.managerName && <div className="flex gap-2"><UserRound className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" /><span>ผู้จัดการทีม: {team.managerName}</span></div>}
              {team.coachName && <div className="flex gap-2"><UserRound className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" /><span>ผู้ฝึกสอน: {team.coachName}</span></div>}
            </div>
          )}

          <h3 className="font-black text-slate-800 mb-3">รายชื่อนักกีฬา</h3>
          {roster.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-400">ยังไม่มีรายชื่อนักกีฬาในระบบ</div>
          ) : (
            <div className="space-y-2">
              {roster.map(player => (
                <div key={player.id} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 p-2.5">
                  {player.photoUrl ? <img src={player.photoUrl} alt="" className="w-10 h-10 rounded-full object-cover bg-white" /> : <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-black">{player.number || '-'}</div>}
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-sm text-slate-800 truncate">{player.name}</p>
                    <p className="text-xs text-slate-500">#{player.number || '-'} {player.position ? `· ${player.position}` : ''}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default TeamOverviewDialog;
