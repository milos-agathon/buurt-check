"""PDF export service for Quick Brief viewing briefing."""

import base64
import io
import logging
from datetime import date

from fpdf import FPDF

from app.models.risk import RiskCardsResponse, ViewingQuestionsResponse

logger = logging.getLogger(__name__)

# Map common Unicode chars to latin-1 safe equivalents for Helvetica
_UNICODE_REPLACEMENTS = {
    "\u2014": "--",   # em dash
    "\u2013": "-",    # en dash
    "\u2018": "'",    # left single quote
    "\u2019": "'",    # right single quote
    "\u201c": '"',    # left double quote
    "\u201d": '"',    # right double quote
    "\u2026": "...",  # ellipsis
    "\u00b7": " - ",  # middle dot (used in our separators)
    "\u2022": "-",    # bullet
}


def _sanitize(text: str) -> str:
    """Replace Unicode chars unsupported by Helvetica (latin-1) with safe equivalents."""
    for char, replacement in _UNICODE_REPLACEMENTS.items():
        text = text.replace(char, replacement)
    # Final fallback: encode to latin-1, replacing anything still unsupported
    return text.encode("latin-1", errors="replace").decode("latin-1")


def _severity_label(score: int | None) -> str:
    """Convert score to severity label."""
    if score is None:
        return "N/A"
    if score >= 70:
        return "Good"
    if score >= 40:
        return "Moderate"
    if score >= 20:
        return "Poor"
    return "Critical"


def _severity_label_nl(score: int | None) -> str:
    """Convert score to Dutch severity label."""
    if score is None:
        return "N.v.t."
    if score >= 70:
        return "Goed"
    if score >= 40:
        return "Matig"
    if score >= 20:
        return "Slecht"
    return "Kritiek"


