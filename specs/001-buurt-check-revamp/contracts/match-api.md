# Contract: Match API and Provider Interfaces

All response payloads must be Pydantic v2 models in `backend/app/models/match.py` and TypeScript mirrors in `frontend/src/types/match.ts`. All user-facing warning/status codes must be translated through i18n keys on the frontend.

## Shared Types

### SourceMeta

```json
{
  "source_id": "cbs-green-2024",
  "source_name": "CBS",
  "source_type": "official",
  "metric_name": "green_access",
  "measurement_date": "2024-01-01",
  "retrieved_at": "2026-05-11T08:00:00Z",
  "geography_level": "neighborhood",
  "confidence": 86,
  "freshness_status": "current",
  "limitations": ["Metric is measured at neighborhood level."]
}
```

### Confidence

```json
{
  "score": 82,
  "label": "high",
  "reasons": ["Most required metrics are current.", "No mock metrics in top drivers."]
}
```

### Recommendation

```json
{
  "recommendation_id": "rec_123",
  "neighborhood_id": "nh_amsterdam_ijburg",
  "name": "IJburg",
  "municipality": "Amsterdam",
  "rank": 1,
  "category": "top",
  "fit_score": 84,
  "eligibility_status": "eligible",
  "why_it_fits": [
    { "code": "green_access_match", "evidence_refs": ["ev_1"] }
  ],
  "tradeoffs": [
    { "code": "budget_stretch", "evidence_refs": ["ev_2"] }
  ],
  "score_drivers": [
    { "feature": "green_access", "impact": 0.22, "score": 88, "source_refs": ["cbs-green-2024"] }
  ],
  "confidence": { "score": 82, "label": "high", "reasons": [] },
  "freshness_status": "current",
  "source_refs": []
}
```

## Endpoints

### POST /api/match/quiz

Validates raw quiz answers and returns raw profile plus normalized preference vector.

Request:

```json
{
  "session_id": "anon_123",
  "locale": "en",
  "journey_intent": "both",
  "budget": { "buy_min": 47500000, "buy_max": 62500000, "rent_max": 220000 },
  "household_type": "family",
  "anchor_locations": [
    { "label": "Work", "query": "Amsterdam Zuid", "lat": 52.337, "lng": 4.873 }
  ],
  "commute_limits": [{ "mode": "public_transport", "max_minutes": 45 }],
  "property_types": ["apartment", "house"],
  "must_haves": ["green_access", "schools", "low_noise"],
  "nice_to_haves": ["train_nearby", "village_feel"],
  "avoid_signals": ["dense_nightlife", "high_traffic"],
  "lifestyle_priorities": {
    "calmness": 5,
    "green_access": 5,
    "mobility": 4,
    "amenities": 3,
    "affordability": 4
  }
}
```

Response `200`:

```json
{
  "profile_id": "profile_123",
  "preference_vector_id": "pv_123",
  "preference_vector": {},
  "persona_overlays": [
    { "type": "family", "confidence": 95, "reasons": ["household_type_family"] }
  ],
  "validation_warnings": [],
  "analytics_event": "match_quiz_completed"
}
```

### POST /api/match/recommendations

Runs deterministic matching.

Request:

```json
{
  "preference_vector_id": "pv_123",
  "region_config_id": "mvp-randstad-eindhoven-seed",
  "limit": 10
}
```

Response:

```json
{
  "preference_vector_id": "pv_123",
  "method_version": "match-score-v1",
  "categories": {
    "top": [],
    "surprising": [],
    "stretch": [],
    "avoid_or_reconsider": []
  },
  "empty_result_relaxations": [],
  "source_coverage": [],
  "scoring_anomalies": []
}
```

### POST /api/match/reports

Assembles evidence, generates AI narrative when available, validates output, and falls back deterministically.

Request:

```json
{
  "preference_vector_id": "pv_123",
  "recommendation_ids": ["rec_1", "rec_2", "rec_3"],
  "locale": "en",
  "generation_mode": "ai_with_fallback"
}
```

Response:

```json
{
  "report_id": "report_123",
  "status": "generated",
  "generated_by": "ai",
  "validation_status": "passed",
  "sections": [],
  "limitations": [],
  "source_refs": [],
  "guardrail_events": []
}
```

### GET /api/match/reports/{report_id}

Returns saved report snapshot when session/share access allows.

Query:

- `locale`: optional `en`/`nl`; may regenerate narrative from same deterministic snapshot.
- `share_token`: optional raw token; backend compares hash.

### POST /api/match/reports/{report_id}/share

Creates share token.

Request:

```json
{
  "scope": "report_view",
  "locale": "en",
  "expires_in_days": 30,
  "consent_to_share": true
}
```

Response:

```json
{
  "share_url": "/shared/match/report/token",
  "expires_at": "2026-06-10T00:00:00Z"
}
```

### POST /api/match/reports/{report_id}/export

Creates export payload/PDF.

Request:

```json
{
  "export_type": "pdf",
  "locale": "en"
}
```

Response:

- `application/pdf` for PDF, or JSON status if async export is selected later.
- Export must include source metadata, freshness, confidence, and limitations.

