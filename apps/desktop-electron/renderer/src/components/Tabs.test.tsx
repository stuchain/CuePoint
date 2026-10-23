import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Tabs, panelId, tabId } from "./Tabs";
import css from "./Tabs.css?raw";
import tokens from "../tokens/tokens.css?raw";

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

  it("draws the sub variant as one segmented slab of equal parts, the picked one raised (P13)", () => {
    render(<Tabs variant="sub" tabs={TABS} activeId="a" onChange={() => {}} />);
    expect(screen.getByRole("tablist")).toHaveClass("cp-tabs", "cp-tabs--sub");
    const sub = /\.cp-tabs--sub\s*\{([^}]*)\}/.exec(css)![1]!;
    // P13: a slab with no frame (was a framed strip).
    expect(sub).toMatch(/background:\s*var\(--bg-panel-alt\)/);
    expect(sub).toMatch(/border:\s*0/);
    expect(sub).toMatch(/padding:\s*var\(--space-2xs\)/);
    expect(sub).toMatch(/width:\s*fit-content/);
    // P13: no separators between the parts any more (they were a hairline, C260); the slab carries them.
    expect(css).not.toMatch(/\.cp-tabs--sub \.cp-tabs__tab \+ \.cp-tabs__tab/);
    expect(css).not.toMatch(/:where\(\.cp-tabs__tab \+ \.cp-tabs__tab\)/);
    expect(css).toMatch(/\.cp-tabs--sub \.cp-tabs__tab\s*\{[^}]*padding:\s*0 var\(--space-sm\)/);
    expect(css).toMatch(/\.cp-tabs--sub \.cp-tabs__tab--active\s*\{[^}]*background:\s*var\(--bg-panel\)/);
    expect(css).toMatch(/\.cp-tabs--sub \.cp-tabs__tab\s*\{[^}]*font-size:\s*var\(--font-size-xs\)/);
  });

  it("leaves the main variant underlined", () => {
    expect(css).toMatch(/\.cp-tabs__tab--active\s*\{[^}]*border-bottom-color/);
    expect(/\.cp-tabs\s*\{([^}]*)\}/.exec(css)![1]!).toMatch(/border-bottom:/);
  });

  it("defaults the hover fill to the panel-alt surface, which a theme may replace", () => {
    expect(tokens).toMatch(/--hover-fill:\s*var\(--bg-panel-alt\)/);
  });

  it("has no hard-coded white wash on hover", () => {
    expect(css).not.toMatch(/rgba\(255,\s*255,\s*255/);
    expect(css).toMatch(/:hover:not\(:disabled\)\s*\{[^}]*var\(--hover-fill\)/);
  });

  it("keeps the active main tab's weight, so the underline alone says it is active (C26)", () => {
    const active = /\.cp-tabs__tab--active\s*\{([^}]*)\}/.exec(css)![1]!;
    expect(active).not.toMatch(/font-weight/);
  });

  it("draws an active sub-tab raised: the page tone on the slab, a soft shadow, no accent line (P13)", () => {
    const rule = /\.cp-tabs--sub \.cp-tabs__tab--active\s*\{([^}]*)\}/.exec(css)![1]!;
    expect(rule).toMatch(/background:\s*var\(--bg-panel\)/);
    expect(rule).toMatch(/box-shadow:\s*var\(--shadow-raised\)/);
    expect(rule).not.toMatch(/accent/);
    expect(rule).toMatch(/color:\s*var\(--fg-primary\)/);
    expect(rule).toMatch(/font-weight:\s*var\(--control-font-weight\)/);
  });

  it("pads every sub-tab --space-sm and starts the main strip flush with the page title (C33)", () => {
    expect(css).toMatch(/\.cp-tabs--sub \.cp-tabs__tab\s*\{[^}]*padding:\s*0 var\(--space-sm\)/);
    expect(css).toMatch(/\.cp-tabs:not\(\.cp-tabs--sub\) \.cp-tabs__tab:first-child\s*\{[^}]*margin-inline-start:\s*calc\(-1 \* var\(--space-md\)\)/);
  });

  it("sub-tab hover changes colour only, so it differs from the active pill", () => {
    const hover = /\.cp-tabs--sub \.cp-tabs__tab:hover[^{]*\{([^}]*)\}/.exec(css)![1]!;
    expect(hover).toMatch(/background:\s*transparent/);
    expect(hover).toMatch(/color:\s*var\(--fg-primary\)/);
  });
});

