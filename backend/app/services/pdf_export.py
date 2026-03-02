"""PDF export service — Polar Frost branded Quick Brief and Full Dossier."""

import base64
import io
import logging
from datetime import date, datetime, timezone
from pathlib import Path

from fpdf import FPDF

from app.models.livability import LivabilityResponse, LivabilityTrendPoint
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
# Contrast ratios are vs white (#FFFFFF) unless noted.
TEAL = (46, 196, 182)  # #2EC4B6 — Arctic Teal accent (2.17:1 — fill only, never text)
SLATE = (28, 45, 63)  # #1C2D3F — Polar Slate primary text (12.6:1)
MUTED = (120, 140, 165)  # #788CA5 — peer/comparison bar fill (3.44:1, >= 3:1 graphical AA)
BORDER = (226, 231, 237)  # #E2E7ED — borders, dividers, score track (1.3:1, non-data)
WHITE = (255, 255, 255)
AMBER_WARN = (234, 179, 8)  # #EAB308 — amber for warnings (1.87:1 — fill/dashed only)
SECONDARY = (99, 120, 146)  # #637892 — essential info text (4.52:1 — WCAG AA pass)
NATIONAL = (110, 130, 155)  # #6E829B — "Nederland" bar fill (3.94:1, >= 3:1 graphical)
GRIDLINE = (240, 242, 245)  # Very light gray for chart gridlines (decorative)
TEAL_LIGHT = (232, 248, 246)  # #E8F8F6 — light teal for section bands, premium badges

# --- CBS 2024 national age distribution averages (%) ---
NL_AGE_0_24 = 28.0
NL_AGE_25_64 = 50.0
NL_AGE_65_PLUS = 22.0

SEVERITY_COLORS: dict[str, tuple[int, int, int]] = {
    "good": (34, 197, 94),  # #22C55E
    "moderate": (234, 179, 8),  # #EAB308
    "poor": (239, 68, 68),  # #EF4444
    "critical": (185, 28, 28),  # #B91C1C
}

# --- PDF Type Hierarchy (8 primary levels) ---
#
# Level         | Font                   | Size | Color     | Usage
# --------------|------------------------|------|-----------|-------------------------------
# Display       | SatoshiBlack           | 24pt | severity  | Score numerals in risk grid
# Display-sm    | SatoshiBlack           | 14pt | severity  | Score badge in detail headers
# Headline      | SatoshiBlack / Bold    | 16-20pt | SLATE | Address hero, checklist title
# Section       | Satoshi Bold           | 12pt | SLATE     | Section headings
# Body          | Satoshi Regular        | 10pt | SLATE     | Summaries, explanations, paragraphs
# Label         | SatoshiMedium          | 9pt  | SECONDARY | Section labels, indicator labels,
#               |                        |      |           | severity labels, dimension labels
#               | Satoshi Bold (sub-var) | 9pt  | SLATE     | Indicator values, dimension scores
# Caption       | Satoshi Regular        | 8pt  | SECONDARY | Source attributions, disclaimers,
#               |                        |      |           | chart axis labels, image captions
#               | Satoshi Bold (sub-var) | 8pt  | SLATE     | Chart emphasis (address row label,
#               |                        |      |           | score values, map "N" arrow)
# Footer        | SatoshiBlack           | 8pt  | SLATE     | Footer brand name
#               | Satoshi Regular        | 8pt  | SECONDARY | Footer disclaimer
#               | Satoshi Regular        | 8pt  | TEAL      | Footer page number
#
# Brand         | SatoshiBlack           | 9pt  | SLATE     | "buurt-check" in header
# Brand-cover   | SatoshiBlack           | 16pt | SLATE     | "buurt-check" wordmark on cover
# Premium badge | SatoshiMedium          | 7pt  | TEAL      | "PREMIUM" pill on premium sections
# Section band  | Satoshi Bold           | 12pt | SLATE     | Section label on TEAL_LIGHT band
#
# Rules:
# - No Regular 9pt exists as a distinct level. Everything at 9pt is either
#   Medium/SECONDARY (labels) or Bold/SLATE (value emphasis).
# - Body (10pt Regular) is the minimum size for readable multi-line text.
# - Caption (8pt) is for metadata that supports but doesn't compete with content.


def format_number(value: float, decimals: int = 0, is_nl: bool = False) -> str:
    """Format number with locale-appropriate separators.

    NL: decimal comma, period thousands (1.234,5)
    EN: decimal period, comma thousands (1,234.5)
    """
    if decimals > 0:
        formatted = f"{value:,.{decimals}f}"
    else:
        formatted = f"{value:,.0f}"
    if is_nl:
        # Swap: comma→placeholder, period→comma, placeholder→period
        formatted = formatted.replace(",", "_COMMA_").replace(".", ",").replace("_COMMA_", ".")
    return formatted


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


def _generate_executive_summary(
    risks: RiskCardsResponse | None,
    sunlight_score: int | None,
    livability: LivabilityResponse | None,
    is_nl: bool,
) -> str:
    """Generate a 3-5 sentence bilingual executive summary from risk and livability data.

    Synthesizes:
    1. Risk severity distribution (how many good/moderate/poor/critical)
    2. Top concern (worst risk category and why)
    3. Neighborhood character (from livability if available)
    4. Key action items (what to verify at viewing)
    """
    # --- Collect scores per category ---
    categories: list[tuple[str, str, int | None]] = []
    # (en_name, nl_name, score)
    if risks:
        categories.append(("noise", "geluid", risks.noise.score))
        categories.append(("air quality", "luchtkwaliteit", risks.air_quality.score))
        categories.append(("climate stress", "klimaatstress", risks.climate_stress.score))
    categories.append(("sunlight", "zonlicht", sunlight_score))

    # --- Count severities ---
    severity_counts: dict[str, int] = {"good": 0, "moderate": 0, "poor": 0, "critical": 0}
    scored_categories: list[tuple[str, str, int]] = []
    for en_name, nl_name, score in categories:
        if score is not None:
            sev = _severity_for_score(score)
            if sev in severity_counts:
                severity_counts[sev] += 1
            scored_categories.append((en_name, nl_name, score))

    if not scored_categories:
        if is_nl:
            return "Er zijn onvoldoende gegevens beschikbaar om een samenvatting te genereren."
        return "Insufficient data available to generate a summary."

    # --- Sentence 1: severity distribution overview ---
    total = len(scored_categories)
    parts_en: list[str] = []
    parts_nl: list[str] = []
    if severity_counts["good"] > 0:
        parts_en.append(f"{severity_counts['good']} good")
        parts_nl.append(f"{severity_counts['good']} goed")
    if severity_counts["moderate"] > 0:
        parts_en.append(f"{severity_counts['moderate']} moderate")
        parts_nl.append(f"{severity_counts['moderate']} matig")
    if severity_counts["poor"] > 0:
        parts_en.append(f"{severity_counts['poor']} poor")
        parts_nl.append(f"{severity_counts['poor']} slecht")
    if severity_counts["critical"] > 0:
        parts_en.append(f"{severity_counts['critical']} critical")
        parts_nl.append(f"{severity_counts['critical']} kritiek")

    if is_nl:
        sentence1 = (
            f"Van de {total} risicocategorie\u00ebn scoren "
            + ", ".join(parts_nl)
            + "."
        )
    else:
        sentence1 = (
            f"Of the {total} risk categories, "
            + ", ".join(parts_en)
            + "."
        )

    # --- Sentence 2: top concern (worst scoring category) ---
    worst = min(scored_categories, key=lambda x: x[2])
    worst_en, worst_nl, worst_score = worst
    worst_sev = _severity_label(worst_score, is_nl)

    if is_nl:
        sentence2 = (
            f"Het grootste aandachtspunt is {worst_nl} "
            f"met een score van {worst_score}/100 ({worst_sev.lower()})."
        )
    else:
        sentence2 = (
            f"The top concern is {worst_en} "
            f"with a score of {worst_score}/100 ({worst_sev.lower()})."
        )

    # --- Sentence 3: neighborhood character (from livability) ---
    sentence3 = ""
    if livability and livability.available and livability.overall_normalized is not None:
        liv_sev = _severity_label(livability.overall_normalized, is_nl)
        # Find best dimension
        best_dim = None
        if livability.dimensions:
            best_dim = max(livability.dimensions, key=lambda d: d.normalized_score)

        dim_names_nl = {
            "physical": "fysieke omgeving",
            "safety": "veiligheid",
            "social": "sociale cohesie",
            "amenities": "voorzieningen",
            "housing": "woningkwaliteit",
        }
        dim_names_en = {
            "physical": "physical environment",
            "safety": "safety",
            "social": "social cohesion",
            "amenities": "amenities",
            "housing": "housing quality",
        }

        if is_nl:
            sentence3 = (
                f"De buurt heeft een {liv_sev.lower()} leefbaarheid"
            )
            if best_dim:
                dim_label = dim_names_nl.get(best_dim.name, best_dim.name)
                sentence3 += f" met sterke {dim_label}"
            sentence3 += "."
        else:
            sentence3 = (
                f"The neighborhood has {liv_sev.lower()} livability"
            )
            if best_dim:
                dim_label = dim_names_en.get(best_dim.name, best_dim.name)
                sentence3 += f" with strong {dim_label}"
            sentence3 += "."

    # --- Sentence 4: viewing action items based on worst risks ---
    # Collect categories scoring poor or critical
    concern_cats: list[tuple[str, str]] = [
        (en, nl) for en, nl, s in scored_categories if s < 40
    ]
    viewing_actions_en = {
        "noise": "measure ambient noise at different times of day",
        "air quality": "check proximity to busy roads and industrial zones",
        "climate stress": "inspect for signs of water damage and ask about flood history",
        "sunlight": "visit at midday to assess natural light in living spaces",
    }
    viewing_actions_nl = {
        "geluid": "meet het omgevingsgeluid op verschillende momenten van de dag",
        "luchtkwaliteit": "controleer de nabijheid van drukke wegen en industriegebieden",
        "klimaatstress": (
            "inspecteer op tekenen van waterschade"
            " en vraag naar overstromingshistorie"
        ),
        "zonlicht": "bezoek rond het middaguur om het natuurlijk licht te beoordelen",
    }

    if concern_cats:
        actions = viewing_actions_nl if is_nl else viewing_actions_en
        tips = [actions.get(nl if is_nl else en, "") for en, nl in concern_cats]
        tips = [t for t in tips if t]
        if is_nl:
            sentence4 = "Let bij de bezichtiging vooral op: " + "; ".join(tips) + "."
        else:
            sentence4 = "At the viewing, pay attention to: " + "; ".join(tips) + "."
    else:
        if is_nl:
            sentence4 = (
                "Geen urgente aandachtspunten ge\u00efdentificeerd, "
                "maar verifieer alle scores ter plaatse."
            )
        else:
            sentence4 = (
                "No urgent concerns identified, "
                "but verify all scores on-site during your viewing."
            )

    # --- Combine sentences ---
    sentences = [sentence1, sentence2]
    if sentence3:
        sentences.append(sentence3)
    sentences.append(sentence4)
    return " ".join(sentences)


