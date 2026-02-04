import re

import pytest

from app.services.bag import (
    GEBRUIKSDOEL_TRANSLATIONS,
    STATUS_TRANSLATIONS,
    _translate_gebruiksdoel,
    _translate_status,
    _validate_bag_id,
    get_building_facts,
)


def test_translate_status_known():
    assert _translate_status("Pand in gebruik") == "In use"
    assert _translate_status("Pand gesloopt") == "Demolished"
    assert _translate_status("Verbouwing pand") == "Under renovation"


def test_translate_status_unknown():
    assert _translate_status("Unknown status") == "Unknown status"


def test_translate_status_none():
    assert _translate_status(None) is None


def test_translate_gebruiksdoel_single():
    nl, en = _translate_gebruiksdoel("woonfunctie")
    assert nl == ["woonfunctie"]
    assert en == ["Residential"]


def test_translate_gebruiksdoel_multiple():
    nl, en = _translate_gebruiksdoel("winkelfunctie,woonfunctie")
    assert nl == ["winkelfunctie", "woonfunctie"]
    assert en == ["Retail", "Residential"]


def test_translate_gebruiksdoel_empty():
    nl, en = _translate_gebruiksdoel("")
    assert nl == []
    assert en == []


def test_translate_gebruiksdoel_none():
    nl, en = _translate_gebruiksdoel(None)
    assert nl == []
    assert en == []


def test_all_statuses_have_translations():
    """All known pand statuses must have English translations."""
    expected_statuses = [
        "Pand in gebruik",
        "Pand in gebruik (niet ingemeten)",
        "Pand buiten gebruik",
        "Verbouwing pand",
        "Sloopvergunning verleend",
        "Pand gesloopt",
        "Bouwvergunning verleend",
        "Bouw gestart",
        "Niet gerealiseerd pand",
        "Pand ten onrechte opgevoerd",
    ]
    for status in expected_statuses:
        assert status in STATUS_TRANSLATIONS, f"Missing translation for: {status}"


def test_all_gebruiksdoel_have_translations():
    """All known gebruiksdoel values must have English translations."""
    expected = [
        "woonfunctie",
        "bijeenkomstfunctie",
        "celfunctie",
        "gezondheidszorgfunctie",
        "industriefunctie",
        "kantoorfunctie",
        "logiesfunctie",
        "onderwijsfunctie",
        "sportfunctie",
        "winkelfunctie",
        "overige gebruiksfunctie",
    ]
    for doel in expected:
        assert doel in GEBRUIKSDOEL_TRANSLATIONS, f"Missing translation for: {doel}"


@pytest.mark.asyncio
async def test_get_building_facts(httpx_mock):
    # Mock VBO response
    httpx_mock.add_response(
        url=re.compile(r".*typeName=bag%3Averblijfsobject.*|.*typeName=bag:verblijfsobject.*"),
        json={
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "properties": {
                        "identificatie": "0363010000696734",
                        "oppervlakte": 143,
                        "status": "Verblijfsobject in gebruik",
                        "gebruiksdoel": "winkelfunctie,woonfunctie",
                        "bouwjaar": 1917,
                        "pandidentificatie": "0363100012253924",
                        "pandstatus": "Pand in gebruik",
                    },
                    "geometry": {"type": "Point", "coordinates": [121286.0, 487296.0]},
                }
            ],
        },
    )

    # Mock pand response
    httpx_mock.add_response(
        url=re.compile(r".*typeName=bag%3Apand.*|.*typeName=bag:pand.*"),
        json={
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "properties": {
                        "identificatie": "0363100012253924",
                        "bouwjaar": 1917,
                        "status": "Pand in gebruik",
                        "gebruiksdoel": "winkelfunctie,woonfunctie",
                        "aantal_verblijfsobjecten": 3,
                    },
                    "geometry": {
                        "type": "Polygon",
                        "coordinates": [
                            [[4.892, 52.372], [4.893, 52.372], [4.893, 52.373], [4.892, 52.372]]
                        ],
                    },
                }
            ],
        },
    )

    import app.services.bag as bag_module
    bag_module._client = None

    result = await get_building_facts("0363010000696734")

    assert result is not None
    assert result.pand_id == "0363100012253924"
    assert result.construction_year == 1917
    assert result.status == "Pand in gebruik"
    assert result.status_en == "In use"
    assert result.intended_use == ["winkelfunctie", "woonfunctie"]
    assert result.intended_use_en == ["Retail", "Residential"]
    assert result.num_units == 3
    assert result.floor_area_m2 == 143
    assert result.footprint_geojson is not None
    assert result.footprint_geojson["type"] == "Polygon"

    bag_module._client = None


@pytest.mark.asyncio
async def test_get_building_facts_no_vbo(httpx_mock):
    httpx_mock.add_response(
        url=re.compile(r".*typeName=bag%3Averblijfsobject.*|.*typeName=bag:verblijfsobject.*"),
        json={"type": "FeatureCollection", "features": []},
    )

    import app.services.bag as bag_module
    bag_module._client = None

    result = await get_building_facts("0000000000000000")
    assert result is None

    bag_module._client = None


@pytest.mark.asyncio
async def test_get_building_facts_invalid_id():
    with pytest.raises(ValueError, match="Invalid BAG VBO ID"):
        await get_building_facts("nonexistent")


def test_validate_bag_id_valid():
    _validate_bag_id("0363010000696734")  # should not raise


def test_validate_bag_id_invalid():
    with pytest.raises(ValueError, match="must be 16 digits"):
        _validate_bag_id("short")
    with pytest.raises(ValueError, match="must be 16 digits"):
        _validate_bag_id("abcdefghijklmnop")
