import React from 'react';
import { useTranslation } from 'react-i18next';
import { BackendClassProbability, DRStage } from '../../types';
import { RealFundusImage } from './RealFundusImage';
import { CLASS_ORDER, STAGE_LABELS, ICDR_DESCRIPTIONS } from '../../services/backendMapping';
import { CheckCircle2, ArrowRight, ArrowLeft, Cpu } from 'lucide-react';

interface DRGradingStepProps {
  preprocessedImageDataUri: string;
  predictedClass: number;
  probabilities: BackendClassProbability[]; // real softmax, index i = grade i
  latencyMs: number; // real measured round-trip time
  onProceedToExplain: () => void;
  onBack: () => void;
}

export function DRGradingStep({
  preprocessedImageDataUri,
  predictedClass,
  probabilities,
  latencyMs,
  onProceedToExplain,
  onBack
}: DRGradingStepProps) {
  const { t } = useTranslation();
  const stage: DRStage = CLASS_ORDER[predictedClass] ?? 'NO_DR';
  const confidence = (probabilities[predictedClass]?.probability ?? 0) * 100;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-2 text-xs font-semibold text-cyan-700 uppercase tracking-wider">
          <span>{t('grading.stepLabel')}</span>
          <span className="text-slate-300">•</span>
          <span>{t('grading.stepSubLabel')}</span>
        </div>
        <h2 className="text-xl font-bold text-slate-900 mt-1">{t('grading.title')}</h2>
        <p className="text-sm text-slate-600 mt-1">{t('grading.subtitle')}</p>
      </div>

      {/* 5-Stage ICDR Progression Bar */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
        <div className="grid grid-cols-5 gap-2">
          {CLASS_ORDER.map((s, idx) => {
            const isSelected = idx === predictedClass;
            return (
              <div
                key={s}
                className={`relative p-3 rounded-lg border text-center transition-all ${
                  isSelected
                    ? 'bg-slate-900 text-white border-slate-900 shadow-md ring-2 ring-cyan-500 ring-offset-2 scale-[1.02]'
                    : 'bg-slate-50 text-slate-600 border-slate-200 opacity-80'
                }`}
              >
                <div className="text-[10px] font-mono uppercase mb-1">{t('grading.icdrGrade', { grade: idx })}</div>
                <div className="font-bold text-xs sm:text-sm leading-tight">{STAGE_LABELS[s]}</div>
                {isSelected && (
                  <div className="mt-1.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-cyan-500 text-slate-950 font-bold text-[10px]">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>PREDICTED</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        <div className="md:col-span-5">
          <RealFundusImage src={preprocessedImageDataUri} title="Preprocessed Input" badge="What the model saw" />
        </div>

        {/* Diagnosis card */}
        <div className="md:col-span-7 space-y-4">
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between text-xs text-slate-500 pb-3 border-b border-slate-100">
              <span className="font-semibold uppercase tracking-wider text-slate-700">Primary AI Prediction</span>
              <span className="flex items-center gap-1 text-slate-400 font-mono text-[11px]">
                <Cpu className="w-3.5 h-3.5 text-cyan-600" />
                EfficientNet-B3 + TTA
              </span>
            </div>

            <div className="mt-4">
              <span className="text-xs font-semibold text-cyan-800 uppercase tracking-widest block mb-1">
                {t('grading.icdrGrade', { grade: predictedClass })}
              </span>
              <h3 className="text-2xl font-extrabold text-slate-900 leading-tight">{STAGE_LABELS[stage]}</h3>
            </div>

            <div className="mt-4 p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
              <div>
                <div className="text-xs text-slate-500 font-medium">{t('grading.probThisGrade')}</div>
                <div className="text-3xl font-black text-slate-900 mt-0.5 font-mono tracking-tight">
                  {confidence.toFixed(1)}%
                </div>
              </div>
              <div className="text-right text-[11px] text-slate-400">
                {t('grading.latency', { ms: latencyMs })}
              </div>
            </div>

            <p className="text-xs text-slate-700 mt-4 leading-relaxed bg-cyan-50/50 p-3 rounded-lg border border-cyan-100">
              <span className="font-semibold text-slate-900 block mb-0.5">{t('grading.clinicalDefinition')}</span>
              {ICDR_DESCRIPTIONS[stage]}
            </p>
          </div>

          {/* Probability distribution */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                {t('grading.probDistribution')}
              </h4>
              <span className="text-xs text-slate-500 font-mono">Softmax (∑ = 100%)</span>
            </div>
            {probabilities.map((p, idx) => {
              const isPeak = idx === predictedClass;
              const pct = p.probability * 100;
              return (
                <div key={p.label} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className={isPeak ? 'font-bold text-slate-900' : 'text-slate-600'}>
                      {t('grading.icdrGrade', { grade: idx })}: {p.label}
                    </span>
                    <span className={`font-mono ${isPeak ? 'font-bold text-slate-900 text-sm' : 'text-slate-500'}`}>
                      {pct.toFixed(1)}%
                    </span>
                  </div>
                  <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      style={{ width: `${Math.max(pct, 1.5)}%` }}
                      className={`h-full rounded-full transition-all duration-500 ${isPeak ? 'bg-cyan-600' : 'bg-slate-300'}`}
                    />
                  </div>
                </div>
              );
            })}
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
          onClick={onProceedToExplain}
          className="px-6 py-2.5 bg-cyan-700 hover:bg-cyan-800 text-white rounded-lg text-sm font-semibold shadow-sm flex items-center gap-2 transition-colors cursor-pointer"
        >
          <span>{t('grading.proceed')}</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
