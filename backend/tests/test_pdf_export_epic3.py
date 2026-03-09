"""Epic 3 PDF export tests for LaTeX orchestration and fallbacks."""

import re
from unittest.mock import patch

import pytest

from app.api.address import ExportRequest
from app.services import latex_env, pdf_export

_has_pillow = True
try:
    from PIL import Image as _Image  # noqa: F401
except ImportError:
    _has_pillow = False


def test_latex_env_exports_expected_symbols():
    """Epic 2 surface area exists and is importable."""
    assert callable(latex_env.compile_latex_to_pdf)
    assert callable(latex_env.render_dossier)
    assert callable(latex_env.render_brief)
    assert latex_env.TEMPLATES_DIR.name == "templates"


# --- Logo rendering tests ---


def test_logo_png_exists_and_is_valid():
    """The horizontal lockup PNG exists at the expected path."""
    assert latex_env.LOGO_PATH.exists(), (
        f"Logo PNG not found at {latex_env.LOGO_PATH}"
    )
    assert latex_env.LOGO_PATH.suffix == ".png"
    # Verify it's a valid PNG by checking the magic bytes
    with open(latex_env.LOGO_PATH, "rb") as f:
        header = f.read(8)
    assert header[:4] == b"\x89PNG", "File does not have valid PNG header"


@pytest.mark.skipif(not _has_pillow, reason="Pillow not installed")
def test_logo_png_has_sufficient_resolution():
    """Logo PNG must be high enough resolution for crisp print at >=28mm."""
    from PIL import Image

    img = Image.open(latex_env.LOGO_PATH)
    width, height = img.size
    # At 28mm width, 300 DPI needs 331px. We require >=600px (~540 DPI) for
    # retina-quality output.
    assert width >= 600, (
        f"Logo width {width}px is too low for print quality (need >=600px)"
    )
    assert height >= 100, (
        f"Logo height {height}px is too low for print quality (need >=100px)"
    )
    # Aspect ratio should be approximately 5:1 (horizontal lockup)
    ratio = width / height
    assert 4.0 <= ratio <= 6.0, (
        f"Logo aspect ratio {ratio:.1f} is outside expected 4:1-6:1 range"
    )


def test_preamble_template_has_logo_includegraphics_guard():
    """Preamble template contains \\includegraphics wrapped in \\IfFileExists guard."""
    preamble = latex_env.render_preamble(language="en")
    # The rendered header line should contain \includegraphics with the logo path
    assert r"\includegraphics" in preamble, (
        "Preamble does not contain \\includegraphics for the logo"
    )
    assert "buurt-check-lockup-horizontal.png" in preamble, (
        "Preamble does not reference the horizontal lockup PNG"
    )
    # The IfFileExists guard should wrap the includegraphics
    assert r"\IfFileExists" in preamble


def test_preamble_includes_needspace_for_notes_guard():
    preamble = latex_env.render_preamble(language="en")
    assert r"\usepackage{needspace}" in preamble


def test_preamble_logo_width_at_least_22mm():
    """Logo width in the preamble template must be >=22mm for clear recognition."""
    preamble = latex_env.render_preamble(language="en")
    # Extract width=XXmm (integer or fractional) from the includegraphics options
    match = re.search(r"width=(\d+(?:\.\d+)?)mm", preamble)
    assert match is not None, "Could not find width=Xmm in logo includegraphics"
    width_mm = float(match.group(1))
    assert width_mm >= 22, (
        f"Logo width {width_mm}mm is below the 22mm minimum for clear recognition"
    )


def test_logo_path_tex_uses_posix_separators():
    """LOGO_PATH_TEX must use forward slashes for TeX compatibility."""
    assert "\\" not in latex_env.LOGO_PATH_TEX, (
        "LOGO_PATH_TEX contains backslashes which break TeX on Windows"
    )
    assert "/" in latex_env.LOGO_PATH_TEX


def test_compile_latex_fallback_wrapper_uses_fallback_on_runtime_error():
    """compile_latex_to_pdf_with_fallback returns fallback bytes when LaTeX fails."""
    with patch("app.services.latex_env.compile_latex_to_pdf", side_effect=RuntimeError):
        result = latex_env.compile_latex_to_pdf_with_fallback(
            r"\documentclass{article}\begin{document}x\end{document}",
            fallback_pdf_factory=lambda: b"%PDF-fallback",
        )
    assert result == b"%PDF-fallback"


def test_sunlight_state_pending_and_error_messages_are_bilingual():
    """_sunlight_state exposes deterministic pending/error messaging."""
    state, pending_msg, unavailable_msg = pdf_export._sunlight_state(
        risks=None, sunlight_score=None, is_nl=False, has_shadow_inputs=True,
    )
    assert state == "pending"
    assert pending_msg is not None
    assert unavailable_msg is None

    state, pending_msg, unavailable_msg = pdf_export._sunlight_state(
        risks=None, sunlight_score=None, is_nl=True, has_shadow_inputs=False,
    )
    assert state == "error"
    assert pending_msg is None
    assert unavailable_msg is not None
    assert "Zonlichtanalyse" in unavailable_msg


def test_export_request_accepts_seasonal_shadow_fields_and_aliases():
    """ExportRequest includes equinox and summer shadow payload fields."""
    body = ExportRequest(
        rd_x=121000,
        rd_y=487000,
        lat=52.37,
        lng=4.89,
        address="Damrak 1, Amsterdam",
        shadow_equinox="AAAA",
        shadow_summer_b64="BBBB",
    )
    assert body.shadow_equinox_b64 == "AAAA"
    assert body.shadow_summer_b64 == "BBBB"


