from __future__ import annotations

import base64
import json
import logging
from dataclasses import dataclass
from typing import Literal
from urllib.parse import urlencode, urljoin, urlparse

import httpx

from app.config import settings
from app.services.match.geometry import wgs84_to_rd

logger = logging.getLogger(__name__)

PAND_SOURCE_REF = "pdok_bag_ogc_v2_pand"
PAND_DATA_VERSION = "pdok-bag-ogc-v2-pand-selected-v1"
PAND_GEOMETRY_SOURCE = "pdok_bag_pand"
PAGE_CURSOR_VERSION = 1
PREFERRED_PAND_STATUSES = frozenset({
    "Pand in gebruik",
    "Pand in gebruik (niet ingemeten)",
    "Verbouwing pand",
})
WOONFUNCTIE = "woonfunctie"
OVERIGE_GEBRUIKSFUNCTIE = "overige gebruiksfunctie"
BAG_GEBRUIKSDOELEN = frozenset({
    "woonfunctie",
    "bijeenkomstfunctie",
    "celfunctie",
    "gezondheidszorgfunctie",
    "industriefunctie",
    "kantoorfunctie",
    "logiesfunctie",
    "onderwijsfunctie",
    "sportfunctie",
    "winkelfunctie",
    "overige gebruiksfunctie",
})

BagUsageClassification = Literal[
    "residential",
    "mixed_residential",
    "non_residential",
    "no_verblijfsobject",
    "unknown",
]

_client: httpx.AsyncClient | None = None


@dataclass(frozen=True)
class BagPandFootprint:
    pand_id: str
    status: str | None
    gebruiksdoelen: list[str]
    aantal_verblijfsobjecten: int | None
    bouwjaar: int | None
    documentdatum: str | None
    footprint: dict[str, object]
    footprint_rd: list[list[float]]
    usage_classification: BagUsageClassification
    house_selectable: bool


@dataclass(frozen=True)
class BagPandFootprintPage:
    pands: list[BagPandFootprint]
    next_cursor: str | None = None
    partial: bool = False


def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(timeout=httpx.Timeout(10.0, connect=3.0))
    return _client


def _bbox_string_from_rd_bounds(bounds_rd: list[float]) -> str | None:
    if len(bounds_rd) != 4:
        return None
    west, south, east, north = bounds_rd
    if west >= east or south >= north:
        return None
    return f"{west:.0f},{south:.0f},{east:.0f},{north:.0f}"


def _normalize_page_url(url: str) -> str:
    base = settings.bag_ogc_base.rstrip("/") + "/"
    return urljoin(base, url)


def _is_allowed_page_url(url: str) -> bool:
    parsed = urlparse(url)
    base = urlparse(settings.bag_ogc_base)
    return parsed.scheme == base.scheme and parsed.netloc == base.netloc


def _encode_page_cursor(*, bbox: str, next_url: str) -> str:
    normalized_url = _normalize_page_url(next_url)
    payload = {
        "v": PAGE_CURSOR_VERSION,
        "bbox": bbox,
        "next_url": normalized_url,
    }
    raw = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _decode_page_cursor(cursor: str, *, expected_bbox: str) -> str:
    padding = "=" * (-len(cursor) % 4)
    try:
        raw = base64.urlsafe_b64decode(f"{cursor}{padding}".encode("ascii"))
        payload = json.loads(raw.decode("utf-8"))
    except (ValueError, json.JSONDecodeError) as exc:
        raise ValueError("invalid PDOK BAG page cursor") from exc

    if not isinstance(payload, dict):
        raise ValueError("invalid PDOK BAG page cursor")
    if payload.get("v") != PAGE_CURSOR_VERSION:
        raise ValueError("unsupported PDOK BAG page cursor")
    if payload.get("bbox") != expected_bbox:
        raise ValueError("PDOK BAG page cursor does not match requested bounds")
    next_url = payload.get("next_url")
    if not isinstance(next_url, str) or not next_url:
        raise ValueError("invalid PDOK BAG page cursor URL")
    normalized_url = _normalize_page_url(next_url)
    if not _is_allowed_page_url(normalized_url):
        raise ValueError("PDOK BAG page cursor URL is out of scope")
    return normalized_url


