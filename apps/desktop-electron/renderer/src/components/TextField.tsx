import { useId, useRef, type InputHTMLAttributes } from "react";
import { PixelIcon } from "./PixelIcon";
import { SuggestInput, type Suggestion } from "./SuggestInput";
import "./TextField.css";

/**
 * How wide a field is drawn (area 87): `short` for a number, a year or a code (120 times the
 * scale); `standard` (the default) for a name or a value, at most 320 times the scale; `full` for
 * the one field that should fill its container (a path, a note). A field never stretches to the
 * width of a wide window by accident.
 */
export type FieldWidth = "short" | "standard" | "full";

export const FIELD_WIDTH_CLASS: Record<FieldWidth, string> = {
  short: "cp-field--short",
  standard: "cp-field--standard",
  full: "cp-field--full",
};

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Drawn above the field (area 77): the field's name, never beside it. */
  label: string;
  /** Muted words below the field. Hidden while there is an error. */
  hint?: string;
  /** What is wrong with the value, in red under the field; the field gets a red border and `aria-invalid`. */
  error?: string;
  /** See FieldWidth; the default is `standard`. */
  width?: FieldWidth;
  /** Typed-value suggestions, in an in-app list (never a native `<datalist>`); empty until known. With `onPick`. */
  suggestions?: readonly Suggestion[];
  onPick?: (value: string) => void;
}

/**
 * The one text field: the label above, the box, then the hint below and, in its place, the error
 * under the box with a red border (area 77). Pair it with Textarea (many lines) and Select.
 */
export function TextField({
  label,
  hint,
  error,
  width = "standard",
  id,
  className = "",
  suggestions,
  onPick,
  ...rest
}: TextFieldProps) {
  const generated = useId();
  const fieldId = id ?? (label.toLowerCase().replace(/\s+/g, "-") || generated);
  const noteId = `${fieldId}-note`;
  const note = error ?? hint;
  const inputClass = `cp-field__input ${error ? "cp-field__input--error" : ""}`.trim();
  const describedBy = [rest["aria-describedby"], note ? noteId : null].filter(Boolean).join(" ") || undefined;
  const invalid = error ? true : rest["aria-invalid"];
  const root = `cp-field ${FIELD_WIDTH_CLASS[width]} ${className}`.trim();
  const input = useRef<HTMLInputElement>(null);
  const isNumber = rest.type === "number" && !onPick;
  /** Steps the number the way the browser's own spin button did, then tells React it changed. */
  const step = (direction: "up" | "down") => {
    const node = input.current;
    if (!node || node.disabled || node.readOnly) return;
    try {
      if (direction === "up") node.stepUp();
      else node.stepDown();
    } catch {
      return; // a step that would pass min or max throws in some engines; stay where it is
    }
    node.dispatchEvent(new Event("input", { bubbles: true }));
  };
  // One tree whatever the suggestions are: a field that swapped trees as its list
  // loaded would remount, and lose focus mid-word. The note is a sibling of the label, not inside
  // it, so it never joins the field's name.
  return (
    <div className={root}>
      <label className="cp-field__label" htmlFor={fieldId}>
        {label}
      </label>
      {onPick ? (
        <SuggestInput
          id={fieldId}
          className={inputClass}
          suggestions={suggestions ?? []}
          onPick={onPick}
          {...rest}
          aria-describedby={describedBy}
          aria-invalid={invalid}
        />
      ) : (
        <>
          {isNumber ? (
            <span className="cp-field__number">
              <input ref={input} id={fieldId} className={inputClass} {...rest} aria-describedby={describedBy} aria-invalid={invalid} />
              <span className="cp-field__steps">
                <button
                  type="button"
                  className="cp-field__step"
                  tabIndex={-1}
                  aria-label={`Increase ${label}`}
                  disabled={rest.disabled || rest.readOnly}
                  onClick={() => step("up")}
                >
                  <PixelIcon name="arrow-up" size="sm" />
                </button>
                <button
                  type="button"
                  className="cp-field__step"
                  tabIndex={-1}
                  aria-label={`Decrease ${label}`}
                  disabled={rest.disabled || rest.readOnly}
                  onClick={() => step("down")}
                >
                  <PixelIcon name="arrow-down" size="sm" />
                </button>
              </span>
            </span>
          ) : (
            <input id={fieldId} className={inputClass} {...rest} aria-describedby={describedBy} aria-invalid={invalid} />
          )}
        </>
      )}
      {note && (
        <span id={noteId} className={error ? "cp-field__error" : "cp-field__hint"}>
          {note}
        </span>
      )}
    </div>
  );
}
