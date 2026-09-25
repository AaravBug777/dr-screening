// Longitudinal comparison logic: which prior visits exist for the same
// patient + eye, how their lesion counts changed, and whether the eye
// looks stable, regressing, or progressing between two visits.
//
// Deliberately count-based, not a fabricated pixel-level "diff overlay":
// the backend returns per-image LESION COUNTS (segmentation_summary) but
// never persists per-lesion pixel coordinates or a Grad-CAM/structures
// overlay image into history (see screeningApi.ts's mapToLegacyRecord --
// gradCam.heatmapPoints and structureFindings.lesionMarkers are both
// honestly left empty for the same reason). A real spatial diff would
// require data this app doesn't have; a real count delta is exactly what
// it does have.
import { ScreeningRecord } from '../types';

// records is assumed newest-first (storage.ts's saveScreeningRecord always
// prepends new saves, and the demo seed cohort in data/demoCases.ts is
// already ordered that way) -- there's no reliably parseable timestamp to
// sort by otherwise: real records stamp createdAt via
// toLocaleString('en-IN', {...}) and demo records use a different
// hand-written 'YYYY-MM-DD hh:mm AM/PM' string, so array order is the one
// consistent recency signal across both.
export function getComparableVisits(records: ScreeningRecord[], current: ScreeningRecord): ScreeningRecord[] {
  return records.filter(
    (r) =>
      r.id !== current.id &&
      r.patientInfo.patientId === current.patientInfo.patientId &&
      r.eyeSide === current.eyeSide
  );
}

export type StabilityStatus = 'STABLE' | 'REGRESSING' | 'PROGRESSING' | 'RAPIDLY_PROGRESSING';

export interface StabilityResult {
  status: StabilityStatus;
  gradeDelta: number; // latest.stageNumber - baseline.stageNumber
  label: string;
}

const STABILITY_LABELS: Record<StabilityStatus, string> = {
  STABLE: 'Stable',
  REGRESSING: 'Regressing (Improved)',
  PROGRESSING: 'Progressing',
  RAPIDLY_PROGRESSING: 'Rapidly Progressing'
};

export function computeStabilityIndicator(baseline: ScreeningRecord, latest: ScreeningRecord): StabilityResult {
  const gradeDelta = latest.grading.stageNumber - baseline.grading.stageNumber;
  let status: StabilityStatus;
  if (gradeDelta <= -1) status = 'REGRESSING';
  else if (gradeDelta === 0) status = 'STABLE';
  else if (gradeDelta === 1) status = 'PROGRESSING';
  else status = 'RAPIDLY_PROGRESSING';
  return { status, gradeDelta, label: STABILITY_LABELS[status] };
}

export interface LesionDeltaRow {
  key: string;
  label: string;
  baseline: number;
  latest: number;
  delta: number;
}

const LESION_FIELDS: Array<{ key: keyof ScreeningRecord['structureFindings']['lesionCount']; label: string }> = [
  { key: 'microaneurysms', label: 'Microaneurysms' },
  { key: 'hemorrhages', label: 'Hemorrhages' },
  { key: 'hardExudates', label: 'Hard Exudates' },
  { key: 'cottonWoolSpots', label: 'Cotton Wool Spots' },
  { key: 'neovascularization', label: 'Neovascularization' }
];

export function computeLesionDelta(baseline: ScreeningRecord, latest: ScreeningRecord): LesionDeltaRow[] {
  return LESION_FIELDS.map(({ key, label }) => {
    const baselineCount = baseline.structureFindings.lesionCount[key];
    const latestCount = latest.structureFindings.lesionCount[key];
    return { key, label, baseline: baselineCount, latest: latestCount, delta: latestCount - baselineCount };
  });
}