async def _get_json(client: httpx.AsyncClient, url: str) -> dict:
    response = await client.get(
        url,
        timeout=httpx.Timeout(settings.match_bag_ogc_timeout_seconds, connect=3.0),
    )
    response.raise_for_status()
    return response.json()


def _next_page_url(data: dict, limit: int) -> str | None:
    for link in data.get("links", []):
        if not isinstance(link, dict) or link.get("rel") != "next":
            continue
        href = link.get("href")
        if not isinstance(href, str) or not href:
            continue
        if "limit=" not in href:
            separator = "&" if "?" in href else "?"
            return f"{href}{separator}limit={limit}"
        return href
    return None


def _coerce_int(value: object) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float) and value.is_integer():
        return int(value)
    if isinstance(value, str):
        try:
            return int(value)
        except ValueError:
            return None
    return None


def _parse_gebruiksdoelen(value: object) -> list[str]:
    raw_values: list[object]
    if isinstance(value, str):
        raw_values = value.split(",")
    elif isinstance(value, list):
        raw_values = value
    else:
        raw_values = []

    parsed: list[str] = []
    for raw in raw_values:
        normalized = str(raw).strip().lower()
        if normalized in BAG_GEBRUIKSDOELEN and normalized not in parsed:
            parsed.append(normalized)
    return parsed


def _usage_classification(
    *,
    gebruiksdoelen: list[str],
    aantal_verblijfsobjecten: int | None,
) -> BagUsageClassification:
    if aantal_verblijfsobjecten == 0:
        return "no_verblijfsobject"
    if WOONFUNCTIE in gebruiksdoelen:
        return "mixed_residential" if len(gebruiksdoelen) > 1 else "residential"
    if gebruiksdoelen:
        return "non_residential"
    return "unknown"


def _house_selectable(
    *,
    status: str | None,
    gebruiksdoelen: list[str],
    aantal_verblijfsobjecten: int | None,
) -> bool:
    return (
        status in PREFERRED_PAND_STATUSES
        and aantal_verblijfsobjecten != 0
        and WOONFUNCTIE in gebruiksdoelen
    )


def _valid_ring(ring: object) -> list[list[float]]:
    if not isinstance(ring, list):
        return []
    points: list[list[float]] = []
    for point in ring:
        if (
            isinstance(point, list)
            and len(point) >= 2
            and isinstance(point[0], int | float)
            and isinstance(point[1], int | float)
        ):
            points.append([float(point[0]), float(point[1])])
    if len(points) < 3:
        return []
    if points[0] != points[-1]:
        points.append(points[0])
    return points


def _ring_area(ring: list[list[float]]) -> float:
    if len(ring) < 4:
        return 0.0
    area = 0.0
    for index in range(len(ring) - 1):
        x1, y1 = ring[index]
        x2, y2 = ring[index + 1]
        area += (x1 * y2) - (x2 * y1)
    return abs(area) / 2


def _polygon_from_geometry(geometry: object) -> dict[str, object] | None:
    if not isinstance(geometry, dict):
        return None
    geometry_type = geometry.get("type")
    coordinates = geometry.get("coordinates")
    candidate_polygons: list[list[list[list[float]]]] = []
    if geometry_type == "Polygon" and isinstance(coordinates, list):
        rings = [_valid_ring(ring) for ring in coordinates]
        rings = [ring for ring in rings if ring]
        if rings:
            candidate_polygons.append(rings)
    elif geometry_type == "MultiPolygon" and isinstance(coordinates, list):
        for polygon in coordinates:
            if not isinstance(polygon, list):
                continue
            rings = [_valid_ring(ring) for ring in polygon]
            rings = [ring for ring in rings if ring]
            if rings:
                candidate_polygons.append(rings)

    if not candidate_polygons:
        return None
    selected = max(candidate_polygons, key=lambda polygon: _ring_area(polygon[0]))
    return {"type": "Polygon", "coordinates": selected}


def _footprint_rd_offsets(
    footprint: dict[str, object],
    *,
    center_x: float,
    center_y: float,
) -> list[list[float]]:
    coordinates = footprint.get("coordinates")
    if not isinstance(coordinates, list) or not coordinates:
        return []
    outer = coordinates[0]
    if not isinstance(outer, list):
        return []
    offsets: list[list[float]] = []
    for point in outer:
        if (
            isinstance(point, list)
            and len(point) >= 2
            and isinstance(point[0], int | float)
            and isinstance(point[1], int | float)
        ):
            rd = wgs84_to_rd(float(point[1]), float(point[0]))
            offsets.append([round(rd["x"] - center_x, 2), round(rd["y"] - center_y, 2)])
    return offsets


