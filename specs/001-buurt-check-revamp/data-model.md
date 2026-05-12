# Data Model: Buurt Check Revamp

The model extends the existing SQLite/Turso persistence layer. Pydantic API models should mirror these entities, and TypeScript interfaces in `frontend/src/types/match.ts` should mirror public response shapes.

## Conventions

- IDs are opaque text IDs unless an official source ID is available.
- Timestamps are UTC ISO strings.
- Money values store integer cents for persisted records where practical.
- Locale is `en` or `nl`.
- Journey intent is `buy`, `rent`, or `both`.
- Source type is one of `official`, `commercial`, `derived`, `mock`, `user_provided`, `missing`.
- Confidence is stored as numeric `0-100` plus a label where exposed.
- Lists/maps in SQLite/Turso are stored as JSON text and validated through Pydantic at boundaries.

## Geography and Metrics

### neighborhoods

Represents a searchable neighborhood, town/village area, or municipality unit.

| Field | Type | Notes |
|-------|------|-------|
| neighborhood_id | TEXT PK | Stable internal ID |
| official_code | TEXT NULL | CBS/buurt/wijk/gemeente code when available |
| name_nl | TEXT NOT NULL | Dutch display name |
| name_en | TEXT NULL | English display name when different/available |
| municipality | TEXT NOT NULL | Parent municipality |
| province | TEXT NULL | Province |
| geography_level | TEXT NOT NULL | `neighborhood`, `district`, `municipality`, `custom_seed` |
| centroid_rd_x | REAL NULL | EPSG:28992 |
| centroid_rd_y | REAL NULL | EPSG:28992 |
| centroid_lat | REAL NULL | WGS84 for map display |
| centroid_lng | REAL NULL | WGS84 for map display |
| geometry_ref | TEXT NULL | Optional compact geometry/file reference |
| supported_region | INTEGER NOT NULL | 0/1 |
| mock_status | TEXT NOT NULL | `real`, `seeded_mock`, `mixed` |
| created_at | TEXT NOT NULL | UTC |
| updated_at | TEXT NOT NULL | UTC |

Validation:

- Supported MVP seed must include Amsterdam, Utrecht, Rotterdam, The Hague, Eindhoven, and commuter-style examples.
- Coordinates may be missing, but map responses must show an unavailable state for those records.

### metric_sources

Represents source metadata for metrics used in ranking, comparison, report, map, listings, alerts, or admin.

| Field | Type | Notes |
|-------|------|-------|
| metric_source_id | TEXT PK | Stable source record ID |
| source_name | TEXT NOT NULL | e.g. CBS, Leefbaarometer, seed mock |
| source_type | TEXT NOT NULL | `official`, `commercial`, `derived`, `mock`, `user_provided`, `missing` |
| metric_name | TEXT NOT NULL | Canonical metric key |
| source_url | TEXT NULL | Config/source URL when allowed |
| license_status | TEXT NOT NULL | `open`, `licensed`, `mock`, `unknown`, `unavailable` |
| measurement_date | TEXT NULL | Source measurement date |
| retrieved_at | TEXT NULL | Retrieval timestamp |
| geography_level | TEXT NOT NULL | Level of measurement |
| method_version | TEXT NOT NULL | Normalization/import version |
| limitation | TEXT NOT NULL | User/admin-safe limitation text |
| confidence | INTEGER NOT NULL | 0-100 |

Validation:

- Every metric consumed by product logic must reference a `metric_source_id`.
- Mock and missing data must never be represented as official.

### neighborhood_metrics

Stores raw or source-normalized metrics by neighborhood.

| Field | Type | Notes |
|-------|------|-------|
| metric_id | TEXT PK | |
| neighborhood_id | TEXT NOT NULL | FK neighborhoods |
| metric_key | TEXT NOT NULL | e.g. `green_access`, `noise`, `median_asking_price` |
| raw_value_json | TEXT NOT NULL | Source value and unit |
| normalized_value | REAL NULL | 0-100 when available |
| source_id | TEXT NOT NULL | FK metric_sources |
| freshness_status | TEXT NOT NULL | `current`, `aging`, `stale`, `unavailable`, `mock`, `conflict` |
| confidence | INTEGER NOT NULL | 0-100 |
| geography_level | TEXT NOT NULL | Measurement level |
| limitations_json | TEXT NOT NULL | List of limitations |
| imported_at | TEXT NOT NULL | UTC |

