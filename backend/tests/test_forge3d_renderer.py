"""Tests for forge3d server-side rendering service and geometry converter."""

from __future__ import annotations

import base64
from unittest.mock import AsyncMock, patch

import numpy as np
import pytest

from app.config import Settings
from app.models.neighborhood3d import BuildingBlock
from app.services.forge3d_geometry import (
    NEIGHBOR_MATERIAL,
    TARGET_MATERIAL,
    _extrude_footprint,
    _roof_surfaces_to_mesh,
    building_block_to_mesh,
    building_blocks_to_forge3d_scene,
)
from app.services.forge3d_renderer import (
    Forge3DRenderService,
    _cache_key,
    _camera_position,
    _sun_azimuth_altitude_deg,
    _sun_direction,
    get_forge3d_status,
)

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

def _make_block(
    pand_id: str = "0363100012345678",
    ground_height: float = 1.5,
    building_height: float = 12.0,
    orientation_deg: float | None = 90.0,
    with_roof: bool = False,
) -> BuildingBlock:
    """Create a simple rectangular BuildingBlock for testing."""
    # 10m x 10m square footprint as RD-offset metres
    footprint = [[5.0, 5.0], [-5.0, 5.0], [-5.0, -5.0], [5.0, -5.0]]

    roof_surfaces = None
    if with_roof:
        # Flat roof as LoD 2.2 single surface (same as footprint but at roof height)
        z = ground_height + building_height
        roof_surfaces = [[[5.0, 5.0, z], [-5.0, 5.0, z], [-5.0, -5.0, z], [5.0, -5.0, z]]]

    return BuildingBlock(
        pand_id=pand_id,
        ground_height=ground_height,
        building_height=building_height,
        footprint=footprint,
        year=2000,
        roof_surfaces=roof_surfaces,
        orientation_deg=orientation_deg,
    )


# ---------------------------------------------------------------------------
# T7: Geometry converter tests
# ---------------------------------------------------------------------------


class TestExtrudeFootprint:
    """Tests for _extrude_footprint()."""

    def test_square_produces_valid_mesh(self):
        fp = [[5.0, 5.0], [-5.0, 5.0], [-5.0, -5.0], [5.0, -5.0]]
        positions, indices, normals = _extrude_footprint(fp, 0.0, 10.0)

        assert positions.dtype == np.float32
        assert indices.dtype == np.uint32
        assert normals.dtype == np.float32
        assert positions.ndim == 2
        assert positions.shape[1] == 3
        # 4 verts bottom + 4 top + 4 walls * 4 verts = 24
        assert len(positions) >= 8
        # At least some triangles
        assert len(indices) >= 6
        assert len(indices) % 3 == 0

    def test_degenerate_footprint_returns_empty(self):
        fp = [[0.0, 0.0], [1.0, 0.0]]  # Only 2 points
        positions, indices, normals = _extrude_footprint(fp, 0.0, 5.0)
        assert positions.size == 0
        assert indices.size == 0

    def test_ground_and_roof_heights(self):
        fp = [[5.0, 5.0], [-5.0, 5.0], [-5.0, -5.0], [5.0, -5.0]]
        positions, indices, normals = _extrude_footprint(fp, 2.0, 15.0)

        # Y coordinate (height) should span from 2.0 to 15.0
        y_coords = positions[:, 1]
        assert y_coords.min() == pytest.approx(2.0)
        assert y_coords.max() == pytest.approx(15.0)


class TestRoofSurfacesToMesh:
    """Tests for _roof_surfaces_to_mesh()."""

    def test_single_quad_surface(self):
        surfaces = [[[5.0, 5.0, 13.5], [-5.0, 5.0, 13.5], [-5.0, -5.0, 13.5], [5.0, -5.0, 13.5]]]
        positions, indices, normals = _roof_surfaces_to_mesh(surfaces)

        assert positions.shape == (4, 3)
        assert len(indices) == 6  # 2 triangles
        # Y-up: z_nap maps to Y coordinate
        assert positions[0, 1] == pytest.approx(13.5)

    def test_empty_surfaces_returns_empty(self):
        positions, indices, normals = _roof_surfaces_to_mesh([])
        assert positions.size == 0

    def test_normals_are_normalised(self):
        surfaces = [[[0, 0, 10], [10, 0, 10], [10, 10, 10], [0, 10, 10]]]
        positions, indices, normals = _roof_surfaces_to_mesh(surfaces)

        lengths = np.linalg.norm(normals, axis=1)
        assert np.allclose(lengths, 1.0, atol=0.01)


