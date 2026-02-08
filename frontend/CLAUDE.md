# Frontend — React + TypeScript + Three.js

## Stack
- React 18, TypeScript 5, Vite, Zustand (state), React Query (data fetching)
- Three.js r160+, @react-three/fiber, @react-three/drei
- i18n: react-i18next (EN/NL, files in src/i18n/)
- Styling: Tailwind CSS 4 + shadcn/ui components
- Test: Vitest + React Testing Library
- Linting: eslint + prettier

## Key commands
- Dev server: `cd frontend && npm run dev`
- Build: `cd frontend && npm run build`
- Test: `cd frontend && npm run test`
- Test watch: `cd frontend && npm run test:watch`
- Lint: `cd frontend && npm run lint`
- Type check: `cd frontend && npx tsc --noEmit`

## Project structure
- `src/App.tsx` — Root layout, routing, i18n provider
- `src/pages/` — Route-level components: `DossierPage.tsx`, `ComparePage.tsx`, `ShortlistPage.tsx`
- `src/components/` — Reusable UI, organized by feature:
  - `AddressInput/` — Postcode + house number form with Dutch validation
  - `RiskCard/` — Generic risk card component + specific cards (NoiseCard, AirCard, ClimateCard, SunlightCard)
  - `NeighborhoodSnapshot/` — CBS indicators display
  - `ThreeViewer/` — Three.js viewer container, controls, overlays
  - `ShadowTimeline/` — Time slider + date picker for shadow simulation
  - `Shortlist/` — Save, compare, export controls
  - `PDFExport/` — Viewing Briefing generation
  - `ui/` — shadcn/ui primitives (Button, Card, Dialog, etc.)
- `src/hooks/` — Custom hooks: `useAddress.ts`, `useDossier.ts`, `useThreeScene.ts`, `useShadowSim.ts`
- `src/services/` — API client functions (one per backend endpoint)
- `src/three/` — Three.js-specific code (NOT React components):
  - `scene.ts` — Scene setup, lighting, camera presets
  - `cityjson-loader.ts` — CityJSON parsing, geometry creation, semantic surface splitting
  - `materials.ts` — Period-appropriate facade materials, orthophoto roof materials
  - `shadows.ts` — DirectionalLight config, shadow map setup, SunCalc integration
  - `overlays.ts` — WMS layer compositing on ground plane
  - `ground.ts` — Ground plane with orthophoto texture
- `src/i18n/` — `en.json`, `nl.json` (flat key structure: `"riskCards.noise.title"`)
- `src/stores/` — Zustand stores: `addressStore.ts`, `shortlistStore.ts`, `viewerSettingsStore.ts`
- `src/types/` — Shared TypeScript types and interfaces

## Conventions — follow these exactly

### Component pattern
```tsx
// Functional component with named export. Props interface colocated.
interface RiskCardProps {
  level: "low" | "medium" | "high";
  titleKey: string;        // i18n key
  explanationKey: string;  // i18n key
  source: string;
  dataDate: string | null;
  viewingQuestions: string[];  // Already translated by backend
}

export function RiskCard({ level, titleKey, ... }: RiskCardProps) {
  const { t } = useTranslation();
  // ...
}
```

### Data fetching
Use React Query for all backend calls. Query keys follow: `[feature, ...params]`.
```tsx
const { data, isLoading, error } = useQuery({
  queryKey: ['dossier', address],
  queryFn: () => fetchDossier(address),
  staleTime: 5 * 60 * 1000,  // 5 min
  retry: 1,
});
```

### Three.js rules — CRITICAL
- Shadow map: `renderer.shadowMap.type = THREE.PCFSoftShadowMap`
- Shadow map auto-update OFF: `renderer.shadowMap.autoUpdate = false` — only trigger `renderer.shadowMap.needsUpdate = true` when sun position changes
- ONE DirectionalLight only. Never add a second shadow-casting light.
- Shadow camera frustum: `left/right/top/bottom = ±300`, near=1, far=1000
- Shadow bias: `-0.0005`, normalBias: `0.02`
- NEVER use `side: THREE.DoubleSide` on building materials — causes shadow artifacts. Fix winding order instead.
- Coordinate system: 3DBAG vertices arrive in EPSG:28992. Subtract scene center point to place target building at origin. Do NOT reproject to WGS84.
- Surrounding buildings: merge into single BufferGeometry with vertex colors (not individual meshes). Target: <8 draw calls total.
- Dispose textures and geometries in cleanup: `geometry.dispose()`, `material.dispose()`, `texture.dispose()`

### Progressive loading sequence
Follow this exact order to meet the <6s mobile target:
1. (0–1s) Init empty scene with ambient light, show spinner
2. (1–3s) Fetch CityJSON + ground orthophoto in parallel
3. (3–4s) First render: semantic solid colors, shadows work → hide spinner
4. (4–5s) Apply orthophoto roof texture + full shadow map
5. (5–6s) Load facade atlas, apply procedural shaders to target building

### i18n
- All user-facing strings go through `t()`. Never hardcode English or Dutch text.
- Key format: `namespace.component.element` (e.g., `riskCards.noise.title`)
- Dutch translations must be reviewed — do not auto-translate. Add English first, mark NL as `"TODO: [english text]"` for manual review.

### Styling
- Use Tailwind utilities. No inline styles. No CSS modules.
- Color tokens defined in tailwind.config: `primary`, `risk-low`, `risk-medium`, `risk-high`
- Responsive: mobile-first. Breakpoints: `sm:`, `md:`, `lg:`
- The Three.js canvas is full-width on mobile, 60% width on desktop with cards in a sidebar

## DO NOT
- Import Three.js classes directly in React components. All Three.js code lives in `src/three/` and is consumed via hooks.
- Use `useEffect` for data fetching. Use React Query.
- Use `any` type. Define proper interfaces in `src/types/`.
- Add new shadcn/ui components without running `npx shadcn-ui@latest add [component]`.
- Use `console.log` for debugging. Use the `debug` npm package with namespaces.
- Modify the ShadowTimeline slider to auto-play — it must be user-controlled only.
- Create components larger than 200 lines. Extract sub-components.