Validation:

- Do not cache/import empty error responses as current data.
- Missing source data becomes a metric record with source type `missing` only when useful for explanations/admin.

### normalized_feature_vectors

Stores comparable neighborhood dimensions used by scoring and similarity.

| Field | Type | Notes |
|-------|------|-------|
| feature_vector_id | TEXT PK | |
| neighborhood_id | TEXT NOT NULL | FK neighborhoods |
| method_version | TEXT NOT NULL | Scoring/feature version |
| calmness | REAL NULL | 0-100 |
| green_access | REAL NULL | 0-100 |
| family_fit | REAL NULL | 0-100 |
| mobility | REAL NULL | 0-100 |
| amenities | REAL NULL | 0-100 |
| affordability_buy | REAL NULL | 0-100 |
| affordability_rent | REAL NULL | 0-100 |
| safety_context | REAL NULL | 0-100, neutral framing only |
| environmental_quality | REAL NULL | 0-100 |
| social_lifestyle_fit | REAL NULL | 0-100, no protected traits |
| housing_stock | REAL NULL | 0-100 |
| listing_availability_buy | REAL NULL | 0-100, mock/real marked in source refs |
| listing_availability_rent | REAL NULL | 0-100 |
| feature_sources_json | TEXT NOT NULL | metric source refs by feature |
| completeness_score | INTEGER NOT NULL | 0-100 |
| confidence | INTEGER NOT NULL | 0-100 |
| created_at | TEXT NOT NULL | UTC |

Validation:

- Protected/sensitive traits are excluded from vector features.
- Feature values with sparse data lower confidence rather than being silently imputed.

## User and Preference State

### anonymous_sessions

Tracks session-bound state without assuming accounts.

| Field | Type | Notes |
|-------|------|-------|
| session_id | TEXT PK | Server-issued or frontend-provided anonymous ID |
| buyer_key | TEXT NULL | Existing buyer-bound flow key where available |
| locale | TEXT NOT NULL | `en`/`nl` |
| created_at | TEXT NOT NULL | |
| last_seen_at | TEXT NOT NULL | |
| linked_user_id | TEXT NULL | Future account linkage |

### user_profiles

Future-ready profile container; may remain anonymous in MVP.

| Field | Type | Notes |
|-------|------|-------|
| user_profile_id | TEXT PK | |
| session_id | TEXT NULL | FK anonymous_sessions |
| locale | TEXT NOT NULL | |
| household_type | TEXT NOT NULL | `starter`, `single`, `couple`, `family`, `future_family`, `other` |
| newcomer_status | TEXT NOT NULL | `yes`, `no`, `prefer_not_to_say`, `unknown`; not used as protected scoring trait |
| created_at | TEXT NOT NULL | |
| updated_at | TEXT NOT NULL | |

### preference_vectors

Stores raw quiz answers and normalized vector.

| Field | Type | Notes |
|-------|------|-------|
| preference_vector_id | TEXT PK | |
| session_id | TEXT NULL | |
| user_profile_id | TEXT NULL | |
| journey_intent | TEXT NOT NULL | `buy`, `rent`, `both` |
| budget_min_cents | INTEGER NULL | |
| budget_max_cents | INTEGER NULL | |
| monthly_rent_max_cents | INTEGER NULL | |
| anchor_locations_json | TEXT NOT NULL | Work/school/current city anchors |
| commute_limits_json | TEXT NOT NULL | Mode and max minutes/radius |
| property_types_json | TEXT NOT NULL | |
| hard_filters_json | TEXT NOT NULL | Must-haves |
| nice_to_haves_json | TEXT NOT NULL | |
| avoid_signals_json | TEXT NOT NULL | |
| lifestyle_weights_json | TEXT NOT NULL | 0-1 weights by feature |
| persona_inputs_json | TEXT NOT NULL | Inputs used by overlay detection |
| locale | TEXT NOT NULL | |
| method_version | TEXT NOT NULL | |
| created_at | TEXT NOT NULL | |

