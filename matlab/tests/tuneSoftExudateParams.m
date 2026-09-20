% Sweeps detectSoftExudates.m's tophat radius / threshold percentile
% against TWO independent ground-truth sources at once -- IDRiD's Soft
% Exudate masks (26 of 54 training images have one -- not every image
% has a cotton wool spot) and MAPLES-DR's CottonWoolSpots category (162
% images matched to the local Messidor-2 set) -- so the chosen parameters
% aren't overfit to either dataset's specific annotation style, the same
% discipline validateAgainstMAPLESLesions.m established for the other
% five detectors.

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
radii = [20 30 40];
pctls = [94 96 98];

fprintf('%-6s %-6s %20s %24s\n', '', '', 'IDRiD SE (n<=26)', 'MAPLES-DR CWS (n<=162)');
fprintf('%-6s %-6s %10s %10s %10s %10s\n', 'Radius', 'Pctl', 'Dice', 'LesionHit', 'Dice', 'LesionHit');

for radius = radii
    for pctl = pctls
        opts = baseOpts;
        opts.SoftExudateTophatRadius = radius;
        opts.SoftExudateThresholdPercentile = pctl;

        % --- IDRiD ---
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

        % --- MAPLES-DR ---
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

        fprintf('%-6d %-6d %9.3f %9.1f%% %9.3f %9.1f%%\n', radius, pctl, ...
            mean(iDice), 100*mean(iHit), mean(mDice), 100*mean(mHit));
    end
end
