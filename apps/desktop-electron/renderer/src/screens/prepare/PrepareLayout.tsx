/**
 * The Prepare page's two panes, side by side (PREP-10, DEC-112).
 *
 * The Set, wider, and the source panel (PREP-11) beside it, not below: two
 * tables stacked would halve a height Phase 8 already found too small at
 * `--scale: 2`. The divider between them is dragged or moved with the arrow
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

import {
  SOURCE_NUDGE,
  clampSourceWidth,
  loadSourceWidth,
  saveSourceWidth,
} from "./prepareLayoutState";

interface PrepareLayoutProps {
  set: ReactNode;
  /** PREP-11's source panel. Absent, the Set takes the width. */
  source?: ReactNode;
}

export function PrepareLayout({ set, source }: PrepareLayoutProps) {
  const [stored, setStored] = useState(loadSourceWidth);
  const box = useRef<HTMLDivElement>(null);
  // The two panes' width: the layout's own once it is measured, the window's
  // until then (and in a test's document, where nothing has a size).
  const [paneWidth, setPaneWidth] = useState(() => window.innerWidth);
  const [dragging, setDragging] = useState(false);
  const hasSource = Boolean(source);

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
  }, [hasSource]);

  useEffect(() => saveSourceWidth(stored), [stored]);

  const width = clampSourceWidth(stored, paneWidth);

  const startResize = useCallback(
    (startX: number) => {
      const startWidth = width;
      // The divider is the source panel's left edge: leftwards widens it.
      const onMove = (event: MouseEvent) => {
        setStored(clampSourceWidth(startWidth + (startX - event.clientX), paneWidth));
      };
      const onUp = () => {
        setDragging(false);
        document.body.classList.remove("prepare-resizing");
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      setDragging(true);
      document.body.classList.add("prepare-resizing");
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [paneWidth, width],
  );

  if (!source) {
    return <div className="prepare-layout prepare-layout--single">{set}</div>;
  }

  return (
    <div
      ref={box}
      className="prepare-layout"
      style={{ ["--prepare-source-width" as string]: `${width}px` }}
    >
      <div className="prepare-layout__set">{set}</div>
      <div
        className={`prepare-layout__divider${dragging ? " prepare-layout__divider--active" : ""}`}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize the source panel"
        aria-valuenow={width}
        tabIndex={0}
        onMouseDown={(event) => {
          event.preventDefault();
          startResize(event.clientX);
        }}
        onKeyDown={(event) => {
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
          event.preventDefault();
          const delta = event.key === "ArrowLeft" ? SOURCE_NUDGE : -SOURCE_NUDGE;
          setStored(clampSourceWidth(width + delta, paneWidth));
        }}
      />
      <div className="prepare-layout__source">{source}</div>
    </div>
  );
}
