# PDF Export Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign Quick Brief and Full Dossier PDFs with Polar Frost brand identity — Satoshi font, severity-colored score bars, comparison charts, and full data expansion (neighborhood + Tier B).

**Architecture:** Rewrite `pdf_export.py` with a `BuurtCheckPDF(FPDF)` subclass that owns branding (teal band header, consistent footer, Satoshi fonts) and drawing primitives (score bars, comparison charts, checkboxes, age bars, energy badges). Quick Brief stays 1 page. Full Dossier expands from 4 to 5 pages with neighborhood stats and Tier B data. Export endpoint conditionally fetches additional data for Full Dossier.

**Tech Stack:** fpdf2 (existing), fonttools (new dev dep for .woff→.ttf conversion), Satoshi TTF fonts (generated from existing .woff files)

**Design doc:** `docs/plans/2026-02-13-pdf-redesign-design.md`

**Test baseline:** 293 backend non-live tests (must maintain or increase)

---

## Task 1: Convert Satoshi .woff Fonts to .ttf

**Files:**
- Create: `backend/scripts/convert_fonts.py`
- Create: `backend/app/assets/fonts/Satoshi-Regular.ttf` (generated)
- Create: `backend/app/assets/fonts/Satoshi-Bold.ttf` (generated)
- Create: `backend/app/assets/fonts/Satoshi-Black.ttf` (generated)
- Create: `backend/app/assets/fonts/Satoshi-Medium.ttf` (generated)
- Modify: `backend/pyproject.toml` (add fonttools to dev deps)

**Step 1: Add fonttools dev dependency**

In `backend/pyproject.toml`, add to `[project.optional-dependencies]` or dev deps:
```toml
[project.optional-dependencies]
dev = [
    # ... existing dev deps ...
    "fonttools>=4.40.0",
]
```

Run: `cd D:\buurt-check\backend && pip install -e ".[dev]"`

**Step 2: Write font conversion script**

```python
# backend/scripts/convert_fonts.py
"""One-time script to convert Satoshi .woff fonts to .ttf for fpdf2 embedding."""
import os
from pathlib import Path

from fontTools.ttLib import TTFont

FRONTEND_FONTS = Path(__file__).parent.parent.parent / "frontend" / "public" / "fonts"
OUTPUT_DIR = Path(__file__).parent.parent / "app" / "assets" / "fonts"

WEIGHTS = ["Regular", "Bold", "Black", "Medium"]

def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    for weight in WEIGHTS:
        src = FRONTEND_FONTS / f"Satoshi-{weight}.woff"
        dst = OUTPUT_DIR / f"Satoshi-{weight}.ttf"
        if not src.exists():
            print(f"SKIP: {src} not found")
            continue
        font = TTFont(src)
        font.save(str(dst))
        print(f"OK: {src.name} -> {dst.name} ({dst.stat().st_size // 1024} KB)")

if __name__ == "__main__":
    main()
```

**Step 3: Run conversion and verify**

Run: `cd D:\buurt-check\backend && python scripts/convert_fonts.py`
Expected: 4 .ttf files created in `backend/app/assets/fonts/`

