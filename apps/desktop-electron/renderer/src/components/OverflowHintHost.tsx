import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { HINT_HOVER_DELAY_MS } from "./Hint";

const GAP = 4;

/**
 * What a pointer or focus is on that has a hint: an element marked `data-hint="words"` (always
 * shows its words), or one marked `data-cut-hint` that really is cut short with "…" (shows its
 * text). The nearest marked element wins, so a cut value inside a cell that has its own
 * `data-hint` shows its own text, not the cell's words; a mark that is not cut passes to the next
 * one out.
 */
export function hintTarget(target: EventTarget | null): { element: HTMLElement; text: string } | null {
  if (!(target instanceof Element)) return null;
  for (let node: Element | null = target; node; node = node.parentElement) {
    if (!(node instanceof HTMLElement)) continue;
    if (node.hasAttribute("data-cut-hint") && node.scrollWidth > node.clientWidth + 1) {
      return { element: node, text: node.textContent ?? "" };
    }
    const words = node.getAttribute("data-hint");
    if (words) return { element: node, text: words };
  }
  return null;
}

interface Shown {
  text: string;
  left: number;
  bottom?: number;
  top?: number;
  /** The control's box, kept so the tip can be flipped once its real size is known. */
  anchor: { top: number; bottom: number };
  /** Measured and placed once; never moved again for the same showing. */
  settled?: true;
}

/**
 * The app hint for a value that is cut short with "…" (area 13): resting the pointer on it shows
 * the whole value in the same themed tip every other hint uses. One host for the whole app,
 * mounted once in the shell and delegated from the document, so a table of thousands of cells
 * adds no per-cell work. Mark the element that carries the ellipsis with `data-cut-hint`; the tip
 * only appears when it really is cut, and shows its text.
 *
 * `data-hint="words"` is the same tip for a plain explanation (a key chip's name, a wheel segment's
 * count): use it instead of a native `title` wherever many small elements repeat (table rows, the
 * wheel), where a `<Hint>` wrapper per element would cost too much. The element keeps its own
 * accessible name (text or `aria-label`). Hover and keyboard focus both show the tip, and while it
 * shows the element carries the words as its `aria-description`, so a screen reader hears what a
 * pointer user reads.
 */
export function OverflowHintHost() {
  const [shown, setShown] = useState<Shown | null>(null);
  const tip = useRef<HTMLSpanElement | null>(null);

  // The tip's real width and height are only known once it is drawn: pull it in from the window's
  // right edge by that width, and flip it below the control when it does not fit above.
  useLayoutEffect(() => {
    if (!shown || shown.settled) return;
    const size = tip.current?.getBoundingClientRect();
    if (!size) return;
    const left = Math.max(GAP, Math.min(shown.left, window.innerWidth - size.width - GAP));
    const fitsAbove = shown.anchor.top - GAP - size.height >= GAP;
    setShown(
      fitsAbove
        ? { ...shown, left, settled: true }
        : { text: shown.text, left, top: shown.anchor.bottom + GAP, anchor: shown.anchor, settled: true },
    );
  }, [shown]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let over: HTMLElement | null = null;
    /** The element carrying the words as `aria-description`, and what it had before. */
    let described: { element: HTMLElement; before: string | null } | null = null;
    const undescribe = () => {
      if (!described) return;
      const { element, before } = described;
      if (before === null) element.removeAttribute("aria-description");
      else element.setAttribute("aria-description", before);
      described = null;
    };
    const hide = () => {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      over = null;
      undescribe();
      setShown(null);
    };
    const place = (element: HTMLElement, text: string) => {
      const box = element.getBoundingClientRect();
      // Placed above first with the left edge at the control; the layout effect below measures
      // the tip and clamps or flips it.
      undescribe();
      described = { element, before: element.getAttribute("aria-description") };
      element.setAttribute("aria-description", text);
      setShown({
        text,
        left: Math.max(GAP, box.left),
        bottom: Math.max(GAP, window.innerHeight - box.top + GAP),
        anchor: { top: box.top, bottom: box.bottom },
      });
    };
    const onOver = (event: PointerEvent) => {
      const found = hintTarget(event.target);
      const element = found?.element ?? null;
      if (element === over) return;
      hide();
      if (!found || !element) return;
      over = element;
      timer = setTimeout(() => {
        timer = null;
        place(element, found.text);
      }, HINT_HOVER_DELAY_MS);
    };
    // The keyboard gets the same tip, at once (there is no pointer to rest): focus moving by key
    // onto a marked element shows it, and leaving it hides it. A click's focus does not (the
    // pointer's own hide has just run).
    const onFocusIn = (event: FocusEvent) => {
      const found = hintTarget(event.target);
      if (!found) return;
      try {
        if (!found.element.matches(":focus-visible")) return;
      } catch {
        // No :focus-visible to ask: treat the focus as the keyboard's.
      }
      hide();
      over = found.element;
      place(found.element, found.text);
    };
    const onFocusOut = (event: FocusEvent) => {
      if (over && event.target instanceof Node && over.contains(event.target)) hide();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") hide();
    };
    document.addEventListener("pointerover", onOver);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    document.addEventListener("pointerdown", hide, true);
    document.addEventListener("scroll", hide, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerover", onOver);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      document.removeEventListener("pointerdown", hide, true);
      document.removeEventListener("scroll", hide, true);
      document.removeEventListener("keydown", onKey);
      if (timer !== null) clearTimeout(timer);
      undescribe();
    };
  }, []);

  if (!shown) return null;
  return createPortal(
    <span ref={tip} role="tooltip" className="cp-hint__tip" style={{ left: shown.left, bottom: shown.bottom, top: shown.top }}>
      {shown.text}
    </span>,
    document.body,
  );
}
