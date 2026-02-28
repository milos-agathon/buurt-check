# Operational Runbook

## 1. Redis down

**Symptoms:** 8s latency spike on all endpoints. First request ~4s, subsequent requests instant (circuit breaker triggers).
**Log grep:** `circuit breaker OPEN` or `Redis connection error`
**Mitigation:** App continues without cache. All data fetched fresh from external APIs. No user-visible errors.
**Recovery:** Restart Redis: `docker start buurt-redis`. Circuit breaker resets automatically after 30s.
**Verify:** `curl http://localhost:8000/health` returns 200. Check logs for `circuit breaker CLOSED`.

## 2. 3DBAG timeout

**Symptoms:** 3D viewer shows loading spinner indefinitely or falls back to single building view.
**Log grep:** `3DBAG bbox timeout` or `httpx.TimeoutException`
**Mitigation:** Building facts, risk cards, and neighborhood stats still render. Only 3D viewer is affected. Target building fetch (~2s) usually succeeds independently.
**Recovery:** Wait for 3DBAG service recovery. No action needed on our end.
**Verify:** `curl "https://api.3dbag.nl/collections/pand/items?limit=1"` returns 200.

## 3. RIVM WMS down

**Symptoms:** Risk cards show "Data unavailable" for noise and/or air quality.
**Log grep:** `NOISE_NO_VALUE`, `AIR_PARTIAL`, `AIR_NO_VALUE`
**Mitigation:** Other risk cards (climate, sunlight) unaffected. Viewing questions still generated.
**Recovery:** RIVM WMS outages are typically brief (<1h). Cached results (7d TTL) shield most users.
**Verify:** `curl "https://data.rivm.nl/geo/alo/wms?service=WMS&request=GetCapabilities" | head -5`

## 4. CBS API down

**Symptoms:** Neighborhood stats card shows error state. Age bars and indicators missing.
**Log grep:** `CBS_LOOKUP_FAILED`, `CBS_TIMEOUT`
**Mitigation:** Risk cards, 3D viewer, building facts all unaffected. Viewing checklist still renders.
**Recovery:** CBS OGC API is generally stable. Outages are rare.
**Verify:** `curl "https://api.pdok.nl/cbs/wijken-en-buurten-2024/ogc/v1/collections/buurten/items?limit=1"`



## 6. All APIs down

**Symptoms:** All data cards show unavailable/error. Only search works (Locatieserver is separate).
**Log grep:** Multiple timeout/error messages across all services.
**Mitigation:** Search still works. Building facts may be cached. Users see "data unavailable" states.
**Recovery:** Check network connectivity. Check each upstream service individually using verify commands above.
**Verify:** `curl http://localhost:8000/health` (confirms our service is running).
