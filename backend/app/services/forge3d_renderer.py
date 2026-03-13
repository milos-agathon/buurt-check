"""forge3d server-side renderer for PDF dossier shadow snapshots.

In-process implementation using forge3d (Rust/wgpu) Python bindings.
All rendering calls are blocking Rust FFI, so they are wrapped in
``asyncio.to_thread()`` to keep the FastAPI event loop responsive.

Feature-gated via ``settings.forge3d_enabled``.  When forge3d is
unavailable (no GPU, import error, render failure), every public method
returns ``None`` so the caller can fall back to client-side captures.
"""

from __future__ import annotations

import asyncio
import io
import logging
import math
from datetime import datetime, timezone
from typing import Any

from app.cache.redis import cache_get, cache_set
from app.config import Settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Lazy forge3d import — avoid hard crash if package isn't installed
# ---------------------------------------------------------------------------

_forge3d = None
_forge3d_import_error: str | None = None


def _ensure_forge3d() -> bool:
    """Try to import forge3d once.  Returns True if available."""
    global _forge3d, _forge3d_import_error  # noqa: PLW0603
    if _forge3d is not None:
        return True
    if _forge3d_import_error is not None:
        return False
    try:
        import forge3d as _f3d

        _forge3d = _f3d
        logger.info("forge3d %s loaded successfully", getattr(_f3d, "__version__", "?"))
        return True
    except ImportError as exc:
        _forge3d_import_error = str(exc)
        logger.warning("forge3d not available: %s", exc)
        return False


# ---------------------------------------------------------------------------
# Sun position (pure-Python fallback matching frontend SunCalc)
# ---------------------------------------------------------------------------

def _sun_direction(dt: datetime, lat: float, lng: float) -> tuple[float, float, float] | None:
    """Compute sun direction vector (x, y, z) for a given datetime and location.

    Uses the same astronomical algorithm as SunCalc.  Returns None if the
    sun is below the horizon.

    Coordinate convention (Y-up, matching Three.js / forge3d):
        x = east (+) / west (-)
        y = up
        z = south (+) / north (-)
    """
    # Julian date
    jd = (dt.timestamp() / 86400.0) + 2440587.5
    d = jd - 2451545.0  # days since J2000

    # Solar coordinates (simplified)
    M = math.radians((357.5291 + 0.98560028 * d) % 360)  # mean anomaly
    C = math.radians(1.9148) * math.sin(M) + math.radians(0.02) * math.sin(2 * M)
    L = math.radians((280.4665 + 0.98564736 * d) % 360) + C  # ecliptic longitude
    obliquity = math.radians(23.4393 - 0.0000004 * d)

    # Right ascension and declination
    sin_L = math.sin(L)
    cos_L = math.cos(L)
    dec = math.asin(math.sin(obliquity) * sin_L)

    # Hour angle
    lw = math.radians(-lng)
    sidereal = math.radians((280.1470 + 360.9856235 * d) % 360) - lw
    ra = math.atan2(math.sin(obliquity) * sin_L, cos_L)  # simplified
    H = sidereal - ra  # hour angle

    lat_rad = math.radians(lat)
    sin_lat = math.sin(lat_rad)
    cos_lat = math.cos(lat_rad)
    sin_dec = math.sin(dec)
    cos_dec = math.cos(dec)

    # Altitude (elevation above horizon)
    altitude = math.asin(sin_lat * sin_dec + cos_lat * cos_dec * math.cos(H))
    if altitude <= 0:
        return None

    # Azimuth (from south, clockwise = SunCalc convention)
    azimuth = math.atan2(
        math.sin(H),
        math.cos(H) * sin_lat - math.tan(dec) * cos_lat,
    )

    # Convert to direction vector (matching frontend getSunDirection)
    cos_alt = math.cos(altitude)
    x = -math.sin(azimuth) * cos_alt
    y = math.sin(altitude)
    z = math.cos(azimuth) * cos_alt

    length = math.sqrt(x * x + y * y + z * z)
    if length < 1e-9:
        return None
    return (x / length, y / length, z / length)


def _sun_azimuth_altitude_deg(
    dt: datetime, lat: float, lng: float,
) -> tuple[float | None, float | None]:
    """Return (azimuth_deg, altitude_deg) or (None, None)."""
    direction = _sun_direction(dt, lat, lng)
    if direction is None:
        return None, None
    x, y, z = direction
    azimuth = (math.degrees(math.atan2(x, -z)) + 360) % 360
    altitude = max(0.0, math.degrees(math.asin(y)))
    return azimuth, altitude


