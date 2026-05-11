# ruff: noqa: E501
from __future__ import annotations

from app.models.prebid import ActionItem, PrebidRecipient, Signal
from app.services.action_ranking import rank_signal, rank_signals
from app.services.llm_actions import validate_action_specificity

TEMPLATES = {
    "public_notice": {
        "why": "This may affect nuisance, timing, view, access, or future street context.",
        "ask_en": "Can you confirm the current status and expected timeline of this permit, notice, or work?",
        "ask_nl": "Kunt u de huidige status en verwachte planning van deze vergunning, bekendmaking of werkzaamheden bevestigen?",
        "request_en": "Request the permit/public notice source page and any municipality status update.",
        "request_nl": "Vraag de vergunning- of bekendmakingspagina en eventuele gemeentelijke statusupdate op.",
        "recipients": [PrebidRecipient.selling_agent, PrebidRecipient.municipality],
    },
    "wkpb_restriction": {
        "why": "Public-law restrictions can affect use, renovation, obligations, or notarial checks.",
        "ask_en": "Can the notary or selling agent explain whether this WKPB public-law restriction applies to the property being sold?",
        "ask_nl": "Kan de notaris of makelaar toelichten of deze WKPB-publiekrechtelijke beperking geldt voor de woning die wordt verkocht?",
        "request_en": "Request the official WKPB record or notarial explanation tied to the parcel/address.",
        "request_nl": "Vraag het officiele WKPB-record of de notariele toelichting op die bij het perceel/adres hoort.",
        "recipients": [PrebidRecipient.notary, PrebidRecipient.selling_agent],
    },
    "planning_change": {
        "why": "Planning changes can affect future surroundings, timing, access, or renovation expectations.",
        "ask_en": "Can you confirm the planning-change status, expected timeline, and source page?",
        "ask_nl": "Kunt u de status, verwachte planning en bronpagina van deze planwijziging bevestigen?",
        "request_en": "Request the planning/publication source and any municipality status update.",
        "request_nl": "Vraag de plannings- of bekendmakingsbron en eventuele gemeentelijke statusupdate op.",
        "recipients": [PrebidRecipient.municipality, PrebidRecipient.selling_agent],
    },
    "parcel": {
        "why": "Parcel context helps frame notarial and apartment-right checks.",
        "ask_en": "Can the notary confirm how the cadastral parcel relates to the property being sold?",
        "ask_nl": "Kan de notaris bevestigen hoe het kadastrale perceel hoort bij de woning die wordt verkocht?",
        "request_en": "Request the cadastral reference or notarial explanation for the parcel/address.",
        "request_nl": "Vraag de kadastrale referentie of notariele toelichting voor het perceel/adres op.",
        "recipients": [PrebidRecipient.notary, PrebidRecipient.selling_agent],
    },
    "monument_or_protected_view": {
        "why": "Heritage context can affect maintenance, permits, and renovation expectations.",
        "ask_en": "Can the municipality or adviser confirm whether the monument or protected-view context affects this address?",
        "ask_nl": "Kan de gemeente of adviseur bevestigen of de monument- of beschermd-gezichtcontext dit adres raakt?",
        "request_en": "Request the RCE/source reference and any municipal heritage note.",
        "request_nl": "Vraag de RCE-bronreferentie en eventuele gemeentelijke erfgoedtoelichting op.",
        "recipients": [PrebidRecipient.municipality, PrebidRecipient.buyers_agent],
    },
    "energy_label": {
        "why": "Energy-label context can affect monthly costs and document checks.",
        "ask_en": "Can you confirm the EP-Online energy label registration and matching address/object?",
        "ask_nl": "Kunt u de EP-Online energielabelregistratie en het bijbehorende adres/object bevestigen?",
        "request_en": "Request the energy label registration page or certificate.",
        "request_nl": "Vraag de energielabelregistratiepagina of het certificaat op.",
        "recipients": [PrebidRecipient.selling_agent, PrebidRecipient.inspector],
    },
    "parking": {
        "why": "Parking context may affect daily use and municipality permit expectations.",
        "ask_en": "Can the municipality confirm parking permit eligibility and any waiting-list context for this address?",
        "ask_nl": "Kan de gemeente parkeerrecht, vergunningmogelijkheden en eventuele wachtrijcontext voor dit adres bevestigen?",
        "request_en": "Request the municipality parking permit page or written eligibility confirmation.",
        "request_nl": "Vraag de gemeentelijke parkeervergunningpagina of schriftelijke bevestiging op.",
        "recipients": [PrebidRecipient.municipality, PrebidRecipient.selling_agent],
    },
    "source_incomplete": {
        "why": "An applicable public source could not be checked, so the result is incomplete.",
        "ask_en": "Can you verify this source directly with the relevant authority or adviser before relying on the listing?",
        "ask_nl": "Kunt u deze bron rechtstreeks bij de betreffende instantie of adviseur controleren voordat u op de advertentie vertrouwt?",
        "request_en": "Check the named source separately or request written confirmation from the relevant authority/adviser.",
        "request_nl": "Controleer de genoemde bron afzonderlijk of vraag schriftelijke bevestiging aan de betreffende instantie/adviseur.",
        "recipients": [PrebidRecipient.buyers_agent, PrebidRecipient.municipality],
    },
}


def action_from_signal(signal: Signal, *, rank: int, property_type: str = "unknown") -> ActionItem:
    template = TEMPLATES[signal.signal_type]
    finding = signal.finding
    if (
        signal.signal_type == "source_incomplete"
        and "could not be checked" not in finding.casefold()
    ):
        finding = f"{signal.source_refs[0].name} could not be checked for this address."
    action = ActionItem(
        action_id=f"action-{signal.signal_id}",
        signal_id=signal.signal_id,
        rank=rank,
        rank_score=rank_signal(signal, property_type=property_type),
        finding=finding,
        why_it_matters=template["why"],
        ask_this_en=template["ask_en"],
        ask_this_nl=template["ask_nl"],
        request_this_en=template["request_en"],
        request_this_nl=template["request_nl"],
        who_to_ask=template["recipients"],
        confidence=signal.confidence,
        limitation=signal.limitation,
        source_refs=signal.source_refs,
        review_state="pending" if signal.requires_review else "not_required",
    )
    validate_action_specificity(action)
    return action


def actions_from_signals(
    signals: list[Signal], *, property_type: str = "unknown"
) -> list[ActionItem]:
    ranked = rank_signals(signals, property_type=property_type)
    return [
        action_from_signal(signal, rank=index + 1, property_type=property_type)
        for index, signal in enumerate(ranked)
    ]
