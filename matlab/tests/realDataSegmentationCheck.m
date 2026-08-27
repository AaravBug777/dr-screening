% Real-data sanity check: run the segmentation pipeline over a sample of
% real APTOS images and print summary stats. No ground truth to score
% against yet (that's what DRIVE/IDRiD are for) -- this just checks the
% outputs are in a plausible range and nothing crashes/degenerates on real
% photographs the way it might on clean synthetic ones.
setupPathsRoot = fileparts(mfilename('fullpath'));
run(fullfile(setupPathsRoot, '..', 'setupPaths.m'));

imageFolder = fullfile(setupPathsRoot, '..', '..', 'training', 'data', 'aptos2019', 'train_images');
files = dir(fullfile(imageFolder, '*.png'));
rng(3);
n = min(60, numel(files));
idx = randperm(numel(files), n);

opts = defaultSegmentationConfig();
vesselDensities = zeros(n, 1);
odConfidences = zeros(n, 1);
foveaFound = false(n, 1);
odFoveaDist = zeros(n, 1);

tic;
for k = 1:n
    f = files(idx(k));
    img = imread(fullfile(f.folder, f.name));
    [h0, w0, ~] = size(img);
    if max(h0, w0) > opts.MaxWorkingDim
        img = imresize(img, opts.MaxWorkingDim / max(h0, w0));
    end
    [vesselMask, vInfo] = segmentVessels(img, opts);
    odInfo = localizeOpticDisc(img, vesselMask, opts);
    foveaInfo = localizeFovea(img, odInfo, opts);

    vesselDensities(k) = vInfo.vesselDensity;
    odConfidences(k) = odInfo.confidence;
    foveaFound(k) = foveaInfo.found;
    if foveaInfo.found
        odFoveaDist(k) = hypot(foveaInfo.center(1) - odInfo.center(1), foveaInfo.center(2) - odInfo.center(2)) / (2 * odInfo.radius);
    else
        odFoveaDist(k) = NaN;
    end
end
elapsed = toc;

fprintf('Processed %d real images in %.1f s (%.3f s/image)\n', n, elapsed, elapsed / n);
fprintf('vessel density:  min=%.3f median=%.3f max=%.3f\n', min(vesselDensities), median(vesselDensities), max(vesselDensities));
fprintf('OD confidence:   min=%.3f median=%.3f max=%.3f\n', min(odConfidences), median(odConfidences), max(odConfidences));
fprintf('fovea found:     %d/%d (%.0f%%)\n', nnz(foveaFound), n, 100 * nnz(foveaFound) / n);
fprintf('OD-fovea distance (in OD diameters), among found: min=%.2f median=%.2f max=%.2f\n', ...
    min(odFoveaDist(foveaFound)), median(odFoveaDist(foveaFound)), max(odFoveaDist(foveaFound)));
