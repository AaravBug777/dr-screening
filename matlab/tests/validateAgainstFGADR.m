% Third-grader validation of the lesion detectors and the NV detector
% against FGADR's Seg-set (Zhou et al., 1,842 images, 1280x1280, pixel
% masks for MA / hemorrhage / hard exudate / soft exudate / IRMA / NV,
% research-use license -- data stays under training/data/, gitignored).
%
% Sample: EVERY NV-positive image (49, vs. n=5 in MAPLES-DR) plus a
% grade-stratified random sample of the rest (rng 42), run once each
% through vessels/OD -> NV, MA, hard exudates, soft exudates, hemorrhages,
% with the detectors' CURRENT deployed thresholds. Cap is for runtime.
%
% NV negatives: FGADR ships an NV mask only for NV-positive images (49 of
% 1,842), so "no mask file" is taken to mean no NV -- a reasonable but
% unverified assumption (an unannotated NV would count as a false alarm).
% Masks are binarized at >127 (they carry a few low-value interpolation
% pixels). All FGADR images are 1280px, above MaxWorkingDim=640 but below
% LesionMaxWorkingDim=1600 (lesions run at native 1280, no upscaling).

setupPathsRoot = fileparts(mfilename('fullpath'));
run(fullfile(setupPathsRoot, '..', 'setupPaths.m'));

segDir = fullfile(setupPathsRoot, '..', '..', 'training', 'data', 'fgadr', 'Seg-set');
imgDir = fullfile(segDir, 'Original_Images');
T = readtable(fullfile(segDir, 'DR_Seg_Grading_Label.csv'), 'ReadVariableNames', false);
names = T.Var1; grades = T.Var2;

nvListing = dir(fullfile(segDir, 'Neovascularization_Masks', '*.png'));
nvNames = {nvListing.name}';
isNV = ismember(names, nvNames);

rng(42);
SAMPLE_NONNV = 650;
keep = find(isNV);
nonNV = find(~isNV);
frac = SAMPLE_NONNV / numel(nonNV);
for g = 0:4
    idx = nonNV(grades(nonNV) == g);
    keep = [keep; idx(randperm(numel(idx), round(frac * numel(idx))))]; %#ok<AGROW>
end
keep = sort(keep);
n = numel(keep);
fprintf('FGADR sample: %d images (%d NV-positive + %d others)\n', n, nnz(isNV(keep)), nnz(~isNV(keep)));

opts = defaultSegmentationConfig();
lesion = {'MA', 'EX', 'SE', 'HE'};
folder = struct('MA', 'Microaneurysms_Masks', 'EX', 'HardExudate_Masks', 'SE', 'SoftExudate_Masks', 'HE', 'Hemohedge_Masks');
R = struct();
for c = 1:numel(lesion)
    R.(lesion{c}) = struct('sens', nan(n,1), 'spec', nan(n,1), 'dice', nan(n,1), 'hit', nan(n,1), 'hasGT', false(n,1), 'count', nan(n,1));
end
nvGT = false(n,1); nvPred = false(n,1); nvDice = nan(n,1); nvCount = nan(n,1);
imgGrade = grades(keep);

tic;
for k = 1:n
    fname = names{keep(k)};
    img = imread(fullfile(imgDir, fname));
    [fovMask, ~] = computeFOVMask(img);

    [vesselMask, ~] = segmentVessels(img, opts);
    odInfo = localizeOpticDisc(img, vesselMask, opts);
    [nvMask, nvInfo] = detectNeovascularization(img, vesselMask, odInfo, opts);
    [maMask, maInfo] = detectMicroaneurysms(img, opts);
    [exMask, exInfo] = detectHardExudates(img, opts);
    [seMask, seInfo] = detectSoftExudates(img, opts, exMask);
    [heMask, heInfo] = detectHemorrhages(img, opts);
    preds = struct('MA', maMask, 'EX', exMask, 'SE', seMask, 'HE', heMask);
    counts = struct('MA', maInfo.count, 'EX', exInfo.count, 'SE', seInfo.count, 'HE', heInfo.count);

    for c = 1:numel(lesion)
        L = lesion{c};
        gt = imread(fullfile(segDir, folder.(L), fname));
        gt = gt(:,:,1) > 127;
        R.(L).count(k) = counts.(L);
        R.(L).hasGT(k) = any(gt(:));
        [R.(L).sens(k), R.(L).spec(k), R.(L).dice(k), R.(L).hit(k)] = lesionMetrics(preds.(L), gt, fovMask);
    end

    nvPath = fullfile(segDir, 'Neovascularization_Masks', fname);
    if isfile(nvPath)
        gtNV = imread(nvPath); gtNV = gtNV(:,:,1) > 127;
    else
        gtNV = false(1280, 1280);
    end
    nvGT(k) = any(gtNV(:));
    nvUp = imresize(nvMask, size(gtNV), 'nearest');
    nvPred(k) = any(nvUp(:));
    tp = nnz(nvUp & gtNV); fp = nnz(nvUp & ~gtNV); fn = nnz(~nvUp & gtNV);
    nvDice(k) = 2*tp / max(1, 2*tp + fp + fn);
    nvCount(k) = nvInfo.count;

    if mod(k, 25) == 0
        fprintf('  %d/%d (%.1f s elapsed)\n', k, n, toc);
    end
