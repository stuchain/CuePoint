import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import CSS from "./PixelBars.css?raw";
import { MotionProvider } from "../../tokens/MotionContext";
import { PixelBars } from "./PixelBars";
import type { PixelBucket } from "./pixelBarsGeometry";

const TEMPO: PixelBucket[] = [
  { label: "122", count: 40 },
  { label: "123", count: 0 },
  { label: "124", count: 312 },
  { label: "125", count: 9 },
];

/**
 * A bar's name is its <title> child (SVG-AAM names a role=button <g> by it in a browser;
 * jsdom's name computation only reads an <svg> root's title), so the tests find a bar by it.
 */
const titleOf = (el: Element) => el.querySelector(":scope > title")?.textContent ?? null;
const button = (text: string | RegExp) =>
  screen.queryAllByRole("button").find((el) => {
    const t = titleOf(el) ?? "";
    return typeof text === "string" ? t === text : text.test(t);
  }) ?? null;

const name = (b: PixelBucket) => `${b.label} BPM, ${b.count} tracks`;

function chart(props: Partial<React.ComponentProps<typeof PixelBars>> = {}) {
  return render(
    <PixelBars title="Tempo" buckets={TEMPO} orientation="vertical" barName={name} onSelect={() => undefined} {...props} />,
  );
}

