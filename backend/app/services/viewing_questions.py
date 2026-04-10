"""Generate bilingual viewing questions based on risk card scores and address context."""

from app.models.risk import (
    QuestionCategory,
    RiskCardsResponse,
    RiskLevel,
    ViewingQuestion,
    ViewingQuestionsResponse,
)
from app.models.tier_b import TierBResponse
from app.services.scoring import severity_from_score


def _should_include(score: int | None) -> bool:
    return score is not None and score < 70


def _location_en(street: str | None, city: str | None) -> str:
    if street and city:
        return f"on {street} in {city}"
    if street:
        return f"on {street}"
    if city:
        return f"in {city}"
    return "at this address"


def _location_nl(street: str | None, city: str | None) -> str:
    if street and city:
        return f"aan {street} in {city}"
    if street:
        return f"aan {street}"
    if city:
        return f"in {city}"
    return "op dit adres"


def _score_en(score: int | None) -> str:
    return f" ({score}/100)" if score is not None else ""


def _score_nl(score: int | None) -> str:
    return f" ({score}/100)" if score is not None else ""


def _fmt_float(value: float | None, digits: int = 1) -> str | None:
    if value is None:
        return None
    return f"{value:.{digits}f}"


def _warning_codes(card: object) -> list[str]:
    warnings = list(getattr(card, "warnings", []) or [])
    message = getattr(card, "message", None)
    if message and message not in warnings:
        warnings.append(message)
    return warnings


def _with_data_caveat(
    questions: list[ViewingQuestion],
    warnings: list[str],
) -> list[ViewingQuestion]:
    if not questions or not warnings:
        return questions
    caveat_en = "Because this metric uses partial or unavailable source data, verify on site: "
    caveat_nl = (
        "Omdat deze metriek op gedeeltelijke of ontbrekende brondata is gebaseerd, "
        "verifieer ter plekke: "
    )
    first = questions[0]
    return [
        ViewingQuestion(
            text_en=caveat_en + first.text_en[0].lower() + first.text_en[1:],
            text_nl=caveat_nl + first.text_nl[0].lower() + first.text_nl[1:],
        ),
        *questions[1:],
    ]


def _noise_questions(
    score: int | None,
    lden_db: float | None,
    street: str | None,
    city: str | None,
) -> list[ViewingQuestion]:
    location_en = _location_en(street, city)
    location_nl = _location_nl(street, city)
    score_en = _score_en(score)
    score_nl = _score_nl(score)
    lden_text = _fmt_float(lden_db)
    lden_en = f" Current road-noise signal is {lden_text} dB Lden." if lden_text else ""
    lden_nl = f" Het huidige wegverkeersgeluid is {lden_text} dB Lden." if lden_text else ""
    return [
        ViewingQuestion(
            text_en=(
                f"With windows open {location_en}, can you hear traffic in the bedroom{score_en}?"
                f"{lden_en}"
            ),
            text_nl=(
                f"Met open ramen {location_nl}, hoort u verkeer in de slaapkamer{score_nl}?"
                f"{lden_nl}"
            ),
        ),
        ViewingQuestion(
            text_en=(
                f"Visit once during evening rush hour {location_en} and once after 22:00."
                " Is there a clear difference in noise?"
            ),
            text_nl=(
                f"Bezoek de woning {location_nl} een keer tijdens de avondspits en een keer na"
                " 22:00. Is er een duidelijk verschil in geluid?"
            ),
        ),
        ViewingQuestion(
            text_en=(
                "Ask which rooms face the busiest side of the street and what glazing is installed."
            ),
            text_nl=(
                "Vraag welke kamers aan de drukste straatzijde liggen en welk type glas is"
                " geplaatst."
            ),
        ),
    ]


