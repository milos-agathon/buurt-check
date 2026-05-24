from __future__ import annotations

import logging
import re
import unicodedata
from copy import deepcopy
from typing import Any

import httpx

from app.config import settings
from app.models.match import (
    DataFreshnessStatus,
    MatchNeighborhoodLayerEndpoint,
    MatchNeighborhoodMapLayersResponse,
    MatchNeighborhoodSummaryResponse,
    Neighborhood,
)
from app.services.match.providers.seed import MVP_REGION_CONFIG_ID, SeedMockImporter

logger = logging.getLogger(__name__)

DATA_VERSION = "match-seed-v1"
NEIGHBORHOOD_RD_RADIUS_M = 800.0
DISPLAY_LNG_DELTA = 0.012
DISPLAY_LAT_DELTA = 0.008
SOURCE_REFS = ["seed_match_source"]
LIMITATIONS = ["match.results.limitations.mock_data"]
OFFICIAL_BOUNDARY_SOURCE_REF = "cbs_wijk_en_buurtkaart_2024"
OFFICIAL_BOUNDARY_SOURCE_NAME = "CBS Wijk- en Buurtkaart 2024 via PDOK"
OFFICIAL_BOUNDARY_UNAVAILABLE_LIMITATION = (
    "match.results.limitations.official_boundary_unavailable"
)
BOUNDARY_UNAVAILABLE_SOURCE_REF = "unavailable"
BOUNDARY_UNAVAILABLE_FALLBACK_REASON = "match.boundary.official_unavailable"
BOUNDARY_UNAVAILABLE_UI_KEY = "matchFirst.neighborhood.boundaryUnavailable"
BOUNDARY_COLLECTIONS = {
    "buurten": {
        "code_property": "buurtcode",
        "name_property": "buurtnaam",
    },
    "wijken": {
        "code_property": "wijkcode",
        "name_property": "wijknaam",
    },
}
_OFFICIAL_BOUNDARY_CACHE: dict[str, dict[str, object]] = {}
RD_REFERENCE_X = 155000.0
RD_REFERENCE_Y = 463000.0
WGS84_REFERENCE_LAT = 52.15517440
WGS84_REFERENCE_LNG = 5.38720621
RD_SCALE = 100000.0

RD_TO_WGS84_LAT_TERMS = (
    (0, 1, 3235.65389),
    (2, 0, -32.58297),
    (0, 2, -0.24750),
    (2, 1, -0.84978),
    (0, 3, -0.06550),
    (2, 2, -0.01709),
    (1, 0, -0.00738),
    (4, 0, 0.00530),
    (2, 3, -0.00039),
    (4, 1, 0.00033),
    (1, 1, -0.00012),
)

RD_TO_WGS84_LNG_TERMS = (
    (1, 0, 5260.52916),
    (1, 1, 105.94684),
    (1, 2, 2.45656),
    (3, 0, -0.81885),
    (1, 3, 0.05594),
    (3, 1, -0.05607),
    (0, 1, 0.01199),
    (3, 2, -0.00256),
    (1, 4, 0.00128),
    (0, 2, 0.00022),
    (2, 0, -0.00022),
    (5, 0, 0.00026),
)


class NeighborhoodNotFoundError(KeyError):
    """Raised when the selected neighborhood is absent from the active dataset."""


class BoundsParseError(ValueError):
    """Raised when an RD New bounds query cannot be parsed."""


class BuildingBoundsOutOfScopeError(ValueError):
    """Raised when a building layer request escapes the selected neighborhood."""


def _centroid_rd(neighborhood: Neighborhood) -> dict[str, float]:
    return {
        "x": float(neighborhood.centroid_rd_x or 155000.0),
        "y": float(neighborhood.centroid_rd_y or 463000.0),
    }


