# Quality assessment + enhancement (Stage 1)

Gates a fundus image before it reaches the DR grading model: scores focus,
illumination, and field of view; adaptively enhances borderline images
(CLAHE + illumination normalization + denoising); rejects ungradeable ones
with plain-language recapture feedback for the camera operator.

## Files

| File | Purpose |
|---|---|
| `assessFundusQuality.m` | Entry point. Runs all checks, returns a verdict + report struct. |
| `defaultQualityConfig.m` | All thresholds, in one place. Tune here. |
| `computeFOVMask.m` | Segments the fundus circle from the black background; area/centering/clipping diagnostics. |
| `computeFocusScore.m` | Variance-of-Laplacian sharpness, masked to the field of view. |
| `computeIlluminationScore.m` | Mean exposure + grid-based uniformity (catches vignetting/glare that a single global brightness check misses). |
| `enhanceFundusImage.m` | Illumination normalization -> CLAHE (Lab L-channel) -> bilateral denoise. Its output was already being used silently (fed to segmentation/grading whenever quality was borderline) since the MATLAB-Python integration; `analyzeForApp.m`/`backend/main.py` now also return it for display, as an "Enhanced" view in the app's image toggle -- previously computed and used, but never actually shown. |
| `generateRecaptureFeedback.m` | Reason codes -> plain-language operator guidance. |
| `runQualityPipeline.m` | Batch driver over a folder; CSV report + verdict tally. |
| `demoQualityCheck.m` | Script: visual montage over a handful of real APTOS images. |

## Quick start

```matlab
setupPaths   % from matlab/, adds this folder to the path

report = assessFundusQuality('../training/data/aptos2019/train_images/<id>.png');
report.verdict     % "pass" | "pass_after_enhancement" | "borderline" | "reject"
report.reasons     % cellstr of reason codes, e.g. {'too_blurry'}
report.feedback     % operator-facing text if reject/still-borderline
```

Batch over a dataset:

```matlab
summary = runQualityPipeline('../../training/data/aptos2019/train_images', 'aptos_quality.csv');
```

## Calibration status

Originally written without a MATLAB license available, then calibrated for
real once MATLAB R2026a was installed and run against APTOS. Three real
problems turned up from actually running it, all now fixed — worth knowing
about since the same pattern (guess -> run against real data -> find it's
wrong -> fix) will apply to IDRiD/DRIVE/Messidor-2 too:

1. **Focus thresholds were checked against a synthetic white-noise texture**
   with a variance-of-Laplacian in the tens of thousands — nothing like a
   real photo. Real APTOS images score single digits to ~90. Fixed by
   sampling 400 real images and setting thresholds from the percentile
   distribution instead (`tests/diagnoseFocusThresholds.m`).
2. **No working-resolution cap**, unlike the Python side's
   `ben_graham_preprocess`. Native images run 1000-3400px wide here; scoring
   and enhancing at full resolution measured ~2s/image — nowhere near
   100,000+ patients/year throughput. Added a 640px downscale
   (`opts.MaxWorkingDim`) before any processing — ~14x faster, and required
   redoing the focus calibration since variance-of-Laplacian is scale-dependent.
3. **A "3+ sides touch the frame border" clipping heuristic false-flagged
   ~45% of a real sample.** These datasets are commonly pre-cropped tight to
   the fundus circle's own bounding box, which touches the frame edge even
   when the circle is completely intact — touching isn't clipping. Replaced
   with a real geometric test in `computeFOVMask.m`: actual mask area vs. the
   area of an ellipse inscribed in the same bounding box (an intact circle
   fills that ellipse almost completely; a truncated one falls meaningfully
   short, regardless of how many sides nominally touch).
4. **No check at all for source resolution** — found not during calibration
   but from a real user-reported misgrading: a 480x432px web image (a
   published-paper figure, resaved/recompressed multiple times) passed
   quality cleanly (focus/illumination/FOV were all genuinely fine at that
   size) but graded Severe at 74.5% confidence against a true Mild.
   Grad-CAM showed the model's attention concentrated on JPEG-recompression
   blotching and the normal foveal pigment spot, amplified into lesion-like
   blobs by Ben Graham preprocessing's 4x local-contrast gain. A resolution
   sweep on a known-correct reference image (real ground truth: Severe)
   confirmed WHY 640px specifically is the right floor, not a guess: both
   `ben_graham_preprocess` and this module's own `MaxWorkingDim` only ever
   downscale, never upscale, so every native image >= 640px converges to
   the same effective working resolution before any scoring/contrast step
   runs — the sweep graded correctly and consistently from 4288px down to
   640px, only degrading below that (wobbling by 320px, a clean wrong-class
   flip by 200px). Added `opts.MinNativeResolutionPx = 640`, checked before
   any downscaling, straight to `reject` (unlike focus/illumination, no
   amount of enhancement can add back resolution that was never captured).
   Checked this doesn't quietly break anything already in use: APTOS has
   2/3662 images below this floor (0.05%); IDRiD (train+test) and
   Messidor-2 have zero. DRIVE's own images (584x565) DO fall below it, but
   DRIVE is only ever used for direct vessel-segmentation validation, never
   routed through this quality gate — see `defaultQualityConfig.m` for the
   full disclosure on that trade-off.

Current state, verified against a random 500-image sample of real APTOS
images at 640px working resolution: **72.6% pass, 25.0%
pass_after_enhancement, 2.4% reject, 0% stuck unresolved in borderline**
(`tests/verdictTally.m`, `tests/reasonTally.m`) — measured before the
resolution check above was added; expect a negligible additional ~0.05%
shifting from pass/enhancement into reject on APTOS specifically now that
that's live. `runtests('tests')` is 16/16 passing (11 quality + 5
segmentation).

**Cross-checked against Messidor-2 and IDRiD** (`tests/verdictTallyExternal.m`,
n=300 each, both different clinics/cameras than APTOS) once those datasets
were integrated: Messidor-2 — 92% pass, 8% pass_after_enhancement, 0%
reject; IDRiD (Disease Grading, training split) — 79% pass, 20.3%
pass_after_enhancement, 0.7% reject. Both healthy, non-degenerate
distributions with essentially everything ending up gradable — the
APTOS-only calibration generalizes, it wasn't overfit to APTOS-specific
quirks. Messidor-2's cleaner numbers (0% reject) are plausible given it's a
well-curated clinical research dataset; IDRiD's slightly higher enhancement
rate is plausible too (I have no independent quality ground truth for either
to confirm beyond this population-level plausibility check).

Still open: none of the three datasets has a ground-truth "ungradeable"
label to validate the reject rate against directly — the reject-threshold
calibration is still anchored on the working assumption that images
carrying a diagnosis/grade label were judged human-gradable by whoever
curated that dataset. `uniformityCV` (illumination unevenness) in particular
has no labeled bad examples behind it yet, only a moderate tightening toward
where the curated-data tail sits — see the full reasoning in
`defaultQualityConfig.m`. Re-run `diagnoseFocusThresholds.m` /
`verdictTally.m` / `reasonTally.m` / `verdictTallyExternal.m` against any
known-bad field captures you get access to, which would be the first real
ground truth for the reject threshold specifically.
