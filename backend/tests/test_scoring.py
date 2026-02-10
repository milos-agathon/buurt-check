"""Tests for the scoring module — boundary values, clamping, summaries."""

from app.services.scoring import (
    SeverityLevel,
    air_summary,
    climate_summary,
    noise_summary,
    normalize_air_score,
    normalize_climate_score,
    normalize_noise_score,
    normalize_sunlight_score,
    severity_from_score,
    sunlight_summary,
)

# ---------------------------------------------------------------------------
# severity_from_score
# ---------------------------------------------------------------------------

class TestSeverityFromScore:
    def test_good_at_70(self):
        assert severity_from_score(70) == SeverityLevel.good

    def test_good_at_100(self):
        assert severity_from_score(100) == SeverityLevel.good

    def test_good_at_85(self):
        assert severity_from_score(85) == SeverityLevel.good

    def test_moderate_at_69(self):
        assert severity_from_score(69) == SeverityLevel.moderate

    def test_moderate_at_40(self):
        assert severity_from_score(40) == SeverityLevel.moderate

    def test_moderate_at_55(self):
        assert severity_from_score(55) == SeverityLevel.moderate

    def test_poor_at_39(self):
        assert severity_from_score(39) == SeverityLevel.poor

    def test_poor_at_20(self):
        assert severity_from_score(20) == SeverityLevel.poor

    def test_poor_at_30(self):
        assert severity_from_score(30) == SeverityLevel.poor

    def test_critical_at_19(self):
        assert severity_from_score(19) == SeverityLevel.critical

    def test_critical_at_0(self):
        assert severity_from_score(0) == SeverityLevel.critical

    def test_critical_at_10(self):
        assert severity_from_score(10) == SeverityLevel.critical


# ---------------------------------------------------------------------------
# normalize_noise_score
# ---------------------------------------------------------------------------

class TestNormalizeNoiseScore:
    def test_none_returns_none(self):
        assert normalize_noise_score(None) is None

    def test_40db_is_100(self):
        assert normalize_noise_score(40.0) == 100

    def test_90db_is_0(self):
        assert normalize_noise_score(90.0) == 0

    def test_65db_is_50(self):
        assert normalize_noise_score(65.0) == 50

    def test_who_onset_53db(self):
        # 100 - (53-40) * 2 = 100 - 26 = 74
        assert normalize_noise_score(53.0) == 74

    def test_who_high_63db(self):
        # 100 - (63-40) * 2 = 100 - 46 = 54
        assert normalize_noise_score(63.0) == 54

    def test_clamp_below_40(self):
        """Values below 40 dB should clamp to 100."""
        assert normalize_noise_score(30.0) == 100

    def test_clamp_above_90(self):
        """Values above 90 dB should clamp to 0."""
        assert normalize_noise_score(100.0) == 0


# ---------------------------------------------------------------------------
# normalize_air_score
# ---------------------------------------------------------------------------

class TestNormalizeAirScore:
    def test_both_none_returns_none(self):
        assert normalize_air_score(None, None) is None

    def test_pm25_only_at_who_level(self):
        """PM2.5 at 5 ug/m3 (WHO AQG) = 100."""
        assert normalize_air_score(5.0, None) == 100

    def test_pm25_only_at_25(self):
        """PM2.5 at 25 ug/m3 = 0."""
        assert normalize_air_score(25.0, None) == 0

    def test_no2_only_at_who_level(self):
        """NO2 at 10 ug/m3 (WHO AQG) = 100."""
        assert normalize_air_score(None, 10.0) == 100

    def test_no2_only_at_40(self):
        """NO2 at 40 ug/m3 = 0."""
        assert normalize_air_score(None, 40.0) == 0

    def test_worst_of_two(self):
        """Uses minimum (worst) of the two scores."""
        # PM2.5=5 -> 100, NO2=25 -> 50
        score = normalize_air_score(5.0, 25.0)
        assert score == 50

    def test_both_good(self):
        score = normalize_air_score(5.0, 10.0)
        assert score == 100

    def test_both_bad(self):
        score = normalize_air_score(25.0, 40.0)
        assert score == 0

    def test_clamp_below_who(self):
        """Very clean air should clamp to 100."""
        assert normalize_air_score(1.0, 5.0) == 100

    def test_clamp_above_max(self):
        """Very dirty air should clamp to 0."""
        assert normalize_air_score(50.0, 60.0) == 0

    def test_pm25_at_15(self):
        """PM2.5 at 15 = 100 - (15-5)*5 = 50."""
        assert normalize_air_score(15.0, None) == 50

    def test_no2_at_25(self):
        """NO2 at 25 = 100 - (25-10)*3.33 = 50."""
        assert normalize_air_score(None, 25.0) == 50


