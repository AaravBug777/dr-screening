% Applies the SAME method that fixed vessel segmentation's MAPLES-DR gap
% (tuneVesselThresholdForThinVessels.m) to hard exudates: sweep
% ExudateThresholdPercentile against BOTH IDRiD (54 images, all
% annotated) AND MAPLES-DR (162 matched images) together, since it was
% only ever tuned against IDRiD alone originally (see
% defaultSegmentationConfig.m's history). Never tune against only one
% dataset -- the same discipline that caught a real regression during the
% optic-disc fix.

setupPathsRoot = fileparts(mfilename('fullpath'));
run(fullfile(setupPathsRoot, '..', 'setupPaths.m'));

idridDir = fullfile(setupPathsRoot, '..', '..', 'training', 'data', 'idrid', 'A. Segmentation');
idridImgDir = fullfile(idridDir, '1. Original Images', 'a. Training Set');
idridExDir = fullfile(idridDir, '2. All Segmentation Groundtruths', 'a. Training Set', '3. Hard Exudates');
idridFiles = dir(fullfile(idridExDir, '*.tif'));

maplesDir = fullfile(setupPathsRoot, '..', '..', 'training', 'data', 'maples_dr', 'MAPLES-DR');
messidorImgDir = fullfile(setupPathsRoot, '..', '..', 'training', 'data', 'messidor2', 'IMAGES');
exDirs = {fullfile(maplesDir, 'train', 'Exudates'), fullfile(maplesDir, 'test', 'Exudates')};
maplesFiles = {};
for d = 1:numel(exDirs)
    listing = dir(fullfile(exDirs{d}, '*.png'));
    for i = 1:numel(listing)
        maplesFiles{end+1} = listing(i).name; %#ok<AGROW>
    end
end

baseOpts = defaultSegmentationConfig();
candidatePctls = [90 92 94 96 97 98];

fprintf('%-8s %20s %24s\n', '', 'IDRiD (n<=54)', 'MAPLES-DR (n<=162)');
fprintf('%-8s %10s %10s %10s %10s\n', 'Pctl', 'Dice', 'LesionHit', 'Dice', 'LesionHit');

for pctl = candidatePctls
    opts = baseOpts;
    opts.ExudateThresholdPercentile = pctl;

    % --- IDRiD ---
    iDice = []; iHit = [];
    for k = 1:numel(idridFiles)
        [~, idStr, ~] = fileparts(idridFiles(k).name);
        idStr = erase(idStr, '_EX');
        imgPath = fullfile(idridImgDir, [idStr '.jpg']);
        if ~isfile(imgPath), continue; end
        img = imread(imgPath);
        gtNative = imread(fullfile(idridExDir, idridFiles(k).name)) > 0;
        [fovMask, ~] = computeFOVMask(img);
        [exMask, ~] = detectHardExudates(img, opts);
        [hl, wl] = size(exMask);
        gt = imresize(gtNative(:,:,1), [hl wl], 'nearest');
        fov = imresize(fovMask, [hl wl], 'nearest');
        tp = nnz(exMask & gt & fov); fp = nnz(exMask & ~gt & fov); fn = nnz(~exMask & gt & fov);
        iDice(end+1) = 2*tp/max(1,2*tp+fp+fn); %#ok<AGROW>
        gtCC = bwconncomp(gt);
        if gtCC.NumObjects > 0
            hits = 0;
            for L = 1:gtCC.NumObjects
                if any(exMask(gtCC.PixelIdxList{L})), hits = hits+1; end
            end
            iHit(end+1) = hits/gtCC.NumObjects; %#ok<AGROW>
        end
    end

    % --- MAPLES-DR ---
    mDice = []; mHit = [];
    for k = 1:numel(maplesFiles)
        fname = maplesFiles{k};
        [~, baseName, ~] = fileparts(fname);
        imgPath = fullfile(messidorImgDir, [baseName '.png']);
        if ~isfile(imgPath), continue; end
        gtPath = fullfile(exDirs{1}, fname);
        if ~isfile(gtPath), gtPath = fullfile(exDirs{2}, fname); end
        img = imread(imgPath);
        gtNative = imread(gtPath) > 0;
        [fovMask, ~] = computeFOVMask(img);
        [exMask, ~] = detectHardExudates(img, opts);
        [hl, wl] = size(exMask);
        gt = imresize(gtNative, [hl wl], 'nearest');
        fov = imresize(fovMask, [hl wl], 'nearest');
        tp = nnz(exMask & gt & fov); fp = nnz(exMask & ~gt & fov); fn = nnz(~exMask & gt & fov);
        mDice(end+1) = 2*tp/max(1,2*tp+fp+fn); %#ok<AGROW>
        gtCC = bwconncomp(gt);
        if gtCC.NumObjects > 0
            hits = 0;
            for L = 1:gtCC.NumObjects
                if any(exMask(gtCC.PixelIdxList{L})), hits = hits+1; end
            end
            mHit(end+1) = hits/gtCC.NumObjects; %#ok<AGROW>
        end
    end

    fprintf('%-8d %9.3f %9.1f%% %9.3f %9.1f%%\n', pctl, mean(iDice), 100*mean(iHit), mean(mDice), 100*mean(mHit));
end
