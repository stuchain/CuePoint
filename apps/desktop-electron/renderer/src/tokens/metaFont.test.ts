/**
 * One font in a line (option A): a line of facts, counts or notes under a title is set wholly in
 * the data face through `--font-meta`, so "Afro House · Releases from Sep 1 – Sep 30" and
 * "5,805 tracks found" do not mix pixel words with plain figures. Titles, chips, buttons, tabs and
 * labels stay on `--font-pixel-digits`.
 *
 * To add a line, append its rule (file relative to renderer/src, the rule's exact selector list).
 */
import { describe, expect, it } from "vitest";

import { parseRules, selectorList, stripComments } from "../test/cssRules";

const sources = import.meta.glob<string>(
  ["../components/**/*.css", "../screens/**/*.css", "../reporting/*.css", "./*.css"],
  { query: "?raw", import: "default", eager: true },
);

const META_LINES: Record<string, string[]> = {
  "../components/shell/ScreenHeader.css": [".cp-screen-header__summary"],
  "../components/shell/GlobalSearch.css": [".cp-global-search__meta", ".cp-global-search__summary", ".cp-global-search__note"],
  "../components/shell/ActivityPanel.css": [".cp-activity__summary", ".cp-activity__detail", ".cp-activity__time", ".cp-activity__note"],
  "../components/shell/OfflineBanner.css": [".cp-offline__time"],
  "../components/wheel/WheelPopover.css": [".cp-wheel-pop__caption"],
  "../screens/discover/discover.css": [
    ".discover-runs__what, .discover-runs__found",
    ".discover-run__looked",
    ".discover-run__scope > summary",
    ".discover-page__facts",
  ],
  "../screens/clean/match/match.css": [".review-candidate__why"],
  "../screens/library/TrackDetailPanel.css": [".cp-track-detail__selection"],
  "../screens/library/TagManagerDialog.css": [".cp-tag-manager__hint"],
  "../screens/prepare/prepare.css": [".prepare-transition__caption", ".prepare-transition__times"],
  "../screens/statistics/statistics.css": [".rank__note"],
};

function source(file: string): string {
  const found = sources[file];
  if (found === undefined) throw new Error(`no source ${file}`);
  return found;
}

/** The body of the rule whose whole selector list is `selector`. */
function ruleBody(file: string, selector: string): string {
  const wanted = selectorList(selector).join(", ");
  const rule = parseRules(stripComments(source(file))).find((r) => selectorList(r.selector).join(", ") === wanted);
  if (!rule) throw new Error(`no rule for ${selector} in ${file}`);
  return rule.body;
}

const PLACES = Object.entries(META_LINES).flatMap(([file, selectors]) => selectors.map((selector) => ({ file, selector })));

describe("a line of facts, counts or notes is one font (--font-meta)", () => {
  it("is the data face", () => {
    expect(source("./tokens.css")).toMatch(/--font-meta:\s*var\(--font-data\);/);
  });

  it.each(PLACES)("$selector", ({ file, selector }) => {
    expect(ruleBody(file, selector)).toMatch(/font-family:\s*var\(--font-meta\)/);
  });

  it("leaves the run card's title, the header's title and the chips in the pixel face", () => {
    // P2: the run card's title and the header's title carry the voice; chips are the work (--font-control).
    expect(ruleBody("../screens/discover/discover.css", ".discover-runs__when")).toMatch(/font-family:\s*var\(--font-voice\)/);
    const titles = parseRules(stripComments(source("../components/shell/ScreenHeader.css"))).filter((r) =>
      r.selector.includes(".cp-screen-header__title"),
    );
    expect(titles.length).toBeGreaterThan(0);
    for (const rule of titles) expect(rule.body).not.toMatch(/--font-meta|--font-data/);
    expect(source("../components/Badge.css")).toContain("var(--font-control)");
  });
});
