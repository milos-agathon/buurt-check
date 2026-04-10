import { useTranslation } from 'react-i18next';
import './QuartileDots.css';

interface QuartileDotsProps {
  quartile: number; // 1-4
  favorableQuartile?: number | null;
  mode?: 'distribution' | 'favorability';
}

export default function QuartileDots({
  quartile,
  favorableQuartile,
  mode = favorableQuartile != null ? 'favorability' : 'distribution',
}: QuartileDotsProps) {
  const { t } = useTranslation();
  const filledQuartile = mode === 'favorability'
    ? Math.max(1, Math.min(4, favorableQuartile ?? quartile))
    : Math.max(1, Math.min(4, quartile));
  const labelKey = mode === 'favorability' ? 'common.favorableQuartile' : 'common.quartile';

  return (
    <div
      className="quartile-dots"
      aria-label={t(labelKey, { quartile: filledQuartile, rawQuartile: quartile, total: 4 })}
      data-mode={mode}
      data-quartile={quartile}
      data-favorable-quartile={mode === 'favorability' ? filledQuartile : undefined}
    >
      {[1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className={`quartile-dots__dot${i <= filledQuartile ? ' quartile-dots__dot--filled' : ''}`}
        />
      ))}
    </div>
  );
}
