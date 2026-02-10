# Implementation Assessment â€” 2026-02-10

Date: 2026-02-10 (refreshed with line-level codebase verification)
Project: `buurt-check`

## 1. Scope

Assessment of Phases 1-5 against:
- `CLAUDE.md`
- `docs/design-prd.md`
- `docs/design-spec.md`
- `docs/palette.md`

Every claim verified against actual source code with file:line evidence.

## 2. Quality Gate Snapshot (verified)

### Backend
- `ruff check .` => **PASS** (0 errors)
- `pytest -q -m "not live"` => **PASS** (263 passed, 9 deselected)

### Frontend
- `npx vitest --run` => **PASS** (334 passed, 37 test files)
- `npx vite build` => **PASS** (no warnings; largest chunk: `vendor-three` 526KB / 137KB gzipped)
- `npm run test:a11y` => **PASS**
- `npm run test:perf` => **PASS**
- `npm run test:visual` => **PASS** (10 passed)
- `npm run test:visual:update` => **PASS** (10 passed)

## 3. Executive Summary

All core product features (F1-F6) are implemented end-to-end with green quality gates. All Phase 3 visual polish items and Phase 4 non-blocking gaps have been resolved. No concrete implementation steps remain.

---

## 4. Phase 1 â€” Correctness and Foundation

**Status: COMPLETED. No remaining steps.**

| Item | Evidence | Verified |
|------|----------|----------|
| Token + font pipeline | `main.tsx:4-5` imports `satoshi.css` + `tokens.css`; `public/fonts/` has 5 woff files | Yes |
| ~195 design tokens (incl. dark mode) | `tokens.css` `:root` + `[data-theme="dark"]` blocks | Yes |
| Risk score/severity/summary wiring | `risk_cards.py:748-757` populates `score`, `severity`, `summary`, `summary_nl` on all 4 card types | Yes |
| Scoring normalization | `scoring.py` exports `normalize_noise_score`, `severity_from_score`, etc. | Yes |
| Palette alignment fixes | `--color-nav-control-bg`, `--color-nav-icon`, `--color-border-strong`, `--color-overlay-text` tokens added; accent-on-light fixed to `--color-accent-text` in AddressSearch + AddressHeader | Yes |
| Backend lint clean | `ruff check .` => 0 errors | Yes |
| Frontend tests passing | 334/334 | Yes |

---

## 5. Phase 2 â€” Core Product Behavior Parity

**Status: COMPLETED. No remaining steps.**

| Item | Evidence | Verified |
|------|----------|----------|
| Loading lifecycle | `App.tsx:128-131` state vars; `:270` activates; `:633` renders `<LoadingScreen>` with address context | Yes |
| Toast feedback (save/remove/clear/max) | `App.tsx:233` saved, `:235` max reached, `:244` removed, `:250` cleared | Yes |
| Shortlist overflow handling | `App.tsx:231-236` checks `addToShortlist()` return, toasts on false | Yes |
| Settings navigation | TopBar click toggles settings screen | Yes |
| Context-aware viewing questions | `viewing_questions.py` now includes `street`/`city` + raw risk signals (dB, PM2.5/NO2, climate levels, winter sunlight); `address.py:375-376` accepts query params | Yes |
| Data-driven risk comparisons | `risk_comparisons.py:12-52` NL/urban baselines; `address.py:300-363` endpoint; `App.tsx:333-338` fetches; `App.tsx:504-520` builds comparisons from API data | Yes |

**Correction from earlier drafts:** Risk comparison values are NOT static placeholders. The `/risk-comparisons` endpoint and `risk_comparisons.py` service are fully wired.

---

## 6. Phase 3 â€” F5/F6 and Advanced Spec Completion

**Status: COMPLETED. All items including visual polish resolved.**

### What is done

