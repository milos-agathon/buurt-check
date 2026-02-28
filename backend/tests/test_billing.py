"""Tests for the billing API endpoints (Story 3.1 — Stripe Checkout Session)."""

from contextlib import ExitStack
from unittest.mock import MagicMock, patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.config import settings
from app.db import init_db
from app.main import app


@pytest_asyncio.fixture
async def db_path(tmp_path):
    """Create a fresh test DB and return its path."""
    path = str(tmp_path / "test.db")
    await init_db(path)
    return path


def _billing_patches(db_path, extra_settings=None):
    """Create ExitStack with all necessary patches for billing tests.

    Patches the singleton settings attributes (database_path, stripe_*, etc.)
    rather than replacing the module-level settings object, since reports.py
    accesses settings indirectly through db.get_db().
    """
    stack = ExitStack()
    stack.enter_context(patch.object(settings, "database_path", db_path))
    stack.enter_context(patch.object(settings, "stripe_secret_key", "sk_test_xxx"))
    stack.enter_context(patch.object(settings, "stripe_webhook_secret", "whsec_test"))
    stack.enter_context(patch.object(settings, "stripe_price_cents", 1499))
    stack.enter_context(patch.object(settings, "base_url", "http://localhost:5173"))
    stack.enter_context(patch.object(settings, "rate_limit_enabled", False))
    if extra_settings:
        for k, v in extra_settings.items():
            stack.enter_context(patch.object(settings, k, v))
    mock_stripe = stack.enter_context(patch("app.api.billing.stripe"))
    return stack, mock_stripe


@pytest.mark.asyncio
async def test_get_pricing_returns_backend_authoritative_price(db_path):
    """GET /api/pricing should derive EUR display from backend cents config."""
    with (
        patch.object(settings, "database_path", db_path),
        patch.object(settings, "stripe_price_cents", 1999),
        patch.object(settings, "rate_limit_enabled", False),
    ):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/pricing")

    assert response.status_code == 200
    assert response.json() == {
        "price_cents": 1999,
        "price_eur": "19.99",
        "currency": "EUR",
    }


@pytest.mark.asyncio
async def test_create_checkout_session(db_path):
    """stripe.checkout.Session.create is called via asyncio.to_thread."""
    from app.services.reports import create_report

    rid = await create_report("0363010012345678", "Damrak 1", "long", db_path=db_path)

    mock_session = MagicMock()
    mock_session.id = "cs_test_abc123"
    mock_session.url = "https://checkout.stripe.com/pay/cs_test_abc123"

    stack, mock_stripe = _billing_patches(db_path)
    with stack:
        mock_stripe.checkout.Session.create.return_value = mock_session
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/billing/checkout-session",
                json={"report_id": rid},
            )

    assert response.status_code == 200
    data = response.json()
    assert data["checkout_url"] == "https://checkout.stripe.com/pay/cs_test_abc123"


@pytest.mark.asyncio
async def test_checkout_rejects_nonexistent_report(db_path):
    """Requesting checkout for a report that doesn't exist returns 404."""
    stack, _mock_stripe = _billing_patches(db_path)
    with stack:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/billing/checkout-session",
                json={"report_id": "00000000-0000-0000-0000-000000000000"},
            )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_checkout_rejects_already_paid(db_path):
    """Requesting checkout for an already-paid report returns 409."""
    from app.services.reports import create_report, update_payment_status

    rid = await create_report("0363010012345678", "Damrak 1", "long", db_path=db_path)
    await update_payment_status(rid, "paid", db_path=db_path)

    stack, _mock_stripe = _billing_patches(db_path)
    with stack:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/billing/checkout-session",
                json={"report_id": rid},
            )
    assert response.status_code == 409