def rd_to_wgs84(x: float, y: float) -> dict[str, float]:
    dx = (x - RD_REFERENCE_X) / RD_SCALE
    dy = (y - RD_REFERENCE_Y) / RD_SCALE
    lat_seconds = sum(
        coefficient * (dx**p) * (dy**q)
        for p, q, coefficient in RD_TO_WGS84_LAT_TERMS
    )
    lng_seconds = sum(
        coefficient * (dx**p) * (dy**q)
        for p, q, coefficient in RD_TO_WGS84_LNG_TERMS
    )
    return {
        "lat": WGS84_REFERENCE_LAT + (lat_seconds / 3600.0),
        "lng": WGS84_REFERENCE_LNG + (lng_seconds / 3600.0),
    }


def wgs84_to_rd(lat: float, lng: float) -> dict[str, float]:
    x = RD_REFERENCE_X + ((lng - WGS84_REFERENCE_LNG) / 1.4612581) * RD_SCALE
    y = RD_REFERENCE_Y + ((lat - WGS84_REFERENCE_LAT) / 0.8987927) * RD_SCALE
    for _ in range(8):
        current = rd_to_wgs84(x, y)
        lat_error = current["lat"] - lat
        lng_error = current["lng"] - lng
        if abs(lat_error) < 1e-10 and abs(lng_error) < 1e-10:
            break

        epsilon_m = 0.5
        x_step = rd_to_wgs84(x + epsilon_m, y)
        y_step = rd_to_wgs84(x, y + epsilon_m)
        d_lng_dx = (x_step["lng"] - current["lng"]) / epsilon_m
        d_lng_dy = (y_step["lng"] - current["lng"]) / epsilon_m
        d_lat_dx = (x_step["lat"] - current["lat"]) / epsilon_m
        d_lat_dy = (y_step["lat"] - current["lat"]) / epsilon_m
        determinant = (d_lng_dx * d_lat_dy) - (d_lng_dy * d_lat_dx)
        if abs(determinant) < 1e-20:
            break

        delta_x = ((d_lat_dy * lng_error) - (d_lng_dy * lat_error)) / determinant
        delta_y = ((-d_lat_dx * lng_error) + (d_lng_dx * lat_error)) / determinant
        x -= delta_x
        y -= delta_y
        if abs(delta_x) < 0.001 and abs(delta_y) < 0.001:
            break
    return {"x": x, "y": y}


def rd_bounds_to_wgs84(bounds_rd: list[float]) -> list[float]:
    west, south, east, north = bounds_rd
    corners = [
        rd_to_wgs84(west, south),
        rd_to_wgs84(west, north),
        rd_to_wgs84(east, south),
        rd_to_wgs84(east, north),
    ]
    lngs = [corner["lng"] for corner in corners]
    lats = [corner["lat"] for corner in corners]
    return [
        round(min(lngs), 7),
        round(min(lats), 7),
        round(max(lngs), 7),
        round(max(lats), 7),
    ]


def wgs84_bounds_to_rd(bounds_wgs84: list[float]) -> list[float]:
    west, south, east, north = bounds_wgs84
    corners = [
        wgs84_to_rd(south, west),
        wgs84_to_rd(north, west),
        wgs84_to_rd(south, east),
        wgs84_to_rd(north, east),
    ]
    xs = [corner["x"] for corner in corners]
    ys = [corner["y"] for corner in corners]
    return [
        min(xs),
        min(ys),
        max(xs),
        max(ys),
    ]


def _centroid_wgs84(neighborhood: Neighborhood) -> dict[str, float]:
    if neighborhood.centroid_rd_x is not None and neighborhood.centroid_rd_y is not None:
        centroid = rd_to_wgs84(float(neighborhood.centroid_rd_x), float(neighborhood.centroid_rd_y))
        return {
            "lat": round(centroid["lat"], 7),
            "lng": round(centroid["lng"], 7),
        }
    return {
        "lat": float(neighborhood.centroid_lat or 52.2),
        "lng": float(neighborhood.centroid_lng or 5.3),
    }