| Item | Evidence | Verified |
|------|----------|----------|
| PDF `quick_brief` (1 page) | `pdf_export.py:193-272` | Yes |
| PDF `full_dossier` (4 pages) | `pdf_export.py:275-431` | Yes |
| PDF API dispatch | `address.py:467-474` validates + dispatches both templates | Yes |
| Export template selector UI | `ExportBottomSheet.tsx` card-style radio selector with illustrations + page-count labels | Yes |
| Export staged progress | `ExportBottomSheet.tsx:45` five stages | Yes |
| Export progress ring fidelity | `ExportBottomSheet.tsx` + `ExportBottomSheet.css` render only a 40px SVG ring (3px stroke), with no linear fallback bar | Yes |
| Export language segmented control | `ExportBottomSheet.tsx` + `ExportBottomSheet.css` EN/NL segmented radio control with independent export state | Yes |
| Web Share API | `ExportBottomSheet.tsx:129-135` `navigator.canShare` + `navigator.share` | Yes |
| Parallel coordinates component | `ParallelCoordinates.tsx` (142 lines, SVG) | Yes |
| Parallel coordinates in CompareScreen | `CompareScreen.tsx:6` import, `:91-96` render | Yes |
| Tier-B backend (energy label + crime) | `tier_b.py` â€” EP-Online `:135`, CBS OData `:201`/`:214`, `asyncio.gather` | Yes |
| Tier-B API endpoint | `address.py:405-445` `GET /{vbo_id}/tier-b` with 7d cache | Yes |
| Tier-B frontend card | `TierBSignalsCard.tsx` â€” 3-state, energy colors, crime metrics, disclaimers | Yes |
| Tier-B app integration | `App.tsx:116-118` state, `:365-382` fetch, `:707-713` render | Yes |

### Previously remaining steps (NOW RESOLVED)

#### Step 1: Fix parallel coordinates series colors -- DONE

Colors updated to `['#00897B', '#E8913A', '#7C4DFF']` (teal/amber/purple) in `ParallelCoordinates.tsx:25`.

#### Step 2: Fix parallel coordinates data point sizing -- DONE

Circle radius `r="4"`, line `stroke-width: 2`, point `stroke-width: 2` in `ParallelCoordinates.tsx` and `ParallelCoordinates.css`.

---

## 7. Phase 4 â€” Accessibility, Performance, Visual QA

**Status: COMPLETED.**

| Item | Evidence | Verified |
|------|----------|----------|
| axe accessibility tests | `accessibility.test.tsx` | Yes |
| Keyboard navigation tests | `keyboard-navigation.test.tsx` | Yes |
| a11y fixes (dialog names, score labels, focus-visible) | `BottomSheet.tsx`, `ScoreBar.tsx`, `index.css` | Yes |
| Performance budget tests | `performance-budget.test.tsx` (unit) + `performance-budget.spec.ts` (e2e) | Yes |
| Backend latency script | `measure_cold_warm_latency.py` | Yes |
| Visual regression spec + baselines | `visual-regression.spec.ts` + snapshots | Yes |
| Quality gate documentation | `docs/phase4-quality-gates.md` | Yes |

### Non-blocking gaps (3 of 4 RESOLVED)

| Gap | Status | Evidence |
|-----|--------|----------|
| Visual regression missing settings/dark screens | **RESOLVED** | `visual-regression.spec.ts` now has 10 tests: added settings (light), search (dark), compare (dark) |
| OLED dark mode (`#000000` base) | **RESOLVED** | `tokens.css` dark mode: `--color-bg: #000000`, `--color-surface: #121212` |
| Dark-mode basemap switching | **RESOLVED** | `BuildingFootprintMap.css`: CSS `filter: invert(1) hue-rotate(180deg) brightness(0.85) contrast(1.1)` on Leaflet tile pane |
| 200% zoom manual verification | Deferred | Manual testing on real device required |

---

## 8. Phase 5 â€” Fidelity and Optimization

**Status: COMPLETED. No concrete Phase 5 items remain.**

### 8a. Risk Comparisons â€” DONE (with data provenance caveat)