def _air_questions(
    score: int | None,
    pm25_ug_m3: float | None,
    no2_ug_m3: float | None,
    street: str | None,
    city: str | None,
) -> list[ViewingQuestion]:
    location_en = _location_en(street, city)
    location_nl = _location_nl(street, city)
    score_en = _score_en(score)
    score_nl = _score_nl(score)
    pm25_text = _fmt_float(pm25_ug_m3)
    no2_text = _fmt_float(no2_ug_m3)
    signal_en_parts: list[str] = []
    signal_nl_parts: list[str] = []
    if pm25_text:
        signal_en_parts.append(f"PM2.5 {pm25_text} µg/m³")
        signal_nl_parts.append(f"PM2.5 {pm25_text} µg/m³")
    if no2_text:
        signal_en_parts.append(f"NO2 {no2_text} µg/m³")
        signal_nl_parts.append(f"NO2 {no2_text} µg/m³")
    signal_en = f" Latest signal: {', '.join(signal_en_parts)}." if signal_en_parts else ""
    signal_nl = f" Laatste signaal: {', '.join(signal_nl_parts)}." if signal_nl_parts else ""
    return [
        ViewingQuestion(
            text_en=(
                f"Given the air-quality signal {location_en}{score_en}, ask whether windows stay"
                " closed during peak traffic hours."
                f"{signal_en}"
            ),
            text_nl=(
                f"Gegeven het luchtkwaliteitssignaal {location_nl}{score_nl}, vraag of ramen vaak"
                " dicht blijven tijdens piekverkeer."
                f"{signal_nl}"
            ),
        ),
        ViewingQuestion(
            text_en=(
                "Check whether there is balanced ventilation with filtration and ask when filters"
                " were last replaced."
            ),
            text_nl=(
                "Controleer of er balansventilatie met filtering is en vraag wanneer filters"
                " voor het laatst zijn vervangen."
            ),
        ),
        ViewingQuestion(
            text_en=(
                f"Ask if roadworks or traffic rerouting are planned near this property"
                f" {location_en}."
            ),
            text_nl=(
                f"Vraag of er wegwerkzaamheden of verkeersomleidingen gepland zijn bij deze woning"
                f" {location_nl}."
            ),
        ),
    ]


def _climate_questions(
    score: int | None,
    heat_level: str | None,
    water_level: str | None,
    street: str | None,
    city: str | None,
) -> list[ViewingQuestion]:
    location_en = _location_en(street, city)
    location_nl = _location_nl(street, city)
    score_en = _score_en(score)
    score_nl = _score_nl(score)
    levels_en = []
    levels_nl = []
    if heat_level and heat_level != RiskLevel.unavailable.value:
        levels_en.append(f"heat: {heat_level}")
        levels_nl.append(f"hitte: {heat_level}")
    if water_level and water_level != RiskLevel.unavailable.value:
        levels_en.append(f"water: {water_level}")
        levels_nl.append(f"water: {water_level}")
    levels_text_en = f" Current levels are {', '.join(levels_en)}." if levels_en else ""
    levels_text_nl = f" Huidige niveaus zijn {', '.join(levels_nl)}." if levels_nl else ""
    return [
        ViewingQuestion(
            text_en=(
                f"Because climate stress is elevated {location_en}{score_en}, ask whether"
                " heavy rain"
                " has ever caused water ingress in the home or street."
                f"{levels_text_en}"
            ),
            text_nl=(
                f"Omdat klimaatstress verhoogd is {location_nl}{score_nl}, vraag of hevige regen"
                " ooit wateroverlast in de woning of straat heeft veroorzaakt."
                f"{levels_text_nl}"
            ),
        ),
        ViewingQuestion(
            text_en=(
                "Check gutters, downspouts, and crawl space/basement for signs of recurring"
                " moisture."
            ),
            text_nl=(
                "Controleer goten, afvoeren en kruipruimte/kelder op tekenen van terugkerend vocht."
            ),
        ),
        ViewingQuestion(
            text_en=(
                "Ask what heat mitigation is in place (external shading, ventilation, cooling)"
                " during warm summer periods."
            ),
            text_nl=(
                "Vraag welke hittemaatregelen aanwezig zijn (buitenzonwering, ventilatie,"
                " koeling) tijdens warme zomerdagen."
            ),
        ),
    ]


