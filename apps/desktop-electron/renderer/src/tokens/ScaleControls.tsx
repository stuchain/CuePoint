import { useScale } from "./ScaleContext";

export function ScaleControls() {
  const { scale, setScale, scaleOptions } = useScale();

  return (
    <div className="scale-controls">
      <span className="scale-controls__label">Scale</span>
      {scaleOptions.map((option) => (
        <button
          key={option}
          type="button"
          className={`scale-controls__btn ${scale === option ? "scale-controls__btn--active" : ""}`}
          onClick={() => setScale(option)}
        >
          {option}×
        </button>
      ))}
    </div>
  );
}
