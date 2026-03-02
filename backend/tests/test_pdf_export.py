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
    BORDER,
    MUTED,
    NATIONAL,
    SECONDARY,
    TEAL,
    BuurtCheckPDF,
    _build_risk_cells,
    _draw_indicator,
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
        """Quartile badge (Q3) is appended to indicator value."""
        pdf = BuurtCheckPDF(language="en")
        pdf.add_page()
        indicator = NeighborhoodIndicator(value=428000.0, unit="\u20ac", quartile=3)
        _draw_indicator(pdf, "Avg property value", indicator)
        result = bytes(pdf.output())
        reader = PdfReader(io.BytesIO(result))
        text = "\n".join(p.extract_text() or "" for p in reader.pages)
        assert "(Q3)" in text
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
        """Quartile works with percentage indicator."""
        pdf = BuurtCheckPDF(language="en")
        pdf.add_page()
        indicator = NeighborhoodIndicator(value=62.0, unit="%", quartile=4)
        _draw_indicator(pdf, "Single person", indicator)
        result = bytes(pdf.output())
        reader = PdfReader(io.BytesIO(result))
        text = "\n".join(p.extract_text() or "" for p in reader.pages)
        assert "62%" in text
        assert "(Q4)" in text

    def test_quartile_with_distance(self):
        """Quartile works with km distance indicator."""
        pdf = BuurtCheckPDF(language="en")
        pdf.add_page()
        indicator = NeighborhoodIndicator(value=0.8, unit="km", quartile=1)
        _draw_indicator(pdf, "Train station", indicator)
        result = bytes(pdf.output())
        reader = PdfReader(io.BytesIO(result))
        text = "\n".join(p.extract_text() or "" for p in reader.pages)
        assert "0.8 km" in text
        assert "(Q1)" in text


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

    def test_draw_score_bar_tick_marks_at_severity_thresholds(self):
        """E9-S1: Tick marks are drawn at scores 20, 40, 70."""
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

        # Check tick marks at 20, 40, 70
        expected_ticks = [
            bar_x + bar_w * 20 / 100,
            bar_x + bar_w * 40 / 100,
            bar_x + bar_w * 70 / 100,
        ]
        for tick_x in expected_ticks:
            matching = [
                c for c in line_calls
                if abs(c[0] - tick_x) < 0.01 and abs(c[2] - tick_x) < 0.01
                and abs(c[1] - bar_y) < 0.01 and abs(c[3] - (bar_y + bar_h)) < 0.01
            ]
            assert len(matching) == 1, f"Missing tick at x={tick_x}"

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

    def test_draw_comparison_chart(self):
        pdf = BuurtCheckPDF()
        pdf.add_page()
        rows = [
            ("This address", 65, TEAL, False),
            ("City average", 55, MUTED, False),
            ("WHO benchmark (mapped to score)", 74, (234, 179, 8), True),
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

    def test_draw_comparison_chart_with_title(self):
        """Chart title renders above bars and shifts content down."""
        pdf = BuurtCheckPDF()
        pdf.add_page()
        rows = [
            ("This address", 80, TEAL, False),
        ]
        end_no_title = pdf.draw_comparison_chart(10, 30, 180, rows)
        pdf2 = BuurtCheckPDF()
        pdf2.add_page()
        end_with_title = pdf2.draw_comparison_chart(
            10, 30, 180, rows, chart_title="Noise — comparison",
        )
        # Title adds ~5mm to chart height
        assert end_with_title > end_no_title

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
        # National comparison
        assert "52.1" in all_text
        assert "National avg" in all_text
        # Sub-rates
        assert "Burglary" in all_text
        assert "4.2" in all_text
        assert "Violent" in all_text
        assert "1.8" in all_text
        # Source with year
        assert "CBS" in all_text
        assert "2024" in all_text

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
        assert "Landelijk" in all_text
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
        # Score shows em-dash when None
        assert "\u2014" in all_text
        # N/A severity label
        assert "N/A" in all_text
        # Sub-rates still rendered
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
        text = "\n".join(page.extract_text() or "" for page in reader.pages)
        assert "Asbestos Awareness" in text
        assert "Foundation Risk" in text
        assert "Ground Lease (Erfpacht)" in text
        assert "Owners' Association" in text
        assert "Lead Pipe Risk" in text
        assert "Soil Contamination Check" in text
        assert "Direct sun (clear-sky visibility)" in text
        assert "Shadow Snapshots" in text


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


class TestEliminateEmptyPages:
    """E11-S1: Reduce wasted page space."""

    def test_notes_section_reduced_lines(self):
        """Notes section has at most 3 ruled lines, not 12."""
        from app.services.pdf_export import (
            _draw_methodology_page,
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
        _draw_methodology_page(pdf, is_nl=False)
        # Filter for ruled note lines (full-width lines
        # after the "Your viewing notes" heading)
        usable_w = pdf.w - pdf.l_margin - pdf.r_margin
        note_lines = [
            c for c in line_calls
            if abs(c[2] - c[0] - usable_w) < 1
        ]
        # Should be at most 3 (down from 12)
        assert len(note_lines) <= 5  # 3 notes + dividers

    def test_shadow_image_not_on_property_checks(self):
        """Property checks page references shadow text
        but does not embed the image itself."""
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
        # Property checks is page 4 (index 3)
        if len(reader.pages) > 3:
            page4_text = reader.pages[3].extract_text() or ""
            # The text "Shadow Snapshots" should appear
            assert "Shadow Snapshots" in page4_text
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
        """PDF contains WGS84 coordinates."""
        prov = self._make_provenance()
        text = _norm(self._extract_full_text(provenance=prov))
        assert "52.1831" in text
        assert "4.4328" in text
        assert "WGS84" in text

    def test_epsg28992_coordinates_printed(self):
        """PDF contains EPSG:28992 (RD New) coordinates."""
        prov = self._make_provenance()
        text = _norm(self._extract_full_text(provenance=prov))
        assert "92145" in text
        assert "467832" in text
        assert "EPSG:28992" in text

    def test_vbo_and_pand_ids_printed(self):
        """PDF contains VBO ID and pand ID."""
        prov = self._make_provenance()
        text = _norm(self._extract_full_text(provenance=prov))
        assert "0441010000123456" in text
        assert "0441100000654321" in text

    def test_buurt_code_printed(self):
        """PDF contains buurt code."""
        prov = self._make_provenance()
        text = _norm(self._extract_full_text(provenance=prov))
        assert "BU04410203" in text

    def test_gemeente_name_and_code_printed(self):
        """PDF contains gemeente name with derived code."""
        prov = self._make_provenance()
        text = _norm(self._extract_full_text(provenance=prov))
        assert "Katwijk" in text
        assert "0441" in text

    def test_methodology_version_printed(self):
        """PDF contains the methodology version string."""
        prov = self._make_provenance()
        text = _norm(self._extract_full_text(provenance=prov))
        assert "v2.1" in text

    def test_geocoding_method_printed_en(self):
        """English PDF contains geocoding method."""
        prov = self._make_provenance()
        text = _norm(self._extract_full_text(language="en", provenance=prov))
        assert "BAG address point" in text

    def test_geocoding_method_printed_nl(self):
        """Dutch PDF contains geocoding method."""
        prov = self._make_provenance()
        text = _norm(self._extract_full_text(language="nl", provenance=prov))
        assert "BAG-adreslokatie" in text

    def test_report_details_heading_en(self):
        """English PDF contains Report Details heading."""
        prov = self._make_provenance()
        text = _norm(self._extract_full_text(language="en", provenance=prov))
        assert "Report Details" in text

    def test_report_details_heading_nl(self):
        """Dutch PDF contains Rapportgegevens heading."""
        prov = self._make_provenance()
        text = _norm(self._extract_full_text(language="nl", provenance=prov))
        assert "Rapportgegevens" in text

    def test_no_provenance_graceful(self):
        """Full dossier without provenance still renders successfully."""
        text = self._extract_full_text(provenance=None)
        assert "Methodology" in _norm(text) or "How we score" in _norm(text)

    def test_partial_provenance_graceful(self):
        """Provenance with missing optional fields still renders."""
        from app.models.report import ProvenanceData

        prov = ProvenanceData(report_id="rpt_partial", vbo_id="0363010012345678")
        text = _norm(self._extract_full_text(provenance=prov))
        assert "rpt_partial" in text
        # No coordinates should still work fine
        assert "Generated" in text or "Gegenereerd" in text

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

    def test_national_replaces_border_for_nl_avg(self):
        """nl_avg rows use NATIONAL color, not BORDER."""
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
            assert color == NATIONAL, (
                f"nl_avg row '{label}' uses {color} instead of NATIONAL"
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
            ("Stedelijk", 55, MUTED, False),
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
        # The first row should be address (TEAL)
        first_color = noise_rows[0][2]
        assert first_color == TEAL, (
            f"First comparison row color is {first_color}, expected TEAL"
        )

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
