function [nvMask, nvInfo] = detectNeovascularization(img, vesselMask, odInfo, opts)
%DETECTNEOVASCULARIZATION Classical proxy detector for neovascularization (NVD/NVE) candidates.
%   [NVMASK, NVINFO] = DETECTNEOVASCULARIZATION(IMG) flags vessel-skeleton
%   segments that are simultaneously abnormally DENSE and abnormally
%   TORTUOUS -- the two classical signals the fundus-imaging literature
%   uses to distinguish neovascular tufts (fine-caliber, disorganized,
%   curly new vessels growing in response to retinal ischemia) from normal
%   retinal vasculature (smooth vessels radiating out from the optic disc
%   at roughly constant caliber). The actual candidate-finding (density +
%   geodesic arc-chord tortuosity) lives in findTortuousVesselSegments.m,
%   shared with localizeOpticDisc.m's false-positive exclusion signal (see
%   that file's docstring for why); this function adds the OD-relative
%   NVD/NVE zone labeling on top.
%
%   [NVMASK, NVINFO] = DETECTNEOVASCULARIZATION(IMG, VESSELMASK, ODINFO, OPTS)
%   reuses an already-computed vessel mask / OD localization (as
%   analyzeForApp.m does) instead of recomputing them.
%
%   NVMASK is a logical mask at opts.MaxWorkingDim resolution -- the SAME
%   resolution as segmentVessels/localizeOpticDisc (deliberately NOT the
%   higher LesionMaxWorkingDim used for MA/exudate/haemorrhage detection):
%   this detector needs the vessel skeleton's TOPOLOGY, not fine pixel
%   detail, and reuses the vessel mask directly rather than resegmenting at
%   a second resolution.
%
%   NVINFO struct:
%     .count        total flagged segments
%     .nvdCount     segments classified NVD -- "neovascularization at the
%                   disc": within opts.NVDRadiusODMultiple disc diameters of
%                   the optic disc MARGIN (the standard clinical definition
%                   of "at the disc", not simply near the OD centre)
%     .nveCount     segments classified NVE -- "neovascularization
%                   elsewhere": everywhere else in the field of view
%     .totalAreaPx  summed pixel count across flagged segments
%     .regions      struct array: .centroid [x y], .tortuosity, .areaPx, .zone
%
%   =======================================================================
%   IMPORTANT CALIBRATION CAVEAT -- read before presenting this output as
%   equivalent to the other lesion detectors in this module.
%
%   Unlike segmentVessels (validated against DRIVE), localizeOpticDisc/
%   localizeFovea (validated against IDRiD's Localization ground truth), or
%   detectMicroaneurysms/detectHardExudates/detectHemorrhages (validated
%   against IDRiD's Segmentation ground truth), THERE IS NO PIXEL-LEVEL
%   GROUND TRUTH FOR NEOVASCULARIZATION in any dataset this project has --
%   DRIVE has none (it's a vessel-only dataset) and IDRiD's Segmentation set
%   covers microaneurysms/haemorrhages/hard exudates/soft exudates/optic
%   disc only, not NV. Sensitivity/specificity/Dice cannot honestly be
%   reported for this function, unlike every other detector in this file.
%
%   What HAS been checked (matlab/tests/checkNeovascularizationTrend.m):
%   candidate area/count from this function, run on real IDRiD Disease
%   Grading images, trends in the clinically expected direction -- higher on
%   images already graded PDR/grade-4 (which by the ICDR definition MUST
%   contain neovascularization) than on images graded No-DR/grade-0 (which
%   cannot). That is a real, directionally-informative sanity check against
%   real data, consistent with this project's practice of never shipping an
%   unvalidated threshold silently -- but it is NOT the same as measuring
%   whether the flagged PIXELS/REGIONS are the actual NV lesions, and must
%   not be described to reviewers as such. Present this output to a clinician
%   as "candidate tortuous/dense vessel regions, unvalidated at the lesion
%   level" -- not as "neovascularization detected". A second, real use for
%   the SAME underlying signal turned up unexpectedly this session: see
%   localizeOpticDisc.m, where it fixed a real false positive -- worth
%   knowing this method has now paid for itself twice, from one piece of
%   shared logic.
%   =======================================================================

if nargin < 4 || isempty(opts)
    opts = defaultSegmentationConfig();
end

if ischar(img) || isstring(img)
    img = imread(char(img));
end

[h0, w0, ~] = size(img);
if max(h0, w0) > opts.MaxWorkingDim
    img = imresize(img, opts.MaxWorkingDim / max(h0, w0));
end

[fovMask, ~] = computeFOVMask(img);
[h, w, ~] = size(img);

if nargin < 2 || isempty(vesselMask)
    vesselMask = segmentVessels(img, opts);
end
if nargin < 3 || isempty(odInfo)
    odInfo = localizeOpticDisc(img, vesselMask, opts);
end

nvMask = false(h, w);
nvInfo = struct('count', 0, 'nvdCount', 0, 'nveCount', 0, 'totalAreaPx', 0, 'regions', []);

[coreMask, coreRegions] = findTortuousVesselSegments(vesselMask, fovMask, opts);
nvMask = coreMask;

odDiameter = odInfo.radius * 2;
hasOD = ~any(isnan(odInfo.center));

regions = struct('centroid', {}, 'tortuosity', {}, 'areaPx', {}, 'zone', {});
for i = 1:numel(coreRegions)
    r = coreRegions(i);
    zone = 'NVE';
    if hasOD
        distToODCentre = hypot(r.centroid(1) - odInfo.center(1), r.centroid(2) - odInfo.center(2));
        distToODMargin = max(0, distToODCentre - odInfo.radius);
        if distToODMargin <= opts.NVDRadiusODMultiple * odDiameter
            zone = 'NVD';
        end
    end
    regions(end + 1) = struct('centroid', r.centroid, 'tortuosity', r.tortuosity, ...
        'areaPx', r.areaPx, 'zone', zone); %#ok<AGROW>
end

nvInfo.count = numel(regions);
if nvInfo.count > 0
    nvInfo.nvdCount = sum(strcmp({regions.zone}, 'NVD'));
    nvInfo.nveCount = sum(strcmp({regions.zone}, 'NVE'));
    nvInfo.totalAreaPx = sum([regions.areaPx]);
end
nvInfo.regions = regions;

end
