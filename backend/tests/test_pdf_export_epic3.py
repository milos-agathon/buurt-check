"""Epic 3 PDF export tests for LaTeX orchestration and fallbacks."""

from unittest.mock import patch

from app.api.address import ExportRequest
from app.services import latex_env, pdf_export


def test_latex_env_exports_expected_symbols():
    """Epic 2 surface area exists and is importable."""
    assert callable(latex_env.compile_latex_to_pdf)
    assert callable(latex_env.render_dossier)
    assert callable(latex_env.render_brief)
    assert latex_env.TEMPLATES_DIR.name == "templates"


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
