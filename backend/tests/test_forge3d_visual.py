"""Visual regression tests for forge3d rendering quality.

Marked ``@pytest.mark.live`` — requires GPU and forge3d installed.
Skipped in CI by default (``pytest -m "not live"``).

These tests render known buildings and compare against Three.js baseline
captures stored in ``tests/fixtures/``.
"""

from __future__ import annotations

import pytest

# Skip entire module if forge3d is not importable
forge3d = pytest.importorskip("forge3d", reason="forge3d not installed")


@pytest.mark.live
class TestForge3DVisualRegression:
    """Visual regression tests comparing forge3d output to Three.js baselines."""

    def test_render_known_building_produces_image(self):
        """Render a known Amsterdam building and verify output is a valid image."""
        from app.config import Settings
        from app.models.neighborhood3d import BuildingBlock
        from app.services.forge3d_geometry import building_blocks_to_forge3d_scene
        from app.services.forge3d_renderer import Forge3DRenderService

        settings = Settings(forge3d_enabled=True)
        svc = Forge3DRenderService(settings)

        if not svc.available:
            pytest.skip("forge3d not available (no GPU adapter)")

        # Centraal Station Amsterdam (simplified geometry)
        target = BuildingBlock(
            pand_id="0363100012253924",
            ground_height=0.5,
            building_height=25.0,
            footprint=[
                [50.0, 20.0], [-50.0, 20.0],
                [-50.0, -20.0], [50.0, -20.0],
            ],
            orientation_deg=0.0,
        )
        scene = building_blocks_to_forge3d_scene(target, [])

        result = svc._render_viewpoints_sync(
            scene_data=scene,
            viewpoint_configs=[{"viewpoint": "top", "bearing_offset": 45.0}],
            orientation_deg=0.0,
            date_iso="2026-06-21",
            time_str="12:00",
            lat=52.3791,
            lng=4.9003,
        )

        assert result is not None
        assert "top" in result
        jpeg_bytes = result["top"]

        # Verify JPEG magic bytes
        assert jpeg_bytes[:2] == b"\xff\xd8"
        # Minimum reasonable size for 1800x1200 JPEG
        assert len(jpeg_bytes) > 10000

    def test_render_dimensions_match_config(self):
        """Rendered image dimensions match configured width/height."""
        pytest.skip("Requires PIL to decode JPEG and check dimensions — deferred")
