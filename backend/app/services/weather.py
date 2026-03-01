import logging
import re
from typing import Any

import httpx

from app.cache.redis import cache_get, cache_set
from app.config import settings
from app.services.http_client import LoopAwareClient

logger = logging.getLogger(__name__)

_client = LoopAwareClient(timeout=httpx.Timeout(30.0, connect=5.0))
_PVGIS_GRID_STEP_DEG = 0.05
_TIME_COMPACT_RE = re.compile(r"^(\d{4})(\d{2})(\d{2}):(\d{2})(\d{2})$")


def _get_client() -> httpx.AsyncClient:
    return _client.get()


def _snap_to_grid(value: float, step: float = _PVGIS_GRID_STEP_DEG) -> float:
    return round(value / step) * step


def _weather_cache_key(lat: float, lng: float) -> str:
    return f"weather_tmy:v1:{lat:.2f}:{lng:.2f}"


def _parse_compact_time_utc(raw: str) -> tuple[str, int] | None:
    match = _TIME_COMPACT_RE.match(raw)
    if not match:
        return None

    year, month, day, hh, mm = match.groups()
    hour = int(hh)
    minute = int(mm)
    iso = f"{year}-{month}-{day}T{hh}:{mm}:00Z"
    return iso, (hour * 60) + minute


def _to_float(value: Any) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return 0.0
    if not (parsed == parsed and parsed not in (float("inf"), float("-inf"))):
        return 0.0
    return parsed


async def fetch_tmy_data(lat: float, lng: float) -> list[dict[str, Any]]:
    """Fetch and cache PVGIS TMY hourly weather records for irradiance modeling."""
    lat_snapped = _snap_to_grid(lat)
    lng_snapped = _snap_to_grid(lng)
    cache_key = _weather_cache_key(lat_snapped, lng_snapped)

    cached = await cache_get(cache_key)
    if isinstance(cached, list) and len(cached) > 0:
        return cached

    client = _get_client()
    resp = await client.get(
        settings.pvgis_tmy_base,
        params={
            "lat": f"{lat_snapped:.2f}",
            "lon": f"{lng_snapped:.2f}",
            "outputformat": "json",
            "usehorizon": "1",
        },
    )
    resp.raise_for_status()

    payload = resp.json() if resp.content else {}
    raw_rows = (
        (payload.get("outputs") or {}).get("tmy_hourly")
        if isinstance(payload, dict)
        else None
    )
    if not isinstance(raw_rows, list):
        return []

    parsed: list[dict[str, Any]] = []
    for row in raw_rows:
        if not isinstance(row, dict):
            continue
        compact_time = row.get("time(UTC)")
        if not isinstance(compact_time, str):
            continue

        parsed_time = _parse_compact_time_utc(compact_time)
        if parsed_time is None:
            continue
        iso_time, minute_of_day = parsed_time

        parsed.append({
            "date": iso_time,
            "minute_of_day": minute_of_day,
            "ghi_w_m2": _to_float(row.get("G(h)")),
            "dni_w_m2": _to_float(row.get("Gb(n)")),
            "dhi_w_m2": _to_float(row.get("Gd(h)")),
        })

    if parsed:
        await cache_set(cache_key, parsed, ttl=settings.cache_ttl_weather_tmy)
    else:
        logger.debug(
            "PVGIS returned empty tmy_hourly payload lat=%.2f lng=%.2f",
            lat_snapped,
            lng_snapped,
        )

    return parsed
