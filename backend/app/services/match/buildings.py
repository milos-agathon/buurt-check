from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass
from typing import Literal
from urllib.parse import quote, urlencode

from app.config import settings
from app.models.address import ResolvedAddress
from app.models.match import (
    MatchDossierAddressCandidate,
    MatchDossierBridgeRequest,
    MatchDossierBridgeResponse,
    MatchDossierCandidateAddress,
    MatchNeighborhoodBuildingFeature,
    MatchNeighborhoodBuildingsResponse,
)
from app.models.neighborhood3d import BuildingBlock
from app.services import bag_ogc, locatieserver, three_d_bag
from app.services.bag_ogc import BagPandFootprint, BagPandFootprintPage
from app.services.match import geometry as geometry_service
from app.services.match.geometry import (
    SOURCE_REFS,
    boundary_display_bounds_wgs84,
    display_bounds_wgs84,
    load_seed_neighborhood,
    neighborhood_bounds_rd,
    rd_to_wgs84,
    validate_building_bounds,
    wgs84_bounds_to_rd,
)

_VBO_ID_PATTERN = re.compile(r"^[0-9]{16}$")
_CANDIDATE_ID_SAFE_PATTERN = re.compile(r"[^A-Za-z0-9]+")
_DEFAULT_NO_ADDRESS_REASON = "match.neighborhood.no_reliable_address"
_CANDIDATE_SELECTION_REASON = "match.neighborhood.address_candidate_selection_required"
_MANUAL_REQUIRED_REASON = "match.neighborhood.manual_address_required"
_PROVIDER_SOURCE_REF = "pdok_locatieserver_reverse"
_BAG_BUILDING_ID_PREFIX = "bag_pand_"
_BAG_LOD22_SOURCE_REF = "3dbag_lod22"
_BAG_LOD0_SOURCE_REF = "3dbag_lod0"
_PDOK_BAG_PAND_SOURCE_REF = bag_ogc.PAND_SOURCE_REF
_BAG_DATA_VERSION = "3dbag-lod22-selected-v1"
_PDOK_BAG_DATA_VERSION = bag_ogc.PAND_DATA_VERSION
_BAG_LOD22_LIMITATION = "match.results.limitations.3dbag_lod22"
_BAG_LOD0_LIMITATION = "match.results.limitations.3dbag_lod0_fallback"
_BAG_PARTIAL_LIMITATION = "match.results.limitations.3dbag_partial"
_PDOK_BAG_PAND_LIMITATION = "match.results.limitations.pdok_bag_pand"
_BUILDINGS_MORE_AVAILABLE_REASON = "match.buildings.more_available"
_BUILDINGS_PROVIDER_PARTIAL_REASON = "match.buildings.provider_partial"
_BOUNDARY_REQUIRED_DATA_VERSION = "official-boundary-required-v1"
logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class BuildingFootprintPage:
    blocks: list[BuildingBlock]
    next_cursor: str | None = None
    partial: bool = False


class DossierBridgeCandidateMismatchError(ValueError):
    """Raised when a requested Dossier bridge target is not a server candidate."""


class DossierBridgeInvalidVboIdError(ValueError):
    """Raised when a bridge request carries a malformed VBO identifier."""


def _first_vbo_id(*candidates: str | None) -> str | None:
    for candidate in candidates:
        if candidate and _VBO_ID_PATTERN.match(candidate):
            return candidate
    return None


def _dossier_return_url(payload: MatchDossierBridgeRequest) -> str:
    return (
        f"#/match/session/{quote(payload.session_id, safe='')}"
        f"/neighborhood/{quote(payload.neighborhood_id, safe='')}"
    )