end
fprintf('\nProcessed %d images in %.1f s (%.2f s/image)\n', n, toc, toc / n);
save(fullfile(setupPathsRoot, 'fgadr_validation_results.mat'), 'R', 'nvGT', 'nvPred', 'nvDice', 'nvCount', 'imgGrade', 'keep');

fprintf('\n=== Lesion detectors vs FGADR (images WITH that lesion annotated) ===\n');
fprintf('%-4s %5s %8s %8s %8s %10s   | ref. IDRiD hit / MAPLES-DR hit\n', 'Type', 'n', 'Sens', 'Spec', 'Dice', 'LesionHit');
refs = struct('MA', '98.0 / 96.9', 'EX', '~64 / ~81', 'SE', '83.8 / 29.2', 'HE', '42.6 / 39.3');
for c = 1:numel(lesion)
    L = lesion{c}; v = R.(L).hasGT;
    if ~any(v), fprintf('%-4s no annotated images in sample\n', L); continue; end
    fprintf('%-4s %5d %7.1f%% %7.1f%% %8.3f %9.1f%%   | %s\n', L, nnz(v), 100*mean(R.(L).sens(v)), 100*mean(R.(L).spec(v)), ...
        mean(R.(L).dice(v)), 100*mean(R.(L).hit(v), 'omitnan'), refs.(L));
end

fprintf('\n=== Mean detected candidate count by true DR grade (should rise with grade) ===\n');
fprintf('%-6s %6s %8s %8s %8s %8s\n', 'Grade', 'n', 'MA', 'EX', 'SE', 'HE');
for g = 0:4
    m = imgGrade == g;
    fprintf('%-6d %6d %8.1f %8.1f %8.1f %8.1f\n', g, nnz(m), mean(R.MA.count(m)), mean(R.EX.count(m)), mean(R.SE.count(m)), mean(R.HE.count(m)));
end

fprintf('\n=== Neovascularization vs FGADR ===\n');
tpI = nnz(nvGT & nvPred); fnI = nnz(nvGT & ~nvPred); tnI = nnz(~nvGT & ~nvPred); fpI = nnz(~nvGT & nvPred);
fprintf('Ground truth: %d NV-positive, %d NV-negative images\n', nnz(nvGT), nnz(~nvGT));
fprintf('Image-level sensitivity: %.1f%% (%d/%d)   specificity: %.1f%% (%d/%d)\n', ...
    100*tpI/max(1,tpI+fnI), tpI, nnz(nvGT), 100*tnI/max(1,tnI+fpI), tnI, nnz(~nvGT));
fprintf('Pixel-level Dice on positives: mean=%.3f median=%.3f\n', mean(nvDice(nvGT)), median(nvDice(nvGT)));
fprintf('NV candidate count: positives mean=%.2f, negatives mean=%.2f\n', mean(nvCount(nvGT)), mean(nvCount(~nvGT)));
if any(nvGT) && any(~nvGT)
    fprintf('One-sided ranksum (positives > negatives) on candidate count: p=%.4f\n', ranksum(nvCount(nvGT), nvCount(~nvGT), 'tail', 'right'));
end

function [sens, spec, dice, hit] = lesionMetrics(predMask, gtNative, fovNative)
[hl, wl] = size(predMask);
gt = imresize(gtNative, [hl wl], 'nearest');
fov = imresize(fovNative, [hl wl], 'nearest');
tp = nnz(predMask & gt & fov); tn = nnz(~predMask & ~gt & fov);
fp = nnz(predMask & ~gt & fov); fn = nnz(~predMask & gt & fov);
sens = tp/max(1,tp+fn); spec = tn/max(1,tn+fp); dice = 2*tp/max(1,2*tp+fp+fn);
cc = bwconncomp(gt);
if cc.NumObjects > 0
    hits = 0;
    for L = 1:cc.NumObjects
        if any(predMask(cc.PixelIdxList{L})), hits = hits + 1; end
    end
    hit = hits / cc.NumObjects;
else
    hit = nan;
end
end
