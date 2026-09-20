function opts = defaultSegmentationConfig()
%DEFAULTSEGMENTATIONCONFIG Central threshold config for retinal structure segmentation.
%   Same "single edit point" pattern as quality/defaultQualityConfig.m.
%
%   CALIBRATION STATUS: written against documented Image Processing/Computer
%   Vision Toolbox APIs. Vessel thickness range and OD diameter fraction
%   have been sanity-checked against synthetic test images with known
%   geometry (matlab/tests/tSegmentation.m) and visually against real APTOS
%   images (segmentation/demoSegmentation.m), but NOT yet validated
%   quantitatively against ground truth — that needs DRIVE (vessel sensitivity/
%   specificity/accuracy against expert manual segmentations, the standard
%   DRIVE benchmark) and IDRiD (optic disc center/radius and fovea center
%   ground truth). Treat every threshold here as informed but provisional.
%   See matlab/segmentation/README.md.

opts.MaxWorkingDim = 640; % consistent with quality/defaultQualityConfig.m -- and required: OD/fovea/vessel geometry below is all calibrated at this working resolution

% ---- Vessel segmentation ----
% VALIDATED against DRIVE's 20 expert-labeled training images (natively
% 565x584px, below MaxWorkingDim so no resize happens -- see
% matlab/tests/validateAgainstDRIVE.m and tuneVesselThreshold.m). The
% original 'otsu' default was measured too conservative: sensitivity 43.5%
% at specificity 98.3% (missing well over half of true vessel pixels).
% Swept threshold percentile 70-95 against the same DRIVE set; 88 maximized
% Dice (0.656) at a much more balanced sensitivity 64.8% / specificity 95.5%
% / accuracy 91.6% -- in the range published classical (non-deep-learning)
% DRIVE-benchmark methods report (typically ~0.70-0.75 sensitivity at
% ~0.95-0.98 specificity; this is a first-pass classical filter, not tuned
% per-scale/multi-filter the way top classical DRIVE submissions are, so
% sitting a bit under that band is expected).
opts.VesselThicknessRange = [1 8]; % pixel width range fibermetric looks for -- NOT yet independently tuned (only the threshold below was swept); a thickness-range sweep is a plausible next improvement
opts.VesselThresholdMethod = 'percentile'; % 'otsu' (too conservative, see above) or 'percentile'
opts.VesselThresholdPercentile = 86; % keep the top ~14% of in-FOV pixels by vesselness rank. Was 88 -- lowered after diagnoseVesselMAPLESGap.m found the real cause of a cross-dataset gap (MAPLES-DR sens 64.2%->51.8%): 76% of MAPLES-DR's annotated vessel pixels are the thinnest (1-2px half-width) category, caught by the old threshold only 38.6% of the time vs 91.0%/88.8% for medium-width vessels. tuneVesselThresholdForThinVessels.m swept this against BOTH DRIVE and MAPLES-DR together (never tune against only the dataset that motivated the change -- the OD-mislocalization fix regressed everything else the first time that discipline was skipped): at 86, DRIVE Dice barely moves (0.673->0.672) while MAPLES-DR Dice improves 0.594->0.645 and thin-vessel sensitivity rises 38.6%->48.3%. Lower values (84/82/80) give more MAPLES-DR gain but start costing DRIVE for real (Dice down to 0.653/0.625/0.592) -- 86 was chosen as the point where the DRIVE cost is still negligible, not the point of maximum MAPLES-DR gain.
opts.VesselMinObjectArea = 15; % bwareaopen cleanup, in pixels at working resolution

% Experimental (segmentVesselsMultiScale.m only, NOT the production
% segmentVessels.m): narrow, slightly-overlapping bands spanning the same
% [1 8] range VesselThicknessRange covers, fused by pixelwise max instead
% of one fibermetric call over the whole range -- see
% tests/validateVesselMultiScale.m for whether this actually helps before
% it replaces anything production uses.
opts.VesselMultiScaleBands = [1 3; 3 5; 5 8];

