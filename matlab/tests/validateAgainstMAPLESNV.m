% Real, pixel-level neovascularization ground-truth validation --
% previously impossible (see detectNeovascularization.m's calibration
% caveat: "no pixel-level NV ground truth exists in any dataset this
% project has"). MAPLES-DR (Messidor Anatomical and Pathological Labels
% for Explainable Screening of Diabetic Retinopathy) has a real
% Neovascularization category, on real Messidor color fundus images --
% found and integrated this session specifically to close this gap. See
% training/data/maples_dr/ and matlab/segmentation/README.md.
%
% HONEST SAMPLE SIZE CAVEAT: neovascularization is clinically rare (only
% present in proliferative DR) -- of 198 MAPLES-DR images with an NV mask
% file, only 6 have a genuinely non-empty (NV-positive) mask; 5 of those
% match this project's already-downloaded Messidor-2 image set (the other
% 162 masks are legitimate negatives, usable for specificity). n=5
% positive cases is small -- report sensitivity with that caveat explicit,
% not as if it were the n=54 IDRiD lesion validation.

setupPathsRoot = fileparts(mfilename('fullpath'));
run(fullfile(setupPathsRoot, '..', 'setupPaths.m'));

maplesDir = fullfile(setupPathsRoot, '..', '..', 'training', 'data', 'maples_dr', 'MAPLES-DR');
imgDir = fullfile(setupPathsRoot, '..', '..', 'training', 'data', 'messidor2', 'IMAGES');

nvDirs = {fullfile(maplesDir, 'train', 'Neovascularization'), fullfile(maplesDir, 'test', 'Neovascularization')};

opts = defaultSegmentationConfig();

allFiles = {};
for d = 1:numel(nvDirs)
    listing = dir(fullfile(nvDirs{d}, '*.png'));
    for i = 1:numel(listing)
        allFiles{end+1} = fullfile(nvDirs{d}, listing(i).name); %#ok<AGROW>
    end
end

n = numel(allFiles);
fprintf('Found %d MAPLES-DR NV mask files.\n', n);

% Collect per-image results: pixel-level TP/FP/FN/TN (vs GT mask, our
% NV candidate mask upscaled to the mask's native resolution) and
% lesion-level (any true-positive overlap at all, for a positive image).
results = struct('file', {}, 'hasImage', {}, 'gtPositive', {}, 'predPositive', {}, ...
    'dice', {}, 'tp', {}, 'fp', {}, 'fn', {}, 'tn', {});

tic;
for k = 1:n
    maskPath = allFiles{k};
    [~, baseName, ~] = fileparts(maskPath);
    imgPath = fullfile(imgDir, [baseName '.png']);
    if ~isfile(imgPath)
        continue
    end

    gtMask = imread(maskPath) > 0;
    gtPositive = any(gtMask(:));

    img = imread(imgPath);
    [vesselMask, ~] = segmentVessels(img, opts);
    odInfo = localizeOpticDisc(img, vesselMask, opts);
    [nvMask, nvInfo] = detectNeovascularization(img, vesselMask, odInfo, opts);

    % Upscale our (MaxWorkingDim-resolution) candidate mask to the ground
    % truth's native resolution for a fair pixel-level comparison.
    nvMaskNative = imresize(nvMask, size(gtMask), 'nearest');
    predPositive = any(nvMaskNative(:));

    tp = nnz(nvMaskNative & gtMask);
    fp = nnz(nvMaskNative & ~gtMask);
    fn = nnz(~nvMaskNative & gtMask);
    tn = nnz(~nvMaskNative & ~gtMask);
    dice = 2 * tp / max(1, 2 * tp + fp + fn);

    results(end+1) = struct('file', baseName, 'hasImage', true, 'gtPositive', gtPositive, ...
        'predPositive', predPositive, 'dice', dice, 'tp', tp, 'fp', fp, 'fn', fn, 'tn', tn); %#ok<AGROW>

    if mod(numel(results), 25) == 0
        fprintf('  %d/%d matched images processed (%.1f s elapsed)\n', numel(results), n, toc);
    end
end
elapsed = toc;

fprintf('\nProcessed %d matched images in %.1f s (%.2f s/image)\n', numel(results), elapsed, elapsed / numel(results));

gtPos = [results.gtPositive];
predPos = [results.predPositive];

nPos = nnz(gtPos);
nNeg = nnz(~gtPos);
fprintf('\nGround truth: %d NV-positive images, %d NV-negative images (n=%d total matched)\n', nPos, nNeg, numel(results));

% --- Image-level (lesion-level) sensitivity/specificity: did we flag ANY
% NV candidate pixel at all on a positive image? Did we correctly flag
% nothing on a negative one? ---
tpImg = nnz(gtPos & predPos);
fnImg = nnz(gtPos & ~predPos);
tnImg = nnz(~gtPos & ~predPos);
fpImg = nnz(~gtPos & predPos);
sens = tpImg / max(1, tpImg + fnImg);
spec = tnImg / max(1, tnImg + fpImg);

fprintf('\n=== Image-level (lesion-level) sensitivity/specificity ===\n');
fprintf('Sensitivity: %.1f%% (%d/%d NV-positive images had >=1 candidate pixel overlap)\n', 100*sens, tpImg, nPos);
fprintf('Specificity: %.1f%% (%d/%d NV-negative images had ZERO candidate pixels)\n', 100*spec, tnImg, nNeg);
fprintf('*** n=%d positive cases -- small sample, report with that caveat, not as definitive as the n=54 IDRiD lesion validations. ***\n', nPos);

% --- Pixel-level Dice, among positive images only (matches this
% project's existing convention for the other lesion detectors: Dice is
% only meaningful where there's a real lesion to overlap) ---
positiveResults = results(gtPos);
if ~isempty(positiveResults)
    diceVals = [positiveResults.dice];
    fprintf('\n=== Pixel-level Dice (NV-positive images only, n=%d) ===\n', numel(positiveResults));
    fprintf('mean=%.3f median=%.3f\n', mean(diceVals), median(diceVals));
    for i = 1:numel(positiveResults)
        r = positiveResults(i);
        fprintf('  %s: dice=%.3f tp=%d fp=%d fn=%d\n', r.file, r.dice, r.tp, r.fp, r.fn);
    end
end

% --- Pixel-level sensitivity/specificity across ALL matched images
% (positive + negative) -- the standard aggregate metric format used
% elsewhere in this module. ---
totalTP = sum([results.tp]); totalFP = sum([results.fp]);
totalFN = sum([results.fn]); totalTN = sum([results.tn]);
pixelSens = totalTP / max(1, totalTP + totalFN);
pixelSpec = totalTN / max(1, totalTN + totalFP);
fprintf('\n=== Aggregate pixel-level sensitivity/specificity (all %d matched images) ===\n', numel(results));
fprintf('sensitivity=%.4f%%  specificity=%.4f%%\n', 100*pixelSens, 100*pixelSpec);