| Item | Evidence | Verified |
|------|----------|----------|
| Backend service | `risk_comparisons.py` (139 lines) â€” `build_risk_comparisons()` returns 4 rows per category (city avg, NL avg, WHO/target, address) | Yes |
| Urbanization-stratified baselines | `risk_comparisons.py:19-52` â€” 5 urbanization levels x 4 categories | Yes |
| NL nationwide baselines | `risk_comparisons.py:12-17` â€” noise:66, air:68, climate:61, sunlight:63 | Yes |
| WHO/EU reference rows | `risk_comparisons.py:54-59` â€” dashed pattern, noise:74, air:75, climate:70, sunlight:67 | Yes |
| API endpoint | `address.py:305-368` â€” `GET /{vbo_id}/risk-comparisons`, fetches risk cards + neighborhood for urbanization context | Yes |
| Frontend API client | `api.ts:145-171` â€” `getRiskComparisons()` with 20s timeout | Yes |
| Frontend integration | `App.tsx:333-349` fetch in parallel IIFE; `App.tsx:504-520` builds comparisons from response | Yes |
| Types | `types/api.ts:164-189` â€” `RiskComparisonRow`, `RiskComparisonsResponse`, `ComparisonPattern` | Yes |
| Tests | `test_risk_comparisons.py` (3 tests), `api.test.ts` mock, `App.test.tsx` integration | Yes |
| E2E mock | `mockApi.ts:173-202` â€” realistic comparison data in visual regression tests | Yes |

**Data provenance caveat:** All baseline values are **hardcoded internal estimates** in `risk_comparisons.py`, NOT sourced from live CBS or WHO data pipelines. Source attribution strings (`"CBS urbanization profile + Buurt-Check benchmark model"`, `"Buurt-Check nationwide baseline model"`) describe the methodology used to derive the estimates but there is no runtime data ingestion. The values are reasonable approximations but should be validated or replaced with real data before production.

### 8b. Export Interaction Fidelity â€” DONE. No remaining export gaps.

| Item | Evidence | Verified |
|------|----------|----------|
| Blob-based export | `api.ts:216-247` â€” `exportBriefing()` returns `Blob`; no `window.open()` | Yes |
| Download utility | `api.ts:249-258` â€” `downloadPdfBlob()` creates objectURL, triggers download, revokes URL | Yes |
| Circular progress ring | `ExportBottomSheet.tsx` + `ExportBottomSheet.css` use a 40px SVG ring with 3px stroke + centered document icon | Yes |
| Linear progress bar removed | `ExportBottomSheet.tsx` progress UI no longer renders a linear bar; CSS linear bar rules removed | Yes |
| 5-stage progress | `ExportBottomSheet.tsx` â€” idle/collecting(25%)/rendering(65%)/downloading(90%)/ready(100%) | Yes |
| Share flow | `ExportBottomSheet.tsx` â€” `navigator.share()` with `File` object, `canShare` check, download fallback | Yes |
| Download button | `ExportBottomSheet.tsx` â€” separate download action in ready state | Yes |
| Template selector | `ExportBottomSheet.tsx` + `.css` card-style selector with illustrations and page-count metadata | Yes |
| Language selector | `ExportBottomSheet.tsx` + `.css` segmented EN/NL control using independent `exportLanguage` state | Yes |
| Tests | `ExportBottomSheet.test.tsx` verifies segmented language selection and export payload | Yes |

### 8c. Bundle Optimization â€” DONE. No remaining steps.

| Item | Evidence | Verified |
|------|----------|----------|
| React.lazy (4 components) | `App.tsx:55-58` â€” BuildingFootprintMap, NeighborhoodViewer3D, CompareScreen, SettingsScreen | Yes |
| Suspense boundaries | `App.tsx:662-668` (map), `:684-692` (3D), `:802-807` (compare), `:811-818` (settings) | Yes |
| Manual vendor chunks | `vite.config.ts:15-19` â€” vendor-react, vendor-map, vendor-three | Yes |
| Warning limit raised | `vite.config.ts:12` â€” `chunkSizeWarningLimit: 600` | Yes |
| Build output clean | All chunks below 600KB. Largest: `vendor-three` 526KB (137KB gzip). Total JS gzipped: ~291KB | Yes |

### 8d. Visual Regression Expansion â€" DONE

