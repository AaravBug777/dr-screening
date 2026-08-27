% Extracts classical structural features (from THIS project's own MATLAB
% segmentation module) for every image in a set, paired with the real
% IDRiD Disease Grading referable-DR label (grade >= 2). Caches to a .mat
% file per split so the expensive part (running segmentVessels/
% localizeOpticDisc/localizeFovea/detectMicroaneurysms/detectHardExudates/
% detectHemorrhages/detectNeovascularization on every image) only happens
% once -- matlab/grading/trainStructuralReferableNet.m re-loads this cache
% on every run while tuning the network.
%
% Feature vector (14 dims). Features 1-8 are straight outputs of
% already-existing segmentation functions -- no new signal invented
% there, just packaged. Features 9-14 (added to strengthen the
% compareIntegratedVsSingleTechnique.m ablation -- see its README section)
% are Medical Imaging Toolbox `radiomics` GLCM texture features over the
% union lesion mask, a genuinely different kind of signal (how texturally
% complex the flagged regions are) from the plain per-type pixel counts in
% 4-6, which only say how MUCH was flagged, not what it looks like:
%   1. vesselDensity          (segmentVessels)
%   2. odConfidence           (localizeOpticDisc)
%   3. foveaFound             (localizeFovea, 0/1)
%   4. log1p(maCount)         (detectMicroaneurysms)
%   5. log1p(exudateCount)    (detectHardExudates)
%   6. log1p(hemorrhageCount) (detectHemorrhages)
%   7. log1p(nvCount)         (detectNeovascularization -- see its calibration caveat)
%   8. any(nvdCount > 0)      (detectNeovascularization, 0/1 -- NVD is the single most PDR-specific classical signal available)
%   9-14. GLCM contrast/correlation/energy/homogeneity/jointEntropy/
%         differenceEntropy over the MA|exudate|hemorrhage union mask
%         (extractRadiomicFeatures.m -- see its docstring for the
%         Resegment=false fix a real degenerate-output bug needed)
%
% Usage: set SPLIT_NAME / IMG_DIR / CSV_PATH below (train or test), then run.

setupPathsRoot = fileparts(mfilename('fullpath'));
run(fullfile(setupPathsRoot, '..', 'setupPaths.m'));

idridDir = fullfile(setupPathsRoot, '..', '..', 'training', 'data', 'idrid');

if ~exist('SPLIT_NAME', 'var')
    SPLIT_NAME = 'train'; % or 'test' -- set this in the workspace before running as a script, or edit here
end

if strcmp(SPLIT_NAME, 'train')
    imgDir = fullfile(idridDir, 'B. Disease Grading', '1. Original Images', 'a. Training Set');
    csvPath = fullfile(idridDir, 'B. Disease Grading', '2. Groundtruths', 'a. IDRiD_Disease Grading_Training Labels.csv');
    % Previously a 200-image stratified subsample of the 413-image
    % training set -- capped only for feature-extraction RUNTIME, not data
    % scarcity (this project's own compareIntegratedVsSingleTechnique.m
    % ablation documented the cap this way from the start). Now the full
    % set, matching the test split's convention below: a combiner fit on
    % 200 images is materially less reliable than one fit on 413+, and the
    % extra ~9 minutes of extraction time is worth spending before
    % concluding anything about whether integration helps.
    maxN = Inf;
else
    imgDir = fullfile(idridDir, 'B. Disease Grading', '1. Original Images', 'b. Testing Set');
    csvPath = fullfile(idridDir, 'B. Disease Grading', '2. Groundtruths', 'b. IDRiD_Disease Grading_Testing Labels.csv');
    maxN = Inf; % use the full official test set
end

gradingTable = readtable(csvPath);
names = gradingTable.ImageName;
grades = gradingTable.RetinopathyGrade;
referableAll = double(grades >= 2);

rng(42); % matches SEED=42 in training/config.py
if isfinite(maxN) && numel(names) > maxN
    idx0 = find(referableAll == 0);
    idx1 = find(referableAll == 1);
    frac = maxN / numel(names);
    n0 = round(frac * numel(idx0));
    n1 = maxN - n0;
    n1 = min(n1, numel(idx1));
    keepIdx = sort([idx0(randperm(numel(idx0), n0)); idx1(randperm(numel(idx1), n1))]);
else
    keepIdx = (1:numel(names))';
end

n = numel(keepIdx);
features = nan(n, 14);
referable = referableAll(keepIdx);
imageNames = names(keepIdx);
valid = false(n, 1);

opts = defaultSegmentationConfig();

tic;
for k = 1:n
    imgId = imageNames{k};
    imgPath = fullfile(imgDir, [imgId '.jpg']);
    if ~isfile(imgPath)
        continue
    end
    try
        img = imread(imgPath);
        [vesselMask, vesselInfo] = segmentVessels(img, opts);
        odInfo = localizeOpticDisc(img, vesselMask, opts);
        foveaInfo = localizeFovea(img, odInfo, opts);
        [maMask, maInfo] = detectMicroaneurysms(img, opts);
        [exMask, exInfo] = detectHardExudates(img, opts);
        [heMask, heInfo] = detectHemorrhages(img, opts);
        [~, nvInfo] = detectNeovascularization(img, vesselMask, odInfo, opts);

        [~, ~, lesionImg] = computeLesionExclusionMask(img, opts);
        green = im2double(lesionImg(:, :, 2));
        lesionMask = maMask | exMask | heMask;
        radFeats = extractRadiomicFeatures(green, lesionMask, opts);

        features(k, :) = [
            vesselInfo.vesselDensity, ...
            odInfo.confidence, ...
            double(foveaInfo.found), ...
            log1p(maInfo.count), ...
            log1p(exInfo.count), ...
            log1p(heInfo.count), ...
            log1p(nvInfo.count), ...
            double(nvInfo.nvdCount > 0), ...
            radFeats
        ];
        valid(k) = true;
    catch err
        fprintf('  [%s] failed: %s\n', imgId, err.message);
    end

    if mod(k, 25) == 0
        fprintf('  %d/%d (%.1f s elapsed)\n', k, n, toc);
    end
end
elapsed = toc;

features = features(valid, :);
referable = referable(valid);
imageNames = imageNames(valid);

fprintf('\n[%s] Extracted features for %d/%d images in %.1f s (%.2f s/image)\n', ...
    SPLIT_NAME, nnz(valid), n, elapsed, elapsed / n);
fprintf('Referable-DR prevalence in this split: %.1f%% (%d/%d)\n', ...
    100 * mean(referable), sum(referable), numel(referable));

outPath = fullfile(setupPathsRoot, sprintf('structural_features_%s.mat', SPLIT_NAME));
save(outPath, 'features', 'referable', 'imageNames');
fprintf('Saved to %s\n', outPath);
