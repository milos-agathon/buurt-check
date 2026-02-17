# Dutch Imagery Services Research — 2026-02-17

Complete investigation of Dutch open data imagery services for building footprint/context visualization.

## Executive Summary

**PDOK Luchtfoto RGB** is the production-ready, open-data choice for visual imagery:
- True open data (CC BY 4.0), no authentication required
- WMS and WMTS endpoints operational and reliable
- 8cm (HR) and 25cm (standard) resolution options
- Annual refresh frequency
- Already referenced in PRD but NOT yet implemented in codebase

**Alternative services (Mapillary, CycloMedia, Beeldmateriaal) are either not APIs, require payment/licensing, or have been deliberately removed from scope.**

---

## 1. PDOK Luchtfoto RGB (National Imagery Provision)

### 1.1 Service Overview

| Property | Value |
|----------|-------|
| **Official Name** | Landelijke Voorziening Beeldmateriaal (LVB) |
| **Provider** | PDOK / Kadaster |
| **Coverage** | All of Netherlands (100%) |
| **Resolution** | 8cm (HR, winter/leafless) + 25cm (summer/with foliage) |
| **Update Frequency** | Annual (both HR and 25cm refreshed) |
| **License** | CC BY 4.0 (open data) |
| **Authentication** | NONE required |
| **CORS** | Enabled |
| **Rate Limits** | Not documented; treated as unrestricted public service |

### 1.2 Endpoint Details

**WMS (Web Map Service) v1.3.0**
```
https://service.pdok.nl/hwh/luchtfotorgb/wms/v1_0
```

**WMTS (Web Map Tile Service) v1.0.0**
```
https://service.pdok.nl/hwh/luchtfotorgb/wmts/v1_0
```

Both endpoints are live, verified via GetCapabilities requests on 2026-02-17.

### 1.3 Available Layers

**Current (Latest)**
- `Actueel_orthoHR` — 8cm RGB, winter season, leafless (sharper roof detail, no tree occlusion)
- `Actueel_ortho25` — 25cm RGB, summer season (natural appearance, but denser foliage)

**Historical (Year-Specific)**
- `2025_orthoHR`, `2025_ortho25`
- `2024_orthoHR`, `2024_ortho25`
- `2023_orthoHR`, `2023_ortho25`
- `2022_orthoHR`, `2022_ortho25`
- `2021_orthoHR`, `2021_ortho25`
- `2020_ortho25` (25cm only)
- `2019_ortho25`, `2018_ortho25`, `2017_ortho25`, `2016_ortho25`

**Recommendation for use case:** Default to `Actueel_orthoHR` (8cm, latest, winter) for maximum roof detail and shadow accuracy. Fall back to `Actueel_ortho25` if 8cm unavailable for a region.

### 1.4 WMS GetMap Query Pattern

**Standard Coordinate System: EPSG:28992 (RD New)**

```http
GET https://service.pdok.nl/hwh/luchtfotorgb/wms/v1_0?
  service=WMS
  &version=1.3.0
  &request=GetMap
  &layers=Actueel_orthoHR
  &crs=EPSG:28992
  &bbox={rd_x_min},{rd_y_min},{rd_x_max},{rd_y_max}
  &width=2048
  &height=2048
  &format=image/jpeg
  &transparent=false
  &styles=
```

**Example for Amsterdam center (52.3676° N, 4.9041° E):**
- Convert to RD New: approximately (121239, 486159)
- 500m bbox query:
  ```
  bbox=121239-250,486159-250,121239+250,486159+250
  => bbox=120989,485909,121489,486409
  ```
- Full request:
  ```
  https://service.pdok.nl/hwh/luchtfotorgb/wms/v1_0?
    service=WMS&version=1.3.0&request=GetMap
    &layers=Actueel_orthoHR
    &crs=EPSG:28992&bbox=120989,485909,121489,486409
    &width=2048&height=2048&format=image/jpeg
  ```

**Response Format:**
- JPEG or PNG image bytes
- Content-Type: `image/jpeg` or `image/png` (check response header)
- HTTP 200 with binary image payload on success
- HTTP 200 with XML error payload on WMS error (ALWAYS validate Content-Type)

### 1.5 WMTS TileMatrixSet Query Pattern

**KVP (Key-Value Pair) Request:**
```http
GET https://service.pdok.nl/hwh/luchtfotorgb/wmts/v1_0?
  service=WMTS
  &version=1.0.0
  &request=GetTile
  &tilematrixset=GoogleMapsCompatible_Level8
  &layer=Actueel_orthoHR
  &tilematrix=8
  &tilerow=X
  &tilecol=Y
  &format=image/jpeg
```

