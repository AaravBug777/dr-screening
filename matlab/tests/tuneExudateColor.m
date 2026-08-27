% Does adding a color (yellowness) criterion on top of the best top-hat
% operating point (radius=12, pctl=97) improve precision? Exudates are
% specifically yellow-white lipid deposits, not just locally bright --
% top-hat alone can't distinguish that from a vessel reflection or artifact.
setupPathsRoot = fileparts(mfilename('fullpath'));
run(fullfile(setupPathsRoot, '..', 'setupPaths.m'));

idridDir = fullfile(setupPathsRoot, '..', '..', 'training', 'data', 'idrid', 'A. Segmentation');
imgDir = fullfile(idridDir, '1. Original Images', 'a. Training Set');
gtDir = fullfile(idridDir, '2. All Segmentation Groundtruths', 'a. Training Set', '3. Hard Exudates');

files = dir(fullfile(imgDir, '*.jpg'));
n = min(15, numel(files));
opts = defaultSegmentationConfig();
R = 12; P = 97;

sensBase = nan(n,1); precBase = nan(n,1); diceBase = nan(n,1);
sensColor = nan(n,1); precColor = nan(n,1); diceColor = nan(n,1);

tic;
for k = 1:n
    imgFile = files(k).name;
    [~, idStr, ~] = fileparts(imgFile);
    img = imread(fullfile(imgDir, imgFile));
    gtNative = imread(fullfile(gtDir, [idStr '_EX.tif']));
    gtNative = logical(gtNative(:, :, 1));

    [fovMask, exclusionMask, lesionImg] = computeLesionExclusionMask(img, opts);
    candidateMask = fovMask & ~exclusionMask;
    green = im2double(lesionImg(:, :, 2));
    sigma = max(1, size(green, 1) / 10);
    background = imgaussfilt(green, sigma);
    normalized = min(max(green - background + 0.5, 0), 1);
    tophat = imtophat(normalized, strel('disk', R));
    tophat(~fovMask) = 0;

    labImg = rgb2lab(im2double(lesionImg));
    bChannel = labImg(:, :, 3); % Lab b*: positive = yellow, negative = blue

    [hl, wl, ~] = size(lesionImg);
    gt = imresize(gtNative, [hl wl], 'nearest');

    vals = tophat(candidateMask);
    if isempty(vals) || max(vals) <= 0
        continue
    end
    level = prctile(vals, P);
    predBase = tophat > level & candidateMask;

    % Require above-median yellowness among candidate pixels too.
    bVals = bChannel(candidateMask);
    bThresh = prctile(bVals, 60); % keep the more-yellow 40% of candidates
    predColor = predBase & (bChannel > bThresh);

    tp = nnz(predBase & gt & fovMask); fp = nnz(predBase & ~gt & fovMask); fn = nnz(~predBase & gt & fovMask);
    sensBase(k) = tp/max(1,tp+fn); precBase(k) = tp/max(1,tp+fp); diceBase(k) = 2*tp/max(1,2*tp+fp+fn);

    tp = nnz(predColor & gt & fovMask); fp = nnz(predColor & ~gt & fovMask); fn = nnz(~predColor & gt & fovMask);
    sensColor(k) = tp/max(1,tp+fn); precColor(k) = tp/max(1,tp+fp); diceColor(k) = 2*tp/max(1,2*tp+fp+fn);
end
fprintf('elapsed %.1f s\n', toc);
fprintf('BASE (top-hat only):  sens=%.3f prec=%.3f dice=%.3f\n', mean(sensBase,'omitnan'), mean(precBase,'omitnan'), mean(diceBase,'omitnan'));
fprintf('+COLOR (yellowness):  sens=%.3f prec=%.3f dice=%.3f\n', mean(sensColor,'omitnan'), mean(precColor,'omitnan'), mean(diceColor,'omitnan'));
