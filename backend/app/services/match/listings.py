from __future__ import annotations

from app.config import settings
from app.models.match import ListingCriteria, ListingProviderResult
from app.services.match.providers.listings import (
    LicensedHttpListingProvider,
    ListingProvider,
    MockListingProvider,
    OutboundPlaceholderListingProvider,
    UnavailableListingProvider,
)


def _configured_provider() -> ListingProvider:
    mode = settings.match_listing_provider_mode
    if (
        mode == "licensed"
        and settings.match_listing_provider_base_url
        and settings.match_listing_provider_api_key
    ):
        return LicensedHttpListingProvider(
            base_url=settings.match_listing_provider_base_url,
            api_key=settings.match_listing_provider_api_key,
        )
    if mode == "outbound_placeholder":
        return OutboundPlaceholderListingProvider()
    if mode in {"unavailable", "scraping"}:
        return UnavailableListingProvider()
    return MockListingProvider()


async def fetch_listing_matches(
    criteria: ListingCriteria,
    provider: ListingProvider | None = None,
) -> ListingProviderResult:
    selected_provider = provider or _configured_provider()
    return await selected_provider.fetch_listings(criteria)
