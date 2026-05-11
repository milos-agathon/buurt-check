import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import RiskTile from './RiskTile';
import type {
  RiskCardsResponse,
  SeverityLevel,
  RiskLevel,
  ViewingQuestionsResponse,
} from '../types/api';
import './RiskTilesGrid.css';

interface RiskTilesGridProps {
  risks?: RiskCardsResponse;
  questions?: ViewingQuestionsResponse;
  onTileTap?: (category: string) => void;
}

function levelToSeverity(level: RiskLevel, score?: number): SeverityLevel {
  if (score != null) {
    if (score >= 70) return 'good';
    if (score >= 40) return 'moderate';
    if (score >= 20) return 'poor';
    return 'critical';
  }
  switch (level) {
    case 'low': return 'good';
    case 'medium': return 'moderate';
    case 'high': return 'poor';
    default: return 'unavailable';
  }
}

function questionCountForCategory(questions: ViewingQuestionsResponse | undefined, category: string): number {
  if (!questions) return 0;
  const normalized = category.toLowerCase();
  const match = questions.categories.find((entry) => {
    const name = entry.name.toLowerCase();
    if (normalized === 'air') return name === 'air' || name === 'air quality';
    if (normalized === 'climate') return name === 'climate' || name === 'climate stress';
    return name === normalized;
  });
  return match?.questions.length ?? 0;
}

function firstQuestionForCategory(
  questions: ViewingQuestionsResponse | undefined,
  category: string,
  isNl: boolean,
): string | undefined {
  if (!questions) return undefined;
  const normalized = category.toLowerCase();
  const match = questions.categories.find((entry) => {
    const name = entry.name.toLowerCase();
    if (normalized === 'air') return name === 'air' || name === 'air quality';
    if (normalized === 'climate') return name === 'climate' || name === 'climate stress';
    return name === normalized;
  });
  const question = match?.questions[0];
  return question ? (isNl ? question.text_nl : question.text_en) : undefined;
}

function RiskTilesGrid({ risks, questions, onTileTap }: RiskTilesGridProps) {
  const { i18n, t } = useTranslation();
  const isNl = i18n.language === 'nl';
  const unavailableSummary = t('risk.tileUnavailable');

  const cards = [
    {
      category: 'noise',
      labelKey: 'risk.noise.title',
      score: risks?.noise.score,
      severity: risks ? levelToSeverity(risks.noise.level, risks.noise.score) : 'unavailable',
      summary: risks
        ? (isNl ? risks.noise.summary_nl : risks.noise.summary)
        : unavailableSummary,
      warnings: risks?.noise.warnings ?? (risks?.noise.message ? [risks.noise.message] : []),
      unavailable: !risks || risks.noise.level === 'unavailable' || risks.noise.score == null,
      source: risks?.noise.source,
      sourceDate: risks?.noise.source_date,
      confidence: risks?.noise.level === 'unavailable' ? t('risk.confidence.unavailable') : t('risk.confidence.indicative'),
      questionCount: questionCountForCategory(questions, 'noise'),
      firstQuestion: firstQuestionForCategory(questions, 'noise', isNl),
      limitation: t('risk.limitation.noise'),
    },
    {
      category: 'air',
      labelKey: 'risk.air.title',
      score: risks?.air_quality.score,
      severity: risks ? levelToSeverity(risks.air_quality.level, risks.air_quality.score) : 'unavailable',
      summary: risks
        ? (isNl ? risks.air_quality.summary_nl : risks.air_quality.summary)
        : unavailableSummary,
      warnings: risks?.air_quality.warnings ?? (risks?.air_quality.message ? [risks.air_quality.message] : []),
      unavailable: !risks || risks.air_quality.level === 'unavailable' || risks.air_quality.score == null,
      source: risks?.air_quality.source,
      sourceDate: risks?.air_quality.source_date,
      confidence: risks?.air_quality.level === 'unavailable' ? t('risk.confidence.unavailable') : t('risk.confidence.indicative'),
      questionCount: questionCountForCategory(questions, 'air'),
      firstQuestion: firstQuestionForCategory(questions, 'air', isNl),
      limitation: t('risk.limitation.air'),
    },
    {
      category: 'climate',
      labelKey: 'risk.climate.title',
      score: risks?.climate_stress.score,
      severity: risks ? levelToSeverity(risks.climate_stress.level, risks.climate_stress.score) : 'unavailable',
      summary: risks
        ? (isNl ? risks.climate_stress.summary_nl : risks.climate_stress.summary)
        : unavailableSummary,
      warnings: risks?.climate_stress.warnings ?? (risks?.climate_stress.message ? [risks.climate_stress.message] : []),
      unavailable: !risks || risks.climate_stress.level === 'unavailable' || risks.climate_stress.score == null,
      source: risks?.climate_stress.source,
      sourceDate: risks?.climate_stress.source_date,
      confidence: risks?.climate_stress.level === 'unavailable' ? t('risk.confidence.unavailable') : t('risk.confidence.indicative'),
      questionCount: questionCountForCategory(questions, 'climate'),
      firstQuestion: firstQuestionForCategory(questions, 'climate', isNl),
      limitation: t('risk.limitation.climate'),
    },
  ] as const;

  return (
    <div className="risk-tiles-grid">
      {cards.map((card) => (
        <RiskTile
          key={card.category}
          category={card.category}
          labelKey={card.labelKey}
          score={card.score}
          severity={card.severity}
          summary={card.unavailable ? unavailableSummary : card.summary}
          warnings={card.warnings ? [...card.warnings] : undefined}
          unavailable={card.unavailable}
          source={card.source}
          sourceDate={card.sourceDate}
          confidence={card.confidence}
          questionCount={card.questionCount}
          firstQuestion={card.firstQuestion}
          limitation={card.limitation}
          onTap={card.unavailable ? undefined : () => onTileTap?.(card.category)}
        />
      ))}
    </div>
  );
}

export default memo(RiskTilesGrid);
