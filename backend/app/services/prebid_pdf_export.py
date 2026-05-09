from __future__ import annotations

from fpdf import FPDF

from app.models.prebid import PrebidPackResponse


def generate_prebid_pack_pdf(pack: PrebidPackResponse, language: str = "en") -> bytes:
    pdf = FPDF()
    pdf.set_compression(False)
    pdf.add_page()
    content_width = 190
    pdf.set_font("Helvetica", "B", 16)
    pdf.multi_cell(content_width, 10, "Pre-Bid Evidence & Questions Pack")
    pdf.set_font("Helvetica", "", 10)
    pdf.multi_cell(content_width, 7, pack.confirmed_address)
    pdf.multi_cell(content_width, 7, f"Checked: {pack.checked_at}")
    pdf.ln(4)
    pdf.set_font("Helvetica", "B", 12)
    pdf.multi_cell(content_width, 8, "Top verification items")
    pdf.set_font("Helvetica", "", 10)
    for action in pack.top_items:
        pdf.multi_cell(content_width, 6, f"- {action.finding}")
        pdf.multi_cell(content_width, 6, f"  Why it matters: {action.why_it_matters}")
        pdf.multi_cell(content_width, 6, f"  EN: {action.ask_this_en}")
        pdf.multi_cell(content_width, 6, f"  NL: {action.ask_this_nl}")
        recipients = ", ".join(str(item) for item in action.who_to_ask)
        pdf.multi_cell(content_width, 6, f"  Recipients: {recipients}")
        pdf.multi_cell(content_width, 6, f"  Limitation: {action.limitation}")
    pdf.ln(4)
    pdf.set_font("Helvetica", "B", 12)
    pdf.multi_cell(content_width, 8, "Document requests")
    pdf.set_font("Helvetica", "", 10)
    max_requests = max(len(pack.document_requests_en), len(pack.document_requests_nl))
    for index in range(max_requests):
        if index < len(pack.document_requests_en):
            pdf.multi_cell(content_width, 6, f"- EN: {pack.document_requests_en[index]}")
        if index < len(pack.document_requests_nl):
            pdf.multi_cell(content_width, 6, f"  NL: {pack.document_requests_nl[index]}")
    pdf.ln(4)
    pdf.set_font("Helvetica", "B", 12)
    pdf.multi_cell(content_width, 8, "Evidence narrative")
    pdf.set_font("Helvetica", "", 10)
    for paragraph in pack.evidence_narrative:
        pdf.multi_cell(content_width, 6, paragraph)
    pdf.ln(4)
    pdf.set_font("Helvetica", "B", 12)
    pdf.multi_cell(content_width, 8, "Source appendix")
    pdf.set_font("Helvetica", "", 10)
    for row in pack.source_appendix:
        pdf.multi_cell(content_width, 6, f"- {row.label} ({row.authority})")
        pdf.multi_cell(content_width, 6, f"  Status: {row.status}")
        pdf.multi_cell(content_width, 6, f"  Basis: {row.basis}")
        if row.method_version:
            pdf.multi_cell(content_width, 6, f"  Method/version: {row.method_version}")
        if row.duration_ms is not None:
            pdf.multi_cell(content_width, 6, f"  Duration: {row.duration_ms} ms")
        if row.error_code:
            pdf.multi_cell(content_width, 6, f"  Error code: {row.error_code}")
        pdf.multi_cell(content_width, 6, f"  Limitation: {row.limitation}")
    if pack.not_covered:
        pdf.ln(4)
        pdf.set_font("Helvetica", "B", 12)
        pdf.multi_cell(content_width, 8, "Coverage limits")
        pdf.set_font("Helvetica", "", 10)
        for item in pack.not_covered:
            pdf.multi_cell(content_width, 6, f"- {item}")
    pdf.ln(4)
    pdf.multi_cell(content_width, 6, pack.disclaimer)
    return bytes(pdf.output())
