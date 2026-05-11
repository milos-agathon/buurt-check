from __future__ import annotations

import hashlib
import hmac
import secrets

from app.config import settings


def new_share_token() -> tuple[str, str]:
    token = secrets.token_urlsafe(32)
    digest = hashlib.sha256(token.encode("utf-8")).hexdigest()
    return token, digest


def share_url(scope: str, token: str) -> str:
    route = "shared-pack" if scope == "pack" else "shared"
    return f"{settings.base_url.rstrip('/')}/#/{route}/{token}"


def keyed_email_hash(email: str) -> str | None:
    secret = settings.prebid_contact_hash_secret.strip()
    if not secret:
        return None
    normalized = email.strip().casefold()
    return hmac.new(secret.encode("utf-8"), normalized.encode("utf-8"), hashlib.sha256).hexdigest()
