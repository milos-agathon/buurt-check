# Contract: Match-First API

All endpoints are under the existing `/api` prefix. Responses contain stable keys and codes, never translated copy. Canonical geometry and building request bounds use EPSG:28992 (RD New). WGS84 values are derived display coordinates and are named with `display_*_wgs84`.

## Common Operation Rules

Every task generated from this contract must preserve these method-level rules.

| Endpoint | Stable success codes | Stable error codes | Retry | Idempotency | Cacheability |
| --- | --- | --- | --- | --- | --- |
| `POST /api/match/sessions` | `201` | `match.session.create_failed`, `match.warning.invalid_locale` | Safe to retry with the same `client_request_id`. | Same `client_request_id` and anonymous browser context should return or resume the same active session when possible. | `no-store` |
| `GET /api/match/sessions/{session_id}` | `200` | `match.session.not_found`, `match.session.expired`, `match.session.deleted` | Safe. | Read-only. | `no-store` |
| `PATCH /api/match/sessions/{session_id}/answers` | `200` | `match.warning.invalid_answer_value`, `match.warning.too_many_answers`, `match.warning.protected_answer_not_allowed`, `match.warning.answers_incomplete`, `match.session.not_found` | Retry latest answer payload only; UI must not advance until success. | Repeating the same answer payload for the same `answer_version` must not duplicate rows or create jobs. | `no-store` |
| `POST /api/match/sessions/{session_id}/preference-extraction` | `200` | `match.warning.preference_extraction_failed`, `match.warning.preference_extraction_unavailable`, `match.warning.custom_preference_needs_clarification`, `match.session.not_found` | Safe if the same `client_request_id` and same submitted text hash are used. | Same `client_request_id` and text hash returns the same structured extraction result where possible. | `no-store`; raw text is not analytics content. |
| `PATCH /api/match/sessions/{session_id}/custom-preferences` | `200` | `match.warning.custom_preference_invalid`, `match.warning.custom_preference_disallowed`, `match.warning.custom_preference_needs_review`, `match.session.not_found` | Retry latest reviewed structured preference payload only. | Replaces the reviewed custom preference set for the current answer version; does not create jobs. | `no-store` |
| `DELETE /api/match/sessions/{session_id}` | `202` | `match.session.not_found`, `match.session.delete_failed` | Safe if previous result is unknown. | Repeating delete for an already deleted session returns accepted or not-found with a stable code. | `no-store` |
| `POST /api/match/sessions/{session_id}/run` | `202` | `match.warning.review_confirmation_required`, `match.warning.answers_incomplete`, `match.warning.preference_vector_stale`, `match.job.already_running`, `match.session.not_found` | Safe with same `preference_vector_version`; do not create multiple active jobs. | Same current vector returns the active job if one already exists. | `no-store` |
| `GET /api/match/sessions/{session_id}/status` | `200` | `match.job.not_found`, `match.session.not_found`, `match.job.expired` | Safe; respect `poll_after_ms`. | Read-only. | `no-store` |
| `GET /api/match/sessions/{session_id}/results` | `200` | `match.results.not_ready`, `match.results.not_found`, `match.results.stale`, `match.session.not_found` | Safe after terminal job state. | Read-only. | `no-store` |
| `PATCH /api/match/sessions/{session_id}/map-state` | `200` | `match.map_state.invalid`, `match.session.not_found` | Optional endpoint; retry latest map state only. | Replaces the latest map state snapshot for the session. | `no-store` |
| `GET /api/match/neighborhoods/{neighborhood_id}` | `200` | `match.neighborhood.not_found`, `match.neighborhood.unavailable` | Safe. | Read-only. | May cache only by `neighborhood_id` and data version; do not cache errors as success. |
| `GET /api/match/neighborhoods/{neighborhood_id}/map-layers` | `200` | `match.map_layer.failed`, `match.neighborhood.not_found` | Safe. | Read-only. | Cache key must include `session_id`, `result_set_id`, `neighborhood_id`, data version, and preference/vector version where relevant. |
| `GET /api/match/neighborhoods/{neighborhood_id}/buildings` | `200` | `match.building_layer.failed`, `match.building_bounds_out_of_scope`, `match.neighborhood.not_found`, `match.building_cursor_invalid` | Safe for the same clipped bounds and cursor. | Read-only. | Cache key must include `session_id`, `result_set_id`, `neighborhood_id`, `bounds_rd` or tile/chunk id, `lod`, `limit`, `cursor`, simplification level, and building data version. Empty/error/fallback responses are not cached as success. |
| `GET /api/match/neighborhoods/{neighborhood_id}/amenities` | `200` | `match.amenity_layer.failed`, `match.neighborhood.not_found` | Safe. | Read-only. | Cache key must include `session_id`, `result_set_id`, `neighborhood_id`, visible amenity keys, preference/vector version, and data version. |
| `POST /api/match/dossier/from-building` | `200` | `match.dossier_bridge.failed`, `match.dossier.invalid_vbo_id`, `match.neighborhood.no_reliable_address`, `match.neighborhood.address_candidate_selection_required`, `match.neighborhood.manual_address_required`, `match.session.not_found` | Safe for same selected building, candidate selection, and return context. | Same selected building/context returns the same resolved route, PDOK-backed server-validated candidate list, manual-required, or unavailable recovery while data version is unchanged. Candidate selection uses the server-side selected-neighborhood candidate set and never trusts client-supplied VBO/address/lookup IDs. | `no-store` |
| `POST /api/match/analytics` | `202` | `match.analytics.invalid_event`, `match.analytics.rejected_payload` | Safe if client supplies an `event_id`. | Same `event_id` is deduplicated. | `no-store` |

