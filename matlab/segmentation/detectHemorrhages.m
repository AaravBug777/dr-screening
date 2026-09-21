function [hemorrhageMask, hemInfo, debug] = detectHemorrhages(img, opts)
%DETECTHEMORRHAGES Black top-hat detection + shape-based type classification of hemorrhages.
%   [HEMORRHAGEMASK, HEMINFO] = DETECTHEMORRHAGES(IMG) returns a logical
%   mask (at opts.LesionMaxWorkingDim resolution) of candidate hemorrhage
%   pixels, plus a struct with per-lesion region properties AND a shape-based
%   dot/blot vs. flame-shaped type split (see "Type classification" below).
%
%   Method: black top-hat (mirror of detectHardExudates.m's white top-hat)
%   isolates dark blobs against local background on the green channel.
%   Vessels are the dominant false-positive source here (they're dark too),
%   so beyond the standard OD/vessel exclusion mask, candidates are also
%   shape-filtered by eccentricity — a real blot hemorrhage is roughly
%   round/irregular, while leftover fragments from imperfect vessel
%   exclusion tend to stay elongated.
%
%   Type classification (dot/blot vs. flame-shaped): applied only to
%   candidates that already survived the vessel-fragment eccentricity
%   reject above. Primary signal is shape: opts.HemorrhageFlameEccentricityMin
%   separates compact (dot/blot, deep-retinal-layer) from moderately
%   elongated (flame-shaped, superficial nerve-fibre-layer) candidates.
%   Secondary confirmatory signal, when the optic disc was localized:
%   real flame hemorrhages run along nerve fibre bundles that radiate from
%   the optic disc, so a shape-flagged flame candidate is only kept as
%   'flame' if its major-axis orientation is within
%   opts.HemorrhageFlameRadialToleranceDeg of the OD-to-centroid radial
%   direction; otherwise it's reclassified 'dot_blot'. Preretinal/
%   subhyaloid hemorrhage (recognized clinically by a horizontal fluid
%   level, not by blob shape) is NOT a category this function can produce —
%   that needs a different cue than 2D colour-fundus blob geometry, and is
%   out of scope here; see matlab/segmentation/README.md.

if nargin < 2 || isempty(opts)
    opts = defaultSegmentationConfig();
end

if ischar(img) || isstring(img)
    img = imread(char(img));
end

[fovMask, exclusionMask, lesionImg, odOnlyMask] = computeLesionExclusionMask(img, opts);
candidateMask = fovMask & ~exclusionMask;

% OD centroid, for the flame-classification radial check below -- derived
% from the odOnlyMask circle computeLesionExclusionMask already built
% (already scaled to this function's LesionMaxWorkingDim resolution), so no
% extra optic disc call is needed here.
odCentroid = [];
if any(odOnlyMask(:))
    odProps = regionprops(odOnlyMask, 'Centroid');
    odCentroid = odProps(1).Centroid; % [x y]
end

green = im2double(lesionImg(:, :, 2));
sigma = max(1, size(green, 1) / 10);
background = imgaussfilt(green, sigma);
normalized = min(max(green - background + 0.5, 0), 1);

bothat = imbothat(normalized, strel('disk', opts.HemorrhageTophatRadius));
bothat(~fovMask) = 0;

debug = struct('response', bothat, 'candidateMask', candidateMask); % optional 3rd output, for threshold experiments
vals = bothat(candidateMask);
hemInfo = struct('count', 0, 'dotBlotCount', 0, 'flameCount', 0, 'totalAreaPx', 0, 'regions', []);
if isempty(vals) || max(vals) <= 0
    hemorrhageMask = false(size(fovMask));
    return
end

if isfield(opts, 'HemorrhageAbsoluteLevel') && ~isempty(opts.HemorrhageAbsoluteLevel)
    level = opts.HemorrhageAbsoluteLevel; % absolute response cutoff (see defaultSegmentationConfig.m)
else
    level = prctile(vals, opts.HemorrhageThresholdPercentile);
end
raw = bothat > level & candidateMask;
sizeFiltered = bwareaopen(raw, opts.HemorrhageMinAreaPx);

cc = bwconncomp(sizeFiltered);
props = regionprops(cc, 'Area', 'Centroid', 'EquivDiameter', 'Eccentricity', 'Orientation');
keep = [props.Eccentricity] <= opts.HemorrhageMaxEccentricity;

hemorrhageMask = false(size(sizeFiltered));
keptIdx = find(keep);
keptProps = props(keep);

% --- Type classification (dot/blot vs flame-shaped), per kept region ---
types = cell(numel(keptProps), 1);
for i = 1:numel(keptProps)
    hemorrhageMask(cc.PixelIdxList{keptIdx(i)}) = true;

    p = keptProps(i);
    if p.Eccentricity < opts.HemorrhageFlameEccentricityMin
        types{i} = 'dot_blot';
        continue
    end

    % Shape flags this as a flame candidate. Confirm via the radial
    % orientation check if the OD centroid is available; otherwise accept
    % the shape-only classification (lower confidence, but still the best
    % available signal).
    isFlame = true;
    if ~isempty(odCentroid)
        % regionprops' Orientation is reported in a DISPLAY-style frame
        % (positive = counterclockwise as the image appears on screen, i.e.
        % with row/y effectively flipped relative to raw matrix indexing),
        % even though Centroid is plain [x y] = [col row] with no such
        % flip. Confirmed empirically, not assumed -- see
        % matlab/tests/checkHemorrhageOrientationConvention.m, which builds
        % a synthetic blob at known angles and found a naive un-flipped
        % atan2d(dy,dx) off by up to 60 degrees, while negating dy matches
        % Orientation to within 0.34 degrees at every tested angle.
        radialVec = p.Centroid - odCentroid; % [dx dy] in raw (col, row) frame
        radialAngleDeg = atan2d(-radialVec(2), radialVec(1));
        % regionprops Orientation is in (-90, 90], axis-unsigned (a line and
        % its 180-degree-rotated self are the same axis) -- compare against
        % the radial direction mod 180 by wrapping the angle difference into
        % [-90, 90] rather than [-180, 180].
        angleDiff = mod(radialAngleDeg - p.Orientation + 90, 180) - 90;
        isFlame = abs(angleDiff) <= opts.HemorrhageFlameRadialToleranceDeg;
    end
    if isFlame
        types{i} = 'flame';
    else
        types{i} = 'dot_blot';
    end
end

for i = 1:numel(keptProps)
    keptProps(i).Type = types{i};
end

hemInfo.count = nnz(keep);
hemInfo.dotBlotCount = sum(strcmp(types, 'dot_blot'));
hemInfo.flameCount = sum(strcmp(types, 'flame'));
hemInfo.totalAreaPx = sum([keptProps.Area]);
hemInfo.regions = keptProps;

end
