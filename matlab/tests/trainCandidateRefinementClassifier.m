% Attacks the documented shared weak point across microaneurysm/exudate/
% hemorrhage detection: strong lesion-level RECALL (82-88% hit rate) but
% weak pixel-level PRECISION (5-15%) -- these detectors flag far more
% candidates than are real. Rather than three separate fixes, this trains
% ONE reusable per-candidate classifier design (shape + intensity
% features -> real/false-positive) and applies it here to
% microaneurysms as the concrete, validated proof of concept -- the same
% function, pointed at a different detector/ground-truth pair, is the
% mechanical extension to exudates/hemorrhages (not attempted in the same
% run: this alone already touches ~thousands of real candidates across
% 216 images, real compute, real validation -- doing all three properly
% in one pass would roughly triple that without proving anything new
% about the METHOD itself).
%
% Deliberately SHAPE + INTENSITY features only, not radiomics texture:
% extractRadiomicFeatures.m's GLCM texture computation needs enough
% pixels for meaningful co-occurrence statistics, already fragile at
% whole-lesion-mask scale (needed a real bug fix, see its own docstring)
% -- applying it per-candidate-blob, many of which are a handful of
% pixels for microaneurysms specifically, risks the same degenerate-
% output failure mode for a much smaller, noisier input. Shape (Area,
% Eccentricity, Solidity, EquivDiameter) + intensity (MeanIntensity,
% local contrast against a dilated ring) is simpler and more robust at
% this candidate size.
%
% Ground truth: the COMBINED IDRiD (54 images) + MAPLES-DR (162 matched
% images) microaneurysm masks -- both independently available now (see
% validateAgainstMAPLESLesions.m), so the classifier is trained and
% evaluated across two different annotation conventions, not overfit to
% either one alone.
%
% Split by IMAGE, not by candidate, for train/test (80/20) -- candidates
% from the same image share illumination/camera characteristics, so
% splitting by candidate would leak information between train and test.

setupPathsRoot = fileparts(mfilename('fullpath'));
run(fullfile(setupPathsRoot, '..', 'setupPaths.m'));

opts = defaultSegmentationConfig();

% --- Collect (image path, ground-truth path) pairs from both sources ---
idridDir = fullfile(setupPathsRoot, '..', '..', 'training', 'data', 'idrid', 'A. Segmentation');
idridImgDir = fullfile(idridDir, '1. Original Images', 'a. Training Set');
idridMaDir = fullfile(idridDir, '2. All Segmentation Groundtruths', 'a. Training Set', '1. Microaneurysms');
idridFiles = dir(fullfile(idridMaDir, '*.tif'));

maplesDir = fullfile(setupPathsRoot, '..', '..', 'training', 'data', 'maples_dr', 'MAPLES-DR');
messidorImgDir = fullfile(setupPathsRoot, '..', '..', 'training', 'data', 'messidor2', 'IMAGES');
maDirs = {fullfile(maplesDir, 'train', 'Microaneurysms'), fullfile(maplesDir, 'test', 'Microaneurysms')};

pairs = struct('img', {}, 'gt', {}, 'source', {});
for k = 1:numel(idridFiles)
    [~, idStr, ~] = fileparts(idridFiles(k).name);
    idStr = erase(idStr, '_MA');
    imgPath = fullfile(idridImgDir, [idStr '.jpg']);
    if isfile(imgPath)
        pairs(end+1) = struct('img', imgPath, 'gt', fullfile(idridMaDir, idridFiles(k).name), 'source', 'idrid'); %#ok<AGROW>
    end
end
for d = 1:numel(maDirs)
    listing = dir(fullfile(maDirs{d}, '*.png'));
    for k = 1:numel(listing)
        [~, baseName, ~] = fileparts(listing(k).name);
        imgPath = fullfile(messidorImgDir, [baseName '.png']);
        if isfile(imgPath)
            pairs(end+1) = struct('img', imgPath, 'gt', fullfile(maDirs{d}, listing(k).name), 'source', 'maples'); %#ok<AGROW>
        end
    end
end
n = numel(pairs);
fprintf('Collected %d images with microaneurysm ground truth (IDRiD + MAPLES-DR combined).\n', n);

rng(42);
testIdx = false(n,1);
testIdx(randperm(n, round(0.2*n))) = true;