Optional note: `PATCH /api/match/sessions/{session_id}/map-state` is not mandatory when route/query context plus `sessionStorage` satisfies supported refresh and Dossier-return cases. If omitted, tasks must explicitly document how the supported context restoration cases pass without it.

## POST /api/match/sessions

Create an anonymous match session.

**Request**

```json
{
  "locale": "en",
  "source": "landing",
  "client_request_id": "landing_start_01J..."
}
```

**Response 201**

```json
{
  "session_id": "match_7f3b2c",
  "locale": "en",
  "phase": "survey_intro",
  "current_step": null,
  "answer_version": 0,
  "expires_at": "2026-05-13T12:00:00Z"
}
```

## GET /api/match/sessions/{session_id}

Return current session, answers, job summary, and route restoration state.

**Response 200**

```json
{
  "session_id": "match_7f3b2c",
  "locale": "en",
  "phase": "survey_question",
  "current_step": 4,
  "answer_version": 3,
  "answers": {
    "intent": "buy",
    "budget": {"buy_min": 45000000, "buy_max": 62500000}
  },
  "custom_preferences": [],
  "preference_vector_id": null,
  "active_job_id": null,
  "selected_neighborhood_id": null,
  "map_state": null,
  "dossier_return_context": null
}
```

## POST /api/match/sessions/{session_id}/preference-extraction

Extract optional additional-preference text into reviewed structured
preferences. This endpoint is an intake adapter, not a scoring endpoint. Raw
text may be processed for extraction, but analytics and persisted telemetry must
store only stable keys, statuses, counts, and reason codes.

**Request**

```json
{
  "text": "I would love to be close to the beach and near a church.",
  "locale": "en",
  "answer_version": 4,
  "client_request_id": "extract_01J..."
}
```

**Response 200**

```json
{
  "session_id": "match_7f3b2c",
  "answer_version": 4,
  "extraction_version": "cpe_v1",
  "needs_review": true,
  "extracted_preferences": [
    {
      "custom_preference_id": "cp_01J_beach",
      "preference_key": "coast_or_beach_proximity",
      "status": "scoreable",
      "review_state": "pending",
      "privacy_class": "ordinary_preference",
      "source_support": "official_source_available",
      "label_key": "matchFirst.customPreferences.coastOrBeachProximity",
      "reason_code": "match.customPreference.scoreable_source_available",
      "source_refs": ["coast_distance_source"]
    },
    {
      "custom_preference_id": "cp_01J_worship",
      "preference_key": "place_of_worship_proximity",
      "status": "map_context_only",
      "review_state": "pending",
      "privacy_class": "sensitive_possible",
      "source_support": "map_context_available",
      "label_key": "matchFirst.customPreferences.placeOfWorshipProximity",
      "reason_code": "match.customPreference.map_context_only_sensitive_possible",
      "source_refs": ["official_amenity_source"]
    }
  ],
  "clarification": null,
  "warnings": []
}
```

