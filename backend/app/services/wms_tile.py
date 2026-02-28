"""WMS tile proxy — fetch GetMap tiles as PNG bytes for frontend overlay display."""

import logging

import httpx

from app.config import settings
from app.services.http_client import LoopAwareClient
from app.services.risk_cards import (
    _CLIMATE_HEAT_LAYERS,
    _get_alo_layers,
    _get_climate_layer_names,
    _get_gcn_layers,
    _select_air_layer,
    _select_noise_layer,
)

logger = logging.getLogger(__name__)

_client: LoopAwareClient | None = LoopAwareClient(timeout=httpx.Timeout(10.0, connect=3.0))


def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = LoopAwareClient(timeout=httpx.Timeout(10.0, connect=3.0))
    return _client.get()


async def _resolve_layer(tile_type: str) -> tuple[str | None, str]:
    """Resolve a tile type to (layer_name, wms_base_url).

    Returns (None, "") if no layer is available or tile_type is unknown.
    """
    if tile_type == "noise":
        layers = await _get_alo_layers()
        layer = _select_noise_layer(layers)
        return (layer, settings.rivm_alo_wms_base)

    if tile_type == "air_quality":
        layers = await _get_gcn_layers()
        # Use NO2 — PM2.5 not available as WMS layer
        layer = _select_air_layer(layers, "NO2")
        return (layer, settings.rivm_gcn_wms_base)

    if tile_type == "climate":
        available = await _get_climate_layer_names()
        # Find first available raster heat layer
        for layer_name, layer_kind in _CLIMATE_HEAT_LAYERS:
            if layer_kind == "raster" and layer_name in available:
                return (layer_name, settings.climate_atlas_wms_base)
        return (None, "")

    if tile_type == "luchtfoto":
        return ("Actueel_orthoHR", settings.luchtfoto_wms_base)

    return (None, "")


async def get_wms_tile(
    tile_type: str,
    rd_x: float,
    rd_y: float,
    radius: float = 250.0,
    size: int = 512,
) -> bytes | None:
    """Fetch a WMS GetMap tile as PNG bytes.

    Returns None on any error (timeout, non-image response, no layer available).
    """
    layer, wms_base = await _resolve_layer(tile_type)
    if layer is None:
        return None

    is_photo = tile_type == "luchtfoto"
    bbox = f"{rd_x - radius},{rd_y - radius},{rd_x + radius},{rd_y + radius}"
    params = {
        "service": "WMS",
        "version": "1.3.0",
        "request": "GetMap",
        "layers": layer,
        "crs": "EPSG:28992",
        "bbox": bbox,
        "width": str(size),
        "height": str(size),
        "format": "image/jpeg" if is_photo else "image/png",
        "transparent": "false" if is_photo else "true",
        "styles": "",
    }

    client = _get_client()
    try:
        resp = await client.get(wms_base, params=params)
        resp.raise_for_status()
    except (httpx.HTTPError, httpx.TimeoutException) as exc:
        logger.warning("WMS tile fetch failed for %s: %s", tile_type, exc)
        return None

    content_type = resp.headers.get("content-type", "")
    if "image/" not in content_type:
        logger.warning(
            "WMS tile returned non-image content-type for %s: %s", tile_type, content_type
        )
        return None

    return resp.content
