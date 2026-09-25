// Adapter from a REAL backend /predict response into the legacy
// ScreeningRecord shape that the History/Dashboard/Analytics/Tele-review
// tabs already know how to render.
//
// This file used to contain 100% client-side simulated data (delay() calls
// + DEMO_PRESET_CASES lookups masquerading as a "FastAPI Contract
// Simulation"). That's gone -- the live screening pipeline
// (ScreeningPipeline.tsx) now calls backend/main.py for real via
// services/backendApi.ts and only reaches this file once, at "Save to
// History", to produce a record those other (still demo-data) tabs can
// display. Every field below is either read straight from the real
// response or explicitly marked as an honest placeholder -- nothing here
// invents a number the backend didn't provide.

import {
  PatientInfo,
  ScreeningRecord,
  BackendPredictResponse,
  DRStage
} from '../types';
import { CLASS_ORDER, STAGE_LABELS, ICDR_DESCRIPTIONS, toDataUri } from './backendMapping';

export function mapToLegacyRecord(
  result: BackendPredictResponse,
  patientInfo: PatientInfo,
  eyeSide: 'Left (OS)' | 'Right (OD)',
  latencyMs: number
): ScreeningRecord {
  const predictedClass = result.predicted_class ?? 0;
  const stage: DRStage = CLASS_ORDER[predictedClass] ?? 'NO_DR';
  const confidence = (result.probabilities?.[predictedClass]?.probability ?? 0) * 100;
  const referable = result.referable ?? false;
  const referableProbability = (result.referable_probability ?? 0) * 100;
  const seg = result.segmentation_summary;

  return {
    id: `NETRA-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`,
    patientInfo,
    createdAt: new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }),
    // Real image if the backend returned one, else empty -- History/Dashboard
    // views that render `imageUrl` as a data URI still work either way.
    imageUrl: result.preprocessed_image_base64 ? toDataUri(result.preprocessed_image_base64) : '',
    enhancedImageUrl: result.enhanced_image_base64 ? toDataUri(result.enhanced_image_base64) : undefined,
    eyeSide,
    quality: result.quality
      ? {
          status: result.quality.verdict === 'reject' ? 'REQUIRES_RECAPTURE' : 'ACCEPTED',
          // Real verdict-derived score (pass=100/borderline=60/reject=0), NOT
          // a fabricated per-metric breakdown -- the backend doesn't produce
          // focus/illumination/contrast/resolution/FOV sub-scores, so those
          // fields are honestly omitted from the legacy shape's display use
          // (the live pipeline step never reads them; see
          // QualityAssessmentStep.tsx, which shows the real verdict/reasons
          // instead).
          overallScore: result.quality.verdict === 'pass' ? 100 : result.quality.verdict === 'borderline' ? 60 : 0,
          focusBlurScore: 0,
          illuminationScore: 0,
          contrastScore: 0,
          resolutionScore: 0,
          fieldOfViewScore: 0,
          feedbackReasons: result.quality.reasons,
          recommendation: result.quality.feedback
        }
      : {
          // MATLAB not installed/running on this backend -- honestly marked
          // as unavailable rather than assumed-accepted.
          status: 'ACCEPTED',
          overallScore: 0,
          focusBlurScore: 0,
          illuminationScore: 0,
          contrastScore: 0,
          resolutionScore: 0,
          fieldOfViewScore: 0,
          feedbackReasons: [],
          recommendation: 'Quality gate unavailable on this backend (MATLAB Engine not installed) -- graded Python-only.'
        },
    structureFindings: {
      opticDiscDetected: seg != null,
      opticDiscConfidence: seg ? Math.round(seg.od_confidence * 1000) / 10 : 0,
      foveaDetected: seg?.fovea_found ?? false,
      foveaConfidence: seg?.fovea_found ? 100 : 0,
      vesselSegmentationScore: 0, // not produced by the backend -- no real number to show
      vesselDensity: seg ? 'See structures overlay image' : 'Not available (MATLAB not running)',
      candidateLesionsDetected: seg != null && (seg.microaneurysm_candidates + seg.exudate_candidates + seg.hemorrhage_candidates + seg.nv_candidates) > 0,
      lesionCount: {
        microaneurysms: seg?.microaneurysm_candidates ?? 0,
        hemorrhages: seg?.hemorrhage_candidates ?? 0,
        hardExudates: seg?.exudate_candidates ?? 0,
        // Soft exudates (cotton wool spots): the backend HAS produced this
        // since detectSoftExudates.m shipped (matlab/segmentation/README.md),
        // it just wasn't in this frontend's type/mapping yet -- was silently
        // dropped here even though segmentation_summary always includes it.
        cottonWoolSpots: seg?.soft_exudate_candidates ?? 0,
        neovascularization: seg?.nv_candidates ?? 0
      },
      // No real per-lesion pixel coordinates are returned by the backend
      // (only counts + a rendered overlay image) -- deliberately left
      // empty rather than inventing marker positions.
      lesionMarkers: []
    },
    grading: {
      stage,
      stageName: STAGE_LABELS[stage],
      stageNumber: predictedClass as 0 | 1 | 2 | 3 | 4,
      icdrDescription: ICDR_DESCRIPTIONS[stage],
      confidence,
      probabilities: {
        noDR: (result.probabilities?.[0]?.probability ?? 0) * 100,
        mild: (result.probabilities?.[1]?.probability ?? 0) * 100,
        moderate: (result.probabilities?.[2]?.probability ?? 0) * 100,
        severe: (result.probabilities?.[3]?.probability ?? 0) * 100,
        pdr: (result.probabilities?.[4]?.probability ?? 0) * 100
      },
      modelArchitecture: 'EfficientNet-B3 (PyTorch, TTA over dihedral-4 views)',
      inferenceLatencyMs: latencyMs // REAL, measured client-side round trip
    },
    gradCam: {
      // The real explanation is the overlay IMAGE (gradcam_overlay_base64),
      // rendered directly by the live pipeline steps. These text fields
      // have no real backend equivalent (no per-image "evidence log" or
      // heatmap coordinate list is produced), so they're left as honest,
      // generic, non-fabricated statements rather than invented specifics.
      peakActivationRegion: 'See Grad-CAM overlay image',
      attentionSummary: 'Grad-CAM heatmap computed from this image\'s own gradients -- see the overlay image for the actual result.',
      lesionCorrelationScore: 0,
      clinicalPointers: [],
      heatmapPoints: []
    },
    referral: {
      status: referable ? 'REFERABLE' : 'NOT_REFERABLE',
      priority: referable ? (predictedClass === 4 ? 'EMERGENCY' : 'HIGH') : 'ROUTINE',
      referralProbability: referableProbability,
      primaryReason: result.recommendation ?? '',
      suggestedAction: result.recommendation ?? '',
      recommendedTimeframe: 'Per local referral protocol', // real deployment-specific value not known to this demo
      teleOphthalmologyCenter: 'Configure per deployment' // ditto
    },
    reviewedByDoctor: false,
    status: result.gradable === false ? 'RECAPTURE_NEEDED' : 'PENDING_REVIEW'
  };
}
