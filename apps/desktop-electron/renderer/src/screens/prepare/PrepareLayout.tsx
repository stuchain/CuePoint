/**
 * The Prepare page's two panes, side by side (PREP-10, DEC-112).
 *
 * The Set, wider, and the source panel (PREP-11) beside it, not below: two
 * tables stacked would halve a height Phase 8 already found too small at
 * `--scale: 2`, then the default. The divider between them is dragged or moved with the arrow
 * keys, and its width is remembered as the Inspector's is (DEC-018): stored
 * as chosen, clamped when read, so a width chosen on a wide monitor returns
 * when there is room for it again. It is clamped against the layout's own
 * width, not the window's (PREP-11): with the sidebar and the Inspector open
 * the two panes share far less than the window, and the Set stays the wider.
 *
 * Without a source panel the Set takes the whole width and there is no
 * divider: a handle that moves nothing would be a control that lies.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { Button } from "../../components/Button";
import { useScaleFactor } from "../../tokens/ScaleContext";
import {
  SOURCE_DEFAULT_WIDTH,
  SOURCE_NUDGE,
  clampSourceWidth,
  loadSourceWidth,
  saveSourceWidth,
  sourceWidthBounds,
} from "./prepareLayoutState";

/**
 * B14: under this window width the source panel folds away by itself, so the Set keeps its columns
 * (at 1024 x 700 it showed only Title). A narrow button at the right edge opens it again.
 */
export const SOURCE_FOLD_BELOW = 1100;

/** The window's width as the page draws it; a document with no layout (a test) is never narrow. */
function isNarrowWindow(): boolean {
  const width = document.documentElement.clientWidth;
  return width > 0 && width < SOURCE_FOLD_BELOW;
}

interface PrepareLayoutProps {
  set: ReactNode;
  /** PREP-11's source panel. Absent, the Set takes the width. */
  source?: ReactNode;
  /**
   * Track details are open (C226): the source panel stays mounted, so what was picked in it
   * survives, but is out of sight, with no divider. One right-hand panel shows at a time.
   */
  sourceHidden?: boolean;
}

export function PrepareLayout({ set, source, sourceHidden = false }: PrepareLayoutProps) {
  const scale = useScaleFactor();
  // Held in 1x units; drawn as 1x width * scale (C209).
  const [stored, setStoredState] = useState(() => loadSourceWidth(scale));
  // A drag is held and saved on release; a key press saves at once.
  const latest = useRef(stored);
  const setStored = useCallback(
    (pixels: number, save: boolean = true) => {
      const next = pixels / scale;
      latest.current = next;
      setStoredState(next);
      if (save) saveSourceWidth(next);
    },
    [scale],
  );
  const box = useRef<HTMLDivElement>(null);
  // The two panes' width: the layout's own once it is measured, the window's
  // until then (and in a test's document, where nothing has a size).
  const [paneWidth, setPaneWidth] = useState(() => window.innerWidth);
  const [dragging, setDragging] = useState(false);
  const hasSource = Boolean(source);
  const [narrow, setNarrow] = useState(isNarrowWindow);
  // Opened by hand on a narrow window; a window widened past the line shows it anyway.
  const [unfolded, setUnfolded] = useState(false);
  useEffect(() => {
    const check = () => setNarrow(isNarrowWindow());
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  const folded = narrow && !unfolded;

  useEffect(() => {
    const measure = () => {
      const measured = box.current?.clientWidth ?? 0;
      setPaneWidth(measured > 0 ? measured : window.innerWidth);
    };
    measure();
    window.addEventListener("resize", measure);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    if (observer && box.current) observer.observe(box.current);
    return () => {
      window.removeEventListener("resize", measure);
      observer?.disconnect();
    };
  }, [hasSource, sourceHidden, folded]);

  const width = clampSourceWidth(stored * scale, paneWidth, scale);
  // The divider says the range it moves in, from the same clamp (M359).
  const bounds = sourceWidthBounds(paneWidth, scale);

  const startResize = useCallback(
    (startX: number) => {
      const startWidth = width;
      // The divider is the source panel's left edge: leftwards widens it.
      const onMove = (event: MouseEvent) => {
        setStored(clampSourceWidth(startWidth + (startX - event.clientX), paneWidth, scale), false);
      };
      const onUp = () => {
        setDragging(false);
        document.body.classList.remove("prepare-resizing");
        saveSourceWidth(latest.current);
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      setDragging(true);
      document.body.classList.add("prepare-resizing");
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [paneWidth, scale, setStored, width],
  );

  if (!source) {
    return (
      <div className="prepare-layout prepare-layout--single" data-pane="set">
        {set}
      </div>
    );
  }
  // Folded (B14): the Set, then one narrow column holding the button that opens the panel.
  const fold = narrow && !sourceHidden;
  const foldButton = fold ? (
    <div className="prepare-layout__fold">
      <Button
        variant="secondary"
        iconOnly
        icon={folded ? "chevron-left" : "chevron-right"}
        aria-label={folded ? "Show suggestions" : "Fold suggestions"}
        aria-expanded={!folded}
        onClick={() => setUnfolded(folded)}
      />
    </div>
  ) : null;
  return (
    <div
      ref={box}
      className={`prepare-layout${sourceHidden ? " prepare-layout--single" : ""}${fold ? " prepare-layout--fold" : ""}${folded && !sourceHidden ? " prepare-layout--folded" : ""}`}
      style={{ ["--prepare-source-width" as string]: `${width}px` }}
    >
      <div className="prepare-layout__set" data-pane="set">
        {set}
      </div>
      {foldButton}
      {/* The same three slots whether the source shows or not, so hiding it keeps its state. */}
      {sourceHidden || fold ? null : (
      <div
        className={`prepare-layout__divider${dragging ? " prepare-layout__divider--active" : ""}`}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize the source panel"
        aria-valuenow={width}
        aria-valuemin={bounds.min}
        aria-valuemax={bounds.max}
        tabIndex={0}
        onMouseDown={(event) => {
          event.preventDefault();
          startResize(event.clientX);
        }}
        onKeyDown={(event) => {
          // Enter puts the width back, as it does on Track details and the queue (M359).
          if (event.key === "Enter") {
            event.preventDefault();
            setStored(clampSourceWidth(SOURCE_DEFAULT_WIDTH * scale, paneWidth, scale));
            return;
          }
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
          event.preventDefault();
          const delta = (event.key === "ArrowLeft" ? SOURCE_NUDGE : -SOURCE_NUDGE) * scale;
          setStored(clampSourceWidth(width + delta, paneWidth, scale));
        }}
      />
      )}
      <div className="prepare-layout__source" hidden={sourceHidden || folded}>
        {source}
      </div>
    </div>
  );
}
