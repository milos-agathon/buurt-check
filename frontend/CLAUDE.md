# Frontend — React + TypeScript + Framer Motion + Plain Three.js

## Stack
- React 18, TypeScript 5, Vite 6 (dev server + bundler)
- Framer Motion for spring animations, gestures, shared element transitions
- Three.js (plain, NOT react-three-fiber) for 3D neighborhood viewer
- SunCalc for solar position calculations
- i18n: react-i18next + i18next-browser-languagedetector (EN/NL)
- Styling: Plain CSS with design system tokens (NO Tailwind, NO CSS-in-JS)
- Test: Vitest 4.x + React Testing Library + jsdom
- Linting: TypeScript strict mode via `npm run build`
- No state management library — App-level `useState` + props

## Key commands
- Dev server: `cd frontend && npm run dev` (proxies /api to backend at localhost:8000)
- Build: `cd frontend && npm run build` (TypeScript strict, catches unused vars/params)
- Test: `cd frontend && npm run test`
- Test watch: `cd frontend && npx vitest --watch`

## Project structure
```
src/
  App.tsx              — Root component, screen routing, state management
  App.css              — App layout, screen containers
  index.css            — Global resets, imports tokens + fonts
  styles/
    tokens.css         — Design system CSS custom properties ("Polar Frost")
    satoshi.css        — @font-face for Satoshi Variable (woff2)
  components/
    # Navigation shell
    TabBar.tsx         — 3-tab bottom nav (Search, Briefing, Saved), solid white + teal pill
    TopBar.tsx         — Sticky header with title + language toggle
    # Search
    AddressSearch.tsx  — Autocomplete input with PDOK Locatieserver
    # Loading
    SkeletonCard.tsx   — Shimmer loading placeholder cards (replaces full-screen blocker)
    # Dossier — address detail screen
    DossierSheet.tsx   — Gesture-driven bottom sheet with 4 snap points (framer-motion drag)
    AddressHeader.tsx  — Street name, postcode, building facts, bookmark toggle
    AttentionSummary.tsx — Green/amber/red badge aggregating all dossier warnings
    SummaryStrip.tsx   — Horizontal scroll pills with risk scores
    BuildingFactsCard.tsx — Building year, floors, area, status
    BuildingFootprintMap.tsx — Leaflet 2D map with building footprint
    NeighborhoodViewer3D.tsx — Three.js 3D static context card (summer noon, orbit controls, reset button)
    ShadowSnapshots.tsx — Canvas capture at 9:00/12:00/17:00 winter solstice
    SunlightRiskCard.tsx — 12-month sunlight analysis with risk classification + building orientation
    RiskTilesGrid.tsx  — 2x2 CSS Grid of risk tiles
    RiskTile.tsx       — Score tile (animated score, severity badge, summary)
    RiskDetailView.tsx — Full-screen detail with comparisons + viewing questions
    ExportBottomSheet.tsx — PDF export template selection + language toggle
    RiskCardsPanel.tsx — Risk data orchestrator (noise, air, climate, sunlight)
    NeighborhoodStatsCard.tsx — CBS indicators with urbanization badge, age bars
    PropertyWarningsCard.tsx — Foundation, erfpacht, VvE, asbestos warning cards
    ViewingChecklist.tsx — Aggregated viewing questions with checkboxes
    ActionBar.tsx      — Sticky bottom bar (Add to Shortlist / Export Briefing)
    LanguageToggle.tsx — EN/NL segmented control
    # Shortlist / Compare
    ShortlistScreen.tsx — Saved addresses with mini risk dots, compare button
    CompareScreen.tsx  — Multi-column score comparison with difference highlighting
    SettingsScreen.tsx — Language, dark mode toggle, clear data, version info
    # UI primitives
    ui/SeverityBadge.tsx  — 4-level risk icon + label (good/moderate/poor/critical)
    ui/ScoreBar.tsx       — Animated horizontal bar with severity coloring
    ui/AnimatedScore.tsx  — Count-up animation (0→target, 600ms, requestAnimationFrame)
    ui/QuartileDots.tsx   — 4 dots indicating score quartile position
    ui/BottomSheet.tsx    — Modal sheet with backdrop + drag handle
    ui/Toast.tsx          — Slide-up notification with auto-dismiss
    ui/ToggleSwitch.tsx   — 44x24px toggle with teal active state
  services/
    api.ts             — Native fetch API client (no axios), AbortSignal support
    shortlist.ts       — localStorage CRUD for saved addresses (max 3)
    recentSearches.ts  — localStorage CRUD for recent searches (max 10)
    theme.ts           — Dark mode service (light/dark/system, localStorage + matchMedia)
  hooks/
    usePressable.tsx   — Press state tracking for touch interactions
  utils/
    haptic.ts          — Navigator.vibrate() wrapper with permission checks
    spring-constants.ts — Named Framer Motion spring configs (SHEET, EXPAND, REVEAL, TAB)
  types/
    api.ts             — TypeScript interfaces mirroring backend Pydantic models
  i18n/
    index.ts           — i18next config with browser language detection
    en.json            — English translations (~395 keys)
    nl.json            — Dutch translations (~395 keys)
  test/
    setup.ts           — Vitest setup (DOM mocks, i18n helpers)
    helpers.ts         — Test factories for API response mocks
```

