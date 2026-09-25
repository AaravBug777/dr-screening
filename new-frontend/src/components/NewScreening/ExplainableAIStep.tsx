import React from 'react';
import { useTranslation } from 'react-i18next';
import { DRStage } from '../../types';
import { RealFundusImage } from './RealFundusImage';
import { STAGE_LABELS } from '../../services/backendMapping';
import { Flame, ArrowRight, ArrowLeft, Sparkles } from 'lucide-react';

interface ExplainableAIStepProps {
  preprocessedImageDataUri: string;
  gradCamOverlayDataUri: string;
  stage: DRStage;
  confidence: number; // 0-100, real softmax probability of the predicted grade
  referable: boolean;
  onProceedToReferral: () => void;
  onBack: () => void;
}

export function ExplainableAIStep({
  preprocessedImageDataUri,
  gradCamOverlayDataUri,
  stage,
  confidence,
  referable,
  onProceedToReferral,
  onBack
}: ExplainableAIStepProps) {
  const { t } = useTranslation();
  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-2 text-xs font-semibold text-cyan-700 uppercase tracking-wider">
          <span>{t('explainable.stepLabel')}</span>
          <span className="text-slate-300">•</span>
          <span>{t('explainable.stepSubLabel')}</span>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mt-1">
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Flame className="w-5 h-5 text-amber-500" />
            {t('explainable.title')}
          </h2>
          <span className="text-xs px-2.5 py-1 rounded bg-amber-50 text-amber-900 border border-amber-200 font-medium">
            {t('explainable.reviewBadge')}
          </span>
        </div>
        <p className="text-sm text-slate-600 mt-1">{t('explainable.subtitle')}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 space-y-4">
          <RealFundusImage
            src={gradCamOverlayDataUri}
            title={t('explainable.heatmapTitle')}
            badge={t('explainable.aiExplanationActive')}
          />

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                {t('explainable.confidenceLabel')}
              </p>
              <h2 className="text-3xl font-black text-blue-600 font-mono">{confidence.toFixed(1)}%</h2>
              <div className="w-full h-1 bg-slate-100 mt-2 rounded-full overflow-hidden">
                <div style={{ width: `${confidence}%` }} className="h-full bg-blue-600 rounded-full" />
              </div>
            </div>

            <div className={`p-4 rounded-xl border shadow-xs ${referable ? 'bg-rose-50 border-rose-200' : 'bg-emerald-50 border-emerald-200'}`}>
              <p className={`text-[10px] font-bold uppercase tracking-widest mb-1 ${referable ? 'text-rose-400' : 'text-emerald-500'}`}>
                {t('explainable.referralStatus')}
              </p>
              <h2 className={`text-xl font-black mt-1 uppercase ${referable ? 'text-rose-600' : 'text-emerald-700'}`}>
                {referable ? t('explainable.referable') : t('explainable.notReferable')}
              </h2>
              <p className={`text-[10px] mt-1 uppercase font-bold tracking-wider ${referable ? 'text-rose-600' : 'text-emerald-600'}`}>
                {t('explainable.seeReferralStep')}
              </p>
            </div>
          </div>
        </div>

        <div className="lg:col-span-5 flex flex-col gap-6">
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">{t('explainable.severityAssessment')}</p>
            <span className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 uppercase">
              {STAGE_LABELS[stage]}
            </span>
          </div>

          <div className="bg-slate-900 text-white rounded-xl p-6 flex-1 shadow-xl">
            <div className="flex items-center gap-2 mb-3">
              <div className="p-1.5 bg-blue-600 rounded-lg text-white">
                <Sparkles className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-black uppercase tracking-widest">{t('explainable.whatGradCamShows')}</h3>
            </div>
            <ul className="space-y-3 text-xs text-slate-200">
              <li>{t('explainable.gradCamNote1')}</li>
              <li>{t('explainable.gradCamNote2')}</li>
              <li>{t('explainable.gradCamNote3')}</li>
            </ul>
            <div className="mt-6 pt-4 border-t border-slate-800 italic text-[10px] text-slate-400 font-medium">
              * {t('explainable.footerNote')}
            </div>
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
          onClick={onProceedToReferral}
          className="px-6 py-2.5 bg-cyan-700 hover:bg-cyan-800 text-white rounded-lg text-sm font-semibold shadow-sm flex items-center gap-2 transition-colors cursor-pointer"
        >
          <span>{t('explainable.proceed')}</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
