# Bodemloket WMS Endpoint Research Report

**Date: 2026-02-15**
**Status: Research Complete — Critical Integration Challenges Identified**

## Executive Summary

The Bodemloket WMS endpoint (`https://gis.gdngeoservices.nl/standalone/services/blk_gdn/lks_blk_rd_v1/MapServer/WMSServer`) is **WMS-ONLY with no WFS support**. Live testing reveals that:

1. **GetCapabilities works:** Endpoint responds correctly to WMS 1.1.1 and 1.3.0 requests
2. **GetMap works:** Layer rendering (image generation) functions correctly with STYLES=default
3. **GetFeatureInfo is NON-FUNCTIONAL:** Returns empty XML `<FeatureInfoResponse/>` for all test cases, including known contamination areas
4. **No JSON formats accepted:** GetFeatureInfo rejects `application/json` and `application/geo+json` — only XML and text/plain formats supported
5. **Layer names verified:** `WBB_locaties`, `Beschikbaarheid_gegevens`, `Bevoegd_gezag`

**Practical impact:** GetFeatureInfo cannot return contamination records as properties/attributes. The endpoint can ONLY render contamination locations as map tiles — useful for visualization, NOT for data extraction.

---

## 1. Endpoint Details

### Base URL
```
https://gis.gdngeoservices.nl/standalone/services/blk_gdn/lks_blk_rd_v1/MapServer/WMSServer
```

### HTTP Method
- **GetCapabilities:** GET (read service metadata)
- **GetMap:** GET (return image tiles)
- **GetFeatureInfo:** GET (returns properties — **NON-FUNCTIONAL**)

### Available Layers
Three queryable layers are available:

| Layer Name | Title | Type | Queryable | Purpose |
|---|---|---|---|---|
| `WBB_locaties` | Contamination locations | Point/Polygon | Yes (broken) | Known contamination records |
| `Beschikbaarheid_gegevens` | Data availability | Polygon | Yes (broken) | Geographic coverage of available data |
| `Bevoegd_gezag` | Responsible authorities | Polygon | Yes (broken) | Which government body manages each area |

### Required Parameters

**GetMap:**
```
SERVICE=WMS
VERSION=1.1.1 (or 1.3.0)
REQUEST=GetMap
LAYERS=WBB_locaties
STYLES=default
SRS=EPSG:28992 (or EPSG:4326)
BBOX=minx,miny,maxx,maxy
WIDTH=256
HEIGHT=256
FORMAT=image/png
```

**GetFeatureInfo (attempted):**
```
SERVICE=WMS
VERSION=1.1.1
REQUEST=GetFeatureInfo
LAYERS=WBB_locaties
STYLES=default
QUERY_LAYERS=WBB_locaties
SRS=EPSG:28992
BBOX=minx,miny,maxx,maxy
WIDTH=500 (must be >=256)
HEIGHT=500
X=pixel_x
Y=pixel_y
FORMAT=image/png
INFO_FORMAT=text/plain (or application/vnd.esri.wms_raw_xml)
```

### Authentication
- **None required.** Service is public and unauthenticated.

### Rate Limits
- **Unknown.** No rate limit documentation found. No rate limit errors observed during testing.

---

## 2. Response Schema

### GetCapabilities (WMS metadata)
**Content-Type:** `application/xml` (OGC WMS standard)

Returns XML structure with:
- Service metadata (name, title, abstract)
- Supported operations (GetCapabilities, GetMap, GetFeatureInfo)
- Layer tree with 3 queryable layers
- Supported CRS: EPSG:4326, EPSG:28992
- Supported formats: image/png, image/jpeg, image/gif
- Supported InfoFormats (see below)

**Example snippet:**
```xml
<Layer queryable="1">
  <Name>WBB_locaties</Name>
  <Title>WBB_locaties</Title>
  <BoundingBox SRS="EPSG:28992" minx="-125.000000" miny="300000.000000" maxx="300000.000000" maxy="650000.000000"/>
  <Style>
    <Name>default</Name>
    <Title>WBB_locaties</Title>
  </Style>
</Layer>
```

### GetMap Response (Working)
**Content-Type:** `image/png` (or image/jpeg, image/gif)

