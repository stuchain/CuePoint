/**
 * Hint (PAGES-03, STR-3, STR-9).
 *
 * A reason in a `title` shows on hover only, so a keyboard user never sees it.
 * Hint keeps the title and adds a tooltip while the control has focus.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Hint, HINT_WARM_DELAY_MS, resetHintWarmth } from "./Hint";

describe("Hint", () => {
  it("puts the reason in the control's title, for hover", () => {
    render(
      <Hint text="Opens the log">
        <button type="button">Activity</button>
      </Hint>,
    );
    expect(screen.getByRole("button", { name: "Activity" })).toHaveAttribute(
      "title",
      "Opens the log",
    );
  });

  it("shows the reason while the control has keyboard focus", async () => {
    const user = userEvent.setup();
    render(
      <Hint text="Opens the log">
        <button type="button">Activity</button>
      </Hint>,
    );
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    await user.tab();

    const tip = screen.getByRole("tooltip");
    expect(tip).toHaveTextContent("Opens the log");
    expect(screen.getByRole("button", { name: "Activity" })).toHaveAttribute(
      "aria-describedby",
      tip.id,
    );
  });

  it("falls back to showing the reason where :focus-visible cannot be asked", async () => {
    const user = userEvent.setup();
    const original = Element.prototype.matches;
    vi.spyOn(Element.prototype, "matches").mockImplementation(function (
      this: Element,
      selector: string,
    ) {
      if (selector === ":focus-visible") throw new SyntaxError("unsupported");
      return original.call(this, selector);
    });
    render(
      <Hint text="Opens the log">
        <button type="button">Activity</button>
      </Hint>,
    );
    await user.tab();
    expect(screen.getByRole("tooltip")).toHaveTextContent("Opens the log");
    vi.restoreAllMocks();
  });

  it("stays quiet when focus is not from the keyboard", async () => {
    const original = Element.prototype.matches;
    vi.spyOn(Element.prototype, "matches").mockImplementation(function (
      this: Element,
      selector: string,
    ) {
      return selector === ":focus-visible" ? false : original.call(this, selector);
    });
    render(
      <Hint text="Opens the log">
        <button type="button">Activity</button>
      </Hint>,
    );
    screen.getByRole("button", { name: "Activity" }).focus();
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    vi.restoreAllMocks();
  });

  it("hides it again on blur and on Escape", async () => {
    const user = userEvent.setup();
    render(
      <>
        <Hint text="Opens the log">
          <button type="button">Activity</button>
        </Hint>
        <button type="button">Other</button>
      </>,
    );
    await user.tab();
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    await user.tab();
    await user.tab({ shift: true });
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    await user.tab();
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("keeps the child's own handlers and describedby", async () => {
    const user = userEvent.setup();
    const onFocus = vi.fn();
    render(
      <Hint text="Reason">
        <button type="button" onFocus={onFocus} aria-describedby="other">
          Go
        </button>
      </Hint>,
    );
    await user.tab();
    expect(onFocus).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Go" }).getAttribute("aria-describedby")).toMatch(
      /other/,
    );
  });

  it("shows nothing when there is no reason", async () => {
    const user = userEvent.setup();
    render(
      <Hint text={undefined}>
        <button type="button">Go</button>
      </Hint>,
    );
    await user.tab();
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Go" })).not.toHaveAttribute("title");
  });
});

describe("Hint on hover", () => {
  // A tip left up by the test before leaves the next one "warm", which would shorten its wait.
  beforeEach(() => resetHintWarmth());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // userEvent's own async waits hang under fake timers here, so the pointer is
  // driven with fireEvent; the timing under test is the component's own.
  const setup = () => {
    vi.useFakeTimers();
    return {
      hover: async (el: HTMLElement) => void fireEvent.pointerEnter(el),
      unhover: async (el: HTMLElement) => void fireEvent.pointerLeave(el),
      keyboard: async (_keys: string) => void fireEvent.keyDown(window, { key: "Escape" }),
    };
  };
  const button = () => screen.getByRole("button", { name: "Activity" });
  const hoverTarget = () => button().parentElement as HTMLElement;
  const renderHint = (props: { disabled?: boolean; inline?: boolean } = {}) =>
    render(
      <>
        <Hint text="Opens the log" inline={props.inline}>
          <button type="button" title="own" disabled={props.disabled}>
            Activity
          </button>
        </Hint>
        <button type="button">Other</button>
      </>,
    );

  it("shows after 400 ms and not at 399", async () => {
    const user = setup();
    renderHint();
    await user.hover(button());
    act(() => {
      vi.advanceTimersByTime(399);
    });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByRole("tooltip")).toHaveTextContent("Opens the log");
  });

  // D32 (M386): along a toolbar the first tip waits 400 ms, the next follows at once.
  it("shows the next control's tip after the short warm delay once one has been up", async () => {
    const user = setup();
    render(
      <>
        <Hint text="First tip">
          <button type="button">One</button>
        </Hint>
        <Hint text="Second tip">
          <button type="button">Two</button>
        </Hint>
      </>,
    );
    await user.hover(screen.getByRole("button", { name: "One" }));
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(screen.getByRole("tooltip")).toHaveTextContent("First tip");
    await user.unhover(screen.getByRole("button", { name: "One" }));
    await user.hover(screen.getByRole("button", { name: "Two" }));
    act(() => {
      vi.advanceTimersByTime(HINT_WARM_DELAY_MS);
    });
    expect(screen.getByRole("tooltip")).toHaveTextContent("Second tip");
  });

  it("shows nothing when the pointer leaves before 400 ms", async () => {
    const user = setup();
    renderHint();
    await user.hover(button());
    act(() => {
      vi.advanceTimersByTime(300);
    });
    await user.unhover(button());
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it.each([
    ["leave", async (u: ReturnType<typeof setup>) => u.unhover(button())],
    ["scroll", async () => void fireEvent.scroll(document.body)],
    ["Escape", async (u: ReturnType<typeof setup>) => u.keyboard("{Escape}")],
    ["pointerdown", async () => void fireEvent.pointerDown(document.body)],
  ])("hides on %s", async (_name, act_) => {
    const user = setup();
    renderHint();
    await user.hover(button());
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    await act_(user);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("takes the child's title away while hovered and gives it back", async () => {
    const user = setup();
    renderHint();
    expect(button()).toHaveAttribute("title", "Opens the log");
    await user.hover(button());
    expect(button()).not.toHaveAttribute("title");
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(button()).not.toHaveAttribute("title");
    expect(button().getAttribute("aria-describedby")).toBe(screen.getByRole("tooltip").id);
    await user.unhover(button());
    expect(button()).toHaveAttribute("title", "Opens the log");
  });

  it("shows on hover over a disabled child", async () => {
    const user = setup();
    renderHint({ disabled: true });
    await user.hover(hoverTarget());
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(screen.getByRole("tooltip")).toHaveTextContent("Opens the log");
  });

  it("flips below the control near the top edge", async () => {
    const user = setup();
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
      this: HTMLElement,
    ) {
      const isTip = this.getAttribute("role") === "tooltip";
      const box = isTip
        ? { top: 0, bottom: 20, left: 0, right: 100, width: 100, height: 20 }
        : { top: 2, bottom: 22, left: 10, right: 60, width: 50, height: 20 };
      return { ...box, x: box.left, y: box.top, toJSON: () => ({}) } as DOMRect;
    });
    renderHint();
    await user.hover(button());
    act(() => {
      vi.advanceTimersByTime(400);
    });
    const tip = screen.getByRole("tooltip");
    expect(tip.style.top).toBe("26px");
    expect(tip.style.bottom).toBe("");
  });

  it("sits to the right of the control, level with its middle, when asked to", async () => {
    const user = setup();
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
      this: HTMLElement,
    ) {
      const isTip = this.getAttribute("role") === "tooltip";
      const box = isTip
        ? { top: 0, bottom: 20, left: 0, right: 100, width: 100, height: 20 }
        : { top: 100, bottom: 130, left: 10, right: 60, width: 50, height: 30 };
      return { ...box, x: box.left, y: box.top, toJSON: () => ({}) } as DOMRect;
    });
    render(
      <Hint text="Opens the log" placement="right">
        <button type="button">Activity</button>
      </Hint>,
    );
    await user.hover(button());
    act(() => {
      vi.advanceTimersByTime(400);
    });
    const tip = screen.getByRole("tooltip");
    expect(tip.style.left).toBe("64px");
    expect(tip.style.top).toBe("105px");
    expect(tip.style.bottom).toBe("");
  });

  it("stays above when there is room", async () => {
    const user = setup();
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
      this: HTMLElement,
    ) {
      const isTip = this.getAttribute("role") === "tooltip";
      const box = isTip
        ? { top: 0, bottom: 20, left: 0, right: 100, width: 100, height: 20 }
        : { top: 300, bottom: 320, left: 10, right: 60, width: 50, height: 20 };
      return { ...box, x: box.left, y: box.top, toJSON: () => ({}) } as DOMRect;
    });
    renderHint();
    await user.hover(button());
    act(() => {
      vi.advanceTimersByTime(400);
    });
    const tip = screen.getByRole("tooltip");
    expect(tip.style.top).toBe("");
    expect(tip.style.bottom).not.toBe("");
  });

  it("does not bring the tip back, or hold the title off, after the reason comes and goes", async () => {
    const user = setup();
    const ui = (text: string | undefined) => (
      <Hint text={text}>
        <button type="button">Activity</button>
      </Hint>
    );
    const { rerender } = render(ui("Opens the log"));
    await user.hover(button());
    rerender(ui(undefined));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    rerender(ui("Opens the log"));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    expect(button()).toHaveAttribute("title", "Opens the log");
  });

  it("keeps a tip that keyboard focus put up when the pointer passes over and leaves", async () => {
    const user = setup();
    renderHint();
    await act(async () => {
      button().focus();
    });
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    await user.hover(button());
    await user.unhover(button());
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
  });

  it("pulls the tip in from the right edge", async () => {
    const user = setup();
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
      this: HTMLElement,
    ) {
      const isTip = this.getAttribute("role") === "tooltip";
      const box = isTip
        ? { top: 0, bottom: 20, left: 0, right: 100, width: 100, height: 20 }
        : { top: 300, bottom: 320, left: window.innerWidth - 20, right: window.innerWidth, width: 20, height: 20 };
      return { ...box, x: box.left, y: box.top, toJSON: () => ({}) } as DOMRect;
    });
    renderHint();
    await user.hover(button());
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(screen.getByRole("tooltip").style.left).toBe(`${window.innerWidth - 100 - 4}px`);
  });

  it("places a tip whose width follows its position once, without looping (SHELL-10)", async () => {
    // A fixed tip with an automatic width shrinks to the room right of its
    // left edge, so near the right edge each pull to the left made it wider,
    // which asked for another pull: React gave up ("Maximum update depth
    // exceeded") and the app fell to its Reload screen while Tabbing.
    const user = userEvent.setup();
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
      this: HTMLElement,
    ) {
      const isTip = this.getAttribute("role") === "tooltip";
      const left = isTip ? parseFloat(this.style.left || "0") : window.innerWidth - 20;
      const width = isTip ? Math.min(300, window.innerWidth - left) : 20;
      const box = isTip
        ? { top: 0, bottom: 20, left, right: left + width, width, height: 20 }
        : { top: 300, bottom: 320, left, right: left + width, width, height: 20 };
      return { ...box, x: box.left, y: box.top, toJSON: () => ({}) } as DOMRect;
    });
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <Hint text="Opens the log">
        <button type="button">Activity</button>
      </Hint>,
    );
    await user.tab();
    const tip = screen.getByRole("tooltip");
    expect(errors).not.toHaveBeenCalled();
    const left = parseFloat(tip.style.left);
    expect(left).toBeGreaterThanOrEqual(4);
    expect(left).toBeLessThan(window.innerWidth - 20);
  });

  it("flips only when the tip and its gap do not fit above", async () => {
    const user = setup();
    // Tip 20 high: room above is top - GAP(4) - 20. top 24 leaves 0 < 4: flip.
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
      this: HTMLElement,
    ) {
      const isTip = this.getAttribute("role") === "tooltip";
      const box = isTip
        ? { top: 0, bottom: 20, left: 0, right: 100, width: 100, height: 20 }
        : { top: 26, bottom: 46, left: 10, right: 60, width: 50, height: 20 };
      return { ...box, x: box.left, y: box.top, toJSON: () => ({}) } as DOMRect;
    });
    renderHint();
    await user.hover(button());
    act(() => {
      vi.advanceTimersByTime(400);
    });
    // 26 - 4 - 20 = 2 < 4, so it flips below (the old check, 26 - 20 = 6, did not).
    expect(screen.getByRole("tooltip").style.top).toBe("50px");
  });

  it("renders the wrapper inline on request", () => {
    renderHint({ inline: true });
    expect(hoverTarget()).toHaveClass("cp-hint", "cp-hint--inline");
  });

  it("draws the tip in document.body when asked to, still tied to the control, and shows it on keyboard focus", async () => {
    const user = userEvent.setup();
    render(
      <div data-testid="clipped" style={{ transform: "translateY(0)", overflow: "hidden" }}>
        <Hint text="Move up (Alt+↑)" portal>
          <button type="button">Up</button>
        </Hint>
      </div>,
    );
    await user.tab();
    const tip = screen.getByRole("tooltip");
    expect(tip.parentElement).toBe(document.body);
    expect(screen.getByTestId("clipped")).not.toContainElement(tip);
    expect(screen.getByRole("button", { name: "Up" })).toHaveAttribute("aria-describedby", tip.id);
    await user.tab();
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });
});

describe("the tip's look (C121, C212)", () => {
  it("is a sentence, so it is drawn in the data face (Inter, Q4), on the one floating chrome (P12)", async () => {
    const css = (await import("./Hint.css?raw")).default as string;
    expect(css).toMatch(/\.cp-hint__tip\s*\{[^}]*font-family:\s*var\(--font-data\)/);
    expect(css).toMatch(/\.cp-hint__tip\s*\{[^}]*border:\s*var\(--popover-border\)/);
    expect(css).toMatch(/\.cp-hint__tip\s*\{[^}]*box-shadow:\s*var\(--shadow-popover\)/);
  });
});
