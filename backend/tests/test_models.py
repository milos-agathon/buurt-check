from app.models.address import AddressSuggestion, ResolvedAddress
from app.models.building import BuildingFacts, BuildingFactsResponse


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
