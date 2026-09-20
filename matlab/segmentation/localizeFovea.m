function foveaInfo = localizeFovea(img, odInfo, opts, vesselMask)
%LOCALIZEFOVEA Estimate fovea location relative to the optic disc.
%   FOVEAINFO = LOCALIZEFOVEA(IMG, ODINFO) searches an anatomically
%   plausible annulus around the OD center (opts.FoveaSearchRadiusODMultiples,
%   in units of OD diameters — the fovea sits roughly 2-3 OD diameters
%   temporal to the disc along the horizontal meridian, a standard clinical
%   landmark) for the darkest, most homogeneous region, since the macula/
%   fovea is avascular and carries more xanthophyll pigment than surrounding
%   retina, making it reliably darker in the green channel.
%
%   FOVEAINFO = LOCALIZEFOVEA(IMG, ODINFO, OPTS, VESSELMASK) additionally
%   folds in a local VESSEL-DENSITY signal (the foveal avascular zone is
%   genuinely vessel-free, a distinct anatomical fact from pure pixel
%   darkness — a hemorrhage or shadow can be dark without being
%   vessel-free). Started as a separate experimental function
%   (localizeFoveaVesselAware.m) and was promoted into this one after
%   validating a real improvement on BOTH IDRiD (success rate 84.7%->86.4%)
%   AND MAPLES-DR's Macula category, a previously-unused annotation
%   category (93.2%->95.0%) — see tests/validateFoveaVesselAware.m and
%   matlab/segmentation/README.md. VESSELMASK is optional and backward
%   compatible: when omitted, falls back to darkness-only scoring exactly
%   as before (a caller that hasn't been updated to pass it still works,
%   just without the improvement).
%
%   Direction ambiguity: this searches BOTH sides of the OD along the
%   horizontal meridian, not just one, since eye laterality (left/right —
%   which determines whether the fovea is image-left or image-right of the
%   OD) isn't reliably recoverable from the image alone without metadata
%   this pipeline doesn't have — confirmed empirically against IDRiD's 413
%   ground-truth images (matlab/tests/checkFoveaLaterality.m): fovea is
%   image-right of OD 50.6% of the time and image-left 49.4%, essentially a
%   coin flip with no dataset-level convention to exploit.
%
%   Side selection: each side is scored independently by how statistically
%   distinctive its darkest point is relative to its OWN local surroundings
%   (a z-score: how many standard deviations below that side's mean), and
%   the more distinctive side wins — NOT simply whichever side's darkest
%   raw pixel value is lower, which an earlier version of this function did
%   and which IDRiD validation showed performing only marginally better than
%   chance (55.2% success within 1 OD diameter): a single unrelated dark
%   pixel (hemorrhage, vessel shadow) on the wrong side could out-compete
%   the real, but comparatively subtler, foveal darkening. Comparing
%   normalized local contrast instead of raw brightness is more robust to
%   side-to-side illumination differences (vignetting, uneven flash).
%
%   Returns a struct: .center [x y], .found (false if no valid search band
%   existed, e.g. OD localization failed), .confidence (the winning side's
%   z-score — relative, not a calibrated probability), .side ('left'/'right'
%   image-relative-to-OD, for diagnostics).

if nargin < 3 || isempty(opts)
    opts = defaultSegmentationConfig();
end
if nargin < 4
    vesselMask = [];
end

if ischar(img) || isstring(img)
    img = imread(char(img));
end

[h0, w0, ~] = size(img);
if max(h0, w0) > opts.MaxWorkingDim
    img = imresize(img, opts.MaxWorkingDim / max(h0, w0));
end

[mask, ~] = computeFOVMask(img);
[h, w, ~] = size(img);

if isempty(odInfo) || any(isnan(odInfo.center))
    foveaInfo = struct('center', [NaN NaN], 'found', false, 'confidence', 0);
    return
end

green = im2double(img(:, :, 2));
sigma = max(1, odInfo.radius / 6);

% Normalized (mask-weighted) smoothing, not a plain imgaussfilt: a plain
% Gaussian blur averages in the black background near the FOV boundary,
% which pulls the smoothed value down artificially close to the rim and
% creates a spurious "darkest point" there that has nothing to do with the
% fovea (this is exactly what an earlier version of this function did wrong
% — see matlab/segmentation/README.md). Dividing by a same-kernel blur of
% the mask itself corrects for the missing mass outside the FOV so only
% real retinal pixels contribute to each local average.
maskD = double(mask);
numerator = imgaussfilt(green .* maskD, sigma);
denominator = imgaussfilt(maskD, sigma);
smoothed = numerator ./ max(denominator, 1e-6);

% Combined scoring map: darkness + a vessel-avoidance term when a vessel
% mask is available (see the vessel-aware docstring note above). The
% WINNING location is chosen from this combined map; confidence is still
% reported from darkness (`smoothed`) alone at that point, so its meaning
% stays consistent with the darkness-only mode rather than inventing a
% second, differently-scaled confidence metric.
if ~isempty(vesselMask) && any(vesselMask(:))
    vesselDensityRadius = max(3, round(odInfo.radius * 0.5));
    vesselDensityMap = imboxfilt(double(vesselMask), 2*vesselDensityRadius+1);
    scoringMap = smoothed + opts.FoveaVesselAvoidanceWeight * vesselDensityMap;
else
    scoringMap = smoothed;
end

odDiameter = odInfo.radius * 2;
rNear = opts.FoveaSearchRadiusODMultiples(1) * odDiameter;
rFar  = opts.FoveaSearchRadiusODMultiples(2) * odDiameter;

[xx, yy] = meshgrid(1:w, 1:h);
dx = xx - odInfo.center(1);
dy = yy - odInfo.center(2);
dist = sqrt(dx .^ 2 + dy .^ 2);

% Restrict to a horizontal band (the fovea sits close to the horizontal
% meridian through the OD, not well above/below it) and the plausible
% radius annulus, split into independent left/right sides.
verticalTol = 0.6 * odDiameter;
inAnnulus = abs(dy) <= verticalTol & dist >= rNear & dist <= rFar & mask;
rightBand = inAnnulus & dx > 0;
leftBand = inAnnulus & dx < 0;

rightCandidate = findDarkestCandidate(scoringMap, smoothed, rightBand);
leftCandidate = findDarkestCandidate(scoringMap, smoothed, leftBand);

% Discard a side whose band is starved relative to the other -- typically
% because an off-center OD pushes that side's search annulus up against the
% FOV boundary, leaving too few pixels for its z-score to be a reliable
% statistic (a small sample's minimum is a noisier, more chance-inflated
% extreme value than a large sample's).
nRight = nnz(rightBand);
nLeft = nnz(leftBand);
if nRight > 0 && nLeft > 0
    if nLeft < opts.FoveaMinBandSizeFraction * nRight
        leftCandidate = [];
    elseif nRight < opts.FoveaMinBandSizeFraction * nLeft
        rightCandidate = [];
    end
end

if isempty(rightCandidate) && isempty(leftCandidate)
    foveaInfo = struct('center', [NaN NaN], 'found', false, 'confidence', 0, 'side', '');
    return
elseif isempty(leftCandidate) || (~isempty(rightCandidate) && rightCandidate.zscore >= leftCandidate.zscore)
    winner = rightCandidate;
    side = 'right';
else
    winner = leftCandidate;
    side = 'left';
end

foveaInfo = struct();
foveaInfo.center = [winner.x, winner.y];
foveaInfo.found = true;
foveaInfo.confidence = winner.zscore;
foveaInfo.side = side;

end

function candidate = findDarkestCandidate(scoringMap, darknessMap, band)
%FINDDARKESTCANDIDATE Best point in BAND by SCORINGMAP; confidence (z-score) from DARKNESSMAP alone.
%   SCORINGMAP and DARKNESSMAP are the same map (darkness only) when no
%   vessel mask was supplied to the caller; otherwise SCORINGMAP also
%   folds in vessel avoidance while DARKNESSMAP stays darkness-only, so
%   the reported confidence keeps a consistent meaning either way.
if ~any(band(:))
    candidate = [];
    return
end
candidateMap = scoringMap;
candidateMap(~band) = Inf;
[~, linIdx] = min(candidateMap(:));
[y, x] = ind2sub(size(candidateMap), linIdx);
localVals = darknessMap(band);
minVal = darknessMap(y, x);
candidate = struct('x', x, 'y', y, ...
    'zscore', (mean(localVals) - minVal) / max(eps, std(localVals)));
end
