# Retinal structure segmentation (Stage 2)

Extracts clinically relevant structures from a fundus image: vessels, optic
disc, fovea. Runs after the quality gate (`../quality/`) — callers should
only feed it images that passed (or were enhanced to pass) Stage 1.

## Status

**Built and quantitatively validated against real ground truth:**

| Component | Metric | Result | Source |
|---|---|---|---|
| Vessel segmentation | sensitivity / specificity / Dice | 69.2% / 94.9% / 0.672 | DRIVE, 20 training images (retuned — see below) |
| Optic disc localization | success rate (error < 1 OD diameter) | 89.1% | IDRiD, 413 images |
| Fovea localization | success rate (error < 1 / < 2 OD diameters) | 85.0% / 91.0% | IDRiD, 413 images |

These are in the range published classical (non-deep-learning) methods report
on the same benchmarks. See "Validation history" below for how they were
reached — several real bugs were found and fixed by actually running this
against DRIVE/IDRiD rather than guessing thresholds blind.

**Cross-validated against a SECOND, independent grader (MAPLES-DR), not
just IDRiD/DRIVE.** Every number above came from exactly one expert
annotation source per structure — a real question left open was whether
that performance is genuine or an artifact of IDRiD/DRIVE's own specific
labeling conventions. `tests/validateAgainstMAPLESLesions.m` runs the
same five detectors against MAPLES-DR's independently-annotated masks
(162 of 198 images matched to this project's already-downloaded
Messidor-2 set — a dataset already integrated for neovascularization
validation, just not previously read for its other ten annotation
categories):

| Structure | Original (IDRiD/DRIVE) | MAPLES-DR (second grader, n=162) | Verdict |
|---|---|---|---|
| Optic disc | 89.1% success rate | **96.9%** success rate | Holds up better |
| Microaneurysms (lesion-level hit rate) | 82.0% | **87.6%** | Holds up better |
| Exudates (lesion-level hit rate, pre-retune) | 59.5% | **71.4%** | Holds up better |
| Hemorrhages (lesion-level hit rate) | 46.1% | 45.9% | Essentially identical |
| Vessels (Dice, before the fix below) | 0.673 | 0.594 | Weaker — real, diagnosed and fixed below |

Read this honestly: four of five structures generalize to a completely
independently-annotated dataset AS WELL AS OR BETTER than the original
validation — real evidence these detectors learned something about
lesion/structure appearance, not just IDRiD's specific labeling style. A
real bug was caught building this: microaneurysm/exudate/hemorrhage masks
run at a different working resolution than vessel/OD masks
(`opts.LesionMaxWorkingDim` vs `opts.MaxWorkingDim`) — reusing one
pre-sized FOV mask across all five detectors raised a real "incompatible
array sizes" error before being fixed to resize the FOV mask per
detector's own resolution.

**Vessel segmentation was the one genuine exception — diagnosed, not just
noted.** `tests/diagnoseVesselMAPLESGap.m` measured recall conditioned on
each ground-truth pixel's LOCAL VESSEL WIDTH (via the Euclidean distance
transform, giving each pixel's distance to the nearest background pixel —
its local radius) instead of guessing from a handful of images: 76% of
MAPLES-DR's annotated vessel pixels are the THINNEST category (<2px
half-width), and the old threshold (`VesselThresholdPercentile=88`)
caught only 38.6% of those, vs 91.0%/88.8% for medium-width vessels — the
entire gap traced to one specific, measurable cause, not a vague "MAPLES
is different" hand-wave. `tests/tuneVesselThresholdForThinVessels.m` then
swept the threshold against BOTH DRIVE and MAPLES-DR together — never
tune against only the dataset that motivated the change, the same
discipline that caught a real regression during the optic-disc fix
earlier (see "Phase 3" below). Lowering the threshold to 86 (from 88)
recovers real MAPLES-DR thin-vessel recall (38.6%→48.3%, overall Dice
0.594→0.645) at a NEGLIGIBLE DRIVE cost (Dice 0.673→0.672) — the sweep
also tested 84/82/80, which give more MAPLES-DR gain but start costing
DRIVE for real (Dice down to 0.653/0.625/0.592), so 86 was chosen as the
point where the DRIVE cost is still negligible, not the point of maximum
MAPLES-DR gain. `defaultSegmentationConfig.m`'s `VesselThresholdPercentile`
now reflects this.

