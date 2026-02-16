# Dutch Geo API Researcher — Agent Memory

## Leefbaarometer WFS API (2026-02-15)

**See detailed research:** `leefbaarometer-wfs-api.md`

### Critical Findings (Contradict CLAUDE.md)
1. **Score scale is 1-9, NOT 1-10.** Verified via 500-record sample distribution.
2. **Overall score field is `kscore`, NOT `lbm`.** The `lbm` field does not exist in actual responses.
3. **Dimension fields use `k` prefix, NOT underscore suffix.**
   - `kfys` (not `_fys`), `konv` (not `_onv`), `ksoc` (not `_soc`), `kvrz` (not `_vrz`), `kwon` (not `_won`)
4. **Both typeName formats work:** `lbm3:buurtscore24` and `buurtscore24`
5. **CQL_FILTER syntax:** `INTERSECTS(geom,POINT(rx ry))` — no space after comma before POINT.

### Response Schema Verified
- GeoJSON FeatureCollection with single Feature per point query
- Properties include metadata (gemeente, name, id, scale, year) + 6 score fields + 6 standardized fields
- Geometry: MultiPolygon in requested CRS (EPSG:28992 or EPSG:4326)

### Query Patterns
- **Point query:** `CQL_FILTER=INTERSECTS(geom,POINT(x y))` + `srsName=EPSG:28992`
- **Bulk query:** `count=100` or `count=500` (no pagination, returns first N)
- **Coordinate systems:** EPSG:28992 (RD New) and EPSG:4326 (WGS84) both work

### Caching
- TTL: 30 days (annual data update)
- Key: `leefbaarometer:{year}:{buurt_code}` or `leefbaarometer:{year}:{rd_x:.0f}:{rd_y:.0f}`
- Do NOT cache empty results (point outside coverage area)

### Feature Types Confirmed
- `lbm3:buurtscore24` (2024) — LATEST
- `lbm3:buurtscore22` (2022)
- `lbm3:buurtscore20` (2020)
- Presumably biennial back to 2002

### Unknown Fields (Needs Investigation)
- `kafw`: Always 9 in sample data
- `afw`: Float values (possibly standardized overall)
- These can be safely ignored for MVP

### Timeouts
- Normal point queries: <100ms
- Bulk queries (count=500): 2-3s
- Recommended backend timeout: 5s
- No rate limits observed

## File Organization

- `leefbaarometer-wfs-api.md` — Full research report with live examples, error handling patterns, Pydantic models, and test recommendations
- This file — Quick reference for key findings and contradictions with CLAUDE.md
