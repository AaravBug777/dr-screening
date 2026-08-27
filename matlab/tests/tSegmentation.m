classdef tSegmentation < matlab.unittest.TestCase
    %TSEGMENTATION Unit tests for matlab/segmentation/*.
    %   Uses a synthetic fundus image with known vessel lines, OD center, and
    %   fovea center, so the suite runs standalone without DRIVE/IDRiD
    %   downloaded. Run with:
    %       setupPaths
    %       runtests('tests')
    %
    %   This validates the algorithms find approximately the right answer on
    %   a controlled synthetic case with a known ground truth — it is NOT a
    %   substitute for quantitative validation against DRIVE/IDRiD's real
    %   expert-labeled ground truth, which segmentation/README.md still lists
    %   as outstanding.

    methods (Test)

        function testVesselSegmentationOverlapsDrawnLines(testCase)
            [img, vesselGT, ~, ~] = tSegmentation.makeSyntheticFundus(300, 130);
            vesselMask = segmentVessels(img);
            dice = tSegmentation.diceCoefficient(vesselMask, vesselGT);
            testCase.verifyGreaterThan(dice, 0.35);
        end

        function testVesselMaskStaysWithinFOV(testCase)
            [img, ~, ~, ~] = tSegmentation.makeSyntheticFundus(300, 130);
            [mask, ~] = computeFOVMask(img);
            vesselMask = segmentVessels(img);
            testCase.verifyTrue(all(vesselMask(~mask) == 0));
        end

        function testOpticDiscLocalizationNearTrueCenter(testCase)
            [img, ~, trueOD, ~] = tSegmentation.makeSyntheticFundus(300, 130);
            odInfo = localizeOpticDisc(img);
            dist = hypot(odInfo.center(1) - trueOD(1), odInfo.center(2) - trueOD(2));
            testCase.verifyLessThan(dist, odInfo.radius);
        end

        function testFoveaLocalizationNearTrueCenter(testCase)
            [img, ~, trueOD, trueFovea] = tSegmentation.makeSyntheticFundus(300, 130);
            odInfo = localizeOpticDisc(img);
            foveaInfo = localizeFovea(img, odInfo);
            testCase.verifyTrue(foveaInfo.found);
            dist = hypot(foveaInfo.center(1) - trueFovea(1), foveaInfo.center(2) - trueFovea(2));
            testCase.verifyLessThan(dist, odInfo.radius * 1.5);
        end

        function testBlankImageHandledGracefully(testCase)
            img = zeros(300, 300, 3, 'uint8');
            vesselMask = segmentVessels(img);
            testCase.verifyEqual(nnz(vesselMask), 0);
            odInfo = localizeOpticDisc(img);
            testCase.verifyTrue(all(isnan(odInfo.center)));
            foveaInfo = localizeFovea(img, odInfo);
            testCase.verifyFalse(foveaInfo.found);
        end

    end

    methods (Static)
        function [img, vesselGT, odCenter, foveaCenter] = makeSyntheticFundus(frameSize, radius)
            %MAKESYNTHETICFUNDUS Textured disc with a bright OD, dark fovea,
            %   and straight-line "vessels" radiating from the OD -- enough
            %   structure to sanity-check the segmentation algorithms against
            %   a known ground truth.
            cx = frameSize / 2; cy = frameSize / 2;
            [xx, yy] = meshgrid(1:frameSize, 1:frameSize);
            circleMask = ((xx - cx) .^ 2 + (yy - cy) .^ 2) <= radius ^ 2;

            rng(7);
            % Spatially-correlated texture (blurred noise), not raw
            % per-pixel white noise -- real retinal tissue varies smoothly;
            % white noise's per-pixel extrema are an unrealistically easy
            % way to accidentally beat a deliberately flat, homogeneous
            % synthetic lesion patch on statistical-outlier tests (found via
            % real IDRiD validation regressing while this pattern was still
            % iid noise -- see localizeFovea.m's z-score side-disambiguation
            % history in segmentation/README.md).
            rawNoise = 140 + 14 * randn(frameSize, frameSize);
            basePlane = uint8(min(255, max(0, imgaussfilt(rawNoise, 2))));
            img = repmat(basePlane, [1 1 3]);

            odRadius = 0.18 * frameSize / 2; % matches defaultSegmentationConfig's ODDiameterFraction
            odCenter = [cx - radius * 0.3, cy]; % offset from frame center, like a real nasally-displaced disc
            odDiameter = odRadius * 2;
            foveaCenter = [odCenter(1) + 2.5 * odDiameter, odCenter(2)]; % temporal side, standard clinical spacing

            odMask = ((xx - odCenter(1)) .^ 2 + (yy - odCenter(2)) .^ 2) <= odRadius ^ 2;
            foveaRadius = odRadius * 0.8;
            foveaMask = ((xx - foveaCenter(1)) .^ 2 + (yy - foveaCenter(2)) .^ 2) <= foveaRadius ^ 2;

            for c = 1:3
                ch = img(:, :, c);
                ch(odMask) = 220;
                ch(foveaMask) = ch(foveaMask) - 40;
                img(:, :, c) = ch;
            end

            numVessels = 8;
            % Offset by half a step so no line lands on the horizontal
            % meridian (angle 0 or pi) -- real retinal vasculature has a
            % vessel-free zone around the fovea (the temporal arcades curve
            % above/below it, not through it), so a line running straight
            % through the fovea search band would be anatomically wrong, not
            % just an inconvenient test collision.
            angles = linspace(0, 2 * pi, numVessels + 1) + pi / numVessels;
            angles(end) = [];
            lines = zeros(numVessels, 4);
            for i = 1:numVessels
                theta = angles(i);
                x2 = odCenter(1) + radius * 1.2 * cos(theta);
                y2 = odCenter(2) + radius * 1.2 * sin(theta);
                lines(i, :) = [odCenter(1), odCenter(2), x2, y2];
            end

            img = insertShape(img, 'Line', lines, 'LineWidth', 3, 'Color', [90 60 60]);

            vesselCanvas = insertShape(zeros(frameSize, frameSize, 3, 'uint8'), ...
                'Line', lines, 'LineWidth', 3, 'Color', [255 255 255]);
            vesselGT = vesselCanvas(:, :, 1) > 128 & circleMask;

            for c = 1:3
                ch = img(:, :, c);
                ch(~circleMask) = 0;
                img(:, :, c) = ch;
            end
        end

        function d = diceCoefficient(a, b)
            interA = nnz(a & b);
            d = 2 * interA / max(1, (nnz(a) + nnz(b)));
        end
    end
end
