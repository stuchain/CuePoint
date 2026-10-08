import type { InputHTMLAttributes } from "react";
import { SuggestInput, type Suggestion } from "./SuggestInput";
import "./TextField.css";

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
  /** Typed-value suggestions, in an in-app list (never a native `<datalist>`); empty until known. With `onPick`. */
  suggestions?: readonly Suggestion[];
  onPick?: (value: string) => void;
}

export function TextField({
  label,
  hint,
  error,
  id,
  className = "",
  suggestions,
  onPick,
  ...rest
}: TextFieldProps) {
  const fieldId = id ?? label.toLowerCase().replace(/\s+/g, "-");
  const inputClass = `cp-field__input ${error ? "cp-field__input--error" : ""}`;
  // One tree whatever the suggestions are: a field that swapped trees as its list
  // loaded would remount, and lose focus mid-word.
  if (onPick) {
    // The list is a sibling of the label, not inside it, so it never joins the field's name.
    return (
      <div className={`cp-field ${className}`.trim()}>
        <label className="cp-field__label" htmlFor={fieldId}>
          {label}
        </label>
        <SuggestInput
          id={fieldId}
          className={inputClass}
          suggestions={suggestions ?? []}
          onPick={onPick}
          {...rest}
        />
        {hint && !error && <span className="cp-field__hint">{hint}</span>}
        {error && <span className="cp-field__error">{error}</span>}
      </div>
    );
  }
  return (
    <label className={`cp-field ${className}`.trim()} htmlFor={fieldId}>
      <span className="cp-field__label">{label}</span>
      <input id={fieldId} className={inputClass} {...rest} />
      {hint && !error && <span className="cp-field__hint">{hint}</span>}
      {error && <span className="cp-field__error">{error}</span>}
    </label>
  );
}
