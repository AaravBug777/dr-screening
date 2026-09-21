function [softExudateMask, seInfo, debug] = detectSoftExudates(img, opts, hardExudateMask)
%DETECTSOFTEXUDATES White top-hat detection of cotton-wool-spot lesions.
%   [SOFTEXUDATEMASK, SEINFO] = DETECTSOFTEXUDATES(IMG) returns a logical
%   mask (at opts.LesionMaxWorkingDim resolution) of candidate soft
%   exudate (cotton wool spot) pixels, plus a struct with per-lesion
%   region properties.
%
%   Method: same white-top-hat-on-illumination-normalized-green-channel
%   family as detectHardExudates.m, but tuned for a clinically different
%   lesion: cotton wool spots are nerve-fibre-layer infarcts -- larger,
%   paler, and more diffuse (ill-defined, feathery borders) than hard
%   exudates' small, sharp, bright lipid deposits. A larger structuring
%   element radius responds to the bigger blob shape rather than fine
%   texture; a much larger minimum area rejects small sharp candidates
%   that are far more likely to be hard exudates.
%
%   SOFTEXUDATEMASK = DETECTSOFTEXUDATES(IMG, OPTS, HARDEXUDATEMASK) --
%   HARDEXUDATEMASK (optional, same resolution, from detectHardExudates.m
%   on the same image) is subtracted from the candidate mask before
%   thresholding-driven region growth, so a single bright blob can't be
%   flagged as both a hard AND soft exudate -- the two categories share
%   the same underlying "bright blob" signal family and would otherwise
%   double-count real hard exudates as soft ones too.

if nargin < 2 || isempty(opts)
    opts = defaultSegmentationConfig();
end
if nargin < 3
    hardExudateMask = [];
end

if ischar(img) || isstring(img)
    img = imread(char(img));
end

[fovMask, exclusionMask, lesionImg] = computeLesionExclusionMask(img, opts);
candidateMask = fovMask & ~exclusionMask;

green = im2double(lesionImg(:, :, 2));

sigma = max(1, size(green, 1) / 10);
background = imgaussfilt(green, sigma);
normalized = min(max(green - background + 0.5, 0), 1);

tophat = imtophat(normalized, strel('disk', opts.SoftExudateTophatRadius));
tophat(~fovMask) = 0;

if ~isempty(hardExudateMask)
    candidateMask = candidateMask & ~hardExudateMask;
end

debug = struct('response', tophat, 'candidateMask', candidateMask); % optional 3rd output, for threshold experiments
vals = tophat(candidateMask);
seInfo = struct('count', 0, 'totalAreaPx', 0, 'regions', []);
if isempty(vals) || max(vals) <= 0
    softExudateMask = false(size(fovMask));
    return
end

if isfield(opts, 'SoftExudateAbsoluteLevel') && ~isempty(opts.SoftExudateAbsoluteLevel)
    level = opts.SoftExudateAbsoluteLevel; % absolute response cutoff (see defaultSegmentationConfig.m)
else
    level = prctile(vals, opts.SoftExudateThresholdPercentile);
end
raw = tophat > level & candidateMask;
softExudateMask = bwareaopen(raw, opts.SoftExudateMinAreaPx);

cc = bwconncomp(softExudateMask);
props = regionprops(cc, 'Area', 'Centroid', 'EquivDiameter');
seInfo.count = cc.NumObjects;
seInfo.totalAreaPx = sum([props.Area]);
seInfo.regions = props;

end
