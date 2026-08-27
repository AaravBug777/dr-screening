% Diagnostic: print focus scores across a range of blur severities and real
% APTOS images, to calibrate defaultQualityConfig's Focus thresholds against
% actual numbers instead of guessing.
setupPathsRoot = fileparts(mfilename('fullpath'));
run(fullfile(setupPathsRoot, '..', 'setupPaths.m'));

sharp = tQualityAssessment.makeFundus(300, 130, 'texture', 'sharp');
fprintf('--- Synthetic sharp fundus, increasing blur sigma ---\n');
for sigma = [0, 0.5, 1, 1.5, 2, 2.5, 3, 4, 6, 8]
    if sigma == 0
        img = sharp;
    else
        img = imgaussfilt(sharp, sigma);
    end
    [mask, ~] = computeFOVMask(img);
    score = computeFocusScore(img, mask);
    fprintf('sigma=%.1f  focusScore=%.2f\n', sigma, score);
end

fprintf('\n--- Real APTOS sample images ---\n');
imageFolder = fullfile(setupPathsRoot, '..', '..', 'training', 'data', 'aptos2019', 'train_images');
if isfolder(imageFolder)
    files = dir(fullfile(imageFolder, '*.png'));
    rng(0);
    idx = randperm(numel(files), min(400, numel(files)));
    scores = zeros(numel(idx), 1);
    means = zeros(numel(idx), 1);
    cvs = zeros(numel(idx), 1);
    fovs = zeros(numel(idx), 1);
    cfg = defaultQualityConfig();
    for k = 1:numel(idx)
        f = files(idx(k));
        img = imread(fullfile(f.folder, f.name));
        [hh, ww, ~] = size(img);
        if max(hh, ww) > cfg.MaxWorkingDim
            img = imresize(img, cfg.MaxWorkingDim / max(hh, ww));
        end
        [mask, fovInfo] = computeFOVMask(img);
        scores(k) = computeFocusScore(img, mask);
        illum = computeIlluminationScore(img, mask);
        means(k) = illum.meanIntensity;
        cvs(k) = illum.uniformityCV;
        fovs(k) = fovInfo.areaFraction;
    end
    pcts = [1 5 10 25 50 75 90 95 99];
    fprintf('\n%-16s', 'percentile:'); fprintf('%8d', pcts); fprintf('\n');
    fprintf('%-16s', 'focus:');         fprintf('%8.2f', prctile(scores, pcts)); fprintf('\n');
    fprintf('%-16s', 'meanIntensity:'); fprintf('%8.1f', prctile(means, pcts)); fprintf('\n');
    fprintf('%-16s', 'uniformityCV:');  fprintf('%8.3f', prctile(cvs, pcts)); fprintf('\n');
    fprintf('%-16s', 'fovFraction:');   fprintf('%8.3f', prctile(fovs, pcts)); fprintf('\n');
else
    fprintf('APTOS folder not found at %s, skipping real-image diagnostics.\n', imageFolder);
end
