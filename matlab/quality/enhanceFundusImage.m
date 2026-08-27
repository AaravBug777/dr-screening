function enhanced = enhanceFundusImage(img, opts)
%ENHANCEFUNDUSIMAGE Adaptive enhancement for borderline-quality fundus images.
%   ENHANCED = ENHANCEFUNDUSIMAGE(IMG, OPTS) applies, in order:
%     1. Illumination normalization — subtract a large-kernel Gaussian blur
%        estimate of the background illumination field (same idea as the Ben
%        Graham preprocessing already used on the Python training side in
%        training/dataset.py's ben_graham_preprocess, reimplemented here so
%        the MATLAB quality stage doesn't depend on the Python code).
%     2. CLAHE (adaptive histogram equalization) on the L channel in Lab
%        color space, so contrast is boosted without distorting hue/chroma —
%        applying CLAHE per-RGB-channel independently would shift colors.
%     3. Bilateral denoising, which smooths sensor/compression noise while
%        keeping vessel/lesion edges sharp (unlike Gaussian denoising, which
%        would blur exactly the fine structures the DR grader relies on).
%
%   IMG must already be restricted to the field of view by the caller
%   (assessFundusQuality only calls this for images that passed the FOV
%   check) — this function does not re-segment the fundus circle.

if nargin < 2
    opts = defaultQualityConfig();
end

rgb = im2double(img);
if size(rgb, 3) == 1
    rgb = repmat(rgb, [1 1 3]);
end

% --- 1. Illumination normalization ---
h = size(rgb, 1);
sigma = max(1, h / opts.IlluminationBlurSigmaFrac);
background = imgaussfilt(rgb, sigma);
normalized = rgb - background + 0.5; % re-center around mid-gray, matches addWeighted(img,4,blurred,-4,128) intent from the Python side but in [0,1] space
normalized = min(max(normalized, 0), 1);

% --- 2. CLAHE on L channel in Lab space ---
labImg = rgb2lab(normalized);
L = labImg(:, :, 1) / 100; % rgb2lab's L is in [0,100]; adapthisteq expects [0,1]
L = adapthisteq(L, 'ClipLimit', opts.ClaheClipLimit, 'NumTiles', opts.ClaheNumTiles);
labImg(:, :, 1) = L * 100;
contrastBoosted = lab2rgb(labImg);
contrastBoosted = min(max(contrastBoosted, 0), 1);

% --- 3. Bilateral denoising ---
% Applied per-channel rather than passing the RGB array straight to
% imbilatfilt: RGB support for imbilatfilt was added in a specific MATLAB
% release, and per-channel application works identically on every release
% that has the function at all, so this doesn't silently misbehave on an
% older toolbox version.
denoised = zeros(size(contrastBoosted), 'like', contrastBoosted);
for c = 1:size(contrastBoosted, 3)
    denoised(:, :, c) = imbilatfilt(contrastBoosted(:, :, c), ...
        'DegreeOfSmoothing', opts.DenoiseDegreeOfSmoothing);
end

enhanced = im2uint8(denoised);

end