def _dossier_match_context(
    payload: MatchDossierBridgeRequest,
    *,
    candidate: MatchNeighborhoodBuildingFeature,
    vbo_id: str,
    address_id: str | None = None,
    return_url: str,
) -> dict[str, object]:
    context = payload.return_context
    return {
        "jobId": context.job_id,
        "resultSetId": context.result_set_id,
        "preferenceVectorVersion": context.preference_vector_version,
        "source": context.source,
        "addressId": address_id or candidate.address_id or vbo_id,
        "buildingId": candidate.building_id,
        "returnUrl": return_url,
        **({"mapCenter": context.map_center} if context.map_center else {}),
        **({"mapZoom": context.map_zoom} if context.map_zoom is not None else {}),
        **({"listScroll": context.list_scroll} if context.list_scroll is not None else {}),
        **({"mobileMode": context.mobile_mode} if context.mobile_mode else {}),
        **({"selectedResultId": context.selected_result_id} if context.selected_result_id else {}),
        **(
            {"selectedResultRank": context.selected_result_rank}
            if context.selected_result_rank is not None
            else {}
        ),
        **({"language": context.language} if context.language else {}),
        "selectedHouseId": candidate.building_id,
    }


def _validate_payload_matches_server_candidate(
    payload: MatchDossierBridgeRequest,
    candidate: MatchNeighborhoodBuildingFeature,
) -> None:
    if payload.vbo_id is not None and not _VBO_ID_PATTERN.match(payload.vbo_id):
        raise DossierBridgeInvalidVboIdError(payload.vbo_id)

    supplied_values = {
        "building_id": payload.building_id,
        "vbo_id": payload.vbo_id,
        "address_id": payload.address_id,
        "lookup_id": payload.lookup_id,
        "selected_house_id": payload.return_context.selected_house_id,
    }
    candidate_values = {
        "building_id": candidate.building_id,
        "vbo_id": candidate.vbo_id,
        "address_id": candidate.address_id,
        "lookup_id": candidate.lookup_id,
        "selected_house_id": candidate.building_id,
    }
    for key, supplied in supplied_values.items():
        if supplied is not None and supplied != candidate_values[key]:
            raise DossierBridgeCandidateMismatchError(key)


def _candidate_centroid_wgs84(
    candidate: MatchNeighborhoodBuildingFeature,
) -> tuple[float, float] | None:
    coordinates = candidate.footprint.get("coordinates")
    if not isinstance(coordinates, list) or not coordinates:
        return None
    ring = coordinates[0]
    if not isinstance(ring, list) or not ring:
        return None

    points: list[tuple[float, float]] = []
    for point in ring:
        if (
            isinstance(point, list)
            and len(point) >= 2
            and isinstance(point[0], int | float)
            and isinstance(point[1], int | float)
        ):
            points.append((float(point[0]), float(point[1])))

    if len(points) > 1 and points[0] == points[-1]:
        points = points[:-1]
    if not points:
        return None

    longitude = sum(point[0] for point in points) / len(points)
    latitude = sum(point[1] for point in points) / len(points)
    return latitude, longitude


def _candidate_id(building_id: str, address: ResolvedAddress, index: int) -> str:
    source_id = address.id or address.adresseerbaar_object_id or str(index)
    safe_source_id = _CANDIDATE_ID_SAFE_PATTERN.sub("_", source_id).strip("_").lower()
    if not safe_source_id:
        safe_source_id = f"{index:03d}"
    return f"cand_{building_id}_{safe_source_id}"


def _address_display_params(address: ResolvedAddress, index: int) -> dict[str, str]:
    params = {
        "index": str(index),
        "label": address.display_name,
    }
    if address.house_number:
        params["houseNumber"] = address.house_number
    if address.postcode:
        params["postcode"] = address.postcode
    if address.city:
        params["city"] = address.city
    return params


def _provider_source_refs(candidate: MatchNeighborhoodBuildingFeature) -> list[str]:
    refs = [_PROVIDER_SOURCE_REF, *candidate.source_refs]
    return list(dict.fromkeys(ref for ref in refs if ref))


def _building_source_ref(block: BuildingBlock) -> str:
    return _BAG_LOD22_SOURCE_REF if block.roof_surfaces else _BAG_LOD0_SOURCE_REF


def _building_id_from_pand_id(pand_id: str) -> str:
    return f"{_BAG_BUILDING_ID_PREFIX}{pand_id}"


def _center_rd_from_bounds(bounds_rd: list[float]) -> dict[str, float]:
    west, south, east, north = bounds_rd
    return {
        "x": round((west + east) / 2, 2),
        "y": round((south + north) / 2, 2),
    }


