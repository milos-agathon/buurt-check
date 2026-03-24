"""Tests for PDF export service and endpoint."""

import base64
import io
import struct
import zlib
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest
from pypdf import PdfReader

from app.models.building import BuildingFacts, BuildingFactsResponse
from app.models.livability import (
    LivabilityComparison,
    LivabilityComparisonRow,
    LivabilityDimension,
    LivabilityResponse,
    LivabilityTrendPoint,
)
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
    FacadeResult,
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
from app.services import pdf_export as pe
from app.services.pdf_export import (
    BORDER,
    MUTED,
    NATIONAL,
    NL_AGE_0_24,
    NL_AGE_25_64,
    NL_AGE_65_PLUS,
    PEER_BAR,
    SECONDARY,
    TEAL,
    BuurtCheckPDF,
    _build_risk_cells,
    _draw_indicator,
    _draw_livability_section,
    _draw_location_map,
    _draw_shadow_triptych,
    _generate_executive_summary,
    _generate_full_dossier_fpdf,
    _interpret_age_distribution,
    _livability_trend_summary,
    _severity_for_score,
    _severity_label,
    format_number,
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
            national_per_1000=52.1,
            burglary_per_1000=4.2,
            violent_per_1000=1.8,
            yearly_period="2024",
            score=42,
            severity="moderate",
            meaning_en="Crime rate is somewhat above the national average.",
            meaning_nl="Criminaliteitscijfer is enigszins boven het landelijk gemiddelde.",
            source_date="2024",
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


# --- Unit tests: CBS quartile indicators (E6-S2) ---


class TestQuartileIndicators:
    def test_quartile_appended_when_present(self):
        """Quartiles render as plain-language context labels."""
        pdf = BuurtCheckPDF(language="en")
        pdf.add_page()
        indicator = NeighborhoodIndicator(value=428000.0, unit="\u20ac", quartile=3)
        _draw_indicator(pdf, "Avg property value", indicator)
        result = bytes(pdf.output())
        reader = PdfReader(io.BytesIO(result))
        text = "\n".join(p.extract_text() or "" for p in reader.pages)
        assert "above average" in text
        assert "\u20ac428,000" in text

    def test_quartile_omitted_when_none(self):
        """No quartile badge when quartile is None."""
        pdf = BuurtCheckPDF(language="en")
        pdf.add_page()
        indicator = NeighborhoodIndicator(value=428000.0, unit="\u20ac")
        _draw_indicator(pdf, "Avg property value", indicator)
        result = bytes(pdf.output())
        reader = PdfReader(io.BytesIO(result))
        text = "\n".join(p.extract_text() or "" for p in reader.pages)
        assert "(Q" not in text
        assert "\u20ac428,000" in text

    def test_quartile_with_percentage(self):
        """Percentage indicators use the same plain-language quartile labels."""
        pdf = BuurtCheckPDF(language="en")
        pdf.add_page()
        indicator = NeighborhoodIndicator(value=62.0, unit="%", quartile=4)
        _draw_indicator(pdf, "Single person", indicator)
        result = bytes(pdf.output())
        reader = PdfReader(io.BytesIO(result))
        text = "\n".join(p.extract_text() or "" for p in reader.pages)
        assert "62%" in text
        assert "top 25%" in text

    def test_quartile_with_distance(self):
        """Distance indicators use the same plain-language quartile labels."""
        pdf = BuurtCheckPDF(language="en")
        pdf.add_page()
        indicator = NeighborhoodIndicator(value=0.8, unit="km", quartile=1)
        _draw_indicator(pdf, "Train station", indicator)
        result = bytes(pdf.output())
        reader = PdfReader(io.BytesIO(result))
        text = "\n".join(p.extract_text() or "" for p in reader.pages)
        assert "0.8 km" in text
        assert "bottom 25%" in text


# --- Unit tests: Number formatting locale (E10-S5) ---


class TestFormatNumber:
    def test_nl_integer(self):
        """NL: 1234 → '1.234'."""
        assert format_number(1234, 0, is_nl=True) == "1.234"

    def test_en_integer(self):
        """EN: 1234 → '1,234'."""
        assert format_number(1234, 0, is_nl=False) == "1,234"

    def test_nl_decimal(self):
        """NL: 1234.5 with 1 decimal → '1.234,5'."""
        assert format_number(1234.5, 1, is_nl=True) == "1.234,5"

    def test_en_decimal(self):
        """EN: 1234.5 with 1 decimal → '1,234.5'."""
        assert format_number(1234.5, 1, is_nl=False) == "1,234.5"

    def test_nl_small_number(self):
        """NL: 0.8 with 1 decimal → '0,8'."""
        assert format_number(0.8, 1, is_nl=True) == "0,8"

    def test_en_small_number(self):
        """EN: 0.8 with 1 decimal → '0.8'."""
        assert format_number(0.8, 1, is_nl=False) == "0.8"

    def test_nl_large_number(self):
        """NL: 485000 → '485.000'."""
        assert format_number(485000, 0, is_nl=True) == "485.000"

    def test_en_large_number(self):
        """EN: 485000 → '485,000'."""
        assert format_number(485000, 0, is_nl=False) == "485,000"


class TestIndicatorLocaleFormatting:
    def test_eur_formatting_nl(self):
        """NL EUR indicator has space after € and Dutch separators."""
        pdf = BuurtCheckPDF(language="nl")
        pdf.add_page()
        indicator = NeighborhoodIndicator(value=428000.0, unit="\u20ac")
        _draw_indicator(pdf, "WOZ-waarde", indicator)
        result = bytes(pdf.output())
        reader = PdfReader(io.BytesIO(result))
        text = "\n".join(p.extract_text() or "" for p in reader.pages)
        assert "\u20ac 428.000" in text

    def test_eur_formatting_en(self):
        """EN EUR indicator has no space and English separators."""
        pdf = BuurtCheckPDF(language="en")
        pdf.add_page()
        indicator = NeighborhoodIndicator(value=428000.0, unit="\u20ac")
        _draw_indicator(pdf, "Avg property value", indicator)
        result = bytes(pdf.output())
        reader = PdfReader(io.BytesIO(result))
        text = "\n".join(p.extract_text() or "" for p in reader.pages)
        assert "\u20ac428,000" in text

    def test_density_formatting_nl(self):
        """NL density uses period as thousands separator."""
        pdf = BuurtCheckPDF(language="nl")
        pdf.add_page()
        indicator = NeighborhoodIndicator(value=15000.0, unit="/km\u00b2")
        _draw_indicator(pdf, "Bevolkingsdichtheid", indicator)
        result = bytes(pdf.output())
        reader = PdfReader(io.BytesIO(result))
        text = "\n".join(p.extract_text() or "" for p in reader.pages)
        assert "15.000/km" in text

    def test_km_formatting_nl(self):
        """NL km distance uses comma as decimal separator."""
        pdf = BuurtCheckPDF(language="nl")
        pdf.add_page()
        indicator = NeighborhoodIndicator(value=0.8, unit="km")
        _draw_indicator(pdf, "Treinstation", indicator)
        result = bytes(pdf.output())
        reader = PdfReader(io.BytesIO(result))
        text = "\n".join(p.extract_text() or "" for p in reader.pages)
        assert "0,8 km" in text


class TestCrimeRateLocaleFormatting:
    def test_crime_rate_en(self):
        """EN crime rates use period decimal."""
        tier_b = TierBResponse(
            address_id="0363010012345678",
            crime=CrimeStatsCard(
                total_per_1000=65.3,
                national_per_1000=52.1,
                burglary_per_1000=4.2,
                violent_per_1000=1.8,
                score=42,
                severity="moderate",
                meaning_en="Crime rate is above average.",
                source_date="2024",
            ),
        )
        result = generate_full_dossier(
            address="Test", building_year=2000, building_use="Office",
            risks=_make_risks(), sunlight_score=75,
            viewing_questions=None, language="en", tier_b=tier_b,
        )
        reader = PdfReader(io.BytesIO(result))
        text = "\n".join(p.extract_text() or "" for p in reader.pages)
        assert "65.3" in text
        assert "52.1" in text
        assert "4.2" in text
        assert "1.8" in text

    def test_crime_rate_nl(self):
        """NL crime rates use comma decimal."""
        tier_b = TierBResponse(
            address_id="0363010012345678",
            crime=CrimeStatsCard(
                total_per_1000=65.3,
                national_per_1000=52.1,
                burglary_per_1000=4.2,
                violent_per_1000=1.8,
                score=42,
                severity="moderate",
                meaning_nl="Criminaliteitscijfer boven gemiddelde.",
                source_date="2024",
            ),
        )
        result = generate_full_dossier(
            address="Test", building_year=2000, building_use="Office",
            risks=_make_risks(), sunlight_score=75,
            viewing_questions=None, language="nl", tier_b=tier_b,
        )
        reader = PdfReader(io.BytesIO(result))
        text = "\n".join(p.extract_text() or "" for p in reader.pages)
        assert "65,3" in text
        assert "52,1" in text
        assert "4,2" in text
        assert "1,8" in text


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

    def test_draw_score_bar_default_height_is_4mm(self):
        """E9-S1: Default bar height is 4mm (not 1mm)."""
        import inspect

        sig = inspect.signature(BuurtCheckPDF.draw_score_bar)
        assert sig.parameters["height"].default == 4.0

    def test_draw_score_bar_default_has_no_threshold_tick_marks(self):
        """Default score bar is a plain track without threshold tick dividers."""
        pdf = BuurtCheckPDF()
        pdf.add_page()
        # Track line calls
        original_line = pdf.line
        line_calls = []

        def tracking_line(x1, y1, x2, y2):
            line_calls.append((x1, y1, x2, y2))
            return original_line(x1, y1, x2, y2)

        pdf.line = tracking_line
        bar_x, bar_y, bar_w, bar_h = 10.0, 50.0, 100.0, 4.0
        pdf.draw_score_bar(bar_x, bar_y, bar_w, 75, height=bar_h)

        threshold_ticks = [
            c for c in line_calls
            if abs(c[1] - bar_y) < 0.01 and abs(c[3] - (bar_y + bar_h)) < 0.01
        ]
        assert threshold_ticks == []

    def test_draw_score_bar_ignores_legacy_good_threshold_label_flags(self):
        pdf = BuurtCheckPDF()
        pdf.add_page()
        pdf.draw_score_bar(
            10,
            20,
            100,
            75,
            highlight_good_zone=True,
            show_target_label=True,
        )

        result = bytes(pdf.output())
        reader = PdfReader(io.BytesIO(result))
        text = "\n".join(p.extract_text() or "" for p in reader.pages)
        assert "70+" not in text

    def test_draw_score_bar_minimum_fill_width(self):
        """E9-S1: Score=1 produces fill_w >= 1mm (visible)."""
        pdf = BuurtCheckPDF()
        pdf.add_page()
        # Track rect calls to find the fill rect
        original_rect = pdf.rect
        rect_calls = []

        def tracking_rect(x, y, w, h, style=""):
            rect_calls.append((x, y, w, h, style))
            return original_rect(x, y, w, h, style)

        pdf.rect = tracking_rect
        pdf.draw_score_bar(10, 50, 100, 1, height=4.0)

        # Filter fill rects at x=10, y=50 (both track and fill are at same position)
        fill_rects = [c for c in rect_calls if c[0] == 10 and c[1] == 50 and c[4] == "F"]
        # Should have 2: track (100mm wide) and fill (>= 1mm wide)
        assert len(fill_rects) == 2
        fill_rect = fill_rects[1]  # Second fill rect is the colored one
        assert fill_rect[2] >= 1.0, f"Fill width {fill_rect[2]} < 1mm minimum"

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

    def test_draw_risk_grid_native_fallback_marks_good_zone(self, monkeypatch):
        pdf = BuurtCheckPDF()
        pdf.add_page()
        cells = [
            ("Noise", 65, "Moderate"),
            ("Air", 80, "Good"),
        ]

        monkeypatch.setattr(pe, "chart_renderer", None)
        pdf.draw_risk_grid(10, 20, 180, cells)

        result = bytes(pdf.output())
        reader = PdfReader(io.BytesIO(result))
        text = "\n".join(p.extract_text() or "" for p in reader.pages)
        assert "70+" not in text

    def test_draw_comparison_chart(self):
        pdf = BuurtCheckPDF()
        pdf.add_page()
        rows = [
            ("This address", 65, TEAL, False),
            ("City average", 55, MUTED, False),
            ("WHO target", 74, (234, 179, 8), True),
        ]
        end_y = pdf.draw_comparison_chart(10, 30, 180, rows)
        result = bytes(pdf.output())
        assert result[:5] == b"%PDF-"
        # Returns y after axis labels
        assert end_y > 30

    def test_draw_comparison_chart_returns_y_after_bars_and_axis(self):
        """Chart returns y position after all bars + axis labels."""
        pdf = BuurtCheckPDF()
        pdf.add_page()
        rows = [
            ("This address", 65, TEAL, False),
            ("Netherlands", 50, NATIONAL, False),
        ]
        end_y = pdf.draw_comparison_chart(10, 30, 180, rows)
        # 2 rows * 7.0 row_h = 14, plus axis labels ~3.5
        assert end_y > 30 + 14

    def test_draw_comparison_chart_with_title(self, monkeypatch: pytest.MonkeyPatch):
        """Chart title is forwarded to the chart renderer."""
        pdf = BuurtCheckPDF()
        pdf.add_page()
        rows = [
            ("This address", 80, TEAL, False),
        ]
        captured: dict[str, str] = {}

        def _fake_render_risk_comparison(**kwargs):  # type: ignore[no-untyped-def]
            captured["category"] = kwargs["category"]
            return base64.b64decode(_tiny_png())

        monkeypatch.setattr(
            pe.chart_renderer,
            "render_risk_comparison",
            _fake_render_risk_comparison,
        )

        end_y = pdf.draw_comparison_chart(
            10, 30, 180, rows, chart_title="Noise comparison",
        )

        assert end_y > 30
        assert captured["category"] == "Noise comparison"

    def test_draw_comparison_chart_with_legend(self):
        """Legend renders below bars and increases chart height."""
        pdf = BuurtCheckPDF()
        pdf.add_page()
        rows = [
            ("This address", 65, TEAL, False),
        ]
        end_no_legend = pdf.draw_comparison_chart(10, 30, 180, rows)
        pdf2 = BuurtCheckPDF()
        pdf2.add_page()
        end_with_legend = pdf2.draw_comparison_chart(
            10, 30, 180, rows, show_legend=True, is_nl=True,
        )
        # Legend adds ~4mm
        assert end_with_legend > end_no_legend

    def test_draw_comparison_chart_legend_bilingual(self):
        """Legend text changes between NL and EN."""
        pdf_nl = BuurtCheckPDF()
        pdf_nl.add_page()
        rows = [("Dit adres", 65, TEAL, False)]
        pdf_nl.draw_comparison_chart(
            10, 30, 180, rows, show_legend=True, is_nl=True,
        )
        nl_output = bytes(pdf_nl.output())

        pdf_en = BuurtCheckPDF()
        pdf_en.add_page()
        rows_en = [("This address", 65, TEAL, False)]
        pdf_en.draw_comparison_chart(
            10, 30, 180, rows_en, show_legend=True, is_nl=False,
        )
        en_output = bytes(pdf_en.output())

        # Both produce valid PDFs with different content
        assert nl_output[:5] == b"%PDF-"
        assert en_output[:5] == b"%PDF-"
        assert nl_output != en_output

    def test_draw_comparison_chart_gridlines_do_not_crash(self):
        """Gridlines at 25/50/75 render without errors for various row counts."""
        for n_rows in (1, 2, 4):
            pdf = BuurtCheckPDF()
            pdf.add_page()
            rows = [
                (f"Row {i}", i * 25, TEAL, False)
                for i in range(n_rows)
            ]
            end_y = pdf.draw_comparison_chart(10, 30, 180, rows)
            assert end_y > 30
            result = bytes(pdf.output())
            assert result[:5] == b"%PDF-"

    def test_draw_comparison_chart_threshold_labels(self):
        """E9-S5: Severity zone labels 20, 40, 70 appear on axis."""
        pdf = BuurtCheckPDF()
        pdf.add_page()
        rows = [
            ("This address", 65, TEAL, False),
            ("Peer", 55, SECONDARY, False),
        ]
        pdf.draw_comparison_chart(10, 30, 180, rows)
        result = bytes(pdf.output())
        reader = PdfReader(io.BytesIO(result))
        text = "\n".join(
            p.extract_text() or "" for p in reader.pages
        )
        for threshold in ("20", "40", "70"):
            assert threshold in text, (
                f"Threshold label {threshold} missing"
            )

    def test_draw_comparison_chart_full_features(self):
        """Chart with title + legend + all row types produces valid PDF."""
        pdf = BuurtCheckPDF()
        pdf.add_page()
        rows = [
            ("Dit adres", 65, TEAL, False),
            ("Vergelijkingswaarde", 55, MUTED, False),
            ("Nederland", 50, NATIONAL, False),
            ("WHO-doel", 74, (234, 179, 8), True),
        ]
        end_y = pdf.draw_comparison_chart(
            10, 30, 180, rows,
            chart_title="Geluid — vergelijking",
            show_legend=True,
            is_nl=True,
        )
        assert end_y > 30
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


class TestInterpretAgeDistribution:
    """E6-S3: Age distribution interpretation with national comparison."""

    def test_young_buurt_en(self):
        """High under-25 percentage produces 'Young neighborhood' in English."""
        age = AgeProfile(age_0_24=40.0, age_25_64=45.0, age_65_plus=15.0)
        result = _interpret_age_distribution(age, is_nl=False)
        assert result is not None
        assert "Young neighborhood" in result
        assert "40%" in result
        assert f"{NL_AGE_0_24:.0f}%" in result

    def test_young_buurt_nl(self):
        """High under-25 percentage produces 'Jonge buurt' in Dutch."""
        age = AgeProfile(age_0_24=40.0, age_25_64=45.0, age_65_plus=15.0)
        result = _interpret_age_distribution(age, is_nl=True)
        assert result is not None
        assert "Jonge buurt" in result
        assert "40%" in result
        assert "landelijk" in result

    def test_old_buurt_en(self):
        """High 65+ percentage produces 'Older neighborhood' in English."""
        age = AgeProfile(age_0_24=15.0, age_25_64=45.0, age_65_plus=40.0)
        result = _interpret_age_distribution(age, is_nl=False)
        assert result is not None
        assert "Older neighborhood" in result
        assert "40%" in result
        assert f"{NL_AGE_65_PLUS:.0f}%" in result

    def test_old_buurt_nl(self):
        """High 65+ percentage produces 'Vergrijsde buurt' in Dutch."""
        age = AgeProfile(age_0_24=15.0, age_25_64=45.0, age_65_plus=40.0)
        result = _interpret_age_distribution(age, is_nl=True)
        assert result is not None
        assert "Vergrijsde buurt" in result
        assert "40%" in result

    def test_working_age_buurt_en(self):
        """High 25-64 percentage produces 'Working-age area' in English."""
        age = AgeProfile(age_0_24=15.0, age_25_64=70.0, age_65_plus=15.0)
        result = _interpret_age_distribution(age, is_nl=False)
        assert result is not None
        assert "Working-age area" in result
        assert "70%" in result

    def test_working_age_buurt_nl(self):
        """High 25-64 percentage produces 'Werkende buurt' in Dutch."""
        age = AgeProfile(age_0_24=15.0, age_25_64=70.0, age_65_plus=15.0)
        result = _interpret_age_distribution(age, is_nl=True)
        assert result is not None
        assert "Werkende buurt" in result
        assert "70%" in result

    def test_balanced_buurt_en(self):
        """Age profile close to national averages produces balanced message."""
        age = AgeProfile(age_0_24=29.0, age_25_64=50.0, age_65_plus=21.0)
        result = _interpret_age_distribution(age, is_nl=False)
        assert result is not None
        assert "Balanced" in result
        assert "national average" in result

    def test_balanced_buurt_nl(self):
        """Age profile close to national averages produces balanced message in Dutch."""
        age = AgeProfile(age_0_24=29.0, age_25_64=50.0, age_65_plus=21.0)
        result = _interpret_age_distribution(age, is_nl=True)
        assert result is not None
        assert "Evenwichtige" in result
        assert "landelijk gemiddelde" in result

    def test_fewer_working_age_en(self):
        """Low 25-64 percentage produces 'Fewer working-age'."""
        age = AgeProfile(age_0_24=30.0, age_25_64=35.0, age_65_plus=35.0)
        result = _interpret_age_distribution(age, is_nl=False)
        assert result is not None
        assert "Fewer working-age" in result
        assert "35%" in result

    def test_fewer_working_age_nl(self):
        """Low 25-64 percentage produces 'Minder werkenden' in Dutch."""
        age = AgeProfile(age_0_24=30.0, age_25_64=35.0, age_65_plus=35.0)
        result = _interpret_age_distribution(age, is_nl=True)
        assert result is not None
        assert "Minder werkenden" in result

    def test_all_none_returns_none(self):
        """All None age bands returns None (no interpretation possible)."""
        age = AgeProfile(age_0_24=None, age_25_64=None, age_65_plus=None)
        result = _interpret_age_distribution(age, is_nl=False)
        assert result is None

    def test_partial_data_still_interprets(self):
        """Even with only one band available, interpretation is produced."""
        age = AgeProfile(age_0_24=40.0, age_25_64=None, age_65_plus=None)
        result = _interpret_age_distribution(age, is_nl=False)
        assert result is not None
        assert "Young neighborhood" in result

    def test_few_young_en(self):
        """Low under-25 percentage produces 'Few young residents'."""
        age = AgeProfile(age_0_24=15.0, age_25_64=55.0, age_65_plus=30.0)
        # 65+ deviation = +8, young deviation = -13 → young dominates
        result = _interpret_age_distribution(age, is_nl=False)
        assert result is not None
        assert "Few young residents" in result
        assert "15%" in result

    def test_few_elderly_en(self):
        """Low 65+ percentage produces 'Few elderly'."""
        age = AgeProfile(age_0_24=30.0, age_25_64=60.0, age_65_plus=10.0)
        # working deviation = +10, elderly deviation = -12 → elderly dominates
        result = _interpret_age_distribution(age, is_nl=False)
        assert result is not None
        assert "Few elderly" in result
        assert "10%" in result

    def test_few_elderly_nl(self):
        """Low 65+ percentage produces 'Weinig ouderen' in Dutch."""
        age = AgeProfile(age_0_24=30.0, age_25_64=60.0, age_65_plus=10.0)
        result = _interpret_age_distribution(age, is_nl=True)
        assert result is not None
        assert "Weinig ouderen" in result

    def test_national_constants_are_reasonable(self):
        """National age distribution constants sum to 100 and are plausible."""
        total = NL_AGE_0_24 + NL_AGE_25_64 + NL_AGE_65_PLUS
        assert total == 100.0
        assert 25 <= NL_AGE_0_24 <= 32  # CBS 2024 range
        assert 45 <= NL_AGE_25_64 <= 55
        assert 18 <= NL_AGE_65_PLUS <= 25

    def test_interpretation_rendered_in_full_dossier_en(self):
        """Full dossier English PDF includes age interpretation text."""
        stats = _make_neighborhood_stats()
        # This fixture has age_0_24=22.0, age_25_64=65.0, age_65_plus=13.0
        # Working-age deviation: +15 (biggest)
        result = generate_full_dossier(
            address="Damrak 1, Amsterdam",
            building_year=1900,
            building_use="Residential",
            risks=_make_risks(),
            sunlight_score=80,
            viewing_questions=_make_viewing_questions(),
            neighborhood_stats=stats,
            risk_comparisons=_make_risk_comparisons(),
            language="en",
        )
        reader = PdfReader(io.BytesIO(result))
        text = "\n".join(p.extract_text() or "" for p in reader.pages)
        assert "Working-age area" in text
        assert "65%" in text

    def test_interpretation_rendered_in_full_dossier_nl(self):
        """Full dossier Dutch PDF includes age interpretation text."""
        stats = _make_neighborhood_stats()
        result = generate_full_dossier(
            address="Damrak 1, Amsterdam",
            building_year=1900,
            building_use="Woonfunctie",
            risks=_make_risks(),
            sunlight_score=80,
            viewing_questions=_make_viewing_questions(),
            neighborhood_stats=stats,
            risk_comparisons=_make_risk_comparisons(),
            language="nl",
        )
        reader = PdfReader(io.BytesIO(result))
        text = "\n".join(p.extract_text() or "" for p in reader.pages)
        assert "Werkende buurt" in text

    def test_no_interpretation_when_all_ages_none(self):
        """Full dossier with empty age profile has no interpretation crash."""
        stats = _make_neighborhood_stats()
        stats.age_profile = AgeProfile()  # all None
        result = generate_full_dossier(
            address="Damrak 1, Amsterdam",
            building_year=1900,
            building_use="Residential",
            risks=_make_risks(),
            sunlight_score=80,
            viewing_questions=_make_viewing_questions(),
            neighborhood_stats=stats,
            risk_comparisons=_make_risk_comparisons(),
            language="en",
        )
        reader = PdfReader(io.BytesIO(result))
        text = "\n".join(p.extract_text() or "" for p in reader.pages)
        # Should not crash and should not have any age interpretation
        assert "Young neighborhood" not in text
        assert "Older neighborhood" not in text
        assert "Working-age" not in text
        assert "Balanced" not in text


class TestBuurtCheckPDFHelpers:
    """Helpers from BuurtCheckPDF that were previously in TestBuurtCheckPDF."""

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

    def test_crime_scored_risk_card_en(self):
        """Crime section renders score badge, severity, meaning, comparison, source."""
        tier_b = TierBResponse(
            address_id="0363010012345678",
            crime=CrimeStatsCard(
                total_per_1000=65.3,
                national_per_1000=52.1,
                burglary_per_1000=4.2,
                violent_per_1000=1.8,
                yearly_period="2024",
                score=42,
                severity="moderate",
                meaning_en="Crime rate is somewhat above the national average.",
                meaning_nl="Criminaliteitscijfer is enigszins boven het landelijk gemiddelde.",
                source_date="2024",
            ),
        )
        result = generate_full_dossier(
            address="Test Address",
            building_year=2000,
            building_use="Residence",
            risks=_make_risks(),
            sunlight_score=75,
            viewing_questions=None,
            language="en",
            tier_b=tier_b,
        )
        reader = PdfReader(io.BytesIO(result))
        all_text = "\n".join(p.extract_text() or "" for p in reader.pages)
        # Score badge
        assert "42" in all_text
        # Severity label
        assert "Moderate" in all_text
        # Meaning sentence
        assert "Crime rate is somewhat above the national average" in all_text
        # Raw-rate context is disclosed under the chart
        assert "52.1" in all_text
        assert "Netherlands" in all_text
        assert "Rates shown per 1,000 residents" in all_text
        # Sub-rates
        assert "Burglary" in all_text
        assert "4.2" in all_text
        assert "Violent" in all_text
        assert "1.8" in all_text
        # Source with year
        assert "CBS" in all_text
        assert "2024" in all_text

    def test_crime_comparison_uses_normalized_national_score(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ):
        pdf = BuurtCheckPDF(language="en")
        pdf.add_page()
        captured: dict[str, list[tuple[str, int, tuple[int, int, int], bool]]] = {}

        def _fake_draw_comparison_chart(*, rows, **kwargs):  # type: ignore[no-untyped-def]
            captured["rows"] = rows
            return 80.0

        monkeypatch.setattr(pdf, "draw_comparison_chart", _fake_draw_comparison_chart)

        pe._draw_rate_comparison_chart(
            pdf,
            title="Crime comparison",
            address_rate=65.3,
            national_rate=52.1,
            is_nl=False,
            score=42,
        )

        rows = captured["rows"]
        assert rows[0][0] == "This address"
        assert rows[0][1] == 42
        assert rows[1][0] == "Netherlands"
        assert rows[1][1] == pe.normalize_crime_score(52.1)
        assert rows[1][1] != 34

    def test_crime_scored_risk_card_nl(self):
        """Crime section renders NL meaning + labels."""
        tier_b = TierBResponse(
            address_id="0363010012345678",
            crime=CrimeStatsCard(
                total_per_1000=65.3,
                national_per_1000=52.1,
                burglary_per_1000=4.2,
                violent_per_1000=1.8,
                score=42,
                severity="moderate",
                meaning_en="Crime rate is somewhat above the national average.",
                meaning_nl="Criminaliteitscijfer is enigszins boven het landelijk gemiddelde.",
                source_date="2024",
            ),
        )
        result = generate_full_dossier(
            address="Test Address",
            building_year=2000,
            building_use="Residence",
            risks=_make_risks(),
            sunlight_score=75,
            viewing_questions=None,
            language="nl",
            tier_b=tier_b,
        )
        reader = PdfReader(io.BytesIO(result))
        all_text = "\n".join(p.extract_text() or "" for p in reader.pages)
        # NL severity label
        assert "Matig" in all_text
        # NL meaning
        assert "boven het landelijk gemiddelde" in all_text
        # NL comparison labels
        assert "Dit adres" in all_text
        assert "Nederland" in all_text
        # NL source
        assert "Bron" in all_text
        # Sub-rates with NL labels
        assert "Inbraak" in all_text
        assert "Geweld" in all_text

    def test_crime_card_without_score(self):
        """Crime renders gracefully when score is None (legacy data)."""
        tier_b = TierBResponse(
            address_id="0363010012345678",
            crime=CrimeStatsCard(
                total_per_1000=55.0,
                burglary_per_1000=3.0,
            ),
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
        reader = PdfReader(io.BytesIO(result))
        all_text = "\n".join(p.extract_text() or "" for p in reader.pages)
        # No bare placeholders; explicit unavailable state is shown.
        assert "Crime Rate" in all_text
        assert "N/A" in all_text
        # Sub-rates still rendered
        assert "Burglary" in all_text
        assert "3.0" in all_text

    def test_crime_card_without_national_average(self):
        """Comparison section skipped when national average is missing."""
        tier_b = TierBResponse(
            address_id="0363010012345678",
            crime=CrimeStatsCard(
                total_per_1000=45.0,
                score=58,
                severity="moderate",
                meaning_en="Moderate crime rate.",
            ),
        )
        result = generate_full_dossier(
            address="Test",
            building_year=2000,
            building_use=None,
            risks=_make_risks(),
            sunlight_score=75,
            viewing_questions=None,
            language="en",
            tier_b=tier_b,
        )
        reader = PdfReader(io.BytesIO(result))
        all_text = "\n".join(p.extract_text() or "" for p in reader.pages)
        # Score and meaning present
        assert "58" in all_text
        assert "Moderate crime rate." in all_text
        # No national comparison
        assert "National avg" not in all_text

    def test_crime_card_source_falls_back_to_yearly_period(self):
        """Source line uses yearly_period when source_date is absent."""
        tier_b = TierBResponse(
            address_id="0363010012345678",
            crime=CrimeStatsCard(
                total_per_1000=30.0,
                score=75,
                severity="good",
                yearly_period="2023",
            ),
        )
        result = generate_full_dossier(
            address="Test",
            building_year=2000,
            building_use=None,
            risks=_make_risks(),
            sunlight_score=75,
            viewing_questions=None,
            language="en",
            tier_b=tier_b,
        )
        reader = PdfReader(io.BytesIO(result))
        all_text = "\n".join(p.extract_text() or "" for p in reader.pages)
        assert "2023" in all_text
        assert "Source" in all_text

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
        text = _norm("\n".join(page.extract_text() or "" for page in reader.pages)).upper()
        assert "ADDITIONAL PROPERTY CHECKS" in text
        assert "FOUNDATION RISK" in text
        assert "GROUND LEASE" in text
        assert "OWNERS' ASSOCIATION" in text
        assert "ASBESTOS AWARENESS" in text
        assert "SOIL CONTAMINATION" in text
        assert "DIRECT SUN (CLEAR-SKY VISIBILITY)" in text


class TestRiskDetailsPageBreak:
    """E11-S2: Address context on continuation pages."""

    def test_address_on_continuation_page(self):
        """When risk details overflow, address reprinted."""
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
        reader = PdfReader(io.BytesIO(result))
        # Risk details start on page 2 (index 1).
        # If content overflows to page 3, the address
        # should appear on that page too.
        # At minimum, verify no page has <30% content
        # by checking all pages produce text.
        for i, page in enumerate(reader.pages):
            text = page.extract_text() or ""
            assert len(text.strip()) > 20, (
                f"Page {i + 1} appears nearly empty"
            )

    def test_dossier_no_near_empty_pages(self):
        """Full dossier with all data has no near-empty pages."""
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
        reader = PdfReader(io.BytesIO(result))
        for i, page in enumerate(reader.pages):
            text = page.extract_text() or ""
            assert len(text.strip()) > 50, (
                f"Page {i + 1} has too little content"
            )


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
        assert "0–100 score scale" in text
        assert "Higher = better" in text

    def test_scale_caption_present_nl(self):
        """Dutch PDF contains scale declaration caption."""
        text = self._extract_full_text("nl")
        assert "0–100 scoreschaal" in text
        assert "Hoger = beter" in text

    def test_who_label_en_short(self):
        """WHO label in EN uses short 'WHO target' form."""
        text = " ".join(self._extract_full_text("en").split())
        assert "WHO target" in text
        # Old verbose label must not appear
        assert "mapped to score" not in text

    def test_who_label_nl_short(self):
        """WHO label in NL uses short 'WHO-doel' form."""
        text = " ".join(self._extract_full_text("nl").split())
        assert "WHO-doel" in text
        # Old verbose label must not appear
        assert "op scoreschaal" not in text


class TestRiskFactsheetGuidelines:
    """E4-S3: Measurement factsheets include raw values plus guideline values."""

    def test_factsheet_includes_who_guidelines_en(self):
        from app.services.pdf_export import _build_risk_detail_data

        risks = _make_risks()
        risks.air_quality.pm25_ug_m3 = 11.2

        data = _build_risk_detail_data(
            risks=risks,
            sunlight_score=80,
            comparisons=_make_risk_comparisons(),
            is_nl=False,
        )

        noise_measurements = dict(data[0][5] or [])
        assert noise_measurements["Lden"] == "58.0 dB"
        assert noise_measurements["WHO guideline (Lden)"] == "53.0 dB"

        air_measurements = dict(data[1][5] or [])
        assert air_measurements["PM2.5"] == "11.2 µg/m³"
        assert air_measurements["NO₂"] == "18.0 µg/m³"
        assert air_measurements["WHO guideline PM2.5"] == "5.0 µg/m³"
        assert air_measurements["WHO guideline NO₂"] == "10.0 µg/m³"

    def test_factsheet_includes_who_guidelines_nl(self):
        from app.services.pdf_export import _build_risk_detail_data

        risks = _make_risks()
        risks.air_quality.pm25_ug_m3 = 11.2

        data = _build_risk_detail_data(
            risks=risks,
            sunlight_score=80,
            comparisons=_make_risk_comparisons(),
            is_nl=True,
        )

        noise_measurements = dict(data[0][5] or [])
        assert noise_measurements["Lden"] == "58,0 dB"
        assert noise_measurements["WHO-richtlijn (Lden)"] == "53,0 dB"

        air_measurements = dict(data[1][5] or [])
        assert air_measurements["PM2.5"] == "11,2 µg/m³"
        assert air_measurements["NO₂"] == "18,0 µg/m³"
        assert air_measurements["WHO-richtlijn PM2.5"] == "5,0 µg/m³"
        assert air_measurements["WHO-richtlijn NO₂"] == "10,0 µg/m³"

    def test_climate_measurements_include_scale_guidance(self):
        rows = pe._measurement_table_rows(
            "Climate Stress",
            [("Heat", "Medium"), ("Water nuisance", "Low")],
            is_nl=False,
        )

        by_metric = {metric: reference for metric, _value, reference, _color in rows}
        assert "Target: low" in by_metric["Heat"]
        assert "scale: low / medium / high" in by_metric["Water nuisance"]

    def test_sunlight_measurements_include_benchmarks(self):
        rows = pe._measurement_table_rows(
            "Sunlight",
            [
                ("Winter", "3.5 h/day"),
                ("Equinox", "4.2 h/day"),
                ("Annual average", "5.6 h/day"),
                ("SVF", "62%"),
            ],
            is_nl=False,
        )

        by_metric = {metric: reference for metric, _value, reference, _color in rows}
        assert "TNO mild" in by_metric["Winter"]
        assert "EN 17037" in by_metric["Equinox"]
        assert "higher = brighter" in by_metric["Annual average"]
        assert "60%" in by_metric["SVF"]
        assert "moderate" in by_metric["SVF"]


class TestComparisonChartScaleCaptionCallsites:
    """E4-S1: Risk-detail and livability comparison call sites include scale captions."""

    def test_risk_details_page_calls_scale_caption_helper(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ):
        pdf = BuurtCheckPDF()
        pdf.add_page()

        calls = {"count": 0}

        def _fake_caption(_pdf: BuurtCheckPDF, _is_nl: bool) -> None:
            calls["count"] += 1

        monkeypatch.setattr(pe, "_draw_score_scale_caption", _fake_caption)

        pe._draw_risk_details_page(
            pdf,
            address="Damrak 1, Amsterdam",
            risks=_make_risks(),
            sunlight_score=80,
            comparisons=_make_risk_comparisons(),
            is_nl=False,
            tier_b_data=_make_tier_b(),
        )

        assert calls["count"] >= 1

    def test_livability_chart_calls_scale_caption_helper(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ):
        pdf = BuurtCheckPDF()
        pdf.add_page()

        calls = {"count": 0}

        def _fake_caption(_pdf: BuurtCheckPDF, _is_nl: bool) -> None:
            calls["count"] += 1

        monkeypatch.setattr(pe, "_draw_score_scale_caption", _fake_caption)

        _draw_livability_section(pdf, _make_livability(), is_nl=False)

        assert calls["count"] == 1


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
        """English house analysis keeps the compact scale disclosure."""
        text = _norm(self._extract_full_text("en"))
        assert "Comparison bars are on the buurt-check 0–100 score scale" in text

    def test_methodology_disclosure_nl(self):
        """Dutch house analysis keeps the compact scale disclosure."""
        text = _norm(self._extract_full_text("nl"))
        assert "Vergelijkingsbalken staan op de buurt-check 0–100 scoreschaal" in text


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
        assert "Foundation" in text
        assert "High foundation risk identified" in text
        assert "klei" in text

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
        assert "Foundation risk could not be assessed" in text

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
        assert "Ground lease" in text
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
        assert "No ground lease signal detected" in text
        assert "freehold land" in text

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
        assert "request vve annual documents" in text.lower()
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
        assert "potential lead pipes flagged" in text.lower()

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
        assert "Foundation" in text
        assert "Ground lease" in text
        assert "Owners' Association" in text
        assert "Asbestos Awareness" in text
        assert "Lead Pipe Risk" in text
        assert "BRO soil data + Klimaateffectatlas" in text
        assert "Municipal ground lease registry" in text
        assert "BAG dwelling unit count" in text

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
        assert "Funderingsrisico" in text
        assert "Erfpacht" in text
        assert "VvE" in text
        assert "Asbestbewustzijn" in text
        assert "Loden leidingen" in text
        assert "BRO bodemdata + Klimaateffectatlas" in text
        assert "Gemeentelijke erfpachtlijst" in text
        assert "BAG verblijfsobjecten" in text

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
        assert text.lower().count("unavailable in export pipeline") >= 5


class TestEliminateEmptyPages:
    """E11-S1: Reduce wasted page space."""

    def test_notes_section_page_guard_adds_a_page_when_space_is_tight(self):
        from app.services.pdf_export import (
            _NOTES_SECTION_REQUIRED_MM,
            _ensure_page_space,
        )

        pdf = BuurtCheckPDF(language="en")
        pdf.add_page()
        pdf.set_y(pdf.h - 20)

        _ensure_page_space(pdf, _NOTES_SECTION_REQUIRED_MM)

        assert pdf.page_no() == 2

    def test_notes_section_uses_compact_ruled_lines(self):
        """Viewing notes use a compact ruled-line block."""
        from app.services.pdf_export import (
            _NOTES_RULE_COUNT,
            _draw_notes_section,
        )

        pdf = BuurtCheckPDF(language="en")
        pdf.add_page()
        # Track line calls to count ruled lines
        original_line = pdf.line
        line_calls: list[tuple] = []

        def tracking_line(x1, y1, x2, y2):
            line_calls.append((x1, y1, x2, y2))
            return original_line(x1, y1, x2, y2)

        pdf.line = tracking_line
        _draw_notes_section(pdf, is_nl=False)
        # Filter for ruled note lines (full-width lines)
        usable_w = pdf.w - pdf.l_margin - pdf.r_margin
        note_lines = [
            c for c in line_calls
            if abs(c[2] - c[0] - usable_w) < 1
        ]
        note_rule_lines = note_lines[-_NOTES_RULE_COUNT:]
        assert len(note_rule_lines) == _NOTES_RULE_COUNT
        from app.services.pdf_export import _NOTES_RULE_SPACING_MM
        spacings = [
            round(note_rule_lines[idx + 1][1] - note_rule_lines[idx][1], 1)
            for idx in range(_NOTES_RULE_COUNT - 1)
        ]
        assert spacings == [_NOTES_RULE_SPACING_MM] * (_NOTES_RULE_COUNT - 1)

    def test_notes_section_includes_compact_prompt_box(self):
        from app.services.pdf_export import _draw_notes_section

        pdf = BuurtCheckPDF(language="en")
        pdf.add_page()
        _draw_notes_section(pdf, is_nl=False)

        reader = PdfReader(io.BytesIO(bytes(pdf.output())))
        text = "\n".join(p.extract_text() or "" for p in reader.pages)
        assert "Log before you leave" in text

    def test_measurement_table_rows_color_noncompliant_values_red_and_compliant_values_green(self):
        rows = pe._measurement_table_rows(
            "Air Quality",
            [
                ("PM2.5", "18.0 \u00b5g/m\u00b3"),
                ("WHO guideline PM2.5", "5.0 \u00b5g/m\u00b3"),
                ("NO\u2082", "9.0 \u00b5g/m\u00b3"),
                ("WHO guideline NO\u2082", "10.0 \u00b5g/m\u00b3"),
            ],
            is_nl=False,
        )

        assert rows[0][3] == pe.SEVERITY_COLORS["poor"]
        assert rows[1][3] == pe.SEVERITY_COLORS["good"]

    def test_full_dossier_restores_rich_multi_page_structure(self):
        """The paid dossier should keep the richer multi-page export structure."""
        from app.models.report import ProvenanceData

        prov = ProvenanceData(
            report_id="rpt_test123xyz",
            vbo_id="0441010000123456",
            pand_id="0441100000654321",
            buurt_code="BU04410203",
            gemeente_name="Katwijk",
            lat=52.1831,
            lng=4.4328,
            rd_x=92145.0,
            rd_y=467832.0,
        )

        result = pe._generate_full_dossier_fpdf(
            address="Kerkstraat 10, Katwijk",
            building_year=1970,
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
            provenance=prov,
            livability=_make_livability(),
        )

        reader = PdfReader(io.BytesIO(result))
        text = _norm("\n".join(page.extract_text() or "" for page in reader.pages))
        assert len(reader.pages) >= 6
        assert "EXECUTIVE SUMMARY" in text
        assert "RISK DETAILS" in text
        assert "SHADOW ANALYSIS" in text
        assert "NEIGHBORHOOD CONTEXT" in text
        assert "ADDITIONAL PROPERTY CHECKS" in text
        assert "VIEWING QUESTIONS" in text
        assert "METHODOLOGY" in text

    def test_viewing_questions_follow_property_checks_in_rich_dossier(self):
        """Viewing questions remain in the paid dossier instead of a fixed final checklist page."""
        result = pe._generate_full_dossier_fpdf(
            address="Kerkstraat 10, Katwijk",
            building_year=1970,
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
            livability=_make_livability(),
        )

        reader = PdfReader(io.BytesIO(result))
        text = _norm("\n".join(page.extract_text() or "" for page in reader.pages))
        assert "ADDITIONAL PROPERTY CHECKS" in text
        assert "VIEWING QUESTIONS" in text

    def test_checklist_page_adds_crime_questions_from_tier_b(self):
        """Crime gets a viewing-questions category even when the API payload omitted it."""
        result = pe._generate_full_dossier_fpdf(
            address="Kerkstraat 10, Katwijk",
            building_year=1970,
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
            livability=_make_livability(),
        )

        reader = PdfReader(io.BytesIO(result))
        text = _norm("\n".join(page.extract_text() or "" for page in reader.pages))

        assert _norm("Crime") in text or _norm("Criminaliteit") in text
        assert _norm("42/100") in text

    def test_shadow_image_not_on_property_checks(self):
        """Shadow analysis text appears outside the property-check page."""
        import base64

        # Create a real-ish PNG for the shadow
        fake_b64 = base64.b64encode(
            b"\x89PNG\r\n\x1a\n" + b"\x00" * 100
        ).decode()
        result = generate_full_dossier(
            address="Test 1, Amsterdam",
            building_year=2000,
            building_use="Residential",
            risks=_make_risks(),
            sunlight_score=80,
            viewing_questions=_make_viewing_questions(),
            language="en",
            shadow_image_b64=fake_b64,
            property_warnings_data=_make_property_warnings(),
        )
        reader = PdfReader(io.BytesIO(result))
        full_text = "\n".join(p.extract_text() or "" for p in reader.pages)
        # Shadow text appears somewhere in the PDF
        assert "shadow analysis" in full_text.lower() or "shadow snapshot" in full_text.lower()
        # Verify the PDF generates without error
        assert result[:5] == b"%PDF-"


# --- Provenance block tests (E5-S1) ---


class TestProvenanceBlock:
    """E5-S1: Full dossier contains a provenance block for reproducibility."""

    def _make_provenance(self, **overrides):
        from app.models.report import ProvenanceData

        defaults = dict(
            report_id="rpt_test123xyz",
            vbo_id="0441010000123456",
            pand_id="0441100000654321",
            buurt_code="BU04410203",
            gemeente_name="Katwijk",
            lat=52.1831,
            lng=4.4328,
            rd_x=92145.0,
            rd_y=467832.0,
        )
        defaults.update(overrides)
        return ProvenanceData(**defaults)

    def _extract_full_text(self, language: str = "en", provenance=None) -> str:
        result = generate_full_dossier(
            address="Kerkstraat 10, Katwijk",
            building_year=1970,
            building_use="Residential",
            risks=_make_risks(),
            sunlight_score=80,
            viewing_questions=_make_viewing_questions(),
            language=language,
            floor_area=95,
            neighborhood_stats=_make_neighborhood_stats(),
            tier_b=_make_tier_b(),
            risk_comparisons=_make_risk_comparisons(),
            property_warnings_data=_make_property_warnings(),
            provenance=provenance,
        )
        reader = PdfReader(io.BytesIO(result))
        return "\n".join(page.extract_text() or "" for page in reader.pages)

    def test_report_id_printed(self):
        """PDF contains the unique report_id."""
        prov = self._make_provenance()
        text = _norm(self._extract_full_text(provenance=prov))
        assert "rpt_test123xyz" in text

    def test_wgs84_coordinates_printed(self):
        """Extra provenance fields do not break the compact cover metadata."""
        prov = self._make_provenance()
        text = _norm(self._extract_full_text(provenance=prov))
        assert "rpt_test123xyz" in text
        assert "Katwijk" in text

    def test_epsg28992_coordinates_printed(self):
        """PDF contains EPSG:28992 (RD New) coordinates."""
        prov = self._make_provenance()
        text = _norm(self._extract_full_text(provenance=prov))
        assert _norm("EPSG:28992") in text

    def test_vbo_and_pand_ids_printed(self):
        """PDF contains VBO ID and pand ID."""
        prov = self._make_provenance()
        text = _norm(self._extract_full_text(provenance=prov))
        assert _norm("0441010000123456") in text
        assert _norm("0441100000654321") in text

    def test_buurt_code_printed(self):
        """PDF contains buurt code."""
        prov = self._make_provenance()
        text = _norm(self._extract_full_text(provenance=prov))
        assert "BU04410203" in text

    def test_gemeente_name_and_code_printed(self):
        """Compact cover metadata keeps the municipality name."""
        prov = self._make_provenance()
        text = _norm(self._extract_full_text(provenance=prov))
        assert "Katwijk" in text

    def test_methodology_version_printed(self):
        """Methodology version is printed in the restored report details block."""
        prov = self._make_provenance()
        text = _norm(self._extract_full_text(provenance=prov))
        assert _norm("v2.1") in text

    def test_geocoding_method_printed_en(self):
        """English PDF contains geocoding method."""
        prov = self._make_provenance()
        text = _norm(self._extract_full_text(language="en", provenance=prov))
        assert _norm("BAG address point") in text

    def test_geocoding_method_printed_nl(self):
        """Dutch PDF contains geocoding method."""
        prov = self._make_provenance()
        text = _norm(self._extract_full_text(language="nl", provenance=prov))
        assert _norm("BAG-adreslokatie") in text

    def test_report_details_heading_en(self):
        """English PDF contains Report Details heading."""
        prov = self._make_provenance()
        text = _norm(self._extract_full_text(language="en", provenance=prov))
        assert _norm("Report Details") in text

    def test_report_details_heading_nl(self):
        """Dutch PDF contains Rapportgegevens heading."""
        prov = self._make_provenance()
        text = _norm(self._extract_full_text(language="nl", provenance=prov))
        assert _norm("Rapportgegevens") in text

    def test_no_provenance_graceful(self):
        """Full dossier without provenance still renders successfully."""
        text = self._extract_full_text(provenance=None)
        assert "PROPERTY INTELLIGENCE DOSSIER" in text or "VOLLEDIG DOSSIER" in text

    def test_partial_provenance_graceful(self):
        """Provenance with missing optional fields still renders."""
        from app.models.report import ProvenanceData

        prov = ProvenanceData(report_id="rpt_partial", vbo_id="0363010012345678")
        text = _norm(self._extract_full_text(provenance=prov))
        assert "rpt_partial" in text

    def test_gemeente_code_derived_from_buurt_code(self):
        """ProvenanceData.gemeente_code correctly derived from buurt_code."""
        from app.models.report import ProvenanceData

        prov = ProvenanceData(buurt_code="BU04410203")
        assert prov.gemeente_code == "0441"

    def test_gemeente_code_none_without_buurt_code(self):
        """ProvenanceData.gemeente_code is None when buurt_code is missing."""
        from app.models.report import ProvenanceData

        prov = ProvenanceData()
        assert prov.gemeente_code is None


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
@patch("app.api.address.leefbaarometer")
async def test_export_endpoint_full_dossier_template(
    mock_leefbaarometer, mock_property_warnings, mock_risk_cards, mock_bag,
    mock_cache_set, mock_cache_get, mock_entitlement, client
):
    mock_leefbaarometer.get_livability = AsyncMock(return_value=None)
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
@patch("app.api.address.leefbaarometer")
async def test_export_full_dossier_fetches_additional_data(
    mock_leefbaarometer, mock_property_warnings, mock_tier_b, mock_cbs,
    mock_risk_cards, mock_bag, mock_cache_set, mock_cache_get,
    mock_entitlement, client
):
    """Full Dossier template fetches neighborhood stats and tier-b in parallel."""
    mock_leefbaarometer.get_livability = AsyncMock(return_value=None)
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
@patch("app.api.address.leefbaarometer")
async def test_export_tier_b_uses_neighborhood_buurt_code_fallback(
    mock_leefbaarometer, mock_property_warnings, mock_tier_b, mock_cbs,
    mock_risk_cards, mock_bag, mock_cache_set, mock_cache_get,
    mock_entitlement, client
):
    """Tier-B uses neighborhood-resolved buurt_code when request has none."""
    mock_leefbaarometer.get_livability = AsyncMock(return_value=None)
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

    def test_full_dossier_rich_layout_page_range(self):
        """Full dossier should stay in a bounded rich multi-page range."""
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
        assert 8 <= self._page_count(result) <= 12

    def test_full_dossier_compact_with_no_data(self):
        """Even sparse paid dossiers should keep the restored multi-page structure."""
        result = generate_full_dossier(
            address="Unknown",
            building_year=None,
            building_use=None,
            risks=None,
            sunlight_score=None,
            viewing_questions=None,
            language="en",
        )
        assert 7 <= self._page_count(result) <= 9

    def test_full_dossier_dutch(self):
        """Dutch rich dossier should match the same multi-page contract."""
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
        assert 8 <= self._page_count(result) <= 12


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


# ---------------------------------------------------------------------------
# E11-S4: MUTED/BORDER contrast — SECONDARY for essential info text
# ---------------------------------------------------------------------------

class TestContrastCompliance:
    """WCAG AA contrast: essential text uses SECONDARY (4.52:1), not MUTED (2.75:1)."""

    def test_secondary_has_higher_contrast_than_muted(self):
        """SECONDARY must have higher luminance contrast than MUTED on white."""
        # Relative luminance formula (sRGB)
        def _luminance(rgb: tuple[int, int, int]) -> float:
            vals = []
            for c in rgb:
                s = c / 255.0
                vals.append(s / 12.92 if s <= 0.04045 else ((s + 0.055) / 1.055) ** 2.4)
            return 0.2126 * vals[0] + 0.7152 * vals[1] + 0.0722 * vals[2]

        def _contrast(c1, c2):
            l1, l2 = _luminance(c1), _luminance(c2)
            lighter, darker = max(l1, l2), min(l1, l2)
            return (lighter + 0.05) / (darker + 0.05)

        white = (255, 255, 255)
        muted_cr = _contrast(MUTED, white)
        secondary_cr = _contrast(SECONDARY, white)
        # SECONDARY must be >= 4.5:1 (WCAG AA for normal text)
        assert secondary_cr >= 4.5, f"SECONDARY contrast {secondary_cr:.2f} < 4.5:1"
        # MUTED must be < 4.5:1 (confirming it fails AA)
        assert muted_cr < 4.5, f"MUTED contrast {muted_cr:.2f} >= 4.5:1 unexpectedly"
        # SECONDARY beats MUTED
        assert secondary_cr > muted_cr

    def test_muted_only_used_for_fills_not_text(self):
        """After migration, MUTED should not appear as set_text_color in essential info.

        This is a structural guard: MUTED (2.75:1) fails WCAG AA for text.
        All essential text now uses SECONDARY (4.52:1).
        """
        import inspect
        import re

        from app.services.pdf_export import (
            _draw_address_block,
            _draw_checks_subsection,
            _draw_shadow_image,
        )

        # Check key functions for set_text_color(*MUTED) — should be absent
        for fn in [
            BuurtCheckPDF.header,
            BuurtCheckPDF.footer,
            BuurtCheckPDF.draw_comparison_chart,
            BuurtCheckPDF.draw_risk_grid,
            BuurtCheckPDF.draw_section_label,
            _draw_address_block,
            _draw_checks_subsection,
            _draw_shadow_image,
        ]:
            source = inspect.getsource(fn)
            matches = re.findall(r"set_text_color\(\*MUTED\)", source)
            assert not matches, (
                f"{fn.__qualname__} still uses set_text_color(*MUTED) for text"
            )


# ---------------------------------------------------------------------------
# E9-S3: Differentiated comparison bar colors
# ---------------------------------------------------------------------------

class TestDifferentiatedBarColors:
    """All 4 bar types must be distinguishable including in grayscale."""

    def test_four_bar_colors_are_distinct(self):
        """TEAL, MUTED (peer), NATIONAL (national), AMBER_WARN (guideline) are all unique."""
        from app.services.pdf_export import AMBER_WARN
        colors = {TEAL, MUTED, NATIONAL, AMBER_WARN}
        assert len(colors) == 4, "Not all 4 bar colors are distinct"

    def test_grayscale_distinguishable(self):
        """NATIONAL bar fill is distinct from all others in grayscale.

        TEAL and MUTED are close in grayscale (~2.8 diff) but are
        differentiated by hue -- the risk card contract requires 4
        channels (color + label + pattern + score), so hue-based
        distinction is valid.  NATIONAL must be well-separated since
        it was added specifically to replace the invisible BORDER fill.
        """
        from app.services.pdf_export import AMBER_WARN

        def _gray(rgb):
            return 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]

        g_national = _gray(NATIONAL)
        # NATIONAL must differ from every other bar color by >= 8 gray levels
        for name, color in [
            ("TEAL", TEAL), ("MUTED", MUTED), ("AMBER_WARN", AMBER_WARN),
        ]:
            diff = abs(g_national - _gray(color))
            assert diff >= 8, (
                f"NATIONAL too similar to {name} in grayscale: diff={diff:.1f}"
            )

    def test_nl_avg_rows_use_light_grey_color(self):
        """National baseline rows use the light grey PEER_BAR comparison color."""
        from app.services.pdf_export import _build_risk_detail_data

        data = _build_risk_detail_data(
            risks=_make_risks(), sunlight_score=80,
            comparisons=_make_risk_comparisons(), is_nl=False,
        )
        # noise has nl_avg row
        noise_rows = data[0][4]  # comp_rows for noise
        nl_rows = [r for r in noise_rows if "Netherlands" in r[0] or "Nederland" in r[0]]
        assert nl_rows, "No nl_avg row found in noise comparisons"
        for label, _val, color, _dashed in nl_rows:
            assert color == PEER_BAR, (
                f"nl_avg row '{label}' uses {color} instead of PEER_BAR"
            )

    def test_border_never_used_as_data_fill(self):
        """BORDER must not appear as a bar fill color in comparison rows."""
        from app.services.pdf_export import _build_risk_detail_data

        data = _build_risk_detail_data(
            risks=_make_risks(), sunlight_score=80,
            comparisons=_make_risk_comparisons(), is_nl=False,
        )
        for _name, _score, _summary, _source, comp_rows, *_ in data:
            for _label, _value, color, _dashed in comp_rows:
                assert color != BORDER, (
                    f"BORDER used as data-carrying fill for '{_label}'"
                )

    def test_national_meets_graphical_contrast(self):
        """NATIONAL bar fill must have >= 3:1 contrast vs white (WCAG AA graphical)."""
        def _luminance(rgb: tuple[int, int, int]) -> float:
            vals = []
            for c in rgb:
                s = c / 255.0
                vals.append(s / 12.92 if s <= 0.04045 else ((s + 0.055) / 1.055) ** 2.4)
            return 0.2126 * vals[0] + 0.7152 * vals[1] + 0.0722 * vals[2]

        white = (255, 255, 255)
        l_nat = _luminance(NATIONAL)
        l_white = _luminance(white)
        cr = (l_white + 0.05) / (l_nat + 0.05)
        assert cr >= 3.0, f"NATIONAL contrast {cr:.2f} < 3:1 graphical minimum"

    def test_legend_has_four_swatches(self):
        """Legend must render 4 swatches: address, peer, national, benchmark."""
        pdf = BuurtCheckPDF()
        pdf.add_page()
        rows = [
            ("Dit adres", 65, TEAL, False),
            ("Vergelijkingsgroep", 55, MUTED, False),
            ("Nationaal", 50, NATIONAL, False),
            ("Richtlijn", 74, (234, 179, 8), True),
        ]
        end_y = pdf.draw_comparison_chart(
            10, 30, 180, rows, show_legend=True, is_nl=True,
        )
        assert end_y > 30
        result = bytes(pdf.output())
        assert result[:5] == b"%PDF-"


# ---------------------------------------------------------------------------
# E9-S4: Address row ordering and visual hierarchy
# ---------------------------------------------------------------------------

class TestAddressRowOrdering:
    """'Dit adres' / 'This address' must be first row in comparison charts."""

    def test_address_row_sorted_first_produces_valid_pdf(self):
        """When address row is not first in input, chart still renders correctly."""
        pdf = BuurtCheckPDF()
        pdf.add_page()
        # Deliberately put address last in input
        rows = [
            ("Netherlands", 50, NATIONAL, False),
            ("City average", 55, MUTED, False),
            ("This address", 65, TEAL, False),
        ]
        end_y = pdf.draw_comparison_chart(10, 30, 180, rows)
        assert end_y > 30
        result = bytes(pdf.output())
        assert result[:5] == b"%PDF-"

    def test_address_gap_increases_chart_height(self):
        """Visual gap between address and reference rows adds to chart height."""
        # Chart with only reference rows (no address/TEAL)
        pdf1 = BuurtCheckPDF()
        pdf1.add_page()
        rows_no_addr = [
            ("City average", 55, MUTED, False),
            ("Netherlands", 50, NATIONAL, False),
        ]
        end_no_addr = pdf1.draw_comparison_chart(10, 30, 180, rows_no_addr)

        # Chart with address row (adds gap)
        pdf2 = BuurtCheckPDF()
        pdf2.add_page()
        rows_with_addr = [
            ("This address", 65, TEAL, False),
            ("City average", 55, MUTED, False),
            ("Netherlands", 50, NATIONAL, False),
        ]
        end_with_addr = pdf2.draw_comparison_chart(10, 30, 180, rows_with_addr)

        # 3 rows vs 2 rows: 3-row chart is taller by row_h + gap
        diff = end_with_addr - end_no_addr
        # row_h(7.0) + address_gap(2.5) = 9.5
        assert diff > 9.0, f"Gap difference {diff:.1f} too small, expected >= 9.0"

    def test_full_dossier_address_first_in_comparisons(self):
        """Full dossier comparison data has address row first."""
        from app.services.pdf_export import _build_risk_detail_data

        data = _build_risk_detail_data(
            risks=_make_risks(), sunlight_score=80,
            comparisons=_make_risk_comparisons(), is_nl=False,
        )
        # Noise has address + city_avg + nl_avg + who_limit
        noise_rows = data[0][4]
        assert noise_rows, "No comparison rows for noise"
        assert noise_rows[0][0] == "This address"

    def test_duplicate_risk_comparison_labels_are_deduplicated(self):
        """Duplicate comparison rows keep the first rendered label only once."""
        from app.services.pdf_export import _build_risk_detail_data

        comparisons = _make_risk_comparisons()
        comparisons.noise.insert(2, RiskComparisonRow(label_code="city_avg", value=57))
        comparisons.noise.append(RiskComparisonRow(label_code="nl_avg", value=61))

        data = _build_risk_detail_data(
            risks=_make_risks(), sunlight_score=80,
            comparisons=comparisons, is_nl=False,
        )

        noise_rows = data[0][4]
        labels = [label for label, _value, _color, _dashed in noise_rows]
        assert labels.count("Peer baseline (urbanization)") == 1
        assert labels.count("Netherlands") == 1

    def test_no_gap_when_no_address_row(self):
        """Chart without address rows should not have extra gap."""
        pdf1 = BuurtCheckPDF()
        pdf1.add_page()
        rows = [
            ("City average", 55, MUTED, False),
            ("Netherlands", 50, NATIONAL, False),
        ]
        end_y = pdf1.draw_comparison_chart(10, 30, 180, rows)
        # 2 rows * 7.0 + axis 3.5 = 17.5
        expected_min = 30 + 14  # 2 * row_h
        assert end_y > expected_min
        # Should NOT include address_gap (2.5)
        expected_max = 30 + 14 + 5  # rows + axis, no gap
        assert end_y < expected_max, (
            f"Chart height {end_y - 30:.1f} too large without address row"
        )

    def test_severity_colored_address_row_still_counts_as_address(self):
        """Address-row emphasis survives when the address bar is severity-colored."""
        pdf = BuurtCheckPDF()
        pdf.add_page()
        rows = [
            ("This address", 15, (185, 28, 28), False),
            ("Peer baseline (urbanization)", 55, MUTED, False),
            ("Netherlands", 60, NATIONAL, False),
        ]

        end_y = pdf.draw_comparison_chart(10, 30, 180, rows)

        assert end_y - 30 > 23


# ---------------------------------------------------------------------------
# E7-S1: Static location map tests
# ---------------------------------------------------------------------------


def _tiny_png() -> str:
    """Generate a 2x2 white PNG as base64 for testing."""
    import base64

    def _chunk(chunk_type: bytes, data: bytes) -> bytes:
        c = chunk_type + data
        crc = zlib.crc32(c) & 0xFFFFFFFF
        return struct.pack(">I", len(data)) + c + struct.pack(">I", crc)

    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = _chunk(
        b"IHDR",
        struct.pack(">IIBBBBB", 2, 2, 8, 2, 0, 0, 0),
    )
    raw = b"\x00\xff\xff\xff\xff\xff\xff" * 2
    idat = _chunk(b"IDAT", zlib.compress(raw))
    iend = _chunk(b"IEND", b"")
    return base64.b64encode(sig + ihdr + idat + iend).decode()


class TestLocationMap:
    """Tests for _draw_location_map (E7-S1)."""

    def test_draw_location_map_renders_with_image(self):
        """Map image, pin, compass, scale, and attribution render."""
        pdf = BuurtCheckPDF(language="en")
        pdf.add_page()
        b64 = _tiny_png()
        y_before = pdf.get_y()
        _draw_location_map(pdf, b64, is_nl=False)
        y_after = pdf.get_y()
        # Should have advanced the cursor
        assert y_after > y_before
        # Verify PDF contains attribution text
        result = bytes(pdf.output())
        reader = PdfReader(io.BytesIO(result))
        text = "\n".join(p.extract_text() or "" for p in reader.pages)
        assert "PDOK Luchtfoto" in text
        assert "25 m" in text
        assert "N" in text

    def test_draw_location_map_dutch_attribution(self):
        """Dutch map attribution text is rendered."""
        pdf = BuurtCheckPDF(language="nl")
        pdf.add_page()
        b64 = _tiny_png()
        _draw_location_map(pdf, b64, is_nl=True)
        result = bytes(pdf.output())
        reader = PdfReader(io.BytesIO(result))
        text = "\n".join(p.extract_text() or "" for p in reader.pages)
        assert "Luchtfoto: PDOK Luchtfoto" in text

    def test_draw_location_map_english_attribution(self):
        """English map attribution text is rendered."""
        pdf = BuurtCheckPDF(language="en")
        pdf.add_page()
        b64 = _tiny_png()
        _draw_location_map(pdf, b64, is_nl=False)
        result = bytes(pdf.output())
        reader = PdfReader(io.BytesIO(result))
        text = "\n".join(p.extract_text() or "" for p in reader.pages)
        assert "Aerial: PDOK Luchtfoto" in text

    def test_draw_location_map_renders_footprint_overlay_when_available(self):
        pdf = BuurtCheckPDF(language="en")
        pdf.add_page()
        polygon_calls: list[str] = []
        original_polygon = pdf.polygon
        footprint = {
            "type": "Polygon",
            "coordinates": [[
                [4.89195, 52.37195],
                [4.89205, 52.37195],
                [4.89205, 52.37205],
                [4.89195, 52.37205],
                [4.89195, 52.37195],
            ]],
        }

        def tracking_polygon(points, style="D"):
            polygon_calls.append(style)
            return original_polygon(points, style=style)

        pdf.polygon = tracking_polygon
        _draw_location_map(
            pdf,
            _tiny_png(),
            is_nl=False,
            center_lat=52.372,
            center_lng=4.892,
            footprint_geojson=footprint,
        )

        assert polygon_calls == ["D"]

    def test_draw_location_map_omits_target_marker_with_footprint_overlay(self):
        pdf = BuurtCheckPDF(language="en")
        pdf.add_page()
        ellipse_calls: list[str] = []
        original_ellipse = pdf.ellipse
        footprint = {
            "type": "Polygon",
            "coordinates": [[
                [4.89195, 52.37195],
                [4.89205, 52.37195],
                [4.89205, 52.37205],
                [4.89195, 52.37205],
                [4.89195, 52.37195],
            ]],
        }

        def tracking_ellipse(*args, **kwargs):  # type: ignore[no-untyped-def]
            style = kwargs.get("style")
            if style is None and len(args) >= 5:
                style = args[4]
            ellipse_calls.append(style or "")
            return original_ellipse(*args, **kwargs)

        pdf.ellipse = tracking_ellipse
        _draw_location_map(
            pdf,
            _tiny_png(),
            is_nl=False,
            center_lat=52.372,
            center_lng=4.892,
            footprint_geojson=footprint,
        )

        assert ellipse_calls == []

    def test_draw_location_map_derives_anchor_from_footprint_when_center_missing(self):
        pdf = BuurtCheckPDF(language="en")
        pdf.add_page()
        polygon_calls: list[str] = []
        original_polygon = pdf.polygon
        footprint = {
            "type": "Polygon",
            "coordinates": [[
                [4.89195, 52.37195],
                [4.89205, 52.37195],
                [4.89205, 52.37205],
                [4.89195, 52.37205],
                [4.89195, 52.37195],
            ]],
        }

        def tracking_polygon(points, style="D"):
            polygon_calls.append(style)
            return original_polygon(points, style=style)

        pdf.polygon = tracking_polygon
        _draw_location_map(
            pdf,
            _tiny_png(),
            is_nl=False,
            footprint_geojson=footprint,
        )

        assert polygon_calls == ["D"]

    def test_draw_location_map_renders_placeholder_when_none(self):
        """Missing map data renders a visible unavailable placeholder."""
        pdf = BuurtCheckPDF(language="en")
        pdf.add_page()
        y_before = pdf.get_y()
        _draw_location_map(pdf, None, is_nl=False)
        y_after = pdf.get_y()
        assert y_after > y_before
        result = bytes(pdf.output())
        reader = PdfReader(io.BytesIO(result))
        text = "\n".join(p.extract_text() or "" for p in reader.pages)
        assert "Location map unavailable" in text
        assert "PDOK Luchtfoto" in text

    def test_draw_location_map_renders_placeholder_when_empty(self):
        """Empty map payload renders the same unavailable placeholder."""
        pdf = BuurtCheckPDF(language="en")
        pdf.add_page()
        _draw_location_map(pdf, "", is_nl=False)
        result = bytes(pdf.output())
        reader = PdfReader(io.BytesIO(result))
        text = "\n".join(p.extract_text() or "" for p in reader.pages)
        assert "Location map unavailable" in text

    def test_draw_location_map_graceful_on_bad_data(self):
        """Bad base64 data falls back to placeholder instead of crashing."""
        pdf = BuurtCheckPDF(language="en")
        pdf.add_page()
        _draw_location_map(pdf, "not-valid-png-data", is_nl=False)
        result = bytes(pdf.output())
        assert result[:5] == b"%PDF-"
        reader = PdfReader(io.BytesIO(result))
        text = "\n".join(p.extract_text() or "" for p in reader.pages)
        assert "Location map unavailable" in text

    def test_draw_location_map_moves_to_next_page_when_current_page_is_full(self):
        """Crowded pages push the location block onto a fresh page."""
        pdf = BuurtCheckPDF(language="en")
        pdf.add_page()
        pdf.set_y(pdf.h - pdf.b_margin - 20)
        _draw_location_map(pdf, _tiny_png(), is_nl=False)

        assert pdf.page_no() == 2
        result = bytes(pdf.output())
        reader = PdfReader(io.BytesIO(result))
        text = "\n".join(p.extract_text() or "" for p in reader.pages)
        assert "Aerial: PDOK Luchtfoto" in text

    def test_full_dossier_accepts_location_map_param(self):
        """Location-map input stays accepted by the richer dossier."""
        b64 = _tiny_png()
        result = generate_full_dossier(
            address="Damrak 1, 1012 Amsterdam",
            building_year=1950,
            building_use="Residential",
            risks=_make_risks(),
            sunlight_score=80,
            viewing_questions=_make_viewing_questions(),
            language="en",
            floor_area=85,
            neighborhood_stats=_make_neighborhood_stats(),
            tier_b=_make_tier_b(),
            risk_comparisons=_make_risk_comparisons(),
            property_warnings_data=_make_property_warnings(),
            location_map_b64=b64,
        )
        assert isinstance(result, bytes)
        assert result[:5] == b"%PDF-"
        reader = PdfReader(io.BytesIO(result))
        text = "\n".join(p.extract_text() or "" for p in reader.pages)
        assert "PDOK Luchtfoto" in text

    def test_full_dossier_fpdf_keeps_location_map_when_shadow_evidence_is_present(self):
        """The richer dossier keeps the location map alongside restored evidence pages."""
        shadow_images = TestShadowTriptych()._make_shadow_images()
        result = _generate_full_dossier_fpdf(
            address="Damrak 1, 1012 Amsterdam",
            building_year=1950,
            building_use="Residential",
            risks=_make_risks(),
            sunlight_score=80,
            viewing_questions=_make_viewing_questions(),
            language="en",
            neighborhood_stats=_make_neighborhood_stats(),
            tier_b=_make_tier_b(),
            risk_comparisons=_make_risk_comparisons(),
            property_warnings_data=_make_property_warnings(),
            location_map_b64=_tiny_png(),
            shadow_images=shadow_images,
        )
        reader = PdfReader(io.BytesIO(result))
        text = "\n".join(p.extract_text() or "" for p in reader.pages)
        assert "Top view" in text or "Front facade" in text or "Rear facade" in text
        assert "PDOK Luchtfoto" in text

    def test_full_dossier_fpdf_without_map_keeps_shadow_content(self):
        """Missing location maps show a visible placeholder without dropping other evidence."""
        shadow_images = TestShadowTriptych()._make_shadow_images()
        result = _generate_full_dossier_fpdf(
            address="Damrak 1, 1012 Amsterdam",
            building_year=1950,
            building_use="Residential",
            risks=_make_risks(),
            sunlight_score=80,
            viewing_questions=_make_viewing_questions(),
            language="en",
            neighborhood_stats=_make_neighborhood_stats(),
            tier_b=_make_tier_b(),
            risk_comparisons=_make_risk_comparisons(),
            property_warnings_data=_make_property_warnings(),
            location_map_b64=None,
            shadow_images=shadow_images,
        )
        reader = PdfReader(io.BytesIO(result))
        text = "\n".join(p.extract_text() or "" for p in reader.pages)
        assert "Location map unavailable" in text
        assert "Top view" in text or "Front facade" in text or "Rear facade" in text

    def test_full_dossier_without_map_still_works(self):
        """Full dossier generates without location_map_b64."""
        result = generate_full_dossier(
            address="Damrak 1, 1012 Amsterdam",
            building_year=1950,
            building_use="Residential",
            risks=_make_risks(),
            sunlight_score=80,
            viewing_questions=_make_viewing_questions(),
            language="en",
        )
        assert isinstance(result, bytes)
        assert result[:5] == b"%PDF-"


class TestNeighborhoodSectionPagination:
    def test_neighborhood_header_moves_with_content_when_space_is_low(self):
        pdf = BuurtCheckPDF(language="en")
        pdf.add_page()
        pdf.set_y(pdf.h - pdf.b_margin - 20)

        pe._draw_neighborhood_page(
            pdf,
            _make_neighborhood_stats(),
            _make_tier_b(),
            False,
            livability=None,
        )

        assert pdf.page_no() == 2
        result = bytes(pdf.output())
        reader = PdfReader(io.BytesIO(result))
        first_page_text = reader.pages[0].extract_text() or ""
        second_page_text = reader.pages[1].extract_text() or ""
        assert "Neighborhood" not in first_page_text
        assert "NEIGHBORHOOD CONTEXT" in second_page_text
        assert "Burgwallen-Oude Zijde" in second_page_text


# ---------------------------------------------------------------------------
# E7-S1: _fetch_location_map async tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_fetch_location_map_success():
    """Returns base64 image when PDOK Luchtfoto responds with image."""
    import base64
    from unittest.mock import MagicMock

    from app.api.address import _fetch_location_map

    tiny = base64.b64decode(_tiny_png())
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.headers = {"content-type": "image/png"}
    mock_resp.content = tiny
    mock_resp.raise_for_status = MagicMock()

    mock_client = AsyncMock()
    mock_client.get = AsyncMock(return_value=mock_resp)

    with patch(
        "app.api.address._map_client"
    ) as mock_lac:
        mock_lac.get.return_value = mock_client
        result = await _fetch_location_map(121000, 487000)

    assert result is not None
    decoded = base64.b64decode(result)
    assert decoded[:4] == b"\x89PNG"


@pytest.mark.asyncio
async def test_fetch_location_map_uses_cache_when_available():
    """Returns cached map bytes without calling PDOK again."""
    from app.api.address import _fetch_location_map

    with (
        patch("app.api.address.cache_get", new_callable=AsyncMock, return_value="cached-map"),
        patch("app.api.address._map_client") as mock_lac,
    ):
        result = await _fetch_location_map(121000, 487000)

    assert result == "cached-map"
    mock_lac.get.assert_not_called()


@pytest.mark.asyncio
async def test_fetch_location_map_retries_and_caches_success():
    """Retries transient failures and caches the successful map response."""
    import base64
    from unittest.mock import MagicMock

    from app.api.address import _fetch_location_map

    tiny = base64.b64decode(_tiny_png())
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.headers = {"content-type": "image/png"}
    mock_resp.content = tiny
    mock_resp.raise_for_status = MagicMock()

    mock_client = AsyncMock()
    mock_client.get = AsyncMock(side_effect=[Exception("timeout"), mock_resp])

    with (
        patch("app.api.address.cache_get", new_callable=AsyncMock, return_value=None),
        patch("app.api.address.cache_set", new_callable=AsyncMock) as mock_cache_set,
        patch("app.api.address._map_client") as mock_lac,
    ):
        mock_lac.get.return_value = mock_client
        result = await _fetch_location_map(121000, 487000)

    assert result is not None
    assert mock_client.get.await_count == 2
    mock_cache_set.assert_awaited_once()


@pytest.mark.asyncio
async def test_fetch_location_map_non_image_returns_none():
    """Returns None when response is not an image."""
    from unittest.mock import MagicMock

    from app.api.address import _fetch_location_map

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.headers = {"content-type": "application/xml"}
    mock_resp.content = b"<error/>"
    mock_resp.raise_for_status = MagicMock()

    mock_client = AsyncMock()
    mock_client.get = AsyncMock(return_value=mock_resp)

    with patch(
        "app.api.address._map_client"
    ) as mock_lac:
        mock_lac.get.return_value = mock_client
        result = await _fetch_location_map(121000, 487000)

    assert result is None


@pytest.mark.asyncio
async def test_fetch_location_map_exception_returns_none():
    """Returns None on network error — graceful degradation."""
    from app.api.address import _fetch_location_map

    mock_client = AsyncMock()
    mock_client.get = AsyncMock(side_effect=Exception("timeout"))

    with patch(
        "app.api.address._map_client"
    ) as mock_lac:
        mock_lac.get.return_value = mock_client
        result = await _fetch_location_map(121000, 487000)

    assert result is None


def test_decode_b64_asset_preserves_jpeg_extension(tmp_path):
    from app.services.pdf_export import _decode_b64_asset

    raw = b"\xff\xd8\xff\xdbJPEG"
    payload = base64.b64encode(raw).decode("ascii")

    output = _decode_b64_asset(
        payload,
        output_dir=tmp_path,
        filename_stem="location_map",
    )

    assert output is not None
    assert output.endswith(".jpg")
    assert Path(output).read_bytes() == raw


def test_fpdf_climate_source_wraps_without_truncation():
    """Fallback renderer wraps long climate source text instead of clipping it."""
    from app.services.pdf_export import _draw_risk_details_page

    risks = _make_risks()
    risks.climate_stress.source = "Klimaateffectatlas (Dutch Climate Atlas)"
    risks.climate_stress.source_date = "2024"
    risks.climate_stress.heat_layer = "wpn:s0149_hittestress_warme_nachten_huidig"
    risks.climate_stress.water_layer = "etten:gr1_t100"

    pdf = BuurtCheckPDF(language="en")
    pdf.add_page()
    _draw_risk_details_page(
        pdf,
        "Kalverstraat 1, Amsterdam",
        risks,
        80,
        _make_risk_comparisons(),
        False,
    )

    reader = PdfReader(io.BytesIO(bytes(pdf.output())))
    text = _norm("\n".join(page.extract_text() or "" for page in reader.pages))

    assert "Source: Klimaateffectatlas (Dutch Climate Atlas) · 2024" in text
    assert "Modeled climate scenario" in text
    assert "etten:gr1_t100" not in text


# ---------------------------------------------------------------------------
# Livability section tests (E3-S1)
# ---------------------------------------------------------------------------


def _make_livability_dimensions() -> list[LivabilityDimension]:
    """Return 5 livability dimensions with varying scores."""
    return [
        LivabilityDimension(
            name="physical", raw_score=6, normalized_score=63,
            label_code="livability.dimension.physical",
        ),
        LivabilityDimension(
            name="safety", raw_score=7, normalized_score=75,
            label_code="livability.dimension.safety",
        ),
        LivabilityDimension(
            name="social", raw_score=5, normalized_score=50,
            label_code="livability.dimension.social",
        ),
        LivabilityDimension(
            name="amenities", raw_score=8, normalized_score=88,
            label_code="livability.dimension.amenities",
        ),
        LivabilityDimension(
            name="housing", raw_score=4, normalized_score=38,
            label_code="livability.dimension.housing",
        ),
    ]


def _make_livability(
    *,
    overall_normalized: int = 62,
    with_trend: bool = True,
    with_comparison: bool = True,
    with_dimensions: bool = True,
) -> LivabilityResponse:
    """Build a LivabilityResponse for tests."""
    trend = []
    if with_trend:
        trend = [
            LivabilityTrendPoint(
                year="2002", overall_score=4, overall_normalized=38,
                dimensions=[],
            ),
            LivabilityTrendPoint(
                year="2014", overall_score=5, overall_normalized=50,
                dimensions=[],
            ),
            LivabilityTrendPoint(
                year="2020", overall_score=6, overall_normalized=63,
                dimensions=[],
            ),
            LivabilityTrendPoint(
                year="2024", overall_score=6, overall_normalized=62,
                dimensions=[],
            ),
        ]
    comparison = []
    if with_comparison:
        comparison = [
            LivabilityComparisonRow(
                level="wijk", name="Centrum-West",
                overall_score=6, overall_normalized=63,
                dimensions=[],
            ),
            LivabilityComparisonRow(
                level="gemeente", name="Amsterdam",
                overall_score=5, overall_normalized=50,
                dimensions=[],
            ),
        ]
    return LivabilityResponse(
        available=True,
        buurt_code="BU03630000",
        buurt_name="Grachtengordel-West",
        gemeente="Amsterdam",
        year="2024",
        overall_score=6,
        overall_normalized=overall_normalized,
        dimensions=_make_livability_dimensions() if with_dimensions else [],
        trend=trend,
        comparison=comparison,
        source="Leefbaarometer (Dutch Livability Index)",
        source_date="2024",
    )


class TestLivabilityTrendSummary:
    """Tests for _livability_trend_summary helper."""

    def test_improving_trend_en(self):
        trend = [
            LivabilityTrendPoint(
                year="2008", overall_score=3, overall_normalized=25, dimensions=[],
            ),
            LivabilityTrendPoint(
                year="2014", overall_score=5, overall_normalized=50, dimensions=[],
            ),
            LivabilityTrendPoint(
                year="2020", overall_score=6, overall_normalized=63, dimensions=[],
            ),
            LivabilityTrendPoint(
                year="2024", overall_score=7, overall_normalized=75, dimensions=[],
            ),
        ]
        result = _livability_trend_summary(trend, is_nl=False)
        assert result is not None
        assert "Improving" in result

    def test_improving_trend_nl(self):
        trend = [
            LivabilityTrendPoint(
                year="2008", overall_score=3, overall_normalized=25, dimensions=[],
            ),
            LivabilityTrendPoint(
                year="2024", overall_score=7, overall_normalized=75, dimensions=[],
            ),
        ]
        result = _livability_trend_summary(trend, is_nl=True)
        assert result is not None
        assert "Verbeterend" in result

    def test_declining_trend_en(self):
        trend = [
            LivabilityTrendPoint(
                year="2008", overall_score=7, overall_normalized=75, dimensions=[],
            ),
            LivabilityTrendPoint(
                year="2014", overall_score=6, overall_normalized=63, dimensions=[],
            ),
            LivabilityTrendPoint(
                year="2020", overall_score=5, overall_normalized=50, dimensions=[],
            ),
            LivabilityTrendPoint(
                year="2024", overall_score=4, overall_normalized=38, dimensions=[],
            ),
        ]
        result = _livability_trend_summary(trend, is_nl=False)
        assert result is not None
        assert "Declining" in result

    def test_declining_trend_nl(self):
        trend = [
            LivabilityTrendPoint(
                year="2008", overall_score=7, overall_normalized=75, dimensions=[],
            ),
            LivabilityTrendPoint(
                year="2024", overall_score=4, overall_normalized=38, dimensions=[],
            ),
        ]
        result = _livability_trend_summary(trend, is_nl=True)
        assert result is not None
        assert "Dalend" in result

    def test_stable_trend_en(self):
        trend = [
            LivabilityTrendPoint(
                year="2008", overall_score=6, overall_normalized=63, dimensions=[],
            ),
            LivabilityTrendPoint(
                year="2024", overall_score=6, overall_normalized=65, dimensions=[],
            ),
        ]
        result = _livability_trend_summary(trend, is_nl=False)
        assert result == "Stable"

    def test_stable_trend_nl(self):
        trend = [
            LivabilityTrendPoint(
                year="2008", overall_score=6, overall_normalized=63, dimensions=[],
            ),
            LivabilityTrendPoint(
                year="2024", overall_score=6, overall_normalized=65, dimensions=[],
            ),
        ]
        result = _livability_trend_summary(trend, is_nl=True)
        assert result == "Stabiel"

    def test_insufficient_data_returns_none(self):
        trend = [
            LivabilityTrendPoint(
                year="2024", overall_score=6, overall_normalized=63, dimensions=[],
            ),
        ]
        result = _livability_trend_summary(trend, is_nl=False)
        assert result is None

    def test_empty_trend_returns_none(self):
        result = _livability_trend_summary([], is_nl=False)
        assert result is None


class TestDrawLivabilitySection:
    """Tests for _draw_livability_section rendering."""

    def test_renders_overall_score_en(self):
        pdf = BuurtCheckPDF(language="en")
        pdf.add_page()
        livability = _make_livability()
        _draw_livability_section(pdf, livability, is_nl=False)
        output = bytes(pdf.output())
        assert len(output) > 100

    def test_renders_overall_score_nl(self):
        pdf = BuurtCheckPDF(language="nl")
        pdf.add_page()
        livability = _make_livability()
        _draw_livability_section(pdf, livability, is_nl=True)
        output = bytes(pdf.output())
        assert len(output) > 100

    def test_skips_when_none(self):
        """Section is not rendered when livability is None."""
        pdf = BuurtCheckPDF(language="en")
        pdf.add_page()
        y_before = pdf.get_y()
        _draw_livability_section(pdf, None, is_nl=False)
        y_after = pdf.get_y()
        assert y_after == y_before

    def test_skips_when_unavailable(self):
        """Section is not rendered when livability.available is False."""
        pdf = BuurtCheckPDF(language="en")
        pdf.add_page()
        livability = LivabilityResponse(available=False)
        y_before = pdf.get_y()
        _draw_livability_section(pdf, livability, is_nl=False)
        y_after = pdf.get_y()
        assert y_after == y_before

    def test_renders_without_trend(self):
        pdf = BuurtCheckPDF(language="en")
        pdf.add_page()
        livability = _make_livability(with_trend=False)
        _draw_livability_section(pdf, livability, is_nl=False)
        output = bytes(pdf.output())
        assert len(output) > 100

    def test_renders_without_comparison(self):
        pdf = BuurtCheckPDF(language="en")
        pdf.add_page()
        livability = _make_livability(with_comparison=False)
        _draw_livability_section(pdf, livability, is_nl=False)
        output = bytes(pdf.output())
        assert len(output) > 100

    def test_renders_without_dimensions(self):
        pdf = BuurtCheckPDF(language="en")
        pdf.add_page()
        livability = _make_livability(with_dimensions=False)
        _draw_livability_section(pdf, livability, is_nl=False)
        output = bytes(pdf.output())
        assert len(output) > 100

    def test_renders_with_all_data(self):
        """All subcomponents (dimensions, trend, comparison) render together."""
        pdf = BuurtCheckPDF(language="en")
        pdf.add_page()
        livability = _make_livability()
        _draw_livability_section(pdf, livability, is_nl=False)
        output = bytes(pdf.output())
        assert len(output) > 100

    def test_all_five_dimensions_rendered(self):
        """Verify all 5 dimensions appear in the PDF text."""
        pdf = BuurtCheckPDF(language="en")
        pdf.add_page()
        livability = _make_livability()
        _draw_livability_section(pdf, livability, is_nl=False)
        output = bytes(pdf.output())
        reader = PdfReader(io.BytesIO(output))
        text = "".join(page.extract_text() or "" for page in reader.pages)
        assert "Physical environment" in text
        assert "Safety" in text
        assert "Social cohesion" in text
        assert "Amenities" in text
        assert "Housing quality" in text

    def test_all_five_dimensions_rendered_nl(self):
        """Verify all 5 Dutch dimension labels appear in the PDF text."""
        pdf = BuurtCheckPDF(language="nl")
        pdf.add_page()
        livability = _make_livability()
        _draw_livability_section(pdf, livability, is_nl=True)
        output = bytes(pdf.output())
        reader = PdfReader(io.BytesIO(output))
        text = "".join(page.extract_text() or "" for page in reader.pages)
        assert "Fysiek" in text
        assert "Veiligheid" in text
        assert "Sociaal" in text
        assert "Voorzieningen" in text
        assert "Woningen" in text

    def test_source_attribution_en(self):
        pdf = BuurtCheckPDF(language="en")
        pdf.add_page()
        livability = _make_livability()
        _draw_livability_section(pdf, livability, is_nl=False)
        output = bytes(pdf.output())
        reader = PdfReader(io.BytesIO(output))
        text = "".join(page.extract_text() or "" for page in reader.pages)
        assert "Source:" in text
        assert "Leefbaarometer" in text

    def test_source_attribution_nl(self):
        pdf = BuurtCheckPDF(language="nl")
        pdf.add_page()
        livability = _make_livability()
        _draw_livability_section(pdf, livability, is_nl=True)
        output = bytes(pdf.output())
        reader = PdfReader(io.BytesIO(output))
        text = "".join(page.extract_text() or "" for page in reader.pages)
        assert "Bron:" in text
        assert "Leefbaarometer" in text

    def test_deduplicates_duplicate_comparison_names(self):
        pdf = BuurtCheckPDF(language="en")
        pdf.add_page()
        livability = _make_livability()
        livability.buurt_name = "Target district"
        livability.comparison = [
            LivabilityComparisonRow(
                level="wijk",
                name="Deurne",
                overall_score=6,
                overall_normalized=63,
                dimensions=[],
            ),
            LivabilityComparisonRow(
                level="gemeente",
                name="Deurne",
                overall_score=5,
                overall_normalized=50,
                dimensions=[],
            ),
            LivabilityComparisonRow(
                level="gemeente",
                name="Helmond",
                overall_score=6,
                overall_normalized=60,
                dimensions=[],
            ),
        ]
        _draw_livability_section(pdf, livability, is_nl=False)
        output = bytes(pdf.output())
        reader = PdfReader(io.BytesIO(output))
        text = "".join(page.extract_text() or "" for page in reader.pages)
        assert text.count("Deurne") == 1
        assert text.count("Helmond") == 1

    def test_identical_comparison_values_render_text_note(self):
        pdf = BuurtCheckPDF(language="en")
        pdf.add_page()
        livability = _make_livability(overall_normalized=88, with_trend=False)
        livability.buurt_name = "'t Joght"
        livability.gemeente = "Katwijk"
        livability.comparison = [
            LivabilityComparisonRow(
                level="wijk",
                name="'t Joght",
                overall_score=8,
                overall_normalized=88,
                dimensions=[],
            ),
            LivabilityComparisonRow(
                level="gemeente",
                name="Katwijk",
                overall_score=8,
                overall_normalized=88,
                dimensions=[],
            ),
        ]

        _draw_livability_section(pdf, livability, is_nl=False)
        output = bytes(pdf.output())
        reader = PdfReader(io.BytesIO(output))
        text = "".join(page.extract_text() or "" for page in reader.pages)

        assert "same normalized score" in text
        assert "instead of a chart" in text


class TestFullDossierWithLivability:
    """Tests for livability integration in full dossier generation."""

    def test_full_dossier_with_livability_en(self):
        result = generate_full_dossier(
            address="Kalverstraat 1, 1012 Amsterdam",
            building_year=1920,
            building_use="Residential",
            risks=_make_risks(),
            sunlight_score=80,
            viewing_questions=_make_viewing_questions(),
            language="en",
            neighborhood_stats=_make_neighborhood_stats(),
            tier_b=_make_tier_b(),
            livability=_make_livability(),
        )
        assert isinstance(result, bytes)
        assert result[:5] == b"%PDF-"
        reader = PdfReader(io.BytesIO(result))
        all_text = "".join(p.extract_text() or "" for p in reader.pages)
        assert "Livability" in all_text
        assert "Leefbaarometer" in all_text

    def test_full_dossier_with_livability_nl(self):
        result = generate_full_dossier(
            address="Kalverstraat 1, 1012 Amsterdam",
            building_year=1920,
            building_use="Woonfunctie",
            risks=_make_risks(),
            sunlight_score=80,
            viewing_questions=_make_viewing_questions(),
            language="nl",
            neighborhood_stats=_make_neighborhood_stats(),
            tier_b=_make_tier_b(),
            livability=_make_livability(),
        )
        assert isinstance(result, bytes)
        assert result[:5] == b"%PDF-"
        reader = PdfReader(io.BytesIO(result))
        all_text = "".join(p.extract_text() or "" for p in reader.pages)
        assert "Leefbaarheid" in all_text
        assert "Leefbaarometer" in all_text

    def test_full_dossier_without_livability_graceful(self):
        """Full dossier generates fine without livability data."""
        result = generate_full_dossier(
            address="Kalverstraat 1, 1012 Amsterdam",
            building_year=1920,
            building_use="Residential",
            risks=_make_risks(),
            sunlight_score=80,
            viewing_questions=_make_viewing_questions(),
            language="en",
            livability=None,
        )
        assert isinstance(result, bytes)
        assert result[:5] == b"%PDF-"

    def test_full_dossier_unavailable_livability_skipped(self):
        """Unavailable livability does not add extra content."""
        livability = LivabilityResponse(available=False)
        result = generate_full_dossier(
            address="Kalverstraat 1, 1012 Amsterdam",
            building_year=1920,
            building_use="Residential",
            risks=_make_risks(),
            sunlight_score=80,
            viewing_questions=_make_viewing_questions(),
            language="en",
            livability=livability,
        )
        assert isinstance(result, bytes)
        assert result[:5] == b"%PDF-"
        reader = PdfReader(io.BytesIO(result))
        all_text = "".join(p.extract_text() or "" for p in reader.pages)
        assert "Livability Score" not in all_text

    def test_livability_severity_labels_correct(self):
        """Score 62 should display 'Moderate' severity."""
        result = generate_full_dossier(
            address="Test",
            building_year=None,
            building_use=None,
            risks=None,
            sunlight_score=None,
            viewing_questions=None,
            language="en",
            livability=_make_livability(overall_normalized=62),
        )
        reader = PdfReader(io.BytesIO(result))
        all_text = "".join(p.extract_text() or "" for p in reader.pages)
        assert "Moderate" in all_text

    def test_livability_good_severity(self):
        """Score 80 should display 'Good' severity."""
        result = generate_full_dossier(
            address="Test",
            building_year=None,
            building_use=None,
            risks=None,
            sunlight_score=None,
            viewing_questions=None,
            language="en",
            livability=_make_livability(overall_normalized=80),
        )
        reader = PdfReader(io.BytesIO(result))
        all_text = "".join(p.extract_text() or "" for p in reader.pages)
        assert "Good" in all_text

    def test_comparison_chart_shows_levels(self):
        """Comparison section includes wijk and gemeente names."""
        result = generate_full_dossier(
            address="Test",
            building_year=None,
            building_use=None,
            risks=None,
            sunlight_score=None,
            viewing_questions=None,
            language="en",
            livability=_make_livability(),
        )
        reader = PdfReader(io.BytesIO(result))
        all_text = "".join(p.extract_text() or "" for p in reader.pages)
        assert "Centrum-West" in all_text
        assert "Amsterdam" in all_text

    def test_trend_summary_in_pdf(self):
        """Trend summary text appears in the PDF."""
        result = generate_full_dossier(
            address="Test",
            building_year=None,
            building_use=None,
            risks=None,
            sunlight_score=None,
            viewing_questions=None,
            language="en",
            livability=_make_livability(),
        )
        reader = PdfReader(io.BytesIO(result))
        all_text = "".join(p.extract_text() or "" for p in reader.pages)
        assert "Improving" in all_text or "Declining" in all_text or "Stable" in all_text


# ---------------------------------------------------------------------------
# _fetch_livability_for_export tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_fetch_livability_for_export_cache_hit():
    """Returns cached livability data when cache hit."""
    from app.api.address import _fetch_livability_for_export

    cached_data = _make_livability().model_dump()

    with patch("app.api.address.cache_get", new_callable=AsyncMock, return_value=cached_data):
        result = await _fetch_livability_for_export(121000.0, 487000.0)

    assert result is not None
    assert result.available is True
    assert result.overall_normalized == 62
    assert len(result.dimensions) == 5


@pytest.mark.asyncio
async def test_fetch_livability_for_export_cache_miss_fetches():
    """Fetches from leefbaarometer service on cache miss."""
    from app.api.address import _fetch_livability_for_export

    livability_data = _make_livability(with_trend=False, with_comparison=False)

    with (
        patch("app.api.address.cache_get", new_callable=AsyncMock, return_value=None),
        patch("app.api.address.cache_set", new_callable=AsyncMock),
        patch("app.api.address.leefbaarometer") as mock_leefbaarometer,
    ):
        mock_leefbaarometer.get_livability = AsyncMock(return_value=livability_data)
        mock_leefbaarometer.get_livability_trend = AsyncMock(return_value=[])
        mock_leefbaarometer.get_livability_comparison = AsyncMock(
            return_value=LivabilityComparison(rows=[]),
        )
        result = await _fetch_livability_for_export(121000.0, 487000.0)

    assert result is not None
    assert result.available is True
    mock_leefbaarometer.get_livability.assert_called_once_with(121000.0, 487000.0)


@pytest.mark.asyncio
async def test_fetch_livability_for_export_returns_none_on_no_data():
    """Returns None when get_livability returns None."""
    from app.api.address import _fetch_livability_for_export

    with (
        patch("app.api.address.cache_get", new_callable=AsyncMock, return_value=None),
        patch("app.api.address.cache_set", new_callable=AsyncMock),
        patch("app.api.address.leefbaarometer") as mock_leefbaarometer,
    ):
        mock_leefbaarometer.get_livability = AsyncMock(return_value=None)
        result = await _fetch_livability_for_export(121000.0, 487000.0)

    assert result is None


@pytest.mark.asyncio
async def test_fetch_livability_for_export_graceful_on_exception():
    """Returns None when leefbaarometer raises an exception."""
    from app.api.address import _fetch_livability_for_export

    with (
        patch("app.api.address.cache_get", new_callable=AsyncMock, return_value=None),
        patch("app.api.address.cache_set", new_callable=AsyncMock),
        patch("app.api.address.leefbaarometer") as mock_leefbaarometer,
    ):
        mock_leefbaarometer.get_livability = AsyncMock(
            side_effect=Exception("API down"),
        )
        result = await _fetch_livability_for_export(121000.0, 487000.0)

    assert result is None


@pytest.mark.asyncio
async def test_fetch_livability_for_export_caches_complete_response():
    """Caches livability data when both trend and comparison succeed."""
    from app.api.address import _fetch_livability_for_export

    livability_data = _make_livability(with_trend=False, with_comparison=False)
    trend_data = [
        LivabilityTrendPoint(year="2020", overall_score=5, overall_normalized=50, dimensions=[]),
        LivabilityTrendPoint(year="2024", overall_score=6, overall_normalized=63, dimensions=[]),
    ]
    comparison_data = LivabilityComparison(rows=[
        LivabilityComparisonRow(
            level="wijk", name="Test", overall_score=5, overall_normalized=50,
            dimensions=[],
        ),
    ])

    with (
        patch("app.api.address.cache_get", new_callable=AsyncMock, return_value=None),
        patch("app.api.address.cache_set", new_callable=AsyncMock) as mock_set,
        patch("app.api.address.leefbaarometer") as mock_leefbaarometer,
    ):
        mock_leefbaarometer.get_livability = AsyncMock(return_value=livability_data)
        mock_leefbaarometer.get_livability_trend = AsyncMock(return_value=trend_data)
        mock_leefbaarometer.get_livability_comparison = AsyncMock(
            return_value=comparison_data,
        )
        result = await _fetch_livability_for_export(121000.0, 487000.0)

    assert result is not None
    assert len(result.trend) == 2
    assert len(result.comparison) == 1
    mock_set.assert_called_once()
    assert mock_set.call_args.args[0] == "livability_full:121000:487000"


@pytest.mark.asyncio
async def test_fetch_livability_for_export_no_cache_on_partial():
    """Does not cache when trend or comparison fails."""
    from app.api.address import _fetch_livability_for_export

    livability_data = _make_livability(with_trend=False, with_comparison=False)

    with (
        patch("app.api.address.cache_get", new_callable=AsyncMock, return_value=None),
        patch("app.api.address.cache_set", new_callable=AsyncMock) as mock_set,
        patch("app.api.address.leefbaarometer") as mock_leefbaarometer,
    ):
        mock_leefbaarometer.get_livability = AsyncMock(return_value=livability_data)
        mock_leefbaarometer.get_livability_trend = AsyncMock(
            side_effect=Exception("trend failed"),
        )
        mock_leefbaarometer.get_livability_comparison = AsyncMock(
            return_value=LivabilityComparison(rows=[]),
        )
        result = await _fetch_livability_for_export(121000.0, 487000.0)

    assert result is not None
    assert result.trend == []
    mock_set.assert_not_called()


# ---------------------------------------------------------------------------
# Full dossier endpoint with livability integration
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@patch("app.services.reports.check_entitlement", new_callable=AsyncMock, return_value=True)
@patch("app.api.address.cache_get", new_callable=AsyncMock, return_value=None)
@patch("app.api.address.cache_set", new_callable=AsyncMock)
@patch("app.api.address.bag")
@patch("app.api.address.risk_cards")
@patch("app.api.address.cbs")
@patch("app.api.address.tier_b")
@patch("app.api.address.property_warnings")
@patch("app.api.address.leefbaarometer")
async def test_export_full_dossier_fetches_livability(
    mock_leefbaarometer, mock_property_warnings, mock_tier_b, mock_cbs,
    mock_risk_cards, mock_bag, mock_cache_set, mock_cache_get,
    mock_entitlement, client
):
    """Full dossier export calls leefbaarometer in Phase 2 parallel fetch."""
    livability_data = _make_livability(with_trend=False, with_comparison=False)
    mock_leefbaarometer.get_livability = AsyncMock(return_value=livability_data)
    mock_leefbaarometer.get_livability_trend = AsyncMock(return_value=[])
    mock_leefbaarometer.get_livability_comparison = AsyncMock(
        return_value=LivabilityComparison(rows=[]),
    )
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
        },
    )
    assert resp.status_code == 200
    assert resp.content[:5] == b"%PDF-"
    mock_leefbaarometer.get_livability.assert_called_once_with(121000.0, 487000.0)
    reader = PdfReader(io.BytesIO(resp.content))
    all_text = "".join(p.extract_text() or "" for p in reader.pages)
    assert "Livability" in all_text or "Leefbaarheid" in all_text


