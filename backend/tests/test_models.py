from app.models.address import AddressSuggestion, ResolvedAddress
from app.models.building import BuildingFacts, BuildingFactsResponse
from app.models.neighborhood3d import BuildingBlock, Neighborhood3DCenter, Neighborhood3DResponse
from app.models.risk import (
    AirQualityRiskCard,
    ClimateStressRiskCard,
    NoiseRiskCard,
    RiskCardsResponse,
    RiskLevel,
)


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


def test_noise_risk_card():
    card = NoiseRiskCard(
        level=RiskLevel.medium,
        lden_db=61.2,
        source="RIVM / Atlas Leefomgeving WMS",
        source_date="2019-11-12",
        sampled_at="2026-02-05",
        layer="rivm_20191112_g_geluidkaart_lden_wegverkeer",
    )
    assert card.level == RiskLevel.medium
    assert card.lden_db == 61.2


def test_air_quality_risk_card():
    card = AirQualityRiskCard(
        level=RiskLevel.high,
        pm25_ug_m3=11.2,
        no2_ug_m3=26.8,
        pm25_level=RiskLevel.high,
        no2_level=RiskLevel.high,
        source="RIVM GCN WMS",
        source_date="2024",
        sampled_at="2026-02-05",
        pm25_layer="conc_PM25_2024",
        no2_layer="conc_NO2_2024",
    )
    assert card.level == RiskLevel.high
    assert card.pm25_level == RiskLevel.high
    assert card.no2_level == RiskLevel.high


def test_climate_stress_risk_card():
    card = ClimateStressRiskCard(
        level=RiskLevel.medium,
        heat_value=0.71,
        heat_level=RiskLevel.medium,
        water_value=2.0,
        water_level=RiskLevel.medium,
        source="Klimaateffectatlas WMS/WFS",
        source_date="2026-02-05",
        sampled_at="2026-02-05",
        heat_layer="wpn:s0149_hittestress_warme_nachten_huidig",
        water_layer="etten:gr1_t100",
    )
    assert card.level == RiskLevel.medium
    assert card.heat_level == RiskLevel.medium
    assert card.water_level == RiskLevel.medium


def test_risk_cards_response():
    resp = RiskCardsResponse(
        address_id="0363010000696734",
        noise=NoiseRiskCard(
            level=RiskLevel.low,
            lden_db=49.3,
            source="RIVM / Atlas Leefomgeving WMS",
            sampled_at="2026-02-05",
        ),
        air_quality=AirQualityRiskCard(
            level=RiskLevel.medium,
            pm25_ug_m3=8.6,
            no2_ug_m3=17.5,
            pm25_level=RiskLevel.medium,
            no2_level=RiskLevel.medium,
            source="RIVM GCN WMS",
            sampled_at="2026-02-05",
        ),
        climate_stress=ClimateStressRiskCard(
            level=RiskLevel.unavailable,
            source="Klimaateffectatlas WMS/WFS",
            sampled_at="2026-02-05",
        ),
    )
    assert resp.address_id == "0363010000696734"
    assert resp.noise.level == RiskLevel.low
    assert resp.air_quality.level == RiskLevel.medium
    assert resp.climate_stress.level == RiskLevel.unavailable
