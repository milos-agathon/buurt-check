"""Unit tests for Epic 1 matplotlib chart renderer."""

from __future__ import annotations

import base64
import io

from matplotlib import rcParams
from matplotlib.axes import Axes
from PIL import Image
from pypdf import PdfReader

from app.models.neighborhood import AgeProfile
from app.services import chart_renderer as cr
from app.services.chart_renderer import (
    CHART_DPI,
    CHART_WIDTH_MM,
    CompRow,
    CrimeData,
    LivabilityData,
    RiskCell,
    SchererTheme,
    ShadowImage,
    SunlightMeta,
    render_age_distribution,
    render_livability_score,
    render_risk_comparison,
    render_risk_summary_grid,
    render_shadow_panels,
)


def _pdf_text(pdf_bytes: bytes) -> str:
    reader = PdfReader(io.BytesIO(pdf_bytes))
    return "\n".join(page.extract_text() or "" for page in reader.pages)


def _pdf_size_mm(pdf_bytes: bytes) -> tuple[float, float]:
    reader = PdfReader(io.BytesIO(pdf_bytes))
    page = reader.pages[0]
    width_mm = float(page.mediabox.width) * 25.4 / 72.0
    height_mm = float(page.mediabox.height) * 25.4 / 72.0
    return width_mm, height_mm


def _tiny_png_b64(rgb: tuple[int, int, int]) -> str:
    image = Image.new("RGB", (80, 48), rgb)
    buf = io.BytesIO()
    image.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("ascii")


def test_scherer_theme_applies_rcparams():
    theme = SchererTheme()
    theme.apply()

    assert rcParams["axes.spines.top"] is False
    assert rcParams["axes.spines.right"] is False
    assert rcParams["axes.spines.left"] is False
    assert rcParams["axes.spines.bottom"] is True
    assert rcParams["axes.grid"] is False
    assert float(rcParams["axes.linewidth"]) == 0.4
    assert rcParams["axes.edgecolor"] == "#E2E7ED"
    assert float(rcParams["xtick.major.size"]) == 0.0
    assert float(rcParams["ytick.major.size"]) == 0.0
    assert float(rcParams["xtick.labelsize"]) == 7.5
    assert float(rcParams["ytick.labelsize"]) == 9.5
    assert rcParams["font.family"] == ["sans-serif"]
    assert float(rcParams["font.size"]) == 9.5
    assert CHART_DPI == 192
    assert float(rcParams["figure.dpi"]) == float(CHART_DPI)
    assert float(rcParams["savefig.dpi"]) == float(CHART_DPI)
    assert rcParams["savefig.bbox"] is None
    assert float(rcParams["savefig.pad_inches"]) == 0.05
    assert rcParams["legend.frameon"] is False


def test_scherer_theme_font_fallback(monkeypatch):
    monkeypatch.setattr(cr, "_registered_font_names", lambda: {"DejaVu Sans"})
    monkeypatch.setattr(cr, "_register_local_fonts", lambda: None)

    theme = SchererTheme(preferred_fonts=("Inter",), fallback_fonts=("DejaVu Sans",))
    resolved = theme.apply()

    assert resolved[0] == "DejaVu Sans"
    assert rcParams["font.sans-serif"][0] == "DejaVu Sans"


def test_save_figure_does_not_mutate_savefig_bbox():
    SchererTheme().apply()
    before = rcParams["savefig.bbox"]
    _ = render_age_distribution(AgeProfile(age_0_24=20, age_25_64=60, age_65_plus=20))
    after = rcParams["savefig.bbox"]
    assert after == before


def test_risk_comparison_happy_path():
    chart = render_risk_comparison(
        category="Noise",
        address_score=72,
        comparisons=[
            CompRow("City average", 66),
            CompRow("Netherlands", 61),
            CompRow("WHO guideline", 74, role="reference"),
        ],
    )

    assert chart.startswith(b"%PDF-")
    width_mm, height_mm = _pdf_size_mm(chart)
    assert width_mm >= CHART_WIDTH_MM - 12
    assert height_mm > 20
    text = _pdf_text(chart)
    assert "This address" in text
    assert "City average" in text
    assert "Netherlands" in text
    assert "WHO guideline" in text


def test_risk_comparison_no_comparisons():
    chart = render_risk_comparison(category="Air", address_score=64, comparisons=[])
    assert chart.startswith(b"%PDF-")
    text = _pdf_text(chart)
    assert "This address" in text
    assert "64" in text


