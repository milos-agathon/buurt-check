import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { trackEvent } from '../services/analytics';
import './UpgradeCTA.css';

interface UpgradeCTAProps {
  onUpgrade: () => void;
  price: string;
  disabled?: boolean;
}

export default function UpgradeCTA({ onUpgrade, price, disabled = false }: UpgradeCTAProps) {
  const { t } = useTranslation();
  const cardRef = useRef<HTMLElement | null>(null);
  const viewedRef = useRef(false);

  useEffect(() => {
    const node = cardRef.current;
    if (!node || viewedRef.current || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting || viewedRef.current) continue;
        viewedRef.current = true;
        trackEvent('upgrade_cta_viewed');
        observer.disconnect();
        break;
      }
    }, { threshold: 0.35 });

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <section className="upgrade-cta" ref={cardRef} data-testid="upgrade-cta">
      <h3 className="upgrade-cta__title">{t('premium.upgrade.title')}</h3>
      <p className="upgrade-cta__subtitle">{t('premium.upgrade.subtitle')}</p>

      <ul className="upgrade-cta__list">
        <li>{t('premium.upgrade.includes.warnings')}</li>
        <li>{t('premium.upgrade.includes.viewing')}</li>
        <li>{t('premium.upgrade.includes.3d')}</li>
        <li>{t('premium.upgrade.includes.pdf')}</li>
        <li>{t('premium.upgrade.includes.compare')}</li>
      </ul>

      <p className="upgrade-cta__price">{t('premium.upgrade.price', { price })}</p>
      <button
        type="button"
        className="upgrade-cta__button"
        onClick={() => {
          trackEvent('upgrade_cta_clicked');
          onUpgrade();
        }}
        disabled={disabled}
      >
        {t('premium.upgrade.cta')}
      </button>
      <p className="upgrade-cta__reassurance">{t('premium.upgrade.reassurance')}</p>
    </section>
  );
}

