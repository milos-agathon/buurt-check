"""Bilingual parity tests for dossier rendering (Epic 4, Story 4.4)."""

from __future__ import annotations

import io
import shutil
import subprocess
import tempfile

import pytest
from pypdf import PdfReader

from app.services.latex_env import render_dossier
from tests.epic4_pdf_fixtures import dossier_kwargs, render_dossier_pdf


def _lualatex_can_compile() -> bool:
    """Check if lualatex can compile a document with the packages our templates use."""
    if shutil.which("lualatex") is None:
        return False
    try:
        from app.services.latex_env import render_preamble

        preamble = render_preamble(language="en")
        tex = preamble + "\n\\begin{document}\nProbe.\n\\end{document}\n"
        tmp = tempfile.mkdtemp(prefix="buurtcheck_probe_")
        tex_path = f"{tmp}/probe.tex"
        with open(tex_path, "w") as f:
            f.write(tex)
        result = subprocess.run(
            ["lualatex", "--interaction=nonstopmode", "probe.tex"],
            cwd=tmp,
            capture_output=True,
            text=True,
            timeout=20,
        )
        return result.returncode == 0
    except Exception:
        return False


_CAN_COMPILE = _lualatex_can_compile()


def _extract_text(pdf_bytes: bytes) -> str:
    reader = PdfReader(io.BytesIO(pdf_bytes))
    return "\n".join(page.extract_text() or "" for page in reader.pages)


def _norm(value: str) -> str:
    return "".join(ch.lower() for ch in value if ch.isalnum())


def _contains(text: str, fragment: str) -> bool:
    return _norm(fragment) in _norm(text)


def _assert_order(text: str, labels: list[str]) -> None:
    norm_text = _norm(text)
    pos = -1
    for label in labels:
        found = norm_text.find(_norm(label), pos + 1)
        assert found >= 0, f"Missing section label: {label}"
        assert found > pos, f"Section out of order: {label}"
        pos = found


@pytest.mark.skipif(not _CAN_COMPILE, reason="lualatex cannot compile (missing or broken)")
def test_bilingual_page_count_parity() -> None:
    en_pdf = render_dossier_pdf("full", "en")
    nl_pdf = render_dossier_pdf("full", "nl")

    en_pages = len(PdfReader(io.BytesIO(en_pdf)).pages)
    nl_pages = len(PdfReader(io.BytesIO(nl_pdf)).pages)

    assert abs(en_pages - nl_pages) <= 1, (
        f"Page count parity failed: en={en_pages}, nl={nl_pages}"
    )


@pytest.mark.skipif(not _CAN_COMPILE, reason="lualatex cannot compile (missing or broken)")
def test_bilingual_section_order() -> None:
    en_pdf = render_dossier_pdf("full", "en")
    nl_pdf = render_dossier_pdf("full", "nl")

    en_text = _extract_text(en_pdf)
    nl_text = _extract_text(nl_pdf)

    _assert_order(
        en_text,
        [
            "Property Risk Dossier",
            "Risk Scores",
            "Neighborhood Context",
            "Viewing Questions",
            "Provenance",
        ],
    )
    _assert_order(
        nl_text,
        [
            "Vastgoedrisico Dossier",
            "Risicoscores",
            "Buurtcontext",
            "Bezichtigingsvragen",
            "Provenance",
        ],
    )

    # No EN leak in NL headings, no NL leak in EN headings.
    assert not _contains(nl_text, "Property Risk Dossier")
    assert not _contains(en_text, "Vastgoedrisico Dossier")
    assert not _contains(nl_text, "Risk Scores")
    assert not _contains(en_text, "Risicoscores")

    # Date formatting must stay language-specific.
    assert _contains(en_text, "2 March 2026")
    assert _contains(nl_text, "2 maart 2026")

    # Header/footer disclaimer must switch with language.
    assert _contains(en_text, "Data is indicative. Verify on-site.")
    assert _contains(nl_text, "Data is indicatief. Verifieer ter plaatse.")
    assert not _contains(nl_text, "Data is indicative. Verify on-site.")
    assert not _contains(en_text, "Data is indicatief. Verifieer ter plaatse.")


def test_bilingual_template_no_cross_language_static_strings() -> None:
    en_tex = render_dossier(**dossier_kwargs("full", "en"))
    nl_tex = render_dossier(**dossier_kwargs("full", "nl"))

    # Static key headings must not bleed across template language variants.
    assert "\\section*{Risk Scores}" in en_tex
    assert "\\section*{Risicoscores}" in nl_tex
    assert "\\section*{Risk Scores}" not in nl_tex
    assert "\\section*{Risicoscores}" not in en_tex
