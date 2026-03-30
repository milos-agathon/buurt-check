"""Tests for the billing API endpoints (Story 3.1 — Stripe Checkout Session)."""

from contextlib import ExitStack
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.api.buyer import BUYER_COOKIE_NAME
from app.config import settings
from app.db import init_db
from app.main import app
from app.services.apple_app_store import (
    AppleAppStoreVerificationError,
    reset_apple_app_store_clients,
)


@pytest_asyncio.fixture
async def db_path(tmp_path):
    """Create a fresh test DB and return its path."""
    path = str(tmp_path / "test.db")
    await init_db(path)
    return path


@pytest.fixture(autouse=True)
def reset_apple_clients():
    reset_apple_app_store_clients()
    yield
    reset_apple_app_store_clients()


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
        patch.object(settings, "stripe_secret_key", "sk_test_123"),
        patch.object(settings, "stripe_webhook_secret", "whsec_123"),
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
        "server_render_available": False,
        "web_checkout_provider": "stripe",
        "web_checkout_available": True,
    }


@pytest.mark.asyncio
async def test_get_pricing_marks_web_checkout_unavailable_without_stripe_config(db_path):
    """Pricing should expose when web Stripe checkout is unavailable."""
    with (
        patch.object(settings, "database_path", db_path),
        patch.object(settings, "stripe_secret_key", ""),
        patch.object(settings, "stripe_webhook_secret", ""),
        patch.object(settings, "rate_limit_enabled", False),
    ):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/pricing")

    assert response.status_code == 200
    assert response.json()["web_checkout_provider"] == "stripe"
    assert response.json()["web_checkout_available"] is False


@pytest.mark.asyncio
async def test_get_pricing_keeps_web_checkout_available_without_webhook_secret(db_path):
    """Web checkout can start with a secret key even when webhook verification is absent."""
    with (
        patch.object(settings, "database_path", db_path),
        patch.object(settings, "stripe_secret_key", "sk_test_123"),
        patch.object(settings, "stripe_webhook_secret", ""),
        patch.object(settings, "rate_limit_enabled", False),
    ):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/pricing")

    assert response.status_code == 200
    assert response.json()["web_checkout_available"] is True


@pytest.mark.asyncio
async def test_create_checkout_session(db_path):
    """stripe.checkout.Session.create is called via asyncio.to_thread."""
    from app.services.reports import create_report

    rid = await create_report(
        "0363010012345678",
        "Damrak 1",
        "long",
        buyer_key="buyer-123",
        db_path=db_path,
    )

    mock_session = MagicMock()
    mock_session.id = "cs_test_abc123"
    mock_session.url = "https://checkout.stripe.com/pay/cs_test_abc123"

    stack, mock_stripe = _billing_patches(db_path)
    with stack:
        mock_stripe.checkout.Session.create.return_value = mock_session
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            client.cookies.set(BUYER_COOKIE_NAME, "buyer-123")
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
            client.cookies.set(BUYER_COOKIE_NAME, "buyer-123")
            response = await client.post(
                "/api/billing/checkout-session",
                json={"report_id": "00000000-0000-0000-0000-000000000000"},
            )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_checkout_rejects_already_paid(db_path):
    """Requesting checkout for an already-paid report returns 409."""
    from app.services.reports import create_report, update_payment_status

    rid = await create_report(
        "0363010012345678",
        "Damrak 1",
        "long",
        buyer_key="buyer-123",
        db_path=db_path,
    )
    await update_payment_status(rid, "paid", db_path=db_path)

    stack, _mock_stripe = _billing_patches(db_path)
    with stack:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            client.cookies.set(BUYER_COOKIE_NAME, "buyer-123")
            response = await client.post(
                "/api/billing/checkout-session",
                json={"report_id": rid},
            )
    assert response.status_code == 409


