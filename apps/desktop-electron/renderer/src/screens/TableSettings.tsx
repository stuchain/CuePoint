import { Fieldset, Select } from "../components";
import { useKeyColours } from "../components/wheel/keyColourSetting";
import { useRowDensity, type RowDensity } from "../tokens/rowDensity";

/** The two row heights at the default size (they follow the text size): 26 and 32 px. */
export const DENSITIES: readonly { value: RowDensity; label: string }[] = [
  { value: "compact", label: "Compact (26 px)" },
  { value: "roomy", label: "Roomy (32 px)" },
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
    // A group of named fields, so its name is the one sub-heading, not another field label (C58).
    <Fieldset legend={<span className="cp-text-subhead">Tables</span>} className="theme-settings__group">
      <Select
        label="Row density"
        width="standard"
        value={density}
        onChange={(e) => {
          setDensity(e.target.value as RowDensity);
          onChange?.();
        }}
        options={DENSITIES.map((option) => ({ ...option }))}
      />
      <label className="theme-settings__option settings-check">
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
    </Fieldset>
  );
}