## Design system — "Polar Frost"

Design tokens in `styles/tokens.css`. All components use CSS custom properties.

### Colors
- **Primary:** `--color-primary: #1C2D3F` (Polar Slate), `--color-accent: #2EC4B6` (Arctic Teal)
- **WCAG-safe accent text:** `--color-accent-text: #1C8C83` (teal.600, 4.52:1 on white) — use instead of `--color-accent` for text on light backgrounds
- **Risk severity:** `--color-risk-good: #22C55E`, `--color-risk-moderate: #EAB308`, `--color-risk-poor: #EF4444`, `--color-risk-critical: #B91C1C`
- **Surfaces:** `--color-bg: #FAFBFC`, `--color-surface: #FFFFFF`, `--color-surface-alt: #F5F7F9`

### Typography
- Font: Satoshi Variable (woff2, self-hosted from fontshare.com)
- 10-level type scale from `--type-display` (28px Black) to `--type-micro` (11px Regular)
- Score display: `--type-score-tile` (40px Black), `--type-score-large` (48px Black)

### Spacing
- 8pt grid: `--space-xs` (4px) through `--space-5xl` (64px)

### Layout
- Mobile-first, `--max-width: 600px` container
- Bottom tab bar: 56px + safe area
- Tab bar: solid white background + teal pill on active tab. Top bar: dark slate (`--color-nav-bg: #1C2D3F`)

## Conventions — follow these exactly

### Component pattern
- Functional components with props interface colocated
- Named exports (not default) for most components
- Co-located CSS files with BEM-like naming: `component-name__element--modifier`
- Co-located test files: `Component.test.tsx` next to `Component.tsx`

### State management
- App-level state in `App.tsx` via `useState` — no Zustand, no Redux, no Context
- Screen routing: `activeScreen` state (`'search' | 'dossier' | 'shortlist' | 'compare' | 'settings'`)
- Pass data down as props. Lift state up when siblings need to share
- Theme preference: `ThemePreference = 'light' | 'dark' | 'system'` stored in localStorage via `services/theme.ts`

### Data fetching
- Native `fetch` in `services/api.ts`. No React Query, no axios
- `AbortController` with explicit timeouts for each endpoint
- Three-state async model: `loading`, `data`, `error` — all three always managed

