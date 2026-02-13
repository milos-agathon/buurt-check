"""Foundation risk assessment from soil type, subsidence, and construction year."""
from __future__ import annotations

import asyncio
import logging

import httpx

from app.config import settings
from app.models.property_warnings import FoundationRisk

logger = logging.getLogger(__name__)

_client: httpx.AsyncClient | None = None
_client_loop_id: int | None = None


def _get_client() -> httpx.AsyncClient:
    global _client, _client_loop_id
    loop_id = id(asyncio.get_running_loop())
    if _client is None or _client.is_closed or _client_loop_id != loop_id:
        _client = httpx.AsyncClient(timeout=httpx.Timeout(10.0, connect=3.0))
        _client_loop_id = loop_id
    return _client


def _classify_foundation_risk(
    construction_year: int | None,
    soil_type: str | None,
    subsidence_rate: float | None,
) -> str:
    """Classify foundation risk level from inputs.

    Returns "high", "medium", "low", or "unavailable".
    """
    if soil_type is None or construction_year is None:
        return "unavailable"

    soft_soil = soil_type.lower() in ("klei", "veen")
    high_subsidence = subsidence_rate is not None and subsidence_rate > 2.0

    if construction_year < 1970:
        if soft_soil:
            return "high" if high_subsidence else "medium"
        return "low"

    if construction_year <= 1990:
        if soft_soil and high_subsidence:
            return "medium"
        return "low"

    # Post-1990: modern foundations
    return "low"


def _normalize_soil_type(raw: str) -> str:
    """Map BRO soil classifications to our simplified categories."""
    lower = raw.lower()
    if any(term in lower for term in ("klei", "clay")):
        return "klei"
    if any(term in lower for term in ("veen", "peat")):
        return "veen"
    if any(term in lower for term in ("zand", "sand")):
        return "zand"
    if any(term in lower for term in ("grind", "gravel")):
        return "grind"
    if any(term in lower for term in ("leem", "loam", "silt")):
        return "leem"
    # Unknown soil type — return raw; classification treats non-standard as non-soft-soil
    logger.info("Unrecognized soil type: %s", raw)
    return raw


async def _fetch_soil_type(rd_x: float, rd_y: float) -> str | None:
    """Fetch soil type from PDOK BRO WFS at given RD coordinates."""
    client = _get_client()
    try:
        resp = await client.get(
            settings.bro_wfs_base,
            params={
                "service": "WFS",
                "version": "2.0.0",
                "request": "GetFeature",
                "typeNames": "bodemkundigevlakkenkaart:bodemkundige_vlakken",
                "bbox": f"{rd_x - 5},{rd_y - 5},{rd_x + 5},{rd_y + 5},EPSG:28992",
                "count": "1",
                "outputFormat": "application/json",
            },
        )
        resp.raise_for_status()
        data = resp.json()
        features = data.get("features", [])
        if not features:
            return None

        props = features[0].get("properties", {})
        # BRO soil map field names vary — try common ones
        for key in ("grondsoort", "bodemtype", "grondsoort_code", "bodem_klasse"):
            if key in props and props[key]:
                return _normalize_soil_type(str(props[key]))
        return None
    except Exception:
        logger.warning("BRO soil type fetch failed at rd_x=%.0f rd_y=%.0f", rd_x, rd_y)
        return None


async def _fetch_subsidence_rate(rd_x: float, rd_y: float) -> float | None:
    """Fetch subsidence rate from Klimaateffectatlas WMS GetFeatureInfo.

    Returns mm/year or None on failure.
    """
    client = _get_client()
    try:
        resp = await client.get(
            settings.climate_atlas_wms_base,
            params={
                "service": "WMS",
                "version": "1.3.0",
                "request": "GetFeatureInfo",
                "layers": "bodemdaling_actueel",
                "query_layers": "bodemdaling_actueel",
                "crs": "EPSG:28992",
                "bbox": f"{rd_x - 25},{rd_y - 25},{rd_x + 25},{rd_y + 25}",
                "width": "101",
                "height": "101",
                "i": "50",
                "j": "50",
                "info_format": "application/json",
                "feature_count": "1",
            },
        )
        resp.raise_for_status()

        content_type = resp.headers.get("content-type", "")
        if "json" not in content_type and "text" not in content_type:
            return None

        data = resp.json()
        features = data.get("features", [])
        if not features:
            return None

        props = features[0].get("properties", {})
        # Extract numeric subsidence rate (mm/year)
        for key, value in props.items():
            if not isinstance(value, (int, float)):
                continue
            if any(skip in key.lower() for skip in ("id", "code", "fid", "shape")):
                continue
            rate = float(value)
            if rate <= -999 or rate >= 1e30:
                continue
            return abs(rate)  # Subsidence rates may be negative (sinking)
        return None
    except Exception:
        logger.warning("Subsidence rate fetch failed at rd_x=%.0f rd_y=%.0f", rd_x, rd_y)
        return None


async def get_foundation_risk(
    construction_year: int | None,
    rd_x: float,
    rd_y: float,
) -> FoundationRisk:
    """Assess foundation risk from soil type, subsidence, and construction year."""
    soil_type, subsidence_rate = await asyncio.gather(
        _fetch_soil_type(rd_x, rd_y),
        _fetch_subsidence_rate(rd_x, rd_y),
    )

    level = _classify_foundation_risk(construction_year, soil_type, subsidence_rate)

    messages: list[str] = []
    if soil_type is None:
        messages.append("FOUNDATION_NO_SOIL_DATA")
    if subsidence_rate is None and soil_type is not None:
        messages.append("FOUNDATION_NO_SUBSIDENCE_DATA")
    if construction_year is None:
        messages.append("FOUNDATION_NO_YEAR")

    return FoundationRisk(
        level=level,
        construction_year=construction_year,
        soil_type=soil_type,
        subsidence_rate_mm_per_year=subsidence_rate,
        messages=messages,
    )
