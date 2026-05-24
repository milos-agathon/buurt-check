# Data Model: Buurt Check Match-First UI Revamp

## MatchSession

Anonymous container for a user's match-first journey.

**Fields**:

- `session_id`: stable ID such as `match_{uuid}`
- `anonymous_buyer_key`: optional server-issued buyer key when available
- `locale`: `en` or `nl`
- `phase`: `landing`, `survey_intro`, `survey_question`, `additional_preferences`, `review`, `matching`, `success`, `results_map`, `neighborhood_detail`, `dossier`
- `current_step`: integer survey step, nullable outside survey
- `answer_version`: monotonic integer
- `preference_vector_id`: latest vector ID, nullable until review/run
- `preference_vector_version`: hash of answer set used for the latest vector
- `active_job_id`: latest job ID, nullable
- `result_set_id`: latest completed result set ID, nullable until matching completes
- `stale_results`: boolean set when answers change after results exist
- `selected_neighborhood_id`: nullable
- `selected_recommendation_id`: nullable
- `selected_house_id`: nullable
- `map_state_json`: optional persisted center, zoom, selected item, list scroll, and mobile mode; route/query context plus `sessionStorage` are the MVP default unless backend persistence is required for supported restore cases
- `dossier_return_context_json`: return target and state snapshot, using explicit match fields rather than checkout `session_id`
- `created_at`, `updated_at`, `expires_at`, `deleted_at`

**Validation rules**:

- `locale` must be language-independent and not derived from translated labels.
- `phase` must match the route state.
- `preference_vector_version` must match the answer version used to create results.

## GuidedIntakeAnswerSet

Raw user answers keyed by stable IDs.

**Fields**:

- `session_id`
- `answer_version`
- `answers`: object keyed by question ID
- `validation`: object keyed by question ID with `valid`, `required`, and stable error code
- `completed_step_count`
- `is_complete`
- `updated_at`

**Validation rules**:

- Store answer IDs and numeric values, never translated labels.
- Required questions must have a validation status.
- Optional answers must be distinguishable from missing required answers.
- Editing any answer increments `answer_version` and marks downstream vector/results stale.

## CustomPreference

Structured representation of a user-stated preference that the fixed questions
did not cover.

**Fields**:

- `session_id`
- `custom_preference_id`
- `preference_key`: stable registry key such as `coast_or_beach_proximity`
- `status`: `scoreable`, `map_context_only`, `saved_unsupported`, `disallowed`, or `needs_clarification`
- `privacy_class`: `ordinary_preference`, `sensitive_possible`, or `disallowed_sensitive`
- `source_support`: `official_source_available`, `map_context_available`, `unsupported`, or `blocked`
- `review_state`: `pending`, `accepted`, `edited`, `removed`, or `skipped`
- `reason_code`: stable explanation code
- `clarification_prompt_key`: optional translation key for bounded clarification
- `source_refs`: optional official source keys when the preference can be scored or shown as map context
- `created_at`, `updated_at`

**Validation rules**:

- Raw additional-preference text is used only for extraction and MUST NOT be stored in analytics.
- `scoreable` preferences require an approved scoring feature and source coverage.
- `map_context_only` preferences may affect map overlays/explanations but not scores.
- `saved_unsupported` preferences are retained for future support/review but do not score.
- `disallowed` preferences are excluded from scoring, ranking, map filters, analytics content, and explanation claims.
- The user must review extracted preferences before matching starts.

## PreferenceVector

Derived scoring input built from `GuidedIntakeAnswerSet` plus reviewed
registry-validated `CustomPreference` rows.

**Fields**:

- Existing `preference_vector_id`, `session_id`, `profile_id`, `journey_intent`, budget fields, anchors, commute limits, property types, hard filters, nice-to-haves, avoid signals, lifestyle weights, persona inputs, locale, and method version
- `custom_preferences`: reviewed structured preferences and use statuses
- `source_answer_version`
- `vector_version`
- `raw_answer_refs`
- `warnings`

**Validation rules**:

- Hard filters are separate from weighted preferences.
- Weights are normalized between 0 and 1.
- Protected or sensitive demographic traits must not be score inputs.
- Only accepted `scoreable` custom preferences can become hard filters or weighted score inputs; `map_context_only`, `saved_unsupported`, `disallowed`, and `needs_clarification` cannot affect scores.
- `method_version` must be present.

## MatchJob

Pollable backend matching run.

**Fields**:

