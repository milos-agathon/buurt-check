"""Fail fast when production web Stripe checkout is not release-ready."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def _ensure_backend_root() -> None:
    if str(ROOT) not in sys.path:
        sys.path.insert(0, str(ROOT))


def _print_check(label: str, passed: bool, detail: str) -> None:
    status = "PASS" if passed else "FAIL"
    print(f"[{status}] {label}: {detail}")


def main() -> int:
    _ensure_backend_root()
    from app.config import settings
    from app.db import database_backend_label
    from app.services.billing_readiness import get_stripe_web_checkout_readiness

    readiness = get_stripe_web_checkout_readiness()

    _print_check(
        "Stripe secret key",
        readiness.has_secret_key,
        "configured" if readiness.has_secret_key else "BUURT_STRIPE_SECRET_KEY is empty",
    )
    _print_check(
        "Stripe webhook secret",
        readiness.has_webhook_secret,
        (
            "configured"
            if readiness.has_webhook_secret
            else "BUURT_STRIPE_WEBHOOK_SECRET is empty"
        ),
    )
    _print_check(
        "Public base URL",
        readiness.has_public_base_url,
        settings.base_url.strip() or "<empty>",
    )
    _print_check(
        "Persistent database",
        readiness.has_persistent_storage,
        database_backend_label(),
    )

    if readiness.release_ready:
        print("Web Stripe checkout release preflight passed.")
        return 0

    print(
        "Web Stripe checkout release preflight failed: "
        + ", ".join(readiness.reasons)
    )
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
