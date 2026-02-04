from app.models.address import AddressSuggestion, ResolvedAddress
from app.models.building import BuildingFacts, BuildingFactsResponse
from app.models.neighborhood3d import BuildingBlock, Neighborhood3DCenter, Neighborhood3DResponse


def test_address_suggestion_minimal():
    s = AddressSuggestion(id="abc", display_name="Test", type="adres", score=1.0)
    assert s.id == "abc"
    assert s.display_name == "Test"


def test_resolved_address_minimal():
    addr = ResolvedAddress(id="abc", display_name="Test 1, Amsterdam")
    assert addr.id == "abc"
    assert addr.latitude is None
    assert addr.postcode is None


def test_resolved_address_full():
    addr = ResolvedAddress(
        id="adr-123",
        nummeraanduiding_id="0363200000158443",
        adresseerbaar_object_id="0363010000696734",
        display_name="Kalverstraat 1, 1012NX Amsterdam",
        street="Kalverstraat",
        house_number="1",
        postcode="1012NX",
        city="Amsterdam",
        municipality="Amsterdam",
        province="Noord-Holland",
        latitude=52.37250408,
        longitude=4.89214036,
        rd_x=121286.0,
        rd_y=487296.0,
        buurt_code="BU0363AD07",
        wijk_code="WK0363AD",
    )
    assert addr.street == "Kalverstraat"
    assert addr.latitude == 52.37250408


def test_building_facts_minimal():
    bf = BuildingFacts(pand_id="0363100012253924")
    assert bf.pand_id == "0363100012253924"
    assert bf.intended_use == []
    assert bf.footprint_geojson is None


def test_building_facts_full():
    bf = BuildingFacts(
        pand_id="0363100012253924",
        construction_year=1917,
        status="Pand in gebruik",
        status_en="In use",
        intended_use=["winkelfunctie", "woonfunctie"],
        intended_use_en=["Retail", "Residential"],
        num_units=5,
        floor_area_m2=143,
        footprint_geojson={"type": "Polygon", "coordinates": [[[4.89, 52.37]]]},
        document_date="2024-01-15",
    )
    assert bf.construction_year == 1917
    assert len(bf.intended_use) == 2
    assert bf.footprint_geojson["type"] == "Polygon"


def test_building_facts_response_with_no_building():
    resp = BuildingFactsResponse(
        address_id="0363010000696734",
        building=None,
        message="No building found",
    )
    assert resp.building is None
    assert resp.message == "No building found"


def test_building_facts_response_with_building():
    resp = BuildingFactsResponse(
        address_id="0363010000696734",
        building=BuildingFacts(pand_id="0363100012253924", construction_year=1917),
    )
    assert resp.building is not None
    assert resp.building.construction_year == 1917


def test_building_block():
    b = BuildingBlock(
        pand_id="0363100012253924",
        ground_height=1.75,
        building_height=16.43,
        footprint=[[0.0, 0.0], [5.2, 0.0], [5.2, 4.8], [0.0, 4.8]],
        year=1917,
    )
    assert b.pand_id == "0363100012253924"
    assert b.building_height == 16.43
    assert len(b.footprint) == 4
    assert b.year == 1917


def test_building_block_no_year():
    b = BuildingBlock(
        pand_id="0363100012253924",
        ground_height=0.0,
        building_height=10.0,
        footprint=[[0.0, 0.0], [1.0, 0.0], [1.0, 1.0]],
    )
    assert b.year is None


def test_neighborhood_3d_response():
    resp = Neighborhood3DResponse(
        address_id="0363010000696734",
        target_pand_id="0363100012253924",
        center=Neighborhood3DCenter(lat=52.372, lng=4.892, rd_x=121286.0, rd_y=487296.0),
        buildings=[
            BuildingBlock(
                pand_id="0363100012253924",
                ground_height=1.75,
                building_height=16.43,
                footprint=[[0.0, 0.0], [5.0, 0.0], [5.0, 5.0], [0.0, 5.0]],
                year=1917,
            )
        ],
    )
    assert resp.target_pand_id == "0363100012253924"
    assert len(resp.buildings) == 1
    assert resp.center.lat == 52.372
    assert resp.message is None