# ---------------------------------------------------------------------------
# normalize_climate_score
# ---------------------------------------------------------------------------

class TestNormalizeClimateScore:
    def test_both_none_returns_none(self):
        assert normalize_climate_score(None, None) is None

    def test_both_unavailable_returns_none(self):
        assert normalize_climate_score("unavailable", "unavailable") is None

    def test_low_low(self):
        assert normalize_climate_score("low", "low") == 85

    def test_high_high(self):
        assert normalize_climate_score("high", "high") == 15

    def test_worst_of_two(self):
        assert normalize_climate_score("low", "high") == 15

    def test_medium_low(self):
        assert normalize_climate_score("medium", "low") == 50

    def test_heat_only(self):
        assert normalize_climate_score("medium", None) == 50

    def test_water_only(self):
        assert normalize_climate_score(None, "high") == 15

    def test_heat_unavailable_water_low(self):
        assert normalize_climate_score("unavailable", "low") == 85


# ---------------------------------------------------------------------------
# normalize_sunlight_score
# ---------------------------------------------------------------------------

class TestNormalizeSunlightScore:
    def test_none_returns_none(self):
        assert normalize_sunlight_score(None) is None

    def test_0_hours(self):
        assert normalize_sunlight_score(0.0) == 0

    def test_6_hours(self):
        assert normalize_sunlight_score(6.0) == 100

    def test_2_hours(self):
        assert normalize_sunlight_score(2.0) == 33

    def test_4_hours(self):
        assert normalize_sunlight_score(4.0) == 67

    def test_3_hours(self):
        assert normalize_sunlight_score(3.0) == 50

    def test_clamp_above_6(self):
        """More than 6h still clamps to 100."""
        assert normalize_sunlight_score(8.0) == 100

    def test_clamp_below_0(self):
        """Negative hours clamp to 0."""
        assert normalize_sunlight_score(-1.0) == 0


# ---------------------------------------------------------------------------
# noise_summary
# ---------------------------------------------------------------------------

class TestNoiseSummary:
    def test_none_score(self):
        en, nl = noise_summary(None, None)
        assert "unavailable" in en.lower()
        assert "beschikbaar" in nl.lower()

    def test_good_summary(self):
        en, nl = noise_summary(80, 45.0)
        assert "Quiet" in en
        assert "45" in en
        assert "Rustig" in nl

    def test_moderate_summary(self):
        en, nl = noise_summary(55, 60.0)
        assert "Moderate" in en
        assert "60" in en
        assert "Matig" in nl

    def test_poor_summary(self):
        en, nl = noise_summary(30, 70.0)
        assert "Noisy" in en
        assert "windows" in en.lower()
        assert "Lawaaierig" in nl

    def test_critical_summary(self):
        en, nl = noise_summary(10, 85.0)
        assert "Very noisy" in en
        assert "Zeer lawaaierig" in nl


# ---------------------------------------------------------------------------
# air_summary
# ---------------------------------------------------------------------------

class TestAirSummary:
    def test_none_score(self):
        en, nl = air_summary(None, None, None)
        assert "unavailable" in en.lower()
        assert "beschikbaar" in nl.lower()

    def test_good_summary(self):
        en, nl = air_summary(85, 4.0, 8.0)
        assert "Good" in en
        assert "WHO" in en
        assert "Goede" in nl

    def test_moderate_summary(self):
        en, nl = air_summary(55, 12.0, 18.0)
        assert "Moderate" in en
        assert "Matige" in nl

    def test_poor_summary(self):
        en, nl = air_summary(30, 20.0, 30.0)
        assert "Poor" in en
        assert "Slechte" in nl

    def test_critical_summary(self):
        en, nl = air_summary(5, 30.0, 45.0)
        assert "Very poor" in en
        assert "Zeer slechte" in nl

    def test_pm25_only(self):
        en, nl = air_summary(80, 6.0, None)
        assert "PM2.5" in en
        assert "NO2" not in en

    def test_no2_only(self):
        en, nl = air_summary(80, None, 12.0)
        assert "NO2" in en
        assert "PM2.5" not in en