Validation:

- Must preserve buy and rent when `journey_intent = both`.
- Hard filters that exclude all neighborhoods must return recoverable relaxation suggestions.

### persona_overlays

Detected overlays tied to a preference vector.

| Field | Type | Notes |
|-------|------|-------|
| persona_overlay_id | TEXT PK | |
| preference_vector_id | TEXT NOT NULL | FK preference_vectors |
| overlay_type | TEXT NOT NULL | `family`, `newcomer`, `city_escape`, `single_couple`, `buyer`, `renter`, `starter` |
| confidence | INTEGER NOT NULL | 0-100 |
| reasons_json | TEXT NOT NULL | Explicit/derived reasons |
| created_at | TEXT NOT NULL | |

## Recommendations and Reports

### recommendations

Stores deterministic recommendation results.

| Field | Type | Notes |
|-------|------|-------|
| recommendation_id | TEXT PK | |
| preference_vector_id | TEXT NOT NULL | |
| neighborhood_id | TEXT NOT NULL | |
| rank | INTEGER NOT NULL | |
| category | TEXT NOT NULL | `top`, `surprising`, `stretch`, `avoid_or_reconsider` |
| fit_score | INTEGER NOT NULL | 0-100 |
| eligibility_status | TEXT NOT NULL | `eligible`, `stretch`, `failed_hard_filter`, `insufficient_data` |
| score_drivers_json | TEXT NOT NULL | Positive drivers |
| tradeoffs_json | TEXT NOT NULL | Watchouts/penalties |
| failed_filters_json | TEXT NOT NULL | |
| confidence | INTEGER NOT NULL | 0-100 |
| freshness_status | TEXT NOT NULL | Worst/summary freshness |
| source_coverage_json | TEXT NOT NULL | Source refs |
| method_version | TEXT NOT NULL | |
| created_at | TEXT NOT NULL | |

Validation:

- Every displayed recommendation must include why it fits, tradeoffs, confidence, and source/freshness coverage.

### reports

Represents a Woonkompas/Buurt Match snapshot.

| Field | Type | Notes |
|-------|------|-------|
| report_id | TEXT PK | |
| session_id | TEXT NULL | |
| preference_vector_id | TEXT NOT NULL | |
| locale | TEXT NOT NULL | |
| report_status | TEXT NOT NULL | `generated`, `fallback`, `invalid`, `archived` |
| title | TEXT NOT NULL | Localized |
| profile_summary_json | TEXT NOT NULL | |
| recommendation_ids_json | TEXT NOT NULL | |
| report_input_json | TEXT NOT NULL | Structured input snapshot |
| report_output_json | TEXT NOT NULL | Structured output or fallback |
| validation_status | TEXT NOT NULL | `passed`, `fallback_used`, `blocked` |
| limitations_json | TEXT NOT NULL | |
| source_refs_json | TEXT NOT NULL | |
| generated_by | TEXT NOT NULL | `ai`, `deterministic_fallback` |
| created_at | TEXT NOT NULL | |
| expires_at | TEXT NULL | Optional |

Validation:

- Report output cannot contain score/category changes.
- Report can be regenerated in another language without changing deterministic scores.

### report_exports

| Field | Type | Notes |
|-------|------|-------|
| export_id | TEXT PK | |
| report_id | TEXT NOT NULL | |
| export_type | TEXT NOT NULL | `pdf`, `html`, `json` |
| locale | TEXT NOT NULL | |
| status | TEXT NOT NULL | `created`, `failed` |
| created_at | TEXT NOT NULL | |
| error_code | TEXT NULL | |

### share_tokens

