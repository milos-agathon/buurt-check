"""PDF export service — Polar Frost branded Quick Brief and Full Dossier."""

import base64
import io
import logging
from datetime import date, datetime, timezone
from pathlib import Path

from fpdf import FPDF

from app.models.neighborhood import AgeProfile, NeighborhoodStats, UrbanizationLevel
from app.models.property_warnings import PropertyWarningsResponse
from app.models.report import ProvenanceData
from app.models.risk import (
    ComparisonPattern,
    RiskCardsResponse,
    RiskComparisonsResponse,
    ViewingQuestionsResponse,
)
from app.models.tier_b import TierBResponse
from app.services.scoring import severity_from_score

logger = logging.getLogger(__name__)

# --- Font paths ---
_FONTS_DIR = Path(__file__).parent.parent / "assets" / "fonts"

# --- Polar Frost color palette (RGB tuples) ---
TEAL = (46, 196, 182)  # #2EC4B6 — Arctic Teal accent
SLATE = (28, 45, 63)  # #1C2D3F — Polar Slate primary text
MUTED = (138, 155, 176)  # #8A9BB0 — muted text / unavailable
BORDER = (226, 231, 237)  # #E2E7ED — borders, dividers, score track
WHITE = (255, 255, 255)
AMBER_WARN = (234, 179, 8)  # #EAB308 — amber for warnings
SECONDARY = (99, 120, 146)  # #637892 — --color-text-secondary (WCAG AA)
GRIDLINE = (240, 242, 245)  # Very light gray for chart gridlines

SEVERITY_COLORS: dict[str, tuple[int, int, int]] = {
    "good": (34, 197, 94),  # #22C55E
    "moderate": (234, 179, 8),  # #EAB308
    "poor": (239, 68, 68),  # #EF4444
    "critical": (185, 28, 28),  # #B91C1C
}

def _severity_for_score(score: int | None) -> str:
    if score is None:
        return "unavailable"
    return severity_from_score(score).value


def _severity_color(score: int | None) -> tuple[int, int, int]:
    sev = _severity_for_score(score)
    return SEVERITY_COLORS.get(sev, MUTED)


def _severity_label(score: int | None, is_nl: bool = False) -> str:
    if score is None:
        return "N.v.t." if is_nl else "N/A"
    if score >= 70:
        return "Goed" if is_nl else "Good"
    if score >= 40:
        return "Matig" if is_nl else "Moderate"
    if score >= 20:
        return "Slecht" if is_nl else "Poor"
    return "Kritiek" if is_nl else "Critical"


# ---------------------------------------------------------------------------
# BuurtCheckPDF — Polar Frost branded PDF subclass
# ---------------------------------------------------------------------------


