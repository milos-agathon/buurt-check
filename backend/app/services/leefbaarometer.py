"""Leefbaarometer WFS service — livability scores, trends, and comparisons.

Queries the Leefbaarometer 3.0 WFS (geo.leefbaarometer.nl/lbm3/ows) for
neighborhood livability data in the Netherlands. Returns current scores,
historical trend data, and wijk/gemeente comparison data.

Field mapping (verified live 2026-02-15):
  - kscore: overall score (1-9)
  - kfys: physical environment, konv: safety, ksoc: social cohesion,
    kvrz: amenities, kwon: housing quality
  - afw: overall deviation from national average
  - fys, onv, soc, vrz, won: per-dimension deviations from national average
"""
from __future__ import annotations

import asyncio
import logging
from typing import Literal

import httpx

from app.config import settings
from app.models.livability import (
    LivabilityComparison,
    LivabilityComparisonRow,
    LivabilityDimension,
    LivabilityResponse,
    LivabilityTrendPoint,
)
from app.services.http_client import LoopAwareClient

logger = logging.getLogger(__name__)

_client = LoopAwareClient(timeout=httpx.Timeout(5.0, connect=3.0))

# 12 biennial releases exist (02 through 24).
# 9 selected for trend — skipping 04, 06, 10 (earlier methodology, less comparable).
HISTORICAL_YEARS = ["02", "08", "12", "14", "16", "18", "20", "22", "24"]

DIMENSION_MAP: list[
    tuple[
        str,
        str,
        Literal["physical", "safety", "social", "amenities", "housing"],
    ]
] = [
    ("kfys", "fys", "physical"),
    ("konv", "onv", "safety"),
    ("ksoc", "soc", "social"),
    ("kvrz", "vrz", "amenities"),
    ("kwon", "won", "housing"),
]

_CLASS_LABELS = {
    1: "very low",
    2: "low",
    3: "fairly low",
    4: "below average",
    5: "around average",
    6: "above average",
    7: "good",
    8: "very good",
    9: "excellent",
}


def _normalize_score(raw: int) -> int:
    """Normalize 1-9 score to 0-100."""
    return round((raw - 1) / 8 * 100)


def _safe_int(value: object) -> int | None:
    """Safely cast a WFS property value to int. Returns None for non-numeric."""
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _safe_float(value: object) -> float | None:
    """Safely cast a WFS property value to float. Returns None for non-numeric."""
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _class_label(raw: int) -> str:
    """Return a stable English band label for Leefbaarometer classes 1-9."""
    return _CLASS_LABELS.get(raw, str(raw))


def _parse_dimensions(props: dict) -> list[LivabilityDimension]:
    """Extract 5 dimensions from WFS feature properties."""
    dims = []
    for class_field, deviation_field, name in DIMENSION_MAP:
        raw = props.get(class_field)
        raw_int = _safe_int(raw)
        if raw_int is not None:
            dims.append(LivabilityDimension(
                name=name,
                raw_score=raw_int,
                normalized_score=_normalize_score(raw_int),
                class_label=_class_label(raw_int),
                deviation=_safe_float(props.get(deviation_field)),
                label_code=f"livability.dimension.{name}",
            ))
    return dims


async def _fetch_feature(
    type_name: str,
    rd_x: float,
    rd_y: float,
) -> dict | None:
    """Fetch a single WFS feature by point intersection."""
    params = {
        "service": "WFS",
        "version": "2.0.0",
        "request": "GetFeature",
        "typeName": type_name,
        "CQL_FILTER": f"INTERSECTS(geom,POINT({rd_x} {rd_y}))",
        "outputFormat": "application/json",
        "srsName": "EPSG:28992",
    }
    try:
        client = _client.get()
        resp = await client.get(settings.leefbaarometer_wfs_base, params=params)
        content_type = resp.headers.get("content-type", "")
        if "xml" in content_type or "html" in content_type:
            logger.warning("Leefbaarometer returned XML for %s", type_name)
            return None
        resp.raise_for_status()
        data = resp.json()
        features = data.get("features", [])
        if not features:
            return None
        return features[0].get("properties", {})
    except httpx.TimeoutException:
        logger.warning("Leefbaarometer timeout for %s", type_name)
        return None
    except Exception:
        logger.warning("Leefbaarometer error for %s", type_name, exc_info=True)
        return None