Run: `ls -la D:\buurt-check\backend\app\assets\fonts\`
Expected: `Satoshi-Regular.ttf`, `Satoshi-Bold.ttf`, `Satoshi-Black.ttf`, `Satoshi-Medium.ttf` (each ~40-80 KB)

**Step 4: Commit**

```bash
git add backend/scripts/convert_fonts.py backend/app/assets/fonts/*.ttf backend/pyproject.toml
git commit -m "chore: convert Satoshi .woff fonts to .ttf for PDF embedding"
```

---

## Task 2: BuurtCheckPDF Foundation — Class + Fonts + Colors

**Files:**
- Create: `backend/app/services/pdf_export.py` (full rewrite)
- Test: `backend/tests/test_pdf_export.py`

This task creates the `BuurtCheckPDF` subclass with font registration, color constants, severity helpers, and the branded header/footer. All drawing primitives come in Task 3.

**Step 1: Write test for BuurtCheckPDF instantiation and font loading**

Add to `backend/tests/test_pdf_export.py`:

```python
def test_buurt_check_pdf_creates_with_fonts():
    """BuurtCheckPDF loads Satoshi fonts and produces valid PDF."""
    from app.services.pdf_export import BuurtCheckPDF
    pdf = BuurtCheckPDF(language="en")
    pdf.add_page()
    pdf.set_font("Satoshi", "", 10)
    pdf.cell(0, 10, "Test text with Satoshi font")
    output = bytes(pdf.output())
    assert output[:5] == b"%PDF-"
    assert len(output) > 500  # Font data embedded


def test_buurt_check_pdf_header_footer():
    """Header has teal band and brand name; footer has disclaimer and page number."""
    from app.services.pdf_export import BuurtCheckPDF
    pdf = BuurtCheckPDF(language="en")
    pdf.section_title = "RISK DETAILS"
    pdf.add_page()
    pdf.cell(0, 10, "Body content")
    output = bytes(pdf.output())
    assert output[:5] == b"%PDF-"


def test_buurt_check_pdf_dutch():
    """Dutch language uses NL disclaimer in footer."""
    from app.services.pdf_export import BuurtCheckPDF
    pdf = BuurtCheckPDF(language="nl")
    pdf.add_page()
    pdf.cell(0, 10, "Testinhoud")
    output = bytes(pdf.output())
    assert output[:5] == b"%PDF-"
```

**Step 2: Run tests to verify they fail**

Run: `cd D:\buurt-check\backend && pytest tests/test_pdf_export.py::test_buurt_check_pdf_creates_with_fonts -v`
Expected: FAIL — `BuurtCheckPDF` doesn't exist yet

**Step 3: Implement BuurtCheckPDF class foundation**

Rewrite `backend/app/services/pdf_export.py` with:

```python
"""PDF export service — Polar Frost branded Quick Brief and Full Dossier."""

import base64
import io
import logging
from datetime import date
from pathlib import Path

from fpdf import FPDF

from app.models.neighborhood import AgeProfile, NeighborhoodStats, UrbanizationLevel
from app.models.risk import (
    RiskCardsResponse,
    RiskComparisonsResponse,
    ViewingQuestionsResponse,
)
from app.models.tier_b import TierBResponse

logger = logging.getLogger(__name__)

# --- Font paths ---
_FONTS_DIR = Path(__file__).parent.parent / "assets" / "fonts"

# --- Polar Frost color palette (RGB tuples) ---
TEAL = (46, 196, 182)        # #2EC4B6 — Arctic Teal accent
SLATE = (28, 45, 63)         # #1C2D3F — Polar Slate primary text
MUTED = (138, 155, 176)      # #8A9BB0 — muted text / unavailable
BORDER = (226, 231, 237)     # #E2E7ED — borders, dividers, score track
SURFACE_ALT = (245, 247, 249)  # #F5F7F9 — alternate surface
WHITE = (255, 255, 255)
AMBER_WARN = (234, 179, 8)   # #EAB308 — amber for warnings

SEVERITY_COLORS: dict[str, tuple[int, int, int]] = {
    "good": (34, 197, 94),       # #22C55E
    "moderate": (234, 179, 8),   # #EAB308
    "poor": (239, 68, 68),       # #EF4444
    "critical": (185, 28, 28),   # #B91C1C
}

ENERGY_LABEL_COLORS: dict[str, tuple[int, int, int]] = {
    "A": (34, 197, 94),
    "B": (132, 204, 22),
    "C": (234, 179, 8),
    "D": (245, 158, 11),
    "E": (249, 115, 22),
    "F": (239, 68, 68),
    "G": (185, 28, 28),
}


def _severity_for_score(score: int | None) -> str:
    if score is None:
        return "unavailable"
    if score >= 70:
        return "good"
    if score >= 40:
        return "moderate"
    if score >= 20:
        return "poor"
    return "critical"


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
                self.add_font("Satoshi", style, str(path), uni=True)
        # Black weight as separate family
        black_path = _FONTS_DIR / "Satoshi-Black.ttf"
        if black_path.exists():
            self.add_font("SatoshiBlack", "", str(black_path), uni=True)
        # Medium weight
        medium_path = _FONTS_DIR / "Satoshi-Medium.ttf"
        if medium_path.exists():
            self.add_font("SatoshiMedium", "", str(medium_path), uni=True)

    def header(self) -> None:
        """Teal band + brand name + section title on every page."""
        # Teal accent band (6mm tall, full width)
        self.set_fill_color(*TEAL)
        self.rect(0, 0, self.w, 6, "F")

        # Brand name — left
        self.set_y(8)
        self.set_font("SatoshiBlack", "", 9)
        self.set_text_color(*SLATE)
        self.cell(0, 5, "buurt-check", new_x="RIGHT")

        # Section title — right
        if self.section_title:
            self.set_font("Satoshi", "", 9)
            self.set_text_color(*MUTED)
            self.set_x(self.w - self.r_margin - 60)
            self.cell(60, 5, self.section_title, align="R")

        # Thin rule below header
        self.set_draw_color(*BORDER)
        self.set_line_width(0.1)
        self.line(self.l_margin, 15, self.w - self.r_margin, 15)

        # Reset position below header
        self.set_y(18)
        self.set_text_color(*SLATE)

    def footer(self) -> None:
        """Brand + disclaimer + page number."""
        self.set_y(-15)
        # Rule above footer
        self.set_draw_color(*BORDER)
        self.set_line_width(0.1)
        self.line(self.l_margin, self.get_y(), self.w - self.r_margin, self.get_y())

        self.set_y(-12)
        self.set_font("Satoshi", "", 7)
        self.set_text_color(*MUTED)

        # Left: brand
        self.cell(30, 4, "buurt-check")

        # Center: disclaimer
        disclaimer = (
            "Data is indicatief. Verifieer op locatie."
            if self.is_nl
            else "Data is indicative. Verify on-site."
        )
        self.cell(0, 4, disclaimer, align="C")

        # Right: page number
        self.cell(30, 4, f"p. {self.page_no()}", align="R", new_x="LMARGIN")

        # Reset
        self.set_text_color(*SLATE)
```

Keep the existing public functions `generate_quick_brief()` and `generate_full_dossier()` temporarily working (they'll be rewritten in Tasks 4-5). Place them at the bottom of the file using the old `FPDF()` logic for now — they'll be replaced in subsequent tasks.

**Step 4: Run tests**

Run: `cd D:\buurt-check\backend && pytest tests/test_pdf_export.py -v`
Expected: All tests pass (new + existing)

**Step 5: Commit**

```bash
git add backend/app/services/pdf_export.py backend/tests/test_pdf_export.py
git commit -m "feat(pdf): add BuurtCheckPDF class with Satoshi fonts and branded header/footer"
```

---

## Task 3: Drawing Primitives — Score Bars, Checkboxes, Charts

**Files:**
- Modify: `backend/app/services/pdf_export.py` (add methods to BuurtCheckPDF)
- Test: `backend/tests/test_pdf_export.py`

**Step 1: Write tests for drawing primitives**

```python
def test_draw_score_bar():
    """Score bar renders without error for various scores."""
    from app.services.pdf_export import BuurtCheckPDF
    pdf = BuurtCheckPDF()
    pdf.add_page()
    pdf.draw_score_bar(x=20, y=30, width=80, score=65)
    pdf.draw_score_bar(x=20, y=40, width=80, score=0)
    pdf.draw_score_bar(x=20, y=50, width=80, score=100)
    pdf.draw_score_bar(x=20, y=60, width=80, score=None)
    output = bytes(pdf.output())
    assert output[:5] == b"%PDF-"


def test_draw_checkbox():
    """Checkbox renders as empty square."""
    from app.services.pdf_export import BuurtCheckPDF
    pdf = BuurtCheckPDF()
    pdf.add_page()
    pdf.draw_checkbox(x=20, y=30)
    output = bytes(pdf.output())
    assert output[:5] == b"%PDF-"


def test_draw_comparison_chart():
    """Comparison chart renders 4 horizontal bars."""
    from app.services.pdf_export import BuurtCheckPDF, TEAL, MUTED, BORDER
    pdf = BuurtCheckPDF()
    pdf.add_page()
    rows = [
        ("This address", 65, TEAL, False),
        ("Amsterdam avg", 72, MUTED, False),
        ("Netherlands", 58, BORDER, False),
        ("WHO guideline", 53, (234, 179, 8), True),  # dashed
    ]
    pdf.draw_comparison_chart(x=20, y=30, width=120, rows=rows)
    output = bytes(pdf.output())
    assert output[:5] == b"%PDF-"


def test_draw_risk_grid_2x2():
    """Risk grid draws 4 cells in 2x2 layout."""
    from app.services.pdf_export import BuurtCheckPDF
    pdf = BuurtCheckPDF()
    pdf.add_page()
    cells = [
        ("NOISE", 65, "Moderate"), ("AIR", 78, "Good"),
        ("CLIMATE", 42, "Moderate"), ("SUNLIGHT", 55, "Moderate"),
    ]
    pdf.draw_risk_grid(x=20, y=30, width=170, cells=cells)
    output = bytes(pdf.output())
    assert output[:5] == b"%PDF-"


def test_draw_energy_badge():
    """Energy badge renders for all label values A-G."""
    from app.services.pdf_export import BuurtCheckPDF
    pdf = BuurtCheckPDF()
    pdf.add_page()
    for i, label in enumerate("ABCDEFG"):
        pdf.draw_energy_badge(label, x=20, y=30 + i * 12)
    output = bytes(pdf.output())
    assert output[:5] == b"%PDF-"


def test_draw_age_bars():
    """Age distribution bars render for valid data."""
    from app.services.pdf_export import BuurtCheckPDF
    from app.models.neighborhood import AgeProfile
    pdf = BuurtCheckPDF()
    pdf.add_page()
    age = AgeProfile(age_0_24=22.0, age_25_64=58.0, age_65_plus=20.0)
    pdf.draw_age_bars(x=20, y=30, width=120, age_data=age)
    output = bytes(pdf.output())
    assert output[:5] == b"%PDF-"
```

**Step 2: Run tests to verify they fail**

Run: `cd D:\buurt-check\backend && pytest tests/test_pdf_export.py::test_draw_score_bar -v`
Expected: FAIL — method doesn't exist

**Step 3: Implement drawing primitives**

Add these methods to the `BuurtCheckPDF` class:

```python
    # --- Drawing primitives ---

    def draw_score_bar(
        self, x: float, y: float, width: float, score: int | None, height: float = 1.0
    ) -> None:
        """Draw horizontal score bar: gray track + colored fill proportional to score."""
        # Track (full width, light gray)
        self.set_fill_color(*BORDER)
        self.rect(x, y, width, height, "F")
        # Fill (proportional, severity color)
        if score is not None and score > 0:
            fill_w = width * min(score, 100) / 100
            self.set_fill_color(*_severity_color(score))
            self.rect(x, y, fill_w, height, "F")

    def draw_checkbox(self, x: float, y: float, size: float = 3.0) -> None:
        """Draw an empty checkbox square (pen-friendly)."""
        self.set_draw_color(*SLATE)
        self.set_line_width(0.3)
        self.rect(x, y, size, size, "D")
        self.set_line_width(0.1)  # reset

    def draw_comparison_chart(
        self,
        x: float,
        y: float,
        width: float,
        rows: list[tuple[str, int, tuple[int, int, int], bool]],
    ) -> None:
        """Draw horizontal comparison bars.

        Each row: (label, score_value, fill_color_rgb, is_dashed).
        """
        label_w = 40
        score_w = 15
        bar_w = width - label_w - score_w - 4
        bar_h = 3.0
        row_h = 7.0

        for i, (label, value, color, dashed) in enumerate(rows):
            ry = y + i * row_h

            # Label
            self.set_font("Satoshi", "", 8)
            self.set_text_color(*SLATE)
            self.set_xy(x, ry)
            self.cell(label_w, row_h, label)

            # Bar track
            bar_x = x + label_w + 2
            bar_y = ry + (row_h - bar_h) / 2
            self.set_fill_color(*BORDER)
            self.rect(bar_x, bar_y, bar_w, bar_h, "F")

            # Bar fill
            fill_w = bar_w * min(value, 100) / 100
            if dashed:
                # Dashed fill: draw short segments
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

            # Score number (right)
            self.set_font("Satoshi", "B", 8)
            self.set_xy(x + width - score_w, ry)
            self.cell(score_w, row_h, str(value), align="R")

    def draw_risk_grid(
        self,
        x: float,
        y: float,
        width: float,
        cells: list[tuple[str, int | None, str]],
        cols: int = 2,
    ) -> float:
        """Draw 2x2 (or Nx2) risk summary grid.

        Each cell: (category_label, score, severity_label).
        Returns y position after the grid.
        """
        gap = 4
        cell_w = (width - gap * (cols - 1)) / cols
        cell_h = 28
        rows_needed = (len(cells) + cols - 1) // cols

        for i, (cat_label, score, sev_label) in enumerate(cells):
            col = i % cols
            row = i // cols
            cx = x + col * (cell_w + gap)
            cy = y + row * (cell_h + gap)

            # Category label (uppercase, small)
            self.set_font("SatoshiMedium", "", 7)
            self.set_text_color(*MUTED)
            self.set_xy(cx, cy)
            self.cell(cell_w, 4, cat_label.upper(), align="C")

            # Score number (large, severity color)
            color = _severity_color(score)
            self.set_font("SatoshiBlack", "", 24)
            self.set_text_color(*color)
            self.set_xy(cx, cy + 4)
            score_text = str(score) if score is not None else "\u2014"
            self.cell(cell_w, 10, score_text, align="C")

            # Score bar
            bar_y = cy + 15
            bar_margin = cell_w * 0.1
            self.draw_score_bar(cx + bar_margin, bar_y, cell_w - 2 * bar_margin, score)

            # Severity label
            self.set_font("Satoshi", "", 8)
            self.set_text_color(*color)
            self.set_xy(cx, cy + 18)
            self.cell(cell_w, 5, sev_label, align="C")

        # Reset text color
        self.set_text_color(*SLATE)
        return y + rows_needed * (cell_h + gap)

    def draw_energy_badge(self, label: str, x: float, y: float) -> None:
        """Draw colored energy label badge (e.g., green 'A' badge)."""
        color = ENERGY_LABEL_COLORS.get(label.upper(), MUTED)
        self.set_fill_color(*color)
        self.rect(x, y, 10, 7, "F")
        self.set_font("Satoshi", "B", 9)
        self.set_text_color(*WHITE)
        self.set_xy(x, y)
        self.cell(10, 7, label.upper(), align="C")
        self.set_text_color(*SLATE)

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

            # Label
            self.set_font("Satoshi", "", 9)
            self.set_text_color(*SLATE)
            self.set_xy(x, ry)
            self.cell(label_w, row_h, band_label)

            # Bar track
            bar_x = x + label_w + 2
            bar_y = ry + (row_h - bar_h) / 2
            self.set_fill_color(*BORDER)
            self.rect(bar_x, bar_y, bar_w, bar_h, "F")

            # Bar fill (teal)
            if pct is not None and pct > 0:
                fill_w = bar_w * min(pct, 100) / 100
                self.set_fill_color(*TEAL)
                self.rect(bar_x, bar_y, fill_w, bar_h, "F")

            # Percentage
            self.set_font("Satoshi", "B", 9)
            self.set_xy(x + width - pct_w, ry)
            pct_text = f"{pct:.0f}%" if pct is not None else "\u2014"
            self.cell(pct_w, row_h, pct_text, align="R")

        self.set_text_color(*SLATE)
        return y + len(bands) * row_h

    def draw_section_label(self, text: str) -> None:
        """Draw an uppercase section label (e.g., 'RISK ASSESSMENT')."""
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
        x = self.get_x()
        w = self.w - self.l_margin - self.r_margin
        self.cell(w * 0.6, 6, label)
        self.set_font("Satoshi", "B", 9)
        self.cell(w * 0.4, 6, value, align="R", new_x="LMARGIN", new_y="NEXT")
```

**Step 4: Run all tests**

Run: `cd D:\buurt-check\backend && pytest tests/test_pdf_export.py -v`
Expected: All pass

**Step 5: Commit**

```bash
git add backend/app/services/pdf_export.py backend/tests/test_pdf_export.py
git commit -m "feat(pdf): add drawing primitives — score bars, comparison charts, checkboxes, badges"
```

---

## Task 4: Quick Brief Redesign

**Files:**
- Modify: `backend/app/services/pdf_export.py` (rewrite `generate_quick_brief`)
- Test: `backend/tests/test_pdf_export.py`

**Step 1: Update existing Quick Brief tests for new signature**

The existing tests should still pass — the function signature stays backward compatible. Add one new test:

```python
def test_quick_brief_has_risk_grid():
    """Quick Brief contains 2x2 risk grid instead of table."""
    result = generate_quick_brief(
        address="Keizersgracht 123, 1015 CJ Amsterdam",
        building_year=1875,
        building_use="Residential",
        risks=_make_risks(),
        sunlight_score=80,
        viewing_questions=_make_viewing_questions(),
        language="en",
    )
    assert isinstance(result, bytes)
    assert result[:5] == b"%PDF-"
    assert len(result) > 1000  # Richer than before due to fonts + drawing
```

**Step 2: Rewrite `generate_quick_brief()` using BuurtCheckPDF**

```python
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
    """Generate a 1-page Quick Brief PDF with Polar Frost branding."""
    is_nl = language == "nl"
    pdf = BuurtCheckPDF(language=language)
    pdf.section_title = "BEZICHTIGINGSBRIEFING" if is_nl else "VIEWING BRIEF"
    pdf.add_page()

    # --- Address block ---
    pdf.set_font("SatoshiBlack", "", 16)
    pdf.set_text_color(*SLATE)
    pdf.multi_cell(0, 7, address, new_x="LMARGIN", new_y="NEXT")

    facts_parts: list[str] = []
    if building_year:
        facts_parts.append(f"{'Bouwjaar' if is_nl else 'Built'} {building_year}")
    if building_use:
        facts_parts.append(building_use)
    if facts_parts:
        pdf.set_font("Satoshi", "", 9)
        pdf.set_text_color(*MUTED)
        pdf.cell(0, 5, " \u00b7 ".join(facts_parts), new_x="LMARGIN", new_y="NEXT")
        pdf.set_text_color(*SLATE)
    pdf.ln(3)

    # --- Shadow snapshot ---
    if shadow_image_b64:
        try:
            image_data = base64.b64decode(shadow_image_b64)
            pdf.set_draw_color(*BORDER)
            pdf.set_line_width(0.2)
            img_y = pdf.get_y()
            pdf.image(io.BytesIO(image_data), x=pdf.l_margin, w=170, h=0)
            # Border around image
            img_h = pdf.get_y() - img_y
            pdf.rect(pdf.l_margin, img_y, 170, img_h, "D")
            pdf.set_font("Satoshi", "I", 7)
            pdf.set_text_color(*MUTED)
            caption = "Winterzonnewende, 12:00" if is_nl else "Winter solstice, 12:00"
            pdf.cell(0, 4, caption, new_x="LMARGIN", new_y="NEXT")
            pdf.set_text_color(*SLATE)
            pdf.ln(2)
        except Exception:
            logger.warning("Failed to embed shadow snapshot in quick brief")

    # --- Risk Assessment 2x2 grid ---
    pdf.draw_section_label("Risicobeoordeling" if is_nl else "Risk Assessment")
    pdf.ln(1)

    cells = _build_risk_cells(risks, sunlight_score, is_nl)
    grid_end_y = pdf.draw_risk_grid(
        x=pdf.l_margin, y=pdf.get_y(), width=pdf.w - pdf.l_margin - pdf.r_margin,
        cells=cells,
    )
    pdf.set_y(grid_end_y + 2)

    # --- Top viewing questions ---
    _draw_branded_questions(pdf, viewing_questions, is_nl, max_questions=8)

    return bytes(pdf.output())
```

Also add these helpers:

```python
def _build_risk_cells(
    risks: RiskCardsResponse | None, sunlight_score: int | None, is_nl: bool
) -> list[tuple[str, int | None, str]]:
    """Build cell data for risk grid: (category, score, severity_label)."""
    cells: list[tuple[str, int | None, str]] = []
    if risks:
        for cat_key, cat_name_en, cat_name_nl in [
            ("noise", "Noise", "Geluid"),
            ("air_quality", "Air", "Lucht"),
            ("climate_stress", "Climate", "Klimaat"),
        ]:
            card = getattr(risks, cat_key)
            cells.append((
                cat_name_nl if is_nl else cat_name_en,
                card.score,
                _severity_label(card.score, is_nl),
            ))
    # Sunlight always added
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
) -> None:
    """Draw viewing questions with severity-colored borders and drawn checkboxes."""
    if not viewing_questions or not viewing_questions.categories:
        return

    pdf.set_font("Satoshi", "B", 11)
    pdf.set_text_color(*SLATE)
    header = "Vragen voor de bezichtiging" if is_nl else "Questions for your viewing"
    pdf.cell(0, 7, header, new_x="LMARGIN", new_y="NEXT")
    pdf.ln(1)

    count = 0
    for category in viewing_questions.categories:
        if max_questions is not None and count >= max_questions:
            break

        # Category header with severity color
        sev_color = SEVERITY_COLORS.get(category.severity, MUTED)

        # Severity-colored left accent
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
```

**Step 3: Run all tests**

Run: `cd D:\buurt-check\backend && pytest tests/test_pdf_export.py -v`
Expected: All pass (existing + new)

**Step 4: Run ruff**

Run: `cd D:\buurt-check\backend && ruff check .`
Expected: Clean

**Step 5: Commit**

```bash
git add backend/app/services/pdf_export.py backend/tests/test_pdf_export.py
git commit -m "feat(pdf): redesign Quick Brief with 2x2 risk grid, score bars, and branded layout"
```

---

## Task 5: Full Dossier — Cover Page + Risk Details Page

**Files:**
- Modify: `backend/app/services/pdf_export.py` (rewrite `generate_full_dossier`)
- Test: `backend/tests/test_pdf_export.py`

**Step 1: Write tests for expanded Full Dossier**

```python
def test_full_dossier_with_neighborhood_and_tierb():
    """Full Dossier generates valid PDF when neighborhood + Tier B data provided."""
    from app.models.neighborhood import (
        AgeProfile, NeighborhoodIndicator, NeighborhoodStats, UrbanizationLevel,
    )
    from app.models.tier_b import CrimeStatsCard, EnergyLabelCard, TierBResponse
    from app.models.risk import (
        ComparisonPattern, RiskComparisonRow, RiskComparisonsResponse,
    )

    stats = NeighborhoodStats(
        buurt_code="BU03630001",
        buurt_name="Grachtengordel-West",
        gemeente_name="Amsterdam",
        population_density=NeighborhoodIndicator(value=12450, unit="/km\u00b2"),
        avg_household_size=NeighborhoodIndicator(value=1.8),
        single_person_pct=NeighborhoodIndicator(value=62.0, unit="%"),
        age_profile=AgeProfile(age_0_24=22.0, age_25_64=58.0, age_65_plus=20.0),
        owner_occupied_pct=NeighborhoodIndicator(value=35.0, unit="%"),
        avg_property_value=NeighborhoodIndicator(value=485000, unit="\u20ac"),
        distance_to_train_km=NeighborhoodIndicator(value=0.4, unit="km"),
        distance_to_supermarket_km=NeighborhoodIndicator(value=0.2, unit="km"),
        urbanization=UrbanizationLevel.very_urban,
    )
    tier_b = TierBResponse(
        address_id="0363010012345678",
        energy_label=EnergyLabelCard(label="A", source_date="2024-06-01"),
        crime=CrimeStatsCard(
            total_per_1000=12.3, burglary_per_1000=3.1, violent_per_1000=1.2,
            yearly_period="2023",
        ),
    )
    comparisons = RiskComparisonsResponse(
        address_id="0363010012345678",
        noise=[
            RiskComparisonRow(label_code="city_avg", value=54),
            RiskComparisonRow(label_code="nl_avg", value=66),
            RiskComparisonRow(label_code="who_limit", value=74, pattern=ComparisonPattern.dashed),
            RiskComparisonRow(label_code="address", value=65),
        ],
        air_quality=[RiskComparisonRow(label_code="address", value=78)],
        climate_stress=[RiskComparisonRow(label_code="address", value=42)],
        sunlight=[RiskComparisonRow(label_code="address", value=55)],
        generated_at="2026-02-13",
    )

    result = generate_full_dossier(
        address="Keizersgracht 123, 1015 CJ Amsterdam",
        building_year=1875,
        building_use="Residential",
        risks=_make_risks(),
        sunlight_score=80,
        viewing_questions=_make_viewing_questions(),
        language="en",
        neighborhood_stats=stats,
        tier_b=tier_b,
        risk_comparisons=comparisons,
    )
    assert isinstance(result, bytes)
    assert result[:5] == b"%PDF-"
    assert len(result) > 2000


def test_full_dossier_graceful_without_extra_data():
    """Full Dossier generates valid PDF even without neighborhood/tier-b data."""
    result = generate_full_dossier(
        address="Somestraat 42",
        building_year=None,
        building_use=None,
        risks=None,
        sunlight_score=None,
        viewing_questions=None,
        language="en",
    )
    assert isinstance(result, bytes)
    assert result[:5] == b"%PDF-"
```

**Step 2: Rewrite `generate_full_dossier()`**

The new signature adds optional params (backward compatible):

```python
def generate_full_dossier(
    address: str,
    building_year: int | None,
    building_use: str | None,
    risks: RiskCardsResponse | None,
    sunlight_score: int | None,
    viewing_questions: ViewingQuestionsResponse | None,
    shadow_image_b64: str | None = None,
    language: str = "en",
    neighborhood_stats: NeighborhoodStats | None = None,
    tier_b: TierBResponse | None = None,
    risk_comparisons: RiskComparisonsResponse | None = None,
) -> bytes:
    """Generate 5-page Full Dossier with Polar Frost branding."""
    is_nl = language == "nl"
    pdf = BuurtCheckPDF(language=language)

    # --- Page 1: Cover + Summary ---
    pdf.section_title = "VOLLEDIG DOSSIER" if is_nl else "PROPERTY INTELLIGENCE DOSSIER"
    pdf.add_page()
    _draw_cover_page(pdf, address, building_year, building_use,
                     risks, sunlight_score, shadow_image_b64, is_nl)

    # --- Page 2: Risk Details ---
    pdf.section_title = "RISICODETAILS" if is_nl else "RISK DETAILS"
    pdf.add_page()
    _draw_risk_details_page(pdf, risks, sunlight_score, risk_comparisons, is_nl)

    # --- Page 3: Neighborhood Intelligence ---
    pdf.section_title = "BUURT" if is_nl else "NEIGHBORHOOD"
    pdf.add_page()
    _draw_neighborhood_page(pdf, neighborhood_stats, tier_b, is_nl)

    # --- Page 4: Viewing Checklist ---
    pdf.section_title = "BEZICHTIGINGSCHECKLIST" if is_nl else "VIEWING CHECKLIST"
    pdf.add_page()
    _draw_checklist_page(pdf, address, risks, sunlight_score, viewing_questions, is_nl)

    # --- Page 5: Methodology + Notes ---
    pdf.section_title = "METHODOLOGIE" if is_nl else "METHODOLOGY"
    pdf.add_page()
    _draw_methodology_page(pdf, is_nl)

    return bytes(pdf.output())
```

Implement `_draw_cover_page()` and `_draw_risk_details_page()`:

```python
def _draw_cover_page(
    pdf: BuurtCheckPDF,
    address: str,
    building_year: int | None,
    building_use: str | None,
    risks: RiskCardsResponse | None,
    sunlight_score: int | None,
    shadow_image_b64: str | None,
    is_nl: bool,
) -> None:
    """Page 1: cover with address hero, shadow image, risk summary strip."""
    pdf.ln(4)

    # Address hero
    pdf.set_font("SatoshiBlack", "", 20)
    pdf.set_text_color(*SLATE)
    pdf.multi_cell(0, 8, address, new_x="LMARGIN", new_y="NEXT")

    facts_parts: list[str] = []
    if building_year:
        facts_parts.append(f"{'Bouwjaar' if is_nl else 'Built'} {building_year}")
    if building_use:
        facts_parts.append(building_use)
    if facts_parts:
        pdf.set_font("Satoshi", "", 10)
        pdf.set_text_color(*MUTED)
        pdf.cell(0, 5, " \u00b7 ".join(facts_parts), new_x="LMARGIN", new_y="NEXT")
        pdf.set_text_color(*SLATE)
    pdf.ln(4)

    # Shadow snapshot
    if shadow_image_b64:
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
            pdf.ln(3)
        except Exception:
            logger.warning("Failed to embed shadow snapshot in full dossier")

    # Risk summary strip (4-column horizontal)
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
    risks: RiskCardsResponse | None,
    sunlight_score: int | None,
    comparisons: RiskComparisonsResponse | None,
    is_nl: bool,
) -> None:
    """Page 2: detailed risk breakdown with comparison charts."""
    categories = _build_risk_detail_data(risks, sunlight_score, comparisons, is_nl)

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

        # Score right-aligned
        pdf.set_font("SatoshiBlack", "", 14)
        pdf.set_text_color(*color)
        score_text = str(score) if score is not None else "\u2014"
        pdf.cell(0, 8, score_text, align="R", new_x="LMARGIN", new_y="NEXT")

        # Score bar (full width)
        bar_w = pdf.w - pdf.l_margin - pdf.r_margin
        pdf.draw_score_bar(pdf.l_margin, pdf.get_y(), bar_w, score, height=1.2)
        pdf.ln(3)

        # Severity label
        pdf.set_font("Satoshi", "", 9)
        pdf.set_text_color(*color)
        pdf.cell(0, 4, _severity_label(score, is_nl), new_x="LMARGIN", new_y="NEXT")
        pdf.set_text_color(*SLATE)
        pdf.ln(1)

        # "What this means"
        if summary:
            pdf.set_font("Satoshi", "", 10)
            pdf.multi_cell(0, 5, summary, new_x="LMARGIN", new_y="NEXT")
            pdf.ln(2)

        # Comparison chart
        if comp_rows:
            pdf.draw_section_label(
                "Hoe het vergelijkt" if is_nl else "How it compares"
            )
            pdf.draw_comparison_chart(
                x=pdf.l_margin, y=pdf.get_y(),
                width=pdf.w - pdf.l_margin - pdf.r_margin,
                rows=comp_rows,
            )
            pdf.ln(len(comp_rows) * 7 + 2)

        # Source
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
    """Build structured data for risk details page.

    Returns list of (name, score, summary, source_text, comparison_rows).
    """
    result = []

    _COMPARISON_LABELS = {
        "address": ("Dit adres" if is_nl else "This address", TEAL, False),
        "city_avg": ("Stadsgemiddelde" if is_nl else "City average", MUTED, False),
        "nl_avg": ("Nederland" if is_nl else "Netherlands", BORDER, False),
        "who_limit": ("WHO-richtlijn" if is_nl else "WHO guideline", AMBER_WARN, True),
        "adaptation_target": ("Doelstelling" if is_nl else "Target", AMBER_WARN, True),
        "daylight_target": ("Daglichtdoel" if is_nl else "Daylight target", AMBER_WARN, True),
    }

    def _comp_rows(category_rows: list | None) -> list:
        if not category_rows:
            return []
        rows = []
        for row in category_rows:
            label_info = _COMPARISON_LABELS.get(
                row.label_code, (row.label_code, MUTED, False)
            )
            rows.append((label_info[0], row.value, label_info[1], label_info[2]))
        return rows

    if risks:
        for attr, name_en, name_nl, comp_attr in [
            ("noise", "Noise", "Geluid", "noise"),
            ("air_quality", "Air Quality", "Luchtkwaliteit", "air_quality"),
            ("climate_stress", "Climate Stress", "Klimaatstress", "climate_stress"),
        ]:
            card = getattr(risks, attr)
            summary = (card.summary_nl if is_nl else card.summary) or ""
            source = f"Source: {card.source}"
            if card.source_date:
                source += f" \u00b7 {card.source_date}"
            comp = _comp_rows(getattr(comparisons, comp_attr, None) if comparisons else None)
            result.append((name_nl if is_nl else name_en, card.score, summary, source, comp))

    # Sunlight
    sun_summary = ""
    if risks and risks.sunlight:
        sun_summary = (risks.sunlight.summary_nl if is_nl else risks.sunlight.summary) or ""
    sun_comp = _comp_rows(comparisons.sunlight if comparisons else None)
    result.append((
        "Zonlicht" if is_nl else "Sunlight",
        sunlight_score,
        sun_summary,
        "Source: SunCalc + 3DBAG",
        sun_comp,
    ))

    return result
```

**Step 3: Run tests**

Run: `cd D:\buurt-check\backend && pytest tests/test_pdf_export.py -v`
Expected: All pass

**Step 4: Commit**

```bash
git add backend/app/services/pdf_export.py backend/tests/test_pdf_export.py
git commit -m "feat(pdf): Full Dossier cover page + risk details with comparison charts"
```

---

## Task 6: Full Dossier — Neighborhood, Checklist, Methodology Pages

**Files:**
- Modify: `backend/app/services/pdf_export.py` (add page drawing functions)
- Test: `backend/tests/test_pdf_export.py`

**Step 1: Implement `_draw_neighborhood_page()`**

```python
def _draw_neighborhood_page(
    pdf: BuurtCheckPDF,
    stats: NeighborhoodStats | None,
    tier_b_data: TierBResponse | None,
    is_nl: bool,
) -> None:
    """Page 3: neighborhood stats + energy label + crime."""
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
        _draw_indicator(pdf, "Inwonerdichtheid" if is_nl else "Population density",
                        stats.population_density)
        _draw_indicator(pdf, "Gem. huishoudgrootte" if is_nl else "Avg household size",
                        stats.avg_household_size)
        _draw_indicator(pdf, "Alleenstaanden" if is_nl else "Single-person hh",
                        stats.single_person_pct)
        pdf.ln(2)

        # Age distribution
        pdf.draw_section_label("Leeftijdsverdeling" if is_nl else "Age Distribution")
        if (stats.age_profile.age_0_24 is not None
                or stats.age_profile.age_25_64 is not None
                or stats.age_profile.age_65_plus is not None):
            pdf.draw_age_bars(
                x=pdf.l_margin, y=pdf.get_y(),
                width=pdf.w - pdf.l_margin - pdf.r_margin,
                age_data=stats.age_profile,
            )
            pdf.ln(23)
        pdf.ln(2)

        # Housing
        pdf.draw_section_label("Woningen" if is_nl else "Housing")
        _draw_indicator(pdf, "Koopwoningen" if is_nl else "Owner-occupied",
                        stats.owner_occupied_pct)
        _draw_indicator(pdf, "Gem. WOZ-waarde" if is_nl else "Avg property value",
                        stats.avg_property_value)
        pdf.ln(2)

        # Access
        pdf.draw_section_label("Bereikbaarheid" if is_nl else "Access")
        _draw_indicator(pdf, "Treinstation" if is_nl else "Train station",
                        stats.distance_to_train_km)
        _draw_indicator(pdf, "Supermarkt" if is_nl else "Supermarket",
                        stats.distance_to_supermarket_km)

        # CBS source
        pdf.ln(2)
        pdf.set_font("Satoshi", "", 8)
        pdf.set_text_color(*MUTED)
        pdf.cell(0, 4, "Bron: CBS Wijken & Buurten 2024" if is_nl else "Source: CBS Wijken & Buurten 2024",
                 new_x="LMARGIN", new_y="NEXT")
        pdf.set_text_color(*SLATE)
    else:
        pdf.set_font("Satoshi", "", 10)
        pdf.set_text_color(*MUTED)
        pdf.cell(0, 8,
                 "Buurtgegevens niet beschikbaar." if is_nl else "Neighborhood data unavailable.",
                 new_x="LMARGIN", new_y="NEXT")
        pdf.set_text_color(*SLATE)

    # Divider before Tier B
    pdf.draw_divider("strong")

    # Energy & Safety
    pdf.draw_section_label("Energie & Veiligheid" if is_nl else "Energy & Safety")
    pdf.ln(1)

    if tier_b_data:
        # Energy label
        el = tier_b_data.energy_label
        if el.label:
            pdf.set_font("Satoshi", "B", 11)
            pdf.cell(30, 7, "Energielabel" if is_nl else "Energy Label")
            pdf.draw_energy_badge(el.label, pdf.get_x() + 2, pdf.get_y())
            pdf.ln(8)
            if el.source_date:
                pdf.set_font("Satoshi", "", 8)
                pdf.set_text_color(*MUTED)
                pdf.cell(0, 4, f"Bron: EP-Online \u00b7 {el.source_date}" if is_nl
                         else f"Source: EP-Online \u00b7 {el.source_date}",
                         new_x="LMARGIN", new_y="NEXT")
                pdf.set_text_color(*SLATE)
        elif el.message:
            pdf.set_font("Satoshi", "", 9)
            pdf.set_text_color(*MUTED)
            pdf.cell(0, 6, f"Energielabel: {el.message}" if is_nl
                     else f"Energy label: {el.message}",
                     new_x="LMARGIN", new_y="NEXT")
            pdf.set_text_color(*SLATE)
        pdf.ln(3)

        # Crime
        crime = tier_b_data.crime
        if crime.total_per_1000 is not None:
            pdf.set_font("Satoshi", "B", 11)
            pdf.cell(0, 7, "Criminaliteit" if is_nl else "Crime Rate",
                     new_x="LMARGIN", new_y="NEXT")
            pdf.set_font("Satoshi", "", 10)
            pdf.cell(0, 6,
                     f"{crime.total_per_1000:.1f} {'per 1.000 inwoners' if is_nl else 'per 1,000 residents'}",
                     new_x="LMARGIN", new_y="NEXT")
            if crime.burglary_per_1000 is not None:
                pdf.set_font("Satoshi", "", 9)
                pdf.set_x(pdf.l_margin + 5)
                pdf.cell(0, 5,
                         f"{'Inbraak' if is_nl else 'Burglary'}: {crime.burglary_per_1000:.1f}",
                         new_x="LMARGIN", new_y="NEXT")
            if crime.violent_per_1000 is not None:
                pdf.set_x(pdf.l_margin + 5)
                pdf.cell(0, 5,
                         f"{'Geweld' if is_nl else 'Violent'}: {crime.violent_per_1000:.1f}",
                         new_x="LMARGIN", new_y="NEXT")
            # Disclaimer
            pdf.ln(2)
            pdf.set_font("Satoshi", "I", 8)
            pdf.set_text_color(*MUTED)
            disclaimer = ("Criminaliteitscijfers zijn per gemeente, niet per straat. "
                          "Alleen geregistreerde misdrijven." if is_nl
                          else "Crime data is per municipality, not per street. "
                          "Registered crimes only.")
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
        no_data = ("Energie- en criminaliteitsgegevens niet beschikbaar." if is_nl
                   else "Energy and crime data unavailable.")
        pdf.cell(0, 6, no_data, new_x="LMARGIN", new_y="NEXT")
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
        else:
            text = f"{val:,.0f} {unit}".strip()
    elif val is not None:
        text = f"{val} {unit}".strip()
    else:
        text = "\u2014"
    pdf.draw_indicator_row(label, text)
```

**Step 2: Implement `_draw_checklist_page()` and `_draw_methodology_page()`**

```python
def _draw_checklist_page(
    pdf: BuurtCheckPDF,
    address: str,
    risks: RiskCardsResponse | None,
    sunlight_score: int | None,
    viewing_questions: ViewingQuestionsResponse | None,
    is_nl: bool,
) -> None:
    """Page 4: viewing checklist with mini risk strip for standalone tearout."""
    # Address
    pdf.set_font("Satoshi", "B", 11)
    pdf.set_text_color(*SLATE)
    pdf.cell(0, 6, address, new_x="LMARGIN", new_y="NEXT")
    pdf.ln(1)

    # Mini risk summary strip (4-col, compact)
    cells = _build_risk_cells(risks, sunlight_score, is_nl)
    grid_end_y = pdf.draw_risk_grid(
        x=pdf.l_margin, y=pdf.get_y(),
        width=pdf.w - pdf.l_margin - pdf.r_margin,
        cells=cells, cols=4,
    )
    pdf.set_y(grid_end_y + 2)

    # Instructional text
    pdf.set_font("Satoshi", "", 10)
    instruction = ("Controleer deze punten bij de bezichtiging." if is_nl
                   else "Check these items at your viewing.")
    pdf.cell(0, 6, instruction, new_x="LMARGIN", new_y="NEXT")
    pdf.ln(2)

    # Questions (no max limit)
    _draw_branded_questions(pdf, viewing_questions, is_nl, max_questions=None)


def _draw_methodology_page(pdf: BuurtCheckPDF, is_nl: bool) -> None:
    """Page 5: methodology, data sources, limitations, and note lines."""
    # Scoring methodology
    pdf.set_font("Satoshi", "B", 12)
    pdf.cell(0, 7,
             "Hoe we risico's scoren" if is_nl else "How we score risks",
             new_x="LMARGIN", new_y="NEXT")
    pdf.ln(1)

    pdf.set_font("Satoshi", "", 10)
    methodology = (
        "Alle risicoscores zijn genormaliseerd naar een schaal van 0-100, "
        "waarbij hoger beter is. Scores zijn gebaseerd op WHO Environmental "
        "Noise Guidelines (2018), WHO Global Air Quality Guidelines (2021), "
        "en Klimaateffectatlas overstromings-/hittemodellen. "
        "Zonlichtanalyse gebruikt ray-casting tegen 3D-gebouwgeometrie "
        "van 3DBAG. De winterzonnewende (slechtste geval) bepaalt de "
        "risicoclassificatie."
        if is_nl else
        "All risk scores are normalized to a 0\u2013100 scale where higher is "
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
        ("EP-Online", "Energielabels" if is_nl else "Energy labels"),
    ]
    for name, desc in sources:
        pdf.draw_indicator_row(name, desc)
    pdf.ln(3)

    # Limitations
    pdf.set_font("Satoshi", "B", 12)
    pdf.set_text_color(*AMBER_WARN)
    pdf.cell(0, 7,
             "Belangrijke beperkingen" if is_nl else "Important limitations",
             new_x="LMARGIN", new_y="NEXT")
    pdf.set_text_color(*SLATE)
    pdf.set_font("Satoshi", "", 10)
    limitations = (
        "Alle gegevens zijn indicatief en vervangen geen professionele "
        "bouwinspectie. Criminaliteitscijfers zijn per gemeente, niet per straat. "
        "Milieumetingen geven mogelijk geen micro-lokale omstandigheden weer."
        if is_nl else
        "All data is indicative and should not replace professional building "
        "inspection. Crime data is per municipality, not per street. "
        "Environmental measurements may not reflect micro-local conditions."
    )
    pdf.multi_cell(0, 5, limitations, new_x="LMARGIN", new_y="NEXT")
    pdf.ln(4)

    pdf.draw_divider("strong")

    # Notes section
    pdf.set_font("Satoshi", "B", 12)
    pdf.cell(0, 7,
             "Uw notities" if is_nl else "Your viewing notes",
             new_x="LMARGIN", new_y="NEXT")
    pdf.ln(2)

    # Ruled lines for handwriting
    pdf.set_draw_color(*BORDER)
    pdf.set_line_width(0.1)
    for _ in range(12):
        y = pdf.get_y()
        if y > pdf.h - 25:
            break
        pdf.line(pdf.l_margin, y, pdf.w - pdf.r_margin, y)
        pdf.ln(8)
```

**Step 3: Run all tests**

Run: `cd D:\buurt-check\backend && pytest tests/test_pdf_export.py -v`
Expected: All pass

**Step 4: Run ruff**

Run: `cd D:\buurt-check\backend && ruff check .`
Expected: Clean (fix any import order issues)

**Step 5: Commit**

```bash
git add backend/app/services/pdf_export.py backend/tests/test_pdf_export.py
git commit -m "feat(pdf): Full Dossier neighborhood intelligence, checklist with tearout strip, methodology"
```

---

## Task 7: Export Endpoint — Fetch Additional Data for Full Dossier

**Files:**
- Modify: `backend/app/api/address.py` (expand export endpoint)
- Test: `backend/tests/test_pdf_export.py`

**Step 1: Write test for endpoint fetching neighborhood + tier-b data**

```python
@pytest.mark.asyncio
@patch("app.api.address.cache_get", new_callable=AsyncMock, return_value=None)
@patch("app.api.address.cache_set", new_callable=AsyncMock)
@patch("app.api.address.bag")
@patch("app.api.address.risk_cards")
@patch("app.api.address.cbs")
@patch("app.api.address.tier_b")
async def test_export_full_dossier_fetches_extra_data(
    mock_tier_b, mock_cbs, mock_risk_cards, mock_bag,
    mock_cache_set, mock_cache_get, client
):
    """Full Dossier export fetches neighborhood stats and tier-b data."""
    from app.models.neighborhood import (
        AgeProfile, NeighborhoodIndicator, NeighborhoodStats,
        NeighborhoodStatsResponse, UrbanizationLevel,
    )
    from app.models.tier_b import CrimeStatsCard, EnergyLabelCard, TierBResponse

    mock_bag.get_building_facts = AsyncMock(
        return_value=BuildingFacts(
            pand_id="0363100012345678",
            construction_year=1920,
            intended_use_en=["Residential"],
        )
    )
    mock_risk_cards.get_risk_cards = AsyncMock(return_value=_make_risks())
    mock_cbs.get_neighborhood_stats = AsyncMock(
        return_value=NeighborhoodStatsResponse(
            address_id="0363010012345678",
            stats=NeighborhoodStats(
                buurt_code="BU03630001",
                buurt_name="Test Buurt",
                gemeente_name="Amsterdam",
                population_density=NeighborhoodIndicator(value=10000),
                avg_household_size=NeighborhoodIndicator(value=2.0),
                single_person_pct=NeighborhoodIndicator(value=50.0, unit="%"),
                age_profile=AgeProfile(age_0_24=25.0, age_25_64=55.0, age_65_plus=20.0),
                owner_occupied_pct=NeighborhoodIndicator(value=40.0, unit="%"),
                avg_property_value=NeighborhoodIndicator(value=350000, unit="\u20ac"),
                distance_to_train_km=NeighborhoodIndicator(value=0.5, unit="km"),
                distance_to_supermarket_km=NeighborhoodIndicator(value=0.3, unit="km"),
                urbanization=UrbanizationLevel.very_urban,
            ),
        )
    )
    mock_tier_b.get_tier_b_data = AsyncMock(
        return_value=TierBResponse(
            address_id="0363010012345678",
            energy_label=EnergyLabelCard(label="B"),
            crime=CrimeStatsCard(total_per_1000=10.0),
        )
    )

    resp = await client.get(
        "/api/address/0363010012345678/export",
        params={
            "rd_x": 121000, "rd_y": 487000, "lat": 52.37, "lng": 4.89,
            "address": "Teststraat 1, Amsterdam",
            "template": "full_dossier",
        },
    )
    assert resp.status_code == 200
    assert resp.content[:5] == b"%PDF-"
    # Verify extra data was fetched
    mock_cbs.get_neighborhood_stats.assert_called_once()
    mock_tier_b.get_tier_b_data.assert_called_once()
```

**Step 2: Update export endpoint in `address.py`**

In the `export_briefing()` function, after the existing viewing questions fetch, add:

```python
    # --- Additional data for Full Dossier ---
    neighborhood_stats = None
    tier_b_data = None
    risk_comparisons_data = None

    if template == "full_dossier":
        # Fetch neighborhood stats
        try:
            nb_resp = await cbs.get_neighborhood_stats(
                vbo_id=vbo_id, lat=lat, lng=lng,
            )
            neighborhood_stats = nb_resp.stats if nb_resp else None
        except Exception:
            logger.warning("Failed to fetch neighborhood stats for PDF export")

        # Fetch tier-b data
        try:
            tier_b_data = await tier_b.get_tier_b_data(
                vbo_id=vbo_id,
                buurt_code=neighborhood_stats.buurt_code if neighborhood_stats else None,
                postcode=None,
                house_number=None,
                house_letter=None,
                addition=None,
            )
        except Exception:
            logger.warning("Failed to fetch tier-b data for PDF export")

        # Build risk comparisons (synchronous, from existing data)
        if risks:
            urbanization = (neighborhood_stats.urbanization
                           if neighborhood_stats else UrbanizationLevel.unknown)
            risk_comparisons_data = build_risk_comparisons(
                vbo_id, risks, urbanization=urbanization,
            )

    if template == "full_dossier":
        pdf_bytes = generate_full_dossier(
            address=address,
            building_year=building_year,
            building_use=building_use,
            risks=risks,
            sunlight_score=sunlight_score,
            viewing_questions=viewing_qs,
            shadow_image_b64=shadow_image,
            language=language,
            neighborhood_stats=neighborhood_stats,
            tier_b=tier_b_data,
            risk_comparisons=risk_comparisons_data,
        )
    else:
        pdf_bytes = generate_quick_brief(
            # ... existing params unchanged ...
        )
```

Note: The endpoint also needs `postcode` and `huisnummer` query params for Tier B energy label lookups. Add them as optional params:

```python
    postcode: str | None = Query(None, description="Postcode for energy label lookup"),
    huisnummer: str | None = Query(None, description="House number for energy label lookup"),
```

And pass to `get_tier_b_data()`:
```python
            tier_b_data = await tier_b.get_tier_b_data(
                vbo_id=vbo_id,
                buurt_code=neighborhood_stats.buurt_code if neighborhood_stats else None,
                postcode=postcode,
                house_number=huisnummer,
                house_letter=None,
                addition=None,
            )
```

**Step 3: Run all tests**

Run: `cd D:\buurt-check\backend && pytest tests/test_pdf_export.py -v`
Expected: All pass

Run: `cd D:\buurt-check\backend && pytest -x -q -m "not live"`
Expected: All 293+ tests pass

**Step 4: Run ruff**

Run: `cd D:\buurt-check\backend && ruff check .`
Expected: Clean

**Step 5: Commit**

```bash
git add backend/app/api/address.py backend/tests/test_pdf_export.py
git commit -m "feat(pdf): export endpoint fetches neighborhood + tier-b data for Full Dossier"
```

---

## Task 8: Clean Up Old Code + Final Test Gate

**Files:**
- Modify: `backend/app/services/pdf_export.py` (remove legacy helpers)
- Modify: `backend/tests/test_pdf_export.py` (ensure all tests updated)

**Step 1: Remove old functions that are no longer used**

The old `_draw_header()`, `_draw_footer()`, `_draw_viewing_questions()` (the ones using bare `FPDF()`) should be removed if they were kept as compatibility shims. The old `_severity_label_nl()` / `_severity_label()` that took no `is_nl` param should be removed if replaced by the unified `_severity_label(score, is_nl)`.

Grep for any remaining references to old function names and remove dead code.

**Step 2: Run full test suite**

Run: `cd D:\buurt-check\backend && pytest -x -q -m "not live"`
Expected: 293+ tests pass (should be ~300+ with new tests)

**Step 3: Run ruff**

Run: `cd D:\buurt-check\backend && ruff check .`
Expected: Clean

**Step 4: Count tests to verify gate**

Run: `cd D:\buurt-check\backend && pytest --co -q -m "not live" 2>&1 | tail -3`
Expected: Count >= 293 (baseline) + ~10 new = 303+

**Step 5: Commit**

```bash
git add backend/app/services/pdf_export.py backend/tests/test_pdf_export.py
git commit -m "chore(pdf): remove legacy PDF helpers, finalize Polar Frost export"
```

---

## Task 9: Frontend — Pass postcode/huisnummer to Export Endpoint

**Files:**
- Modify: `frontend/src/services/api.ts` (add postcode/huisnummer to ExportOptions)
- Modify: `frontend/src/components/ExportBottomSheet.tsx` (pass postcode/huisnummer)

**Step 1: Add optional params to ExportOptions interface**

In `api.ts`, add to `ExportOptions`:
```typescript
  postcode?: string;
  huisnummer?: string;
```

In `exportBriefing()`, add these to the URLSearchParams:
```typescript
  if (options.postcode) params.set('postcode', options.postcode);
  if (options.huisnummer) params.set('huisnummer', options.huisnummer);
```

**Step 2: Pass postcode/huisnummer from ExportBottomSheet**

The `ExportBottomSheet` needs `postcode` and `huisnummer` props (from the resolved address). Add them to the props interface and pass through to `exportBriefing()`.

**Step 3: Run frontend build**

Run: `cd D:\buurt-check\frontend && npm run build`
Expected: Clean build

**Step 4: Run frontend tests**

Run: `cd D:\buurt-check\frontend && npx vitest run`
Expected: 347+ tests pass

**Step 5: Commit**

```bash
git add frontend/src/services/api.ts frontend/src/components/ExportBottomSheet.tsx
git commit -m "feat(pdf): pass postcode/huisnummer to export endpoint for energy label lookup"
```

---

## Task 10: Quality Gates + Final Verification

**Step 1: Backend quality gates**

Run: `cd D:\buurt-check\backend && ruff check .`
Expected: Clean

Run: `cd D:\buurt-check\backend && pytest -x -q -m "not live"`
Expected: 300+ tests pass (>= 293 baseline)

**Step 2: Frontend quality gates**

Run: `cd D:\buurt-check\frontend && npm run build`
Expected: Clean build

Run: `cd D:\buurt-check\frontend && npx vitest run`
Expected: 347+ tests pass

**Step 3: Manual verification**

Start backend + frontend, navigate to a known address, trigger PDF export for both templates. Verify:
- Satoshi font renders correctly
- Teal band appears on every page
- Score bars are proportional
- Comparison charts show correctly
- Quick Brief fits on 1 page
- Full Dossier has 5 pages with all sections
- Both EN and NL work

**Step 4: Final commit if any cleanup needed**

```bash
git add -A
git commit -m "chore: final PDF redesign quality gate verification"
```

---

## Summary

| Task | Description | Files | Est. Tests |
|------|------------|-------|-----------|
| 1 | Font conversion (.woff → .ttf) | scripts/, assets/ | 0 |
| 2 | BuurtCheckPDF foundation | pdf_export.py | +3 |
| 3 | Drawing primitives | pdf_export.py | +6 |
| 4 | Quick Brief redesign | pdf_export.py | +1 |
| 5 | Full Dossier cover + risk details | pdf_export.py | +2 |
| 6 | Neighborhood + checklist + methodology | pdf_export.py | 0 (covered by task 5) |
| 7 | Export endpoint enhancement | address.py | +1 |
| 8 | Clean up + test gate | pdf_export.py | 0 |
| 9 | Frontend postcode/huisnummer | api.ts, ExportBottomSheet | 0 |
| 10 | Quality gates | — | 0 |

**Total new tests: ~13.** Final backend count: ~306+ (baseline 293).
