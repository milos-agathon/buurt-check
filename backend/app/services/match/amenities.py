from __future__ import annotations

import asyncio
import html
import logging
import re
import struct
from collections.abc import Iterable
from copy import deepcopy
from datetime import UTC, datetime

import httpx

from app.config import settings
from app.models.match import (
    MatchNeighborhoodAmenitiesResponse,
    MatchNeighborhoodAmenityPoint,
    MatchNeighborhoodAmenityTag,
    MatchNeighborhoodAmenityUnavailable,
    MatchSessionResponse,
    Neighborhood,
)
from app.services.match.amenity_store import StoredAmenityRecord
from app.services.match.geometry import (
    LIMITATIONS,
    OFFICIAL_BOUNDARY_SOURCE_NAME,
    OFFICIAL_BOUNDARY_UNAVAILABLE_LIMITATION,
    boundary_display_bounds_wgs84,
    boundary_is_official,
    display_bounds_wgs84,
    fetch_official_boundary_feature,
    load_seed_neighborhood,
    wgs84_bounds_to_rd,
    wgs84_point_in_boundary,
)
from app.services.match.providers.amenities import (
    OFFICIAL_AMENITY_CATEGORIES,
    OFFICIAL_AMENITY_MARKER_SHAPES,
    OfficialAmenityCategory,
    load_amenity_source_versions,
    load_official_amenity_records,
)
from app.services.match.sessions import get_match_session

logger = logging.getLogger(__name__)

MAX_VISIBLE_AMENITY_CAP = 7
DEFAULT_VISIBLE_AMENITY_CAP = MAX_VISIBLE_AMENITY_CAP
AMENITY_CACHE_VERSION = "no-paid-marker-stack-v2"
GEOMETRY_AMENITY_KEYS = {"parks_green"}
ADDRESS_AMENITY_KEYS = {"schools", "childcare"}
OPEN_POI_AMENITY_KEYS = {
    "daily_shops",
    "cafes_restaurants",
    "healthcare",
    "libraries_culture",
}
POINT_AMENITY_KEYS = {
    "transit",
    "parking",
    "ev_charging",
    "swimming_water",
    *OPEN_POI_AMENITY_KEYS,
}
LIVE_ON_DEMAND_AMENITY_KEYS = GEOMETRY_AMENITY_KEYS | ADDRESS_AMENITY_KEYS | POINT_AMENITY_KEYS
TRANSIT_SOURCE_REF = "pzh_ov_haltes_nl_actueel"
TRANSIT_SOURCE_NAME = "OV-haltes Nederland actueel WFS (Provincie Zuid-Holland, OSM-derived)"
RDW_PARKING_RESOURCE = "k3dr-ge3w.json"
DOTNL_EV_SOURCE_REF = "ndw_dot_nl_charging_points"
DOTNL_EV_SOURCE_NAME = "NDW DOT-NL public charging points GeoJSON"
ZWEMWATER_SOURCE_REF = "zwemwater_official_bathing_locations"
ZWEMWATER_SOURCE_NAME = "Zwemwater.nl official bathing water locations"
OVERTURE_SOURCE_NAME = "Overture Places open POI data"
OVERTURE_SOURCE_REFS: dict[str, str] = {
    "daily_shops": "overture_places_daily_shops",
    "cafes_restaurants": "overture_places_cafes_restaurants",
    "healthcare": "overture_places_healthcare",
    "libraries_culture": "overture_places_libraries_culture",
}
LIVE_SOURCE_NAMES: dict[str, str] = {
    "transit": TRANSIT_SOURCE_NAME,
    "parking": "RDW / Nationaal Parkeerregister open parking data",
    "ev_charging": DOTNL_EV_SOURCE_NAME,
    "swimming_water": ZWEMWATER_SOURCE_NAME,
    "daily_shops": OVERTURE_SOURCE_NAME,
    "cafes_restaurants": OVERTURE_SOURCE_NAME,
    "healthcare": OVERTURE_SOURCE_NAME,
    "libraries_culture": OVERTURE_SOURCE_NAME,
    "parks_green": "PDOK BGT/BRT green-space geometry",
    "schools": "DUO Open Onderwijsdata school vestigingen matched to BAG",
    "childcare": "Landelijk Register Kinderopvang matched to BAG",
}
_ZWEMWATER_CARD_RE = re.compile(
    r"<div\s+class=\"card\"\s+(?P<attrs>[^>]*data-coordinates[^>]*)>",
    re.IGNORECASE,
)
_ZWEMWATER_ATTR_RE = re.compile(r"(data-[\w-]+)=\"([^\"]*)\"")
_ZWEMWATER_ROWS_CACHE: tuple[str, list[dict[str, object]]] | None = None

_AMENITY_RESPONSE_CACHE: dict[str, MatchNeighborhoodAmenitiesResponse] = {}


async def selected_official_or_fallback_boundary_feature(
    neighborhood: Neighborhood,
) -> dict[str, object] | None:
    """Return an official selected-neighborhood boundary, never a seed bbox."""
    return await fetch_official_boundary_feature(neighborhood)


PREFERENCE_AMENITIES: dict[str, list[tuple[str, str, int]]] = {
    "green_access": [
        ("parks_green", "green_space_priority", 95),
    ],
    "calmness": [
        ("parks_green", "calmness_priority", 82),
    ],
    "public_transport": [
        ("transit", "transport_priority", 95),
    ],
    "schools_childcare": [
        ("schools", "family_priority", 95),
        ("childcare", "family_priority", 88),
    ],
    "amenities": [
        ("daily_shops", "daily_amenities_priority", 90),
        ("cafes_restaurants", "daily_amenities_priority", 84),
        ("healthcare", "daily_amenities_priority", 83),
        ("ev_charging", "daily_amenities_priority", 82),
        ("libraries_culture", "daily_amenities_priority", 81),
        ("parking", "daily_amenities_priority", 74),
        ("transit", "daily_amenities_priority", 73),
    ],
    "environmental_quality": [
        ("parks_green", "environmental_quality_priority", 86),
        ("swimming_water", "environmental_quality_priority", 85),
    ],
    "parks_nearby": [("parks_green", "must_have_match", 94)],
    "good_transit": [("transit", "must_have_match", 94)],
    "schools_nearby": [("schools", "must_have_match", 94)],
    "daily_shops": [("daily_shops", "must_have_match", 94)],
    "low_traffic": [("parks_green", "must_have_match", 78)],
    "bike_friendly": [("transit", "must_have_match", 76)],
}

