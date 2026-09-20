% Applies the SAME two-dataset-sweep method that fixed vessels and
% exudates to the two remaining lesion detectors whose thresholds have
% (as far as this project's history shows) only ever been tuned against
% IDRiD alone: microaneurysms (MAThresholdPercentile=98) and hemorrhages
% (HemorrhageThresholdPercentile=97). Sweeps both together in one pass
% per image (same images, same ground-truth structure) rather than two
% separate scripts re-reading the same files twice.

setupPathsRoot = fileparts(mfilename('fullpath'));
run(fullfile(setupPathsRoot, '..', 'setupPaths.m'));

idridDir = fullfile(setupPathsRoot, '..', '..', 'training', 'data', 'idrid', 'A. Segmentation');
idridImgDir = fullfile(idridDir, '1. Original Images', 'a. Training Set');
idridMaDir = fullfile(idridDir, '2. All Segmentation Groundtruths', 'a. Training Set', '1. Microaneurysms');
idridHeDir = fullfile(idridDir, '2. All Segmentation Groundtruths', 'a. Training Set', '2. Haemorrhages');
idridMaFiles = dir(fullfile(idridMaDir, '*.tif'));

maplesDir = fullfile(setupPathsRoot, '..', '..', 'training', 'data', 'maples_dr', 'MAPLES-DR');
messidorImgDir = fullfile(setupPathsRoot, '..', '..', 'training', 'data', 'messidor2', 'IMAGES');
maDirs = {fullfile(maplesDir, 'train', 'Microaneurysms'), fullfile(maplesDir, 'test', 'Microaneurysms')};
heDirs = {fullfile(maplesDir, 'train', 'Hemorrhages'), fullfile(maplesDir, 'test', 'Hemorrhages')};
maplesFiles = {};
for d = 1:numel(maDirs)
    listing = dir(fullfile(maDirs{d}, '*.png'));
    for i = 1:numel(listing)
        maplesFiles{end+1} = listing(i).name; %#ok<AGROW>
    end
end

baseOpts = defaultSegmentationConfig();
maPctls = [92 94 96 98];
hePctls = [92 94 96 97];

fprintf('=== MICROANEURYSMS (current default: 98) ===\n');
fprintf('%-8s %20s %24s\n', '', 'IDRiD (n<=54)', 'MAPLES-DR (n<=162)');
fprintf('%-8s %10s %10s %10s %10s\n', 'Pctl', 'Dice', 'LesionHit', 'Dice', 'LesionHit');
for pctl = maPctls
    opts = baseOpts;
    opts.MAThresholdPercentile = pctl;

    iDice = []; iHit = [];
    for k = 1:numel(idridMaFiles)
        [~, idStr, ~] = fileparts(idridMaFiles(k).name);
        idStr = erase(idStr, '_MA');
        imgPath = fullfile(idridImgDir, [idStr '.jpg']);
        if ~isfile(imgPath), continue; end
        img = imread(imgPath);
        gtNative = imread(fullfile(idridMaDir, idridMaFiles(k).name)) > 0;
        [fovMask, ~] = computeFOVMask(img);
        [maMask, ~] = detectMicroaneurysms(img, opts);
        [hl, wl] = size(maMask);
        gt = imresize(gtNative(:,:,1), [hl wl], 'nearest');
        fov = imresize(fovMask, [hl wl], 'nearest');
        tp = nnz(maMask & gt & fov); fp = nnz(maMask & ~gt & fov); fn = nnz(~maMask & gt & fov);
        iDice(end+1) = 2*tp/max(1,2*tp+fp+fn); %#ok<AGROW>
        gtCC = bwconncomp(gt);
        if gtCC.NumObjects > 0
            hits = 0;
            for L = 1:gtCC.NumObjects
                if any(maMask(gtCC.PixelIdxList{L})), hits = hits+1; end
            end
            iHit(end+1) = hits/gtCC.NumObjects; %#ok<AGROW>
        end
    end

    mDice = []; mHit = [];
    for k = 1:numel(maplesFiles)
        fname = maplesFiles{k};
        [~, baseName, ~] = fileparts(fname);
        imgPath = fullfile(messidorImgDir, [baseName '.png']);
        if ~isfile(imgPath), continue; end
        gtPath = fullfile(maDirs{1}, fname);
        if ~isfile(gtPath), gtPath = fullfile(maDirs{2}, fname); end
        img = imread(imgPath);
        gtNative = imread(gtPath) > 0;
        [fovMask, ~] = computeFOVMask(img);
        [maMask, ~] = detectMicroaneurysms(img, opts);
        [hl, wl] = size(maMask);
        gt = imresize(gtNative, [hl wl], 'nearest');
        fov = imresize(fovMask, [hl wl], 'nearest');
        tp = nnz(maMask & gt & fov); fp = nnz(maMask & ~gt & fov); fn = nnz(~maMask & gt & fov);
        mDice(end+1) = 2*tp/max(1,2*tp+fp+fn); %#ok<AGROW>
        gtCC = bwconncomp(gt);
        if gtCC.NumObjects > 0
            hits = 0;
            for L = 1:gtCC.NumObjects
                if any(maMask(gtCC.PixelIdxList{L})), hits = hits+1; end
            end
            mHit(end+1) = hits/gtCC.NumObjects; %#ok<AGROW>
        end
    end

    fprintf('%-8d %9.3f %9.1f%% %9.3f %9.1f%%\n', pctl, mean(iDice), 100*mean(iHit), mean(mDice), 100*mean(mHit));
end

fprintf('\n=== HEMORRHAGES (current default: 97) ===\n');
fprintf('%-8s %20s %24s\n', '', 'IDRiD (n<=53)', 'MAPLES-DR (n<=162)');
fprintf('%-8s %10s %10s %10s %10s\n', 'Pctl', 'Dice', 'LesionHit', 'Dice', 'LesionHit');
idridHeFiles = dir(fullfile(idridHeDir, '*.tif'));
for pctl = hePctls
    opts = baseOpts;
    opts.HemorrhageThresholdPercentile = pctl;

    iDice = []; iHit = [];
    for k = 1:numel(idridHeFiles)
        [~, idStr, ~] = fileparts(idridHeFiles(k).name);
        idStr = erase(idStr, '_HE');
        imgPath = fullfile(idridImgDir, [idStr '.jpg']);
        if ~isfile(imgPath), continue; end
        img = imread(imgPath);
        gtNative = imread(fullfile(idridHeDir, idridHeFiles(k).name)) > 0;
        [fovMask, ~] = computeFOVMask(img);
        [heMask, ~] = detectHemorrhages(img, opts);
        [hl, wl] = size(heMask);
        gt = imresize(gtNative(:,:,1), [hl wl], 'nearest');
        fov = imresize(fovMask, [hl wl], 'nearest');
        tp = nnz(heMask & gt & fov); fp = nnz(heMask & ~gt & fov); fn = nnz(~heMask & gt & fov);
        iDice(end+1) = 2*tp/max(1,2*tp+fp+fn); %#ok<AGROW>
        gtCC = bwconncomp(gt);
        if gtCC.NumObjects > 0
            hits = 0;
            for L = 1:gtCC.NumObjects
                if any(heMask(gtCC.PixelIdxList{L})), hits = hits+1; end
            end
            iHit(end+1) = hits/gtCC.NumObjects; %#ok<AGROW>
        end
    end

    mDice = []; mHit = [];
    for k = 1:numel(maplesFiles)
        fname = maplesFiles{k}; % same 198-image consensus set covers Hemorrhages too
        [~, baseName, ~] = fileparts(fname);
        imgPath = fullfile(messidorImgDir, [baseName '.png']);
        if ~isfile(imgPath), continue; end
        gtPath = fullfile(heDirs{1}, fname);
        if ~isfile(gtPath), gtPath = fullfile(heDirs{2}, fname); end
        if ~isfile(gtPath), continue; end
        img = imread(imgPath);
        gtNative = imread(gtPath) > 0;
        [fovMask, ~] = computeFOVMask(img);
        [heMask, ~] = detectHemorrhages(img, opts);
        [hl, wl] = size(heMask);
        gt = imresize(gtNative, [hl wl], 'nearest');
        fov = imresize(fovMask, [hl wl], 'nearest');
        tp = nnz(heMask & gt & fov); fp = nnz(heMask & ~gt & fov); fn = nnz(~heMask & gt & fov);
        mDice(end+1) = 2*tp/max(1,2*tp+fp+fn); %#ok<AGROW>
        gtCC = bwconncomp(gt);
        if gtCC.NumObjects > 0
            hits = 0;
            for L = 1:gtCC.NumObjects
                if any(heMask(gtCC.PixelIdxList{L})), hits = hits+1; end
            end
            mHit(end+1) = hits/gtCC.NumObjects; %#ok<AGROW>
        end
    end

    fprintf('%-8d %9.3f %9.1f%% %9.3f %9.1f%%\n', pctl, mean(iDice), 100*mean(iHit), mean(mDice), 100*mean(mHit));
end
