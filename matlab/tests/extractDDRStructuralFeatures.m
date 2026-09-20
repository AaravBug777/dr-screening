% DDR-scale extension of extractStructuralFeatures.m: extracts the SAME
% 14-dim classical structural feature vector (see that script's docstring
% for the full feature list and rationale) for the stratified DDR sample
% training/predict_ddr_referable.py already selected and wrote to
% outputs/ddr_sample_images.csv -- deliberately reading THAT file rather
% than re-sampling independently here, since MATLAB's and NumPy's RNGs
% don't produce the same sequence from a shared seed, which would silently
% misalign the DL-side and structural-side image sets for
% compareIntegratedVsSingleTechnique.m's DDR section.
%
% Purpose: a third, fully independent held-out evaluation of the brief's
% "integrated pipeline outperforms any single technique" claim (see
% compareIntegratedVsSingleTechnique.m's DDR section) -- these 2000 images
% are never used to fit anything (not the DL model, not its TTA
% temperature/threshold, not the structural classifier, not the
% probability combiner), purely evaluated.
%
% Sample size (2000, not the full 12,522-image DDR grading set) is a
% deliberate cap for MATLAB extraction RUNTIME, the same kind of cap
% extractStructuralFeatures.m's own docstring already documents for
% IDRiD-train (previously 200 images, later raised to the full 413) --
% not data scarcity. At the ~1.3 s/image this pipeline measured on IDRiD,
% the full DDR set would take several hours; 2000 images (already ~19x
% IDRiD's official 103-image test set) is a large, honestly-disclosed
% middle ground, not the theoretical maximum.

setupPathsRoot = fileparts(mfilename('fullpath'));
run(fullfile(setupPathsRoot, '..', 'setupPaths.m'));

ddrDir = fullfile(setupPathsRoot, '..', '..', 'training', 'data', 'ddr');
imgDir = fullfile(ddrDir, 'DR_grading', 'DR_grading');
sampleCsvPath = fullfile(setupPathsRoot, '..', '..', 'training', 'outputs', 'ddr_sample_images.csv');

if ~isfile(sampleCsvPath)
    error('extractDDRStructuralFeatures:missingSample', ...
        'Missing %s -- run training/predict_ddr_referable.py first (it writes this sample list).', sampleCsvPath);
end

sampleTable = readtable(sampleCsvPath);
names = sampleTable.id_code;
grades = sampleTable.diagnosis;
referableAll = double(grades >= 2);

n = numel(names);
features = nan(n, 14);
referable = referableAll;
imageNames = cell(n, 1);
valid = false(n, 1);

opts = defaultSegmentationConfig();

tic;
for k = 1:n
    imgFile = names{k};
    [~, stem, ~] = fileparts(imgFile); % strip extension, matching predict_ddr_referable.py's
                                         % "image" key convention (extension-free), so
                                         % compareIntegratedVsSingleTechnique.m's intersect()
                                         % join works the same way it does for IDRiD.
    imgPath = fullfile(imgDir, imgFile);
    if ~isfile(imgPath)
        continue
    end
    try
        img = imread(imgPath);
        [vesselMask, vesselInfo] = segmentVessels(img, opts);
        odInfo = localizeOpticDisc(img, vesselMask, opts);
        foveaInfo = localizeFovea(img, odInfo, opts, vesselMask);
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
        imageNames{k} = stem;
        valid(k) = true;
    catch err
        fprintf('  [%s] failed: %s\n', imgFile, err.message);
    end

    if mod(k, 50) == 0
        fprintf('  %d/%d (%.1f s elapsed)\n', k, n, toc);
    end
end
elapsed = toc;

features = features(valid, :);
referable = referable(valid);
imageNames = imageNames(valid);

fprintf('\n[ddr] Extracted features for %d/%d images in %.1f s (%.2f s/image)\n', ...
    nnz(valid), n, elapsed, elapsed / n);
fprintf('Referable-DR prevalence in this sample: %.1f%% (%d/%d)\n', ...
    100 * mean(referable), sum(referable), numel(referable));

outPath = fullfile(setupPathsRoot, 'structural_features_ddr.mat');
save(outPath, 'features', 'referable', 'imageNames');
fprintf('Saved to %s\n', outPath);