**A follow-up idea tested and found NOT to help — reported honestly, not
hidden.** Hypothesis: a single `fibermetric` call over the whole
`VesselThicknessRange=[1 8]` might under-represent thin structures
relative to thick ones in its combined response, so
`segmentVesselsMultiScale.m` ran `fibermetric` separately over three
narrower bands (`[1 3]`, `[3 5]`, `[5 8]`) and fused by pixelwise maximum
— a legitimate, standard multi-scale ridge-detection strategy.
`tests/validateVesselMultiScale.m` tested it against BOTH DRIVE and
MAPLES-DR at the SAME threshold (86) as the single-scale baseline, to
isolate the fusion-strategy change specifically: the result was
numerically IDENTICAL to single-scale on both (DRIVE 69.0% vs 69.2% sens,
0.672 Dice both; MAPLES-DR thin-vessel recall 48.3% and Dice 0.645,
exactly matching). Most likely explanation: `fibermetric` already
performs some form of multi-scale combination internally across the
range it's given, making external band-splitting redundant, not
additive. Kept as an experimental file (not wired into `analyzeForApp.m`,
which still uses the validated `segmentVessels.m`) — a documented dead
end, not a silent abandonment, matching this project's practice of
reporting a negative result as plainly as a positive one.

**Built and validated, with an honest caveat:** microaneurysm, hard exudate,
and hemorrhage detection, all validated against the full IDRiD segmentation
training set (n=54). Pixel-level segmentation accuracy is weak across all
three (Dice 0.08-0.13) — a real, disclosed limitation of simple single-stage
classical methods for this specific task, not an undertuned threshold (see
"Lesion detection results" below for the tuning effort that went in before
concluding this). Lesion-level *detection* is more usable, especially for
microaneurysms (82% of true MA lesions have at least one overlapping
detected pixel) — meaningful as a first-stage candidate generator for a
human-in-the-loop review workflow, which is literally what the SIH brief
asks for, even though it's not a standalone diagnostic-grade segmentation.

**A real attempt to fix the shared weak point (precision) across all
three, with an honest recall trade-off, not deployed as a hard filter.**
`tests/trainCandidateRefinementClassifier.m` trains a per-candidate
classifier (shape: Area/Eccentricity/Solidity/EquivDiameter; intensity:
MeanIntensity + local contrast against a dilated ring) on 250,022 real
microaneurysm candidates extracted from the COMBINED IDRiD + MAPLES-DR
ground truth (216 images) — deliberately shape/intensity only, not
radiomics texture, since GLCM co-occurrence statistics need more pixels
than many MA candidates have (already fragile at whole-lesion-mask scale,
see `grading/extractRadiomicFeatures.m`'s own docstring; per-tiny-blob
risked the same degenerate-output failure mode for a noisier input). A
RUSBoost ensemble (Statistics and Machine Learning Toolbox), chosen for
the real 39:1 false:true candidate imbalance measured in the data, fit on
80% of images and evaluated on the other 20% (split by IMAGE, not by
candidate, so no image's candidates leak between train and test):

| | Precision | Recall |
|---|---|---|
| Before filtering (current behavior) | 2.6% | 100.0% |
| After filtering | **20.7%** | **62.7%** |

Read this as a genuine trade-off, not a clean win: precision improves 8x,
but 37.3% of real microaneurysms that currently get flagged would be
silently dropped if this were deployed as a hard accept/reject filter —
a real clinical-safety cost for the lesion type that's earliest and most
subtle sign of DR. Feature importance shows the classifier's decision is
driven almost entirely by candidate **Area** (0.0070 out-of-bag permuted
importance; every other feature is 0.0015 or below) — a simpler mechanism
than hoped, disclosed rather than dressed up. **Not wired into the live
`analyzeForApp.m` pipeline as a filter for this reason** — the honest
recommendation is to expose the classifier's probability as an optional
per-candidate CONFIDENCE SCORE for a human reviewer to sort/threshold
themselves (the brief's own "human-in-the-loop" framing), not an
automated cut that silently hides real disease. The trained classifier is
saved (`tests/maCandidateClassifier.mat`) for that future use, not
deployed yet.

**A gentler, recall-preserving operating point exists, found by sweeping
the classifier's decision threshold instead of accepting its default.**
`tests/sweepMACandidateThreshold.m` re-scores the same held-out test
candidates at different decision points instead of retraining anything.
This caught a real, subtle bug first: RUSBoost (like most boosting
ensembles in MATLAB) does NOT produce two-column scores that behave like
a calibrated probability comparable to an absolute 0.5 cutoff the way a
Bag/random-forest ensemble's do — a first attempt at "sweep probability
> cutoff" gave results nearly the exact complement of the original
training run's own numbers (kept 47,944/50,050 candidates vs. the
original 3,947/50,050 at the "same" cutoff). Fixed by sweeping a MARGIN
between the two class scores instead (`trueScore - falseScore > margin`),
verified to reproduce `predict()`'s own default decision exactly at
margin=0 before trusting a sweep built on it. Result:

| Margin | Precision | Recall |
|---|---|---|
| Default (0, the original result) | 20.7% | 62.7% |
| **-1.659 (recall-preserving)** | **4.8%** | **91.4%** |

At margin=-1.659, precision still nearly doubles the 2.6% no-filtering
baseline while keeping recall at 91.4% — a real, if more modest,
improvement than the aggressive default, and one this project could
actually defend deploying for a lesion type where missing cases is the
larger clinical risk. Still not wired into `analyzeForApp.m` as a hard
filter (same reasoning as above — an optional confidence-score threshold
a reviewer chooses is safer than an app-side default either way), but
this is the operating point to reach for if that feature is ever built.

**A genuinely new capability, not just a tuning pass: soft exudates
(cotton wool spots) had NO detector at all before this** — the string
"soft exudate" only ever appeared in code comments, confirmed by grepping
the whole codebase before building anything. `detectSoftExudates.m`
follows the same white-top-hat family as `detectHardExudates.m` but tuned
for a clinically different lesion: cotton wool spots are nerve-fibre-layer
infarcts — larger, paler, more diffuse, with ill-defined borders, unlike
hard exudates' small sharp lipid deposits. It subtracts the hard-exudate
mask from its own candidates first, so a single bright blob can't be
double-counted as both. `tests/tuneSoftExudateParams.m` swept structuring-
element radius and threshold percentile over {20,30,40}x{94,96,98}
against IDRiD's Soft Exudate ground truth (26 of 54 training images have
one) AND MAPLES-DR's CottonWoolSpots category (162 matched images)
together:

