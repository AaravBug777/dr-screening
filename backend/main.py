"""
FastAPI backend for the DR screening demo.

Endpoints:
    GET  /health          - sanity check (no auth -- a monitoring/uptime probe shouldn't need a session)
    POST /auth/login      - operator login, sets a signed session cookie
    POST /auth/logout     - clears the session cookie
    GET  /auth/me         - who's currently logged in (401 if nobody)
    POST /predict         - [auth required] upload a fundus image, get back prediction + Grad-CAM overlay; saved to history
    POST /report          - [auth required] given a /predict response body, render the automated annotated PDF report
    GET  /history          - [auth required] paginated list of past predictions (shared clinic record, not per-operator-isolated)
    GET  /history/{id}     - [auth required] full detail (the original response, replayable in the UI) of one past prediction

Run with:
    uvicorn main:app --reload --port 8000

Expects a trained checkpoint at ../training/outputs/best_model.pt (see training/README).

Auth/persistence added for local-prototype-grade hardening (see top-level
README's App section): SQLite (db.py) for history, signed-cookie sessions
(auth.py) for operator accounts -- both run entirely on this machine, no
external service/account needed. First startup with no operators yet
creates one automatically and prints its password ONCE -- see
auth.bootstrap_default_operator().
"""
import cv2
cv2.setNumThreads(0)
cv2.ocl.setUseOpenCL(False)  # Windows fix: avoid OpenCV/PyTorch DLL init order conflict

import base64
import csv
import io
import logging
import math
import os
import sys
import tempfile
from datetime import datetime

import numpy as np
import torch
from fastapi import Body, Depends, FastAPI, File, HTTPException, Query, Response as FastAPIResponse, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from starlette.concurrency import run_in_threadpool

