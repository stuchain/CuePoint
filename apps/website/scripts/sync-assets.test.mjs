import { readFileSync } from "node:fs";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { SOURCE, TARGET, optimizeMark } from "./sync-assets.mjs";

const source = readFileSync(SOURCE, "utf8");
const optimized = optimizeMark(source);

async function raster(svg, size) {
  const { data, info } = await sharp(Buffer.from(svg), { density: 72 * (size / 32) })
    .resize(size, size, { kernel: "nearest" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, info };
}

describe("optimized mark", () => {
  it("is much smaller than the source and keeps viewBox and crispEdges", () => {
    expect(optimized.length).toBeLessThan(source.length / 3);
    expect(optimized).toContain('viewBox="0 0 32 32"');
    expect(optimized).toContain('shape-rendering="crispEdges"');
  });

  it.each([32, 128])("rasterizes pixel-identical to the source at %ipx", async (size) => {
    const a = await raster(source, size);
    const b = await raster(optimized, size);
    expect(b.info.width).toBe(size);
    expect(Buffer.compare(a.data, b.data)).toBe(0);
  });

  it("the committed src/assets/mark/mark-32.svg is up to date with the source (drift fails)", () => {
    expect(readFileSync(TARGET, "utf8")).toBe(optimized);
  });
});

describe("favicon set", () => {
  it("copies the app's icons and draws the 192 px icon on whole cells", async () => {
    const { mkdtempSync, readFileSync: read, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { syncIcons } = await import("./sync-assets.mjs");
    const dir = mkdtempSync(join(tmpdir(), "icons-"));
    try {
      await syncIcons(optimized, dir);
      expect(read(join(dir, "icon.svg"), "utf8")).toBe(optimized);
      expect(read(join(dir, "favicon.ico")).subarray(0, 4)).toEqual(Buffer.from([0, 0, 1, 0]));
      const big = await sharp(join(dir, "icon-512.png")).metadata();
      expect([big.width, big.height]).toEqual([512, 512]);
      const small = await sharp(join(dir, "icon-192.png")).metadata();
      expect([small.width, small.height]).toEqual([192, 192]);
      expect(read(join(dir, "apple-touch-icon.png"))).toEqual(read(join(dir, "icon-192.png")));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
