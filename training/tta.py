"""
Test-time augmentation (TTA) for the DR grading model.

Averages predictions over the dihedral-4 symmetry group applied to the
already-preprocessed input tensor (identity, horizontal flip, vertical
flip, rotate 90/180/270) -- deliberately the SAME transform family the
model was actually trained to be invariant to (dataset.py's
get_transforms(train=True) uses A.HorizontalFlip, A.VerticalFlip,
A.RandomRotate90), not an arbitrary augmentation set. A fundus photograph
has no canonical "up" the way a photo of text or a face does, so all 6
views are equally valid semantically -- this is a case where the standard
"TTA should mirror train-time augmentation" heuristic applies unusually
cleanly.

Two-pass design, not one:
  Pass 1 (cheap, no_grad, forward only): run all 6 views, average their
  temperature-scaled probabilities, decide the final predicted class from
  THAT average.
  Pass 2 (one Grad-CAM forward+backward per view, all targeting the SAME
  decided class): each view's CAM is computed for the same class, then
  inverse-transformed back to the canonical (identity) orientation before
  averaging -- averaging CAMs computed against different classes (which
  would happen if each view were allowed to explain its own possibly-
  different argmax) wouldn't be meaningful.

This also produces a strictly better-behaved Grad-CAM as a side effect
(the average of 6 independently-computed heatmaps is smoother/less noisy
than a single one), not just a probability improvement.

Validated on a real external stratified sample (see
tests/validate_tta.py's output, recorded in this project's README) before
being wired in as the default -- not assumed to help just because it's a
standard technique.
"""
import numpy as np
import torch
import torch.nn.functional as F


def _build_views():
    """Returns a list of (forward_transform, inverse_transform) pairs.
    forward_transform operates on a (1,3,H,W) torch tensor.
    inverse_transform operates on a (H,W) numpy array (a Grad-CAM map)."""
    return [
        (lambda x: x, lambda a: a),  # identity
        (lambda x: torch.flip(x, dims=[3]), lambda a: np.flip(a, axis=1)),  # horizontal flip
        (lambda x: torch.flip(x, dims=[2]), lambda a: np.flip(a, axis=0)),  # vertical flip
        (lambda x: torch.rot90(x, 1, dims=[2, 3]), lambda a: np.rot90(a, -1)),  # rotate 90
        (lambda x: torch.rot90(x, 2, dims=[2, 3]), lambda a: np.rot90(a, -2)),  # rotate 180
        (lambda x: torch.rot90(x, 3, dims=[2, 3]), lambda a: np.rot90(a, -3)),  # rotate 270
    ]


def generate_tta(cam_tool, image_tensor, temperature=1.0):
    """
    cam_tool: a GradCAM instance (see gradcam.py) wrapping the trained model.
    image_tensor: preprocessed tensor, shape (1, 3, H, W), on the model's device.
    temperature: same calibration temperature GradCAM.generate() accepts.

    Returns: (cam, predicted_class, probs) -- same shape/contract as
    GradCAM.generate(), so this is a drop-in replacement at call sites.
    """
    views = _build_views()
    model = cam_tool.model

    # --- Pass 1: decide the class from TTA-averaged probabilities ---
    all_probs = []
    with torch.no_grad():
        for forward_fn, _ in views:
            view_tensor = forward_fn(image_tensor)
            logits = model(view_tensor)
            probs = F.softmax(logits / temperature, dim=1).cpu().numpy()[0]
            all_probs.append(probs)
    avg_probs = np.mean(all_probs, axis=0)
    class_idx = int(np.argmax(avg_probs))

    # --- Pass 2: Grad-CAM per view for that SAME class, un-transformed
    # back to canonical orientation, averaged ---
    cams = []
    for forward_fn, inverse_fn in views:
        view_tensor = forward_fn(image_tensor)
        cam, _, _ = cam_tool.generate(view_tensor, class_idx=class_idx, temperature=temperature)
        cams.append(inverse_fn(cam))
    avg_cam = np.mean(cams, axis=0).astype(np.float32)
    # Re-normalize to [0,1] -- averaging several already-normalized [0,1]
    # maps can leave the max below 1, which would visually mute the
    # heatmap for no real reason.
    if avg_cam.max() > 0:
        avg_cam = avg_cam / avg_cam.max()

    return avg_cam, class_idx, avg_probs
