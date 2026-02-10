"""Generate viewing questions based on risk card scores.

Only includes categories where the score is below 70 (moderate or worse).
Questions are hardcoded bilingual strings relevant to each risk category.
"""

from app.models.risk import (
    QuestionCategory,
    RiskCardsResponse,
    ViewingQuestion,
    ViewingQuestionsResponse,
)

_NOISE_QUESTIONS: list[ViewingQuestion] = [
    ViewingQuestion(
        text_en="Open the windows — can you hear traffic, trains, or aircraft?",
        text_nl="Open de ramen — hoort u verkeer, treinen of vliegtuigen?",
    ),
    ViewingQuestion(
        text_en="Ask about double or triple glazing — what type of windows are installed?",
        text_nl="Vraag naar dubbel of driedubbel glas — welk type ramen zijn geplaatst?",
    ),
    ViewingQuestion(
        text_en="Visit at different times of day — is it noisier during rush hour or at night?",
        text_nl="Bezoek op verschillende tijdstippen — is het drukker in de spits of 's nachts?",
    ),
    ViewingQuestion(
        text_en="Check if the street is on a bus or tram route.",
        text_nl="Controleer of de straat op een bus- of tramlijn ligt.",
    ),
    ViewingQuestion(
        text_en="Ask neighbors about noise levels — does sound carry between units?",
        text_nl="Vraag buren naar geluidsniveaus — is er gehoorigheid tussen woningen?",
    ),
]

_AIR_QUALITY_QUESTIONS: list[ViewingQuestion] = [
    ViewingQuestion(
        text_en="Is the property near a busy road, highway, or industrial area?",
        text_nl="Ligt het pand nabij een drukke weg, snelweg of industriegebied?",
    ),
    ViewingQuestion(
        text_en="Check for mechanical ventilation with air filtering (WTW/HRV system).",
        text_nl="Controleer op mechanische ventilatie met luchtfiltering (WTW-systeem).",
    ),
    ViewingQuestion(
        text_en="Ask about nearby planned road changes or construction projects.",
        text_nl="Vraag naar geplande wegaanpassingen of bouwprojecten in de buurt.",
    ),
    ViewingQuestion(
        text_en="Which side of the building faces the main road? Are bedrooms on the quiet side?",
        text_nl=(
            "Welke kant van het gebouw kijkt uit op de hoofdweg?"
            " Liggen slaapkamers aan de rustige kant?"
        ),
    ),
]

_CLIMATE_QUESTIONS: list[ViewingQuestion] = [
    ViewingQuestion(
        text_en="Has the property or street ever flooded? Ask the seller and neighbors.",
        text_nl="Heeft het pand of de straat ooit overstroomd? Vraag de verkoper en buren.",
    ),
    ViewingQuestion(
        text_en="Check the basement or crawl space for signs of water damage or moisture.",
        text_nl="Controleer de kelder of kruipruimte op tekenen van waterschade of vocht.",
    ),
    ViewingQuestion(
        text_en="Is there adequate drainage around the property? Check gutters and downspouts.",
        text_nl="Is er voldoende afwatering rondom het pand? Controleer goten en afvoeren.",
    ),
    ViewingQuestion(
        text_en="How does the home stay cool in summer? Ask about insulation and airco.",
        text_nl="Hoe blijft de woning koel in de zomer? Vraag naar isolatie en airco.",
    ),
    ViewingQuestion(
        text_en=(
            "Is the neighborhood at a lower elevation?"
            " Check flood risk maps at your municipality."
        ),
        text_nl="Ligt de buurt lager? Bekijk overstromingsrisicokaarten bij uw gemeente.",
    ),
]

_SUNLIGHT_QUESTIONS: list[ViewingQuestion] = [
    ViewingQuestion(
        text_en="Visit the property around midday — does direct sunlight reach the living room?",
        text_nl="Bezoek het pand rond het middaguur — bereikt direct zonlicht de woonkamer?",
    ),
    ViewingQuestion(
        text_en="Which direction do the main windows face? South-facing gets the most sun.",
        text_nl="Welke richting kijken de hoofdramen? Op het zuiden krijgt het meeste zon.",
    ),
    ViewingQuestion(
        text_en="Are there tall buildings or trees that block sunlight, especially in winter?",
        text_nl="Zijn er hoge gebouwen of bomen die zonlicht blokkeren, vooral in de winter?",
    ),
    ViewingQuestion(
        text_en="Does the balcony or garden get afternoon sun?",
        text_nl="Krijgt het balkon of de tuin middagzon?",
    ),
]


def build_viewing_questions(
    vbo_id: str,
    risk_cards: RiskCardsResponse,
) -> ViewingQuestionsResponse:
    """Build viewing questions from risk card scores.

    Only includes categories where score < 70 (moderate or worse).
    """
    categories: list[QuestionCategory] = []

    # Noise
    if risk_cards.noise.score is not None and risk_cards.noise.score < 70:
        categories.append(
            QuestionCategory(
                name="Noise",
                name_nl="Geluid",
                severity=risk_cards.noise.severity or "moderate",
                questions=_NOISE_QUESTIONS,
            )
        )

    # Air quality
    if risk_cards.air_quality.score is not None and risk_cards.air_quality.score < 70:
        categories.append(
            QuestionCategory(
                name="Air Quality",
                name_nl="Luchtkwaliteit",
                severity=risk_cards.air_quality.severity or "moderate",
                questions=_AIR_QUALITY_QUESTIONS,
            )
        )

    # Climate stress
    if (
        risk_cards.climate_stress.score is not None
        and risk_cards.climate_stress.score < 70
    ):
        categories.append(
            QuestionCategory(
                name="Climate Stress",
                name_nl="Klimaatstress",
                severity=risk_cards.climate_stress.severity or "moderate",
                questions=_CLIMATE_QUESTIONS,
            )
        )

    # Sunlight
    if risk_cards.sunlight is not None:
        if (
            risk_cards.sunlight.score is not None
            and risk_cards.sunlight.score < 70
        ):
            categories.append(
                QuestionCategory(
                    name="Sunlight",
                    name_nl="Zonlicht",
                    severity=risk_cards.sunlight.severity or "moderate",
                    questions=_SUNLIGHT_QUESTIONS,
                )
            )

    return ViewingQuestionsResponse(
        address_id=vbo_id,
        categories=categories,
    )