% ---- Optic disc localization ----
opts.ODDiameterFraction = 0.18; % OD diameter as a fraction of min(frame height, width) -- typical fundus OD subtends roughly this in a well-cropped image; provisional, needs tuning against IDRiD's OD radius ground truth
opts.ODBrightnessWeight = 0.5; % blend weight between vessel-density signal (0) and brightness signal (1) when localizing the OD

% Tortuous-vessel-cluster exclusion -- fixes a real, reproduced false
% positive (IDRiD_016.jpg: a dense tortuous vascular cluster elsewhere in
% the retina outscored the true OD). See localizeOpticDisc.m's docstring
% for the full diagnosis (four other hypotheses tested and ruled out
% first) and findTortuousVesselSegments.m for the shared detector this
% reuses (also used by detectNeovascularization.m, hence the opts.NV*
% fields below it depends on -- this is genuinely one signal serving two
% purposes, not a coincidence of naming).
opts.ODExcludeTortuousVesselClusters = true;
opts.ODTortuousClusterPenalty = 0.5; % subtracted from the normalized [0,1] combined score within a dilated tortuous-cluster mask -- a PENALTY, not a hard exclusion (-Inf), so a genuine OD would still win if it somehow overlapped a false-positive-prone tortuosity reading elsewhere in its own structure; large enough to flip the specific case that motivated this (0.896 -> 0.396, well below the true OD's 0.792)
opts.ODTortuousClusterDilateFrac = 0.75; % dilation radius for the penalty zone, as a fraction of the OD search window size. Swept 0.33-2.0 against the motivating case: 0.33 was NOT enough (the vessel-density map's own smoothing window already spreads an elevated-density "halo" well beyond the tortuous cluster's exact pixels, so the argmax just walked to the edge of a too-small penalty zone); 0.66-2.0 all correctly flipped to the true OD (7.2px error). 0.75 keeps a margin above the minimum that worked rather than sitting exactly on the boundary, without going as far as 2.0's larger, more aggressive suppression radius.
opts.ODTortuousClusterMinTortuosity = 2.1; % DELIBERATELY NOT the same as NVTortuosityThreshold (1.35) below -- that value is right for flagging NV *candidates* (cast a wide net for a human to review), but far too permissive as an OD-exclusion trigger: a first version reusing 1.35 directly was VALIDATED against the full IDRiD OD set and found to REGRESS success rate from the established 89.1% to 85.7% (fovea 85.2%->77.7%), by over-suppressing legitimate OD candidates near ordinary, non-pathological tortuous-looking vessel readings elsewhere in normal images. Swept 1.35-2.2 on a 120-image subsample (tests/tuneODTortuosityExclusion.m): 2.1 was the best performer (89.2%, at/above the exclusion-disabled baseline of 88.3% on that subsample) AND still correctly fixed the motivating case (7.2px error); 2.2 was too strict and stopped fixing it. This is intentionally a much higher bar than "looks like it could be NV" -- only the most extreme tortuosity should ever override a bright, vessel-dense OD candidate.

% ---- Fovea localization ----
opts.FoveaSearchRadiusODMultiples = [1.5, 3.5]; % annulus search range, in OD diameters, from the OD center -- standard clinical landmark range (fovea sits ~2-3 OD diameters temporal to the disc)
opts.FoveaMinBandSizeFraction = 0.4; % a side's search band must have at least this fraction of the other side's pixel count to be considered a valid candidate at all. Guards against an off-center OD pushing one side's band up against the FOV boundary, leaving it small and its z-score statistic unreliable/inflated by chance -- found via a debug case where a 899-pixel band beat a 5579-pixel band on a noisier z-score alone. See localizeFovea.m.

% Experimental (localizeFoveaVesselAware.m only, NOT the production
% localizeFovea.m): weight on local vessel density in the combined
% darkness+vessel-avoidance candidate score. Provisional value before
% tuning -- see tests/validateFoveaVesselAware.m for whether this signal
% helps at all before it's worth tuning further.
opts.FoveaVesselAvoidanceWeight = 0.5;

% ---- Lesion detection (microaneurysms, hemorrhages, hard exudates) ----
% Deliberately a MUCH higher working resolution than MaxWorkingDim=640 used
% above. Measured real IDRiD lesion sizes at native resolution
% (4288x2848, see tests/checkLesionSizes.m, n=10 images):
%   microaneurysms:  equiv. diameter min=4.7px p10=11.5px median=18.3px
%   haemorrhages:    equiv. diameter min=11.3px            median=37.5px
%   hard exudates:   equiv. diameter min=4.8px              median=19.3px
% At MaxWorkingDim=640 (scale ~0.149 for a 4288-wide image), the median MA
% would shrink to ~2.7px and the smallest to <1px -- destroyed by any
% reasonable smoothing/morphology. LesionMaxWorkingDim=1600 (scale ~0.373)
% keeps the median MA at ~6.8px and the p10 case at ~4.3px, workable for the
% morphological methods below, at the cost of the smallest real MAs (bottom
% decile) likely still being missed -- a disclosed limitation, not a bug.
opts.LesionMaxWorkingDim = 1600;

% OD/vessel exclusion: computed at the already-validated MaxWorkingDim=640
% (segmentVessels/localizeOpticDisc were calibrated at that resolution — see
% "Vessel segmentation"/"Optic disc localization" above — recomputing them
% at LesionMaxWorkingDim would need its own recalibration cycle), then
% scaled up to LesionMaxWorkingDim purely as an exclusion mask. Dilated
% because lesion false positives cluster right at vessel/OD edges.
opts.LesionODExclusionMarginPx = 15; % dilation radius, in LesionMaxWorkingDim pixels, around the OD
opts.LesionVesselExclusionMarginPx = 6; % dilation radius, in LesionMaxWorkingDim pixels, around vessels

% Hard exudates: white top-hat (bright blobs against local background).
% VALIDATED against IDRiD (n=15): swept radius x threshold percentile
% (tests/tuneExudateRadius.m); best found was radius=12, percentile=97,
% Dice=0.131 (sens=0.209, prec=0.156). Also tried illumination
% normalization before the top-hat (no change) and an added yellowness
% (Lab b*) criterion (tests/tuneExudateColor.m: precision 15.6%->21.1%, but
% sensitivity dropped correspondingly, Dice flat at ~0.13). This is a real,
% disclosed ceiling for simple top-hat classical exudate detection on this
% dataset, not an undertuned threshold -- see segmentation/README.md.
% Stronger classical results in the literature use multi-stage candidate
% generation + a trained classifier on per-region features, a substantially
% larger undertaking than a single top-hat threshold.
opts.ExudateTophatRadius = 12; % structuring element radius, in LesionMaxWorkingDim pixels
opts.ExudateThresholdPercentile = 90; % keep the top (100-X)% of in-FOV top-hat response by rank. Was 97 --
    % lowered after applying the SAME two-dataset-sweep method that fixed vessels
    % (tests/tuneExudateThresholdTwoDatasets.m), swept against IDRiD (n<=54) AND
    % MAPLES-DR (n<=162) together. Unlike vessels, this is a genuine trade-off, not
    % a near-free lunch: raising the percentile improves pixel Dice but REDUCES
    % lesion-level hit rate on BOTH datasets (97: IDRiD Dice=0.106/hit=51.9%,
    % MAPLES Dice=0.035/hit=64.5%; 90: IDRiD Dice=0.062/hit=63.7%, MAPLES
    % Dice=0.024/hit=80.7%). Chosen for hit rate, not Dice, matching this
    % project's established priority (segmentation/README.md: lesion-level
    % candidate-generation recall is the metric that matters for a
    % human-in-the-loop review workflow, not pixel-level segmentation
    % accuracy, which was already weak at every percentile tested) -- real
    % Dice cost disclosed, not hidden.
