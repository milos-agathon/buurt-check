import asyncio
import logging
import math
import time

import httpx

from app.config import settings
from app.models.neighborhood3d import BuildingBlock, Neighborhood3DCenter, Neighborhood3DResponse

logger = logging.getLogger(__name__)

_client: httpx.AsyncClient | None = None
BBOX_PAGE_LIMIT = 100
LOD22_ENRICH_CONCURRENCY = 8
MIN_FETCH_BUDGET = 1.0
FALLBACK_RADIUS_FACTOR = 0.6
FALLBACK_MIN_RADIUS = 60.0
FALLBACK_PAGE_LIMIT = 50
NEARBY_CONTEXT_LIMIT = 100
IMMEDIATE_CONTEXT_RADIUS = 30.0
IMMEDIATE_CONTEXT_LIMIT = 200
IMMEDIATE_CONTEXT_MAX_PAGES = 2
SECONDARY_FALLBACK_RADIUS = 50.0
TRANSIENT_STATUS_CODES = {502, 503, 504}

if settings.three_d_conservative_mode:
    # Exact pre-optimization constants (rollback mode).
    DEFAULT_RADIUS = 150.0
    BBOX_MAX_PAGES = 5
    BBOX_FETCH_BUDGET = 80.0
    BBOX_PAGE_TIMEOUT = 65.0
    TARGET_FETCH_RETRIES = 6
    BBOX_FETCH_RETRIES = 10
    RETRY_BACKOFF_BASE = 0.35
    FALLBACK_PAGE_TIMEOUT = 65.0
    NEARBY_CONTEXT_MIN_RADIUS = 100.0
    NEARBY_CONTEXT_TIMEOUT = 65.0
    NEARBY_CONTEXT_MAX_PAGES = 5
    IMMEDIATE_CONTEXT_TIMEOUT = 15.0
    PRIMARY_WAIT_AFTER_EMPTY_BACKUP_SECONDS = 5.0
    PRIMARY_WAIT_AFTER_BACKUP_SECONDS = 10.0
    TARGET_FETCH_TIMEOUT = 30.0
else:
    # Accelerated mode defaults.
    DEFAULT_RADIUS = 150.0
    BBOX_MAX_PAGES = 3
    BBOX_FETCH_BUDGET = 50.0
    BBOX_PAGE_TIMEOUT = 40.0
    TARGET_FETCH_RETRIES = 4
    BBOX_FETCH_RETRIES = 6
    RETRY_BACKOFF_BASE = 0.25
    FALLBACK_PAGE_TIMEOUT = 40.0
    NEARBY_CONTEXT_MIN_RADIUS = 100.0
    NEARBY_CONTEXT_TIMEOUT = 40.0
    NEARBY_CONTEXT_MAX_PAGES = 3
    IMMEDIATE_CONTEXT_TIMEOUT = 15.0
    PRIMARY_WAIT_AFTER_EMPTY_BACKUP_SECONDS = 3.0
    PRIMARY_WAIT_AFTER_BACKUP_SECONDS = 8.0
    TARGET_FETCH_TIMEOUT = 25.0

_in_flight: dict[str, asyncio.Task[Neighborhood3DResponse]] = {}




def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(timeout=httpx.Timeout(10.0, connect=3.0))
    return _client


def _is_transient_3dbag_error(exc: Exception) -> bool:
    if isinstance(exc, httpx.TimeoutException):
        return True
    if isinstance(exc, httpx.HTTPStatusError):
        status_code = exc.response.status_code if exc.response is not None else None
        return status_code in TRANSIENT_STATUS_CODES
    if isinstance(exc, httpx.RequestError):
        return True
    return False


async def _get_json_with_retries(
    client: httpx.AsyncClient,
    url: str,
    *,
    timeout: httpx.Timeout,
    attempts: int,
) -> dict:
    last_exc: Exception | None = None
    for attempt in range(1, attempts + 1):
        try:
            resp = await client.get(url, timeout=timeout)
            resp.raise_for_status()
            return resp.json()
        except (httpx.HTTPError, httpx.TimeoutException) as exc:
            last_exc = exc
            if attempt >= attempts or not _is_transient_3dbag_error(exc):
                raise
            wait_s = min(RETRY_BACKOFF_BASE * attempt, 2.0)
            logger.warning(
                "3DBAG transient error on attempt %d/%d for %s: %s",
                attempt,
                attempts,
                url,
                exc,
            )
            await asyncio.sleep(wait_s)

    if last_exc is not None:
        raise last_exc
    raise RuntimeError("Retry helper reached unexpected state")


