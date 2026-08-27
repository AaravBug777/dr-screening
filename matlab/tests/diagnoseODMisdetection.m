% One-off diagnostic: why did localizeOpticDisc pick a bright exudate
% cluster over the true optic disc on IDRiD_016.jpg? Prints the raw
% vessel-density/brightness signal values at both locations before
% designing a fix, rather than guessing.

setupPathsRoot = fileparts(mfilename('fullpath'));
run(fullfile(setupPathsRoot, '..', 'setupPaths.m'));

opts = defaultSegmentationConfig();
img = imread(fullfile(setupPathsRoot, '..', '..', 'training', 'data', 'idrid', 'B. Disease Grading', '1. Original Images', 'a. Training Set', 'IDRiD_016.jpg'));
[h0, w0, ~] = size(img);
if max(h0, w0) > opts.MaxWorkingDim
    img = imresize(img, opts.MaxWorkingDim / max(h0, w0));
end
[mask, ~] = computeFOVMask(img);
vesselMask = segmentVessels(img, opts);
[h, w, ~] = size(img);

odDiameterGuess = opts.ODDiameterFraction * min(h, w);
winSize = max(3, round(odDiameterGuess));
if mod(winSize, 2) == 0
    winSize = winSize + 1;
end
vesselDensityMap = imfilter(double(vesselMask), ones(winSize) / winSize^2, 'replicate');
red = im2double(img(:, :, 1));
greenc = im2double(img(:, :, 2));
brightnessChannel = 0.5 * red + 0.5 * greenc;
closeRadius = max(3, round(winSize / 4));
closed = imclose(brightnessChannel, strel('disk', closeRadius));
brightnessMap = imfilter(closed, fspecial('average', winSize), 'replicate');

vdm = normalizeWithinMaskLocal(vesselDensityMap, mask);
bm = normalizeWithinMaskLocal(brightnessMap, mask);
combined = 0.5 * vdm + 0.5 * bm;
combined(~mask) = -Inf;

[~, linIdx] = max(combined(:));
[peakY, peakX] = ind2sub(size(combined), linIdx);
fprintf('Chosen (wrong) peak: [%d %d]  vesselDensity=%.3f brightness=%.3f combined=%.3f\n', ...
    peakX, peakY, vdm(peakY, peakX), bm(peakY, peakX), combined(peakY, peakX));

% Precise ground truth from IDRiD's OD Center Location CSV: IDRiD_016 -> (940, 1359)
% in native pixels (native size 2848x4288); scale to this working resolution.
scale = opts.MaxWorkingDim / max(h0, w0);
trueX = round(940 * scale); trueY = round(1359 * scale);
fprintf('True OD approx:     [%d %d]  vesselDensity=%.3f brightness=%.3f combined=%.3f\n', ...
    trueX, trueY, vdm(trueY, trueX), bm(trueY, trueX), combined(trueY, trueX));

[maxVDM, vdmIdx] = max(vdm(:));
[vY, vX] = ind2sub(size(vdm), vdmIdx);
fprintf('Global vessel-density max: [%d %d] value=%.3f (brightness there=%.3f)\n', vX, vY, maxVDM, bm(vY, vX));

function normed = normalizeWithinMaskLocal(map, mask)
vals = map(mask);
lo = min(vals); hi = max(vals);
normed = (map - lo) / (hi - lo);
normed(~mask) = 0;
end