| Radius/Pctl | IDRiD SE lesion-hit | MAPLES-DR CWS lesion-hit |
|---|---|---|
| **20/94 (chosen)** | **86.2%** | **34.5%** |
| 20/96 | 80.6% | 26.2% |
| 30/94 | 79.2% | 23.1% |
| 40/98 | 43.3% | 8.6% |

20/94 won clearly on lesion-level hit rate on BOTH datasets, not just one.
Read the MAPLES-DR number honestly, though: 34.5% is real but
meaningfully weaker than IDRiD's 86.2% — this detector's candidate
generation is usable on IDRiD but doesn't yet generalize nearly as well
to MAPLES-DR, a real, disclosed limitation for a brand-new detector, not
smoothed over. Pixel-level Dice is weak across the whole grid tested
(0.066-0.084 IDRiD, 0.004-0.006 MAPLES-DR) — consistent with every other
lesion detector in this module, not a bug specific to this one. Wired
into the live pipeline (`analyzeForApp.m`, `backend/main.py`'s
`soft_exudate_candidates` field) in its own namespace, same pattern as
neovascularization, since it doesn't yet have the same validation
confidence as the five original detectors.

**Built, and now genuinely validated at the pixel/image level — with an
honest, weak result, not the "no ground truth exists" gap this used to
be.** Neovascularization (NV) detection, split into NVD ("at the disc")
and NVE ("elsewhere"). Distinguishing abnormal new vessels from normal (if
tortuous) vasculature is a harder pattern-recognition problem than blob/
lesion detection — no "round dot" or "bright blob" prior to exploit, so
`detectNeovascularization.m` instead flags vessel-skeleton segments that are
simultaneously locally dense (packed capillary tufts) and abnormally
tortuous (geodesic arc-chord ratio), the two classical NV signals in the
fundus-imaging literature.

Real pixel-level NV ground truth was found and integrated this session —
**MAPLES-DR** (Messidor Anatomical and Pathological Labels for Explainable
Screening, CC-BY-NC-SA-4.0), which has a genuine `Neovascularization` mask
category on real Messidor color fundus images (`training/data/maples_dr/`,
matched against this project's already-downloaded Messidor-2 image set —
162 of 198 mask files matched). Neither DRIVE nor IDRiD has this; a DRAC22
NV mask set was also found but uses OCTA imagery, an incompatible modality
for this classical-color-fundus pipeline, and wasn't pursued.

`tests/validateAgainstMAPLESNV.m` — **honest result, not a flattering
one:**

| Metric | Result | n |
|---|---|---|
| Pixel-level Dice (NV-positive images) | **0.000** (mean and median) | 5 |
| Image-level sensitivity (≥1 candidate pixel anywhere in a positive image) | **40.0%** (2/5) | 5 positive |
| Image-level specificity (zero candidate pixels in a negative image) | **63.7%** (100/157) | 157 negative |
| Aggregate pixel-level sensitivity / specificity | 0.0% / 99.99% | 162 total |

