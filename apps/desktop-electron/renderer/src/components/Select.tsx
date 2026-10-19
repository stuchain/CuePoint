import type { SelectHTMLAttributes } from "react";
import { useId } from "react";
import { PixelIcon } from "./PixelIcon";
import { FIELD_WIDTH_CLASS, type FieldWidth } from "./TextField";
import "./Select.css";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
  /**
   * The group this option is listed under (LIB-7). Options that share a group
   * and follow one another are drawn in one `<optgroup>`; an option with no
   * group is drawn on its own, above or between groups.
   */
  group?: string;
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  /** The label stays the accessible name but is not drawn (a select that sits in a row of controls). */
  hideLabel?: boolean;
  /**
   * Draw the label inside the box, before the value ("Scope  Everything"), so a select in a row of
   * controls names itself without a line above it and nothing is painted over (C222).
   */
  inlineLabel?: boolean;
  options: SelectOption[];
  /** Muted words below the select. Hidden while there is an error. */
  hint?: string;
  /** What is wrong, in red under the select; the select gets a red border and `aria-invalid`. */
  error?: string;
  /** `short`, `standard` (the default, at most 320 times the scale) or `full`: see TextField (area 87). */
  width?: FieldWidth;
}

/** The options as the runs they are drawn in: one `<optgroup>` per run of a group. */
function runsOf(options: SelectOption[]): Array<{ group?: string; options: SelectOption[] }> {
  const runs: Array<{ group?: string; options: SelectOption[] }> = [];
  for (const option of options) {
    const last = runs[runs.length - 1];
    if (last && last.group !== undefined && last.group === option.group) {
      last.options.push(option);
    } else {
      runs.push({ group: option.group, options: [option] });
    }
  }
  return runs;
}

export function Select({
  label,
  hideLabel = false,
  inlineLabel = false,
  options,
  hint,
  error,
  width = "standard",
  id,
  className = "",
  ...rest
}: SelectProps) {
  const generated = useId();
  const fieldId = id ?? (label.toLowerCase().replace(/\s+/g, "-") || generated);
  const noteId = `${fieldId}-note`;
  const note = error ?? hint;
  const describedBy = [rest["aria-describedby"], note ? noteId : null].filter(Boolean).join(" ") || undefined;
  const drawn = (opt: SelectOption) => (
    <option key={opt.value} value={opt.value} disabled={opt.disabled}>
      {opt.label}
    </option>
  );
  return (
    <div className={`cp-select${inlineLabel ? " cp-select--inline" : ""} ${FIELD_WIDTH_CLASS[width]} ${className}`.trim()}>
      {!inlineLabel && (
        <label className={hideLabel ? "cp-select__label cp-visually-hidden" : "cp-select__label"} htmlFor={fieldId}>
          {label}
        </label>
      )}
      <span className="cp-select__field">
        {inlineLabel && (
          <label className="cp-select__inline-label" htmlFor={fieldId}>
            {label}
          </label>
        )}
        <select
          id={fieldId}
          className={`cp-select__control${error ? " cp-select__control--error" : ""}`}
          {...rest}
          aria-describedby={describedBy}
          aria-invalid={error ? true : rest["aria-invalid"]}
        >
          {runsOf(options).map((run, index) =>
            run.group === undefined ? (
              run.options.map(drawn)
            ) : (
              <optgroup key={`${run.group}-${index}`} label={run.group}>
                {run.options.map(drawn)}
              </optgroup>
            ),
          )}
        </select>
        <span className="cp-select__chevron" aria-hidden="true">
          <PixelIcon name="chevron-down" size="sm" />
        </span>
      </span>
      {note && (
        <span id={noteId} className={error ? "cp-field__error" : "cp-field__hint"}>
          {note}
        </span>
      )}
    </div>
  );
}