If the text implies demographic similarity, protected traits, or unsupported
religious identity inference, return a structured disallowed item instead of
scoring it:

```json
{
  "session_id": "match_7f3b2c",
  "answer_version": 4,
  "extraction_version": "cpe_v1",
  "needs_review": true,
  "extracted_preferences": [
    {
      "custom_preference_id": "cp_01J_people_like_me",
      "preference_key": "demographic_similarity_request",
      "status": "disallowed",
      "review_state": "pending",
      "privacy_class": "disallowed_sensitive",
      "source_support": "blocked",
      "label_key": "matchFirst.customPreferences.demographicSimilarityRequest",
      "reason_code": "match.customPreference.disallowed_protected_trait_proxy",
      "source_refs": []
    }
  ],
  "clarification": null,
  "warnings": ["match.warning.custom_preference_disallowed"]
}
```

## PATCH /api/match/sessions/{session_id}/custom-preferences

Persist the user's review decisions for extracted preferences. Only accepted
registry-approved `scoreable` preferences can become score inputs; accepted
`map_context_only` preferences may affect map context/explanations only.

**Request**

```json
{
  "answer_version": 4,
  "custom_preferences": [
    {
      "custom_preference_id": "cp_01J_beach",
      "preference_key": "coast_or_beach_proximity",
      "status": "scoreable",
      "review_state": "accepted"
    },
    {
      "custom_preference_id": "cp_01J_worship",
      "preference_key": "place_of_worship_proximity",
      "status": "map_context_only",
      "review_state": "accepted"
    }
  ]
}
```

**Response 200**

```json
{
  "session_id": "match_7f3b2c",
  "answer_version": 4,
  "custom_preference_version": "cpv_4_17a9",
  "custom_preferences": [
    {
      "preference_key": "coast_or_beach_proximity",
      "status": "scoreable",
      "review_state": "accepted"
    },
    {
      "preference_key": "place_of_worship_proximity",
      "status": "map_context_only",
      "review_state": "accepted"
    }
  ],
  "stale_results": true
}
```

## PATCH /api/match/sessions/{session_id}/answers

Persist one or more stable survey answers.

**Request**

```json
{
  "answers": {
    "household_type": "family",
    "lifestyle_priorities": ["green_space", "schools_childcare", "public_transport"]
  },
  "current_step": 6,
  "locale": "nl"
}
```

**Response 200**

```json
{
  "session_id": "match_7f3b2c",
  "answer_version": 4,
  "is_complete": false,
  "validation": {
    "household_type": {"valid": true, "required": true, "error_code": null},
    "lifestyle_priorities": {"valid": true, "required": true, "error_code": null}
  },
  "stale_results": true
}
```

## DELETE /api/match/sessions/{session_id}

Request deletion of anonymous match-session data where supported by current retention rules.

**Response 202**

```json
{
  "session_id": "match_7f3b2c",
  "delete_requested": true,
  "deleted_at": "2026-05-12T13:30:00Z"
}
```

If deletion cannot complete immediately, return a stable error or partial code and document the retention limit in traceability; do not mark anonymous data deletion pass without evidence.

## POST /api/match/sessions/{session_id}/run

Create the preference vector from current answers and start a pollable match job. This endpoint is called only from the review screen's final CTA. The backend rejects calls that do not explicitly identify `source: "review_final_cta"` or whose submitted `preference_vector_version` does not match the current session vector.

**Request**

```json
{
  "preference_vector_version": "pv_v1_8df64199c112",
  "source": "review_final_cta"
}
```

