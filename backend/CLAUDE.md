# Backend — FastAPI + httpx + Pydantic + Redis

## Stack
- Python 3.12, FastAPI, httpx (async HTTP client), Pydantic v2 + pydantic-settings
- Redis (async, with circuit breaker) for caching. NO database — all data from external APIs
- scipy (ConvexHull for LoD 2.2 roof geometry)
- fpdf2 (PDF generation for Quick Brief export)
- Test: pytest + pytest-asyncio
- Linting: ruff (check + format)
- NO SQLAlchemy, NO PostGIS, NO alembic — this is a stateless API proxy/aggregator

## Key commands
- Run server: `cd backend && uvicorn app.main:app --reload --port 8000`
- Run all tests: `cd backend && pytest -x -q -m "not live"`
- Run with live API tests: `cd backend && pytest -x -q`
- Run single test: `cd backend && pytest tests/test_bag.py::test_name -v`
- Lint: `cd backend && ruff check .`
- Format: `cd backend && ruff format .`

## Project structure
```
app/
  main.py              — FastAPI app, CORS, lifespan
  config.py            — Settings via pydantic-settings (BUURT_* env prefix)
  api/
    router.py          — FastAPI router aggregation
    address.py         — All address-related endpoints:
                          /suggest, /lookup, /{vbo_id}/building,
                          /{vbo_id}/building3d, /{vbo_id}/neighborhood3d,
                          /{vbo_id}/risks, /{vbo_id}/neighborhood,
                          /{vbo_id}/wms-tile, /{vbo_id}/viewing-questions,
                          /{vbo_id}/export
  services/
    locatieserver.py   — PDOK Locatieserver suggest + lookup
    bag.py             — BAG WFS for building facts (OGC XML Filter, NOT CQL_FILTER)
    three_d_bag.py     — 3DBAG OGC API for 3D geometry (CityJSON, dual-fetch + tiled)
    risk_cards.py      — RIVM WMS (noise, air) + Klimaateffectatlas WFS (climate)
    cbs.py             — CBS Wijken & Buurten OGC API for neighborhood stats
    wms_tile.py        — WMS tile proxy for 3D viewer overlays (CORS bypass)
    scoring.py         — Risk score normalization (0-100 scale) + severity classification
    viewing_questions.py — Bilingual viewing questions based on risk scores
    pdf_export.py      — Quick Brief PDF generation via fpdf2
    offline_store.py   — Offline data file handling (future use)
  models/
    address.py         — AddressSuggestion, ResolvedAddress
    building.py        — BuildingFacts, BuildingBlock (with optional roof_surfaces)
    neighborhood.py    — NeighborhoodStats, IndicatorGroup, AgeProfile
    neighborhood3d.py  — Neighborhood3DResponse, BuildingBlock3D
    risk.py            — NoiseRiskCard, AirQualityRiskCard, ClimateStressRiskCard,
                          SunlightRiskCard, RiskCardsResponse (with score/severity/summary)
  cache/
    redis.py           — Async Redis with circuit breaker (30s), socket_timeout=0.5s
tests/
  conftest.py          — Shared fixtures
  test_address_api.py  — API endpoint integration tests
  test_bag.py          — BAG WFS service tests
  test_locatieserver.py — Locatieserver service tests
  test_three_d_bag.py  — 3DBAG service tests (tiled fetch, LoD 2.2 parsing)
  test_risk_cards.py   — Risk card builder tests (noise, air, climate)
  test_scoring.py      — Score normalization boundary tests
  test_cbs.py          — CBS service tests
  test_wms_tile.py     — WMS tile proxy tests
  test_pdf_export.py   — PDF export service tests
  test_models.py       — Pydantic model serialization tests
  test_cache.py        — Redis circuit breaker tests
  test_risk_cards_live.py — Live API smoke tests (@pytest.mark.live)
  test_cbs_live.py     — Live CBS API smoke tests (@pytest.mark.live)
```

## API endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/address/suggest?q=...` | GET | Autocomplete via PDOK Locatieserver |
| `/api/address/lookup?id=...` | GET | Resolve BAG IDs + coordinates |
| `/api/address/{vbo_id}/building` | GET | Building facts from BAG WFS |
| `/api/address/{vbo_id}/building3d` | GET | Target building 3D geometry (~2s) |
| `/api/address/{vbo_id}/neighborhood3d?rd_x=&rd_y=` | GET | Surrounding buildings 3D (~12-17s) |
| `/api/address/{vbo_id}/risks?rd_x=&rd_y=&lat=&lng=` | GET | Risk cards (noise, air, climate) with scores |
| `/api/address/{vbo_id}/neighborhood?lat=&lng=&buurt_code=` | GET | CBS neighborhood stats |
| `/api/address/{vbo_id}/wms-tile?source=&rd_x=&rd_y=&radius=` | GET | WMS tile proxy (PNG bytes) |
| `/api/address/{vbo_id}/viewing-questions?rd_x=&rd_y=&lat=&lng=` | GET | Bilingual viewing questions |
| `/api/address/{vbo_id}/export?address=&template=&language=` | GET | PDF Quick Brief export |

