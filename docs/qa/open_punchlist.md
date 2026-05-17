# Open Punch List

Updated: 2026-05-17

## Phase 3 Backend Closure

- Status: closed for backend scope after the 2026-05-16 100% repair and phase-gate cleanup.
- Evidence: `cd backend && ruff check .` passed with `All checks passed!`; `cd backend && pytest -q tests/test_match_jobs.py tests/test_match_results_contract.py tests/test_match_hard_filters.py tests/test_match_model_honesty.py tests/test_match_instrumentation.py tests/test_match_db_schema.py` passed with 50 tests in 17.78 s; `cd backend && python -m pytest -x -q -m "not live" --color=no` previously passed with 1335 passed, 12 skipped, 11 deselected in 246.11 s (0:04:06); `cd frontend && npm run build` previously passed with Vite client built in 15.53 s and service worker built in 706 ms; `cd frontend && npm run test -- src/test/match-first-model-honesty.test.ts` passed with 1 test in 1.23 s.
- Race/stale retry status: concurrent review-run retries are guarded by a database partial unique index plus contention recovery; stale active running jobs are recovered through `POST /run` before a new job starts. No Phase 3 stale retry behavior remains manual/operator-only.
- Analytics gate status: Phase 3 job analytics now use the canonical event names `match_final_run_cta_clicked`, `match_job_queued`, `match_job_running`, `match_job_completed`, `match_job_failed`, `match_job_completed_with_fallback`, `match_job_completed_no_strong_matches`, and `match_job_slow`; old job alias events are not in the backend allowlist.
- SpecKit analyze status: a read-only `/speckit.analyze` equivalent was rerun after the gate cleanup. It resolved `FEATURE_DIR` to `specs/002-match-first-revamp` and found no critical or high Phase 3 gate blockers.

## Phase 4 Progress/Success UI Closure

- Status: closed for documented Phase 4 scope after the 2026-05-16 review and audit repairs.
- Evidence: review CTA starts the backend run, progress polls persisted status with `poll_after_ms`, all required progress stages have friendly bilingual copy, slow/failed/expired/cancelled/fallback/no-strong states have localized recovery, terminal success now requires matching `session_id`, `job_id`, terminal `status`, and a present/exact `result_set_id` before `onComplete`, stale/unavailable/missing-identity results show a distinct recovery state, and `match_results_unavailable` analytics is emitted with sanitized context.
- Accessibility evidence: component-level axe tests now cover the real `MatchingProgressScreen` running, failed retry, and results-unavailable states plus `MatchSuccessCheckmark` animated and reduced-motion states. This does not claim a full browser touch-target or end-to-end focus audit for every Phase 4 path.
- Commands passed: `cd frontend && npm run test -- src/test/match-first-progress.test.tsx src/test/match-first-a11y.test.tsx src/components/match-first/MatchSuccessCheckmark.test.tsx src/services/matchFirstAnalytics.test.ts src/test/match-i18n.test.ts` passed with 55 tests; `cd frontend && npx eslint src/components/match-first/MatchingProgressScreen.tsx src/components/match-first/MatchSuccessCheckmark.tsx src/test/match-first-progress.test.tsx src/test/match-first-a11y.test.tsx` passed; `cd frontend && npm run build` passed.

## Phase 5 Netherlands Results Map/List Closure

- Status: closed for the documented Phase 5 map/list slice. It is no longer an open implementation item in this punch list.
- Evidence: completed results routes hydrate through `GET /api/match/sessions/{session_id}/results`, render a Netherlands-centered 2D map and ranked recommendation list, keep list and map selection synchronized, preserve map/list state for later Dossier return, and do not load national 3D buildings or national-zoom amenities.
- Commands documented in traceability/handoff: focused Phase 5 Vitest coverage passed, `match-first-a11y.test.tsx` passed, targeted ESLint for the Phase 5 files passed, and `cd frontend && npm run build` passed.
- Still open for Phase 5 before production release: no Playwright e2e/browser performance proof was added for the map slice; full frontend lint still has pre-existing non-Phase-5 failures; the npm audit state with 15 vulnerabilities remains unresolved after adding Leaflet.

