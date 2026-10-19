import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";

import { Highlighted, splitMatches } from "./highlightMatches";

describe("splitMatches (C135)", () => {
  it("marks the matched stretch and keeps the rest in order", () => {
    expect(splitMatches("Strobe (Club Mix)", "strobe")).toEqual([
      { text: "Strobe", match: true },
      { text: " (Club Mix)", match: false },
    ]);
  });

  it("ignores case and marks every word of the query", () => {
    const parts = splitMatches("Deadmau5 - Strobe", "STROBE dead");
    expect(parts.filter((part) => part.match).map((part) => part.text)).toEqual(["Dead", "Strobe"]);
    expect(parts.map((part) => part.text).join("")).toBe("Deadmau5 - Strobe");
  });

  it("takes regular-expression characters literally", () => {
    expect(splitMatches("Mix (Extended)", "(ext")).toEqual([
      { text: "Mix ", match: false },
      { text: "(Ext", match: true },
      { text: "ended)", match: false },
    ]);
  });

  it("returns the text whole for an empty query or text", () => {
    expect(splitMatches("Strobe", "  ")).toEqual([{ text: "Strobe", match: false }]);
    expect(splitMatches("", "a")).toEqual([{ text: "", match: false }]);
  });
});

describe("Highlighted", () => {
  it("draws the matched part in a mark", () => {
    const { container } = render(<Highlighted text="Strobe" query="rob" className="hit" />);
    const mark = container.querySelector("mark");
    expect(mark).toHaveTextContent("rob");
    expect(mark).toHaveClass("hit");
    expect(container).toHaveTextContent("Strobe");
  });
});