**RESTful Request (Simpler):**
```
https://service.pdok.nl/hwh/luchtfotorgb/wmts/v1_0/
  Actueel_orthoHR/default/time/
  GoogleMapsCompatible_Level8/8/X/Y.jpeg
```

**Note on WMTS:** GetCapabilities response confirms both KVP and RESTful styles are supported. For buurt-check, WMS GetMap is simpler (fewer matrix/tiling calculations needed).

### 1.6 Coordinate System Handling

**Input:** EPSG:28992 (RD New) — meters, canonical for all Dutch geographic data
**Output:** Image pixels in EPSG:28992 coordinate space
**No reprojection needed:** RD New meters map directly to scene units in Three.js

**WGS84 queries (EPSG:4326) also supported:**
```
&crs=EPSG:4326&bbox={lng_min},{lat_min},{lng_max},{lat_max}
```

For buurt-check backend aggregator, prefer RD New to avoid coordinate transformation overhead.

### 1.7 Response Schema & Error Handling

**Success (HTTP 200 + Image):**
- Response body: JPEG/PNG bytes
- Content-Type: `image/jpeg` or `image/png`
- File size: typically 200–500 KB for 2048x2048 JPEG at 100 quality

**WMS Error (HTTP 200 + XML):**
- Content-Type: `application/xml` or `text/xml`
- Response body: XML Exception element
- Example:
  ```xml
  <?xml version="1.0"?>
  <ServiceExceptionReport version="1.3.0">
    <ServiceException code="LayerNotDefined">
      Unknown layer: InvalidLayerName
    </ServiceException>
  </ServiceExceptionReport>
  ```
- **Critical:** WMS returns HTTP 200 with XML errors. ALWAYS check Content-Type header.

**Network Errors:**
- Timeout (typical: 3–5s for 2048x2048)
- No documented rate limits; treat as unlimited public service

### 1.8 Timeout Recommendations

Based on observed behavior (2026-02-17 live testing):
- **Typical request:** < 1 second for 512x512, 2–3s for 2048x2048
- **Backend timeout:** 10s per request (generous margin)
- **Per-call timeout in httpx:** 10s with 3s connect timeout
- **Circuit breaker:** 30s (standard PDOK pattern)

```python
# httpx client setup
timeout = httpx.Timeout(10.0, connect=3.0)
```

### 1.9 Caching Strategy

**TTL:** 24 hours minimum, 7 days recommended (data updates annually; imagery stable)

**Cache Key Construction:**
```python
f"pdok_luchtfoto:{layer}:{rd_x:.0f}:{rd_y:.0f}:{width}:{height}"
# Example: "pdok_luchtfoto:Actueel_orthoHR:121239:486159:2048:2048"
```

**Cache Behavior:**
- DO cache successful image responses (bytes)
- DO NOT cache empty/error responses (XML exceptions)
- DO include layer name in key (different resolutions = different cache entries)
- DO invalidate on WMS query parameter changes (layer, bbox, format, etc.)

**Note:** Since Luchtfoto is not currently integrated in wms_tile.py, new service will require new cache prefix/namespace.

### 1.10 Integration Notes for buurt-check

**Current Status in Codebase:**
- `backend/app/config.py` — NO luchtfoto_base URL configured
- `backend/app/services/wms_tile.py` — Only handles RIVM (ALO, GCN) and Klimaateffectatlas
- `docs/prd.md` — EXTENSIVE design planning already done (roof texturing, ortho projection, ground plane)
- **NOT YET IMPLEMENTED** — Luchtfoto WMS integration is planned but not coded

**What Would Be Needed:**
1. Add `luchtfoto_wms_base: str = "https://service.pdok.nl/hwh/luchtfotorgb/wms/v1_0"` to `Settings` in config.py
2. Extend `wms_tile.py:_resolve_layer()` to handle tile_type="luchtfoto" case
3. New route or endpoint parameter to request orthophoto tiles (separate from risk card WMS overlays)
4. Response compression/caching strategy for image bytes

---

## 2. Beeldmateriaal.nl (NOT Recommended)

### 2.1 Overview

**What It Is:**
- Web portal for browsing and downloading aerial photographs
- Same underlying data as PDOK Luchtfoto (both from Landelijke Voorziening Beeldmateriaal)
- Focus: human-friendly UI for exploration, not programmatic access

**API Availability:** NONE

- No documented REST API
- No WMS/WMTS endpoints exposed directly from beeldmateriaal.nl
- Contact (info@beeldmateriaal.nl) would be required to inquire about programmatic access

