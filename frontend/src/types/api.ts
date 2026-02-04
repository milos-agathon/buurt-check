export interface AddressSuggestion {
  id: string;
  display_name: string;
  type: string;
  score: number;
}

export interface SuggestResponse {
  suggestions: AddressSuggestion[];
}

export interface ResolvedAddress {
  id: string;
  nummeraanduiding_id?: string;
  adresseerbaar_object_id?: string;
  display_name: string;
  street?: string;
  house_number?: string;
  house_letter?: string;
  addition?: string;
  postcode?: string;
  city?: string;
  municipality?: string;
  province?: string;
  latitude?: number;
  longitude?: number;
  rd_x?: number;
  rd_y?: number;
  buurt_code?: string;
  wijk_code?: string;
}

export interface BuildingFacts {
  pand_id: string;
  construction_year?: number;
  status?: string;
  status_en?: string;
  intended_use: string[];
  intended_use_en: string[];
  num_units?: number;
  floor_area_m2?: number;
  footprint_geojson?: GeoJSON.Geometry;
  document_date?: string;
}

export interface BuildingFactsResponse {
  address_id: string;
  building?: BuildingFacts;
  message?: string;
}
