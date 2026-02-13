# Buurt-check Spec Reconciliation and Implementation Assessment (2026-02-11)

## 1. Scope and method

This audit reconciles and assesses:
- `AGENTS.md`
- `docs/design-prd.md`
- `docs/design-spec.md`
- `docs/prd.md`

Repository areas assessed:
- Backend: `backend/app/*`, `backend/tests/*`
- Frontend: `frontend/src/*`, `frontend/tests/e2e/*`, `frontend/src/test/*`
- Build and quality gates

Validation commands run:
- Backend lint: `ruff check .` -> pass
- Backend non-live tests: `pytest -q` -> `263 passed, 9 deselected`
- Frontend unit/integration tests: `npm test` -> `334 passed`
- Frontend build: `npm run build` -> pass
- Frontend E2E: `npm run test:e2e` -> `19 passed, 2 failed`
- Backend live tests: `pytest -q -m live` -> `8 passed, 1 failed`

---

## 2. Reconciled baseline (deduplicated)

### 2.1 Product and scope
Unified requirements across all 3 docs:
- Mobile-first NL homebuyer risk intelligence app (expats + first-time buyers).
- Input: address search, then generate dossier.
- Core value: consequences and viewing actions, not raw data dashboards.
- Bilingual EN/NL is required day one.
- Mandatory disclaimers and source/date transparency.
- Non-goals: listings platform, valuation/bidding advice, user accounts, broad permit certainty.

### 2.2 Feature baseline
- F1: address resolution + building facts.
- F2: 3D neighborhood + sunlight/shadow.
  - F2a interactive timeline.
  - F2b static snapshots for export.
  - F2c annual sunlight analysis.
- F3: risk cards (noise, air, climate, sunlight).
- F4: neighborhood snapshot.
- F5: shortlist + compare + PDF export.
- Tier B: crime + energy.

### 2.3 Data baseline
- BAG/Locatieserver for address and building entities.
- 3DBAG for geometry.
- RIVM noise + air.
- Klimaateffectatlas for climate stress.
- CBS for neighborhood and crime.
- EP-Online for energy label.

### 2.4 UX baseline
- 3-tab shell: Search, Briefing, Saved.
- Dossier narrative flow: facts -> 3D -> risks -> neighborhood -> checklist -> actions.
- Risk detail includes score/severity, meaning, comparisons, viewing questions, source/date.
- Export supports quick and full variants.

### 2.5 Engineering baseline
- FastAPI backend aggregator with caching.
- React + TypeScript frontend.
- Three.js viewer and SunCalc-driven lighting.
- Graceful degradation when upstream data fails.

---

## 3. Inconsistencies that need your decision

These are true conflicts between docs and/or current implementation.

### D1. Architecture source of truth
Conflict:
- `docs/design-prd.md` section 16 requires Zustand/Jotai, Tailwind, Framer Motion, WeasyPrint/Puppeteer.
- `AGENTS.md` and current code use app-level `useState`, plain CSS, no Framer Motion, `fpdf2`.

Decision recorded (2026-02-11):
- **D1-1 selected**: Keep current architecture now (no architecture migration), and update `docs/design-prd.md` to match implementation reality.
- Option D1-2 (full architecture migration) is intentionally deferred.

### D2. Visual system source of truth
Conflict:
- `docs/design-prd.md` and `docs/design-spec.md`: Clear Signal Hybrid, accent `#00897B`.
- Current tokens: Polar Frost, accent `#2EC4B6` in `frontend/src/styles/tokens.css`.

Decision recorded (2026-02-11):
- **D2-2 selected**: Keep Polar Frost visual system and revise `docs/design-prd.md` and `docs/design-spec.md` accordingly.
- Option D2-1 (migrate code to Clear Signal Hybrid tokens/styles) is intentionally deferred.

### D3. F2b/F2c rendering architecture
Conflict:
- `docs/prd.md` and `docs/design-prd.md` specify dual renderer with forge3d server-side pipeline.
- Current implementation uses client Three.js snapshots + server PDF assembly via `fpdf2`.

