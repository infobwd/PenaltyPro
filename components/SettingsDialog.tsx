import React, { useState, useEffect } from 'react';
import { X, Save, Database, HelpCircle, Image } from 'lucide-react';
import { getStoredScriptUrl, setStoredScriptUrl } from '../services/sheetService';
import { AppSettings } from '../types';

interface SettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  currentSettings?: AppSettings;
}

const SettingsDialog: React.FC<SettingsDialogProps> = ({ isOpen, onClose, onSave, currentSettings }) => {
  const [url, setUrl] = useState('');

  useEffect(() => {
    if (isOpen) {
      setUrl(getStoredScriptUrl() || '');
    }
  }, [isOpen]);

  const handleSave = () => {
    setStoredScriptUrl(url);
    onSave();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1300] p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
        <div className="bg-slate-900 text-white p-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5" />
            <h2 className="font-bold text-lg">ตั้งค่าการเชื่อมต่อ</h2>
          </div>
          <button onClick={onClose} className="hover:bg-slate-700 p-1 rounded-full transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              Google Apps Script Web App URL
            </label>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://script.google.com/macros/s/..."
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm font-mono"
            />
            <div className="text-xs text-gray-500 flex items-start gap-1 bg-blue-50 p-2 rounded">
              <HelpCircle className="w-3 h-3 mt-0.5 flex-shrink-0 text-blue-500" />
              <p>Deploy โค้ด Code.gs เป็น Web App โดยตั้งค่า Access เป็น "Anyone" แล้วนำ URL มาวางที่นี่</p>
            </div>
          </div>
          
          {currentSettings && (
             <div className="pt-4 border-t border-gray-100 text-sm text-gray-500">
                 <p>โลโก้การแข่งขัน: <br/><span className="font-mono text-xs truncate block text-gray-400">{currentSettings.competitionLogo}</span></p>
                 <p className="mt-1">หมายเหตุ: การตั้งค่าอื่นๆ ให้ทำผ่านหน้า Admin Dashboard</p>
             </div>
          )}

          <button
            onClick={handleSave}
            className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl transition"
          >
            <Save className="w-4 h-4" />
            บันทึกและเชื่อมต่อ
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsDialog;