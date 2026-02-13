# PDF Export Redesign - Implementation Plan v2

Date: 2026-02-13  
Owner: PDF Redesign workstream  
Status: Ready for implementation after preflight checks in Task 0

## Purpose
Redesign Quick Brief and Full Dossier PDF exports with Polar Frost brand identity while keeping the system robust for mobile usage, bilingual output, and graceful degradation.

This v2 plan replaces v1 and resolves the previously identified blockers:
- API contract mismatch (`huisnummer` vs `house_number`)
- Incomplete frontend threading (`App.tsx` missing in scope)
- Contradictory page-count claims vs variable-length checklist
- Export reliability/performance risk from large query-string payloads
- Weak smoke-only test strategy

## Input Documents
- `CLAUDE.md`
- `docs/ui-principles.md`
- `docs/plans/2026-02-13-pdf-redesign-design.md`

## Non-Negotiables (from UI principles)
1. `Briefing, not dashboard`: preserve curated information density; keep neighborhood indicators capped to 5-8.
2. `Consequences over data`: risk sections must keep the 4-part structure:
   - score + severity
   - what it means
   - what to ask/check at viewing
   - source + date
3. `Bilingual by default`: EN/NL copy parity and layout resilience.
4. `Failure-safe`: unavailable data must degrade per section/card, never crash export.
5. `PDF as standalone artifact`: each page is understandable when printed/shared independently.
6. `Performance is credibility`: avoid fragile large URL payloads for export.

## Scope

### In scope
- Backend PDF generator rewrite (`BuurtCheckPDF` + drawing primitives)
- Quick Brief redesign with hard 1-page behavior under stress
- Full Dossier redesign to 5+ pages (minimum 5; checklist can spill over)
- Export API contract hardening
- Frontend export payload wiring
- Tests for correctness, layout constraints, and graceful degradation

### Out of scope
- New data sources
- New product sections outside PDF
- Changes to risk scoring logic or 3D analysis logic

## Architecture Decisions

### A. Canonical export contract (breaking-risk removed)
- Canonical field names remain:
  - `buurt_code`, `postcode`, `house_number`, `house_letter`, `addition`
- Do not introduce Dutch param variants in API signatures.

### B. Export transport
- Add canonical POST endpoint for export payload:
  - `POST /api/address/{vbo_id}/export`
  - JSON body for export options, including optional `shadow_image_b64`
- Keep existing GET endpoint as compatibility shim for now:
  - existing clients keep working
  - frontend migrates to POST immediately
  - mark GET query `shadow_image` path as deprecated

Reason: large base64 query params are brittle on mobile/proxy/CDN paths and conflict with performance/reliability requirements.

### C. Page count policy (explicit, no contradictions)
- Quick Brief: strict `== 1` page requirement.
- Full Dossier: `>= 5` pages, with checklist overflow allowed.
- UI copy: Full Dossier metadata must read `5+ pages` (EN/NL).

## Data Flow Rules

### Export assembly
1. Building facts: cache-first
2. Risk cards: cache-first
3. Viewing questions: derived from risk cards
4. Full Dossier only:
   - Neighborhood stats: cache-first
   - Tier-B: cache-first
   - Risk comparisons: derived from risk cards + urbanization

### Performance rules
- For Full Dossier, fetch neighborhood and tier-b in parallel via `asyncio.gather`.
- On cache miss + successful service response, write back to cache using existing key formats.
- If request `buurt_code` is missing but neighborhood fetch returns one, use resolved `buurt_code` for Tier-B call.

## Task Plan

## Task 0 - Preflight (must pass before coding)
Files:
- `docs/plans/2026-02-13-pdf-redesign-implementation.md` (this file)

Actions:
1. Confirm current repo state and existing unrelated failures.
2. Record baseline commands and outcomes in PR notes before implementation starts.
3. Confirm fonts directory strategy (generated files committed to repo).

Exit criteria:
- Known baseline failures are documented and unchanged after implementation, or fixed in dedicated commits.

---

## Task 1 - Font conversion pipeline
Files:
- `backend/scripts/convert_fonts.py`
- `backend/app/assets/fonts/Satoshi-Regular.ttf`
- `backend/app/assets/fonts/Satoshi-Bold.ttf`
- `backend/app/assets/fonts/Satoshi-Black.ttf`
- `backend/app/assets/fonts/Satoshi-Medium.ttf`
- `backend/pyproject.toml`

Actions:
1. Keep/implement one-time converter script from frontend `.woff` fonts.
2. Ensure `fonttools` is in backend dev dependencies.
3. Generate and commit four TTF files to backend assets.

Exit criteria:
- All four font files exist and are tracked.
- PDF generator can load Satoshi families without fallback errors.

---

## Task 2 - Export API contract hardening (POST + compatibility GET)
Files:
- `backend/app/api/address.py`
- `backend/app/models/` (if new request model file is introduced)
- `backend/tests/test_pdf_export.py`

Actions:
1. Add `POST /api/address/{vbo_id}/export` with JSON body fields:
   - required: `rd_x`, `rd_y`, `lat`, `lng`, `address`
   - optional: `template`, `language`, `shadow_image_b64`, `street`, `city`,
     `buurt_code`, `postcode`, `house_number`, `house_letter`, `addition`
2. Keep GET endpoint for compatibility:
   - GET delegates to shared export assembly/generation path
3. Enforce canonical English field names only.

Exit criteria:
- POST works end-to-end.
- GET remains functional for backward compatibility.
- No field-name mismatch between backend and frontend contracts.

---

## Task 3 - BuurtCheckPDF foundation and primitives
Files:
- `backend/app/services/pdf_export.py`
- `backend/tests/test_pdf_export.py`

Actions:
1. Implement `BuurtCheckPDF(FPDF)`:
   - Satoshi registration
   - 6mm teal top band
   - branded footer with disclaimer + page number
2. Implement primitives:
   - `draw_score_bar`
   - `draw_checkbox`
   - `draw_comparison_chart`
   - `draw_risk_grid`
   - `draw_energy_badge`
   - `draw_age_bars`
   - `draw_section_label`
   - `draw_divider`
   - `draw_indicator_row`

Exit criteria:
- Primitive methods render without exceptions.
- Header/footer are applied consistently on all pages.

---

## Task 4 - Quick Brief redesign with hard one-page guard
Files:
- `backend/app/services/pdf_export.py`
- `backend/tests/test_pdf_export.py`

Actions:
1. Redesign Quick Brief layout:
   - address/facts block
   - optional shadow image
   - 2x2 risk grid
   - viewing questions
2. Keep `_build_risk_cells` always returning 4 cells (including unavailable placeholders).
3. Add `floor_area` support in display facts.
4. Add one-page guard:
   - dynamically limit rendered checklist content based on remaining space
   - if clipped, append short note directing to Full Dossier for full checklist

Exit criteria:
- Quick Brief always renders as exactly one page in stress test.
- Risk grid remains 4 cells even with `risks=None`.

---

## Task 5 - Full Dossier redesign (5+ pages)
Files:
- `backend/app/services/pdf_export.py`
- `backend/tests/test_pdf_export.py`

Actions:
1. Implement pages:
   - Page 1 cover + summary
   - Page 2 risk details + comparisons
   - Page 3 neighborhood + Tier-B
   - Page 4 checklist tearout
   - Page 5 methodology + notes
2. Keep checklist overflow behavior for long content.
3. Include address context on risk details page.
4. Use source-date fallback text when dataset date is unknown.

Exit criteria:
- Full Dossier has minimum 5 pages.
- Additional pages appear only when checklist overflows.

---

## Task 6 - Full Dossier data assembly and performance
Files:
- `backend/app/api/address.py`
- `backend/tests/test_pdf_export.py`

