/**
 * The Set's tempo and key, drawn as two lanes above its table (PREP-11, DEC-111).
 *
 * `prepareLanes.ts` lays the lanes out in whole pixels from the engine's own
 * shape; this draws them as rectangles in an inline SVG, as `PixelIcon` draws,
 * with `crispEdges` so a pixel stays a pixel at every scale. Colours are
 * `currentColor` and theme tokens, so all five themes read them.
 *
 * Clicking a column selects its entry, which moves the insertion point there.
 * Each column's title says what it draws. The table beside it says the same
 * in words, so the lanes are a picture of the running order, never the only
 * place a fact is.
 */
import { useEffect, useMemo, useRef, useState } from "react";

import type { SetChapterPlan, SetShape } from "../../api/cuepointBridge.types";
import { useScale } from "../../tokens/ScaleContext";
import { chapterName } from "./prepareRows";
import { laneLayout, linkWords, rangeText, type KeyLinkStyle } from "./prepareLanes";

export interface SetLanesProps {
  shape: SetShape;
  /** Each entry's title, for its column's label. */
  titles: ReadonlyMap<number, string>;
  chapters: readonly SetChapterPlan[];
  selectedEntryId: number | null;
  onSelect: (entryId: number) => void;
}

/** The gutter's width before scale: room for "146.5" in the smallest font. */
const GUTTER = 40;

const LINK_CLASS: Record<KeyLinkStyle, string> = {
  same: "prepare-lanes__link",
  adjacent: "prepare-lanes__link",
  relative: "prepare-lanes__link prepare-lanes__link--relative",
  clash: "prepare-lanes__link prepare-lanes__link--clash",
};

export function SetLanes({ shape, titles, chapters, selectedEntryId, onSelect }: SetLanesProps) {
  const { scale } = useScale();
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const measure = () => setWidth(element.clientWidth);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const layout = useMemo(
    () => laneLayout(shape, titles, Math.max(0, width), scale),
    [scale, shape, titles, width],
  );
  const names = useMemo(() => new Map(chapters.map((c) => [c.id, chapterName(c)])), [chapters]);

  if (shape.entries.length === 0) return null;

  return (
    <div className="prepare-lanes" role="group" aria-label="Tempo and key lanes">
      <div className="prepare-lanes__gutter" aria-hidden="true" style={{ width: `calc(${GUTTER}px * var(--scale))` }}>
        <span className="prepare-lanes__name" style={{ height: layout.tempoHeight }}>
          BPM
          <span className="prepare-lanes__range">{rangeText(layout.tempo.range)}</span>
        </span>
        <span className="prepare-lanes__name" style={{ height: layout.keyHeight, marginTop: layout.keyTop - layout.tempoHeight }}>
          Key
          <span className="prepare-lanes__range">1A–12B</span>
        </span>
      </div>
      <div className="prepare-lanes__plot" ref={box}>
        <svg
          className="prepare-lanes__svg"
          width={layout.width}
          height={layout.height}
          viewBox={`0 0 ${Math.max(1, layout.width)} ${layout.height}`}
          shapeRendering="crispEdges"
          focusable="false"
        >
          {layout.columns.map((column) =>
            column.entryId === selectedEntryId ? (
              <rect
                key={`selected-${column.entryId}`}
                className="prepare-lanes__selected"
                x={column.x}
                y={0}
                width={column.width}
                height={layout.height}
              />
            ) : null,
          )}
          <rect className="prepare-lanes__floor" x={0} y={layout.keyTop - 1} width={layout.width} height={1} />
          {layout.boundaries.map((boundary) => (
            <rect
              key={`chapter-${boundary.chapterId}-${boundary.x}`}
              className="prepare-lanes__boundary"
              x={boundary.x}
              y={boundary.y}
              width={boundary.width}
              height={boundary.height}
              data-chapter={boundary.chapterId}
            >
              <title>{`${names.get(boundary.chapterId) ?? "A chapter"} starts`}</title>
            </rect>
          ))}
          <g className="prepare-lanes__tempo" data-lane="tempo">
            {layout.tempo.steps.map((rect, at) => (
              <rect key={`step-${at}`} x={rect.x} y={rect.y} width={rect.width} height={rect.height} />
            ))}
            {layout.tempo.marks.map((rect, at) => (
              <rect key={`bpm-${at}`} x={rect.x} y={rect.y} width={rect.width} height={rect.height} />
            ))}
          </g>
          <g className="prepare-lanes__key" data-lane="key">
            {layout.key.links.map((link) => (
              <g key={`link-${link.toEntryId}`} className={LINK_CLASS[link.style]} data-relation={link.style}>
                <title>{linkWords(link.style)}</title>
                {link.rects.map((rect, at) => (
                  <rect key={at} x={rect.x} y={rect.y} width={rect.width} height={rect.height} />
                ))}
              </g>
            ))}
            {layout.key.marks.map((mark) => (
              <rect
                key={`key-${mark.entryId}`}
                x={mark.x}
                y={mark.y}
                width={mark.width}
                height={mark.height}
                data-code={mark.code}
              />
            ))}
          </g>
          {layout.columns.map((column) => (
            <rect
              key={`hit-${column.entryId}`}
              className="prepare-lanes__hit"
              x={column.x}
              y={0}
              width={column.width}
              height={layout.height}
              data-entry={column.entryId}
              onClick={() => onSelect(column.entryId)}
            >
              <title>{column.label}</title>
            </rect>
          ))}
        </svg>
      </div>
    </div>
  );
}
