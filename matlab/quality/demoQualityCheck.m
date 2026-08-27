%DEMOQUALITYCHECK Visual smoke test: run the quality module on a few real images.
%   Script (not a function) — run directly from the MATLAB command window
%   after `setupPaths`. Picks a handful of images from the APTOS dataset
%   already downloaded for the Python training pipeline, runs
%   assessFundusQuality on each, and shows a montage: original vs (if
%   borderline) the enhanced version, titled with the verdict and reasons.
%
%   Adjust `imageFolder` if your data lives elsewhere.

imageFolder = fullfile('..', '..', 'training', 'data', 'aptos2019', 'train_images');
if ~isfolder(imageFolder)
    error('demoQualityCheck:noData', ...
        ['Expected APTOS images at %s (relative to matlab/quality/). ' ...
         'Adjust imageFolder in this script if your data lives elsewhere.'], imageFolder);
end

files = dir(fullfile(imageFolder, '*.png'));
if isempty(files)
    error('demoQualityCheck:noImages', 'No .png images found in %s', imageFolder);
end

numSamples = min(6, numel(files));
rng(0); % reproducible sample selection
sampleIdx = randperm(numel(files), numSamples);

opts = defaultQualityConfig();
figure('Name', 'Netra quality assessment demo', 'Position', [100 100 1400 700]);

for k = 1:numSamples
    f = files(sampleIdx(k));
    path = fullfile(f.folder, f.name);
    img = imread(path);
    report = assessFundusQuality(img, opts);

    fprintf('%s -> verdict=%s reasons=%s\n', f.name, report.verdict, strjoin(report.reasons, ', '));

    subplot(2, numSamples, k);
    imshow(img);
    title(sprintf('%s\n%s', f.name, report.verdict), 'Interpreter', 'none', 'FontSize', 8);

    subplot(2, numSamples, numSamples + k);
    if ~isempty(report.enhancedImage)
        imshow(report.enhancedImage);
        title('enhanced', 'FontSize', 8);
    else
        imshow(img);
        title(sprintf('focus=%.1f mean=%.0f', report.focusScore, report.illumination.meanIntensity), 'FontSize', 8);
    end
end

sgtitle('Top row: original (title = verdict) | Bottom row: enhanced (if borderline) or metrics');
