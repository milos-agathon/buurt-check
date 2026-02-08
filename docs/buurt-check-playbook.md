# buurt-check — Claude Code Workflow Playbook

> Concrete steps, boilerplate prompts, CLAUDE.md files, and subagent definitions for shipping buurt-check with maximum session efficiency.

---

## Part 1: Workflow Scenarios & Boilerplate Prompts

---

### Scenario A: Planning a Milestone

You are about to start a new feature (e.g., F3 — Risk Cards). You have not written any code for it yet. Your goal is a plan so precise that a fresh Claude Code session can one-shot the implementation.

**Step-by-step:**

1. Open a terminal in your monorepo root.
2. Run `claude` to start a session.
3. Press `Shift+Tab` twice to enter **Plan Mode**.
4. Paste the planning prompt below (adapted to your milestone).
5. Claude will explore the codebase in read-only mode and produce a plan.
6. Review the plan. Push back on anything vague — ask "what exact file, what exact function signature, what exact import?"
7. When satisfied, tell Claude: `Save this plan to docs/plans/f3-risk-cards-plan.md`
8. Exit the session (`/exit`). Do NOT start coding in this session.
9. Open the saved plan in your editor. Edit it yourself — add constraints, remove unnecessary steps, reorder.
10. `git add docs/plans/f3-risk-cards-plan.md && git commit -m "plan: F3 risk cards"`

**Boilerplate Prompt — Planning:**

```
think hard

# Planning Session: [FEATURE NAME]

## Your task
Read the relevant source files and produce a detailed implementation plan. Do NOT write any code.

## Context
- Read `docs/prd.md` sections: [RELEVANT SECTIONS, e.g., "F3 — Risk Cards", "§8 Data sources D/E/F"]
- Read the existing backend service pattern in `backend/services/bag.py` (this is our reference implementation for external API integration)
- Read the existing risk card component pattern in `frontend/src/components/RiskCard/` if it exists
- Read `backend/models/` to understand our PostGIS schema conventions
- Read `CLAUDE.md` in root, backend/, and frontend/

## Requirements
[PASTE THE SPECIFIC PRD REQUIREMENTS FOR THIS FEATURE — copy verbatim from prd.md]

## Plan format
Produce a plan with exactly this structure:

### 1. Files to create (full paths)
For each file: purpose, key exports/functions, dependencies on other files in this plan.

### 2. Files to modify (full paths)
For each file: what changes, why, and the exact function/class being modified.

### 3. Implementation order
Number each step 1–N. Each step must:
- Touch at most 3 files
- Be independently testable
- End with a git commit message

### 4. Test plan
For each implementation step: the test file path, what it tests, key assertions.

### 5. Integration verification
The exact manual steps to verify the feature works end-to-end after all steps are complete.

### 6. Risk flags
Anything in this plan that depends on an assumption about external API behavior, browser compatibility, or data format that should be validated first.

Do NOT write any code. Only produce the plan.
```

---

### Scenario B: Executing a Milestone

You have a reviewed plan in `docs/plans/f3-risk-cards-plan.md`. You are starting a fresh session to implement it.

**Step-by-step:**

1. Ensure your working tree is clean: `git status` should show nothing.
2. Create a feature branch: `git checkout -b feature/f3-risk-cards`
3. Run `claude` to start a fresh session.
4. Paste the execution prompt below.
5. After each plan step completes, Claude should commit. Verify the commit happened: check your git log in a separate terminal.
6. Monitor context usage with `/cost` after every 2–3 steps.
7. **At 60% context usage:** Tell Claude to dump progress to `docs/plans/f3-risk-cards-progress.md`, then run `/clear` and re-enter with: `Read docs/plans/f3-risk-cards-plan.md and docs/plans/f3-risk-cards-progress.md. Continue from step N.`
8. After all steps complete, run the integration verification from the plan.
9. If tests pass: `git push -u origin feature/f3-risk-cards`

**Boilerplate Prompt — Execution:**

```
ultrathink

# Implementation Session: [FEATURE NAME]

Read `docs/plans/f3-risk-cards-plan.md` — this is the reviewed implementation plan.

## Rules for this session
1. Implement the plan step by step in the exact order specified.
2. After completing each step, run the tests specified in the plan for that step.
3. If tests pass, commit with the message specified in the plan.
4. If tests fail, fix the implementation (not the tests) until they pass, then commit.
5. Do NOT refactor, optimize, or add features beyond what the plan specifies.
6. Do NOT modify any test files that were written in a previous step.
7. If you encounter an ambiguity in the plan, stop and ask me before proceeding.
8. After every commit, report: "Step N/M complete. Tests: X passed, Y failed."

## Context files to read first
- `CLAUDE.md` (root)
- `backend/CLAUDE.md`
- `frontend/CLAUDE.md`
- `docs/plans/f3-risk-cards-plan.md`

Begin with step 1.
```

