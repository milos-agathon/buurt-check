import json
from pathlib import Path


def test_known_address_recall_fixture_has_paid_beta_minimum():
    fixture_path = Path(__file__).parent / "fixtures" / "prebid_known_address_recall.json"
    rows = json.loads(fixture_path.read_text(encoding="utf-8"))

    assert len(rows) >= 20
    refs = set()
    for row in rows:
        assert row["fixture_status"] == "fixture_backed"
        assert "Amsterdam" in row["address"]
        assert row["official_source_ref"]
        assert row["source_date"]
        assert row["context"]
        refs.add(row["official_source_ref"])
    assert len(refs) >= 19
