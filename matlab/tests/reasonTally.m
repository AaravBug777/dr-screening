% Which reason codes are actually driving unresolved "borderline" verdicts?
setupPathsRoot = fileparts(mfilename('fullpath'));
run(fullfile(setupPathsRoot, '..', 'setupPaths.m'));

imageFolder = fullfile(setupPathsRoot, '..', '..', 'training', 'data', 'aptos2019', 'train_images');
files = dir(fullfile(imageFolder, '*.png'));
rng(1);
n = min(500, numel(files));
idx = randperm(numel(files), n);

allReasons = {};
for k = 1:n
    f = files(idx(k));
    img = imread(fullfile(f.folder, f.name));
    r = assessFundusQuality(img);
    if strcmp(r.verdict, 'borderline') || strcmp(r.verdict, 'reject')
        allReasons = [allReasons, r.reasons]; %#ok<AGROW>
    end
end

[uReasons, ~, ic] = unique(allReasons);
counts = accumarray(ic, 1);
[counts, order] = sort(counts, 'descend');
uReasons = uReasons(order);

fprintf('Reason code frequency among unresolved borderline/reject verdicts (n=%d images total):\n', n);
for i = 1:numel(uReasons)
    fprintf('  %-30s %4d\n', uReasons{i}, counts(i));
end
