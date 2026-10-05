/**
 * The renderer's first canvas: a waveform in the pixel style (WAVE-05, fact 8).
 *
 * One `<canvas>` sized in device pixels, smoothing off, filled with exactly the
 * rectangles `layoutWaveform` answers, in its order. It decides nothing of its
 * own, so the layout's tests cover every decision and the end-to-end test the
 * pixels.
 *
 * Painted again when its box changes size, when the display's pixel ratio
 * changes (a window dragged to another monitor), when the scale changes, and
 * when the theme does, including a custom theme's preview, which changes the
 * root's inline tokens rather than its `data-theme`.
 *
 * `aria-hidden`: whatever holds it carries the meaning in words.
 */
import { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from "react";

import type { BeatGridMarker, TrackCue } from "../../api/cuepointBridge.types";
import { useScale } from "../../tokens/ScaleContext";
import { useWaveformColour } from "./waveformColour";
import { layoutWaveform, type WaveformColourMode } from "./waveformLayout";
import { paintLayout } from "./waveformPaint";
import "./WaveformCanvas.css";

export interface WaveformCanvasProps {
  /** `columns × 4` bytes: full, low, mid, high. */
  data: Uint8Array;
  durationMs: number;
  cues?: readonly TrackCue[];
  grid?: readonly BeatGridMarker[];
  playheadMs?: number | null;
  inMs?: number | null;
  outMs?: number | null;
  /** The colour mode; the remembered preference unless given. */
  mode?: WaveformColourMode;
  cueLabels?: boolean;
  className?: string;
}

/** The display's pixel ratio, followed as it changes. */
function useDevicePixelRatio(): number {
  const [ratio, setRatio] = useState(() => window.devicePixelRatio || 1);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return undefined;
    const query = window.matchMedia(`(resolution: ${ratio}dppx)`);
    const changed = () => setRatio(window.devicePixelRatio || 1);
    query.addEventListener?.("change", changed);
    return () => query.removeEventListener?.("change", changed);
  }, [ratio]);
  return ratio;
}

/** A number that changes whenever the theme's tokens may have. */
function useThemeRevision(): number {
  const [revision, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (typeof MutationObserver === "undefined") return undefined;
    const observer = new MutationObserver(bump);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme", "style"],
    });
    return () => observer.disconnect();
  }, []);
  return revision;
}

export function WaveformCanvas({
  data,
  durationMs,
  cues,
  grid,
  playheadMs = null,
  inMs = null,
  outMs = null,
  mode,
  cueLabels = true,
  className,
}: WaveformCanvasProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });
  const { scale } = useScale();
  const ratio = useDevicePixelRatio();
  const theme = useThemeRevision();
  const [preferred] = useWaveformColour();
  const colourMode = mode ?? preferred;

  useEffect(() => {
    const element = canvas.current;
    if (!element) return undefined;
    const measure = () => {
      const rect = element.getBoundingClientRect();
      setBox((previous) =>
        previous.width === rect.width && previous.height === rect.height
          ? previous
          : { width: rect.width, height: rect.height },
      );
    };
    measure();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const layout = useMemo(
    () =>
      layoutWaveform({
        data,
        durationMs,
        cssWidth: box.width,
        cssHeight: box.height,
        scale,
        devicePixelRatio: ratio,
        mode: colourMode,
        cues,
        grid,
        playheadMs,
        inMs,
        outMs,
        cueLabels,
      }),
    [box, colourMode, cueLabels, cues, data, durationMs, grid, inMs, outMs, playheadMs, ratio, scale],
  );

  useLayoutEffect(() => {
    const element = canvas.current;
    if (!element) return;
    if (element.width !== layout.width) element.width = layout.width;
    if (element.height !== layout.height) element.height = layout.height;
    const context = element.getContext("2d");
    if (!context) return;
    paintLayout(context, layout, getComputedStyle(element));
  }, [layout, theme]);

  return (
    <canvas
      ref={canvas}
      className={className ? `cp-waveform-canvas ${className}` : "cp-waveform-canvas"}
      aria-hidden="true"
      data-columns={layout.columns}
      data-mode={colourMode}
    />
  );
}