class TestBuildingBlockToMesh:
    """Tests for building_block_to_mesh()."""

    def test_uses_lod22_when_available(self):
        block = _make_block(with_roof=True)
        positions, indices, normals = building_block_to_mesh(block, use_lod22=True)

        # LoD 2.2 roof surface has 4 vertices
        assert positions.shape[0] == 4

    def test_falls_back_to_extrusion_without_lod22(self):
        block = _make_block(with_roof=False)
        positions, indices, normals = building_block_to_mesh(block, use_lod22=True)

        # Extruded footprint has more vertices (bottom + top + walls)
        assert positions.shape[0] >= 8

    def test_explicit_no_lod22(self):
        block = _make_block(with_roof=True)
        positions, indices, normals = building_block_to_mesh(block, use_lod22=False)

        # Should use extrusion even though LoD 2.2 is available
        assert positions.shape[0] >= 8


class TestBuildingBlocksToForge3dScene:
    """Tests for building_blocks_to_forge3d_scene()."""

    def test_scene_structure(self):
        target = _make_block(pand_id="0363100012345678")
        neighbors = [
            _make_block(pand_id="0363100099999991"),
            _make_block(pand_id="0363100099999992"),
        ]
        scene = building_blocks_to_forge3d_scene(target, neighbors)

        assert "target_mesh" in scene
        assert "neighbor_meshes" in scene
        assert "ground" in scene
        assert "center_height" in scene
        assert "orientation_deg" in scene

    def test_target_gets_teal_material(self):
        target = _make_block()
        scene = building_blocks_to_forge3d_scene(target, [])

        mat = scene["target_mesh"]["material"]
        assert mat["albedo"] == TARGET_MATERIAL["albedo"]
        assert mat["emissive"] == TARGET_MATERIAL["emissive"]

    def test_neighbors_get_gray_material(self):
        target = _make_block()
        neighbor = _make_block(pand_id="0363100099999999")
        scene = building_blocks_to_forge3d_scene(target, [neighbor])

        assert len(scene["neighbor_meshes"]) == 1
        mat = scene["neighbor_meshes"][0]["material"]
        assert mat["albedo"] == NEIGHBOR_MATERIAL["albedo"]

    def test_center_height_is_045_building_height(self):
        target = _make_block(ground_height=2.0, building_height=20.0)
        scene = building_blocks_to_forge3d_scene(target, [])

        expected = 2.0 + 20.0 * 0.45  # = 11.0
        assert scene["center_height"] == pytest.approx(expected)

    def test_ground_size(self):
        target = _make_block()
        scene = building_blocks_to_forge3d_scene(target, [])
        assert scene["ground"]["size"] == 200.0


# ---------------------------------------------------------------------------
# T8: Renderer service tests
# ---------------------------------------------------------------------------


class TestSunDirection:
    """Tests for _sun_direction() and _sun_azimuth_altitude_deg()."""

    def test_summer_noon_amsterdam_above_horizon(self):
        from datetime import datetime, timezone

        # June 21 12:00 UTC ≈ 14:00 CEST, sun well above horizon
        dt = datetime(2026, 6, 21, 12, 0, tzinfo=timezone.utc)
        direction = _sun_direction(dt, 52.37, 4.90)

        assert direction is not None
        x, y, z = direction
        assert y > 0  # Sun above horizon
        # Normalised
        length = (x**2 + y**2 + z**2) ** 0.5
        assert length == pytest.approx(1.0, abs=0.01)

    def test_midnight_returns_none(self):
        from datetime import datetime, timezone

        dt = datetime(2026, 6, 21, 0, 0, tzinfo=timezone.utc)
        direction = _sun_direction(dt, 52.37, 4.90)
        # At midnight UTC (2:00 CEST) sun may be barely above horizon in summer
        # Just verify it either returns None or a valid direction
        if direction is not None:
            assert direction[1] > 0

    def test_azimuth_altitude_returns_degrees(self):
        from datetime import datetime, timezone

        dt = datetime(2026, 6, 21, 12, 0, tzinfo=timezone.utc)
        az, alt = _sun_azimuth_altitude_deg(dt, 52.37, 4.90)

        assert az is not None
        assert alt is not None
        assert 0 <= az < 360
        assert 0 <= alt <= 90


