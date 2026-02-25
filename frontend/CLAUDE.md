# Frontend — React 18 + TypeScript 5 + Vite 6

Mobile-first SPA with "Polar Frost" design system. Framer Motion gestures, Three.js 3D viewer, Leaflet maps.

## Commands

```bash
npm run dev          # Dev server (proxies /api to localhost:8000)
npm run build        # MUST pass before commit (strict TS: noUnusedLocals)
npm run test         # Vitest (448+ baseline)
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
- Dark mode: `[data-theme="dark"]` overrides in `tokens.css`
- WCAG: use `--color-accent-text` (#1C8C83) for text, not `--color-accent` (#2EC4B6)
- Touch targets: 44px minimum (Apple HIG)

### i18n
- All strings via `useTranslation()` hook. Both `en.json` + `nl.json` updated together
- Key format: dot notation (`risk.noise.title`). Snake_case segments
- Warning codes: `t('feature.warning.${code}', code)` with fallback

### Three.js (NeighborhoodViewer3D.tsx)
- Plain Three.js only — NOT react-three-fiber
- Static context card: summer noon lighting, orbit controls, reset button
- `THREE.DoubleSide` on all materials (3DBAG winding inconsistent)
- Target building: Arctic Teal `0x2EC4B6`, emissive `0x57D4C8` (light 0.40, dark 0.20). Neighbors: `0x556E85` at 90% opacity (light), `0x8A9BB0` at 65% (dark)
- Dispose all geometries/materials/textures on cleanup
- `mergeGeometries` for non-target buildings (single draw call)
- WebGL `linewidth` > 1 unsupported — use geometry-based outlines for highlights
- Summer-noon effect resets lighting per frame — store light ref, gate overrides in condition

### Components
- Functional components, named exports, co-located CSS + tests
- Dossier canonical order (14 sections, enforced by regression test):
  AttentionSummary → AddressHeader → SummaryStrip → BuildingFacts → RiskTiles →
  PropertyWarnings → SoilInfo → Livability → 3DViewer → Sunlight →
  NeighborhoodStats → TierB → ViewingChecklist → ActionBar

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
- **Tab bar:** 3 tabs (Home, Briefing, Saved). `position: fixed; bottom: 0; z-index: 50`. Stateless component — no useState/useEffect. Dossier tab triggers PDF export sheet
- **DossierSheet bottom padding:** `calc(var(--tab-bar-height, 56px) + env(safe-area-inset-bottom, 0px) + var(--space-lg))`
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
- `SectionSkeleton` (`components/ui/SectionSkeleton.tsx`): variant-based skeleton for building-facts, property-warnings, livability, neighborhood-stats. Uses `Skeleton` atom, `aria-hidden="true"`, `data-testid` prop.

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