| Field | Type | Notes |
|-------|------|-------|
| share_token_id | TEXT PK | |
| report_id | TEXT NOT NULL | |
| token_hash | TEXT NOT NULL UNIQUE | Never store raw token |
| scope | TEXT NOT NULL | `report_view`, `report_export` |
| locale | TEXT NOT NULL | |
| created_at | TEXT NOT NULL | |
| expires_at | TEXT NULL | |
| revoked_at | TEXT NULL | |

### saved_neighborhoods

| Field | Type | Notes |
|-------|------|-------|
| saved_neighborhood_id | TEXT PK | |
| session_id | TEXT NULL | |
| preference_vector_id | TEXT NULL | |
| report_id | TEXT NULL | |
| neighborhood_id | TEXT NOT NULL | |
| saved_from | TEXT NOT NULL | `recommendation`, `map`, `comparison`, `listing`, `manual` |
| note_json | TEXT NOT NULL | Optional local/user note |
| created_at | TEXT NOT NULL | |
| deleted_at | TEXT NULL | |

## Listings and Alerts

### listings

Represents provider, mock, user-provided, outbound placeholder, or unavailable listing data.

| Field | Type | Notes |
|-------|------|-------|
| listing_id | TEXT PK | |
| provider_listing_id | TEXT NULL | |
| provider_name | TEXT NOT NULL | |
| provider_mode | TEXT NOT NULL | `licensed`, `mock`, `user_provided`, `outbound_placeholder`, `unavailable` |
| license_status | TEXT NOT NULL | |
| neighborhood_id | TEXT NOT NULL | |
| journey_intent | TEXT NOT NULL | `buy` or `rent` |
| property_type | TEXT NULL | |
| price_cents | INTEGER NULL | |
| rent_cents | INTEGER NULL | |
| currency | TEXT NOT NULL | `EUR` |
| bedrooms | INTEGER NULL | |
| floor_area_m2 | REAL NULL | |
| availability_status | TEXT NOT NULL | `available`, `reserved`, `sold_rented`, `expired`, `unknown` |
| days_on_market | INTEGER NULL | |
| source_url | TEXT NULL | Only if licensed/outbound-compliant |
| freshness_status | TEXT NOT NULL | |
| confidence | INTEGER NOT NULL | |
| limitations_json | TEXT NOT NULL | |
| retrieved_at | TEXT NOT NULL | |

Validation:

- Listing data does not affect deterministic fit score unless explicitly included as marked availability input.
- Scraped provider modes are not allowed.

### alerts

| Field | Type | Notes |
|-------|------|-------|
| alert_id | TEXT PK | |
| session_id | TEXT NULL | |
| preference_vector_id | TEXT NULL | |
| neighborhood_ids_json | TEXT NOT NULL | |
| journey_intent | TEXT NOT NULL | `buy`, `rent`, `both` |
| budget_max_cents | INTEGER NULL | |
| rent_max_cents | INTEGER NULL | |
| property_types_json | TEXT NOT NULL | |
| notification_destination_hash | TEXT NULL | e.g. email hash |
| notification_type | TEXT NOT NULL | `mock`, `email`, `push`, `none` |
| status | TEXT NOT NULL | `active`, `paused`, `deleted` |
| last_evaluated_at | TEXT NULL | |
| created_at | TEXT NOT NULL | |
| updated_at | TEXT NOT NULL | |

### notification_dispatch_records

| Field | Type | Notes |
|-------|------|-------|
| dispatch_id | TEXT PK | |
| alert_id | TEXT NOT NULL | |
| provider_name | TEXT NOT NULL | |
| provider_mode | TEXT NOT NULL | `mock`, `email`, `push` |
| result_status | TEXT NOT NULL | `recorded`, `sent`, `failed`, `skipped` |
| listing_ids_json | TEXT NOT NULL | |
| error_code | TEXT NULL | |
| created_at | TEXT NOT NULL | |

## Feedback, Admin, and Observability

### feedback_events

