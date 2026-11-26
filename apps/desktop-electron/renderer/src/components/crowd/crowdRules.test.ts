import { describe, expect, it } from "vitest";

import {
  CHEER_MS,
  CLIP_NOTE_MS,
  WARMUP_MS,
  createCrowdState,
  stepCrowd,
  type CrowdInput,
  type CrowdOutput,
  type CrowdState,
} from "./crowdRules";

/** 100 ms a step, one reading each, 120 BPM (500 ms a beat); the play position follows the clock. */
const STEP = 100;

interface Run {
  state: CrowdState;
  now: number;
  out: CrowdOutput;
}

function start(): Run {
  return { state: createCrowdState(), now: 10_000, out: null as unknown as CrowdOutput };
}

function step(run: Run, rmsDb: number | null, extra: Partial<CrowdInput> = {}, peakDb = -6): Run {
  const now = run.now + STEP;
  const input: CrowdInput = {
    readings: rmsDb === null ? [] : [{ t: now, rmsDb, peakDb }],
    beatMs: 500,
    positionSec: (now - 10_000) / 1000,
    isPlaying: true,
    trackChanged: false,
    now,
    ...extra,
  };
  const { state, output } = stepCrowd(run.state, input);
  return { state, now, out: output };
}

function hold(run: Run, rmsDb: number | null, ms: number, extra: Partial<CrowdInput> = {}, peakDb = -6): Run {
  let at = run;
  for (let t = 0; t < ms; t += STEP) at = step(at, rmsDb, extra, peakDb);
  return at;
}

/** Loud for 8 s so the reference is -20 dB. */
function loud(): Run {
  return hold(start(), -20, 8000);
}

describe("energy and moves", () => {
  // Energy is the level within 20 dB below the track's reference (its loudest so far).
  it("measures the level below the track's own loudest", () => {
    // Reference -20: -35 is 15 dB down, 5/20.
    const run = hold(loud(), -35, 3000);
    expect(run.out.energy).toBeCloseTo(0.25, 1);
    expect(run.out.move).toBe("sway");
  });

  it("sways when it is quiet (energy under 0.3)", () => {
    const run = hold(loud(), -50, 3000);
    expect(run.out.energy).toBeLessThan(0.01);
    expect(run.out.move).toBe("sway");
  });

  it("bobs between 0.3 and 0.75", () => {
    const run = hold(loud(), -28, 3000);
    expect(run.out.energy).toBeGreaterThan(0.3);
    expect(run.out.energy).toBeLessThanOrEqual(0.75);
    expect(run.out.move).toBe("bob");
  });

  it("jumps when loud and full (over 0.75)", () => {
    const run = loud();
    expect(run.out.energy).toBeGreaterThan(0.75);
    expect(run.out.move).toBe("jump");
  });

  it("keeps a breakdown 16 dB down swaying, and still swaying after 10 s", () => {
    let run = hold(start(), -12, 8000);
    run = hold(run, -28, 3000);
    expect(run.out.move).toBe("sway");
    run = hold(run, -28, 10_000);
    expect(run.out.move).toBe("sway");
    expect(run.out.freeze).toBe(false);
  });

  it("holds the reference for 30 s, then lets it fall slowly", () => {
    let run = hold(start(), -12, 3000);
    run = hold(run, -28, 20_000);
    const early = run.out.energy;
    run = hold(run, -28, 80_000);
    expect(run.out.energy).toBeGreaterThan(early + 0.2);
  });

  it("does not jump for a steady ambient track: it bobs", () => {
    // Even a steady -30 dB from the first second is not "full": the reference never drops below -20.
    const run = hold(start(), -30, 10_000);
    expect(run.out.move).toBe("bob");
    expect(run.out.energy).toBeLessThan(0.75);
  });

  it("sways to a very quiet steady track", () => {
    const run = hold(start(), -42, 10_000);
    expect(run.out.move).toBe("sway");
  });

  it("rises quickly: about 50 ms of attack", () => {
    const quiet = hold(start(), -50, 8000);
    const next = step(quiet, -20);
    // One 100 ms step is two time constants: most of the way up.
    expect(next.out.energy).toBeGreaterThan(0.75 * 0.8);
  });

  it("falls slowly: about 400 ms of release", () => {
    const run = loud();
    const next = step(run, -60);
    expect(next.out.energy).toBeGreaterThan(0.5);
    const later = hold(next, -60, 2000);
    expect(later.out.energy).toBeLessThan(0.05);
  });

  it("smooths between sparse readings: no reading in a step holds the target", () => {
    let run = loud();
    const before = run.out.energy;
    run = step(run, null);
    run = step(run, null);
    expect(run.out.energy).toBeGreaterThan(before - 0.05);
    expect(run.out.move).toBe("jump");
  });

  it("keeps energy continuous when readings are 9 a second", () => {
    let run = loud();
    const seen: number[] = [];
    for (let i = 0; i < 20; i += 1) {
      run = step(run, i % 2 === 0 ? -20 : -26);
      seen.push(run.out.energy);
    }
    for (let i = 1; i < seen.length; i += 1) expect(Math.abs(seen[i] - seen[i - 1])).toBeLessThan(0.2);
  });

  it("uses the fallback energy when no reading has come for over a second", () => {
    let run = start();
    run = hold(run, null, 2000, { fallbackEnergy: 0.9 });
    expect(run.out.energy).toBeGreaterThan(0.75);
    expect(run.out.move).toBe("jump");
  });

  it("ignores the fallback while readings are fresh", () => {
    const run = hold(hold(start(), -20, 8000), -50, 3000, { fallbackEnergy: 1 });
    expect(run.out.energy).toBeLessThan(0.3);
  });
});

