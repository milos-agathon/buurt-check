from __future__ import annotations

import base64
from dataclasses import dataclass
from typing import Any

from app.services import three_d_bag
from app.services.forge3d_geometry import building_blocks_to_forge3d_scene
from app.services.forge3d_renderer import Forge3DRenderService

_SEASONAL_RENDER_SPECS: tuple[tuple[str, str], ...] = (
    ("equinox", "2026-03-20"),
    ("summer", "2026-06-21"),
    ("winter", "2026-12-21"),
)


@dataclass(frozen=True, slots=True)
class SeasonalShadowEvidence:
    facade_images: list[dict[str, Any]]
    winter_top_b64: str
    equinox_top_b64: str
    summer_top_b64: str


async def build_seasonal_shadow_evidence(
    *,
    render_service: Forge3DRenderService,
    vbo_id: str,
    pand_id: str,
    rd_x: float,
    rd_y: float,
    lat: float,
    lng: float,
) -> SeasonalShadowEvidence | None:
    """Render and normalize Forge3D seasonal shadow evidence for export/prewarm.

    Returns a complete 6-facade + 3-hero payload or ``None`` for expected
    non-success states such as renderer unavailability, missing building context,
    or incomplete seasonal output.
    """
    if not render_service.available:
        return None

    neighborhood = await three_d_bag.get_neighborhood_3d(
        pand_id,
        rd_x,
        rd_y,
        lat,
        lng,
        vbo_id=vbo_id,
    )
    if not neighborhood or not neighborhood.buildings:
        return None

    target_block = next(
        (building for building in neighborhood.buildings if building.pand_id == pand_id),
        None,
    )
    if target_block is None:
        return None

    neighbors = [
        building
        for building in neighborhood.buildings
        if building.pand_id != pand_id
    ]
    scene_data = building_blocks_to_forge3d_scene(target_block, neighbors)

    facade_images: list[dict[str, Any]] = []
    top_images: dict[str, str] = {}

    for season_label, date_iso in _SEASONAL_RENDER_SPECS:
        rendered_images = await render_service.render_shadow_snapshots(
            pand_id=pand_id,
            dates=[date_iso],
            times=["12:00"],
            camera_preset="triptych",
            scene_data=scene_data,
            lat=lat,
            lng=lng,
        )
        if not rendered_images:
            return None

        season_facades: dict[str, dict[str, Any]] = {}
        for item in rendered_images:
            viewpoint = str(item.get("viewpoint") or "").lower()
            jpeg_bytes = item.get("jpeg_bytes")
            if not isinstance(jpeg_bytes, (bytes, bytearray)):
                continue

            image_b64 = base64.b64encode(bytes(jpeg_bytes)).decode("ascii")
            if viewpoint == "top":
                top_images[season_label] = image_b64
                continue
            if viewpoint not in {"front", "rear"}:
                continue

            season_facades[viewpoint] = {
                "hour": 12,
                "label": f"{season_label}_{viewpoint}",
                "image_b64": image_b64,
                "viewpoint": viewpoint,
                "season": season_label,
                "sun_azimuth": item.get("sun_azimuth"),
                "sun_altitude": item.get("sun_altitude"),
            }

        if season_label not in top_images:
            return None
        if "front" not in season_facades or "rear" not in season_facades:
            return None

        facade_images.extend([
            season_facades["front"],
            season_facades["rear"],
        ])

    if len(facade_images) != 6:
        return None
    if set(top_images) != {"winter", "equinox", "summer"}:
        return None

    return SeasonalShadowEvidence(
        facade_images=facade_images,
        winter_top_b64=top_images["winter"],
        equinox_top_b64=top_images["equinox"],
        summer_top_b64=top_images["summer"],
    )
