import React, { useMemo, useState } from 'react';
import { Check, Copy, Heart, QrCode, ShieldCheck } from 'lucide-react';
import { AppSettings } from '../types';

type Props = {
  config: AppSettings;
  onDonate: () => void;
  compact?: boolean;
  className?: string;
};

export const sponsorDonationDetails = (config: AppSettings) => {
  const useExisting = config.sponsorDonationUseExistingBank !== false;
  return {
    enabled: config.sponsorDonationEnabled !== false,
    qrUrl: config.sponsorDonationQrUrl || '',
    bankName: useExisting ? config.bankName : (config.sponsorDonationBankName || ''),
    bankAccount: useExisting ? config.bankAccount : (config.sponsorDonationBankAccount || ''),
    accountName: useExisting ? config.accountName : (config.sponsorDonationAccountName || ''),
  };
};

const isUsefulValue = (value?: string) => Boolean(value && value.trim() && value.trim() !== '-');

const SponsorDonationCard: React.FC<Props> = ({ config, onDonate, compact = false, className = '' }) => {
  const [copied, setCopied] = useState(false);
  const details = useMemo(() => sponsorDonationDetails(config), [config]);
  const hasAccount = isUsefulValue(details.bankAccount);
  if (!details.enabled || (!details.qrUrl && !hasAccount)) return null;

  const copyAccount = async () => {
    if (!hasAccount) return;
    try {
      await navigator.clipboard.writeText(details.bankAccount);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch { /* อุปกรณ์บางรุ่นไม่อนุญาต clipboard แต่ยังเลือกเลขบัญชีเองได้ */ }
  };

  return (
    <section className={`overflow-hidden rounded-3xl border border-pink-100 bg-gradient-to-br from-white via-pink-50 to-indigo-50 shadow-sm ${compact ? 'p-4 sm:p-5' : 'p-5 sm:p-7'} ${className}`}
      aria-label="ช่องทางสนับสนุนการแข่งขัน">
      <div className={`flex ${compact ? 'flex-col sm:flex-row' : 'flex-col md:flex-row'} items-center gap-4 sm:gap-6`}>
        {details.qrUrl ? (
          <div className={`relative ${compact ? 'w-28 h-28' : 'w-36 h-36'} rounded-2xl bg-white border border-slate-200 p-2 shadow-sm shrink-0 flex items-center justify-center text-slate-300`}>
            <QrCode className="w-10 h-10" />
            <img src={details.qrUrl} alt="QR Code สำหรับสนับสนุนการแข่งขัน"
              onError={event => { event.currentTarget.style.display = 'none'; }}
              className="absolute inset-2 w-[calc(100%-1rem)] h-[calc(100%-1rem)] object-contain bg-white" />
          </div>
        ) : (
          <div className={`${compact ? 'w-20 h-20' : 'w-24 h-24'} rounded-2xl bg-pink-100 text-pink-600 flex items-center justify-center shrink-0`}>
            <QrCode className="w-10 h-10" />
          </div>
        )}

        <div className="min-w-0 flex-1 text-center sm:text-left">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 text-emerald-700 px-2.5 py-1 text-[11px] font-bold">
            <ShieldCheck className="w-3.5 h-3.5" /> ตรวจสอบสลิปผ่านระบบเดิม
          </div>
          <h2 className={`${compact ? 'text-lg' : 'text-xl sm:text-2xl'} font-black text-slate-900 mt-2`}>ร่วมสนับสนุนการแข่งขัน</h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">โอนแล้วแนบสลิปเพื่อให้เจ้าภาพหรือผู้ดูแลตรวจสอบและยืนยันยอด</p>

          {hasAccount && (
            <button type="button" onClick={() => void copyAccount()}
              className="mt-3 max-w-full rounded-xl border border-indigo-200 bg-white px-3 py-2 text-left hover:bg-indigo-50 transition">
              <span className="block text-[10px] text-slate-500">{details.bankName || 'บัญชีรับการสนับสนุน'} · {details.accountName || 'ชื่อบัญชีตามระบบ'}</span>
              <span className="flex items-center justify-center sm:justify-start gap-2 font-mono font-black text-indigo-700 break-all">
                {details.bankAccount} {copied ? <Check className="w-4 h-4 text-emerald-600 shrink-0" /> : <Copy className="w-4 h-4 shrink-0" />}
              </span>
            </button>
          )}
        </div>

        <button type="button" onClick={onDonate}
          className="w-full sm:w-auto min-h-12 px-5 rounded-xl bg-pink-600 hover:bg-pink-700 text-white font-black flex items-center justify-center gap-2 shadow-lg shadow-pink-200 shrink-0">
          <Heart className="w-5 h-5 fill-current" /> ร่วมบริจาค / แจ้งโอน
        </button>
      </div>
    </section>
  );
};

export default SponsorDonationCard;