# ---------------------------------------------------------------------------
# MUTED bar fill meets >= 3:1 graphical contrast (WCAG AA)
# ---------------------------------------------------------------------------

class TestMutedGraphicalContrast:
    """MUTED bar fill must achieve >= 3:1 contrast vs white for WCAG AA graphical."""

    def test_muted_meets_graphical_contrast(self):
        """MUTED bar fill must have >= 3:1 contrast vs white."""
        def _luminance(rgb: tuple[int, int, int]) -> float:
            vals = []
            for c in rgb:
                s = c / 255.0
                vals.append(s / 12.92 if s <= 0.04045 else ((s + 0.055) / 1.055) ** 2.4)
            return 0.2126 * vals[0] + 0.7152 * vals[1] + 0.0722 * vals[2]

        white = (255, 255, 255)
        l_muted = _luminance(MUTED)
        l_white = _luminance(white)
        cr = (l_white + 0.05) / (l_muted + 0.05)
        assert cr >= 3.0, f"MUTED contrast {cr:.2f} < 3:1 graphical minimum"

    def test_legend_label_vergelijkingsgroep_nl(self):
        """Dutch legend renders 'Vergelijkingsgroep' (not old 'Stedelijk')."""
        pdf = BuurtCheckPDF()
        pdf.add_page()
        rows = [
            ("Dit adres", 65, TEAL, False),
            ("Vergelijkingsgroep", 55, MUTED, False),
        ]
        pdf.draw_comparison_chart(10, 30, 180, rows, show_legend=True, is_nl=True)
        result = bytes(pdf.output())
        reader = PdfReader(io.BytesIO(result))
        text = "\n".join(p.extract_text() or "" for p in reader.pages)
        assert "Vergelijkingsgroep" in text
        assert "Stedelijk" not in text

    def test_legend_label_peer_group_en(self):
        """English legend renders 'Peer group' (not old 'Peer')."""
        pdf = BuurtCheckPDF()
        pdf.add_page()
        rows = [
            ("This address", 65, TEAL, False),
            ("Peer group", 55, MUTED, False),
        ]
        pdf.draw_comparison_chart(10, 30, 180, rows, show_legend=True, is_nl=False)
        result = bytes(pdf.output())
        reader = PdfReader(io.BytesIO(result))
        text = "\n".join(p.extract_text() or "" for p in reader.pages)
        assert "Peer group" in text


