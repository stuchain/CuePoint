/**
 * C33: Discover's tab words start under the page title, as on Clean and Statistics. The shared
 * Tabs rule hangs the first tab's padding out to the left; a page that also takes that padding
 * away puts the words 10px left of the title.
 */
import { describe, expect, it } from "vitest";

import { parseRules, stripComments } from "../../test/cssRules";
import css from "./discover.css?raw";

describe("Discover's tabs (C33)", () => {
  it("leave the first tab's padding to the shared Tabs rule", () => {
    const own = parseRules(stripComments(css)).filter((rule) => /\.cp-tabs/.test(rule.selector));
    expect(own.filter((rule) => /padding/.test(rule.body)).map((rule) => rule.selector)).toEqual([]);
  });
});
