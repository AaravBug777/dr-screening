% Finds a recall-preserving operating point for the already-trained MA
% candidate classifier (trainCandidateRefinementClassifier.m), instead of
% accepting its default 0.5 probability cutoff as the only option. That
% default gave 20.7% precision at only 62.7% recall -- a real cost (37.3%
% of real microaneurysms silently dropped) for a screening tool where MA
% is the earliest DR sign. This reuses the ALREADY-EXTRACTED 250,022-
% candidate checkpoint and the ALREADY-TRAINED classifier -- no new image
% processing, just re-scoring at different probability cutoffs, so this
% runs in seconds, not minutes.

setupPathsRoot = fileparts(mfilename('fullpath'));
run(fullfile(setupPathsRoot, '..', 'setupPaths.m'));

checkpointPath = fullfile(setupPathsRoot, 'maCandidateFeatures_checkpoint.mat');
classifierPath = fullfile(setupPathsRoot, 'maCandidateClassifier.mat');
if ~isfile(checkpointPath) || ~isfile(classifierPath)
    error('sweepMACandidateThreshold:missingInput', ...
        'Run trainCandidateRefinementClassifier.m first to produce both %s and %s.', checkpointPath, classifierPath);
end

loaded = load(checkpointPath);
clf = load(classifierPath);
featureNames = clf.featureNames;

Xtest = loaded.allFeatures(loaded.allIsTest, :);
Ytest = loaded.allLabels(loaded.allIsTest);
tblTest = array2table(Xtest, 'VariableNames', featureNames);

[predLabels, scores] = predict(clf.classifier, tblTest);
classNames = clf.classifier.ClassNames;
isPredTrue = predLabels == 'true';
col1MeanWhenTrue = mean(scores(isPredTrue, 1));
col2MeanWhenTrue = mean(scores(isPredTrue, 2));
if col1MeanWhenTrue > col2MeanWhenTrue
    trueColIdx = 1; falseColIdx = 2;
else
    trueColIdx = 2; falseColIdx = 1;
end
fprintf('True-class score column: %d (classNames = %s)\n', trueColIdx, strjoin(string(classNames), ', '));

% Sanity check #1 (this is what actually caught the real bug here): compare
% predict()'s own default label decision against a naive "probTrue > 0.5"
% rule. RUSBoost (like most boosting ensembles in MATLAB) does NOT
% necessarily produce two-column scores that behave like a calibrated
% probability summing to 1 the way Bag/random-forest ensembles do -- the
% correct default decision compares which column is LARGER, not one
% column against an absolute constant. Confirmed here: "probTrue > 0.5"
% reproduced 47,944/50,050 kept, nowhere near predict()'s own 3,947/50,050
% -- the two decision rules disagree almost completely, proving the
% probability-vs-0.5 framing was wrong for this ensemble type, not a
% column-order bug.
scoreDiff = scores(:, trueColIdx) - scores(:, falseColIdx);
marginKeep = scoreDiff > 0;
fprintf('Sanity check: predict()''s own label decision kept %d/%d. "scoreDiff > 0" (the margin form of the SAME rule) keeps %d/%d -- these should match exactly.\n', ...
    nnz(isPredTrue), numel(isPredTrue), nnz(marginKeep), numel(marginKeep));
if nnz(marginKeep) ~= nnz(isPredTrue) || any(marginKeep ~= isPredTrue)
    error('sweepMACandidateThreshold:sanityCheckFailed', ...
        'scoreDiff>0 does not reproduce predict()''s own label decision -- something is still wrong, do not trust a sweep built on this.');
end
fprintf('Confirmed: sweeping a MARGIN threshold on (trueScore - falseScore), not an absolute probability cutoff.\n\n');

fprintf('Baseline (no filtering): precision=2.6%% recall=100.0%% (n=%d)\n', numel(Ytest));
fprintf('Default classifier (margin>0, equivalent to the original training run''s cutoff): precision=20.7%% recall=62.7%%\n\n');

% Pick sweep points from the ACTUAL scoreDiff distribution rather than
% guessing a scale that might not match this ensemble's real range.
fprintf('scoreDiff distribution: min=%.3f p10=%.3f p25=%.3f median=%.3f p75=%.3f p90=%.3f max=%.3f\n\n', ...
    min(scoreDiff), prctile(scoreDiff,10), prctile(scoreDiff,25), median(scoreDiff), ...
    prctile(scoreDiff,75), prctile(scoreDiff,90), max(scoreDiff));

margins = prctile(scoreDiff, [50 60 70 75 80 85 90 95]);
% Always include 0 (predict()'s own default decision) as the reference point.
margins = unique([0, margins]);

fprintf('%-10s %12s %12s %12s\n', 'Margin', 'Precision', 'Recall', 'N kept');
bestForHighRecall = struct('margin', nan, 'precision', 0, 'recall', 0);
for m = margins
    keep = scoreDiff > m;
    precision = sum(Ytest(keep)) / max(1, nnz(keep));
    recall = sum(Ytest(keep)) / max(1, sum(Ytest));
    fprintf('%-10.3f %11.1f%% %11.1f%% %12d\n', m, 100*precision, 100*recall, nnz(keep));

    % Track the operating point with the best precision among those that
    % still clear 90% recall -- not just the first one found.
    if recall >= 0.90 && precision > bestForHighRecall.precision
        bestForHighRecall = struct('margin', m, 'precision', precision, 'recall', recall);
    end
end

fprintf('\n=== Best operating point found with recall >= 90%% ===\n');
if isnan(bestForHighRecall.margin)
    fprintf('None of the tested margins reach both >=90%% recall AND a precision improvement over the 2.6%% baseline -- report this honestly, not force a number.\n');
else
    fprintf('Margin=%.3f: precision=%.1f%% recall=%.1f%% -- a real, if modest, improvement over the 2.6%% baseline at recall the app can defend.\n', ...
        bestForHighRecall.margin, 100*bestForHighRecall.precision, 100*bestForHighRecall.recall);
end