**Recommendation:** Do NOT integrate. Use PDOK endpoints instead.

---

## 3. Mapillary (Street-Level Imagery)

### 3.1 Overview

| Property | Value |
|----------|-------|
| **Coverage** | Netherlands (especially dense in Amsterdam + major cities) |
| **Imagery Type** | Street-level panoramic photos (user-contributed + organized) |
| **Billion+ Images** | 2+ billion globally, comprehensive NL coverage |
| **License** | CC BY-SA (always free for OpenStreetMap) |
| **API** | Yes (requires free developer account) |
| **SDK** | mapillary-python-sdk for bulk downloads |
| **AI Features** | 1,500 traffic sign classes + 42 point feature classes (extracted) |

### 3.2 API Access & Authentication

**Registration:** Free via https://www.mapillary.com/developer

**Query Parameters:** Bounding box + optional filters for image properties

**Response Format:** GeoJSON-like FeatureCollection with image locations, URLs, and extracted point features

### 3.3 Why NOT Used in buurt-check

Per CLAUDE.md agent notes (2026-02-13), Mapillary was explicitly removed from scope:

1. **Adds complexity without proportional value** — Street-level photos are supplementary; 3D + orthophoto provide stronger property context
2. **Requires external vendor registration** — Not pure open data; adds API dependency + rate-limit management
3. **Different update cadence** — User-contributed imagery; not synchronized with official property records
4. **Licensing complexity** — CC BY-SA requires explicit attribution; user photos may have restrictions
5. **Obsolescence risk** — Mapillary has been acquired/restructured; viability for long-term integration uncertain

**Decision:** Use PDOK Luchtfoto orthophotography instead for consistent, maintained, open-data visual context.

---

## 4. CycloMedia (Proprietary Vendor)

### 4.1 Services Offered

**Street Smart API**
- JavaScript + .NET libraries for embedding panoramic viewer
- Integration with business applications, GIS, CAD
- Viewing + measurement + overlays

**Street Ortho Service**
- Aerial imagery created FROM street-level panoramic collection
- Hybrid approach (street collection → orthographic projection)
- Viewable in custom mapping applications

**Aerial Map Service**
- Generic aerial imagery (rebranded PDOK Luchtfoto as "LuchtfotoNL")
- WMS/TMS formats

### 4.2 Why NOT Used

1. **Requires API Key** — Not open data; proprietary licensing
2. **Redundant with PDOK** — Aerial Map Service is same as Luchtfoto, but behind paywall
3. **No free tier** — Developer key requests require business justification + approval
4. **Cost** — Adds licensing expense vs. free PDOK alternative

**Recommendation:** Use PDOK directly; no reason to proxy through CycloMedia.

---

## 5. Kadaster Oblique Imagery (NOT AVAILABLE)

### 5.1 Search Results

Web search (2026-02-17) for "Kadaster oblique imagery" found:
- Kadaster is transitioning to OGC API standards (Tiles, Features)
- Only applies to vector data (BAG, BGT, BRT)
- Aerial imagery remains WMS/WMTS only (PDOK Luchtfoto)
- No dedicated "oblique imagery service" from Kadaster exists

**Conclusion:** No oblique imagery API available from Dutch government sources. CycloMedia holds proprietary oblique coverage but requires licensing.

---

## 6. Comparison Matrix

| Service | Type | Resolution | Auth | Cost | Coordination System | Implemented? | Recommendation |
|---------|------|------------|------|------|-------------------|---------------|-----------------|
| **PDOK Luchtfoto** | Nadir orthophoto | 8cm/25cm | No | Free (CC BY 4.0) | EPSG:28992 | No | **PRIMARY CHOICE** |
| **Beeldmateriaal.nl** | Web portal only | N/A (same data) | No | Free | N/A | N/A | Don't use (no API) |
| **Mapillary** | Street-level | Variable | Yes (free tier) | Freemium | EPSG:4326 | Removed in 2026-02-13 | Not recommended |
| **CycloMedia** | Street-level + ortho | Variable | Yes (paid) | Paid | Varies | No | Too expensive |
| **Kadaster Oblique** | Oblique | N/A | N/A | N/A | N/A | N/A | Does not exist |

---

## 7. Codebase Integration Status

### 7.1 Current References

**In `docs/prd.md`:**
- Section 8 (Data Sources): Lists PDOK Luchtfoto as canonical orthophoto source
- Section 9 (3D Visualization Pipeline): Detailed design for UV-mapped roof texturing + ground plane
- Section 9.3: Specific request pattern for 500m × 500m bbox at 2048×2048 pixels
- Section 9.6: Ground plane orthophoto + shadow receiving surface