def _sunlight_questions(
    score: int | None,
    winter_hours: float | None,
    street: str | None,
    city: str | None,
) -> list[ViewingQuestion]:
    location_en = _location_en(street, city)
    location_nl = _location_nl(street, city)
    score_en = _score_en(score)
    score_nl = _score_nl(score)
    winter_text = _fmt_float(winter_hours)
    winter_en = f" Estimated winter direct sunlight is {winter_text}h/day." if winter_text else ""
    winter_nl = f" Geschatte directe winterzon is {winter_text} uur/dag." if winter_text else ""
    return [
        ViewingQuestion(
            text_en=(
                f"With the current roof/facade proxy sunlight signal {location_en}{score_en},"
                " visit around 15:00 in winter and verify daylight in the main rooms."
                f"{winter_en}"
            ),
            text_nl=(
                f"Met het huidige dak/gevelproxy-zonlichtsignaal {location_nl}{score_nl},"
                " bezoek rond 15:00 in de winter en controleer daglicht in de belangrijkste kamers."
                f"{winter_nl}"
            ),
        ),
        ViewingQuestion(
            text_en=(
                "Ask which facade has the main rooms and whether nearby buildings or trees"
                " block winter sun."
            ),
            text_nl=(
                "Vraag aan welke gevel de belangrijkste kamers liggen en of omliggende gebouwen of"
                " bomen de winterzon blokkeren."
            ),
        ),
        ViewingQuestion(
            text_en=(
                "Check balcony or garden sunlight after work hours to confirm real evening"
                " usability."
            ),
            text_nl=(
                "Controleer zon op balkon of tuin na werktijd om de praktische avondbruikbaarheid"
                " te bevestigen."
            ),
        ),
    ]


# --- Confirmation questions for good-scoring categories (score >= 70) ---


def _noise_good_questions(
    score: int | None,
    street: str | None,
    city: str | None,
) -> list[ViewingQuestion]:
    location_en = _location_en(street, city)
    location_nl = _location_nl(street, city)
    score_en = _score_en(score)
    score_nl = _score_nl(score)
    return [
        ViewingQuestion(
            text_en=(
                f"Noise levels {location_en} score well{score_en}."
                " Confirm quiet conditions by visiting at different times of day."
            ),
            text_nl=(
                f"Geluidsniveaus {location_nl} scoren goed{score_nl}."
                " Bevestig de rustige omstandigheden door op verschillende tijdstippen te bezoeken."
            ),
        ),
    ]


def _air_good_questions(
    score: int | None,
    street: str | None,
    city: str | None,
) -> list[ViewingQuestion]:
    location_en = _location_en(street, city)
    location_nl = _location_nl(street, city)
    score_en = _score_en(score)
    score_nl = _score_nl(score)
    return [
        ViewingQuestion(
            text_en=(
                f"Air quality {location_en} scores well{score_en}."
                " Check that ventilation systems are present and well-maintained."
            ),
            text_nl=(
                f"Luchtkwaliteit {location_nl} scoort goed{score_nl}."
                " Controleer of ventilatiesystemen aanwezig en goed onderhouden zijn."
            ),
        ),
    ]


def _climate_good_questions(
    score: int | None,
    street: str | None,
    city: str | None,
) -> list[ViewingQuestion]:
    location_en = _location_en(street, city)
    location_nl = _location_nl(street, city)
    score_en = _score_en(score)
    score_nl = _score_nl(score)
    return [
        ViewingQuestion(
            text_en=(
                f"Climate resilience {location_en} scores well{score_en}."
                " Verify gutters and drainage are well-maintained."
            ),
            text_nl=(
                f"Klimaatbestendigheid {location_nl} scoort goed{score_nl}."
                " Controleer of goten en afwatering goed onderhouden zijn."
            ),
        ),
    ]


