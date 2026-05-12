import pytest

from app.models.match import AlertRule, Listing
from app.services.match.providers.notifications import (
    HttpNotificationProvider,
    MockNotificationProvider,
)


@pytest.mark.asyncio
async def test_mock_notification_provider_records_intended_send_without_email():
    provider = MockNotificationProvider()
    alert = AlertRule(
        alert_id="alert_test",
        session_id="anon_alert",
        neighborhood_ids=["nh_amsterdam_ijburg"],
        journey_intent="buy",
        budget_max_cents=65000000,
        property_types=["apartment"],
        notification_type="mock",
        status="active",
    )

    dispatch = await provider.dispatch(alert, [])

    assert dispatch.alert_id == "alert_test"
    assert dispatch.provider_name == "MockNotificationProvider"
    assert dispatch.provider_mode == "mock"
    assert dispatch.result_status == "recorded"
    assert dispatch.listing_ids == []


@pytest.mark.asyncio
async def test_mock_notification_provider_exposes_failure_records():
    provider = MockNotificationProvider(force_failure=True)
    alert = AlertRule(
        alert_id="alert_failure",
        session_id="anon_alert",
        neighborhood_ids=["nh_amsterdam_ijburg"],
        journey_intent="rent",
        rent_max_cents=250000,
        property_types=["apartment"],
        notification_type="mock",
        status="active",
    )

    dispatch = await provider.dispatch(alert, [])

    assert dispatch.result_status == "failed"
    assert dispatch.error_code == "mock_notification_failed"


@pytest.mark.asyncio
async def test_http_notification_provider_sends_destination_safe_payload(httpx_mock):
    httpx_mock.add_response(
        method="POST",
        url="https://notify.test/dispatch",
        json={"status": "sent"},
    )
    provider = HttpNotificationProvider(
        mode="email",
        base_url="https://notify.test",
        api_key="notify-token",
    )
    alert = AlertRule(
        alert_id="alert_email",
        session_id="anon_alert",
        neighborhood_ids=["nh_amsterdam_ijburg"],
        journey_intent="buy",
        budget_max_cents=65000000,
        property_types=["apartment"],
        notification_type="email",
        notification_destination_hash="hashed-destination",
        status="active",
    )
    listing = Listing(
        listing_id="listing_licensed",
        provider_name="LicensedHttpListingProvider",
        provider_mode="licensed",
        license_status="licensed",
        neighborhood_id="nh_amsterdam_ijburg",
        journey_intent="buy",
        property_type="apartment",
        price_cents=61500000,
        availability_status="available",
        freshness_status="current",
        confidence=82,
        limitations=["Licensed partner feed, no scraping."],
    )

    dispatch = await provider.dispatch(alert, [listing])

    assert dispatch.provider_name == "HttpNotificationProvider"
    assert dispatch.provider_mode == "email"
    assert dispatch.result_status == "sent"
    assert dispatch.listing_ids == ["listing_licensed"]
    request = httpx_mock.get_request()
    assert request is not None
    assert request.headers["Authorization"] == "Bearer notify-token"
    body = request.read().decode("utf-8")
    assert "hashed-destination" in body
    assert "anon_alert@example" not in body
