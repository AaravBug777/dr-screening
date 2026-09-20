function result = analyzeForApp(imagePath)
%ANALYZEFORAPP One-call orchestrator for the Netra web app's backend.
%   RESULT = ANALYZEFORAPP(IMAGEPATH) runs the Stage-1 quality gate, then
%   (if it doesn't reject) vessel/optic-disc/fovea segmentation and
%   microaneurysm/hard-exudate/haemorrhage candidate detection, all in one
%   call -- called from Python via the MATLAB Engine API
%   (backend/matlab_bridge.py), one call per uploaded image, so everything
%   needed is bundled into a single round trip rather than several.
%
%   Returns a struct (marshals to a Python dict via the engine):
%     .quality.verdict / .reasons / .feedback / .enhancedImageUsed
%     .quality.enhancedImage -- uint8 RGB array (quality-module MaxWorkingDim
%       resolution) when enhancedImageUsed is true; empty otherwise. The
%       CLAHE + illumination-normalization + denoising result
%       (enhanceFundusImage.m) -- previously computed and USED (silently, for
%       segmentation/grading) but never actually returned for display. Now
%       surfaced so the app can show it, not just report that it happened.
%     .segmentation.available (false if quality rejected -- nothing below exists then)
%     .segmentation.workingSize [h w]      -- resolution vesselMask/odCenter/foveaCenter are in
%     .segmentation.vesselMask             -- logical, workingSize
%     .segmentation.odCenter [x y], .odRadius, .odConfidence
%     .segmentation.foveaFound, .foveaCenter [x y]
%     .segmentation.lesionWorkingSize [h w] -- different (higher) resolution than workingSize -- see segmentation/README.md
%     .segmentation.maMask / .exudateMask / .hemorrhageMask -- logical, lesionWorkingSize
%     .segmentation.maCount / .exudateCount / .hemorrhageCount
%     .segmentation.hemorrhageDotBlotCount / .hemorrhageFlameCount -- shape-based split of hemorrhageCount, see detectHemorrhages.m
%     .segmentation.nvMask -- logical, workingSize (NOT lesionWorkingSize -- see detectNeovascularization.m)
%     .segmentation.nvCount / .nvdCount / .nveCount -- UNVALIDATED at the lesion level, see detectNeovascularization.m's calibration caveat
%
%   Known inefficiency, not yet optimized: segmentVessels/localizeOpticDisc
%   run once here explicitly, then AGAIN internally inside each of the three
%   lesion detectors (via computeLesionExclusionMask) -- four total vessel
%   computations per call. This matches the ~2.44s/image pipeline budget
%   already used in simulink/throughputParams.m, so it's a known, accounted-
%   for cost, not a surprise -- deduplicating it is a legitimate future
%   optimization, not done here to keep this integration's first version
%   simple and directly traceable to the already-validated individual
%   functions.

opts = defaultQualityConfig();
segOpts = defaultSegmentationConfig();

qReport = assessFundusQuality(imagePath, opts);

result = struct();
result.quality = struct( ...
    'verdict', qReport.verdict, ...
    'reasons', {qReport.reasons}, ...
    'feedback', qReport.feedback, ...
    'enhancedImageUsed', false, ...
    'enhancedImage', uint8.empty(0, 0, 3));

if strcmp(qReport.verdict, 'reject')
    result.segmentation = struct('available', false);
    return
end

% Use the enhanced image for segmentation if quality upgraded it, else the
% original -- matches the Stage-1 contract in matlab/README.md.
if ~isempty(qReport.enhancedImage)
    imgForSeg = qReport.enhancedImage;
    result.quality.enhancedImageUsed = true;
    result.quality.enhancedImage = qReport.enhancedImage;
else
    imgForSeg = imread(imagePath);
end

[vesselMask, ~] = segmentVessels(imgForSeg, segOpts);
odInfo = localizeOpticDisc(imgForSeg, vesselMask, segOpts);
foveaInfo = localizeFovea(imgForSeg, odInfo, segOpts);
[nvMask, nvInfo] = detectNeovascularization(imgForSeg, vesselMask, odInfo, segOpts);

[maMask, maInfo] = detectMicroaneurysms(imgForSeg, segOpts);
[exMask, exInfo] = detectHardExudates(imgForSeg, segOpts);
[seMask, seInfo] = detectSoftExudates(imgForSeg, segOpts, exMask);
[heMask, heInfo] = detectHemorrhages(imgForSeg, segOpts);

seg = struct();
seg.available = true;
seg.workingSize = size(vesselMask);
seg.vesselMask = vesselMask;
seg.odCenter = odInfo.center;
seg.odRadius = odInfo.radius;
seg.odConfidence = odInfo.confidence;
seg.foveaFound = foveaInfo.found;
if foveaInfo.found
    seg.foveaCenter = foveaInfo.center;
else
    seg.foveaCenter = [NaN NaN];
end

seg.lesionWorkingSize = size(maMask);
seg.maMask = maMask;
seg.exudateMask = exMask;
seg.softExudateMask = seMask;
seg.hemorrhageMask = heMask;
seg.maCount = maInfo.count;
seg.exudateCount = exInfo.count;
seg.softExudateCount = seInfo.count;
seg.hemorrhageCount = heInfo.count;
seg.hemorrhageDotBlotCount = heInfo.dotBlotCount;
seg.hemorrhageFlameCount = heInfo.flameCount;

% NV mask is at `workingSize` resolution (same as vesselMask), NOT
% lesionWorkingSize -- see detectNeovascularization.m for why. Flagged as
% unvalidated-at-the-lesion-level in every layer this reaches (this struct,
% structures_overlay.py, ResultExplanation's stat strip) -- see that
% function's calibration caveat.
seg.nvMask = nvMask;
seg.nvCount = nvInfo.count;
seg.nvdCount = nvInfo.nvdCount;
seg.nveCount = nvInfo.nveCount;

result.segmentation = seg;

end