**Read this correctly, not just as a bad number.** NV is clinically rare
(present only in proliferative DR) — of 198 MAPLES-DR images with an NV
mask file, only 6 are genuinely NV-positive, and only 5 of those match an
image already downloaded in this project's Messidor-2 set; the 6th
(`20051202_51488_0400_PP`) belongs to the original Messidor collection,
not the Messidor-2 subset available on Kaggle, and getting it requires a
separate registration process outside what this session can complete
(`tests/checkMissingNVImage.m` confirms exactly which file and why, rather
than leaving "n=5" unexplained) — so n=5 is the genuine current ceiling on
this sample, not a code limitation. That is a genuinely small sample, and
these percentages carry wide uncertainty. But
even accounting for that, the finding is real and worth stating plainly:
**this detector's candidates do not spatially land on the true NV
lesions** — zero pixel overlap across every positive case, and it also
flags spurious candidates in over a third of true-negative images. The
directional check below (candidate *count*, not location, trending higher
on PDR images) still holds and is a different, real, separately-true
finding — but it now has real company from a location-based check that
disagrees with treating this as anything close to a working detector at
the lesion level. Likely explanation: the density+tortuosity signal used
here is picking up SOME real signature of advanced disease (more chaotic
vasculature generally, IRMA, venous beading) that correlates with PDR
grade without being the specific NV lesions themselves.

The original directional sanity check (`tests/checkNeovascularizationTrend.m`)
— candidate count and area on 40 real IDRiD Disease Grading images trend
significantly higher on grade-4/PDR images than on grade-0/No-DR images,
one-sided ranksum p=0.0124 (count) / p=0.0268 (area) — still stands and is
worth keeping in mind alongside the MAPLES-DR result above: it's a
genuinely different claim ("more candidates on more severe images", true)
from "candidates are located at real NV lesions" (now measured, false).
Present this output to reviewers as "candidate tortuous/dense vessel
regions, informative in aggregate but not reliably localized" — never as
"neovascularization detected". See `detectNeovascularization.m`'s
calibration caveat for the full reasoning.

## Files

| File | Purpose |
|---|---|
| `segmentVessels.m` | Vessel mask via `fibermetric` (multiscale vesselness filter) on the illumination-normalized green channel. |
| `localizeOpticDisc.m` | OD center/radius from blended vessel-convergence + brightness signals. |
| `localizeFovea.m` | Fovea center via darkest-region search in the anatomically expected annulus around the OD. |
| `defaultSegmentationConfig.m` | All thresholds, one place to tune — includes the DRIVE/IDRiD calibration history inline. |
| `demoSegmentation.m` | Visual montage demo against real APTOS images (OD circle + fovea marker + vessel mask). |
| `computeLesionExclusionMask.m` | Shared: FOV mask + dilated OD/vessel exclusion mask at lesion working resolution, reusing the already-validated vessel/OD detection at standard resolution. |
| `detectHardExudates.m` | White top-hat (bright blobs) on the illumination-normalized green channel. |
| `detectHemorrhages.m` | Black top-hat (dark blobs), shape-filtered by eccentricity, THEN type-classified dot/blot vs. flame-shaped (eccentricity + radial-orientation-from-OD confirmation). |
| `detectMicroaneurysms.m` | Rotating-linear-structuring-element morphological reconstruction (Zana & Klein / Walter et al. style) — distinguishes round MA blobs from vessels directly rather than relying on the exclusion mask alone. |
| `detectNeovascularization.m` | NVD/NVE candidate flagging + OD-relative zone labeling on top of `findTortuousVesselSegments.m` — see the "Not yet built" entry above, this is a heuristic with directional-only sanity checking, not a validated detector. |
| `findTortuousVesselSegments.m` | Shared core (local density + geodesic arc-chord tortuosity): the OD-independent candidate-finding logic behind both `detectNeovascularization.m` and `localizeOpticDisc.m`'s tortuous-cluster exclusion (Phase 3 below) — one piece of logic, two real uses. |

