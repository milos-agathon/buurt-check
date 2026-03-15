import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import SeverityBadge from './ui/SeverityBadge';
import type { QuestionCategory, SeverityLevel } from '../types/api';
import './ViewingChecklist.css';

interface ViewingChecklistProps {
  categories?: QuestionCategory[];
  checkedQuestions: Set<string>;
  onToggleQuestion: (id: string) => void;
  error?: string | null;
  onRetry?: () => void;
}

function isGoodSeverity(severity: SeverityLevel): boolean {
  return severity === 'good';
}

function ViewingChecklist({
  categories = [],
  checkedQuestions,
  onToggleQuestion,
  error,
  onRetry,
}: ViewingChecklistProps) {
  const { i18n, t } = useTranslation();
  const isNl = i18n.language === 'nl';
  const [expandedLanguages, setExpandedLanguages] = useState<Record<string, boolean>>({});

  const visibleCategories = [...categories].sort((left, right) => {
    const leftGood = isGoodSeverity(left.severity);
    const rightGood = isGoodSeverity(right.severity);
    if (leftGood === rightGood) return 0;
    return leftGood ? 1 : -1;
  });

  const toggleAlternateLanguage = (categoryName: string) => {
    setExpandedLanguages((previous) => ({
      ...previous,
      [categoryName]: !previous[categoryName],
    }));
  };

  if (error) {
    return (
      <div className="viewing-checklist viewing-checklist--error" data-testid="viewing-checklist">
        <p className="viewing-checklist__error">{error}</p>
        {onRetry && (
          <button
            type="button"
            className="app__retry-button viewing-checklist__retry"
            onClick={onRetry}
          >
            {t('error.retry', 'Retry')}
          </button>
        )}
      </div>
    );
  }

  if (visibleCategories.length === 0) {
    return (
      <div className="viewing-checklist viewing-checklist--empty" data-testid="viewing-checklist">
        <p className="viewing-checklist__empty">{t('viewingChecklist.empty')}</p>
      </div>
    );
  }

  return (
    <div className="viewing-checklist" data-testid="viewing-checklist">
      {visibleCategories.map((cat) => {
        const expanded = !!expandedLanguages[cat.name];
        const alternateToggleLabel = expanded
          ? isNl
            ? t('viewingChecklist.hideEnglish')
            : t('viewingChecklist.hideDutch')
          : isNl
            ? t('viewingChecklist.showEnglish')
            : t('viewingChecklist.showDutch');

        return (
          <div key={cat.name} className="viewing-checklist__group" role="group" aria-label={isNl ? cat.name_nl : cat.name}>
            <div className="viewing-checklist__group-header">
              <span className="viewing-checklist__group-name">
                {isNl ? cat.name_nl : cat.name}
              </span>
              <SeverityBadge severity={cat.severity as SeverityLevel} size="sm" />
            </div>

            <button
              type="button"
              className="viewing-checklist__language-toggle"
              onClick={() => toggleAlternateLanguage(cat.name)}
            >
              {alternateToggleLabel}
            </button>

            <div className="viewing-checklist__questions">
              {cat.questions.map((q, i) => {
                const id = `${cat.name.toLowerCase()}-q-${i}`;
                const primaryText = isNl ? q.text_nl : q.text_en;
                const secondaryText = isNl ? q.text_en : q.text_nl;
                return (
                  <label key={id} className="viewing-checklist__item">
                    <input
                      type="checkbox"
                      className="viewing-checklist__checkbox"
                      checked={checkedQuestions.has(id)}
                      onChange={() => onToggleQuestion(id)}
                    />
                    <span className="viewing-checklist__item-copy">
                      <span>{primaryText}</span>
                      {expanded && (
                        <span className="viewing-checklist__item-translation">
                          {secondaryText}
                        </span>
                      )}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default memo(ViewingChecklist);