DEFAULT_AMENITIES: list[tuple[str, str, int]] = [
    ("parks_green", "default_context", 68),
    ("transit", "default_context", 66),
    ("daily_shops", "default_context", 64),
    ("schools", "default_context", 62),
    ("childcare", "default_context", 60),
    ("parking", "default_context", 56),
    ("ev_charging", "default_context", 54),
    ("cafes_restaurants", "default_context", 52),
]


def _string_list(value: object) -> list[str]:
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, str)]


def _preference_keys(session: MatchSessionResponse) -> Iterable[str]:
    answers = session.answers
    yield from _string_list(answers.get("lifestyle_priorities"))
    yield from _string_list(answers.get("must_haves"))


def _tag(amenity_key: str, reason_code: str, relevance: int) -> MatchNeighborhoodAmenityTag:
    return MatchNeighborhoodAmenityTag(
        amenity_key=amenity_key,
        label_key=f"matchFirst.amenity.{amenity_key}",
        reason_code=reason_code,
        source_refs=[f"marker_source:{amenity_key}"],
        relevance=relevance,
    )


def _cache_key(
    neighborhood_id: str,
    bounds_wgs84: list[float],
    categories: tuple[OfficialAmenityCategory, ...],
    limit: int,
    source_versions: dict[str, str] | None = None,
) -> str:
    bbox = ",".join(f"{value:.7f}" for value in bounds_wgs84)
    effective_versions = source_versions or {}
    versions = ",".join(
        f"{category}:{effective_versions.get(category, 'source_unconfigured')}"
        for category in categories
    )
    return (
        f"{AMENITY_CACHE_VERSION}|neighborhood={neighborhood_id}|bbox={bbox}|"
        f"categories={','.join(categories)}|versions={versions}|limit={limit}"
    )


def _copy_response(
    response: MatchNeighborhoodAmenitiesResponse,
) -> MatchNeighborhoodAmenitiesResponse:
    return response.model_validate(deepcopy(response.model_dump(mode="python")))


def clear_amenity_response_cache() -> None:
    _AMENITY_RESPONSE_CACHE.clear()


def _source_refs_for_points(points: list[MatchNeighborhoodAmenityPoint]) -> list[str]:
    return sorted({source_ref for point in points for source_ref in point.source_refs})


def _point_for_record(
    neighborhood_id: str,
    record,
    tag: MatchNeighborhoodAmenityTag,
) -> MatchNeighborhoodAmenityPoint:
    record_id = record.record_id or f"{record.source_ref}:{record.category_key}"
    return MatchNeighborhoodAmenityPoint(
        point_id=f"amenity_{neighborhood_id}_{record.category_key}_{record_id}",
        amenity_key=record.category_key,
        category_key=record.category_key,
        label_key=tag.label_key,
        name=record.name,
        marker_shape=OFFICIAL_AMENITY_MARKER_SHAPES[record.category_key],
        display_lat=record.display_lat,
        display_lng=record.display_lng,
        source_name=record.source_name,
        source_record_id=record.record_id,
        freshness_date=record.freshness_date,
        loaded_at=record.loaded_at,
        source_coordinate_system=record.source_coordinate_system,
        source_geometry=record.source_geometry,
        source_geometry_coordinate_system=record.source_geometry_coordinate_system,
        source_refs=[record.source_ref],
        relevance=tag.relevance,
    )


def _dedupe_points(
    points: list[MatchNeighborhoodAmenityPoint],
) -> list[MatchNeighborhoodAmenityPoint]:
    deduped: list[MatchNeighborhoodAmenityPoint] = []
    seen: set[str] = set()
    for point in points:
        identity = (
            point.point_id
            or f"{point.amenity_key}:{point.source_refs[0] if point.source_refs else ''}:"
            f"{point.display_lat:.7f}:{point.display_lng:.7f}"
        )
        if identity in seen:
            continue
        seen.add(identity)
        deduped.append(point)
    return deduped


def _limit_points(
    points: list[MatchNeighborhoodAmenityPoint],
) -> list[MatchNeighborhoodAmenityPoint]:
    limit = max(1, settings.match_amenity_point_limit)
    if len(points) <= limit:
        return points

    by_category: dict[str, list[MatchNeighborhoodAmenityPoint]] = {}
    for point in points:
        by_category.setdefault(point.amenity_key, []).append(point)

    limited: list[MatchNeighborhoodAmenityPoint] = []
    category_index = 0
    categories = list(by_category)
    while len(limited) < limit and categories:
        category = categories[category_index % len(categories)]
        bucket = by_category[category]
        if bucket:
            limited.append(bucket.pop(0))
        if not bucket:
            categories.remove(category)
            if not categories:
                break
            category_index %= len(categories)
            continue
        category_index += 1
    return limited


def _filter_points_to_boundary(
    points: list[MatchNeighborhoodAmenityPoint],
    boundary: dict[str, object],
) -> list[MatchNeighborhoodAmenityPoint]:
    return [
        point
        for point in points
        if wgs84_point_in_boundary(point.display_lng, point.display_lat, boundary)
    ]


def _row_text(row: dict[str, object], *keys: str) -> str:
    for key in keys:
        value = row.get(key)
        if value not in (None, ""):
            return str(value).strip()
    return ""


def _row_float(row: dict[str, object], *keys: str) -> float | None:
    for key in keys:
        value = row.get(key)
        if value in (None, ""):
            continue
        try:
            return float(value)
        except (TypeError, ValueError):
            continue
    return None


def _in_wgs84_bounds(
    bounds_wgs84: tuple[float, float, float, float],
    *,
    lat: float,
    lng: float,
) -> bool:
    west, south, east, north = bounds_wgs84
    return west <= lng <= east and south <= lat <= north


def _parse_rdw_timestamp(value: object) -> datetime | None:
    if value in (None, ""):
        return None
    digits = "".join(character for character in str(value) if character.isdigit())
    if len(digits) < 8:
        return None
    timestamp = digits[:14].ljust(14, "0")
    try:
        return datetime.strptime(timestamp, "%Y%m%d%H%M%S").replace(tzinfo=UTC)
    except ValueError:
        return None


def _rdw_parking_row_is_active(row: dict[str, object], *, now: datetime) -> bool:
    start = _parse_rdw_timestamp(row.get("startdatelocation"))
    end = _parse_rdw_timestamp(row.get("enddatelocation"))
    return (start is None or start <= now) and (end is None or end >= now)


