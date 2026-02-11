import base64
import logging

from fastapi import APIRouter, HTTPException, Path, Query
from fastapi.responses import Response

from app.cache.redis import cache_get, cache_set
from app.config import settings
from app.models.address import ResolvedAddress, SuggestResponse
from app.models.building import BuildingFactsResponse
from app.models.mapillary import MapillaryResponse
from app.models.neighborhood import NeighborhoodStatsResponse, UrbanizationLevel
from app.models.neighborhood3d import Neighborhood3DResponse
from app.models.risk import (
    RiskCardsResponse,
    RiskComparisonsResponse,
    RiskLevel,
    ViewingQuestionsResponse,
)
from app.models.tier_b import TierBResponse
from app.services import (
    bag,
    cbs,
    locatieserver,
    mapillary,
    risk_cards,
    three_d_bag,
    tier_b,
    wms_tile,
)
from app.services.pdf_export import generate_full_dossier, generate_quick_brief
from app.services.risk_comparisons import build_risk_comparisons
from app.services.viewing_questions import build_viewing_questions

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


VALID_TILE_TYPES = {"noise", "air_quality", "climate"}


@router.get("/wms-tile")
async def wms_tile_proxy(
    type: str = Query(..., description="Tile type: noise, air_quality, or climate"),
    rd_x: float = Query(..., description="RD X coordinate"),
    rd_y: float = Query(..., description="RD Y coordinate"),
):
    """Proxy WMS GetMap tiles to avoid CORS issues in the browser."""
    if type not in VALID_TILE_TYPES:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid tile type '{type}'. "
            f"Must be one of: {', '.join(sorted(VALID_TILE_TYPES))}",
        )

    cache_key = f"wms_tile:{type}:{rd_x:.0f}:{rd_y:.0f}"
    cached = await cache_get(cache_key)
    if cached is not None:
        tile_bytes = base64.b64decode(cached)
        return Response(content=tile_bytes, media_type="image/png")

    tile_bytes = await wms_tile.get_wms_tile(type, rd_x, rd_y)
    if tile_bytes is None:
        return Response(status_code=204)

    encoded = base64.b64encode(tile_bytes).decode()
    await cache_set(cache_key, encoded, ttl=settings.cache_ttl_wms_tile)
    return Response(content=tile_bytes, media_type="image/png")


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


@router.get("/{vbo_id}/building3d", response_model=Neighborhood3DResponse)
async def building_3d(
    vbo_id: str = Path(..., pattern=r"^[0-9]{16}$"),
    pand_id: str = Query(..., pattern=r"^[0-9]{16}$"),
    rd_x: float = Query(...),
    rd_y: float = Query(...),
    lat: float = Query(...),
    lng: float = Query(...),
):
    """Fast Phase 1: fetch only the target building (~2s, no bbox)."""
    cache_key = f"building3d:{pand_id}"
    cached = await cache_get(cache_key)
    if cached is not None:
        return Neighborhood3DResponse(**cached)

    try:
        result = await three_d_bag.get_target_building_3d(
            pand_id=pand_id, rd_x=rd_x, rd_y=rd_y, lat=lat, lng=lng,
            vbo_id=vbo_id,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=502, detail=f"3DBAG API unavailable: {exc}"
        ) from exc

    if result.buildings:
        await cache_set(
            cache_key, result.model_dump(), ttl=settings.cache_ttl_building,
        )
    return result


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
    # v12: fast neighborhood payload (no context LoD 2.2 enrichment by default).
    cache_key = f"neighborhood3d:v12:{pand_id}:{rd_x:.0f}:{rd_y:.0f}"
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

    is_partial = bool(result.message and result.message.startswith("Partial neighborhood data"))
    if result.buildings and result.target_pand_id is not None and not is_partial:
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


@router.get("/{vbo_id}/neighborhood", response_model=NeighborhoodStatsResponse)
async def neighborhood_stats(
    vbo_id: str = Path(..., pattern=r"^[0-9]{16}$"),
    lat: float = Query(...),
    lng: float = Query(...),
    buurt_code: str | None = Query(None),
):
    """Fetch CBS neighborhood statistics for an address."""
    cache_key = (
        f"neighborhood:{buurt_code}"
        if buurt_code
        else f"neighborhood:{lat:.4f}:{lng:.4f}"
    )
    cached = await cache_get(cache_key)
    if cached is not None:
        return NeighborhoodStatsResponse(**cached)

    try:
        result = await cbs.get_neighborhood_stats(
            vbo_id=vbo_id,
            lat=lat,
            lng=lng,
            buurt_code=buurt_code,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=502, detail="CBS API unavailable"
        ) from exc

    if result.stats is not None and result.message is None:
        await cache_set(
            cache_key,
            result.model_dump(),
            ttl=settings.cache_ttl_neighborhood,
        )
    return result


