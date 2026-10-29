import { describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";

import { axeOptions, expectNoAxeViolations, WCAG_TAGS } from "./axe";

describe("the shared axe check", () => {
  it("holds WCAG 2.2 A and AA, with only the two jsdom-blind rules off", () => {
    const options = axeOptions();
    expect(options.runOnly).toEqual({ type: "tag", values: [...WCAG_TAGS] });
    expect(WCAG_TAGS).toContain("wcag22aa");
    const off = Object.entries(options.rules ?? {})
      .filter(([, v]) => !v.enabled)
      .map(([k]) => k);
    expect(off.sort()).toEqual(["color-contrast", "region"]);
  });

  it("leaves out only a documented rule on its selector, and fails when the entry goes stale", async () => {
    render(
      <>
        <div className="known" role="option" aria-selected="false">
          <button type="button" tabIndex={-1}>
            Remove
          </button>
        </div>
        <button type="button" />
      </>,
    );
    const known = [{ rule: "nested-interactive", selector: ".known", finding: "A11Y-TEST" }];
    // The unnamed button outside the selector still fails.
    await expect(expectNoAxeViolations({ known })).rejects.toThrow(/button-name/);
    cleanup();
    render(<button type="button">Fine</button>);
    await expect(expectNoAxeViolations({ known })).rejects.toThrow(/A11Y-TEST/);
  });

  it("passes a named control", async () => {
    render(<button type="button">Save</button>);
    await expectNoAxeViolations();
  });

  it("fails a control with no name, so a passing page is not a check that checks nothing", async () => {
    render(<button type="button" />);
    await expect(expectNoAxeViolations()).rejects.toThrow(/button-name/);
  });

  it("fails an image with no text alternative and a form field with no label", async () => {
    render(
      <>
        <img src="x.png" />
        <input type="text" />
      </>,
    );
    await expect(expectNoAxeViolations()).rejects.toThrow(/image-alt|label/);
  });
});
