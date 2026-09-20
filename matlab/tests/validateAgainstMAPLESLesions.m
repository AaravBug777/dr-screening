% Cross-validates FIVE already-built, already-IDRiD/DRIVE-validated
% detectors (vessels, optic disc, microaneurysms, hard exudates,
% hemorrhages) against a SECOND, independent expert-labeled source:
% MAPLES-DR. Until now, every one of these detectors had only ever been
% checked against ONE grader's annotations (IDRiD for lesions/OD, DRIVE
% for vessels) -- this doesn't test whether they work at all (they
% already do, see matlab/segmentation/README.md), it tests whether that
% performance is an artifact of IDRiD/DRIVE's own specific labeling
% conventions or genuinely holds up against a differently-annotated
% dataset. Same one-pass-per-image structure as
% validateAgainstMAPLESNV.m, extended to the four other categories
% MAPLES-DR ships that this project had never touched
% (segmentation/README.md's "was any dataset not used to its full
% potential" gap).
%
% MAPLES-DR ships 198 images total across ALL categories (Vessels,
% OpticDisc, Microaneurysms, Exudates, Hemorrhages, Neovascularization,
% etc.) -- the same consensus image set validateAgainstMAPLESNV.m already
% uses, just with more of its annotation categories now read. Matched
% against this project's already-downloaded Messidor-2 image set by
% filename, same as the NV script (not every MAPLES-DR image has a
% locally-downloaded Messidor-2 counterpart -- see
% tests/checkMissingNVImage.m for why).

setupPathsRoot = fileparts(mfilename('fullpath'));
run(fullfile(setupPathsRoot, '..', 'setupPaths.m'));

maplesDir = fullfile(setupPathsRoot, '..', '..', 'training', 'data', 'maples_dr', 'MAPLES-DR');
imgDir = fullfile(setupPathsRoot, '..', '..', 'training', 'data', 'messidor2', 'IMAGES');

catDirs = struct( ...
    'Vessels', {{fullfile(maplesDir, 'train', 'Vessels'), fullfile(maplesDir, 'test', 'Vessels')}}, ...
    'OpticDisc', {{fullfile(maplesDir, 'train', 'OpticDisc'), fullfile(maplesDir, 'test', 'OpticDisc')}}, ...
    'Microaneurysms', {{fullfile(maplesDir, 'train', 'Microaneurysms'), fullfile(maplesDir, 'test', 'Microaneurysms')}}, ...
    'Exudates', {{fullfile(maplesDir, 'train', 'Exudates'), fullfile(maplesDir, 'test', 'Exudates')}}, ...
    'Hemorrhages', {{fullfile(maplesDir, 'train', 'Hemorrhages'), fullfile(maplesDir, 'test', 'Hemorrhages')}} ...
);

opts = defaultSegmentationConfig();

% Enumerate the full image list from the Vessels category (every category
% ships the identical 198-image set, confirmed by file count before
% writing this script).
allFiles = {};
for d = 1:numel(catDirs.Vessels)
    listing = dir(fullfile(catDirs.Vessels{d}, '*.png'));
    for i = 1:numel(listing)
        allFiles{end+1} = listing(i).name; %#ok<AGROW>
    end
end
n = numel(allFiles);
fprintf('Found %d MAPLES-DR images with lesion/structure masks.\n', n);

% Per-image, per-category results.
vesSens = nan(n,1); vesSpec = nan(n,1); vesAcc = nan(n,1); vesDice = nan(n,1);
odErrorDiam = nan(n,1);
maSens = nan(n,1); maSpec = nan(n,1); maDice = nan(n,1); maHit = nan(n,1);
exSens = nan(n,1); exSpec = nan(n,1); exDice = nan(n,1); exHit = nan(n,1);
heSens = nan(n,1); heSpec = nan(n,1); heDice = nan(n,1); heHit = nan(n,1);
matched = false(n,1);

tic;
for k = 1:n
    fname = allFiles{k};
    [~, baseName, ~] = fileparts(fname);
    imgPath = fullfile(imgDir, [baseName '.png']);
    if ~isfile(imgPath)
        continue
    end
    matched(k) = true;

    img = imread(imgPath);
    [fovMask, ~] = computeFOVMask(img);

    % --- Run the full detector suite ONCE per image ---
    [vesselMask, ~] = segmentVessels(img, opts);
    odInfo = localizeOpticDisc(img, vesselMask, opts);
    [maMask, ~] = detectMicroaneurysms(img, opts);
    [exMask, ~] = detectHardExudates(img, opts);
    [heMask, ~] = detectHemorrhages(img, opts);

    % --- Vessels: sens/spec/acc/Dice within FOV, same convention as validateAgainstDRIVE.m ---
    gtPath = fullfile(catDirs.Vessels{1}, fname);
    if ~isfile(gtPath), gtPath = fullfile(catDirs.Vessels{2}, fname); end
    gtVes = imread(gtPath) > 0;
    [hl, wl] = size(vesselMask);
    gtVesNative = imresize(gtVes, [hl wl], 'nearest');
    fovNative = imresize(fovMask, [hl wl], 'nearest');
    tp = nnz(vesselMask & gtVesNative & fovNative); tn = nnz(~vesselMask & ~gtVesNative & fovNative);
    fp = nnz(vesselMask & ~gtVesNative & fovNative); fn = nnz(~vesselMask & gtVesNative & fovNative);
    vesSens(k) = tp/max(1,tp+fn); vesSpec(k) = tn/max(1,tn+fp); vesAcc(k) = (tp+tn)/max(1,nnz(fovNative));
    vesDice(k) = 2*tp/max(1,2*tp+fp+fn);

    % --- Optic disc: MAPLES-DR mask centroid as ground-truth center, same
    % error-in-OD-diameters convention as validateAgainstIDRiD.m (using
    % OUR OWN detected radius as the diameter unit, for consistency with
    % that script rather than introducing a second, differently-defined
    % diameter measure). ---
    odGtPath = fullfile(catDirs.OpticDisc{1}, fname);
    if ~isfile(odGtPath), odGtPath = fullfile(catDirs.OpticDisc{2}, fname); end
    odGtMask = imread(odGtPath) > 0;
    if any(odGtMask(:))
        propsOD = regionprops(odGtMask, 'Centroid');
        gtCenterNative = propsOD(1).Centroid;
        [hNative, wNative] = size(odGtMask);
        scaleToWorking = hl / hNative; % vesselMask/odInfo are at working resolution; odGtMask is native
        gtCenterWorking = gtCenterNative * scaleToWorking;
        odErrorPx = hypot(odInfo.center(1) - gtCenterWorking(1), odInfo.center(2) - gtCenterWorking(2));
        odErrorDiam(k) = odErrorPx / max(1, odInfo.radius * 2);
    end

    % --- Lesions: pixel sens/spec/Dice + lesion-level hit rate, same
    % convention as validateAgainstIDRiDLesion.m. NOTE: maMask/exMask/
    % heMask run at opts.LesionMaxWorkingDim, a DIFFERENT working
    % resolution from vesselMask's opts.MaxWorkingDim (caught the hard
    % way: reusing vessel-resolution fovNative here first raised
    % "incompatible sizes") -- lesionMetrics resizes fovMask to each
    % predMask's own size internally instead of assuming a shared one. ---
    [maSens(k), maSpec(k), maDice(k), maHit(k)] = lesionMetrics(maMask, fullfile(catDirs.Microaneurysms{1}, fname), fullfile(catDirs.Microaneurysms{2}, fname), fovMask);
    [exSens(k), exSpec(k), exDice(k), exHit(k)] = lesionMetrics(exMask, fullfile(catDirs.Exudates{1}, fname), fullfile(catDirs.Exudates{2}, fname), fovMask);
    [heSens(k), heSpec(k), heDice(k), heHit(k)] = lesionMetrics(heMask, fullfile(catDirs.Hemorrhages{1}, fname), fullfile(catDirs.Hemorrhages{2}, fname), fovMask);

    if mod(nnz(matched), 25) == 0
        fprintf('  %d matched images processed (%.1f s elapsed)\n', nnz(matched), toc);
    end
