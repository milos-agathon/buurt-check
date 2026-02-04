import { useTranslation } from 'react-i18next';
import type { ShadowSnapshot } from '../types/api';
import './ShadowSnapshots.css';

interface Props {
  snapshots?: ShadowSnapshot[];
  loading?: boolean;
}

const LABEL_KEYS: Record<string, string> = {
  morning: 'snapshots.morning',
  noon: 'snapshots.noon',
  evening: 'snapshots.evening',
};

const HOURS: Record<string, number> = {
  morning: 9,
  noon: 12,
  evening: 17,
};

export default function ShadowSnapshots({ snapshots, loading }: Props) {
  const { t } = useTranslation();

  if (loading) {
    return (
      <div className="shadow-snapshots">
        <h2 className="shadow-snapshots__title">{t('snapshots.title')}</h2>
        <p className="shadow-snapshots__loading">{t('snapshots.loading')}</p>
      </div>
    );
  }

  if (!snapshots) return null;

  return (
    <div className="shadow-snapshots">
      <h2 className="shadow-snapshots__title">{t('snapshots.title')}</h2>
      <p className="shadow-snapshots__subtitle">{t('snapshots.subtitle')}</p>
      <div className="shadow-snapshots__grid">
        {snapshots.map((snap) => (
          <div key={snap.label} className="shadow-snapshots__item">
            <img
              src={snap.dataUrl}
              alt={`${t(LABEL_KEYS[snap.label] ?? snap.label)} (${HOURS[snap.label] ?? snap.hour}:00)`}
              className="shadow-snapshots__image"
            />
            <span className="shadow-snapshots__label">
              {t(LABEL_KEYS[snap.label] ?? snap.label)} ({HOURS[snap.label] ?? snap.hour}:00)
            </span>
          </div>
        ))}
      </div>
      <p className="shadow-snapshots__source">{t('snapshots.source')}</p>
    </div>
  );
}
