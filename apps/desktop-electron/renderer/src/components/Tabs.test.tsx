import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Tabs, panelId, tabId } from "./Tabs";
import css from "./Tabs.css?raw";

const TABS = [
  { id: "a", label: "One" },
  { id: "b", label: "Two" },
];

describe("Tabs", () => {
  it("writes no ids without a prefix", () => {
    render(<Tabs tabs={TABS} activeId="a" onChange={() => {}} />);
    expect(screen.getByRole("tab", { name: "One" })).not.toHaveAttribute("id");
    expect(screen.getByRole("tab", { name: "One" })).not.toHaveAttribute("aria-controls");
  });

  it("names each tab and the panel it controls when given a prefix", () => {
    render(<Tabs tabs={TABS} activeId="a" onChange={() => {}} idPrefix="x" />);
    const two = screen.getByRole("tab", { name: "Two" });
    expect(two).toHaveAttribute("id", tabId("x", "b"));
    expect(two).toHaveAttribute("aria-controls", panelId("x", "b"));
  });

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

  it("draws the sub variant as one framed strip of equal parts, the picked one filled", () => {
    render(<Tabs variant="sub" tabs={TABS} activeId="a" onChange={() => {}} />);
    expect(screen.getByRole("tablist")).toHaveClass("cp-tabs", "cp-tabs--sub");
    const sub = /\.cp-tabs--sub\s*\{([^}]*)\}/.exec(css)![1]!;
    expect(sub).toMatch(/border:\s*var\(--control-border-width\) solid var\(--border-control\)/);
    expect(sub).not.toMatch(/border-bottom:\s*0/);
    expect(sub).toMatch(/width:\s*fit-content/);
    // A hairline between the parts, so neighbours never run together.
    expect(css).toMatch(/\.cp-tabs--sub \.cp-tabs__tab \+ \.cp-tabs__tab\s*\{[^}]*border-left:/);
    expect(css).toMatch(/\.cp-tabs--sub \.cp-tabs__tab\s*\{[^}]*padding:\s*0 var\(--space-md\)/);
    expect(css).toMatch(/\.cp-tabs--sub \.cp-tabs__tab--active\s*\{[^}]*background:\s*var\(--bg-panel-alt\)/);
    expect(css).toMatch(/\.cp-tabs--sub \.cp-tabs__tab\s*\{[^}]*font-size:\s*var\(--font-size-xs\)/);
  });

  it("leaves the main variant underlined", () => {
    expect(css).toMatch(/\.cp-tabs__tab--active\s*\{[^}]*border-bottom-color/);
    expect(/\.cp-tabs\s*\{([^}]*)\}/.exec(css)![1]!).toMatch(/border-bottom:/);
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
