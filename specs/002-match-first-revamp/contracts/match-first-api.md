# Contract: Match-First API

All endpoints are under the existing `/api` prefix. Responses contain stable keys and codes, never translated copy. Canonical geometry and building request bounds use EPSG:28992 (RD New). WGS84 values are derived display coordinates and are named with `display_*_wgs84`.

## Common Operation Rules

Every task generated from this contract must preserve these method-level rules.

| Endpoint | Stable success codes | Stable error codes | Retry | Idempotency | Cacheability |
| --- | --- | --- | --- | --- | --- |
| `POST /api/match/sessions` | `201` | `match.session.create_failed`, `match.warning.invalid_locale` | Safe to retry with the same `client_request_id`. | Same `client_request_id` and anonymous browser context should return or resume the same active session when possible. | `no-store` |
| `GET /api/match/sessions/{session_id}` | `200` | `match.session.not_found`, `match.session.expired`, `match.session.deleted` | Safe. | Read-only. | `no-store` |
| `PATCH /api/match/sessions/{session_id}/answers` | `200` | `match.warning.invalid_answer_value`, `match.warning.too_many_answers`, `match.warning.protected_answer_not_allowed`, `match.warning.answers_incomplete`, `match.session.not_found` | Retry latest answer payload only; UI must not advance until success. | Repeating the same answer payload for the same `answer_version` must not duplicate rows or create jobs. | `no-store` |
| `DELETE /api/match/sessions/{session_id}` | `202` | `match.session.not_found`, `match.session.delete_failed` | Safe if previous result is unknown. | Repeating delete for an already deleted session returns accepted or not-found with a stable code. | `no-store` |
| `POST /api/match/sessions/{session_id}/run` | `202` | `match.warning.review_confirmation_required`, `match.warning.answers_incomplete`, `match.warning.preference_vector_stale`, `match.job.already_running`, `match.session.not_found` | Safe with same `preference_vector_version`; do not create multiple active jobs. | Same current vector returns the active job if one already exists. | `no-store` |
| `GET /api/match/sessions/{session_id}/status` | `200` | `match.job.not_found`, `match.session.not_found`, `match.job.expired` | Safe; respect `poll_after_ms`. | Read-only. | `no-store` |
| `GET /api/match/sessions/{session_id}/results` | `200` | `match.results.not_ready`, `match.results.not_found`, `match.results.stale`, `match.session.not_found` | Safe after terminal job state. | Read-only. | `no-store` |
| `PATCH /api/match/sessions/{session_id}/map-state` | `200` | `match.map_state.invalid`, `match.session.not_found` | Optional endpoint; retry latest map state only. | Replaces the latest map state snapshot for the session. | `no-store` |
| `GET /api/match/neighborhoods/{neighborhood_id}` | `200` | `match.neighborhood.not_found`, `match.neighborhood.unavailable` | Safe. | Read-only. | May cache only by `neighborhood_id` and data version; do not cache errors as success. |
| `GET /api/match/neighborhoods/{neighborhood_id}/map-layers` | `200` | `match.map_layer.failed`, `match.neighborhood.not_found` | Safe. | Read-only. | Cache key must include `session_id`, `result_set_id`, `neighborhood_id`, data version, and preference/vector version where relevant. |
| `GET /api/match/neighborhoods/{neighborhood_id}/buildings` | `200` | `match.building_layer.failed`, `match.building_bounds_out_of_scope`, `match.neighborhood.not_found` | Safe for the same clipped bounds. | Read-only. | Cache key must include `session_id`, `result_set_id`, `neighborhood_id`, `bounds_rd`, `lod`, `limit`, and building data version. Empty/error/fallback responses are not cached as success. |
| `GET /api/match/neighborhoods/{neighborhood_id}/amenities` | `200` | `match.amenity_layer.failed`, `match.neighborhood.not_found` | Safe. | Read-only. | Cache key must include `session_id`, `result_set_id`, `neighborhood_id`, visible amenity keys, preference/vector version, and data version. |
| `POST /api/match/dossier/from-building` | `200` | `match.dossier_bridge.failed`, `match.neighborhood.no_reliable_address`, `match.session.not_found` | Safe for same selected building and return context. | Same selected building/context returns the same resolved route or candidate set while data version is unchanged. | `no-store` |
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
  "preference_vector_id": null,
  "active_job_id": null,
  "selected_neighborhood_id": null,
  "map_state": null,
  "dossier_return_context": null
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

