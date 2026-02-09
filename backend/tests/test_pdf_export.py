"""Tests for PDF export service and endpoint."""

from unittest.mock import AsyncMock, patch

import pytest

from app.models.building import BuildingFacts, BuildingFactsResponse
from app.models.risk import (
    AirQualityRiskCard,
    ClimateStressRiskCard,
    NoiseRiskCard,
    QuestionCategory,
    RiskCardsResponse,
    RiskLevel,
    SunlightRiskCard,
    ViewingQuestion,
    ViewingQuestionsResponse,
)
from app.services.pdf_export import generate_quick_brief

# --- Unit tests for generate_quick_brief ---


def _make_risks(
    noise_score=65,
    air_score=72,
    climate_score=45,
    sunlight_score=80,
) -> RiskCardsResponse:
    return RiskCardsResponse(
        address_id="0363010012345678",
        noise=NoiseRiskCard(
            level=RiskLevel.medium,
            lden_db=58.0,
            source="RIVM",
            sampled_at="2026-01-01",
            score=noise_score,
            severity="moderate",
            summary="Moderate traffic noise",
            summary_nl="Matig verkeerslawaai",
        ),
        air_quality=AirQualityRiskCard(
            level=RiskLevel.low,
            no2_ug_m3=18.0,
            source="RIVM GCN",
            sampled_at="2026-01-01",
            score=air_score,
            severity="good",
            summary="Good air quality",
            summary_nl="Goede luchtkwaliteit",
        ),
        climate_stress=ClimateStressRiskCard(
            level=RiskLevel.medium,
            source="Klimaateffectatlas",
            sampled_at="2026-01-01",
            score=climate_score,
            severity="moderate",
            summary="Some flood risk",
            summary_nl="Enig overstromingsrisico",
        ),
        sunlight=SunlightRiskCard(
            level=RiskLevel.low,
            winter_hours=5.0,
            source="SunCalc + 3DBAG",
            score=sunlight_score,
            severity="good",
            summary="Good sunlight",
            summary_nl="Goed zonlicht",
        ),
    )


def _make_viewing_questions() -> ViewingQuestionsResponse:
    return ViewingQuestionsResponse(
        address_id="0363010012345678",
        categories=[
            QuestionCategory(
                name="Noise",
                name_nl="Geluid",
                severity="moderate",
                questions=[
                    ViewingQuestion(
                        text_en="Can you hear traffic?",
                        text_nl="Hoort u verkeer?",
                    ),
                    ViewingQuestion(
                        text_en="Check window glazing type.",
                        text_nl="Controleer het type beglazing.",
                    ),
                ],
            ),
        ],
    )


def test_generate_quick_brief_returns_pdf_bytes():
    result = generate_quick_brief(
        address="Kalverstraat 1, 1012 Amsterdam",
        building_year=1920,
        building_use="Residential",
        risks=_make_risks(),
        sunlight_score=80,
        viewing_questions=_make_viewing_questions(),
        language="en",
    )
    assert isinstance(result, bytes)
    assert len(result) > 100
    # PDF magic bytes
    assert result[:5] == b"%PDF-"


def test_generate_quick_brief_dutch():
    result = generate_quick_brief(
        address="Kalverstraat 1, 1012 Amsterdam",
        building_year=1920,
        building_use="Woonfunctie",
        risks=_make_risks(),
        sunlight_score=80,
        viewing_questions=_make_viewing_questions(),
        language="nl",
    )
    assert isinstance(result, bytes)
    assert result[:5] == b"%PDF-"


def test_generate_quick_brief_no_risks():
    result = generate_quick_brief(
        address="Somestraat 42",
        building_year=None,
        building_use=None,
        risks=None,
        sunlight_score=None,
        viewing_questions=None,
        language="en",
    )
    assert isinstance(result, bytes)
    assert result[:5] == b"%PDF-"


def test_generate_quick_brief_no_viewing_questions():
    result = generate_quick_brief(
        address="Prinsengracht 263",
        building_year=1635,
        building_use="Residential",
        risks=_make_risks(),
        sunlight_score=80,
        viewing_questions=None,
        language="en",
    )
    assert isinstance(result, bytes)
    assert result[:5] == b"%PDF-"


def test_generate_quick_brief_with_shadow_image():
    # A minimal valid PNG: 1x1 white pixel
    import base64

    # Create a tiny valid base64 string (not a real image, but tests the code path)
    fake_b64 = base64.b64encode(b"\x89PNG\r\n\x1a\n" + b"\x00" * 100).decode()
    # This will hit the except branch since it's not a valid PNG, but shouldn't crash
    result = generate_quick_brief(
        address="Test 1",
        building_year=2000,
        building_use=None,
        risks=None,
        sunlight_score=None,
        viewing_questions=None,
        shadow_image_b64=fake_b64,
        language="en",
    )
    assert isinstance(result, bytes)
    assert result[:5] == b"%PDF-"


def test_generate_quick_brief_none_scores():
    """Scores that are None should show '-' and 'N/A' in the table."""
    risks = _make_risks(noise_score=None, air_score=None, climate_score=None)
    result = generate_quick_brief(
        address="Test",
        building_year=None,
        building_use=None,
        risks=risks,
        sunlight_score=None,
        viewing_questions=None,
        language="en",
    )
    assert isinstance(result, bytes)
    assert result[:5] == b"%PDF-"


