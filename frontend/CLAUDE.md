# Frontend — React 18 + TypeScript 5 + Vite 6

Mobile-first SPA with "Polar Frost" design system. Framer Motion gestures, Three.js 3D viewer, Leaflet maps.

## Commands

```bash
npm run dev          # Dev server (proxies /api to localhost:8000)
npm run build        # MUST pass before commit (strict TS: noUnusedLocals)
npm run test         # Vitest (867+ baseline)
npx vitest --watch   # Watch mode
```

## Key conventions

### State & data
- App-level `useState` in `App.tsx`. No Zustand/Redux/Context
- Screen routing via `activeScreen` state
- Native `fetch` in `services/api.ts`. No axios/React Query
- `AbortController` with explicit timeouts per endpoint
- Three-state async: `loading`, `data`, `error` — always manage all three

### CSS & design system
- Plain CSS + tokens from `styles/tokens.css` (~195 tokens). NO Tailwind
- BEM-like naming: `component-name__element--modifier`
- All colors/spacing/typography via `var(--token-name)`
- Theme policy: light is the first-launch default and the effective System theme; dark mode is explicit opt-in via `[data-theme="dark"]` overrides in `tokens.css`
- WCAG: use `--color-accent-text` / `--color-accent-hover` (#00685F) for teal text on light backgrounds, not `--color-accent` (#0D9488). Use `--color-tertiary` (#C36D4B) for warm evidence/caution benchmarks. Full palette: `docs/palette.md`
- Touch targets: 44px minimum (Apple HIG)

### i18n
- All strings via `useTranslation()` hook. Both `en.json` + `nl.json` updated together
- Key format: dot notation (`risk.noise.title`). Snake_case segments
- Warning codes: `t('feature.warning.${code}', code)` with fallback
- Keep EN/NL key parity; current floor assertion is 396+ keys per language, including `premium.*` monetization keys

### Export purchase flow
- The on-screen dossier viewer remains free; do not document or build it as a post-purchase premium surface
- `reportId` identifies the current address snapshot for export and checkout coordination
- Buyer-bound entitlement determines whether `full_dossier` can be downloaded for the current address
- `quick_brief` remains the free export path; `full_dossier` starts checkout when no entitlement exists
- Browser-only trial or entitlement shortcuts are deprecated and must not be used for the product contract

### Checkout flow
- Three billing providers: Stripe (web), Google Play (Android TWA), Apple (iOS Capacitor). Resolved at runtime by `billingProvider.ts`
- Provider priority: Apple (Capacitor iOS) > Google Play (Digital Goods API) > Stripe (web fallback)
- `isAppleBillingContextAvailableSync()` / `isPlayBillingContextAvailableSync()` for conditional rendering (sync); `isAppleBillingReady()` / `isPlayBillingReady()` for actual use (async)
- Upgrade actions call `createCheckoutSession(report_id)` then redirect to Stripe URL (web path)
- Post-redirect verification reads hash query params (`report`, `session_id`) and polls entitlement state
- Guard against duplicate checkout starts with `isCheckingOut` boolean
- Funnel events are tracked in `services/analytics.ts` (checkout started/completed/failed, dossier unlocked, etc.)
- The supported contract is buyer-scoped verification for `full_dossier` only; preview-era full-view overrides are deprecated

### Three.js (NeighborhoodViewer3D.tsx)
- Plain Three.js only — NOT react-three-fiber
- Static context card: summer noon lighting, orbit controls, reset button
- `THREE.DoubleSide` on all materials (3DBAG winding inconsistent)
- Target building: Polar Frost teal `0x0D9488`, emissive `0x6BD8CB` (light 0.40, dark 0.20). Neighbors: `0x5A5F62` at 90% opacity (light), `0xBCC9C6` at 65% (dark)
- Dispose all geometries/materials/textures on cleanup
- `mergeGeometries` for non-target buildings (single draw call)
- WebGL `linewidth` > 1 unsupported — use geometry-based outlines for highlights
- Summer-noon effect resets lighting per frame — store light ref, gate overrides in condition

### Components
- Functional components, named exports, co-located CSS + tests
- Dossier canonical order (viewer sections only):
  AttentionSummary → combined AddressHeader/BuildingFacts → RiskTiles →
  Livability → 3DViewer → NeighborhoodStats → ViewingChecklist → ActionBar
- Premium-only sections (PDF only, NOT in viewer):
  PropertyWarnings, SoilInfo, shadow snapshots, sunlight evidence, heatmap overlay
- RiskTilesGrid appears ONCE at the top (after AddressHeader), not duplicated lower

## Testing patterns

- Three.js mock: constructor functions (not arrows — `new` fails)
- react-leaflet mock: `MapContainer` → `<div data-testid="map">`
- Fake timers + `userEvent.type()` = deadlock → use `fireEvent.change`
- Fake timers + `waitFor` = deadlock → switch to real timers first
- Framer Motion mock: `vi.mock('framer-motion', ...)` returning forwarded `motion.div`
- i18n: fresh `i18n.createInstance()` per language in tests
- `vi.fn()` needs `mockReset()` in `beforeEach`, not `restoreAllMocks()`
- Puppeteer screenshot regression: validate at iPhone 375w and Android 360w breakpoints

## Anti-patterns

- Tailwind / CSS modules / styled-components → plain CSS + tokens
- React Query / Zustand / Redux → useState + props
- react-three-fiber / drei → plain Three.js
- `any` type → define interfaces in `types/api.ts`
- Hardcoded EN/NL text → all strings via `t()`
- CSS `!important` on canvas → breaks `renderer.setSize()`
- `console.log` in production code
- CSS `font` shorthand before `font-weight`/`font-style` → shorthand resets them
- Custom severity vocab (`low/medium/high`) → use canonical `good/moderate/poor/critical` via SeverityBadge
- `.catch(() => undefined)` on fire-and-forget async → swallows critical failures silently. Use IIFE with `console.error` at minimum
- `if (import.meta.env.DEV)` on critical error logging → hides production failures. Always log critical errors unconditionally

## 3D Viewer — On-demand Rendering (added 2026-02-17)

- **Invalidation-driven rendering:** Replace continuous 60fps rAF with `renderOnce()` calls after every scene mutation (building added, basemap tile loaded, sun position change, resize, shadow snapshot)
- **OrbitControls damping loop:** Wire `start`/`end` event listeners. On `end`, schedule 500ms delayed stop allowing damping to decay, then cancel rAF and render final frame. Use refs (not useState) for damping state
- **Rollback flag:** `VITE_VIEWER3D_CONTINUOUS_RENDER=true` restores legacy 60fps loop
- **Feature-flagged quality controls:** `VITE_VIEWER3D_SHADOW_SIZE` (default 2048), `VITE_VIEWER3D_DPR_CAP` (default 2), `VITE_VIEWER3D_TILE_GRID` (default 3x3). Read with `Number(import.meta.env.VITE_X) || default`
- **Explicit loading prop:** Never infer loading from `buildings.length === 0`. Pass `surroundingLoading` from App.tsx. Hide reset button during loading
- **Dev render counter:** Guard with literal `import.meta.env.DEV` (not stored in variable — Vite tree-shaking needs literal). Create DOM overlay in useEffect init, update via `setInterval(1000)`, clean up overlay in cleanup
- **OrbitControls mock must include `addEventListener`/`removeEventListener`** for on-demand rendering tests

## Card Layout & Tab Bar (added 2026-02-17)

- **Card width:** All dossier cards use `margin: 0` (full DossierSheet width). Text inset via padding on individual elements, not card-level margins
- **Tab bar:** 3 tabs (Home, Briefing, Saved). `position: fixed; z-index: 50`. Two-layer structure: outer `.tab-bar` owns safe-area padding + `--viewport-bottom-offset`, inner `.tab-bar__inner` owns flex layout. Stateless component — no useState/useEffect. Dossier tab triggers the export sheet
- **DossierSheet bottom padding:** `calc(var(--viewport-bottom-offset, 0px) + var(--tab-bar-height, 56px) + var(--dossier-action-bar-offset, 0px) + env(safe-area-inset-bottom, 0px) + var(--space-lg))`
- **OLED dark mode trap:** Semi-transparent overlays on `#000000` are invisible. Use solid `var(--color-nav-bg)` with accent borders
- **Risk tile titles:** No parenthetical technical details in tile labels

## Comparison Bars (added 2026-02-17)

- **WHO guideline bar:** `opacity: 0.7` on accent color (not `repeating-linear-gradient` dashes — too pixelated). Solid bars for measured values, semi-transparent for reference/guideline
- **Opacity tuning:** 0.35 too washed, 0.55 still pale, 0.7 is the sweet spot for distinction with visual weight

## i18n & Branding (added 2026-02-17)

- **NL is default language** (changed from EN)
- **Logo:** "Buurt Check" (no hyphen), 36px height, checkmark scale 0.56

## Coordinate Conversion (added 2026-02-17)

- **WGS84-to-RD linear approximation:** 68710 m/deg longitude, 111320 m/deg latitude at ~52°N (Amsterdam). Sufficient for ±500m bbox calculations

## Mobile Browser Chrome Compensation (added 2026-04-04)

- **`useViewportBottomOffset` hook**: Computes `layoutViewportHeight - (visualViewportHeight + offsetTop)` via `window.visualViewport` API. Publishes `--viewport-bottom-offset` CSS custom property on `<html>`.
- **Problem**: Mobile browsers (Chrome, Safari) show dynamic bottom chrome (URL bar, toolbar) that covers `position: fixed; bottom: 0` elements. `env(safe-area-inset-bottom)` only covers device notch/home indicator, NOT browser UI.
- **All fixed-bottom elements must include `var(--viewport-bottom-offset, 0px)`**: TabBar, ActionBar, Toast, BottomSheet, DossierSheet, AnalyticsConsentBanner. Forgetting one element = it gets covered by browser chrome.
- **rAF throttling**: `visualViewport` resize/scroll events fire rapidly during chrome animation. Single `requestAnimationFrame` gate prevents layout thrashing.
- **Cleanup**: Hook cleanup resets CSS var to `0px` and cancels pending rAF.
- **E2E test**: `tab-bar-visual-viewport.spec.ts` mocks `visualViewport` metrics and asserts `--viewport-bottom-offset` propagation.

## Resilience & Polish Patterns (added 2026-02-25)

### Error State Contract

Every async-loaded component must have `error: string | null` + `onRetry: () => void` props. Never silently swallow failures:
- State in `App.tsx`: `const [xError, setXError] = useState<string | null>(null)`
- Clear error before retrying: `setXError(null); /* ...fetch... */`
- Clear all section errors on new address select (reset alongside data)
- Map caught errors via `mapApiError(err, t)` for user-friendly messages
- Affected in this session: `NeighborhoodViewer3D`, `ViewingChecklist`, `RiskDetailView`, `BuildingFactsCard`

### Concurrent Operation Safety

Three separate patterns for different race conditions:

**A — Re-entrant async handlers (rapid shortlist taps):**
Use `abortControllerRef = useRef<AbortController | null>(null)`. Call `.abort()` at the top of the handler before creating a new controller. Pass signal to fetch calls.

**B — Boolean guards for sync-looking operations (double-tap bookmark/export):**
`isBookmarking`/`isExporting` state guards. Check at top of handler, `setX(true)` at start, `setX(false)` in `finally`. Pass to `ActionBar` to disable buttons during operation.

**C — Post-await screen guard (background lookup overwriting current screen):**
`activeScreenRef = useRef<Screen>(initialScreen)`. Sync via `useEffect(() => { activeScreenRef.current = activeScreen; }, [activeScreen])`. After any `await`, check `activeScreenRef.current` before updating screen-specific state.

### Timer Cleanup

Store ALL timer IDs in refs, never state. Clear in `useEffect` cleanup AND on address reset:
- `pulseTimerRef.current` for Three.js pulse animation (clear on viewer unmount AND address change)
- Toast's `timeoutId` stored in component-level ref, cleared on unmount
- Basemap `img.onload`: null-check that element is still in DOM before invoking callback
- Pattern: `if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }`

### Scroll Position Restoration

Use `scrollPositionsRef = useRef<Map<string, number>>(new Map())` to save/restore per screen:
1. Save scroll **before** changing screen: read `getDossierScrollContainer()?.scrollTop` or `window.scrollY`
2. Restore **after** DOM update via `requestAnimationFrame(() => { el.scrollTop = savedPos; })`
3. Distinguish internal scroll (`.dossier-sheet__content` with `overflow-y: auto`) from `window.scrollY`
4. New address selection resets dossier scroll to 0 (fresh start, not restoration)

### sessionStorage for Per-Address State

Use `services/checklistStorage.ts` pattern for any state that should survive tab switches:
- Key: `checklist:{vboId}`. Load on address open, save on every toggle. Session-scoped (clears on page close).
- Service exports: `saveCheckedQuestions(vboId, Set<string>)` + `loadCheckedQuestions(vboId): Set<string>`

### Skeleton Layout Fidelity

- `RiskTileSkeleton` must mirror `RiskTilesGrid`'s exact CSS grid (2 columns, 2 rows, same gap). Mismatched structures cause layout shift on load. Validate at 375px (iPhone) and 360px (Android).
- `SectionSkeleton` (`components/ui/SectionSkeleton.tsx`): variant-based skeleton for building-facts, livability, neighborhood-stats. Uses `Skeleton` atom, `aria-hidden="true"`, `data-testid` prop. Note: property-warnings variant is no longer used in the viewer (premium-only).

### ConfirmSheet Pattern

Reusable bottom-sheet for destructive action confirmation (`components/ui/ConfirmSheet.tsx`). Props: `open`, `title`, `body`, `confirmLabel`, `cancelLabel`, `onConfirm`, `onCancel`. Required i18n keys: `common.cancel` + `common.confirm`. Used for Settings "Clear" actions.

### Text Overflow Protection

Required for any container with dynamic/translated text:
- Long Dutch street names (47+ chars): `overflow-wrap: break-word` on `AddressHeader` street element
- Risk tile labels (e.g., "Wegverkeersgeluid"): `white-space: nowrap; overflow: hidden; text-overflow: ellipsis`
- Two-column stat layouts: ellipsis on BOTH label and value cells to prevent overflow at 360px

### Deep-Link Error Handling

URL pattern `#/address/{vboId}?lookup=...` must handle PDOK lookup failure:
1. Show user-facing toast with localized error message
2. Navigate to search screen (not leave user on broken dossier)
3. Handle both cases: lookup failure AND missing `lookupId`

### 3D Viewer Retry Pattern

Retry clears `viewer3DTriggered` flag and resets `deferred3DParamsRef`, then re-triggers with a 0ms `setTimeout`:
```ts
setViewer3DTriggered(false);
deferred3DParamsRef.current = { ...params };
setTimeout(() => { setViewer3DTriggered(true); trigger3DFetch(); }, 0);
```

### ExportBottomSheet UX Rules

- Hide "Generate PDF" button when `progressStage === 'ready'` (show Share/Download instead)
- Show spinner + "Exporting..." in ActionBar export button when `isExporting` is true


## Session Learnings (2026-03-05) — P0 Sunlight Pipeline Fix

- **SVF `readRenderTargetPixels` face index**: Three.js r182 requires explicit `activeCubeFaceIndex` as last argument when reading from `WebGLCubeRenderTarget`. Without it, `bindFramebuffer()` crashes in `finally` block with array instead of single framebuffer. Affects both Worker and main-thread fallback.
- **`onBeforeGenerate` hook pattern**: `ExportBottomSheet` accepts async `onBeforeGenerate` callback. `App.tsx` implements it to submit sunlight data and await backend cache confirmation before allowing export. If hook fails, export is aborted with user-visible error.
- **Export button gating on `sunlightReady`**: `disabled` prop includes `!sunlightReady` check for `full_dossier` templates. Prevents export before sunlight completes (or times out).
- **180s sunlight timeout safety net**: `useEffect` timer starts when surrounding buildings load. If sunlight hasn't completed by 180s, sets `sunlightUnavailable = true` to release export button gate.
- **Three-source sunlight submission with dedup**: `sunlightSubmissionPromiseRef` tracks in-flight promise. Three triggers (`analysis`, `entitlement-sync`, `export`) join single promise to prevent duplicate requests.
- **Per-template export timeouts**: `EXPORT_TIMEOUT_FULL_MS` (180s) for `full_dossier`, `EXPORT_TIMEOUT_QUICK_MS` (90s) for `quick_brief`. Configurable via env vars.
- **iOS PDF download workaround**: `downloadPdfBlob()` detects iOS (WebKit ignores `download` attribute on blob URLs) and falls back to `window.open()`.
- **Canvas overlay UI scaling**: Shadow snapshot overlays (compass, scale bar, legend) use `uiScale` factor relative to offscreen canvas width for resolution-independent sizing.
- **`loadingRef.current` guard on sunlight start**: Prevents sunlight computation during Phase 1 (target-only, surrounding still loading) which would produce incorrect results.
- **Test patterns**: `onBeforeGenerate` blocking test uses externally-controlled promise + verify export API not called while pending. iOS download test mocks `navigator.userAgent` to iPhone UA string.

## Sunlight Workers & Web Worker Patterns (added 2026-02-28)

- **Worker density bifurcation**: Bridge defaults to 256 points at 1m grid spacing. Main-thread fallback explicitly 64 points at 2m spacing. Constants exported from roofSampling.ts (HIGH_DENSITY_GRID_SPACING, HIGH_DENSITY_MAX_POINTS)
- **Transferable ownership trap**: postMessage(data, transferList) detaches ArrayBuffer ownership -- .byteLength becomes 0 in sender. If you serialize geometry once and transfer it, you cannot reuse those buffers for a second Worker. Drop transferables when compute time (30-120s) dwarfs copy cost (3-6MB)
- **Persistent Workers must dispose per-message allocations**: Sunlight Worker (persistent) accumulates deserialized mesh geometries across address changes. Added finally block to iterate and dispose all mesh geometries. SVF Worker (ephemeral, per-call) correctly relies on termination
- **Raycaster hoisted to module scope** in persistent Worker: created once, reused across messages
- **Dead old Worker system deleted**: sunlight.worker.ts, sunlightWorkerClient.ts, sunlightWorkerProtocol.ts (243 lines) -- superseded by workers/ directory
- **Shared analysis params object**: 8 hardcoded values (intervalMinutes, maxPoints, etc.) extracted to shared analysisParams used by both Worker and main-thread paths. Prevents silent drift between paths
- **Worker-vs-main-thread in jsdom**: jsdom lacks Worker constructor, so all Worker tests exercise main-thread fallback. Use MockWorker class with emit() helper for Worker-specific tests
- **SVF Worker has no dedup/abort guard**: retrying sunlight analysis 3 times spawns 3 independent SVF Workers. Each creates WebGL context (100-500ms on mobile)

## Code Simplification Patterns (added 2026-02-28)

- **Deduplicate by export + import**: toViewerPolygon was byte-for-byte identical in roofSampling.ts and sunlightSampling.ts. Export from source, import in consumer
- **Unnecessary array copy**: ensureCW non-reversing branch used [...footprint] for no reason. Just return footprint directly
- **Dead ?? fallbacks**: Nullish coalescing fallbacks on Worker result fields that are always present are unreachable dead code
- **Redundant mutable tracking**: method variable tracked analysisMethod across async branches, but Worker already stamps analysisMethod on its result. Derive from result instead
- **updateMatrixWorld(true) redundancy**: Calling per-mesh in serializeBuildings triggers 150 redundant parent traversals for direct scene children. Call scene.updateMatrixWorld(false) once before loop, then obj.updateMatrix() inside

## Sunlight v2 Phases 4-6 (added 2026-03-01)

### Phase 4: Anisotropic Sky View Factor

- **Tregenza 145-patch sky discretization:** 8 elevation bands with patch counts [30, 30, 24, 24, 18, 12, 6, 1]. Memoize at module level — `getTregenzaPatches()` allocates fresh array per call
- **Perez all-weather sky luminance model:** CIE clear sky type 12 coefficients. Sensitive to sun position (altitude/azimuth)
- **Deterministic summer noon for Perez weighting:** `new Date()` breaks at night — sun altitude=0 zeroes anisotropic SVF entirely. Use fixed June 21 noon timestamp for consistent results regardless of when computation runs
- **Cubemap scene resource lifecycle:** `createSvfSceneResources()`/`disposeSvfSceneResources()` for allocation/cleanup. Do not recreate per evaluation point
- **Geometry mapping functions (`directionToFaceUV`, `isCubemapPixelSky`)** are geometrically tricky — need dedicated unit tests, not just integration coverage
- **SunCalcToNorthAzimuth helper:** +Math.PI convention for SunCalc-to-north conversion. Has dedicated tests documenting the convention

### Phase 5: Weather-Corrected Irradiance

- **UTC time extraction:** Use `getUTCHours()` for minute extraction from ISO date strings. Local time extraction is off by 1-2 hours (DST-dependent)
- **Multi-point majority-vote averaging** for irradiance is better than single eval point
- **`alignWeather()` 30-minute max-distance guard:** Weather TMY data aligned to nearest timestep; reject if >30min gap
- **Conditional disclaimer text:** Switch to weather-aware disclaimer when weather data is actually used
- **`emitPerTimestep` overhead:** Flag always enabled even when irradiance not needed. Memory overhead but not a correctness issue

### Phase 6: Standards Benchmarking

- **Viewer simplification note:** Standards benchmarking is no longer rendered as a dedicated viewer card; sunlight evidence remains export-only

## Session Learnings (2026-03-03)

- **Subagent CSS property analysis has significant false-negative rate**: Explore subagents reading grep snippets can miss properties present later in the same CSS block. Always verify subagent CSS claims by reading full rule blocks directly
- **Refactored code locations invalidate DoD line references**: Story 2.4 referenced `AddressHeader.tsx:49` for an aria-label, but that code had moved to `ActionBar.tsx`. DoD items referencing file:line locations become stale after refactoring
- **Frontend seasonal shadow field gap**: `api.ts` sends only `shadow_image_b64` and `shadow_images`, not `shadow_equinox_b64`/`shadow_summer_b64`. Cross-cutting gap between frontend export and backend PDF rendering

## Session Learnings (2026-03-24) — Apple App Store + Vercel

### Capacitor iOS Integration
- **`@capacitor/core` must be in frontend `package.json`**: It is a peer dependency of Capacitor plugins. Even though root monorepo has it, frontend imports (`appleBilling.ts`) need it in their own dependency tree.
- **`isAppleBillingContextAvailableSync()` for routing**: Checks `Capacitor.isNativePlatform()` + plugin registered. Safe for conditional rendering. `isAppleBillingReady()` (async) fetches actual product from StoreKit — needed before showing prices.
- **Store pending report ID before StoreKit sheet**: `storePendingAppleBillingReport(reportId)` writes to localStorage before `purchaseProduct()` since the payment sheet blocks the thread. Clear on success/abort. Recover on page reload.
- **`downloadPdfBlob()` iOS path**: WebKit ignores `download` attribute on blob URLs. Detect iOS and fall back to `window.open()` with `noopener,noreferrer`.

### Build & Deployment
- **`npm exec` behaves differently in Vercel**: `npm exec -- node ./scripts/foo.mjs` resolves differently. Fix: spawn `node` directly via `process.execPath` with resolved absolute path in `scripts/build.mjs`.
- **`quoteArg()` + `cmd.exe` pattern**: Windows requires `cmd.exe /d /s /c` wrapper for spawning node scripts. Pattern duplicated across multiple `.mjs` build scripts.

### Privacy / Legal Pages
- **Static HTML for app store compliance**: `public/privacy.html` with dedicated `legal.css`. Store review bots and crawlers need accessible pages without JavaScript execution.
- **Hash-based navigation back to SPA**: Legal pages use `/#/search` links matching the app's hash routing pattern.

## Test Baseline (updated 2026-03-01)

- **Vitest**: 867 tests (post-Sunlight v2 Phases 4-6)
- **i18n**: 396+ keys per language with parity + floor assertions


## Session Learnings (2026-03-26 to 2026-04-02) � Post-Checkout + Mobile

### Post-Checkout Recovery
- **recoveryMode parameter pattern**: Pass recoveryMode: 'checkout_return' through address selection so 404s on entitlement are treated as 'not yet processed' rather than 'doesn't exist'.
- **handledCheckoutParamsRef dedup gate**: A ref tracks processed checkout params, preventing stale URL params from re-triggering verification on re-renders.
- **sessionStorage for cross-reload state**: Store checkout return context before URL scrubbing. Clear on success, definitive failure, and retry exhaustion.
- **URL scrubbing via history.replaceState**: Strip billing query params immediately after capture. Use replaceState (not pushState) to avoid polluting browser history.
- **Gate recovery on shadow snapshot availability**: Don't auto-trigger export if shadows haven't been computed. Let user trigger manually after data loads.

### Mobile / Touch
- **pointerDown over mouseDown**: Touch events don't fire mouseDown. Use pointerDown with pointerType: 'touch' and isPrimary: true.
- **Price format through i18n**: Hardcoded comma-formatted prices outside bilingual system show Dutch format to English users.

### CSS Patterns
- **position: absolute; top: 100% resolves against nearest positioned ancestor**: Can be sticky parent rather than intended relative parent. Nest dropdown inside correct positioning context.
- **Flex height propagation requires flex: 1 at every chain level**: Not just the outer container.

### SVG Building Silhouettes
- **SVG Y-axis increases downward**: Subtracting from body_top floats elements above roof. Recurring coordinate-direction trap.
- **Complex SVG paths as blobs at small sizes**: Use composite geometric primitives (separate rect + polygon) for readable silhouettes.
- **Curved gable shapes misread culturally**: klokgevel/halsgevel read as mosque domes. Restrict to unambiguous macro-shapes.

## Session Learnings (2026-04-03) -- Post-Checkout Export

- **Removed bypassPrerequisites timeout fallback**: Previously auto-generated PDF after 10s if prerequisites (shadows) were not ready. Now waits indefinitely until user triggers manually. Prevents generating incomplete dossiers.
- **Single boolean prerequisite gate**: postCheckoutPrerequisitesReady replaces complex bypass + timeout logic. Reduces ExportBottomSheet state by 2 variables and 1 timeout constant.
