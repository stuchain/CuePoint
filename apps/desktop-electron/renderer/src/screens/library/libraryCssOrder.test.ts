/**
 * The Library's sheet must come after the shared screens sheet in the bundle: `.library-screen--browser`
 * and `.screen` have the same specificity, so the later one wins `display`. A bundle puts a sheet where
 * it is first imported, so every module that imports library.css imports screens.css just before it.
 * When Clean's Missing files view began to import the refresh dialog (and its library.css) first, the
 * Library page became a flex column and its table stopped half way down the window (e2e libraryPage).
 */
import { describe, expect, it } from "vitest";

const SOURCES = import.meta.glob<string>("../../**/*.tsx", { query: "?raw", import: "default", eager: true });

describe("library.css comes after screens.css wherever it is imported", () => {
  it("imports screens.css before library.css in every module that imports library.css", () => {
    const importers = Object.entries(SOURCES).filter(
      ([path, source]) => !path.includes(".test.") && /import "(?:\.\/|\.\.\/library\/)library\.css";/.test(source),
    );
    expect(importers.length).toBeGreaterThan(0);
    for (const [path, source] of importers) {
      const screens = source.search(/import "\.\.\/(?:\.\.\/screens\/)?screens\.css";/);
      const library = source.search(/import "(?:\.\/|\.\.\/library\/)library\.css";/);
      expect(screens, `${path} imports screens.css`).toBeGreaterThanOrEqual(0);
      expect(screens, `${path} imports screens.css before library.css`).toBeLessThan(library);
    }
  });
});
