import asyncio
import base64
import logging
import time

from fastapi import APIRouter, HTTPException, Path, Query
from fastapi.responses import Response
from pydantic import AliasChoices, BaseModel, Field

from app.cache.redis import cache_get, cache_set
from app.config import settings
from app.models.address import ResolvedAddress, SuggestResponse
from app.models.building import BuildingFactsResponse
from app.models.livability import LivabilityComparison, LivabilityResponse
from app.models.neighborhood import NeighborhoodStatsResponse, UrbanizationLevel
from app.models.neighborhood3d import Neighborhood3DResponse
from app.models.property_warnings import PropertyWarningsResponse
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
    leefbaarometer,
    locatieserver,
    metrics,
    property_warnings,
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


VALID_TILE_TYPES = {"noise", "air_quality", "climate", "luchtfoto"}


@router.get("/wms-tile")
async def wms_tile_proxy(
    type: str = Query(..., description="Tile type: noise, air_quality, climate, or luchtfoto"),
    rd_x: float = Query(..., description="RD X coordinate"),
    rd_y: float = Query(..., description="RD Y coordinate"),
    radius: float = Query(250.0, ge=10, le=500, description="Tile radius in meters"),
    size: int = Query(512, ge=128, le=2048, description="Tile size in pixels"),
):
    """Proxy WMS GetMap tiles to avoid CORS issues in the browser."""
    if type not in VALID_TILE_TYPES:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid tile type '{type}'. "
            f"Must be one of: {', '.join(sorted(VALID_TILE_TYPES))}",
        )

    media_type = "image/jpeg" if type == "luchtfoto" else "image/png"
    cache_key = f"wms_tile:{type}:{rd_x:.0f}:{rd_y:.0f}:{radius:.0f}"
    cached = await cache_get(cache_key)
    if cached is not None:
        tile_bytes = base64.b64decode(cached)
        return Response(content=tile_bytes, media_type=media_type)

    tile_bytes = await wms_tile.get_wms_tile(type, rd_x, rd_y, radius=radius, size=size)
    if tile_bytes is None:
        return Response(status_code=204)

    encoded = base64.b64encode(tile_bytes).decode()
    await cache_set(cache_key, encoded, ttl=settings.cache_ttl_wms_tile)
    return Response(content=tile_bytes, media_type=media_type)


@router.get("/{vbo_id}/building", response_model=BuildingFactsResponse)
async def building_facts(
    vbo_id: str = Path(..., pattern=r"^[0-9]{16}$"),
):
    """Fetch building facts from BAG for a verblijfsobject."""
    t0 = time.monotonic()
    cache_key = f"building:{vbo_id}"
    cached = await cache_get(cache_key)
    if cached is not None:
        metrics.inc("building.success")
        metrics.record_latency("building", (time.monotonic() - t0) * 1000)
        return BuildingFactsResponse(**cached)

    try:
        facts = await bag.get_building_facts(vbo_id)
    except ValueError as exc:
        metrics.inc("building.error")
        metrics.record_latency("building", (time.monotonic() - t0) * 1000)
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        metrics.inc("building.error")
        metrics.record_latency("building", (time.monotonic() - t0) * 1000)
        raise HTTPException(
            status_code=502, detail=f"BAG API unavailable: {exc}"
        ) from exc

    if facts is None:
        metrics.inc("building.success")
        metrics.record_latency("building", (time.monotonic() - t0) * 1000)
        return BuildingFactsResponse(
            address_id=vbo_id,
            building=None,
            message="No building found for this address",
        )

    response = BuildingFactsResponse(address_id=vbo_id, building=facts)
    await cache_set(cache_key, response.model_dump(), ttl=settings.cache_ttl_building)
    metrics.inc("building.success")
    metrics.record_latency("building", (time.monotonic() - t0) * 1000)
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
    # v23: include completed near-ring prefetch to recover close context when bbox is truncated.
    cache_key = f"neighborhood3d:v23:{pand_id}:{rd_x:.0f}:{rd_y:.0f}"
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
    cacheable_partial = is_partial and len(result.buildings) >= 10
    if (
        result.buildings
        and result.target_pand_id is not None
        and (not is_partial or cacheable_partial)
    ):
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
    t0 = time.monotonic()
    cache_key = f"risks:{vbo_id}:{rd_x:.0f}:{rd_y:.0f}"
    cached = await cache_get(cache_key)
    if cached is not None:
        logger.info("risk_cards cache_hit vbo=%s", vbo_id)
        metrics.inc("risks.success")
        metrics.record_latency("risks", (time.monotonic() - t0) * 1000)
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
        metrics.inc("risks.error")
        metrics.record_latency("risks", (time.monotonic() - t0) * 1000)
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
    metrics.inc("risks.success")
    metrics.record_latency("risks", (time.monotonic() - t0) * 1000)
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
        f"neighborhood:v2:{buurt_code}"
        if buurt_code
        else f"neighborhood:v2:{lat:.4f}:{lng:.4f}"
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
        f"neighborhood:v2:{buurt_code}"
        if buurt_code
        else f"neighborhood:v2:{lat:.4f}:{lng:.4f}"
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


