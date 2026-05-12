from __future__ import annotations

from collections import Counter

from app.models.match import (
    AlertDispatcherStatus,
    AlertDispatchFailure,
    AnalyticsEvent,
    DataFreshnessStatus,
    DataQualityIndicator,
    GuardrailEvent,
    MatchAdminHealthResponse,
    MissingDataIndicator,
    NotificationDispatchRecord,
    PrdTraceabilityItem,
    ProviderStatus,
    ScoringAnomalySummary,
    SeedImportResult,
    SourceFailureIndicator,
)
from app.services.match.instrumentation import log_match_observation, summarize_success_metrics

MATCH_PRD_TRACEABILITY = [
    PrdTraceabilityItem(fr_id="FR1", label="Preference quiz", status="implemented"),
    PrdTraceabilityItem(fr_id="FR2", label="Household/persona detection", status="implemented"),
    PrdTraceabilityItem(fr_id="FR3", label="Neighborhood scoring engine", status="implemented"),
    PrdTraceabilityItem(fr_id="FR4", label="Explainable match output", status="implemented"),
    PrdTraceabilityItem(fr_id="FR5", label="AI-generated report", status="implemented"),
    PrdTraceabilityItem(fr_id="FR6", label="Neighborhood comparison", status="implemented"),
    PrdTraceabilityItem(fr_id="FR7", label="Similar-neighborhood discovery", status="implemented"),
    PrdTraceabilityItem(fr_id="FR8", label="Map view", status="implemented"),
    PrdTraceabilityItem(fr_id="FR9", label="Listing connection", status="implemented"),
    PrdTraceabilityItem(fr_id="FR10", label="Alerts", status="implemented"),
    PrdTraceabilityItem(fr_id="FR11", label="Save/share report", status="implemented"),
    PrdTraceabilityItem(fr_id="FR12", label="Multilingual support", status="implemented"),
    PrdTraceabilityItem(fr_id="FR13", label="Feedback loop", status="implemented"),
    PrdTraceabilityItem(fr_id="FR14", label="Admin data dashboard", status="implemented"),
]


def summarize_guardrail_events(events: list[GuardrailEvent]) -> dict[str, object]:
    return {
        "total": len(events),
        "by_event_type": dict(Counter(event.event_type for event in events)),
        "by_action_taken": dict(Counter(event.action_taken for event in events)),
    }


def _metric_counts_by_status(seed_result: SeedImportResult) -> Counter[DataFreshnessStatus]:
    return Counter(metric.freshness_status for metric in seed_result.metrics)


def _missing_indicators(seed_result: SeedImportResult) -> list[MissingDataIndicator]:
    missing = Counter(
        metric.metric_key
        for metric in seed_result.metrics
        if metric.freshness_status == DataFreshnessStatus.unavailable
    )
    return [
        MissingDataIndicator(metric_key=key, count=count, severity="warning")
        for key, count in sorted(missing.items())
    ]


def _stale_indicators(seed_result: SeedImportResult) -> list[MissingDataIndicator]:
    stale = Counter(
        metric.metric_key
        for metric in seed_result.metrics
        if metric.freshness_status == DataFreshnessStatus.stale
    )
    return [
        MissingDataIndicator(metric_key=key, count=count, severity="warning")
        for key, count in sorted(stale.items())
    ]


def _source_failures(seed_result: SeedImportResult) -> list[SourceFailureIndicator]:
    failures: list[SourceFailureIndicator] = []
    for health in seed_result.source_health:
        if health.failed_run_count > 0:
            failures.append(
                SourceFailureIndicator(
                    provider_name=health.provider_name,
                    status="failed",
                    error_code="source_run_failed",
                )
            )
        if health.stale_metric_count or health.missing_metric_count:
            failures.append(
                SourceFailureIndicator(
                    provider_name=health.provider_name,
                    status="degraded",
                    error_code="stale_or_missing_metrics",
                )
            )
    return failures


def _alert_dispatcher_status(
    dispatch_records: list[NotificationDispatchRecord],
    provider_status: dict[str, object] | None = None,
) -> AlertDispatcherStatus:
    failures = [
        AlertDispatchFailure(alert_id=record.alert_id, error_code=record.error_code)
        for record in dispatch_records
        if record.result_status == "failed"
    ]
    if not dispatch_records and provider_status:
        return AlertDispatcherStatus(
            provider_name=str(provider_status.get("provider_name", "MockNotificationProvider")),
            health=str(provider_status.get("health", "mock_only")),  # type: ignore[arg-type]
            failures=[],
        )
    return AlertDispatcherStatus(
        provider_name=dispatch_records[0].provider_name
        if dispatch_records
        else "MockNotificationProvider",
        health="degraded" if failures else "mock_only",
        failures=failures,
    )


