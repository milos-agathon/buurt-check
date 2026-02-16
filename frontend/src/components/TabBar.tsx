import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import './TabBar.css';

export type TabId = 'search' | 'saved';

interface TabBarProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  savedCount: number;
}

const TABS: { id: TabId; icon: string; labelKey: string }[] = [
  { id: 'search', icon: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z', labelKey: 'nav.search' },
  { id: 'saved', icon: 'M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z', labelKey: 'nav.saved' },
];

export default function TabBar({ activeTab, onTabChange, savedCount }: TabBarProps) {
  const { t } = useTranslation();

  return (
    <nav className="tab-bar" role="tablist" aria-label={t('nav.primaryTabs')}>
      <div className="tab-bar__center-pill" aria-hidden="true" />
      {TABS.map(tab => {
        const isActive = activeTab === tab.id;
        return (
          <motion.button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-label={t(tab.labelKey)}
            className={`tab-bar__tab${isActive ? ' tab-bar__tab--active' : ''}`}
            onClick={() => onTabChange(tab.id)}
            whileTap={{ scale: 0.97 }}
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
