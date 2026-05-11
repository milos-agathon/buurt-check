from fastapi import APIRouter

router = APIRouter(prefix="/admin/match", tags=["admin-match"])


@router.get("/health")
async def admin_match_health() -> dict[str, str]:
    return {"status": "foundation_only"}
