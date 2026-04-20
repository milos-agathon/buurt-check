# Buurt-check Data Sources and Attribution

_Last updated: 20 April 2026_

Buurt-check may use a combination of proprietary logic, geospatial processing, public/open datasets, third-party libraries, APIs, and derived indicators to generate reports, maps, scores, and other outputs.

This page exists to:
- distinguish Buurt-check's proprietary product layer from external data sources;
- acknowledge public and third-party data dependencies;
- document attribution expectations; and
- remind contributors and users that underlying source licenses continue to apply.

## 1. Important Distinction

The following are **not the same thing**:

### Buurt-check proprietary layer
This includes, where applicable:
- application code;
- product design and UX;
- report structure and dossier layout;
- scoring logic, weighting, normalization, and interpretation methods;
- derived visualizations;
- copy, branding, and presentation format; and
- any proprietary transformations or product logic developed for Buurt-check.

These elements are proprietary and governed by the repository license and product terms.

### External sources
Underlying datasets, APIs, libraries, basemaps, and reference materials may be subject to separate licenses and attribution rules. Their inclusion or use in Buurt-check does **not** transfer ownership to Buurt-check and does **not** remove any original license obligations.

## 2. Categories of Sources That May Be Used

Depending on the feature, Buurt-check may use sources such as:
- Dutch government open data portals;
- municipal, provincial, and national geospatial datasets;
- environmental and climate-related public datasets;
- cadastral and building-related datasets where permitted;
- air quality, noise, mobility, sunlight, flood, heat, vegetation, and livability-related sources;
- geocoding, routing, mapping, elevation, and satellite-derived layers;
- open-source software libraries and frameworks;
- payment, hosting, analytics, and infrastructure providers for platform operations.

## 3. Source-by-Source Attribution Log

The table below should be updated as the product stack becomes final.

| Source / Provider | Dataset / Service | Purpose in Buurt-check | License / Terms | Attribution Required? | Notes |
|---|---|---|---|---|---|
| To be completed | To be completed | To be completed | To be completed | To be completed | Keep this row updated |

## 4. Contributor Rules

Anyone contributing to Buurt-check must:
- verify the license and usage conditions of every dataset, API, model, library, icon, font, and external asset before use;
- keep required attribution notices intact;
- avoid adding data sources with unclear, restrictive, or incompatible commercial terms unless explicitly approved;
- document new external dependencies in this file; and
- avoid assuming that "public" means "free for any commercial use."

## 5. No Implied Endorsement

Use of third-party data or services does not imply sponsorship, endorsement, certification, or approval by the relevant provider unless explicitly stated.

## 6. Accuracy and Source Limitations

External data may be incomplete, delayed, estimated, interpolated, generalized, or subject to revision. Buurt-check may also derive product outputs from multiple sources, which can introduce additional modeling or interpretation layers.

Users should therefore treat all outputs as informational rather than definitive statements of fact.

## 7. Before Public Launch

Before public launch, this file should be completed with the exact production sources used by the app. At minimum, add:
- source name;
- exact dataset or API name;
- source URL in the repo documentation if desired;
- applicable license or terms name;
- attribution text required by the source;
- whether commercial use is allowed;
- whether sublicensing or redistribution is restricted; and
- whether downstream users must receive separate notice.

## 8. Suggested Working Structure

As the product matures, maintain one row per real dependency, for example:
- source portal;
- exact dataset/service;
- feature it powers;
- commercial-use status;
- attribution text;
- internal owner or reviewer;
- date last checked.

## 9. Contact

If you are a data provider and believe attribution is incomplete or inaccurate, contact: Milos Popovic.
