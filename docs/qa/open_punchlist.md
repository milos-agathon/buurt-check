# Open Punch List

Updated: 2026-05-16

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

## Remaining Missing Or Partial Items

- Phase 6 selected-neighborhood detail and selected-neighborhood-only 3D loading are still not implemented.
- Phase 7 house-to-existing-Dossier bridge and full back-to-match-map restoration are still not implemented.
- Anonymous match-session deletion remains a documented later gate unless implemented in a future phase.
- Seed/mock feature data remains the Phase 3 source mode; production confidence still requires future live data and validation evidence.
- Phase 5 browser-level e2e/performance coverage remains open even though the map/list implementation slice is closed.
- Full frontend lint remains open because known pre-existing non-Phase-4/5 files still fail repo-wide lint; targeted lint for the touched Phase 4 and Phase 5 files passed.
- npm audit remediation remains open; dependency vulnerability cleanup was outside the Phase 4/5 scope.

## Worktree Scope Notes

- Keep Phase 6 selected-neighborhood detail/3D and Phase 7 Dossier bridge work out of Phase 4/5 repair commits unless intentionally starting those phases.
- The current worktree includes Phase 5 map/list files plus this Phase 4 audit repair. Review/stage them intentionally instead of treating old Phase 3 commit-scope notes as current guidance.