async def _fetch_transit_stop_features(
    bounds_wgs84: tuple[float, float, float, float],
    *,
    timeout_seconds: float,
) -> list[dict[str, object]]:
    west, south, east, north = bounds_wgs84
    row_limit = min(max(settings.match_amenity_point_limit * 4, 100), 500)
    async with httpx.AsyncClient(
        timeout=httpx.Timeout(timeout_seconds),
        follow_redirects=True,
    ) as client:
        response = await client.get(
            settings.match_amenity_transit_wfs_base,
            params={
                "service": "WFS",
                "version": "2.0.0",
                "request": "GetFeature",
                "typeNames": settings.match_amenity_transit_wfs_type_name,
                "bbox": f"{west},{south},{east},{north},EPSG:4326",
                "srsName": "EPSG:4326",
                "outputFormat": "application/json",
                "count": str(row_limit),
            },
        )
        response.raise_for_status()
        payload = response.json()
    features = payload.get("features") if isinstance(payload, dict) else None
    return features if isinstance(features, list) else []


async def _fetch_rdw_parking_rows(
    bounds_wgs84: tuple[float, float, float, float],
    *,
    timeout_seconds: float,
) -> list[dict[str, object]]:
    west, south, east, north = bounds_wgs84
    row_limit = min(max(settings.match_amenity_point_limit * 4, 100), 500)
    where = f"latitude between {south} and {north} AND longitude between {west} and {east}"
    async with httpx.AsyncClient(
        timeout=httpx.Timeout(timeout_seconds),
        follow_redirects=True,
    ) as client:
        response = await client.get(
            f"{settings.rdw_parking_base.rstrip('/')}/resource/{RDW_PARKING_RESOURCE}",
            params={
                "$limit": str(row_limit),
                "$select": (
                    "locationreferencetype,locationreference,startdatelocation,"
                    "enddatelocation,longitude,latitude"
                ),
                "$where": where,
                "$order": "latitude,longitude",
            },
        )
        response.raise_for_status()
        payload = response.json()
    return payload if isinstance(payload, list) else []


async def _fetch_dotnl_ev_features(
    bounds_wgs84: tuple[float, float, float, float],
    *,
    timeout_seconds: float,
) -> list[dict[str, object]]:
    west, south, east, north = bounds_wgs84
    async with httpx.AsyncClient(
        timeout=httpx.Timeout(timeout_seconds),
        follow_redirects=True,
    ) as client:
        response = await client.get(
            settings.match_amenity_ev_charging_geojson_base,
            params={"bbox": f"{west},{south},{east},{north}"},
        )
        response.raise_for_status()
        payload = response.json()
    features = payload.get("features") if isinstance(payload, dict) else None
    return features if isinstance(features, list) else []


async def _fetch_zwemwater_rows(*, timeout_seconds: float) -> list[dict[str, object]]:
    global _ZWEMWATER_ROWS_CACHE

    cache_version = datetime.now(UTC).date().isoformat()
    if _ZWEMWATER_ROWS_CACHE is not None and _ZWEMWATER_ROWS_CACHE[0] == cache_version:
        return _ZWEMWATER_ROWS_CACHE[1]

    async with httpx.AsyncClient(
        timeout=httpx.Timeout(timeout_seconds),
        follow_redirects=True,
    ) as client:
        response = await client.get(settings.match_amenity_zwemwater_locations_url)
        response.raise_for_status()
        page_html = response.text

    rows: list[dict[str, object]] = []
    for card in _ZWEMWATER_CARD_RE.finditer(page_html):
        attrs = {
            key: html.unescape(value)
            for key, value in _ZWEMWATER_ATTR_RE.findall(card.group("attrs"))
        }
        coordinates = attrs.get("data-coordinates", "").strip("[]")
        parts = [part.strip() for part in coordinates.split(",")]
        if len(parts) != 2:
            continue
        try:
            lat = float(parts[0])
            lng = float(parts[1])
        except ValueError:
            continue
        rows.append(
            {
                "spot_id": attrs.get("data-spotid") or attrs.get("data-locationid"),
                "location_id": attrs.get("data-locationid"),
                "title": attrs.get("data-title") or "Zwemwater.nl zwemplek",
                "status": attrs.get("data-status") or "",
                "lat": lat,
                "lng": lng,
            }
        )

    _ZWEMWATER_ROWS_CACHE = (cache_version, rows)
    return rows


async def _transit_records_for_bounds(
    bounds_wgs84: tuple[float, float, float, float],
    loaded_at: datetime,
) -> list[StoredAmenityRecord]:
    records: list[StoredAmenityRecord] = []
    seen: set[str] = set()
    features = await _fetch_transit_stop_features(
        bounds_wgs84,
        timeout_seconds=settings.match_amenity_on_demand_timeout_seconds,
    )
    for index, feature in enumerate(features):
        if not isinstance(feature, dict):
            continue
        properties = feature.get("properties")
        if not isinstance(properties, dict):
            properties = {}
        geometry = feature.get("geometry")
        if not isinstance(geometry, dict) or geometry.get("type") != "Point":
            continue
        coordinates = geometry.get("coordinates")
        if not isinstance(coordinates, list) or len(coordinates) < 2:
            continue
        try:
            lng = float(coordinates[0])
            lat = float(coordinates[1])
        except (TypeError, ValueError):
            continue
        if lat is None or lng is None:
            continue
        if not _in_wgs84_bounds(bounds_wgs84, lat=lat, lng=lng):
            continue
        record_id = str(
            feature.get("id")
            or properties.get("Halte_osm_id")
            or properties.get("OBJECTID")
            or f"transit-{index}"
        )
        if record_id in seen:
            continue
        seen.add(record_id)
        name = _row_text(properties, "Naam", "naam", "Type_halte") or record_id
        freshness_date = (
            _row_text(properties, "Laatste_dataupdate_pzh", "laatste_dataupdate_pzh")[:10]
            or loaded_at.date().isoformat()
        )
        records.append(
            StoredAmenityRecord(
                category_key="transit",
                record_id=record_id,
                name=name,
                source_name=TRANSIT_SOURCE_NAME,
                source_ref=TRANSIT_SOURCE_REF,
                source_version=freshness_date,
                freshness_date=freshness_date,
                loaded_at=loaded_at,
                display_lat=lat,
                display_lng=lng,
                source_coordinate_system="EPSG:4326",
                source_geometry_coordinate_system="EPSG:4326",
                source_geometry=geometry,
                limitations=(
                    "match.amenities.limitations.official_source_coverage_varies",
                ),
            )
        )
    return sorted(records, key=lambda item: item.record_id or item.name)