@pytest.mark.asyncio
async def test_checkout_stores_provider_session_id(db_path):
    """After checkout, the provider_session_id is stored on the report."""
    from app.services.reports import create_report, get_report

    rid = await create_report(
        "0363010012345678",
        "Damrak 1",
        "long",
        buyer_key="buyer-123",
        db_path=db_path,
    )

    mock_session = MagicMock()
    mock_session.id = "cs_test_stored_id"
    mock_session.url = "https://checkout.stripe.com/pay/cs_test_stored_id"

    stack, mock_stripe = _billing_patches(db_path)
    with stack:
        mock_stripe.checkout.Session.create.return_value = mock_session
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            client.cookies.set(BUYER_COOKIE_NAME, "buyer-123")
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

    rid = await create_report(
        "0363010012345678",
        "Damrak 1",
        "long",
        buyer_key="buyer-123",
        db_path=db_path,
    )

    mock_session = MagicMock()
    mock_session.id = "cs_test_args"
    mock_session.url = "https://checkout.stripe.com/pay/cs_test_args"

    stack, mock_stripe = _billing_patches(db_path)
    with stack:
        mock_stripe.checkout.Session.create.return_value = mock_session
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            client.cookies.set(BUYER_COOKIE_NAME, "buyer-123")
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


@pytest.mark.asyncio
async def test_checkout_uses_request_origin_when_base_url_is_localhost_default(db_path):
    """Checkout redirects should use the public request origin, not localhost defaults."""
    from app.services.reports import create_report

    rid = await create_report(
        "0363010012345678",
        "Damrak 1",
        "long",
        buyer_key="buyer-123",
        db_path=db_path,
    )

    mock_session = MagicMock()
    mock_session.id = "cs_test_public_origin"
    mock_session.url = "https://checkout.stripe.com/pay/cs_test_public_origin"

    stack, mock_stripe = _billing_patches(db_path)
    with stack:
        mock_stripe.checkout.Session.create.return_value = mock_session
        transport = ASGITransport(app=app)
        async with AsyncClient(
            transport=transport,
            base_url="https://app.buurt-check.nl",
        ) as client:
            client.cookies.set(BUYER_COOKIE_NAME, "buyer-123")
            response = await client.post(
                "/api/billing/checkout-session",
                json={"report_id": rid},
            )

    assert response.status_code == 200
    call_kwargs = mock_stripe.checkout.Session.create.call_args
    assert call_kwargs.kwargs["success_url"].startswith(
        "https://app.buurt-check.nl/#/address/0363010012345678"
    )
    assert call_kwargs.kwargs["cancel_url"] == (
        "https://app.buurt-check.nl/#/address/0363010012345678"
    )


@pytest.mark.asyncio
async def test_checkout_rejects_when_stripe_is_not_configured(db_path):
    """Missing Stripe secret should fail explicitly before any provider call."""
    from app.services.reports import create_report

    rid = await create_report(
        "0363010012345678",
        "Damrak 1",
        "long",
        buyer_key="buyer-123",
        db_path=db_path,
    )

    stack, mock_stripe = _billing_patches(
        db_path,
        extra_settings={"stripe_secret_key": ""},
    )
    with stack:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            client.cookies.set(BUYER_COOKIE_NAME, "buyer-123")
            response = await client.post(
                "/api/billing/checkout-session",
                json={"report_id": rid},
            )

    assert response.status_code == 503
    assert response.json() == {"detail": "Stripe Billing is not configured"}
    mock_stripe.checkout.Session.create.assert_not_called()


@pytest.mark.asyncio
async def test_checkout_allows_missing_webhook_secret_when_secret_key_exists(db_path):
    """Checkout session creation should still work without the webhook secret."""
    from app.services.reports import create_report

    rid = await create_report(
        "0363010012345678",
        "Damrak 1",
        "long",
        buyer_key="buyer-123",
        db_path=db_path,
    )

    mock_session = MagicMock()
    mock_session.id = "cs_test_without_webhook"
    mock_session.url = "https://checkout.stripe.com/pay/cs_test_without_webhook"

    stack, mock_stripe = _billing_patches(
        db_path,
        extra_settings={"stripe_webhook_secret": ""},
    )
    with stack:
        mock_stripe.checkout.Session.create.return_value = mock_session
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            client.cookies.set(BUYER_COOKIE_NAME, "buyer-123")
            response = await client.post(
                "/api/billing/checkout-session",
                json={"report_id": rid},
            )

    assert response.status_code == 200
    assert response.json() == {
        "checkout_url": "https://checkout.stripe.com/pay/cs_test_without_webhook"
    }
    mock_stripe.checkout.Session.create.assert_called_once()


