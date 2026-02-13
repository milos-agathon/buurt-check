# PDF Export Redesign: Polar Frost Print Identity

**Date:** 2026-02-13
**Status:** Approved
**Approach:** Full Polar Frost Print System (fpdf2 + Satoshi TTF + custom drawing)

## Problem Statement

The current PDF exports (Quick Brief + Full Dossier) use Helvetica with basic bordered tables, zero color, and no brand identity. They look like generic enterprise reports, undermining the trust the Polar Frost app carefully builds. The PDF is the only artifact that enters the physical world -- users print it, carry it to viewings, share it with makelaars and partners. It must embody the brand.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Font | Satoshi TTF embedded | Core brand identity. Convert woff2 to TTF for fpdf2. |
| Metaphor | Intelligence briefing | Aligns with PRD: "Intelligence briefing prepared by a trusted advisor." |
| Data scope | Full intelligence | Risks + neighborhood + Tier B (energy + crime) + comparisons. |
| Visual richness | Score bars + comparison charts | fpdf2 rect() drawing primitives. Maximum visual impact. |
| Library | fpdf2 (stay) | Pure Python, zero system deps. Drawing primitives sufficient. |

## Brand System (Shared Elements)

### Page Header (every page)
- **Top 6mm:** Solid Arctic Teal (`#2EC4B6`) band, full width to margins
- **Below band:** "buurt-check" in Satoshi Black 9pt, Polar Slate (`#1C2D3F`), left-aligned
- **Right-aligned:** Page section title in Satoshi Regular 9pt, `#8A9BB0`
- **Thin 0.3pt rule** below header in `#E2E7ED`

### Page Footer (every page)
- **Left:** "buurt-check" in Satoshi Regular 7pt, `#8A9BB0`
- **Center:** Disclaimer "Data is indicative. Verify on-site."
- **Right:** Page number "p. X"
- **Thin 0.3pt rule** above footer

### Score Bar Component
- **Track:** Full width, 3pt height, `#E2E7ED`
- **Fill:** Proportional width, 3pt height, severity color
- **Score number:** Satoshi Black (28pt large / 16pt small), severity color

### Severity Colors (from palette.md)
| Level | Score Range | Color | Hex |
|-------|------------|-------|-----|
| Good | 70-100 | Green | `#22C55E` |
| Moderate | 40-69 | Amber | `#EAB308` |
| Poor | 20-39 | Coral | `#EF4444` |
| Critical | 0-19 | Crimson | `#B91C1C` |
| Unavailable | N/A | Muted | `#8A9BB0` |

### Typography Scale
| Style | Font | Size | Usage |
|-------|------|------|-------|
| Display | Satoshi Black | 22pt | Page titles, address on cover |
| H1 | Satoshi Bold | 16pt | Section headers |
| H2 | Satoshi Bold | 12pt | Subsection headers |
| Body | Satoshi Regular | 10pt | Main text |
| Body-friendly | Satoshi Regular | 10pt, 26pt line-height | Risk explanations |
| Caption | Satoshi Regular | 8pt | Sources, footnotes |
| Label | Satoshi Medium | 8pt, uppercase, 0.04em tracking | Category labels |

## Quick Brief (1 Page)

A grab-and-go document for buyers heading to a viewing. Everything scannable in 30 seconds.

### Layout (top to bottom)
1. **Brand header** -- teal band + "buurt-check" + "VIEWING BRIEF"
2. **Address block** -- street + number (Satoshi Black 18pt), postcode + city (10pt muted), building facts (9pt, `#8A9BB0`)
3. **Shadow snapshot** -- 170mm wide, 0.5pt `#E2E7ED` border, caption "Winter solstice, 12:00" in 7pt italic below. Omitted if no shadow data.
4. **Risk assessment 2x2 grid** -- 4 cells, each containing: category label (8pt uppercase), score number (28pt Black in severity color), score bar (3pt), severity word (9pt in severity color). 4mm gap between cells.
5. **Top viewing questions** -- max 6-8 questions grouped by category. Category headers with severity-colored dot. Drawn checkboxes (3x3mm empty rect). Questions in 9pt Regular.
6. **Footer** -- generation date, sources, disclaimer.

### Data Required
- `address`, `building_year`, `building_use`, `floor_area` (existing)
- `risks: RiskCardsResponse` (existing)
- `sunlight_score: int | None` (existing)
- `viewing_questions: ViewingQuestionsResponse` (existing)
- `shadow_image_b64: str | None` (existing)
- `language: str` (existing)

No new data sources needed for Quick Brief.

## Full Dossier (5 Pages)

A comprehensive property intelligence document. The single source of truth for everything the app revealed.