async def get_livability(rd_x: float, rd_y: float) -> LivabilityResponse | None:
    """Fetch current livability score for a point."""
    props = await _fetch_feature("lbm3:buurtscore24", rd_x, rd_y)
    if props is None:
        return None

    kscore_int = _safe_int(props.get("kscore"))
    if kscore_int is None:
        return None

    return LivabilityResponse(
        available=True,
        buurt_code=str(props.get("id", "")),
        buurt_name=str(props.get("name", "")),
        gemeente=str(props.get("gemeente", "")),
        year=str(props.get("year", "2024")),
        overall_score=kscore_int,
        overall_normalized=_normalize_score(kscore_int),
        overall_class=kscore_int,
        overall_class_label=_class_label(kscore_int),
        overall_deviation=_safe_float(props.get("afw")),
        dimensions=_parse_dimensions(props),
        source_date=str(props.get("year", "")),
    )


async def _fetch_year(
    year_suffix: str, rd_x: float, rd_y: float
) -> LivabilityTrendPoint | None:
    """Fetch a single historical year's score."""
    props = await _fetch_feature(f"lbm3:buurtscore{year_suffix}", rd_x, rd_y)
    if props is None:
        return None
    kscore_int = _safe_int(props.get("kscore"))
    if kscore_int is None:
        return None
    return LivabilityTrendPoint(
        year=str(props.get("year", f"20{year_suffix}")),
        overall_score=kscore_int,
        overall_normalized=_normalize_score(kscore_int),
        overall_class=kscore_int,
        overall_class_label=_class_label(kscore_int),
        overall_deviation=_safe_float(props.get("afw")),
        dimensions=_parse_dimensions(props),
    )


async def get_livability_trend(
    rd_x: float, rd_y: float
) -> list[LivabilityTrendPoint]:
    """Fetch historical trend data across 9 selected measurement years."""
    tasks = [_fetch_year(y, rd_x, rd_y) for y in HISTORICAL_YEARS]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    points = [r for r in results if isinstance(r, LivabilityTrendPoint)]
    points.sort(key=lambda p: p.year)
    return points


async def _fetch_comparison_row(
    type_name: str,
    level: Literal["buurt", "wijk", "gemeente"],
    rd_x: float,
    rd_y: float,
) -> LivabilityComparisonRow | None:
    """Fetch a single comparison row (wijk or gemeente)."""
    props = await _fetch_feature(type_name, rd_x, rd_y)
    if props is None:
        return None
    kscore_int = _safe_int(props.get("kscore"))
    if kscore_int is None:
        return None
    return LivabilityComparisonRow(
        level=level,
        name=str(props.get("name", "")),
        overall_score=kscore_int,
        overall_normalized=_normalize_score(kscore_int),
        overall_class=kscore_int,
        overall_class_label=_class_label(kscore_int),
        overall_deviation=_safe_float(props.get("afw")),
        dimensions=_parse_dimensions(props),
    )


async def get_livability_comparison(
    rd_x: float, rd_y: float
) -> LivabilityComparison | None:
    """Fetch wijk-level and gemeente-level scores for comparison."""
    wijk_task = _fetch_comparison_row("lbm3:wijkscore24", "wijk", rd_x, rd_y)
    gemeente_task = _fetch_comparison_row(
        "lbm3:gemeentescore24", "gemeente", rd_x, rd_y
    )
    wijk, gemeente = await asyncio.gather(
        wijk_task, gemeente_task, return_exceptions=True
    )

    rows: list[LivabilityComparisonRow] = []
    if isinstance(wijk, LivabilityComparisonRow):
        rows.append(wijk)
    if isinstance(gemeente, LivabilityComparisonRow):
        rows.append(gemeente)
    return LivabilityComparison(rows=rows) if rows else None