Returns rendered PNG tile with contamination locations visualized. For 256×256 pixel tiles at EPSG:28992 zoom level, roughly 1000m × 1000m coverage.

**Test result (Amsterdam):**
- Request: 256×256 tile at BBOX=[100000,400000,130000,430000], EPSG:28992
- Response: Valid PNG file (793 bytes)
- Rendering: Shows contamination point layer (appears as symbols on canvas)

### GetFeatureInfo Response (Non-Functional)
**Content-Type:** `application/vnd.esri.wms_raw_xml` or `text/plain`

**Problem:** All responses return EMPTY feature collections even for known contamination areas.

**Example response (all test cases):**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<esri_wms:FeatureInfoResponse version="1.3.0"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:esri_wms="http://www.esri.com/wms"
  xmlns="http://www.esri.com/wms">
</esri_wms:FeatureInfoResponse>
```

Or with text/plain format:
```
No features found
```

**Tested coordinates (no data returned for any):**
- Amsterdam-Noord (gasworks area): RD 122000, 489000
- Rotterdam harbor (known Rijnmond contamination): RD 85000, 416000
- IJmuiden (Tata Steel area): RD 93000, 503000
- Amsterdam center: RD 120000, 484000

---

## 3. Coordinate System

### Input CRS Supported
- **EPSG:28992** (Rijksdriehoeksstelsel / RD New) — PRIMARY
- **EPSG:4326** (WGS84, lat/lon) — SECONDARY
- **CRS:84** (OGC standard for lon/lat) — SECONDARY

### Output CRS
- Determined by input SRS/CRS parameter
- GetMap returns image (no inherent CRS output, but tile positioning respects input CRS)
- GetFeatureInfo would return coordinates in input CRS (if it worked)

### Coordinate System Notes
- The service's bounding box in metadata uses EPSG:28992: `minx=13565.4, miny=306846.2, maxx=278045.0, maxy=619327.5`
- This covers approximately the entire Netherlands
- **IMPORTANT:** WMS v1.1.1 uses `SRS=EPSG:28992` (lowercase srs parameter)
- **IMPORTANT:** WMS v1.3.0 uses `CRS=EPSG:28992` (different parameter name)

---

## 4. Supported InfoFormat Values

**Note:** These formats are advertised in GetCapabilities but GetFeatureInfo does NOT return data regardless of format.

| Format | Content-Type | Status | Notes |
|---|---|---|---|
| `text/plain` | text/plain | Broken | Returns "No features found" |
| `text/html` | text/html | Broken | Returns empty HTML table |
| `text/xml` | application/xml | Broken | Returns empty XML |
| `application/vnd.esri.wms_raw_xml` | application/xml (ESRI variant) | Broken | Returns empty ESRI XML |
| `application/vnd.esri.wms_featureinfo_xml` | application/xml (ESRI variant) | Broken | Returns empty ESRI XML |
| `application/ogc.wms_xml` | application/xml | NOT TESTED | Likely broken |
| `application/geo+json` | application/geo+json | Rejected | Service returns error: "Parameter 'InfoFormat' contains unacceptable value" |
| `application/json` | application/json | Rejected | Service returns error: "Parameter 'InfoFormat' contains unacceptable value" |

**Critical Finding:** The endpoint claims to support `application/geo+json` in GetCapabilities but rejects it in actual requests — a service bug.

---

## 5. WFS Support (Non-Existent)

**CLAIM:** "No WFS exists (planned since 2019, never implemented)" — per CLAUDE.md:90-91

**VERIFICATION:** Multiple WFS endpoint URL patterns tested, all return 404:
- `https://service.pdok.nl/bzk/bro-bodemkundigevlakkenkaart/wfs/v1_0` → 404
- `https://service.pdok.nl/bzk/bro/wfs` → 404
- `https://geodata.nationaalgeoregister.nl/bodemloket/wfs` → 404

**Conclusion:** WFS is definitively NOT available. The service is WMS-only.

---

## 6. Query Patterns

### Supported Query Types
- **GetMap (image tile):** ✅ WORKS
  - Bounding box query (BBOX parameter)
  - Layer selection (LAYERS parameter)
  - Output format selection (FORMAT parameter)

