# Geospatial API Rules

All external API base URLs live in `backend/app/config.py` (pydantic-settings, `BUURT_` prefix).

## Coordinate Systems

- **EPSG:28992** (RD New, meters): BAG, RIVM, Klimaateffectatlas, Leefbaarometer, BRO, WMS tiles
- **EPSG:7415** (RD New + NAP height): 3DBAG vertex data
- **EPSG:4326** (WGS84): CBS OGC API, Leaflet frontend display
- Rule: backend works in EPSG:28992 internally. Frontend converts for map display.

## API Quick Reference

| API | Protocol | CRS | Timeout | Cache TTL |
|-----|----------|-----|---------|-----------|
| BAG WFS | WFS 2.0 OGC XML Filter | 28992 | 15s | 24h |
| RIVM noise (ALO) | WMS 1.3 GetFeatureInfo | 28992 | 15s | 7d (risk) |
| RIVM air (GCN) | WMS 1.3 GetFeatureInfo | 28992 | 15s | 7d (risk) |
| Klimaateffectatlas | WMS + WFS 2.0 | 28992 | 15s | 7d (risk) |
| 3DBAG | OGC API Features (CityJSON) | 7415 | 20s/page | 24h |
| CBS Wijken | OGC API Features | 4326 | 15s | 30d |
| Leefbaarometer | WFS 2.0 CQL_FILTER | 28992 | 5s | 30d |
| BRO soil | WFS 2.0 | 28992 | 10s | 30d |
| EP-Online | REST v5 | — | 15s | 7d |
| CBS Crime | OData v4 | — | 15s | 7d |

## WMS Point Sampling Pattern (noise, air, climate raster)

50m bbox, 101x101 pixel grid, query center pixel (50,50):
```
bbox={rd_x-25},{rd_y-25},{rd_x+25},{rd_y+25}&width=101&height=101&i=50&j=50
```
Always check `Content-Type: application/json` — WMS returns XML error on HTTP 200.

## WFS Point Query Pattern (climate vector, BRO)

Tight +/-5m bbox, fetch up to 5 features, select closest by centroid distance:
```
bbox={rd_x-5},{rd_y-5},{rd_x+5},{rd_y+5},EPSG:28992&count=5
```
WFS does NOT guarantee proximity ordering. Never trust first feature = closest.

## Sentinel Values (no-data)

| Source | Sentinels | Guard |
|--------|-----------|-------|
| RIVM noise | `-9990`, `>= 1e30` | `-9990 < raw < 1e30` |
| RIVM air | `-999`, `>= 1e30` | `0 <= raw < 1e30` (concentrations are non-negative) |
| Climate raster | `-999`, `-9999`, `>= 1e30` | same as noise |
| CBS indicators | `<= -99990` | explicit sentinel check |

## Critical Gotchas

### BAG WFS
- **CQL_FILTER is silently ignored.** Use OGC XML Filter: `Filter=<Filter><PropertyIsEqualTo>...`
- BAG IDs: exactly 16 digits. Validate `^[0-9]{16}$` at service AND route layer.

### 3DBAG
- IDs are prefixed: `NL.IMBAG.Pand.{16digits}` — backend strips/adds prefix
- Single-item: `metadata.transform` at ROOT level, NOT inside `feature`
- Vertex decode: `real_coord = vertex * scale + translate`
- Bbox queries: 12-17s server-side processing. Always separate target fetch (~2s) from bbox.
- LoD 2.2 geometry in `BuildingPart` children, NOT parent `Building`

### Leefbaarometer
- CQL_FILTER: `INTERSECTS(geom,POINT({rd_x} {rd_y}))` — **NO space after comma**
- Scale is 1-9 (NOT 1-10). Normalize: `(raw - 1) / 8 * 100`
- 5 dimensions: `kfys`/`konv`/`ksoc`/`kvrz`/`kwon`. Overall: `kscore` (NOT `lbm`)

### Klimaateffectatlas
- Subsidence/flood layers are **regional, not national**. Some addresses return no data.
- Climate risk = `max()` across ALL available layers (not first-hit break)

### BRO Soil WFS
- **Endpoints return 404** (verified Feb 2026). Fallback: municipality heuristic + construction year.

### Bodemloket WMS
- **GetFeatureInfo is non-functional** — returns empty XML for all queries. Only GetMap works.
- Use direct link to bodemloket.nl instead of API integration.

### EP-Online
- Response inconsistent (list vs dict). Try multiple key names. Optional `X-Api-Key` header.

### CBS Crime (OData)
- Normalize to per-1,000 residents. Population can be suppressed → `CRIME_NO_POPULATION`.

## Timeout Chain

Frontend abort (25s) > backend budget (20s) > per-call (15-20s) > connect (3-4s). Cascade all layers on change.

## Cache Key Rules

- Round coords: `{rd_x:.0f}:{rd_y:.0f}`. Include ALL params affecting response.
- Normalize text: `.strip().casefold()` in logic AND cache key.
- **Never cache empty/error.** Feature flag toggles require cache invalidation.

## httpx Client

`LoopAwareClient` from `http_client.py` — auto-recreates on event loop change.
Mock: `AsyncMock` for client, `MagicMock` for response (`.json()` is sync).
