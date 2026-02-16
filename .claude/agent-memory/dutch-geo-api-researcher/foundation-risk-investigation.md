# Foundation Risk Assessment Data Sources Investigation

**Date: 2026-02-13**
**Status: Research Complete**

## Key Findings

### 1. PDOK BRO Bodemkundig WFS Endpoint

**Attempted URLs (status: NOT WORKING):**
- `https://service.pdok.nl/bzk/bro-bodemkundigevlakkenkaart/wfs/v1_0` → 404
- `https://service.pdok.nl/bzk/bro-bodemkundigekaart/wfs/v1_0` → 404
- `https://service.pdok.nl/bzk/bro/wfs` → 404
- `http://geodata.nationaalgeoregister.nl/brobhr/wfs` → No response (timeout/unreachable)

**Status:** The traditional BRO WFS endpoints at service.pdok.nl are NOT available. The endpoint from Geoforum discussions (`geodata.nationaalgeoregister.nl/brobhr/wfs`) also does not respond.

**Recommendation:** BRO soil data through traditional WFS may not be publicly available or may have been deprecated. Alternative: Check PDOK main datasets catalog for bodemkundig data via OGC API Features.

### 2. Klimaateffectatlas Subsidence (Bodemdaling) Layers

**FOUND: Multiple subsidence layers available via WMS at:**
```
https://maps1.klimaatatlas.net/geoserver/ows
```

**Layer Name Pattern (verified via REST API):**
- `den_haag_klimaatatlas:1827_den_haag_gemiddelde_bodemdaling_tusse`
- `alphen_klimaatatlas:1823_alphen_kwetsbaarheid_vaarwegen_bodemdaling`
- `hhsk_klimaatatlas:1841_hhsk_kwetsbare_panden_bodemdaling`
- `hhsk_klimaatatlas:1841_hhsk_totaalkaart_bodemdaling`
- `pnh_klimaatatlas:1829_pnh_bodemdaling_*`
- `hhnk_klimaatatlas:1806_hhnk_kwetsbaarheid_panden_bodemdaling`
- `hlt_klimaatatlas:1833_hlt_knelpunten_bodemdaling`
- `a5h:1819_a5h_bodemdaling_kunstwerken/vaarwegen/wegen`
- `bar_klimaatatlas:1840_bar_kwetsbare_panden_bodemdaling`
- `zevenaar_klimaatatlas:1839_zevenaar_bodemdaling_panden`

**Issue Found:**
Layer names in REST API JSON are **truncated**. Full layer names cannot be reliably extracted from:
```
https://maps1.klimaatatlas.net/geoserver/rest/layers.json
```

**Workaround:**
Use WMS GetCapabilities to discover full, queryable layer names:
```
https://maps1.klimaatatlas.net/geoserver/wms?service=WMS&version=1.3.0&request=GetCapabilities
```

**Query Approach (UNTESTED - needs verification):**
WMS GetFeatureInfo with RD coordinates (EPSG:28992), similar to existing climate card pattern in `risk_cards.py`.

### 3. Coverage & Regional Limitation

Subsidence data is **municipality/regional-specific**:
- Mostly water authority (waterschap) boundaries: HHNK, HLS, HHSK, PNH, etc.
- Some provincial: Den Haag, Alphen, Twente (TWN)
- Some infrastructure focus: A5H (Highway A5)

**National coverage:** NOT uniform. Many areas outside major water authorities have no subsidence data.

### 4. Data Attributes (Unknown - needs live testing)

- Expected field: rate (mm/year) or vulnerability classification
- Likely values: categorical ("kwetsbaar", "risico", "hoog") or numeric
- **Must verify via live GetFeatureInfo query**

### 5. Current Project Integration

**Klimaateffectatlas already integrated in codebase:**
- Config: `climate_atlas_wms_base = "https://maps1.klimaatatlas.net/geoserver/ows"`
- Pattern: `_sample_wms_properties()` + `_sample_wfs_properties()` in `risk_cards.py`
- Layer caching: `_get_climate_layer_names()` at `climate_atlas_layers_index`
- License: CC BY 4.0 (attribution required)

**Subsidence can be added as climate stress component** (similar to heat + water current pattern).

## Next Steps

1. **Verify subsidence layer names** via WMS GetCapabilities
2. **Test WMS GetFeatureInfo** on a real subsidence layer with Amsterdam test coordinates
3. **Determine attribute field names and units** (mm/year vs categorical)
4. **Check national coverage** - map which areas have subsidence data
5. **Implement as F3 climate component** if coverage sufficient, else document as "regional data gap"

## Sources Consulted

- PDOK official documentation: https://www.pdok.nl/datasets
- BRO news (Dutch): https://basisregistratieondergrond.nl/-/nieuwe-bro-open-data-bij-pdok-beschikbaar
- Geoforum BRO WFS discussions: Various community posts referencing deprecated endpoints
- Klimaateffectatlas Geoserver REST API: Actual layer catalog discovery via JSON
