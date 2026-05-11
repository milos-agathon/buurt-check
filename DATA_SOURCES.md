# Buurt-check Data Sources and Attribution

_Last updated: 7 May 2026_

Buurt-check combines proprietary product logic with public datasets, third-party services, geospatial APIs, software libraries, and operational providers to generate reports, maps, scores, and related outputs.

This file documents the current dependency surface in the codebase so attribution, licensing, and product disclosures stay aligned with the actual stack.

## 1. Scope Separation

These items are related but not interchangeable:

### Repository materials

The repository `LICENSE` governs access to the proprietary source code, bundled assets, documentation, and other repository materials that ship with the codebase.

### Live service use

The Buurt-check Privacy Policy and Terms of Use govern the live website, apps, reports, purchases, and buyer-facing use of the service.

### Third-party data and software

Underlying datasets, APIs, libraries, basemaps, and platforms remain subject to their own licenses, terms, and attribution requirements. Their inclusion in Buurt-check does not transfer ownership to Buurt-check and does not remove the original notice obligations.

## 2. Current Data and Service Dependencies

The table below reflects the sources and providers currently wired into the codebase. Some operational providers are optional and only active when configured in runtime settings.

| Source / provider | Dataset / service | Used for in Buurt-check | Attribution / terms posture | Current repo touchpoints |
|---|---|---|---|---|
| PDOK / Kadaster | Locatieserver Search API | Address autocomplete and lookup | Public service terms; product copy should keep PDOK or Kadaster attribution where surfaced | `backend/app/config.py`, `backend/app/services/locatieserver.py` |
| PDOK / Kadaster | BAG WFS v2.0 | Official building and address facts | Public Dutch registry data; user-facing copy should cite BAG / Kadaster | `backend/app/config.py`, `backend/app/services/bag.py` |
| 3DBAG | 3DBAG API | 3D building geometry and neighborhood context | Third-party open dataset; product copy should keep 3DBAG attribution | `backend/app/config.py`, `backend/app/services/three_d_bag.py`, `frontend/src/i18n/*.json` |
| RIVM | ALO WMS and GCN WMS | Noise and air-quality risk cards | Public environmental data; product copy should keep RIVM attribution and source dates | `backend/app/config.py`, `backend/app/services/risk_cards.py` |
| Klimaateffectatlas | Geoserver OWS and layers index | Heat stress, water nuisance, flood, and subsidence context | Public climate data; product copy should keep Klimaateffectatlas attribution | `backend/app/config.py`, `backend/app/services/risk_cards.py`, `backend/app/services/foundation_risk.py` |
| Leefbaarometer | Leefbaarometer 3 WFS | Livability scoring and trend context | Third-party public service; product copy should keep Leefbaarometer attribution | `backend/app/config.py`, `backend/app/services/leefbaarometer.py` |
| KOOP / officielebekendmakingen.nl | Official publications SRU 1.2 | Pre-bid source briefing public-notice checks | Public official-publication search; store minimized source references and disclose query limitations | `backend/app/config.py`, `backend/app/services/source_connectors/official_publications.py` |
| PDOK / Kadaster | Kadastrale kaart WFS v5.0 | Cadastral parcel context in the paid pre-bid pack source appendix | Public geodata; does not confirm ownership or apartment rights | `backend/app/config.py`, `backend/app/services/source_connectors/pdok_sources.py` |
| PDOK / Kadaster | BRK-PB / WKPB WFS v1.0 | Public-law restriction context in the paid pre-bid pack source appendix | Public geodata needing notarial or municipal interpretation | `backend/app/config.py`, `backend/app/services/source_connectors/pdok_sources.py` |
| RCE / PDOK | Beschermde gebieden cultuurhistorie WFS v1.0 | Monument and protected-view context in the paid pre-bid pack source appendix | Public heritage geodata; contours may be approximate and need authority checks | `backend/app/config.py`, `backend/app/services/source_connectors/pdok_sources.py` |
| RVO / EP-Online | EP-Online API v5 | Planned P1 energy-label context when the API key and query are configured | API-key required; not checked unless explicitly enabled and validated | `backend/app/config.py`, `backend/app/services/source_connectors/ep_online.py` |
| RDW / Nationaal Parkeer Register | RDW/NPR open parking data | Parking context in the paid pre-bid pack source appendix | Public parking data does not answer address-specific permit rights or waiting lists | `backend/app/config.py`, `backend/app/services/source_connectors/rdw_parking.py` |
| PDOK / BRO | Bodemkundigevlakkenkaart WFS | Soil-type and foundation-risk context | Public ground-data service; product copy should keep PDOK / BRO attribution | `backend/app/config.py`, `backend/app/services/foundation_risk.py` |
| PDOK / Kadaster | Luchtfoto RGB WMS | Aerial imagery in maps and viewer surfaces | Code comments identify CC BY 4.0; current UI already cites PDOK / Kadaster | `backend/app/config.py`, `frontend/src/components/BuildingFootprintMap.tsx`, `frontend/src/components/NeighborhoodViewer3D.tsx` |
| PDOK / Kadaster | BRT Achtergrondkaart WMS | Background map layer in map and viewer surfaces | Code comments identify CC BY 4.0; keep PDOK / Kadaster attribution when shown | `backend/app/config.py`, `frontend/src/components/NeighborhoodViewer3D.tsx` |
| European Commission JRC | PVGIS TMY API | Weather and solar-climatology support data | Provider terms apply; not all outputs surface it directly | `backend/app/config.py`, `backend/app/services/weather.py` |
| SunCalc | `suncalc` client library | Sun-position and shadow calculations in the viewer | Open-source library under its own license; current UI cites SunCalc alongside 3DBAG | `frontend/src/components/NeighborhoodViewer3D.tsx`, `frontend/src/i18n/*.json` |
| Stripe | Stripe Checkout | Web purchase flow for the paid full dossier | Provider terms apply; operational billing dependency, not source data | `backend/app/api/billing.py`, `frontend/src/services/api.ts` |
| Google Play | Google Play Billing | Android purchase validation for the paid full dossier | Provider terms apply; operational billing dependency, not source data | `backend/app/api/billing.py`, `backend/app/services/google_play.py`, `frontend/src/services/playBilling.ts` |
| Apple | App Store billing and related verification services | iPhone purchase validation for the paid full dossier | Provider terms apply; operational billing dependency, not source data | `backend/app/api/billing.py`, `backend/app/services/apple_app_store.py`, `frontend/src/services/appleBilling.ts` |
| Google | Google Analytics 4 (optional) | Consent-gated website and web-app analytics | Provider terms apply; only intended for consented analytics, with ad-related storage denied | `landing/*.html`, `frontend/src/services/analytics.ts`, `public/analytics-consent.js` |
| Sentry | Error monitoring (optional) | Diagnostics and reliability monitoring when configured | Provider terms apply; only active when DSNs are configured | `frontend/src/services/sentry.ts`, `backend/app/sentry_setup.py` |

