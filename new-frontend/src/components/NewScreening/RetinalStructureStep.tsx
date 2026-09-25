import React from 'react';
import { useTranslation } from 'react-i18next';
import { BackendSegmentationSummary } from '../../types';
import { RealFundusImage } from './RealFundusImage';
import { Activity, ArrowRight, ArrowLeft, Info, AlertTriangle } from 'lucide-react';

interface RetinalStructureStepProps {
  structuresOverlayDataUri: string | null;
  summary: BackendSegmentationSummary | null; // null when MATLAB segmentation didn't run
  onProceedToGrading: () => void;
  onBack: () => void;
}

export function RetinalStructureStep({
  structuresOverlayDataUri,
  summary,
  onProceedToGrading,
  onBack
}: RetinalStructureStepProps) {
  const { t } = useTranslation();
  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-2 text-xs font-semibold text-cyan-700 uppercase tracking-wider">
          <span>{t('structures.stepLabel')}</span>
          <span className="text-slate-300">•</span>
          <span>{t('structures.stepSubLabel')}</span>
        </div>
        <h2 className="text-xl font-bold text-slate-900 mt-1">{t('structures.title')}</h2>
        <p className="text-sm text-slate-600 mt-1">{t('structures.subtitle')}</p>
      </div>

      {summary === null || structuresOverlayDataUri === null ? (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-start gap-3">
          <Info className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
          <div className="text-sm text-slate-700">
            <p className="font-semibold text-slate-900">{t('structures.unavailableTitle')}</p>
            <p className="text-xs text-slate-600 mt-1">{t('structures.unavailableBody')}</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          <div className="md:col-span-7">
            <RealFundusImage
              src={structuresOverlayDataUri}
              title={t('structures.overlayTitle')}
              badge={t('structures.realSegmentation')}
            />
          </div>

          <div className="md:col-span-5 space-y-4">
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2 pb-2 border-b border-slate-100">
                <Activity className="w-4 h-4 text-cyan-600" />
                {t('structures.findingsTitle')}
              </h3>

              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-700">{t('structures.opticDiscConfidence')}</span>
                <span className="font-mono font-bold text-slate-900">
                  {(summary.od_confidence * 100).toFixed(1)}%
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-700">{t('structures.foveaLocalized')}</span>
                <span className="font-mono font-bold text-slate-900">
                  {summary.fovea_found ? t('common.yes') : t('common.no')}
                </span>
              </div>

              <div className="pt-2 space-y-1.5 text-xs border-t border-slate-100">
                <div className="flex items-center justify-between py-1 px-2 rounded bg-slate-50">
                  <span className="text-slate-700">{t('structures.microaneurysm')}</span>
                  <span className="font-mono font-bold text-slate-900">{summary.microaneurysm_candidates}</span>
                </div>
                <div className="flex items-center justify-between py-1 px-2 rounded bg-slate-50">
                  <span className="text-slate-700">{t('structures.exudate')}</span>
                  <span className="font-mono font-bold text-slate-900">{summary.exudate_candidates}</span>
                </div>
                <div className="flex items-center justify-between py-1 px-2 rounded bg-slate-50">
                  <span className="text-slate-700">
                    {t('structures.hemorrhage')}
                    <span className="text-slate-400"> ({t('structures.dotBlot')} {summary.hemorrhage_dot_blot_candidates} · {t('structures.flame')} {summary.hemorrhage_flame_candidates})</span>
                  </span>
                  <span className="font-mono font-bold text-slate-900">{summary.hemorrhage_candidates}</span>
                </div>
              </div>

              {/* Neovascularization: kept visually separate + flagged, matching
                  backend/main.py's own nv_ namespace and the documented honest
                  weak result (0% pixel overlap on positive cases in
                  matlab/segmentation/README.md) -- never presented as a
                  validated detection. */}
              <div className="pt-2 border-t border-slate-100">
                <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="text-[11px] text-amber-900">
                    <div className="flex items-center justify-between font-bold">
                      <span>{t('structures.nvHeading')}</span>
                      <span className="font-mono">{summary.nv_candidates} (NVD {summary.nvd_candidates} / NVE {summary.nve_candidates})</span>
                    </div>
                    <p className="mt-1 font-normal">{t('structures.nvCaveat')}</p>
                  </div>
                </div>
              </div>
            </div>
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
          onClick={onProceedToGrading}
          className="px-6 py-2.5 bg-cyan-700 hover:bg-cyan-800 text-white rounded-lg text-sm font-semibold shadow-sm flex items-center gap-2 transition-colors cursor-pointer"
        >
          <span>{t('structures.proceed')}</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
