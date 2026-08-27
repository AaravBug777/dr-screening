function illumInfo = computeIlluminationScore(img, mask, opts)
%COMPUTEILLUMINATIONSCORE Exposure + uniformity assessment within MASK.
%   ILLUMINFO = COMPUTEILLUMINATIONSCORE(IMG, MASK, OPTS) returns a struct:
%     .meanIntensity   - mean grayscale intensity (0-255) within MASK
%     .uniformityCV    - coefficient of variation of grid-cell mean
%                        intensities within MASK's bounding box (high = uneven
%                        illumination / vignetting / glare hot-spots)
%     .hasGlare        - true if any grid cell looks like a flat bright spot
%                        (saturated reflection off the lens/cornea), a common
%                        field-condition artifact with portable fundus cameras
%
%   The grid-uniformity check catches the case plain global exposure checks
%   miss: an image with an acceptable *average* brightness that is dark on
%   one side and blown out on the other (uneven flash, off-axis capture).

if nargin < 3
    opts = defaultQualityConfig();
end

gray = double(im2gray(img));
if nargin < 2 || isempty(mask)
    mask = true(size(gray));
end

values = gray(mask);
illumInfo = struct('meanIntensity', 0, 'uniformityCV', 0, 'hasGlare', false);
if isempty(values)
    return
end
illumInfo.meanIntensity = mean(values);

% Grid-based uniformity over the mask's bounding box.
[rows, cols] = find(mask);
if isempty(rows)
    return
end
r0 = min(rows); r1 = max(rows);
c0 = min(cols); c1 = max(cols);

n = max(1, round(opts.IlluminationGridSize));
rEdges = round(linspace(r0, r1 + 1, n + 1));
cEdges = round(linspace(c0, c1 + 1, n + 1));

cellMeans = [];
glareFound = false;

for i = 1:n
    for j = 1:n
        rSpan = rEdges(i):min(rEdges(i+1) - 1, r1);
        cSpan = cEdges(j):min(cEdges(j+1) - 1, c1);
        if isempty(rSpan) || isempty(cSpan)
            continue
        end
        cellMask = mask(rSpan, cSpan);
        coverage = nnz(cellMask) / numel(cellMask);
        if coverage < opts.MinCellCoverage
            continue % mostly background (near the circular rim) -> skip, not a real illumination sample
        end
        cellGray = gray(rSpan, cSpan);
        cellVals = cellGray(cellMask);
        cellMean = mean(cellVals);
        cellStd = std(cellVals);
        cellMeans(end + 1) = cellMean; %#ok<AGROW>

        if cellMean > opts.GlareCellBrightThreshold && cellStd < opts.GlareCellStdThreshold
            glareFound = true;
        end
    end
end

if numel(cellMeans) >= 2 && mean(cellMeans) > 0
    illumInfo.uniformityCV = std(cellMeans) / mean(cellMeans);
end
illumInfo.hasGlare = glareFound;

end