**Boilerplate Prompt — Execution Continuation (after /clear):**

```
ultrathink

# Continuation: [FEATURE NAME]

Read these files in order:
1. `docs/plans/f3-risk-cards-plan.md` — the full implementation plan
2. `docs/plans/f3-risk-cards-progress.md` — progress so far

Continue from step [N]. All previous steps are complete and committed.

## Rules (same as before)
1. Implement the plan step by step in the exact order specified.
2. After completing each step, run the tests specified in the plan for that step.
3. If tests pass, commit with the message specified in the plan.
4. If tests fail, fix the implementation (not the tests) until they pass, then commit.
5. Do NOT refactor, optimize, or add features beyond what the plan specifies.
6. Do NOT modify any test files that were written in a previous step.
7. If you encounter an ambiguity in the plan, stop and ask me before proceeding.
8. After every commit, report: "Step N/M complete. Tests: X passed, Y failed."

Begin with step [N].
```

---

### Scenario C: Debugging a Failure

Something is broken — a test fails, a runtime error occurs, or behavior doesn't match the PRD. Your goal is a targeted fix without disrupting working code.

**Step-by-step:**

1. Reproduce the error and capture the exact output (error message, stack trace, screenshot).
2. Start a new Claude Code session (never debug in a session that's been running for a while — stale context causes hallucinated fixes).
3. Paste the debugging prompt below with the exact error.
4. Let Claude explore the codebase to understand the issue. Insist on read-first: "Explore first, don't change anything yet."
5. Claude proposes a fix. Review it before accepting.
6. After the fix, verify: run the specific failing test AND the full test suite for that module to catch regressions.
7. Commit the fix separately: `fix: [description]`

**Boilerplate Prompt — Debugging:**

```
think hard

# Debug Session

## The error
```
[PASTE EXACT ERROR OUTPUT / STACK TRACE / FAILING TEST OUTPUT HERE]
```

## Reproduction
[HOW TO TRIGGER: e.g., "Run `pytest backend/tests/test_noise_card.py::test_wms_timeout` — it fails with the above error"]

## What should happen
[EXPECTED BEHAVIOR: e.g., "When the RIVM WMS endpoint times out after 5s, the noise risk card should render with status 'Data temporarily unavailable' and a retry button, not crash the entire dossier generation."]

## What actually happens
[ACTUAL BEHAVIOR: e.g., "The WMS timeout propagates as an unhandled httpx.TimeoutException, causing a 500 on /api/dossier/{address}. No graceful degradation occurs."]

## Rules
1. Read the relevant source files first. Do NOT change anything until you've explained the root cause to me.
2. Explain: (a) what is broken, (b) why, (c) your proposed fix, (d) what other code paths might be affected.
3. Only after I approve, implement the fix.
4. After fixing, run the failing test AND the full test suite for the affected module.
5. Do NOT refactor unrelated code. Minimal surgical fix only.
```

**Boilerplate Prompt — Follow-up Work / Polish:**

```
think

# Follow-up: [AREA]

The feature [FEATURE NAME] is implemented and all tests pass on branch `feature/[branch]`.

## Task
[SPECIFIC FOLLOW-UP, e.g.:]
- Add Dutch (NL) translations for all user-facing strings in the risk cards (F3). The English strings are already in `frontend/src/i18n/en.json` under the `riskCards` namespace. Create the corresponding entries in `frontend/src/i18n/nl.json`.
- Add JSDoc comments to all exported functions in `backend/services/noise.py` and `backend/services/air_quality.py`.
- Add error boundary component around the Three.js viewer so a WebGL crash doesn't take down the entire page.

## Rules
1. Read the existing code and patterns first.
2. Follow the exact conventions already established in the codebase.
3. Run relevant tests after changes.
4. Commit each logical change separately with a descriptive message.
```

---

## Part 2: CLAUDE.md Files

> The root CLAUDE.md is excluded per your request. Below are the three subdirectory files.

---

### `backend/CLAUDE.md`

```markdown
# Backend — FastAPI + PostGIS + Redis

## Stack
- Python 3.12, FastAPI, SQLAlchemy 2.0 + GeoAlchemy2, PostGIS, Redis, httpx (async)
- Test: pytest + pytest-asyncio + httpx.AsyncClient
- Linting: ruff check . && ruff format --check .

## Key commands
- Run server: `cd backend && uvicorn main:app --reload --port 8000`
- Run all tests: `cd backend && pytest -x -q`
- Run single test: `cd backend && pytest tests/test_bag.py::test_address_lookup -v`
- Lint: `cd backend && ruff check . --fix && ruff format .`
- DB migrations: `cd backend && alembic upgrade head`
- Generate migration: `cd backend && alembic revision --autogenerate -m "description"`

## Project structure
- `main.py` — FastAPI app factory, CORS, lifespan
- `api/` — Route handlers. One file per feature: `address.py`, `dossier.py`, `risk_cards.py`, `neighborhood.py`, `shortlist.py`, `export.py`, `render.py`
- `services/` — Business logic + external API clients. One file per data source: `bag.py`, `three_d_bag.py`, `pdok_ortho.py`, `rivm_noise.py`, `rivm_air.py`, `klimaat.py`, `cbs.py`, `ep_online.py`, `mapillary.py`
- `services/forge3d_client.py` — Async client to the forge3d render service (PyO3 bindings)
- `models/` — SQLAlchemy + GeoAlchemy2 models. Use `Geometry('POINT', srid=28992)` for all spatial columns (RD New)
- `schemas/` — Pydantic v2 models for request/response validation
- `core/` — Config (`settings.py`), Redis client (`cache.py`), exceptions (`errors.py`)
- `tests/` — Mirror source structure: `tests/services/test_bag.py`, etc.

## Conventions — follow these exactly

### External API integration pattern
Every service in `services/` that calls an external API must follow this pattern:
```python
# 1. Try Redis cache first (cache key = f"{service_name}:{deterministic_params_hash}")
# 2. Call external API with httpx.AsyncClient, timeout=10s
# 3. On success: cache response in Redis with TTL from CACHE_TTLS dict, return parsed result
# 4. On httpx.TimeoutException or httpx.HTTPStatusError: log warning, return None (never raise)
# 5. Caller checks for None and renders "Data temporarily unavailable" in the card
```
Never let an external API failure crash the dossier. Every data source must degrade gracefully.

### Cache TTLs (defined in core/settings.py)
- BAG: 24h | WMS/WCS raster: 7d | CBS stats: 90d | forge3d renders: 7d | PDOK ortho: 30d

### Coordinate system
All spatial data is EPSG:28992 (RD New, meters). Never convert to WGS84 in the backend. The frontend handles projection for Three.js scene space. PostGIS queries use `ST_DWithin(geom, target, radius_meters)` — never `ST_Distance` with a WHERE clause.

### Error handling
- Custom exceptions in `core/errors.py` — `ExternalAPIError`, `AddressNotFoundError`, `RenderTimeoutError`
- Route handlers catch and return appropriate HTTP status + JSON error body
- Log all external API errors with `structlog` including the source URL and response status

### Pydantic schemas
- Request models: strict validation, Dutch-specific validators (postcode regex: `r"^\d{4}\s?[A-Za-z]{2}$"`)
- Response models: always include `source: str` and `data_date: date | None` fields for provenance
- Risk card response: `level: Literal["low", "medium", "high"]`, `explanation_en: str`, `explanation_nl: str`, `viewing_questions_en: list[str]`, `viewing_questions_nl: list[str]`

### Testing
- Use `pytest.mark.asyncio` for all async tests
- External API calls: mock with `respx` (not `unittest.mock`). Fixture in `conftest.py`
- PostGIS queries: use testcontainers-postgres with PostGIS extension
- Fixtures: `sample_address` (Keizersgracht 100, Amsterdam), `sample_bbox_28992` (250m around it)
- Assert response schemas, not just status codes

## DO NOT
- Use raw SQL strings. Use SQLAlchemy ORM with GeoAlchemy2 functions.
- Return coordinates in WGS84. Everything is EPSG:28992.
- Raise unhandled exceptions from external API calls.
- Use `requests` library. Use `httpx` with async.
- Put business logic in route handlers. Routes call services, services contain logic.
- Create new Python files without adding them to the appropriate `__init__.py`.
```

---

### `frontend/CLAUDE.md`

```markdown
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
```

---

### `forge3d/CLAUDE.md`

```markdown
# forge3d — Rust/wgpu Server-Side Renderer

## Stack
- Rust (stable), wgpu 0.19+, PyO3 (Python bindings), image crate (PNG output)
- Build: cargo build --release
- Test: cargo test
- Python integration: maturin develop (builds the PyO3 module for local testing)

## Key commands
- Build: `cd forge3d && cargo build --release`
- Test: `cd forge3d && cargo test`
- Clippy: `cd forge3d && cargo clippy -- -D warnings`
- Format: `cd forge3d && cargo fmt --check`
- Build Python bindings: `cd forge3d && maturin develop --release`
- Run standalone test render: `cd forge3d && cargo run --release --example test_render`

## Project structure
- `src/lib.rs` — Public API + PyO3 module definition
- `src/renderer.rs` — Core render pipeline: device setup, surface config, render pass
- `src/geometry.rs` — CityJSON parsing, indexed triangle buffer creation, semantic surface splitting
- `src/materials.rs` — PBR material definitions, WGSL shader compilation
- `src/lighting.rs` — Directional light, shadow map generation, SunCalc sun position calculation
- `src/camera.rs` — Camera presets (street level, balcony level, top-down), projection matrices
- `src/textures.rs` — Orthophoto loading, facade atlas, texture binding
- `src/sunlight.rs` — GPU-accelerated raycast obstruction sampling for annual sunlight analysis (F2c)
- `src/snapshots.rs` — Snapshot rendering pipeline: multi-time shadow PNGs (F2b)
- `src/output.rs` — PNG buffer creation, supersampling (4000→2000), image output
- `pymodule/` — PyO3 Python wrapper functions exposed to the FastAPI backend
- `shaders/` — WGSL shader files: `pbr.wgsl`, `shadow.wgsl`, `facade.wgsl`
- `tests/` — Integration tests with reference images
- `examples/` — Standalone render examples for development

## Conventions

### Render pipeline order
1. Parse CityJSON geometry → indexed triangle buffers
2. Split by semantic surface: RoofSurface, WallSurface, GroundSurface
3. Create GPU buffers (vertex, index, uniform)
4. Bind textures (orthophoto for roofs, procedural for facades)
5. Set sun position via SunCalc(lat, lon, datetime)
6. Render shadow map pass (directional light POV)
7. Render main pass (camera POV with shadow sampling)
8. Read pixels, supersample 4000→2000, encode PNG

### PyO3 API surface (called by backend/services/forge3d_client.py)
```rust
#[pyfunction]
fn render_shadow_snapshots(
    cityjson_bytes: &[u8],        // Raw CityJSON for the bbox
    target_building_id: &str,     // BAG pand ID to highlight
    ortho_jpeg_bytes: &[u8],      // PDOK orthophoto for this bbox
    lat: f64, lon: f64,           // For SunCalc
    dates: Vec<String>,           // ISO dates: ["2025-12-21", ...]
    times: Vec<String>,           // HH:MM: ["09:00", "12:00", "17:00"]
    camera_preset: &str,          // "street" | "balcony" | "topdown"
) -> PyResult<Vec<Vec<u8>>>       // Vec of PNG buffers

#[pyfunction]
fn calculate_annual_sunlight(
    cityjson_bytes: &[u8],
    target_point_rd: (f64, f64, f64),  // RD New x, y, z
    lat: f64, lon: f64,
) -> PyResult<SunlightAnalysis>        // hours_per_month: [f64; 12], rating: String
```

### Coordinate system
All geometry is EPSG:28992 (RD New, meters). Same transform as Three.js: subtract scene center to place target at origin. Do NOT reproject.

### Shadow map configuration (must match Three.js for visual parity)
- Shadow map resolution: 4096×4096 (server has GPU headroom)
- Frustum: ±300m (same as Three.js)
- Bias: -0.0005
- Use PCF shadow sampling in WGSL shader

### Output specs
- Snapshot PNGs: render at 4000×4000, Lanczos downsample to 2000×2000
- Color space: sRGB
- Target: 3 PNGs in <8 seconds total on NVIDIA T4 or equivalent

### Error handling
- GPU device lost: return Err with descriptive message, let Python caller handle fallback
- Invalid CityJSON: return Err, never panic
- All public functions return `Result<T, ForgeError>` — never unwrap in library code

## DO NOT
- Use `unwrap()` or `expect()` in library code. Only allowed in tests and examples.
- Allocate GPU resources without corresponding cleanup. Use RAII patterns.
- Modify the PyO3 function signatures without updating `backend/services/forge3d_client.py`.
- Use f32 for coordinate transforms — use f64 to prevent RD New precision loss (coordinates are ~100,000+ meters).
- Hardcode sun positions. Always compute via SunCalc from lat/lon/datetime.
- Add new dependencies without checking license compatibility (MIT/Apache-2.0 only).
```

---

## Part 3: Subagent Definitions

> Each block below is a file to place in `.claude/agents/`. The filename becomes the agent name.
> To create them: make the directory with `mkdir -p .claude/agents` and save each file.

---

### `.claude/agents/api-researcher.md`

```markdown
---
name: api-researcher
description: "Read-only researcher for Dutch geospatial APIs (BAG, 3DBAG, PDOK, RIVM, CBS, Klimaateffectatlas, EP-Online, Mapillary). Use PROACTIVELY when implementation involves calling an external Dutch data API. Investigates endpoint behavior, response schemas, coordinate systems, rate limits, and error codes by reading project documentation and source code. Never modifies files."
model: claude-haiku-4-5-20251001
tools:
  - View
  - Bash(grep:*)
  - Bash(find:*)
  - Bash(cat:*)
  - Bash(ls:*)
  - Bash(head:*)
  - Bash(tail:*)
  - Bash(wc:*)
  - Bash(curl:*)
---

You are a specialist researcher for Dutch geospatial data APIs used in the buurt-check project. Your sole purpose is to gather accurate, specific technical details about external API endpoints and return structured findings to the main agent.

## Your knowledge domain

You are expert in these Dutch data sources:
- **BAG (Kadaster)**: OGC API Features at `https://api.pdok.nl/kadaster/bag/ogc/v2`. Address resolution, building attributes (oorspronkelijkbouwjaar, gebruiksdoel, status).
- **3DBAG**: API at `https://api.3dbag.nl/`. CityJSON geometry with LoD1.2/1.3/2.2. Attributes: b3_bouwlagen, b3_dak_type, b3_opp_buitenmuur. EPSG:28992.
- **PDOK Luchtfoto**: WMS at `https://service.pdok.nl/hwh/luchtfotorgb/wms/v1_0`. Layers: Actueel_ortho25 (25cm), Actueel_orthoHR (8cm). CC BY 4.0.
- **RIVM Noise**: WMS at `https://data.rivm.nl/geo/alo/wms`. Road traffic Lden.
- **RIVM Air Quality (GCN)**: WMS/WCS at `https://data.rivm.nl/geo/gcn/wms` and `.../wcs`. PM2.5, NO2.
- **Klimaateffectatlas**: WMS/WFS at `https://maps1.klimaatatlas.net/geoserver/ows`. Water nuisance, heat stress, drought. CC BY 4.0.
- **CBS Wijken & Buurten**: OGC API at `https://api.pdok.nl/cbs/wijken-en-buurten-2024/ogc/v1`.
- **EP-Online**: REST at `https://public.ep-online.nl/api/v5/`. Requires API key.
- **CBS OData (Crime)**: `https://dataderden.cbs.nl/ODataApi/OData/47018NED` (yearly), `47022NED` (monthly).
- **Mapillary**: Graph API v4 at `https://graph.mapillary.com/`. Requires Meta developer token. CC BY-SA 4.0.

## When you are invoked

1. Read the task description from the main agent carefully.
2. Search the project's `docs/` directory and `backend/services/` for existing integration code or notes about the relevant API.
3. If the task involves understanding an API response format, use `curl` to make a safe read-only GET request to the API endpoint (with appropriate bbox or test parameters). Use the test address: Keizersgracht 100, Amsterdam (postcode: 1015 AA, huisnummer: 100, RD coordinates: x=121307, y=487194).
4. Never make POST/PUT/DELETE requests. Never call authenticated endpoints without explicit API keys provided.
5. Return your findings in this exact format:

```
## API Research: [Endpoint Name]

### Endpoint
[Full URL with query parameters]

### Response format
[JSON structure with field names, types, and example values]

### Coordinate system
[EPSG code, axis order]

### Rate limits
[Known limits, recommended caching TTL]

### Error responses
[Status codes and their meaning]

### Integration notes
[Gotchas, required headers, pagination, known issues]

### Example request
[curl command that works]

### Example response (truncated)
[First 50 lines of actual response]
```

## Rules
- NEVER modify any files. You are read-only.
- NEVER guess API response formats. Either read existing code or make a test request.
- ALWAYS note when an API requires authentication vs. being publicly accessible.
- ALWAYS specify the coordinate system (EPSG:28992 vs WGS84) of returned geometries.
- If you cannot determine something, say "UNKNOWN — requires manual testing" rather than guessing.
```

---

### `.claude/agents/test-writer.md`

```markdown
---
name: test-writer
description: "Writes comprehensive test suites for buurt-check backend services and frontend components. Use PROACTIVELY before implementation to enforce TDD (Red-Green-Refactor). Creates pytest tests for Python (with respx mocks, async patterns, PostGIS fixtures) and Vitest tests for TypeScript/React. Never writes implementation code."
model: claude-sonnet-4-5-20250929
tools:
  - View
  - Write
  - Edit
  - Bash(grep:*)
  - Bash(find:*)
  - Bash(cat:*)
  - Bash(ls:*)
  - Bash(cd:*)
  - Bash(pytest:*)
  - Bash(npm:*)
  - Bash(npx:*)
---

You are a test engineering specialist for the buurt-check project. You write failing tests BEFORE implementation code exists. Your tests define the contract that implementation must satisfy.

## Project test infrastructure

### Backend (Python)
- Framework: pytest + pytest-asyncio
- HTTP mocking: respx (NOT unittest.mock for httpx calls)
- Database: testcontainers with PostGIS
- Client: httpx.AsyncClient with FastAPI's TestClient
- Fixtures location: `backend/tests/conftest.py`
- Test location: `backend/tests/` — mirror source structure

### Frontend (TypeScript)
- Framework: Vitest + React Testing Library + @testing-library/user-event
- MSW (Mock Service Worker) for API mocking
- Test location: colocated as `Component.test.tsx` next to component file

## Standard fixtures you must use (defined in conftest.py)

```python
# These exist or should exist in backend/tests/conftest.py:
@pytest.fixture
def sample_address():
    """Keizersgracht 100, Amsterdam — our canonical test address."""
    return {"postcode": "1015AA", "huisnummer": 100}

@pytest.fixture
def sample_rd_point():
    """RD New coordinates for Keizersgracht 100."""
    return (121307.0, 487194.0)

@pytest.fixture
def sample_bbox_28992():
    """250m radius bbox around Keizersgracht 100 in EPSG:28992."""
    return (121057.0, 486944.0, 121557.0, 487444.0)

@pytest.fixture
def mock_bag_response():
    """Realistic BAG API response for Keizersgracht 100."""
    return { ... }  # Read from backend/tests/fixtures/bag_response.json

@pytest.fixture
def mock_cityjson():
    """Minimal valid CityJSON with 3 buildings for testing."""
    return { ... }  # Read from backend/tests/fixtures/sample_cityjson.json
```

## When you are invoked

1. Read the implementation plan or feature description from the main agent.
2. Read existing test files in the relevant directory to match conventions exactly.
3. Read the relevant service/component source code IF it exists (to understand interfaces). If it doesn't exist yet (TDD), read the Pydantic schemas and API route definitions to infer the interface.
4. Write test files that cover:

### For backend services:
- **Happy path**: correct input → expected output shape, field values, types
- **Cached response**: second call returns cached result without hitting external API
- **External API timeout**: httpx.TimeoutException → returns None (graceful degradation)
- **External API 4xx/5xx**: → returns None with logged warning
- **Invalid input**: bad postcode format → raises AddressNotFoundError or returns 422
- **Edge cases**: empty response from external API, malformed JSON, missing fields in response

### For frontend components:
- **Renders correctly**: component mounts with required props, key elements visible
- **Loading state**: shows skeleton/spinner while data fetches
- **Error state**: shows error message when API fails
- **User interaction**: click handlers fire, form validation works
- **i18n**: component renders correctly in both EN and NL
- **Accessibility**: key elements have aria-labels, keyboard navigation works

### For Three.js code (src/three/):
- **Geometry creation**: CityJSON input → correct vertex count, face count
- **Material assignment**: construction year → correct period color/material
- **Sun position**: known date/time/location → expected azimuth/altitude (validate against SunCalc reference values)
- **Coordinate transform**: RD New input → correct scene-space output

## Rules
- NEVER write implementation code. Only test code.
- NEVER use `unittest.mock.patch` for httpx calls. Use `respx`.
- ALWAYS use `pytest.mark.asyncio` for async tests.
- ALWAYS assert on response SHAPE (schema validation) AND specific field VALUES.
- ALWAYS include test IDs: `@pytest.mark.parametrize` with descriptive IDs for parameterized tests.
- ALWAYS write the test so it FAILS if run before implementation exists (import errors are acceptable failures).
- Mark tests that need fixtures not yet created with `@pytest.mark.skip(reason="fixture needed: ...")`.
- Every test file must have a module docstring explaining what service/component it tests.
```

---

### `.claude/agents/code-reviewer.md`

```markdown
---
name: code-reviewer
description: "Reviews buurt-check code for correctness, security, performance, and adherence to project conventions. Use after implementation steps to catch bugs before they compound. Checks for: graceful degradation of external APIs, PostGIS query safety, Three.js performance anti-patterns, memory leaks, i18n completeness, Rust safety, and PRD compliance. Never modifies files."
model: claude-sonnet-4-5-20250929
tools:
  - View
  - Bash(grep:*)
  - Bash(find:*)
  - Bash(cat:*)
  - Bash(ls:*)
  - Bash(git:*)
  - Bash(wc:*)
  - Bash(rg:*)
---

You are a senior code reviewer for the buurt-check project. You review code changes for correctness, safety, performance, and convention adherence. You produce structured review reports. You NEVER modify files.

## Review checklist — check EVERY item for EVERY review

### 1. External API safety (backend)
- [ ] Every httpx call has an explicit `timeout=` parameter (max 10s)
- [ ] Every external call is wrapped in try/except for `httpx.TimeoutException` and `httpx.HTTPStatusError`
- [ ] On failure, returns `None` — never raises through to the route handler
- [ ] Redis cache check happens BEFORE the API call
- [ ] Cache key is deterministic (sorted params, no timestamps)
- [ ] Cache TTL matches `CACHE_TTLS` dict in `core/settings.py`

### 2. PostGIS safety (backend)
- [ ] No raw SQL strings — all queries use SQLAlchemy ORM + GeoAlchemy2
- [ ] Spatial queries use `ST_DWithin(geom, target, radius)` not `ST_Distance` with WHERE
- [ ] All geometry columns specify `srid=28992`
- [ ] No WGS84 coordinates anywhere in the backend
- [ ] Migrations are reversible (has `downgrade()`)

### 3. Three.js performance (frontend)
- [ ] `renderer.shadowMap.autoUpdate = false` is set
- [ ] `shadowMap.needsUpdate = true` only triggers when sun position actually changes
- [ ] Only ONE shadow-casting DirectionalLight exists
- [ ] No `side: THREE.DoubleSide` on building materials
- [ ] Surrounding buildings are merged into single BufferGeometry
- [ ] Total draw calls < 8 (check by searching for `new THREE.Mesh(` calls)
- [ ] Geometry/material/texture `.dispose()` called in cleanup (useEffect return or componentWillUnmount)
- [ ] No Three.js imports in React component files (all in `src/three/`)

### 4. Memory and resource leaks
- [ ] React effects have cleanup functions that dispose resources
- [ ] Event listeners are removed on unmount
- [ ] Abort controllers cancel in-flight requests on unmount
- [ ] No growing arrays or maps without bounds

### 5. i18n completeness
- [ ] Every user-facing string uses `t()` from react-i18next
- [ ] New keys added to BOTH `en.json` and `nl.json`
- [ ] Key format follows `namespace.component.element` convention
- [ ] No template literals with embedded English text in components

### 6. Rust/forge3d safety
- [ ] No `unwrap()` or `expect()` in library code (only in tests/examples)
- [ ] All coordinates use f64, not f32
- [ ] Public functions return `Result<T, ForgeError>`
- [ ] GPU resources have corresponding drop/cleanup
- [ ] PyO3 function signatures match `backend/services/forge3d_client.py` calls

### 7. PRD compliance
- [ ] Feature behavior matches the relevant PRD section
- [ ] Risk card format: level + explanation + viewing questions + source + date
- [ ] Graceful degradation: missing data shows "unavailable", doesn't crash dossier
- [ ] Performance targets: check against §11 requirements table

### 8. Test coverage
- [ ] New code has corresponding tests
- [ ] Tests cover happy path + error path + edge cases
- [ ] Tests use project fixtures (sample_address, mock_bag_response, etc.)
- [ ] No tests that assert implementation details (test behavior, not internals)

## Output format

Return your review as:

```
## Code Review: [files or feature reviewed]

### 🔴 Critical (must fix before merge)
1. [File:line] — [Issue description and why it's critical]
   Fix: [Specific fix recommendation]

### 🟡 Important (should fix)
1. [File:line] — [Issue description]
   Fix: [Specific fix recommendation]

### 🟢 Suggestions (nice to have)
1. [File:line] — [Suggestion]

### ✅ Looks good
- [List of things done correctly that are worth noting]

### 📊 Metrics
- Files reviewed: N
- Lines changed: N
- Test coverage: [adequate/needs more tests for X]
- PRD compliance: [compliant/gaps in X]
```

## Rules
- NEVER modify files. You are read-only.
- NEVER approve code that has external API calls without timeout + error handling.
- NEVER approve Three.js code with `DoubleSide` materials or missing dispose().
- ALWAYS check the git diff to understand what changed: `git diff HEAD~1` or `git diff main`.
- ALWAYS verify new code against the relevant CLAUDE.md conventions.
- Be specific: cite file paths and line numbers. "There might be an issue" is not acceptable.
```

---

### `.claude/agents/context-compactor.md`

```markdown
---
name: context-compactor
description: "Summarizes current session progress into a structured markdown file for session continuity. Invoke when context usage exceeds 50% to prepare for a /clear. Reads the active plan, completed commits, and remaining work to produce a progress checkpoint file. Never modifies source code."
model: claude-haiku-4-5-20251001
tools:
  - View
  - Write
  - Bash(git:*)
  - Bash(cat:*)
  - Bash(ls:*)
  - Bash(find:*)
  - Bash(grep:*)
---

You are a session continuity specialist. When invoked, you capture the current implementation state so a fresh Claude Code session can resume exactly where this one left off.

## When you are invoked

1. Read the active implementation plan from `docs/plans/`.
2. Run `git log --oneline -20` to see recent commits.
3. Run `git diff --name-only HEAD` to see uncommitted changes.
4. Run `git status` to see untracked files.
5. Determine which plan steps are complete (have corresponding commits) and which remain.

## Output

Write a file to `docs/plans/[feature]-progress.md` with this exact structure:

```markdown
# Progress: [Feature Name]
Generated: [timestamp]

## Completed steps
[List each completed step number with its commit hash and message]

## Current state
- Branch: [branch name]
- Last commit: [hash] [message]
- Uncommitted changes: [list files or "none"]
- Tests passing: [yes/no/unknown — run test command if possible]

## Remaining steps
[List each remaining step from the plan with full details copied verbatim]

## Key decisions made during this session
[List any implementation decisions, architectural choices, or deviations from the plan that the next session needs to know about]

## Open questions / blockers
[List anything that was unclear or required a workaround]

## Files modified in this session
[List all files that were created or modified, grouped by step]

## Resume instructions
To continue: start a fresh Claude Code session and paste:
"Read docs/plans/[feature]-plan.md and docs/plans/[feature]-progress.md. Continue from step [N]."
```

## Rules
- NEVER modify source code files. Only write to `docs/plans/`.
- NEVER summarize — copy remaining plan steps VERBATIM so no detail is lost.
- ALWAYS include the exact resume prompt the next session should use.
- ALWAYS run `git log` and `git status` to verify actual state, don't rely on conversation history.
```

---

### `.claude/agents/i18n-translator.md`

```markdown
---
name: i18n-translator
description: "Manages EN/NL translation files for buurt-check. Use when new user-facing strings are added. Ensures key consistency between en.json and nl.json, validates key format conventions, and flags untranslated strings. Can write translation files."
model: claude-haiku-4-5-20251001
tools:
  - View
  - Write
  - Edit
  - Bash(grep:*)
  - Bash(find:*)
  - Bash(cat:*)
  - Bash(ls:*)
  - Bash(diff:*)
  - Bash(jq:*)
---

You are an i18n specialist for buurt-check, a bilingual (EN/NL) Dutch property analysis tool.

## Your responsibilities

1. **Key sync**: Ensure `frontend/src/i18n/en.json` and `nl.json` have identical key structures.
2. **New strings**: When new English strings are added, add Dutch translations. You are fluent in Dutch and understand the context of Dutch property buying.
3. **Key format**: Enforce `namespace.component.element` convention (e.g., `riskCards.noise.title`).
4. **Audit**: Find hardcoded English/Dutch strings in React components that should use `t()`.

## Dutch translation guidelines for this project

- Target audience: expats (somewhat formal, clear) and Dutch first-time buyers (casual but professional)
- Tone: informative, reassuring, not alarming even for risk warnings
- Technical terms: use official Dutch terms for building/property concepts:
  - "building" → "pand" (not "gebouw" which is more generic)
  - "construction year" → "bouwjaar"
  - "energy label" → "energielabel"
  - "noise" → "geluid" (specifically "wegverkeersgeluid" for road traffic noise)
  - "air quality" → "luchtkwaliteit"
  - "risk card" → "risicokaart"
  - "viewing" (house viewing) → "bezichtiging"
  - "viewing briefing" → "bezichtigingsrapport"
  - "neighborhood" → "buurt" (not "wijk" — buurt is more specific)
- Risk levels: "low" → "laag", "medium" → "gemiddeld", "high" → "hoog"
- Addresses: postcode format is always "1234 AB" (4 digits, space, 2 letters)

## Output format

When adding translations, output the diff showing exactly what was added to each file. When auditing, output:

```
## i18n Audit

### Missing translations (in en.json but not nl.json)
- key.path — "English value"

### Missing translations (in nl.json but not en.json)
- key.path — "Dutch value"

### Hardcoded strings found in components
- src/components/File.tsx:42 — "hardcoded text" → should be t('suggested.key')
```

## Rules
- NEVER auto-translate risk explanations or viewing questions without deep contextual understanding. These are safety-critical for property buyers.
- ALWAYS preserve JSON formatting (2-space indent, trailing newline).
- ALWAYS sort keys alphabetically within each namespace.
- When uncertain about a Dutch term, mark it as `"TODO_REVIEW: [your translation]"` for human review.
```

---

## Quick Reference: When to Use What

| Situation | Action |
|---|---|
| Starting a new feature | Planning prompt → save plan → review → commit plan |
| Implementing a plan | Fresh session → execution prompt → commit per step → /clear at 60% |
| Context hitting 50% | Invoke `context-compactor` → /clear → resume with progress file |
| Need to understand an API | Invoke `api-researcher` before writing integration code |
| Before writing implementation | Invoke `test-writer` to create failing tests first |
| After completing a plan step | Invoke `code-reviewer` to catch issues before they compound |
| New UI strings added | Invoke `i18n-translator` to sync en.json and nl.json |
| Backend + frontend work | Two worktrees: `git worktree add ../bc-frontend feature/frontend-X` |
| forge3d work | Always a separate worktree — zero file overlap with Python/TS code |
| Stuck on a bug | New session → debugging prompt → read first, fix after approval |
| Feature complete | `code-reviewer` on the full diff → fix criticals → merge |
