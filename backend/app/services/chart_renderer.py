"""Matplotlib-based chart rendering for dossier PDF exports.

Epic 1 introduces a Scherer-style renderer that returns vector PDF bytes for
all chart types used by export documents.
"""

from __future__ import annotations

import base64
import io
import math
from dataclasses import dataclass, field
from pathlib import Path
from types import MappingProxyType
from typing import Literal

import matplotlib

matplotlib.use("Agg")

import matplotlib.pyplot as plt
import numpy as np
from matplotlib import font_manager, rcParams
from matplotlib.patches import Rectangle
from PIL import Image

from app.models.neighborhood import AgeProfile
from app.services.scoring import severity_from_score

# --- Unit conversion ---
MM_PER_INCH = 25.4

# --- Font scale/weights ---
FONT_WEIGHT_DISPLAY = 700
FONT_WEIGHT_HEADING = 600
FONT_WEIGHT_BODY = 400
FONT_WEIGHT_CAPTION = 400

# --- Type scale (pt) ---
TYPE_DISPLAY_PT = 18.0
TYPE_HEADING_PT = 12.0
TYPE_BODY_PT = 9.5
TYPE_CAPTION_PT = 7.5
TYPE_SCORE_PT = 28.0
TYPE_GRID_LABEL_PT = 8.0

# --- Core dimensions (mm) ---
CHART_WIDTH_MM = 160.0
GRID_GAP_MM = 4.0
GRID_CELL_HEIGHT_MM = 36.0
RISK_ROW_HEIGHT_MM = 9.0
RISK_MIN_HEIGHT_MM = 24.0
SHADOW_WIDTH_MM = 170.0
SHADOW_PANEL_HEIGHT_MM = 60.0
SHADOW_SINGLE_HEIGHT_MM = 90.0
SHADOW_PANEL_GAP_MM = 6.0
AGE_CHART_HEIGHT_MM = 25.0
LIVABILITY_HEIGHT_MM = 32.0

OutputFormat = Literal["pdf", "png"]

# --- Colors ---
C_PRIMARY = "#1C2D3F"
C_ACCENT = "#2EC4B6"
C_ACCENT_DARK = "#187E76"
C_MUTE_1 = "#B4C0CE"
C_MUTE_2 = "#D1D8E0"
C_REFERENCE = "#637892"
C_SEV_GOOD = "#22C55E"
C_SEV_MOD = "#EAB308"
C_SEV_POOR = "#EF4444"
C_SEV_CRIT = "#B91C1C"
C_BG = "#FFFFFF"
C_AXIS = "#E2E7ED"
C_DARK_BG = "#1C2D3F"
C_WHITE = "#FFFFFF"

SEVERITY_COLORS: MappingProxyType[str, str] = MappingProxyType(
    {
        "good": C_SEV_GOOD,
        "moderate": C_SEV_MOD,
        "poor": C_SEV_POOR,
        "critical": C_SEV_CRIT,
        "unavailable": C_MUTE_1,
    }
)

SCHERER_RCPARAMS: MappingProxyType[str, object] = MappingProxyType(
    {
        "axes.spines.top": False,
        "axes.spines.right": False,
        "axes.spines.left": False,
        "axes.spines.bottom": True,
        "axes.linewidth": 0.4,
        "axes.edgecolor": C_AXIS,
        "axes.grid": False,
        "xtick.major.size": 0,
        "ytick.major.size": 0,
        "xtick.labelsize": TYPE_CAPTION_PT,
        "ytick.labelsize": TYPE_BODY_PT,
        "font.family": "sans-serif",
        "font.sans-serif": ["Inter", "Source Sans 3", "Helvetica Neue", "DejaVu Sans"],
        "font.size": TYPE_BODY_PT,
        "figure.facecolor": C_BG,
        "figure.dpi": 300,
        "savefig.dpi": 300,
        "savefig.bbox": "tight",
        "savefig.pad_inches": 0.05,
        "legend.frameon": False,
        "legend.fontsize": TYPE_CAPTION_PT,
    }
)

