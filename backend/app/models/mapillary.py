from pydantic import BaseModel, Field


class MapillaryImage(BaseModel):
    id: str
    captured_at: str | None = None
    is_pano: bool = False
    compass_angle: float | None = None
    distance_m: float | None = Field(default=None, ge=0)
    look_at_delta_deg: float | None = Field(default=None, ge=0, le=180)
    thumb_1024_url: str | None = None
    thumb_2048_url: str | None = None
    viewer_url: str
    embed_url: str


class MapillaryResponse(BaseModel):
    address_id: str
    image: MapillaryImage | None = None
    source: str = "Mapillary Graph API"
    source_date: str | None = None
    license: str = "CC BY-SA 4.0"
    attribution: str = "(c) Mapillary contributors"
    message: str | None = None
