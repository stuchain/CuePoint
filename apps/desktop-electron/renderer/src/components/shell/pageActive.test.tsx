import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { PageActiveContext, queryShown, usePageActive } from "./pageActive";

function Says() {
  return <p>{usePageActive() ? "shown" : "hidden"}</p>;
}

describe("usePageActive", () => {
  it("is true outside any slot, so a page rendered alone counts as shown", () => {
    render(<Says />);
    expect(screen.getByText("shown")).toBeInTheDocument();
  });

  it("says what the slot says", () => {
    render(
      <PageActiveContext.Provider value={false}>
        <Says />
      </PageActiveContext.Provider>,
    );
    expect(screen.getByText("hidden")).toBeInTheDocument();
  });
});

describe("queryShown", () => {
  it("skips a match inside a page hidden with display: none", () => {
    render(
      <>
        <div style={{ display: "none" }}>
          <div role="menu" aria-label="behind" />
        </div>
        <div role="menu" aria-label="in front" />
      </>,
    );
    expect(queryShown('[role="menu"]')?.getAttribute("aria-label")).toBe("in front");
  });

  it("finds nothing when the only match is hidden", () => {
    render(
      <div style={{ display: "none" }}>
        <div role="menu" />
      </div>,
    );
    expect(queryShown('[role="menu"]')).toBeNull();
  });
});
