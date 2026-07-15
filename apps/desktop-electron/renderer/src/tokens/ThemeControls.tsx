import { useTheme } from "./ThemeContext";
import "./theme-controls.css";

export function ThemeControls() {
  const { activeThemeId, themeOptions, setTheme } = useTheme();

  return (
    <div className="theme-controls">
      <label className="theme-controls__label" htmlFor="theme-select">
        Theme
      </label>
      <select
        id="theme-select"
        className="theme-controls__select"
        value={activeThemeId}
        onChange={(e) => setTheme(e.target.value as typeof activeThemeId)}
      >
        {themeOptions.map((opt) => (
          <option key={opt.id} value={opt.id}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