## 3. Product Attribution Guidance

The current product already surfaces several source notices directly in the UI and exports, including:
- BAG for building facts;
- PDOK / Kadaster for aerial imagery and mapping layers;
- 3DBAG + SunCalc for 3D and shadow features;
- RIVM for air quality and noise cards;
- Leefbaarometer for livability.

When a feature consumes third-party data, keep the source name and source date visible wherever the product contract expects them.

## 4. Contributor Rules

Anyone contributing to Buurt-check must:
- verify the license and usage conditions of every dataset, API, model, library, font, icon, and external asset before use;
- keep required attribution notices intact in product copy, exports, or documentation;
- avoid adding sources with unclear, restrictive, or commercially incompatible terms unless explicitly approved;
- update this file whenever a new external dependency is introduced or an old one is removed; and
- avoid assuming that "public" automatically means unrestricted commercial reuse.

## 5. No Implied Endorsement

Use of third-party data or services does not imply sponsorship, endorsement, certification, or approval by the relevant provider unless explicitly stated.

## 6. Accuracy and Source Limitations

External data may be incomplete, delayed, estimated, interpolated, generalized, or subject to revision. Buurt-check also derives product outputs from multiple sources, which can introduce additional normalization, weighting, modeling, or interpretation layers.

Users should therefore treat all outputs as informational rather than definitive statements of fact.

Buurt-check does not scrape, parse, store, or imply affiliation with Funda listings. Public source providers and payment platforms do not sponsor, certify, or endorse Buurt-check unless a separate written agreement says so.

## 7. Maintenance Rules

Before merging a change that adds or changes an external source, update this file with:
- the provider name;
- the exact dataset, API, or service name;
- what feature it powers;
- the attribution text or notice requirement if known;
- any commercial-use or redistribution constraint that affects the product; and
- the code path or owner responsible for the integration.

## 8. Contact

If you are a data provider and believe attribution is incomplete or inaccurate, contact `support@buurt-check.nl`.