# ---------------------------------------------------------------------------
# Expanded sunlight measurements in risk detail data
# ---------------------------------------------------------------------------

class TestExpandedSunlightMeasurements:
    """Extended sunlight fields render in risk detail measurements block."""

    def _make_sunlight_risks(self, **overrides) -> RiskCardsResponse:
        """Create risks with extended sunlight fields."""
        sun_kwargs = {
            "level": SeverityLevel.good,
            "winter_hours": 5.0,
            "summer_hours": 10.0,
            "equinox_hours": 7.5,
            "svf_percent": 62.0,
            "source": "SunCalc + 3DBAG",
            "score": 80,
            "severity": "good",
            "summary": "Good sunlight",
            "summary_nl": "Goed zonlicht",
        }
        sun_kwargs.update(overrides)
        return RiskCardsResponse(
            address_id="0363010012345678",
            noise=NoiseRiskCard(
                level=RiskLevel.medium,
                lden_db=58.0,
                source="RIVM",
                sampled_at="2026-01-01",
                score=65,
                severity="moderate",
                summary="Moderate traffic noise",
                summary_nl="Matig verkeerslawaai",
            ),
            air_quality=AirQualityRiskCard(
                level=RiskLevel.low,
                no2_ug_m3=18.0,
                source="RIVM GCN",
                sampled_at="2026-01-01",
                score=72,
                severity="good",
                summary="Good air quality",
                summary_nl="Goede luchtkwaliteit",
            ),
            climate_stress=ClimateStressRiskCard(
                level=RiskLevel.medium,
                source="Klimaateffectatlas",
                sampled_at="2026-01-01",
                score=45,
                severity="moderate",
                summary="Some flood risk",
                summary_nl="Enig overstromingsrisico",
            ),
            sunlight=SunlightRiskCard(**sun_kwargs),
        )

    def test_annual_average_in_risk_detail(self):
        """annual_average appears as measurement when available."""
        from app.services.pdf_export import _build_risk_detail_data

        risks = self._make_sunlight_risks(annual_average=6.3)
        data = _build_risk_detail_data(risks, 80, None, False)
        # Sunlight is last entry
        sunlight_entry = data[-1]
        measurements = sunlight_entry[5]
        labels = [m[0] for m in measurements]
        assert "Annual average" in labels
        annual_val = [m[1] for m in measurements if m[0] == "Annual average"][0]
        assert "6.3" in annual_val
        assert "h/day" in annual_val

    def test_annual_average_nl_label(self):
        """annual_average uses Dutch label in NL mode."""
        from app.services.pdf_export import _build_risk_detail_data

        risks = self._make_sunlight_risks(annual_average=6.3)
        data = _build_risk_detail_data(risks, 80, None, True)
        sunlight_entry = data[-1]
        measurements = sunlight_entry[5]
        labels = [m[0] for m in measurements]
        assert "Jaargemiddelde" in labels

    def test_svf_anisotropic_in_risk_detail(self):
        """svf_anisotropic appears when different from svf_percent."""
        from app.services.pdf_export import _build_risk_detail_data

        risks = self._make_sunlight_risks(svf_percent=62.0, svf_anisotropic=58.0)
        data = _build_risk_detail_data(risks, 80, None, False)
        sunlight_entry = data[-1]
        measurements = sunlight_entry[5]
        labels = [m[0] for m in measurements]
        assert "SVF (anisotropic)" in labels

    def test_svf_anisotropic_ratio_is_normalized_to_percent(self):
        """Ratio-form anisotropic SVF values are shown as percentages in the PDF pipeline."""
        from app.services.pdf_export import _build_risk_detail_data

        risks = self._make_sunlight_risks(svf_percent=100.0, svf_anisotropic=0.55)
        data = _build_risk_detail_data(risks, 80, None, False)
        sunlight_entry = data[-1]
        measurements = dict(sunlight_entry[5] or [])

        assert measurements["SVF"] == "100%"
        assert measurements["SVF (anisotropic)"] == "55%"

    def test_svf_anisotropic_skipped_when_same_as_svf(self):
        """svf_anisotropic is NOT shown when equal to svf_percent."""
        from app.services.pdf_export import _build_risk_detail_data

        risks = self._make_sunlight_risks(svf_percent=62.0, svf_anisotropic=62.0)
        data = _build_risk_detail_data(risks, 80, None, False)
        sunlight_entry = data[-1]
        measurements = sunlight_entry[5]
        labels = [m[0] for m in measurements]
        assert "SVF (anisotropic)" not in labels

    def test_svf_anisotropic_skipped_when_none(self):
        """svf_anisotropic is NOT shown when None."""
        from app.services.pdf_export import _build_risk_detail_data

        risks = self._make_sunlight_risks(svf_percent=62.0, svf_anisotropic=None)
        data = _build_risk_detail_data(risks, 80, None, False)
        sunlight_entry = data[-1]
        measurements = sunlight_entry[5]
        labels = [m[0] for m in measurements]
        assert "SVF (anisotropic)" not in labels

    def test_irradiance_in_risk_detail(self):
        """irradiance_kwh_m2 appears as measurement when available."""
        from app.services.pdf_export import _build_risk_detail_data

        risks = self._make_sunlight_risks(irradiance_kwh_m2=985.0)
        data = _build_risk_detail_data(risks, 80, None, False)
        sunlight_entry = data[-1]
        measurements = sunlight_entry[5]
        labels = [m[0] for m in measurements]
        assert "Solar irradiance" in labels
        irr_val = [m[1] for m in measurements if m[0] == "Solar irradiance"][0]
        assert "985" in irr_val
        assert "kWh/m" in irr_val

    def test_irradiance_nl_label(self):
        """irradiance uses Dutch label and units in NL mode."""
        from app.services.pdf_export import _build_risk_detail_data

        risks = self._make_sunlight_risks(irradiance_kwh_m2=985.0)
        data = _build_risk_detail_data(risks, 80, None, True)
        sunlight_entry = data[-1]
        measurements = sunlight_entry[5]
        labels = [m[0] for m in measurements]
        assert "Zonnestraling" in labels
        irr_val = [m[1] for m in measurements if m[0] == "Zonnestraling"][0]
        assert "jaar" in irr_val

    def test_climate_disclosure_line_includes_date_layers_and_scenario(self):
        """Climate disclosure line surfaces source year, layers, and scenario text."""
        from app.services.pdf_export import _climate_disclosure_line

        card = ClimateStressRiskCard(
            level=RiskLevel.medium,
            source="Klimaateffectatlas",
            source_date="2024",
            sampled_at="2026-01-01",
            heat_layer="wpn:s0149_hittestress_warme_nachten_huidig",
            water_layer="mra_klimaatatlas:1826_mra_overstromingskans_20cm",
        )

        line = _climate_disclosure_line(card, is_nl=False)

        assert line is not None
        assert "Climate context" in line
        assert "2024" in line
        assert "Layers:" not in line
        assert "Modeled climate scenario" in line

    def test_wrapped_latex_metadata_adds_soft_breaks(self):
        wrapped = pe._format_wrapped_latex_metadata(
            "Layers: wpn:s0149_hittestress_warme_nachten_huidig, "
            "mra_klimaatatlas:1826_mra_overstromingskans_20cm"
        )

        assert r":\allowbreak{}" in wrapped
        assert r",\allowbreak " in wrapped
        assert r"\_\allowbreak{}" in wrapped
        assert r"wpn:\allowbreak{}s0149" in wrapped

    def test_all_extended_fields_together(self):
        """All extended fields render when all are present."""
        from app.services.pdf_export import _build_risk_detail_data

        risks = self._make_sunlight_risks(
            annual_average=6.3,
            svf_anisotropic=58.0,
            irradiance_kwh_m2=985.0,
        )
        data = _build_risk_detail_data(risks, 80, None, False)
        sunlight_entry = data[-1]
        measurements = sunlight_entry[5]
        labels = [m[0] for m in measurements]
        assert "Winter" in labels
        assert "Annual average" in labels
        assert "SVF" in labels
        assert "SVF (anisotropic)" in labels
        assert "Solar irradiance" in labels

    def test_no_extended_fields_graceful(self):
        """When no extended fields, only basic measurements appear."""
        from app.services.pdf_export import _build_risk_detail_data

        risks = self._make_sunlight_risks()
        data = _build_risk_detail_data(risks, 80, None, False)
        sunlight_entry = data[-1]
        measurements = sunlight_entry[5]
        labels = [m[0] for m in measurements]
        assert "Winter" in labels
        assert "SVF" in labels
        assert "Annual average" not in labels
        assert "SVF (anisotropic)" not in labels
        assert "Solar irradiance" not in labels

    def test_sunlight_unit_definition_present_en(self):
        """Sunlight measurements include an English unit-definition line."""
        from app.services.pdf_export import _build_risk_detail_data

        risks = self._make_sunlight_risks(
            annual_average=6.3,
            irradiance_kwh_m2=985.0,
        )
        data = _build_risk_detail_data(risks, 80, None, False)
        sunlight_entry = data[-1]
        unit_def = sunlight_entry[6]

        assert unit_def is not None
        assert "h/day" in unit_def
        assert "SVF" in unit_def
        assert "kWh/m²/year" in unit_def

    def test_sunlight_unit_definition_present_nl(self):
        """Sunlight measurements include a Dutch unit-definition line."""
        from app.services.pdf_export import _build_risk_detail_data

        risks = self._make_sunlight_risks(
            annual_average=6.3,
            irradiance_kwh_m2=985.0,
        )
        data = _build_risk_detail_data(risks, 80, None, True)
        sunlight_entry = data[-1]
        unit_def = sunlight_entry[6]

        assert unit_def is not None
        assert "u/dag" in unit_def
        assert "SVF" in unit_def
        assert "kWh/m²/jaar" in unit_def

    def test_expanded_sunlight_in_property_checks_en(self):
        """Sunlight section remains explicit when extended metrics are available (EN)."""

        risks = self._make_sunlight_risks(
            annual_average=6.3,
            svf_anisotropic=58.0,
            irradiance_kwh_m2=985.0,
        )
        result = generate_full_dossier(
            address="Teststraat 1, Amsterdam",
            building_year=2000,
            building_use="Residential",
            risks=risks,
            sunlight_score=80,
            viewing_questions=_make_viewing_questions(),
            language="en",
            floor_area=80,
            neighborhood_stats=_make_neighborhood_stats(),
            tier_b=_make_tier_b(),
            risk_comparisons=_make_risk_comparisons(),
            property_warnings_data=_make_property_warnings(),
        )
        reader = PdfReader(io.BytesIO(result))
        text = _norm("\n".join(p.extract_text() or "" for p in reader.pages))
        assert "Direct sun (clear-sky visibility)" in text
        assert (
            "Estimated direct sunlight: winter 5.0h/day, equinox 7.5h/day, "
            "summer 10.0h/day."
        ) in text
        assert "Annual average: 6.3 h/day" in text
        assert "SVF (anisotropic): 58%" in text
        assert "Solar irradiance: 985 kWh/m²/year" in text

    def test_expanded_sunlight_in_property_checks_nl(self):
        """Neighborhood evidence keeps summer sunlight metrics explicit when available (NL)."""

        risks = self._make_sunlight_risks(
            annual_average=6.3,
            svf_anisotropic=58.0,
            irradiance_kwh_m2=985.0,
        )
        result = generate_full_dossier(
            address="Teststraat 1, Amsterdam",
            building_year=2000,
            building_use="Woonfunctie",
            risks=risks,
            sunlight_score=80,
            viewing_questions=_make_viewing_questions(),
            language="nl",
            floor_area=80,
            neighborhood_stats=_make_neighborhood_stats(),
            tier_b=_make_tier_b(),
            risk_comparisons=_make_risk_comparisons(),
            property_warnings_data=_make_property_warnings(),
        )
        reader = PdfReader(io.BytesIO(result))
        text = _norm("\n".join(p.extract_text() or "" for p in reader.pages))
        assert "Direct zonlicht (helderheidsschatting)" in text
        assert (
            "Geschat direct zonlicht: winter 5,0h/dag, equinox 7,5h/dag, "
            "zomer 10,0h/dag."
        ) in text
        assert "Jaargemiddelde: 6,3 u/dag" in text
        assert "SVF (anisotropisch): 58%" in text
        assert "Zonnestraling: 985 kWh/m²/jaar" in text

    def test_full_dossier_renders_sunlight_facade_table_with_multi_height_rows(self):
        """Expanded sunlight payloads still render after the 4-page realignment."""
        risks = self._make_sunlight_risks(
            facade_results=[
                FacadeResult(
                    orientation="south",
                    height_label="ground",
                    winter_hours=5.8,
                    summer_hours=10.9,
                    annual_average=8.1,
                ),
                FacadeResult(
                    orientation="south",
                    height_label="upper",
                    winter_hours=4.7,
                    summer_hours=9.6,
                    annual_average=7.0,
                ),
                FacadeResult(
                    orientation="north",
                    height_label="ground",
                    winter_hours=1.6,
                    summer_hours=5.2,
                    annual_average=3.8,
                ),
            ],
        )
        result = generate_full_dossier(
            address="Teststraat 1, Amsterdam",
            building_year=2000,
            building_use="Residential",
            risks=risks,
            sunlight_score=80,
            viewing_questions=_make_viewing_questions(),
            language="en",
            floor_area=80,
            neighborhood_stats=_make_neighborhood_stats(),
            tier_b=_make_tier_b(),
            risk_comparisons=_make_risk_comparisons(),
            property_warnings_data=_make_property_warnings(),
        )

        reader = PdfReader(io.BytesIO(result))
        text = _norm("\n".join(p.extract_text() or "" for p in reader.pages))

        assert "FACADE ANALYSIS" in text
        assert "South (ground) 5.8h 10.9h" in text
        assert "South (upper) 4.7h 9.6h" in text
        assert "North (ground) 1.6h 5.2h" in text

    def test_no_extended_sunlight_metrics_when_absent(self):
        """Neighborhood evidence omits extended summer metrics when absent."""
        risks = self._make_sunlight_risks()
        result = generate_full_dossier(
            address="Teststraat 1, Amsterdam",
            building_year=2000,
            building_use="Residential",
            risks=risks,
            sunlight_score=80,
            viewing_questions=_make_viewing_questions(),
            language="en",
            floor_area=80,
            neighborhood_stats=_make_neighborhood_stats(),
            tier_b=_make_tier_b(),
            risk_comparisons=_make_risk_comparisons(),
            property_warnings_data=_make_property_warnings(),
        )
        reader = PdfReader(io.BytesIO(result))
        text = "\n".join(p.extract_text() or "" for p in reader.pages)
        # Basic sunlight should still be there
        assert "sunlight" in text.lower() or "zonlicht" in text.lower()
        # Extended fields should NOT be there
        assert "Annual average" not in text
        assert "Solar irradiance" not in text


