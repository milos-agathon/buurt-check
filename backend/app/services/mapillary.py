import asyncio
import logging
import math
from typing import Any

import httpx

from app.config import settings
from app.models.mapillary import MapillaryImage, MapillaryResponse

logger = logging.getLogger(__name__)

_client: httpx.AsyncClient | None = None
_client_loop_id: int | None = None


def _get_client() -> httpx.AsyncClient:
    global _client, _client_loop_id
    loop_id = id(asyncio.get_running_loop())
    if _client is None or _client.is_closed or _client_loop_id != loop_id:
        _client = httpx.AsyncClient(timeout=httpx.Timeout(12.0, connect=4.0))
        _client_loop_id = loop_id
    return _client


def _to_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    radius_m = 6_371_000.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lng2 - lng1)
    a = (
        math.sin(delta_phi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return radius_m * c


def _bearing_deg(from_lat: float, from_lng: float, to_lat: float, to_lng: float) -> float:
    phi1 = math.radians(from_lat)
    phi2 = math.radians(to_lat)
    delta_lambda = math.radians(to_lng - from_lng)
    x = math.sin(delta_lambda) * math.cos(phi2)
    y = math.cos(phi1) * math.sin(phi2) - (
        math.sin(phi1) * math.cos(phi2) * math.cos(delta_lambda)
    )
    return (math.degrees(math.atan2(x, y)) + 360.0) % 360.0


def _angle_delta_deg(a: float, b: float) -> float:
    return abs((a - b + 180.0) % 360.0 - 180.0)


def _bbox_for_point(lat: float, lng: float, radius_m: int) -> tuple[float, float, float, float]:
    lat_delta = radius_m / 111_320.0
    cos_lat = max(abs(math.cos(math.radians(lat))), 0.01)
    lng_delta = radius_m / (111_320.0 * cos_lat)
    return (
        lng - lng_delta,
        lat - lat_delta,
        lng + lng_delta,
        lat + lat_delta,
    )


def _extract_image(
    item: dict[str, Any],
    target_lat: float,
    target_lng: float,
) -> MapillaryImage | None:
    image_id = str(item.get("id") or "").strip()
    if not image_id:
        return None

    geometry = item.get("computed_geometry") or item.get("geometry") or {}
    coords = geometry.get("coordinates") if isinstance(geometry, dict) else None

    distance_m: float | None = None
    look_at_delta_deg: float | None = None
    compass_angle = _to_float(item.get("computed_compass_angle")) or _to_float(
        item.get("compass_angle")
    )

    if (
        isinstance(coords, list)
        and len(coords) >= 2
        and isinstance(coords[0], (int, float))
        and isinstance(coords[1], (int, float))
    ):
        img_lng = float(coords[0])
        img_lat = float(coords[1])
        distance_m = round(_haversine_m(img_lat, img_lng, target_lat, target_lng), 1)
        if compass_angle is not None:
            look_bearing = _bearing_deg(img_lat, img_lng, target_lat, target_lng)
            look_at_delta_deg = round(_angle_delta_deg(compass_angle, look_bearing), 1)

    return MapillaryImage(
        id=image_id,
        captured_at=item.get("captured_at"),
        is_pano=bool(item.get("is_pano")),
        compass_angle=compass_angle,
        distance_m=distance_m,
        look_at_delta_deg=look_at_delta_deg,
        thumb_1024_url=item.get("thumb_1024_url"),
        thumb_2048_url=item.get("thumb_2048_url"),
        viewer_url=f"https://www.mapillary.com/app/?pKey={image_id}&focus=photo",
        embed_url=f"https://www.mapillary.com/embed?image_key={image_id}&style=photo",
    )


def _image_rank(image: MapillaryImage) -> tuple[int, int, float, float]:
    pano_rank = 0 if image.is_pano else 1
    heading_rank = 0 if image.look_at_delta_deg is not None else 1
    look_rank = image.look_at_delta_deg if image.look_at_delta_deg is not None else 181.0
    distance_rank = image.distance_m if image.distance_m is not None else float("inf")
    return (pano_rank, heading_rank, look_rank, distance_rank)


def _select_best_image(
    rows: list[dict[str, Any]],
    target_lat: float,
    target_lng: float,
) -> MapillaryImage | None:
    candidates: list[MapillaryImage] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        image = _extract_image(row, target_lat, target_lng)
        if image is not None:
            candidates.append(image)

    if not candidates:
        return None

    candidates.sort(key=_image_rank)
    return candidates[0]


async def get_street_view(
    *,
    vbo_id: str,
    lat: float,
    lng: float,
) -> MapillaryResponse:
    token = (settings.mapillary_access_token or "").strip()
    if not token:
        return MapillaryResponse(address_id=vbo_id, message="MAPILLARY_TOKEN_MISSING")

    west, south, east, north = _bbox_for_point(lat, lng, settings.mapillary_search_radius_m)
    params = {
        "access_token": token,
        "bbox": f"{west:.6f},{south:.6f},{east:.6f},{north:.6f}",
        "fields": (
            "id,captured_at,is_pano,compass_angle,computed_compass_angle,"
            "computed_geometry,thumb_1024_url,thumb_2048_url"
        ),
        "limit": str(settings.mapillary_max_results),
    }

    client = _get_client()
    try:
        resp = await client.get(f"{settings.mapillary_graph_base}/images", params=params)
    except Exception:
        logger.exception("Mapillary lookup failed")
        return MapillaryResponse(address_id=vbo_id, message="MAPILLARY_LOOKUP_FAILED")

    if resp.status_code in (401, 403):
        return MapillaryResponse(address_id=vbo_id, message="MAPILLARY_AUTH_FAILED")
    if resp.status_code == 429:
        return MapillaryResponse(address_id=vbo_id, message="MAPILLARY_RATE_LIMITED")
    if resp.status_code >= 400:
        return MapillaryResponse(address_id=vbo_id, message="MAPILLARY_LOOKUP_FAILED")

    try:
        payload = resp.json()
    except ValueError:
        logger.warning("Mapillary response was not valid JSON")
        return MapillaryResponse(address_id=vbo_id, message="MAPILLARY_LOOKUP_FAILED")

    rows = payload.get("data") if isinstance(payload, dict) else None
    if not isinstance(rows, list) or not rows:
        return MapillaryResponse(address_id=vbo_id, message="MAPILLARY_NO_IMAGE")

    image = _select_best_image(rows, lat, lng)
    if image is None:
        return MapillaryResponse(address_id=vbo_id, message="MAPILLARY_NO_IMAGE")

    source_date = image.captured_at[:10] if image.captured_at else None
    return MapillaryResponse(address_id=vbo_id, image=image, source_date=source_date)
