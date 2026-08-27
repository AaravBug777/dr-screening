% Quick verdict-distribution sanity check over a random sample of real
% APTOS images, at the current (fast, working-resolution) pipeline speed.
setupPathsRoot = fileparts(mfilename('fullpath'));
run(fullfile(setupPathsRoot, '..', 'setupPaths.m'));

imageFolder = fullfile(setupPathsRoot, '..', '..', 'training', 'data', 'aptos2019', 'train_images');
files = dir(fullfile(imageFolder, '*.png'));
rng(1);
n = min(500, numel(files));
idx = randperm(numel(files), n);

verdicts = strings(n, 1);
tic;
for k = 1:n
    f = files(idx(k));
    img = imread(fullfile(f.folder, f.name));
    r = assessFundusQuality(img);
    verdicts(k) = string(r.verdict);
end
elapsed = toc;

fprintf('Assessed %d images in %.1f s (%.3f s/image)\n', n, elapsed, elapsed / n);
summary(categorical(verdicts))
