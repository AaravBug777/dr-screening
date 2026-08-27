% Find the minimum resources (reviewers, processing nodes, bandwidth) each
% pipeline stage needs to sustain a range of target annual patient volumes,
% using the same 24h-average stability standard runThroughputModel.m's
% `stable` flag uses (validated against actual Simulink runs -- see
% simulink/README.md's "Validation" section). Solving analytically for a
% sweep, rather than a Simulink sim() call per candidate, is legitimate here
% because runThroughputModel.m already confirmed the analytical ceiling
% formula matches simulated behavior exactly across three separate
% scenarios spanning well-under to well-over capacity.
setupPathsRoot = fileparts(mfilename('fullpath'));
addpath(setupPathsRoot);

targetVolumes = [100000, 250000, 500000, 1000000, 2000000, 5000000];
p0 = throughputParams();

fprintf('%-12s %12s %12s %12s %10s\n', 'Target/yr', 'Reviewers', 'ProcNodes', 'Bandwidth', 'BoundBy');
fprintf('%-12s %12s %12s %12s %10s\n', '', '(needed)', '(needed)', '(Mbps needed)', '(headroom)');

for V = targetVolumes
    dailyPatients = V / p0.DaysPerYear;
    referredPerDay = dailyPatients * p0.ReferralRate;

    % Reviewers: reviewCapacity(N) * 24 / ReferralRate * DaysPerYear >= V
    % => N >= V * ReferralRate * ReviewTimeSeconds / (3600 * ReviewerHoursPerDay * DaysPerYear)
    reviewersNeeded = ceil( ...
        V * p0.ReferralRate * p0.ReviewTimeSeconds / (3600 * p0.ReviewerHoursPerDay * p0.DaysPerYear));

    % Processing nodes: processingCapacity(N) * 24 * DaysPerYear >= V
    % => N >= V * PerImageProcessingSeconds / (3600 * 24 * DaysPerYear)
    nodesNeeded = ceil( ...
        V * p0.PerImageProcessingSeconds / (3600 * 24 * p0.DaysPerYear));
    nodesNeeded = max(1, nodesNeeded);

    % Bandwidth: transmissionCapacity(B) * 24 * DaysPerYear >= V
    % => B >= V * AvgImageSizeMB * 8 / (3600 * 24 * DaysPerYear)
    bandwidthNeeded = V * p0.AvgImageSizeMB * 8 / (3600 * 24 * p0.DaysPerYear);

    % Which resource, at its current default level, would run out first?
    ceilings = struct( ...
        'review', p0.NumReviewers / max(1, reviewersNeeded), ...
        'processing', p0.NumProcessingNodes / max(1, nodesNeeded), ...
        'bandwidth', p0.BandwidthMbps / max(eps, bandwidthNeeded));
    [~, worstField] = min(struct2array(ceilings));
    fieldNames = fieldnames(ceilings);
    boundBy = fieldNames{worstField};

    fprintf('%-12d %12d %12d %12.2f %10s\n', V, reviewersNeeded, nodesNeeded, bandwidthNeeded, boundBy);
end

fprintf('\n(Current default resources: %d reviewer(s) x %.0fs/case x %dh/day, ', ...
    p0.NumReviewers, p0.ReviewTimeSeconds, p0.ReviewerHoursPerDay);
fprintf('%d processing node(s) x %.2fs/image, %.0f Mbps bandwidth, %.2f MB/image)\n', ...
    p0.NumProcessingNodes, p0.PerImageProcessingSeconds, p0.BandwidthMbps, p0.AvgImageSizeMB);

fprintf('\n--- Confirming the 500,000/year recommendation with an actual Simulink run ---\n');
p500k = throughputParams(struct('AnnualPatientVolume', 500000, 'NumReviewers', 1));
runThroughputModel(p500k, true);
