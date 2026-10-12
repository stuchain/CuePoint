import {
  cloneElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
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
  /** Render the wrapper `display: inline`, for a control inside a text line. */
  inline?: boolean;
}

/** How long the pointer rests on a control before the tip shows. */
export const HINT_HOVER_DELAY_MS = 400;

/** Keep the tip this far from the control and from the viewport edge. */
const GAP = 4;

interface Place {
  left: number;
  /** Above the control: distance from the viewport bottom. */
  bottom?: number;
  /** Flipped below the control: distance from the viewport top. */
  top?: number;
  /** Measured and placed once; never moved again for the same showing. */
  settled?: true;
}

/**
 * Keyboard focus only: a mouse click also focuses a button, and hover has its
 * own path (below). Where `:focus-visible` is unsupported (some
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
 * The reason is kept as the control's `title` at rest. The same words show in a
 * themed tooltip after the pointer has rested 400 ms, or while the control has
 * keyboard focus, tied to it with `aria-describedby`. While the pointer is over
 * the wrapper the `title` is left off, so the browser's own tip never doubles
 * the themed one. Hover is read on the wrapper, not the control: a disabled
 * button swallows pointer events. The tip hides on leave, press, scroll, Escape
 * and blur, and flips below the control when there is no room above it.
 * The control must be focusable (a button, or something given `tabIndex={0}`).
 *
 * The tooltip is positioned in the viewport, not inside the wrapper: the status
 * strip it was first made for clips anything that overflows it.
 */
export function Hint({ text, children, inline = false }: HintProps) {
  const id = useId();
  const wrapper = useRef<HTMLSpanElement | null>(null);
  const tip = useRef<HTMLSpanElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [place, setPlace] = useState<Place | null>(null);
  const [hovered, setHovered] = useState(false);
  // What put the tip up, so a pointer leaving does not take down a tip that
  // keyboard focus is still holding.
  const reason = useRef<"hover" | "focus" | null>(null);

  const cancelTimer = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const hide = useCallback(() => {
    cancelTimer();
    reason.current = null;
    setPlace(null);
  }, [cancelTimer]);

  useEffect(() => cancelTimer, [cancelTimer]);

  // With no reason there is nothing to show: drop any hover or tip left over,
  // so neither comes back by itself, and the title is not held off, when a
  // reason returns.
  const hasText = Boolean(text);
  useEffect(() => {
    if (hasText) return;
    setHovered(false);
    hide();
  }, [hasText, hide]);

  const show = useCallback((why: "hover" | "focus") => {
    if (reason.current === null) reason.current = why;
    const box = wrapper.current?.getBoundingClientRect();
    if (!box) return;
    setPlace({
      left: Math.max(GAP, box.left),
      bottom: Math.max(GAP, window.innerHeight - box.top + GAP),
    });
  }, []);

  // Once the tip is drawn it can be measured: flip it below when it would
  // leave the top of the viewport, and pull it in from the right edge. Once
  // only: moving a tip can change its size, and re-measuring after every move
  // never settled near the right edge (SHELL-10's Tab walk hit React's update
  // limit), so the second render keeps whatever the first measure decided.
  useLayoutEffect(() => {
    if (!place || place.settled) return;
    const box = wrapper.current?.getBoundingClientRect();
    const size = tip.current?.getBoundingClientRect();
    if (!box || !size) return;
    const left = Math.max(GAP, Math.min(place.left, window.innerWidth - size.width - GAP));
    if (box.top - GAP - size.height < GAP) {
      setPlace({ left, top: box.bottom + GAP, settled: true });
    } else {
      setPlace({ ...place, left, settled: true });
    }
  }, [place]);

  // Escape dismisses it without moving focus, as a native tooltip would; a
  // press or a scroll moves the control out from under the tip.
  useEffect(() => {
    if (!place && !hovered) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") hide();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", hide, true);
    window.addEventListener("scroll", hide, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", hide, true);
      window.removeEventListener("scroll", hide, true);
    };
  }, [place, hovered, hide]);

  if (!text) return children;

  const own = children.props;
  const describedBy = [own["aria-describedby"], place ? id : null].filter(Boolean).join(" ");

  const onPointerEnter = () => {
    setHovered(true);
    cancelTimer();
    timer.current = setTimeout(() => {
      timer.current = null;
      show("hover");
    }, HINT_HOVER_DELAY_MS);
  };
  const onPointerLeave = () => {
    setHovered(false);
    if (reason.current === "focus") cancelTimer();
    else hide();
  };

  return (
    <span
      className={`cp-hint${inline ? " cp-hint--inline" : ""}`}
      ref={wrapper}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    >
      {cloneElement(children, {
        // Left off while the pointer is inside (the themed tip speaks).
        title: hovered ? undefined : text,
        ...(describedBy ? { "aria-describedby": describedBy } : {}),
        onFocus: (event: FocusEvent) => {
          (own.onFocus as ((e: FocusEvent) => void) | undefined)?.(event);
          if (focusIsVisible(event.currentTarget)) show("focus");
        },
        onBlur: (event: FocusEvent) => {
          (own.onBlur as ((e: FocusEvent) => void) | undefined)?.(event);
          hide();
        },
      })}
      {place && (
        <span
          id={id}
          role="tooltip"
          className="cp-hint__tip"
          style={{ left: place.left, bottom: place.bottom, top: place.top }}
          ref={tip}
        >
          {text}
        </span>
      )}
    </span>
  );
}
