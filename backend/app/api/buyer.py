"""Anonymous buyer cookie helpers for buyer-bound web purchases."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
from secrets import token_urlsafe
import time
from urllib.parse import urlsplit

from fastapi import Request, Response

from app.config import settings

BUYER_COOKIE_NAME = "buurt_check_buyer"
BUYER_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365 * 2
BUYER_RESUME_TOKEN_MAX_AGE_SECONDS = 60 * 60


def get_buyer_key(request: Request) -> str | None:
    """Return the existing anonymous buyer key, if present."""
    buyer_key = request.cookies.get(BUYER_COOKIE_NAME)
    if not buyer_key:
        return None
    return buyer_key


def _cookie_secure(request: Request) -> bool:
    return request.url.scheme == "https" or settings.base_url.startswith("https://")


def _cross_origin_request(request: Request) -> bool:
    origin = request.headers.get("origin", "").strip()
    if not origin:
        return False

    parsed_origin = urlsplit(origin)
    if parsed_origin.scheme not in {"http", "https"}:
        return True

    request_host = (request.headers.get("host") or request.url.netloc).strip()
    return parsed_origin.scheme != request.url.scheme or parsed_origin.netloc != request_host


def _cookie_samesite(request: Request) -> str:
    if _cross_origin_request(request) and _cookie_secure(request):
        return "none"
    return "lax"


def _set_buyer_cookie(response: Response, request: Request, buyer_key: str) -> None:
    response.set_cookie(
        key=BUYER_COOKIE_NAME,
        value=buyer_key,
        max_age=BUYER_COOKIE_MAX_AGE_SECONDS,
        httponly=True,
        samesite=_cookie_samesite(request),
        secure=_cookie_secure(request),
        path="/",
    )


def set_buyer_key(response: Response, request: Request, buyer_key: str) -> str:
    """Persist an existing anonymous buyer key on the response cookie."""
    _set_buyer_cookie(response, request, buyer_key)
    return buyer_key


def _buyer_resume_secret() -> bytes | None:
    for candidate in (settings.stripe_secret_key, settings.stripe_webhook_secret):
        normalized = candidate.strip()
        if normalized:
            return normalized.encode("utf-8")
    return None


def _urlsafe_b64encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def _urlsafe_b64decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(f"{value}{padding}")


def create_buyer_resume_token(report_id: str, buyer_key: str) -> str | None:
    """Create a short-lived signed token that can restore the buyer cookie on return."""
    secret = _buyer_resume_secret()
    if secret is None:
        return None

    payload = {
        "v": 1,
        "iat": int(time.time()),
        "report_id": report_id,
        "buyer_key": buyer_key,
    }
    payload_bytes = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    payload_b64 = _urlsafe_b64encode(payload_bytes)
    signature = _urlsafe_b64encode(
        hmac.new(secret, payload_b64.encode("ascii"), hashlib.sha256).digest()
    )
    return f"{payload_b64}.{signature}"


def verify_buyer_resume_token(
    token: str,
    *,
    expected_report_id: str,
) -> str | None:
    """Return the embedded buyer key when a buyer resume token is valid."""
    secret = _buyer_resume_secret()
    if secret is None or "." not in token:
        return None

    payload_b64, signature = token.split(".", 1)
    expected_signature = _urlsafe_b64encode(
        hmac.new(secret, payload_b64.encode("ascii"), hashlib.sha256).digest()
    )
    if not hmac.compare_digest(signature, expected_signature):
        return None

    try:
        payload = json.loads(_urlsafe_b64decode(payload_b64))
    except (ValueError, TypeError, json.JSONDecodeError):
        return None

    if payload.get("v") != 1:
        return None

    issued_at = payload.get("iat")
    if not isinstance(issued_at, int):
        return None

    now = int(time.time())
    if issued_at > now + 300:
        return None
    if now - issued_at > BUYER_RESUME_TOKEN_MAX_AGE_SECONDS:
        return None

    if payload.get("report_id") != expected_report_id:
        return None

    buyer_key = payload.get("buyer_key")
    if not isinstance(buyer_key, str) or not buyer_key:
        return None
    return buyer_key


def ensure_buyer_key(request: Request, response: Response) -> str:
    """Return an anonymous buyer key, minting and setting one when absent."""
    existing = get_buyer_key(request)
    if existing:
        return existing

    buyer_key = token_urlsafe(32)
    _set_buyer_cookie(response, request, buyer_key)
    return buyer_key
