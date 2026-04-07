import base64
from unittest.mock import AsyncMock, patch

import pytest

from app.models.neighborhood3d import BuildingBlock, Neighborhood3DCenter, Neighborhood3DResponse
from app.services.shadow_prewarm import build_seasonal_shadow_evidence


def _make_neighborhood_3d() -> Neighborhood3DResponse:
    return Neighborhood3DResponse(
        address_id="0363010000696734",
        target_pand_id="0363100012345678",
        center=Neighborhood3DCenter(
            lat=52.372,
            lng=4.892,
            rd_x=121286.0,
            rd_y=487296.0,
        ),
        buildings=[
            BuildingBlock(
                pand_id="0363100012345678",
                ground_height=1.5,
                building_height=12.0,
                footprint=[[5.0, 5.0], [-5.0, 5.0], [-5.0, -5.0], [5.0, -5.0]],
                year=1910,
            ),
            BuildingBlock(
                pand_id="0363100099999999",
                ground_height=1.5,
                building_height=10.0,
                footprint=[[15.0, 15.0], [7.0, 15.0], [7.0, 7.0], [15.0, 7.0]],
                year=1980,
            ),
        ],
    )


def _triptych_payload(
    *,
    top: bytes,
    front: bytes,
    rear: bytes,
    sun_azimuth: float,
    sun_altitude: float,
) -> list[dict]:
    return [
        {
            "hour": 12,
            "viewpoint": "top",
            "time_label": "noon",
            "jpeg_bytes": top,
            "sun_azimuth": sun_azimuth,
            "sun_altitude": sun_altitude,
        },
        {
            "hour": 12,
            "viewpoint": "front",
            "time_label": "noon",
            "jpeg_bytes": front,
            "sun_azimuth": sun_azimuth,
            "sun_altitude": sun_altitude,
        },
        {
            "hour": 12,
            "viewpoint": "rear",
            "time_label": "noon",
            "jpeg_bytes": rear,
            "sun_azimuth": sun_azimuth,
            "sun_altitude": sun_altitude,
        },
    ]


@pytest.mark.asyncio
async def test_build_seasonal_shadow_evidence_returns_none_when_renderer_unavailable():
    mock_render_service = type("MockRenderService", (), {})()
    mock_render_service.available = False
    mock_render_service.render_shadow_snapshots = AsyncMock()

    with patch(
        "app.services.shadow_prewarm.three_d_bag.get_neighborhood_3d",
        new_callable=AsyncMock,
    ) as mock_get_neighborhood_3d:
        result = await build_seasonal_shadow_evidence(
            render_service=mock_render_service,
            vbo_id="0363010000696734",
            pand_id="0363100012345678",
            rd_x=121286.0,
            rd_y=487296.0,
            lat=52.372,
            lng=4.892,
        )

    assert result is None
    mock_get_neighborhood_3d.assert_not_awaited()
    mock_render_service.render_shadow_snapshots.assert_not_awaited()


@pytest.mark.asyncio
async def test_build_seasonal_shadow_evidence_normalizes_complete_seasonal_payload():
    equinox_top = b"equinox-top"
    equinox_front = b"equinox-front"
    equinox_rear = b"equinox-rear"
    summer_top = b"summer-top"
    summer_front = b"summer-front"
    summer_rear = b"summer-rear"
    winter_top = b"winter-top"
    winter_front = b"winter-front"
    winter_rear = b"winter-rear"

    mock_render_service = type("MockRenderService", (), {})()
    mock_render_service.available = True
    mock_render_service.render_shadow_snapshots = AsyncMock(
        side_effect=[
            _triptych_payload(
                top=equinox_top,
                front=equinox_front,
                rear=equinox_rear,
                sun_azimuth=180.0,
                sun_altitude=38.0,
            ),
            _triptych_payload(
                top=summer_top,
                front=summer_front,
                rear=summer_rear,
                sun_azimuth=195.0,
                sun_altitude=60.0,
            ),
            _triptych_payload(
                top=winter_top,
                front=winter_front,
                rear=winter_rear,
                sun_azimuth=165.0,
                sun_altitude=15.0,
            ),
        ],
    )

    with (
        patch(
            "app.services.shadow_prewarm.three_d_bag.get_neighborhood_3d",
            new_callable=AsyncMock,
            return_value=_make_neighborhood_3d(),
        ),
        patch(
            "app.services.shadow_prewarm.building_blocks_to_forge3d_scene",
            return_value={"orientation_deg": 0.0},
        ),
    ):
        result = await build_seasonal_shadow_evidence(
            render_service=mock_render_service,
            vbo_id="0363010000696734",
            pand_id="0363100012345678",
            rd_x=121286.0,
            rd_y=487296.0,
            lat=52.372,
            lng=4.892,
        )

    assert result is not None
    assert [item["label"] for item in result.facade_images] == [
        "equinox_front",
        "equinox_rear",
        "summer_front",
        "summer_rear",
        "winter_front",
        "winter_rear",
    ]
    assert [item["viewpoint"] for item in result.facade_images] == [
        "front",
        "rear",
        "front",
        "rear",
        "front",
        "rear",
    ]
    assert [item["season"] for item in result.facade_images] == [
        "equinox",
        "equinox",
        "summer",
        "summer",
        "winter",
        "winter",
    ]
    assert result.winter_top_b64 == base64.b64encode(winter_top).decode("ascii")
    assert result.equinox_top_b64 == base64.b64encode(equinox_top).decode("ascii")
    assert result.summer_top_b64 == base64.b64encode(summer_top).decode("ascii")


