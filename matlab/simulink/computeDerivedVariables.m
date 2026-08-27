function d = computeDerivedVariables(p)
%COMPUTEDERIVEDVARIABLES Turn throughputParams.m's P into the workspace
%   variables netraScreeningThroughput.slx actually reads (arrival rate,
%   per-stage capacities). Shared by two call paths so the formulas only
%   exist once:
%     1. runThroughputModel.m -- feeds these into a Simulink.SimulationInput
%        for programmatic runs/sweeps (doesn't touch the base workspace).
%     2. The model's own InitFcn callback (set in buildThroughputModel.m)
%        -- assigns these into the base workspace using throughputParams()
%        defaults, so clicking Run directly in the Simulink toolbar also
%        works, not just the scripted path. Without this, opening the model
%        and hitting Run fails with "Unrecognized function or variable
%        'ArrivalRateDuringHours'" etc. -- the parameters were only ever
%        being set inside Simulink.SimulationInput calls, never the base
%        workspace a plain sim(modelName) resolves against.

d = struct();

dailyPatients = p.AnnualPatientVolume / p.DaysPerYear;

if strcmp(p.ArrivalProfile, 'clinic-hours')
    d.ArrivalRateDuringHours = dailyPatients / p.OperatingHoursPerDay;
    d.ArrivalDutyCyclePercent = (p.OperatingHoursPerDay / 24) * 100;
else
    d.ArrivalRateDuringHours = dailyPatients / 24;
    d.ArrivalDutyCyclePercent = 100;
end

d.TransmissionCapacity = p.BandwidthMbps * 3600 / (p.AvgImageSizeMB * 8); % Mbps -> images/hour
d.ProcessingCapacity = p.NumProcessingNodes * 3600 / p.PerImageProcessingSeconds;
d.ReferralRate = p.ReferralRate;
% Reviewer capacity derated for realistic working hours (see throughputParams.m).
d.ReviewCapacity = p.NumReviewers * 3600 / p.ReviewTimeSeconds * (p.ReviewerHoursPerDay / 24);

end
