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
