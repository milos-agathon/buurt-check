"""Scoring system for buurt-check risk cards.

Normalizes raw risk values to a 0-100 integer score, classifies severity,
and generates bilingual one-liner summaries for each risk category.
"""

from app.models.risk import SeverityLevel


def severity_from_score(score: int) -> SeverityLevel:
    """Map a 0-100 score to a severity level.

    70-100 = good, 40-69 = moderate, 20-39 = poor, 0-19 = critical.
    """
    if score >= 70:
        return SeverityLevel.good
    if score >= 40:
        return SeverityLevel.moderate
    if score >= 20:
        return SeverityLevel.poor
    return SeverityLevel.critical


def normalize_noise_score(lden_db: float | None) -> int | None:
    """Linear inverse mapping: 40 dB = 100 (quiet), 90 dB = 0 (loud).

    WHO onset at 53 dB -> ~74, high annoyance at 63 dB -> ~54.
    Clamps to 0-100.
    """
    if lden_db is None:
        return None
    score = 100 - (lden_db - 40) * (100 / 50)
    return max(0, min(100, round(score)))


def normalize_air_score(pm25: float | None, no2: float | None) -> int | None:
    """Combine PM2.5 and NO2 into a single score. Uses worst of the two.

    PM2.5: 5 ug/m3 = 100 (WHO AQG), 25 ug/m3 = 0.
    NO2: 10 ug/m3 = 100 (WHO AQG), 40 ug/m3 = 0.
    """
    scores: list[int] = []
    if pm25 is not None:
        pm25_score = 100 - (pm25 - 5) * (100 / 20)
        scores.append(max(0, min(100, round(pm25_score))))
    if no2 is not None:
        no2_score = 100 - (no2 - 10) * (100 / 30)
        scores.append(max(0, min(100, round(no2_score))))
    if not scores:
        return None
    return min(scores)


def normalize_climate_score(
    heat_level: str | None, water_level: str | None
) -> int | None:
    """Map categorical risk levels to scores. Uses worst of the two.

    low = 85, medium = 50, high = 15, unavailable = None.
    """
    level_map = {"low": 85, "medium": 50, "high": 15}
    scores: list[int] = []
    if heat_level and heat_level in level_map:
        scores.append(level_map[heat_level])
    if water_level and water_level in level_map:
        scores.append(level_map[water_level])
    if not scores:
        return None
    return min(scores)


def normalize_sunlight_score(winter_hours: float | None) -> int | None:
    """Linear mapping: 0h = 0, 6h+ = 100. Clamps to 0-100.

    2h -> 33, 4h -> 67.
    """
    if winter_hours is None:
        return None
    score = winter_hours * (100 / 6)
    return max(0, min(100, round(score)))


def normalize_svf_score(svf: float | None) -> int | None:
    """Linear mapping: 0.0 = 0, 1.0 = 100. Clamps to 0-100."""
    if svf is None:
        return None
    score = svf * 100
    return max(0, min(100, round(score)))


def noise_summary(score: int | None, lden_db: float | None) -> tuple[str, str]:
    """Return (en, nl) one-liner summaries for noise based on score."""
    if score is None or lden_db is None:
        return ("Noise data unavailable", "Geluidsgegevens niet beschikbaar")
    sev = severity_from_score(score)
    db_str = f"{lden_db:.0f}"
    if sev == SeverityLevel.good:
        if lden_db <= 53.0:
            return (
                f"Quiet area ({db_str} dB) — meets the WHO road-noise guideline",
                f"Rustige omgeving ({db_str} dB) — voldoet aan de WHO-richtlijn voor wegverkeer",
            )
        return (
            f"Relatively low road noise for an urban setting ({db_str} dB)",
            f"Relatief laag wegverkeersgeluid voor een stedelijke omgeving ({db_str} dB)",
        )
    if sev == SeverityLevel.moderate:
        return (
            f"Moderate noise ({db_str} dB) — near WHO annoyance threshold",
            f"Matig geluid ({db_str} dB) — nabij WHO-hinderdrempel",
        )
    if sev == SeverityLevel.poor:
        return (
            f"Noisy area ({db_str} dB) — exceeds WHO guidelines, check windows",
            f"Lawaaierig gebied ({db_str} dB) — boven WHO-richtlijnen, controleer ramen",
        )
    return (
        f"Very noisy ({db_str} dB) — serious noise concern, investigate mitigation",
        f"Zeer lawaaierig ({db_str} dB) — ernstige geluidsoverlast, onderzoek maatregelen",
    )


