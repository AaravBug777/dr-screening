import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PatientInfo, ScreeningRecord, BackendPredictResponse } from '../../types';
import { DEMO_PRESET_CASES } from '../../data/demoCases';
import { predictImage } from '../../services/backendApi';
import { mapToLegacyRecord } from '../../services/screeningApi';
import { toDataUri, CLASS_ORDER } from '../../services/backendMapping';
import { saveScreeningRecord } from '../../services/storage';
import { isEffectivelyOnline } from '../../services/connectivity';
import * as idb from '../../services/indexedDBStorage';

import { PatientInfoStep } from './PatientInfoStep';
import { ImageUploadStep } from './ImageUploadStep';
import { QualityAssessmentStep } from './QualityAssessmentStep';
import { EnhancementStep } from './EnhancementStep';
import { RetinalStructureStep } from './RetinalStructureStep';
import { DRGradingStep } from './DRGradingStep';
import { ExplainableAIStep } from './ExplainableAIStep';
import { ReferralEngineStep } from './ReferralEngineStep';
import { ClinicalReportStep } from './ClinicalReportStep';

import {
  User,
  Upload,
  ShieldCheck,
  Sliders,
  Eye,
  Activity,
  Flame,
  FileCheck,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Save,
  WifiOff,
  Trash2
} from 'lucide-react';

interface ScreeningPipelineProps {
  key?: React.Key;
  onFinishScreening?: (record: ScreeningRecord) => void;
  onQueuedForSync?: () => void;
  initialPresetId?: string;
}

export type PipelineStep =
  | 'PATIENT_INFO'
  | 'UPLOAD'
  | 'QUALITY'
  | 'ENHANCEMENT'
  | 'STRUCTURES'
  | 'GRADING'
  | 'EXPLAINABLE_AI'
  | 'REFERRAL'
  | 'REPORT';

// Labels come from i18n at render time (see STEPS inside the component) --
// this just pairs each step id with its icon and translation key, since
// hooks like useTranslation can't run at module scope.
const STEP_META: Array<{ id: PipelineStep; labelKey: string; icon: any }> = [
  { id: 'PATIENT_INFO', labelKey: 'steps.patientInfo', icon: User },
  { id: 'UPLOAD', labelKey: 'steps.upload', icon: Upload },
  { id: 'QUALITY', labelKey: 'steps.quality', icon: ShieldCheck },
  { id: 'ENHANCEMENT', labelKey: 'steps.enhancement', icon: Sliders },
  { id: 'STRUCTURES', labelKey: 'steps.structures', icon: Eye },
  { id: 'GRADING', labelKey: 'steps.grading', icon: Activity },
  { id: 'EXPLAINABLE_AI', labelKey: 'steps.explainableAI', icon: Flame },
  { id: 'REFERRAL', labelKey: 'steps.referral', icon: FileCheck },
  { id: 'REPORT', labelKey: 'steps.report', icon: CheckCircle2 }
];

const DEFAULT_PATIENT: PatientInfo = DEMO_PRESET_CASES[2]?.patientInfo ?? {
  patientId: '',
  age: '',
  sex: 'Male',
  diabetesDurationYears: '',
  screeningCenter: '',
  district: '',
  operatorName: ''
};

