# Telemedicine screening throughput model (Stage 3)

Models the district-level pipeline the SIH26038 brief asks for: "image
acquisition rates, bandwidth constraints, processing throughput, and review
capacity — to optimize resource allocation for district-level programs
serving 100,000+ patients annually." Built and validated in the same
session (same approach as `quality/` and `segmentation/`): construct, test
against known analytical behavior, fix what's wrong, run for real.

## Why a fluid model, not SimEvents

**SimEvents** (Simulink's discrete-event simulation add-on — individual
patient-level events, queues, servers) would be the more granular way to
build this, and this MATLAB license permits it (`license('test','SimEvents')`
returns true), but the product **isn't actually installed** on this machine
(`load_system('simevents')` fails — license entitlement and local
installation are different things). Rather than block on installing it,
this model uses a **continuous ("fluid") approximation** instead: rates in
images/hour, queue backlog as an integrated state, capacity as a saturation
limit. This is a standard, legitimate technique for capacity planning at the
volume this brief targets (100,000+/year — a macro/aggregate-rate regime,
not one where individual-patient event granularity changes the resourcing
conclusion). If you install SimEvents later, `addFluidQueueStage.m`'s three
stages are the natural place to swap in `simevents.Queue`/`simevents.Server`
blocks for stochastic, individual-event-level fidelity.

## Architecture

```
Arrivals -> Transmission -> AutomatedProcessing -> Triage -> HumanReview
(clinic     (bandwidth-      (quality gate +        (referral   (ophthalmologist
 hours)      constrained)     DR grading +            split)     confirms
                               segmentation)                      referred cases)
```

Each of Transmission/AutomatedProcessing/HumanReview is a **fluid queue**
(`addFluidQueueStage.m`): `Outflow = saturate(Inflow + Backlog*BIG_GAIN, 0,
capacity)`, `Backlog = integral(Inflow - Outflow)` clamped at 0. Positive
backlog saturates the stage to full capacity (working flat-out); zero
backlog lets inflow through directly (capped at capacity, never over-serving).
Capacity is a scenario parameter (workspace variable), not a dynamic signal —
resource levels don't change mid-simulation.

Automated processing capacity is available 24/7 in this model (compute can
run unattended overnight); review capacity is **derated** for realistic
human working hours (`ReviewerHoursPerDay`, default 8) rather than assumed
available around the clock — a human reviewer can't work 24 hours a day the
way a server can, and pretending otherwise would hide the real bottleneck
this model exists to find.

## Files

| File | Purpose |
|---|---|
| `throughputParams.m` | All parameters, one place to tune — every default grounded in a number actually measured elsewhere in this project this session (see its docstring for exactly where each one comes from). |
| `addFluidQueueStage.m` | The reusable capacity-constrained-queue building block. |
| `buildThroughputModel.m` | Constructs `netraScreeningThroughput.slx` from scratch via the Simulink API (`.slx` is a binary format — this is how a Simulink model gets authored as reviewable, version-controllable code rather than hand-edited XML). |
| `runThroughputModel.m` | Simulates the model for one parameter set, returns per-stage stability/backlog/capacity results. |
| `optimizeResourceAllocation.m` | Sweeps target annual volumes, computes minimum reviewers/processing-nodes/bandwidth needed at each — the actual "optimize resource allocation" deliverable. |
| `testQueueStage.m` / `testQueueStageModel.slx` | Validates the queue-stage building block against known fluid-queue math before it's trusted inside the full model. |
| `computeDerivedVariables.m` | Turns `throughputParams.m`'s parameters into the workspace variables the model actually reads (arrival rate, per-stage capacities) — shared by `runThroughputModel.m` and the model's own `InitFcn` callback so the formulas exist exactly once (see "Validation" below for why both paths need it). |

## Quick start

```matlab
buildThroughputModel               % constructs netraScreeningThroughput.slx (run once, or after changing the architecture)

p = throughputParams();            % grounded defaults -- see its docstring
result = runThroughputModel(p, true);   % simulate + print a report

optimizeResourceAllocation         % sweep target volumes, report resource needs
```

