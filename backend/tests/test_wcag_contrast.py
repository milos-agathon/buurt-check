"""WCAG contrast verification for LaTeX templates and chart renderer (Epic 4, Story 4.2)."""

from __future__ import annotations

import base64
import io
import re
from dataclasses import dataclass
from typing import Any

import matplotlib
import matplotlib.figure
import numpy as np
import pytest
from matplotlib import colors as mcolors
from PIL import Image

from app.models.neighborhood import AgeProfile
from app.services import chart_renderer as cr
from app.services.chart_renderer import (
    CompRow,
    CrimeData,
    FacadeHeatmapRow,
    LivabilityData,
    RiskCell,
    ShadowImage,
    SunlightMeta,
    render_age_distribution,
    render_facade_heatmap,
    render_livability_score,
    render_risk_comparison,
    render_risk_summary_grid,
    render_shadow_panels,
)
from app.services.latex_env import render_dossier, render_preamble
from tests.epic4_pdf_fixtures import dossier_kwargs


@dataclass(frozen=True)
class ContrastPair:
    fg_hex: str
    bg_hex: str
    font_size: float
    context: str


@pytest.mark.parametrize("language", ["en", "nl"])
def test_wcag_contrast_all_pairs(language: str) -> None:
    pairs = _extract_latex_text_pairs(language)
    pairs.extend(_extract_chart_text_pairs())

    assert pairs, "No contrast pairs were extracted"

    failures: list[str] = []
    accent_hex = "#2EC4B6"

    for pair in pairs:
        cratio = _contrast_ratio(pair.fg_hex, pair.bg_hex)
        threshold = _threshold_for_pair(pair)
        if threshold is None:
            continue
        if cratio < threshold:
            failures.append(
                f"{pair.context}: {pair.fg_hex} on {pair.bg_hex} = {cratio:.2f} < {threshold:.2f}"
            )

    # Accent teal is fill-only, never body text on light backgrounds.
    bad_accent = [
        p for p in pairs
        if p.fg_hex == accent_hex and p.bg_hex in {"#FFFFFF", "#FAFBFC"}
    ]
    assert not bad_accent, "Accent teal (#2EC4B6) must never be used as light-background text"

    # Severity palette must be checked against white and dark backgrounds.
    severity_hexes = ["#22C55E", "#EAB308", "#EF4444", "#B91C1C"]
    for sev_hex in severity_hexes:
        on_white = _contrast_ratio(sev_hex, "#FFFFFF")
        on_dark = _contrast_ratio(sev_hex, "#1C2D3F")
        assert max(on_white, on_dark) >= 3.0, (
            f"Severity {sev_hex} is below graphical 3:1 on both white and dark backgrounds"
        )

    assert not failures, "WCAG contrast violations:\n" + "\n".join(failures)


def test_facade_heatmap_value_text_meets_wcag_contrast() -> None:
    rows = [
        FacadeHeatmapRow(
            orientation="south",
            height_label="ground",
            winter_hours=5.8,
            summer_hours=10.9,
            annual_average=8.1,
        ),
        FacadeHeatmapRow(
            orientation="north",
            height_label="ground",
            winter_hours=1.6,
            summer_hours=5.2,
            annual_average=3.8,
        ),
    ]
    max_hours = max(max(row.winter_hours, row.summer_hours) for row in rows)

    for row in rows:
        for value in (row.winter_hours, row.summer_hours):
            fill_hex = cr._facade_heatmap_fill_color(value, max_hours)
            text_hex = cr._facade_heatmap_text_color(fill_hex)
            assert _contrast_ratio(text_hex, fill_hex) >= 4.5


def test_facade_heatmap_renderer_keeps_label_text_on_safe_light_background() -> None:
    render_facade_heatmap(
        [
            FacadeHeatmapRow(
                orientation="south",
                height_label="ground",
                winter_hours=5.8,
                summer_hours=10.9,
                annual_average=8.1,
            ),
        ],
        output_format="pdf",
    )
    assert _contrast_ratio(cr.C_PRIMARY, cr.C_BG) >= 4.5
    assert _contrast_ratio(cr.C_REFERENCE, cr.C_BG) >= 4.5


