import logging
from typing import Any, Callable

import httpx

from app.config import settings
from app.models.neighborhood import (
    AgeProfile,
    NeighborhoodIndicator,
    NeighborhoodStats,
    NeighborhoodStatsResponse,
    UrbanizationLevel,
)
from app.services.http_client import LoopAwareClient

logger = logging.getLogger(__name__)

_client = LoopAwareClient(timeout=httpx.Timeout(15.0, connect=4.0))


def _is_sentinel(value: Any) -> bool:
    """CBS uses large negative values as no-data sentinels."""
    if not isinstance(value, (int, float)):
        return True
    return value <= -99990


def _safe_float(props: dict[str, Any], key: str) -> float | None:
    value = props.get(key)
    if value is None or _is_sentinel(value):
        return None
    return float(value)


def _normalize_property_value(value: float) -> float:
    """CBS 2023 reports gemiddelde_woningwaarde in thousands of euros."""
    return value * 1000 if 0 < value < 10000 else value


# National quartile thresholds (Q1, Q2, Q3) from CBS Wijken & Buurten 2024 statistics.
# Values below Q1 = quartile 1, Q1-Q2 = quartile 2, Q2-Q3 = quartile 3, above Q3 = quartile 4.
# For "lower is better" indicators (distances), quartile 1 = best.
_QUARTILE_THRESHOLDS: dict[str, tuple[float, float, float]] = {
    "bevolkingsdichtheid_inwoners_per_km2": (1000, 3000, 6000),
    "gemiddelde_huishoudsgrootte": (1.6, 2.0, 2.4),
    "percentage_eenpersoonshuishoudens": (25, 38, 50),
    "percentage_koopwoningen": (30, 55, 75),
    "gemiddelde_woningwaarde": (200000, 300000, 425000),
    "treinstation_gemiddelde_afstand_in_km": (2.0, 5.0, 10.0),
    "grote_supermarkt_gemiddelde_afstand_in_km": (0.5, 0.8, 1.5),
}


def _compute_quartile(key: str, value: float) -> int | None:
    thresholds = _QUARTILE_THRESHOLDS.get(key)
    if thresholds is None:
        return None
    q1, q2, q3 = thresholds
    if value <= q1:
        return 1
    if value <= q2:
        return 2
    if value <= q3:
        return 3
    return 4


def _make_indicator(
    props: dict[str, Any],
    key: str,
    unit: str | None = None,
    transform: Callable[[float], float] | None = None,
) -> NeighborhoodIndicator:
    value = _safe_float(props, key)
    if value is None:
        return NeighborhoodIndicator(available=False)
    if transform is not None:
        value = transform(value)
    quartile = _compute_quartile(key, value)
    return NeighborhoodIndicator(value=value, unit=unit, quartile=quartile)


def _parse_urbanization(props: dict[str, Any]) -> UrbanizationLevel:
    value = props.get("stedelijkheid_adressen_per_km2")
    if value is None or _is_sentinel(value):
        return UrbanizationLevel.unknown
    mapping = {
        1: UrbanizationLevel.very_urban,
        2: UrbanizationLevel.urban,
        3: UrbanizationLevel.moderate,
        4: UrbanizationLevel.rural,
        5: UrbanizationLevel.very_rural,
    }
    return mapping.get(int(value), UrbanizationLevel.unknown)


def _parse_age_profile(props: dict[str, Any]) -> AgeProfile:
    # Aggregate CBS age bands into 3 groups: 0-24, 25-64, 65+
    age_0_14 = _safe_float(props, "percentage_personen_0_tot_15_jaar")
    age_15_24 = _safe_float(props, "percentage_personen_15_tot_25_jaar")
    age_25_44 = _safe_float(props, "percentage_personen_25_tot_45_jaar")
    age_45_64 = _safe_float(props, "percentage_personen_45_tot_65_jaar")
    age_65_plus = _safe_float(props, "percentage_personen_65_jaar_en_ouder")

    # Sum bands (handle None values)
    age_0_24_val = None
    if age_0_14 is not None or age_15_24 is not None:
        age_0_24_val = (age_0_14 or 0.0) + (age_15_24 or 0.0)

    age_25_64_val = None
    if age_25_44 is not None or age_45_64 is not None:
        age_25_64_val = (age_25_44 or 0.0) + (age_45_64 or 0.0)

    return AgeProfile(
        age_0_24=age_0_24_val,
        age_25_64=age_25_64_val,
        age_65_plus=age_65_plus,
    )