_ASSETS_FONTS_DIR = Path(__file__).parent.parent / "assets" / "fonts"

SEASON_ORDER: tuple[str, ...] = ("winter", "equinox", "summer")
SEASON_LABELS: MappingProxyType[str, str] = MappingProxyType(
    {
        "winter": "Winter Solstice - Dec 21",
        "equinox": "Spring Equinox - Mar 20",
        "summer": "Summer Solstice - Jun 21",
    }
)
DEFAULT_SUN_POSITIONS: MappingProxyType[str, tuple[float, float]] = MappingProxyType(
    {
        "winter": (180.0, 17.0),
        "equinox": (180.0, 38.0),
        "summer": (180.0, 61.0),
    }
)


def _mm_to_inch(mm: float) -> float:
    return mm / MM_PER_INCH


def _save_figure(fig: plt.Figure, output_format: OutputFormat = "pdf") -> bytes:
    """Serialize a matplotlib figure to bytes without mutating global rcParams."""
    buf = io.BytesIO()
    fig.savefig(
        buf,
        format=output_format,
        dpi=300,
        bbox_inches=fig.bbox_inches,
        pad_inches=0.0,
    )
    plt.close(fig)
    return buf.getvalue()


def _registered_font_names() -> set[str]:
    return {font.name for font in font_manager.fontManager.ttflist}


def _register_local_fonts() -> None:
    """Best-effort registration for project-local font files."""
    if not _ASSETS_FONTS_DIR.exists():
        return
    for font_file in _ASSETS_FONTS_DIR.glob("*.otf"):
        try:
            font_manager.fontManager.addfont(str(font_file))
        except Exception:
            continue
    for font_file in _ASSETS_FONTS_DIR.glob("*.ttf"):
        try:
            font_manager.fontManager.addfont(str(font_file))
        except Exception:
            continue


def _normalize_season_label(value: str) -> str:
    lower = value.strip().lower()
    if lower.startswith("winter"):
        return "winter"
    if lower.startswith("spring") or "equinox" in lower:
        return "equinox"
    if lower.startswith("summer"):
        return "summer"
    return lower


def _score_severity(score: int | None) -> str:
    if score is None:
        return "unavailable"
    return severity_from_score(int(score)).value


def _severity_color(severity: str) -> str:
    return SEVERITY_COLORS.get(severity, C_MUTE_1)


def _severity_label(severity: str) -> str:
    if severity == "unavailable":
        return "\u2014"
    return severity.upper()


def _score_display(score: int | float | None) -> str:
    if score is None:
        return "\u2014"
    return str(int(round(score)))


@dataclass(frozen=True, slots=True)
class SchererTheme:
    """Reusable Scherer-style theme that configures matplotlib globally."""

    preferred_fonts: tuple[str, ...] = ("Inter", "Source Sans 3")
    fallback_fonts: tuple[str, ...] = ("Helvetica Neue", "DejaVu Sans")

    def apply(self) -> tuple[str, ...]:
        """Apply rcParams and return resolved sans-serif stack."""
        _register_local_fonts()
        available = _registered_font_names()

        resolved: list[str] = [font for font in self.preferred_fonts if font in available]
        if not resolved:
            for fallback in self.fallback_fonts:
                if fallback in available:
                    resolved.append(fallback)
                    break
        if not resolved:
            resolved = ["DejaVu Sans"]

        # Preserve ordering while dropping duplicates.
        stack = tuple(dict.fromkeys([*resolved, *self.fallback_fonts, "DejaVu Sans"]))

        for key, value in SCHERER_RCPARAMS.items():
            rcParams[key] = value
        rcParams["font.sans-serif"] = list(stack)
        return stack


@dataclass(frozen=True, slots=True)
class CompRow:
    """Comparison row for risk charts."""

    label: str
    value: float | int | None
    role: Literal["comparison", "reference"] = "comparison"


@dataclass(frozen=True, slots=True)
class RiskCell:
    """Cell data for risk summary grid rendering."""

    category: str
    score: int | None
    severity: str | None = None


