import { useTranslation } from 'react-i18next';
import type { MapillaryResponse } from '../types/api';
import './MapillaryPanel.css';

interface Props {
  data?: MapillaryResponse;
  loading?: boolean;
  error?: boolean;
}

function messageText(
  t: ReturnType<typeof useTranslation>['t'],
  code: string | undefined,
): string {
  if (!code) return t('mapillary.message.default');
  const key = `mapillary.message.${code}`;
  const translated = t(key);
  return translated === key ? t('mapillary.message.default') : translated;
}

export default function MapillaryPanel({ data, loading, error }: Props) {
  const { t } = useTranslation();

  if (loading) {
    return (
      <section className="mapillary-panel" data-testid="mapillary-panel">
        <h2 className="mapillary-panel__title">{t('mapillary.title')}</h2>
        <p className="mapillary-panel__loading">{t('mapillary.loading')}</p>
      </section>
    );
  }

  if (error && !data) {
    return (
      <section className="mapillary-panel" data-testid="mapillary-panel">
        <h2 className="mapillary-panel__title">{t('mapillary.title')}</h2>
        <p className="mapillary-panel__error">{t('mapillary.error')}</p>
      </section>
    );
  }

  if (!data) return null;

  const sourceDate = data.source_date ?? t('risk.dateUnknown');
  const image = data.image;
  const capturedAt = image?.captured_at ? image.captured_at.slice(0, 10) : null;
  const distance = image?.distance_m != null ? Math.round(image.distance_m) : null;

  return (
    <section className="mapillary-panel" data-testid="mapillary-panel">
      <h2 className="mapillary-panel__title">{t('mapillary.title')}</h2>

      {image ? (
        <>
          <div className="mapillary-panel__viewer-wrap">
            <iframe
              className="mapillary-panel__viewer"
              src={image.embed_url}
              title={t('mapillary.viewerTitle')}
              loading="lazy"
              allowFullScreen
              referrerPolicy="origin"
            />
          </div>

          <p className="mapillary-panel__meta">
            {capturedAt ? t('mapillary.capturedAt', { date: capturedAt }) : ''}
            {capturedAt && distance != null ? ' · ' : ''}
            {distance != null ? t('mapillary.distance', { meters: distance }) : ''}
          </p>

          <a
            className="mapillary-panel__link"
            href={image.viewer_url}
            target="_blank"
            rel="noreferrer noopener"
          >
            {t('mapillary.open')}
          </a>
        </>
      ) : (
        <p className="mapillary-panel__empty">{messageText(t, data.message)}</p>
      )}

      <p className="mapillary-panel__source">
        {t('mapillary.source', { source: data.source, date: sourceDate })}
      </p>
      <p className="mapillary-panel__legal">{t('mapillary.legal')}</p>
    </section>
  );
}