def test_risk_comparison_label_alignment():
    chart = render_risk_comparison(
        category="Climate stress",
        address_score=48,
        comparisons=[
            CompRow("Stadsgemiddelde met extra lange omschrijving", 55),
            CompRow("Nederlandse benchmark", 59),
        ],
    )

    assert chart.startswith(b"%PDF-")
    text = _pdf_text(chart)
    assert "Stadsgemiddelde" in text
    assert "Nederlandse benchmark" in text


def test_risk_comparison_wraps_long_peer_labels(monkeypatch):
    captured: list[str] = []
    original_text = Axes.text

    def _patched_text(self, x, y, s, *args, **kwargs):  # type: ignore[no-untyped-def]
        captured.append(str(s))
        return original_text(self, x, y, s, *args, **kwargs)

    monkeypatch.setattr(Axes, "text", _patched_text)

    render_risk_comparison(
        category="Climate stress",
        address_score=48,
        comparisons=[
            CompRow("Peer baseline for comparable urbanized neighborhoods", 55),
            CompRow("Netherlands", 59),
        ],
    )

    assert any(
        "Peer baseline for" in text and "\n" in text
        for text in captured
    )


def test_risk_comparison_can_omit_row_labels():
    chart = render_risk_comparison(
        category="Noise",
        address_score=72,
        comparisons=[
            CompRow("City average", 66),
            CompRow("Netherlands", 61),
            CompRow("WHO guideline", 74, role="reference"),
        ],
        show_row_labels=False,
    )

    assert chart.startswith(b"%PDF-")
    text = _pdf_text(chart)
    assert "This address" not in text
    assert "City average" not in text
    assert "Netherlands" not in text
    assert "WHO guideline" not in text
    assert "72" in text


def test_risk_comparison_value_labels_use_shared_right_column(monkeypatch):
    captured: list[tuple[float, str, str | None]] = []
    original_text = Axes.text

    def _patched_text(self, x, y, s, *args, **kwargs):  # type: ignore[no-untyped-def]
        captured.append((float(x), str(s), kwargs.get("ha")))
        return original_text(self, x, y, s, *args, **kwargs)

    monkeypatch.setattr(Axes, "text", _patched_text)

    render_risk_comparison(
        category="Noise",
        address_score=72,
        comparisons=[
            CompRow("Peer baseline (urbanization)", 66),
            CompRow("Netherlands", 61),
            CompRow("WHO guideline", 74, role="reference"),
        ],
    )

    value_positions = {
        round(x, 2)
        for x, text, ha in captured
        if text in {"72", "66", "61", "74"} and ha == "right"
    }
    assert len(value_positions) == 1


def test_risk_comparison_primary_bar_uses_severity_color(monkeypatch):
    captured_colors: list[str] = []
    original_barh = Axes.barh

    def _patched_barh(self, *args, **kwargs):  # type: ignore[no-untyped-def]
        captured_colors.append(str(kwargs.get("color")))
        return original_barh(self, *args, **kwargs)

    monkeypatch.setattr(Axes, "barh", _patched_barh)

    render_risk_comparison(
        category="Climate stress",
        address_score=12,
        comparisons=[
            CompRow("Peer baseline (urbanization)", 44),
            CompRow("Netherlands", 52),
        ],
    )

    assert captured_colors[0] == cr.C_SEV_CRIT


def test_risk_grid_4_cells():
    chart = render_risk_summary_grid(
        [
            RiskCell("Noise", 82, severity="good"),
            RiskCell("Air", 54, severity="moderate"),
            RiskCell("Climate", 31, severity="poor"),
            RiskCell("Sunlight", 12, severity="critical"),
        ]
    )

    assert chart.startswith(b"%PDF-")
    text = _pdf_text(chart)
    assert "NOISE" in text
    assert "AIR" in text
    assert "CLIMATE" in text
    assert "SUNLIGHT" in text
    assert "GOOD" in text
    assert "MODERATE" in text
    assert "POOR" in text
    assert "CRITICAL" in text
    assert "82/100" in text
    assert "70+" not in text


def test_risk_grid_5_cells():
    chart = render_risk_summary_grid(
        [
            RiskCell("Noise", 82, severity="good"),
            RiskCell("Air", 54, severity="moderate"),
            RiskCell("Climate", 31, severity="poor"),
            RiskCell("Sunlight", 12, severity="critical"),
            RiskCell("Crime", 74, severity="good"),
        ],
        cols=5,
    )

    assert chart.startswith(b"%PDF-")
    text = _pdf_text(chart)
    assert "CRIME" in text
    assert text.count("GOOD") >= 2