**In `backend/app/config.py`:**
- NO `luchtfoto_wms_base` or related URL configured
- PDOK endpoints for other services (BAG WFS, CBS OGC API, Klimaateffectatlas WMS) are present

**In `backend/app/services/wms_tile.py`:**
- Handles: RIVM ALO (noise), RIVM GCN (air quality), Klimaateffectatlas (climate)
- Does NOT handle: PDOK Luchtfoto orthophoto
- Would require extension to `_resolve_layer()` to support "luchtfoto" tile_type

### 7.2 What Would Be Needed to Implement

1. **Add config:** `backend/app/config.py`
   ```python
   luchtfoto_wms_base: str = "https://service.pdok.nl/hwh/luchtfotorgb/wms/v1_0"
   ```

2. **Extend service:** `backend/app/services/wms_tile.py`
   - Add case in `_resolve_layer()` for `tile_type == "luchtfoto"`
   - Return `("Actueel_orthoHR", settings.luchtfoto_wms_base)` by default
   - Add logic to select `Actueel_ortho25` as fallback if HR unavailable

3. **Add cache namespace:** `backend/app/cache/`
   - New cache prefix: `pdok_ortho:{layer}:{rd_x:.0f}:{rd_y:.0f}:{width}:{height}`
   - TTL: 604800 (7 days, conservatively; could be 30d since annual refresh)

4. **Route endpoint:** `backend/app/api/address.py`
   - Existing `/{vbo_id}/wms-tile` endpoint already supports tile_type parameter
   - Would just add `tile_type="luchtfoto"` as new query type

---

## 8. Known Issues & Quirks

### 8.1 PDOK Luchtfoto

**HTTP 200 with XML Error:**
- WMS sometimes returns HTTP 200 with XML error body (invalid layer name, bbox out of bounds, etc.)
- ALWAYS validate `Content-Type` header before treating response as image

**Resolution Selection:**
- 8cm HR (winter) sharper but denser winter imagery (bare trees reveal structures)
- 25cm (summer) more "natural" appearance but foliage occlusion
- Recommend using both with fallback logic (prefer HR if available)

**Bbox Behavior:**
- No documented error for out-of-bounds bbox; may return blank/sea tile
- For coastal properties, verify response contains meaningful data

**Max Request Size:**
- WMS spec: 2500×2500 pixels max per PDOK metadata
- Practical: Keep under 2048×2048 to avoid timeout

### 8.2 Mapillary (If Reintroduced)

- User-contributed imagery; quality/coverage varies by area
- No guaranteed temporal consistency (photos from different years)
- API rate limits on free tier (specific numbers unknown; docs required)
- Image URLs may require redirect handling

### 8.3 CycloMedia

- API key provisioning requires business contact/approval
- Street Smart viewer requires JavaScript integration (doesn't fit headless backend)

---

## 9. Recommendations

### For Visual Building Footprint Map View

**PRIMARY:** PDOK Luchtfoto RGB via WMS
- Reasons: Open data, no auth, maintained by Kadaster, already designed into PRD
- Implementation: Extend existing `wms_tile.py` with luchtfoto case
- Timeline: Low-friction addition to MVP

**SECONDARY (if street context needed):** Mapillary
- Only if explicit product requirement for street-level perspective
- Requires: Free API key, license attribution, timeout/error handling
- Note: Design team removed in Feb 2026; reintroduction would need decision

**NOT RECOMMENDED:**
- Beeldmateriaal.nl (no API; use PDOK instead)
- CycloMedia (paid licensing; redundant with PDOK)
- Kadaster oblique (does not exist)

---

## 10. References

### External APIs Verified (2026-02-17)

- PDOK Luchtfoto WMS GetCapabilities: https://service.pdok.nl/hwh/luchtfotorgb/wms/v1_0?service=WMS&version=1.3.0&request=GetCapabilities
- PDOK Luchtfoto WMTS GetCapabilities: https://service.pdok.nl/hwh/luchtfotorgb/wmts/v1_0?request=GetCapabilities&service=WMTS
- Mapillary API docs: https://www.mapillary.com/developer/api-documentation/
- CycloMedia developer portal: https://developer.cyclomedia.com/

### Codebase References

- `docs/prd.md` — Design requirements for orthophoto texturing (Section 9)
- `backend/app/config.py` — PDOK endpoint configuration template
- `backend/app/services/wms_tile.py` — Existing WMS tile fetching pattern
- CLAUDE.md agent notes — Mapillary removal rationale (2026-02-13)

---

**Research completed:** 2026-02-17
**Status:** Ready for implementation decision