opts.ExudateMinAreaPx = 8; % bwareaopen cleanup, in LesionMaxWorkingDim pixels

% Soft exudates (cotton wool spots): same white-top-hat family as hard
% exudates, but clinically these are larger, paler, more diffuse
% nerve-fibre-layer infarcts with ill-defined borders rather than small
% sharp lipid deposits -- a larger structuring element (catches the
% bigger, blurrier blob shape instead of fine texture) and a larger
% minimum area (rejects small sharp things more likely to be mis-flagged
% hard exudates). Radius/percentile swept (tuneSoftExudateParams.m) over
% {20,30,40} x {94,96,98} against IDRiD's Soft Exudate ground truth (26 of
% 54 training images have one) AND MAPLES-DR's CottonWoolSpots category
% (162 matched images) together -- 20/94 won clearly on lesion-level hit
% rate on BOTH (86.2% IDRiD, 34.5% MAPLES-DR), not just one. Read the
% MAPLES-DR number honestly: this detector's candidate-generation is
% usable on IDRiD but doesn't yet generalize nearly as well to MAPLES-DR
% (34.5% vs 86.2%) -- a real, disclosed limitation, not smoothed over.
% Pixel-level Dice is weak across the whole grid (0.066-0.084 IDRiD,
% 0.004-0.006 MAPLES-DR) -- consistent with every other lesion detector in
% this module (see "Lesion detection results" below), not a bug specific
% to this one.
opts.SoftExudateTophatRadius = 20;
opts.SoftExudateThresholdPercentile = 94;
opts.SoftExudateMinAreaPx = 20; % Was 40 -- tests/tuneSoftExudateMinArea.m swept {20,40,60,80,120} against
    % both datasets: a rare NEAR-FREE-LUNCH result, unlike the other threshold retunes
    % in this file. Dice stays essentially FLAT across the whole range (0.066-0.068
    % IDRiD, 0.004 MAPLES-DR, no real trend) while lesion-level hit rate rises
    % monotonically as MinAreaPx drops (IDRiD 51.9%->83.8%, MAPLES-DR 17.8%->29.2%
    % from 120 down to 20) -- smaller minimum area gives real hit-rate gain at
    % essentially no pixel-accuracy cost, so the lowest value tested was kept.

