from __future__ import annotations

from typing import Protocol

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
                    freshness_status=DataFreshnessStatus.mock,
                    confidence=55,
                    limitations=["MOCK DATA: rent listing is an example, not live supply."],
                )
            )

        return ListingProviderResult(provider=self.status(), listings=listings)


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
            unavailable_reason="outbound_placeholder_only",
        )
