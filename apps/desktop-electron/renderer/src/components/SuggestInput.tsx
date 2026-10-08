import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type InputHTMLAttributes,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { matchSuggestions } from "./suggestMatch";
import "./SuggestInput.css";

/** The most options drawn; a longer list is narrowed by typing, not scrolled. */
const MAX_SHOWN = 50;

/** A key an input method is handling (composition, or the legacy 229): not ours to act on. */
function composing(event: ReactKeyboardEvent<HTMLInputElement>): boolean {
  return event.nativeEvent.isComposing || event.keyCode === 229;
}

/** The nearest ancestor that clips what overflows it vertically, if any. */
function clippingAncestor(node: HTMLElement): HTMLElement | null {
  for (let up = node.parentElement; up; up = up.parentElement) {
    const { overflowY } = getComputedStyle(up);
    if (overflowY !== "visible") return up;
  }
  return null;
}

export interface Suggestion {
  /** What choosing it puts in the field. */
  value: string;
  /** What to show, when that is not the value itself. */
  label?: string;
  /** A muted note after it, such as how many tracks have it. */
  detail?: string;
}

export interface SuggestInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "list" | "role"> {
  suggestions: readonly Suggestion[];
  /** A suggestion was chosen, by Enter or a click. The field's own text is the caller's. */
  onPick: (value: string) => void;
  /** Class for the box that holds the field and its list. */
  wrapperClassName?: string;
}

/**
 * A text field with an in-app suggestion list.
 *
 * The browser's own `<datalist>` popup is a native window; on macOS in Electron 34
 * it took the whole app down as a value was typed (organization e2e, SIGSEGV). This
 * is the combobox/listbox pattern GlobalSearch uses: the field is the combobox,
 * ↑/↓ move through the options, Enter chooses, Escape closes, a click chooses. The list
 * is positioned absolutely, so opening it moves nothing. Spell checking stays off:
 * a spell checker beside a suggestion list is what made the field unsafe on macOS.
 */
export function SuggestInput({
  suggestions,
  onPick,
  wrapperClassName = "",
  onChange,
  onKeyDown,
  onBlur,
  onCompositionEnd,
  value,
  ...rest
}: SuggestInputProps) {
  const listId = useId();
  const optionId = (index: number) => `${listId}-option-${index}`;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [above, setAbove] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const lastTyped = useRef(typeof value === "string" ? value : "");

  const typed = typeof value === "string" ? value : "";
  const matches = useMemo(() => matchSuggestions(suggestions, typed), [suggestions, typed]);
  const shown = useMemo(() => matches.slice(0, MAX_SHOWN), [matches]);
  const more = matches.length - shown.length;
  const showList = open && shown.length > 0;
  // Which options are on offer, by content: a caller that rebuilds an equal array
  // each render must not reset the option someone has moved to.
  const shownKey = shown.map((item) => item.value).join("\u0000");
  const current = active < shown.length ? active : -1;

  // The options changed under the active one: it no longer points at what was chosen.
  useEffect(() => {
    setActive(-1);
  }, [shownKey]);

  // The text was emptied by the caller (it took the name, say), not by typing: nothing
  // is being looked for, so the whole vocabulary must not open under the field.
  useEffect(() => {
    if (typed === "" && lastTyped.current !== "") setOpen(false);
    lastTyped.current = typed;
  }, [typed]);

  // Opening: under the field, unless a clipping parent (the panel scrolls) leaves no
  // room for it there and more above. Measured once, as it opens.
  useLayoutEffect(() => {
    if (!showList) {
      setAbove(false);
      return;
    }
    const root = rootRef.current;
    const list = listRef.current;
    if (!root || !list) return;
    const field = root.getBoundingClientRect();
    const clip = clippingAncestor(root)?.getBoundingClientRect();
    const floor = Math.min(clip?.bottom ?? Infinity, window.innerHeight);
    const ceiling = Math.max(clip?.top ?? -Infinity, 0);
    const below = floor - field.bottom;
    setAbove(list.getBoundingClientRect().height > below && field.top - ceiling > below);
  }, [showList]);

  useEffect(() => {
    if (!showList) return;
    document.getElementById(optionId(current))?.scrollIntoView?.({ block: "nearest" });
    // optionId is derived from listId
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, showList]);

  // A press outside closes it; listened to only while it is open.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [open]);

  const choose = (item: Suggestion) => {
    onPick(item.value);
    setOpen(false);
    setActive(-1);
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    // An input method owns these keys (its candidate list uses the arrows and Enter).
    if (composing(event)) {
      onKeyDown?.(event);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (shown.length === 0) {
        onKeyDown?.(event);
        return;
      }
      event.preventDefault();
      // With the list closed the arrow only brings it back; the next one moves.
      if (!showList) {
        setOpen(true);
        return;
      }
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((now) =>
        Math.min(shown.length - 1, Math.max(0, now < 0 && step < 0 ? 0 : now + step)),
      );
      return;
    }
    if (event.key === "Enter" && showList && current >= 0 && shown[current]) {
      event.preventDefault();
      choose(shown[current]!);
      return;
    }
    if (event.key === "Escape" && showList) {
      // Closes the list, not the dialog or panel around the field.
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      setActive(-1);
      return;
    }
    onKeyDown?.(event);
    // The caller took Enter (it used the text): the list has nothing left to offer.
    if (event.key === "Enter" && event.defaultPrevented) setOpen(false);
  };

  return (
    <div ref={rootRef} className={`cp-suggest ${wrapperClassName}`.trim()}>
      <input
        {...rest}
        value={value}
        spellCheck={false}
        autoComplete="off"
        role="combobox"
        aria-expanded={showList}
        aria-controls={showList ? listId : undefined}
        aria-activedescendant={showList && current >= 0 ? optionId(current) : undefined}
        aria-autocomplete="list"
        onChange={(event) => {
          lastTyped.current = event.target.value;
          // Text an input method is still composing is not a search yet.
          if (!(event.nativeEvent as InputEvent).isComposing) setOpen(true);
          setActive(-1);
          onChange?.(event);
        }}
        onCompositionEnd={(event) => {
          setOpen(true);
          onCompositionEnd?.(event);
        }}
        onKeyDown={handleKeyDown}
        onBlur={(event) => {
          // Focus left for something outside; a press on an option keeps it (below).
          const next = event.relatedTarget as Node | null;
          if (!next || !rootRef.current?.contains(next)) setOpen(false);
          onBlur?.(event);
        }}
      />
      {showList && (
        <ul
          ref={listRef}
          id={listId}
          className={`cp-suggest__list${above ? " cp-suggest__list--above" : ""}`}
          role="listbox"
          aria-label="Suggestions"
          // A press inside the list must not take focus from the field, or the list
          // would close under the click that was meant for an option.
          onMouseDown={(event) => event.preventDefault()}
        >
          {shown.map((item, index) => (
            <li
              key={item.value}
              id={optionId(index)}
              role="option"
              aria-selected={index === current}
              className={`cp-suggest__option${index === current ? " cp-suggest__option--active" : ""}`}
              onClick={() => choose(item)}
              onMouseMove={() => index !== current && setActive(index)}
            >
              <span className="cp-suggest__text">{item.label ?? item.value}</span>
              {item.detail && <span className="cp-suggest__detail">{item.detail}</span>}
            </li>
          ))}
          {more > 0 && (
            <li role="presentation" className="cp-suggest__more">
              Type to narrow {more.toLocaleString()} more
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