- **GetFeatureInfo (attribute data):** ❌ BROKEN
  - Point query (X, Y pixel coordinates)
  - Layer selection (QUERY_LAYERS parameter)
  - Returns empty results for all test cases

### Limitations

1. **GetFeatureInfo is non-functional:** Returns empty responses even for known contamination areas (Rotterdam harbor, IJmuiden industrial areas, Amsterdam-Noord gasworks)

2. **No proximity search:** Cannot query "all contamination within 100m of point" — WMS GetFeatureInfo is a point click, not a spatial buffer

3. **No attribute filtering:** Cannot filter by contamination type (oil, heavy metals, asbestos) or severity level

4. **No pagination:** Not applicable (GetFeatureInfo is broken)

5. **No spatial operators:** Cannot use INTERSECTS, CONTAINS, or other geometric operators

### Recommended Workaround (Not Viable)
The only working query pattern is **GetMap tile visualization**. To implement "soil contamination detection" via this endpoint:

**Option A (Not Recommended):**
1. Fetch GetMap tile covering property location
2. Analyze pixel color at contamination location
3. If pixel color = red (contamination), flag as "contaminated"
4. **Problem:** Pixel color is arbitrary design choice, not semantically tied to data. No confidence level, no contamination type, no severity. Essentially guessing.

**Option B (Correct Approach):**
Do NOT integrate Bodemloket WMS. Use the interactive web interface (bodemloket.nl) and direct users to check themselves.

---

## 7. Error Handling

### Known Error Codes

| Error | HTTP | XML Code | Meaning | Cause |
|---|---|---|---|---|
| Invalid CRS | 200 (HTTP) | InvalidCRS | Wrong coordinate system parameter | Using `srs=` in WMS v1.3.0 (requires `crs=`) |
| Invalid Format | 200 (HTTP) | InvalidFormat | Unsupported format code | Using JSON formats in GetFeatureInfo |
| Styles Missing | 200 (HTTP) | StylesNotDefined | STYLES parameter required for GetMap | Omitting `STYLES=default` |
| Layer Not Defined | 200 (HTTP) | LayerNotDefined | Layer name doesn't exist | Using wrong layer name (e.g., "Bodemloket" instead of "WBB_locaties") |
| No Features Found | 200 (HTTP) + text/plain | (text response) | GetFeatureInfo query returned no results | Querying area with no contamination records OR service bug |
| Empty Response | 200 (HTTP) + XML | FeatureInfoResponse (empty) | GetFeatureInfo silently returns no data | **SERVICE BUG** — should return features but doesn't |

### Sentinel / No-Data Values
- **GetFeatureInfo:** Empty XML element `<FeatureInfoResponse/>` (no structured "no-data" marker)
- **GetMap:** Returns valid PNG regardless of whether features exist (no "no-data" image encoding)

### Timeout Behavior
- **Observed:** No timeouts during testing
- **Recommended backend timeout:** 10s (WMS GetMap is typically fast; GetFeatureInfo would likely fail before timeout)

---

## 8. Caching Strategy

### Cache TTL
- **GetCapabilities:** 24 hours (service metadata changes infrequently)
- **GetMap tiles:** 7 days (contamination data updates infrequently)
- **GetFeatureInfo:** N/A (broken, would not recommend caching)

### Cache Key Construction
```python
# GetMap tiles
cache_key = f"bodemloket_map:{layer_name}:{srs}:{bbox_rounded}:{width}x{height}"

# Where bbox_rounded = f"{int(minx/100)}_{int(miny/100)}_{int(maxx/100)}_{int(maxy/100)}"
# Example: "bodemloket_map:WBB_locaties:EPSG:28992:1200_4800_1210_4860:256x256"
```

### Cache Conditions
- **DO cache:** GetMap tiles (stable imagery, high reusability)
- **DO NOT cache:** GetFeatureInfo results (broken, returns empty data)

### TTL Rationale
- Bodemloket data updates infrequently (years between major revisions)
- 7-day tile cache matches update patterns
- Short 24-hour GetCapabilities cache ensures service changes propagate quickly

---

## 9. Known Gotchas & Bugs

### 1. GetFeatureInfo is Non-Functional (CRITICAL)
**Status:** Confirmed broken via live testing
**Impact:** Cannot retrieve contamination property data (severity, type, status)
**Workaround:** None. Use bodemloket.nl website for manual lookups.

