"""Billing endpoints — Stripe Checkout Session creation + webhook handling."""

import asyncio
import logging
from datetime import datetime, timezone
from typing import Literal

import stripe
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from stripe import SignatureVerificationError

from app.config import settings
from app.db import DatabaseError
from app.rate_limit import limiter
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
    refund_report,
    store_provider_session,
    unlock_report,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/billing", tags=["billing"])
public_router = APIRouter(tags=["billing"])


class PricingResponse(BaseModel):
    price_cents: int = Field(..., ge=1)
    price_eur: str
    currency: str = "EUR"
    server_render_available: bool = False


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


@limiter.limit("5/minute")
@router.post("/checkout-session", response_model=CheckoutResponse)
async def create_checkout_session(request: Request, body: CheckoutRequest):
    """Create a Stripe Checkout Session for a one-time dossier purchase.

    Validates the report exists and is unpaid, then creates a hosted checkout
    page. The provider_session_id is stored on the report for webhook
    reconciliation.
    """
    try:
        report = await get_report(body.report_id)
    except DatabaseError:
        logger.exception("Database error fetching report %s", body.report_id)
        raise HTTPException(status_code=503, detail="Service temporarily unavailable")
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    if report.payment_status == "paid":
        raise HTTPException(status_code=409, detail="Report already paid")

    stripe.api_key = settings.stripe_secret_key

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
                f"{settings.base_url}/#/address/{report.vbo_id}"
                f"?report={body.report_id}"
                "&session_id={CHECKOUT_SESSION_ID}"
            ),
            cancel_url=f"{settings.base_url}/#/address/{report.vbo_id}",
            metadata={
                "report_id": body.report_id,
                "vbo_id": report.vbo_id,
            },
        )
    except stripe.StripeError as exc:
        logger.exception("Stripe session creation failed for report %s: %s", body.report_id, exc)
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