def generate_quick_brief(
    address: str,
    building_year: int | None,
    building_use: str | None,
    risks: RiskCardsResponse | None,
    sunlight_score: int | None,
    viewing_questions: ViewingQuestionsResponse | None,
    shadow_image_b64: str | None = None,
    language: str = "en",
) -> bytes:
    """Generate a 1-page Quick Brief PDF.

    Returns PDF as bytes.
    """
    is_nl = language == "nl"
    pdf = FPDF()
    pdf.add_page()
    pdf.set_auto_page_break(auto=True, margin=15)

    # Title
    pdf.set_font("Helvetica", "B", 18)
    pdf.cell(0, 10, "buurt-check", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(100, 100, 100)
    title = "BEZICHTIGINGSBRIEFING" if is_nl else "VIEWING BRIEFING"
    pdf.cell(0, 6, title, new_x="LMARGIN", new_y="NEXT")
    pdf.set_text_color(0, 0, 0)
    pdf.ln(4)

    # Address
    pdf.set_font("Helvetica", "B", 14)
    pdf.cell(0, 8, _sanitize(address), new_x="LMARGIN", new_y="NEXT")

    # Building facts line
    facts = []
    if building_year:
        label = "Bouwjaar" if is_nl else "Built"
        facts.append(f"{label} {building_year}")
    if building_use:
        facts.append(_sanitize(building_use))
    if facts:
        pdf.set_font("Helvetica", "", 10)
        pdf.set_text_color(100, 100, 100)
        pdf.cell(0, 6, " · ".join(facts), new_x="LMARGIN", new_y="NEXT")
        pdf.set_text_color(0, 0, 0)

    pdf.ln(4)

    # Shadow snapshot image
    if shadow_image_b64:
        try:
            image_data = base64.b64decode(shadow_image_b64)
            image_stream = io.BytesIO(image_data)
            pdf.image(image_stream, w=170, h=0)
            pdf.ln(4)
        except Exception:
            logger.warning("Failed to embed shadow snapshot in PDF")

    # Risk summary table
    pdf.set_font("Helvetica", "B", 12)
    header = "Risicobeoordeling" if is_nl else "Risk Assessment"
    pdf.cell(0, 8, header, new_x="LMARGIN", new_y="NEXT")
    pdf.ln(2)

    severity_fn = _severity_label_nl if is_nl else _severity_label

    # Table header
    pdf.set_font("Helvetica", "B", 9)
    pdf.set_fill_color(240, 241, 243)
    col_w = [60, 25, 35, 70]
    cat_header = "Categorie" if is_nl else "Category"
    score_header = "Score"
    level_header = "Niveau" if is_nl else "Level"
    summary_header = "Samenvatting" if is_nl else "Summary"
    pdf.cell(col_w[0], 7, cat_header, border=1, fill=True)
    pdf.cell(col_w[1], 7, score_header, border=1, fill=True, align="C")
    pdf.cell(col_w[2], 7, level_header, border=1, fill=True, align="C")
    pdf.cell(col_w[3], 7, summary_header, border=1, fill=True, new_x="LMARGIN", new_y="NEXT")

    pdf.set_font("Helvetica", "", 9)

    rows = []
    if risks:
        noise_label = "Geluid" if is_nl else "Noise"
        noise_summary = (risks.noise.summary_nl or risks.noise.summary or "") if risks.noise else ""
        rows.append((
            noise_label,
            str(risks.noise.score) if risks.noise.score is not None else "-",
            severity_fn(risks.noise.score),
            _sanitize(noise_summary[:40]),
        ))
        air_label = "Lucht" if is_nl else "Air Quality"
        air_summary = (
            risks.air_quality.summary_nl or risks.air_quality.summary or ""
        ) if risks.air_quality else ""
        rows.append((
            air_label,
            str(risks.air_quality.score) if risks.air_quality.score is not None else "-",
            severity_fn(risks.air_quality.score),
            _sanitize(air_summary[:40]),
        ))
        climate_label = "Klimaat" if is_nl else "Climate"
        climate_summary = (
            risks.climate_stress.summary_nl or risks.climate_stress.summary or ""
        ) if risks.climate_stress else ""
        rows.append((
            climate_label,
            str(risks.climate_stress.score)
            if risks.climate_stress.score is not None
            else "-",
            severity_fn(risks.climate_stress.score),
            _sanitize(climate_summary[:40]),
        ))

    sun_label = "Zonlicht" if is_nl else "Sunlight"
    rows.append((
        sun_label,
        str(sunlight_score) if sunlight_score is not None else "-",
        severity_fn(sunlight_score),
        "",
    ))

    for row in rows:
        pdf.cell(col_w[0], 7, row[0], border=1)
        pdf.cell(col_w[1], 7, row[1], border=1, align="C")
        pdf.cell(col_w[2], 7, row[2], border=1, align="C")
        pdf.cell(col_w[3], 7, row[3], border=1, new_x="LMARGIN", new_y="NEXT")

    pdf.ln(6)

    # Viewing questions
    if viewing_questions and viewing_questions.categories:
        pdf.set_font("Helvetica", "B", 12)
        q_header = "Vragen voor de bezichtiging" if is_nl else "Questions for Your Viewing"
        pdf.cell(0, 8, q_header, new_x="LMARGIN", new_y="NEXT")
        pdf.ln(2)

        pdf.set_font("Helvetica", "", 9)
        count = 0
        for cat in viewing_questions.categories:
            if count >= 8:
                break
            for q in cat.questions:
                if count >= 8:
                    break
                text = _sanitize(q.text_nl if is_nl else q.text_en)
                # Checkbox square + question
                pdf.cell(5, 6, "[ ]", new_x="RIGHT", new_y="LAST")
                pdf.cell(0, 6, f" {text}", new_x="LMARGIN", new_y="NEXT")
                count += 1

        # Blank lines for notes
        pdf.ln(4)
        pdf.set_font("Helvetica", "I", 9)
        notes_label = "Notities:" if is_nl else "Notes:"
        pdf.cell(0, 6, notes_label, new_x="LMARGIN", new_y="NEXT")
        pdf.line(pdf.get_x(), pdf.get_y() + 8, pdf.get_x() + 170, pdf.get_y() + 8)
        pdf.ln(12)
        pdf.line(pdf.get_x(), pdf.get_y(), pdf.get_x() + 170, pdf.get_y())

    # Footer
    pdf.ln(8)
    pdf.set_font("Helvetica", "I", 8)
    pdf.set_text_color(130, 130, 130)
    today = date.today().isoformat()
    if is_nl:
        footer = f"Gegenereerd door buurt-check · {today}"
    else:
        footer = f"Generated by buurt-check · {today}"
    pdf.cell(0, 5, footer, new_x="LMARGIN", new_y="NEXT")
    disclaimer = (
        "Data is indicatief. Verifieer op locatie vóór aankoop."
        if is_nl
        else "Data is indicative. Verify on-site before purchase."
    )
    pdf.cell(0, 5, disclaimer, new_x="LMARGIN", new_y="NEXT")

    sources = (
        "Bronnen: BAG (Kadaster), 3DBAG, RIVM, Klimaateffectatlas, CBS"
        if is_nl
        else "Sources: BAG (Kadaster), 3DBAG, RIVM, Klimaateffectatlas, CBS"
    )
    pdf.cell(0, 5, sources, new_x="LMARGIN", new_y="NEXT")

    return bytes(pdf.output())
