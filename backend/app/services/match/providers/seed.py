from __future__ import annotations

import json
from pathlib import Path

from app.models.match import (
    ConfidenceScore,
    DataFreshnessStatus,
    MetricSource,
    Neighborhood,
    NeighborhoodFeatureVector,
    NeighborhoodMetric,
    SeedImportResult,
    SourceHealthSnapshot,
    SourceRun,
)
from app.services.match.evidence import calculate_confidence

MVP_REGION_CONFIG_ID = "mvp-randstad-eindhoven-seed"
_SEED_FILE = Path(__file__).resolve().parents[3] / "data" / "match_seed" / "neighborhoods.json"


class SeedMockImporter:
    name = "SeedMockImporter"
    provider_type = "mock"

    async def load_seed_data(self, region_config_id: str) -> SeedImportResult:
        if region_config_id != MVP_REGION_CONFIG_ID:
            raise ValueError(f"Unsupported seed region: {region_config_id}")

        payload = json.loads(_SEED_FILE.read_text(encoding="utf-8"))
        sources_by_id: dict[str, MetricSource] = {}
        neighborhoods: list[Neighborhood] = []
        metrics: list[NeighborhoodMetric] = []
        vectors: list[NeighborhoodFeatureVector] = []

        for row in payload["neighborhoods"]:
            neighborhoods.append(
                Neighborhood(
                    neighborhood_id=row["neighborhood_id"],
                    official_code=row.get("official_code"),
                    name_nl=row["name_nl"],
                    name_en=row.get("name_en"),
                    municipality=row["municipality"],
                    province=row.get("province"),
                    geography_level=row["geography_level"],
                    centroid_rd_x=row.get("centroid_rd_x"),
                    centroid_rd_y=row.get("centroid_rd_y"),
                    centroid_lat=row.get("centroid_lat"),
                    centroid_lng=row.get("centroid_lng"),
                    supported_region=row["supported_region"],
                    mock_status="seeded_mock",
                )
            )

            feature_values: dict[str, float | None] = {}
            feature_sources: dict[str, list[str]] = {}
            missing_features: list[str] = []
            stale_features: list[str] = []
            feature_metric_sources: list[MetricSource] = []
            seen_metric_keys: set[str] = set()

            for metric_row in row["metrics"]:
                metric_key = metric_row["metric_key"]
                if metric_key in seen_metric_keys:
                    raise ValueError(
                        f"duplicate metric_key {metric_key} for {row['neighborhood_id']}"
                    )
                seen_metric_keys.add(metric_key)
                freshness_status = DataFreshnessStatus(metric_row["freshness_status"])
                source_type = (
                    "missing"
                    if freshness_status == DataFreshnessStatus.unavailable
                    else "mock"
                )
                source_id = f"src_{row['neighborhood_id']}_{metric_row['metric_key']}"
                source = MetricSource(
                    source_id=source_id,
                    source_name="MOCK DATA - Buurt Check seed fixture",
                    source_type=source_type,
                    metric_name=metric_row["metric_key"],
                    license_status="unavailable" if source_type == "missing" else "mock",
                    measurement_date=metric_row.get("measurement_date"),
                    retrieved_at=payload["retrieved_at"],
                    geography_level=metric_row.get("geography_level", row["geography_level"]),
                    method_version=payload["method_version"],
                    limitations=metric_row["limitations"],
                    confidence=metric_row["confidence"],
                    freshness_status=freshness_status,
                )
                sources_by_id[source.source_id] = source
                feature_metric_sources.append(source)
                metric = NeighborhoodMetric(
                    metric_id=f"metric_{row['neighborhood_id']}_{metric_row['metric_key']}",
                    neighborhood_id=row["neighborhood_id"],
                    metric_key=metric_row["metric_key"],
                    raw_value=metric_row["raw_value"],
                    normalized_value=metric_row.get("normalized_value"),
                    source=source,
                    freshness_status=freshness_status,
                    confidence=metric_row["confidence"],
                    geography_level=source.geography_level,
                    limitations=metric_row["limitations"],
                    imported_at=payload["retrieved_at"],
                )
                metrics.append(metric)
                feature_values[metric.metric_key] = metric.normalized_value
                if metric.normalized_value is None:
                    missing_features.append(metric.metric_key)
                else:
                    feature_sources[metric.metric_key] = [source.source_id]
                if freshness_status == DataFreshnessStatus.stale:
                    stale_features.append(metric.metric_key)

            completeness_score = round(
                100
                * len([value for value in feature_values.values() if value is not None])
                / len(feature_values)
            )
            confidence = calculate_confidence(
                feature_metric_sources,
                completeness_score=completeness_score,
            )
            vector_freshness = (
                DataFreshnessStatus.unavailable
                if missing_features
                else DataFreshnessStatus.stale
                if stale_features
                else DataFreshnessStatus.mock
            )
            limitations = sorted(
                {
                    limitation
                    for source in feature_metric_sources
                    for limitation in source.limitations
                }
                | {"match.results.limitations.seed_mock_feature_matrix"}
            )
            vectors.append(
                NeighborhoodFeatureVector(
                    feature_vector_id=f"fv_{row['neighborhood_id']}_seed_v1",
                    neighborhood_id=row["neighborhood_id"],
                    method_version="match-feature-seed-v1",
                    features=feature_values,
                    feature_sources=feature_sources,
                    completeness_score=completeness_score,
                    confidence=ConfidenceScore(score=confidence.score, reasons=confidence.reasons),
                    missing_features=missing_features,
                    stale_features=stale_features,
                    freshness_status=vector_freshness,
                    limitations=limitations,
                    created_at=payload["retrieved_at"],
                )
            )

        source_run = SourceRun(
            source_run_id="run_seed_20260511",
            provider_name=self.name,
            provider_type=self.provider_type,
            region_config_id=region_config_id,
            status="succeeded",
            started_at=payload["retrieved_at"],
            finished_at=payload["retrieved_at"],
            records_imported=len(metrics),
            records_failed=0,
        )
        source_health = SourceHealthSnapshot(
            source_health_id="health_seed_20260511",
            provider_name=self.name,
            region_config_id=region_config_id,
            health_status="mock_only",
            last_success_at=payload["retrieved_at"],
            stale_metric_count=len(
                [
                    metric
                    for metric in metrics
                    if metric.freshness_status == DataFreshnessStatus.stale
                ]
            ),
            missing_metric_count=len(
                [
                    metric
                    for metric in metrics
                    if metric.freshness_status == DataFreshnessStatus.unavailable
                ]
            ),
            mock_metric_count=len(
                [metric for metric in metrics if metric.source.source_type == "mock"]
            ),
            failed_run_count=0,
            details={"dataset_label": payload["dataset_label"]},
            created_at=payload["retrieved_at"],
        )
        return SeedImportResult(
            region_config_id=region_config_id,
            neighborhoods=neighborhoods,
            sources=list(sources_by_id.values()),
            metrics=metrics,
            feature_vectors=vectors,
            source_run=source_run,
            source_health=[source_health],
        )