logging.basicConfig(
    level=os.environ.get("NETRA_LOG_LEVEL", "INFO"),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("netra")

# Make the training/ package importable (config, dataset, gradcam live there)
TRAINING_DIR = os.path.join(os.path.dirname(__file__), "..", "training")
sys.path.insert(0, os.path.abspath(TRAINING_DIR))

import config as cfg  # noqa: E402
from dataset import ben_graham_preprocess, get_transforms  # noqa: E402
from gradcam import GradCAM, load_trained_model, overlay_heatmap  # noqa: E402
from tta import generate_tta, tta_probs  # noqa: E402
from dataset import ben_graham_fast  # noqa: E402

import matlab_bridge  # noqa: E402
from matlab_bridge import analyze_with_matlab  # noqa: E402
from structures_overlay import compose_structures_overlay  # noqa: E402
from report_generator import build_pdf_report  # noqa: E402
import auth  # noqa: E402
import db  # noqa: E402

app = FastAPI(title="DR Screening API")

# CORS_ORIGINS: explicit allowlist, not "*" -- required anyway once
# allow_credentials=True (session cookies), since browsers reject a
# wildcard origin combined with credentialed requests. Defaults cover the
# local Vite dev server on its usual ports; override via env var for
# anything else (e.g. a LAN IP a tablet in a PHC would actually hit).
_default_origins = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174"
CORS_ORIGINS = [o.strip() for o in os.environ.get("NETRA_CORS_ORIGINS", _default_origins).split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def security_headers(request, call_next):
    response = await call_next(request)
    # Baseline hardening headers -- cheap, real, and previously entirely
    # absent. Not a substitute for HTTPS/a real reverse proxy in an actual
    # deployment (see top-level README's App-hardening scope note), but a
    # genuine improvement at zero cost for this local-prototype-grade pass.
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    return response


@app.on_event("startup")
def on_startup():
    db.init_db()
    auth.bootstrap_default_operator()
    logger.info("Netra backend started. CORS origins: %s", CORS_ORIGINS)


DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
CHECKPOINT_PATH = os.path.join(TRAINING_DIR, "outputs", "best_model.pt")

_model = None
_cam_tool = None


def get_model_and_cam():
    """Lazy-load so the server starts even before a checkpoint exists (useful during dev)."""
    global _model, _cam_tool
    if _model is None:
        if not os.path.exists(CHECKPOINT_PATH):
            raise HTTPException(
                status_code=503,
                detail=(
                    "No trained model found. Run training/train.py first, or point "
                    "CHECKPOINT_PATH at an existing checkpoint."
                ),
            )
        _model = load_trained_model(CHECKPOINT_PATH, DEVICE)
        _cam_tool = GradCAM(_model)
    return _model, _cam_tool


_grade_members = None


def _eval_transform(dim):
    """Resize/normalize at THIS member's input resolution. dataset.get_transforms is
    hard-coded to cfg.IMG_SIZE (380), which would silently feed the 512px-trained
    member the wrong scale."""
    import albumentations as A
    from albumentations.pytorch import ToTensorV2
    return A.Compose([A.Resize(dim, dim),
                      A.Normalize(mean=(0.485, 0.456, 0.406), std=(0.229, 0.224, 0.225)),
                      ToTensorV2()])


def _preprocess_for(img_rgb, spec):
    """Each ensemble member sees the preprocessing IT was trained on. v2 predates the
    retrain and uses the historical ben_graham_preprocess (640px working dim); v3 was
    trained from the 1024px ben_graham_fast cache. Feeding either the other's pipeline
    is a domain shift, so the spec carries both dimensions explicitly."""
    if spec["preprocess_dim"] == 1024:
        return ben_graham_fast(img_rgb, spec["preprocess_dim"])
    return ben_graham_preprocess(img_rgb)


def get_grade_members():
    """Models whose TTA probabilities are averaged to produce the displayed grade
    (cfg.GRADE_ENSEMBLE). Any member whose checkpoint is absent is skipped; if none
    are present we fall back to the referral model, so the app always grades."""
    global _grade_members
    if _grade_members is None:
        members = []
        for spec in cfg.GRADE_ENSEMBLE:
            path = os.path.join(TRAINING_DIR, "outputs", spec["checkpoint"])
            if not os.path.exists(path):
                logger.warning("grade ensemble member missing, skipping: %s", path)
                continue
            m = load_trained_model(path, DEVICE)
            # Only the first member needs a GradCAM: it supplies the heatmap. Attaching
            # hooks to the others would save activations on every forward for nothing,
            # and their architectures need not even be CAM-friendly.
            members.append({**spec, "model": m, "transform": _eval_transform(spec["input_dim"]),
                            "cam": GradCAM(m) if not members else None})
        if not members:
            model, cam = get_model_and_cam()
            members = [{"model": model, "cam": cam, "temperature": cfg.TTA_REFERABLE_TEMPERATURE,
                        "preprocess_dim": 640, "input_dim": cfg.IMG_SIZE, "checkpoint": "best_model.pt",
                        "transform": _eval_transform(cfg.IMG_SIZE)}]
        logger.info("grade ensemble: %s", [m["checkpoint"] for m in members])
        _grade_members = members
    return _grade_members


def encode_image_to_base64(rgb_array: np.ndarray) -> str:
    bgr = cv2.cvtColor(rgb_array, cv2.COLOR_RGB2BGR)
    success, buffer = cv2.imencode(".png", bgr)
    if not success:
        raise RuntimeError("Failed to encode image")
    return base64.b64encode(buffer).decode("utf-8")


@app.get("/health")
def health():
    checkpoint_exists = os.path.exists(CHECKPOINT_PATH)
    try:
        import matlab.engine  # noqa: F401  -- import-only check, doesn't start an engine (that's ~4-5s, too slow for a health check)
        matlab_engine_installed = True
    except ImportError:
        matlab_engine_installed = False
    return {
        "status": "ok",
        "checkpoint_found": checkpoint_exists,
        "device": DEVICE,
        "matlab_engine_installed": matlab_engine_installed,
        # 'not_started' | 'alive' | 'dead' -- 'dead' means a previous
        # request's engine crashed and hasn't been asked to restart yet
        # (that happens lazily, on the next /predict, not here -- this
        # only PROBES an already-running engine, never starts one, so a
        # health check stays fast). See matlab_bridge.py's crash-recovery
        # docstring for why this state exists at all.
        "matlab_engine_status": matlab_bridge.engine_status() if matlab_engine_installed else "not_started",
    }


@app.post("/admin/release-matlab-engine")
def release_matlab_engine(operator: dict = Depends(auth.require_operator)):
    """Frees this backend's MATLAB/Simulink toolbox checkout WITHOUT
    restarting the backend itself -- for the one-seat-license conflict
    documented in matlab_bridge.py: a human needing to open the .slx model
    directly (in the MATLAB IDE, or Simulink) while the backend is running
    would otherwise contend for the same seat, which has crashed the
    engine outright before. Requires a logged-in operator session (same
    trust level as /predict) -- not exposed to an unauthenticated caller.
    The next /predict transparently starts a fresh engine; nothing else in
    the app needs to be restarted for this."""
    released = matlab_bridge.release_engine()
    logger.info("Operator '%s' released the MATLAB engine (was running: %s).", operator["username"], released)
    return {"released": released}


@app.post("/auth/login")
def login(response: FastAPIResponse, username: str = Body(...), password: str = Body(...)):
    operator = db.get_operator_by_username(username)
    if operator is None or not auth.verify_password(password, operator["password_hash"], operator["salt"]):
        # Deliberately the SAME error for "no such user" and "wrong password" --
        # distinguishing them lets an attacker enumerate valid usernames.
        raise HTTPException(status_code=401, detail="Incorrect username or password.")
    token = auth.create_session_token(operator["id"])
    response.set_cookie(
        key=auth.SESSION_COOKIE_NAME, value=token, httponly=True, samesite="lax",
        max_age=auth.SESSION_TTL_SECONDS, path="/",
    )
    logger.info("Operator '%s' logged in.", username)
    return {"username": operator["username"], "id": operator["id"], "role": operator["role"]}


@app.post("/auth/logout")
def logout(response: FastAPIResponse):
    response.delete_cookie(auth.SESSION_COOKIE_NAME, path="/")
    return {"ok": True}


@app.get("/auth/me")
def me(operator: dict = Depends(auth.require_operator)):
    return operator


@app.post("/predict")
async def predict(file: UploadFile = File(...), operator: dict = Depends(auth.require_operator)):
    if file.content_type not in ("image/png", "image/jpeg", "image/jpg"):
        raise HTTPException(status_code=400, detail="Please upload a PNG or JPEG image.")

    raw_bytes = await file.read()
    np_arr = np.frombuffer(raw_bytes, np.uint8)
    img_bgr = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
    if img_bgr is None:
        raise HTTPException(status_code=400, detail="Could not decode image.")
    img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)

    # --- Stage 1 (MATLAB): quality gate + vessel/OD/fovea/lesion segmentation ---
    # Runs before any Python grading, per the Stage-1 contract in
    # matlab/README.md -- a rejected image never reaches the model. The
    # MATLAB Engine API call is synchronous/blocking (no async equivalent),
    # so it's pushed to a thread pool to avoid stalling FastAPI's event loop
    # for other requests (health checks, concurrent uploads) while it runs.
    # Needs a real file on disk, not just bytes: MATLAB's imread reads by
    # path -- delete=False + manual cleanup because Windows won't let
    # another process (MATLAB) open a NamedTemporaryFile while it's still
    # held open here.
    # Graceful degradation: if the MATLAB Engine API isn't installed (see
    # requirements.txt) or the MATLAB call fails for any other reason, fall
    # back to the pre-integration behavior -- grade with Python alone,
    # quality=None, no segmentation. A missing/broken MATLAB install
    # shouldn't take down grading, which worked standalone before this was
    # added and has no real dependency on it.
    matlab_result = None
    ext = ".png" if file.content_type == "image/png" else ".jpg"
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=ext)
    try:
        tmp.write(raw_bytes)
        tmp.close()
        try:
            matlab_result = await run_in_threadpool(analyze_with_matlab, tmp.name)
        except Exception as exc:  # noqa: BLE001 -- deliberately broad: ANY MATLAB-side failure should degrade, not 500
            logger.warning("MATLAB quality/segmentation unavailable, grading without them: %s", exc)
    finally:
        os.unlink(tmp.name)

    quality_response = None
    enhanced_image_base64 = None
    if matlab_result is not None:
        quality = matlab_result["quality"]
        quality_response = {
            "verdict": quality["verdict"],
            "reasons": list(quality["reasons"]),
            "feedback": quality["feedback"],
            "enhanced_image_used": bool(quality["enhancedImageUsed"]),
        }

        # The CLAHE + illumination-normalization + denoising result
        # (enhanceFundusImage.m) was already being computed and USED
        # (silently, for segmentation/grading input) whenever quality was
        # borderline -- previously never returned for display, so the app
        # could only ever say "enhancement happened", not show it. Resized
        # to match the other toggle views (Grad-CAM/structures overlays)
        # for a consistent circular-viewport size.
        if quality["enhancedImageUsed"]:
            enhanced_arr = np.array(quality["enhancedImage"])
            enhanced_arr = cv2.resize(enhanced_arr, (cfg.IMG_SIZE, cfg.IMG_SIZE))
            enhanced_image_base64 = encode_image_to_base64(enhanced_arr)

        if quality["verdict"] == "reject":
            # Stage-1 contract: do not grade a rejected image. Nothing below
            # this point runs -- no model load, no segmentation result to show.
            rejected_response = {"gradable": False, "quality": quality_response}
            new_id = await run_in_threadpool(db.save_prediction, operator["id"], file.filename, rejected_response)
            rejected_response["prediction_id"] = new_id
            return JSONResponse(content=rejected_response)

    # --- Stage 2 (Python): DR severity grading + Grad-CAM ---
    model, cam_tool = get_model_and_cam()

    processed = ben_graham_preprocess(img_rgb)
    transform = get_transforms(train=False)
    tensor = transform(image=processed)["image"].unsqueeze(0).to(DEVICE)

    # Test-time augmentation: averages the prediction (and, separately, the
    # Grad-CAM heatmap) over the dihedral-4 symmetry group rather than a
    # single forward pass -- see tta.py's docstring and config.py's
    # TTA_REFERABLE_TEMPERATURE for the validated improvement (sensitivity
    # 90.77%->92.05%, kappa 0.8350->0.8442, on the identical held-out split)
    # that made this the live default. Costs ~6x a single view's inference
    # time; run_in_threadpool keeps that off the event loop the same way
    # the MATLAB call above is.
    # Hybrid + ensemble: the displayed grade and probabilities are the AVERAGE of the
    # grade-ensemble members' TTA probabilities; the Grad-CAM heatmap comes from the
    # first member but explains the ENSEMBLE's chosen class. The referable decision
    # below always comes from the original referral model, untouched.
    members = get_grade_members()

    def _grade():
        per_member, tensors = [], []
        for spec in members:
            proc = _preprocess_for(img_rgb, spec)
            t = spec["transform"](image=proc)["image"].unsqueeze(0).to(DEVICE)
            tensors.append(t)
            per_member.append(tta_probs(spec["model"], t, spec["temperature"]))
        probs = np.mean(per_member, axis=0)
        pred = int(np.argmax(probs))
        cam, _, _ = generate_tta(members[0]["cam"], tensors[0], members[0]["temperature"], class_idx=pred)
        return cam, pred, probs

    cam, pred_class, probs = await run_in_threadpool(_grade)
    referral_probs = await run_in_threadpool(tta_probs, model, tensor, cfg.TTA_REFERABLE_TEMPERATURE)

    display_img = cv2.resize(processed, (cfg.IMG_SIZE, cfg.IMG_SIZE))
    overlay = overlay_heatmap(display_img, cam)

    # Referable-DR decision: a SEPARATE binary decision from predicted_label
    # (which stays argmax -- "which single grade is most likely"), because
    # the referral decision has an asymmetric cost (missing a referable case
    # is far worse than an unnecessary review) argmax doesn't account for.
    # Compares combined probability mass on referable classes (grade >= 2)
    # against a tuned threshold instead. See config.py's
    # TTA_REFERABLE_THRESHOLD docstring for how it was tuned and validated.
    referable_probability = float(sum(referral_probs[2:]))
    is_referable = referable_probability > cfg.TTA_REFERABLE_THRESHOLD

    response = {
        "gradable": True,
        "quality": quality_response,
        "predicted_class": pred_class,
        "predicted_label": cfg.CLASS_NAMES[pred_class],
        "probabilities": [
            {"label": cfg.CLASS_NAMES[i], "probability": float(p)}
            for i, p in enumerate(probs)
        ],
        "recommendation": cfg.RECOMMENDATIONS[pred_class],
        "referable": is_referable,
        "referable_probability": referable_probability,
        "preprocessed_image_base64": encode_image_to_base64(display_img),
        "gradcam_overlay_base64": encode_image_to_base64(overlay),
    }
    if enhanced_image_base64 is not None:
        response["enhanced_image_base64"] = enhanced_image_base64

    # --- Segmentation overlay (MATLAB result composited in Python/OpenCV) ---
    seg = matlab_result["segmentation"] if matlab_result is not None else {"available": False}
    if seg["available"]:
        structures_overlay = compose_structures_overlay(display_img, matlab_result)
        response["structures_overlay_base64"] = encode_image_to_base64(structures_overlay)
        response["segmentation_summary"] = {
            "od_confidence": float(seg["odConfidence"]),
            "fovea_found": bool(seg["foveaFound"]),
            "microaneurysm_candidates": int(seg["maCount"]),
            "exudate_candidates": int(seg["exudateCount"]),
            # Soft exudates (cotton wool spots): a new detector, just built --
            # kept in its own namespace like nv_ below until it has real
            # validated numbers (see matlab/segmentation/README.md once
            # tuneSoftExudateParams.m reports them), not mixed into the
            # already-validated hard-exudate count above.
            "soft_exudate_candidates": int(seg["softExudateCount"]),
            "hemorrhage_candidates": int(seg["hemorrhageCount"]),
            "hemorrhage_dot_blot_candidates": int(seg["hemorrhageDotBlotCount"]),
            "hemorrhage_flame_candidates": int(seg["hemorrhageFlameCount"]),
            # Neovascularization: now validated against real pixel-level
            # ground truth (MAPLES-DR) -- and the honest result is weak
            # (zero pixel overlap on positive cases, see
            # matlab/segmentation/README.md's "Neovascularization" section
            # for the full numbers). Kept in its own nv_ namespace so the
            # frontend can visually flag it as lower-confidence rather than
            # mixing it into the validated candidate counts above.
            "nv_candidates": int(seg["nvCount"]),
            "nvd_candidates": int(seg["nvdCount"]),
            "nve_candidates": int(seg["nveCount"]),
        }

    new_id = await run_in_threadpool(db.save_prediction, operator["id"], file.filename, response)
    response["prediction_id"] = new_id
    return JSONResponse(content=response)