def _parse_pand_feature(
    feature: object,
    *,
    center_x: float,
    center_y: float,
) -> BagPandFootprint | None:
    if not isinstance(feature, dict):
        return None
    properties = feature.get("properties")
    if not isinstance(properties, dict):
        return None
    pand_id = properties.get("identificatie")
    if not isinstance(pand_id, str) or not pand_id:
        return None
    footprint = _polygon_from_geometry(feature.get("geometry"))
    if footprint is None:
        return None

    status = properties.get("status")
    status = status if isinstance(status, str) and status else None
    gebruiksdoelen = _parse_gebruiksdoelen(properties.get("gebruiksdoel"))
    aantal_verblijfsobjecten = _coerce_int(properties.get("aantal_verblijfsobjecten"))
    classification = _usage_classification(
        gebruiksdoelen=gebruiksdoelen,
        aantal_verblijfsobjecten=aantal_verblijfsobjecten,
    )
    return BagPandFootprint(
        pand_id=pand_id.removeprefix("NL.IMBAG.Pand."),
        status=status,
        gebruiksdoelen=gebruiksdoelen,
        aantal_verblijfsobjecten=aantal_verblijfsobjecten,
        bouwjaar=_coerce_int(properties.get("bouwjaar")),
        documentdatum=properties.get("documentdatum")
        if isinstance(properties.get("documentdatum"), str)
        else None,
        footprint=footprint,
        footprint_rd=_footprint_rd_offsets(footprint, center_x=center_x, center_y=center_y),
        usage_classification=classification,
        house_selectable=_house_selectable(
            status=status,
            gebruiksdoelen=gebruiksdoelen,
            aantal_verblijfsobjecten=aantal_verblijfsobjecten,
        ),
    )


def pand_priority(pand: BagPandFootprint) -> tuple[int, int, str]:
    status_rank = 0 if pand.status in PREFERRED_PAND_STATUSES else 1
    usage_rank = {
        "residential": 0,
        "mixed_residential": 0,
        "unknown": 1,
        "non_residential": 2,
        "no_verblijfsobject": 3,
    }[pand.usage_classification]
    return status_rank, usage_rank, pand.pand_id


async def get_pand_footprints_in_rd_bounds_page(
    bounds_rd: list[float],
    *,
    limit: int = 100,
    cursor: str | None = None,
) -> BagPandFootprintPage:
    bbox = _bbox_string_from_rd_bounds(bounds_rd)
    if bbox is None:
        return BagPandFootprintPage(pands=[], next_cursor=None, partial=False)

    west, south, east, north = bounds_rd
    center_x = (west + east) / 2
    center_y = (south + north) / 2
    bounded_limit = max(1, min(limit, settings.match_bag_ogc_limit))
    if cursor:
        url = _decode_page_cursor(cursor, expected_bbox=bbox)
    else:
        query = urlencode({
            "bbox": bbox,
            "bbox-crs": "http://www.opengis.net/def/crs/EPSG/0/28992",
            "crs": "http://www.opengis.net/def/crs/OGC/1.3/CRS84",
            "limit": str(bounded_limit),
            "f": "json",
        })
        url = f"{settings.bag_ogc_base.rstrip('/')}/collections/pand/items?{query}"

    try:
        data = await _get_json(_get_client(), url)
    except (httpx.HTTPError, httpx.TimeoutException, ValueError) as exc:
        logger.warning("PDOK BAG OGC pand page fetch failed: %s", exc)
        return BagPandFootprintPage(pands=[], next_cursor=None, partial=True)

    pands = [
        parsed
        for parsed in (
            _parse_pand_feature(feature, center_x=center_x, center_y=center_y)
            for feature in data.get("features", [])
        )
        if parsed is not None
    ]
    pands.sort(key=pand_priority)
    next_url = _next_page_url(data, bounded_limit)
    return BagPandFootprintPage(
        pands=pands[:bounded_limit],
        next_cursor=_encode_page_cursor(bbox=bbox, next_url=next_url) if next_url else None,
        partial=False,
    )
