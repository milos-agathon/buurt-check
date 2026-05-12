import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { JourneyIntent, HouseholdType, MatchLocale, MatchQuizPayload } from '../../types/match';
import './MatchQuiz.css';

interface MatchQuizProps {
  onSubmit: (payload: MatchQuizPayload) => void | Promise<void>;
  submitting?: boolean;
  errorCode?: string | null;
}

const mustHaveOptions = ['green_access', 'schools', 'low_noise'] as const;
const niceToHaveOptions = ['train_nearby', 'cafes', 'village_feel'] as const;
const lifestyleOptions = [
  'calmness',
  'green_space',
  'family_fit',
  'mobility',
  'amenities',
  'affordability',
  'safety_context',
  'environmental_quality',
  'social_lifestyle_fit',
  'housing_stock',
] as const;

function toCents(value: string): number | undefined {
  const normalized = Number(value.replace(/[^\d]/g, ''));
  return Number.isFinite(normalized) && normalized > 0 ? normalized * 100 : undefined;
}

function toggleValue<T extends string>(values: T[], value: T): T[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

export default function MatchQuiz({ onSubmit, submitting = false, errorCode }: MatchQuizProps) {
  const { t, i18n } = useTranslation();
  const initialLocale = i18n.language.startsWith('nl') ? 'nl' : 'en';
  const [journeyIntent, setJourneyIntent] = useState<JourneyIntent | ''>('');
  const [buyMax, setBuyMax] = useState('');
  const [rentMax, setRentMax] = useState('');
  const [householdType, setHouseholdType] = useState<HouseholdType | ''>('');
  const [anchor, setAnchor] = useState('');
  const [commuteMinutes, setCommuteMinutes] = useState('');
  const [optionalAnchors, setOptionalAnchors] = useState('');
  const [mustHaves, setMustHaves] = useState<string[]>([]);
  const [niceToHaves, setNiceToHaves] = useState<string[]>([]);
  const [propertyType, setPropertyType] = useState('');
  const [language, setLanguage] = useState<MatchLocale>(initialLocale);
  const [lifestylePriorities, setLifestylePriorities] = useState<string[]>([]);
  const [submittedOnce, setSubmittedOnce] = useState(false);

  const validation = useMemo(() => {
    const errors: string[] = [];
    if (!journeyIntent) errors.push(t('match.quiz.validation.journey'));
    if (!householdType) errors.push(t('match.quiz.validation.household'));
    if (!anchor.trim()) errors.push(t('match.quiz.validation.anchor'));
    if (!commuteMinutes.trim()) errors.push(t('match.quiz.validation.commute'));
    if (!propertyType) errors.push(t('match.quiz.validation.propertyType'));
    if (mustHaves.length === 0 && niceToHaves.length === 0) {
      errors.push(t('match.quiz.validation.preferences'));
    }
    if (lifestylePriorities.length === 0) errors.push(t('match.quiz.validation.lifestyle'));
    return errors;
  }, [
    anchor,
    commuteMinutes,
    householdType,
    journeyIntent,
    lifestylePriorities.length,
    mustHaves.length,
    niceToHaves.length,
    propertyType,
    t,
  ]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setSubmittedOnce(true);
    if (validation.length > 0 || !journeyIntent || !householdType || !propertyType) return;

    const payload: MatchQuizPayload = {
      locale: language,
      language_preference: language,
      journey_intent: journeyIntent,
      household_type: householdType,
      current_city: anchor.trim(),
      budget: {
        buy_max: toCents(buyMax),
        rent_max: toCents(rentMax),
      },
      anchor_locations: optionalAnchors.trim()
        ? [{ label: t('match.quiz.anchorLabels.workSchool'), query: optionalAnchors.trim() }]
        : [],
      commute_limits: [{
        mode: 'public_transport',
        max_minutes: Number(commuteMinutes),
      }],
      property_types: [propertyType],
      must_haves: mustHaves,
      nice_to_haves: niceToHaves,
      avoid_signals: [],
      lifestyle_priorities: Object.fromEntries(
        lifestylePriorities.map((priority) => [priority, 5]),
      ),
      newcomer_status: language === 'en' ? 'yes' : 'unknown',
    };
    void onSubmit(payload);
  };

  return (
    <form className="match-quiz" onSubmit={handleSubmit} aria-labelledby="match-quiz-title" noValidate>
      <div className="match-quiz__header">
        <p>{t('match.quiz.eyebrow')}</p>
        <h1 id="match-quiz-title">{t('match.quiz.title')}</h1>
        <p>{t('match.quiz.dataBoundary')}</p>
      </div>

      {submittedOnce && validation.length > 0 && (
        <div className="match-quiz__validation" role="alert">
          {validation.map((message) => <p key={message}>{message}</p>)}
        </div>
      )}
      {errorCode && <p className="match-quiz__validation" role="alert">{t(errorCode)}</p>}

      <fieldset aria-label={t('match.quiz.groups.journey')}>
        <legend>{t('match.quiz.groups.journey')}</legend>
        {(['buy', 'rent', 'both'] as const).map((intent) => (
          <label key={intent} className="match-quiz__choice">
            <input
              type="radio"
              name="journey"
              checked={journeyIntent === intent}
              onChange={() => setJourneyIntent(intent)}
            />
            {t(`match.quiz.journey.${intent}`)}
          </label>
        ))}
      </fieldset>

      <div className="match-quiz__grid">
        <label>
          {t('match.quiz.fields.buyMax')}
          <input
            inputMode="numeric"
            value={buyMax}
            onChange={(event) => setBuyMax(event.target.value)}
            placeholder="625000"
          />
        </label>
        <label>
          {t('match.quiz.fields.rentMax')}
          <input
            inputMode="numeric"
            value={rentMax}
            onChange={(event) => setRentMax(event.target.value)}
            placeholder="2200"
          />
        </label>
      </div>

      <fieldset aria-label={t('match.quiz.groups.household')}>
        <legend>{t('match.quiz.groups.household')}</legend>
        {(['starter', 'single', 'couple', 'family', 'future_family', 'other'] as const).map((type) => (
          <label key={type} className="match-quiz__choice">
            <input
              type="radio"
              name="household"
              checked={householdType === type}
              onChange={() => setHouseholdType(type)}
            />
            {t(`match.quiz.household.${type}`)}
          </label>
        ))}
      </fieldset>

      <div className="match-quiz__grid">
        <label>
          {t('match.quiz.fields.anchor')}
          <input value={anchor} onChange={(event) => setAnchor(event.target.value)} />
        </label>
        <label>
          {t('match.quiz.fields.commute')}
          <input
            inputMode="numeric"
            value={commuteMinutes}
            onChange={(event) => setCommuteMinutes(event.target.value)}
          />
        </label>
      </div>

      <label>
        {t('match.quiz.fields.optionalAnchors')}
        <input value={optionalAnchors} onChange={(event) => setOptionalAnchors(event.target.value)} />
      </label>

      <fieldset aria-label={t('match.quiz.groups.mustHaves')}>
        <legend>{t('match.quiz.groups.mustHaves')}</legend>
        {mustHaveOptions.map((option) => (
          <label key={option} className="match-quiz__choice">
            <input
              type="checkbox"
              checked={mustHaves.includes(option)}
              onChange={() => setMustHaves(toggleValue(mustHaves, option))}
            />
            {t(`match.quiz.mustHaves.${option}`)}
          </label>
        ))}
      </fieldset>

      <fieldset aria-label={t('match.quiz.groups.niceToHaves')}>
        <legend>{t('match.quiz.groups.niceToHaves')}</legend>
        {niceToHaveOptions.map((option) => (
          <label key={option} className="match-quiz__choice">
            <input
              type="checkbox"
              checked={niceToHaves.includes(option)}
              onChange={() => setNiceToHaves(toggleValue(niceToHaves, option))}
            />
            {t(`match.quiz.niceToHaves.${option}`)}
          </label>
        ))}
      </fieldset>

      <fieldset aria-label={t('match.quiz.groups.propertyType')}>
        <legend>{t('match.quiz.groups.propertyType')}</legend>
        {['apartment', 'house', 'studio'].map((type) => (
          <label key={type} className="match-quiz__choice">
            <input
              type="radio"
              name="property"
              checked={propertyType === type}
              onChange={() => setPropertyType(type)}
            />
            {t(`match.quiz.property.${type}`)}
          </label>
        ))}
      </fieldset>

      <label>
        {t('match.quiz.fields.language')}
        <select value={language} onChange={(event) => setLanguage(event.target.value as MatchLocale)}>
          <option value="en">English</option>
          <option value="nl">Nederlands</option>
        </select>
      </label>

      <fieldset aria-label={t('match.quiz.groups.lifestyle')}>
        <legend>{t('match.quiz.groups.lifestyle')}</legend>
        {lifestyleOptions.map((option) => (
          <label key={option} className="match-quiz__choice">
            <input
              type="checkbox"
              checked={lifestylePriorities.includes(option)}
              onChange={() => setLifestylePriorities(toggleValue(lifestylePriorities, option))}
            />
            {t(`match.quiz.lifestyle.${option}`)}
          </label>
        ))}
      </fieldset>

      <button type="submit" className="match-quiz__submit" disabled={submitting}>
        {submitting ? t('match.quiz.submitting') : t('match.quiz.submit')}
      </button>
    </form>
  );
}
