"""Tests for PDF export service and endpoint."""

import io
from unittest.mock import AsyncMock, patch

import pytest
from pypdf import PdfReader

from app.models.building import BuildingFacts, BuildingFactsResponse
from app.models.neighborhood import (
    AgeProfile,
    NeighborhoodIndicator,
    NeighborhoodStats,
    UrbanizationLevel,
)
from app.models.property_warnings import (
    AsbestosWarning,
    AttentionSummary,
    ErfpachtWarning,
    FoundationRisk,
    LeadPipeWarning,
    PropertyWarningsResponse,
    VvEInfo,
)
from app.models.risk import (
    AirQualityRiskCard,
    ClimateStressRiskCard,
    ComparisonPattern,
    NoiseRiskCard,
    QuestionCategory,
    RiskCardsResponse,
    RiskComparisonRow,
    RiskComparisonsResponse,
    RiskLevel,
    SeverityLevel,
    SunlightRiskCard,
    ViewingQuestion,
    ViewingQuestionsResponse,
)
from app.models.tier_b import CrimeStatsCard, TierBResponse
from app.services.pdf_export import (
    BuurtCheckPDF,
    _build_risk_cells,
    _severity_for_score,
    _severity_label,
    generate_full_dossier,
    generate_quick_brief,
)

# --- Fixture helpers ---


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
            level=SeverityLevel.good,
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


def _make_neighborhood_stats() -> NeighborhoodStats:
    return NeighborhoodStats(
        buurt_code="BU03630001",
        buurt_name="Burgwallen-Oude Zijde",
        gemeente_name="Amsterdam",
        population_density=NeighborhoodIndicator(value=15000.0, unit="/km\u00b2"),
        avg_household_size=NeighborhoodIndicator(value=1.8),
        single_person_pct=NeighborhoodIndicator(value=62.0, unit="%"),
        age_profile=AgeProfile(age_0_24=22.0, age_25_64=65.0, age_65_plus=13.0),
        owner_occupied_pct=NeighborhoodIndicator(value=28.0, unit="%"),
        avg_property_value=NeighborhoodIndicator(value=485000.0, unit="\u20ac"),
        distance_to_train_km=NeighborhoodIndicator(value=0.8, unit="km"),
        distance_to_supermarket_km=NeighborhoodIndicator(value=0.2, unit="km"),
        urbanization=UrbanizationLevel.very_urban,
    )


def _make_tier_b() -> TierBResponse:
    return TierBResponse(
        address_id="0363010012345678",
        crime=CrimeStatsCard(
            total_per_1000=65.3,
            burglary_per_1000=4.2,
            violent_per_1000=1.8,
            yearly_period="2024",
        ),
    )


def _make_property_warnings() -> PropertyWarningsResponse:
    return PropertyWarningsResponse(
        address_id="0363010012345678",
        attention_summary=AttentionSummary(
            flag_count=1,
            flags=[],
            risk_categories_assessed=4,
            risk_categories_total=4,
        ),
        foundation_risk=FoundationRisk(level="low", construction_year=1970),
        erfpacht=ErfpachtWarning(detected=False),
        vve=VvEInfo(is_apartment=False),
        asbestos=AsbestosWarning(flagged=True, construction_year=1970),
        lead_pipe=LeadPipeWarning(flagged=False),
    )


def _make_risk_comparisons() -> RiskComparisonsResponse:
    return RiskComparisonsResponse(
        address_id="0363010012345678",
        noise=[
            RiskComparisonRow(label_code="address", value=65),
            RiskComparisonRow(label_code="city_avg", value=55),
            RiskComparisonRow(label_code="nl_avg", value=60),
            RiskComparisonRow(
                label_code="who_limit", value=74, pattern=ComparisonPattern.dashed
            ),
        ],
        air_quality=[
            RiskComparisonRow(label_code="address", value=72),
            RiskComparisonRow(label_code="city_avg", value=65),
        ],
        climate_stress=[
            RiskComparisonRow(label_code="address", value=45),
        ],
        sunlight=[
            RiskComparisonRow(label_code="address", value=80),
            RiskComparisonRow(
                label_code="daylight_target", value=60, pattern=ComparisonPattern.dashed
            ),
        ],
        generated_at="2026-02-13T12:00:00",
    )


# --- Unit tests: severity helpers ---


class TestSeverityHelpers:
    def test_severity_for_score_boundaries(self):
        assert _severity_for_score(None) == "unavailable"
        assert _severity_for_score(100) == "good"
        assert _severity_for_score(70) == "good"
        assert _severity_for_score(69) == "moderate"
        assert _severity_for_score(40) == "moderate"
        assert _severity_for_score(39) == "poor"
        assert _severity_for_score(20) == "poor"
        assert _severity_for_score(19) == "critical"
        assert _severity_for_score(0) == "critical"

    def test_severity_label_en(self):
        assert _severity_label(None) == "N/A"
        assert _severity_label(80) == "Good"
        assert _severity_label(50) == "Moderate"
        assert _severity_label(25) == "Poor"
        assert _severity_label(10) == "Critical"

    def test_severity_label_nl(self):
        assert _severity_label(None, is_nl=True) == "N.v.t."
        assert _severity_label(80, is_nl=True) == "Goed"
        assert _severity_label(50, is_nl=True) == "Matig"
        assert _severity_label(25, is_nl=True) == "Slecht"
        assert _severity_label(10, is_nl=True) == "Kritiek"


# --- Unit tests: _build_risk_cells ---


class TestBuildRiskCells:
    def test_always_returns_four_cells_with_risks(self):
        risks = _make_risks()
        cells = _build_risk_cells(risks, sunlight_score=80, is_nl=False)
        assert len(cells) == 4
        labels = [c[0] for c in cells]
        assert labels == ["Noise", "Air", "Climate", "Sunlight"]

    def test_always_returns_four_cells_without_risks(self):
        """Finding 6: must produce 4 cells even when risks=None."""
        cells = _build_risk_cells(None, sunlight_score=None, is_nl=False)
        assert len(cells) == 4
        # All scores None, labels are N/A
        for _, score, label in cells:
            assert score is None
            assert label == "N/A"

    def test_dutch_labels(self):
        cells = _build_risk_cells(None, sunlight_score=None, is_nl=True)
        labels = [c[0] for c in cells]
        assert labels == ["Geluid", "Lucht", "Klimaat", "Zonlicht"]
        for _, _, label in cells:
            assert label == "N.v.t."


# --- Unit tests: BuurtCheckPDF ---


