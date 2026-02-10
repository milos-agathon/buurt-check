import './ToggleSwitch.css';

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
}

export default function ToggleSwitch({ checked, onChange, label, disabled = false }: ToggleSwitchProps) {
  return (
    <label className={`toggle-switch${disabled ? ' toggle-switch--disabled' : ''}`}>
      {label && <span className="toggle-switch__label">{label}</span>}
      <button
        role="switch"
        aria-checked={checked}
        aria-label={label}
        className={`toggle-switch__track${checked ? ' toggle-switch__track--on' : ''}`}
        onClick={() => !disabled && onChange(!checked)}
        disabled={disabled}
        type="button"
      >
        <span className="toggle-switch__thumb" />
      </button>
    </label>
  );
}
