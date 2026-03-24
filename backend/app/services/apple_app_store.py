"""Apple App Store verification helpers for iOS Path A."""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path

from appstoreserverlibrary.api_client import APIException, AppStoreServerAPIClient
from appstoreserverlibrary.models.Environment import Environment
from appstoreserverlibrary.signed_data_verifier import (
    SignedDataVerifier,
    VerificationException,
)

from app.config import settings

logger = logging.getLogger(__name__)

_APPLE_ROOT_CERTS_DIR = Path(__file__).resolve().parents[1] / "certs" / "apple"


class AppleAppStoreError(RuntimeError):
    """Base error for Apple App Store integration failures."""


class AppleAppStoreConfigError(AppleAppStoreError):
    """Raised when required Apple App Store configuration is missing."""


class AppleAppStoreAPIError(AppleAppStoreError):
    """Raised when the App Store Server API cannot be reached successfully."""


class AppleAppStoreVerificationError(AppleAppStoreError):
    """Raised when signed Apple transaction or notification data is invalid."""


class AppleAppStoreTransactionNotFound(AppleAppStoreError):
    """Raised when Apple cannot find the requested transaction."""


@dataclass(slots=True)
class AppleTransactionStatus:
    product_id: str
    transaction_id: str
    original_transaction_id: str | None
    signed_transaction_info: str
    purchase_date_iso: str | None
    revocation_date_iso: str | None
    environment: str | None
    currency: str | None
    price_millis: int | None
    revoked: bool


@dataclass(slots=True)
class AppleNotificationPayload:
    notification_type: str | None
    subtype: str | None
    notification_uuid: str | None
    transaction: AppleTransactionStatus | None


def reset_apple_app_store_clients() -> None:
    """Clear cached Apple verifier/client instances for tests or config reloads."""
    _load_root_certificates.cache_clear()
    _build_signed_data_verifier.cache_clear()
    _build_api_client.cache_clear()



def apple_app_store_configured() -> bool:
    """Return True when the server can verify Apple App Store purchases."""
    return bool(
        settings.apple_enabled
        and settings.apple_bundle_id.strip()
        and settings.apple_product_id.strip()
        and settings.apple_issuer_id.strip()
        and settings.apple_key_id.strip()
        and (
            settings.apple_private_key_file.strip()
            or settings.apple_private_key_pem.strip()
        )
    )


def _apple_environment() -> Environment:
    raw = settings.apple_environment.strip().lower()
    environment_map = {
        "production": Environment.PRODUCTION,
        "sandbox": Environment.SANDBOX,
        "xcode": Environment.XCODE,
        "local_testing": Environment.LOCAL_TESTING,
        "localtesting": Environment.LOCAL_TESTING,
    }
    if raw not in environment_map:
        raise AppleAppStoreConfigError(
            f"Unsupported Apple environment: {settings.apple_environment}",
        )
    return environment_map[raw]


def _apple_app_store_id() -> int | None:
    raw = settings.apple_app_store_id.strip()
    if not raw:
        return None
    try:
        return int(raw)
    except ValueError as exc:
        raise AppleAppStoreConfigError("Apple App Store ID must be numeric") from exc


def _load_private_key_bytes() -> bytes:
    if not settings.apple_enabled:
        raise AppleAppStoreConfigError("Apple App Store billing is disabled")

    if settings.apple_private_key_file.strip():
        file_path = Path(settings.apple_private_key_file)
        try:
            return file_path.read_bytes()
        except OSError as exc:
            raise AppleAppStoreConfigError(
                f"Could not read Apple private key file: {file_path}",
            ) from exc

    if settings.apple_private_key_pem.strip():
        return settings.apple_private_key_pem.encode("utf-8")

    raise AppleAppStoreConfigError("Apple private key is not configured")


@lru_cache(maxsize=1)
def _load_root_certificates() -> list[bytes]:
    cert_paths = sorted(_APPLE_ROOT_CERTS_DIR.glob("*.cer"))
    if not cert_paths:
        raise AppleAppStoreConfigError(
            f"Apple root certificates are missing from {_APPLE_ROOT_CERTS_DIR}",
        )
    try:
        return [path.read_bytes() for path in cert_paths]
    except OSError as exc:
        raise AppleAppStoreConfigError(
            f"Could not read Apple root certificates from {_APPLE_ROOT_CERTS_DIR}",
        ) from exc


@lru_cache(maxsize=1)
def _build_signed_data_verifier() -> SignedDataVerifier:
    environment = _apple_environment()
    app_store_id = _apple_app_store_id()
    enable_online_checks = environment == Environment.PRODUCTION
    if environment == Environment.PRODUCTION and app_store_id is None:
        raise AppleAppStoreConfigError(
            "Apple App Store ID is required when BUURT_APPLE_ENVIRONMENT=production",
        )
    return SignedDataVerifier(
        _load_root_certificates(),
        enable_online_checks=enable_online_checks,
        environment=environment,
        bundle_id=settings.apple_bundle_id.strip(),
        app_apple_id=app_store_id,
    )


