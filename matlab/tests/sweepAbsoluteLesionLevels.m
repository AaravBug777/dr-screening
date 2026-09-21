% Tests replacing each lesion detector's per-image PERCENTILE threshold
% with an ABSOLUTE response cutoff. FGADR validation showed candidate
% counts do NOT rise with true DR grade (MA 12,317 at grade 0 vs 10,545 at
% grade 4) because a per-image percentile flags a near-constant fraction of
% every image no matter how much disease it has.
%
% Design (same two-dataset discipline as the earlier retunes, but with a
% clean held-out set): levels are TUNED on IDRiD + MAPLES-DR (the original
% tuning sets) and JUDGED on a 250-image grade-stratified FGADR sample the
% tuning never touched. Per detector the response map is computed ONCE per
% image (the detectors' optional 3rd output), then each candidate level is
% applied by replicating the detector's own post-threshold steps
% (verified against the real detector output on the first images).
%
% Reported per level: lesion hit rate, pixel precision, fraction of the FOV
% flagged, and on FGADR the Spearman correlation of candidate count and
% flagged-area fraction with true grade (percentile baseline = column 'pct').
% Soft exudates: candidate mask uses the percentile-mode hard-exudate mask
% (approximation, noted).

setupPathsRoot = fileparts(mfilename('fullpath'));
run(fullfile(setupPathsRoot, '..', 'setupPaths.m'));
opts = defaultSegmentationConfig();
types = {'MA', 'EX', 'HE', 'SE'};
pctField = struct('MA', 'MAThresholdPercentile', 'EX', 'ExudateThresholdPercentile', 'HE', 'HemorrhageThresholdPercentile', 'SE', 'SoftExudateThresholdPercentile');

items = buildItems(setupPathsRoot);
fprintf('Items: %d IDRiD, %d MAPLES-DR (tuning); %d FGADR (held out)\n', ...
    nnz(strcmp({items.source}, 'idrid')), nnz(strcmp({items.source}, 'maples')), nnz(strcmp({items.source}, 'fgadr')));

% ---- Pilot: reference level scale per detector (median of the current percentile level) ----
pilot = find(strcmp({items.source}, 'idrid'), 25);
ref = struct('MA', [], 'EX', [], 'HE', [], 'SE', []);
for i = pilot(:)'
    D = runDetectors(imread(items(i).img), opts);
    for t = 1:4
        L = types{t};
        v = D.(L).R(D.(L).C);
        ref.(L)(end+1) = prctile(v, opts.(pctField.(L)));
    end
end
mult = [0.5 0.7 1 1.4 2 3];
nL = numel(mult);
grid = struct();
for t = 1:4
    grid.(types{t}) = median(ref.(types{t})) * mult;
    fprintf('%s reference level (median current-percentile cutoff)=%.4f -> grid %s\n', types{t}, median(ref.(types{t})), mat2str(round(grid.(types{t}), 4)));
end

% ---- Main pass ----
N = numel(items);
S = struct();
for t = 1:4
    S.(types{t}) = struct('hit', nan(N, nL+1), 'prec', nan(N, nL+1), 'flag', nan(N, nL+1), 'count', nan(N, nL+1), 'hasGT', false(N,1));
end
tic;
for i = 1:N
    img = imread(items(i).img);
    [fov, ~] = computeFOVMask(img);
    D = runDetectors(img, opts);
    for t = 1:4
        L = types{t};
        gtNative = loadGT(items(i).gt.(L));
        S.(L).hasGT(i) = ~isempty(gtNative) && any(gtNative(:));
        for l = 0:nL
            if l == 0
                mask = D.(L).mask; % the real detector output at the deployed percentile
                cnt = D.(L).count;
            else
                [mask, cnt] = applyLevel(L, D.(L).R, D.(L).C, grid.(L)(l), opts);
            end
            if i <= 3 && l == 0
                % sanity: replicating the percentile level must reproduce the detector
                lev = prctile(D.(L).R(D.(L).C), opts.(pctField.(L)));
                [m2, ~] = applyLevel(L, D.(L).R, D.(L).C, lev, opts);
                fprintf('  sanity %s img%d: detector=%d px, replicated=%d px\n', L, i, nnz(mask), nnz(m2));
            end
            S.(L).count(i, l+1) = cnt;
            S.(L).flag(i, l+1) = nnz(mask) / max(1, nnz(imresize(fov, size(mask), 'nearest')));
            if S.(L).hasGT(i)
                [S.(L).hit(i, l+1), S.(L).prec(i, l+1)] = hitPrec(mask, gtNative);
            end
        end
    end
    if mod(i, 25) == 0, fprintf('  %d/%d (%.0f s)\n', i, N, toc); end
end
save(fullfile(setupPathsRoot, 'absolute_level_sweep.mat'), 'S', 'grid', 'items', 'mult');

% ---- Reports ----
src = {items.source};
grades = [items.grade]';
lab = [{'pct'}, arrayfun(@(m) sprintf('x%.1f', m), mult, 'UniformOutput', false)];
for t = 1:4
    L = types{t};
    fprintf('\n=== %s ===\n', L);
    fprintf('%-6s | %s\n', 'level', 'TUNING(IDRiD+MAPLES): hit  prec  flag% |  FGADR: hit  prec  flag%  count  rho(count,grade) rho(area,grade)');
    tun = (strcmp(src, 'idrid') | strcmp(src, 'maples'))' & S.(L).hasGT;
    fg = strcmp(src, 'fgadr')' ;
    fgGT = fg & S.(L).hasGT;
    for l = 1:nL+1
        rc = corr(S.(L).count(fg, l), grades(fg), 'type', 'Spearman', 'rows', 'complete');
        ra = corr(S.(L).flag(fg, l), grades(fg), 'type', 'Spearman', 'rows', 'complete');
        fprintf('%-6s | %5.1f%% %5.1f%% %5.1f%%   | %5.1f%% %5.1f%% %5.2f%% %8.0f   %6.3f  %6.3f\n', lab{l}, ...
            100*mean(S.(L).hit(tun, l), 'omitnan'), 100*mean(S.(L).prec(tun, l), 'omitnan'), 100*mean(S.(L).flag(tun, l)), ...
            100*mean(S.(L).hit(fgGT, l), 'omitnan'), 100*mean(S.(L).prec(fgGT, l), 'omitnan'), 100*mean(S.(L).flag(fg, l)), mean(S.(L).count(fg, l)), rc, ra);
    end
end

% ================= helpers =================
function D = runDetectors(img, opts)
[m1, i1, d1] = detectMicroaneurysms(img, opts);
[m2, i2, d2] = detectHardExudates(img, opts);
[m3, i3, d3] = detectHemorrhages(img, opts);
[m4, i4, d4] = detectSoftExudates(img, opts, m2);
D.MA = struct('mask', m1, 'count', i1.count, 'R', d1.response, 'C', d1.candidateMask);
D.EX = struct('mask', m2, 'count', i2.count, 'R', d2.response, 'C', d2.candidateMask);
D.HE = struct('mask', m3, 'count', i3.count, 'R', d3.response, 'C', d3.candidateMask);
D.SE = struct('mask', m4, 'count', i4.count, 'R', d4.response, 'C', d4.candidateMask);
end

function [mask, cnt] = applyLevel(L, R, C, level, opts)
raw = R > level & C;
switch L
    case 'MA'
        sf = bwareaopen(raw, opts.MAMinAreaPx);
        cc = bwconncomp(sf); p = regionprops(cc, 'Area');
        keep = find([p.Area] <= opts.MAMaxAreaPx);
        mask = false(size(raw));
        for k = keep(:)', mask(cc.PixelIdxList{k}) = true; end
        cnt = numel(keep);
    case 'EX'
        mask = bwareaopen(raw, opts.ExudateMinAreaPx); cnt = bwconncomp(mask).NumObjects;
    case 'SE'
        mask = bwareaopen(raw, opts.SoftExudateMinAreaPx); cnt = bwconncomp(mask).NumObjects;
    case 'HE'
        sf = bwareaopen(raw, opts.HemorrhageMinAreaPx);
        cc = bwconncomp(sf); p = regionprops(cc, 'Eccentricity');
        keep = find([p.Eccentricity] <= opts.HemorrhageMaxEccentricity);
        mask = false(size(raw));
        for k = keep(:)', mask(cc.PixelIdxList{k}) = true; end
        cnt = numel(keep);
end
end

function [hit, prec] = hitPrec(mask, gtNative)
gt = imresize(gtNative, size(mask), 'nearest');
cc = bwconncomp(gt);
hit = nan;
if cc.NumObjects > 0
    h = 0;
    for k = 1:cc.NumObjects, h = h + any(mask(cc.PixelIdxList{k})); end
    hit = h / cc.NumObjects;
end
prec = nnz(mask & gt) / max(1, nnz(mask));
end

function gt = loadGT(path)
gt = [];
if isempty(path) || ~isfile(path), return; end
g = imread(path);
if isa(g, 'uint8') && size(g, 3) == 3 && max(g(:)) > 1 && max(max(g(:,:,1))) > 127
    gt = g(:,:,1) > 127;
else
    gt = g(:,:,1) > 0;
end
end

function items = buildItems(root)
items = struct('img', {}, 'gt', {}, 'source', {}, 'grade', {});
none = struct('MA', '', 'EX', '', 'HE', '', 'SE', '');
% IDRiD segmentation training set
seg = fullfile(root, '..', '..', 'training', 'data', 'idrid', 'A. Segmentation');
imgs = dir(fullfile(seg, '1. Original Images', 'a. Training Set', '*.jpg'));
gtRoot = fullfile(seg, '2. All Segmentation Groundtruths', 'a. Training Set');
for k = 1:numel(imgs)
    [~, id] = fileparts(imgs(k).name);
    g = none;
    g.MA = fullfile(gtRoot, '1. Microaneurysms', [id '_MA.tif']);
    g.HE = fullfile(gtRoot, '2. Haemorrhages', [id '_HE.tif']);
    g.EX = fullfile(gtRoot, '3. Hard Exudates', [id '_EX.tif']);
    g.SE = fullfile(gtRoot, '4. Soft Exudates', [id '_SE.tif']);
    items(end+1) = struct('img', fullfile(imgs(k).folder, imgs(k).name), 'gt', g, 'source', 'idrid', 'grade', nan); %#ok<AGROW>
end
% MAPLES-DR (matched Messidor-2 images)
md = fullfile(root, '..', '..', 'training', 'data', 'maples_dr', 'MAPLES-DR');
mimg = fullfile(root, '..', '..', 'training', 'data', 'messidor2', 'IMAGES');
cat = struct('MA', 'Microaneurysms', 'EX', 'Exudates', 'HE', 'Hemorrhages', 'SE', 'CottonWoolSpots');
for sp = {'train', 'test'}
    lst = dir(fullfile(md, sp{1}, 'Microaneurysms', '*.png'));
    for k = 1:numel(lst)
        [~, id] = fileparts(lst(k).name);
        ip = fullfile(mimg, [id '.png']);
        if ~isfile(ip), continue; end
        g = none;
        for f = fieldnames(cat)', g.(f{1}) = fullfile(md, sp{1}, cat.(f{1}), lst(k).name); end
        items(end+1) = struct('img', ip, 'gt', g, 'source', 'maples', 'grade', nan); %#ok<AGROW>
    end
end
% FGADR: 50 per grade (rng 42)
fd = fullfile(root, '..', '..', 'training', 'data', 'fgadr', 'Seg-set');
T = readtable(fullfile(fd, 'DR_Seg_Grading_Label.csv'), 'ReadVariableNames', false);
rng(42);
fold = struct('MA', 'Microaneurysms_Masks', 'EX', 'HardExudate_Masks', 'HE', 'Hemohedge_Masks', 'SE', 'SoftExudate_Masks');
for gr = 0:4
    idx = find(T.Var2 == gr);
    idx = idx(randperm(numel(idx), 50));
    for k = idx(:)'
        g = none;
        for f = fieldnames(fold)', g.(f{1}) = fullfile(fd, fold.(f{1}), T.Var1{k}); end
        items(end+1) = struct('img', fullfile(fd, 'Original_Images', T.Var1{k}), 'gt', g, 'source', 'fgadr', 'grade', gr); %#ok<AGROW>
    end
end
end