@dataclass(frozen=True, slots=True)
class ShadowImage:
    """Input image payload for seasonal shadow panel rendering."""

    season: str
    image_b64: str
    time_label: str = "12:00"
    sun_azimuth: float | None = None
    sun_altitude: float | None = None
    target_bbox: tuple[float, float, float, float] | None = None


@dataclass(frozen=True, slots=True)
class SunlightMeta:
    """Render metadata used across seasonal shadow panels."""

    sun_positions: dict[str, tuple[float, float]] = field(default_factory=dict)
    target_bbox: tuple[float, float, float, float] = (0.36, 0.36, 0.28, 0.28)
    single_panel_note: str = (
        "Equinox and summer analysis requires additional 3D computation"
    )


@dataclass(frozen=True, slots=True)
class LivabilityData:
    """Compact livability score input for lollipop rendering."""

    score: int | None
    label: str = "Livability"


@dataclass(frozen=True, slots=True)
class CrimeData:
    """Compact crime score input for lollipop rendering."""

    score: int | None
    label: str = "Crime"


def render_risk_comparison(
    category: str,
    address_score: int,
    comparisons: list[CompRow],
    output_format: OutputFormat = "pdf",
) -> bytes:
    """Render Scherer-style risk comparison chart as vector PDF bytes."""
    SchererTheme().apply()

    bar_rows: list[CompRow] = [CompRow(label="This address", value=address_score)]
    reference_rows: list[CompRow] = []

    for row in comparisons:
        if row.value is None:
            continue
        if row.role == "reference":
            reference_rows.append(row)
            continue
        label = row.label.strip()
        if not label:
            continue
        if "address" in label.lower():
            continue
        bar_rows.append(CompRow(label=label, value=row.value))

    max_bar = max(float(row.value) for row in bar_rows if row.value is not None)
    max_ref = max(
        (float(row.value) for row in reference_rows if row.value is not None),
        default=0.0,
    )
    max_x = max(100.0, max_bar, max_ref) + 8.0
    label_space = max(24.0, min(65.0, 1.8 * max(len(row.label) for row in bar_rows)))

    chart_h_mm = max(RISK_MIN_HEIGHT_MM, 10.0 + len(bar_rows) * RISK_ROW_HEIGHT_MM)
    fig, ax = plt.subplots(
        figsize=(_mm_to_inch(CHART_WIDTH_MM), _mm_to_inch(chart_h_mm)),
        dpi=300,
    )
    fig.patch.set_facecolor(C_BG)

    y_positions = np.arange(len(bar_rows))[::-1]
    alt_colors = [C_MUTE_1, C_MUTE_2]
    for idx, (row, y) in enumerate(zip(bar_rows, y_positions, strict=True)):
        value = float(row.value) if row.value is not None else 0.0
        is_primary = idx == 0
        bar_height = 0.6 if is_primary else 0.4
        bar_color = C_ACCENT if is_primary else alt_colors[(idx - 1) % len(alt_colors)]
        ax.barh(y=y, width=value, height=bar_height, color=bar_color, edgecolor="none")
        ax.text(
            -label_space + 1.0,
            y,
            row.label,
            fontsize=TYPE_BODY_PT,
            fontweight=FONT_WEIGHT_HEADING if is_primary else FONT_WEIGHT_BODY,
            color=C_PRIMARY,
            va="center",
            ha="left",
        )
        ax.text(
            min(max_x - 1.0, value + 1.2),
            y,
            _score_display(value),
            fontsize=TYPE_BODY_PT,
            color=C_ACCENT_DARK if is_primary else C_PRIMARY,
            va="center",
            ha="left",
        )

    label_y = y_positions[0] + 0.45 if len(y_positions) else 0.0
    for idx, row in enumerate(reference_rows):
        if row.value is None:
            continue
        x = float(row.value)
        ax.axvline(x=x, color=C_REFERENCE, linewidth=0.8, linestyle=(0, (3, 2)))
        ax.text(
            x + 0.8,
            label_y - idx * 0.28,
            row.label,
            fontsize=TYPE_CAPTION_PT,
            color=C_PRIMARY,
            va="bottom",
            ha="left",
        )

    ax.set_title(
        category,
        loc="left",
        fontsize=TYPE_HEADING_PT,
        color=C_PRIMARY,
        fontweight=FONT_WEIGHT_HEADING,
        pad=6,
    )
    ax.set_xlim(-label_space, max_x)
    ax.set_ylim(-0.7, max(0.8, len(bar_rows) - 0.2))
    ax.set_yticks([])
    ax.set_xticks([])
    ax.tick_params(axis="both", length=0)
    ax.spines["left"].set_visible(False)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.spines["bottom"].set_color(C_AXIS)
    ax.spines["bottom"].set_linewidth(0.4)
    fig.subplots_adjust(left=0.04, right=0.98, top=0.86, bottom=0.2)

    return _save_figure(fig, output_format=output_format)