@lru_cache(maxsize=1)
def _build_api_client() -> AppStoreServerAPIClient:
    if not apple_app_store_configured():
        raise AppleAppStoreConfigError("Apple App Store verification is not configured")
    return AppStoreServerAPIClient(
        signing_key=_load_private_key_bytes(),
        key_id=settings.apple_key_id.strip(),
        issuer_id=settings.apple_issuer_id.strip(),
        bundle_id=settings.apple_bundle_id.strip(),
        environment=_apple_environment(),
    )


def _millis_to_iso(value: int | None) -> str | None:
    if value is None:
        return None
    return (
        datetime.fromtimestamp(value / 1000, tz=timezone.utc)
        .isoformat()
        .replace("+00:00", "Z")
    )


def _transaction_status_from_signed_transaction(
    signed_transaction_info: str,
) -> AppleTransactionStatus:
    try:
        decoded = _build_signed_data_verifier().verify_and_decode_signed_transaction(
            signed_transaction_info,
        )
    except AppleAppStoreConfigError:
        raise
    except VerificationException as exc:
        raise AppleAppStoreVerificationError(
            "Apple signed transaction verification failed",
        ) from exc

    transaction_id = (decoded.transactionId or "").strip()
    product_id = (decoded.productId or "").strip()
    if not transaction_id:
        raise AppleAppStoreVerificationError(
            "Apple transaction payload is missing a transaction ID",
        )
    if not product_id:
        raise AppleAppStoreVerificationError("Apple transaction payload is missing a product ID")

    return AppleTransactionStatus(
        product_id=product_id,
        transaction_id=transaction_id,
        original_transaction_id=(decoded.originalTransactionId or "").strip() or None,
        signed_transaction_info=signed_transaction_info,
        purchase_date_iso=_millis_to_iso(decoded.purchaseDate),
        revocation_date_iso=_millis_to_iso(decoded.revocationDate),
        environment=decoded.rawEnvironment or (
            decoded.environment.value if decoded.environment is not None else None
        ),
        currency=(decoded.currency or "").strip() or None,
        price_millis=decoded.price,
        revoked=decoded.revocationDate is not None,
    )


def verify_signed_transaction(signed_transaction_info: str) -> AppleTransactionStatus:
    """Verify a signed transaction returned by StoreKit or the App Store Server API."""
    if not apple_app_store_configured():
        raise AppleAppStoreConfigError("Apple App Store verification is not configured")
    return _transaction_status_from_signed_transaction(signed_transaction_info)


async def get_transaction_status(transaction_id: str) -> AppleTransactionStatus:
    """Fetch and verify the latest App Store status for a single transaction."""
    if not apple_app_store_configured():
        raise AppleAppStoreConfigError("Apple App Store verification is not configured")

    def _fetch_transaction() -> AppleTransactionStatus:
        try:
            response = _build_api_client().get_transaction_info(transaction_id)
        except APIException as exc:
            if exc.http_status_code == 404:
                raise AppleAppStoreTransactionNotFound(
                    "Apple transaction was not found",
                ) from exc
            raise AppleAppStoreAPIError(
                f"Apple transaction lookup failed with status {exc.http_status_code}",
            ) from exc

        signed_transaction_info = response.signedTransactionInfo
        if not signed_transaction_info:
            raise AppleAppStoreAPIError("Apple transaction lookup returned no signed payload")

        return _transaction_status_from_signed_transaction(signed_transaction_info)

    return await asyncio.to_thread(_fetch_transaction)


def verify_and_decode_notification(signed_payload: str) -> AppleNotificationPayload:
    """Verify and decode an App Store Server Notifications v2 signed payload."""
    if not apple_app_store_configured():
        raise AppleAppStoreConfigError("Apple App Store verification is not configured")

    try:
        decoded = _build_signed_data_verifier().verify_and_decode_notification(
            signed_payload,
        )
    except AppleAppStoreConfigError:
        raise
    except VerificationException as exc:
        raise AppleAppStoreVerificationError("Apple notification verification failed") from exc

    signed_transaction_info = (
        decoded.data.signedTransactionInfo
        if decoded.data is not None
        else None
    )
    transaction = (
        _transaction_status_from_signed_transaction(signed_transaction_info)
        if signed_transaction_info
        else None
    )

    notification_type = decoded.rawNotificationType or (
        decoded.notificationType.value if decoded.notificationType is not None else None
    )
    subtype = decoded.rawSubtype or (
        decoded.subtype.value if decoded.subtype is not None else None
    )

    return AppleNotificationPayload(
        notification_type=notification_type,
        subtype=subtype,
        notification_uuid=decoded.notificationUUID,
        transaction=transaction,
    )
