"""Smoke test for the deployed web Stripe checkout flow."""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.config import settings
from app.services.billing_readiness import LOCAL_BASE_URLS, normalized_base_url


def _default_base_url() -> str:
    configured = normalized_base_url(settings.base_url)
    if configured and configured not in LOCAL_BASE_URLS:
        return configured
    return "https://app.buurt-check.nl"


def _fail(message: str) -> int:
    print(message, file=sys.stderr)
    return 1


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default=_default_base_url())
    parser.add_argument("--timeout-seconds", type=float, default=20.0)
    parser.add_argument("--vbo-id", default="0363010012345678")
    parser.add_argument(
        "--address-key",
        default=f"Checkout smoke test {int(time.time())}",
    )
    args = parser.parse_args()

    base_url = normalized_base_url(args.base_url)
    if not base_url:
        return _fail("Base URL is empty.")

    timeout = httpx.Timeout(args.timeout_seconds)
    try:
        with httpx.Client(base_url=base_url, timeout=timeout, follow_redirects=False) as client:
            report_response = client.post(
                "/api/reports/short",
                json={
                    "vbo_id": args.vbo_id,
                    "address_key": args.address_key,
                },
            )
            report_response.raise_for_status()
            report_json = report_response.json()
            report_id = report_json.get("report_id")
            if not isinstance(report_id, str) or not report_id:
                return _fail(f"Short report response missing report_id: {report_json!r}")

            checkout_response = client.post(
                "/api/billing/checkout-session",
                json={"report_id": report_id},
            )
            checkout_response.raise_for_status()
            checkout_json = checkout_response.json()
            checkout_url = checkout_json.get("checkout_url")
            if not isinstance(checkout_url, str) or not checkout_url:
                return _fail(
                    "Checkout response missing checkout_url: "
                    + repr(checkout_json)
                )

            print(
                "Web checkout smoke test passed "
                f"(report_id={report_id}, checkout_url={checkout_url})"
            )
            return 0
    except httpx.HTTPStatusError as exc:
        body = exc.response.text.strip()
        return _fail(
            "Smoke test failed with HTTP "
            f"{exc.response.status_code} at {exc.request.url}: {body}"
        )
    except httpx.HTTPError as exc:
        return _fail(f"Smoke test failed: {exc}")


if __name__ == "__main__":
    raise SystemExit(main())
