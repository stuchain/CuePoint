import { forwardRef, type InputHTMLAttributes } from "react";
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
  { thing, value, onValueChange, onClear, label, className = "", onKeyDown, ...rest },
  ref,
) {
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
        ref={ref}
        type="search"
        className="cp-search-field__input"
        aria-label={label ?? `Search ${thing}`}
        placeholder={searchPlaceholder(thing)}
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
