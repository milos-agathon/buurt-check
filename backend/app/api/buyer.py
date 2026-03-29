"""Anonymous buyer cookie helpers for buyer-bound web purchases."""

from __future__ import annotations

from secrets import token_urlsafe

from fastapi import Request, Response

from app.config import settings

BUYER_COOKIE_NAME = "buurt_check_buyer"
BUYER_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365 * 2


def get_buyer_key(request: Request) -> str | None:
    """Return the existing anonymous buyer key, if present."""
    buyer_key = request.cookies.get(BUYER_COOKIE_NAME)
    if not buyer_key:
        return None
    return buyer_key


def _cookie_secure(request: Request) -> bool:
    return request.url.scheme == "https" or settings.base_url.startswith("https://")


def ensure_buyer_key(request: Request, response: Response) -> str:
    """Return an anonymous buyer key, minting and setting one when absent."""
    existing = get_buyer_key(request)
    if existing:
        return existing

    buyer_key = token_urlsafe(32)
    response.set_cookie(
        key=BUYER_COOKIE_NAME,
        value=buyer_key,
        max_age=BUYER_COOKIE_MAX_AGE_SECONDS,
        httponly=True,
        samesite="lax",
        secure=_cookie_secure(request),
        path="/",
    )
    return buyer_key
