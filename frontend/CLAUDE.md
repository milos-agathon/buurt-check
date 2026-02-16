# Frontend — React 18 + TypeScript 5 + Vite 6

Mobile-first SPA with "Polar Frost" design system. Framer Motion gestures, Three.js 3D viewer, Leaflet maps.

## Commands

```bash
npm run dev          # Dev server (proxies /api to localhost:8000)
npm run build        # MUST pass before commit (strict TS: noUnusedLocals)
npm run test         # Vitest (421+ baseline)
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
- Target building: Arctic Teal `0x2EC4B6`. Neighbors: slate `0xB4C0CE` at 60% opacity
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