def air_summary(
    score: int | None, pm25: float | None, no2: float | None
) -> tuple[str, str]:
    """Return (en, nl) one-liner summaries for air quality."""
    if score is None:
        return (
            "Air quality data unavailable",
            "Luchtkwaliteitsgegevens niet beschikbaar",
        )
    sev = severity_from_score(score)
    parts: list[str] = []
    if pm25 is not None:
        parts.append(f"PM2.5: {pm25:.1f}")
    if no2 is not None:
        parts.append(f"NO2: {no2:.1f}")
    values = ", ".join(parts) + " ug/m3" if parts else ""
    if sev == SeverityLevel.good:
        above: list[str] = []
        if pm25 is not None and pm25 > 5.0:
            above.append("PM2.5")
        if no2 is not None and no2 > 10.0:
            above.append("NO2")
        if above:
            pollutants = " and ".join(above)
            pollutants_nl = " en ".join(above)
            return (
                f"Good relative air quality ({values}), but above WHO AQG for {pollutants}",
                f"Goede relatieve luchtkwaliteit ({values}), maar boven WHO-AQG "
                f"voor {pollutants_nl}",
            )
        return (
            f"Good air quality ({values}) — measured pollutants meet WHO AQG",
            f"Goede luchtkwaliteit ({values}) — gemeten stoffen voldoen aan WHO-AQG",
        )
    if sev == SeverityLevel.moderate:
        return (
            f"Moderate air quality ({values}) — some pollutants above WHO levels",
            f"Matige luchtkwaliteit ({values}) — sommige waarden boven WHO-niveaus",
        )
    if sev == SeverityLevel.poor:
        return (
            f"Poor air quality ({values}) — significantly above WHO guidelines",
            f"Slechte luchtkwaliteit ({values}) — aanzienlijk boven WHO-richtlijnen",
        )
    return (
        f"Very poor air quality ({values}) — major health concern",
        f"Zeer slechte luchtkwaliteit ({values}) — ernstig gezondheidsrisico",
    )


def climate_summary(
    score: int | None, heat_level: str | None, water_level: str | None
) -> tuple[str, str]:
    """Return (en, nl) one-liner summaries for climate stress."""
    if score is None:
        return (
            "Climate stress data unavailable",
            "Klimaatstressgegevens niet beschikbaar",
        )
    sev = severity_from_score(score)

    risk_parts_en: list[str] = []
    risk_parts_nl: list[str] = []
    if heat_level and heat_level != "unavailable":
        risk_parts_en.append(f"heat: {heat_level}")
        heat_nl = {"low": "laag", "medium": "matig", "high": "hoog"}.get(heat_level, heat_level)
        risk_parts_nl.append(f"hitte: {heat_nl}")
    if water_level and water_level != "unavailable":
        risk_parts_en.append(f"flooding: {water_level}")
        water_nl = {"low": "laag", "medium": "matig", "high": "hoog"}.get(
            water_level, water_level
        )
        risk_parts_nl.append(f"wateroverlast: {water_nl}")

    detail_en = " (" + ", ".join(risk_parts_en) + ")" if risk_parts_en else ""
    detail_nl = " (" + ", ".join(risk_parts_nl) + ")" if risk_parts_nl else ""

    if sev == SeverityLevel.good:
        return (
            f"Low climate risk{detail_en} — well adapted area",
            f"Laag klimaatrisico{detail_nl} — goed aangepast gebied",
        )
    if sev == SeverityLevel.moderate:
        return (
            f"Moderate climate risk{detail_en} — some climate vulnerability",
            f"Matig klimaatrisico{detail_nl} — enige klimaatkwetsbaarheid",
        )
    if sev == SeverityLevel.poor:
        return (
            f"High climate risk{detail_en} — check flood/heat measures at viewing",
            f"Hoog klimaatrisico{detail_nl} — controleer overstromings-/hittemaatregelen",
        )
    return (
        f"Critical climate risk{detail_en} — serious flood or heat concerns",
        f"Kritiek klimaatrisico{detail_nl} — ernstige overstromings- of hitteoverlast",
    )