@pytest.mark.asyncio
async def test_build_seasonal_shadow_evidence_returns_none_for_incomplete_results():
    mock_render_service = type("MockRenderService", (), {})()
    mock_render_service.available = True
    mock_render_service.render_shadow_snapshots = AsyncMock(
        side_effect=[
            _triptych_payload(
                top=b"equinox-top",
                front=b"equinox-front",
                rear=b"equinox-rear",
                sun_azimuth=180.0,
                sun_altitude=38.0,
            ),
            [
                {
                    "hour": 12,
                    "viewpoint": "top",
                    "time_label": "noon",
                    "jpeg_bytes": b"summer-top",
                    "sun_azimuth": 195.0,
                    "sun_altitude": 60.0,
                },
                {
                    "hour": 12,
                    "viewpoint": "front",
                    "time_label": "noon",
                    "jpeg_bytes": b"summer-front",
                    "sun_azimuth": 195.0,
                    "sun_altitude": 60.0,
                },
            ],
        ],
    )

    with (
        patch(
            "app.services.shadow_prewarm.three_d_bag.get_neighborhood_3d",
            new_callable=AsyncMock,
            return_value=_make_neighborhood_3d(),
        ),
        patch(
            "app.services.shadow_prewarm.building_blocks_to_forge3d_scene",
            return_value={"orientation_deg": 0.0},
        ),
    ):
        result = await build_seasonal_shadow_evidence(
            render_service=mock_render_service,
            vbo_id="0363010000696734",
            pand_id="0363100012345678",
            rd_x=121286.0,
            rd_y=487296.0,
            lat=52.372,
            lng=4.892,
        )

    assert result is None


@pytest.mark.asyncio
async def test_build_seasonal_shadow_evidence_calls_three_d_bag_with_current_signature():
    mock_render_service = type("MockRenderService", (), {})()
    mock_render_service.available = True
    mock_render_service.render_shadow_snapshots = AsyncMock(
        side_effect=[
            _triptych_payload(
                top=b"equinox-top",
                front=b"equinox-front",
                rear=b"equinox-rear",
                sun_azimuth=180.0,
                sun_altitude=38.0,
            ),
            _triptych_payload(
                top=b"summer-top",
                front=b"summer-front",
                rear=b"summer-rear",
                sun_azimuth=195.0,
                sun_altitude=60.0,
            ),
            _triptych_payload(
                top=b"winter-top",
                front=b"winter-front",
                rear=b"winter-rear",
                sun_azimuth=165.0,
                sun_altitude=15.0,
            ),
        ],
    )

    with (
        patch(
            "app.services.shadow_prewarm.three_d_bag.get_neighborhood_3d",
            new_callable=AsyncMock,
            return_value=_make_neighborhood_3d(),
        ) as mock_get_neighborhood_3d,
        patch(
            "app.services.shadow_prewarm.building_blocks_to_forge3d_scene",
            return_value={"orientation_deg": 0.0},
        ),
    ):
        result = await build_seasonal_shadow_evidence(
            render_service=mock_render_service,
            vbo_id="0363010000696734",
            pand_id="0363100012345678",
            rd_x=121286.0,
            rd_y=487296.0,
            lat=52.372,
            lng=4.892,
        )

    assert result is not None
    mock_get_neighborhood_3d.assert_awaited_once_with(
        "0363100012345678",
        121286.0,
        487296.0,
        52.372,
        4.892,
        vbo_id="0363010000696734",
    )
