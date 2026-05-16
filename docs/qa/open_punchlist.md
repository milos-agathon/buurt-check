# Open Punch List

Updated: 2026-05-16

## Phase 3 Backend Closure

- Status: closed for backend scope after the 2026-05-16 100% repair and phase-gate cleanup.
- Evidence: `cd backend && ruff check .` passed with `All checks passed!`; `cd backend && pytest -q tests/test_match_jobs.py tests/test_match_results_contract.py tests/test_match_hard_filters.py tests/test_match_model_honesty.py tests/test_match_instrumentation.py tests/test_match_db_schema.py` passed with 50 tests in 17.78 s; `cd backend && python -m pytest -x -q -m "not live" --color=no` previously passed with 1335 passed, 12 skipped, 11 deselected in 246.11 s (0:04:06); `cd frontend && npm run build` previously passed with Vite client built in 15.53 s and service worker built in 706 ms; `cd frontend && npm run test -- src/test/match-first-model-honesty.test.ts` passed with 1 test in 1.23 s.
- Race/stale retry status: concurrent review-run retries are guarded by a database partial unique index plus contention recovery; stale active running jobs are recovered through `POST /run` before a new job starts. No Phase 3 stale retry behavior remains manual/operator-only.
- Analytics gate status: Phase 3 job analytics now use the canonical event names `match_final_run_cta_clicked`, `match_job_queued`, `match_job_running`, `match_job_completed`, `match_job_failed`, `match_job_completed_with_fallback`, `match_job_completed_no_strong_matches`, and `match_job_slow`; old job alias events are not in the backend allowlist.
- SpecKit analyze status: a read-only `/speckit.analyze` equivalent was rerun after the gate cleanup. It resolved `FEATURE_DIR` to `specs/002-match-first-revamp` and found no critical or high Phase 3 gate blockers.

## Phase 4 Progress/Success UI Closure

- Status: closed for documented Phase 4 scope after the 2026-05-16 review repair.
- Evidence: review CTA starts the backend run, progress polls persisted status with `poll_after_ms`, all required progress stages have friendly bilingual copy, slow/failed/expired/cancelled/fallback/no-strong states have localized recovery, terminal success verifies matching `session_id`, `job_id`, `status`, and `result_set_id` before showing the checkmark, stale/unavailable results show a distinct recovery state, and `match_results_unavailable` analytics is emitted with sanitized context.
- Commands passed: `cd frontend && npm run test -- src/test/match-first-progress.test.tsx src/App.test.tsx src/components/match-first/MatchSuccessCheckmark.test.tsx src/services/matchFirstApi.test.ts src/services/matchFirstAnalytics.test.ts src/test/match-i18n.test.ts`; `cd frontend && npm run test -- src/test/match-first-a11y.test.tsx`; `cd frontend && npx eslint src/components/match-first/MatchingProgressScreen.tsx src/components/match-first/MatchSuccessCheckmark.tsx src/services/matchFirstAnalytics.ts src/services/matchFirstApi.ts src/types/matchFirst.ts`; `cd frontend && npm run build`.

## Remaining Missing Or Partial Items

- Phase 5 Netherlands results map is still not implemented.
- Phase 6 selected-neighborhood detail and selected-neighborhood-only 3D loading are still not implemented.
- Phase 7 house-to-existing-Dossier bridge and full back-to-match-map restoration are still not implemented.
- Anonymous match-session deletion remains a documented later gate unless implemented in a future phase.
- Seed/mock feature data remains the Phase 3 source mode; production confidence still requires future live data and validation evidence.

## Worktree Scope Split

The current worktree contains unrelated governance/template/documentation changes that are not part of the Phase 3 backend closure repair: `.gitignore`, `.specify/*`, `AGENTS.md`, deleted `CLAUDE.md`, `docs/context/current_architecture.md`, and broad SpecKit spec/plan/contract/data-model edits. Do not include those in a Phase 3 backend repair commit unless intentionally grouped as governance/planning work.

Phase 3 100% closure repair files are: `backend/app/db.py`,
`backend/app/models/match.py`, `backend/app/services/match/instrumentation.py`,
`backend/app/services/match/jobs.py`, `backend/app/services/match/results.py`,
`backend/tests/test_match_instrumentation.py`, `backend/tests/test_match_jobs.py`,
`backend/tests/test_match_results_contract.py`,
`backend/tests/test_match_db_schema.py`, `frontend/src/i18n/en.json`,
`frontend/src/i18n/nl.json`, `docs/ai/latest_handoff.md`,
`docs/qa/match_first_revamp_traceability.md`, and this punch list. Split or
commit unrelated governance/planning changes separately before starting Phase 4.
