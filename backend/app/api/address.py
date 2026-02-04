from fastapi import APIRouter, HTTPException, Path, Query

from app.cache.redis import cache_get, cache_set
from app.config import settings
from app.models.address import ResolvedAddress, SuggestResponse
from app.models.building import BuildingFactsResponse
from app.services import bag, locatieserver

router = APIRouter(prefix="/address", tags=["address"])


@router.get("/suggest", response_model=SuggestResponse)
async def address_suggest(
    q: str = Query(..., min_length=2, description="Search query"),
    limit: int = Query(7, ge=1, le=20, description="Max results"),
):
    """Autocomplete address suggestions from PDOK Locatieserver."""
    cache_key = f"suggest:{q}:{limit}"
    cached = await cache_get(cache_key)
    if cached is not None:
        return SuggestResponse(
            suggestions=[
                locatieserver.AddressSuggestion(**s) for s in cached
            ]
        )

    try:
        suggestions = await locatieserver.suggest(q, limit)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Locatieserver unavailable: {exc}") from exc

    await cache_set(
        cache_key,
        [s.model_dump() for s in suggestions],
        ttl=settings.cache_ttl_suggest,
    )
    return SuggestResponse(suggestions=suggestions)


@router.get("/lookup", response_model=ResolvedAddress)
async def address_lookup(
    id: str = Query(..., description="Locatieserver document ID"),
):
    """Resolve a locatieserver suggestion to full address details."""
    cache_key = f"lookup:{id}"
    cached = await cache_get(cache_key)
    if cached is not None:
        return ResolvedAddress(**cached)

    try:
        resolved = await locatieserver.lookup(id)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Locatieserver unavailable: {exc}") from exc

    if resolved is None:
        raise HTTPException(status_code=404, detail="Address not found")

    await cache_set(cache_key, resolved.model_dump(), ttl=settings.cache_ttl_lookup)
    return resolved


@router.get("/{vbo_id}/building", response_model=BuildingFactsResponse)
async def building_facts(
    vbo_id: str = Path(..., pattern=r"^[0-9]{16}$"),
):
    """Fetch building facts from BAG for a verblijfsobject."""
    cache_key = f"building:{vbo_id}"
    cached = await cache_get(cache_key)
    if cached is not None:
        return BuildingFactsResponse(**cached)

    try:
        facts = await bag.get_building_facts(vbo_id)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=502, detail=f"BAG API unavailable: {exc}"
        ) from exc

    if facts is None:
        return BuildingFactsResponse(
            address_id=vbo_id,
            building=None,
            message="No building found for this address",
        )

    response = BuildingFactsResponse(address_id=vbo_id, building=facts)
    await cache_set(cache_key, response.model_dump(), ttl=settings.cache_ttl_building)
    return response