**Response 202**

```json
{
  "session_id": "match_7f3b2c",
  "job_id": "match_job_a91f",
  "status": "queued",
  "stage": "queued",
  "progress": 5,
  "message_key": "matchFirst.progress.queued",
  "preference_vector_id": "pv_8df64199c112",
  "poll_after_ms": 1000
}
```

**Response 409**

```json
{
  "detail": "match.warning.answers_incomplete",
  "invalid_questions": ["budget", "anchor_location"]
}
```

If the run request did not originate from the final review CTA:

```json
{
  "detail": "match.warning.review_confirmation_required"
}
```

If the displayed review is stale relative to the current backend vector:

```json
{
  "detail": "match.warning.preference_vector_stale"
}
```

## GET /api/match/sessions/{session_id}/status

Poll current job status.

**Response 200**

```json
{
  "session_id": "match_7f3b2c",
  "job_id": "match_job_a91f",
  "status": "running",
  "stage": "scoring_tradeoffs",
  "progress": 74,
  "message_key": "matchFirst.progress.scoring_tradeoffs",
  "model_mode": "weighted_scoring",
  "scoring_version": "match-score-v1",
  "evaluation_status": "not_validated_no_labels",
  "fallback_used": false,
  "result_set_id": null,
  "updated_at": "2026-05-12T13:22:14Z"
}
```

Terminal completed response:

```json
{
  "session_id": "match_7f3b2c",
  "job_id": "match_job_a91f",
  "status": "completed",
  "stage": "completed",
  "progress": 100,
  "message_key": "matchFirst.progress.completed",
  "model_mode": "weighted_scoring",
  "scoring_version": "match-score-v1",
  "evaluation_status": "not_validated_no_labels",
  "fallback_used": false,
  "result_set_id": "mrs_0b1e",
  "updated_at": "2026-05-12T13:22:16Z"
}
```

## GET /api/match/sessions/{session_id}/results

Return the completed result set. Returns 409 if the job is still running and 404 if no completed result exists.

**Response 200**

```json
{
  "session_id": "match_7f3b2c",
  "job_id": "match_job_a91f",
  "result_set_id": "mrs_0b1e",
  "preference_vector_version": "pv_v1_8df64199c112",
  "custom_preference_version": "cpv_4_17a9",
  "status": "completed",
  "generated_at": "2026-05-12T13:22:16Z",
  "runtime_ms": 1840,
  "model_mode": "weighted_scoring",
  "model_version": "match-score-v1",
  "scoring_version": "match-score-v1",
  "data_version": "match-seed-2026-05-12",
  "evaluation_status": "not_validated_no_labels",
  "predictive_probability_available": false,
  "fallback_used": false,
  "normal_recommendation_count": 1,
  "candidate_count": 25,
  "scored_candidate_count": 25,
  "ranked_results": [
    {
      "rank": 1,
      "recommendation_id": "rec_pv_8df64199c112_nh_ams_01",
      "neighborhood_id": "nh_ams_01",
      "name": "Oostelijke Eilanden",
      "municipality": "Amsterdam",
      "fit_score": 84,
      "fit_label_key": "matchFirst.results.fitLabel.strong",
      "category": "top",
      "eligibility_status": "eligible",
      "confidence": {
        "score": 72,
        "level": "medium",
        "reasons": ["match.results.confidence.mock_source_data"]
      },
      "reason_codes": ["green_access_match", "mobility_match"],
      "tradeoffs": ["review_source_limitations"],
      "component_scores": {
        "lifestyle": 86,
        "housing_availability": 68,
        "budget_realism": 73,
        "commute_feasibility": 90
      },
      "matched_custom_preferences": [
        {
          "preference_key": "coast_or_beach_proximity",
          "status": "scoreable",
          "reason_code": "match.customPreference.scoreable_source_available"
        },
        {
          "preference_key": "place_of_worship_proximity",
          "status": "map_context_only",
          "reason_code": "match.customPreference.map_context_only_sensitive_possible"
        }
      ],
      "failed_filters": [],
      "source_refs": ["seed_match_source"],
      "limitations": ["match.results.limitations.mock_data"],
      "freshness_status": "mock",
      "geometry_ref": {
        "centroid_rd": {"x": 123456.0, "y": 487654.0},
        "bounds_rd": [122900.0, 487100.0, 124200.0, 488300.0],
        "display_centroid_wgs84": {"lat": 52.372, "lng": 4.919},
        "display_bounds_wgs84": [4.90, 52.36, 4.94, 52.38],
        "boundary_ref": "boundary_nh_ams_01"
      }
    }
  ],
  "near_misses": [],
  "stretch_matches": [],
  "empty_state_code": null,
  "map_center": {"lat": 52.2, "lng": 5.3},
  "bbox": [3.2, 50.7, 7.3, 53.6],
  "map": {
    "type": "FeatureCollection",
    "display_bounds_wgs84": [3.2, 50.7, 7.3, 53.6],
    "features": []
  }
}
```