async def _ev_charging_records_for_bounds(
    bounds_wgs84: tuple[float, float, float, float],
    loaded_at: datetime,
) -> list[StoredAmenityRecord]:
    records: list[StoredAmenityRecord] = []
    seen: set[str] = set()
    features = await _fetch_dotnl_ev_features(
        bounds_wgs84,
        timeout_seconds=settings.match_amenity_on_demand_timeout_seconds,
    )
    for index, feature in enumerate(features):
        if not isinstance(feature, dict):
            continue
        properties = feature.get("properties")
        if not isinstance(properties, dict):
            properties = {}
        geometry = feature.get("geometry")
        if not isinstance(geometry, dict) or geometry.get("type") != "Point":
            continue
        coordinates = geometry.get("coordinates")
        if not isinstance(coordinates, list) or len(coordinates) < 2:
            continue
        try:
            lng = float(coordinates[0])
            lat = float(coordinates[1])
        except (TypeError, ValueError):
            continue
        if not _in_wgs84_bounds(bounds_wgs84, lat=lat, lng=lng):
            continue
        record_id = str(feature.get("id") or f"dotnl-charge-point-{index}")
        if record_id in seen:
            continue
        seen.add(record_id)
        address = _row_text(properties, "address")
        operator = _row_text(properties, "operator_name", "owner_name", "cpo_id")
        freshness = _row_text(properties, "last_updated")[:10] or loaded_at.date().isoformat()
        records.append(
            StoredAmenityRecord(
                category_key="ev_charging",
                record_id=record_id,
                name=" - ".join(part for part in (address, operator) if part)
                or "DOT-NL charging point",
                source_name=DOTNL_EV_SOURCE_NAME,
                source_ref=DOTNL_EV_SOURCE_REF,
                source_version=freshness,
                freshness_date=freshness,
                loaded_at=loaded_at,
                display_lat=lat,
                display_lng=lng,
                source_coordinate_system="EPSG:4326",
                source_geometry_coordinate_system="EPSG:4326",
                source_geometry=geometry,
                limitations=(
                    "match.amenities.limitations.official_source_coverage_varies",
                ),
            )
        )
    return sorted(records, key=lambda item: item.record_id or item.name)


async def _swimming_water_records_for_bounds(
    bounds_wgs84: tuple[float, float, float, float],
    loaded_at: datetime,
) -> list[StoredAmenityRecord]:
    records: list[StoredAmenityRecord] = []
    seen: set[str] = set()
    rows = await _fetch_zwemwater_rows(
        timeout_seconds=settings.match_amenity_on_demand_timeout_seconds,
    )
    for index, row in enumerate(rows):
        lat = _row_float(row, "lat")
        lng = _row_float(row, "lng")
        if lat is None or lng is None:
            continue
        if not _in_wgs84_bounds(bounds_wgs84, lat=lat, lng=lng):
            continue
        record_id = _row_text(row, "spot_id", "location_id") or f"zwemwater-{index}"
        if record_id in seen:
            continue
        seen.add(record_id)
        status = _row_text(row, "status")
        title = _row_text(row, "title") or "Zwemwater.nl zwemplek"
        records.append(
            StoredAmenityRecord(
                category_key="swimming_water",
                record_id=record_id,
                name=f"{title} ({status})" if status else title,
                source_name=ZWEMWATER_SOURCE_NAME,
                source_ref=ZWEMWATER_SOURCE_REF,
                source_version=loaded_at.date().isoformat(),
                freshness_date=loaded_at.date().isoformat(),
                loaded_at=loaded_at,
                display_lat=lat,
                display_lng=lng,
                source_coordinate_system="EPSG:4326",
                source_geometry_coordinate_system="EPSG:4326",
                source_geometry={"type": "Point", "coordinates": [lng, lat]},
                limitations=(
                    "match.amenities.limitations.official_source_coverage_varies",
                ),
            )
        )
    return sorted(records, key=lambda item: item.record_id or item.name)


_DAILY_SHOP_CATEGORIES = {
    "supermarket",
    "grocery_store",
    "convenience_store",
    "bakery",
    "butcher",
    "cheese_shop",
    "fish_market",
    "fruit_and_vegetable_store",
    "farmers_market",
    "liquor_store",
}
_CAFE_RESTAURANT_CATEGORIES = {
    "restaurant",
    "cafe",
    "coffee_shop",
    "bar",
    "pub",
    "diner",
    "fast_food_restaurant",
    "fast_food",
    "ice_cream_shop",
    "smoothie_juice_bar",
}
_HEALTHCARE_CATEGORIES = {
    "doctor",
    "dentist",
    "pharmacy",
    "hospital",
    "clinic",
    "medical_center",
    "urgent_care",
    "physical_therapy",
    "occupational_therapy",
    "speech_therapist",
    "optometrist",
    "mental_health",
    "counseling_and_mental_health",
}
_LIBRARIES_CULTURE_CATEGORIES = {
    "library",
    "museum",
    "history_museum",
    "art_gallery",
    "performing_arts_venue",
    "theater",
    "theatre",
    "movie_theater",
    "cinema",
    "concert_hall",
    "community_center",
    "cultural_center",
}
_OVERTURE_ALLOWED_SOURCE_LICENSES = {"CDLA-Permissive-2.0", "Apache-2.0", "CC0-1.0"}


def _overture_category_values(categories: object) -> set[str]:
    if not isinstance(categories, dict):
        return set()
    values = set()
    primary = categories.get("primary")
    if isinstance(primary, str) and primary:
        values.add(primary)
    alternate = categories.get("alternate")
    if isinstance(alternate, list):
        values.update(item for item in alternate if isinstance(item, str) and item)
    return values


def _overture_category_key(categories: object) -> str | None:
    values = _overture_category_values(categories)
    if values.intersection(_HEALTHCARE_CATEGORIES):
        return "healthcare"
    if values.intersection(_DAILY_SHOP_CATEGORIES):
        return "daily_shops"
    if values.intersection(_LIBRARIES_CULTURE_CATEGORIES):
        return "libraries_culture"
    if values.intersection(_CAFE_RESTAURANT_CATEGORIES) or any(
        value.endswith("_restaurant") for value in values
    ):
        return "cafes_restaurants"
    return None


def _overture_sources_are_usable(sources: object) -> bool:
    if not isinstance(sources, list):
        return True
    licenses = {
        source.get("license")
        for source in sources
        if isinstance(source, dict) and source.get("license")
    }
    return not licenses or licenses.issubset(_OVERTURE_ALLOWED_SOURCE_LICENSES)


