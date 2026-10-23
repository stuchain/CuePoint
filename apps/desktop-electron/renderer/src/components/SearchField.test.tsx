import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it } from "vitest";
import { SearchField } from "./SearchField";
import css from "./SearchField.css?raw";
import { parseRules, stripComments } from "../test/cssRules";

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

  // P31: one sunken search field: no frame until hover or focus, the line then turns violet.
  it("is sunken: a transparent frame at rest, --hover-border on hover, --accent-primary while focused (P31)", () => {
    const rules = parseRules(stripComments(css));
    const body = (selector: string) => rules.find((r) => r.selector.split(",").map((x) => x.trim()).includes(selector))?.body ?? "";
    const input = body(".cp-search-field__input");
    expect(input).toMatch(/background:\s*var\(--bg-input\)/);
    expect(input).toMatch(/border:\s*var\(--control-border-width\) solid transparent/);
    expect(rules.some((r) => r.selector.includes(":hover:not(:disabled)") && /border-color:\s*var\(--hover-border\)/.test(r.body))).toBe(true);
    expect(rules.some((r) => r.selector.includes(":focus-within") && /border-color:\s*var\(--accent-primary\)/.test(r.body))).toBe(true);
    expect(body(".cp-search-field__icon")).toMatch(/color:\s*var\(--fg-muted\)/);
  });
});
