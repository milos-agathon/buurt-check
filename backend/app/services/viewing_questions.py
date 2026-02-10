"""Generate bilingual viewing questions based on risk card scores and address context."""

from app.models.risk import (
    QuestionCategory,
    RiskCardsResponse,
    ViewingQuestion,
    ViewingQuestionsResponse,
)


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
    return f" (score {score}/100)" if score is not None else ""


def _score_nl(score: int | None) -> str:
    return f" (score {score}/100)" if score is not None else ""


def _fmt_float(value: float | None, digits: int = 1) -> str | None:
    if value is None:
        return None
    return f"{value:.{digits}f}"


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
    if heat_level:
        levels_en.append(f"heat: {heat_level}")
        levels_nl.append(f"hitte: {heat_level}")
    if water_level:
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
                f"With the current sunlight signal {location_en}{score_en}, visit around 15:00 in"
                " winter and confirm daylight in the living room."
                f"{winter_en}"
            ),
            text_nl=(
                f"Met het huidige zonlichtsignaal {location_nl}{score_nl}, bezoek rond 15:00 in de"
                " winter en controleer daglicht in de woonkamer."
                f"{winter_nl}"
            ),
        ),
        ViewingQuestion(
            text_en=(
                "Ask which facade has the main living spaces and whether nearby buildings or trees"
                " block winter sun."
            ),
            text_nl=(
                "Vraag welke gevel de belangrijkste leefruimtes heeft en of omliggende gebouwen of"
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


def build_viewing_questions(
    vbo_id: str,
    risk_cards: RiskCardsResponse,
    street: str | None = None,
    city: str | None = None,
) -> ViewingQuestionsResponse:
    """Build viewing questions from risk scores and known address context."""
    categories: list[QuestionCategory] = []

    if _should_include(risk_cards.noise.score):
        categories.append(
            QuestionCategory(
                name="Noise",
                name_nl="Geluid",
                severity=risk_cards.noise.severity or "moderate",
                questions=_noise_questions(
                    risk_cards.noise.score,
                    risk_cards.noise.lden_db,
                    street,
                    city,
                ),
            )
        )

    if _should_include(risk_cards.air_quality.score):
        categories.append(
            QuestionCategory(
                name="Air Quality",
                name_nl="Luchtkwaliteit",
                severity=risk_cards.air_quality.severity or "moderate",
                questions=_air_questions(
                    risk_cards.air_quality.score,
                    risk_cards.air_quality.pm25_ug_m3,
                    risk_cards.air_quality.no2_ug_m3,
                    street,
                    city,
                ),
            )
        )

    if _should_include(risk_cards.climate_stress.score):
        categories.append(
            QuestionCategory(
                name="Climate Stress",
                name_nl="Klimaatstress",
                severity=risk_cards.climate_stress.severity or "moderate",
                questions=_climate_questions(
                    risk_cards.climate_stress.score,
                    risk_cards.climate_stress.heat_level.value,
                    risk_cards.climate_stress.water_level.value,
                    street,
                    city,
                ),
            )
        )

    if risk_cards.sunlight is not None and _should_include(risk_cards.sunlight.score):
        categories.append(
            QuestionCategory(
                name="Sunlight",
                name_nl="Zonlicht",
                severity=risk_cards.sunlight.severity or "moderate",
                questions=_sunlight_questions(
                    risk_cards.sunlight.score,
                    risk_cards.sunlight.winter_hours,
                    street,
                    city,
                ),
            )
        )

    return ViewingQuestionsResponse(address_id=vbo_id, categories=categories)
