"""
Bridge to the MATLAB quality-gate + segmentation pipeline (matlab/analyzeForApp.m),
via the MATLAB Engine API for Python.

Why this exists: the FastAPI backend and MATLAB are separate runtimes that
don't talk to each other automatically -- this is the piece that makes them
talk. Lazy-loaded, persistent engine (matching main.py's get_model_and_cam()
pattern for the PyTorch model): starting a MATLAB engine takes ~4-5s, so it
happens once, on first use, not per-request.

Requires the MATLAB Engine API for Python to be installed (see
matlab/README.md's "Python backend integration" section for how -- it's not
on PyPI in a way that matches every MATLAB release; it installs from
<matlabroot>/extern/engines/python).

Concurrency: a single shared matlab.engine instance is NOT documented as
safe to call from multiple threads at once, and this project's own license
only supports one concurrent Image Processing/Simulink toolbox checkout
(see matlab/README.md) -- so a multi-engine worker pool wouldn't even help
here, and FastAPI's run_in_threadpool sending overlapping calls into ONE
shared engine object is a real latent correctness risk under concurrent
uploads (silent corruption/errors from the engine, not just slowness),
not merely a performance question. _engine_lock below serializes access:
correct and simple, matching what the license allows anyway. It's an
RLock, not a plain Lock -- analyze_with_matlab holds it for the whole call
AND may re-enter get_engine() from inside that same hold during crash
recovery (see below); a plain Lock would deadlock a thread against itself
there.

Crash recovery: the MATLAB process backing this engine CAN die mid-session
-- confirmed the hard way this project (a concurrent Simulink run while
this engine was alive crashed MATLAB outright, not just timed out). Before
this module assumed the engine, once started, stayed alive forever; a dead
engine meant every subsequent request silently fell back to Python-only
grading (main.py's broad except already handles that) with no attempt to
recover -- easy to miss live, since the app still "works", just quietly
loses the quality gate and segmentation for the rest of the process
lifetime. analyze_with_matlab now detects a dead engine specifically (not
just any error) and restarts + retries ONCE before giving up.
"""
import os
import threading

MATLAB_DIR = os.path.join(os.path.dirname(__file__), "..", "matlab")

_engine = None
_engine_lock = threading.RLock()


def _start_engine():
    import matlab.engine  # deferred: importing this without MATLAB installed would break app startup entirely

    eng = matlab.engine.start_matlab()
    eng.cd(os.path.abspath(MATLAB_DIR), nargout=0)
    eng.eval("setupPaths;", nargout=0)
    return eng


def get_engine():
    """Lazy-start the MATLAB engine and set up its path once. Callers must
    hold _engine_lock while USING the returned engine, not just while
    starting it -- see analyze_with_matlab."""
    global _engine
    with _engine_lock:
        if _engine is None:
            _engine = _start_engine()
        return _engine


def _is_alive(eng) -> bool:
    """Cheap liveness probe -- a trivial eval with no real work, just to
    distinguish "the MATLAB process is gone" from "analyzeForApp raised a
    real error on this image" (a bug, a bad image, etc. -- those should
    propagate normally, not trigger a pointless restart+retry that will
    just fail the same way again)."""
    try:
        eng.eval("1;", nargout=0)
        return True
    except Exception:  # noqa: BLE001 -- any failure here means "not alive", full stop
        return False


def engine_status() -> str:
    """For /health -- reports state WITHOUT starting an engine just to
    check (that's the ~4-5s cost main.py's /health has always deliberately
    avoided). 'not_started' | 'alive' | 'dead'."""
    with _engine_lock:
        if _engine is None:
            return "not_started"
        return "alive" if _is_alive(_engine) else "dead"


def release_engine() -> bool:
    """Cleanly quits the shared engine and frees its MATLAB/Simulink
    toolbox checkout, without killing the backend process itself -- for
    when a human needs the one available license seat for something else
    (e.g. opening netraScreeningThroughput.slx directly in the IDE). The
    next /predict call transparently starts a fresh engine (same lazy-start
    path as a cold boot), same as if this had never been called; there's no
    persistent state lost by doing this. Returns False (a no-op) if no
    engine was running to release."""
    global _engine
    with _engine_lock:
        if _engine is None:
            return False
        try:
            _engine.quit()
        except Exception:  # noqa: BLE001 -- already dead/unreachable is fine, we're releasing it either way
            pass
        _engine = None
        return True


def analyze_with_matlab(image_path: str) -> dict:
    """
    Run matlab/analyzeForApp.m on IMAGE_PATH (a file on disk -- passing a
    path rather than marshaling the image array in is simpler and avoids
    color/format mismatches across the Python/MATLAB boundary for the INPUT
    side; outputs come back as MATLAB arrays, converted to numpy by callers
    that need them as images).

    Returns the MATLAB struct as a Python dict (the MATLAB Engine API
    converts scalar structs to dicts automatically -- verified empirically,
    not assumed):
        {
            "quality": {"verdict", "reasons", "feedback", "enhancedImageUsed", "enhancedImage"},
            "segmentation": {"available": False}  # if quality rejected
            # or, if available:
            "segmentation": {
                "available": True,
                "workingSize": [h, w],
                "vesselMask": matlab.logical (HxW),
                "odCenter": matlab.double [[x, y]], "odRadius", "odConfidence",
                "foveaFound", "foveaCenter": matlab.double [[x, y]],
                "lesionWorkingSize": [h, w],
                "maMask" / "exudateMask" / "hemorrhageMask": matlab.logical,
                "maCount" / "exudateCount" / "hemorrhageCount",
                "nvMask", "nvCount" / "nvdCount" / "nveCount",
            }
        }
    """
    global _engine
    # Held for the whole call, not just engine startup -- see the module
    # docstring's Concurrency note. This runs inside run_in_threadpool
    # (main.py), so blocking here blocks one worker thread, not the async
    # event loop -- other requests queue behind it rather than racing it.
    with _engine_lock:
        eng = get_engine()
        try:
            return eng.analyzeForApp(image_path, nargout=1)
        except Exception:  # noqa: BLE001 -- inspected below, not blindly swallowed
            if _is_alive(eng):
                raise  # a real error on this image/call -- not a dead engine, don't mask it with a pointless restart
            print(f"[matlab_bridge] MATLAB engine appears to have died -- restarting and retrying once for {image_path}")
            _engine = None
            eng = get_engine()
            return eng.analyzeForApp(image_path, nargout=1)
