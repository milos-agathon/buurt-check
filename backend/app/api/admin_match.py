from fastapi import APIRouter

from app.models.match import MatchAdminHealthResponse, ProviderStatus
from app.services.match.admin import build_admin_health_dashboard
from app.services.match.providers.seed import MVP_REGION_CONFIG_ID, SeedMockImporter

router = APIRouter(prefix="/admin/match", tags=["admin-match"])


@router.get("/health", response_model=MatchAdminHealthResponse)
async def admin_match_health() -> MatchAdminHealthResponse:
    seed = await SeedMockImporter().load_seed_data(MVP_REGION_CONFIG_ID)
    listing_provider = ProviderStatus(
        name="MockListingProvider",
        mode="mock",
        license_status="mock",
        health="mock_only",
        limitations=["Seed listings are examples and not live supply."],
    )
    return build_admin_health_dashboard(
        seed_result=seed,
        listing_provider_status=[listing_provider],
    )
