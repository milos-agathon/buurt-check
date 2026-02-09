# CLAUDE.md -- buurt-check

## What this project is

buurt-check is a mobile-first web app that helps expats and first-time homebuyers in the Netherlands avoid bad property purchases. A user pastes an address and instantly receives an evidence-backed dossier: building facts, 3D neighborhood context, environmental risk cards, neighborhood statistics, and a printable "Viewing Briefing" with questions to ask at the viewing.

The value proposition in one sentence: *"I paste an address and instantly know what could ruin my life there -- and what to verify at the viewing."*

## Target users

- **Expats**: Limited Dutch language skills, high uncertainty about neighborhoods, high regret risk. Need bilingual (EN/NL) content and plain-language explanations.
- **First-time buyers**: Overwhelmed by tradeoffs, need structure and confidence. Want clear risk signals, not raw data dashboards.

## Product vision

Become the trusted pre-viewing intelligence tool for every property buyer in the Netherlands. Not a listings platform, not a valuation tool -- a risk and reality check.

## MVP feature set (priority order)

| ID | Feature | Core data source | Priority |
|----|---------|-----------------|----------|
| F1 | Address resolution + building facts | BAG (Kadaster) OGC API | Must ship |
| F2 | 3D neighborhood viewer + sunlight/shadow simulation | 3DBAG API or Kadaster 3D Basisvoorziening + SunCalc | Must ship |
| F3 | Risk cards (noise, air quality, climate stress, sunlight) | RIVM WMS, Klimaateffectatlas WMS/WFS, SunCalc + 3D geometry | Must ship -- primary differentiator |
| F4 | Neighborhood snapshot (5-8 indicators) | CBS Wijken & Buurten OGC API | Must ship |
| F5 | Shortlist + Compare (2-3 homes) + PDF export | Local storage + server-side PDF | Must ship |
| F6 | Crime level card | CBS OData (47018NED, 47022NED) | Tier B -- ship if time allows |

## Explicit non-goals (do not build)

- Listings ingestion or Funda-like browsing
- Automated valuation, fair-price estimates, or bidding advice
- Nationwide permit/renovation certainty
- Foundation condition assessment
- User accounts or social features in MVP

## Data sources and endpoints

### A) BAG -- address + building backbone
- Base: `https://api.pdok.nl/kadaster/bag/ogc/v2`
- Key calls: `GET /collections/{collectionId}/items--bbox=...`, `GET /collections/{collectionId}/items/{id}`
- Update cadence: continuous. Cache aggressively.

### B) 3D buildings + sunlight/shadow simulation
- **Option B1 (recommended for MVP):** 3DBAG API -- `https://api.3dbag.nl/` (docs at `/api.html`), bbox query for 3D geometry
- **Option B2 (scale-friendly):** Kadaster 3D Basisvoorziening -- 3D Tiles for web rendering
- **Sun position:** Calculated client-side using SunCalc algorithm (no external API). Inputs: latitude, longitude, date, time. Outputs: solar azimuth and altitude for directional lighting.
- **Shadow rendering tiers:**
  - **F2a -- Interactive timeline:** Time slider + date presets (solstices, equinox). Real-time shadow casting on 3D geometry via directional light.
  - **F2b -- Static snapshots:** Pre-rendered shadow images at 9:00/12:00/17:00 on winter solstice. Used in PDF export and low-power fallback.
  - **F2c -- Annual sunlight analysis:** Compute direct sunlight hours per day/year factoring in surrounding building obstruction. Output as a sunlight risk card with seasonal breakdown.

### C) Noise -- road traffic Lden
- WMS: `https://data.rivm.nl/geo/alo/wms--request=GetCapabilities`
- Offline option: ZIP downloads from data.overheid.nl (2020/2022 datasets)
- Always show disclaimer: data is indicative

### D) Air quality -- PM2.5 / NO2 (GCN)
- WMS: `https://data.rivm.nl/geo/gcn/wms--request=GetCapabilities`
- WCS: `https://data.rivm.nl/geo/gcn/wcs--request=GetCapabilities`
- ZIP downloads per year/substance from RIVM

### E) Climate stress
- WMS: `https://maps1.klimaatatlas.net/geoserver/ows--service=WMS&version=1.3.0`
- WFS: `https://maps1.klimaatatlas.net/geoserver/ows--service=WFS&version=2.0.0`
- License: CC BY 4.0 -- attribution required
- Limit to top 10 buyer-relevant layers only

### F) Neighborhood stats
- Base: `https://api.pdok.nl/cbs/wijken-en-buurten-2024/ogc/v1`
- Key call: `GET /collections/buurten/items--bbox=...`

### G) Energy label (Tier B)
- Endpoint: `https://public.ep-online.nl/api/v5/PandEnergielabel/Adres--postcode=...&huisnummer=...`

### H) Crime stats (Tier B)
- Yearly: `https://dataderden.cbs.nl/ODataApi/OData/47018NED`
- Monthly: `https://dataderden.cbs.nl/ODataApi/OData/47022NED`
- Present as crimes per 1,000 residents. Sub-cards: burglary, violent crime.
- Mandatory disclaimers about registered vs. total crime.

## Architecture decisions

