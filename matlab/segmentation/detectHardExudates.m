function [exudateMask, exInfo, debug] = detectHardExudates(img, opts)
%DETECTHARDEXUDATES White top-hat detection of bright lipid-deposit lesions.
%   [EXUDATEMASK, EXINFO] = DETECTHARDEXUDATES(IMG) returns a logical mask
%   (at opts.LesionMaxWorkingDim resolution) of candidate hard exudate
%   pixels, plus a struct with per-lesion region properties.
%
%   Method: white top-hat (image minus its morphological opening) on the
%   green channel isolates bright blobs against their local background —
%   robust to the retina's large-scale illumination variation in a way a
%   single global brightness threshold isn't, since it responds to local
%   contrast rather than absolute intensity. The optic disc (also bright)
%   and vessels are excluded via computeLesionExclusionMask before
%   thresholding, since they're the dominant false-positive source.

if nargin < 2 || isempty(opts)
    opts = defaultSegmentationConfig();
end

if ischar(img) || isstring(img)
    img = imread(char(img));
end

[fovMask, exclusionMask, lesionImg] = computeLesionExclusionMask(img, opts);
candidateMask = fovMask & ~exclusionMask;

green = im2double(lesionImg(:, :, 2));

% Illumination normalization before the top-hat: without it, the raw green
% channel's large-scale brightness gradient and fine retinal texture noise
% dominate the top-hat response and swamp the real lesion signal (found
% empirically -- an un-normalized version measured sensitivity/precision
% both under 15% against IDRiD; see segmentation/README.md).
sigma = max(1, size(green, 1) / 10);
background = imgaussfilt(green, sigma);
normalized = min(max(green - background + 0.5, 0), 1);

tophat = imtophat(normalized, strel('disk', opts.ExudateTophatRadius));
tophat(~fovMask) = 0;

debug = struct('response', tophat, 'candidateMask', candidateMask); % optional 3rd output, for threshold experiments
vals = tophat(candidateMask);
exInfo = struct('count', 0, 'totalAreaPx', 0, 'regions', []);
if isempty(vals) || max(vals) <= 0
    exudateMask = false(size(fovMask));
    return
end

if isfield(opts, 'ExudateAbsoluteLevel') && ~isempty(opts.ExudateAbsoluteLevel)
    level = opts.ExudateAbsoluteLevel; % absolute response cutoff (see defaultSegmentationConfig.m)
else
    level = prctile(vals, opts.ExudateThresholdPercentile);
end
raw = tophat > level & candidateMask;
exudateMask = bwareaopen(raw, opts.ExudateMinAreaPx);

cc = bwconncomp(exudateMask);
props = regionprops(cc, 'Area', 'Centroid', 'EquivDiameter');
exInfo.count = cc.NumObjects;
exInfo.totalAreaPx = sum([props.Area]);
exInfo.regions = props;

end
