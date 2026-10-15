import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { HINT_HOVER_DELAY_MS } from "./Hint";

const GAP = 4;

/** The element a pointer is over when it is marked `data-cut-hint` and really is cut short with "…". */
function cutElement(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  const marked = target.closest<HTMLElement>("[data-cut-hint]");
  if (!marked) return null;
  return marked.scrollWidth > marked.clientWidth + 1 ? marked : null;
}

interface Shown {
  text: string;
  left: number;
  bottom?: number;
  top?: number;
}

/**
 * The app hint for a value that is cut short with "…" (area 13): resting the pointer on it shows
 * the whole value in the same themed tip every other hint uses. One host for the whole app,
 * mounted once in the shell and delegated from the document, so a table of thousands of cells
 * adds no per-cell work. Mark the element that carries the ellipsis with `data-cut-hint`; the tip
 * only appears when it really is cut, and shows its text.
 */
export function OverflowHintHost() {
  const [shown, setShown] = useState<Shown | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let over: HTMLElement | null = null;
    const hide = () => {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      over = null;
      setShown(null);
    };
    const onOver = (event: PointerEvent) => {
      const element = cutElement(event.target);
      if (element === over) return;
      hide();
      if (!element) return;
      over = element;
      timer = setTimeout(() => {
        timer = null;
        const box = element.getBoundingClientRect();
        const room = box.top - GAP > 40;
        setShown({
          text: element.textContent ?? "",
          left: Math.max(GAP, Math.min(box.left, window.innerWidth - 360)),
          ...(room ? { bottom: window.innerHeight - box.top + GAP } : { top: box.bottom + GAP }),
        });
      }, HINT_HOVER_DELAY_MS);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") hide();
    };
    document.addEventListener("pointerover", onOver);
    document.addEventListener("pointerdown", hide, true);
    document.addEventListener("scroll", hide, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerover", onOver);
      document.removeEventListener("pointerdown", hide, true);
      document.removeEventListener("scroll", hide, true);
      document.removeEventListener("keydown", onKey);
      if (timer !== null) clearTimeout(timer);
    };
  }, []);

  if (!shown) return null;
  return createPortal(
    <span role="tooltip" className="cp-hint__tip" style={{ left: shown.left, bottom: shown.bottom, top: shown.top }}>
      {shown.text}
    </span>,
    document.body,
  );
}
