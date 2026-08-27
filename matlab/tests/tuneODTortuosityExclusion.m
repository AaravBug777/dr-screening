% Quick sweep: does raising the tortuosity threshold used by the OD
% exclusion (making it fire only on MORE extreme tortuosity, not the same
% 1.35 floor detectNeovascularization.m uses) reduce the regression found
% on the full IDRiD set while still fixing the motivating case? Uses a
% random 120-image subsample for speed -- a full re-validation only runs
% once a threshold looks promising here.

setupPathsRoot = fileparts(mfilename('fullpath'));
run(fullfile(setupPathsRoot, '..', 'setupPaths.m'));

idridDir = fullfile(setupPathsRoot, '..', '..', 'training', 'data', 'idrid');
imgDir = fullfile(idridDir, 'C. Localization', '1. Original Images', 'a. Training Set');
odCsvPath = fullfile(idridDir, 'C. Localization', '2. Groundtruths', '1. Optic Disc Center Location', 'a. IDRiD_OD_Center_Training Set_Markups.csv');
odTable = readtable(odCsvPath);

rng(42);
n = height(odTable);
sampleIdx = randperm(n, 120);

baseOpts = defaultSegmentationConfig();
thresholds = [1.35, 1.5, 1.7, 1.9, 2.1, Inf]; % Inf = exclusion effectively disabled (sanity anchor)

for th = thresholds
    opts = baseOpts;
    opts.NVTortuosityThreshold = th;
    errDiam = nan(numel(sampleIdx), 1);
    for k = 1:numel(sampleIdx)
        row = sampleIdx(k);
        imgId = odTable.ImageNo{row};
        imgPath = fullfile(imgDir, [imgId '.jpg']);
        if ~isfile(imgPath)
            continue
        end
        img = imread(imgPath);
        [h0, w0, ~] = size(img);
        scale = 1;
        if max(h0, w0) > opts.MaxWorkingDim
            scale = opts.MaxWorkingDim / max(h0, w0);
        end
        trueOD = [odTable.X_Coordinate(row), odTable.Y_Coordinate(row)];
        vesselMask = segmentVessels(img, opts);
        odInfo = localizeOpticDisc(img, vesselMask, opts);
        predOD = odInfo.center / scale;
        odDiameterNative = (odInfo.radius * 2) / scale;
        errDiam(k) = hypot(predOD(1) - trueOD(1), predOD(2) - trueOD(2)) / odDiameterNative;
    end
    valid = ~isnan(errDiam);
    successRate = 100 * mean(errDiam(valid) < 1);
    fprintf('NVTortuosityThreshold=%.2f: success rate (n=%d) = %.1f%%\n', th, nnz(valid), successRate);
end
