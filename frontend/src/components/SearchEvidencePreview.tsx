import { useTranslation } from 'react-i18next';
import './SearchEvidencePreview.css';

const previewItems = ['sources', 'questions', 'coverage'] as const;

export default function SearchEvidencePreview() {
  const { t } = useTranslation();

  return (
    <aside className="search-evidence-preview address-search__desktop-evidence" aria-label={t('search.evidencePanelLabel')}>
      <p className="search-evidence-preview__eyebrow">{t('search.evidencePanelEyebrow')}</p>
      <h2 className="search-evidence-preview__title">{t('search.evidencePanelTitle')}</h2>
      <p className="search-evidence-preview__body">{t('search.evidencePanelBody')}</p>
      <div className="search-evidence-preview__items">
        {previewItems.map((item) => (
          <div className="search-evidence-preview__item" key={item}>
            <span className="search-evidence-preview__marker" aria-hidden="true" />
            <div>
              <span className="search-evidence-preview__item-title">{t(`search.evidencePreview.${item}.title`)}</span>
              <span className="search-evidence-preview__item-body">{t(`search.evidencePreview.${item}.body`)}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="search-evidence-preview__footer">
        <span className="search-evidence-preview__footer-label">
          {t('search.evidencePreview.footer.title')}
        </span>
        <span className="search-evidence-preview__footer-copy">
          {t('search.evidencePreview.footer.body')}
        </span>
      </div>
    </aside>
  );
}