def test_generate_quick_brief_routes_through_latex_orchestrator():
    """Public quick-brief generator delegates to the LaTeX orchestrator."""
    with patch(
        "app.services.pdf_export._generate_quick_brief_latex",
        return_value=b"%PDF-latex-brief",
    ) as mock_orchestrator:
        result = pdf_export.generate_quick_brief(
            address="Damrak 1, Amsterdam",
            building_year=1900,
            building_use="Residential",
            risks=None,
            sunlight_score=None,
            viewing_questions=None,
        )
    assert result == b"%PDF-latex-brief"
    mock_orchestrator.assert_called_once()


def test_generate_full_dossier_routes_through_latex_orchestrator():
    """Public full-dossier generator delegates to the LaTeX orchestrator."""
    with patch(
        "app.services.pdf_export._generate_full_dossier_latex",
        return_value=b"%PDF-latex-dossier",
    ) as mock_orchestrator:
        result = pdf_export.generate_full_dossier(
            address="Damrak 1, Amsterdam",
            building_year=1900,
            building_use="Residential",
            risks=None,
            sunlight_score=None,
            viewing_questions=None,
        )
    assert result == b"%PDF-latex-dossier"
    mock_orchestrator.assert_called_once()


def test_render_dossier_notes_block_is_capped_and_not_stretched():
    tex = latex_env.render_dossier(
        address="Damrak 1, Amsterdam",
        language="en",
        methodology={
            "intro": "x",
            "formula_heading": "x",
            "formulas": [],
            "sources_heading": "x",
            "sources": [],
            "sunlight_heading": "x",
            "sunlight_method": [],
            "peer_disclosure": "x",
            "limitations_heading": "x",
            "limitations": "x",
        },
    )

    assert r"\Needspace{42mm}" in tex
    assert r"\vfill" not in tex
    assert tex.count(r"\noindent\rule{\linewidth}{0.1pt}") == 4


def test_render_dossier_includes_climate_disclosure_text():
    tex = latex_env.render_dossier(
        address="Damrak 1, Amsterdam",
        language="en",
        climate_disclosure=(
            "Climate context: Klimaateffectatlas · Source year: 2024 · "
            "Layers: wpn:s0149_hittestress_warme_nachten_huidig · "
            "Current climate conditions"
        ),
    )

    assert "Climate context: Klimaateffectatlas" in tex
    assert "Source year: 2024" in tex
    assert "Current climate conditions" in tex


def test_render_dossier_wraps_climate_disclosure_in_parbox():
    tex = latex_env.render_dossier(
        address="Damrak 1, Amsterdam",
        language="en",
        climate_disclosure="Climate context: Klimaateffectatlas",
    )

    assert r"\parbox{\linewidth}{\raggedright\sloppy" in tex


def test_render_dossier_renders_measurements_and_quartiles():
    tex = latex_env.render_dossier(
        address="Damrak 1, Amsterdam",
        language="en",
        neighborhood={
            "buurt_code": "BU00000001",
            "gemeente_name": "Amsterdam",
        },
        neighborhood_sections=[
            {
                "title": "People",
                "rows": [
                    {
                        "label": "Population density",
                        "value": "15,000/km² (Q4)",
                    },
                ],
            },
        ],
        neighborhood_urbanization_label="Very urban",
        comparison_chart_blocks=[
            {
                "path": "/tmp/comparison_noise.pdf",
                "measurement_line": (
                    "Lden: 58.0 dB · WHO guideline (Lden): 53.0 dB"
                ),
                "unit_definition": (
                    "Lden = day-evening-night weighted noise level (road traffic)"
                ),
            },
        ],
    )

    assert r"\Needspace{58mm}" in tex
    assert "Measurements" in tex
    assert "Lden: 58.0 dB" in tex
    assert "WHO guideline (Lden): 53.0 dB" in tex
    assert "Population density" in tex
    assert "(Q4)" in tex
    assert "Very urban" in tex


def test_render_dossier_places_location_map_before_shadow_analysis():
    tex = latex_env.render_dossier(
        address="Damrak 1, Amsterdam",
        language="en",
        location_map="/tmp/location_map.jpg",
        shadow_images=["/tmp/shadow_winter.png"],
    )

    assert tex.index("Location Map") < tex.index("Shadow Analysis")


def test_render_dossier_shows_location_placeholder_when_map_missing():
    tex = latex_env.render_dossier(
        address="Damrak 1, Amsterdam",
        language="en",
    )

    assert "Location map unavailable" in tex
    assert "PDOK aerial imagery did not load during export." in tex


def test_render_dossier_includes_crime_row_in_risk_scores():
    tex = latex_env.render_dossier(
        address="Damrak 1, Amsterdam",
        language="en",
        tier_b={
            "crime": {
                "total_per_1000": 47.6,
                "national_per_1000": None,
                "burglary_per_1000": None,
                "violent_per_1000": None,
                "score": 65,
                "severity": "moderate",
                "meaning_en": "Crime rate is somewhat above the national average.",
                "source": "CBS",
                "source_date": "2025JJ00",
                "yearly_period": None,
            },
        },
    )

    assert "Crime &" in tex
    assert "65/100" in tex
    assert "CBS" in tex


def test_render_brief_shows_location_placeholder_when_map_missing():
    tex = latex_env.render_brief(
        address="Damrak 1, Amsterdam",
        language="en",
    )

    assert "Location map unavailable" in tex
    assert "PDOK aerial imagery did not load during export." in tex


def test_render_dossier_removes_forced_page_break_before_property_checks():
    tex = latex_env.render_dossier(
        address="Damrak 1, Amsterdam",
        language="en",
    )

    assert r"\clearpage" not in tex
