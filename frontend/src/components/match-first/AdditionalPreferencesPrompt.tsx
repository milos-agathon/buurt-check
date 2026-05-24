import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  MatchCustomPreferenceExtractionResponse,
  MatchCustomPreferenceItem,
  MatchCustomPreferenceUseStatus,
} from '../../types/matchFirst';
import { recordMatchFirstEvent } from '../../services/matchFirstAnalytics';
import './MatchFirstLanding.css';
import './SurveyShell.css';

interface AdditionalPreferencesPromptProps {
  sessionId?: string | null;
  initialItems?: MatchCustomPreferenceItem[];
  onBack: () => void;
  onSkip: () => void | Promise<void>;
  onReview: (items: MatchCustomPreferenceItem[]) => void | Promise<void>;
  onExtract: (text: string) => Promise<MatchCustomPreferenceExtractionResponse>;
}

const ADDITIONAL_PREFERENCES_STEP = 12;
const ADDITIONAL_PREFERENCES_TOTAL_STEPS = 12;

function normalizeLocale(language: string | undefined): 'en' | 'nl' {
  return language?.startsWith('nl') ? 'nl' : 'en';
}

function statusKey(status: MatchCustomPreferenceUseStatus): string {
  return `matchFirst.additionalPreferences.status.${status}`;
}

