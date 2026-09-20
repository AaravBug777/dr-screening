% Sweeps VesselThresholdPercentile to find a value that improves thin-
% vessel recall on MAPLES-DR (diagnoseVesselMAPLESGap.m found the current
% 88th-percentile threshold catches only 38.6% of the thinnest (1-2px
% half-width) vessels, which are 76% of MAPLES-DR's annotated pixels)
% WITHOUT regressing the existing DRIVE validation (64.2% sens / 96.3%
% spec / 0.673 Dice) -- the same "validate against the FULL benchmark,
% not just the motivating case" discipline that caught a real regression
% during the optic-disc fix earlier this project (see
% matlab/segmentation/README.md's "Phase 3").

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
        maplesFiles{end+1} = fullfile(vesDirs{d}, listing(i).name); %#ok<AGROW>
    end
end

candidatePercentiles = [80 82 84 86 88];
baseOpts = defaultSegmentationConfig();

fprintf('%-8s %22s %28s\n', '', 'DRIVE (n=20)', 'MAPLES-DR (n=162)');
fprintf('%-8s %10s %10s %10s %10s %10s\n', 'Pctl', 'Sens', 'Spec', 'Dice', 'Sens(thin)', 'Dice');

for pctl = candidatePercentiles
    opts = baseOpts;
    opts.VesselThresholdPercentile = pctl;

    % --- DRIVE ---
    dSens = zeros(numel(driveFiles),1); dSpec = zeros(numel(driveFiles),1); dDice = zeros(numel(driveFiles),1);
    for k = 1:numel(driveFiles)
        imgFile = driveFiles(k).name;
        idStr = extractBefore(imgFile, '_training');
        img = imread(fullfile(driveImgDir, imgFile));
        gt = imread(fullfile(driveGtDir, [char(idStr) '_manual1.gif']));
        maskFile = dir(fullfile(driveMaskDir, [char(idStr) '_training_mask*']));
        driveMask = imread(fullfile(driveMaskDir, maskFile(1).name));
        gt = logical(gt(:,:,1) > 128); driveMask = logical(driveMask(:,:,1) > 128);
        vesselMask = segmentVessels(img, opts);
        tp = nnz(vesselMask & gt & driveMask); tn = nnz(~vesselMask & ~gt & driveMask);
        fp = nnz(vesselMask & ~gt & driveMask); fn = nnz(~vesselMask & gt & driveMask);
        dSens(k) = tp/max(1,tp+fn); dSpec(k) = tn/max(1,tn+fp); dDice(k) = 2*tp/max(1,2*tp+fp+fn);
    end

    % --- MAPLES-DR, thin-vessel-only recall + overall Dice ---
    mThinTP = 0; mThinTotal = 0; mTP = 0; mFP = 0; mFN = 0;
    for k = 1:numel(maplesFiles)
        gtPath = maplesFiles{k};
        [~, baseName, ~] = fileparts(gtPath);
        imgPath = fullfile(messidorImgDir, [baseName '.png']);
        if ~isfile(imgPath), continue; end
        img = imread(imgPath);
        gtNative = imread(gtPath) > 0;
        [fovMaskNative, ~] = computeFOVMask(img);
        vesselMask = segmentVessels(img, opts);
        [hl, wl] = size(vesselMask);
        gt = imresize(gtNative, [hl wl], 'nearest');
        fov = imresize(fovMaskNative, [hl wl], 'nearest');
        distMap = bwdist(~gt);
        gtVesselPx = gt & fov;
        thinPx = gtVesselPx & distMap < 2; % the diagnosed weak bin (<1-2px half-width)
        mThinTP = mThinTP + nnz(thinPx & vesselMask);
        mThinTotal = mThinTotal + nnz(thinPx);
        mTP = mTP + nnz(vesselMask & gt & fov); mFP = mFP + nnz(vesselMask & ~gt & fov); mFN = mFN + nnz(~vesselMask & gt & fov);
    end
    mThinRecall = mThinTP / max(1, mThinTotal);
    mDice = 2*mTP / max(1, 2*mTP + mFP + mFN);

    fprintf('%-8d %9.1f%% %9.1f%% %10.3f %9.1f%% %10.3f\n', pctl, ...
        100*mean(dSens), 100*mean(dSpec), mean(dDice), 100*mThinRecall, mDice);
end
