
import React, { useEffect } from 'react';
import { CheckCircle, AlertCircle, XCircle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastMessage {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
}

interface ToastProps {
  toast: ToastMessage;
  onClose: (id: string) => void;
}

const Toast: React.FC<ToastProps> = ({ toast, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose(toast.id);
    }, 3000); // Auto close after 3 seconds

    return () => clearTimeout(timer);
  }, [toast.id, onClose]);

  const styles = {
    success: 'bg-white border-l-4 border-green-500 text-slate-800',
    error: 'bg-white border-l-4 border-red-500 text-slate-800',
    warning: 'bg-white border-l-4 border-orange-500 text-slate-800',
    info: 'bg-white border-l-4 border-blue-500 text-slate-800',
  };

  const icons = {
    success: <CheckCircle className="w-6 h-6 text-green-500" />,
    error: <XCircle className="w-6 h-6 text-red-500" />,
    warning: <AlertCircle className="w-6 h-6 text-orange-500" />,
    info: <Info className="w-6 h-6 text-blue-500" />,
  };

  return (
    <div className={`${styles[toast.type]} shadow-lg rounded-lg p-4 flex items-start gap-3 min-w-[300px] max-w-md animate-in slide-in-from-right-10 fade-in duration-300 relative overflow-hidden`}>
      <div className="shrink-0 mt-0.5">{icons[toast.type]}</div>
      <div className="flex-1 mr-4">
        <h4 className="font-bold text-sm">{toast.title}</h4>
        {toast.message && <p className="text-xs text-slate-500 mt-1">{toast.message}</p>}
      </div>
      <button 
        onClick={() => onClose(toast.id)} 
        className="absolute top-2 right-2 text-slate-300 hover:text-slate-500 transition"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};

interface ToastContainerProps {
  toasts: ToastMessage[];
  removeToast: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, removeToast }) => {
  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
      <div className="pointer-events-auto flex flex-col gap-2">
        {toasts.map((t) => (
          <Toast key={t.id} toast={t} onClose={removeToast} />
        ))}
      </div>
    </div>
  );
};
