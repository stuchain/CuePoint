/**
 * D5 (C55): a dig's outcome ("Found 6 tracks from 1 chart and 0 releases.") is a sentence, so it
 * is Inter, like "Duplicates are merged." beside it, and not the pixel face.
 */
import { describe, expect, it } from "vitest";

import { parseRules, stripComments } from "../../test/cssRules";
import css from "./discover.css?raw";

const rules = parseRules(stripComments(css));
const body = (selector: string) => rules.find((rule) => rule.selector === selector)?.body ?? "";

describe("a dig's sentences are Inter (D5, C55)", () => {
  it("sets the outcome in the data face at body size, as the note beside it is", () => {
    expect(body(".discover-run__outcome")).toMatch(/font-family:\s*var\(--font-data\)/);
    expect(body(".discover-note")).toMatch(/font-family:\s*var\(--font-data\)/);
  });
});