def _wkb_point_lng_lat(value: object) -> tuple[float, float] | None:
    if value is None:
        return None
    data = bytes(value)
    if len(data) < 21:
        return None
    if data[0] == 1:
        byte_order = "<"
    elif data[0] == 0:
        byte_order = ">"
    else:
        return None
    geometry_type = struct.unpack(f"{byte_order}I", data[1:5])[0]
    if geometry_type != 1:
        return None
    lng, lat = struct.unpack(f"{byte_order}dd", data[5:21])
    return float(lng), float(lat)


def _bbox_center_lng_lat(bbox: object) -> tuple[float, float] | None:
    if not isinstance(bbox, dict):
        return None
    try:
        west = float(bbox["xmin"])
        east = float(bbox["xmax"])
        south = float(bbox["ymin"])
        north = float(bbox["ymax"])
    except (KeyError, TypeError, ValueError):
        return None
    return (west + east) / 2, (south + north) / 2


def _overture_primary_name(names: object, categories: object) -> str:
    if isinstance(names, dict) and names.get("primary"):
        return str(names["primary"])
    values = sorted(_overture_category_values(categories))
    return values[0].replace("_", " ").title() if values else OVERTURE_SOURCE_NAME


def _overture_rows_for_bounds(
    bounds_wgs84: tuple[float, float, float, float],
) -> list[dict[str, object]]:
    try:
        import pyarrow.compute as pc
        import pyarrow.dataset as ds
        import pyarrow.fs as fs
    except ImportError as exc:  # pragma: no cover - depends on deployment image.
        raise RuntimeError("match.amenities.overture_pyarrow_unavailable") from exc

    west, south, east, north = bounds_wgs84
    dataset = ds.dataset(
        settings.match_amenity_overture_places_s3_path,
        filesystem=fs.S3FileSystem(
            anonymous=True,
            region=settings.match_amenity_overture_places_s3_region,
        ),
    )
    bbox_filter = (
        (pc.field("bbox", "xmin") < east)
        & (pc.field("bbox", "xmax") > west)
        & (pc.field("bbox", "ymin") < north)
        & (pc.field("bbox", "ymax") > south)
    )
    columns = [
        "id",
        "names",
        "categories",
        "sources",
        "geometry",
        "bbox",
        "operating_status",
        "confidence",
    ]
    row_limit = min(max(settings.match_amenity_point_limit * 40, 400), 5000)
    rows: list[dict[str, object]] = []
    for batch in dataset.to_batches(filter=bbox_filter, columns=columns, batch_size=1024):
        if batch.num_rows == 0:
            continue
        batch_dict = batch.to_pydict()
        for index in range(batch.num_rows):
            rows.append({column: batch_dict[column][index] for column in columns})
            if len(rows) >= row_limit:
                return rows
    return rows


def _overture_records_from_rows(
    rows: list[dict[str, object]],
    *,
    bounds_wgs84: tuple[float, float, float, float],
    loaded_at: datetime,
    requested_categories: set[str],
) -> list[StoredAmenityRecord]:
    records: list[StoredAmenityRecord] = []
    seen: set[str] = set()
    for index, row in enumerate(rows):
        if str(row.get("operating_status") or "").casefold() == "permanently_closed":
            continue
        if not _overture_sources_are_usable(row.get("sources")):
            continue
        category_key = _overture_category_key(row.get("categories"))
        if category_key not in requested_categories:
            continue
        representative = _wkb_point_lng_lat(row.get("geometry")) or _bbox_center_lng_lat(
            row.get("bbox")
        )
        if representative is None:
            continue
        lng, lat = representative
        if not _in_wgs84_bounds(bounds_wgs84, lat=lat, lng=lng):
            continue
        record_id = str(row.get("id") or f"overture-place-{index}")
        source_ref = OVERTURE_SOURCE_REFS[category_key]
        identity = f"{category_key}:{record_id}"
        if identity in seen:
            continue
        seen.add(identity)
        records.append(
            StoredAmenityRecord(
                category_key=category_key,
                record_id=record_id,
                name=_overture_primary_name(row.get("names"), row.get("categories")),
                source_name=OVERTURE_SOURCE_NAME,
                source_ref=source_ref,
                source_version=settings.match_amenity_overture_places_release,
                freshness_date=settings.match_amenity_overture_places_release,
                loaded_at=loaded_at,
                display_lat=lat,
                display_lng=lng,
                source_coordinate_system="EPSG:4326",
                source_geometry_coordinate_system="EPSG:4326",
                source_geometry={"type": "Point", "coordinates": [lng, lat]},
                limitations=(
                    "match.amenities.limitations.official_source_coverage_varies",
                ),
            )
        )
    return sorted(records, key=lambda item: (item.category_key, item.name, item.record_id or ""))


async def _overture_place_records_for_bounds(
    bounds_wgs84: tuple[float, float, float, float],
    loaded_at: datetime,
    requested_categories: set[str],
) -> list[StoredAmenityRecord]:
    rows = await asyncio.to_thread(_overture_rows_for_bounds, bounds_wgs84)
    return _overture_records_from_rows(
        rows,
        bounds_wgs84=bounds_wgs84,
        loaded_at=loaded_at,
        requested_categories=requested_categories,
    )


async def _parking_records_for_bounds(
    bounds_wgs84: tuple[float, float, float, float],
    loaded_at: datetime,
) -> list[StoredAmenityRecord]:
    records: list[StoredAmenityRecord] = []
    seen: set[str] = set()
    rows = await _fetch_rdw_parking_rows(
        bounds_wgs84,
        timeout_seconds=settings.match_amenity_on_demand_timeout_seconds,
    )
    for index, row in enumerate(rows):
        if not isinstance(row, dict) or not _rdw_parking_row_is_active(row, now=loaded_at):
            continue
        lat = _row_float(row, "latitude", "Latitude")
        lng = _row_float(row, "longitude", "Longitude")
        if lat is None or lng is None:
            continue
        if not _in_wgs84_bounds(bounds_wgs84, lat=lat, lng=lng):
            continue
        location_type = _row_text(row, "locationreferencetype") or "NPR"
        location_ref = _row_text(row, "locationreference") or f"parking-{index}"
        record_id = f"{location_type}-{location_ref}"
        if record_id in seen:
            continue
        seen.add(record_id)
        records.append(
            StoredAmenityRecord(
                category_key="parking",
                record_id=record_id,
                name=" ".join(part for part in ("NPR", location_type, location_ref) if part),
                source_name="RDW / Nationaal Parkeerregister open parking data",
                source_ref="rdw_npr_open_parking",
                source_version=loaded_at.date().isoformat(),
                freshness_date=loaded_at.date().isoformat(),
                loaded_at=loaded_at,
                display_lat=lat,
                display_lng=lng,
                source_coordinate_system="EPSG:4326",
                source_geometry_coordinate_system="EPSG:4326",
                source_geometry={"type": "Point", "coordinates": [lng, lat]},
                limitations=(
                    "match.amenities.limitations.official_source_coverage_varies",
                ),
            )
        )
    return sorted(records, key=lambda item: item.record_id or item.name)


