import { describe, expect, it } from "vitest";
import { EARLY_MS, FpsProbe, MIN_FPS, PROBE_MS, blockers, canStart, isSoftwareRenderer, readEnv, type GateEnv } from "./gate";

const clear: GateEnv = {
  webgl2: true,
  reducedMotion: false,
  saveData: false,
  deviceMemory: 8,
  hardwareConcurrency: 8,
};

describe("the start gate", () => {
  it("starts when every condition is clear", () => {
    expect(blockers(clear)).toEqual([]);
    expect(canStart(clear)).toBe(true);
  });

  it("starts when the device does not report its memory or cores", () => {
    const env = { webgl2: true, reducedMotion: false, saveData: false };
    expect(canStart(env)).toBe(true);
  });

  const cases: [string, Partial<GateEnv>, string][] = [
    ["no WebGL 2", { webgl2: false }, "no-webgl2"],
    ["reduced motion", { reducedMotion: true }, "reduced-motion"],
    ["saveData", { saveData: true }, "save-data"],
    ["less than 4 GB of memory", { deviceMemory: 2 }, "low-memory"],
    ["fewer than 4 cores", { hardwareConcurrency: 2 }, "few-cores"],
    ["a software renderer", { softwareGL: true }, "software-gl"],
  ];
  for (const [name, change, reason] of cases) {
    it(`does not start with ${name}`, () => {
      const env = { ...clear, ...change };
      expect(canStart(env)).toBe(false);
      expect(blockers(env)).toEqual([reason]);
    });
  }

  it("allows exactly 4 GB and 4 cores", () => {
    expect(canStart({ ...clear, deviceMemory: 4, hardwareConcurrency: 4 })).toBe(true);
  });

  it("lists every reason at once", () => {
    const env: GateEnv = { webgl2: false, reducedMotion: true, saveData: true, deviceMemory: 1, hardwareConcurrency: 1 };
    expect(blockers(env)).toHaveLength(5);
    expect(blockers({ ...env, softwareGL: true })).toHaveLength(6);
  });
});

describe("isSoftwareRenderer", () => {
  it("names the software renderers", () => {
    for (const name of [
      "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)",
      "llvmpipe (LLVM 15.0.7, 256 bits)",
      "softpipe",
      "Microsoft Basic Render Driver",
      "Apple Software Renderer",
    ])
      expect(isSoftwareRenderer(name), name).toBe(true);
  });
  it("lets real GPUs through", () => {
    for (const name of ["ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0)", "Apple M2", "Adreno (TM) 650", "Mali-G78"])
      expect(isSoftwareRenderer(name), name).toBe(false);
  });
});

describe("readEnv", () => {
  it("reads the browser's own signals", () => {
    const win = {
      matchMedia: (q: string) => ({ matches: q === "(prefers-reduced-motion: reduce)" }),
      navigator: { connection: { saveData: true }, deviceMemory: 2, hardwareConcurrency: 3 },
      WebGL2RenderingContext: function () {},
    };
    expect(readEnv(win as never)).toEqual({
      webgl2: true,
      reducedMotion: true,
      saveData: true,
      deviceMemory: 2,
      hardwareConcurrency: 3,
    });
  });

  it("treats a missing WebGL2RenderingContext as no WebGL and missing signals as clear", () => {
    const win = { matchMedia: () => ({ matches: false }), navigator: {} };
    const env = readEnv(win as never);
    expect(env.webgl2).toBe(false);
    expect(env.saveData).toBe(false);
    expect(env.deviceMemory).toBeUndefined();
  });
});

describe("the two second frame-rate probe", () => {
  function run(fps: number) {
    const probe = new FpsProbe();
    let now = 1000;
    probe.start(now);
    const step = 1000 / fps;
    let verdict = probe.verdict();
    while (verdict === "pending" && now < 20_000) {
      now += step;
      verdict = probe.frame(now);
    }
    return { verdict, at: now - 1000 };
  }

  it("passes at 60 fps after two seconds", () => {
    const r = run(60);
    expect(r.verdict).toBe("pass");
    expect(r.at).toBeGreaterThanOrEqual(PROBE_MS);
  });

  it("passes just above the floor", () => {
    expect(run(MIN_FPS + 2).verdict).toBe("pass");
  });

  it("fails below 30 fps", () => {
    expect(run(20).verdict).toBe("fail");
  });

  it("is still pending before two seconds", () => {
    const p = new FpsProbe();
    p.start(0);
    for (let t = 16; t <= 1500; t += 16) expect(p.frame(t)).toBe("pending");
  });

  it("stops early when it is clearly slow", () => {
    const r = run(10);
    expect(r.verdict).toBe("fail");
    expect(r.at).toBeLessThan(EARLY_MS + 150);
  });

  it("stops early after three long frames in a row", () => {
    const p = new FpsProbe();
    p.start(0);
    let t = 0;
    const out = [16, 16, 80, 80, 80].map((d) => p.frame((t += d)));
    expect(out.at(-1)).toBe("fail");
    expect(out.slice(0, 4)).not.toContain("fail");
  });

  it("does not stop for long frames that are not in a row", () => {
    const p = new FpsProbe();
    p.start(0);
    let t = 0;
    for (const d of [80, 80, 16, 80, 80, 16]) expect(p.frame((t += d))).toBe("pending");
  });

  it("with a lowered floor, neither early rule applies", () => {
    const p = new FpsProbe(1);
    p.start(0);
    let t = 0;
    let v = p.verdict();
    while (v === "pending" && t < 5000) v = p.frame((t += 90));
    expect(v).toBe("pass");
  });

  it("restarts after a long gap, such as a hidden tab", () => {
    const p = new FpsProbe();
    p.start(0);
    p.frame(16);
    expect(p.frame(30_000)).toBe("pending");
    let v = p.verdict();
    let t = 30_000;
    while (v === "pending" && t < 40_000) v = p.frame((t += 16.6));
    expect(v).toBe("pass");
  });
});