def _sunlight_good_questions(
    score: int | None,
    street: str | None,
    city: str | None,
) -> list[ViewingQuestion]:
    location_en = _location_en(street, city)
    location_nl = _location_nl(street, city)
    score_en = _score_en(score)
    score_nl = _score_nl(score)
    return [
        ViewingQuestion(
            text_en=(
                f"Sunlight exposure {location_en} scores well{score_en}."
                " Confirm natural light in key rooms during your viewing."
            ),
            text_nl=(
                f"Zonlichtblootstelling {location_nl} scoort goed{score_nl}."
                " Bevestig het natuurlijke licht in de belangrijkste kamers"
                " tijdens uw bezichtiging."
            ),
        ),
    ]


def _is_good(score: int | None) -> bool:
    return score is not None and score >= 70


def _flagged_severity(score: int | None, severity: str | None) -> str:
    if severity:
        return severity
    if score is None:
        return "moderate"
    return severity_from_score(score).value


def _crime_checklist_category(
    tier_b_data: TierBResponse | None,
) -> QuestionCategory | None:
    crime = tier_b_data.crime if tier_b_data and tier_b_data.crime else None
    if not crime or crime.score is None:
        return None

    score_text = f"{crime.score}/100"
    rate_text = (
        f" Latest rate: {crime.total_per_1000:.1f} per 1,000 residents."
        if crime.total_per_1000 is not None
        else ""
    )
    rate_text_nl = (
        f" Laatste cijfer: {crime.total_per_1000:.1f} per 1.000 inwoners."
        if crime.total_per_1000 is not None
        else ""
    )

    if crime.score >= 70:
        questions = [
            ViewingQuestion(
                text_en=(
                    f"Crime context scores well ({score_text}). Confirm street lighting, entry"
                    " controls, and whether the area still feels safe after dark."
                ),
                text_nl=(
                    f"Criminaliteitscontext scoort goed ({score_text}). Controleer"
                    " straatverlichting, toegangsbeveiliging en of de omgeving ook"
                    " na donker veilig aanvoelt."
                ),
            )
        ]
    else:
        questions = [
            ViewingQuestion(
                text_en=(
                    f"Walk the street after dark and check lighting, sightlines, and access"
                    f" control around the entrance ({score_text}).{rate_text}"
                ),
                text_nl=(
                    f"Loop na donker door de straat en controleer verlichting,"
                    f" zichtlijnen en toegangscontrole rond de entree ({score_text})."
                    f"{rate_text_nl}"
                ),
            ),
            ViewingQuestion(
                text_en=(
                    "Ask the seller or agent about recent break-ins, nuisance, and whether"
                    " residents use extra security measures."
                ),
                text_nl=(
                    "Vraag verkoper of makelaar naar recente inbraken, overlast en of"
                    " bewoners extra beveiligingsmaatregelen gebruiken."
                ),
            ),
        ]

    return QuestionCategory(
        name="Crime",
        name_nl="Criminaliteit",
        severity=crime.severity or _flagged_severity(crime.score, None),
        questions=questions,
    )


def with_crime_viewing_questions(
    viewing_questions: ViewingQuestionsResponse | None,
    tier_b_data: TierBResponse | None,
) -> ViewingQuestionsResponse | None:
    crime_category = _crime_checklist_category(tier_b_data)
    if crime_category is None:
        return viewing_questions

    if viewing_questions is None:
        address_id = tier_b_data.address_id if tier_b_data is not None else ""
        return ViewingQuestionsResponse(address_id=address_id, categories=[crime_category])

    if any(category.name.lower() == "crime" for category in viewing_questions.categories):
        return viewing_questions

    return viewing_questions.model_copy(
        update={"categories": [*viewing_questions.categories, crime_category]}
    )