@pytest.mark.asyncio
async def test_confirm_checkout_session_unlocks_paid_report(db_path):
    """Redirect confirmation should unlock the Stripe report when payment is paid."""
    from app.services.reports import create_report, get_report, store_provider_session

    rid = await create_report(
        "0363010012345678",
        "Damrak 1",
        "long",
        buyer_key="buyer-123",
        db_path=db_path,
    )
    await store_provider_session(rid, "cs_test_confirm", db_path=db_path)

    stack, mock_stripe = _billing_patches(
        db_path,
        extra_settings={"stripe_webhook_secret": ""},
    )
    with stack:
        mock_stripe.checkout.Session.retrieve.return_value = {
            "id": "cs_test_confirm",
            "payment_status": "paid",
            "payment_intent": "pi_test_confirm",
            "metadata": {
                "report_id": rid,
                "vbo_id": "0363010012345678",
            },
        }
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            client.cookies.set(BUYER_COOKIE_NAME, "buyer-123")
            response = await client.get(
                f"/api/billing/checkout-session/cs_test_confirm/confirm?report_id={rid}",
            )

    assert response.status_code == 200
    assert response.json() == {
        "report_id": rid,
        "entitled": True,
        "report_type": "long",
    }

    report = await get_report(rid, db_path=db_path)
    assert report is not None
    assert report.payment_status == "paid"
    assert report.entitlement_status == "active"
    assert report.provider == "stripe"
    assert report.provider_payment_id == "pi_test_confirm"


@pytest.mark.asyncio
async def test_confirm_checkout_session_rejects_session_mismatch(db_path):
    """A report can only confirm the Stripe session that was issued for it."""
    from app.services.reports import create_report, store_provider_session

    rid = await create_report(
        "0363010012345678",
        "Damrak 1",
        "long",
        buyer_key="buyer-123",
        db_path=db_path,
    )
    await store_provider_session(rid, "cs_test_expected", db_path=db_path)

    stack, mock_stripe = _billing_patches(db_path)
    with stack:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            client.cookies.set(BUYER_COOKIE_NAME, "buyer-123")
            response = await client.get(
                f"/api/billing/checkout-session/cs_test_other/confirm?report_id={rid}",
            )

    assert response.status_code == 404
    assert response.json() == {"detail": "Checkout session not found"}
    mock_stripe.checkout.Session.retrieve.assert_not_called()


@pytest.mark.asyncio
async def test_verify_google_play_purchase_unlocks_report_and_consumes_token(db_path):
    """Google Play verification unlocks the report and consumes the product token."""
    from app.services.reports import create_report, get_report

    rid = await create_report("0363010012345678", "Damrak 1", "long", db_path=db_path)

    stack, _mock_stripe = _billing_patches(
        db_path,
        extra_settings={
            "google_play_enabled": True,
            "google_play_package_name": "nl.buurtcheck.app",
            "google_play_product_id": "full_dossier_unlock",
            "google_play_service_account_json": '{"type":"service_account"}',
        },
    )
    with (
        stack,
        patch(
            "app.api.billing.get_product_purchase",
            new=AsyncMock(
                return_value=SimpleNamespace(
                    purchase_state=0,
                    consumption_state=0,
                )
            ),
        ),
        patch(
            "app.api.billing.consume_product_purchase",
            new=AsyncMock(),
        ) as mock_consume,
    ):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/billing/google-play/verify",
                json={
                    "report_id": rid,
                    "purchase_token": "purchase-token-123",
                    "product_id": "full_dossier_unlock",
                },
            )

    assert response.status_code == 200
    assert response.json() == {
        "report_id": rid,
        "entitled": True,
        "provider": "google_play",
        "consumed": True,
    }
    mock_consume.assert_awaited_once_with(
        "purchase-token-123",
        product_id="full_dossier_unlock",
    )

    report = await get_report(rid, db_path=db_path)
    assert report is not None
    assert report.payment_status == "paid"
    assert report.entitlement_status == "active"
    assert report.provider == "google_play"
    assert report.provider_payment_id == "purchase-token-123"