def _parse_stats(feature: dict[str, Any]) -> NeighborhoodStats | None:
    props = feature.get("properties") or {}
    buurt_code = props.get("buurtcode")
    if not buurt_code:
        return None

    return NeighborhoodStats(
        buurt_code=buurt_code,
        buurt_name=props.get("buurtnaam"),
        gemeente_name=props.get("gemeentenaam"),
        population_density=_make_indicator(
            props, "bevolkingsdichtheid_inwoners_per_km2", "per km\u00b2"
        ),
        avg_household_size=_make_indicator(
            props, "gemiddelde_huishoudsgrootte"
        ),
        single_person_pct=_make_indicator(
            props, "percentage_eenpersoonshuishoudens", "%"
        ),
        age_profile=_parse_age_profile(props),
        owner_occupied_pct=_make_indicator(
            props, "percentage_koopwoningen", "%"
        ),
        avg_property_value=_make_indicator(
            props, "gemiddelde_woningwaarde", "\u20ac", transform=_normalize_property_value
        ),
        distance_to_train_km=_make_indicator(
            props, "treinstation_gemiddelde_afstand_in_km", "km"
        ),
        distance_to_supermarket_km=_make_indicator(
            props, "grote_supermarkt_gemiddelde_afstand_in_km", "km"
        ),
        urbanization=_parse_urbanization(props),
    )


def _point_in_ring(x: float, y: float, ring: list[list[float]]) -> bool:
    if len(ring) < 3:
        return False
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        intersects = ((yi > y) != (yj > y)) and (
            x < (xj - xi) * (y - yi) / (yj - yi) + xi
        )
        if intersects:
            inside = not inside
        j = i
    return inside


def _point_in_polygon(
    x: float, y: float, rings: list[list[list[float]]]
) -> bool:
    """Check if point is in polygon, respecting holes (inner rings)."""
    if not rings:
        return False
    if not _point_in_ring(x, y, rings[0]):
        return False
    for hole in rings[1:]:
        if _point_in_ring(x, y, hole):
            return False
    return True


def _geometry_contains_point(
    geom: dict[str, Any] | None, x: float, y: float
) -> bool:
    if not geom:
        return False
    geom_type = geom.get("type")
    coords = geom.get("coordinates")
    if not coords:
        return False
    if geom_type == "Polygon":
        return _point_in_polygon(x, y, coords)
    if geom_type in {"MultiPolygon", "MultiSurface"}:
        return any(_point_in_polygon(x, y, polygon) for polygon in coords)
    return False


async def _fetch_by_buurt_code(buurt_code: str) -> dict[str, Any] | None:
    client = _client.get()
    resp = await client.get(
        f"{settings.cbs_wijken_buurten_base}/collections/buurten/items",
        params={
            "buurtcode": buurt_code,
            "f": "json",
            "limit": "1",
        },
    )
    resp.raise_for_status()
    data = resp.json()
    features = data.get("features") or []
    return features[0] if features else None


async def _fetch_by_buurt_code_from_base(
    buurt_code: str, base_url: str
) -> dict[str, Any] | None:
    client = _client.get()
    resp = await client.get(
        f"{base_url}/collections/buurten/items",
        params={
            "buurtcode": buurt_code,
            "f": "json",
            "limit": "1",
        },
    )
    resp.raise_for_status()
    data = resp.json()
    features = data.get("features") or []
    return features[0] if features else None