# ---------------------------------------------------------------------------
# climate_summary
# ---------------------------------------------------------------------------

class TestClimateSummary:
    def test_none_score(self):
        en, nl = climate_summary(None, None, None)
        assert "unavailable" in en.lower()
        assert "beschikbaar" in nl.lower()

    def test_good_summary(self):
        en, nl = climate_summary(85, "low", "low")
        assert "Low climate risk" in en
        assert "Laag klimaatrisico" in nl

    def test_moderate_summary(self):
        en, nl = climate_summary(50, "medium", "low")
        assert "Moderate climate risk" in en
        assert "Matig klimaatrisico" in nl

    def test_poor_summary(self):
        en, nl = climate_summary(30, "high", "medium")
        assert "High climate risk" in en
        assert "Hoog klimaatrisico" in nl

    def test_critical_summary(self):
        en, nl = climate_summary(10, "high", "high")
        assert "Critical climate risk" in en
        assert "Kritiek klimaatrisico" in nl

    def test_includes_heat_detail(self):
        en, nl = climate_summary(50, "medium", "low")
        assert "heat: medium" in en
        assert "hitte: matig" in nl

    def test_includes_water_detail(self):
        en, nl = climate_summary(50, "low", "medium")
        assert "flooding: medium" in en
        assert "wateroverlast: matig" in nl

    def test_unavailable_levels_excluded_from_detail(self):
        en, nl = climate_summary(85, "low", "unavailable")
        assert "flooding" not in en
        assert "wateroverlast" not in nl


# ---------------------------------------------------------------------------
# sunlight_summary
# ---------------------------------------------------------------------------

class TestSunlightSummary:
    def test_none_score(self):
        en, nl = sunlight_summary(None, None)
        assert "unavailable" in en.lower()
        assert "beschikbaar" in nl.lower()

    def test_good_summary(self):
        en, nl = sunlight_summary(85, 5.0)
        assert "Good sunlight" in en
        assert "Goed zonlicht" in nl

    def test_moderate_summary(self):
        en, nl = sunlight_summary(55, 3.5)
        assert "Limited" in en
        assert "Beperkt" in nl

    def test_poor_summary(self):
        en, nl = sunlight_summary(30, 1.8)
        assert "Poor sunlight" in en
        assert "Weinig zonlicht" in nl

    def test_critical_summary(self):
        en, nl = sunlight_summary(10, 0.5)
        assert "Very little" in en
        assert "Zeer weinig" in nl

    def test_includes_hours(self):
        en, nl = sunlight_summary(50, 3.0)
        assert "3.0" in en
        assert "3.0" in nl


# ---------------------------------------------------------------------------
# Integration: score -> severity -> summary pipeline
# ---------------------------------------------------------------------------

class TestScoringPipeline:
    def test_noise_pipeline(self):
        """Full pipeline: raw dB -> score -> severity -> summary."""
        lden = 58.0
        score = normalize_noise_score(lden)
        assert score is not None
        sev = severity_from_score(score)
        assert sev == SeverityLevel.moderate
        en, nl = noise_summary(score, lden)
        assert "58" in en
        assert len(nl) > 0

    def test_air_pipeline(self):
        pm25, no2 = 12.0, 22.0
        score = normalize_air_score(pm25, no2)
        assert score is not None
        sev = severity_from_score(score)
        assert sev == SeverityLevel.moderate
        en, nl = air_summary(score, pm25, no2)
        assert "12.0" in en
        assert len(nl) > 0

    def test_climate_pipeline(self):
        score = normalize_climate_score("medium", "high")
        assert score is not None
        assert score == 15
        sev = severity_from_score(score)
        assert sev == SeverityLevel.critical
        en, nl = climate_summary(score, "medium", "high")
        assert "Critical" in en

    def test_sunlight_pipeline(self):
        hours = 1.5
        score = normalize_sunlight_score(hours)
        assert score is not None
        sev = severity_from_score(score)
        assert sev == SeverityLevel.poor
        en, nl = sunlight_summary(score, hours)
        assert "1.5" in en
