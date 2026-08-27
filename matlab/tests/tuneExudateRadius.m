% Joint sweep of top-hat radius x threshold percentile against IDRiD ground truth.
setupPathsRoot = fileparts(mfilename('fullpath'));
run(fullfile(setupPathsRoot, '..', 'setupPaths.m'));

idridDir = fullfile(setupPathsRoot, '..', '..', 'training', 'data', 'idrid', 'A. Segmentation');
imgDir = fullfile(idridDir, '1. Original Images', 'a. Training Set');
gtDir = fullfile(idridDir, '2. All Segmentation Groundtruths', 'a. Training Set', '3. Hard Exudates');

files = dir(fullfile(imgDir, '*.jpg'));
n = min(15, numel(files));
opts = defaultSegmentationConfig();

% Precompute per-image: normalized green channel, exclusion/FOV masks, GT.
normedImgs = cell(n, 1);
candidateMasks = cell(n, 1);
gts = cell(n, 1);
fovMasks = cell(n, 1);

fprintf('Precomputing for %d images...\n', n);
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

    [hl, wl, ~] = size(lesionImg);
    gt = imresize(gtNative, [hl wl], 'nearest');

    normedImgs{k} = normalized;
    candidateMasks{k} = fovMask & ~exclusionMask;
    gts{k} = gt;
    fovMasks{k} = fovMask;
end
fprintf('Done in %.1f s\n\n', toc);

radii = [8 12 18 25 35];
bestDice = 0; bestR = 0; bestP = 0;
for r = radii
    tophats = cell(n, 1);
    for k = 1:n
        th = imtophat(normedImgs{k}, strel('disk', r));
        th(~fovMasks{k}) = 0;
        tophats{k} = th;
    end
    for p = [85 90 93 95 97]
        sens = nan(n, 1); prec = nan(n, 1); dice = nan(n, 1);
        for k = 1:n
            vals = tophats{k}(candidateMasks{k});
            if isempty(vals) || max(vals) <= 0
                continue
            end
            level = prctile(vals, p);
            predMask = tophats{k} > level & candidateMasks{k};
            gt = gts{k}; fovMask = fovMasks{k};
            tp = nnz(predMask & gt & fovMask);
            fp = nnz(predMask & ~gt & fovMask);
            fn = nnz(~predMask & gt & fovMask);
            sens(k) = tp / max(1, tp + fn);
            prec(k) = tp / max(1, tp + fp);
            dice(k) = 2 * tp / max(1, (2 * tp + fp + fn));
        end
        md = mean(dice, 'omitnan');
        fprintf('radius=%-3d pctl=%-3d sens=%.3f prec=%.3f dice=%.3f\n', r, p, mean(sens,'omitnan'), mean(prec,'omitnan'), md);
        if md > bestDice
            bestDice = md; bestR = r; bestP = p;
        end
    end
end
fprintf('\nBest: radius=%d percentile=%d dice=%.3f\n', bestR, bestP, bestDice);
