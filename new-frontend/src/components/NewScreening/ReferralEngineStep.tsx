import React from 'react';
import { useTranslation } from 'react-i18next';
import { DRStage } from '../../types';
import { STAGE_LABELS } from '../../services/backendMapping';
import { AlertTriangle, CheckCircle2, Stethoscope, ArrowRight, ArrowLeft, FileText, ShieldCheck, Info } from 'lucide-react';

interface ReferralEngineStepProps {
  stage: DRStage;
  predictedClass: number;
  confidence: number; // 0-100
  referable: boolean;
  referableProbability: number; // 0-100, real calibrated probability mass on referable classes
  recommendation: string; // real text from training/config.py's RECOMMENDATIONS, via the backend
  onProceedToReport: () => void;
  onBack: () => void;
}

// Priority shown here is a SIMPLE, disclosed heuristic derived from the real
// grade/referable decision -- not a separately-modeled clinical triage
// score the backend computes. Kept obviously labeled as such rather than
// presented as an independent AI output.
function derivePriority(referable: boolean, predictedClass: number): 'ROUTINE' | 'HIGH' | 'EMERGENCY' {
  if (!referable) return 'ROUTINE';
  return predictedClass === 4 ? 'EMERGENCY' : 'HIGH';
}

export function ReferralEngineStep({
  stage,
  predictedClass,
  confidence,
  referable,
  referableProbability,
  recommendation,
  onProceedToReport,
  onBack
}: ReferralEngineStepProps) {
  const { t } = useTranslation();
  const priority = derivePriority(referable, predictedClass);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-2 text-xs font-semibold text-cyan-700 uppercase tracking-wider">
          <span>{t('referral.stepLabel')}</span>
          <span className="text-slate-300">•</span>
          <span>{t('referral.stepSubLabel')}</span>
        </div>
        <h2 className="text-xl font-bold text-slate-900 mt-1">{t('referral.title')}</h2>
        <p className="text-sm text-slate-600 mt-1">{t('referral.subtitle')}</p>
      </div>

      <div
        className={`p-6 sm:p-8 rounded-2xl border shadow-md space-y-6 ${
          referable
            ? priority === 'EMERGENCY'
              ? 'bg-rose-50 border-rose-300 ring-2 ring-rose-500'
              : 'bg-amber-50 border-amber-300 ring-2 ring-amber-500'
            : 'bg-emerald-50 border-emerald-300 ring-2 ring-emerald-500'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-black/10">
          <div className="flex items-center gap-3">
            {referable ? (
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-white ${priority === 'EMERGENCY' ? 'bg-rose-600' : 'bg-amber-600'}`}>
                <AlertTriangle className="w-7 h-7" />
              </div>
            ) : (
              <div className="w-12 h-12 rounded-xl bg-emerald-600 flex items-center justify-center text-white">
                <CheckCircle2 className="w-7 h-7" />
              </div>
            )}
            <div>
              <span className="text-xs font-bold uppercase tracking-widest text-slate-600">{t('referral.triageStatus')}</span>
              <h3 className={`text-2xl sm:text-3xl font-black tracking-tight ${referable ? (priority === 'EMERGENCY' ? 'text-rose-950' : 'text-amber-950') : 'text-emerald-950'}`}>
                {referable ? t('referral.referableStatus') : t('referral.notReferableStatus')}
              </h3>
            </div>
          </div>

          <span
            className={`px-3 py-1.5 rounded-lg font-bold text-xs font-mono uppercase tracking-wider ${
              priority === 'EMERGENCY' ? 'bg-rose-600 text-white' : priority === 'HIGH' ? 'bg-amber-600 text-white' : 'bg-emerald-200 text-emerald-900'
            }`}
          >
            {t('referral.priority', { priority })}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white/80 backdrop-blur-sm p-4 rounded-xl border border-black/5 shadow-sm">
            <div className="text-xs text-slate-500 font-medium">{t('referral.assessedGrade')}</div>
            <div className="text-lg font-bold text-slate-900 mt-1">{STAGE_LABELS[stage]}</div>
            <div className="text-[11px] text-slate-400 font-mono">ICDR Level {predictedClass}</div>
          </div>

          <div className="bg-white/80 backdrop-blur-sm p-4 rounded-xl border border-black/5 shadow-sm">
            <div className="text-xs text-slate-500 font-medium">{t('referral.gradeConfidence')}</div>
            <div className="text-2xl font-black text-slate-900 mt-0.5 font-mono">{confidence.toFixed(1)}%</div>
          </div>

          <div className="bg-white/80 backdrop-blur-sm p-4 rounded-xl border border-black/5 shadow-sm">
            <div className="text-xs text-slate-500 font-medium">{t('referral.referableProbability')}</div>
            <div className={`text-2xl font-black mt-0.5 font-mono ${referable ? 'text-amber-800' : 'text-emerald-800'}`}>
              {referableProbability.toFixed(1)}%
            </div>
            <div className="text-[11px] text-slate-400">{t('referral.vsThreshold')}</div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
          <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
            <Stethoscope className="w-4 h-4 text-cyan-700" />
            {t('referral.recommendedAction')}
          </h4>
          <p className="text-sm font-semibold text-slate-900 leading-relaxed">{recommendation}</p>
          <div className="flex items-start gap-2 pt-2 text-[11px] text-slate-500 border-t border-slate-100">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>{t('referral.deploymentNote')}</span>
          </div>
        </div>

        <div className="p-4 bg-amber-100/70 border border-amber-300 rounded-xl text-xs text-amber-950 flex items-start gap-2.5">
          <ShieldCheck className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold block">{t('referral.protocolNoticeTitle')}</span>
            <span>{t('referral.protocolNoticeBody')}</span>
          </div>
        </div>
      </div>

      {/* Navigation Buttons */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{t('common.back')}</span>
        </button>

        <button
          type="button"
          onClick={onProceedToReport}
          className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-sm font-semibold shadow-sm flex items-center gap-2 transition-colors cursor-pointer"
        >
          <FileText className="w-4 h-4" />
          <span>{t('referral.proceed')}</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
