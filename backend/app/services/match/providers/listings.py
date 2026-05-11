from __future__ import annotations

from typing import Protocol

from app.config import settings
from app.models.match import (
    DataFreshnessStatus,
    Listing,
    ListingCriteria,
    ListingProviderResult,
    ProviderStatus,
)

ALLOWED_LISTING_PROVIDER_MODES = {
    "licensed",
    "mock",
    "user_provided",
    "outbound_placeholder",
    "unavailable",
}


def configured_listing_provider_status() -> ProviderStatus:
    mode = settings.match_listing_provider_mode
    if mode == "scraping" or mode not in ALLOWED_LISTING_PROVIDER_MODES:
        mode = "unavailable"
    configured = bool(
        settings.match_listing_provider_base_url
        and settings.match_listing_provider_api_key
    )
    if mode == "licensed" and not configured:
        return ProviderStatus(
            name="LicensedListingProviderPlaceholder",
            mode="unavailable",
            license_status="unavailable",
            health="unconfigured",
            limitations=["Licensed listing provider credentials are not configured."],
        )
    return ProviderStatus(
        name="LicensedListingProviderPlaceholder",
        mode=mode,  # type: ignore[arg-type]
        license_status="licensed"
        if mode == "licensed"
        else "unavailable"
        if mode == "unavailable"
        else "mock",
        health="degraded" if mode == "licensed" else "mock_only",
        limitations=[
            "Provider placeholder enforces licensed/mock modes only; scraping is not supported.",
        ],
    )


class ListingProvider(Protocol):
    name: str
    mode: str

    async def fetch_listings(self, criteria: ListingCriteria) -> ListingProviderResult:
        ...

    def status(self) -> ProviderStatus:
        ...


class MockListingProvider:
    name = "MockListingProvider"
    mode = "mock"

    def status(self, *, health: str = "mock_only") -> ProviderStatus:
        return ProviderStatus(
            name=self.name,
            mode="mock",
            license_status="mock",
            health=health,
            limitations=["MOCK DATA: example listings are not live market supply."],
        )

    async def fetch_listings(self, criteria: ListingCriteria) -> ListingProviderResult:
        if criteria.neighborhood_id not in {"nh_amsterdam_ijburg", "nh_utrecht_leidsche_rijn"}:
            return ListingProviderResult(
                provider=self.status(health="degraded"),
                listings=[],
                availability_density=None,
                unavailable_reason="neighborhood_not_in_mock_seed",
            )

        listings: list[Listing] = []
        if criteria.journey_intent in {"buy", "both"}:
            listings.append(
                Listing(
                    listing_id=f"listing_mock_{criteria.neighborhood_id}_buy",
                    provider_name=self.name,
                    provider_mode="mock",
                    license_status="mock",
                    neighborhood_id=criteria.neighborhood_id,
                    journey_intent="buy",
                    property_type=criteria.property_type or "apartment",
                    price_cents=57500000,
                    bedrooms=3,
                    floor_area_m2=92,
                    availability_status="available",
                    days_on_market=18,
                    freshness_status=DataFreshnessStatus.mock,
                    confidence=55,
                    limitations=["MOCK DATA: buy listing is an example, not live supply."],
                )
            )
        if criteria.journey_intent in {"rent", "both"}:
            listings.append(
                Listing(
                    listing_id=f"listing_mock_{criteria.neighborhood_id}_rent",
                    provider_name=self.name,
                    provider_mode="mock",
                    license_status="mock",
                    neighborhood_id=criteria.neighborhood_id,
                    journey_intent="rent",
                    property_type=criteria.property_type or "apartment",
                    rent_cents=215000,
                    bedrooms=2,
                    floor_area_m2=76,
                    availability_status="available",
                    days_on_market=9,
                    freshness_status=DataFreshnessStatus.mock,
                    confidence=55,
                    limitations=["MOCK DATA: rent listing is an example, not live supply."],
                )
            )

        filtered = [
            listing
            for listing in listings
            if (
                listing.journey_intent != "buy"
                or criteria.budget_max_cents is None
                or listing.price_cents is None
                or listing.price_cents <= criteria.budget_max_cents
            )
            and (
                listing.journey_intent != "rent"
                or criteria.rent_max_cents is None
                or listing.rent_cents is None
                or listing.rent_cents <= criteria.rent_max_cents
            )
        ]

        return ListingProviderResult(
            provider=self.status(),
            listings=filtered,
            availability_density=min(100, len(filtered) * 35),
        )


class UnavailableListingProvider:
    name = "UnavailableListingProvider"
    mode = "unavailable"

    def status(self) -> ProviderStatus:
        return ProviderStatus(
            name=self.name,
            mode="unavailable",
            license_status="unavailable",
            health="unconfigured",
            limitations=["No licensed listing provider is configured."],
        )

    async def fetch_listings(self, criteria: ListingCriteria) -> ListingProviderResult:
        return ListingProviderResult(
            provider=self.status(),
            listings=[],
            availability_density=None,
            unavailable_reason="listing_provider_unconfigured",
        )


class OutboundPlaceholderListingProvider:
    name = "OutboundPlaceholderListingProvider"
    mode = "outbound_placeholder"

    def status(self) -> ProviderStatus:
        return ProviderStatus(
            name=self.name,
            mode="outbound_placeholder",
            license_status="unknown",
            health="degraded",
            limitations=["Outbound placeholders contain no scraped listing data."],
        )

    async def fetch_listings(self, criteria: ListingCriteria) -> ListingProviderResult:
        return ListingProviderResult(
            provider=self.status(),
            listings=[],
            availability_density=None,
            unavailable_reason="outbound_placeholder_only",
        )
