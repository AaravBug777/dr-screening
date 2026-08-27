"""
SQLite persistence for Netra -- local prototype-grade, not a production
database server (see top-level README's App-hardening scope note: this
runs on the same machine as the backend, no separate DB host/account
needed). Two tables:

  operators   -- who can log in (see auth.py)
  predictions -- one row per /predict call, an audit trail + history the
                 app previously had none of (every prediction used to
                 vanish the moment the response was sent)

Uses the stdlib sqlite3 module deliberately -- no new dependency, no
server process to run, and SQLite's single-writer model is completely
adequate at this scale (a district PHC's screening volume, not a
multi-datacenter service).
"""
import json
import os
import sqlite3
import time
from contextlib import contextmanager

DB_PATH = os.path.join(os.path.dirname(__file__), "netra.db")

_SCHEMA = """
CREATE TABLE IF NOT EXISTS operators (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    created_at REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS predictions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    operator_id INTEGER REFERENCES operators(id) ON DELETE SET NULL,
    created_at REAL NOT NULL,
    source_filename TEXT,
    gradable INTEGER NOT NULL,
    quality_verdict TEXT,
    predicted_label TEXT,
    predicted_class INTEGER,
    referable INTEGER,
    referable_probability REAL,
    response_json TEXT NOT NULL,
    review_duration_seconds REAL
);

CREATE INDEX IF NOT EXISTS idx_predictions_operator ON predictions(operator_id);
CREATE INDEX IF NOT EXISTS idx_predictions_created ON predictions(created_at DESC);
"""


@contextmanager
def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db():
    with get_conn() as conn:
        conn.executescript(_SCHEMA)
        _migrate(conn)


def _migrate(conn):
    """Lightweight additive migration for existing databases created before
    a column existed (CREATE TABLE IF NOT EXISTS above only handles a
    brand-new DB, not one that predates a schema change -- e.g. this
    project's own local netra.db). Checked via PRAGMA table_info rather
    than a version table: simple, and adequate for the handful of additive
    columns this local-prototype-grade DB has ever needed."""
    existing_cols = {row["name"] for row in conn.execute("PRAGMA table_info(predictions)").fetchall()}
    if "review_duration_seconds" not in existing_cols:
        conn.execute("ALTER TABLE predictions ADD COLUMN review_duration_seconds REAL")


def create_operator(username: str, password_hash: str, salt: str) -> int:
    with get_conn() as conn:
        cur = conn.execute(
            "INSERT INTO operators (username, password_hash, salt, created_at) VALUES (?, ?, ?, ?)",
            (username, password_hash, salt, time.time()),
        )
        return cur.lastrowid


def get_operator_by_username(username: str):
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM operators WHERE username = ?", (username,)).fetchone()
        return dict(row) if row else None


def get_operator_by_id(operator_id: int):
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM operators WHERE id = ?", (operator_id,)).fetchone()
        return dict(row) if row else None


def count_operators() -> int:
    with get_conn() as conn:
        return conn.execute("SELECT COUNT(*) AS n FROM operators").fetchone()["n"]