Return 3D-capable building features only inside the selected neighborhood. The backend validates and clips `bounds_rd` to the selected neighborhood.

**Query parameters**

- `session_id`: required
- `result_set_id`: required
- `bounds_rd`: required `min_x,min_y,max_x,max_y`
- `lod`: optional `low`, `medium`, `high`
- `limit`: optional integer

Requests whose `bounds_rd` is outside the selected neighborhood must be rejected with `match.building_bounds_out_of_scope`; never silently expand to national or unrelated viewport loading.

**Response 200**

```json
{
  "neighborhood_id": "nh_ams_01",
  "bounds_rd": [123000.0, 487250.0, 123800.0, 488000.0],
  "clipped_to_neighborhood": true,
  "buildings": [
    {
      "building_id": "bldg_123",
      "footprint": {"type": "Polygon", "coordinates": []},
      "height_m": 12.4,
      "source_refs": ["3dbag"],
      "address_resolution": "candidate"
    }
  ],
  "fallback_reason_code": null
}
```

If unavailable:

```json
{
  "neighborhood_id": "nh_ams_01",
  "bounds_rd": [123000.0, 487250.0, 123800.0, 488000.0],
  "clipped_to_neighborhood": true,
  "buildings": [],
  "fallback_reason_code": "matchFirst.neighborhood.missing3d"
}
```

## GET /api/match/neighborhoods/{neighborhood_id}/amenities

Return preference-aware amenity tags and optional map points.

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
  "points": []
}
```

## POST /api/match/dossier/from-building

Resolve a selected building or map point to an existing Dossier route target.

**Request**

```json
{
  "session_id": "match_7f3b2c",
  "neighborhood_id": "nh_ams_01",
  "building_id": "bldg_123",
  "coordinate_rd": {"x": 123520.0, "y": 487780.0},
  "return_context": {
    "return_target": "neighborhood_detail",
    "job_id": "match_job_a91f",
    "result_set_id": "mrs_0b1e",
    "preference_vector_version": "pv_v1_8df64199c112",
    "active_filter_keys": ["top_matches"],
    "selected_neighborhood_id": "nh_ams_01",
    "selected_recommendation_id": "rec_pv_8df64199c112_nh_ams_01",
    "selected_result_rank": 1,
    "selected_house_id": "bldg_123",
    "display_map_center_wgs84": {"lat": 52.372, "lng": 4.919},
    "map_zoom": 16,
    "list_scroll": 420,
    "mobile_mode": "map",
    "dossier_query_context": {}
  }
}
```

**Response 200 resolved**

```json
{
  "status": "resolved",
  "vbo_id": "0363010000123456",
  "route": "#/address/0363010000123456?match_return=%23%2Fmatch%2Fsession%2Fmatch_7f3b2c%2Fneighborhood%2Fnh_ams_01&match_session=match_7f3b2c&match_context=%7B...%7D",
  "candidate_addresses": []
}
```

The resolved route must preserve existing Dossier query parameters such as `lookup`, `report`, checkout `session_id`, and `buyer_resume` when present. Match identity must use `match_session`; the checkout `session_id` query parameter must not be repurposed for match sessions.

**Response 200 candidates**

```json
{
  "status": "candidates",
  "vbo_id": null,
  "route": null,
  "fallback_reason_code": "matchFirst.neighborhood.noReliableAddress",
  "candidate_addresses": [
    {
      "vbo_id": "0363010000123456",
      "display_key": "matchFirst.neighborhood.addressCandidate",
      "display_params": {"street": "Example street", "house_number": "12"}
    }
  ]
}
```

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

**Response 202**

```json
{
  "accepted": true
}
```
