import React, { useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Download, ExternalLink, FileText, X } from 'lucide-react';

type Props = {
  url: string;
  title?: string;
  onClose: () => void;
};

const previewUrl = (url: string): string => {
  const driveFile = url.match(/drive\.google\.com\/file\/d\/([^/]+)/i);
  if (driveFile?.[1]) return `https://drive.google.com/file/d/${driveFile[1]}/preview`;

  const driveId = url.match(/[?&]id=([^&]+)/i);
  if (url.includes('drive.google.com') && driveId?.[1]) {
    return `https://drive.google.com/file/d/${driveId[1]}/preview`;
  }

  return url;
};

const ProjectDocumentPreview: React.FC<Props> = ({ url, title = 'รายละเอียดโครงการ', onClose }) => {
  const src = useMemo(() => previewUrl(url), [url]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[10020] flex items-end sm:items-center sm:justify-center bg-slate-950/60 backdrop-blur-sm sm:p-5" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" className="absolute inset-0 cursor-default" aria-label="ปิดหน้าต่าง" onClick={onClose} />
      <section className="relative flex h-[calc(100dvh-4rem)] w-full flex-col overflow-hidden rounded-t-[2rem] bg-white shadow-2xl sm:h-[min(88dvh,900px)] sm:max-w-5xl sm:rounded-3xl">
        <header className="flex shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:px-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
            <FileText className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-black text-slate-900">{title}</p>
            <p className="text-xs text-slate-500">เลื่อนเพื่ออ่านเอกสาร หรือเปิดไฟล์เต็มหน้าจอ</p>
          </div>
          <a href={url} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-700 hover:bg-slate-50">
            <ExternalLink className="h-4 w-4" /> <span className="hidden sm:inline">เปิดเต็มหน้า</span>
          </a>
          <button type="button" onClick={onClose} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200" aria-label="ปิด">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="min-h-0 flex-1 bg-slate-100">
          <iframe src={src} title={title} className="h-full w-full border-0 bg-white" allow="fullscreen" />
        </div>

        <footer className="safe-area-bottom flex shrink-0 gap-2 border-t border-slate-200 bg-white p-3 sm:hidden">
          <a href={url} target="_blank" rel="noreferrer" className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 font-bold text-white">
            <ExternalLink className="h-4 w-4" /> เปิดไฟล์เต็มหน้า
          </a>
          <a href={url} download className="flex min-h-12 items-center justify-center rounded-xl border border-slate-200 px-4 font-bold text-slate-700" aria-label="ดาวน์โหลดเอกสาร">
            <Download className="h-4 w-4" />
          </a>
        </footer>
      </section>
    </div>,
    document.body,
  );
};

export default ProjectDocumentPreview;
