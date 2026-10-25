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

describe("bundled Inter", () => {
  it("imports every weight the --font-weight-* tokens name, so no OS falls back to its own sans", () => {
    const tokens = stripComments(sheet("tokens.css"));
    const weights = [...tokens.matchAll(/--font-weight-[a-z]+:\s*(\d+)/g)].map((m) => m[1]);
    expect(weights.sort()).toEqual(["400", "500", "600", "700"]);
    const fontsCss = stripComments(sheet("fonts.css"));
    for (const weight of weights) {
      expect(fontsCss).toContain(`@fontsource/inter/latin-${weight}.css`);
      expect(fontsCss).toContain(`@fontsource/inter/latin-ext-${weight}.css`);
    }
  });

  it("the bundled family is the first family of --font-data", () => {
    const data = /--font-data:\s*"([^"]+)"/.exec(sheet("tokens.css"))?.[1];
    expect(data).toBe("Inter");
  });
});

describe("key signs font", () => {
  it("covers exactly the flat and sharp signs, from files bundled with the app", () => {
    const css = stripComments(sheet("fonts.css"));
    const faces = css.match(/@font-face\s*\{[^}]*key-signs[^}]*\}/g) ?? [];
    expect(faces).toHaveLength(2);
    for (const face of faces) {
      expect(face).toMatch(/unicode-range:\s*U\+266D,\s*U\+266F;/);
      expect(face).toMatch(/url\("\.\.\/assets\/fonts\/cuepoint-key-signs-\d+\.woff2"\)/);
      expect(face).not.toMatch(/https?:/);
    }
  });
});
