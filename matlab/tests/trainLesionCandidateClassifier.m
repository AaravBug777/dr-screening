function trainLesionCandidateClassifier(lesionName, detectorFn, idridSuffix, idridFolderName, maplesFolderName)
%TRAINLESIONCANDIDATECLASSIFIER Generic extension of trainCandidateRefinementClassifier.m
%   TRAINLESIONCANDIDATECLASSIFIER(LESIONNAME, DETECTORFN, IDRIDSUFFIX,
%   IDRIDFOLDERNAME, MAPLESFOLDERNAME) trains the same per-candidate
%   shape+intensity RUSBoost classifier design validated for
%   microaneurysms (see trainCandidateRefinementClassifier.m's docstring
%   for the full rationale: deliberately shape+intensity only, not
%   radiomics texture; RUSBoost for the real class imbalance; split by
%   IMAGE not by candidate to avoid train/test leakage) against a
%   DIFFERENT detector/lesion-type pair, mechanically parameterized rather
%   than copy-pasted three times — the same "generic, parameterized"
%   pattern as validateAgainstIDRiDLesion.m in this same directory.
%
%   Example (exudates):
%     trainLesionCandidateClassifier('exudate', @detectHardExudates, ...
%         'EX', '3. Hard Exudates', 'Exudates');
%   Example (hemorrhages):
%     trainLesionCandidateClassifier('hemorrhage', @detectHemorrhages, ...
%         'HE', '2. Haemorrhages', 'Hemorrhages');
%
%   Ground truth: the COMBINED IDRiD (A. Segmentation training set) +
%   MAPLES-DR (matched Messidor-2 images) masks for whichever lesion type
%   is passed in, same two-source combination trainCandidateRefinementClassifier.m
%   used for microaneurysms.

setupPathsRoot = fileparts(mfilename('fullpath'));
run(fullfile(setupPathsRoot, '..', 'setupPaths.m'));

opts = defaultSegmentationConfig();

idridDir = fullfile(setupPathsRoot, '..', '..', 'training', 'data', 'idrid', 'A. Segmentation');
idridImgDir = fullfile(idridDir, '1. Original Images', 'a. Training Set');
idridGtDir = fullfile(idridDir, '2. All Segmentation Groundtruths', 'a. Training Set', idridFolderName);
idridFiles = dir(fullfile(idridGtDir, ['*_' idridSuffix '.tif']));

maplesDir = fullfile(setupPathsRoot, '..', '..', 'training', 'data', 'maples_dr', 'MAPLES-DR');
messidorImgDir = fullfile(setupPathsRoot, '..', '..', 'training', 'data', 'messidor2', 'IMAGES');
maplesGtDirs = {fullfile(maplesDir, 'train', maplesFolderName), fullfile(maplesDir, 'test', maplesFolderName)};

pairs = struct('img', {}, 'gt', {}, 'source', {});
for k = 1:numel(idridFiles)
    [~, idStr, ~] = fileparts(idridFiles(k).name);
    idStr = erase(idStr, ['_' idridSuffix]);
    imgPath = fullfile(idridImgDir, [idStr '.jpg']);
    if isfile(imgPath)
        pairs(end+1) = struct('img', imgPath, 'gt', fullfile(idridGtDir, idridFiles(k).name), 'source', 'idrid'); %#ok<AGROW>
    end
end
for d = 1:numel(maplesGtDirs)
    listing = dir(fullfile(maplesGtDirs{d}, '*.png'));
    for k = 1:numel(listing)
        [~, baseName, ~] = fileparts(listing(k).name);
        imgPath = fullfile(messidorImgDir, [baseName '.png']);
        gtPath = fullfile(maplesGtDirs{d}, listing(k).name);
        gtCheck = imread(gtPath);
        if isfile(imgPath) && any(gtCheck(:) > 0)
            pairs(end+1) = struct('img', imgPath, 'gt', gtPath, 'source', 'maples'); %#ok<AGROW>
        end
    end
end
n = numel(pairs);
fprintf('Collected %d images with %s ground truth (IDRiD + MAPLES-DR combined).\n', n, lesionName);

rng(42);
testIdx = false(n,1);
testIdx(randperm(n, round(0.2*n))) = true;

checkpointPath = fullfile(setupPathsRoot, [lesionName 'CandidateFeatures_checkpoint.mat']);
if isfile(checkpointPath)
    fprintf('Found existing checkpoint at %s -- loading instead of re-extracting (delete the file to force a full rerun).\n', checkpointPath);
    loaded = load(checkpointPath);
    allFeatures = loaded.allFeatures;
    allLabels = loaded.allLabels;
    allIsTest = loaded.allIsTest;
    allImgIdx = loaded.allImgIdx;
else

allFeatures = [];
allLabels = [];
allIsTest = false(0,1); % logical from the start -- see trainCandidateRefinementClassifier.m's
                        % docstring for the real bug this avoids (a plain [] concatenated with
                        % a logical scalar silently becomes double, breaking logical indexing).
allImgIdx = [];