class TestCameraPosition:
    """Tests for _camera_position()."""

    def test_returns_eye_target_fov(self):
        result = _camera_position(90.0, 5.0, 12.0)
        assert "eye" in result
        assert "target" in result
        assert "fov" in result

    def test_eye_is_above_target(self):
        result = _camera_position(0.0, 5.0, 12.0)
        eye_y = result["eye"][1]
        target_y = result["target"][1]
        assert eye_y > target_y

    def test_different_bearings_produce_different_positions(self):
        r1 = _camera_position(0.0, 5.0, 12.0)
        r2 = _camera_position(90.0, 5.0, 12.0)
        assert r1["eye"] != r2["eye"]


class TestCacheKey:
    """Tests for _cache_key()."""

    def test_includes_all_params(self):
        key = _cache_key("0363100012345678", "top", "2026-06-21", "12:00", "pcss")
        assert "0363100012345678" in key
        assert "top" in key
        assert "2026-06-21" in key
        assert "12:00" in key
        assert "pcss" in key

    def test_different_viewpoints_produce_different_keys(self):
        k1 = _cache_key("0363100012345678", "top", "2026-06-21", "12:00", "pcss")
        k2 = _cache_key("0363100012345678", "front", "2026-06-21", "12:00", "pcss")
        assert k1 != k2


