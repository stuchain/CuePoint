import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

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
    expect(css).toMatch(/\.cp-tabs--sub :where\(\.cp-tabs__tab \+ \.cp-tabs__tab\)\s*\{[^}]*border-left-color:/);
    expect(css).toMatch(/\.cp-tabs--sub \.cp-tabs__tab\s*\{[^}]*padding:\s*0 var\(--space-sm\)/);
    expect(css).toMatch(/\.cp-tabs--sub \.cp-tabs__tab--active\s*\{[^}]*background:\s*var\(--bg-selected\)/);
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

  it("keeps the active main tab's weight, so the underline alone says it is active (C26)", () => {
    const active = /\.cp-tabs__tab--active\s*\{([^}]*)\}/.exec(css)![1]!;
    expect(active).not.toMatch(/font-weight/);
  });

  it("draws an active sub-tab as the toggle's on look: selected fill, 1px accent line, regular weight (D1)", () => {
    const rule = /\.cp-tabs--sub \.cp-tabs__tab--active\s*\{([^}]*)\}/.exec(css)![1]!;
    expect(rule).toMatch(/background:\s*var\(--bg-selected\)/);
    expect(rule).toMatch(/border-color:\s*var\(--accent-primary\)/);
    expect(rule).toMatch(/color:\s*var\(--fg-primary\)/);
    expect(rule).toMatch(/font-weight:\s*var\(--font-weight-regular\)|font-weight:\s*var\(--control-font-weight\)/);
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
