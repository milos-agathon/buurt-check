from app.config import Settings


def test_mapillary_token_reads_prefixed_env(monkeypatch):
    monkeypatch.setenv("BUURT_MAPILLARY_ACCESS_TOKEN", "prefixed-token")
    monkeypatch.delenv("MAPILLARY_ACCESS_TOKEN", raising=False)

    settings = Settings(_env_file=None)

    assert settings.mapillary_access_token == "prefixed-token"


def test_mapillary_token_reads_unprefixed_env(monkeypatch):
    monkeypatch.delenv("BUURT_MAPILLARY_ACCESS_TOKEN", raising=False)
    monkeypatch.setenv("MAPILLARY_ACCESS_TOKEN", "plain-token")

    settings = Settings(_env_file=None)

    assert settings.mapillary_access_token == "plain-token"