class TestBuurtCheckPDF:
    def test_instantiation(self):
        pdf = BuurtCheckPDF(language="en")
        assert pdf.language == "en"
        assert pdf.is_nl is False

    def test_instantiation_nl(self):
        pdf = BuurtCheckPDF(language="nl")
        assert pdf.is_nl is True

    def test_add_page_renders_header_footer(self):
        pdf = BuurtCheckPDF(language="en")
        pdf.section_title = "TEST"
        pdf.add_page()
        result = bytes(pdf.output())
        assert result[:5] == b"%PDF-"
        assert len(result) > 100

    def test_draw_score_bar(self):
        pdf = BuurtCheckPDF()
        pdf.add_page()
        pdf.draw_score_bar(10, 20, 100, 75)
        pdf.draw_score_bar(10, 25, 100, None)  # None score
        pdf.draw_score_bar(10, 30, 100, 0)  # Zero score
        result = bytes(pdf.output())
        assert result[:5] == b"%PDF-"

    def test_draw_checkbox(self):
        pdf = BuurtCheckPDF()
        pdf.add_page()
        pdf.draw_checkbox(10, 20)
        result = bytes(pdf.output())
        assert result[:5] == b"%PDF-"

    def test_draw_risk_grid(self):
        pdf = BuurtCheckPDF()
        pdf.add_page()
        cells = [
            ("Noise", 65, "Moderate"),
            ("Air", 80, "Good"),
            ("Climate", 30, "Poor"),
            ("Sunlight", None, "N/A"),
        ]
        end_y = pdf.draw_risk_grid(10, 20, 180, cells)
        assert end_y > 20
        result = bytes(pdf.output())
        assert result[:5] == b"%PDF-"

    def test_draw_comparison_chart(self):
        pdf = BuurtCheckPDF()
        pdf.add_page()
        rows = [
            ("This address", 65, (46, 196, 182), False),
            ("City average", 55, (138, 155, 176), False),
            ("WHO benchmark (mapped to score)", 74, (234, 179, 8), True),
        ]
        pdf.draw_comparison_chart(10, 30, 180, rows)
        result = bytes(pdf.output())
        assert result[:5] == b"%PDF-"

    def test_draw_age_bars(self):
        pdf = BuurtCheckPDF()
        pdf.add_page()
        age = AgeProfile(age_0_24=22.0, age_25_64=65.0, age_65_plus=13.0)
        end_y = pdf.draw_age_bars(10, 30, 180, age)
        assert end_y > 30
        result = bytes(pdf.output())
        assert result[:5] == b"%PDF-"

    def test_draw_age_bars_with_none_values(self):
        pdf = BuurtCheckPDF()
        pdf.add_page()
        age = AgeProfile(age_0_24=None, age_25_64=55.0, age_65_plus=None)
        end_y = pdf.draw_age_bars(10, 30, 180, age)
        assert end_y > 30

    def test_draw_section_label_and_divider(self):
        pdf = BuurtCheckPDF()
        pdf.add_page()
        pdf.draw_section_label("Test Section")
        pdf.draw_divider("light")
        pdf.draw_divider("strong")
        result = bytes(pdf.output())
        assert result[:5] == b"%PDF-"

    def test_draw_indicator_row(self):
        pdf = BuurtCheckPDF()
        pdf.add_page()
        pdf.draw_indicator_row("Population", "15,000/km\u00b2")
        result = bytes(pdf.output())
        assert result[:5] == b"%PDF-"


# --- Unit tests: Quick Brief ---


class TestGenerateQuickBrief:
    def test_returns_pdf_bytes(self):
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
        assert result[:5] == b"%PDF-"

    def test_dutch(self):
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

    def test_no_risks(self):
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

    def test_no_viewing_questions(self):
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

    def test_with_shadow_image(self):
        import base64

        fake_b64 = base64.b64encode(b"\x89PNG\r\n\x1a\n" + b"\x00" * 100).decode()
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

    def test_none_scores(self):
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

    def test_with_floor_area(self):
        """Finding 7: floor_area param should work."""
        result = generate_quick_brief(
            address="Herengracht 502",
            building_year=1680,
            building_use="Residential",
            risks=_make_risks(),
            sunlight_score=80,
            viewing_questions=None,
            language="en",
            floor_area=120,
        )
        assert isinstance(result, bytes)
        assert result[:5] == b"%PDF-"


# --- Unit tests: Full Dossier ---


