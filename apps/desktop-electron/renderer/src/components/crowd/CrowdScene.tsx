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
import { useEffect, useMemo, useRef, useState } from "react";

import { useMotion } from "../../tokens/MotionContext";
import { usePageActive } from "../shell/pageActive";
import { themeTokens, useThemeRevision } from "../waveform/waveformEnvironment";
import { beatAt } from "./beatClock";
import { createCrowdState, stepCrowd, type CrowdOutput, type CrowdState } from "./crowdRules";
import {
  BOOTH_Y,
  CROWD_COUNT,
  CROWD_HEIGHT,
  CROWD_ROWS,
  CROWD_SEED,
  CROWD_WIDTH,
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

const IDLE_OUTPUT: CrowdOutput = { energy: 0, move: "idle", cheer: false, freeze: false, clip: false, clipNote: false };

export function CrowdScene({ className }: { className?: string }) {
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

  const crowd = useMemo(
    () => makeCrowd(CROWD_COUNT, CROWD_WIDTH, CROWD_ROWS, CROWD_SEED, BOOTH_Y + 22, CROWD_HEIGHT - 2),
    [],
  );
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

  const { read, title, playing } = inputs;
  const titleRef = useRef(title);
  titleRef.current = title;
  // Kept across a restart of the loop (the page was hidden, the theme changed), so the smoothing
  // does not start over.
  const crowdState = useRef<CrowdState>(createCrowdState());

  const base = useMemo(
    () => ({ width: CROWD_WIDTH, height: CROWD_HEIGHT, boothY: BOOTH_Y, palette, crowd }),
    [palette, crowd],
  );

  const [clipping, setClipping] = useState(false);

  // Still: one frame, drawn again when what it shows changes.
  useEffect(() => {
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
      time: 0,
      title,
    });
  }, [animate, base, playing, title]);

  // Moving: the loop runs only while the crowd is on screen and motion is on, and ends itself once
  // the player is paused and nothing is left to show (it starts again when `playing` changes).
  useEffect(() => {
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
        time: now / 1000,
        title: titleRef.current,
      });
      if (output.clipNote !== noted) {
        noted = output.clipNote;
        setClipping(noted);
      }
      if (f.playing || output.clipNote) handle = requestAnimationFrame(frame);
    };
    handle = requestAnimationFrame(frame);
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
        width={CROWD_WIDTH}
        height={CROWD_HEIGHT}
        role="img"
        aria-label={label}
      />
      <span className="cp-visually-hidden" role="status" aria-live="polite">
        {clipping ? "Clipping" : ""}
      </span>
    </>
  );
}