@router.get("/{vbo_id}/risk-comparisons", response_model=RiskComparisonsResponse)
async def risk_comparisons(
    vbo_id: str = Path(..., pattern=r"^[0-9]{16}$"),
    rd_x: float = Query(...),
    rd_y: float = Query(...),
    lat: float = Query(...),
    lng: float = Query(...),
    buurt_code: str | None = Query(None),
):
    """Return data-driven comparison rows for risk detail views."""
    cache_key_risks = f"risks:{vbo_id}:{rd_x:.0f}:{rd_y:.0f}"
    cached_risks = await cache_get(cache_key_risks)
    if cached_risks is not None:
        risk_result = RiskCardsResponse(**cached_risks)
    else:
        try:
            risk_result = await risk_cards.get_risk_cards(
                vbo_id=vbo_id,
                rd_x=rd_x,
                rd_y=rd_y,
                lat=lat,
                lng=lng,
            )
        except Exception as exc:
            raise HTTPException(
                status_code=502,
                detail="Risk card data sources unavailable",
            ) from exc

    urbanization = UrbanizationLevel.unknown
    cache_key_neighborhood = (
        f"neighborhood:{buurt_code}"
        if buurt_code
        else f"neighborhood:{lat:.4f}:{lng:.4f}"
    )
    cached_neighborhood = await cache_get(cache_key_neighborhood)
    if cached_neighborhood is not None:
        neighborhood_result = NeighborhoodStatsResponse(**cached_neighborhood)
        if neighborhood_result.stats is not None:
            urbanization = neighborhood_result.stats.urbanization
    else:
        try:
            neighborhood_result = await cbs.get_neighborhood_stats(
                vbo_id=vbo_id,
                lat=lat,
                lng=lng,
                buurt_code=buurt_code,
            )
            if neighborhood_result.stats is not None and neighborhood_result.message is None:
                await cache_set(
                    cache_key_neighborhood,
                    neighborhood_result.model_dump(),
                    ttl=settings.cache_ttl_neighborhood,
                )
            if neighborhood_result.stats is not None:
                urbanization = neighborhood_result.stats.urbanization
        except Exception:
            logger.warning("Failed to fetch neighborhood stats for risk comparisons")

    return build_risk_comparisons(
        vbo_id=vbo_id,
        cards=risk_result,
        urbanization=urbanization,
    )


@router.get(
    "/{vbo_id}/viewing-questions", response_model=ViewingQuestionsResponse
)
async def viewing_questions(
    vbo_id: str = Path(..., pattern=r"^[0-9]{16}$"),
    rd_x: float = Query(...),
    rd_y: float = Query(...),
    lat: float = Query(...),
    lng: float = Query(...),
    street: str | None = Query(None, description="Street name for contextualized questions"),
    city: str | None = Query(None, description="City name for contextualized questions"),
):
    """Generate viewing questions based on risk card scores.

    Fetches risk cards, filters categories with score < 70 (moderate or worse),
    and returns structured bilingual questions grouped by category.
    """
    # Re-use cached risk cards if available
    cache_key = f"risks:{vbo_id}:{rd_x:.0f}:{rd_y:.0f}"
    cached = await cache_get(cache_key)
    if cached is not None:
        risk_result = RiskCardsResponse(**cached)
    else:
        try:
            risk_result = await risk_cards.get_risk_cards(
                vbo_id=vbo_id,
                rd_x=rd_x,
                rd_y=rd_y,
                lat=lat,
                lng=lng,
            )
        except Exception as exc:
            raise HTTPException(
                status_code=502, detail="Risk card data sources unavailable"
            ) from exc

    return build_viewing_questions(vbo_id, risk_result, street=street, city=city)


@router.get("/{vbo_id}/tier-b", response_model=TierBResponse)
async def tier_b_signals(
    vbo_id: str = Path(..., pattern=r"^[0-9]{16}$"),
    buurt_code: str | None = Query(None),
    postcode: str | None = Query(None),
    house_number: str | None = Query(None),
    house_letter: str | None = Query(None),
    addition: str | None = Query(None),
):
    """Fetch Tier-B signals: energy label + crime context."""
    cache_key = (
        f"tier-b:{vbo_id}:{buurt_code or '-'}:{postcode or '-'}:{house_number or '-'}"
        f":{house_letter or '-'}:{addition or '-'}"
    )
    cached = await cache_get(cache_key)
    if cached is not None:
        return TierBResponse(**cached)

    try:
        result = await tier_b.get_tier_b_data(
            vbo_id=vbo_id,
            buurt_code=buurt_code,
            postcode=postcode,
            house_number=house_number,
            house_letter=house_letter,
            addition=addition,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail="Tier-B data sources unavailable",
        ) from exc

    has_any_data = bool(
        result.energy_label.label
        or result.crime.total_per_1000 is not None
        or result.crime.monthly_total_per_1000 is not None
    )
    if has_any_data:
        await cache_set(cache_key, result.model_dump(), ttl=settings.cache_ttl_tier_b)
    return result


