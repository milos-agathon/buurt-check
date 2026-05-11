import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  JourneyIntent,
  MatchAlertCreatePayload,
  MatchAlertRule,
  AlertStatus,
} from '../../types/match';
import './MatchAlerts.css';

interface SuggestedAlert {
  neighborhood_id: string;
  neighborhood_name: string;
  journey_intent: JourneyIntent;
  budget_max_cents?: number | null;
  rent_max_cents?: number | null;
  property_type: string;
  source_context: MatchAlertCreatePayload['source_context'];
}

interface MatchAlertsProps {
  alerts: MatchAlertRule[];
  suggestedAlerts?: SuggestedAlert[];
  loading?: boolean;
  errorCode?: string | null;
  duplicate?: boolean;
  onCreate: (payload: MatchAlertCreatePayload) => void | Promise<void>;
  onUpdateStatus: (alertId: string, status: AlertStatus) => void | Promise<void>;
  onDelete: (alertId: string) => void | Promise<void>;
}

function centsFromInput(value: string): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 100) : null;
}

export default function MatchAlerts({
  alerts,
  suggestedAlerts = [],
  loading = false,
  errorCode = null,
  duplicate = false,
  onCreate,
  onUpdateStatus,
  onDelete,
}: MatchAlertsProps) {
  const { t } = useTranslation();
  const [neighborhoodId, setNeighborhoodId] = useState(suggestedAlerts[0]?.neighborhood_id ?? '');
  const [intent, setIntent] = useState<JourneyIntent>(suggestedAlerts[0]?.journey_intent ?? 'buy');
  const [budget, setBudget] = useState('');
  const [rentBudget, setRentBudget] = useState('');
  const [propertyType, setPropertyType] = useState(suggestedAlerts[0]?.property_type ?? 'apartment');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void onCreate({
      neighborhood_ids: [neighborhoodId],
      journey_intent: intent,
      budget_max_cents: intent === 'rent' ? null : centsFromInput(budget),
      rent_max_cents: intent === 'buy' ? null : centsFromInput(rentBudget),
      property_types: [propertyType],
      notification_type: 'mock',
      source_context: 'manual',
    });
  };

  const applySuggestion = (suggestion: SuggestedAlert) => {
    setNeighborhoodId(suggestion.neighborhood_id);
    setIntent(suggestion.journey_intent);
    setBudget(suggestion.budget_max_cents ? String(suggestion.budget_max_cents / 100) : '');
    setRentBudget(suggestion.rent_max_cents ? String(suggestion.rent_max_cents / 100) : '');
    setPropertyType(suggestion.property_type);
  };

  if (loading) {
    return (
      <section className="match-alerts" aria-busy="true">
        <h1>{t('match.alerts.title')}</h1>
        <p role="status">{t('match.alerts.loading')}</p>
      </section>
    );
  }

  return (
    <section className="match-alerts" aria-labelledby="match-alerts-title">
      <header>
        <p className="match-alerts__eyebrow">{t('match.alerts.eyebrow')}</p>
        <h1 id="match-alerts-title">{t('match.alerts.title')}</h1>
      </header>

      {errorCode && <p role="alert">{t(errorCode)}</p>}
      {duplicate && <p role="status">{t('match.alerts.duplicate')}</p>}

      {suggestedAlerts.length > 0 && (
        <section className="match-alerts__suggestions" aria-label={t('match.alerts.suggestions')}>
          {suggestedAlerts.map((suggestion) => (
            <button
              type="button"
              key={`${suggestion.neighborhood_id}-${suggestion.journey_intent}`}
              onClick={() => applySuggestion(suggestion)}
            >
              {t('match.alerts.suggestionLabel', {
                neighborhood: suggestion.neighborhood_name,
                intent: t(`match.quiz.journey.${suggestion.journey_intent}`),
              })}
            </button>
          ))}
        </section>
      )}

      <form className="match-alerts__form" onSubmit={submit}>
        <label>
          {t('match.alerts.fields.neighborhood')}
          <input
            value={neighborhoodId}
            onChange={(event) => setNeighborhoodId(event.target.value)}
            required
          />
        </label>
        <label>
          {t('match.alerts.fields.intent')}
          <select value={intent} onChange={(event) => setIntent(event.target.value as JourneyIntent)}>
            <option value="buy">{t('match.quiz.journey.buy')}</option>
            <option value="rent">{t('match.quiz.journey.rent')}</option>
            <option value="both">{t('match.quiz.journey.both')}</option>
          </select>
        </label>
        {intent !== 'rent' && (
          <label>
            {t('match.alerts.fields.buyBudget')}
            <input
              inputMode="numeric"
              value={budget}
              onChange={(event) => setBudget(event.target.value)}
              required
            />
          </label>
        )}
        {intent !== 'buy' && (
          <label>
            {t('match.alerts.fields.rentBudget')}
            <input
              inputMode="numeric"
              value={rentBudget}
              onChange={(event) => setRentBudget(event.target.value)}
              required
            />
          </label>
        )}
        <label>
          {t('match.alerts.fields.propertyType')}
          <input value={propertyType} onChange={(event) => setPropertyType(event.target.value)} required />
        </label>
        <button type="submit">{t('match.alerts.create')}</button>
      </form>

      <section className="match-alerts__list" aria-label={t('match.alerts.savedAlerts')}>
        {alerts.length === 0 ? (
          <p>{t('match.alerts.empty')}</p>
        ) : (
          alerts.map((alert) => (
            <article className="match-alerts__item" key={alert.alert_id}>
              <h2>{alert.neighborhood_ids.join(', ')}</h2>
              <p>
                {t(`match.quiz.journey.${alert.journey_intent}`)} · {alert.property_types.join(', ')}
              </p>
              <p>{t(`match.alerts.status.${alert.status}`)}</p>
              <p>{t('match.alerts.mockDispatch')}</p>
              <div className="match-alerts__actions">
                <button
                  type="button"
                  onClick={() => void onUpdateStatus(alert.alert_id, alert.status === 'paused' ? 'active' : 'paused')}
                >
                  {alert.status === 'paused' ? t('match.alerts.resume') : t('match.alerts.pause')}
                </button>
                <button type="button" onClick={() => void onDelete(alert.alert_id)}>
                  {t('match.alerts.delete')}
                </button>
              </div>
            </article>
          ))
        )}
      </section>
    </section>
  );
}