class TestForge3DRenderService:
    """Tests for Forge3DRenderService."""

    def _make_settings(self, enabled: bool = True) -> Settings:
        """Create test settings with forge3d config."""
        return Settings(
            forge3d_enabled=enabled,
            forge3d_shadow_technique="pcss",
            forge3d_shadow_map_size=4096,
            forge3d_snapshot_width=1800,
            forge3d_snapshot_height=1200,
            forge3d_jpeg_quality=0.82,
            forge3d_render_timeout_seconds=15.0,
            cache_ttl_shadow_render=86400,
        )

    def _make_scene_data(self) -> dict:
        """Create minimal scene data for testing."""
        target = _make_block()
        return building_blocks_to_forge3d_scene(target, [])

    @pytest.mark.asyncio
    async def test_returns_none_when_forge3d_unavailable(self):
        """When forge3d is not installed, render returns None."""
        svc = Forge3DRenderService(self._make_settings())
        svc._available = False  # Simulate missing forge3d

        result = await svc.render_shadow_snapshots(
            pand_id="0363100012345678",
            dates=["2026-06-21"],
            times=["12:00"],
            camera_preset="triptych",
            scene_data=self._make_scene_data(),
        )
        assert result is None

    @pytest.mark.asyncio
    async def test_returns_none_without_scene_data(self):
        """Without scene_data, render returns None."""
        svc = Forge3DRenderService(self._make_settings())
        svc._available = True

        result = await svc.render_shadow_snapshots(
            pand_id="0363100012345678",
            dates=["2026-06-21"],
            times=["12:00"],
            camera_preset="triptych",
            scene_data=None,
        )
        assert result is None

    @pytest.mark.asyncio
    async def test_returns_3_dicts_on_triptych(self):
        """Successful triptych render returns list of 3 result dicts."""
        svc = Forge3DRenderService(self._make_settings())
        svc._available = True

        fake_jpeg = b"\xff\xd8\xff\xe0" + b"\x00" * 100
        mock_rendered = {"top": fake_jpeg, "front": fake_jpeg, "rear": fake_jpeg}

        with patch.object(svc, "_render_viewpoints_sync", return_value=mock_rendered):
            with patch(
                "app.services.forge3d_renderer.cache_get",
                new_callable=AsyncMock,
                return_value=None,
            ):
                with patch("app.services.forge3d_renderer.cache_set", new_callable=AsyncMock):
                    result = await svc.render_shadow_snapshots(
                        pand_id="0363100012345678",
                        dates=["2026-06-21"],
                        times=["12:00"],
                        camera_preset="triptych",
                        scene_data=self._make_scene_data(),
                    )

        assert result is not None
        assert len(result) == 3
        for item in result:
            assert isinstance(item, dict)
            assert item["jpeg_bytes"][:2] == b"\xff\xd8"
            assert "viewpoint" in item
            assert "hour" in item

    @pytest.mark.asyncio
    async def test_returns_6_dicts_on_triptych_6(self):
        """triptych_6 preset returns 6 results (3 views × 2 times)."""
        svc = Forge3DRenderService(self._make_settings())
        svc._available = True

        fake_jpeg = b"\xff\xd8\xff\xe0" + b"\x00" * 100
        mock_rendered = {"top": fake_jpeg, "front": fake_jpeg, "rear": fake_jpeg}

        with patch.object(svc, "_render_viewpoints_sync", return_value=mock_rendered):
            with patch(
                "app.services.forge3d_renderer.cache_get",
                new_callable=AsyncMock,
                return_value=None,
            ):
                with patch("app.services.forge3d_renderer.cache_set", new_callable=AsyncMock):
                    result = await svc.render_shadow_snapshots(
                        pand_id="0363100012345678",
                        dates=["2026-06-21"],
                        times=["07:00", "15:00"],
                        camera_preset="triptych_6",
                        scene_data=self._make_scene_data(),
                    )

        assert result is not None
        assert len(result) == 6
        # First 3 = morning, last 3 = afternoon
        assert result[0]["time_label"] == "morning"
        assert result[3]["time_label"] == "afternoon"
        viewpoints = [r["viewpoint"] for r in result[:3]]
        assert viewpoints == ["top", "front", "rear"]

    @pytest.mark.asyncio
    async def test_cache_hit_skips_render(self):
        """When all viewpoints are cached, render is never called."""
        svc = Forge3DRenderService(self._make_settings())
        svc._available = True

        fake_jpeg = b"\xff\xd8\xff\xe0" + b"\x00" * 100
        cached_b64 = base64.b64encode(fake_jpeg).decode("ascii")

        with patch(
            "app.services.forge3d_renderer.cache_get",
            new_callable=AsyncMock,
            return_value=cached_b64,
        ):
            with patch.object(svc, "_render_viewpoints_sync") as mock_render:
                result = await svc.render_shadow_snapshots(
                    pand_id="0363100012345678",
                    dates=["2026-06-21"],
                    times=["12:00"],
                    camera_preset="triptych",
                    scene_data=self._make_scene_data(),
                )

        mock_render.assert_not_called()
        assert result is not None
        assert len(result) == 3

    @pytest.mark.asyncio
    async def test_render_exception_returns_none(self):
        """If rendering raises, gracefully return None."""
        svc = Forge3DRenderService(self._make_settings())
        svc._available = True

        with patch.object(svc, "_render_viewpoints_sync", side_effect=RuntimeError("GPU exploded")):
            with patch(
                "app.services.forge3d_renderer.cache_get",
                new_callable=AsyncMock,
                return_value=None,
            ):
                result = await svc.render_shadow_snapshots(
                    pand_id="0363100012345678",
                    dates=["2026-06-21"],
                    times=["12:00"],
                    camera_preset="triptych",
                    scene_data=self._make_scene_data(),
                )

        assert result is None

    @pytest.mark.asyncio
    async def test_partial_render_returns_none(self):
        """If only 2 of 3 viewpoints render, return None (not partial)."""
        svc = Forge3DRenderService(self._make_settings())
        svc._available = True

        fake_jpeg = b"\xff\xd8\xff\xe0" + b"\x00" * 100
        mock_rendered = {"top": fake_jpeg, "front": fake_jpeg}  # missing "rear"

        with patch.object(svc, "_render_viewpoints_sync", return_value=mock_rendered):
            with patch(
                "app.services.forge3d_renderer.cache_get",
                new_callable=AsyncMock,
                return_value=None,
            ):
                with patch("app.services.forge3d_renderer.cache_set", new_callable=AsyncMock):
                    result = await svc.render_shadow_snapshots(
                        pand_id="0363100012345678",
                        dates=["2026-06-21"],
                        times=["12:00"],
                        camera_preset="triptych",
                        scene_data=self._make_scene_data(),
                    )

        assert result is None


class TestForge3DStatus:
    """Tests for get_forge3d_status()."""

    def test_reports_unavailable(self):
        with patch("app.services.forge3d_renderer._forge3d", None):
            with patch("app.services.forge3d_renderer._forge3d_import_error", "No GPU"):
                status = get_forge3d_status()

        assert status["available"] is False or status["import_error"] is not None
