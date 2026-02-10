# Phase 4 Quality Gates

Date: 2026-02-10

This document defines the Phase 4 hardening workflow for:
- accessibility
- performance validation
- visual regression QA

## 1. Accessibility

Automated checks:
- `npm run test:a11y`

Coverage:
- `frontend/src/test/accessibility.test.tsx`
  - App shell
  - Export bottom sheet
  - Compare screen
  - Tier-B signals card
- `frontend/src/test/keyboard-navigation.test.tsx`
  - Primary tab keyboard activation
  - Language toggle keyboard operation
  - Action bar keyboard actions

Implementation details:
- `jest-axe` audits are run in Vitest.
- Global focus visibility is enforced in `frontend/src/index.css`.

## 2. Performance Validation

Automated unit-level performance budget checks:
- `npm run test:perf`

Spec file:
- `frontend/src/test/performance-budget.test.tsx`

Budgets enforced:
- Compare screen repeated renders under threshold
- Tier-B card repeated renders under threshold

Optional browser-lane performance spec:
- `npm run test:perf:e2e`
- `frontend/tests/e2e/performance-budget.spec.ts`

Cold/warm backend timing utility:
- `python backend/scripts/measure_cold_warm_latency.py`

Example:
```powershell
python backend/scripts/measure_cold_warm_latency.py --base-url http://127.0.0.1:8000
```

The script prints cold vs warm timings for:
- building
- risks
- neighborhood
- tier-b

## 3. Visual Regression

Visual regression suite:
- `npm run test:visual`

Update baseline snapshots:
- `npm run test:visual:update`

Spec file:
- `frontend/tests/e2e/visual-regression.spec.ts`

Notes:
- API is mocked for deterministic rendering.
- 3D neighborhood context is stubbed to avoid unstable WebGL diffs.
- Baselines are mobile-first (`390x844`, light mode).

## 4. Recommended CI Order

1. `ruff check .` (backend)
2. `pytest -q` (backend)
3. `npm test` (frontend)
4. `npm run test:a11y` (frontend)
5. `npm run build` (frontend)
6. `npm run test:perf` (frontend, optional in fast CI lane)
7. `npm run test:visual` (frontend, full QA lane)
