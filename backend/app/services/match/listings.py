from __future__ import annotations

from app.models.match import ListingCriteria, ListingProviderResult
from app.services.match.providers.listings import ListingProvider, MockListingProvider


async def fetch_listing_matches(
    criteria: ListingCriteria,
    provider: ListingProvider | None = None,
) -> ListingProviderResult:
    selected_provider = provider or MockListingProvider()
    return await selected_provider.fetch_listings(criteria)
