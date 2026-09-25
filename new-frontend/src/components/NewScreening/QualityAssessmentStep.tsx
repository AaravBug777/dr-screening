import React from 'react';
import { useTranslation } from 'react-i18next';
import { BackendQuality } from '../../types';
import { RealFundusImage } from './RealFundusImage';
import { CheckCircle2, AlertTriangle, HelpCircle, ArrowRight, ArrowLeft } from 'lucide-react';

interface QualityAssessmentStepProps {
  imagePreviewUrl: string;
  quality: BackendQuality | null; // null = MATLAB not installed/running on this backend -- Python-only fallback
  onProceed: () => void;
  onBack: () => void;
}

export function QualityAssessmentStep({ imagePreviewUrl, quality, onProceed, onBack }: QualityAssessmentStepProps) {
  const { t } = useTranslation();
  const isReject = quality?.verdict === 'reject';

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-2 text-xs font-semibold text-cyan-700 uppercase tracking-wider">
          <span>{t('quality.stepLabel')}</span>
          <span className="text-slate-300">•</span>
          <span>{t('quality.stepSubLabel')}</span>
        </div>
        <h2 className="text-xl font-bold text-slate-900 mt-1">{t('quality.title')}</h2>
        <p className="text-sm text-slate-600 mt-1">{t('quality.subtitle')}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        <div className="md:col-span-6">
          <RealFundusImage src={imagePreviewUrl} title={t('quality.submittedImage')} />
        </div>

        <div className="md:col-span-6 space-y-4">
          {quality === null ? (
            <div className="p-4 rounded-xl border bg-slate-50 border-slate-300 text-slate-800 flex items-start gap-3">
              <HelpCircle className="w-6 h-6 text-slate-500 shrink-0 mt-0.5" />
              <div>
                <span className="text-sm font-bold tracking-wide">{t('quality.unavailableTitle')}</span>
                <p className="text-xs text-slate-700 mt-1">{t('quality.unavailableBody')}</p>
              </div>
            </div>
          ) : (
            <>
              <div
                className={`p-4 rounded-xl border flex items-start gap-3 ${
                  quality.verdict === 'pass'
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                    : quality.verdict === 'borderline'
                    ? 'bg-amber-50 border-amber-300 text-amber-950'
                    : 'bg-rose-50 border-rose-300 text-rose-950'
                }`}
              >
                {quality.verdict === 'pass' ? (
                  <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-6 h-6 shrink-0 mt-0.5" />
                )}
                <div>
                  <span className="text-sm font-bold tracking-wide uppercase">
                    {t('quality.verdict')}: {quality.verdict}
                    {quality.enhanced_image_used ? ` ${t('quality.enhancementApplied')}` : ''}
                  </span>
                  <p className="text-xs mt-1">{quality.feedback}</p>
                </div>
              </div>

              {quality.reasons.length > 0 && (
                <div className="bg-white p-4 rounded-xl border border-slate-200 text-xs">
                  <span className="font-bold text-slate-900 block mb-1.5">{t('quality.reasonCodes')}</span>
                  <ul className="space-y-1 text-slate-700 list-disc list-inside font-mono">
                    {quality.reasons.map((reason, i) => (
                      <li key={i}>{reason}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Navigation and Action Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{t('common.back')}</span>
        </button>

        {isReject ? (
          <div className="text-xs font-semibold text-rose-700">{t('quality.rejectedNotice')}</div>
        ) : (
          <button
            type="button"
            onClick={onProceed}
            className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold shadow-sm flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <span>{t('quality.proceed')}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
