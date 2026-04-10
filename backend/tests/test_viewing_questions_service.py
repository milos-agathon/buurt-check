from app.models.risk import (
    AirQualityRiskCard,
    ClimateStressRiskCard,
    NoiseRiskCard,
    RiskCardsResponse,
    RiskLevel,
    SeverityLevel,
    SunlightRiskCard,
)
from app.models.tier_b import CrimeStatsCard, TierBResponse
from app.services.viewing_questions import (
    build_viewing_questions,
    with_crime_viewing_questions,
)


def test_build_viewing_questions_uses_address_context_and_scores():
    risk_cards = RiskCardsResponse(
        address_id="0363010000696734",
        noise=NoiseRiskCard(
            level=RiskLevel.high,
            source="RIVM",
            sampled_at="2026-02-10",
            score=35,
            severity="poor",
        ),
        air_quality=AirQualityRiskCard(
            level=RiskLevel.low,
            pm25_level=RiskLevel.low,
            no2_level=RiskLevel.low,
            source="RIVM",
            sampled_at="2026-02-10",
            score=75,
            severity="good",
        ),
        climate_stress=ClimateStressRiskCard(
            level=RiskLevel.medium,
            heat_level=RiskLevel.medium,
            water_level=RiskLevel.low,
            source="Klimaateffectatlas",
            sampled_at="2026-02-10",
            score=58,
            severity="moderate",
        ),
        sunlight=SunlightRiskCard(
            level=SeverityLevel.moderate,
            winter_hours=1.8,
            source="3DBAG + SunCalc",
            score=49,
            severity="moderate",
        ),
    )

    result = build_viewing_questions(
        "0363010000696734",
        risk_cards,
        street="Kalverstraat",
        city="Amsterdam",
    )

    names = {category.name for category in result.categories}
    assert names == {"Noise", "Air Quality", "Climate Stress", "Sunlight"}

    noise_questions = next(c for c in result.categories if c.name == "Noise").questions
    assert "Kalverstraat" in noise_questions[0].text_en
    assert "Amsterdam" in noise_questions[0].text_en
    assert "35/100" in noise_questions[0].text_en
    assert "Kalverstraat" in noise_questions[0].text_nl
    assert "35/100" in noise_questions[0].text_nl

    # Air quality scores well (75) — gets a single confirmation question
    air_cat = next(c for c in result.categories if c.name == "Air Quality")
    assert air_cat.severity == "good"
    assert len(air_cat.questions) == 1
    assert "scores well" in air_cat.questions[0].text_en
    assert "scoort goed" in air_cat.questions[0].text_nl
    assert "(score " not in noise_questions[0].text_en
    assert "(score " not in noise_questions[0].text_nl


def test_build_viewing_questions_includes_raw_signals_when_available():
    risk_cards = RiskCardsResponse(
        address_id="0363010000696734",
        noise=NoiseRiskCard(
            level=RiskLevel.medium,
            source="RIVM",
            sampled_at="2026-02-10",
            score=56,
            severity="moderate",
            lden_db=58.3,
        ),
        air_quality=AirQualityRiskCard(
            level=RiskLevel.medium,
            pm25_level=RiskLevel.medium,
            no2_level=RiskLevel.medium,
            source="RIVM",
            sampled_at="2026-02-10",
            score=52,
            severity="moderate",
            pm25_ug_m3=9.1,
            no2_ug_m3=20.4,
        ),
        climate_stress=ClimateStressRiskCard(
            level=RiskLevel.medium,
            heat_level=RiskLevel.medium,
            water_level=RiskLevel.low,
            source="Klimaateffectatlas",
            sampled_at="2026-02-10",
            score=58,
            severity="moderate",
        ),
        sunlight=SunlightRiskCard(
            level=SeverityLevel.moderate,
            winter_hours=2.4,
            source="3DBAG + SunCalc",
            score=40,
            severity="moderate",
        ),
    )

    result = build_viewing_questions(
        "0363010000696734",
        risk_cards,
        street="Ceintuurbaan",
        city="Amsterdam",
    )
    by_name = {category.name: category for category in result.categories}

    assert "58.3 dB Lden" in by_name["Noise"].questions[0].text_en
    assert "PM2.5 9.1" in by_name["Air Quality"].questions[0].text_en
    assert "NO2 20.4" in by_name["Air Quality"].questions[0].text_en
    assert "heat: medium" in by_name["Climate Stress"].questions[0].text_en
    assert "water: low" in by_name["Climate Stress"].questions[0].text_en
    assert "2.4h/day" in by_name["Sunlight"].questions[0].text_en


