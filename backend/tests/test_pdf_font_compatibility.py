from __future__ import annotations

import io
from pathlib import Path

from fontTools.ttLib import TTFont
from pypdf import PdfReader

from tests.epic4_pdf_fixtures import render_dossier_pdf

FONTS_DIR = Path(__file__).resolve().parent.parent / "app" / "assets" / "fonts"
EXPORT_FONT_FILES = (
    "Inter-Regular.ttf",
    "Inter-Medium.ttf",
    "Inter-Bold.ttf",
    "Inter-Black.ttf",
)


def test_export_font_assets_are_static_truetype_instances() -> None:
    for filename in EXPORT_FONT_FILES:
        font = TTFont(FONTS_DIR / filename)
        assert "glyf" in font, filename
        assert "CFF " not in font, filename
        assert "fvar" not in font, filename
        assert "gvar" not in font, filename


def test_full_dossier_embeds_static_truetype_font_streams() -> None:
    pdf_bytes = render_dossier_pdf("full", "en")
    reader = PdfReader(io.BytesIO(pdf_bytes))
    fonts = reader.pages[0]["/Resources"]["/Font"]

    embedded_font_names: set[str] = set()
    for ref in fonts.values():
        font = ref.get_object()
        for descendant_ref in font.get("/DescendantFonts", []):
            descendant = descendant_ref.get_object()
            descriptor = descendant.get("/FontDescriptor").get_object()
            font_stream = descriptor.get("/FontFile2")
            assert font_stream is not None
            embedded = TTFont(io.BytesIO(font_stream.get_data()))
            embedded_font_names.add(embedded["name"].getDebugName(6) or "")
            assert "glyf" in embedded
            assert "CFF " not in embedded

    assert {
        "Inter-Regular",
        "Inter-Medium",
        "Inter-Bold",
        "Inter-Black",
    }.issubset(embedded_font_names)