end
elapsed = toc;

fprintf('\nMatched %d/%d MAPLES-DR images to local Messidor-2 files, processed in %.1f s (%.2f s/image)\n', ...
    nnz(matched), n, elapsed, elapsed / max(1,nnz(matched)));

fprintf('\n=== Cross-validation against MAPLES-DR (second independent grader, n=%d) ===\n', nnz(matched));
fprintf('%-15s %10s %10s %10s %10s\n', 'Structure', 'Sens', 'Spec', 'Dice', 'LesionHit');
printRow('Vessels', vesSens, vesSpec, vesDice, nan(n,1));
printRow('Microaneurysms', maSens, maSpec, maDice, maHit);
printRow('Exudates', exSens, exSpec, exDice, exHit);
printRow('Hemorrhages', heSens, heSpec, heDice, heHit);

validOD = ~isnan(odErrorDiam);
fprintf('\nOptic disc: n=%d, error (OD diameters) mean=%.3f median=%.3f, success rate (<1 diameter)=%.1f%%\n', ...
    nnz(validOD), mean(odErrorDiam(validOD)), median(odErrorDiam(validOD)), 100*mean(odErrorDiam(validOD) < 1));

fprintf('\nFor comparison, this project''s existing IDRiD/DRIVE-only numbers:\n');
fprintf('  Vessels (DRIVE): 64.2%% sens / 96.3%% spec / 0.673 Dice\n');
fprintf('  Optic disc (IDRiD): 89.1%% success rate\n');
fprintf('  Microaneurysms (IDRiD): 82.0%% lesion-level hit rate\n');
fprintf('  Exudates (IDRiD): 59.5%% lesion-level hit rate\n');
fprintf('  Hemorrhages (IDRiD): 46.1%% lesion-level hit rate\n');

