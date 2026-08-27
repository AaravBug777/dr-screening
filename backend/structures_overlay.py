"""
Compose the MATLAB segmentation results (matlab_bridge.analyze_with_matlab's
return value) into a single displayable overlay image, at the same
resolution main.py already uses for the Grad-CAM overlay (cfg.IMG_SIZE) --
so the frontend's existing circular viewport just gets a third image to
toggle to, no new sizing logic needed there.

Design note on lesion candidates: matlab/segmentation/README.md documents
these honestly -- pixel-level precision is weak (a real, measured ceiling
for the classical methods used, not a bug), and a single image commonly
has hundreds to low-thousands of candidate regions (a real observed count,
not a display bug -- see analyzeForApp.m's own timing/count test). Drawn as
individual markers, that many candidates would be visual noise. Drawn as a
translucent mask wash instead, the density itself reads as information
("this region has more candidate activity") without pretending each one is
a confirmed finding -- which is also why the frontend labels this view
"AI-flagged candidates for review", not "detected lesions".
"""
import cv2
import numpy as np


def _to_np(matlab_array):
    """MATLAB logical/double arrays come back from the engine as their own
    matlab.* types; np.array() converts them, verified empirically against
    a real call (see matlab_bridge.py's docstring)."""
    return np.array(matlab_array)


def _resize_mask(mask, target_size):
    """Nearest-neighbor resize for a boolean mask (no interpolation blur)."""
    resized = cv2.resize(
        mask.astype(np.uint8), (target_size, target_size), interpolation=cv2.INTER_NEAREST
    )
    return resized.astype(bool)


def _scale_point(point_xy, working_size, target_size):
    """working_size is [h, w] (MATLAB size() convention); point_xy is [x, y]."""
    h, w = working_size
    scale_x = target_size / w
    scale_y = target_size / h
    return point_xy[0] * scale_x, point_xy[1] * scale_y


def compose_structures_overlay(display_img_rgb: np.ndarray, matlab_result: dict) -> np.ndarray:
    """
    DISPLAY_IMG_RGB: the same (IMG_SIZE, IMG_SIZE, 3) uint8 RGB array main.py
    already computes for the Grad-CAM overlay.
    MATLAB_RESULT: the dict from matlab_bridge.analyze_with_matlab -- must
    have segmentation.available == True (caller's responsibility to check).

    Returns an (IMG_SIZE, IMG_SIZE, 3) uint8 RGB overlay: vessels (translucent
    cyan wash), optic disc (yellow ring), fovea (red cross, if found),
    lesion candidates (translucent washes: magenta=microaneurysms,
    orange=hard exudates, red-orange=haemorrhages), and neovascularization
    candidates (translucent violet wash -- see the caveat inline below;
    this layer's underlying detector has materially weaker validation than
    every other layer drawn here).
    """
    target_size = display_img_rgb.shape[0]
    seg = matlab_result["segmentation"]

    overlay = display_img_rgb.copy().astype(np.float32)

    working_size = [int(v) for v in _to_np(seg["workingSize"]).flatten()]
    vessel_mask = _resize_mask(_to_np(seg["vesselMask"]), target_size)

    # Vessel wash: cyan, low opacity.
    overlay[vessel_mask] = overlay[vessel_mask] * 0.6 + np.array([0, 220, 220]) * 0.4

    # Neovascularization candidates: violet wash, drawn at `workingSize`
    # resolution like the vessel mask (NOT lesionWorkingSize -- see
    # matlab/segmentation/detectNeovascularization.m). Deliberately the most
    # visually distinct color in this overlay (vessels/lesions all stay in
    # the cyan/magenta/amber/red-orange family) -- NV candidates carry the
    # weakest validation of anything drawn here (directional sanity check
    # only, no lesion-level ground truth exists to test against; see that
    # function's calibration caveat), so they should visually stand apart,
    # not blend in as if equally trustworthy.
    if "nvMask" in seg:
        nv_mask = _resize_mask(_to_np(seg["nvMask"]), target_size)
        if nv_mask.any():
            overlay[nv_mask] = overlay[nv_mask] * 0.5 + np.array([160, 60, 255]) * 0.5

    lesion_layers = [
        ("maMask", np.array([255, 0, 200])),      # microaneurysms: magenta
        ("exudateMask", np.array([255, 200, 0])),  # hard exudates: amber
        ("hemorrhageMask", np.array([255, 80, 0])),  # haemorrhages: red-orange
    ]
    lesion_working_size = [int(v) for v in _to_np(seg["lesionWorkingSize"]).flatten()]
    for key, color in lesion_layers:
        mask = _resize_mask(_to_np(seg[key]), target_size)
        if mask.any():
            overlay[mask] = overlay[mask] * 0.55 + color * 0.45

    overlay = np.clip(overlay, 0, 255).astype(np.uint8)

    # Optic disc: ring, scaled from workingSize to target_size.
    od_center = _to_np(seg["odCenter"]).flatten()
    od_radius = float(seg["odRadius"])
    cx, cy = _scale_point(od_center, working_size, target_size)
    scale = target_size / working_size[1]  # same scale used for x in _scale_point
    r = od_radius * scale
    cv2.circle(overlay, (int(round(cx)), int(round(cy))), int(round(r)), (255, 220, 0), 2)

    # Fovea: cross marker, if found.
    if seg.get("foveaFound"):
        fovea_center = _to_np(seg["foveaCenter"]).flatten()
        fx, fy = _scale_point(fovea_center, working_size, target_size)
        fx, fy = int(round(fx)), int(round(fy))
        s = 6
        cv2.line(overlay, (fx - s, fy), (fx + s, fy), (255, 0, 0), 2)
        cv2.line(overlay, (fx, fy - s), (fx, fy + s), (255, 0, 0), 2)

    return overlay
