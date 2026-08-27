function [fovMask, exclusionMask, lesionImg, odOnlyMask] = computeLesionExclusionMask(img, opts)
%COMPUTELESIONEXCLUSIONMASK FOV + OD/vessel exclusion mask at lesion working resolution.
%   [FOVMASK, EXCLUSIONMASK, LESIONIMG, ODONLYMASK] = COMPUTELESIONEXCLUSIONMASK(IMG, OPTS)
%   downscales IMG to opts.LesionMaxWorkingDim (returned as LESIONIMG),
%   computes the FOV mask at that resolution, and builds EXCLUSIONMASK — a
%   dilated union of the optic disc and vessel masks — for lesion detectors
%   to subtract before thresholding, since OD/vessel pixels are the dominant
%   false-positive source for bright- and dark-blob lesion detection alike.
%   ODONLYMASK is the OD portion alone (no vessel dilation), for a detector
%   like detectMicroaneurysms.m that handles vessel exclusion itself, more
%   precisely, via its own method — reusing the coarser dilated-vessel mask
%   on top would erase real lesions that sit close to a vessel.
%
%   OD/vessel detection itself runs at the separate, already-validated
%   opts.MaxWorkingDim (see defaultSegmentationConfig.m for why: fibermetric's
%   VesselThicknessRange was calibrated against DRIVE at that resolution, and
%   recomputing at LesionMaxWorkingDim would need its own calibration cycle
%   this exclusion mask doesn't need — it just needs to be roughly right,
%   dilated generously to compensate for the resolution mismatch).

if nargin < 2 || isempty(opts)
    opts = defaultSegmentationConfig();
end

if ischar(img) || isstring(img)
    img = imread(char(img));
end

[h0, w0, ~] = size(img);
lesionScale = 1;
if max(h0, w0) > opts.LesionMaxWorkingDim
    lesionScale = opts.LesionMaxWorkingDim / max(h0, w0);
    lesionImg = imresize(img, lesionScale);
else
    lesionImg = img;
end

[fovMask, ~] = computeFOVMask(lesionImg);

% OD/vessel detection at the standard, validated working resolution.
vesselMask = segmentVessels(img, opts);
odInfo = localizeOpticDisc(img, vesselMask, opts);

% Scale factor from that standard resolution up to the lesion resolution.
standardScale = 1;
if max(h0, w0) > opts.MaxWorkingDim
    standardScale = opts.MaxWorkingDim / max(h0, w0);
end
upscale = lesionScale / standardScale;

[hl, wl, ~] = size(lesionImg);
vesselMaskUp = imresize(vesselMask, [hl wl], 'nearest');

exclusionMask = false(hl, wl);
if opts.LesionVesselExclusionMarginPx > 0
    vesselMaskUp = imdilate(vesselMaskUp, strel('disk', opts.LesionVesselExclusionMarginPx));
end
exclusionMask = exclusionMask | vesselMaskUp;

odOnlyMask = false(hl, wl);
if ~any(isnan(odInfo.center))
    odCenterUp = odInfo.center * upscale;
    odRadiusUp = odInfo.radius * upscale + opts.LesionODExclusionMarginPx;
    [xx, yy] = meshgrid(1:wl, 1:hl);
    odOnlyMask = ((xx - odCenterUp(1)) .^ 2 + (yy - odCenterUp(2)) .^ 2) <= odRadiusUp ^ 2;
    exclusionMask = exclusionMask | odOnlyMask;
end

end