@pytest.mark.asyncio
async def test_checkout_stores_provider_session_id(db_path):
    """After checkout, the provider_session_id is stored on the report."""
    from app.services.reports import create_report, get_report

    rid = await create_report("0363010012345678", "Damrak 1", "long", db_path=db_path)

    mock_session = MagicMock()
    mock_session.id = "cs_test_stored_id"
    mock_session.url = "https://checkout.stripe.com/pay/cs_test_stored_id"

    stack, mock_stripe = _billing_patches(db_path)
    with stack:
        mock_stripe.checkout.Session.create.return_value = mock_session
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            await client.post(
                "/api/billing/checkout-session",
                json={"report_id": rid},
            )

    report = await get_report(rid, db_path=db_path)
    assert report is not None
    assert report.provider_session_id == "cs_test_stored_id"


@pytest.mark.asyncio
async def test_checkout_stripe_call_args(db_path):
    """Verify the Stripe API is called with the correct parameters."""
    from app.services.reports import create_report

    rid = await create_report("0363010012345678", "Damrak 1", "long", db_path=db_path)

    mock_session = MagicMock()
    mock_session.id = "cs_test_args"
    mock_session.url = "https://checkout.stripe.com/pay/cs_test_args"

    stack, mock_stripe = _billing_patches(db_path)
    with stack:
        mock_stripe.checkout.Session.create.return_value = mock_session
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            await client.post(
                "/api/billing/checkout-session",
                json={"report_id": rid},
            )

        # Verify Stripe was called with correct args
        call_kwargs = mock_stripe.checkout.Session.create.call_args
        assert call_kwargs.kwargs["mode"] == "payment"
        assert len(call_kwargs.kwargs["line_items"]) == 1
        item = call_kwargs.kwargs["line_items"][0]
        assert item["price_data"]["currency"] == "eur"
        assert item["price_data"]["unit_amount"] == 1499
        assert item["quantity"] == 1
        assert call_kwargs.kwargs["metadata"]["report_id"] == rid
        assert call_kwargs.kwargs["metadata"]["vbo_id"] == "0363010012345678"
        assert "success_url" in call_kwargs.kwargs
        assert "cancel_url" in call_kwargs.kwargs


# ---------------------------------------------------------------------------
# Webhook tests (Story 3.2)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_webhook_valid_signature(db_path):
    """checkout.session.completed sets payment_status=paid and entitlement=active."""
    from app.services.reports import create_report, get_report

    rid = await create_report("0363010012345678", "Damrak 1", "long", db_path=db_path)

    event_data = {
        "type": "checkout.session.completed",
        "data": {
            "object": {
                "id": "cs_test_abc",
                "payment_intent": "pi_test_123",
                "metadata": {"report_id": rid, "vbo_id": "0363010012345678"},
            }
        },
    }

    stack, mock_stripe = _billing_patches(db_path)
    with stack:
        mock_stripe.Webhook.construct_event.return_value = event_data
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/billing/webhook",
                content=b"{}",
                headers={"stripe-signature": "t=123,v1=abc"},
            )
        assert response.status_code == 200

    report = await get_report(rid, db_path=db_path)
    assert report.payment_status == "paid"
    assert report.entitlement_status == "active"


@pytest.mark.asyncio
async def test_webhook_invalid_signature(db_path):
    """Invalid Stripe signature returns 400."""
    stack, mock_stripe = _billing_patches(db_path)
    with stack:
        mock_stripe.Webhook.construct_event.side_effect = ValueError("Invalid signature")
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/billing/webhook",
                content=b"{}",
                headers={"stripe-signature": "bad"},
            )
        assert response.status_code == 400


@pytest.mark.asyncio
async def test_webhook_idempotent(db_path):
    """Processing same event twice should not error."""
    from app.services.reports import create_report

    rid = await create_report("0363010012345678", "Damrak 1", "long", db_path=db_path)

    event_data = {
        "type": "checkout.session.completed",
        "data": {
            "object": {
                "id": "cs_test_abc",
                "payment_intent": "pi_test_123",
                "metadata": {"report_id": rid},
            }
        },
    }

    stack, mock_stripe = _billing_patches(db_path)
    with stack:
        mock_stripe.Webhook.construct_event.return_value = event_data
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            await client.post(
                "/api/billing/webhook",
                content=b"{}",
                headers={"stripe-signature": "ok"},
            )
            response = await client.post(
                "/api/billing/webhook",
                content=b"{}",
                headers={"stripe-signature": "ok"},
            )
        assert response.status_code == 200