### CSS
- Plain CSS with design tokens from `tokens.css`. NO Tailwind, NO CSS modules
- Mobile-first. Component CSS co-located (e.g., `AddressSearch.css`)
- Use `var(--token-name)` for all colors, spacing, typography, radii, shadows
- Dark mode: `[data-theme="dark"]` selectors override token values in `tokens.css`
- Available tokens: see `styles/tokens.css` for full reference (~195 tokens, including slate/teal scale intermediates, nav/overlay utility, choropleth ramps)

### i18n
- All user-facing strings via `useTranslation()` hook
- Key format: dot notation (`risk.noise.title`, `nav.search`)
- Both `en.json` and `nl.json` must be updated together
- Warning codes from backend: `t('risk.warning.${code}', code)` with fallback

### Three.js rules
- 3D viewer is a **static context card** with summer noon lighting and orbit controls. No interactive time slider, camera presets, fullscreen, or WMS overlays. Single reset button calls `frameCamera()`.
- Plain Three.js — NOT react-three-fiber. All setup in `NeighborhoodViewer3D.tsx`
- Always use `THREE.DoubleSide` on building materials (3DBAG winding order inconsistent)
- Shadow map: `PCFSoftShadowMap`, 2048x2048, frustum +-200m, bias `-0.001`
- Must add `sunLight.target` to scene (missing = silent shadow failure)
- Dispose all geometries, materials, textures on cleanup
- SunCalc azimuth 0=south. Convert: `x = -sin(az)*cos(alt)*D`, `y = sin(alt)*D`, `z = cos(az)*cos(alt)*D`
- LoD 2.2 geometry from `roof_surfaces` — fan triangulation, Y-up coords, no rotation needed
- `mergeGeometries` from `three/addons/utils/BufferGeometryUtils.js` for non-target buildings (single draw call)
- Target building: Arctic Teal (`0x2EC4B6`) with teal.300 emissive glow, in both light and dark mode
- Neighbor buildings: uniform slate.200 (`0xB4C0CE`) at 60% opacity (no construction-year colors)

### Risk scoring (0-100 scale)
- Backend provides `score` (0-100) and `severity` (good/moderate/poor/critical) on each risk card
- Frontend displays score in `RiskTile`, full detail in `RiskDetailView`
- Severity thresholds: 70-100=good, 40-69=moderate, 20-39=poor, 0-19=critical
- Sunlight score computed client-side from winter solstice hours
- Comparison chart in detail view: address vs city avg vs NL avg vs WHO limit

### Shortlist
- localStorage-backed via `services/shortlist.ts`
- Max 3 addresses. Each stores: vboId, address, postcode, city, buildingYear, riskScores, savedAt
- Compare view: side-by-side columns with difference highlighting (>15pt spread)

## Testing patterns

- **Test count baseline: 385** (updated 2026-02-13) — any change must maintain or increase
- Vitest 4.x + Testing Library + jsdom
- Three.js mock: constructor functions (not arrow fns — `new` fails). Use `function Scene(this: any) { this.add = vi.fn(); }` pattern
- react-leaflet mock: `MapContainer` → `<div data-testid="map">`, `TileLayer`/`GeoJSON` → `null`
- Fake timers + `userEvent.type()` = deadlock. Use `fireEvent.change` instead
- Fake timers + `waitFor` = deadlock. Switch to real timers before `waitFor`
- i18n in tests: fresh `i18n.createInstance()` per language in `setupTestI18n()`
- Framer Motion mock: `vi.mock('framer-motion', ...)` returning forwarded `motion.div` components
- `vi.fn()` needs `mockReset()` in `beforeEach` (not `vi.restoreAllMocks()`)

## DO NOT
- Use Tailwind, CSS modules, or styled-components. Plain CSS + design tokens only
- Use React Query, Zustand, Redux, or any state management library
- Use react-three-fiber or drei. Plain Three.js only
- Use `any` type. Define proper interfaces in `types/api.ts`
- Use `console.log` for debugging in production code
- Hardcode English or Dutch text. All strings via `t()`
- Use CSS `!important` on canvas dimensions (breaks Three.js `renderer.setSize()`)