def _interpret_age_distribution(age_data: AgeProfile, is_nl: bool) -> str | None:
    """Return a bilingual one-liner comparing buurt age profile to national averages.

    Returns None when no age band has data.
    """
    young = age_data.age_0_24
    working = age_data.age_25_64
    elderly = age_data.age_65_plus

    # Need at least one band to interpret
    if young is None and working is None and elderly is None:
        return None

    # Find the band with the largest deviation from national average
    deviations: list[tuple[str, float, float, float]] = []
    # (band_key, local_pct, national_pct, deviation)
    if young is not None:
        deviations.append(("young", young, NL_AGE_0_24, young - NL_AGE_0_24))
    if working is not None:
        deviations.append(("working", working, NL_AGE_25_64, working - NL_AGE_25_64))
    if elderly is not None:
        deviations.append(("elderly", elderly, NL_AGE_65_PLUS, elderly - NL_AGE_65_PLUS))

    # Pick the band with the largest absolute deviation
    best = max(deviations, key=lambda d: abs(d[3]))
    band_key, local_pct, national_pct, deviation = best

    # If the deviation is negligible (< 3pp), it's a balanced neighborhood
    if abs(deviation) < 3:
        if is_nl:
            return "Evenwichtige leeftijdsverdeling \u2014 dicht bij het landelijk gemiddelde"
        return "Balanced age distribution \u2014 close to the national average"

    local_str = f"{local_pct:.0f}%"
    national_str = f"{national_pct:.0f}%"

    if band_key == "young":
        if is_nl:
            return (
                f"Jonge buurt \u2014 {local_str} onder 25 vs landelijk {national_str}"
                if deviation > 0
                else f"Weinig jongeren \u2014 {local_str} onder 25 vs landelijk {national_str}"
            )
        return (
            f"Young neighborhood \u2014 {local_str} under 25 vs {national_str} nationally"
            if deviation > 0
            else f"Few young residents \u2014 {local_str} under 25 vs {national_str} nationally"
        )
    elif band_key == "working":
        rng = "25\u201364"
        if is_nl:
            vs = f"{local_str} is {rng} vs landelijk {national_str}"
            label = "Werkende buurt" if deviation > 0 else "Minder werkenden"
            return f"{label} \u2014 {vs}"
        vs = f"{local_str} aged {rng} vs {national_str} nationally"
        label = "Working-age area" if deviation > 0 else "Fewer working-age"
        return f"{label} \u2014 {vs}"
    else:  # elderly
        if is_nl:
            return (
                f"Vergrijsde buurt \u2014 {local_str} is 65+ vs landelijk {national_str}"
                if deviation > 0
                else f"Weinig ouderen \u2014 {local_str} is 65+ vs landelijk {national_str}"
            )
        return (
            f"Older neighborhood \u2014 {local_str} aged 65+ vs {national_str} nationally"
            if deviation > 0
            else f"Few elderly \u2014 {local_str} aged 65+ vs {national_str} nationally"
        )


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
        self.set_left_margin(20)
        self.set_right_margin(20)
        self._register_fonts()
        self.set_auto_page_break(auto=True, margin=20)

    def _register_fonts(self) -> None:
        """Register Satoshi font weights for Unicode support."""
        for style, filename in [
            ("", "Satoshi-Regular.ttf"),
            ("B", "Satoshi-Bold.ttf"),
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
            self.set_font("SatoshiMedium", "", 9)
            self.set_text_color(*SECONDARY)
            self.set_x(self.w - self.r_margin - 60)
            self.cell(60, 5, self.section_title, align="R")

        self.set_draw_color(*BORDER)
        self.set_line_width(0.1)
        self.line(self.l_margin, 15, self.w - self.r_margin, 15)

        self.set_y(18)
        self.set_text_color(*SLATE)

    def footer(self) -> None:
        """Brand + disclaimer + teal page number."""
        self.set_y(-15)
        self.set_draw_color(*BORDER)
        self.set_line_width(0.1)
        self.line(self.l_margin, self.get_y(), self.w - self.r_margin, self.get_y())

        self.set_y(-12)

        # Brand name — SatoshiBlack 8pt for stronger presence
        self.set_font("SatoshiBlack", "", 8)
        self.set_text_color(*SLATE)
        self.cell(30, 4, "buurt-check")

        # Disclaimer — Regular 8pt secondary
        self.set_font("Satoshi", "", 8)
        self.set_text_color(*SECONDARY)
        disclaimer = (
            "Data is indicatief. Verifieer op locatie."
            if self.is_nl
            else "Data is indicative. Verify on-site."
        )
        self.cell(0, 4, disclaimer, align="C")

        # Page number — teal accent
        self.set_font("Satoshi", "", 8)
        self.set_text_color(*TEAL)
        self.cell(30, 4, f"p. {self.page_no()}", align="R", new_x="LMARGIN")
        self.set_text_color(*SLATE)

    # --- Drawing primitives ---

    def draw_score_bar(
        self, x: float, y: float, width: float, score: int | None, height: float = 4.0
    ) -> None:
        """Draw horizontal score bar: gray track + colored fill + severity tick marks."""
        self.set_fill_color(*BORDER)
        self.rect(x, y, width, height, "F")
        if score is not None and score > 0:
            fill_w = max(width * min(score, 100) / 100, 1.0)
            self.set_fill_color(*_severity_color(score))
            self.rect(x, y, fill_w, height, "F")
        # Severity zone tick marks at scores 20, 40, 70
        self.set_draw_color(*SECONDARY)
        self.set_line_width(0.15)
        for threshold in (20, 40, 70):
            tick_x = x + width * threshold / 100
            self.line(tick_x, y, tick_x, y + height)
        self.set_line_width(0.1)

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
        Address rows (TEAL color, non-dashed) are sorted first with a heavier
        bar and a visual gap separating them from reference rows.
        Returns y position after the chart (including axis labels and legend).
        """
        label_w = 40
        score_w = 15
        bar_w = width - label_w - score_w - 4
        bar_h_normal = 3.0
        bar_h_address = 4.5  # heavier bar for address row
        row_h = 7.0
        address_gap = 2.5  # visual gap between address and reference rows
        bar_x = x + label_w + 2
        cur_y = y

        # Sort: address rows (TEAL, non-dashed) first, others preserve order
        address_rows = [r for r in rows if r[2] == TEAL and not r[3]]
        reference_rows = [r for r in rows if r not in address_rows]
        sorted_rows = address_rows + reference_rows
        n_address = len(address_rows)
        has_address_gap = bool(address_rows) and bool(reference_rows)

        # --- Chart title ---
        if chart_title:
            self.set_font("SatoshiMedium", "", 9)
            self.set_text_color(*SLATE)
            self.set_xy(x, cur_y)
            self.cell(width, 5, chart_title)
            cur_y += 5

        # --- Calculate total chart height for gridlines ---
        total_h = len(sorted_rows) * row_h
        if has_address_gap:
            total_h += address_gap

        bars_top = cur_y
        bars_bottom = cur_y + total_h
        self.set_draw_color(*GRIDLINE)
        self.set_line_width(0.15)
        for pct in (25, 50, 75):
            gx = bar_x + bar_w * pct / 100
            self.line(gx, bars_top, gx, bars_bottom)
        self.set_line_width(0.1)

        # --- Data rows ---
        row_y = cur_y
        for i, (label, value, color, dashed) in enumerate(sorted_rows):
            is_address = color == TEAL and not dashed
            bar_h = bar_h_address if is_address else bar_h_normal

            # Add visual gap after last address row
            if has_address_gap and i == n_address:
                row_y += address_gap

            ry = row_y

            # Bold label for address row
            if is_address:
                self.set_font("Satoshi", "B", 8)
            else:
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

            row_y += row_h

        # --- Axis labels ("0" and "100") below bars ---
        axis_y = bars_bottom + 0.5
        self.set_font("Satoshi", "", 8)
        self.set_text_color(*SECONDARY)
        self.set_xy(bar_x, axis_y)
        self.cell(10, 3, "0")
        self.set_xy(bar_x + bar_w - 10, axis_y)
        self.cell(10, 3, "100", align="R")

        # Severity zone threshold labels at 20, 40, 70
        for threshold in (20, 40, 70):
            tx = bar_x + bar_w * threshold / 100
            self.set_xy(tx - 3, axis_y)
            self.cell(6, 3, str(threshold), align="C")

        cur_y = axis_y + 3.5

        # --- Legend (first chart only) ---
        if show_legend:
            legend_y = cur_y + 1
            lx = x
            swatch_w = 5
            swatch_h = 2.0
            gap = 2

            self.set_font("Satoshi", "", 8)
            self.set_text_color(*SECONDARY)

            # Teal swatch — "Dit adres" / "This address"
            self.set_fill_color(*TEAL)
            self.rect(lx, legend_y + 0.5, swatch_w, swatch_h, "F")
            lx += swatch_w + 1
            label_text = "Dit adres" if is_nl else "This address"
            self.set_xy(lx, legend_y)
            self.cell(20, 3, label_text)
            lx += 20 + gap

            # Gray swatch — "Vergelijkingsgroep" / "Peer group" (city_avg)
            self.set_fill_color(*MUTED)
            self.rect(lx, legend_y + 0.5, swatch_w, swatch_h, "F")
            lx += swatch_w + 1
            label_text = "Vergelijkingsgroep" if is_nl else "Peer group"
            self.set_xy(lx, legend_y)
            self.cell(22, 3, label_text)
            lx += 22 + gap

            # Darker gray swatch — "Nationaal" / "National" (nl_avg)
            self.set_fill_color(*NATIONAL)
            self.rect(lx, legend_y + 0.5, swatch_w, swatch_h, "F")
            lx += swatch_w + 1
            label_text = "Nationaal" if is_nl else "National"
            self.set_xy(lx, legend_y)
            self.cell(18, 3, label_text)
            lx += 18 + gap

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

            self.set_font("SatoshiMedium", "", 9)
            self.set_text_color(*SECONDARY)
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
            self.draw_score_bar(
                cx + bar_margin, bar_y,
                cell_w - 2 * bar_margin, score,
                height=4.0,
            )

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

            self.set_font("SatoshiMedium", "", 9)
            self.set_text_color(*SECONDARY)
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
            self.set_text_color(*SLATE)
            self.set_xy(x + width - pct_w, ry)
            pct_text = f"{pct:.0f}%" if pct is not None else "\u2014"
            self.cell(pct_w, row_h, pct_text, align="R")

        self.set_text_color(*SLATE)
        return y + len(bands) * row_h

    def draw_section_label(self, text: str, *, band: bool = False) -> None:
        """Draw an uppercase section label, optionally with a light teal band."""
        if band:
            band_y = self.get_y()
            band_h = 7.0
            band_w = self.w - self.l_margin - self.r_margin
            self.set_fill_color(*TEAL_LIGHT)
            self.rect(self.l_margin, band_y, band_w, band_h, "F")
            # Draw text on top of band, vertically centered
            self.set_font("Satoshi", "B", 12)
            self.set_text_color(*SLATE)
            self.set_xy(self.l_margin + 2, band_y + 0.5)
            self.cell(band_w - 4, band_h - 1, text.upper(), new_x="LMARGIN")
            self.set_y(band_y + band_h + 1)
            self.set_fill_color(255, 255, 255)  # restore fill to white
        else:
            self.set_font("SatoshiMedium", "", 9)
            self.set_text_color(*SECONDARY)
            self.cell(0, 5, text.upper(), new_x="LMARGIN", new_y="NEXT")
        self.set_text_color(*SLATE)

    def draw_premium_badge(self) -> None:
        """Draw a small teal 'PREMIUM' pill badge at the current cursor position."""
        badge_text = "PREMIUM"
        self.set_font("SatoshiMedium", "", 7)
        text_w = self.get_string_width(badge_text)
        badge_w = text_w + 4  # 2mm padding each side
        badge_h = 4.0
        badge_x = self.w - self.r_margin - badge_w
        badge_y = self.get_y()

        # Light teal fill with teal border
        self.set_fill_color(*TEAL_LIGHT)
        self.set_draw_color(*TEAL)
        self.set_line_width(0.3)
        self.rect(badge_x, badge_y, badge_w, badge_h, "DF")
        self.set_line_width(0.1)

        # PREMIUM text in SLATE for WCAG AA contrast on TEAL_LIGHT bg
        self.set_text_color(*SLATE)
        self.set_xy(badge_x, badge_y + 0.2)
        self.cell(badge_w, badge_h - 0.4, badge_text, align="C")

        # Restore defaults
        self.set_text_color(*SLATE)
        self.set_draw_color(*BORDER)

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
        self.set_font("SatoshiMedium", "", 9)
        self.set_text_color(*SECONDARY)
        w = self.w - self.l_margin - self.r_margin
        self.cell(w * 0.6, 6, label)
        self.set_font("Satoshi", "B", 9)
        self.set_text_color(*SLATE)
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

    pdf.set_font("Satoshi", "B", 12)
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
        pdf.set_font("SatoshiMedium", "", 9)
        pdf.set_text_color(*sev_color)
        name = category.name_nl if is_nl else category.name
        pdf.cell(0, 5, name.upper(), new_x="LMARGIN", new_y="NEXT")

        pdf.set_text_color(*SLATE)
        pdf.set_font("Satoshi", "", 10)

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
                align="L", new_x="LMARGIN", new_y="NEXT",
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
        content_w = pdf.w - pdf.l_margin - pdf.r_margin
        pdf.image(io.BytesIO(image_data), x=pdf.l_margin, w=content_w, h=0)
        img_h = pdf.get_y() - img_y
        pdf.rect(pdf.l_margin, img_y, content_w, img_h, "D")
        pdf.set_font("Satoshi", "", 8)
        pdf.set_text_color(*SECONDARY)
        year = date.today().year
        caption = (
            "Schaduwopname — winterzonnewende"
            if is_nl
            else "Shadow snapshot — winter solstice"
        )
        pdf.cell(0, 4, caption, new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("Satoshi", "", 8)
        timestamp = f"{year}-12-21 12:00 CET (Europe/Amsterdam)"
        meta = (
            "Schaalbalk: 50m · Omvang: 250m straal · "
            "Legenda: Directe zon / Schaduw · Bron: 3DBAG / TU Delft + SunCalc"
            if is_nl
            else "Scale bar: 50m · Extent: 250m radius · "
            "Legend: Direct sun / Shadow · Source: 3DBAG / TU Delft + SunCalc"
        )
        pdf.multi_cell(0, 3.5, timestamp, align="L", new_x="LMARGIN", new_y="NEXT")
        pdf.multi_cell(0, 3.5, meta, align="L", new_x="LMARGIN", new_y="NEXT")
        pdf.set_text_color(*SLATE)
        pdf.ln(1)
    except Exception:
        logger.warning("Failed to embed shadow snapshot in PDF")


# Hour-to-caption mapping for shadow triptych
# December 21 is always CET (UTC+1), never CEST
_SHADOW_CAPTIONS: dict[int, dict[str, str]] = {
    9: {"en": "09:00 CET", "nl": "09:00 CET"},
    12: {"en": "12:00 CET", "nl": "12:00 CET"},
    17: {"en": "17:00 CET", "nl": "17:00 CET"},
}


def _shadow_timestamps_line(hours: list[int], is_nl: bool) -> str:
    """Build figure-level timestamp disclosure with timezone."""
    year = date.today().year
    ordered = sorted({h for h in hours if 0 <= h <= 23})
    if not ordered:
        ordered = [12]
    hour_labels = " | ".join(f"{h:02d}:00" for h in ordered)
    if is_nl:
        return f"Tijdstempels: {year}-12-21 {hour_labels} CET (Europe/Amsterdam)"
    return f"Timestamps: {year}-12-21 {hour_labels} CET (Europe/Amsterdam)"


def _shadow_meta_line(is_nl: bool) -> str:
    if is_nl:
        return (
            "Schaalbalk: 50m · Omvang: 250m straal · "
            "Legenda: Directe zon / Schaduw · Bron: 3DBAG / TU Delft + SunCalc"
        )
    return (
        "Scale bar: 50m · Extent: 250m radius · "
        "Legend: Direct sun / Shadow · Source: 3DBAG / TU Delft + SunCalc"
    )


def _draw_shadow_triptych(
    pdf: BuurtCheckPDF,
    shadow_images: list[dict],
    is_nl: bool,
) -> None:
    """Draw 3 shadow snapshots side by side with captions including timezone.

    Each dict has keys: hour (int), label (str), image_b64 (str).
    Falls back to single-image layout if fewer than 3 images.
    """
    if not shadow_images:
        return

    # If fewer than 3 images, fall back to first image as single
    if len(shadow_images) < 3:
        first = shadow_images[0]
        _draw_shadow_image(pdf, first.get("image_b64"), is_nl)
        return

    # Sort by hour to ensure morning/noon/evening order
    sorted_imgs = sorted(shadow_images[:3], key=lambda s: s.get("hour", 0))

    page_w = pdf.w - pdf.l_margin - pdf.r_margin  # ~170mm
    gap = 3.0  # mm between images
    img_w = (page_w - 2 * gap) / 3  # ~54.7mm each
    # Aspect ratio 16:9 -> height = width * 9/16
    img_h = img_w * 9 / 16

    # Section label with premium badge
    pdf.draw_premium_badge()
    pdf.draw_section_label(
        "Schaduwanalyse \u2014 winterzonnewende"
        if is_nl
        else "Shadow Analysis \u2014 winter solstice"
    )
    pdf.ln(1)

    start_y = pdf.get_y()
    lang = "nl" if is_nl else "en"
    rendered_count = 0
    rendered_hours: list[int] = []

    for i, img_data in enumerate(sorted_imgs):
        hour = img_data.get("hour", 0)
        b64 = img_data.get("image_b64", "")
        if not b64:
            continue

        try:
            image_bytes = base64.b64decode(b64)
        except Exception:
            logger.warning("Failed to decode shadow image %d", i)
            continue

        x = pdf.l_margin + i * (img_w + gap)

        # Draw image
        try:
            pdf.image(
                io.BytesIO(image_bytes),
                x=x, y=start_y, w=img_w, h=img_h,
            )
        except Exception:
            logger.warning("Failed to embed shadow image %d in PDF", i)
            continue

        # Border
        pdf.set_draw_color(*BORDER)
        pdf.set_line_width(0.2)
        pdf.rect(x, start_y, img_w, img_h, "D")

        # Caption below image
        caption = _SHADOW_CAPTIONS.get(hour, {}).get(lang, f"{hour:02d}:00 CET")
        pdf.set_font("Satoshi", "", 8)
        pdf.set_text_color(*SECONDARY)
        pdf.set_xy(x, start_y + img_h + 0.5)
        pdf.cell(img_w, 3, caption, align="C")

        rendered_count += 1
        rendered_hours.append(hour)

    if rendered_count > 0:
        pdf.set_y(start_y + img_h + 4.5)
        pdf.set_font("Satoshi", "", 8)
        pdf.set_text_color(*SECONDARY)
        pdf.multi_cell(
            0, 3.5,
            _shadow_timestamps_line(rendered_hours, is_nl),
            align="L", new_x="LMARGIN", new_y="NEXT",
        )
        pdf.multi_cell(
            0, 3.5,
            _shadow_meta_line(is_nl),
            align="L", new_x="LMARGIN", new_y="NEXT",
        )
        pdf.set_text_color(*SLATE)
        pdf.ln(1)
    else:
        # All images failed — reset cursor
        pdf.set_y(start_y)


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
    pdf.multi_cell(0, 7, address, align="L", new_x="LMARGIN", new_y="NEXT")

    facts_parts: list[str] = []
    if building_year:
        facts_parts.append(f"{'Bouwjaar' if is_nl else 'Built'} {building_year}")
    if building_use:
        facts_parts.append(building_use)
    if floor_area:
        facts_parts.append(f"{floor_area} m\u00b2")
    if facts_parts:
        pdf.set_font("SatoshiMedium", "", 9)
        pdf.set_text_color(*SECONDARY)
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
        pdf.set_font("Satoshi", "", 8)
        pdf.set_text_color(*SECONDARY)
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
    location_map_b64: str | None = None,
    livability: LivabilityResponse | None = None,
    shadow_images: list[dict] | None = None,
) -> bytes:
    """Generate 5+ page Full Dossier with Polar Frost branding."""
    is_nl = language == "nl"
    pdf = BuurtCheckPDF(language=language)

    # PDF metadata
    pdf.set_title(address)
    pdf.set_author("buurt-check")
    subject = (
        f"Vastgoedrisico Dossier - {address}"
        if is_nl
        else f"Property Risk Dossier - {address}"
    )
    pdf.set_subject(subject)
    today = date.today().isoformat()
    report_id = provenance.report_id if provenance and provenance.report_id else ""
    keywords = f"buurt-check, {today}, {report_id}".rstrip(", ")
    pdf.set_keywords(keywords)

    # Page 1: Cover + Summary
    pdf.section_title = "VOLLEDIG DOSSIER" if is_nl else "PROPERTY INTELLIGENCE DOSSIER"
    pdf.add_page()
    _draw_cover_page(
        pdf, address, building_year, building_use, floor_area,
        risks, sunlight_score, shadow_image_b64, is_nl,
        location_map_b64=location_map_b64,
        shadow_images=shadow_images,
        livability=livability,
    )

    # Page 2: Risk Details
    pdf.section_title = "RISICODETAILS" if is_nl else "RISK DETAILS"
    pdf.add_page()
    _draw_risk_details_page(pdf, address, risks, sunlight_score, risk_comparisons, is_nl)

    # Page 3: Neighborhood Intelligence
    pdf.section_title = "BUURT" if is_nl else "NEIGHBORHOOD"
    pdf.add_page()
    _draw_neighborhood_page(pdf, neighborhood_stats, tier_b, is_nl, livability=livability)

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
        shadow_images=shadow_images,
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


def _draw_location_map(
    pdf: BuurtCheckPDF,
    location_map_b64: str | None,
    is_nl: bool,
) -> None:
    """Embed a static PDOK BRT location map with pin, compass, and scale."""
    if not location_map_b64:
        return
    try:
        image_data = base64.b64decode(location_map_b64)
        img_w = 80  # mm width in PDF
        img_h = img_w  # square map (600x600 source)

        # Section label
        pdf.draw_section_label("Locatie" if is_nl else "Location")
        pdf.ln(1)

        # Draw the map image
        pdf.set_draw_color(*BORDER)
        pdf.set_line_width(0.2)
        img_y = pdf.get_y()
        pdf.image(
            io.BytesIO(image_data),
            x=pdf.l_margin, w=img_w, h=img_h,
        )
        pdf.rect(pdf.l_margin, img_y, img_w, img_h, "D")

        # Red pin marker at center
        cx = pdf.l_margin + img_w / 2
        cy_pin = img_y + img_h / 2
        pdf.set_fill_color(239, 68, 68)  # red
        pdf.ellipse(cx - 1.5, cy_pin - 1.5, 3, 3, "F")
        pdf.set_fill_color(255, 255, 255)
        pdf.ellipse(cx - 0.7, cy_pin - 0.7, 1.4, 1.4, "F")

        # North arrow (top-right of map)
        nx = pdf.l_margin + img_w - 5
        ny = img_y + 3
        pdf.set_font("Satoshi", "B", 8)
        pdf.set_text_color(*SLATE)
        pdf.set_xy(nx, ny)
        pdf.cell(5, 3, "N", align="C")
        # Arrow line
        pdf.set_draw_color(*SLATE)
        pdf.set_line_width(0.3)
        pdf.line(nx + 2.5, ny + 3, nx + 2.5, ny + 8)
        # Arrow head
        pdf.line(nx + 2.5, ny + 3, nx + 1.5, ny + 5)
        pdf.line(nx + 2.5, ny + 3, nx + 3.5, ny + 5)
        pdf.set_line_width(0.1)

        # Scale bar (bottom-left of map)
        # Map is 1000m wide displayed at img_w mm
        # So 100m = img_w / 10 mm
        scale_mm = img_w / 10  # 100m
        sx = pdf.l_margin + 3
        sy = img_y + img_h - 5
        pdf.set_draw_color(*SLATE)
        pdf.set_line_width(0.4)
        pdf.line(sx, sy, sx + scale_mm, sy)
        # End caps
        pdf.line(sx, sy - 1, sx, sy + 1)
        pdf.line(sx + scale_mm, sy - 1, sx + scale_mm, sy + 1)
        pdf.set_line_width(0.1)
        pdf.set_font("Satoshi", "", 8)
        pdf.set_xy(sx, sy + 1)
        pdf.cell(scale_mm, 3, "100 m", align="C")

        # Attribution
        pdf.set_y(img_y + img_h + 1)
        pdf.set_font("Satoshi", "", 8)
        pdf.set_text_color(*SECONDARY)
        attr_text = (
            "Kaart: PDOK BRT Achtergrondkaart"
            if is_nl
            else "Map: PDOK BRT Background Map"
        )
        pdf.cell(
            0, 3, attr_text,
            new_x="LMARGIN", new_y="NEXT",
        )
        pdf.set_text_color(*SLATE)
        pdf.ln(2)
    except Exception:
        logger.warning("Failed to embed location map in PDF")


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
    location_map_b64: str | None = None,
    shadow_images: list[dict] | None = None,
    livability: LivabilityResponse | None = None,
) -> None:
    """Page 1: cover with address hero, shadow image, executive summary, risk grid."""
    # Cover wordmark — larger brand presence
    pdf.set_font("SatoshiBlack", "", 16)
    pdf.set_text_color(*SLATE)
    pdf.cell(0, 8, "buurt-check", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(2)

    _draw_address_block(pdf, address, building_year, building_use, floor_area, is_nl, font_size=20)
    # Prefer triptych (3 images) over single shadow image
    if shadow_images and len(shadow_images) >= 3:
        _draw_shadow_triptych(pdf, shadow_images, is_nl)
    else:
        _draw_shadow_image(pdf, shadow_image_b64, is_nl)

    # Executive summary narrative
    summary_text = _generate_executive_summary(risks, sunlight_score, livability, is_nl)
    pdf.draw_section_label(
        "Samenvatting" if is_nl else "Executive Summary", band=True,
    )
    pdf.set_font("Satoshi", "", 10)
    pdf.set_text_color(*SLATE)
    pdf.multi_cell(
        pdf.w - pdf.l_margin - pdf.r_margin, 5, summary_text,
        align="L", new_x="LMARGIN", new_y="NEXT",
    )
    pdf.ln(3)

    # Risk summary strip (4-column)
    pdf.draw_section_label(
        "Risico-overzicht" if is_nl else "Risk Summary", band=True,
    )
    cells = _build_risk_cells(risks, sunlight_score, is_nl)
    grid_end_y = pdf.draw_risk_grid(
        x=pdf.l_margin, y=pdf.get_y(),
        width=pdf.w - pdf.l_margin - pdf.r_margin,
        cells=cells, cols=4,
    )
    pdf.set_y(grid_end_y + 4)

    # Location map
    _draw_location_map(pdf, location_map_b64, is_nl)

    # Prepared date
    pdf.set_font("SatoshiMedium", "", 9)
    pdf.set_text_color(*SECONDARY)
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
    pdf.set_text_color(*SECONDARY)
    pdf.cell(0, 5, address, new_x="LMARGIN", new_y="NEXT")
    pdf.set_text_color(*SLATE)
    pdf.ln(2)

    categories = _build_risk_detail_data(risks, sunlight_score, comparisons, is_nl)
    first_chart_drawn = False

    for (
        cat_name, score, summary, source_text,
        comp_rows, measurements, unit_def,
    ) in categories:
        color = _severity_color(score)

        # Prevent orphaned category: if <80mm left, break
        est_h = 80  # mm approx per risk category
        remaining = pdf.h - pdf.get_y() - 20
        if remaining < est_h and pdf.get_y() > 40:
            pdf.add_page()
            # Re-print address context on continuation
            pdf.set_font("Satoshi", "B", 10)
            pdf.set_text_color(*SECONDARY)
            pdf.cell(
                0, 5, address,
                new_x="LMARGIN", new_y="NEXT",
            )
            pdf.set_text_color(*SLATE)
            pdf.ln(2)

        # Left teal accent + category name + score
        cy = pdf.get_y()
        pdf.set_fill_color(*TEAL)
        pdf.rect(pdf.l_margin, cy, 1.5, 8, "F")

        pdf.set_x(pdf.l_margin + 4)
        pdf.set_font("Satoshi", "B", 12)
        pdf.set_text_color(*SLATE)
        pdf.cell(100, 8, cat_name)

        pdf.set_font("SatoshiBlack", "", 14)
        pdf.set_text_color(*color)
        score_text = str(score) if score is not None else "\u2014"
        pdf.cell(
            0, 8, score_text, align="R",
            new_x="LMARGIN", new_y="NEXT",
        )

        # Score bar
        bar_w = pdf.w - pdf.l_margin - pdf.r_margin
        pdf.draw_score_bar(
            pdf.l_margin, pdf.get_y(), bar_w, score,
            height=5.0,
        )
        pdf.ln(7)

        # Severity label
        pdf.set_font("SatoshiMedium", "", 9)
        pdf.set_text_color(*color)
        pdf.cell(
            0, 4, _severity_label(score, is_nl),
            new_x="LMARGIN", new_y="NEXT",
        )
        pdf.set_text_color(*SLATE)
        pdf.ln(1)

        # What this means
        if summary:
            pdf.set_font("Satoshi", "", 10)
            pdf.multi_cell(
                0, 5, summary, align="L",
                new_x="LMARGIN", new_y="NEXT",
            )
            pdf.ln(2)

        # Measurement factsheet (E4-S3)
        if measurements:
            pdf.set_font("SatoshiMedium", "", 9)
            pdf.set_text_color(*SECONDARY)
            m_label = (
                "MEETWAARDEN" if is_nl else "MEASUREMENTS"
            )
            pdf.cell(
                0, 5, m_label,
                new_x="LMARGIN", new_y="NEXT",
            )
            pdf.set_font("SatoshiMedium", "", 9)
            pdf.set_text_color(*SECONDARY)
            for meas_label, meas_value in measurements:
                pdf.cell(50, 5, meas_label)
                pdf.set_font("Satoshi", "B", 9)
                pdf.set_text_color(*SLATE)
                pdf.cell(
                    0, 5, meas_value,
                    new_x="LMARGIN", new_y="NEXT",
                )
                pdf.set_font("SatoshiMedium", "", 9)
                pdf.set_text_color(*SECONDARY)
            pdf.ln(2)

        # Unit definition (E6-S5)
        if unit_def:
            pdf.set_font("Satoshi", "", 8)
            pdf.set_text_color(*SECONDARY)
            pdf.cell(
                0, 3, unit_def,
                new_x="LMARGIN", new_y="NEXT",
            )
            pdf.set_text_color(*SLATE)
            pdf.ln(1)

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
            pdf.set_font("Satoshi", "", 8)
            pdf.set_text_color(*SECONDARY)
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
        pdf.set_text_color(*SECONDARY)
        pdf.cell(0, 4, source_text, new_x="LMARGIN", new_y="NEXT")
        pdf.set_text_color(*SLATE)
        pdf.ln(4)

        # Sunlight-specific visualizations (E2-S3 + E2-S4)
        if cat_name in ("Zonlicht", "Sunlight") and risks:
            _draw_sunlight_details(pdf, risks, is_nl)


def _draw_sunlight_details(
    pdf: BuurtCheckPDF,
    risks: RiskCardsResponse,
    is_nl: bool,
) -> None:
    """Draw sunlight seasonal chart, SVF gauge, and facade table (E2-S3 + E2-S4)."""
    sun = risks.sunlight
    if not sun:
        return

    content_w = pdf.w - pdf.l_margin - pdf.r_margin

    # --- Seasonal hours chart (E2-S3) ---
    has_seasonal = (
        sun.winter_hours is not None or sun.summer_hours is not None
    )
    if has_seasonal:
        # Page overflow guard: need ~40mm for seasonal chart
        remaining = pdf.h - pdf.get_y() - 20
        if remaining < 40 and pdf.get_y() > 40:
            pdf.add_page()

        # Section label
        pdf.set_font("SatoshiMedium", "", 9)
        pdf.set_text_color(*SECONDARY)
        label = "ZONNE-UREN PER SEIZOEN" if is_nl else "SEASONAL SUNLIGHT HOURS"
        pdf.cell(0, 5, label, new_x="LMARGIN", new_y="NEXT")
        pdf.ln(1)

        # Build season rows: (label, hours)
        max_hours = 8.0  # scale reference
        bar_area_w = content_w - 55  # leave space for label + value
        seasons: list[tuple[str, float | None]] = []
        if sun.winter_hours is not None:
            seasons.append((
                "Winter" if is_nl else "Winter",
                sun.winter_hours,
            ))
        if sun.equinox_hours is not None:
            seasons.append((
                "Equinox" if is_nl else "Equinox",
                sun.equinox_hours,
            ))
        elif sun.winter_hours is not None and sun.summer_hours is not None:
            # Estimate equinox as midpoint
            avg = (sun.winter_hours + sun.summer_hours) / 2
            seasons.append(("Equinox", avg))
        if sun.summer_hours is not None:
            seasons.append((
                "Zomer" if is_nl else "Summer",
                sun.summer_hours,
            ))

        for season_label, hours in seasons:
            if hours is None:
                continue
            row_y = pdf.get_y()

            # Season label (Medium 9pt SECONDARY)
            pdf.set_font("SatoshiMedium", "", 9)
            pdf.set_text_color(*SECONDARY)
            pdf.set_xy(pdf.l_margin, row_y)
            pdf.cell(30, 6, season_label)

            # Teal bar
            bar_x = pdf.l_margin + 32
            bar_y = row_y + 1.5
            bar_h = 3.0
            fill_w = max(bar_area_w * min(hours, max_hours) / max_hours, 1.0)

            # Track background
            pdf.set_fill_color(*BORDER)
            pdf.rect(bar_x, bar_y, bar_area_w, bar_h, "F")
            # Teal fill
            pdf.set_fill_color(*TEAL)
            pdf.rect(bar_x, bar_y, fill_w, bar_h, "F")

            # Hours value (Bold 9pt SLATE)
            pdf.set_font("Satoshi", "B", 9)
            pdf.set_text_color(*SLATE)
            unit = "u" if is_nl else "h"
            val = format_number(hours, 1, is_nl)
            pdf.set_xy(bar_x + bar_area_w + 2, row_y)
            pdf.cell(20, 6, f"{val}{unit}")

            pdf.set_y(row_y + 7)

        pdf.ln(2)

    # --- SVF gauge (E2-S3) ---
    svf = sun.svf_anisotropic if sun.svf_anisotropic is not None else sun.svf_percent
    if svf is not None:
        # Page overflow guard: need ~25mm for SVF gauge
        remaining = pdf.h - pdf.get_y() - 20
        if remaining < 25 and pdf.get_y() > 40:
            pdf.add_page()

        # Section label
        pdf.set_font("SatoshiMedium", "", 9)
        pdf.set_text_color(*SECONDARY)
        label = "HEMELZICHTFACTOR (SVF)" if is_nl else "SKY VIEW FACTOR (SVF)"
        pdf.cell(0, 5, label, new_x="LMARGIN", new_y="NEXT")
        pdf.ln(1)

        # Gauge bar
        gauge_y = pdf.get_y()
        bar_h = 4.0
        pdf.set_fill_color(*BORDER)
        pdf.rect(pdf.l_margin, gauge_y, content_w, bar_h, "F")

        svf_clamped = max(0.0, min(svf, 100.0))
        fill_w = max(content_w * svf_clamped / 100, 1.0)
        pdf.set_fill_color(*TEAL)
        pdf.rect(pdf.l_margin, gauge_y, fill_w, bar_h, "F")

        # Threshold tick marks at 30% and 60%
        pdf.set_draw_color(*SECONDARY)
        pdf.set_line_width(0.15)
        for threshold in (30, 60):
            tick_x = pdf.l_margin + content_w * threshold / 100
            pdf.line(tick_x, gauge_y, tick_x, gauge_y + bar_h)
        pdf.set_line_width(0.1)

        pdf.set_y(gauge_y + bar_h + 1)

        # SVF value + interpretation
        val_text = format_number(svf, 0, is_nl)
        if svf >= 60:
            interp = "Zeer open" if is_nl else "Highly open"
        elif svf >= 30:
            interp = "Gemiddeld" if is_nl else "Moderate"
        else:
            interp = "Besloten" if is_nl else "Enclosed"

        pdf.set_font("Satoshi", "B", 9)
        pdf.set_text_color(*SLATE)
        pdf.cell(20, 5, f"{val_text}%")
        pdf.set_font("Satoshi", "", 10)
        pdf.cell(0, 5, f"\u2014 {interp}", new_x="LMARGIN", new_y="NEXT")

        pdf.ln(3)

    # --- Facade orientation table (E2-S4) ---
    if sun.facade_results:
        # Page overflow guard: need ~50mm for facade table
        n_rows = len(sun.facade_results)
        est_table_h = 10 + n_rows * 6 + 12  # header + rows + interpretation
        remaining = pdf.h - pdf.get_y() - 20
        if remaining < est_table_h and pdf.get_y() > 40:
            pdf.add_page()

        # Section label
        pdf.set_font("SatoshiMedium", "", 9)
        pdf.set_text_color(*SECONDARY)
        label = "GEVELANALYSE" if is_nl else "FACADE ANALYSIS"
        pdf.cell(0, 5, label, new_x="LMARGIN", new_y="NEXT")
        pdf.ln(1)

        # Orientation label mapping
        _ORI_LABELS_NL = {
            "n": "Noord", "north": "Noord",
            "e": "Oost", "east": "Oost",
            "s": "Zuid", "south": "Zuid",
            "w": "West", "west": "West",
            "ne": "NO", "northeast": "NO",
            "nw": "NW", "northwest": "NW",
            "se": "ZO", "southeast": "ZO",
            "sw": "ZW", "southwest": "ZW",
        }
        _ORI_LABELS_EN = {
            "n": "North", "north": "North",
            "e": "East", "east": "East",
            "s": "South", "south": "South",
            "w": "West", "west": "West",
            "ne": "NE", "northeast": "NE",
            "nw": "NW", "northwest": "NW",
            "se": "SE", "southeast": "SE",
            "sw": "SW", "southwest": "SW",
        }

        ori_map = _ORI_LABELS_NL if is_nl else _ORI_LABELS_EN

        # Column widths
        col_facade = 35
        col_winter = 30
        col_summer = 30
        row_h = 6

        # Table header (Bold 9pt SLATE)
        pdf.set_font("Satoshi", "B", 9)
        pdf.set_text_color(*SLATE)
        header_y = pdf.get_y()
        pdf.set_xy(pdf.l_margin, header_y)
        pdf.cell(col_facade, row_h, "Gevel" if is_nl else "Facade")
        pdf.cell(col_winter, row_h, "Winter")
        pdf.cell(col_summer, row_h, "Zomer" if is_nl else "Summer")
        pdf.set_y(header_y + row_h)

        # Header underline
        pdf.set_draw_color(*BORDER)
        pdf.line(
            pdf.l_margin, pdf.get_y(),
            pdf.l_margin + col_facade + col_winter + col_summer,
            pdf.get_y(),
        )
        pdf.ln(0.5)

        # Data rows
        unit = "u" if is_nl else "h"
        best_facade = ""
        best_winter = -1.0

        for fr in sun.facade_results:
            row_y = pdf.get_y()
            ori_key = fr.orientation.lower().strip()
            ori_label = ori_map.get(ori_key, fr.orientation.capitalize())

            # Facade name (Medium 9pt SECONDARY)
            pdf.set_font("SatoshiMedium", "", 9)
            pdf.set_text_color(*SECONDARY)
            pdf.set_xy(pdf.l_margin, row_y)
            pdf.cell(col_facade, row_h, ori_label)

            # Winter hours (Bold 9pt SLATE)
            pdf.set_font("Satoshi", "B", 9)
            pdf.set_text_color(*SLATE)
            w_val = format_number(fr.winter_hours, 1, is_nl)
            pdf.cell(col_winter, row_h, f"{w_val}{unit}")

            # Summer hours
            s_val = format_number(fr.summer_hours, 1, is_nl)
            pdf.cell(col_summer, row_h, f"{s_val}{unit}")

            pdf.set_y(row_y + row_h)

            # Track best winter facade
            if fr.winter_hours > best_winter:
                best_winter = fr.winter_hours
                best_facade = ori_label

        pdf.ln(2)

        # Interpretation line (Regular 10pt SLATE)
        if best_facade and best_winter > 0:
            pdf.set_font("Satoshi", "", 10)
            pdf.set_text_color(*SLATE)
            if is_nl:
                interp = (
                    f"{best_facade}gevel ontvangt het meeste "
                    f"winterzonlicht ({format_number(best_winter, 1, is_nl)}u/dag)"
                )
            else:
                interp = (
                    f"{best_facade} facade receives the most "
                    f"winter sunlight ({format_number(best_winter, 1, is_nl)}h/day)"
                )
            pdf.multi_cell(
                0, 5, interp, align="L",
                new_x="LMARGIN", new_y="NEXT",
            )

        pdf.ln(3)


def _risk_level_label(level: str, is_nl: bool) -> str:
    """Translate RiskLevel value to human-readable label."""
    _LABELS = {
        "low": ("Laag", "Low"),
        "medium": ("Gemiddeld", "Medium"),
        "high": ("Hoog", "High"),
        "unavailable": ("Onbekend", "Unknown"),
    }
    nl, en = _LABELS.get(level, ("Onbekend", "Unknown"))
    return nl if is_nl else en


_UNIT_DEFINITIONS: dict[str, dict[str, str]] = {
    "noise": {
        "nl": "Lden = dag-avond-nacht gewogen geluidsniveau (wegverkeer)",
        "en": "Lden = day-evening-night weighted noise level (road traffic)",
    },
    "air_quality": {
        "nl": (
            "PM2.5 = fijn stof, "
            "NO\u2082 = stikstofdioxide (jaargemiddelde)"
        ),
        "en": (
            "PM2.5 = fine particulate matter, "
            "NO\u2082 = nitrogen dioxide (annual mean)"
        ),
    },
    "climate_stress": {
        "nl": "Op basis van hitte- en wateroverlastmodellen",
        "en": "Based on heat stress and water nuisance models",
    },
}


def _build_risk_detail_data(
    risks: RiskCardsResponse | None,
    sunlight_score: int | None,
    comparisons: RiskComparisonsResponse | None,
    is_nl: bool,
) -> list[tuple[
    str, int | None, str, str, list,
    list[tuple[str, str]] | None,
    str | None,
]]:
    """Build structured data for risk details page.

    Returns list of 7-tuples:
        (cat_name, score, summary, source_text, comp_rows,
         measurements, unit_definition)
    """
    result: list[tuple[
        str, int | None, str, str, list,
        list[tuple[str, str]] | None,
        str | None,
    ]] = []

    _COMPARISON_LABELS = {
        "address": (
            "Dit adres" if is_nl else "This address",
            TEAL, False,
        ),
        "city_avg": (
            "Vergelijkingswaarde (stedelijkheid)" if is_nl
            else "Peer baseline (urbanization)", MUTED, False,
        ),
        "nl_avg": (
            "Nederland" if is_nl else "Netherlands",
            NATIONAL, False,
        ),
        "who_limit": (
            "WHO-doel (op scoreschaal)" if is_nl
            else "WHO benchmark (mapped to score)",
            AMBER_WARN, True,
        ),
        "adaptation_target": (
            "Doelstelling (op scoreschaal)" if is_nl
            else "Target (mapped to score)", AMBER_WARN, True,
        ),
        "daylight_target": (
            "Daglichtdoel (op scoreschaal)" if is_nl
            else "Daylight target (mapped to score)",
            AMBER_WARN, True,
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
            is_dashed = (
                row.pattern == ComparisonPattern.dashed
                or label_info[2]
            )
            rows.append((
                label_info[0], row.value,
                label_info[1], is_dashed,
            ))
        return rows

    def _build_measurements(
        attr: str,
    ) -> list[tuple[str, str]] | None:
        """Build measurement (label, value) pairs per category."""
        if not risks:
            return None
        card = getattr(risks, attr)
        meas: list[tuple[str, str]] = []
        if attr == "noise":
            if card.lden_db is not None:
                val = format_number(card.lden_db, 1, is_nl)
                meas.append(("Lden", f"{val} dB"))
        elif attr == "air_quality":
            if card.pm25_ug_m3 is not None:
                val = format_number(card.pm25_ug_m3, 1, is_nl)
                meas.append(("PM2.5", f"{val} \u00b5g/m\u00b3"))
            if card.no2_ug_m3 is not None:
                val = format_number(card.no2_ug_m3, 1, is_nl)
                meas.append((
                    "NO\u2082", f"{val} \u00b5g/m\u00b3",
                ))
        elif attr == "climate_stress":
            if card.heat_level is not None:
                label = "Hitte" if is_nl else "Heat"
                meas.append((
                    label,
                    _risk_level_label(card.heat_level.value, is_nl),
                ))
            if card.water_level is not None:
                label = (
                    "Wateroverlast" if is_nl else "Water nuisance"
                )
                meas.append((
                    label,
                    _risk_level_label(
                        card.water_level.value, is_nl,
                    ),
                ))
        return meas if meas else None

    date_unknown = (
        "Brondatum onbekend" if is_nl
        else "Dataset date unknown"
    )

    if risks:
        for attr, name_en, name_nl, comp_attr in [
            ("noise", "Noise", "Geluid", "noise"),
            (
                "air_quality", "Air Quality",
                "Luchtkwaliteit", "air_quality",
            ),
            (
                "climate_stress", "Climate Stress",
                "Klimaatstress", "climate_stress",
            ),
        ]:
            card = getattr(risks, attr)
            summary = (
                (card.summary_nl if is_nl else card.summary) or ""
            )
            src_label = "Bron" if is_nl else "Source"
            source = f"{src_label}: {card.source}"
            if card.source_date:
                source += f" \u00b7 {card.source_date}"
            else:
                source += f" \u00b7 {date_unknown}"

            # Climate: enrich with layer names + scenario (E6-S4)
            if attr == "climate_stress":
                layers = [
                    lyr for lyr in [
                        getattr(card, "heat_layer", None),
                        getattr(card, "water_layer", None),
                    ] if lyr
                ]
                if layers:
                    layer_txt = ", ".join(layers)
                    lbl = "Lagen" if is_nl else "Layers"
                    source += f" \u00b7 {lbl}: {layer_txt}"
                scenario = (
                    "Huidig klimaat" if is_nl
                    else "Current climate conditions"
                )
                source += f" \u00b7 {scenario}"

            comp = _comp_rows(
                getattr(comparisons, comp_attr, None)
                if comparisons else None
            )
            measurements = _build_measurements(attr)
            lang_key = "nl" if is_nl else "en"
            unit_def = _UNIT_DEFINITIONS.get(attr, {}).get(
                lang_key
            )
            result.append((
                name_nl if is_nl else name_en,
                card.score, summary, source, comp,
                measurements, unit_def,
            ))
    else:
        # Show placeholder entries when risks unavailable
        for name_en, name_nl in [
            ("Noise", "Geluid"),
            ("Air Quality", "Luchtkwaliteit"),
            ("Climate Stress", "Klimaatstress"),
        ]:
            src_label = "Bron" if is_nl else "Source"
            result.append((
                name_nl if is_nl else name_en, None, "",
                f"{src_label}: \u2014", [], None, None,
            ))

    # Sunlight
    sun_summary = ""
    sun_measurements: list[tuple[str, str]] | None = None
    if risks and risks.sunlight:
        sun_summary = (
            (risks.sunlight.summary_nl if is_nl
             else risks.sunlight.summary) or ""
        )
        sun_meas: list[tuple[str, str]] = []
        sun = risks.sunlight
        if sun.winter_hours is not None:
            unit = "u/dag" if is_nl else "h/day"
            val = format_number(sun.winter_hours, 1, is_nl)
            sun_meas.append(("Winter", f"{val} {unit}"))
        if sun.annual_average is not None:
            unit = "u/dag" if is_nl else "h/day"
            label = "Jaargemiddelde" if is_nl else "Annual average"
            val = format_number(sun.annual_average, 1, is_nl)
            sun_meas.append((label, f"{val} {unit}"))
        if sun.svf_percent is not None:
            val = format_number(sun.svf_percent, 0, is_nl)
            sun_meas.append(("SVF", f"{val}%"))
        if (
            sun.svf_anisotropic is not None
            and sun.svf_anisotropic != sun.svf_percent
        ):
            label = "SVF (anisotropisch)" if is_nl else "SVF (anisotropic)"
            val = format_number(sun.svf_anisotropic, 0, is_nl)
            sun_meas.append((label, f"{val}%"))
        if sun.irradiance_kwh_m2 is not None:
            label = "Zonnestraling" if is_nl else "Solar irradiance"
            unit = "kWh/m\u00b2/jaar" if is_nl else "kWh/m\u00b2/year"
            val = format_number(sun.irradiance_kwh_m2, 0, is_nl)
            sun_meas.append((label, f"{val} {unit}"))
        if sun_meas:
            sun_measurements = sun_meas
    sun_comp = _comp_rows(
        comparisons.sunlight if comparisons else None,
    )
    src_label = "Bron" if is_nl else "Source"
    result.append((
        "Zonlicht" if is_nl else "Sunlight",
        sunlight_score,
        sun_summary,
        f"{src_label}: SunCalc + 3DBAG",
        sun_comp,
        sun_measurements,
        None,
    ))

    return result


def _draw_neighborhood_page(
    pdf: BuurtCheckPDF,
    stats: NeighborhoodStats | None,
    tier_b_data: TierBResponse | None,
    is_nl: bool,
    *,
    livability: LivabilityResponse | None = None,
) -> None:
    """Page 3: neighborhood stats + crime + livability."""
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
            pdf.set_text_color(*SECONDARY)
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
            # Age interpretation one-liner
            interp = _interpret_age_distribution(stats.age_profile, is_nl)
            if interp:
                pdf.set_font("Satoshi", "", 8)
                pdf.set_text_color(*SECONDARY)
                pdf.cell(
                    pdf.w - pdf.l_margin - pdf.r_margin, 5, interp,
                    new_x="LMARGIN", new_y="NEXT",
                )
                pdf.set_text_color(*SLATE)
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

        # CBS source + quartile legend
        pdf.ln(2)
        pdf.set_font("Satoshi", "", 8)
        pdf.set_text_color(*SECONDARY)
        pdf.cell(
            0, 4,
            "Bron: CBS Wijken & Buurten 2024" if is_nl else "Source: CBS Wijken & Buurten 2024",
            new_x="LMARGIN", new_y="NEXT",
        )
        quartile_legend = (
            "Q1 = laagste 25% landelijk, Q4 = hoogste 25%"
            if is_nl
            else "Q1 = bottom 25% nationally, Q4 = top 25%"
        )
        pdf.cell(0, 4, quartile_legend, new_x="LMARGIN", new_y="NEXT")
        pdf.set_text_color(*SLATE)
    else:
        pdf.set_font("Satoshi", "", 10)
        pdf.set_text_color(*SECONDARY)
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
            score = crime.score
            color = _severity_color(score)
            cat_name = "Criminaliteit" if is_nl else "Crime Rate"

            # Teal accent bar + category name + score badge
            cy = pdf.get_y()
            pdf.set_fill_color(*TEAL)
            pdf.rect(pdf.l_margin, cy, 1.5, 8, "F")

            pdf.set_x(pdf.l_margin + 4)
            pdf.set_font("Satoshi", "B", 12)
            pdf.set_text_color(*SLATE)
            pdf.cell(100, 8, cat_name)

            pdf.set_font("SatoshiBlack", "", 14)
            pdf.set_text_color(*color)
            score_text = str(score) if score is not None else "\u2014"
            pdf.cell(0, 8, score_text, align="R", new_x="LMARGIN", new_y="NEXT")

            # Score bar
            bar_w = pdf.w - pdf.l_margin - pdf.r_margin
            pdf.draw_score_bar(pdf.l_margin, pdf.get_y(), bar_w, score, height=5.0)
            pdf.ln(3)

            # Severity label
            pdf.set_font("SatoshiMedium", "", 9)
            pdf.set_text_color(*color)
            pdf.cell(
                0, 4, _severity_label(score, is_nl),
                new_x="LMARGIN", new_y="NEXT",
            )
            pdf.set_text_color(*SLATE)
            pdf.ln(1)

            # Meaning sentence
            meaning = (crime.meaning_nl if is_nl else crime.meaning_en)
            if meaning:
                pdf.set_font("Satoshi", "", 10)
                pdf.multi_cell(0, 5, meaning, align="L", new_x="LMARGIN", new_y="NEXT")
                pdf.ln(2)

            # Comparison: this address vs national average
            if crime.national_per_1000 is not None:
                per_label = "per 1.000" if is_nl else "per 1,000"
                addr_label = (
                    f"{'Dit adres' if is_nl else 'This address'}"
                    f": {format_number(crime.total_per_1000, 1, is_nl)} {per_label}"
                )
                nat_label = (
                    f"{'Landelijk' if is_nl else 'National avg'}"
                    f": {format_number(crime.national_per_1000, 1, is_nl)} {per_label}"
                )
                # Normalise rates to bar widths (higher rate = longer bar)
                max_rate = max(crime.total_per_1000, crime.national_per_1000, 1.0)
                addr_pct = int(crime.total_per_1000 / max_rate * 100)
                nat_pct = int(crime.national_per_1000 / max_rate * 100)
                comp_rows: list[tuple[str, int, tuple[int, int, int], bool]] = [
                    (addr_label, addr_pct, color, False),
                    (nat_label, nat_pct, MUTED, True),
                ]
                chart_title = (
                    f"{cat_name} \u2014 vergelijking" if is_nl
                    else f"{cat_name} \u2014 comparison"
                )
                chart_end_y = pdf.draw_comparison_chart(
                    x=pdf.l_margin, y=pdf.get_y(),
                    width=pdf.w - pdf.l_margin - pdf.r_margin,
                    rows=comp_rows,
                    chart_title=chart_title,
                    is_nl=is_nl,
                )
                pdf.set_y(chart_end_y + 2)

            # Sub-rates: burglary + violent as detail lines
            if crime.burglary_per_1000 is not None:
                pdf.set_font("SatoshiMedium", "", 9)
                pdf.set_text_color(*SECONDARY)
                pdf.set_x(pdf.l_margin + 5)
                inbraak = "Inbraak" if is_nl else "Burglary"
                pdf.cell(
                    0, 5, f"{inbraak}: {format_number(crime.burglary_per_1000, 1, is_nl)}",
                    new_x="LMARGIN", new_y="NEXT",
                )
            if crime.violent_per_1000 is not None:
                pdf.set_font("SatoshiMedium", "", 9)
                pdf.set_text_color(*SECONDARY)
                pdf.set_x(pdf.l_margin + 5)
                geweld = "Geweld" if is_nl else "Violent"
                pdf.cell(
                    0, 5, f"{geweld}: {format_number(crime.violent_per_1000, 1, is_nl)}",
                    new_x="LMARGIN", new_y="NEXT",
                )
            pdf.ln(2)

            # Source + data year
            pdf.set_font("Satoshi", "", 8)
            pdf.set_text_color(*SECONDARY)
            source_parts = [crime.source]
            if crime.source_date:
                source_parts.append(crime.source_date)
            elif crime.yearly_period:
                source_parts.append(crime.yearly_period)
            joined = " \u00b7 ".join(source_parts)
            source_line = f"Bron: {joined}" if is_nl else f"Source: {joined}"
            pdf.cell(0, 4, source_line, new_x="LMARGIN", new_y="NEXT")

            # Disclaimer
            pdf.set_font("Satoshi", "", 8)
            disclaimer = (
                "Criminaliteitscijfers zijn per gemeente, niet per straat. "
                "Alleen geregistreerde misdrijven."
                if is_nl
                else "Crime data is per municipality, not per street. "
                "Registered crimes only."
            )
            pdf.multi_cell(0, 4, disclaimer, align="L", new_x="LMARGIN", new_y="NEXT")
            pdf.set_text_color(*SLATE)
        elif crime.message:
            pdf.set_font("Satoshi", "", 10)
            pdf.set_text_color(*SECONDARY)
            pdf.cell(0, 6, crime.message, new_x="LMARGIN", new_y="NEXT")
            pdf.set_text_color(*SLATE)
    else:
        pdf.set_font("Satoshi", "", 10)
        pdf.set_text_color(*SECONDARY)
        no_data = (
            "Criminaliteitsgegevens niet beschikbaar."
            if is_nl
            else "Crime data unavailable."
        )
        pdf.cell(0, 6, no_data, new_x="LMARGIN", new_y="NEXT")
        pdf.set_text_color(*SLATE)

    # --- Livability section (Leefbaarometer) ---
    if livability is not None and livability.available:
        _draw_livability_section(pdf, livability, is_nl)


def _draw_livability_section(
    pdf: BuurtCheckPDF,
    livability: LivabilityResponse | None,
    is_nl: bool,
) -> None:
    """Render livability section: overall score, 5-dimension bars, trend, comparison."""
    if livability is None or not livability.available:
        return

    pdf.draw_divider("strong")

    # Section header with band, then premium badge on top
    pdf.draw_section_label(
        "Leefbaarheid" if is_nl else "Livability", band=True,
    )
    # Badge drawn after band so it's not overwritten; position on prior line
    saved_y = pdf.get_y()
    pdf.set_y(saved_y - 7)
    pdf.draw_premium_badge()
    pdf.set_y(saved_y)

    # Overall score with severity
    score = livability.overall_normalized
    color = _severity_color(score)
    sev_label = _severity_label(score, is_nl)

    cy = pdf.get_y()
    pdf.set_fill_color(*TEAL)
    pdf.rect(pdf.l_margin, cy, 1.5, 8, "F")

    pdf.set_x(pdf.l_margin + 4)
    pdf.set_font("Satoshi", "B", 12)
    pdf.set_text_color(*SLATE)
    title = "Leefbaarheidsscore" if is_nl else "Livability Score"
    pdf.cell(100, 8, title)

    pdf.set_font("SatoshiBlack", "", 14)
    pdf.set_text_color(*color)
    pdf.cell(0, 8, str(score), align="R", new_x="LMARGIN", new_y="NEXT")

    # Score bar
    bar_w = pdf.w - pdf.l_margin - pdf.r_margin
    pdf.draw_score_bar(pdf.l_margin, pdf.get_y(), bar_w, score, height=5.0)
    pdf.ln(3)

    # Severity label
    pdf.set_font("SatoshiMedium", "", 9)
    pdf.set_text_color(*color)
    pdf.cell(0, 4, sev_label, new_x="LMARGIN", new_y="NEXT")
    pdf.set_text_color(*SLATE)
    pdf.ln(3)

    # --- 5-dimension breakdown as horizontal bars ---
    dim_labels: dict[str, tuple[str, str]] = {
        "physical": ("Fysiek", "Physical environment"),
        "safety": ("Veiligheid", "Safety"),
        "social": ("Sociaal", "Social cohesion"),
        "amenities": ("Voorzieningen", "Amenities"),
        "housing": ("Woningen", "Housing quality"),
    }

    label_w = 50
    score_w = 15
    content_w = pdf.w - pdf.l_margin - pdf.r_margin
    bar_w_dim = content_w - label_w - score_w - 4
    bar_h = 3.5
    row_h = 7.0

    for dim in livability.dimensions:
        nl_label, en_label = dim_labels.get(dim.name, (dim.name, dim.name))
        label = nl_label if is_nl else en_label
        dim_score = dim.normalized_score
        dim_color = _severity_color(dim_score)

        ry = pdf.get_y()

        pdf.set_font("SatoshiMedium", "", 9)
        pdf.set_text_color(*SECONDARY)
        pdf.set_xy(pdf.l_margin, ry)
        pdf.cell(label_w, row_h, label)

        bar_x = pdf.l_margin + label_w + 2
        bar_y = ry + (row_h - bar_h) / 2
        pdf.set_fill_color(*BORDER)
        pdf.rect(bar_x, bar_y, bar_w_dim, bar_h, "F")

        if dim_score > 0:
            fill_w = max(bar_w_dim * min(dim_score, 100) / 100, 1.0)
            pdf.set_fill_color(*dim_color)
            pdf.rect(bar_x, bar_y, fill_w, bar_h, "F")

        pdf.set_font("Satoshi", "B", 9)
        pdf.set_text_color(*SLATE)
        pdf.set_xy(pdf.l_margin + content_w - score_w, ry)
        pdf.cell(score_w, row_h, str(dim_score), align="R")

        pdf.set_y(ry + row_h)

    pdf.ln(2)

    # --- Trend summary ---
    if livability.trend and len(livability.trend) >= 2:
        trend_text = _livability_trend_summary(livability.trend, is_nl)
        if trend_text:
            pdf.set_font("Satoshi", "", 10)
            pdf.set_text_color(*SECONDARY)
            pdf.cell(
                content_w, 5, trend_text,
                new_x="LMARGIN", new_y="NEXT",
            )
            pdf.set_text_color(*SLATE)
            pdf.ln(2)

    # --- Comparison table: buurt vs wijk vs gemeente ---
    if livability.comparison:
        comp_title = (
            "Vergelijking" if is_nl else "Comparison"
        )
        comp_rows: list[tuple[str, int, tuple[int, int, int], bool]] = []

        # Address row first (buurt-level = this neighborhood)
        buurt_name = livability.buurt_name or ("Buurt" if is_nl else "Neighborhood")
        comp_rows.append((
            buurt_name, livability.overall_normalized, TEAL, False,
        ))

        for row in livability.comparison:
            if row.level == "wijk":
                label = row.name or ("Wijk" if is_nl else "District")
                comp_rows.append((label, row.overall_normalized, MUTED, False))
            elif row.level == "gemeente":
                label = row.name or ("Gemeente" if is_nl else "Municipality")
                comp_rows.append((label, row.overall_normalized, NATIONAL, False))

        if len(comp_rows) > 1:
            chart_end_y = pdf.draw_comparison_chart(
                x=pdf.l_margin, y=pdf.get_y(),
                width=content_w,
                rows=comp_rows,
                chart_title=comp_title,
                is_nl=is_nl,
            )
            pdf.set_y(chart_end_y + 2)

    # Source attribution
    pdf.set_font("Satoshi", "", 8)
    pdf.set_text_color(*SECONDARY)
    source_parts = ["Leefbaarometer"]
    if livability.year:
        source_parts.append(livability.year)
    elif livability.source_date:
        source_parts.append(livability.source_date)
    joined = " \u00b7 ".join(source_parts)
    source_line = f"Bron: {joined}" if is_nl else f"Source: {joined}"
    pdf.cell(0, 4, source_line, new_x="LMARGIN", new_y="NEXT")
    pdf.set_text_color(*SLATE)


def _livability_trend_summary(
    trend: list[LivabilityTrendPoint],
    is_nl: bool,
) -> str | None:
    """Generate a one-line trend summary from historical Leefbaarometer data.

    Returns e.g. "Improving since 2014" or "Stabiel" or None if insufficient data.
    """
    if len(trend) < 2:
        return None

    # Compare last two points for current direction
    latest = trend[-1]
    earliest = trend[0]
    diff = latest.overall_normalized - earliest.overall_normalized

    if abs(diff) < 5:
        return "Stabiel" if is_nl else "Stable"

    # Find inflection point: where did current direction start?
    if diff > 0:
        # Scan backwards for where improvement started; falls back to first
        # data point if the series is monotonically improving.
        inflection_year = trend[0].year
        for i in range(len(trend) - 1, 0, -1):
            if trend[i].overall_normalized <= trend[i - 1].overall_normalized:
                inflection_year = trend[i].year
                break
        if is_nl:
            return f"Verbeterend sinds {inflection_year}"
        return f"Improving since {inflection_year}"
    else:
        # Currently declining
        inflection_year = trend[0].year
        for i in range(len(trend) - 1, 0, -1):
            if trend[i].overall_normalized >= trend[i - 1].overall_normalized:
                inflection_year = trend[i].year
                break
        if is_nl:
            return f"Dalend sinds {inflection_year}"
        return f"Declining since {inflection_year}"


def _draw_checks_subsection(
    pdf: BuurtCheckPDF, title: str, body: str, source: str,
) -> None:
    """Render a single subsection: bold title, body text, source, divider."""
    pdf.set_font("Satoshi", "B", 12)
    pdf.cell(0, 6, title, new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Satoshi", "", 10)
    pdf.multi_cell(0, 5, body, align="L", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Satoshi", "", 8)
    pdf.set_text_color(*SECONDARY)
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
    shadow_images: list[dict] | None = None,
) -> None:
    """Page 4: premium-only checks required in the paid Full Dossier."""
    pdf.draw_premium_badge()
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
                f"{format_number(fr.subsidence_rate_mm_per_year, 1, is_nl)} mm/jaar."
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
                f"{format_number(fr.subsidence_rate_mm_per_year, 1, is_nl)} mm/jaar."
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

    # 6) Soil Contamination — Manual Verification Required
    soil_text = (
        "Er is geen geautomatiseerde perceelgebonden bodemverontreinigingsdata "
        "beschikbaar. Het BRO-bodeminformatieregister is niet betrouwbaar voor "
        "perceelniveau-extractie. Raadpleeg bodemloket.nl met het adres van het "
        "pand voor de officiële verontreinigingshistorie."
        if is_nl
        else "No automated parcel-level soil contamination data is available. "
        "The BRO soil information registry is not reliable for parcel-level "
        "extraction. Visit bodemloket.nl with the property address for official "
        "contamination history."
    )
    soil_source = (
        "Actie vereist: bodemloket.nl (handmatige opzoeking)" if is_nl
        else "Action required: bodemloket.nl (manual lookup)"
    )
    _draw_checks_subsection(
        pdf,
        title=(
            "Bodemverontreiniging \u2014 Handmatige verificatie vereist" if is_nl
            else "Soil Contamination \u2014 Manual Verification Required"
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
        _fn = format_number
        w = f"{_fn(sun.winter_hours, 1, is_nl)}h" if sun.winter_hours is not None else "\u2014"
        e = f"{_fn(sun.equinox_hours, 1, is_nl)}h" if sun.equinox_hours is not None else "\u2014"
        s = f"{_fn(sun.summer_hours, 1, is_nl)}h" if sun.summer_hours is not None else "\u2014"
        score_text = str(sunlight_score) if sunlight_score is not None else "\u2014"
        sun_text = (
            f"Geschat direct zonlicht: winter {w}/dag, equinox {e}/dag, zomer {s}/dag. "
            f"Score: {score_text}/100."
            if is_nl
            else f"Estimated direct sunlight: winter {w}/day, equinox {e}/day, summer {s}/day. "
            f"Score: {score_text}/100."
        )
        # Append extended sunlight metrics if available
        extra_lines: list[str] = []
        if sun.annual_average is not None:
            label = "Jaargemiddelde" if is_nl else "Annual average"
            val = _fn(sun.annual_average, 1, is_nl)
            unit = "u/dag" if is_nl else "h/day"
            extra_lines.append(f"{label}: {val} {unit}")
        if (
            sun.svf_anisotropic is not None
            and sun.svf_anisotropic != sun.svf_percent
        ):
            label = "SVF (anisotropisch)" if is_nl else "SVF (anisotropic)"
            val = _fn(sun.svf_anisotropic, 0, is_nl)
            extra_lines.append(f"{label}: {val}%")
        if sun.irradiance_kwh_m2 is not None:
            label = "Zonnestraling" if is_nl else "Solar irradiance"
            unit = "kWh/m\u00b2/jaar" if is_nl else "kWh/m\u00b2/year"
            val = _fn(sun.irradiance_kwh_m2, 0, is_nl)
            extra_lines.append(f"{label}: {val} {unit}")
        if extra_lines:
            sun_text += " " + " | ".join(extra_lines) + "."
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
    has_triptych = shadow_images and len(shadow_images) >= 3
    if has_triptych:
        snapshot_text = (
            "Schaduwopnamen op winterzonnewende (ochtend/middag/avond), "
            "gegenereerd op basis van omliggende 3D-geometrie."
            if is_nl
            else "Winter-solstice shadow snapshots (morning/noon/evening), "
            "generated from surrounding 3D geometry."
        )
    elif shadow_image_b64:
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
    # Shadow image already on cover page; text-only here
    pdf.set_font("Satoshi", "B", 12)
    pdf.cell(
        0, 6, shadow_title,
        new_x="LMARGIN", new_y="NEXT",
    )
    pdf.set_font("Satoshi", "", 10)
    pdf.multi_cell(
        0, 5, snapshot_text,
        align="L", new_x="LMARGIN", new_y="NEXT",
    )
    pdf.set_font("Satoshi", "", 8)
    pdf.set_text_color(*SECONDARY)
    pdf.cell(
        0, 4, shadow_source,
        new_x="LMARGIN", new_y="NEXT",
    )
    pdf.set_text_color(*SLATE)


def _draw_indicator(pdf: BuurtCheckPDF, label: str, indicator) -> None:
    """Draw a single neighborhood indicator row."""
    if not indicator.available:
        pdf.draw_indicator_row(label, "\u2014")
        return
    val = indicator.value
    unit = indicator.unit or ""
    is_nl = pdf.is_nl
    if isinstance(val, float):
        if unit == "%":
            text = f"{val:.0f}%"
        elif unit == "\u20ac":
            eur_prefix = "\u20ac " if is_nl else "\u20ac"
            text = f"{eur_prefix}{format_number(val, 0, is_nl)}"
        elif unit == "km":
            text = f"{format_number(val, 1, is_nl)} km"
        elif unit == "/km\u00b2":
            text = f"{format_number(val, 0, is_nl)}/km\u00b2"
        else:
            text = f"{format_number(val, 0, is_nl)} {unit}".strip()
    elif val is not None:
        text = f"{val} {unit}".strip()
    else:
        text = "\u2014"
    if indicator.quartile is not None:
        text += f" (Q{indicator.quartile})"
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
    pdf.set_font("Satoshi", "B", 12)
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
    pdf.multi_cell(0, 5, methodology, align="L", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(3)

    # --- E5-S2: Score formula disclosure ---
    pdf.draw_section_label("Scoringformules" if is_nl else "Scoring Formulas")
    score_formulas: list[tuple[str, str]] = [
        (
            "Geluid" if is_nl else "Noise",
            (
                "40 dB Lden = 100 (uitstekend), 90 dB Lden = 0 (kritiek), "
                "lineaire interpolatie"
                if is_nl
                else "40 dB Lden = 100 (excellent), 90 dB Lden = 0 (critical), "
                "linear interpolation"
            ),
        ),
        (
            "Luchtkwaliteit" if is_nl else "Air Quality",
            (
                "Slechtste van PM2.5 en NO2. "
                "PM2.5: 5 \u00b5g/m\u00b3 = 100, 25 \u00b5g/m\u00b3 = 0. "
                "NO2: 10 \u00b5g/m\u00b3 = 100, 40 \u00b5g/m\u00b3 = 0"
                if is_nl
                else "Worst of PM2.5 and NO2. "
                "PM2.5: 5 \u00b5g/m\u00b3 = 100, 25 \u00b5g/m\u00b3 = 0. "
                "NO2: 10 \u00b5g/m\u00b3 = 100, 40 \u00b5g/m\u00b3 = 0"
            ),
        ),
        (
            "Klimaatstress" if is_nl else "Climate",
            (
                "Slechtste van hittestress en wateroverlast. "
                "Laag risico = 85, gemiddeld = 50, hoog = 15"
                if is_nl
                else "Worst of heat stress and water stress. "
                "Low risk = 85, medium = 50, high = 15"
            ),
        ),
        (
            "Zonlicht" if is_nl else "Sunlight",
            (
                "Winterzonnewende directe zonuren / 6 \u00d7 100. 6+ uur = 100"
                if is_nl
                else "Winter solstice direct sun hours / 6 \u00d7 100. "
                "6+ hours = 100"
            ),
        ),
    ]
    for label, formula in score_formulas:
        pdf.set_font("SatoshiMedium", "", 9)
        pdf.set_text_color(*SECONDARY)
        pdf.cell(pdf.get_string_width(label) + 2, 5, label)
        pdf.set_font("Satoshi", "", 8)
        pdf.set_text_color(*SECONDARY)
        pdf.multi_cell(
            0, 4, formula, align="L", new_x="LMARGIN", new_y="NEXT",
        )
        pdf.ln(1)
    pdf.set_text_color(*SLATE)
    pdf.ln(2)

    # --- E5-S3: Complete data sources table ---
    pdf.draw_section_label("Databronnen" if is_nl else "Data Sources")
    sources: list[tuple[str, str, str]] = [
        (
            "BAG (Kadaster)",
            "Gebouwgegevens" if is_nl else "Building data",
            "WFS verblijfsobject",
        ),
        (
            "3DBAG (TU Delft)",
            "3D-geometrie" if is_nl else "3D geometry",
            "OGC API Features (CityJSON)",
        ),
        (
            "RIVM",
            "Geluid (Lden wegen)" if is_nl else "Noise (Lden roads)",
            "WMS lden_wegverkeer (dated)",
        ),
        (
            "RIVM",
            "Luchtkwaliteit" if is_nl else "Air quality",
            "WMS conc_NO2, conc_PM25 (dated)",
        ),
        (
            "Klimaateffectatlas",
            "Klimaatstress" if is_nl else "Climate stress",
            "WMS + WFS",
        ),
        (
            "CBS",
            "Buurtstatistieken" if is_nl else "Neighborhood stats",
            "OGC API Features",
        ),
        (
            "CBS",
            "Criminaliteit" if is_nl else "Crime",
            "OData v4 (47018NED)",
        ),
        (
            "Leefbaarometer",
            "Leefbaarheid" if is_nl else "Livability",
            "WFS 2.0",
        ),
        (
            "SunCalc + 3DBAG",
            "Zonlichtanalyse" if is_nl else "Sunlight analysis",
            "Ray-casting",
        ),
    ]
    src_w = pdf.w - pdf.l_margin - pdf.r_margin
    for source, data_desc, layer in sources:
        pdf.set_font("SatoshiMedium", "", 9)
        pdf.set_text_color(*SECONDARY)
        pdf.cell(src_w * 0.28, 5, source)
        pdf.set_font("Satoshi", "", 9)
        pdf.set_text_color(*SLATE)
        pdf.cell(src_w * 0.35, 5, data_desc)
        pdf.set_font("Satoshi", "", 8)
        pdf.set_text_color(*SECONDARY)
        pdf.cell(
            src_w * 0.37, 5, layer, align="R", new_x="LMARGIN", new_y="NEXT",
        )
    pdf.set_text_color(*SLATE)
    pdf.ln(3)

    # --- E2-S5: Sunlight methodology disclosure ---
    pdf.draw_section_label(
        "Methode zonlichtanalyse" if is_nl else "Sunlight Analysis Method"
    )
    sunlight_params: list[tuple[str, str]] = [
        (
            "Zonnepositie" if is_nl else "Solar position",
            (
                "SunCalc (azimut vanaf noord, hoogte vanaf horizon)"
                if is_nl
                else "SunCalc (azimuth from north, altitude from horizon)"
            ),
        ),
        (
            "Tijdsresolutie" if is_nl else "Temporal",
            (
                "30 min intervallen, 12 representatieve dagen/jaar "
                "(21e van elke maand)"
                if is_nl
                else "30-min intervals, 12 representative days/year "
                "(21st each month)"
            ),
        ),
        (
            "Ruimtelijke resolutie" if is_nl else "Spatial",
            (
                "1m dakgrid, max 256 meetpunten"
                if is_nl
                else "1m roof grid, up to 256 sample points"
            ),
        ),
        (
            "Obstructies" if is_nl else "Obstructions",
            (
                "Alleen 3DBAG gebouwen; vegetatie en "
                "infrastructuur uitgesloten"
                if is_nl
                else "3DBAG buildings only; vegetation and "
                "infrastructure excluded"
            ),
        ),
        (
            "Atmosferisch" if is_nl else "Atmospheric",
            (
                "Heldere-hemelanalyse (geen bewolking/weer)"
                if is_nl
                else "Clear-sky geometric analysis "
                "(no cloud/weather adjustment)"
            ),
        ),
        (
            "Meetvlak" if is_nl else "Target plane",
            (
                "Dakoppervlak (niet raam- of balkonvlak)"
                if is_nl
                else "Roof surface analysis "
                "(not window or balcony plane)"
            ),
        ),
    ]
    for param_label, param_desc in sunlight_params:
        pdf.set_font("SatoshiMedium", "", 9)
        pdf.set_text_color(*SECONDARY)
        pdf.cell(pdf.get_string_width(param_label) + 2, 5, param_label)
        pdf.set_font("Satoshi", "", 9)
        pdf.set_text_color(*SLATE)
        pdf.multi_cell(
            0, 4, param_desc, align="L", new_x="LMARGIN", new_y="NEXT",
        )
        pdf.ln(0.5)
    pdf.set_text_color(*SLATE)
    pdf.ln(2)

    # Peer baseline disclosure (Task E4-S2)
    pdf.set_font("Satoshi", "", 10)
    pdf.set_text_color(*SECONDARY)
    baseline_disclosure = (
        "Waar 'vergelijkingswaarde' wordt getoond, zijn waarden gemodelleerd op basis "
        "van de stedelijkheidscategorie (CBS) van het adres, niet gemiddeld over de "
        "volledige verdeling van de gemeente."
        if is_nl
        else "Where 'peer baseline' is shown, values are modeled from the address's "
        "urbanization category (CBS), not averaged from the municipality's full "
        "distribution."
    )
    pdf.multi_cell(0, 4, baseline_disclosure, align="L", new_x="LMARGIN", new_y="NEXT")
    pdf.set_text_color(*SLATE)
    pdf.ln(3)

    # Page break check — new content above may push remaining sections past page
    if pdf.get_y() > pdf.h - 60:
        pdf.add_page()

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
    pdf.multi_cell(0, 5, limitations, align="L", new_x="LMARGIN", new_y="NEXT")
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
    for _ in range(3):
        y = pdf.get_y()
        if y > pdf.h - 25:
            break
        pdf.line(pdf.l_margin, y, pdf.w - pdf.r_margin, y)
        pdf.ln(8)