@app.post("/report")
async def report(payload: dict = Body(...), operator: dict = Depends(auth.require_operator)):
    """Renders the automated annotated PDF report (SIH26038 brief's
    Explainability Module requirement) from an already-computed /predict
    response body. Deliberately takes that JSON rather than an image file:
    the frontend already holds the full result (grade, probabilities,
    images, segmentation summary) in state right after a prediction, so this
    just re-renders it -- no re-inference, no MATLAB re-run, no risk of the
    report disagreeing with what's on screen because it was computed a
    second time from scratch.
    """
    result = payload.get("result", payload)  # accept either {"result": {...}} or the bare result dict
    filename = payload.get("source_filename")
    if not isinstance(result, dict) or "gradable" not in result:
        raise HTTPException(status_code=400, detail="Expected a /predict response body (missing 'gradable').")

    try:
        pdf_bytes = await run_in_threadpool(build_pdf_report, result, filename)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Report generation failed: {exc}") from exc

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="netra-dr-screening-report.pdf"'},
    )


@app.get("/history")
def history(
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
    mine_only: bool = Query(default=False),
    date_from: float = Query(default=None, description="Unix timestamp, inclusive"),
    date_to: float = Query(default=None, description="Unix timestamp, inclusive"),
    grades: list[str] = Query(default=None, description="Repeatable -- e.g. ?grades=Severe&grades=Proliferative+DR"),
    referable_only: bool = Query(default=False),
    rejected_only: bool = Query(default=False, description="gradable=0 rows only -- mutually exclusive with grades/referable_only in practice"),
    operator: dict = Depends(auth.require_operator),
):
    """Shared clinic record by default (mine_only=False) -- a PHC's
    screening history is a clinical record other staff at the same site
    legitimately need to see, not a private per-user log. Rows don't
    include the full response (images) -- GET /history/{id} for that,
    keeping the list view fast even with a long history."""
    op_filter = operator["id"] if mine_only else None
    filters = dict(operator_id=op_filter, date_from=date_from, date_to=date_to, grades=grades,
                    referable_only=referable_only, rejected_only=rejected_only)
    rows = db.list_predictions(limit=limit, offset=offset, **filters)
    total = db.count_predictions(**filters)
    return {"total": total, "limit": limit, "offset": offset, "results": rows}


