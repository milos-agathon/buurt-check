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

- **Backend**: FastAPI (Python) + PostGIS
- **Data ingestion**: Scheduled jobs for raster/ZIP data; on-demand WMS/WCS sampling with caching for real-time queries
- **API serving**: Custom JSON REST API for vector data; pre-sampled tiles or WMS proxy with caching for rasters
- **Client**: Web-first (mobile responsive), React. Mobile wrapper via React Native later.
- **3D rendering**: Three.js or deck.gl for the 3D neighborhood viewer. Directional light positioned using SunCalc to cast real-time shadows. Shadow maps for interactive timeline; server-side headless render (e.g., headless GL) for static snapshot generation.

## Risk card design principles

Every risk card must contain exactly four elements:
1. **Score/level**: low / medium / high (with color coding)
2. **What it means**: plain-language EN/NL explanation -- no jargon
3. **What to ask/check at viewing**: actionable questions for the buyer
4. **Source + date**: transparency about where the data comes from and how recent it is

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
  docs/              # Design docs, plans, architecture decisions
  backend/           # FastAPI application
    app/
      api/           # Route handlers (address.py, neighborhood.py, router.py)
      cache/         # Redis cache with circuit breaker (redis.py)
      services/      # Business logic (bag.py, locatieserver.py, three_d_bag.py)
      models/        # Pydantic models (address.py, building.py, neighborhood.py)
      config.py      # Settings via pydantic-settings
      main.py        # FastAPI app entry point
    tests/           # pytest tests (73 tests)
  frontend/          # React application (Vite + TypeScript)
    src/
      components/    # F1: AddressSearch, BuildingFactsCard, BuildingFootprintMap, LanguageToggle
                     # F2: NeighborhoodViewer3D, ShadowControls, ShadowSnapshots,
                     #     SunlightRiskCard, OverlayControls
      services/      # API client (fetch-based)
      types/         # TS interfaces mirroring backend models
      i18n/          # i18next config + en.json + nl.json
      test/          # Test setup (setup.ts, helpers.ts)
  CLAUDE.md
```

## Current project status

**Stage: F1 + F2 implemented and validated. Moving to F3.**

### What exists
- `backend/` — FastAPI app with address suggest, lookup, building facts, and 3D neighborhood endpoints. BAG identity lookups are exact ID-based (OGC XML Filter). 3DBAG integration with dual-fetch strategy (direct target + bbox surrounding). Redis cache with circuit breaker. 73 passing tests (14 api + 15 bag + 5 cache + 10 locatieserver + 10 models + 19 three_d_bag).
- `frontend/` — Vite + React + TypeScript. F1: AddressSearch, BuildingFactsCard, BuildingFootprintMap, LanguageToggle. F2: NeighborhoodViewer3D (Three.js), ShadowControls (time slider + date presets + camera presets), ShadowSnapshots (canvas capture at 9:00/12:00/17:00 winter solstice), SunlightRiskCard (12-month sampling, risk classification), OverlayControls (noise/air/climate stubs). 98 passing Vitest tests. i18n with react-i18next. Vite proxy to backend.
- `docs/prd.md` — v1.1, fully restructured with 13 sections

### What's next
- Maintain quality gates: `ruff check`, backend pytest (73+), frontend vitest (98+), `npm run build`, Playwright E2E smoke.
- Implement F3 risk cards (noise, air quality, climate stress). Note: RIVM noise WMS is NOT at the `alo` endpoint — that's green/livability. Locate the correct noise endpoint.
- Implement F4 neighborhood stats (CBS Wijken & Buurten).

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

1. **Three separate backend endpoints for F1** (not one combined):
   - `/api/address/suggest` — lightweight, fires on every keystroke
   - `/api/address/lookup` — runs once on selection, resolves BAG IDs
   - `/api/address/{vbo_id}/building` — heavy call, fetches geometry, cached independently

2. **Redis from the start** (via Docker: `docker run -d --name buurt-redis -p 6379:6379 redis:7-alpine`). Cache with graceful degradation — app works without Redis, just slower.

3. **Leaflet for F1 2D maps** (not deck.gl). Leaflet is free, no API key, lightweight. deck.gl reserved for F2 3D neighborhood viewer.

4. **Plain CSS, mobile-first.** No CSS framework. Matches YAGNI principle.

5. **pyproject.toml for backend** (not requirements.txt). Modern Python packaging.

### Development environment notes

- **Windows (Git Bash):** `cd /d D:\path` does not work in bash. Use `cd "D:/path"` or `cd /d/path` instead.
- **Vite frontend scaffolding:** Use `npx create-vite frontend --template react-ts` to scaffold.
- **Backend Python deps:** `fastapi[standard]`, `uvicorn[standard]`, `httpx`, `pydantic`, `pydantic-settings`, `redis`
- **Backend dev deps:** `pytest`, `pytest-asyncio`, `pytest-httpx`, `ruff`
- **Frontend deps (installed):** `react-i18next`, `i18next`, `i18next-browser-languagedetector`, `leaflet`, `react-leaflet`, `@types/leaflet`

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
4. **Test count baselines.** Backend: 73 tests. Frontend: 98 tests. Any change must maintain or increase these numbers.

### Frontend patterns established

1. **i18n:** All user-facing strings go in `src/i18n/en.json` and `nl.json`. Keys use dot notation (`building.title`). Components use `useTranslation()` hook. For bilingual data from the API (e.g., `status` vs `status_en`), select based on `i18n.language`.
2. **API client:** `src/services/api.ts` uses native `fetch`. No axios. Throws on non-OK responses. Supports `AbortSignal` for cancellation.
3. **CSS:** Plain CSS, mobile-first. CSS variables defined in `index.css` `:root`. Component CSS co-located (e.g., `AddressSearch.css` next to `AddressSearch.tsx`). BEM-like naming (`address-search__input`).
4. **State management:** App-level state in `App.tsx` via `useState`. No global state library. Pass data down as props. This is sufficient for F1-F4; re-evaluate if state grows complex.

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

The noise data is NOT at `https://data.rivm.nl/geo/alo/wms` — that endpoint contains green/livability layers. The correct noise endpoint needs to be located for F3. The `gcn` endpoint is confirmed for air quality (PM2.5, NO2).