- **Backend**: FastAPI (Python) + httpx (async) + Pydantic v2. Stateless API aggregator — no database, all data from external APIs. Redis for caching with circuit breaker.
- **Data fetching**: On-demand WMS/WCS sampling with Redis caching. WMS tile proxy for CORS bypass.
- **API serving**: Custom JSON REST API. Single router in `api/address.py` with all endpoints.
- **Client**: Web-first (mobile responsive), React 18 + Vite + TypeScript. Plain CSS with design system tokens.
- **3D rendering**: Plain Three.js (not react-three-fiber or deck.gl). Directional light positioned using SunCalc to cast real-time shadows. PCFSoftShadowMap 2048x2048.
- **Design system**: "Clear Signal Hybrid" — Satoshi font, Electric Teal (#00897B) accent, 0-100 risk scoring with 4-level severity. Tokens in `frontend/src/styles/tokens.css`.
- **State management**: App-level `useState` in `App.tsx`. No Zustand, no Redux. Screen routing via `activeScreen` state.
- **Shortlist**: localStorage-backed (max 3 addresses). No server-side persistence.

## Risk card design principles

Every risk card must contain exactly four elements:
1. **Score (0-100) + severity**: good (70-100) / moderate (40-69) / poor (20-39) / critical (0-19) with severity color coding
2. **What it means**: plain-language EN/NL explanation -- no jargon
3. **What to ask/check at viewing**: actionable questions for the buyer
4. **Source + date**: transparency about where the data comes from and how recent it is

Risk tiles display as a 2x2 grid (noise, air, climate, sunlight). Tap opens full-screen detail view with score, comparison chart (address vs city vs NL vs WHO), and viewing questions with checkboxes.

## Key product principles

These are derived from PM fundamentals and shape every decision:

1. **Problems over features.** The roadmap is organized around user problems ("I don't know if this street is noisy"), not feature specs. Solutions may change; problems stay stable.
2. **YAGNI ruthlessly.** Do not build for hypothetical future requirements. Three similar lines of code are better than a premature abstraction.
3. **Consequences over data.** Users don't want raw numbers. They want "what does this mean for me--" Every data point must be translated into a practical implication.
4. **5-8 indicators max per section.** No dashboard spam. Curate aggressively.
5. **Bilingual by default.** All user-facing text must support EN and NL from day one. Not as a translation layer bolted on later.
6. **Disclaimers are mandatory.** Environmental and crime data is indicative. Always cite sources, dates, and limitations.
7. **Measure before celebrating.** Define success metrics before building each feature. Track outcomes, not just outputs.

## Development conventions

- **Language**: TypeScript (frontend), Python (backend)
- **Formatting**: Use project-configured formatters. No manual style debates.
- **Commits**: Conventional commits (`feat:`, `fix:`, `docs:`, `chore:`)
- **Branches**: `main` (stable), feature branches named `feat/<description>`
- **Testing**: Write tests for data transformation logic and API integrations. Risk card threshold logic must be tested.
- **Error handling**: Graceful degradation -- if a data source is unavailable, show the card as "data unavailable" rather than crashing the entire dossier.

## Workflow Orchestration

### 1. Plan Mode Default
- Enter plan mode for any non-trivial task (3+ steps or architectural decisions).
- If implementation goes sideways, stop and re-plan immediately.
- Use plan mode for verification steps too, not just implementation.
- Write detailed specs upfront to reduce ambiguity.

### 2. Subagent Strategy
- Use subagents liberally to keep the main context clean.
- Offload research, exploration, and parallel analysis to subagents.
- For complex problems, allocate more compute via subagents.
- Keep one focused task per subagent.

### 3. Self-Improvement Loop
- After any user correction, update `tasks/lessons.md` with the pattern.
- Write preventive rules to avoid repeating the same mistake.
- Iterate on lessons until mistake rate drops.
- Review relevant lessons at session start.

### 4. Verification Before Done
- Never mark a task complete without proving it works.
- Diff behavior between `main` and your changes when relevant.
- Ask: "Would a staff engineer approve this?"
- Run tests, check logs, and demonstrate correctness.

### 5. Demand Elegance (Balanced)
- For non-trivial changes, pause and ask whether a more elegant path exists.
- If a fix feels hacky, re-implement with the best solution given current understanding.
- Skip this for simple, obvious fixes; do not over-engineer.
- Challenge your own work before presenting it.

### 6. Autonomous Bug Fixing
- When given a bug report, move directly to diagnosis and fix.
- Use logs, errors, and failing tests as primary signals.
- Minimize context switching required from the user.
- Proactively fix failing CI tests when encountered.

## Task Management
1. **Plan first**: Write a checkable plan in `tasks/todo.md`.
2. **Verify plan**: Confirm the plan before implementation.
3. **Track progress**: Mark items complete as you go.
4. **Explain changes**: Provide high-level change summaries by step.
5. **Document results**: Add a review section to `tasks/todo.md`.
6. **Capture lessons**: Update `tasks/lessons.md` after corrections.

### Core principles
- **Simplicity first**: Keep changes as simple as possible, with minimal code impact.
- **No laziness**: Find root causes; avoid temporary fixes.
- **Minimal impact**: Touch only what is necessary to avoid regressions.

### Documentation discipline
- Always plan before coding.
- Always write or update a permanent, well-named doc after coding.
- Always verify docs and code match each other.
- Always update relevant docs when work is complete.

## File structure

```
buurt-check/
  docs/              # Design docs: design-prd.md (visual spec), design-spec.md (pixel specs)
  backend/           # FastAPI application (stateless API aggregator)
    app/
      api/           # Route handlers (address.py, router.py)
      cache/         # Redis cache with circuit breaker (redis.py)
      services/      # Business logic: bag.py, locatieserver.py, three_d_bag.py,
                     #   cbs.py, risk_cards.py, wms_tile.py, scoring.py, viewing_questions.py
      models/        # Pydantic models: address.py, building.py, neighborhood.py,
                     #   neighborhood3d.py, risk.py
      config.py      # Settings via pydantic-settings (BUURT_* prefix)
      main.py        # FastAPI app entry point
    tests/           # pytest tests (242 non-live + live smoke tests)
  frontend/          # React application (Vite + TypeScript)
    src/
      styles/        # Design system: tokens.css (CSS custom properties), satoshi.css (font)
      components/    # Navigation: TabBar, TopBar
                     # Search: AddressSearch
                     # Loading: LoadingScreen, BuildingAnimation
                     # Dossier: AddressHeader, SummaryStrip, BuildingFactsCard,
                     #   BuildingFootprintMap, NeighborhoodViewer3D, ShadowControls,
                     #   ShadowSnapshots, OverlayControls, SunlightRiskCard,
                     #   RiskTilesGrid, RiskTile, RiskDetailView, RiskCardsPanel,
                     #   NeighborhoodStatsCard, ViewingChecklist, ActionBar
                     # Shortlist: ShortlistScreen, CompareScreen, SettingsScreen
                     # UI primitives: ui/SeverityBadge, ui/ScoreBar,
                     #   ui/BottomSheet, ui/Toast, ui/ToggleSwitch
      services/      # api.ts (fetch-based), shortlist.ts (localStorage)
      types/         # api.ts — TS interfaces mirroring backend models
      i18n/          # i18next config + en.json + nl.json (~200 keys each)
      test/          # Test setup (setup.ts, helpers.ts)
  CLAUDE.md          # Root project docs (authoritative)
  frontend/CLAUDE.md # Frontend-specific conventions
  backend/CLAUDE.md  # Backend-specific conventions
```

## Current project status

**Stage: F1-F5 fully implemented + polished. "Clear Signal Hybrid" design system applied. 0-100 risk scoring. Tab navigation. Shortlist + compare. PDF Quick Brief export. Dark mode. Recent searches. GSAP camera transitions. FPS monitoring.**

### What exists
- `backend/` — FastAPI app with 11 endpoints: address suggest/lookup, building facts, 3D building/neighborhood, risk cards (with 0-100 scores + severity), neighborhood stats, WMS tile proxy, viewing questions, PDF export. BAG lookups use OGC XML Filter. 3DBAG uses tiled fetch (direct target + grid tiles). LoD 2.2 roof geometry parsing (feature-flagged). Risk scoring normalizes noise/air/climate/sunlight to 0-100. CBS integration with buurt-code + bbox fallback. Redis cache with circuit breaker. fpdf2 for PDF generation. 255 passing tests + live smoke tests.
- `frontend/` — Vite + React + TypeScript with "Clear Signal Hybrid" design system. Satoshi font, Electric Teal accent, CSS design tokens. 3-tab navigation (Search, Briefing, Saved) with frosted glass tab bar. Loading screen with building animation. Dossier screen: address header, summary strip, 3D viewer (fullscreen, GSAP transitions, FPS monitoring), 2x2 risk tiles with animated 0-100 scores + quartile dots, risk detail views with comparison charts + viewing questions, neighborhood stats, viewing checklist, action bar with PDF export. Dark mode (light/dark/system). Recent searches. Shortlist (max 3) with compare screen. Settings screen. 324 passing Vitest tests. i18n with ~300 keys per language.
- `docs/design-prd.md` — Full design specification for "Clear Signal Hybrid" design direction
- `docs/design-spec.md` — Pixel-level visual specification for all screens

### What's next
- Maintain quality gates: `ruff check`, backend pytest (255+, excluding live), frontend vitest (324+), `npm run build`.
- Resolve PM2.5 data gap (GCN WMS only has NO2 layers).
- Visual QA pass on all redesigned screens with real data.
- Full Dossier PDF export (3-4 pages, extends Quick Brief).

## Learnings from development sessions (2026-01-30)

### API discoveries

1. **BAG OGC API v2 does NOT support postcode/huisnummer filtering directly.** You cannot query `GET /collections/adres/items?postcode=...&huisnummer=...` — the BAG API is geometry/ID-based only. Use the **PDOK Locatieserver** (`https://geodata.nationaalgeoregister.nl/locatieserver/v3/suggest` and `/lookup`) as the entry point for address searches. The Locatieserver returns `adresseerbaarobject_id` which you then use to query BAG.

2. **Address resolution requires a 3-step API chain:**
   - Step 1: PDOK Locatieserver `/suggest` — autocomplete from user input
   - Step 2: PDOK Locatieserver `/lookup` — resolve full address + BAG IDs + coordinates
   - Step 3: BAG OGC API v2 — fetch verblijfsobject + pand details using the resolved IDs

3. **CBS Wijken & Buurten 2024 has 200+ fields per buurt.** The dataset is far richer than expected. Curate to 5-8 indicators max per the product principles. Suggested indicators: population density, age distribution, ownership percentage, distance to public transport, distance to schools, distance to amenities, income level, household composition.

4. **3DBAG API key facts:**
   - Returns CityJSON format (not GeoJSON) — needs conversion for web rendering
   - Only supports EPSG:7415 (Amersfoort/RD New + NAP height) — coordinate conversion needed
   - No rate limits currently, but attribution required
   - Three LoD tiers: LoD1.2, LoD1.3, LoD2.2 (rooflines)
   - 3D Tiles endpoint returns glTF for efficient web streaming

5. **Klimaateffectatlas uses standard GeoServer WMS/WFS** — standard OGC protocols, CC BY 4.0 license. Limit to top 10 buyer-relevant layers.

### Architecture decisions made

1. **Nine backend endpoints, all under `/api/address/`** — suggest, lookup, building, building3d, neighborhood3d, risks, neighborhood, wms-tile, viewing-questions.

2. **Redis from the start** (via Docker: `docker run -d --name buurt-redis -p 6379:6379 redis:7-alpine`). Cache with graceful degradation — app works without Redis, just slower. Circuit breaker (30s) + socket_timeout (0.5s).

3. **Leaflet for F1 2D maps.** Leaflet is free, no API key, lightweight. Plain Three.js for F2 3D neighborhood viewer (not deck.gl or react-three-fiber).

4. **Plain CSS with design system tokens, mobile-first.** "Clear Signal Hybrid" design direction. Satoshi font. Tokens in `styles/tokens.css`. No Tailwind, no CSS-in-JS.

5. **pyproject.toml for backend** (not requirements.txt). Modern Python packaging.

6. **3-tab navigation** (Search, Briefing, Saved). Screen routing via `activeScreen` state in `App.tsx`. Frosted glass tab bar at bottom.

7. **0-100 risk scoring** with 4-level severity (good/moderate/poor/critical). Backend normalizes raw values via `scoring.py`. Frontend displays in 2x2 tile grid + detail views.

### Development environment notes

- **Windows (Git Bash):** `cd /d D:\path` does not work in bash. Use `cd "D:/path"` or `cd /d/path` instead.
- **Backend Python deps:** `fastapi[standard]`, `uvicorn[standard]`, `httpx`, `pydantic`, `pydantic-settings`, `redis`, `scipy`
- **Backend dev deps:** `pytest`, `pytest-asyncio`, `pytest-httpx`, `ruff`
- **Frontend deps:** `react-i18next`, `i18next`, `i18next-browser-languagedetector`, `leaflet`, `react-leaflet`, `@types/leaflet`, `three`, `suncalc`
- **Frontend dev deps:** `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, `jsdom`
- **Font:** Satoshi Variable (woff2) from fontshare.com, self-hosted in `frontend/public/fonts/`

### Process learnings

1. **Plan before implementing.** The PRD restructure (v1.0 → v1.1) and F1 planning sessions produced a much cleaner implementation than jumping straight to code. The plan identified the 3-step API chain and endpoint separation before any code was written.

2. **Explore APIs before designing.** The BAG API does not work the way the PRD initially assumed. Real API exploration revealed the Locatieserver requirement — this would have been a painful discovery mid-implementation.

3. **Two planning sessions produced conflicting plans.** Thread be9eddb5 planned F1 with `requirements.txt`, in-memory cache, and `/api/v1/address` endpoint. Thread e20ec1d6 planned F1 with `pyproject.toml`, Redis, and `/api/address/suggest|lookup|building` endpoints. The second plan (e20ec1d6) was approved and implemented. When running parallel planning sessions, ensure only one plan gets approved and used.

4. **Frontend scaffolding came last.** The Vite scaffold was one of the final steps in the implementation session, with the backend fully built first. This is the correct order — backend APIs need to exist before frontend can consume them.

## Learnings from F1 fix-and-complete session (2026-02-04)

### Technical discoveries

1. **BAG building data uses WFS, not OGC API v2.** The OGC API v2 (`api.pdok.nl/kadaster/bag/ogc/v2`) does not support bbox queries for verblijfsobject/pand. The actual working endpoint is the WFS service at `https://service.pdok.nl/kadaster/bag/wfs/v2_0`. Config must use `bag_wfs_base`, not `bag_api_base`. Do not introduce a config key that references an endpoint the code does not use.

2. **Redis without circuit breaker = ~8s latency penalty.** Default `redis.asyncio` connection timeout is ~4s. Two cache calls (get + set) per request = ~8s when Redis is down. Fix: `socket_timeout=0.5`, `socket_connect_timeout=0.5`, plus a 30-second circuit breaker. After first failure, all subsequent calls skip Redis instantly for 30s. This pattern should be applied to any external dependency that can be unavailable.

3. **`asyncio.gather` with a `sleep(0)` placeholder is misleading.** If two API calls are sequential (pand fetch depends on VBO's `pandidentificatie`), just use sequential `await`. Don't fake parallelism.

4. **Leaflet + react-leaflet GeoJSON re-rendering.** The `GeoJSON` component doesn't update when data changes. Use `key={JSON.stringify(footprint)}` to force re-mount. Similarly, `MapContainer` doesn't respond to center changes — use `key={lat-lng}` to re-center.

5. **Vite proxy config for API.** `server.proxy: { '/api': 'http://localhost:8000' }` in `vite.config.ts` eliminates CORS issues during development. The frontend API client uses relative paths (`/api/...`), which work both in dev (proxy) and production (same-origin or reverse proxy).

### Code quality rules (enforce these)

1. **Run `ruff check` before committing backend changes.** Config is in `pyproject.toml`: line-length 100, rules E/F/I/W. Import sort order matters (I rules).
2. **Run `npm run build` before committing frontend changes.** TypeScript strict mode is on (`noUnusedLocals`, `noUnusedParameters`, `erasableSyntaxOnly`). The build will catch type errors that the dev server ignores.
3. **Do not hardcode external URLs in service files.** All external API base URLs go in `config.py` as `pydantic-settings` fields. Services import `settings` and use the config values.
4. **Test count baselines (updated 2026-02-09).** Backend: 255 non-live tests (+ live smoke tests). Frontend: 324 tests. Any change must maintain or increase these numbers.

### Frontend patterns established

1. **i18n:** All user-facing strings go in `src/i18n/en.json` and `nl.json` (~200 keys each). Keys use dot notation (`risk.noise.title`, `nav.search`). Components use `useTranslation()` hook. Warning codes from backend: `t('risk.warning.${code}', code)` with fallback.
2. **API client:** `src/services/api.ts` uses native `fetch`. No axios. Throws on non-OK responses. Supports `AbortSignal` for cancellation. Explicit timeouts per endpoint.
3. **CSS:** Plain CSS with design system tokens from `styles/tokens.css`. Component CSS co-located (e.g., `AddressSearch.css` next to `AddressSearch.tsx`). BEM-like naming (`risk-tile__score--good`). All colors, spacing, typography, radii, shadows use `var(--token-name)`.
4. **State management:** App-level state in `App.tsx` via `useState`. Screen routing via `activeScreen` state. Pass data down as props. Shortlist persisted to localStorage via `services/shortlist.ts`.
5. **Design system:** "Clear Signal Hybrid" direction. Satoshi Variable font, Electric Teal (#00897B) accent, 4-level severity (good/moderate/poor/critical). All tokens in `styles/tokens.css`.

### Post-assessment hardening learnings (2026-02-04)

1. **Identity beats proximity.** For F1 building facts, never "best-effort" match by bbox order when an explicit object ID is provided. If exact `vbo_id`/`pand_id` match fails, fail closed and return no data.
2. **Cache keys must match behavior.** If endpoint output can change by query params (`rd_x`, `rd_y`), cache keys must include those params or the endpoint contract must be narrowed so only stable inputs remain.
3. **Verify field names against live payloads.** Locatieserver uses `huisnummertoevoeging`; mapping `toevoeging` loses address detail. Always check real payloads before finalizing model mappings.
4. **Measure warm and cold separately.** Record both first-request (cold) and steady-state (warm) latency during QA; cold spikes can hide startup/dependency penalties.
5. **Do not declare completion before acceptance metrics.** "F1 complete" requires: lint/build green, backend tests + regression tests, frontend E2E smoke passing, and representative live-sample correctness checks aligned with PRD acceptance criteria.

## Learnings from F1 data correctness session (2026-02-04)

### BAG WFS filter discovery

1. **PDOK BAG WFS `CQL_FILTER` is silently ignored.** Querying with `CQL_FILTER=identificatie='...'` returns unfiltered results (random features, not the requested ID). Use **OGC XML Filter** encoding instead:
   ```
   Filter=<Filter><PropertyIsEqualTo><PropertyName>identificatie</PropertyName><Literal>{id}</Literal></PropertyIsEqualTo></Filter>
   ```
   This is standard WFS 2.0.0 and works reliably. The XML is URL-encoded by httpx's `params` dict.

2. **BAG IDs are always 16 digits.** Validate with `re.compile(r"^[0-9]{16}$")` at both service layer (ValueError) and API layer (FastAPI Path pattern returning 422).

3. **Fix multiple bugs from a single root cause.** Bugs "wrong building data" and "cache poisoning" both stemmed from bbox-based lookup. Switching to direct ID lookup (OGC XML Filter) fixed both and simplified the API contract.

## Learnings from F2 implementation sessions (2026-02-04)

### 3DBAG API deep knowledge

1. **CityJSON vertex encoding.** Vertices are integer arrays. Real coords = `vertex * scale + translate` where `scale`/`translate` come from `metadata.transform`. Each feature has its own `vertices` array but shares the transform.

2. **Single-item endpoint nests data under `feature` key.** `GET /collections/pand/items/NL.IMBAG.Pand.{id}` returns `CityJSONFeature` with `CityObjects`, `vertices`, `metadata` nested inside `data["feature"]`, NOT at root. Always use `inner = data.get("feature", data)` with fallback.

3. **Dense areas overwhelm pagination.** Amsterdam city center has 164-844 buildings in a 250m radius. Even MAX_PAGES=5 at 10 items/page only returns 50. **Dual-fetch strategy** is essential: direct target fetch by ID (fast, ~2s, guaranteed) + bbox fetch for surrounding context (slow, 12-17s server-side processing, best-effort).

4. **Server-side processing dominates latency.** 3DBAG bbox queries take 12-17s due to server-side processing, not network. This is not fixable on our end — design around it.

### Timeout chain coordination

The timeout chain must be coordinated across all layers:
- **3DBAG server processing:** 12-17s per bbox page (uncontrollable)
- **Backend httpx client:** `Timeout(10.0, connect=3.0)` default, `BBOX_TIMEOUT=20s`, `PER_PAGE_TIMEOUT=20s`
- **Frontend AbortController:** 25s (must exceed backend worst-case)
- **Rule:** Frontend timeout > backend total budget > per-external-call timeout. When changing any layer, cascade to the others.

### Time budget pattern for pagination

```python
start = time.monotonic()
while has_next_page:
    remaining = BBOX_TIMEOUT - (time.monotonic() - start)
    if remaining < 1.0:
        break
    timeout = httpx.Timeout(min(PER_PAGE_TIMEOUT, remaining), connect=3.0)
    # try/except per page, return partial results on failure
```

### Caching rules for external APIs

1. **Never cache empty/error responses.** When 3DBAG times out, the empty result was being cached for full 24h TTL. Subsequent requests got stale "no data" even after recovery. Only cache when `result.buildings` is non-empty.
2. **Cache keys must include all varying inputs.** The F1 cache key included coordinates that shouldn't affect output. The F2 cache key correctly uses only the stable input (pand_id + radius).

### Three.js architecture decisions

1. **LoD 0 footprint + height extrusion** (not LoD 2.2 semantics). Uses 2D footprint polygons with `b3_h_maaiveld` (ground) and `b3_h_dak_max` (roof max), extruded via `THREE.ExtrudeGeometry`. Simpler than parsing roof geometry.
2. **Plain Three.js** (not react-three-fiber or deck.gl). Full control over shadow maps, raycasting, canvas capture.
3. **SunCalc to Three.js light position:** Azimuth 0 = south (SunCalc), -Z = north (Three.js). Conversion: `x = -sin(az)*cos(alt)*D`, `y = sin(alt)*D`, `z = cos(az)*cos(alt)*D`.
4. **PCFSoftShadowMap**, 2048x2048, shadow camera frustum +-200m, far 600.
5. **Camera presets** are stateless (no active state): street `[40,15,40]`, balcony `[30,30,30]`, topDown `[0,200,0.1]`.

### Non-blocking async pattern for slow APIs

The 3D fetch (12-17s) must NOT block the address flow. Move slow fetches to `void (async () => { try { ... } catch {} })()` IIFE pattern. Set `loading=false` for building facts immediately; show 3D viewer loading separately.

### Race condition prevention

Use `useRef` counter (`neighborhood3DRequestId`) incremented on each address selection. In the async callback, only apply results if the counter still matches. This prevents stale data from overwriting fresh data on rapid address changes.

### Shadow snapshot capture

When capturing shadow snapshots (canvas capture at different times), save ALL scene state before mutation:
- Camera position (`.clone()`)
- Sun light position (`.clone()`) AND intensity
- Restore all after the snapshot loop.
`preserveDrawingBuffer` not needed if `toDataURL()` is called immediately after `render()` in the same synchronous block.

### Sunlight risk classification

Risk uses **winter solstice hours only** (worst case), not annual average. 12-month sampling (21st of each month) provides annual display data, but risk classification is based on the season with minimum sunlight.

### RIVM WMS endpoint correction

**RIVM noise layers ARE at** `https://data.rivm.nl/geo/alo/wms`. The GetCapabilities document is large, and noise layers appear deep in the layer list. Live naming pattern: `rivm_{YYYYMMDD}_Geluid_lden_wegverkeer_{YYYY}` (for example `rivm_20250101_Geluid_lden_wegverkeer_2022`) plus an `rivm_Geluid_lden_wegverkeer_actueel` variant. The `gcn` endpoint remains the correct source for air quality (PM2.5, NO2).

## Learnings from F3 implementation and hardening sessions (2026-02-05)

### F3 risk cards architecture

1. **Single endpoint, parallel fetch.** `GET /api/address/{vbo_id}/risks?rd_x=...&rd_y=...&lat=...&lng=...` fetches noise, air, and climate cards in parallel via `asyncio.gather()`. Cache key rounds float coordinates: `f"risks:{vbo_id}:{rd_x:.0f}:{rd_y:.0f}"`. TTL 7 days, conditional on having real data.

2. **Risk level aggregation.** Air quality: `max(pm25_level, no2_level)`. Climate: `max(heat_level, water_level)` evaluated across ALL available layers (not first-hit). Sunlight: winter solstice hours only. Level ranking: `unavailable=0, low=1, medium=2, high=3`.

3. **Warning message codes.** Backend sends stable enum-like codes (`NOISE_NO_VALUE`, `AIR_PARTIAL`, `CLIMATE_LOOKUP_FAILED`, etc.). Frontend maps to i18n keys via `t('risk.warning.${code}', code)` with raw-code fallback. This keeps the backend language-agnostic.

4. **Frontend risk cards timeout.** 20s `AbortController` on `getRiskCards()`. Timeout chain: frontend 20s > backend httpx 15s (connect 4s).

### Critical bugs found and patterns learned

1. **Noise regex never matched live data.** The regex pattern used lowercase `g` and missed the trailing year. Live layers use capital `G` and `_YYYY` suffix. Mocked tests passed because mock layer names matched the wrong regex. **Lesson: always verify regex patterns against actual live API responses.**

2. **Climate "first-hit break" understated risk.** The climate aggregation loop used `break` after the first successful sample. If the first layer returned "low" but a later layer returned "high," the lower risk was reported. **Fix: remove `break`, keep worst-case via `_level_rank` comparison.**

3. **Sunlight loading deadlock.** When 3DBAG returned no buildings or no `target_pand_id`, the sunlight callback never fired, leaving `SunlightRiskCard` in an infinite loading spinner. **Fix: explicit `unavailable` prop + `canComputeSunlight` guard variable.**

4. **Risk API failure silently hid F3 section.** The catch block set `setRiskLoading(false)` but never set error state. Rendering condition `(loading || data)` evaluated to `(false || null)`. **Fix: add `riskError` state; render condition becomes `(loading || data || error)`.**

5. **Air quality sentinel values.** RIVM WMS returns `-999`, `-9999`, or `1e30` as no-data. The noise card's guard (`-9990 < raw`) let `-999` through for air quality. **Fix: use `0 <= raw < 1e30` for concentrations (physically non-negative).** Different data types need different sentinel ranges.

6. **Climate source_date fallback.** Falling back to `sampled_at` (today's date) when layer date extraction fails misleads users. **Fix: let `source_date` be `None`; frontend shows "dataset date unknown."** Never substitute a sampling timestamp for a dataset publication date.

7. **All-unavailable results were cached for 7 days.** Temporary outages got locked into cache. **Fix: conditional caching — only cache when at least one card has real data.** Extends the "never cache empty/error responses" rule.

### WMS/WFS point-query patterns

1. **WMS GetFeatureInfo** (noise, air quality): 50m bbox, 101x101 pixel grid, query pixel (50,50). Inherently point-accurate for raster layers.

2. **WFS GetFeature** (climate vectors): Original 600m bbox with `count=1` returned arbitrary features, not nearest. **Fix: shrink to +/-5m bbox, fetch up to 5 features, select closest by bbox centroid distance.** WFS does not guarantee proximity ordering.

3. **Do not rely on AI-summarized GetCapabilities for layer discovery.** The RIVM ALO document is too large — noise layers deep in the list get truncated by summarizers. Parse full XML programmatically or query specific layer names via GetFeatureInfo.

### Three-state async model for React components

Every async data section needs three explicit states: loading, loaded, error. Reset all three on new input. A catch block that only clears loading creates invisible failures. Pattern:
```tsx
const [data, setData] = useState<T | null>(null);
const [loading, setLoading] = useState(false);
const [error, setError] = useState(false);
// Reset all on new input, set error in catch block
```

### Risk threshold references (WHO guidelines)

- **Noise:** WHO Environmental Noise Guidelines (2018) — Lden 53 dB onset, 63 dB high annoyance
- **PM2.5:** WHO Global Air Quality Guidelines (2021) — AQG 5 ug/m3, interim target 10 ug/m3
- **NO2:** WHO Global Air Quality Guidelines (2021) — AQG 10 ug/m3, interim target 20 ug/m3
- **Sunlight:** Winter solstice < 2 hrs = high, 2-4 hrs = medium, > 4 hrs = low

## Learnings from 3D viewer overhaul sessions (2026-02-05)

### Two-phase progressive 3D loading

1. **New endpoint `GET /{vbo_id}/building3d`** calls only `_fetch_target_building` (no bbox). Returns in ~2s. Cache key: `building3d:{pand_id}`.
2. **Frontend calls both phases as parallel fire-and-forget IIFEs.** Phase 1 sets `neighborhood3DLoading=false` immediately. Phase 2 updates with full context when ready.
3. **Sunlight/snapshot callbacks deferred until Phase 2.** Pass `undefined` callbacks while `surroundingLoading` is true: `onSunlightAnalysis={surroundingLoading ? undefined : setSunlight}`.

### Three.js shadow setup checklist

All four are required — missing any one causes silent failure:
1. `sunLight.castShadow = true`
2. `scene.add(sunLight)` — the light itself
3. `scene.add(sunLight.target)` — **CRITICAL: must add target to scene**
4. Shadow bias: `bias = -0.001`, `normalBias = 0.02`

Default `datePreset` must be `'summer'` (not `'today'`) to guarantee sun above horizon on first load.

### Camera positioning bugs and fixes

1. **`useRef` guard never reset on new address.** `cameraSetRef.current = true` persisted across address changes because `useRef` does not reset on re-render. **Fix: track `lastFocusedPandId` ref; reset `cameraSetRef` when it changes.**
2. **No fallback when target not found.** If `targetPandId` didn't match any building, camera stayed at hardcoded default `[100,120,100]`. **Fix: prefer target, fall back to `buildings[0]`.**
3. **Camera distance too large.** Changed from `maxSpan * 3` (min 30) to `maxSpan * 2` (min 25) and `buildingHeight * 2` (min 25) for closer framing.

### Three.js material and rendering rules

1. **Always use `THREE.DoubleSide`** for building materials. 3DBAG footprint winding order is not guaranteed consistent. CW-wound polygons become invisible with default FrontSide.
2. **Never use CSS `!important` on canvas dimensions.** `width: 100% !important; height: auto !important` collapses the canvas when Three.js calls `renderer.setSize()`.
3. **Construction-year color palette** for neighborhood context: pre-1900 terracotta, 1900-1945 sandy brown, 1945-1975 olive, 1975-2000 slate, post-2000 steel gray. Target building stays blue with edge highlight.
4. **HemisphereLight** (sky `0xb1e1ff`, ground `0xb97a20`, intensity 0.5) replaces flat AmbientLight for natural illumination gradient.

### Test count baselines (updated 2026-02-09)

- **Backend: 242 non-live + live smoke tests.** Any backend change must maintain or increase.
- **Frontend: 295 tests.** Any frontend change must maintain or increase.

### Process learnings

1. **Mocked tests can mask critical bugs.** The noise regex, air sentinel values, and climate first-hit bugs all passed unit tests. Only live API verification exposed them. Mocked tests verify logic correctness but not live behavior.
2. **Automated tests are insufficient for visual features.** Despite all tests passing and build clean, manual visual testing immediately found the camera positioning bug. For Three.js components, manual visual verification is mandatory.
3. **Assessment-first workflow for hardening.** Start with parallel subagent audits (backend + frontend) before any code. This revealed 7 bugs in F3 that feature-addition workflows missed.
4. **Plans should specify intent, let tests validate details.** The air sentinel fix plan specified `-9990 < raw` (copied from noise). The test caught that this was wrong for air quality data. Domain-specific physical constraints beat copied patterns.
5. **E2E assertions must evolve with behavior.** When error handling changes from "hide on failure" to "show error state," tests that assert element absence must be updated to assert the new visible error behavior.

## Learnings from 3D viewer visual overhaul sessions (2026-02-06)

### PDOK basemap integration

1. **BRT Achtergrondkaart is the street-style basemap.** URL pattern: `https://service.pdok.nl/brt/achtergrondkaart/wmts/v2_0/standaard/EPSG:3857/{z}/{x}/{y}.png`. Four themes: `standaard`, `grijs`, `pastel`, `water`. Use `.png` format (not `.jpeg` like the aerial layer).
2. **PDOK aerial imagery is `luchtfotorgb`.** URL: `https://service.pdok.nl/hwh/luchtfotorgb/wmts/v1_0/Actueel_orthoHR/EPSG:3857/{z}/{x}/{y}.jpeg`. Good for context but too busy under 3D buildings. Street basemap (`standaard`) provides cleaner visual reference.
3. **WMTS tile offset alignment is critical.** A tile centered on tile coordinates doesn't necessarily center on the query point. Must calculate pixel offset between query point and tile center, then translate the ground plane mesh. Formula: convert lat/lng to pixel coords within tile, compute offset from tile center, scale to world units.
4. **WMTS tile Z offset sign inversion.** WMTS Y increases southward, but Three.js Z increases southward too. The offset requires careful sign handling: `-offsetY` not `+offsetY` for the ground plane Z translation.
5. **Ground plane size must match tile size.** A 500m ground plane with a ~150m tile stretches the texture. Scale the ground plane to match the tile's real-world size, or use multiple tiles.

### Camera positioning and framing

1. **Camera presets must be relative to target.** Absolute offsets like `[40, 15, 40]` don't work when buildings are at arbitrary positions. Presets should add offsets to `targetCenter`: `camera.position.set(cx + offset[0], offset[1], cz + offset[2])`.
2. **Camera distance evolved through 3 iterations.** Started at `maxSpan * 3` (too far), then `maxSpan * 2` (still far for single building), settled on `maxSpan * 1.5` with `min=15`. Each iteration required user visual feedback — automated tests couldn't verify this.
3. **Single-building view as fallback.** When the neighborhood fetch is slow or missing buildings, showing just the target building with tight camera framing is better than showing an incomplete neighborhood. Filter: `buildings.filter(b => b.pand_id === targetPandId)`.

### 3DBAG single-item endpoint transform bug

**The single-item endpoint (`/items/{id}`) nests `metadata.transform` at the root level, NOT inside `feature`.** The `data['feature']` contains `CityObjects`, `vertices`, `type` but NOT `metadata`. The transform is at `data['metadata']['transform']`. This differs from the bbox endpoint where transform is at `data['metadata']['transform']` at root (consistent, but the feature extraction path can miss it). Always extract transform from the outermost `metadata` key.

### Visual style decisions

1. **Uniform light gray buildings (`0xf5f5f5`)** read cleaner than construction-year coloring for a property-evaluation context. Year coloring is interesting but distracting from the primary use case. Target building stays blue (`#2563eb`) for UX clarity.
2. **Removed GridHelper.** Grid lines add visual noise and don't help users understand the neighborhood. The basemap provides sufficient spatial reference.
3. **Full opacity (1.0) for all buildings.** Transparency (0.7) makes buildings look ghostly and reduces shadow visibility.

## Learnings from F4 neighborhood stats implementation (2026-02-06)

### CBS OGC API integration

1. **CBS Wijken & Buurten 2024 has 300+ fields.** Curated to 9 indicators in 4 groups: People (density, household size, single-person %), Age (3 bands), Housing (owner-occupied %, avg property value), Access (train distance, supermarket distance), plus urbanization badge.
2. **CBS frequently suppresses data.** Owner-occupied %, avg property value, and distance indicators are often `None` due to CBS privacy rules (small sample size in buurt). Always check `available` field and show "unavailable" in UI.
3. **Buurt code lookup can fail.** Primary strategy: query by buurt code from frontend. Fallback: bbox query at the address coordinates. Bbox may return a neighboring buurt if the point is on a boundary. Accept this as a reasonable fallback.
4. **Age band reduction for UX.** CBS provides 5 age bands (`0-14`, `15-24`, `25-44`, `45-64`, `65+`). Aggregated to 3 groups for the card: `0-24`, `25-64`, `65+`. Backend handles the aggregation in `_parse_age_profile()` with correct `None` handling.

### F4 architecture patterns

1. **Single endpoint with parallel fetch.** `GET /api/address/{vbo_id}/neighborhood?lat=...&lng=...&buurt_code=...`. Cache key: `neighborhood:{buurt_code}` or `neighborhood:{lat:.4f}:{lng:.4f}`. TTL 30 days (CBS data updates annually).
2. **Frontend timeout alignment.** `getNeighborhoodStats()` uses 15s `AbortController` timeout matching the backend CBS httpx client timeout. Pattern: `AbortController` + `setTimeout` + `clearTimeout` in `try/finally`.
3. **Floating-point aggregation in tests.** Summing CBS percentages (e.g., `15.2 + 12.1 = 27.299999999999997`). Use `abs(result - expected) < 0.01` instead of exact equality.
4. **Live smoke tests.** `@pytest.mark.live`, excluded from CI via `-m "not live"`. Lenient assertions: check field exists, not exact buurt_code match (bbox fallback may return different code).

### NeighborhoodStatsCard frontend patterns

1. **Grouped indicator layout.** Indicators organized into People, Housing, Access groups. Each indicator has `name`, `value`, `available` fields. Unavailable indicators show explanatory text, not empty space.
2. **Age distribution bars.** Horizontal bar chart with 3 segments. Width proportional to percentage. Shows percentage labels. Uses CSS `display: flex` for layout.
3. **Urbanization badge.** 5-level scale (1=very urban to 5=rural). Displayed as a colored badge with descriptive label. Maps CBS integer to i18n key.
4. **E2E test pattern.** 6 tests: happy path, buurt name subtitle, age bars, unavailable indicators, error state, bilingual support. Follows `f3-risk-cards.spec.ts` structure (Playwright + real backend).

## Learnings from LoD 2.2 roof geometry implementation (2026-02-06)

### 3DBAG LoD 2.2 data structure

1. **LoD 2.2 geometry is in BuildingPart children, NOT the parent Building.** The parent `Building` CityObject only has LoD 0 geometry. LoD 2.2 `Solid` geometry is in `BuildingPart` child objects. The original code explicitly skipped `BuildingPart` (`if co_type != "Building": continue`). Fix: check `Building` first, then look at its `children` for `BuildingPart` entries containing LoD 2.2.
2. **Solid geometry structure.** LoD 2.2 uses `"type": "Solid"` with boundaries `[[[surface1_outer, surface1_inner, ...], [surface2_outer, ...], ...]]`. Outer shell is `boundaries[0]`. Each surface is a list of rings; first ring is the outer boundary.
3. **Surface classification heuristic.** `avg_z > ground + height * 0.5` classifies as roof, else wall. This works for flat and simple pitched roofs but fails for complex gabled roofs where wall surfaces span ground to ridge (avg Z ~ midpoint ≈ threshold). More sophisticated classification would need normal vector analysis.

### Test geometry design

1. **Gabled roof test geometry fails with avg-Z heuristic.** A realistic gabled roof has wall polygons spanning ground to ridge. The wall average Z equals the roof average Z, making classification ambiguous. **Fix: use flat-roof test geometry** (all roof vertices at the same high elevation) where classification is unambiguous.
2. **Flat-roof test geometry:** Ground at 1.75m, flat roof at 10.0m. All roof surface vertices at Z=10.0m → avg_z = 10.0 > threshold (5.875). All wall vertices span 1.75 to 10.0 → avg_z = 5.875 ≤ threshold. Clean separation.

### Feature flag discipline

1. **Backend feature flag `BUURT_ENABLE_LOD22_ROOFS`** defaults to `false`. Must be explicitly enabled via environment variable or `.env` file. Pydantic-settings reads `.env` files when configured with `env_file = ".env"` in `model_config`.
2. **Cache lazy migration.** New `roof_surfaces` field on `BuildingBlock` defaults to `None` (Pydantic). Cached responses without the field deserialize correctly. 24h Redis TTL means full refresh after enabling the flag.
3. **Deployment sequence:** Flag OFF → deploy → verify no regressions → enable in staging → gradual production rollout.

### Coordinate system alignment (in progress)

1. **LoD 2.2 surfaces use RD offsets from center + NAP heights.** Frontend converts to Three.js Y-up: `[dx, NAP_height - minGround, dy]`. No X-rotation needed (already Y-up). LoD 0 `ExtrudeGeometry` needs `-Math.PI/2` rotation.
2. **Building rotation/positioning mismatch.** LoD 2.2 geometry appeared slightly rotated and offset compared to LoD 0. Root cause: LoD 2.2 vertices come from BuildingPart (possibly different coordinate anchor than parent Building). Alignment verification requires visual comparison with basemap — automated tests cannot catch this.

### Dependencies

1. **scipy added for ConvexHull.** `scipy>=1.11.0` in `pyproject.toml`. Used in `_extract_footprint_from_surfaces()` to compute 2D convex hull from 3D surface projections. Handles degenerate cases (collinear points) with try/except fallback.
2. **numpy added as scipy dependency.** Used for ConvexHull input but also available for any future numerical operations.

### Process learnings (Feb 6)

1. **User visual feedback is irreplaceable for 3D work.** Camera framing, basemap alignment, building positioning, and roof geometry all required multiple user screenshot → fix → re-test cycles. No amount of automated testing substitutes for "does it look right?"
2. **Coordinate bugs are the hardest to debug remotely.** The basemap offset, building rotation, and transform nesting bugs all required understanding three coordinate systems (RD New, WMTS Web Mercator, Three.js local) and how they interact. Always trace a single known point through all coordinate transforms.
3. **Multiple sessions on the same feature is normal.** The 3D viewer went through 4 sessions (visual style, camera fix, basemap+zoom, LoD 2.2) before reaching acceptable quality. Each session addressed issues discovered by visual inspection in the previous session.
4. **Feature flags prevent deployment stress.** LoD 2.2 could be deployed safely with the flag OFF, tested in staging, then enabled gradually. This is especially valuable for visual features where regression risk is high.
5. **pydantic-settings `.env` file loading.** Add `env_file = ".env"` to `model_config` in the Settings class. Without this, environment variables from `.env` files are not loaded — only system environment variables or explicit `BUURT_*` prefixed vars work.

## Learnings from F2 completion and 3D viewer fix sessions (2026-02-08)

### WMS Tile Proxy Pattern

1. **Backend proxy required for WMS overlays.** CORS prevents frontend from calling RIVM/Klimaateffectatlas directly. Backend proxy at `GET /api/address/{vbo_id}/wms-tile?source={noise|air_quality|climate}&rd_x=...&rd_y=...&radius=250` fetches WMS GetMap in EPSG:28992 (RD New) and returns PNG bytes.
2. **Content-type validation mandatory.** WMS services return HTTP 200 + XML error documents when layers are unavailable. Always check `Content-Type: image/*` before returning bytes. An HTTP 200 does NOT guarantee a valid image.
3. **Reuse layer selection logic from risk cards.** Import `_select_noise_layer`, `_select_air_layer`, `_CLIMATE_HEAT_LAYERS` from `risk_cards.py` into `wms_tile.py`. Avoids duplicating layer discovery and regex matching. Creates coupling — acceptable for MVP; extract to shared module if logic diverges.
4. **WMS tile cache key:** `wms_tile:{source}:{rd_x:.0f}:{rd_y:.0f}:{radius:.0f}`. Round coordinates to avoid cache fragmentation. TTL 24 hours (raster data updates infrequently).

### Three.js WMS Overlay Rendering

1. **Overlay mesh positioning.** Place overlay `PlaneGeometry` at `Y=0.1` (just above ground plane at Y=0). Match ground plane dimensions.
2. **Material settings for transparency.** `MeshBasicMaterial({ map: texture, transparent: true, opacity: 0.5, depthWrite: false })`. **Critical:** `depthWrite: false` prevents z-fighting with the ground plane.
3. **Blob URL cleanup pattern.** Load texture via `URL.createObjectURL(await resp.blob())`. Always `URL.revokeObjectURL()`, `texture.dispose()`, `geometry.dispose()` when overlay changes or component unmounts. Prevents memory leaks.
4. **Single-active overlay toggle.** Use `activeOverlay: OverlayId | null` state (not `Set<OverlayId>`). Toggle logic: `onClick={() => setActiveOverlay(isActive ? null : id)}`. Simpler than multi-select with exclusion rules.

### WMTS Basemap Zoom Level Calculation

1. **Tile coverage must exceed geometry bbox.** Formula: `tile_size_meters = (40075017 / 2^zoom) * cos(latitude_radians)`. At Amsterdam (52.37°N): zoom 18 ≈ 153m, zoom 16 ≈ 612m.
2. **Rule:** If geometry bbox radius = R meters, basemap zoom must provide `tile_size >= 2R`. 3D viewer fetches buildings within 250m radius (500m bbox), so zoom 16 is the minimum at Amsterdam latitude. Zoom 18 caused buildings to render outside the basemap.

### Construction Year Coloring

1. **Period-appropriate facade colors** communicate building age at a glance. Palette based on Dutch architectural periods:
   - Pre-1900: Sienna (traditional brick) `0xa0522d`
   - 1900-1945: Warm orange-brown (Amsterdam School) `0xcc7722`
   - 1945-1975: Sandy yellow (post-war reconstruction) `0xc8b87d`
   - 1975-2000: Neutral gray (prefab era) `0x9e9e9e`
   - 2000+: Blue-gray (contemporary) `0xb0bec5`
   - Unknown: Light gray `0xe0e0e0`
2. **Target building stays blue** (`#2563eb`) regardless of construction year, for UX clarity.

### Stale Cache Defeats Feature Flags

1. **Root cause of "LoD 2.2 not showing" after flag enabled.** `neighborhood3d:*` cache keys were populated when `enable_lod22_roofs=false`. With 24h TTL, old responses (`roof_surfaces: null`) persisted despite flag now being `true`. **Fix: flush affected cache keys when toggling feature flags that change response shape.** Don't wait for TTL expiry.
2. **General rule:** Feature flags that alter API response structure require cache invalidation on toggle. This extends the "never cache empty/error responses" principle — also never serve cached responses from a different feature flag state.

### Two-Layer Ground System for Basemap

1. **Problem:** Single WMTS tile with offset can leave buildings outside the tile when the query point is near a tile edge. Gray `PlaneGeometry` base is visible.
2. **Solution:** Two-layer ground: (1) Large neutral gray base (1000m, always covers all buildings), (2) Textured basemap tile positioned with offset at `Y=0.01` above the base.
3. **Trade-off:** The gray base is visible at edges, but buildings never appear to "float" over nothing. Preferable to gaps.

### 3DBAG Performance Tuning

1. **Radius reduction has biggest impact.** Reducing bbox radius from 250m to 150m cuts search area by 64%. `MAX_PAGES=2` (40 buildings max) is sufficient for 150m radius in most areas but may miss buildings in dense city centers. `MAX_PAGES=3` (60 buildings) is safer.
2. **`BBOX_TIMEOUT` increased to 30s** to accommodate larger server-side processing times for dense neighborhoods. Cascade: `BBOX_TIMEOUT=30s` > `PER_PAGE_TIMEOUT=20s` > `connect=3s`. Frontend abort timeout must exceed 30s.
3. **Progressive loading requires endpoint separation.** Single-building target fetch (`/building3d`, ~2s) must be separate from neighborhood bbox fetch (`/neighborhood3d`, 12-17s). A single monolithic endpoint forces frontend to wait for the slowest operation.

### CLAUDE.md Files Updated (2026-02-09)

1. **`frontend/CLAUDE.md` and `backend/CLAUDE.md` fully rewritten** to match actual codebase. Previously described non-existent architecture (Zustand, React Query, Tailwind, SQLAlchemy, PostGIS). Now accurately reflect: React 18 + Vite + plain CSS + plain Three.js (frontend) and FastAPI + httpx + Pydantic + Redis (backend).
2. **Root `CLAUDE.md` updated** with current project status (F1-F5 implemented, design system applied), updated architecture decisions, file structure, test baselines (295 frontend, 242 backend), and design system information.
3. **Root `CLAUDE.md` is authoritative.** Subdirectory CLAUDE.md files provide role-specific conventions. Always verify claims against actual codebase before trusting them for planning.

### Test Count Baselines (updated 2026-02-09)

- **Backend: 255 non-live + live smoke tests.** Previous baseline: 242. +13 from PDF export tests.
- **Frontend: 324 tests.** Previous baseline: 295. +29 from design system components, dark mode, recent searches, animated score, quartile dots, export bottom sheet, and integration tests.

### Process Learnings (Feb 8)

1. **Passing tests ≠ working product.** All automated tests passed (backend 162, frontend 150, ruff clean, build clean), but user reported LoD 2.2 not rendering, buildings outside basemap, and >20s render time. Visual/UX bugs require manual verification with real data.
2. **Debug print statements proliferate during fix sessions.** After debugging, always grep for `print(` and clean up before committing. Replace with `logger.info()`/`logger.warning()` if logging is still needed.
3. **Progressive enhancement: ship UI stubs first.** OverlayControls existed as "Coming soon" stub (shipped in F2), then was wired to real WMS data in a separate session. This validates UX patterns before investing in backend infrastructure.
4. **Plan-first for multi-issue bugs.** When multiple related issues appear after a feature change, investigate all root causes before implementing fixes. Fixing symptoms (smaller ground, fewer pages) without addressing root causes (stale cache, tile coverage) wastes time.

## Learnings from F2 3D viewer UI overhaul session (2026-02-09)

### GSAP Animation Integration

1. **GSAP for camera transitions.** `gsap.to(camera.position, { x, y, z, duration: 0.3, ease: 'power2.inOut' })` provides smooth 300ms transitions between camera presets. Must also animate `controls.target` in parallel. Install: `npm install gsap`.
2. **Fullscreen API pattern.** Use `element.requestFullscreen()` + `document.exitFullscreen()` wrapped in try/catch. Sync React state with `fullscreenchange` event listener on the viewer element. CSS class `.fullscreen` sets `position: fixed; inset: 0; z-index: 1000`.
3. **Native fullscreen exit handling.** When user presses Escape, browser fires `fullscreenchange` event but React state isn't updated. Must listen for `fullscreenchange` on the element and sync `isFullscreen` state.

### 3D Viewer UI Enhancements

1. **Season emoji buttons.** Replace text labels ("Winter", "Summer") with emoji buttons (snowflake, flower, sun, leaf) for season presets. Compact and language-independent. Season changes update shadow date preset.
2. **Hour tick marks on time slider.** Show subtle tick marks at 6:00, 9:00, 12:00, 15:00, 18:00 on the time slider. Pure CSS with `::after` pseudo-elements.
3. **Overlay popover with opacity slider.** When overlay is active, show a popover below the button with a 25-75% opacity range slider. `MeshBasicMaterial.opacity` updates in real-time. Close popover on click outside or overlay deactivation.
4. **Sunlight summary badge.** Floating badge on 3D viewport showing winter solstice hours + risk level. Uses `localSunlight` state set from `onSunlightAnalysis` callback. Position: top-right of viewport.
5. **FPS monitoring with adaptive quality.** Measure frame times over 60-frame window. If average FPS < 20 for 3 consecutive windows, reduce shadow map size (4096→2048→1024) and show user banner. `lowPerformance` ref prevents re-triggering.
6. **Camera presets as viewport overlay buttons.** Move camera preset buttons from ShadowControls into the 3D viewport itself (top-left cluster). This provides always-visible camera controls without scrolling.
7. **`mergeGeometries` for performance.** Import from `three/addons/utils/BufferGeometryUtils.js`. Merge all non-target building geometries into a single draw call. Significant FPS improvement with 40+ buildings.

### Dark Mode for Three.js

1. **Target building color changes with theme.** Light mode: blue `0x2563eb`. Dark mode: teal `0x26a69a`. Read from `document.documentElement.getAttribute('data-theme')`.
2. **Shadow map size increased.** `SHADOW_MAP_SIZE = 4096` (was 2048) for sharper shadows. Falls back to 2048/1024 via FPS-based adaptive quality.
3. **Frustum increased.** `FRUSTUM = 300` (was 200) to cover larger neighborhood area with zoom 16 basemap.

## Learnings from Clear Signal Hybrid design system implementation (2026-02-09)

### Design Token Architecture

1. **CSS custom properties for theming.** All colors, spacing, radii, shadows defined as `var(--token)` in `styles/tokens.css`. Dark mode overrides via `[data-theme="dark"]` selector. ~170 tokens total.
2. **Card elevation system.** Three levels: `--shadow-sm` (subtle), `--shadow-md` (cards), `--shadow-lg` (modals). Dark mode uses lighter shadows or replaces with border emphasis.
3. **Score display typography.** `--type-score-tile: 40px/1 Satoshi Black`, `--type-score-large: 48px/1 Satoshi Black`. Separate from body type scale for visual impact.

### Dark Mode Implementation

1. **Three-way toggle.** `ThemePreference = 'light' | 'dark' | 'system'`. Stored in localStorage (`buurt-check-theme`). System preference uses `window.matchMedia('(prefers-color-scheme: dark)')` with change listener for real-time switching.
2. **`data-theme` attribute on `<html>`.** All dark mode CSS uses `[data-theme="dark"]` selectors. Applied in `theme.ts` via `document.documentElement.setAttribute('data-theme', effective)`.
3. **Dark mode token overrides.** Background: `#121212`, surface: `#1E1E1E`, text: `rgba(255,255,255,0.87)`. Risk colors remain same hue but adjust brightness for contrast.
4. **Three.js dark adaptation.** Ground plane, hemisphere light, and target building color all respond to theme. Read `data-theme` attribute during scene setup and material creation.

### Recent Searches

1. **localStorage persistence pattern.** Same pattern as shortlist: `getRecent()`, `addRecent()`, `removeRecent()`, `clearRecent()`. Max 10 items. Dedup by `id` field. Sorted by timestamp (most recent first).
2. **Search screen first-launch state.** When no recent searches exist, show value proposition rows explaining the app's benefits. When recent searches exist, show them as tappable list items below the search input.

### PDF Export

1. **fpdf2 library chosen over WeasyPrint.** fpdf2 is pure Python, no system dependencies (WeasyPrint needs cairo/pango). Trade-off: no HTML templates, must build layout programmatically.
2. **Unicode sanitization for Helvetica.** fpdf2 with built-in Helvetica (latin-1 only) can't render em dashes, smart quotes, bullets. `_sanitize()` function maps Unicode chars to latin-1 equivalents. Final fallback: `text.encode('latin-1', errors='replace').decode('latin-1')`.
3. **Quick Brief template.** 1-page PDF: header (buurt-check branding + "VIEWING BRIEFING"), address + building facts, risk scores grid (4 categories with severity), optional shadow snapshot image (base64 → bytes → in-memory file), viewing questions, footer with generation date + disclaimer.
4. **Export endpoint pattern.** `GET /{vbo_id}/export?address=...&template=quick_brief&language=en&shadow_image=...`. Fetches risk cards (from cache if available) + viewing questions server-side. Returns `application/pdf` with `Content-Disposition: attachment`. Shadow image passed as base64 query param (optional).
5. **Frontend ExportBottomSheet.** Bottom sheet with template selection and language toggle. Triggers download via `window.open()` with query params or `fetch()` + `URL.createObjectURL(blob)` + click-to-download pattern.

### Component Architecture Patterns

1. **AnimatedScore component.** CSS `@keyframes` count-up animation from 0 to target score. Uses `requestAnimationFrame` with easing. Duration 600ms. Displays "—" for null scores.
2. **QuartileDots component.** 4 small dots indicating score quartile position (which 25% band the score falls in). Filled dot for active quartile, outline for others.
3. **RiskTile as summary card.** Shows score number, severity badge, and one-line summary. Tappable to open RiskDetailView. 2x2 grid layout with consistent card sizing.
4. **RiskDetailView as full-screen overlay.** Slides up from bottom. Contains score, comparison chart (address vs city vs NL vs WHO), summary text, and viewing questions with checkboxes.
5. **ViewingChecklist aggregation.** Collects viewing questions from all risk cards + neighborhood stats into a single checklist. Questions grouped by category. Checkbox state managed in App.tsx via `Set<string>`.

### Multi-Context Session Management

1. **Context continuation summaries work well.** Sessions that hit context limits continued seamlessly with AI-generated summaries of prior work. The summary captured completed steps, current state, and remaining work accurately.
2. **Long implementation plans (30 steps) should use batched commits.** Group related steps into logical commits (e.g., "Steps 1-7: CSS polish", "Steps 8-9: Search experience"). Don't commit after every single step — too noisy. Don't wait until the end — too risky.
3. **Phase-based planning enables parallel execution.** 11 phases with clear boundaries allowed different sessions to pick up where others left off. Each phase had explicit entry/exit criteria.

### Process Learnings (Feb 9)

1. **Plan-then-execute across sessions.** Planning sessions (ca55820e, 370d38a7, ffb38943) produced detailed multi-step plans. Execution sessions (ec53c097, 1a753811, 88b0c0b7) consumed those plans. This separation keeps planning thorough and execution focused.
2. **7 sessions in one day is productive but error-prone.** High velocity but no compound-engineering after any session. Learnings accumulate debt quickly. Compound after every implementation session, not in batch.
3. **Test baselines drifted significantly.** Backend went 242→255, frontend 295→324 across the day. CLAUDE.md still referenced old baselines in multiple places. Test baselines should be updated immediately after test-adding commits.
4. **ruff errors in `scripts/` directory are persistent.** Untracked diagnostic scripts in `scripts/` consistently fail ruff checks but are not part of the app. Either add them to `.gitignore` or fix their lint errors to avoid noise during quality gates.
5. **Large design system changes require real-device testing.** Token changes, dark mode, and responsive layout adjustments need visual verification on actual mobile screens. Desktop browser testing misses touch interaction, safe area, and viewport issues.