def neighborhood_bounds_rd(neighborhood: Neighborhood) -> list[float]:
    centroid = _centroid_rd(neighborhood)
    return [
        centroid["x"] - NEIGHBORHOOD_RD_RADIUS_M,
        centroid["y"] - NEIGHBORHOOD_RD_RADIUS_M,
        centroid["x"] + NEIGHBORHOOD_RD_RADIUS_M,
        centroid["y"] + NEIGHBORHOOD_RD_RADIUS_M,
    ]


def display_bounds_wgs84(neighborhood: Neighborhood) -> list[float]:
    if neighborhood.centroid_rd_x is not None and neighborhood.centroid_rd_y is not None:
        return rd_bounds_to_wgs84(neighborhood_bounds_rd(neighborhood))
    centroid = _centroid_wgs84(neighborhood)
    return [
        round(centroid["lng"] - DISPLAY_LNG_DELTA, 7),
        round(centroid["lat"] - DISPLAY_LAT_DELTA, 7),
        round(centroid["lng"] + DISPLAY_LNG_DELTA, 7),
        round(centroid["lat"] + DISPLAY_LAT_DELTA, 7),
    ]


def _format_bbox(bounds_wgs84: list[float]) -> str:
    return ",".join(f"{value:.7f}".rstrip("0").rstrip(".") for value in bounds_wgs84)


def _official_boundary_cache_key(neighborhood: Neighborhood) -> str:
    code = neighborhood.official_code or ""
    name = neighborhood.name_nl or neighborhood.name_en or ""
    bounds = _format_bbox(display_bounds_wgs84(neighborhood))
    return f"{neighborhood.neighborhood_id}:{code}:{name}:{bounds}"


def _boundary_collections_for(neighborhood: Neighborhood) -> list[str]:
    code = (neighborhood.official_code or "").upper()
    preferred = "wijken" if code.startswith("WK") else "buurten"
    collections = [preferred]
    for collection in BOUNDARY_COLLECTIONS:
        if collection not in collections:
            collections.append(collection)
    return collections


def _normalize_label(value: str | None) -> str:
    if not value:
        return ""
    normalized = unicodedata.normalize("NFKD", value)
    normalized = normalized.encode("ascii", "ignore").decode("ascii")
    normalized = normalized.lower().replace("&", " en ")
    normalized = re.sub(r"[^a-z0-9]+", " ", normalized)
    return " ".join(normalized.split())


def _without_official_prefix(value: str) -> str:
    return re.sub(r"^wijk\s+\d+\s+", "", value).strip()


def _target_names(neighborhood: Neighborhood) -> set[str]:
    names = {
        _normalize_label(neighborhood.name_nl),
        _normalize_label(neighborhood.name_en),
    }
    return {name for name in names if name}


def _is_target_name_prefix_variant(official_name: str, target: str) -> bool:
    return (
        official_name.startswith(f"{target} ")
        or official_name.startswith(f"{target}-")
        or official_name.startswith(f"{target}/")
    )


def _is_position(value: Any) -> bool:
    return (
        isinstance(value, list)
        and len(value) >= 2
        and isinstance(value[0], int | float)
        and isinstance(value[1], int | float)
    )


def _is_valid_ring(value: Any) -> bool:
    return (
        isinstance(value, list)
        and len(value) >= 4
        and all(_is_position(point) for point in value)
    )


def _is_supported_boundary_geometry(geometry: Any) -> bool:
    if not isinstance(geometry, dict):
        return False
    geometry_type = geometry.get("type")
    coordinates = geometry.get("coordinates")
    if geometry_type == "Polygon":
        return isinstance(coordinates, list) and any(
            _is_valid_ring(ring) for ring in coordinates
        )
    if geometry_type == "MultiPolygon":
        return isinstance(coordinates, list) and any(
            isinstance(polygon, list) and any(_is_valid_ring(ring) for ring in polygon)
            for polygon in coordinates
        )
    return False


