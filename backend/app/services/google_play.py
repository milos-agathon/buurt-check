"""Google Play Billing verification helpers for Android Path A."""

from __future__ import annotations

import asyncio
import json
import logging
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import httpx
from google.oauth2 import service_account

from app.config import settings

logger = logging.getLogger(__name__)

_ANDROID_PUBLISHER_SCOPE = "https://www.googleapis.com/auth/androidpublisher"
_TOKEN_URL = "https://oauth2.googleapis.com/token"
_ANDROID_PUBLISHER_BASE = "https://androidpublisher.googleapis.com/androidpublisher/v3"
_SERVICE_ACCOUNT_INFO: dict[str, Any] | None = None
_ACCESS_TOKEN: str | None = None
_ACCESS_TOKEN_EXPIRY = 0.0
_TOKEN_LOCK = asyncio.Lock()


class GooglePlayError(RuntimeError):
    """Base error for Google Play Billing integration failures."""


class GooglePlayConfigError(GooglePlayError):
    """Raised when required Google Play configuration is missing."""


class GooglePlayAPIError(GooglePlayError):
    """Raised when the Google Play Developer API cannot be reached successfully."""


class GooglePlayPurchaseNotFound(GooglePlayError):
    """Raised when Google Play cannot find a purchase token."""


@dataclass(slots=True)
class GooglePlayPurchaseStatus:
    product_id: str
    purchase_token: str
    purchase_state: int
    consumption_state: int
    acknowledgement_state: int
    order_id: str | None = None


def google_play_configured() -> bool:
    """Return True when the server can verify Google Play purchases."""
    return bool(
        settings.google_play_enabled
        and settings.google_play_package_name.strip()
        and settings.google_play_product_id.strip()
        and (
            settings.google_play_service_account_file.strip()
            or settings.google_play_service_account_json.strip()
        )
    )


def _load_service_account_info() -> dict[str, Any]:
    global _SERVICE_ACCOUNT_INFO
    if _SERVICE_ACCOUNT_INFO is not None:
        return _SERVICE_ACCOUNT_INFO

    if not settings.google_play_enabled:
        raise GooglePlayConfigError("Google Play Billing is disabled")

    if settings.google_play_service_account_file.strip():
        file_path = Path(settings.google_play_service_account_file)
        try:
            source = file_path.read_text(encoding="utf-8")
        except OSError as exc:
            raise GooglePlayConfigError(
                f"Could not read Google Play service account file: {file_path}",
            ) from exc
    elif settings.google_play_service_account_json.strip():
        source = settings.google_play_service_account_json
    else:
        raise GooglePlayConfigError("Google Play service account credentials are not configured")

    try:
        _SERVICE_ACCOUNT_INFO = json.loads(source)
    except json.JSONDecodeError as exc:
        raise GooglePlayConfigError(
            "Google Play service account JSON is invalid",
        ) from exc
    return _SERVICE_ACCOUNT_INFO


def _reset_cached_token() -> None:
    global _ACCESS_TOKEN, _ACCESS_TOKEN_EXPIRY
    _ACCESS_TOKEN = None
    _ACCESS_TOKEN_EXPIRY = 0.0


async def _get_access_token() -> str:
    global _ACCESS_TOKEN, _ACCESS_TOKEN_EXPIRY
    if _ACCESS_TOKEN and _ACCESS_TOKEN_EXPIRY > time.time() + 60:
        return _ACCESS_TOKEN

    async with _TOKEN_LOCK:
        if _ACCESS_TOKEN and _ACCESS_TOKEN_EXPIRY > time.time() + 60:
            return _ACCESS_TOKEN

        info = _load_service_account_info()
        credentials = service_account.Credentials.from_service_account_info(
            info,
            scopes=[_ANDROID_PUBLISHER_SCOPE],
        )
        assertion = credentials._make_authorization_grant_assertion()
        payload = {
            "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
            "assertion": assertion.decode("utf-8") if isinstance(assertion, bytes) else assertion,
        }

        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(_TOKEN_URL, data=payload)

        if response.status_code >= 400:
            raise GooglePlayAPIError(
                f"Google OAuth token exchange failed with status {response.status_code}",
            )

        data = response.json()
        access_token = data.get("access_token")
        if not isinstance(access_token, str) or not access_token:
            raise GooglePlayAPIError("Google OAuth token exchange returned no access token")

        expires_in = data.get("expires_in")
        expires_in_seconds = int(expires_in) if isinstance(expires_in, int | float | str) else 0
        _ACCESS_TOKEN = access_token
        _ACCESS_TOKEN_EXPIRY = time.time() + max(expires_in_seconds, 300)
        return access_token


async def _authorized_request(method: str, url: str) -> httpx.Response:
    token = await _get_access_token()
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.request(
            method,
            url,
            headers={"Authorization": f"Bearer {token}"},
        )
        if response.status_code == 401:
            _reset_cached_token()
            token = await _get_access_token()
            response = await client.request(
                method,
                url,
                headers={"Authorization": f"Bearer {token}"},
            )
    return response


def _purchase_endpoint(product_id: str, purchase_token: str) -> str:
    package_name = settings.google_play_package_name.strip()
    if not package_name:
        raise GooglePlayConfigError("Google Play package name is not configured")

    return (
        f"{_ANDROID_PUBLISHER_BASE}/applications/{package_name}"
        f"/purchases/products/{product_id}/tokens/{purchase_token}"
    )


async def get_product_purchase(
    purchase_token: str,
    product_id: str | None = None,
) -> GooglePlayPurchaseStatus:
    """Fetch the current Google Play purchase state for a one-time product."""
    if not google_play_configured():
        raise GooglePlayConfigError("Google Play Billing verification is not configured")

    resolved_product_id = (product_id or settings.google_play_product_id).strip()
    if not resolved_product_id:
        raise GooglePlayConfigError("Google Play product ID is not configured")

    response = await _authorized_request(
        "GET",
        _purchase_endpoint(resolved_product_id, purchase_token),
    )
    if response.status_code == 404:
        raise GooglePlayPurchaseNotFound("Google Play purchase token was not found")
    if response.status_code >= 400:
        raise GooglePlayAPIError(
            f"Google Play purchase lookup failed with status {response.status_code}",
        )

    data = response.json()
    return GooglePlayPurchaseStatus(
        product_id=resolved_product_id,
        purchase_token=purchase_token,
        purchase_state=int(data.get("purchaseState", 0)),
        consumption_state=int(data.get("consumptionState", 0)),
        acknowledgement_state=int(data.get("acknowledgementState", 0)),
        order_id=data.get("orderId"),
    )


async def consume_product_purchase(
    purchase_token: str,
    product_id: str | None = None,
) -> None:
    """Consume a Google Play one-time product so it can be purchased again."""
    if not google_play_configured():
        raise GooglePlayConfigError("Google Play Billing verification is not configured")

    resolved_product_id = (product_id or settings.google_play_product_id).strip()
    if not resolved_product_id:
        raise GooglePlayConfigError("Google Play product ID is not configured")

    response = await _authorized_request(
        "POST",
        f"{_purchase_endpoint(resolved_product_id, purchase_token)}:consume",
    )
    if response.status_code == 404:
        raise GooglePlayPurchaseNotFound("Google Play purchase token was not found")
    if response.status_code >= 400:
        raise GooglePlayAPIError(
            f"Google Play purchase consume failed with status {response.status_code}",
        )

    logger.info(
        "Consumed Google Play purchase token %s for product %s",
        purchase_token,
        resolved_product_id,
    )
