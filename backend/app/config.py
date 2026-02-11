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
    mapillary_graph_base: str = "https://graph.mapillary.com"
    mapillary_access_token: str | None = None
    mapillary_search_radius_m: int = 60
    mapillary_max_results: int = 30

    # Redis
    redis_url: str = "redis://localhost:6379"

    # CBS Wijken & Buurten
    cbs_wijken_buurten_base: str = "https://api.pdok.nl/cbs/wijken-en-buurten-2024/ogc/v1"
    cbs_crime_yearly_base: str = "https://dataderden.cbs.nl/ODataApi/OData/47018NED"
    cbs_crime_monthly_base: str = "https://dataderden.cbs.nl/ODataApi/OData/47022NED"

    # Tier-B data
    energy_label_base: str = "https://public.ep-online.nl/api/v5/PandEnergielabel/Adres"
    energy_label_api_key: str | None = None

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
    cache_ttl_mapillary: int = 86400  # 24 hours

    model_config = {"env_prefix": "BUURT_", "env_file": ".env"}


settings = Settings()
