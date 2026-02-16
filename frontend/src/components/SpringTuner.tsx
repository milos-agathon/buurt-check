import { SPRING_EXPAND, SPRING_REVEAL, SPRING_SHEET, SPRING_TAB } from '../config/springs';
import './SpringTuner.css';

const SPRINGS = [
  { name: 'SPRING_SHEET', value: SPRING_SHEET },
  { name: 'SPRING_EXPAND', value: SPRING_EXPAND },
  { name: 'SPRING_REVEAL', value: SPRING_REVEAL },
  { name: 'SPRING_TAB', value: SPRING_TAB },
];

export default function SpringTuner() {
  return (
    <aside className="spring-tuner" data-testid="spring-tuner" aria-label="Spring tuning panel">
      <h2 className="spring-tuner__title">Spring Tuner (Dev)</h2>
      <ul className="spring-tuner__list">
        {SPRINGS.map((spring) => (
          <li key={spring.name} className="spring-tuner__item">
            <span className="spring-tuner__name">{spring.name}</span>
            <span className="spring-tuner__value">
              {`stiffness ${spring.value.stiffness} • damping ${spring.value.damping}`}
            </span>
          </li>
        ))}
      </ul>
    </aside>
  );
}
