import { useTranslation } from 'react-i18next';
import SeverityBadge from './ui/SeverityBadge';
import type { QuestionCategory, SeverityLevel } from '../types/api';
import './ViewingChecklist.css';

interface ViewingChecklistProps {
  categories: QuestionCategory[];
  checkedQuestions: Set<string>;
  onToggleQuestion: (id: string) => void;
}

export default function ViewingChecklist({
  categories,
  checkedQuestions,
  onToggleQuestion,
}: ViewingChecklistProps) {
  const { i18n } = useTranslation();
  const isNl = i18n.language === 'nl';

  // Only show moderate or worse categories
  const visibleCategories = categories.filter(
    (c) => c.severity === 'moderate' || c.severity === 'poor' || c.severity === 'critical',
  );

  if (visibleCategories.length === 0) return null;

  return (
    <div className="viewing-checklist" data-testid="viewing-checklist">
      {visibleCategories.map((cat) => (
        <div key={cat.name} className="viewing-checklist__group">
          <div className="viewing-checklist__group-header">
            <span className="viewing-checklist__group-name">
              {isNl ? cat.name_nl : cat.name}
            </span>
            <SeverityBadge severity={cat.severity as SeverityLevel} size="sm" />
          </div>
          <div className="viewing-checklist__questions">
            {cat.questions.map((q, i) => {
              const id = `${cat.name.toLowerCase()}-q-${i}`;
              const text = isNl ? q.text_nl : q.text_en;
              return (
                <label key={id} className="viewing-checklist__item">
                  <input
                    type="checkbox"
                    className="viewing-checklist__checkbox"
                    checked={checkedQuestions.has(id)}
                    onChange={() => onToggleQuestion(id)}
                  />
                  <span>{text}</span>
                </label>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
