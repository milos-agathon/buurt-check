import { useTranslation } from 'react-i18next';
import './LockedSection.css';

interface LockedSectionProps {
  sectionName: string;
}

export default function LockedSection({ sectionName }: LockedSectionProps) {
  const { t } = useTranslation();

  return (
    <section
      className="locked-section"
      role="region"
      aria-label={t('premium.locked.aria', { section: sectionName })}
      data-testid="locked-section"
    >
      <p className="locked-section__title">{t('premium.locked.title')}</p>
      <p className="locked-section__subtitle">{t('premium.locked.subtitle', { section: sectionName })}</p>
      <p className="locked-section__subtitle">{t('premium.locked.upgradePrompt')}</p>
    </section>
  );
}
