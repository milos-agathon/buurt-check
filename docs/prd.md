# buurt-check — Product Requirements Document

> **Version:** 2.0 | **Last updated:** 2026-02-06

> **One-liner:** Paste a Dutch address, get an instant risk-and-reality dossier with 3D context, environmental risk cards, and a printable viewing briefing.

## Table of contents

1. [Market opportunity](#1-market-opportunity)
2. [Product goal](#2-product-goal)
3. [Target users](#3-target-users)
4. [Core user journey (MVP)](#4-core-user-journey-mvp)
5. [MVP feature set](#5-mvp-feature-set)
6. [Out of scope](#6-out-of-scope)
7. [Success metrics](#7-success-metrics)
8. [Data sources & ingestion](#8-data-sources--ingestion)
9. [3D visualization pipeline](#9-3d-visualization-pipeline)
10. [MVP architecture](#10-mvp-architecture)
11. [Performance & quality requirements](#11-performance--quality-requirements)
12. [Privacy & legal](#12-privacy--legal)
13. [Risks & mitigations](#13-risks--mitigations)
14. [Why this can win](#14-why-this-can-win)

---

## 1. Market opportunity

This section maps which problems have strong open data support and weak coverage in existing Dutch property buyer apps, establishing where buurt-check can differentiate.

### Tier A — strong open data + weak coverage in existing buyer apps

These are the ones where you can make a *real market contribution* fast:

1. **Address → Risk & Reality Dossier (the "Viewing Briefing")**
   One link/address becomes a shareable, bilingual (EN/NL) dossier: building facts + neighborhood stats + environmental/climate risks + noise/air quality + 3D context.
   Why this stands out: most apps show *a map*; you'll show **consequences + questions to ask at the viewing**.
   Data is there: BAG, CBS, RIVM/Atlas Leefomgeving WMS, Klimaateffectatlas WMS/WFS, 3DBAG/3D Basisvoorziening. ([api.pdok.nl][1])

2. **3D "micro-neighborhood truth" (sun/shadow + canyon effect + context)**
   The dual-renderer 3D viewer is the differentiator: Three.js renders the block interactively in-browser while forge3d produces publication-quality server-side snapshots. Answer practical questions: *"Is this ground-floor dark all year?" "Is the balcony boxed in?"*
   Feasible via 3DBAG API/downloads and/or Kadaster 3D Basisvoorziening (3D Tiles + OGC API). ([docs.3dbag.nl][2])

3. **Noise & air quality at 10m–50m scale (as "livability risk cards")**
   This is a huge expat pain point ("I didn't realize it was that loud / polluted"). RIVM provides public WMS + downloadable rasters/zips for noise and GCN air quality. ([data.overheid.nl][3])

4. **Climate-stress flags that buyers *actually misunderstand***
   Water nuisance / flooding vulnerability / heat stress / drought sensitivity presented as *"what it means for you"* + mitigation questions for the seller/VvE. Klimaateffectatlas is explicitly open + WMS friendly. ([klimaateffectatlas.nl][4])

### Tier B — feasible, but differentiation depends on execution

5. **Neighborhood "fit" cards (CBS Wijken & Buurten)**
   Demographics, density, etc. This exists in various places, but rarely packaged for *buyers* with "so what?" explanations. ([pdok.nl][5])

6. **Energy label lookup + "upgrade reality"**
   You *can* integrate EP-Online, but it requires an API key and careful caching. Still valuable for first buyers' running costs. ([RVO.nl][6])

### Tier C — don't attempt in MVP (either not open or you'll get wrecked legally/operationally)

7. **Accurate valuation / "fair price" / winning bid strategy**
   Without paid transaction data, lender data, and strong models, you'll be wrong and you'll lose trust.

8. **Full "permit/renovation" certainty at address level**
   Municipal permits are fragmented; doable later per-city, but too messy for MVP if you want nationwide.

9. **Listings replacement / Funda killer**
   Not with open data. Period.

---

## 2. Product goal

Help expats and first-time buyers **avoid bad purchases and choose the right neighborhood/home** by generating an **instant, evidence-backed address dossier** with **3D context** and **risk cards**.

## 3. Target users

* **Expats**: limited Dutch knowledge, high uncertainty, high regret risk.
* **First-time buyers**: overwhelmed by tradeoffs; need structure and confidence.

## 4. Core user journey (MVP)

1. User pastes **address** (or postcode + house number).
2. App generates:
   * **Building facts** (BAG)
   * **3D block view + sunlight & shadow analysis** (3DBAG + Three.js + SunCalc)
   * **Livability risk cards** (noise, air, climate stress, sunlight)
   * **Neighborhood snapshot** (CBS)
   * *If available:* **Energy label** (EP-Online) — Tier B
3. User explores **3D shadow timeline**: drags time slider to see how shadows fall on the property at different times of day and seasons.
4. User saves to a **Shortlist**, compares up to **3 homes**, exports a **PDF "Viewing Briefing"** with forge3d-rendered shadow snapshots.
5. At viewing: user opens "**Questions to ask**" checklist auto-generated from detected risks.

## 5. MVP feature set (must ship)

### F1 — Address resolution + building facts

* Input: postcode + house number (optionals: letter/toevoeging)
* Output: point geometry, building footprint, construction year (if present), building status, etc. (BAG)

### F2 — 3D neighborhood viewer + sunlight & shadow simulation

The 3D viewer uses a **dual-renderer architecture**: Three.js (WebGL) handles real-time interaction in the browser; forge3d (Rust/wgpu) handles server-side rendering for publication-quality static exports. Both renderers consume the same 3DBAG geometry and SunCalc sun positions — only the render backend differs.

* Render: surrounding buildings within 250m radius, 3DBAG LoD2.2
* Camera presets: street level, balcony level, top-down
* Overlay toggles: noise, air quality, climate layer (WMS tiles composited onto ground plane)
* Visual enhancements: PDOK orthophoto on roofs + ground, procedural period-appropriate facades (see [§9 — 3D Visualization Pipeline](#9-3d-visualization-pipeline))

**F2a — Interactive shadow timeline (Three.js, client-side)**

* Time-of-day slider: user drags to see how shadows move across the block throughout the day
* Date picker with presets: winter solstice (worst case), summer solstice (best case), spring/autumn equinox
* Sun position calculated from geographic coordinates + date/time (SunCalc algorithm — no external API needed)
* Single `THREE.DirectionalLight` positioned via SunCalc azimuth/altitude; `PCFSoftShadowMap` at 2048×2048 resolution
* `shadowMap.autoUpdate = false`; only trigger `needsUpdate = true` when sun position changes (avoids per-frame re-render of static geometry — 2× mobile performance gain)
* Shadow camera frustum covers 500m scene: `left/right/top/bottom = ±300`, `shadow.bias = -0.0005`, `shadow.normalBias = 0.02`
* Answers: *"Is this ground-floor apartment dark by 3pm?" "Does the balcony get afternoon sun?"*

**F2b — Static shadow snapshots (forge3d, server-side)**

* Pre-rendered shadow views for key moments: morning (9:00), noon (12:00), evening (17:00)
* Default date: December 21 (winter solstice — worst-case daylight)
* Rendered by forge3d's Rust/wgpu PBR pipeline with full ambient occlusion, sun shading, and supersampled output (render at 4000×4000, deliver at 2000×2000 for crisp PDF embedding)
* Three PNG images per address, generated on-demand and cached server-side (Redis, 7-day TTL)
* Used in the PDF "Viewing Briefing" export and as fallback for low-powered mobile devices that cannot run the Three.js viewer
* Same 3DBAG LoD2.2 geometry and SunCalc sun positions as F2a — visual parity between interactive and export views

**F2c — Annual sunlight analysis (forge3d, server-side)**

* Calculate estimated direct sunlight hours per day/year for the target address point
* Factor in surrounding building geometry to detect obstruction (canyon effect)
* forge3d performs GPU-accelerated raycast-based obstruction sampling: cast rays from target point toward sun positions at 15-minute intervals across all daylight hours for representative dates (solstices, equinoxes, and 2 intermediate dates per season = 8 sample dates)
* Output: sunlight score (e.g., "This balcony gets ~2.1 hours of direct sun in December, ~8.4 hours in June")
* Present as a risk card: low/med/high sunlight rating with seasonal breakdown
* Answers: *"Is this home livable in winter or will I need SAD lamps?"*

### F3 — Risk cards (the differentiator)

Each card shows:

* **Score/level** (low/med/high)
* **What it means** (plain EN/NL)
* **What to ask / check** at viewing
* **Source + date**

Cards in MVP:

* Road traffic noise (Lden) (RIVM/Atlas Leefomgeving WMS + ZIP)
* PM2.5 / NO2 (GCN) (RIVM WMS/WCS + ZIP)
* Climate stress (water nuisance / heat) (Klimaateffectatlas WMS/WFS)
* Sunlight exposure (computed from 3D geometry + SunCalc — see F2c)

### F4 — Neighborhood snapshot

* Pull CBS buurt/wijk stats for the location
* Present 5–8 indicators max (no dashboard spam)

### F5 — Shortlist + Compare + Export

* Shortlist items store the resolved address + cached indicators
* Compare 2–3 homes side by side
* Export PDF "Viewing Briefing" (1–2 pages) with forge3d-rendered shadow snapshots (F2b) embedded as high-resolution PNGs

### Tier B — optional features (ship if time allows)

#### F6 — Crime level card (Tier B)

* Sources: CBS OData 47018NED (yearly) and 47022NED (monthly)
* Present as crimes per 1,000 residents; sub-cards: burglary, violent crime
* Mandatory disclaimers about registered vs. total crime

#### F7 — Energy label lookup (Tier B)

* EP-Online API v5 (API key required); cache and rate-limit
* Useful for running costs and "upgrade reality" scenarios

#### F8 — Mapillary street-level panel (Tier B)

* Embed a MapillaryJS panorama viewer in a side panel, synced to the selected building via `get_image_looking_at()` API
* Zero texture complexity; immediate value for property buyers wanting to see the street without visiting
* Mapillary imagery is CC BY-SA 4.0 (attribution + ShareAlike required)
* The Netherlands has the highest Mapillary coverage density globally; Amsterdam alone has 800K+ professional panoramic images

## 6. Out of scope (explicit)

* Listings ingestion/scraping
* Automated valuation / fair-price estimates / bidding recommendations
* Permit certainty nationwide
* Foundation condition certainty (only subsidence/soil proxies later)
* User accounts or social features in MVP
* Photorealistic facade texturing from Mapillary/Cyclomedia imagery projection in MVP (Phase 2+ — see [§9](#9-3d-visualization-pipeline))

---

## 7. Success metrics

Define these before launch. Track outcomes, not outputs.

### Primary metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Dossier generation success rate | > 95% of valid NL addresses | % of address inputs that return a complete dossier (all must-ship cards populated) |
| Time to dossier | < 5 seconds | p95 latency from address submission to full dossier render (excluding 3D viewer) |
| PDF export completion | > 80% of shortlisted homes | % of shortlisted addresses where user generates a Viewing Briefing PDF |
| Return usage | > 30% within 14 days | % of users who generate a second dossier within 2 weeks |

### Guardrail metrics

| Metric | Threshold | Why it matters |
|--------|-----------|----------------|
| Data source error rate | < 5% of requests | If external APIs fail too often, dossier quality degrades |
| 3D viewer load time | < 6 seconds on 4G | Slow 3D kills mobile experience |
| forge3d snapshot render time | < 8 seconds for 3 snapshots | Blocks PDF export if too slow |
| Risk card accuracy complaints | < 1% of users report "this seems wrong" | Indicative data must still feel trustworthy |

### Per-feature acceptance signals

- **F1:** Address resolves to correct BAG object for 99%+ of valid postcode+huisnummer inputs
- **F2a:** Three.js viewer renders surrounding buildings within 250m with orthophoto roofs and procedural facades; shadow timeline responds to slider input with < 200ms latency
- **F2b:** forge3d produces 3 shadow snapshot PNGs at 2000×2000 in < 8 seconds total; visual parity with interactive viewer (same building geometry, same sun positions)
- **F3:** Each risk card displays score, explanation, viewing questions, and source. Thresholds match official Dutch guidelines where applicable
- **F4:** Neighborhood snapshot shows 5–8 CBS indicators with EN/NL labels
- **F5:** User can save 3 homes, compare side-by-side, and export a 1–2 page PDF with embedded shadow snapshots

---

## 8. Data sources & ingestion

### Overview matrix

| Need / Feature | Dataset | Coverage | Access type | Endpoint / File | Update | License / Notes |
|---|---|---:|---|---|---|---|
| Address → geometry + building objects | **BAG (Kadaster) OGC API** | NL | OGC API Features | Base: `https://api.pdok.nl/kadaster/bag/ogc/v2` ([api.pdok.nl][1]) | Continuous | Public service; cache aggressively |
| 3D buildings around address | **3DBAG** | NL | 3D API + downloads | Base: `https://api.3dbag.nl/` ([docs.3dbag.nl][2]) | Periodic releases | Open data; LoD1.2/1.3/2.2; CityJSON + 3D Tiles |
| 3D tiles alternative / basemap 3D | **Kadaster 3D Basisvoorziening** | NL | OGC API + 3D Tiles | OGC API + 3D Tiles ([Kadaster][7]) | Periodic | Scalable web rendering; compressed GLB |
| Roof + ground orthophoto | **PDOK Luchtfoto RGB** | NL | WMTS / WMS | WMS: `https://service.pdok.nl/hwh/luchtfotorgb/wms/v1_0` | Annual | CC BY 4.0; 25cm summer (`Actueel_ortho25`), 8cm winter (`Actueel_orthoHR`) |
| Sunlight & shadow simulation | **SunCalc algorithm + 3D geometry** | NL | Computed | Client-side (Three.js) for F2a; server-side (forge3d) for F2b/F2c | Real-time | Public domain algorithm |
| Neighborhood polygons + stats | **CBS Wijken & Buurten 2024 OGC API** | NL | OGC API Features | Base: `https://api.pdok.nl/cbs/wijken-en-buurten-2024/ogc/v1` ([api.pdok.nl][8]) | Annual | Official CBS via PDOK |
| Road traffic noise (Lden) | **RIVM / Atlas Leefomgeving noise** | NL | WMS + ZIP | WMS: `https://data.rivm.nl/geo/alo/wms?request=GetCapabilities` + ZIPs on data.overheid ([data.overheid.nl][3]) | Periodic | Indicative; show disclaimer |
| Air quality PM2.5 / NO2 | **RIVM GCN** | NL | WMS/WCS + ZIP | WMS: `https://data.rivm.nl/geo/gcn/wms?request=GetCapabilities` WCS: `…/wcs?request=GetCapabilities` ([data.overheid.nl][9]) | Annual + scenarios | Public domain |
| Climate stress layers | **Klimaateffectatlas** | NL | WMS/WFS (GeoServer) | WMS/WFS: `https://maps1.klimaatatlas.net/geoserver/ows` ([klimaateffectatlas.nl][4]) | Periodic | CC BY 4.0 attribution required |
| Energy label lookup | **EP-Online Public API v5** | NL | REST (API key) + bulk | `https://public.ep-online.nl/api/v5/PandEnergielabel/Adres` ([RVO.nl][6]) | Daily mut., monthly full | Needs API key; cache + rate-limit |
| Crime statistics | **CBS OData** | NL | OData API | `https://dataderden.cbs.nl/ODataApi/OData/47018NED` ([data.overheid.nl][13]) | Annual (yearly table), monthly | Official CBS; privacy suppression applies |
| Street-level imagery (Tier B) | **Mapillary** | NL (dense) | REST API v4 | `https://graph.mapillary.com/` | Continuous | CC BY-SA 4.0; requires Meta developer token |

### Integration details per source

#### A) BAG — address + building backbone

* **Base**: `https://api.pdok.nl/kadaster/bag/ogc/v2` ([api.pdok.nl][1])
* Key calls:
  * `GET /collections` (discover collection IDs)
  * `GET /collections/{collectionId}/items?bbox=…` (fetch surrounding objects)
  * `GET /collections/{collectionId}/items/{id}` (single object fetch)
* Response includes `oorspronkelijkbouwjaar` (construction year) and `gebruiksdoel` (building function) — both required for procedural facade generation (see [§9](#9-3d-visualization-pipeline))

#### B) 3D buildings

Recommended for MVP: 3DBAG API for geometry + attributes. Kadaster 3D Basisvoorziening as scale-friendly fallback.

**Path B1 (recommended): 3DBAG API**

* **Base**: `https://api.3dbag.nl/` ([docs.3dbag.nl][2])
* API docs at `/api.html` — use bbox query endpoints to fetch CityJSON geometry around an address
* **Use LoD2.2** (not LoD1.3): actual roof slopes are essential for orthophoto draping and shadow accuracy. Polygon difference is negligible (~15K vs ~5K triangles for 250m radius — both trivial for any modern GPU)
* CityJSON response includes semantic surface labels (`RoofSurface`, `WallSurface`, `GroundSurface`) — required for separate material assignment
* Key attributes consumed by the visualization pipeline: `b3_bouwlagen` (floor count), `b3_dak_type` (roof type), `b3_opp_buitenmuur` (exterior wall area), `b3_kas_warenhuis` (greenhouse flag)
* Vertices in EPSG:28992 (RD New) — coordinate transform to Three.js scene space required

**Path B2 (scale-friendly fallback): Kadaster 3D Basisvoorziening**

* **3D Tiles** (compressed GLB with `EXT_meshopt_compression`) for rendering + OGC API for selection where needed ([Kadaster][7])
* Can be consumed via NASA AMMOS `3DTilesRendererJS` in Three.js with custom material callbacks

#### C) PDOK Luchtfoto RGB — roof + ground texturing

* **WMS endpoint**: `https://service.pdok.nl/hwh/luchtfotorgb/wms/v1_0`
* **Layers**: `Actueel_ortho25` (25cm summer, smaller download), `Actueel_orthoHR` (8cm winter, sharper roofs, leafless trees)
* **Request pattern**: For 500m × 500m bbox in EPSG:28992, request 2048×2048 JPEG — typically 200–500 KB
* **License**: CC BY 4.0, no auth needed, CORS-enabled
* Used for: roof surface texturing (UV-projected from ortho coordinates) and ground plane base layer (see [§9](#9-3d-visualization-pipeline))
* For the target building close-up: fetch 8cm ortho at 4096×4096 for a smaller crop — reveals chimneys, solar panels, roof condition

#### D) Noise — road traffic Lden

* **WMS**: `https://data.rivm.nl/geo/alo/wms?request=GetCapabilities` ([data.overheid.nl][3])
* Optional offline ingestion: ZIP from data.overheid listing (2020/2022) ([data.overheid.nl][3])

#### E) Air quality — GCN (PM2.5, NO2)

* **WMS**: `https://data.rivm.nl/geo/gcn/wms?request=GetCapabilities` ([data.overheid.nl][9])
* **WCS**: `https://data.rivm.nl/geo/gcn/wcs?request=GetCapabilities` ([data.overheid.nl][9])
* **ZIP** per year/substance from RIVM download page ([RIVM][10])

#### F) Climate stress

* **WMS**: `https://maps1.klimaatatlas.net/geoserver/ows?request=GetCapabilities&service=WMS&version=1.3.0` ([maps1.klimaatatlas.net][11])
* **WFS**: `https://maps1.klimaatatlas.net/geoserver/ows?request=GetCapabilities&service=WFS&version=2.0.0` ([maps1.klimaatatlas.net][12])
* Limit to top 10 buyer-relevant layers only.

#### G) Neighborhood stats

* **Base**: `https://api.pdok.nl/cbs/wijken-en-buurten-2024/ogc/v1` ([api.pdok.nl][8])
* Key calls:
  * `GET /collections/buurten/items?bbox=…` then point-in-polygon in server, or
  * `GET /collections/buurten/items/{id}` for cached lookups

#### H) Energy label (Tier B)

* **Energy label by address**: `https://public.ep-online.nl/api/v5/PandEnergielabel/Adres?postcode=…&huisnummer=…` ([RVO.nl][6])
* **Bulk file discovery**: `https://public.ep-online.nl/api/v5/Mutatiebestand/DownloadInfo` ([RVO.nl][6])
* Requires API key; cache and rate-limit.

#### I) Crime statistics (Tier B)

* **User value**: Expats and first-time buyers routinely ask "is this area safe?" The app provides a consistent, sourced, comparable view per address.
* **Yearly data**: `https://dataderden.cbs.nl/ODataApi/OData/47018NED` (table 47018NED) ([data.overheid.nl][13])
* **Monthly data**: `https://dataderden.cbs.nl/ODataApi/OData/47022NED` (table 47022NED)
* **Nuisance — optional later**: `https://dataderden.cbs.nl/ODataApi/OData/47024NED` (table 47024NED)

**Presentation rules:**

* Show a single "Crime level (last 12 months)" card
* Primary indicator: total registered crimes per 1,000 residents (computed using CBS `aantal_inwoners` from F4 neighborhood snapshot)
* Two sub-cards only: burglary/break-ins (property-relevant), violent crime (perceived safety)
* Optional later: nuisance incidents — only if data is reliable and does not overwhelm

**Mandatory disclaimers:**

* "Registered crimes ≠ total crime; reporting and registration vary."
* "Use as screening context, not a prediction."
* "Small-area data may be suppressed for privacy for some categories."

#### J) Mapillary street-level imagery (Tier B)

* **API**: Mapillary Graph API v4 (`https://graph.mapillary.com/`)
* **Authentication**: Meta developer token (free)
* **Key endpoints**: Image search by bbox + compass angle, `get_image_looking_at(lat, lon)` for syncing to a building
* **License**: CC BY-SA 4.0 — commercially usable, but ShareAlike requirement applies to derivative textures
* **Coverage**: Netherlands has highest global density. Amsterdam uploaded 800K+ professional panoramic images (Trimble MX7)
* **MVP use**: Embed MapillaryJS viewer in side panel, synced to selected building. No texture projection in MVP.

---

## 9. 3D visualization pipeline

This section specifies how 3DBAG buildings are rendered visually in both the Three.js interactive viewer and the forge3d export pipeline. No existing open-source viewer renders 3DBAG with realistic textures — every current project (3DBAG viewer, Netherlands3D, ninja-viewer) uses flat semantic colors. This visual layer is novel for the Dutch 3D building ecosystem.

### 9.1 Design principle: same data, two renderers

Both renderers consume identical inputs to ensure visual parity between interactive exploration (Three.js) and PDF exports (forge3d):

| Input | Source | Format |
|-------|--------|--------|
| Building geometry | 3DBAG API (LoD2.2) | CityJSON → indexed triangles |
| Semantic surface labels | 3DBAG CityJSON | `RoofSurface`, `WallSurface`, `GroundSurface` per face |
| Construction year | BAG `oorspronkelijkbouwjaar` | Integer year |
| Building function | BAG `gebruiksdoel` | Enum: `woonfunctie`, `winkelfunctie`, `kantoorfunctie`, etc. |
| Floor count | 3DBAG `b3_bouwlagen` | Integer (1–5+) |
| Roof type | 3DBAG `b3_dak_type` | `horizontal`, `slanted`, `multiple` |
| Roof + ground texture | PDOK Luchtfoto RGB WMS | 2048×2048 JPEG per 500m bbox |
| Sun position | SunCalc(lat, lon, date, time) | Azimuth + altitude in radians |

**Coordinate pipeline:** 3DBAG vertices arrive in EPSG:28992 (RD New, meters). For Three.js, translate all vertices by subtracting the scene center point so the target building sits at origin. The same transform applies to the forge3d pipeline. No reprojection needed — RD New meters map directly to Three.js/wgpu scene units.

### 9.2 Building geometry: CityJSON → render-ready mesh

**Parsing (Three.js):** Use `cityjson-threejs-loader` (Apache-2.0, TU Delft) for CityJSON → Three.js `BufferGeometry` conversion with earcut triangulation and Web Worker support. Replace its default `CityObjectsMaterial` with the custom material pipeline below.

**Semantic surface separation:** During parsing, split each building into three geometry groups by CityJSON semantic surface type:
- `RoofSurface` → receives orthophoto UV texture
- `WallSurface` → receives procedural facade shader
- `GroundSurface` → hidden (replaced by ground plane)

**Parsing (forge3d):** Server-side Python parses CityJSON directly (the `cjio` library or custom parser), converts to indexed triangle buffers, and passes to the Rust/wgpu renderer via PyO3.

### 9.3 Roof texturing: PDOK orthophoto UV projection

The highest-impact visual upgrade. Orthophotos are nadir (straight-down) imagery; roofs face roughly upward — a simple planar UV projection.

**UV generation:** For each `RoofSurface` vertex, compute:
```
u = (rdX - bboxMinX) / bboxWidth
v = (rdY - bboxMinY) / bboxHeight    // may need Y-flip depending on image origin
```

**Three.js material:**
```javascript
new THREE.MeshStandardMaterial({
  map: orthoTexture,      // 2048×2048 PDOK JPEG
  roughness: 0.8,
  metalness: 0.0
})
```

**Target building enhancement:** For the specific address building, fetch the 8cm ortho at 4096×4096 for a tighter crop. Reveals chimneys, solar panels, and roof stains — publication-quality close-up.

**forge3d equivalent:** Same UV generation logic in Python/Rust. The PDOK JPEG is loaded as a wgpu texture and bound to the roof surface group with equivalent PBR parameters.

**Performance:** One 2048×2048 JPEG = 200–500 KB transfer, 16 MB GPU texture memory. Negligible impact.

### 9.4 Facade texturing: procedural shaders from BAG attributes

Procedural generation avoids external texture downloads in the critical path. The key attributes map to Dutch architectural periods:

| Construction year | Period | Visual signature |
|---|---|---|
| Pre-1900 | Traditional | Red/brown brick, ornate gables, tall narrow windows |
| 1900–1940 | Amsterdam School | Warm orange-red brick, expressive patterns, rounded details |
| 1945–1970 | Post-war reconstruction | Simple concrete or yellow brick, horizontal window bands, utilitarian |
| 1970–1990 | Prefab/Blokken | Concrete panels, monotone beige/brown, regular grid windows |
| 1990+ | Contemporary | Mixed materials, more glass, varied forms |

**Three.js implementation:** Use `MeshStandardMaterial` with `onBeforeCompile` to inject custom GLSL for brick patterns and window grids. This preserves the full Three.js lighting and shadow pipeline. Replace the `#include <map_fragment>` chunk and write to `diffuseColor`. The shader receives `b3_bouwlagen` as a uniform to generate correct floor divisions and window rows.

**Wall UV generation:** Project each wall polygon onto its own 2D plane using the wall normal vector. Compute tangent/bitangent from cross product of wall normal and world-up, then dot vertex offsets against these axes. Resulting UVs are in meters — `THREE.RepeatWrapping` tiles brick textures at physical dimensions automatically.

**Building function modifies ground floor:** `winkelfunctie` gets a glazed storefront, `kantoorfunctie` gets more glass, `woonfunctie` gets a residential door.

**Texture atlas (progressive enhancement):** After initial render with solid period-appropriate colors, load a 1024×1024 CC0 brick texture atlas (4–6 variants from ambientCG, ~100–200 KB as JPEG) for PBR detail. Applied via `THREE.RepeatWrapping` at physical brick dimensions.

**forge3d implementation:** Equivalent procedural logic in WGSL shaders. The Rust backend has full PBR support — pass construction year, floor count, and function as per-building uniforms.

### 9.5 Surrounding buildings: vertex coloring for performance

For the ~300 surrounding buildings (not the target property), use per-face vertex coloring from orthophoto sampling instead of full UV-mapped textures. This provides 80% of the visual improvement with 20% of the complexity.

**Technique:** Load PDOK orthophoto into an offscreen canvas, sample RGB at each roof face centroid's RD coordinates, assign the color to all three vertices via Three.js `color` BufferAttribute with `vertexColors: true`.

**Advantages:** Eliminates texture management entirely — no UV generation, no texture binding. Colors live in the vertex buffer, enabling geometry merging across all surrounding buildings into a **single draw call**. At neighborhood-overview zoom levels, the difference from UV-mapped textures is subtle.

**Wall colors for surrounding buildings:** Assign solid period-appropriate colors based on construction year (no procedural shader needed for non-target buildings). Red-brown for pre-1940, yellow-grey for post-war, beige for prefab era, white/grey for contemporary.

### 9.6 Ground plane: orthophoto + shadow receiving

A `PlaneGeometry` spanning the 500m × 500m scene bbox with the same PDOK orthophoto used for roofs. Shows actual roads, gardens, parking lots, and waterways.

```javascript
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(bboxWidth, bboxHeight),
  new THREE.MeshStandardMaterial({ map: orthoTexture, roughness: 0.9 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
```

Coordinate alignment is automatic — the PlaneGeometry spans the same RD bbox as the WMS request. Building shadows fall naturally onto the real aerial imagery.

**WMS overlay compositing:** For risk card layer toggles (noise, air quality, climate), fetch the relevant WMS tile for the same bbox and composite it onto the ground material using `THREE.ShaderMaterial` alpha blending or a second mesh slightly above the ground plane with transparency.

### 9.7 Progressive loading strategy

Maximizes perceived performance to meet the <6 second mobile target:

| Time | Action | Visual state |
|---|---|---|
| 0–1s | HTML/JS loads, init empty Three.js scene with ambient light | Loading spinner |
| 1–3s | Fetch CityJSON geometry + ground orthophoto tile in parallel | — |
| 3–4s | First render: semantic solid colors (roofs orange-red, walls light grey) | **Scene is usable** — user can orbit, shadows work |
| 4–5s | Apply orthophoto roof texture + enable shadow map | **Scene looks good** — real roof colors, real ground |
| 5–6s | Load facade texture atlas, apply procedural shaders to target building | **Scene looks polished** — period-appropriate facades |

### 9.8 Performance budget (250m radius scene)

| Resource | Estimate | Budget limit |
|----------|----------|-------------|
| Triangle count (~300 LoD2.2 buildings) | ~15,000 | 100,000+ (mobile 60fps) |
| Geometry transfer (gzipped CityJSON) | 500–800 KB | 10 MB (6s @ 13Mbps 4G) |
| Orthophoto texture (2048² JPEG) | 200–500 KB | — |
| Facade atlas (1024² JPEG) | 100–200 KB | — |
| JS bundle (Three.js tree-shaken) | 150–250 KB | — |
| **Total transfer** | **~1.5–2.5 MB** | **10 MB** |
| GPU texture memory | 3–24 MB | 128–256 MB (mobile) |
| Draw calls (merged geometry) | 3–8 | <20 (mobile target) |
| Shadow map | 2048×2048 (1 light) | — |

### 9.9 Shadow rendering configuration

**Three.js (F2a interactive):**
```javascript
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
sunLight.shadow.camera.left = sunLight.shadow.camera.bottom = -300;
sunLight.shadow.camera.right = sunLight.shadow.camera.top = 300;
sunLight.shadow.bias = -0.0005;
sunLight.shadow.normalBias = 0.02;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false; // Only re-render when sun moves
```

**Critical gotchas:**
- Avoid `side: THREE.DoubleSide` on building materials (causes shadow artifacts from back-face contribution — fix winding order instead)
- Use only **one shadow-casting DirectionalLight** (each additional shadow light re-renders the entire scene)
- For `VSMShadowMap`, set `shadow.radius = 2` and `shadow.blurSamples = 4` for soft penumbras

**forge3d (F2b/F2c):** Equivalent shadow configuration in the Rust/wgpu pipeline. forge3d's PBR pipeline already supports directional light shadow maps with ambient occlusion — producing higher visual quality than Three.js's `PCFSoftShadowMap` at the cost of server-side rendering time.

### 9.10 Phase 2+ visual enhancements (post-MVP)

These require additional engineering effort and are explicitly out of scope for MVP:

1. **Mapillary facade projection:** Use `three-projected-material` to project Mapillary street-level images onto the target building's wall surfaces. Requires image selection, lens undistortion, and facade segmentation. Estimated: 1–2 weeks.

2. **User-assisted facade rectification:** Add UI for users to click four facade corners in an embedded Mapillary panorama, then use homography to rectify just the facade region and apply as UV-mapped texture. Estimated: 2–4 weeks.

3. **BGT vector ground plane:** Replace orthophoto ground with semantically colored BGT polygons (dark grey roads, blue water, green grass) via `https://api.pdok.nl/lv/bgt/ogc/v1`. Cleaner for analytical views but requires GeoJSON triangulation and multiple materials.

4. **WebGPU migration:** When browser WebGPU support matures (Chrome/Edge have it; Safari/Firefox behind), compile forge3d to WASM for in-browser rendering. A Rust/WebGPU renderer will outperform any JavaScript/WebGL solution on identical hardware. This would unify the dual-renderer into a single codebase.

---

## 10. MVP architecture

### Backend

* **Framework**: FastAPI (Python) + PostGIS
* **forge3d render service**: Python process with PyO3 bindings to the Rust/wgpu renderer. Runs on GPU-equipped server instances. Accepts render requests (CityJSON geometry + sun position + camera params) and returns PNG buffers.
* **Caching**: Redis for API response caching and forge3d render output.
  - BAG results cached 24h
  - WMS/WCS raster samples cached 7 days
  - CBS stats cached until next annual release
  - forge3d shadow snapshots cached 7 days per address (keyed by address + geometry version)
  - PDOK orthophoto tiles cached 30 days (imagery updates annually)
* **Error handling**: Graceful degradation — if a data source is unavailable, the dossier still renders with that card showing "Data temporarily unavailable." Never block the entire dossier for one failed source. If forge3d render fails, fall back to Three.js client-side snapshot capture via `renderer.domElement.toDataURL()`.

### Data ingestion

* **Scheduled jobs**: Noise raster ZIPs, air quality ZIPs, CBS annual stats — ingested on release, stored in PostGIS
* **On-demand**: WMS/WCS sampling for climate stress layers, with response caching
* **Real-time**: BAG address lookups, EP-Online energy labels — proxied with caching

### API serving

* **Vector data**: Custom JSON REST API (FastAPI)
* **Raster data**: Pre-sampled values stored per-address, or on-the-fly WMS proxy with caching
* **3D geometry**: API endpoint that fetches 3DBAG CityJSON for a bbox, enriches with BAG attributes (construction year, function), and returns a combined payload. Optionally pre-converts to GLB with meshopt compression for faster Three.js loading.
* **Render endpoint**: `POST /api/render/shadow-snapshots` accepts `{address, dates[], times[], camera_preset}` and returns forge3d-rendered PNGs (or cache-hit URLs)

### Client

* **Platform**: Web-first (mobile responsive). React + TypeScript.
* **Mobile**: React Native wrapper — post-MVP
* **3D rendering**: Three.js (WebGL) for the interactive neighborhood viewer (F2a)
  - `cityjson-threejs-loader` for CityJSON parsing + earcut triangulation
  - `MeshStandardMaterial` with `onBeforeCompile` for procedural facades
  - `THREE.DirectionalLight` with `PCFSoftShadowMap` for shadow simulation
  - SunCalc library for sun position calculation
* **Shadow simulation**: Directional light positioned via SunCalc algorithm. Shadow maps with `autoUpdate = false` for interactive timeline (F2a). forge3d server-side PBR render for static snapshots (F2b). forge3d GPU-accelerated raycasting for annual analysis (F2c).
* **Internationalization**: EN/NL from day one. All user-facing strings in i18n files.

### Dual-renderer data flow

```
                    ┌──────────────────────────┐
                    │     FastAPI Backend       │
                    │                          │
  User enters  ──►  │  1. BAG address lookup    │
  address           │  2. 3DBAG bbox query      │
                    │  3. Enrich with BAG attrs │
                    │  4. PDOK ortho tile fetch  │
                    │  5. Risk card data fetch   │
                    │                          │
                    │  ┌──────────────────────┐ │
                    │  │  forge3d (Rust/wgpu)  │ │
                    │  │  • F2b snapshots      │ │
                    │  │  • F2c sunlight calc  │ │
                    │  │  • PDF shadow PNGs    │ │
                    │  └──────────────────────┘ │
                    └───────────┬──────────────┘
                                │
                    JSON + ortho tile + render URLs
                                │
                    ┌───────────▼──────────────┐
                    │   React + Three.js        │
                    │                          │
                    │  • F2a interactive viewer  │
                    │  • Shadow timeline slider  │
                    │  • Risk overlay toggles    │
                    │  • Shortlist + compare     │
                    └──────────────────────────┘
```

---

## 11. Performance & quality requirements

| Requirement | Target | Notes |
|-------------|--------|-------|
| Address resolution | < 1 second | BAG API response + geocoding |
| Dossier generation (all cards) | < 5 seconds | Excluding 3D viewer initial load |
| 3D viewer initial render (usable) | < 4 seconds on 4G | Semantic solid colors, shadows work |
| 3D viewer full render (polished) | < 6 seconds on 4G | Orthophoto roofs + procedural facades |
| Scene transfer size | < 2.5 MB | CityJSON + ortho + facade atlas + JS bundle |
| Shadow timeline interaction | < 200ms per slider step | Client-side DirectionalLight update + shadow map re-render |
| Draw calls | < 8 | Merged surrounding buildings, target building separate |
| forge3d snapshot render | < 8 seconds for 3 PNGs | Server-side, 4000×4000 supersampled → 2000×2000 output |
| forge3d sunlight analysis | < 15 seconds | 8 sample dates × full day raycasting |
| PDF export | < 12 seconds | Including forge3d snapshot generation (or cache hit) |
| Concurrent users | 100 simultaneous dossier requests | MVP target; scale forge3d workers later |
| Uptime | 99% (excl. scheduled maintenance) | External API failures handled via graceful degradation |

---

## 12. Privacy & legal

* **No personal data collected in MVP.** The app processes addresses (public data) and generates dossiers. No user accounts, no tracking, no cookies beyond session.
* **GDPR:** No PII stored server-side in MVP. If user accounts are added later, full GDPR compliance (consent, right to deletion, DPO) is required.
* **Data attribution:** Required attributions displayed in the dossier footer and PDF export:
  - Klimaateffectatlas: CC BY 4.0 attribution required
  - PDOK Luchtfoto: CC BY 4.0 attribution required
  - Mapillary (if Tier B shipped): CC BY-SA 4.0 — attribution + ShareAlike
  - CBS, BAG, RIVM: public services, attribution as good practice
* **Disclaimers:** All environmental, noise, air quality, and crime data is presented as indicative. The app does not provide professional advice. Disclaimer text shown on every dossier and PDF.
* **API terms of service:** BAG/PDOK, RIVM, CBS, and Klimaateffectatlas are public services. Respect rate limits, cache aggressively, and do not scrape. EP-Online requires an API key with separate terms. Mapillary requires Meta developer token with separate terms.
* **Street-level imagery privacy:** Mapillary images are auto-blurred for faces and license plates by Meta's pipeline. No additional processing needed for privacy compliance.

---

## 13. Risks & mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| External API downtime (BAG, RIVM, CBS) | Medium | High — dossier incomplete | Graceful degradation per card. Cache responses. Show "data unavailable" not an error screen. |
| Rate limiting by PDOK/RIVM | Medium | Medium — slow responses | Aggressive caching (Redis). Batch requests where possible. Pre-ingest static datasets. |
| 3D geometry missing for address | Low | Medium — no 3D view | Fall back to 2D map view with building footprint from BAG. |
| Inaccurate risk thresholds | Medium | High — user trust | Use official Dutch guidelines for threshold values (e.g., WHO for air quality, EU Lden limits for noise). Document sources. |
| Data staleness | Low | Medium | Display data date on every card. Scheduled ingestion jobs refresh on source release cycles. |
| Mobile performance for Three.js viewer | Medium | Medium — poor UX on phones | Progressive loading (§9.7). Static forge3d snapshots as fallback. LoD1.3 geometry fallback if device is underpowered. Vertex colors instead of textured materials for surrounding buildings. |
| forge3d server GPU availability | Medium | Medium — blocks PDF export | Fall back to Three.js client-side `toDataURL()` capture. Use spot/preemptible GPU instances with queue. Cache renders aggressively (7-day TTL). |
| forge3d render parity with Three.js | Low | Low — visual inconsistency | Both consume identical geometry + sun positions. Accept minor lighting differences (PBR vs MeshStandardMaterial) as a quality improvement, not a bug. |
| PDOK orthophoto CORS or availability | Low | Low — no roof textures | Fall back to solid semantic roof colors. Scene remains fully functional. |
| EP-Online API key revocation | Low | Low — Tier B feature | Energy label is optional in MVP. Degrade gracefully. |
| WebGPU browser support fragmentation | N/A | N/A | Not relevant for MVP (forge3d is server-side only). Monitor for Phase 2 WASM migration. |
| Mapillary coverage gaps | Low | Low — Tier B feature | Display "No street view available" for buildings without nearby Mapillary imagery. |
| Google 3D Tiles API blocked for EU | N/A | N/A | Not a dependency. Google stopped serving Photorealistic 3D Tiles to EU/EEA billing addresses (July 2025, DMA compliance). buurt-check uses open 3DBAG data exclusively. |

---

## 14. Why this can win

You win if the product feels like:

> "I paste an address and instantly know what could ruin my life there — and what to verify at the viewing."

That's *not* what Funda is built to do.

The dual-renderer architecture is a genuine competitive advantage: Three.js delivers instant, responsive exploration in the browser — no one else in the Dutch property market offers interactive shadow simulation. forge3d delivers publication-quality PDF exports with PBR lighting and supersampled resolution — this is the "Viewing Briefing" that buyers print, share with their mortgage advisor, and carry to the open house. No existing Dutch property tool produces anything close to this level of 3D intelligence.

---

[1]: https://api.pdok.nl/kadaster/bag/ogc/v2 "Basisregistratie Adressen en Gebouwen (OGC API)"
[2]: https://docs.3dbag.nl/en/delivery/webservices/ "Webservices - 3DBAG"
[3]: https://data.overheid.nl/dataset/5589-geluid-in-nederland-van-wegverkeer--lden- "Geluid van wegverkeer (Lden) | Data overheid"
[4]: https://www.klimaateffectatlas.nl/nl/faq "FAQ"
[5]: https://www.pdok.nl/ogc-apis/-/article/cbs-wijken-en-buurten "CBS Wijken en Buurten - (OGC) API's"
[6]: https://www.rvo.nl/sites/default/files/2025-02/handleiding-ep-online-opvragen-van-bestanden.pdf "Handleiding EP-online.nl Opvragen van bestanden (handmatig en automatisch)  versie 1.0 2025"
[7]: https://www.kadaster.nl/zakelijk/producten/geo-informatie/3d-producten/3d-basisvoorziening "3D Basisvoorziening | download kosteloos"
[8]: https://api.pdok.nl/cbs/wijken-en-buurten-2024/ogc/v1 "CBS Wijken en Buurten 2024 (OGC API)"
[9]: https://data.overheid.nl/dataset/65786-fijnstof--pm2-5--grootschalige-concentratiekaarten-nederland--inspire-as-is-dataset- "Fijnstof (PM2.5) Grootschalige concentratiekaarten Nederland (INSPIRE as-is Dataset) | Data overheid"
[10]: https://www.rivm.nl/gcn-gdn-kaarten/concentratiekaarten/downloaden "GCN concentratiekaarten downloaden | RIVM"
[11]: https://maps1.klimaatatlas.net/geoserver/ows?request=GetCapabilities&service=wms&version=1.3.0 "Klimaateffectatlas WMS"
[12]: https://maps1.klimaatatlas.net/geoserver/ows?request=GetCapabilities&service=WFS&version=2.0.0 "Klimaateffectatlas WFS"
[13]: https://data.overheid.nl/en/dataset/5252-geregistreerde-misdrijven--soort-misdrijf--wijk--buurt--jaarcijfers "Geregistreerde misdrijven per wijk/buurt | Data overheid"
