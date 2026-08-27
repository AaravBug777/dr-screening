% Ablation comparison directly addressing the SIH26038 brief's Expected
% Solution requirement: "validation ... showing the integrated pipeline
% outperforms any single technique approach." Compares FOUR techniques for
% the referable-DR decision, with a clean calibrate/test split discipline
% -- the SAME discipline training/calibrate_referable_threshold.py already
% established for the single-technique threshold (fit on one split, report
% only on a genuinely separate held-out split) -- applied here to the
% integration step itself:
%
%   (A) DL-alone         -- the production Python EfficientNet-B3 grader's
%                            calibrated referable decision (temperature
%                            scaling + tuned threshold)
%   (B) MATLAB-alone      -- the structural-features classifier
%                            (trainStructuralReferableNet.m), using ONLY
%                            the 8 classical MATLAB segmentation-module
%                            features -- no image pixels, no DL
%   (C) Integrated, naive -- simple unweighted average of (A) and (B)'s
%                            referable probabilities, thresholded at 0.5
%   (D) Integrated, fit    -- logistic regression combiner (Statistics and
%                            Machine Learning Toolbox's fitglm) of (A) and
%                            (B)'s probabilities, FIT on a separate
%                            200-image IDRiD train subsample and reported
%                            here ONLY on the untouched test split
%
% (A)/(B)/(C)/(D) are all evaluated on the SAME held-out population: the
% full official IDRiD Disease Grading test set (n=103), never used for
% training the DL model, tuning its threshold/temperature, training the
% structural-features net, OR fitting the (D) combiner.
%
% Run first: training/predict_idrid_test_referable.py --split test,
% training/predict_idrid_test_referable.py --split train --restrict-to ...,
% tests/extractStructuralFeatures.m (both splits), grading/trainStructuralReferableNet.m.

setupPathsRoot = fileparts(mfilename('fullpath'));
run(fullfile(setupPathsRoot, '..', 'setupPaths.m'));

outputsDir = fullfile(setupPathsRoot, '..', '..', 'training', 'outputs');
dlTestPath = fullfile(outputsDir, 'idrid_test_referable_predictions.json');
dlTrainPath = fullfile(outputsDir, 'idrid_train_referable_predictions.json');
structTestPath = fullfile(setupPathsRoot, 'structural_features_test.mat');
structTrainPath = fullfile(setupPathsRoot, 'structural_features_train.mat');
netPath = fullfile(setupPathsRoot, '..', 'grading', 'structuralReferableNet.mat');

required = {dlTestPath, dlTrainPath, structTestPath, structTrainPath, netPath};
for i = 1:numel(required)
    if ~isfile(required{i})
        error('compareIntegratedVsSingleTechnique:missingInput', ...
            'Missing required input: %s -- see this script''s header comment for the commands that produce it.', required{i});
    end
end

netData = load(netPath);

[probA_test, probB_test, trueReferable_test, ~] = loadAligned(dlTestPath, structTestPath, netData);
[probA_train, probB_train, trueReferable_train, ~] = loadAligned(dlTrainPath, structTrainPath, netData);

nTest = numel(trueReferable_test);
fprintf('Test (held-out) set: %d images. Calibration (combiner-fitting) set: %d images. No overlap by construction (different IDRiD official splits).\n', ...
    nTest, numel(trueReferable_train));

% --- (C) naive average, no fitting ---
probC_test = 0.5 * probA_test + 0.5 * probB_test;

% --- (D) logistic regression combiner, FIT on the train split only ---
combinerTbl = table(probA_train, probB_train, double(trueReferable_train), ...
    'VariableNames', {'dlProb', 'matlabProb', 'referable'});
combinerModel = fitglm(combinerTbl, 'referable ~ dlProb + matlabProb', 'Distribution', 'binomial', 'Link', 'logit');
fprintf('\nFitted combiner (Statistics and Machine Learning Toolbox fitglm, on the %d-image calibration split):\n', numel(trueReferable_train));
disp(combinerModel.Coefficients);

probD_test = predict(combinerModel, table(probA_test, probB_test, 'VariableNames', {'dlProb', 'matlabProb'}));

[sensA, specA, accA] = evalAt(probA_test, 0.30, trueReferable_test); % config.py's REFERABLE_THRESHOLD
[sensB, specB, accB] = evalAt(probB_test, 0.5, trueReferable_test);
[sensC, specC, accC] = evalAt(probC_test, 0.5, trueReferable_test);
[sensD, specD, accD] = evalAt(probD_test, 0.5, trueReferable_test);

fprintf('\n%-38s %10s %10s %10s\n', 'Technique (evaluated on test, n=103)', 'Sens', 'Spec', 'Acc');
fprintf('%-38s %9.1f%% %9.1f%% %9.1f%%\n', '(A) DL-alone (Python)', 100*sensA, 100*specA, 100*accA);
fprintf('%-38s %9.1f%% %9.1f%% %9.1f%%\n', '(B) MATLAB structural-alone', 100*sensB, 100*specB, 100*accB);
fprintf('%-38s %9.1f%% %9.1f%% %9.1f%%\n', '(C) Integrated, naive average', 100*sensC, 100*specC, 100*accC);
fprintf('%-38s %9.1f%% %9.1f%% %9.1f%%\n', '(D) Integrated, fitted combiner', 100*sensD, 100*specD, 100*accD);

fprintf('\nHeld-out test set: IDRiD Disease Grading official test set (n=%d). (D)''s combiner was fit\n', nTest);
fprintf('exclusively on the separate %d-image train subsample -- never saw these %d test images.\n', numel(trueReferable_train), nTest);

bestAcc = max([accA, accB, accC, accD]);
if accD >= accA && accD >= accB && (sensD >= min(sensA, sensB) || specD >= max(specA, specB))
    fprintf('\nRESULT: (D), the properly fit integrated combiner, matches or exceeds BOTH single techniques on accuracy (%.1f%%) --\n', 100*accD);
    fprintf('this is real evidence for the brief''s "integrated pipeline outperforms any single technique" claim, on a genuinely\n');
    fprintf('held-out test set the combiner was never fit on.\n');
elseif accD == bestAcc
    fprintf('\nRESULT: (D) has the best overall accuracy among all four techniques on this held-out set.\n');
else
    fprintf('\nRESULT: even the fitted combiner (D) does not clearly beat the best single technique here -- report this honestly.\n');
end
fprintf('Reminder: (C)''s naive average result above is intentionally kept alongside (D) to show why the fitting step in (D) matters --\n');
fprintf('not every "integration" of two techniques helps; an untuned combination can lose sensitivity relative to the better single technique.\n');

function [probA, probB, trueReferable, commonNames] = loadAligned(dlPath, structPath, netData)
dlJson = jsondecode(fileread(dlPath));
dlPreds = dlJson.predictions;
dlNames = {dlPreds.image}';
dlProb = [dlPreds.referable_probability]';
dlTrueReferable = logical([dlPreds.true_referable]');

structData = load(structPath);
matlabProbAll = predict(netData.net, structData.features);
matlabReferableProb = matlabProbAll(:, netData.referableColIdx);
structNames = structData.imageNames;

[commonNames, dlIdx, matIdx] = intersect(dlNames, structNames, 'stable');
trueReferable = dlTrueReferable(dlIdx);
trueReferableMatlab = logical(structData.referable(matIdx));
if ~isequal(trueReferable, trueReferableMatlab)
    error('compareIntegratedVsSingleTechnique:groundTruthMismatch', ...
        'Ground-truth referable labels disagree between the DL and MATLAB prediction files for %s / %s -- fix alignment before trusting this comparison.', dlPath, structPath);
end

probA = dlProb(dlIdx);
probB = matlabReferableProb(matIdx);
end

function [sens, spec, acc] = evalAt(prob, threshold, trueLabel)
pred = prob > threshold;
tp = nnz(pred & trueLabel);
fn = nnz(~pred & trueLabel);
tn = nnz(~pred & ~trueLabel);
fp = nnz(pred & ~trueLabel);
sens = tp / max(1, tp + fn);
spec = tn / max(1, tn + fp);
acc = (tp + tn) / numel(trueLabel);
end