def _iter_boundary_positions(geometry: dict[str, Any]):
    geometry_type = geometry.get("type")
    coordinates = geometry.get("coordinates")
    if geometry_type == "Polygon" and isinstance(coordinates, list):
        for ring in coordinates:
            if not isinstance(ring, list):
                continue
            for point in ring:
                if _is_position(point):
                    yield point
    elif geometry_type == "MultiPolygon" and isinstance(coordinates, list):
        for polygon in coordinates:
            if not isinstance(polygon, list):
                continue
            for ring in polygon:
                if not isinstance(ring, list):
                    continue
                for point in ring:
                    if _is_position(point):
                        yield point


def boundary_display_bounds_wgs84(boundary: dict[str, object]) -> list[float] | None:
    geometry = boundary.get("geometry")
    if not isinstance(geometry, dict):
        return None
    positions = list(_iter_boundary_positions(geometry))
    if not positions:
        return None
    lngs = [float(point[0]) for point in positions]
    lats = [float(point[1]) for point in positions]
    return [
        round(min(lngs), 7),
        round(min(lats), 7),
        round(max(lngs), 7),
        round(max(lats), 7),
    ]


def _valid_boundary_ring(value: Any) -> list[list[float]]:
    if not isinstance(value, list):
        return []
    ring: list[list[float]] = []
    for point in value:
        if not _is_position(point):
            continue
        ring.append([float(point[0]), float(point[1])])
    return ring if len(ring) >= 3 else []


def boundary_polygons(boundary: dict[str, object]) -> list[list[list[list[float]]]]:
    geometry = boundary.get("geometry")
    if not isinstance(geometry, dict):
        return []
    geometry_type = geometry.get("type")
    coordinates = geometry.get("coordinates")
    if geometry_type == "Polygon" and isinstance(coordinates, list):
        rings = [
            ring
            for ring in (_valid_boundary_ring(candidate) for candidate in coordinates)
            if ring
        ]
        return [rings] if rings else []
    if geometry_type == "MultiPolygon" and isinstance(coordinates, list):
        polygons: list[list[list[list[float]]]] = []
        for polygon in coordinates:
            if not isinstance(polygon, list):
                continue
            rings = [
                ring
                for ring in (_valid_boundary_ring(candidate) for candidate in polygon)
                if ring
            ]
            if rings:
                polygons.append(rings)
        return polygons
    return []


def _point_on_segment(
    lng: float,
    lat: float,
    start: list[float],
    end: list[float],
) -> bool:
    start_lng, start_lat = start[:2]
    end_lng, end_lat = end[:2]
    cross = ((lng - start_lng) * (end_lat - start_lat)) - (
        (lat - start_lat) * (end_lng - start_lng)
    )
    if abs(cross) > 1e-12:
        return False
    length_squared = ((end_lng - start_lng) ** 2) + ((end_lat - start_lat) ** 2)
    if length_squared <= 1e-24:
        return ((lng - start_lng) ** 2) + ((lat - start_lat) ** 2) <= 1e-24
    dot = ((lng - start_lng) * (end_lng - start_lng)) + (
        (lat - start_lat) * (end_lat - start_lat)
    )
    if dot < 0:
        return False
    return dot <= length_squared


def _point_in_ring(lng: float, lat: float, ring: list[list[float]]) -> bool:
    if len(ring) < 3:
        return False
    inside = False
    for index, current in enumerate(ring):
        previous = ring[index - 1]
        if _point_on_segment(lng, lat, previous, current):
            return True
        current_lng, current_lat = current[:2]
        previous_lng, previous_lat = previous[:2]
        crosses = (current_lat > lat) != (previous_lat > lat)
        if not crosses:
            continue
        intersection_lng = (
            ((previous_lng - current_lng) * (lat - current_lat))
            / (previous_lat - current_lat)
        ) + current_lng
        if lng < intersection_lng:
            inside = not inside
    return inside


