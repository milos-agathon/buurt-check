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

## Dutch Imagery Services (2026-02-17)

**See detailed research:** `imagery-services-research.md`

### PDOK Luchtfoto RGB (Aerial Orthophotography)

**Status:** Production-ready, open data, NO authentication required, CC BY 4.0 licensed.

**Endpoints:**
- **WMS:** `https://service.pdok.nl/hwh/luchtfotorgb/wms/v1_0`
- **WMTS:** `https://service.pdok.nl/hwh/luchtfotorgb/wmts/v1_0`

**Available Layers (WMS/WMTS):**
- `Actueel_orthoHR` — Latest 8cm RGB (winter, leafless, sharper roofs)
- `Actueel_ortho25` — Latest 25cm RGB (summer, with vegetation)
- Year-specific: `2025_orthoHR`, `2025_ortho25`, `2024_orthoHR`, `2024_ortho25`, ... back to 2016

**Query Pattern (WMS GetMap):**
```
https://service.pdok.nl/hwh/luchtfotorgb/wms/v1_0
  ?service=WMS&version=1.3.0&request=GetMap
  &layers=Actueel_orthoHR
  &crs=EPSG:28992
  &bbox={rd_x-radius},{rd_y-radius},{rd_x+radius},{rd_y+radius}
  &width=2048&height=2048
  &format=image/jpeg
```

**Response Format:** JPEG or PNG image tiles (no content-type headers; always check for HTTP 200 with image/* Content-Type).

**Coordinate System:** EPSG:28992 (RD New, meters). WGS84 queries via EPSG:4326 also supported.

**Use Cases:**
- Roof texturing for 3D viewers (nadir orthophoto UV projection)
- Ground plane base layers
- Roof condition assessment (8cm resolution shows chimneys, solar panels)
- Building footprint visualization

**Known Quirks:**
- **Not integrated in current codebase** — config.py has no luchtfoto endpoint yet. `wms_tile.py` only handles RIVM/Klimaateffectatlas.
- **Update frequency:** Annual (both 25cm summer and 8cm winter refreshed yearly)
- **Max request size:** 2500x2500 pixels per WMS spec
- **No street-level perspective** — pure nadir (straight-down) imagery only

### Street-Level and Oblique Imagery Options

**Mapillary (Open Data, Free API)**
- **Coverage:** Full panoramic coverage of Netherlands streets, especially dense in Amsterdam
- **API:** Free via developer portal after registration
- **License:** CC BY-SA, always free for OpenStreetMap
- **Features:** 1,500 traffic sign classes + 42 point feature classes (AI-extracted)
- **SDK:** mapillary-python-sdk for bulk downloads
- **Cons:** Not integrated into buurt-check; requires separate API key; different imagery collection timeline

**CycloMedia (Requires API Key)**
- **Street Ortho Service:** Aerial imagery created FROM street-level panoramic images (hybrid approach)
- **Aerial Map Service:** Generic aerial imagery (same as PDOK Luchtfoto, sold as LuchtfotoNL)
- **Street Smart API:** JavaScript + .NET libraries for viewer integration
- **Coverage:** Full Netherlands
- **Cons:** Requires paid license/API key (not open data); proprietary imagery

**Beeldmateriaal.nl (NOT an API)**
- **What it is:** Web portal for browsing and downloading aerial photos
- **Access:** Interactive web UI only, no programmatic API
- **Coverage:** Same as PDOK (national orthophotos)
- **Cons:** No API for buurt-check integration

**Kadaster Oblique Imagery (NOT AVAILABLE)**
- Search found NO dedicated oblique imagery service from Kadaster
- Kadaster is transitioning to OGC API standards but only for vector data (BAG, BGT, BRT)
- Aerial imagery remains WMS/WMTS only

### Why NOT Use Mapillary?

Our CLAUDE.md agent brief references Mapillary removal (2026-02-13). The decision appears intentional:
- Mapillary API requires registration + rate-limited free tier
- Not true "open data" — requires external vendor integration
- Street-level photos less critical than 3D + orthophoto for property viewing context
- PDOK Luchtfoto already provides sufficient visual context with no auth

## File Organization

- `leefbaarometer-wfs-api.md` — Full research report with live examples, error handling patterns, Pydantic models, and test recommendations
- `imagery-services-research.md` — Full research on PDOK Luchtfoto WMS/WMTS, Mapillary, CycloMedia, Beeldmateriaal
- This file — Quick reference for key findings and contradictions with CLAUDE.md
