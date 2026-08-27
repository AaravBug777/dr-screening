function [candidateMask, regions] = findTortuousVesselSegments(vesselMask, fovMask, opts)
%FINDTORTUOUSVESSELSEGMENTS Locally dense + geodesically tortuous vessel-skeleton segments.
%   [CANDIDATEMASK, REGIONS] = FINDTORTUOUSVESSELSEGMENTS(VESSELMASK, FOVMASK, OPTS)
%   flags vessel-skeleton segments that are simultaneously abnormally
%   DENSE (local vessel pixel density in the top opts.NVDensityPercentile
%   within the field of view) and abnormally TORTUOUS (geodesic arc-chord
%   ratio above opts.NVTortuosityThreshold).
%
%   Extracted from detectNeovascularization.m so it can be reused by
%   localizeOpticDisc.m as an OD-INDEPENDENT exclusion signal, not just for
%   NV candidate reporting -- this function has NO notion of "at the disc"
%   / "elsewhere" zones (that OD-relative labeling is added by
%   detectNeovascularization.m, which calls this and is the right place to
%   read this method's full clinical/calibration caveat).
%
%   Why localizeOpticDisc.m needs this: a real, reproduced false positive
%   (IDRiD_016.jpg, see localizeOpticDisc.m's fix history) found that a
%   dense, tortuous vascular cluster elsewhere in the retina can outscore
%   the true optic disc on both this module's vessel-density AND
%   brightness signals simultaneously -- neither alone, nor several other
%   signals tested (yellowness, exudate-detector overlap, FOV-boundary
%   proximity), discriminated the two locations. Tortuosity does: the
%   false peak's local vessel density scored HIGHER than the true OD's,
%   but that density comes from a tangled, tortuous mass, not the smooth
%   radiating trunks a real OD has. Confirmed empirically (not assumed) on
%   the failing case before being wired in as a fix -- see
%   tests/diagnoseODConvergence.m / tests/diagnoseODNVOverlap.m.
%
%   CANDIDATEMASK is a logical mask, REGIONS a struct array (.centroid [x
%   y], .tortuosity, .areaPx) -- same fields detectNeovascularization.m's
%   .regions has, minus .zone.

if ~any(vesselMask(:))
    candidateMask = false(size(vesselMask));
    regions = struct('centroid', {}, 'tortuosity', {}, 'areaPx', {});
    return
end

[h, w] = size(vesselMask);
candidateMask = false(h, w);
regions = struct('centroid', {}, 'tortuosity', {}, 'areaPx', {});

% --- Local vessel density map ---
winSize = max(3, round(opts.NVDensityWindowFraction * min(h, w)));
if mod(winSize, 2) == 0
    winSize = winSize + 1;
end
densityMap = imfilter(double(vesselMask), ones(winSize) / winSize^2, 'replicate');

inFovDensity = densityMap(fovMask);
if isempty(inFovDensity) || max(inFovDensity) <= 0
    return
end
densityLevel = prctile(inFovDensity, opts.NVDensityPercentile);
denseMask = densityMap >= densityLevel & fovMask;

% --- Sever the skeleton at branch points so each remaining connected piece
% is a single simple curve with two well-defined extreme ends -- required
% for an arc-chord tortuosity measurement. ---
skel = bwskel(vesselMask);
branchPts = bwmorph(skel, 'branchpoints');
if any(branchPts(:))
    severed = skel & ~imdilate(branchPts, strel('square', 3));
else
    severed = skel;
end

cc = bwconncomp(severed, 8);

for i = 1:cc.NumObjects
    pixelIdx = cc.PixelIdxList{i};
    if numel(pixelIdx) < opts.NVMinSegmentPx
        continue % too short for a stable tortuosity estimate
    end

    if mean(denseMask(pixelIdx)) < 0.5
        continue
    end

    [ys, xs] = ind2sub([h w], pixelIdx);

    y0 = max(1, min(ys) - 1); y1 = min(h, max(ys) + 1);
    x0 = max(1, min(xs) - 1); x1 = min(w, max(xs) + 1);
    localMask = false(y1 - y0 + 1, x1 - x0 + 1);
    localMask(sub2ind(size(localMask), ys - y0 + 1, xs - x0 + 1)) = true;

    [arcLen, chordLen] = segmentArcChordLocal(localMask);
    if chordLen < 1
        continue
    end
    tortuosity = arcLen / chordLen;

    if tortuosity < opts.NVTortuosityThreshold
        continue
    end

    centroid = [mean(xs), mean(ys)];
    candidateMask(pixelIdx) = true;
    regions(end + 1) = struct('centroid', centroid, 'tortuosity', tortuosity, 'areaPx', numel(pixelIdx)); %#ok<AGROW>
end

end

function [arcLen, chordLen] = segmentArcChordLocal(segMask)
%SEGMENTARCCHORDLOCAL Two-pass geodesic farthest-point search -- see
%   detectNeovascularization.m's original docstring for the full rationale
%   (unchanged, just relocated here alongside the code that uses it).
[rows, cols] = find(segMask);
if isempty(rows)
    arcLen = 0; chordLen = 0;
    return
end

D1 = bwdistgeodesic(segMask, cols(1), rows(1), 'quasi-euclidean');
D1(~segMask | isinf(D1)) = -1;
[~, idx1] = max(D1(:));
[r1, c1] = ind2sub(size(segMask), idx1);

D2 = bwdistgeodesic(segMask, c1, r1, 'quasi-euclidean');
D2(~segMask | isinf(D2)) = -1;
[maxD2, idx2] = max(D2(:));
[r2, c2] = ind2sub(size(segMask), idx2);

arcLen = maxD2;
chordLen = hypot(c2 - c1, r2 - r1);
end