@pytest.mark.asyncio
async def test_webhook_checkout_stores_provider_payment_id(db_path):
    """checkout.session.completed stores the payment_intent as provider_payment_id."""
    from app.services.reports import create_report, get_report

    rid = await create_report("0363010012345678", "Damrak 1", "long", db_path=db_path)

    event_data = {
        "type": "checkout.session.completed",
        "data": {
            "object": {
                "id": "cs_test_abc",
                "payment_intent": "pi_test_456",
                "metadata": {"report_id": rid},
            }
        },
    }

    stack, mock_stripe = _billing_patches(db_path)
    with stack:
        mock_stripe.Webhook.construct_event.return_value = event_data
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            await client.post(
                "/api/billing/webhook",
                content=b"{}",
                headers={"stripe-signature": "ok"},
            )

    report = await get_report(rid, db_path=db_path)
    assert report.provider_payment_id == "pi_test_456"
    assert report.provider == "stripe"
    assert report.purchased_at is not None


@pytest.mark.asyncio
async def test_webhook_charge_refunded(db_path):
    """charge.refunded revokes entitlement and sets payment_status=refunded."""
    from app.services.reports import (
        activate_entitlement,
        create_report,
        get_report,
        update_payment_status,
    )

    rid = await create_report("0363010012345678", "Damrak 1", "long", db_path=db_path)
    # Simulate a prior successful payment
    await update_payment_status(
        rid, "paid",
        provider="stripe",
        provider_payment_id="pi_test_refund",
        db_path=db_path,
    )
    await activate_entitlement(rid, db_path=db_path)

    event_data = {
        "type": "charge.refunded",
        "data": {
            "object": {
                "id": "ch_test_abc",
                "payment_intent": "pi_test_refund",
            }
        },
    }

    stack, mock_stripe = _billing_patches(db_path)
    with stack:
        mock_stripe.Webhook.construct_event.return_value = event_data
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/billing/webhook",
                content=b"{}",
                headers={"stripe-signature": "ok"},
            )
        assert response.status_code == 200

    report = await get_report(rid, db_path=db_path)
    assert report.payment_status == "refunded"
    assert report.entitlement_status == "revoked"


@pytest.mark.asyncio
async def test_webhook_refund_idempotent(db_path):
    """Processing same refund event twice should not error."""
    from app.services.reports import (
        activate_entitlement,
        create_report,
        update_payment_status,
    )

    rid = await create_report("0363010012345678", "Damrak 1", "long", db_path=db_path)
    await update_payment_status(
        rid, "paid",
        provider="stripe",
        provider_payment_id="pi_test_refund2",
        db_path=db_path,
    )
    await activate_entitlement(rid, db_path=db_path)

    event_data = {
        "type": "charge.refunded",
        "data": {
            "object": {
                "id": "ch_test_xyz",
                "payment_intent": "pi_test_refund2",
            }
        },
    }

    stack, mock_stripe = _billing_patches(db_path)
    with stack:
        mock_stripe.Webhook.construct_event.return_value = event_data
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            await client.post(
                "/api/billing/webhook",
                content=b"{}",
                headers={"stripe-signature": "ok"},
            )
            response = await client.post(
                "/api/billing/webhook",
                content=b"{}",
                headers={"stripe-signature": "ok"},
            )
        assert response.status_code == 200


@pytest.mark.asyncio
async def test_webhook_unknown_event_returns_200(db_path):
    """Unknown event types are silently acknowledged with 200."""
    event_data = {
        "type": "customer.subscription.created",
        "data": {"object": {}},
    }

    stack, mock_stripe = _billing_patches(db_path)
    with stack:
        mock_stripe.Webhook.construct_event.return_value = event_data
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/billing/webhook",
                content=b"{}",
                headers={"stripe-signature": "ok"},
            )
        assert response.status_code == 200
