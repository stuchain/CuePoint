/**
 * Hint (PAGES-03, STR-3, STR-9).
 *
 * A reason in a `title` shows on hover only, so a keyboard user never sees it.
 * Hint keeps the title and adds a tooltip while the control has focus.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Hint } from "./Hint";

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