@router.get("/{vbo_id}/livability")
async def address_livability(
    vbo_id: str = Path(..., pattern=r"^[0-9]{16}$"),
    rd_x: float = Query(...),
    rd_y: float = Query(...),
):
    """Fetch Leefbaarometer livability data: current score + trend + comparison."""
    cache_key = f"livability_full:{rd_x:.0f}:{rd_y:.0f}"
    cached = await cache_get(cache_key)
    if cached is not None:
        return LivabilityResponse(**cached)

    current = await leefbaarometer.get_livability(rd_x, rd_y)
    if current is None:
        return {"available": False, "message": "LIVABILITY_NO_DATA"}

    # Fetch trend + comparison in parallel
    trend_task = leefbaarometer.get_livability_trend(rd_x, rd_y)
    comparison_task = leefbaarometer.get_livability_comparison(rd_x, rd_y)
    trend, comparison = await asyncio.gather(
        trend_task, comparison_task, return_exceptions=True
    )

    current.trend = trend if isinstance(trend, list) else []
    current.comparison = (
        comparison.rows if isinstance(comparison, LivabilityComparison) else []
    )

    # Cache the fully assembled response
    await cache_set(
        cache_key,
        current.model_dump(),
        ttl=settings.cache_ttl_livability,
    )
    return current


@router.get("/{vbo_id}/property-warnings", response_model=PropertyWarningsResponse)
async def address_property_warnings(
    vbo_id: str = Path(..., pattern=r"^[0-9]{16}$"),
    rd_x: float = Query(...),
    rd_y: float = Query(...),
    construction_year: int | None = Query(None),
    num_units: int | None = Query(None),
    municipality: str | None = Query(None),
):
    """Property warnings: foundation risk, erfpacht, VvE, asbestos."""
    t0 = time.monotonic()
    _cy = construction_year if construction_year is not None else ""
    _nu = num_units if num_units is not None else ""
    _mu = (municipality or "").strip().casefold()
    cache_key = (
        f"property_warnings:v2:{vbo_id}:{rd_x:.0f}:{rd_y:.0f}"
        f":{_cy}:{_nu}:{_mu}"
    )
    cached = await cache_get(cache_key)
    if cached is not None:
        logger.info("property_warnings cache_hit vbo=%s", vbo_id)
        return PropertyWarningsResponse(**cached)

    try:
        result = await property_warnings.get_property_warnings(
            vbo_id=vbo_id,
            rd_x=rd_x,
            rd_y=rd_y,
            construction_year=construction_year,
            num_units=num_units,
            municipality=municipality,
        )
    except Exception as exc:
        logger.error("property_warnings failed vbo=%s: %s", vbo_id, exc)
        raise HTTPException(
            status_code=502, detail="Property warnings fetch failed"
        ) from exc

    # Cache if foundation risk has real data
    if result.foundation_risk.level != "unavailable":
        await cache_set(
            cache_key,
            result.model_dump(),
            ttl=settings.cache_ttl_property_warnings,
        )
        logger.info(
            "property_warnings cache_set vbo=%s latency=%.0fms",
            vbo_id,
            (time.monotonic() - t0) * 1000,
        )

    return result


class ExportRequest(BaseModel):
    """POST body for PDF export — avoids URL-length limits from base64 shadow images."""

    model_config = {"populate_by_name": True}

    rd_x: float
    rd_y: float
    lat: float
    lng: float
    address: str
    template: str = "quick_brief"
    language: str = "en"
    shadow_image_b64: str | None = Field(
        default=None,
        validation_alias=AliasChoices("shadow_image_b64", "shadow_image"),
    )
    street: str | None = None
    city: str | None = None
    buurt_code: str | None = None
    postcode: str | None = None
    house_number: str | None = None
    house_letter: str | None = None
    addition: str | None = None