def _rd_offset_to_wgs84(
    *,
    dx: float,
    dy: float,
    center_rd: dict[str, float],
) -> list[float]:
    exact = rd_to_wgs84(center_rd["x"] + dx, center_rd["y"] + dy)
    return [round(exact["lng"], 7), round(exact["lat"], 7)]


def _wgs84_footprint_from_rd_offsets(
    block: BuildingBlock,
    *,
    center_rd: dict[str, float],
) -> dict[str, object]:
    ring = [
        _rd_offset_to_wgs84(
            dx=point[0],
            dy=point[1],
            center_rd=center_rd,
        )
        for point in block.footprint
    ]
    if ring and ring[0] != ring[-1]:
        ring.append(ring[0])
    return {"type": "Polygon", "coordinates": [ring]}


def _building_footprint_ring(
    building: MatchNeighborhoodBuildingFeature,
) -> list[list[float]]:
    coordinates = building.footprint.get("coordinates")
    if not isinstance(coordinates, list) or not coordinates:
        return []
    ring = coordinates[0]
    if not isinstance(ring, list):
        return []
    points: list[list[float]] = []
    for point in ring:
        if (
            isinstance(point, list)
            and len(point) >= 2
            and isinstance(point[0], int | float)
            and isinstance(point[1], int | float)
        ):
            points.append([float(point[0]), float(point[1])])
    if len(points) > 1 and points[0] == points[-1]:
        points = points[:-1]
    return points if len(points) >= 3 else []


def _filter_buildings_to_boundary(
    buildings: list[MatchNeighborhoodBuildingFeature],
    boundary: dict[str, object],
) -> list[MatchNeighborhoodBuildingFeature]:
    clipped: list[MatchNeighborhoodBuildingFeature] = []
    for building in buildings:
        ring = _building_footprint_ring(building)
        if ring and geometry_service.wgs84_ring_within_boundary(ring, boundary):
            clipped.append(building)
    return clipped


def _match_feature_from_3dbag_block(
    block: BuildingBlock,
    *,
    center_rd: dict[str, float],
) -> MatchNeighborhoodBuildingFeature:
    source_ref = _building_source_ref(block)
    return MatchNeighborhoodBuildingFeature(
        building_id=_building_id_from_pand_id(block.pand_id),
        vbo_id=None,
        address_id=None,
        lookup_id=None,
        footprint=_wgs84_footprint_from_rd_offsets(
            block,
            center_rd=center_rd,
        ),
        height_m=block.building_height,
        source_refs=[source_ref],
        address_resolution="candidate",
        address_candidate_count=3,
        fallback_label_key="matchFirst.neighborhood.addressCandidate",
        geometry_source=source_ref,
        lod="2.2" if source_ref == _BAG_LOD22_SOURCE_REF else "0",
        center_rd=center_rd,
        footprint_rd=block.footprint,
        ground_height_m=block.ground_height,
        roof_surfaces=block.roof_surfaces,
        year=block.year,
        orientation_deg=block.orientation_deg,
    )


def _match_feature_from_bag_pand(
    pand: BagPandFootprint,
    *,
    center_rd: dict[str, float],
) -> MatchNeighborhoodBuildingFeature:
    return MatchNeighborhoodBuildingFeature(
        building_id=_building_id_from_pand_id(pand.pand_id),
        vbo_id=None,
        address_id=None,
        lookup_id=None,
        footprint=pand.footprint,
        height_m=None,
        source_refs=[_PDOK_BAG_PAND_SOURCE_REF],
        address_resolution="candidate" if pand.house_selectable else "unavailable",
        address_candidate_count=3 if pand.house_selectable else 0,
        fallback_label_key=(
            "matchFirst.neighborhood.addressCandidate"
            if pand.house_selectable
            else "matchFirst.neighborhood.notHouseCandidate"
        ),
        geometry_source=bag_ogc.PAND_GEOMETRY_SOURCE,
        center_rd=center_rd,
        footprint_rd=pand.footprint_rd,
        year=pand.bouwjaar,
        bag_status=pand.status,
        bag_gebruiksdoelen=pand.gebruiksdoelen,
        bag_verblijfsobject_count=pand.aantal_verblijfsobjecten,
        building_usage_classification=pand.usage_classification,
        house_selectable=pand.house_selectable,
    )


