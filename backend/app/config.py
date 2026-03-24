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
    pvgis_tmy_base: str = "https://re.jrc.ec.europa.eu/api/v5_2/tmy"

    # PDOK Luchtfoto (aerial orthophotography — Kadaster, CC BY 4.0)
    luchtfoto_wms_base: str = "https://service.pdok.nl/hwh/luchtfotorgb/wms/v1_0"

    # PDOK BRT Achtergrondkaart (background map — Kadaster, CC BY 4.0)
    brt_wms_base: str = (
        "https://service.pdok.nl/brt/achtergrondkaart/wms/v2_0"
    )

    # Leefbaarometer
    leefbaarometer_wfs_base: str = "https://geo.leefbaarometer.nl/lbm3/ows"

    # Database
    database_path: str = "buurt_check.db"
    turso_database_url: str = ""
    turso_auth_token: str = ""

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

    # Metrics / observability
    metrics_enabled: bool = False
    metrics_token: str | None = None

    # Feature flags
    enable_lod22_roofs: bool = True
    enable_lod22_context_enrichment: bool = False
    three_d_conservative_mode: bool = False

    # forge3d server-side rendering (in-process, requires GPU)
    forge3d_enabled: bool = False
    forge3d_shadow_technique: str = "pcss"  # pcss | vsm | evsm | pcf
    forge3d_shadow_map_size: int = 4096
    forge3d_snapshot_width: int = 1800
    forge3d_snapshot_height: int = 1200
    forge3d_jpeg_quality: float = 0.82
    forge3d_render_timeout_seconds: float = 15.0

    # Stripe
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""
    stripe_price_cents: int = 399  # EUR 3.99
    base_url: str = "http://localhost:5173"

    # Google Play Billing (Android Path A)
    google_play_enabled: bool = False
    google_play_package_name: str = ""
    google_play_product_id: str = "full_dossier_unlock"
    google_play_service_account_json: str = ""
    google_play_service_account_file: str = ""

    # Apple App Store Billing (iOS Path A)
    apple_enabled: bool = False
    apple_bundle_id: str = "nl.buurtcheck.app.ios"
    apple_product_id: str = "full_dossier_unlock"
    apple_environment: str = "production"
    apple_issuer_id: str = ""
    apple_key_id: str = ""
    apple_private_key_file: str = ""
    apple_private_key_pem: str = ""
    apple_app_store_id: str = ""

    # Rate limiting
    rate_limit_enabled: bool = True

    # Sentry (error monitoring)
    sentry_dsn: str = ""
    sentry_environment: str = "dev"

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
    cache_ttl_weather_tmy: int = 31536000  # 365 days (TMY is static climatology)
    cache_ttl_shadow_render: int = 86400  # 24 hours (forge3d rendered images)
    pdf_export_sunlight_wait_seconds: float = 20.0

    # Load env vars whether uvicorn is started from repo root or backend/.
    model_config = {
        "env_prefix": "BUURT_",
        "env_file": (".env", "backend/.env"),
        "extra": "ignore",
    }


settings = Settings()