export default function AdditionalPreferencesPrompt({
  sessionId,
  initialItems = [],
  onBack,
  onSkip,
  onReview,
  onExtract,
}: AdditionalPreferencesPromptProps) {
  const { t, i18n } = useTranslation();
  const locale = normalizeLocale(i18n.resolvedLanguage ?? i18n.language);
  const [text, setText] = useState('');
  const [items, setItems] = useState<MatchCustomPreferenceItem[]>(initialItems);
  const [submitting, setSubmitting] = useState(false);
  const [showEmpty, setShowEmpty] = useState(false);
  const [error, setError] = useState(false);
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  const progressLabel = t('matchFirst.survey.progressLabel', {
    current: ADDITIONAL_PREFERENCES_STEP,
    total: ADDITIONAL_PREFERENCES_TOTAL_STEPS,
  });
  const examples = useMemo(() => [
    t('matchFirst.additionalPreferences.examples.coast'),
    t('matchFirst.additionalPreferences.examples.dailyMarket'),
    t('matchFirst.additionalPreferences.examples.swimmingWater'),
  ], [t]);

  useEffect(() => {
    titleRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    recordMatchFirstEvent('match_additional_preferences_prompt_shown', {
      locale,
      source: 'additional_preferences',
      session_id: sessionId ?? 'default',
      step: ADDITIONAL_PREFERENCES_STEP,
      total_steps: ADDITIONAL_PREFERENCES_TOTAL_STEPS,
    });
  }, [locale, sessionId]);

  const submit = async () => {
    const trimmed = text.trim();
    if (!trimmed) {
      setShowEmpty(true);
      return;
    }
    setSubmitting(true);
    setShowEmpty(false);
    setError(false);
    recordMatchFirstEvent('match_additional_preferences_submitted', {
      locale,
      source: 'additional_preferences',
      session_id: sessionId ?? 'default',
      custom_preference_count: 1,
    });
    try {
      const extraction = await onExtract(trimmed);
      setItems(extraction.items);
      setText('');
      recordMatchFirstEvent('match_custom_preferences_extracted', {
        locale,
        source: 'additional_preferences',
        session_id: sessionId ?? 'default',
        custom_preference_count: extraction.items.length,
      });
    } catch {
      setError(true);
    } finally {
      setSubmitting(false);
    }
  };

  const skip = async () => {
    recordMatchFirstEvent('match_additional_preferences_skipped', {
      locale,
      source: 'additional_preferences',
      session_id: sessionId ?? 'default',
    });
    setSubmitting(true);
    setError(false);
    try {
      await onSkip();
    } catch {
      setError(true);
    } finally {
      setSubmitting(false);
    }
  };

  const removeItem = (item: MatchCustomPreferenceItem) => {
    setItems((current) => current.filter((entry) => entry.custom_preference_id !== item.custom_preference_id));
    recordMatchFirstEvent('match_custom_preference_rejected', {
      locale,
      source: 'additional_preferences',
      session_id: sessionId ?? 'default',
      custom_preference_key: item.normalized_key ?? 'unclassified_preference',
      custom_preference_status: item.use_status,
      custom_preference_action: 'removed',
    });
  };

  const continueToReview = async () => {
    recordMatchFirstEvent('match_custom_preferences_reviewed', {
      locale,
      source: 'additional_preferences',
      session_id: sessionId ?? 'default',
      custom_preference_count: items.length,
    });
    setSubmitting(true);
    setError(false);
    try {
      await onReview(items);
    } catch {
      setError(true);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section
      className="match-first-landing match-first-landing--simple"
      aria-labelledby="match-additional-preferences-title"
    >
      <div className="match-first-landing__content">
        <progress
          className="survey-question__progress"
          role="progressbar"
          aria-label={progressLabel}
          max={ADDITIONAL_PREFERENCES_TOTAL_STEPS}
          value={ADDITIONAL_PREFERENCES_STEP}
        />
        <p className="match-first-landing__body">{progressLabel}</p>

        <p className="match-first-landing__eyebrow">{t('matchFirst.additionalPreferences.eyebrow')}</p>
        <h1 id="match-additional-preferences-title" ref={titleRef} tabIndex={-1}>
          {t('matchFirst.additionalPreferences.title')}
        </h1>
        <p className="match-first-landing__body">{t('matchFirst.additionalPreferences.body')}</p>

        <label className="additional-preferences__field">
          <span>{t('matchFirst.additionalPreferences.textareaLabel')}</span>
          <textarea
            value={text}
            rows={5}
            onChange={(event) => {
              setText(event.target.value);
              setShowEmpty(false);
              setError(false);
            }}
            placeholder={t('matchFirst.additionalPreferences.textareaPlaceholder')}
          />
        </label>

        <div className="additional-preferences__examples" aria-label={t('matchFirst.additionalPreferences.examplesLabel')}>
          {examples.map((example) => (
            <button
              key={example}
              type="button"
              className="additional-preferences__chip"
              onClick={() => setText(example)}
            >
              {example}
            </button>
          ))}
        </div>

        <p className="additional-preferences__privacy">
          {t('matchFirst.additionalPreferences.privacyNote')}
        </p>

        {showEmpty && (
          <p className="match-first-landing__validation" role="alert">
            {t('matchFirst.additionalPreferences.empty')}
          </p>
        )}
        {error && (
          <p className="match-first-landing__validation" role="alert">
            {t('matchFirst.additionalPreferences.error')}
          </p>
        )}

        {items.length > 0 && (
          <div className="additional-preferences__summary">
            <h2>{t('matchFirst.additionalPreferences.summaryTitle')}</h2>
            <ul>
              {items.map((item) => {
                const label = t(item.label_key);
                return (
                  <li key={item.custom_preference_id}>
                    <span className="additional-preferences__item-label">{label}</span>
                    <span className="additional-preferences__status">{t(statusKey(item.use_status))}</span>
                    <span className="additional-preferences__explanation">{t(item.explanation_key)}</span>
                    <button
                      type="button"
                      className="additional-preferences__remove"
                      onClick={() => removeItem(item)}
                    >
                      {t('matchFirst.additionalPreferences.remove', { label })}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <div className="match-first-landing__actions">
          <button type="button" className="match-first-landing__address-link" onClick={onBack}>
            {t('matchFirst.survey.back')}
          </button>
          <button type="button" className="match-first-landing__address-link" onClick={skip}>
            {t('matchFirst.additionalPreferences.skip')}
          </button>
          <button
            type="button"
            className="match-first-landing__cta"
            disabled={submitting}
            onClick={items.length > 0 ? continueToReview : submit}
          >
            {items.length > 0
              ? t('matchFirst.additionalPreferences.continue')
              : error
                ? t('matchFirst.additionalPreferences.retry')
                : t('matchFirst.additionalPreferences.submit')}
          </button>
        </div>
      </div>
    </section>
  );
}
