function buildThroughputModel()
%BUILDTHROUGHPUTMODEL Construct netraScreeningThroughput.slx from scratch.
%   Builds the district-level telemedicine screening throughput model:
%   Arrivals -> Transmission (bandwidth-constrained) -> AutomatedProcessing
%   (quality gate + DR grading + segmentation) -> Triage (referral split) ->
%   HumanReview (ophthalmologist confirmation of referred cases).
%
%   Each of Transmission/AutomatedProcessing/HumanReview is a fluid-queue
%   stage (see addFluidQueueStage.m) with capacity read from a base
%   workspace variable at simulation time -- set those via
%   runThroughputModel.m (which calls throughputParams.m for grounded
%   defaults), not by editing this builder script.
%
%   Simulation time unit is HOURS throughout, so all rates are images/hour.

modelName = 'netraScreeningThroughput';
setupPathsRoot = fileparts(mfilename('fullpath'));

if bdIsLoaded(modelName)
    close_system(modelName, 0);
end
new_system(modelName);
open_system(modelName);

% --- Arrivals ---
% Pulse Generator: full rate during clinic operating hours each day, zero
% outside them (capture only happens when the clinic is open; downstream
% stages keep draining backlog regardless via the fluid-queue design).
% Amplitude/Period/PulseWidth are workspace-variable expressions, resolved
% at simulation time from throughputParams.m's derived values.
add_block('simulink/Sources/Pulse Generator', [modelName '/Arrivals'], ...
    'Position', [30 80 70 110], ...
    'Amplitude', 'ArrivalRateDuringHours', ...
    'Period', '24', ...
    'PulseWidth', 'ArrivalDutyCyclePercent', ...
    'PhaseDelay', '0');

% --- Transmission ---
addFluidQueueStage(modelName, [modelName '/Transmission'], 'TransmissionCapacity');
set_param([modelName '/Transmission'], 'Position', [130 65 270 145]);

% --- Automated Processing ---
addFluidQueueStage(modelName, [modelName '/AutomatedProcessing'], 'ProcessingCapacity');
set_param([modelName '/AutomatedProcessing'], 'Position', [330 65 470 145]);

% --- Triage split ---
add_block('simulink/Math Operations/Gain', [modelName '/ReferralSplit'], ...
    'Position', [530 60 570 80], 'Gain', 'ReferralRate');
add_block('simulink/Math Operations/Gain', [modelName '/AutoClearSplit'], ...
    'Position', [530 130 570 150], 'Gain', '1-ReferralRate');

% --- Human Review ---
addFluidQueueStage(modelName, [modelName '/HumanReview'], 'ReviewCapacity');
set_param([modelName '/HumanReview'], 'Position', [630 25 770 105]);

% --- Logging ---
loggedSignals = { ...
    'Arrivals/1',                    'arrivalRateLog'; ...
    'Transmission/1',                'transmissionOutflowLog'; ...
    'Transmission/2',                'transmissionBacklogLog'; ...
    'AutomatedProcessing/1',         'processingOutflowLog'; ...
    'AutomatedProcessing/2',         'processingBacklogLog'; ...
    'AutoClearSplit/1',              'autoClearedRateLog'; ...
    'HumanReview/1',                 'reviewOutflowLog'; ...
    'HumanReview/2',                 'reviewBacklogLog' ...
};
yPos = 20;
for i = 1:size(loggedSignals, 1)
    blockName = ['Log_' loggedSignals{i, 2}];
    add_block('simulink/Sinks/To Workspace', [modelName '/' blockName], ...
        'Position', [850 yPos 950 yPos+15], ...
        'VariableName', loggedSignals{i, 2}, 'SaveFormat', 'Structure With Time');
    yPos = yPos + 40;
end

% --- Scope: the three backlogs together, so Run actually shows something ---
% Without this, hitting Run just logs to workspace variables with nothing
% visible until you separately plot them -- not much of a demo. Three input
% ports, one per stage, so the bottleneck is visible directly: whichever
% trace keeps climbing instead of leveling off is the constraint.
add_block('simulink/Sinks/Scope', [modelName '/BacklogScope'], ...
    'Position', [850 380 900 440], 'NumInputPorts', '3');
