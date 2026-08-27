% Extracts the SAME 14-dim classical+radiomics structural feature vector
% extractStructuralFeatures.m produces for IDRiD, but for the 1,744
% real, adjudicated-label Messidor-2 images in
% training/outputs/messidor2_calibration_referable_predictions.json
% (build_messidor2_calibration_probs.py -- reused from an existing TTA
% logits cache, no new Python model inference needed).
%
% Why this exists: compareIntegratedVsSingleTechnique.m's combiner was
% previously fit on only 200 IDRiD images -- too small a calibration set
% to trust a "does integration help" verdict confidently. Combined with
% the full 413-image IDRiD training set (extractStructuralFeatures.m,
% now uncapped), this gives a ~2,157-image calibration set instead of 200
% -- real images, real adjudicated labels (Krause et al. 2018 for
% Messidor-2), not synthetic augmentation.
%
% Long-running (1,744 images at ~2.5s/image = ~70 minutes) -- saves a
% PARTIAL checkpoint every 100 images so a crash partway through doesn't
% lose everything already computed, matching the caution any single
% multi-hour unattended batch job deserves.
%
% Output format matches extractStructuralFeatures.m's .mat exactly
% (features, referable, imageNames) so the two can be concatenated
% directly by callers.

setupPathsRoot = fileparts(mfilename('fullpath'));
run(fullfile(setupPathsRoot, '..', 'setupPaths.m'));

jsonPath = fullfile(setupPathsRoot, '..', '..', 'training', 'outputs', 'messidor2_calibration_referable_predictions.json');
if ~isfile(jsonPath)
    error('extractMessidor2CalibrationFeatures:missingInput', ...
        'Missing %s -- run training/build_messidor2_calibration_probs.py first.', jsonPath);
end

predJson = jsondecode(fileread(jsonPath));
preds = predJson.predictions;
n = numel(preds);
fprintf('Extracting structural+radiomics features for %d Messidor-2 calibration images.\n', n);

% Fail fast, loudly, on a bad path convention rather than silently
% "succeeding" with 0 real images extracted -- exactly what happened the
% first time this ran: image_path was relative to PYTHON's working
% directory (training/), which resolved to nothing from MATLAB's own cwd,
% and every one of 1,744 images "failed" individually inside the per-image
% try/catch below, still producing a technically-valid-looking (but
% empty) output .mat. Checking the first 20 up front turns that into an
% immediate, unmissable error instead of a silent near-empty result
% discovered only much later.
sampleCheck = min(20, n);
missingCount = 0;
for i = 1:sampleCheck
    if ~isfile(preds(i).image_path)
        missingCount = missingCount + 1;
    end
end
if missingCount == sampleCheck
    error('extractMessidor2CalibrationFeatures:allPathsMissing', ...
        'All %d sampled image_path entries are missing (first: %s) -- this almost certainly means the paths in %s are relative to the wrong working directory. Fix build_messidor2_calibration_probs.py before rerunning this multi-hour extraction.', ...
        sampleCheck, preds(1).image_path, jsonPath);
end

opts = defaultSegmentationConfig();

features = nan(n, 14);
referable = nan(n, 1);
imageNames = cell(n, 1);
valid = false(n, 1);

outPath = fullfile(setupPathsRoot, 'messidor2_structural_features.mat');
partialPath = fullfile(setupPathsRoot, 'messidor2_structural_features_partial.mat');

tic;
for k = 1:n
    p = preds(k);
    imgPath = p.image_path;
    imageNames{k} = p.image;
    referable(k) = double(p.true_referable);

    if ~isfile(imgPath)
        fprintf('  [%s] missing image file, skipping: %s\n', p.image, imgPath);
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
        fprintf('  [%s] failed: %s\n', p.image, err.message);
    end

    if mod(k, 25) == 0
        fprintf('  %d/%d (%.1f s elapsed, %.2f s/image)\n', k, n, toc, toc / k);
    end
    if mod(k, 100) == 0
        save(partialPath, 'features', 'referable', 'imageNames', 'valid', 'k');
        fprintf('  [checkpoint saved at %d/%d]\n', k, n);
    end
end
elapsed = toc;

features = features(valid, :);
referable = referable(valid);
imageNames = imageNames(valid);

fprintf('\nExtracted features for %d/%d Messidor-2 images in %.1f s (%.2f s/image)\n', ...
    nnz(valid), n, elapsed, elapsed / n);
fprintf('Referable-DR prevalence: %.1f%% (%d/%d)\n', 100 * mean(referable), sum(referable), numel(referable));

save(outPath, 'features', 'referable', 'imageNames');
fprintf('Saved to %s\n', outPath);

if isfile(partialPath)
    delete(partialPath);
end
