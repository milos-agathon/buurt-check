import asyncio
import base64
import logging
import re
import time

from fastapi import APIRouter, Depends, HTTPException, Path, Query, Request
from fastapi.responses import Response
from pydantic import AliasChoices, BaseModel, Field

from app.api.dependencies import require_entitlement
from app.cache.redis import cache_get, cache_set
from app.config import settings
from app.models.address import ResolvedAddress, SuggestResponse
from app.models.building import BuildingFactsResponse
from app.models.livability import LivabilityComparison, LivabilityResponse
from app.models.neighborhood import NeighborhoodStatsResponse, UrbanizationLevel
from app.models.neighborhood3d import Neighborhood3DResponse
from app.models.property_warnings import PropertyWarningsResponse
from app.models.risk import (
    FacadeResult,
    RiskCardsResponse,
    RiskComparisonsResponse,
    RiskLevel,
    SeverityLevel,
    SunlightRiskCard,
    ViewingQuestionsResponse,
)
from app.models.tier_b import TierBResponse
from app.rate_limit import limiter
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
from app.services.scoring import (
    normalize_sunlight_score,
    normalize_svf_score,
    severity_from_score,
    sunlight_summary,
)
from app.services.viewing_questions import build_viewing_questions
from app.services.weather import fetch_tmy_data

logger = logging.getLogger(__name__)

_BUURT_CODE_RE = re.compile(r"^BU[0-9]{4}[A-Z0-9]{4}$")


def _validate_buurt_code(buurt_code: str | None) -> str | None:
    """Validate buurt_code format at the route layer.

    Returns the cleaned value or raises HTTPException 422 if the format
    is invalid.  ``None`` passes through (buurt_code is optional).
    """
    if buurt_code is None:
        return None
    cleaned = buurt_code.strip().upper()
    if not _BUURT_CODE_RE.match(cleaned):
        raise HTTPException(
            status_code=422,
            detail="Invalid buurt_code format: expected BUxxxxxxxx (e.g. BU05370606)",
        )
    return cleaned


# HTTP Cache-Control header values by data freshness tier
_CACHE_IMMUTABLE = "public, max-age=86400"
_CACHE_DATA = "public, max-age=3600, stale-while-revalidate=86400"
_CACHE_REALTIME = "no-cache"
_CACHE_NO_STORE = "no-store"

_RISK_FAILURE_MESSAGES: frozenset[str] = frozenset({
    "NOISE_LAYER_UNAVAILABLE",
    "NOISE_LOOKUP_FAILED",
    "AIR_LOOKUP_FAILED",
    "CLIMATE_LOOKUP_FAILED",
    "NOISE_TIMEOUT",
    "AIR_TIMEOUT",
    "CLIMATE_TIMEOUT",
})

def _property_warnings_cache_key(
    vbo_id: str,
    rd_x: float,
    rd_y: float,
    construction_year: int | None,
    num_units: int | None,
    municipality: str | None,
) -> str:
    _cy = construction_year if construction_year is not None else ""
    _nu = num_units if num_units is not None else ""
    _mu = (municipality or "").strip().casefold()
    return (
        f"property_warnings:v2:{vbo_id}:{rd_x:.0f}:{rd_y:.0f}"
        f":{_cy}:{_nu}:{_mu}"
    )


router = APIRouter(prefix="/address", tags=["address"])


class FacadeSubmission(BaseModel):
    orientation: str
    height_label: str = Field(default="")
    winter_hours: float = Field(..., ge=0, le=24)
    summer_hours: float = Field(..., ge=0, le=24)
    annual_average: float = Field(..., ge=0, le=24)


class SunlightSubmission(BaseModel):
    winter_hours: float = Field(..., ge=0, le=24)
    summer_hours: float = Field(..., ge=0, le=24)
    equinox_hours: float = Field(..., ge=0, le=24)
    analysis_year: int = Field(..., ge=2000, le=2100)
    svf: float | None = Field(default=None, ge=0, le=1)
    # Extended fields
    facade_results: list[FacadeSubmission] = Field(default_factory=list)
    annual_average: float | None = Field(default=None, ge=0, le=24)
    ground_annual_average: float | None = Field(default=None, ge=0, le=24)
    svf_anisotropic: float | None = Field(default=None, ge=0, le=1)
    irradiance_kwh_m2: float | None = Field(default=None, ge=0)


