% Does the false OD peak on IDRiD_016.jpg coincide with the ALREADY-
% VALIDATED hard-exudate detector's candidate mask (not raw color, which
% diagnoseODMisdetection.m already found doesn't discriminate cleanly)?

setupPathsRoot = fileparts(mfilename('fullpath'));
run(fullfile(setupPathsRoot, '..', 'setupPaths.m'));

opts = defaultSegmentationConfig();
imgPath = fullfile(setupPathsRoot, '..', '..', 'training', 'data', 'idrid', 'B. Disease Grading', '1. Original Images', 'a. Training Set', 'IDRiD_016.jpg');
img = imread(imgPath);
[h0, w0, ~] = size(img);

[exMask, exInfo] = detectHardExudates(img, opts);
lesionScale = opts.LesionMaxWorkingDim / max(h0, w0);
if max(h0, w0) <= opts.LesionMaxWorkingDim
    lesionScale = 1;
end

% wrong OD peak / true OD, in the 640-working-resolution coords used
% earlier -- convert to LesionMaxWorkingDim coords for comparison against exMask.
odWorkScale = opts.MaxWorkingDim / max(h0, w0);
wrongX_native = 386 / odWorkScale; wrongY_native = 119 / odWorkScale;
trueX_native = 140 / odWorkScale; trueY_native = 203 / odWorkScale;

wrongX_lesion = round(wrongX_native * lesionScale); wrongY_lesion = round(wrongY_native * lesionScale);
trueX_lesion = round(trueX_native * lesionScale); trueY_lesion = round(trueY_native * lesionScale);

winR = round(30 * lesionScale / odWorkScale * 640/640); % rough local window, generous
winR = 60;
[hl, wl] = size(exMask);
wy0 = max(1, wrongY_lesion - winR); wy1 = min(hl, wrongY_lesion + winR);
wx0 = max(1, wrongX_lesion - winR); wx1 = min(wl, wrongX_lesion + winR);
ty0 = max(1, trueY_lesion - winR); ty1 = min(hl, trueY_lesion + winR);
tx0 = max(1, trueX_lesion - winR); tx1 = min(wl, trueX_lesion + winR);

wrongPatch = exMask(wy0:wy1, wx0:wx1);
truePatch = exMask(ty0:ty1, tx0:tx1);

fprintf('Total exudate candidates in image: %d\n', exInfo.count);
fprintf('Exudate mask coverage near WRONG OD peak (local window): %.2f%% of window pixels\n', 100 * mean(wrongPatch(:)));
fprintf('Exudate mask coverage near TRUE OD:                      %.2f%% of window pixels\n', 100 * mean(truePatch(:)));
