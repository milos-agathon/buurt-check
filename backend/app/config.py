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

    # Redis
    redis_url: str = "redis://localhost:6379"

    # Cache TTLs (seconds)
    cache_ttl_suggest: int = 3600  # 1 hour
    cache_ttl_lookup: int = 86400  # 24 hours
    cache_ttl_building: int = 86400  # 24 hours
    cache_ttl_neighborhood_3d: int = 86400  # 24 hours
    cache_ttl_risk_cards: int = 604800  # 7 days

    model_config = {"env_prefix": "BUURT_"}


settings = Settings()
