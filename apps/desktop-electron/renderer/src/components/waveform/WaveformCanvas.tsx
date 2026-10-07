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
 *
 * Its box, the pixel ratio and the theme are watched once for every canvas on
 * screen (`waveformEnvironment.ts`), since the Library's column may show forty.
 */
import { useLayoutEffect, useMemo } from "react";

import type { BeatGridMarker, TrackCue } from "../../api/cuepointBridge.types";
import { useScaleFactor } from "../../tokens/ScaleContext";
import { useWaveformColour } from "./waveformColour";
import { themeTokens, useBoxSize, useDevicePixelRatio, useThemeRevision } from "./waveformEnvironment";
import { layoutWaveform, type WaveformColourMode } from "./waveformLayout";
import { paintLayout } from "./waveformPaint";
import "./WaveformCanvas.css";

interface WaveformCanvasProps {
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
  const [canvas, box] = useBoxSize<HTMLCanvasElement>();
  const scale = useScaleFactor();
  const ratio = useDevicePixelRatio();
  const theme = useThemeRevision();
  const [preferred] = useWaveformColour();
  const colourMode = mode ?? preferred;

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
    // Not measured yet: nothing to paint.
    if (layout.width === 0 || layout.height === 0) return;
    const context = element.getContext("2d");
    if (!context) return;
    paintLayout(context, layout, themeTokens);
  }, [canvas, layout, theme]);

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
