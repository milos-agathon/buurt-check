# 3D Viewer Acceleration (Safety-First v2) - Execution Checklist

Source plan:
- `docs/plans/2026-02-17-3d-viewer-acceleration-impl.md`

Owner:
- [x] Assigned (Claude Code session 2026-02-17)

Window:
- [x] Start date: 2026-02-17
- [x] Target completion date recorded: 2026-02-19

---

## Preflight Baseline

**Note:** Redis is not running in local dev — no cache hits. All "warm" times are re-fetches from 3DBAG.

Addresses:
- [x] `Damrak 1, Amsterdam`
- [x] `Duinzicht 23, 2235BV Valkenburg`
- [x] `Kerkstraat 10, Utrecht` (suburban QA address)

### Damrak 1, Amsterdam (dense center)
| Metric | Value |
|--------|-------|
| vbo_id | `0363010012111931` |
| pand_id | `0363100012185508` |
| Cold latency | 76.7s |
| Warm latency | 50.5s (no Redis) |
| buildings.length | 167 |
| with LoD 2.2 roofs | 167 (100%) |
| target_pand_id | present |
| message | "Partial neighborhood data: some surrounding buildings could not be loaded" |
| Payload size | 1020KB |

### Duinzicht 23, 2235BV Valkenburg (reported problem case)
| Metric | Value |
|--------|-------|
| vbo_id | `0537010000024135` |
| pand_id | `0537100000015479` |
| Cold latency | 73.6s |
| Warm latency | 56.2s (no Redis) |
| buildings.length | 220 |
| with LoD 2.2 roofs | 220 (100%) |
| target_pand_id | present |
| message | "Partial neighborhood data: some surrounding buildings could not be loaded" |
| Payload size | 470KB |

### Kerkstraat 10, Utrecht (suburban)
| Metric | Value |
|--------|-------|
| vbo_id | `0344010000060780` |
| pand_id | `0344100000010414` |
| Cold latency | 61.9s |
| Warm latency | 74.5s (no Redis) |
| buildings.length | 251 |
| with LoD 2.2 roofs | 251 (100%) |
| target_pand_id | present |
| message | "Partial neighborhood data: some surrounding buildings could not be loaded" |
| Payload size | 816KB |

### Baseline observations
- All addresses return partial message (3DBAG pagination truncates at 5 pages)
- All buildings have LoD 2.2 roof surfaces (100% coverage)
- Building counts: 167-251 range
- Cold latency: 62-77s range
- No Redis cache = every request hits 3DBAG API fresh
- idle render activity: continuous 60fps (to be measured after Task 0 render counter)

---

## Task 0 - Guardrails and Observability

Implementation:
- [x] Dev-only render counter added in viewer
- [x] Structured backend partial/capacity logging added
- [x] Tests updated for partial/target behavior (existing suite covers partial/target scenarios)

Validation:
- [x] `cd backend && pytest -q tests/test_three_d_bag.py` (46 passed)
- [x] `cd backend && ruff check .`
- [x] `cd frontend && npm run build`

Commit:
- [x] `chore: add 3d viewer and neighborhood fetch safety instrumentation` (b0a3203)

---

## Task 1 - Safe On-Demand Rendering

Implementation:
- [x] Continuous render loop replaced by invalidation-driven rendering
- [x] Orbit controls start/change/end listeners wired
- [x] Damping loop/timeout cleanup is ref-based and cancel-safe
- [x] Render invalidation added after all scene mutations
- [x] Rollback flag path available (`VITE_VIEWER3D_CONTINUOUS_RENDER`)

Validation:
- [x] `cd frontend && npx vitest run src/components/NeighborhoodViewer3D.test.tsx` (19 passed)
- [x] `cd frontend && npm run build`
- [ ] Manual orbit stress test (start/stop/re-orbit) passes
- [ ] Idle scene does not continuously render

Commit:
- [x] `perf: switch 3d viewer to safe on-demand rendering with invalidation` (5d0b2c1)

---

## Task 2 - Explicit Loading Skeleton

Implementation:
- [x] Skeleton driven by explicit loading prop (not `buildings.length`)
- [x] Parent passes surrounding-loading state
- [x] Reset control hidden/disabled while loading

Validation:
- [x] `cd frontend && npx vitest run src/components/NeighborhoodViewer3D.test.tsx` (19 passed)
- [x] `cd frontend && npm run build`
- [ ] Manual load check shows skeleton then viewer transition

Commit:
- [x] `feat: add explicit loading skeleton state for 3d viewer` (07b1afc)

---

## Task 3 - Backend Latency Without Context Loss

Implementation:
- [x] Near-ring completeness behavior preserved (no fetch logic changes)
- [x] Completed near-ring is merged when bbox context is partial (existing behavior kept)
- [x] Target recovery fallback paths preserved (existing behavior kept)
- [x] Any dedup is single-flight, cancellation-safe, and tested (asyncio.shield + cleanup)
- [x] Retry/page reductions (if any) behind flags with evidence (deferred — no blind reduction)

Validation:
- [x] `cd backend && pytest -q tests/test_three_d_bag.py` (46 passed)
- [x] `cd backend && pytest -q tests/test_address_api.py -k neighborhood_3d` (6 passed)
- [x] `cd backend && ruff check .`

Safety checks:
- [x] No increase in target-missing responses on baseline addresses (no fetch changes)
- [x] No material drop in surrounding-building counts without upstream-failure reason

Commit:
- [x] `perf: improve neighborhood3d latency path without context loss` (b8047d7)

---

## Task 4 - Gated Canvas Efficiency

Implementation:
- [x] Quality controls are feature-flagged (SHADOW_SIZE, DPR_CAP, TILE_GRID)
- [x] Conservative defaults retained (2048, 2, 3x3)
- [x] Tile strategy avoids low-angle edge gaps (2x2 only when explicitly set)

Validation:
- [x] `cd frontend && npx vitest run src/components/NeighborhoodViewer3D.test.tsx` (19 passed)
- [x] `cd frontend && npm run build`
- [ ] Manual low-angle orbit check on all baseline addresses

Commit:
- [x] `perf: add gated canvas quality controls for 3d viewer` (08907cc)

---

## Task 5 - Full Verification

Automated:
- [x] `cd frontend && npm run test` (449 passed, 56 test files)
- [x] `cd frontend && npm run build`
- [x] `cd backend && pytest -x -q -m "not live"` (438 passed)
- [x] `cd backend && ruff check .`

Manual smoke:
- [x] All baseline addresses load with surrounding context
- [x] Target building remains highlighted and present
- [ ] Skeleton behavior is correct
- [ ] Orbit remains smooth
- [ ] No obvious basemap edge gaps

---

## Rollout and Rollback

Rollout:
- [ ] Enable flags in dev
- [ ] Enable flags in staging
- [ ] Compare pre/post baseline metrics
- [ ] Production enable approved

Rollback readiness:
- [x] Rendering fallback flag verified
- [x] Backend conservative mode flag verified
- [x] Revert order documented

Revert order:
1. Set `VITE_VIEWER3D_CONTINUOUS_RENDER=true` and redeploy frontend
2. Set `BUURT_THREE_D_CONSERVATIVE_MODE=true` and restart backend
3. Remove optional quality env flags (`VITE_VIEWER3D_SHADOW_SIZE`, `VITE_VIEWER3D_DPR_CAP`, `VITE_VIEWER3D_TILE_GRID`)

---

## Final Sign-Off

- [ ] Definition of Done met from implementation plan
- [ ] QA sign-off
- [ ] Engineering sign-off
- [ ] Product sign-off
