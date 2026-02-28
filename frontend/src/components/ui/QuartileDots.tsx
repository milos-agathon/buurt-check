import './QuartileDots.css';
import { useTranslation } from 'react-i18next';

interface QuartileDotsProps {
  quartile: number; // 1-4
}

export default function QuartileDots({ quartile }: QuartileDotsProps) {
  const { t } = useTranslation();

  return (
    <div
      className="quartile-dots"
      role="img"
      aria-label={t('quartileDots.ariaLabel', { quartile, total: 4 })}
    >
      {[1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className={`quartile-dots__dot${i <= quartile ? ' quartile-dots__dot--filled' : ''}`}
        />
      ))}
    </div>
  );
}