## Phase 6 Selected-Neighborhood Detail Closure

- Status: closed for the requested Phase 6 slice after the 2026-05-16 implementation, 2026-05-17 review repair, and 2026-05-17 Phase 6 boundary cleanup.
- Evidence: selected recommendations can open `#/match/session/{session_id}/neighborhood/{neighborhood_id}` detail state; the detail route loads completed results without rerunning matching, shows selected boundary and fit context, requests buildings only after selected-neighborhood layer bounds are loaded, rejects national/out-of-bounds building requests server-side, renders localized missing-3D 2D fallback, caps preference-aware amenity tags to 5-7 categories, and keeps house/address fallback usable without Dossier navigation.
- Review-repair evidence: amenity endpoint failure no longer blocks selected boundary/layer data, scoped building fallback, or the nonblank 2D fallback. Frontend building tests now parse `bounds_rd` and require the exact selected map-layer `allowed_bounds_rd`; backend tests include a near-edge out-of-scope RD New bounds rejection.
- Boundary-cleanup evidence: stale Phase 7 Dossier bridge code was removed from the active backend/frontend. The selected house action remains local Phase 6 state only, stores `selectedHouseId`, shows localized "Dossier opening later" copy, and tests assert no `/run` or `/dossier/from-building` call.
- Commands passed: `cd backend && pytest -q tests/test_match_neighborhood_layers.py`; `cd backend && ruff check app tests/test_match_neighborhood_layers.py`; `cd frontend && npm run test -- src/test/match-first-neighborhood-detail.test.tsx src/test/match-first-results-map.test.tsx src/services/matchFirstApi.test.ts src/test/match-first-a11y.test.tsx src/test/match-first-copy-guard.test.ts src/test/match-i18n.test.ts`; `cd frontend && npm run test -- src/services/matchFirstAnalytics.test.ts`; targeted ESLint for Phase 6 frontend files; `cd frontend && npm run build`.
- 2026-05-17 CI-style commands also passed locally: `cd frontend && npm run test`; `cd frontend && npm run build`; `npm run landing:test:e2e`; `cd backend && ruff check .`; `cd backend && pytest -x -q -m "not live and not visual and not benchmark"`; `cd backend && pytest -x -q -m "benchmark"`; `cd backend && pytest -x -q -m "visual"` collected only skipped local visual tests.
- 2026-05-17 boundary cleanup commands passed locally: `cd frontend && npm run test -- src/test/match-first-neighborhood-detail.test.tsx src/services/matchFirstApi.test.ts src/services/matchFirstAnalytics.test.ts` passed with 27 tests; `cd backend && ruff check .` passed; `cd backend && pytest -q tests/test_match_neighborhood_layers.py` passed with 4 tests.
- Still open before production release: browser-level Playwright/mobile-performance proof for selected-neighborhood detail is not yet added; real selected-neighborhood 3D remains blocked on provider/data integration and currently resolves to the required localized 2D fallback.

## Phase 7 Dossier Bridge Status

- Status: closed for Phase 7 after provider-backed candidate address sourcing
  and proof were added. Reliable resolved-route Dossier opening, PDOK-backed
  nearby candidate address selection, Dossier return, analytics timing, and
  manual-search/no-reliable/manual-required recovery are implemented.
- Evidence: the Dossier bridge now requires completed-result context plus
  `selected_result_id` and `selected_result_rank`; rejects spoofed
  `building_id`, `vbo_id`, `address_id`, `lookup_id`, and return-context
  `selected_house_id` values that are not server-side selected-neighborhood
  candidates; resolves both first and second deterministic server candidates
  from the same scoped-building candidate source; calls the backend PDOK
  Locatieserver reverse path for ambiguous server-side house candidates; returns stable
  `match.dossier.invalid_vbo_id` for malformed VBOs; returns `candidates`,
  `manual_required`, and `unavailable` statuses where appropriate; validates
  selected candidate IDs against server-generated candidate addresses; and
  builds routes/context from server-resolved candidates rather than payload IDs
  alone.