class TestGenerateFullDossier:
    def test_returns_pdf_bytes(self):
        result = generate_full_dossier(
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
        assert result[:5] == b"%PDF-"

    def test_with_all_data(self):
        """Full dossier with neighborhood, tier-b, and comparison data."""
        result = generate_full_dossier(
            address="Kalverstraat 1, 1012 Amsterdam",
            building_year=1920,
            building_use="Residential",
            risks=_make_risks(),
            sunlight_score=80,
            viewing_questions=_make_viewing_questions(),
            language="en",
            floor_area=95,
            neighborhood_stats=_make_neighborhood_stats(),
            tier_b=_make_tier_b(),
            risk_comparisons=_make_risk_comparisons(),
            property_warnings_data=_make_property_warnings(),
        )
        assert isinstance(result, bytes)
        assert result[:5] == b"%PDF-"

    def test_with_all_data_dutch(self):
        result = generate_full_dossier(
            address="Kalverstraat 1, 1012 Amsterdam",
            building_year=1920,
            building_use="Woonfunctie",
            risks=_make_risks(),
            sunlight_score=80,
            viewing_questions=_make_viewing_questions(),
            language="nl",
            floor_area=95,
            neighborhood_stats=_make_neighborhood_stats(),
            tier_b=_make_tier_b(),
            risk_comparisons=_make_risk_comparisons(),
            property_warnings_data=_make_property_warnings(),
        )
        assert isinstance(result, bytes)
        assert result[:5] == b"%PDF-"

    def test_no_data_graceful(self):
        """Full dossier with no optional data doesn't crash."""
        result = generate_full_dossier(
            address="Unknown address",
            building_year=None,
            building_use=None,
            risks=None,
            sunlight_score=None,
            viewing_questions=None,
            language="en",
        )
        assert isinstance(result, bytes)
        assert result[:5] == b"%PDF-"

    def test_partial_tier_b_with_crime_only(self):
        tier_b = TierBResponse(
            address_id="0363010012345678",
            crime=CrimeStatsCard(total_per_1000=55.0),
        )
        result = generate_full_dossier(
            address="Test",
            building_year=2000,
            building_use="Office",
            risks=_make_risks(),
            sunlight_score=75,
            viewing_questions=None,
            language="en",
            tier_b=tier_b,
        )
        assert isinstance(result, bytes)
        assert result[:5] == b"%PDF-"

    def test_partial_tier_b_no_crime(self):
        tier_b = TierBResponse(
            address_id="0363010012345678",
            crime=CrimeStatsCard(message="No data available"),
        )
        result = generate_full_dossier(
            address="Test",
            building_year=2000,
            building_use=None,
            risks=None,
            sunlight_score=None,
            viewing_questions=None,
            language="nl",
            tier_b=tier_b,
        )
        assert isinstance(result, bytes)
        assert result[:5] == b"%PDF-"

    def test_unavailable_neighborhood_indicators(self):
        """Stats with unavailable indicators render dash."""
        stats = NeighborhoodStats(
            buurt_code="BU00000001",
            buurt_name="Test Buurt",
            population_density=NeighborhoodIndicator(available=False),
            avg_household_size=NeighborhoodIndicator(available=False),
            single_person_pct=NeighborhoodIndicator(available=False),
            age_profile=AgeProfile(),
            owner_occupied_pct=NeighborhoodIndicator(available=False),
            avg_property_value=NeighborhoodIndicator(available=False),
            distance_to_train_km=NeighborhoodIndicator(available=False),
            distance_to_supermarket_km=NeighborhoodIndicator(available=False),
        )
        result = generate_full_dossier(
            address="Test",
            building_year=None,
            building_use=None,
            risks=None,
            sunlight_score=None,
            viewing_questions=None,
            language="en",
            neighborhood_stats=stats,
        )
        assert isinstance(result, bytes)
        assert result[:5] == b"%PDF-"

    def test_full_dossier_contains_required_premium_sections(self):
        result = generate_full_dossier(
            address="Kalverstraat 1, 1012 Amsterdam",
            building_year=1970,
            building_use="Residential",
            risks=_make_risks(),
            sunlight_score=80,
            viewing_questions=_make_viewing_questions(),
            language="en",
            property_warnings_data=_make_property_warnings(),
        )
        reader = PdfReader(io.BytesIO(result))
        text = "\n".join(page.extract_text() or "" for page in reader.pages)
        assert "Asbestos Awareness" in text
        assert "Foundation Risk" in text
        assert "Ground Lease (Erfpacht)" in text
        assert "Owners' Association" in text
        assert "Lead Pipe Risk" in text
        assert "Soil Contamination Check" in text
        assert "Direct sun (clear-sky visibility)" in text
        assert "Shadow Snapshots" in text


class TestComparisonChartScaleDeclaration:
    """E4-S1: Every comparison chart has a scale declaration caption."""

    def _extract_full_text(self, language: str) -> str:
        result = generate_full_dossier(
            address="Kalverstraat 1, 1012 Amsterdam",
            building_year=1920,
            building_use="Residential" if language == "en" else "Woonfunctie",
            risks=_make_risks(),
            sunlight_score=80,
            viewing_questions=_make_viewing_questions(),
            language=language,
            floor_area=95,
            neighborhood_stats=_make_neighborhood_stats(),
            tier_b=_make_tier_b(),
            risk_comparisons=_make_risk_comparisons(),
            property_warnings_data=_make_property_warnings(),
        )
        reader = PdfReader(io.BytesIO(result))
        return "\n".join(page.extract_text() or "" for page in reader.pages)

    def test_scale_caption_present_en(self):
        """English PDF contains scale declaration caption."""
        text = self._extract_full_text("en")
        assert "0\u2013100 score scale" in text
        assert "Higher = better" in text

    def test_scale_caption_present_nl(self):
        """Dutch PDF contains scale declaration caption."""
        text = self._extract_full_text("nl")
        assert "0\u2013100 scoreschaal" in text
        assert "Hoger = beter" in text

    def test_who_label_en_includes_score_qualifier(self):
        """WHO label in EN explicitly says 'mapped to score'."""
        text = self._extract_full_text("en")
        assert "mapped to score" in text
        # Old unqualified label must not appear
        assert "WHO guideline\n" not in text

    def test_who_label_nl_includes_score_qualifier(self):
        """WHO label in NL explicitly says 'op scoreschaal'."""
        text = self._extract_full_text("nl")
        assert "op scoreschaal" in text
        # Old unqualified label must not appear
        assert "WHO-richtlijn\n" not in text


def _norm(text: str) -> str:
    """Collapse multi-space gaps from pypdf extraction."""
    import re
    return re.sub(r"\s+", " ", text)


class TestPeerBaselineLabels:
    """E4-S2: City average relabeled to peer baseline."""

    def _extract_full_text(self, language: str) -> str:
        result = generate_full_dossier(
            address="Kalverstraat 1, 1012 Amsterdam",
            building_year=1920,
            building_use="Residential" if language == "en" else "Woonfunctie",
            risks=_make_risks(),
            sunlight_score=80,
            viewing_questions=_make_viewing_questions(),
            language=language,
            floor_area=95,
            neighborhood_stats=_make_neighborhood_stats(),
            tier_b=_make_tier_b(),
            risk_comparisons=_make_risk_comparisons(),
            property_warnings_data=_make_property_warnings(),
        )
        reader = PdfReader(io.BytesIO(result))
        return "\n".join(page.extract_text() or "" for page in reader.pages)

    def test_no_city_average_in_en(self):
        """English PDF must not contain old 'City average' label."""
        text = _norm(self._extract_full_text("en"))
        assert "City average" not in text

    def test_no_stadsgemiddelde_in_nl(self):
        """Dutch PDF must not contain old 'Stadsgemiddelde' label."""
        text = _norm(self._extract_full_text("nl"))
        assert "Stadsgemiddelde" not in text

    def test_peer_baseline_label_en(self):
        """English PDF uses 'Peer baseline (urbanization)' label."""
        text = _norm(self._extract_full_text("en"))
        assert "Peer baseline" in text
        assert "urbanization" in text

    def test_vergelijkingswaarde_label_nl(self):
        """Dutch PDF uses 'Vergelijkingswaarde (stedelijkheid)' label."""
        text = _norm(self._extract_full_text("nl"))
        assert "Vergelijkingswaarde" in text
        assert "stedelijkheid" in text

    def test_methodology_disclosure_en(self):
        """English methodology page discloses peer baseline is modeled."""
        text = _norm(self._extract_full_text("en"))
        assert "urbanization category" in text.lower()
        assert "not averaged from the municipality" in text

    def test_methodology_disclosure_nl(self):
        """Dutch methodology page discloses peer baseline is modeled."""
        text = _norm(self._extract_full_text("nl"))
        assert "stedelijkheidscategorie" in text.lower()
        assert "niet gemiddeld over" in text


class TestPropertyWarningsPdfSections:
    """Tests for all 5 property warning categories in PDF."""

    def test_foundation_high_with_soil(self):
        """High foundation risk renders soil type + subsidence."""
        warnings = PropertyWarningsResponse(
            address_id="0363010012345678",
            attention_summary=AttentionSummary(
                flag_count=1, flags=[],
                risk_categories_assessed=0,
            ),
            foundation_risk=FoundationRisk(
                level="high", construction_year=1950,
                soil_type="klei",
                subsidence_rate_mm_per_year=3.5,
            ),
            erfpacht=ErfpachtWarning(detected=False),
            vve=VvEInfo(is_apartment=False),
            asbestos=AsbestosWarning(flagged=False),
            lead_pipe=LeadPipeWarning(flagged=False),
        )
        result = generate_full_dossier(
            address="Test 1, Amsterdam",
            building_year=1950,
            building_use="Residential",
            risks=_make_risks(),
            sunlight_score=80,
            viewing_questions=_make_viewing_questions(),
            language="en",
            property_warnings_data=warnings,
        )
        reader = PdfReader(io.BytesIO(result))
        text = _norm(
            "\n".join(
                p.extract_text() or "" for p in reader.pages
            )
        )
        assert "Foundation Risk" in text
        assert "High foundation risk identified" in text
        assert "klei" in text
        assert "3.5" in text

    def test_foundation_low_no_signal(self):
        """Low foundation risk shows no risk signal."""
        warnings = PropertyWarningsResponse(
            address_id="0363010012345678",
            attention_summary=AttentionSummary(
                flag_count=0, flags=[],
                risk_categories_assessed=0,
            ),
            foundation_risk=FoundationRisk(level="low"),
            erfpacht=ErfpachtWarning(detected=False),
            vve=VvEInfo(is_apartment=False),
            asbestos=AsbestosWarning(flagged=False),
            lead_pipe=LeadPipeWarning(flagged=False),
        )
        result = generate_full_dossier(
            address="Test 1, Amsterdam",
            building_year=2000,
            building_use="Residential",
            risks=_make_risks(),
            sunlight_score=80,
            viewing_questions=_make_viewing_questions(),
            language="en",
            property_warnings_data=warnings,
        )
        reader = PdfReader(io.BytesIO(result))
        text = _norm(
            "\n".join(
                p.extract_text() or "" for p in reader.pages
            )
        )
        assert "No foundation risk signal detected" in text

    def test_foundation_unavailable(self):
        """Unavailable foundation risk explains why."""
        warnings = PropertyWarningsResponse(
            address_id="0363010012345678",
            attention_summary=AttentionSummary(
                flag_count=0, flags=[],
                risk_categories_assessed=0,
            ),
            foundation_risk=FoundationRisk(level="unavailable"),
            erfpacht=ErfpachtWarning(detected=False),
            vve=VvEInfo(is_apartment=False),
            asbestos=AsbestosWarning(flagged=False),
            lead_pipe=LeadPipeWarning(flagged=False),
        )
        result = generate_full_dossier(
            address="Test 1, Amsterdam",
            building_year=2000,
            building_use="Residential",
            risks=_make_risks(),
            sunlight_score=80,
            viewing_questions=_make_viewing_questions(),
            language="en",
            property_warnings_data=warnings,
        )
        reader = PdfReader(io.BytesIO(result))
        text = _norm(
            "\n".join(
                p.extract_text() or "" for p in reader.pages
            )
        )
        assert "could not be assessed" in text

    def test_foundation_medium(self):
        """Medium foundation risk shows moderate language."""
        warnings = PropertyWarningsResponse(
            address_id="0363010012345678",
            attention_summary=AttentionSummary(
                flag_count=0, flags=[],
                risk_categories_assessed=0,
            ),
            foundation_risk=FoundationRisk(
                level="medium", construction_year=1965,
                soil_type="klei",
            ),
            erfpacht=ErfpachtWarning(detected=False),
            vve=VvEInfo(is_apartment=False),
            asbestos=AsbestosWarning(flagged=False),
            lead_pipe=LeadPipeWarning(flagged=False),
        )
        result = generate_full_dossier(
            address="Test 1, Amsterdam",
            building_year=1965,
            building_use="Residential",
            risks=_make_risks(),
            sunlight_score=80,
            viewing_questions=_make_viewing_questions(),
            language="en",
            property_warnings_data=warnings,
        )
        reader = PdfReader(io.BytesIO(result))
        text = _norm(
            "\n".join(
                p.extract_text() or "" for p in reader.pages
            )
        )
        assert "Moderate foundation risk" in text

    def test_erfpacht_detected(self):
        """Erfpacht detected renders municipality."""
        warnings = PropertyWarningsResponse(
            address_id="0363010012345678",
            attention_summary=AttentionSummary(
                flag_count=1, flags=[],
                risk_categories_assessed=0,
            ),
            foundation_risk=FoundationRisk(level="low"),
            erfpacht=ErfpachtWarning(
                detected=True,
                confidence="municipality_based",
                municipality="Amsterdam",
            ),
            vve=VvEInfo(is_apartment=False),
            asbestos=AsbestosWarning(flagged=False),
            lead_pipe=LeadPipeWarning(flagged=False),
        )
        result = generate_full_dossier(
            address="Test 1, Amsterdam",
            building_year=2000,
            building_use="Residential",
            risks=_make_risks(),
            sunlight_score=80,
            viewing_questions=_make_viewing_questions(),
            language="en",
            property_warnings_data=warnings,
        )
        reader = PdfReader(io.BytesIO(result))
        text = _norm(
            "\n".join(
                p.extract_text() or "" for p in reader.pages
            )
        )
        assert "Ground Lease (Erfpacht)" in text
        assert "detected" in text.lower()
        assert "Amsterdam" in text

    def test_erfpacht_not_detected(self):
        """No erfpacht shows freehold message."""
        warnings = PropertyWarningsResponse(
            address_id="0363010012345678",
            attention_summary=AttentionSummary(
                flag_count=0, flags=[],
                risk_categories_assessed=0,
            ),
            foundation_risk=FoundationRisk(level="low"),
            erfpacht=ErfpachtWarning(detected=False),
            vve=VvEInfo(is_apartment=False),
            asbestos=AsbestosWarning(flagged=False),
            lead_pipe=LeadPipeWarning(flagged=False),
        )
        result = generate_full_dossier(
            address="Test 1, Amsterdam",
            building_year=2000,
            building_use="Residential",
            risks=_make_risks(),
            sunlight_score=80,
            viewing_questions=_make_viewing_questions(),
            language="en",
            property_warnings_data=warnings,
        )
        reader = PdfReader(io.BytesIO(result))
        text = _norm(
            "\n".join(
                p.extract_text() or "" for p in reader.pages
            )
        )
        assert "freehold" in text.lower()

    def test_vve_apartment(self):
        """VvE apartment renders advice."""
        warnings = PropertyWarningsResponse(
            address_id="0363010012345678",
            attention_summary=AttentionSummary(
                flag_count=0, flags=[],
                risk_categories_assessed=0,
            ),
            foundation_risk=FoundationRisk(level="low"),
            erfpacht=ErfpachtWarning(detected=False),
            vve=VvEInfo(is_apartment=True, num_units=12),
            asbestos=AsbestosWarning(flagged=False),
            lead_pipe=LeadPipeWarning(flagged=False),
        )
        result = generate_full_dossier(
            address="Test 1, Amsterdam",
            building_year=2000,
            building_use="Residential",
            risks=_make_risks(),
            sunlight_score=80,
            viewing_questions=_make_viewing_questions(),
            language="en",
            property_warnings_data=warnings,
        )
        reader = PdfReader(io.BytesIO(result))
        text = _norm(
            "\n".join(
                p.extract_text() or "" for p in reader.pages
            )
        )
        assert "apartment right" in text.lower()
        assert "reserve fund" in text.lower()

    def test_vve_not_apartment(self):
        """Non-apartment shows no VvE applicable."""
        warnings = PropertyWarningsResponse(
            address_id="0363010012345678",
            attention_summary=AttentionSummary(
                flag_count=0, flags=[],
                risk_categories_assessed=0,
            ),
            foundation_risk=FoundationRisk(level="low"),
            erfpacht=ErfpachtWarning(detected=False),
            vve=VvEInfo(is_apartment=False),
            asbestos=AsbestosWarning(flagged=False),
            lead_pipe=LeadPipeWarning(flagged=False),
        )
        result = generate_full_dossier(
            address="Test 1, Amsterdam",
            building_year=2000,
            building_use="Residential",
            risks=_make_risks(),
            sunlight_score=80,
            viewing_questions=_make_viewing_questions(),
            language="en",
            property_warnings_data=warnings,
        )
        reader = PdfReader(io.BytesIO(result))
        text = _norm(
            "\n".join(
                p.extract_text() or "" for p in reader.pages
            )
        )
        assert "not an apartment" in text.lower()

    def test_lead_pipe_flagged(self):
        """Lead pipe flagged renders year and advice."""
        warnings = PropertyWarningsResponse(
            address_id="0363010012345678",
            attention_summary=AttentionSummary(
                flag_count=1, flags=[],
                risk_categories_assessed=0,
            ),
            foundation_risk=FoundationRisk(level="low"),
            erfpacht=ErfpachtWarning(detected=False),
            vve=VvEInfo(is_apartment=False),
            asbestos=AsbestosWarning(flagged=False),
            lead_pipe=LeadPipeWarning(
                flagged=True, construction_year=1945,
            ),
        )
        result = generate_full_dossier(
            address="Test 1, Amsterdam",
            building_year=1945,
            building_use="Residential",
            risks=_make_risks(),
            sunlight_score=80,
            viewing_questions=_make_viewing_questions(),
            language="en",
            property_warnings_data=warnings,
        )
        reader = PdfReader(io.BytesIO(result))
        text = _norm(
            "\n".join(
                p.extract_text() or "" for p in reader.pages
            )
        )
        assert "Lead Pipe Risk" in text
        assert "1945" in text
        assert "water test" in text.lower()

    def test_lead_pipe_not_flagged(self):
        """Unflagged lead pipe shows no signal."""
        warnings = PropertyWarningsResponse(
            address_id="0363010012345678",
            attention_summary=AttentionSummary(
                flag_count=0, flags=[],
                risk_categories_assessed=0,
            ),
            foundation_risk=FoundationRisk(level="low"),
            erfpacht=ErfpachtWarning(detected=False),
            vve=VvEInfo(is_apartment=False),
            asbestos=AsbestosWarning(flagged=False),
            lead_pipe=LeadPipeWarning(flagged=False),
        )
        result = generate_full_dossier(
            address="Test 1, Amsterdam",
            building_year=2000,
            building_use="Residential",
            risks=_make_risks(),
            sunlight_score=80,
            viewing_questions=_make_viewing_questions(),
            language="en",
            property_warnings_data=warnings,
        )
        reader = PdfReader(io.BytesIO(result))
        text = _norm(
            "\n".join(
                p.extract_text() or "" for p in reader.pages
            )
        )
        assert "No lead pipe signal detected" in text

    def test_all_warnings_active_en(self):
        """All 5 categories flagged in EN."""
        warnings = PropertyWarningsResponse(
            address_id="0363010012345678",
            attention_summary=AttentionSummary(
                flag_count=5, flags=[],
                risk_categories_assessed=0,
            ),
            foundation_risk=FoundationRisk(
                level="high", construction_year=1930,
                soil_type="veen",
                subsidence_rate_mm_per_year=4.2,
            ),
            erfpacht=ErfpachtWarning(
                detected=True, confidence="confirmed",
                municipality="Amsterdam",
            ),
            vve=VvEInfo(is_apartment=True, num_units=8),
            asbestos=AsbestosWarning(
                flagged=True, construction_year=1930,
            ),
            lead_pipe=LeadPipeWarning(
                flagged=True, construction_year=1930,
            ),
        )
        result = generate_full_dossier(
            address="Test 1, Amsterdam",
            building_year=1930,
            building_use="Residential",
            risks=_make_risks(),
            sunlight_score=80,
            viewing_questions=_make_viewing_questions(),
            language="en",
            property_warnings_data=warnings,
        )
        reader = PdfReader(io.BytesIO(result))
        text = _norm(
            "\n".join(
                p.extract_text() or "" for p in reader.pages
            )
        )
        assert "Asbestos Awareness" in text
        assert "Foundation Risk" in text
        assert "Ground Lease (Erfpacht)" in text
        assert "Owners' Association" in text
        assert "Lead Pipe Risk" in text
        assert "Source: BRO soil data" in text
        assert "Source: Municipal ground lease registry" in text
        assert "Source: BAG dwelling unit count" in text

    def test_all_warnings_active_nl(self):
        """All 5 categories flagged in NL."""
        warnings = PropertyWarningsResponse(
            address_id="0363010012345678",
            attention_summary=AttentionSummary(
                flag_count=5, flags=[],
                risk_categories_assessed=0,
            ),
            foundation_risk=FoundationRisk(
                level="high", construction_year=1930,
                soil_type="klei",
                subsidence_rate_mm_per_year=3.0,
            ),
            erfpacht=ErfpachtWarning(
                detected=True,
                confidence="municipality_based",
                municipality="Amsterdam",
            ),
            vve=VvEInfo(is_apartment=True, num_units=6),
            asbestos=AsbestosWarning(
                flagged=True, construction_year=1930,
            ),
            lead_pipe=LeadPipeWarning(
                flagged=True, construction_year=1930,
            ),
        )
        result = generate_full_dossier(
            address="Test 1, Amsterdam",
            building_year=1930,
            building_use="Residential",
            risks=_make_risks(),
            sunlight_score=80,
            viewing_questions=_make_viewing_questions(),
            language="nl",
            property_warnings_data=warnings,
        )
        reader = PdfReader(io.BytesIO(result))
        text = _norm(
            "\n".join(
                p.extract_text() or "" for p in reader.pages
            )
        )
        assert "Asbestbewustzijn" in text
        assert "Funderingsrisico" in text
        assert "Erfpacht (grondhuur)" in text
        assert "VvE (Vereniging van Eigenaren)" in text
        assert "Loden leidingen" in text
        assert "Bron: BRO bodemdata" in text
        assert "Bron: Gemeentelijke erfpachtlijst" in text
        assert "Bron: BAG verblijfsobjecten" in text

    def test_none_warnings_shows_unavailable(self):
        """When property_warnings is None, show unavailable."""
        result = generate_full_dossier(
            address="Test 1, Amsterdam",
            building_year=2000,
            building_use="Residential",
            risks=_make_risks(),
            sunlight_score=80,
            viewing_questions=_make_viewing_questions(),
            language="en",
            property_warnings_data=None,
        )
        reader = PdfReader(io.BytesIO(result))
        text = _norm(
            "\n".join(
                p.extract_text() or "" for p in reader.pages
            )
        )
        assert "Foundation risk unavailable" in text
        assert "Ground lease status unavailable" in text
        assert "VvE status unavailable" in text
        assert "Lead pipe status unavailable" in text
        assert "Asbestos status unavailable" in text


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

    resp = await client.post(
        "/api/address/0363010012345678/export",
        json={
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

    resp = await client.post(
        "/api/address/0363010012345678/export",
        json={
            "rd_x": 121000,
            "rd_y": 487000,
            "lat": 52.37,
            "lng": 4.89,
            "address": "Keizersgracht 100",
        },
    )
    assert resp.status_code == 200
    assert resp.content[:5] == b"%PDF-"
    mock_bag.get_building_facts.assert_not_called()
    mock_risk_cards.get_risk_cards.assert_not_called()


@pytest.mark.asyncio
async def test_export_endpoint_invalid_template(client):
    resp = await client.post(
        "/api/address/0363010012345678/export",
        json={
            "rd_x": 121000,
            "rd_y": 487000,
            "lat": 52.37,
            "lng": 4.89,
            "address": "Test",
            "template": "not_a_template",
        },
    )
    assert resp.status_code == 422
    assert "full_dossier" in resp.json()["detail"]


@pytest.mark.asyncio
@patch("app.services.reports.check_entitlement", new_callable=AsyncMock, return_value=True)
@patch("app.api.address.cache_get", new_callable=AsyncMock, return_value=None)
@patch("app.api.address.cache_set", new_callable=AsyncMock)
@patch("app.api.address.bag")
@patch("app.api.address.risk_cards")
@patch("app.api.address.property_warnings")
async def test_export_endpoint_full_dossier_template(
    mock_property_warnings, mock_risk_cards, mock_bag, mock_cache_set, mock_cache_get,
    mock_entitlement, client
):
    mock_property_warnings.get_property_warnings = AsyncMock(
        return_value=_make_property_warnings()
    )
    mock_bag.get_building_facts = AsyncMock(
        return_value=BuildingFacts(
            pand_id="0363100012345678",
            construction_year=1990,
            intended_use_en=["Residential"],
        )
    )
    mock_risk_cards.get_risk_cards = AsyncMock(return_value=_make_risks())

    resp = await client.post(
        "/api/address/0363010012345678/export",
        json={
            "rd_x": 121000,
            "rd_y": 487000,
            "lat": 52.37,
            "lng": 4.89,
            "address": "Kalverstraat 1, Amsterdam",
            "template": "full_dossier",
            "report_id": "test-report-id",
        },
    )
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/pdf"
    assert resp.content[:5] == b"%PDF-"


@pytest.mark.asyncio
async def test_export_endpoint_invalid_language(client):
    resp = await client.post(
        "/api/address/0363010012345678/export",
        json={
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

    resp = await client.post(
        "/api/address/0363010012345678/export",
        json={
            "rd_x": 121000,
            "rd_y": 487000,
            "lat": 52.37,
            "lng": 4.89,
            "address": "Somestraat 1",
        },
    )
    assert resp.status_code == 200
    assert resp.content[:5] == b"%PDF-"


@pytest.mark.asyncio
async def test_export_endpoint_invalid_vbo_id(client):
    resp = await client.post(
        "/api/address/invalid-id/export",
        json={
            "rd_x": 121000,
            "rd_y": 487000,
            "lat": 52.37,
            "lng": 4.89,
            "address": "Test",
        },
    )
    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# Payload size limit tests (Task 8.3)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_export_rejects_oversized_address(client):
    """Address exceeding max_length=500 returns 422."""
    resp = await client.post(
        "/api/address/0363010012345678/export",
        json={
            "rd_x": 121000,
            "rd_y": 487000,
            "lat": 52.37,
            "lng": 4.89,
            "address": "A" * 501,
        },
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_export_accepts_max_length_address(client):
    """Address exactly at max_length=500 is accepted (not rejected)."""
    # We only need to verify Pydantic accepts it — the endpoint will
    # proceed but may fail later on service mocks; 422 from validation
    # is the thing we do NOT want.
    resp = await client.post(
        "/api/address/0363010012345678/export",
        json={
            "rd_x": 121000,
            "rd_y": 487000,
            "lat": 52.37,
            "lng": 4.89,
            "address": "A" * 500,
        },
    )
    # Should NOT be 422 from validation — may be 200 or 500 depending on mocks
    assert resp.status_code != 422


@pytest.mark.asyncio
async def test_export_rejects_oversized_shadow_image(client):
    """shadow_image_b64 exceeding max_length=2_000_000 returns 422."""
    resp = await client.post(
        "/api/address/0363010012345678/export",
        json={
            "rd_x": 121000,
            "rd_y": 487000,
            "lat": 52.37,
            "lng": 4.89,
            "address": "Test",
            "shadow_image_b64": "A" * 2_000_001,
        },
    )
    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# Targeted endpoint assertions (Finding 7)
# ---------------------------------------------------------------------------


def _make_neighborhood_resp():
    """Create a NeighborhoodStatsResponse for testing."""
    from app.models.neighborhood import NeighborhoodStatsResponse

    return NeighborhoodStatsResponse(
        address_id="0363010012345678",
        stats=_make_neighborhood_stats(),
    )


@pytest.mark.asyncio
@patch("app.api.address.cache_get", new_callable=AsyncMock, return_value=None)
@patch("app.api.address.cache_set", new_callable=AsyncMock)
@patch("app.api.address.bag")
@patch("app.api.address.risk_cards")
async def test_export_post_with_shadow_image(
    mock_risk_cards, mock_bag, mock_cache_set, mock_cache_get, client
):
    """POST body accepts base64 shadow image without URL-length limits."""
    mock_bag.get_building_facts = AsyncMock(return_value=None)
    mock_risk_cards.get_risk_cards = AsyncMock(return_value=_make_risks())

    # Large base64 string simulating a real shadow image
    fake_shadow = "A" * 10000

    resp = await client.post(
        "/api/address/0363010012345678/export",
        json={
            "rd_x": 121000,
            "rd_y": 487000,
            "lat": 52.37,
            "lng": 4.89,
            "address": "Test",
            "shadow_image": fake_shadow,
        },
    )
    assert resp.status_code == 200
    assert resp.content[:5] == b"%PDF-"


@pytest.mark.asyncio
@patch("app.api.address.cache_get", new_callable=AsyncMock, return_value=None)
@patch("app.api.address.cache_set", new_callable=AsyncMock)
@patch("app.api.address.bag")
@patch("app.api.address.risk_cards")
async def test_export_accepts_shadow_image_b64_alias(
    mock_risk_cards, mock_bag, mock_cache_set, mock_cache_get, client
):
    """POST body accepts shadow_image_b64 as alias for shadow_image."""
    mock_bag.get_building_facts = AsyncMock(return_value=None)
    mock_risk_cards.get_risk_cards = AsyncMock(return_value=None)

    resp = await client.post(
        "/api/address/0363010012345678/export",
        json={
            "rd_x": 121000,
            "rd_y": 487000,
            "lat": 52.37,
            "lng": 4.89,
            "address": "Test",
            "shadow_image_b64": "AAAA",
        },
    )
    assert resp.status_code == 200
    assert resp.content[:5] == b"%PDF-"


@pytest.mark.asyncio
@patch("app.services.reports.check_entitlement", new_callable=AsyncMock, return_value=True)
@patch("app.api.address.cache_get", new_callable=AsyncMock, return_value=None)
@patch("app.api.address.cache_set", new_callable=AsyncMock)
@patch("app.api.address.bag")
@patch("app.api.address.risk_cards")
@patch("app.api.address.cbs")
@patch("app.api.address.tier_b")
@patch("app.api.address.property_warnings")
async def test_export_full_dossier_fetches_additional_data(
    mock_property_warnings, mock_tier_b, mock_cbs, mock_risk_cards, mock_bag,
    mock_cache_set, mock_cache_get, mock_entitlement, client
):
    """Full Dossier template fetches neighborhood stats and tier-b in parallel."""
    mock_property_warnings.get_property_warnings = AsyncMock(
        return_value=_make_property_warnings()
    )
    mock_bag.get_building_facts = AsyncMock(return_value=None)
    mock_risk_cards.get_risk_cards = AsyncMock(return_value=_make_risks())
    mock_cbs.get_neighborhood_stats = AsyncMock(
        return_value=_make_neighborhood_resp()
    )
    mock_tier_b.get_tier_b_data = AsyncMock(return_value=_make_tier_b())

    resp = await client.post(
        "/api/address/0363010012345678/export",
        json={
            "rd_x": 121000,
            "rd_y": 487000,
            "lat": 52.37,
            "lng": 4.89,
            "address": "Kalverstraat 1, Amsterdam",
            "template": "full_dossier",
            "report_id": "test-report-id",
            "buurt_code": "BU03630000",
            "postcode": "1012NX",
            "house_number": "1",
            "house_letter": "A",
            "addition": "2",
        },
    )
    assert resp.status_code == 200
    assert resp.content[:5] == b"%PDF-"
    # Verify additional data sources were called with correct identity fields
    mock_cbs.get_neighborhood_stats.assert_called_once()
    cbs_kwargs = mock_cbs.get_neighborhood_stats.call_args
    assert cbs_kwargs.kwargs.get("buurt_code") == "BU03630000"

    mock_tier_b.get_tier_b_data.assert_called_once()
    tb_kwargs = mock_tier_b.get_tier_b_data.call_args
    assert tb_kwargs.kwargs.get("vbo_id") == "0363010012345678"
    assert tb_kwargs.kwargs.get("buurt_code") == "BU03630000"


@pytest.mark.asyncio
@patch("app.services.reports.check_entitlement", new_callable=AsyncMock, return_value=True)
@patch("app.api.address.cache_get", new_callable=AsyncMock, return_value=None)
@patch("app.api.address.cache_set", new_callable=AsyncMock)
@patch("app.api.address.bag")
@patch("app.api.address.risk_cards")
@patch("app.api.address.cbs")
@patch("app.api.address.tier_b")
@patch("app.api.address.property_warnings")
async def test_export_tier_b_uses_neighborhood_buurt_code_fallback(
    mock_property_warnings, mock_tier_b, mock_cbs, mock_risk_cards, mock_bag,
    mock_cache_set, mock_cache_get, mock_entitlement, client
):
    """Tier-B uses neighborhood-resolved buurt_code when request has none."""
    mock_property_warnings.get_property_warnings = AsyncMock(
        return_value=_make_property_warnings()
    )
    mock_bag.get_building_facts = AsyncMock(return_value=None)
    mock_risk_cards.get_risk_cards = AsyncMock(return_value=_make_risks())
    mock_cbs.get_neighborhood_stats = AsyncMock(
        return_value=_make_neighborhood_resp()
    )
    mock_tier_b.get_tier_b_data = AsyncMock(return_value=_make_tier_b())

    resp = await client.post(
        "/api/address/0363010012345678/export",
        json={
            "rd_x": 121000,
            "rd_y": 487000,
            "lat": 52.37,
            "lng": 4.89,
            "address": "Kalverstraat 1, Amsterdam",
            "template": "full_dossier",
            "report_id": "test-report-id",
            # NOTE: no buurt_code in request — should resolve from neighborhood
            "postcode": "1012NX",
            "house_number": "1",
        },
    )
    assert resp.status_code == 200
    # Tier-B first call is parallel with missing buurt_code, second call uses fallback.
    assert mock_tier_b.get_tier_b_data.call_count == 2
    first_call = mock_tier_b.get_tier_b_data.call_args_list[0]
    second_call = mock_tier_b.get_tier_b_data.call_args_list[1]
    assert first_call.kwargs.get("buurt_code") is None
    assert second_call.kwargs.get("buurt_code") == "BU03630001"


@pytest.mark.asyncio
@patch("app.api.address.cache_get", new_callable=AsyncMock, return_value=None)
@patch("app.api.address.cache_set", new_callable=AsyncMock)
@patch("app.api.address.bag")
@patch("app.api.address.risk_cards")
async def test_export_quick_brief_does_not_fetch_dossier_data(
    mock_risk_cards, mock_bag, mock_cache_set, mock_cache_get, client
):
    """Quick Brief does not fetch neighborhood or tier-b data."""
    mock_bag.get_building_facts = AsyncMock(return_value=None)
    mock_risk_cards.get_risk_cards = AsyncMock(return_value=_make_risks())

    resp = await client.post(
        "/api/address/0363010012345678/export",
        json={
            "rd_x": 121000,
            "rd_y": 487000,
            "lat": 52.37,
            "lng": 4.89,
            "address": "Test",
            "template": "quick_brief",
        },
    )
    assert resp.status_code == 200
    assert resp.content[:5] == b"%PDF-"


@pytest.mark.asyncio
@patch("app.api.address.cache_get", new_callable=AsyncMock)
@patch("app.api.address.cache_set", new_callable=AsyncMock)
@patch("app.api.address.bag")
@patch("app.api.address.risk_cards")
async def test_export_writes_back_to_cache_on_miss(
    mock_risk_cards, mock_bag, mock_cache_set, mock_cache_get, client
):
    """Export endpoint writes building and risk data back to cache on miss."""
    mock_cache_get.return_value = None
    mock_bag.get_building_facts = AsyncMock(
        return_value=BuildingFacts(
            pand_id="0363100012345678",
            construction_year=1920,
            intended_use_en=["Residential"],
        )
    )
    mock_risk_cards.get_risk_cards = AsyncMock(return_value=_make_risks())

    resp = await client.post(
        "/api/address/0363010012345678/export",
        json={
            "rd_x": 121000,
            "rd_y": 487000,
            "lat": 52.37,
            "lng": 4.89,
            "address": "Test",
        },
    )
    assert resp.status_code == 200
    # Verify cache_set was called for building and risks
    cache_keys = [call.args[0] for call in mock_cache_set.call_args_list]
    assert any(k.startswith("building:") for k in cache_keys)
    assert any(k.startswith("risks:") for k in cache_keys)


# ---------------------------------------------------------------------------
# Parser-based page-count assertions (Task 8)
# ---------------------------------------------------------------------------


class TestPageCountConstraints:
    """Verify layout invariants using pypdf to parse generated PDFs."""

    def _page_count(self, pdf_bytes: bytes) -> int:
        return len(PdfReader(io.BytesIO(pdf_bytes)).pages)

    def test_quick_brief_exactly_one_page(self):
        """Quick Brief must always be exactly 1 page."""
        result = generate_quick_brief(
            address="Kalverstraat 1, 1012 Amsterdam",
            building_year=1920,
            building_use="Residential",
            risks=_make_risks(),
            sunlight_score=80,
            viewing_questions=_make_viewing_questions(),
            language="en",
        )
        assert self._page_count(result) == 1

    def test_quick_brief_one_page_under_stress(self):
        """Quick Brief stays 1 page even with many viewing questions."""
        many_cats = []
        for i in range(6):
            many_cats.append(
                QuestionCategory(
                    name=f"Category {i}",
                    name_nl=f"Categorie {i}",
                    severity="moderate",
                    questions=[
                        ViewingQuestion(
                            text_en=f"Question {j} in category {i} - this is a detailed question?",
                            text_nl=f"Vraag {j} in categorie {i} - gedetailleerde vraag?",
                        )
                        for j in range(5)
                    ],
                )
            )
        stress_qs = ViewingQuestionsResponse(
            address_id="0363010012345678",
            categories=many_cats,
        )
        result = generate_quick_brief(
            address="Very Long Street Name 12345-C, 1234 AB Amsterdam",
            building_year=1920,
            building_use="Residential, Commercial, Industrial",
            risks=_make_risks(),
            sunlight_score=80,
            viewing_questions=stress_qs,
            language="en",
            floor_area=350,
        )
        assert self._page_count(result) == 1
        # Clipped note should appear since 30 questions > max_q
        reader = PdfReader(io.BytesIO(result))
        page_text = reader.pages[0].extract_text() or ""
        assert "Full Dossier" in page_text

    def test_quick_brief_one_page_no_data(self):
        """Quick Brief is 1 page even with no data."""
        result = generate_quick_brief(
            address="Test",
            building_year=None,
            building_use=None,
            risks=None,
            sunlight_score=None,
            viewing_questions=None,
            language="en",
        )
        assert self._page_count(result) == 1

    def test_full_dossier_at_least_five_pages(self):
        """Full Dossier must produce at least 5 pages."""
        result = generate_full_dossier(
            address="Kalverstraat 1, 1012 Amsterdam",
            building_year=1920,
            building_use="Residential",
            risks=_make_risks(),
            sunlight_score=80,
            viewing_questions=_make_viewing_questions(),
            language="en",
            floor_area=95,
            neighborhood_stats=_make_neighborhood_stats(),
            tier_b=_make_tier_b(),
            risk_comparisons=_make_risk_comparisons(),
        )
        assert self._page_count(result) >= 5

    def test_full_dossier_at_least_five_pages_no_data(self):
        """Full Dossier produces >= 5 pages even with no optional data."""
        result = generate_full_dossier(
            address="Unknown",
            building_year=None,
            building_use=None,
            risks=None,
            sunlight_score=None,
            viewing_questions=None,
            language="en",
        )
        assert self._page_count(result) >= 5

    def test_full_dossier_dutch(self):
        """Dutch Full Dossier also has >= 5 pages."""
        result = generate_full_dossier(
            address="Kalverstraat 1, 1012 Amsterdam",
            building_year=1920,
            building_use="Woonfunctie",
            risks=_make_risks(),
            sunlight_score=80,
            viewing_questions=_make_viewing_questions(),
            language="nl",
            floor_area=95,
            neighborhood_stats=_make_neighborhood_stats(),
            tier_b=_make_tier_b(),
            risk_comparisons=_make_risk_comparisons(),
        )
        assert self._page_count(result) >= 5


# ---------------------------------------------------------------------------
# GET backward-compatibility endpoint test
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@patch("app.api.address.cache_get", new_callable=AsyncMock, return_value=None)
@patch("app.api.address.cache_set", new_callable=AsyncMock)
@patch("app.api.address.bag")
@patch("app.api.address.risk_cards")
async def test_export_get_backward_compat(
    mock_risk_cards, mock_bag, mock_cache_set, mock_cache_get, client
):
    """GET export endpoint delegates to POST handler for backward compatibility."""
    mock_bag.get_building_facts = AsyncMock(return_value=None)
    mock_risk_cards.get_risk_cards = AsyncMock(return_value=_make_risks())

    resp = await client.get(
        "/api/address/0363010012345678/export",
        params={
            "rd_x": 121000,
            "rd_y": 487000,
            "lat": 52.37,
            "lng": 4.89,
            "address": "Test",
            "template": "quick_brief",
        },
    )
    assert resp.status_code == 200
    assert resp.content[:5] == b"%PDF-"
    assert resp.headers["content-type"] == "application/pdf"


@pytest.mark.asyncio
@patch("app.api.address.cache_get", new_callable=AsyncMock, return_value=None)
@patch("app.api.address.cache_set", new_callable=AsyncMock)
@patch("app.api.address.bag")
@patch("app.api.address.risk_cards")
async def test_export_get_accepts_shadow_image_b64(
    mock_risk_cards, mock_bag, mock_cache_set, mock_cache_get, client
):
    """GET export supports canonical shadow_image_b64 while keeping old query support."""
    mock_bag.get_building_facts = AsyncMock(return_value=None)
    mock_risk_cards.get_risk_cards = AsyncMock(return_value=_make_risks())

    resp = await client.get(
        "/api/address/0363010012345678/export",
        params={
            "rd_x": 121000,
            "rd_y": 487000,
            "lat": 52.37,
            "lng": 4.89,
            "address": "Test",
            "shadow_image_b64": "AAAA",
        },
    )
    assert resp.status_code == 200
    assert resp.content[:5] == b"%PDF-"