def _default_scoring_anomalies(seed_result: SeedImportResult) -> list[ScoringAnomalySummary]:
    missing_driver_count = sum(
        1 for vector in seed_result.feature_vectors if vector.missing_features
    )
    confidence_outlier_count = sum(
        1 for vector in seed_result.feature_vectors if vector.confidence.score < 50
    )
    anomalies: list[ScoringAnomalySummary] = []
    if missing_driver_count:
        anomalies.append(
            ScoringAnomalySummary(
                anomaly_type="missing_driver",
                severity="warning",
                count=missing_driver_count,
            )
        )
    if confidence_outlier_count:
        anomalies.append(
            ScoringAnomalySummary(
                anomaly_type="confidence_outlier",
                severity="warning",
                count=confidence_outlier_count,
            )
        )
    return anomalies


def build_admin_health_dashboard(
    *,
    seed_result: SeedImportResult,
    listing_provider_status: list[ProviderStatus] | None = None,
    notification_provider_status: dict[str, object] | None = None,
    alert_dispatch_records: list[NotificationDispatchRecord] | None = None,
    report_generation_failures: list[dict[str, object]] | None = None,
    analytics_events: list[AnalyticsEvent] | None = None,
    scoring_anomalies: list[ScoringAnomalySummary] | None = None,
) -> MatchAdminHealthResponse:
    status_counts = _metric_counts_by_status(seed_result)
    data_freshness = [
        DataQualityIndicator(label=status.value, status=status, count=count)
        for status, count in sorted(status_counts.items(), key=lambda item: item[0].value)
    ]
    mock_count = status_counts.get(DataFreshnessStatus.mock, 0)
    live_count = sum(
        count
        for status, count in status_counts.items()
        if status not in {DataFreshnessStatus.mock, DataFreshnessStatus.unavailable}
    )
    alert_status = _alert_dispatcher_status(
        alert_dispatch_records or [],
        notification_provider_status,
    )
    source_failures = _source_failures(seed_result)
    anomalies = (
        scoring_anomalies
        if scoring_anomalies is not None
        else _default_scoring_anomalies(seed_result)
    )
    success_metric_map = summarize_success_metrics(analytics_events or [])

    overall_status = "healthy"
    if source_failures or anomalies or alert_status.failures or report_generation_failures:
        overall_status = "degraded"
    elif any(health.health_status == "mock_only" for health in seed_result.source_health):
        overall_status = "mock_only"

    for failure in source_failures:
        log_match_observation(
            "provider_failure",
            provider_name=failure.provider_name,
            region_config_id=seed_result.region_config_id,
            status=failure.status,
            context={"error_code": failure.error_code},
        )
    for anomaly in anomalies:
        log_match_observation(
            "scoring_anomaly",
            provider_name="match_scoring",
            region_config_id=seed_result.region_config_id,
            status=anomaly.severity,
            context={"anomaly_type": anomaly.anomaly_type, "count": anomaly.count},
        )
    for failure in alert_status.failures:
        log_match_observation(
            "alert_dispatch_failure",
            provider_name=alert_status.provider_name,
            region_config_id=seed_result.region_config_id,
            status="failed",
            context={"alert_id": failure.alert_id, "error_code": failure.error_code},
        )

    return MatchAdminHealthResponse(
        overall_status=overall_status,  # type: ignore[arg-type]
        regions=[
            {
                "region_config_id": seed_result.region_config_id,
                "status": seed_result.source_health[0].health_status
                if seed_result.source_health
                else "unconfigured",
            }
        ],
        source_health=seed_result.source_health,
        data_freshness=data_freshness,
        missing_data=_missing_indicators(seed_result),
        stale_data=_stale_indicators(seed_result),
        source_failures=source_failures,
        scoring_anomalies=anomalies,
        listing_provider_status=listing_provider_status or [],
        alert_dispatcher_status=alert_status,
        report_generation_failures=report_generation_failures or [],
        mock_data_indicators=[
            DataQualityIndicator(label="mock_metrics", status="mock", count=mock_count)
        ],
        live_data_indicators=[
            DataQualityIndicator(
                label="current_or_aging_metrics",
                status="current",
                count=live_count,
            )
        ],
        success_metrics=list(success_metric_map.values()),
        prd_traceability=MATCH_PRD_TRACEABILITY,
    )