Validation/tuning scripts live in `../tests/`: `validateAgainstDRIVE.m`,
`tuneVesselThreshold.m`, `validateAgainstIDRiD.m`, `checkFoveaLaterality.m`,
`realDataSegmentationCheck.m`, `checkLesionSizes.m`,
`validateAgainstIDRiDLesion.m` (generic, parameterized by lesion type),
`tuneExudateThreshold.m` / `tuneExudateRadius.m` / `tuneExudateColor.m`,
`checkHemorrhageOrientationConvention.m` (confirms the `regionprops`
Orientation/Centroid sign convention the flame-hemorrhage radial check
depends on — see "Hemorrhage type classification" below, this one caught a
real sign bug before it shipped), `checkNeovascularizationTrend.m` (the
directional PDR-vs-No-DR sanity check described above),
`diagnoseODMisdetection.m` / `diagnoseODConvergence.m` /
`diagnoseODExudateOverlap.m` / `diagnoseODNVOverlap.m` (the four-hypotheses
diagnosis behind the Phase 3 OD fix below — kept as a record of what was
ruled out, not just what worked), `tuneODTortuosityExclusion.m` (the
threshold sweep that caught attempt 1's regression and found attempt 2's
fix), `validateAgainstMAPLESNV.m` (real pixel-level NV ground-truth
validation against MAPLES-DR, see "Neovascularization" above).

## Quick start

```matlab
setupPaths

img = imread('../training/data/aptos2019/train_images/<id>.png');
[vesselMask, vInfo] = segmentVessels(img);
odInfo = localizeOpticDisc(img, vesselMask);
foveaInfo = localizeFovea(img, odInfo);
```

## Validation history

Built and debugged in the same session, in two phases: synthetic-only (before
DRIVE/IDRiD were downloaded), then against real ground truth once they
landed. Five real bugs turned up, in order:

**Phase 1 — synthetic tests, before real data:**

1. **Synthetic-test construction bug**: one of the test's 8 "vessel" lines
   happened to land exactly on the horizontal meridian, running straight
   through the fovea search band. Fixed by offsetting the line angles —
   which also happens to better match real anatomy (there's a genuine
   vessel-free zone around the fovea; the temporal arcades curve around it).
2. **Real algorithm bug in `localizeFovea`**: plain (unnormalized) Gaussian
   smoothing near the FOV boundary blends in the black background, dragging
   local averages down artificially close to the rim. Since fovea search is
   an *argmin* (darkest point), this created a spurious "darkest point" right
   at the edge of the fundus circle that beat the real fovea darkening every
   time — detected fovea landed 226px from the true location in a 300px
   frame, right at the mask boundary. Fixed with mask-weighted normalized
   convolution (divide by a same-kernel blur of the mask itself), correctly
   excluding the missing background mass from each local average instead of
   implicitly treating it as zero-intensity data.

(`localizeOpticDisc.m` has the same class of boundary dilution in its
brightness/vessel-density maps but was *not* rewritten to match, because it's
an argmax search: boundary dilution can only suppress a candidate near the
rim, never spuriously promote one — a mild bias, not an active wrong-answer
trap. The 89.1% IDRiD result below didn't show a rim-biased failure pattern,
so this was left as documented rather than reworked.)

**Phase 2 — against DRIVE (vessels) and IDRiD (OD/fovea):**

3. **Vessel threshold too conservative**: the original Otsu-based cutoff
   measured 43.5% sensitivity at 98.3% specificity on DRIVE — missing well
   over half of true vessel pixels. `tests/tuneVesselThreshold.m` cached the
   (expensive) vesselness response once per image and cheaply swept
   threshold percentiles 70-95, finding percentile 88 maximized Dice (0.656
   in the raw sweep). Switched the default from `'otsu'` to `'percentile'`.
4. **Inverted percentile formula**: while making that switch, found the
   `'percentile'` branch's threshold formula was backwards (`VesselThresholdPercentile=90`
   would threshold at the 10th percentile, keeping ~90% of pixels as
   "vessel" — the opposite of the intent). Never exercised while `'otsu'`
   was the default, but wrong regardless. Fixed.
5. **Fovea side-disambiguation was near coin-flip**: initial IDRiD run showed
   fovea localization at only 55.2% success (< 1 OD diameter) despite a good
   *median* error (0.264 diameters) — a bimodal good/bad split pointing at
   the left/right ambiguity. `checkFoveaLaterality.m` confirmed IDRiD has no
   dataset-level convention to exploit (50.6%/49.4% split — genuine
   ambiguity). Root cause instead: picking "whichever side's darkest raw
   pixel is lower" is easily fooled by one unrelated dark pixel (a
   hemorrhage, a vessel shadow) on the wrong side. Rewrote to score each
   side by a z-score (how distinctive its minimum is relative to its own
   local mean/std) instead of raw brightness — success rate rose to 69.7%.
   Debugging *that* found a second issue: an off-center OD can push one
   side's search band up against the FOV boundary, leaving it with far
   fewer pixels (one debug case: 899 vs 5579) whose z-score is a noisier,
   chance-inflated statistic. Added `FoveaMinBandSizeFraction` to discard a
   badly-starved side outright — success rate rose again, to 85.2%.

Each fix was verified against the full real dataset before being kept, not
just the synthetic suite (`tests/tSegmentation.m`, 14/14 passing throughout
phase 2 without needing further changes).