describe("paused and stopped", () => {
  it("is idle with no energy, cheer, freeze or clip", () => {
    const run = hold(loud(), -20, 500, { isPlaying: false });
    expect(run.out).toEqual({
      energy: 0,
      move: "idle",
      cheer: false,
      freeze: false,
      clip: false,
      clipNote: false,
      drop: false,
      build: false,
    });
  });

  it("dances again when playing resumes", () => {
    const run = hold(hold(loud(), -20, 500, { isPlaying: false }), -20, 3000);
    expect(run.out.move).toBe("jump");
  });
});

describe("a sudden drop", () => {
  it("freezes for one beat, then cheers when the energy returns", () => {
    let run = loud();
    run = step(run, -100);
    expect(run.out.freeze).toBe(true);
    run = hold(run, -100, 300);
    expect(run.out.freeze).toBe(true);
    // One beat is 500 ms: it is over by 700 ms.
    run = hold(run, -100, 500);
    expect(run.out.freeze).toBe(false);
    expect(run.out.cheer).toBe(false);
    run = hold(run, -100, 1000);
    expect(run.out.cheer).toBe(false);
    run = step(run, -20);
    expect(run.out.cheer).toBe(true);
    expect(run.out.freeze).toBe(false);
    run = hold(run, -20, CHEER_MS + 200);
    expect(run.out.cheer).toBe(false);
  });

  it("does not freeze for a quiet track that was never loud", () => {
    const run = hold(hold(start(), -45, 5000), -100, 600);
    expect(run.out.freeze).toBe(false);
  });

  it("does not freeze for a drop that is not near silence", () => {
    const run = hold(loud(), -42, 300);
    expect(run.out.freeze).toBe(false);
  });

  it("does not freeze again during a long silence", () => {
    let run = hold(loud(), -100, 1500);
    run = hold(run, -100, 2000);
    expect(run.out.freeze).toBe(false);
  });
});

