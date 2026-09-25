"""
Minimal, real session auth for Netra -- local prototype-grade (see
top-level README's App-hardening scope note): no external identity
provider, no account to sign up for anywhere, just operator accounts
stored in this app's own SQLite database (db.py) with properly-salted
password hashing and signed session cookies. This is a genuine security
improvement over the previous state (wide-open CORS, zero auth, anyone on
the network could hit /predict) without requiring any infrastructure this
local machine doesn't already have.

Password hashing: PBKDF2-HMAC-SHA256 via hashlib (stdlib) -- no bcrypt/
passlib dependency needed; 260,000 iterations matches Django's current
default, a reasonable modern floor.

Session tokens: "<operator_id>.<expiry>.<hmac-signature>", base64-encoded,
signed with NETRA_SECRET_KEY (env var; a random one is generated and
printed once on first startup if not set -- see main.py). Deliberately
NOT a JWT library dependency for something this simple -- a fixed 3-field
payload doesn't need general-purpose claims/algorithm negotiation, and a
hand-rolled minimal HMAC check is easier to audit than pulling in a JWT
library's much larger attack surface for one use.
"""
import base64
import hashlib
import hmac
import os
import secrets
import time

from fastapi import Cookie, HTTPException

import db

SESSION_COOKIE_NAME = "netra_session"
SESSION_TTL_SECONDS = 12 * 60 * 60  # 12h -- a PHC operator's shift, not a "stay logged in forever" token
PBKDF2_ITERATIONS = 260_000

_SECRET_KEY = None


def get_secret_key() -> bytes:
    global _SECRET_KEY
    if _SECRET_KEY is not None:
        return _SECRET_KEY

    env_key = os.environ.get("NETRA_SECRET_KEY")
    if env_key:
        _SECRET_KEY = env_key.encode("utf-8")
        return _SECRET_KEY

    # No key configured -- generate one and persist it to a local file so
    # sessions survive a server restart (regenerating the key on every
    # restart would silently log everyone out each time). Never printed to
    # logs; the file itself is the secret.
    key_path = os.path.join(os.path.dirname(__file__), ".secret_key")
    if os.path.exists(key_path):
        with open(key_path, "rb") as f:
            _SECRET_KEY = f.read()
    else:
        _SECRET_KEY = secrets.token_bytes(32)
        with open(key_path, "wb") as f:
            f.write(_SECRET_KEY)
        print(f"[auth] Generated a new session signing key at {key_path} "
              f"(set NETRA_SECRET_KEY to control this explicitly, e.g. for a multi-instance deployment).")
    return _SECRET_KEY


def hash_password(password: str, salt: str = None) -> tuple:
    if salt is None:
        salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), PBKDF2_ITERATIONS)
    return base64.b64encode(digest).decode("ascii"), salt


def verify_password(password: str, password_hash: str, salt: str) -> bool:
    candidate, _ = hash_password(password, salt)
    return hmac.compare_digest(candidate, password_hash)


def create_session_token(operator_id: int) -> str:
    expiry = int(time.time()) + SESSION_TTL_SECONDS
    payload = f"{operator_id}.{expiry}"
    sig = hmac.new(get_secret_key(), payload.encode("utf-8"), hashlib.sha256).hexdigest()
    token = f"{payload}.{sig}"
    return base64.urlsafe_b64encode(token.encode("utf-8")).decode("ascii")


def verify_session_token(token: str):
    """Returns operator_id (int) if valid and not expired, else None."""
    try:
        decoded = base64.urlsafe_b64decode(token.encode("ascii")).decode("utf-8")
        operator_id_str, expiry_str, sig = decoded.split(".")
        payload = f"{operator_id_str}.{expiry_str}"
        expected_sig = hmac.new(get_secret_key(), payload.encode("utf-8"), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(sig, expected_sig):
            return None
        if int(expiry_str) < time.time():
            return None
        return int(operator_id_str)
    except Exception:  # noqa: BLE001 -- any malformed/tampered token is just "not authenticated", not a 500
        return None


def require_operator(netra_session: str = Cookie(default=None)):
    """FastAPI dependency -- protects an endpoint, raises 401 if not
    logged in or the session is invalid/expired. Usage:
        @app.post("/predict")
        def predict(..., operator: dict = Depends(require_operator)):
    """
    if not netra_session:
        raise HTTPException(status_code=401, detail="Not logged in.")
    operator_id = verify_session_token(netra_session)
    if operator_id is None:
        raise HTTPException(status_code=401, detail="Session expired or invalid. Please log in again.")
    operator = db.get_operator_by_id(operator_id)
    if operator is None:
        raise HTTPException(status_code=401, detail="Operator account no longer exists.")
    operator.pop("password_hash", None)
    operator.pop("salt", None)
    return operator


def bootstrap_default_operator():
    """On first-ever startup (no operators exist yet), create one from
    env vars or a generated password -- printed once, since this is the
    only chance the operator has to see it before it's hashed away."""
    if db.count_operators() > 0:
        return
    username = os.environ.get("NETRA_ADMIN_USER", "admin")
    password = os.environ.get("NETRA_ADMIN_PASSWORD")
    generated = password is None
    if generated:
        password = secrets.token_urlsafe(12)
    password_hash, salt = hash_password(password)
    db.create_operator(username, password_hash, salt, role="ADMIN")
    if generated:
        print("=" * 70)
        print(f"[auth] Created default operator account -- SAVE THIS PASSWORD, it is not stored anywhere else:")
        print(f"[auth]   username: {username}")
        print(f"[auth]   password: {password}")
        print("[auth] Set NETRA_ADMIN_USER / NETRA_ADMIN_PASSWORD env vars to control this explicitly next time.")
        print("=" * 70)
    else:
        print(f"[auth] Created default operator account '{username}' from NETRA_ADMIN_PASSWORD env var.")
