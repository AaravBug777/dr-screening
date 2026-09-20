% Diagnoses the ~11% of IDRiD OD localization cases that still fail
% (error >= 1 OD diameter) and the weaker fovea success rate, the same
% hypothesis-testing way the ORIGINAL OD-mislocalization bug was found
% (diagnoseODMisdetection.m -- two wrong hypotheses tested and rejected
% quantitatively before the real cause, tortuous-vessel-cluster
% confusion, was found and fixed). That fix addressed one specific
% failure mode; this asks whether the REMAINING failures share a
% different, not-yet-characterized common cause, by comparing several
% candidate discriminating features between failure and success cases
% with a non-parametric test (ranksum, Statistics and Machine Learning
% Toolbox -- same tool this project already uses for the NV directional
% check) rather than eyeballing a handful of images.
%
% Candidate features tested: OD confidence score itself (does the
% detector already "know" when it's wrong via a low score?), image
% contrast (std of the green channel within FOV), vessel density,
% overall image brightness, and FOV size (a proxy for how zoomed-in/
% cropped the capture is).

setupPathsRoot = fileparts(mfilename('fullpath'));
run(fullfile(setupPathsRoot, '..', 'setupPaths.m'));

idridDir = fullfile(setupPathsRoot, '..', '..', 'training', 'data', 'idrid');
imgDir = fullfile(idridDir, 'C. Localization', '1. Original Images', 'a. Training Set');
odCsvPath = fullfile(idridDir, 'C. Localization', '2. Groundtruths', '1. Optic Disc Center Location', 'a. IDRiD_OD_Center_Training Set_Markups.csv');
odTable = readtable(odCsvPath);

opts = defaultSegmentationConfig();
n = height(odTable);

errDiam = nan(n,1); odConf = nan(n,1); contrast = nan(n,1);
vesselDensity = nan(n,1); brightness = nan(n,1); fovFrac = nan(n,1);

tic;
for k = 1:n
    imgId = odTable.ImageNo{k};
    imgPath = fullfile(imgDir, [imgId '.jpg']);
    if ~isfile(imgPath), continue; end
    img = imread(imgPath);
    [h0, w0, ~] = size(img);
    scale = 1;
    if max(h0, w0) > opts.MaxWorkingDim
        scale = opts.MaxWorkingDim / max(h0, w0);
    end
    trueOD = [odTable.X_Coordinate(k), odTable.Y_Coordinate(k)];

    [vesselMask, vesselInfo] = segmentVessels(img, opts);
    odInfo = localizeOpticDisc(img, vesselMask, opts);
    predOD = odInfo.center / scale;
    odDiameterNative = (odInfo.radius * 2) / scale;
    errDiam(k) = hypot(predOD(1)-trueOD(1), predOD(2)-trueOD(2)) / odDiameterNative;

    odConf(k) = odInfo.confidence;
    vesselDensity(k) = vesselInfo.vesselDensity;
    [fovMask, ~] = computeFOVMask(img);
    green = im2double(img(:,:,2));
    contrast(k) = std(green(fovMask));
    brightness(k) = mean(green(fovMask));
    fovFrac(k) = nnz(fovMask) / numel(fovMask);

    if mod(k, 50) == 0, fprintf('  %d/%d (%.1f s elapsed)\n', k, n, toc); end
end

valid = ~isnan(errDiam);
isFail = valid & errDiam >= 1;
isSuccess = valid & errDiam < 1;
fprintf('\n%d failures / %d total (%.1f%%)\n\n', nnz(isFail), nnz(valid), 100*nnz(isFail)/nnz(valid));

features = {'odConf', odConf; 'contrast', contrast; 'vesselDensity', vesselDensity; ...
    'brightness', brightness; 'fovFrac', fovFrac};

fprintf('%-15s %12s %12s %10s\n', 'Feature', 'FailMedian', 'SuccMedian', 'p (ranksum)');
for i = 1:size(features,1)
    name = features{i,1};
    vals = features{i,2};
    failVals = vals(isFail);
    succVals = vals(isSuccess);
    p = ranksum(failVals, succVals);
    fprintf('%-15s %12.4f %12.4f %10.4f%s\n', name, median(failVals), median(succVals), p, ...
        tern(p < 0.05, '  <-- SIGNIFICANT', ''));
end

fprintf('\nInterpretation: a significant (p<0.05) feature is a real, quantified candidate\n');
fprintf('explanation for the remaining failures -- worth diagnosing further with actual\n');
fprintf('failure images, the way the original OD bug was chased down. A feature that is\n');
fprintf('NOT significant is honestly ruled out, not left as an unexamined guess.\n');

function s = tern(cond, a, b)
if cond, s = a; else, s = b; end
end
