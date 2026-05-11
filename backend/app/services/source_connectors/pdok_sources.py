from __future__ import annotations

from app.config import settings
from app.models.prebid import SourcePriority
from app.services.source_connectors.wfs_json import WfsJsonConnector


class PdokParcelConnector(WfsJsonConnector):
    source_id = "pdok_parcel"
    authority = "Kadaster / PDOK"
    label = "PDOK Kadastrale kaart"
    priority = SourcePriority.p1
    method_version = "pdok-kadastralekaart-wfs-5.0-perceel-v1"
    base_url = settings.pdok_kadastralekaart_wfs_base
    layers = ("kadastralekaart:Perceel",)
    basis = "RD coordinate"
    radius_m = 20
    limitation_checked = (
        "The cadastral map shows parcel geometry context and does not confirm seller "
        "ownership or apartment rights."
    )
    limitation_failed = "PDOK cadastral parcel context could not be checked for this address."


class WkpbConnector(WfsJsonConnector):
    source_id = "wkpb"
    authority = "Kadaster / PDOK"
    label = "PDOK WKPB public-law restrictions"
    priority = SourcePriority.p1
    method_version = "pdok-wkpb-wfs-1.0-v1"
    base_url = settings.pdok_wkpb_wfs_base
    layers = ("wkpb:pb_multipolygon", "wkpb:pb_multilinestring", "wkpb:pb_multipoint")
    basis = "parcel/address geometry"
    radius_m = settings.prebid_default_radius_m
    limitation_checked = (
        "WKPB data needs notarial or municipal interpretation before relying on it."
    )
    limitation_failed = "PDOK WKPB restrictions could not be checked for this address."


class RceCultureConnector(WfsJsonConnector):
    source_id = "rce_culture"
    authority = "RCE / PDOK"
    label = "RCE monuments and protected views"
    priority = SourcePriority.p1
    method_version = "rce-cultuurhistorie-wfs-1.0-v1"
    base_url = settings.rce_culture_wfs_base
    layers = ("ps-ch:rce_inspire_polygons", "ps-ch:rce_inspire_points")
    basis = "address geometry"
    radius_m = settings.prebid_default_radius_m
    limitation_checked = (
        "RCE locations and contours may be approximate and do not replace monument or "
        "planning checks with the authority."
    )
    limitation_failed = "RCE heritage context could not be checked for this address."
