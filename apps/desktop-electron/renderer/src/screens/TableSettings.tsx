import { Select } from "../components";
import { useKeyColours } from "../components/wheel/keyColourSetting";
import { useRowDensity, type RowDensity } from "../tokens/rowDensity";

const DENSITIES: readonly { value: RowDensity; label: string }[] = [
  { value: "compact", label: "Compact" },
  { value: "roomy", label: "Roomy" },
];

/**
 * Settings → Appearance → Tables (R4-1, R4-2): how tall table rows are against
 * their text, and whether keys are drawn as Camelot-coloured chips. Both are
 * renderer preferences that apply at once; `onChange` is how the page shows its
 * saved tick.
 */
export function TableSettings({ onChange }: { onChange?: () => void } = {}) {
  const [density, setDensity] = useRowDensity();
  const [coloured, setColoured] = useKeyColours();

  return (
    <fieldset className="theme-settings__group">
      <legend className="theme-settings__legend">Tables</legend>
      <Select
        label="Row density"
        value={density}
        onChange={(e) => {
          setDensity(e.target.value as RowDensity);
          onChange?.();
        }}
        options={DENSITIES.map((option) => ({ ...option }))}
      />
      <label className="theme-settings__option">
        <input
          type="checkbox"
          checked={coloured}
          onChange={(e) => {
            setColoured(e.target.checked);
            onChange?.();
          }}
        />
        <span>Color keys</span>
      </label>
    </fieldset>
  );
}