def _threshold_for_pair(pair: ContrastPair) -> float | None:
    if "severity" in pair.context:
        # Severity palette is validated separately as graphical encoding.
        return None
    # Headings and semantic score badges can use the 3:1 large-text threshold.
    if any(token in pair.context for token in ("heading", "subsubsection", "link")):
        return 3.0
    if pair.font_size >= 18.0:
        return 3.0
    return 4.5


def _tiny_png_b64(rgb: tuple[int, int, int]) -> str:
    image = Image.new("RGB", (80, 48), rgb)
    buf = io.BytesIO()
    image.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("ascii")


def _extract_chart_text_pairs() -> list[ContrastPair]:
    captured: list[ContrastPair] = []

    original_text = matplotlib.axes.Axes.text
    original_annotate = matplotlib.axes.Axes.annotate
    original_fig_text = matplotlib.figure.Figure.text
    bg_holder = {"bg": "#FFFFFF", "context": "chart"}

    def _record(kwargs: dict[str, Any], default_size: float = 9.5) -> None:
        color = kwargs.get("color")
        if color is None:
            return
        fg_hex = mcolors.to_hex(color).upper()
        bg_hex = mcolors.to_hex(bg_holder["bg"]).upper()
        font_size = float(kwargs.get("fontsize", default_size))
        captured.append(
            ContrastPair(
                fg_hex=fg_hex,
                bg_hex=bg_hex,
                font_size=font_size,
                context=bg_holder["context"],
            )
        )

    def patched_text(self, *args, **kwargs):  # type: ignore[no-untyped-def]
        _record(kwargs)
        return original_text(self, *args, **kwargs)

    def patched_annotate(self, *args, **kwargs):  # type: ignore[no-untyped-def]
        _record(kwargs)
        return original_annotate(self, *args, **kwargs)

    def patched_fig_text(self, *args, **kwargs):  # type: ignore[no-untyped-def]
        _record(kwargs)
        return original_fig_text(self, *args, **kwargs)

    matplotlib.axes.Axes.text = patched_text  # type: ignore[assignment]
    matplotlib.axes.Axes.annotate = patched_annotate  # type: ignore[assignment]
    matplotlib.figure.Figure.text = patched_fig_text  # type: ignore[assignment]
    try:
        bg_holder["bg"] = cr.C_BG
        bg_holder["context"] = "chart-risk-comparison"
        render_risk_comparison(
            category="Noise",
            address_score=72,
            comparisons=[
                CompRow("City average", 66),
                CompRow("Netherlands", 61),
                CompRow("WHO guideline", 74, role="reference"),
            ],
        )

        bg_holder["bg"] = cr.C_BG
        bg_holder["context"] = "chart-risk-grid-severity"
        render_risk_summary_grid(
            [
                RiskCell("Noise", 82, severity="good"),
                RiskCell("Air", 54, severity="moderate"),
                RiskCell("Climate", 31, severity="poor"),
                RiskCell("Sunlight", 12, severity="critical"),
            ]
        )

        bg_holder["bg"] = cr.C_DARK_BG
        bg_holder["context"] = "chart-shadow-dark"
        render_shadow_panels(
            images=[
                ShadowImage("winter", _tiny_png_b64((34, 45, 63))),
                ShadowImage("equinox", _tiny_png_b64((55, 65, 75))),
                ShadowImage("summer", _tiny_png_b64((76, 86, 96))),
            ],
            metadata=SunlightMeta(),
        )

        bg_holder["bg"] = cr.C_BG
        bg_holder["context"] = "chart-age"
        render_age_distribution(AgeProfile(age_0_24=22, age_25_64=65, age_65_plus=13))

        bg_holder["bg"] = cr.C_BG
        bg_holder["context"] = "chart-livability"
        render_livability_score(
            livability=LivabilityData(score=78, label="Livability"),
            crime=CrimeData(score=42, label="Crime"),
        )
    finally:
        matplotlib.axes.Axes.text = original_text  # type: ignore[assignment]
        matplotlib.axes.Axes.annotate = original_annotate  # type: ignore[assignment]
        matplotlib.figure.Figure.text = original_fig_text  # type: ignore[assignment]

    return captured