async def _get_cached_sunlight_card(vbo_id: str) -> SunlightRiskCard | None:
    cached = await cache_get(f"sunlight:{vbo_id}")
    if not isinstance(cached, dict):
        return None
    try:
        return SunlightRiskCard(**cached)
    except Exception:
        return None


@router.get("/suggest", response_model=SuggestResponse)
@limiter.limit("30/minute")
async def address_suggest(
    request: Request,
    response: Response,
    q: str = Query(..., min_length=2, description="Search query"),
    limit: int = Query(7, ge=1, le=20, description="Max results"),
):
    """Autocomplete address suggestions from PDOK Locatieserver."""
    cache_key = f"suggest:{q.strip().casefold()}:{limit}"
    cached = await cache_get(cache_key)
    # Historical safeguard: ignore empty cached suggestion lists that may
    # have been written before the "never cache empty responses" fix.
    if isinstance(cached, list) and len(cached) == 0:
        cached = None
    if cached is not None:
        response.headers["Cache-Control"] = _CACHE_REALTIME
        return SuggestResponse(
            suggestions=[
                locatieserver.AddressSuggestion(**s) for s in cached
            ]
        )

    try:
        suggestions = await locatieserver.suggest(q, limit)
    except Exception as exc:
        logger.exception("address_suggest failed: %s", exc)
        raise HTTPException(status_code=502, detail="Address search unavailable") from exc

    if suggestions:
        await cache_set(
            cache_key,
            [s.model_dump() for s in suggestions],
            ttl=settings.cache_ttl_suggest,
        )
    response.headers["Cache-Control"] = _CACHE_REALTIME
    return SuggestResponse(suggestions=suggestions)


@router.get("/lookup", response_model=ResolvedAddress)
async def address_lookup(
    response: Response,
    id: str = Query(..., description="Locatieserver document ID"),
):
    """Resolve a locatieserver suggestion to full address details."""
    cache_key = f"lookup:v2:{id}"
    cached = await cache_get(cache_key)
    if cached is not None:
        response.headers["Cache-Control"] = _CACHE_IMMUTABLE
        return ResolvedAddress(**cached)

    try:
        resolved = await locatieserver.lookup(id)
    except Exception as exc:
        logger.exception("address_lookup failed: %s", exc)
        raise HTTPException(status_code=502, detail="Address lookup unavailable") from exc

    if resolved is None:
        raise HTTPException(status_code=404, detail="Address not found")

    pand_id_attempted = False
    if resolved.adresseerbaar_object_id:
        pand_id_attempted = True
        try:
            resolved.pand_id = await asyncio.wait_for(
                bag.get_pand_id(resolved.adresseerbaar_object_id),
                timeout=3.0,
            )
        except Exception as exc:
            logger.warning(
                "pand_id resolution failed for VBO %s: %s",
                resolved.adresseerbaar_object_id,
                exc,
            )

    ttl = settings.cache_ttl_lookup
    if pand_id_attempted and resolved.pand_id is None:
        ttl = min(ttl, 300)

    await cache_set(cache_key, resolved.model_dump(), ttl=ttl)
    response.headers["Cache-Control"] = _CACHE_IMMUTABLE
    return resolved


VALID_TILE_TYPES = {"noise", "air_quality", "climate", "luchtfoto"}


@router.get("/wms-tile")
async def wms_tile_proxy(
    type: str = Query(..., description="Tile type: noise, air_quality, climate, or luchtfoto"),
    rd_x: float = Query(..., ge=0, le=300000, description="RD X coordinate"),
    rd_y: float = Query(..., ge=285000, le=625000, description="RD Y coordinate"),
    radius: float = Query(250.0, ge=10, le=500, description="Tile radius in meters"),
    size: int = Query(512, ge=128, le=2048, description="Tile size in pixels"),
    _: None = Depends(require_entitlement),
):
    """Proxy WMS GetMap tiles to avoid CORS issues in the browser."""
    if type not in VALID_TILE_TYPES:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid tile type '{type}'. "
            f"Must be one of: {', '.join(sorted(VALID_TILE_TYPES))}",
        )

    media_type = "image/jpeg" if type == "luchtfoto" else "image/png"
    cache_key = f"wms_tile:{type}:{rd_x:.0f}:{rd_y:.0f}:{radius:.0f}:{size}"
    cached = await cache_get(cache_key)
    if cached is not None:
        tile_bytes = base64.b64decode(cached)
        return Response(
            content=tile_bytes,
            media_type=media_type,
            headers={"Cache-Control": _CACHE_IMMUTABLE},
        )

    tile_bytes = await wms_tile.get_wms_tile(type, rd_x, rd_y, radius=radius, size=size)
    if tile_bytes is None:
        return Response(status_code=204)

    encoded = base64.b64encode(tile_bytes).decode()
    await cache_set(cache_key, encoded, ttl=settings.cache_ttl_wms_tile)
    return Response(
        content=tile_bytes,
        media_type=media_type,
        headers={"Cache-Control": _CACHE_IMMUTABLE},
    )


