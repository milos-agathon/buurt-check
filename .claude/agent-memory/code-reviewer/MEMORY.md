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

## Code Reuse Anti-Patterns Found (2026-02-28)

- **`_severity_for_score` in `pdf_export.py` duplicates `severity_from_score` in `scoring.py`.** The canonical function is in `scoring.py` and imported by every other service. `pdf_export.py` reimplements it with slightly different signature (`int | None` vs `int`, returns `str` vs `SeverityLevel`). Divergence risk: if score thresholds change in `scoring.py`, the PDF silently uses wrong colors. Fix: call `severity_from_score(score).value` and handle None at call site.
- **Facade-label encoding/decoding contract is stringly-typed.** `roofSampling.ts` produces labels like `facade:north:1.5m` as template literals in `NeighborhoodViewer3D.tsx:1267`. `sunlightAnalysis.ts:parseFacadeLabel` decodes by splitting on `:`. No TypeScript type enforces the schema. Fix: export a `buildFacadeLabel(orientation, height)` helper from `roofSampling.ts`.
- **`computeSignedArea2D` (`roofSampling.ts`) duplicates `signedArea` (`sunlightSampling.ts`).** Identical shoelace formula, different polygon type (`number[][]` vs `PolygonPoint2D[]`). Export the primitive and share it.
- **Property-warnings cache key constructed in two places** in `address.py`: route handler (lines 744-750) and `_fetch_property_warnings_for_export` (lines 935-941). Extract a `_property_warnings_cache_key(...)` helper function.

## Tregenza 145-Patch Sky Discretization (Task 4.1, 2026-03-01)

- **File:** `frontend/src/utils/tregenzaPatches.ts`
- **Export:** `getTregenzaPatches(): TregenzaPatch[]` — pure function, no state, deterministic
- **Architecture:** 8 rows (0-7), patch counts [30, 30, 24, 24, 18, 12, 6, 1] = 145 total
- **Math verified:**
  - Row altitude range: 6° to 90° (center of band)
  - Band width: fixed 12° per row, clamped to horizon (0°) and zenith (90°)
  - Solid angles: calculated via spherical cap formula `2π(sin(altHigh) - sin(altLow))`
  - Total solid angle: 2π steradians (hemisphere), no loss of precision
  - Azimuth uniform: `(2π * i) / count` patches per row, wraps cleanly at 2π
  - Circular boundary handling: test at `anisotropicSvf.test.ts:53` correctly handles azimuth wrap-around with `Math.abs(az - 0) < π/4 || Math.abs(az - 2π) < π/4` (boundary at 45° is tight but works)
- **Interface correctness:** `TregenzaPatch { altitude, azimuth, solidAngle (all radians/steradians), row }`
- **Test coverage:** 4 tests covering count, bounds, summation, and gradient. All pass.
- **Potential issues:** None found. Code is mathematically correct and well-documented.

## Anisotropic SVF via Perez Weighting (Task 4.3, 2026-03-01)

- **File:** `frontend/src/utils/anisotropicSvf.ts` + test
- **Formula:** `SVF = Σ(visible patches: lum*Ω*sin(alt)) / Σ(all patches: lum*Ω*sin(alt))`
- **Dependencies:** `getTregenzaPatches()` (discretization), `perezLuminance()` (weighting)
- **Callback interface:** `isVisible(altitude, azimuth): boolean` — clean, composable, caller-provided obstruction logic
- **Math verified:**
  - Tregenza + Perez weighting captures circumsolar and horizon brightening
  - `sin(altitude) = cos(zenith)` correctly applies cosine factor for horizontal plane
  - Normalization guard: `totalWeight > 0 ? visible/total : 0` safe (but Perez should never zero all patches)
- **Test coverage:** 8 tests (all visible/none visible, sun-facing vs. opposite, determinism, ranges, sun extremes)
- **Minor warnings:**
  1. `.toBeCloseTo(1.0, 1)` tolerance on open-sky tests may hide numerical drift — add explicit `weightSum === totalWeight` check
  2. No edge case test for `sunAlt < 0` (night) — behavior undefined, should clarify intent or clamp
  3. Comment at line 29 could note `sin(altitude)` implementation more clearly
- **Ready for:** Task 4.4 (viewer integration) — no external APIs, pure function, fast (145 iterations)

