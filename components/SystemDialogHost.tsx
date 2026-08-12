import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, HelpCircle, MessageSquareText, X } from 'lucide-react';
import {
  UI_CONFIRM_EVENT,
  UI_NOTIFY_EVENT,
  UI_PROMPT_EVENT,
  UiConfirmOptions,
  UiNoticeType,
  UiPromptOptions,
} from '../services/uiService';

type DialogRequest =
  | { kind: 'confirm'; message: string; options: UiConfirmOptions; resolve: (value: boolean) => void }
  | { kind: 'prompt'; message: string; options: UiPromptOptions; resolve: (value: string | null) => void };

interface SystemDialogHostProps {
  onNotify: (title: string, message: string, type: UiNoticeType) => void;
}

const SystemDialogHost: React.FC<SystemDialogHostProps> = ({ onNotify }) => {
  const [dialog, setDialog] = useState<DialogRequest | null>(null);
  const [promptValue, setPromptValue] = useState('');
  const queue = useRef<DialogRequest[]>([]);
  const active = useRef<DialogRequest | null>(null);

  useEffect(() => {
    active.current = dialog;
  }, [dialog]);

  useEffect(() => {
    const showNext = () => {
      if (active.current || queue.current.length === 0) return;
      const next = queue.current.shift()!;
      active.current = next;
      setPromptValue(next.kind === 'prompt' ? next.options.initialValue || '' : '');
      setDialog(next);
    };
    const enqueue = (request: DialogRequest) => {
      queue.current.push(request);
      showNext();
    };
    const handleNotify = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      onNotify(detail.title, detail.message || '', detail.type || 'info');
    };
    const handleConfirm = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      enqueue({ kind: 'confirm', message: detail.message, options: detail.options || {}, resolve: detail.resolve });
    };
    const handlePrompt = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      enqueue({ kind: 'prompt', message: detail.message, options: detail.options || {}, resolve: detail.resolve });
    };

    window.addEventListener(UI_NOTIFY_EVENT, handleNotify);
    window.addEventListener(UI_CONFIRM_EVENT, handleConfirm);
    window.addEventListener(UI_PROMPT_EVENT, handlePrompt);
    return () => {
      window.removeEventListener(UI_NOTIFY_EVENT, handleNotify);
      window.removeEventListener(UI_CONFIRM_EVENT, handleConfirm);
      window.removeEventListener(UI_PROMPT_EVENT, handlePrompt);
      if (active.current) active.current.resolve(active.current.kind === 'confirm' ? false : null);
      queue.current.forEach(request => request.resolve(request.kind === 'confirm' ? false : null));
      queue.current = [];
    };
  }, [onNotify]);

  if (!dialog) return null;

  const close = (confirmed: boolean) => {
    if (dialog.kind === 'confirm') dialog.resolve(confirmed);
    else dialog.resolve(confirmed ? promptValue.trim() : null);
    active.current = null;
    setDialog(null);
    window.setTimeout(() => {
      const next = queue.current.shift();
      if (!next) return;
      active.current = next;
      setPromptValue(next.kind === 'prompt' ? next.options.initialValue || '' : '');
      setDialog(next);
    }, 0);
  };

  const options = dialog.options;
  const dangerous = Boolean(options.dangerous);
  const title = options.title || (dialog.kind === 'prompt' ? 'กรอกข้อมูล' : 'ยืนยันรายการ');
  const invalidPrompt = dialog.kind === 'prompt' && options.required && !promptValue.trim();

  return createPortal(
    <div
      className="fixed inset-0 bg-slate-950/65 backdrop-blur-sm modal-sheet flex items-end xl:items-center justify-center p-0 xl:p-4"
      style={{ zIndex: 2147483647 }}
      role="presentation"
      onClick={() => close(false)}
    >
      <div
        className="bg-white w-full max-w-sm rounded-t-3xl xl:rounded-3xl shadow-2xl overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="system-dialog-title"
        onClick={event => event.stopPropagation()}
      >
        <div className={`h-1.5 ${dangerous ? 'bg-red-500' : 'bg-gradient-to-r from-indigo-500 to-violet-500'}`} />
        <div className="p-5 sm:p-6 safe-area-bottom">
          <div className="flex items-start gap-3">
            <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${dangerous ? 'bg-red-50 text-red-600' : 'bg-indigo-50 text-indigo-600'}`}>
              {dangerous ? <AlertTriangle className="w-6 h-6" /> : dialog.kind === 'prompt' ? <MessageSquareText className="w-6 h-6" /> : <HelpCircle className="w-6 h-6" />}
            </div>
            <div className="min-w-0 flex-1">
              <h2 id="system-dialog-title" className="font-black text-lg text-slate-900">{title}</h2>
              <p className="text-sm text-slate-600 whitespace-pre-line mt-1 leading-relaxed">{dialog.message}</p>
            </div>
            <button type="button" onClick={() => close(false)} className="p-2 -mr-2 -mt-2 rounded-full text-slate-400 hover:bg-slate-100" aria-label="ปิด">
              <X className="w-5 h-5" />
            </button>
          </div>

          {dialog.kind === 'prompt' && (
            <input
              autoFocus
              value={promptValue}
              onChange={event => setPromptValue(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter' && !invalidPrompt) close(true);
              }}
              placeholder={options.placeholder || ''}
              className="w-full mt-5 p-3.5 rounded-xl border border-slate-300 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          )}

          <div className="grid grid-cols-2 gap-3 mt-6">
            <button type="button" onClick={() => close(false)} className="py-3 rounded-xl border border-slate-300 text-slate-600 font-bold hover:bg-slate-50">
              {options.cancelText || 'ยกเลิก'}
            </button>
            <button
              type="button"
              disabled={invalidPrompt}
              onClick={() => close(true)}
              className={`py-3 rounded-xl text-white font-bold shadow-lg disabled:opacity-40 ${dangerous ? 'bg-red-600 hover:bg-red-700 shadow-red-200' : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200'}`}
            >
              {options.confirmText || 'ยืนยัน'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default SystemDialogHost;
