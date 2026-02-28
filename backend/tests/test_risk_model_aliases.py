from app.models.risk import RiskLevel


def test_risk_level_alias_members_are_backward_compatible() -> None:
    assert RiskLevel.good is RiskLevel.low
    assert RiskLevel.moderate is RiskLevel.medium
    assert RiskLevel.poor is RiskLevel.high


def test_risk_level_alias_wire_values_remain_legacy() -> None:
    assert RiskLevel.good.value == "low"
    assert RiskLevel.moderate.value == "medium"
    assert RiskLevel.poor.value == "high"