// Real pipeline: patient info (form) -> real file upload -> ONE real
// /predict call to the Netra backend -> the rest of the steps just walk
// through slices of that single real response. This deliberately does NOT
// simulate a separate network call per step (the old mock did, with fake
// per-stage delays) -- the backend genuinely computes everything in one
// request, so pretending otherwise would misrepresent the real system.
export function ScreeningPipeline({ onFinishScreening, onQueuedForSync, initialPresetId }: ScreeningPipelineProps) {
  const { t } = useTranslation();
  const STEPS = STEP_META.map((s) => ({ ...s, label: t(s.labelKey) }));
  const [currentStep, setCurrentStep] = useState<PipelineStep>('PATIENT_INFO');
  const [patientInfo, setPatientInfo] = useState<PatientInfo>(DEFAULT_PATIENT);
  const [eyeSide, setEyeSide] = useState<'Left (OS)' | 'Right (OD)'>('Right (OD)');

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [sourceFilename, setSourceFilename] = useState<string>('');

  const [predictResult, setPredictResult] = useState<BackendPredictResponse | null>(null);
  const [latencyMs, setLatencyMs] = useState<number>(0);

  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [predictError, setPredictError] = useState<string | null>(null);

  const [saved, setSaved] = useState(false);

  // Draft Recovery: an in-progress exam auto-saved to IndexedDB (see the
  // effect below) survives a closed tab or dead battery. On mount, offer
  // to resume it rather than silently discarding or silently resuming --
  // the operator may have deliberately started over with a new patient.
  const [pendingDraft, setPendingDraft] = useState<idb.ScreeningDraft | null>(null);
  const [queuedOfflineMessage, setQueuedOfflineMessage] = useState<string | null>(null);

  useEffect(() => {
    idb.getDraft().then((draft) => {
      if (draft) setPendingDraft(draft);
    });
  }, []);

  // Step-by-step auto-save: cache patient info, the captured image, and
  // (once available) the real /predict result after every step -- but not
  // before the operator has actually made progress (the PATIENT_INFO step
  // starts pre-filled with a demo-autofill default, which isn't "work" yet),
  // and not while an unresolved "Resume Draft?" banner is showing (so we
  // don't clobber the saved draft before the operator has chosen).
  useEffect(() => {
    if (saved || pendingDraft) return;
    const hasProgress = currentStep !== 'PATIENT_INFO' || imageFile != null;
    if (!hasProgress) return;
    idb.saveDraft({
      id: idb.ACTIVE_DRAFT_ID,
      currentStep,
      patientInfo,
      eyeSide,
      imageFile,
      sourceFilename,
      predictResult,
      latencyMs,
      updatedAt: new Date().toISOString()
    });
  }, [currentStep, patientInfo, eyeSide, imageFile, sourceFilename, predictResult, latencyMs, saved, pendingDraft]);

  const handleResumeDraft = () => {
    if (!pendingDraft) return;
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    setPatientInfo(pendingDraft.patientInfo);
    setEyeSide(pendingDraft.eyeSide);
    setSourceFilename(pendingDraft.sourceFilename);
    if (pendingDraft.imageFile) {
      setImageFile(pendingDraft.imageFile);
      setImagePreviewUrl(URL.createObjectURL(pendingDraft.imageFile));
    }
    if (pendingDraft.predictResult) {
      setPredictResult(pendingDraft.predictResult);
      setLatencyMs(pendingDraft.latencyMs ?? 0);
    }
    setCurrentStep(pendingDraft.currentStep as PipelineStep);
    setPendingDraft(null);
  };

  const handleDiscardDraft = () => {
    idb.clearDraft();
    setPendingDraft(null);
  };

  // Revoke the object URL when it's replaced/unmounted to avoid leaking memory.
  useEffect(() => {
    return () => {
      if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    };
  }, [imagePreviewUrl]);

  const handleImageSelected = (file: File) => {
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    setImageFile(file);
    setImagePreviewUrl(URL.createObjectURL(file));
    setSourceFilename(file.name);
    setPredictResult(null);
    setPredictError(null);
    setSaved(false);
  };

  // Captured but not yet gradable offline -- grading is the one real
  // network call this pipeline makes (no on-device model), so a field
  // capture with no connectivity gets queued instead of failing outright.
  const queueForOfflineSync = async (message: string) => {
    if (!imageFile) return;
    await idb.enqueueSyncItem({
      id: `queue-${Date.now()}`,
      kind: 'NEW_SCREENING',
      patientInfo,
      eyeSide,
      imageFile,
      sourceFilename,
      queuedAt: new Date().toISOString()
    });
    await idb.clearDraft();
    onQueuedForSync?.();
    setQueuedOfflineMessage(message);
  };

  // The one real network call in this whole pipeline.
  const handleRunPipeline = async () => {
    if (!imageFile) return;

    if (!isEffectivelyOnline()) {
      await queueForOfflineSync(
        `No field connectivity -- this exam for patient ${patientInfo.patientId || '(unnamed)'} has been queued locally and will be graded automatically once you're back online.`
      );
      return;
    }

    setIsLoading(true);
    setLoadingMessage('Uploading to backend -- MATLAB quality gate, EfficientNet-B3 grading, Grad-CAM...');
    setPredictError(null);
    try {
      const { result, latencyMs: measured } = await predictImage(imageFile);
      setPredictResult(result);
      setLatencyMs(measured);
      setCurrentStep('QUALITY');
    } catch (err) {
      if (!isEffectivelyOnline()) {
        await queueForOfflineSync(
          "Connectivity dropped mid-upload -- this exam has been queued locally and will retry automatically once you're back online."
        );
      } else {
        setPredictError(err instanceof Error ? err.message : 'Prediction request failed.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveToHistory = () => {
    if (!predictResult) return;
    const record = mapToLegacyRecord(predictResult, patientInfo, eyeSide, latencyMs);
    saveScreeningRecord(record);
    setSaved(true);
    idb.clearDraft();
    onFinishScreening?.(record);
  };

  const handleStartNew = () => {
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    setImageFile(null);
    setImagePreviewUrl(null);
    setPredictResult(null);
    setSaved(false);
    setQueuedOfflineMessage(null);
    setCurrentStep('PATIENT_INFO');
    idb.clearDraft();
  };

  const currentStepIndex = STEPS.findIndex((s) => s.id === currentStep);
  const gradable = predictResult?.gradable === true;
  const predictedClass = predictResult?.predicted_class ?? 0;
  const stage = CLASS_ORDER[predictedClass] ?? 'NO_DR';
  const confidence = (predictResult?.probabilities?.[predictedClass]?.probability ?? 0) * 100;
  const referable = predictResult?.referable ?? false;
  const referableProbability = (predictResult?.referable_probability ?? 0) * 100;

  return (
    <div className="space-y-6">
      {/* Top Pipeline Stepper Progress Bar */}
      <div className="bg-white p-3 sm:p-4 rounded-xl border border-slate-200 shadow-xs overflow-x-auto">
        <div className="flex items-center justify-between min-w-[750px] gap-2">
          {STEPS.map((step, idx) => {
            const isCompleted = idx < currentStepIndex;
            const isCurrent = idx === currentStepIndex;
            const isReachable = isCompleted || isCurrent || (idx <= 2 && predictResult != null);
            const Icon = step.icon;

            return (
              <React.Fragment key={step.id}>
                <button
                  type="button"
                  onClick={() => {
                    if (isReachable) setCurrentStep(step.id);
                  }}
                  disabled={!isReachable}
                  className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all select-none ${
                    isCurrent
                      ? 'bg-blue-600 text-white shadow-sm ring-2 ring-blue-400 ring-offset-1 font-black'
                      : isCompleted
                      ? 'bg-slate-100 text-slate-800 hover:bg-slate-200 cursor-pointer'
                      : 'bg-transparent text-slate-400 opacity-50 cursor-not-allowed'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black ${
                      isCurrent ? 'bg-white text-blue-700' : isCompleted ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {isCompleted ? '✓' : idx + 1}
                  </div>
                  <span>{step.label}</span>
                </button>

                {idx < STEPS.length - 1 && (
                  <div className={`flex-1 h-0.5 transition-colors ${idx < currentStepIndex ? 'bg-emerald-500' : 'bg-slate-200'}`} />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Loading Overlay -- shown ONCE, for the single real /predict call */}
      {isLoading && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 sm:p-8 max-w-md w-full shadow-2xl border border-slate-200 text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto animate-spin">
              <Loader2 className="w-8 h-8" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Real Backend Request</p>
              <h3 className="text-lg font-black text-slate-900 mt-1">Netra Inference Pipeline</h3>
              <p className="text-xs text-slate-600 mt-1.5 font-medium">{loadingMessage}</p>
            </div>
          </div>
        </div>
      )}

      {/* Draft Recovery Banner */}
      {pendingDraft && (
        <div className="max-w-4xl mx-auto bg-indigo-50 border border-indigo-200 text-indigo-900 text-sm p-4 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2">
            <Save className="w-5 h-5 shrink-0 mt-0.5 text-indigo-600" />
            <div>
              <p className="font-semibold">Unsaved draft found from a previous session.</p>
              <p className="text-xs mt-1">
                Patient {pendingDraft.patientInfo.patientId || '(unnamed)'} &middot; last saved{' '}
                {new Date(pendingDraft.updatedAt).toLocaleString()}.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleResumeDraft}
              className="px-3.5 py-1.5 bg-indigo-700 hover:bg-indigo-800 text-white rounded-lg text-xs font-semibold shadow-sm cursor-pointer transition-colors"
            >
              Resume Draft
            </button>
            <button
              type="button"
              onClick={handleDiscardDraft}
              className="px-3 py-1.5 bg-white hover:bg-slate-100 border border-indigo-200 text-indigo-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Discard</span>
            </button>
          </div>
        </div>
      )}

      {/* Offline Queue Confirmation */}
      {queuedOfflineMessage && (
        <div className="max-w-4xl mx-auto bg-amber-50 border border-amber-200 text-amber-900 text-sm p-4 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2">
            <WifiOff className="w-5 h-5 shrink-0 mt-0.5 text-amber-600" />
            <p>{queuedOfflineMessage}</p>
          </div>
          <button
            type="button"
            onClick={handleStartNew}
            className="px-3.5 py-1.5 bg-amber-700 hover:bg-amber-800 text-white rounded-lg text-xs font-semibold shadow-sm cursor-pointer transition-colors shrink-0"
          >
            Capture Next Patient
          </button>
        </div>
      )}

      {predictError && (
        <div className="max-w-4xl mx-auto bg-rose-50 border border-rose-200 text-rose-800 text-sm p-4 rounded-xl flex items-start gap-2">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Prediction request failed.</p>
            <p className="text-xs mt-1">{predictError}</p>
          </div>
        </div>
      )}

      {/* Active Step Content */}
      <div>
        {currentStep === 'PATIENT_INFO' && (
          <PatientInfoStep
            patientInfo={patientInfo}
            onChange={setPatientInfo}
            onContinue={() => setCurrentStep('UPLOAD')}
            eyeSide={eyeSide}
            onEyeSideChange={setEyeSide}
            onQuickLoadDemo={() => {}}
          />
        )}

        {currentStep === 'UPLOAD' && (
          <ImageUploadStep
            imageFile={imageFile}
            imagePreviewUrl={imagePreviewUrl}
            onImageSelected={handleImageSelected}
            onProceedToQuality={handleRunPipeline}
            onBack={() => setCurrentStep('PATIENT_INFO')}
          />
        )}

        {currentStep === 'QUALITY' && predictResult && imagePreviewUrl && (
          <QualityAssessmentStep
            imagePreviewUrl={imagePreviewUrl}
            quality={predictResult.quality}
            onProceed={() => setCurrentStep('ENHANCEMENT')}
            onBack={() => setCurrentStep('UPLOAD')}
          />
        )}

        {currentStep === 'ENHANCEMENT' && predictResult && imagePreviewUrl && (
          <EnhancementStep
            imagePreviewUrl={imagePreviewUrl}
            enhancedImageDataUri={predictResult.enhanced_image_base64 ? toDataUri(predictResult.enhanced_image_base64) : null}
            onProceedToStructures={() => setCurrentStep('STRUCTURES')}
            onBack={() => setCurrentStep('QUALITY')}
          />
        )}

        {currentStep === 'STRUCTURES' && gradable && (
          <RetinalStructureStep
            structuresOverlayDataUri={predictResult?.structures_overlay_base64 ? toDataUri(predictResult.structures_overlay_base64) : null}
            summary={predictResult?.segmentation_summary ?? null}
            onProceedToGrading={() => setCurrentStep('GRADING')}
            onBack={() => setCurrentStep('ENHANCEMENT')}
          />
        )}

        {currentStep === 'GRADING' && gradable && predictResult?.preprocessed_image_base64 && predictResult.probabilities && (
          <DRGradingStep
            preprocessedImageDataUri={toDataUri(predictResult.preprocessed_image_base64)}
            predictedClass={predictedClass}
            probabilities={predictResult.probabilities}
            latencyMs={latencyMs}
            onProceedToExplain={() => setCurrentStep('EXPLAINABLE_AI')}
            onBack={() => setCurrentStep('STRUCTURES')}
          />
        )}

        {currentStep === 'EXPLAINABLE_AI' && gradable && predictResult?.preprocessed_image_base64 && predictResult.gradcam_overlay_base64 && (
          <ExplainableAIStep
            preprocessedImageDataUri={toDataUri(predictResult.preprocessed_image_base64)}
            gradCamOverlayDataUri={toDataUri(predictResult.gradcam_overlay_base64)}
            stage={stage}
            confidence={confidence}
            referable={referable}
            onProceedToReferral={() => setCurrentStep('REFERRAL')}
            onBack={() => setCurrentStep('GRADING')}
          />
        )}

        {currentStep === 'REFERRAL' && gradable && (
          <ReferralEngineStep
            stage={stage}
            predictedClass={predictedClass}
            confidence={confidence}
            referable={referable}
            referableProbability={referableProbability}
            recommendation={predictResult?.recommendation ?? ''}
            onProceedToReport={() => setCurrentStep('REPORT')}
            onBack={() => setCurrentStep('EXPLAINABLE_AI')}
          />
        )}

        {currentStep === 'REPORT' && gradable && predictResult && predictResult.preprocessed_image_base64 && predictResult.gradcam_overlay_base64 && (
          <ClinicalReportStep
            result={predictResult}
            patientInfo={patientInfo}
            eyeSide={eyeSide}
            stage={stage}
            predictedClass={predictedClass}
            confidence={confidence}
            referable={referable}
            sourceFilename={sourceFilename}
            preprocessedImageDataUri={toDataUri(predictResult.preprocessed_image_base64)}
            gradCamOverlayDataUri={toDataUri(predictResult.gradcam_overlay_base64)}
            onSaveToHistory={handleSaveToHistory}
            onStartNew={handleStartNew}
            onBack={() => setCurrentStep('REFERRAL')}
          />
        )}
      </div>
    </div>
  );
}