Decision recorded (2026-02-11):
- **D3-2R selected**: Implement forge3 renderer for report rendering only (PDF/export pipeline).
- Web rendering remains Three.js (no web renderer migration now).
- Scope split: forge3 is export/report only; Three.js remains interactive web viewer authority.

### D4. Tier B scope
Conflict:
- `AGENTS.md` says F6 tier B ship if time allows.
- Current code already ships tier-B endpoint + UI (crime and energy).

Decision recorded (2026-02-13):
- **D4-1 selected**: Mapillary removed from scope. F6 (crime) and F7 (energy label) remain included.

### D5. PDF spec depth
Conflict:
- `docs/prd.md` mentions 1-2 page briefing.
- `docs/design-prd.md` and code implement quick brief + full dossier 3-4 pages.

Decision recorded (2026-02-11):
- **D5-1 selected**: Keep dual-template export (`quick_brief` + `full_dossier`).
- Option D5-2 (single 1-2 page PDF) is intentionally deferred.

---

## 4. Implementation assessment by `docs/prd.md` sections

| Section | Status | Assessment |
|---|---|---|
| 1 Market opportunity | Informational | Product framing only; no code expectation. |
| 2 Product goal | Informational | Goal reflected in app flow and copy direction. |
| 3 Target users | Partial | EN/NL support exists, but expat-specific explanatory layers are still thin. |
| 4 Core user journey | Partial | End-to-end journey works; some polish/spec parity gaps remain. |
| 5 MVP feature set | Partial | F1-F5 implemented; F2b/F2c architecture differs. |
| 6 Out of scope | Implemented | No listings/valuation/accounts built. |
| 7 Success metrics | Missing | No product telemetry layer for conversion/return metrics. |
| 8 Data sources and ingestion | Partial | Major sources integrated; PM2.5 layer/data quality still limited. |
| 9 3D visualization pipeline | Partial | Viewer works, but dual-renderer + photorealistic pipeline not implemented as specified. |
| 10 MVP architecture | Partial | FastAPI+React+Redis done; forge3d worker/render API not present. |
| 11 Performance and quality requirements | Partial | Some budgets tested; E2E budget failures and missing device/lighthouse gates. |
| 12 Privacy and legal | Partial | In-card disclaimers exist; full legal/attribution surface not complete. |
| 13 Risks and mitigations | Partial | Graceful degradation and cache exist; some live reliability and perf risks remain. |
| 14 Why this can win | Informational | Strategic section, not directly testable in code. |

---

## 5. Implementation assessment by `docs/design-prd.md` sections

| Section | Status | Assessment |
|---|---|---|
| 1 Design philosophy | Partial | Narrative flow exists; visual language diverges from specified direction. |
| 2 Design system foundation | Partial | Tokenized system exists, but palette/radius/typography values differ from doc. |
| 3 Navigation and IA | Partial | 3-tab IA implemented; top bar and visual treatments diverge. |
| 4 Screen-by-screen spec | Partial | All major screens exist; multiple pixel/spec behavior gaps remain. |
| 5 3D viewer design | Partial | Core interactions present; rendering fidelity below spec. |
| 6 Risk card system | Partial | Tile/detail/checklist pattern works; some comparison/source semantics incomplete. |
| 7 Neighborhood snapshot | Implemented | CBS indicator card with grouped sections and fallback states is in place. |
| 8 Shortlist and compare | Partial | Max 3 + compare works; advanced synchronization/visual spec details differ. |
| 9 PDF viewing briefing | Partial | Quick + full templates implemented; render pipeline and visual spec parity incomplete. |
| 10 Bilingual system | Partial | Key coverage is complete, but hardcoded strings still exist in components. |
| 11 Animation and micro-interactions | Partial | Several transitions exist, but not all specified interactions are implemented. |
| 12 Accessibility specification | Partial | Automated a11y tests exist; full manual SR/device coverage not proven. |
| 13 Dark mode | Partial | Theme support exists; token mapping differs from design doc values. |
| 14 Responsive behavior | Partial | Mobile works well; desktop/sidebar layout spec not implemented. |
| 15 Performance requirements | Partial | Some test budgets exist; key p95 and lighthouse goals not enforced end-to-end. |
| 16 Implementation requirements | Partial | Current stack intentionally differs from documented stack choices. |
| 17 Success criteria | Partial | Many criteria met functionally; several measurable criteria are not instrumented/verified. |
| 18 Design risks and mitigations | Partial | Several mitigations implemented; documentation and monitoring gaps remain. |