async def _fetch_lod22_buildings_for_bounds(
    *,
    bounds_rd: list[float],
    limit: int,
) -> tuple[list[BuildingBlock], bool]:
    return await three_d_bag.get_buildings_in_rd_bounds(bounds_rd, limit=limit)


async def _fetch_lod22_building_page_for_bounds(
    *,
    bounds_rd: list[float],
    limit: int,
    cursor: str | None = None,
) -> BuildingFootprintPage:
    page = await three_d_bag.get_buildings_in_rd_bounds_page(
        bounds_rd,
        limit=limit,
        cursor=cursor,
    )
    return BuildingFootprintPage(
        blocks=page.blocks,
        next_cursor=page.next_cursor,
        partial=page.partial,
    )


async def _fetch_bag_pand_footprint_page_for_bounds(
    *,
    bounds_rd: list[float],
    limit: int,
    cursor: str | None = None,
) -> BagPandFootprintPage:
    return await bag_ogc.get_pand_footprints_in_rd_bounds_page(
        bounds_rd,
        limit=limit,
        cursor=cursor,
    )


async def _real_building_candidates_for_neighborhood(
    neighborhood_id: str,
    *,
    limit: int,
) -> list[MatchNeighborhoodBuildingFeature]:
    neighborhood = await load_seed_neighborhood(neighborhood_id)
    boundary = await geometry_service.fetch_official_boundary_feature(neighborhood)
    if not geometry_service.boundary_is_official(boundary):
        return []
    bounds_wgs84 = boundary_display_bounds_wgs84(boundary or {})
    bounds_rd = (
        wgs84_bounds_to_rd(bounds_wgs84)
        if bounds_wgs84
        else neighborhood_bounds_rd(neighborhood)
    )
    center_rd = _center_rd_from_bounds(bounds_rd)
    try:
        blocks, _partial = await _fetch_lod22_buildings_for_bounds(
            bounds_rd=bounds_rd,
            limit=limit,
        )
    except Exception as exc:
        logger.warning(
            "match 3DBAG selected-neighborhood candidate lookup failed "
            "neighborhood_id=%s reason=%s",
            neighborhood_id,
            exc,
        )
        return []
    buildings = [
        _match_feature_from_3dbag_block(
            block,
            center_rd=center_rd,
        )
        for block in blocks
    ]
    return _filter_buildings_to_boundary(buildings, boundary or {})


async def _candidate_address_options(
    candidate: MatchNeighborhoodBuildingFeature,
) -> list[MatchDossierCandidateAddress]:
    if candidate.address_resolution != "candidate":
        return []

    centroid = _candidate_centroid_wgs84(candidate)
    if centroid is None:
        return []

    latitude, longitude = centroid
    try:
        addresses = await locatieserver.reverse_addresses(
            latitude=latitude,
            longitude=longitude,
            distance_m=75,
            limit=min(max(candidate.address_candidate_count, 1), 3),
        )
    except Exception as exc:
        logger.warning(
            "match dossier bridge nearby address provider failed building_id=%s reason=%s",
            candidate.building_id,
            exc,
        )
        return []

    options: list[MatchDossierCandidateAddress] = []
    seen_candidate_ids: set[str] = set()
    for index, address in enumerate(addresses[:3], start=1):
        vbo_id = _first_vbo_id(address.adresseerbaar_object_id)
        address_id = vbo_id
        candidate_id = _candidate_id(candidate.building_id, address, index)
        if candidate_id in seen_candidate_ids:
            candidate_id = f"{candidate_id}_{index:03d}"
        seen_candidate_ids.add(candidate_id)
        options.append(
            MatchDossierCandidateAddress(
                candidate_id=candidate_id,
                address_id=address_id,
                vbo_id=vbo_id,
                lookup_id=address.id or None,
                display_label_key="matchFirst.neighborhood.nearbyAddressCandidateWithLabel",
                display_params=_address_display_params(address, index),
                reliability="candidate",
                source_refs=_provider_source_refs(candidate),
                fallback_reason_code=_CANDIDATE_SELECTION_REASON,
            )
        )
    return options


