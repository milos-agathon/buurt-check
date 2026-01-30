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

## File structure (planned)

```
buurt-check/
  docs/              # Design docs, plans, architecture decisions
  backend/           # FastAPI application
    app/
      api/           # Route handlers
      services/      # Business logic and data source integrations
      models/        # Pydantic models
      ingestion/     # Scheduled data ingestion jobs
  frontend/          # React application
    src/
      components/    # UI components
      pages/         # Page-level components
      services/      # API client and data fetching
      i18n/          # EN/NL translations
  CLAUDE.md
  prd.md
```

## Current project status

**Stage: F1 implementation in progress.** The PRD (v1.1) is complete. Backend scaffolding for F1 (Address Resolution + Building Facts) is implemented with FastAPI, including models, services (locatieserver, BAG), Redis cache, and tests. Frontend scaffolded with Vite + React + TypeScript. Frontend components for F1 (address search, building facts card, map) are not yet implemented.

### What exists
- `backend/` — FastAPI app with address suggest, lookup, and building facts endpoints
- `backend/tests/` — Unit tests for models, locatieserver service, BAG service, and address API
- `frontend/` — Vite + React + TypeScript scaffold (default template, no custom components yet)
- `docs/prd.md` — v1.1, fully restructured with 13 sections

### What's next
- Implement frontend components: AddressSearch, BuildingFactsCard, BuildingFootprintMap
- Add i18n (EN/NL) with react-i18next
- Add Leaflet map for building footprint display
- Compose HomePage with responsive layout
- Run backend tests and verify endpoints work against live PDOK APIs

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
- **Frontend deps (planned):** `react-i18next`, `i18next`, `i18next-browser-languagedetector`, `leaflet`, `react-leaflet`

### Process learnings

1. **Plan before implementing.** The PRD restructure (v1.0 → v1.1) and F1 planning sessions produced a much cleaner implementation than jumping straight to code. The plan identified the 3-step API chain and endpoint separation before any code was written.

2. **Explore APIs before designing.** The BAG API does not work the way the PRD initially assumed. Real API exploration revealed the Locatieserver requirement — this would have been a painful discovery mid-implementation.

3. **Two planning sessions produced conflicting plans.** Thread be9eddb5 planned F1 with `requirements.txt`, in-memory cache, and `/api/v1/address` endpoint. Thread e20ec1d6 planned F1 with `pyproject.toml`, Redis, and `/api/address/suggest|lookup|building` endpoints. The second plan (e20ec1d6) was approved and implemented. When running parallel planning sessions, ensure only one plan gets approved and used.

4. **Frontend scaffolding came last.** The Vite scaffold was one of the final steps in the implementation session, with the backend fully built first. This is the correct order — backend APIs need to exist before frontend can consume them.
