from fastapi import APIRouter

from app.api.address import fetch_shared_prebid_briefing, fetch_shared_prebid_pack

router = APIRouter(prefix="/shared", tags=["shared"])


@router.get("/prebid/{share_token}")
async def shared_prebid_alias(share_token: str):
    return await fetch_shared_prebid_briefing(share_token)


@router.get("/prebid-pack/{share_token}")
async def shared_prebid_pack_alias(share_token: str):
    return await fetch_shared_prebid_pack(share_token)
