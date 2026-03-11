"""Render service interface — contract for server-side 3D rendering.

Production implementation: ``Forge3DRenderService`` in
``forge3d_renderer.py`` (in-process Rust/wgpu via forge3d Python bindings).

Feature-gated by ``BUURT_FORGE3D_ENABLED=true``.  Requires a GPU-capable
host when enabled.  Falls back to client-side Three.js canvas captures
when forge3d is unavailable or rendering fails.

Fallback chain:
    1. forge3d server render (if enabled + no client images)
    2. Client-provided shadow_images (existing flow)
    3. No shadow images → section omitted with "unavailable" fallback
"""

from typing import Protocol


class RenderService(Protocol):
    async def render_shadow_snapshots(
        self,
        pand_id: str,
        dates: list[str],
        times: list[str],
        camera_preset: str,
    ) -> list[bytes]: ...

    async def compute_sunlight_analysis(
        self,
        pand_id: str,
        lat: float,
        lng: float,
        sample_dates: list[str],
    ) -> dict: ...
