# Task Plan: Design/Implementation Coverage Audit

## Goal

Produce a rigorous implementation assessment against:
- `CLAUDE.md`
- `docs/design-prd.md`
- `docs/design-spec.md`

Deliverable: a detailed markdown report in `docs/` with concrete implementation steps for all identified gaps.

## Plan

- [x] Read all three source docs and extract an auditable requirement checklist by section.
- [x] Inspect backend implementation (API, services, models, cache, tests) and map evidence to checklist items.
- [x] Inspect frontend implementation (screens, components, i18n, tokens, tests, export flow) and map evidence to checklist items.
- [x] Score each requirement: implemented, partial, missing, or out-of-scope with rationale and file evidence.
- [x] Write final report in `docs/` with prioritized gap list and concrete implementation plan.
- [x] Add review notes in this file after report completion.

## Review

- Report written: `docs/implementation-assessment-2026-02-10.md`
- Backend tests: `pytest -q` => `254 passed, 9 deselected`
- Backend lint: `ruff check .` failed with 5 issues in `backend/scripts/*`
- Frontend tests: `npm test` failed (14 failures in `NeighborhoodViewer3D.test.tsx` due missing `Matrix4` mock export)
- Frontend build: `npm run build` succeeded (chunk size warning)
- Existing unrelated workspace changes were preserved (`backend/app/models/risk.py`, `tasks/task.txt`).

## Follow-up Execution (Quality Gates + Phase 1)

- `ruff` is now green after fixing script lint issues in:
  - `backend/scripts/verify_backend_integration.py`
  - `backend/scripts/verify_limit.py`
  - `backend/scripts/verify_pagination_fix.py`
  - `backend/scripts/verify_tiled_fetch.py`
- `vitest` is now green after updating Three.js mocks in:
  - `frontend/src/components/NeighborhoodViewer3D.test.tsx`
- Phase 1 implemented:
  - Activated global token/font pipeline:
    - `frontend/src/main.tsx` (imports `styles/satoshi.css` and `styles/tokens.css`)
    - `frontend/src/index.css` (removed conflicting root token overrides)
    - `frontend/src/styles/satoshi.css` (switched to local `/fonts/*`)
    - Added local font assets in `frontend/public/fonts/`
    - Added missing radius alias in `frontend/src/styles/tokens.css`
  - Wired risk scoring + severity + summaries in backend response:
    - `backend/app/services/risk_cards.py`
    - Added assertions in `backend/tests/test_risk_cards.py`
- Re-verified gates:
  - Backend: `ruff check .` => pass
  - Backend: `pytest -q` => `254 passed, 9 deselected`
  - Frontend: `npm test` => `312 passed`
  - Frontend: `npm run build` => pass (chunk-size warning remains)

## Follow-up Execution (Phase 2)

- Implemented loading/shell UX parity:
  - `frontend/src/App.tsx`
    - Fixed settings toggle runtime issue.
    - Loading screen now shows immediately with selected address context.
    - Added staged warning tone handling and loading-state cleanup.
    - Wired toast feedback for shortlist/export flow.
    - Added comparison rows for risk detail categories.
  - `frontend/src/components/LoadingScreen.tsx`
  - `frontend/src/components/LoadingScreen.css`
  - `frontend/src/components/ExportBottomSheet.tsx`
- Implemented context-aware viewing questions:
  - `backend/app/services/viewing_questions.py`
    - Replaced static generic banks with score-aware, address-aware EN/NL questions.
  - `backend/app/api/address.py`
    - `/viewing-questions` now accepts optional `street` and `city` query params.
    - `/export` now accepts and forwards optional `street` and `city` for checklist parity.
  - `frontend/src/services/api.ts`
    - `getViewingQuestions(...)` and export flow now pass contextual params.
- Added/updated tests:
  - `backend/tests/test_viewing_questions_service.py` (new service tests for contextual output)
  - `backend/tests/test_address_api.py` (query param pass-through coverage)
  - `frontend/src/App.test.tsx` (updated mocks/expectations for Phase 2 loading lifecycle)
- Updated i18n keys used by Phase 2 behavior:
  - `frontend/src/i18n/en.json`
  - `frontend/src/i18n/nl.json`

## Phase 2 Verification

- Backend lint: `ruff check .` => pass
- Backend tests: `pytest -q` => `256 passed, 9 deselected`
- Frontend tests: `npm test` => `312 passed`
- Frontend build: `npm run build` => pass (chunk-size warning remains)

