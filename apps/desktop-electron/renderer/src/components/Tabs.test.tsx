import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Tabs } from "./Tabs";
import css from "./Tabs.css?raw";

const TABS = [
  { id: "a", label: "One" },
  { id: "b", label: "Two" },
];

describe("Tabs", () => {
  it("marks the active tab and reports a change", async () => {
    const onChange = vi.fn();
    render(<Tabs tabs={TABS} activeId="a" onChange={onChange} />);
    expect(screen.getByRole("tab", { name: "One" })).toHaveAttribute("aria-selected", "true");
    await userEvent.click(screen.getByRole("tab", { name: "Two" }));
    expect(onChange).toHaveBeenCalledWith("b");
  });

  it("is the page strip by default", () => {
    render(<Tabs tabs={TABS} activeId="a" onChange={() => {}} />);
    expect(screen.getByRole("tablist")).not.toHaveClass("cp-tabs--sub");
  });

  it("draws the sub variant without a strip or a rule (T8)", () => {
    render(<Tabs variant="sub" tabs={TABS} activeId="a" onChange={() => {}} />);
    expect(screen.getByRole("tablist")).toHaveClass("cp-tabs", "cp-tabs--sub");
    const sub = /\.cp-tabs--sub\s*\{([^}]*)\}/.exec(css)![1]!;
    expect(sub).toMatch(/border-bottom:\s*0/);
    expect(sub).toMatch(/background:\s*transparent/);
    expect(css).toMatch(/\.cp-tabs--sub \.cp-tabs__tab--active\s*\{[^}]*background:\s*var\(--bg-panel-alt\)/);
    expect(css).toMatch(/\.cp-tabs--sub \.cp-tabs__tab\s*\{[^}]*font-size:\s*var\(--font-size-xs\)/);
  });

  it("has no hard-coded white wash on hover", () => {
    expect(css).not.toMatch(/rgba\(255,\s*255,\s*255/);
    expect(css).toMatch(/:hover:not\(:disabled\)\s*\{[^}]*var\(--bg-panel-alt\)/);
  });

  it("sub-tab hover changes colour only, so it differs from the active pill", () => {
    const hover = /\.cp-tabs--sub \.cp-tabs__tab:hover[^{]*\{([^}]*)\}/.exec(css)![1]!;
    expect(hover).toMatch(/background:\s*transparent/);
    expect(hover).toMatch(/color:\s*var\(--fg-primary\)/);
  });
});