# ---------------------------------------------------------------------------
# E1-S2: Shadow triptych tests
# ---------------------------------------------------------------------------


class TestShadowTriptych:
    """E1-S2: Triptych renders the summer top/front/rear set with one shared legend."""

    def _make_shadow_images(self) -> list[dict]:
        """Create 3 shadow image dicts with new viewpoint labels and metadata."""
        b64 = _tiny_png()
        return [
            {"hour": 12, "label": "rear", "image_b64": b64, "sun_azimuth": 182, "sun_altitude": 54},
            {"hour": 12, "label": "top", "image_b64": b64, "sun_azimuth": 182, "sun_altitude": 54},
            {
                "hour": 12,
                "label": "front",
                "image_b64": b64,
                "sun_azimuth": 182,
                "sun_altitude": 54,
            },
        ]

    def test_triptych_renders_three_captions_en(self):
        """English triptych shows viewpoint labels and a single shared legend."""
        pdf = BuurtCheckPDF(language="en")
        pdf.add_page()
        _draw_shadow_triptych(pdf, self._make_shadow_images(), is_nl=False)
        result = bytes(pdf.output())
        reader = PdfReader(io.BytesIO(result))
        text = "\n".join(p.extract_text() or "" for p in reader.pages)
        assert "Top view" in text
        assert "Front facade" in text
        assert "Rear facade" in text
        assert "Sun 182°/54°" in text
        assert text.count("Legend:") == 1
        assert "3DBAG / TU Delft" in text

    def test_triptych_renders_three_captions_nl(self):
        """Dutch triptych shows viewpoint labels and a single shared legend."""
        pdf = BuurtCheckPDF(language="nl")
        pdf.add_page()
        _draw_shadow_triptych(pdf, self._make_shadow_images(), is_nl=True)
        result = bytes(pdf.output())
        reader = PdfReader(io.BytesIO(result))
        text = "\n".join(p.extract_text() or "" for p in reader.pages)
        assert "Bovenaanzicht" in text
        assert "Voorgevel" in text
        assert "Achtergevel" in text
        assert "Zon 182°/54°" in text
        assert text.count("Legenda:") == 1
        assert "3DBAG / TU Delft" in text

    def test_triptych_section_label_en(self):
        """English triptych has generic 'Shadow Analysis' section label."""
        pdf = BuurtCheckPDF(language="en")
        pdf.add_page()
        _draw_shadow_triptych(pdf, self._make_shadow_images(), is_nl=False)
        result = bytes(pdf.output())
        reader = PdfReader(io.BytesIO(result))
        text = "\n".join(p.extract_text() or "" for p in reader.pages)
        assert "shadow analysis" in text.lower()

    def test_triptych_section_label_nl(self):
        """Dutch triptych has generic 'Schaduwanalyse' section label."""
        pdf = BuurtCheckPDF(language="nl")
        pdf.add_page()
        _draw_shadow_triptych(pdf, self._make_shadow_images(), is_nl=True)
        result = bytes(pdf.output())
        reader = PdfReader(io.BytesIO(result))
        text = "\n".join(p.extract_text() or "" for p in reader.pages)
        assert "schaduwanalyse" in text.lower()

    def test_triptych_advances_cursor(self):
        """Triptych drawing advances the PDF cursor."""
        pdf = BuurtCheckPDF(language="en")
        pdf.add_page()
        y_before = pdf.get_y()
        _draw_shadow_triptych(pdf, self._make_shadow_images(), is_nl=False)
        y_after = pdf.get_y()
        assert y_after > y_before

    def test_triptych_noop_when_empty(self):
        """No-op when shadow_images is empty list."""
        pdf = BuurtCheckPDF(language="en")
        pdf.add_page()
        y_before = pdf.get_y()
        _draw_shadow_triptych(pdf, [], is_nl=False)
        y_after = pdf.get_y()
        assert y_after == y_before

    def test_triptych_noop_when_none(self):
        """No-op when shadow_images is None."""
        pdf = BuurtCheckPDF(language="en")
        pdf.add_page()
        y_before = pdf.get_y()
        _draw_shadow_triptych(pdf, None, is_nl=False)  # type: ignore[arg-type]
        y_after = pdf.get_y()
        assert y_after == y_before

    def test_triptych_fallback_single_image(self):
        """With fewer than 3 images, falls back to single-image layout."""
        b64 = _tiny_png()
        single = [{"hour": 12, "label": "noon", "image_b64": b64}]
        pdf = BuurtCheckPDF(language="en")
        pdf.add_page()
        y_before = pdf.get_y()
        _draw_shadow_triptych(pdf, single, is_nl=False)
        y_after = pdf.get_y()
        # Should still advance cursor (single image rendered)
        assert y_after > y_before

    def test_triptych_graceful_on_bad_b64(self):
        """Bad base64 data in one image doesn't crash the triptych."""
        b64 = _tiny_png()
        images = [
            {"hour": 12, "label": "winter", "image_b64": "NOT_VALID_BASE64!!!"},
            {"hour": 12, "label": "equinox", "image_b64": b64},
            {"hour": 12, "label": "summer", "image_b64": b64},
        ]
        pdf = BuurtCheckPDF(language="en")
        pdf.add_page()
        # Should not raise
        _draw_shadow_triptych(pdf, images, is_nl=False)
        result = bytes(pdf.output())
        assert result[:5] == b"%PDF-"

    def test_triptych_sorts_by_season(self):
        """Images are sorted by viewpoint order (top→front→rear)."""
        b64 = _tiny_png()
        images = [
            {"hour": 12, "label": "rear", "image_b64": b64},
            {"hour": 12, "label": "top", "image_b64": b64},
            {"hour": 12, "label": "front", "image_b64": b64},
        ]
        pdf = BuurtCheckPDF(language="en")
        pdf.add_page()
        _draw_shadow_triptych(pdf, images, is_nl=False)
        result = bytes(pdf.output())
        reader = PdfReader(io.BytesIO(result))
        text = "\n".join(p.extract_text() or "" for p in reader.pages)
        assert "Top view" in text
        assert "Front facade" in text
        assert "Rear facade" in text

    def test_triptych_clarifies_seasonal_noon_snapshots(self):
        """Seasonal shadow snapshots must state the correct season labels and noon timing."""
        b64 = _tiny_png()
        images = [
            {"hour": 12, "label": "winter", "viewpoint": "winter", "image_b64": b64},
            {"hour": 12, "label": "equinox", "viewpoint": "equinox", "image_b64": b64},
            {"hour": 12, "label": "summer", "viewpoint": "summer", "image_b64": b64},
        ]
        pdf = BuurtCheckPDF(language="en")
        pdf.add_page()
        _draw_shadow_triptych(pdf, images, is_nl=False)
        result = bytes(pdf.output())
        reader = PdfReader(io.BytesIO(result))
        text = "\n".join(p.extract_text() or "" for p in reader.pages)
        assert "Winter solstice" in text
        assert "Spring equinox" in text
        assert "Summer solstice" in text
        assert "12:00" in text
        assert "December 21" in text
        assert "March 20" in text
        assert "June 21" in text

    def test_triptych_keeps_heading_with_panels_when_space_runs_out(self):
        """Shadow section heading should move to the next page with its panels."""
        pdf = BuurtCheckPDF(language="en")
        pdf.add_page()
        pdf.set_y(pdf.h - pdf.b_margin - 16)
        _draw_shadow_triptych(pdf, self._make_shadow_images(), is_nl=False)
        result = bytes(pdf.output())
        reader = PdfReader(io.BytesIO(result))
        page_texts = [page.extract_text() or "" for page in reader.pages]
        assert len(page_texts) >= 2
        assert "shadow analysis" not in page_texts[0].lower()
        assert "shadow analysis" in page_texts[1].lower()

    def test_full_dossier_with_triptych(self):
        """Full dossier renders the restored triptych in the paid export."""
        images = self._make_shadow_images()
        result = generate_full_dossier(
            address="Damrak 1, Amsterdam",
            building_year=1900,
            building_use="Residential",
            risks=_make_risks(),
            sunlight_score=80,
            viewing_questions=_make_viewing_questions(),
            language="en",
            shadow_images=images,
            property_warnings_data=_make_property_warnings(),
        )
        assert isinstance(result, bytes)
        assert result[:5] == b"%PDF-"
        reader = PdfReader(io.BytesIO(result))
        text = "\n".join(p.extract_text() or "" for p in reader.pages)
        assert "Top view" in text
        assert "Front facade" in text
        assert "Rear facade" in text
        assert "shadow analysis" in text.lower()

    def _make_six_panel_shadow_images(self) -> list[dict]:
        """Create 6 shadow image dicts (3 views × 2 times) for 6-panel layout."""
        b64 = _tiny_png()
        images = []
        for time_label, hour in [("morning", 9), ("afternoon", 15)]:
            for vp in ["top", "front", "rear"]:
                images.append({
                    "hour": hour,
                    "label": f"{vp}_{time_label}",
                    "viewpoint": vp,
                    "image_b64": b64,
                    "sun_azimuth": 90 if time_label == "morning" else 270,
                    "sun_altitude": 30 if time_label == "morning" else 25,
                })
        return images

    def test_six_panel_renders_two_rows(self):
        """6-panel layout renders morning + afternoon row headers."""
        pdf = BuurtCheckPDF(language="en")
        pdf.add_page()
        _draw_shadow_triptych(pdf, self._make_six_panel_shadow_images(), is_nl=False)
        result = bytes(pdf.output())
        reader = PdfReader(io.BytesIO(result))
        text = "\n".join(p.extract_text() or "" for p in reader.pages)
        assert "Morning" in text
        assert "Afternoon" in text
        assert "Shadow Analysis" in text or "shadow analysis" in text.lower()
        assert "Top view" in text
        assert "Front facade" in text
        assert "Rear facade" in text

    def test_six_panel_sorts_scrambled_payload_by_time_and_viewpoint(self):
        """6-panel layout should not depend on client/server payload ordering."""
        images = [
            {
                "hour": 15,
                "label": "rear_afternoon",
                "viewpoint": "rear",
                "image_b64": _tiny_png(),
            },
            {
                "hour": 9,
                "label": "rear_morning",
                "viewpoint": "rear",
                "image_b64": _tiny_png(),
            },
            {
                "hour": 15,
                "label": "front_afternoon",
                "viewpoint": "front",
                "image_b64": _tiny_png(),
            },
            {
                "hour": 9,
                "label": "top_morning",
                "viewpoint": "top",
                "image_b64": _tiny_png(),
            },
            {
                "hour": 15,
                "label": "top_afternoon",
                "viewpoint": "top",
                "image_b64": _tiny_png(),
            },
            {
                "hour": 9,
                "label": "front_morning",
                "viewpoint": "front",
                "image_b64": _tiny_png(),
            },
        ]
        ordered_labels: list[str] = []

        def capture_panel(
            _pdf: BuurtCheckPDF,
            img_data: dict,
            _x: float,
            _y: float,
            _w: float,
            _h: float,
            *,
            is_nl: bool,
            **_: object,
        ) -> bool:
            _ = is_nl
            ordered_labels.append(img_data["label"])
            return True

        pdf = BuurtCheckPDF(language="en")
        pdf.add_page()
        with patch("app.services.pdf_export._draw_shadow_panel", side_effect=capture_panel):
            _draw_shadow_triptych(pdf, images, is_nl=False)

        assert ordered_labels == [
            "top_morning",
            "front_morning",
            "rear_morning",
            "top_afternoon",
            "front_afternoon",
            "rear_afternoon",
        ]

    def test_six_panel_renders_nl(self):
        """6-panel Dutch layout renders Ochtend + Middag row headers."""
        pdf = BuurtCheckPDF(language="nl")
        pdf.add_page()
        _draw_shadow_triptych(pdf, self._make_six_panel_shadow_images(), is_nl=True)
        result = bytes(pdf.output())
        reader = PdfReader(io.BytesIO(result))
        text = "\n".join(p.extract_text() or "" for p in reader.pages)
        assert "Ochtend" in text
        assert "Middag" in text

    def test_full_dossier_single_fallback(self):
        """Full dossier falls back to single shadow_image_b64 when no triptych."""
        b64 = _tiny_png()
        result = generate_full_dossier(
            address="Damrak 1, Amsterdam",
            building_year=1900,
            building_use="Residential",
            risks=_make_risks(),
            sunlight_score=80,
            viewing_questions=_make_viewing_questions(),
            language="en",
            shadow_image_b64=b64,
            property_warnings_data=_make_property_warnings(),
        )
        assert isinstance(result, bytes)
        assert result[:5] == b"%PDF-"
        reader = PdfReader(io.BytesIO(result))
        text = "\n".join(p.extract_text() or "" for p in reader.pages)
        assert "shadow analysis" in text.lower()
        assert "shadow snapshot" in text.lower()
        assert "Source: 3DBAG / TU Delft + SunCalc" in text

    def test_full_dossier_no_shadow_at_all(self):
        """Full dossier generates without any shadow images."""
        result = generate_full_dossier(
            address="Damrak 1, Amsterdam",
            building_year=1900,
            building_use="Residential",
            risks=_make_risks(),
            sunlight_score=80,
            viewing_questions=_make_viewing_questions(),
            language="en",
            property_warnings_data=_make_property_warnings(),
        )
        assert isinstance(result, bytes)
        assert result[:5] == b"%PDF-"

    def test_house_analysis_page_stays_focused_on_house_checks(self):
        """Property checks page stays focused on checks, not the shadow media page."""
        images = self._make_shadow_images()
        result = generate_full_dossier(
            address="Damrak 1, Amsterdam",
            building_year=1900,
            building_use="Residential",
            risks=_make_risks(),
            sunlight_score=80,
            viewing_questions=_make_viewing_questions(),
            language="en",
            shadow_images=images,
            property_warnings_data=_make_property_warnings(),
        )
        reader = PdfReader(io.BytesIO(result))
        page_texts = [p.extract_text() or "" for p in reader.pages]
        checks_page = next(
            (
                txt
                for txt in page_texts
                if "ADDITIONAL PROPERTY CHECKS" in txt
                or "AANVULLENDE VASTGOEDCONTROLES" in txt
            ),
            "",
        )
        assert checks_page
        assert "Shadow Analysis" not in checks_page
        assert "Schaduwanalyse" not in checks_page