def _legacy_address_candidate(
    *,
    address_id: str | None,
    vbo_id: str | None,
    lookup_id: str | None,
    reliability: Literal["resolved", "candidate", "unavailable"],
) -> MatchDossierAddressCandidate:
    return MatchDossierAddressCandidate(
        address_id=address_id,
        vbo_id=vbo_id,
        lookup_id=lookup_id,
        reliability=reliability,
    )


def _resolved_bridge_response(
    payload: MatchDossierBridgeRequest,
    *,
    candidate: MatchNeighborhoodBuildingFeature,
    address_id: str | None,
    vbo_id: str | None,
    lookup_id: str,
    reliability: Literal["resolved", "candidate", "unavailable"],
    candidate_addresses: list[MatchDossierCandidateAddress] | None = None,
) -> MatchDossierBridgeResponse:
    return_url = _dossier_return_url(payload)
    params = {
        "match_return": return_url,
        "match_session": payload.session_id,
        "match_neighborhood": payload.neighborhood_id,
        "match_context": json.dumps(
            _dossier_match_context(
                payload,
                candidate=candidate,
                address_id=address_id,
                vbo_id=vbo_id or "",
                return_url=return_url,
            ),
            separators=(",", ":"),
        ),
    }
    params = {"lookup": lookup_id, **params}
    route_path = f"#/address/{quote(vbo_id, safe='')}" if vbo_id else "#/briefing"

    return MatchDossierBridgeResponse(
        status="resolved",
        route=f"{route_path}?{urlencode(params)}",
        vbo_id=vbo_id,
        lookup_id=lookup_id,
        address_candidate=_legacy_address_candidate(
            address_id=address_id or vbo_id,
            vbo_id=vbo_id,
            lookup_id=lookup_id,
            reliability=reliability,
        ),
        candidate_addresses=candidate_addresses or [],
        fallback_reason_code=None,
    )


async def resolve_dossier_bridge(payload: MatchDossierBridgeRequest) -> MatchDossierBridgeResponse:
    neighborhood = await load_seed_neighborhood(payload.neighborhood_id)
    candidates = (
        await _real_building_candidates_for_neighborhood(payload.neighborhood_id, limit=100)
        if payload.building_id.startswith(_BAG_BUILDING_ID_PREFIX)
        else _seed_house_candidates(payload.neighborhood_id, display_bounds_wgs84(neighborhood))
    )
    candidate = next(
        (candidate for candidate in candidates if candidate.building_id == payload.building_id),
        None,
    )
    if candidate is None:
        raise DossierBridgeCandidateMismatchError("building_id")
    _validate_payload_matches_server_candidate(payload, candidate)

    candidate_addresses = await _candidate_address_options(candidate)
    if payload.selected_candidate_id is not None:
        selected_candidate = next(
            (
                address
                for address in candidate_addresses
                if address.candidate_id == payload.selected_candidate_id
            ),
            None,
        )
        if selected_candidate is None:
            raise DossierBridgeCandidateMismatchError("selected_candidate_id")
        selected_vbo_id = _first_vbo_id(selected_candidate.vbo_id, selected_candidate.address_id)
        if not selected_candidate.lookup_id or not selected_vbo_id:
            return MatchDossierBridgeResponse(
                status="manual_required",
                address_candidate=_legacy_address_candidate(
                    address_id=selected_candidate.address_id,
                    vbo_id=selected_candidate.vbo_id,
                    lookup_id=selected_candidate.lookup_id,
                    reliability="unavailable",
                ),
                candidate_addresses=[selected_candidate],
                fallback_reason_code=_MANUAL_REQUIRED_REASON,
            )
        return _resolved_bridge_response(
            payload,
            candidate=candidate,
            address_id=selected_candidate.address_id,
            vbo_id=selected_vbo_id,
            lookup_id=selected_candidate.lookup_id,
            reliability=selected_candidate.reliability,
            candidate_addresses=[selected_candidate],
        )

    vbo_id = _first_vbo_id(candidate.vbo_id, candidate.address_id)
    if not candidate.lookup_id and candidate_addresses:
        return MatchDossierBridgeResponse(
            status="candidates",
            address_candidate=_legacy_address_candidate(
                address_id=candidate.address_id,
                vbo_id=vbo_id,
                lookup_id=candidate.lookup_id,
                reliability="candidate",
            ),
            candidate_addresses=candidate_addresses,
            fallback_reason_code=_CANDIDATE_SELECTION_REASON,
        )

    if not candidate.lookup_id:
        status = (
            "manual_required"
            if candidate.address_resolution in {"candidate", "manual_required"}
            else "unavailable"
        )
        fallback_reason_code = (
            _MANUAL_REQUIRED_REASON
            if candidate.address_resolution in {"candidate", "manual_required"}
            else _DEFAULT_NO_ADDRESS_REASON
        )
        return MatchDossierBridgeResponse(
            status=status,
            address_candidate=_legacy_address_candidate(
                address_id=candidate.address_id,
                vbo_id=vbo_id,
                lookup_id=candidate.lookup_id,
                reliability="unavailable",
            ),
            fallback_reason_code=fallback_reason_code,
        )

    return _resolved_bridge_response(
        payload,
        candidate=candidate,
        address_id=candidate.address_id or vbo_id,
        vbo_id=vbo_id,
        lookup_id=candidate.lookup_id,
        reliability="resolved" if vbo_id else "candidate",
    )


