% Standalone validation of addFluidQueueStage.m before it's used inside the
% full throughput model: feed a known constant inflow, check backlog growth
% rate and outflow saturation match the expected fluid-queue math exactly.
setupPathsRoot = fileparts(mfilename('fullpath'));
addpath(setupPathsRoot);

modelName = 'testQueueStageModel';
if bdIsLoaded(modelName)
    close_system(modelName, 0);
end
new_system(modelName);
open_system(modelName);

add_block('simulink/Sources/Step', [modelName '/Inflow'], ...
    'Position', [30 90 60 110], 'Time', '0', 'Before', '100', 'After', '100');

addFluidQueueStage(modelName, [modelName '/QueueStage'], 'TestCapacity');
set_param([modelName '/QueueStage'], 'Position', [120 70 260 150]);

add_block('simulink/Sinks/To Workspace', [modelName '/OutflowLog'], ...
    'Position', [320 60 400 80], 'VariableName', 'outflowLog', 'SaveFormat', 'Structure With Time');
add_block('simulink/Sinks/To Workspace', [modelName '/BacklogLog'], ...
    'Position', [320 120 400 140], 'VariableName', 'backlogLog', 'SaveFormat', 'Structure With Time');

add_line(modelName, 'Inflow/1', 'QueueStage/1', 'autorouting', 'on');
add_line(modelName, 'QueueStage/1', 'OutflowLog/1', 'autorouting', 'on');
add_line(modelName, 'QueueStage/2', 'BacklogLog/1', 'autorouting', 'on');

save_system(modelName, fullfile(setupPathsRoot, [modelName '.slx']));

% --- Test 1: capacity below inflow -> backlog should grow linearly ---
TestCapacity = 50; %#ok<NASGU>
simOut = sim(modelName, 'StopTime', '2');
outflowVals = simOut.outflowLog.signals.values;
backlogVals = simOut.backlogLog.signals.values;
fprintf('Test 1 (inflow=100, capacity=50):\n');
fprintf('  outflow at t=2: %.2f (expect ~50)\n', outflowVals(end));
fprintf('  backlog at t=2: %.2f (expect ~100, i.e. (100-50)*2)\n', backlogVals(end));
assert(abs(outflowVals(end) - 50) < 1, 'outflow should saturate at capacity=50');
assert(abs(backlogVals(end) - 100) < 5, 'backlog should grow at (inflow-capacity)=50/hr for 2hr = 100');

% --- Test 2: capacity above inflow -> backlog should stay ~0, outflow~=inflow ---
TestCapacity = 200; %#ok<NASGU>
simOut = sim(modelName, 'StopTime', '2');
outflowVals = simOut.outflowLog.signals.values;
backlogVals = simOut.backlogLog.signals.values;
fprintf('\nTest 2 (inflow=100, capacity=200):\n');
fprintf('  outflow at t=2: %.2f (expect ~100)\n', outflowVals(end));
fprintf('  backlog at t=2: %.2f (expect ~0)\n', backlogVals(end));
assert(abs(outflowVals(end) - 100) < 1, 'outflow should track inflow=100 when capacity is not binding');
assert(abs(backlogVals(end) - 0) < 1, 'backlog should stay ~0 when capacity exceeds inflow');

fprintf('\nAll queue-stage tests passed.\n');
close_system(modelName, 0);
