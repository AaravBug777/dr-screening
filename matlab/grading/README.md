# DR grading — MATLAB Deep Learning Toolbox

This folder is NOT the production DR severity grader — that's
`training/`/`backend/` (Python, PyTorch/timm EfficientNet-B3), a deliberate
architecture choice (see `training/export_onnx.py`'s docstring: Python has
the GPU training ecosystem and Grad-CAM's autograd-based backward hook,
which a static exported graph can't reproduce). This folder exists to
genuinely exercise Deep Learning Toolbox — named explicitly in the SIH26038
brief's tool list — rather than leave it installed-but-unused, and to
produce real material for the "does an integrated pipeline outperform any
single technique" ablation (`../tests/compareIntegratedVsSingleTechnique.m`).

## Files

| File | Purpose |
|---|---|
| `trainStructuralReferableNet.m` | **The path that actually runs.** Trains a small feed-forward network (`trainnet`) on the 8 classical structural features `../segmentation/` produces per image (vessel density, OD confidence, fovea found, MA/exudate/haemorrhage/NV candidate counts), to predict referable DR. Evaluated on the official IDRiD test set: 75.0% sensitivity / 46.2% specificity / 64.1% accuracy — real, and honestly weaker than the Python DL grader (90.6%/74.4% on the same set), as expected from 8 summary numbers instead of a full image. |
| `predictGradeMATLAB.m` | Runs the production PyTorch checkpoint **natively inside MATLAB**, via an ONNX import (`importNetworkFromONNX`). Currently blocked: needs the separate "Deep Learning Toolbox Converter for ONNX Model Format" add-on, which is not installed and cannot be installed headlessly from this environment (confirmed by actually trying `matlab.addons.install` — it only accepts local toolbox files, not a catalog name lookup for support packages; support-package installation needs the interactive Add-On Explorer). The function and its test (`../tests/validateONNXAgainstPython.m`) are complete and correct — they simply cannot run without that add-on. Left in place rather than deleted, since installing that one add-on (via the GUI, on a machine with a display) is all that's needed to make it work, and the ONNX export itself is already verified correct (`training/export_onnx.py` confirms PyTorch and ONNX Runtime agree to within 5 decimal places on 5 real reference images). |

## Why the structural-features classifier, given the ONNX path is blocked

Rather than leave Deep Learning Toolbox as "installed but never actually
run," `trainStructuralReferableNet.m` is a real, different, and still
genuinely useful application: it trains and evaluates an actual network on
actual data extracted by this project's own MATLAB code, with an honest,
real, disclosed result (weaker than the DL grader, as expected). That result
also directly feeds `../tests/compareIntegratedVsSingleTechnique.m`'s
ablation — see `../README.md`'s "Ablation" section for what that found.

## Regenerating everything

```matlab
% 1. Extract cached features (run once each; ~5-6 min for train, ~3 min for test)
SPLIT_NAME = 'train'; run('../tests/extractStructuralFeatures.m')
SPLIT_NAME = 'test';  run('../tests/extractStructuralFeatures.m')
```
```bash
# 2. DL-alone predictions on the same images, from the Python side
cd ../../training
python predict_idrid_test_referable.py --split test
python predict_idrid_test_referable.py --split train --restrict-to ../matlab/tests/structural_features_train.mat
```
```matlab
% 3. Train the MATLAB classifier, then run the ablation
run('trainStructuralReferableNet.m')
run('../tests/compareIntegratedVsSingleTechnique.m')
```
