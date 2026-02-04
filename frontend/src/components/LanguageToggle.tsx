import { useTranslation } from 'react-i18next';
import './LanguageToggle.css';

export default function LanguageToggle() {
  const { t, i18n } = useTranslation();

  const toggle = () => {
    i18n.changeLanguage(i18n.language === 'en' ? 'nl' : 'en');
  };

  return (
    <button className="language-toggle" onClick={toggle} type="button">
      {t('language.toggle')}
    </button>
  );
}
