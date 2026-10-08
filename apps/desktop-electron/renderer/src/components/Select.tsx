import type { SelectHTMLAttributes } from "react";
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
  options: SelectOption[];
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

export function Select({ label, options, id, className = "", ...rest }: SelectProps) {
  const fieldId = id ?? label.toLowerCase().replace(/\s+/g, "-");
  const drawn = (opt: SelectOption) => (
    <option key={opt.value} value={opt.value} disabled={opt.disabled}>
      {opt.label}
    </option>
  );
  return (
    <label className={`cp-select ${className}`.trim()} htmlFor={fieldId}>
      <span className="cp-select__label">{label}</span>
      <select id={fieldId} className="cp-select__control" {...rest}>
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
    </label>
  );
}
