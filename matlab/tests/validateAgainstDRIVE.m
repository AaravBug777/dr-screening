% Quantitative validation of segmentVessels against DRIVE's expert manual
% vessel segmentations -- the standard DRIVE benchmark: sensitivity,
% specificity, and accuracy, evaluated only within each image's own FOV mask
% (DRIVE ships one) so background pixels don't inflate specificity for free.
setupPathsRoot = fileparts(mfilename('fullpath'));
run(fullfile(setupPathsRoot, '..', 'setupPaths.m'));

driveDir = fullfile(setupPathsRoot, '..', '..', 'training', 'data', 'drive', 'DRIVE', 'training');
imgDir = fullfile(driveDir, 'images');
gtDir = fullfile(driveDir, '1st_manual');
maskDir = fullfile(driveDir, 'mask');

files = dir(fullfile(imgDir, '*.tif'));
n = numel(files);
if n == 0
    error('validateAgainstDRIVE:noImages', 'No DRIVE training images found at %s', imgDir);
end

opts = defaultSegmentationConfig();

sens = zeros(n, 1);
spec = zeros(n, 1);
acc = zeros(n, 1);
dice = zeros(n, 1);

for k = 1:n
    imgFile = files(k).name;
    idStr = extractBefore(imgFile, '_training');

    img = imread(fullfile(imgDir, imgFile));
    gt = imread(fullfile(gtDir, [char(idStr) '_manual1.gif']));
    driveMaskFile = dir(fullfile(maskDir, [char(idStr) '_training_mask*']));
    driveMask = imread(fullfile(maskDir, driveMaskFile(1).name));

    gt = logical(gt(:, :, 1) > 128);
    driveMask = logical(driveMask(:, :, 1) > 128);

    % DRIVE images are natively 565x584 -- below MaxWorkingDim (640), so no
    % resize happens inside segmentVessels; ground truth and predicted mask
    % stay pixel-aligned with no rescale bookkeeping needed.
    vesselMask = segmentVessels(img, opts);

    evalMask = driveMask;
    tp = nnz(vesselMask & gt & evalMask);
    tn = nnz(~vesselMask & ~gt & evalMask);
    fp = nnz(vesselMask & ~gt & evalMask);
    fn = nnz(~vesselMask & gt & evalMask);

    sens(k) = tp / max(1, tp + fn);
    spec(k) = tn / max(1, tn + fp);
    acc(k) = (tp + tn) / max(1, nnz(evalMask));
    dice(k) = 2 * tp / max(1, (2 * tp + fp + fn));

    fprintf('%s: sens=%.3f spec=%.3f acc=%.3f dice=%.3f\n', idStr, sens(k), spec(k), acc(k), dice(k));
end

fprintf('\n--- DRIVE training set (n=%d) ---\n', n);
fprintf('sensitivity: mean=%.3f  median=%.3f  min=%.3f  max=%.3f\n', mean(sens), median(sens), min(sens), max(sens));
fprintf('specificity: mean=%.3f  median=%.3f  min=%.3f  max=%.3f\n', mean(spec), median(spec), min(spec), max(spec));
fprintf('accuracy:    mean=%.3f  median=%.3f  min=%.3f  max=%.3f\n', mean(acc), median(acc), min(acc), max(acc));
fprintf('dice:        mean=%.3f  median=%.3f  min=%.3f  max=%.3f\n', mean(dice), median(dice), min(dice), max(dice));
