"""
Exports the trained EfficientNet-B3 checkpoint to ONNX, so it can also be
run natively inside MATLAB via Deep Learning Toolbox's importNetworkFromONNX
(matlab/grading/predictGradeMATLAB.m) -- closing a real gap against the
SIH26038 brief's tool list, which names Deep Learning Toolbox explicitly.

This does NOT change the production path: the live backend (backend/main.py)
keeps using the PyTorch checkpoint directly via gradcam.py -- Python/PyTorch/
timm/albumentations is a materially better fit for training and the live
API (GPU support, the full augmentation/training ecosystem, Grad-CAM's
autograd-based backward hook, which ONNX's static graph can't reproduce).
The ONNX/MATLAB path exists to DEMONSTRATE the toolbox and give a genuine,
verified MATLAB-native inference option -- not to replace the trained-model
serving path.

Usage:
    python export_onnx.py
Produces:
    outputs/best_model.onnx
    outputs/onnx_reference_predictions.json  -- fixed predictions on a
        handful of real images, from BOTH PyTorch and ONNX Runtime, for
        matlab/tests/validateONNXAgainstPython.m to check the MATLAB-side
        import against without needing Python running at MATLAB test time.
"""
import json
import os

import cv2
cv2.setNumThreads(0)
cv2.ocl.setUseOpenCL(False)

import numpy as np
import torch

import config
from dataset import ben_graham_preprocess, get_transforms
from gradcam import load_trained_model

ONNX_PATH = os.path.join(config.OUTPUT_DIR, "best_model.onnx")
REFERENCE_PATH = os.path.join(config.OUTPUT_DIR, "onnx_reference_predictions.json")

# A handful of real, already-downloaded images spanning different grades --
# not a training/validation set, just fixed fixtures for the MATLAB-side
# cross-check to compare against. Paths are relative to this file's parent
# (dr-screening/), matching how matlab/tests/*.m scripts already reference
# these datasets.
REFERENCE_IMAGES = [
    os.path.join("data", "idrid", "B. Disease Grading", "1. Original Images", "a. Training Set", "IDRiD_001.jpg"),
    os.path.join("data", "idrid", "B. Disease Grading", "1. Original Images", "a. Training Set", "IDRiD_003.jpg"),
    os.path.join("data", "idrid", "B. Disease Grading", "1. Original Images", "a. Training Set", "IDRiD_010.jpg"),
    os.path.join("data", "idrid", "B. Disease Grading", "1. Original Images", "a. Training Set", "IDRiD_016.jpg"),
    os.path.join("data", "idrid", "B. Disease Grading", "1. Original Images", "a. Training Set", "IDRiD_025.jpg"),
]


def preprocess_for_model(image_path):
    img = cv2.imread(image_path)
    img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    processed = ben_graham_preprocess(img)
    transform = get_transforms(train=False)
    tensor = transform(image=processed)["image"].unsqueeze(0)
    # Also return the resized-but-not-yet-normalized RGB uint8 image (what
    # A.Resize produces right before A.Normalize/ToTensorV2) -- saved to
    # disk so the MATLAB-side check loads these EXACT pixels instead of
    # reimplementing Ben Graham preprocessing + cv2's resize a second time
    # in MATLAB. That second reimplementation is a separate, harder
    # cross-library bit-exactness problem (cv2's INTER_AREA vs MATLAB's
    # imresize) that isn't actually what this export is trying to prove --
    # the point here is "can Deep Learning Toolbox correctly import and run
    # OUR TRAINED NETWORK", not "can MATLAB reproduce cv2's resize kernel
    # bit-for-bit". Isolating that lets the comparison test actually test
    # the thing it claims to test.
    resized_uint8 = cv2.resize(processed, (config.IMG_SIZE, config.IMG_SIZE), interpolation=cv2.INTER_LINEAR)
    return tensor, resized_uint8


