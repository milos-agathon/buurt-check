from pydantic import BaseModel


class AddressSuggestion(BaseModel):
    id: str
    display_name: str
    type: str
    score: float


class SuggestResponse(BaseModel):
    suggestions: list[AddressSuggestion]


class ResolvedAddress(BaseModel):
    id: str
    nummeraanduiding_id: str | None = None
    adresseerbaar_object_id: str | None = None
    display_name: str
    street: str | None = None
    house_number: str | None = None
    house_letter: str | None = None
    addition: str | None = None
    postcode: str | None = None
    city: str | None = None
    municipality: str | None = None
    province: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    rd_x: float | None = None
    rd_y: float | None = None
    buurt_code: str | None = None
    wijk_code: str | None = None
