% Tests whether segmentVesselsMultiScale.m's per-band fusion recovers
% thin-vessel sensitivity WITHOUT the small DRIVE cost the global
% threshold retune (88->86) needed -- same VesselThresholdPercentile=86
% used both here and in the single-scale baseline, so this isolates the
% fusion-strategy change specifically rather than conflating it with
% another threshold change. Compares directly against the already-
% established single-scale numbers at the same threshold (DRIVE: 69.2%
% sens / 94.9% spec / 0.672 Dice; MAPLES-DR: thin-vessel recall 48.3%,
% Dice 0.645).

setupPathsRoot = fileparts(mfilename('fullpath'));
run(fullfile(setupPathsRoot, '..', 'setupPaths.m'));

driveDir = fullfile(setupPathsRoot, '..', '..', 'training', 'data', 'drive', 'DRIVE', 'training');
driveImgDir = fullfile(driveDir, 'images');
driveGtDir = fullfile(driveDir, '1st_manual');
driveMaskDir = fullfile(driveDir, 'mask');
driveFiles = dir(fullfile(driveImgDir, '*.tif'));

maplesDir = fullfile(setupPathsRoot, '..', '..', 'training', 'data', 'maples_dr', 'MAPLES-DR');
messidorImgDir = fullfile(setupPathsRoot, '..', '..', 'training', 'data', 'messidor2', 'IMAGES');
vesDirs = {fullfile(maplesDir, 'train', 'Vessels'), fullfile(maplesDir, 'test', 'Vessels')};
maplesFiles = {};
for d = 1:numel(vesDirs)
    listing = dir(fullfile(vesDirs{d}, '*.png'));
    for i = 1:numel(listing)
        maplesFiles{end+1} = listing(i).name; %#ok<AGROW>
    end
end

opts = defaultSegmentationConfig(); % VesselThresholdPercentile already 86 -- unchanged from the single-scale baseline

fprintf('=== DRIVE (n=%d) ===\n', numel(driveFiles));
dSens = zeros(numel(driveFiles),1); dSpec = zeros(numel(driveFiles),1); dDice = zeros(numel(driveFiles),1);
for k = 1:numel(driveFiles)
    imgFile = driveFiles(k).name;
    idStr = extractBefore(imgFile, '_training');
    img = imread(fullfile(driveImgDir, imgFile));
    gt = imread(fullfile(driveGtDir, [char(idStr) '_manual1.gif']));
    maskFile = dir(fullfile(driveMaskDir, [char(idStr) '_training_mask*']));
    driveMask = imread(fullfile(driveMaskDir, maskFile(1).name));
    gt = logical(gt(:,:,1) > 128); driveMask = logical(driveMask(:,:,1) > 128);
    vesselMask = segmentVesselsMultiScale(img, opts);
    tp = nnz(vesselMask & gt & driveMask); tn = nnz(~vesselMask & ~gt & driveMask);
    fp = nnz(vesselMask & ~gt & driveMask); fn = nnz(~vesselMask & gt & driveMask);
    dSens(k) = tp/max(1,tp+fn); dSpec(k) = tn/max(1,tn+fp); dDice(k) = 2*tp/max(1,2*tp+fp+fn);
    if mod(k,5)==0, fprintf('  %d/%d\n', k, numel(driveFiles)); end
end
fprintf('DRIVE multi-scale: sens=%.1f%% spec=%.1f%% Dice=%.3f  (single-scale baseline: 69.2%%/94.9%%/0.672)\n\n', ...
    100*mean(dSens), 100*mean(dSpec), mean(dDice));

fprintf('=== MAPLES-DR (n<=%d) ===\n', numel(maplesFiles));
mThinTP = 0; mThinTotal = 0; mTP = 0; mFP = 0; mFN = 0;
matched = 0;
tic;
for k = 1:numel(maplesFiles)
    gtPath = fullfile(vesDirs{1}, maplesFiles{k});
    if ~isfile(gtPath), gtPath = fullfile(vesDirs{2}, maplesFiles{k}); end
    [~, baseName, ~] = fileparts(maplesFiles{k});
    imgPath = fullfile(messidorImgDir, [baseName '.png']);
    if ~isfile(imgPath), continue; end
    matched = matched + 1;
    img = imread(imgPath);
    gtNative = imread(gtPath) > 0;
    [fovMaskNative, ~] = computeFOVMask(img);
    vesselMask = segmentVesselsMultiScale(img, opts);
    [hl, wl] = size(vesselMask);
    gt = imresize(gtNative, [hl wl], 'nearest');
    fov = imresize(fovMaskNative, [hl wl], 'nearest');
    distMap = bwdist(~gt);
    gtVesselPx = gt & fov;
    thinPx = gtVesselPx & distMap < 2;
    mThinTP = mThinTP + nnz(thinPx & vesselMask);
    mThinTotal = mThinTotal + nnz(thinPx);
    mTP = mTP + nnz(vesselMask & gt & fov); mFP = mFP + nnz(vesselMask & ~gt & fov); mFN = mFN + nnz(~vesselMask & gt & fov);
    if mod(matched, 25) == 0, fprintf('  %d matched (%.1f s elapsed)\n', matched, toc); end
end
mThinRecall = mThinTP / max(1, mThinTotal);
mDice = 2*mTP / max(1, 2*mTP + mFP + mFN);
fprintf('MAPLES-DR multi-scale: thin-vessel recall=%.1f%% Dice=%.3f  (single-scale baseline: 48.3%%/0.645)\n\n', 100*mThinRecall, mDice);

fprintf('=== VERDICT ===\n');
if mean(dDice) >= 0.670 && mDice > 0.645
    fprintf('Multi-scale fusion IMPROVES MAPLES-DR without costing DRIVE -- a real win, adopt it.\n');
elseif mDice > 0.645
    fprintf('Multi-scale fusion improves MAPLES-DR but at a DRIVE cost -- compare the actual tradeoff numbers above before deciding, same as the threshold retune.\n');
else
    fprintf('Multi-scale fusion did NOT clearly beat the single-scale + retuned-threshold approach -- report this honestly, the hypothesis did not pan out.\n');
end
