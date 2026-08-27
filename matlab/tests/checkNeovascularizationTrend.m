% Directional sanity check for detectNeovascularization.m, run against real
% IDRiD Disease Grading images -- NOT a pixel-level validation (no NV
% ground truth mask exists in any dataset available to this project; see
% detectNeovascularization.m's calibration caveat), but a real check
% against real data all the same: candidate output should trend higher on
% images already clinically graded PDR/grade-4 (which by the ICDR
% definition MUST contain neovascularization) than on images graded
% No-DR/grade-0 (which cannot contain any DR lesion at all, NV included).
%
% Uses ranksum (Statistics and Machine Learning Toolbox) -- a
% non-parametric two-sample test appropriate here since candidate-count
% distributions are small-integer and clearly not Gaussian, so a t-test's
% normality assumption would not hold.

setupPathsRoot = fileparts(mfilename('fullpath'));
run(fullfile(setupPathsRoot, '..', 'setupPaths.m'));

idridDir = fullfile(setupPathsRoot, '..', '..', 'training', 'data', 'idrid');
imgDir = fullfile(idridDir, 'B. Disease Grading', '1. Original Images', 'a. Training Set');
gradingCsv = fullfile(idridDir, 'B. Disease Grading', '2. Groundtruths', 'a. IDRiD_Disease Grading_Training Labels.csv');

gradingTable = readtable(gradingCsv);
gradeCol = gradingTable.RetinopathyGrade;
nameCol = gradingTable.ImageName;

rng(42); % matches SEED=42 in training/config.py, for reproducibility
nPerGroup = 20;

grade0Idx = find(gradeCol == 0);
grade4Idx = find(gradeCol == 4);
grade0Sample = grade0Idx(randperm(numel(grade0Idx), min(nPerGroup, numel(grade0Idx))));
grade4Sample = grade4Idx(randperm(numel(grade4Idx), min(nPerGroup, numel(grade4Idx))));

opts = defaultSegmentationConfig();

tic;
fprintf('Running grade-0 (No DR) group, n=%d...\n', numel(grade0Sample));
[counts0, nvd0, areas0] = runGroup(grade0Sample, nameCol, imgDir, opts);
fprintf('Running grade-4 (PDR) group, n=%d...\n', numel(grade4Sample));
[counts4, nvd4, areas4] = runGroup(grade4Sample, nameCol, imgDir, opts);
elapsed = toc;

valid0 = ~isnan(counts0);
valid4 = ~isnan(counts4);

fprintf('\nProcessed %d images in %.1f s (%.2f s/image)\n', ...
    numel(grade0Sample) + numel(grade4Sample), elapsed, elapsed / (numel(grade0Sample) + numel(grade4Sample)));

fprintf('\n--- NV candidate count ---\n');
fprintf('grade-0 (No DR, n=%d):  mean=%.2f median=%.1f\n', nnz(valid0), mean(counts0(valid0)), median(counts0(valid0)));
fprintf('grade-4 (PDR,   n=%d):  mean=%.2f median=%.1f\n', nnz(valid4), mean(counts4(valid4)), median(counts4(valid4)));

fprintf('\n--- NV candidate total area (px) ---\n');
fprintf('grade-0 (No DR): mean=%.1f median=%.1f\n', mean(areas0(valid0)), median(areas0(valid0)));
fprintf('grade-4 (PDR):   mean=%.1f median=%.1f\n', mean(areas4(valid4)), median(areas4(valid4)));

fprintf('\n--- NVD (at-the-disc) candidate count ---\n');
fprintf('grade-0 (No DR): mean=%.2f\n', mean(nvd0(valid0)));
fprintf('grade-4 (PDR):   mean=%.2f\n', mean(nvd4(valid4)));

% Non-parametric two-sample test (Statistics and Machine Learning Toolbox):
% is the grade-4 count distribution shifted higher than grade-0's?
[pCount, ~, statsCount] = ranksum(counts4(valid4), counts0(valid0), 'tail', 'right');
[pArea, ~, statsArea] = ranksum(areas4(valid4), areas0(valid0), 'tail', 'right');

fprintf('\n--- ranksum (one-sided: grade-4 > grade-0) ---\n');
fprintf('candidate count: p=%.4f (ranksum stat=%.1f)\n', pCount, statsCount.ranksum);
fprintf('candidate area:  p=%.4f (ranksum stat=%.1f)\n', pArea, statsArea.ranksum);

if pCount < 0.05
    fprintf('\nDIRECTIONAL CHECK PASSED: PDR images show significantly more NV candidates than No-DR images (p<0.05).\n');
else
    fprintf('\nDIRECTIONAL CHECK INCONCLUSIVE at alpha=0.05 -- report this honestly, do not overstate detectNeovascularization.m''s reliability.\n');
end
fprintf('Reminder: this is a directional trend check, NOT lesion-level validation -- see detectNeovascularization.m''s calibration caveat.\n');

function [counts, nvdCounts, areas] = runGroup(rowIdx, nameCol, imgDir, opts)
n = numel(rowIdx);
counts = nan(n, 1);
nvdCounts = nan(n, 1);
areas = nan(n, 1);
for k = 1:n
    imgId = nameCol{rowIdx(k)};
    imgPath = fullfile(imgDir, [imgId '.jpg']);
    if ~isfile(imgPath)
        continue
    end
    img = imread(imgPath);
    vesselMask = segmentVessels(img, opts);
    odInfo = localizeOpticDisc(img, vesselMask, opts);
    [~, nvInfo] = detectNeovascularization(img, vesselMask, odInfo, opts);
    counts(k) = nvInfo.count;
    nvdCounts(k) = nvInfo.nvdCount;
    areas(k) = nvInfo.totalAreaPx;
end
end