def main():
    device = "cpu"  # export on CPU for a deterministic, portable graph
    model = load_trained_model(config.CHECKPOINT_PATH, device)
    model.eval()

    dummy = torch.randn(1, 3, config.IMG_SIZE, config.IMG_SIZE, device=device)

    os.makedirs(config.OUTPUT_DIR, exist_ok=True)
    torch.onnx.export(
        model,
        dummy,
        ONNX_PATH,
        input_names=["input"],
        output_names=["logits"],
        opset_version=17,
        dynamo=False,  # legacy TorchScript-based exporter -- more mature op coverage for timm's EfficientNet (SiLU, SE blocks) than the newer dynamo exporter as of torch 2.5
    )
    print(f"Exported ONNX model to {ONNX_PATH}")

    # --- Verify: PyTorch vs ONNX Runtime must agree, on random input first ---
    import onnxruntime as ort

    sess = ort.InferenceSession(ONNX_PATH, providers=["CPUExecutionProvider"])
    with torch.no_grad():
        torch_out = model(dummy).numpy()
    onnx_out = sess.run(None, {"input": dummy.numpy()})[0]
    max_abs_diff = float(np.max(np.abs(torch_out - onnx_out)))
    print(f"Random-input sanity check: max |PyTorch - ONNX Runtime| logit diff = {max_abs_diff:.6f}")
    if max_abs_diff > 1e-3:
        raise RuntimeError(
            f"ONNX export diverges from PyTorch by {max_abs_diff:.6f} on random input -- "
            "do not trust this export, investigate before using it anywhere."
        )

    # --- Reference predictions on real images, for the MATLAB-side check ---
    fixtures_dir = os.path.join(config.OUTPUT_DIR, "onnx_reference_fixtures")
    os.makedirs(fixtures_dir, exist_ok=True)

    references = []
    for rel_path in REFERENCE_IMAGES:
        abs_path = os.path.join(os.path.dirname(__file__), rel_path)
        if not os.path.isfile(abs_path):
            print(f"  (skipping missing reference image: {rel_path})")
            continue
        tensor, resized_uint8 = preprocess_for_model(abs_path)
        with torch.no_grad():
            torch_logits = model(tensor).numpy()
        onnx_logits = sess.run(None, {"input": tensor.numpy()})[0]

        diff = float(np.max(np.abs(torch_logits - onnx_logits)))
        torch_probs = torch.softmax(torch.from_numpy(torch_logits), dim=1).numpy()[0]
        pred_class = int(np.argmax(torch_probs))

        fixture_name = os.path.splitext(os.path.basename(rel_path))[0] + "_preprocessed.png"
        fixture_path = os.path.join(fixtures_dir, fixture_name)
        cv2.imwrite(fixture_path, cv2.cvtColor(resized_uint8, cv2.COLOR_RGB2BGR))

        references.append({
            "image": rel_path.replace("\\", "/"),
            "fixture_image": os.path.relpath(fixture_path, config.OUTPUT_DIR).replace("\\", "/"),
            "predicted_class": pred_class,
            "predicted_label": config.CLASS_NAMES[pred_class],
            "probabilities": [float(p) for p in torch_probs],
            "logits": [float(v) for v in torch_logits[0]],
            "pytorch_onnx_max_abs_diff": diff,
        })
        print(f"  {rel_path}: class={pred_class} ({config.CLASS_NAMES[pred_class]}), "
              f"top_prob={torch_probs[pred_class]:.4f}, pytorch/onnx diff={diff:.6f}")

    with open(REFERENCE_PATH, "w") as f:
        json.dump({
            "img_size": config.IMG_SIZE,
            "normalize_mean": [0.485, 0.456, 0.406],
            "normalize_std": [0.229, 0.224, 0.225],
            "class_names": config.CLASS_NAMES,
            "note": (
                "Reference predictions computed from BOTH the original PyTorch checkpoint and "
                "the exported ONNX model (they agreed to within the pytorch_onnx_max_abs_diff "
                "logit tolerance shown per-image). matlab/tests/validateONNXAgainstPython.m "
                "compares MATLAB's own ONNX-imported inference against these -- a three-way "
                "cross-check (PyTorch vs ONNX Runtime vs MATLAB Deep Learning Toolbox), not "
                "just a two-way one."
            ),
            "references": references,
        }, f, indent=2)
    print(f"\nWrote {len(references)} reference predictions to {REFERENCE_PATH}")


if __name__ == "__main__":
    main()
