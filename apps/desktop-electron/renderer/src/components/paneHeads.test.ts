/**
 * P32: pane heads, the Inspector's and the queue's title rows and the Keys list head are one toolbar
 * tall (`--toolbar-height`), centred, on the pane's tone with no band of their own.
 */
import { describe, expect, it } from "vitest";

import { parseRules, stripComments } from "../test/cssRules";

const sheets = import.meta.glob("/src/**/*.css", { query: "?raw", import: "default", eager: true }) as Record<
  string,
  string
>;

const body = (sheet: string, selector: string): string =>
  parseRules(stripComments(sheets[sheet] ?? ""))
    .filter((r) => r.selector.split(",").map((s) => s.trim()).includes(selector))
    .map((r) => r.body)
    .join("\n");

describe("bars of one height (P32)", () => {
  it("makes the Library pane's heads one row tall, the table header's height (Q2, amending P32)", () => {
    expect(body("/src/screens/library/PlaylistPane.css", ".cp-playlist-pane__head")).toMatch(/min-block-size:\s*var\(--row-height\)/);
  });

  it.each([
    ["/src/components/player/QueuePanel.css", ".cp-queue__header"],
  ])("%s %s is at least --toolbar-height tall", (sheet, selector) => {
    expect(body(sheet, selector)).toMatch(/min-(block-size|height):\s*var\(--toolbar-height\)/);
  });

  it("makes the Inspector's head the page header's height, never under one toolbar (D9)", () => {
    expect(body("/src/screens/screens.css", ".cp-panel-header.cp-side-head")).toMatch(
      /min-height:\s*var\(--side-head-height, calc\([^;]*var\(--toolbar-height\)/,
    );
  });

  it("centres the pane head's title and its source, not on a text baseline", () => {
    expect(body("/src/screens/library/PlaylistPane.css", ".cp-playlist-pane__head")).toMatch(/align-items:\s*center/);
  });

  it("gives the Keys list head the panel tone, since the toolbar itself is transparent (P1)", () => {
    expect(body("/src/screens/keys/keys.css", ".keys-tracks__toolbar")).toMatch(/background:\s*var\(--bg-panel\)/);
  });
});