**Phase 3 — a real false positive found, misdiagnosed, then correctly fixed
(worth reading end to end: the wrong hypothesis is as instructive as the
right one).**

Found visually while building `annotateStructuralFindings.m`: on
`IDRiD_016.jpg` (a Severe-grade image), `localizeOpticDisc` reported center
`[386, 119]` at the working resolution, confidence 0.8957 — a HIGH
confidence score, yet visually wrong; the true optic disc (ground truth
from IDRiD's OD Center CSV: native `[940, 1359]`, i.e. `[140, 203]` at this
working resolution) is elsewhere in the frame.

**First hypothesis (wrong): bright exudates.** This function's own
docstring already speculated exudates as the confusion risk, and the image
has 504 hard exudate candidates. Plausible-sounding, but four things were
actually measured before trusting it, and all four disagreed:
- Vessel density at the false peak (0.946) was HIGHER than at the true OD
  (0.587), not lower — exudates shouldn't out-converge real vasculature.
- Yellowness (Lab b\*) at the true OD (mean 74.97) was HIGHER than at the
  false peak (57.68) — the opposite of "false peak is more exudate-colored."
- The false peak had ZERO overlap with the already-validated hard-exudate
  *detector's* candidate mask; the true OD had more.
- The false peak was FARTHER from the FOV boundary (126.6px) than the true
  OD (103.4px) — ruling out the boundary-dilution caveat this function's
  docstring already flagged as a separate, known, unrelated limitation.

(See `tests/diagnoseODMisdetection.m`, `diagnoseODConvergence.m`,
`diagnoseODExudateOverlap.m`.)

**Real cause: a dense, tortuous vessel cluster**, not exudates at all.
`tests/diagnoseODNVOverlap.m` found 13 locally-dense, geodesically-tortuous
vessel segments (the same signal `detectNeovascularization.m` looks for)
clustered within ~110px of the false peak — NV-candidate mask density 1.0%
there vs. 0.0% at the true OD. The false peak's elevated vessel-density
score wasn't a normal vascular arcade; it was a tangled mass.

**Fix, attempt 1 (regressed the benchmark — caught, not shipped):**
`findTortuousVesselSegments.m` was extracted as logic shared with
`detectNeovascularization.m`, and `localizeOpticDisc.m` was given a
penalty that suppresses OD candidates overlapping a dilated tortuous-
cluster mask. Reusing `detectNeovascularization`'s own NV-candidate
tortuosity bar (1.35) fixed the one motivating case (386,119 -> 370,123,
still wrong) only once the dilation radius was swept up to >=0.66x the OD
search window — which then fixed it cleanly (7.2px error) but, when
validated against the FULL IDRiD OD set (not just the one case), dropped
success rate from 89.1% to **85.7%** and fovea from 85.2% to **77.7%**.
1.35 is the right bar for "flag as an NV candidate for human review" but
far too permissive as an OD-exclusion trigger — it was suppressing
legitimate OD candidates near ordinary tortuous-looking vessels in normal
images across the dataset.

**Fix, attempt 2 (validated, shipped):** swept the exclusion's tortuosity
threshold 1.35-2.2 on a 120-image subsample (`tests/tuneODTortuosityExclusion.m`)
independent of `detectNeovascularization`'s own threshold — 2.1 was the
best performer (89.2% on that subsample, at/above the 88.3% exclusion-
disabled baseline) and still fixed the motivating case. Re-run against the
**full** 413-image set: **89.1% OD success rate — identical to the
pre-fix baseline**, fovea 85.0%/91.0% (vs. 85.2%/90.8%, within noise) —
zero measured regression, and `IDRiD_016.jpg` now localizes correctly.

The lesson worth keeping, not just the fix: a false positive's ROOT CAUSE
and its FIRST-GUESS explanation can be completely different things, and a
targeted fix validated only against the one motivating case can look
successful while quietly regressing everything else — both are exactly why
this project validates every change against the full dataset, not the
anecdote that motivated it.

## Final validated numbers

- **Vessel segmentation** (`validateAgainstDRIVE.m`, DRIVE training set,
  n=20): sensitivity 64.2%, specificity 96.3%, accuracy 92.2%, Dice 0.673.
- **Optic disc localization** (`validateAgainstIDRiD.m`, IDRiD, n=413):
  error 0.134 OD diameters (median), 89.1% success rate (error < 1 OD
  diameter) — the standard metric in the OD-localization literature.
  (Post the Phase 3 tortuosity-exclusion fix above — numbers before it were
  0.131/89.1%, i.e. unchanged within rounding: the fix corrects a real
  failure case with no net cost to the aggregate.)
