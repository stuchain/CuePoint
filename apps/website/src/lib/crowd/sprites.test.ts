import { describe, expect, it } from "vitest";
import { CROWD_COUNT, CROWD_SEED, drawCrowd, drawDancer, makeCrowd, moveFor, poseFor, type Dancer } from "./sprites";

interface Call {
  x: number;
  y: number;
  w: number;
  h: number;
  colour: string;
}

function fakeCtx() {
  const calls: Call[] = [];
  const ctx = {
    fillStyle: "",
    clearRect: () => undefined,
    fillRect(x: number, y: number, w: number, h: number) {
      calls.push({ x, y, w, h, colour: String(this.fillStyle) });
    },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

describe("the crowd", () => {
  it("is the same crowd for the same seed", () => {
    const a = makeCrowd(CROWD_COUNT, 240, 3, CROWD_SEED, 30, 44);
    const b = makeCrowd(CROWD_COUNT, 240, 3, CROWD_SEED, 30, 44);
    expect(a).toEqual(b);
    expect(a).toHaveLength(24);
  });

  it("is another crowd for another seed", () => {
    const a = makeCrowd(CROWD_COUNT, 240, 3, 1, 30, 44);
    const b = makeCrowd(CROWD_COUNT, 240, 3, 2, 30, 44);
    expect(a).not.toEqual(b);
  });

  it("stands inside the strip, back row first, every row filled", () => {
    const crowd = makeCrowd(CROWD_COUNT, 130, 3, CROWD_SEED, 30, 44);
    for (const d of crowd) {
      expect(d.x).toBeGreaterThanOrEqual(2);
      expect(d.x + 8).toBeLessThanOrEqual(130);
      expect(d.y).toBeGreaterThanOrEqual(30);
      expect(d.y).toBeLessThanOrEqual(44);
    }
    for (let i = 1; i < crowd.length; i += 1) expect((crowd[i] as Dancer).y).toBeGreaterThanOrEqual((crowd[i - 1] as Dancer).y);
    expect(new Set(crowd.map((d) => d.row)).size).toBe(3);
  });

  it("keeps skin, hair and shirts to the fixed palettes (the same in every theme)", () => {
    const crowd = makeCrowd(CROWD_COUNT, 240, 3, CROWD_SEED, 30, 44);
    for (const d of crowd) {
      expect(d.skin).toMatch(/^#[0-9a-f]{6}$/);
      expect(d.shirt).toMatch(/^#[0-9a-f]{6}$/);
      expect(d.hair).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});

describe("a dancer", () => {
  const d = makeCrowd(CROWD_COUNT, 240, 3, CROWD_SEED, 30, 44)[0] as Dancer;

  it("draws the same pixels for the same moment", () => {
    const one = fakeCtx();
    const two = fakeCtx();
    drawDancer(one.ctx, d, "up", 1, { move: "jump", beat: 5, phase: 0.3 });
    drawDancer(two.ctx, d, "up", 1, { move: "jump", beat: 5, phase: 0.3 });
    expect(one.calls).toEqual(two.calls);
    expect(one.calls.length).toBeGreaterThan(8);
  });

  it("jumps higher than it stands, and hands up reach above the head", () => {
    const flat = fakeCtx();
    const high = fakeCtx();
    const lead = { ...d, off: 0, style: 0 };
    drawDancer(flat.ctx, lead, "down", 1, { move: "idle" });
    drawDancer(high.ctx, lead, "up", 1, { move: "jump", beat: 0, phase: 0.5 });
    const top = (calls: Call[]) => Math.min(...calls.map((c) => c.y));
    expect(top(high.calls)).toBeLessThan(top(flat.calls));
  });

  it("picks arms by move: calm keeps them down, a drop raises them", () => {
    const poses = (move: "sway" | "jump") => new Set([0, 1, 2, 3].map((beat) => poseFor(d, move, beat)));
    expect(poses("sway")).toEqual(new Set(["down", "out"]));
    expect(poses("jump").has("up")).toBe(true);
    expect(poses("jump").has("down")).toBe(false);
  });

  it("lets some dancers step instead of bob", () => {
    expect(moveFor({ ...d, style: 1 }, "bob")).toBe("step");
    expect(moveFor({ ...d, style: 0 }, "bob")).toBe("bob");
    expect(moveFor({ ...d, style: 1 }, "jump")).toBe("jump");
  });
});

describe("a frame", () => {
  it("draws the whole crowd, and the same frame twice", () => {
    const crowd = makeCrowd(CROWD_COUNT, 240, 3, CROWD_SEED, 30, 44);
    const a = fakeCtx();
    const b = fakeCtx();
    drawCrowd(a.ctx, crowd, 10, 240, 48);
    drawCrowd(b.ctx, crowd, 10, 240, 48);
    expect(a.calls).toEqual(b.calls);
    expect(a.calls.length).toBeGreaterThan(CROWD_COUNT * 8);
  });
});
