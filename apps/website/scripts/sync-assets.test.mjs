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
