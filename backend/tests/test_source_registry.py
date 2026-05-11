from app.config import settings
from app.services.source_registry import get_prebid_source_specs


def test_registry_marks_p0_sources():
    specs = get_prebid_source_specs(municipality="Amsterdam")
    p0_ids = {spec.source_id for spec in specs if spec.priority == "p0"}
    assert p0_ids == {"official_publications"}
    publications = next(spec for spec in specs if spec.source_id == "official_publications")
    assert publications.authority == "KOOP / officielebekendmakingen.nl"


def test_registry_enables_p1_sources_by_default():
    specs = get_prebid_source_specs(municipality="Amsterdam")
    p1 = {spec.source_id: spec for spec in specs if spec.priority == "p1"}
    assert {"pdok_parcel", "wkpb", "rce_culture", "ep_online", "rdw_parking"} == set(p1)
    assert p1["pdok_parcel"].enabled is True
    assert p1["wkpb"].enabled is True
    assert p1["rce_culture"].enabled is True
    assert p1["ep_online"].enabled is True
    assert p1["rdw_parking"].enabled is True


def test_registry_treats_disabled_applicable_p0_as_failed(monkeypatch):
    monkeypatch.setattr(settings, "prebid_official_publications_enabled", False)
    specs = get_prebid_source_specs(municipality="Amsterdam")
    publications = next(spec for spec in specs if spec.source_id == "official_publications")
    assert publications.enabled is False
    assert publications.inactive_status == "failed"


def test_registry_marks_geometry_dependent_sources():
    specs = get_prebid_source_specs(municipality="Amsterdam")
    geometry_ids = {spec.source_id for spec in specs if spec.requires_geometry}
    assert {"pdok_parcel", "wkpb", "rce_culture", "rdw_parking"}.issubset(
        geometry_ids
    )
    publications = next(spec for spec in specs if spec.source_id == "official_publications")
    assert publications.requires_geometry is False


def test_registry_can_disable_ep_online_independently(monkeypatch):
    monkeypatch.setattr(settings, "prebid_enable_p1_sources", True)
    monkeypatch.setattr(settings, "prebid_ep_online_enabled", False)
    monkeypatch.setattr(settings, "ep_online_api_key", "test-key")
    specs = get_prebid_source_specs(municipality="Amsterdam")
    ep_online = next(spec for spec in specs if spec.source_id == "ep_online")
    assert ep_online.enabled is False
    assert ep_online.inactive_status == "skipped"


def test_registry_has_method_versions_for_advertised_sources():
    specs = get_prebid_source_specs(municipality="Amsterdam")
    advertised_ids = {
        "official_publications",
        "pdok_parcel",
        "wkpb",
        "rce_culture",
        "ep_online",
        "rdw_parking",
    }
    missing = [
        spec.source_id
        for spec in specs
        if spec.source_id in advertised_ids and not spec.method_version
    ]
    assert missing == []