- Frontend recovery evidence: `match.results.stale` from the bridge now shows
  the stale/unavailable results recovery instead of no-reliable-address copy.
  No-reliable-address, manual-required, invalid resolved bridge routes, and
  returned candidate choices show localized manual search and Back to results
  actions. Candidate choices are keyboard usable, have unique accessible
  names/descriptions, 44 px touch targets, focus-visible styling, and EN/NL
  translation keys.
- Analytics evidence: match-first analytics no longer allowlist or store exact
  `address_id`; `match_dossier_opened` fires only after `App` hydrates the
  returned Dossier lookup/VBO; invalid or missing-`match_return` bridge routes
  and lookup failures do not record Dossier-open; Back-to-map return
  success/failure fires from target match-results/neighborhood hydration rather
  than button click.
- E2E evidence: `frontend/tests/e2e/match-first-dossier-roundtrip.spec.ts`
  covers mobile viewport plus explicit reduced-motion emulation across
  Chromium, Firefox, and WebKit: house click -> candidate address choice ->
  existing `#/address` Dossier -> persistent Back to match map -> selected
  neighborhood/map/list/house state restore -> second house opens without
  `/run`, missing `match_return` is rejected, and lookup failure suppresses
  Dossier-open analytics. The suite also includes a Chromium-only
  backend-integrated provider proof that creates a real completed match, opens
  ambiguous seed house 3, receives PDOK Locatieserver reverse-backed candidate
  addresses from the real backend bridge, opens Dossier, returns to match map,
  and asserts no `/run` during Dossier open or return. Firefox/WebKit skip only
  that backend-integrated provider proof to avoid local shared-DB races.
- Commands passed: `cd backend && ruff check app tests/test_match_neighborhood_layers.py`; `cd backend && pytest -q tests/test_match_neighborhood_layers.py tests/test_export_entitlement.py tests/test_reports_api.py` with 42 tests; `cd backend && pytest -q tests/test_locatieserver.py -k reverse`; `cd frontend && npm run test -- src/test/match-first-neighborhood-detail.test.tsx src/App.test.tsx src/services/matchFirstApi.test.ts src/services/matchFirstAnalytics.test.ts src/test/match-first-routing.test.tsx src/services/matchSessionStorage.test.ts src/test/match-i18n.test.ts`; `cd frontend && npm run test:e2e -- tests/e2e/match-first-dossier-roundtrip.spec.ts` with 10 passed and 2 skipped; `cd frontend && npm run build`; `git diff --check` passed with CRLF normalization warnings only.
- Residual Phase 7 blocker: none after the provider-backed candidate repair.

## Remaining Missing Or Partial Items

- Anonymous match-session deletion remains a documented later gate unless implemented in a future phase.
- Seed/mock feature data remains the Phase 3 source mode; production confidence still requires future live data and validation evidence.
- Phase 5 and Phase 6 dedicated browser-level e2e/performance coverage remains open even though the implementation slices are closed; the 2026-05-17 repair did run the existing landing Playwright smoke and full local CI-style gates.
- Full frontend lint remains open because known pre-existing files still fail repo-wide lint; targeted lint for the touched Phase 4, Phase 5, and Phase 6 files passed where scoped.
- npm audit remediation remains open; dependency vulnerability cleanup was outside the Phase 4/5/6 scope.

## Worktree Scope Notes

- Keep Phase 8 final QA separate from the Phase 7 repair commit unless intentionally starting that phase.
- The current worktree includes Phase 7 Dossier bridge repair files plus prior Phase 7 bridge files. Review/stage them intentionally instead of treating old Phase 3/6 commit-scope notes as current guidance.
