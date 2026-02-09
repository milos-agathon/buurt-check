import './QuartileDots.css';

interface QuartileDotsProps {
  quartile: number; // 1-4
}

export default function QuartileDots({ quartile }: QuartileDotsProps) {
  return (
    <div className="quartile-dots" aria-label={`Quartile ${quartile} of 4`}>
      {[1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className={`quartile-dots__dot${i <= quartile ? ' quartile-dots__dot--filled' : ''}`}
        />
      ))}
    </div>
  );
}