function [sens, spec, dice, hit] = lesionMetrics(predMask, gtPathTrain, gtPathTest, fovMaskNative)
gtPath = gtPathTrain;
if ~isfile(gtPath), gtPath = gtPathTest; end
if ~isfile(gtPath)
    sens = nan; spec = nan; dice = nan; hit = nan;
    return
end
gtNative = imread(gtPath) > 0;
[hl, wl] = size(predMask);
gt = imresize(gtNative, [hl wl], 'nearest');
fov = imresize(fovMaskNative, [hl wl], 'nearest'); % predMask's own working resolution, not assumed shared with any other detector's

tp = nnz(predMask & gt & fov); tn = nnz(~predMask & ~gt & fov);
fp = nnz(predMask & ~gt & fov); fn = nnz(~predMask & gt & fov);
sens = tp/max(1,tp+fn); spec = tn/max(1,tn+fp); dice = 2*tp/max(1,2*tp+fp+fn);

gtCC = bwconncomp(gt);
if gtCC.NumObjects > 0
    hits = 0;
    for L = 1:gtCC.NumObjects
        if any(predMask(gtCC.PixelIdxList{L}))
            hits = hits + 1;
        end
    end
    hit = hits / gtCC.NumObjects;
else
    hit = nan; % no true lesions in this image -- hit rate undefined, not zero
end
end

function printRow(name, sens, spec, dice, hit)
v = ~isnan(dice);
if ~any(v)
    fprintf('%-15s %10s %10s %10s %10s\n', name, 'n/a', 'n/a', 'n/a', 'n/a');
    return
end
hitStr = 'n/a';
if any(~isnan(hit))
    hitStr = sprintf('%.1f%%', 100*mean(hit(~isnan(hit))));
end
fprintf('%-15s %9.1f%% %9.1f%% %10.3f %10s\n', name, 100*mean(sens(v)), 100*mean(spec(v)), mean(dice(v)), hitStr);
end