@app.get("/history/export.csv")
def history_export_csv(
    mine_only: bool = Query(default=False),
    date_from: float = Query(default=None),
    date_to: float = Query(default=None),
    grades: list[str] = Query(default=None),
    referable_only: bool = Query(default=False),
    rejected_only: bool = Query(default=False),
    operator: dict = Depends(auth.require_operator),
):
    """A plain GET, not a POST+blob download -- a session cookie is
    SameSite=Lax, which browsers still send on a top-level GET navigation
    across ports (localhost:5173 -> localhost:8000), so a plain <a href>
    in the frontend works without any fetch/blob plumbing. Same filters as
    /history, capped at 5000 rows -- a CSV for review/reporting, not a
    full-database dump."""
    op_filter = operator["id"] if mine_only else None
    rows = db.list_predictions(
        operator_id=op_filter, date_from=date_from, date_to=date_to, grades=grades,
        referable_only=referable_only, rejected_only=rejected_only, limit=5000, offset=0,
    )

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["id", "created_at", "operator_id", "source_filename", "gradable",
                      "quality_verdict", "predicted_label", "referable", "referable_probability"])
    for r in rows:
        created = datetime.fromtimestamp(r["created_at"]).strftime("%Y-%m-%d %H:%M:%S") if r["created_at"] else ""
        writer.writerow([r["id"], created, r["operator_id"], r["source_filename"], r["gradable"],
                          r["quality_verdict"], r["predicted_label"], r["referable"], r["referable_probability"]])

    return Response(
        content=buf.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="netra-screening-history.csv"'},
    )


