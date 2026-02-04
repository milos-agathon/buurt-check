from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # CORS
    cors_origins: list[str] = ["http://localhost:5173"]

    # External API base URLs
    locatieserver_base: str = "https://api.pdok.nl/bzk/locatieserver/search/v3_1"
    bag_wfs_base: str = "https://service.pdok.nl/kadaster/bag/wfs/v2_0"

    # Redis
    redis_url: str = "redis://localhost:6379"

    # Cache TTLs (seconds)
    cache_ttl_suggest: int = 3600  # 1 hour
    cache_ttl_lookup: int = 86400  # 24 hours
    cache_ttl_building: int = 86400  # 24 hours

    model_config = {"env_prefix": "BUURT_"}


settings = Settings()
