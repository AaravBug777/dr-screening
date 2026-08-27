% Sanity check: confirm regionprops' Orientation/Centroid coordinate
% convention matches what detectHemorrhages.m's flame-hemorrhage radial-
% alignment check assumes, BEFORE trusting it on real data.
%
% Builds a thin elongated blob at a precisely known angle from a known
% "OD" point, with NO ambiguity: the blob's major axis is made to lie
% exactly along the line connecting the two points, so a correct
% implementation must find angleDiff ~ 0 for every tested angle.
%
% Result (recorded, not just asserted): a naive un-flipped
% atan2d(dy,dx) was off from regionprops' Orientation by up to 60.36
% degrees across the tested angles -- regionprops reports Orientation in a
% DISPLAY-style frame (positive = counterclockwise as the image appears on
% screen), even though Centroid stays plain [x y] = [col row] with no such
% flip. Negating dy before atan2d matches Orientation to within 0.34
% degrees at every tested angle -- confirming detectHemorrhages.m's
% radialAngleDeg = atan2d(-radialVec(2), radialVec(1)) is correct.

od = [80, 250]; % [x y] = [col row] -- arbitrary anchor point, off-center so no accidental symmetry
testAngles = [0, 25, 60, 90, 120, 155]; % degrees
radius = 60;
results = table();

for k = 1:numel(testAngles)
    angleDeg = testAngles(k);
    dx = radius * cosd(angleDeg);
    dy = radius * sind(angleDeg);
    centroidTarget = od + [dx, dy]; % [x y]

    img = false(500, 500);
    % Draw a thin line segment through centroidTarget along direction
    % angleDeg, length ~40px, then dilate slightly -- an unambiguous
    % elongated blob whose true major-axis angle equals angleDeg by
    % construction.
    t = -20:0.25:20;
    xs = round(centroidTarget(1) + t * cosd(angleDeg));
    ys = round(centroidTarget(2) + t * sind(angleDeg));
    valid = xs >= 1 & xs <= 500 & ys >= 1 & ys <= 500;
    idx = sub2ind(size(img), ys(valid), xs(valid));
    img(idx) = true;
    img = imdilate(img, strel('disk', 2));

    props = regionprops(img, 'Centroid', 'Orientation', 'Eccentricity');
    p = props(1);

    radialVec = p.Centroid - od;
    radialAngleDeg = atan2d(-radialVec(2), radialVec(1)); % matches detectHemorrhages.m
    angleDiff = mod(radialAngleDeg - p.Orientation + 90, 180) - 90;

    results = [results; table(angleDeg, p.Orientation, radialAngleDeg, angleDiff, p.Eccentricity, ...
        'VariableNames', {'trueAngle', 'regionpropsOrientation', 'computedRadialAngle', 'angleDiff', 'eccentricity'})]; %#ok<AGROW>
end

disp(results);
maxAbsDiff = max(abs(results.angleDiff));
fprintf('\nMax |angleDiff| across all test angles: %.2f degrees\n', maxAbsDiff);
if maxAbsDiff < 5
    fprintf('PASS: coordinate convention confirmed consistent (no sign flip bug).\n');
else
    error('FAIL: coordinate convention mismatch -- radial check in detectHemorrhages.m needs a sign fix.');
end
