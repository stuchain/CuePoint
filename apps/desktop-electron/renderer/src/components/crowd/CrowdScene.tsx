/**
 * The pixel crowd: a club, a DJ at a booth and about two dozen dancers on one small canvas.
 *
 * Self-contained: it reads the player and the levels through `useCrowdInputs`, turns them into what
 * the crowd does with `stepCrowd`, and draws with `drawClub`. It moves only while it is on screen
 * (the page is the shown one and the document is not hidden), the app's motion setting is on, and
 * something is happening (playing, or a clip note still showing); otherwise it draws one still frame
 * and is redrawn when the title, the theme or the player changes. It never strobes. The canvas is
 * one image for assistive technology, named for the track, and a polite live region says
 * "Clipping" when the crowd notices the music clip.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { useMotion } from "../../tokens/MotionContext";
import { usePageActive } from "../shell/pageActive";
import { themeTokens, useThemeRevision } from "../waveform/waveformEnvironment";
import { beatAt } from "./beatClock";
import { createCrowdState, stepCrowd, type CrowdOutput, type CrowdState } from "./crowdRules";
import {
  CROWD_HEIGHT,
  CROWD_MAX_HEIGHT,
  CROWD_MAX_WIDTH,
  CROWD_SEED,
  CROWD_WIDTH,
  clubLayout,
  createBackdropCache,
  drawClub,
  makeCrowd,
  paletteFrom,
} from "./crowdSprites";
import { useCrowdInputs } from "./useCrowdInputs";
import "./crowd.css";

/** 30 frames a second is plenty for pixel art that changes on the beat. */
const FRAME_MS = 1000 / 30;

function useDocumentVisible(): boolean {
  const read = () => typeof document === "undefined" || !document.hidden;
  const [visible, setVisible] = useState(read);
  useEffect(() => {
    const onChange = () => setVisible(read());
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);
  return visible;
}

const IDLE_OUTPUT: CrowdOutput = {
  energy: 0,
  move: "idle",
  cheer: false,
  freeze: false,
  clip: false,
  clipNote: false,
  drop: false,
  build: false,
};

interface CrowdSceneProps {
  className?: string;
  /**
   * The club's size in logical pixels (the Party view fills its stage with it). The crowd is made
   * for this size, and again only when it changes. Default: the smallest club, 232 x 130.
   */
  width?: number;
  height?: number;
}

export function CrowdScene({ className, width: wantedWidth = CROWD_WIDTH, height: wantedHeight = CROWD_HEIGHT }: CrowdSceneProps) {
  const width = Math.min(CROWD_MAX_WIDTH, Math.max(CROWD_WIDTH, Math.round(wantedWidth)));
  const height = Math.min(CROWD_MAX_HEIGHT, Math.max(CROWD_HEIGHT, Math.round(wantedHeight)));
  const canvas = useRef<HTMLCanvasElement>(null);
  const inputs = useCrowdInputs();
  const pageActive = usePageActive();
  const visible = useDocumentVisible();
  // "Changing state" is the nearest kind. `useMotion(kind)` is the app's one answer to "may this
  // move": the kind's switch, and not while the system asks for reduced motion unless the user chose
  // Motion "On" (Follow system off). Outside a `MotionProvider` it is false: a still frame.
  const motion = useMotion("state");
  const theme = useThemeRevision();
  const animate = pageActive && visible && motion;

  const layout = useMemo(() => clubLayout(width, height), [width, height]);
  const crowd = useMemo(
    () => makeCrowd(width, CROWD_SEED, layout.yTop, layout.yBottom),
    [width, layout],
  );
  // The sky, rig and floor do not move: painted once per size and palette.
  const backdrop = useMemo(() => createBackdropCache(), []);
  // Read from the tokens at mount and whenever the theme changes.
  const palette = useMemo(
    () =>
      paletteFrom({
        accent: themeTokens.getPropertyValue("--accent-primary"),
        bgApp: themeTokens.getPropertyValue("--bg-app"),
        warning: themeTokens.getPropertyValue("--accent-warning"),
      }),
    // `theme` is the signal that the tokens may have changed.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [theme],
  );

  const { read, title, playing, bpm: trackBpm } = inputs;
  const titleRef = useRef(title);
  titleRef.current = title;
  // Kept across a restart of the loop (the page was hidden, the theme changed), so the smoothing
  // does not start over.
  const crowdState = useRef<CrowdState>(createCrowdState());

  const base = useMemo(
    () => ({ width, height, boothY: layout.boothY, palette, crowd, backdrop }),
    [width, height, layout, palette, crowd, backdrop],
  );

  const [clipping, setClipping] = useState(false);

  // Still: one frame, drawn again when what it shows changes. A layout effect, so a resize (which
  // clears the canvas) is drawn over before it is painted: no blank frame.
  useLayoutEffect(() => {
    if (animate) return;
    setClipping(false);
    const ctx = canvas.current?.getContext("2d") ?? null;
    if (!ctx) return;
    drawClub(ctx, {
      ...base,
      ...IDLE_OUTPUT,
      energy: 0.3,
      move: playing ? "sway" : "idle",
      beat: 0,
      phase: 0.25,
      still: true,
      bpm: title === "" && trackBpm === null ? null : Math.round(60_000 / beatAt(0, null, trackBpm).beatMs),
      time: 0,
      title,
    });
  }, [animate, base, playing, title, trackBpm]);

  // Moving: the loop runs only while the crowd is on screen and motion is on, and ends itself once
  // the player is paused and nothing is left to show (it starts again when `playing` changes). A layout
  // effect that draws one frame at once, so a resize (which clears the canvas) never paints blank.
  useLayoutEffect(() => {
    if (!animate) return undefined;
    const ctx = canvas.current?.getContext("2d") ?? null;
    if (!ctx) return undefined;
    let lastDrawn = -Infinity;
    let handle = 0;
    let noted = false;

    const frame = (now: number) => {
      if (now - lastDrawn < FRAME_MS) {
        handle = requestAnimationFrame(frame);
        return;
      }
      lastDrawn = now;
      const f = read(now);
      const at = beatAt(f.positionSec ?? 0, f.grid, f.bpm);
      const stepped = stepCrowd(crowdState.current, {
        readings: f.readings,
        beatMs: at.beatMs,
        positionSec: f.positionSec,
        isPlaying: f.playing,
        trackChanged: f.newTrack,
        now,
        fallbackEnergy: f.fallbackEnergy,
      });
      const output = stepped.output;
      drawClub(ctx, {
        ...base,
        ...output,
        beat: at.beat,
        phase: at.phase,
        bpm: titleRef.current === "" && f.bpm === null && f.grid.length === 0 ? null : Math.round(60_000 / at.beatMs),
        time: now / 1000,
        title: titleRef.current,
      });
      if (output.clipNote !== noted) {
        noted = output.clipNote;
        setClipping(noted);
      }
      if (f.playing || output.clipNote) handle = requestAnimationFrame(frame);
    };
    frame(performance.now());
    return () => cancelAnimationFrame(handle);
  }, [animate, base, read, playing, title]);

  const label = !title
    ? "Pixel crowd, waiting for a track"
    : playing
      ? `Pixel crowd dancing to ${title}`
      : `Pixel crowd resting, ${title} is paused`;

  return (
    <>
      <canvas
        ref={canvas}
        className={className ? `cp-crowd ${className}` : "cp-crowd"}
        width={width}
        height={height}
        role="img"
        aria-label={label}
      />
      <span className="cp-visually-hidden" role="status" aria-live="polite">
        {clipping ? "Clipping" : ""}
      </span>
    </>
  );
}