def _extract_lod22_surfaces(
    city_object: dict,
    city_objects: dict,
    vertices: list[list[int]],
    scale: list[float],
    translate: list[float],
    center_x: float,
    center_y: float,
) -> list[list[list[float]]] | None:
    """Extract LoD 2.2 surface polygons from BuildingPart children.

    Returns a list of surfaces, each a list of [dx, dy, z_nap] vertices
    (RD offsets from center + NAP height), or None if no LoD 2.2 data.
    """
    children_ids = city_object.get("children", [])
    if not children_ids:
        return None

    surfaces: list[list[list[float]]] = []

    for child_id in children_ids:
        child = city_objects.get(child_id)
        if not child or child.get("type") != "BuildingPart":
            continue

        for geom in child.get("geometry", []):
            lod = str(geom.get("lod", ""))
            if lod != "2.2" or geom.get("type") != "Solid":
                continue

            boundaries = geom.get("boundaries", [])
            if not boundaries:
                continue

            # Outer shell is boundaries[0]
            outer_shell = boundaries[0]
            for surface in outer_shell:
                if not surface:
                    continue
                # First ring is the outer boundary
                outer_ring = surface[0] if isinstance(surface[0], list) else surface

                decoded: list[list[float]] = []
                for idx in outer_ring:
                    if idx >= len(vertices):
                        continue
                    v = vertices[idx]
                    real_x = v[0] * scale[0] + translate[0]
                    real_y = v[1] * scale[1] + translate[1]
                    real_z = v[2] * scale[2] + translate[2]
                    dx = round(real_x - center_x, 2)
                    dy = round(real_y - center_y, 2)
                    decoded.append([dx, dy, round(real_z, 2)])

                if len(decoded) >= 3:
                    surfaces.append(decoded)

    return surfaces if surfaces else None


def _compute_building_orientation(footprint: list[list[float]]) -> float | None:
    """Compute building orientation from longest footprint edge.

    Returns azimuth in degrees (0=North, clockwise) in the 0-180 range,
    representing the axis direction (180-degree ambiguity: NE-SW and SW-NE
    are the same axis). Returns None for degenerate footprints.

    RD New coordinate system: +X=East, +Y=North.
    Azimuth formula: (90 - degrees(atan2(dy, dx))) % 360, then % 180 for axis.
    """
    if len(footprint) < 3:
        return None

    longest_sq = 0.0
    best_dx = 0.0
    best_dy = 0.0

    n = len(footprint)
    for i in range(n):
        j = (i + 1) % n
        dx = footprint[j][0] - footprint[i][0]
        dy = footprint[j][1] - footprint[i][1]
        length_sq = dx * dx + dy * dy
        if length_sq > longest_sq:
            longest_sq = length_sq
            best_dx = dx
            best_dy = dy

    if longest_sq < 0.01:  # <0.1m edge
        return None

    azimuth = (90 - math.degrees(math.atan2(best_dy, best_dx))) % 360
    return round(azimuth % 180, 1)