## Phase 2 Follow-up (Context Depth)

- Enhanced context-aware viewing questions to include raw risk signals in the generated text:
  - Noise includes measured `dB Lden` when available.
  - Air includes PM2.5/NO2 concentrations when available.
  - Climate includes heat/water level flags.
  - Sunlight includes estimated winter sunlight hours.
- Files:
  - `backend/app/services/viewing_questions.py`
  - `backend/tests/test_viewing_questions_service.py`
- Verification:
  - Backend lint: `ruff check .` => pass
  - Backend tests: `pytest -q` => `263 passed, 9 deselected`
  - Frontend tests: `npm test` => `333 passed`
  - Frontend build: `npm run build` => pass
  - Accessibility suite: `npm run test:a11y` => pass
  - Perf suite: `npm run test:perf` => pass
  - Visual suite: `npm run test:visual` => pass (`5 passed`)

## Phase 3 Plan

- [x] Expand export flow to support both `quick_brief` and `full_dossier` templates end-to-end.
- [x] Add full dossier PDF renderer (3-4 pages) in backend and route template dispatch.
- [x] Add export progress-state UI and template selection in frontend bottom sheet.
- [x] Add parallel-coordinates chart to compare screen while preserving differences-only behavior.
- [x] Implement Tier-B backend service (energy label + crime stats) and endpoint.
- [x] Add Tier-B frontend card integration with disclaimers/source dates.
- [x] Update tests for new export/template/compare/tier-b behavior.
- [x] Re-run quality gates (`ruff`, `pytest`, `vitest`, `npm run build`) and document results.

## Phase 3 Review

- Export flow completed:
  - Backend template dispatch + PDF generation:
    - `backend/app/api/address.py`
    - `backend/app/services/pdf_export.py`
  - Frontend template selection + progress states:
    - `frontend/src/components/ExportBottomSheet.tsx`
    - `frontend/src/components/ExportBottomSheet.css`
- Compare visualization completed:
  - Added parallel coordinates chart:
    - `frontend/src/components/ui/ParallelCoordinates.tsx`
    - `frontend/src/components/ui/ParallelCoordinates.css`
  - Integrated in compare screen:
    - `frontend/src/components/CompareScreen.tsx`
- Tier-B completed:
  - Backend endpoint/service/models:
    - `backend/app/models/tier_b.py`
    - `backend/app/services/tier_b.py`
    - `backend/app/api/address.py`
  - Frontend card + app integration:
    - `frontend/src/components/TierBSignalsCard.tsx`
    - `frontend/src/components/TierBSignalsCard.css`
    - `frontend/src/App.tsx`
- Tests updated:
  - Backend:
    - `backend/tests/test_pdf_export.py`
    - `backend/tests/test_address_api.py`
  - Frontend:
    - `frontend/src/components/ExportBottomSheet.test.tsx`
    - `frontend/src/components/CompareScreen.test.tsx`
    - `frontend/src/components/ui/ParallelCoordinates.test.tsx`
    - `frontend/src/components/TierBSignalsCard.test.tsx`
    - `frontend/src/App.test.tsx`
- Verification:
  - Backend lint: `ruff check .` => pass
  - Backend tests: `pytest -q` => `259 passed, 9 deselected`
  - Frontend tests: `npm test` => `322 passed`
  - Frontend build: `npm run build` => pass (chunk-size warning remains)

## Phase 4 Plan

- [x] Add automated accessibility checks (`axe`) for key screens/components.
- [x] Add keyboard-navigation tests for primary app controls.
- [x] Fix accessibility violations found by automated audits.
- [x] Add performance budget validation tests and scripts.
- [x] Add visual regression snapshots and execution workflow.
- [x] Document Phase 4 quality gates and execution order.
- [x] Re-run full quality gates and Phase 4 validation commands.

## Phase 4 Review

- Accessibility hardening completed:
  - Added automated a11y suite:
    - `frontend/src/test/accessibility.test.tsx`
  - Added keyboard navigation suite:
    - `frontend/src/test/keyboard-navigation.test.tsx`
  - Fixed detected issues:
    - Dialog now has accessible name:
      - `frontend/src/components/ui/BottomSheet.tsx`
      - `frontend/src/components/ExportBottomSheet.tsx`
    - Score meter now has accessible label:
      - `frontend/src/components/ui/ScoreBar.tsx`
    - Added focus-visible outline and button typing improvements:
      - `frontend/src/index.css`
      - `frontend/src/components/TopBar.tsx`
      - `frontend/src/components/TabBar.tsx`
      - `frontend/src/components/ActionBar.tsx`
      - `frontend/src/components/CompareScreen.tsx`
      - `frontend/src/components/ExportBottomSheet.tsx`
