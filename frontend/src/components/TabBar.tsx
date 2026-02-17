import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import './TabBar.css';

export type TabId = 'home' | 'briefing' | 'saved';

interface TabBarProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  savedCount: number;
  hasDossier?: boolean;
}

const TABS: { id: TabId; icon: string; labelKey: string }[] = [
  { id: 'home', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1', labelKey: 'nav.home' },
  { id: 'briefing', icon: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8', labelKey: 'nav.briefing' },
  { id: 'saved', icon: 'M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z', labelKey: 'nav.saved' },
];

export default function TabBar({ activeTab, onTabChange, savedCount, hasDossier }: TabBarProps) {
  const { t } = useTranslation();

  return (
    <nav className="tab-bar" role="tablist" aria-label={t('nav.primaryTabs')}>
      {TABS.map(tab => {
        const isActive = activeTab === tab.id;
        const isDisabled = tab.id === 'briefing' && !hasDossier;
        return (
          <motion.button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-disabled={isDisabled || undefined}
            aria-label={t(tab.labelKey)}
            className={`tab-bar__tab${isActive ? ' tab-bar__tab--active' : ''}${isDisabled ? ' tab-bar__tab--disabled' : ''}`}
            onClick={() => !isDisabled && onTabChange(tab.id)}
            whileTap={isDisabled ? undefined : { scale: 0.97 }}
          >
            <div className="tab-bar__icon-wrapper">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d={tab.icon} />
              </svg>
              {tab.id === 'saved' && savedCount > 0 && (
                <span className="tab-bar__badge">{savedCount}</span>
              )}
            </div>
            <span className="tab-bar__label">{t(tab.labelKey)}</span>
          </motion.button>
        );
      })}
    </nav>
  );
}