@pytest.mark.asyncio
async def test_verify_google_play_purchase_rejects_token_reuse_across_reports(db_path):
    """A consumed or active purchase token cannot unlock a second report."""
    from app.services.reports import create_report, unlock_report

    original_report = await create_report("0363010012345678", "Damrak 1", "long", db_path=db_path)
    second_report = await create_report("0363010012345678", "Damrak 1", "long", db_path=db_path)
    await unlock_report(
        original_report,
        provider="google_play",
        provider_payment_id="purchase-token-123",
        purchased_at="2026-03-17T10:00:00Z",
        db_path=db_path,
    )

    stack, _mock_stripe = _billing_patches(
        db_path,
        extra_settings={
            "google_play_enabled": True,
            "google_play_package_name": "nl.buurtcheck.app",
            "google_play_product_id": "full_dossier_unlock",
            "google_play_service_account_json": '{"type":"service_account"}',
        },
    )
    with stack:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/billing/google-play/verify",
                json={
                    "report_id": second_report,
                    "purchase_token": "purchase-token-123",
                    "product_id": "full_dossier_unlock",
                },
            )

    assert response.status_code == 409


@pytest.mark.asyncio
async def test_verify_apple_purchase_unlocks_report_and_stores_transaction_id(db_path):
    """Apple verification unlocks the report and stores provider=apple_app_store."""
    from app.services.reports import create_report, get_report

    rid = await create_report("0363010012345678", "Damrak 1", "long", db_path=db_path)

    stack, _mock_stripe = _billing_patches(
        db_path,
        extra_settings={
            "apple_enabled": True,
            "apple_bundle_id": "nl.buurtcheck.app.ios",
            "apple_product_id": "full_dossier_unlock",
            "apple_environment": "production",
            "apple_issuer_id": "issuer-123",
            "apple_key_id": "key-123",
            "apple_private_key_pem": "-----BEGIN PRIVATE KEY-----\nTEST\n-----END PRIVATE KEY-----",
            "apple_app_store_id": "1234567890",
        },
    )
    with (
        stack,
        patch(
            "app.api.billing.verify_signed_transaction",
            return_value=SimpleNamespace(
                transaction_id="apple-transaction-123",
                product_id="full_dossier_unlock",
            ),
        ),
        patch(
            "app.api.billing.get_transaction_status",
            new=AsyncMock(
                return_value=SimpleNamespace(
                    transaction_id="apple-transaction-123",
                    product_id="full_dossier_unlock",
                    revoked=False,
                    purchase_date_iso="2026-03-23T12:00:00+00:00",
                )
            ),
        ),
    ):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/billing/apple-app-store/verify",
                json={
                    "report_id": rid,
                    "signed_transaction_info": "signed-jws-123",
                    "product_id": "full_dossier_unlock",
                },
            )

    assert response.status_code == 200
    assert response.json() == {
        "report_id": rid,
        "entitled": True,
        "provider": "apple_app_store",
        "transaction_id": "apple-transaction-123",
    }

    report = await get_report(rid, db_path=db_path)
    assert report is not None
    assert report.payment_status == "paid"
    assert report.entitlement_status == "active"
    assert report.provider == "apple_app_store"
    assert report.provider_payment_id == "apple-transaction-123"


