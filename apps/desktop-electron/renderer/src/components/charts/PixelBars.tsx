/**
 * A bar chart in the pixel style (STATS-06): whole-pixel `<rect>`s in an inline SVG, laid out by
 * `pixelBarsGeometry.ts`, as `screens/prepare/SetLanes.tsx` draws the Set's lanes. No chart library.
 *
 * Colours are theme tokens (`PixelBars.css`), so every theme and custom theme colors it. The counts
 * are written on the chart. A bar the caller can open is a real button: one tab stop for the chart,
 * the arrow keys moving between its bars, Enter, Space or a click calling `onSelect`. A bar that
 * opens nothing (no `onSelect`, or `isSelectable` says no, or no tracks) is drawn and is neither a
 * button nor a click target. A visually hidden table says the same in words, so the picture is
 * never the only place a fact is. An ordered run longer than the container scrolls sideways inside
 * the chart's own box.
 *
 * Motion is in `PixelBars.css`, behind the existing `entrance` and `state` switches. `state` is
 * marked here, per bar, the way the Keys counts are (`useCountChanges`).
 */
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";

import { useScaleFactor } from "../../tokens/ScaleContext";
import { changedMark, useCountChanges } from "../wheel/useCountChanges";
import { barsLayout, type BarsOrientation, type PixelBucket } from "./pixelBarsGeometry";
import "./PixelBars.css";

export interface PixelBarsProps<T extends PixelBucket = PixelBucket> {
  /** What the chart shows; also the name of its group and of its text table. */
  title: string;
  /** Labels must be unique within a chart: the focus and the change marks are keyed by label. */
  buckets: readonly T[];
  /** Horizontal bars for named buckets (genre, rating); vertical for ordered ones (tempo, year). */
  orientation: BarsOrientation;
  /** A bar's accessible name, e.g. "124 BPM, 312 tracks". */
  barName: (bucket: T) => string;
  /** Opens a bar's tracks. Without it no bar is clickable (loudness). */
  onSelect?: (bucket: T) => void;
  /** Narrows `onSelect` to some bars. Default: every bar with tracks. */
  isSelectable?: (bucket: T) => boolean;
  /** Vertical charts only: the height before scale. */
  height?: number;
  /** The text table's headings. */
  bucketLabel?: string;
  countLabel?: string;
  className?: string;
}

const DEFAULT_HEIGHT = 120;
const NEXT_KEYS = new Set(["ArrowRight", "ArrowDown"]);
const PREVIOUS_KEYS = new Set(["ArrowLeft", "ArrowUp"]);

