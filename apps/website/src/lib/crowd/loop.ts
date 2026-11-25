/**
 * The strip's loop control: at most 30 frames a second, one still frame with reduced motion or saveData,
 * paused while the tab is hidden or the strip is off screen. It keeps its own time (the sum of the
 * frames it ran), so a pause never makes the pattern jump.
 */
import { STILL_SECONDS } from "./pattern";

export const FRAME_MS = 1000 / 30;

export interface LoopEnv {
  reducedMotion: boolean;
  saveData: boolean;
  raf(cb: (now: number) => void): number;
  caf(id: number): void;
}

export interface Loop {
  start(): void;
  stop(): void;
  setVisible(visible: boolean): void;
  setOnScreen(onScreen: boolean): void;
  /** Reduced motion turned on or off while the page is open: still frame, or the loop again. */
  setReduced(on: boolean): void;
  running(): boolean;
}

/** `draw` gets the loop's time in seconds. */
export function createLoop(draw: (seconds: number) => void, env: LoopEnv): Loop {
  let reduced = env.reducedMotion;
  const still = () => reduced || env.saveData;
  let started = false;
  let visible = true;
  let onScreen = true;
  let id = 0;
  let last = 0;
  let time = 0;

  const frame = (now: number) => {
    id = 0;
    if (last === 0) last = now;
    const dt = now - last;
    // a callback at 120 Hz skips: draw only once a frame's worth (less a millisecond of slack for timer jitter) has passed
    if (dt >= FRAME_MS - 1) {
      // a long gap (a throttled tab) is a frame or two, not the gap
      time += Math.min(dt, 100) / 1000;
      last = now;
      draw(time);
    }
    id = env.raf(frame);
  };

  const sync = () => {
    const go = started && !still() && visible && onScreen;
    if (go && !id) {
      last = 0;
      id = env.raf(frame);
    } else if (!go && id) {
      env.caf(id);
      id = 0;
    }
  };

  return {
    start() {
      if (started) return;
      started = true;
      if (still()) {
        draw(STILL_SECONDS);
        return;
      }
      draw(time);
      sync();
    },
    stop() {
      started = false;
      sync();
    },
    setVisible(v) {
      visible = v;
      sync();
    },
    setOnScreen(v) {
      onScreen = v;
      sync();
    },
    setReduced(on) {
      if (on === reduced) return;
      reduced = on;
      if (!started) return;
      sync();
      if (on) draw(STILL_SECONDS);
      else if (!id) draw(time);
    },
    running: () => id !== 0,
  };
}
