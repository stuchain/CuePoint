import { Fieldset, Select } from "../components";
import { useKeyColours } from "../components/wheel/keyColourSetting";
import { saveKeyNotation, useKeyNotation, type KeyNotation } from "../components/wheel/keyNotationSetting";
import { useRowDensity, type RowDensity } from "../tokens/rowDensity";

/** The two row heights. Named by feel, not in pixels: the rows measure what the text size makes them (M244). */
export const DENSITIES: readonly { value: RowDensity; label: string }[] = [
  { value: "compact", label: "Compact" },
  { value: "roomy", label: "Roomy" },
];

/** How a key is written everywhere it is shown (K1 to K3); the long names carry their example. */
const KEY_NOTATIONS: readonly { value: KeyNotation; label: string }[] = [
  { value: "camelot", label: "Camelot (8A)" },
  { value: "musical", label: "Musical (Am)" },
  { value: "both", label: "Both (8A · Am)" },
];

/**
 * Settings → Appearance → Tables (R4-1, R4-2, K1): how tall table rows are against
 * their text, whether keys are drawn as Camelot-coloured chips, and how keys are
 * written. All are renderer preferences that apply at once; `onChange` is how the page shows its
 * saved tick.
 */
export function TableSettings({ onChange }: { onChange?: () => void } = {}) {
  const [density, setDensity] = useRowDensity();
  const [coloured, setColoured] = useKeyColours();
  const notation = useKeyNotation();

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
        <span>Color key chips</span>
      </label>
      <Select
        label="Keys written as"
        width="standard"
        value={notation}
        onChange={(e) => {
          saveKeyNotation(e.target.value as KeyNotation);
          onChange?.();
        }}
        options={KEY_NOTATIONS.map((option) => ({ ...option }))}
        hint="Everywhere a key is shown: tables, the wheel, the player, Prepare and Statistics. Files and exports keep their own notation."
      />
    </Fieldset>
  );
}
