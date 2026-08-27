function annotated = annotateStructuralFindings(imagePath, opts)
%ANNOTATESTRUCTURALFINDINGS MATLAB-native annotated overlay via Computer Vision Toolbox.
%   ANNOTATED = ANNOTATESTRUCTURALFINDINGS(IMAGEPATH) runs the segmentation
%   pipeline and draws an optic disc circle, a fovea marker, and a lesion-
%   candidate count banner directly onto the image using Computer Vision
%   Toolbox's insertShape/insertMarker/insertText.
%
%   This is a MATLAB-native complement to backend/structures_overlay.py
%   (the Python/OpenCV compositor that's what actually renders live in the
%   running app's "Structures" toggle -- that one draws translucent MASK
%   washes for the lesion candidates, since it has the pixel masks to
%   work with). This function instead demonstrates the label/marker/
%   annotation style Computer Vision Toolbox is built for -- a genuine,
%   verified use of that toolbox (not previously exercised anywhere in this
%   project -- see matlab/README.md's tool-coverage note), and doubles as a
%   quick MATLAB-side visual QA tool (see segmentation/demoSegmentation.m).
%
%   Lesion counts in the banner are from detectMicroaneurysms/
%   detectHardExudates/detectHemorrhages/detectNeovascularization run at
%   their own already-validated working resolutions (see
%   defaultSegmentationConfig.m) -- NOT redone at this function's drawing
%   canvas resolution, which would silently skip their calibrated
%   LesionMaxWorkingDim upscale and degrade lesion detection quality. The
%   OD/fovea/vessel functions are passed the native image directly for the
%   same reason: they do their own correct internal downscale.

if nargin < 2 || isempty(opts)
    opts = defaultSegmentationConfig();
end

if ischar(imagePath) || isstring(imagePath)
    img = imread(char(imagePath));
else
    img = imagePath;
end

[vesselMask, ~] = segmentVessels(img, opts);
odInfo = localizeOpticDisc(img, vesselMask, opts);
foveaInfo = localizeFovea(img, odInfo, opts);
[~, maInfo] = detectMicroaneurysms(img, opts);
[~, exInfo] = detectHardExudates(img, opts);
[~, heInfo] = detectHemorrhages(img, opts);
[~, nvInfo] = detectNeovascularization(img, vesselMask, odInfo, opts);

% Drawing canvas: the SAME working-resolution image segmentVessels/
% localizeOpticDisc/localizeFovea internally computed on (MaxWorkingDim),
% since odInfo/foveaInfo's coordinates are in that space.
[h0, w0, ~] = size(img);
if max(h0, w0) > opts.MaxWorkingDim
    canvas = imresize(img, opts.MaxWorkingDim / max(h0, w0));
else
    canvas = img;
end

annotated = canvas;

if ~any(isnan(odInfo.center))
    annotated = insertShape(annotated, 'circle', [odInfo.center, odInfo.radius], ...
        'Color', 'yellow', 'LineWidth', 2);
    annotated = insertText(annotated, odInfo.center + [odInfo.radius * 0.7, odInfo.radius * 0.7], 'OD', ...
        'FontSize', 14, 'TextColor', 'yellow', 'BoxOpacity', 0.5, 'BoxColor', 'black');
end

if foveaInfo.found
    annotated = insertMarker(annotated, foveaInfo.center, 'x', 'Color', 'red', 'Size', 8);
    annotated = insertText(annotated, foveaInfo.center + [8, 8], 'Fovea', ...
        'FontSize', 14, 'TextColor', 'red', 'BoxOpacity', 0.5, 'BoxColor', 'black');
end

summaryText = sprintf(['MA: %d  |  Exudates: %d  |  Haemorrhages: %d (dot/blot %d, flame %d)  |  ' ...
    'NV: %d (UNVALIDATED at lesion level, see detectNeovascularization.m)'], ...
    maInfo.count, exInfo.count, heInfo.count, heInfo.dotBlotCount, heInfo.flameCount, nvInfo.count);
annotated = insertText(annotated, [4 4], summaryText, ...
    'FontSize', 11, 'TextColor', 'white', 'BoxColor', 'black', 'BoxOpacity', 0.65);

end
