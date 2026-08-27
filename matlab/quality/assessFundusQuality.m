function report = assessFundusQuality(img, opts)
%ASSESSFUNDUSQUALITY Gate a fundus image for gradeability; enhance or reject.
%   REPORT = ASSESSFUNDUSQUALITY(IMG) where IMG is either a filepath (char/
%   string) or an already-loaded RGB image array, runs the Stage-1 quality
%   pipeline described in matlab/README.md and returns a struct:
%
%     .verdict              "pass" | "pass_after_enhancement" | "borderline" | "reject"
%     .reasons               cellstr of failure/borderline reason codes
%     .feedback               human-readable recapture guidance (see
%                              generateRecaptureFeedback.m); empty for "pass"
%     .focusScore             raw variance-of-Laplacian sharpness value
%     .illumination           struct from computeIlluminationScore
%     .fov                    struct from computeFOVMask
%     .enhancedImage           uint8 RGB image if enhancement was applied, else []
%     .enhancedFocusScore      re-scored focus after enhancement (if applicable)
%     .enhancedIllumination    re-scored illumination after enhancement (if applicable)
%
%   REPORT = ASSESSFUNDUSQUALITY(IMG, OPTS) uses a custom threshold config
%   (see defaultQualityConfig.m) instead of the defaults.
%
%   See matlab/README.md "Stage-1 pipeline contract" for how a caller should
%   act on each verdict.

if nargin < 2 || isempty(opts)
    opts = defaultQualityConfig();
end

if ischar(img) || isstring(img)
    img = imread(char(img));
end

[h0, w0, ~] = size(img);

report = struct();
report.verdict = '';
report.reasons = {};
report.feedback = '';
report.focusScore = NaN;
report.illumination = struct();
report.fov = struct();
report.enhancedImage = [];
report.enhancedFocusScore = NaN;
report.enhancedIllumination = struct();
report.sourceResolution = struct('height', h0, 'width', w0, 'maxDim', max(h0, w0));

% --- Minimum source resolution ---
% Checked against the TRUE native size, before the working-resolution
% downscale below -- see defaultQualityConfig.m's MinNativeResolutionPx for
% the real, reproduced misgrading that motivated this and the sweep
% confirming why 640px (== MaxWorkingDim) is the right floor, not a guess.
% Pixel-level processing cannot add back resolution that was never
% captured, so unlike focus/illumination this is never "borderline" /
% enhancement-recoverable -- straight to reject, same as an empty FOV mask
% below.
if max(h0, w0) < opts.MinNativeResolutionPx
    report.verdict = 'reject';
    report.reasons = {'low_source_resolution'};
    report.feedback = generateRecaptureFeedback(report.reasons);
    return
end

% Downscale large captures to a fixed working resolution before any scoring
% or enhancement. Native fundus photos run 1000-3400px wide in these
% datasets; running CLAHE/denoising at full resolution measured ~2s/image,
% which doesn't come close to the throughput a 100,000+ patients/year
% district program needs. Mirrors training/dataset.py's
% ben_graham_preprocess (max_working_dim=640) on the Python side, and
% matters for calibration too: variance-of-Laplacian is scale-dependent, so
% every threshold in defaultQualityConfig.m was calibrated at this same
% working resolution (see matlab/tests/diagnoseFocusThresholds.m).
if max(h0, w0) > opts.MaxWorkingDim
    scale = opts.MaxWorkingDim / max(h0, w0);
    img = imresize(img, scale);
end

% --- Field of view ---
[mask, fovInfo] = computeFOVMask(img, opts);
report.fov = fovInfo;

reasons = {};
fovVerdict = 'pass';

if fovInfo.areaFraction < opts.MinFOVFraction
    reasons{end + 1} = 'insufficient_field_of_view';
    fovVerdict = 'reject';
elseif fovInfo.areaFraction < opts.BorderlineFOVFraction
    reasons{end + 1} = 'partial_field_of_view';
    fovVerdict = 'borderline';
end

if fovInfo.possiblyClipped
    reasons{end + 1} = 'possible_fov_clipping';
    fovVerdict = maxVerdict(fovVerdict, 'borderline');
end

if fovInfo.centerOffsetFraction > opts.MaxCenterOffsetFraction
    reasons{end + 1} = 'off_center';
    fovVerdict = maxVerdict(fovVerdict, 'borderline');
end

% If the FOV mask is essentially empty, focus/illumination readings on it
% would be meaningless — short-circuit straight to reject.
if strcmp(fovVerdict, 'reject') && fovInfo.areaFraction < 0.05
    report.verdict = 'reject';
    report.reasons = reasons;
    report.feedback = generateRecaptureFeedback(reasons);
    return
end

% --- Focus ---
report.focusScore = computeFocusScore(img, mask);
focusVerdict = 'pass';
if report.focusScore < opts.FocusRejectThreshold
    reasons{end + 1} = 'too_blurry';
    focusVerdict = 'reject';
