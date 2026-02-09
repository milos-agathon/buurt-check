# Frontend — React + TypeScript + Plain Three.js

## Stack
- React 18, TypeScript 5, Vite 6 (dev server + bundler)
- Three.js (plain, NOT react-three-fiber) for 3D neighborhood viewer
- SunCalc for solar position calculations
- i18n: react-i18next + i18next-browser-languagedetector (EN/NL)
- Styling: Plain CSS with design system tokens (NO Tailwind, NO CSS-in-JS)
- GSAP for camera transitions in 3D viewer (300ms easing)
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
    tokens.css         — Design system CSS custom properties ("Clear Signal Hybrid")
    satoshi.css        — @font-face for Satoshi Variable (woff2)
  components/
    # Navigation shell
    TabBar.tsx         — 3-tab bottom nav (Search, Briefing, Saved), frosted glass
    TopBar.tsx         — Sticky header with title + language toggle
    # Search
    AddressSearch.tsx  — Autocomplete input with PDOK Locatieserver
    # Loading
    LoadingScreen.tsx  — Building animation + progress text between search and dossier
    BuildingAnimation.tsx — SVG canal house progressive draw animation
    # Dossier — address detail screen
    AddressHeader.tsx  — Street name, postcode, building facts, bookmark toggle
    SummaryStrip.tsx   — Horizontal scroll pills with risk scores
    BuildingFactsCard.tsx — Building year, floors, area, status
    BuildingFootprintMap.tsx — Leaflet 2D map with building footprint
    NeighborhoodViewer3D.tsx — Three.js 3D viewer (shadows, overlays, basemap)
    ShadowControls.tsx — Time slider + season presets + camera presets
    ShadowSnapshots.tsx — Canvas capture at 9:00/12:00/17:00 winter solstice
    OverlayControls.tsx — WMS overlay toggles with popover + opacity slider (25-75%)
    SunlightRiskCard.tsx — 12-month sunlight analysis with risk classification
    RiskTilesGrid.tsx  — 2x2 CSS Grid of risk tiles
    RiskTile.tsx       — Score tile (animated score, severity badge, summary)
    RiskDetailView.tsx — Full-screen detail with comparisons + viewing questions
    ExportBottomSheet.tsx — PDF export template selection + language toggle
    RiskCardsPanel.tsx — Risk data orchestrator (noise, air, climate, sunlight)
    NeighborhoodStatsCard.tsx — CBS indicators with urbanization badge, age bars
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
  types/
    api.ts             — TypeScript interfaces mirroring backend Pydantic models
  i18n/
    index.ts           — i18next config with browser language detection
    en.json            — English translations (~300 keys)
    nl.json            — Dutch translations (~300 keys)
  test/
    setup.ts           — Vitest setup (DOM mocks, i18n helpers)
    helpers.ts         — Test factories for API response mocks
```

## Design system — "Clear Signal Hybrid"

Design tokens in `styles/tokens.css`. All components use CSS custom properties.

### Colors
- **Primary:** `--color-primary: #1A1A2E` (Charcoal), `--color-accent: #00897B` (Electric Teal)
- **Risk severity:** `--color-risk-good: #2E7D68`, `--color-risk-moderate: #E8913A`, `--color-risk-poor: #D84315`, `--color-risk-critical: #B71C1C`
- **Surfaces:** `--color-bg: #F8F9FA`, `--color-surface: #FFFFFF`, `--color-surface-alt: #F4F5F7`

### Typography
- Font: Satoshi Variable (woff2, self-hosted from fontshare.com)
- 10-level type scale from `--type-display` (28px Black) to `--type-micro` (11px Regular)
- Score display: `--type-score-tile` (40px Black), `--type-score-large` (48px Black)

### Spacing
- 8pt grid: `--space-xs` (4px) through `--space-5xl` (64px)

### Layout
- Mobile-first, `--max-width: 600px` container
- Bottom tab bar: 56px + safe area
- Frosted glass: `backdrop-filter: blur(20px)`, 92% white opacity

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
- Available tokens: see `styles/tokens.css` for full reference (~170 tokens)

### i18n
- All user-facing strings via `useTranslation()` hook
- Key format: dot notation (`risk.noise.title`, `nav.search`)
- Both `en.json` and `nl.json` must be updated together
- Warning codes from backend: `t('risk.warning.${code}', code)` with fallback

### Three.js rules
- Plain Three.js — NOT react-three-fiber. All setup in `NeighborhoodViewer3D.tsx`
- Always use `THREE.DoubleSide` on building materials (3DBAG winding order inconsistent)
- Shadow map: `PCFSoftShadowMap`, 4096x4096 (adaptive fallback to 2048/1024), frustum +-300m, bias `-0.001`
- Must add `sunLight.target` to scene (missing = silent shadow failure)
- Dispose all geometries, materials, textures on cleanup
- SunCalc azimuth 0=south. Convert: `x = -sin(az)*cos(alt)*D`, `y = sin(alt)*D`, `z = cos(az)*cos(alt)*D`
- Camera presets as viewport overlay buttons (top-left). Use `gsap.to()` for 300ms transitions
- WMS overlays: `PlaneGeometry` at Y=0.1, `depthWrite: false`, always `revokeObjectURL()` on change
- Overlay opacity slider: 25-75% range, updates `MeshBasicMaterial.opacity` in real-time
- LoD 2.2 geometry from `roof_surfaces` — fan triangulation, Y-up coords, no rotation needed
- `mergeGeometries` from `three/addons/utils/BufferGeometryUtils.js` for non-target buildings (single draw call)
- FPS monitoring: 60-frame window, 3 consecutive low readings → reduce shadow map size + show banner
- Fullscreen: `requestFullscreen()` API + `fullscreenchange` event sync + CSS `.fullscreen` class
- Dark mode: target building color switches blue/teal based on `data-theme` attribute

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

- **Test count baseline: 324** — any change must maintain or increase
- Vitest 4.x + Testing Library + jsdom
- Three.js mock: constructor functions (not arrow fns — `new` fails). Use `function Scene(this: any) { this.add = vi.fn(); }` pattern
- react-leaflet mock: `MapContainer` → `<div data-testid="map">`, `TileLayer`/`GeoJSON` → `null`
- Fake timers + `userEvent.type()` = deadlock. Use `fireEvent.change` instead
- Fake timers + `waitFor` = deadlock. Switch to real timers before `waitFor`
- i18n in tests: fresh `i18n.createInstance()` per language in `setupTestI18n()`
- `vi.fn()` needs `mockReset()` in `beforeEach` (not `vi.restoreAllMocks()`)

## DO NOT
- Use Tailwind, CSS modules, or styled-components. Plain CSS + design tokens only
- Use React Query, Zustand, Redux, or any state management library
- Use react-three-fiber or drei. Plain Three.js only
- Use `any` type. Define proper interfaces in `types/api.ts`
- Use `console.log` for debugging in production code
- Hardcode English or Dutch text. All strings via `t()`
- Use CSS `!important` on canvas dimensions (breaks Three.js `renderer.setSize()`)
