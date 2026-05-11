import pytest
from pydantic import ValidationError

from app.models.match import DataFreshnessStatus, ListingCriteria, ProviderStatus
from app.services.match.listings import fetch_listing_matches
from app.services.match.providers.listings import (
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
