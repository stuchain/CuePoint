import { describe, expect, it, vi } from "vitest";

import {
  BEAM_ALPHA_MAX,
  CROWD_COUNT_MAX,
  clubLayout,
  createBackdropCache,
  CROWD_COUNT,
  crowdCountFor,
  beatPulse,
  djCue,
  favouriteFor,
  CROWD_HEIGHT,
  CROWD_ROWS,
  CROWD_WIDTH,
  BOOTH_Y,
  drawClub,
  drawDancer,
  makeCrowd,
  moveFor,
  paletteFrom,
  poseFor,
  type ClubScene,
} from "./crowdSprites";
import { makeContextMock } from "./crowd.testFixture";

const Y_TOP = BOOTH_Y + 22;
const Y_BOTTOM = CROWD_HEIGHT - 2;

describe("makeCrowd (a packed crowd)", () => {
  it("is the same crowd for the same seed and width", () => {
    expect(makeCrowd(CROWD_WIDTH, 8, Y_TOP, Y_BOTTOM)).toEqual(makeCrowd(CROWD_WIDTH, 8, Y_TOP, Y_BOTTOM));
    expect(makeCrowd(400, 8, Y_TOP, Y_BOTTOM)).toEqual(makeCrowd(400, 8, Y_TOP, Y_BOTTOM));
  });

  it("is a different crowd for another seed", () => {
    expect(makeCrowd(CROWD_WIDTH, 9, Y_TOP, Y_BOTTOM)).not.toEqual(makeCrowd(CROWD_WIDTH, 8, Y_TOP, Y_BOTTOM));
  });

  it("has 36 dancers on the narrowest floor and more as the floor widens", () => {
    expect(makeCrowd(CROWD_WIDTH, 8, Y_TOP, Y_BOTTOM)).toHaveLength(CROWD_COUNT);
    expect(CROWD_COUNT).toBe(36);
    const counts = [232, 320, 450, 640].map((w) => makeCrowd(w, 8, Y_TOP, Y_BOTTOM).length);
    expect(counts).toEqual([...counts].sort((a, b) => a - b));
    expect(counts[3]).toBeGreaterThan(counts[0] * 2);
    expect(crowdCountFor(464)).toBe(72);
  });

  it("holds more dancers on a deeper floor, up to a cap", () => {
    expect(crowdCountFor(232, 58)).toBe(36);
    expect(crowdCountFor(232, 116)).toBe(72);
    expect(crowdCountFor(464, 116)).toBe(144);
    expect(crowdCountFor(640, 300)).toBe(CROWD_COUNT_MAX);
    const short = clubLayout(464, 130);
    const tall = clubLayout(464, 260);
    expect(makeCrowd(464, 8, tall.yTop, tall.yBottom).length).toBeGreaterThan(makeCrowd(464, 8, short.yTop, short.yBottom).length * 1.5);
  });

  it("keeps every dancer inside a club of any size", () => {
    for (const [width, height] of [[232, 130], [300, 200], [464, 260], [640, 360]]) {
      const { yTop, yBottom } = clubLayout(width, height);
      for (const d of makeCrowd(width, 8, yTop, yBottom)) {
        expect(d.x).toBeGreaterThanOrEqual(2);
        expect(d.x + 7).toBeLessThanOrEqual(width);
        expect(d.y).toBeGreaterThanOrEqual(yTop);
        expect(d.y).toBeLessThanOrEqual(yBottom);
        expect(d.y).toBeLessThan(height);
      }
    }
  });

  it("keeps every dancer, with arms, inside the floor and between the booth and the bottom edge", () => {
    for (const width of [232, 300, 464, 640]) {
      for (const d of makeCrowd(width, 8, Y_TOP, Y_BOTTOM)) {
        expect(d.x).toBeGreaterThanOrEqual(2);
        // A dancer and his arms are 6 px plus one either side.
        expect(d.x + 7).toBeLessThanOrEqual(width);
        expect(d.y).toBeGreaterThanOrEqual(Y_TOP);
        expect(d.y).toBeLessThanOrEqual(Y_BOTTOM);
        expect(d.depth).toBeGreaterThanOrEqual(0);
        expect(d.depth).toBeLessThanOrEqual(1);
        expect(d.row).toBeGreaterThanOrEqual(0);
        expect(d.row).toBeLessThan(CROWD_ROWS);
      }
    }
  });

  it("bunches dancers in front of the booth, thinning to the sides", () => {
    const width = 464;
    const crowd = makeCrowd(width, 8, Y_TOP, Y_BOTTOM);
    const middle = crowd.filter((d) => Math.abs(d.x + 3 - width / 2) < width / 4).length;
    expect(middle / crowd.length).toBeGreaterThan(0.65);
    // The back is narrower than the front.
    const spread = (list: typeof crowd) => Math.max(...list.map((d) => d.x)) - Math.min(...list.map((d) => d.x));
    const back = crowd.filter((d) => d.row === 0);
    const front = crowd.filter((d) => d.row === CROWD_ROWS - 1);
    expect(back.length).toBeGreaterThan(0);
    expect(front.length).toBeGreaterThan(0);
    expect(spread(back)).toBeLessThan(spread(front));
  });

  it("is drawn back to front, and the nearest band is the front row", () => {
    const crowd = makeCrowd(CROWD_WIDTH, 8, Y_TOP, Y_BOTTOM);
    for (let i = 1; i < crowd.length; i += 1) expect(crowd[i].y).toBeGreaterThanOrEqual(crowd[i - 1].y);
    for (const d of crowd) expect(d.row === CROWD_ROWS - 1).toBe(d.depth >= 0.75);
  });

  it("gives every dancer a seeded favourite move, all four used", () => {
    const crowd = makeCrowd(CROWD_WIDTH, 8, Y_TOP, Y_BOTTOM);
    expect(new Set(crowd.map((d) => d.fav))).toEqual(new Set(["clap", "step", "hop", "turn"]));
    expect(makeCrowd(CROWD_WIDTH, 8, Y_TOP, Y_BOTTOM).map((d) => d.fav)).toEqual(crowd.map((d) => d.fav));
  });
});