`recommendations` is kept as a backward-compatible alias of `ranked_results` in
the API response; new match-first clients should read `ranked_results`.

## PATCH /api/match/sessions/{session_id}/map-state

Optional MVP endpoint to persist selected result, map view, list state, and mobile mode when route/query context plus `sessionStorage` is not enough for supported restore cases.

**Request**

```json
{
  "selected_neighborhood_id": "nh_ams_01",
  "selected_recommendation_id": "rec_pv_8df64199c112_nh_ams_01",
  "display_center_wgs84": {"lat": 52.372, "lng": 4.919},
  "zoom": 13,
  "list_scroll": 420,
  "mobile_mode": "list"
}
```

**Response 200**

```json
{
  "saved": true,
  "session_id": "match_7f3b2c"
}
```

## GET /api/match/neighborhoods/{neighborhood_id}

Return selected neighborhood summary and geometry metadata.

**Response 200**

```json
{
  "neighborhood_id": "nh_ams_01",
  "name": "Oostelijke Eilanden",
  "municipality": "Amsterdam",
  "centroid_rd": {"x": 123456.0, "y": 487654.0},
  "bounds_rd": [122900.0, 487100.0, 124200.0, 488300.0],
  "display_centroid_wgs84": {"lat": 52.372, "lng": 4.919},
  "display_bounds_wgs84": [4.90, 52.36, 4.94, 52.38],
  "boundary_ref": "boundary_nh_ams_01",
  "source_refs": ["seed_match_source"],
  "limitations": ["mock_data"]
}
```

## GET /api/match/neighborhoods/{neighborhood_id}/map-layers

Return detail-layer references for the selected neighborhood only.

**Query parameters**

- `session_id`: required
- `result_set_id`: required

**Response 200**

```json
{
  "neighborhood_id": "nh_ams_01",
  "allowed_bounds_rd": [122900.0, 487100.0, 124200.0, 488300.0],
  "display_bounds_wgs84": [4.90, 52.36, 4.94, 52.38],
  "boundary": {
    "type": "Feature",
    "geometry": {"type": "Polygon", "coordinates": []},
    "properties": {"neighborhood_id": "nh_ams_01"}
  },
  "building_layer": {
    "available": true,
    "endpoint": "/api/match/neighborhoods/nh_ams_01/buildings"
  },
  "amenity_layer": {
    "endpoint": "/api/match/neighborhoods/nh_ams_01/amenities"
  },
  "fallback_2d_available": true
}
```

## GET /api/match/neighborhoods/{neighborhood_id}/buildings

Return 2D building footprint features only inside the selected neighborhood.
Where source data exists, this endpoint should support all-available selected-
neighborhood coverage through complete selected-neighborhood responses or
progressive viewport/page loading. It must not silently return a representative
sample as if it were complete. The backend validates and clips `bounds_rd` to
the selected neighborhood. The match-first frontend renders these features as
flat 2D footprints on the 2D basemap; Dossier 3D remains a separate
address-level surface.