def wgs84_point_in_boundary(lng: float, lat: float, boundary: dict[str, object]) -> bool:
    polygons = boundary_polygons(boundary)
    if not polygons:
        return False
    return any(
        _point_in_ring(lng, lat, polygon[0])
        and not any(_point_in_ring(lng, lat, hole) for hole in polygon[1:])
        for polygon in polygons
    )


def wgs84_ring_within_boundary(
    ring: list[list[float]],
    boundary: dict[str, object],
) -> bool:
    return all(
        len(point) >= 2 and wgs84_point_in_boundary(float(point[0]), float(point[1]), boundary)
        for point in ring
    )


def _boundary_match_score(
    neighborhood: Neighborhood,
    collection: str,
    feature: dict[str, Any],
) -> int:
    properties = feature.get("properties")
    if not isinstance(properties, dict):
        return 0
    collection_config = BOUNDARY_COLLECTIONS[collection]
    official_code = str(properties.get(collection_config["code_property"]) or "").upper()
    official_name = _normalize_label(
        str(properties.get(collection_config["name_property"]) or "")
    )
    stripped_official_name = _without_official_prefix(official_name)
    seed_code = (neighborhood.official_code or "").upper()
    targets = _target_names(neighborhood)

    score = 0
    if seed_code and official_code == seed_code:
        score = 1000
    elif official_name in targets or stripped_official_name in targets:
        score = 800
    else:
        for target in targets:
            if _is_target_name_prefix_variant(stripped_official_name, target):
                score = max(score, 660)
            elif target and target in stripped_official_name:
                score = max(score, 520)
            elif stripped_official_name and stripped_official_name in target:
                score = max(score, 520)

    municipality = _normalize_label(str(properties.get("gemeentenaam") or ""))
    if score and municipality and municipality == _normalize_label(neighborhood.municipality):
        score += 20
    return score


def _official_boundary_feature(
    neighborhood: Neighborhood,
    collection: str,
    feature: dict[str, Any],
) -> dict[str, object]:
    collection_config = BOUNDARY_COLLECTIONS[collection]
    properties = feature.get("properties")
    if not isinstance(properties, dict):
        properties = {}
    official_code = str(properties.get(collection_config["code_property"]) or "")
    official_name = str(properties.get(collection_config["name_property"]) or "")
    geometry = deepcopy(feature["geometry"])
    return {
        "type": "Feature",
        "geometry": geometry,
        "properties": {
            "neighborhood_id": neighborhood.neighborhood_id,
            "boundary_ref": (
                f"{OFFICIAL_BOUNDARY_SOURCE_REF}:{collection}:{official_code}"
            ),
            "boundary_source": OFFICIAL_BOUNDARY_SOURCE_REF,
            "boundary_source_name": OFFICIAL_BOUNDARY_SOURCE_NAME,
            "boundary_freshness": DataFreshnessStatus.current,
            "display_coordinate_system": "WGS84",
            "official_code": official_code,
            "official_name": official_name,
            "official_collection": collection,
        },
    }


def _boundary_contains_neighborhood_centroid(
    neighborhood: Neighborhood,
    boundary: dict[str, object],
) -> bool:
    centroid = _centroid_wgs84(neighborhood)
    return wgs84_point_in_boundary(centroid["lng"], centroid["lat"], boundary)


def _bounds_intersect(
    first: list[float],
    second: list[float],
    *,
    tolerance: float = 1e-7,
) -> bool:
    first_west, first_south, first_east, first_north = first
    second_west, second_south, second_east, second_north = second
    return not (
        first_east < second_west - tolerance
        or second_east < first_west - tolerance
        or first_north < second_south - tolerance
        or second_north < first_south - tolerance
    )


def _boundary_intersects_neighborhood_bounds(
    neighborhood: Neighborhood,
    boundary: dict[str, object],
) -> bool:
    boundary_bounds = boundary_display_bounds_wgs84(boundary)
    if boundary_bounds is None:
        return False
    return _bounds_intersect(boundary_bounds, display_bounds_wgs84(neighborhood))


