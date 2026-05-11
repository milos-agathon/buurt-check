from __future__ import annotations

from app.models.prebid import ActionItem

FORBIDDEN_GENERATED_PHRASES = {
    "proof",
    "guarantee",
    "safe to buy",
    "safe to bid",
    "you should buy",
    "you should bid",
    "walk away",
    "lower your offer",
    "legal advice",
    "bewijs",
    "garantie",
    "veilig om te kopen",
    "veilig om te bieden",
    "u moet kopen",
    "u moet bieden",
    "koopadvies",
    "biedadvies",
    "juridisch advies",
}

GENERIC_QUESTION_PATTERNS = {
    "are there any issues with this property",
    "is there anything i should know",
    "can you tell me more about the property",
    "zijn er problemen met deze woning",
    "is er iets dat ik moet weten",
    "kunt u meer vertellen over de woning",
}


def validate_generated_action_text(text: str, *, allowed_source_terms: set[str]) -> None:
    lowered = text.casefold()
    for term in FORBIDDEN_GENERATED_PHRASES:
        if term in lowered:
            raise ValueError(f"Forbidden generated phrase: {term}")
    if not allowed_source_terms:
        raise ValueError("No source terms supplied for generated claim validation")


def validate_action_specificity(action: ActionItem) -> None:
    if not action.source_refs:
        raise ValueError("Action item must include source references")
    if not action.who_to_ask:
        raise ValueError("Action item must include at least one recipient")
    combined = " ".join(
        [
            action.finding,
            action.ask_this_en,
            action.ask_this_nl,
            action.request_this_en,
            action.request_this_nl,
        ]
    ).casefold()
    if any(pattern in combined for pattern in GENERIC_QUESTION_PATTERNS):
        raise ValueError("Action item contains generic question text")
    source_terms: set[str] = set()
    for ref in action.source_refs:
        for term in (ref.source_id, ref.authority, ref.name, ref.status_label or ""):
            if term:
                source_terms.add(term.casefold())
                source_terms.add(term.replace("_", " ").replace("-", " ").casefold())
    source_category_terms = {
        "permit",
        "public notice",
        "publication",
        "planning",
        "parcel",
        "kadastral",
        "wkpb",
        "monument",
        "protected view",
        "energy label",
        "parking",
        "vergunning",
        "bekendmaking",
        "perceel",
        "kadastraal",
        "energielabel",
        "parkeren",
        "source could not be checked",
        "could not be checked",
        "bron kon niet worden gecontroleerd",
    }
    if not any(term and term in combined for term in source_terms | source_category_terms):
        raise ValueError("Action item text must reference a source-backed category")
    validate_generated_action_text(
        combined,
        allowed_source_terms=source_terms | source_category_terms,
    )
