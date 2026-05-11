import pytest

from app.models.match import AlertRule
from app.services.match.providers.notifications import MockNotificationProvider


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