def _boundary_matches_neighborhood_scope(
    neighborhood: Neighborhood,
    boundary: dict[str, object],
    *,
    score: int,
) -> bool:
    if _boundary_contains_neighborhood_centroid(
        neighborhood,
        boundary,
    ):
        return True
    return score >= 660 and _boundary_intersects_neighborhood_bounds(
        neighborhood,
        boundary,
    )


def _select_official_boundary_candidate_with_score(
    neighborhood: Neighborhood,
    collection: str,
    payload: dict[str, Any],
) -> tuple[int, dict[str, object]] | None:
    if collection not in BOUNDARY_COLLECTIONS:
        return None
    features = payload.get("features")
    if not isinstance(features, list):
        return None

    best_feature: dict[str, Any] | None = None
    best_score = 0
    for candidate in features:
        if not isinstance(candidate, dict):
            continue
        geometry = candidate.get("geometry")
        if not _is_supported_boundary_geometry(geometry):
            continue
        score = _boundary_match_score(neighborhood, collection, candidate)
        boundary = _official_boundary_feature(neighborhood, collection, candidate)
        if score > best_score and _boundary_matches_neighborhood_scope(
            neighborhood,
            boundary,
            score=score,
        ):
            best_score = score
            best_feature = boundary

    if best_feature is None or best_score < 500:
        return None
    return best_score, best_feature


def select_official_boundary_candidate(
    neighborhood: Neighborhood,
    collection: str,
    payload: dict[str, Any],
) -> dict[str, object] | None:
    selected = _select_official_boundary_candidate_with_score(
        neighborhood,
        collection,
        payload,
    )
    if selected is None:
        return None
    return selected[1]


async def _fetch_official_boundary_collection(
    collection: str,
    bounds_wgs84: list[float],
) -> dict[str, Any]:
    url = (
        f"{settings.cbs_wijken_buurten_base.rstrip('/')}/collections/"
        f"{collection}/items"
    )
    timeout_seconds = settings.match_boundary_on_demand_timeout_seconds
    timeout = httpx.Timeout(timeout_seconds, connect=min(4.0, timeout_seconds))
    params = {
        "f": "json",
        "limit": str(settings.match_boundary_ogc_limit),
        "bbox": _format_bbox(bounds_wgs84),
    }
    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.get(
            url,
            params=params,
            headers={"Accept": "application/geo+json"},
        )
        response.raise_for_status()
        payload = response.json()
    if not isinstance(payload, dict):
        return {}
    return payload


async def fetch_official_boundary_feature(
    neighborhood: Neighborhood,
) -> dict[str, object] | None:
    cache_key = _official_boundary_cache_key(neighborhood)
    cached = _OFFICIAL_BOUNDARY_CACHE.get(cache_key)
    if cached is not None:
        return deepcopy(cached)

    bounds_wgs84 = display_bounds_wgs84(neighborhood)
    best_boundary: dict[str, object] | None = None
    best_score = 0
    for collection in _boundary_collections_for(neighborhood):
        try:
            payload = await _fetch_official_boundary_collection(collection, bounds_wgs84)
        except (httpx.HTTPError, ValueError) as exc:
            logger.warning(
                "CBS boundary lookup failed for %s in %s: %s",
                neighborhood.neighborhood_id,
                collection,
                exc,
            )
            continue
        selected = _select_official_boundary_candidate_with_score(
            neighborhood,
            collection,
            payload,
        )
        if selected is None:
            continue
        score, boundary = selected
        if score > best_score:
            best_score = score
            best_boundary = boundary
    if best_boundary is None:
        return None
    _OFFICIAL_BOUNDARY_CACHE[cache_key] = deepcopy(best_boundary)
    return best_boundary


def selected_boundary_feature(neighborhood: Neighborhood) -> dict[str, object]:
    """Compatibility helper: never represent a seed bbox as a boundary."""
    return unavailable_boundary_feature(neighborhood)


