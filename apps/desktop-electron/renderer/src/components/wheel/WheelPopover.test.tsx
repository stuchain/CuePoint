import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { WheelPopover } from "./WheelPopover";
import popoverCss from "./WheelPopover.css?raw";
import { setSelectedTrack } from "../shell/selectedTrack";

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
