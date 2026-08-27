% Verdict-distribution check for the quality module against Messidor-2 and
% IDRiD -- defaultQualityConfig.m's thresholds were calibrated only against
% APTOS (see quality/README.md's "Calibration status"). This checks whether
% they generalize to two more datasets from different clinics/cameras,
% the same spirit as validate_external.py on the Python side.
setupPathsRoot = fileparts(mfilename('fullpath'));
run(fullfile(setupPathsRoot, '..', 'setupPaths.m'));

datasets = struct( ...
    'name', {'Messidor-2', 'IDRiD (Disease Grading, train)'}, ...
    'folder', { ...
        fullfile(setupPathsRoot, '..', '..', 'training', 'data', 'messidor2', 'IMAGES'), ...
        fullfile(setupPathsRoot, '..', '..', 'training', 'data', 'idrid', 'B. Disease Grading', '1. Original Images', 'a. Training Set') ...
    }, ...
    'pattern', {{'*.png', '*.jpg', '*.JPG'}, {'*.jpg'}} ...
);

opts = defaultQualityConfig();

for d = 1:numel(datasets)
    ds = datasets(d);
    files = [];
    for p = 1:numel(ds.pattern)
        files = [files; dir(fullfile(ds.folder, ds.pattern{p}))]; %#ok<AGROW>
    end
    n = min(300, numel(files));
    rng(11);
    idx = randperm(numel(files), n);

    verdicts = strings(n, 1);
    tic;
    for k = 1:n
        f = files(idx(k));
        img = imread(fullfile(f.folder, f.name));
        r = assessFundusQuality(img, opts);
        verdicts(k) = string(r.verdict);
    end
    elapsed = toc;

    fprintf('\n=== %s (n=%d of %d total, %.1f s, %.3f s/image) ===\n', ds.name, n, numel(files), elapsed, elapsed / n);
    summary(categorical(verdicts))
end
