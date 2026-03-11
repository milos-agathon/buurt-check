"""Epic 3 diagnostic content tests (livability, warnings, soil honesty)."""

import io

from pypdf import PdfReader

from app.models.livability import (
    LivabilityComparisonRow,
    LivabilityDimension,
    LivabilityResponse,
    LivabilityTrendPoint,
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
from app.services.pdf_export import (
    BuurtCheckPDF,
    _draw_checks_subsection,
    generate_full_dossier,
)


def _pdf_text(pdf_bytes: bytes) -> str:
    reader = PdfReader(io.BytesIO(pdf_bytes))
    raw = "\n".join(page.extract_text() or "" for page in reader.pages)
    return " ".join(raw.split())


def _make_livability() -> LivabilityResponse:
    dimensions = [
        LivabilityDimension(
            name="physical",
            raw_score=6,
            normalized_score=62,
            label_code="livability.dimension.physical",
        ),
        LivabilityDimension(
            name="safety",
            raw_score=7,
            normalized_score=75,
            label_code="livability.dimension.safety",
        ),
        LivabilityDimension(
            name="social",
            raw_score=5,
            normalized_score=50,
            label_code="livability.dimension.social",
        ),
    ]
    trend = [
        LivabilityTrendPoint(
            year="2018",
            overall_score=5,
            overall_normalized=50,
            dimensions=dimensions,
        ),
        LivabilityTrendPoint(
            year="2024",
            overall_score=6,
            overall_normalized=62,
            dimensions=dimensions,
        ),
    ]
    comparison = [
        LivabilityComparisonRow(
            level="wijk",
            name="City district",
            overall_score=5,
            overall_normalized=54,
            dimensions=dimensions,
        ),
        LivabilityComparisonRow(
            level="gemeente",
            name="Municipality",
            overall_score=5,
            overall_normalized=56,
            dimensions=dimensions,
        ),
    ]
    return LivabilityResponse(
        available=True,
        buurt_code="BU03630001",
        buurt_name="Centrum",
        gemeente="Amsterdam",
        year="2024",
        overall_score=6,
        overall_normalized=62,
        dimensions=dimensions,
        trend=trend,
        comparison=comparison,
    )


def _make_all_warnings() -> PropertyWarningsResponse:
    return PropertyWarningsResponse(
        address_id="0363010012345678",
        attention_summary=AttentionSummary(
            flag_count=5,
            flags=[],
            risk_categories_assessed=5,
            risk_categories_total=5,
        ),
        foundation_risk=FoundationRisk(
            level="high",
            construction_year=1930,
            soil_type="peat",
            subsidence_rate_mm_per_year=4.1,
        ),
        erfpacht=ErfpachtWarning(
            detected=True,
            confidence="confirmed",
            municipality="Amsterdam",
        ),
        vve=VvEInfo(is_apartment=True, num_units=8),
        asbestos=AsbestosWarning(flagged=True, construction_year=1930),
        lead_pipe=LeadPipeWarning(flagged=True, construction_year=1930),
    )


def test_epic3_livability_section_renders_when_data_present():
    result = generate_full_dossier(
        address="Teststraat 1, Amsterdam",
        building_year=1930,
        building_use="Residential",
        risks=None,
        sunlight_score=None,
        viewing_questions=None,
        language="en",
        livability=_make_livability(),
    )
    text = _pdf_text(result)
    assert "Livability Score" in text
    assert "Dimensions" in text
    assert "Comparison" in text


def test_epic3_all_five_warning_categories_render():
    result = generate_full_dossier(
        address="Teststraat 1, Amsterdam",
        building_year=1930,
        building_use="Residential",
        risks=None,
        sunlight_score=None,
        viewing_questions=None,
        language="en",
        property_warnings_data=_make_all_warnings(),
    )
    text = _pdf_text(result)
    assert "Asbestos Awareness" in text
    assert "Foundation Risk" in text
    assert "Ground Lease (Erfpacht)" in text
    assert (
        "VvE (Owners' Association)" in text
        or "VvE (Owners’ Association)" in text
    )
    assert "Lead Pipe Risk" in text


def test_epic3_soil_section_honesty_and_postcode_injection():
    result = generate_full_dossier(
        address="Dorpstraat 10, 2235BV Valkenburg",
        building_year=1970,
        building_use="Residential",
        risks=None,
        sunlight_score=None,
        viewing_questions=None,
        language="en",
        postcode="2235BV",
    )
    text = _pdf_text(result)
    assert "Soil Contamination" in text

    soil_start = text.find("Soil Contamination")
    sun_start = text.find("Direct sun (clear-sky visibility)")
    assert soil_start != -1
    assert sun_start != -1 and sun_start > soil_start

    soil_block = text[soil_start:sun_start]
    assert "No automated parcel-level soil contamination data is available." in soil_block
    assert "BRO soil information registry is not reliable" in soil_block
    assert "extraction" in soil_block
    assert "postcode 2235BV" in soil_block
    assert "climate" not in soil_block.lower()


def test_property_checks_subsection_uses_will_page_break_guard():
    pdf = BuurtCheckPDF(language="en")
    pdf.add_page()

    calls: list[float] = []

    def tracking_will_break(height: float) -> bool:
        calls.append(height)
        return False

    pdf.will_page_break = tracking_will_break  # type: ignore[method-assign]
    _draw_checks_subsection(
        pdf,
        title="Section title",
        body="Body text " * 50,
        source="Source line",
    )
    assert calls
    assert calls[0] > 0