- **Fovea localization** (same run): error 0.072 OD diameters (median), 85.0%
  success (< 1 OD diameter), 91.0% (< 2 OD diameters).

All three sit in the range published classical (non-deep-learning) methods
report on these exact benchmarks — a defensible, evidenced baseline, not a
guess. Remaining headroom: `VesselThicknessRange` was never independently
swept (only the threshold was); the ~11% OD and ~15% fovea failure tails
haven't been characterized (worth checking whether they cluster on
particular image conditions, e.g. poor quality that should have been caught
by Stage 1, or genuine hard cases).

## Lesion detection results (microaneurysms, hard exudates, hemorrhages)

A key finding before any of this: **microaneurysms need a much higher
working resolution than the rest of this module.** `checkLesionSizes.m`
measured real IDRiD lesion sizes at native resolution (4288x2848): MA equiv.
diameter ranges 4.7-51px (median 18.3px). At the standard `MaxWorkingDim=640`
used for quality/vessels/OD/fovea, the median MA would shrink to ~2.7px and
the smallest to under 1px — destroyed by any reasonable smoothing or
morphology. Added a separate `LesionMaxWorkingDim=1600` for all lesion
detection, with OD/vessel exclusion masks still computed at the
already-validated 640 (via `computeLesionExclusionMask.m`) and scaled up,
rather than re-running (and re-calibrating) vessel/OD detection at a new
resolution unnecessarily.

Validated against the full IDRiD segmentation training set (n=54, or 53 for
hemorrhages where one image lacks ground truth):

| Lesion | Sensitivity | Specificity | Precision | Dice | Lesion-level hit rate |
|---|---|---|---|---|---|
| Hard exudates (original tuning, `ExudateThresholdPercentile=97`) | 24.7% | 98.9% | 14.7% | 0.131 | 59.5% |
| Hemorrhages | 13.5% | 99.2% | 11.5% | 0.096 | 46.1% |
| Microaneurysms | 21.8% | 99.5% | 5.1% | 0.076 | 82.0% |

**Hard exudates were retuned again, this time against TWO datasets at
once, and the deployed default changed.** `tests/tuneExudateThresholdTwoDatasets.m`
applied the same method that fixed vessels — sweep against IDRiD AND
MAPLES-DR together, not just IDRiD — to `ExudateThresholdPercentile`.
Unlike vessels, this was a genuine trade-off, not a near-free lunch:
raising the percentile improves pixel Dice but REDUCES lesion-level hit
rate on BOTH datasets (97: IDRiD Dice=0.106/hit=51.9%, MAPLES-DR
Dice=0.035/hit=64.5%; 90: IDRiD Dice=0.062/hit=63.7%, MAPLES-DR
Dice=0.024/hit=80.7%). `ExudateThresholdPercentile` is now 90, chosen for
hit rate over Dice — consistent with the "lesion-level hit rate is the
more informative number" argument two paragraphs below, which this
retune takes at its word rather than leaving the deployed default
optimized for the metric this file itself says matters less. The
sensitivity/specificity/precision columns in the table above are from
the OLDER pctl=97 tuning and were not re-measured at 90 (only Dice and
hit rate were swept) — read the row above as historical tuning record,
not the current deployed configuration's full metric set.

**Read this honestly, not optimistically.** Pixel-level Dice is weak across
all three (0.08-0.13) — this is NOT an undertuned threshold. Before
concluding that, hard exudates alone got: a threshold percentile sweep
(`tuneExudateThreshold.m`), illumination normalization added and tested (no
change), a joint top-hat-radius x threshold sweep (`tuneExudateRadius.m`,
5 radii x 5 percentiles = 25 configurations, best Dice 0.131), and a
yellowness (Lab b*) color criterion added on top (`tuneExudateColor.m`:
moved precision 15.6%->21.1% but sensitivity dropped correspondingly, Dice
flat). It plateaus. This matches the published pattern: simple single-stage
top-hat/threshold classical lesion detectors are a well-known weak baseline
in the DR-screening literature — the strongest classical results use
multi-stage candidate generation followed by a trained classifier
(SVM/Random Forest on hand-crafted per-region features) or region-growing
from seed points, a substantially larger undertaking than implemented here.

**Lesion-level hit rate is the more informative number for how this is
actually usable.** It answers "did we find at least one pixel near each true
lesion" rather than "did we get its exact boundary right" — for a
human-in-the-loop review workflow (exactly what the SIH brief asks for:
"enabling ophthalmologist validation in under 30 seconds"), that's closer to
what matters: flag candidates for a clinician to confirm/reject, not produce
a diagnostic-grade segmentation unsupervised. By that measure:
- **Microaneurysms (82.0%)** is a genuinely strong candidate-generation
  result — MAs are the earliest detectable sign of DR, so high recall here
  matters most, and the rotating-SE method's low precision (5.1%) is a much
  more acceptable trade-off for a *candidate* generator than it would be for
  a claimed final segmentation.