### Page 1: Cover + Summary
1. **Brand header** -- teal band (8mm, thicker for cover) + "buurt-check" + "PROPERTY INTELLIGENCE DOSSIER"
2. **Address hero** -- Satoshi Black 22pt (Display), postcode + city below, building facts
3. **Shadow snapshot** -- larger (170x80mm), bordered, captioned
4. **Risk summary strip** -- 4-column horizontal layout: category label + score (22pt Black, severity color) + mini score bar + severity word. Compact, scannable.
5. **Prepared date** -- "Prepared: 13 February 2026" in 9pt

### Page 2: Risk Details
For each of 4 risk categories (Noise, Air, Climate, Sunlight):
1. **Category header** -- 3pt teal left border accent, category name (H1), score number (right-aligned, severity color)
2. **Score bar** -- full width, 3pt, severity color fill
3. **"What this means"** -- body-friendly text (10pt, 26pt line height). Plain-language explanation from risk card summary.
4. **"How it compares"** chart -- 4 horizontal bars:
   - This address: teal fill (`#2EC4B6`)
   - City average: silver fill (`#8A9BB0`)
   - Netherlands: light gray fill (`#E2E7ED`)
   - WHO/EU guideline: dashed amber (`#EAB308`)
   - Each bar: label (10pt, 120px) | fill rect (proportional) | score (10pt Bold, right)
5. **Source attribution** -- "Source: RIVM" + "Dataset: 2024-01-15" in 8pt caption

If 4 categories don't fit one page, overflow to next page (fpdf2 auto page break).

### Page 3: Neighborhood Intelligence
1. **Buurt name** -- Satoshi Bold 16pt + "Amsterdam, Very Urban" subtitle
2. **People section** -- Population density, avg household size, single-person % as two-column rows (label left, value right, 10pt)
3. **Age distribution** -- 3 horizontal bars (0-24, 25-64, 65+) with teal fill on `#E2E7ED` track, right-aligned percentage
4. **Housing section** -- Owner-occupied %, avg property value
5. **Access section** -- Train station distance, supermarket distance
6. **CBS source citation** -- 8pt caption
7. **Divider** -- stronger than section dividers
8. **Energy & Safety section:**
   - Energy label: colored badge (A=green through G=crimson) + description
   - Crime rate: bold number + "per 1,000 residents" + sub-metrics (burglary, violent)
   - Crime disclaimer in 8pt italic
   - Sources: EP-Online, CBS OData

Unavailable indicators show "--" with muted explanation text.

### Page 4: Viewing Checklist
1. **Address + mini risk strip** -- compact 4-column risk summary (same as cover but smaller) so page works as standalone tearout
2. **Instructional text** -- "Check these items at your viewing."
3. **Question categories** -- each with:
   - 3pt left border in category's severity color
   - Category name in severity color (8pt Label style)
   - Drawn checkboxes (3x3mm empty rect, 0.3pt stroke)
   - Question text in 10pt Regular, wrapped, indented from checkbox
   - Data-driven questions (referencing actual dB values, concentrations) when available
4. **No max question limit** -- flows to additional pages if needed
5. **Categories:** Noise, Air Quality, Climate, Sunlight, General

### Page 5: Methodology + Notes
1. **"How we score risks"** -- 2-3 paragraphs explaining 0-100 scale, WHO references, sunlight ray-casting, winter solstice worst-case
2. **Data sources table** -- two-column: source name | what it provides
3. **"Important limitations"** -- header in amber (`#EAB308`), honest limitations paragraph
4. **Divider**
5. **"Your viewing notes"** -- ruled lines (0.2pt, `#E2E7ED`, 8mm spacing, ~12 lines) for handwriting
6. **Final footer** -- includes buurt-check.nl URL

### New Data Required for Full Dossier
The export endpoint must additionally fetch:
- `neighborhood_stats: NeighborhoodStats | None` -- CBS data (already cached)
- `tier_b: TierBResponse | None` -- energy label + crime (already cached)
- `risk_comparisons: RiskComparisonsResponse | None` -- for comparison charts (already cached)
- `buurt_name: str | None` -- from neighborhood stats
- `urbanization_level: int | None` -- from neighborhood stats

All data already exists in the backend and is cached. The export endpoint just needs to fetch it.

## Technical Implementation

### Font Embedding
- Convert `Satoshi-Variable.woff2` to TTF (use fonttools or online converter)
- Need 3 weights: Regular (400), Bold (700), Black (900)
- If Satoshi Variable TTF not available, use static weight TTF files
- Store in `backend/app/assets/fonts/` (or similar)
- Register via `pdf.add_font("Satoshi", "", "path/to/Satoshi-Regular.ttf", uni=True)`
- fpdf2 with TTF supports full Unicode -- `_sanitize()` may be relaxable

