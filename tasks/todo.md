# F3 Risk Cards Hardening Plan (2026-02-05)

## Goal

Implement all requirements from `docs/plans/2026-02-05-f3-risk-cards-hardening.md`:
- fix live noise layer matching bug,
- harden climate layer coverage for nationwide addresses,
- add live smoke tests,
- correct stale docs and baselines,
- run full verification gates.

## Plan

- [x] 1) Fix noise layer regex + tests
  - Add/adjust tests for real RIVM naming (`Geluid_lden_wegverkeer`).
  - Update `_select_noise_layer()` matching + fallback behavior.
  - Verify targeted backend tests and lint.

- [x] 2) Expand climate layer coverage + tests
  - Research live Klimaateffectatlas layers from index.
  - Add national-coverage water fallback(s) and keep curated top-10 list discipline.
  - Add tests asserting coverage strategy.

- [x] 3) Add live smoke tests
  - Add `backend/tests/test_risk_cards_live.py` with `@pytest.mark.live`.
  - Register `live` marker in `backend/pyproject.toml`.
  - Validate live and regular test behavior.

- [x] 4) Update docs and memory
  - Update `CLAUDE.md` (RIVM endpoint correction + baselines + F3 status).
  - Update `C:\Users\milos\.claude\projects\d--buurt-check\memory\MEMORY.md` with corrected RIVM info and baselines.

- [x] 5) Final verification
  - Backend: `ruff check`, full pytest.
  - Frontend: vitest + build.
  - Live: risk-card smoke tests.

## Review

- Implemented all hardening requirements from `docs/plans/2026-02-05-f3-risk-cards-hardening.md`.
- Noise fix:
  - `_select_noise_layer()` now matches real RIVM naming (`rivm_{YYYYMMDD}_Geluid_lden_wegverkeer_{YYYY}`) and has case-insensitive fallback for `geluid_lden_wegverkeer`.
  - Added regression tests for real layer names.
- Climate coverage fix:
  - Added broad-coverage water layer `mra_klimaatatlas:1826_mra_overstromingskans_20cm` at highest priority.
  - Added `wpn:` water fallback layer and updated tests to enforce national strategy.
  - Improved water classifier for `klasse_*` and `overstro*` property patterns.
- Live tests:
  - Added `backend/tests/test_risk_cards_live.py` with `@pytest.mark.live`.
  - Registered `live` marker and default deselection in `backend/pyproject.toml`.
  - Hardened async client lifecycle in `risk_cards.py` to avoid event-loop reuse failures during live tests.
- Docs updated:
  - `CLAUDE.md`: corrected RIVM ALO noise note, F3 status, and test baselines.
  - `C:\Users\milos\.claude\projects\d--buurt-check\memory\MEMORY.md`: corrected RIVM note and test baselines.
- Verification:
  - `backend`: `python -m ruff check` ✅, `python -m pytest -v --tb=short` ✅ (`91 passed, 5 deselected`), `python -m pytest tests/test_risk_cards_live.py -m live -v` ✅ (`5 passed`).
  - `frontend`: `npx vitest run` ✅ (`104 passed`), `npm run build` ✅.

---

# F3 Remaining Gaps Closure Plan (2026-02-05)

## Goal

Close remaining F3 correctness + UX gaps:
- fix air no-data sentinel handling,
- ensure risk cards degrade to "unavailable" (not hidden) on failures,
- make sunlight unavailable state fully compliant with 4-element card rule,
- improve climate WFS feature selection (point containment),
- adjust caching to avoid storing partial failures,
- fix air unit display,
- align E2E and unit tests with new behavior.

## Plan

- [x] 1) Backend correctness + caching
  - Filter air no-data sentinels (e.g., -999) before classification.
  - Avoid caching when any card indicates external lookup failure/layer missing.
  - Improve WFS sampling: select feature containing point when geometry is Polygon/MultiPolygon, else fallback to closest.
  - Update/extend backend tests for new logic.

- [x] 2) Frontend degradation + sunlight compliance
  - On risk API failure, render cards as "unavailable" instead of hiding section.
  - Sunlight unavailable state: show badge/meaning/question/source (4 elements).
  - Fix air unit display to µg/m³.
  - Update i18n keys and component tests.

- [x] 3) E2E alignment
  - Update F3 degraded-path Playwright spec to match new UI behavior.

- [x] 4) Verification
  - Backend: `ruff check`, full pytest, live risk tests.
  - Frontend: vitest + build.
  - E2E: `npm run test:e2e -- tests/e2e/f3-risk-cards.spec.ts`.

## Review

- Backend:
  - Added raster sentinel sanitization (-999, 1e30) for noise/air/heat sampling.
  - Climate WFS sampling now prefers polygons containing the point before centroid fallback.
  - Risk cache skip now avoids storing responses with lookup failures.
  - Added/expanded tests for sentinel handling, WFS containment, and caching behavior.
- Frontend:
  - Risk cards degrade to unavailable cards with an error banner (no more empty section).
  - Sunlight unavailable state now shows full badge/meaning/tip/source+date.
  - Added unknown source/date strings, fixed air unit display to µg/m³.
  - Updated unit/E2E tests to match degraded-path behavior.
- Verification:
  - Backend: `python -m ruff check` ✅; `python -m pytest -v --tb=short` ✅ (`105 passed, 5 deselected`); `python -m pytest tests/test_risk_cards_live.py -m live -v` ✅ (`5 passed`).
  - Frontend: `npm run test` ✅ (`121 passed`); `npm run build` ✅ (chunk size warning only).
  - E2E: `npm run test:e2e -- tests/e2e/f3-risk-cards.spec.ts` ✅ (2 passed).
