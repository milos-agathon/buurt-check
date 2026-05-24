from unittest.mock import AsyncMock

import httpx
import pytest

from app.services import bag_ogc


def _mock_response(payload: dict) -> httpx.Response:
    return httpx.Response(
        200,
        json=payload,
        request=httpx.Request("GET", "https://api.pdok.nl/kadaster/bag/ogc/v2/mock"),
    )


def _pand_feature(
    pand_id: str,
    *,
    status: str,
    gebruiksdoel: str | None,
    aantal_verblijfsobjecten: int | None,
    west: float,
) -> dict:
    properties: dict[str, object] = {
        "identificatie": pand_id,
        "status": status,
        "aantal_verblijfsobjecten": aantal_verblijfsobjecten,
        "bouwjaar": 1994,
        "documentdatum": "2026-04-22",
    }
    if gebruiksdoel is not None:
        properties["gebruiksdoel"] = gebruiksdoel
    return {
        "type": "Feature",
        "properties": properties,
        "geometry": {
            "type": "Polygon",
            "coordinates": [[
                [west, 52.354],
                [west + 0.001, 52.354],
                [west + 0.001, 52.355],
                [west, 52.355],
                [west, 52.354],
            ]],
        },
    }


@pytest.mark.asyncio
async def test_pdok_bag_pand_page_parses_semantic_use_and_prioritizes_residential(
    monkeypatch,
):
    client = AsyncMock()
    client.get.return_value = _mock_response({
        "type": "FeatureCollection",
        "features": [
            _pand_feature(
                "0363100012253002",
                status="Pand in gebruik",
                gebruiksdoel="winkelfunctie",
                aantal_verblijfsobjecten=1,
                west=4.999,
            ),
            _pand_feature(
                "0363100012253001",
                status="Pand in gebruik",
                gebruiksdoel="winkelfunctie,woonfunctie",
                aantal_verblijfsobjecten=4,
                west=4.991,
            ),
            _pand_feature(
                "0363100012253003",
                status="Pand in gebruik",
                gebruiksdoel=None,
                aantal_verblijfsobjecten=0,
                west=5.004,
            ),
        ],
        "links": [{
            "rel": "next",
            "href": "https://api.pdok.nl/kadaster/bag/ogc/v2/collections/pand/items?cursor=abc",
        }],
    })
    monkeypatch.setattr(bag_ogc, "_get_client", lambda: client)

    page = await bag_ogc.get_pand_footprints_in_rd_bounds_page(
        [125450, 486000, 127050, 487600],
        limit=25,
    )

    assert [pand.pand_id for pand in page.pands] == [
        "0363100012253001",
        "0363100012253002",
        "0363100012253003",
    ]
    assert page.pands[0].gebruiksdoelen == ["winkelfunctie", "woonfunctie"]
    assert page.pands[0].usage_classification == "mixed_residential"
    assert page.pands[0].house_selectable is True
    assert page.pands[1].usage_classification == "non_residential"
    assert page.pands[1].house_selectable is False
    assert page.pands[2].usage_classification == "no_verblijfsobject"
    assert page.pands[2].house_selectable is False
    assert page.next_cursor

    request_url = str(client.get.await_args.args[0])
    assert "/collections/pand/items" in request_url
    assert "bbox=125450%2C486000%2C127050%2C487600" in request_url
    assert "bbox-crs=http%3A%2F%2Fwww.opengis.net%2Fdef%2Fcrs%2FEPSG%2F0%2F28992" in request_url
    assert "crs=http%3A%2F%2Fwww.opengis.net%2Fdef%2Fcrs%2FOGC%2F1.3%2FCRS84" in request_url
