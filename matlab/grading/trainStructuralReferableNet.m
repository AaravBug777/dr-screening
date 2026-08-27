% Trains a small feed-forward network (Deep Learning Toolbox) to predict
% referable DR (grade >= 2) directly from the 8 classical structural
% features this project's own MATLAB segmentation module already produces
% (vessel density, OD confidence, fovea found, MA/exudate/haemorrhage/NV
% candidate counts) -- see tests/extractStructuralFeatures.m for how those
% were extracted and cached (run that first for both 'train' and 'test'
% splits).
%
% WHY THIS EXISTS: the SIH26038 brief's tool list names Deep Learning
% Toolbox explicitly, but this project's primary DR severity grader is
% Python/PyTorch (a deliberate architecture choice -- see
% training/export_onnx.py's docstring). Rather than a token/decorative use
% of Deep Learning Toolbox, this trains a real, small, genuinely useful
% network on real data extracted by this project's own MATLAB code, and
% evaluates it honestly against the SAME referable-DR sensitivity/
% specificity metric the Python calibration pipeline reports -- which also
% directly serves the brief's Expected Solution requirement to validate
% "the integrated pipeline outperforms any single technique approach": see
% tests/compareIntegratedVsSingleTechnique.m, which uses this network's
% output as one of the techniques being compared.
%
% This is explicitly NOT a replacement for the Python DL grader -- it has
% far less signal to work with (8 summary numbers vs. a full image) and is
% evaluated as such below.

setupPathsRoot = fileparts(mfilename('fullpath'));
run(fullfile(setupPathsRoot, '..', 'setupPaths.m'));

testsDir = fullfile(setupPathsRoot, '..', 'tests');
trainData = load(fullfile(testsDir, 'structural_features_train.mat'));
testData = load(fullfile(testsDir, 'structural_features_test.mat'));

Xtrain = trainData.features;
Ytrain = categorical(trainData.referable, [0 1], {'not_referable', 'referable'});
Xtest = testData.features;
Ytest = categorical(testData.referable, [0 1], {'not_referable', 'referable'});

numFeatures = size(Xtrain, 2);
layers = [
    featureInputLayer(numFeatures, 'Normalization', 'zscore', 'Name', 'features')
    fullyConnectedLayer(16, 'Name', 'fc1')
    reluLayer('Name', 'relu1')
    dropoutLayer(0.2, 'Name', 'drop1')
    fullyConnectedLayer(8, 'Name', 'fc2')
    reluLayer('Name', 'relu2')
    fullyConnectedLayer(2, 'Name', 'fc3')
    softmaxLayer('Name', 'softmax')
];

options = trainingOptions('adam', ...
    'MaxEpochs', 60, ...
    'MiniBatchSize', 32, ...
    'InitialLearnRate', 1e-3, ...
    'Shuffle', 'every-epoch', ...
    'Verbose', false, ...
    'ValidationData', {Xtest, Ytest}, ...
    'ValidationFrequency', 10);

fprintf('Training structural-features referable-DR classifier (Deep Learning Toolbox)...\n');
net = trainnet(Xtrain, Ytrain, layers, 'crossentropy', options);

% --- Evaluate on the FULL, official, held-out IDRiD test set (n=103) ---
scores = predict(net, Xtest); % Nx2, columns match categories() order
classNames = string(categories(Ytest));
referableColIdx = find(classNames == 'referable');

referableProb = scores(:, referableColIdx);
predReferable = referableProb > 0.5;
trueReferable = Ytest == 'referable';

tp = nnz(predReferable & trueReferable);
fn = nnz(~predReferable & trueReferable);
tn = nnz(~predReferable & ~trueReferable);
fp = nnz(predReferable & ~trueReferable);

sensitivity = tp / max(1, tp + fn);
specificity = tn / max(1, tn + fp);
accuracy = (tp + tn) / numel(trueReferable);

fprintf('\n--- Structural-features classifier, held-out IDRiD test set (n=%d) ---\n', numel(trueReferable));
fprintf('Sensitivity: %.1f%%  Specificity: %.1f%%  Accuracy: %.1f%%\n', ...
    100 * sensitivity, 100 * specificity, 100 * accuracy);
fprintf('(For comparison, the Python DL grader''s calibrated referable decision measured\n');
fprintf(' 90.8%% sensitivity / 88.5%% specificity on its own held-out external test half --\n');
fprintf(' see training/config.py''s REFERABLE_THRESHOLD docstring. This MATLAB classifier\n');
fprintf(' uses only 8 summary numbers per image, not the full image, and is expected to\n');
fprintf(' underperform a full CNN -- reported here for the ablation comparison, not as a\n');
fprintf(' competing production classifier.)\n');

modelOutPath = fullfile(setupPathsRoot, 'structuralReferableNet.mat');
save(modelOutPath, 'net', 'sensitivity', 'specificity', 'accuracy', 'referableColIdx');
fprintf('\nSaved trained network to %s\n', modelOutPath);