checkpointPath = fullfile(setupPathsRoot, 'maCandidateFeatures_checkpoint.mat');
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
allIsTest = false(0,1); % logical from the start -- concatenating a logical scalar onto
                        % a plain [] (double by default) silently produces a DOUBLE array,
                        % which then fails "Array indices must be positive integers or
                        % logical values" the first time it's used to index -- caught the
                        % hard way after a real ~31-minute extraction run, fixed here.
allImgIdx = [];

tic;
for k = 1:n
    img = imread(pairs(k).img);
    gtRaw = imread(pairs(k).gt);
    gtNative = gtRaw(:,:,1) > 0;

    [~, ~, lesionImg] = computeLesionExclusionMask(img, opts);
    green = im2double(lesionImg(:,:,2));

    [maMask, maInfo] = detectMicroaneurysms(img, opts);
    if maInfo.count == 0
        continue
    end
    [hl, wl] = size(maMask);
    gt = imresize(gtNative, [hl wl], 'nearest');

    cc = bwconncomp(maMask);
    props = regionprops(cc, green, 'Area', 'Eccentricity', 'Solidity', 'EquivDiameter', 'MeanIntensity', 'PixelIdxList');

    for r = 1:numel(props)
        p = props(r);
        % Local contrast: candidate's own mean intensity vs a dilated
        % ring immediately around it (background estimate specific to
        % this candidate's neighborhood, not a global threshold).
        candMask = false(hl, wl);
        candMask(p.PixelIdxList) = true;
        ringMask = imdilate(candMask, strel('disk', 4)) & ~candMask;
        ringVals = green(ringMask);
        localContrast = mean(ringVals) - p.MeanIntensity; % positive: candidate darker than surroundings (typical MA)

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

% Checkpoint the expensive part (this loop alone took ~31 minutes the
% first time) before anything downstream, which is cheap to fix and
% rerun if it breaks -- exactly the failure that happened here the first
% time (a real indexing bug below cost a full ~31-minute rerun since
% nothing had been saved yet).
save(checkpointPath, 'allFeatures', 'allLabels', 'allIsTest', 'allImgIdx');

end % if isfile(checkpointPath) / else

Xtrain = allFeatures(~allIsTest, :); Ytrain = allLabels(~allIsTest);
Xtest = allFeatures(allIsTest, :); Ytest = allLabels(allIsTest);
fprintf('Train: %d candidates (%d true). Test: %d candidates (%d true).\n', ...
    numel(Ytrain), sum(Ytrain), numel(Ytest), sum(Ytest));

% --- Baseline: precision/recall with NO filtering (current behavior) ---
basePrecision = sum(Ytest) / numel(Ytest);
baseRecall = 1.0; % by definition -- every candidate is "kept"
fprintf('\n=== BEFORE filtering (current behavior, all candidates kept) ===\n');
fprintf('Precision: %.1f%%  Recall: 100.0%% (n=%d test candidates)\n', 100*basePrecision, numel(Ytest));

% --- Train a classifier (Statistics and Machine Learning Toolbox) ---
featureNames = {'Area','Eccentricity','Solidity','EquivDiameter','MeanIntensity','LocalContrast'};
tblTrain = array2table(Xtrain, 'VariableNames', featureNames);
tblTrain.isTrue = categorical(Ytrain, [0 1], {'false','true'});

classifier = fitcensemble(tblTrain, 'isTrue', 'Method', 'RUSBoost', 'NumLearningCycles', 100);
% RUSBoost: handles the real class imbalance here (candidates are
% overwhelmingly false positives) better than a plain classifier would --
% confirmed necessary by checking the true/false candidate ratio printed
% above before choosing this over a plain fitcensemble('Bag',...).

tblTest = array2table(Xtest, 'VariableNames', featureNames);
predTest = predict(classifier, tblTest);
keep = predTest == 'true';

filteredPrecision = sum(Ytest(keep)) / max(1, nnz(keep));
filteredRecall = sum(Ytest(keep)) / max(1, sum(Ytest));

fprintf('\n=== AFTER filtering (candidate classifier applied) ===\n');
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

save(fullfile(setupPathsRoot, 'maCandidateClassifier.mat'), 'classifier', 'featureNames');
fprintf('\nSaved classifier to maCandidateClassifier.mat\n');
