import pytest

from app.models.match import AnalyticsEvent, NotificationDispatchRecord, ProviderStatus
from app.services.match.admin import build_admin_health_dashboard
from app.services.match.providers.seed import MVP_REGION_CONFIG_ID, SeedMockImporter


@pytest.mark.asyncio
async def test_admin_dashboard_aggregates_data_quality_and_product_metrics():
    seed = await SeedMockImporter().load_seed_data(MVP_REGION_CONFIG_ID)
    listing_provider = ProviderStatus(
        name="MockListingProvider",
        mode="mock",
        license_status="mock",
        health="mock_only",
        limitations=["Seed listings are examples and not live supply."],
    )
    failed_dispatch = NotificationDispatchRecord(
        alert_id="alert_failed",
        provider_name="MockNotificationProvider",
        provider_mode="mock",
        result_status="failed",
        error_code="mock_dispatch_failed",
    )
    analytics_events = [
        AnalyticsEvent(event_name="match_quiz_started", locale="en"),
        AnalyticsEvent(event_name="match_quiz_completed", locale="en"),
        AnalyticsEvent(event_name="match_feedback_submitted", locale="en"),
    ]

    health = build_admin_health_dashboard(
        seed_result=seed,
        listing_provider_status=[listing_provider],
        alert_dispatch_records=[failed_dispatch],
        report_generation_failures=[{"report_id": "report_failed", "error_code": "pdf_failed"}],
        analytics_events=analytics_events,
    )

    assert health.overall_status == "degraded"
    assert health.source_health
    assert health.missing_data
    assert health.stale_data
    assert health.source_failures
    assert health.mock_data_indicators
    assert health.listing_provider_status[0].mode == "mock"
    assert health.alert_dispatcher_status.failures[0].error_code == "mock_dispatch_failed"
    assert health.report_generation_failures[0]["error_code"] == "pdf_failed"
    assert any(metric.event_name == "match_feedback_submitted" for metric in health.success_metrics)


@pytest.mark.asyncio
async def test_admin_health_api_renders_read_only_status_without_user_identifiers(client):
    response = await client.get("/api/admin/match/health")

    assert response.status_code == 200
    body = response.json()
    assert "source_health" in body
    assert "missing_data" in body
    assert "stale_data" in body
    assert "source_failures" in body
    assert "scoring_anomalies" in body
    assert "listing_provider_status" in body
    assert "alert_dispatcher_status" in body
    assert "report_generation_failures" in body
    assert "success_metrics" in body
    assert "session_id" not in str(body)


@pytest.mark.asyncio
async def test_admin_health_api_reflects_configured_listing_provider(client, monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "match_listing_provider_mode", "licensed")
    monkeypatch.setattr(settings, "match_listing_provider_base_url", "https://listings.test")
    monkeypatch.setattr(settings, "match_listing_provider_api_key", "listing-token")

    response = await client.get("/api/admin/match/health")

    assert response.status_code == 200
    provider = response.json()["listing_provider_status"][0]
    assert provider["name"] == "LicensedHttpListingProvider"
    assert provider["mode"] == "licensed"
    assert provider["health"] == "healthy"


@pytest.mark.asyncio
async def test_admin_health_api_reflects_configured_notification_provider(client, monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "match_notification_provider_mode", "email")
    monkeypatch.setattr(settings, "match_notification_provider_base_url", "https://notify.test")
    monkeypatch.setattr(settings, "match_notification_provider_api_key", "notify-token")

    response = await client.get("/api/admin/match/health")

    assert response.status_code == 200
    dispatcher = response.json()["alert_dispatcher_status"]
    assert dispatcher["provider_name"] == "HttpNotificationProvider"
    assert dispatcher["health"] == "healthy"
