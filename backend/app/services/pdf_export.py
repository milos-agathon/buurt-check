"""PDF export service — Polar Frost branded Quick Brief and Full Dossier."""

import base64
import io
import logging
import math
import re
import tempfile
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

from fpdf import FPDF
from PIL import Image

from app.models.livability import LivabilityResponse, LivabilityTrendPoint
from app.models.neighborhood import AgeProfile, NeighborhoodStats, UrbanizationLevel
from app.models.property_warnings import ErfpachtWarning, PropertyWarningsResponse
from app.models.report import ProvenanceData
from app.models.risk import (
    ClimateStressRiskCard,
    ComparisonPattern,
    FacadeResult,
    QuestionCategory,
    RiskCardsResponse,
    RiskComparisonsResponse,
    ViewingQuestionsResponse,
)
from app.models.tier_b import TierBResponse
from app.services.latex_env import (
    compile_latex_to_pdf_with_fallback,
    escape_latex,
    format_preparation_date,
    render_brief,
    render_chart_assets_parallel,
    render_dossier,
)
from app.services.scoring import (
    normalize_crime_score,
    normalize_sunlight_score,
    severity_from_score,
)
from app.services.viewing_questions import (
    _crime_checklist_category as _shared_crime_checklist_category,
)
from app.services.viewing_questions import (
    with_crime_viewing_questions as _augment_viewing_questions_with_crime,
)

try:
    from app.services import chart_renderer
except Exception:  # pragma: no cover - graceful fallback when matplotlib is unavailable
    chart_renderer = None

logger = logging.getLogger(__name__)

# --- Font paths ---
_FONTS_DIR = Path(__file__).parent.parent / "assets" / "fonts"
_LOGOS_DIR = Path(__file__).parent.parent / "assets" / "logos"
_HEADER_LOGO_PATH = _LOGOS_DIR / "buurt-check-lockup-horizontal.png"

# --- Polar Frost color palette (RGB tuples) ---
# Contrast ratios are vs white (#FFFFFF) unless noted.
TEAL = (13, 148, 136)  # #0D9488 — Stitch Teal accent fill
SLATE = (23, 29, 28)  # #171D1C — primary text
MUTED = (109, 122, 119)  # #6D7A77 — peer/comparison bar fill
BORDER = (226, 232, 240)  # #E2E8F0 — borders, dividers, score track
WHITE = (255, 255, 255)
AMBER_WARN = (234, 179, 8)  # #EAB308 — amber for warnings (1.87:1 — fill/dashed only)
SECONDARY = (61, 73, 71)  # #3D4947 — essential info text
NATIONAL = (109, 122, 119)  # #6D7A77 — "Nederland" bar fill
GRIDLINE = (240, 242, 245)  # Very light gray for chart gridlines (decorative)
TEAL_LIGHT = (236, 253, 245)  # #ECFDF5 — light teal for section bands, premium badges
ACCENT_TEXT = (0, 104, 95)  # #00685F — accent text color with AA contrast
FROST_BG = (240, 244, 248)  # #F0F4F8 — executive summary panel
TILE_BG = (249, 250, 251)  # #F9FAFB — subtle tile/card background
CALL_OUT_CRITICAL_BG = (254, 242, 242)  # #FEF2F2
CALL_OUT_POOR_BG = (255, 247, 237)  # #FFF7ED
PEER_BAR = (220, 224, 228)  # #DCE0E4 — recessive comparison gray
COMPARISON_PEER = (99, 120, 146)  # #637892 — peer / city baseline
COMPARISON_NATIONAL = (138, 155, 176)  # #8A9BB0 — national baseline
COMPARISON_REFERENCE = AMBER_WARN  # #EAB308 — benchmark / target
COMPARISON_GUIDES = (20, 40, 70)
GOOD_THRESHOLD = 70
_MONTH_NAMES_EN = (
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
)
_MONTH_NAMES_NL = (
    "januari",
    "februari",
    "maart",
    "april",
    "mei",
    "juni",
    "juli",
    "augustus",
    "september",
    "oktober",
    "november",
    "december",
)
_WINTER_ROOF_POSSIBLE_HOURS = 7.5
_WINTER_ROOF_MEDIUM_HOURS = round(_WINTER_ROOF_POSSIBLE_HOURS * 0.5, 1)
_WINTER_ROOF_HIGH_HOURS = round(_WINTER_ROOF_POSSIBLE_HOURS * 0.8, 1)
_EN17037_MIN_HOURS = 1.5
_EN17037_MEDIUM_HOURS = 3.0
_EN17037_HIGH_HOURS = 4.0
_SVF_MODERATE_THRESHOLD = 30.0
_SVF_OPEN_THRESHOLD = 60.0

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

_NOTES_RULE_COUNT = 4
_NOTES_RULE_SPACING_MM = 7.0
# Minimum space before starting the notes block; the block itself expands to
# fill the remaining page height once rendered.
_NOTES_SECTION_REQUIRED_MM = 50.0
_SECTION_CONTINUATION_REQUIRED_MM = 24.0
_LOCATION_MAP_WIDTH_MM = 110.0
_LOCATION_MAP_HEIGHT_MM = 92.0
_LOCATION_MAP_PLACEHOLDER_HEIGHT_MM = 34.0
_LOCATION_MAP_SECTION_REQUIRED_MM = 104.0
_LOCATION_MAP_PLACEHOLDER_REQUIRED_MM = 48.0

# --- PDF Type Hierarchy (8 primary levels) ---
#
# Implementation note:
# PDF text uses static Inter TrueType instances under the legacy family aliases
# below. The repo's historical Satoshi "*.ttf" assets are actually CFF/OpenType
# fonts with a ".ttf" extension, which desktop viewers tolerate but iOS PDFKit
# does not when embedded by fpdf2.
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
#               | Satoshi Regular        | 8pt  | SECONDARY | Footer page number
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


def _format_cbs_period_label(period: str | None, *, is_nl: bool) -> str | None:
    if not period:
        return None
    yearly_match = re.fullmatch(r"(\d{4})JJ00", period)
    if yearly_match:
        return yearly_match.group(1)

    monthly_match = re.fullmatch(r"(\d{4})MM(\d{2})", period)
    if monthly_match:
        year = monthly_match.group(1)
        month_index = int(monthly_match.group(2)) - 1
        if 0 <= month_index < 12:
            month_names = _MONTH_NAMES_NL if is_nl else _MONTH_NAMES_EN
            return f"{month_names[month_index]} {year}"
    return period


def _prepared_label(value: date, *, is_nl: bool) -> str:
    prefix = "Opgesteld" if is_nl else "Prepared"
    language = "nl" if is_nl else "en"
    return f"{prefix}: {format_preparation_date(value, language)}"


def _crime_source_date_label(crime: Any, *, is_nl: bool) -> str | None:
    source_date = getattr(crime, "source_date", None)
    yearly_period = getattr(crime, "yearly_period", None)
    monthly_period = getattr(crime, "monthly_period", None)
    return (
        _format_cbs_period_label(source_date, is_nl=is_nl)
        or _format_cbs_period_label(yearly_period, is_nl=is_nl)
        or _format_cbs_period_label(monthly_period, is_nl=is_nl)
    )


def _crime_provenance_fragments(crime: Any, *, is_nl: bool) -> list[str]:
    fragments: list[str] = []
    period_label = _crime_source_date_label(crime, is_nl=is_nl)
    if period_label:
        fragments.append(
            f"{'criminaliteitsperiode' if is_nl else 'crime period'} {period_label}"
        )

    population_year = getattr(crime, "population_year", None)
    if population_year is not None:
        population_is_estimate = bool(getattr(crime, "population_is_estimate", False))
        fragments.append(
            (
                f"lokale bevolkingsschatting {population_year}"
                if is_nl and population_is_estimate
                else f"lokale bevolking {population_year}"
                if is_nl
                else f"local population estimate {population_year}"
                if population_is_estimate
                else f"local population {population_year}"
            )
        )

    national_population_year = getattr(crime, "national_population_year", None)
    if national_population_year is not None:
        national_population_is_estimate = bool(
            getattr(crime, "national_population_is_estimate", False)
        )
        fragments.append(
            (
                f"landelijke bevolkingsschatting {national_population_year}"
                if is_nl and national_population_is_estimate
                else f"landelijke bevolking {national_population_year}"
                if is_nl
                else f"national population estimate {national_population_year}"
                if national_population_is_estimate
                else f"national population {national_population_year}"
            )
        )

    return fragments


def _score_value(score: int | float | None) -> str:
    if score is None:
        return "\u2014"
    return str(int(round(score)))


def _score_text(score: int | None, *, is_nl: bool) -> str:
    if score is None:
        return "N.v.t." if is_nl else "N/A"
    return f"{_score_value(score)}/100"


def _is_address_comparison_label(label: str) -> bool:
    normalized = " ".join(label.lower().split())
    return normalized in {"this address", "dit adres"}


def _is_national_comparison_label(label: str) -> bool:
    normalized = " ".join(label.lower().split())
    return normalized in {"netherlands", "nederland", "national", "nationaal"}


def _quartile_label(quartile: int | None, *, is_nl: bool) -> str | None:
    labels_en = {
        1: "bottom 25%",
        2: "below average",
        3: "above average",
        4: "top 25%",
    }
    labels_nl = {
        1: "laagste 25%",
        2: "onder gemiddeld",
        3: "boven gemiddeld",
        4: "hoogste 25%",
    }
    return (labels_nl if is_nl else labels_en).get(quartile)


def _indicator_quartile_label(indicator: Any, *, is_nl: bool) -> str | None:
    quartile = getattr(indicator, "quartile", None)
    direction = getattr(indicator, "quartile_direction", None)
    favorable = getattr(indicator, "favorable_quartile", None)
    if quartile is None:
        return None
    if direction == "lower_value" and favorable is not None:
        labels_en = {
            1: "least favorable access quartile",
            2: "below-average access",
            3: "above-average access",
            4: "best access quartile",
        }
        labels_nl = {
            1: "minst gunstig bereikbaarheidskwartiel",
            2: "ondergemiddelde bereikbaarheid",
            3: "bovengemiddelde bereikbaarheid",
            4: "beste bereikbaarheidskwartiel",
        }
        return (labels_nl if is_nl else labels_en).get(favorable)
    return _quartile_label(quartile, is_nl=is_nl)


def _primary_footprint_ring(footprint_geojson: dict[str, Any] | None) -> list[list[float]]:
    if not footprint_geojson:
        return []
    geometry = footprint_geojson
    if geometry.get("type") == "Feature":
        geometry = geometry.get("geometry") or {}
    polygon_coords = geometry.get("coordinates")
    if geometry.get("type") == "MultiPolygon" and polygon_coords:
        polygon_coords = polygon_coords[0]
    return polygon_coords[0] if polygon_coords else []


def _footprint_anchor(
    footprint_geojson: dict[str, Any] | None,
) -> tuple[float, float] | None:
    ring = _primary_footprint_ring(footprint_geojson)
    if not ring:
        return None
    lons = [float(point[0]) for point in ring if len(point) >= 2]
    lats = [float(point[1]) for point in ring if len(point) >= 2]
    if not lons or not lats:
        return None
    return ((min(lats) + max(lats)) / 2, (min(lons) + max(lons)) / 2)


def _severity_fill(score: int | None) -> tuple[int, int, int]:
    sev = _severity_for_score(score)
    if sev == "critical":
        return CALL_OUT_CRITICAL_BG
    if sev == "poor":
        return CALL_OUT_POOR_BG
    return FROST_BG


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


def _livability_class_value(item: Any) -> int | None:
    value = getattr(item, "overall_class", None)
    if value is None:
        value = getattr(item, "overall_score", None)
    return int(value) if value is not None else None


def _livability_dimension_class_value(item: Any) -> int | None:
    value = getattr(item, "raw_score", None)
    return int(value) if value is not None else None


def _livability_class_label(
    class_value: int | None,
    *,
    is_nl: bool,
    fallback: str | None = None,
) -> str | None:
    if class_value is None:
        return None

    labels_en = {
        1: "very low",
        2: "low",
        3: "fairly low",
        4: "below average",
        5: "around average",
        6: "above average",
        7: "good",
        8: "very good",
        9: "excellent",
    }
    labels_nl = {
        1: "zeer laag",
        2: "laag",
        3: "vrij laag",
        4: "onder gemiddeld",
        5: "rond gemiddeld",
        6: "boven gemiddeld",
        7: "goed",
        8: "zeer goed",
        9: "uitstekend",
    }

    if fallback and not is_nl:
        return fallback
    return (labels_nl if is_nl else labels_en).get(class_value)


def _livability_class_text(class_value: int | None, *, is_nl: bool) -> str:
    if class_value is None:
        return "N.v.t." if is_nl else "N/A"
    return f"Klasse {class_value}" if is_nl else f"Class {class_value}"


def _livability_deviation_text(
    deviation: float | None,
    *,
    is_nl: bool,
) -> str | None:
    if deviation is None:
        return None

    absolute = abs(deviation)
    if absolute < 0.15:
        description = (
            "rond landelijk gemiddelde"
            if is_nl
            else "around national average"
        )
    elif deviation > 0:
        if absolute < 0.75:
            description = (
                "licht boven landelijk gemiddelde"
                if is_nl
                else "slightly above national average"
            )
        elif absolute < 1.5:
            description = (
                "boven landelijk gemiddelde"
                if is_nl
                else "above national average"
            )
        else:
            description = (
                "ruim boven landelijk gemiddelde"
                if is_nl
                else "well above national average"
            )
    else:
        if absolute < 0.75:
            description = (
                "licht onder landelijk gemiddelde"
                if is_nl
                else "slightly below national average"
            )
        elif absolute < 1.5:
            description = (
                "onder landelijk gemiddelde"
                if is_nl
                else "below national average"
            )
        else:
            description = (
                "ruim onder landelijk gemiddelde"
                if is_nl
                else "well below national average"
            )

    formatted = format_number(abs(deviation), 1, is_nl)
    if deviation > 0:
        formatted = f"+{formatted}"
    elif deviation < 0:
        formatted = f"-{formatted}"
    return f"{description} ({formatted})"


def _livability_dimension_rank_value(item: Any) -> float:
    deviation = getattr(item, "deviation", None)
    if deviation is not None:
        return float(deviation)
    class_value = _livability_dimension_class_value(item)
    return float(class_value or 0)


def _livability_dimension_value_text(item: Any, *, is_nl: bool) -> str:
    class_value = _livability_dimension_class_value(item)
    parts = [_livability_class_text(class_value, is_nl=is_nl)]
    deviation_text = _livability_deviation_text(getattr(item, "deviation", None), is_nl=is_nl)
    class_label = _livability_class_label(
        class_value,
        is_nl=is_nl,
        fallback=getattr(item, "class_label", None),
    )
    if deviation_text:
        parts.append(deviation_text)
    elif class_label:
        parts.append(class_label)
    return " · ".join(parts)


def _climate_disclosure_line(
    card: ClimateStressRiskCard | None,
    is_nl: bool,
) -> str | None:
    if card is None:
        return None

    context_parts: list[str] = []
    if card.source_date:
        year_label = "Bronjaar" if is_nl else "Source year"
        context_parts.append(f"{year_label}: {card.source_date}")
    if not card.source_date:
        return None
    context_parts.append(
        "Gemodelleerd klimaatscenario" if is_nl else "Modeled climate scenario"
    )

    heading = "Klimaatcontext" if is_nl else "Climate context"
    source_name = card.source or "Klimaateffectatlas"
    separator = " \u00b7 "
    return f"{heading}: {source_name}{separator}{separator.join(context_parts)}"


def _format_wrapped_latex_metadata(text: str) -> str:
    """Escape metadata text and insert soft wrap opportunities for LaTeX."""
    escaped = escape_latex(text)
    escaped = escaped.replace(" \u00b7 ", " \u00b7\\allowbreak ")
    escaped = re.sub(r":(?!\\allowbreak)", r":\\allowbreak{}", escaped)
    escaped = escaped.replace(", ", r",\allowbreak ")
    escaped = escaped.replace("/", r"/\allowbreak{}")
    return escaped.replace(r"\_", r"\_\allowbreak{}")


def _percent_like_value(value: float | None) -> float | None:
    """Normalize ratio-like inputs to 0-100 percentages for PDF display."""
    if value is None:
        return None
    if 0.0 <= value <= 1.0:
        return value * 100.0
    return value


def _sunlight_svf_values(
    sun: Any,
) -> tuple[float | None, float | None]:
    """Return (svf_percent, weighted_svf_percent) for a sunlight card."""
    svf_percent = _percent_like_value(getattr(sun, "svf_percent", None))
    weighted_svf_percent = _percent_like_value(getattr(sun, "svf_anisotropic", None))
    return svf_percent, weighted_svf_percent


def _is_same_percent(a: float | None, b: float | None) -> bool:
    if a is None or b is None:
        return False
    return abs(a - b) < 0.5


def _generate_executive_summary(
    risks: RiskCardsResponse | None,
    sunlight_score: int | None,
    livability: LivabilityResponse | None,
    is_nl: bool,
    crime_score: int | None = None,
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
    if crime_score is not None:
        categories.append(("crime", "criminaliteit", crime_score))

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

    if is_nl:
        sentence2 = (
            f"Het grootste aandachtspunt is {worst_nl} "
            f"met {worst_score}/100."
        )
    else:
        sentence2 = (
            f"The top concern is {worst_en} "
            f"with {worst_score}/100."
        )

    # --- Sentence 3: neighborhood character (from livability) ---
    sentence3 = ""
    if livability and livability.available:
        livability_class = _livability_class_value(livability)
        livability_label = _livability_class_label(
            livability_class,
            is_nl=is_nl,
            fallback=getattr(livability, "overall_class_label", None),
        )
        # Find best dimension
        best_dim = None
        if livability.dimensions:
            best_dim = max(livability.dimensions, key=_livability_dimension_rank_value)

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
                f"De buurt heeft leefbaarheidsklasse {livability_class}"
            )
            if livability_label:
                sentence3 += f" ({livability_label})"
            if best_dim:
                dim_label = dim_names_nl.get(best_dim.name, best_dim.name)
                sentence3 += f" met een sterke {dim_label}"
            sentence3 += "."
        else:
            sentence3 = (
                f"The neighborhood is livability class {livability_class}"
            )
            if livability_label:
                sentence3 += f" ({livability_label})"
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
        "sunlight": "verify room daylight on site; modeled score is roof clear-sky exposure",
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


def _risk_concerns(
    risks: RiskCardsResponse | None,
    sunlight_score: int | None,
    is_nl: bool,
    *,
    crime_score: int | None = None,
    crime_summary: str | None = None,
) -> list[dict[str, str | int]]:
    concerns: list[dict[str, str | int]] = []
    if risks:
        for label_en, label_nl, score, summary in [
            (
                "Noise",
                "Geluid",
                risks.noise.score,
                risks.noise.summary_nl if is_nl else risks.noise.summary,
            ),
            (
                "Air Quality",
                "Luchtkwaliteit",
                risks.air_quality.score,
                risks.air_quality.summary_nl if is_nl else risks.air_quality.summary,
            ),
            (
                "Climate Stress",
                "Klimaatstress",
                risks.climate_stress.score,
                risks.climate_stress.summary_nl if is_nl else risks.climate_stress.summary,
            ),
        ]:
            if score is None or _severity_for_score(score) not in {"critical", "poor"}:
                continue
            concerns.append(
                {
                    "label": label_nl if is_nl else label_en,
                    "score": score,
                    "severity": _severity_label(score, is_nl),
                    "summary": summary or "",
                }
            )

    if sunlight_score is not None and _severity_for_score(sunlight_score) in {"critical", "poor"}:
        concerns.append(
            {
                "label": "Zonlicht" if is_nl else "Sunlight",
                "score": sunlight_score,
                "severity": _severity_label(sunlight_score, is_nl),
                "summary": "",
            }
        )

    if crime_score is not None and _severity_for_score(crime_score) in {"critical", "poor"}:
        concerns.append(
            {
                "label": "Criminaliteit" if is_nl else "Crime",
                "score": crime_score,
                "severity": _severity_label(crime_score, is_nl),
                "summary": crime_summary or "",
            }
        )

    def _sort_key(item: dict[str, str | int]) -> tuple[int, int]:
        score = int(item["score"])
        sev = _severity_for_score(score)
        rank = {"critical": 0, "poor": 1, "moderate": 2, "good": 3, "unavailable": 4}
        return (rank.get(sev, 4), score)

    return sorted(concerns, key=_sort_key)[:3]


def _collect_cover_sources(
    risks: RiskCardsResponse | None,
    *,
    is_nl: bool,
    include_crime: bool = False,
    livability: LivabilityResponse | None = None,
    include_shadow: bool = False,
    shadow_reference_year: int | None = None,
) -> str:
    items: list[str] = []

    def _append(source: str | None, source_date: str | None = None) -> None:
        if not source:
            return
        item = source.strip()
        if source_date:
            item = f"{item} {source_date}"
        if item not in items:
            items.append(item)

    def _shadow_cover_source_label() -> str:
        reference_year = shadow_reference_year or date.today().year
        if is_nl:
            return (
                "3DBAG / TU Delft + SunCalc "
                f"(seizoensreferentiedata {reference_year})"
            )
        return (
            "3DBAG / TU Delft + SunCalc "
            f"(seasonal reference dates {reference_year})"
        )

    if risks:
        _append(risks.noise.source, risks.noise.source_date)
        _append(risks.air_quality.source, risks.air_quality.source_date)
        _append(
            risks.climate_stress.source or "Klimaateffectatlas",
            risks.climate_stress.source_date,
        )
        if risks.sunlight:
            _append(risks.sunlight.source or "SunCalc + 3DBAG", risks.sunlight.source_date)
        else:
            _append("SunCalc + 3DBAG")
    if livability and livability.available:
        _append(
            livability.source or "Leefbaarometer",
            livability.year or livability.source_date,
        )
    if include_crime:
        _append("CBS")
    if include_shadow:
        _append(_shadow_cover_source_label())

    prefix = "Bronnen" if is_nl else "Sources"
    return f"{prefix}: {', '.join(items)}" if items else f"{prefix}: \u2014"


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


_SEVERITY_CODE_BY_LABEL: dict[str, str] = {
    "good": "good",
    "moderate": "moderate",
    "poor": "poor",
    "critical": "critical",
    "goed": "good",
    "matig": "moderate",
    "slecht": "poor",
    "kritiek": "critical",
    "n.v.t.": "unavailable",
    "n/a": "unavailable",
    "-": "unavailable",
    "\u2014": "unavailable",
}


def _severity_code_from_label(label: str | None) -> str | None:
    if label is None:
        return None
    key = label.strip().lower()
    return _SEVERITY_CODE_BY_LABEL.get(key)


def _scaled_chart_height(
    width: float,
    *,
    source_width_mm: float,
    source_height_mm: float,
) -> float:
    if source_width_mm <= 0:
        raise ValueError("chart source width must be > 0")
    if source_height_mm <= 0:
        raise ValueError("chart source height must be > 0")
    return max(1.0, source_height_mm * (width / source_width_mm))