def render_risk_summary_grid(
    cells: list[RiskCell],
    cols: int = 4,
    output_format: OutputFormat = "pdf",
) -> bytes:
    """Render score-only risk summary grid as vector PDF bytes."""
    SchererTheme().apply()
    if cols <= 0:
        raise ValueError("cols must be >= 1")

    if not cells:
        cells = [
            RiskCell(category="Noise", score=None),
            RiskCell(category="Air", score=None),
            RiskCell(category="Climate", score=None),
            RiskCell(category="Sunlight", score=None),
        ]

    row_count = max(1, math.ceil(len(cells) / cols))
    grid_h_mm = row_count * GRID_CELL_HEIGHT_MM + (row_count - 1) * GRID_GAP_MM
    cell_w_mm = (CHART_WIDTH_MM - (cols - 1) * GRID_GAP_MM) / cols

    fig, ax = plt.subplots(
        figsize=(_mm_to_inch(CHART_WIDTH_MM), _mm_to_inch(grid_h_mm)),
        dpi=300,
    )
    fig.patch.set_facecolor(C_BG)
    ax.set_xlim(0.0, CHART_WIDTH_MM)
    ax.set_ylim(grid_h_mm, 0.0)
    ax.axis("off")

    for idx, cell in enumerate(cells):
        col = idx % cols
        row = idx // cols
        x = col * (cell_w_mm + GRID_GAP_MM)
        y = row * (GRID_CELL_HEIGHT_MM + GRID_GAP_MM)

        severity = cell.severity or _score_severity(cell.score)
        color = _severity_color(severity)
        if cell.score is None:
            color = C_MUTE_1

        ax.text(
            x,
            y + 5.5,
            cell.category.upper(),
            fontsize=TYPE_GRID_LABEL_PT,
            color=C_MUTE_1,
            va="top",
            ha="left",
        )
        ax.text(
            x,
            y + 20.0,
            _score_display(cell.score),
            fontsize=TYPE_SCORE_PT,
            fontweight=FONT_WEIGHT_DISPLAY,
            color=color,
            va="center",
            ha="left",
        )
        ax.text(
            x,
            y + 31.0,
            _severity_label(severity),
            fontsize=TYPE_BODY_PT,
            fontweight=FONT_WEIGHT_HEADING,
            color=color,
            va="center",
            ha="left",
        )

    fig.subplots_adjust(left=0.03, right=0.98, top=0.95, bottom=0.1)
    return _save_figure(fig, output_format=output_format)


def _decode_shadow_image(image_b64: str) -> np.ndarray | None:
    try:
        raw = base64.b64decode(image_b64)
        with Image.open(io.BytesIO(raw)) as image:
            return np.asarray(image.convert("RGBA"))
    except Exception:
        return None


