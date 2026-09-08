/**
 * Choosing one thing out of a list, by typing (ORG-11).
 *
 * The two properties worth having: **typing narrows and Enter takes what is
 * left**, which is what makes 200 Collections usable; and **a row that cannot
 * be chosen is drawn and skipped** rather than hidden, because a tree with its
 * folders removed is a list whose indentation means nothing.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PickerDialog, type PickerItem } from "./PickerDialog";

const ITEMS: PickerItem[] = [
  { id: 1, label: "Sets", depth: 0, disabled: true, icon: "folder" },
  { id: 2, label: "Warmups", depth: 1, icon: "collections", hint: "12" },
  { id: 3, label: "Closers", depth: 1, icon: "collections", hint: "4" },
  { id: 4, label: "Recent techno", depth: 0, disabled: true, icon: "smart" },
];

function draw(props: Partial<React.ComponentProps<typeof PickerDialog>> = {}) {
  const onChoose = vi.fn();
  const onClose = vi.fn();
  const view = render(
    <PickerDialog
      open
      title="Add to Collection"
      items={ITEMS}
      onChoose={onChoose}
      onClose={onClose}
      {...props}
    />,
  );
  return { ...view, onChoose, onClose };
}

function filter(): HTMLElement {
  return screen.getByRole("textbox");
}

describe("the list", () => {
  it("shows everything, including what cannot be chosen", () => {
    draw();
    expect(screen.getAllByRole("option").map((node) => node.textContent)).toEqual([
      "Sets",
      "Warmups12",
      "Closers4",
      "Recent techno",
    ]);
  });

  it("marks a folder and a Smart Collection as not choosable (DEC-061)", () => {
    draw();
    expect(screen.getByRole("option", { name: /Sets/ })).toBeDisabled();
    expect(screen.getByRole("option", { name: /Recent techno/ })).toBeDisabled();
    expect(screen.getByRole("option", { name: /Warmups/ })).toBeEnabled();
  });

  it("chooses one that is clicked", async () => {
    const { onChoose } = draw();

    await userEvent.click(screen.getByRole("option", { name: /Closers/ }));

    expect(onChoose).toHaveBeenCalledWith(expect.objectContaining({ id: 3 }));
  });

  it("does not choose one that cannot be", async () => {
    const { onChoose } = draw();

    await userEvent.click(screen.getByRole("option", { name: /Sets/ }));

    expect(onChoose).not.toHaveBeenCalled();
  });

  it("says when nothing is left", () => {
    draw({ items: [], emptyText: "There are no Collections yet." });
    expect(screen.getByText("There are no Collections yet.")).toBeInTheDocument();
  });
});

describe("typing", () => {
  it("narrows the list, ignoring case", () => {
    draw();

    fireEvent.change(filter(), { target: { value: "clos" } });

    expect(screen.getAllByRole("option").map((node) => node.textContent)).toEqual([
      "Closers4",
    ]);
  });

  it("takes the focus, because typing is the whole gesture", () => {
    draw();
    expect(filter()).toHaveFocus();
  });

  it("chooses what is left when Enter is pressed", () => {
    const { onChoose } = draw();

    fireEvent.change(filter(), { target: { value: "warm" } });
    fireEvent.keyDown(filter(), { key: "Enter" });

    expect(onChoose).toHaveBeenCalledWith(expect.objectContaining({ id: 2 }));
  });

  it("moves through what is left with the arrows, skipping what cannot be chosen", () => {
    const { onChoose } = draw();

    // The first choosable row is highlighted, not the folder above it.
    fireEvent.keyDown(filter(), { key: "ArrowDown" });
    fireEvent.keyDown(filter(), { key: "Enter" });

    expect(onChoose).toHaveBeenCalledWith(expect.objectContaining({ id: 3 }));
  });

  it("wraps rather than stopping at the end", () => {
    const { onChoose } = draw();

    fireEvent.keyDown(filter(), { key: "ArrowUp" });
    fireEvent.keyDown(filter(), { key: "Enter" });

    expect(onChoose).toHaveBeenCalledWith(expect.objectContaining({ id: 3 }));
  });

  it("starts again from the top when the list changes underneath", () => {
    // Otherwise the highlight is on row 4 of a list that now has one row, and
    // Enter chooses nothing.
    const { onChoose } = draw();

    fireEvent.keyDown(filter(), { key: "ArrowDown" });
    fireEvent.change(filter(), { target: { value: "warm" } });
    fireEvent.keyDown(filter(), { key: "Enter" });

    expect(onChoose).toHaveBeenCalledWith(expect.objectContaining({ id: 2 }));
  });
});

describe("making one instead", () => {
  it("is offered for a name that is not in the list", () => {
    const onCreate = vi.fn();
    draw({ items: ITEMS, onCreate });

    fireEvent.change(filter(), { target: { value: "Peak-time" } });

    expect(screen.getByRole("button", { name: /Create “Peak-time”/ })).toBeInTheDocument();
  });

  it("is not offered for a name that already exists", () => {
    // `create_or_get` would reuse it anyway; offering to make it says
    // otherwise.
    const onCreate = vi.fn();
    draw({ items: ITEMS, onCreate });

    fireEvent.change(filter(), { target: { value: "warmups" } });

    expect(screen.queryByRole("button", { name: /Create/ })).not.toBeInTheDocument();
  });

  it("is not offered at all when the caller cannot make one", () => {
    // A Collection needs a place in the tree, which this dialog cannot ask
    // about.
    draw();
    fireEvent.change(filter(), { target: { value: "Something new" } });
    expect(screen.queryByRole("button", { name: /Create/ })).not.toBeInTheDocument();
  });

  it("makes one on Enter when nothing matched", () => {
    const onCreate = vi.fn();
    draw({ items: ITEMS, onCreate });

    fireEvent.change(filter(), { target: { value: "Peak-time" } });
    fireEvent.keyDown(filter(), { key: "Enter" });

    expect(onCreate).toHaveBeenCalledWith("Peak-time");
  });

  it("trims what was typed, as the engine would", () => {
    const onCreate = vi.fn();
    draw({ items: ITEMS, onCreate });

    fireEvent.change(filter(), { target: { value: "  Peak-time  " } });
    fireEvent.click(screen.getByRole("button", { name: /Create/ }));

    expect(onCreate).toHaveBeenCalledWith("Peak-time");
  });
});

describe("the dialog itself", () => {
  it("closes on Escape, like every other dialog (SHELL-10)", () => {
    const { onClose } = draw();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("renders nothing when it is not open", () => {
    draw({ open: false });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