@router.get("/{vbo_id}/building", response_model=BuildingFactsResponse)
async def building_facts(
    response: Response,
    vbo_id: str = Path(..., pattern=r"^[0-9]{16}$"),
):
    """Fetch building facts from BAG for a verblijfsobject."""
    t0 = time.monotonic()
    cache_key = f"building:{vbo_id}"
    cached = await cache_get(cache_key)
    if cached is not None:
        metrics.inc("building.success")
        metrics.record_latency("building", (time.monotonic() - t0) * 1000)
        response.headers["Cache-Control"] = _CACHE_IMMUTABLE
        return BuildingFactsResponse(**cached)

    try:
        facts = await bag.get_building_facts(vbo_id)
    except ValueError as exc:
        metrics.inc("building.error")
        metrics.record_latency("building", (time.monotonic() - t0) * 1000)
        raise HTTPException(status_code=422, detail="Building data unavailable") from exc
    except Exception as exc:
        logger.exception("building_facts failed: %s", exc)
        metrics.inc("building.error")
        metrics.record_latency("building", (time.monotonic() - t0) * 1000)
        raise HTTPException(
            status_code=502, detail="Building data unavailable"
        ) from exc

    if facts is None:
        metrics.inc("building.success")
        metrics.record_latency("building", (time.monotonic() - t0) * 1000)
        return BuildingFactsResponse(
            address_id=vbo_id,
            building=None,
            message="No building found for this address",
        )

    result = BuildingFactsResponse(address_id=vbo_id, building=facts)
    await cache_set(cache_key, result.model_dump(), ttl=settings.cache_ttl_building)
    metrics.inc("building.success")
    metrics.record_latency("building", (time.monotonic() - t0) * 1000)
    response.headers["Cache-Control"] = _CACHE_IMMUTABLE
    return result


@router.get("/{vbo_id}/building3d", response_model=Neighborhood3DResponse)
async def building_3d(
    response: Response,
    vbo_id: str = Path(..., pattern=r"^[0-9]{16}$"),
    pand_id: str = Query(..., pattern=r"^[0-9]{16}$"),
    rd_x: float = Query(..., ge=0, le=300000),
    rd_y: float = Query(..., ge=285000, le=625000),
    lat: float = Query(..., ge=50.5, le=53.8),
    lng: float = Query(..., ge=3.2, le=7.3),
    _: None = Depends(require_entitlement),
):
    """Fast Phase 1: fetch only the target building (~2s, no bbox)."""
    cache_key = f"building3d:{pand_id}"
    cached = await cache_get(cache_key)
    if cached is not None:
        response.headers["Cache-Control"] = _CACHE_IMMUTABLE
        return Neighborhood3DResponse(**cached)

    try:
        result = await three_d_bag.get_target_building_3d(
            pand_id=pand_id, rd_x=rd_x, rd_y=rd_y, lat=lat, lng=lng,
            vbo_id=vbo_id,
        )
    except Exception as exc:
        logger.exception("building_3d failed: %s", exc)
        raise HTTPException(
            status_code=502, detail="3D building data unavailable"
        ) from exc

    if result.buildings:
        await cache_set(
            cache_key, result.model_dump(), ttl=settings.cache_ttl_building,
        )
        response.headers["Cache-Control"] = _CACHE_IMMUTABLE
    return result


