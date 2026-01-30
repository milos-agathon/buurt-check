# buurt-check — Product Requirements Document

> **Version:** 1.1 | **Last updated:** 2026-01-30

> **One-liner:** Paste a Dutch address, get an instant risk-and-reality dossier with 3D context, environmental risk cards, and a printable viewing briefing.

## Table of contents

1. [Market opportunity](#1-market-opportunity)
2. [Product goal](#2-product-goal)
3. [Target users](#3-target-users)
4. [Core user journey (MVP)](#4-core-user-journey-mvp)
5. [MVP feature set](#5-mvp-feature-set)
6. [Out of scope](#6-out-of-scope)
7. [Success metrics](#7-success-metrics)
8. [Data sources & ingestion](#8-data-sources--ingestion)
9. [MVP architecture](#9-mvp-architecture)
10. [Performance & quality requirements](#10-performance--quality-requirements)
11. [Privacy & legal](#11-privacy--legal)
12. [Risks & mitigations](#12-risks--mitigations)
13. [Why this can win](#13-why-this-can-win)

---

## 1. Market opportunity

This section maps which problems have strong open data support and weak coverage in existing Dutch property buyer apps, establishing where buurt-check can differentiate.

### Tier A — strong open data + weak coverage in existing buyer apps

These are the ones where you can make a *real market contribution* fast:

1. **Address -> Risk & Reality Dossier (the "Viewing Briefing")**
   One link/address becomes a shareable, bilingual (EN/NL) dossier: building facts + neighborhood stats + environmental/climate risks + noise/air quality + 3D context.
   Why this stands out: most apps show *a map*; you'll show **consequences + questions to ask at the viewing**.
   Data is there: BAG, CBS, RIVM/Atlas Leefomgeving WMS, Klimaateffectatlas WMS/WFS, 3DBAG/3D Basisvoorziening. ([api.pdok.nl][1])

2. **3D "micro-neighborhood truth" (sun/shadow + canyon effect + context)**
   Forge3d is your differentiator: render the block in 3D and answer practical questions: *"Is this ground-floor dark all year?" "Is the balcony boxed in?"*
   Feasible via 3DBAG API/downloads and/or Kadaster 3D Basisvoorziening (3D Tiles + OGC API). ([docs.3dbag.nl][2])

3. **Noise & air quality at 10m-50m scale (as "livability risk cards")**
   This is a huge expat pain point ("I didn't realize it was that loud / polluted"). RIVM provides public WMS + downloadable rasters/zips for noise and GCN air quality. ([data.overheid.nl][3])

4. **Climate-stress flags that buyers *actually misunderstand***
   Water nuisance / flooding vulnerability / heat stress / drought sensitivity presented as *"what it means for you"* + mitigation questions for the seller/VvE. Klimaateffectatlas is explicitly open + WMS friendly. ([klimaateffectatlas.nl][4])

### Tier B — feasible, but differentiation depends on execution

5. **Neighborhood "fit" cards (CBS Wijken & Buurten)**
   Demographics, density, etc. This exists in various places, but rarely packaged for *buyers* with "so what?" explanations. ([pdok.nl][5])

6. **Energy label lookup + "upgrade reality"**
   You *can* integrate EP-Online, but it requires an API key and careful caching. Still valuable for first buyers' running costs. ([RVO.nl][6])

### Tier C — don't attempt in MVP (either not open or you'll get wrecked legally/operationally)

7. **Accurate valuation / "fair price" / winning bid strategy**
   Without paid transaction data, lender data, and strong models, you'll be wrong and you'll lose trust.

8. **Full "permit/renovation" certainty at address level**
   Municipal permits are fragmented; doable later per-city, but too messy for MVP if you want nationwide.

9. **Listings replacement / Funda killer**
   Not with open data. Period.

---

## 2. Product goal

Help expats and first-time buyers **avoid bad purchases and choose the right neighborhood/home** by generating an **instant, evidence-backed address dossier** with **3D context** and **risk cards**.

## 3. Target users

* **Expats**: limited Dutch knowledge, high uncertainty, high regret risk.
* **First-time buyers**: overwhelmed by tradeoffs; need structure and confidence.

## 4. Core user journey (MVP)

1. User pastes **address** (or postcode + house number).
2. App generates:

   * **Building facts** (BAG)
   * **3D block view + sunlight & shadow analysis** (3DBAG + SunCalc)
   * **Livability risk cards** (noise, air, climate stress, sunlight)
   * **Neighborhood snapshot** (CBS)
   * *If available:* **Energy label** (EP-Online) — Tier B
3. User explores **3D shadow timeline**: drags time slider to see how shadows fall on the property at different times of day and seasons.
4. User saves to a **Shortlist**, compares up to **3 homes**, exports a **PDF "Viewing Briefing"**.
5. At viewing: user opens "**Questions to ask**" checklist auto-generated from detected risks.

## 5. MVP feature set (must ship)

### F1 — Address resolution + building facts

* Input: postcode + house number (optionals: letter/toevoeging)
* Output: point geometry, building footprint, construction year (if present), building status, etc. (BAG)

### F2 — 3D neighborhood viewer (forge3d) + sunlight & shadow simulation

* Render: surrounding buildings within radius (e.g., 250m)
* Camera presets: street level, balcony level, top-down
* Overlay toggles: noise, air quality, climate layer

**F2a — Interactive shadow timeline**

* Time-of-day slider: user drags to see how shadows move across the block throughout the day
* Date picker with presets: winter solstice (worst case), summer solstice (best case), spring/autumn equinox
* Sun position calculated from geographic coordinates + date/time (SunCalc algorithm — no external API needed)
* Shadows rendered in real-time on the existing 3D building geometry using directional light matching sun azimuth/altitude
* Answers: *"Is this ground-floor apartment dark by 3pm?" "Does the balcony get afternoon sun?"*

**F2b — Static shadow snapshots**

* Pre-rendered shadow views for key moments: morning (9:00), noon (12:00), evening (17:00)
* Default date: December 21 (winter solstice — worst-case daylight)
* Used in the PDF "Viewing Briefing" export and as fallback for low-powered devices
* Three images per address, generated server-side or cached from first interactive render

**F2c — Annual sunlight analysis**

* Calculate estimated direct sunlight hours per day/year for the target address point
* Factor in surrounding building geometry to detect obstruction (canyon effect)
* Output: sunlight score (e.g., "This balcony gets ~2.1 hours of direct sun in December, ~8.4 hours in June")
* Present as a risk card: low/med/high sunlight rating with seasonal breakdown
* Answers: *"Is this home livable in winter or will I need SAD lamps?"*

### F3 — Risk cards (the differentiator)

Each card shows:

* **Score/level** (low/med/high)
* **What it means** (plain EN/NL)
* **What to ask / check** at viewing
* **Source + date**

Cards in MVP:

* Road traffic noise (Lden) (RIVM/Atlas Leefomgeving WMS + ZIP)
* PM2.5 / NO2 (GCN) (RIVM WMS/WCS + ZIP)
* Climate stress (water nuisance / heat) (Klimaateffectatlas WMS/WFS)
* Sunlight exposure (computed from 3D geometry + SunCalc — see F2c)

### F4 — Neighborhood snapshot

* Pull CBS buurt/wijk stats for the location
* Present 5-8 indicators max (no dashboard spam)

### F5 — Shortlist + Compare + Export

* Shortlist items store the resolved address + cached indicators
* Compare 2-3 homes side by side
* Export PDF "Viewing Briefing" (1-2 pages)

### Tier B — optional features (ship if time allows)

#### F6 — Crime level card (Tier B)

* Sources: CBS OData 47018NED (yearly) and 47022NED (monthly)
* Present as crimes per 1,000 residents; sub-cards: burglary, violent crime
* Mandatory disclaimers about registered vs. total crime

#### F7 — Energy label lookup (Tier B)

* EP-Online API v5 (API key required); cache and rate-limit
* Useful for running costs and "upgrade reality" scenarios

## 6. Out of scope (explicit)

* Listings ingestion/scraping
* Automated valuation / fair-price estimates / bidding recommendations
* Permit certainty nationwide
* Foundation condition certainty (only subsidence/soil proxies later)
* User accounts or social features in MVP

---

## 7. Success metrics

Define these before launch. Track outcomes, not outputs.

### Primary metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Dossier generation success rate | > 95% of valid NL addresses | % of address inputs that return a complete dossier (all must-ship cards populated) |
| Time to dossier | < 5 seconds | p95 latency from address submission to full dossier render (excluding 3D viewer) |
| PDF export completion | > 80% of shortlisted homes | % of shortlisted addresses where user generates a Viewing Briefing PDF |
| Return usage | > 30% within 14 days | % of users who generate a second dossier within 2 weeks |

### Guardrail metrics

| Metric | Threshold | Why it matters |
|--------|-----------|----------------|
| Data source error rate | < 5% of requests | If external APIs fail too often, dossier quality degrades |
| 3D viewer load time | < 8 seconds on 4G | Slow 3D kills mobile experience |
| Risk card accuracy complaints | < 1% of users report "this seems wrong" | Indicative data must still feel trustworthy |

### Per-feature acceptance signals

- **F1:** Address resolves to correct BAG object for 99%+ of valid postcode+huisnummer inputs
- **F2:** 3D viewer renders surrounding buildings within 250m; shadow timeline responds to slider input with < 500ms latency
- **F3:** Each risk card displays score, explanation, viewing questions, and source. Thresholds match official Dutch guidelines where applicable
- **F4:** Neighborhood snapshot shows 5-8 CBS indicators with EN/NL labels
- **F5:** User can save 3 homes, compare side-by-side, and export a 1-2 page PDF

---

## 8. Data sources & ingestion

### Overview matrix

| Need / Feature | Dataset | Coverage | Access type | Endpoint / File | Update | License / Notes |
|---|---|---:|---|---|---|---|
| Address → geometry + building objects | **BAG (Kadaster) OGC API** | NL | OGC API Features | Base: `https://api.pdok.nl/kadaster/bag/ogc/v2` ([api.pdok.nl][1]) | Continuous | Public service; cache aggressively |
| 3D buildings around address | **3DBAG** | NL | 3D API + downloads | Base: `https://api.3dbag.nl/` ([docs.3dbag.nl][2]) | Periodic releases | Open data; multiple LoDs |
| 3D tiles alternative / basemap 3D | **Kadaster 3D Basisvoorziening** | NL | OGC API + 3D Tiles | OGC API + 3D Tiles ([Kadaster][7]) | Periodic | Scalable web rendering |
| Sunlight & shadow simulation | **SunCalc algorithm + 3D geometry** | NL | Computed client-side | No external endpoint. Sun position from SunCalc (lat/lon/date/time). Obstruction from 3DBAG geometry. | Real-time | Public domain algorithm |
| Neighborhood polygons + stats | **CBS Wijken & Buurten 2024 OGC API** | NL | OGC API Features | Base: `https://api.pdok.nl/cbs/wijken-en-buurten-2024/ogc/v1` ([api.pdok.nl][8]) | Annual | Official CBS via PDOK |
| Road traffic noise (Lden) | **RIVM / Atlas Leefomgeving noise** | NL | WMS + ZIP | WMS: `https://data.rivm.nl/geo/alo/wms?request=GetCapabilities` + ZIPs on data.overheid ([data.overheid.nl][3]) | Periodic | Indicative; show disclaimer |
| Air quality PM2.5 / NO2 | **RIVM GCN** | NL | WMS/WCS + ZIP | WMS: `https://data.rivm.nl/geo/gcn/wms?request=GetCapabilities` WCS: `…/wcs?request=GetCapabilities` ([data.overheid.nl][9]) | Annual + scenarios | Public domain |
| Climate stress layers | **Klimaateffectatlas** | NL | WMS/WFS (GeoServer) | WMS/WFS: `https://maps1.klimaatatlas.net/geoserver/ows` ([klimaateffectatlas.nl][4]) | Periodic | CC BY 4.0 attribution required |
| Energy label lookup | **EP-Online Public API v5** | NL | REST (API key) + bulk | `https://public.ep-online.nl/api/v5/PandEnergielabel/Adres` ([RVO.nl][6]) | Daily mut., monthly full | Needs API key; cache + rate-limit |
| Crime statistics | **CBS OData** | NL | OData API | `https://dataderden.cbs.nl/ODataApi/OData/47018NED` ([data.overheid.nl][13]) | Annual (yearly table), monthly | Official CBS; privacy suppression applies |

### Integration details per source

#### A) BAG — address + building backbone

* **Base**: `https://api.pdok.nl/kadaster/bag/ogc/v2` ([api.pdok.nl][1])
* Key calls:
  * `GET /collections` (discover collection IDs)
  * `GET /collections/{collectionId}/items?bbox=…` (fetch surrounding objects)
  * `GET /collections/{collectionId}/items/{id}` (single object fetch)

#### B) 3D buildings

Recommended for MVP: 3DBAG API. Kadaster 3D Basisvoorziening as scale-friendly alternative.

**Path B1 (recommended): 3DBAG API**

* **Base**: `https://api.3dbag.nl/` ([docs.3dbag.nl][2])
* API docs at `/api.html` — use bbox query endpoints to fetch 3D geometry around an address

**Path B2 (scale-friendly): Kadaster 3D Basisvoorziening**

* **3D Tiles** for rendering + OGC API for selection where needed ([Kadaster][7])

#### C) Noise — road traffic Lden

* **WMS**: `https://data.rivm.nl/geo/alo/wms?request=GetCapabilities` ([data.overheid.nl][3])
* Optional offline ingestion: ZIP from data.overheid listing (2020/2022) ([data.overheid.nl][3])

#### D) Air quality — GCN (PM2.5, NO2)

* **WMS**: `https://data.rivm.nl/geo/gcn/wms?request=GetCapabilities` ([data.overheid.nl][9])
* **WCS**: `https://data.rivm.nl/geo/gcn/wcs?request=GetCapabilities` ([data.overheid.nl][9])
* **ZIP** per year/substance from RIVM download page ([RIVM][10])

#### E) Climate stress

* **WMS**: `https://maps1.klimaatatlas.net/geoserver/ows?request=GetCapabilities&service=WMS&version=1.3.0` ([maps1.klimaatatlas.net][11])
* **WFS**: `https://maps1.klimaatatlas.net/geoserver/ows?request=GetCapabilities&service=WFS&version=2.0.0` ([maps1.klimaatatlas.net][12])
* Limit to top 10 buyer-relevant layers only.

#### F) Neighborhood stats

* **Base**: `https://api.pdok.nl/cbs/wijken-en-buurten-2024/ogc/v1` ([api.pdok.nl][8])
* Key calls:
  * `GET /collections/buurten/items?bbox=…` then point-in-polygon in server, or
  * `GET /collections/buurten/items/{id}` for cached lookups

#### G) Energy label (Tier B)

* **Energy label by address**: `https://public.ep-online.nl/api/v5/PandEnergielabel/Adres?postcode=…&huisnummer=…` ([RVO.nl][6])
* **Bulk file discovery**: `https://public.ep-online.nl/api/v5/Mutatiebestand/DownloadInfo` ([RVO.nl][6])
* Requires API key; cache and rate-limit.

#### H) Crime statistics (Tier B)

* **User value**: Expats and first-time buyers routinely ask "is this area safe?" The app provides a consistent, sourced, comparable view per address.
* **Yearly data**: `https://dataderden.cbs.nl/ODataApi/OData/47018NED` (table 47018NED) ([data.overheid.nl][13])
* **Monthly data**: `https://dataderden.cbs.nl/ODataApi/OData/47022NED` (table 47022NED)
* **Nuisance — optional later**: `https://dataderden.cbs.nl/ODataApi/OData/47024NED` (table 47024NED)

**Presentation rules:**

* Show a single "Crime level (last 12 months)" card
* Primary indicator: total registered crimes per 1,000 residents (computed using CBS `aantal_inwoners` from F4 neighborhood snapshot)
* Two sub-cards only: burglary/break-ins (property-relevant), violent crime (perceived safety)
* Optional later: nuisance incidents — only if data is reliable and does not overwhelm

**Mandatory disclaimers:**

* "Registered crimes ≠ total crime; reporting and registration vary."
* "Use as screening context, not a prediction."
* "Small-area data may be suppressed for privacy for some categories."

---

## 9. MVP architecture

### Backend
* **Framework**: FastAPI (Python) + PostGIS
* **Caching**: Redis for API response caching. BAG results cached 24h. WMS/WCS raster samples cached 7 days. CBS stats cached until next annual release.
* **Error handling**: Graceful degradation — if a data source is unavailable, the dossier still renders with that card showing "Data temporarily unavailable." Never block the entire dossier for one failed source.

### Data ingestion
* **Scheduled jobs**: Noise raster ZIPs, air quality ZIPs, CBS annual stats — ingested on release, stored in PostGIS
* **On-demand**: WMS/WCS sampling for climate stress layers, with response caching
* **Real-time**: BAG address lookups, EP-Online energy labels — proxied with caching

### API serving
* **Vector data**: Custom JSON REST API
* **Raster data**: Pre-sampled values stored per-address, or on-the-fly WMS proxy with caching

### Client
* **Platform**: Web-first (mobile responsive). React + TypeScript.
* **Mobile**: React Native wrapper — post-MVP
* **3D rendering**: Three.js or deck.gl for the neighborhood viewer
* **Shadow simulation**: Directional light positioned via SunCalc algorithm. Shadow maps for interactive timeline (F2a). Server-side headless GL render for static snapshots (F2b). Raycast-based obstruction sampling for annual analysis (F2c).
* **Internationalization**: EN/NL from day one. All user-facing strings in i18n files.

---

## 10. Performance & quality requirements

| Requirement | Target | Notes |
|-------------|--------|-------|
| Address resolution | < 1 second | BAG API response + geocoding |
| Dossier generation (all cards) | < 5 seconds | Excluding 3D viewer initial load |
| 3D viewer initial render | < 8 seconds on 4G | 250m radius building geometry |
| Shadow timeline interaction | < 500ms per slider step | Client-side computation |
| PDF export | < 10 seconds | Including shadow snapshot generation |
| Concurrent users | 100 simultaneous dossier requests | MVP target; scale later |
| Uptime | 99% (excl. scheduled maintenance) | External API failures handled via graceful degradation |

---

## 11. Privacy & legal

* **No personal data collected in MVP.** The app processes addresses (public data) and generates dossiers. No user accounts, no tracking, no cookies beyond session.
* **GDPR:** No PII stored server-side in MVP. If user accounts are added later, full GDPR compliance (consent, right to deletion, DPO) is required.
* **Data attribution:** Klimaateffectatlas requires CC BY 4.0 attribution. All data source attributions displayed in the dossier footer and PDF export.
* **Disclaimers:** All environmental, noise, air quality, and crime data is presented as indicative. The app does not provide professional advice. Disclaimer text shown on every dossier and PDF.
* **API terms of service:** BAG/PDOK, RIVM, CBS, and Klimaateffectatlas are public services. Respect rate limits, cache aggressively, and do not scrape. EP-Online requires an API key with separate terms.

---

## 12. Risks & mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| External API downtime (BAG, RIVM, CBS) | Medium | High — dossier incomplete | Graceful degradation per card. Cache responses. Show "data unavailable" not an error screen. |
| Rate limiting by PDOK/RIVM | Medium | Medium — slow responses | Aggressive caching (Redis). Batch requests where possible. Pre-ingest static datasets. |
| 3D geometry missing for address | Low | Medium — no 3D view | Fall back to 2D map view with building footprint from BAG. |
| Inaccurate risk thresholds | Medium | High — user trust | Use official Dutch guidelines for threshold values (e.g., WHO for air quality, EU Lden limits for noise). Document sources. |
| Data staleness | Low | Medium | Display data date on every card. Scheduled ingestion jobs refresh on source release cycles. |
| Mobile performance for 3D viewer | High | Medium — poor UX on phones | Static shadow snapshots (F2b) as fallback. Progressive loading. Reduce geometry detail (LoD1 vs LoD2). |
| EP-Online API key revocation | Low | Low — Tier B feature | Energy label is optional in MVP. Degrade gracefully. |

---

## 13. Why this can win

You win if the product feels like:

> "I paste an address and instantly know what could ruin my life there — and what to verify at the viewing."

That's *not* what Funda is built to do.

---

[1]: https://api.pdok.nl/kadaster/bag/ogc/v2 "Basisregistratie Adressen en Gebouwen (OGC API)"
[2]: https://docs.3dbag.nl/en/delivery/webservices/ "Webservices - 3DBAG"
[3]: https://data.overheid.nl/dataset/5589-geluid-in-nederland-van-wegverkeer--lden- "Geluid van wegverkeer (Lden) | Data overheid"
[4]: https://www.klimaateffectatlas.nl/nl/faq "FAQ"
[5]: https://www.pdok.nl/ogc-apis/-/article/cbs-wijken-en-buurten "CBS Wijken en Buurten - (OGC) API's"
[6]: https://www.rvo.nl/sites/default/files/2025-02/handleiding-ep-online-opvragen-van-bestanden.pdf "Handleiding EP-online.nl Opvragen van bestanden (handmatig en automatisch)  versie 1.0 2025"
[7]: https://www.kadaster.nl/zakelijk/producten/geo-informatie/3d-producten/3d-basisvoorziening "3D Basisvoorziening | download kosteloos"
[8]: https://api.pdok.nl/cbs/wijken-en-buurten-2024/ogc/v1 "CBS Wijken en Buurten 2024 (OGC API)"
[9]: https://data.overheid.nl/dataset/65786-fijnstof--pm2-5--grootschalige-concentratiekaarten-nederland--inspire-as-is-dataset- "Fijnstof (PM2.5) Grootschalige concentratiekaarten Nederland (INSPIRE as-is Dataset) | Data overheid"
[10]: https://www.rivm.nl/gcn-gdn-kaarten/concentratiekaarten/downloaden "GCN concentratiekaarten downloaden | RIVM"
[11]: https://maps1.klimaatatlas.net/geoserver/ows?request=GetCapabilities&service=wms&version=1.3.0 "Klimaateffectatlas WMS"
[12]: https://maps1.klimaatatlas.net/geoserver/ows?request=GetCapabilities&service=WFS&version=2.0.0 "Klimaateffectatlas WFS"
[13]: https://data.overheid.nl/en/dataset/5252-geregistreerde-misdrijven--soort-misdrijf--wijk--buurt--jaarcijfers "Geregistreerde misdrijven per wijk/buurt | Data overheid"