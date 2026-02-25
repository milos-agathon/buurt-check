# Frontend Code Reviewer Memory — buurt-check

> Keep under 200 lines. Detailed notes in topic files.

## Test Baselines (verified 2026-02-25)

- Frontend tests after Epic 5+6: **660 tests, 77 files** (all passing)
- Backend non-live tests: **466+** baseline
- i18n: **515 keys** per language after Epic 6 (was 380 pre-Epic-1)

## CSS Token Pitfalls (verified in Epic 6 review)

- `--type-heading-small` is NOT defined in `tokens.css` — using it silently fails.
  Found in `AddressSearch.css:269`. Closest valid tokens: `--type-h3` (17px bold) or `--type-body-medium` (15px 500).
- `--color-risk-good` (#22C55E) passes WCAG AA as text on white (6.1:1 ratio). Safe to use.
- `--color-text-inverse` (#FFFFFF light / #1C2D3F dark) — correct for text on accent/primary backgrounds.
- `:first-of-type` on class-based selectors does NOT work as expected in CSS.
  `div.app__phase-divider:first-of-type` matches the FIRST `<div>` in parent, not first with that class.
  Use `:first-child`, data attributes, or JS instead. Confirmed bug in Epic 6 phase dividers.

## localStorage Patterns

- Convention: `buurt-check-{feature}` prefix for all keys.
- Both `firstVisit.ts` and `tooltipTracker.ts` use try/catch on all localStorage access. This is the required pattern.
- `isFirstVisit()` is called inline in JSX (not in state/effect). This means it reads localStorage on every render. Acceptable for this project (cheap read, no SSR).

## Recurring Bugs to Watch

- **Hardcoded GitHub URL**: `SettingsScreen.tsx` has `https://github.com/milosblag/buurt-check/issues` hardcoded as a constant `GITHUB_ISSUES_URL`. Not in config/env. Fine for now but note for future.
- **`color: #fff` in new CSS**: `NeighborhoodViewer3D.css:105` uses `color: #fff` instead of `var(--color-text-inverse)`. Minor dark mode token violation — white stays white in dark (correct), but breaks token audit tools.
- **missing type="button"**: The "What's next?" buttons in App.tsx (lines ~2110-2160) do NOT have `type="button"`. They are not inside a `<form>` so submit behavior is harmless, but project convention is always explicit.
- **`searching` state not cleared on AbortError**: In `AddressSearch.tsx`, AbortError case explicitly leaves `searching=true` (correct — a new fetch is starting). But if AbortController is aborted without a new fetch starting (e.g., on blur), the indicator stays indefinitely. Acceptable tradeoff.

## Phase Tracking Architecture (Epic 6)

- `activePhase` state in `App.tsx` tracks 'house'|'buurt'|'action' via scroll event listener.
- Phase detection uses `getBoundingClientRect()` on `section-action-start` and `section-buurt-start` divs.
- Active phase resets when `activeScreen` changes (scroll effect dependency `[activeScreen, address?.id]`).
- `activePhase` state does NOT reset to 'house' on new address selection (only if address?.id changes).

## ContextualTooltip Component

- `role="status"` + `aria-live="polite"` — screen readers announce content on appearance.
- 8-second auto-dismiss with `window.setTimeout`. Cleanup on unmount. Position: absolute within `position: relative` wrapper.
- z-index 30. ActionBar is z-index 41 — tooltip inside ActionBar's stacking context so renders correctly.
- `pointer-events: none` on the 3D viewer controls hint overlay (correct — must not block canvas interaction).

## Epic 6 Anti-Patterns Avoided

- All localStorage access wrapped in try/catch (private browsing safe).
- All new animations respect `prefers-reduced-motion: reduce`.
- `--color-accent-text` (not `--color-accent`) used for text on light backgrounds.
- New CTA buttons use `min-height: 44px` for touch targets.
- i18n parity maintained: 515 keys in both EN and NL, zero divergence.