class BuurtCheckPDF(FPDF):
    """Custom PDF with Polar Frost branding, Satoshi font, and drawing primitives."""

    section_title: str = ""

    def __init__(self, language: str = "en"):
        super().__init__()
        self.language = language
        self.is_nl = language == "nl"
        self._register_fonts()
        self.set_auto_page_break(auto=True, margin=20)

    def _register_fonts(self) -> None:
        """Register Satoshi font weights for Unicode support."""
        for style, filename in [
            ("", "Satoshi-Regular.ttf"),
            ("B", "Satoshi-Bold.ttf"),
            ("I", "Satoshi-Regular.ttf"),  # italic fallback to regular
        ]:
            path = _FONTS_DIR / filename
            if path.exists():
                self.add_font("Satoshi", style, str(path))
        black_path = _FONTS_DIR / "Satoshi-Black.ttf"
        if black_path.exists():
            self.add_font("SatoshiBlack", "", str(black_path))
        medium_path = _FONTS_DIR / "Satoshi-Medium.ttf"
        if medium_path.exists():
            self.add_font("SatoshiMedium", "", str(medium_path))

    def header(self) -> None:
        """Teal band + brand name + section title on every page."""
        self.set_fill_color(*TEAL)
        self.rect(0, 0, self.w, 6, "F")

        self.set_y(8)
        self.set_font("SatoshiBlack", "", 9)
        self.set_text_color(*SLATE)
        self.cell(0, 5, "buurt-check", new_x="RIGHT")

        if self.section_title:
            self.set_font("Satoshi", "", 9)
            self.set_text_color(*MUTED)
            self.set_x(self.w - self.r_margin - 60)
            self.cell(60, 5, self.section_title, align="R")

        self.set_draw_color(*BORDER)
        self.set_line_width(0.1)
        self.line(self.l_margin, 15, self.w - self.r_margin, 15)

        self.set_y(18)
        self.set_text_color(*SLATE)

    def footer(self) -> None:
        """Brand + disclaimer + page number."""
        self.set_y(-15)
        self.set_draw_color(*BORDER)
        self.set_line_width(0.1)
        self.line(self.l_margin, self.get_y(), self.w - self.r_margin, self.get_y())

        self.set_y(-12)
        self.set_font("Satoshi", "", 7)
        self.set_text_color(*MUTED)

        self.cell(30, 4, "buurt-check")
        disclaimer = (
            "Data is indicatief. Verifieer op locatie."
            if self.is_nl
            else "Data is indicative. Verify on-site."
        )
        self.cell(0, 4, disclaimer, align="C")
        self.cell(30, 4, f"p. {self.page_no()}", align="R", new_x="LMARGIN")
        self.set_text_color(*SLATE)

    # --- Drawing primitives ---

    def draw_score_bar(
        self, x: float, y: float, width: float, score: int | None, height: float = 1.0
    ) -> None:
        """Draw horizontal score bar: gray track + colored fill proportional to score."""
        self.set_fill_color(*BORDER)
        self.rect(x, y, width, height, "F")
        if score is not None and score > 0:
            fill_w = width * min(score, 100) / 100
            self.set_fill_color(*_severity_color(score))
            self.rect(x, y, fill_w, height, "F")

    def draw_checkbox(self, x: float, y: float, size: float = 3.0) -> None:
        """Draw an empty checkbox square."""
        self.set_draw_color(*SLATE)
        self.set_line_width(0.3)
        self.rect(x, y, size, size, "D")
        self.set_line_width(0.1)

    def draw_comparison_chart(
        self,
        x: float,
        y: float,
        width: float,
        rows: list[tuple[str, int, tuple[int, int, int], bool]],
        chart_title: str = "",
        show_legend: bool = False,
        is_nl: bool = True,
    ) -> float:
        """Draw horizontal comparison bars with axis, gridlines, title, legend.

        Each row: (label, score_value, fill_color_rgb, is_dashed).
        Returns y position after the chart (including axis labels and legend).
        """
        label_w = 40
        score_w = 15
        bar_w = width - label_w - score_w - 4
        bar_h = 3.0
        row_h = 7.0
        bar_x = x + label_w + 2
        cur_y = y

        # --- Chart title ---
        if chart_title:
            self.set_font("SatoshiMedium", "", 8)
            self.set_text_color(*SLATE)
            self.set_xy(x, cur_y)
            self.cell(width, 5, chart_title)
            cur_y += 5

        # --- Gridlines (behind bars) at 25%, 50%, 75% ---
        bars_top = cur_y
        bars_bottom = cur_y + len(rows) * row_h
        self.set_draw_color(*GRIDLINE)
        self.set_line_width(0.15)
        for pct in (25, 50, 75):
            gx = bar_x + bar_w * pct / 100
            self.line(gx, bars_top, gx, bars_bottom)
        self.set_line_width(0.1)

        # --- Data rows ---
        for i, (label, value, color, dashed) in enumerate(rows):
            ry = cur_y + i * row_h

            self.set_font("Satoshi", "", 8)
            self.set_text_color(*SLATE)
            self.set_xy(x, ry)
            self.cell(label_w, row_h, label)

            bar_y = ry + (row_h - bar_h) / 2
            self.set_fill_color(*BORDER)
            self.rect(bar_x, bar_y, bar_w, bar_h, "F")

            fill_w = bar_w * min(value, 100) / 100
            if dashed:
                self.set_draw_color(*color)
                self.set_line_width(bar_h)
                dash_len = 1.5
                gap_len = 1.0
                cx = bar_x
                while cx < bar_x + fill_w:
                    end = min(cx + dash_len, bar_x + fill_w)
                    self.line(cx, bar_y + bar_h / 2, end, bar_y + bar_h / 2)
                    cx = end + gap_len
                self.set_line_width(0.1)
            else:
                self.set_fill_color(*color)
                self.rect(bar_x, bar_y, fill_w, bar_h, "F")

            self.set_font("Satoshi", "B", 8)
            self.set_xy(x + width - score_w, ry)
            self.cell(score_w, row_h, str(value), align="R")

        # --- Axis labels ("0" and "100") below bars ---
        axis_y = bars_bottom + 0.5
        self.set_font("Satoshi", "", 6)
        self.set_text_color(*MUTED)
        self.set_xy(bar_x, axis_y)
        self.cell(10, 3, "0")
        self.set_xy(bar_x + bar_w - 10, axis_y)
        self.cell(10, 3, "100", align="R")
        cur_y = axis_y + 3.5

        # --- Legend (first chart only) ---
        if show_legend:
            legend_y = cur_y + 1
            lx = x
            swatch_w = 5
            swatch_h = 2.0
            gap = 2

            self.set_font("Satoshi", "", 6)
            self.set_text_color(*MUTED)

            # Teal swatch — "Dit adres" / "This address"
            self.set_fill_color(*TEAL)
            self.rect(lx, legend_y + 0.5, swatch_w, swatch_h, "F")
            lx += swatch_w + 1
            label_text = "Dit adres" if is_nl else "This address"
            self.set_xy(lx, legend_y)
            self.cell(20, 3, label_text)
            lx += 20 + gap

            # Gray swatch — "Vergelijkingswaarde" / "Comparison"
            self.set_fill_color(*MUTED)
            self.rect(lx, legend_y + 0.5, swatch_w, swatch_h, "F")
            lx += swatch_w + 1
            label_text = "Vergelijkingswaarde" if is_nl else "Comparison"
            self.set_xy(lx, legend_y)
            self.cell(28, 3, label_text)
            lx += 28 + gap

            # Dashed swatch — "Richtlijn" / "Benchmark"
            self.set_draw_color(*AMBER_WARN)
            self.set_line_width(swatch_h)
            dash_len = 1.2
            dash_gap = 0.8
            dx = lx
            while dx < lx + swatch_w:
                end = min(dx + dash_len, lx + swatch_w)
                self.line(dx, legend_y + 0.5 + swatch_h / 2, end, legend_y + 0.5 + swatch_h / 2)
                dx = end + dash_gap
            self.set_line_width(0.1)
            lx += swatch_w + 1
            label_text = "Richtlijn" if is_nl else "Benchmark"
            self.set_xy(lx, legend_y)
            self.cell(20, 3, label_text)

            cur_y = legend_y + 4

        self.set_text_color(*SLATE)
        return cur_y

    def draw_risk_grid(
        self,
        x: float,
        y: float,
        width: float,
        cells: list[tuple[str, int | None, str]],
        cols: int = 2,
    ) -> float:
        """Draw 2x2 (or Nx2) risk summary grid. Returns y position after grid."""
        gap = 4
        cell_w = (width - gap * (cols - 1)) / cols
        cell_h = 28
        rows_needed = (len(cells) + cols - 1) // cols

        for i, (cat_label, score, sev_label) in enumerate(cells):
            col = i % cols
            row = i // cols
            cx = x + col * (cell_w + gap)
            cy = y + row * (cell_h + gap)

            self.set_font("SatoshiMedium", "", 7)
            self.set_text_color(*MUTED)
            self.set_xy(cx, cy)
            self.cell(cell_w, 4, cat_label.upper(), align="C")

            color = _severity_color(score)
            self.set_font("SatoshiBlack", "", 24)
            self.set_text_color(*color)
            self.set_xy(cx, cy + 4)
            score_text = str(score) if score is not None else "\u2014"
            self.cell(cell_w, 10, score_text, align="C")

            bar_y = cy + 15
            bar_margin = cell_w * 0.1
            self.draw_score_bar(cx + bar_margin, bar_y, cell_w - 2 * bar_margin, score)

            self.set_font("Satoshi", "", 8)
            self.set_text_color(*color)
            self.set_xy(cx, cy + 18)
            self.cell(cell_w, 5, sev_label, align="C")

        self.set_text_color(*SLATE)
        return y + rows_needed * (cell_h + gap)

    def draw_age_bars(
        self, x: float, y: float, width: float, age_data: AgeProfile
    ) -> float:
        """Draw age distribution horizontal bars. Returns y after bars."""
        bands = [
            ("0\u201324", age_data.age_0_24),
            ("25\u201364", age_data.age_25_64),
            ("65+", age_data.age_65_plus),
        ]
        label_w = 20
        pct_w = 18
        bar_w = width - label_w - pct_w - 4
        bar_h = 3.0
        row_h = 7.0

        for i, (band_label, pct) in enumerate(bands):
            ry = y + i * row_h

            self.set_font("Satoshi", "", 9)
            self.set_text_color(*SLATE)
            self.set_xy(x, ry)
            self.cell(label_w, row_h, band_label)

            bar_x = x + label_w + 2
            bar_y = ry + (row_h - bar_h) / 2
            self.set_fill_color(*BORDER)
            self.rect(bar_x, bar_y, bar_w, bar_h, "F")

            if pct is not None and pct > 0:
                fill_w = bar_w * min(pct, 100) / 100
                self.set_fill_color(*TEAL)
                self.rect(bar_x, bar_y, fill_w, bar_h, "F")

            self.set_font("Satoshi", "B", 9)
            self.set_xy(x + width - pct_w, ry)
            pct_text = f"{pct:.0f}%" if pct is not None else "\u2014"
            self.cell(pct_w, row_h, pct_text, align="R")

        self.set_text_color(*SLATE)
        return y + len(bands) * row_h

    def draw_section_label(self, text: str) -> None:
        """Draw an uppercase section label."""
        self.set_font("SatoshiMedium", "", 8)
        self.set_text_color(*MUTED)
        self.cell(0, 5, text.upper(), new_x="LMARGIN", new_y="NEXT")
        self.set_text_color(*SLATE)

    def draw_divider(self, style: str = "light") -> None:
        """Draw a horizontal divider line."""
        self.ln(2)
        self.set_draw_color(*BORDER)
        width = 0.1 if style == "light" else 0.3
        self.set_line_width(width)
        y = self.get_y()
        self.line(self.l_margin, y, self.w - self.r_margin, y)
        self.ln(3)
        self.set_line_width(0.1)

    def draw_indicator_row(self, label: str, value: str) -> None:
        """Draw a two-column indicator row (label left, value right)."""
        self.set_font("Satoshi", "", 9)
        self.set_text_color(*SLATE)
        w = self.w - self.l_margin - self.r_margin
        self.cell(w * 0.6, 6, label)
        self.set_font("Satoshi", "B", 9)
        self.cell(w * 0.4, 6, value, align="R", new_x="LMARGIN", new_y="NEXT")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _build_risk_cells(
    risks: RiskCardsResponse | None, sunlight_score: int | None, is_nl: bool
) -> list[tuple[str, int | None, str]]:
    """Build cell data for risk grid. Always returns exactly 4 cells."""
    cells: list[tuple[str, int | None, str]] = []

    categories = [
        ("noise", "Noise", "Geluid"),
        ("air_quality", "Air", "Lucht"),
        ("climate_stress", "Climate", "Klimaat"),
    ]

    for cat_key, cat_name_en, cat_name_nl in categories:
        if risks:
            card = getattr(risks, cat_key)
            cells.append((
                cat_name_nl if is_nl else cat_name_en,
                card.score,
                _severity_label(card.score, is_nl),
            ))
        else:
            # Always produce 4 cells even when risks unavailable (Finding 6)
            cells.append((
                cat_name_nl if is_nl else cat_name_en,
                None,
                _severity_label(None, is_nl),
            ))

    cells.append((
        "Zonlicht" if is_nl else "Sunlight",
        sunlight_score,
        _severity_label(sunlight_score, is_nl),
    ))
    return cells