set_param([modelName '/BacklogScope'], 'ShowLegend', 'on');
add_line(modelName, 'Transmission/2', 'BacklogScope/1', 'autorouting', 'on');
add_line(modelName, 'AutomatedProcessing/2', 'BacklogScope/2', 'autorouting', 'on');
add_line(modelName, 'HumanReview/2', 'BacklogScope/3', 'autorouting', 'on');

% --- Wiring ---
add_line(modelName, 'Arrivals/1', 'Transmission/1', 'autorouting', 'on');
add_line(modelName, 'Transmission/1', 'AutomatedProcessing/1', 'autorouting', 'on');
add_line(modelName, 'AutomatedProcessing/1', 'ReferralSplit/1', 'autorouting', 'on');
add_line(modelName, 'AutomatedProcessing/1', 'AutoClearSplit/1', 'autorouting', 'on');
add_line(modelName, 'ReferralSplit/1', 'HumanReview/1', 'autorouting', 'on');

add_line(modelName, 'Arrivals/1', 'Log_arrivalRateLog/1', 'autorouting', 'on');
add_line(modelName, 'Transmission/1', 'Log_transmissionOutflowLog/1', 'autorouting', 'on');
add_line(modelName, 'Transmission/2', 'Log_transmissionBacklogLog/1', 'autorouting', 'on');
add_line(modelName, 'AutomatedProcessing/1', 'Log_processingOutflowLog/1', 'autorouting', 'on');
add_line(modelName, 'AutomatedProcessing/2', 'Log_processingBacklogLog/1', 'autorouting', 'on');
add_line(modelName, 'AutoClearSplit/1', 'Log_autoClearedRateLog/1', 'autorouting', 'on');
add_line(modelName, 'HumanReview/1', 'Log_reviewOutflowLog/1', 'autorouting', 'on');
add_line(modelName, 'HumanReview/2', 'Log_reviewBacklogLog/1', 'autorouting', 'on');

% --- InitFcn: make plain Run (Simulink toolbar) work standalone ---
% runThroughputModel.m sets ArrivalRateDuringHours/TransmissionCapacity/etc.
% via Simulink.SimulationInput, which only exists for that specific
% programmatic call -- it never touches the base workspace. Hit Run
% directly in the Simulink Editor without this and every parameter that
% reads one of those variable names fails with "Unrecognized function or
% variable" (plain sim(modelName) / the toolbar Run button both resolve
% against the base workspace, not a SimulationInput). InitFcn runs once at
% simulation start, in the base workspace, so this populates the same
% variables there from throughputParams() defaults -- both call paths share
% the formulas via computeDerivedVariables.m, so they can't drift apart.
%
% addpath(fileparts(get_param(bdroot,'FileName'))) first: InitFcn calling
% throughputParams()/computeDerivedVariables() only resolves if those .m
% files happen to be on the path already, which depends on MATLAB's current
% folder at the moment the model was opened -- true when opened via a
% script that cd'd into matlab/simulink/ first, false when opened directly
% (e.g. open_system() from another folder, or double-clicking the .slx in
% Explorer), which failed with "Unrecognized function or variable
% 'throughputParams'" the first time this was tried from the GUI.
% get_param(bdroot,'FileName') finds the model's own .slx location
% regardless of current folder, making this robust to how it's opened.
initFcn = [ ...
    'addpath(fileparts(get_param(bdroot,''FileName''))); ' ...
    'd = computeDerivedVariables(throughputParams()); ' ...
    'ArrivalRateDuringHours = d.ArrivalRateDuringHours; ' ...
    'ArrivalDutyCyclePercent = d.ArrivalDutyCyclePercent; ' ...
    'TransmissionCapacity = d.TransmissionCapacity; ' ...
    'ProcessingCapacity = d.ProcessingCapacity; ' ...
    'ReferralRate = d.ReferralRate; ' ...
    'ReviewCapacity = d.ReviewCapacity; ' ...
    'clear d;' ...
];
set_param(modelName, 'InitFcn', initFcn);

save_system(modelName, fullfile(setupPathsRoot, [modelName '.slx']));
fprintf('Saved %s.slx\n', modelName);
close_system(modelName, 0);

end
