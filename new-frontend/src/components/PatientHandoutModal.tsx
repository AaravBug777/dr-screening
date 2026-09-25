import React, { useMemo, useState } from 'react';
import { ScreeningRecord } from '../types';
import i18n, { SUPPORTED_LANGUAGES } from '../i18n';
import {
  X,
  Printer,
  Languages,
  Apple,
  Droplet,
  Activity,
  CalendarClock,
  Stethoscope,
  AlertTriangle,
  Eye
} from 'lucide-react';

interface PatientHandoutModalProps {
  record: ScreeningRecord | null;
  onClose: () => void;
}

// Illustrated, low-literacy-friendly take-home advisory -- deliberately
// independent of the app's own UI language (i18n.getFixedT), since the
// operator's working language and the patient's own language are often
// different. Printed via the browser's native print dialog (which the
// operator can "Save as PDF" from) rather than a jsPDF-rendered PDF --
// jsPDF's built-in fonts don't cover Indic scripts, and embedding one
// custom font per script would be a lot of weight for what the browser
// already renders correctly out of the box.
export function PatientHandoutModal({ record, onClose }: PatientHandoutModalProps) {
  const [lang, setLang] = useState(i18n.language);
  const t = useMemo(() => i18n.getFixedT(lang), [lang]);

  if (!record) return null;

  const p = record.patientInfo;
  const g = record.grading;
  const stageKey = g.stage;
  const timeframeKey = record.referral.priority;
  const isUrgent = timeframeKey === 'EMERGENCY' || timeframeKey === 'HIGH';
  const isGood = stageKey === 'NO_DR';

  const handlePrint = () => window.print();

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 print:bg-white print:p-0 print:static">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #netra-handout-print, #netra-handout-print * { visibility: visible; }
          #netra-handout-print { position: absolute; top: 0; left: 0; width: 100%; }
          .no-print { display: none !important; }
        }
      `}</style>

      <div className="bg-white rounded-2xl max-w-xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh] print:max-h-none print:shadow-none print:border-0 print:rounded-none">
        {/* Toolbar */}
        <div className="no-print bg-slate-900 text-white p-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-bold">
            <Languages className="w-4 h-4 text-cyan-400" />
            <span>{t('handout.modalTitle')}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="px-3 py-1.5 bg-cyan-700 hover:bg-cyan-600 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>{t('handout.print')}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Language picker */}
        <div className="no-print px-4 py-2.5 border-b border-slate-200 bg-slate-50 flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mr-1">
            {t('handout.selectLanguage')}:
          </span>
          {SUPPORTED_LANGUAGES.map((l) => (
            <button
              key={l.code}
              type="button"
              onClick={() => setLang(l.code)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                lang === l.code
                  ? 'bg-cyan-700 text-white border-cyan-700'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
              }`}
            >
              {l.nativeName}
            </button>
          ))}
        </div>

        {/* Printable Content */}
        <div id="netra-handout-print" className="p-6 space-y-5 overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white">
                <Eye className="w-5 h-5" />
              </div>
              <div>
                <div className="text-lg font-black text-slate-900">{t('handout.title')}</div>
                <div className="text-[11px] text-slate-500">NETRA</div>
              </div>
            </div>
          </div>

          {/* Patient meta */}
          <div className="grid grid-cols-2 gap-2.5 text-xs bg-slate-50 rounded-xl p-3.5 border border-slate-200">
            <div>
              <span className="text-slate-400 block text-[10px] uppercase font-bold">{t('handout.patientLabel')}</span>
              <span className="font-bold text-slate-900">{p.patientId}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] uppercase font-bold">{t('handout.dateLabel')}</span>
              <span className="font-bold text-slate-900">{record.createdAt}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] uppercase font-bold">{t('handout.clinicLabel')}</span>
              <span className="font-bold text-slate-900">{p.screeningCenter}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] uppercase font-bold">{t('handout.eyeLabel')}</span>
              <span className="font-bold text-slate-900">{record.eyeSide}</span>
            </div>
          </div>

          {/* Result */}
          <div>
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">{t('handout.resultHeading')}</h3>
            <div
              className={`rounded-xl p-4 border-2 flex items-start gap-3 ${
                isGood
                  ? 'bg-emerald-50 border-emerald-300'
                  : isUrgent
                  ? 'bg-rose-50 border-rose-300'
                  : 'bg-amber-50 border-amber-300'
              }`}
            >
              <Eye className={`w-6 h-6 shrink-0 mt-0.5 ${isGood ? 'text-emerald-600' : isUrgent ? 'text-rose-600' : 'text-amber-600'}`} />
              <p className={`text-sm font-semibold leading-relaxed ${isGood ? 'text-emerald-900' : isUrgent ? 'text-rose-900' : 'text-amber-900'}`}>
                {t(`handout.stage.${stageKey}`)}
              </p>
            </div>
          </div>

          {/* Next Steps */}
          <div>
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">{t('handout.nextStepsHeading')}</h3>
            <div className="rounded-xl p-4 border border-slate-200 bg-white flex items-start gap-3">
              <CalendarClock className="w-6 h-6 shrink-0 mt-0.5 text-cyan-700" />
              <p className="text-sm font-semibold text-slate-800 leading-relaxed">{t(`handout.timeframe.${timeframeKey}`)}</p>
            </div>
          </div>

          {/* Everyday Care -- pictorial */}
          <div>
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">{t('handout.careHeading')}</h3>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="rounded-xl p-3 border border-slate-200 bg-white flex items-start gap-2.5">
                <Apple className="w-5 h-5 shrink-0 text-emerald-600 mt-0.5" />
                <p className="text-xs text-slate-700 leading-relaxed">{t('handout.careDiet')}</p>
              </div>
              <div className="rounded-xl p-3 border border-slate-200 bg-white flex items-start gap-2.5">
                <Droplet className="w-5 h-5 shrink-0 text-rose-500 mt-0.5" />
                <p className="text-xs text-slate-700 leading-relaxed">{t('handout.careSugar')}</p>
              </div>
              <div className="rounded-xl p-3 border border-slate-200 bg-white flex items-start gap-2.5">
                <Activity className="w-5 h-5 shrink-0 text-indigo-600 mt-0.5" />
                <p className="text-xs text-slate-700 leading-relaxed">{t('handout.careExercise')}</p>
              </div>
              <div className="rounded-xl p-3 border border-slate-200 bg-white flex items-start gap-2.5">
                <Stethoscope className="w-5 h-5 shrink-0 text-cyan-700 mt-0.5" />
                <p className="text-xs text-slate-700 leading-relaxed">{t('handout.careCheckup')}</p>
              </div>
            </div>
          </div>

          {/* Disclaimer */}
          <div className="rounded-xl p-3.5 bg-amber-50 border border-amber-200 flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 shrink-0 text-amber-600 mt-0.5" />
            <div>
              <p className="text-xs font-bold text-amber-900">{t('handout.disclaimerHeading')}</p>
              <p className="text-[11px] text-amber-800 mt-0.5 leading-relaxed">{t('handout.disclaimerBody')}</p>
            </div>
          </div>

          {/* Footer */}
          <p className="text-center text-[10px] text-slate-400 pt-1">{t('handout.footer')}</p>
        </div>
      </div>
    </div>
  );
}