def normalize_crime_score(total_per_1000: float | None) -> int | None:
    """Linear inverse mapping: 20/1000 = 100 (very safe), 100/1000 = 0 (high crime).

    Dutch national average ~52/1000. Clamps to 0-100.
    """
    if total_per_1000 is None:
        return None
    score = 100 - (total_per_1000 - 20) * (100 / 80)
    return max(0, min(100, round(score)))


def crime_summary(
    score: int | None, total_per_1000: float | None
) -> tuple[str, str]:
    """Return (en, nl) one-liner summaries for crime based on score."""
    if score is None or total_per_1000 is None:
        return ("Crime data unavailable", "Criminaliteitsgegevens niet beschikbaar")
    sev = severity_from_score(score)
    rate = f"{total_per_1000:.1f}"
    if sev == SeverityLevel.good:
        return (
            f"Low crime area ({rate}/1,000 residents) — well below national average",
            f"Weinig criminaliteit ({rate}/1.000 inwoners) — ruim onder landelijk gemiddelde",
        )
    if sev == SeverityLevel.moderate:
        return (
            f"Average crime rate ({rate}/1,000 residents) — near national average",
            f"Gemiddelde criminaliteit ({rate}/1.000 inwoners) — nabij landelijk gemiddelde",
        )
    if sev == SeverityLevel.poor:
        return (
            f"High crime area ({rate}/1,000 residents) — ask about security at viewing",
            f"Hoge criminaliteit ({rate}/1.000 inwoners) — vraag naar beveiliging bij bezichtiging",
        )
    return (
        f"Very high crime ({rate}/1,000 residents) — serious safety concern for this area",
        f"Zeer hoge criminaliteit ({rate}/1.000 inwoners) — ernstig veiligheidsprobleem",
    )


def sunlight_summary(
    score: int | None,
    winter_hours: float | None,
    target_plane: str = "roof",
) -> tuple[str, str]:
    """Return (en, nl) one-liner summaries for sunlight."""
    if score is None or winter_hours is None:
        return (
            "Sunlight data unavailable",
            "Zonlichtgegevens niet beschikbaar",
        )
    sev = severity_from_score(score)
    hrs = f"{winter_hours:.1f}"
    plane_en = "roof" if target_plane == "roof" else target_plane.replace("_", " ")
    plane_nl = "dak" if target_plane == "roof" else target_plane.replace("_", " ")
    if sev == SeverityLevel.good:
        return (
            f"Good clear-sky sun on the {plane_en} ({hrs}h winter)",
            f"Goede heldere-weerzon op het {plane_nl} ({hrs}u winter)",
        )
    if sev == SeverityLevel.moderate:
        return (
            f"Limited winter sun on the {plane_en} ({hrs}h) — verify room daylight at viewing",
            f"Beperkte winterzon op het {plane_nl} ({hrs}u) — controleer daglicht "
            "in kamers bij bezichtiging",
        )
    if sev == SeverityLevel.poor:
        return (
            f"Poor {plane_en} sun exposure ({hrs}h winter) — significant shadow from surroundings",
            f"Weinig zon op het {plane_nl} ({hrs}u winter) — veel schaduw van omgeving",
        )
    return (
        f"Very little {plane_en} sun ({hrs}h winter) — heavily shadowed location",
        f"Zeer weinig zon op het {plane_nl} ({hrs}u winter) — zwaar beschaduwd",
    )