For BAG-backed responses, each rendered footprint is a BAG `pand`. House
candidate semantics come from linked `verblijfsobject.gebruiksdoel`, not from a
`pand` "building type". PDOK BAG OGC v2 `pand` is the preferred 2D selected-
neighborhood source where available because it exposes `status`, `gebruiksdoel`,
`aantal_verblijfsobjecten`, and geometry in one scoped response. 3DBAG may be
used as a fallback or richer-detail source when height/LoD detail is required.
Pands containing `woonfunctie` are prioritized as house candidates. Pands with
`aantal_verblijfsobjecten = 0`, only non-residential use purposes, or only
`overige gebruiksfunctie` remain visible footprints but are deferred from
arbitrary house selection unless a reliable address path exists.

**Query parameters**

- `session_id`: required
- `result_set_id`: required
- `bounds_rd`: required `min_x,min_y,max_x,max_y`
- `lod`: optional provider detail hint; response must still be renderable as 2D footprints
- `limit`: optional integer
- `cursor`: optional provider/cache paging token for continuing the same
  selected-neighborhood viewport or chunk
- `simplification`: optional zoom/detail hint; must not change selected
  neighborhood scope

Requests whose `bounds_rd` is outside the selected neighborhood must be
rejected with `match.building_bounds_out_of_scope`; never silently expand to
national or unrelated viewport loading. If the response is partial, it must
include `complete: false` and either `next_cursor` or a stable
`partial_reason_code` so the frontend can label the state honestly.

**Response 200**

```json
{
  "neighborhood_id": "nh_ams_01",
  "bounds_rd": [123000.0, 487250.0, 123800.0, 488000.0],
  "clipped_to_neighborhood": true,
  "complete": false,
  "next_cursor": "bldg_page_02",
  "loaded_scope": "selected_viewport",
  "partial_reason_code": "match.buildings.more_available",
  "buildings": [
    {
      "building_id": "bag_pand_0363100012253001",
      "footprint": {"type": "Polygon", "coordinates": []},
      "height_m": null,
      "source_refs": ["pdok_bag_ogc_v2_pand"],
      "address_resolution": "candidate",
      "geometry_source": "pdok_bag_pand",
      "bag_status": "Pand in gebruik",
      "bag_gebruiksdoelen": ["winkelfunctie", "woonfunctie"],
      "bag_verblijfsobject_count": 4,
      "building_usage_classification": "mixed_residential",
      "house_selectable": true
    }
  ],
  "data_version": "pdok-bag-ogc-v2-pand-selected-v1",
  "fallback_reason_code": null,
  "source_refs": ["pdok_bag_ogc_v2_pand"],
  "limitations": ["match.results.limitations.pdok_bag_pand"]
}
```

When all available footprints for the requested selected-neighborhood viewport
or complete selected-neighborhood chunk have loaded, `complete` is `true` and
`next_cursor` is `null`.

If unavailable:

```json
{
  "neighborhood_id": "nh_ams_01",
  "bounds_rd": [123000.0, 487250.0, 123800.0, 488000.0],
  "clipped_to_neighborhood": true,
  "complete": true,
  "next_cursor": null,
  "loaded_scope": "selected_viewport",
  "buildings": [],
  "data_version": "pdok-bag-ogc-v2-pand-selected-v1",
  "fallback_reason_code": "matchFirst.neighborhood.missingFootprints"
}
```

## GET /api/match/neighborhoods/{neighborhood_id}/amenities

Return preference-aware amenity categories and no-paid selected-neighborhood
map points. The backend caps the category set to the concise preference-aware
default, but the frontend must render every returned `points[]` item that
projects into the selected map frame. Each point includes a stable
`marker_shape` key. The frontend derives the dedicated marker emoji from
`amenity_key` so the map marker and right-side Relevant amenities
legend/filter surface always show the same emoji identity without requiring
translated backend glyph payloads.