def _needs_housing_access_backfill(stats: NeighborhoodStats) -> bool:
    return any(
        indicator.value is None or not indicator.available
        for indicator in (
            stats.owner_occupied_pct,
            stats.avg_property_value,
            stats.distance_to_train_km,
            stats.distance_to_supermarket_km,
        )
    )


def _merge_missing_housing_access(
    primary: NeighborhoodStats, fallback: NeighborhoodStats
) -> NeighborhoodStats:
    def pick(
        current: NeighborhoodIndicator, fallback_indicator: NeighborhoodIndicator
    ) -> NeighborhoodIndicator:
        if current.available and current.value is not None:
            return current
        return fallback_indicator

    return primary.model_copy(
        update={
            "owner_occupied_pct": pick(primary.owner_occupied_pct, fallback.owner_occupied_pct),
            "avg_property_value": pick(primary.avg_property_value, fallback.avg_property_value),
            "distance_to_train_km": pick(
                primary.distance_to_train_km, fallback.distance_to_train_km
            ),
            "distance_to_supermarket_km": pick(
                primary.distance_to_supermarket_km,
                fallback.distance_to_supermarket_km,
            ),
        }
    )


async def _fetch_by_bbox(lat: float, lng: float) -> dict[str, Any] | None:
    delta = 0.001
    bbox = f"{lng - delta},{lat - delta},{lng + delta},{lat + delta}"
    client = _client.get()
    resp = await client.get(
        f"{settings.cbs_wijken_buurten_base}/collections/buurten/items",
        params={
            "bbox": bbox,
            "f": "json",
            "limit": "5",
        },
    )
    resp.raise_for_status()
    data = resp.json()
    features = data.get("features") or []
    if not features:
        return None

    # Point-in-polygon to find the buurt that actually contains the point
    for feat in features:
        geom = feat.get("geometry")
        if _geometry_contains_point(geom, lng, lat):
            return feat

    # Fallback: return first feature
    return features[0]


async def get_neighborhood_stats(
    *,
    vbo_id: str,
    lat: float,
    lng: float,
    buurt_code: str | None = None,
) -> NeighborhoodStatsResponse:
    """Fetch CBS neighborhood statistics for a resolved address."""
    feature = None
    source = "CBS (Statistics Netherlands)"

    # Primary: direct buurt_code lookup
    if buurt_code:
        try:
            feature = await _fetch_by_buurt_code(buurt_code)
        except Exception:
            logger.warning("CBS fetch by buurt_code=%s failed, trying bbox", buurt_code)

    # Fallback: bbox around coordinates
    if feature is None:
        try:
            feature = await _fetch_by_bbox(lat, lng)
        except Exception:
            logger.exception("CBS fetch by bbox failed for vbo=%s", vbo_id)
            return NeighborhoodStatsResponse(
                address_id=vbo_id,
                message="CBS_LOOKUP_FAILED",
            )

    if feature is None:
        return NeighborhoodStatsResponse(
            address_id=vbo_id,
            message="CBS_NO_BUURT_FOUND",
        )

    stats = _parse_stats(feature)
    if stats is None:
        return NeighborhoodStatsResponse(
            address_id=vbo_id,
            message="CBS_PARSE_FAILED",
        )

    # CBS 2024 currently returns -99995 sentinels for several
    # housing/access fields in many buurten; backfill missing values from 2023.
    if _needs_housing_access_backfill(stats):
        try:
            legacy_feature = await _fetch_by_buurt_code_from_base(
                stats.buurt_code, settings.cbs_wijken_buurten_fallback_base
            )
        except Exception:
            legacy_feature = None
            logger.warning(
                "CBS 2023 fallback fetch failed for buurt_code=%s", stats.buurt_code
            )
        if legacy_feature is not None:
            legacy_stats = _parse_stats(legacy_feature)
            if legacy_stats is not None:
                stats = _merge_missing_housing_access(stats, legacy_stats)
                if not _needs_housing_access_backfill(stats):
                    source = "CBS (Statistics Netherlands)"

    return NeighborhoodStatsResponse(
        address_id=vbo_id,
        stats=stats,
        source=source,
    )
