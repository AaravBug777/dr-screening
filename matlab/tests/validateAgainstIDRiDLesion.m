function stats = validateAgainstIDRiDLesion(detectorFn, lesionSuffix, lesionFolderName, n)
%VALIDATEAGAINSTIDRIDLESION Pixel-level validation of a lesion detector against IDRiD.
%   STATS = VALIDATEAGAINSTIDRIDLESION(DETECTORFN, LESIONSUFFIX, LESIONFOLDERNAME, N)
%   runs DETECTORFN (e.g. @detectHardExudates) over the first N images (all
%   54, if N omitted) of IDRiD's segmentation training set, compares against
%   the ground-truth mask named IDRiD_XX_<LESIONSUFFIX>.tif in
%   A. Segmentation/2. All Segmentation Groundtruths/a. Training Set/<LESIONFOLDERNAME>/,
%   and reports pixel-level sensitivity/specificity/precision/Dice
%   (evaluated within the FOV only) plus a lesion-level hit rate (fraction
%   of true lesion blobs with at least one detected pixel — the more
%   forgiving metric standard in the MA-detection literature, since exact
%   pixel-level boundaries on a 5-50px lesion are inherently fuzzy).
%
%   Ground truth is at native image resolution; predictions come back at
%   opts.LesionMaxWorkingDim, so ground truth is downscaled to match rather
%   than upscaling the (coarser) prediction.

setupPathsRoot = fileparts(mfilename('fullpath'));
run(fullfile(setupPathsRoot, '..', 'setupPaths.m'));

idridDir = fullfile(setupPathsRoot, '..', '..', 'training', 'data', 'idrid', 'A. Segmentation');
imgDir = fullfile(idridDir, '1. Original Images', 'a. Training Set');
gtDir = fullfile(idridDir, '2. All Segmentation Groundtruths', 'a. Training Set', lesionFolderName);

files = dir(fullfile(imgDir, '*.jpg'));
if nargin < 4 || isempty(n)
    n = numel(files);
end
n = min(n, numel(files));

opts = defaultSegmentationConfig();

sens = nan(n, 1); spec = nan(n, 1); prec = nan(n, 1); dice = nan(n, 1);
lesionHitRate = nan(n, 1);

tic;
for k = 1:n
    imgFile = files(k).name;
    [~, idStr, ~] = fileparts(imgFile);
    gtFile = fullfile(gtDir, [idStr '_' lesionSuffix '.tif']);
    if ~isfile(gtFile)
        continue % e.g. soft exudates aren't annotated for every image
    end

    img = imread(fullfile(imgDir, imgFile));
    gtNative = imread(gtFile);
    gtNative = logical(gtNative(:, :, 1));

    [predMask, ~] = detectorFn(img, opts);
    [hl, wl, ~] = size(predMask);
    gt = imresize(gtNative, [hl wl], 'nearest');

    [fovMask, ~] = computeFOVMask(imresize(img, [hl wl]));

    tp = nnz(predMask & gt & fovMask);
    tn = nnz(~predMask & ~gt & fovMask);
    fp = nnz(predMask & ~gt & fovMask);
    fn = nnz(~predMask & gt & fovMask);

    sens(k) = tp / max(1, tp + fn);
    spec(k) = tn / max(1, tn + fp);
    prec(k) = tp / max(1, tp + fp);
    dice(k) = 2 * tp / max(1, (2 * tp + fp + fn));

    gtCC = bwconncomp(gt);
    if gtCC.NumObjects > 0
        hits = 0;
        for L = 1:gtCC.NumObjects
            if any(predMask(gtCC.PixelIdxList{L}))
                hits = hits + 1;
            end
        end
        lesionHitRate(k) = hits / gtCC.NumObjects;
    end

    if mod(k, 10) == 0
        fprintf('  %d/%d (%.1f s elapsed)\n', k, n, toc);
    end
end

valid = ~isnan(dice);
fprintf('\n--- %s (n=%d valid of %d) ---\n', lesionFolderName, nnz(valid), n);
fprintf('sensitivity: mean=%.3f median=%.3f\n', mean(sens(valid)), median(sens(valid)));
fprintf('specificity: mean=%.3f median=%.3f\n', mean(spec(valid)), median(spec(valid)));
fprintf('precision:   mean=%.3f median=%.3f\n', mean(prec(valid)), median(prec(valid)));
fprintf('dice:        mean=%.3f median=%.3f\n', mean(dice(valid)), median(dice(valid)));
fprintf('lesion-level hit rate: mean=%.3f median=%.3f\n', mean(lesionHitRate(valid), 'omitnan'), median(lesionHitRate(valid), 'omitnan'));

stats = struct('sens', sens, 'spec', spec, 'prec', prec, 'dice', dice, 'lesionHitRate', lesionHitRate);

end