% Hemorrhages: black top-hat (dark blobs against local background), plus
% shape filtering since imperfect vessel exclusion can leave elongated
% fragments that aren't real hemorrhages.
opts.HemorrhageTophatRadius = 20;
opts.HemorrhageThresholdPercentile = 92; % Was 97 -- tests/tuneMAHemorrhageThresholdTwoDatasets.m applied the same
    % two-dataset-sweep method that fixed vessels/exudates. Same trade-off shape as
    % exudates: raising the percentile improves Dice but reduces lesion-level hit rate
    % on BOTH datasets (97: IDRiD hit=32.8%/MAPLES hit=30.9%; 92: IDRiD hit=42.6%/MAPLES
    % hit=39.3%). Chosen for hit rate over Dice, same rationale as exudates -- Dice cost
    % is real but small in absolute terms (IDRiD Dice 0.059->0.056, MAPLES-DR
    % 0.021->0.016), disclosed not hidden.
opts.HemorrhageMinAreaPx = 15;
opts.HemorrhageMaxEccentricity = 0.92; % reject elongated (vessel-fragment-like) candidates; a circle has eccentricity 0

% Hemorrhage TYPE classification (dot/blot vs flame-shaped) -- applied to
% candidates that already passed HemorrhageMaxEccentricity above, i.e.
% these thresholds only ever separate "round-ish" from "moderately
% elongated", never re-admit a vessel fragment. Standard classical
% distinction: dot/blot hemorrhages are compact deep-retinal-layer lesions;
% flame-shaped hemorrhages are elongated superficial nerve-fibre-layer
% lesions that run along nerve fibre bundles radiating from the optic disc.
% Preretinal/subhyaloid/vitreous hemorrhage (a third clinical category, with
% a characteristic horizontal fluid level) is explicitly OUT OF SCOPE for
% this shape-based classical method -- it is typically assessed clinically
% or via OCT, not inferred from 2D colour fundus blob shape; see
% detectHemorrhages.m and matlab/segmentation/README.md.
opts.HemorrhageFlameEccentricityMin = 0.55; % candidates at/above this eccentricity are flame-shaped BY SHAPE ALONE; below it, dot/blot
opts.HemorrhageFlameRadialToleranceDeg = 35; % secondary confirmatory signal: a shape-flagged flame candidate is only classified 'flame' if its major-axis orientation is within this many degrees of the OD-to-centroid radial direction (mod 180 -- regionprops orientation is axis-unsigned); otherwise reclassified 'dot_blot'. Skipped (shape alone decides) when OD localization failed for this image.

