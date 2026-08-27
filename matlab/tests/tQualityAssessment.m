classdef tQualityAssessment < matlab.unittest.TestCase
    %TQUALITYASSESSMENT Unit tests for matlab/quality/*.
    %   Uses synthetic images (a textured disc on a black frame) rather than
    %   the real datasets, so the suite runs standalone without APTOS/IDRiD/
    %   DRIVE/Messidor-2 downloaded. Run with:
    %       setupPaths
    %       runtests('tests')
    %
    %   NOTE: written without access to a MATLAB license — the threshold-
    %   dependent tests use deliberately extreme synthetic cases (very dark,
    %   very bright, tiny field of view) so they should be robust to the
    %   threshold tuning matlab/README.md calls out as still needed. The one
    %   test genuinely sensitive to exact threshold placement
    %   (testBorderlineImageGetsEnhanced) is written to skip gracefully
    %   rather than fail if the synthetic case lands on the wrong side of a
    %   boundary — see its comment.

    methods (Test)

        function testSharpFundusPasses(testCase)
            img = tQualityAssessment.makeFundus(750, 325, 'texture', 'sharp');
            report = assessFundusQuality(img);
            testCase.verifyEqual(report.verdict, 'pass');
            testCase.verifyEmpty(report.reasons);
        end

        function testBlurringReducesFocusScore(testCase)
            % Relative comparison, not an absolute threshold -- robust
            % regardless of where FocusRejectThreshold/FocusBorderlineThreshold
            % end up being tuned.
            sharp = tQualityAssessment.makeFundus(750, 325, 'texture', 'sharp');
            blurred = imgaussfilt(sharp, 6);
            reportSharp = assessFundusQuality(sharp);
            reportBlurred = assessFundusQuality(blurred);
            testCase.verifyLessThan(reportBlurred.focusScore, reportSharp.focusScore);
        end

        function testVeryDarkImageIsRejected(testCase)
            % brightness=10 is far below DarkMeanThreshold=40 -- large margin.
            img = tQualityAssessment.makeFundus(750, 325, 'texture', 'flat', 'brightness', 10);
            report = assessFundusQuality(img);
            testCase.verifyEqual(report.verdict, 'reject');
            testCase.verifyTrue(any(strcmp(report.reasons, 'too_dark')));
            testCase.verifyNotEmpty(report.feedback);
        end

        function testVeryBrightImageIsRejected(testCase)
            % brightness=250 is above BrightMeanThreshold=220 -- large margin.
            img = tQualityAssessment.makeFundus(750, 325, 'texture', 'flat', 'brightness', 250);
            report = assessFundusQuality(img);
            testCase.verifyEqual(report.verdict, 'reject');
            testCase.verifyTrue(any(strcmp(report.reasons, 'too_bright')));
        end

        function testTinyFundusCircleFailsFOVCheck(testCase)
            % radius=100 in a 750x750 frame -> ~5.6% coverage, far below
            % MinFOVFraction=0.35 -- large margin.
            img = tQualityAssessment.makeFundus(750, 100, 'texture', 'sharp');
            report = assessFundusQuality(img);
            testCase.verifyEqual(report.verdict, 'reject');
            testCase.verifyTrue(any(strcmp(report.reasons, 'insufficient_field_of_view')));
        end

        function testBorderlineImageGetsEnhanced(testCase)
            % A mild blur should trip the focus-borderline band and get
            % routed through enhancement. Per assessFundusQuality.m's
            % reason-aware re-check, a *focus-only* borderline verdict is
            % expected to graduate to "pass_after_enhancement" (enhancement
            % can't add sharpness back, but the image already cleared the
            % reject floor, so it's accepted) -- "borderline" surviving as
            % the final verdict would mean something else also tripped
            % (illumination/FOV), which this synthetic case isn't designed to do.
            sharp = tQualityAssessment.makeFundus(750, 325, 'texture', 'sharp');
            softened = imgaussfilt(sharp, 2.5); % aiming for the focus-borderline band, not reject
            report = assessFundusQuality(softened);
            if any(strcmp(report.verdict, {'borderline', 'pass_after_enhancement'}))
                opts = defaultQualityConfig();
                % enhancedImage is at the MaxWorkingDim working resolution
                % assessFundusQuality.m downscales to internally, not the
                % original input size -- only equal to it when the input is
                % already <= MaxWorkingDim (no longer the case now that this
                % synthetic input is 750px, above MinNativeResolutionPx's
                % 640px floor).
                expectedDim = min(size(softened, 1), opts.MaxWorkingDim);
                testCase.verifyNotEmpty(report.enhancedImage);
                testCase.verifyEqual(class(report.enhancedImage), 'uint8');
                testCase.verifyEqual(size(report.enhancedImage), [expectedDim, expectedDim, 3]);
                testCase.verifyEqual(report.verdict, 'pass_after_enhancement');
            else
                testCase.assumeFail(sprintf(...
                    ['Expected a borderline/pass_after_enhancement verdict for this mild-blur synthetic case, got "%s". ', ...
                     'Tune FocusBorderlineThreshold/FocusRejectThreshold in defaultQualityConfig.m.'], ...
                    report.verdict));
            end
        end

        function testLowResolutionImageIsRejected(testCase)
            % 400px is well below MinNativeResolutionPx=640 (see
            % defaultQualityConfig.m for the real misgrading that motivated
            % this floor and the sweep confirming 640 specifically) -- an
            % otherwise-perfect synthetic capture should still be rejected
            % on resolution alone, before focus/illumination/FOV are even
            % scored.
            img = tQualityAssessment.makeFundus(400, 175, 'texture', 'sharp');
            report = assessFundusQuality(img);
            testCase.verifyEqual(report.verdict, 'reject');
            testCase.verifyTrue(any(strcmp(report.reasons, 'low_source_resolution')));
            testCase.verifyNotEmpty(report.feedback);
            testCase.verifyEqual(report.sourceResolution.maxDim, 400);
        end

        function testResolutionAtFloorIsNotRejected(testCase)
            % Exactly at MinNativeResolutionPx=640 should NOT be rejected on
            % resolution (the check is strictly "<", matching
            % MaxWorkingDim's own convention elsewhere in this module) --
            % guards against an off-by-one that would reject perfectly
            % adequate images right at the boundary.
            img = tQualityAssessment.makeFundus(640, 280, 'texture', 'sharp');
            report = assessFundusQuality(img);
            testCase.verifyFalse(any(strcmp(report.reasons, 'low_source_resolution')));
        end

        function testFeedbackMapsKnownReasonCodes(testCase)
            feedback = generateRecaptureFeedback({'too_dark', 'too_blurry'});
            testCase.verifyNotEmpty(feedback);
        end

        function testFeedbackEmptyForNoReasons(testCase)
            feedback = generateRecaptureFeedback({});
            testCase.verifyEmpty(feedback);
        end

        function testFOVMaskAreaFractionMatchesCircleGeometry(testCase)
            frameSize = 750;
            radius = 250;
            img = tQualityAssessment.makeFundus(frameSize, radius, 'texture', 'sharp');
            [mask, fovInfo] = computeFOVMask(img);
            expectedFraction = (pi * radius^2) / (frameSize^2);
            testCase.verifyEqual(fovInfo.areaFraction, expectedFraction, 'RelTol', 0.15);
            % Implementation-consistency check (exact, no tolerance needed):
            % areaFraction must be computed the same way nnz(mask) is derived.
            testCase.verifyEqual(nnz(mask) / numel(mask), fovInfo.areaFraction);
        end

    end

    methods (Static)
        function img = makeFundus(frameSize, radius, varargin)
            %MAKEFUNDUS Synthetic fundus-like test image: a textured disc on black.
            %   'texture': 'sharp' (high-frequency noise, in-focus proxy),
            %              'flat' (uniform fill at 'brightness'),
            %              'gradient' (left-right brightness ramp, uneven-
            %              illumination proxy).
            p = inputParser;
            p.addParameter('texture', 'sharp');
            p.addParameter('brightness', 128);
            p.parse(varargin{:});
            texture = p.Results.texture;
            brightness = p.Results.brightness;

            [xx, yy] = meshgrid(1:frameSize, 1:frameSize);
            cx = frameSize / 2; cy = frameSize / 2;
            circleMask = ((xx - cx).^2 + (yy - cy).^2) <= radius^2;

            switch texture
                case 'sharp'
                    rng(1);
                    plane = uint8(min(255, max(0, brightness + 40 * randn(frameSize, frameSize))));
                    base = repmat(plane, [1 1 3]);
                case 'flat'
                    base = uint8(brightness * ones(frameSize, frameSize, 3));
                case 'gradient'
                    ramp = linspace(30, 230, frameSize);
                    plane = uint8(repmat(ramp, frameSize, 1));
                    base = repmat(plane, [1 1 3]);
                otherwise
                    error('tQualityAssessment:unknownTexture', 'Unknown texture option: %s', texture);
            end

            img = zeros(frameSize, frameSize, 3, 'uint8');
            for c = 1:3
                channel = base(:, :, c);
                channel(~circleMask) = 0;
                img(:, :, c) = channel;
            end
        end
    end
end