def _draw_branded_questions(
    pdf: BuurtCheckPDF,
    viewing_questions: ViewingQuestionsResponse | None,
    is_nl: bool,
    max_questions: int | None,
) -> bool:
    """Draw viewing questions with severity-colored borders and drawn checkboxes.

    Returns True if questions were clipped due to max_questions limit.
    """
    if not viewing_questions or not viewing_questions.categories:
        return False

    total_questions = sum(len(c.questions) for c in viewing_questions.categories)

    pdf.set_font("Satoshi", "B", 11)
    pdf.set_text_color(*SLATE)
    header = "Vragen voor de bezichtiging" if is_nl else "Questions for your viewing"
    pdf.cell(0, 7, header, new_x="LMARGIN", new_y="NEXT")
    pdf.ln(1)

    count = 0
    for category in viewing_questions.categories:
        if max_questions is not None and count >= max_questions:
            break

        sev_color = SEVERITY_COLORS.get(category.severity, MUTED)

        cy = pdf.get_y()
        pdf.set_fill_color(*sev_color)
        pdf.rect(pdf.l_margin, cy, 1.5, 5, "F")

        pdf.set_x(pdf.l_margin + 4)
        pdf.set_font("SatoshiMedium", "", 8)
        pdf.set_text_color(*sev_color)
        name = category.name_nl if is_nl else category.name
        pdf.cell(0, 5, name.upper(), new_x="LMARGIN", new_y="NEXT")

        pdf.set_text_color(*SLATE)
        pdf.set_font("Satoshi", "", 9)

        for question in category.questions:
            if max_questions is not None and count >= max_questions:
                break
            text = question.text_nl if is_nl else question.text_en
            qx = pdf.l_margin + 5
            qy = pdf.get_y()
            pdf.draw_checkbox(qx, qy + 0.5)
            pdf.set_xy(qx + 5, qy)
            pdf.multi_cell(
                pdf.w - pdf.r_margin - qx - 5, 5, text,
                new_x="LMARGIN", new_y="NEXT",
            )
            count += 1
        pdf.ln(1)

    return max_questions is not None and count < total_questions


def _draw_shadow_image(pdf: BuurtCheckPDF, shadow_image_b64: str | None, is_nl: bool) -> None:
    """Embed a shadow snapshot image if available."""
    if not shadow_image_b64:
        return
    try:
        image_data = base64.b64decode(shadow_image_b64)
        pdf.set_draw_color(*BORDER)
        pdf.set_line_width(0.2)
        img_y = pdf.get_y()
        pdf.image(io.BytesIO(image_data), x=pdf.l_margin, w=170, h=0)
        img_h = pdf.get_y() - img_y
        pdf.rect(pdf.l_margin, img_y, 170, img_h, "D")
        pdf.set_font("Satoshi", "I", 7)
        pdf.set_text_color(*MUTED)
        caption = "Winterzonnewende, 12:00" if is_nl else "Winter solstice, 12:00"
        pdf.cell(0, 4, caption, new_x="LMARGIN", new_y="NEXT")
        pdf.set_text_color(*SLATE)
        pdf.ln(2)
    except Exception:
        logger.warning("Failed to embed shadow snapshot in PDF")


def _draw_address_block(
    pdf: BuurtCheckPDF,
    address: str,
    building_year: int | None,
    building_use: str | None,
    floor_area: int | None,
    is_nl: bool,
    font_size: int = 16,
) -> None:
    """Draw address + building facts."""
    pdf.set_font("SatoshiBlack", "", font_size)
    pdf.set_text_color(*SLATE)
    pdf.multi_cell(0, 7, address, new_x="LMARGIN", new_y="NEXT")

    facts_parts: list[str] = []
    if building_year:
        facts_parts.append(f"{'Bouwjaar' if is_nl else 'Built'} {building_year}")
    if building_use:
        facts_parts.append(building_use)
    if floor_area:
        facts_parts.append(f"{floor_area} m\u00b2")
    if facts_parts:
        pdf.set_font("Satoshi", "", 9)
        pdf.set_text_color(*MUTED)
        pdf.cell(0, 5, " \u00b7 ".join(facts_parts), new_x="LMARGIN", new_y="NEXT")
        pdf.set_text_color(*SLATE)
    pdf.ln(3)


# ---------------------------------------------------------------------------
# Quick Brief (1 page)
# ---------------------------------------------------------------------------


def generate_quick_brief(
    address: str,
    building_year: int | None,
    building_use: str | None,
    risks: RiskCardsResponse | None,
    sunlight_score: int | None,
    viewing_questions: ViewingQuestionsResponse | None,
    shadow_image_b64: str | None = None,
    language: str = "en",
    floor_area: int | None = None,
) -> bytes:
    """Generate a 1-page Quick Brief PDF with Polar Frost branding."""
    is_nl = language == "nl"
    pdf = BuurtCheckPDF(language=language)
    pdf.section_title = "BEZICHTIGINGSBRIEFING" if is_nl else "VIEWING BRIEF"
    pdf.add_page()

    _draw_address_block(pdf, address, building_year, building_use, floor_area, is_nl)
    _draw_shadow_image(pdf, shadow_image_b64, is_nl)

    # Risk Assessment 2x2 grid
    pdf.draw_section_label("Risicobeoordeling" if is_nl else "Risk Assessment")
    pdf.ln(1)
    cells = _build_risk_cells(risks, sunlight_score, is_nl)
    grid_end_y = pdf.draw_risk_grid(
        x=pdf.l_margin, y=pdf.get_y(),
        width=pdf.w - pdf.l_margin - pdf.r_margin,
        cells=cells,
    )
    pdf.set_y(grid_end_y + 2)

    # Dynamically limit questions to fit on 1 page.
    # Each question ~7mm, header ~10mm. Available = page bottom margin minus current Y.
    remaining_mm = (pdf.h - 20) - pdf.get_y() - 10  # 20mm footer margin, 10mm header
    max_q = max(int(remaining_mm / 7), 3)  # At least 3 questions
    was_clipped = _draw_branded_questions(
        pdf, viewing_questions, is_nl, max_questions=min(max_q, 8),
    )

    if was_clipped:
        pdf.set_font("Satoshi", "I", 7)
        pdf.set_text_color(*MUTED)
        note = (
            "Zie het Volledige Dossier voor de complete checklist."
            if is_nl
            else "See the Full Dossier for the complete checklist."
        )
        pdf.cell(0, 5, note, new_x="LMARGIN", new_y="NEXT")

    return bytes(pdf.output())


# ---------------------------------------------------------------------------
# Full Dossier (5+ pages)
# ---------------------------------------------------------------------------


def generate_full_dossier(
    address: str,
    building_year: int | None,
    building_use: str | None,
    risks: RiskCardsResponse | None,
    sunlight_score: int | None,
    viewing_questions: ViewingQuestionsResponse | None,
    shadow_image_b64: str | None = None,
    language: str = "en",
    floor_area: int | None = None,
    neighborhood_stats: NeighborhoodStats | None = None,
    tier_b: TierBResponse | None = None,
    risk_comparisons: RiskComparisonsResponse | None = None,
    property_warnings_data: PropertyWarningsResponse | None = None,
    provenance: ProvenanceData | None = None,
) -> bytes:
    """Generate 5+ page Full Dossier with Polar Frost branding."""
    is_nl = language == "nl"
    pdf = BuurtCheckPDF(language=language)

    # Page 1: Cover + Summary
    pdf.section_title = "VOLLEDIG DOSSIER" if is_nl else "PROPERTY INTELLIGENCE DOSSIER"
    pdf.add_page()
    _draw_cover_page(
        pdf, address, building_year, building_use, floor_area,
        risks, sunlight_score, shadow_image_b64, is_nl,
    )

    # Page 2: Risk Details
    pdf.section_title = "RISICODETAILS" if is_nl else "RISK DETAILS"
    pdf.add_page()
    _draw_risk_details_page(pdf, address, risks, sunlight_score, risk_comparisons, is_nl)

    # Page 3: Neighborhood Intelligence
    pdf.section_title = "BUURT" if is_nl else "NEIGHBORHOOD"
    pdf.add_page()
    _draw_neighborhood_page(pdf, neighborhood_stats, tier_b, is_nl)

    # Page 4: Premium Property Checks
    pdf.section_title = "EXTRA CONTROLES" if is_nl else "ADDITIONAL CHECKS"
    pdf.add_page()
    _draw_property_checks_page(
        pdf=pdf,
        risks=risks,
        sunlight_score=sunlight_score,
        shadow_image_b64=shadow_image_b64,
        property_warnings=property_warnings_data,
        is_nl=is_nl,
    )

    # Page 5: Viewing Checklist
    pdf.section_title = "BEZICHTIGINGSCHECKLIST" if is_nl else "VIEWING CHECKLIST"
    pdf.add_page()
    _draw_checklist_page(pdf, address, risks, sunlight_score, viewing_questions, is_nl)

    # Page 6: Methodology + Notes
    pdf.section_title = "METHODOLOGIE" if is_nl else "METHODOLOGY"
    pdf.add_page()
    _draw_methodology_page(pdf, is_nl, provenance=provenance)

    return bytes(pdf.output())


