% Validates the vessel-aware fovea scoring that's now MERGED into
% production localizeFovea.m (called without a 4th vesselMask argument =
% pre-merge darkness-only behavior; with it = the adopted, improved
% behavior) against TWO independent ground-truth sources: IDRiD's fovea
% center markups (413 images) AND MAPLES-DR's Macula category (137
% images, a previously-UNUSED MAPLES-DR annotation category -- see
% segmentation/README.md's "was any dataset not used to its full
% potential" note). Runs vessel/OD detection ONCE per image and feeds the
% SAME inputs to both calls, so any difference in outcome is attributable
% to the fovea logic itself, not to different upstream detection noise.
% Kept as a standing regression check, not a one-time validation run --
% rerun this if localizeFovea.m's fovea logic ever changes again.

setupPathsRoot = fileparts(mfilename('fullpath'));
run(fullfile(setupPathsRoot, '..', 'setupPaths.m'));

idridDir = fullfile(setupPathsRoot, '..', '..', 'training', 'data', 'idrid');
idridImgDir = fullfile(idridDir, 'C. Localization', '1. Original Images', 'a. Training Set');
odCsvPath = fullfile(idridDir, 'C. Localization', '2. Groundtruths', '1. Optic Disc Center Location', 'a. IDRiD_OD_Center_Training Set_Markups.csv');
foveaCsvPath = fullfile(idridDir, 'C. Localization', '2. Groundtruths', '2. Fovea Center Location', 'IDRiD_Fovea_Center_Training Set_Markups.csv');
odTable = readtable(odCsvPath);
foveaTable = readtable(foveaCsvPath);

maplesDir = fullfile(setupPathsRoot, '..', '..', 'training', 'data', 'maples_dr', 'MAPLES-DR');
messidorImgDir = fullfile(setupPathsRoot, '..', '..', 'training', 'data', 'messidor2', 'IMAGES');
maculaDirs = {fullfile(maplesDir, 'train', 'Macula'), fullfile(maplesDir, 'test', 'Macula')};
maculaFiles = {};
for d = 1:numel(maculaDirs)
    listing = dir(fullfile(maculaDirs{d}, '*.png'));
    for i = 1:numel(listing)
        maculaFiles{end+1} = listing(i).name; %#ok<AGROW>
    end
end

opts = defaultSegmentationConfig();

fprintf('=== IDRiD (n=%d) ===\n', height(odTable));
prodErrDiam = nan(height(odTable), 1);
expErrDiam = nan(height(odTable), 1);
tic;
for k = 1:height(odTable)
    imgId = odTable.ImageNo{k};
    imgPath = fullfile(idridImgDir, [imgId '.jpg']);
    if ~isfile(imgPath), continue; end
    img = imread(imgPath);
    [h0, w0, ~] = size(img);
    scale = 1;
    if max(h0, w0) > opts.MaxWorkingDim
        scale = opts.MaxWorkingDim / max(h0, w0);
    end

    trueOD = [odTable.X_Coordinate(k), odTable.Y_Coordinate(k)];
    foveaRow = strcmp(foveaTable.ImageNo, imgId);
    trueFovea = [foveaTable.X_Coordinate(foveaRow), foveaTable.Y_Coordinate(foveaRow)];
    if isempty(trueFovea), continue; end

    [vesselMask, ~] = segmentVessels(img, opts);
    odInfo = localizeOpticDisc(img, vesselMask, opts);
    odDiameterNative = (odInfo.radius * 2) / scale;

    prodFoveaInfo = localizeFovea(img, odInfo, opts); % no vesselMask = darkness-only, the pre-merge behavior
    expFoveaInfo = localizeFovea(img, odInfo, opts, vesselMask); % WITH vesselMask = the merged, adopted behavior

    if prodFoveaInfo.found
        predFovea = prodFoveaInfo.center / scale;
        prodErrDiam(k) = hypot(predFovea(1)-trueFovea(1), predFovea(2)-trueFovea(2)) / odDiameterNative;
    end
    if expFoveaInfo.found
        predFovea = expFoveaInfo.center / scale;
        expErrDiam(k) = hypot(predFovea(1)-trueFovea(1), predFovea(2)-trueFovea(2)) / odDiameterNative;
    end

    if mod(k, 50) == 0, fprintf('  %d/%d (%.1f s elapsed)\n', k, height(odTable), toc); end
