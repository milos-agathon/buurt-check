from fastapi import APIRouter

from app.models.match import MatchAdminHealthResponse
from app.services.match.admin import build_admin_health_dashboard
from app.services.match.providers.listings import configured_listing_provider_status
from app.services.match.providers.notifications import notification_provider_placeholder_status
from app.services.match.providers.seed import MVP_REGION_CONFIG_ID, SeedMockImporter

router = APIRouter(prefix="/admin/match", tags=["admin-match"])


@router.get("/health", response_model=MatchAdminHealthResponse)
async def admin_match_health() -> MatchAdminHealthResponse:
    seed = await SeedMockImporter().load_seed_data(MVP_REGION_CONFIG_ID)
    return build_admin_health_dashboard(
        seed_result=seed,
        listing_provider_status=[configured_listing_provider_status()],
        notification_provider_status=notification_provider_placeholder_status(),
    )
