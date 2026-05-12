from __future__ import annotations

from typing import Protocol

import httpx
from pydantic import BaseModel, Field, model_validator

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
    if mode == "scraping":
        return ProviderStatus(
            name="UnavailableListingProvider",
            mode="unavailable",
            license_status="unavailable",
            health="unconfigured",
            limitations=[
                "Scraping provider mode is rejected; use licensed, mock, "
                "user-provided, or outbound placeholder modes.",
            ],
        )
    if mode not in ALLOWED_LISTING_PROVIDER_MODES:
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
    if mode == "licensed" and configured:
        return ProviderStatus(
            name="LicensedHttpListingProvider",
            mode="licensed",
            license_status="licensed",
            health="healthy",
            limitations=[
                "Licensed listing feed is configured; scraping is not supported.",
            ],
        )
    return ProviderStatus(
        name="LicensedListingProviderPlaceholder",
        mode=mode,  # type: ignore[arg-type]
        license_status="licensed"
        if mode == "licensed"
        else "mock"
        if mode == "mock"
        else "unavailable",
        health="mock_only"
        if mode == "mock"
        else "unconfigured"
        if mode == "unavailable"
        else "degraded",
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


class LicensedListingPayload(BaseModel):
    provider_listing_id: str | None = Field(default=None, min_length=1)
    listing_id: str | None = Field(default=None, min_length=1)
    neighborhood_id: str | None = None
    journey_intent: str | None = None
    property_type: str | None = None
    price_cents: int | None = Field(default=None, ge=0)
    rent_cents: int | None = Field(default=None, ge=0)
    bedrooms: int | None = Field(default=None, ge=0)
    floor_area_m2: float | None = Field(default=None, ge=0)
    availability_status: str = "unknown"
    days_on_market: int | None = Field(default=None, ge=0)
    source_url: str | None = None
    freshness_status: DataFreshnessStatus = DataFreshnessStatus.unavailable
    confidence: int = Field(default=0, ge=0, le=100)
    limitations: list[str] = Field(
        default_factory=lambda: [
            "Licensed partner feed; availability should be verified with the provider.",
        ],
        min_length=1,
    )

    @model_validator(mode="after")
    def require_provider_identity(self) -> "LicensedListingPayload":
        if not self.provider_listing_id and not self.listing_id:
            raise ValueError("licensed listing requires provider_listing_id or listing_id")
        return self


class LicensedHttpListingProvider:
    name = "LicensedHttpListingProvider"
    mode = "licensed"

    def __init__(
        self,
        *,
        base_url: str,
        api_key: str,
        timeout_seconds: float = 10.0,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.timeout_seconds = timeout_seconds

    def status(self, *, health: str = "healthy") -> ProviderStatus:
        return ProviderStatus(
            name=self.name,
            mode="licensed",
            license_status="licensed",
            health=health,  # type: ignore[arg-type]
            limitations=[
                "Licensed listing feed; no scraping or inferred availability claims.",
            ],
        )

    def _listing_from_provider_payload(
        self,
        payload: dict[str, object],
        criteria: ListingCriteria,
    ) -> Listing:
        provider_payload = LicensedListingPayload.model_validate(payload)
        provider_listing_id = str(
            provider_payload.provider_listing_id or provider_payload.listing_id
        )
        listing_id = provider_payload.listing_id or f"listing_licensed_{provider_listing_id}"
        journey_intent = provider_payload.journey_intent or criteria.journey_intent
        if journey_intent == "both":
            raise ValueError("licensed listing requires buy or rent journey_intent")
        return Listing(
            listing_id=listing_id,
            provider_listing_id=provider_listing_id,
            provider_name=self.name,
            provider_mode="licensed",
            license_status="licensed",
            neighborhood_id=provider_payload.neighborhood_id or criteria.neighborhood_id,
            journey_intent=journey_intent,  # type: ignore[arg-type]
            property_type=provider_payload.property_type,
            price_cents=provider_payload.price_cents,
            rent_cents=provider_payload.rent_cents,
            bedrooms=provider_payload.bedrooms,
            floor_area_m2=provider_payload.floor_area_m2,
            availability_status=provider_payload.availability_status,  # type: ignore[arg-type]
            days_on_market=provider_payload.days_on_market,
            source_url=provider_payload.source_url,  # type: ignore[arg-type]
            freshness_status=provider_payload.freshness_status,
            confidence=provider_payload.confidence,
            limitations=provider_payload.limitations,
        )

    async def fetch_listings(self, criteria: ListingCriteria) -> ListingProviderResult:
        params: dict[str, str | int] = {
            "neighborhood_id": criteria.neighborhood_id,
            "journey_intent": criteria.journey_intent,
        }
        if criteria.budget_max_cents is not None:
            params["budget_max_cents"] = criteria.budget_max_cents
        if criteria.rent_max_cents is not None:
            params["rent_max_cents"] = criteria.rent_max_cents
        if criteria.property_type:
            params["property_type"] = criteria.property_type

        try:
            async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
                response = await client.get(
                    f"{self.base_url}/listings",
                    params=params,
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Accept": "application/json",
                    },
                )
                response.raise_for_status()
            payload = response.json()
            raw_listings = payload.get("listings", [])
            listings = [
                self._listing_from_provider_payload(item, criteria)
                for item in raw_listings
                if isinstance(item, dict)
            ]
            return ListingProviderResult(
                provider=self.status(),
                listings=listings,
                availability_density=payload.get("availability_density"),
            )
        except Exception as exc:
            return ListingProviderResult(
                provider=self.status(health="failed"),
                listings=[],
                availability_density=None,
                unavailable_reason=f"listing_provider_failed:{exc.__class__.__name__}",
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
