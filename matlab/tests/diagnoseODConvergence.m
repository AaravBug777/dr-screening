% Tests whether ANGULAR vessel-convergence spread (vessels approaching from
% multiple distinct directions, not just raw density-in-a-window) separates
% the true optic disc from the false-positive exudate-cluster peak found on
% IDRiD_016.jpg -- before implementing this as a fix, not after.

setupPathsRoot = fileparts(mfilename('fullpath'));
run(fullfile(setupPathsRoot, '..', 'setupPaths.m'));

opts = defaultSegmentationConfig();
img = imread(fullfile(setupPathsRoot, '..', '..', 'training', 'data', 'idrid', 'B. Disease Grading', '1. Original Images', 'a. Training Set', 'IDRiD_016.jpg'));
[h0, w0, ~] = size(img);
scale = opts.MaxWorkingDim / max(h0, w0);
imgWork = imresize(img, scale);
vesselMask = segmentVessels(imgWork, opts);
[h, w, ~] = size(imgWork);
[xx, yy] = meshgrid(1:w, 1:h);

radius = 60; nSectors = 8;
rWrong = angularSpreadLocal(vesselMask, xx, yy, 386, 119, radius, nSectors);
rTrue = angularSpreadLocal(vesselMask, xx, yy, 140, 203, radius, nSectors);
fprintf('WRONG peak [386,119]: active sectors=%d/%d, counts=%s\n', rWrong.active, nSectors, mat2str(round(rWrong.counts, 2)));
fprintf('TRUE  OD   [140,203]: active sectors=%d/%d, counts=%s\n', rTrue.active, nSectors, mat2str(round(rTrue.counts, 2)));

function report = angularSpreadLocal(vesselMask, xx, yy, cx, cy, radius, nSectors)
dx = xx - cx; dy = yy - cy;
dist = sqrt(dx.^2 + dy.^2);
ang = mod(atan2(dy, dx), 2 * pi);
inRadius = dist <= radius & dist > radius * 0.15;
sectorCounts = zeros(1, nSectors);
for s = 1:nSectors
    lo = (s - 1) * 2 * pi / nSectors; hi = s * 2 * pi / nSectors;
    sectorMask = inRadius & ang >= lo & ang < hi;
    sectorCounts(s) = nnz(vesselMask & sectorMask) / max(1, nnz(sectorMask));
end
active = nnz(sectorCounts > 0.05);
report = struct('counts', sectorCounts, 'active', active, 'total', sum(sectorCounts));
end