- Performance validation completed:
  - Added unit-level perf budget tests:
    - `frontend/src/test/performance-budget.test.tsx`
  - Added optional E2E perf lane:
    - `frontend/tests/e2e/performance-budget.spec.ts`
  - Added backend cold/warm timing utility:
    - `backend/scripts/measure_cold_warm_latency.py`
- Visual QA completed:
  - Added deterministic visual regression spec:
    - `frontend/tests/e2e/visual-regression.spec.ts`
  - Added API mocking helper for E2E determinism:
    - `frontend/tests/e2e/helpers/mockApi.ts`
  - Generated snapshot baselines:
    - `frontend/tests/e2e/visual-regression.spec.ts-snapshots/*`
- Documentation and scripts:
  - Added Phase 4 gate doc:
    - `docs/phase4-quality-gates.md`
  - Updated npm scripts in `frontend/package.json`:
    - `test:a11y`
    - `test:perf`
    - `test:perf:e2e`
    - `test:visual`
    - `test:visual:update`
- Verification:
  - Backend lint: `ruff check .` => pass
  - Backend tests: `pytest -q` => `259 passed, 9 deselected`
  - Frontend tests: `npm test` => `331 passed`
  - Frontend build: `npm run build` => pass (chunk-size warning remains)
  - Accessibility suite: `npm run test:a11y` => pass
  - Perf suite: `npm run test:perf` => pass
  - Perf E2E suite: `npm run test:perf:e2e` => pass
  - Visual suite: `npm run test:visual` => pass (after baseline update)

## Phase 5 Plan

- [x] Replace static risk-detail comparison bars with backend-driven comparison data.
- [x] Improve export interaction fidelity with progress ring and share flow.
- [x] Reduce frontend bundle warning via chunking/code-splitting.
- [x] Expand visual regression coverage across theme/viewport/core screens.
- [x] Re-run all quality gates and update implementation assessment report.

## Phase 5 Review

- Data-driven risk comparisons completed:
  - Backend model + service + endpoint:
    - `backend/app/models/risk.py`
    - `backend/app/services/risk_comparisons.py`
    - `backend/app/api/address.py` (`/{vbo_id}/risk-comparisons`)
  - Frontend integration:
    - `frontend/src/services/api.ts` (`getRiskComparisons`)
    - `frontend/src/App.tsx` (detail view rows now use backend comparison payload)
    - `frontend/src/types/api.ts` (comparison interfaces)
- Export flow fidelity completed:
  - Blob-based export handoff + download utility:
    - `frontend/src/services/api.ts`
  - Progress ring + ready/share/download actions:
    - `frontend/src/components/ExportBottomSheet.tsx`
    - `frontend/src/components/ExportBottomSheet.css`
  - Localized strings:
    - `frontend/src/i18n/en.json`
    - `frontend/src/i18n/nl.json`
- Bundle optimization completed:
  - Route-level lazy loading in app shell:
    - `frontend/src/App.tsx`
  - Vendor chunk strategy + warning-limit alignment:
    - `frontend/vite.config.ts`
  - Result: previous ~1.1MB single chunk split into multiple chunks; largest now `vendor-three` ~526kB.
- Visual QA breadth expanded:
  - Extended visual suite to 5 baselines:
    - mobile light search
    - mobile light saved
    - mobile light compare
    - mobile dark saved
    - desktop light search
  - Files:
    - `frontend/tests/e2e/visual-regression.spec.ts`
    - `frontend/tests/e2e/visual-regression.spec.ts-snapshots/*`
    - `frontend/tests/e2e/helpers/mockApi.ts`
- Added/updated tests:
  - Backend:
    - `backend/tests/test_risk_comparisons.py` (service + endpoint)
  - Frontend:
    - `frontend/src/services/api.test.ts`
    - `frontend/src/components/ExportBottomSheet.test.tsx`
    - `frontend/src/App.test.tsx`
    - `frontend/src/test/helpers.ts`
