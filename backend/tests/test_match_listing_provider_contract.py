import pytest
from pydantic import ValidationError

from app.models.match import DataFreshnessStatus, ListingCriteria, ProviderStatus
from app.services.match.listings import fetch_listing_matches
from app.services.match.providers.listings import (
    LicensedHttpListingProvider,
    MockListingProvider,
    OutboundPlaceholderListingProvider,
    UnavailableListingProvider,
)


def test_listing_provider_status_rejects_scraping_mode():
    with pytest.raises(ValidationError, match="mode"):
        ProviderStatus(
            name="BadProvider",
            mode="scraping",
            license_status="unknown",
            health="failed",
            limitations=["Scraping is not an allowed provider mode."],
        )


@pytest.mark.asyncio
async def test_mock_listing_provider_returns_health_limitations_and_mock_listings():
    provider = MockListingProvider()

    result = await provider.fetch_listings(
        ListingCriteria(
            neighborhood_id="nh_amsterdam_ijburg",
            journey_intent="both",
            budget_max_cents=65000000,
            property_type="apartment",
        )
    )

    assert result.provider.mode == "mock"
    assert result.provider.license_status == "mock"
    assert result.provider.limitations
    assert {listing.journey_intent for listing in result.listings} == {"buy", "rent"}
    assert all(listing.provider_mode == "mock" for listing in result.listings)
    assert all(listing.freshness_status == DataFreshnessStatus.mock for listing in result.listings)
    assert all(listing.limitations for listing in result.listings)


@pytest.mark.asyncio
async def test_mock_listing_provider_reports_unavailable_neighborhood():
    provider = MockListingProvider()

    result = await provider.fetch_listings(
        ListingCriteria(neighborhood_id="nh_unknown", journey_intent="buy")
    )

    assert result.provider.health == "degraded"
    assert result.listings == []
    assert result.unavailable_reason == "neighborhood_not_in_mock_seed"


@pytest.mark.asyncio
async def test_unavailable_and_outbound_placeholder_listing_providers_are_explicit():
    criteria = ListingCriteria(neighborhood_id="nh_amsterdam_ijburg", journey_intent="buy")

    unavailable = await UnavailableListingProvider().fetch_listings(criteria)
    outbound = await OutboundPlaceholderListingProvider().fetch_listings(criteria)

    assert unavailable.provider.mode == "unavailable"
    assert unavailable.unavailable_reason == "listing_provider_unconfigured"
    assert outbound.provider.mode == "outbound_placeholder"
    assert outbound.unavailable_reason == "outbound_placeholder_only"
    assert "scraped" in outbound.provider.limitations[0]


@pytest.mark.asyncio
async def test_listing_service_uses_mock_provider_by_default():
    result = await fetch_listing_matches(
        ListingCriteria(neighborhood_id="nh_amsterdam_ijburg", journey_intent="buy")
    )

    assert result.provider.name == "MockListingProvider"
    assert len(result.listings) == 1


@pytest.mark.asyncio
async def test_licensed_http_listing_provider_maps_configured_response(httpx_mock):
    httpx_mock.add_response(
        method="GET",
        url=(
            "https://listings.test/listings"
            "?neighborhood_id=nh_amsterdam_ijburg"
            "&journey_intent=buy"
            "&budget_max_cents=65000000"
            "&property_type=apartment"
        ),
        json={
            "availability_density": 64,
            "listings": [
                {
                    "provider_listing_id": "licensed-1",
                    "journey_intent": "buy",
                    "property_type": "apartment",
                    "price_cents": 61500000,
                    "bedrooms": 3,
                    "floor_area_m2": 91,
                    "availability_status": "available",
                    "days_on_market": 6,
                    "source_url": "https://provider.test/listings/licensed-1",
                    "freshness_status": "current",
                    "confidence": 82,
                    "limitations": ["Licensed partner feed, no scraping."],
                }
            ],
        },
    )
    provider = LicensedHttpListingProvider(
        base_url="https://listings.test",
        api_key="listing-token",
    )

    result = await provider.fetch_listings(
        ListingCriteria(
            neighborhood_id="nh_amsterdam_ijburg",
            journey_intent="buy",
            budget_max_cents=65000000,
            property_type="apartment",
        )
    )

    assert result.provider.name == "LicensedHttpListingProvider"
    assert result.provider.mode == "licensed"
    assert result.provider.health == "healthy"
    assert result.availability_density == 64
    assert result.listings[0].provider_mode == "licensed"
    assert result.listings[0].provider_listing_id == "licensed-1"
    assert result.listings[0].freshness_status == DataFreshnessStatus.current
    request = httpx_mock.get_request()
    assert request is not None
    assert request.headers["Authorization"] == "Bearer listing-token"


@pytest.mark.asyncio
async def test_licensed_http_listing_provider_preserves_low_confidence_and_missing_freshness(
    httpx_mock,
):
    httpx_mock.add_response(
        method="GET",
        json={
            "availability_density": 10,
            "listings": [
                {
                    "provider_listing_id": "licensed-low-confidence",
                    "journey_intent": "buy",
                    "price_cents": 61500000,
                    "availability_status": "available",
                    "confidence": 0,
                    "limitations": ["Provider omitted freshness metadata."],
                }
            ],
        },
    )
    provider = LicensedHttpListingProvider(
        base_url="https://listings.test",
        api_key="listing-token",
    )

    result = await provider.fetch_listings(
        ListingCriteria(neighborhood_id="nh_amsterdam_ijburg", journey_intent="buy")
    )

    assert result.provider.health == "healthy"
    assert result.listings[0].provider_listing_id == "licensed-low-confidence"
    assert result.listings[0].freshness_status == DataFreshnessStatus.unavailable
    assert result.listings[0].confidence == 0


@pytest.mark.asyncio
async def test_licensed_http_listing_provider_rejects_items_without_provider_identity(
    httpx_mock,
):
    httpx_mock.add_response(
        method="GET",
        json={
            "availability_density": 10,
            "listings": [
                {
                    "journey_intent": "buy",
                    "price_cents": 61500000,
                    "availability_status": "available",
                    "freshness_status": "current",
                    "confidence": 80,
                    "limitations": ["Missing provider listing identifier."],
                }
            ],
        },
    )
    provider = LicensedHttpListingProvider(
        base_url="https://listings.test",
        api_key="listing-token",
    )

    result = await provider.fetch_listings(
        ListingCriteria(neighborhood_id="nh_amsterdam_ijburg", journey_intent="buy")
    )

    assert result.provider.health == "failed"
    assert result.listings == []
    assert result.unavailable_reason == "listing_provider_failed:ValidationError"


@pytest.mark.asyncio
async def test_listing_service_uses_configured_licensed_provider(monkeypatch, httpx_mock):
    from app.config import settings

    monkeypatch.setattr(settings, "match_listing_provider_mode", "licensed")
    monkeypatch.setattr(settings, "match_listing_provider_base_url", "https://listings.test")
    monkeypatch.setattr(settings, "match_listing_provider_api_key", "listing-token")
    httpx_mock.add_response(
        method="GET",
        json={"availability_density": 0, "listings": []},
    )

    result = await fetch_listing_matches(
        ListingCriteria(neighborhood_id="nh_amsterdam_ijburg", journey_intent="buy")
    )

    assert result.provider.name == "LicensedHttpListingProvider"
    assert result.provider.mode == "licensed"
