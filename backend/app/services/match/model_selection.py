from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

SCORING_VERSION = "match-score-v1"


@dataclass(frozen=True)
class ModelSelectionDecision:
    model_mode: str
    evaluation_status: str
    predictive_probability_available: bool
    public_model_version: str
    raw_model_name: str | None = None


class ModelSelectionService:
    def __init__(self, labels_path: Path | None = None) -> None:
        self.labels_path = labels_path

    def select_mode(self) -> ModelSelectionDecision:
        payload = self._validation_payload()
        if self._has_validation_labels(payload) and self._has_validation_evaluation(payload):
            return ModelSelectionDecision(
                model_mode="predictive_candidate",
                evaluation_status="validated_labels_available",
                predictive_probability_available=True,
                public_model_version=SCORING_VERSION,
                raw_model_name=None,
            )
        if self._has_validation_labels(payload):
            return ModelSelectionDecision(
                model_mode="weighted_scoring",
                evaluation_status="not_validated_missing_evaluation",
                predictive_probability_available=False,
                public_model_version=SCORING_VERSION,
                raw_model_name=None,
            )
        return ModelSelectionDecision(
            model_mode="weighted_scoring",
            evaluation_status="not_validated_no_labels",
            predictive_probability_available=False,
            public_model_version=SCORING_VERSION,
            raw_model_name=None,
        )

    def try_predictive_ranking(self, results: object) -> object:
        return results

    def _validation_payload(self) -> dict[str, object] | None:
        if self.labels_path is None or not self.labels_path.exists():
            return None
        try:
            payload = json.loads(self.labels_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return None
        return payload if isinstance(payload, dict) else None

    def _has_validation_labels(self, payload: dict[str, object] | None) -> bool:
        if payload is None:
            return False
        labels = payload.get("validation_labels") if isinstance(payload, dict) else None
        return isinstance(labels, list) and len(labels) > 0

    def _has_validation_evaluation(self, payload: dict[str, object] | None) -> bool:
        if payload is None:
            return False
        evaluation = payload.get("evaluation_results")
        if not isinstance(evaluation, dict):
            return False
        if evaluation.get("validated") is True:
            return True
        return evaluation.get("status") in {"validated", "passed"}
