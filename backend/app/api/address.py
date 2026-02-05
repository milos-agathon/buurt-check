import logging

from fastapi import APIRouter, HTTPException, Path, Query

from app.cache.redis import cache_get, cache_set
from app.config import settings
from app.models.address import ResolvedAddress, SuggestResponse
from app.models.building import BuildingFactsResponse
from app.models.neighborhood3d import Neighborhood3DResponse
from app.models.risk import RiskCardsResponse, RiskLevel
from app.services import bag, locatieserver, risk_cards, three_d_bag

logger = logging.getLogger(__name__)

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


@router.get("/{vbo_id}/neighborhood3d", response_model=Neighborhood3DResponse)
async def neighborhood_3d(
    vbo_id: str = Path(..., pattern=r"^[0-9]{16}$"),
    pand_id: str = Query(..., pattern=r"^[0-9]{16}$"),
    rd_x: float = Query(...),
    rd_y: float = Query(...),
    lat: float = Query(...),
    lng: float = Query(...),
):
    """Fetch 3D neighborhood building data from 3DBAG."""
    cache_key = f"neighborhood3d:{pand_id}:{rd_x:.0f}:{rd_y:.0f}"
    cached = await cache_get(cache_key)
    if cached is not None:
        return Neighborhood3DResponse(**cached)

    try:
        result = await three_d_bag.get_neighborhood_3d(
            pand_id=pand_id, rd_x=rd_x, rd_y=rd_y, lat=lat, lng=lng,
            vbo_id=vbo_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=502, detail=f"3DBAG API unavailable: {exc}"
        ) from exc

    if result.buildings:
        await cache_set(
            cache_key, result.model_dump(), ttl=settings.cache_ttl_neighborhood_3d,
        )
    return result


@router.get("/{vbo_id}/risks", response_model=RiskCardsResponse)
async def address_risk_cards(
    vbo_id: str = Path(..., pattern=r"^[0-9]{16}$"),
    rd_x: float = Query(...),
    rd_y: float = Query(...),
    lat: float = Query(...),
    lng: float = Query(...),
):
    """Fetch F3 risk cards (noise, air quality, climate stress)."""
    cache_key = f"risks:{vbo_id}:{rd_x:.0f}:{rd_y:.0f}"
    cached = await cache_get(cache_key)
    if cached is not None:
        logger.info("risk_cards cache_hit vbo=%s", vbo_id)
        return RiskCardsResponse(**cached)

    try:
        result = await risk_cards.get_risk_cards(
            vbo_id=vbo_id,
            rd_x=rd_x,
            rd_y=rd_y,
            lat=lat,
            lng=lng,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Risk card data sources unavailable") from exc

    has_data = (
        result.noise.level != RiskLevel.unavailable
        or result.air_quality.level != RiskLevel.unavailable
        or result.climate_stress.level != RiskLevel.unavailable
    )
    failure_messages = {
        "NOISE_LAYER_UNAVAILABLE",
        "NOISE_LOOKUP_FAILED",
        "AIR_LOOKUP_FAILED",
        "CLIMATE_LOOKUP_FAILED",
    }
    has_failure = any(
        msg in failure_messages
        for msg in (
            result.noise.message,
            result.air_quality.message,
            result.climate_stress.message,
        )
        if msg
    )
    if has_data and not has_failure:
        await cache_set(
            cache_key,
            result.model_dump(),
            ttl=settings.cache_ttl_risk_cards,
        )
        logger.info("risk_cards cache_set vbo=%s", vbo_id)
    return result
