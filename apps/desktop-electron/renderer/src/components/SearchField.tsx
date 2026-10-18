import { forwardRef, useImperativeHandle, useRef, type InputHTMLAttributes } from "react";
import { useFitPlaceholder } from "./fitPlaceholder";
import { PixelIcon } from "./PixelIcon";
import "./SearchField.css";

interface SearchFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange" | "placeholder"> {
  /** What is searched, as a plain noun phrase ("tracks", "Collections"). The placeholder reads "Search <thing>…". */
  thing: string;
  value: string;
  /** Called with the new text; the clear × calls it with "". */
  onValueChange: (value: string) => void;
  /** Called after the × cleared the field (to give focus back, or run the empty search). */
  onClear?: () => void;
  /** Overrides the accessible name; it is "Search <thing>" otherwise. */
  label?: string;
  /** Overrides the placeholder; it is "Search <thing>…" otherwise. The accessible name does not change. */
  placeholder?: string;
  /**
   * Shortens the placeholder to "Search…" when the box is too narrow for the full hint, so it is
   * never cut mid-word (the hint is `placeholder` or "Search <thing>…").
   */
  fitPlaceholder?: boolean;
}

/** The placeholder of every search field: "Search <thing>…". */
export function searchPlaceholder(thing: string): string {
  return `Search ${thing}…`;
}

/**
 * The one search field: a search icon at the left, the placeholder "Search <thing>…", and a
 * clear × at the right while there is text (the browser's own clear is hidden, so every field
 * clears the same way). Escape inside the field also clears it.
 */
export const SearchField = forwardRef<HTMLInputElement, SearchFieldProps>(function SearchField(
  { thing, value, onValueChange, onClear, label, placeholder, fitPlaceholder = false, className = "", onKeyDown, ...rest },
  ref,
) {
  const input = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => input.current as HTMLInputElement);
  const hint = placeholder ?? searchPlaceholder(thing);
  useFitPlaceholder(input, hint, fitPlaceholder);
  const clear = () => {
    onValueChange("");
    onClear?.();
  };
  return (
    <div className={`cp-search-field ${className}`.trim()}>
      <span className="cp-search-field__icon" aria-hidden>
        <PixelIcon name="search" size="sm" />
      </span>
      <input
        ref={input}
        type="search"
        className="cp-search-field__input"
        aria-label={label ?? `Search ${thing}`}
        placeholder={hint}
        value={value}
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => onValueChange(event.target.value)}
        onKeyDown={(event) => {
          onKeyDown?.(event);
          if (event.defaultPrevented) return;
          if (event.key === "Escape" && value !== "") {
            event.preventDefault();
            event.stopPropagation();
            clear();
          }
        }}
        {...rest}
      />
      {value !== "" && (
        <button type="button" className="cp-search-field__clear" aria-label="Clear search" onClick={clear}>
          <PixelIcon name="close" size="sm" />
        </button>
      )}
    </div>
  );
});