### Drawing Primitives Used
- `pdf.rect(x, y, w, h, style='F')` -- filled rectangles for score bars, teal band, checkboxes
- `pdf.rect(x, y, w, h, style='D')` -- empty rectangles for checkboxes
- `pdf.line(x1, y1, x2, y2)` -- dividers, ruled note lines
- `pdf.set_fill_color(r, g, b)` -- severity colors, teal accent
- `pdf.set_draw_color(r, g, b)` -- borders, dividers
- `pdf.set_text_color(r, g, b)` -- severity-colored scores
- `pdf.set_line_width(w)` -- varying line weights
- `pdf.dashed_line()` -- WHO/EU reference in comparison charts (fpdf2 supports this)

### BuurtCheckPDF Subclass
```python
class BuurtCheckPDF(FPDF):
    """Custom PDF with Polar Frost branding."""

    def __init__(self, language: str = "en"):
        super().__init__()
        self.language = language
        self._register_fonts()

    def _register_fonts(self):
        """Register Satoshi font weights."""
        # ... add_font calls

    def header(self):
        """Teal band + brand name + section title."""
        # ... consistent header on every page

    def footer(self):
        """Brand + disclaimer + page number."""
        # ... consistent footer on every page

    def draw_score_bar(self, x, y, width, score, severity_color):
        """Draw a horizontal score bar with fill."""
        # ... rect primitives

    def draw_comparison_chart(self, x, y, width, rows):
        """Draw horizontal comparison bars (address/city/NL/WHO)."""
        # ... labeled bars with different fills

    def draw_checkbox(self, x, y, size=3):
        """Draw an empty checkbox square."""
        # ... rect primitive

    def draw_risk_grid(self, risks, sunlight_score, cols=2):
        """Draw 2x2 or 4x1 risk summary grid."""
        # ... compound of score_bar + text

    def draw_age_bars(self, age_data):
        """Draw age distribution horizontal bars."""
        # ... teal fill on gray track

    def draw_energy_badge(self, label, x, y):
        """Draw colored energy label badge."""
        # ... colored rect + white text
```

### Export Endpoint Changes
The `GET /{vbo_id}/export` endpoint needs to:
1. Keep existing data fetching (building facts, risks, viewing questions)
2. Add conditional fetching for Full Dossier:
   - `get_neighborhood_stats()` (from cache or fresh)
   - `get_tier_b_data()` (from cache or fresh)
   - `get_risk_comparisons()` (from cache or fresh)
3. Pass additional data to `generate_full_dossier()`

### Backward Compatibility
- Quick Brief signature gains optional `floor_area` param (defaults to None)
- Full Dossier signature expands with optional `neighborhood_stats`, `tier_b`, `risk_comparisons` params (all default to None, graceful degradation if missing)
- Frontend `ExportOptions` type unchanged (backend fetches new data server-side)
- No breaking changes to the API contract

## Test Strategy

### Backend Tests
- Verify Quick Brief generates valid PDF with new visual elements
- Verify Full Dossier generates 5 pages with all sections
- Verify Satoshi font embedding (check PDF metadata)
- Verify severity colors in score bars (check rect drawing calls via mock)
- Verify graceful degradation when neighborhood/tier-b/comparisons unavailable
- Verify both EN and NL content
- Test comparison chart drawing with edge cases (all scores equal, score=0, score=100)
- Test energy label badge for all labels A-G
- Test unavailable indicators render as "--"
- Maintain backend test count >= 288

### Manual Verification
- Generate sample PDFs for Amsterdam address with full data
- Print at 100% scale, verify readability
- Verify Satoshi renders correctly across PDF viewers (Adobe, Chrome, Preview)
- Verify score bars are proportional
- Verify severity colors are distinguishable in print (grayscale fallback?)
- Check 1-page Quick Brief actually fits on 1 page with max data

## File Changes

### New Files
- `backend/app/assets/fonts/Satoshi-Regular.ttf`
- `backend/app/assets/fonts/Satoshi-Bold.ttf`
- `backend/app/assets/fonts/Satoshi-Black.ttf`

### Modified Files
- `backend/app/services/pdf_export.py` -- Complete rewrite with BuurtCheckPDF class
- `backend/app/api/address.py` -- Export endpoint fetches additional data for Full Dossier
- `backend/tests/test_pdf_export.py` -- Expanded tests for new visual elements

### Unchanged
- Frontend ExportBottomSheet (no changes needed)
- Frontend API client (no changes needed)
- Backend models (no changes needed)

## Success Criteria

1. **Brand consistency:** PDF is immediately recognizable as buurt-check (teal band, Satoshi font, severity colors)
2. **Information completeness:** Full Dossier contains all data from the app (risks, neighborhood, energy, crime, comparisons)
3. **Print quality:** Readable at 100% print scale, severity colors distinguishable, score bars proportional
4. **One-page constraint:** Quick Brief fits on exactly 1 page with maximum data
5. **Standalone tearout:** Viewing checklist page (p.4) works without other pages (has address + risk summary)
6. **Test gates:** Backend tests >= 288, no regressions
7. **Graceful degradation:** PDF generates even if some data sources unavailable
8. **Bilingual:** Full EN/NL support on all pages
