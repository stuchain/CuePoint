/**
 * Round 5 shared-component changes (areas 62-64, 77-81, 87, 88, 93, 69): the menu button, the one
 * card, label-above fields with errors and widths, the textarea, the menu's group title and
 * reason, the reason line and the delegated hint.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Button } from "./Button";
import buttonCss from "./Button.css?raw";
import { Card } from "./Card";
import { HINT_HOVER_DELAY_MS } from "./Hint";
import { OverflowHintHost } from "./OverflowHintHost";
import { Panel } from "./Panel";
import { ReasonLine } from "./ReasonLine";
import { Select } from "./Select";
import { Textarea } from "./Textarea";
import { TextField } from "./TextField";
import toastCss from "./Toast.css?raw";
import { TrackContextMenu } from "./TrackContextMenu";
import indexCss from "../index.css?raw";
import { parseRules, stripComments } from "../test/cssRules";

afterEach(() => vi.useRealTimers());

describe("Button menu pattern and icon size (areas 62, 63)", () => {
  it("draws the word and a small chevron-down, and says it opens a menu", () => {
    const { container } = render(<Button menu>Add filter</Button>);
    const button = screen.getByRole("button", { name: "Add filter" });
    expect(button).toHaveAttribute("aria-haspopup", "menu");
    expect(button).toHaveClass("cp-btn--menu");
    const chevron = container.querySelector(".cp-btn__menu svg");
    expect(chevron).toHaveAttribute("data-icon", "chevron-down");
    expect(chevron).toHaveAttribute("data-size", "sm");
  });

  it("draws a named icon at the small size, never 24", () => {
    const { container } = render(<Button icon="chevron-left">Back</Button>);
    expect(container.querySelector(".cp-btn__icon svg")).toHaveAttribute("data-size", "sm");
    const rules = parseRules(stripComments(buttonCss));
    expect(rules.find((r) => r.selector === ".cp-btn__icon .cp-pixel-icon")!.body).toContain("var(--icon-size-sm)");
  });

  it("hovers with a visible shade, not a brightness nudge (area 79)", () => {
    expect(buttonCss).toContain("var(--hover-shade)");
    expect(buttonCss).not.toMatch(/brightness/);
  });
});

describe("Card and Panel (area 64)", () => {
  it("puts the unit at the far right of the title row", () => {
    const { container } = render(
      <Card title="Tempo" unit="BPM">
        <p>body</p>
      </Card>,
    );
    const head = container.querySelector(".cp-card__head")!;
    expect(head.children[0]).toHaveTextContent("Tempo");
    expect(head.children[0]!.tagName).toBe("H3");
    expect(head.children[1]).toHaveClass("cp-card__unit");
    expect(container.querySelector(".cp-card__body")).toHaveTextContent("body");
  });

  it("draws no heading row without a title or unit", () => {
    const { container } = render(<Card>inside</Card>);
    expect(container.querySelector(".cp-card__head")).toBeNull();
  });

  it("is what a Panel renders, keeping the panel's hooks", () => {
    const { container } = render(
      <Panel title="Appearance" badge={<span>saved</span>}>
        x
      </Panel>,
    );
    const root = container.firstElementChild!;
    expect(root).toHaveClass("cp-card", "cp-panel", "cp-panel--default");
    expect(screen.getByRole("heading", { level: 2, name: "Appearance" })).toHaveClass("cp-panel__title");
    expect(container.querySelector(".cp-panel__body")).toHaveTextContent("x");
    expect(container.querySelector(".cp-card__unit")).toHaveTextContent("saved");
  });
});

describe("TextField, Textarea and Select (areas 77, 78, 87)", () => {
  it("shows the error under the field with a red border and names it", () => {
    render(<TextField label="Name" error="Needs a name" hint="Shown in lists" />);
    const input = screen.getByLabelText("Name");
    expect(input).toHaveClass("cp-field__input--error");
    expect(input).toHaveAttribute("aria-invalid", "true");
    const error = screen.getByText("Needs a name");
    expect(error).toHaveClass("cp-field__error");
    expect(input.getAttribute("aria-describedby")).toBe(error.id);
    expect(screen.queryByText("Shown in lists")).toBeNull();
  });

  it("shows the hint below when there is no error", () => {
    render(<TextField label="Name" hint="Shown in lists" />);
    expect(screen.getByLabelText("Name")).toHaveAccessibleDescription("Shown in lists");
  });

  it("is standard width unless told otherwise", () => {
    const { container, rerender } = render(<TextField label="A" />);
    expect(container.firstElementChild).toHaveClass("cp-field--standard");
    rerender(<TextField label="A" width="short" />);
    expect(container.firstElementChild).toHaveClass("cp-field--short");
    rerender(<TextField label="A" width="full" />);
    expect(container.firstElementChild).toHaveClass("cp-field--full");
  });

  it("gives Select the same error, hint and widths", () => {
    const { container } = render(
      <Select label="Theme" error="Pick one" options={[{ value: "a", label: "A" }]} width="full" />,
    );
    expect(container.firstElementChild).toHaveClass("cp-select", "cp-field--full");
    const select = screen.getByLabelText("Theme");
    expect(select).toHaveClass("cp-select__control--error");
    expect(select).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Pick one")).toHaveClass("cp-field__error");
  });

  it("draws a textarea in the field's box, with the label above and the hint below", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Textarea label="Notes" hint="Optional" onChange={onChange} />);
    const box = screen.getByLabelText("Notes");
    expect(box.tagName).toBe("TEXTAREA");
    expect(box).toHaveClass("cp-field__input", "cp-textarea");
    expect(box).toHaveAccessibleDescription("Optional");
    await user.type(box, "hi");
    expect(onChange).toHaveBeenCalled();
  });

  it("marks a textarea error", () => {
    render(<Textarea label="Message" error="Too short" />);
    const box = screen.getByLabelText("Message");
    expect(box).toHaveClass("cp-field__input--error");
    expect(box).toHaveAttribute("aria-invalid", "true");
  });
});

describe("one square checkbox and radio (area 80)", () => {
  it("replaces the browser control", () => {
    const sheet = stripComments(indexCss);
    expect(sheet).not.toMatch(/accent-color/);
    expect(sheet).toMatch(/appearance:\s*none/);
    expect(sheet).toMatch(/\[type="radio"\]\):hover:not\(:disabled\)/);
  });
});

describe("Toast (area 88)", () => {
  it("is 360 times the scale wide, in the body size", () => {
    expect(toastCss).toMatch(/width:\s*calc\(360px \* var\(--scale\)\)/);
    const toast = parseRules(stripComments(toastCss)).find((r) => r.selector === ".cp-toast")!;
    expect(toast.body).toMatch(/font-size:\s*var\(--text-body\)/);
  });
});

describe("TrackContextMenu group title and reason (area 81)", () => {
  it("draws a group title above its entry that is not an entry", () => {
    render(
      <TrackContextMenu
        x={0}
        y={0}
        onClose={() => undefined}
        items={[
          { id: "a", label: "Play", onSelect: () => undefined },
          { id: "b", label: "Rate", groupTitle: "Organise", separatorBefore: true, onSelect: () => undefined },
        ]}
      />,
    );
    expect(screen.getByText("Organise")).toHaveClass("cp-track-menu__heading");
    expect(screen.getAllByRole("menuitem")).toHaveLength(2);
  });

  it("says why a greyed entry is greyed, on hover, instead of its title", () => {
    vi.useFakeTimers();
    render(
      <TrackContextMenu
        x={0}
        y={0}
        onClose={() => undefined}
        items={[
          { id: "a", label: "Fix", disabled: true, title: "Fixes it", reason: "Select a track first", onSelect: () => undefined },
        ]}
      />,
    );
    const item = screen.getByRole("menuitem", { name: "Fix" });
    fireEvent.pointerEnter(item.closest(".cp-hint") ?? item);
    act(() => {
      vi.advanceTimersByTime(HINT_HOVER_DELAY_MS + 10);
    });
    expect(screen.getByRole("tooltip")).toHaveTextContent("Select a track first");
  });
});

describe("ReasonLine (area 93)", () => {
  it("draws the reason, and nothing without one", () => {
    const { container, rerender } = render(<ReasonLine id="why">Choose a playlist first</ReasonLine>);
    expect(screen.getByRole("note")).toHaveTextContent("Choose a playlist first");
    expect(screen.getByRole("note")).toHaveAttribute("id", "why");
    rerender(<ReasonLine>{null}</ReasonLine>);
    expect(container).toBeEmptyDOMElement();
    rerender(<ReasonLine align="end">Why</ReasonLine>);
    expect(screen.getByRole("note")).toHaveClass("cp-reason--end");
  });
});

describe("delegated data-hint (area 69)", () => {
  it("shows its words after a rest, whether or not the element is cut short", () => {
    vi.useFakeTimers();
    render(
      <>
        <OverflowHintHost />
        <span data-testid="chip" data-hint="A minor">
          8A
        </span>
      </>,
    );
    fireEvent.pointerOver(screen.getByTestId("chip"));
    act(() => {
      vi.advanceTimersByTime(HINT_HOVER_DELAY_MS + 10);
    });
    expect(screen.getByRole("tooltip")).toHaveTextContent("A minor");
  });
});
