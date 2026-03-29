from unittest.mock import AsyncMock, patch

import httpx
import pytest

from app.api.dependencies import require_entitlement
from app.config import settings
from app.main import _resolved_cors_origins, app
from app.models.neighborhood3d import BuildingBlock, Neighborhood3DCenter, Neighborhood3DResponse


async def _entitlement_noop():
    return None


def test_gzip_middleware_registered():
    """GZipMiddleware must be in the app middleware stack."""
    middleware_names = [m.cls.__name__ for m in app.user_middleware]
    assert "GZipMiddleware" in middleware_names


def test_gzip_minimum_size_is_1000():
    """Small responses should skip gzip to avoid unnecessary overhead."""
    gzip_entry = next(
        m for m in app.user_middleware
        if m.cls.__name__ == "GZipMiddleware"
    )
    assert gzip_entry.kwargs.get("minimum_size") == 1000


def test_resolved_cors_origins_include_native_app_origin():
    with patch.object(settings, "cors_origins", ["https://app.buurt-check.nl"]):
        origins = _resolved_cors_origins()

    assert "https://app.buurt-check.nl" in origins
    assert "capacitor://localhost" in origins


@pytest.mark.asyncio
async def test_gzip_compresses_large_3d_response():
    """Large responses should include Content-Encoding: gzip."""
    buildings = [
        BuildingBlock(
            pand_id=f"036310009999{i:04d}",
            ground_height=0.5,
            building_height=10.0 + i,
            footprint=[[0, 0], [10, 0], [10, 8], [0, 8], [0, 0]],
        )
        for i in range(20)
    ]
    large_response = Neighborhood3DResponse(
        address_id="0363010000696734",
        target_pand_id="0363100012253924",
        center=Neighborhood3DCenter(lat=52.37, lng=4.89, rd_x=121005.0, rd_y=487005.0),
        buildings=buildings,
    )

    app.dependency_overrides[require_entitlement] = _entitlement_noop
    try:
        with (
            patch("app.api.address.cache_get", new_callable=AsyncMock, return_value=None),
            patch("app.api.address.cache_set", new_callable=AsyncMock),
            patch("app.api.address.three_d_bag") as mock_3d,
        ):
            mock_3d.get_neighborhood_3d = AsyncMock(return_value=large_response)
            async with httpx.AsyncClient(
                transport=httpx.ASGITransport(app=app),
                base_url="http://test",
                headers={"Accept-Encoding": "gzip"},
            ) as client:
                resp = await client.get(
                    "/api/address/0363010000696734/neighborhood3d",
                    params={
                        "pand_id": "0363100012253924",
                        "rd_x": "121005.0",
                        "rd_y": "487005.0",
                        "lat": "52.37",
                        "lng": "4.89",
                    },
                )
    finally:
        app.dependency_overrides.pop(require_entitlement, None)

    assert resp.status_code == 200
    assert resp.headers.get("content-encoding") == "gzip"
    data = resp.json()
    assert len(data["buildings"]) == 20


@pytest.mark.asyncio
async def test_gzip_skips_small_responses():
    """Small responses should not be gzip-compressed."""
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
        headers={"Accept-Encoding": "gzip"},
    ) as client:
        resp = await client.get("/health")

    assert resp.status_code == 200
    assert resp.headers.get("content-encoding") != "gzip"
