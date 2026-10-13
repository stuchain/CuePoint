/**
 * The zoomed waveform above the player bar (T4): about 8 s either side of a
 * playhead that stays in the middle, scrolling with playback, a line on every
 * beat and a stronger one on each bar.
 *
 * **What it draws.** The track's detail (75 columns a second) once the engine
 * has made it. Until then, the overview stretched over the same window, so
 * nothing jumps when the detail arrives; with neither, words. The beat grid is
 * Rekordbox's, from the track's marks: a track without one gets no lines and
 * says why in its title.
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
 * (`playheadClock.ts`), and runs only while a track plays, the document is
 * visible and motion is on. After a pause it keeps going only until the glide
 * to the stop has faded (`PAUSE_BLEND_MS` at most), then stops; hidden, no frame
 * is scheduled. Under reduced motion (`data-motion-scroll` absent from the root)
 * there is no glide and it redraws only on a snapshot, at the true position.
 *
 * `aria-hidden`: the bar's slider stays the control, as in the Inspector. A
 * click seeks to the time under it through the player bridge.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from "react";

import { reportUnexpected } from "../../reporting/reporting";
import { useScaleFactor } from "../../tokens/ScaleContext";
import { selectDuration, selectPlaying, selectPosition } from "../player/playerFormat";
import { usePlayerValue } from "../player/playerStore";
import { DETAIL_SEEK_TITLE, NO_BEAT_GRID_TITLE, WAVEFORM_LOADING_WORDS, detailWords } from "./analysisWords";
import { createPlayheadClock } from "./playheadClock";
import { useWaveformDetail } from "./useWaveformDetail";
import { useWaveform } from "./useWaveforms";
import { useWaveformColour } from "./waveformColour";
import {
  DETAIL_SPAN_MS,
  TILE_UNITS,
  detailView,
  layoutDetailTile,
  msAtColumn,
  type DetailSource,
  type DetailTile,
} from "./waveformDetailLayout";
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
function useMotionOn(): boolean {
  const read = () =>
    typeof document !== "undefined" && document.documentElement.hasAttribute("data-motion-scroll");
  const [on, setOn] = useState(read);
  useEffect(() => {
    setOn(read());
    if (typeof MutationObserver === "undefined") return undefined;
    const observer = new MutationObserver(() => setOn(read()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-motion-scroll"] });
    return () => observer.disconnect();
  }, []);
  return on;
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

export function WaveformDetailStrip({ trackId }: { trackId: number }) {
  const [canvas, box] = useBoxSize<HTMLCanvasElement>();
  const scale = useScaleFactor();
  const ratio = useDevicePixelRatio();
  const theme = useThemeRevision();
  const [mode] = useWaveformColour();
  const motion = useMotionOn();
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
      return { data: coarse.data, rateHz: columns / (coarse.duration_ms / 1000) };
    }
    return null;
  }, [coarse, detail, detailReady]);

  const columns = waveformColumns(box.width, scale, ratio);
  const unit = waveformUnit(scale, ratio);
  const width = Math.max(0, Math.round(box.width * ratio));
  const height = Math.max(0, Math.round(box.height * ratio));
  const rows = Math.floor(height / unit);
  const msPerColumn = columns > 0 ? DETAIL_SPAN_MS / columns : 0;

  // Everything a tile's pixels depend on; a new one empties the tiles.
  const epoch = useMemo(
    () => ({}),
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [source, grid, durationMs, unit, rows, msPerColumn, mode, theme],
  );

  const clock = useRef(createPlayheadClock());
  const tiles = useRef<{ epoch: object | null; canvases: Map<number, HTMLCanvasElement | null> }>({
    epoch: null,
    canvases: new Map(),
  });

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

    if (tiles.current.epoch !== epoch) tiles.current = { epoch, canvases: new Map() };
    const view = detailView(centre, columns, TILE_UNITS, msPerColumn);
    const top = Math.floor((height - rows * unit) / 2);
    const wanted = new Set(view.tiles.map((t) => t.index));
    for (const index of [...tiles.current.canvases.keys()]) {
      if (!wanted.has(index) && tiles.current.canvases.size > view.tiles.length + 1) {
        tiles.current.canvases.delete(index);
      }
    }
    if (source) {
      for (const tile of view.tiles) {
        const image = tileFor(tile.index);
        if (image) context.drawImage(image, tile.x * unit, top);
      }
    }
    const mid = Math.floor(columns / 2) * unit;
    context.fillStyle = resolvePaint("played", themeTokens);
    context.fillRect(0, top, mid, rows * unit);
    context.fillStyle = resolvePaint("playhead", themeTokens);
    context.fillRect(mid, top, unit, rows * unit);
  }, [canvas, columns, durationMs, epoch, height, msPerColumn, rows, source, tileFor, unit, width]);

  const drawRef = useRef(draw);
  useLayoutEffect(() => {
    drawRef.current = draw;
    draw();
  }, [draw, theme]);

  // Without motion no frame follows a snapshot, so there is no glide: draw the truth.
  const motionRef = useRef(motion);
  motionRef.current = motion;

  // A glide after a snapshot is still fading: a paused strip draws on until it ends.
  const [gliding, setGliding] = useState(false);

  // A snapshot from the player: anchor the clock, and draw where it says.
  useLayoutEffect(() => {
    const now = performance.now();
    clock.current.snapshot(position, playing, now, motionRef.current);
    setGliding(!playing && clock.current.settling(now));
    if (!document.hidden) drawRef.current();
  }, [position, playing]);

  useEffect(() => {
    clock.current.setHidden(hidden, performance.now());
    if (!hidden) drawRef.current();
  }, [hidden]);

  // Between snapshots, only while a frame can be seen and is wanted.
  const animate = (playing || gliding) && !hidden && motion;
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
    <div
      className="cp-detail-strip"
      data-testid="waveform-detail-strip"
      data-detail={detailEntry?.kind === "detail" ? detailEntry.detail.state : (detailEntry?.kind ?? "loading")}
      data-source={detailReady ? "detail" : source ? "overview" : "none"}
      data-grid={noGrid ? "none" : grid && grid.length > 0 ? "rekordbox" : undefined}
      title={noGrid ? NO_BEAT_GRID_TITLE : DETAIL_SEEK_TITLE}
      onClick={seek}
    >
      <canvas ref={canvas} className="cp-detail-strip__canvas" aria-hidden="true" data-mode={mode} />
      {words ? <p className="cp-detail-strip__words">{words}</p> : null}
    </div>
  );
}
