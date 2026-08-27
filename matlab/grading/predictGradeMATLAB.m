function [predClass, predLabel, probs, logits] = predictGradeMATLAB(preprocessedImagePath, onnxPath)
%PREDICTGRADEMATLAB Run the trained DR severity grader natively in MATLAB, via Deep Learning Toolbox.
%   [PREDCLASS, PREDLABEL, PROBS, LOGITS] = PREDICTGRADEMATLAB(PREPROCESSEDIMAGEPATH)
%   imports the ONNX export of the production EfficientNet-B3 checkpoint
%   (training/export_onnx.py -- run that first) via
%   importNetworkFromONNX and runs inference, entirely inside MATLAB.
%
%   Closes a real gap against the SIH26038 brief's tool list, which names
%   Deep Learning Toolbox explicitly: the PRODUCTION grading path
%   (backend/main.py, via training/gradcam.py) stays PyTorch -- a
%   deliberate choice, not an oversight (Python/PyTorch/timm has the GPU
%   training ecosystem and Grad-CAM's autograd-based backward hook, which a
%   static ONNX graph can't reproduce) -- but this function demonstrates and
%   VERIFIES (not just claims) that the exact trained network also runs
%   correctly inside MATLAB. See matlab/tests/validateONNXAgainstPython.m
%   for the three-way cross-check (PyTorch vs ONNX Runtime vs MATLAB Deep
%   Learning Toolbox) that confirmed this.
%
%   PREPROCESSEDIMAGEPATH must already be Ben-Graham-preprocessed and
%   resized to the model's native input size -- this function does NOT
%   reimplement that preprocessing pipeline (see grading/README.md for why:
%   reproducing cv2's exact resize/blur behavior in MATLAB is a separate,
%   harder cross-library bit-exactness problem that isn't what this export
%   is trying to prove). training/export_onnx.py saves exactly such
%   preprocessed fixture images for its reference set.
%
%   ONNXPATH defaults to training/outputs/best_model.onnx relative to this
%   file. The imported network is cached in a persistent variable across
%   calls within one MATLAB session -- importNetworkFromONNX takes a
%   couple of seconds, not something to repeat per image in a loop.
%
%   Returns PREDCLASS (0-indexed, matching the Python side's class
%   convention: 0=No DR .. 4=Proliferative DR), PREDLABEL (string),
%   PROBS (1x5 double, softmax), LOGITS (1x5 double, raw).

persistent net inputFormat;

if nargin < 2 || isempty(onnxPath)
    onnxPath = fullfile(fileparts(mfilename('fullpath')), '..', '..', 'training', 'outputs', 'best_model.onnx');
end

if isempty(net)
    if ~isfile(onnxPath)
        error('predictGradeMATLAB:missingONNX', ...
            'ONNX model not found at %s -- run training/export_onnx.py first.', onnxPath);
    end
    % 'BCSS' = (Batch, Channel, Spatial, Spatial), matching the NCHW layout
    % torch.onnx.export produced. Confirmed correct empirically (not just
    % assumed) by tests/validateONNXAgainstPython.m matching MATLAB's
    % output against the PyTorch/ONNX Runtime reference predictions.
    inputFormat = 'BCSS';
    net = importNetworkFromONNX(onnxPath, 'InputDataFormats', inputFormat, 'OutputDataFormats', 'BC');
end

img = imread(preprocessedImagePath);
img = im2single(img); % [0,1], H x W x 3

meanRGB = reshape(single([0.485 0.456 0.406]), 1, 1, 3);
stdRGB = reshape(single([0.229 0.224 0.225]), 1, 1, 3);
normalized = (img - meanRGB) ./ stdRGB;

% HWC -> CHW -> add batch dim, matching the 'BCSS' format declared above.
chw = permute(normalized, [3 1 2]);
batched = reshape(chw, [1, size(chw)]);
dlInput = dlarray(batched, inputFormat);

dlLogits = predict(net, dlInput);
logits = double(extractdata(dlLogits));
logits = reshape(logits, 1, []); % row vector, 5 classes

probs = exp(logits - max(logits));
probs = probs / sum(probs);

[~, predClass1] = max(probs); % 1-indexed
predClass = predClass1 - 1;   % 0-indexed, matches config.CLASS_NAMES convention

classNames = {'No DR', 'Mild', 'Moderate', 'Severe', 'Proliferative DR'};
predLabel = classNames{predClass1};

end