describe("PixelBars", () => {
  it("makes each bar with tracks a button named by the formatter", () => {
    chart();
    const buttons = screen.getAllByRole("button");
    expect(buttons.map(titleOf)).toEqual([
      "122 BPM, 40 tracks",
      "124 BPM, 312 tracks",
      "125 BPM, 9 tracks",
    ]);
    expect(buttons.some((b) => b.hasAttribute("aria-label"))).toBe(false);
  });

  it("draws one rect per bar that has tracks, and none for an empty bucket", () => {
    const { container } = chart();
    expect(container.querySelectorAll("rect[data-bar]")).toHaveLength(3);
  });

  it("writes the counts on the chart", () => {
    const { container } = chart();
    const texts = [...container.querySelectorAll("svg text")].map((t) => t.textContent);
    expect(texts).toEqual(expect.arrayContaining(["40", "0", "312", "9"]));
  });

  it("enters the chart by Tab on one bar, and the arrow keys move between bars", async () => {
    const user = userEvent.setup();
    chart();
    await user.tab();
    expect(button("122 BPM, 40 tracks")!).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    // The empty bucket has no rules and is skipped.
    expect(button("124 BPM, 312 tracks")!).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(button("125 BPM, 9 tracks")!).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(button("125 BPM, 9 tracks")!).toHaveFocus();
    await user.keyboard("{ArrowLeft}");
    expect(button("124 BPM, 312 tracks")!).toHaveFocus();
    await user.keyboard("{Home}");
    expect(button("122 BPM, 40 tracks")!).toHaveFocus();
    await user.keyboard("{End}");
    expect(button("125 BPM, 9 tracks")!).toHaveFocus();
    await user.keyboard("{ArrowUp}");
    expect(button("124 BPM, 312 tracks")!).toHaveFocus();
  });

  it("keeps a single tab stop, on the bar last focused", async () => {
    const user = userEvent.setup();
    chart();
    const buttons = screen.getAllByRole("button");
    expect(buttons.filter((b) => b.getAttribute("tabindex") === "0")).toHaveLength(1);
    await user.tab();
    await user.keyboard("{ArrowRight}");
    expect(button("124 BPM, 312 tracks")!).toHaveAttribute("tabindex", "0");
    expect(button("122 BPM, 40 tracks")!).toHaveAttribute("tabindex", "-1");
  });

  it("calls onSelect with the bucket on click, Enter and Space", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    chart({ onSelect });
    await user.click(button("124 BPM, 312 tracks")!);
    expect(onSelect).toHaveBeenLastCalledWith(TEMPO[2]);
    button("125 BPM, 9 tracks")!.focus();
    await user.keyboard("{Enter}");
    expect(onSelect).toHaveBeenLastCalledWith(TEMPO[3]);
    button("122 BPM, 40 tracks")!.focus();
    await user.keyboard(" ");
    expect(onSelect).toHaveBeenLastCalledWith(TEMPO[0]);
    expect(onSelect).toHaveBeenCalledTimes(3);
  });

  it("makes no bar a button or a click target without onSelect", () => {
    const { container } = chart({ onSelect: undefined });
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(container.querySelectorAll("[tabindex]")).toHaveLength(0);
    // The counts are still on the chart.
    expect(container.querySelectorAll("rect[data-bar]")).toHaveLength(3);
  });

  it("does not open a bar that isSelectable refuses, or one with no tracks", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    const { container } = chart({ onSelect, isSelectable: (b) => b.label !== "125" });
    expect(button("125 BPM, 9 tracks")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(2);
    for (const at of [1, 3]) {
      const slot = container.querySelector(`[data-bar-slot='${at}']`)!;
      expect(slot).not.toHaveAttribute("tabindex");
      expect(slot).not.toHaveAttribute("role");
      await user.click(slot);
      fireEvent.keyDown(slot, { key: "Enter" });
      fireEvent.keyDown(slot, { key: " " });
    }
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("moves focus to the nearest open bar when the focused one stops being a button", () => {
    const ui = (buckets: PixelBucket[]) => (
      <PixelBars title="Tempo" buckets={buckets} orientation="vertical" barName={name} onSelect={() => undefined} />
    );
    const { rerender } = render(ui(TEMPO));
    button("124 BPM, 312 tracks")!.focus();
    rerender(ui(TEMPO.map((b) => (b.label === "124" ? { ...b, count: 0 } : b))));
    expect(button(/124 BPM/)).not.toBeInTheDocument();
    const focused = document.activeElement as HTMLElement;
    expect(focused).toHaveAttribute("role", "button");
    expect(focused).toHaveAttribute("tabindex", "0");
    expect(screen.getAllByRole("button").filter((b) => b.getAttribute("tabindex") === "0")).toEqual([focused]);
  });

  it("keeps the tab stop on the same bucket when the data reorders", async () => {
    const user = userEvent.setup();
    const ui = (buckets: PixelBucket[]) => (
      <PixelBars title="Tempo" buckets={buckets} orientation="vertical" barName={name} onSelect={() => undefined} />
    );
    const { rerender } = render(ui(TEMPO));
    await user.tab();
    await user.keyboard("{ArrowRight}");
    rerender(ui([{ label: "121", count: 5 }, ...TEMPO]));
    expect(button("124 BPM, 312 tracks")!).toHaveAttribute("tabindex", "0");
  });

  it("has a hidden table with every bucket, empty ones too", () => {
    chart({ countLabel: "Tracks" });
    const table = screen.getByRole("table", { name: "Tempo" });
    const rows = within(table).getAllByRole("row");
    expect(rows.map((r) => r.textContent)).toEqual(["BucketTracks", "12240", "1230", "124312", "1259"]);
  });

  it("scrolls sideways inside its own container, not the page", () => {
    const { container } = chart();
    expect(container.querySelector(".cp-pixel-bars__scroll")).not.toBeNull();
    const rule = /\.cp-pixel-bars__scroll\s*\{([^}]*)\}/.exec(CSS)?.[1] ?? "";
    expect(rule).toMatch(/overflow-x:\s*auto/);
    expect(rule).toMatch(/max-width:\s*100%/);
  });

  it("draws rows for named buckets", () => {
    const { container } = chart({ orientation: "horizontal" });
    expect(container.querySelector(".cp-pixel-bars")).toHaveAttribute("data-orientation", "horizontal");
    expect(screen.getAllByRole("button")).toHaveLength(3);
  });

  it("marks a bar whose count changed under the state switch, and never on first draw", () => {
    const ui = (buckets: PixelBucket[]) => (
      <MotionProvider>
        <PixelBars title="Tempo" buckets={buckets} orientation="vertical" barName={name} onSelect={() => undefined} />
      </MotionProvider>
    );
    const { container, rerender } = render(ui(TEMPO));
    expect(container.querySelectorAll("[data-changed]")).toHaveLength(0);
    rerender(ui(TEMPO.map((b) => (b.label === "125" ? { ...b, count: 20 } : b))));
    expect(container.querySelector("[data-bar-slot='3'] [data-changed]")).not.toBeNull();
    expect(container.querySelector("[data-bar-slot='0'] [data-changed]")).toBeNull();
  });
});