---

## 6. Implementation assessment by `docs/design-spec.md` sections

| Section | Status | Assessment |
|---|---|---|
| 1 Main screen (search) | Partial | Functional and tested; spacing/color/token values differ. |
| 2 Loading screen | Partial | Stage messaging and animation exist; exact visual/timing details differ. |
| 3 Dossier screen | Partial | Structure exists; not fully pixel-aligned with spec. |
| 4 3D viewer container | Partial | Controls/features exist; visual fidelity and some control styling differ. |
| 5 Risk tile containers | Partial | 2x2 tile system works; exact anatomy/styles differ. |
| 6 Risk detail screen | Partial | Full-screen detail works with comparisons/questions/source; some text and chart styling differences remain. |
| 7 Neighborhood snapshot container | Partial | Implemented with quartiles/age bars; exact visual values differ. |
| 8 Viewing checklist container | Partial | Checklist exists; alternate-language collapsible per question is missing. |
| 9 Shortlist screen | Partial | Empty/populated states and compare action exist; detailed motion/layout spec differs. |
| 10 Compare screen | Partial | Multi-home comparison + parallel coordinates exist; some style rules and sync behavior differ. |
| 11 PDF export flow | Partial | Bottom sheet, template/lang selection, progress ring exist; exact export pipeline differs. |
| 12 Settings screen | Partial | Settings screen exists with language/theme/actions; detailed visual spec differs. |
| 13 Global button system | Partial | Primary/secondary/tertiary patterns exist; exact dimensions/colors vary. |
| 14 Global icon system | Partial | Iconography mostly custom SVG; not all icon set details are enforced. |
| 15 Data visualization system | Partial | Score bars, quartile dots, bars, parallel coordinates present; exact token/color spec differs. |
| 16 Bottom tab bar | Partial | Implemented; styling differs from frosted/glass spec details. |
| 17 Global top bar | Partial | Implemented; behavior and color model differ from spec. |
| 18 Bottom sheets | Partial | Implemented with handle/backdrop; drag-to-dismiss not implemented. |
| 19 Toast and alert system | Partial | Toast system exists; alert dialog system not implemented. |
| 20 Empty and error states | Partial | Multiple empty/error states exist; not all variants/templates are standardized. |
| 21 Visual success criteria | Partial | Many pass, but strict token/pixel/interaction criteria are not fully met. |

---

## 7. Evidence highlights (implementation reality)

### 7.1 What is solid today
- Backend endpoint surface is broad and cohesive in `backend/app/api/address.py`.
- Non-live backend tests are stable (`263 passed, 9 deselected`).
- Frontend component/test coverage is extensive (`334 passed`).
- PDF export is implemented end-to-end (quick/full templates).
- Tier-B crime + energy is implemented in backend and UI.
- Risk cards, comparisons, checklist, and neighborhood stats all degrade gracefully.

### 7.2 What is materially behind the docs
- Design token system does not match Clear Signal Hybrid values (`frontend/src/styles/tokens.css`).
- Dual-renderer forge3d architecture is not implemented (`docs/prd.md` vs `backend/app/services/pdf_export.py`).
- Full PRD 3D photorealistic pipeline is not implemented (orthophoto roof UV + procedural facade parity).
- Some i18n hardcoded strings remain, for example in `frontend/src/components/AddressSearch.tsx` (`just now`, `yesterday`) and aria labels in top/risk detail components.
- No product analytics/telemetry framework for key PRD metrics.
- E2E and live reliability gaps remain:
  - Playwright: 2 failures (`performance-budget` and Dutch F4 selector mismatch).
  - Backend live tests: 1 failure in CBS bbox fallback path (`RuntimeError: Event loop is closed`).

