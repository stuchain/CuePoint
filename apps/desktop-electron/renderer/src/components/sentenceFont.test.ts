/**
 * D5 (C55): a full sentence is set in Inter (`--font-data`); the pixel face stays for headings
 * and short labels. The shared pieces that carry sentences (a notice, an empty state's
 * description, a field's hint or error, a dialog's lead and paragraphs) say so in their own rule,
 * so every page that uses them reads the same.
 */
import { describe, expect, it } from "vitest";

import { parseRules, stripComments } from "../test/cssRules";
import emptyCss from "./EmptyState.css?raw";
import modalCss from "./Modal.css?raw";
import noticeCss from "./Notice.css?raw";
import reasonCss from "./ReasonLine.css?raw";
import fieldCss from "./TextField.css?raw";

function body(css: string, selector: string): string {
  const rule = parseRules(stripComments(css)).find((r) => r.selector.split(",").map((s) => s.trim()).includes(selector));
  expect(rule, `a rule for ${selector}`).toBeDefined();
  return rule!.body;
}

const INTER = /font-family:\s*var\(--font-data\)/;

describe("sentences in the shared pieces are Inter (D5, C55)", () => {
  it.each([
    { css: noticeCss, selector: ".cp-notice__text" },
    { css: emptyCss, selector: ".cp-empty-state__description" },
    { css: fieldCss, selector: ".cp-field__hint" },
    { css: fieldCss, selector: ".cp-field__error" },
    { css: modalCss, selector: ".cp-modal__lead" },
    { css: modalCss, selector: ".cp-modal__body > p" },
    { css: modalCss, selector: ".cp-modal__reason" },
    { css: reasonCss, selector: ".cp-reason" },
  ])("$selector", ({ css, selector }) => {
    expect(body(css, selector)).toMatch(INTER);
  });

  it("keeps a notice's short title and an empty state's headline in the pixel face", () => {
    expect(body(noticeCss, ".cp-notice__title")).toMatch(/font-family:\s*var\(--font-pixel-digits\)/);
    expect(body(emptyCss, ".cp-empty-state__headline")).not.toMatch(INTER);
  });
});
