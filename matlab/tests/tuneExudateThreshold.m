% Sweep hard-exudate top-hat threshold percentile against IDRiD ground
% truth. Caches the (expensive) top-hat response + exclusion mask once per
% image, then cheaply re-thresholds at several percentiles.
setupPathsRoot = fileparts(mfilename('fullpath'));
run(fullfile(setupPathsRoot, '..', 'setupPaths.m'));

idridDir = fullfile(setupPathsRoot, '..', '..', 'training', 'data', 'idrid', 'A. Segmentation');
imgDir = fullfile(idridDir, '1. Original Images', 'a. Training Set');
gtDir = fullfile(idridDir, '2. All Segmentation Groundtruths', 'a. Training Set', '3. Hard Exudates');

files = dir(fullfile(imgDir, '*.jpg'));
n = min(15, numel(files));
opts = defaultSegmentationConfig();

tophats = cell(n, 1);
candidateMasks = cell(n, 1);
gts = cell(n, 1);
fovMasks = cell(n, 1);

fprintf('Computing top-hat response for %d images...\n', n);
tic;
for k = 1:n
    imgFile = files(k).name;
    [~, idStr, ~] = fileparts(imgFile);
    img = imread(fullfile(imgDir, imgFile));
    gtNative = imread(fullfile(gtDir, [idStr '_EX.tif']));
    gtNative = logical(gtNative(:, :, 1));

    [fovMask, exclusionMask, lesionImg] = computeLesionExclusionMask(img, opts);
    green = im2double(lesionImg(:, :, 2));
    sigma = max(1, size(green, 1) / 10);
    background = imgaussfilt(green, sigma);
    normalized = min(max(green - background + 0.5, 0), 1);
    tophat = imtophat(normalized, strel('disk', opts.ExudateTophatRadius));
    tophat(~fovMask) = 0;

    [hl, wl, ~] = size(lesionImg);
    gt = imresize(gtNative, [hl wl], 'nearest');

    tophats{k} = tophat;
    candidateMasks{k} = fovMask & ~exclusionMask;
    gts{k} = gt;
    fovMasks{k} = fovMask;
end
fprintf('Done in %.1f s\n\n', toc);

percentiles = [80 85 88 90 92 94 96 97];
fprintf('%-6s %10s %10s %10s %10s\n', 'pctl', 'sens', 'spec', 'prec', 'dice');
for p = percentiles
    sens = nan(n, 1); spec = nan(n, 1); prec = nan(n, 1); dice = nan(n, 1);
    for k = 1:n
        tophat = tophats{k};
        candidateMask = candidateMasks{k};
        gt = gts{k};
        fovMask = fovMasks{k};
        vals = tophat(candidateMask);
        if isempty(vals) || max(vals) <= 0
            continue
        end
        level = prctile(vals, p);
        predMask = tophat > level & candidateMask;

        tp = nnz(predMask & gt & fovMask);
        tn = nnz(~predMask & ~gt & fovMask);
        fp = nnz(predMask & ~gt & fovMask);
        fn = nnz(~predMask & gt & fovMask);

        sens(k) = tp / max(1, tp + fn);
        spec(k) = tn / max(1, tn + fp);
        prec(k) = tp / max(1, tp + fp);
        dice(k) = 2 * tp / max(1, (2 * tp + fp + fn));
    end
    fprintf('%-6d %10.3f %10.3f %10.3f %10.3f\n', p, mean(sens,'omitnan'), mean(spec,'omitnan'), mean(prec,'omitnan'), mean(dice,'omitnan'));
end