## Conventions — follow these exactly

### External API integration
```python
# 1. Try Redis cache first (cache key = f"{service}:{deterministic_params}")
# 2. Call external API with httpx.AsyncClient, explicit timeout
# 3. On success: cache with TTL, return parsed result
# 4. On failure (timeout, HTTP error): log warning, return graceful degradation
# 5. NEVER cache empty/error responses — only cache real data
```

### Cache TTLs
- BAG building: 24h | Risk cards: 7d (conditional) | CBS stats: 30d
- 3D buildings: 24h | WMS tiles: 24h | Locatieserver: not cached

### Configuration
- All external API URLs in `config.py` as pydantic-settings fields
- Environment prefix: `BUURT_` (e.g., `BUURT_ENABLE_LOD22_ROOFS=true`)
- Feature flags: `enable_lod22_roofs` (default true), `enable_lod22_context_enrichment` (default false). `.env` requires `env_file = ".env"` in model_config
- Feature flag toggle requires cache invalidation for affected keys

### Coordinate system
- All spatial data in EPSG:28992 (RD New, meters). Frontend handles projection
- BAG IDs: always 16 digits, validate with `^[0-9]{16}$`
- 3DBAG IDs prefixed: `NL.IMBAG.Pand.{16-digit-id}`. Backend strips prefix

### Error handling
- External API failures: log + return graceful degradation (never crash the dossier)
- Warning codes: backend sends stable codes (`NOISE_NO_VALUE`, `AIR_PARTIAL`, etc.)
- Frontend maps codes to i18n keys

### Pydantic models
- All models in `models/`. Response models include `source` and `source_date` fields
- Risk cards: `score: int | None`, `severity: str | None`, `summary: str | None`
- Optional fields default to `None` for backward compatibility with cached responses

### Risk scoring (0-100 scale)
- `scoring.py` normalizes raw values to 0-100 scores
- Noise: 40dB=100, 53dB=74 (WHO onset), 63dB=50, 90dB=0
- Air: worst of PM2.5 and NO2 sub-scores
- Climate: categorical mapping (low=85, medium=50, high=15)
- Sunlight: 0h=0, 2h=40, 4h=80, 6h+=100 (winter solstice)
- Severity: 70-100=good, 40-69=moderate, 20-39=poor, 0-19=critical

### 3DBAG integration
- Tiled fetch strategy: split bbox into grid tiles for parallel fetching
- Direct target fetch by ID (~2s) + tiled surrounding fetch (~12-17s)
- CityJSON vertex transform: `real_coord = vertex * scale + translate`
- LoD 2.2 in BuildingPart children (NOT parent Building)
- Feature-flagged: `BUURT_ENABLE_LOD22_ROOFS`

### PDF export
- Library: fpdf2 (pure Python, no system dependencies). NOT WeasyPrint (needs cairo/pango)
- Built-in Helvetica font (latin-1 only). Must sanitize Unicode → latin-1 equivalents
- `_sanitize()` maps em dashes, smart quotes, bullets. Final fallback: `encode('latin-1', errors='replace')`
- Quick Brief: 1-page. Fetches risk cards (from cache) + viewing questions server-side
- Returns `application/pdf` with `Content-Disposition: attachment`
- Shadow image: optional base64 query param, decoded server-side to embed in PDF

### WMS/WFS query patterns
- WMS GetFeatureInfo (noise, air): 50m bbox, 101x101 grid, pixel (50,50)
- WFS GetFeature (climate): +/-5m bbox, count=5, select closest by centroid distance
- Sentinel values: noise `-9990 < raw < 1e30`, air `0 <= raw < 1e30`
- Content-type validation mandatory for WMS responses (XML error on 200 OK)

## Testing

- **Test count baseline: 275 non-live + live smoke tests** (updated 2026-02-11) — any change must maintain or increase
- `pytest -m "not live"` for CI (excludes live API tests)
- httpx mock pattern: `AsyncMock` for client, `MagicMock` for response (`.json()` is sync)
- Live tests: `@pytest.mark.live`, lenient assertions (check field exists, not exact values)
- Floating-point: `abs(result - expected) < 0.01` for aggregated percentages
- Ruff: line-length 100, rules E/F/I/W. Import sort order matters

## DO NOT
- Use SQLAlchemy, PostGIS, alembic, or any ORM. This is a stateless API aggregator
- Use `requests` library. Use `httpx` with async
- Use `CQL_FILTER` for BAG WFS queries (silently ignored). Use OGC XML Filter
- Put business logic in route handlers. Routes call services
- Return coordinates in WGS84. Everything is EPSG:28992
- Cache empty/error responses. Only cache real data
- Use `sampled_at` as `source_date` fallback. Let it be `None`
- Hardcode external URLs. All URLs in `config.py`
