# Contract: Match-First API

All endpoints are under the existing `/api` prefix. Responses contain stable keys and codes, never translated copy. Canonical geometry and building request bounds use EPSG:28992 (RD New). WGS84 values are derived display coordinates and are named with `display_*_wgs84`.

## POST /api/match/sessions

Create an anonymous match session.

**Request**

```json
{
  "locale": "en",
  "source": "landing"
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

## POST /api/match/sessions/{session_id}/run

Create the preference vector from current answers and start a pollable match job. This endpoint is called only from the review screen's final CTA.

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
  "status": "completed",
  "generated_at": "2026-05-12T13:22:16Z",
  "model_mode": "weighted_scoring",
  "scoring_version": "match-score-v1",
  "data_version": "match-seed-2026-05-12",
  "evaluation_status": "not_validated_no_labels",
  "predictive_probability_available": false,
  "fallback_used": false,
  "recommendations": [
    {
      "rank": 1,
      "recommendation_id": "rec_pv_8df64199c112_nh_ams_01",
      "neighborhood_id": "nh_ams_01",
      "name": "Oostelijke Eilanden",
      "municipality": "Amsterdam",
      "fit_score": 84,
      "category": "top",
      "eligibility_status": "eligible",
      "confidence": {
        "score": 72,
        "level": "medium",
        "reasons": ["source_coverage_mixed"]
      },
      "reason_codes": ["green_access_match", "mobility_match"],
      "tradeoff_codes": ["review_source_limitations"],
      "component_scores": {
        "lifestyle": 86,
        "housing_availability": 68,
        "budget_realism": 73,
        "commute_feasibility": 90
      },
      "failed_filters": [],
      "source_refs": ["seed_match_source"],
      "limitations": ["mock_data"],
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
  "empty_state_code": null,
  "map": {
    "type": "FeatureCollection",
    "display_bounds_wgs84": [3.2, 50.7, 7.3, 53.6],
    "features": []
  }
}
```

## PATCH /api/match/sessions/{session_id}/map-state

Persist selected result, map view, list state, and mobile mode.

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

- `bounds_rd`: required `min_x,min_y,max_x,max_y`
- `lod`: optional `low`, `medium`, `high`
- `limit`: optional integer

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
    "selected_neighborhood_id": "nh_ams_01",
    "display_map_center_wgs84": {"lat": 52.372, "lng": 4.919},
    "map_zoom": 16,
    "mobile_mode": "map"
  }
}
```

**Response 200 resolved**

```json
{
  "status": "resolved",
  "vbo_id": "0363010000123456",
  "route": "#/address/0363010000123456?session_id=match_7f3b2c",
  "candidate_addresses": []
}
```

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
  "event_name": "match_first_question_shown",
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
