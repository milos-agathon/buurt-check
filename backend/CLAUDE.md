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