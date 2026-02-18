# Backend — FastAPI + httpx + Pydantic + Redis

Python 3.12 stateless API aggregator. No database — all data from Dutch government APIs with Redis caching.

## Commands

```bash
uvicorn app.main:app --reload --port 8000   # Dev server
pytest -x -q -m "not live"                  # CI tests (432+ baseline)
pytest -x -q                                # Including live API smoke tests
ruff check . && ruff format .               # MUST pass before commit
```

## API endpoints (all under `/api/address/`)

| Endpoint | Description |
|----------|-------------|
| `GET /suggest?q=` | Autocomplete via PDOK Locatieserver |
| `GET /lookup?id=` | Resolve BAG IDs + coordinates |
| `GET /{vbo_id}/building` | Building facts from BAG WFS |
| `GET /{vbo_id}/building3d` | Target building 3D (~2s) |
| `GET /{vbo_id}/neighborhood3d?rd_x=&rd_y=` | Surrounding 3D (~12-17s) |
| `GET /{vbo_id}/risks?rd_x=&rd_y=&lat=&lng=` | Risk cards with 0-100 scores |
| `GET /{vbo_id}/neighborhood?lat=&lng=&buurt_code=` | CBS neighborhood stats |
| `GET /{vbo_id}/wms-tile?source=&rd_x=&rd_y=&radius=` | WMS tile proxy (PNG) |
| `GET /{vbo_id}/viewing-questions` | Bilingual viewing questions |
| `GET /{vbo_id}/risk-comparisons` | Urbanization-stratified baselines |
| `GET /{vbo_id}/tier-b?postcode=&huisnummer=` | Energy label + crime |
| `GET /{vbo_id}/property-warnings` | Foundation, erfpacht, VvE, asbestos |
| `GET /{vbo_id}/livability?rd_x=&rd_y=` | Leefbaarometer scores + trend |
| `POST /{vbo_id}/export` | PDF (quick_brief / full_dossier) |

## Conventions

- **Service pattern**: Cache check → external API call → parse → cache on success → return. Never cache empty/error
- **Cache TTLs**: BAG 24h, risks 7d (conditional), CBS/livability/warnings 30d, WMS tiles 24h, tier-B 7d
- **Config**: All URLs in `config.py` as pydantic-settings fields. Env prefix: `BUURT_`
- **Coordinates**: EPSG:28992 everywhere. BAG IDs: 16 digits (`^[0-9]{16}$`)
- **Error handling**: Log + return graceful degradation. Warning codes (`NOISE_NO_VALUE`, `AIR_PARTIAL`, etc.)
- **Models**: All in `models/`. Include `source` + `source_date`. Optional fields default to `None`
- **httpx mock in tests**: `AsyncMock` for client, `MagicMock` for response (`.json()` is sync)
- **Pydantic v2**: Use `Field(default_factory=list)` for list defaults, never bare `= []`
- **Feature flags**: `BUURT_ENABLE_LOD22_ROOFS` etc. Toggle requires cache invalidation
- **CBS crime normalization**: per-1,000 residents (`raw / population * 1000`). Population can be suppressed (`-99995`) → `CRIME_NO_POPULATION`

## Anti-patterns

- `CQL_FILTER` for BAG WFS → use OGC XML Filter (CQL is silently ignored)
- `requests` library → use `httpx` async
- Business logic in route handlers → routes call services
- WGS84 coordinates in responses → everything EPSG:28992
- `sampled_at` as `source_date` → let it be `None`
- Hardcoded URLs in services → all in `config.py`
- SQLAlchemy / PostGIS / any ORM → this is stateless, no DB

## Scoring reference (0-100)

- Noise: 40dB=100, 53dB=74 (WHO), 63dB=50, 90dB=0
- Air: worst of PM2.5 and NO2 sub-scores
- Climate: categorical (low=85, medium=50, high=15)
- Sunlight: 0h=0, 2h=40, 4h=80, 6h+=100 (winter solstice)
- Severity: 70-100=good, 40-69=moderate, 20-39=poor, 0-19=critical

## 3DBAG & 3D Viewer (added 2026-02-17)

- **3DBAG bbox fallback for target recovery:** When single-item endpoint returns 502, scan bbox results for target `pand_id`. Prevents total failure on intermittent 3DBAG outages
- **3DBAG building coverage:** Default bbox radius 150m (was 80m), max pages 4 (was 2). After `asyncio.gather`, must `await near_task` — race condition where backup query cancels primary
- **Single-flight request deduplication:** `_in_flight_requests: dict[str, asyncio.Future]` at module level for `get_neighborhood_3d`. Use `asyncio.shield()` for shared tasks. Key: `{pand_id}:{rd_x:.0f}:{rd_y:.0f}`. Clean up in `finally`. Prevents duplicate 3DBAG calls from React strict-mode remounts
- **Cache version v14** for neighborhood3d responses (bumped from v13 for coverage/dedup changes)
- **LoD 2.2 is mandatory for all buildings** (including neighbors). Sunlight shadow analysis requires accurate roof geometry — flat-extruded boxes produce incorrect shadow patterns. This is a product constraint, not a performance knob
- **3DBAG cold latency baselines (Feb 17):** Damrak 1 = 77s/167 buildings, Duinzicht 23 = 74s/220 buildings, Kerkstraat 10 = 62s/251 buildings. 90%+ of wait time is 3DBAG API latency, not frontend rendering
- **PDOK Luchtfoto RGB:** `service.pdok.nl/hwh/luchtfotorgb/wms/v1_0`, layer `Actueel_orthoHR`, JPEG format, CC BY 4.0 license
