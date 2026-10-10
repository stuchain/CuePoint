/**
 * The app's pixel font ships inside the app (DEC-232): no stylesheet, script or page asks a font
 * service for it, every weight the stylesheets use is imported, and the bundled family is the one
 * `--font-pixel` names. jsdom loads no fonts, so this reads the sources as text.
 */
import { describe, expect, it } from "vitest";
// Resolves only when the package is installed; the family is read from the file the app imports.
import pixelify400 from "@fontsource/pixelify-sans/400.css?raw";
import { stripComments } from "../test/cssRules";

const SOURCES = import.meta.glob<string>(
  ["../**/*.{css,ts,tsx}", "../../index.html", "../../.storybook/*.ts"],
  { query: "?raw", import: "default", eager: true },
);

const STYLESHEETS = import.meta.glob<string>("../**/*.css", {
  query: "?raw",
  import: "default",
  eager: true,
});

/** A stylesheet of this folder: the glob keys it as "./name" from here. */
const sheet = (name: string): string => STYLESHEETS[`./${name}`] ?? "";

// Built from pieces so this file does not match its own search.
const FONT_HOSTS = new RegExp(["fonts\\.(google", "gstatic)\\.com"].join("apis|"));

describe("bundled pixel font", () => {
  it("no renderer source asks Google Fonts for anything", () => {
    const offenders = Object.entries(SOURCES)
      .filter(([, text]) => FONT_HOSTS.test(text))
      .map(([file]) => file);
    expect(offenders).toEqual([]);
  });

  it("imports every font weight the stylesheets use", () => {
    const used = new Set<string>(["400", "700"]); // body text, and default bold elements
    for (const css of Object.values(STYLESHEETS)) {
      for (const m of stripComments(css).matchAll(/font-weight:\s*([a-z0-9]+)/gi)) {
        const value = m[1].toLowerCase();
        if (value === "bold") used.add("700");
        else if (value === "normal") used.add("400");
        else if (/^\d+$/.test(value)) used.add(value);
      }
    }
    const fontsCss = stripComments(sheet("fonts.css"));
    const imported = new Set(
      [...fontsCss.matchAll(/@import\s+["']@fontsource\/pixelify-sans\/(\d+)\.css["']/g)].map((m) => m[1]),
    );
    expect([...used].sort()).toEqual([...imported].sort());
  });

  it("the bundled family is the first family of --font-pixel", () => {
    const tokens = sheet("tokens.css");
    const pixel = /--font-pixel:\s*"([^"]+)"/.exec(tokens)?.[1];
    const bundled = /font-family:\s*['"]?([^'";]+)['"]?\s*;/.exec(pixelify400)?.[1];
    expect(pixel).toBe("Pixelify Sans");
    expect(bundled).toBe(pixel);
  });
});