end
validProd = ~isnan(prodErrDiam); validExp = ~isnan(expErrDiam);
fprintf('Production localizeFovea:   success(<1 diam)=%.1f%%  mean err=%.3f  (n=%d)\n', ...
    100*mean(prodErrDiam(validProd)<1), mean(prodErrDiam(validProd)), nnz(validProd));
fprintf('Vessel-aware (experimental): success(<1 diam)=%.1f%%  mean err=%.3f  (n=%d)\n\n', ...
    100*mean(expErrDiam(validExp)<1), mean(expErrDiam(validExp)), nnz(validExp));

fprintf('=== MAPLES-DR Macula (n<=%d, previously unused category) ===\n', numel(maculaFiles));
prodErrDiam2 = []; expErrDiam2 = [];
matched = 0;
tic;
for k = 1:numel(maculaFiles)
    fname = maculaFiles{k};
    [~, baseName, ~] = fileparts(fname);
    imgPath = fullfile(messidorImgDir, [baseName '.png']);
    if ~isfile(imgPath), continue; end
    gtPath = fullfile(maculaDirs{1}, fname);
    if ~isfile(gtPath), gtPath = fullfile(maculaDirs{2}, fname); end
    gtMask = imread(gtPath) > 0;
    if ~any(gtMask(:)), continue; end
    matched = matched + 1;

    img = imread(imgPath);
    [h0, w0, ~] = size(img);
    scale = 1;
    if max(h0, w0) > opts.MaxWorkingDim
        scale = opts.MaxWorkingDim / max(h0, w0);
    end
    propsMacula = regionprops(gtMask, 'Centroid');
    trueFovea = propsMacula(1).Centroid;

    [vesselMask, ~] = segmentVessels(img, opts);
    odInfo = localizeOpticDisc(img, vesselMask, opts);
    odDiameterNative = (odInfo.radius * 2) / scale;

    prodFoveaInfo = localizeFovea(img, odInfo, opts); % no vesselMask = darkness-only, the pre-merge behavior
    expFoveaInfo = localizeFovea(img, odInfo, opts, vesselMask); % WITH vesselMask = the merged, adopted behavior

    if prodFoveaInfo.found
        predFovea = prodFoveaInfo.center / scale;
        prodErrDiam2(end+1) = hypot(predFovea(1)-trueFovea(1), predFovea(2)-trueFovea(2)) / odDiameterNative; %#ok<AGROW>
    end
    if expFoveaInfo.found
        predFovea = expFoveaInfo.center / scale;
        expErrDiam2(end+1) = hypot(predFovea(1)-trueFovea(1), predFovea(2)-trueFovea(2)) / odDiameterNative; %#ok<AGROW>
    end

    if mod(matched, 25) == 0, fprintf('  %d matched (%.1f s elapsed)\n', matched, toc); end
end
fprintf('Production localizeFovea:   success(<1 diam)=%.1f%%  mean err=%.3f  (n=%d)\n', ...
    100*mean(prodErrDiam2<1), mean(prodErrDiam2), numel(prodErrDiam2));
fprintf('Vessel-aware (experimental): success(<1 diam)=%.1f%%  mean err=%.3f  (n=%d)\n\n', ...
    100*mean(expErrDiam2<1), mean(expErrDiam2), numel(expErrDiam2));

fprintf('=== VERDICT ===\n');
idridWin = mean(expErrDiam(validExp)<1) > mean(prodErrDiam(validProd)<1);
maplesWin = mean(expErrDiam2<1) > mean(prodErrDiam2<1);
if idridWin && maplesWin
    fprintf('Vessel-aware scoring improves fovea localization on BOTH datasets -- adopt it.\n');
elseif ~idridWin && ~maplesWin
    fprintf('Vessel-aware scoring does NOT improve fovea localization on either dataset -- report honestly, do not adopt.\n');
else
    fprintf('Mixed result: helps one dataset, not the other -- report honestly, do not adopt without a clearer signal.\n');
end
