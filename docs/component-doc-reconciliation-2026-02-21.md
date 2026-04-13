# Component Docs Reconciliation (2026-02-21)

> Alignment note (2026-04-12): For any guidance affecting `https://buurt-check.nl/`, its associated legal pages, or `https://app.buurt-check.nl/#/search` and adjacent app UI states, `docs/plans/2026-04-12-website-and-app-design-10-10-spec.md` is the governing document. If this file conflicts with that spec on layout, hierarchy, spacing, visual system, bilingual asset handling, desktop adaptation, loading-state clarity, export recovery UX, or legal-page consistency, the 2026-04-12 spec controls.

## Basis
Reconciliation performed using `docs/alignment-decisions.md` as the arbiter for cross-doc conflicts.

Authority order applied:
1. `docs/design-spec.md` (canonical "how")
2. `docs/design-prd.md` (canonical "what/why")
3. `docs/ui-principles.md` (advisory)

## Reconciled Component Decisions
1. Top bar behavior
- Source conflict: transparent-on-top vs fixed dark slate.
- Decision: fixed dark slate top bar (A-3).
- Applied updates: `docs/design-prd.md` section 3.2 and `docs/design-spec.md` section 17.

2. Bottom tab bar visual direction
- Source conflict: glass white bar vs non-flipping dark nav language in principles.
- Decision: dark slate non-flipping nav, aligned with A-3 rationale and current design direction.
- Applied updates: `docs/design-prd.md` section 3.1 and `docs/design-spec.md` section 16.

3. Input height contract
- Source conflict: 52px vs 56px for primary search input.
- Decision: 56px for address search, 52px for secondary inputs (A-5).
- Applied updates: `docs/design-prd.md` section 2.3.

4. Score typography contract
- Source conflict: one score token for tile and detail.
- Decision: split tokens: `--type-score-tile` (40px) and `--type-score-large` (48px) (A-6).
- Applied updates: `docs/design-prd.md` type scale and risk-detail section.

5. Comparison chart color systems
- Source conflict: mixed color semantics between risk-detail bars and compare chart lines.
- Decision (A-7):
  - Risk detail bars: `--color-chart-address`, `--color-chart-city`, `--color-chart-national`, `--color-chart-threshold`.
  - Compare lines: `--color-compare-1`, `--color-compare-2`, `--color-compare-3`.
- Applied updates: `docs/design-prd.md` section 6.3 + compare section, `docs/design-spec.md` section 15.2 + 15.6.

6. Cross-doc authority note
- Decision: explicit reminder that visual implementation conflicts defer to `design-spec.md`.
- Applied updates: header note added in `docs/design-prd.md`.

7. Dossier section ordering — "house first, buurt second" (2026-02-22)
- Source conflict: spec places 3D viewer immediately after summary strip; implementation places it at position 9 of 14. Both result in two maps on screen at once or the 3D viewer being buried.
- Decision (A-8): New ordering principle. House-level sections (building facts, risk tiles, property warnings, soil) precede neighborhood sections (livability, 3D viewer, sunlight, stats, tier B). ViewingChecklist and ActionBar close the dossier.
- Applied updates: `docs/design-spec.md` section 3.1, `docs/design-prd.md` sections 3.3 + 4.3.2, `docs/ui-principles.md` section 2, `docs/alignment-decisions.md` A-8.

8. 3D viewer sizing and camera framing (2026-02-22)
- Source conflict: spec says 50vh/280px/420px; implementation uses 20vh/140px/170px.
- Decision (A-9): Compromise at 40vh/240px/360px. Camera framing must be tight/isometric — buildings and ground plane only, no blue sky visible.
- Applied updates: `docs/design-spec.md` section 4.1, `docs/design-prd.md` section 4.3.2, `docs/ui-principles.md` section 7, `docs/alignment-decisions.md` A-9.

## Files Updated In This Reconciliation
- `docs/design-prd.md`
- `docs/design-spec.md`
- `docs/ui-principles.md`
- `docs/alignment-decisions.md`
- `docs/component-audit-findings-2026-02-21.md`
- `docs/component-doc-reconciliation-2026-02-21.md`

## Remaining Intentional Status
- This reconciliation aligns the docs with each other; it does not force implementation parity.
- Implementation drift remains tracked in `docs/component-audit-findings-2026-02-21.md`.