describe("clubLayout", () => {
  it("is the original layout at 232 x 130", () => {
    expect(clubLayout(232, 130)).toEqual({ boothY: 48, floorY: 58, yTop: 70, yBottom: 128 });
  });

  it("moves the booth down by 35% of the extra height and runs the floor to the bottom edge", () => {
    const l = clubLayout(400, 360);
    expect(l.boothY).toBe(48 + Math.round(230 * 0.35));
    expect(l.floorY).toBe(l.boothY + 10);
    expect(l.yTop).toBe(l.boothY + 22);
    expect(l.yBottom).toBe(358);
    expect(l.yTop).toBeLessThan(l.yBottom);
  });
});

describe("poses and moves", () => {
  const dancer = makeCrowd(CROWD_WIDTH, 8, 70, 128)[0];

  it("hands up while cheering", () => {
    expect(poseFor(dancer, { move: "bob", cheer: true, ears: false, beat: 3 })).toBe("up");
  });

  it("covers ears only in the front row", () => {
    const front = { ...dancer, row: CROWD_ROWS - 1 };
    const back = { ...dancer, row: 0 };
    expect(poseFor(front, { move: "jump", cheer: false, ears: true, beat: 0 })).toBe("coverEars");
    expect(poseFor(back, { move: "jump", cheer: false, ears: true, beat: 0 })).not.toBe("coverEars");
  });

  it("stands with arms down when idle", () => {
    expect(poseFor(dancer, { move: "idle", cheer: false, ears: false, beat: 5 })).toBe("down");
  });

  it("uses a pose from the set for each move", () => {
    const poses = new Set(["down", "up", "out", "pump", "coverEars"]);
    for (const move of ["idle", "sway", "bob", "jump"] as const) {
      for (let beat = 0; beat < 8; beat += 1) {
        expect(poses.has(poseFor(dancer, { move, cheer: false, ears: false, beat }))).toBe(true);
      }
    }
  });

  it("gives some dancers the step in place of the bob", () => {
    const moves = new Set(makeCrowd(CROWD_WIDTH, 8, 70, 128).map((d) => moveFor(d, "bob")));
    expect(moves).toEqual(new Set(["bob", "step"]));
    expect(moveFor(dancer, "idle")).toBe("idle");
    expect(moveFor(dancer, "sway")).toBe("sway");
  });
});

