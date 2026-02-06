import asyncio
import logging
import time

import httpx

from app.config import settings
from app.models.neighborhood3d import BuildingBlock, Neighborhood3DCenter, Neighborhood3DResponse

logger = logging.getLogger(__name__)

_client: httpx.AsyncClient | None = None

MAX_PAGES = 3
BBOX_TIMEOUT = 20.0  # total time budget for bbox fetch (seconds)
PER_PAGE_TIMEOUT = 20.0  # per-page HTTP timeout (seconds)


def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(timeout=httpx.Timeout(10.0, connect=3.0))
    return _client


def _parse_building(
    city_object: dict,
    vertices: list[list[int]],
    scale: list[float],
    translate: list[float],
    center_x: float,
    center_y: float,
) -> BuildingBlock | None:
    """Parse a CityJSON Building object into a BuildingBlock with meter offsets."""
    attrs = city_object.get("attributes", {})

    h_maaiveld = attrs.get("b3_h_maaiveld")
    h_dak_max = attrs.get("b3_h_dak_max")
    if h_maaiveld is None or h_dak_max is None:
        return None

    building_height = h_dak_max - h_maaiveld
    if building_height <= 0:
        return None

    # Find LoD 0 geometry
    lod0_geom = None
    for geom in city_object.get("geometry", []):
        if geom.get("lod") == "0" and geom.get("type") == "MultiSurface":
            lod0_geom = geom
            break

    if lod0_geom is None:
        return None

    # Extract footprint: boundaries[0] is the first (outer) ring of the first surface
    boundaries = lod0_geom.get("boundaries", [])
    if not boundaries or not boundaries[0]:
        return None

    # MultiSurface boundaries: [[[idx, idx, ...], [hole_ring]], ...]
    # First surface, first ring (outer boundary)
    outer_ring = boundaries[0][0] if isinstance(boundaries[0][0], list) else boundaries[0]

    # Decode vertex indices to real coordinates, compute offsets from center
    footprint: list[list[float]] = []
    for idx in outer_ring:
        if idx >= len(vertices):
            continue
        v = vertices[idx]
        real_x = v[0] * scale[0] + translate[0]
        real_y = v[1] * scale[1] + translate[1]
        dx = real_x - center_x
        dy = real_y - center_y
        footprint.append([round(dx, 2), round(dy, 2)])

    if len(footprint) < 3:
        return None

    year = attrs.get("oorspronkelijkbouwjaar")

    raw_id = attrs.get("identificatie", "unknown")
    # 3DBAG returns prefixed IDs like "NL.IMBAG.Pand.0363100012253924"
    # Strip prefix to match BAG's raw 16-digit format
    if raw_id.startswith("NL.IMBAG.Pand."):
        raw_id = raw_id[len("NL.IMBAG.Pand."):]

    return BuildingBlock(
        pand_id=raw_id,
        ground_height=round(h_maaiveld, 2),
        building_height=round(building_height, 2),
        footprint=footprint,
        year=year,
    )


async def _fetch_target_building(
    pand_id: str, center_x: float, center_y: float
) -> BuildingBlock | None:
    """Fetch a single building directly by pand_id from the 3DBAG single-item endpoint."""
    client = _get_client()
    prefixed_id = f"NL.IMBAG.Pand.{pand_id}"
    url = f"{settings.three_d_bag_base}/collections/pand/items/{prefixed_id}"

    try:
        resp = await client.get(url)
        resp.raise_for_status()
        data = resp.json()
    except (httpx.HTTPError, httpx.TimeoutException):
        return None

    # Single-item endpoint returns CityJSONFeature with structure:
    # { "feature": { "CityObjects": {...}, "vertices": [...] },
    #   "metadata": { "transform": {...} } }
    # Transform is at ROOT level metadata, not inside feature!
    inner = data.get("feature", data)
    # Try root-level metadata first (correct for single-item endpoint)
    root_meta = data.get("metadata", {})
    transform = root_meta.get("transform", {})
    # Fall back to inner metadata for compatibility
    if not transform:
        transform = inner.get("metadata", {}).get("transform", {})
    scale = transform.get("scale", [0.001, 0.001, 0.001])
    translate = transform.get("translate", [0.0, 0.0, 0.0])
    vertices = inner.get("vertices", [])
    city_objects = inner.get("CityObjects", {})

    for co_data in city_objects.values():
        if co_data.get("type") != "Building":
            continue
        block = _parse_building(co_data, vertices, scale, translate, center_x, center_y)
        if block is not None:
            return block

    return None