% Microaneurysms: rotating-linear-structuring-element morphological
% reconstruction (Zana & Klein / Walter et al. style) -- distinguishes tiny
% round MA blobs from elongated vessels directly, rather than relying only
% on the (coarser, lower-resolution) vessel exclusion mask, since MAs often
% sit immediately adjacent to vessels.
opts.MAStructuringElementLength = 9; % linear SE length, in LesionMaxWorkingDim pixels -- longer than the widest vessel cross-section, so a round MA-sized blob can't survive opening at any orientation
opts.MANumOrientations = 12; % number of linear SE angles swept (0:15:165)
opts.MAThresholdPercentile = 92; % Was 98 -- tests/tuneMAHemorrhageThresholdTwoDatasets.m applied the same
    % two-dataset-sweep method that fixed vessels/exudates. Same trade-off shape:
    % raising the percentile improves Dice but reduces lesion-level hit rate on BOTH
    % datasets, and the effect is LARGE here (98: IDRiD hit=81.9%/MAPLES hit=87.5%; 92:
    % IDRiD hit=98.0%/MAPLES hit=96.9%). Chosen for hit rate -- this project's own
    % documentation already argues MA recall matters most of all three lesion types
    % (earliest detectable DR sign), so this retune takes that stated priority at its
    % word for the deployed default, not just the write-up. Dice cost: IDRiD
    % 0.076->0.024, MAPLES-DR 0.054->0.024 -- real, disclosed, already weak either way.
opts.MAMinAreaPx = 3;
opts.MAMaxAreaPx = 120; % upper bound -- larger round blobs are more likely small hemorrhages than MAs

% ---- Neovascularization (NV) detection ----
% Classical proxy, NOT a validated NV detector -- see
% detectNeovascularization.m's calibration caveat and
% matlab/segmentation/README.md for why (no pixel-level NV ground truth
% exists in DRIVE or IDRiD). Flags vessel-skeleton segments that are both
% locally dense (packed capillary tufts) and abnormally tortuous (curly),
% split into NVD ("at the disc") / NVE ("elsewhere") by distance from the
% optic disc margin.
opts.NVDensityWindowFraction = 0.12; % local density window size, as a fraction of min(frame h, w) at MaxWorkingDim -- smaller than OD localization's window (ODDiameterFraction=0.18), since NV tufts are compact, not disc-sized
opts.NVDensityPercentile = 92; % candidate segments need local vessel density in at least this percentile within the FOV
opts.NVTortuosityThreshold = 1.35; % geodesic arc-chord ratio; a straight line = 1.0, normal retinal vessels typically run ~1.05-1.25 by this measure, disorganized NV networks noticeably higher
opts.NVMinSegmentPx = 10; % severed skeleton segments shorter than this (pixels) are too short for a stable tortuosity estimate, dropped
opts.NVDRadiusODMultiple = 1.0; % NVD = within this many OD diameters of the OD MARGIN (standard clinical "at the disc" definition); NVE = everything else in the FOV

end
