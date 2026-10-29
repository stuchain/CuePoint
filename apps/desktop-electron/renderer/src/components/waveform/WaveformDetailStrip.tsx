/**
 * The zoomed waveform above the player bar (T4): about 8 s either side of a
 * playhead that stays in the middle (the wheel zooms it, 4 to 64 s), scrolling with playback, a line on every
 * beat and a stronger one on each bar.
 *
 * **What it draws.** The track's detail (75 columns a second) once the engine
 * has made it (usually ahead of play: `waveformPrefetch.ts`). If it is not ready
 * when the track starts, the overview stands in: stretched over the same window
 * so nothing jumps, and smoothed (linearly interpolated between its columns,
 * `waveformStandIn.ts`) so it slopes instead of stepping in blocks, then
 * cross-faded to the detail over `CROSSFADE_MS` when that arrives (instantly
 * under reduced motion: the "State changes" switch). The time spent on the stand-in is noted for the
 * profiler and the breadcrumb trail, by outcome only. With neither, words. The beat grid is
 * Rekordbox's, from the track's marks: a track without one gets no lines and
 * says why in the tip above the strip.
 *
 * **How it draws.** The columns and lines are drawn once into offscreen tiles
 * of `TILE_UNITS` columns (`waveformDetailLayout.ts` decides every rectangle);
 * a frame is a `clearRect`, two or three `drawImage` calls at a whole-unit
 * offset, the played half dimmed and the playhead. Tiles are rebuilt when the
 * size, the scale, the pixel ratio, the colour mode, the theme or the data
 * changes.
 *
 * **When it draws.** The player reports a position four times a second; a
 * `requestAnimationFrame` loop extrapolates between snapshots
 * (`playheadClock.ts`), and runs only while a track plays and the document is
 * visible, under reduced motion too (M376: a playhead that waited for the next
 * snapshot jumped ~19 columns four times a second). After a pause it keeps going
 * only until the glide to the stop has faded (`PAUSE_BLEND_MS` at most), then
 * stops; hidden, no frame is scheduled.
 *
 * `aria-hidden`: the bar's slider stays the control, as in the Inspector. A
 * click seeks to the time under it through the player bridge.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from "react";

import { Hint } from "../Hint";
import { reportUnexpected } from "../../reporting/reporting";
import { useScaleFactor } from "../../tokens/ScaleContext";
import { selectDuration, selectPlaying, selectPosition } from "../player/playerFormat";
import { usePlayerValue } from "../player/playerStore";
import { WAVEFORM_LOADING_WORDS, detailWords, zoomHint } from "./analysisWords";
import { createPlayheadClock } from "./playheadClock";
import { useWaveformDetail } from "./useWaveformDetail";
import { useWaveform } from "./useWaveforms";
import { useWaveformColour } from "./waveformColour";
import { useWaveformDetailSpan } from "./waveformDetailSetting";
import {
  TILE_UNITS,
  detailView,
  layoutDetailTile,
  msAtColumn,
  createWheelStepper,
  nextSpan,
  type DetailSource,
  type DetailTile,
} from "./waveformDetailLayout";
import { CROSSFADE_MS, crossfadeAlpha, noteStandIn } from "./waveformStandIn";
import { themeTokens, useBoxSize, useDevicePixelRatio, useThemeRevision } from "./waveformEnvironment";
import { BANDS, waveformColumns, waveformUnit } from "./waveformLayout";
import { resolvePaint } from "./waveformPaint";
import "./WaveformDetailStrip.css";

/** The overview drawn while the detail is made: the widest the engine answers. */
const COARSE_WIDTH = 1200;

/**
 * A beat line is the grid's token once (about 16% in every theme). A bar's line
 * is the same token laid three times (about 40%), so it reads clearly stronger
 * over the bands and still never as solid as the playhead.
 */
const BAR_LAYERS = 3;

/** True while the scroll may move: the root carries `data-motion-scroll` (Settings, Motion, "Scrolling"). */
function useMotionOn(attribute = "data-motion-scroll"): boolean {
  const [on, setOn] = useState(() => hasRootAttribute(attribute));
  useEffect(() => {
    setOn(hasRootAttribute(attribute));
    if (typeof MutationObserver === "undefined") return undefined;
    const observer = new MutationObserver(() => setOn(hasRootAttribute(attribute)));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: [attribute] });
    return () => observer.disconnect();
  }, [attribute]);
  return on;
}

function hasRootAttribute(attribute: string): boolean {
  return typeof document !== "undefined" && document.documentElement.hasAttribute(attribute);
}