- `job_id`
- `session_id`
- `preference_vector_id`
- `status`: `created`, `queued`, `running`, `matching_slow`, `completed`, `completed_with_fallback`, `completed_no_strong_matches`, `failed`, `cancelled`, `expired`
- `stage`: `created`, `queued`, `reading_preferences`, `building_profile`, `loading_neighborhood_data`, `applying_filters`, `running_models`, `scoring_tradeoffs`, `preparing_map`, `completed`, `completed_with_fallback`, `completed_no_strong_matches`, `failed`, `expired`
- `progress`: integer 0-100
- `message_key`: stable i18n key
- `model_mode`: `weighted_scoring`
- `scoring_version`
- `data_version`
- `evaluation_status`: `not_validated_no_labels`
- `fallback_used`
- `fallback_reason_code`
- `result_set_id`
- `error_code`: stable public code, nullable
- `internal_error_class`: internal only, not returned to frontend
- `started_at`, `completed_at`, `updated_at`

**Validation rules**:

- A run can start only from a complete current answer set.
- `completed`, `completed_with_fallback`, and `completed_no_strong_matches` require a `result_set_id`.
- `matching_slow` is a user-facing slow-state while the same backend job continues; it must not create a second job.
- Public responses must not include stack traces or internal error text.

## MatchResultSet

Stored recommendation output for a completed job.

**Fields**:

- `result_set_id`
- `session_id`
- `job_id`
- `preference_vector_id`
- `preference_vector_version`
- `status`
- `generated_at`
- `runtime_ms`
- `model_mode`
- `scoring_version`
- `data_version`
- `evaluation_status`
- `predictive_probability_available`: always `false` for MVP
- `fallback_used`
- `fallback_reason_code`
- `normal_recommendation_count`
- `candidate_count`
- `scored_candidate_count`
- `recommendations_json`
- `near_misses_json`
- `stretch_matches_json`
- `evidence_json`
- `source_coverage_json`
- `geometry_refs_json`
- `map_json`
- `map_center_json`
- `bbox_json`
- `empty_state_code`

**Validation rules**:

- Recommendations must include fit scores, not predictive probabilities.
- Each recommendation must include reason codes, tradeoffs, confidence, limitations, and geometry references.
- Near-miss and stretch-match results must be structurally separate from normal top matches.
- `candidate_count` and `scored_candidate_count` must match for the deterministic baseline unless a candidate is rejected before scoring by documented data-integrity rules.

## NeighborhoodRecommendation

One ranked candidate neighborhood.

**Fields**:

- `rank`
- `recommendation_id`
- `neighborhood_id`
- `name`
- `municipality`
- `fit_score`: 0-100
- `fit_label_key`
- `category`: `top`, `surprising`, `stretch`, `avoid_or_reconsider`
- `eligibility_status`: `eligible`, `stretch`, `failed_hard_filter`, `insufficient_data`
- `confidence`: score 0-100 and level `high`, `medium`, `low`, `insufficient`
- `reason_codes`
- `tradeoff_codes`
- `component_scores`
- `matched_preferences`
- `failed_filters`
- `source_refs`
- `freshness_status`
- `limitations`
- `geometry_ref`
- `amenity_refs`

**Validation rules**:

- `rank` is stable within a result set.
- Confidence is data-quality confidence, not predictive probability.
- Failed hard filters cannot appear as normal top matches.

## GeometryReference

Map metadata needed by results and detail views.

**Fields**:

- `neighborhood_id`
- `centroid_rd`: `{x, y}` in EPSG:28992
- `bounds_rd`: `[min_x, min_y, max_x, max_y]` in EPSG:28992
- `display_centroid_wgs84`: derived `{lat, lng}` only for Leaflet rendering
- `display_bounds_wgs84`: derived `[west, south, east, north]` only for Leaflet rendering
- `boundary_ref`
- `boundary_source`
- `boundary_freshness`
- `building_layer_ref`
- `building_layer_available`
- `amenity_layer_refs`
- `limitations`

**Validation rules**:

- Building layer refs are valid only for the selected neighborhood.
- Building request bounds must use EPSG:28992 and must be clipped to the selected neighborhood.

## BuildingFootprintPage

Scoped payload for selected-neighborhood 2D building footprints.

The primary selected-neighborhood 2D footprint source is PDOK BAG OGC v2 `pand`
where available. A footprint is a BAG `pand`; its house-candidate meaning comes
from linked `verblijfsobject.gebruiksdoel`. The model therefore stores use
purpose metadata separately from geometry so the UI can prioritize
`woonfunctie` pands without removing other valid footprints.

**Fields**:

- `session_id`
- `result_set_id`
- `neighborhood_id`
- `bounds_rd` or `tile_id`: selected-neighborhood viewport/chunk in EPSG:28992
- `loaded_scope`: `selected_neighborhood` or `selected_viewport`
- `complete`: whether all available footprints for the requested scope are loaded
- `next_cursor`: provider/cache cursor for the next selected-neighborhood page, or null
- `partial_reason_code`: stable reason when `complete` is false
- `data_version`
- `simplification_level`
- `clipped_to_neighborhood`
- `buildings`: list of footprint features with stable `building_id`, WGS84 display footprint, optional RD footprint, source refs, address resolution status, BAG semantic metadata where available, and limitations
- `fallback_reason_code`

