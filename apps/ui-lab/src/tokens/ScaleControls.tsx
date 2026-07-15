import { SCALE_OPTIONS, type ScaleFactor, setStoredScale } from "./scale";

export interface ScaleControlsProps {
  scale: ScaleFactor;
  onChange: (scale: ScaleFactor) => void;
}

export function ScaleControls({ scale, onChange }: ScaleControlsProps) {
  return (
    <div className="scale-controls">
      <span className="scale-controls__label">Scale</span>
      {SCALE_OPTIONS.map((option) => (
        <button
          key={option}
          type="button"
          className={`scale-controls__btn ${scale === option ? "scale-controls__btn--active" : ""}`}
          onClick={() => {
            setStoredScale(option);
            onChange(option);
          }}
        >
          {option}×
        </button>
      ))}
    </div>
  );
}