async def _fetch_building_for_export(vbo_id: str):
    """Cache-first building facts fetch for export."""
    cache_key = f"building:{vbo_id}"
    cached = await cache_get(cache_key)
    if cached is not None:
        return BuildingFactsResponse(**cached)
    try:
        facts = await bag.get_building_facts(vbo_id)
        if facts:
            resp = BuildingFactsResponse(address_id=vbo_id, building=facts)
            await cache_set(cache_key, resp.model_dump(), ttl=settings.cache_ttl_building)
            return resp
    except Exception:
        logger.warning("Failed to fetch building facts for PDF export")
    return None


async def _fetch_risks_for_export(vbo_id: str, rd_x: float, rd_y: float,
                                  lat: float, lng: float):
    """Cache-first risk cards fetch for export."""
    cache_key = f"risks:{vbo_id}:{rd_x:.0f}:{rd_y:.0f}"
    cached = await cache_get(cache_key)
    if cached is not None:
        return RiskCardsResponse(**cached)
    try:
        result = await risk_cards.get_risk_cards(
            vbo_id=vbo_id, rd_x=rd_x, rd_y=rd_y, lat=lat, lng=lng,
        )
        has_data = (
            result.noise.level != RiskLevel.unavailable
            or result.air_quality.level != RiskLevel.unavailable
            or result.climate_stress.level != RiskLevel.unavailable
        )
        if has_data:
            await cache_set(cache_key, result.model_dump(), ttl=settings.cache_ttl_risk_cards)
        return result
    except Exception:
        logger.warning("Failed to fetch risk cards for PDF export")
    return None


async def _fetch_neighborhood_for_export(vbo_id: str, lat: float, lng: float,
                                         buurt_code: str | None):
    """Cache-first CBS neighborhood stats fetch for export."""
    cache_key = (
        f"neighborhood:v2:{buurt_code}" if buurt_code
        else f"neighborhood:v2:{lat:.4f}:{lng:.4f}"
    )
    cached = await cache_get(cache_key)
    if cached is not None:
        return NeighborhoodStatsResponse(**cached).stats
    try:
        resp = await cbs.get_neighborhood_stats(
            vbo_id=vbo_id, lat=lat, lng=lng, buurt_code=buurt_code,
        )
        if resp.stats:
            await cache_set(cache_key, resp.model_dump(), ttl=settings.cache_ttl_neighborhood)
        return resp.stats
    except Exception:
        logger.warning("Failed to fetch neighborhood stats for PDF export")
    return None


async def _fetch_tier_b_for_export(vbo_id: str, buurt_code: str | None,
                                   postcode: str | None, house_number: str | None,
                                   house_letter: str | None, addition: str | None):
    """Cache-first Tier-B signals fetch for export."""
    cache_key = (
        f"tier-b:{vbo_id}:{buurt_code or '-'}:{postcode or '-'}"
        f":{house_number or '-'}:{house_letter or '-'}:{addition or '-'}"
    )
    cached = await cache_get(cache_key)
    if cached is not None:
        return TierBResponse(**cached)
    try:
        result = await tier_b.get_tier_b_data(
            vbo_id=vbo_id, buurt_code=buurt_code, postcode=postcode,
            house_number=house_number, house_letter=house_letter, addition=addition,
        )
        has_data = bool(
            result.energy_label.label
            or result.crime.total_per_1000 is not None
            or result.crime.monthly_total_per_1000 is not None
        )
        if has_data:
            await cache_set(cache_key, result.model_dump(), ttl=settings.cache_ttl_tier_b)
        return result
    except Exception:
        logger.warning("Failed to fetch tier-b data for PDF export")
    return None


