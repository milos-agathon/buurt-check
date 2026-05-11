"""Matplotlib-based chart rendering for dossier PDF exports.

Epic 1 introduces a Scherer-style renderer that returns vector PDF bytes for
all chart types used by export documents.
"""

from __future__ import annotations

import base64
import io
import math
import textwrap
from dataclasses import dataclass, field
from pathlib import Path
from types import MappingProxyType
from typing import Literal

import matplotlib

matplotlib.use("Agg")

import matplotlib.pyplot as plt
import numpy as np
from matplotlib import colors as mcolors
from matplotlib import font_manager, rcParams
from matplotlib.patches import Rectangle
from PIL import Image

from app.models.neighborhood import AgeProfile
from app.services.scoring import severity_from_score

# --- Unit conversion ---
MM_PER_INCH = 25.4
CHART_DPI = 192

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
FACADE_HEATMAP_HEADER_HEIGHT_MM = 8.0
FACADE_HEATMAP_ROW_HEIGHT_MM = 8.5
FACADE_HEATMAP_LEGEND_GAP_MM = 4.0
FACADE_HEATMAP_LEGEND_HEIGHT_MM = 8.0
FACADE_HEATMAP_TOP_PAD_MM = 3.0
FACADE_HEATMAP_BOTTOM_PAD_MM = 3.0
COMPARISON_AXIS_TICKS: tuple[int, ...] = (0, 20, 40, 70, 100)
COMPARISON_GUIDE_TICKS: tuple[int, ...] = (20, 40, 70)
COMPARISON_SEGMENT_WIDTH = 4.0
COMPARISON_SEGMENT_GAP = 2.0
COMPARISON_SUBPLOT_LEFT = 0.04
COMPARISON_SUBPLOT_RIGHT = 0.985
COMPARISON_SUBPLOT_TOP = 0.84
COMPARISON_SUBPLOT_BOTTOM = 0.22

OutputFormat = Literal["pdf", "png"]

# --- Colors ---
C_PRIMARY = "#171D1C"
C_ACCENT = "#0D9488"
C_ACCENT_TEXT = "#00685F"
C_ACCENT_DARK = "#00685F"
C_MUTE_1 = "#BCC9C6"
C_MUTE_2 = "#DCE0E4"
C_REFERENCE = "#3D4947"
C_COMPARISON_PEER = "#3D4947"
C_COMPARISON_NATIONAL = "#6D7A77"
C_COMPARISON_REFERENCE = "#EAB308"
C_COMPARISON_GUIDE = "#DCE0E4"
C_SEV_GOOD = "#22C55E"
C_SEV_MOD = "#EAB308"
C_SEV_POOR = "#EF4444"
C_SEV_CRIT = "#B91C1C"
C_BG = "#FFFFFF"
C_AXIS = "#E2E8F0"
C_DARK_BG = "#171D1C"
C_WHITE = "#FFFFFF"
C_TILE_BG = "#F9FAFB"

NL_AGE_0_24 = 28.0
NL_AGE_25_64 = 50.0
NL_AGE_65_PLUS = 22.0

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
        "figure.dpi": CHART_DPI,
        "savefig.dpi": CHART_DPI,
        "savefig.bbox": None,
        "savefig.pad_inches": 0.05,
        "lines.antialiased": True,
        "patch.antialiased": True,
        "text.antialiased": True,
        "legend.frameon": False,
        "legend.fontsize": TYPE_CAPTION_PT,
    }
)

_ASSETS_FONTS_DIR = Path(__file__).parent.parent / "assets" / "fonts"

VIEW_ORDER: tuple[str, ...] = ("top", "front", "rear")
SEASON_ORDER: tuple[str, ...] = ("winter", "equinox", "summer")
SHADOW_ORDER: tuple[str, ...] = (*VIEW_ORDER, *SEASON_ORDER)
SHADOW_LABELS: MappingProxyType[str, str] = MappingProxyType(
    {
        "top": "Top view",
        "front": "Front facade",
        "rear": "Rear facade",
        "back": "Rear facade",
        "winter": "Winter reference date - Dec 21",
        "equinox": "Spring reference date - Mar 20",
        "summer": "Summer reference date - Jun 21",
    }
)
DEFAULT_SUN_POSITIONS: MappingProxyType[str, tuple[float, float]] = MappingProxyType(
    {
        "winter": (180.0, 17.0),
        "equinox": (180.0, 38.0),
        "summer": (180.0, 61.0),
    }
)
FACADE_ORIENTATION_LABELS: MappingProxyType[str, MappingProxyType[str, str]] = MappingProxyType(
    {
        "en": MappingProxyType(
            {
                "n": "North",
                "north": "North",
                "e": "East",
                "east": "East",
                "s": "South",
                "south": "South",
                "w": "West",
                "west": "West",
                "ne": "NE",
                "northeast": "NE",
                "nw": "NW",
                "northwest": "NW",
                "se": "SE",
                "southeast": "SE",
                "sw": "SW",
                "southwest": "SW",
            }
        ),
        "nl": MappingProxyType(
            {
                "n": "Noord",
                "north": "Noord",
                "e": "Oost",
                "east": "Oost",
                "s": "Zuid",
                "south": "Zuid",
                "w": "West",
                "west": "West",
                "ne": "NO",
                "northeast": "NO",
                "nw": "NW",
                "northwest": "NW",
                "se": "ZO",
                "southeast": "ZO",
                "sw": "ZW",
                "southwest": "ZW",
            }
        ),
    }
)


