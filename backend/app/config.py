from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # CORS
    cors_origins: list[str] = ["http://localhost:5173"]

    # External API base URLs
    locatieserver_base: str = "https://api.pdok.nl/bzk/locatieserver/search/v3_1"
    bag_wfs_base: str = "https://service.pdok.nl/kadaster/bag/wfs/v2_0"
    three_d_bag_base: str = "https://api.3dbag.nl"
    rivm_alo_wms_base: str = "https://data.rivm.nl/geo/alo/wms"
    rivm_gcn_wms_base: str = "https://data.rivm.nl/geo/gcn/wms"
    climate_atlas_wms_base: str = "https://maps1.klimaatatlas.net/geoserver/ows"
    climate_atlas_layers_index: str = "https://maps1.klimaatatlas.net/geoserver/rest/layers.json"

    # Leefbaarometer
    leefbaarometer_wfs_base: str = "https://geo.leefbaarometer.nl/lbm3/ows"

    # Redis
    redis_url: str = "redis://localhost:6379"

    # CBS Wijken & Buurten
    cbs_wijken_buurten_base: str = "https://api.pdok.nl/cbs/wijken-en-buurten-2024/ogc/v1"
    cbs_wijken_buurten_fallback_base: str = (
        "https://api.pdok.nl/cbs/wijken-en-buurten-2023/ogc/v1"
    )
    cbs_crime_yearly_base: str = "https://dataderden.cbs.nl/ODataApi/OData/47018NED"
    cbs_crime_monthly_base: str = "https://dataderden.cbs.nl/ODataApi/OData/47022NED"

    # PDOK BRO (Basisregistratie Ondergrond) — soil type data
    bro_wfs_base: str = (
        "https://service.pdok.nl/bzk/bro-bodemkundigevlakkenkaart/wfs/v1_0"
    )

    # Property warnings
    # Last verified: 2026-02-13. Recheck annually — municipalities occasionally
    # convert erfpacht portfolios to eigendom or adopt new erfpacht policies.
    erfpacht_municipalities: list[str] = [
        "Amsterdam", "Den Haag", "Rotterdam", "Utrecht",
        "Leiden", "Zaanstad", "Amstelveen", "Haarlem",
        "Gouda", "Arnhem", "Tiel",
    ]

    # Tier-B data
    energy_label_base: str = "https://public.ep-online.nl/api/v5/PandEnergielabel/Adres"
    energy_label_api_key: str | None = None

    # Metrics / observability
    metrics_enabled: bool = False
    metrics_token: str | None = None

    # Feature flags
    enable_lod22_roofs: bool = True
    enable_lod22_context_enrichment: bool = False

    # Cache TTLs (seconds)
    cache_ttl_suggest: int = 3600  # 1 hour
    cache_ttl_lookup: int = 86400  # 24 hours
    cache_ttl_building: int = 86400  # 24 hours
    cache_ttl_neighborhood_3d: int = 86400  # 24 hours
    cache_ttl_risk_cards: int = 604800  # 7 days
    cache_ttl_neighborhood: int = 2592000  # 30 days
    cache_ttl_wms_tile: int = 86400  # 24 hours
    cache_ttl_tier_b: int = 604800  # 7 days
    cache_ttl_property_warnings: int = 604800  # 7 days
    cache_ttl_foundation: int = 2592000  # 30 days (soil doesn't change)
    cache_ttl_livability: int = 2592000  # 30 days

    # Load env vars whether uvicorn is started from repo root or backend/.
    model_config = {
        "env_prefix": "BUURT_",
        "env_file": (".env", "backend/.env"),
    }


settings = Settings()
