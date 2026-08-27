function score = computeFocusScore(img, mask)
%COMPUTEFOCUSSCORE Variance-of-Laplacian sharpness metric, restricted to MASK.
%   SCORE = COMPUTEFOCUSSCORE(IMG, MASK) is a no-reference blur metric: a
%   sharp, in-focus image has high-frequency edge content (large Laplacian
%   response variance), while a blurred image is dominated by low frequencies
%   (small Laplacian response variance). This is the standard cheap
%   no-reference sharpness proxy used across fundus- and general-purpose
%   image-quality-assessment pipelines.
%
%   Restricting to MASK (the field-of-view mask from computeFOVMask) matters:
%   the sharp black/retina boundary at the fundus circle's edge would
%   otherwise dominate the Laplacian variance and mask real blur in the
%   interior, where the clinically relevant vessels/lesions actually are.

gray = double(im2gray(img));
lap = imfilter(gray, fspecial('laplacian', 0.2), 'replicate', 'conv');

if nargin < 2 || isempty(mask)
    mask = true(size(gray));
end

values = lap(mask);
if isempty(values)
    score = 0;
    return
end

score = var(values);

end
