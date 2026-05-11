from fastapi import APIRouter

router = APIRouter(prefix="/match", tags=["match"])


@router.get("/health")
async def match_health() -> dict[str, str]:
    return {"status": "foundation_only"}
