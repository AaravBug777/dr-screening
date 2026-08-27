% Quantitative validation of localizeOpticDisc/localizeFovea against IDRiD's
% expert-labeled OD/fovea center coordinates (413 training images).
%
% localizeOpticDisc/localizeFovea internally downscale to MaxWorkingDim
% before searching, so returned centers are in *working-resolution*
% coordinates -- this script scales them back up to native-image coordinates
% before comparing against the ground-truth CSV, which is in native pixels.
%
% Standard metric in the OD-localization literature: success rate = fraction
% of images where the predicted center falls within 1 optic-disc-diameter of
% the true center. We report that plus raw pixel and OD-diameter-normalized
% error statistics.
setupPathsRoot = fileparts(mfilename('fullpath'));
run(fullfile(setupPathsRoot, '..', 'setupPaths.m'));

idridDir = fullfile(setupPathsRoot, '..', '..', 'training', 'data', 'idrid');
imgDir = fullfile(idridDir, 'C. Localization', '1. Original Images', 'a. Training Set');
odCsvPath = fullfile(idridDir, 'C. Localization', '2. Groundtruths', '1. Optic Disc Center Location', 'a. IDRiD_OD_Center_Training Set_Markups.csv');
foveaCsvPath = fullfile(idridDir, 'C. Localization', '2. Groundtruths', '2. Fovea Center Location', 'IDRiD_Fovea_Center_Training Set_Markups.csv');

odTable = readtable(odCsvPath);
foveaTable = readtable(foveaCsvPath);

opts = defaultSegmentationConfig();

n = height(odTable);
odErrorPx = nan(n, 1);
odErrorDiam = nan(n, 1);
foveaErrorPx = nan(n, 1);
foveaErrorDiam = nan(n, 1);
foveaWasFound = false(n, 1);

tic;
for k = 1:n
    imgId = odTable.ImageNo{k};
    imgPath = fullfile(imgDir, [imgId '.jpg']);
    if ~isfile(imgPath)
        continue
    end
    img = imread(imgPath);
    [h0, w0, ~] = size(img);
    scale = 1;
    if max(h0, w0) > opts.MaxWorkingDim
        scale = opts.MaxWorkingDim / max(h0, w0);
    end

    trueOD = [odTable.X_Coordinate(k), odTable.Y_Coordinate(k)];
    foveaRow = strcmp(foveaTable.ImageNo, imgId);
    trueFovea = [foveaTable.X_Coordinate(foveaRow), foveaTable.Y_Coordinate(foveaRow)];

    vesselMask = segmentVessels(img, opts);
    odInfo = localizeOpticDisc(img, vesselMask, opts);
    foveaInfo = localizeFovea(img, odInfo, opts);

    % Scale predicted (working-resolution) coordinates back to native pixels.
    predOD = odInfo.center / scale;
    odDiameterNative = (odInfo.radius * 2) / scale;

    odErrorPx(k) = hypot(predOD(1) - trueOD(1), predOD(2) - trueOD(2));
    odErrorDiam(k) = odErrorPx(k) / odDiameterNative;

    foveaWasFound(k) = foveaInfo.found;
    if foveaInfo.found && ~isempty(trueFovea)
        predFovea = foveaInfo.center / scale;
        foveaErrorPx(k) = hypot(predFovea(1) - trueFovea(1), predFovea(2) - trueFovea(2));
        foveaErrorDiam(k) = foveaErrorPx(k) / odDiameterNative;
    end

    if mod(k, 100) == 0
        fprintf('  %d/%d (%.1f s elapsed)\n', k, n, toc);
    end
end
elapsed = toc;

validOD = ~isnan(odErrorDiam);
validFovea = ~isnan(foveaErrorDiam);

fprintf('\nProcessed %d images in %.1f s (%.3f s/image)\n', n, elapsed, elapsed / n);
fprintf('\n--- Optic disc localization (n=%d) ---\n', nnz(validOD));
fprintf('error (OD diameters): mean=%.3f median=%.3f p90=%.3f max=%.3f\n', ...
    mean(odErrorDiam(validOD)), median(odErrorDiam(validOD)), prctile(odErrorDiam(validOD), 90), max(odErrorDiam(validOD)));
fprintf('success rate (error < 1 OD diameter): %.1f%%\n', 100 * mean(odErrorDiam(validOD) < 1));

fprintf('\n--- Fovea localization (found: %d/%d, %.1f%%) ---\n', nnz(foveaWasFound), n, 100 * mean(foveaWasFound));
fprintf('error (OD diameters), among found: mean=%.3f median=%.3f p90=%.3f max=%.3f\n', ...
    mean(foveaErrorDiam(validFovea)), median(foveaErrorDiam(validFovea)), prctile(foveaErrorDiam(validFovea), 90), max(foveaErrorDiam(validFovea)));
fprintf('success rate (error < 1 OD diameter): %.1f%%\n', 100 * mean(foveaErrorDiam(validFovea) < 1));
fprintf('success rate (error < 2 OD diameters): %.1f%%\n', 100 * mean(foveaErrorDiam(validFovea) < 2));