The approved no-paid marker stack is PDOK BGT/BRT parks/green, DUO schools
matched to BAG, LRK childcare matched to BAG, OV-haltes Nederland actueel WFS
for live scoped transit markers with NDOV/GTFS as the preferred import source,
RDW/Nationaal Parkeerregister parking, NDW DOT-NL public charging points,
Zwemwater.nl swim spots, and Overture Places open POI context for daily shops,
cafes/restaurants, healthcare, and libraries/culture. Sports-field markers are
excluded from the active stack because the available broad sports sources were
not reliable enough for field-only pins. Sources without stored or live
selected-bounds records must be returned as unavailable metadata rather than
invented markers.

**Query parameters**

- `session_id`: required
- `result_set_id`: required

**Response 200**

```json
{
  "neighborhood_id": "nh_ams_01",
  "tags": [
    {
      "amenity_key": "parks",
      "label_key": "matchFirst.amenity.parks",
      "reason_code": "green_space_priority",
      "source_refs": ["seed_match_source"]
    }
  ],
  "points": [
    {
      "point_id": "amenity_nh_ams_01_parks_green_1",
      "amenity_key": "parks_green",
      "category_key": "parks_green",
      "label_key": "matchFirst.amenity.parks_green",
      "name": "Neighborhood park",
      "marker_shape": "circle",
      "display_lat": 52.3568,
      "display_lng": 5.0001,
      "display_coordinate_system": "WGS84",
      "source_name": "PDOK BGT/BRT green-space geometry",
      "source_record_id": "bgt-green-1",
      "freshness_date": "2026-05-20",
      "loaded_at": "2026-05-20T10:00:00Z",
      "source_coordinate_system": "EPSG:4326",
      "source_geometry": {"type": "Polygon", "coordinates": []},
      "source_geometry_coordinate_system": "EPSG:4326",
      "source_refs": ["pdok_bgt_brt_green"],
      "relevance": 95
    }
  ]
}
```

Known frontend marker identity mapping:

| `amenity_key` | Marker shape | Dedicated emoji |
| --- | --- | --- |
| `transit` | triangle | 🚊 |
| `schools` | square | 🎓 |
| `childcare` | rounded square | 🧸 |
| `parks_green` | circle | 🌳 |
| `parking` | hexagon | 🅿️ |
| `ev_charging` | bolt | 🔌 |
| `swimming_water` | wave | 💧 |
| `daily_shops` | rounded square | 🛒 |
| `cafes_restaurants` | circle | ☕ |
| `healthcare` | cross | ➕ |
| `libraries_culture` | book | 📚 |

## POST /api/match/dossier/from-building

Resolve a selected building or map point to an existing Dossier route target.

**Request**

```json
{
  "session_id": "match_7f3b2c",
  "neighborhood_id": "nh_ams_01",
  "building_id": "bldg_123",
  "address_id": null,
  "vbo_id": null,
  "lookup_id": null,
  "selected_candidate_id": null,
  "coordinate_rd": {"x": 123520.0, "y": 487780.0},
  "return_context": {
    "session_id": "match_7f3b2c",
    "job_id": "match_job_a91f",
    "result_set_id": "mrs_0b1e",
    "preference_vector_version": "pv_v1_8df64199c112",
    "source": "match_map",
    "return_url": "#/match/session/match_7f3b2c/neighborhood/nh_ams_01",
    "map_center": [52.372, 4.919],
    "map_zoom": 16,
    "list_scroll": 420,
    "mobile_mode": "map",
    "selected_result_id": "rec_pv_8df64199c112_nh_ams_01",
    "selected_result_rank": 1,
    "language": "nl",
    "selected_house_id": "bldg_123"
  }
}
```

**Response 200 resolved**

```json
{
  "status": "resolved",
  "vbo_id": "0363010000123456",
  "lookup_id": "adr-abc123",
  "route": "#/address/0363010000123456?lookup=adr-abc123&match_return=%23%2Fmatch%2Fsession%2Fmatch_7f3b2c%2Fneighborhood%2Fnh_ams_01&match_session=match_7f3b2c&match_neighborhood=nh_ams_01&match_context=%7B...%7D",
  "address_candidate": {
    "address_id": "0363010000123456",
    "vbo_id": "0363010000123456",
    "lookup_id": "adr-abc123",
    "reliability": "resolved"
  },
  "candidate_addresses": [],
  "fallback_reason_code": null
}
```