# Documented Simulink assumptions (matlab/simulink/throughputParams.m), for
# /stats to compare real observed numbers against -- kept here rather than
# re-parsed from the .m file, since these are simulation INPUTS a human
# chose (calibrated against real DL/threshold work, see that file's own
# extensive docstring), not something to derive automatically. Update this
# alongside throughputParams.m if that model's assumptions change again.
SIMULINK_ASSUMPTIONS = {
    "referral_rate": 0.400,
    "sustainable_annual_capacity": 876000,
    "target_annual_capacity": 100000,
    "review_time_seconds": 30,
    "num_reviewers": 1,
    "source": "matlab/simulink/throughputParams.m",
}


@app.get("/stats")
def stats(operator: dict = Depends(auth.require_operator)):
    """Real operational numbers from this app's own usage, paired with the
    Simulink model's SIMULATED assumptions for a side-by-side reality
    check -- see db.compute_stats()'s docstring for why this doesn't try
    to re-run the Simulink model live (MATLAB/Simulink concurrency is
    fragile enough already -- see matlab_bridge.py -- a per-request live
    simulation call would be a new, unnecessary way to hit that)."""
    real = db.compute_stats()
    return {"real": real, "simulink_assumptions": SIMULINK_ASSUMPTIONS}


@app.get("/capacity-live")
def capacity_live(refresh: bool = False, operator: dict = Depends(auth.require_operator)):
    """new-frontend's CapacityPanel calls this (services/backendApi.ts's
    fetchCapacityLive) -- it didn't exist until now, a real gap found while
    auditing that frontend against this backend. Deliberately does NOT
    re-run the Simulink model live for the same reason /stats doesn't (see
    that docstring): MATLAB/Simulink concurrency is fragile, and a
    per-request simulation call would be a new way to hit it. Instead this
    rescales throughputParams.m's own sustainable-capacity figure by the
    ratio of the REAL measured operator review time
    (db.compute_stats()'s review_time.median_seconds, from
    /history/{id}/review-complete) to the assumed review_time_seconds that
    figure was originally computed at -- capacity is inversely
    proportional to review time in that same model, so this is a real
    rescaling of a real number, not a fabricated one. `refresh` is
    accepted for API compatibility with the frontend's cache-busting call
    but has no effect: this is already computed fresh every request (cheap
    -- one aggregate query, no Simulink call).
    """
    real = db.compute_stats()
    review_time = real["review_time"]
    live = review_time["n"] > 0
    assumed_seconds = SIMULINK_ASSUMPTIONS["review_time_seconds"]
    effective_seconds = review_time["median_seconds"] if live else assumed_seconds

    sustainable = SIMULINK_ASSUMPTIONS["sustainable_annual_capacity"] * (assumed_seconds / effective_seconds)
    target = SIMULINK_ASSUMPTIONS["target_annual_capacity"]
    currently_stable = sustainable >= target
    backlog_growth_per_day = 0.0 if currently_stable else (target - sustainable) / 365.0

    reviewers_by_volume = [
        {"volume": v, "reviewers_needed": max(1, math.ceil(v / sustainable * SIMULINK_ASSUMPTIONS["num_reviewers"]))}
        for v in (target, target * 2, target * 5, target * 10)
    ]

    return {
        "live": live,
        "sustainable_annual_capacity": round(sustainable),
        # The Simulink model's established finding (matlab/simulink/
        # throughputParams.m): at brief-scale volumes, compute/bandwidth are
        # over-provisioned >100x and human review is the binding constraint --
        # not re-derived per request, since nothing in this app's real usage
        # data currently exercises the compute/bandwidth stages to check.
        "bottleneck_stage": "human_review",
        "target_annual_volume": target,
        "currently_stable": currently_stable,
        "review_backlog_growth_per_day": round(backlog_growth_per_day, 1),
        "reviewers_by_volume": reviewers_by_volume,
        "source": (
            f"matlab/simulink/throughputParams.m, rescaled by real measured review time "
            f"(n={review_time['n']}, median={review_time['median_seconds']}s)"
            if live else
            f"matlab/simulink/throughputParams.m assumption (review_time_seconds={assumed_seconds}) -- "
            f"not yet 'live': no review-complete timings recorded yet"
        ),
    }


