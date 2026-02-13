"""Render service interface -- contract for future server-side 3D rendering.

Currently unimplemented. Client-side Three.js canvas capture serves export.
When implemented, PDF export will prefer server render with client fallback.

Phase 5 deferred (2026-02-12). Client-side Three.js canvas capture serves
PDF export adequately. Server rendering deferred until export metrics
(Phase 6) justify infrastructure cost. Revisit path: headless Chromium
first (lower cost), forge3/Rust second (higher quality).
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