def _seed_house_candidate(
    neighborhood_id: str,
    display_bounds: list[float],
) -> MatchNeighborhoodBuildingFeature:
    west, south, east, north = display_bounds
    center_lng = (west + east) / 2
    center_lat = (south + north) / 2
    delta_lng = max((east - west) * 0.06, 0.0002)
    delta_lat = max((north - south) * 0.06, 0.0002)
    return MatchNeighborhoodBuildingFeature(
        building_id=f"bldg_{neighborhood_id}_001",
        vbo_id="0363010000123456",
        address_id="0363010000123456",
        lookup_id="adr-abc123",
        footprint={
            "type": "Polygon",
            "coordinates": [[
                [center_lng - delta_lng, center_lat - delta_lat],
                [center_lng + delta_lng, center_lat - delta_lat],
                [center_lng + delta_lng, center_lat + delta_lat],
                [center_lng - delta_lng, center_lat + delta_lat],
                [center_lng - delta_lng, center_lat - delta_lat],
            ]],
        },
        height_m=None,
        source_refs=SOURCE_REFS,
        address_resolution="resolved",
        address_candidate_count=1,
        fallback_label_key="matchFirst.neighborhood.addressCandidate",
    )


def _secondary_seed_house_candidate(
    neighborhood_id: str,
    display_bounds: list[float],
) -> MatchNeighborhoodBuildingFeature:
    west, south, east, north = display_bounds
    center_lng = (west + east) / 2
    center_lat = (south + north) / 2
    delta_lng = max((east - west) * 0.045, 0.00018)
    delta_lat = max((north - south) * 0.045, 0.00018)
    offset_lng = max((east - west) * 0.12, 0.00035)
    offset_lat = max((north - south) * 0.08, 0.00028)
    shifted_lng = min(center_lng + offset_lng, east - delta_lng)
    shifted_lat = min(center_lat + offset_lat, north - delta_lat)
    return MatchNeighborhoodBuildingFeature(
        building_id=f"bldg_{neighborhood_id}_002",
        vbo_id="0363010000123457",
        address_id="0363010000123457",
        lookup_id="adr-def456",
        footprint={
            "type": "Polygon",
            "coordinates": [[
                [shifted_lng - delta_lng, shifted_lat - delta_lat],
                [shifted_lng + delta_lng, shifted_lat - delta_lat],
                [shifted_lng + delta_lng, shifted_lat + delta_lat],
                [shifted_lng - delta_lng, shifted_lat + delta_lat],
                [shifted_lng - delta_lng, shifted_lat - delta_lat],
            ]],
        },
        height_m=None,
        source_refs=SOURCE_REFS,
        address_resolution="resolved",
        address_candidate_count=1,
        fallback_label_key="matchFirst.neighborhood.addressCandidate",
    )