def build_viewing_questions(
    vbo_id: str,
    risk_cards: RiskCardsResponse,
    street: str | None = None,
    city: str | None = None,
) -> ViewingQuestionsResponse:
    """Build viewing questions from risk scores and known address context.

    Flagged categories (score < 70) get detailed investigative questions.
    Good categories (score >= 70) get a single confirmation question.
    """
    categories: list[QuestionCategory] = []

    # Noise
    if _should_include(risk_cards.noise.score):
        categories.append(
            QuestionCategory(
                name="Noise",
                name_nl="Geluid",
                severity=_flagged_severity(risk_cards.noise.score, risk_cards.noise.severity),
                questions=_with_data_caveat(
                    _noise_questions(
                        risk_cards.noise.score,
                        risk_cards.noise.lden_db,
                        street,
                        city,
                    ),
                    _warning_codes(risk_cards.noise),
                ),
            )
        )
    elif _is_good(risk_cards.noise.score):
        categories.append(
            QuestionCategory(
                name="Noise",
                name_nl="Geluid",
                severity=risk_cards.noise.severity or "good",
                questions=_with_data_caveat(
                    _noise_good_questions(
                        risk_cards.noise.score, street, city,
                    ),
                    _warning_codes(risk_cards.noise),
                ),
            )
        )

    # Air Quality
    if _should_include(risk_cards.air_quality.score):
        categories.append(
            QuestionCategory(
                name="Air Quality",
                name_nl="Luchtkwaliteit",
                severity=_flagged_severity(
                    risk_cards.air_quality.score,
                    risk_cards.air_quality.severity,
                ),
                questions=_with_data_caveat(
                    _air_questions(
                        risk_cards.air_quality.score,
                        risk_cards.air_quality.pm25_ug_m3,
                        risk_cards.air_quality.no2_ug_m3,
                        street,
                        city,
                    ),
                    _warning_codes(risk_cards.air_quality),
                ),
            )
        )
    elif _is_good(risk_cards.air_quality.score):
        categories.append(
            QuestionCategory(
                name="Air Quality",
                name_nl="Luchtkwaliteit",
                severity=risk_cards.air_quality.severity or "good",
                questions=_with_data_caveat(
                    _air_good_questions(
                        risk_cards.air_quality.score, street, city,
                    ),
                    _warning_codes(risk_cards.air_quality),
                ),
            )
        )

    # Climate Stress
    if _should_include(risk_cards.climate_stress.score):
        categories.append(
            QuestionCategory(
                name="Climate Stress",
                name_nl="Klimaatstress",
                severity=_flagged_severity(
                    risk_cards.climate_stress.score,
                    risk_cards.climate_stress.severity,
                ),
                questions=_with_data_caveat(
                    _climate_questions(
                        risk_cards.climate_stress.score,
                        risk_cards.climate_stress.heat_level.value,
                        risk_cards.climate_stress.water_level.value,
                        street,
                        city,
                    ),
                    _warning_codes(risk_cards.climate_stress),
                ),
            )
        )
    elif _is_good(risk_cards.climate_stress.score):
        categories.append(
            QuestionCategory(
                name="Climate Stress",
                name_nl="Klimaatstress",
                severity=risk_cards.climate_stress.severity or "good",
                questions=_with_data_caveat(
                    _climate_good_questions(
                        risk_cards.climate_stress.score, street, city,
                    ),
                    _warning_codes(risk_cards.climate_stress),
                ),
            )
        )

    # Sunlight
    if risk_cards.sunlight is not None and _should_include(risk_cards.sunlight.score):
        categories.append(
            QuestionCategory(
                name="Sunlight",
                name_nl="Zonlicht",
                severity=_flagged_severity(
                    risk_cards.sunlight.score,
                    risk_cards.sunlight.severity,
                ),
                questions=_sunlight_questions(
                    risk_cards.sunlight.score,
                    risk_cards.sunlight.winter_hours,
                    street,
                    city,
                ),
            )
        )
    elif risk_cards.sunlight is not None and _is_good(risk_cards.sunlight.score):
        categories.append(
            QuestionCategory(
                name="Sunlight",
                name_nl="Zonlicht",
                severity=risk_cards.sunlight.severity or "good",
                questions=_sunlight_good_questions(
                    risk_cards.sunlight.score, street, city,
                ),
            )
        )

    return ViewingQuestionsResponse(address_id=vbo_id, categories=categories)
