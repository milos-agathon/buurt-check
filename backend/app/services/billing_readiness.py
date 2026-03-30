"""Shared readiness checks for web Stripe checkout."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal
from urllib.parse import urlsplit

from app.config import settings
from app.db import using_turso

LOCAL_BASE_URLS = frozenset(
    {
        "",
        "http://localhost",
        "http://localhost:5173",
        "http://127.0.0.1",
        "http://127.0.0.1:5173",
    }
)


def normalized_base_url(value: str) -> str:
    return value.strip().rstrip("/")


def has_public_base_url() -> bool:
    configured = normalized_base_url(settings.base_url)
    if not configured or configured in LOCAL_BASE_URLS:
        return False

    parsed = urlsplit(configured)
    return (
        parsed.scheme == "https"
        and bool(parsed.netloc)
        and parsed.hostname not in {"localhost", "127.0.0.1"}
    )


@dataclass(frozen=True)
class StripeWebCheckoutReadiness:
    provider: Literal["stripe"] = "stripe"
    has_secret_key: bool = False
    has_webhook_secret: bool = False
    has_public_base_url: bool = False
    has_persistent_storage: bool = False
    web_checkout_available: bool = False
    release_ready: bool = False
    reasons: tuple[str, ...] = ()


def get_stripe_web_checkout_readiness() -> StripeWebCheckoutReadiness:
    has_secret_key = bool(settings.stripe_secret_key.strip())
    has_webhook_secret = bool(settings.stripe_webhook_secret.strip())
    public_base_url = has_public_base_url()
    persistent_storage = using_turso()
    web_checkout_available = has_secret_key and has_webhook_secret
    release_ready = (
        web_checkout_available
        and public_base_url
        and persistent_storage
    )

    reasons: list[str] = []
    if not has_secret_key:
        reasons.append("missing_stripe_secret_key")
    if not has_webhook_secret:
        reasons.append("missing_stripe_webhook_secret")
    if not public_base_url:
        reasons.append("invalid_public_base_url")
    if not persistent_storage:
        reasons.append("non_persistent_database")

    return StripeWebCheckoutReadiness(
        has_secret_key=has_secret_key,
        has_webhook_secret=has_webhook_secret,
        has_public_base_url=public_base_url,
        has_persistent_storage=persistent_storage,
        web_checkout_available=web_checkout_available,
        release_ready=release_ready,
        reasons=tuple(reasons),
    )