def _tertiary_seed_house_candidate(
    neighborhood_id: str,
    display_bounds: list[float],
) -> MatchNeighborhoodBuildingFeature:
    west, south, east, north = display_bounds
    center_lng = (west + east) / 2
    center_lat = (south + north) / 2
    delta_lng = max((east - west) * 0.04, 0.00016)
    delta_lat = max((north - south) * 0.04, 0.00016)
    offset_lng = max((east - west) * -0.1, -0.00032)
    offset_lat = max((north - south) * 0.06, 0.00024)
    shifted_lng = max(min(center_lng + offset_lng, east - delta_lng), west + delta_lng)
    shifted_lat = max(min(center_lat + offset_lat, north - delta_lat), south + delta_lat)
    return MatchNeighborhoodBuildingFeature(
        building_id=f"bldg_{neighborhood_id}_003",
        vbo_id=None,
        address_id=None,
        lookup_id=None,
        footprint={
            "type": "Polygon",
            "coordinates": [[
                [shifted_lng - delta_lng, shifted_lat - delta_lat],
                [shifted_lng + delta_lng, shifted_lat - delta_lat],
                [shifted_lng + delta_lng, shifted_lat + delta_lat],
                [shifted_lng - delta_lng, shifted_lat + delta_lat],
                [shifted_lng - delta_lng, shifted_lat - delta_lat],
            ]],
        },
        height_m=None,
        source_refs=SOURCE_REFS,
        address_resolution="candidate",
        address_candidate_count=3,
        fallback_label_key="matchFirst.neighborhood.addressCandidate",
    )


def _seed_house_candidates(
    neighborhood_id: str,
    display_bounds: list[float],
) -> list[MatchNeighborhoodBuildingFeature]:
    return [
        _seed_house_candidate(neighborhood_id, display_bounds),
        _secondary_seed_house_candidate(neighborhood_id, display_bounds),
        _tertiary_seed_house_candidate(neighborhood_id, display_bounds),
    ]


