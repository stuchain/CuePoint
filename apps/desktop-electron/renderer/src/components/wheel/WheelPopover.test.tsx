import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { WheelPopover } from "./WheelPopover";
import popoverCss from "./WheelPopover.css?raw";
import { setSelectedTrack } from "../shell/selectedTrack";
import { getWheelState, openWheel } from "./wheelStore";

function open() {
  const anchor = document.createElement("button");
  document.body.appendChild(anchor);
  render(
    <MemoryRouter>
      <WheelPopover source="details" anchor={anchor} />
    </MemoryRouter>,
  );
  return screen.getByRole("dialog", { name: "Camelot wheel" });
}

describe("WheelPopover placement", () => {
  it("does not refit, and so does not reset its own scroll, when the popover itself scrolls", () => {
    const popover = open();
    popover.style.maxHeight = "123px";
    // Its own scroll (a child's too) bubbles to the capture listener on window.
    fireEvent.scroll(popover);
    expect(popover.style.maxHeight).toBe("123px");
    fireEvent.scroll(popover.querySelector("svg") ?? popover);
    expect(popover.style.maxHeight).toBe("123px");
  });

  it("never clears its height cap while refitting, so the scroll position survives", () => {
    const popover = open();
    const seen: string[] = [];
    const set = popover.style.setProperty.bind(popover.style);
    Object.defineProperty(popover.style, "maxHeight", {
      configurable: true,
      get: () => "50px",
      set: (value: string) => seen.push(value),
    });
    void set;
    fireEvent.scroll(document);
    fireEvent(window, new Event("resize"));
    expect(seen.length).toBeGreaterThan(0);
    expect(seen).not.toContain("");
  });
});

describe("WheelPopover caption and button (C128, C5)", () => {
  const rule = (selector: string) => {
    const start = popoverCss.indexOf(`${selector} {`);
    return popoverCss.slice(start, popoverCss.indexOf("}", start));
  };

  it("writes the caption in body text, left aligned like every other popover's", () => {
    const caption = rule(".cp-wheel-pop__caption");
    expect(caption).toContain("font-size: var(--text-body)");
    expect(caption).not.toContain("text-align: center");
  });

  it("right-aligns its action", () => {
    expect(rule(".cp-wheel-pop__actions")).toContain("justify-content: flex-end");
  });

  it("makes Match on Beatport a secondary (grey) button, so the page keeps one main button", () => {
    act(() => setSelectedTrack({ id: 5, key: null, title: "Nine" }));
    try {
      open();
      const button = screen.getByRole("button", { name: "Match on Beatport" });
      expect(button).toHaveClass("cp-btn--secondary");
      expect(button).not.toHaveClass("cp-btn--primary");
    } finally {
      act(() => setSelectedTrack(null));
    }
  });
});

describe("WheelPopover padding, scroll cue and keyboard (M296, M297, M471)", () => {
  const rule = (selector: string) => {
    const start = popoverCss.indexOf(`${selector} {`);
    return popoverCss.slice(start, popoverCss.indexOf("}", start));
  };

  it("pads one amount on every side, so the wheel keeps the same room from the top as from the sides (M296)", () => {
    const pop = rule(".cp-wheel-pop");
    expect(pop).toContain("padding: var(--space-lg);");
    expect(pop).not.toContain("padding-block");
  });

  it("draws a hairline along the bottom while more is below, and not otherwise (M297, D26)", () => {
    expect(popoverCss).toMatch(/\.cp-wheel-pop\[data-more-below\]\s*\{[^}]*inset 0 calc\(-1 \* var\(--hairline\)\) 0/);
    const popover = open();
    expect(popover).not.toHaveAttribute("data-more-below");
    Object.defineProperty(popover, "scrollHeight", { configurable: true, value: 500 });
    Object.defineProperty(popover, "clientHeight", { configurable: true, value: 300 });
    fireEvent.scroll(popover);
    expect(popover).toHaveAttribute("data-more-below");
    popover.scrollTop = 200;
    fireEvent.scroll(popover);
    expect(popover).not.toHaveAttribute("data-more-below");
  });

  it("closes when focus leaves for somewhere outside it, and gives focus back to the chip (M471)", async () => {
    const chip = document.createElement("button");
    chip.setAttribute("data-wheel-opener", "");
    const elsewhere = document.createElement("button");
    document.body.append(chip, elsewhere);
    chip.focus();
    act(() => openWheel("details"));
    const popover = open();
    const inside = popover.querySelector<HTMLElement>("button")!;
    // Inside the popover: stays open.
    fireEvent.blur(inside, { relatedTarget: popover.querySelector("button:last-of-type") });
    expect(getWheelState().open).toBe(true);
    // To the opener: that is its own click's to decide.
    fireEvent.blur(inside, { relatedTarget: chip });
    expect(getWheelState().open).toBe(true);
    // Out: closed, focus returns to the chip.
    fireEvent.blur(inside, { relatedTarget: elsewhere });
    expect(getWheelState().open).toBe(false);
    await waitFor(() => expect(chip).toHaveFocus());
  });
});
