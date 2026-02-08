from pydantic import BaseModel, Field


class BuildingBlock(BaseModel):
    pand_id: str
    ground_height: float
    building_height: float
    footprint: list[list[float]]  # [[dx, dy], ...] meter offsets from center
    year: int | None = None
    roof_surfaces: list[list[list[float]]] | None = None  # [surface][vertex][dx, dy, z_nap]


class Neighborhood3DCenter(BaseModel):
    lat: float
    lng: float
    rd_x: float
    rd_y: float


class Neighborhood3DResponse(BaseModel):
    address_id: str
    target_pand_id: str | None = None
    center: Neighborhood3DCenter
    buildings: list[BuildingBlock] = Field(default_factory=list)
    message: str | None = None