def unavailable_boundary_feature(neighborhood: Neighborhood) -> dict[str, object]:
    return {
        "type": "Feature",
        "geometry": {"type": "MultiPolygon", "coordinates": []},
        "properties": {
            "neighborhood_id": neighborhood.neighborhood_id,
            "boundary_ref": f"boundary_unavailable_{neighborhood.neighborhood_id}",
            "boundary_source": BOUNDARY_UNAVAILABLE_SOURCE_REF,
            "boundary_source_name": OFFICIAL_BOUNDARY_SOURCE_NAME,
            "boundary_freshness": DataFreshnessStatus.unavailable,
            "display_coordinate_system": "WGS84",
            "fallback_reason_code": BOUNDARY_UNAVAILABLE_FALLBACK_REASON,
        },
    }


def boundary_is_official(boundary: dict[str, object] | None) -> bool:
    if not isinstance(boundary, dict):
        return False
    properties = boundary.get("properties")
    boundary_source = properties.get("boundary_source") if isinstance(properties, dict) else None
    return boundary_source == OFFICIAL_BOUNDARY_SOURCE_REF and bool(boundary_polygons(boundary))


def bounds_rd_for_boundary_or_seed(
    neighborhood: Neighborhood,
    boundary: dict[str, object] | None,
) -> list[float]:
    if boundary_is_official(boundary):
        display_bounds = boundary_display_bounds_wgs84(boundary or {})
        if display_bounds is not None:
            return wgs84_bounds_to_rd(display_bounds)
    return neighborhood_bounds_rd(neighborhood)


async def selected_official_or_fallback_boundary_feature(
    neighborhood: Neighborhood,
) -> dict[str, object]:
    return await fetch_official_boundary_feature(neighborhood) or unavailable_boundary_feature(
        neighborhood
    )


def _boundary_source_refs(boundary: dict[str, object]) -> list[str]:
    properties = boundary.get("properties")
    boundary_source = None
    if isinstance(properties, dict):
        boundary_source = properties.get("boundary_source")
    refs = []
    if isinstance(boundary_source, str) and boundary_source != "match_seed":
        refs.append(boundary_source)
    for source_ref in SOURCE_REFS:
        if source_ref not in refs:
            refs.append(source_ref)
    return refs


def _map_layer_limitations(boundary: dict[str, object]) -> list[str]:
    limitations = list(LIMITATIONS)
    properties = boundary.get("properties")
    boundary_source = properties.get("boundary_source") if isinstance(properties, dict) else None
    if boundary_source != OFFICIAL_BOUNDARY_SOURCE_REF:
        limitations.append(OFFICIAL_BOUNDARY_UNAVAILABLE_LIMITATION)
    return limitations


async def load_seed_neighborhood(neighborhood_id: str) -> Neighborhood:
    seed = await SeedMockImporter().load_seed_data(MVP_REGION_CONFIG_ID)
    for neighborhood in seed.neighborhoods:
        if neighborhood.neighborhood_id == neighborhood_id:
            return neighborhood
    raise NeighborhoodNotFoundError(neighborhood_id)


def summarize_neighborhood(
    neighborhood: Neighborhood,
    boundary: dict[str, object] | None = None,
) -> MatchNeighborhoodSummaryResponse:
    boundary_available = boundary_is_official(boundary)
    boundary_properties = boundary.get("properties") if isinstance(boundary, dict) else {}
    boundary_display_bounds = (
        boundary_display_bounds_wgs84(boundary)
        if boundary_available and isinstance(boundary, dict)
        else None
    )
    return MatchNeighborhoodSummaryResponse(
        neighborhood_id=neighborhood.neighborhood_id,
        name=neighborhood.name_en or neighborhood.name_nl,
        municipality=neighborhood.municipality,
        centroid_rd=_centroid_rd(neighborhood),
        bounds_rd=bounds_rd_for_boundary_or_seed(neighborhood, boundary),
        display_centroid_wgs84=_centroid_wgs84(neighborhood),
        display_bounds_wgs84=boundary_display_bounds or display_bounds_wgs84(neighborhood),
        boundary_ref=(
            str(boundary_properties.get("boundary_ref"))
            if boundary_available and isinstance(boundary_properties, dict)
            else f"boundary_unavailable_{neighborhood.neighborhood_id}"
        ),
        source_refs=(
            [OFFICIAL_BOUNDARY_SOURCE_REF]
            if boundary_available
            else SOURCE_REFS
        ),
        freshness_status=(
            DataFreshnessStatus.current
            if boundary_available
            else DataFreshnessStatus.unavailable
        ),
        limitations=(
            LIMITATIONS
            if boundary_available
            else sorted({*LIMITATIONS, OFFICIAL_BOUNDARY_UNAVAILABLE_LIMITATION})
        ),
    )