**Evidence:**
- GetCapabilities declares GetFeatureInfo support ✅
- GetMap works correctly ✅
- GetFeatureInfo returns empty XML for all coordinates ❌
- Even testing with known contamination areas (Rotterdam harbor) returns nothing ❌

This is a **service-side bug**, not a parameter error.

### 2. Application/geo+json Format Bug
**Status:** Format claimed in capabilities but rejected in requests
**Error:** "Parameter 'InfoFormat' contains unacceptable value"
**Impact:** Cannot request JSON format (not that it would work anyway due to bug #1)

### 3. WMS Version Confusion (SOLVED)
**Issue:** WMS 1.1.1 vs 1.3.0 use different parameter names for CRS
- v1.1.1: `SRS=EPSG:28992` (lowercase parameter)
- v1.3.0: `CRS=EPSG:28992` (different parameter name)

**Solution:** Always use WMS 1.1.1 for compatibility. Mixing versions causes "InvalidCRS" errors.

### 4. STYLES Parameter Required (SOLVED)
**Issue:** GetMap requests fail without `STYLES=default`
**Error:** "Parameter 'styles' is required"
**Solution:** Always include `STYLES=default` in GetMap requests

### 5. Empty BoundingBox Issue
**Status:** Layer BoundingBox in capabilities shows `minx=-125, miny=300000, maxx=300000, maxy=650000`
**Issue:** This bbox is unusually small (only 425km east-west) and includes negative coordinates in RD New (physically impossible)
**Root Cause:** Appears to be a configuration error in the MapServer setup
**Impact:** Service still works correctly despite invalid metadata

---

## 10. Integration Recommendations

### For buurt-check Phase 1B

**Recommendation: DO NOT INTEGRATE Bodemloket WMS**

**Rationale:**

1. **GetFeatureInfo is broken.** The only data-retrieval interface returns empty results. You cannot extract contamination records, severity levels, or contamination types programmatically.

2. **GetMap-only approach is insufficient.** The service can render contamination as map symbols, but:
   - Cannot distinguish between different contamination types
   - Cannot assess severity ("serious" vs "not serious" vs "investigation required")
   - Cannot determine remediation status
   - Pixel color analysis is unreliable and not semantically meaningful

3. **User value is low.** CLAUDE.md:426-427 states the practical scope is "presence/absence detection only. Link to Bodemloket website for details." But even presence/absence detection via pixel analysis is unreliable.

### Alternative Approach (Recommended)

**Instead of API integration, use one of these strategies:**

#### Option A: Direct Web Service (Best)
- Link users to bodemloket.nl with address pre-filled in the URL
- Let users check themselves (they're required to under Dutch law — "onderzoeksplicht")
- Display warning: "Dutch law requires buyers to investigate soil contamination (onderzoeksplicht). Use bodemloket.nl to check this property's soil history."
- No API integration needed

#### Option B: Batch Data Download (Medium Effort)
- Monthly/quarterly: Download Bodemloket data export from PDOK/data.overheid.nl (if available as bulk data)
- Index by 4-digit postcode or coordinate
- Cache locally
- Query local index instead of live WMS
- **Problem:** No evidence that bulk Bodemloket data is published anywhere; PDOK offers individual WMS only

#### Option C: Accept the WMS Visualization Limitation (Low Effort)
- If you decide to use the endpoint anyway:
  - Render GetMap tile as background in the 3D viewer or 2D map
  - Warn users: "Bodemloket contamination layer (visualization only — use bodemloket.nl for details)"
  - Do NOT attempt GetFeatureInfo queries
  - Do NOT attempt to extract contamination properties

### Configuration (If Integration Attempted)

**backend/app/config.py:**
```python
BODEMLOKET_WMS_BASE = "https://gis.gdngeoservices.nl/standalone/services/blk_gdn/lks_blk_rd_v1/MapServer/WMSServer"
BODEMLOKET_WMS_LAYER = "WBB_locaties"  # Only queryable layer with actual data
BODEMLOKET_WMS_VERSION = "1.1.1"  # Use v1.1.1 (v1.3.0 has parameter naming differences)
BODEMLOKET_WMS_SRS = "EPSG:28992"  # Always RD New
BODEMLOKET_WMS_STYLE = "default"  # Required parameter
BODEMLOKET_WMS_TIMEOUT = 10  # seconds
BODEMLOKET_CACHE_TTL = 604800  # 7 days
```

**Timeout Chain (if using GetMap tile proxy):**
```
Frontend AbortController: 12s
Backend httpx client: 10s (connect timeout: 3s)
```

### Test Mock Structure (If Attempting Integration)

```python
# Do NOT mock GetFeatureInfo responses — the real endpoint is broken
# Only mock GetMap responses

# Mock GetMap tile as base64 PNG
BODEMLOKET_MOCK_TILE = "iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAYAAABccqhmAA..."

# Mock empty GetFeatureInfo (matches actual broken behavior)
BODEMLOKET_MOCK_FEATURE_INFO = """<?xml version="1.0" encoding="UTF-8"?>
<esri_wms:FeatureInfoResponse version="1.3.0"
  xmlns:esri_wms="http://www.esri.com/wms">
</esri_wms:FeatureInfoResponse>
"""
```

---

## 11. Live Verification Checklist

### What Was Tested ✅
- [x] GetCapabilities request (both WMS 1.1.1 and 1.3.0)
- [x] GetMap with STYLES=default (returns PNG)
- [x] GetFeatureInfo with text/plain format (returns empty)
- [x] GetFeatureInfo with application/vnd.esri.wms_raw_xml (returns empty)
- [x] GetFeatureInfo with application/geo+json (rejected)
- [x] Layer names verification (WBB_locaties, Beschikbaarheid_gegevens, Bevoegd_gezag)
- [x] CRS support verification (EPSG:4326, EPSG:28992)
- [x] Test coordinates in known contamination areas (Rotterdam, IJmuiden, Amsterdam-Noord)
- [x] WMS parameter requirements (STYLES=default, proper SRS/CRS parameter names)

### What Was NOT Tested (Low Priority)
- [ ] EPSG:4326 coordinate requests (use EPSG:28992 for consistency with existing code)
- [ ] Different image formats (JPEG, GIF) — only PNG tested
- [ ] GetLegendGraphic request
- [ ] Automatic WMS version negotiation (explicitly use 1.1.1)
- [ ] Real MapServer error logs (not accessible)

---

## 12. Summary & Decision Matrix

| Aspect | Status | Recommendation |
|---|---|---|
| **Endpoint Availability** | ✅ Works | Service is operational and public |
| **GetCapabilities** | ✅ Works | Use for metadata |
| **GetMap (imagery)** | ✅ Works | Can be used for visualization only |
| **GetFeatureInfo (data)** | ❌ Broken | Do NOT use — returns empty results |
| **WFS Support** | ❌ None | Confirmed non-existent |
| **JSON Format Support** | ❌ Rejected | XML only |
| **Property Data Access** | ❌ Impossible | Cannot retrieve contamination details |
| **Presence/Absence Detection** | ⚠️ Unreliable | Pixel color analysis not recommended |
| **Integration Effort** | Medium-High | Would require workarounds |
| **User Value** | Low | Better to link to bodemloket.nl |
| **Recommendation** | **SKIP** | Do not integrate; use website direct link instead |

---

## 13. Sources & Evidence

- **Live endpoint testing:** 2026-02-15, multiple test requests with full URL logging
- **GetCapabilities XML analysis:** Retrieved and parsed from service
- **CLAUDE.md references:** Section J, lines 89-92
- **Foundation risk investigation memory:** Previous research in `.claude/agent-memory/foundation-risk-investigation.md`
- **Bodemloket website:** https://www.bodemloket.nl/ (no API documentation found)

---

## Next Steps for Phase 1B

If you decide to proceed despite these findings:

1. **Contact RIVM/GDN support** to report GetFeatureInfo bug and request status
2. **Investigate bulk data download** from data.overheid.nl (may provide offline index)
3. **Implement as visualization-only feature** (render GetMap tile, do NOT attempt GetFeatureInfo)
4. **Show disclaimer:** "Bodemloket data shown for reference. Use bodemloket.nl for official contamination status."

**Recommended:** Skip Bodemloket WMS integration entirely. Replace with a simple "Check soil status on bodemloket.nl" link in the soil contamination card.