def _panel_annotation(
    ax: plt.Axes,
    season: str,
    panel: ShadowImage,
    metadata: SunlightMeta,
) -> None:
    season_key = _normalize_season_label(season)
    season_label = SEASON_LABELS.get(season_key, season.title())
    ax.text(
        0.02,
        0.95,
        season_label,
        transform=ax.transAxes,
        color=C_WHITE,
        fontsize=TYPE_BODY_PT,
        fontweight=600,
        va="top",
        ha="left",
    )
    ax.text(
        0.5,
        0.05,
        panel.time_label,
        transform=ax.transAxes,
        color=C_WHITE,
        fontsize=TYPE_CAPTION_PT,
        va="bottom",
        ha="center",
    )
    ax.annotate(
        "N",
        xy=(0.94, 0.90),
        xytext=(0.94, 0.74),
        xycoords="axes fraction",
        textcoords="axes fraction",
        color=C_WHITE,
        fontsize=TYPE_CAPTION_PT,
        ha="center",
        va="center",
        arrowprops={"arrowstyle": "-|>", "color": C_WHITE, "linewidth": 0.9},
    )

    default_sun = DEFAULT_SUN_POSITIONS.get(season_key, (180.0, 35.0))
    azimuth, altitude = metadata.sun_positions.get(season_key, default_sun)
    if panel.sun_azimuth is not None:
        azimuth = panel.sun_azimuth
    if panel.sun_altitude is not None:
        altitude = panel.sun_altitude

    sun_x = min(0.95, max(0.05, azimuth / 360.0))
    sun_y = min(0.9, max(0.12, altitude / 90.0))
    ax.scatter(
        [sun_x],
        [sun_y],
        transform=ax.transAxes,
        s=28,
        c=C_ACCENT,
        edgecolors=C_WHITE,
        linewidths=0.4,
        zorder=3,
    )
    ax.text(
        min(0.97, sun_x + 0.02),
        min(0.94, sun_y + 0.02),
        f"{int(round(azimuth))}\u00b0/{int(round(altitude))}\u00b0",
        transform=ax.transAxes,
        color=C_WHITE,
        fontsize=TYPE_CAPTION_PT,
        va="bottom",
        ha="left",
    )

    bbox = panel.target_bbox or metadata.target_bbox
    ax.add_patch(
        Rectangle(
            (bbox[0], bbox[1]),
            bbox[2],
            bbox[3],
            transform=ax.transAxes,
            fill=False,
            edgecolor=C_ACCENT,
            linewidth=1.2,
        )
    )


