function [mask, fovInfo] = computeFOVMask(img, opts)
%COMPUTEFOVMASK Segment the circular fundus region out of the black background.
%   [MASK, FOVINFO] = COMPUTEFOVMASK(IMG, OPTS) returns a logical mask the
%   same size as IMG's first two dimensions, true where the pixel belongs to
%   the retinal field of view, plus a struct of diagnostic measurements.
%
%   Mirrors the intensity-threshold approach in training/dataset.py's
%   crop_to_fundus, extended with morphological cleanup and largest-connected-
%   component selection so a stray bright artifact outside the fundus circle
%   can't be mistaken for the field of view.

if nargin < 2
    opts = defaultQualityConfig();
end

gray = im2gray(img);
rawMask = gray > opts.FOVIntensityTol;

% Morphological cleanup: close small gaps (vessels/lesions can locally dip
% below the intensity threshold near the rim), then keep only the largest
% connected component so isolated bright artifacts don't count.
se = strel('disk', 5);
cleaned = imclose(rawMask, se);
cleaned = imfill(cleaned, 'holes');

cc = bwconncomp(cleaned);
mask = false(size(cleaned));
fovInfo = struct('areaFraction', 0, 'centerOffsetFraction', 1, ...
    'boundingBox', [0 0 0 0], 'touchesBorder', true, ...
    'ellipseFillRatio', 0, 'possiblyClipped', true);

if cc.NumObjects == 0
    return
end

numPixels = cellfun(@numel, cc.PixelIdxList);
[~, largestIdx] = max(numPixels);
mask(cc.PixelIdxList{largestIdx}) = true;

[h, w] = size(mask);
frameArea = h * w;
fovInfo.areaFraction = nnz(mask) / frameArea;

props = regionprops(mask, 'BoundingBox', 'Centroid', 'Area');
fovInfo.boundingBox = props(1).BoundingBox;

centroid = props(1).Centroid; % [x y]
frameCenter = [w / 2, h / 2];
frameDiagonal = hypot(w, h);
fovInfo.centerOffsetFraction = hypot(centroid(1) - frameCenter(1), ...
    centroid(2) - frameCenter(2)) / frameDiagonal;

bb = fovInfo.boundingBox; % [x y width height], x/y are 1-based-ish edges
touchesLeft   = bb(1) <= 1;
touchesTop    = bb(2) <= 1;
touchesRight  = (bb(1) + bb(3)) >= w - 1;
touchesBottom = (bb(2) + bb(4)) >= h - 1;
% Purely informational: whether the mask's bounding box reaches the frame
% edge at all. NOT used to decide clipping on its own — in these datasets
% the fundus circle is very commonly pre-cropped tight to its own bounding
% box, which touches the frame edge on some/all sides even when the full
% circle is completely intact. Counting touched sides alone (an earlier
% version of this function did exactly that) flagged ~45% of a real APTOS
% sample as "clipped" when they weren't (see matlab/tests/reasonTally.m).
fovInfo.touchesBorder = (touchesLeft + touchesTop + touchesRight + touchesBottom) >= 1;

% Real clipping test: compare the mask's actual pixel area to the area of
% an ellipse inscribed in its own bounding box. An intact circle (or the
% ellipse a tight crop turns it into) fills that inscribed ellipse almost
% completely; a circle truncated by the frame edge is missing a segment/cap,
% so its area falls meaningfully short of the ellipse implied by whatever
% (now smaller, in the clipped dimension) bounding box remains — regardless
% of how many sides nominally "touch" the frame.
idealEllipseArea = pi * (bb(3) / 2) * (bb(4) / 2);
if idealEllipseArea > 0
    fovInfo.ellipseFillRatio = props(1).Area / idealEllipseArea;
else
    fovInfo.ellipseFillRatio = 0;
end
fovInfo.possiblyClipped = fovInfo.touchesBorder && fovInfo.ellipseFillRatio < opts.MinEllipseFillRatio;

end
