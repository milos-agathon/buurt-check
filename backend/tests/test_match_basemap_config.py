import pytest


@pytest.mark.anyio
async def test_results_basemap_config_uses_pdok_brt_wmts(client):
    response = await client.get("/api/match/results-basemap")

    assert response.status_code == 200
    payload = response.json()
    assert payload["source_id"] == "pdok_brt_achtergrondkaart"
    assert payload["service_type"] == "wmts_raster"
    assert payload["theme"] == "standaard"
    assert payload["tile_matrix_set"] == "EPSG:3857"
    assert payload["tile_url_template"].startswith(
        "https://service.pdok.nl/brt/achtergrondkaart/wmts/v2_0/standaard/EPSG:3857/"
    )
    assert "{z}/{x}/{y}.png" in payload["tile_url_template"]
    assert payload["attribution"] == "PDOK / Kadaster / BRT Achtergrondkaart (standaard WMTS)"


@pytest.mark.anyio
async def test_results_basemap_config_rejects_non_pdok_primary_sources(client):
    response = await client.get("/api/match/results-basemap")

    assert response.status_code == 200
    payload = response.json()
    serialized = " ".join(str(value).lower() for value in payload.values())
    assert "openstreetmap" not in serialized
    assert "tile.openstreetmap.org" not in serialized
    assert "mapbox" not in serialized
    assert "google" not in serialized
