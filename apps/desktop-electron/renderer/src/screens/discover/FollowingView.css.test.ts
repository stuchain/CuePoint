/**
 * The follow suggestions keep their columns lined up: each row is its own grid, so its last column
 * must be as wide on a "Follow" row as on a "Following" row. Both words share one cell of the button
 * and the one not shown still holds its width (held as text: a jsdom test cannot lay out).
 */
import { describe, expect, it } from "vitest";
import { declarations, parseRules, selectorList, stripComments } from "../../test/cssRules";

import css from "./FollowingView.css?raw";

function rule(selector: string): Map<string, string> {
  const found = parseRules(stripComments(css)).filter(
    (entry) => entry.context === "" && selectorList(entry.selector).includes(selector),
  );
  expect(found.length, selector).toBeGreaterThan(0);
  return new Map(found.flatMap((entry) => declarations(entry.body)));
}

describe("Follow suggestions button", () => {
  it("stacks Follow and Following in one cell, hiding the one not shown, so the width never changes", () => {
    expect(rule(".discover-following__follow-label").get("display")).toBe("inline-grid");
    expect(rule(".discover-following__follow-label").get("white-space")).toBe("nowrap");
    expect(rule(".discover-following__follow-label > *").get("grid-area")).toBe("1 / 1");
    expect(rule('.discover-following__follow-label > [data-shown="false"]').get("visibility")).toBe("hidden");
  });
});
