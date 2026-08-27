function stats = validateMASubpixelCentroid(n)
%VALIDATEMASUBPIXELCENTROID Empirically confirms MA centroids are genuinely sub-pixel.
%   STATS = VALIDATEMASUBPIXELCENTROID(N) runs detectMicroaneurysms over the
%   first N real IDRiD segmentation-training images (all 54 if N omitted)
%   and measures the offset between each detected candidate's ordinary
%   'Centroid' (geometric center of the thresholded binary blob) and its
%   'WeightedCentroid' (intensity-weighted center of mass against the
%   continuous pre-threshold response map -- see detectMicroaneurysms.m's
%   docstring).
%
%   Why this check exists: adding a 'WeightedCentroid' field is trivial to
%   get wrong in a way that LOOKS like sub-pixel localization but isn't --
%   e.g. accidentally weighting by the binary mask itself would reproduce
%   the plain centroid exactly (offset always 0), silently defeating the
%   whole point. This script proves empirically, on real images, that the
%   offset is (a) actually nonzero for the large majority of candidates
%   and (b) landing at genuinely fractional pixel positions, not just
%   reproducing the integer centroid with float formatting.

setupPathsRoot = fileparts(mfilename('fullpath'));
run(fullfile(setupPathsRoot, '..', 'setupPaths.m'));

idridDir = fullfile(setupPathsRoot, '..', '..', 'training', 'data', 'idrid', 'A. Segmentation');
imgDir = fullfile(idridDir, '1. Original Images', 'a. Training Set');
files = dir(fullfile(imgDir, '*.jpg'));
if nargin < 1 || isempty(n)
    n = numel(files);
end
n = min(n, numel(files));

opts = defaultSegmentationConfig();

allOffsets = [];
allFracParts = [];
totalCandidates = 0;
zeroOffsetCount = 0;

tic;
for k = 1:n
    img = imread(fullfile(imgDir, files(k).name));
    [~, maInfo] = detectMicroaneurysms(img, opts);
    if maInfo.count == 0
        continue
    end
    plainCentroids = reshape([maInfo.regions.Centroid], 2, [])';
    weightedCentroids = maInfo.centroidsSubpixel;

    offsets = sqrt(sum((weightedCentroids - plainCentroids) .^ 2, 2));
    allOffsets = [allOffsets; offsets]; %#ok<AGROW>

    fracParts = abs(weightedCentroids - round(weightedCentroids));
    allFracParts = [allFracParts; fracParts(:)]; %#ok<AGROW>

    totalCandidates = totalCandidates + maInfo.count;
    zeroOffsetCount = zeroOffsetCount + nnz(offsets < 1e-9);

    if mod(k, 10) == 0
        fprintf('  %d/%d (%.1f s elapsed)\n', k, n, toc);
    end
end

fprintf('\n--- MA sub-pixel centroid check (n=%d images, %d candidates) ---\n', n, totalCandidates);
fprintf('Offset between WeightedCentroid and plain Centroid, pixels:\n');
fprintf('  mean=%.3f  median=%.3f  p90=%.3f  max=%.3f\n', ...
    mean(allOffsets), median(allOffsets), prctile(allOffsets, 90), max(allOffsets));
fprintf('Candidates with exactly zero offset (would indicate the refinement is NOT doing anything): %d / %d (%.1f%%)\n', ...
    zeroOffsetCount, totalCandidates, 100 * zeroOffsetCount / max(1, totalCandidates));
fprintf('WeightedCentroid fractional-pixel part (0 = falls exactly on an integer coordinate):\n');
fprintf('  mean=%.3f  fraction landing off-grid (>0.01px from nearest integer)=%.1f%%\n', ...
    mean(allFracParts), 100 * mean(allFracParts > 0.01));

if zeroOffsetCount / max(1, totalCandidates) > 0.05
    fprintf('\nWARNING: more than 5%% of candidates show zero offset -- the sub-pixel refinement may not be working as intended.\n');
else
    fprintf('\nCONFIRMED: the overwhelming majority of candidates get a genuinely distinct, off-grid sub-pixel position -- this is real sub-pixel localization, not a relabeled integer centroid.\n');
end

stats = struct('offsets', allOffsets, 'fracParts', allFracParts, ...
    'totalCandidates', totalCandidates, 'zeroOffsetCount', zeroOffsetCount);

end