def _embed_chart_png(
    pdf: FPDF,
    image_bytes: bytes,
    *,
    x: float,
    y: float,
    width: float,
    height: float | None = None,
    source_width_mm: float | None = None,
    source_height_mm: float | None = None,
) -> float:
    """Embed a PNG chart at `x,y` and return the next y-coordinate."""
    if height is None:
        if source_width_mm is None or source_height_mm is None:
            raise ValueError("chart height or source dimensions must be provided")
        height = _scaled_chart_height(
            width,
            source_width_mm=source_width_mm,
            source_height_mm=source_height_mm,
        )
    else:
        height = max(1.0, height)
    pdf.image(io.BytesIO(image_bytes), x=x, y=y, w=width, h=height)
    return y + height


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
        self.set_left_margin(25)
        self.set_right_margin(25)
        self._register_fonts()
        self.set_auto_page_break(auto=True, margin=20)

    def _register_fonts(self) -> None:
        """Register export-safe static TrueType weights for Unicode PDF text."""
        for style, filename in [
            ("", "Inter-Regular.ttf"),
            ("B", "Inter-Bold.ttf"),
        ]:
            path = _FONTS_DIR / filename
            if path.exists():
                self.add_font("Satoshi", style, str(path))
        black_path = _FONTS_DIR / "Inter-Black.ttf"
        if black_path.exists():
            self.add_font("SatoshiBlack", "", str(black_path))
        medium_path = _FONTS_DIR / "Inter-Medium.ttf"
        if medium_path.exists():
            self.add_font("SatoshiMedium", "", str(medium_path))

    def header(self) -> None:
        """Teal band + logo lockup + section title on every page."""
        self.set_fill_color(*TEAL)
        self.rect(0, 0, self.w, 6, "F")
        self.set_fill_color(*TEAL_LIGHT)
        self.rect(0, 6, self.w, 10.5, "F")

        self.set_y(7)
        self.set_text_color(*SLATE)
        logo_drawn = False
        if _HEADER_LOGO_PATH.exists():
            try:
                with Image.open(_HEADER_LOGO_PATH) as logo:
                    ratio = logo.width / max(logo.height, 1)
                logo_h = 10.5
                logo_w = min(50.0, logo_h * ratio)
                self.image(str(_HEADER_LOGO_PATH), x=self.l_margin, y=7, w=logo_w, h=logo_h)
                logo_drawn = True
            except Exception:
                logger.warning("Failed to draw header logo from %s", _HEADER_LOGO_PATH)

        if not logo_drawn:
            self.set_font("SatoshiBlack", "", 9)
            self.cell(0, 8, "Buurt Check", new_x="RIGHT")

        if self.section_title:
            self.set_font("SatoshiMedium", "", 9)
            self.set_text_color(*SECONDARY)
            self.set_x(self.w - self.r_margin - 60)
            self.cell(60, 8, self.section_title, align="R")

        self.set_draw_color(*BORDER)
        self.set_line_width(0.1)
        self.line(self.l_margin, 16, self.w - self.r_margin, 16)

        self.set_y(19)
        self.set_text_color(*SLATE)

    def footer(self) -> None:
        """Brand + disclaimer + teal page number."""
        self.set_y(-15)
        # Teal accent line instead of plain border
        self.set_draw_color(*TEAL)
        self.set_line_width(0.4)
        self.line(self.l_margin, self.get_y(), self.w - self.r_margin, self.get_y())
        self.set_line_width(0.1)

        self.set_y(-12)

        # Brand name — teal accent for brand recognition
        self.set_font("SatoshiBlack", "", 8)
        self.set_text_color(*TEAL)
        brand_w = 30
        self.cell(brand_w, 4, "Buurt Check")

        # Disclaimer — Regular 8pt secondary
        self.set_font("Satoshi", "", 8)
        self.set_text_color(*SECONDARY)
        disclaimer = (
            "Data is indicatief. Verifieer op locatie."
            if self.is_nl
            else "Data is indicative. Verify on-site."
        )
        # Leave room for page number on the right
        page_num_w = 25
        disclaimer_w = self.w - self.l_margin - self.r_margin - brand_w - page_num_w
        self.cell(disclaimer_w, 4, disclaimer, align="C")

        # Page number — teal accent
        self.set_font("SatoshiMedium", "", 8)
        self.set_text_color(*TEAL)
        self.cell(page_num_w, 4, f"p. {self.page_no()}", align="R")
        self.set_text_color(*SLATE)

    def _at_page_top(self) -> bool:
        return self.get_y() <= 24.0

    def draw_h1(self, text: str, *, add_divider: bool = True) -> None:
        """Top-level section heading with optional divider and teal rule."""
        if add_divider and not self._at_page_top():
            self.ln(4)
            self.set_draw_color(*BORDER)
            self.set_line_width(0.2)
            y = self.get_y()
            self.line(self.l_margin, y, self.w - self.r_margin, y)
            self.ln(5)

        self.set_font("SatoshiBlack", "", 12)
        self.set_text_color(*SLATE)
        self.cell(0, 7, text.upper(), new_x="LMARGIN", new_y="NEXT")
        self.set_draw_color(*TEAL)
        self.set_line_width(0.6)
        y = self.get_y()
        self.line(self.l_margin, y, self.w - self.r_margin, y)
        self.ln(4)
        self.set_draw_color(*BORDER)
        self.set_line_width(0.1)
        self.set_text_color(*SLATE)

    def draw_h2(self, text: str) -> None:
        """Sub-section heading with left teal accent bar for hierarchy."""
        y_before = self.get_y()
        self.set_fill_color(*TEAL)
        self.rect(self.l_margin, y_before + 0.5, 1.5, 5.0, "F")
        self.set_x(self.l_margin + 4)
        self.set_font("Satoshi", "B", 11)
        self.set_text_color(*SLATE)
        self.cell(0, 6, text, new_x="LMARGIN", new_y="NEXT")
        self.set_text_color(*SLATE)

    def draw_h3(self, text: str) -> None:
        self.set_font("SatoshiMedium", "", 8)
        self.set_text_color(*SECONDARY)
        self.multi_cell(0, 4, text, align="L", new_x="LMARGIN", new_y="NEXT")
        self.set_text_color(*SLATE)

    def draw_tinted_box(
        self,
        *,
        text: str,
        fill: tuple[int, int, int] = FROST_BG,
        border: tuple[int, int, int] = BORDER,
        accent: tuple[int, int, int] | None = None,
        font_family: str = "Satoshi",
        font_style: str = "",
        font_size: int = 10,
        text_color: tuple[int, int, int] = SLATE,
        padding: float = 3.0,
        line_height: float = 5.0,
    ) -> None:
        box_w = self.w - self.l_margin - self.r_margin
        text_w = box_w - padding * 2 - (3.0 if accent else 0.0)
        text_w = max(text_w, 30.0)
        self.set_font(font_family, font_style, font_size)
        lines = self.multi_cell(
            text_w,
            line_height,
            text,
            dry_run=True,
            output="LINES",
        )
        box_h = padding * 2 + max(1, len(lines)) * line_height
        box_y = self.get_y()
        self.set_fill_color(*fill)
        self.set_draw_color(*border)
        self.set_line_width(0.2)
        self.rect(self.l_margin, box_y, box_w, box_h, "DF")
        if accent is not None:
            self.set_fill_color(*accent)
            self.rect(self.l_margin, box_y, 2.5, box_h, "F")
        text_x = self.l_margin + padding + (3.0 if accent else 0.0)
        self.set_xy(text_x, box_y + padding)
        self.set_font(font_family, font_style, font_size)
        self.set_text_color(*text_color)
        self.multi_cell(
            text_w,
            line_height,
            text,
            align="L",
            new_x="LMARGIN",
            new_y="NEXT",
        )
        self.set_text_color(*SLATE)
        self.set_draw_color(*BORDER)
        self.set_line_width(0.1)
        self.set_y(box_y + box_h + 2)

    # --- Drawing primitives ---

    def draw_score_bar(
        self,
        x: float,
        y: float,
        width: float,
        score: int | None,
        height: float = 4.0,
        *,
        show_threshold_markers: bool = False,
    ) -> None:
        """Draw horizontal score bar: gray track + single colored fill."""
        # Grey track background
        self.set_fill_color(*BORDER)
        self.rect(x, y, width, height, "F")
        # Single-color severity fill — no extra zones or tick dividers
        if score is not None and score > 0:
            fill_w = max(width * min(score, 100) / 100, 1.0)
            self.set_fill_color(*_severity_color(score))
            self.rect(x, y, fill_w, height, "F")
        if show_threshold_markers:
            self.set_draw_color(*SECONDARY)
            self.set_line_width(0.2)
            for threshold in COMPARISON_GUIDES:
                marker_x = x + width * threshold / 100
                self.line(marker_x, y - 0.2, marker_x, y + height + 0.2)
            self.set_draw_color(*BORDER)
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
        Address rows ("This address" / "Dit adres", non-dashed) are sorted first
        with a heavier bar and a visual gap separating them from reference rows.
        Returns y position after the chart (including axis labels and legend).
        """
        if chart_renderer is not None and rows:
            try:
                address_idx = next(
                    (
                        idx
                        for idx, row in enumerate(rows)
                        if _is_address_comparison_label(row[0])
                        and not row[3]
                        and row[1] is not None
                    ),
                    None,
                )
                if address_idx is not None:
                    _, address_score_raw, _, _ = rows[address_idx]
                    address_score = int(round(address_score_raw))
                    comparisons_payload = _build_chart_renderer_comparisons(rows)
                    layout = chart_renderer.build_risk_comparison_layout(
                        category=chart_title or ("Vergelijking" if is_nl else "Comparison"),
                        address_score=address_score,
                        comparisons=comparisons_payload,
                    )
                    chart_png = chart_renderer.render_risk_comparison(
                        category=chart_title or ("Vergelijking" if is_nl else "Comparison"),
                        address_score=address_score,
                        comparisons=comparisons_payload,
                        output_format="png",
                        show_row_labels=False,
                        show_axis_labels=False,
                    )
                    chart_end_y = _embed_chart_png(
                        self,
                        chart_png,
                        x=x,
                        y=y,
                        width=width,
                        source_width_mm=chart_renderer.CHART_WIDTH_MM,
                        source_height_mm=layout.chart_height_mm,
                    )
                    scale = width / chart_renderer.CHART_WIDTH_MM

                    # The PNG omits row labels in this path so the final PDF keeps a
                    # single, extractable text layer without rasterizing labels.
                    line_height = 3.1 * scale
                    label_left = (
                        x
                        + scale * chart_renderer.comparison_data_x_offset_mm(
                            layout,
                            -layout.label_space + 1.0,
                        )
                    )
                    label_right = (
                        x
                        + scale * chart_renderer.comparison_data_x_offset_mm(layout, -0.8)
                    )
                    label_w = max(16.0, label_right - label_left)
                    for row in layout.rows:
                        block_h = max(line_height, row.line_count * line_height)
                        center_y = (
                            y
                            + scale * chart_renderer.comparison_row_center_offset_mm(
                                layout,
                                row.center,
                            )
                        )
                        block_y = center_y - block_h / 2
                        self.set_font("Satoshi", "B" if row.is_primary else "", 8)
                        self.set_text_color(*SLATE)
                        self.set_xy(label_left, block_y)
                        self.multi_cell(
                            label_w,
                            line_height,
                            row.wrapped_label,
                            align="L",
                        )

                    # Keep axis labels extractable in the fpdf2 output while
                    # the PNG focuses on the bars/benchmarks only.
                    axis_y = chart_end_y + 0.5
                    self.set_font("Satoshi", "", 8)
                    self.set_text_color(*SECONDARY)
                    for threshold in (0, *COMPARISON_GUIDES, 100):
                        tick_x = (
                            x
                            + scale * chart_renderer.comparison_data_x_offset_mm(
                                layout,
                                float(threshold),
                            )
                        )
                        self.set_xy(tick_x - 3, axis_y)
                        self.cell(6, 3, str(threshold), align="C")
                    self.set_text_color(*SLATE)
                    cur_y = axis_y + 3.5

                    if show_legend:
                        self.set_xy(x, cur_y + 1.0)
                        self.set_font("Satoshi", "", 8)
                        self.set_text_color(*SECONDARY)
                        legend_text = (
                            "Legenda: ernstkleurige balk = dit adres, "
                            "blauwgrijs = vergelijkingsgroep, lichtblauw = nationaal, "
                            "gestreept = richtlijn"
                            if is_nl
                            else (
                                "Legend: severity-colored bar = this address, "
                                "blue-gray = peer group, light blue = national, "
                                "dashed = benchmark"
                            )
                        )
                        self.multi_cell(
                            width,
                            3.5,
                            legend_text,
                            align="L",
                            new_x="LMARGIN",
                            new_y="NEXT",
                        )
                        self.set_text_color(*SLATE)
                        return self.get_y()
                    return cur_y
            except Exception:
                logger.exception(
                    "chart_renderer comparison chart failed; falling back to native drawing"
                )

        label_w = 40
        score_w = 15
        bar_w = width - label_w - score_w - 4
        bar_h_normal = 3.0
        bar_h_address = 4.5  # heavier bar for address row
        row_h = 7.0
        address_gap = 2.5  # visual gap between address and reference rows
        bar_x = x + label_w + 2
        cur_y = y

        # Sort: address rows first, others preserve order
        address_rows = [
            r for r in rows
            if _is_address_comparison_label(r[0]) and not r[3]
        ]
        reference_rows = [r for r in rows if r not in address_rows]
        sorted_rows = address_rows + reference_rows
        n_address = len(address_rows)
        has_address_gap = bool(address_rows) and bool(reference_rows)
        address_legend_color = address_rows[0][2] if address_rows else TEAL

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
        for pct in COMPARISON_GUIDES:
            gx = bar_x + bar_w * pct / 100
            self.line(gx, bars_top, gx, bars_bottom)
        self.set_line_width(0.1)

        # --- Data rows ---
        row_y = cur_y
        for i, (label, value, color, dashed) in enumerate(sorted_rows):
            is_address = _is_address_comparison_label(label) and not dashed
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

            fill_w = bar_w * min(value or 0, 100) / 100
            if dashed and fill_w > 0:
                segment_w = 3.0
                gap_w = 1.6
                cursor_x = bar_x
                self.set_fill_color(*color)
                while cursor_x < bar_x + fill_w:
                    draw_w = min(segment_w, bar_x + fill_w - cursor_x)
                    self.rect(cursor_x, bar_y, draw_w, bar_h, "F")
                    cursor_x += segment_w + gap_w
            elif fill_w > 0:
                self.set_fill_color(*color)
                self.rect(bar_x, bar_y, fill_w, bar_h, "F")

            self.set_font("Satoshi", "B", 8)
            self.set_xy(x + width - score_w, ry)
            self.cell(score_w, row_h, str(value) if value is not None else "\u2014", align="R")

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
        for threshold in COMPARISON_GUIDES:
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

            # Address swatch — severity-colored when the address row is severity-coded.
            self.set_fill_color(*address_legend_color)
            self.rect(lx, legend_y + 0.5, swatch_w, swatch_h, "F")
            lx += swatch_w + 1
            label_text = "Dit adres" if is_nl else "This address"
            self.set_xy(lx, legend_y)
            self.cell(20, 3, label_text)
            lx += 20 + gap

            # Peer baseline swatch.
            self.set_fill_color(*COMPARISON_PEER)
            self.rect(lx, legend_y + 0.5, swatch_w, swatch_h, "F")
            lx += swatch_w + 1
            label_text = "Vergelijkingsgroep" if is_nl else "Peer group"
            self.set_xy(lx, legend_y)
            self.cell(22, 3, label_text)
            lx += 22 + gap

            # National baseline swatch.
            self.set_fill_color(*COMPARISON_NATIONAL)
            self.rect(lx, legend_y + 0.5, swatch_w, swatch_h, "F")
            lx += swatch_w + 1
            label_text = "Nationaal" if is_nl else "National"
            self.set_xy(lx, legend_y)
            self.cell(18, 3, label_text)
            lx += 18 + gap

            # Segmented amber swatch — "Richtlijn" / "Benchmark".
            self.set_fill_color(*COMPARISON_REFERENCE)
            self.rect(lx, legend_y + 0.5, 1.5, swatch_h, "F")
            self.rect(lx + 2.2, legend_y + 0.5, 1.5, swatch_h, "F")
            self.rect(lx + 4.4, legend_y + 0.5, 0.6, swatch_h, "F")
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
        if chart_renderer is not None:
            try:
                chart_cells = [
                    chart_renderer.RiskCell(
                        category=cat_label,
                        score=score,
                        severity=_severity_code_from_label(sev_label),
                    )
                    for cat_label, score, sev_label in cells
                ]
                chart_png = chart_renderer.render_risk_summary_grid(
                    cells=chart_cells,
                    cols=cols,
                    output_format="png",
                )
                return _embed_chart_png(
                    self,
                    chart_png,
                    x=x,
                    y=y,
                    width=width,
                    source_width_mm=chart_renderer.CHART_WIDTH_MM,
                    source_height_mm=chart_renderer.risk_summary_grid_height_mm(
                        len(chart_cells),
                        cols=cols,
                    ),
                )
            except Exception:
                logger.exception("chart_renderer risk grid failed; falling back to native drawing")

        gap = 4
        cell_w = (width - gap * (cols - 1)) / cols
        cell_h = 33
        rows_needed = (len(cells) + cols - 1) // cols

        for i, (cat_label, score, sev_label) in enumerate(cells):
            col = i % cols
            row = i // cols
            cx = x + col * (cell_w + gap)
            cy = y + row * (cell_h + gap)

            color = _severity_color(score)

            # Card background with severity-tinted top accent bar
            self.set_fill_color(*TILE_BG)
            self.set_draw_color(*BORDER)
            self.set_line_width(0.3)
            self.rect(cx, cy, cell_w, cell_h, "DF")
            # Top accent bar (2mm tall, severity-colored)
            self.set_fill_color(*color)
            self.rect(cx, cy, cell_w, 2.0, "F")

            self.set_font("SatoshiMedium", "", 9)
            self.set_text_color(*SECONDARY)
            self.set_xy(cx, cy + 2.5)
            self.cell(cell_w, 4, cat_label.upper(), align="C")

            self.set_font("SatoshiBlack", "", 22)
            self.set_text_color(*color)
            self.set_xy(cx, cy + 6.5)
            score_text = f"{score}/100" if score is not None else "\u2014"
            self.cell(cell_w, 10, score_text, align="C")

            bar_y = cy + 18.8
            bar_margin = cell_w * 0.1
            self.draw_score_bar(
                cx + bar_margin, bar_y,
                cell_w - 2 * bar_margin, score,
                height=4.0,
                show_threshold_markers=True,
            )

            self.set_font("Satoshi", "", 8)
            self.set_text_color(*color)
            self.set_xy(cx, cy + 24.0)
            self.cell(cell_w, 5, sev_label, align="C")

        self.set_draw_color(*BORDER)
        self.set_line_width(0.1)
        self.set_text_color(*SLATE)
        return y + rows_needed * (cell_h + gap)

    def draw_age_bars(
        self, x: float, y: float, width: float, age_data: AgeProfile
    ) -> float:
        """Draw age distribution horizontal bars. Returns y after bars."""
        if chart_renderer is not None:
            try:
                chart_png = chart_renderer.render_age_distribution(
                    age_data=age_data,
                    output_format="png",
                    is_nl=self.is_nl,
                )
                return _embed_chart_png(
                    self,
                    chart_png,
                    x=x,
                    y=y,
                    width=width,
                    source_width_mm=chart_renderer.CHART_WIDTH_MM,
                    source_height_mm=chart_renderer.AGE_CHART_HEIGHT_MM,
                )
            except Exception:
                logger.exception(
                    "chart_renderer age distribution failed; falling back to native drawing"
                )

        bands = [
            ("0\u201324", age_data.age_0_24, NL_AGE_0_24),
            ("25\u201364", age_data.age_25_64, NL_AGE_25_64),
            ("65+", age_data.age_65_plus, NL_AGE_65_PLUS),
        ]
        label_w = 20
        pct_w = 18
        bar_w = width - label_w - pct_w - 4
        bar_h = 2.2
        row_h = 8.5

        for i, (band_label, pct, national_pct) in enumerate(bands):
            ry = y + i * row_h

            self.set_font("SatoshiMedium", "", 9)
            self.set_text_color(*SECONDARY)
            self.set_xy(x, ry)
            self.cell(label_w, row_h, band_label)

            bar_x = x + label_w + 2
            bar_y = ry + 1.4
            self.set_fill_color(*BORDER)
            self.rect(bar_x, bar_y - 0.2, bar_w, bar_h * 2 + 1.2, "F")

            self.set_fill_color(*PEER_BAR)
            self.rect(bar_x, bar_y, bar_w * national_pct / 100, bar_h, "F")

            if pct is not None and pct > 0:
                fill_w = bar_w * min(pct, 100) / 100
                self.set_fill_color(*TEAL)
                self.rect(bar_x, bar_y + bar_h + 0.8, fill_w, bar_h, "F")

            self.set_font("Satoshi", "B", 9)
            self.set_text_color(*SLATE)
            self.set_xy(x + width - pct_w, ry)
            pct_text = f"{pct:.0f}%" if pct is not None else "\u2014"
            self.cell(pct_w, row_h, pct_text, align="R")

        self.set_text_color(*SLATE)
        legend_y = y + len(bands) * row_h + 1.0
        self.set_fill_color(*TEAL)
        self.rect(x, legend_y + 0.7, 4.5, 2.0, "F")
        self.set_font("Satoshi", "", 8)
        self.set_text_color(*SECONDARY)
        self.set_xy(x + 6, legend_y)
        self.cell(30, 4, "Deze buurt" if self.is_nl else "This neighborhood")
        self.set_fill_color(*PEER_BAR)
        self.rect(x + 34, legend_y + 0.7, 4.5, 2.0, "F")
        self.set_xy(x + 40, legend_y)
        self.cell(20, 4, "Nederland" if self.is_nl else "Netherlands")
        self.set_text_color(*SLATE)
        return legend_y + 4.5

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
        self.cell(
            badge_w, badge_h - 0.4, badge_text,
            align="C", new_x="LMARGIN",
        )

        # Restore defaults
        self.set_text_color(*SLATE)
        self.set_draw_color(*BORDER)
        self.set_fill_color(255, 255, 255)

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
    risks: RiskCardsResponse | None,
    sunlight_score: int | None,
    is_nl: bool,
    crime_score: int | None = None,
) -> list[tuple[str, int | None, str]]:
    """Build cell data for risk grid. Returns 4 cells (or 5 when crime available)."""
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
            # Always produce cells even when risks unavailable (Finding 6)
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

    if crime_score is not None:
        cells.append((
            "Criminaliteit" if is_nl else "Crime",
            crime_score,
            _severity_label(crime_score, is_nl),
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
        caption = (
            "Schaduwbeeld"
            if is_nl
            else "Shadow snapshot"
        )
        pdf.cell(0, 4, caption, new_x="LMARGIN", new_y="NEXT")
        meta = (
            "Indicatief exportbeeld · Bron: 3DBAG / TU Delft + SunCalc"
            if is_nl
            else "Indicative export snapshot · Source: 3DBAG / TU Delft + SunCalc"
        )
        pdf.multi_cell(0, 3.5, meta, align="L", new_x="LMARGIN", new_y="NEXT")
        pdf.set_text_color(*SLATE)
        pdf.ln(1)
    except Exception:
        logger.warning("Failed to embed shadow snapshot in PDF")


# View-label metadata for the summer triptych. Legacy seasonal labels remain
# supported so older exports still render without breaking.
_SHADOW_VIEW_LABELS: dict[str, dict[str, str]] = {
    "top": {"en": "Top view", "nl": "Bovenaanzicht"},
    "front": {"en": "Front facade", "nl": "Voorgevel"},
    "rear": {"en": "Rear facade", "nl": "Achtergevel"},
    "back": {"en": "Rear facade", "nl": "Achtergevel"},
    "winter": {"en": "Winter reference date", "nl": "Winterreferentiedatum"},
    "equinox": {"en": "Spring reference date", "nl": "Lentereferentiedatum"},
    "summer": {"en": "Summer reference date", "nl": "Zomerreferentiedatum"},
}
_SHADOW_TIME_LABELS: dict[str, dict[str, str]] = {
    "morning": {"en": "Morning (09:00)", "nl": "Ochtend (09:00)"},
    "afternoon": {"en": "Afternoon (15:00)", "nl": "Middag (15:00)"},
    "noon": {"en": "Noon (12:00)", "nl": "Middag (12:00)"},
}
_SHADOW_TIME_CLOCKS: dict[str, str] = {
    "morning": "09:00",
    "noon": "12:00",
    "afternoon": "15:00",
}
_SHADOW_VIEW_ORDER = ["top", "front", "rear", "back", "winter", "equinox", "summer"]
_SHADOW_SEASON_ROW_ORDER = ["equinox", "summer", "winter"]
_SHADOW_FACADE_VIEW_ORDER = ["front", "rear"]
_SHADOW_TIME_SERIES_MIN_HEIGHT_MM = 42.0
_SHADOW_SIX_PANEL_MIN_HEIGHT_MM = 36.0
_SHADOW_TAKEAWAY_RESERVED_MM = 10.0


def _normalize_shadow_label(value: str) -> str:
    lower = value.strip().lower()
    # Strip time suffix for view-key lookup (e.g. "front_morning" → "front")
    for suffix in ("_morning", "_afternoon", "_noon"):
        if lower.endswith(suffix):
            lower = lower[: -len(suffix)]
            break
    if lower in {"rear", "back"}:
        return "rear"
    if lower in {"top", "front", "winter", "equinox", "summer"}:
        return lower
    return lower


def _shadow_label_tokens(value: str) -> list[str]:
    return [token for token in value.strip().lower().replace("-", "_").split("_") if token]


def _shadow_season_key(item: dict[str, Any]) -> str:
    for raw in (
        str(item.get("season") or ""),
        str(item.get("label") or ""),
        str(item.get("viewpoint") or ""),
    ):
        normalized = _normalize_shadow_label(raw)
        if normalized in {"winter", "equinox", "summer"}:
            return normalized
        tokens = _shadow_label_tokens(raw)
        if "winter" in tokens:
            return "winter"
        if "spring" in tokens or "equinox" in tokens:
            return "equinox"
        if "summer" in tokens:
            return "summer"
    return ""


def _shadow_viewpoint_from_raw(raw: str) -> str:
    normalized = _normalize_shadow_label(raw)
    if normalized in {"top", "front", "rear"}:
        return normalized
    tokens = _shadow_label_tokens(raw)
    if "top" in tokens:
        return "top"
    if "front" in tokens:
        return "front"
    if "rear" in tokens or "back" in tokens:
        return "rear"
    return ""


def _shadow_view_key(item: dict[str, Any]) -> str:
    preferred = item.get("viewpoint") or item.get("label") or ""
    return _normalize_shadow_label(str(preferred))


def _shadow_layout_context(shadow_images: list[dict[str, Any]]) -> str:
    """Classify the shadow payload so legends and labels stay accurate."""
    if len(shadow_images) >= 6:
        seasons = {_shadow_season_key(item) for item in shadow_images if _shadow_season_key(item)}
        viewpoints = {_shadow_view_key(item) for item in shadow_images if _shadow_view_key(item)}
        if seasons == {"equinox", "summer", "winter"} and viewpoints <= {"front", "rear"}:
            season_view_pairs = {
                (_shadow_season_key(item), _shadow_view_key(item))
                for item in shadow_images
                if _shadow_season_key(item) and _shadow_view_key(item) in {"front", "rear"}
            }
            expected_pairs = {
                (season, viewpoint)
                for season in _SHADOW_SEASON_ROW_ORDER
                for viewpoint in _SHADOW_FACADE_VIEW_ORDER
            }
            if expected_pairs.issubset(season_view_pairs):
                return "seasonal_facades"
        return "summer_multi_view"
    if len(shadow_images) != 3:
        return "default"

    time_keys = [_shadow_time_key(item) for item in shadow_images]
    viewpoints = {_shadow_view_key(item) for item in shadow_images if _shadow_view_key(item)}
    if all(time_keys) and len(viewpoints) == 1:
        return "time_series"
    if viewpoints == {"top", "front", "rear"}:
        return "summer_noon_views"
    if viewpoints == {"winter", "equinox", "summer"}:
        return "seasonal_noon"
    return "default"


def _shadow_overlay_label(
    item: dict[str, Any],
    *,
    is_nl: bool,
    compact_for_row_header: bool = False,
    context_mode: str = "default",
) -> str:
    """Build overlay label for a shadow panel.

    For 6-panel grids the row header already shows time + sun position,
    so the panel overlay shows only the viewpoint name (Top / Front / Rear).
    For legacy 3-panel layouts the overlay includes sun metadata.
    """
    label = _shadow_view_key(item)
    view_text = _SHADOW_VIEW_LABELS.get(label, {}).get("nl" if is_nl else "en", label.title())

    # In 6-panel mode, labels like "front_morning" signal we should be brief
    raw_label = str(item.get("label") or "")
    time_key = _shadow_time_from_label(raw_label) or _shadow_time_key(item)
    if context_mode == "seasonal_facades" and compact_for_row_header:
        return view_text
    if compact_for_row_header and time_key:
        # Just the viewpoint name — time/sun shown in row header
        return view_text

    if context_mode == "time_series" and time_key:
        season_text = "Zomer" if is_nl else "Summer"
        time_text = _SHADOW_TIME_CLOCKS.get(time_key, "12:00")
        return f"{view_text} \u00b7 {season_text} \u00b7 {time_text}"

    azimuth = item.get("sun_azimuth")
    altitude = item.get("sun_altitude")
    if azimuth is not None and altitude is not None:
        sun_text = f"Sun {int(round(float(azimuth)))}\u00b0/{int(round(float(altitude)))}\u00b0"
        if is_nl:
            sun_text = f"Zon {int(round(float(azimuth)))}\u00b0/{int(round(float(altitude)))}\u00b0"
        return f"{view_text} \u00b7 {sun_text}"
    if label in {"top", "front", "rear"}:
        return (
            f"{view_text} \u00b7 Zomerreferentiedatum \u00b7 12:00"
            if is_nl
            else f"{view_text} \u00b7 Summer reference date \u00b7 12:00"
        )
    return (
        f"{view_text} \u00b7 12:00"
        if label
        else ("12:00 zomer" if is_nl else "12:00 summer")
    )


def _shadow_time_from_label(raw_label: str) -> str:
    """Extract time period from a combined viewpoint_time label like 'front_morning'."""
    for suffix in ("morning", "afternoon", "noon"):
        if raw_label.endswith(f"_{suffix}"):
            return suffix
    return ""


def _shadow_time_key(item: dict[str, Any]) -> str:
    raw_label = str(item.get("label") or "")
    from_label = _shadow_time_from_label(raw_label)
    if from_label:
        return from_label
    hour = item.get("hour")
    if isinstance(hour, (int, float)):
        if hour < 12:
            return "morning"
        if hour >= 15:
            return "afternoon"
        return "noon"
    return ""


def _shadow_legend_line(is_nl: bool, *, context_mode: str = "default") -> str:
    if context_mode == "time_series":
        if is_nl:
            return (
                "Legenda: teal omlijning = doelgebouw \u00b7 schaduw = geen directe zon "
                "\u00b7 21 juni als zomerreferentiedatum "
                "\u00b7 topbeelden om 09:00, 12:00 en 15:00 "
                "\u00b7 Bron: 3DBAG / TU Delft + SunCalc"
            )
        return (
            "Legend: teal outline = target building \u00b7 shadow = no direct sun "
            "\u00b7 June 21 summer reference date "
            "\u00b7 top-view snapshots at 09:00, 12:00, and 15:00 "
            "\u00b7 Source: 3DBAG / TU Delft + SunCalc"
        )
    if context_mode == "summer_multi_view":
        if is_nl:
            return (
                "Legenda: teal omlijning = doelgebouw \u00b7 schaduw = geen directe zon "
                "\u00b7 21 juni als zomerreferentiedatum "
                "\u00b7 ochtend- en middagbeelden "
                "\u00b7 Bron: 3DBAG / TU Delft + SunCalc"
            )
        return (
            "Legend: teal outline = target building \u00b7 shadow = no direct sun "
            "\u00b7 June 21 summer reference date \u00b7 morning and afternoon snapshots "
            "\u00b7 Source: 3DBAG / TU Delft + SunCalc"
        )
    if context_mode == "summer_noon_views":
        if is_nl:
            return (
                "Legenda: teal omlijning = doelgebouw \u00b7 schaduw = geen directe zon "
                "\u00b7 21 juni als zomerreferentiedatum om 12:00 lokale tijd "
                "\u00b7 top-, voor- en achteraanzicht "
                "\u00b7 Bron: 3DBAG / TU Delft + SunCalc"
            )
        return (
            "Legend: teal outline = target building \u00b7 shadow = no direct sun "
            "\u00b7 June 21 summer reference date at 12:00 local time "
            "\u00b7 top, front, and rear views "
            "\u00b7 Source: 3DBAG / TU Delft + SunCalc"
        )
    if context_mode == "seasonal_noon":
        if is_nl:
            return (
                "Legenda: teal omlijning = doelgebouw \u00b7 schaduw = geen directe zon "
                "\u00b7 21 december / 20 maart / 21 juni als seizoensreferentiedata om 12:00 "
                "lokale tijd \u00b7 Bron: 3DBAG / TU Delft + SunCalc"
            )
        return (
            "Legend: teal outline = target building \u00b7 shadow = no direct sun "
            "\u00b7 December 21 / March 20 / June 21 seasonal reference dates at 12:00 local "
            "time \u00b7 Source: 3DBAG / TU Delft + SunCalc"
        )
    if context_mode == "seasonal_facades":
        if is_nl:
            return (
                "Legenda: teal omlijning = doelgebouw \u00b7 schaduw = geen directe zon "
                "\u00b7 lente- / zomer- / winterreferentiedata om 12:00 lokale tijd "
                "\u00b7 voor- en achtergevel \u00b7 Bron: 3DBAG / TU Delft + SunCalc"
            )
        return (
            "Legend: teal outline = target building \u00b7 shadow = no direct sun "
            "\u00b7 spring / summer / winter reference dates at 12:00 local time "
            "\u00b7 front and rear facades \u00b7 Source: 3DBAG / TU Delft + SunCalc"
        )
    if is_nl:
        return (
            "Legenda: teal omlijning = doelgebouw \u00b7 schaduw = geen directe zon "
            "\u00b7 21 december / 20 maart / 21 juni als seizoensreferentiedata om 12:00 "
            "lokale tijd \u00b7 Bron: 3DBAG / TU Delft + SunCalc"
        )
    return (
        "Legend: teal outline = target building \u00b7 shadow = no direct sun "
        "\u00b7 December 21 / March 20 / June 21 seasonal reference dates at 12:00 local time "
        "\u00b7 Source: 3DBAG / TU Delft + SunCalc"
    )


def _shadow_takeaway(
    shadow_images: list[dict[str, Any]],
    *,
    is_nl: bool,
    context_mode: str,
) -> str:
    """Buyer-facing takeaway line keyed to the classified shadow layout."""
    del shadow_images
    if context_mode == "summer_multi_view":
        return (
            "Vergelijk ochtend en middag om te zien waar tuin of gevel later op de dag dichttrekt."
            if is_nl
            else (
                "Compare morning and afternoon to see which outdoor areas "
                "or facades lose sun later in the day."
            )
        )
    if context_mode == "time_series":
        return (
            "Hetzelfde aanzicht blijft vast, zodat je direct ziet hoe de zon "
            "tussen 09:00 en 15:00 verschuift."
            if is_nl
            else (
                "The viewpoint stays fixed so you can compare how direct sun "
                "shifts between 09:00 and 15:00."
            )
        )
    if context_mode == "summer_noon_views":
        return (
            "Deze drie zomerbeelden tonen hetzelfde moment vanuit boven, voor en achter, "
            "zodat blinde hoeken minder snel worden gemist."
            if is_nl
            else (
                "These three summer-noon views show the same moment from above, "
                "front, and rear so fewer blind spots are missed."
            )
        )
    if context_mode == "seasonal_noon":
        return (
            "Seizoensvergelijking op hetzelfde middagmoment laat zien of winterzon "
            "hier duidelijk zwakker is dan in voorjaar en zomer."
            if is_nl
            else (
                "A same-time seasonal comparison shows whether winter sun drops off "
                "materially versus spring and summer."
            )
        )
    if context_mode == "seasonal_facades":
        return (
            "Vergelijk voor- en achtergevel in lente, zomer en winter om te zien "
            "waar zonlicht het langst blijft."
            if is_nl
            else (
                "Compare front and rear facades across spring, summer, and winter "
                "to see where sunlight lasts longest."
            )
        )
    return (
        "Gebruik deze beelden als indicatie van waar directe zon het snelst "
        "verdwijnt rond het gebouw."
        if is_nl
        else (
            "Use these snapshots to spot where direct sun disappears fastest "
            "around the building."
        )
    )


def _draw_shadow_panel(
    pdf: BuurtCheckPDF,
    img_data: dict[str, Any],
    x: float,
    y: float,
    w: float,
    h: float,
    *,
    is_nl: bool,
    compact_for_row_header: bool = False,
    context_mode: str = "default",
) -> bool:
    """Draw a single shadow panel with overlay label. Returns True on success."""
    b64 = img_data.get("image_b64", "")
    if not b64:
        return False
    try:
        image_bytes = base64.b64decode(b64)
    except Exception:
        logger.warning("Failed to decode shadow image")
        return False

    try:
        pdf.image(io.BytesIO(image_bytes), x=x, y=y, w=w, h=h)
    except Exception:
        logger.warning("Failed to embed shadow image in PDF")
        return False

    pdf.set_draw_color(*BORDER)
    pdf.set_line_width(0.2)
    pdf.rect(x, y, w, h, "D")

    overlay_text = _shadow_overlay_label(
        img_data,
        is_nl=is_nl,
        compact_for_row_header=compact_for_row_header,
        context_mode=context_mode,
    )
    pdf.set_font("SatoshiMedium", "", 7)
    label_w = min(w - 3.0, pdf.get_string_width(overlay_text) + 5.0)
    label_h = 4.8
    label_x = x + 1.5
    label_y = y + 1.5
    pdf.set_fill_color(*WHITE)
    pdf.set_draw_color(*WHITE)
    pdf.rect(label_x, label_y, label_w, label_h, "DF")
    pdf.set_text_color(*SLATE)
    pdf.set_xy(label_x + 1.0, label_y + 0.6)
    pdf.cell(label_w - 2.0, label_h - 1.0, overlay_text)

    return True


def _draw_shadow_triptych(
    pdf: BuurtCheckPDF,
    shadow_images: list[dict],
    is_nl: bool,
) -> None:
    """Draw shadow panels — 6-panel grid (3 views × 2 times) or legacy 3-panel.

    6-panel layout (3 cols × 2 rows):
        Row 1: top-morning    | front-morning    | rear-morning
        Row 2: top-afternoon  | front-afternoon  | rear-afternoon

    Each panel shows the target building from one angle at one time of day.
    Morning (09:00 CEST) and afternoon (15:00 CEST) produce clearly different
    shadow directions, making it easy to assess sunlight exposure.
    """
    if not shadow_images:
        return

    context_mode = _shadow_layout_context(shadow_images)
    takeaway_text = _shadow_takeaway(shadow_images, is_nl=is_nl, context_mode=context_mode)

    # If fewer than 3 images, fall back to single image
    if len(shadow_images) < 3:
        first = shadow_images[0]
        _ensure_page_space(pdf, 96.0)
        pdf.draw_premium_badge()
        pdf.draw_h1("Schaduwanalyse" if is_nl else "Shadow Analysis", add_divider=False)
        _draw_shadow_image(pdf, first.get("image_b64"), is_nl)
        return

    page_w = pdf.w - pdf.l_margin - pdf.r_margin
    gap = 2.5

    # Determine if we have 6-panel (morning + afternoon) or legacy 3-panel
    is_six_panel = len(shadow_images) >= 6

    if is_six_panel:
        rendered = 0
        if context_mode == "seasonal_facades":
            season_view_map: dict[tuple[str, str], dict[str, Any]] = {
                (_shadow_season_key(item), _shadow_view_key(item)): item
                for item in shadow_images
                if _shadow_season_key(item) in _SHADOW_SEASON_ROW_ORDER
                and _shadow_view_key(item) in _SHADOW_FACADE_VIEW_ORDER
            }
            seasonal_rows = [
                (
                    season,
                    [
                        season_view_map[(season, viewpoint)]
                        for viewpoint in _SHADOW_FACADE_VIEW_ORDER
                        if (season, viewpoint) in season_view_map
                    ],
                )
                for season in _SHADOW_SEASON_ROW_ORDER
            ]
            seasonal_rows = [
                (season, row_imgs) for season, row_imgs in seasonal_rows if len(row_imgs) == 2
            ]
            if len(seasonal_rows) != 3:
                # Fall back to incoming order if classification was overly optimistic.
                seasonal_rows = [
                    (
                        season,
                        shadow_images[idx * 2: idx * 2 + 2],
                    )
                    for idx, season in enumerate(_SHADOW_SEASON_ROW_ORDER)
                ]

            row_gap = 2.0
            row_label_h = 5.5
            col_w = (page_w - gap) / 2
            reserved_after_panels = 14.0 + _SHADOW_TAKEAWAY_RESERVED_MM
            minimum_total_h = (
                len(seasonal_rows) * (row_label_h + _SHADOW_SIX_PANEL_MIN_HEIGHT_MM)
                + (len(seasonal_rows) - 1) * row_gap
                + reserved_after_panels
            )

            _ensure_page_space(pdf, minimum_total_h + 18.0)
            pdf.draw_premium_badge()
            pdf.draw_h1("Schaduwanalyse" if is_nl else "Shadow Analysis", add_divider=False)

            rows_top_y = pdf.get_y()
            available_for_rows = (
                pdf.h
                - pdf.b_margin
                - reserved_after_panels
                - rows_top_y
                - (len(seasonal_rows) - 1) * row_gap
                - len(seasonal_rows) * row_label_h
            )
            col_h = max(
                _SHADOW_SIX_PANEL_MIN_HEIGHT_MM,
                available_for_rows / max(1, len(seasonal_rows)),
            )

            for row_index, (season, row_imgs) in enumerate(seasonal_rows):
                season_text = _SHADOW_VIEW_LABELS.get(season, {}).get(
                    "nl" if is_nl else "en",
                    season.title(),
                )
                az = row_imgs[0].get("sun_azimuth")
                alt = row_imgs[0].get("sun_altitude")
                if az is not None and alt is not None:
                    sun_text = (
                        f"Zon {int(round(float(az)))}\u00b0/{int(round(float(alt)))}\u00b0"
                        if is_nl
                        else f"Sun {int(round(float(az)))}\u00b0/{int(round(float(alt)))}\u00b0"
                    )
                    season_text = (
                        f"{season_text} \u00b7 12:00 \u00b7 {sun_text}"
                    )
                else:
                    season_text = f"{season_text} \u00b7 12:00"

                pdf.set_font("SatoshiMedium", "", 8)
                pdf.set_text_color(*SECONDARY)
                pdf.cell(0, row_label_h, season_text, new_x="LMARGIN", new_y="NEXT")
                pdf.set_text_color(*SLATE)

                row_y = pdf.get_y()
                for col_idx, img_data in enumerate(row_imgs):
                    x = pdf.l_margin + col_idx * (col_w + gap)
                    ok = _draw_shadow_panel(
                        pdf,
                        img_data,
                        x,
                        row_y,
                        col_w,
                        col_h,
                        is_nl=is_nl,
                        compact_for_row_header=True,
                        context_mode=context_mode,
                    )
                    if ok:
                        rendered += 1

                next_y = row_y + col_h
                if row_index < len(seasonal_rows) - 1:
                    next_y += row_gap
                pdf.set_y(next_y)
        else:
            view_rank = {s: i for i, s in enumerate(_SHADOW_VIEW_ORDER)}
            time_rank = {"morning": 0, "afternoon": 1, "noon": 2}

            sorted_imgs = sorted(
                shadow_images[:6],
                key=lambda s: (
                    time_rank.get(_shadow_time_key(s), 99),
                    view_rank.get(_shadow_view_key(s), 99),
                    s.get("hour", 0),
                ),
            )
            morning_imgs = [s for s in sorted_imgs if _shadow_time_key(s) == "morning"][:3]
            afternoon_imgs = [s for s in sorted_imgs if _shadow_time_key(s) == "afternoon"][:3]
            if len(morning_imgs) < 3 or len(afternoon_imgs) < 3:
                # Fall back to renderer order when metadata is incomplete.
                morning_imgs = shadow_images[:3]
                afternoon_imgs = shadow_images[3:6]

            # 3 columns × 2 rows
            col_w = (page_w - gap * 2) / 3
            col_h = max(_SHADOW_SIX_PANEL_MIN_HEIGHT_MM, col_w * 0.75)
            row_gap = 2.5
            time_label_h = 6.0  # row header height

            total_h = (
                time_label_h + col_h + row_gap  # morning row
                + time_label_h + col_h           # afternoon row
                + 14.0                            # legend + spacing
                + _SHADOW_TAKEAWAY_RESERVED_MM
            )

            _ensure_page_space(pdf, total_h + 18.0)
            pdf.draw_premium_badge()
            pdf.draw_h1("Schaduwanalyse" if is_nl else "Shadow Analysis", add_divider=False)

            summer_rows = [
                (morning_imgs, "morning"),
                (afternoon_imgs, "afternoon"),
            ]
            for row_index, (row_imgs, time_key) in enumerate(summer_rows):
                # Row time label
                time_text = _SHADOW_TIME_LABELS.get(time_key, {}).get(
                    "nl" if is_nl else "en", time_key.title(),
                )
                # Extract sun position from first image in this row
                az = row_imgs[0].get("sun_azimuth")
                alt = row_imgs[0].get("sun_altitude")
                if az is not None and alt is not None:
                    sun_str = (
                        f"Zon {int(round(float(az)))}\u00b0/{int(round(float(alt)))}\u00b0"
                        if is_nl
                        else f"Sun {int(round(float(az)))}\u00b0/{int(round(float(alt)))}\u00b0"
                    )
                    time_text = f"{time_text} \u00b7 {sun_str}"

                pdf.set_font("SatoshiMedium", "", 8)
                pdf.set_text_color(*SECONDARY)
                pdf.cell(0, time_label_h, time_text, new_x="LMARGIN", new_y="NEXT")
                pdf.set_text_color(*SLATE)

                row_y = pdf.get_y()

                for col_idx, img_data in enumerate(row_imgs):
                    x = pdf.l_margin + col_idx * (col_w + gap)
                    ok = _draw_shadow_panel(
                        pdf,
                        img_data,
                        x,
                        row_y,
                        col_w,
                        col_h,
                        is_nl=is_nl,
                        compact_for_row_header=True,
                        context_mode=context_mode,
                    )
                    if ok:
                        rendered += 1

                next_y = row_y + col_h
                if row_index < len(summer_rows) - 1:
                    next_y += row_gap
                pdf.set_y(next_y)

    else:
        view_rank = {s: i for i, s in enumerate(_SHADOW_VIEW_ORDER)}
        sorted_imgs = sorted(
            shadow_images[:3],
            key=(
                (lambda s: s.get("hour", 0))
                if context_mode == "time_series"
                else (
                    lambda s: view_rank.get(
                        _shadow_view_key(s),
                        s.get("hour", 0),
                    )
                )
            ),
        )

        if context_mode == "time_series":
            col_w = (page_w - gap * 2) / 3
            col_h = max(_SHADOW_TIME_SERIES_MIN_HEIGHT_MM, col_w * 0.78)
            total_h = col_h + 14.0 + _SHADOW_TAKEAWAY_RESERVED_MM

            _ensure_page_space(pdf, total_h + 18.0)
            pdf.draw_premium_badge()
            pdf.draw_h1("Schaduwanalyse" if is_nl else "Shadow Analysis", add_divider=False)

            rendered = 0
            row_y = pdf.get_y()
            for idx, img_data in enumerate(sorted_imgs):
                x = pdf.l_margin + idx * (col_w + gap)
                ok = _draw_shadow_panel(
                    pdf,
                    img_data,
                    x,
                    row_y,
                    col_w,
                    col_h,
                    is_nl=is_nl,
                    context_mode=context_mode,
                )
                if ok:
                    rendered += 1
            pdf.set_y(row_y + col_h)
        else:
            # Legacy 3-panel layout: top (full width) + front/rear side-by-side
            top_w = page_w
            top_h = top_w * 0.56
            bottom_w = (page_w - gap) / 2
            bottom_h = bottom_w * 0.56
            total_h = top_h + gap + bottom_h + 14.0 + _SHADOW_TAKEAWAY_RESERVED_MM

            _ensure_page_space(pdf, total_h + 18.0)
            pdf.draw_premium_badge()
            pdf.draw_h1("Schaduwanalyse" if is_nl else "Shadow Analysis", add_divider=False)

            rendered = 0
            for idx, img_data in enumerate(sorted_imgs):
                if idx == 0:
                    x = pdf.l_margin
                    cur_y = pdf.get_y()
                    cur_w, cur_h = top_w, top_h
                elif idx == 1:
                    cur_y = pdf.get_y() + gap
                    x = pdf.l_margin
                    cur_w, cur_h = bottom_w, bottom_h
                else:
                    x = pdf.l_margin + bottom_w + gap
                    cur_w, cur_h = bottom_w, bottom_h

                ok = _draw_shadow_panel(
                    pdf,
                    img_data,
                    x,
                    cur_y,
                    cur_w,
                    cur_h,
                    is_nl=is_nl,
                    context_mode=context_mode,
                )
                if ok:
                    rendered += 1
                if idx == 0:
                    pdf.set_y(cur_y + cur_h)
                elif idx == 2:
                    pdf.set_y(cur_y + cur_h)

    if rendered:
        pdf.set_y(pdf.get_y() + 3.0)
        pdf.draw_tinted_box(
            text=_shadow_legend_line(is_nl, context_mode=context_mode),
            fill=WHITE,
            border=BORDER,
            accent=TEAL,
            font_family="Satoshi",
            font_style="",
            font_size=8,
            text_color=SECONDARY,
            padding=2.2,
            line_height=3.6,
        )
        pdf.ln(1.0)
        pdf.set_font("Satoshi", "", 9)
        pdf.set_text_color(*SLATE)
        pdf.multi_cell(0, 4.2, takeaway_text, new_x="LMARGIN", new_y="NEXT")
    else:
        # No panels rendered — show an explicit unavailable placeholder
        # instead of leaving blank space below the heading.
        pdf.set_font("Satoshi", "", 9)
        pdf.set_text_color(*SECONDARY)
        unavailable_msg = (
            "Schaduwanalyse niet beschikbaar. De 3D-weergave was niet geladen "
            "v\u00f3\u00f3r export. Exporteer opnieuw nadat je het 3D-model hebt geopend."
            if is_nl
            else "Shadow analysis unavailable. The 3D viewer was not loaded "
            "before export. Re-export after opening the 3D model."
        )
        pdf.multi_cell(0, 4.5, unavailable_msg, new_x="LMARGIN", new_y="NEXT")
        pdf.set_text_color(*SLATE)


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
# LaTeX orchestration helpers
# ---------------------------------------------------------------------------


def _model_to_dict(model: Any) -> dict[str, Any] | None:
    """Convert Pydantic models to plain dicts for Jinja templates."""
    if model is None:
        return None
    model_dump = getattr(model, "model_dump", None)
    if callable(model_dump):
        return model_dump(exclude_none=False)
    if isinstance(model, dict):
        return model
    return None


def _escape_latex_structure(value: Any) -> Any:
    if isinstance(value, str):
        return escape_latex(value)
    if isinstance(value, list):
        return [_escape_latex_structure(item) for item in value]
    if isinstance(value, dict):
        return {key: _escape_latex_structure(item) for key, item in value.items()}
    return value


def _image_file_extension(raw: bytes) -> str:
    if raw.startswith(b"\x89PNG"):
        return "png"
    if raw.startswith(b"\xff\xd8\xff"):
        return "jpg"
    if raw.startswith((b"GIF87a", b"GIF89a")):
        return "gif"
    return "png"


def _decode_b64_asset(
    b64_data: str | None,
    *,
    output_dir: Path,
    filename_stem: str,
) -> str | None:
    """Decode a base64 image payload to a temporary file for LaTeX."""
    if not b64_data:
        return None
    try:
        payload = b64_data.split(",", 1)[-1]
        raw = base64.b64decode(payload)
        output_path = output_dir / f"{filename_stem}.{_image_file_extension(raw)}"
        output_path.write_bytes(raw)
        return output_path.as_posix()
    except Exception:
        logger.warning("Invalid base64 asset for %s; skipping", filename_stem)
        return None


def _write_chart_asset(
    chart_data: bytes | None,
    *,
    output_dir: Path,
    filename_stem: str,
) -> str | None:
    if not isinstance(chart_data, (bytes, bytearray)):
        return None

    ext = "png"
    if bytes(chart_data).startswith(b"%PDF-"):
        ext = "pdf"
    elif bytes(chart_data).startswith(b"\x89PNG"):
        ext = "png"

    output_path = output_dir / f"{filename_stem}.{ext}"
    output_path.write_bytes(bytes(chart_data))
    return output_path.as_posix()


def _slugify_label(value: str) -> str:
    slug = "".join(ch.lower() if ch.isalnum() else "_" for ch in value)
    while "__" in slug:
        slug = slug.replace("__", "_")
    return slug.strip("_") or "chart"


def _ensure_page_space(pdf: BuurtCheckPDF, required_h: float) -> None:
    if pdf.will_page_break(required_h):
        pdf.add_page()


def _dedupe_comparison_rows(
    rows: list[tuple[str, int | float | None, tuple[int, int, int], bool]],
) -> list[tuple[str, int | float | None, tuple[int, int, int], bool]]:
    """Keep the first comparison row for each rendered label."""
    deduped: list[tuple[str, int | float | None, tuple[int, int, int], bool]] = []
    seen_labels: set[str] = set()
    for label, value, color, dashed in rows:
        normalized = " ".join(label.split())
        if normalized in seen_labels:
            continue
        seen_labels.add(normalized)
        deduped.append((label, value, color, dashed))
    return deduped


def _comparison_role_from_style(
    label: str,
    color: tuple[int, int, int],
    dashed: bool,
) -> str:
    if dashed:
        return "reference"
    if _is_national_comparison_label(label) or color == COMPARISON_NATIONAL:
        return "national"
    if color == COMPARISON_PEER:
        return "peer"
    return "comparison"


def _build_chart_renderer_comparisons(
    rows: list[tuple[str, int | float | None, tuple[int, int, int], bool]],
) -> list[Any]:
    if chart_renderer is None:
        return []
    comparisons_payload: list[Any] = []
    for label, value, color, dashed in rows:
        if value is None or _is_address_comparison_label(label):
            continue
        comparisons_payload.append(
            chart_renderer.CompRow(
                label=label,
                value=int(round(value)),
                role=_comparison_role_from_style(label, color, dashed),
            )
        )
    return comparisons_payload


def _draw_notes_section(pdf: BuurtCheckPDF, is_nl: bool) -> None:
    pdf.set_text_color(*SLATE)
    pdf.set_font("Satoshi", "B", 12)
    pdf.cell(
        0, 7,
        "Uw notities" if is_nl else "Your viewing notes",
        new_x="LMARGIN", new_y="NEXT",
    )
    pdf.set_font("Satoshi", "", 8)
    pdf.set_text_color(*SECONDARY)
    pdf.multi_cell(
        0,
        3.8,
        (
            "Noteer directe antwoorden, herstelkosten en documenten die de makelaar nog moet delen."
            if is_nl
            else (
                "Use this space for answers, repair quotes, "
                "and documents the agent still needs to share."
            )
        ),
        align="L",
        new_x="LMARGIN",
        new_y="NEXT",
    )
    pdf.set_text_color(*SLATE)
    pdf.ln(2)
    pdf.draw_tinted_box(
        text=(
            "Log before you leave: agreed repair quotes, promised documents, "
            "and the next follow-up date."
            if not is_nl
            else (
                "Noteer voor vertrek: afgesproken herstelkosten, toegezegde "
                "documenten en de volgende vervolgdatum."
            )
        ),
        fill=TILE_BG,
        border=BORDER,
        accent=TEAL,
        font_family="Satoshi",
        font_style="",
        font_size=8,
        text_color=SLATE,
        padding=2.3,
        line_height=3.8,
    )

    pdf.set_draw_color(*BORDER)
    pdf.set_line_width(0.1)
    # Fixed compact count — no dynamic expansion to fill page
    for _ in range(_NOTES_RULE_COUNT):
        y = pdf.get_y()
        pdf.line(pdf.l_margin, y, pdf.w - pdf.r_margin, y)
        pdf.ln(_NOTES_RULE_SPACING_MM)


def _primary_shadow_from_triptych(shadow_images: list[dict[str, Any]] | None) -> str | None:
    """Pick a deterministic primary shadow image from triptych payload."""
    if not shadow_images:
        return None
    ordered = [
        s for s in shadow_images if isinstance(s, dict) and s.get("image_b64")
    ]
    if not ordered:
        return None
    top_noon = next(
        (
            item
            for item in ordered
            if _shadow_view_key(item) == "top" and _shadow_time_key(item) == "noon"
        ),
        None,
    )
    if top_noon is not None:
        return str(top_noon.get("image_b64") or "")
    top = next(
        (
            item
            for item in ordered
            if _normalize_shadow_label(str(item.get("label", ""))) == "top"
        ),
        None,
    )
    if top is not None:
        return str(top.get("image_b64") or "")

    winter = next(
        (
            item
            for item in ordered
            if str(item.get("label", "")).strip().lower().startswith("winter")
        ),
        None,
    )
    if winter is not None:
        return str(winter.get("image_b64") or "")

    noon = next((item for item in ordered if int(item.get("hour", -1)) == 12), None)
    if noon is not None:
        return str(noon.get("image_b64") or "")
    return str(ordered[0].get("image_b64") or "")


def _sunlight_state(
    risks: RiskCardsResponse | None,
    sunlight_score: int | None,
    *,
    is_nl: bool = False,
    has_shadow_inputs: bool = False,
) -> tuple[str, str | None, str | None]:
    """Return sunlight rendering state + bilingual pending/unavailable messages."""
    sun = risks.sunlight if risks else None
    has_metrics = any(
        metric is not None
        for metric in (
            sunlight_score,
            getattr(sun, "score", None),
            getattr(sun, "winter_hours", None),
            getattr(sun, "equinox_hours", None),
            getattr(sun, "summer_hours", None),
        )
    )
    if has_metrics:
        return "available", None, None

    pending = (
        "Zonlichtanalyse was niet voltooid voor export. Exporteer opnieuw nadat je het "
        "3D-model hebt bekeken om zonlichtdata op te nemen."
        if is_nl
        else "Sunlight analysis was not completed before export. Re-export after viewing "
        "the 3D model to include sunlight data."
    )
    unavailable = (
        "Zonlichtanalyse is niet beschikbaar voor deze export omdat vereiste 3D-invoer "
        "ontbrak. Exporteer opnieuw na het openen van het 3D-model."
        if is_nl
        else "Sunlight analysis is unavailable for this export because required 3D inputs "
        "were missing. Re-export after opening the 3D model."
    )
    if has_shadow_inputs or sun is not None:
        return "pending", pending, None
    return "error", None, unavailable


def _methodology_payload(*, is_nl: bool) -> dict[str, Any]:
    if is_nl:
        intro = (
            "Alle risicoscores zijn genormaliseerd naar een schaal van 0-100, waarbij hoger "
            "beter is. Scores volgen WHO-richtlijnen voor geluid en luchtkwaliteit, "
            "Klimaateffectatlas-modellen voor hitte en water, en geometrische 3D-zonanalyse "
            "voor direct zonlicht."
        )
        formulas = [
            {
                "category": "Geluid",
                "formula": "40 dB Lden = 100, 90 dB Lden = 0, lineaire interpolatie.",
            },
            {
                "category": "Luchtkwaliteit",
                "formula": (
                    "Slechtste van PM2.5 en NO2. PM2.5: 5 ug/m3 = 100, 25 ug/m3 = 0. "
                    "NO2: 10 ug/m3 = 100, 40 ug/m3 = 0."
                ),
            },
            {
                "category": "Klimaatstress",
                "formula": (
                    "Slechtste van hittestress en wateroverlast. Laag risico = 85, "
                    "gemiddeld = 50, hoog = 15."
                ),
            },
            {
                "category": "Zonlicht",
                "formula": "Winterzonnewende directe zonuren / 6 x 100. 6+ uur = 100.",
            },
        ]
        sunlight_method = [
            {
                "label": "Zonnepositie",
                "description": "SunCalc (azimut vanaf noord, hoogte vanaf horizon).",
            },
            {
                "label": "Tijdsresolutie",
                "description": (
                    "30-minutenintervallen, 12 representatieve dagen per jaar "
                    "(de 21e van elke maand)."
                ),
            },
            {
                "label": "Ruimtelijke resolutie",
                "description": "1 m dakgrid, maximaal 256 meetpunten.",
            },
            {
                "label": "Obstructies",
                "description": (
                    "Alleen 3DBAG-gebouwen; vegetatie en tijdelijke objecten "
                    "zijn uitgesloten."
                ),
            },
            {
                "label": "Atmosferisch",
                "description": "Heldere-hemelanalyse (geen bewolking/weer).",
            },
            {
                "label": "Meetvlak",
                "description": "Dakvlak (niet raam- of balkonvlak).",
            },
        ]
        limitations = (
            "Alle gegevens zijn indicatief en vervangen geen professionele bouwinspectie. "
            "Milieumetingen geven mogelijk geen micro-lokale omstandigheden weer."
        )
        peer_disclosure = (
            "Waar 'vergelijkingswaarde' wordt getoond, zijn waarden gemodelleerd op basis "
            "van de stedelijkheidscategorie van het adres, niet gemiddeld over de volledige "
            "gemeente."
        )
    else:
        intro = (
            "All risk scores are normalized to a 0-100 scale where higher is better. "
            "Scores follow WHO guidance for noise and air quality, Klimaateffectatlas "
            "models for heat and water stress, and geometric 3D sun analysis for direct light."
        )
        formulas = [
            {
                "category": "Noise",
                "formula": "40 dB Lden = 100, 90 dB Lden = 0, linear interpolation.",
            },
            {
                "category": "Air quality",
                "formula": (
                    "Worst of PM2.5 and NO2. PM2.5: 5 ug/m3 = 100, 25 ug/m3 = 0. "
                    "NO2: 10 ug/m3 = 100, 40 ug/m3 = 0."
                ),
            },
            {
                "category": "Climate stress",
                "formula": (
                    "Worst of heat stress and water stress. Low risk = 85, medium = 50, "
                    "high = 15."
                ),
            },
            {
                "category": "Sunlight",
                "formula": "Winter solstice direct sun hours / 6 x 100. 6+ hours = 100.",
            },
        ]
        sunlight_method = [
            {
                "label": "Solar position",
                "description": "SunCalc (azimuth from north, altitude from horizon).",
            },
            {
                "label": "Temporal",
                "description": (
                    "30-minute intervals, 12 representative days per year "
                    "(the 21st of each month)."
                ),
            },
            {
                "label": "Spatial",
                "description": "1 m roof grid, up to 256 sample points.",
            },
            {
                "label": "Obstructions",
                "description": (
                    "3DBAG buildings only; vegetation and temporary objects are excluded."
                ),
            },
            {
                "label": "Atmospheric",
                "description": "Clear-sky analysis (no cloud/weather correction).",
            },
            {
                "label": "Target plane",
                "description": "Roof surface (not window or balcony plane).",
            },
        ]
        limitations = (
            "All data is indicative and should not replace professional building inspection. "
            "Environmental measurements may not reflect micro-local conditions."
        )
        peer_disclosure = (
            "Where 'peer baseline' is shown, values are modeled from the address urbanization "
            "category, not averaged from the municipality's full distribution."
        )

    return {
        "intro": intro,
        "formula_heading": "Scoringformules" if is_nl else "Scoring formulas",
        "formulas": formulas,
        "sources_heading": "Databronnen" if is_nl else "Data sources",
        "sources": [
            {
                "source": "BAG (Kadaster)",
                "data_type": "Gebouwgegevens" if is_nl else "Building data",
                "protocol": "WFS verblijfsobject",
            },
            {
                "source": "3DBAG (TU Delft)",
                "data_type": "3D-geometrie" if is_nl else "3D geometry",
                "protocol": "OGC API Features (CityJSON)",
            },
            {
                "source": "RIVM",
                "data_type": "Geluid (Lden wegen)" if is_nl else "Noise (Lden roads)",
                "protocol": "WMS lden_wegverkeer",
            },
            {
                "source": "RIVM",
                "data_type": "Luchtkwaliteit" if is_nl else "Air quality",
                "protocol": "WMS conc_NO2, conc_PM25",
            },
            {
                "source": "Klimaateffectatlas",
                "data_type": "Klimaatstress" if is_nl else "Climate stress",
                "protocol": "WMS + WFS",
            },
            {
                "source": "CBS",
                "data_type": "Buurtstatistieken" if is_nl else "Neighborhood stats",
                "protocol": "OGC API Features",
            },
            {
                "source": "Leefbaarometer",
                "data_type": "Leefbaarheid" if is_nl else "Livability",
                "protocol": "WFS 2.0",
            },
            {
                "source": "SunCalc + 3DBAG",
                "data_type": "Zonlichtanalyse" if is_nl else "Sunlight analysis",
                "protocol": "Ray-casting",
            },
        ],
        "sunlight_heading": (
            "Methode zonlichtanalyse" if is_nl else "Sunlight analysis method"
        ),
        "sunlight_method": sunlight_method,
        "peer_disclosure": peer_disclosure,
        "limitations_heading": (
            "Belangrijke beperkingen" if is_nl else "Important limitations"
        ),
        "limitations": limitations,
    }


def _generate_quick_brief_latex(
    address: str,
    building_year: int | None,
    building_use: str | None,
    risks: RiskCardsResponse | None,
    sunlight_score: int | None,
    viewing_questions: ViewingQuestionsResponse | None,
    shadow_image_b64: str | None = None,
    language: str = "en",
    floor_area: int | None = None,
    shadow_equinox_b64: str | None = None,
    shadow_summer_b64: str | None = None,
) -> bytes:
    """Generate quick brief via LaTeX with fpdf2 fallback."""
    try:

        def _fallback() -> bytes:
            return _generate_quick_brief_fpdf(
                address=address,
                building_year=building_year,
                building_use=building_use,
                risks=risks,
                sunlight_score=sunlight_score,
                viewing_questions=viewing_questions,
                shadow_image_b64=shadow_image_b64,
                language=language,
                floor_area=floor_area,
                shadow_equinox_b64=shadow_equinox_b64,
                shadow_summer_b64=shadow_summer_b64,
            )

        with tempfile.TemporaryDirectory(prefix="buurtcheck_latex_assets_") as tmp:
            assets_dir = Path(tmp)
            primary_shadow_b64 = shadow_image_b64 or shadow_equinox_b64 or shadow_summer_b64
            shadow_path = _decode_b64_asset(
                primary_shadow_b64, output_dir=assets_dir, filename_stem="shadow",
            )
            risk_grid_chart_path: str | None = None
            questions_clipped = False

            if chart_renderer is not None:
                chart_jobs: dict[str, Any] = {}
                risk_cells = _build_risk_cells(risks, sunlight_score, language == "nl")
                chart_jobs["risk_grid_chart"] = lambda cells=risk_cells: (
                    chart_renderer.render_risk_summary_grid(
                        cells=[
                            chart_renderer.RiskCell(
                                category=cat_label,
                                score=score,
                                severity=_severity_code_from_label(sev_label),
                            )
                            for cat_label, score, sev_label in cells
                        ],
                        cols=2,
                        output_format="pdf",
                    )
                )

                rendered_assets = render_chart_assets_parallel(chart_jobs)
                risk_grid_chart_path = _write_chart_asset(
                    rendered_assets.get("risk_grid_chart"),
                    output_dir=assets_dir,
                    filename_stem="risk_grid",
                )

            if viewing_questions and getattr(viewing_questions, "categories", None):
                max_categories = 3
                max_per_category = 2
                questions_total = sum(len(cat.questions) for cat in viewing_questions.categories)
                questions_capacity = max_categories * max_per_category
                questions_clipped = (
                    len(viewing_questions.categories) > max_categories
                    or questions_total > questions_capacity
                )

            tex = render_brief(
                address=escape_latex(address),
                language=language,
                building_year=building_year,
                building_use=escape_latex(building_use) if building_use else None,
                floor_area=floor_area,
                preparation_date=escape_latex(format_preparation_date(date.today(), language)),
                risks=_model_to_dict(risks),
                sunlight_score=sunlight_score,
                risk_grid_chart=risk_grid_chart_path,
                shadow_image=shadow_path,
                location_map=None,
                viewing_questions=_model_to_dict(viewing_questions),
                questions_clipped=questions_clipped,
            )
            return compile_latex_to_pdf_with_fallback(
                tex,
                fallback_pdf_factory=_fallback,
                timeout=8,
                passes=1,
            )
    except Exception:
        logger.exception("LaTeX quick brief pipeline failed; using fpdf2 fallback")
        return _generate_quick_brief_fpdf(
            address=address,
            building_year=building_year,
            building_use=building_use,
            risks=risks,
            sunlight_score=sunlight_score,
            viewing_questions=viewing_questions,
            shadow_image_b64=shadow_image_b64,
            language=language,
            floor_area=floor_area,
            shadow_equinox_b64=shadow_equinox_b64,
            shadow_summer_b64=shadow_summer_b64,
        )


def _generate_full_dossier_latex(
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
    shadow_equinox_b64: str | None = None,
    shadow_summer_b64: str | None = None,
    postcode: str | None = None,
    footprint_geojson: dict[str, Any] | None = None,
    map_lat: float | None = None,
    map_lng: float | None = None,
) -> bytes:
    """Generate full dossier via LaTeX with fpdf2 fallback."""
    is_nl = language == "nl"
    tier_b = None

    # Fallback: recover sunlight score from risks card when the explicit
    # parameter is None (e.g. SVF computation finished after the API
    # route resolved the score but before risks object was serialised).
    if sunlight_score is None and risks and risks.sunlight:
        _fallback_score = risks.sunlight.score
        if _fallback_score is None and risks.sunlight.winter_hours is not None:
            _fallback_score = normalize_sunlight_score(risks.sunlight.winter_hours)
        if _fallback_score is not None:
            sunlight_score = _fallback_score

    has_shadow_inputs = bool(
        shadow_image_b64 or shadow_equinox_b64 or shadow_summer_b64 or shadow_images
    )
    state, pending_msg, unavailable_msg = _sunlight_state(
        risks, sunlight_score, is_nl=is_nl, has_shadow_inputs=has_shadow_inputs,
    )
    crime_score = None
    executive_summary_text = _generate_executive_summary(
        risks,
        sunlight_score,
        livability,
        is_nl,
        crime_score=crime_score,
    )
    methodology_payload = _methodology_payload(is_nl=is_nl)

    try:

        def _fallback() -> bytes:
            return _generate_full_dossier_fpdf(
                address=address,
                building_year=building_year,
                building_use=building_use,
                risks=risks,
                sunlight_score=sunlight_score,
                viewing_questions=viewing_questions,
                shadow_image_b64=shadow_image_b64,
                language=language,
                floor_area=floor_area,
                neighborhood_stats=neighborhood_stats,
                tier_b=tier_b,
                risk_comparisons=risk_comparisons,
                property_warnings_data=property_warnings_data,
                provenance=provenance,
                location_map_b64=location_map_b64,
                livability=livability,
                shadow_images=shadow_images,
                shadow_equinox_b64=shadow_equinox_b64,
                shadow_summer_b64=shadow_summer_b64,
                postcode=postcode,
                footprint_geojson=footprint_geojson,
                map_lat=map_lat,
                map_lng=map_lng,
            )

        with tempfile.TemporaryDirectory(prefix="buurtcheck_latex_assets_") as tmp:
            assets_dir = Path(tmp)
            shadow_image_paths: list[str] = []
            if shadow_images:
                for idx, item in enumerate(
                    s for s in shadow_images if isinstance(s, dict) and s.get("image_b64")
                ):
                    decoded = _decode_b64_asset(
                        str(item["image_b64"]),
                        output_dir=assets_dir,
                        filename_stem=f"shadow_{idx}",
                    )
                    if decoded:
                        shadow_image_paths.append(decoded)
            else:
                for stem, b64 in [
                    ("shadow_winter", shadow_image_b64),
                    ("shadow_equinox", shadow_equinox_b64),
                    ("shadow_summer", shadow_summer_b64),
                ]:
                    decoded = _decode_b64_asset(b64, output_dir=assets_dir, filename_stem=stem)
                    if decoded:
                        shadow_image_paths.append(decoded)
                if not shadow_image_paths:
                    decoded = _decode_b64_asset(
                        shadow_image_b64 or _primary_shadow_from_triptych(shadow_images),
                        output_dir=assets_dir,
                        filename_stem="shadow_primary",
                    )
                    if decoded:
                        shadow_image_paths.append(decoded)
            map_path = _decode_b64_asset(
                location_map_b64, output_dir=assets_dir, filename_stem="location_map",
            )
            risk_grid_chart_path: str | None = None
            comparison_chart_paths: dict[str, str] | None = None
            age_chart_path: str | None = None
            livability_chart_path: str | None = None
            age_interpretation_text: str | None = None
            livability_trend_summary_text: str | None = None
            shadow_time_labels: list[str] | None = None
            shadow_caption_text: str | None = None
            comparison_chart_blocks: list[dict[str, str]] = []
            category_rows = _build_risk_detail_data(
                risks,
                sunlight_score,
                risk_comparisons,
                is_nl,
            )
            neighborhood_sections = _build_neighborhood_sections(
                neighborhood_stats,
                is_nl,
            )

            if livability is not None and livability.trend:
                livability_trend_summary_text = _livability_trend_summary(
                    livability.trend,
                    is_nl,
                )
            if shadow_images:
                ordered_shadow_times = [s for s in shadow_images if isinstance(s, dict)]
                labels: list[str] = []
                for item in ordered_shadow_times:
                    hour = int(item.get("hour", 12))
                    view_key = _shadow_view_key(item)
                    time_key = _shadow_time_key(item)
                    view_label = _SHADOW_VIEW_LABELS.get(view_key, {}).get(
                        "nl" if is_nl else "en",
                        view_key.title(),
                    )
                    time_label = _SHADOW_TIME_LABELS.get(time_key, {}).get(
                        "nl" if is_nl else "en",
                        f"{hour:02d}:00",
                    )
                    labels.append(f"{view_label} \u00b7 {time_label}")
                shadow_time_labels = labels or None
                shadow_caption_text = (
                    "Ingezonden schaduwbeelden uit de 3D-viewer. Bron: 3DBAG / TU Delft +"
                    " SunCalc."
                    if is_nl
                    else "Submitted shadow snapshots from the 3D viewer. Source: 3DBAG /"
                    " TU Delft + SunCalc."
                )
            elif shadow_image_paths:
                shadow_caption_text = (
                    "Seizoensreferentiebeelden op 12:00 lokale tijd. Bron: 3DBAG / TU Delft + "
                    "SunCalc."
                    if is_nl
                    else "Seasonal reference snapshots at 12:00 local time. Source: 3DBAG / "
                    "TU Delft + SunCalc."
                )

            if chart_renderer is not None:
                chart_jobs: dict[str, Any] = {}
                risk_cells = _build_risk_cells(risks, sunlight_score, is_nl, crime_score=None)
                chart_jobs["risk_grid_chart"] = lambda cells=risk_cells: (
                    chart_renderer.render_risk_summary_grid(
                        cells=[
                            chart_renderer.RiskCell(
                                category=cat_label,
                                score=score,
                                severity=_severity_code_from_label(sev_label),
                            )
                            for cat_label, score, sev_label in cells
                        ],
                        cols=5 if len(cells) == 5 else 4,
                        output_format="pdf",
                    )
                )

                def _render_comparison_bundle() -> dict[str, bytes]:
                    bundle: dict[str, bytes] = {}
                    for (
                        cat_name,
                        score,
                        _summary,
                        _source_text,
                        comp_rows,
                        _measurements,
                        _unit_def,
                    ) in category_rows:
                        if not comp_rows:
                            continue

                        address_score = score
                        if address_score is None:
                            # Only fall back to first comparison value for
                            # categories where the address genuinely has data
                            # (e.g. noise/air/climate).  For sunlight the
                            # score depends on 3D analysis and substituting a
                            # peer value is misleading, so skip the chart.
                            _slug = _slugify_label(cat_name)
                            if _slug in ("sunlight", "zonlicht"):
                                continue
                            address_value = next(
                                (
                                    value
                                    for _label, value, _color, _dashed in comp_rows
                                    if value is not None
                                ),
                                None,
                            )
                            if address_value is None:
                                continue
                            address_score = int(round(address_value))

                        comparisons_payload = _build_chart_renderer_comparisons(comp_rows)

                        bundle[_slugify_label(cat_name)] = chart_renderer.render_risk_comparison(
                            category=cat_name,
                            address_score=int(round(address_score)),
                            comparisons=comparisons_payload,
                            output_format="pdf",
                        )
                    return bundle

                chart_jobs["comparison_charts"] = _render_comparison_bundle

                if (
                    neighborhood_stats is not None
                    and neighborhood_stats.age_profile is not None
                    and (
                        neighborhood_stats.age_profile.age_0_24 is not None
                        or neighborhood_stats.age_profile.age_25_64 is not None
                        or neighborhood_stats.age_profile.age_65_plus is not None
                    )
                ):
                    chart_jobs["age_chart"] = lambda ap=neighborhood_stats.age_profile: (
                        chart_renderer.render_age_distribution(
                            age_data=ap,
                            output_format="pdf",
                            is_nl=is_nl,
                        )
                    )
                    age_interpretation_text = _interpret_age_distribution(
                        neighborhood_stats.age_profile,
                        is_nl,
                    )

                liv_score = (
                    livability.overall_normalized
                    if livability is not None and livability.available
                    else None
                )
                if liv_score is not None:
                    chart_jobs["livability_chart"] = (
                        lambda ls=liv_score: (
                            chart_renderer.render_livability_score(
                                livability=chart_renderer.LivabilityData(
                                    score=ls,
                                    label="Leefbaarheid" if is_nl else "Livability",
                                ),
                                crime=chart_renderer.CrimeData(
                                    score=None,
                                    label="Criminaliteit" if is_nl else "Crime",
                                ),
                                output_format="pdf",
                            )
                        )
                    )

                rendered_assets = render_chart_assets_parallel(chart_jobs)
                risk_grid_chart_path = _write_chart_asset(
                    rendered_assets.get("risk_grid_chart"),
                    output_dir=assets_dir,
                    filename_stem="risk_grid",
                )

                comparison_raw = rendered_assets.get("comparison_charts")
                if isinstance(comparison_raw, dict):
                    path_map: dict[str, str] = {}
                    for key, payload in comparison_raw.items():
                        if not payload:
                            continue
                        path = _write_chart_asset(
                            payload,
                            output_dir=assets_dir,
                            filename_stem=f"comparison_{_slugify_label(str(key))}",
                        )
                        if path:
                            path_map[str(key)] = path
                    comparison_chart_paths = path_map or None
                    comparison_chart_blocks = _build_latex_comparison_chart_blocks(
                        category_rows,
                        comparison_chart_paths,
                    )

                age_chart_path = _write_chart_asset(
                    rendered_assets.get("age_chart"),
                    output_dir=assets_dir,
                    filename_stem="age_distribution",
                )
                livability_chart_path = _write_chart_asset(
                    rendered_assets.get("livability_chart"),
                    output_dir=assets_dir,
                    filename_stem="livability",
                )

            climate_disclosure_text = (
                _climate_disclosure_line(risks.climate_stress, is_nl)
                if risks and risks.climate_stress
                else None
            )

            # Deduplicate livability comparison rows: when a small
            # municipality has the same name for wijk and gemeente
            # (e.g. "Deurne"), the template would render the same
            # line twice.  Keep the first occurrence of each name.
            livability_dict = _model_to_dict(livability)
            if livability_dict and livability_dict.get("comparison"):
                seen_comp_names: set[str] = set()
                deduped: list[dict] = []
                for comp_row in livability_dict["comparison"]:
                    name = (comp_row.get("name") or "").strip()
                    if name in seen_comp_names:
                        continue
                    seen_comp_names.add(name)
                    deduped.append(comp_row)
                livability_dict["comparison"] = deduped

            tier_b_dict = None

            tex = render_dossier(
                address=escape_latex(address),
                language=language,
                building_year=building_year,
                building_use=escape_latex(building_use) if building_use else None,
                floor_area=floor_area,
                preparation_date=escape_latex(format_preparation_date(date.today(), language)),
                risks=_model_to_dict(risks),
                executive_summary=escape_latex(executive_summary_text),
                sunlight_score=sunlight_score,
                risk_comparisons=_model_to_dict(risk_comparisons),
                neighborhood=_model_to_dict(neighborhood_stats),
                livability=livability_dict,
                tier_b=tier_b_dict,
                property_warnings=_model_to_dict(property_warnings_data),
                viewing_questions=_model_to_dict(viewing_questions),
                provenance=_model_to_dict(provenance),
                risk_grid_chart=risk_grid_chart_path,
                comparison_charts=comparison_chart_paths,
                comparison_chart_blocks=comparison_chart_blocks,
                age_chart=age_chart_path,
                age_interpretation=(
                    escape_latex(age_interpretation_text) if age_interpretation_text else None
                ),
                livability_chart=livability_chart_path,
                livability_trend_summary=(
                    escape_latex(livability_trend_summary_text)
                    if livability_trend_summary_text
                    else None
                ),
                energy_label=None,
                shadow_images=shadow_image_paths or None,
                location_map=map_path,
                shadow_caption=escape_latex(shadow_caption_text) if shadow_caption_text else None,
                sunlight_state=state,
                sunlight_pending_message=(
                    escape_latex(pending_msg) if pending_msg is not None else None
                ),
                sunlight_unavailable_message=(
                    escape_latex(unavailable_msg) if unavailable_msg is not None else None
                ),
                postcode=escape_latex(postcode) if postcode else None,
                shadow_time_labels=shadow_time_labels,
                neighborhood_sections=_escape_latex_structure(neighborhood_sections),
                neighborhood_urbanization_label=(
                    escape_latex(_urbanization_label(neighborhood_stats.urbanization, is_nl))
                    if neighborhood_stats is not None
                    and neighborhood_stats.urbanization != UrbanizationLevel.unknown
                    and _urbanization_label(neighborhood_stats.urbanization, is_nl) is not None
                    else None
                ),
                climate_disclosure=(
                    _format_wrapped_latex_metadata(climate_disclosure_text)
                    if climate_disclosure_text is not None
                    else None
                ),
                methodology=_escape_latex_structure(methodology_payload),
            )
            return compile_latex_to_pdf_with_fallback(
                tex,
                fallback_pdf_factory=_fallback,
                timeout=8,
                passes=2,
            )
    except Exception:
        logger.exception("LaTeX full dossier pipeline failed; using fpdf2 fallback")
        return _generate_full_dossier_fpdf(
            address=address,
            building_year=building_year,
            building_use=building_use,
            risks=risks,
            sunlight_score=sunlight_score,
            viewing_questions=viewing_questions,
            shadow_image_b64=shadow_image_b64,
            language=language,
            floor_area=floor_area,
            neighborhood_stats=neighborhood_stats,
            tier_b=tier_b,
            risk_comparisons=risk_comparisons,
            property_warnings_data=property_warnings_data,
            provenance=provenance,
            location_map_b64=location_map_b64,
            livability=livability,
            shadow_images=shadow_images,
            shadow_equinox_b64=shadow_equinox_b64,
            shadow_summer_b64=shadow_summer_b64,
            postcode=postcode,
            footprint_geojson=footprint_geojson,
            map_lat=map_lat,
            map_lng=map_lng,
        )


# ---------------------------------------------------------------------------
# Quick Brief (1 page)
# ---------------------------------------------------------------------------


def _generate_quick_brief_fpdf(
    address: str,
    building_year: int | None,
    building_use: str | None,
    risks: RiskCardsResponse | None,
    sunlight_score: int | None,
    viewing_questions: ViewingQuestionsResponse | None,
    shadow_image_b64: str | None = None,
    language: str = "en",
    floor_area: int | None = None,
    shadow_equinox_b64: str | None = None,
    shadow_summer_b64: str | None = None,
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


def _generate_full_dossier_fpdf(
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
    shadow_equinox_b64: str | None = None,
    shadow_summer_b64: str | None = None,
    shadow_reference_year: int | None = None,
    postcode: str | None = None,
    footprint_geojson: dict[str, Any] | None = None,
    map_lat: float | None = None,
    map_lng: float | None = None,
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

    dossier_shadow_images = _full_dossier_shadow_images(
        shadow_images,
        shadow_image_b64=shadow_image_b64,
        shadow_equinox_b64=shadow_equinox_b64,
        shadow_summer_b64=shadow_summer_b64,
    )

    # Page 1: Cover + summary
    pdf.section_title = "VOLLEDIG DOSSIER" if is_nl else "PROPERTY INTELLIGENCE DOSSIER"
    pdf.add_page()
    _draw_cover_page(
        pdf,
        address,
        building_year,
        building_use,
        floor_area,
        risks,
        sunlight_score,
        shadow_summer_b64 or shadow_image_b64,
        is_nl,
        location_map_b64=location_map_b64,
        shadow_images=dossier_shadow_images,
        shadow_reference_year=shadow_reference_year,
        livability=livability,
        crime_score=None,
        crime_summary=None,
    )

    # Page 2: Detailed risk evidence
    pdf.section_title = "RISICODETAILS" if is_nl else "RISK DETAILS"
    pdf.add_page()
    _draw_risk_details_page(
        pdf,
        address,
        risks,
        sunlight_score,
        risk_comparisons,
        is_nl,
        tier_b_data=None,
    )

    # Additional property checks + viewing questions
    pdf.section_title = "EXTRA CONTROLES" if is_nl else "ADDITIONAL CHECKS"
    pdf.add_page()
    _draw_property_checks_page(
        pdf=pdf,
        risks=risks,
        sunlight_score=sunlight_score,
        shadow_image_b64=shadow_summer_b64 or shadow_image_b64,
        property_warnings=property_warnings_data,
        is_nl=is_nl,
        shadow_images=dossier_shadow_images,
        postcode=postcode,
    )
    _ensure_page_space(pdf, 70.0)
    _draw_checklist_page(
        pdf,
        address,
        risks,
        sunlight_score,
        viewing_questions,
        is_nl,
        crime_score=None,
        tier_b_data=None,
    )

    # Seasonal shadow evidence
    pdf.section_title = "SCHADUWANALYSE" if is_nl else "SHADOW ANALYSIS"
    pdf.add_page()
    if dossier_shadow_images:
        _draw_shadow_triptych(pdf, dossier_shadow_images, is_nl)
    else:
        pdf.draw_premium_badge()
        pdf.draw_h1("Schaduwanalyse" if is_nl else "Shadow Analysis", add_divider=False)
        pdf.draw_tinted_box(
            text=(
                "Schaduwbeelden waren niet beschikbaar voor deze export."
                if is_nl
                else "Shadow snapshots were unavailable for this export."
            ),
            fill=TILE_BG,
            border=BORDER,
            accent=SECONDARY,
            font_family="Satoshi",
            font_style="",
            font_size=9,
            text_color=SLATE,
            padding=2.6,
            line_height=4.2,
        )

    # Neighborhood context and livability evidence
    pdf.section_title = "BUURT" if is_nl else "NEIGHBORHOOD"
    pdf.add_page()
    _draw_neighborhood_page(
        pdf=pdf,
        stats=neighborhood_stats,
        tier_b_data=None,
        is_nl=is_nl,
        livability=livability,
        location_map_b64=location_map_b64,
        shadow_images=None,
        center_lat=map_lat or (provenance.lat if provenance else None),
        center_lng=map_lng or (provenance.lng if provenance else None),
        footprint_geojson=footprint_geojson,
    )

    # Methodology + provenance
    pdf.section_title = "METHODOLOGIE" if is_nl else "METHODOLOGY"
    pdf.add_page()
    _draw_methodology_page(pdf, is_nl, provenance=provenance)
    _ensure_page_space(pdf, 40.0)
    _draw_notes_section(pdf, is_nl)

    return bytes(pdf.output())


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
    shadow_equinox_b64: str | None = None,
    shadow_summer_b64: str | None = None,
) -> bytes:
    """Generate a quick brief, preferring LaTeX and falling back to fpdf2."""
    return _generate_quick_brief_latex(
        address=address,
        building_year=building_year,
        building_use=building_use,
        risks=risks,
        sunlight_score=sunlight_score,
        viewing_questions=viewing_questions,
        shadow_image_b64=shadow_image_b64,
        language=language,
        floor_area=floor_area,
        shadow_equinox_b64=shadow_equinox_b64,
        shadow_summer_b64=shadow_summer_b64,
    )


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
    shadow_equinox_b64: str | None = None,
    shadow_summer_b64: str | None = None,
    shadow_reference_year: int | None = None,
    postcode: str | None = None,
    footprint_geojson: dict[str, Any] | None = None,
    map_lat: float | None = None,
    map_lng: float | None = None,
) -> bytes:
    """Generate a full dossier with the canonical fpdf2 renderer."""
    return _generate_full_dossier_fpdf(
        address=address,
        building_year=building_year,
        building_use=building_use,
        risks=risks,
        sunlight_score=sunlight_score,
        viewing_questions=viewing_questions,
        shadow_image_b64=shadow_image_b64,
        language=language,
        floor_area=floor_area,
        neighborhood_stats=neighborhood_stats,
        tier_b=tier_b,
        risk_comparisons=risk_comparisons,
        property_warnings_data=property_warnings_data,
        provenance=provenance,
        location_map_b64=location_map_b64,
        livability=livability,
        shadow_images=shadow_images,
        shadow_equinox_b64=shadow_equinox_b64,
        shadow_summer_b64=shadow_summer_b64,
        shadow_reference_year=shadow_reference_year,
        postcode=postcode,
        footprint_geojson=footprint_geojson,
        map_lat=map_lat,
        map_lng=map_lng,
    )


# ---------------------------------------------------------------------------
# Full Dossier page drawing functions
# ---------------------------------------------------------------------------


def _draw_location_map(
    pdf: BuurtCheckPDF,
    location_map_b64: str | None,
    is_nl: bool,
    *,
    center_lat: float | None = None,
    center_lng: float | None = None,
    footprint_geojson: dict[str, Any] | None = None,
) -> None:
    """Embed a PDOK Luchtfoto map or a visible unavailable placeholder."""
    has_image = bool(location_map_b64)
    _ensure_page_space(
        pdf,
        _LOCATION_MAP_SECTION_REQUIRED_MM
        if has_image
        else _LOCATION_MAP_PLACEHOLDER_REQUIRED_MM,
    )

    pdf.draw_h2("Locatiekaart" if is_nl else "Location map")
    pdf.ln(1)

    if not location_map_b64:
        _draw_location_map_placeholder(pdf, is_nl)
        return

    overlay_lat = center_lat
    overlay_lng = center_lng
    if footprint_geojson and (overlay_lat is None or overlay_lng is None):
        derived_anchor = _footprint_anchor(footprint_geojson)
        if derived_anchor is not None:
            overlay_lat, overlay_lng = derived_anchor

    try:
        image_data = base64.b64decode(location_map_b64)
        img_w = _LOCATION_MAP_WIDTH_MM
        img_h = _LOCATION_MAP_HEIGHT_MM

        # Draw the map image
        pdf.set_draw_color(*BORDER)
        pdf.set_line_width(0.2)
        img_y = pdf.get_y()
        pdf.image(
            io.BytesIO(image_data),
            x=pdf.l_margin, w=img_w, h=img_h,
        )
        pdf.rect(pdf.l_margin, img_y, img_w, img_h, "D")

        if footprint_geojson and overlay_lat is not None and overlay_lng is not None:
            try:
                ring = _primary_footprint_ring(footprint_geojson)
                projected: list[tuple[float, float]] = []
                meters_per_deg_lat = 111_320.0
                meters_per_deg_lng = 111_320.0 * math.cos(math.radians(overlay_lat))
                for lng, lat in ring:
                    dx = (float(lng) - overlay_lng) * meters_per_deg_lng
                    dy = (float(lat) - overlay_lat) * meters_per_deg_lat
                    px = pdf.l_margin + img_w / 2 + (dx / 150.0) * img_w
                    py = img_y + img_h / 2 - (dy / 150.0) * img_h
                    projected.append((px, py))
                if len(projected) >= 3:
                    pdf.set_draw_color(*TEAL)
                    pdf.set_line_width(1.2)
                    pdf.polygon(projected, style="D")
                    pdf.set_line_width(0.1)
            except Exception:
                logger.warning("Failed to draw footprint overlay on location map")

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
        # Map is 150m wide displayed at img_w mm
        # So 25m = img_w * 25 / 150 mm
        scale_mm = img_w * 25.0 / 150.0  # 25m
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
        pdf.cell(scale_mm, 3, "25 m", align="C")

        # Attribution
        pdf.set_y(img_y + img_h + 1)
        pdf.set_font("Satoshi", "", 8)
        pdf.set_text_color(*SECONDARY)
        attr_text = (
            "Luchtfoto: PDOK Luchtfoto (CC BY 4.0)"
            if is_nl
            else "Aerial: PDOK Luchtfoto (CC BY 4.0)"
        )
        pdf.cell(
            0, 3, attr_text,
            new_x="LMARGIN", new_y="NEXT",
        )
        pdf.set_text_color(*SLATE)
        pdf.ln(2)
    except Exception:
        logger.warning("Failed to embed location map in PDF; using placeholder")
        _draw_location_map_placeholder(pdf, is_nl)


def _draw_location_map_placeholder(pdf: BuurtCheckPDF, is_nl: bool) -> None:
    """Render a fallback block when the PDOK map is unavailable."""
    box_x = pdf.l_margin
    box_y = pdf.get_y()
    box_w = _LOCATION_MAP_WIDTH_MM
    box_h = _LOCATION_MAP_PLACEHOLDER_HEIGHT_MM

    pdf.set_draw_color(*BORDER)
    pdf.set_fill_color(*TEAL_LIGHT)
    pdf.set_line_width(0.2)
    pdf.rect(box_x, box_y, box_w, box_h, "DF")

    pdf.set_xy(box_x + 6, box_y + 6)
    pdf.set_font("Satoshi", "B", 10)
    pdf.set_text_color(*SLATE)
    pdf.multi_cell(
        box_w - 12,
        4.5,
        (
            "Location map unavailable"
            if not is_nl
            else "Locatiekaart niet beschikbaar"
        ),
        align="L",
        new_x="LMARGIN",
        new_y="NEXT",
    )

    pdf.set_x(box_x + 6)
    pdf.set_font("Satoshi", "", 8)
    pdf.set_text_color(*SECONDARY)
    pdf.multi_cell(
        box_w - 12,
        3.5,
        (
            "PDOK aerial imagery did not load during export. "
            "The dossier continues without the 150 m map context."
            if not is_nl
            else "PDOK-luchtfoto kon niet laden tijdens export. "
            "Het dossier gaat verder zonder de kaartcontext van 150 m."
        ),
        align="L",
        new_x="LMARGIN",
        new_y="NEXT",
    )

    pdf.set_y(box_y + box_h + 1)
    pdf.set_font("Satoshi", "", 8)
    pdf.set_text_color(*SECONDARY)
    pdf.cell(
        0,
        3,
        (
            "Map source: PDOK Luchtfoto (CC BY 4.0) · unavailable for this export"
            if not is_nl
            else "Kaartbron: PDOK Luchtfoto (CC BY 4.0) · niet beschikbaar voor deze export"
        ),
        new_x="LMARGIN",
        new_y="NEXT",
    )
    pdf.set_text_color(*SLATE)
    pdf.ln(2)


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
    shadow_reference_year: int | None = None,
    livability: LivabilityResponse | None = None,
    crime_score: int | None = None,
    crime_summary: str | None = None,
) -> None:
    """Page 1: concise cover with summary, key concerns, and score tiles."""
    pdf.set_font("SatoshiBlack", "", 16)
    pdf.set_text_color(*SLATE)
    pdf.cell(0, 8, "Buurt Check", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(2)

    _draw_address_block(pdf, address, building_year, building_use, floor_area, is_nl, font_size=20)

    summary_text = _generate_executive_summary(
        risks, sunlight_score, livability, is_nl, crime_score=crime_score,
    )
    pdf.draw_h1("Samenvatting" if is_nl else "Executive Summary", add_divider=False)
    pdf.draw_tinted_box(
        text=summary_text,
        fill=FROST_BG,
        border=BORDER,
        accent=SLATE,
        font_family="Satoshi",
        font_style="",
        font_size=11,
        text_color=SLATE,
        padding=3.2,
        line_height=5.1,
    )

    concerns = _risk_concerns(
        risks,
        sunlight_score,
        is_nl,
        crime_score=crime_score,
        crime_summary=crime_summary,
    )
    if concerns:
        pdf.draw_h3("Belangrijkste aandachtspunt" if is_nl else "Key concern")

    for concern in concerns:
        score = int(concern["score"])
        label = str(concern["label"])
        summary = str(concern["summary"]).strip()
        text = f"{label}: {_score_text(score, is_nl=is_nl)}"
        if summary:
            text += f". {summary}"
        pdf.draw_tinted_box(
            text=text,
            fill=_severity_fill(score),
            border=_severity_color(score),
            accent=_severity_color(score),
            font_family="Satoshi",
            font_style="B",
            font_size=9,
            text_color=SLATE,
            padding=2.6,
            line_height=4.5,
        )

    pdf.draw_h2("Risicoscores" if is_nl else "Risk summary")
    cells = _build_risk_cells(risks, sunlight_score, is_nl, crime_score=crime_score)
    grid_cols = 5 if len(cells) == 5 else 4
    grid_end_y = pdf.draw_risk_grid(
        x=pdf.l_margin, y=pdf.get_y(),
        width=pdf.w - pdf.l_margin - pdf.r_margin,
        cells=cells, cols=grid_cols,
    )
    pdf.set_y(grid_end_y + 2)
    pdf.draw_h3(
        _collect_cover_sources(
            risks,
            is_nl=is_nl,
            include_crime=crime_score is not None,
            livability=livability,
            include_shadow=bool(shadow_image_b64 or shadow_images),
            shadow_reference_year=shadow_reference_year,
        )
    )

    pdf.set_font("SatoshiMedium", "", 9)
    pdf.set_text_color(*SECONDARY)
    pdf.cell(0, 5, _prepared_label(date.today(), is_nl=is_nl), new_x="LMARGIN", new_y="NEXT")
    pdf.set_text_color(*SLATE)


def _pdf_wrapped_lines(
    pdf: BuurtCheckPDF,
    text: str | None,
    width: float,
    line_height: float,
    *,
    max_lines: int,
) -> list[str]:
    """Return wrapped lines truncated to a fixed count for compact card layouts."""
    if not text:
        return []
    lines = list(
        pdf.multi_cell(
            width,
            line_height,
            text,
            dry_run=True,
            output="LINES",
        )
    )
    if len(lines) <= max_lines:
        return lines
    clipped = lines[:max_lines]
    clipped[-1] = clipped[-1].rstrip(" .") + "..."
    return clipped


def _strip_source_prefix(source_text: str) -> str:
    return re.sub(r"^(Source|Bron):\s*", "", source_text, flags=re.IGNORECASE)


def _shadow_hour_for_time_key(time_key: str) -> int:
    return {"morning": 9, "noon": 12, "afternoon": 15}.get(time_key, 12)


def _normalized_shadow_item(item: dict[str, Any]) -> dict[str, Any]:
    time_key = _shadow_time_key(item) or "noon"
    raw_label = str(item.get("label") or "")
    raw_viewpoint = str(item.get("viewpoint") or "")
    viewpoint = _shadow_viewpoint_from_raw(raw_viewpoint) or _shadow_viewpoint_from_raw(raw_label)
    if not viewpoint:
        normalized_label = _normalize_shadow_label(raw_label)
        if normalized_label in {"winter", "equinox", "summer"}:
            viewpoint = normalized_label
        else:
            viewpoint = "top"
    season = _shadow_season_key(item) or None
    hour = item.get("hour")
    if not isinstance(hour, (int, float)):
        hour = _shadow_hour_for_time_key(time_key)
    if item.get("label"):
        label = item["label"]
    elif season and viewpoint in {"front", "rear"}:
        label = f"{season}_{viewpoint}"
    else:
        label = f"{viewpoint}_{time_key}"
    return {
        "hour": int(hour),
        "label": label,
        "image_b64": item.get("image_b64"),
        "viewpoint": viewpoint,
        "season": season,
        "sun_azimuth": item.get("sun_azimuth"),
        "sun_altitude": item.get("sun_altitude"),
    }


def _full_dossier_shadow_images(
    shadow_images: list[dict[str, Any]] | None,
    *,
    shadow_image_b64: str | None = None,
    shadow_equinox_b64: str | None = None,
    shadow_summer_b64: str | None = None,
) -> list[dict[str, Any]]:
    """Normalize export evidence with seasonal noon snapshots preferred."""
    valid = [
        _normalized_shadow_item(item)
        for item in (shadow_images or [])
        if isinstance(item, dict) and item.get("image_b64")
    ]

    if valid:
        seasonal_facades = [
            item
            for item in valid
            if _shadow_season_key(item) in _SHADOW_SEASON_ROW_ORDER
            and _shadow_view_key(item) in _SHADOW_FACADE_VIEW_ORDER
        ]
        expected_pairs = {
            (season, viewpoint)
            for season in _SHADOW_SEASON_ROW_ORDER
            for viewpoint in _SHADOW_FACADE_VIEW_ORDER
        }
        found_pairs = {
            (_shadow_season_key(item), _shadow_view_key(item))
            for item in seasonal_facades
        }
        if expected_pairs.issubset(found_pairs):
            return sorted(
                seasonal_facades,
                key=lambda item: (
                    _SHADOW_SEASON_ROW_ORDER.index(_shadow_season_key(item)),
                    _SHADOW_FACADE_VIEW_ORDER.index(_shadow_view_key(item)),
                ),
            )

    seasonal_from_fields = [
        {
            "hour": 12,
            "label": season,
            "image_b64": image_b64,
            "viewpoint": season,
            "season": season,
        }
        for season, image_b64 in [
            ("winter", shadow_image_b64),
            ("equinox", shadow_equinox_b64),
            ("summer", shadow_summer_b64),
        ]
        if image_b64
    ]
    if seasonal_from_fields:
        return seasonal_from_fields

    if not valid:
        return []

    season_order = {"winter": 0, "equinox": 1, "summer": 2}
    seasonal_images = [
        item
        for item in valid
        if _shadow_view_key(item) in season_order
    ]
    if seasonal_images:
        return sorted(
            seasonal_images,
            key=lambda item: season_order.get(_shadow_view_key(item), 99),
        )

    return valid


def _full_dossier_hero_shadow(
    shadow_images: list[dict[str, Any]] | None,
    shadow_image_b64: str | None,
) -> str | None:
    seasonal_front = next(
        (
            item.get("image_b64")
            for item in (shadow_images or [])
            if _shadow_season_key(item) == "summer" and _shadow_view_key(item) == "front"
        ),
        None,
    )
    if seasonal_front:
        return str(seasonal_front)
    noon_top = next(
        (
            item.get("image_b64")
            for item in (shadow_images or [])
            if _shadow_view_key(item) == "top" and _shadow_time_key(item) == "noon"
        ),
        None,
    )
    if noon_top:
        return str(noon_top)
    return shadow_image_b64 or _primary_shadow_from_triptych(shadow_images)


def _draw_cover_shadow_hero(
    pdf: BuurtCheckPDF,
    *,
    shadow_image_b64: str | None,
    is_nl: bool,
) -> None:
    hero_x = pdf.l_margin
    hero_y = pdf.get_y()
    hero_w = pdf.w - pdf.l_margin - pdf.r_margin
    hero_h = 66.0

    pdf.set_draw_color(*BORDER)
    pdf.set_line_width(0.2)
    if shadow_image_b64:
        try:
            image_bytes = base64.b64decode(shadow_image_b64)
            pdf.image(io.BytesIO(image_bytes), x=hero_x, y=hero_y, w=hero_w, h=hero_h)
            pdf.rect(hero_x, hero_y, hero_w, hero_h, "D")
        except Exception:
            logger.warning("Failed to embed cover shadow hero", exc_info=True)
            shadow_image_b64 = None

    if not shadow_image_b64:
        pdf.set_fill_color(*TILE_BG)
        pdf.rect(hero_x, hero_y, hero_w, hero_h, "DF")
        pdf.set_xy(hero_x, hero_y + 24)
        pdf.set_font("SatoshiMedium", "", 10)
        pdf.set_text_color(*SECONDARY)
        pdf.multi_cell(
            hero_w,
            5,
            (
                "Zomerreferentie niet beschikbaar voor deze export."
                if is_nl
                else "Summer reference image unavailable for this export."
            ),
            align="C",
        )
        pdf.set_text_color(*SLATE)

    pdf.set_y(hero_y + hero_h + 2.5)
    pdf.set_font("Satoshi", "", 8)
    pdf.set_text_color(*SECONDARY)
    pdf.multi_cell(
        0,
        3.5,
        (
            "Zomerreferentiedatum, 21 juni om 12:00 lokale tijd. Bron: 3DBAG / TU Delft + "
            "SunCalc."
            if is_nl
            else (
                "Summer reference date, June 21 at 12:00 local time. "
                "Source: 3DBAG / TU Delft + SunCalc."
            )
        ),
        align="L",
        new_x="LMARGIN",
        new_y="NEXT",
    )
    pdf.set_text_color(*SLATE)


def _draw_full_dossier_cover_page(
    pdf: BuurtCheckPDF,
    *,
    address: str,
    building_year: int | None,
    building_use: str | None,
    floor_area: int | None,
    risks: RiskCardsResponse | None,
    sunlight_score: int | None,
    is_nl: bool,
    provenance: ProvenanceData | None,
    livability: LivabilityResponse | None,
    shadow_image_b64: str | None,
    shadow_images: list[dict[str, Any]] | None,
    shadow_reference_year: int | None,
    crime_score: int | None,
    crime_summary: str | None,
) -> None:
    _draw_address_block(
        pdf,
        address,
        building_year,
        building_use,
        floor_area,
        is_nl,
        font_size=18,
    )

    meta_parts: list[str] = []
    if provenance and provenance.gemeente_name:
        meta_parts.append(
            f"{'Gemeente' if is_nl else 'Municipality'}: {provenance.gemeente_name}"
        )
    if provenance and provenance.buurt_code:
        meta_parts.append(f"Buurt: {provenance.buurt_code}")
    if provenance and provenance.report_id:
        meta_parts.append(f"Report ID: {provenance.report_id}")
    if meta_parts:
        pdf.set_font("Satoshi", "", 8)
        pdf.set_text_color(*SECONDARY)
        pdf.multi_cell(
            0,
            3.8,
            " \u00b7 ".join(meta_parts),
            align="L",
            new_x="LMARGIN",
            new_y="NEXT",
        )
        pdf.set_text_color(*SLATE)
        pdf.ln(1)

    _draw_cover_shadow_hero(
        pdf,
        shadow_image_b64=_full_dossier_hero_shadow(shadow_images, shadow_image_b64),
        is_nl=is_nl,
    )

    pdf.draw_h2("Samenvatting" if is_nl else "Executive Summary")
    pdf.draw_tinted_box(
        text=_generate_executive_summary(
            risks,
            sunlight_score,
            livability,
            is_nl,
            crime_score=crime_score,
        ),
        fill=FROST_BG,
        border=BORDER,
        accent=SLATE,
        font_family="Satoshi",
        font_style="",
        font_size=10,
        text_color=SLATE,
        padding=2.8,
        line_height=4.6,
    )

    concerns = _risk_concerns(
        risks,
        sunlight_score,
        is_nl,
        crime_score=crime_score,
        crime_summary=crime_summary,
    )
    pdf.draw_h3("Belangrijkste aandachtspunt" if is_nl else "Key concern")
    if concerns:
        concern = concerns[0]
        concern_text = (
            f"{concern['label']}: {_score_text(int(concern['score']), is_nl=is_nl)}"
        )
        summary = str(concern.get("summary") or "").strip()
        if summary:
            concern_text += f". {summary}"
        fill_score = int(concern["score"])
        pdf.draw_tinted_box(
            text=concern_text,
            fill=_severity_fill(fill_score),
            border=_severity_color(fill_score),
            accent=_severity_color(fill_score),
            font_family="Satoshi",
            font_style="",
            font_size=9,
            text_color=SLATE,
            padding=2.4,
            line_height=4.2,
        )
    else:
        pdf.draw_tinted_box(
            text=(
                "Geen acute rode vlag in de kernscores. "
                "Verifieer geluid, licht en ventilatie tijdens de bezichtiging."
                if is_nl
                else (
                    "No immediate red flag in the core scores. Verify noise, "
                    "daylight, and ventilation during the viewing."
                )
            ),
            fill=TILE_BG,
            border=BORDER,
            accent=SECONDARY,
            font_family="Satoshi",
            font_style="",
            font_size=9,
            text_color=SLATE,
            padding=2.4,
            line_height=4.2,
        )

    pdf.draw_h2("Vier kernthema's" if is_nl else "Four core checks")
    grid_end_y = pdf.draw_risk_grid(
        x=pdf.l_margin,
        y=pdf.get_y(),
        width=pdf.w - pdf.l_margin - pdf.r_margin,
        cells=_build_risk_cells(risks, sunlight_score, is_nl, crime_score=None),
        cols=2,
    )
    pdf.set_y(grid_end_y + 1.5)
    pdf.set_font("Satoshi", "", 8)
    pdf.set_text_color(*SECONDARY)
    pdf.multi_cell(
        0,
        3.5,
        _collect_cover_sources(
            risks,
            is_nl=is_nl,
            include_crime=False,
            livability=livability,
            include_shadow=bool(shadow_image_b64 or shadow_images),
            shadow_reference_year=shadow_reference_year,
        ),
        align="L",
        new_x="LMARGIN",
        new_y="NEXT",
    )
    pdf.cell(0, 4, _prepared_label(date.today(), is_nl=is_nl), new_x="LMARGIN", new_y="NEXT")
    pdf.set_text_color(*SLATE)


def _compact_comparison_note(comp_rows: list, is_nl: bool) -> str | None:
    peers: list[str] = []
    for label, value, _color, _is_dashed in comp_rows:
        if value is None or _is_address_comparison_label(label):
            continue
        peers.append(f"{label} {_score_value(value)}/100")
    if not peers:
        return None
    prefix = "Vergelijking" if is_nl else "Benchmarks"
    return f"{prefix}: " + " \u00b7 ".join(peers[:3])


def _panel_measurements(
    title: str,
    measurements: list[tuple[str, str]] | None,
    *,
    is_nl: bool,
) -> list[tuple[str, str]]:
    if not measurements:
        return []
    if title in {"Sunlight", "Zonlicht"}:
        measurements = [
            (label, value)
            for label, value in measurements
            if label not in {"Winter", "Equinox"}
        ]
    if title in {"Climate Stress", "Klimaatstress"}:
        measurements = [
            (label, value)
            for label, value in measurements
            if value.lower() not in {"unknown", "onbekend"}
        ]
    return measurements[:2]


def _draw_compact_risk_panel(
    pdf: BuurtCheckPDF,
    *,
    x: float,
    y: float,
    w: float,
    h: float,
    title: str,
    score: int | None,
    summary: str,
    source_text: str,
    comp_rows: list,
    measurements: list[tuple[str, str]] | None,
    is_nl: bool,
) -> None:
    color = _severity_color(score)
    pdf.set_fill_color(*TILE_BG)
    pdf.set_draw_color(*BORDER)
    pdf.set_line_width(0.2)
    pdf.rect(x, y, w, h, "DF")
    pdf.set_fill_color(*color)
    pdf.rect(x, y, w, 2.2, "F")

    cursor_y = y + 4.0
    pdf.set_xy(x + 3.0, cursor_y)
    pdf.set_font("Satoshi", "B", 9)
    pdf.set_text_color(*SLATE)
    pdf.cell(w - 26.0, 4.5, title)
    pdf.set_xy(x + w - 24.0, cursor_y - 0.4)
    pdf.set_font("SatoshiBlack", "", 14)
    pdf.set_text_color(*color)
    pdf.cell(21.0, 5.0, _score_text(score, is_nl=is_nl), align="R")

    bar_y = cursor_y + 7.0
    pdf.draw_score_bar(x + 3.0, bar_y, w - 6.0, score, height=3.0)
    cursor_y = bar_y + 5.5

    pdf.set_font("Satoshi", "", 8)
    pdf.set_text_color(*SLATE)
    summary_lines = _pdf_wrapped_lines(pdf, summary, w - 6.0, 3.5, max_lines=3)
    if summary_lines:
        pdf.set_xy(x + 3.0, cursor_y)
        pdf.multi_cell(w - 6.0, 3.5, "\n".join(summary_lines))
        cursor_y = pdf.get_y() + 1.0

    for label, value in _panel_measurements(title, measurements, is_nl=is_nl):
        if cursor_y > y + h - 18.0:
            break
        pdf.set_xy(x + 3.0, cursor_y)
        pdf.set_font("SatoshiMedium", "", 7)
        pdf.set_text_color(*SECONDARY)
        pdf.cell(w * 0.42, 3.5, label)
        pdf.set_font("Satoshi", "B", 7)
        pdf.set_text_color(*SLATE)
        pdf.cell(w * 0.52, 3.5, value, align="R")
        cursor_y += 4.0

    comparison_note = _compact_comparison_note(comp_rows, is_nl)
    if comparison_note and cursor_y <= y + h - 12.0:
        pdf.set_xy(x + 3.0, cursor_y + 0.5)
        pdf.set_font("Satoshi", "", 7)
        pdf.set_text_color(*SECONDARY)
        pdf.multi_cell(
            w - 6.0,
            3.2,
            "\n".join(_pdf_wrapped_lines(pdf, comparison_note, w - 6.0, 3.2, max_lines=2)),
        )

    source_lines = _pdf_wrapped_lines(
        pdf,
        _strip_source_prefix(source_text),
        w - 6.0,
        3.0,
        max_lines=2,
    )
    if source_lines:
        pdf.set_xy(x + 3.0, y + h - 8.0)
        pdf.set_font("Satoshi", "", 6.5)
        pdf.set_text_color(*SECONDARY)
        pdf.multi_cell(w - 6.0, 3.0, "\n".join(source_lines))
    pdf.set_text_color(*SLATE)


def _status_style(status: str) -> tuple[tuple[int, int, int], tuple[int, int, int]]:
    if status == "flagged":
        return CALL_OUT_POOR_BG, SEVERITY_COLORS["poor"]
    if status == "clear":
        return WHITE, SEVERITY_COLORS["good"]
    return FROST_BG, SEVERITY_COLORS["moderate"]


def _draw_compact_info_box(
    pdf: BuurtCheckPDF,
    *,
    x: float,
    y: float,
    w: float,
    h: float,
    title: str,
    body: str,
    source: str | None,
    status: str = "attention",
) -> None:
    fill, accent = _status_style(status)
    pdf.set_fill_color(*fill)
    pdf.set_draw_color(*BORDER)
    pdf.set_line_width(0.2)
    pdf.rect(x, y, w, h, "DF")
    pdf.set_fill_color(*accent)
    pdf.rect(x, y, 2.2, h, "F")

    body_w = w - 7.0
    pdf.set_xy(x + 4.0, y + 3.0)
    pdf.set_font("Satoshi", "B", 8.5)
    pdf.set_text_color(*SLATE)
    pdf.multi_cell(body_w, 4.0, title)

    pdf.set_xy(x + 4.0, y + 11.0)
    pdf.set_font("Satoshi", "", 7.2)
    pdf.set_text_color(*SLATE)
    pdf.multi_cell(
        body_w,
        3.2,
        "\n".join(_pdf_wrapped_lines(pdf, body, body_w, 3.2, max_lines=5)),
    )

    if source:
        pdf.set_xy(x + 4.0, y + h - 7.5)
        pdf.set_font("Satoshi", "", 6.3)
        pdf.set_text_color(*SECONDARY)
        pdf.multi_cell(
            body_w,
            2.8,
            "\n".join(_pdf_wrapped_lines(pdf, source, body_w, 2.8, max_lines=2)),
        )
    pdf.set_text_color(*SLATE)


def _property_check_boxes(
    property_warnings: PropertyWarningsResponse | None,
    *,
    is_nl: bool,
) -> list[tuple[str, str, str | None, str]]:
    if property_warnings is None:
        unavailable = (
            "Niet beschikbaar in deze export."
            if is_nl
            else "Unavailable in this export."
        )
        return [
            ("Fundering" if is_nl else "Foundation", unavailable, None, "attention"),
            ("Erfpacht" if is_nl else "Ground lease", unavailable, None, "attention"),
            ("VvE" if is_nl else "Owners' association", unavailable, None, "attention"),
            ("Bouwjaarchecks" if is_nl else "Age-based checks", unavailable, None, "attention"),
        ]

    fr = property_warnings.foundation_risk
    foundation_messages = set(fr.messages or [])
    foundation_basis = None
    foundation_source = (
        "BRO + Klimaateffectatlas"
        if not is_nl
        else "BRO + Klimaateffectatlas"
    )
    if "FOUNDATION_SOFT_SOIL_CITY" in foundation_messages:
        foundation_basis = (
            (
                "Gemeentelijke fallback: perceelbodemdata ontbrak, dus een "
                "gedocumenteerde lijst van slappe-grondgemeenten is gebruikt."
            )
            if is_nl
            else (
                "Municipality fallback: parcel soil data was unavailable, so a "
                "documented soft-soil municipality list was used."
            )
        )
        foundation_source = (
            "Gedocumenteerde slappe-grondgemeentenlijst + BAG-bouwjaar"
            if is_nl
            else "Documented soft-soil municipality list + BAG construction year"
        )
    elif "FOUNDATION_YEAR_ONLY" in foundation_messages:
        foundation_basis = (
            (
                "Bouwjaar-fallback: perceelbodemdata ontbrak, dus deze "
                "indicatie is alleen op bouwjaar gebaseerd."
            )
            if is_nl
            else (
                "Year-only fallback: parcel soil data was unavailable, so this "
                "signal is based on construction year only."
            )
        )
        foundation_source = (
            "BAG-bouwjaar fallback"
            if is_nl
            else "BAG construction year fallback"
        )
    elif fr.soil_type is not None:
        foundation_basis = (
            "Bodemdata-gestuurd resultaat op basis van BRO-perceelgrond en regionale bodemdaling."
            if is_nl
            else "Soil-data-backed result using BRO parcel soil type and regional subsidence data."
        )

    foundation_body = (
        "Hoog risico; funderingsinspectie plannen."
        if fr.level == "high"
        else "Matig risico; extra funderingsvragen stellen."
        if fr.level == "medium"
        else "Geen direct funderingssignaal uit beschikbare data."
        if fr.level == "low"
        else "Funderingsrisico kon niet worden vastgesteld."
    )
    if not is_nl:
        foundation_body = (
            "High risk; schedule a foundation inspection."
            if fr.level == "high"
            else "Moderate risk; ask extra foundation questions."
            if fr.level == "medium"
            else "No immediate foundation signal in the available data."
            if fr.level == "low"
            else "Foundation risk could not be determined."
        )
    if fr.soil_type:
        foundation_body += f" {'Grondsoort' if is_nl else 'Soil'}: {fr.soil_type}."
    if foundation_basis:
        foundation_body += f" {foundation_basis}"

    ep = property_warnings.erfpacht
    ground_lease_body = _ground_lease_summary_text(ep, is_nl=is_nl)

    vve = property_warnings.vve
    vve_body = (
        "VvE-documenten opvragen: reservefonds, MJOP en notulen."
        if vve.is_apartment
        else "Geen appartementsrecht; VvE-check niet van toepassing."
    )
    if not is_nl:
        vve_body = (
            "Request owners' association documents: reserve fund, maintenance plan, and minutes."
            if vve.is_apartment
            else "Not an apartment right; VvE check does not apply."
        )
    if vve.is_apartment and vve.num_units:
        vve_body += f" {vve.num_units} {'eenheden' if is_nl else 'units'}."

    asbestos = property_warnings.asbestos.flagged
    lead = property_warnings.lead_pipe.flagged
    if is_nl:
        age_body = (
            "Mogelijk asbest en/of loden leidingen op basis van bouwjaar."
            if asbestos or lead
            else "Geen leeftijdsgebonden asbest- of loden-leidingen signaal."
        )
    else:
        age_body = (
            "Possible asbestos and/or lead-pipe exposure based on construction year."
            if asbestos or lead
            else "No age-based asbestos or lead-pipe signal."
        )

    return [
        (
            "Fundering" if is_nl else "Foundation",
            foundation_body,
            foundation_source,
            (
                "flagged"
                if fr.level == "high"
                else "attention"
                if fr.level in {"medium", "unavailable"}
                else "clear"
            ),
        ),
        (
            "Erfpacht" if is_nl else "Ground lease",
            ground_lease_body,
            _ground_lease_source_label(is_nl=is_nl),
            "attention" if ep.detected else "clear",
        ),
        (
            "VvE" if is_nl else "Owners' association",
            vve_body,
            "BAG verblijfsobjecten" if is_nl else "BAG dwelling records",
            "attention" if vve.is_apartment else "clear",
        ),
        (
            "Bouwjaarchecks" if is_nl else "Age-based checks",
            age_body,
            "BAG-bouwjaarheuristiek" if is_nl else "BAG construction-year heuristic",
            "attention" if asbestos or lead else "clear",
        ),
    ]


def _erfpacht_is_property_level(erfpacht: ErfpachtWarning) -> bool:
    return bool(
        getattr(erfpacht, "verified_property_level", False)
        or getattr(erfpacht, "scope", None) == "property"
        or erfpacht.confidence == "confirmed"
    )


def _ground_lease_source_label(*, is_nl: bool) -> str:
    return (
        "Gemeentelijke erfpacht-prevalentielijst"
        if is_nl
        else "Municipal ground-lease prevalence list"
    )


def _ground_lease_summary_text(erfpacht: ErfpachtWarning, *, is_nl: bool) -> str:
    if erfpacht.detected:
        body = (
            "Erfpacht voor dit pand bevestigd; controleer canon en einddatum."
            if _erfpacht_is_property_level(erfpacht)
            else "Erfpacht komt vaak voor in deze gemeente; controleer of dit pand erfpacht heeft."
        )
        if not is_nl:
            body = (
                "Ground lease confirmed for this property; verify canon and expiry date."
                if _erfpacht_is_property_level(erfpacht)
                else (
                    "Ground lease is common in this municipality; "
                    "verify whether this property is leasehold."
                )
            )
        if erfpacht.municipality:
            body += f" {'Gemeente' if is_nl else 'Municipality'}: {erfpacht.municipality}."
        return body

    return (
        "Geen erfpachtsignaal uit de gemeentelijke prevalentielijst."
        if is_nl
        else "No ground-lease signal in the municipal prevalence check."
    )


def _ground_lease_detail_text(
    erfpacht: ErfpachtWarning | None,
    *,
    is_nl: bool,
) -> str:
    if erfpacht is None:
        return (
            "Erfpachtstatus niet beschikbaar in de exportketen."
            if is_nl
            else "Ground lease status unavailable in export pipeline."
        )

    if erfpacht.detected:
        if _erfpacht_is_property_level(erfpacht):
            municipality_part = (
                f" Gemeente: {erfpacht.municipality}."
                if erfpacht.municipality
                else ""
            )
            return (
                "Erfpacht voor dit pand bevestigd."
                f"{municipality_part} Controleer canon, voorwaarden en einddatum bij de notaris."
                if is_nl
                else "Ground lease confirmed for this property."
                f"{municipality_part} Verify canon, lease terms, and expiry date with the notary."
            )

        municipality_part = (
            f" Gemeente: {erfpacht.municipality}."
            if erfpacht.municipality
            else ""
        )
        return (
            "Erfpacht komt vaak voor in deze gemeente."
            f"{municipality_part} Controleer of dit pand erfpacht heeft "
            "en vraag canon en voorwaarden op."
            if is_nl
            else "Ground lease is common in this municipality."
            f"{municipality_part} Verify whether this property is leasehold "
            "and request the canon and lease terms."
        )

    return (
        "Geen erfpachtsignaal uit de gemeentelijke prevalentielijst. "
        "Bevestig de eigendomsstatus alsnog met de verkoper of akte."
        if is_nl
        else (
            "No ground-lease signal in the municipal prevalence check. "
            "Still confirm the ownership status with the seller or deed."
        )
    )


def _draw_house_analysis_page(
    pdf: BuurtCheckPDF,
    *,
    address: str,
    risks: RiskCardsResponse | None,
    sunlight_score: int | None,
    comparisons: RiskComparisonsResponse | None,
    property_warnings: PropertyWarningsResponse | None,
    is_nl: bool,
) -> None:
    pdf.draw_h1("Huisanalyse" if is_nl else "House Analysis", add_divider=False)
    pdf.set_font("Satoshi", "B", 9)
    pdf.set_text_color(*SECONDARY)
    pdf.cell(0, 4.5, address, new_x="LMARGIN", new_y="NEXT")
    pdf.set_text_color(*SLATE)
    pdf.ln(1.5)

    panel_data = _build_risk_detail_data(risks, sunlight_score, comparisons, is_nl)[:4]
    content_w = pdf.w - pdf.l_margin - pdf.r_margin
    gap = 4.0
    col_w = (content_w - gap) / 2
    panel_h = 56.0
    start_y = pdf.get_y()

    for idx, panel in enumerate(panel_data):
        row = idx // 2
        col = idx % 2
        x = pdf.l_margin + col * (col_w + gap)
        y = start_y + row * (panel_h + gap)
        title, score, summary, source_text, comp_rows, measurements, _unit_def = panel
        _draw_compact_risk_panel(
            pdf,
            x=x,
            y=y,
            w=col_w,
            h=panel_h,
            title=title,
            score=score,
            summary=summary,
            source_text=source_text,
            comp_rows=comp_rows,
            measurements=measurements,
            is_nl=is_nl,
        )

    pdf.set_y(start_y + panel_h * 2 + gap + 2.0)
    pdf.draw_h2("Controleer ook" if is_nl else "Also Verify")

    box_y = pdf.get_y()
    box_h = 27.0
    for idx, (title, body, source, status) in enumerate(
        _property_check_boxes(property_warnings, is_nl=is_nl)
    ):
        row = idx // 2
        col = idx % 2
        x = pdf.l_margin + col * (col_w + gap)
        y = box_y + row * (box_h + gap)
        _draw_compact_info_box(
            pdf,
            x=x,
            y=y,
            w=col_w,
            h=box_h,
            title=title,
            body=body,
            source=source,
            status=status,
        )

    pdf.set_y(box_y + box_h * 2 + gap + 2.0)
    pdf.set_font("Satoshi", "", 8)
    pdf.set_text_color(*SECONDARY)
    pdf.multi_cell(
        0,
        3.5,
        (
            (
                "Bronnen: RIVM, Klimaateffectatlas, SunCalc + 3DBAG, BAG, BRO "
                "en gemeentelijke registers."
            )
            if is_nl
            else (
                "Sources: RIVM, Klimaateffectatlas, SunCalc + 3DBAG, BAG, BRO, "
                "and municipal registries."
            )
        ),
        align="L",
        new_x="LMARGIN",
        new_y="NEXT",
    )
    pdf.multi_cell(
        0,
        3.5,
        (
            "Vergelijkingsbalken staan op de buurt-check 0–100 scoreschaal. Hoger = beter."
            if is_nl
            else "Comparison bars are on the buurt-check 0–100 score scale. Higher = better."
        ),
        align="L",
        new_x="LMARGIN",
        new_y="NEXT",
    )
    pdf.set_text_color(*SLATE)


def _sunlight_evidence_text(
    risks: RiskCardsResponse | None,
    *,
    is_nl: bool,
) -> tuple[str, str]:
    if not risks or not risks.sunlight:
        return (
            (
                "Zomerzon-data niet beschikbaar in deze export."
                if is_nl
                else "Summer sunlight data is unavailable in this export."
            ),
            "SunCalc + 3DBAG",
        )

    sun = risks.sunlight
    parts: list[str] = []
    if sun.summer_hours is not None:
        unit = "u/dag" if is_nl else "h/day"
        value = format_number(sun.summer_hours, 1, is_nl)
        parts.append(
            f"{'Direct zomerzonlicht' if is_nl else 'Direct summer sunlight'}: {value} {unit}"
        )
    if sun.annual_average is not None:
        unit = "u/dag" if is_nl else "h/day"
        value = format_number(sun.annual_average, 1, is_nl)
        parts.append(
            f"{'Jaargemiddelde' if is_nl else 'Annual average'}: {value} {unit}"
        )
    svf_percent, weighted_svf_percent = _sunlight_svf_values(sun)
    if svf_percent is not None:
        parts.append(f"SVF: {format_number(svf_percent, 0, is_nl)}%")
    if weighted_svf_percent is not None and not _is_same_percent(weighted_svf_percent, svf_percent):
        label = "SVF (anisotropisch)" if is_nl else "SVF (anisotropic)"
        parts.append(f"{label}: {format_number(weighted_svf_percent, 0, is_nl)}%")
    if sun.irradiance_kwh_m2 is not None:
        label = "Zonnestraling" if is_nl else "Solar irradiance"
        unit = "kWh/m²/jaar" if is_nl else "kWh/m²/year"
        parts.append(f"{label}: {format_number(sun.irradiance_kwh_m2, 0, is_nl)} {unit}")
    return (
        " \u00b7 ".join(parts)
        if parts
        else (
            "Zomerzon-data niet beschikbaar."
            if is_nl
            else "Summer sunlight data unavailable."
        ),
        "SunCalc + 3DBAG",
    )


def _livability_evidence_text(
    livability: LivabilityResponse | None,
    *,
    is_nl: bool,
) -> tuple[str, str]:
    if livability is None or not livability.available:
        return (
            "Leefbaarheidsdata niet beschikbaar." if is_nl else "Livability data unavailable.",
            "Leefbaarometer",
        )

    livability_class = _livability_class_value(livability)
    class_text = _livability_class_text(livability_class, is_nl=is_nl)
    class_label = _livability_class_label(
        livability_class,
        is_nl=is_nl,
        fallback=getattr(livability, "overall_class_label", None),
    )
    deviation_text = _livability_deviation_text(
        getattr(livability, "overall_deviation", None),
        is_nl=is_nl,
    )
    sentence = (
        f"Leefbaarheid {class_text}"
        if is_nl
        else f"Livability {class_text}"
    )
    if class_label:
        sentence += f" ({class_label})"
    sentence += "."
    if deviation_text:
        sentence += (
            f" Afwijking t.o.v. landelijk gemiddelde: {deviation_text}."
            if is_nl
            else f" Deviation vs national average: {deviation_text}."
        )
    if livability.dimensions:
        best_dim = max(livability.dimensions, key=_livability_dimension_rank_value)
        dim_name = best_dim.label_code.split(".")[-1].replace("_", " ")
        sentence += (
            f" Sterkste dimensie: {dim_name}."
            if is_nl
            else f" Strongest dimension: {dim_name}."
        )
    comparison_names = [row.name for row in livability.comparison if row.name]
    if comparison_names:
        comparison_text = ", ".join(comparison_names[:2])
        sentence += (
            f" Vergelijkt met {comparison_text}."
            if is_nl
            else f" Compared with {comparison_text}."
        )
    if livability.trend and len(livability.trend) >= 2:
        sentence += " " + _livability_trend_summary(livability.trend, is_nl)
    return (
        sentence,
        (
            f"{livability.source or 'Leefbaarometer'} "
            f"{livability.year or livability.source_date or ''}"
        ).strip(),
    )


def _crime_evidence_text(
    tier_b_data: TierBResponse | None,
    *,
    is_nl: bool,
) -> tuple[str, str]:
    crime = tier_b_data.crime if tier_b_data and tier_b_data.crime else None
    if crime is None or crime.total_per_1000 is None:
        return (
            "Criminaliteitscontext niet beschikbaar."
            if is_nl
            else "Crime context unavailable."
        ), "CBS"

    total = format_number(crime.total_per_1000, 1, is_nl)
    unit = "per 1.000" if is_nl else "per 1,000"
    meaning = (crime.meaning_nl if is_nl else crime.meaning_en) or ""
    national = (
        format_number(crime.national_per_1000, 1, is_nl)
        if crime.national_per_1000 is not None
        else None
    )
    if is_nl:
        scope_label = (
            "Gemeentelijke context" if crime.scope == "gemeente" else "Deze buurt"
        )
    else:
        scope_label = (
            "Municipality context" if crime.scope == "gemeente" else "This neighborhood"
        )
    summary = f"{meaning} {scope_label}: {total} {unit}."
    if crime.score is None:
        summary = f"{_score_text(None, is_nl=is_nl)}. {summary}".strip()
    if national is not None:
        summary += (
            f" Nederland: {national} {unit}."
            if is_nl
            else f" Netherlands: {national} {unit}."
        )
    if crime.burglary_per_1000 is not None:
        burglary = format_number(crime.burglary_per_1000, 1, is_nl)
        summary += (
            f" Inbraak: {burglary} {unit}."
            if is_nl
            else f" Burglary: {burglary} {unit}."
        )
    if crime.violent_per_1000 is not None:
        violent = format_number(crime.violent_per_1000, 1, is_nl)
        summary += (
            f" Geweld: {violent} {unit}."
            if is_nl
            else f" Violent: {violent} {unit}."
        )
    summary += (
        " Gemeentelijke context, geen straatdata."
        if is_nl
        else " Municipality-level context, not street-level incidents."
    )
    summary += (
        " Getoond per 1.000 inwoners."
        if is_nl
        else " Rates shown per 1,000 residents."
    )
    source_fragments = _crime_provenance_fragments(crime, is_nl=is_nl)
    source_text = "CBS"
    if source_fragments:
        source_text += f" · {' · '.join(source_fragments)}"
    source_text += (
        " · Getoond per 1.000 inwoners"
        if is_nl
        else " · Rates shown per 1,000 residents"
    )
    return summary, source_text


def _join_localized_labels(labels: list[str], *, is_nl: bool) -> str:
    if not labels:
        return ""
    conjunction = "en" if is_nl else "and"
    if len(labels) == 1:
        return labels[0]
    if len(labels) == 2:
        return f"{labels[0]} {conjunction} {labels[1]}"
    return f"{', '.join(labels[:-1])}, {conjunction} {labels[-1]}"


def _iter_neighborhood_source_fields(stats: NeighborhoodStats):
    yield (
        "owner_occupied_pct",
        ("koopwoningen", "owner-occupied share"),
        stats.owner_occupied_pct,
    )
    yield (
        "avg_property_value",
        ("woningwaarde", "property value"),
        stats.avg_property_value,
    )
    yield (
        "distance_to_train_km",
        ("afstand tot station", "train distance"),
        stats.distance_to_train_km,
    )
    yield (
        "distance_to_supermarket_km",
        ("afstand tot supermarkt", "supermarket distance"),
        stats.distance_to_supermarket_km,
    )


def _neighborhood_source_caption(stats: NeighborhoodStats | None, *, is_nl: bool) -> str:
    default_year = 2024
    if stats is None:
        return f"CBS Wijken & Buurten {default_year}"

    years: set[int] = set()
    fallback_fields_by_year: dict[int, list[str]] = {}

    for _, labels, indicator in _iter_neighborhood_source_fields(stats):
        if not indicator.available or indicator.value is None:
            continue
        source_year = getattr(indicator, "source_year", None) or default_year
        years.add(source_year)
        if source_year != default_year:
            fallback_fields_by_year.setdefault(source_year, []).append(
                labels[0] if is_nl else labels[1]
            )

    newest_year = max(years) if years else default_year
    base = f"CBS Wijken & Buurten {newest_year}"
    if len(years) <= 1:
        return base

    notes = [
        (
            f"{year}-terugvulling voor {_join_localized_labels(fields, is_nl=is_nl)}"
            if is_nl
            else f"{year} backfill for {_join_localized_labels(fields, is_nl=is_nl)}"
        )
        for year, fields in sorted(fallback_fields_by_year.items(), reverse=True)
        if fields
    ]
    return f"{base} · {' · '.join(notes)}" if notes else base


def _cbs_snapshot_text(
    stats: NeighborhoodStats | None,
    *,
    is_nl: bool,
) -> tuple[str, str]:
    if stats is None:
        return (
            "CBS-buurtgegevens niet beschikbaar."
            if is_nl
            else "CBS neighborhood data unavailable."
        ), "CBS Wijken & Buurten"

    lines: list[str] = []
    if stats.buurt_name:
        lines.append(stats.buurt_name)
    if stats.population_density and stats.population_density.value is not None:
        lines.append(
            (
                f"Inwonerdichtheid: {format_number(stats.population_density.value, 0, is_nl)}"
                if is_nl
                else (
                    "Population density: "
                    f"{format_number(stats.population_density.value, 0, is_nl)}"
                )
            )
        )
    if stats.owner_occupied_pct and stats.owner_occupied_pct.value is not None:
        lines.append(
            (
                f"Koopwoningen: {format_number(stats.owner_occupied_pct.value, 0, is_nl)}%"
                if is_nl
                else f"Owner occupied: {format_number(stats.owner_occupied_pct.value, 0, is_nl)}%"
            )
        )
    if stats.avg_property_value and stats.avg_property_value.value is not None:
        lines.append(
            (
                f"WOZ-waarde: EUR {format_number(stats.avg_property_value.value, 0, is_nl)}"
                if is_nl
                else (
                    "Property value: EUR "
                    f"{format_number(stats.avg_property_value.value, 0, is_nl)}"
                )
            )
        )
    if stats.distance_to_train_km and stats.distance_to_train_km.value is not None:
        lines.append(
            (
                f"Treinstation: {format_number(stats.distance_to_train_km.value, 1, is_nl)} km"
                if is_nl
                else (
                    "Train station: "
                    f"{format_number(stats.distance_to_train_km.value, 1, is_nl)} km"
                )
            )
        )
    age_note = _interpret_age_distribution(stats.age_profile, is_nl)
    selected_lines = lines[:3]
    if age_note:
        selected_lines.append(age_note)
    else:
        selected_lines = lines[:4]
    return " \u00b7 ".join(selected_lines), _neighborhood_source_caption(stats, is_nl=is_nl)


def _draw_neighborhood_evidence_page(
    pdf: BuurtCheckPDF,
    *,
    risks: RiskCardsResponse | None,
    sunlight_score: int | None,
    neighborhood_stats: NeighborhoodStats | None,
    tier_b_data: TierBResponse | None,
    livability: LivabilityResponse | None,
    shadow_images: list[dict[str, Any]] | None,
    is_nl: bool,
) -> None:
    if shadow_images:
        _draw_shadow_triptych(pdf, shadow_images, is_nl)
    else:
        pdf.draw_h1("Bronnenoverzicht" if is_nl else "Neighborhood Evidence", add_divider=False)
        pdf.draw_tinted_box(
            text=(
                "Zomer-schaduwbeelden niet beschikbaar voor deze export."
                if is_nl
                else "Summer shadow evidence is unavailable for this export."
            ),
            fill=TILE_BG,
            border=BORDER,
            accent=SECONDARY,
            font_family="Satoshi",
            font_style="",
            font_size=9,
            text_color=SLATE,
            padding=2.5,
            line_height=4.0,
        )

    content_w = pdf.w - pdf.l_margin - pdf.r_margin
    gap = 4.0
    col_w = (content_w - gap) / 2
    box_h = 29.0
    start_y = pdf.get_y() + 2.0

    sunlight_text, sunlight_source = _sunlight_evidence_text(risks, is_nl=is_nl)
    livability_text, livability_source = _livability_evidence_text(livability, is_nl=is_nl)
    cbs_text, cbs_source = _cbs_snapshot_text(neighborhood_stats, is_nl=is_nl)

    boxes = [
        (
            "Zomerzonlicht" if is_nl else "Summer Sunlight",
            sunlight_text,
            sunlight_source,
            (
                "clear"
                if sunlight_score is not None and sunlight_score >= GOOD_THRESHOLD
                else "attention"
            ),
        ),
        (
            "Leefbaarheid" if is_nl else "Livability",
            livability_text,
            livability_source,
            "clear" if livability and livability.available else "attention",
        ),
        (
            "CBS-buurtsnapshot" if is_nl else "CBS Snapshot",
            cbs_text,
            cbs_source,
            "clear",
        ),
    ]

    for idx, (title, body, source, status) in enumerate(boxes):
        row = idx // 2
        col = idx % 2
        x = pdf.l_margin + col * (col_w + gap)
        y = start_y + row * (box_h + gap)
        _draw_compact_info_box(
            pdf,
            x=x,
            y=y,
            w=col_w,
            h=box_h,
            title=title,
            body=body,
            source=source,
            status=status,
        )

    pdf.set_y(start_y + box_h * 2 + gap + 1.0)
    pdf.set_font("Satoshi", "", 8)
    pdf.set_text_color(*SECONDARY)
    pdf.multi_cell(
        0,
        3.4,
        (
            (
                "Bronnen per blok: 3DBAG / TU Delft + SunCalc, "
                "Leefbaarometer, CBS en Klimaateffectatlas."
            )
            if is_nl
            else (
                "Per-block sources: 3DBAG / TU Delft + SunCalc, "
                "Leefbaarometer, CBS, and Klimaateffectatlas."
            )
        ),
        align="L",
        new_x="LMARGIN",
        new_y="NEXT",
    )
    pdf.set_text_color(*SLATE)


def _draw_bilingual_checklist_page(
    pdf: BuurtCheckPDF,
    *,
    address: str,
    viewing_questions: ViewingQuestionsResponse | None,
    tier_b_data: TierBResponse | None,
    is_nl: bool,
) -> None:
    viewing_questions = _with_crime_viewing_questions(viewing_questions, tier_b_data)
    pdf.draw_h1("Bezichtigingschecklist" if is_nl else "Viewing Checklist", add_divider=False)
    pdf.set_font("Satoshi", "B", 9)
    pdf.set_text_color(*SECONDARY)
    pdf.cell(0, 4.5, address, new_x="LMARGIN", new_y="NEXT")
    pdf.set_text_color(*SLATE)
    pdf.ln(1)

    instruction = (
        "Gebruik de Engelse en Nederlandse vraag samen tijdens de bezichtiging."
        if is_nl
        else "Use the English and Dutch wording together during the viewing."
    )
    pdf.set_font("Satoshi", "", 9)
    pdf.multi_cell(0, 4.2, instruction, new_x="LMARGIN", new_y="NEXT")
    pdf.ln(1)

    if not viewing_questions or not viewing_questions.categories:
        pdf.draw_tinted_box(
            text=(
                "Geen checklist beschikbaar. Gebruik de notitieruimte hieronder."
                if is_nl
                else "No checklist was available. Use the notes section below."
            ),
            fill=TILE_BG,
            border=BORDER,
            accent=SECONDARY,
            font_family="Satoshi",
            font_style="",
            font_size=9,
            text_color=SLATE,
            padding=2.6,
            line_height=4.0,
        )
        _ensure_page_space(pdf, 42.0)
        _draw_notes_section(pdf, is_nl)
        return

    max_questions = 10
    question_count = 0
    clipped = False
    for category in viewing_questions.categories:
        if question_count >= max_questions or pdf.h - pdf.get_y() - pdf.b_margin < 54:
            clipped = True
            break
        sev_color = SEVERITY_COLORS.get(category.severity, MUTED)
        pdf.set_fill_color(*sev_color)
        pdf.rect(pdf.l_margin, pdf.get_y() + 0.4, 1.6, 4.8, "F")
        pdf.set_x(pdf.l_margin + 4.0)
        pdf.set_font("Satoshi", "B", 8.5)
        pdf.set_text_color(*SLATE)
        pdf.cell(
            0,
            4.5,
            f"{category.name} / {category.name_nl}",
            new_x="LMARGIN",
            new_y="NEXT",
        )
        pdf.ln(0.5)

        for question in category.questions:
            if question_count >= max_questions or pdf.h - pdf.get_y() - pdf.b_margin < 50:
                clipped = True
                break
            qx = pdf.l_margin + 2.0
            qy = pdf.get_y()
            pdf.draw_checkbox(qx, qy + 0.8)
            text_x = qx + 5.0
            text_w = pdf.w - pdf.r_margin - text_x
            pdf.set_xy(text_x, qy)
            pdf.set_font("Satoshi", "", 8.2)
            pdf.set_text_color(*SLATE)
            pdf.multi_cell(text_w, 3.8, question.text_en, new_x="LMARGIN", new_y="NEXT")
            pdf.set_x(text_x)
            pdf.set_font("Satoshi", "", 7.2)
            pdf.set_text_color(*SECONDARY)
            pdf.multi_cell(text_w, 3.4, question.text_nl, new_x="LMARGIN", new_y="NEXT")
            pdf.set_text_color(*SLATE)
            pdf.ln(0.8)
            question_count += 1

        pdf.ln(0.5)

    if clipped:
        pdf.set_font("Satoshi", "", 7.5)
        pdf.set_text_color(*SECONDARY)
        pdf.multi_cell(
            0,
            3.2,
            (
                "Aanvullende vragen zijn ingekort om de checklist op één pagina te houden."
                if is_nl
                else "Additional questions were trimmed to keep the checklist on one page."
            ),
            new_x="LMARGIN",
            new_y="NEXT",
        )
        pdf.set_text_color(*SLATE)

    _ensure_page_space(pdf, 38.0)
    _draw_notes_section(pdf, is_nl)


def _draw_risk_card_header(
    pdf: BuurtCheckPDF,
    *,
    title: str,
    score: int | None,
    is_nl: bool,
) -> None:
    color = _severity_color(score)
    title_y = pdf.get_y()

    # Left accent bar
    pdf.set_fill_color(*color)
    pdf.rect(pdf.l_margin, title_y + 0.8, 2.0, 7.0, "F")

    # Title (left side) — draw_h2 draws its own accent bar, so skip ours
    # We draw the title manually to control cursor position
    title_x = pdf.l_margin + 5
    pdf.set_xy(title_x, title_y)
    pdf.set_font("Satoshi", "B", 11)
    pdf.set_text_color(*SLATE)
    title_w = pdf.get_string_width(title)
    pdf.cell(title_w + 1, 6, title)

    # Severity label — same line as title, right after it
    label_text = _severity_label(score, is_nl=is_nl)
    if label_text:
        pdf.set_font("SatoshiMedium", "", 9)
        pdf.set_text_color(*color)
        label_x = title_x + title_w + 4
        pdf.set_xy(label_x, title_y + 0.5)
        pdf.cell(0, 6, label_text)

    # Score (right side, same line as title)
    pdf.set_xy(pdf.w - pdf.r_margin - 30, title_y)
    pdf.set_font("SatoshiBlack", "", 16)
    pdf.set_text_color(*color)
    pdf.cell(30, 6, _score_text(score, is_nl=is_nl), align="R")

    # Score bar below the title row
    bar_y = title_y + 8.5
    pdf.set_text_color(*SLATE)
    pdf.draw_score_bar(
        pdf.l_margin,
        bar_y,
        pdf.w - pdf.l_margin - pdf.r_margin,
        score,
        height=4.5,
    )
    pdf.set_y(bar_y + 7)


def _draw_rate_comparison_chart(
    pdf: BuurtCheckPDF,
    *,
    title: str,
    address_rate: float,
    national_rate: float | None,
    is_nl: bool,
    score: int | None,
    scope: str = "buurt",
) -> None:
    rows: list[tuple[str, int, tuple[int, int, int], bool]] = []
    address_score = score if score is not None else normalize_crime_score(address_rate)
    if scope == "gemeente":
        scope_label = "Gemeentelijke context" if is_nl else "Municipality context"
    else:
        scope_label = "Deze buurt" if is_nl else "This neighborhood"
    rows.append(
        (
            scope_label,
            address_score if address_score is not None else 0,
            _severity_color(address_score),
            False,
        )
    )
    if national_rate is not None:
        national_score = normalize_crime_score(national_rate)
        if national_score is not None:
            rows.append(
                (
                    "Nederland" if is_nl else "Netherlands",
                    national_score,
                    NATIONAL,
                    False,
                )
            )
    chart_end_y = pdf.draw_comparison_chart(
        x=pdf.l_margin,
        y=pdf.get_y(),
        width=pdf.w - pdf.l_margin - pdf.r_margin,
        rows=rows,
        chart_title=title,
        is_nl=is_nl,
    )
    pdf.set_y(chart_end_y + 1)
    pdf.set_font("Satoshi", "", 8)
    pdf.set_text_color(*SECONDARY)
    scale_note = (
        f"Rates shown per 1,000 residents. {scope_label}: {format_number(address_rate, 1, is_nl)}"
        if not is_nl
        else (
            f"Getoond als aantal per 1.000 inwoners. {scope_label}: "
            f"{format_number(address_rate, 1, is_nl)}"
        )
    )
    if national_rate is not None:
        suffix = (
            f" · Netherlands: {format_number(national_rate, 1, is_nl)}"
            if not is_nl
            else f" · Nederland: {format_number(national_rate, 1, is_nl)}"
        )
        scale_note += suffix
    pdf.multi_cell(0, 3.5, scale_note, align="L", new_x="LMARGIN", new_y="NEXT")
    pdf.set_text_color(*SLATE)
    pdf.ln(1)


def _estimate_pdf_text_height(
    pdf: BuurtCheckPDF,
    *,
    text: str | None,
    width: float,
    line_height: float,
    font_family: str = "Satoshi",
    font_style: str = "",
    font_size: float = 10,
) -> float:
    """Estimate wrapped text height using the current FPDF font metrics."""
    if not text:
        return 0.0
    pdf.set_font(font_family, font_style, font_size)
    return float(
        pdf.multi_cell(
            width,
            line_height,
            text,
            dry_run=True,
            output="HEIGHT",
        )
    )


def _comparison_chart_legend_text(*, is_nl: bool) -> str:
    return (
        "Legenda: ernstkleurige balk = dit adres, "
        "blauwgrijs = vergelijkingsgroep, lichtblauw = nationaal, "
        "gestreept = richtlijn"
        if is_nl
        else (
            "Legend: severity-colored bar = this address, "
            "blue-gray = peer group, light blue = national, "
            "dashed = benchmark"
        )
    )


def _estimate_comparison_chart_height(
    pdf: BuurtCheckPDF,
    *,
    rows: list[tuple[str, int, tuple[int, int, int], bool]],
    width: float,
    chart_title: str,
    show_legend: bool,
    is_nl: bool,
) -> float:
    """Estimate comparison chart height using the same layout rules as rendering."""
    if not rows:
        return 0.0

    if chart_renderer is not None:
        try:
            address_idx = next(
                (
                    idx
                    for idx, row in enumerate(rows)
                    if _is_address_comparison_label(row[0])
                    and not row[3]
                    and row[1] is not None
                ),
                None,
            )
            if address_idx is not None:
                _, address_score_raw, _, _ = rows[address_idx]
                address_score = int(round(address_score_raw))
                comparisons_payload = _build_chart_renderer_comparisons(rows)
                layout = chart_renderer.build_risk_comparison_layout(
                    category=chart_title or ("Vergelijking" if is_nl else "Comparison"),
                    address_score=address_score,
                    comparisons=comparisons_payload,
                )
                chart_h = _scaled_chart_height(
                    width,
                    source_width_mm=chart_renderer.CHART_WIDTH_MM,
                    source_height_mm=layout.chart_height_mm,
                )
                legend_h = 0.0
                if show_legend:
                    legend_h = 1.0 + _estimate_pdf_text_height(
                        pdf,
                        text=_comparison_chart_legend_text(is_nl=is_nl),
                        width=width,
                        line_height=3.5,
                        font_family="Satoshi",
                        font_size=8,
                    )
                return chart_h + 4.0 + legend_h
        except Exception:
            logger.exception(
                "comparison chart height estimate failed; using native fallback"
            )

    row_h = 7.0
    address_gap = 2.5
    address_rows = [row for row in rows if _is_address_comparison_label(row[0]) and not row[3]]
    reference_rows = [row for row in rows if row not in address_rows]
    sorted_rows = address_rows + reference_rows
    total_h = len(sorted_rows) * row_h
    if address_rows and reference_rows:
        total_h += address_gap

    chart_h = total_h + 4.0
    if chart_title:
        chart_h += 5.0
    if show_legend:
        chart_h += 4.0
    return chart_h


def _crime_checklist_category(
    tier_b_data: TierBResponse | None,
) -> QuestionCategory | None:
    return _shared_crime_checklist_category(tier_b_data)


def _with_crime_viewing_questions(
    viewing_questions: ViewingQuestionsResponse | None,
    tier_b_data: TierBResponse | None,
) -> ViewingQuestionsResponse | None:
    return _augment_viewing_questions_with_crime(viewing_questions, tier_b_data)


def _draw_risk_details_page(
    pdf: BuurtCheckPDF,
    address: str,
    risks: RiskCardsResponse | None,
    sunlight_score: int | None,
    comparisons: RiskComparisonsResponse | None,
    is_nl: bool,
    tier_b_data: TierBResponse | None = None,
) -> None:
    """Detailed risk breakdown with structured measurement tables."""
    pdf.draw_h1("Risicodetails" if is_nl else "Risk Details", add_divider=False)
    pdf.set_font("Satoshi", "B", 9)
    pdf.set_text_color(*SECONDARY)
    pdf.cell(0, 5, address, new_x="LMARGIN", new_y="NEXT")
    pdf.set_text_color(*SLATE)
    pdf.ln(2)

    categories = _build_risk_detail_data(risks, sunlight_score, comparisons, is_nl)
    first_chart_drawn = False

    def _start_new_page_if_needed(required_h: float) -> None:
        if pdf.h - pdf.get_y() - pdf.b_margin >= required_h or pdf.get_y() <= 40:
            return
        pdf.add_page()
        pdf.draw_h1("Risicodetails" if is_nl else "Risk Details", add_divider=False)
        pdf.set_font("Satoshi", "B", 9)
        pdf.set_text_color(*SECONDARY)
        pdf.cell(0, 5, address, new_x="LMARGIN", new_y="NEXT")
        pdf.set_text_color(*SLATE)
        pdf.ln(2)

    for (
        cat_name, score, summary, source_text,
        comp_rows, measurements, unit_def,
    ) in categories:
        estimated_h = 36.0 + (len(measurements or []) * 6.0) + (24.0 if comp_rows else 0.0)
        if summary:
            estimated_h += 12.0
        if unit_def:
            estimated_h += 7.0
        if cat_name in ("Zonlicht", "Sunlight") and risks:
            estimated_h += 40.0
        _start_new_page_if_needed(estimated_h)

        _draw_risk_card_header(pdf, title=cat_name, score=score, is_nl=is_nl)
        if summary:
            pdf.set_font("Satoshi", "", 10)
            pdf.multi_cell(0, 5, summary, align="L", new_x="LMARGIN", new_y="NEXT")
            pdf.ln(2)

        _draw_measurement_table(
            pdf,
            category_name=cat_name,
            measurements=measurements,
            is_nl=is_nl,
        )

        if unit_def:
            pdf.draw_h3("Context" if not is_nl else "Context")
            pdf.set_font("Satoshi", "", 8)
            pdf.set_text_color(*SECONDARY)
            pdf.multi_cell(0, 3.5, unit_def, align="L", new_x="LMARGIN", new_y="NEXT")
            pdf.set_text_color(*SLATE)
            pdf.ln(1)

        if comp_rows:
            chart_title = (
                f"{cat_name} \u2014 vergelijking" if is_nl
                else f"{cat_name} \u2014 comparison"
            )
            chart_required_h = _estimate_comparison_chart_height(
                pdf,
                rows=comp_rows,
                width=pdf.w - pdf.l_margin - pdf.r_margin,
                chart_title=chart_title,
                show_legend=not first_chart_drawn,
                is_nl=is_nl,
            )
            _start_new_page_if_needed(chart_required_h)
            chart_end_y = pdf.draw_comparison_chart(
                x=pdf.l_margin,
                y=pdf.get_y(),
                width=pdf.w - pdf.l_margin - pdf.r_margin,
                rows=comp_rows,
                chart_title=chart_title,
                show_legend=not first_chart_drawn,
                is_nl=is_nl,
            )
            first_chart_drawn = True
            pdf.set_y(chart_end_y + 2)
            _draw_score_scale_caption(pdf, is_nl)

        pdf.draw_h3("Source" if not is_nl else "Bron")
        pdf.set_font("Satoshi", "", 8)
        pdf.set_text_color(*SECONDARY)
        pdf.multi_cell(0, 4, source_text, align="L", new_x="LMARGIN", new_y="NEXT")
        pdf.set_text_color(*SLATE)
        pdf.ln(2)

        if cat_name in ("Zonlicht", "Sunlight") and risks:
            _draw_sunlight_details(pdf, risks, is_nl)
            pdf.ln(1)

    crime = tier_b_data.crime if tier_b_data and tier_b_data.crime else None
    if crime and crime.total_per_1000 is not None:
        total_label = "per 1,000" if not is_nl else "per 1.000"
        crime_measurements: list[tuple[str, str]] = [
            (
                "Total rate" if not is_nl else "Totaal",
                f"{format_number(crime.total_per_1000, 1, is_nl)} {total_label}",
            )
        ]
        if crime.burglary_per_1000 is not None:
            crime_measurements.append(
                (
                    "Burglary" if not is_nl else "Inbraak",
                    f"{format_number(crime.burglary_per_1000, 1, is_nl)} {total_label}",
                )
            )
        if crime.violent_per_1000 is not None:
            crime_measurements.append(
                (
                    "Violent" if not is_nl else "Geweld",
                    f"{format_number(crime.violent_per_1000, 1, is_nl)} {total_label}",
                )
            )

        _start_new_page_if_needed(60.0 + len(crime_measurements) * 6.0)
        _draw_risk_card_header(
            pdf,
            title="Criminaliteit" if is_nl else "Crime Rate",
            score=crime.score,
            is_nl=is_nl,
        )
        meaning = (crime.meaning_nl if is_nl else crime.meaning_en) or ""
        if meaning:
            pdf.set_font("Satoshi", "", 10)
            pdf.multi_cell(0, 5, meaning, align="L", new_x="LMARGIN", new_y="NEXT")
            pdf.ln(2)
        _draw_measurement_table(
            pdf,
            category_name="Criminaliteit" if is_nl else "Crime Rate",
            measurements=crime_measurements,
            is_nl=is_nl,
        )
        _draw_rate_comparison_chart(
            pdf,
            title="Criminaliteit \u2014 vergelijking" if is_nl else "Crime rate \u2014 comparison",
            address_rate=crime.total_per_1000,
            national_rate=crime.national_per_1000,
            is_nl=is_nl,
            score=crime.score,
            scope=crime.scope,
        )
        source_parts = [crime.source]
        source_parts.extend(_crime_provenance_fragments(crime, is_nl=is_nl))
        pdf.draw_h3("Source" if not is_nl else "Bron")
        pdf.set_font("Satoshi", "", 8)
        pdf.set_text_color(*SECONDARY)
        pdf.multi_cell(
            0,
            4,
            ("Source: " if not is_nl else "Bron: ") + " \u00b7 ".join(source_parts),
            align="L",
            new_x="LMARGIN",
            new_y="NEXT",
        )
        disclaimer = (
            (
                "Crime rates are per 1,000 residents. The score uses fixed risk "
                "bands, while comparison rows use CBS period data."
            )
            if not is_nl
            else (
                "Criminaliteitscijfers zijn per 1.000 inwoners. De score "
                "gebruikt vaste risicobanden, terwijl de vergelijkingsrijen "
                "CBS-periodes gebruiken."
            )
        )
        pdf.multi_cell(0, 4, disclaimer, align="L", new_x="LMARGIN", new_y="NEXT")
        pdf.set_text_color(*SLATE)
        pdf.ln(2)


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
                "Winter",
                sun.winter_hours,
            ))
        if sun.equinox_hours is not None:
            seasons.append((
                "Equinox",
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
    svf_percent, weighted_svf_percent = _sunlight_svf_values(sun)
    svf = svf_percent if svf_percent is not None else weighted_svf_percent
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
        if svf >= _SVF_OPEN_THRESHOLD:
            interp = "Zeer open" if is_nl else "Highly open"
        elif svf >= _SVF_MODERATE_THRESHOLD:
            interp = "Gemiddeld" if is_nl else "Moderate"
        else:
            interp = "Besloten" if is_nl else "Enclosed"

        pdf.set_font("Satoshi", "B", 9)
        pdf.set_text_color(*SLATE)
        pdf.cell(20, 5, f"{val_text}%")
        pdf.set_font("Satoshi", "", 10)
        pdf.cell(0, 5, f"\u2014 {interp}", new_x="LMARGIN", new_y="NEXT")

        if (
            weighted_svf_percent is not None
            and svf_percent is not None
            and not _is_same_percent(weighted_svf_percent, svf_percent)
        ):
            pdf.set_font("Satoshi", "", 8)
            pdf.set_text_color(*SECONDARY)
            note = (
                f"Gewogen hemelzicht: {format_number(weighted_svf_percent, 0, is_nl)}%"
                if is_nl
                else f"Weighted sky openness: {format_number(weighted_svf_percent, 0, is_nl)}%"
            )
            pdf.cell(0, 4, note, new_x="LMARGIN", new_y="NEXT")
            pdf.set_text_color(*SLATE)

        pdf.ln(3)

    # --- Facade orientation table (E2-S4) ---
    if sun.facade_results:
        display_rows = _build_facade_display_rows(sun.facade_results, is_nl=is_nl)
        est_table_h = _estimate_facade_table_height_mm(display_rows)
        est_primary_h = (
            chart_renderer.facade_heatmap_height_mm(len(display_rows)) + 9.0
            if chart_renderer is not None
            else est_table_h
        )
        remaining = pdf.h - pdf.get_y() - 20
        if remaining < est_primary_h and pdf.get_y() > 40:
            pdf.add_page()

        # Section label
        pdf.set_font("SatoshiMedium", "", 9)
        pdf.set_text_color(*SECONDARY)
        label = "GEVELANALYSE" if is_nl else "FACADE ANALYSIS"
        pdf.cell(0, 5, label, new_x="LMARGIN", new_y="NEXT")
        pdf.ln(1)

        if chart_renderer is not None:
            try:
                heatmap_rows = _build_facade_heatmap_rows(sun.facade_results)
                heatmap_h = chart_renderer.facade_heatmap_height_mm(len(heatmap_rows))
                heatmap_png = chart_renderer.render_facade_heatmap(
                    heatmap_rows,
                    is_nl=is_nl,
                    output_format="png",
                )
                chart_end_y = _embed_chart_png(
                    pdf,
                    heatmap_png,
                    x=pdf.l_margin,
                    y=pdf.get_y(),
                    width=content_w,
                    source_width_mm=chart_renderer.CHART_WIDTH_MM,
                    source_height_mm=heatmap_h,
                )
                pdf.set_y(chart_end_y + 2)
            except Exception:
                logger.exception(
                    "chart_renderer facade heatmap failed; falling back to native facade table"
                )
                _draw_facade_table(pdf, display_rows, is_nl=is_nl)
        else:
            _draw_facade_table(pdf, display_rows, is_nl=is_nl)

        best_facade, best_winter = _best_winter_facade(display_rows)
        _draw_facade_interpretation(
            pdf,
            best_facade=best_facade,
            best_winter=best_winter,
            is_nl=is_nl,
        )
        pdf.ln(3)


_FACADE_ORIENTATION_LABELS_NL = {
    "n": "Noord", "north": "Noord",
    "e": "Oost", "east": "Oost",
    "s": "Zuid", "south": "Zuid",
    "w": "West", "west": "West",
    "ne": "NO", "northeast": "NO",
    "nw": "NW", "northwest": "NW",
    "se": "ZO", "southeast": "ZO",
    "sw": "ZW", "southwest": "ZW",
}
_FACADE_ORIENTATION_LABELS_EN = {
    "n": "North", "north": "North",
    "e": "East", "east": "East",
    "s": "South", "south": "South",
    "w": "West", "west": "West",
    "ne": "NE", "northeast": "NE",
    "nw": "NW", "northwest": "NW",
    "se": "SE", "southeast": "SE",
    "sw": "SW", "southwest": "SW",
}


def _build_facade_display_rows(
    facade_results: list[FacadeResult],
    *,
    is_nl: bool,
) -> list[tuple[str, FacadeResult]]:
    ori_map = _FACADE_ORIENTATION_LABELS_NL if is_nl else _FACADE_ORIENTATION_LABELS_EN
    counts: dict[str, int] = {}
    for facade in facade_results:
        key = facade.orientation.lower().strip()
        counts[key] = counts.get(key, 0) + 1
    display_rows: list[tuple[str, FacadeResult]] = []
    for facade in facade_results:
        key = facade.orientation.lower().strip()
        label = ori_map.get(key, facade.orientation.capitalize())
        if counts.get(key, 0) > 1 and getattr(facade, "height_label", ""):
            label = f"{label} ({facade.height_label})"
        display_rows.append((label, facade))
    return display_rows


def _estimate_facade_table_height_mm(display_rows: list[tuple[str, FacadeResult]]) -> float:
    return 10.0 + len(display_rows) * 6.0 + 12.0


def _build_facade_heatmap_rows(
    facade_results: list[FacadeResult],
) -> list[Any]:
    if chart_renderer is None:
        return []
    return [
        chart_renderer.FacadeHeatmapRow(
            orientation=facade.orientation,
            height_label=facade.height_label,
            winter_hours=facade.winter_hours,
            summer_hours=facade.summer_hours,
            annual_average=facade.annual_average,
        )
        for facade in facade_results
    ]


def _draw_facade_table(
    pdf: BuurtCheckPDF,
    display_rows: list[tuple[str, FacadeResult]],
    *,
    is_nl: bool,
) -> None:
    has_multi_height = any("(" in label for label, _facade in display_rows)
    col_facade = 45 if has_multi_height else 35
    col_winter = 30
    col_summer = 30
    row_h = 6
    unit = "u" if is_nl else "h"

    pdf.set_font("Satoshi", "B", 9)
    pdf.set_text_color(*SLATE)
    header_y = pdf.get_y()
    pdf.set_xy(pdf.l_margin, header_y)
    pdf.cell(col_facade, row_h, "Gevel" if is_nl else "Facade")
    pdf.cell(col_winter, row_h, "Winter")
    pdf.cell(col_summer, row_h, "Zomer" if is_nl else "Summer")
    pdf.set_y(header_y + row_h)

    pdf.set_draw_color(*BORDER)
    pdf.line(
        pdf.l_margin,
        pdf.get_y(),
        pdf.l_margin + col_facade + col_winter + col_summer,
        pdf.get_y(),
    )
    pdf.ln(0.5)

    for label, facade in display_rows:
        row_y = pdf.get_y()
        pdf.set_font("SatoshiMedium", "", 9)
        pdf.set_text_color(*SECONDARY)
        pdf.set_xy(pdf.l_margin, row_y)
        pdf.cell(col_facade, row_h, label)

        pdf.set_font("Satoshi", "B", 9)
        pdf.set_text_color(*SLATE)
        winter_val = format_number(facade.winter_hours, 1, is_nl)
        pdf.cell(col_winter, row_h, f"{winter_val}{unit}")

        summer_val = format_number(facade.summer_hours, 1, is_nl)
        pdf.cell(col_summer, row_h, f"{summer_val}{unit}")
        pdf.set_y(row_y + row_h)

    pdf.ln(2)


def _best_winter_facade(display_rows: list[tuple[str, FacadeResult]]) -> tuple[str, float]:
    best_facade = ""
    best_winter = -1.0
    for label, facade in display_rows:
        if facade.winter_hours > best_winter:
            best_winter = facade.winter_hours
            best_facade = label
    return best_facade, best_winter


def _draw_facade_interpretation(
    pdf: BuurtCheckPDF,
    *,
    best_facade: str,
    best_winter: float,
    is_nl: bool,
) -> None:
    if not best_facade or best_winter <= 0:
        return
    pdf.set_font("Satoshi", "", 10)
    pdf.set_text_color(*SLATE)
    if is_nl:
        interp = (
            f"{best_facade} ontvangt het meeste winterzonlicht "
            f"({format_number(best_winter, 1, is_nl)}u/dag)"
        )
    else:
        interp = (
            f"{best_facade} facade receives the most "
            f"winter sunlight ({format_number(best_winter, 1, is_nl)}h/day)"
        )
    pdf.multi_cell(0, 5, interp, align="L", new_x="LMARGIN", new_y="NEXT")


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


def _draw_score_scale_caption(pdf: BuurtCheckPDF, is_nl: bool) -> None:
    """Declare that comparison bars use the normalized 0-100 score scale."""
    pdf.set_font("Satoshi", "", 8)
    pdf.set_text_color(*SECONDARY)
    caption = (
        "Vergelijkingsbalken staan op de buurt-check 0\u2013100 scoreschaal "
        "(niet op ruwe eenheden). Hoger = beter."
        if is_nl
        else "Comparison bars are on the buurt-check 0\u2013100 score scale "
        "(not raw units). Higher = better."
    )
    pdf.cell(0, 3, caption, new_x="LMARGIN", new_y="NEXT")
    pdf.set_text_color(*SLATE)
    pdf.ln(1)


_WHO_NOISE_LDEN_DB = 53.0
_WHO_PM25_UG_M3 = 5.0
_WHO_NO2_UG_M3 = 10.0


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
        "nl": "Op basis van gemodelleerde hitte- en wateroverlastscenario's",
        "en": "Based on modeled heat-stress and water-nuisance scenarios",
    },
    "sunlight": {
        "nl": (
            "Score op basis van directe winterzon. Winter/equinox/jaargemiddelde in"
            " u/dag; SVF = zichtbaar hemelpercentage; zoninstraling in kWh/m\u00b2/jaar"
        ),
        "en": (
            "Score is based on direct winter sun. Winter/equinox/annual average in"
            " h/day; SVF = visible sky factor (%); solar irradiance in kWh/m\u00b2/year"
        ),
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
            None, False,
        ),
        "city_avg": (
            "Vergelijkingswaarde (stedelijkheid)" if is_nl
            else "Peer baseline (urbanization)", COMPARISON_PEER, False,
        ),
        "nl_avg": (
            "Nederland" if is_nl else "Netherlands",
            COMPARISON_NATIONAL, False,
        ),
        "who_limit": (
            "WHO-geluidsrichtlijn" if is_nl
            else "WHO noise guideline",
            COMPARISON_REFERENCE, True,
        ),
        "air_interim_target": (
            "Luchtkwaliteitsdoel" if is_nl
            else "Air quality target",
            COMPARISON_REFERENCE, True,
        ),
        "adaptation_target": (
            "Klimaatdoel" if is_nl
            else "Climate target", COMPARISON_REFERENCE, True,
        ),
        "daylight_target": (
            "Daglichtdoel" if is_nl
            else "Daylight target",
            COMPARISON_REFERENCE, True,
        ),
    }

    _LABEL_KEY_LABELS = {
        "risk.detail.address": "Dit adres" if is_nl else "This address",
        "risk.detail.peerUrbanization": (
            "Vergelijkingswaarde (stedelijkheid)" if is_nl
            else "Peer baseline (urbanization)"
        ),
        "risk.detail.nationalBaseline": "Nederland" if is_nl else "Netherlands",
        "risk.detail.whoNoiseGuideline": (
            "WHO-geluidsrichtlijn" if is_nl else "WHO noise guideline"
        ),
        "risk.detail.airQualityTarget": (
            "Luchtkwaliteitsdoel" if is_nl else "Air quality target"
        ),
        "risk.detail.climateAdaptationTarget": (
            "Klimaatadaptatiedoel" if is_nl else "Climate adaptation target"
        ),
        "risk.detail.daylightTarget": "Daglichtdoel" if is_nl else "Daylight target",
    }

    def _comparison_label_info(row) -> tuple[str, tuple[int, int, int] | None, bool]:
        label_key = getattr(row, "label_key", None)
        label = _LABEL_KEY_LABELS.get(label_key) if label_key else None
        family = getattr(row, "benchmark_family", None)
        role = getattr(row, "role", None)
        if role == "peer":
            return (
                label or (
                    "Vergelijkingswaarde (stedelijkheid)" if is_nl
                    else "Peer baseline (urbanization)"
                ),
                COMPARISON_PEER,
                False,
            )
        if role == "national":
            return (
                label or ("Nederland" if is_nl else "Netherlands"),
                COMPARISON_NATIONAL,
                False,
            )
        if role == "reference":
            return (
                label or _COMPARISON_LABELS.get(
                    row.label_code,
                    (row.label_code, COMPARISON_REFERENCE, True),
                )[0],
                COMPARISON_REFERENCE,
                True,
            )
        if role == "address":
            return (label or ("Dit adres" if is_nl else "This address"), None, False)
        if family == "air_interim_target":
            return (
                "Luchtkwaliteitsdoel" if is_nl else "Air quality target",
                COMPARISON_REFERENCE,
                True,
            )
        return _COMPARISON_LABELS.get(
            row.label_code,
            (row.label_code, COMPARISON_PEER, False),
        )

    def _comp_rows(category_rows: list | None, score: int | None) -> list:
        if not category_rows:
            return []
        rows = []
        for row in category_rows:
            # Skip address rows with no value to prevent label overlap
            if row.label_code == "address" and row.value is None:
                continue
            label_info = _comparison_label_info(row)
            is_dashed = (
                row.pattern == ComparisonPattern.dashed
                or label_info[2]
            )
            color = label_info[1]
            if row.label_code == "address":
                color = _severity_color(score)
            rows.append((
                label_info[0], row.value,
                color, is_dashed,
            ))
        return _dedupe_comparison_rows(rows)

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
                who_label = "WHO-richtlijn (Lden)" if is_nl else "WHO guideline (Lden)"
                who_val = format_number(_WHO_NOISE_LDEN_DB, 1, is_nl)
                meas.append((who_label, f"{who_val} dB"))
        elif attr == "air_quality":
            if card.pm25_ug_m3 is not None:
                val = format_number(card.pm25_ug_m3, 1, is_nl)
                meas.append(("PM2.5", f"{val} \u00b5g/m\u00b3"))
                who_label = "WHO-richtlijn PM2.5" if is_nl else "WHO guideline PM2.5"
                who_val = format_number(_WHO_PM25_UG_M3, 1, is_nl)
                meas.append((who_label, f"{who_val} \u00b5g/m\u00b3"))
            if card.no2_ug_m3 is not None:
                val = format_number(card.no2_ug_m3, 1, is_nl)
                meas.append((
                    "NO\u2082", f"{val} \u00b5g/m\u00b3",
                ))
                who_label = "WHO-richtlijn NO\u2082" if is_nl else "WHO guideline NO\u2082"
                who_val = format_number(_WHO_NO2_UG_M3, 1, is_nl)
                meas.append((who_label, f"{who_val} \u00b5g/m\u00b3"))
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

    def _warning_copy(code: str) -> str:
        labels = {
            "NOISE_LAYER_UNAVAILABLE": (
                "Geluidsdatalaag tijdelijk niet beschikbaar."
                if is_nl else "Noise data layer is temporarily unavailable."
            ),
            "NOISE_NO_VALUE": (
                "Geen geluidsmeting op deze exacte locatie."
                if is_nl else "No noise measurement at this exact location."
            ),
            "NOISE_LOOKUP_FAILED": (
                "Geluidsdata kon niet worden opgehaald."
                if is_nl else "Noise data could not be retrieved."
            ),
            "NOISE_TIMEOUT": (
                "Geluidsbron reageerde te traag."
                if is_nl else "Noise source timed out."
            ),
            "AIR_NO_VALUE": (
                "Geen luchtkwaliteitsmeting op deze locatie."
                if is_nl else "No air quality measurement at this location."
            ),
            "AIR_PARTIAL": (
                "Slechts gedeeltelijke luchtkwaliteitsdata beschikbaar."
                if is_nl else "Only partial air quality data is available."
            ),
            "AIR_LOOKUP_FAILED": (
                "Luchtkwaliteitsdata kon niet worden opgehaald."
                if is_nl else "Air quality data could not be retrieved."
            ),
            "AIR_TIMEOUT": (
                "Luchtkwaliteitsbron reageerde te traag."
                if is_nl else "Air quality source timed out."
            ),
            "CLIMATE_NO_DATA": (
                "Geen klimaatstressdata beschikbaar voor deze locatie."
                if is_nl else "No climate stress data is available for this location."
            ),
            "CLIMATE_PARTIAL": (
                "Slechts gedeeltelijke klimaatstressdata beschikbaar."
                if is_nl else "Only partial climate stress data is available."
            ),
            "CLIMATE_LAYER_UNMAPPED": (
                "Een klimaatlaag had een onbekend schema en is niet gebruikt."
                if is_nl else "A climate layer had an unknown schema and was not used."
            ),
            "CLIMATE_LOOKUP_FAILED": (
                "Klimaatstressdata kon niet worden opgehaald."
                if is_nl else "Climate stress data could not be retrieved."
            ),
            "CLIMATE_TIMEOUT": (
                "Klimaatbron reageerde te traag."
                if is_nl else "Climate source timed out."
            ),
        }
        return labels.get(code, code)

    def _append_warning_summary(summary: str, card: Any) -> str:
        warnings = list(getattr(card, "warnings", []) or [])
        message = getattr(card, "message", None)
        if message and message not in warnings:
            warnings.append(message)
        if not warnings:
            return summary
        label = "Beperking" if is_nl else "Limitation"
        warning_text = "; ".join(_warning_copy(code) for code in warnings)
        return f"{summary} {label}: {warning_text}".strip()

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
            summary = _append_warning_summary(summary, card)
            src_label = "Bron" if is_nl else "Source"
            source = f"{src_label}: {card.source}"
            if card.source_date:
                source += f" \u00b7 {card.source_date}"
            elif attr != "climate_stress":
                # Climate gets scenario text instead of generic "date unknown"
                source += f" \u00b7 {date_unknown}"

            # Climate: keep source human-readable; internal layer names stay hidden.
            if attr == "climate_stress":
                scenario = (
                    "Gemodelleerd klimaatscenario" if is_nl
                    else "Modeled climate scenario"
                )
                source += f" \u00b7 {scenario}"

            comp = _comp_rows(
                getattr(comparisons, comp_attr, None)
                if comparisons else None,
                card.score,
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
        if sun.equinox_hours is not None:
            unit = "u/dag" if is_nl else "h/day"
            label = "Equinox"
            val = format_number(sun.equinox_hours, 1, is_nl)
            sun_meas.append((label, f"{val} {unit}"))
        if sun.annual_average is not None:
            unit = "u/dag" if is_nl else "h/day"
            label = "Jaargemiddelde" if is_nl else "Annual average"
            val = format_number(sun.annual_average, 1, is_nl)
            sun_meas.append((label, f"{val} {unit}"))
        svf_percent, weighted_svf_percent = _sunlight_svf_values(sun)
        if svf_percent is not None:
            val = format_number(svf_percent, 0, is_nl)
            sun_meas.append(("SVF", f"{val}%"))
        if weighted_svf_percent is not None and not _is_same_percent(
            weighted_svf_percent,
            svf_percent,
        ):
            label = "SVF (anisotropisch)" if is_nl else "SVF (anisotropic)"
            val = format_number(weighted_svf_percent, 0, is_nl)
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
        sunlight_score,
    )
    src_label = "Bron" if is_nl else "Source"
    sun_unit_def = None
    if sun_measurements:
        sun_unit_def = _UNIT_DEFINITIONS["sunlight"]["nl" if is_nl else "en"]
    result.append((
        "Zonlicht" if is_nl else "Sunlight",
        sunlight_score,
        sun_summary,
        f"{src_label}: SunCalc + 3DBAG",
        sun_comp,
        sun_measurements,
        sun_unit_def,
    ))

    return result


def _numeric_from_text(text: str) -> float | None:
    match = re.search(r"-?\d+(?:[.,]\d+)?", text)
    if not match:
        return None
    try:
        return float(match.group(0).replace(",", "."))
    except ValueError:
        return None


def _measurement_table_rows(
    category_name: str,
    measurements: list[tuple[str, str]] | None,
    *,
    is_nl: bool,
) -> list[tuple[str, str, str, tuple[int, int, int]]]:
    if not measurements:
        return []

    metric_map = dict(measurements)
    rows: list[tuple[str, str, str, tuple[int, int, int]]] = []

    def _compliance_color(value_text: str, reference_text: str) -> tuple[int, int, int]:
        value = _numeric_from_text(value_text)
        reference = _numeric_from_text(reference_text)
        if value is None or reference is None:
            return SLATE
        return SEVERITY_COLORS["good"] if value <= reference else SEVERITY_COLORS["poor"]

    def _level_color(value_text: str) -> tuple[int, int, int]:
        normalized = value_text.strip().lower()
        if normalized in {"low", "laag"}:
            return SEVERITY_COLORS["good"]
        if normalized in {"medium", "gemiddeld", "matig"}:
            return SEVERITY_COLORS["moderate"]
        if normalized in {"high", "hoog"}:
            return SEVERITY_COLORS["poor"]
        return SLATE

    def _climate_reference(metric: str) -> str:
        if metric in {"Heat", "Hitte"}:
            return (
                "Doel: laag · schaal: laag / gemiddeld / hoog"
                if is_nl
                else "Target: low · scale: low / medium / high"
            )
        return (
            "Doel: laag · schaal: laag / gemiddeld / hoog"
            if is_nl
            else "Target: low · scale: low / medium / high"
        )

    def _sunlight_reference(metric: str) -> str:
        if metric == "Winter":
            medium = format_number(_WINTER_ROOF_MEDIUM_HOURS, 1, is_nl)
            high = format_number(_WINTER_ROOF_HIGH_HOURS, 1, is_nl)
            unit = "u/dag" if is_nl else "h/day"
            return (
                f"Winter-dakratio: gemiddeld \u2248 {medium} {unit}; hoog \u2248 {high} {unit}"
                if is_nl
                else f"Winter roof ratio: medium \u2248 {medium} {unit}; high \u2248 {high} {unit}"
            )
        if metric == "Equinox":
            min_h = format_number(_EN17037_MIN_HOURS, 1, is_nl)
            med_h = format_number(_EN17037_MEDIUM_HOURS, 1, is_nl)
            high_h = format_number(_EN17037_HIGH_HOURS, 1, is_nl)
            unit = "u" if is_nl else "h"
            return (
                f"EN 17037: minimum {min_h}{unit}, midden {med_h}{unit}, hoog {high_h}{unit}"
                if is_nl
                else f"EN 17037: minimum {min_h}{unit}, medium {med_h}{unit}, high {high_h}{unit}"
            )
        if metric in {"Annual average", "Jaargemiddelde"}:
            return (
                "Schaalcontext: hoger = helderder over het jaar"
                if is_nl
                else "Scale context: higher = brighter over the year"
            )
        if metric.startswith("SVF"):
            moderate = format_number(_SVF_MODERATE_THRESHOLD, 0, is_nl)
            open_svf = format_number(_SVF_OPEN_THRESHOLD, 0, is_nl)
            upper_moderate = format_number(_SVF_OPEN_THRESHOLD - 1, 0, is_nl)
            return (
                f"Open \u2265 {open_svf}% ; gemiddeld {moderate}\u2013{upper_moderate}%"
                if is_nl
                else f"Open \u2265 {open_svf}% ; moderate {moderate}\u2013{upper_moderate}%"
            )
        if metric in {"Solar irradiance", "Zonnestraling"}:
            return (
                "Schaalcontext: hoger = meer blootstelling op het dak"
                if is_nl
                else "Scale context: higher = more roof exposure"
            )
        return "\u2014"

    if category_name in {"Noise", "Geluid"} and "Lden" in metric_map:
        ref_label = "WHO-richtlijn (Lden)" if is_nl else "WHO guideline (Lden)"
        reference = metric_map.get(ref_label, "\u2014")
        rows.append(
            (
                "Lden",
                metric_map["Lden"],
                reference,
                _compliance_color(metric_map["Lden"], reference),
            )
        )
        return rows

    if category_name in {"Air Quality", "Luchtkwaliteit"}:
        for metric in ("PM2.5", "NO\u2082"):
            if metric not in metric_map:
                continue
            ref_label = (
                f"WHO-richtlijn {metric}" if is_nl else f"WHO guideline {metric}"
            )
            reference = metric_map.get(ref_label, "\u2014")
            rows.append(
                (
                    metric,
                    metric_map[metric],
                    reference,
                    _compliance_color(metric_map[metric], reference),
                )
            )
        return rows

    if category_name in {"Climate Stress", "Klimaatstress"}:
        for metric, value in measurements:
            rows.append((metric, value, _climate_reference(metric), _level_color(value)))
        return rows

    if category_name in {"Sunlight", "Zonlicht"}:
        for metric, value in measurements:
            rows.append((metric, value, _sunlight_reference(metric), SLATE))
        return rows

    for metric, value in measurements:
        rows.append((metric, value, "\u2014", SLATE))
    return rows


def _draw_measurement_table(
    pdf: BuurtCheckPDF,
    *,
    category_name: str,
    measurements: list[tuple[str, str]] | None,
    is_nl: bool,
) -> None:
    rows = _measurement_table_rows(category_name, measurements, is_nl=is_nl)
    if not rows:
        return

    pdf.draw_h3("Measurements" if not is_nl else "Meetwaarden")
    table_x = pdf.l_margin
    table_w = pdf.w - pdf.l_margin - pdf.r_margin
    metric_w = table_w * 0.42
    value_w = table_w * 0.26
    guideline_w = table_w - metric_w - value_w
    header_h = 5.5
    line_h = 3.4

    def _draw_header() -> None:
        header_y = pdf.get_y()
        pdf.set_fill_color(*TILE_BG)
        pdf.set_draw_color(*BORDER)
        pdf.set_line_width(0.2)
        pdf.rect(table_x, header_y, table_w, header_h, "DF")
        pdf.set_font("SatoshiMedium", "", 8)
        pdf.set_text_color(*SECONDARY)
        pdf.set_xy(table_x + 1.5, header_y + 0.6)
        pdf.cell(metric_w - 1.5, header_h - 1, "Metric" if not is_nl else "Metriek")
        pdf.cell(value_w, header_h - 1, "Your value" if not is_nl else "Uw waarde")
        pdf.cell(
            guideline_w - 1.5,
            header_h - 1,
            "Guideline / scale" if not is_nl else "Richtlijn / schaal",
        )
        pdf.set_y(header_y + header_h)

    def _cell_lines(width: float, text: str, *, bold: bool = False) -> list[str]:
        pdf.set_font("Satoshi", "B" if bold else "", 8)
        return pdf.multi_cell(
            width - 1.5,
            line_h,
            text,
            dry_run=True,
            output="LINES",
        )

    _draw_header()

    for metric, value, reference, value_color in rows:
        metric_lines = _cell_lines(metric_w, metric)
        value_lines = _cell_lines(value_w, value, bold=True)
        reference_lines = _cell_lines(guideline_w, reference)
        row_h = max(
            5.5,
            max(len(metric_lines), len(value_lines), len(reference_lines)) * line_h + 1.4,
        )
        if pdf.will_page_break(row_h + 1.0):
            pdf.add_page()
            pdf.draw_h3("Measurements" if not is_nl else "Meetwaarden")
            _draw_header()

        row_y = pdf.get_y()
        pdf.set_fill_color(*WHITE)
        pdf.rect(table_x, row_y, table_w, row_h, "DF")
        pdf.set_font("SatoshiMedium", "", 8)
        pdf.set_text_color(*SECONDARY)
        pdf.set_xy(table_x + 1.5, row_y + 0.6)
        pdf.multi_cell(
            metric_w - 1.5,
            line_h,
            "\n".join(metric_lines),
            align="L",
            new_x="RIGHT",
            new_y="TOP",
        )
        pdf.set_font("Satoshi", "B", 8)
        pdf.set_text_color(*value_color)
        pdf.multi_cell(
            value_w - 1.5,
            line_h,
            "\n".join(value_lines),
            align="L",
            new_x="RIGHT",
            new_y="TOP",
        )
        pdf.set_font("Satoshi", "", 8)
        pdf.set_text_color(*SECONDARY)
        pdf.multi_cell(
            guideline_w - 1.5,
            line_h,
            "\n".join(reference_lines),
            align="L",
            new_x="LMARGIN",
            new_y="TOP",
        )
        pdf.set_y(row_y + row_h)

    pdf.set_text_color(*SLATE)
    pdf.set_draw_color(*BORDER)
    pdf.set_line_width(0.1)
    pdf.ln(1)


def _draw_neighborhood_page(
    pdf: BuurtCheckPDF,
    stats: NeighborhoodStats | None,
    tier_b_data: TierBResponse | None,
    is_nl: bool,
    *,
    livability: LivabilityResponse | None = None,
    location_map_b64: str | None = None,
    shadow_images: list[dict] | None = None,
    center_lat: float | None = None,
    center_lng: float | None = None,
    footprint_geojson: dict[str, Any] | None = None,
) -> None:
    """Neighborhood context page with map, grouped indicators, shadow, and livability."""
    _ensure_page_space(pdf, 30)
    pdf.draw_h1(
        "Buurtcontext" if is_nl else "Neighborhood Context",
        add_divider=not pdf._at_page_top(),
    )

    if stats:
        pdf.set_font("Satoshi", "B", 16)
        pdf.set_text_color(*SLATE)
        pdf.cell(0, 8, stats.buurt_name or stats.buurt_code, new_x="LMARGIN", new_y="NEXT")
        subtitle_parts = []
        if stats.gemeente_name:
            subtitle_parts.append(stats.gemeente_name)
        if stats.urbanization != UrbanizationLevel.unknown:
            urbanization_label = _urbanization_label(stats.urbanization, is_nl)
            if urbanization_label:
                subtitle_parts.append(urbanization_label)
        if subtitle_parts:
            pdf.set_font("Satoshi", "", 10)
            pdf.set_text_color(*SECONDARY)
            pdf.cell(0, 5, " \u00b7 ".join(subtitle_parts), new_x="LMARGIN", new_y="NEXT")
            pdf.set_text_color(*SLATE)
        pdf.ln(2)

    _draw_location_map(
        pdf,
        location_map_b64,
        is_nl,
        center_lat=center_lat,
        center_lng=center_lng,
        footprint_geojson=footprint_geojson,
    )

    if shadow_images:
        _draw_shadow_triptych(pdf, shadow_images, is_nl)

    if stats:
        pdf.draw_h2(
            "People / Housing / Access"
            if not is_nl
            else "Bewoners / Woningen / Bereikbaarheid"
        )
        content_w = pdf.w - pdf.l_margin - pdf.r_margin
        gap = 5.0
        col_w = (content_w - gap * 2) / 3
        start_y = pdf.get_y()
        sections = [
            (
                "People" if not is_nl else "Bewoners",
                [
                    (
                        "Population density" if not is_nl else "Inwonerdichtheid",
                        stats.population_density,
                    ),
                    (
                        "Household size" if not is_nl else "Huishoudgrootte",
                        stats.avg_household_size,
                    ),
                    ("Single person" if not is_nl else "Alleenstaanden", stats.single_person_pct),
                ],
            ),
            (
                "Housing" if not is_nl else "Woningen",
                [
                    ("Owner occupied" if not is_nl else "Koopwoningen", stats.owner_occupied_pct),
                    ("Property value" if not is_nl else "WOZ-waarde", stats.avg_property_value),
                ],
            ),
            (
                "Access" if not is_nl else "Bereikbaarheid",
                [
                    (
                        "Train station" if not is_nl else "Treinstation",
                        stats.distance_to_train_km,
                    ),
                    (
                        "Supermarket" if not is_nl else "Supermarkt",
                        stats.distance_to_supermarket_km,
                    ),
                ],
            ),
        ]
        max_y = start_y
        for idx, (section_title, rows) in enumerate(sections):
            x = pdf.l_margin + idx * (col_w + gap)
            y = start_y
            pdf.set_xy(x, y)
            pdf.set_font("Satoshi", "B", 9)
            pdf.set_text_color(*ACCENT_TEXT)
            pdf.cell(col_w, 5, section_title)
            y += 6
            for label, indicator in rows:
                pdf.set_xy(x, y)
                pdf.set_font("SatoshiMedium", "", 7)
                pdf.set_text_color(*SECONDARY)
                pdf.multi_cell(col_w, 3.2, label, align="L")
                y = pdf.get_y()
                pdf.set_xy(x, y)
                pdf.set_font("Satoshi", "B", 8)
                pdf.set_text_color(*SLATE)
                pdf.multi_cell(col_w, 4.0, _format_indicator_text(indicator, is_nl), align="L")
                y = pdf.get_y() + 1.5
            max_y = max(max_y, y)
        pdf.set_text_color(*SLATE)
        pdf.set_y(max_y + 1)

        pdf.draw_h2("Age distribution" if not is_nl else "Leeftijdsverdeling")
        if (
            stats.age_profile.age_0_24 is not None
            or stats.age_profile.age_25_64 is not None
            or stats.age_profile.age_65_plus is not None
        ):
            age_end_y = pdf.draw_age_bars(
                x=pdf.l_margin,
                y=pdf.get_y(),
                width=pdf.w - pdf.l_margin - pdf.r_margin,
                age_data=stats.age_profile,
            )
            pdf.set_y(age_end_y + 2)
            interp = _interpret_age_distribution(stats.age_profile, is_nl)
            if interp:
                pdf.set_font("Satoshi", "", 8)
                pdf.set_text_color(*SECONDARY)
                pdf.multi_cell(0, 4, interp, align="L", new_x="LMARGIN", new_y="NEXT")
                pdf.set_text_color(*SLATE)
        pdf.draw_h3(
            (
                f"Bron: {_neighborhood_source_caption(stats, is_nl=True)}"
                if is_nl
                else f"Source: {_neighborhood_source_caption(stats, is_nl=False)}"
            )
        )
    else:
        pdf.set_font("Satoshi", "", 10)
        pdf.set_text_color(*SECONDARY)
        pdf.cell(
            0,
            8,
            "Neighborhood data unavailable." if not is_nl else "Buurtgegevens niet beschikbaar.",
            new_x="LMARGIN",
            new_y="NEXT",
        )
        pdf.set_text_color(*SLATE)

    if livability is not None and livability.available:
        _ensure_page_space(
            pdf,
            max(36.0, min(72.0, _estimate_livability_section_height(livability))),
        )
        _draw_livability_section(pdf, livability, is_nl)
    else:
        _ensure_page_space(pdf, 24)
        pdf.draw_h1("Leefbaarheid" if is_nl else "Livability")
        pdf.set_font("Satoshi", "", 10)
        pdf.set_text_color(*SECONDARY)
        pdf.cell(
            0,
            6,
            "Leefbaarheidsgegevens niet beschikbaar."
            if is_nl
            else "Livability data unavailable.",
            new_x="LMARGIN",
            new_y="NEXT",
        )
        pdf.set_text_color(*SLATE)


def _draw_sparkline(
    pdf: BuurtCheckPDF,
    trend: list[LivabilityTrendPoint],
    x: float,
    y: float,
    width: float = 60.0,
    height: float = 12.0,
) -> float:
    """Draw a small sparkline chart showing livability trend over time.

    Uses fpdf2 polyline() to connect trend points. TEAL line with a
    small dot at the most recent data point. Year labels below the chart.
    Returns the y position after the chart (including year labels).
    """
    if len(trend) < 2:
        return y

    # Gather data
    years = [int(tp.year) for tp in trend]
    scores = [_livability_class_value(tp) or tp.overall_score for tp in trend]
    min_year, max_year = min(years), max(years)
    year_span = max_year - min_year
    if year_span == 0:
        return y

    # Vertical range: use the discrete Leefbaarometer class scale (1-9).
    v_pad = 1.0  # mm padding top/bottom within the chart area
    chart_h = height - 2 * v_pad

    # Build point list: scale x across years, y across 0-100
    points: list[tuple[float, float]] = []
    for yr, sc in zip(years, scores):
        px = x + (yr - min_year) / year_span * width
        normalized = (sc - 1) / 8
        py = y + v_pad + chart_h * (1.0 - normalized)
        points.append((px, py))

    # Draw subtle reference line at class 5 (the midpoint band).
    mid_y = y + v_pad + chart_h * 0.5
    pdf.set_draw_color(*BORDER)
    pdf.set_line_width(0.15)
    pdf.set_dash_pattern(dash=1.0, gap=1.0)
    pdf.line(x, mid_y, x + width, mid_y)
    pdf.set_dash_pattern()  # reset to solid

    # Draw the sparkline
    pdf.set_draw_color(*TEAL)
    pdf.set_line_width(0.6)
    pdf.polyline(points)

    # Draw year labels below the chart
    label_y = y + height + 0.5
    pdf.set_font("Satoshi", "", 8)
    pdf.set_text_color(*SECONDARY)
    for i, (yr, _sc) in enumerate(zip(years, scores)):
        lx = x + (yr - min_year) / year_span * width
        # Center the year text on the point
        yr_str = str(yr)
        tw = pdf.get_string_width(yr_str)
        pdf.set_xy(lx - tw / 2, label_y)
        pdf.cell(tw + 1, 4, yr_str, align="C")

    # Reset drawing state
    pdf.set_draw_color(*BORDER)
    pdf.set_line_width(0.1)
    pdf.set_text_color(*SLATE)

    return label_y + 4


def _draw_radar_chart(
    pdf: BuurtCheckPDF,
    dimensions: list,
    is_nl: bool,
    cx: float,
    cy: float,
    radius: float = 22.0,
) -> float:
    """Draw a pentagon radar chart for the 5 livability dimensions.

    Draws a reference pentagon at score 50 in BORDER color, the data
    polygon in TEAL, and labels at each vertex. Returns the y position
    after the chart (including labels).

    Args:
        pdf: The PDF instance.
        dimensions: List of LivabilityDimension objects (5 expected).
        is_nl: Whether to use Dutch labels.
        cx: Center x coordinate.
        cy: Center y coordinate.
        radius: Outer radius in mm (for score 100).
    """
    if len(dimensions) < 3:
        return cy + radius + 10

    n = len(dimensions)
    dim_labels: dict[str, tuple[str, str]] = {
        "physical": ("Fysiek", "Physical environment"),
        "safety": ("Veiligheid", "Safety"),
        "social": ("Sociaal", "Social cohesion"),
        "amenities": ("Voorzieningen", "Amenities"),
        "housing": ("Woningen", "Housing quality"),
    }

    def _vertex(index: int, score: float) -> tuple[float, float]:
        """Calculate vertex position for a given dimension index and score."""
        angle = 2 * math.pi * index / n - math.pi / 2  # start from top
        r = radius * score / 100.0
        return (cx + r * math.cos(angle), cy + r * math.sin(angle))

    # --- Reference rings at 25, 50, 75, 100 ---
    pdf.set_draw_color(*BORDER)
    pdf.set_line_width(0.15)
    for ref_score in (25, 50, 75, 100):
        ref_pts = [_vertex(i, ref_score) for i in range(n)]
        pdf.polygon(ref_pts, style="D")

    # --- Axis lines from center to each vertex ---
    pdf.set_draw_color(*GRIDLINE)
    pdf.set_line_width(0.1)
    for i in range(n):
        vx, vy = _vertex(i, 100)
        pdf.line(cx, cy, vx, vy)

    # --- Data polygon (filled semi-transparent via thin fill) ---
    data_pts = [_vertex(i, dimensions[i].normalized_score) for i in range(n)]

    # Fill the data polygon with light teal
    pdf.set_fill_color(*TEAL_LIGHT)
    pdf.set_draw_color(*TEAL)
    pdf.set_line_width(0.8)
    pdf.polygon(data_pts, style="DF")

    # --- Labels at each vertex ---
    pdf.set_font("SatoshiMedium", "", 8)
    label_offset = 5.0  # mm beyond the outer radius
    for i, dim in enumerate(dimensions):
        nl_lbl, en_lbl = dim_labels.get(dim.name, (dim.name, dim.name))
        label = nl_lbl if is_nl else en_lbl
        score_str = str(dim.normalized_score)
        full_label = f"{label} ({score_str})"

        angle = 2 * math.pi * i / n - math.pi / 2
        lx = cx + (radius + label_offset) * math.cos(angle)
        ly = cy + (radius + label_offset) * math.sin(angle)

        tw = pdf.get_string_width(full_label)
        # Position label: center horizontally, adjust based on quadrant
        if abs(math.cos(angle)) < 0.1:
            # Top or bottom: center horizontally
            pdf.set_xy(lx - tw / 2, ly - 2)
        elif math.cos(angle) > 0:
            # Right side: left-align from point
            pdf.set_xy(lx, ly - 2)
        else:
            # Left side: right-align to point
            pdf.set_xy(lx - tw, ly - 2)

        pdf.set_text_color(*SECONDARY)
        pdf.cell(tw + 1, 4, full_label)

    # Reset drawing state
    pdf.set_draw_color(*BORDER)
    pdf.set_line_width(0.1)
    pdf.set_text_color(*SLATE)

    return cy + radius + label_offset + 8


def _has_meaningful_livability_comparison(
    livability: LivabilityResponse,
) -> bool:
    values = {_livability_class_value(livability)}
    for row in livability.comparison:
        values.add(_livability_class_value(row))
    return len(values) > 1


def _livability_comparison_note(is_nl: bool) -> str:
    return (
        "Beschikbare buurt-, wijk- en gemeentevergelijkingen vallen in dezelfde"
        " leefbaarheidsklasse; daarom is de vergelijking hier samengevat in tekst."
        if is_nl
        else "Available neighborhood, district, and municipality comparisons fall in"
        " the same livability class, so the comparison is summarized in text."
    )


def _estimate_livability_section_height(livability: LivabilityResponse) -> float:
    required = 28.0
    if livability.dimensions:
        required += max(24.0, len(livability.dimensions) * 7.0)
    if livability.trend and len(livability.trend) >= 2:
        required += 24.0
    if livability.comparison:
        required += 16.0 if _has_meaningful_livability_comparison(livability) else 10.0
    return required


def _draw_livability_section(
    pdf: BuurtCheckPDF,
    livability: LivabilityResponse | None,
    is_nl: bool,
) -> None:
    """Render livability section with Leefbaarometer class/deviation semantics."""
    if livability is None or not livability.available:
        return

    pdf.draw_premium_badge()
    pdf.draw_h1("Leefbaarheid" if is_nl else "Livability")

    class_value = _livability_class_value(livability)
    class_text = _livability_class_text(class_value, is_nl=is_nl)
    class_label = _livability_class_label(
        class_value,
        is_nl=is_nl,
        fallback=getattr(livability, "overall_class_label", None),
    )
    deviation_text = _livability_deviation_text(
        getattr(livability, "overall_deviation", None),
        is_nl=is_nl,
    )

    cy = pdf.get_y()
    pdf.set_fill_color(*TEAL)
    pdf.rect(pdf.l_margin, cy, 1.5, 8, "F")

    pdf.set_x(pdf.l_margin + 4)
    pdf.set_font("Satoshi", "B", 12)
    pdf.set_text_color(*SLATE)
    title = "Leefbaarheidsklasse" if is_nl else "Livability Class"
    pdf.cell(100, 8, title)

    pdf.set_font("SatoshiBlack", "", 14)
    pdf.set_text_color(*ACCENT_TEXT)
    pdf.cell(0, 8, class_text, align="R", new_x="LMARGIN", new_y="NEXT")

    pdf.set_font("SatoshiMedium", "", 9)
    pdf.set_text_color(*SLATE)
    if class_label:
        pdf.cell(0, 5, class_label.title(), new_x="LMARGIN", new_y="NEXT")
    if deviation_text:
        pdf.set_font("Satoshi", "", 9)
        pdf.set_text_color(*SECONDARY)
        prefix = (
            "Afwijking t.o.v. landelijk gemiddelde"
            if is_nl
            else "Deviation vs national average"
        )
        pdf.multi_cell(0, 4.5, f"{prefix}: {deviation_text}", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(1.5)
    pdf.set_text_color(*SLATE)

    content_w = pdf.w - pdf.l_margin - pdf.r_margin

    if livability.dimensions:
        _ensure_page_space(pdf, 16 + len(livability.dimensions) * 6)
        pdf.draw_h2("Dimensies" if is_nl else "Dimensions")
        label_map = {
            "physical": "Fysieke omgeving" if is_nl else "Physical environment",
            "safety": "Veiligheid" if is_nl else "Safety",
            "social": "Sociale samenhang" if is_nl else "Social cohesion",
            "amenities": "Voorzieningen" if is_nl else "Amenities",
            "housing": "Woningkwaliteit" if is_nl else "Housing quality",
        }
        for dim in livability.dimensions:
            pdf.set_font("SatoshiMedium", "", 9)
            pdf.set_text_color(*SLATE)
            pdf.cell(48, 5, label_map.get(dim.name, dim.name), new_x="RIGHT", new_y="TOP")
            pdf.set_font("Satoshi", "", 9)
            pdf.set_text_color(*SECONDARY)
            pdf.multi_cell(
                content_w - 48,
                5,
                _livability_dimension_value_text(dim, is_nl=is_nl),
                new_x="LMARGIN",
                new_y="NEXT",
            )

    pdf.ln(2)

    if livability.trend and len(livability.trend) >= 2:
        _ensure_page_space(pdf, 28)
        pdf.draw_h2("Trend" if is_nl else "Trend")
        trend_text = _livability_trend_summary(livability.trend, is_nl)
        if trend_text:
            pdf.set_font("Satoshi", "", 10)
            pdf.set_text_color(*SECONDARY)
            pdf.cell(
                content_w, 5, trend_text,
                new_x="LMARGIN", new_y="NEXT",
            )
            pdf.set_text_color(*SLATE)
            pdf.ln(1)

        sparkline_end_y = _draw_sparkline(
            pdf, livability.trend,
            x=pdf.l_margin, y=pdf.get_y(),
            width=content_w * 0.6,
            height=12.0,
        )
        pdf.set_y(sparkline_end_y + 2)
    else:
        pdf.draw_h3("Trendgegevens niet beschikbaar" if is_nl else "Trend data unavailable")

    if livability.comparison:
        _ensure_page_space(pdf, 20 + len(livability.comparison) * 6)
        pdf.draw_h2("Vergelijking" if is_nl else "Comparison")
        if _has_meaningful_livability_comparison(livability):
            comparison_rows: list[tuple[str, str]] = []
            buurt_name = livability.buurt_name or ("Buurt" if is_nl else "Neighborhood")
            comparison_rows.append((
                buurt_name,
                " · ".join(
                    part
                    for part in (
                        _livability_class_text(class_value, is_nl=is_nl),
                        deviation_text or class_label,
                    )
                    if part
                ),
            ))

            seen_comp_names: set[str] = {buurt_name}
            for row in livability.comparison:
                if row.level == "wijk":
                    label = row.name or ("Wijk" if is_nl else "District")
                elif row.level == "gemeente":
                    label = row.name or ("Gemeente" if is_nl else "Municipality")
                elif row.level == "national":
                    label = "Nederland" if is_nl else "Netherlands"
                else:
                    continue
                if label in seen_comp_names:
                    continue
                seen_comp_names.add(label)
                row_class = _livability_class_value(row)
                row_text = " · ".join(
                    part
                    for part in (
                        _livability_class_text(row_class, is_nl=is_nl),
                        _livability_deviation_text(
                            getattr(row, "overall_deviation", None),
                            is_nl=is_nl,
                        )
                        or _livability_class_label(
                            row_class,
                            is_nl=is_nl,
                            fallback=getattr(row, "overall_class_label", None),
                        ),
                    )
                    if part
                )
                comparison_rows.append((label, row_text))

            for label, row_text in comparison_rows:
                pdf.set_font("SatoshiMedium", "", 9)
                pdf.set_text_color(*SLATE)
                pdf.cell(48, 5, label, new_x="RIGHT", new_y="TOP")
                pdf.set_font("Satoshi", "", 9)
                pdf.set_text_color(*SECONDARY)
                pdf.multi_cell(
                    content_w - 48,
                    5,
                    row_text,
                    new_x="LMARGIN",
                    new_y="NEXT",
                )
        else:
            pdf.set_font("Satoshi", "", 8)
            pdf.set_text_color(*SECONDARY)
            pdf.multi_cell(
                0,
                4,
                _livability_comparison_note(is_nl),
                align="L",
                new_x="LMARGIN",
                new_y="NEXT",
            )
            pdf.set_text_color(*SLATE)

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
    latest = _livability_class_value(trend[-1]) or trend[-1].overall_score
    earliest = _livability_class_value(trend[0]) or trend[0].overall_score
    diff = latest - earliest

    if diff == 0:
        return "Stabiel" if is_nl else "Stable"

    # Find inflection point: where did current direction start?
    if diff > 0:
        # Scan backwards for where improvement started; falls back to first
        # data point if the series is monotonically improving.
        inflection_year = trend[0].year
        for i in range(len(trend) - 1, 0, -1):
            current = _livability_class_value(trend[i]) or trend[i].overall_score
            previous = _livability_class_value(trend[i - 1]) or trend[i - 1].overall_score
            if current <= previous:
                inflection_year = trend[i].year
                break
        if is_nl:
            return f"Verbeterend sinds {inflection_year}"
        return f"Improving since {inflection_year}"
    else:
        # Currently declining
        inflection_year = trend[0].year
        for i in range(len(trend) - 1, 0, -1):
            current = _livability_class_value(trend[i]) or trend[i].overall_score
            previous = _livability_class_value(trend[i - 1]) or trend[i - 1].overall_score
            if current >= previous:
                inflection_year = trend[i].year
                break
        if is_nl:
            return f"Dalend sinds {inflection_year}"
        return f"Declining since {inflection_year}"


def _draw_checks_subsection(
    pdf: BuurtCheckPDF,
    title: str,
    body: str,
    source: str,
    *,
    severity: str = "attention",
) -> None:
    """Render a property-check card with severity border and icon."""
    content_w = pdf.w - pdf.l_margin - pdf.r_margin
    border_color = {
        "flagged": SEVERITY_COLORS["poor"],
        "attention": AMBER_WARN,
        "clear": SEVERITY_COLORS["good"],
    }.get(severity, AMBER_WARN)

    def _estimated_lines(font_family: str, style: str, size: int, text: str) -> int:
        pdf.set_font(font_family, style, size)
        safe_w = max(content_w, 1.0)
        lines = 0
        for logical_line in (text or "").splitlines() or [""]:
            if not logical_line:
                lines += 1
                continue
            line_w = pdf.get_string_width(logical_line)
            lines += max(1, math.ceil(line_w / safe_w))
        return lines

    title_lines = _estimated_lines("Satoshi", "B", 10, title)
    body_lines = _estimated_lines("Satoshi", "", 10, body)
    source_lines = _estimated_lines("Satoshi", "", 8, source)
    required_h = title_lines * 5 + body_lines * 5 + source_lines * 4 + 14
    if pdf.will_page_break(required_h):
        pdf.add_page()

    card_x = pdf.l_margin
    card_y = pdf.get_y()
    card_h = required_h - 2
    pdf.set_fill_color(*WHITE)
    pdf.set_draw_color(*BORDER)
    pdf.set_line_width(0.2)
    pdf.rect(card_x, card_y, content_w, card_h, "DF")
    pdf.set_fill_color(*border_color)
    pdf.rect(card_x, card_y, 1.5, card_h, "F")

    icon_x = card_x + 3.5
    icon_y = card_y + 4.5
    pdf.set_fill_color(*border_color)
    pdf.set_draw_color(*border_color)
    if severity == "flagged":
        pdf.polygon(
            [(icon_x, icon_y + 3.8), (icon_x + 3.2, icon_y - 1.4), (icon_x + 6.4, icon_y + 3.8)],
            style="DF",
        )
    else:
        pdf.circle(icon_x + 3.2, icon_y + 1.8, 2.4, "DF")
        pdf.set_draw_color(*WHITE)
        pdf.set_line_width(0.35)
        if severity == "clear":
            pdf.line(icon_x + 1.8, icon_y + 2.0, icon_x + 3.0, icon_y + 3.1)
            pdf.line(icon_x + 3.0, icon_y + 3.1, icon_x + 4.8, icon_y + 0.9)
        else:
            pdf.line(icon_x + 3.2, icon_y + 0.2, icon_x + 3.2, icon_y + 2.6)
            pdf.line(icon_x + 3.2, icon_y + 3.3, icon_x + 3.2, icon_y + 3.5)
        pdf.set_line_width(0.1)
        pdf.set_draw_color(*BORDER)

    text_x = card_x + 12.0
    text_w = content_w - 14.0
    pdf.set_xy(text_x, card_y + 3.0)
    pdf.set_font("Satoshi", "B", 10)
    pdf.set_text_color(*SLATE)
    pdf.multi_cell(text_w, 4.8, title, align="L", new_x="LMARGIN", new_y="NEXT")
    pdf.set_x(text_x)
    pdf.set_font("Satoshi", "", 10)
    pdf.multi_cell(text_w, 4.5, body, align="L", new_x="LMARGIN", new_y="NEXT")
    pdf.set_x(text_x)
    pdf.set_font("Satoshi", "", 8)
    pdf.set_text_color(*SECONDARY)
    pdf.multi_cell(text_w, 3.6, source, align="L", new_x="LMARGIN", new_y="NEXT")
    pdf.set_text_color(*SLATE)
    pdf.set_y(card_y + card_h + 3)


def _draw_property_checks_page(
    pdf: BuurtCheckPDF,
    risks: RiskCardsResponse | None,
    sunlight_score: int | None,
    shadow_image_b64: str | None,
    property_warnings: PropertyWarningsResponse | None,
    is_nl: bool,
    shadow_images: list[dict] | None = None,
    postcode: str | None = None,
) -> None:
    """Page 4: premium-only checks required in the paid Full Dossier."""
    pdf.draw_premium_badge()
    pdf.draw_h1(
        "Aanvullende vastgoedcontroles" if is_nl else "Additional Property Checks",
        add_divider=False,
    )

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
        severity=(
            "flagged"
            if property_warnings and property_warnings.asbestos.flagged
            else "clear"
            if property_warnings
            else "attention"
        ),
    )

    # 2) Foundation Risk
    if property_warnings:
        fr = property_warnings.foundation_risk
        foundation_messages = set(fr.messages or [])
        foundation_basis = None
        foundation_source = (
            "Bron: BRO-bodemdata + Klimaateffectatlas bodemdaling"
            if is_nl
            else "Source: BRO soil data + Klimaateffectatlas subsidence"
        )
        if "FOUNDATION_SOFT_SOIL_CITY" in foundation_messages:
            foundation_basis = (
                (
                    "Gemeentelijke fallback gebruikt omdat perceelbodemdata "
                    "voor dit adres ontbrak. De classificatie leunt op een "
                    "gedocumenteerde lijst van slappe-grondgemeenten."
                )
                if is_nl
                else (
                    "Municipality fallback used because parcel soil data was "
                    "unavailable for this address. The classification relies on "
                    "a documented soft-soil municipality list."
                )
            )
            foundation_source = (
                "Bron: gedocumenteerde slappe-grondgemeentenlijst + BAG-bouwjaar"
                if is_nl
                else "Source: documented soft-soil municipality list + BAG construction year"
            )
        elif "FOUNDATION_YEAR_ONLY" in foundation_messages:
            foundation_basis = (
                (
                    "Bouwjaar-fallback gebruikt omdat perceelbodemdata "
                    "ontbrak. Deze classificatie is daarom alleen een eerste "
                    "indicatie op basis van bouwjaar."
                )
                if is_nl
                else (
                    "Year-only fallback used because parcel soil data was "
                    "unavailable. This classification is therefore only a "
                    "first-pass signal from construction year."
                )
            )
            foundation_source = (
                "Bron: BAG-bouwjaar fallback"
                if is_nl
                else "Source: BAG construction year fallback"
            )
        elif fr.soil_type is not None:
            foundation_basis = (
                "Resultaat op basis van BRO-perceelgrond en regionale bodemdaling."
                if is_nl
                else "Result based on BRO parcel soil type and regional subsidence data."
            )

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
        if foundation_basis:
            foundation_text += f" {foundation_basis}"
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
        source=foundation_source if property_warnings else (
            "Bron: BRO bodemdata + Klimaateffectatlas "
            "bodemdaling"
            if is_nl
            else "Source: BRO soil data + "
            "Klimaateffectatlas subsidence"
        ),
        severity=(
            "flagged"
            if property_warnings and property_warnings.foundation_risk.level == "high"
            else "attention"
            if (
                property_warnings
                and property_warnings.foundation_risk.level in {"medium", "unavailable"}
            )
            else "clear"
        ),
    )

    # 3) Erfpacht (Ground Lease)
    erfpacht_text = _ground_lease_detail_text(
        property_warnings.erfpacht if property_warnings else None,
        is_nl=is_nl,
    )
    _draw_checks_subsection(
        pdf,
        title=(
            "Erfpacht (grondhuur)" if is_nl
            else "Ground Lease (Erfpacht)"
        ),
        body=erfpacht_text,
        source=f"{'Bron' if is_nl else 'Source'}: {_ground_lease_source_label(is_nl=is_nl)}",
        severity=(
            "attention"
            if property_warnings and property_warnings.erfpacht.detected
            else "clear"
            if property_warnings
            else "attention"
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
        severity=(
            "attention"
            if property_warnings and property_warnings.vve.is_apartment
            else "clear"
            if property_warnings
            else "attention"
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
        severity=(
            "flagged"
            if property_warnings and property_warnings.lead_pipe.flagged
            else "clear"
            if property_warnings
            else "attention"
        ),
    )

    # 6) Soil Contamination — Manual Verification Required
    postcode_token = "".join(postcode.split()).upper() if postcode else None
    if postcode_token:
        soil_text = (
            "Er is geen geautomatiseerde perceelgebonden bodemverontreinigingsdata "
            "beschikbaar. Het BRO-bodeminformatieregister is niet betrouwbaar voor "
            "perceelniveau-extractie. Raadpleeg bodemloket.nl voor postcode "
            f"{postcode_token} om de officiële verontreinigingshistorie op te zoeken."
            if is_nl
            else "No automated parcel-level soil contamination data is available. "
            "The BRO soil information registry is not reliable for parcel-level "
            "extraction. Visit bodemloket.nl for postcode "
            f"{postcode_token} to retrieve official contamination history."
        )
        soil_source = (
            f"Actie vereist: bodemloket.nl (postcode {postcode_token}, handmatige opzoeking)"
            if is_nl
            else f"Action required: bodemloket.nl (postcode {postcode_token}, manual lookup)"
        )
    else:
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
        severity="attention",
    )

    # 7) Roof direct sun (clear-sky visibility)
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
        score_text = _score_text(sunlight_score, is_nl=is_nl)
        sun_text = (
            f"Geschatte directe zon op het dak: winter {w}/dag, equinox {e}/dag, zomer {s}/dag. "
            f"{score_text}."
            if is_nl
            else f"Estimated roof direct sun: winter {w}/day, equinox {e}/day, summer {s}/day. "
            f"{score_text}."
        )
        # Append extended sunlight metrics if available
        extra_lines: list[str] = []
        if sun.annual_average is not None:
            label = "Jaargemiddelde" if is_nl else "Annual average"
            val = _fn(sun.annual_average, 1, is_nl)
            unit = "u/dag" if is_nl else "h/day"
            extra_lines.append(f"{label}: {val} {unit}")
        svf_percent, weighted_svf_percent = _sunlight_svf_values(sun)
        if weighted_svf_percent is not None and not _is_same_percent(
            weighted_svf_percent,
            svf_percent,
        ):
            label = "SVF (anisotropisch)" if is_nl else "SVF (anisotropic)"
            val = _fn(weighted_svf_percent, 0, is_nl)
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
            "Schatting van directe zon op het dak niet beschikbaar voor deze export."
            if is_nl
            else "Roof direct sun estimate unavailable for this export."
        )
    _draw_checks_subsection(
        pdf,
        title=(
            "Directe zon op dak (helderheidsschatting)" if is_nl
            else "Roof direct sun (clear-sky visibility)"
        ),
        body=sun_text,
        source=(
            "Bron: SunCalc + 3DBAG" if is_nl
            else "Source: SunCalc + 3DBAG"
        ),
        severity=(
            "clear"
            if sunlight_score is not None and sunlight_score >= GOOD_THRESHOLD
            else "attention"
            if sunlight_score is not None and sunlight_score >= 40
            else "flagged"
            if sunlight_score is not None
            else "attention"
        ),
    )


def _draw_indicator(pdf: BuurtCheckPDF, label: str, indicator) -> None:
    """Draw a single neighborhood indicator row."""
    pdf.draw_indicator_row(label, _format_indicator_text(indicator, pdf.is_nl))


def _format_indicator_text(indicator, is_nl: bool) -> str:
    if indicator is None or not indicator.available:
        return "\u2014"

    val = indicator.value
    unit = indicator.unit or ""
    precision = getattr(indicator, "precision", None)
    if isinstance(val, float):
        decimals = precision if isinstance(precision, int) and precision >= 0 else None
        default_decimals = decimals if decimals is not None else 0
        if unit == "%":
            text = f"{format_number(val, default_decimals, is_nl)}%"
        elif unit == "\u20ac":
            eur_prefix = "\u20ac " if is_nl else "\u20ac"
            text = f"{eur_prefix}{format_number(val, default_decimals, is_nl)}"
        elif unit == "km":
            text = f"{format_number(val, decimals if decimals is not None else 1, is_nl)} km"
        elif unit == "/km\u00b2":
            text = f"{format_number(val, default_decimals, is_nl)}/km\u00b2"
        elif unit == "per km\u00b2":
            text = f"{format_number(val, default_decimals, is_nl)} per km\u00b2"
        else:
            text = f"{format_number(val, default_decimals, is_nl)} {unit}".strip()
    elif val is not None:
        text = f"{val} {unit}".strip()
    else:
        text = "\u2014"

    quartile_label = _indicator_quartile_label(indicator, is_nl=is_nl)
    if quartile_label:
        text += f" \u00b7 {quartile_label}"
    return text


def _urbanization_label(level: UrbanizationLevel, is_nl: bool) -> str | None:
    labels = {
        UrbanizationLevel.very_urban: "Zeer stedelijk" if is_nl else "Very urban",
        UrbanizationLevel.urban: "Stedelijk" if is_nl else "Urban",
        UrbanizationLevel.moderate: "Matig stedelijk" if is_nl else "Moderately urban",
        UrbanizationLevel.rural: "Landelijk" if is_nl else "Rural",
        UrbanizationLevel.very_rural: "Zeer landelijk" if is_nl else "Very rural",
    }
    return labels.get(level)


def _build_neighborhood_sections(
    stats: NeighborhoodStats | None,
    is_nl: bool,
) -> list[dict[str, Any]] | None:
    if stats is None:
        return None

    def _row(label_nl: str, label_en: str, indicator) -> dict[str, str]:
        return {
            "label": label_nl if is_nl else label_en,
            "value": _format_indicator_text(indicator, is_nl),
        }

    return [
        {
            "title": "Bewoners" if is_nl else "People",
            "rows": [
                _row("Inwonerdichtheid", "Population density", stats.population_density),
                _row("Gem. huishoudgrootte", "Avg household size", stats.avg_household_size),
                _row("Alleenstaanden", "Single-person households", stats.single_person_pct),
            ],
        },
        {
            "title": "Woningen" if is_nl else "Housing",
            "rows": [
                _row("Koopwoningen", "Owner-occupied", stats.owner_occupied_pct),
                _row("Gem. WOZ-waarde", "Avg property value", stats.avg_property_value),
            ],
        },
        {
            "title": "Bereikbaarheid" if is_nl else "Access",
            "rows": [
                _row("Treinstation", "Train station", stats.distance_to_train_km),
                _row("Supermarkt", "Supermarket", stats.distance_to_supermarket_km),
            ],
        },
    ]


def _build_latex_comparison_chart_blocks(
    category_rows: list[tuple[
        str,
        int | None,
        str,
        str,
        list,
        list[tuple[str, str]] | None,
        str | None,
    ]],
    chart_paths: dict[str, str] | None,
) -> list[dict[str, str]]:
    if not chart_paths:
        return []

    blocks: list[dict[str, str]] = []
    for (
        cat_name,
        _score,
        _summary,
        _source_text,
        _comp_rows,
        measurements,
        unit_def,
    ) in category_rows:
        path = chart_paths.get(_slugify_label(cat_name))
        if path is None:
            continue

        measurement_line = None
        if measurements:
            measurement_line = " \u00b7 ".join(
                f"{escape_latex(label)}: {escape_latex(value)}"
                for label, value in measurements
            )

        blocks.append({
            "path": path,
            "measurement_line": measurement_line or "",
            "unit_definition": escape_latex(unit_def) if unit_def else "",
        })

    return blocks


def _draw_checklist_page(
    pdf: BuurtCheckPDF,
    address: str,
    risks: RiskCardsResponse | None,
    sunlight_score: int | None,
    viewing_questions: ViewingQuestionsResponse | None,
    is_nl: bool,
    crime_score: int | None = None,
    tier_b_data: TierBResponse | None = None,
) -> None:
    """Viewing checklist with front-loaded action items and mini score strip."""
    viewing_questions = _with_crime_viewing_questions(viewing_questions, tier_b_data)
    pdf.draw_h1("Bezichtigingsvragen" if is_nl else "Viewing Questions", add_divider=False)
    pdf.set_font("Satoshi", "B", 10)
    pdf.set_text_color(*SECONDARY)
    pdf.cell(0, 5, address, new_x="LMARGIN", new_y="NEXT")
    pdf.set_text_color(*SLATE)
    pdf.ln(1)

    cells = _build_risk_cells(risks, sunlight_score, is_nl, crime_score=crime_score)
    grid_cols = 5 if len(cells) == 5 else 4
    grid_end_y = pdf.draw_risk_grid(
        x=pdf.l_margin, y=pdf.get_y(),
        width=pdf.w - pdf.l_margin - pdf.r_margin,
        cells=cells, cols=grid_cols,
    )
    pdf.set_y(grid_end_y + 2)

    pdf.set_font("Satoshi", "", 10)
    instruction = (
        "Gebruik deze vragen tijdens de bezichtiging en noteer directe antwoorden."
        if is_nl
        else "Use these questions during the viewing and note the answers immediately."
    )
    pdf.cell(0, 6, instruction, new_x="LMARGIN", new_y="NEXT")
    pdf.ln(2)

    if not viewing_questions or not viewing_questions.categories:
        pdf.draw_tinted_box(
            text=(
                "Bezichtigingsvragen niet beschikbaar voor deze export. "
                "Gebruik de notitieruimte hieronder voor eigen checks."
                if is_nl
                else (
                    "Viewing questions were unavailable for this export. "
                    "Use the notes section below for your own checks."
                )
            ),
            fill=TILE_BG,
            border=BORDER,
            accent=SECONDARY,
            font_family="Satoshi",
            font_style="",
            font_size=9,
            text_color=SLATE,
            padding=2.6,
            line_height=4.2,
        )
        return

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
    """Reference material: methodology, sources, limitations, and provenance."""
    pdf.draw_h1("Methodologie" if is_nl else "Methodology", add_divider=False)

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

    pdf.draw_h2("Scoringformules" if is_nl else "Scoring formulas")
    formula_rows: list[tuple[str, str, str, str]] = [
        (
            "Geluid" if is_nl else "Noise",
            "40\u201390 dB Lden",
            "100 \u2192 0",
            "Lineair" if is_nl else "Linear interpolation",
        ),
        (
            "Luchtkwaliteit" if is_nl else "Air Quality",
            "PM2.5 5\u201325 \u00b5g/m\u00b3, NO\u2082 10\u201340 \u00b5g/m\u00b3",
            "100 \u2192 0",
            "Worst-of",
        ),
        (
            "Klimaatstress" if is_nl else "Climate",
            "Hitte + waterstress" if is_nl else "Heat + water stress",
            "Laag 85 / mid 50 / hoog 15" if is_nl else "Low 85 / med 50 / high 15",
            "Worst-of",
        ),
        (
            "Zonlicht" if is_nl else "Sunlight",
            "Winter directe zon op dak" if is_nl else "Winter roof direct sun",
            "uren / 6 \u00d7 100",
            "Cap 100" if is_nl else "Cap at 100",
        ),
    ]
    table_w = pdf.w - pdf.l_margin - pdf.r_margin
    col_widths = [table_w * 0.21, table_w * 0.35, table_w * 0.20, table_w * 0.24]
    headers = (
        ["Categorie", "Input", "Score-mapping", "Methode"]
        if is_nl
        else ["Category", "Input", "Score mapping", "Method"]
    )
    pdf.set_fill_color(*TILE_BG)
    pdf.set_draw_color(*BORDER)
    pdf.set_line_width(0.2)
    header_y = pdf.get_y()
    pdf.rect(pdf.l_margin, header_y, table_w, 6.0, "DF")
    pdf.set_xy(pdf.l_margin + 1.0, header_y + 0.8)
    pdf.set_font("SatoshiMedium", "", 8)
    pdf.set_text_color(*SECONDARY)
    for header, width in zip(headers, col_widths, strict=True):
        pdf.cell(width - 1.0, 4.5, header)
    pdf.set_y(header_y + 6.0)

    def _table_lines(text: str, width: float, *, bold: bool = False) -> list[str]:
        pdf.set_font("Satoshi", "B" if bold else "", 8)
        return pdf.multi_cell(
            width - 1.5,
            3.2,
            text,
            dry_run=True,
            output="LINES",
        )

    for row in formula_rows:
        row_lines = [
            _table_lines(cell_text, width, bold=idx == 0)
            for idx, (cell_text, width) in enumerate(zip(row, col_widths, strict=True))
        ]
        row_h = max(7.2, max(len(lines) for lines in row_lines) * 3.2 + 2.2)
        if pdf.will_page_break(row_h + 2):
            pdf.add_page()
            pdf.draw_h2("Scoringformules" if is_nl else "Scoring formulas")
            header_y = pdf.get_y()
            pdf.rect(pdf.l_margin, header_y, table_w, 6.0, "DF")
            pdf.set_xy(pdf.l_margin + 1.0, header_y + 0.8)
            pdf.set_font("SatoshiMedium", "", 8)
            pdf.set_text_color(*SECONDARY)
            for header, width in zip(headers, col_widths, strict=True):
                pdf.cell(width - 1.0, 4.5, header)
            pdf.set_y(header_y + 6.0)

        row_y = pdf.get_y()
        pdf.rect(pdf.l_margin, row_y, table_w, row_h, "D")
        pdf.set_xy(pdf.l_margin + 1.0, row_y + 1.0)
        for idx, (cell_text, width, lines) in enumerate(
            zip(row, col_widths, row_lines, strict=True)
        ):
            pdf.set_font("Satoshi", "B" if idx == 0 else "", 8)
            pdf.set_text_color(*SLATE if idx == 0 else SECONDARY)
            pdf.multi_cell(
                width - 1.5,
                3.2,
                "\n".join(lines),
                align="L",
                new_x="RIGHT",
                new_y="TOP",
            )
        pdf.set_y(row_y + row_h)
    pdf.set_text_color(*SLATE)
    pdf.ln(2)

    pdf.draw_h2("Databronnen" if is_nl else "Data sources")
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
        pdf.set_font("Satoshi", "", 10)
        pdf.set_text_color(*SLATE)
        pdf.cell(src_w * 0.35, 5, data_desc)
        pdf.set_font("Satoshi", "", 8)
        pdf.set_text_color(*SECONDARY)
        pdf.cell(
            src_w * 0.37, 5, layer, align="R", new_x="LMARGIN", new_y="NEXT",
        )
    pdf.set_text_color(*SLATE)
    pdf.ln(3)

    pdf.draw_h2(
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
        pdf.set_font("Satoshi", "", 10)
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

    pdf.draw_h2("Belangrijke beperkingen" if is_nl else "Important limitations")
    pdf.set_text_color(*AMBER_WARN)
    pdf.set_text_color(*SLATE)
    pdf.set_font("Satoshi", "", 10)
    limitations = (
        "Alle gegevens zijn indicatief en vervangen geen professionele "
        "bouwinspectie. "
        "Milieumetingen geven mogelijk geen micro-lokale omstandigheden weer."
        if is_nl
        else "All data is indicative and should not replace professional building "
        "inspection. "
        "Environmental measurements may not reflect micro-local conditions."
    )
    pdf.multi_cell(0, 5, limitations, align="L", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(4)

    # Provenance / Report Details block
    if provenance:
        _draw_provenance_block(pdf, provenance, is_nl)