def test_severity_labels():
    from app.services.pdf_export import _severity_label, _severity_label_nl

    assert _severity_label(None) == "N/A"
    assert _severity_label(80) == "Good"
    assert _severity_label(50) == "Moderate"
    assert _severity_label(25) == "Poor"
    assert _severity_label(10) == "Critical"

    assert _severity_label_nl(None) == "N.v.t."
    assert _severity_label_nl(80) == "Goed"
    assert _severity_label_nl(50) == "Matig"
    assert _severity_label_nl(25) == "Slecht"
    assert _severity_label_nl(10) == "Kritiek"


# --- API endpoint tests ---


@pytest.mark.asyncio
@patch("app.api.address.cache_get", new_callable=AsyncMock)
@patch("app.api.address.cache_set", new_callable=AsyncMock)
@patch("app.api.address.bag")
@patch("app.api.address.risk_cards")
async def test_export_endpoint_returns_pdf(
    mock_risk_cards, mock_bag, mock_cache_set, mock_cache_get, client
):
    """Export endpoint returns a valid PDF with application/pdf content type."""
    mock_cache_get.return_value = None
    mock_bag.get_building_facts = AsyncMock(
        return_value=BuildingFacts(
            pand_id="0363100012345678",
            construction_year=1920,
            intended_use_en=["Residential"],
        )
    )
    mock_risk_cards.get_risk_cards = AsyncMock(return_value=_make_risks())

    resp = await client.get(
        "/api/address/0363010012345678/export",
        params={
            "rd_x": 121000,
            "rd_y": 487000,
            "lat": 52.37,
            "lng": 4.89,
            "address": "Kalverstraat 1, Amsterdam",
        },
    )
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/pdf"
    assert resp.content[:5] == b"%PDF-"
    assert "content-disposition" in resp.headers
    assert "buurt-check-0363010012345678.pdf" in resp.headers["content-disposition"]


@pytest.mark.asyncio
@patch("app.api.address.cache_get", new_callable=AsyncMock)
@patch("app.api.address.cache_set", new_callable=AsyncMock)
@patch("app.api.address.bag")
@patch("app.api.address.risk_cards")
async def test_export_endpoint_uses_cached_data(
    mock_risk_cards, mock_bag, mock_cache_set, mock_cache_get, client
):
    """Export endpoint uses cached building and risk data when available."""
    building_cached = BuildingFactsResponse(
        address_id="0363010012345678",
        building=BuildingFacts(
            pand_id="0363100012345678",
            construction_year=1950,
            intended_use_en=["Office"],
        ),
    ).model_dump()

    risks_cached = _make_risks().model_dump()

    async def side_effect(key):
        if key.startswith("building:"):
            return building_cached
        if key.startswith("risks:"):
            return risks_cached
        return None

    mock_cache_get.side_effect = side_effect

    resp = await client.get(
        "/api/address/0363010012345678/export",
        params={
            "rd_x": 121000,
            "rd_y": 487000,
            "lat": 52.37,
            "lng": 4.89,
            "address": "Keizersgracht 100",
        },
    )
    assert resp.status_code == 200
    assert resp.content[:5] == b"%PDF-"
    # Should not have called the external services
    mock_bag.get_building_facts.assert_not_called()
    mock_risk_cards.get_risk_cards.assert_not_called()


@pytest.mark.asyncio
async def test_export_endpoint_invalid_template(client):
    resp = await client.get(
        "/api/address/0363010012345678/export",
        params={
            "rd_x": 121000,
            "rd_y": 487000,
            "lat": 52.37,
            "lng": 4.89,
            "address": "Test",
            "template": "full_dossier",
        },
    )
    assert resp.status_code == 422
    assert "quick_brief" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_export_endpoint_invalid_language(client):
    resp = await client.get(
        "/api/address/0363010012345678/export",
        params={
            "rd_x": 121000,
            "rd_y": 487000,
            "lat": 52.37,
            "lng": 4.89,
            "address": "Test",
            "language": "fr",
        },
    )
    assert resp.status_code == 422
    assert "en" in resp.json()["detail"] or "nl" in resp.json()["detail"]


@pytest.mark.asyncio
@patch("app.api.address.cache_get", new_callable=AsyncMock, return_value=None)
@patch("app.api.address.cache_set", new_callable=AsyncMock)
@patch("app.api.address.bag")
@patch("app.api.address.risk_cards")
async def test_export_endpoint_graceful_on_failures(
    mock_risk_cards, mock_bag, mock_cache_set, mock_cache_get, client
):
    """Export endpoint returns a PDF even when external services fail."""
    mock_bag.get_building_facts = AsyncMock(side_effect=Exception("BAG down"))
    mock_risk_cards.get_risk_cards = AsyncMock(side_effect=Exception("RIVM down"))

    resp = await client.get(
        "/api/address/0363010012345678/export",
        params={
            "rd_x": 121000,
            "rd_y": 487000,
            "lat": 52.37,
            "lng": 4.89,
            "address": "Somestraat 1",
        },
    )
    # Should still return a PDF (with missing data), not crash
    assert resp.status_code == 200
    assert resp.content[:5] == b"%PDF-"


@pytest.mark.asyncio
async def test_export_endpoint_invalid_vbo_id(client):
    resp = await client.get(
        "/api/address/invalid-id/export",
        params={
            "rd_x": 121000,
            "rd_y": 487000,
            "lat": 52.37,
            "lng": 4.89,
            "address": "Test",
        },
    )
    assert resp.status_code == 422
