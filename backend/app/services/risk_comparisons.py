import json
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field, ValidationError, field_validator, model_validator

from app.models.neighborhood import UrbanizationLevel
from app.models.risk import (
    ComparisonPattern,
    RiskCardsResponse,
    RiskComparisonRow,
    RiskComparisonsResponse,
)
from app.services.scoring import normalize_sunlight_score

RiskComparisonCategory = Literal["noise", "air_quality", "climate_stress", "sunlight"]

_EXPECTED_CATEGORIES: tuple[RiskComparisonCategory, ...] = (
    "noise",
    "air_quality",
    "climate_stress",
    "sunlight",
)
_EXPECTED_URBANIZATION_LEVELS = set(UrbanizationLevel)
_RISK_BENCHMARK_ARTIFACT_PATH = (
    Path(__file__).resolve().parent.parent / "data" / "risk_benchmarks.json"
)


class BenchmarkMetadata(BaseModel):
    benchmark_family: str = Field(min_length=1)
    label_code: str = Field(min_length=1)
    label_key: str = Field(min_length=1)
    source: str = Field(min_length=1)
    source_date: date
    derivation_summary: str = Field(min_length=1)
    owner: str = Field(min_length=1)
    review_due_date: date


class PeerBenchmarkSpec(BenchmarkMetadata):
    role: Literal["peer"]
    scope: Literal["urbanization_peer"]
    pattern: ComparisonPattern = ComparisonPattern.solid
    scores: dict[UrbanizationLevel, int]

    @field_validator("scores")
    @classmethod
    def validate_scores(
        _cls, scores: dict[UrbanizationLevel, int]
    ) -> dict[UrbanizationLevel, int]:
        if set(scores) != _EXPECTED_URBANIZATION_LEVELS:
            raise ValueError(
                "Peer benchmark rows must cover every urbanization level"
            )
        for score in scores.values():
            if not 0 <= score <= 100:
                raise ValueError("Benchmark scores must be between 0 and 100")
        return scores

    @model_validator(mode="after")
    def validate_pattern(self) -> "PeerBenchmarkSpec":
        if self.pattern != ComparisonPattern.solid:
            raise ValueError("Peer benchmark rows must use a solid pattern")
        return self


class SingleBenchmarkSpec(BenchmarkMetadata):
    role: Literal["national", "reference"]
    scope: Literal["national", "reference"]
    pattern: ComparisonPattern
    score: int = Field(ge=0, le=100)

    @model_validator(mode="after")
    def validate_shape(self) -> "SingleBenchmarkSpec":
        if self.role != self.scope:
            raise ValueError("Single benchmark role and scope must match")
        if self.role == "reference" and self.pattern != ComparisonPattern.dashed:
            raise ValueError("Reference benchmark rows must use a dashed pattern")
        if self.role == "national" and self.pattern != ComparisonPattern.solid:
            raise ValueError("National benchmark rows must use a solid pattern")
        return self


class CategoryBenchmarkSpec(BaseModel):
    category: RiskComparisonCategory
    peer: PeerBenchmarkSpec
    national: SingleBenchmarkSpec
    reference: SingleBenchmarkSpec

    @model_validator(mode="after")
    def validate_roles(self) -> "CategoryBenchmarkSpec":
        if self.peer.role != "peer":
            raise ValueError("Peer benchmark block must use role='peer'")
        if self.national.role != "national":
            raise ValueError("National benchmark block must use role='national'")
        if self.reference.role != "reference":
            raise ValueError("Reference benchmark block must use role='reference'")
        return self


class RiskBenchmarkArtifact(BaseModel):
    version: str = Field(min_length=1)
    categories: dict[RiskComparisonCategory, CategoryBenchmarkSpec]

    @model_validator(mode="after")
    def validate_categories(self) -> "RiskBenchmarkArtifact":
        if set(self.categories) != set(_EXPECTED_CATEGORIES):
            raise ValueError("Risk benchmark artifact must define all categories")
        for name, spec in self.categories.items():
            if spec.category != name:
                raise ValueError(
                    f"Category block '{name}' must declare category='{name}'"
                )
        return self


def load_risk_benchmark_artifact(
    path: Path | None = None,
) -> RiskBenchmarkArtifact:
    artifact_path = path or _RISK_BENCHMARK_ARTIFACT_PATH
    try:
        raw = json.loads(artifact_path.read_text(encoding="utf-8"))
        return RiskBenchmarkArtifact.model_validate(raw)
    except FileNotFoundError as exc:
        raise RuntimeError(
            f"Risk benchmark artifact not found: {artifact_path}"
        ) from exc
    except (json.JSONDecodeError, ValidationError, ValueError) as exc:
        raise RuntimeError(
            f"Risk benchmark artifact is invalid: {artifact_path}"
        ) from exc


def _clamp_score(value: int) -> int:
    return max(0, min(100, value))


def _address_score(cards: RiskCardsResponse, category: RiskComparisonCategory) -> int | None:
    if category == "noise":
        return cards.noise.score
    if category == "air_quality":
        return cards.air_quality.score
    if category == "climate_stress":
        return cards.climate_stress.score
    if cards.sunlight is not None:
        if cards.sunlight.score is not None:
            return cards.sunlight.score
        if cards.sunlight.winter_hours is not None:
            return normalize_sunlight_score(cards.sunlight.winter_hours)
    return None


def _comparison_row_from_spec(
    spec: PeerBenchmarkSpec | SingleBenchmarkSpec,
    *,
    value: int,
) -> RiskComparisonRow:
    return RiskComparisonRow(
        label_code=spec.label_code,
        value=_clamp_score(value),
        pattern=spec.pattern,
        source=spec.source,
        source_date=spec.source_date.isoformat(),
        role=spec.role,
        benchmark_family=spec.benchmark_family,
        label_key=spec.label_key,
        scope=spec.scope,
    )


_RISK_BENCHMARK_ARTIFACT = load_risk_benchmark_artifact()


def _build_rows(
    category: RiskComparisonCategory,
    cards: RiskCardsResponse,
    urbanization: UrbanizationLevel,
) -> list[RiskComparisonRow]:
    benchmarks = _RISK_BENCHMARK_ARTIFACT.categories[category]
    rows = [
        _comparison_row_from_spec(
            benchmarks.peer,
            value=benchmarks.peer.scores[urbanization],
        ),
        _comparison_row_from_spec(
            benchmarks.national,
            value=benchmarks.national.score,
        ),
        _comparison_row_from_spec(
            benchmarks.reference,
            value=benchmarks.reference.score,
        ),
    ]
    address_value = _address_score(cards, category)
    if address_value is not None:
        rows.append(
            RiskComparisonRow(
                label_code="address",
                value=_clamp_score(address_value),
                role="address",
                benchmark_family="address_score",
                label_key="risk.detail.address",
                scope="address",
            )
        )
    return rows


def build_risk_comparisons(
    vbo_id: str,
    cards: RiskCardsResponse,
    urbanization: UrbanizationLevel = UrbanizationLevel.unknown,
) -> RiskComparisonsResponse:
    return RiskComparisonsResponse(
        address_id=vbo_id,
        noise=_build_rows("noise", cards, urbanization),
        air_quality=_build_rows("air_quality", cards, urbanization),
        climate_stress=_build_rows("climate_stress", cards, urbanization),
        sunlight=_build_rows("sunlight", cards, urbanization),
        generated_at=datetime.now(UTC).date().isoformat(),
    )