tic;
for k = 1:n
    img = imread(pairs(k).img);
    gtRaw = imread(pairs(k).gt);
    gtNative = gtRaw(:,:,1) > 0;

    [~, ~, lesionImg] = computeLesionExclusionMask(img, opts);
    green = im2double(lesionImg(:,:,2));

    [candMaskFull, candInfo] = detectorFn(img, opts);
    if candInfo.count == 0
        continue
    end
    [hl, wl] = size(candMaskFull);
    gt = imresize(gtNative, [hl wl], 'nearest');

    cc = bwconncomp(candMaskFull);
    props = regionprops(cc, green, 'Area', 'Eccentricity', 'Solidity', 'EquivDiameter', 'MeanIntensity', 'PixelIdxList');

    for r = 1:numel(props)
        p = props(r);
        candMask = false(hl, wl);
        candMask(p.PixelIdxList) = true;
        ringMask = imdilate(candMask, strel('disk', 4)) & ~candMask;
        ringVals = green(ringMask);
        localContrast = mean(ringVals) - p.MeanIntensity;

        isTP = any(gt(p.PixelIdxList));

        allFeatures = [allFeatures; p.Area, p.Eccentricity, p.Solidity, p.EquivDiameter, p.MeanIntensity, localContrast]; %#ok<AGROW>
        allLabels = [allLabels; double(isTP)]; %#ok<AGROW>
        allIsTest = [allIsTest; testIdx(k)]; %#ok<AGROW>
        allImgIdx = [allImgIdx; k]; %#ok<AGROW>
    end

    if mod(k, 25) == 0
        fprintf('  %d/%d images (%.1f s elapsed, %d candidates so far)\n', k, n, toc, numel(allLabels));
    end
end
elapsed = toc;

fprintf('\nExtracted %d candidates (%d true, %d false) from %d images in %.1f s\n', ...
    numel(allLabels), sum(allLabels), sum(~allLabels), n, elapsed);

save(checkpointPath, 'allFeatures', 'allLabels', 'allIsTest', 'allImgIdx');

end % if isfile(checkpointPath) / else

Xtrain = allFeatures(~allIsTest, :); Ytrain = allLabels(~allIsTest);
Xtest = allFeatures(allIsTest, :); Ytest = allLabels(allIsTest);
fprintf('Train: %d candidates (%d true). Test: %d candidates (%d true).\n', ...
    numel(Ytrain), sum(Ytrain), numel(Ytest), sum(Ytest));

basePrecision = sum(Ytest) / numel(Ytest);
fprintf('\n=== %s: BEFORE filtering (current behavior, all candidates kept) ===\n', lesionName);
fprintf('Precision: %.1f%%  Recall: 100.0%% (n=%d test candidates)\n', 100*basePrecision, numel(Ytest));

featureNames = {'Area','Eccentricity','Solidity','EquivDiameter','MeanIntensity','LocalContrast'};
tblTrain = array2table(Xtrain, 'VariableNames', featureNames);
tblTrain.isTrue = categorical(Ytrain, [0 1], {'false','true'});

classifier = fitcensemble(tblTrain, 'isTrue', 'Method', 'RUSBoost', 'NumLearningCycles', 100);

tblTest = array2table(Xtest, 'VariableNames', featureNames);
[predTest, scores] = predict(classifier, tblTest);
keep = predTest == 'true';

filteredPrecision = sum(Ytest(keep)) / max(1, nnz(keep));
filteredRecall = sum(Ytest(keep)) / max(1, sum(Ytest));

fprintf('\n=== %s: AFTER filtering (candidate classifier, default decision) ===\n', lesionName);
fprintf('Precision: %.1f%%  Recall: %.1f%%  (kept %d/%d candidates)\n', ...
    100*filteredPrecision, 100*filteredRecall, nnz(keep), numel(Ytest));

fprintf('\nFeature importance (out-of-bag permuted predictor importance):\n');
imp = predictorImportance(classifier);
[~, order] = sort(imp, 'descend');
for i = order
    fprintf('  %-15s %.4f\n', featureNames{i}, imp(i));
end

if filteredPrecision > basePrecision && filteredRecall > 0.5
    fprintf('\nRESULT: real precision improvement (%.1f%% -> %.1f%%) at %.1f%% recall retained.\n', ...
        100*basePrecision, 100*filteredPrecision, 100*filteredRecall);
else
    fprintf('\nRESULT: filtering did not clearly improve precision at usable recall -- report this honestly.\n');
end

% Margin-based threshold sweep (same fix as sweepMACandidateThreshold.m:
% RUSBoost's two-column scores are NOT a calibrated probability comparable
% to an absolute 0.5 cutoff -- sweep the MARGIN between class scores
% instead, sanity-checked to reproduce predict()'s own decision at
% margin=0 before trusting any other value).
classNames = classifier.ClassNames;
trueCol = find(classNames == 'true');
falseCol = find(classNames == 'false');
marginAtDefault = scores(:, trueCol) - scores(:, falseCol);
sanityKeep = marginAtDefault > 0;
assert(isequal(sanityKeep, keep), 'Margin-based decision does not match predict() default -- do not trust the sweep below.');

fprintf('\n=== %s: margin sweep (recall-preserving alternative) ===\n', lesionName);
margins = -5:0.25:2;
bestRecallPreserving = struct('margin', NaN, 'precision', 0, 'recall', 0);
for m = margins
    keepM = marginAtDefault > m;
    if nnz(keepM) == 0, continue; end
    precM = sum(Ytest(keepM)) / nnz(keepM);
    recM = sum(Ytest(keepM)) / max(1, sum(Ytest));
    if recM >= 0.90 && precM > bestRecallPreserving.precision
        bestRecallPreserving = struct('margin', m, 'precision', precM, 'recall', recM);
    end
end
if ~isnan(bestRecallPreserving.margin)
    fprintf('Best >=90%% recall operating point: margin=%.3f  precision=%.1f%%  recall=%.1f%%\n', ...
        bestRecallPreserving.margin, 100*bestRecallPreserving.precision, 100*bestRecallPreserving.recall);
else
    fprintf('No margin tested reaches >=90%% recall with any candidates kept.\n');
end

save(fullfile(setupPathsRoot, [lesionName 'CandidateClassifier.mat']), 'classifier', 'featureNames');
fprintf('\nSaved classifier to %sCandidateClassifier.mat\n', lesionName);

end
