import type { ImageMetadata } from "astro";
import { describe, expect, it } from "vitest";
import { shotImages, type ShotFiles } from "./app-shots";
import { THEMES } from "./themes";

const img = (name: string): { default: ImageMetadata } => ({ default: { src: `/${name}.png`, width: 1280, height: 800, format: "png" } });

describe("finding a shot's pictures by its id", () => {
  it("finds none when there is no file: the slot is a placeholder", () => {
    expect(shotImages("library", {})).toEqual([]);
    expect(shotImages("library", { "../assets/app/keys-neoDark.png": img("keys-neoDark") })).toEqual([]);
  });

  it("uses the default theme's file for every theme that has none of its own", () => {
    const found = shotImages("library", { "../assets/app/library-neoDark.png": img("a") });
    expect(found.map((f) => f.theme)).toEqual(THEMES.map((t) => t.id));
    expect(new Set(found.map((f) => f.image.src))).toEqual(new Set(["/a.png"]));
  });

  it("gives each theme its own file when there is one", () => {
    const files: ShotFiles = {
      "../assets/app/library-neoDark.png": img("a"),
      "../assets/app/library-clubNeon.webp": img("b"),
    };
    const byTheme = Object.fromEntries(shotImages("library", files).map((f) => [f.theme, f.image.src]));
    expect(byTheme["clubNeon"]).toBe("/b.png");
    expect(byTheme["retro16"]).toBe("/a.png");
  });

  it("does not match a longer id that starts the same way", () => {
    expect(shotImages("library", { "../assets/app/library-details-neoDark.png": img("x") })).toEqual([]);
  });

  it("finds every captured picture in the repository (SITE-04)", () => {
    for (const id of ["window", "clean", "clean-compare", "library", "keys", "discover", "statistics", "prepare", "waveforms", "export"]) {
      expect(shotImages(id).map((f) => f.theme), id).toEqual(THEMES.map((t) => t.id));
    }
  });
});
