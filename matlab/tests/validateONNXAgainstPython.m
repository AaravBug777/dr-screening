% Three-way cross-check: does MATLAB Deep Learning Toolbox's
% importNetworkFromONNX + predict() reproduce the same predictions as the
% original PyTorch checkpoint and ONNX Runtime, on the exact same
% preprocessed pixels? Run training/export_onnx.py first -- it produces
% both the ONNX model and the reference JSON + fixture images this script
% reads.
%
% This is the actual evidence behind "Deep Learning Toolbox is used" in
% matlab/README.md's tool-coverage note -- not just an import that's never
% run, but a verified match against the real trained network's real
% predictions on real images.

setupPathsRoot = fileparts(mfilename('fullpath'));
run(fullfile(setupPathsRoot, '..', 'setupPaths.m'));

outputsDir = fullfile(setupPathsRoot, '..', '..', 'training', 'outputs');
referencePath = fullfile(outputsDir, 'onnx_reference_predictions.json');

if ~isfile(referencePath)
    error('validateONNXAgainstPython:missingReference', ...
        'Reference file not found at %s -- run training/export_onnx.py first.', referencePath);
end

refJson = jsondecode(fileread(referencePath));
refs = refJson.references;
classNames = refJson.class_names;

n = numel(refs);
results = table();

fprintf('Running MATLAB Deep Learning Toolbox inference on %d reference images...\n', n);
tic;
for k = 1:n
    ref = refs(k);
    fixturePath = fullfile(outputsDir, ref.fixture_image);
    if ~isfile(fixturePath)
        warning('Missing fixture image %s, skipping.', fixturePath);
        continue
    end

    [predClass, predLabel, probs, logits] = predictGradeMATLAB(fixturePath);

    pyProbs = ref.probabilities(:)';
    maxProbDiff = max(abs(probs - pyProbs));
    classMatch = (predClass == ref.predicted_class);

    row = table({ref.image}, ref.predicted_class, predClass, classMatch, ...
        pyProbs(ref.predicted_class + 1), probs(predClass + 1), maxProbDiff, ...
        'VariableNames', {'image', 'pyClass', 'matlabClass', 'classMatch', ...
        'pyTopProb', 'matlabTopProb', 'maxProbAbsDiff'});
    results = [results; row]; %#ok<AGROW>

    fprintf('  %s: python=%s (class %d) matlab=%s (class %d) maxProbDiff=%.4f %s\n', ...
        ref.image, classNames{ref.predicted_class + 1}, ref.predicted_class, ...
        predLabel, predClass, maxProbDiff, tern(classMatch, '[MATCH]', '[MISMATCH]'));
end
elapsed = toc;

fprintf('\nProcessed %d images in %.1f s (%.2f s/image, includes one-time ONNX import)\n', ...
    height(results), elapsed, elapsed / max(1, height(results)));

nMatch = sum(results.classMatch);
fprintf('\nClass agreement (MATLAB argmax == PyTorch argmax): %d/%d\n', nMatch, height(results));
fprintf('Max top-class probability difference across all images: %.4f\n', max(results.maxProbAbsDiff));
disp(results);

if nMatch == height(results) && max(results.maxProbAbsDiff) < 0.02
    fprintf('\nPASS: MATLAB Deep Learning Toolbox inference matches PyTorch/ONNX Runtime.\n');
else
    error('validateONNXAgainstPython:mismatch', ...
        'FAIL: MATLAB inference disagrees with the PyTorch/ONNX Runtime reference -- do not claim Deep Learning Toolbox parity until this is fixed.');
end

function s = tern(cond, a, b)
if cond
    s = a;
else
    s = b;
end
end