async def _fetch_bbox_buildings(
    center_x: float, center_y: float, radius: float
) -> list[BuildingBlock]:
    """Fetch buildings within a bbox from the 3DBAG paginated endpoint."""
    client = _get_client()

    x0, y0 = center_x - radius, center_y - radius
    x1, y1 = center_x + radius, center_y + radius
    bbox = f"{x0:.0f},{y0:.0f},{x1:.0f},{y1:.0f}"
    url = f"{settings.three_d_bag_base}/collections/pand/items"

    buildings: list[BuildingBlock] = []
    page = 0
    next_url: str | None = f"{url}?bbox={bbox}&limit=20"
    start = time.monotonic()

    while next_url and page < MAX_PAGES:
        remaining = BBOX_TIMEOUT - (time.monotonic() - start)
        if remaining < 1.0:
            logger.info("Bbox fetch stopping: time budget exhausted (%.1fs used)", BBOX_TIMEOUT)
            break

        page_start = time.monotonic()
        try:
            resp = await client.get(
                next_url,
                timeout=httpx.Timeout(min(PER_PAGE_TIMEOUT, remaining), connect=3.0),
            )
            resp.raise_for_status()
            data = resp.json()
        except (httpx.HTTPError, httpx.TimeoutException) as exc:
            page_duration = time.monotonic() - page_start
            logger.warning(
                "Bbox page %d failed after %.1fs: %s", page + 1, page_duration, exc
            )
            break

        page_duration = time.monotonic() - page_start

        transform = data.get("metadata", {}).get("transform", {})
        scale = transform.get("scale", [0.001, 0.001, 0.001])
        translate = transform.get("translate", [0.0, 0.0, 0.0])

        page_buildings = 0
        for feature in data.get("features", []):
            vertices = feature.get("vertices", [])
            city_objects = feature.get("CityObjects", {})

            for co_data in city_objects.values():
                if co_data.get("type") != "Building":
                    continue

                block = _parse_building(co_data, vertices, scale, translate, center_x, center_y)
                if block is not None:
                    buildings.append(block)
                    page_buildings += 1

        logger.info(
            "Bbox page %d: %d buildings in %.1fs", page + 1, page_buildings, page_duration
        )

        # Follow pagination
        next_url = None
        for link in data.get("links", []):
            if link.get("rel") == "next":
                next_url = link.get("href")
                break
        page += 1

    total_duration = time.monotonic() - start
    logger.info(
        "Bbox fetch complete: %d buildings, %d pages in %.1fs",
        len(buildings), page, total_duration,
    )

    return buildings


async def get_neighborhood_3d(
    pand_id: str,
    rd_x: float,
    rd_y: float,
    lat: float,
    lng: float,
    vbo_id: str | None = None,
    radius: float = 250.0,
) -> Neighborhood3DResponse:
    """Fetch 3D building data from 3DBAG for the neighborhood around a point."""
    # Parallel fetch: direct target + bbox neighborhood
    target_building, bbox_buildings = await asyncio.gather(
        _fetch_target_building(pand_id, rd_x, rd_y),
        _fetch_bbox_buildings(rd_x, rd_y, radius),
    )

    # Merge: target first, then bbox (deduplicate by pand_id)
    seen_ids: set[str] = set()
    buildings: list[BuildingBlock] = []

    if target_building is not None:
        buildings.append(target_building)
        seen_ids.add(target_building.pand_id)

    for b in bbox_buildings:
        if b.pand_id not in seen_ids:
            buildings.append(b)
            seen_ids.add(b.pand_id)

    target_found = target_building is not None
    address_id = vbo_id if vbo_id else pand_id
    center = Neighborhood3DCenter(lat=lat, lng=lng, rd_x=rd_x, rd_y=rd_y)

    message = None
    if not buildings:
        message = "No 3D building data available for this area"
    elif not target_found:
        message = "Target building not found in 3D data"

    return Neighborhood3DResponse(
        address_id=address_id,
        target_pand_id=pand_id if target_found else None,
        center=center,
        buildings=buildings,
        message=message,
    )
