function [maMask, maInfo] = detectMicroaneurysms(img, opts)
%DETECTMICROANEURYSMS Rotating-linear-SE morphological reconstruction for MA candidates.
%   [MAMASK, MAINFO] = DETECTMICROANEURYSMS(IMG) returns a logical mask (at
%   opts.LesionMaxWorkingDim resolution) of candidate microaneurysm pixels.
%
%   Method (Zana & Klein / Walter et al. style): open the inverted green
%   channel with a LINEAR structuring element at many orientations. A round
%   MA-sized blob is destroyed by a linear opening at every orientation
%   (nothing that small and round can "fit" a line through it), while an
%   elongated vessel segment survives opening at whichever orientation
%   roughly aligns with its local direction. Taking the pixelwise maximum
%   across all orientations reconstructs a "vessels preserved, small round
%   blobs removed" background estimate; subtracting it from the original
%   isolates exactly the round blobs that don't belong to any vessel — MA
%   candidates — without relying solely on the (coarser-resolution) vessel
%   exclusion mask, which matters since MAs often sit immediately adjacent
%   to a vessel.

if nargin < 2 || isempty(opts)
    opts = defaultSegmentationConfig();
end

if ischar(img) || isstring(img)
    img = imread(char(img));
end

[fovMask, ~, lesionImg, odOnlyMask] = computeLesionExclusionMask(img, opts);

green = im2double(lesionImg(:, :, 2));
sigma = max(1, size(green, 1) / 10);
background = imgaussfilt(green, sigma);
normalized = min(max(green - background + 0.5, 0), 1);
inverted = zeros(size(normalized));
inverted(fovMask) = 1 - normalized(fovMask);

len = opts.MAStructuringElementLength;
angles = 0:(180 / opts.MANumOrientations):(180 - 180 / opts.MANumOrientations);
vesselPreserved = zeros(size(inverted));
for a = angles
    se = strel('line', len, a);
    opened = imopen(inverted, se);
    vesselPreserved = max(vesselPreserved, opened);
end

candidateResponse = inverted - vesselPreserved;
candidateResponse(~fovMask) = 0;
candidateResponse(candidateResponse < 0) = 0;

% Only OD is excluded from candidates -- not the coarser dilated-vessel
% mask computeLesionExclusionMask also builds, since the rotating-SE
% reconstruction above already suppresses vessels directly and more
% precisely (see function docstring); re-applying that dilated mask here
% would erase real MAs sitting close to a vessel.
candidateMask = fovMask & ~odOnlyMask;

vals = candidateResponse(candidateMask);
maInfo = struct('count', 0, 'totalAreaPx', 0, 'regions', []);
if isempty(vals) || max(vals) <= 0
    maMask = false(size(fovMask));
    return
end

level = prctile(vals, opts.MAThresholdPercentile);
raw = candidateResponse > level & candidateMask;
sizeFiltered = bwareaopen(raw, opts.MAMinAreaPx);

cc = bwconncomp(sizeFiltered);
props = regionprops(cc, 'Area', 'Centroid', 'EquivDiameter');
keep = [props.Area] <= opts.MAMaxAreaPx;

maMask = false(size(sizeFiltered));
if any(keep)
    idx = find(keep);
    for i = 1:numel(idx)
        maMask(cc.PixelIdxList{idx(i)}) = true;
    end
end

keptProps = props(keep);
maInfo.count = nnz(keep);
maInfo.totalAreaPx = sum([keptProps.Area]);
maInfo.regions = keptProps;

end
