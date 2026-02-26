# Code Reviewer Agent Memory — buurt-check

> Detailed notes in topic files. This file is a concise index.
> Keep under 200 lines.

## Key Architecture Facts (verified)

- `NeighborhoodViewer3D.tsx`: single `useEffect` for Three.js init (lines ~190-292). Cleanup removes `renderer.domElement`. Any new DOM elements added inside that effect MUST also be removed in the same cleanup return.
- `get_neighborhood_3d` in `three_d_bag.py`: all partial flags (`bbox_partial`, `near_partial`, `immediate_partial`, `enrich_partial`), `target_found`, and `message` are all in scope at line ~738, just before the final `return`. `message` is assigned in a block ending ~line 737. Any log referencing `message` must be placed strictly after that block ends.
- Test file `test_three_d_bag.py`: 405+ tests baseline. Uses `_route_responses` helper that routes single-item vs. bbox but NOT near-ring vs. primary-paginated. For near-ring distinctions, use inline `side_effect` like `test_get_neighborhood_3d_keeps_completed_near_ring_context_when_bbox_has_context`.

## Sunlight v1 Corrections (2026-02-23)

- Previous "ShadowTimeSlider orphaned" note is resolved: `App.tsx` renders `ShadowTimeSlider` directly below `NeighborhoodViewer3D` and passes `shadowDateTime` through.
- `shadow_slider.*` i18n keys are present in both `frontend/src/i18n/en.json` and `frontend/src/i18n/nl.json`.
- Previous coordinate/Z-sign bug note is resolved: heatmap vertex coloring uses pre-converted roof points (`roofSampling.ts` conversion path), so the old sign-mismatch warning is obsolete.

## Recurring Anti-Patterns Found

- **DOM element leaks in Three.js useEffect**: any element created inside the init effect (overlay, debug badge, etc.) must be cleaned up in the effect's return function. Only `renderer.domElement` is auto-cleaned — all other appended children are not.
- **useState in animation loops**: using `useState` setter inside `requestAnimationFrame` callbacks causes a re-render per frame. Always use `useRef` for per-frame counters, timers, and display values; update DOM directly via `element.textContent`.
- **`import.meta.env.DEV` stored in variable**: storing as `const isDev = import.meta.env.DEV` prevents Vite from tree-shaking the dev branch in production builds. Always use the literal `if (import.meta.env.DEV)` in hot-path code.
- **DOM textContent updated every frame**: even in dev-only overlays, updating `textContent` every animation frame triggers layout recalculation. Gate updates to a 1-second boundary using a `lastResetRef`.
- **`any([...])` list literal in Python logging**: prefer `a or b or c or d` over `any([a, b, c, d])` in log arguments. The list form is flagged by ruff in some configurations.
- **Rules of Hooks before conditional return**: calling `useRef`/`useCallback` AFTER an early `return` inside a custom hook violates React's Rules of Hooks. Seen in `useAnimationPerformance.ts` — reduced-motion check returns early at line 24 before hooks at lines 32-86. Must restructure: call all hooks first, then gate logic on the reduced-motion flag inside callbacks.
- **Hardcoded strings bypass i18n even when keys exist**: `formatRelativeTime()` in `AddressSearch.tsx` returns English literals ('just now', 'yesterday') while `search.recentTime.*` keys exist in both language files. Any non-hook utility function must receive `t` as a parameter or be moved inside the component.
- **Combobox aria-expanded when no-results popup is open**: `isExpanded = isOpen && suggestions.length > 0` leaves `aria-expanded=false` while the no-results `<div id="address-suggestions">` is rendered. ARIA spec: `aria-expanded` must reflect popup visibility, not result count.
- **Duplicate id on conditional elements**: `id="address-suggestions"` is assigned to both the `<ul>` listbox AND the no-results `<div>` in `AddressSearch.tsx`. Though mutually exclusive in DOM, linters and validators flag this as an error.
- **Hardcoded series colors bypass design tokens**: FIXED in Story 10.4 (commit 17f1482). `SERIES_COLORS` hex array replaced with `SERIES_CLASSES` string array + `--color-compare-*` CSS custom property tokens. CSS custom properties ARE inherited by SVG `<polyline>`/`<circle>` children of a `<g>` that declares them — this is the correct theming pattern for SVG.
- **Touch targets below 44px in radiogroup toggles**: `settings-screen__lang-btn` and `settings-screen__theme-btn` have `min-height: 28px`. `export-sheet__language-btn` has only `padding: 8px 0` (~30px). Neither meets Apple HIG 44px minimum.
- **ExportBottomSheet.css missing prefers-reduced-motion**: The `stroke-dashoffset` transition at line 172 has no reduced-motion suppression. The compliance test's `CSS_FILES` array omits this file entirely.

## Testing Patterns

- Structured log assertions require `caplog` fixture: `with caplog.at_level(logging.INFO, logger="app.services.three_d_bag")`. Without this, logger.info calls have no test coverage.
- `_route_responses` helper in `test_three_d_bag.py` covers single-item vs. bbox URLs only. Near-ring vs. primary paginated requires inline side_effect with URL pattern matching (e.g., `limit=100` vs `limit=50`).
- Stacked `@patch` decorators inject arguments in reverse order: bottom decorator → first arg, top decorator → last arg. Verify `(mock_get_client, mock_settings)` matches `@patch settings` outer + `@patch _get_client` inner.

## Parallel Quadrant Fetch Architecture (Task 3, 2026-02-20)