def _mm_to_inch(mm: float) -> float:
    return mm / MM_PER_INCH


def risk_summary_grid_height_mm(cell_count: int, cols: int = 4) -> float:
    """Return the intrinsic figure height for the summary grid."""
    if cols <= 0:
        raise ValueError("cols must be >= 1")
    safe_cell_count = max(1, cell_count)
    row_count = math.ceil(safe_cell_count / cols)
    return row_count * GRID_CELL_HEIGHT_MM + (row_count - 1) * GRID_GAP_MM


def facade_heatmap_height_mm(row_count: int) -> float:
    """Return the intrinsic figure height for the facade heatmap."""
    safe_rows = max(1, row_count)
    return (
        FACADE_HEATMAP_TOP_PAD_MM
        + FACADE_HEATMAP_HEADER_HEIGHT_MM
        + safe_rows * FACADE_HEATMAP_ROW_HEIGHT_MM
        + FACADE_HEATMAP_LEGEND_GAP_MM
        + FACADE_HEATMAP_LEGEND_HEIGHT_MM
        + FACADE_HEATMAP_BOTTOM_PAD_MM
    )


def _relative_luminance(hex_color: str) -> float:
    r, g, b = mcolors.to_rgb(hex_color)

    def _channel(value: float) -> float:
        if value <= 0.03928:
            return value / 12.92
        return ((value + 0.055) / 1.055) ** 2.4

    return 0.2126 * _channel(r) + 0.7152 * _channel(g) + 0.0722 * _channel(b)


def _contrast_ratio_hex(fg_hex: str, bg_hex: str) -> float:
    fg = _relative_luminance(fg_hex)
    bg = _relative_luminance(bg_hex)
    lighter = max(fg, bg)
    darker = min(fg, bg)
    return (lighter + 0.05) / (darker + 0.05)


def _blend_hex(start_hex: str, end_hex: str, fraction: float) -> str:
    start_rgb = np.array(mcolors.to_rgb(start_hex))
    end_rgb = np.array(mcolors.to_rgb(end_hex))
    ratio = max(0.0, min(1.0, fraction))
    return mcolors.to_hex(start_rgb + (end_rgb - start_rgb) * ratio).upper()


def _facade_heatmap_fill_color(value: float, max_hours: float) -> str:
    if max_hours <= 0:
        return C_MUTE_2
    ratio = max(0.0, min(float(value) / max_hours, 1.0))
    return _blend_hex(C_MUTE_2, C_ACCENT_DARK, ratio)


def _facade_heatmap_text_color(fill_hex: str) -> str:
    primary_ratio = _contrast_ratio_hex(C_PRIMARY, fill_hex)
    white_ratio = _contrast_ratio_hex(C_WHITE, fill_hex)
    if primary_ratio >= 4.5 and primary_ratio >= white_ratio:
        return C_PRIMARY
    if white_ratio >= 4.5:
        return C_WHITE
    return C_PRIMARY if primary_ratio >= white_ratio else C_WHITE


def _facade_label(row: "FacadeHeatmapRow", *, is_nl: bool, duplicate_orientations: set[str]) -> str:
    orientation_key = row.orientation.strip().lower()
    language_key = "nl" if is_nl else "en"
    orientation = FACADE_ORIENTATION_LABELS[language_key].get(
        orientation_key,
        row.orientation.capitalize(),
    )
    if orientation_key in duplicate_orientations and row.height_label:
        return f"{orientation} ({row.height_label})"
    return orientation