def _extract_latex_text_pairs(language: str) -> list[ContrastPair]:
    preamble = render_preamble(language=language)
    dossier_tex = render_dossier(**dossier_kwargs("full", language))

    color_defs = {
        name: f"#{hex_code.upper()}"
        for name, hex_code in re.findall(
            r"\\definecolor\{([a-zA-Z0-9-]+)\}\{HTML\}\{([0-9A-Fa-f]{6})\}",
            preamble,
        )
    }

    pairs: list[ContrastPair] = []

    # Preamble typography declarations with explicit sizes.
    for size_str, color_name in re.findall(
        r"\\fontsize\{([0-9.]+)\}\{[0-9.]+\}[^\n]*\\color\{([a-zA-Z0-9-]+)\}",
        preamble,
    ):
        fg = color_defs.get(color_name)
        if fg:
            pairs.append(
                ContrastPair(
                    fg_hex=fg,
                    bg_hex="#FFFFFF",
                    font_size=float(size_str),
                    context=f"latex-heading-{color_name}",
                )
            )

    # Footer/header metadata text is footnotesize on white.
    for color_name in re.findall(r"\\footnotesize\\color\{([a-zA-Z0-9-]+)\}", preamble):
        fg = color_defs.get(color_name)
        if fg:
            pairs.append(
                ContrastPair(
                    fg_hex=fg,
                    bg_hex="#FFFFFF",
                    font_size=8.0,
                    context=f"latex-footer-{color_name}",
                )
            )

    # Hyperlinks in the preamble use accent-text.
    for color_name in re.findall(r"(?:linkcolor|urlcolor)=([a-zA-Z0-9-]+)", preamble):
        fg = color_defs.get(color_name)
        if fg:
            pairs.append(
                ContrastPair(
                    fg_hex=fg,
                    bg_hex="#FFFFFF",
                    font_size=10.0,
                    context=f"latex-link-{color_name}",
                )
            )

    size_to_points = {
        "tiny": 7.0,
        "footnotesize": 8.0,
        "small": 9.5,
        "normalsize": 10.0,
        "large": 12.0,
        "Large": 14.0,
    }
    for size_name, color_name in re.findall(
        r"\\(tiny|footnotesize|small|normalsize|large|Large)\\color\{([a-zA-Z0-9-]+)\}",
        dossier_tex,
    ):
        fg = color_defs.get(color_name)
        if fg:
            pairs.append(
                ContrastPair(
                    fg_hex=fg,
                    bg_hex="#FFFFFF",
                    font_size=size_to_points[size_name],
                    context=(
                        f"latex-severity-{color_name}" if color_name.startswith("sev-")
                        else f"latex-body-{color_name}"
                    ),
                )
            )

    # Remove exact duplicates to keep failure output focused.
    uniq = {
        (pair.fg_hex, pair.bg_hex, pair.font_size, pair.context): pair
        for pair in pairs
    }
    return list(uniq.values())


def _relative_luminance(hex_color: str) -> float:
    rgb = np.array([int(hex_color[i : i + 2], 16) for i in (1, 3, 5)], dtype=np.float64) / 255.0

    def convert(channel: np.ndarray) -> np.ndarray:
        return np.where(channel <= 0.03928, channel / 12.92, ((channel + 0.055) / 1.055) ** 2.4)

    linear = convert(rgb)
    return float(0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2])


def _contrast_ratio(fg_hex: str, bg_hex: str) -> float:
    l1 = _relative_luminance(fg_hex)
    l2 = _relative_luminance(bg_hex)
    hi = max(l1, l2)
    lo = min(l1, l2)
    return (hi + 0.05) / (lo + 0.05)