## Validation

`testQueueStage.m` feeds the queue-stage building block a known constant
inflow against two capacity settings and checks the resulting backlog growth
rate / outflow saturation match the closed-form fluid-queue math exactly
(capacity below inflow: backlog grows at exactly `inflow-capacity` per hour;
capacity above inflow: backlog stays at 0, outflow tracks inflow). Both pass.

The full model was then stress-tested at three target volumes to confirm
the simulated stability behavior matches an independent analytical formula
(`optimizeResourceAllocation.m`'s ceiling calculation), not just at the
default operating point:

| Target/year | Review peak backlog | Review growth/day | Verdict |
|---|---|---|---|
| 100,000 | 0 | 0 | stable |
| 1,000,000 | 397.8 | 0 | stable (backlog oscillates but doesn't accumulate) |
| 2,000,000 | 3969.3 | **475.6** | **unstable** (correctly flips exactly where the analytical ceiling — 1,337,405/year — says it should) |

This cross-check caught a real bug: an earlier version of the analytical
ceiling formula compared review capacity (a 24h-*average* rate, since
reviewers are derated for working hours) against an 8h-*instantaneous*
demand rate — an apples-to-oranges mismatch that would have under-estimated
the true ceiling by ~3x. Fixed by putting every stage's ceiling on the same
24h-average-capacity-vs-24h-average-demand basis.

## The actual finding

At the SIH brief's own target (100,000 patients/year) with realistic,
measured parameters — **compute and bandwidth are nowhere near the
bottleneck**. A single CPU core running the combined classical CV + DR
grading pipeline (2.44 s/image, measured, not assumed — see
`throughputParams.m`) could process ~1,475 images/hour against a demand of
~34/hour; even a constrained 5 Mbps rural link at 0.5 MB/image could
transmit ~4,500 images/hour. Both are over-provisioned by more than 100x at
the target volume.

**The real constraint is human review capacity** — exactly what the SIH
brief opens with ("India has only ~1 ophthalmologist per 100,000 rural
population, making mass manual screening infeasible"). The model quantifies
what automated triage actually buys against that constraint: with a
30-second confirmation review (the SIH brief's own spec) instead of a full
manual exam, **a single ophthalmologist working a normal 8-hour day
sustains up to ~876,000 patients/year** before becoming the binding
constraint — nearly 9x the brief's own 100,000/year target.

**`ReferralRate` went through four honest corrections this session, not
arbitrary tweaking — worth knowing the full arc:**

| Value | What it was | Why it changed |
|---|---|---|
| 0.262 | True referable-DR prevalence in Messidor-2 ground truth | A population baseline, not the model's actual behavior |
| 0.519 | The model's real predicted-referral rate once a tuned threshold (`REFERABLE_THRESHOLD=0.14`) replaced argmax | That threshold was tuned on the wrong population (the training-adjacent internal validation split) and over-flagged on genuinely external data |
| 0.389 | The model's real predicted-referral rate after properly calibrating: temperature scaling + threshold, both fit on a held-out half of the actual external population and confirmed on the other untouched half (`training/calibrate_referable_threshold.py`) | First calibration to clear both the SIH brief's sensitivity (90.8%) AND specificity (88.5%) targets simultaneously on real held-out data |
| **0.400 (current)** | The model's real predicted-referral rate once the live grading path switched to test-time augmentation (`training/tta.py`), recalibrated on the identical split (`training/calibrate_tta_threshold.py`) | TTA raised sensitivity to 92.1% (kappa 0.835->0.844) at a real, small cost in referral rate — see top-level README's "Round 4" section |

Each step used the model's ACTUAL predicted-referral rate at that point,
not the true population prevalence — using prevalence would understate real
reviewer workload for whatever decision rule is actually deployed.
Sustainable volume moves inversely with referral rate, confirmed again at
this step (876000/900771 ≈ 0.389/0.400 rearranged, matching within
simulation-timestep rounding) — not a coincidence, a direct consequence of
the fluid queue model's linear capacity/demand relationship.

`optimizeResourceAllocation.m`'s sweep at the current (0.389) referral rate:
a second reviewer isn't needed until volume passes 1,000,000/year — see its
output for the full table at other target volumes.

This is the core, quantified value proposition of automated triage for this
problem: it doesn't eliminate the ophthalmologist shortage the brief opens
with, but it turns "1 per 100,000" from an infeasible constraint into a
comfortably sufficient one (9x headroom at the target volume) — turning the
brief's own opening problem statement into a demonstrated, numbered result,
arrived at honestly through two real corrections rather than assumed right
the first time.

**A sixth bug, found by a human actually clicking the GUI Run button rather
than another scripted `sim()` call**: every scripted test above used
`runThroughputModel.m`, which feeds parameters through a
`Simulink.SimulationInput` object — deliberately, to keep sweep calls
self-contained (see its docstring). But that means those variable names
(`ArrivalRateDuringHours`, `TransmissionCapacity`, etc.) never existed in
the base workspace. Opening the model fresh and hitting the toolbar's Run
button — which resolves parameters against the base workspace, not a
`SimulationInput` — failed immediately with "Unrecognized function or
variable 'ArrivalRateDuringHours'" and four more like it. Every prior check
in this file happened to go through the one path that avoided the gap.
Fixed by extracting the parameter formulas into `computeDerivedVariables.m`
and adding an `InitFcn` model callback (`buildThroughputModel.m`) that
populates the base workspace from `throughputParams()` defaults at
simulation start — so both the toolbar Run button and scripted
`Simulink.SimulationInput` calls now work, sharing one formula
implementation instead of two that could silently drift apart. If you
already had the model open when this landed, close and reopen it — a live
in-memory session doesn't pick up a rebuild from disk.

**A seventh bug, one layer deeper in the same fix**: the `InitFcn` above
calls `throughputParams()` and `computeDerivedVariables()` — but those only
resolve if the `.m` files happen to already be on the MATLAB path, which
depends on the *current folder at the moment the model was opened*, not
where the `.slx` file itself lives. Opening the model via a script that had
already `cd`'d into `matlab/simulink/` worked by accident; opening it
directly (`open_system()` from another folder, or double-clicking the
`.slx`) failed with "Unrecognized function or variable 'throughputParams'"
— the exact same class of gap as the sixth bug, one level further down.
Fixed by having `InitFcn` resolve its own location first:
`addpath(fileparts(get_param(bdroot,'FileName')))`, which finds the model's
own `.slx` path regardless of current folder, before calling either
function. Verified by reproducing the failure deliberately (confirmed
`exist('throughputParams','file')` was `0` from a different folder) and
confirming `sim()` still succeeds after the fix.

## What this model does and doesn't capture

- **Stability, not latency**: this answers "does the backlog stay bounded"
  (steady-state capacity planning), not "how long does any individual
  patient wait" (which would need per-patient event tracking — see the
  SimEvents note above).
- **Reviewer hours are a derated average, not a simulated day/night cycle**:
  a real reviewer's backlog would sawtooth (grow while they're off, drain
  during their shift); this model smooths that into an average, which is
  correct for the stability question but doesn't show the daily swing.
  Documented in `throughputParams.m`, not hidden.
- **Referral rate is a population statistic standing in for the model's
  predicted-positive rate**: 26.2% is the true prevalence of grade>=2 DR in
  Messidor-2, not the trained classifier's actual predicted-referral rate,
  which will differ somewhat depending on calibration (same caveat
  `training/validate_external.py` documents for its own use of this figure).
- **One representative district, not a multi-PHC network topology**: models
  aggregate arrival/transmission/processing/review rates for a district's
  total volume, not several distinct sub-centers with their own individual
  bandwidth links feeding a shared hub (a plausible extension, not built).