async def get_scoped_neighborhood_buildings(
    neighborhood_id: str,
    *,
    session_id: str,
    result_set_id: str,
    bounds_rd: list[float],
    lod: str = "low",
    limit: int = 50,
    cursor: str | None = None,
) -> MatchNeighborhoodBuildingsResponse:
    neighborhood = await load_seed_neighborhood(neighborhood_id)
    boundary = await geometry_service.fetch_official_boundary_feature(neighborhood)
    if not geometry_service.boundary_is_official(boundary):
        return MatchNeighborhoodBuildingsResponse(
            neighborhood_id=neighborhood_id,
            session_id=session_id,
            result_set_id=result_set_id,
            bounds_rd=bounds_rd,
            clipped_to_neighborhood=True,
            buildings=[],
            fallback_reason_code=geometry_service.BOUNDARY_UNAVAILABLE_UI_KEY,
            complete=True,
            next_cursor=None,
            loaded_scope="selected_neighborhood",
            partial_reason_code=None,
            data_version=_BOUNDARY_REQUIRED_DATA_VERSION,
            source_refs=[],
            limitations=[geometry_service.OFFICIAL_BOUNDARY_UNAVAILABLE_LIMITATION],
        )
    boundary_bounds_wgs84 = boundary_display_bounds_wgs84(boundary or {})
    allowed_bounds = (
        wgs84_bounds_to_rd(boundary_bounds_wgs84)
        if boundary_bounds_wgs84
        else neighborhood_bounds_rd(neighborhood)
    )
    validate_building_bounds(bounds_rd, allowed_bounds)
    bounded_limit = max(1, min(limit, 100))
    _ = lod
    center_rd = _center_rd_from_bounds(bounds_rd)
    provider = getattr(settings, "match_building_footprint_provider", "pdok_bag")
    if provider == "pdok_bag":
        bag_page = BagPandFootprintPage(pands=[], partial=True)
        try:
            bag_page = await _fetch_bag_pand_footprint_page_for_bounds(
                bounds_rd=bounds_rd,
                limit=bounded_limit,
                cursor=cursor,
            )
        except Exception as exc:
            logger.warning(
                "match PDOK BAG selected-neighborhood building fetch failed "
                "neighborhood_id=%s reason=%s",
                neighborhood_id,
                exc,
            )

        if bag_page.pands or bag_page.next_cursor or not bag_page.partial:
            sorted_pands = sorted(bag_page.pands, key=bag_ogc.pand_priority)
            buildings = [
                _match_feature_from_bag_pand(pand, center_rd=center_rd)
                for pand in sorted_pands[:bounded_limit]
            ]
            buildings = _filter_buildings_to_boundary(buildings, boundary or {})
            fallback_reason_code = (
                None
                if buildings or bag_page.next_cursor or bag_page.partial
                else "matchFirst.neighborhood.missing3d"
            )
            limitations = [_PDOK_BAG_PAND_LIMITATION]
            if bag_page.partial:
                limitations.append(_BAG_PARTIAL_LIMITATION)
            complete = bag_page.next_cursor is None and not bag_page.partial
            partial_reason_code = None
            if bag_page.next_cursor:
                partial_reason_code = _BUILDINGS_MORE_AVAILABLE_REASON
            elif bag_page.partial:
                partial_reason_code = _BUILDINGS_PROVIDER_PARTIAL_REASON

            return MatchNeighborhoodBuildingsResponse(
                neighborhood_id=neighborhood_id,
                session_id=session_id,
                result_set_id=result_set_id,
                bounds_rd=bounds_rd,
                clipped_to_neighborhood=True,
                buildings=buildings,
                fallback_reason_code=fallback_reason_code,
                complete=complete,
                next_cursor=bag_page.next_cursor,
                loaded_scope="selected_neighborhood",
                partial_reason_code=partial_reason_code,
                data_version=_PDOK_BAG_DATA_VERSION,
                source_refs=([_PDOK_BAG_PAND_SOURCE_REF] if buildings else []),
                limitations=limitations,
            )

        logger.warning(
            "match PDOK BAG selected-neighborhood building fetch returned no usable "
            "data; falling back to 3DBAG neighborhood_id=%s",
            neighborhood_id,
        )

    page = BuildingFootprintPage(blocks=[])
    try:
        page = await _fetch_lod22_building_page_for_bounds(
            bounds_rd=bounds_rd,
            limit=bounded_limit,
            cursor=cursor,
        )
    except Exception as exc:
        logger.warning(
            "match 3DBAG selected-neighborhood building fetch failed neighborhood_id=%s reason=%s",
            neighborhood_id,
            exc,
        )
        page = BuildingFootprintPage(blocks=[], partial=True)

    buildings = [
        _match_feature_from_3dbag_block(
            block,
            center_rd=center_rd,
        )
        for block in page.blocks[:bounded_limit]
    ]
    buildings = _filter_buildings_to_boundary(buildings, boundary or {})
    fallback_reason_code = (
        None
        if buildings or page.next_cursor or page.partial
        else "matchFirst.neighborhood.missing3d"
    )
    source_refs = list(
        dict.fromkeys(source_ref for building in buildings for source_ref in building.source_refs)
    )
    limitations: list[str] = []
    if any(building.geometry_source == _BAG_LOD22_SOURCE_REF for building in buildings):
        limitations.append(_BAG_LOD22_LIMITATION)
    if any(building.geometry_source == _BAG_LOD0_SOURCE_REF for building in buildings):
        limitations.append(_BAG_LOD0_LIMITATION)
    if page.partial:
        limitations.append(_BAG_PARTIAL_LIMITATION)
    complete = page.next_cursor is None and not page.partial
    partial_reason_code = None
    if page.next_cursor:
        partial_reason_code = _BUILDINGS_MORE_AVAILABLE_REASON
    elif page.partial:
        partial_reason_code = _BUILDINGS_PROVIDER_PARTIAL_REASON

    return MatchNeighborhoodBuildingsResponse(
        neighborhood_id=neighborhood_id,
        session_id=session_id,
        result_set_id=result_set_id,
        bounds_rd=bounds_rd,
        clipped_to_neighborhood=True,
        buildings=buildings,
        fallback_reason_code=fallback_reason_code,
        complete=complete,
        next_cursor=page.next_cursor,
        loaded_scope="selected_neighborhood",
        partial_reason_code=partial_reason_code,
        data_version=_BAG_DATA_VERSION,
        source_refs=source_refs,
        limitations=limitations,
    )