async def _points_for_tags(
    neighborhood_id: str,
    tags: list[MatchNeighborhoodAmenityTag],
    bounds_wgs84: list[float],
) -> tuple[list[MatchNeighborhoodAmenityPoint], list[MatchNeighborhoodAmenityUnavailable]]:
    tag_by_key = {tag.amenity_key: tag for tag in tags}
    categories = tuple(
        category
        for category in OFFICIAL_AMENITY_CATEGORIES
        if category in tag_by_key
    )
    records, _unavailable = await load_official_amenity_records(
        neighborhood_id,
        bounds_wgs84,
        categories,
    )
    points: list[MatchNeighborhoodAmenityPoint] = []
    for record in records:
        tag = tag_by_key[record.category_key]
        points.append(_point_for_record(neighborhood_id, record, tag))
    unavailable = [
        MatchNeighborhoodAmenityUnavailable(
            amenity_key=item.category_key,
            reason_code=item.reason_code,
            source_name=item.source_name,
        )
        for item in _unavailable
        if item.category_key in tag_by_key
    ]
    return sorted(points, key=lambda item: item.relevance, reverse=True), unavailable


def _unavailable_for_missing_tags(
    tags: list[MatchNeighborhoodAmenityTag],
    points: list[MatchNeighborhoodAmenityPoint],
    unavailable: list[MatchNeighborhoodAmenityUnavailable],
) -> list[MatchNeighborhoodAmenityUnavailable]:
    point_keys = {point.amenity_key for point in points}
    unavailable_by_key = {item.amenity_key: item for item in unavailable}
    resolved: list[MatchNeighborhoodAmenityUnavailable] = []
    for tag in tags:
        if tag.amenity_key in point_keys:
            continue
        if (
            settings.match_amenity_on_demand_geometry_enabled
            and tag.amenity_key in LIVE_SOURCE_NAMES
        ):
            resolved.append(
                MatchNeighborhoodAmenityUnavailable(
                    amenity_key=tag.amenity_key,
                    reason_code="match.amenities.official_record_unavailable",
                    source_name=LIVE_SOURCE_NAMES[tag.amenity_key],
                )
            )
            continue
        resolved.append(
            unavailable_by_key.get(tag.amenity_key)
            or MatchNeighborhoodAmenityUnavailable(
                amenity_key=tag.amenity_key,
                reason_code="match.amenities.official_record_unavailable",
                source_name=tag.source_refs[0] if tag.source_refs else None,
            )
        )
    return resolved


async def _live_geometry_points_for_tags(
    neighborhood_id: str,
    tags: list[MatchNeighborhoodAmenityTag],
    bounds_wgs84: list[float],
) -> list[MatchNeighborhoodAmenityPoint]:
    if not settings.match_amenity_on_demand_geometry_enabled:
        return []
    tag_by_key = {tag.amenity_key: tag for tag in tags}
    requested_geometry_keys = GEOMETRY_AMENITY_KEYS.intersection(tag_by_key)
    if not requested_geometry_keys:
        return []

    # Imported lazily to avoid a module cycle: amenity_ingestion imports this
    # module for cache invalidation after scheduled refreshes.
    from app.services.match.amenity_ingestion import (  # noqa: PLC0415
        LiveOfficialAmenityClient,
        _feature_records,
        _green_predicate,
    )

    bounds_wgs84_tuple = tuple(bounds_wgs84)
    bounds_rd = tuple(float(value) for value in wgs84_bounds_to_rd(bounds_wgs84))
    loaded_at = datetime.now(UTC)
    client = LiveOfficialAmenityClient(
        timeout_seconds=settings.match_amenity_on_demand_timeout_seconds,
    )
    points: list[MatchNeighborhoodAmenityPoint] = []

    if "parks_green" in requested_geometry_keys:
        try:
            green_records, _green_skipped = _feature_records(
                collection=await client.fetch_pdok_green_features(bounds_rd),
                category_key="parks_green",
                source_ref="pdok_bgt_brt_green",
                source_name="PDOK BGT/BRT green-space geometry",
                source_version=loaded_at.date().isoformat(),
                loaded_at=loaded_at,
                bounds_wgs84=bounds_wgs84_tuple,
                predicate=_green_predicate,
            )
            points.extend(
                _point_for_record(neighborhood_id, record, tag_by_key["parks_green"])
                for record in green_records
            )
        except Exception as exc:  # pragma: no cover - warning path is provider dependent.
            logger.warning("selected-neighborhood live green amenity lookup failed: %s", exc)

    return sorted(points, key=lambda item: item.relevance, reverse=True)


