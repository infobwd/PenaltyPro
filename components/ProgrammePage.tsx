import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Download, Loader2, Printer, Share2 } from 'lucide-react';
import { AppSettings, Match, Player, Team, Tournament } from '../types';
import { buildProgrammeHtml } from '../services/programmeService';

/**
 * หน้าสูจิบัตร — เป็นหน้าของตัวเองที่ /programme
 *
 * ทำไมไม่ใช้ window.open เหมือนเดิม: เบราว์เซอร์จำนวนมากบล็อกป๊อปอัป
 * โดยเฉพาะเบราว์เซอร์ในแอป LINE และ Safari บน iOS ที่บล็อกแทบทุกกรณี
 * ผู้ใช้กดปุ่มแล้วไม่มีอะไรเกิดขึ้น และไม่มีทางรู้ว่าต้องไปปลดล็อกตรงไหน
 *
 * หน้านี้ฝังเอกสารไว้ใน iframe ของตัวเอง จึงเปิดได้เสมอ รีเฟรชได้ แชร์ลิงก์ได้
 * และยังสั่งพิมพ์ได้เหมือนเดิม
 */

interface Props {
  tournament: Tournament | null;
  config: AppSettings;
  teams: Team[];
  players: Player[];
  matches: Match[];
  onBack: () => void;
}

const ProgrammePage: React.FC<Props> = ({
  tournament, config, teams, players, matches, onBack,
}) => {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);

  const html = useMemo(
    () => buildProgrammeHtml({ tournament, config, teams, players, matches }),
    [tournament, config, teams, players, matches]);

  // เขียนเอกสารลง iframe ตรง ๆ ไม่ผ่าน blob URL
  // เพราะ blob: ถูกบล็อกในเบราว์เซอร์ของแอป LINE บางเวอร์ชัน
  useEffect(() => {
    const doc = frameRef.current?.contentDocument;
    if (!doc) return;
    doc.open();
    doc.write(html);
    doc.close();
    setReady(true);
  }, [html]);

  /** สั่งพิมพ์เฉพาะเนื้อในกรอบ ไม่ใช่ทั้งหน้าเว็บ */
  const print = () => {
    const win = frameRef.current?.contentWindow;
    if (!win) return;
    win.focus();
    win.print();
  };

  /** ดาวน์โหลดเป็นไฟล์ .html เผื่อเครื่องที่สั่งพิมพ์เป็น PDF ไม่ได้ */
  const download = () => {
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `สูจิบัตร-${(tournament?.name || 'การแข่งขัน').replace(/[\\/:*?"<>|]/g, '')}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: `สูจิบัตร ${tournament?.name ?? ''}`, url });
        return;
      }
      await navigator.clipboard.writeText(url);
    } catch { /* ผู้ใช้ยกเลิก หรือเบราว์เซอร์ไม่รองรับ — ไม่ต้องทำอะไรต่อ */ }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      <div className="bg-white border-b border-slate-200 sticky top-0 z-20 px-3 py-2
                      flex items-center gap-2 shadow-sm">
        <button onClick={onBack} className="p-2 rounded-full hover:bg-slate-100 text-slate-600 shrink-0">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="font-bold text-slate-800 truncate flex-1 text-sm sm:text-base">
          สูจิบัตรการแข่งขัน
        </h1>
        <button onClick={share} title="แชร์ลิงก์หน้านี้"
          className="p-2 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 shrink-0">
          <Share2 className="w-4 h-4" />
        </button>
        <button onClick={download} title="ดาวน์โหลดไฟล์"
          className="p-2 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 shrink-0">
          <Download className="w-4 h-4" />
        </button>
        <button onClick={print}
          className="px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-bold
                     hover:bg-indigo-700 flex items-center gap-1.5 shrink-0">
          <Printer className="w-4 h-4" /> <span className="hidden sm:inline">พิมพ์ / PDF</span>
        </button>
      </div>

      <div className="flex-1 relative">
        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
          </div>
        )}
        <iframe
          ref={frameRef}
          title="สูจิบัตรการแข่งขัน"
          className="w-full h-full border-0"
          style={{ minHeight: 'calc(100dvh - 3.5rem)', paddingBottom: '5rem' }}
        />
      </div>
    </div>
  );
};

export default ProgrammePage;
