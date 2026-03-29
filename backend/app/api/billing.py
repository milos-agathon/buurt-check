"""Billing endpoints — Stripe, Google Play, and Apple App Store handlers."""

import asyncio
import logging
from datetime import datetime, timezone
from typing import Literal
from urllib.parse import urlsplit, urlunsplit

import stripe
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from stripe import SignatureVerificationError

from app.api.buyer import get_buyer_key
from app.config import settings
from app.db import DatabaseError
from app.rate_limit import limiter
from app.services.apple_app_store import (
    AppleAppStoreAPIError,
    AppleAppStoreConfigError,
    AppleAppStoreTransactionNotFound,
    AppleAppStoreVerificationError,
    apple_app_store_configured,
    get_transaction_status,
    verify_and_decode_notification,
    verify_signed_transaction,
)
from app.services.google_play import (
    GooglePlayAPIError,
    GooglePlayConfigError,
    GooglePlayError,
    GooglePlayPurchaseNotFound,
    consume_product_purchase,
    get_product_purchase,
    google_play_configured,
)
from app.services.reports import (
    get_report,
    get_report_by_payment_intent,
    get_report_by_provider_payment_id,
    get_report_for_buyer,
    refund_report,
    store_provider_session,
    unlock_report,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/billing", tags=["billing"])
public_router = APIRouter(tags=["billing"])

_LOCAL_BASE_URLS = frozenset({
    "",
    "http://localhost",
    "http://localhost:5173",
    "http://127.0.0.1",
    "http://127.0.0.1:5173",
})


class PricingResponse(BaseModel):
    price_cents: int = Field(..., ge=1)
    price_eur: str
    currency: str = "EUR"
    server_render_available: bool = False


def stripe_configured() -> bool:
    """Return True when Stripe checkout has a usable secret key."""
    return bool(settings.stripe_secret_key.strip())


def _normalized_base_url(value: str) -> str:
    return value.strip().rstrip("/")


def _request_origin(request: Request) -> str:
    """Resolve the public origin from forwarded headers or the request URL."""
    forwarded_proto = request.headers.get("x-forwarded-proto", "").split(",")[0].strip()
    forwarded_host = request.headers.get("x-forwarded-host", "").split(",")[0].strip()

    proto = forwarded_proto or request.url.scheme
    host = forwarded_host or request.headers.get("host") or request.url.netloc

    return f"{proto}://{host}".rstrip("/")


def _public_base_url(request: Request) -> str:
    """Prefer a configured public origin, but never emit localhost in production."""
    configured = _normalized_base_url(settings.base_url)
    if configured and configured not in _LOCAL_BASE_URLS:
        return configured

    request_origin = _request_origin(request)
    parsed = urlsplit(request_origin)
    if parsed.scheme in {"http", "https"} and parsed.hostname not in {"localhost", "127.0.0.1"}:
        return urlunsplit((parsed.scheme, parsed.netloc, "", "", "")).rstrip("/")

    return configured or request_origin


@public_router.get("/pricing", response_model=PricingResponse)
async def get_pricing():
    """Return the authoritative dossier price from backend config."""
    price_cents = settings.stripe_price_cents
    return PricingResponse(
        price_cents=price_cents,
        price_eur=f"{price_cents / 100:.2f}",
        currency="EUR",
        server_render_available=settings.forge3d_enabled,
    )


class CheckoutRequest(BaseModel):
    report_id: str = Field(
        ...,
        pattern=r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
    )


class CheckoutResponse(BaseModel):
    checkout_url: str


class GooglePlayVerifyRequest(BaseModel):
    report_id: str = Field(
        ...,
        pattern=r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
    )
    purchase_token: str = Field(..., min_length=1, max_length=4096)
    product_id: str = Field(..., min_length=1, max_length=255)


class GooglePlayVerifyResponse(BaseModel):
    report_id: str
    entitled: bool = True
    provider: Literal["google_play"] = "google_play"
    consumed: bool


class AppleAppStoreVerifyRequest(BaseModel):
    report_id: str = Field(
        ...,
        pattern=r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
    )
    signed_transaction_info: str = Field(..., min_length=1, max_length=8192)
    product_id: str = Field(..., min_length=1, max_length=255)


class AppleAppStoreVerifyResponse(BaseModel):
    report_id: str
    entitled: bool = True
    provider: Literal["apple_app_store"] = "apple_app_store"
    transaction_id: str


class AppleNotificationRequest(BaseModel):
    signed_payload: str = Field(
        ...,
        alias="signedPayload",
        min_length=1,
        max_length=16384,
    )


@limiter.limit("5/minute")
@router.post("/checkout-session", response_model=CheckoutResponse)
async def create_checkout_session(request: Request, body: CheckoutRequest):
    """Create a Stripe Checkout Session for a one-time dossier purchase.

    Validates the report exists and is unpaid, then creates a hosted checkout
    page. The provider_session_id is stored on the report for webhook
    reconciliation.
    """
    buyer_key = get_buyer_key(request)
    if not buyer_key:
        raise HTTPException(status_code=404, detail="Report not found")

    try:
        report = await get_report_for_buyer(body.report_id, buyer_key)
    except DatabaseError:
        logger.exception("Database error fetching report %s", body.report_id)
        raise HTTPException(status_code=503, detail="Service temporarily unavailable")
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    if report.payment_status == "paid":
        raise HTTPException(status_code=409, detail="Report already paid")
    if not stripe_configured():
        logger.error(
            "Stripe checkout requested for report %s but BUURT_STRIPE_SECRET_KEY is empty",
            body.report_id,
        )
        raise HTTPException(status_code=503, detail="Stripe Billing is not configured")

    stripe.api_key = settings.stripe_secret_key
    public_base_url = _public_base_url(request)

    try:
        session = await asyncio.to_thread(
            stripe.checkout.Session.create,
            mode="payment",
            line_items=[
                {
                    "price_data": {
                        "currency": "eur",
                        "unit_amount": settings.stripe_price_cents,
                        "product_data": {
                            "name": "Buurt Check Full Dossier",
                            "description": f"Complete property analysis for {report.address_key}",
                        },
                    },
                    "quantity": 1,
                }
            ],
            success_url=(
                f"{public_base_url}/#/address/{report.vbo_id}"
                f"?report={body.report_id}"
                "&session_id={CHECKOUT_SESSION_ID}"
            ),
            cancel_url=f"{public_base_url}/#/address/{report.vbo_id}",
            metadata={
                "report_id": body.report_id,
                "vbo_id": report.vbo_id,
            },
        )
    except stripe.AuthenticationError as exc:
        logger.exception(
            "Stripe authentication failed for report %s: %s",
            body.report_id,
            exc,
        )
        raise HTTPException(status_code=503, detail="Stripe Billing is not configured")
    except stripe.StripeError as exc:
        logger.exception(
            "Stripe session creation failed for report %s (base_url=%s): %s",
            body.report_id,
            public_base_url,
            exc,
        )
        raise HTTPException(status_code=502, detail="Payment provider unavailable")

    try:
        await store_provider_session(body.report_id, provider_session_id=session.id)
    except DatabaseError:
        logger.exception(
            "Failed to store session %s for report %s",
            session.id,
            body.report_id,
        )
        # Stripe session already exists — return URL anyway; webhook will reconcile.

    return CheckoutResponse(checkout_url=session.url)


@limiter.limit("10/minute")
@router.post("/google-play/verify", response_model=GooglePlayVerifyResponse)
async def verify_google_play_purchase(request: Request, body: GooglePlayVerifyRequest):
    """Verify a Google Play one-time product and unlock the matching dossier."""
    if not google_play_configured():
        raise HTTPException(status_code=503, detail="Google Play Billing is not configured")
    if body.product_id != settings.google_play_product_id:
        raise HTTPException(status_code=400, detail="Unexpected Google Play product ID")

    try:
        report = await get_report(body.report_id)
    except DatabaseError:
        logger.exception("Database error fetching report %s", body.report_id)
        raise HTTPException(status_code=503, detail="Service temporarily unavailable")
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    try:
        token_report = await get_report_by_provider_payment_id(body.purchase_token)
    except DatabaseError:
        logger.exception(
            "Database error checking provider token usage for report %s",
            body.report_id,
        )
        raise HTTPException(status_code=503, detail="Service temporarily unavailable")
    if token_report and token_report.report_id != body.report_id:
        raise HTTPException(
            status_code=409, detail="Purchase token already linked to another report"
        )

    try:
        purchase = await get_product_purchase(
            body.purchase_token,
            product_id=body.product_id,
        )
    except GooglePlayConfigError:
        raise HTTPException(status_code=503, detail="Google Play Billing is not configured")
    except GooglePlayPurchaseNotFound:
        raise HTTPException(status_code=409, detail="Google Play purchase token not found")
    except GooglePlayAPIError:
        logger.exception("Google Play verification failed for report %s", body.report_id)
        raise HTTPException(status_code=502, detail="Google Play verification failed")

    if purchase.purchase_state == 2:
        raise HTTPException(status_code=409, detail="Google Play purchase is still pending")
    if purchase.purchase_state != 0:
        raise HTTPException(status_code=409, detail="Google Play purchase is not active")

    if report.payment_status == "paid" and report.provider not in (None, "google_play"):
        raise HTTPException(status_code=409, detail="Report is already paid with another provider")

    if (
        report.payment_status != "paid"
        or report.entitlement_status != "active"
        or report.provider != "google_play"
        or report.provider_payment_id != body.purchase_token
    ):
        try:
            await unlock_report(
                body.report_id,
                provider="google_play",
                provider_payment_id=body.purchase_token,
                purchased_at=datetime.now(timezone.utc).isoformat(),
            )
        except DatabaseError:
            logger.exception(
                "Failed to unlock report %s after Google Play verification", body.report_id
            )
            raise HTTPException(status_code=503, detail="Service temporarily unavailable")

    consumed = purchase.consumption_state == 1
    if not consumed:
        try:
            await consume_product_purchase(
                body.purchase_token,
                product_id=body.product_id,
            )
            consumed = True
        except GooglePlayError:
            logger.exception(
                "Google Play purchase consume failed for report %s; entitlement remains active",
                body.report_id,
            )

    return GooglePlayVerifyResponse(report_id=body.report_id, consumed=consumed)


@limiter.limit("10/minute")
@router.post("/apple-app-store/verify", response_model=AppleAppStoreVerifyResponse)
async def verify_apple_app_store_purchase(
    request: Request,
    body: AppleAppStoreVerifyRequest,
):
    """Verify an Apple App Store consumable and unlock the matching dossier."""
    if not apple_app_store_configured():
        raise HTTPException(status_code=503, detail="Apple App Store Billing is not configured")
    if body.product_id != settings.apple_product_id:
        raise HTTPException(status_code=400, detail="Unexpected Apple product ID")

    try:
        report = await get_report(body.report_id)
    except DatabaseError:
        logger.exception("Database error fetching report %s", body.report_id)
        raise HTTPException(status_code=503, detail="Service temporarily unavailable")
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    try:
        device_transaction = verify_signed_transaction(body.signed_transaction_info)
        authoritative_transaction = await get_transaction_status(
            device_transaction.transaction_id,
        )
    except AppleAppStoreConfigError:
        raise HTTPException(status_code=503, detail="Apple App Store Billing is not configured")
    except AppleAppStoreVerificationError:
        raise HTTPException(status_code=409, detail="Apple transaction could not be verified")
    except AppleAppStoreTransactionNotFound:
        raise HTTPException(status_code=409, detail="Apple transaction identifier was not found")
    except AppleAppStoreAPIError:
        logger.exception("Apple transaction lookup failed for report %s", body.report_id)
        raise HTTPException(status_code=502, detail="Apple verification failed")

    if authoritative_transaction.product_id != settings.apple_product_id:
        raise HTTPException(status_code=409, detail="Apple transaction product mismatch")
    if authoritative_transaction.revoked:
        raise HTTPException(status_code=409, detail="Apple transaction is revoked or refunded")

    try:
        token_report = await get_report_by_provider_payment_id(
            authoritative_transaction.transaction_id,
        )
    except DatabaseError:
        logger.exception(
            "Database error checking Apple transaction usage for report %s",
            body.report_id,
        )
        raise HTTPException(status_code=503, detail="Service temporarily unavailable")
    if token_report and token_report.report_id != body.report_id:
        raise HTTPException(
            status_code=409,
            detail="Apple transaction is already linked to another report",
        )

    if report.payment_status == "paid" and report.provider not in (None, "apple_app_store"):
        raise HTTPException(status_code=409, detail="Report is already paid with another provider")

    if (
        report.payment_status != "paid"
        or report.entitlement_status != "active"
        or report.provider != "apple_app_store"
        or report.provider_payment_id != authoritative_transaction.transaction_id
    ):
        try:
            await unlock_report(
                body.report_id,
                provider="apple_app_store",
                provider_payment_id=authoritative_transaction.transaction_id,
                purchased_at=(
                    authoritative_transaction.purchase_date_iso
                    or datetime.now(timezone.utc).isoformat()
                ),
            )
        except DatabaseError:
            logger.exception(
                "Failed to unlock report %s after Apple verification",
                body.report_id,
            )
            raise HTTPException(status_code=503, detail="Service temporarily unavailable")

    return AppleAppStoreVerifyResponse(
        report_id=body.report_id,
        transaction_id=authoritative_transaction.transaction_id,
    )


@router.post("/apple-app-store/notifications")
async def apple_app_store_notifications(body: AppleNotificationRequest):
    """Receive App Store Server Notifications v2."""
    if not apple_app_store_configured():
        raise HTTPException(status_code=503, detail="Apple App Store Billing is not configured")

    try:
        notification = verify_and_decode_notification(body.signed_payload)
    except AppleAppStoreConfigError:
        raise HTTPException(status_code=503, detail="Apple App Store Billing is not configured")
    except AppleAppStoreVerificationError:
        raise HTTPException(status_code=400, detail="Invalid Apple signed payload")

    if not notification.transaction or not notification.notification_uuid:
        return {"status": "ok", "applied": False}

    if notification.notification_type not in {"REFUND", "REVOKE"}:
        return {"status": "ok", "applied": False}

    try:
        report = await get_report_by_provider_payment_id(notification.transaction.transaction_id)
    except DatabaseError:
        logger.exception(
            "Database error checking Apple notification transaction %s",
            notification.transaction.transaction_id,
        )
        raise HTTPException(status_code=503, detail="Service temporarily unavailable")

    if not report:
        logger.info(
            "Apple notification %s had no matching report for transaction %s",
            notification.notification_uuid,
            notification.transaction.transaction_id,
        )
        return {"status": "ok", "applied": False}

    if report.payment_status == "refunded":
        return {"status": "ok", "applied": False}

    try:
        await refund_report(report.report_id)
    except DatabaseError:
        logger.exception(
            "Failed to revoke Apple-backed entitlement for report %s",
            report.report_id,
        )
        raise HTTPException(status_code=503, detail="Service temporarily unavailable")

    logger.info(
        "Apple notification %s revoked report %s via %s",
        notification.notification_uuid,
        report.report_id,
        notification.notification_type,
    )
    return {"status": "ok", "applied": True}


# ---------------------------------------------------------------------------
# Stripe Webhook
# ---------------------------------------------------------------------------


@router.post("/webhook")
async def stripe_webhook(request: Request):
    """Receive and verify Stripe webhook events.

    Returns 200 to Stripe even on internal processing errors (logged).
    Only returns 400 when the signature is invalid.
    """
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")

    try:
        event = stripe.Webhook.construct_event(
            payload,
            sig_header,
            settings.stripe_webhook_secret,
        )
    except (ValueError, SignatureVerificationError) as e:
        logger.warning("Webhook signature verification failed: %s", e)
        raise HTTPException(status_code=400, detail="Invalid signature")

    if event["type"] == "checkout.session.completed":
        session = event["data"]["object"]
        report_id = session.get("metadata", {}).get("report_id")
        if report_id:
            try:
                await _handle_checkout_completed(report_id, session)
            except Exception:
                logger.exception(
                    "Failed to process checkout.session.completed for report %s",
                    report_id,
                )

    elif event["type"] == "charge.refunded":
        charge = event["data"]["object"]
        payment_intent_id = charge.get("payment_intent")
        if payment_intent_id:
            try:
                await _handle_charge_refunded(payment_intent_id)
            except Exception:
                logger.exception(
                    "Failed to process charge.refunded for pi %s",
                    payment_intent_id,
                )

    return {"status": "ok"}


async def _handle_checkout_completed(report_id: str, session: dict) -> None:
    """Activate entitlement after successful checkout."""
    report = await get_report(report_id)
    if not report:
        logger.error("Webhook: report %s not found", report_id)
        return
    if report.payment_status == "paid":
        logger.info("Webhook: report %s already paid (idempotent)", report_id)
        return

    now = datetime.now(timezone.utc).isoformat()

    await unlock_report(
        report_id,
        provider="stripe",
        provider_payment_id=session.get("payment_intent"),
        purchased_at=now,
    )
    logger.info("Webhook: report %s unlocked", report_id)


async def _handle_charge_refunded(payment_intent_id: str) -> None:
    """Revoke entitlement when a charge is refunded."""
    report = await get_report_by_payment_intent(payment_intent_id)
    if not report:
        logger.warning(
            "Refund webhook: no report found for pi %s",
            payment_intent_id,
        )
        return
    if report.payment_status == "refunded":
        logger.info(
            "Refund webhook: report %s already refunded (idempotent)",
            report.report_id,
        )
        return

    await refund_report(report.report_id)
    logger.info(
        "Refund webhook: report %s entitlement revoked",
        report.report_id,
    )
