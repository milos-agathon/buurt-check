from pathlib import Path

from app.services.match.model_selection import ModelSelectionService


def test_model_selection_uses_weighted_scoring_without_validation_labels(tmp_path):
    selector = ModelSelectionService(labels_path=tmp_path / "missing-labels.json")

    decision = selector.select_mode()

    assert decision.model_mode == "weighted_scoring"
    assert decision.evaluation_status == "not_validated_no_labels"
    assert decision.predictive_probability_available is False
    assert decision.public_model_version == "match-score-v1"
    assert decision.raw_model_name is None


def test_model_selection_keeps_weighted_scoring_when_labels_lack_validation_evidence(tmp_path):
    labels_path = tmp_path / "labels.json"
    labels_path.write_text('{"validation_labels": [{"session_id": "s", "chosen": "nh"}]}')
    selector = ModelSelectionService(labels_path=labels_path)

    decision = selector.select_mode()

    assert decision.model_mode == "weighted_scoring"
    assert decision.predictive_probability_available is False
    assert decision.evaluation_status == "not_validated_missing_evaluation"
    assert decision.raw_model_name is None


def test_model_selection_stub_only_allows_predictive_mode_with_labels_and_evaluation(
    tmp_path,
):
    labels_path = tmp_path / "labels.json"
    labels_path.write_text(
        '{"validation_labels": [{"session_id": "s", "chosen": "nh"}],'
        '"evaluation_results": {"validated": true, "auc": 0.72}}'
    )
    selector = ModelSelectionService(labels_path=labels_path)

    decision = selector.select_mode()

    assert decision.model_mode == "predictive_candidate"
    assert decision.predictive_probability_available is True
    assert decision.evaluation_status == "validated_labels_available"
    assert decision.raw_model_name is None


def test_backend_match_first_code_does_not_expose_forbidden_model_claims():
    source_root = Path("backend/app")
    checked = "\n".join(
        path.read_text(encoding="utf-8")
        for path in source_root.rglob("*.py")
        if "services/match" in path.as_posix() or path.name == "match.py"
    ).lower()

    forbidden = [
        "predictive_probability\": true",
        "perfect fit",
        "objective best",
        "highest predictive power",
    ]
    for phrase in forbidden:
        assert phrase not in checked
