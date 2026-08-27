function opts = defaultQualityConfig()
%DEFAULTQUALITYCONFIG Central threshold config for fundus image quality assessment.
%   Mirrors the "single edit point" pattern used in training/config.py on the
%   Python side — tune everything here, nothing else needs to change.
%
%   CALIBRATION STATUS: recalibrated against real data — computeFocusScore,
%   computeIlluminationScore and computeFOVMask were run over 400 randomly
%   sampled real images from training/data/aptos2019/train_images (see
%   matlab/tests/diagnoseFocusThresholds.m), AT the same MaxWorkingDim=640
%   working resolution assessFundusQuality.m now downscales to before
%   scoring (variance-of-Laplacian is scale-dependent, so this had to be
%   redone after adding that downscale step — see its own history for why
%   the downscale exists at all: native images run 1000-3400px wide in this
%   dataset and processing them uncropped measured ~2s/image, incompatible
%   with a 100,000+ patients/year throughput target). Percentiles observed
%   at 640px working resolution (n=400):
%     focus:          p1=4.20  p5=6.62  p10=10.53 p25=21.84 p50=37.71  p75=51.27  p90=61.04  p95=68.03  p99=87.47
%     meanIntensity:  p1=33.6  p5=47.2  p10=53.2  p25=68.5  p50=91.4   p75=102.3  p90=109.1  p95=114.1  p99=125.0
%     uniformityCV:   p1=0.050 p5=0.071 p10=0.080 p25=0.101 p50=0.133  p75=0.201  p90=0.287  p95=0.327  p99=0.432
%     fovFraction:    p1=0.475 p5=0.476 p10=0.477 p25=0.746 p50=0.792  p75=0.834  p90=0.908  p95=0.989  p99=1.000
%   (illumination/FOV percentiles are essentially unchanged by the working-
%   resolution change, as expected — global brightness and circle proportion
%   aren't scale-dependent; only focus needed redoing.)
%
%   This is still only one dataset (APTOS) and an unlabeled one (no ground-
%   truth "ungradeable" flags to validate against — APTOS images all carry a
%   diagnosis label, so the working assumption is that all of them were
%   judged human-gradable, which anchors REJECT thresholds low: rejection is
%   for images clearly worse than anything in this sample, not merely
%   below-median). Re-run diagnoseFocusThresholds.m against IDRiD/DRIVE/
%   Messidor-2 as they're integrated, and against known-bad field captures if
%   you get any, to sharpen this further — particularly uniformityCV, which
%   has no labeled "bad" examples backing it yet, only a moderate tightening
%   from the original guess toward where the curated-data tail sits.
%
%   Also note: assessFundusQuality.m's post-enhancement re-check only holds
%   *illumination*-triggered borderline verdicts to these thresholds a second
%   time. A focus-only borderline verdict is accepted after enhancement
%   without re-testing FocusBorderlineThreshold, because enhanceFundusImage
%   has no sharpening step — it cannot raise a focus score — so re-checking
%   it would just re-reject images enhancement was never able to help, and
%   they already cleared FocusRejectThreshold (the human-gradable floor) to
%   get here. FOV-triggered borderline verdicts are never accepted after
%   enhancement, for the same reason in the other direction: pixel-level
%   processing can't fix a geometry/coverage problem.

% ---- Working resolution ----
opts.MaxWorkingDim = 640; % downscale to this max dimension before any scoring/enhancement (matches training/dataset.py's max_working_dim). All thresholds below are calibrated at this working resolution — changing it invalidates them; re-run diagnoseFocusThresholds.m.

% ---- Minimum SOURCE resolution ----
% Added after a real, reproduced misgrading: a 480x432px web image (a
% published-paper figure, resaved/recompressed through publication +
% ResearchGate + a browser save) passed quality (focus/illumination/FOV all
% fine at that size) but graded Severe at 74.5% confidence against a true
% Mild -- Grad-CAM showed the model's attention concentrated on JPEG-
% recompression blotching and the normal foveal pigment spot, amplified by
% Ben Graham's 4x local-contrast gain (training/dataset.py's
% ben_graham_preprocess) into lesion-like blobs.
%
% Root cause, confirmed by sweep (not guessed): both
% ben_graham_preprocess (max_working_dim=640) and this module's own
% MaxWorkingDim above only ever DOWNSCALE, never upscale. So every native
% image >= 640px converges to the same ~640px effective working
% resolution before any scoring/contrast step runs -- which is exactly why
% a real reference image (IDRiD_001, true grade Severe) graded correctly
% and consistently (Severe, 65-75% confidence) across every native size
% tested from 4288px down to 640px. Only BELOW 640px does the image stop
% being clamped to that calibrated working resolution and start being
% limited by its own (now smaller) native size instead -- and that's
% exactly where the same sweep started degrading: still correct but
% wobbling at 320px (Severe dropped to 57.3%, Proliferative DR rose to
% 17.3%), and a clean wrong-class flip at 200px (predicted Proliferative
% DR at 40.6% against a true Severe). The disputed 480x432 image sits
% below this 640px floor -- not a coincidence.
%
% This does NOT claim every sub-640px image will misgrade (the 480px step
% of the IDRiD_001 sweep alone stayed correct, at 71.2% Severe) -- source
% resolution is a real, cheap, measurable RISK FACTOR, exactly the same
% category of signal as focus/illumination/FOV above, not a guarantee.
% Treated the same way: reject with recapture guidance rather than
% silently grade on something outside what the pipeline was calibrated
% for.
opts.MinNativeResolutionPx = 640; % native max(height, width), in pixels, BEFORE any downscaling -- matches MaxWorkingDim exactly (see rationale above, this is not a coincidence)

% Known, disclosed consequence, checked against real data: DRIVE's own
% images are natively 584x565 -- BELOW this floor. DRIVE is only ever used
% for vessel-segmentation ground-truth validation
% (tests/validateAgainstDRIVE.m), calling segmentVessels directly, never
% routed through assessFundusQuality/analyzeForApp, so this doesn't affect
% anything currently in use. But if the live app were ever pointed at a
% genuinely low-resolution capture device (as opposed to a downloaded/
% resized image, this check's actual real-world trigger so far), it would
% get rejected too, even though it's a real, legitimate photograph, not a
% degraded copy of one. Accepted trade-off: current commercial portable
% fundus cameras (the SIH brief's deployment context) capture well above
% this floor -- typically 1500-4000px -- so this is not expected to reject
% genuine field captures in practice, only degraded/re-sourced images like
% the one that motivated this check.

% ---- Field of view ----
opts.FOVIntensityTol   = 7;     % grayscale threshold above which a pixel counts as "retina" (matches training/dataset.py crop_to_fundus tol)
opts.MinFOVFraction    = 0.35;  % below this: reject, "insufficient field of view". Sits below the real p1-p10 cluster (~0.475) so that cluster isn't rejected.
opts.BorderlineFOVFraction = 0.40; % below this (but above MinFOVFraction): borderline, "partial field of view". Deliberately NOT set to separate the real p1-p10 cluster (~0.475-0.477) from the main ~0.75-1.0 cluster: that low cluster is ~10% of the whole dataset, a real sub-population (plausibly a different camera/crop convention across clinics) rather than a rare defect, and a ~69%-of-frame-diameter fundus circle is still a legible capture -- flagging all of it borderline would be wrong given FOV-triggered borderline verdicts can never be resolved by enhancement (see assessFundusQuality.m) and so would sit in "needs recapture" permanently. This threshold instead only catches the rarer tail between MinFOVFraction and the low cluster.
opts.MaxCenterOffsetFraction = 0.20; % fundus centroid offset from frame center, as a fraction of frame diagonal, above which: borderline "off_center"
opts.MinEllipseFillRatio = 0.92; % actual mask area vs. the ellipse inscribed in its own bounding box, below which (AND touching the frame edge): borderline "possible_fov_clipping". An intact circle/crop fills ~1.0; a real clip falls meaningfully short. See computeFOVMask.m.

% ---- Focus / sharpness (variance of Laplacian within the FOV mask) ----
% Reject only below the observed p1 floor (worse than any image in the
% sample, all of which carry a human-assigned diagnosis label); borderline
% covers roughly the softest quarter of real captures and gets routed
% through enhancement.
opts.FocusRejectThreshold     = 4;    % below this: reject, "too_blurry" (real p1=4.20 at 640px working resolution)
opts.FocusBorderlineThreshold = 22;   % below this (but above reject): borderline, "soft_focus" -> routed through enhancement (real p25=21.84 at 640px working resolution; roughly the softest quarter of real captures)

% ---- Illumination / exposure ----
opts.DarkMeanThreshold        = 40;   % mean intensity (0-255) within FOV below this: reject, "too_dark". Real p1=33.7 -- rejects only the extreme dark tail.
opts.BrightMeanThreshold      = 220;  % mean intensity above this: reject, "too_bright" / "overexposed". Real p99=124.9 -- essentially never trips on curated data; exists for real overexposed field captures this dataset doesn't contain.
opts.DarkBorderlineThreshold  = 60;   % mean intensity below this (but above reject floor): borderline "underexposed". Real p10=53.1, p25=68.6.
opts.BrightBorderlineThreshold = 200; % mean intensity above this (but below reject ceiling): borderline "overexposed". Same rationale as BrightMeanThreshold.
opts.IlluminationGridSize     = 4;    % NxN grid over the FOV bounding box for uniformity scoring
opts.MinCellCoverage          = 0.5;  % a grid cell only counts if >= this fraction of it is inside the FOV mask
opts.UniformityCVRejectThreshold      = 0.40; % coefficient of variation across grid cell means, above which: reject "very_uneven_illumination". Real p99=0.431 -- catches only the most extreme ~1%.
opts.UniformityCVBorderlineThreshold  = 0.25; % above this (but below reject): borderline "uneven_illumination". Real p85-90 territory (p90=0.287) -- least-validated threshold here, no labeled bad examples yet.
opts.GlareCellBrightThreshold  = 245; % a grid cell with mean intensity above this and low internal std: flagged "glare"
opts.GlareCellStdThreshold     = 8;

% ---- Enhancement ----
opts.ClaheClipLimit       = 0.01;  % adapthisteq 'ClipLimit' (applied to L channel in Lab space)
opts.ClaheNumTiles        = [8 8]; % adapthisteq 'NumTiles'
opts.IlluminationBlurSigmaFrac = 10; % background-illumination Gaussian sigma = image height / this (matches Ben Graham preprocessing in training/dataset.py)
opts.DenoiseDegreeOfSmoothing = 10; % imbilatfil 'DegreeOfSmoothing'; [] to auto-estimate

% ---- Re-evaluation after enhancement ----
opts.ReEvaluateAfterEnhancement = true; % re-score focus/illumination (not FOV) on the enhanced image; upgrade verdict to "pass_after_enhancement" if it now clears

end