async def get_neighborhood_summary(neighborhood_id: str) -> MatchNeighborhoodSummaryResponse:
    neighborhood = await load_seed_neighborhood(neighborhood_id)
    boundary = await fetch_official_boundary_feature(neighborhood)
    return summarize_neighborhood(neighborhood, boundary)


async def get_neighborhood_map_layers(
    neighborhood_id: str,
    *,
    session_id: str,
    result_set_id: str,
) -> MatchNeighborhoodMapLayersResponse:
    neighborhood = await load_seed_neighborhood(neighborhood_id)
    boundary = await selected_official_or_fallback_boundary_feature(neighborhood)
    boundary_available = boundary_is_official(boundary)
    display_bounds = boundary_display_bounds_wgs84(boundary) or display_bounds_wgs84(
        neighborhood
    )
    allowed_bounds_rd = bounds_rd_for_boundary_or_seed(neighborhood, boundary)
    return MatchNeighborhoodMapLayersResponse(
        neighborhood_id=neighborhood_id,
        session_id=session_id,
        result_set_id=result_set_id,
        allowed_bounds_rd=allowed_bounds_rd,
        display_bounds_wgs84=display_bounds,
        boundary=boundary,
        building_layer=MatchNeighborhoodLayerEndpoint(
            available=boundary_available,
            endpoint=f"/api/match/neighborhoods/{neighborhood_id}/buildings",
            fallback_reason_code=None if boundary_available else BOUNDARY_UNAVAILABLE_UI_KEY,
        ),
        amenity_layer=MatchNeighborhoodLayerEndpoint(
            endpoint=f"/api/match/neighborhoods/{neighborhood_id}/amenities",
            available=boundary_available,
            fallback_reason_code=None if boundary_available else BOUNDARY_UNAVAILABLE_UI_KEY,
        ),
        fallback_2d_available=True,
        source_refs=_boundary_source_refs(boundary),
        limitations=_map_layer_limitations(boundary),
    )


def parse_bounds_rd(value: str) -> list[float]:
    try:
        parsed = [float(item.strip()) for item in value.split(",")]
    except ValueError as exc:
        raise BoundsParseError("match.building_bounds_invalid") from exc
    if len(parsed) != 4:
        raise BoundsParseError("match.building_bounds_invalid")
    min_x, min_y, max_x, max_y = parsed
    if min_x >= max_x or min_y >= max_y:
        raise BoundsParseError("match.building_bounds_invalid")
    return parsed


def validate_building_bounds(
    requested_bounds_rd: list[float],
    allowed_bounds_rd: list[float],
    *,
    tolerance_m: float = 0.01,
) -> None:
    min_x, min_y, max_x, max_y = requested_bounds_rd
    allowed_min_x, allowed_min_y, allowed_max_x, allowed_max_y = allowed_bounds_rd
    if (
        min_x < allowed_min_x - tolerance_m
        or min_y < allowed_min_y - tolerance_m
        or max_x > allowed_max_x + tolerance_m
        or max_y > allowed_max_y + tolerance_m
    ):
        raise BuildingBoundsOutOfScopeError("match.building_bounds_out_of_scope")