async def _live_address_points_for_tags(
    neighborhood_id: str,
    tags: list[MatchNeighborhoodAmenityTag],
    bounds_wgs84: list[float],
) -> list[MatchNeighborhoodAmenityPoint]:
    if not settings.match_amenity_on_demand_geometry_enabled:
        return []
    tag_by_key = {tag.amenity_key: tag for tag in tags}
    requested_address_keys = ADDRESS_AMENITY_KEYS.intersection(tag_by_key)
    if not requested_address_keys:
        return []

    # Imported lazily to avoid a module cycle: amenity_ingestion imports this
    # module for cache invalidation after scheduled refreshes.
    from app.services.match.amenity_ingestion import (  # noqa: PLC0415
        LiveOfficialAmenityClient,
        _duo_records,
        _lrk_records,
        _lrk_records_from_bag_index,
    )

    neighborhood = await load_seed_neighborhood(neighborhood_id)
    bounds_wgs84_tuple = tuple(bounds_wgs84)
    bounds_rd = tuple(float(value) for value in wgs84_bounds_to_rd(bounds_wgs84))
    boundary = await selected_official_or_fallback_boundary_feature(neighborhood)
    if not boundary_is_official(boundary):
        return []
    loaded_at = datetime.now(UTC)
    client = LiveOfficialAmenityClient(
        timeout_seconds=settings.match_amenity_on_demand_timeout_seconds,
    )
    timeout_seconds = settings.match_amenity_on_demand_timeout_seconds

    def records_inside_boundary(
        records,
    ):
        return [
            record
            for record in records
            if wgs84_point_in_boundary(record.display_lng, record.display_lat, boundary or {})
        ]

    async def school_points() -> list[MatchNeighborhoodAmenityPoint]:
        try:
            school_records, _skipped, _unmatched = await asyncio.wait_for(
                _duo_records(
                    client=client,
                    bounds_wgs84=bounds_wgs84_tuple,
                    municipality=neighborhood.municipality,
                    loaded_at=loaded_at,
                ),
                timeout=timeout_seconds,
            )
            return [
                _point_for_record(neighborhood_id, record, tag_by_key["schools"])
                for record in school_records
            ]
        except TimeoutError:
            logger.warning(
                "selected-neighborhood live school amenity lookup timed out for %s",
                neighborhood_id,
            )
        except Exception as exc:  # pragma: no cover - warning path is provider dependent.
            logger.warning("selected-neighborhood live school amenity lookup failed: %s", exc)
        return []

    async def childcare_points() -> list[MatchNeighborhoodAmenityPoint]:
        childcare_records = []
        try:
            childcare_records, _skipped, _unmatched, _withheld = await asyncio.wait_for(
                _lrk_records_from_bag_index(
                    client=client,
                    bounds_wgs84=bounds_wgs84_tuple,
                    bounds_rd=bounds_rd,
                    municipality=neighborhood.municipality,
                    loaded_at=loaded_at,
                ),
                timeout=timeout_seconds,
            )
            childcare_records = records_inside_boundary(childcare_records)
        except TimeoutError:
            logger.warning(
                "selected-neighborhood live childcare BAG-index amenity lookup timed out for %s",
                neighborhood_id,
            )
        except Exception as exc:  # pragma: no cover - warning path is provider dependent.
            logger.warning(
                "selected-neighborhood live childcare BAG-index amenity lookup failed: %s",
                exc,
            )
        if not childcare_records:
            try:
                childcare_records, _skipped, _unmatched, _withheld = await asyncio.wait_for(
                    _lrk_records(
                        client=client,
                        bounds_wgs84=bounds_wgs84_tuple,
                        municipality=neighborhood.municipality,
                        loaded_at=loaded_at,
                    ),
                    timeout=timeout_seconds,
                )
                childcare_records = records_inside_boundary(childcare_records)
            except TimeoutError:
                logger.warning(
                    "selected-neighborhood live childcare fallback amenity lookup timed out for %s",
                    neighborhood_id,
                )
            except Exception as exc:  # pragma: no cover - warning path is provider dependent.
                logger.warning(
                    "selected-neighborhood live childcare fallback amenity lookup failed: %s",
                    exc,
                )
        return [
            _point_for_record(neighborhood_id, record, tag_by_key["childcare"])
            for record in childcare_records
        ]

    lookups = []
    if "schools" in requested_address_keys:
        lookups.append(school_points())
    if "childcare" in requested_address_keys:
        lookups.append(childcare_points())

    points: list[MatchNeighborhoodAmenityPoint] = []
    for lookup_points in await asyncio.gather(*lookups):
        points.extend(lookup_points)
    return sorted(points, key=lambda item: item.relevance, reverse=True)


async def _live_point_points_for_tags(
    neighborhood_id: str,
    tags: list[MatchNeighborhoodAmenityTag],
    bounds_wgs84: list[float],
) -> list[MatchNeighborhoodAmenityPoint]:
    if not settings.match_amenity_on_demand_geometry_enabled:
        return []
    tag_by_key = {tag.amenity_key: tag for tag in tags}
    requested_point_keys = POINT_AMENITY_KEYS.intersection(tag_by_key)
    if not requested_point_keys:
        return []

    bounds_wgs84_tuple = tuple(float(value) for value in bounds_wgs84)
    loaded_at = datetime.now(UTC)

    def points_for_records(
        records: list[StoredAmenityRecord],
    ) -> list[MatchNeighborhoodAmenityPoint]:
        return [
            _point_for_record(neighborhood_id, record, tag_by_key[record.category_key])
            for record in records
            if record.category_key in tag_by_key
        ]

    async def category_points(
        category_key: str,
        lookup,
    ) -> list[MatchNeighborhoodAmenityPoint]:
        try:
            records = await asyncio.wait_for(
                lookup(bounds_wgs84_tuple, loaded_at),
                timeout=settings.match_amenity_on_demand_timeout_seconds,
            )
            return points_for_records(records)
        except TimeoutError:
            logger.warning(
                "selected-neighborhood live %s amenity lookup timed out for %s",
                category_key,
                neighborhood_id,
            )
        except Exception as exc:  # pragma: no cover - warning path is provider dependent.
            logger.warning(
                "selected-neighborhood live %s amenity lookup failed: %s",
                category_key,
                exc,
            )
        return []

    async def overture_points() -> list[MatchNeighborhoodAmenityPoint]:
        requested_overture_keys = requested_point_keys.intersection(OPEN_POI_AMENITY_KEYS)
        if not requested_overture_keys:
            return []
        try:
            records = await asyncio.wait_for(
                _overture_place_records_for_bounds(
                    bounds_wgs84_tuple,
                    loaded_at,
                    set(requested_overture_keys),
                ),
                timeout=settings.match_amenity_on_demand_timeout_seconds,
            )
            return points_for_records(records)
        except TimeoutError:
            logger.warning(
                "selected-neighborhood live Overture Places amenity lookup timed out for %s",
                neighborhood_id,
            )
        except Exception as exc:  # pragma: no cover - warning path is provider dependent.
            logger.warning("selected-neighborhood live Overture Places lookup failed: %s", exc)
        return []

    lookups = []
    if "transit" in requested_point_keys:
        lookups.append(category_points("transit", _transit_records_for_bounds))
    if "parking" in requested_point_keys:
        lookups.append(category_points("parking", _parking_records_for_bounds))
    if "ev_charging" in requested_point_keys:
        lookups.append(category_points("ev_charging", _ev_charging_records_for_bounds))
    if "swimming_water" in requested_point_keys:
        lookups.append(category_points("swimming_water", _swimming_water_records_for_bounds))
    if requested_point_keys.intersection(OPEN_POI_AMENITY_KEYS):
        lookups.append(overture_points())

    points: list[MatchNeighborhoodAmenityPoint] = []
    for lookup_points in await asyncio.gather(*lookups):
        points.extend(lookup_points)
    return sorted(points, key=lambda item: item.relevance, reverse=True)


