% Check real lesion size distributions in IDRiD ground truth (native
% resolution, 4288x2848) to inform what working resolution lesion detection
% needs -- MAs in particular are tiny and could be destroyed by the 640px
% working resolution used elsewhere in this pipeline (quality/vessels/OD/fovea).
setupPathsRoot = fileparts(mfilename('fullpath'));
idridDir = fullfile(setupPathsRoot, '..', '..', 'training', 'data', 'idrid', 'A. Segmentation', '2. All Segmentation Groundtruths', 'a. Training Set');

lesionDirs = {'1. Microaneurysms', 'MA'; '2. Haemorrhages', 'HE'; '3. Hard Exudates', 'EX'};

for i = 1:size(lesionDirs, 1)
    folder = fullfile(idridDir, lesionDirs{i, 1});
    suffix = lesionDirs{i, 2};
    files = dir(fullfile(folder, ['*_' suffix '.tif']));
    n = min(10, numel(files));
    allAreas = [];
    allEquivDiam = [];
    for k = 1:n
        mask = imread(fullfile(folder, files(k).name));
        cc = bwconncomp(mask);
        props = regionprops(cc, 'Area', 'EquivDiameter');
        allAreas = [allAreas; [props.Area]']; %#ok<AGROW>
        allEquivDiam = [allEquivDiam; [props.EquivDiameter]']; %#ok<AGROW>
    end
    fprintf('%s (from %d images, %d lesions): area px min=%.0f p10=%.0f median=%.0f p90=%.0f max=%.0f\n', ...
        lesionDirs{i, 1}, n, numel(allAreas), min(allAreas), prctile(allAreas,10), median(allAreas), prctile(allAreas,90), max(allAreas));
    fprintf('%s equiv. diameter (px, native res): min=%.1f p10=%.1f median=%.1f p90=%.1f max=%.1f\n', ...
        lesionDirs{i, 1}, min(allEquivDiam), prctile(allEquivDiam,10), median(allEquivDiam), prctile(allEquivDiam,90), max(allEquivDiam));
end
