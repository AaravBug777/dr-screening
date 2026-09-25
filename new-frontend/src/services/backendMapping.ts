// Shared real-data helpers for the live screening pipeline. Kept separate
// from the old screeningApi.ts mock functions so nothing here can
// accidentally fall back to fabricated numbers.

import { DRStage } from '../types';

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