export function PixelBars<T extends PixelBucket = PixelBucket>({
  title,
  buckets,
  orientation,
  barName,
  onSelect,
  isSelectable,
  height = DEFAULT_HEIGHT,
  bucketLabel = "Bucket",
  countLabel = "Tracks",
  className = "",
}: PixelBarsProps<T>) {
  const scale = useScaleFactor();
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
    () => barsLayout({ buckets, orientation, width: Math.max(0, width), height: Math.round(height * scale), scale }),
    [buckets, height, orientation, scale, width],
  );

  const counts = useMemo(() => new Map(buckets.map((b) => [b.label, b.count])), [buckets]);
  const marks = useCountChanges(counts);

  // The bars that are buttons, by index; the arrows move through them.
  const openable = useMemo(
    () => buckets.map((b, at) => (onSelect && b.count > 0 && (isSelectable?.(b) ?? true) ? at : -1)).filter((at) => at >= 0),
    [buckets, isSelectable, onSelect],
  );
  // The bar that holds the tab stop, by label, so new data cannot move it to another bucket.
  const [active, setActive] = useState<string | null>(null);
  const lastAt = useRef(0);
  const root = useRef<HTMLDivElement>(null);
  const clipId = useId();
  const activeAt = active === null ? -1 : buckets.findIndex((b) => b.label === active);
  const tabStop = openable.includes(activeAt) ? activeAt : (openable[0] ?? -1);
  const slots = useRef(new Map<number, SVGGElement>());

  function moveTo(at: number | undefined) {
    if (at === undefined) return;
    setActive(buckets[at]!.label);
    slots.current.get(at)?.focus();
  }

  // The focused bar stopped being a button (its count went to 0, or it lost its rules): focus
  // moves to the nearest bar that still is, instead of dropping to the page.
  useEffect(() => {
    if (active === null || openable.includes(activeAt)) return;
    let nearest = openable[0];
    for (const at of openable) {
      if (Math.abs(at - lastAt.current) < Math.abs((nearest ?? 0) - lastAt.current)) nearest = at;
    }
    const inside = root.current?.contains(document.activeElement) ?? false;
    setActive(nearest === undefined ? null : buckets[nearest]!.label);
    if (inside && nearest !== undefined) slots.current.get(nearest)?.focus();
  }, [active, activeAt, buckets, openable]);

  function onKeyDown(event: KeyboardEvent<SVGGElement>, bucket: T, at: number) {
    const place = openable.indexOf(at);
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect?.(bucket);
    } else if (NEXT_KEYS.has(event.key)) {
      event.preventDefault();
      moveTo(openable[Math.min(openable.length - 1, place + 1)]);
    } else if (PREVIOUS_KEYS.has(event.key)) {
      event.preventDefault();
      moveTo(openable[Math.max(0, place - 1)]);
    } else if (event.key === "Home") {
      event.preventDefault();
      moveTo(openable[0]);
    } else if (event.key === "End") {
      event.preventDefault();
      moveTo(openable[openable.length - 1]);
    }
  }

  return (
    <div className={`cp-pixel-bars ${className}`.trim()} data-orientation={orientation} ref={root}>
      <div className="cp-pixel-bars__scroll" ref={box}>
        <svg
          className="cp-pixel-bars__svg"
          role="group"
          aria-label={title}
          width={layout.width}
          height={layout.height}
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          shapeRendering="crispEdges"
          focusable="false"
          style={{ fontSize: layout.fontSize }}
        >
          {layout.labelWidth > 0 && (
            <clipPath id={clipId}>
              <rect x={0} y={0} width={layout.labelWidth} height={layout.height} />
            </clipPath>
          )}
          <rect
            className="cp-pixel-bars__axis"
            x={layout.axis.x}
            y={layout.axis.y}
            width={layout.axis.width}
            height={layout.axis.height}
          />
          {layout.bars.map((bar) => {
            const bucket = buckets[bar.index]!;
            const opens = openable.includes(bar.index);
            const changed = changedMark(marks, bucket.label);
            const name = barName(bucket);
            const interactive = opens
              ? {
                  role: "button" as const,
                  tabIndex: bar.index === tabStop ? 0 : -1,
                  onClick: () => onSelect?.(bucket),
                  onFocus: () => {
                    lastAt.current = bar.index;
                    setActive(bucket.label);
                  },
                  onKeyDown: (event: KeyboardEvent<SVGGElement>) => onKeyDown(event, bucket, bar.index),
                }
              : { "aria-hidden": true as const };
            return (
              <g
                key={bar.index}
                className={`cp-pixel-bars__bar${opens ? " cp-pixel-bars__bar--open" : ""}`}
                data-bar-slot={bar.index}
                ref={(node) => {
                  if (node && opens) slots.current.set(bar.index, node);
                  else slots.current.delete(bar.index);
                }}
                {...interactive}
              >
                <title>{name}</title>
                <rect
                  className="cp-pixel-bars__hit"
                  x={bar.hit.x}
                  y={bar.hit.y}
                  width={bar.hit.width}
                  height={bar.hit.height}
                />
                {bar.rect && bar.outline && (
                  <g className="cp-pixel-bars__shape" data-changed={changed}>
                    <rect
                      className="cp-pixel-bars__outline"
                      x={bar.outline.x}
                      y={bar.outline.y}
                      width={bar.outline.width}
                      height={bar.outline.height}
                    />
                    <rect
                      className="cp-pixel-bars__fill"
                      data-bar={bar.index}
                      x={bar.rect.x}
                      y={bar.rect.y}
                      width={bar.rect.width}
                      height={bar.rect.height}
                    />
                  </g>
                )}
                <text
                  className="cp-pixel-bars__count"
                  data-changed={changed}
                  x={bar.count.x}
                  y={bar.count.y}
                  textAnchor={bar.count.anchor}
                >
                  {bar.count.text}
                </text>
                {bar.label && (
                  <text
                    className="cp-pixel-bars__label"
                    clipPath={layout.labelWidth > 0 ? `url(#${clipId})` : undefined}
                    x={bar.label.x}
                    y={bar.label.y}
                    textAnchor={bar.label.anchor}
                  >
                    {bar.label.text}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      <table className="cp-pixel-bars__table">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th scope="col">{bucketLabel}</th>
            <th scope="col">{countLabel}</th>
          </tr>
        </thead>
        <tbody>
          {buckets.map((bucket, at) => (
            <tr key={at}>
              <th scope="row">{bucket.label}</th>
              <td>{bucket.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