@router.post("/{vbo_id}/export")
async def export_briefing(
    vbo_id: str = Path(..., pattern=r"^[0-9]{16}$"),
    body: ExportRequest = ...,
):
    """Export a PDF viewing briefing for the address.

    POST body accepts all parameters including base64 shadow image,
    avoiding URL-length limits. Full Dossier fetches additional data
    (neighborhood stats, tier-b, risk comparisons) in parallel.
    """
    if body.template not in ("quick_brief", "full_dossier"):
        raise HTTPException(
            status_code=422,
            detail="Template must be 'quick_brief' or 'full_dossier'",
        )
    if body.language not in ("en", "nl"):
        raise HTTPException(status_code=422, detail="Language must be 'en' or 'nl'")

    # --- Phase 1: Fetch building + risks in parallel ---
    building_resp, risks = await asyncio.gather(
        _fetch_building_for_export(vbo_id),
        _fetch_risks_for_export(vbo_id, body.rd_x, body.rd_y, body.lat, body.lng),
    )

    building_year: int | None = None
    building_use: str | None = None
    floor_area: int | None = None
    if building_resp and building_resp.building:
        building_year = building_resp.building.construction_year
        floor_area = building_resp.building.floor_area_m2
        if building_resp.building.intended_use_en:
            building_use = ", ".join(building_resp.building.intended_use_en)

    sunlight_score: int | None = None
    if risks and risks.sunlight:
        sunlight_score = risks.sunlight.score

    viewing_qs: ViewingQuestionsResponse | None = None
    if risks:
        viewing_qs = build_viewing_questions(
            vbo_id, risks, street=body.street, city=body.city,
        )

    # --- Phase 2 (Full Dossier): Fetch neighborhood + tier-b in parallel ---
    neighborhood_stats = None
    tier_b_data = None
    risk_comparisons_data = None

    if body.template == "full_dossier":
        # Fetch neighborhood + tier-b in parallel first.
        neighborhood_stats, tier_b_data = await asyncio.gather(
            _fetch_neighborhood_for_export(
                vbo_id, body.lat, body.lng, body.buurt_code,
            ),
            _fetch_tier_b_for_export(
                vbo_id, body.buurt_code, body.postcode,
                body.house_number, body.house_letter, body.addition,
            ),
        )

        # If request buurt_code is missing, retry Tier-B with neighborhood code.
        if (
            not body.buurt_code
            and neighborhood_stats
            and neighborhood_stats.buurt_code
        ):
            tier_b_data = await _fetch_tier_b_for_export(
                vbo_id, neighborhood_stats.buurt_code, body.postcode,
                body.house_number, body.house_letter, body.addition,
            )

        urbanization = UrbanizationLevel.unknown
        if neighborhood_stats:
            urbanization = neighborhood_stats.urbanization
        if risks:
            risk_comparisons_data = build_risk_comparisons(
                vbo_id=vbo_id, cards=risks, urbanization=urbanization,
            )

    # --- Generate PDF ---
    if body.template == "full_dossier":
        pdf_bytes = generate_full_dossier(
            address=body.address,
            building_year=building_year,
            building_use=building_use,
            risks=risks,
            sunlight_score=sunlight_score,
            viewing_questions=viewing_qs,
            shadow_image_b64=body.shadow_image_b64,
            language=body.language,
            floor_area=floor_area,
            neighborhood_stats=neighborhood_stats,
            tier_b=tier_b_data,
            risk_comparisons=risk_comparisons_data,
        )
    else:
        pdf_bytes = generate_quick_brief(
            address=body.address,
            building_year=building_year,
            building_use=building_use,
            risks=risks,
            sunlight_score=sunlight_score,
            viewing_questions=viewing_qs,
            shadow_image_b64=body.shadow_image_b64,
            language=body.language,
            floor_area=floor_area,
        )

    filename = f"buurt-check-{vbo_id}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/{vbo_id}/export")
async def export_briefing_get(
    vbo_id: str = Path(..., pattern=r"^[0-9]{16}$"),
    rd_x: float = Query(...),
    rd_y: float = Query(...),
    lat: float = Query(...),
    lng: float = Query(...),
    address: str = Query(...),
    template: str = Query("quick_brief"),
    language: str = Query("en"),
    shadow_image_b64: str | None = Query(None),
    shadow_image: str | None = Query(None),
    street: str | None = Query(None),
    city: str | None = Query(None),
    buurt_code: str | None = Query(None),
    postcode: str | None = Query(None),
    house_number: str | None = Query(None),
    house_letter: str | None = Query(None),
    addition: str | None = Query(None),
):
    """Backward-compatible GET endpoint for PDF export (deprecated — prefer POST)."""
    resolved_shadow = shadow_image_b64 or shadow_image
    body = ExportRequest(
        rd_x=rd_x, rd_y=rd_y, lat=lat, lng=lng, address=address,
        template=template, language=language, shadow_image_b64=resolved_shadow,
        street=street, city=city, buurt_code=buurt_code, postcode=postcode,
        house_number=house_number, house_letter=house_letter, addition=addition,
    )
    return await export_briefing(vbo_id=vbo_id, body=body)

