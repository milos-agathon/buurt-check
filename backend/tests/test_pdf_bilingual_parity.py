"""Bilingual parity tests for dossier rendering (Epic 4, Story 4.4)."""

from __future__ import annotations

import io

from pypdf import PdfReader

from app.services.latex_env import render_dossier
from tests.epic4_pdf_fixtures import dossier_kwargs, render_dossier_pdf


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


def test_bilingual_page_count_parity() -> None:
    en_pdf = render_dossier_pdf("full", "en")
    nl_pdf = render_dossier_pdf("full", "nl")

    en_pages = len(PdfReader(io.BytesIO(en_pdf)).pages)
    nl_pages = len(PdfReader(io.BytesIO(nl_pdf)).pages)

    assert en_pages == nl_pages
    assert en_pages >= 6


def test_bilingual_section_order() -> None:
    en_pdf = render_dossier_pdf("full", "en")
    nl_pdf = render_dossier_pdf("full", "nl")

    en_text = _extract_text(en_pdf)
    nl_text = _extract_text(nl_pdf)

    _assert_order(
        en_text,
        [
            "Executive Summary",
            "Risk Details",
            "Additional Property Checks",
            "Viewing Questions",
            "Shadow Analysis",
            "Neighborhood Context",
            "Methodology",
            "Your viewing notes",
        ],
    )
    _assert_order(
        nl_text,
        [
            "Samenvatting",
            "Risicodetails",
            "Aanvullende vastgoedcontroles",
            "Bezichtigingsvragen",
            "Schaduwanalyse",
            "Buurtcontext",
            "Methodologie",
            "Uw notities",
        ],
    )

    # No EN leak in NL headings, no NL leak in EN headings.
    assert not _contains(nl_text, "Executive Summary")
    assert not _contains(en_text, "Samenvatting")
    assert not _contains(nl_text, "Risk Details")
    assert not _contains(en_text, "Risicodetails")
    assert not _contains(nl_text, "Neighborhood Context")
    assert not _contains(en_text, "Buurtcontext")

    # Date formatting must stay language-specific.
    assert _contains(en_text, "2 March 2026")
    assert _contains(nl_text, "2 maart 2026")

    # Rich dossier uses seasonal facade evidence in both languages.
    for label in ["Winter solstice", "Spring equinox", "Summer solstice", "12:00"]:
        assert _contains(en_text, label)
    for label in ["Winterzonnewende", "Lentepunt", "Zomerzonnewende", "12:00"]:
        assert _contains(nl_text, label)
    for label in ["Front facade", "Rear facade"]:
        assert _contains(en_text, label)
    for label in ["Voorgevel", "Achtergevel"]:
        assert _contains(nl_text, label)

    # Viewing questions stay language-specific in the rich dossier.
    assert _contains(en_text, "Open a window facing the street")
    assert not _contains(en_text, "Open een raam aan de straatkant")
    assert _contains(nl_text, "Open een raam aan de straatkant")
    assert not _contains(nl_text, "Open a window facing the street")

    # Footer disclaimer must switch with language.
    assert _contains(en_text, "Data is indicative. Verify on-site.")
    assert _contains(nl_text, "Data is indicatief. Verifieer op locatie.")
    assert not _contains(nl_text, "Data is indicative. Verify on-site.")
    assert not _contains(en_text, "Data is indicatief. Verifieer op locatie.")

    # Cover sources must include livability attribution when used in the summary.
    assert _contains(en_text, "Leefbaarometer")
    assert _contains(nl_text, "Leefbaarometer")


def test_bilingual_template_no_cross_language_static_strings() -> None:
    en_tex = render_dossier(**dossier_kwargs("full", "en"))
    nl_tex = render_dossier(**dossier_kwargs("full", "nl"))

    # Static key headings must not bleed across template language variants.
    assert "\\section*{Risk Scores}" in en_tex
    assert "\\section*{Risicoscores}" in nl_tex
    assert "\\section*{Risk Scores}" not in nl_tex
    assert "\\section*{Risicoscores}" not in en_tex
