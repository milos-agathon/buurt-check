from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from app.config import settings

CoverageStatus = Literal["failed", "unavailable", "not_supported", "manual_review", "skipped"]


@dataclass(frozen=True)
class SourceSpec:
    source_id: str
    authority: str
    label: str
    priority: Literal["p0", "p1", "p2"]
    enabled: bool
    timeout_s: float
    ttl_s: int
    basis: str
    radius_m: int | None
    inactive_status: CoverageStatus = "skipped"
    requires_geometry: bool = False
    method_version: str | None = None


def get_prebid_source_specs(*, municipality: str | None) -> list[SourceSpec]:
    _ = municipality
    radius = settings.prebid_default_radius_m
    p1_enabled = settings.prebid_enable_p1_sources
    return [
        SourceSpec(
            "official_publications",
            "KOOP / officielebekendmakingen.nl",
            "Official public notices",
            "p0",
            settings.prebid_official_publications_enabled,
            6.0,
            settings.cache_ttl_prebid_source,
            "address text, postcode, municipality, publication window",
            radius,
            "failed",
            method_version="koop-sru-1.2-address-keyword-v1",
        ),
        SourceSpec(
            "pdok_parcel",
            "Kadaster / PDOK",
            "PDOK Kadastrale kaart",
            "p1",
            p1_enabled and settings.prebid_pdok_parcel_enabled,
            6.0,
            settings.cache_ttl_prebid_static_source,
            "RD coordinate",
            20,
            "skipped",
            requires_geometry=True,
            method_version="pdok-kadastralekaart-wfs-5.0-perceel-v1",
        ),
        SourceSpec(
            "wkpb",
            "Kadaster / PDOK",
            "PDOK WKPB public-law restrictions",
            "p1",
            p1_enabled and settings.prebid_wkpb_enabled,
            6.0,
            settings.cache_ttl_prebid_static_source,
            "parcel/address geometry",
            radius,
            "skipped",
            requires_geometry=True,
            method_version="pdok-wkpb-wfs-1.0-v1",
        ),
        SourceSpec(
            "rce_culture",
            "RCE / PDOK",
            "RCE monuments and protected views",
            "p1",
            p1_enabled and settings.prebid_rce_culture_enabled,
            6.0,
            settings.cache_ttl_prebid_static_source,
            "address geometry",
            radius,
            "skipped",
            requires_geometry=True,
            method_version="rce-cultuurhistorie-wfs-1.0-v1",
        ),
        SourceSpec(
            "ep_online",
            "RVO / EP-Online",
            "EP-Online energy label",
            "p1",
            p1_enabled and settings.prebid_ep_online_enabled,
            6.0,
            settings.cache_ttl_prebid_static_source,
            "adresseerbaar object id",
            None,
            "skipped",
            method_version="ep-online-api-v5-blocked-without-key",
        ),
        SourceSpec(
            "rdw_parking",
            "RDW / Nationaal Parkeer Register",
            "RDW/NPR parking context",
            "p1",
            p1_enabled and settings.prebid_rdw_parking_enabled,
            6.0,
            settings.cache_ttl_prebid_static_source,
            "city parking area",
            radius,
            "skipped",
            requires_geometry=True,
            method_version="rdw-npr-open-parking-v1",
        ),
    ]