@router.get("/{vbo_id}/neighborhood3d", response_model=Neighborhood3DResponse)
async def neighborhood_3d(
    response: Response,
    vbo_id: str = Path(..., pattern=r"^[0-9]{16}$"),
    pand_id: str = Query(..., pattern=r"^[0-9]{16}$"),
    rd_x: float = Query(..., ge=0, le=300000),
    rd_y: float = Query(..., ge=285000, le=625000),
    lat: float = Query(..., ge=50.5, le=53.8),
    lng: float = Query(..., ge=3.2, le=7.3),
    _: None = Depends(require_entitlement),
):
    """Fetch 3D neighborhood building data from 3DBAG."""
    # v26: parallel quadrant strategy for accelerated mode (4 concurrent bbox queries at 120m).
    # Mode must be in the key because it changes radius/page/budget behavior.
    mode = "conservative" if settings.three_d_conservative_mode else "accelerated"
    cache_key = f"neighborhood3d:v26:{mode}:{pand_id}:{rd_x:.0f}:{rd_y:.0f}"
    cached = await cache_get(cache_key)
    if cached is not None:
        response.headers["Cache-Control"] = _CACHE_IMMUTABLE
        return Neighborhood3DResponse(**cached)

    try:
        result = await three_d_bag.get_neighborhood_3d(
            pand_id=pand_id, rd_x=rd_x, rd_y=rd_y, lat=lat, lng=lng,
            vbo_id=vbo_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="3D building data unavailable") from exc
    except Exception as exc:
        logger.exception("neighborhood_3d failed: %s", exc)
        raise HTTPException(
            status_code=502, detail="3D building data unavailable"
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
    if result.buildings:
        response.headers["Cache-Control"] = _CACHE_IMMUTABLE
    return result


@router.get("/{vbo_id}/weather-tmy")
async def weather_tmy(
    response: Response,
    vbo_id: str = Path(..., pattern=r"^[0-9]{16}$"),
    lat: float = Query(..., ge=50.5, le=53.8),
    lng: float = Query(..., ge=3.2, le=7.3),
    _: None = Depends(require_entitlement),
):
    """Fetch PVGIS TMY weather data (hourly GHI/DHI/DNI) for irradiance estimation."""
    try:
        data = await fetch_tmy_data(lat, lng)
    except Exception as exc:
        logger.exception("weather_tmy failed vbo=%s lat=%.4f lng=%.4f: %s", vbo_id, lat, lng, exc)
        raise HTTPException(
            status_code=502,
            detail="Weather TMY data unavailable",
        ) from exc

    if data:
        response.headers["Cache-Control"] = _CACHE_DATA

    return {
        "source": "PVGIS TMY v5.2 (European Commission JRC)",
        "grid_resolution_deg": 0.05,
        "hourly_records": len(data),
        "data": data,
    }


@router.post("/{vbo_id}/sunlight")
async def submit_sunlight_analysis(
    response: Response,
    vbo_id: str = Path(..., pattern=r"^[0-9]{16}$"),
    body: SunlightSubmission = ...,
    _: None = Depends(require_entitlement),
):
    """Accept client-computed sunlight analysis for caching and downstream use."""
    sunlight_score = normalize_sunlight_score(body.winter_hours)
    severity = (
        severity_from_score(sunlight_score)
        if sunlight_score is not None
        else SeverityLevel.unavailable
    )
    summary_en, summary_nl = sunlight_summary(sunlight_score, body.winter_hours)

    # Map facade submissions to FacadeResult models
    facade_results = [
        FacadeResult(
            orientation=f.orientation,
            height_label=f.height_label,
            winter_hours=round(f.winter_hours, 1),
            summer_hours=round(f.summer_hours, 1),
            annual_average=round(f.annual_average, 1),
        )
        for f in body.facade_results
    ]

    card = SunlightRiskCard(
        level=severity,
        winter_hours=round(body.winter_hours, 1),
        summer_hours=round(body.summer_hours, 1),
        equinox_hours=round(body.equinox_hours, 1),
        svf_percent=round(body.svf * 100, 1) if body.svf is not None else None,
        source="3DBAG + SunCalc",
        source_date=str(body.analysis_year),
        score=sunlight_score,
        svf_score=normalize_svf_score(body.svf),
        severity=severity,
        summary=summary_en,
        summary_nl=summary_nl,
        facade_results=facade_results,
        annual_average=(
            round(body.annual_average, 1)
            if body.annual_average is not None
            else None
        ),
        ground_annual_average=(
            round(body.ground_annual_average, 1)
            if body.ground_annual_average is not None
            else None
        ),
        svf_anisotropic=body.svf_anisotropic,
        irradiance_kwh_m2=(
            round(body.irradiance_kwh_m2, 1)
            if body.irradiance_kwh_m2 is not None
            else None
        ),
    )

    await cache_set(
        f"sunlight:{vbo_id}",
        card.model_dump(mode="json"),
        ttl=settings.cache_ttl_risk_cards,
    )

    response.headers["Cache-Control"] = _CACHE_NO_STORE
    return {
        "status": "ok",
        "score": sunlight_score,
        "severity": severity.value,
    }


@router.get("/{vbo_id}/risks", response_model=RiskCardsResponse)
@limiter.limit("10/minute")
async def address_risk_cards(
    request: Request,
    response: Response,
    vbo_id: str = Path(..., pattern=r"^[0-9]{16}$"),
    rd_x: float = Query(..., ge=0, le=300000),
    rd_y: float = Query(..., ge=285000, le=625000),
    lat: float = Query(..., ge=50.5, le=53.8),
    lng: float = Query(..., ge=3.2, le=7.3),
):
    """Fetch F3 risk cards (noise, air quality, climate stress)."""
    t0 = time.monotonic()
    cache_key = f"risks:{vbo_id}:{rd_x:.0f}:{rd_y:.0f}"
    cached = await cache_get(cache_key)
    if cached is not None:
        cached_result = RiskCardsResponse(**cached)
        if cached_result.sunlight is None:
            cached_result.sunlight = await _get_cached_sunlight_card(vbo_id)
        logger.info("risk_cards cache_hit vbo=%s", vbo_id)
        metrics.inc("risks.success")
        metrics.record_latency("risks", (time.monotonic() - t0) * 1000)
        response.headers["Cache-Control"] = _CACHE_DATA
        return cached_result

    try:
        result = await risk_cards.get_risk_cards(
            vbo_id=vbo_id,
            rd_x=rd_x,
            rd_y=rd_y,
            lat=lat,
            lng=lng,
        )
    except Exception as exc:
        logger.exception("address_risk_cards failed: %s", exc)
        metrics.inc("risks.error")
        metrics.record_latency("risks", (time.monotonic() - t0) * 1000)
        raise HTTPException(status_code=502, detail="Risk card data sources unavailable") from exc

    if result.sunlight is None:
        result.sunlight = await _get_cached_sunlight_card(vbo_id)

    has_data = (
        result.noise.level != RiskLevel.unavailable
        or result.air_quality.level != RiskLevel.unavailable
        or result.climate_stress.level != RiskLevel.unavailable
        or result.sunlight is not None
    )
    has_failure = any(
        msg in _RISK_FAILURE_MESSAGES
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
    if has_data:
        response.headers["Cache-Control"] = _CACHE_DATA
    return result


@router.get("/{vbo_id}/neighborhood", response_model=NeighborhoodStatsResponse)
async def neighborhood_stats(
    response: Response,
    vbo_id: str = Path(..., pattern=r"^[0-9]{16}$"),
    lat: float = Query(..., ge=50.5, le=53.8),
    lng: float = Query(..., ge=3.2, le=7.3),
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
        response.headers["Cache-Control"] = _CACHE_DATA
        return NeighborhoodStatsResponse(**cached)

    try:
        result = await cbs.get_neighborhood_stats(
            vbo_id=vbo_id,
            lat=lat,
            lng=lng,
            buurt_code=buurt_code,
        )
    except Exception as exc:
        logger.exception("neighborhood_stats failed: %s", exc)
        raise HTTPException(
            status_code=502, detail="CBS API unavailable"
        ) from exc

    if result.stats is not None and result.message is None:
        await cache_set(
            cache_key,
            result.model_dump(),
            ttl=settings.cache_ttl_neighborhood,
        )
    if result.stats is not None:
        response.headers["Cache-Control"] = _CACHE_DATA
    return result


@router.get("/{vbo_id}/risk-comparisons", response_model=RiskComparisonsResponse)
async def risk_comparisons(
    response: Response,
    vbo_id: str = Path(..., pattern=r"^[0-9]{16}$"),
    rd_x: float = Query(..., ge=0, le=300000),
    rd_y: float = Query(..., ge=285000, le=625000),
    lat: float = Query(..., ge=50.5, le=53.8),
    lng: float = Query(..., ge=3.2, le=7.3),
    buurt_code: str | None = Query(None),
    _: None = Depends(require_entitlement),
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
            logger.exception("risk_comparisons failed: %s", exc)
            raise HTTPException(
                status_code=502,
                detail="Risk card data sources unavailable",
            ) from exc
    if risk_result.sunlight is None:
        risk_result.sunlight = await _get_cached_sunlight_card(vbo_id)

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

    response.headers["Cache-Control"] = _CACHE_DATA
    return build_risk_comparisons(
        vbo_id=vbo_id,
        cards=risk_result,
        urbanization=urbanization,
    )


@router.get(
    "/{vbo_id}/viewing-questions", response_model=ViewingQuestionsResponse
)
async def viewing_questions(
    response: Response,
    vbo_id: str = Path(..., pattern=r"^[0-9]{16}$"),
    rd_x: float = Query(..., ge=0, le=300000),
    rd_y: float = Query(..., ge=285000, le=625000),
    lat: float = Query(..., ge=50.5, le=53.8),
    lng: float = Query(..., ge=3.2, le=7.3),
    street: str | None = Query(None, description="Street name for contextualized questions"),
    city: str | None = Query(None, description="City name for contextualized questions"),
    _: None = Depends(require_entitlement),
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
            logger.exception("viewing_questions failed: %s", exc)
            raise HTTPException(
                status_code=502, detail="Risk card data sources unavailable"
            ) from exc
    if risk_result.sunlight is None:
        risk_result.sunlight = await _get_cached_sunlight_card(vbo_id)

    response.headers["Cache-Control"] = _CACHE_DATA
    return build_viewing_questions(vbo_id, risk_result, street=street, city=city)


@router.get("/{vbo_id}/tier-b", response_model=TierBResponse)
async def tier_b_signals(
    response: Response,
    vbo_id: str = Path(..., pattern=r"^[0-9]{16}$"),
    buurt_code: str | None = Query(None),
    _: None = Depends(require_entitlement),
):
    """Fetch Tier-B signals: crime context."""
    buurt_code = _validate_buurt_code(buurt_code)
    cache_key = f"tier-b:{vbo_id}:{buurt_code or '-'}"
    cached = await cache_get(cache_key)
    if cached is not None:
        response.headers["Cache-Control"] = _CACHE_DATA
        return TierBResponse(**cached)

    try:
        result = await tier_b.get_tier_b_data(
            vbo_id=vbo_id,
            buurt_code=buurt_code,
        )
    except Exception as exc:
        logger.exception("tier_b_signals failed: %s", exc)
        raise HTTPException(
            status_code=502,
            detail="Tier-B data sources unavailable",
        ) from exc

    has_any_data = bool(
        result.crime.total_per_1000 is not None
        or result.crime.monthly_total_per_1000 is not None
    )
    if has_any_data:
        await cache_set(cache_key, result.model_dump(), ttl=settings.cache_ttl_tier_b)
        response.headers["Cache-Control"] = _CACHE_DATA
    return result


@router.get("/{vbo_id}/livability")
async def address_livability(
    response: Response,
    vbo_id: str = Path(..., pattern=r"^[0-9]{16}$"),
    rd_x: float = Query(..., ge=0, le=300000),
    rd_y: float = Query(..., ge=285000, le=625000),
    _: None = Depends(require_entitlement),
):
    """Fetch Leefbaarometer livability data: current score + trend + comparison."""
    cache_key = f"livability_full:{rd_x:.0f}:{rd_y:.0f}"
    cached = await cache_get(cache_key)
    if cached is not None:
        response.headers["Cache-Control"] = _CACHE_DATA
        return LivabilityResponse(**cached)

    try:
        current = await leefbaarometer.get_livability(rd_x, rd_y)
        if current is None:
            return {"available": False, "message": "LIVABILITY_NO_DATA"}

        # Fetch trend + comparison in parallel
        trend_task = leefbaarometer.get_livability_trend(rd_x, rd_y)
        comparison_task = leefbaarometer.get_livability_comparison(rd_x, rd_y)
        trend, comparison = await asyncio.gather(
            trend_task, comparison_task, return_exceptions=True
        )

        trend_ok = isinstance(trend, list)
        comparison_ok = isinstance(comparison, LivabilityComparison)
        current.trend = trend if trend_ok else []
        current.comparison = comparison.rows if comparison_ok else []

        # Cache only complete responses (never cache partial/error responses).
        if trend_ok and comparison_ok:
            await cache_set(
                cache_key,
                current.model_dump(),
                ttl=settings.cache_ttl_livability,
            )
            response.headers["Cache-Control"] = _CACHE_DATA
        return current
    except Exception as exc:
        logger.exception("livability failed vbo=%s: %s", vbo_id, exc)
        raise HTTPException(
            status_code=502, detail="Livability data unavailable"
        ) from exc


@router.get("/{vbo_id}/property-warnings", response_model=PropertyWarningsResponse)
async def address_property_warnings(
    response: Response,
    vbo_id: str = Path(..., pattern=r"^[0-9]{16}$"),
    rd_x: float = Query(..., ge=0, le=300000),
    rd_y: float = Query(..., ge=285000, le=625000),
    construction_year: int | None = Query(None),
    num_units: int | None = Query(None),
    municipality: str | None = Query(None),
    _: None = Depends(require_entitlement),
):
    """Property warnings: foundation risk, erfpacht, VvE, asbestos."""
    t0 = time.monotonic()
    cache_key = _property_warnings_cache_key(
        vbo_id, rd_x, rd_y, construction_year, num_units, municipality,
    )
    cached = await cache_get(cache_key)
    if cached is not None:
        logger.info("property_warnings cache_hit vbo=%s", vbo_id)
        response.headers["Cache-Control"] = _CACHE_DATA
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
        logger.exception("property_warnings failed vbo=%s: %s", vbo_id, exc)
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
        response.headers["Cache-Control"] = _CACHE_DATA

    return result


class ExportRequest(BaseModel):
    """POST body for PDF export — avoids URL-length limits from base64 shadow images."""

    model_config = {"populate_by_name": True}

    rd_x: float = Field(ge=0, le=300000)
    rd_y: float = Field(ge=285000, le=625000)
    lat: float = Field(ge=50.5, le=53.8)
    lng: float = Field(ge=3.2, le=7.3)
    address: str = Field(max_length=500)
    template: str = "quick_brief"
    language: str = "en"
    shadow_image_b64: str | None = Field(
        default=None,
        max_length=2_000_000,
        validation_alias=AliasChoices("shadow_image_b64", "shadow_image"),
    )
    report_id: str | None = None
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
        cached_result = RiskCardsResponse(**cached)
        if cached_result.sunlight is None:
            cached_result.sunlight = await _get_cached_sunlight_card(vbo_id)
        return cached_result
    try:
        result = await risk_cards.get_risk_cards(
            vbo_id=vbo_id, rd_x=rd_x, rd_y=rd_y, lat=lat, lng=lng,
        )
        if result.sunlight is None:
            result.sunlight = await _get_cached_sunlight_card(vbo_id)
        has_data = (
            result.noise.level != RiskLevel.unavailable
            or result.air_quality.level != RiskLevel.unavailable
            or result.climate_stress.level != RiskLevel.unavailable
            or result.sunlight is not None
        )
        has_failure = any(
            msg in _RISK_FAILURE_MESSAGES
            for msg in (
                result.noise.message,
                result.air_quality.message,
                result.climate_stress.message,
            )
            if msg is not None
        )
        if has_data and not has_failure:
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


async def _fetch_tier_b_for_export(vbo_id: str, buurt_code: str | None):
    """Cache-first Tier-B signals fetch for export."""
    cache_key = f"tier-b:{vbo_id}:{buurt_code or '-'}"
    cached = await cache_get(cache_key)
    if cached is not None:
        return TierBResponse(**cached)
    try:
        result = await tier_b.get_tier_b_data(
            vbo_id=vbo_id,
            buurt_code=buurt_code,
        )
        has_data = bool(
            result.crime.total_per_1000 is not None
            or result.crime.monthly_total_per_1000 is not None
        )
        if has_data:
            await cache_set(cache_key, result.model_dump(), ttl=settings.cache_ttl_tier_b)
        return result
    except Exception:
        logger.warning("Failed to fetch tier-b data for PDF export")
    return None


async def _fetch_property_warnings_for_export(
    vbo_id: str,
    rd_x: float,
    rd_y: float,
    construction_year: int | None,
    num_units: int | None,
    municipality: str | None,
) -> PropertyWarningsResponse | None:
    """Cache-first property warnings fetch for Full Dossier export."""
    cache_key = _property_warnings_cache_key(
        vbo_id, rd_x, rd_y, construction_year, num_units, municipality,
    )
    cached = await cache_get(cache_key)
    if cached is not None:
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
        if result.foundation_risk.level != "unavailable":
            await cache_set(
                cache_key,
                result.model_dump(),
                ttl=settings.cache_ttl_property_warnings,
            )
        return result
    except Exception:
        logger.warning("Failed to fetch property warnings for PDF export")
    return None


async def _do_export_briefing(vbo_id: str, body: ExportRequest) -> Response:
    """Core export logic shared by POST and GET endpoints."""
    if body.template not in ("quick_brief", "full_dossier"):
        raise HTTPException(
            status_code=422,
            detail="Template must be 'quick_brief' or 'full_dossier'",
        )
    if body.language not in ("en", "nl"):
        raise HTTPException(status_code=422, detail="Language must be 'en' or 'nl'")

    # --- Entitlement gate: full_dossier requires a paid report ---
    if body.template == "full_dossier":
        if not body.report_id:
            raise HTTPException(status_code=402, detail="Payment required")
        from app.services.reports import check_entitlement

        if not await check_entitlement(body.report_id):
            raise HTTPException(status_code=402, detail="Payment required")

    # --- Phase 1: Fetch building + risks in parallel ---
    building_resp, risks = await asyncio.gather(
        _fetch_building_for_export(vbo_id),
        _fetch_risks_for_export(vbo_id, body.rd_x, body.rd_y, body.lat, body.lng),
    )

    building_year: int | None = None
    building_use: str | None = None
    floor_area: int | None = None
    num_units: int | None = None
    if building_resp and building_resp.building:
        building_year = building_resp.building.construction_year
        floor_area = building_resp.building.floor_area_m2
        num_units = building_resp.building.num_units
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
    property_warnings_data: PropertyWarningsResponse | None = None

    if body.template == "full_dossier":
        # Fetch full-dossier-only enrichments in parallel.
        neighborhood_stats, tier_b_data, property_warnings_data = await asyncio.gather(
            _fetch_neighborhood_for_export(
                vbo_id, body.lat, body.lng, body.buurt_code,
            ),
            _fetch_tier_b_for_export(
                vbo_id, body.buurt_code,
            ),
            _fetch_property_warnings_for_export(
                vbo_id=vbo_id,
                rd_x=body.rd_x,
                rd_y=body.rd_y,
                construction_year=building_year,
                num_units=num_units,
                municipality=body.city,
            ),
        )

        # If request buurt_code is missing, retry Tier-B with neighborhood code.
        if (
            not body.buurt_code
            and neighborhood_stats
            and neighborhood_stats.buurt_code
        ):
            tier_b_data = await _fetch_tier_b_for_export(
                vbo_id, neighborhood_stats.buurt_code,
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
            property_warnings_data=property_warnings_data,
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
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": _CACHE_NO_STORE,
        },
    )


@router.post("/{vbo_id}/export")
@limiter.limit("5/minute")
async def export_briefing(
    request: Request,
    vbo_id: str = Path(..., pattern=r"^[0-9]{16}$"),
    body: ExportRequest = ...,
):
    """Export a PDF viewing briefing for the address.

    POST body accepts all parameters including base64 shadow image,
    avoiding URL-length limits. Full Dossier fetches additional data
    (neighborhood stats, tier-b, risk comparisons) in parallel.
    """
    return await _do_export_briefing(vbo_id, body)


@router.get("/{vbo_id}/export")
@limiter.limit("5/minute")
async def export_briefing_get(
    request: Request,
    vbo_id: str = Path(..., pattern=r"^[0-9]{16}$"),
    rd_x: float = Query(..., ge=0, le=300000),
    rd_y: float = Query(..., ge=285000, le=625000),
    lat: float = Query(..., ge=50.5, le=53.8),
    lng: float = Query(..., ge=3.2, le=7.3),
    address: str = Query(...),
    template: str = Query("quick_brief"),
    language: str = Query("en"),
    report_id: str | None = Query(None),
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
    """Backward-compatible GET endpoint for PDF export (deprecated -- prefer POST)."""
    resolved_shadow = shadow_image_b64 or shadow_image
    body = ExportRequest(
        rd_x=rd_x, rd_y=rd_y, lat=lat, lng=lng, address=address,
        template=template, language=language, shadow_image_b64=resolved_shadow,
        report_id=report_id,
        street=street, city=city, buurt_code=buurt_code, postcode=postcode,
        house_number=house_number, house_letter=house_letter, addition=addition,
    )
    return await _do_export_briefing(vbo_id, body)

