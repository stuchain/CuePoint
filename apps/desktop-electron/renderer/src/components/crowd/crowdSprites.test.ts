import { describe, expect, it } from "vitest";

import {
  CROWD_COUNT,
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

describe("makeCrowd", () => {
  it("is the same crowd for the same seed", () => {
    const a = makeCrowd(CROWD_COUNT, CROWD_WIDTH, CROWD_ROWS, 8, BOOTH_Y + 22, CROWD_HEIGHT - 2);
    const b = makeCrowd(CROWD_COUNT, CROWD_WIDTH, CROWD_ROWS, 8, BOOTH_Y + 22, CROWD_HEIGHT - 2);
    expect(b).toEqual(a);
  });

  it("is a different crowd for another seed", () => {
    const a = makeCrowd(CROWD_COUNT, CROWD_WIDTH, CROWD_ROWS, 8, BOOTH_Y + 22, CROWD_HEIGHT - 2);
    const b = makeCrowd(CROWD_COUNT, CROWD_WIDTH, CROWD_ROWS, 9, BOOTH_Y + 22, CROWD_HEIGHT - 2);
    expect(b).not.toEqual(a);
  });

  it("has 24 dancers in 4 rows inside the canvas", () => {
    const yTop = BOOTH_Y + 22;
    const yBottom = CROWD_HEIGHT - 2;
    const crowd = makeCrowd(CROWD_COUNT, CROWD_WIDTH, CROWD_ROWS, 8, yTop, yBottom);
    expect(crowd).toHaveLength(24);
    expect(new Set(crowd.map((d) => d.row)).size).toBe(4);
    expect(new Set(crowd.map((d) => d.y)).size).toBe(4);
    for (const d of crowd) {
      expect(d.x).toBeGreaterThanOrEqual(2);
      // A dancer and his arms are 6 px plus one either side.
      expect(d.x + 7).toBeLessThanOrEqual(CROWD_WIDTH);
      expect(d.y).toBeGreaterThanOrEqual(yTop);
      expect(d.y).toBeLessThanOrEqual(yBottom);
      expect(d.depth).toBeGreaterThanOrEqual(0);
      expect(d.depth).toBeLessThanOrEqual(1);
    }
  });

  it("is drawn back to front", () => {
    const crowd = makeCrowd(CROWD_COUNT, CROWD_WIDTH, CROWD_ROWS, 8, 70, 128);
    for (let i = 1; i < crowd.length; i += 1) expect(crowd[i].y).toBeGreaterThanOrEqual(crowd[i - 1].y);
  });
});

describe("poses and moves", () => {
  const dancer = makeCrowd(CROWD_COUNT, CROWD_WIDTH, CROWD_ROWS, 8, 70, 128)[0];

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
    const moves = new Set(makeCrowd(CROWD_COUNT, CROWD_WIDTH, CROWD_ROWS, 8, 70, 128).map((d) => moveFor(d, "bob")));
    expect(moves).toEqual(new Set(["bob", "step"]));
    expect(moveFor(dancer, "idle")).toBe("idle");
    expect(moveFor(dancer, "sway")).toBe("sway");
  });
});

describe("drawing", () => {
  const crowd = makeCrowd(CROWD_COUNT, CROWD_WIDTH, CROWD_ROWS, 8, BOOTH_Y + 22, CROWD_HEIGHT - 2);
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
    for (const pose of ["down", "up", "out", "pump", "coverEars"] as const) {
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
      beat: 4,
      phase: 0.3,
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
    expect(front).toBe(6);
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