# ---------------------------------------------------------------------------
# Full Dossier page drawing functions
# ---------------------------------------------------------------------------


def _draw_cover_page(
    pdf: BuurtCheckPDF,
    address: str,
    building_year: int | None,
    building_use: str | None,
    floor_area: int | None,
    risks: RiskCardsResponse | None,
    sunlight_score: int | None,
    shadow_image_b64: str | None,
    is_nl: bool,
) -> None:
    """Page 1: cover with address hero, shadow image, risk summary strip."""
    pdf.ln(4)

    _draw_address_block(pdf, address, building_year, building_use, floor_area, is_nl, font_size=20)
    _draw_shadow_image(pdf, shadow_image_b64, is_nl)

    # Risk summary strip (4-column)
    pdf.draw_section_label("Risico-overzicht" if is_nl else "Risk Summary")
    pdf.ln(1)
    cells = _build_risk_cells(risks, sunlight_score, is_nl)
    grid_end_y = pdf.draw_risk_grid(
        x=pdf.l_margin, y=pdf.get_y(),
        width=pdf.w - pdf.l_margin - pdf.r_margin,
        cells=cells, cols=4,
    )
    pdf.set_y(grid_end_y + 4)

    # Prepared date
    pdf.set_font("Satoshi", "", 9)
    pdf.set_text_color(*MUTED)
    today = date.today()
    prepared = today.strftime("Opgesteld: %d %B %Y" if is_nl else "Prepared: %d %B %Y")
    pdf.cell(0, 5, prepared, new_x="LMARGIN", new_y="NEXT")
    pdf.set_text_color(*SLATE)


def _draw_risk_details_page(
    pdf: BuurtCheckPDF,
    address: str,
    risks: RiskCardsResponse | None,
    sunlight_score: int | None,
    comparisons: RiskComparisonsResponse | None,
    is_nl: bool,
) -> None:
    """Page 2: detailed risk breakdown with comparison charts."""
    # Address context for standalone readability (Finding 9)
    pdf.set_font("Satoshi", "B", 10)
    pdf.set_text_color(*MUTED)
    pdf.cell(0, 5, address, new_x="LMARGIN", new_y="NEXT")
    pdf.set_text_color(*SLATE)
    pdf.ln(2)

    categories = _build_risk_detail_data(risks, sunlight_score, comparisons, is_nl)
    first_chart_drawn = False

    for cat_name, score, summary, source_text, comp_rows in categories:
        color = _severity_color(score)

        # Left teal accent + category name + score
        cy = pdf.get_y()
        pdf.set_fill_color(*TEAL)
        pdf.rect(pdf.l_margin, cy, 1.5, 8, "F")

        pdf.set_x(pdf.l_margin + 4)
        pdf.set_font("Satoshi", "B", 14)
        pdf.set_text_color(*SLATE)
        pdf.cell(100, 8, cat_name)

        pdf.set_font("SatoshiBlack", "", 14)
        pdf.set_text_color(*color)
        score_text = str(score) if score is not None else "\u2014"
        pdf.cell(0, 8, score_text, align="R", new_x="LMARGIN", new_y="NEXT")

        # Score bar
        bar_w = pdf.w - pdf.l_margin - pdf.r_margin
        pdf.draw_score_bar(pdf.l_margin, pdf.get_y(), bar_w, score, height=1.2)
        pdf.ln(3)

        # Severity label
        pdf.set_font("Satoshi", "", 9)
        pdf.set_text_color(*color)
        pdf.cell(0, 4, _severity_label(score, is_nl), new_x="LMARGIN", new_y="NEXT")
        pdf.set_text_color(*SLATE)
        pdf.ln(1)

        # What this means
        if summary:
            pdf.set_font("Satoshi", "", 10)
            pdf.multi_cell(0, 5, summary, new_x="LMARGIN", new_y="NEXT")
            pdf.ln(2)

        # Comparison chart
        if comp_rows:
            chart_title = (
                f"{cat_name} \u2014 vergelijking" if is_nl
                else f"{cat_name} \u2014 comparison"
            )
            show_legend = not first_chart_drawn
            chart_end_y = pdf.draw_comparison_chart(
                x=pdf.l_margin, y=pdf.get_y(),
                width=pdf.w - pdf.l_margin - pdf.r_margin,
                rows=comp_rows,
                chart_title=chart_title,
                show_legend=show_legend,
                is_nl=is_nl,
            )
            first_chart_drawn = True
            pdf.set_y(chart_end_y + 2)

            # Scale declaration caption (Task E4-S1)
            pdf.set_font("Satoshi", "", 7)
            pdf.set_text_color(*MUTED)
            scale_caption = (
                "Referentiebalken zijn op de buurt-check 0\u2013100 scoreschaal "
                "(niet dB / \u00b5g/m\u00b3). Hoger = beter."
                if is_nl
                else "Reference bars are on the buurt-check 0\u2013100 score scale "
                "(not dB / \u00b5g/m\u00b3). Higher = better."
            )
            pdf.cell(0, 3, scale_caption, new_x="LMARGIN", new_y="NEXT")
            pdf.set_text_color(*SLATE)
            pdf.ln(1)

        # Source (with "date unknown" fallback per Finding 9)
        pdf.set_font("Satoshi", "", 8)
        pdf.set_text_color(*MUTED)
        pdf.cell(0, 4, source_text, new_x="LMARGIN", new_y="NEXT")
        pdf.set_text_color(*SLATE)
        pdf.ln(4)