describe("a new track", () => {
  it("cheers for about 1.5 s", () => {
    let run = loud();
    run = step(run, -20, { trackChanged: true });
    expect(run.out.cheer).toBe(true);
    run = hold(run, -20, 1000);
    expect(run.out.cheer).toBe(true);
    run = hold(run, -20, 700);
    expect(run.out.cheer).toBe(false);
  });

  it("starts the loudness window over", () => {
    let run = hold(start(), -5, 3000);
    run = step(run, -18, { trackChanged: true });
    run = hold(run, -18, 3000);
    expect(run.out.energy).toBeGreaterThan(0.75);
  });

  it("does not cheer while paused", () => {
    const run = step(loud(), -20, { trackChanged: true, isPlaying: false });
    expect(run.out.cheer).toBe(false);
  });
});

describe("clipping", () => {
  it("covers the front row's ears for one beat and notes it for 2 s", () => {
    let run = loud();
    run = step(run, -3, {}, 0);
    expect(run.out.clip).toBe(true);
    expect(run.out.clipNote).toBe(true);
    run = hold(run, -3, 600);
    expect(run.out.clip).toBe(false);
    expect(run.out.clipNote).toBe(true);
    run = hold(run, -3, CLIP_NOTE_MS);
    expect(run.out.clipNote).toBe(false);
  });

  it("treats a peak under -0.1 dB as no clip", () => {
    const run = step(loud(), -3, {}, -0.2);
    expect(run.out.clip).toBe(false);
    expect(run.out.clipNote).toBe(false);
  });

  it("only extends the note for a clip within 10 s", () => {
    let run = loud();
    run = step(run, -3, {}, 0);
    run = hold(run, -3, 1500);
    expect(run.out.clip).toBe(false);
    run = step(run, -3, {}, 0);
    expect(run.out.clip).toBe(false);
    expect(run.out.clipNote).toBe(true);
    // The note now runs 2 s from the second clip.
    run = hold(run, -3, 1500);
    expect(run.out.clipNote).toBe(true);
    run = hold(run, -3, 700);
    expect(run.out.clipNote).toBe(false);
  });

  it("covers ears again for a clip after 10 s", () => {
    let run = loud();
    run = step(run, -3, {}, 0);
    run = hold(run, -3, 10_500);
    run = step(run, -3, {}, 0);
    expect(run.out.clip).toBe(true);
  });
});

describe("beat deadlines are in time, not in beat positions", () => {
  it("holds a freeze for one beat of time, whatever the position does", () => {
    let run = loud();
    run = step(run, -100);
    expect(run.out.freeze).toBe(true);
    // Seek back a minute: the freeze is not held for the 180 beats it takes to catch up.
    run = hold(run, -100, 600, { positionSec: 5 });
    expect(run.out.freeze).toBe(false);
  });

  it("clears a freeze or covered ears when the position jumps more than 2 s", () => {
    let run = loud();
    run = step(run, -3, {}, 0);
    expect(run.out.clip).toBe(true);
    run = step(run, -3, { positionSec: 1 });
    expect(run.out.clip).toBe(false);
    let frozen = step(loud(), -100);
    expect(frozen.out.freeze).toBe(true);
    frozen = step(frozen, -100, { positionSec: 90 });
    expect(frozen.out.freeze).toBe(false);
  });

  it("holds ears for one beat at the track's tempo", () => {
    let run = loud();
    run = step(run, -3, { beatMs: 1000 }, 0);
    run = hold(run, -3, 700, { beatMs: 1000 });
    expect(run.out.clip).toBe(true);
    run = hold(run, -3, 500, { beatMs: 1000 });
    expect(run.out.clip).toBe(false);
  });
});

describe("pausing in a loud part", () => {
  it("does not freeze or cheer on resume", () => {
    let run = loud();
    run = hold(run, -20, 300, { isPlaying: false });
    // The meter has not spoken yet: no reading, as the player restarts.
    run = hold(run, null, 300);
    expect(run.out.freeze).toBe(false);
    expect(run.out.cheer).toBe(false);
    run = hold(run, -20, 2000);
    expect(run.out.freeze).toBe(false);
    expect(run.out.cheer).toBe(false);
  });

  it("needs a fresh reading before a drop can freeze", () => {
    const run = hold(loud(), null, 3000, { fallbackEnergy: 0 });
    // Readings stopped (no meter): the waveform alone never freezes the crowd.
    expect(run.out.freeze).toBe(false);
  });
});