def _save_figure(
    fig: plt.Figure,
    output_format: OutputFormat = "pdf",
    *,
    tight: bool = False,
) -> bytes:
    """Serialize a matplotlib figure to bytes without mutating global rcParams."""
    buf = io.BytesIO()
    fig.savefig(
        buf,
        format=output_format,
        dpi=CHART_DPI,
        bbox_inches="tight" if tight else fig.bbox_inches,
        pad_inches=0.02 if tight else 0.0,
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


def _normalize_shadow_label(value: str) -> str:
    lower = value.strip().lower()
    if lower in {"top", "front"}:
        return lower
    if lower in {"rear", "back"}:
        return "rear"
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


def _summary_score_display(score: int | float | None) -> str:
    if score is None:
        return "\u2014"
    return f"{int(round(score))}/100"


def _wrap_chart_label(label: str, max_chars: int) -> str:
    """Wrap long chart labels so vector PDF text does not collide across rows."""
    normalized = " ".join(label.split())
    if len(normalized) <= max_chars:
        return normalized
    wrapped = textwrap.wrap(
        normalized,
        width=max_chars,
        break_long_words=False,
        break_on_hyphens=False,
    )
    return "\n".join(wrapped) if wrapped else normalized


def _label_line_count(label: str) -> int:
    return label.count("\n") + 1


def _normalized_comparison_label(label: str) -> str:
    return " ".join(label.lower().split())


def _comparison_role(row: CompRow) -> Literal["peer", "national", "reference"]:
    if row.role == "reference":
        return "reference"
    if row.role == "national":
        return "national"
    if row.role == "peer":
        return "peer"
    normalized = _normalized_comparison_label(row.label)
    if normalized in {"netherlands", "nederland", "national", "nationaal"}:
        return "national"
    return "peer"


def _comparison_color(
    role: Literal["address", "peer", "national", "reference"],
    address_score: int,
) -> str:
    if role == "address":
        return _severity_color(_score_severity(address_score))
    if role == "national":
        return C_COMPARISON_NATIONAL
    if role == "reference":
        return C_COMPARISON_REFERENCE
    return C_COMPARISON_PEER


def _comparison_segments(value: float) -> list[tuple[float, float]]:
    if value <= 0:
        return []
    segments: list[tuple[float, float]] = []
    cursor = 0.0
    while cursor < value:
        seg_w = min(COMPARISON_SEGMENT_WIDTH, value - cursor)
        segments.append((cursor, seg_w))
        cursor += COMPARISON_SEGMENT_WIDTH + COMPARISON_SEGMENT_GAP
    return segments


def build_risk_comparison_layout(
    category: str,
    address_score: int,
    comparisons: list[CompRow],
) -> ComparisonChartLayout:
    bar_rows: list[CompRow] = [
        CompRow(label="This address", value=address_score, role="comparison")
    ]

    for row in comparisons:
        if row.value is None:
            continue
        label = row.label.strip()
        if not label:
            continue
        if "address" in label.lower():
            continue
        bar_rows.append(CompRow(label=label, value=row.value, role=row.role))

    max_bar = max(float(row.value) for row in bar_rows if row.value is not None)
    max_x = max(100.0, max_bar) + 12.0
    wrapped_bar_labels = [
        _wrap_chart_label(row.label, 24 if idx > 0 else 22)
        for idx, row in enumerate(bar_rows)
    ]
    longest_label_chars = max(
        (
            len(line)
            for label in wrapped_bar_labels
            for line in label.splitlines()
        ),
        default=0,
    )
    label_space = max(30.0, min(76.0, 2.5 * longest_label_chars))
    value_x = max_x - 1.0

    row_units = [
        1.0 + max(0, _label_line_count(label) - 1) * 0.55
        for label in wrapped_bar_labels
    ]
    total_row_units = sum(row_units) or 1.0

    chart_h_mm = max(
        RISK_MIN_HEIGHT_MM,
        12.0 + total_row_units * (RISK_ROW_HEIGHT_MM + 1.5),
    )
    if len(bar_rows) <= 1:
        chart_h_mm = min(chart_h_mm, 22.0)

    row_centers: list[float] = []
    cursor = total_row_units
    for row_unit in row_units:
        center = cursor - row_unit / 2
        row_centers.append(center)
        cursor -= row_unit

    rows = tuple(
        ComparisonRowLayout(
            label=row.label,
            wrapped_label=wrapped_label,
            value=float(row.value) if row.value is not None else 0.0,
            role="address" if idx == 0 else _comparison_role(row),
            center=center,
            row_unit=row_unit,
            is_primary=idx == 0,
        )
        for idx, (row, wrapped_label, center, row_unit) in enumerate(
            zip(bar_rows, wrapped_bar_labels, row_centers, row_units, strict=True)
        )
    )

    return ComparisonChartLayout(
        category=category,
        rows=rows,
        chart_height_mm=chart_h_mm,
        label_space=label_space,
        max_x=max_x,
        value_x=value_x,
        total_row_units=total_row_units,
        y_min=-0.7,
        y_max=total_row_units + 0.8,
    )


def comparison_row_center_offset_mm(layout: ComparisonChartLayout, center: float) -> float:
    axis_fraction = (center - layout.y_min) / max(1e-9, layout.y_max - layout.y_min)
    figure_fraction = (
        COMPARISON_SUBPLOT_BOTTOM
        + axis_fraction * (COMPARISON_SUBPLOT_TOP - COMPARISON_SUBPLOT_BOTTOM)
    )
    return layout.chart_height_mm * (1.0 - figure_fraction)


def comparison_data_x_offset_mm(layout: ComparisonChartLayout, value: float) -> float:
    x_min = -layout.label_space
    axis_fraction = (value - x_min) / max(1e-9, layout.max_x - x_min)
    figure_fraction = (
        COMPARISON_SUBPLOT_LEFT
        + axis_fraction * (COMPARISON_SUBPLOT_RIGHT - COMPARISON_SUBPLOT_LEFT)
    )
    return CHART_WIDTH_MM * figure_fraction


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
    role: Literal["comparison", "reference", "peer", "national"] = "comparison"


@dataclass(frozen=True, slots=True)
class ComparisonRowLayout:
    label: str
    wrapped_label: str
    value: float
    role: Literal["address", "peer", "national", "reference"]
    center: float
    row_unit: float
    is_primary: bool

    @property
    def line_count(self) -> int:
        return _label_line_count(self.wrapped_label)


@dataclass(frozen=True, slots=True)
class ComparisonChartLayout:
    category: str
    rows: tuple[ComparisonRowLayout, ...]
    chart_height_mm: float
    label_space: float
    max_x: float
    value_x: float
    total_row_units: float
    y_min: float
    y_max: float


@dataclass(frozen=True, slots=True)
class RiskCell:
    """Cell data for risk summary grid rendering."""

    category: str
    score: int | None
    severity: str | None = None


@dataclass(frozen=True, slots=True)
class FacadeHeatmapRow:
    """Facade sunlight payload for the winter/summer heatmap."""

    orientation: str
    winter_hours: float
    summer_hours: float
    annual_average: float
    height_label: str = ""


@dataclass(frozen=True, slots=True)
class ShadowImage:
    """Input image payload for shadow panel rendering."""

    season: str
    image_b64: str
    time_label: str = "12:00"
    sun_azimuth: float | None = None
    sun_altitude: float | None = None
    target_bbox: tuple[float, float, float, float] | None = None


@dataclass(frozen=True, slots=True)
class SunlightMeta:
    """Render metadata used across shadow panels."""

    sun_positions: dict[str, tuple[float, float]] = field(default_factory=dict)
    target_bbox: tuple[float, float, float, float] = (0.36, 0.36, 0.28, 0.28)
    single_panel_note: str = (
        "Additional viewpoints require re-export after 3D computation"
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
    show_row_labels: bool = True,
    show_axis_labels: bool = True,
) -> bytes:
    """Render Scherer-style risk comparison chart as vector PDF bytes."""
    SchererTheme().apply()
    layout = build_risk_comparison_layout(
        category=category,
        address_score=address_score,
        comparisons=comparisons,
    )
    fig, ax = plt.subplots(
        figsize=(_mm_to_inch(CHART_WIDTH_MM), _mm_to_inch(layout.chart_height_mm)),
        dpi=CHART_DPI,
    )
    fig.patch.set_facecolor(C_BG)

    for threshold in COMPARISON_GUIDE_TICKS:
        ax.axvline(
            threshold,
            color=C_COMPARISON_GUIDE,
            linewidth=0.8,
            zorder=0,
        )

    for row in layout.rows:
        bar_height = min(0.68 if row.is_primary else 0.4, max(0.35, row.row_unit - 0.2))
        bar_color = _comparison_color(row.role, address_score)
        if row.role == "reference":
            for start, segment_w in _comparison_segments(row.value):
                ax.add_patch(
                    Rectangle(
                        (start, row.center - bar_height / 2),
                        segment_w,
                        bar_height,
                        facecolor=bar_color,
                        edgecolor="none",
                        linewidth=0,
                        zorder=3,
                    )
                )
        else:
            ax.barh(
                y=row.center,
                width=row.value,
                height=bar_height,
                color=bar_color,
                edgecolor="none",
            )
        if show_row_labels:
            ax.text(
                -layout.label_space + 1.0,
                row.center,
                row.wrapped_label,
                fontsize=TYPE_BODY_PT,
                fontweight=FONT_WEIGHT_HEADING if row.is_primary else FONT_WEIGHT_BODY,
                color=C_PRIMARY,
                va="center",
                ha="left",
                linespacing=1.15,
            )
        ax.text(
            layout.value_x,
            row.center,
            _score_display(row.value),
            fontsize=TYPE_BODY_PT,
            color=C_PRIMARY,
            va="center",
            ha="right",
        )

    ax.set_title(
        category,
        loc="left",
        fontsize=TYPE_HEADING_PT,
        color=C_PRIMARY,
        fontweight=FONT_WEIGHT_HEADING,
        pad=6,
    )
    ax.set_xlim(-layout.label_space, layout.max_x)
    ax.set_ylim(layout.y_min, layout.y_max)
    ax.set_yticks([])
    ax.set_xticks(list(COMPARISON_AXIS_TICKS))
    if show_axis_labels:
        ax.set_xticklabels([str(tick) for tick in COMPARISON_AXIS_TICKS])
    else:
        ax.set_xticklabels([])
    ax.tick_params(
        axis="x",
        length=0,
        pad=3,
        labelsize=TYPE_CAPTION_PT,
        labelcolor=C_MUTE_1,
        labelbottom=show_axis_labels,
    )
    ax.tick_params(axis="y", length=0)
    ax.spines["left"].set_visible(False)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.spines["bottom"].set_color(C_AXIS)
    ax.spines["bottom"].set_linewidth(0.4)
    fig.subplots_adjust(
        left=COMPARISON_SUBPLOT_LEFT,
        right=COMPARISON_SUBPLOT_RIGHT,
        top=COMPARISON_SUBPLOT_TOP,
        bottom=COMPARISON_SUBPLOT_BOTTOM,
    )

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

    grid_h_mm = risk_summary_grid_height_mm(len(cells), cols=cols)
    cell_w_mm = (CHART_WIDTH_MM - (cols - 1) * GRID_GAP_MM) / cols

    fig, ax = plt.subplots(
        figsize=(_mm_to_inch(CHART_WIDTH_MM), _mm_to_inch(grid_h_mm)),
        dpi=CHART_DPI,
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

        ax.add_patch(
            Rectangle(
                (x, y + 1.0),
                cell_w_mm,
                GRID_CELL_HEIGHT_MM - 2.0,
                facecolor=C_TILE_BG,
                edgecolor=C_AXIS,
                linewidth=0.8,
            )
        )

        ax.text(
            x + cell_w_mm / 2,
            y + 6.0,
            cell.category.upper(),
            fontsize=TYPE_GRID_LABEL_PT,
            color=C_REFERENCE,
            va="top",
            ha="center",
        )
        score_font_size = 18.0 if cols >= 5 else 20.0
        ax.text(
            x + cell_w_mm / 2,
            y + 20.0,
            _summary_score_display(cell.score),
            fontsize=score_font_size,
            fontweight=FONT_WEIGHT_DISPLAY,
            color=color,
            va="center",
            ha="center",
        )
        track_x = x + 4.0
        track_w = cell_w_mm - 8.0
        track_y = y + 24.5
        ax.add_patch(
            Rectangle(
                (track_x, track_y),
                track_w,
                2.8,
                facecolor=C_AXIS,
                edgecolor="none",
            )
        )
        for threshold in COMPARISON_GUIDE_TICKS:
            marker_x = track_x + track_w * threshold / 100.0
            ax.add_patch(
                Rectangle(
                    (marker_x - 0.18, track_y - 0.35),
                    0.36,
                    3.5,
                    facecolor=C_REFERENCE,
                    edgecolor="none",
                    alpha=0.55,
                )
            )
        # Keep the fill proportional while showing shared severity thresholds.
        if cell.score is not None:
            fill_w = track_w * max(0.0, min(float(cell.score), 100.0)) / 100.0
            ax.add_patch(
                Rectangle(
                    (track_x, track_y),
                    fill_w,
                    2.8,
                    facecolor=color,
                    edgecolor="none",
                )
            )
        ax.text(
            x + cell_w_mm / 2,
            y + 31.0,
            _severity_label(severity),
            fontsize=TYPE_BODY_PT,
            fontweight=FONT_WEIGHT_HEADING,
            color=color,
            va="center",
            ha="center",
        )

    fig.subplots_adjust(left=0.03, right=0.98, top=0.95, bottom=0.1)
    return _save_figure(fig, output_format=output_format)


def render_facade_heatmap(
    rows: list[FacadeHeatmapRow],
    *,
    is_nl: bool = False,
    output_format: OutputFormat = "pdf",
) -> bytes:
    """Render a winter/summer facade heatmap as vector PDF or PNG bytes."""
    if not rows:
        raise ValueError("rows must not be empty")

    SchererTheme().apply()

    duplicate_orientations = {
        key
        for key in {row.orientation.strip().lower() for row in rows}
        if sum(1 for row in rows if row.orientation.strip().lower() == key) > 1
    }
    display_rows = [
        (_facade_label(row, is_nl=is_nl, duplicate_orientations=duplicate_orientations), row)
        for row in rows
    ]

    longest_label_chars = max((len(label) for label, _row in display_rows), default=8)
    label_w = max(30.0, min(58.0, 2.35 * longest_label_chars))
    left_pad = 2.5
    right_pad = 2.5
    col_gap = 2.5
    cell_w = (CHART_WIDTH_MM - left_pad - right_pad - label_w - col_gap) / 2
    grid_x = left_pad + label_w
    grid_w = cell_w * 2 + col_gap
    grid_h = len(display_rows) * FACADE_HEATMAP_ROW_HEIGHT_MM
    legend_y = (
        FACADE_HEATMAP_TOP_PAD_MM
        + FACADE_HEATMAP_HEADER_HEIGHT_MM
        + grid_h
        + FACADE_HEATMAP_LEGEND_GAP_MM
    )
    legend_h = 3.8
    raw_max_hours = max(
        max(float(row.winter_hours), float(row.summer_hours))
        for _label, row in display_rows
    )
    scale_max_hours = raw_max_hours if raw_max_hours > 0 else 1.0
    max_hours_label = f"{raw_max_hours:.1f}".rstrip("0").rstrip(".")

    fig_h_mm = facade_heatmap_height_mm(len(display_rows))
    fig, ax = plt.subplots(
        figsize=(_mm_to_inch(CHART_WIDTH_MM), _mm_to_inch(fig_h_mm)),
        dpi=CHART_DPI,
    )
    fig.patch.set_facecolor(C_BG)
    ax.set_facecolor(C_BG)
    ax.set_xlim(0.0, CHART_WIDTH_MM)
    ax.set_ylim(fig_h_mm, 0.0)
    ax.axis("off")

    header_y = FACADE_HEATMAP_TOP_PAD_MM + FACADE_HEATMAP_HEADER_HEIGHT_MM / 2
    ax.text(
        left_pad,
        header_y,
        "Facade" if not is_nl else "Gevel",
        fontsize=TYPE_CAPTION_PT,
        color=C_REFERENCE,
        fontweight=FONT_WEIGHT_HEADING,
        va="center",
        ha="left",
    )
    for col_idx, column_label in enumerate(
        ("Winter", "Summer" if not is_nl else "Zomer"),
    ):
        col_x = grid_x + col_idx * (cell_w + col_gap) + cell_w / 2
        ax.text(
            col_x,
            header_y,
            column_label,
            fontsize=TYPE_CAPTION_PT,
            color=C_REFERENCE,
            fontweight=FONT_WEIGHT_HEADING,
            va="center",
            ha="center",
        )

    for row_idx, (label, row) in enumerate(display_rows):
        row_y = FACADE_HEATMAP_TOP_PAD_MM + FACADE_HEATMAP_HEADER_HEIGHT_MM + (
            row_idx * FACADE_HEATMAP_ROW_HEIGHT_MM
        )
        center_y = row_y + FACADE_HEATMAP_ROW_HEIGHT_MM / 2
        ax.text(
            left_pad,
            center_y,
            label,
            fontsize=TYPE_BODY_PT,
            color=C_PRIMARY,
            va="center",
            ha="left",
        )
        for col_idx, value in enumerate((row.winter_hours, row.summer_hours)):
            cell_x = grid_x + col_idx * (cell_w + col_gap)
            fill_hex = _facade_heatmap_fill_color(float(value), scale_max_hours)
            ax.add_patch(
                Rectangle(
                    (cell_x, row_y),
                    cell_w,
                    FACADE_HEATMAP_ROW_HEIGHT_MM,
                    facecolor=fill_hex,
                    edgecolor=C_AXIS,
                    linewidth=0.8,
                )
            )
            ax.text(
                cell_x + cell_w / 2,
                center_y,
                f"{float(value):.1f}h",
                fontsize=TYPE_BODY_PT,
                color=_facade_heatmap_text_color(fill_hex),
                fontweight=FONT_WEIGHT_HEADING,
                va="center",
                ha="center",
            )

    legend_segments = 48
    segment_w = grid_w / legend_segments
    for idx in range(legend_segments):
        fraction = idx / max(1, legend_segments - 1)
        ax.add_patch(
            Rectangle(
                (grid_x + idx * segment_w, legend_y),
                segment_w,
                legend_h,
                facecolor=_blend_hex(C_MUTE_2, C_ACCENT_DARK, fraction),
                edgecolor="none",
            )
        )
    ax.add_patch(
        Rectangle(
            (grid_x, legend_y),
            grid_w,
            legend_h,
            facecolor="none",
            edgecolor=C_AXIS,
            linewidth=0.8,
        )
    )
    ax.text(
        grid_x,
        legend_y - 1.0,
        "0h",
        fontsize=TYPE_CAPTION_PT,
        color=C_REFERENCE,
        va="bottom",
        ha="left",
    )
    ax.text(
        grid_x + grid_w,
        legend_y - 1.0,
        f"{max_hours_label}h",
        fontsize=TYPE_CAPTION_PT,
        color=C_REFERENCE,
        va="bottom",
        ha="right",
    )
    ax.text(
        grid_x + grid_w / 2,
        legend_y + legend_h + 2.5,
        "Direct-sun hours" if not is_nl else "Directe zonuren",
        fontsize=TYPE_CAPTION_PT,
        color=C_REFERENCE,
        va="bottom",
        ha="center",
    )

    fig.subplots_adjust(left=0.01, right=0.99, top=0.98, bottom=0.05)
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
    shadow_key: str,
    panel: ShadowImage,
    metadata: SunlightMeta,
) -> None:
    panel_key = _normalize_shadow_label(shadow_key)
    panel_label = SHADOW_LABELS.get(panel_key, shadow_key.title())
    if panel_key in VIEW_ORDER:
        panel_label = f"{panel_label} · Summer reference date · {panel.time_label}"
    ax.text(
        0.02,
        0.95,
        panel_label,
        transform=ax.transAxes,
        color=C_WHITE,
        fontsize=TYPE_BODY_PT,
        fontweight=600,
        va="top",
        ha="left",
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

    default_sun_key = "summer" if panel_key in VIEW_ORDER else panel_key
    default_sun = DEFAULT_SUN_POSITIONS.get(default_sun_key, (180.0, 35.0))
    azimuth, altitude = metadata.sun_positions.get(default_sun_key, default_sun)
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


def _shadow_legend_text() -> str:
    return (
        "Legend: teal outline = target building · shadow = no direct sun · "
        "Summer reference date (June 21) · 12:00 local · Source: 3DBAG / TU Delft + SunCalc"
    )


def render_shadow_panels(
    images: list[ShadowImage],
    metadata: SunlightMeta,
    output_format: OutputFormat = "pdf",
) -> bytes:
    """Render shadow analysis panels as vector PDF bytes."""
    SchererTheme().apply()
    decoded: list[tuple[str, ShadowImage, np.ndarray]] = []
    for panel in images:
        image_array = _decode_shadow_image(panel.image_b64)
        if image_array is not None:
            decoded.append((panel.season, panel, image_array))

    if not decoded:
        fig, ax = plt.subplots(
            figsize=(_mm_to_inch(SHADOW_WIDTH_MM), _mm_to_inch(SHADOW_SINGLE_HEIGHT_MM)),
            dpi=CHART_DPI,
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

    shadow_map: dict[str, tuple[ShadowImage, np.ndarray]] = {}
    for shadow_name, panel, image_array in decoded:
        key = _normalize_shadow_label(shadow_name)
        if key in SHADOW_ORDER and key not in shadow_map:
            shadow_map[key] = (panel, image_array)

    ordered_panels: list[tuple[str, ShadowImage, np.ndarray]] = []
    preferred_order = VIEW_ORDER if all(view in shadow_map for view in VIEW_ORDER) else SEASON_ORDER
    if all(item in shadow_map for item in preferred_order):
        for item in preferred_order:
            panel, image_array = shadow_map[item]
            ordered_panels.append((item, panel, image_array))
    else:
        for shadow_name, panel, image_array in decoded:
            ordered_panels.append((_normalize_shadow_label(shadow_name), panel, image_array))

    if len(ordered_panels) == 1:
        fig, ax = plt.subplots(
            figsize=(_mm_to_inch(SHADOW_WIDTH_MM), _mm_to_inch(SHADOW_SINGLE_HEIGHT_MM)),
            dpi=CHART_DPI,
        )
        fig.patch.set_facecolor(C_DARK_BG)
        shadow_key, panel, image_array = ordered_panels[0]
        ax.set_facecolor(C_DARK_BG)
        ax.imshow(image_array, interpolation="antialiased")
        _panel_annotation(ax, shadow_key, panel, metadata)
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
    fig_h_mm = SHADOW_PANEL_HEIGHT_MM + 16.0
    fig, axes = plt.subplots(
        1,
        panel_count,
        figsize=(_mm_to_inch(SHADOW_WIDTH_MM), _mm_to_inch(fig_h_mm)),
        dpi=CHART_DPI,
    )
    fig.patch.set_facecolor(C_DARK_BG)
    if panel_count == 1:
        axes = [axes]

    for axis, (shadow_key, panel, image_array) in zip(
        axes,
        ordered_panels[:panel_count],
        strict=True,
    ):
        axis.set_facecolor(C_DARK_BG)
        axis.imshow(image_array, interpolation="antialiased")
        _panel_annotation(axis, shadow_key, panel, metadata)
        axis.set_xticks([])
        axis.set_yticks([])
        for spine in axis.spines.values():
            spine.set_visible(False)

    fig.text(
        0.02,
        0.04,
        _shadow_legend_text(),
        color=C_WHITE,
        fontsize=TYPE_CAPTION_PT,
        ha="left",
        va="bottom",
        bbox={"facecolor": C_PRIMARY, "alpha": 0.9, "edgecolor": C_WHITE, "pad": 2.4},
    )
    fig.subplots_adjust(left=0.01, right=0.99, top=0.99, bottom=0.20, wspace=0.04)
    return _save_figure(fig, output_format=output_format)


def render_age_distribution(
    age_data: AgeProfile,
    output_format: OutputFormat = "pdf",
    *,
    is_nl: bool = False,
) -> bytes:
    """Render neighborhood age profile with national comparison bars."""
    SchererTheme().apply()

    labels = ["0\u201324", "25\u201364", "65+"]
    raw_values = [age_data.age_0_24, age_data.age_25_64, age_data.age_65_plus]
    national_values = [NL_AGE_0_24, NL_AGE_25_64, NL_AGE_65_PLUS]
    available_values = [float(v) for v in raw_values if v is not None]
    max_x = max(100.0, max([*available_values, *national_values], default=0.0) + 10.0)
    label_space = 16.0

    fig, ax = plt.subplots(
        figsize=(_mm_to_inch(CHART_WIDTH_MM), _mm_to_inch(AGE_CHART_HEIGHT_MM)),
        dpi=CHART_DPI,
    )
    fig.patch.set_facecolor(C_BG)

    y_positions = np.arange(len(labels))[::-1]
    ax.barh(y_positions + 0.16, national_values, height=0.24, color=C_MUTE_2, edgecolor="none")
    for raw_value, y in zip(raw_values, y_positions, strict=True):
        if raw_value is None:
            continue
        ax.barh(
            y - 0.16,
            float(raw_value),
            height=0.24,
            color=C_ACCENT_TEXT,
            edgecolor="none",
        )

    for label, raw_value, y in zip(labels, raw_values, y_positions, strict=True):
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
            1.2 if raw_value is None else min(max_x - 1.0, float(raw_value) + 1.2),
            y - 0.16,
            endpoint,
            fontsize=TYPE_BODY_PT,
            color=C_PRIMARY,
            va="center",
            ha="left",
        )

    legend_local = "Deze buurt" if is_nl else "This neighborhood"
    legend_national = "Nederland" if is_nl else "Netherlands"
    ax.text(
        -label_space + 0.6,
        len(labels) - 0.15,
        legend_local,
        fontsize=TYPE_CAPTION_PT,
        color=C_ACCENT_DARK,
        ha="left",
    )
    ax.text(
        28.0,
        len(labels) - 0.15,
        legend_national,
        fontsize=TYPE_CAPTION_PT,
        color=C_REFERENCE,
        ha="left",
    )

    ax.set_xlim(-label_space, max_x)
    ax.set_ylim(-0.8, len(labels) - 0.05)
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
        dpi=CHART_DPI,
    )
    fig.patch.set_facecolor(C_BG)

    # Shared score bands need enough opacity to remain visible in print.
    ax.axvspan(0, 20, color=C_SEV_CRIT, alpha=0.14)
    ax.axvspan(20, 40, color=C_SEV_POOR, alpha=0.14)
    ax.axvspan(40, 70, color=C_SEV_MOD, alpha=0.14)
    ax.axvspan(70, 100, color=C_SEV_GOOD, alpha=0.14)

    y_livability = 1.0
    y_crime = 0.35

    if livability.score is not None:
        livability_score = float(livability.score)
        livability_color = _severity_color(_score_severity(int(livability.score)))
        # Solid bar instead of lollipop dot
        ax.barh(
            y_livability,
            livability_score,
            height=0.28,
            color=livability_color,
            edgecolor="none",
            zorder=3,
        )
        ax.text(
            livability_score + 1.2,
            y_livability,
            _summary_score_display(livability.score),
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
        crime_color = _severity_color(_score_severity(int(crime.score)))
        ax.barh(
            y_crime,
            crime_score,
            height=0.28,
            color=crime_color,
            edgecolor="none",
            zorder=3,
        )
        ax.text(
            crime_score + 1.2,
            y_crime,
            _summary_score_display(crime.score),
            fontsize=TYPE_BODY_PT,
            color=C_PRIMARY,
            va="center",
            ha="left",
        )
        ax.text(
            -2.0,
            y_crime,
            crime.label,
            fontsize=TYPE_BODY_PT,
            color=C_PRIMARY,
            va="center",
            ha="right",
        )

    ax.set_xlim(-12, 108)
    ax.set_ylim(0.05, 1.3)
    ax.set_yticks([])
    ax.set_xticks(list(COMPARISON_AXIS_TICKS))
    ax.tick_params(axis="x", length=0, colors=C_REFERENCE, labelsize=TYPE_CAPTION_PT)
    ax.tick_params(axis="y", length=0)
    ax.spines["left"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.spines["top"].set_visible(False)
    ax.spines["bottom"].set_color(C_AXIS)
    ax.spines["bottom"].set_linewidth(0.4)
    fig.subplots_adjust(left=0.12, right=0.94, top=0.9, bottom=0.24)
    return _save_figure(fig, output_format=output_format)


__all__ = [
    "FACADE_HEATMAP_HEADER_HEIGHT_MM",
    "FACADE_HEATMAP_ROW_HEIGHT_MM",
    "FACADE_HEATMAP_LEGEND_HEIGHT_MM",
    "CHART_DPI",
    "AgeProfile",
    "AGE_CHART_HEIGHT_MM",
    "CHART_WIDTH_MM",
    "COMPARISON_AXIS_TICKS",
    "COMPARISON_GUIDE_TICKS",
    "CompRow",
    "ComparisonChartLayout",
    "ComparisonRowLayout",
    "CrimeData",
    "C_COMPARISON_NATIONAL",
    "C_COMPARISON_PEER",
    "C_COMPARISON_REFERENCE",
    "FacadeHeatmapRow",
    "FONT_WEIGHT_BODY",
    "FONT_WEIGHT_CAPTION",
    "FONT_WEIGHT_DISPLAY",
    "FONT_WEIGHT_HEADING",
    "LIVABILITY_HEIGHT_MM",
    "LivabilityData",
    "OutputFormat",
    "RiskCell",
    "SCHERER_RCPARAMS",
    "SchererTheme",
    "ShadowImage",
    "SunlightMeta",
    "facade_heatmap_height_mm",
    "build_risk_comparison_layout",
    "comparison_data_x_offset_mm",
    "comparison_row_center_offset_mm",
    "render_age_distribution",
    "render_facade_heatmap",
    "render_livability_score",
    "render_risk_comparison",
    "render_risk_summary_grid",
    "render_shadow_panels",
    "risk_summary_grid_height_mm",
]
