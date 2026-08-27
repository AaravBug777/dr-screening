% Does the false OD peak on IDRiD_016.jpg coincide with a detected
% neovascularization candidate? A region that's dense+bright+vessel-rich
% but NOT exudate is exactly the NV signature detectNeovascularization.m
% targets -- worth checking directly given this is a Severe-grade image.

setupPathsRoot = fileparts(mfilename('fullpath'));
run(fullfile(setupPathsRoot, '..', 'setupPaths.m'));

opts = defaultSegmentationConfig();
img = imread(fullfile(setupPathsRoot, '..', '..', 'training', 'data', 'idrid', 'B. Disease Grading', '1. Original Images', 'a. Training Set', 'IDRiD_016.jpg'));

[vesselMask, ~] = segmentVessels(img, opts);
odInfo = localizeOpticDisc(img, vesselMask, opts);
[nvMask, nvInfo] = detectNeovascularization(img, vesselMask, odInfo, opts);

fprintf('OD localized at [%d %d] (this run), NV candidates found: %d (nvd=%d nve=%d)\n', ...
    round(odInfo.center(1)), round(odInfo.center(2)), nvInfo.count, nvInfo.nvdCount, nvInfo.nveCount);

winR = 20;
[h, w] = size(nvMask);
cx = round(odInfo.center(1)); cy = round(odInfo.center(2));
y0 = max(1, cy - winR); y1 = min(h, cy + winR);
x0 = max(1, cx - winR); x1 = min(w, cx + winR);
patch = nvMask(y0:y1, x0:x1);
fprintf('NV mask coverage in a window around the CURRENT OD estimate: %.2f%% of window pixels (%d px)\n', ...
    100 * mean(patch(:)), nnz(patch));

if ~isempty(nvInfo.regions)
    for i = 1:numel(nvInfo.regions)
        r = nvInfo.regions(i);
        d = hypot(r.centroid(1) - odInfo.center(1), r.centroid(2) - odInfo.center(2));
        fprintf('  NV region %d: centroid=[%.0f %.0f] zone=%s tortuosity=%.2f dist-to-OD-estimate=%.1fpx\n', ...
            i, r.centroid(1), r.centroid(2), r.zone, r.tortuosity, d);
    end
end
