import { useId, type TextareaHTMLAttributes } from "react";
import { FIELD_WIDTH_CLASS, type FieldWidth } from "./TextField";
import "./TextField.css";
import "./Textarea.css";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Drawn above the box, like TextField's. */
  label: string;
  /** Muted words below the box. Hidden while there is an error. */
  hint?: string;
  /** What is wrong, in red under the box; the box gets a red border and `aria-invalid`. */
  error?: string;
  /** Default `full` (a note wants room); `standard` and `short` as for TextField. */
  width?: FieldWidth;
  /** The label stays the accessible name but is not drawn (a box that sits under its own heading). */
  hideLabel?: boolean;
}

/**
 * The one multi-line text box (area 78): the same box, border, hover, focus ring, label above and
 * hint or error below as TextField, a few lines tall, resizable up and down only. Use it for
 * every note, message or comment; never a bare `<textarea>` with its own look.
 */
export function Textarea({
  label,
  hint,
  error,
  width = "full",
  hideLabel = false,
  id,
  rows = 4,
  className = "",
  ...rest
}: TextareaProps) {
  const generated = useId();
  const fieldId = id ?? (label.toLowerCase().replace(/\s+/g, "-") || generated);
  const noteId = `${fieldId}-note`;
  const note = error ?? hint;
  const describedBy = [rest["aria-describedby"], note ? noteId : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className={`cp-field ${FIELD_WIDTH_CLASS[width]} ${className}`.trim()}>
      <label className={hideLabel ? "cp-field__label cp-visually-hidden" : "cp-field__label"} htmlFor={fieldId}>
        {label}
      </label>
      <textarea
        id={fieldId}
        rows={rows}
        className={`cp-field__input cp-textarea ${error ? "cp-field__input--error" : ""}`.trim()}
        {...rest}
        aria-describedby={describedBy}
        aria-invalid={error ? true : rest["aria-invalid"]}
      />
      {note && (
        <span id={noteId} className={error ? "cp-field__error" : "cp-field__hint"}>
          {note}
        </span>
      )}
    </div>
  );
}
