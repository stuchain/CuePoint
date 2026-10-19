/**
 * The app hint host (area 13): the keyboard gets the tip too, a cut value inside a marked cell
 * shows its own text, and the words are exposed to assistive technology while the tip shows (B3).
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { HINT_HOVER_DELAY_MS } from "./Hint";
import { OverflowHintHost, hintTarget } from "./OverflowHintHost";

afterEach(() => vi.useRealTimers());

function cut(element: HTMLElement) {
  Object.defineProperty(element, "scrollWidth", { configurable: true, value: 300 });
  Object.defineProperty(element, "clientWidth", { configurable: true, value: 100 });
}

describe("which element the hint belongs to", () => {
  it("prefers an inner cut value over the outer cell's words", () => {
    render(
      <div data-testid="cell" data-hint="Key 8A: 12 tracks">
        <span data-testid="value" data-cut-hint="">
          A very long value
        </span>
      </div>,
    );
    cut(screen.getByTestId("value"));
    expect(hintTarget(screen.getByTestId("value"))?.text).toBe("A very long value");
  });

  it("passes a value that is not cut to the outer cell's words", () => {
    render(
      <div data-testid="cell" data-hint="Key 8A: 12 tracks">
        <span data-testid="value" data-cut-hint="">
          Short
        </span>
      </div>,
    );
    expect(hintTarget(screen.getByTestId("value"))?.text).toBe("Key 8A: 12 tracks");
  });
});

describe("the keyboard and assistive technology", () => {
  it("shows a data-hint on focus at once, describes the element, and clears both on blur", () => {
    render(
      <>
        <OverflowHintHost />
        <button type="button" data-hint="Key chip: opens the wheel">
          8A
        </button>
      </>,
    );
    const chip = screen.getByRole("button", { name: "8A" });

    act(() => chip.focus());
    expect(screen.getByRole("tooltip")).toHaveTextContent("Key chip: opens the wheel");
    expect(chip).toHaveAttribute("aria-description", "Key chip: opens the wheel");

    act(() => chip.blur());
    expect(screen.queryByRole("tooltip")).toBeNull();
    expect(chip).not.toHaveAttribute("aria-description");
  });

  it("describes a hovered element too, and gives back what it had", () => {
    vi.useFakeTimers();
    render(
      <>
        <OverflowHintHost />
        <span data-testid="chip" data-hint="Words" aria-description="Own description" />
      </>,
    );
    fireEvent.pointerOver(screen.getByTestId("chip"));
    act(() => {
      vi.advanceTimersByTime(HINT_HOVER_DELAY_MS + 10);
    });
    expect(screen.getByTestId("chip")).toHaveAttribute("aria-description", "Words");

    fireEvent.pointerDown(document.body);
    expect(screen.getByTestId("chip")).toHaveAttribute("aria-description", "Own description");
  });
});

describe("the tip is placed by its measured width (C212)", () => {
  function rect(left: number, top: number, width: number, height: number): DOMRect {
    return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) } as DOMRect;
  }

  function withWindow(width: number, height: number, tipWidth: number, anchor: DOMRect, run: () => void) {
    const originalW = window.innerWidth;
    const originalH = window.innerHeight;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: height });
    const spy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      return this.classList.contains("cp-hint__tip") ? rect(0, 0, tipWidth, 30) : anchor;
    });
    try {
      run();
    } finally {
      spy.mockRestore();
      Object.defineProperty(window, "innerWidth", { configurable: true, value: originalW });
      Object.defineProperty(window, "innerHeight", { configurable: true, value: originalH });
    }
  }

  it("pulls a wide tip in from the right edge by its real width, not a fixed 360", () => {
    withWindow(1000, 800, 200, rect(900, 400, 40, 20), () => {
      render(
        <>
          <OverflowHintHost />
          <button type="button" data-hint="A tip of about two hundred pixels">
            x
          </button>
        </>,
      );
      act(() => screen.getByRole("button", { name: "x" }).focus());
      const tip = screen.getByRole("tooltip");
      expect(parseFloat(tip.style.left)).toBe(1000 - 200 - 4);
    });
  });

  it("leaves a narrow tip where it is instead of pulling it back 360", () => {
    withWindow(1000, 800, 100, rect(800, 400, 40, 20), () => {
      render(
        <>
          <OverflowHintHost />
          <button type="button" data-hint="Short">
            y
          </button>
        </>,
      );
      act(() => screen.getByRole("button", { name: "y" }).focus());
      expect(parseFloat(screen.getByRole("tooltip").style.left)).toBe(800);
    });
  });

  it("flips below the control when the measured tip does not fit above it", () => {
    withWindow(1000, 800, 100, rect(100, 20, 40, 20), () => {
      render(
        <>
          <OverflowHintHost />
          <button type="button" data-hint="Short">
            z
          </button>
        </>,
      );
      act(() => screen.getByRole("button", { name: "z" }).focus());
      const tip = screen.getByRole("tooltip");
      expect(tip.style.top).toBe("44px");
      expect(tip.style.bottom).toBe("");
    });
  });
});