describe("the DJ's cues", () => {
  it("calls a drop, for about two seconds, when the energy jumps from under half to over 85%", () => {
    let run = hold(start(), -20, 4000);
    run = hold(run, -45, 3000); // a breakdown: energy well under 0.5
    expect(run.out.energy).toBeLessThan(0.5);
    expect(run.out.drop).toBe(false);
    run = hold(run, -20, 600);
    expect(run.out.drop).toBe(true);
    run = hold(run, -20, 1000);
    expect(run.out.drop).toBe(true);
    run = hold(run, -20, 1500);
    expect(run.out.drop).toBe(false);
  });

  it("does not call a drop for a plain loud passage, nor for a slow climb", () => {
    expect(hold(loud(), -20, 3000).out.drop).toBe(false);
    let run = hold(start(), -20, 4000);
    run = hold(run, -45, 3000);
    // Climbs 1 dB every 100 ms steps of 500 ms: over 85% only long after it was under half.
    let dropped = false;
    for (let db = -45; db <= -20; db += 1) {
      run = hold(run, db, 500);
      dropped = dropped || run.out.drop;
    }
    expect(dropped).toBe(false);
  });

  it("calls a build while the energy is rising short of a drop, and not on a plateau", () => {
    let run = hold(start(), -20, 4000);
    run = hold(run, -45, 3000);
    let built = false;
    for (let db = -45; db <= -28; db += 1) {
      run = hold(run, db, 500);
      built = built || run.out.build;
    }
    expect(built).toBe(true);
    expect(hold(loud(), -20, 6000).out.build).toBe(false);
  });

  it("calls no drop when playing begins on a loud part: a play, a resume or a new track", () => {
    const seen = (run: Run, ms: number, rms: number, extra: Partial<CrowdInput> = {}) => {
      let at = run;
      let drop = false;
      for (let t = 0; t < ms; t += STEP) {
        at = step(at, rms, extra);
        drop = drop || at.out.drop;
      }
      return { at, drop };
    };
    // A fresh start straight into a loud part.
    expect(seen(start(), 6000, -20).drop).toBe(false);
    // A resume after a pause.
    const paused = hold(loud(), -20, 500, { isPlaying: false });
    expect(seen(paused, 6000, -20).drop).toBe(false);
    // A new track that starts loud.
    expect(seen(loud(), 6000, -20, { trackChanged: true }).drop).toBe(false);
  });

  it("still calls a real drop after the warm-up: quiet, then loud", () => {
    let run = hold(start(), -45, 4000);
    run = hold(run, -20, 600);
    expect(run.out.drop).toBe(true);
  });

  it("calls no drop or build during the 3 s after playing begins", () => {
    let run = start();
    let any = false;
    for (let t = 0; t < WARMUP_MS - STEP; t += STEP) {
      run = step(run, t < 1500 ? -45 : -20);
      any = any || run.out.drop || run.out.build;
    }
    expect(any).toBe(false);
  });

  it("holds a steady kick plateau without a build flickering on and off", () => {
    // A kick every 500 ms: loud for 100 ms, quieter between.
    let run = hold(start(), -20, 5000);
    let last = run.out.build;
    let changes = 0;
    for (let t = 0; t < 20_000; t += STEP) {
      run = step(run, (t / STEP) % 5 === 0 ? -20 : -28);
      if (run.out.build !== last) {
        changes += 1;
        last = run.out.build;
      }
    }
    expect(changes).toBeLessThanOrEqual(2);
  });

  it("has no drop or build when paused", () => {
    const run = hold(loud(), -20, 500, { isPlaying: false });
    expect(run.out.drop).toBe(false);
    expect(run.out.build).toBe(false);
  });
});