def test_build_viewing_questions_omits_unavailable_climate_levels_and_derives_severity():
    risk_cards = RiskCardsResponse(
        address_id="0363010000696734",
        noise=NoiseRiskCard(
            level=RiskLevel.high,
            source="RIVM",
            sampled_at="2026-02-10",
            score=18,
            severity=None,
        ),
        air_quality=AirQualityRiskCard(
            level=RiskLevel.high,
            pm25_level=RiskLevel.high,
            no2_level=RiskLevel.high,
            source="RIVM",
            sampled_at="2026-02-10",
            score=28,
            severity=None,
        ),
        climate_stress=ClimateStressRiskCard(
            level=RiskLevel.medium,
            heat_level=RiskLevel.unavailable,
            water_level=RiskLevel.unavailable,
            source="Klimaateffectatlas",
            sampled_at="2026-02-10",
            score=55,
            severity=None,
        ),
        sunlight=SunlightRiskCard(
            level=SeverityLevel.good,
            source="3DBAG + SunCalc",
            score=75,
            severity=None,
        ),
    )

    result = build_viewing_questions("0363010000696734", risk_cards)
    by_name = {category.name: category for category in result.categories}

    assert by_name["Noise"].severity == "critical"
    assert by_name["Air Quality"].severity == "poor"
    assert by_name["Climate Stress"].severity == "moderate"
    assert by_name["Sunlight"].severity == "good"
    assert "unavailable" not in by_name["Climate Stress"].questions[0].text_en.lower()
    assert "unavailable" not in by_name["Climate Stress"].questions[0].text_nl.lower()


def test_build_viewing_questions_adds_data_caveat_for_partial_cards():
    risk_cards = RiskCardsResponse(
        address_id="0363010000696734",
        noise=NoiseRiskCard(level=RiskLevel.low, source="RIVM", sampled_at="2026-02-10", score=75),
        air_quality=AirQualityRiskCard(
            level=RiskLevel.low,
            pm25_level=RiskLevel.low,
            no2_level=RiskLevel.unavailable,
            source="RIVM",
            sampled_at="2026-02-10",
            score=74,
            severity="good",
            warnings=["AIR_PARTIAL"],
        ),
        climate_stress=ClimateStressRiskCard(
            level=RiskLevel.medium,
            heat_level=RiskLevel.medium,
            water_level=RiskLevel.unavailable,
            source="Klimaateffectatlas",
            sampled_at="2026-02-10",
            score=52,
            severity="moderate",
            warnings=["CLIMATE_PARTIAL"],
        ),
    )

    result = build_viewing_questions("0363010000696734", risk_cards)
    by_name = {category.name: category for category in result.categories}

    assert by_name["Air Quality"].questions[0].text_en.startswith(
        "Because this metric uses partial or unavailable source data, verify on site: "
    )
    assert by_name["Climate Stress"].questions[0].text_en.startswith(
        "Because this metric uses partial or unavailable source data, verify on site: "
    )


def test_build_viewing_questions_uses_proxy_wording_for_sunlight():
    risk_cards = RiskCardsResponse(
        address_id="0363010000696734",
        noise=NoiseRiskCard(level=RiskLevel.low, source="RIVM", sampled_at="2026-02-10", score=75),
        air_quality=AirQualityRiskCard(
            level=RiskLevel.low,
            pm25_level=RiskLevel.low,
            no2_level=RiskLevel.low,
            source="RIVM",
            sampled_at="2026-02-10",
            score=75,
        ),
        climate_stress=ClimateStressRiskCard(
            level=RiskLevel.low,
            heat_level=RiskLevel.low,
            water_level=RiskLevel.low,
            source="Klimaateffectatlas",
            sampled_at="2026-02-10",
            score=75,
        ),
        sunlight=SunlightRiskCard(
            level=SeverityLevel.moderate,
            winter_hours=2.1,
            source="3DBAG + SunCalc",
            score=45,
            severity="moderate",
        ),
    )

    result = build_viewing_questions(
        "0363010000696734",
        risk_cards,
        street="Kalverstraat",
        city="Amsterdam",
    )

    sunlight_questions = next(c for c in result.categories if c.name == "Sunlight").questions
    assert "roof/facade proxy sunlight signal" in sunlight_questions[0].text_en
    assert "main rooms" in sunlight_questions[0].text_en
    assert "living room daylight was measured" not in sunlight_questions[0].text_en


def test_with_crime_viewing_questions_adds_crime_category_when_entitled():
    risk_cards = RiskCardsResponse(
        address_id="0363010000696734",
        noise=NoiseRiskCard(level=RiskLevel.low, source="RIVM", sampled_at="2026-02-10", score=75),
        air_quality=AirQualityRiskCard(
            level=RiskLevel.low,
            pm25_level=RiskLevel.low,
            no2_level=RiskLevel.low,
            source="RIVM",
            sampled_at="2026-02-10",
            score=75,
        ),
        climate_stress=ClimateStressRiskCard(
            level=RiskLevel.low,
            heat_level=RiskLevel.low,
            water_level=RiskLevel.low,
            source="Klimaateffectatlas",
            sampled_at="2026-02-10",
            score=75,
        ),
    )
    base = build_viewing_questions("0363010000696734", risk_cards)

    enriched = with_crime_viewing_questions(
        base,
        TierBResponse(
            address_id="0363010000696734",
            crime=CrimeStatsCard(
                source="CBS",
                score=24,
                severity="poor",
                total_per_1000=18.3,
            ),
        ),
    )

    assert enriched is not None
    assert {category.name for category in enriched.categories} == {
        "Noise",
        "Air Quality",
        "Climate Stress",
        "Crime",
    }
    crime_category = next(category for category in enriched.categories if category.name == "Crime")
    assert crime_category.severity == "poor"
    assert "18.3 per 1,000 residents" in crime_category.questions[0].text_en