---

## 8. Concrete implementation plan for missing parts

## Phase 0 - Decisions (must happen first)
Status: completed (2026-02-11).
1. Resolve D1-D5 decisions in section 3.
2. Mark one doc as architecture authority and one doc as visual authority.
3. Freeze these decisions in a single canonical doc (`docs/spec-baseline.md`) - completed.

## Phase 1 - Spec lock and doc repair
Status: completed (2026-02-11).
1. Update `docs/design-prd.md`, `docs/design-spec.md`, and `docs/prd.md` to reflect chosen architecture and feature scope.
2. Add explicit "implemented now" vs "post-MVP" labels per feature.
3. Add one source-of-truth matrix: requirement ID -> file ownership -> acceptance test.
Outputs:
- `docs/spec-baseline.md`
- `docs/prd.md` (Phase 1 addendum + feature labels + architecture alignment)
- `docs/design-prd.md` (Phase 1 addendum + implementation stack alignment)
- `docs/design-spec.md` (Phase 1 addendum + implementation ownership references)

## Phase 2 - Reliability and quality gate closure
1. Fix Playwright Dutch test selector drift (`frontend/tests/e2e/f4-neighborhood-stats.spec.ts`) to current top-bar language control.
2. Fix startup performance budget test realism (`frontend/tests/e2e/performance-budget.spec.ts`) or improve app shell load path if 1.5s is still required.
3. Fix backend live CBS async client loop-safety in `backend/app/services/cbs.py` (per-loop client management pattern like `risk_cards.py`).
4. Re-run and enforce:
   - `pytest -q`
   - `pytest -q -m live`
   - `npm test`
   - `npm run test:e2e`
   - `npm run build`

## Phase 3 - Bilingual and accessibility hardening
1. Remove remaining hardcoded user-facing strings in components and move to i18n keys.
2. Implement alternate-language collapsible text in viewing checklist to match design requirement.
3. Add missing accessibility semantics and manual SR QA checklist evidence.
4. Add CI check to fail on missing i18n keys and selected hardcoded strings.

## Phase 4 - Design-system convergence
1. Align tokens in `frontend/src/styles/tokens.css` to chosen visual authority (or update docs to Polar Frost if that is chosen).
2. Normalize core primitives:
   - card radius/shadow
   - top bar/tab bar treatments
   - risk color thresholds and badge visuals
3. Run visual regression refresh on all critical screens (mobile light, mobile dark, desktop light).

## Phase 5 - 3D and export architecture completion (if forge3d path is chosen)
1. Add render service boundary:
   - `POST /api/render/shadow-snapshots`
   - `POST /api/render/sunlight-analysis`
2. Build cache model for render outputs and geometry versioning.
3. Integrate export flow to use server render first, client fallback second.
4. Add parity tests between Three.js and server render sun positions/camera presets.

## Phase 6 - Product metrics and performance governance
1. Add instrumentation for PRD primary metrics:
   - dossier generation success
   - time to dossier p95
   - export completion
   - return usage
2. Add lighthouse CI and device-profile performance checks.
3. Track bundle budget and chunk ownership in CI.
4. Add runbook for external API degradation and fallback validation.

---

## 9. Recommended immediate next sprint backlog

1. Implement forge3 report-renderer integration and tests for F2b parity.
2. Fix failing E2E tests and backend live CBS loop issue.
3. Remove remaining hardcoded strings and implement checklist dual-language toggle.
5. Add metrics instrumentation for PRD primary KPIs.

---

## 10. Current readiness summary

- Core user value delivery: strong.
- Decision baseline is now locked (`docs/spec-baseline.md`), and doc conflicts are narrowed to implementation gaps.
- Engineering quality baseline: strong in unit/integration tests, but E2E/live gaps remain.
- Fastest path to "rigorously complete": execute Phases 2-4 and close forge3 implementation gaps.