def test_risk_grid_with_none_score():
    chart = render_risk_summary_grid(
        [
            RiskCell("Noise", 75),
            RiskCell("Air", 68),
            RiskCell("Climate", 41),
            RiskCell("Sunlight", None),
        ]
    )

    assert chart.startswith(b"%PDF-")
    text = _pdf_text(chart)
    assert "N/A" not in text
    assert "SUNLIGHT" in text


def test_shadow_triptych_three_images():
    chart = render_shadow_panels(
        images=[
            ShadowImage("top", _tiny_png_b64((34, 45, 63))),
            ShadowImage("front", _tiny_png_b64((55, 65, 75))),
            ShadowImage("rear", _tiny_png_b64((76, 86, 96))),
        ],
        metadata=SunlightMeta(),
    )

    assert chart.startswith(b"%PDF-")
    width_mm, height_mm = _pdf_size_mm(chart)
    assert width_mm >= 160
    assert height_mm >= 65
    text = _pdf_text(chart)
    assert "Top view" in text
    assert "Front facade" in text
    assert "Rear facade" in text
    assert "Summer solstice" in text
    assert "Legend: teal outline = target building" in text
    assert "12:00" in text


def test_shadow_single_image_fallback():
    chart = render_shadow_panels(
        images=[ShadowImage("winter", _tiny_png_b64((60, 60, 60)))],
        metadata=SunlightMeta(),
    )

    assert chart.startswith(b"%PDF-")
    width_mm, height_mm = _pdf_size_mm(chart)
    assert width_mm >= 160
    assert height_mm >= 85
    text = _pdf_text(chart)
    assert "Additional viewpoints require re-export after 3D computation" in text


def test_age_distribution_happy_path():
    chart = render_age_distribution(AgeProfile(age_0_24=22, age_25_64=65, age_65_plus=13))
    assert chart.startswith(b"%PDF-")
    width_mm, height_mm = _pdf_size_mm(chart)
    assert width_mm >= CHART_WIDTH_MM - 12
    assert 16 <= height_mm <= 40
    text = _pdf_text(chart)
    assert "0 24" in text or "0-24" in text or "0\u201324" in text
    assert "25 64" in text or "25-64" in text or "25\u201364" in text
    assert "65+" in text
    assert "22%" in text
    assert "65%" in text
    assert "13%" in text


def test_age_distribution_partial_data():
    chart = render_age_distribution(AgeProfile(age_0_24=25, age_25_64=None, age_65_plus=14))
    assert chart.startswith(b"%PDF-")
    text = _pdf_text(chart)
    assert "None" not in text
    assert "25%" in text
    assert "14%" in text


def test_age_distribution_local_legend_matches_bar_color(monkeypatch):
    captured_color: str | None = None
    original_text = Axes.text

    def _patched_text(self, x, y, s, *args, **kwargs):  # type: ignore[no-untyped-def]
        nonlocal captured_color
        if str(s) == "This neighborhood":
            captured_color = str(kwargs.get("color"))
        return original_text(self, x, y, s, *args, **kwargs)

    monkeypatch.setattr(Axes, "text", _patched_text)

    render_age_distribution(AgeProfile(age_0_24=22, age_25_64=65, age_65_plus=13))

    assert captured_color == cr.C_ACCENT_DARK


def test_livability_good_score():
    chart = render_livability_score(
        livability=LivabilityData(score=78, label="Livability"),
        crime=CrimeData(score=42, label="Crime"),
    )

    assert chart.startswith(b"%PDF-")
    text = _pdf_text(chart)
    assert "Livability" in text
    assert "Crime" in text
    assert "78/100" in text
    assert "42/100" in text


def test_livability_no_crime_data():
    chart = render_livability_score(
        livability=LivabilityData(score=78, label="Livability"),
        crime=CrimeData(score=None, label="Crime"),
    )

    assert chart.startswith(b"%PDF-")
    text = _pdf_text(chart)
    assert "Livability" in text
    assert "78" in text
    assert "Crime" not in text


def test_livability_empty_state():
    chart = render_livability_score(
        livability=LivabilityData(score=None, label="Livability"),
        crime=CrimeData(score=None, label="Crime"),
    )
    assert chart.startswith(b"%PDF-")