elseif report.focusScore < opts.FocusBorderlineThreshold
    reasons{end + 1} = 'soft_focus';
    focusVerdict = 'borderline';
end

% --- Illumination ---
illum = computeIlluminationScore(img, mask, opts);
report.illumination = illum;
illumVerdict = 'pass';

if illum.meanIntensity < opts.DarkMeanThreshold
    reasons{end + 1} = 'too_dark';
    illumVerdict = 'reject';
elseif illum.meanIntensity < opts.DarkBorderlineThreshold
    reasons{end + 1} = 'underexposed';
    illumVerdict = maxVerdict(illumVerdict, 'borderline');
end

if illum.meanIntensity > opts.BrightMeanThreshold
    reasons{end + 1} = 'too_bright';
    illumVerdict = 'reject';
elseif illum.meanIntensity > opts.BrightBorderlineThreshold
    reasons{end + 1} = 'overexposed';
    illumVerdict = maxVerdict(illumVerdict, 'borderline');
end

if illum.uniformityCV > opts.UniformityCVRejectThreshold
    reasons{end + 1} = 'very_uneven_illumination';
    illumVerdict = 'reject';
elseif illum.uniformityCV > opts.UniformityCVBorderlineThreshold
    reasons{end + 1} = 'uneven_illumination';
    illumVerdict = maxVerdict(illumVerdict, 'borderline');
end

if illum.hasGlare
    reasons{end + 1} = 'glare';
    illumVerdict = maxVerdict(illumVerdict, 'borderline');
end

% --- Combine ---
overall = maxVerdict(maxVerdict(fovVerdict, focusVerdict), illumVerdict);
report.reasons = unique(reasons, 'stable');

if strcmp(overall, 'reject')
    report.verdict = 'reject';
    report.feedback = generateRecaptureFeedback(report.reasons);
    return
end

if strcmp(overall, 'pass')
    report.verdict = 'pass';
    return
end

% --- Borderline: enhance, optionally re-evaluate ---
report.verdict = 'borderline';
enhanced = enhanceFundusImage(img, opts);
report.enhancedImage = enhanced;

if opts.ReEvaluateAfterEnhancement
    % Re-use the same FOV mask: enhancement doesn't change the shape of the
    % fundus circle. Always record the re-scored focus for transparency, but
    % what actually gates the verdict depends on *which* reasons triggered
    % borderline, because enhanceFundusImage only does illumination
    % normalization + CLAHE + denoising — it has no sharpening/deconvolution
    % step, so it cannot plausibly fix blur, and it operates on pixel values
    % so it cannot fix a field-of-view/geometry problem either:
    %
    %   - FOV-related reasons (partial coverage, clipping, off-center):
    %     nothing pixel-level can fix this -> always still needs recapture.
    %   - Focus-only ("soft_focus"): the image already cleared
    %     FocusRejectThreshold at entry, i.e. it's within the range of
    %     real, human-graded images in this dataset (see
    %     defaultQualityConfig.m's calibration note) — enhancement improves
    %     usable contrast even though it can't add back resolution, so this
    %     is accepted rather than held to the same bar a second time.
    %   - Illumination-related reasons: this is exactly what illumination
    %     normalization + CLAHE target, so re-score for real and require it
    %     to actually clear the bar now.
    report.enhancedFocusScore = computeFocusScore(enhanced, mask);

    fovReasonCodes = {'insufficient_field_of_view', 'partial_field_of_view', ...
        'possible_fov_clipping', 'off_center'};
    illumReasonCodes = {'too_dark', 'underexposed', 'too_bright', 'overexposed', ...
        'very_uneven_illumination', 'uneven_illumination', 'glare'};

    hasFovReason = any(ismember(report.reasons, fovReasonCodes));
    hasIllumReason = any(ismember(report.reasons, illumReasonCodes));

    if hasFovReason
        stillBad = true;
    elseif hasIllumReason
        report.enhancedIllumination = computeIlluminationScore(enhanced, mask, opts);
        stillBad = report.enhancedIllumination.meanIntensity < opts.DarkBorderlineThreshold || ...
            report.enhancedIllumination.meanIntensity > opts.BrightBorderlineThreshold || ...
            report.enhancedIllumination.uniformityCV > opts.UniformityCVBorderlineThreshold || ...
            report.enhancedIllumination.hasGlare;
    else
        % Borderline on focus alone: accept (see rationale above).
        stillBad = false;
    end

    if ~stillBad
        report.verdict = 'pass_after_enhancement';
    else
        report.feedback = generateRecaptureFeedback(report.reasons);
    end
else
    report.feedback = generateRecaptureFeedback(report.reasons);
end

end

function v = maxVerdict(a, b)
%MAXVERDICT Combine two verdicts, worst-wins ordering: reject > borderline > pass.
rank = containers.Map({'pass', 'borderline', 'reject'}, {0, 1, 2});
if rank(a) >= rank(b)
    v = a;
else
    v = b;
end
end
