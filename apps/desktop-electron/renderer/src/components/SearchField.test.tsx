import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it } from "vitest";
import { SearchField } from "./SearchField";

describe("SearchField", () => {
  it("reads Search <thing>… unless a placeholder is given, and the name stays Search <thing>", () => {
    const { rerender } = render(<SearchField thing="sources" value="" onValueChange={() => {}} />);
    expect(screen.getByRole("searchbox", { name: "Search sources" })).toHaveAttribute("placeholder", "Search sources…");
    rerender(<SearchField thing="sources" placeholder="Search…" value="" onValueChange={() => {}} />);
    expect(screen.getByRole("searchbox", { name: "Search sources" })).toHaveAttribute("placeholder", "Search…");
  });

  it("forwards its ref to the input and accepts the fit option without a layout", () => {
    const ref = createRef<HTMLInputElement>();
    render(<SearchField ref={ref} thing="tracks" fitPlaceholder value="" onValueChange={() => {}} />);
    expect(ref.current).toBe(screen.getByRole("searchbox"));
    expect(ref.current).toHaveAttribute("placeholder", "Search tracks…");
  });
});
