import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readManifest, sceneNames, sourceFiles, sourceHash, stillPath, stillProblems, stillStem, themeIds, threeVersion, variantsOf } from "./stills-lib.mjs";

describe("the scene stills (SITE-05)", () => {
  it("finds the scenes and the five themes", () => {
    expect(sceneNames()).toContain("cubes");
    expect(themeIds()).toEqual(["neoDark", "retro16", "qtEvolved", "clubNeon", "mutedPro"]);
  });

  it("has a still for every scene in every theme, each a PNG", () => {
    for (const scene of sceneNames()) {
      for (const theme of themeIds()) {
        const bytes = readFileSync(stillPath(scene, theme));
        expect(bytes.subarray(1, 4).toString("ascii"), `${scene}-${theme}.png`).toBe("PNG");
      }
    }
  });

  it("records a source hash that matches each scene's source (render again with `npm run stills` if not)", () => {
    expect(stillProblems()).toEqual([]);
  });

  it("hashes the scene's own source, the pixel look and the theme tokens", () => {
    const files = sourceFiles("cubes");
    expect(files).toContain("src/three/scenes/cubes.ts");
    expect(files).toContain("src/three/pixel.ts");
    expect(files).toContain("src/styles/tokens.generated.css");
  });

  it("also covers the three.js version and the render script", () => {
    expect(sourceFiles("cubes")).toContain("scripts/stills.mjs");
    expect(threeVersion()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("is 320 x 180 pixels, one still pixel per scene pixel", () => {
    const png = readFileSync(stillPath("cubes", "neoDark"));
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([320, 180]);
  });

  it("has each scene's named frames and tall stills too, a tall one 180 x 320 (SITE-06)", () => {
    expect(variantsOf("cubes")).toEqual([{ frame: undefined, tall: false }]);
    expect(variantsOf("opening")).toHaveLength(6); // rest, matched, ready; each wide and tall
    expect(stillStem("opening", { frame: "matched", tall: true })).toBe("opening-matched-tall");
    for (const variant of variantsOf("opening")) {
      for (const theme of themeIds()) {
        const png = readFileSync(stillPath("opening", theme, variant));
        const size = [png.readUInt32BE(16), png.readUInt32BE(20)];
        expect(size, `${stillStem("opening", variant)}-${theme}`).toEqual(variant.tall ? [180, 320] : [320, 180]);
      }
    }
  });

  it("is a SHA-256 hex digest and changes with the scene", () => {
    expect(sourceHash("cubes")).toMatch(/^[0-9a-f]{64}$/);
    expect(createHash("sha256").update("a").digest("hex")).not.toBe(sourceHash("cubes"));
    expect(readManifest()["cubes"].sourceHash).toBe(sourceHash("cubes"));
  });
});