describe("Tabs keyboard (C199)", () => {
  const THREE = [
    { id: "a", label: "One" },
    { id: "b", label: "Two", disabled: true },
    { id: "c", label: "Three" },
  ];

  it("puts only the active tab in the tab order", () => {
    render(<Tabs tabs={THREE} activeId="c" onChange={() => {}} />);
    expect(screen.getByRole("tab", { name: "One" })).toHaveAttribute("tabindex", "-1");
    expect(screen.getByRole("tab", { name: "Three" })).toHaveAttribute("tabindex", "0");
  });

  it("puts the first enabled tab in the tab order when the active id matches no enabled tab (S6)", () => {
    const { rerender } = render(<Tabs tabs={THREE} activeId="gone" onChange={() => {}} />);
    expect(screen.getByRole("tab", { name: "One" })).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("tab", { name: "Three" })).toHaveAttribute("tabindex", "-1");
    // A disabled active tab is no stop either.
    rerender(<Tabs tabs={THREE} activeId="b" onChange={() => {}} />);
    expect(screen.getByRole("tab", { name: "One" })).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("tab", { name: "Two" })).toHaveAttribute("tabindex", "-1");
    expect(screen.getAllByRole("tab").filter((tab) => tab.getAttribute("tabindex") === "0")).toHaveLength(1);
  });

  it("moves with the arrow keys, skipping a disabled tab, wrapping round, and picks the tab it lands on", async () => {
    const onChange = vi.fn();
    render(<Tabs tabs={THREE} activeId="a" onChange={onChange} />);
    screen.getByRole("tab", { name: "One" }).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenLastCalledWith("c");
    expect(screen.getByRole("tab", { name: "Three" })).toHaveFocus();
    await userEvent.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenLastCalledWith("a");
    await userEvent.keyboard("{ArrowLeft}");
    expect(onChange).toHaveBeenLastCalledWith("c");
  });

  it("goes to the first and the last tab with Home and End", async () => {
    const onChange = vi.fn();
    render(<Tabs tabs={THREE} activeId="a" onChange={onChange} />);
    screen.getByRole("tab", { name: "One" }).focus();
    await userEvent.keyboard("{End}");
    expect(onChange).toHaveBeenLastCalledWith("c");
    await userEvent.keyboard("{Home}");
    expect(onChange).toHaveBeenLastCalledWith("a");
  });

  it("leaves other keys alone", async () => {
    const onChange = vi.fn();
    render(<Tabs tabs={THREE} activeId="a" onChange={onChange} />);
    screen.getByRole("tab", { name: "One" }).focus();
    await userEvent.keyboard("{ArrowDown}x");
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("Tabs overflow (C27)", () => {
  const define = (name: string, value: number) =>
    Object.defineProperty(HTMLElement.prototype, name, { configurable: true, get: () => value });

  afterEach(() => {
    // @ts-expect-error removes the test's own property
    delete HTMLElement.prototype.scrollWidth;
    // @ts-expect-error removes the test's own property
    delete HTMLElement.prototype.clientWidth;
  });

  it("shows a quiet chevron that scrolls the strip when sub-tabs overflow", async () => {
    define("scrollWidth", 600);
    define("clientWidth", 200);
    const scrollBy = vi.fn();
    Element.prototype.scrollBy = scrollBy;
    const { container } = render(<Tabs variant="sub" tabs={TABS} activeId="a" onChange={() => {}} />);
    const more = container.querySelector<HTMLElement>(".cp-tabs__more");
    expect(more).not.toBeNull();
    expect(more).toHaveAttribute("aria-hidden", "true");
    expect(more).toHaveAttribute("tabindex", "-1");
    await userEvent.click(more!);
    expect(scrollBy).toHaveBeenCalledWith(expect.objectContaining({ left: expect.any(Number) }));
    // It is not a tab: the strip still has exactly its two.
    expect(screen.getAllByRole("tab")).toHaveLength(2);
  });

  it("draws nothing when the tabs fit", () => {
    define("scrollWidth", 200);
    define("clientWidth", 200);
    const { container } = render(<Tabs variant="sub" tabs={TABS} activeId="a" onChange={() => {}} />);
    expect(container.querySelector(".cp-tabs__more")).toBeNull();
  });

  it("draws nothing on the main strip", () => {
    define("scrollWidth", 600);
    define("clientWidth", 200);
    const { container } = render(<Tabs tabs={TABS} activeId="a" onChange={() => {}} />);
    expect(container.querySelector(".cp-tabs__more")).toBeNull();
  });
});
