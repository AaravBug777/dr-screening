% Sweeps SoftExudateMinAreaPx specifically -- the one dimension
% tuneSoftExudateParams.m didn't test (only radius and threshold
% percentile were swept there). Radius=20, ThresholdPercentile=94 held
% fixed at their already-chosen winning values.

setupPathsRoot = fileparts(mfilename('fullpath'));
run(fullfile(setupPathsRoot, '..', 'setupPaths.m'));

idridDir = fullfile(setupPathsRoot, '..', '..', 'training', 'data', 'idrid', 'A. Segmentation');
idridImgDir = fullfile(idridDir, '1. Original Images', 'a. Training Set');
idridSeDir = fullfile(idridDir, '2. All Segmentation Groundtruths', 'a. Training Set', '4. Soft Exudates');
idridSeFiles = dir(fullfile(idridSeDir, '*.tif'));

maplesDir = fullfile(setupPathsRoot, '..', '..', 'training', 'data', 'maples_dr', 'MAPLES-DR');
messidorImgDir = fullfile(setupPathsRoot, '..', '..', 'training', 'data', 'messidor2', 'IMAGES');
cwsDirs = {fullfile(maplesDir, 'train', 'CottonWoolSpots'), fullfile(maplesDir, 'test', 'CottonWoolSpots')};
maplesFiles = {};
for d = 1:numel(cwsDirs)
    listing = dir(fullfile(cwsDirs{d}, '*.png'));
    for i = 1:numel(listing)
        maplesFiles{end+1} = listing(i).name; %#ok<AGROW>
    end
end

baseOpts = defaultSegmentationConfig();
areas = [20 40 60 80 120];

fprintf('%-6s %20s %24s\n', '', 'IDRiD SE (n<=26)', 'MAPLES-DR CWS (n<=162)');
fprintf('%-6s %10s %10s %10s %10s\n', 'MinArea', 'Dice', 'LesionHit', 'Dice', 'LesionHit');

for minArea = areas
    opts = baseOpts;
    opts.SoftExudateMinAreaPx = minArea;

    iDice = []; iHit = [];
    for k = 1:numel(idridSeFiles)
        [~, idStr, ~] = fileparts(idridSeFiles(k).name);
        idStr = erase(idStr, '_SE');
        imgPath = fullfile(idridImgDir, [idStr '.jpg']);
        if ~isfile(imgPath), continue; end
        img = imread(imgPath);
        gtNative = imread(fullfile(idridSeDir, idridSeFiles(k).name)) > 0;
        [fovMask, ~] = computeFOVMask(img);
        [exMask, ~] = detectHardExudates(img, opts);
        [seMask, ~] = detectSoftExudates(img, opts, exMask);
        [hl, wl] = size(seMask);
        gt = imresize(gtNative(:,:,1), [hl wl], 'nearest');
        fov = imresize(fovMask, [hl wl], 'nearest');
        tp = nnz(seMask & gt & fov); fp = nnz(seMask & ~gt & fov); fn = nnz(~seMask & gt & fov);
        iDice(end+1) = 2*tp/max(1,2*tp+fp+fn); %#ok<AGROW>
        gtCC = bwconncomp(gt);
        if gtCC.NumObjects > 0
            hits = 0;
            for L = 1:gtCC.NumObjects
                if any(seMask(gtCC.PixelIdxList{L})), hits = hits+1; end
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
        gtPath = fullfile(cwsDirs{1}, fname);
        if ~isfile(gtPath), gtPath = fullfile(cwsDirs{2}, fname); end
        img = imread(imgPath);
        gtNative = imread(gtPath) > 0;
        [fovMask, ~] = computeFOVMask(img);
        [exMask, ~] = detectHardExudates(img, opts);
        [seMask, ~] = detectSoftExudates(img, opts, exMask);
        [hl, wl] = size(seMask);
        gt = imresize(gtNative, [hl wl], 'nearest');
        fov = imresize(fovMask, [hl wl], 'nearest');
        tp = nnz(seMask & gt & fov); fp = nnz(seMask & ~gt & fov); fn = nnz(~seMask & gt & fov);
        mDice(end+1) = 2*tp/max(1,2*tp+fp+fn); %#ok<AGROW>
        gtCC = bwconncomp(gt);
        if gtCC.NumObjects > 0
            hits = 0;
            for L = 1:gtCC.NumObjects
                if any(seMask(gtCC.PixelIdxList{L})), hits = hits+1; end
            end
            mHit(end+1) = hits/gtCC.NumObjects; %#ok<AGROW>
        end
    end

    fprintf('%-6d %9.3f %9.1f%% %9.3f %9.1f%%\n', minArea, mean(iDice), 100*mean(iHit), mean(mDice), 100*mean(mHit));
end
