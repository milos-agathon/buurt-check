from app.config import settings
from app.services.match.providers.listings import configured_listing_provider_status
from app.services.match.providers.notifications import notification_provider_placeholder_status
from app.services.match.providers.official import official_provider_placeholder_status


def test_match_provider_placeholders_are_optional_and_unconfigured_by_default():
    official = official_provider_placeholder_status()
    listing = configured_listing_provider_status()
    notification = notification_provider_placeholder_status()

    assert settings.match_official_data_provider_base_url == ""
    assert official.health == "unconfigured"
    assert listing.mode in {"mock", "unavailable"}
    assert notification["provider_mode"] == "mock"


def test_match_listing_provider_placeholder_rejects_scraping_mode(monkeypatch):
    monkeypatch.setattr(settings, "match_listing_provider_mode", "scraping")

    status = configured_listing_provider_status()

    assert status.mode == "unavailable"
    assert status.health == "mock_only"