def render_shadow_panels(
    images: list[ShadowImage],
    metadata: SunlightMeta,
    output_format: OutputFormat = "pdf",
) -> bytes:
    """Render seasonal shadow analysis panels as vector PDF bytes."""
    SchererTheme().apply()
    decoded: list[tuple[str, ShadowImage, np.ndarray]] = []
    for panel in images:
        image_array = _decode_shadow_image(panel.image_b64)
        if image_array is not None:
            decoded.append((panel.season, panel, image_array))

    if not decoded:
        fig, ax = plt.subplots(
            figsize=(_mm_to_inch(SHADOW_WIDTH_MM), _mm_to_inch(SHADOW_SINGLE_HEIGHT_MM)),
            dpi=300,
        )
        fig.patch.set_facecolor(C_DARK_BG)
        ax.set_facecolor(C_DARK_BG)
        ax.text(
            0.5,
            0.5,
            "Shadow analysis unavailable",
            transform=ax.transAxes,
            color=C_WHITE,
            fontsize=TYPE_BODY_PT,
            va="center",
            ha="center",
        )
        ax.set_axis_off()
        return _save_figure(fig, output_format=output_format)

    season_map: dict[str, tuple[ShadowImage, np.ndarray]] = {}
    other_panels: list[tuple[ShadowImage, np.ndarray]] = []
    for season_name, panel, image_array in decoded:
        key = _normalize_season_label(season_name)
        if key in SEASON_ORDER and key not in season_map:
            season_map[key] = (panel, image_array)
        else:
            other_panels.append((panel, image_array))

    ordered_panels: list[tuple[str, ShadowImage, np.ndarray]] = []
    if all(season in season_map for season in SEASON_ORDER):
        for season in SEASON_ORDER:
            panel, image_array = season_map[season]
            ordered_panels.append((season, panel, image_array))
    else:
        for season, panel, image_array in decoded:
            ordered_panels.append((_normalize_season_label(season), panel, image_array))

    if len(ordered_panels) == 1:
        fig, ax = plt.subplots(
            figsize=(_mm_to_inch(SHADOW_WIDTH_MM), _mm_to_inch(SHADOW_SINGLE_HEIGHT_MM)),
            dpi=300,
        )
        fig.patch.set_facecolor(C_DARK_BG)
        season, panel, image_array = ordered_panels[0]
        ax.set_facecolor(C_DARK_BG)
        ax.imshow(image_array, interpolation="antialiased")
        _panel_annotation(ax, season, panel, metadata)
        ax.set_xticks([])
        ax.set_yticks([])
        for spine in ax.spines.values():
            spine.set_visible(False)
        fig.text(
            0.02,
            0.02,
            metadata.single_panel_note,
            color=C_WHITE,
            fontsize=TYPE_CAPTION_PT,
            ha="left",
            va="bottom",
        )
        fig.subplots_adjust(left=0.01, right=0.99, top=0.99, bottom=0.06)
        return _save_figure(fig, output_format=output_format)

    panel_count = min(3, len(ordered_panels))
    fig_h_mm = panel_count * SHADOW_PANEL_HEIGHT_MM + (panel_count - 1) * SHADOW_PANEL_GAP_MM
    fig, axes = plt.subplots(
        panel_count,
        1,
        figsize=(_mm_to_inch(SHADOW_WIDTH_MM), _mm_to_inch(fig_h_mm)),
        dpi=300,
    )
    fig.patch.set_facecolor(C_DARK_BG)
    if panel_count == 1:
        axes = [axes]

    for axis, (season, panel, image_array) in zip(axes, ordered_panels[:panel_count], strict=True):
        axis.set_facecolor(C_DARK_BG)
        axis.imshow(image_array, interpolation="antialiased")
        _panel_annotation(axis, season, panel, metadata)
        axis.set_xticks([])
        axis.set_yticks([])
        for spine in axis.spines.values():
            spine.set_visible(False)

    fig.subplots_adjust(left=0.01, right=0.99, top=0.99, bottom=0.01, hspace=0.08)
    return _save_figure(fig, output_format=output_format)