The resolved route must carry `lookup`, `match_return`, `match_session`,
`match_neighborhood`, and a structured `match_context` with job/result/vector,
selected result, selected house, map center, zoom, list scroll, mobile mode, and
language. Match identity must use `match_session`; the checkout `session_id`
query parameter must not be repurposed for match sessions.

**Response 200 candidates**

```json
{
  "status": "candidates",
  "vbo_id": null,
  "lookup_id": null,
  "route": null,
  "address_candidate": {
    "address_id": null,
    "vbo_id": null,
    "lookup_id": null,
    "reliability": "candidate"
  },
  "candidate_addresses": [
    {
      "candidate_id": "cand_bldg_123_adr_provider_1",
      "address_id": "0363010000987651",
      "vbo_id": "0363010000987651",
      "lookup_id": "adr-provider-1",
      "display_label_key": "matchFirst.neighborhood.nearbyAddressCandidateWithLabel",
      "display_params": {
        "index": "1",
        "label": "IJburglaan 1000, 1087JK Amsterdam",
        "houseNumber": "1000",
        "postcode": "1087JK",
        "city": "Amsterdam"
      },
      "reliability": "candidate",
      "source_refs": ["pdok_locatieserver_reverse", "seed_match_source"],
      "fallback_reason_code": "match.neighborhood.address_candidate_selection_required"
    }
  ],
  "fallback_reason_code": "match.neighborhood.address_candidate_selection_required"
}
```

To resolve a candidate, repeat the same request with
`selected_candidate_id` set to one of the returned `candidate_addresses`
entries. The server must validate the selected candidate ID against the
server-side selected-neighborhood candidate set and must build the Dossier route
from server candidate values, not client-supplied `vbo_id`, `address_id`, or
`lookup_id`.

**Response 200 manual required**

```json
{
  "status": "manual_required",
  "route": null,
  "vbo_id": null,
  "lookup_id": null,
  "address_candidate": {
    "address_id": null,
    "vbo_id": null,
    "lookup_id": null,
    "reliability": "unavailable"
  },
  "candidate_addresses": [],
  "fallback_reason_code": "match.neighborhood.manual_address_required"
}
```

**Response 200 unavailable**

```json
{
  "status": "unavailable",
  "route": null,
  "vbo_id": null,
  "lookup_id": null,
  "address_candidate": {
    "address_id": null,
    "vbo_id": null,
    "lookup_id": null,
    "reliability": "unavailable"
  },
  "candidate_addresses": [],
  "fallback_reason_code": "match.neighborhood.no_reliable_address"
}
```

Phase 7 implements candidate-address selection for returned server candidates
and keeps manual search plus Back to results as recovery. Ambiguous
server-side building candidates use the backend PDOK Locatieserver reverse path
to populate nearby address choices, and selected-candidate IDs are revalidated
against that server-generated set on the follow-up request.

Malformed VBO identifiers return stable `422` detail
`match.dossier.invalid_vbo_id`; raw validation-detail arrays must not leak to
the frontend. Spoofed building, selected candidate, VBO, address, lookup, or
return-context selected-house values return stable
`match.dossier.building_not_found`. The seed implementation verifies resolved
first/second selected-neighborhood server candidates plus an ambiguous third
candidate backed by PDOK reverse address choices. Browser proof includes one
Chromium backend-integrated provider path and cross-browser UI-mocked
round-trip coverage for the full Dossier return flow.

## POST /api/match/analytics

Record privacy-safe funnel events.

**Request**

```json
{
  "event_name": "match_survey_question_viewed",
  "event_id": "evt_01J...",
  "session_id": "match_7f3b2c",
  "locale": "en",
  "phase": "survey_question",
  "context": {
    "question_key": "lifestyle_priorities",
    "step": 6
  }
}
```

For custom-preference events, context may include stable `preference_key`,
`status`, `review_state`, and aggregate counts. It must not include the raw
additional-preference text.

**Response 202**

```json
{
  "accepted": true
}
```