- `_quadrant_bboxes(cx, cy, r)` at top of `three_d_bag.py` (line 28) returns 4 (label, bbox_str) tuples: NE/NW/SE/SW.
- Accelerated mode constants (lines 59-75): DEFAULT_RADIUS=120, BBOX_MAX_PAGES=1, BBOX_FETCH_BUDGET=35, BBOX_PAGE_TIMEOUT=30, BBOX_FETCH_RETRIES=4, TARGET_FETCH_BUDGET=30 (not in spec but functional).
- `_fetch_bbox_resilient` now branches on `settings.three_d_conservative_mode`: accelerated → `_fetch_bbox_parallel_quadrants`, conservative → original sequential backup logic.
- `near_task` in `_get_neighborhood_3d_impl` is `None` in accelerated mode; await block is guarded by `if near_task is not None`.
- Cache version bumped to v26 (from v25). Key: `neighborhood3d:v26:{mode}:{pand_id}:{rd_x:.0f}:{rd_y:.0f}`.
- Test C (near-ring skip test): checks URL pattern `bbox=120897,486897` for 108m near-ring at rd_x=121005, rd_y=487005. Math: max(120*0.9, 100)=108; 121005-108=120897, 487005-108=486897. ✅
- Stale comment at `test_three_d_bag.py` line 1169: "Target + 1 neighbor from Q0" — "Q0" is meaningless in conservative-only test context. Minor but misleading.

## slowapi Rate Limiting Patterns (Task 8.6, 2026-02-26)

- **Middleware + decorator architecture:** SlowAPIMiddleware (outermost) handles default limits. `@limiter.limit()` decorator handles route-specific limits. No double-counting because `_check_request_limit(in_middleware=True)` skips route limits for `__marked_for_limiting` routes.
- **`override_defaults=True` is default:** Route-specific `@limiter.limit('N/minute')` REPLACES the default limit, not adds to it. Endpoints without decorator use default 20/min.
- **`app.add_exception_handler(RateLimitExceeded, ...)` handles decorator-path 429s** (when limit exceeded inside route handler). SlowAPIMiddleware handles its own 429s via `sync_check_limits` + `_rate_limit_exceeded_handler` directly (falls back from async exception handler).
- **`get_remote_address` does NOT read X-Forwarded-For.** Behind a reverse proxy, all clients share the proxy's IP. Production fix: add uvicorn's `ProxyHeadersMiddleware` to populate `request.client.host` correctly. `slowapi.util.get_ipaddr` is NOT a safe alternative (uses `X_FORWARDED_FOR` key with underscores, which Starlette does not match against `x-forwarded-for` headers).
- **`limiter.reset()` autouse fixture:** Default scope is `function`. Double reset (autouse + test-local fixture) is harmless. Reset is sync -- no async needed.
- **Export endpoints do NOT need `response: Response` param** for header injection: when the route handler returns an explicit `fastapi.responses.Response` instance, the decorator injects headers directly into it. `response: Response` FastAPI injection param is only needed when the handler returns a dict (FastAPI creates the Response internally).
- **`_do_export_briefing` extraction is correct:** Removes code duplication between POST and GET export endpoints without breaking rate limiting (each route handler still has `request: Request` and `@limiter.limit` decorator).

## Links to Topic Files

- See `patterns.md` for more detail on Three.js instrumentation patterns.

## Resilience & Concurrent Safety Patterns (2026-02-25)

### Three Race Conditions Fixed in App.tsx

**A — Re-entrant async (rapid shortlist taps):** `abortControllerRef.current?.abort()` at top of `handleAddressSelect`, new controller created each call. Prevents duplicate API chains.

**B — Double-tap synchronous ops:** `isBookmarking`/`isExporting` boolean state guards. Check `if (isBookmarking) return;` at top, `setX(true)` before operation, `setX(false)` in `finally`. Pass as props to disable buttons in `ActionBar`.

**C — Post-await screen staleness:** `activeScreenRef` synced via `useEffect`. After any `await`, check `activeScreenRef.current !== 'dossier'` before updating screen state. Without this, backgrounded lookups can overwrite the current screen.

### Timer Cleanup Pattern

All `setTimeout`/`setInterval`/`requestAnimationFrame` IDs must be stored in `useRef`, not component state. Clear in:
1. `useEffect` cleanup return
2. On address reset (`handleAddressSelect` start)
3. On component unmount

Missing cleanup found in: Three.js pulse animation (`pulseTimerRef`), Toast timers, basemap `img.onload` callbacks.

### Error State Standard

Every async-fetched section follows this pattern in App.tsx:
```ts
const [xError, setXError] = useState<string | null>(null);
// On fetch: setXError(null); try { fetch } catch(err) { setXError(mapApiError(err, t)); }
// Pass to component: <Comp error={xError} onRetry={handleRetryX} />
// On address reset: setXError(null);
```
Components that previously had NO error state and were silently failing: `NeighborhoodViewer3D`, `ViewingChecklist`, `RiskDetailView`, `BuildingFactsCard`.

### Scroll Position Restoration

`scrollPositionsRef = useRef<Map<string, number>>(new Map())`. Save before tab change (use `getDossierScrollContainer()?.scrollTop` for internal scroll, `window.scrollY` for others). Restore in `requestAnimationFrame` callback after tab change.

### sessionStorage Pattern

`checklistStorage.ts` service: key `checklist:{vboId}`, stores `Set<string>` as JSON array. Load on address open, save on every toggle. Session-scoped only. This pattern applies to any per-address transient state.
