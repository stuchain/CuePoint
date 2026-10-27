/**
 * P30, P34: one chip box and one figure look.
 *
 * Every chip (status, key, filter, tag, Activity category) is `--chip-height` high with `--chip-pad`
 * either side and square. Every count is Inter with tabular figures; "N selected" is the one count in
 * the text colour, semibold (P52).
 */
import { describe, expect, it } from "vitest";

import { parseRules, stripComments } from "../test/cssRules";

const sheets = import.meta.glob("/src/**/*.css", { query: "?raw", import: "default", eager: true }) as Record<
  string,
  string
>;

/** Every rule that names this selector, joined (a selector may be stated in two places in a sheet). */
const rule = (sheet: string, selector: string): string =>
  parseRules(stripComments(sheets[sheet] ?? ""))
    .filter((r) => r.selector.split(",").map((part) => part.trim()).includes(selector))
    .map((r) => r.body)
    .join("\n");

describe("one chip box (P30)", () => {
  it("defines the chip height as 18 through round() and the pad as the 6px space step", () => {
    const tokens = stripComments(sheets["/src/tokens/tokens.css"] ?? "");
    expect(tokens).toMatch(/--chip-height:\s*round\(nearest,\s*calc\(18px \* var\(--scale\)\),\s*1px\)/);
    expect(tokens).toMatch(/--chip-pad:\s*var\(--space-sm\)/);
  });

  it.each([
    ["/src/components/Badge.css", ".cp-badge"],
    ["/src/components/wheel/KeyChip.css", ".key-chip"],
    ["/src/screens/library/FilterBar.css", ".cp-filter-bar__chip"],
    ["/src/screens/library/FilterBar.css", ".cp-filter-bar__tag"],
    ["/src/screens/library/TrackDetailPanel.css", ".cp-track-yours__tag"],
  ])("%s %s is --chip-height high, padded by --chip-pad and square", (sheet, selector) => {
    const body = rule(sheet, selector);
    expect(body).toMatch(/block-size:\s*var\(--chip-height\)/);
    expect(body).toMatch(/padding:\s*0 (var\(--chip-pad\)|var\(--key-chip-pad\))/);
    expect(body).toMatch(/border-radius:\s*0/);
  });

  it("sets the chip face on the chip itself: the chip size and weight", () => {
    for (const [sheet, selector] of [
      ["/src/components/Badge.css", ".cp-badge"],
      ["/src/components/wheel/KeyChip.css", ".key-chip"],
      ["/src/screens/library/FilterBar.css", ".cp-filter-bar__chip"],
      ["/src/screens/library/TrackDetailPanel.css", ".cp-track-yours__tag"],
    ] as const) {
      const body = rule(sheet, selector);
      expect(body, `${sheet} ${selector}`).toMatch(/font-size:\s*var\(--font-size-chip\)/);
      // M2 (DEC-302): the pixel face ships at 400 and 700, so the status chip (Badge) is the control weight.
      // The other chips are moved by their own packages (key chip, filter chip, tags); until they are, each
      // still states one of its old weights or the control weight.
      const weight = sheet === "/src/components/Badge.css" ? "control" : null;
      if (weight) expect(body, `${sheet} ${selector}`).toMatch(/font-weight:\s*var\(--control-font-weight\)/);
      else
        expect(body, `${sheet} ${selector}`).toMatch(
          /font-weight:\s*var\(--(font-weight-(medium|semibold)|control-font-weight)\)/,
        );
    }
  });

  it("makes the key chip's pad the chip pad, so the Keys grid that reads it follows", () => {
    expect(rule("/src/components/wheel/KeyChip.css", ".key-chip")).toMatch(/--key-chip-pad:\s*var\(--chip-pad\)/);
  });
});

describe("every count is a tabular figure (P34)", () => {
  it.each([
    ["/src/screens/library/PlaylistPane.css", ".cp-playlist-pane__count"],
    ["/src/components/Tabs.css", ".cp-tabs__detail"],
    ["/src/screens/discover/discoverCards.css", ".discover-card__counts"],
    ["/src/screens/keys/keys.css", ".keys-tracks__count"],
    ["/src/components/player/QueuePanel.css", ".cp-queue__count"],
    ["/src/components/player/QueuePanel.css", ".cp-queue__position"],
    ["/src/components/shell/GlobalSearch.css", ".cp-global-search__summary"],
    ["/src/components/shell/ActivityPanel.css", ".cp-activity__summary"],
    ["/src/components/Card.css", ".cp-card__unit"],
    ["/src/components/SelectionBar.css", ".cp-selection-bar__count"],
  ])("%s %s", (sheet, selector) => {
    const body = rule(sheet, selector);
    expect(body).toMatch(/font-variant-numeric:\s*tabular-nums/);
  });

  it("keeps 'N selected' in the text colour, semibold; the others are muted", () => {
    const body = rule("/src/components/SelectionBar.css", ".cp-selection-bar__count");
    expect(body).toMatch(/color:\s*var\(--fg-primary\)/);
    expect(body).toMatch(/font-weight:\s*var\(--font-weight-semibold\)/);
    expect(rule("/src/screens/library/PlaylistPane.css", ".cp-playlist-pane__count")).toMatch(/color:\s*var\(--fg-muted\)/);
  });
});