# ---------------------------------------------------------------------------
# Camera viewpoint presets
# ---------------------------------------------------------------------------

_VIEWPOINT_CONFIGS = [
    {"viewpoint": "top", "bearing_offset": 45.0},
    {"viewpoint": "front", "bearing_offset": 0.0},   # uses building orientation
    {"viewpoint": "rear", "bearing_offset": 180.0},   # opposite of front
]

# Summer morning + afternoon time presets (Amsterdam CEST = UTC+2)
_TIME_PRESETS = [
    {"label": "morning", "time": "07:00", "hour": 9},   # 07:00 UTC = 09:00 CEST
    {"label": "afternoon", "time": "15:00", "hour": 17},  # 15:00 UTC = 17:00 CEST
]

_SNAPSHOT_RADIUS_METERS = 30.0   # house clearly visible with context
_SUN_DISTANCE = 300.0

# Fallback ground material if scene_data doesn't provide one
GROUND_MATERIAL_FALLBACK = {
    "albedo": (0.93, 0.95, 0.96),
    "roughness": 0.95,
    "metallic": 0.02,
    "emissive": 0.0,
}


def _camera_position(
    bearing_deg: float,
    center_height: float,
    building_height: float,
) -> dict:
    """Compute camera position and look-at for a viewpoint.

    Camera is placed close to the building so it fills ~60% of the frame.
    The building should be clearly identifiable from all three angles.
    """
    bearing_rad = math.radians(bearing_deg)
    # Camera height: 1× building height for moderate overhead angle
    camera_height = max(building_height * 1.0, 10.0)
    # Planar distance: enough to frame the building without clipping
    planar_distance = max(building_height * 0.85, 14.0)

    return {
        "eye": (
            math.sin(bearing_rad) * planar_distance,
            center_height + camera_height,
            -math.cos(bearing_rad) * planar_distance,
        ),
        "target": (0.0, center_height, 0.0),
        "fov": 50.0,  # wider FOV at close range shows building + neighbours
    }


# ---------------------------------------------------------------------------
# Cache helpers
# ---------------------------------------------------------------------------

def _cache_key(pand_id: str, viewpoint: str, date_iso: str, time_str: str, technique: str) -> str:
    return f"shadow_render:v1:{pand_id}:{viewpoint}:{date_iso}:{time_str}:{technique}"


# ---------------------------------------------------------------------------
# Main render service
# ---------------------------------------------------------------------------