## Task 4.4: Anisotropic SVF Viewer Integration (2026-03-01)

- **New functions in `svfComputation.ts`:** `directionToFaceUV`, `isCubemapPixelSky`, `renderCubemapFaces`, `computeAnisotropicSvfFromCubemap`, `computeAnisotropicSvfMultiPoint`
- **Cubemap inverse mapping verified:** `directionToFaceUV` is algebraically the exact inverse of `cosineWeightForCubemapPixel`'s face assignment. Pixel reconstruction uses `floor(((u+1)/2)*size)` — 0.5 pixel off due to missing `-0.5`, acceptable at 64x64 resolution.
- **Azimuth convention chain verified consistent:** Tregenza azimuth 0=north; `isCubemapPixelSky` 0=north; `getSunDirection` uses SunCalc raw (0=south); viewer adds π before passing to `computeAnisotropicSvfMultiPoint` → all consistent.
- **Disposal in renderCubemapFaces:** `obstructionMat.dispose()` + `cubeTarget.dispose()` in `finally`. Clones removed from scene. `svfScene` itself is not disposed (has no GPU resources when not attached to renderer) — consistent with isotropic path.
- **renderCubemapFaces duplicates computeSvf setup:** ~35 lines of scene setup/teardown are copy-pasted. Minor code-reuse issue.
- **CRITICAL: No idle/paint wait guards before anisotropic SVF.** The isotropic main-thread fallback (lines 1410-1415) calls `waitForNextPaint` + `waitForMainThreadIdle` before computing. The anisotropic block (lines 1437-1472) runs immediately after, with no yield point. On mobile at 5 sample points, this renders 5 cubemaps × 6 faces = 30 GPU readbacks consecutively, stalling main thread for ~200-400ms.
- **Hardcoded unit string:** `SunlightRiskCard.tsx` line 179 has `kWh/m²/yr` hardcoded in JSX (not via i18n). The direct/diffuse values use `irradiance_direct`/`irradiance_diffuse` keys correctly (they include the unit). The main `irradianceKwhM2` display does not.
- **svfAnisotropic preserved in enrichedResult:** `enrichedResult` spreads from `sunlightResultRef.current ?? nextResult`, and `nextResult` contains `svfAnisotropic`. If `sunlightResultRef.current` was updated after anisotropic SVF was set and before weather resolves, `svfAnisotropic` is preserved ✓.
- **weatherPromise started before result is available:** `weatherPromise` is created at line 1296, before `result` is populated (lines 1342-1365). Network call is pre-fired. This is intentional and correct — parallel execution.
- **canEstimateIrradiance checks `nextResult.svf` but irradiance uses diffuse sky SVF:** Could be `svfAnisotropic` for better accuracy, but using isotropic `svf` for diffuse sky fraction is physically reasonable. Not a bug.
- **No test coverage for the new viewer wiring:** The viewer's anisotropic SVF branch is not tested in isolation. Only `computeAnisotropicSvf` unit tests and `anisotropicSvf.test.ts` exist. No test exercises the `computeAnisotropicSvfFromCubemap` → `isCubemapPixelSky` → `directionToFaceUV` chain with a real Three.js scene.

## PDF Type Hierarchy Patterns (Task 1 review, 2026-03-02)

- **`draw_age_bars` color restore bug pattern:** When changing a label from SLATE to SECONDARY inside a loop, any Bold value cell that immediately follows without an explicit `set_text_color(*SLATE)` inherits the SECONDARY color. fpdf2 does not restore color on font change. Always pair `set_font(...Bold...)` with explicit `set_text_color` when the previous color differs from what the Bold text should use.
- **Comment says "Bold 9pt both typically SECONDARY"** in hierarchy table, but Bold 9pt value cells (age %, dimension scores) render at SLATE per design intent. The word "typically" is misleading — Bold 9pt sub-variant color depends on semantic role: emphasis values are SLATE, not SECONDARY.
- **Margin change (10mm → 20mm) is safe:** All widths use dynamic `pdf.w - pdf.l_margin - pdf.r_margin`. Only one hardcoded `img_w = 80` exists (location map), which fits within new 170mm content width. Triptych and shadow images compute `content_w` dynamically.
- **Italic font removal is clean:** No remaining `"I"` style references. Footer still uses 7pt Regular (correctly kept per the hierarchy). The italic removal eliminated the need to register `Satoshi-Regular.ttf` under the `"I"` alias.
- **Regular 9pt elimination is complete:** Zero `'"Satoshi", "", 9'` calls remain. Hierarchy enforcement succeeded.
- **`set_top_margin` not called in `__init__`:** Only left/right margins are set to 20mm. Top margin remains at fpdf2 default (10mm). Bottom margin is 20mm via `set_auto_page_break(margin=20)`. This is intentional — header occupies ~15mm so effective top whitespace is correct.
- **Stale comment `# ~170mm` at line 787** still says 170mm after the change from 10mm to 20mm margins. The arithmetic is now correct (210 - 20 - 20 = 170mm), so the comment is actually accurate again — but it was accurate before too (190mm would have been wrong). No action needed.

