/**
 * The page margin: one rule for every page. `.screen` takes it from the layout tokens (through
 * --safe-*), so a page's root adds no side padding of its own and the shell's content region adds
 * none either. Chromium sticks a header at the scrollport edge, not inside the scroller's padding,
 * so a padded content region would leave a band above and beside the sticky header where rows
 * scroll past. The margin therefore sits on `.screen`, and the header's backdrop (::before)
 * covers the band.
 */
import { describe, expect, it } from "vitest";
import layout from "../tokens/layout.css?raw";
import screensCss from "./screens.css?raw";
import shell from "../components/shell/AppShellLayout.css?raw";
import header from "../components/shell/ScreenHeader.css?raw";
import clean from "./clean/clean.css?raw";
import discover from "./discover/discover.css?raw";
import keys from "./keys/keys.css?raw";
import library from "./library/library.css?raw";
import prepare from "./prepare/prepare.css?raw";
import statistics from "./statistics/statistics.css?raw";
import playlists from "./clean/match/playlists.css?raw";
import match from "./clean/match/match.css?raw";
import { declarations, parseRules, stripComments } from "../test/cssRules";

function decls(css: string, selector: string): Record<string, string> {
  const found = parseRules(stripComments(css)).filter((r) => r.selector.trim() === selector);
  expect(found.length, `${selector} exists`).toBeGreaterThan(0);
  return Object.fromEntries(found.flatMap((r) => declarations(r.body)));
}

describe("the shared page margin", () => {
  it("is 12px on every side, scaled, each capped by the region", () => {
    const root = decls(layout, ":root");
    expect(root["--page-gutter-x"]).toBe("min(calc(12px * var(--scale)), 4cqi)");
    expect(root["--page-gutter-top"]).toBe("min(calc(12px * var(--scale)), 3.4cqi)");
    expect(root["--page-gutter-bottom"]).toBe("min(calc(12px * var(--scale)), 3.4cqi)");
    expect(root["--content-max-width"]).toBe("100%");
  });

  it("reaches every page through .screen", () => {
    const screen = decls(layout, ".screen");
    expect(screen["--safe-left"]).toBe("var(--page-gutter-x)");
    expect(screen["--safe-right"]).toBe("var(--page-gutter-x)");
    expect(screen["--safe-top"]).toBe("var(--page-gutter-top)");
    expect(screen["--safe-bottom"]).toBe("var(--page-gutter-bottom)");
    expect(decls(screensCss, ".screen")["padding"]).toBe(
      "var(--safe-top) var(--safe-right) var(--safe-bottom) var(--safe-left)",
    );
  });

  it("is not added a second time by the content region", () => {
    const names = parseRules(stripComments(shell))
      .filter((r) => /\.app-shell__content/.test(r.selector))
      .flatMap((r) => declarations(r.body).map(([name]) => name));
    expect(names.filter((n) => n.startsWith("padding") || n.startsWith("margin"))).toEqual([]);
  });

  it("is not added a second time by a page root", () => {
    const roots: [string, string, string][] = [
      ["clean", clean, ".clean-screen"],
      ["discover", discover, ".discover-screen"],
      ["discover page", discover, ".discover-page"],
      ["keys", keys, ".keys-page"],
      ["library", library, ".library-screen--browser"],
      ["prepare", prepare, ".prepare-screen"],
      ["statistics", statistics, ".statistics-page"],
    ];
    for (const [name, css, selector] of roots) {
      const d = decls(css, selector);
      for (const key of Object.keys(d)) {
        if (!/^(padding|margin)/.test(key)) continue;
        // A page that runs its table to the bottom edge may drop the bottom padding, nothing else.
        expect(key, `${name} root declares ${key}`).toBe("padding-bottom");
        expect(d[key]).toBe("0");
      }
    }
  });

  it("is not added a second time by the unboxed blocks inside a page", () => {
    const blocks: [string, string, string][] = [
      ["discover page header", discover, ".discover-page > .cp-screen-header"],
      ["discover page header block", discover, ".discover-page__header"],
      ["discover half", discover, ".discover-page__half"],
      ["discover toolbar", discover, ".discover-toolbar"],
      ["discover run header", discover, ".discover-run__header"],
      ["discover new body", discover, ".discover-new__body"],
      ["clean playlists", playlists, ".playlists"],
      ["clean match review", match, ".review"],
      ["clean past searches", match, ".match-past"],
      ["clean note", clean, ".clean-note"],
      ["keys top", keys, ".keys-page__top"],
      ["keys actions", keys, ".keys-page__actions"],
      ["keys tracks", keys, ".keys-page__tracks"],
      ["statistics tab", statistics, ".statistics-tabpanel"],
    ];
    for (const [name, css, selector] of blocks) {
      const padding = decls(css, selector)["padding"];
      const parts = padding.trim().split(/\s+(?![^(]*\))/);
      // One value pads the sides too; two or three put the sides second; four put them second and fourth.
      const sides = parts.length === 1 ? [parts[0]] : parts.length === 4 ? [parts[1], parts[3]] : [parts[1]];
      for (const side of sides) expect(side, `${name} side padding`).toBe("0");
    }
  });

  it("is backed by the sticky header's backdrop", () => {
    const d = decls(header, ".cp-screen-header::before");
    expect(d["top"]).toBe("calc(-1 * var(--screen-header-stick, var(--page-gutter-top)))");
    expect(d["left"]).toBe("calc(-1 * var(--page-gutter-x))");
    expect(d["right"]).toBe("calc(-1 * var(--page-gutter-x))");
    expect(decls(header, ".cp-screen-header--inset")["padding-inline"]).toBe("0");
  });
});