Actions:
1. Full Dossier branch fetches neighborhood and tier-b with `asyncio.gather`.
2. Cache-first for neighborhood and tier-b using existing key formats.
3. Write back to cache on successful miss fetch.
4. Resolve Tier-B `buurt_code` fallback:
   - use request `buurt_code` if present
   - otherwise use neighborhood stats `buurt_code` when available
5. Build risk comparisons from risks + resolved urbanization.

Exit criteria:
- No sequential network dependency between neighborhood and tier-b fetches.
- Cache hit path avoids external calls.

---

## Task 7 - Frontend wiring and copy updates
Files:
- `frontend/src/services/api.ts`
- `frontend/src/components/ExportBottomSheet.tsx`
- `frontend/src/App.tsx`
- `frontend/src/i18n/en.json`
- `frontend/src/i18n/nl.json`
- frontend tests touching export flow

Actions:
1. Add export fields to `ExportOptions`:
   - `buurtCode`, `postcode`, `houseNumber`, `houseLetter`, `addition`
2. Thread values:
   - `App.tsx` -> `ExportBottomSheet` props -> API call
3. Switch export request to POST payload.
4. Update Full Dossier metadata copy:
   - EN: `5+ pages`
   - NL: `5+ pagina's`

Exit criteria:
- Export request carries all address identity fields.
- UI copy matches page-count policy.

---

## Task 8 - Test strategy upgrade (content-aware, not smoke-only)
Files:
- `backend/tests/test_pdf_export.py`
- optional dev deps in `backend/pyproject.toml` (if adding PDF parser helper)
- frontend export tests

Actions:
1. Keep existing smoke tests.
2. Add robust assertions for:
   - Quick Brief page count `== 1` under stress
   - Full Dossier page count `>= 5`
   - 4-cell grid invariant when risks missing
   - endpoint propagation of `house_number/house_letter/addition/buurt_code`
   - graceful degradation when neighborhood/tier-b unavailable
3. Prefer parser-based page-count verification over brittle plain byte-text checks.

Exit criteria:
- Tests catch regressions in layout constraints and contract wiring.

---

## Task 9 - Quality gates and manual verification
Required commands:
- Backend:
  - `ruff check .`
  - `pytest -q tests/test_pdf_export.py`
  - `pytest -q -m "not live"` (or documented baseline comparison if unrelated failures pre-exist)
- Frontend:
  - `npm run build`
  - `npx vitest run` (or documented baseline comparison if unrelated failures pre-exist)

Manual checks:
1. Quick Brief prints as 1 page with long address + long questions.
2. Full Dossier exports as 5+ pages.
3. EN and NL exports have no truncation in key headings/facts.
4. Each risk block preserves 4-part hierarchy.
5. Missing data appears as unavailable per section, not as crash.
6. Export works on mobile network conditions without URL-length failures.

Exit criteria:
- All required checks pass or have explicit unchanged-baseline exceptions.

## Definition of Done
1. Contract consistency: canonical export fields across backend and frontend.
2. Reliability: POST export path used by frontend; GET compatibility retained.
3. UX integrity: Quick Brief 1 page; Full Dossier 5+ pages; bilingual consistency.
4. Principle alignment: curated density, consequence-first risk communication, failure-safe behavior, standalone print artifact.
5. Verification: upgraded tests and quality gates completed.

## Commit strategy
- Use explicit file adds only; do not use `git add -A`.
- Suggested commit sequence:
1. `chore(pdf): add satoshi ttf assets and conversion script`
2. `feat(pdf): add post export contract and shared export assembly`
3. `feat(pdf): rewrite pdf generator with buurtcheck branding and primitives`
4. `feat(pdf): implement quick brief one-page guard and full dossier sections`
5. `feat(pdf): wire export identity fields through frontend and update copy`
6. `test(pdf): add page-count and contract regression coverage`
7. `chore(pdf): run quality gates and finalize docs`
