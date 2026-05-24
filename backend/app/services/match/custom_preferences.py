from __future__ import annotations

import re
from hashlib import sha256

from app.models.match import CustomPreferenceExtractionResult, CustomPreferenceItem

SUPPORTED_LOCALES = {"en", "nl"}


def _contains_any(text: str, patterns: tuple[str, ...]) -> bool:
    return any(re.search(pattern, text, flags=re.IGNORECASE) for pattern in patterns)


def _stable_preference_id(normalized_key: str, phrase_ref: str) -> str:
    digest = sha256(f"{normalized_key}:{phrase_ref}".encode("utf-8")).hexdigest()[:12]
    return f"cp_{digest}"


def _item(
    *,
    index: int,
    normalized_key: str,
    category: str,
    use_status: str,
    privacy_class: str,
    label_key: str,
    explanation_key: str,
    reason_code: str,
    source_requirement: str | None = None,
) -> CustomPreferenceItem:
    phrase_ref = f"custom_preferences:{index}"
    return CustomPreferenceItem(
        custom_preference_id=_stable_preference_id(normalized_key, phrase_ref),
        raw_user_phrase_ref=phrase_ref,
        normalized_key=normalized_key,
        category=category,
        use_status=use_status,
        feature_key=None,
        default_weight=0,
        weight=0,
        source_requirement=source_requirement,
        privacy_class=privacy_class,
        label_key=label_key,
        explanation_key=explanation_key,
        reason_code=reason_code,
    )


def extract_custom_preferences(
    text: str,
    *,
    locale: str = "en",
) -> CustomPreferenceExtractionResult:
    normalized_locale = "nl" if locale.startswith("nl") else "en"
    normalized_text = text.strip().lower()
    if not normalized_text:
        raise ValueError("match.customPreference.text_required")

    items: list[CustomPreferenceItem] = []

    if _contains_any(
        normalized_text,
        (
            r"\bbeach\b",
            r"\bcoast\b",
            r"\bsea\b",
            r"\bshore\b",
            r"\bstrand\b",
            r"\bkust\b",
            r"\bzee\b",
        ),
    ):
        items.append(
            _item(
                index=len(items),
                normalized_key="coast_or_beach_proximity",
                category="geography",
                use_status="saved_unsupported",
                privacy_class="standard",
                label_key="matchFirst.additionalPreferences.label.coast",
                explanation_key="matchFirst.additionalPreferences.explanation.coastSavedUnsupported",
                reason_code="match.customPreference.coast_distance_unavailable",
                source_requirement="coast_distance_metric",
            )
        )

    if _contains_any(
        normalized_text,
        (
            r"\bchurch\b",
            r"\bmosque\b",
            r"\bsynagogue\b",
            r"\btemple\b",
            r"\bkerk\b",
            r"\bmoskee\b",
            r"\bsynagoge\b",
            r"\btempel\b",
        ),
    ):
        items.append(
            _item(
                index=len(items),
                normalized_key="place_of_worship_proximity",
                category="amenity",
                use_status="map_context_only",
                privacy_class="sensitive_context",
                label_key="matchFirst.additionalPreferences.label.placeOfWorship",
                explanation_key="matchFirst.additionalPreferences.explanation.placeOfWorshipMapContext",
                reason_code="match.customPreference.sensitive_amenity_context_only",
                source_requirement="neutral_amenity_overlay",
            )
        )

    if _contains_any(
        normalized_text,
        (
            r"people like me",
            r"same background",
            r"\bethnic",
            r"\brace\b",
            r"\bnationality\b",
            r"\breligion\b",
            r"mensen zoals ik",
            r"dezelfde achtergrond",
            r"\betnic",
            r"\bras\b",
            r"\bnationaliteit\b",
            r"\breligie\b",
        ),
    ):
        items.append(
            _item(
                index=len(items),
                normalized_key="protected_trait_preference",
                category="protected",
                use_status="disallowed",
                privacy_class="protected_trait_risk",
                label_key="matchFirst.additionalPreferences.label.protectedTrait",
                explanation_key="matchFirst.additionalPreferences.explanation.protectedTraitDisallowed",
                reason_code="match.customPreference.protected_trait_disallowed",
            )
        )

    if _contains_any(
        normalized_text,
        (
            r"very safe",
            r"safe area",
            r"\bsafety\b",
            r"\bcriminal",
            r"\bveilig",
            r"\bcriminaliteit\b",
        ),
    ):
        items.append(
            _item(
                index=len(items),
                normalized_key="safety_claim_requested",
                category="safety",
                use_status="needs_clarification",
                privacy_class="standard",
                label_key="matchFirst.additionalPreferences.label.safetyClaim",
                explanation_key="matchFirst.additionalPreferences.explanation.safetyNeedsClarification",
                reason_code="match.customPreference.safety_claim_needs_clarification",
            )
        )

    if not items:
        items.append(
            _item(
                index=0,
                normalized_key="unclassified_preference",
                category="other",
                use_status="needs_clarification",
                privacy_class="standard",
                label_key="matchFirst.additionalPreferences.label.unclassified",
                explanation_key="matchFirst.additionalPreferences.explanation.unclassifiedNeedsClarification",
                reason_code="match.customPreference.unclassified_needs_clarification",
            )
        )

    return CustomPreferenceExtractionResult(
        locale=normalized_locale,  # type: ignore[arg-type]
        items=items,
        needs_clarification=any(item.use_status == "needs_clarification" for item in items),
        warnings=[],
    )