def _build_risk_detail_data(
    risks: RiskCardsResponse | None,
    sunlight_score: int | None,
    comparisons: RiskComparisonsResponse | None,
    is_nl: bool,
) -> list[tuple[str, int | None, str, str, list]]:
    """Build structured data for risk details page."""
    result = []

    _COMPARISON_LABELS = {
        "address": ("Dit adres" if is_nl else "This address", TEAL, False),
        "city_avg": (
            "Vergelijkingswaarde (stedelijkheid)" if is_nl
            else "Peer baseline (urbanization)", MUTED, False,
        ),
        "nl_avg": ("Nederland" if is_nl else "Netherlands", BORDER, False),
        "who_limit": (
            "WHO-doel (op scoreschaal)" if is_nl
            else "WHO benchmark (mapped to score)", AMBER_WARN, True,
        ),
        "adaptation_target": (
            "Doelstelling (op scoreschaal)" if is_nl
            else "Target (mapped to score)", AMBER_WARN, True,
        ),
        "daylight_target": (
            "Daglichtdoel (op scoreschaal)" if is_nl
            else "Daylight target (mapped to score)", AMBER_WARN, True,
        ),
    }

    def _comp_rows(category_rows: list | None) -> list:
        if not category_rows:
            return []
        rows = []
        for row in category_rows:
            label_info = _COMPARISON_LABELS.get(
                row.label_code, (row.label_code, MUTED, False)
            )
            is_dashed = row.pattern == ComparisonPattern.dashed or label_info[2]
            rows.append((label_info[0], row.value, label_info[1], is_dashed))
        return rows

    date_unknown = "Brondatum onbekend" if is_nl else "Dataset date unknown"

    if risks:
        for attr, name_en, name_nl, comp_attr in [
            ("noise", "Noise", "Geluid", "noise"),
            ("air_quality", "Air Quality", "Luchtkwaliteit", "air_quality"),
            ("climate_stress", "Climate Stress", "Klimaatstress", "climate_stress"),
        ]:
            card = getattr(risks, attr)
            summary = (card.summary_nl if is_nl else card.summary) or ""
            src_label = "Bron" if is_nl else "Source"
            source = f"{src_label}: {card.source}"
            if card.source_date:
                source += f" \u00b7 {card.source_date}"
            else:
                source += f" \u00b7 {date_unknown}"
            comp = _comp_rows(
                getattr(comparisons, comp_attr, None) if comparisons else None
            )
            result.append((name_nl if is_nl else name_en, card.score, summary, source, comp))
    else:
        # Show placeholder entries when risks unavailable
        for name_en, name_nl in [
            ("Noise", "Geluid"), ("Air Quality", "Luchtkwaliteit"),
            ("Climate Stress", "Klimaatstress"),
        ]:
            src_label = "Bron" if is_nl else "Source"
            result.append((
                name_nl if is_nl else name_en, None, "", f"{src_label}: \u2014", []
            ))

    # Sunlight
    sun_summary = ""
    if risks and risks.sunlight:
        sun_summary = (risks.sunlight.summary_nl if is_nl else risks.sunlight.summary) or ""
    sun_comp = _comp_rows(comparisons.sunlight if comparisons else None)
    src_label = "Bron" if is_nl else "Source"
    result.append((
        "Zonlicht" if is_nl else "Sunlight",
        sunlight_score,
        sun_summary,
        f"{src_label}: SunCalc + 3DBAG",
        sun_comp,
    ))

    return result


def _draw_neighborhood_page(
    pdf: BuurtCheckPDF,
    stats: NeighborhoodStats | None,
    tier_b_data: TierBResponse | None,
    is_nl: bool,
) -> None:
    """Page 3: neighborhood stats + crime."""
    if stats:
        # Buurt name + urbanization
        pdf.set_font("Satoshi", "B", 16)
        pdf.set_text_color(*SLATE)
        buurt = stats.buurt_name or stats.buurt_code
        pdf.cell(0, 8, buurt, new_x="LMARGIN", new_y="NEXT")

        subtitle_parts = []
        if stats.gemeente_name:
            subtitle_parts.append(stats.gemeente_name)
        if stats.urbanization != UrbanizationLevel.unknown:
            urb_labels = {
                UrbanizationLevel.very_urban: "Zeer stedelijk" if is_nl else "Very Urban",
                UrbanizationLevel.urban: "Stedelijk" if is_nl else "Urban",
                UrbanizationLevel.moderate: "Matig stedelijk" if is_nl else "Moderate",
                UrbanizationLevel.rural: "Landelijk" if is_nl else "Rural",
                UrbanizationLevel.very_rural: "Zeer landelijk" if is_nl else "Very Rural",
            }
            subtitle_parts.append(urb_labels.get(stats.urbanization, ""))
        if subtitle_parts:
            pdf.set_font("Satoshi", "", 10)
            pdf.set_text_color(*MUTED)
            pdf.cell(0, 5, " \u00b7 ".join(subtitle_parts), new_x="LMARGIN", new_y="NEXT")
            pdf.set_text_color(*SLATE)
        pdf.ln(4)

        # People section
        pdf.draw_section_label("Bewoners" if is_nl else "People")
        _draw_indicator(
            pdf, "Inwonerdichtheid" if is_nl else "Population density",
            stats.population_density,
        )
        _draw_indicator(
            pdf, "Gem. huishoudgrootte" if is_nl else "Avg household size",
            stats.avg_household_size,
        )
        _draw_indicator(
            pdf, "Alleenstaanden" if is_nl else "Single-person hh",
            stats.single_person_pct,
        )
        pdf.ln(2)

        # Age distribution
        pdf.draw_section_label("Leeftijdsverdeling" if is_nl else "Age Distribution")
        if (
            stats.age_profile.age_0_24 is not None
            or stats.age_profile.age_25_64 is not None
            or stats.age_profile.age_65_plus is not None
        ):
            pdf.draw_age_bars(
                x=pdf.l_margin, y=pdf.get_y(),
                width=pdf.w - pdf.l_margin - pdf.r_margin,
                age_data=stats.age_profile,
            )
            pdf.ln(23)
        pdf.ln(2)

        # Housing
        pdf.draw_section_label("Woningen" if is_nl else "Housing")
        _draw_indicator(
            pdf, "Koopwoningen" if is_nl else "Owner-occupied",
            stats.owner_occupied_pct,
        )
        _draw_indicator(
            pdf, "Gem. WOZ-waarde" if is_nl else "Avg property value",
            stats.avg_property_value,
        )
        pdf.ln(2)

        # Access
        pdf.draw_section_label("Bereikbaarheid" if is_nl else "Access")
        _draw_indicator(
            pdf, "Treinstation" if is_nl else "Train station",
            stats.distance_to_train_km,
        )
        _draw_indicator(
            pdf, "Supermarkt" if is_nl else "Supermarket",
            stats.distance_to_supermarket_km,
        )

        # CBS source
        pdf.ln(2)
        pdf.set_font("Satoshi", "", 8)
        pdf.set_text_color(*MUTED)
        pdf.cell(
            0, 4,
            "Bron: CBS Wijken & Buurten 2024" if is_nl else "Source: CBS Wijken & Buurten 2024",
            new_x="LMARGIN", new_y="NEXT",
        )
        pdf.set_text_color(*SLATE)
    else:
        pdf.set_font("Satoshi", "", 10)
        pdf.set_text_color(*MUTED)
        pdf.cell(
            0, 8,
            "Buurtgegevens niet beschikbaar." if is_nl else "Neighborhood data unavailable.",
            new_x="LMARGIN", new_y="NEXT",
        )
        pdf.set_text_color(*SLATE)

    # Divider before Tier B
    pdf.draw_divider("strong")

    # Safety
    pdf.draw_section_label("Veiligheid" if is_nl else "Safety")
    pdf.ln(1)

    if tier_b_data:
        crime = tier_b_data.crime
        if crime.total_per_1000 is not None:
            pdf.set_font("Satoshi", "B", 11)
            pdf.cell(
                0, 7, "Criminaliteit" if is_nl else "Crime Rate",
                new_x="LMARGIN", new_y="NEXT",
            )
            pdf.set_font("Satoshi", "", 10)
            per_label = "per 1.000 inwoners" if is_nl else "per 1,000 residents"
            pdf.cell(
                0, 6, f"{crime.total_per_1000:.1f} {per_label}",
                new_x="LMARGIN", new_y="NEXT",
            )
            if crime.burglary_per_1000 is not None:
                pdf.set_font("Satoshi", "", 9)
                pdf.set_x(pdf.l_margin + 5)
                inbraak = "Inbraak" if is_nl else "Burglary"
                pdf.cell(
                    0, 5, f"{inbraak}: {crime.burglary_per_1000:.1f}",
                    new_x="LMARGIN", new_y="NEXT",
                )
            if crime.violent_per_1000 is not None:
                pdf.set_x(pdf.l_margin + 5)
                geweld = "Geweld" if is_nl else "Violent"
                pdf.cell(
                    0, 5, f"{geweld}: {crime.violent_per_1000:.1f}",
                    new_x="LMARGIN", new_y="NEXT",
                )
            pdf.ln(2)
            pdf.set_font("Satoshi", "I", 8)
            pdf.set_text_color(*MUTED)
            disclaimer = (
                "Criminaliteitscijfers zijn per gemeente, niet per straat. "
                "Alleen geregistreerde misdrijven."
                if is_nl
                else "Crime data is per municipality, not per street. "
                "Registered crimes only."
            )
            pdf.multi_cell(0, 4, disclaimer, new_x="LMARGIN", new_y="NEXT")
            pdf.set_text_color(*SLATE)
        elif crime.message:
            pdf.set_font("Satoshi", "", 9)
            pdf.set_text_color(*MUTED)
            pdf.cell(0, 6, crime.message, new_x="LMARGIN", new_y="NEXT")
            pdf.set_text_color(*SLATE)
    else:
        pdf.set_font("Satoshi", "", 9)
        pdf.set_text_color(*MUTED)
        no_data = (
            "Criminaliteitsgegevens niet beschikbaar."
            if is_nl
            else "Crime data unavailable."
        )
        pdf.cell(0, 6, no_data, new_x="LMARGIN", new_y="NEXT")
        pdf.set_text_color(*SLATE)


