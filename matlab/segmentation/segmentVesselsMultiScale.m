function [vesselMask, vesselInfo] = segmentVesselsMultiScale(img, opts)
%SEGMENTVESSELSMULTISCALE Experimental multi-scale variant of segmentVessels.m.
%   Same pipeline (FOV -> green channel -> illumination normalization ->
%   fibermetric -> threshold), except fibermetric runs SEPARATELY over
%   several narrow thickness bands instead of once over one wide range,
%   and the responses are fused by taking the pixelwise MAXIMUM.
%
%   Why: diagnoseVesselMAPLESGap.m found the single-wide-range approach
%   (VesselThicknessRange=[1 8]) catches thin vessels (<2px half-width,
%   76% of MAPLES-DR's annotated pixels) far less reliably than medium
%   ones (38.6% vs 91.0%/88.8% recall) -- lowering the GLOBAL percentile
%   threshold recovered some of that (tuneVesselThresholdForThinVessels.m)
%   but at a real, if small, cost to DRIVE's own Dice (0.673->0.672).
%   Hypothesis: a single fibermetric call over a WIDE range doesn't give
%   thin and thick structures equal representation in its response --
%   running each band separately and taking the max per pixel might
%   recover thin-vessel sensitivity WITHOUT needing to lower the global
%   threshold at all, avoiding the DRIVE trade-off entirely rather than
%   just balancing it. This is a genuine empirical question -- validated
%   in tests/validateVesselMultiScale.m against BOTH DRIVE and MAPLES-DR
%   before this replaces the production segmentVessels.m, not assumed to
%   work from the hypothesis alone.
%
%   NOT wired into analyzeForApp.m yet -- an experimental variant kept
%   separate from the validated production path until proven, matching
%   this project's own discipline (see the vessel threshold retune's own
%   "never tune against only the motivating dataset" note).

if nargin < 2 || isempty(opts)
    opts = defaultSegmentationConfig();
end

if ischar(img) || isstring(img)
    img = imread(char(img));
end

[h0, w0, ~] = size(img);
if max(h0, w0) > opts.MaxWorkingDim
    img = imresize(img, opts.MaxWorkingDim / max(h0, w0));
end

[mask, fovInfo] = computeFOVMask(img);

green = im2double(img(:, :, 2));

sigma = max(1, size(green, 1) / 10);
background = imgaussfilt(green, sigma);
normalized = green - background + 0.5;
normalized = min(max(normalized, 0), 1);

inverted = zeros(size(normalized));
inverted(mask) = 1 - normalized(mask);

% Narrow, slightly-overlapping bands spanning the same [1 8] range the
% single-scale version uses, so this is a fusion strategy change, not
% also a "search a different range" change -- isolates which variable is
% responsible for any difference found in validation.
bands = opts.VesselMultiScaleBands;
response = zeros(size(inverted));
for b = 1:size(bands, 1)
    bandResponse = fibermetric(inverted, bands(b, :), 'ObjectPolarity', 'bright');
    response = max(response, bandResponse);
end
response(~mask) = 0;

validVals = response(mask);
if isempty(validVals) || max(validVals) <= 0
    vesselMask = false(size(mask));
    vesselInfo = struct('vesselDensity', 0, 'skeleton', false(size(mask)), 'fov', fovInfo);
    return
end

switch opts.VesselThresholdMethod
    case 'otsu'
        level = graythresh(validVals / max(validVals)) * max(validVals);
    otherwise
        level = prctile(validVals, opts.VesselThresholdPercentile);
end

raw = response > level & mask;
vesselMask = bwareaopen(raw, opts.VesselMinObjectArea);

vesselInfo = struct();
vesselInfo.vesselDensity = nnz(vesselMask) / max(1, nnz(mask));
vesselInfo.skeleton = bwskel(vesselMask);
vesselInfo.fov = fovInfo;

end
