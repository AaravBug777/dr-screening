% Sweep vesselness threshold operating points against DRIVE ground truth.
% Computes the (expensive) fibermetric response once per image, then cheaply
% re-thresholds at several percentiles to find a better sensitivity/
% specificity trade-off than the current Otsu default.
setupPathsRoot = fileparts(mfilename('fullpath'));
run(fullfile(setupPathsRoot, '..', 'setupPaths.m'));

driveDir = fullfile(setupPathsRoot, '..', '..', 'training', 'data', 'drive', 'DRIVE', 'training');
imgDir = fullfile(driveDir, 'images');
gtDir = fullfile(driveDir, '1st_manual');
maskDir = fullfile(driveDir, 'mask');

files = dir(fullfile(imgDir, '*.tif'));
n = numel(files);
opts = defaultSegmentationConfig();

responses = cell(n, 1);
masks = cell(n, 1);
gts = cell(n, 1);

fprintf('Computing vesselness response for %d images...\n', n);
tic;
for k = 1:n
    imgFile = files(k).name;
    idStr = extractBefore(imgFile, '_training');
    img = imread(fullfile(imgDir, imgFile));
    gt = imread(fullfile(gtDir, [char(idStr) '_manual1.gif']));
    driveMaskFile = dir(fullfile(maskDir, [char(idStr) '_training_mask*']));
    driveMask = imread(fullfile(maskDir, driveMaskFile(1).name));

    [fovMask, ~] = computeFOVMask(img);
    green = im2double(img(:, :, 2));
    sigma = max(1, size(green, 1) / 10);
    background = imgaussfilt(green, sigma);
    normalized = min(max(green - background + 0.5, 0), 1);
    inverted = zeros(size(normalized));
    inverted(fovMask) = 1 - normalized(fovMask);
    response = fibermetric(inverted, opts.VesselThicknessRange, 'ObjectPolarity', 'bright');
    response(~fovMask) = 0;

    responses{k} = response;
    masks{k} = logical(driveMask(:, :, 1) > 128);
    gts{k} = logical(gt(:, :, 1) > 128);
end
fprintf('Done in %.1f s\n\n', toc);

percentiles = [70 75 80 85 88 90 92 95];
fprintf('%-6s %10s %10s %10s %10s\n', 'pctl', 'sens', 'spec', 'acc', 'dice');
for p = percentiles
    sens = zeros(n, 1); spec = zeros(n, 1); acc = zeros(n, 1); dice = zeros(n, 1);
    for k = 1:n
        response = responses{k};
        evalMask = masks{k};
        gt = gts{k};
        vals = response(evalMask);
        level = prctile(vals, p);
        vesselMask = response > level & evalMask;

        tp = nnz(vesselMask & gt & evalMask);
        tn = nnz(~vesselMask & ~gt & evalMask);
        fp = nnz(vesselMask & ~gt & evalMask);
        fn = nnz(~vesselMask & gt & evalMask);

        sens(k) = tp / max(1, tp + fn);
        spec(k) = tn / max(1, tn + fp);
        acc(k) = (tp + tn) / max(1, nnz(evalMask));
        dice(k) = 2 * tp / max(1, (2 * tp + fp + fn));
    end
    fprintf('%-6d %10.3f %10.3f %10.3f %10.3f\n', p, mean(sens), mean(spec), mean(acc), mean(dice));
end