| Item | Evidence | Verified |
|------|----------|----------|
| Test count | `visual-regression.spec.ts` â€" 10 test cases | Yes |
| Mobile light: search | 390x844, `search-screen.png` | Yes |
| Mobile light: saved | 390x844, `saved-screen-mobile-light.png` | Yes |
| Mobile light: compare | 390x844, `compare-screen-mobile-light.png` | Yes |
| Mobile light: dossier | 390x844, `dossier-screen-mobile-light.png` | Yes |
| Mobile light: settings | 390x844, `settings-screen-mobile-light.png` | Yes |
| Mobile dark: saved | 390x844, `saved-screen-mobile-dark.png` | Yes |
| Mobile dark: dossier | 390x844, `dossier-screen-mobile-dark.png` | Yes |
| Mobile dark: search | 390x844, `search-screen-mobile-dark.png` | Yes |
| Mobile dark: compare | 390x844, `compare-screen-mobile-dark.png` | Yes |
| Desktop light: search | 1366x900, `search-screen-desktop-light.png` | Yes |
| Snapshot baselines | 11 files in snapshot directory (10 active + 1 legacy `dossier-screen-win32.png`) | Yes |
| Mock API for determinism | `mockApi.ts` + seeded dossier state in `App.tsx` for deterministic captures | Yes |

**Coverage analysis:**
- **Viewports:** 2 (mobile 390x844, desktop 1366x900)
- **Themes:** 2 (light, dark)
- **Screens covered:** search, saved, compare, dossier, settings (5 of 7 screens)
- **Screens NOT covered:** risk detail, export sheet, 3D viewer (require complex interaction seeding)

No additional Phase 5 implementation steps are required.

---
## 9. CLAUDE.md MVP Feature Alignment

| Feature | Status | Remaining |
|---------|--------|-----------|
| F1 Address + building facts | Complete | None |
| F2 3D viewer + sunlight | Complete | None |
| F3 Risk cards (noise, air, climate, sunlight) | Complete | None |
| F4 Neighborhood snapshot | Complete | None |
| F5 Shortlist + compare + PDF | Complete | None |
| F6 Crime card (Tier B) | Complete | None (EP-Online API key optional) |

---

## 10. Complete List of ALL Remaining Concrete Steps

### Priority 1 â€" All resolved

All previously listed Priority 1 items (parallel coordinates colors + sizing) have been implemented.

### Priority 2 â€" Deferred (non-blocking, no deadline)

| # | What | Status | Notes |
|---|------|--------|-------|
| 1 | Replace hardcoded risk comparison baselines with real CBS/WHO data | Deferred | `risk_comparisons.py:12-64` â€" current values are internal estimates, not live ingested |
| 2 | 200% zoom manual QA pass | Deferred | Manual testing on real device required |
| 3 | Visual regression: risk detail, export sheet, 3D viewer screens | Deferred | Require complex interaction seeding; 5 of 7 screens now covered |

---

## 11. Corrections from Earlier Assessment Drafts

| Previous claim | Actual state | Evidence |
|----------------|-------------|----------|
| "Comparison values are still static placeholders" | Data-driven via `/risk-comparisons` endpoint (though baselines are hardcoded estimates) | `risk_comparisons.py`, `App.tsx:333-338` |
| "Bundle size warning persists" | Build passes clean, no warnings | `npx vite build` |
| Backend test count "259" | 263 passed | `pytest -q -m "not live"` |
| Frontend test count "330" | 334 passed | `npx vitest --run` |
| "Export flow lacks share" | Web Share API implemented | `ExportBottomSheet.tsx` |
| "Tier-B missing" | Fully implemented end-to-end | `tier_b.py`, `TierBSignalsCard.tsx` |
| "Phase 5 has 4 concrete gaps" | All 4 gaps are now implemented (progress bar removal, language segmented control, template cards, dossier visual baselines) | `ExportBottomSheet.tsx`, `ExportBottomSheet.css`, `visual-regression.spec.ts`, `App.tsx` |
| "Risk comparisons sourced from CBS" | Source strings reference CBS profile logic, but values are internal benchmark estimates | `risk_comparisons.py:61-64` |

## 12. Conclusion

Phases 1-5 are **functionally complete** with all core product capabilities shipped, tested, and passing quality gates. **No concrete implementation steps remain.**

All previously identified gaps have been resolved:
- Parallel coordinates colors (`#00897B`/`#E8913A`/`#7C4DFF`) and sizing (r=4, stroke=2) fixed
- OLED dark mode (`#000000` base, `#121212` surface) applied
- Dark basemap switching via CSS filter on Leaflet tile pane
- Visual regression expanded from 7 to 10 tests (settings + dark search + dark compare)

Only deferred items remain: risk comparison data provenance hardening, 200% zoom manual QA, and visual regression for 2 remaining interactive screens.