class Forge3DRenderService:
    """In-process forge3d renderer satisfying the RenderService protocol."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._available: bool | None = None

    @property
    def available(self) -> bool:
        """Check if forge3d can be used (lazy, cached after first probe)."""
        if self._available is None:
            self._available = _ensure_forge3d()
        return self._available

    # -----------------------------------------------------------------------
    # RenderService protocol
    # -----------------------------------------------------------------------

    async def render_shadow_snapshots(
        self,
        pand_id: str,
        dates: list[str],
        times: list[str],
        camera_preset: str,
        *,
        scene_data: dict | None = None,
        lat: float = 52.37,
        lng: float = 4.90,
    ) -> list[dict[str, Any]] | None:
        """Render shadow snapshots for a building.

        Parameters
        ----------
        pand_id : str
            16-digit BAG pand identifier.
        dates : list[str]
            ISO date strings (e.g. ["2026-06-21"]).
        times : list[str]
            Time strings — now supports multiple (e.g. ["07:00", "15:00"]).
            When ``camera_preset="triptych_6"`` the caller should pass 2 times
            and ``_TIME_PRESETS`` will be used for morning/afternoon labels.
        camera_preset : str
            "triptych" for 3 viewpoints × 1 time (legacy),
            "triptych_6" for 3 viewpoints × 2 times (morning + afternoon),
            or "top"/"front"/"rear" for a single viewpoint.
        scene_data : dict, optional
            Pre-built scene from ``building_blocks_to_forge3d_scene()``.
        lat, lng : float
            WGS84 coordinates for sun position calculation.

        Returns
        -------
        list[dict] | None
            List of dicts with keys: ``viewpoint``, ``time_label``, ``hour``,
            ``sun_azimuth``, ``sun_altitude``, ``jpeg_bytes``.
            Ordered: [top-morning, front-morning, rear-morning,
                      top-afternoon, front-afternoon, rear-afternoon]
            or the 3-item legacy order for ``triptych``.
            Returns None on any error.
        """
        if not self.available:
            logger.debug("forge3d not available, skipping render for %s", pand_id)
            return None

        if scene_data is None:
            logger.error("render_shadow_snapshots called without scene_data for %s", pand_id)
            return None

        date_iso = dates[0] if dates else "2026-06-21"
        technique = self.settings.forge3d_shadow_technique

        # Determine viewpoints
        if camera_preset in ("triptych", "triptych_6"):
            viewpoints = _VIEWPOINT_CONFIGS
        else:
            viewpoints = [c for c in _VIEWPOINT_CONFIGS if c["viewpoint"] == camera_preset]
            if not viewpoints:
                viewpoints = _VIEWPOINT_CONFIGS

        # Determine time slots
        if camera_preset == "triptych_6":
            time_slots = _TIME_PRESETS
        elif times:
            time_slots = [{"label": "noon", "time": times[0], "hour": 12}]
        else:
            time_slots = [{"label": "noon", "time": "12:00", "hour": 12}]

        orientation_deg = scene_data.get("orientation_deg") or 0.0

        # Render each (time, viewpoint) combination
        all_results: list[dict[str, Any]] = []

        for time_slot in time_slots:
            time_str = time_slot["time"]
            time_label = time_slot["label"]
            hour = time_slot["hour"]

            # Check cache first (per-viewpoint per-time)
            cached_results: dict[str, bytes] = {}
            uncached_viewpoints: list[dict] = []
            for vp_cfg in viewpoints:
                vp_name = vp_cfg["viewpoint"]
                key = _cache_key(pand_id, vp_name, date_iso, time_str, technique)
                cached = await cache_get(key)
                if cached and isinstance(cached, str):
                    import base64
                    try:
                        cached_results[vp_name] = base64.b64decode(cached)
                    except Exception:
                        uncached_viewpoints.append(vp_cfg)
                else:
                    uncached_viewpoints.append(vp_cfg)

            # Render uncached viewpoints for this time slot
            if uncached_viewpoints:
                try:
                    rendered = await asyncio.to_thread(
                        self._render_viewpoints_sync,
                        scene_data=scene_data,
                        viewpoint_configs=uncached_viewpoints,
                        orientation_deg=orientation_deg,
                        date_iso=date_iso,
                        time_str=time_str,
                        lat=lat,
                        lng=lng,
                    )
                    if rendered is None:
                        return None

                    import base64
                    for vp_name, jpeg_bytes in rendered.items():
                        cached_results[vp_name] = jpeg_bytes
                        key = _cache_key(pand_id, vp_name, date_iso, time_str, technique)
                        b64_val = base64.b64encode(jpeg_bytes).decode("ascii")
                        await cache_set(
                            key, b64_val, ttl=self.settings.cache_ttl_shadow_render,
                        )
                except Exception:
                    logger.exception("forge3d render failed for %s at %s", pand_id, time_str)
                    return None

            # Compute sun position for metadata
            try:
                parts = date_iso.split("-")
                year, month, day = int(parts[0]), int(parts[1]), int(parts[2])
                h, m = (int(x) for x in time_str.split(":"))
                dt = datetime(year, month, day, h, m, tzinfo=timezone.utc)
            except (ValueError, IndexError):
                dt = datetime(2026, 6, 21, 12, 0, tzinfo=timezone.utc)

            sun_az, sun_alt = _sun_azimuth_altitude_deg(dt, lat, lng)

            # Assemble results in viewpoint order for this time slot
            for vp_cfg in viewpoints:
                vp_name = vp_cfg["viewpoint"]
                if vp_name not in cached_results:
                    logger.error("Missing viewpoint %s for %s at %s", vp_name, pand_id, time_str)
                    return None
                all_results.append({
                    "viewpoint": vp_name,
                    "time_label": time_label,
                    "hour": hour,
                    "sun_azimuth": sun_az,
                    "sun_altitude": sun_alt,
                    "jpeg_bytes": cached_results[vp_name],
                })

        return all_results

    async def compute_sunlight_analysis(
        self,
        pand_id: str,
        lat: float,
        lng: float,
        sample_dates: list[str],
    ) -> dict:
        """Deferred — not yet implemented."""
        raise NotImplementedError("Sunlight analysis via forge3d is deferred to Phase 2")

    # -----------------------------------------------------------------------
    # Sync rendering (runs in thread via asyncio.to_thread)
    # -----------------------------------------------------------------------

    def _render_viewpoints_sync(
        self,
        *,
        scene_data: dict,
        viewpoint_configs: list[dict],
        orientation_deg: float,
        date_iso: str,
        time_str: str,
        lat: float,
        lng: float,
    ) -> dict[str, bytes] | None:
        """Render one or more viewpoints synchronously using forge3d.

        Returns {viewpoint_name: jpeg_bytes} or None on error.
        """
        f3d = _forge3d
        if f3d is None:
            return None

        try:
            from forge3d.buildings import Building, BuildingLayer, BuildingMaterial
            from forge3d.render import render_highres
        except ImportError as exc:
            logger.error("forge3d submodule import failed: %s", exc)
            return None

        settings = self.settings
        width = settings.forge3d_snapshot_width
        height = settings.forge3d_snapshot_height

        # Parse date/time for sun position
        try:
            parts = date_iso.split("-")
            year, month, day = int(parts[0]), int(parts[1]), int(parts[2])
            hour, minute = (int(x) for x in time_str.split(":"))
            # Use UTC+2 approximation for Amsterdam summer (CEST)
            dt = datetime(year, month, day, hour, minute, tzinfo=timezone.utc)
        except (ValueError, IndexError):
            dt = datetime(2026, 6, 21, 12, 0, tzinfo=timezone.utc)

        sun_dir = _sun_direction(dt, lat, lng)

        # Build forge3d scene
        target_data = scene_data["target_mesh"]
        center_height = scene_data["center_height"]
        building_height = scene_data.get("building_height", 10.0)

        # Create forge3d Building objects
        target_building = Building(
            id=target_data["pand_id"],
            positions=target_data["positions"],
            indices=target_data["indices"],
            normals=target_data["normals"],
            material=BuildingMaterial(**target_data["material"]),
        )

        neighbor_buildings = []
        for nb_data in scene_data.get("neighbor_meshes", []):
            if nb_data["positions"].size == 0:
                continue
            neighbor_buildings.append(
                Building(
                    id=nb_data["pand_id"],
                    positions=nb_data["positions"],
                    indices=nb_data["indices"],
                    normals=nb_data["normals"],
                    material=BuildingMaterial(**nb_data["material"]),
                )
            )

        layer = BuildingLayer(
            name=f"buurt_{target_data['pand_id']}",
            buildings=[target_building, *neighbor_buildings],
        )

        # Ground plane for shadow reception
        ground_cfg = scene_data.get("ground", {})
        ground_size = ground_cfg.get("size", 300.0)
        ground_mat = ground_cfg.get("material", GROUND_MATERIAL_FALLBACK)
        ground_height = scene_data.get("ground_height", 0.0)

        # Detect building aspect ratio to choose correct facade bearing.
        # orientation_deg = azimuth of longest footprint edge.
        # For narrow-deep houses (longest = depth), camera at orientation_deg
        # sees the facade.  For wide-shallow buildings (longest = facade),
        # camera at orientation_deg + 90 sees the facade.
        front_bearing_base = orientation_deg
        try:
            positions = target_data.get("positions")
            if positions is not None and len(positions) >= 6:
                import numpy as np
                pts = np.array(positions).reshape(-1, 3)
                orient_rad = math.radians(orientation_deg)
                along_x = math.sin(orient_rad)
                along_z = -math.cos(orient_rad)
                perp_x = math.cos(orient_rad)
                perp_z = math.sin(orient_rad)
                proj_along = pts[:, 0] * along_x + pts[:, 2] * along_z
                proj_perp = pts[:, 0] * perp_x + pts[:, 2] * perp_z
                span_along = float(proj_along.max() - proj_along.min())
                span_perp = float(proj_perp.max() - proj_perp.min())
                if span_perp > span_along * 1.15:
                    front_bearing_base = (orientation_deg + 90.0) % 360
        except Exception:
            pass  # fall back to orientation_deg

        # Disambiguate the 180° ambiguity using the address point.
        # Scene is centred on the address point (origin = street side).
        # The building footprint centroid sits at an offset from the address
        # point.  The "front" camera should be placed on the address-point
        # side of the building so it captures the street-facing facade.
        #
        # Direction from building centroid → address point (origin) in RD
        # offsets gives us the azimuth of the "front" side.  If the current
        # front_bearing_base points away from the address point, flip by 180°.
        fp_centroid = scene_data.get("footprint_centroid")
        if fp_centroid is not None:
            cx, cy = fp_centroid  # RD metre offsets: +X=East, +Y=North
            dist_sq = cx * cx + cy * cy
            if dist_sq > 0.25:  # >0.5 m offset — meaningful direction
                # Direction from centroid toward origin (address point)
                addr_az = (90 - math.degrees(math.atan2(-cy, -cx))) % 360
                # Check which candidate is closer to addr_az
                diff_cur = abs(((front_bearing_base - addr_az + 180) % 360) - 180)
                diff_flipped = abs((((front_bearing_base + 180) - addr_az + 180) % 360) - 180)
                if diff_flipped < diff_cur:
                    front_bearing_base = (front_bearing_base + 180.0) % 360

        # Render each viewpoint
        results: dict[str, bytes] = {}
        for vp_cfg in viewpoint_configs:
            vp_name = vp_cfg["viewpoint"]
            bearing_offset = vp_cfg["bearing_offset"]

            if vp_name == "top":
                bearing = 45.0
            else:
                bearing = (front_bearing_base + bearing_offset) % 360

            camera = _camera_position(bearing, center_height, building_height)

            try:
                # Configure render parameters
                render_params = {
                    "width": width,
                    "height": height,
                    "camera_eye": camera["eye"],
                    "camera_target": camera["target"],
                    "camera_fov": camera["fov"],
                    "background_color": (0.94, 0.96, 0.97),  # #F0F5F7 slightly darker for contrast
                    "shadow_technique": settings.forge3d_shadow_technique,
                    "shadow_map_size": settings.forge3d_shadow_map_size,
                    # Ground plane — shadows must land on a surface
                    "ground_plane": True,
                    "ground_y": ground_height,
                    "ground_size": ground_size,
                    "ground_color": ground_mat.get("albedo", (0.93, 0.95, 0.96)),
                    # Ambient light — low so shadows are visually distinct
                    "ambient_intensity": 0.25,
                }

                # Set sun light if above horizon
                if sun_dir:
                    render_params["sun_direction"] = sun_dir
                    render_params["sun_intensity"] = 1.2
                    render_params["shadow_enabled"] = True
                    render_params["shadow_opacity"] = 0.55

                # Render to numpy array
                image_array = render_highres(
                    buildings=layer,
                    **render_params,
                )

                # Convert numpy RGBA to JPEG bytes
                jpeg_bytes = self._numpy_to_jpeg(
                    image_array, quality=int(settings.forge3d_jpeg_quality * 100),
                )
                if jpeg_bytes:
                    results[vp_name] = jpeg_bytes
                else:
                    logger.error("JPEG encoding failed for %s/%s", target_data["pand_id"], vp_name)
                    return None

            except Exception:
                logger.exception(
                    "forge3d render error for %s viewpoint %s",
                    target_data["pand_id"],
                    vp_name,
                )
                return None

        return results

    @staticmethod
    def _numpy_to_jpeg(image_array: Any, quality: int = 82) -> bytes | None:
        """Convert a numpy RGBA/RGB array to JPEG bytes."""
        try:
            from PIL import Image

            if hasattr(image_array, "numpy"):
                image_array = image_array.numpy()

            import numpy as np

            arr = np.asarray(image_array, dtype=np.uint8)

            # Handle various shapes
            if arr.ndim == 3 and arr.shape[2] == 4:
                # RGBA → RGB
                arr = arr[:, :, :3]

            img = Image.fromarray(arr, mode="RGB")
            buf = io.BytesIO()
            img.save(buf, format="JPEG", quality=quality)
            return buf.getvalue()
        except Exception:
            logger.exception("Failed to encode JPEG")
            return None


# ---------------------------------------------------------------------------
# Module-level convenience
# ---------------------------------------------------------------------------

def get_forge3d_status() -> dict:
    """Probe forge3d availability for health checks."""
    available = _ensure_forge3d()
    info: dict[str, Any] = {
        "available": available,
        "import_error": _forge3d_import_error,
    }
    if available and _forge3d is not None:
        info["version"] = getattr(_forge3d, "__version__", "unknown")
    return info
