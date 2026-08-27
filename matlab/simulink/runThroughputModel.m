function result = runThroughputModel(p, verbose)
%RUNTHROUGHPUTMODEL Simulate netraScreeningThroughput.slx for one parameter set.
%   RESULT = RUNTHROUGHPUTMODEL(P) where P is a struct from
%   throughputParams.m: computes derived workspace variables the model
%   reads at simulation time, runs it for P.SimDays days, and returns a
%   struct of summary results (final backlog, whether each stage is
%   "stable" -- backlog bounded rather than growing -- at each stage, peak
%   backlog, end-to-end capacity in patients/year at current resource
%   levels). RESULT = RUNTHROUGHPUTMODEL(P, true) also prints a report.
%
%   Simulation time unit is hours (see buildThroughputModel.m).

if nargin < 2
    verbose = false;
end

setupPathsRoot = fileparts(mfilename('fullpath'));
modelName = 'netraScreeningThroughput';
modelPath = fullfile(setupPathsRoot, [modelName '.slx']);
if ~isfile(modelPath)
    error('runThroughputModel:noModel', 'Run buildThroughputModel first (%s not found).', modelPath);
end

% --- Derived variables the model reads at simulation time ---
% Set via Simulink.SimulationInput rather than assignin('base', ...): keeps
% each call self-contained (no base-workspace pollution/collisions across
% repeated calls, which matters once this is used in a sweep -- see
% optimizeResourceAllocation.m). The model's own InitFcn callback (see
% buildThroughputModel.m) separately populates the base workspace from
% throughputParams() defaults, so plain Run in the Simulink toolbar also
% works -- both paths share the same formulas via computeDerivedVariables.m.
dailyPatients = p.AnnualPatientVolume / p.DaysPerYear; % used in the verbose report below
d = computeDerivedVariables(p);

load_system(modelPath);
simIn = Simulink.SimulationInput(modelName);
simIn = simIn.setVariable('ArrivalRateDuringHours', d.ArrivalRateDuringHours);
simIn = simIn.setVariable('ArrivalDutyCyclePercent', d.ArrivalDutyCyclePercent);
simIn = simIn.setVariable('TransmissionCapacity', d.TransmissionCapacity);
simIn = simIn.setVariable('ProcessingCapacity', d.ProcessingCapacity);
simIn = simIn.setVariable('ReferralRate', d.ReferralRate);
simIn = simIn.setVariable('ReviewCapacity', d.ReviewCapacity);
simIn = simIn.setModelParameter('StopTime', num2str(p.SimDays * 24));

transmissionCapacity = d.TransmissionCapacity;
processingCapacity = d.ProcessingCapacity;
reviewCapacity = d.ReviewCapacity;
arrivalRateDuringHours = d.ArrivalRateDuringHours;

simOut = sim(simIn);
close_system(modelName, 0);

% --- Analyze ---
result = struct();
result.params = p;

stages = {'transmission', 'processing', 'review'};
backlogVarNames = {'transmissionBacklogLog', 'processingBacklogLog', 'reviewBacklogLog'};
outflowVarNames = {'transmissionOutflowLog', 'processingOutflowLog', 'reviewOutflowLog'};
capacities = [transmissionCapacity, processingCapacity, reviewCapacity];

for i = 1:numel(stages)
    backlog = simOut.(backlogVarNames{i}).signals.values;
    t = simOut.(backlogVarNames{i}).time;
    outflow = simOut.(outflowVarNames{i}).signals.values;

    % Stability check: compare backlog at the end of the first vs. last day
    % (skipping the initial transient) -- growing day-over-day means the
    % stage can't keep up at this resource level.
    firstDayIdx = find(t >= 24, 1, 'first');
    lastDayIdx = numel(t);
    if isempty(firstDayIdx)
        firstDayIdx = 1;
    end
    growthPerDay = (backlog(lastDayIdx) - backlog(firstDayIdx)) / max(1, (p.SimDays - 1));

    s = stages{i};
    result.(s).capacityImagesPerHour = capacities(i);
    result.(s).peakBacklog = max(backlog);
    result.(s).finalBacklog = backlog(end);
    result.(s).backlogGrowthPerDay = growthPerDay;
    result.(s).stable = growthPerDay < 0.5; % essentially flat/declining, not accumulating
    result.(s).avgOutflow = mean(outflow);
end

result.autoClearedRate = mean(simOut.autoClearedRateLog.signals.values);

% Sustainable annual volume: the same STABILITY standard used for each
% stage's own `stable` flag above (24h-average capacity >= 24h-average
% demand -- bounded/periodic backlog, not a zero-queueing-delay guarantee),
% applied consistently across all three stages. All three capacities here
% are already 24h-average rates (transmission/processing capacity is
% available around the clock in this model even though arrivals only occur
% during clinic hours; review capacity is explicitly derated to a 24h
% average -- see throughputParams.m), so each stage's annual ceiling is
% capacity*24*DaysPerYear, with review's further divided by ReferralRate
% since it only sees the referred fraction of total volume.
stageAnnualCeilings = [ ...
    transmissionCapacity * 24 * p.DaysPerYear, ...
    processingCapacity * 24 * p.DaysPerYear, ...
    reviewCapacity * 24 * p.DaysPerYear / max(eps, p.ReferralRate) ...
];
[result.sustainableAnnualVolume, bottleneckIdx] = min(stageAnnualCeilings);
result.bottleneckStage = stages{bottleneckIdx};

if verbose
    fprintf('\n=== Throughput model result (%d-day simulation) ===\n', p.SimDays);
    fprintf('Target: %d patients/year (%.1f/day, %.1f/hr during %d clinic hours)\n', ...
        p.AnnualPatientVolume, dailyPatients, arrivalRateDuringHours, p.OperatingHoursPerDay);
    for i = 1:numel(stages)
        s = stages{i};
        r = result.(s);
        stableStr = 'STABLE';
        if ~r.stable
            stableStr = 'GROWING (bottleneck)';
        end
        fprintf('%-14s capacity=%8.1f img/hr  peak backlog=%8.1f  growth/day=%7.1f  [%s]\n', ...
            s, r.capacityImagesPerHour, r.peakBacklog, r.backlogGrowthPerDay, stableStr);
    end
    fprintf('Auto-cleared (no review needed): %.1f img/hr (%.0f%% of processed)\n', ...
        result.autoClearedRate, (1 - p.ReferralRate) * 100);
    fprintf('Estimated sustainable annual volume at current resources: %.0f patients/year (bottleneck: %s)\n', ...
        result.sustainableAnnualVolume, result.bottleneckStage);
end

end
