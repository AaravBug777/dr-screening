import React from 'react';
import { useTranslation } from 'react-i18next';
import { RealFundusImage } from './RealFundusImage';
import { Info, ArrowRight, ArrowLeft } from 'lucide-react';

interface EnhancementStepProps {
  imagePreviewUrl: string;
  enhancedImageDataUri: string | null; // real MATLAB enhanceFundusImage.m output, only present for borderline-quality images
  onProceedToStructures: () => void;
  onBack: () => void;
}

export function EnhancementStep({
  imagePreviewUrl,
  enhancedImageDataUri,
  onProceedToStructures,
  onBack
}: EnhancementStepProps) {
  const { t } = useTranslation();
  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-2 text-xs font-semibold text-cyan-700 uppercase tracking-wider">
          <span>{t('enhancement.stepLabel')}</span>
          <span className="text-slate-300">•</span>
          <span>{t('enhancement.stepSubLabel')}</span>
        </div>
        <h2 className="text-xl font-bold text-slate-900 mt-1">{t('enhancement.title')}</h2>
        <p className="text-sm text-slate-600 mt-1">{t('enhancement.subtitle')}</p>
      </div>

      {enhancedImageDataUri ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <RealFundusImage src={imagePreviewUrl} title={t('enhancement.original')} />
          <RealFundusImage src={enhancedImageDataUri} title={t('enhancement.enhancedReal')} badge={t('enhancement.applied')} />
        </div>
      ) : (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-start gap-3">
          <Info className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
          <div className="text-sm text-slate-700">
            <p className="font-semibold text-slate-900">{t('enhancement.noneTitle')}</p>
            <p className="text-xs text-slate-600 mt-1">{t('enhancement.noneBody')}</p>
          </div>
        </div>
      )}

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
          onClick={onProceedToStructures}
          className="px-6 py-2.5 bg-cyan-700 hover:bg-cyan-800 text-white rounded-lg text-sm font-semibold shadow-sm flex items-center gap-2 transition-colors cursor-pointer"
        >
          <span>{t('enhancement.proceed')}</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
