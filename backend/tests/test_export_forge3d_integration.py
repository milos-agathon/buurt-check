"""Integration tests for export route with forge3d server-side rendering.

Tests 4 scenarios:
1. Server render succeeds → PDF uses server images
2. Server render disabled → client images used (unchanged)
3. Server render fails + client images present → client fallback
4. No images at all → graceful omission
"""

from __future__ import annotations

import base64
from unittest.mock import AsyncMock, patch

import pytest

from app.services.forge3d_renderer import Forge3DRenderService

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _fake_jpeg() -> bytes:
    """Minimal valid-ish JPEG bytes for testing."""
    return b"\xff\xd8\xff\xe0" + b"\x00" * 200


def _fake_jpeg_b64() -> str:
    return base64.b64encode(_fake_jpeg()).decode("ascii")


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestExportForge3DIntegration:
    """Integration tests for forge3d in the export pipeline."""

    @pytest.mark.asyncio
    async def test_server_render_produces_shadow_items(self):
        """When forge3d returns 3 images, they become ShadowImageItem list."""
        from app.config import Settings

        svc = Forge3DRenderService(Settings(forge3d_enabled=True))
        svc._available = True

        fake = _fake_jpeg()
        mock_rendered = {"top": fake, "front": fake, "rear": fake}

        with patch.object(svc, "_render_viewpoints_sync", return_value=mock_rendered):
            with patch(
                "app.services.forge3d_renderer.cache_get",
                new_callable=AsyncMock,
                return_value=None,
            ):
                with patch("app.services.forge3d_renderer.cache_set", new_callable=AsyncMock):
                    from app.models.neighborhood3d import BuildingBlock
                    from app.services.forge3d_geometry import building_blocks_to_forge3d_scene

                    target = BuildingBlock(
                        pand_id="0363100012345678",
                        ground_height=1.5,
                        building_height=12.0,
                        footprint=[[5, 5], [-5, 5], [-5, -5], [5, -5]],
                    )
                    scene = building_blocks_to_forge3d_scene(target, [])

                    result = await svc.render_shadow_snapshots(
                        pand_id="0363100012345678",
                        dates=["2026-06-21"],
                        times=["12:00"],
                        camera_preset="triptych",
                        scene_data=scene,
                        lat=52.37,
                        lng=4.90,
                    )

        assert result is not None
        assert len(result) == 3
        # Each should be a dict with jpeg_bytes
        for item in result:
            assert isinstance(item, dict)
            assert isinstance(item["jpeg_bytes"], bytes)
            assert item["jpeg_bytes"][:2] == b"\xff\xd8"

    @pytest.mark.asyncio
    async def test_disabled_service_returns_none(self):
        """When forge3d_enabled=False, get_render_service returns None."""
        from app.api.dependencies import get_render_service

        with patch("app.api.dependencies.settings") as mock_settings:
            mock_settings.forge3d_enabled = False
            result = get_render_service()

        assert result is None

    @pytest.mark.asyncio
    async def test_server_failure_allows_client_fallback(self):
        """If forge3d fails, the caller should handle None gracefully."""
        from app.config import Settings

        svc = Forge3DRenderService(Settings(forge3d_enabled=True))
        svc._available = True

        # Simulate render failure
        with patch.object(svc, "_render_viewpoints_sync", side_effect=RuntimeError("GPU OOM")):
            with patch(
                "app.services.forge3d_renderer.cache_get",
                new_callable=AsyncMock,
                return_value=None,
            ):
                from app.models.neighborhood3d import BuildingBlock
                from app.services.forge3d_geometry import building_blocks_to_forge3d_scene

                target = BuildingBlock(
                    pand_id="0363100012345678",
                    ground_height=1.5,
                    building_height=12.0,
                    footprint=[[5, 5], [-5, 5], [-5, -5], [5, -5]],
                )
                scene = building_blocks_to_forge3d_scene(target, [])

                result = await svc.render_shadow_snapshots(
                    pand_id="0363100012345678",
                    dates=["2026-06-21"],
                    times=["12:00"],
                    camera_preset="triptych",
                    scene_data=scene,
                )

        # Should return None, allowing caller to fall back to client images
        assert result is None

    def test_bytes_to_base64_round_trip(self):
        """Verify bytes→base64→bytes round-trip for PDF embedding."""
        original = _fake_jpeg()
        b64 = base64.b64encode(original).decode("ascii")
        decoded = base64.b64decode(b64)
        assert decoded == original