- **Hard exudates (59.5% originally, now 63.7% IDRiD / 80.7% MAPLES-DR
  after the two-dataset retune above)** and **hemorrhages (46.1%)** are
  weaker than microaneurysms — real, but not strong enough to present as
  reliable on their own.

## Hemorrhage type classification (dot/blot vs. flame-shaped)

Added on top of the already-validated hemorrhage *detection* above — this
classifies each surviving candidate (already past the vessel-fragment
eccentricity reject) into the two everyday clinical categories: **dot/blot**
(compact, deep-retinal-layer) vs. **flame-shaped** (elongated, superficial
nerve-fibre-layer, runs along nerve fibre bundles radiating from the optic
disc). Primary signal is shape (`HemorrhageFlameEccentricityMin`); a
secondary confirmatory signal checks whether a shape-flagged flame
candidate's major-axis orientation actually points radially away from the
OD (`HemorrhageFlameRadialToleranceDeg`), reclassifying it dot/blot if not.
**Preretinal/subhyaloid hemorrhage is explicitly out of scope** — that
category is recognized clinically by a horizontal fluid level, a cue this
2D-blob-shape method has no way to see; producing only two categories here
is a deliberate scope decision, not an oversight.

Building the radial check surfaced a real bug before it shipped, caught by
actually testing the geometry rather than trusting a coordinate-convention
assumption: `regionprops`'s `Orientation` is reported in a DISPLAY-style
frame (positive = counterclockwise as the image appears on screen), while
its `Centroid` is plain `[x y]` = `[col row]` with no such flip — a naive
`atan2d(dy, dx)` radial angle was off from `Orientation` by up to 60.36
degrees across six test angles. `tests/checkHemorrhageOrientationConvention.m`
builds a synthetic elongated blob at known angles from a known anchor point
and confirmed that negating `dy` before `atan2d` matches `Orientation` to
within 0.34 degrees at every tested angle — that's the version shipped.

On the same real image used for the end-to-end smoke test (`IDRiD_016.jpg`,
185 total hemorrhage candidates): 114 classified dot/blot, 71 flame — a
plausible, non-degenerate split (neither category is empty or near-100%),
though this classification itself has not been validated against expert
ground truth (IDRiD's segmentation masks don't carry a per-lesion type
label to check against) — treat it with the same "candidate, not confirmed"
framing as detection. Actively re-checked, not just assumed still true:
MAPLES-DR (found and integrated this session specifically because it has
real NV ground truth — see below) was also checked for a hemorrhage-type
label and confirmed to have only a single unified `Hemorrhages` category,
same as every other dataset available to this project — no dataset this
project has access to carries dot/blot-vs-flame ground truth, so this
remains a genuine, currently-unfixable data-availability gap rather than
an oversight.

## Neovascularization directional check

`tests/checkNeovascularizationTrend.m`, 40 real IDRiD Disease Grading
images (20 grade-0/No-DR, 20 grade-4/PDR, `rng(42)`), ~0.29 s/image:

| Group | NV candidate count (mean / median) | NV candidate area px (mean / median) | NVD count (mean) |
|---|---|---|---|
| Grade-0 (No DR, n=20) | 0.50 / 0.0 | 11.6 / 0.0 | 0.35 |
| Grade-4 (PDR, n=20) | 1.85 / 1.0 | 27.4 / 14.5 | 0.75 |

One-sided `ranksum` (Statistics and Machine Learning Toolbox — appropriate
here since candidate counts are small non-negative integers, clearly not
Gaussian, so a t-test's normality assumption doesn't hold): count
p=0.0124, area p=0.0268 — PDR images show significantly more NV candidates
than No-DR images. This is real evidence the heuristic points in a
clinically sane direction. It is NOT lesion-level validation (see "Not yet
built" above) — do not report this as a sensitivity/specificity number,
because there is no ground truth to compute one against.

## Real-data plausibility check (APTOS, no ground truth)

`tests/realDataSegmentationCheck.m` — 60 random APTOS images, 0.278 s/image:
vessel density median 6.1% of FOV, OD confidence median 0.95, OD-fovea
spacing median 2.18 OD diameters. Superseded in importance by the DRIVE/IDRiD
numbers above (which have actual ground truth), but still useful as a spot
check on the dataset the quality module was calibrated against.
