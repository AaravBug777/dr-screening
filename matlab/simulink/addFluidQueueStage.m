function addFluidQueueStage(modelName, subsysPath, capacityExpr)
%ADDFLUIDQUEUESTAGE Add a reusable capacity-constrained queue subsystem.
%   ADDFLUIDQUEUESTAGE(MODELNAME, SUBSYSPATH, CAPACITYEXPR) adds a
%   subsystem at SUBSYSPATH (e.g. 'netraScreeningThroughput/Transmission')
%   implementing a standard continuous ("fluid") approximation of a
%   capacity-constrained queue -- appropriate for capacity planning at
%   scale (100,000+ patients/year), not individual-event simulation:
%
%     Inport 1 "Inflow"  -> rate arriving at this stage (images/hour)
%     Outport 1 "Outflow" -> rate actually processed (images/hour), capped at capacity
%     Outport 2 "Backlog" -> accumulated queue depth (images), never negative
%
%   Mechanism: Outflow = saturate(Inflow + Backlog*BIG_GAIN, 0, capacity).
%   BIG_GAIN is large enough that any positive backlog saturates Outflow to
%   full capacity (server works flat-out whenever there's a queue); at
%   Backlog=0, Outflow tracks Inflow directly (capped at capacity, so it
%   never over-serves). Backlog = integral(Inflow - Outflow), clamped at a
%   lower limit of 0 via the Integrator block's own output-limiting (so it
%   can't go negative, which "queue depth" physically can't). CAPACITYEXPR
%   is a string naming a base-workspace variable (e.g. 'TransmissionCapacity')
%   the Saturation block's upper limit reads from -- capacity is a scenario
%   parameter here, not a dynamic signal, since resource levels don't change
%   mid-simulation.

add_block('simulink/Ports & Subsystems/Subsystem', subsysPath);
% Subsystem blocks come pre-populated with a default In1/Out1 pass-through --
% clear it so we control every block explicitly.
delete_block([subsysPath '/In1']);
delete_block([subsysPath '/Out1']);

add_block('simulink/Sources/In1', [subsysPath '/Inflow'], 'Position', [30 100 60 120]);
add_block('simulink/Sinks/Out1', [subsysPath '/Outflow'], 'Position', [430 90 460 110]);
add_block('simulink/Sinks/Out1', [subsysPath '/Backlog'], 'Position', [430 200 460 220], 'Port', '2');

add_block('simulink/Math Operations/Gain', [subsysPath '/FeedbackGain'], ...
    'Position', [200 190 240 210], 'Gain', '1e6', 'Orientation', 'left');

add_block('simulink/Math Operations/Sum', [subsysPath '/PlusBacklog'], ...
    'Position', [130 95 160 125], 'Inputs', '++');

add_block('simulink/Discontinuities/Saturation', [subsysPath '/CapacityLimit'], ...
    'Position', [250 95 290 125], 'UpperLimit', capacityExpr, 'LowerLimit', '0');

add_block('simulink/Math Operations/Sum', [subsysPath '/NetFlow'], ...
    'Position', [250 190 280 220], 'Inputs', '+-');

add_block('simulink/Continuous/Integrator', [subsysPath '/BacklogIntegrator'], ...
    'Position', [320 190 360 220], 'LimitOutput', 'on', 'LowerSaturationLimit', '0', ...
    'UpperSaturationLimit', 'inf', 'InitialCondition', '0');

% Wiring
add_line(subsysPath, 'Inflow/1', 'PlusBacklog/1', 'autorouting', 'on');
add_line(subsysPath, 'PlusBacklog/1', 'CapacityLimit/1', 'autorouting', 'on');
add_line(subsysPath, 'CapacityLimit/1', 'Outflow/1', 'autorouting', 'on');

add_line(subsysPath, 'Inflow/1', 'NetFlow/1', 'autorouting', 'on');
add_line(subsysPath, 'CapacityLimit/1', 'NetFlow/2', 'autorouting', 'on');
add_line(subsysPath, 'NetFlow/1', 'BacklogIntegrator/1', 'autorouting', 'on');
add_line(subsysPath, 'BacklogIntegrator/1', 'Backlog/1', 'autorouting', 'on');
add_line(subsysPath, 'BacklogIntegrator/1', 'FeedbackGain/1', 'autorouting', 'on');
add_line(subsysPath, 'FeedbackGain/1', 'PlusBacklog/2', 'autorouting', 'on');

end