@app.get("/history/{prediction_id}")
def history_detail(prediction_id: int, operator: dict = Depends(auth.require_operator)):
    row = db.get_prediction(prediction_id)
    if row is None:
        raise HTTPException(status_code=404, detail="No such prediction.")
    return row


@app.post("/history/{prediction_id}/review-complete")
def review_complete(prediction_id: int, duration_seconds: float = Body(..., embed=True),
                     operator: dict = Depends(auth.require_operator)):
    """Records how long an operator actually spent on ONE result before
    moving on -- turns the SIH brief's "ophthalmologist validation in
    under 30 seconds" claim from an unmeasured assumption (the Simulink
    model's ReviewTimeSeconds parameter, see SIMULINK_ASSUMPTIONS above)
    into something genuinely measured as the app gets used.

    Important honesty note, not hidden: DURATION_SECONDS is real elapsed
    wall-clock time from the frontend (result shown -> operator moved on),
    but the OPERATOR is whoever is logged in and using this app -- not
    necessarily, and in this project's demo/dev use not actually, a
    licensed ophthalmologist. This is real timing instrumentation, not a
    clinical review-time validation study; see top-level README's
    limitations section for that distinction. It's still a strict
    improvement over the previous state (a number nobody ever measured at
    all)."""
    recorded = db.record_review_duration(prediction_id, duration_seconds)
    if not recorded:
        raise HTTPException(status_code=404, detail="No such prediction, or duration out of the accepted range.")
    return {"recorded": True}
