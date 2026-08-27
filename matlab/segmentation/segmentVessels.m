function [vesselMask, vesselInfo] = segmentVessels(img, opts)
%SEGMENTVESSELS Classical retinal vessel segmentation via multiscale vesselness filtering.
%   [VESSELMASK, VESSELINFO] = SEGMENTVESSELS(IMG) returns a logical mask of
%   likely vessel pixels (same size as IMG's first two dimensions) and a
%   struct of diagnostics.
%
%   Method: restrict to the field of view (reuses computeFOVMask from the
%   quality module), extract the green channel (standard choice across the
%   vessel-segmentation literature — best vessel/background contrast of the
%   three RGB channels in fundus photography), normalize illumination, then
%   run Image Processing Toolbox's fibermetric — a multiscale Frangi-style
%   vesselness/ridge filter built specifically for enhancing elongated
%   tubular structures — and threshold the response.
%
%   VESSELMASK = SEGMENTVESSELS(IMG, OPTS) uses a custom config (see
%   defaultSegmentationConfig.m).

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

% Illumination normalization: subtract a large-kernel Gaussian estimate of
% background illumination (same idea as quality/enhanceFundusImage.m), so
% vesselness response isn't biased by uneven exposure across the retina.
sigma = max(1, size(green, 1) / 10);
background = imgaussfilt(green, sigma);
normalized = green - background + 0.5;
normalized = min(max(normalized, 0), 1);

% Vessels are dark ridges in the raw green channel; fibermetric with
% 'ObjectPolarity','bright' expects bright ridges, so invert within the FOV
% (outside the FOV is set to 0 so the black border never looks vessel-like).
inverted = zeros(size(normalized));
inverted(mask) = 1 - normalized(mask);

response = fibermetric(inverted, opts.VesselThicknessRange, 'ObjectPolarity', 'bright');
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
        % 'percentile': keep the top (100 - VesselThresholdPercentile)% of
        % in-FOV pixels by vesselness rank. An earlier version of this line
        % read prctile(validVals, 100 - opts.VesselThresholdPercentile) --
        % inverted (e.g. VesselThresholdPercentile=90 would threshold at the
        % 10th percentile, keeping ~90% of pixels as "vessel", the opposite
        % of the intent). Never exercised by the 'otsu' default at the time,
        % but wrong; caught and fixed during DRIVE validation (see
        % matlab/segmentation/README.md).
        level = prctile(validVals, opts.VesselThresholdPercentile);
end

raw = response > level & mask;
vesselMask = bwareaopen(raw, opts.VesselMinObjectArea);

vesselInfo = struct();
vesselInfo.vesselDensity = nnz(vesselMask) / max(1, nnz(mask));
vesselInfo.skeleton = bwskel(vesselMask);
vesselInfo.fov = fovInfo;

end