@router.get("/{vbo_id}/mapillary", response_model=MapillaryResponse)
async def mapillary_street_view(
    vbo_id: str = Path(..., pattern=r"^[0-9]{16}$"),
    lat: float = Query(...),
    lng: float = Query(...),
):
    """Fetch Tier-B Mapillary street-level image nearest to the selected address."""
    cache_key = f"mapillary:{vbo_id}:{lat:.5f}:{lng:.5f}"
    cached = await cache_get(cache_key)
    if cached is not None:
        return MapillaryResponse(**cached)

    try:
        result = await mapillary.get_street_view(vbo_id=vbo_id, lat=lat, lng=lng)
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail="Mapillary data source unavailable",
        ) from exc

    cacheable_no_image = {"MAPILLARY_NO_IMAGE", "MAPILLARY_TOKEN_MISSING"}
    if result.image is not None or result.message in cacheable_no_image:
        await cache_set(cache_key, result.model_dump(), ttl=settings.cache_ttl_mapillary)

    return result


@router.get("/{vbo_id}/export")
async def export_briefing(
    vbo_id: str = Path(..., pattern=r"^[0-9]{16}$"),
    rd_x: float = Query(...),
    rd_y: float = Query(...),
    lat: float = Query(...),
    lng: float = Query(...),
    address: str = Query(..., description="Display address string"),
    template: str = Query("quick_brief"),
    language: str = Query("en"),
    shadow_image: str | None = Query(None, description="Base64-encoded shadow snapshot"),
    street: str | None = Query(None, description="Street name for contextualized checklist"),
    city: str | None = Query(None, description="City name for contextualized checklist"),
):
    """Export a PDF viewing briefing for the address.

    Assembles data from cached risk/building/viewing-questions responses
    and generates a downloadable PDF.
    """
    if template not in ("quick_brief", "full_dossier"):
        raise HTTPException(
            status_code=422,
            detail="Template must be 'quick_brief' or 'full_dossier'",
        )
    if language not in ("en", "nl"):
        raise HTTPException(status_code=422, detail="Language must be 'en' or 'nl'")

    # Fetch building facts (cached or fresh)
    building_year: int | None = None
    building_use: str | None = None

    cache_key_building = f"building:{vbo_id}"
    cached_building = await cache_get(cache_key_building)
    if cached_building is not None:
        building_resp = BuildingFactsResponse(**cached_building)
        if building_resp.building:
            building_year = building_resp.building.construction_year
            if building_resp.building.intended_use_en:
                building_use = ", ".join(building_resp.building.intended_use_en)
    else:
        try:
            facts = await bag.get_building_facts(vbo_id)
            if facts:
                building_year = facts.construction_year
                if facts.intended_use_en:
                    building_use = ", ".join(facts.intended_use_en)
        except Exception:
            logger.warning("Failed to fetch building facts for PDF export")

    # Fetch risk cards (cached or fresh)
    risks: RiskCardsResponse | None = None
    sunlight_score: int | None = None
    cache_key_risks = f"risks:{vbo_id}:{rd_x:.0f}:{rd_y:.0f}"
    cached_risks = await cache_get(cache_key_risks)
    if cached_risks is not None:
        risks = RiskCardsResponse(**cached_risks)
    else:
        try:
            risks = await risk_cards.get_risk_cards(
                vbo_id=vbo_id, rd_x=rd_x, rd_y=rd_y, lat=lat, lng=lng,
            )
        except Exception:
            logger.warning("Failed to fetch risk cards for PDF export")

    if risks and risks.sunlight:
        sunlight_score = risks.sunlight.score

    # Fetch viewing questions
    viewing_qs: ViewingQuestionsResponse | None = None
    if risks:
        viewing_qs = build_viewing_questions(vbo_id, risks, street=street, city=city)

    if template == "full_dossier":
        pdf_bytes = generate_full_dossier(
            address=address,
            building_year=building_year,
            building_use=building_use,
            risks=risks,
            sunlight_score=sunlight_score,
            viewing_questions=viewing_qs,
            shadow_image_b64=shadow_image,
            language=language,
        )
    else:
        pdf_bytes = generate_quick_brief(
            address=address,
            building_year=building_year,
            building_use=building_use,
            risks=risks,
            sunlight_score=sunlight_score,
            viewing_questions=viewing_qs,
            shadow_image_b64=shadow_image,
            language=language,
        )

    filename = f"buurt-check-{vbo_id}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