/** Whether the document is hidden, followed. */
function useHidden(): boolean {
  const read = () => typeof document !== "undefined" && document.hidden;
  const [hidden, setHidden] = useState(read);
  useEffect(() => {
    const onChange = () => setHidden(read());
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);
  return hidden;
}

/** Fill one tile's rectangles onto its own canvas. */
function paintTile(context: CanvasRenderingContext2D, tile: DetailTile): void {
  context.imageSmoothingEnabled = false;
  const colours = new Map<string, string>();
  const fill = (rects: DetailTile["bands"], alpha: number) => {
    context.globalAlpha = alpha;
    for (const rect of rects) {
      let colour = colours.get(rect.paint);
      if (colour === undefined) {
        colour = resolvePaint(rect.paint, themeTokens);
        colours.set(rect.paint, colour);
      }
      context.fillStyle = colour;
      context.fillRect(rect.x, rect.y, rect.width, rect.height);
    }
  };
  fill(tile.bands, 1);
  fill(tile.beats, 1);
  for (let layer = 0; layer < BAR_LAYERS; layer += 1) fill(tile.bars, 1);
  context.globalAlpha = 1;
}

interface TileSet {
  epoch: object | null;
  canvases: Map<number, HTMLCanvasElement | null>;
  /** Drawn from the smoothed overview, not the detail. */
  standIn: boolean;
  /** What a tile's place depends on, so a fade only joins tiles that line up. */
  geometry: string;
  trackId: number;
}

export function WaveformDetailStrip({ trackId }: { trackId: number }) {
  const [canvas, box] = useBoxSize<HTMLCanvasElement>();
  const scale = useScaleFactor();
  const ratio = useDevicePixelRatio();
  const theme = useThemeRevision();
  const [mode] = useWaveformColour();
  const [spanMs, setSpanMs] = useWaveformDetailSpan();
  // The cross-fade is a state change (Settings, Motion, "State changes"), not scrolling.
  const fadeMotion = useMotionOn("data-motion-state");
  const hidden = useHidden();

  const position = usePlayerValue(selectPosition);
  const playing = usePlayerValue(selectPlaying);
  const playerSeconds = usePlayerValue(selectDuration);

  const detailEntry = useWaveformDetail(trackId);
  const marksEntry = useWaveform(trackId, null, { marks: true });
  const detail = detailEntry?.kind === "detail" ? detailEntry.detail : null;
  const detailReady = detail?.state === "ready" && detail.data !== null && detail.rate_hz !== null;
  // Read only what the bar has already asked for once the detail has arrived.
  const coarseEntry = useWaveform(trackId, COARSE_WIDTH, { ask: !detailReady });

  const marks = marksEntry?.kind === "track" ? marksEntry.track.marks : null;
  const grid = marks?.grid;
  const noGrid = marksEntry?.kind === "track" && (grid?.length ?? 0) === 0;
  const coarse = coarseEntry?.kind === "track" ? coarseEntry.track : null;

  const marksTrack = marksEntry?.kind === "track" ? marksEntry.track : null;
  const durationMs =
    (detailReady ? detail.duration_ms : null) ??
    coarse?.duration_ms ??
    marksTrack?.duration_ms ??
    (playerSeconds ? playerSeconds * 1000 : 0);

  const source = useMemo<DetailSource | null>(() => {
    if (detailReady) return { data: detail.data!, rateHz: detail.rate_hz! };
    if (coarse?.state === "ready" && coarse.data && coarse.duration_ms && coarse.duration_ms > 0) {
      const columns = Math.floor(coarse.data.length / BANDS);
      return { data: coarse.data, rateHz: columns / (coarse.duration_ms / 1000), smooth: true };
    }
    return null;
  }, [coarse, detail, detailReady]);

  /** Drawing the smoothed overview because the detail is not ready. */
  const standIn = source?.smooth === true;

  const fadeMotionRef = useRef(fadeMotion);
  fadeMotionRef.current = fadeMotion;
  const drawRef = useRef<() => void>(() => undefined);

  const columns = waveformColumns(box.width, scale, ratio);
  const unit = waveformUnit(scale, ratio);
  const width = Math.max(0, Math.round(box.width * ratio));
  const height = Math.max(0, Math.round(box.height * ratio));
  const rows = Math.floor(height / unit);
  const msPerColumn = columns > 0 ? spanMs / columns : 0;

  // Everything a tile's pixels depend on; a new one empties the tiles.
  const epoch = useMemo(
    () => ({}),
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [source, grid, durationMs, unit, rows, msPerColumn, mode, theme],
  );

  const clock = useRef(createPlayheadClock());
  const tiles = useRef<TileSet>({ epoch: null, canvases: new Map(), standIn: false, geometry: "", trackId });
  // The stand-in's tiles, drawn fading out under the detail's fading in.
  const fade = useRef<{ canvases: Map<number, HTMLCanvasElement | null>; startedAt: number } | null>(null);
  const [fading, setFading] = useState(false);
  const fadeFrame = useRef(0);

  const tileFor = useCallback(
    (index: number): HTMLCanvasElement | null => {
      const held = tiles.current.canvases.get(index);
      if (held !== undefined) return held;
      let built: HTMLCanvasElement | null = null;
      const element = document.createElement("canvas");
      element.width = TILE_UNITS * unit;
      element.height = rows * unit;
      const context = element.getContext("2d");
      if (context) {
        paintTile(
          context,
          layoutDetailTile({ source, index, columns: TILE_UNITS, unit, rows, msPerColumn, mode, grid, durationMs }),
        );
        built = element;
      }
      tiles.current.canvases.set(index, built);
      return built;
    },
    [durationMs, grid, mode, msPerColumn, rows, source, unit],
  );

  // Frames for the cross-fade, which a paused strip would not otherwise draw.
  const startFade = useCallback(() => {
    setFading(true);
    cancelAnimationFrame(fadeFrame.current);
    const tick = () => {
      drawRef.current();
      const running = fade.current;
      if (running && performance.now() - running.startedAt > 2 * CROSSFADE_MS) fade.current = null;
      if (fade.current) {
        fadeFrame.current = requestAnimationFrame(tick);
      } else {
        setFading(false);
      }
    };
    fadeFrame.current = requestAnimationFrame(tick);
  }, []);
  useEffect(() => () => cancelAnimationFrame(fadeFrame.current), []);

  const draw = useCallback(() => {
    const element = canvas.current;
    if (!element || columns <= 0 || rows <= 0) return;
    if (element.width !== width) element.width = width;
    if (element.height !== height) element.height = height;
    const context = element.getContext("2d");
    if (!context) return;
    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, width, height);
    const at = clock.current.positionMs(performance.now());
    if (at === null) return;
    const centre = Math.min(durationMs > 0 ? durationMs : at, Math.max(0, at));

    if (tiles.current.epoch !== epoch) {
      const previous = tiles.current;
      const geometry = `${unit}|${rows}|${msPerColumn}`;
      const arrived = previous.standIn && !standIn && source !== null && previous.trackId === trackId;
      if (arrived && previous.geometry === geometry && previous.canvases.size > 0 && fadeMotionRef.current) {
        fade.current = { canvases: previous.canvases, startedAt: performance.now() };
        startFade();
      } else if (!arrived || previous.geometry !== geometry) {
        fade.current = null;
      }
      tiles.current = { epoch, canvases: new Map(), standIn, geometry, trackId };
    }
    const view = detailView(centre, columns, TILE_UNITS, msPerColumn);
    const top = Math.floor((height - rows * unit) / 2);
    const wanted = new Set(view.tiles.map((t) => t.index));
    for (const index of [...tiles.current.canvases.keys()]) {
      if (!wanted.has(index) && tiles.current.canvases.size > view.tiles.length + 1) {
        tiles.current.canvases.delete(index);
      }
    }
    if (source) {
      let alpha = 1;
      const fadeOut = fade.current;
      if (fadeOut) {
        alpha = crossfadeAlpha(performance.now() - fadeOut.startedAt, CROSSFADE_MS);
        if (alpha >= 1) {
          fade.current = null;
        } else {
          context.globalAlpha = 1 - alpha;
          for (const tile of view.tiles) {
            const old = fadeOut.canvases.get(tile.index);
            if (old) context.drawImage(old, tile.x * unit, top);
          }
        }
      }
      context.globalAlpha = alpha;
      for (const tile of view.tiles) {
        const image = tileFor(tile.index);
        if (image) context.drawImage(image, tile.x * unit, top);
      }
      context.globalAlpha = 1;
    }
    const mid = Math.floor(columns / 2) * unit;
    context.fillStyle = resolvePaint("veil", themeTokens);
    context.fillRect(0, top, mid, rows * unit);
    context.fillStyle = resolvePaint("playhead", themeTokens);
    context.fillRect(mid, top, unit, rows * unit);
  }, [canvas, columns, durationMs, epoch, height, msPerColumn, rows, source, standIn, startFade, tileFor, trackId, unit, width]);

  useLayoutEffect(() => {
    drawRef.current = draw;
    draw();
  }, [draw, theme]);

  // A glide after a snapshot is still fading: a paused strip draws on until it ends.
  const [gliding, setGliding] = useState(false);

  // How long the stand-in was drawn while the detail was being made, noted when the detail
  // replaces it, the track changes or the strip goes. A detail that will not come (missing,
  // an error) is not a wait, so nothing is timed for it.
  const standInSince = useRef<{ trackId: number; at: number } | null>(null);
  const detailState = detail?.state ?? null;
  const pending = detailState === "waiting" || detailState === "working";
  useEffect(() => {
    const now = performance.now();
    const held = standInSince.current;
    if (held && held.trackId !== trackId) {
      noteStandIn(now - held.at, "left");
      standInSince.current = null;
    }
    if (detailReady) {
      if (standInSince.current) noteStandIn(now - standInSince.current.at, "replaced");
      standInSince.current = null;
    } else if (standIn && pending && standInSince.current === null) {
      standInSince.current = { trackId, at: now };
    } else if (!pending) {
      standInSince.current = null;
    }
  }, [detailReady, pending, standIn, trackId]);
  useEffect(
    () => () => {
      const held = standInSince.current;
      if (held) noteStandIn(performance.now() - held.at, "left");
      standInSince.current = null;
    },
    [],
  );

  // A snapshot from the player: anchor the clock, and draw where it says.
  useLayoutEffect(() => {
    const now = performance.now();
    clock.current.snapshot(position, playing, now);
    setGliding(!playing && clock.current.settling(now));
    if (!document.hidden) drawRef.current();
  }, [position, playing]);

  useEffect(() => {
    clock.current.setHidden(hidden, performance.now());
    if (!hidden) drawRef.current();
  }, [hidden]);

  // Between snapshots, only while a frame can be seen and is wanted.
  // Under reduced motion too (M376): a playhead that waits for the next snapshot jumps ~19 columns four times a second.
  const animate = (playing || gliding) && !hidden;
  useEffect(() => {
    if (!animate) return undefined;
    let frame = 0;
    const tick = () => {
      drawRef.current();
      if (!playing && !clock.current.settling(performance.now())) {
        setGliding(false);
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [animate, playing]);

  // The wheel zooms. A native listener, since React's `onWheel` is passive and
  // could not stop the page scrolling under it.
  const spanRef = useRef(spanMs);
  spanRef.current = spanMs;
  const setSpanRef = useRef(setSpanMs);
  setSpanRef.current = setSpanMs;
  const unwheel = useRef<(() => void) | null>(null);
  // A callback ref, so the listener follows the element however it is mounted.
  const strip = useCallback((element: HTMLDivElement | null) => {
    unwheel.current?.();
    unwheel.current = null;
    if (!element) return;
    const step = createWheelStepper();
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      // Sideways scrolling is not a zoom.
      const steps = step(event.deltaY, event.deltaMode, performance.now());
      if (steps === 0) return;
      const span = nextSpan(spanRef.current, steps);
      if (span !== spanRef.current) {
        spanRef.current = span;
        setSpanRef.current(span);
      }
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    unwheel.current = () => element.removeEventListener("wheel", onWheel);
  }, []);

  const seek = (event: MouseEvent<HTMLDivElement>) => {
    const element = canvas.current;
    const at = clock.current.positionMs(performance.now());
    if (!element || at === null || columns <= 0 || msPerColumn <= 0) return;
    const rect = element.getBoundingClientRect();
    const column = Math.floor(((event.clientX - rect.left) * ratio) / unit);
    let ms = msAtColumn(column, Math.floor(columns / 2), at, msPerColumn);
    if (durationMs > 0) ms = Math.min(durationMs, ms);
    try {
      Promise.resolve(window.cuepoint?.player?.seek(Math.max(0, ms) / 1000)).catch(reportUnexpected);
    } catch (cause) {
      reportUnexpected(cause);
    }
  };

  const words =
    source !== null
      ? null
      : detailEntry === null || detailEntry.kind === "loading"
        ? WAVEFORM_LOADING_WORDS
        : (detailWords(detailEntry) ?? WAVEFORM_LOADING_WORDS);

  return (
    <Hint text={zoomHint(spanMs, noGrid)}>
      <div
        ref={strip}
        className="cp-detail-strip"
        data-span-ms={spanMs}
        data-playing={playing ? "true" : "false"}
        data-testid="waveform-detail-strip"
        data-detail={detailEntry?.kind === "detail" ? detailEntry.detail.state : (detailEntry?.kind ?? "loading")}
        data-source={detailReady ? "detail" : source ? "overview" : "none"}
        data-fading={fading ? "true" : undefined}
        data-grid={noGrid ? "none" : grid && grid.length > 0 ? "rekordbox" : undefined}
        onClick={seek}
      >
        <canvas ref={canvas} className="cp-detail-strip__canvas" aria-hidden="true" data-mode={mode} />
        {words ? <p className="cp-detail-strip__words">{words}</p> : null}
      </div>
    </Hint>
  );
}
