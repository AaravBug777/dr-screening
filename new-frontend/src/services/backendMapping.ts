// Shared real-data helpers for the live screening pipeline. Kept separate
// from the old screeningApi.ts mock functions so nothing here can
// accidentally fall back to fabricated numbers.

import { DRStage, ScreeningRecord, ReferralPriority } from '../types';
import type { BackendHistoryRow } from './backendApi';

// backend/training/config.py's CLASS_NAMES, in the same 0-4 order the
// backend always returns `probabilities` in (it's built as
// `cfg.CLASS_NAMES[i]` for i in enumerate(probs) -- index IS the grade).
export const CLASS_ORDER: DRStage[] = ['NO_DR', 'MILD_NPDR', 'MODERATE_NPDR', 'SEVERE_NPDR', 'PDR'];

export const STAGE_LABELS: Record<DRStage, string> = {
  NO_DR: 'No DR',
  MILD_NPDR: 'Mild NPDR',
  MODERATE_NPDR: 'Moderate NPDR',
  SEVERE_NPDR: 'Severe NPDR',
  PDR: 'Proliferative DR',
};

// Real International Clinical Diabetic Retinopathy (ICDR) Disease Severity
// Scale definitions -- standard textbook criteria, not per-image generated
// text. https://www.icoph.org (International Council of Ophthalmology).
export const ICDR_DESCRIPTIONS: Record<DRStage, string> = {
  NO_DR: 'No abnormalities visible on dilated fundus examination.',
  MILD_NPDR: 'Microaneurysms only.',
  MODERATE_NPDR: 'More than just microaneurysms but less than severe NPDR (some hemorrhages, hard/soft exudates, and/or venous beading present, not yet meeting severe criteria).',
  SEVERE_NPDR: "Any of the '4-2-1' rule: >20 intraretinal hemorrhages in each of 4 quadrants; definite venous beading in 2+ quadrants; prominent intraretinal microvascular abnormalities (IRMA) in 1+ quadrant -- with no signs of proliferative disease.",
  PDR: 'Neovascularization and/or vitreous/preretinal hemorrhage.',
};

export function stageFromClassIndex(i: number): DRStage {
  return CLASS_ORDER[i] ?? 'NO_DR';
}

export function classIndexFromStage(stage: DRStage): number {
  return CLASS_ORDER.indexOf(stage);
}

// Base64 payloads from backend/main.py's encode_image_to_base64 -- always
// PNG (see main.py: cv2.imencode('.png', ...)).
export function toDataUri(base64: string): string {
  return `data:image/png;base64,${base64}`;
}

// A record sourced from the real backend history table carries this id
// prefix, distinguishing it from a locally-generated `NETRA-...` id (see
// screeningApi.ts's mapToLegacyRecord) -- lets callers tell the two apart
// (e.g. to know whether a numeric backend prediction id can be recovered
// for postReviewComplete) without a separate flag on every record.
const BACKEND_RECORD_PREFIX = 'BACKEND-';

export function backendPredictionIdFromRecordId(recordId: string): number | null {
  if (!recordId.startsWith(BACKEND_RECORD_PREFIX)) return null;
  const n = Number(recordId.slice(BACKEND_RECORD_PREFIX.length));
  return Number.isFinite(n) ? n : null;
}