def _draw_checks_subsection(
    pdf: BuurtCheckPDF, title: str, body: str, source: str,
) -> None:
    """Render a single subsection: bold title, body text, muted source, divider."""
    pdf.set_font("Satoshi", "B", 11)
    pdf.cell(0, 6, title, new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Satoshi", "", 10)
    pdf.multi_cell(0, 5, body, new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Satoshi", "", 8)
    pdf.set_text_color(*MUTED)
    pdf.cell(0, 4, source, new_x="LMARGIN", new_y="NEXT")
    pdf.set_text_color(*SLATE)
    pdf.draw_divider("light")


def _draw_property_checks_page(
    pdf: BuurtCheckPDF,
    risks: RiskCardsResponse | None,
    sunlight_score: int | None,
    shadow_image_b64: str | None,
    property_warnings: PropertyWarningsResponse | None,
    is_nl: bool,
) -> None:
    """Page 4: premium-only checks required in the paid Full Dossier."""
    pdf.set_font("Satoshi", "B", 12)
    title = "Aanvullende vastgoedcontroles" if is_nl else "Additional Property Checks"
    pdf.cell(0, 7, title, new_x="LMARGIN", new_y="NEXT")
    pdf.ln(1)

    # 1) Asbestos Awareness
    if property_warnings:
        if property_warnings.asbestos.flagged:
            cy = property_warnings.asbestos.construction_year
            year_text = f"{cy}" if cy is not None else "\u2014"
            asbestos_text = (
                f"Mogelijk asbestrisico op basis van bouwjaar ({year_text}). "
                "Vraag een asbestinventarisatie aan voor verbouwing."
                if is_nl
                else f"Potential asbestos risk flagged from construction year ({year_text}). "
                "Request an asbestos inventory before renovation."
            )
        else:
            asbestos_text = (
                "Geen leeftijdsgebonden asbestsignaal in beschikbare gebouwdata."
                if is_nl
                else "No age-based asbestos flag in available building data."
            )
    else:
        asbestos_text = (
            "Asbeststatus niet beschikbaar in de exportketen."
            if is_nl
            else "Asbestos status unavailable in export pipeline."
        )
    asbestos_source = (
        "Bron: BAG-bouwjaarheuristiek" if is_nl
        else "Source: BAG construction year heuristic"
    )
    _draw_checks_subsection(
        pdf,
        title="Asbestbewustzijn" if is_nl else "Asbestos Awareness",
        body=asbestos_text,
        source=asbestos_source,
    )

    # 2) Foundation Risk
    if property_warnings:
        fr = property_warnings.foundation_risk
        if fr.level == "unavailable":
            foundation_text = (
                "Funderingsrisico kon niet worden beoordeeld "
                "(bouwjaar onbekend)."
                if is_nl
                else "Foundation risk could not be assessed "
                "(construction year unknown)."
            )
        elif fr.level == "high":
            soil_part = (
                f" Grondsoort: {fr.soil_type}."
                if fr.soil_type else ""
            )
            sub_part = (
                f" Bodemdalingssnelheid: "
                f"{fr.subsidence_rate_mm_per_year:.1f} mm/jaar."
                if fr.subsidence_rate_mm_per_year is not None
                else ""
            )
            foundation_text = (
                "Hoog funderingsrisico vastgesteld."
                f"{soil_part}{sub_part} "
                "Laat een funderingsinspectie uitvoeren "
                "voor aankoop."
                if is_nl
                else "High foundation risk identified."
                f"{soil_part}{sub_part} "
                "Commission a foundation inspection "
                "before purchase."
            )
        elif fr.level == "medium":
            soil_part = (
                f" Grondsoort: {fr.soil_type}."
                if fr.soil_type else ""
            )
            sub_part = (
                f" Bodemdalingssnelheid: "
                f"{fr.subsidence_rate_mm_per_year:.1f} mm/jaar."
                if fr.subsidence_rate_mm_per_year is not None
                else ""
            )
            foundation_text = (
                f"Matig funderingsrisico.{soil_part}{sub_part}"
                " Overweeg een funderingsonderzoek."
                if is_nl
                else "Moderate foundation risk."
                f"{soil_part}{sub_part}"
                " Consider a foundation survey."
            )
        else:
            foundation_text = (
                "Geen funderingsrisicosignaal gedetecteerd "
                "op basis van beschikbare gegevens."
                if is_nl
                else "No foundation risk signal detected "
                "from available data."
            )
    else:
        foundation_text = (
            "Funderingsrisico niet beschikbaar "
            "in de exportketen."
            if is_nl
            else "Foundation risk unavailable "
            "in export pipeline."
        )
    _draw_checks_subsection(
        pdf,
        title=(
            "Funderingsrisico" if is_nl
            else "Foundation Risk"
        ),
        body=foundation_text,
        source=(
            "Bron: BRO bodemdata + Klimaateffectatlas "
            "bodemdaling"
            if is_nl
            else "Source: BRO soil data + "
            "Klimaateffectatlas subsidence"
        ),
    )

    # 3) Erfpacht (Ground Lease)
    if property_warnings:
        ep = property_warnings.erfpacht
        if ep.detected:
            conf_part = (
                " (bevestigd)"
                if ep.confidence == "confirmed"
                else " (op basis van gemeente)"
                if ep.confidence == "municipality_based"
                else ""
            )
            mu_part = (
                f" Gemeente: {ep.municipality}."
                if ep.municipality else ""
            )
            erfpacht_text = (
                f"Erfpacht gedetecteerd{conf_part}."
                f"{mu_part} Controleer de "
                "erfpachtvoorwaarden, canon en einddatum "
                "bij de notaris."
                if is_nl
                else "Ground lease (erfpacht) detected"
                f"{conf_part}.{mu_part} "
                "Verify lease terms, canon amount, and "
                "expiry date with the notary."
            )
        else:
            erfpacht_text = (
                "Geen erfpachtsignaal gedetecteerd. "
                "Dit pand lijkt op eigen grond te staan."
                if is_nl
                else "No ground lease signal detected. "
                "This property appears to be on "
                "freehold land."
            )
    else:
        erfpacht_text = (
            "Erfpachtstatus niet beschikbaar "
            "in de exportketen."
            if is_nl
            else "Ground lease status unavailable "
            "in export pipeline."
        )
    _draw_checks_subsection(
        pdf,
        title=(
            "Erfpacht (grondhuur)" if is_nl
            else "Ground Lease (Erfpacht)"
        ),
        body=erfpacht_text,
        source=(
            "Bron: Gemeentelijke erfpachtlijst"
            if is_nl
            else "Source: Municipal ground lease registry"
        ),
    )

    # 4) VvE (Owners' Association)
    if property_warnings:
        vve = property_warnings.vve
        if vve.is_apartment:
            units_part = (
                f" ({vve.num_units} eenheden)"
                if vve.num_units else ""
            )
            vve_text = (
                "Dit is een appartementsrecht"
                f"{units_part}. Vraag de VvE-jaarstukken "
                "op: reservefonds, onderhoudsplan en "
                "notulen van de laatste vergadering."
                if is_nl
                else "This is an apartment right"
                f"{units_part}. Request VvE annual "
                "documents: reserve fund, maintenance "
                "plan, and minutes from the last meeting."
            )
        else:
            vve_text = (
                "Geen VvE van toepassing. Dit pand is "
                "geen appartementsrecht."
                if is_nl
                else "No owners' association applicable. "
                "This property is not an apartment right."
            )
    else:
        vve_text = (
            "VvE-status niet beschikbaar "
            "in de exportketen."
            if is_nl
            else "VvE status unavailable "
            "in export pipeline."
        )
    _draw_checks_subsection(
        pdf,
        title=(
            "VvE (Vereniging van Eigenaren)" if is_nl
            else "VvE (Owners' Association)"
        ),
        body=vve_text,
        source=(
            "Bron: BAG verblijfsobjecten" if is_nl
            else "Source: BAG dwelling unit count"
        ),
    )

    # 5) Lead Pipe Risk
    if property_warnings:
        lp = property_warnings.lead_pipe
        if lp.flagged:
            lp_year = (
                f"{lp.construction_year}"
                if lp.construction_year is not None
                else "\u2014"
            )
            lead_text = (
                "Mogelijk loden leidingen op basis van "
                f"bouwjaar ({lp_year}). Laat een watertest "
                "uitvoeren en vraag leidinggegevens op "
                "bij het waterbedrijf."
                if is_nl
                else "Potential lead pipes flagged from "
                f"construction year ({lp_year}). "
                "Commission a water test and request "
                "pipe records from the water utility."
            )
        else:
            lead_text = (
                "Geen signaal voor loden leidingen "
                "op basis van beschikbare gebouwdata."
                if is_nl
                else "No lead pipe signal detected "
                "from available building data."
            )
    else:
        lead_text = (
            "Loden leidingen status niet beschikbaar "
            "in de exportketen."
            if is_nl
            else "Lead pipe status unavailable "
            "in export pipeline."
        )
    _draw_checks_subsection(
        pdf,
        title=(
            "Loden leidingen" if is_nl
            else "Lead Pipe Risk"
        ),
        body=lead_text,
        source=(
            "Bron: BAG-bouwjaarheuristiek (pre-1960)"
            if is_nl
            else "Source: BAG construction year "
            "heuristic (pre-1960)"
        ),
    )

    # 6) Soil Contamination Check
    climate_summary = ""
    if risks and risks.climate_stress:
        climate_summary = (
            risks.climate_stress.summary_nl if is_nl else risks.climate_stress.summary
        ) or ""
    if climate_summary:
        soil_text = (
            f"Gerelateerde klimaatcontext: {climate_summary}. "
            "Perceelgebonden bodemverontreiniging vereist nog steeds een Bodemloket-uittreksel."
            if is_nl
            else f"Related climate context: {climate_summary}. "
            "Parcel-level contamination still requires a municipal Bodemloket extract."
        )
    else:
        soil_text = (
            "Er is hier geen perceelgebonden verontreinigingsdataset gekoppeld. "
            "Vraag een gemeentelijk Bodemloket-uittreksel aan voor de officiële historie."
            if is_nl
            else "No parcel-level contamination dataset is configured here. "
            "Request a municipal Bodemloket extract for official contamination history."
        )
    soil_source = (
        "Bron: Gemeentelijk Bodemloket (handmatige verificatie)" if is_nl
        else "Source: Municipal Bodemloket (manual verification)"
    )
    _draw_checks_subsection(
        pdf,
        title=(
            "Bodemverontreinigingscontrole" if is_nl
            else "Soil Contamination Check"
        ),
        body=soil_text,
        source=soil_source,
    )

    # 7) Direct sun (clear-sky visibility)
    sun = risks.sunlight if risks else None
    if sun and (
        sun.winter_hours is not None
        or sun.equinox_hours is not None
        or sun.summer_hours is not None
    ):
        w = f"{sun.winter_hours:.1f}h" if sun.winter_hours is not None else "\u2014"
        e = f"{sun.equinox_hours:.1f}h" if sun.equinox_hours is not None else "\u2014"
        s = f"{sun.summer_hours:.1f}h" if sun.summer_hours is not None else "\u2014"
        score_text = str(sunlight_score) if sunlight_score is not None else "\u2014"
        sun_text = (
            f"Geschat direct zonlicht: winter {w}/dag, equinox {e}/dag, zomer {s}/dag. "
            f"Score: {score_text}/100."
            if is_nl
            else f"Estimated direct sunlight: winter {w}/day, equinox {e}/day, summer {s}/day. "
            f"Score: {score_text}/100."
        )
    else:
        sun_text = (
            "Schatting van direct zonlicht niet beschikbaar voor deze export."
            if is_nl
            else "Direct sun estimate unavailable for this export."
        )
    _draw_checks_subsection(
        pdf,
        title=(
            "Direct zonlicht (helderheidsschatting)" if is_nl
            else "Direct sun (clear-sky visibility)"
        ),
        body=sun_text,
        source=(
            "Bron: SunCalc + 3DBAG" if is_nl
            else "Source: SunCalc + 3DBAG"
        ),
    )

    # 8) Shadow Snapshots
    shadow_title = "Schaduwopnamen" if is_nl else "Shadow Snapshots"
    if shadow_image_b64:
        snapshot_text = (
            "Schaduwopname op winterzonnewende, gegenereerd op basis van omliggende 3D-geometrie."
            if is_nl
            else "Winter-solstice shadow snapshot generated from surrounding 3D geometry."
        )
    else:
        snapshot_text = (
            "Er is geen schaduwopname aangeleverd voor deze export."
            if is_nl
            else "No shadow snapshot was supplied for this export."
        )
    shadow_source = (
        "Bron: SunCalc ray-casting op 3DBAG-meshes"
        if is_nl
        else "Source: SunCalc ray-casting over 3DBAG meshes"
    )
    # Section 4 has an image between body and source, so render manually
    pdf.set_font("Satoshi", "B", 11)
    pdf.cell(0, 6, shadow_title, new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Satoshi", "", 10)
    pdf.multi_cell(0, 5, snapshot_text, new_x="LMARGIN", new_y="NEXT")
    _draw_shadow_image(pdf, shadow_image_b64, is_nl)
    pdf.set_font("Satoshi", "", 8)
    pdf.set_text_color(*MUTED)
    pdf.cell(0, 4, shadow_source, new_x="LMARGIN", new_y="NEXT")
    pdf.set_text_color(*SLATE)


def _draw_indicator(pdf: BuurtCheckPDF, label: str, indicator) -> None:
    """Draw a single neighborhood indicator row."""
    if not indicator.available:
        pdf.draw_indicator_row(label, "\u2014")
        return
    val = indicator.value
    unit = indicator.unit or ""
    if isinstance(val, float):
        if unit == "%":
            text = f"{val:.0f}%"
        elif unit == "\u20ac":
            text = f"\u20ac{val:,.0f}"
        elif unit == "km":
            text = f"{val:.1f} km"
        elif unit == "/km\u00b2":
            text = f"{val:,.0f}/km\u00b2"
        else:
            text = f"{val:,.0f} {unit}".strip()
    elif val is not None:
        text = f"{val} {unit}".strip()
    else:
        text = "\u2014"
    pdf.draw_indicator_row(label, text)


def _draw_checklist_page(
    pdf: BuurtCheckPDF,
    address: str,
    risks: RiskCardsResponse | None,
    sunlight_score: int | None,
    viewing_questions: ViewingQuestionsResponse | None,
    is_nl: bool,
) -> None:
    """Page 4: viewing checklist with mini risk strip for standalone tearout."""
    pdf.set_font("Satoshi", "B", 11)
    pdf.set_text_color(*SLATE)
    pdf.cell(0, 6, address, new_x="LMARGIN", new_y="NEXT")
    pdf.ln(1)

    cells = _build_risk_cells(risks, sunlight_score, is_nl)
    grid_end_y = pdf.draw_risk_grid(
        x=pdf.l_margin, y=pdf.get_y(),
        width=pdf.w - pdf.l_margin - pdf.r_margin,
        cells=cells, cols=4,
    )
    pdf.set_y(grid_end_y + 2)

    pdf.set_font("Satoshi", "", 10)
    instruction = (
        "Controleer deze punten bij de bezichtiging."
        if is_nl
        else "Check these items at your viewing."
    )
    pdf.cell(0, 6, instruction, new_x="LMARGIN", new_y="NEXT")
    pdf.ln(2)

    _draw_branded_questions(pdf, viewing_questions, is_nl, max_questions=None)


def _draw_provenance_block(
    pdf: BuurtCheckPDF,
    prov: ProvenanceData,
    is_nl: bool,
) -> None:
    """Render the Report Details provenance panel on the methodology page."""
    pdf.draw_divider("strong")
    pdf.ln(2)

    pdf.set_font("Satoshi", "B", 12)
    pdf.set_text_color(*SLATE)
    pdf.cell(
        0, 7,
        "Rapportgegevens" if is_nl else "Report Details",
        new_x="LMARGIN", new_y="NEXT",
    )
    pdf.ln(1)

    pdf.set_font("Satoshi", "", 8)
    pdf.set_text_color(*SECONDARY)

    generated_at = datetime.now(tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%S+00:00")

    # Row 1: Report ID + Generated timestamp
    parts_row1: list[str] = []
    if prov.report_id:
        parts_row1.append(f"Report ID: {prov.report_id}")
    parts_row1.append(
        f"{'Gegenereerd' if is_nl else 'Generated'}: {generated_at}"
    )
    pdf.cell(0, 4, " | ".join(parts_row1), new_x="LMARGIN", new_y="NEXT")

    # Row 2: VBO + Pand IDs
    parts_row2: list[str] = []
    if prov.vbo_id:
        parts_row2.append(f"VBO: {prov.vbo_id}")
    if prov.pand_id:
        parts_row2.append(f"Pand: {prov.pand_id}")
    if parts_row2:
        pdf.cell(0, 4, " | ".join(parts_row2), new_x="LMARGIN", new_y="NEXT")

    # Row 3: Buurt + Gemeente
    parts_row3: list[str] = []
    if prov.buurt_code:
        parts_row3.append(f"Buurt: {prov.buurt_code}")
    gemeente_code = prov.gemeente_code
    if prov.gemeente_name and gemeente_code:
        parts_row3.append(f"Gemeente: {prov.gemeente_name} ({gemeente_code})")
    elif prov.gemeente_name:
        parts_row3.append(f"Gemeente: {prov.gemeente_name}")
    if parts_row3:
        pdf.cell(0, 4, " | ".join(parts_row3), new_x="LMARGIN", new_y="NEXT")

    # Row 4: Coordinates (both WGS84 and RD)
    parts_row4: list[str] = []
    if prov.lat is not None and prov.lng is not None:
        parts_row4.append(f"{prov.lat:.4f}N, {prov.lng:.4f}E (WGS84)")
    if prov.rd_x is not None and prov.rd_y is not None:
        parts_row4.append(f"{prov.rd_x:.0f}, {prov.rd_y:.0f} (EPSG:28992)")
    if parts_row4:
        coord_label = "Co\u00f6rdinaten" if is_nl else "Coordinates"
        pdf.cell(
            0, 4,
            f"{coord_label}: {' / '.join(parts_row4)}",
            new_x="LMARGIN", new_y="NEXT",
        )

    # Row 5: Geocoding method
    geocoding_label = (
        "Geocodering: BAG-adreslokatie (gebouwcentro\u00efde)"
        if is_nl
        else "Geocoding: BAG address point (building centroid)"
    )
    pdf.cell(0, 4, geocoding_label, new_x="LMARGIN", new_y="NEXT")

    # Row 6: Methodology version
    method_label = "Methodologie" if is_nl else "Methodology"
    pdf.cell(
        0, 4,
        f"{method_label}: {prov.methodology_version}",
        new_x="LMARGIN", new_y="NEXT",
    )

    pdf.set_text_color(*SLATE)
    pdf.ln(4)


def _draw_methodology_page(
    pdf: BuurtCheckPDF,
    is_nl: bool,
    provenance: ProvenanceData | None = None,
) -> None:
    """Page 6: methodology, data sources, limitations, provenance, and note lines."""
    pdf.set_font("Satoshi", "B", 12)
    pdf.cell(
        0, 7,
        "Hoe we risico's scoren" if is_nl else "How we score risks",
        new_x="LMARGIN", new_y="NEXT",
    )
    pdf.ln(1)

    pdf.set_font("Satoshi", "", 10)
    methodology = (
        "Alle risicoscores zijn genormaliseerd naar een schaal van 0\u2013100, "
        "waarbij hoger beter is. Scores zijn gebaseerd op WHO Environmental "
        "Noise Guidelines (2018), WHO Global Air Quality Guidelines (2021), "
        "en Klimaateffectatlas overstromings-/hittemodellen. "
        "Zonlichtanalyse gebruikt ray-casting tegen 3D-gebouwgeometrie "
        "van 3DBAG. De winterzonnewende (slechtste geval) bepaalt de "
        "risicoclassificatie."
        if is_nl
        else "All risk scores are normalized to a 0\u2013100 scale where higher is "
        "better. Scores are based on WHO Environmental Noise Guidelines (2018), "
        "WHO Global Air Quality Guidelines (2021), and Klimaateffectatlas "
        "flood/heat stress models. Sunlight analysis uses ray-casting against "
        "3D building geometry from 3DBAG. The winter solstice (worst case) "
        "determines the risk classification."
    )
    pdf.multi_cell(0, 5, methodology, new_x="LMARGIN", new_y="NEXT")
    pdf.ln(3)

    # Data sources table
    pdf.draw_section_label("Databronnen" if is_nl else "Data Sources")
    sources = [
        ("BAG (Kadaster)", "Gebouwgegevens" if is_nl else "Building data"),
        ("3DBAG (TU Delft)", "3D-geometrie" if is_nl else "3D geometry"),
        ("RIVM", "Geluid, luchtkwaliteit" if is_nl else "Noise, air quality"),
        ("Klimaateffectatlas", "Klimaatstress" if is_nl else "Climate stress"),
        ("CBS", "Buurtstatistieken" if is_nl else "Neighborhood stats"),
    ]
    for name, desc in sources:
        pdf.draw_indicator_row(name, desc)
    pdf.ln(3)

    # Peer baseline disclosure (Task E4-S2)
    pdf.set_font("Satoshi", "", 9)
    pdf.set_text_color(*MUTED)
    baseline_disclosure = (
        "Waar 'vergelijkingswaarde' wordt getoond, zijn waarden gemodelleerd op basis "
        "van de stedelijkheidscategorie (CBS) van het adres, niet gemiddeld over de "
        "volledige verdeling van de gemeente."
        if is_nl
        else "Where 'peer baseline' is shown, values are modeled from the address's "
        "urbanization category (CBS), not averaged from the municipality's full "
        "distribution."
    )
    pdf.multi_cell(0, 4, baseline_disclosure, new_x="LMARGIN", new_y="NEXT")
    pdf.set_text_color(*SLATE)
    pdf.ln(3)

    # Limitations
    pdf.set_font("Satoshi", "B", 12)
    pdf.set_text_color(*AMBER_WARN)
    pdf.cell(
        0, 7,
        "Belangrijke beperkingen" if is_nl else "Important limitations",
        new_x="LMARGIN", new_y="NEXT",
    )
    pdf.set_text_color(*SLATE)
    pdf.set_font("Satoshi", "", 10)
    limitations = (
        "Alle gegevens zijn indicatief en vervangen geen professionele "
        "bouwinspectie. Criminaliteitscijfers zijn per gemeente, niet per straat. "
        "Milieumetingen geven mogelijk geen micro-lokale omstandigheden weer."
        if is_nl
        else "All data is indicative and should not replace professional building "
        "inspection. Crime data is per municipality, not per street. "
        "Environmental measurements may not reflect micro-local conditions."
    )
    pdf.multi_cell(0, 5, limitations, new_x="LMARGIN", new_y="NEXT")
    pdf.ln(4)

    # Provenance / Report Details block
    if provenance:
        _draw_provenance_block(pdf, provenance, is_nl)

    pdf.draw_divider("strong")

    # Notes section
    pdf.set_font("Satoshi", "B", 12)
    pdf.cell(
        0, 7,
        "Uw notities" if is_nl else "Your viewing notes",
        new_x="LMARGIN", new_y="NEXT",
    )
    pdf.ln(2)

    pdf.set_draw_color(*BORDER)
    pdf.set_line_width(0.1)
    for _ in range(12):
        y = pdf.get_y()
        if y > pdf.h - 25:
            break
        pdf.line(pdf.l_margin, y, pdf.w - pdf.r_margin, y)
        pdf.ln(8)