describe("drawing", () => {
  const crowd = makeCrowd(CROWD_WIDTH, 8, Y_TOP, Y_BOTTOM);
  const palette = paletteFrom({ accent: "#9164f6", bgApp: "#18181b", warning: "#eab308" });

  it("derives a dark palette from the theme's accent and background", () => {
    expect(palette.boothHi).toBe("#9164f6");
    expect(palette.beam).toBe("#9164f6");
    expect(palette.beam2).not.toBe(palette.beam);
    expect(palette.sky[0]).toMatch(/^rgb\(/);
  });

  it("takes the warning colour from the theme, and precomputes the floor tile", () => {
    expect(palette.warning).toBe("#eab308");
    expect(palette.floorTile).toMatch(/^rgb\(/);
    expect(paletteFrom({ accent: "#9164f6", bgApp: "#18181b" }).warning).toMatch(/^#|^rgb/);
  });

  it("keeps a usable palette when a token is empty", () => {
    const fallback = paletteFrom({ accent: "", bgApp: "" });
    expect(fallback.beam).toMatch(/^#|^rgb/);
  });

  it("draws a dancer as filled rectangles", () => {
    const { ctx, fills } = makeContextMock();
    drawDancer(ctx, crowd[0], "up", 1);
    expect(fills.length).toBeGreaterThan(8);
  });

  it("draws every pose", () => {
    for (const pose of ["down", "up", "out", "pump", "coverEars", "clap", "decks", "deckUp"] as const) {
      const { ctx, fills } = makeContextMock();
      drawDancer(ctx, crowd[0], pose, 0.7, { beat: 3, phase: 0.2 });
      expect(fills.length).toBeGreaterThan(8);
    }
  });

  function scene(overrides: Partial<ClubScene> = {}): ClubScene {
    return {
      width: CROWD_WIDTH,
      height: CROWD_HEIGHT,
      boothY: BOOTH_Y,
      palette,
      crowd,
      energy: 0.8,
      move: "jump",
      cheer: false,
      freeze: false,
      clip: false,
      clipNote: false,
      drop: false,
      build: false,
      beat: 4,
      phase: 0.3,
      bpm: 124,
      time: 12,
      title: "Strobe",
      ...overrides,
    };
  }

  it("draws the club with every dancer", () => {
    const { ctx, fills } = makeContextMock();
    drawClub(ctx, scene());
    expect(fills.length).toBeGreaterThan(CROWD_COUNT * 8);
  });

  it("draws the title on the booth screen", () => {
    const withTitle = makeContextMock();
    drawClub(withTitle.ctx, scene({ title: "Strobe" }));
    const without = makeContextMock();
    drawClub(without.ctx, scene({ title: "" }));
    expect(withTitle.fills.length).toBeGreaterThan(without.fills.length);
  });

  it("notes clipping on the booth screen in the warning colour, and only then", () => {
    const on = makeContextMock();
    drawClub(on.ctx, scene({ clipNote: true }));
    const off = makeContextMock();
    drawClub(off.ctx, scene({ clipNote: false }));
    const warm = (fills: { colour: string }[]) => fills.filter((f) => f.colour === palette.warning).length;
    expect(warm(on.fills)).toBeGreaterThan(10);
    expect(warm(off.fills)).toBe(0);
  });

  it("covers the front row's ears when the crowd clips", () => {
    const clipped = makeContextMock();
    drawClub(clipped.ctx, scene({ clip: true }));
    const normal = makeContextMock();
    drawClub(normal.ctx, scene({ clip: false }));
    expect(clipped.fills).not.toEqual(normal.fills);
    // Same dancers, so the same number of rectangles but for the arms: only front-row ones change.
    const front = crowd.filter((d) => d.row === CROWD_ROWS - 1).length;
    const changed = clipped.fills.filter((f, i) => JSON.stringify(f) !== JSON.stringify(normal.fills[i])).length;
    expect(changed).toBeGreaterThan(0);
    expect(front).toBeGreaterThan(0);
  });

  it("draws the same frame twice", () => {
    const a = makeContextMock();
    const b = makeContextMock();
    drawClub(a.ctx, scene());
    drawClub(b.ctx, scene());
    expect(b.fills).toEqual(a.fills);
  });

  it("never flashes: the whole canvas is only ever covered once per frame", () => {
    const { ctx, fills } = makeContextMock();
    drawClub(ctx, scene({ energy: 1, cheer: true }));
    const full = fills.filter((f) => f.rect[2] >= CROWD_WIDTH && f.rect[3] >= CROWD_HEIGHT);
    expect(full.length).toBeLessThanOrEqual(1);
  });
});

describe("the lights", () => {
  const crowd = makeCrowd(CROWD_WIDTH, 8, Y_TOP, Y_BOTTOM);
  const palette = paletteFrom({ accent: "#9164f6", bgApp: "#18181b", warning: "#eab308" });
  const base: ClubScene = {
    width: CROWD_WIDTH, height: CROWD_HEIGHT, boothY: BOOTH_Y, palette, crowd,
    energy: 1, move: "jump", cheer: false, freeze: false, clip: false, clipNote: false,
    drop: false, build: false, beat: 4, phase: 0, bpm: 124, time: 3, title: "Strobe",
  };
  const beams = (paths: { style: unknown; alpha: number }[]) =>
    paths.filter((p) => p.style === palette.beam || p.style === palette.beam2);
  const glow = (paths: { style: unknown; alpha: number }[]) =>
    paths.filter((p) => p.style !== palette.beam && p.style !== palette.beam2);

  it("only swells on the beat while the energy is over half, and fades before the next beat", () => {
    expect(beatPulse(0.9, 0, false)).toBe(1);
    expect(beatPulse(0.9, 0.5, false)).toBeCloseTo(0.25);
    expect(beatPulse(0.9, 0.99, false)).toBeLessThan(0.001);
    expect(beatPulse(0.5, 0, false)).toBe(0);
    expect(beatPulse(0.2, 0, false)).toBe(0);
    expect(beatPulse(1, 0, true)).toBe(0);
  });

  it("brightens the beams on the beat, softly, and never over the cap", () => {
    const onBeat = makeContextMock();
    drawClub(onBeat.ctx, { ...base, phase: 0 });
    const between = makeContextMock();
    drawClub(between.ctx, { ...base, phase: 0.95 });
    const top = Math.max(...beams(onBeat.paths).map((p) => p.alpha));
    expect(top).toBeGreaterThan(Math.max(...beams(between.paths).map((p) => p.alpha)));
    for (let phase = 0; phase < 1; phase += 0.05) {
      for (const energy of [0.51, 0.8, 1]) {
        const { ctx, paths } = makeContextMock();
        drawClub(ctx, { ...base, energy, phase });
        for (const p of beams(paths)) expect(p.alpha).toBeLessThanOrEqual(BEAM_ALPHA_MAX);
        for (const p of glow(paths)) expect(p.alpha).toBeLessThanOrEqual(0.4);
      }
    }
    expect(BEAM_ALPHA_MAX).toBeLessThanOrEqual(0.45);
  });

  it("does not pulse in a still frame or when quiet", () => {
    const quiet = makeContextMock();
    drawClub(quiet.ctx, { ...base, energy: 0.4, phase: 0 });
    expect(Math.max(...beams(quiet.paths).map((p) => p.alpha))).toBeCloseTo(0.08 + 0.22 * 0.4);
    const still = makeContextMock();
    drawClub(still.ctx, { ...base, still: true, phase: 0 });
    expect(Math.max(...beams(still.paths).map((p) => p.alpha))).toBeCloseTo(0.08 + 0.22);
  });

  it("glows on the floor under the crowd: 0.10 + 0.22 energy, a little more on the beat", () => {
    const calm = makeContextMock();
    drawClub(calm.ctx, { ...base, energy: 0.3, phase: 0 });
    expect(glow(calm.paths)).toHaveLength(1);
    expect(glow(calm.paths)[0].alpha).toBeCloseTo(0.1 + 0.22 * 0.3);
    const loud = makeContextMock();
    drawClub(loud.ctx, { ...base, energy: 1, phase: 0 });
    expect(glow(loud.paths)[0].alpha).toBeCloseTo(0.1 + 0.22 + 0.08);
  });

  it("has dropped the checkerboard blink: the floor tiles never light", () => {
    const { ctx, fills } = makeContextMock();
    drawClub(ctx, { ...base, beat: 6 });
    expect(fills.some((f) => f.colour === palette.floorHi)).toBe(false);
  });
});

describe("the DJ", () => {
  const play = { move: "jump", still: false, build: false, drop: false, beat: 2, phase: 0.1 } as const;

  it("stands still when paused or caught still: hands on the decks, no nod", () => {
    expect(djCue({ ...play, move: "idle" })).toEqual({ pose: "decks", nod: 0 });
    expect(djCue({ ...play, still: true, drop: true })).toEqual({ pose: "decks", nod: 0 });
  });

  it("nods 1 px for the first 35% of each beat, hands on the decks", () => {
    expect(djCue({ ...play, phase: 0 })).toEqual({ pose: "decks", nod: 1 });
    expect(djCue({ ...play, phase: 0.34 }).nod).toBe(1);
    expect(djCue({ ...play, phase: 0.35 }).nod).toBe(0);
    expect(djCue({ ...play, phase: 0.9 })).toEqual({ pose: "decks", nod: 0 });
  });

  it("puts one hand up on alternate beats while the energy builds", () => {
    expect(djCue({ ...play, build: true, beat: 4 }).pose).toBe("deckUp");
    expect(djCue({ ...play, build: true, beat: 5 }).pose).toBe("decks");
    expect(djCue({ ...play, build: true, beat: 6 }).pose).toBe("deckUp");
  });

  it("puts both hands up when a drop lands", () => {
    expect(djCue({ ...play, drop: true, build: true }).pose).toBe("up");
    expect(djCue({ ...play, drop: true, beat: 3 }).pose).toBe("up");
  });

  const palette = paletteFrom({ accent: "#9164f6", bgApp: "#18181b" });
  const scene = (o: Partial<ClubScene>): ClubScene => ({
    width: CROWD_WIDTH, height: CROWD_HEIGHT, boothY: BOOTH_Y, palette, crowd: [],
    energy: 0.8, move: "jump", cheer: false, freeze: false, clip: false, clipNote: false,
    drop: false, build: false, beat: 4, phase: 0.1, bpm: 124, time: 1, title: "", ...o,
  });
  const djFills = (o: Partial<ClubScene>) => {
    const { ctx, fills } = makeContextMock();
    drawClub(ctx, scene(o));
    // the DJ's shirt and skin: the fixed colours of the one dancer drawn (the crowd is empty)
    return fills.filter((f) => f.rect[1] < BOOTH_Y + 2 && f.rect[1] > BOOTH_Y - 20 && f.colour.startsWith("rgb(") && f.rect[2] <= 6);
  };

  it("draws a different DJ for each state", () => {
    const idle = JSON.stringify(djFills({ move: "idle" }));
    const nod = JSON.stringify(djFills({}));
    const build = JSON.stringify(djFills({ build: true }));
    const drop = JSON.stringify(djFills({ drop: true }));
    expect(new Set([idle, nod, build, drop]).size).toBe(4);
    // A still frame is the idle DJ's even with a drop flagged.
    expect(JSON.stringify(djFills({ still: true, drop: true, phase: 0.1 }))).toBe(
      JSON.stringify(djFills({ still: true, phase: 0.1 })),
    );
  });
});

describe("the booth screen", () => {
  const palette = paletteFrom({ accent: "#9164f6", bgApp: "#18181b" });
  const scene = (o: Partial<ClubScene> = {}): ClubScene => ({
    width: CROWD_WIDTH, height: CROWD_HEIGHT, boothY: BOOTH_Y, palette, crowd: [],
    energy: 0.8, move: "jump", cheer: false, freeze: false, clip: false, clipNote: false,
    drop: false, build: false, beat: 4, phase: 0.1, bpm: 124, time: 1, title: "Strobe", ...o,
  });
  const bw = Math.min(90, Math.round(CROWD_WIDTH * 0.34));
  const bx = Math.round(CROWD_WIDTH / 2 - bw / 2);
  /** The pixels the screen's text is drawn with, by line (the title's line and the tempo's). */
  const text = (o: Partial<ClubScene> = {}) => {
    const { ctx, fills } = makeContextMock();
    drawClub(ctx, scene(o));
    const glyph = (y0: number) => fills.filter((f) => f.colour === palette.boothHi && f.rect[2] === 1 && f.rect[3] === 1 && f.rect[1] >= y0 && f.rect[1] < y0 + 5 && f.rect[0] >= bx + 4);
    return { title: glyph(BOOTH_Y - 2), bpm: glyph(BOOTH_Y + 4), fills };
  };

  it("shows the title on the first line and the BPM under it, dimmer", () => {
    const { title, bpm } = text();
    expect(title.length).toBeGreaterThan(10);
    expect(bpm.length).toBeGreaterThan(10);
    expect(Math.max(...bpm.map((f) => f.alpha))).toBeLessThan(Math.min(...title.map((f) => f.alpha)));
  });

  it("writes the current tempo, rounded: a different BPM is a different line", () => {
    const a = JSON.stringify(text({ bpm: 124 }).bpm.map((f) => f.rect));
    expect(JSON.stringify(text({ bpm: 128 }).bpm.map((f) => f.rect))).not.toBe(a);
    expect(JSON.stringify(text({ bpm: 124.2 }).bpm.map((f) => f.rect))).toBe(a);
  });

  it("steps four dots through the bar, one bright, by beat % 4", () => {
    const dots = (beat: number) => {
      const { fills } = text({ beat });
      return [0, 1, 2, 3].map((i) =>
        fills.find((f) => f.rect[0] === bx + bw - 21 + i * 4 && f.rect[1] === BOOTH_Y + 5 && f.rect[2] === 3 && f.rect[3] === 3),
      );
    };
    for (const beat of [4, 5, 6, 7, 8, 9]) {
      const d = dots(beat);
      expect(d.every((f) => f !== undefined)).toBe(true);
      const bright = d.map((f) => f!.alpha === 1);
      expect(bright.filter(Boolean)).toHaveLength(1);
      expect(bright.indexOf(true)).toBe(beat % 4);
    }
  });

  it("leaves the tempo line and the dots out when there is no track: no title and no tempo", () => {
    const { bpm, fills } = text({ title: "", bpm: null });
    expect(bpm).toHaveLength(0);
    const dot = fills.filter((f) => f.rect[1] === BOOTH_Y + 5 && f.rect[2] === 3 && f.rect[3] === 3);
    expect(dot).toHaveLength(0);
    expect(text({ title: "Strobe", bpm: 124 }).bpm.length).toBeGreaterThan(10);
  });

  it("still truncates a long title to the screen and keeps the BPM", () => {
    const { title, bpm } = text({ title: "A very long track title that does not fit on the booth screen" });
    // Every pixel stays inside the screen (it spans bx + 3 for bw - 6).
    for (const f of title) expect(f.rect[0] + f.rect[2]).toBeLessThanOrEqual(bx + 3 + (bw - 6));
    for (const f of title) expect(f.rect[0]).toBeGreaterThanOrEqual(bx + 3);
    expect(bpm.length).toBeGreaterThan(10);
  });
});

describe("more moves: each dancer's favourite", () => {
  const crowd = makeCrowd(CROWD_WIDTH, 8, Y_TOP, Y_BOTTOM);
  const of = (fav: "clap" | "step" | "hop" | "turn") => ({ ...crowd[0], fav, off: 0 });
  const state = { energy: 0.7, move: "bob", cheer: false, ears: false, beat: 0, phase: 0.5 } as const;

  it("steps 2 px to the side on alternate beats", () => {
    expect(favouriteFor(of("step"), { ...state, beat: 0 }).dx).toBe(0);
    expect(favouriteFor(of("step"), { ...state, beat: 1 }).dx).toBe(2);
    expect(favouriteFor(of("step"), { ...state, beat: 2 }).dx).toBe(0);
    expect(favouriteFor(of("step"), { ...state, beat: 3 }).dx).toBe(2);
  });

  it("hops 2 px on every fourth beat, up and back down", () => {
    expect(favouriteFor(of("hop"), { ...state, beat: 4, phase: 0.5 }).dy).toBe(-2);
    expect(favouriteFor(of("hop"), { ...state, beat: 4, phase: 0 }).dy).toBe(-0);
    expect(favouriteFor(of("hop"), { ...state, beat: 4, phase: 0.99 }).dy).toBe(-0);
    for (const beat of [1, 2, 3, 5, 6, 7]) expect(favouriteFor(of("hop"), { ...state, beat }).dy).toBe(0);
  });

  it("turns its back for 2 beats in every 8", () => {
    const turned = [...Array(16).keys()].map((beat) => favouriteFor(of("turn"), { ...state, beat }).turned);
    expect(turned.filter(Boolean)).toHaveLength(4);
    expect(turned.slice(0, 8)).toEqual([false, false, false, false, false, false, true, true]);
    expect(turned.slice(8)).toEqual(turned.slice(0, 8));
  });

  it("claps over 45% energy, and not below", () => {
    expect(favouriteFor(of("clap"), { ...state, energy: 0.5 }).clap).toBe(true);
    expect(favouriteFor(of("clap"), { ...state, energy: 0.4 }).clap).toBe(false);
  });

  it("does nothing at or under 30% energy, when idle, cheering or covering ears", () => {
    for (const fav of ["clap", "step", "hop", "turn"] as const) {
      for (const beat of [0, 1, 4, 6, 7]) {
        const none = { dx: 0, dy: 0, turned: false, clap: false };
        expect(favouriteFor(of(fav), { ...state, beat, energy: 0.3 })).toEqual(none);
        expect(favouriteFor(of(fav), { ...state, beat, move: "idle" })).toEqual(none);
        expect(favouriteFor(of(fav), { ...state, beat, cheer: true })).toEqual(none);
        expect(favouriteFor(of(fav), { ...state, beat, ears: true })).toEqual(none);
      }
    }
  });

  it("draws the clap with hands apart then meeting, and a turn with hair over the face", () => {
    const d = of("clap");
    const open = makeContextMock();
    drawDancer(open.ctx, d, "clap", 1, { beat: 0, phase: 0.6 });
    const closed = makeContextMock();
    drawDancer(closed.ctx, d, "clap", 1, { beat: 0, phase: 0.1 });
    expect(JSON.stringify(open.fills)).not.toBe(JSON.stringify(closed.fills));
    const plain = makeContextMock();
    drawDancer(plain.ctx, d, "down", 1, { beat: 0, phase: 0.1 });
    const back = makeContextMock();
    drawDancer(back.ctx, d, "down", 1, { beat: 0, phase: 0.1, turned: true });
    expect(back.fills.length).toBe(plain.fills.length + 1);
  });

  it("moves a dancer by the shift", () => {
    const plain = makeContextMock();
    drawDancer(plain.ctx, crowd[0], "down", 1, { beat: 1, phase: 0.1 });
    const shifted = makeContextMock();
    drawDancer(shifted.ctx, crowd[0], "down", 1, { beat: 1, phase: 0.1, shift: { dx: 2, dy: -2 } });
    expect(shifted.fills[0].rect[0]).toBe(plain.fills[0].rect[0] + 2);
    expect(shifted.fills[0].rect[1]).toBe(plain.fills[0].rect[1] - 2);
  });

  const palette = paletteFrom({ accent: "#9164f6", bgApp: "#18181b" });
  const loud: ClubScene = {
    width: CROWD_WIDTH, height: CROWD_HEIGHT, boothY: BOOTH_Y, palette, crowd,
    energy: 0.8, move: "bob", cheer: false, freeze: false, clip: false, clipNote: false,
    drop: false, build: false, beat: 6, phase: 0.5, bpm: 124, time: 1, title: "",
  };
  const frame = (o: Partial<ClubScene>) => {
    const { ctx, fills } = makeContextMock();
    drawClub(ctx, { ...loud, ...o });
    return JSON.stringify(fills);
  };

  it("adds nothing in a still frame, while idle or cheering (the crowd is drawn as the old moves)", () => {
    // With the extras off the same frame comes out for any favourites: give everybody another.
    const swapped = (fav: "clap" | "step" | "hop" | "turn") => crowd.map((d) => ({ ...d, fav }));
    for (const o of [{ still: true }, { move: "idle" as const, energy: 0 }, { cheer: true }, { energy: 0.25 }]) {
      const a = frame({ ...o, crowd: swapped("clap") });
      expect(frame({ ...o, crowd: swapped("step") })).toBe(a);
      expect(frame({ ...o, crowd: swapped("hop") })).toBe(a);
      expect(frame({ ...o, crowd: swapped("turn") })).toBe(a);
    }
    // ... and they do show when the crowd dances.
    const dancing = (fav: "clap" | "step" | "hop" | "turn") => frame({ crowd: crowd.map((d) => ({ ...d, fav })) });
    expect(new Set([dancing("clap"), dancing("step"), dancing("hop"), dancing("turn")]).size).toBeGreaterThan(1);
  });
});

describe("the cached backdrop", () => {
  const palette = paletteFrom({ accent: "#9164f6", bgApp: "#18181b" });
  const crowd = makeCrowd(CROWD_WIDTH, 8, Y_TOP, Y_BOTTOM);
  const scene = (o: Partial<ClubScene> = {}): ClubScene => ({
    width: CROWD_WIDTH, height: CROWD_HEIGHT, boothY: BOOTH_Y, palette, crowd,
    energy: 0.8, move: "bob", cheer: false, freeze: false, clip: false, clipNote: false,
    drop: false, build: false, beat: 4, phase: 0.1, bpm: 124, time: 1, title: "Strobe", ...o,
  });

  function withLayers<T>(run: (layersMade: () => number) => T): T {
    const mock = makeContextMock();
    const spy = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation((() => mock.ctx) as never);
    try {
      return run(() => spy.mock.calls.length);
    } finally {
      spy.mockRestore();
    }
  }

  it("paints the sky and the floor once, and draws them as images each frame", () => {
    withLayers((made) => {
      const cache = createBackdropCache();
      const frame = makeContextMock();
      const draws: unknown[] = [];
      (frame.ctx as unknown as { drawImage: (i: unknown) => void }).drawImage = (i) => draws.push(i);
      drawClub(frame.ctx, scene({ backdrop: cache }));
      expect(made()).toBe(2);
      drawClub(frame.ctx, scene({ backdrop: cache, beat: 5 }));
      drawClub(frame.ctx, scene({ backdrop: cache, beat: 6 }));
      expect(made()).toBe(2);
      expect(draws).toHaveLength(6);
    });
  });

  it("paints them again when the size or the palette changes", () => {
    withLayers((made) => {
      const cache = createBackdropCache();
      const frame = makeContextMock();
      drawClub(frame.ctx, scene({ backdrop: cache }));
      drawClub(frame.ctx, scene({ backdrop: cache, width: 300 }));
      expect(made()).toBe(4);
      drawClub(frame.ctx, scene({ backdrop: cache, width: 300, height: 200, boothY: clubLayout(300, 200).boothY }));
      expect(made()).toBe(6);
      drawClub(frame.ctx, scene({ backdrop: cache, width: 300, height: 200, boothY: clubLayout(300, 200).boothY, palette: paletteFrom({ accent: "#ff0000", bgApp: "#101010" }) }));
      expect(made()).toBe(8);
    });
  });
});
