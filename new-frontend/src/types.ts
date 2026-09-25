export type DRStage = 'NO_DR' | 'MILD_NPDR' | 'MODERATE_NPDR' | 'SEVERE_NPDR' | 'PDR';

export type ReferralStatus = 'NOT_REFERABLE' | 'REFERABLE';

export type ReferralPriority = 'ROUTINE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'EMERGENCY';

export type ImageQualityStatus = 'ACCEPTED' | 'REQUIRES_RECAPTURE';

export type UserRole = 'OPERATOR' | 'OPHTHALMOLOGIST' | 'ADMIN';

// Whether the local copy of a record has been mirrored into the
// IndexedDB field cache -- 'queued' means it was saved while offline
// (or a re-save is still pending) and is waiting in the sync queue for
// connectivity to return. See services/indexedDBStorage.ts / fieldSync.ts.
export type SyncStatus = 'synced' | 'queued';

export interface UserSession {
  id: string;
  name: string;
  role: UserRole;
  roleTitle: string;
  center: string;
  district: string;
  state: string;
}

export interface PatientInfo {
  patientId: string;
  age: number | string;
  sex: 'Male' | 'Female' | 'Other';
  diabetesDurationYears: number | string;
  screeningCenter: string;
  district: string;
  operatorName: string;
  hypertensionHistory?: boolean;
  lastHbA1c?: string;
  contactNumber?: string;
  notes?: string;
}

export interface QualityMetrics {
  status: ImageQualityStatus;
  overallScore: number; // 0 - 100
  focusBlurScore: number; // 0 - 100
  illuminationScore: number; // 0 - 100
  contrastScore: number; // 0 - 100
  resolutionScore: number; // 0 - 100
  fieldOfViewScore: number; // 0 - 100
  feedbackReasons: string[];
  recommendation: string;
}

export interface EnhancementSettings {
  claheApplied: boolean;
  denoiseApplied: boolean;
  illuminationCorrection: boolean;
  contrastBoost: number; // 1.0 - 2.0
}

export interface RetinalStructureFinding {
  opticDiscDetected: boolean;
  opticDiscConfidence: number;
  opticDiscCoordinates?: { x: number; y: number; radius: number };
  foveaDetected: boolean;
  foveaConfidence: number;
  foveaCoordinates?: { x: number; y: number; radius: number };
  vesselSegmentationScore: number;
  vesselDensity: string;
  candidateLesionsDetected: boolean;
  lesionCount: {
    microaneurysms: number;
    hemorrhages: number;
    hardExudates: number;
    cottonWoolSpots: number;
    neovascularization: number;
  };
  lesionMarkers: Array<{
    id: string;
    type: 'microaneurysm' | 'hemorrhage' | 'hardExudate' | 'cottonWool' | 'neovascularization';
    x: number;
    y: number;
    severity: 'low' | 'medium' | 'high';
    description: string;
  }>;
}

export interface DRGradingResult {
  stage: DRStage;
  stageName: string;
  stageNumber: 0 | 1 | 2 | 3 | 4;
  icdrDescription: string;
  confidence: number; // 0 - 100
  probabilities: {
    noDR: number;
    mild: number;
    moderate: number;
    severe: number;
    pdr: number;
  };
  modelArchitecture: string; // e.g. "EfficientNet-B3 (PyTorch / TorchScript)"
  inferenceLatencyMs: number;
}

export interface GradCAMAnalysis {
  peakActivationRegion: string;
  attentionSummary: string;
  lesionCorrelationScore: number; // 0 - 100
  clinicalPointers: string[];
  heatmapPoints: Array<{ x: number; y: number; intensity: number; radius: number }>;
}

export interface ReferralRecommendation {
  status: ReferralStatus;
  priority: ReferralPriority;
  referralProbability: number; // 0 - 100
  primaryReason: string;
  suggestedAction: string;
  recommendedTimeframe: string;
  teleOphthalmologyCenter: string;
}

export interface ScreeningRecord {
  id: string;
  patientInfo: PatientInfo;
  createdAt: string;
  imageUrl: string;
  enhancedImageUrl?: string;
  eyeSide: 'Left (OS)' | 'Right (OD)';
  quality: QualityMetrics;
  structureFindings: RetinalStructureFinding;
  grading: DRGradingResult;
  gradCam: GradCAMAnalysis;
  referral: ReferralRecommendation;
  reviewedByDoctor?: boolean;
  doctorNotes?: string;
  doctorConfirmedStage?: DRStage;
  status: 'PENDING_REVIEW' | 'REVIEWED' | 'RECAPTURE_NEEDED' | 'DISCHARGED';
  syncStatus?: SyncStatus;
}

export interface DemoPresetCase {
  id: string;
  name: string;
  shortDescription: string;
  patientInfo: PatientInfo;
  eyeSide: 'Left (OS)' | 'Right (OD)';
  expectedStage?: DRStage;
  quality: QualityMetrics;
  structureFindings: RetinalStructureFinding;
  grading: DRGradingResult;
  gradCam: GradCAMAnalysis;
  referral: ReferralRecommendation;
  canvasSeed: string;
}

// --- Real backend contract (backend/main.py's /predict), mirrored field-
// for-field -- NOT the same shape as the richer types above, which were
// designed around simulated data (see screeningApi.ts's history). Kept
// deliberately separate rather than forced into QualityMetrics/
// RetinalStructureFinding/etc so the live pipeline never has to fabricate a
// field those types expect but the real backend doesn't provide. ---

export interface BackendClassProbability {
  label: string;
  probability: number; // 0-1
}

export interface BackendQuality {
  verdict: 'pass' | 'borderline' | 'reject';
  reasons: string[];
  feedback: string;
  enhanced_image_used: boolean;
}

export interface BackendSegmentationSummary {
  od_confidence: number;
  fovea_found: boolean;
  microaneurysm_candidates: number;
  exudate_candidates: number;
  hemorrhage_candidates: number;
  hemorrhage_dot_blot_candidates: number;
  hemorrhage_flame_candidates: number;
  // Neovascularization: kept in its own nv_ namespace by the backend
  // deliberately, because it's validated against real pixel-level ground
  // truth (MAPLES-DR) with an honest, weak result (0% pixel overlap on
  // positive cases) -- see matlab/segmentation/README.md. Shown as
  // lower-confidence in the UI, not mixed into the counts above.
  nv_candidates: number;
  nvd_candidates: number;
  nve_candidates: number;
}

export interface BackendPredictResponse {
  gradable: boolean;
  quality: BackendQuality | null; // null when MATLAB isn't installed/running -- Python-only fallback
  predicted_class?: number;
  predicted_label?: string;
  probabilities?: BackendClassProbability[];
  recommendation?: string;
  referable?: boolean;
  referable_probability?: number;
  preprocessed_image_base64?: string;
  gradcam_overlay_base64?: string;
  enhanced_image_base64?: string;
  structures_overlay_base64?: string;
  segmentation_summary?: BackendSegmentationSummary;
}

export interface BatchScreeningItem {
  id: string;
  filename: string;
  patientId: string;
  eyeSide: 'Left (OS)' | 'Right (OD)';
  status: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  progress: number;
  qualityStatus?: ImageQualityStatus;
  stage?: DRStage;
  confidence?: number;
  referralStatus?: ReferralStatus;
  record?: ScreeningRecord;
}
