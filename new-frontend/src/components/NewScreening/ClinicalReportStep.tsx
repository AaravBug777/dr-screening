import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BackendPredictResponse, PatientInfo, DRStage } from '../../types';
import { RealFundusImage } from './RealFundusImage';
import { STAGE_LABELS, ICDR_DESCRIPTIONS } from '../../services/backendMapping';
import { fetchReportPdf } from '../../services/backendApi';
import {
  Download,
  Save,
  CheckCircle2,
  RotateCcw,
  ArrowLeft,
  Eye,
  ShieldAlert,
  Loader2
} from 'lucide-react';

interface ClinicalReportStepProps {
  result: BackendPredictResponse;
  patientInfo: PatientInfo;
  eyeSide: 'Left (OS)' | 'Right (OD)';
  stage: DRStage;
  predictedClass: number;
  confidence: number;
  referable: boolean;
  sourceFilename: string;
  preprocessedImageDataUri: string;
  gradCamOverlayDataUri: string;
  onSaveToHistory: () => void;
  onStartNew: () => void;
  onBack: () => void;
}

export function ClinicalReportStep({
  result,
  patientInfo,
  eyeSide,
  stage,
  predictedClass,
  confidence,
  referable,
  sourceFilename,
  preprocessedImageDataUri,
  gradCamOverlayDataUri,
  onSaveToHistory,
  onStartNew,
  onBack
}: ClinicalReportStepProps) {
  const { t } = useTranslation();
  const [saved, setSaved] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const handleDownloadPDF = async () => {
    setIsDownloading(true);
    setDownloadError(null);
    try {
      // Real PDF from backend/report_generator.py, rendered from this exact
      // already-computed result -- no re-inference, so it can't disagree
      // with what's on screen.
      const blob = await fetchReportPdf(result, sourceFilename);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'netra-dr-screening-report.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : 'Report generation failed.');
    } finally {
      setIsDownloading(false);
    }
  };

  const handleSave = () => {
    onSaveToHistory();
    setSaved(true);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Top Action Bar */}
      <div className="bg-white p-4 sm:p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700 uppercase tracking-wider">
            <CheckCircle2 className="w-4 h-4" />
            <span>{t('report.completed')}</span>
          </div>
          <h2 className="text-xl font-bold text-slate-900 mt-0.5">{t('report.title')}</h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleDownloadPDF}
            disabled={isDownloading}
            className="px-4 py-2 bg-cyan-700 hover:bg-cyan-800 disabled:opacity-60 text-white rounded-lg text-xs font-semibold shadow-sm flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            {isDownloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            <span>{isDownloading ? t('report.generating') : t('report.downloadPdf')}</span>
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={saved}
            className={`px-4 py-2 rounded-lg text-xs font-semibold shadow-sm flex items-center gap-1.5 transition-colors cursor-pointer ${
              saved ? 'bg-emerald-600 text-white' : 'bg-slate-900 hover:bg-slate-800 text-white'
            }`}
          >
            {saved ? <CheckCircle2 className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            <span>{saved ? t('report.savedToHistory') : t('report.saveToHistory')}</span>
          </button>
        </div>
      </div>

      {downloadError && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 text-xs p-3 rounded-lg">
          {downloadError}
        </div>
      )}

      {/* On-screen report preview */}
      <div className="bg-white p-6 sm:p-10 rounded-2xl border border-slate-300 shadow-xl space-y-6 text-slate-900">
        <div className="border-b-2 border-slate-900 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-slate-900 text-cyan-400 flex items-center justify-center">
              <Eye className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-lg font-black tracking-tight uppercase text-slate-950">
                NETRA — Diabetic Retinopathy Screening
              </h1>
              <p className="text-xs text-slate-600 font-medium">{t('report.onScreenPreview')}</p>
            </div>
          </div>
          <div className="text-left sm:text-right text-xs">
            <div className="font-mono font-bold text-slate-900">{t('report.patient')} {patientInfo.patientId}</div>
            <div className="text-slate-500">{t('report.eye')} {eyeSide}</div>
          </div>
        </div>

        <div className={`p-4 rounded-xl border ${referable ? 'bg-rose-50/50 border-rose-200' : 'bg-emerald-50/50 border-emerald-200'}`}>
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">{t('report.severityAssessment')}</span>
          <h3 className="text-xl font-black mt-1 text-slate-950">{STAGE_LABELS[stage]}</h3>
          <div className="flex items-center gap-3 mt-2 text-xs">
            <span className="font-bold text-slate-800">
              {t('grading.probThisGrade')}: <span className="font-mono text-cyan-800">{confidence.toFixed(1)}%</span>
            </span>
            <span className="text-slate-300">•</span>
            <span className="text-slate-600">ICDR Level {predictedClass} / 4</span>
            <span className="text-slate-300">•</span>
            <span className={referable ? 'text-rose-700 font-bold' : 'text-emerald-700 font-bold'}>
              {referable ? t('explainable.referable') : t('explainable.notReferable')}
            </span>
          </div>
          <p className="text-xs text-slate-600 mt-2">{ICDR_DESCRIPTIONS[stage]}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <RealFundusImage src={preprocessedImageDataUri} title={t('grading.preprocessedInput')} />
          <RealFundusImage src={gradCamOverlayDataUri} title={t('explainable.heatmapTitle')} />
        </div>

        {result.segmentation_summary && (
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs space-y-2">
            <h4 className="font-bold text-slate-900 uppercase tracking-wider">{t('report.structuralFindings')}</h4>
            <div className="flex flex-wrap gap-2">
              <span className="px-2 py-0.5 bg-white border border-slate-200 rounded">
                MA: <strong>{result.segmentation_summary.microaneurysm_candidates}</strong>
              </span>
              <span className="px-2 py-0.5 bg-white border border-slate-200 rounded">
                {t('structures.exudate')}: <strong>{result.segmentation_summary.exudate_candidates}</strong>
              </span>
              <span className="px-2 py-0.5 bg-white border border-slate-200 rounded">
                {t('structures.hemorrhage')}: <strong>{result.segmentation_summary.hemorrhage_candidates}</strong>
              </span>
              <span className="px-2 py-0.5 bg-white border border-slate-200 rounded">
                NVD/NVE: <strong>{result.segmentation_summary.nv_candidates}</strong>
              </span>
            </div>
          </div>
        )}

        <div className="p-4 bg-amber-50 rounded-xl border border-amber-300 text-xs text-amber-950 space-y-1">
          <div className="flex items-center gap-1.5 font-bold text-amber-900">
            <ShieldAlert className="w-4 h-4 text-amber-600" />
            <span>{t('report.safetyNoticeTitle')}</span>
          </div>
          <p className="text-[11px] text-amber-900/90 leading-relaxed">
            {result.recommendation} {t('report.safetyNoticeBody')}
          </p>
        </div>
      </div>

      {/* Bottom Actions */}
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
          onClick={onStartNew}
          className="px-6 py-2.5 bg-cyan-700 hover:bg-cyan-800 text-white rounded-lg text-sm font-semibold shadow-sm flex items-center gap-2 transition-colors cursor-pointer"
        >
          <RotateCcw className="w-4 h-4" />
          <span>{t('report.startNew')}</span>
        </button>
      </div>
    </div>
  );
}
