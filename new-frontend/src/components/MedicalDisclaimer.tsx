import React from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, ShieldCheck } from 'lucide-react';

export function MedicalDisclaimerBanner() {
  const { t } = useTranslation();
  return (
    <div
      id="medical-disclaimer-banner"
      className="bg-amber-50 border-b border-amber-200 px-4 sm:px-6 py-2 text-xs text-amber-900 flex flex-wrap items-center justify-between gap-2"
    >
      <div className="flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
        <span className="font-black text-amber-950 uppercase tracking-wider text-[11px]">{t('disclaimer.bannerLabel')}</span>
        <span className="text-[11px] font-medium text-amber-900/90">{t('disclaimer.bannerText')}</span>
      </div>
      <div className="flex items-center gap-3 text-amber-800 font-bold text-[10px] uppercase tracking-wider">
        <span className="flex items-center gap-1">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
          {t('disclaimer.icdrCalibrated')}
        </span>
      </div>
    </div>
  );
}

export function MedicalDisclaimerFooter() {
  const { t } = useTranslation();
  return (
    <footer
      id="medical-footer"
      className="h-9 bg-slate-200 border-t border-slate-300 flex items-center justify-between px-4 sm:px-8 text-[9px] font-bold text-slate-500 uppercase tracking-widest"
    >
      <div className="flex items-center gap-2">
        <span className="font-black text-slate-700">NETRA v2.4.0</span>
        <span className="text-slate-400">•</span>
        <span>{t('disclaimer.footerDemoEnv')}</span>
      </div>
      <div className="hidden sm:block text-slate-500 font-medium">
        {t('disclaimer.footerTagline')}
      </div>
    </footer>
  );
}

export const MedicalFooter = MedicalDisclaimerFooter;