def render_age_distribution(
    age_data: AgeProfile,
    output_format: OutputFormat = "pdf",
) -> bytes:
    """Render neighborhood age profile as a horizontal bar chart."""
    SchererTheme().apply()

    labels = ["0\u201324", "25\u201364", "65+"]
    raw_values = [age_data.age_0_24, age_data.age_25_64, age_data.age_65_plus]
    bar_values = [float(v) if v is not None else 0.0 for v in raw_values]
    max_x = max(100.0, max(bar_values, default=0.0) + 10.0)
    label_space = 16.0

    fig, ax = plt.subplots(
        figsize=(_mm_to_inch(CHART_WIDTH_MM), _mm_to_inch(AGE_CHART_HEIGHT_MM)),
        dpi=300,
    )
    fig.patch.set_facecolor(C_BG)

    y_positions = np.arange(len(labels))[::-1]
    ax.barh(y_positions, bar_values, height=0.55, color=C_ACCENT, edgecolor="none")

    for label, raw_value, value, y in zip(labels, raw_values, bar_values, y_positions, strict=True):
        ax.text(
            -label_space + 0.6,
            y,
            label,
            fontsize=TYPE_BODY_PT,
            color=C_REFERENCE,
            va="center",
            ha="left",
        )
        endpoint = "\u2014" if raw_value is None else f"{int(round(raw_value))}%"
        ax.text(
            min(max_x - 1.0, value + 1.2),
            y,
            endpoint,
            fontsize=TYPE_BODY_PT,
            color=C_PRIMARY,
            va="center",
            ha="left",
        )

    ax.set_xlim(-label_space, max_x)
    ax.set_ylim(-0.8, len(labels) - 0.2)
    ax.set_yticks([])
    ax.set_xticks([])
    ax.tick_params(axis="both", length=0)
    ax.spines["left"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.spines["top"].set_visible(False)
    ax.spines["bottom"].set_visible(False)
    fig.subplots_adjust(left=0.03, right=0.98, top=0.9, bottom=0.15)
    return _save_figure(fig, output_format=output_format)


def render_livability_score(
    livability: LivabilityData,
    crime: CrimeData,
    output_format: OutputFormat = "pdf",
) -> bytes:
    """Render livability + crime as lollipop/dot chart with severity bands."""
    SchererTheme().apply()

    fig, ax = plt.subplots(
        figsize=(_mm_to_inch(CHART_WIDTH_MM), _mm_to_inch(LIVABILITY_HEIGHT_MM)),
        dpi=300,
    )
    fig.patch.set_facecolor(C_BG)

    # Subtle severity context bands.
    ax.axvspan(0, 20, color=C_SEV_CRIT, alpha=0.08)
    ax.axvspan(20, 40, color=C_SEV_POOR, alpha=0.08)
    ax.axvspan(40, 70, color=C_SEV_MOD, alpha=0.08)
    ax.axvspan(70, 100, color=C_SEV_GOOD, alpha=0.08)

    y_livability = 1.0
    y_crime = 0.35

    if livability.score is not None:
        livability_score = float(livability.score)
        livability_color = _severity_color(_score_severity(int(livability.score)))
        ax.hlines(y_livability, xmin=0, xmax=livability_score, color=C_REFERENCE, linewidth=0.9)
        ax.scatter(
            [livability_score],
            [y_livability],
            s=8.0**2,
            c=livability_color,
            edgecolors=C_PRIMARY,
            linewidths=0.4,
            zorder=3,
        )
        ax.text(
            livability_score + 1.2,
            y_livability,
            _score_display(livability.score),
            fontsize=TYPE_BODY_PT,
            color=C_PRIMARY,
            va="center",
            ha="left",
        )
        ax.text(
            -2.0,
            y_livability,
            livability.label,
            fontsize=TYPE_BODY_PT,
            color=C_PRIMARY,
            va="center",
            ha="right",
        )

    if crime.score is not None:
        crime_score = float(crime.score)
        ax.hlines(y_crime, xmin=0, xmax=crime_score, color=C_MUTE_2, linewidth=0.8)
        ax.scatter(
            [crime_score],
            [y_crime],
            s=6.0**2,
            c=C_MUTE_1,
            edgecolors=C_PRIMARY,
            linewidths=0.3,
            zorder=3,
        )
        ax.text(
            crime_score + 1.2,
            y_crime,
            _score_display(crime.score),
            fontsize=TYPE_CAPTION_PT,
            color=C_PRIMARY,
            va="center",
            ha="left",
        )
        ax.text(
            -2.0,
            y_crime,
            crime.label,
            fontsize=TYPE_CAPTION_PT,
            color=C_REFERENCE,
            va="center",
            ha="right",
        )

    ax.set_xlim(0, 100)
    ax.set_ylim(0.05, 1.3)
    ax.set_yticks([])
    ax.set_xticks([0, 25, 50, 75, 100])
    ax.tick_params(axis="x", length=0, colors=C_REFERENCE, labelsize=TYPE_CAPTION_PT)
    ax.tick_params(axis="y", length=0)
    ax.spines["left"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.spines["top"].set_visible(False)
    ax.spines["bottom"].set_color(C_AXIS)
    ax.spines["bottom"].set_linewidth(0.4)
    fig.subplots_adjust(left=0.08, right=0.98, top=0.9, bottom=0.24)
    return _save_figure(fig, output_format=output_format)


__all__ = [
    "AgeProfile",
    "CHART_WIDTH_MM",
    "CompRow",
    "CrimeData",
    "FONT_WEIGHT_BODY",
    "FONT_WEIGHT_CAPTION",
    "FONT_WEIGHT_DISPLAY",
    "FONT_WEIGHT_HEADING",
    "LivabilityData",
    "OutputFormat",
    "RiskCell",
    "SCHERER_RCPARAMS",
    "SchererTheme",
    "ShadowImage",
    "SunlightMeta",
    "render_age_distribution",
    "render_livability_score",
    "render_risk_comparison",
    "render_risk_summary_grid",
    "render_shadow_panels",
]
