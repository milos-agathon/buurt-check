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
