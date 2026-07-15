import "./ProgressBar.css";

export interface ProgressBarProps {
  value: number;
  label?: string;
}

export function ProgressBar({ value, label }: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, value));
  return (
    <div className="cp-progress">
      {label && <div className="cp-progress__label">{label}</div>}
      <div className="cp-progress__track" role="progressbar" aria-valuenow={clamped} aria-valuemin={0} aria-valuemax={100}>
        <div className="cp-progress__fill" style={{ width: `${clamped}%` }} />
      </div>
      <div className="cp-progress__pct">{clamped.toFixed(0)}%</div>
    </div>
  );
}