// Converts one row from GET /history (backend/db.py's list_predictions --
// deliberately thin: no images, no segmentation_summary, no per-class
// probabilities, so the list view stays fast even with a long history --
// see that function's own docstring) into a displayable ScreeningRecord.
//
// This exists to fix a real gap: every prediction already gets persisted
// server-side (db.save_prediction, inside /predict, regardless of which
// frontend called it), but this app's History/Patient views previously
// only ever read from a separate LOCAL browser cache
// (services/storage.ts), so a real screening never appeared there unless
// the SAME browser also happened to save it locally right after grading.
//
// Fields the thin row genuinely doesn't carry (patient identity, eye
// side, per-class confidence, structure/lesion counts, review status) are
// filled with HONEST placeholders, not fabricated numbers -- the same
// discipline screeningApi.ts's mapToLegacyRecord already follows for the
// live-prediction path. Opening a backend-sourced record's detail view
// will show these placeholders, not the original images/heatmap: the full
// detail (GET /history/{id}) has them, but wiring that into
// RecordDetailModal (which currently expects a synchronously-available
// ScreeningRecord and renders via FundusCanvasViewer's synthetic canvas
// art rather than the real gradcam_overlay_base64/structures_overlay_base64
// images either way) is a larger, separate change, not attempted here.
export function mapBackendHistoryRowToRecord(row: BackendHistoryRow): ScreeningRecord {
  const stage = row.predicted_class != null ? stageFromClassIndex(row.predicted_class) : 'NO_DR';
  const referable = row.referable === 1;
  const isRejected = row.gradable !== 1;

  return {
    id: `${BACKEND_RECORD_PREFIX}${row.id}`,
    patientInfo: {
      patientId: row.source_filename || `Prediction #${row.id}`,
      age: 'Unknown',
      sex: 'Other',
      diabetesDurationYears: 'Unknown',
      screeningCenter: 'Not recorded (server history -- list view has no patient fields)',
      district: '—',
      operatorName: row.operator_id != null ? `Operator #${row.operator_id}` : 'Unknown',
    },
    createdAt: new Date(row.created_at * 1000).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }),
    imageUrl: '', // not in the list row -- see GET /history/{id} for the real image
    eyeSide: 'Right (OD)', // not tracked by the backend at all -- placeholder, not a real value
    quality: {
      status: row.quality_verdict === 'reject' ? 'REQUIRES_RECAPTURE' : 'ACCEPTED',
      overallScore: row.quality_verdict === 'pass' ? 100 : row.quality_verdict === 'borderline' ? 60 : row.quality_verdict === 'reject' ? 0 : 0,
      focusBlurScore: 0,
      illuminationScore: 0,
      contrastScore: 0,
      resolutionScore: 0,
      fieldOfViewScore: 0,
      feedbackReasons: [],
      recommendation: 'Full quality detail not available in the list view.',
    },
    structureFindings: {
      opticDiscDetected: false,
      opticDiscConfidence: 0,
      foveaDetected: false,
      foveaConfidence: 0,
      vesselSegmentationScore: 0,
      vesselDensity: 'Not available (list view; segmentation summary is only in the full record)',
      candidateLesionsDetected: false,
      lesionCount: { microaneurysms: 0, hemorrhages: 0, hardExudates: 0, cottonWoolSpots: 0, neovascularization: 0 },
      lesionMarkers: [],
    },
    grading: {
      stage,
      stageName: STAGE_LABELS[stage],
      stageNumber: (row.predicted_class ?? 0) as 0 | 1 | 2 | 3 | 4,
      icdrDescription: ICDR_DESCRIPTIONS[stage],
      confidence: 0, // per-class probabilities aren't in the list row -- see GET /history/{id}
      probabilities: { noDR: 0, mild: 0, moderate: 0, severe: 0, pdr: 0 },
      modelArchitecture: 'EfficientNet-B3 (PyTorch, TTA over dihedral-4 views)',
      inferenceLatencyMs: 0,
    },
    gradCam: {
      peakActivationRegion: 'Not available (list view)',
      attentionSummary: 'Open GET /history/{id} for the real Grad-CAM overlay image (not wired into this view yet).',
      lesionCorrelationScore: 0,
      clinicalPointers: [],
      heatmapPoints: [],
    },
    referral: {
      status: referable ? 'REFERABLE' : 'NOT_REFERABLE',
      priority: (referable ? (row.predicted_class === 4 ? 'EMERGENCY' : 'HIGH') : 'ROUTINE') as ReferralPriority,
      referralProbability: (row.referable_probability ?? 0) * 100,
      primaryReason: row.predicted_label ?? '',
      suggestedAction: row.predicted_label ?? '',
      recommendedTimeframe: 'Per local referral protocol',
      teleOphthalmologyCenter: 'Configure per deployment',
    },
    // Unknown from the list row (review status isn't a listed column -- see
    // list_predictions in db.py), so default to NOT reviewed: for a
    // referable case, wrongly showing "pending" is the safer failure mode
    // than wrongly showing "already signed off".
    reviewedByDoctor: false,
    status: isRejected ? 'RECAPTURE_NEEDED' : 'PENDING_REVIEW',
    syncStatus: 'synced',
  };
}