def _parse_building(
    city_object: dict,
    vertices: list[list[int]],
    scale: list[float],
    translate: list[float],
    center_x: float,
    center_y: float,
    city_objects: dict | None = None,
    allow_lod22: bool = True,
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

    # LoD 2.2 roof surfaces (optional, feature-flagged)
    roof_surfaces = None
    if allow_lod22 and settings.enable_lod22_roofs and city_objects is not None:
        try:
            roof_surfaces = _extract_lod22_surfaces(
                city_object, city_objects, vertices, scale, translate, center_x, center_y
            )
            if roof_surfaces:
                logger.info("LoD 2.2: %d surfaces for %s", len(roof_surfaces), raw_id)
        except Exception:
            logger.warning("LoD 2.2 parse failed for %s, falling back to LoD 0", raw_id)
            roof_surfaces = None

    return BuildingBlock(
        pand_id=raw_id,
        ground_height=round(h_maaiveld, 2),
        building_height=round(building_height, 2),
        footprint=footprint,
        year=year,
        roof_surfaces=roof_surfaces,
        orientation_deg=_compute_building_orientation(footprint),
    )


async def _fetch_target_building(
    pand_id: str, center_x: float, center_y: float
) -> BuildingBlock | None:
    """Fetch a single building directly by pand_id from the 3DBAG single-item endpoint."""
    client = _get_client()
    prefixed_id = f"NL.IMBAG.Pand.{pand_id}"
    url = f"{settings.three_d_bag_base}/collections/pand/items/{prefixed_id}"

    try:
        data = await _get_json_with_retries(
            client,
            url,
            timeout=httpx.Timeout(TARGET_FETCH_TIMEOUT, connect=3.0),
            attempts=TARGET_FETCH_RETRIES,
        )
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
        block = _parse_building(
            co_data, vertices, scale, translate, center_x, center_y,
            city_objects=city_objects,
            allow_lod22=True,
        )
        if block is not None:
            return block

    return None


def _get_next_page_url(data: dict, limit: int) -> str | None:
    """Read the next-page URL from 3DBAG links."""
    for link in data.get("links", []):
        if link.get("rel") != "next":
            continue
        href = link.get("href")
        if not isinstance(href, str) or not href:
            return None
        if "limit=" not in href:
            separator = "&" if "?" in href else "?"
            return f"{href}{separator}limit={limit}"
        return href
    return None


def _parse_bbox_page(
    data: dict,
    center_x: float,
    center_y: float,
) -> list[BuildingBlock]:
    """Parse a single 3DBAG bbox page into BuildingBlock rows."""
    transform = data.get("metadata", {}).get("transform", {})
    scale = transform.get("scale", [0.001, 0.001, 0.001])
    translate = transform.get("translate", [0.0, 0.0, 0.0])
    page_buildings: list[BuildingBlock] = []

    for feature in data.get("features", []):
        vertices = feature.get("vertices", [])
        city_objects = feature.get("CityObjects", {})
        for co_data in city_objects.values():
            if co_data.get("type") != "Building":
                continue
            block = _parse_building(
                co_data,
                vertices,
                scale,
                translate,
                center_x,
                center_y,
                city_objects=city_objects,
                allow_lod22=True,
            )
            if block is not None:
                page_buildings.append(block)

    return page_buildings


async def _fetch_bbox_paginated(
    center_x: float, center_y: float, radius: float
) -> tuple[list[BuildingBlock], bool]:
    """Fetch surrounding buildings from one paginated bbox query."""
    client = _get_client()
    x0, y0 = center_x - radius, center_y - radius
    x1, y1 = center_x + radius, center_y + radius
    bbox = f"{x0:.0f},{y0:.0f},{x1:.0f},{y1:.0f}"
    url = f"{settings.three_d_bag_base}/collections/pand/items"
    next_url = f"{url}?bbox={bbox}&limit={BBOX_PAGE_LIMIT}"

    start = time.monotonic()
    pages = 0
    partial = False
    buildings: list[BuildingBlock] = []

    while next_url and pages < BBOX_MAX_PAGES:
        remaining = BBOX_FETCH_BUDGET - (time.monotonic() - start)
        if remaining < MIN_FETCH_BUDGET:
            partial = True
            break

        try:
            data = await _get_json_with_retries(
                client,
                next_url,
                timeout=httpx.Timeout(min(BBOX_PAGE_TIMEOUT, remaining), connect=3.0),
                attempts=BBOX_FETCH_RETRIES,
            )
        except (httpx.HTTPError, httpx.TimeoutException) as exc:
            logger.warning("Bbox page %d fetch failed: %s", pages + 1, exc)
            partial = True
            break

        buildings.extend(_parse_bbox_page(data, center_x, center_y))

        next_url = _get_next_page_url(data, BBOX_PAGE_LIMIT)
        pages += 1

    if next_url:
        partial = True

    duration = time.monotonic() - start
    logger.info(
        "Bbox fetch: %d buildings in %.2fs (%d pages)%s",
        len(buildings),
        duration,
        pages,
        " [partial]" if partial else "",
    )
    return buildings, partial


async def _fetch_bbox_quick_context(
    center_x: float,
    center_y: float,
    radius: float,
    *,
    limit: int = FALLBACK_PAGE_LIMIT,
    timeout_s: float = FALLBACK_PAGE_TIMEOUT,
    max_pages: int = 1,
    reference_x: float | None = None,
    reference_y: float | None = None,
) -> tuple[list[BuildingBlock], bool]:
    """Fast bounded-page neighborhood context query.

    `center_x`/`center_y` define the bbox query center.
    `reference_x`/`reference_y` define the coordinate origin used for footprint offsets.
    """
    client = _get_client()
    x0, y0 = center_x - radius, center_y - radius
    x1, y1 = center_x + radius, center_y + radius
    bbox = f"{x0:.0f},{y0:.0f},{x1:.0f},{y1:.0f}"
    next_url = (
        f"{settings.three_d_bag_base}/collections/pand/items"
        f"?bbox={bbox}&limit={limit}"
    )
    pages = 0
    buildings: list[BuildingBlock] = []
    partial = False
    parse_center_x = center_x if reference_x is None else reference_x
    parse_center_y = center_y if reference_y is None else reference_y

    while next_url and pages < max_pages:
        try:
            data = await _get_json_with_retries(
                client,
                next_url,
                timeout=httpx.Timeout(timeout_s, connect=3.0),
                attempts=BBOX_FETCH_RETRIES,
            )
        except (httpx.HTTPError, httpx.TimeoutException) as exc:
            logger.warning("Quick bbox context fetch failed: %s", exc)
            return buildings, True

        buildings.extend(_parse_bbox_page(data, parse_center_x, parse_center_y))
        next_url = _get_next_page_url(data, limit)
        pages += 1

    if next_url:
        partial = True
    return buildings, partial


def _task_result_or_partial(task: asyncio.Task) -> tuple[list[BuildingBlock], bool]:
    """Return task result, converting failures into partial empty output."""
    try:
        return task.result()
    except Exception:
        return [], True


async def _fetch_bbox_resilient(
    center_x: float,
    center_y: float,
    radius: float,
) -> tuple[list[BuildingBlock], bool]:
    """Fetch neighborhood context with a fast backup path to avoid target-only drops."""
    backup_radius = max(FALLBACK_MIN_RADIUS, radius * FALLBACK_RADIUS_FACTOR)
    primary_task = asyncio.create_task(_fetch_bbox_paginated(center_x, center_y, radius))
    backup_task = asyncio.create_task(_fetch_bbox_quick_context(center_x, center_y, backup_radius))

    done, _pending = await asyncio.wait(
        {primary_task, backup_task},
        return_when=asyncio.FIRST_COMPLETED,
    )
    first_task = next(iter(done))

    if first_task is primary_task:
        primary_buildings, primary_partial = _task_result_or_partial(primary_task)
        if primary_buildings:
            backup_task.cancel()
            return primary_buildings, primary_partial
        backup_buildings, backup_partial = await backup_task
        if not backup_buildings:
            secondary_buildings, secondary_partial = await _fetch_bbox_quick_context(
                center_x,
                center_y,
                SECONDARY_FALLBACK_RADIUS,
            )
            if secondary_buildings:
                return secondary_buildings, True
            return [], primary_partial or backup_partial or secondary_partial
        return backup_buildings, primary_partial or backup_partial

    backup_buildings, backup_partial = _task_result_or_partial(backup_task)

    # Always wait for primary to finish — it covers a larger radius and returns
    # more buildings for accurate shadow analysis.  Use backup as minimum
    # guarantee if primary fails entirely.
    wait_timeout = (
        PRIMARY_WAIT_AFTER_EMPTY_BACKUP_SECONDS
        if not backup_buildings
        else PRIMARY_WAIT_AFTER_BACKUP_SECONDS
    )
    try:
        primary_buildings, primary_partial = await asyncio.wait_for(
            primary_task,
            timeout=wait_timeout,
        )
    except asyncio.TimeoutError:
        primary_task.cancel()
        primary_buildings, primary_partial = [], True
    except Exception:
        primary_task.cancel()
        primary_buildings, primary_partial = [], True

    # Prefer whichever fetch returned more buildings
    if len(primary_buildings) >= len(backup_buildings):
        if primary_buildings:
            return primary_buildings, primary_partial
    if backup_buildings:
        return backup_buildings, backup_partial or True

    # Both empty — try a secondary fallback
    secondary_buildings, secondary_partial = await _fetch_bbox_quick_context(
        center_x,
        center_y,
        SECONDARY_FALLBACK_RADIUS,
    )
    if secondary_buildings:
        return secondary_buildings, True
    return [], backup_partial or primary_partial or secondary_partial


async def _enrich_with_lod22(
    buildings: list[BuildingBlock],
    center_x: float,
    center_y: float,
    skip_pand_ids: set[str] | None = None,
) -> tuple[list[BuildingBlock], bool]:
    """Upgrade all returned context buildings to LoD 2.2 via single-item fetches."""
    if not buildings or not settings.enable_lod22_roofs:
        return buildings, False

    skip = skip_pand_ids or set()
    idx_by_id = {b.pand_id: idx for idx, b in enumerate(buildings)}
    # Most bbox features already include LoD 2.2 via BuildingPart children.
    # Only enrich blocks still missing roof surfaces.
    candidates = [b for b in buildings if b.pand_id not in skip and not b.roof_surfaces]
    partial = False

    if not candidates:
        return buildings, False

    semaphore = asyncio.Semaphore(LOD22_ENRICH_CONCURRENCY)

    async def _fetch_one(block: BuildingBlock) -> tuple[str, BuildingBlock | None, bool]:
        async with semaphore:
            detailed = await _fetch_target_building(block.pand_id, center_x, center_y)
            return block.pand_id, detailed, detailed is None

    results = await asyncio.gather(*[_fetch_one(b) for b in candidates])
    detailed_by_id: dict[str, BuildingBlock] = {}
    for pand_id, detailed, failed in results:
        if failed:
            partial = True
            continue
        if detailed is not None:
            detailed_by_id[pand_id] = detailed

    enriched = buildings.copy()
    for pand_id, detailed in detailed_by_id.items():
        idx = idx_by_id.get(pand_id)
        if idx is not None:
            enriched[idx] = detailed

    return enriched, partial


async def _get_neighborhood_3d_impl(
    pand_id: str,
    rd_x: float,
    rd_y: float,
    lat: float,
    lng: float,
    vbo_id: str | None = None,
    radius: float = DEFAULT_RADIUS,
) -> Neighborhood3DResponse:
    """Fetch 3D building data from 3DBAG for the neighborhood around a point."""
    near_radius = max(radius * 0.9, NEARBY_CONTEXT_MIN_RADIUS)
    near_task = asyncio.create_task(
        _fetch_bbox_quick_context(
            rd_x,
            rd_y,
            near_radius,
            limit=NEARBY_CONTEXT_LIMIT,
            timeout_s=NEARBY_CONTEXT_TIMEOUT,
            max_pages=NEARBY_CONTEXT_MAX_PAGES,
        )
    )

    # Parallel fetch: direct target + broader resilient context first.
    target_building, bbox_result = await asyncio.gather(
        _fetch_target_building(pand_id, rd_x, rd_y),
        _fetch_bbox_resilient(rd_x, rd_y, radius),
    )
    bbox_buildings, bbox_partial = bbox_result

    # Fallback: if the direct target fetch failed, try to find the target
    # in the bbox results (the single-item endpoint is less reliable than bbox).
    if target_building is None:
        for b in bbox_buildings:
            if b.pand_id == pand_id:
                target_building = b
                logger.info(
                    "Target %s recovered from bbox results after single-item 502",
                    pand_id,
                )
                break

    # Always await the near-ring context — bbox pagination is capped and frequently
    # returns fewer buildings than the near ring, especially at larger radii.
    near_buildings: list[BuildingBlock] = []
    near_partial = False
    try:
        near_buildings, near_partial = await near_task
    except Exception:
        near_buildings, near_partial = [], True

    if target_building is None:
        for b in near_buildings:
            if b.pand_id == pand_id:
                target_building = b
                logger.info(
                    "Target %s recovered from near-ring results after single-item 502",
                    pand_id,
                )
                break

    immediate_buildings: list[BuildingBlock] = []
    immediate_partial = False
    if target_building is not None:
        has_near_or_bbox_context = any(
            b.pand_id != target_building.pand_id
            for b in (*near_buildings, *bbox_buildings)
        )
        if not has_near_or_bbox_context:
            tx = sum(p[0] for p in target_building.footprint) / len(target_building.footprint)
            ty = sum(p[1] for p in target_building.footprint) / len(target_building.footprint)
            immediate_buildings, immediate_partial = await _fetch_bbox_quick_context(
                rd_x + tx,
                rd_y + ty,
                IMMEDIATE_CONTEXT_RADIUS,
                limit=IMMEDIATE_CONTEXT_LIMIT,
                timeout_s=IMMEDIATE_CONTEXT_TIMEOUT,
                max_pages=IMMEDIATE_CONTEXT_MAX_PAGES,
                reference_x=rd_x,
                reference_y=rd_y,
            )
    immediate_degraded = immediate_partial and not immediate_buildings
    near_degraded = near_partial and not near_buildings and not bbox_buildings

    # Merge: target first, then immediate-neighbor ring, then near ring, then broader context.
    seen_ids: set[str] = set()
    buildings: list[BuildingBlock] = []

    if target_building is not None:
        buildings.append(target_building)
        seen_ids.add(target_building.pand_id)

    for b in immediate_buildings:
        if b.pand_id not in seen_ids:
            buildings.append(b)
            seen_ids.add(b.pand_id)

    for b in near_buildings:
        if b.pand_id not in seen_ids:
            buildings.append(b)
            seen_ids.add(b.pand_id)

    for b in bbox_buildings:
        if b.pand_id not in seen_ids:
            buildings.append(b)
            seen_ids.add(b.pand_id)

    enrich_partial = False
    if buildings and settings.enable_lod22_context_enrichment:
        buildings, enrich_partial = await _enrich_with_lod22(
            buildings,
            rd_x,
            rd_y,
            skip_pand_ids={target_building.pand_id} if target_building else None,
        )

    target_index = next((i for i, b in enumerate(buildings) if b.pand_id == pand_id), None)
    target_found = target_index is not None
    if target_found and target_index is not None and target_index != 0:
        # Keep target first for deterministic frontend focus/highlight.
        buildings.insert(0, buildings.pop(target_index))
    address_id = vbo_id if vbo_id else pand_id
    center = Neighborhood3DCenter(lat=lat, lng=lng, rd_x=rd_x, rd_y=rd_y)

    message = None
    if not buildings:
        message = "No 3D building data available for this area"
    else:
        message_parts: list[str] = []
        if immediate_degraded or near_degraded or bbox_partial or enrich_partial:
            message_parts.append(
                "Partial neighborhood data: some surrounding buildings could not be loaded"
            )
        if not target_found:
            message_parts.append("Target building not found in 3D data")
        message = " ".join(message_parts) if message_parts else None

    return Neighborhood3DResponse(
        address_id=address_id,
        target_pand_id=pand_id if target_found else None,
        center=center,
        buildings=buildings,
        message=message,
    )


async def get_neighborhood_3d(
    pand_id: str,
    rd_x: float,
    rd_y: float,
    lat: float,
    lng: float,
    vbo_id: str | None = None,
    radius: float = DEFAULT_RADIUS,
) -> Neighborhood3DResponse:
    """Fetch neighborhood 3D context with single-flight request deduplication."""
    key = f"{pand_id}:{rd_x:.0f}:{rd_y:.0f}"
    existing = _in_flight.get(key)
    if existing is not None and not existing.done():
        logger.info("Dedup: joining in-flight request for %s", key)
        return await asyncio.shield(existing)

    task = asyncio.create_task(
        _get_neighborhood_3d_impl(
            pand_id=pand_id,
            rd_x=rd_x,
            rd_y=rd_y,
            lat=lat,
            lng=lng,
            vbo_id=vbo_id,
            radius=radius,
        )
    )
    _in_flight[key] = task
    try:
        return await asyncio.shield(task)
    finally:
        if _in_flight.get(key) is task:
            _in_flight.pop(key, None)


async def get_target_building_3d(
    pand_id: str,
    rd_x: float,
    rd_y: float,
    lat: float,
    lng: float,
    vbo_id: str | None = None,
) -> Neighborhood3DResponse:
    """Fast Phase 1: fetch only the target building (~2s, no bbox)."""
    target = await _fetch_target_building(pand_id, rd_x, rd_y)
    buildings = [target] if target else []
    return Neighborhood3DResponse(
        address_id=vbo_id or pand_id,
        target_pand_id=pand_id if target else None,
        center=Neighborhood3DCenter(lat=lat, lng=lng, rd_x=rd_x, rd_y=rd_y),
        buildings=buildings,
        message=None if target else "Target building not found in 3D data",
    )
