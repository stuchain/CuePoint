import {
  cloneElement,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FocusEvent,
  type ReactElement,
} from "react";
import "./Hint.css";

interface HintProps {
  /** The reason. Nothing is added when it is empty. */
  text: string | undefined;
  /** The one control it belongs to. */
  children: ReactElement<Record<string, unknown>>;
}

/**
 * Keyboard focus only: a mouse click also focuses a button, and the `title`
 * already covers the pointer. Where `:focus-visible` is unsupported (some
 * test DOMs throw on it) the tooltip is shown rather than lost.
 */
function focusIsVisible(target: EventTarget & Element): boolean {
  try {
    return target.matches(":focus-visible");
  } catch {
    return true;
  }
}

/**
 * A control's reason, on hover and on keyboard focus (PAGES-03).
 *
 * A reason kept in a `title` is hover-only: a keyboard user never sees it. This
 * keeps the `title` for the pointer and shows the same words in a tooltip while
 * the control has focus, tied to it with `aria-describedby`. The control must be
 * focusable (a button, or something given `tabIndex={0}`).
 *
 * The tooltip is positioned in the viewport, not inside the wrapper: the status
 * strip it was first made for clips anything that overflows it.
 */
export function Hint({ text, children }: HintProps) {
  const id = useId();
  const wrapper = useRef<HTMLSpanElement | null>(null);
  const [place, setPlace] = useState<{ left: number; bottom: number } | null>(null);

  const hide = useCallback(() => setPlace(null), []);

  const show = () => {
    const box = wrapper.current?.getBoundingClientRect();
    if (!box) return;
    setPlace({
      left: Math.max(4, box.left),
      bottom: Math.max(4, window.innerHeight - box.top + 4),
    });
  };

  // Escape dismisses it without moving focus, as a native tooltip would.
  useEffect(() => {
    if (!place) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") hide();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [place, hide]);

  if (!text) return children;

  const own = children.props;
  const describedBy = [own["aria-describedby"], place ? id : null].filter(Boolean).join(" ");

  return (
    <span className="cp-hint" ref={wrapper}>
      {cloneElement(children, {
        title: text,
        ...(describedBy ? { "aria-describedby": describedBy } : {}),
        onFocus: (event: FocusEvent) => {
          (own.onFocus as ((e: FocusEvent) => void) | undefined)?.(event);
          if (focusIsVisible(event.currentTarget)) show();
        },
        onBlur: (event: FocusEvent) => {
          (own.onBlur as ((e: FocusEvent) => void) | undefined)?.(event);
          hide();
        },
      })}
      {place && (
        <span id={id} role="tooltip" className="cp-hint__tip" style={place}>
          {text}
        </span>
      )}
    </span>
  );
}