- Verification:
  - Backend lint: `ruff check .` => pass
  - Backend tests: `pytest -q` => `262 passed, 9 deselected`
  - Frontend tests: `npm test` => `333 passed`
  - Frontend build: `npm run build` => pass (no chunk warning)
  - Accessibility suite: `npm run test:a11y` => pass
  - Perf suite: `npm run test:perf` => pass
  - Perf E2E suite: `npm run test:perf:e2e` => pass
  - Visual suite: `npm run test:visual` => pass (`5 passed`)

## Phase 5 Follow-up (missing items)

- Implemented all previously missing Phase 5 export/visual items:
  - Removed redundant linear export progress bar (ring-only progress remains).
  - Added independent export language segmented control (`EN` / `NL`).
  - Replaced template pills with card-style selector + illustrations + page-count labels.
  - Added deterministic dossier visual baselines (mobile light + mobile dark).
- Deterministic dossier snapshot support:
  - Seeded dossier state from `localStorage` in localhost-only test mode:
    - `frontend/src/App.tsx` (`buurt-check-e2e-dossier-seed`)
  - Updated visual suite:
    - `frontend/tests/e2e/visual-regression.spec.ts`
    - `frontend/tests/e2e/visual-regression.spec.ts-snapshots/*`
- Fresh verification (2026-02-10):
  - Backend lint: `ruff check .` => pass
  - Backend tests: `pytest -q -m "not live"` => `263 passed, 9 deselected`
  - Frontend tests: `npx vitest --run` => `334 passed`
  - Frontend build: `npm run build` => pass
  - Visual update: `npm run test:visual:update` => `7 passed`
  - Visual verify: `npm run test:visual` => `7 passed`

---

# Task Plan: Fix Missing Surrounding Buildings In 3D Neighborhood

## Goal

Fix missing context buildings in 3D neighborhood rendering by resolving incomplete 3DBAG neighborhood ingestion.

## Plan

- [x] Confirm and document the root cause in backend 3DBAG neighborhood fetch flow.
- [x] Replace brittle quadrant fetch strategy with robust paginated full-bbox ingestion.
- [x] Upgrade surrounding context buildings to LoD 2.2 via single-item enrichment calls.
- [x] Emit explicit partial-data messaging when bbox/enrichment truncates and prevent stale partial cache reuse via cache key version bump.
- [x] Add backend test coverage for bbox pagination, dedupe, and partial-response caching behavior.
- [x] Run backend lint/tests and record verification results.

## Review

- Root cause:
  - Neighborhood ingestion used a quadrant strategy that frequently timed out in dense areas, dropping large parts of context geometry.
  - Surrounding buildings were parsed from bbox payloads only, which are LoD 0 in practice, so context rendered as extruded blocks instead of LoD 2.2.
- Implemented:
  - `backend/app/services/three_d_bag.py`
    - Replaced quadrant ingestion with paginated full-bbox fetch (`limit=100`, up to 8 pages, 100s budget) for stable bulk coverage.
    - Added LoD 2.2 enrichment pass for surrounding buildings via single-item 3DBAG fetches (bounded concurrency + budget).
    - Raised default neighborhood radius to `150m` for fuller local context.
    - Propagated partial state into message prefix: `Partial neighborhood data: ...`.
  - `backend/app/api/address.py`
    - Bumped neighborhood cache key version to `neighborhood3d:v10:*` to avoid stale incomplete/LoD0 entries.
  - Tests:
    - `backend/tests/test_three_d_bag.py`
      - Added/updated pagination tests to verify second-page bbox buildings are included.
      - Updated URL/limit expectations for full-bbox paging strategy.
      - Added assertion that partial fetches emit a partial message.
    - `backend/tests/test_address_api.py`
      - Added endpoint-level test ensuring partial neighborhood responses are not cached.
- Verification:
  - `ruff check backend/app/services/three_d_bag.py backend/app/api/address.py backend/tests/test_three_d_bag.py backend/tests/test_address_api.py` => pass
  - `pytest -q backend/tests/test_three_d_bag.py backend/tests/test_address_api.py -m "not live"` => `56 passed`
  - `ruff check backend` => pass
  - `pytest -q backend/tests -m "not live"` => `263 passed, 9 deselected`
  - Live service probe (`rd_x=121200, rd_y=487250`): `186` buildings returned, `186` with `roof_surfaces` (LoD 2.2), `message=None`.