## Executive Summary Generator (Task 5 review, 2026-03-02)

- **File:** `backend/app/services/pdf_export.py`, function `_generate_executive_summary` (lines 119-290)
- **Placement:** After shadow triptych, before risk grid, in `_draw_cover_page`. Correct per spec.
- **Bilingual:** Fully bilingual — all four sentences have EN/NL variants. Severity labels delegate to `_severity_label`.
- **Edge cases:** no-risks-only-sunlight, no-data-at-all (NL+EN), livability.available=False, livability=None — all handled, all tested.
- **DoD items verified:** cover summary present, top risk named, viewing actions present (sentence 4), bilingual, scores accurate.
- **BOTH Dutch misspellings are FIXED** as of commit 2396a4d: `risicocategorie\u00ebn` (ë+n) at line 183, `ge\u00efdentificeerd` (ï) at line 283.
- **Test count:** 17 new tests, all pass. Backend total: 829 passing.

## Phase 3 PDF Dossier Review (2026-03-02)

### Critical Bugs Found

- **`draw_premium_badge` leaves X at right margin.** `draw_premium_badge()` calls `set_xy(badge_x, ...)` then `cell(badge_w, ...)` — cursor advances to `pdf.w - pdf.r_margin`. Any subsequent `cell(0, ...)` has zero effective width. Two broken call sites: line 1025 (`_draw_shadow_triptych`) and line 2787 (`_draw_property_checks_page`). Fix: after `draw_premium_badge()`, call `pdf.set_x(pdf.l_margin)` before the next cell, OR add `new_x="LMARGIN"` to the badge's cell call. Livability at line 2592 correctly uses band+Y-backup pattern — copy that.
- **TEAL as text color on white page (WCAG fail).** Line 455: `self.set_text_color(*TEAL)` for footer page number. TEAL (#2EC4B6) on white = 2.17:1, fails WCAG AA. The constant's own comment says "fill only, never text." New in Phase 3. Fix: use `SECONDARY` (WCAG AA 4.52:1) for the page number, or omit explicit color.

### Warnings

- **`"Satoshi", "", 9` Regular 9pt survives at lines 3497, 3572.** Explicitly eliminated in Task 1 (E10-S1). Both are data-body cells (middle column of sources table + sunlight parameter value). Fix: replace with `"Satoshi", "", 10` (body) or `"SatoshiMedium", "", 9` (label).
- **`draw_premium_badge` does not restore fill color to white.** After `set_fill_color(*TEAL_LIGHT)` for the badge rect, no restore. Callers drawing filled rects after badge use stale TEAL_LIGHT fill. Currently benign but fragile.
- **`fpdf2.circle(x, y, r)` uses upper-left corner, not center.** Lines 1079 (`_draw_sparkline`) and 1168 (`_draw_radar_chart`): `pdf.circle(last_x, last_y, 1.2, "F")` renders dot offset by +r in both axes. Fix: pass `(x - r, y - r, r)`.
- **8 new content functions have zero direct unit tests.** `_draw_sparkline`, `_draw_radar_chart`, `_draw_sunlight_details`, `draw_premium_badge`, `draw_section_label(band=True)`, PDF metadata, score formulas, soil disclosure — only integration paths via 254 full-dossier tests.
- **`"Winter" if is_nl else "Winter"` is a no-op bilingual.** Line 1630. Both branches return the same string. Similarly "Equinox" has no Dutch translation (NL: "Dag-/nachtevening" or "Lente/herfst"). Minor cosmetic issue in Dutch PDFs.

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
