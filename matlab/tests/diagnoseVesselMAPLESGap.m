% Diagnoses WHY segmentVessels' sensitivity drops on MAPLES-DR (51.8%) vs
% DRIVE (64.2%) -- validateAgainstMAPLESLesions.m found the honest gap but
% not the cause. Hypothesis: MAPLES-DR's vessel masks include thinner
% peripheral vessels DRIVE's annotation convention doesn't emphasize as
% much, and fibermetric-based detection (tuned/validated only against
% DRIVE) misses those disproportionately. Tested directly: for every
% ground-truth vessel pixel, compute its LOCAL VESSEL WIDTH (via the
% Euclidean distance transform of the vessel mask -- a pixel deep inside a
% thick vessel has a large distance-to-background; a pixel on a thin
% vessel has a small one), then bin true-positive rate (recall) by width.
% If recall drops sharply for thin vessels specifically, that confirms the
% hypothesis quantitatively rather than by eyeballing a handful of images.

setupPathsRoot = fileparts(mfilename('fullpath'));
run(fullfile(setupPathsRoot, '..', 'setupPaths.m'));

maplesDir = fullfile(setupPathsRoot, '..', '..', 'training', 'data', 'maples_dr', 'MAPLES-DR');
imgDir = fullfile(setupPathsRoot, '..', '..', 'training', 'data', 'messidor2', 'IMAGES');
vesDirs = {fullfile(maplesDir, 'train', 'Vessels'), fullfile(maplesDir, 'test', 'Vessels')};

opts = defaultSegmentationConfig();

allFiles = {};
for d = 1:numel(vesDirs)
    listing = dir(fullfile(vesDirs{d}, '*.png'));
    for i = 1:numel(listing)
        allFiles{end+1} = fullfile(vesDirs{d}, listing(i).name); %#ok<AGROW>
    end
end
n = numel(allFiles);

% Width bins in NATIVE-resolution pixels (radius from distance transform,
% so "width" here is really half-width/local radius) -- widened bin edges
% chosen after a first look at the actual distance-transform distribution
% (see printed histogram below) rather than guessed blind.
widthEdges = [0 1 2 3 5 8 Inf];
widthLabels = {'<1px','1-2px','2-3px','3-5px','5-8px','>8px'};
binTP = zeros(1, numel(widthEdges)-1);
binTotal = zeros(1, numel(widthEdges)-1);

matchedCount = 0;
tic;
for k = 1:n
    gtPath = allFiles{k};
    [~, baseName, ~] = fileparts(gtPath);
    imgPath = fullfile(imgDir, [baseName '.png']);
    if ~isfile(imgPath)
        continue
    end
    matchedCount = matchedCount + 1;

    img = imread(imgPath);
    gtNative = imread(gtPath) > 0;
    [fovMaskNative, ~] = computeFOVMask(img);

    vesselMask = segmentVessels(img, opts);
    [hl, wl] = size(vesselMask);
    gt = imresize(gtNative, [hl wl], 'nearest');
    fov = imresize(fovMaskNative, [hl wl], 'nearest');

    % Local vessel half-width at each GT vessel pixel: Euclidean distance
    % transform of the GT mask gives, for each foreground pixel, its
    % distance to the nearest background pixel -- exactly the local radius.
    distMap = bwdist(~gt);
    gtVesselPx = gt & fov;
    widths = distMap(gtVesselPx);
    hits = vesselMask(gtVesselPx);

    for b = 1:numel(widthEdges)-1
        inBin = widths >= widthEdges(b) & widths < widthEdges(b+1);
        binTotal(b) = binTotal(b) + nnz(inBin);
        binTP(b) = binTP(b) + nnz(inBin & hits);
    end

    if mod(matchedCount, 25) == 0
        fprintf('  %d matched images processed (%.1f s elapsed)\n', matchedCount, toc);
    end
end
elapsed = toc;

fprintf('\nMatched %d/%d MAPLES-DR vessel images, processed in %.1f s (%.2f s/image)\n', ...
    matchedCount, n, elapsed, elapsed / max(1,matchedCount));

fprintf('\n=== Recall (sensitivity) by local ground-truth vessel half-width ===\n');
fprintf('%-10s %12s %12s\n', 'Width bin', 'Recall', 'N pixels');
for b = 1:numel(widthEdges)-1
    recall = binTP(b) / max(1, binTotal(b));
    fprintf('%-10s %11.1f%% %12d\n', widthLabels{b}, 100*recall, binTotal(b));
end

overallRecall = sum(binTP) / max(1, sum(binTotal));
fprintf('\nOverall recall (sanity check, should be close to validateAgainstMAPLESLesions.m''s 51.8%%): %.1f%%\n', 100*overallRecall);