### POST /api/match/compare

Request:

```json
{
  "preference_vector_id": "pv_123",
  "neighborhood_ids": ["nh_1", "nh_2", "nh_3"],
  "locale": "en"
}
```

Response includes 5-8 curated indicators per section, source refs, confidence, and missing states.

### POST /api/match/similar

Request:

```json
{
  "source_neighborhood_id": "nh_1",
  "preference_vector_id": "pv_123",
  "filters": { "cheaper": true, "greener": false, "calmer": true },
  "limit": 8
}
```

Response:

```json
{
  "source_neighborhood_id": "nh_1",
  "results": [
    {
      "neighborhood_id": "nh_2",
      "similarity_score": 88,
      "shared_drivers": [],
      "meaningful_differences": [],
      "constraints": [],
      "confidence": { "score": 78, "label": "medium", "reasons": [] }
    }
  ]
}
```

### GET /api/match/map

Query:

- `preference_vector_id`
- `region_config_id`
- `category`
- `min_score`

Response:

```json
{
  "bounds": [4.0, 51.7, 5.5, 52.5],
  "features": [
    {
      "type": "Feature",
      "geometry": { "type": "Point", "coordinates": [4.9, 52.37] },
      "properties": {
        "neighborhood_id": "nh_1",
        "name": "Example",
        "fit_score": 84,
        "category": "top",
        "confidence": 82,
        "freshness_status": "current"
      }
    }
  ],
  "unsupported_regions": []
}
```

### GET /api/match/listings

Query:

- `neighborhood_id`
- `journey_intent`: `buy`/`rent`/`both`
- `budget_max`
- `property_type`

Response:

```json
{
  "provider": {
    "name": "MockListingProvider",
    "mode": "mock",
    "license_status": "mock",
    "health": "healthy",
    "limitations": ["Seed listings are examples and not live supply."]
  },
  "listings": [],
  "unavailable_reason": null
}
```

### POST /api/match/alerts

Request:

```json
{
  "session_id": "anon_123",
  "preference_vector_id": "pv_123",
  "neighborhood_ids": ["nh_1", "nh_2"],
  "journey_intent": "both",
  "budget_max": 62500000,
  "rent_max": 220000,
  "property_types": ["apartment", "house"],
  "notification_type": "mock",
  "destination": "user@example.com"
}
```

Response:

```json
{
  "alert_id": "alert_123",
  "status": "active",
  "dispatch_mode": "mock",
  "created_event": "match_alert_created"
}
```

### POST /api/match/feedback

Request:

```json
{
  "session_id": "anon_123",
  "report_id": "report_123",
  "recommendation_id": "rec_123",
  "neighborhood_id": "nh_1",
  "feedback_type": "not_for_me",
  "reason_code": "too_far"
}
```

Response:

```json
{
  "feedback_event_id": "fb_123",
  "reranking_available": true,
  "explanation_code": "feedback_recorded"
}
```

### GET /api/admin/match/health

Internal read-only dashboard data.

Response:

```json
{
  "regions": [],
  "source_health": [],
  "missing_metrics": [],
  "stale_metrics": [],
  "mock_coverage": [],
  "listing_provider_status": [],
  "guardrail_events": [],
  "alert_failures": [],
  "scoring_anomalies": [],
  "success_metrics": []
}
```

## Provider Protocols

### OfficialDataProvider

```python
from typing import Protocol

class OfficialDataProvider(Protocol):
    name: str
    source_type: str

    async def fetch_metrics(self, region_config_id: str) -> list[NeighborhoodMetricRecord]:
        ...
```

Requirements:

- Include source name, source type, timestamp, geography level, confidence, and limitations for every metric.
- Never return unmarked mock data.
- Do not cache empty/error responses as successful data.

### ListingProvider

```python
class ListingProvider(Protocol):
    name: str
    mode: str

    async def fetch_listings(self, criteria: ListingCriteria) -> ListingProviderResult:
        ...
```

Requirements:

- Modes: `licensed`, `mock`, `user_provided`, `outbound_placeholder`, `unavailable`.
- No scraping implementation is allowed.
- Provider status and limitations must be visible in API and admin dashboard.

### NotificationProvider

```python
class NotificationProvider(Protocol):
    name: str
    mode: str

    async def dispatch(self, alert: AlertRule, matches: list[Listing]) -> NotificationDispatchRecord:
        ...
```

Requirements:

- Mock provider records intended sends.
- Failures are logged and visible in admin health.

### ReportGenerator

```python
class ReportGenerator(Protocol):
    async def generate(self, report_input: ReportInput) -> ReportOutput:
        ...
```

Requirements:

- Receives structured evidence-only input.
- Cannot modify scores, categories, confidence, or source metadata.
- Output is schema-validated and guardrail-checked before persistence.

### InstrumentationSink

```python
class InstrumentationSink(Protocol):
    async def record(self, event: AnalyticsEvent) -> None:
        ...
```

Required events:

- `match_quiz_started`
- `match_quiz_completed`
- `match_report_viewed`
- `match_neighborhood_saved`
- `match_listing_clicked`
- `match_alert_created`
- `match_feedback_submitted`
