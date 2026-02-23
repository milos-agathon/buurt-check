from app.services.scoring import normalize_svf_score


def test_normalize_svf_score_open_sky():
    assert normalize_svf_score(0.8) == 80


def test_normalize_svf_score_enclosed():
    assert normalize_svf_score(0.15) == 15


def test_normalize_svf_score_none():
    assert normalize_svf_score(None) is None


def test_normalize_svf_score_clamps():
    assert normalize_svf_score(1.5) == 100
    assert normalize_svf_score(-0.1) == 0
