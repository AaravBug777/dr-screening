// Static explanatory copy — kept separate from components so it's easy to
// review/edit wording without touching layout code.

export const GRADE_MEANINGS = [
  {
    label: 'No DR',
    meaning: 'No visible signs of diabetic retinopathy in this image.',
  },
  {
    label: 'Mild',
    meaning: 'Small microaneurysms — tiny bulges in retinal blood vessels — are visible. This is the earliest detectable stage.',
  },
  {
    label: 'Moderate',
    meaning: 'More extensive blood vessel damage, potentially including small hemorrhages. Vision is usually not yet affected at this stage.',
  },
  {
    label: 'Severe',
    meaning: 'Widespread vessel damage across the retina — a strong signal that abnormal new vessels may form soon without treatment.',
  },
  {
    label: 'Proliferative DR',
    meaning: 'Abnormal new blood vessels have formed on the retina. This is the most advanced stage and carries a high risk of vision loss without prompt treatment.',
  },
]

// Short urgency framing shown next to the recommendation, tied to the grade.
export const URGENCY_NOTES = {
  'No DR': 'Diabetic retinopathy often has no symptoms until vision is already affected — this is exactly why regular screening matters even with a clear result.',
  'Mild': 'Diabetic retinopathy often has no symptoms until vision is already affected — this is exactly why regular screening matters even at an early stage.',
  'Moderate': 'Progression can often be slowed significantly with intervention at this stage, before more serious damage occurs.',
  'Severe': 'Delaying care from this point carries real risk — severe disease can progress quickly without treatment.',
  'Proliferative DR': 'This stage carries a high risk of vision loss without prompt treatment — urgent follow-up matters more than at any earlier stage.',
}

// Builds the "why this result" narrative shown in the highlighted
// ResultExplanation panel. Deliberately only describes what the API
// response actually contains (confidence, segmentation counts, optic
// disc/fovea status) -- never invents a lesion location or a claim the
// model didn't make. Returns structured stats (rendered as a compact strip)
// rather than folding every number into prose, so the panel reads as one
// dense report card instead of a paragraph plus a second stacked card.
//
// `stats` vs `lowConfidenceStats`: the segmentation backend validated
// vessel/OD/fovea/MA/exudate/haemorrhage detection against real ground
// truth (DRIVE/IDRiD -- see matlab/segmentation/README.md). Haemorrhage
// TYPE (dot/blot vs flame) and neovascularization candidates carry
// materially weaker evidence -- haemorrhage type has no expert-labeled
// type ground truth to check against, and NV has no lesion-level ground
// truth at all, only a directional trend check on real PDR-vs-No-DR images
// (see detectNeovascularization.m's calibration caveat). Kept in a
// separate, visually distinguished group rather than mixed into the main
// stat strip so the panel doesn't imply they're equally trustworthy.
export function buildResultNarrative(result) {
  const { predicted_label, probabilities, segmentation_summary: seg } = result || {}
  const top = probabilities?.find((p) => p.label === predicted_label)
  const confidencePct = top ? Math.round(top.probability * 100) : null

  const stats = seg
    ? [
        { label: 'Optic disc', value: seg.od_confidence >= 0.7 ? 'Located' : 'Uncertain' },
        { label: 'Fovea', value: seg.fovea_found ? 'Located' : 'Not found' },
        { label: 'Microaneurysms', value: seg.microaneurysm_candidates },
        { label: 'Hard exudates', value: seg.exudate_candidates },
        { label: 'Haemorrhages', value: seg.hemorrhage_candidates },
      ]
    : []

  const lowConfidenceStats = seg
    ? [
        { label: 'Dot/blot haemorrhages', value: seg.hemorrhage_dot_blot_candidates },
        { label: 'Flame haemorrhages', value: seg.hemorrhage_flame_candidates },
        { label: 'Neovascularization (at disc)', value: seg.nvd_candidates },
        { label: 'Neovascularization (elsewhere)', value: seg.nve_candidates },
      ]
    : []

  const sentence = seg
    ? 'Confidence is driven by the regions the Grad-CAM heatmap highlights, cross-checked against a structural pass for the optic disc, fovea, and candidate lesions below.'
    : 'Confidence is driven by the regions the Grad-CAM heatmap highlights across the retina.'

  return {
    confidencePct,
    sentence,
    stats,
    lowConfidenceStats,
    footnote: seg
      ? 'Candidates are unconfirmed — compare views with the toggle before treating them as findings.'
      : null,
    lowConfidenceFootnote: seg
      ? 'Haemorrhage type and neovascularization flags below are an early, less-validated signal — treat them as leads for review, not findings.'
      : null,
  }
}