**Building feature semantic fields**:

- `geometry_source`: `pdok_bag_pand`, `3dbag_lod22`, or `3dbag_lod0`
- `bag_status`: optional BAG pand status, such as `Pand in gebruik`
- `bag_gebruiksdoelen`: optional normalized BAG use-purpose list from linked
  verblijfsobject records
- `bag_verblijfsobject_count`: optional `aantal_verblijfsobjecten`
- `building_usage_classification`: `residential`, `mixed_residential`,
  `non_residential`, `no_verblijfsobject`, or `unknown`
- `house_selectable`: whether the frontend may treat the footprint as a
  selectable house candidate

**Validation rules**:

- Pages are valid only after a neighborhood is selected and only inside the
  selected boundary.
- National or out-of-scope bounds are rejected, not expanded.
- A response with `complete=false` must not be presented as complete
  neighborhood coverage.
- Pands with no `woonfunctie`, only `overige gebruiksfunctie`, or
  `aantal_verblijfsobjecten = 0` remain renderable footprints, but default to
  deferred/non-selectable house state unless a reliable address path exists.
- Empty/error/fallback responses are not cached as successful footprint data.

## AmenityTagSet

Preference-aware amenity tags for selected-neighborhood detail.

**Fields**:

- `session_id`
- `neighborhood_id`
- `tags`: list of stable amenity keys
- `reason_codes`
- `source_refs`
- `freshness_status`

**Validation rules**:

- Visible default tags should be concise and preference-aware.
- Labels are rendered from translation keys.

## HouseSelectionContext

State for opening Dossier from a selected building or address candidate.

**Fields**:

- `session_id`
- `neighborhood_id`
- `building_id`
- `geometry`
- `address_resolution_status`: `resolved`, `candidates`, `manual_required`, `unavailable`
- `candidate_addresses`
- `selected_vbo_id`
- `fallback_reason_code`

**Validation rules**:

- `selected_vbo_id` must match `^[0-9]{16}$` before navigating to `#/address/{vbo_id}`.
- If no reliable address exists, return localized fallback options instead of opening a broken Dossier.

## DossierReturnContext

State required to return from Dossier to the match map.

**Fields**:

- `session_id`
- `return_target`: `results_map` or `neighborhood_detail`
- `job_id`
- `result_set_id`
- `preference_snapshot_ref`
- `preference_vector_version`
- `active_filter_keys`
- `selected_neighborhood_id`
- `selected_recommendation_id`
- `selected_result_rank`
- `selected_house_id`
- `map_center`
- `map_zoom`
- `list_scroll`
- `mobile_mode`
- `locale`
- `dossier_route`
- `dossier_query_context`: existing `lookup`, `report`, checkout `session_id`, and `buyer_resume` values where present

**Validation rules**:

- Back-to-map must not rerun matching when `preference_vector_version` still matches current answers.
- If preferences changed, return to review with stale-results messaging.
- Match context must use `match_session`, `match_return`, and encoded `match_context`; it must not overwrite checkout `session_id`.

## AnalyticsEvent

Privacy-safe product telemetry event.

**Fields**:

- `analytics_event_id`
- `event_name`: stable enum
- `session_id`
- `locale`
- `phase`
- `context`: stable keys only
- `created_at`

**Validation rules**:

- Do not store translated labels, exact anchors, free-text answers, raw additional-preference text, protected traits, names, or emails.
- Survey drop-off must use question keys and step numbers.

## State Transitions

```text
landing -> session_creating -> survey_intro
session_creating -> session_create_failed -> survey_intro
survey_intro -> survey_question
survey_question[n] -> answer_persisting -> survey_question[n+1]
answer_persisting -> answer_save_failed -> survey_question[n]
survey_question[n] -> survey_question[n-1]
survey_question[last] -> additional_preferences
additional_preferences -> preference_extracting|review
preference_extracting -> additional_preferences|review
review -> review_vector_readback_failed -> review
review -> matching(created) -> matching(queued) -> matching(running)
matching(running) -> matching_slow -> matching(running)
matching(running) -> completed
matching(running) -> completed_with_fallback
matching(running) -> completed_no_strong_matches
matching(running) -> failed
matching(created|queued|running|matching_slow) -> expired
completed|completed_with_fallback|completed_no_strong_matches -> success_checkmark -> results_map
results_map -> results_unavailable -> review|matching(queued)
results_map -> map_layer_failed -> results_map
results_map -> neighborhood_detail
neighborhood_detail -> building_layer_failed|amenity_layer_failed -> neighborhood_detail
neighborhood_detail -> no_reliable_address -> neighborhood_detail
neighborhood_detail -> dossier_bridge_failed -> neighborhood_detail
neighborhood_detail -> dossier
dossier -> dossier_return_failed
dossier -> neighborhood_detail
dossier -> results_map
any state with changed preferences -> review
any match state -> session_deleted|session_delete_failed
```