@pytest.mark.asyncio
async def test_verify_apple_purchase_rejects_transaction_reuse_across_reports(db_path):
    """An Apple transaction cannot unlock two different reports."""
    from app.services.reports import create_report, unlock_report

    original_report = await create_report("0363010012345678", "Damrak 1", "long", db_path=db_path)
    second_report = await create_report("0363010012345678", "Damrak 1", "long", db_path=db_path)
    await unlock_report(
        original_report,
        provider="apple_app_store",
        provider_payment_id="apple-transaction-123",
        purchased_at="2026-03-23T12:00:00Z",
        db_path=db_path,
    )

    stack, _mock_stripe = _billing_patches(
        db_path,
        extra_settings={
            "apple_enabled": True,
            "apple_bundle_id": "nl.buurtcheck.app.ios",
            "apple_product_id": "full_dossier_unlock",
            "apple_environment": "production",
            "apple_issuer_id": "issuer-123",
            "apple_key_id": "key-123",
            "apple_private_key_pem": "-----BEGIN PRIVATE KEY-----\nTEST\n-----END PRIVATE KEY-----",
            "apple_app_store_id": "1234567890",
        },
    )
    with (
        stack,
        patch(
            "app.api.billing.verify_signed_transaction",
            return_value=SimpleNamespace(
                transaction_id="apple-transaction-123",
                product_id="full_dossier_unlock",
            ),
        ),
        patch(
            "app.api.billing.get_transaction_status",
            new=AsyncMock(
                return_value=SimpleNamespace(
                    transaction_id="apple-transaction-123",
                    product_id="full_dossier_unlock",
                    revoked=False,
                    purchase_date_iso="2026-03-23T12:00:00+00:00",
                )
            ),
        ),
    ):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/billing/apple-app-store/verify",
                json={
                    "report_id": second_report,
                    "signed_transaction_info": "signed-jws-123",
                    "product_id": "full_dossier_unlock",
                },
            )

    assert response.status_code == 409


@pytest.mark.asyncio
async def test_apple_notifications_revoke_entitlement(db_path):
    """Verified Apple refund/revoke notifications revoke entitlement."""
    from app.services.reports import create_report, get_report, unlock_report

    rid = await create_report("0363010012345678", "Damrak 1", "long", db_path=db_path)
    await unlock_report(
        rid,
        provider="apple_app_store",
        provider_payment_id="apple-transaction-123",
        purchased_at="2026-03-23T12:00:00Z",
        db_path=db_path,
    )

    stack, _mock_stripe = _billing_patches(
        db_path,
        extra_settings={
            "apple_enabled": True,
            "apple_bundle_id": "nl.buurtcheck.app.ios",
            "apple_product_id": "full_dossier_unlock",
            "apple_environment": "production",
            "apple_issuer_id": "issuer-123",
            "apple_key_id": "key-123",
            "apple_private_key_pem": "-----BEGIN PRIVATE KEY-----\nTEST\n-----END PRIVATE KEY-----",
            "apple_app_store_id": "1234567890",
        },
    )
    with (
        stack,
        patch(
            "app.api.billing.verify_and_decode_notification",
            return_value=SimpleNamespace(
                notification_uuid="notification-123",
                notification_type="REFUND",
                transaction=SimpleNamespace(transaction_id="apple-transaction-123"),
            ),
        ),
    ):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/billing/apple-app-store/notifications",
                json={"signedPayload": "signed-payload-123"},
            )

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "applied": True}

    report = await get_report(rid, db_path=db_path)
    assert report is not None
    assert report.payment_status == "refunded"
    assert report.entitlement_status == "revoked"


@pytest.mark.asyncio
async def test_apple_notifications_reject_invalid_signed_payload(db_path):
    """Unverified Apple notifications must be rejected."""
    stack, _mock_stripe = _billing_patches(
        db_path,
        extra_settings={
            "apple_enabled": True,
            "apple_bundle_id": "nl.buurtcheck.app.ios",
            "apple_product_id": "full_dossier_unlock",
            "apple_environment": "production",
            "apple_issuer_id": "issuer-123",
            "apple_key_id": "key-123",
            "apple_private_key_pem": "-----BEGIN PRIVATE KEY-----\nTEST\n-----END PRIVATE KEY-----",
            "apple_app_store_id": "1234567890",
        },
    )
    with (
        stack,
        patch(
            "app.api.billing.verify_and_decode_notification",
            side_effect=AppleAppStoreVerificationError("invalid"),
        ),
    ):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/billing/apple-app-store/notifications",
                json={"signedPayload": "invalid-payload"},
            )

    assert response.status_code == 400


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
        rid,
        "paid",
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
        rid,
        "paid",
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