async def get_preference_aware_amenities(
    neighborhood_id: str,
    *,
    session_id: str,
    result_set_id: str,
    limit: int = DEFAULT_VISIBLE_AMENITY_CAP,
) -> MatchNeighborhoodAmenitiesResponse:
    neighborhood = await load_seed_neighborhood(neighborhood_id)
    session = await get_match_session(session_id)
    boundary = await selected_official_or_fallback_boundary_feature(neighborhood)
    cap = max(5, min(limit, MAX_VISIBLE_AMENITY_CAP, len(OFFICIAL_AMENITY_CATEGORIES)))
    selected: dict[str, MatchNeighborhoodAmenityTag] = {}

    for preference_key in _preference_keys(session):
        for amenity_key, reason_code, relevance in PREFERENCE_AMENITIES.get(preference_key, []):
            current = selected.get(amenity_key)
            if current is None or relevance > current.relevance:
                selected[amenity_key] = _tag(amenity_key, reason_code, relevance)

    for amenity_key, reason_code, relevance in DEFAULT_AMENITIES:
        selected.setdefault(amenity_key, _tag(amenity_key, reason_code, relevance))

    tags = [
        tag
        for tag in sorted(selected.values(), key=lambda item: item.relevance, reverse=True)
        if tag.amenity_key in OFFICIAL_AMENITY_CATEGORIES
    ][:cap]
    if not boundary_is_official(boundary):
        return MatchNeighborhoodAmenitiesResponse(
            neighborhood_id=neighborhood_id,
            session_id=session_id,
            result_set_id=result_set_id,
            tags=tags,
            points=[],
            unavailable=[
                MatchNeighborhoodAmenityUnavailable(
                    amenity_key=tag.amenity_key,
                    reason_code="matchFirst.neighborhood.boundaryUnavailable",
                    source_name=OFFICIAL_BOUNDARY_SOURCE_NAME,
                )
                for tag in tags
            ],
            source_refs=[],
            limitations=sorted({*LIMITATIONS, OFFICIAL_BOUNDARY_UNAVAILABLE_LIMITATION}),
        )
    bounds_wgs84 = boundary_display_bounds_wgs84(boundary or {}) or display_bounds_wgs84(
        neighborhood
    )
    categories = tuple(
        category
        for category in OFFICIAL_AMENITY_CATEGORIES
        if any(tag.amenity_key == category for tag in tags)
    )
    source_versions = await load_amenity_source_versions(categories)
    if settings.match_amenity_on_demand_geometry_enabled:
        live_source_date = datetime.now(UTC).date().isoformat()
        for category in LIVE_ON_DEMAND_AMENITY_KEYS.intersection(categories):
            source_versions[category] = (
                f"{source_versions.get(category, 'source_unconfigured')};"
                f"live_on_demand:{live_source_date}"
            )
    cache_key = _cache_key(neighborhood_id, bounds_wgs84, categories, cap, source_versions)
    if cache_key in _AMENITY_RESPONSE_CACHE:
        cached = _copy_response(_AMENITY_RESPONSE_CACHE[cache_key])
        cached.session_id = session_id
        cached.result_set_id = result_set_id
        return cached

    points, unavailable = await _points_for_tags(neighborhood_id, tags, bounds_wgs84)
    points = _filter_points_to_boundary(points, boundary or {})
    point_keys = {point.amenity_key for point in points}
    needs_geometry_lookup = any(
        tag.amenity_key in GEOMETRY_AMENITY_KEYS and tag.amenity_key not in point_keys
        for tag in tags
    )
    needs_address_lookup = any(
        tag.amenity_key in ADDRESS_AMENITY_KEYS and tag.amenity_key not in point_keys
        for tag in tags
    )
    needs_point_lookup = any(
        tag.amenity_key in POINT_AMENITY_KEYS and tag.amenity_key not in point_keys
        for tag in tags
    )
    live_lookup_tasks = []
    if needs_geometry_lookup:
        live_lookup_tasks.append(
            (
                "geometry",
                asyncio.wait_for(
                    _live_geometry_points_for_tags(neighborhood_id, tags, bounds_wgs84),
                    timeout=settings.match_amenity_on_demand_timeout_seconds,
                ),
            )
        )
    if needs_address_lookup:
        live_lookup_tasks.append(
            (
                "address",
                _live_address_points_for_tags(neighborhood_id, tags, bounds_wgs84),
            )
        )
    if needs_point_lookup:
        live_lookup_tasks.append(
            (
                "point",
                _live_point_points_for_tags(neighborhood_id, tags, bounds_wgs84),
            )
        )
    if live_lookup_tasks:
        live_results = await asyncio.gather(
            *(lookup for _lookup_name, lookup in live_lookup_tasks),
            return_exceptions=True,
        )
        for (lookup_name, _lookup), live_result in zip(
            live_lookup_tasks,
            live_results,
            strict=True,
        ):
            if isinstance(live_result, TimeoutError):
                logger.warning(
                    "selected-neighborhood live %s amenity lookup timed out for %s",
                    lookup_name,
                    neighborhood_id,
                )
                continue
            if isinstance(live_result, Exception):
                logger.warning(
                    "selected-neighborhood live %s amenity lookup failed for %s: %s",
                    lookup_name,
                    neighborhood_id,
                    live_result,
                )
                continue
            points = _dedupe_points([*points, *live_result])
    points = _filter_points_to_boundary(points, boundary or {})
    points = _limit_points(points)
    unavailable = _unavailable_for_missing_tags(tags, points, unavailable)
    response = MatchNeighborhoodAmenitiesResponse(
        neighborhood_id=neighborhood_id,
        session_id=session_id,
        result_set_id=result_set_id,
        tags=tags,
        points=points,
        unavailable=unavailable,
        source_refs=_source_refs_for_points(points),
        limitations=sorted(
            {
                *LIMITATIONS,
                "match.amenities.limitations.official_source_coverage_varies",
                "match.amenities.limitations.address_sources_require_bag_match",
            }
        ),
    )
    has_uncached_live_gap = any(
        item.amenity_key in LIVE_ON_DEMAND_AMENITY_KEYS for item in response.unavailable
    )
    if response.points and not has_uncached_live_gap:
        _AMENITY_RESPONSE_CACHE[cache_key] = _copy_response(response)
    return response
