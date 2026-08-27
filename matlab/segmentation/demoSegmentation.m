%DEMOSEGMENTATION Visual smoke test: vessel segmentation + OD/fovea localization on real images.
%   Script (not a function) — run directly from the MATLAB command window
%   after `setupPaths`. Picks a handful of images from the APTOS dataset,
%   runs the full segmentation pipeline, and shows a montage: original with
%   OD circle + fovea marker overlaid, alongside the vessel mask.

imageFolder = fullfile('..', '..', 'training', 'data', 'aptos2019', 'train_images');
if ~isfolder(imageFolder)
    error('demoSegmentation:noData', ...
        'Expected APTOS images at %s (relative to matlab/segmentation/).', imageFolder);
end

files = dir(fullfile(imageFolder, '*.png'));
numSamples = min(6, numel(files));
rng(2); % different seed from the quality demo, for variety
sampleIdx = randperm(numel(files), numSamples);

opts = defaultSegmentationConfig();
figure('Name', 'Netra segmentation demo', 'Position', [100 100 1400 700]);

for k = 1:numSamples
    f = files(sampleIdx(k));
    path = fullfile(f.folder, f.name);
    img = imread(path);
    [h0, w0, ~] = size(img);
    if max(h0, w0) > opts.MaxWorkingDim
        img = imresize(img, opts.MaxWorkingDim / max(h0, w0));
    end

    [vesselMask, vInfo] = segmentVessels(img, opts);
    odInfo = localizeOpticDisc(img, vesselMask, opts);
    foveaInfo = localizeFovea(img, odInfo, opts);

    fprintf('%s -> vesselDensity=%.3f  OD=(%.0f,%.0f) r=%.0f conf=%.3f  fovea=(%.0f,%.0f) found=%d\n', ...
        f.name, vInfo.vesselDensity, odInfo.center(1), odInfo.center(2), odInfo.radius, odInfo.confidence, ...
        foveaInfo.center(1), foveaInfo.center(2), foveaInfo.found);

    subplot(2, numSamples, k);
    imshow(img);
    hold on;
    viscircles(odInfo.center, odInfo.radius, 'Color', 'y', 'LineWidth', 1);
    if foveaInfo.found
        plot(foveaInfo.center(1), foveaInfo.center(2), 'r+', 'MarkerSize', 12, 'LineWidth', 2);
    end
    hold off;
    title(sprintf('%s', f.name), 'Interpreter', 'none', 'FontSize', 8);

    subplot(2, numSamples, numSamples + k);
    imshow(vesselMask);
    title(sprintf('vessels (%.1f%%)', 100 * vInfo.vesselDensity), 'FontSize', 8);
end

sgtitle('Top: OD (yellow circle) + fovea (red +) | Bottom: vessel mask');
