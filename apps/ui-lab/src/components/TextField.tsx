import type { InputHTMLAttributes } from "react";
import "./TextField.css";

export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
}

export function TextField({ label, hint, error, id, className = "", ...rest }: TextFieldProps) {
  const fieldId = id ?? label.toLowerCase().replace(/\s+/g, "-");
  return (
    <label className={`cp-field ${className}`.trim()} htmlFor={fieldId}>
      <span className="cp-field__label">{label}</span>
      <input id={fieldId} className={`cp-field__input ${error ? "cp-field__input--error" : ""}`} {...rest} />
      {hint && !error && <span className="cp-field__hint">{hint}</span>}
      {error && <span className="cp-field__error">{error}</span>}
    </label>
  );
}