def save_prediction(operator_id, source_filename, response: dict) -> int:
    """Stores the FULL /predict response as JSON (images included, base64)
    so a history entry can be re-viewed or re-reported identically to how
    it looked at the time -- plus a handful of columns pulled out for
    fast filtering/listing without parsing JSON per row."""
    with get_conn() as conn:
        cur = conn.execute(
            """INSERT INTO predictions
               (operator_id, created_at, source_filename, gradable, quality_verdict,
                predicted_label, predicted_class, referable, referable_probability, response_json)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                operator_id,
                time.time(),
                source_filename,
                1 if response.get("gradable") else 0,
                (response.get("quality") or {}).get("verdict"),
                response.get("predicted_label"),
                response.get("predicted_class"),
                1 if response.get("referable") else 0 if response.get("gradable") else None,
                response.get("referable_probability"),
                json.dumps(response),
            ),
        )
        return cur.lastrowid


def record_review_duration(prediction_id: int, duration_seconds: float) -> bool:
    """Records how long an operator actually spent on ONE result before
    moving on -- real measured data for the SIH brief's "ophthalmologist
    validation in under 30 seconds" claim, which until now only existed as
    an unmeasured assumption fed into the Simulink model
    (matlab/simulink/throughputParams.m's ReviewTimeSeconds). This doesn't
    make every measurement a clinician's (see main.py's endpoint docstring
    for what the frontend actually times), but it means the number is now
    genuinely MEASURED as real usage accumulates, not just asserted.
    Clamped to a sane range (0.5s-3600s) -- a tab left open overnight
    shouldn't corrupt the real distribution with a multi-hour outlier, and
    a sub-500ms value is almost certainly a double-fire, not a real review.
    Returns False (no-op) for an unknown prediction_id or an out-of-range
    duration, True if it was recorded."""
    if duration_seconds is None or not (0.5 <= duration_seconds <= 3600):
        return False
    with get_conn() as conn:
        cur = conn.execute(
            "UPDATE predictions SET review_duration_seconds = ? WHERE id = ?",
            (duration_seconds, prediction_id),
        )
        return cur.rowcount > 0


def _history_filter_clause(operator_id=None, date_from=None, date_to=None,
                            grades=None, referable_only=False, rejected_only=False):
    """Shared WHERE-clause builder for list_predictions/count_predictions --
    one place for the filter set so the History view's displayed rows and
    its 'N results' count (and the CSV export) can never quietly drift
    apart from each other.

    grades: list of exact predicted_label values (IN (...), not a single
    equality -- multi-select in the UI). rejected_only: gradable=0 rows
    only; deliberately exclusive with grades/referable_only in practice
    (a rejected row has no predicted_label/referable value) -- the
    frontend keeps these mutually exclusive in its own UI state, but this
    function doesn't assume that and will just correctly return zero rows
    if both are somehow set at once, rather than silently ignoring one."""
    clause = " WHERE 1=1"
    params = []
    if operator_id is not None:
        clause += " AND operator_id = ?"
        params.append(operator_id)
    if date_from is not None:
        clause += " AND created_at >= ?"
        params.append(date_from)
    if date_to is not None:
        clause += " AND created_at <= ?"
        params.append(date_to)
    if rejected_only:
        clause += " AND gradable = 0"
    if grades:
        clause += f" AND predicted_label IN ({','.join('?' * len(grades))})"
        params.extend(grades)
    if referable_only:
        clause += " AND referable = 1"
    return clause, params


def list_predictions(operator_id=None, limit=50, offset=0, date_from=None, date_to=None,
                      grades=None, referable_only=False, rejected_only=False):
    """operator_id=None lists across all operators (an admin/shared-clinic
    view) -- deliberately not per-operator-isolated by default, since a
    PHC's screening history is a shared clinical record, not private data
    between staff at the same site. Backs both the paginated History view
    and the (offset=0, large limit) CSV export -- one query path for both."""
    clause, params = _history_filter_clause(operator_id, date_from, date_to, grades, referable_only, rejected_only)
    query = f"""SELECT id, operator_id, created_at, source_filename, gradable, quality_verdict,
                       predicted_label, predicted_class, referable, referable_probability
                FROM predictions{clause} ORDER BY created_at DESC LIMIT ? OFFSET ?"""
    params = params + [limit, offset]
    with get_conn() as conn:
        rows = conn.execute(query, params).fetchall()
        return [dict(r) for r in rows]


def get_prediction(prediction_id: int):
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM predictions WHERE id = ?", (prediction_id,)).fetchone()
        if row is None:
            return None
        d = dict(row)
        d["response"] = json.loads(d.pop("response_json"))
        return d


def count_predictions(operator_id=None, date_from=None, date_to=None, grades=None,
                       referable_only=False, rejected_only=False) -> int:
    """Same filter set as list_predictions -- so the History view's 'N
    results' / pagination math matches what's actually being listed,
    not the unfiltered total."""
    clause, params = _history_filter_clause(operator_id, date_from, date_to, grades, referable_only, rejected_only)
    query = f"SELECT COUNT(*) AS n FROM predictions{clause}"
    with get_conn() as conn:
        return conn.execute(query, params).fetchone()["n"]


def compute_stats():
    """Real operational numbers from this app's own actual usage --
    grade distribution, referral rate, reject rate, screenings/day -- the
    counterpart to matlab/simulink/throughputParams.m's SIMULATED
    assumptions (ReferralRate=0.400 etc.). Neither replaces the other:
    Simulink answers "what capacity would we need for 100,000/year at
    THIS referral rate"; this answers "what is the referral rate actually
    turning out to be, on the images this app has actually graded". See
    /stats in main.py, which pairs this with the documented Simulink
    constants for a side-by-side comparison.
    """
    with get_conn() as conn:
        total = conn.execute("SELECT COUNT(*) AS n FROM predictions").fetchone()["n"]
        if total == 0:
            return {
                "total": 0, "gradable": 0, "rejected": 0, "reject_rate": None,
                "referable": 0, "referable_rate": None, "grade_distribution": {},
                "reject_reasons": {}, "screenings_by_day": [],
                "first_screening_at": None, "last_screening_at": None,
                "review_time": {"n": 0, "median_seconds": None, "p90_seconds": None},
            }

        gradable = conn.execute("SELECT COUNT(*) AS n FROM predictions WHERE gradable = 1").fetchone()["n"]
        rejected = total - gradable

        referable = conn.execute("SELECT COUNT(*) AS n FROM predictions WHERE referable = 1").fetchone()["n"]

        grade_rows = conn.execute(
            "SELECT predicted_label, COUNT(*) AS n FROM predictions WHERE gradable = 1 GROUP BY predicted_label"
        ).fetchall()
        grade_distribution = {r["predicted_label"]: r["n"] for r in grade_rows}

        # The actual per-image reason CODES (too_dark, low_source_resolution,
        # etc.) aren't a queryable column -- quality_verdict is always just
        # the literal string "reject" for every rejected row, telling you
        # NOTHING about why. The real reasons live inside response_json's
        # quality.reasons list (an image can have more than one, e.g.
        # ['too_dark', 'soft_focus']), so this parses that JSON for the
        # rejected subset specifically -- cheap at this scale (a rejected
        # count in the tens/hundreds, not the whole table), and gives an
        # actually actionable breakdown instead of one useless bucket.
        reject_json_rows = conn.execute(
            "SELECT response_json FROM predictions WHERE gradable = 0"
        ).fetchall()
        reject_reasons = {}
        for row in reject_json_rows:
            resp = json.loads(row["response_json"])
            for reason in (resp.get("quality") or {}).get("reasons") or []:
                reject_reasons[reason] = reject_reasons.get(reason, 0) + 1

        day_rows = conn.execute(
            """SELECT date(created_at, 'unixepoch', 'localtime') AS day, COUNT(*) AS n
               FROM predictions GROUP BY day ORDER BY day DESC LIMIT 14"""
        ).fetchall()
        screenings_by_day = [{"date": r["day"], "count": r["n"]} for r in reversed(day_rows)]

        bounds = conn.execute("SELECT MIN(created_at) AS first, MAX(created_at) AS last FROM predictions").fetchone()

        # Real, MEASURED operator review time -- see main.py's
        # /history/{id}/review-complete endpoint docstring for exactly what
        # this does and doesn't prove (real timing instrumentation, not a
        # clinical validation study). Counterpart to
        # matlab/simulink/throughputParams.m's ReviewTimeSeconds=30
        # ASSUMPTION -- n=0 until the app has actually been used through a
        # full review cycle, reported honestly as null rather than
        # defaulting to the assumed 30s and pretending it's measured.
        durations = [r["review_duration_seconds"] for r in conn.execute(
            "SELECT review_duration_seconds FROM predictions WHERE review_duration_seconds IS NOT NULL"
        ).fetchall()]
        review_time = {"n": len(durations), "median_seconds": None, "p90_seconds": None}
        if durations:
            durations.sort()
            review_time["median_seconds"] = durations[len(durations) // 2]
            review_time["p90_seconds"] = durations[min(len(durations) - 1, int(len(durations) * 0.9))]

        return {
            "total": total,
            "gradable": gradable,
            "rejected": rejected,
            "reject_rate": rejected / total,
            "referable": referable,
            "referable_rate": (referable / gradable) if gradable else None,
            "grade_distribution": grade_distribution,
            "reject_reasons": reject_reasons,
            "screenings_by_day": screenings_by_day,
            "first_screening_at": bounds["first"],
            "last_screening_at": bounds["last"],
            "review_time": review_time,
        }


