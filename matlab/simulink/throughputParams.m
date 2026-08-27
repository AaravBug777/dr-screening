function p = throughputParams(overrides)
%THROUGHPUTPARAMS Central parameter set for the Netra screening throughput model.
%   P = THROUGHPUTPARAMS() returns a struct of parameters, grounded wherever
%   possible in numbers actually measured elsewhere in this project this
%   session, not invented. P = THROUGHPUTPARAMS(OVERRIDES) applies a struct
%   of overrides on top of the defaults (for sweeps — see
%   optimizeResourceAllocation.m).
%
%   Where each default comes from:
%
%   PerImageProcessingSeconds = 2.44 -- the combined automated pipeline
%     (quality gate + DR grading + segmentation/lesion explainability), one
%     worker, one CPU core:
%       Python DR grading (training/validate_external.py's timing test):
%         Ben Graham preprocessing (native-res image): 251 ms
%         Model inference, CPU, single-image:           91 ms
%                                                       -----
%                                                       342 ms
%       MATLAB classical CV pipeline (this session's validation runs):
%         Quality assessment (verdictTally.m):          ~150 ms
%         Vessel/OD/fovea segmentation (realDataSegmentationCheck.m): ~300 ms
%         Lesion detection, MA+exudates+haemorrhages (validateAgainstIDRiDLesion.m,
%           27.6s/54 + 30.8s/53 + 30.1s/54 images):     ~1650 ms
%                                                       -----
%                                                      2100 ms
%       Total: 342 + 2100 = 2442 ms =~ 2.44 s/image
%     GPU batched inference would cut the DR-grading slice to ~256 ms
%     (measured: 251 ms preprocess + 4.9 ms/image at batch=16), a small
%     fraction of the total either way -- the classical CV pipeline
%     dominates. See OPTS.UseGPU below.
%
%   ReferralRate = 0.400 -- fourth value this session, each an honest
%     correction of the last, not arbitrary tweaking:
%       0.262: true referable-DR prevalence in Messidor-2 (a population
%         baseline, not the model's actual behavior).
%       0.519: the model's actual predicted-referral rate once a tuned
%         decision threshold (REFERABLE_THRESHOLD=0.14 at the time) replaced
%         argmax -- but that threshold was tuned on the wrong population
%         (see training/config.py's REFERABLE_TEMPERATURE/REFERABLE_THRESHOLD
%         docstring) and over-flagged on real external data.
%       0.389: after properly calibrating (temperature scaling + threshold,
%         both fit on a held-out half of the actual external population and
%         confirmed on the other untouched half --
%         training/calibrate_referable_threshold.py), sensitivity=90.8%/
%         specificity=88.5% -- the first calibration to clear both SIH
%         targets at once, at a more moderate referral rate than the
%         previous attempt's 51.9%.
%       0.400 (current): switching the live grading path to test-time
%         augmentation (training/tta.py, config.py's TTA_REFERABLE_THRESHOLD)
%         needed its own calibration pass on the identical held-out split --
%         sensitivity rose to 92.1% (specificity 87.4%, still clearing the
%         85% target) at a referral rate of 40.0%, a real, small increase
%         from 38.9% that trades a touch more review volume for higher
%         sensitivity -- see training/calibrate_tta_threshold.py.
%
%   ReviewTimeSeconds = 30 -- directly from the SIH26038 brief's own spec:
%     "enabling ophthalmologist validation in under 30 seconds".
%
%   NumReviewers = 1 -- default deliberately reflects the SIH brief's own
%     framing ("~1 ophthalmologist per 100,000 rural population"), not an
%     optimistic assumption. The whole point of this model is to show
%     whether automated triage makes that scarce a resource sufficient, not
%     to assume away the constraint the brief itself opens with.
%
%   AvgImageSizeMB = 0.5 -- representative compressed fundus JPEG size.
%     Real files observed this session ranged ~0.13-3.5 MB depending on
%     resolution/compression (Messidor-2 preprocessed ~0.33 MB, DRIVE/IDRiD
%     originals larger); 0.5 MB is a representative mid-range value for a
%     screening-quality (not full diagnostic archival-quality) capture.

p = struct();

% --- Scale / demand ---
p.AnnualPatientVolume = 100000;      % patients/year -- SIH brief's target
p.OperatingHoursPerDay = 8;          % clinic capture hours/day; processing itself can run 24h (batch overnight) via ProcessingHoursPerDay
p.ProcessingHoursPerDay = 24;        % automated pipeline + review can run beyond capture hours (batch/overnight processing) -- realistic for a low-connectivity deployment that uploads during the day and processes overnight
p.DaysPerYear = 365;

% --- Transmission ---
p.AvgImageSizeMB = 0.5;              % see docstring
p.BandwidthMbps = 5;                 % available uplink from a rural PHC, Mbps -- swept in optimizeResourceAllocation.m

% --- Automated processing ---
p.PerImageProcessingSeconds = 2.44;  % see docstring -- CPU, one worker
p.NumProcessingNodes = 1;            % parallel workers (cores/machines) at the processing hub

% --- Triage / human review ---
p.ReferralRate = 0.400;              % see docstring -- calibrated, held-out-validated deployed rate
p.ReviewTimeSeconds = 30;            % see docstring -- from the SIH brief
p.NumReviewers = 1;                  % see docstring -- deliberately realistic, not generous
p.ReviewerHoursPerDay = 8;           % a human reviewer works a shift, unlike automated compute (ProcessingHoursPerDay=24) which can run unattended overnight. Modeled as a derated average capacity (ReviewCapacity * ReviewerHoursPerDay/24), not an explicit day/night cycle -- a simplification, documented in runThroughputModel.m, adequate for the steady-state stability question this model answers (does average capacity keep up with average demand) but smooths over the day-to-day sawtooth a truly time-gated capacity would show.

% --- Simulation ---
p.SimDays = 7;                       % simulate a week to see backlog trend, not just a single instant
p.ArrivalProfile = 'clinic-hours';   % 'clinic-hours' (zero arrivals outside OperatingHoursPerDay) or 'uniform' (constant rate 24h)

if nargin > 0 && ~isempty(overrides)
    fields = fieldnames(overrides);
    for i = 1:numel(fields)
        p.(fields{i}) = overrides.(fields{i});
    end
end

end