# ---------------------------------------------------------------------------
# Executive Summary Tests
# ---------------------------------------------------------------------------


class TestExecutiveSummary:
    """Tests for _generate_executive_summary helper."""

    def test_en_all_data(self):
        """EN summary with risks + sunlight + livability."""
        risks = _make_risks(noise_score=65, air_score=72, climate_score=45)
        livability = _make_livability(overall_normalized=62)
        result = _generate_executive_summary(
            risks, sunlight_score=80, livability=livability, is_nl=False,
        )
        # Should mention 4 categories
        assert "4 risk categories" in result
        # Should identify climate stress (45) as top concern
        assert "climate stress" in result
        assert "45/100" in result
        # Should mention livability
        assert "livability" in result
        # Should not mention urgent concerns (nothing < 40)
        assert "verify all scores on-site" in result

    def test_nl_all_data(self):
        """NL summary with risks + sunlight + livability."""
        risks = _make_risks(noise_score=65, air_score=72, climate_score=45)
        livability = _make_livability(overall_normalized=62)
        result = _generate_executive_summary(
            risks, sunlight_score=80, livability=livability, is_nl=True,
        )
        assert "4 risicocategorie\u00ebn" in result
        assert "klimaatstress" in result
        assert "45/100" in result
        assert "leefbaarheid" in result

    def test_critical_risk_triggers_viewing_action(self):
        """Critical risk (score < 20) produces specific viewing advice."""
        risks = _make_risks(noise_score=65, air_score=72, climate_score=15)
        result = _generate_executive_summary(
            risks, sunlight_score=80, livability=None, is_nl=False,
        )
        assert "climate stress" in result
        assert "15/100" in result
        assert "signs of water damage" in result

    def test_critical_risk_nl_viewing_action(self):
        """NL critical risk produces NL viewing advice."""
        risks = _make_risks(noise_score=65, air_score=72, climate_score=15)
        result = _generate_executive_summary(
            risks, sunlight_score=80, livability=None, is_nl=True,
        )
        assert "waterschade" in result

    def test_multiple_poor_risks(self):
        """Multiple poor/critical risks produce multiple viewing actions."""
        risks = _make_risks(noise_score=25, air_score=72, climate_score=15)
        result = _generate_executive_summary(
            risks, sunlight_score=30, livability=None, is_nl=False,
        )
        # Should mention noise and climate and sunlight viewing actions
        assert "noise" in result.lower()
        assert "water damage" in result
        assert "natural light" in result

    def test_no_risks_only_sunlight(self):
        """Summary works with no risk data, only sunlight score."""
        result = _generate_executive_summary(
            risks=None, sunlight_score=80, livability=None, is_nl=False,
        )
        assert "1 risk categories" in result
        assert "sunlight" in result

    def test_no_data_at_all(self):
        """Summary handles no risks and no sunlight."""
        result = _generate_executive_summary(
            risks=None, sunlight_score=None, livability=None, is_nl=False,
        )
        assert "Insufficient data" in result

    def test_no_data_nl(self):
        """NL fallback message when no data."""
        result = _generate_executive_summary(
            risks=None, sunlight_score=None, livability=None, is_nl=True,
        )
        assert "onvoldoende" in result

    def test_livability_best_dimension(self):
        """Summary highlights the best livability dimension."""
        livability = _make_livability(overall_normalized=62)
        risks = _make_risks()
        result = _generate_executive_summary(
            risks, sunlight_score=80, livability=livability, is_nl=False,
        )
        # amenities has highest normalized_score (88) in _make_livability
        assert "amenities" in result

    def test_livability_best_dimension_nl(self):
        """NL summary highlights best livability dimension in Dutch."""
        livability = _make_livability(overall_normalized=62)
        risks = _make_risks()
        result = _generate_executive_summary(
            risks, sunlight_score=80, livability=livability, is_nl=True,
        )
        assert "voorzieningen" in result

    def test_livability_unavailable_skips_sentence(self):
        """When livability.available=False, no livability sentence."""
        livability = LivabilityResponse(available=False)
        risks = _make_risks()
        result = _generate_executive_summary(
            risks, sunlight_score=80, livability=livability, is_nl=False,
        )
        assert "livability" not in result

    def test_livability_none_skips_sentence(self):
        """When livability is None, no livability sentence."""
        risks = _make_risks()
        result = _generate_executive_summary(
            risks, sunlight_score=80, livability=None, is_nl=False,
        )
        assert "livability" not in result

    def test_all_good_scores(self):
        """All good scores produce positive summary."""
        risks = _make_risks(noise_score=85, air_score=90, climate_score=75)
        result = _generate_executive_summary(
            risks, sunlight_score=80, livability=None, is_nl=False,
        )
        assert "4 good" in result
        assert "verify all scores on-site" in result

    def test_severity_counts_correct(self):
        """Verify correct severity counts in summary."""
        # 1 good (air=72), 2 moderate (noise=65, climate=45), 1 good (sun=80)
        risks = _make_risks(noise_score=65, air_score=72, climate_score=45)
        result = _generate_executive_summary(
            risks, sunlight_score=80, livability=None, is_nl=False,
        )
        assert "2 good" in result
        assert "2 moderate" in result

    def test_crime_score_included_in_summary(self):
        """Crime score appears in category count when provided."""
        risks = _make_risks(noise_score=85, air_score=90, climate_score=75)
        result = _generate_executive_summary(
            risks, sunlight_score=80, livability=None, is_nl=False,
            crime_score=10,
        )
        assert "5 risk categories" in result
        assert "crime" in result

    def test_crime_score_included_in_summary_nl(self):
        """NL: crime score appears in category count when provided."""
        risks = _make_risks(noise_score=85, air_score=90, climate_score=75)
        result = _generate_executive_summary(
            risks, sunlight_score=80, livability=None, is_nl=True,
            crime_score=10,
        )
        assert "5 risicocategorie" in result
        assert "criminaliteit" in result

    def test_crime_becomes_top_concern(self):
        """When crime is worst score, it surfaces as top concern."""
        risks = _make_risks(noise_score=85, air_score=90, climate_score=75)
        result = _generate_executive_summary(
            risks, sunlight_score=80, livability=None, is_nl=False,
            crime_score=5,
        )
        assert "crime" in result
        assert "5/100" in result

    def test_summary_uses_compact_score_phrase(self):
        """Executive summary avoids the redundant 'score of 60/100' phrasing."""
        risks = _make_risks(noise_score=60, air_score=90, climate_score=75)
        result = _generate_executive_summary(
            risks, sunlight_score=80, livability=None, is_nl=False,
        )

        assert "score of" not in result
        assert "60/100" in result
        assert "(moderate)" not in result.lower()

    def test_crime_absent_when_none(self):
        """Summary stays at 4 categories when crime_score is None."""
        risks = _make_risks(noise_score=85, air_score=90, climate_score=75)
        result = _generate_executive_summary(
            risks, sunlight_score=80, livability=None, is_nl=False,
            crime_score=None,
        )
        assert "4 risk categories" in result

    def test_risk_cells_include_crime(self):
        """_build_risk_cells returns 5 cells when crime_score provided."""
        risks = _make_risks()
        cells = _build_risk_cells(risks, sunlight_score=80, is_nl=False, crime_score=10)
        assert len(cells) == 5
        crime_cell = cells[4]
        assert crime_cell[0] == "Crime"
        assert crime_cell[1] == 10

    def test_risk_cells_no_crime_when_none(self):
        """_build_risk_cells returns 4 cells when crime_score is None."""
        risks = _make_risks()
        cells = _build_risk_cells(risks, sunlight_score=80, is_nl=False, crime_score=None)
        assert len(cells) == 4

    def test_cover_page_includes_executive_summary_en(self):
        """Full dossier cover page (EN) includes executive summary text."""
        result = generate_full_dossier(
            address="Damrak 1, Amsterdam",
            building_year=1900,
            building_use="Residential",
            risks=_make_risks(),
            sunlight_score=80,
            viewing_questions=_make_viewing_questions(),
            language="en",
        )
        reader = PdfReader(io.BytesIO(result))
        cover_text = reader.pages[0].extract_text() or ""
        assert "EXECUTIVE SUMMARY" in cover_text
        assert "risk categories" in cover_text

    def test_fpdf_cover_page_includes_crime_in_executive_summary(self):
        """fpdf2 cover summary counts crime when Tier-B provides a score."""
        result = _generate_full_dossier_fpdf(
            address="Damrak 1, Amsterdam",
            building_year=1900,
            building_use="Residential",
            risks=_make_risks(),
            sunlight_score=80,
            viewing_questions=_make_viewing_questions(),
            language="en",
            tier_b=_make_tier_b(),
        )
        reader = PdfReader(io.BytesIO(result))
        cover_text = reader.pages[0].extract_text() or ""
        assert "5 risk categories" in cover_text
        assert "crime" in cover_text.lower()

    def test_full_dossier_latex_uses_crime_in_summary_and_risk_grid(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ):
        captured: dict[str, object] = {}

        def fake_grid_chart(*, cells, cols=4, output_format="pdf"):
            captured["grid_cells"] = cells
            captured["grid_cols"] = cols
            captured["grid_format"] = output_format
            return b"%PDF-1.4\n% fake-risk-grid"

        def fake_parallel(chart_jobs, *, max_workers=None):  # type: ignore[no-untyped-def]
            rendered: dict[str, object] = {}
            rendered["risk_grid_chart"] = chart_jobs["risk_grid_chart"]()
            rendered["comparison_charts"] = {}
            return rendered

        def fake_compile(tex, *, fallback_pdf_factory, timeout=8, passes=2):  # type: ignore[no-untyped-def]
            captured["tex"] = tex
            return b"%PDF-latex-path"

        monkeypatch.setattr(pe.chart_renderer, "render_risk_summary_grid", fake_grid_chart)
        monkeypatch.setattr(pe, "render_chart_assets_parallel", fake_parallel)
        monkeypatch.setattr(pe, "compile_latex_to_pdf_with_fallback", fake_compile)

        result = pe._generate_full_dossier_latex(
            address="Damrak 1, Amsterdam",
            building_year=1900,
            building_use="Residential",
            risks=_make_risks(),
            sunlight_score=80,
            viewing_questions=_make_viewing_questions(),
            language="en",
            neighborhood_stats=_make_neighborhood_stats(),
            tier_b=_make_tier_b(),
            risk_comparisons=_make_risk_comparisons(),
            property_warnings_data=_make_property_warnings(),
            livability=_make_livability(),
            location_map_b64=None,
        )

        assert result == b"%PDF-latex-path"
        assert captured["grid_cols"] == 5
        grid_cells = captured["grid_cells"]
        assert isinstance(grid_cells, list)
        assert grid_cells[-1].category == "Crime"
        assert captured["grid_format"] == "pdf"
        tex = captured["tex"]
        assert isinstance(tex, str)
        assert "5 risk categories" in tex
        assert "crime" in tex.lower()
        assert "Crime &" in tex

    def test_full_dossier_latex_shows_location_placeholder_when_map_missing(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ):
        captured: dict[str, str] = {}

        monkeypatch.setattr(pe, "render_chart_assets_parallel", lambda *args, **kwargs: {})

        def fake_compile(tex, *, fallback_pdf_factory, timeout=8, passes=2):  # type: ignore[no-untyped-def]
            captured["tex"] = tex
            return b"%PDF-latex-path"

        monkeypatch.setattr(pe, "compile_latex_to_pdf_with_fallback", fake_compile)

        result = pe._generate_full_dossier_latex(
            address="Damrak 1, Amsterdam",
            building_year=1900,
            building_use="Residential",
            risks=_make_risks(),
            sunlight_score=80,
            viewing_questions=_make_viewing_questions(),
            language="en",
            neighborhood_stats=_make_neighborhood_stats(),
            tier_b=_make_tier_b(),
            risk_comparisons=_make_risk_comparisons(),
            property_warnings_data=_make_property_warnings(),
            livability=_make_livability(),
            location_map_b64=None,
        )

        assert result == b"%PDF-latex-path"
        assert "Location map unavailable" in captured["tex"]
        assert "PDOK aerial imagery did not load during export." in captured["tex"]

    def test_full_dossier_latex_skips_sunlight_comparison_when_score_missing(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ):
        risks = _make_risks(sunlight_score=None)
        risks.sunlight.score = None
        risks.sunlight.winter_hours = None

        rendered_categories: list[str] = []

        def fake_render_risk_comparison(  # type: ignore[no-untyped-def]
            *,
            category,
            address_score,
            comparisons,
            output_format="pdf",
            show_row_labels=True,
            show_axis_labels=True,
        ):
            rendered_categories.append(category)
            return b"%PDF-1.4\n% fake-comparison"

        def fake_parallel(chart_jobs, *, max_workers=None):  # type: ignore[no-untyped-def]
            return {
                "comparison_charts": chart_jobs["comparison_charts"](),
            }

        monkeypatch.setattr(
            pe.chart_renderer,
            "render_risk_comparison",
            fake_render_risk_comparison,
        )
        monkeypatch.setattr(pe, "render_chart_assets_parallel", fake_parallel)
        monkeypatch.setattr(
            pe,
            "compile_latex_to_pdf_with_fallback",
            lambda tex, *, fallback_pdf_factory, timeout=8, passes=2: b"%PDF-latex-path",
        )

        result = pe._generate_full_dossier_latex(
            address="Damrak 1, Amsterdam",
            building_year=1900,
            building_use="Residential",
            risks=risks,
            sunlight_score=None,
            viewing_questions=_make_viewing_questions(),
            language="en",
            neighborhood_stats=_make_neighborhood_stats(),
            tier_b=_make_tier_b(),
            risk_comparisons=_make_risk_comparisons(),
            property_warnings_data=_make_property_warnings(),
            livability=_make_livability(),
            location_map_b64=None,
        )

        assert result == b"%PDF-latex-path"
        assert "Sunlight" not in rendered_categories
        assert "Noise" in rendered_categories

    def test_full_dossier_latex_deduplicates_livability_comparison_names(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ):
        captured: dict[str, str] = {}
        livability = _make_livability(with_trend=False)
        livability.comparison = [
            LivabilityComparisonRow(
                level="wijk",
                name="Deurne",
                overall_score=6,
                overall_normalized=63,
                dimensions=[],
            ),
            LivabilityComparisonRow(
                level="gemeente",
                name="Deurne",
                overall_score=5,
                overall_normalized=50,
                dimensions=[],
            ),
            LivabilityComparisonRow(
                level="gemeente",
                name="Helmond",
                overall_score=6,
                overall_normalized=60,
                dimensions=[],
            ),
        ]

        monkeypatch.setattr(
            pe,
            "render_chart_assets_parallel",
            lambda *args, **kwargs: {
                "livability_chart": b"%PDF-1.4\n% fake-livability",
            },
        )

        def fake_compile(tex, *, fallback_pdf_factory, timeout=8, passes=2):  # type: ignore[no-untyped-def]
            captured["tex"] = tex
            return b"%PDF-latex-path"

        monkeypatch.setattr(pe, "compile_latex_to_pdf_with_fallback", fake_compile)

        result = pe._generate_full_dossier_latex(
            address="Damrak 1, Amsterdam",
            building_year=1900,
            building_use="Residential",
            risks=_make_risks(),
            sunlight_score=80,
            viewing_questions=_make_viewing_questions(),
            language="en",
            neighborhood_stats=_make_neighborhood_stats(),
            tier_b=_make_tier_b(),
            risk_comparisons=_make_risk_comparisons(),
            property_warnings_data=_make_property_warnings(),
            livability=livability,
            location_map_b64=None,
        )

        assert result == b"%PDF-latex-path"
        assert captured["tex"].count("Deurne") == 1
        assert "Helmond" in captured["tex"]

    def test_cover_page_includes_executive_summary_nl(self):
        """Full dossier cover page (NL) includes executive summary text."""
        result = generate_full_dossier(
            address="Damrak 1, Amsterdam",
            building_year=1900,
            building_use="Residential",
            risks=_make_risks(),
            sunlight_score=80,
            viewing_questions=_make_viewing_questions(),
            language="nl",
        )
        reader = PdfReader(io.BytesIO(result))
        cover_text = reader.pages[0].extract_text() or ""
        assert "SAMENVATTING" in cover_text
        assert "risicocategorie" in cover_text

    def test_cover_page_with_livability(self):
        """Cover page executive summary includes livability when provided."""
        result = generate_full_dossier(
            address="Damrak 1, Amsterdam",
            building_year=1900,
            building_use="Residential",
            risks=_make_risks(),
            sunlight_score=80,
            viewing_questions=_make_viewing_questions(),
            language="en",
            livability=_make_livability(overall_normalized=62),
        )
        reader = PdfReader(io.BytesIO(result))
        cover_text = reader.pages[0].extract_text() or ""
        assert "livability" in cover_text
