/**
 * The Prepare page's two panes (PREP-10, DEC-112): the Set, and beside it the
 * source panel with a divider whose width is remembered. Without a source
 * panel the Set takes the width and there is no divider to move.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { ScaleProvider } from "../../tokens/ScaleContext";
import { PrepareLayout } from "./PrepareLayout";
import { SOURCE_DEFAULT_WIDTH, SOURCE_MIN_WIDTH, SOURCE_WIDTH_STORAGE_KEY } from "./prepareLayoutState";

/** The window's width as the page reads it (B14), on the root element alone. */
function windowWidth(width: number) {
  Object.defineProperty(document.documentElement, "clientWidth", { configurable: true, get: () => width });
}

afterEach(() => {
  delete (document.documentElement as { clientWidth?: number }).clientWidth;
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** The layout at a text scale (the scale is stored by the Settings page and read by the provider). */
function renderAtScale(scale: number, source: boolean = true, windowWidth?: number) {
  if (windowWidth) vi.stubGlobal("innerWidth", windowWidth);
  localStorage.setItem("cuepoint-ui-lab-scale", String(scale));
  return render(
    <ScaleProvider>
      <PrepareLayout set={<p>the set</p>} source={source ? <p>the source</p> : undefined} />
    </ScaleProvider>,
  );
}

function divider() {
  return screen.getByRole("separator", { name: "Resize the source panel" });
}

describe("the layout", () => {
  it("draws a fresh and a migrated width the same at any size, both in 1x units (C209)", () => {
    // B17: 313, 470 at Medium (was 240, 360 px, which cut the suggestions' titles).
    expect(SOURCE_DEFAULT_WIDTH).toBe(313);
    expect(SOURCE_MIN_WIDTH).toBe(160);
    const { unmount } = renderAtScale(1.5, true, 2400);
    const fresh = divider().getAttribute("aria-valuenow");
    expect(fresh).toBe("470");
    unmount();
    // A width saved as pixels by an older version, read at the same size, is kept as chosen.
    localStorage.setItem(SOURCE_WIDTH_STORAGE_KEY, "470");
    renderAtScale(1.5, true, 2400);
    expect(divider().getAttribute("aria-valuenow")).toBe(fresh);
  });

  it("keeps the floor at 160 x the scale (C209)", () => {
    localStorage.setItem(SOURCE_WIDTH_STORAGE_KEY, JSON.stringify({ unit: "1x", width: 100 }));
    renderAtScale(2, true, 2400);
    expect(divider()).toHaveAttribute("aria-valuenow", String(SOURCE_MIN_WIDTH * 2));
  });

  it("saves a drag when the pointer is released, not on every move", () => {
    renderAtScale(1);
    fireEvent.mouseDown(divider(), { clientX: 800 });
    fireEvent.mouseMove(window, { clientX: 760 });
    fireEvent.mouseMove(window, { clientX: 750 });
    expect(localStorage.getItem(SOURCE_WIDTH_STORAGE_KEY)).toBeNull();
    fireEvent.mouseUp(window);
    expect(JSON.parse(localStorage.getItem(SOURCE_WIDTH_STORAGE_KEY)!)).toEqual({
      unit: "1x",
      width: SOURCE_DEFAULT_WIDTH + 50,
    });
  });

  it("keeps the source panel mounted but out of sight, with no divider, while Track details are open (C226)", () => {
    const { container } = render(
      <PrepareLayout set={<p>the set</p>} source={<p>the source</p>} sourceHidden />,
    );
    expect(screen.queryByRole("separator")).toBeNull();
    // Mounted, so what was picked in it survives, but not shown: one right-hand panel at a time.
    expect(screen.getByText("the source", { selector: "p" })).not.toBeVisible();
    expect(container.querySelector(".prepare-layout--single")).not.toBeNull();
  });

  it("folds the source panel away on a window under 1100 wide, with a button that opens it (B14)", () => {
    windowWidth(1024);
    const { container } = renderAtScale(1.5, true, 1024);
    expect(screen.queryByRole("separator")).toBeNull();
    expect(screen.getByText("the source", { selector: "p" })).not.toBeVisible();
    expect(container.querySelector(".prepare-layout--folded")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Show suggestions" }));
    expect(screen.getByText("the source", { selector: "p" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Fold suggestions" })).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(screen.getByRole("button", { name: "Fold suggestions" }));
    expect(screen.getByText("the source", { selector: "p" })).not.toBeVisible();
  });

  it("gives the Set the width, with no divider, when there is no source panel", () => {
    render(<PrepareLayout set={<p>the set</p>} />);
    expect(screen.getByText("the set")).toBeInTheDocument();
    expect(screen.queryByRole("separator")).toBeNull();
  });

  it("puts the source panel beside the Set, at the remembered width", () => {
    localStorage.setItem(SOURCE_WIDTH_STORAGE_KEY, "400");
    const { container } = renderAtScale(1);
    expect(screen.getByText("the source")).toBeInTheDocument();
    expect(divider()).toHaveAttribute("aria-valuenow", "400");
    const layout = container.querySelector(".prepare-layout") as HTMLElement;
    expect(layout.style.getPropertyValue("--prepare-source-width")).toBe("400px");
  });

  it("says the range it moves in, from the clamp's own bounds (M359)", () => {
    renderAtScale(1.5, true, 2400);
    expect(divider()).toHaveAttribute("aria-valuemin", String(Math.round(SOURCE_MIN_WIDTH * 1.5)));
    expect(divider()).toHaveAttribute("aria-valuemax", String(Math.floor(2400 * 0.45)));
  });

  it("moves with the arrow keys and remembers where it was left", () => {
    renderAtScale(1);
    expect(divider()).toHaveAttribute("aria-valuenow", String(SOURCE_DEFAULT_WIDTH));
    fireEvent.keyDown(divider(), { key: "ArrowLeft" });
    expect(divider()).toHaveAttribute("aria-valuenow", String(SOURCE_DEFAULT_WIDTH + 16));
    fireEvent.keyDown(divider(), { key: "ArrowRight" });
    fireEvent.keyDown(divider(), { key: "ArrowRight" });
    expect(divider()).toHaveAttribute("aria-valuenow", String(SOURCE_DEFAULT_WIDTH - 16));
    // Written in 1x units with its own marker (C209), by the nudge and not by opening the page.
    expect(JSON.parse(localStorage.getItem(SOURCE_WIDTH_STORAGE_KEY)!)).toEqual({
      unit: "1x",
      width: SOURCE_DEFAULT_WIDTH - 16,
    });
  });

  it("reads a width saved in pixels as the current scale's pixels, and writes nothing on load (C209)", () => {
    localStorage.setItem(SOURCE_WIDTH_STORAGE_KEY, "500");
    const { container } = renderAtScale(1.25, true, 2400);
    expect(divider()).toHaveAttribute("aria-valuenow", "500");
    const layout = container.querySelector(".prepare-layout") as HTMLElement;
    expect(layout.style.getPropertyValue("--prepare-source-width")).toBe("500px");
    // Opening the page is not a change: the old value stays as it was.
    expect(localStorage.getItem(SOURCE_WIDTH_STORAGE_KEY)).toBe("500");
  });

  it("keeps a width marked as 1x units and draws it at the scale: px = 1x width * scale (C209)", () => {
    localStorage.setItem(SOURCE_WIDTH_STORAGE_KEY, JSON.stringify({ unit: "1x", width: 300 }));
    const { container } = renderAtScale(2, true, 2400);
    const layout = container.querySelector(".prepare-layout") as HTMLElement;
    expect(layout.style.getPropertyValue("--prepare-source-width")).toBe("600px");
    expect(divider()).toHaveAttribute("aria-valuenow", "600");
    // Only a change writes, and it writes 1x units.
    expect(localStorage.getItem(SOURCE_WIDTH_STORAGE_KEY)).toBe(JSON.stringify({ unit: "1x", width: 300 }));
    fireEvent.keyDown(divider(), { key: "ArrowLeft" });
    expect(JSON.parse(localStorage.getItem(SOURCE_WIDTH_STORAGE_KEY)!)).toEqual({ unit: "1x", width: 316 });
    expect(divider()).toHaveAttribute("aria-valuenow", "632");
  });

  it("keeps the Set the wider pane, against the layout's own width, not the window's (PREP-11)", () => {
    // The window is 1,200 wide here; with the sidebar and the Inspector open
    // the two panes share far less. A remembered 500 is clamped to 45% of it.
    localStorage.setItem(SOURCE_WIDTH_STORAGE_KEY, "500");
    const spy = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(620);
    // The window itself is wide enough that the panel does not fold (B14).
    windowWidth(1200);
    try {
      renderAtScale(1);
      expect(divider()).toHaveAttribute("aria-valuenow", String(Math.floor(620 * 0.45)));
      // Remembered as chosen, so a wider layout gives it back (and opening the page writes nothing).
      expect(localStorage.getItem(SOURCE_WIDTH_STORAGE_KEY)).toBe("500");
    } finally {
      spy.mockRestore();
    }
  });

  it("follows a drag of the divider, never below the source panel's floor", () => {
    renderAtScale(1);
    fireEvent.mouseDown(divider(), { clientX: 800 });
    fireEvent.mouseMove(window, { clientX: 760 });
    expect(divider()).toHaveAttribute("aria-valuenow", String(SOURCE_DEFAULT_WIDTH + 40));
    fireEvent.mouseMove(window, { clientX: 1200 });
    expect(divider()).toHaveAttribute("aria-valuenow", String(SOURCE_MIN_WIDTH));
    fireEvent.mouseUp(window);
    fireEvent.mouseMove(window, { clientX: 100 });
    expect(divider()).toHaveAttribute("aria-valuenow", String(SOURCE_MIN_WIDTH));
    expect(document.body.classList.contains("prepare-resizing")).toBe(false);
  });
});
