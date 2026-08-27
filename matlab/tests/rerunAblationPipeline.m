% Driver: re-extracts structural+radiomics features for both IDRiD splits,
% retrains the structural-features net, and reruns the integrated-vs-
% single-technique ablation -- one batch call, since each step depends on
% the previous step's cached .mat output.
%
% NOTE on a real bug this script's first version had: each `run()`'d
% script below sets its OWN local `setupPathsRoot = fileparts(mfilename(
% 'fullpath'))` -- but `run()` executes a script in the CALLING workspace,
% not an isolated one, so each step's `setupPathsRoot` silently overwrites
% this driver's own variable of the same name with THAT script's location
% (e.g. after step 3 runs, `setupPathsRoot` in this workspace points at
% grading/, not tests/). Step 4 used to build its path off that clobbered
% value and failed with a real "file not found" pointed at the wrong
% folder. Fixed by capturing this driver's own root under a name none of
% the called scripts also use (`pipelineRoot`), and building every path
% off THAT instead of the collision-prone `setupPathsRoot`.
pipelineRoot = fileparts(mfilename('fullpath'));
run(fullfile(pipelineRoot, '..', 'setupPaths.m'));

fprintf('=== Step 1/4: extracting features (train split) ===\n');
SPLIT_NAME = 'train';
run(fullfile(pipelineRoot, 'extractStructuralFeatures.m'));

fprintf('\n=== Step 2/4: extracting features (test split) ===\n');
SPLIT_NAME = 'test';
run(fullfile(pipelineRoot, 'extractStructuralFeatures.m'));

fprintf('\n=== Step 3/4: training structural-features net ===\n');
run(fullfile(pipelineRoot, '..', 'grading', 'trainStructuralReferableNet.m'));

fprintf('\n=== Step 4/4: integrated-vs-single-technique ablation ===\n');
run(fullfile(pipelineRoot, 'compareIntegratedVsSingleTechnique.m'));
