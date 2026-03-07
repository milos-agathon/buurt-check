from app.models.risk import (
    AirQualityRiskCard,
    ClimateStressRiskCard,
    NoiseRiskCard,
    RiskCardsResponse,
    RiskLevel,
    SeverityLevel,
    SunlightRiskCard,
)
from app.services.viewing_questions import build_viewing_questions


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