| Field | Type | Notes |
|-------|------|-------|
| feedback_event_id | TEXT PK | |
| session_id | TEXT NULL | |
| report_id | TEXT NULL | |
| recommendation_id | TEXT NULL | |
| neighborhood_id | TEXT NOT NULL | |
| feedback_type | TEXT NOT NULL | `love`, `maybe`, `not_for_me`, `undo` |
| reason_code | TEXT NULL | Controlled optional reason |
| payload_json | TEXT NOT NULL | Privacy-safe details |
| created_at | TEXT NOT NULL | |

Validation:

- Feedback cannot infer protected/sensitive traits.
- Feedback may adjust current/future weights through deterministic, explainable rules only.

### data_import_runs

| Field | Type | Notes |
|-------|------|-------|
| data_import_run_id | TEXT PK | |
| provider_name | TEXT NOT NULL | |
| provider_type | TEXT NOT NULL | `official`, `commercial`, `mock`, `derived` |
| region_config_id | TEXT NOT NULL | |
| status | TEXT NOT NULL | `started`, `succeeded`, `partial`, `failed` |
| started_at | TEXT NOT NULL | |
| finished_at | TEXT NULL | |
| records_imported | INTEGER NOT NULL | |
| records_failed | INTEGER NOT NULL | |
| error_summary_json | TEXT NOT NULL | |

### source_health_snapshots

| Field | Type | Notes |
|-------|------|-------|
| source_health_id | TEXT PK | |
| provider_name | TEXT NOT NULL | |
| region_config_id | TEXT NOT NULL | |
| health_status | TEXT NOT NULL | `healthy`, `degraded`, `failed`, `mock_only`, `unconfigured` |
| last_success_at | TEXT NULL | |
| stale_metric_count | INTEGER NOT NULL | |
| missing_metric_count | INTEGER NOT NULL | |
| mock_metric_count | INTEGER NOT NULL | |
| failed_run_count | INTEGER NOT NULL | |
| details_json | TEXT NOT NULL | |
| created_at | TEXT NOT NULL | |

### scoring_anomalies

| Field | Type | Notes |
|-------|------|-------|
| scoring_anomaly_id | TEXT PK | |
| preference_vector_id | TEXT NULL | |
| neighborhood_id | TEXT NULL | |
| anomaly_type | TEXT NOT NULL | `score_outlier`, `empty_result`, `confidence_outlier`, `category_distribution`, `missing_driver` |
| severity | TEXT NOT NULL | `info`, `warning`, `critical` |
| details_json | TEXT NOT NULL | |
| created_at | TEXT NOT NULL | |
| resolved_at | TEXT NULL | |

### guardrail_events

| Field | Type | Notes |
|-------|------|-------|
| guardrail_event_id | TEXT PK | |
| report_id | TEXT NULL | |
| event_type | TEXT NOT NULL | `missing_citation`, `unsupported_claim`, `sensitive_claim`, `certainty_language`, `schema_invalid` |
| action_taken | TEXT NOT NULL | `blocked`, `rewritten`, `fallback_used`, `logged` |
| details_json | TEXT NOT NULL | |
| created_at | TEXT NOT NULL | |

### analytics_events

| Field | Type | Notes |
|-------|------|-------|
| analytics_event_id | TEXT PK | |
| event_name | TEXT NOT NULL | Required stable name |
| session_id | TEXT NULL | |
| locale | TEXT NOT NULL | |
| journey_intent | TEXT NULL | |
| context_json | TEXT NOT NULL | Privacy-safe payload |
| created_at | TEXT NOT NULL | |

Required names:

- `match_quiz_started`
- `match_quiz_completed`
- `match_report_viewed`
- `match_neighborhood_saved`
- `match_listing_clicked`
- `match_alert_created`
- `match_feedback_submitted`

## State Transitions

### Report

`generated` -> `fallback` if AI fails validation or is unavailable.
`generated`/`fallback` -> `archived` if user deletes session or report is superseded.
`invalid` is only used for blocked outputs that should not render as complete reports.

### Alert

`active` -> `paused` -> `active`
`active`/`paused` -> `deleted`

### Data Import Run

`started` -> `succeeded`
`started` -> `partial`
`started` -> `failed`

### Recommendation

Recommendations are snapshots. Feedback creates new events and reranking hints rather than mutating historical score records in place.
