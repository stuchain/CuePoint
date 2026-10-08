/**
 * The in-app suggestion list that replaced the native <datalist> (which crashed
 * Electron 34 on macOS as a value was typed). Same pattern as GlobalSearch.
 */
import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";

import css from "./SuggestInput.css?raw";
import { SuggestInput, type Suggestion } from "./SuggestInput";
import { matchSuggestions } from "./suggestMatch";

const ITEMS: Suggestion[] = [
  { value: "Deep House", detail: "1,204" },
  { value: "House" },
  { value: "Techno", detail: "380" },
];

function Harness({
  onPick = vi.fn(),
  onKeyDown,
  suggestions = ITEMS,
  clearRef,
}: {
  onPick?: (v: string) => void;
  onKeyDown?: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  suggestions?: readonly Suggestion[];
  /** Receives a function that sets the text from outside, as a caller does after it adds a tag. */
  clearRef?: { current: ((text: string) => void) | null };
}) {
  const [value, setValue] = useState("");
  if (clearRef) clearRef.current = setValue;
  return (
    <>
      <label htmlFor="f">Genre</label>
      <SuggestInput
        id="f"
        value={value}
        suggestions={suggestions}
        onChange={(event) => setValue(event.target.value)}
        onPick={(picked) => {
          setValue(picked);
          onPick(picked);
        }}
        onKeyDown={onKeyDown}
      />
      <button type="button">Elsewhere</button>
    </>
  );
}

describe("matchSuggestions", () => {
  it("keeps every suggestion the text appears in, in any case", () => {
    expect(matchSuggestions(ITEMS, "HOUSE").map((i) => i.value)).toEqual(["Deep House", "House"]);
    expect(matchSuggestions(ITEMS, "").length).toBe(3);
  });

  it("offers nothing more once the text is the only one left", () => {
    expect(matchSuggestions(ITEMS, "techno")).toEqual([]);
  });
});

describe("SuggestInput", () => {
  it("is a combobox with spell checking off and no native list", () => {
    render(<Harness />);
    const field = screen.getByRole("combobox", { name: "Genre" });
    expect(field).toHaveAttribute("aria-expanded", "false");
    expect(field).toHaveAttribute("spellcheck", "false");
    expect(field).not.toHaveAttribute("list");
    expect(document.querySelector("datalist")).toBeNull();
  });

  it("opens as text is typed and lists only what matches", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const field = screen.getByRole("combobox");
    await user.type(field, "hou");

    expect(field).toHaveAttribute("aria-expanded", "true");
    expect(field).toHaveAttribute("aria-controls", screen.getByRole("listbox").id);
    expect(screen.getAllByRole("option")).toHaveLength(2);
    expect(screen.getByRole("option", { name: /Deep House/ })).toHaveTextContent("1,204");
  });

  it("moves with the arrows, chooses with Enter and closes", async () => {
    const onPick = vi.fn();
    const user = userEvent.setup();
    render(<Harness onPick={onPick} />);
    const field = screen.getByRole("combobox");
    await user.type(field, "hou");
    expect(field).not.toHaveAttribute("aria-activedescendant");

    await user.keyboard("{ArrowDown}");
    const options = screen.getAllByRole("option");
    expect(field).toHaveAttribute("aria-activedescendant", options[0]!.id);
    expect(options[0]).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{ArrowDown}");
    expect(field).toHaveAttribute("aria-activedescendant", options[1]!.id);
    await user.keyboard("{ArrowDown}");
    expect(field).toHaveAttribute("aria-activedescendant", options[1]!.id);
    await user.keyboard("{ArrowUp}{Enter}");

    expect(onPick).toHaveBeenCalledWith("Deep House");
    expect(field).toHaveValue("Deep House");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(field).toHaveAttribute("aria-expanded", "false");
  });

  it("leaves Enter to the field when no option is on", async () => {
    const onKeyDown = vi.fn();
    const user = userEvent.setup();
    render(<Harness onKeyDown={onKeyDown} />);
    await user.type(screen.getByRole("combobox"), "hou{Enter}");
    expect(onKeyDown).toHaveBeenCalledWith(expect.objectContaining({ key: "Enter" }));
  });

  it("closes on Escape without letting it reach what is around the field", async () => {
    const outer = vi.fn();
    const user = userEvent.setup();
    render(
      <div onKeyDown={outer}>
        <Harness />
      </div>,
    );
    await user.type(screen.getByRole("combobox"), "hou");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(outer).not.toHaveBeenCalledWith(expect.objectContaining({ key: "Escape" }));

    // A second Escape, with nothing open, is the dialog's.
    await user.keyboard("{Escape}");
    expect(outer).toHaveBeenCalledWith(expect.objectContaining({ key: "Escape" }));
  });

  it("brings the list back with the Down arrow, then moves", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const field = screen.getByRole("combobox");
    await user.type(field, "hou{Escape}");
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(field).not.toHaveAttribute("aria-activedescendant");
    await user.keyboard("{ArrowDown}");
    expect(field).toHaveAttribute("aria-activedescendant");
  });

  it("chooses on a click and keeps focus in the field", async () => {
    const onPick = vi.fn();
    const user = userEvent.setup();
    render(<Harness onPick={onPick} />);
    const field = screen.getByRole("combobox");
    await user.type(field, "tech");
    // Only the text itself would be left; go back to a partial one.
    await user.clear(field);
    await user.type(field, "te");
    await user.click(screen.getByRole("option", { name: /Techno/ }));

    expect(onPick).toHaveBeenCalledWith("Techno");
    expect(field).toHaveFocus();
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("follows the pointer with the active option", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const field = screen.getByRole("combobox");
    await user.type(field, "hou");
    const second = screen.getAllByRole("option")[1]!;
    fireEvent.mouseMove(second);
    expect(field).toHaveAttribute("aria-activedescendant", second.id);
  });

  it("closes when a press lands outside or focus moves away", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByRole("combobox"), "hou");
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Elsewhere" }));
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("draws the list absolutely, below the field, so nothing moves when it opens", () => {
    const rule = /\.cp-suggest__list\s*\{([^}]*)\}/.exec(css)![1]!;
    expect(rule).toMatch(/position:\s*absolute/);
    expect(rule).toMatch(/top:\s*100%/);
  });

  it("closes when the text is cleared from outside", async () => {
    const clearRef: { current: ((text: string) => void) | null } = { current: null };
    const user = userEvent.setup();
    render(<Harness clearRef={clearRef} />);
    const field = screen.getByRole("combobox");
    await user.type(field, "hou");
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    act(() => clearRef.current!(""));
    expect(field).toHaveValue("");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("closes when the caller handles Enter", async () => {
    const user = userEvent.setup();
    render(<Harness onKeyDown={(event) => event.key === "Enter" && event.preventDefault()} />);
    await user.type(screen.getByRole("combobox"), "hou{Enter}");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("flips above the field when there is no room below it in a clipping parent", async () => {
    const user = userEvent.setup();
    const rect = (top: number, bottom: number) =>
      ({ top, bottom, left: 0, right: 100, width: 100, height: bottom - top, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;
    const spy = vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      if (this.getAttribute("data-testid") === "clip") return rect(0, 300);
      if (this.classList.contains("cp-suggest")) return rect(240, 270);
      if (this.classList.contains("cp-suggest__list")) return rect(270, 400);
      return rect(0, 0);
    });
    try {
      render(
        <div data-testid="clip" style={{ overflowY: "auto" }}>
          <Harness />
        </div>,
      );
      await user.type(screen.getByRole("combobox"), "hou");
      expect(screen.getByRole("listbox")).toHaveClass("cp-suggest__list--above");
    } finally {
      spy.mockRestore();
    }
  });

  it("stays below the field when there is room", async () => {
    const user = userEvent.setup();
    const rect = (top: number, bottom: number) =>
      ({ top, bottom, left: 0, right: 100, width: 100, height: bottom - top, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;
    const spy = vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      if (this.getAttribute("data-testid") === "clip") return rect(0, 900);
      if (this.classList.contains("cp-suggest")) return rect(40, 70);
      if (this.classList.contains("cp-suggest__list")) return rect(70, 200);
      return rect(0, 0);
    });
    try {
      render(
        <div data-testid="clip" style={{ overflowY: "auto" }}>
          <Harness />
        </div>,
      );
      await user.type(screen.getByRole("combobox"), "hou");
      expect(screen.getByRole("listbox")).not.toHaveClass("cp-suggest__list--above");
    } finally {
      spy.mockRestore();
    }
  });

  it("leaves arrows, Enter and opening to an input method while it composes", async () => {
    const onKeyDown = vi.fn();
    const onPick = vi.fn();
    const user = userEvent.setup();
    render(<Harness onKeyDown={onKeyDown} onPick={onPick} />);
    const field = screen.getByRole("combobox");
    await user.type(field, "hou");
    await user.keyboard("{ArrowDown}");
    const active = field.getAttribute("aria-activedescendant");
    expect(active).toBeTruthy();

    // Arrow while composing: the list stays where it is, and the key goes on.
    expect(fireEvent.keyDown(field, { key: "ArrowDown", isComposing: true })).toBe(true);
    expect(field).toHaveAttribute("aria-activedescendant", active!);
    expect(onKeyDown).toHaveBeenCalledWith(expect.objectContaining({ key: "ArrowDown" }));

    // Enter that confirms a candidate (keyCode 229) must not choose the option.
    expect(fireEvent.keyDown(field, { key: "Enter", keyCode: 229 })).toBe(true);
    expect(onPick).not.toHaveBeenCalled();
    expect(onKeyDown).toHaveBeenCalledWith(expect.objectContaining({ key: "Enter" }));

    // Escape closes the list; an arrow during composition does not bring it back.
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).toBeNull();
    fireEvent.keyDown(field, { key: "ArrowDown", isComposing: true });
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("does not open as composed text changes, and opens when composition ends", () => {
    render(<Harness />);
    const field = screen.getByRole("combobox");
    fireEvent.compositionStart(field);
    fireEvent.input(field, { target: { value: "ho" }, isComposing: true });
    expect(screen.queryByRole("listbox")).toBeNull();
    fireEvent.compositionEnd(field);
    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });

  it("shows at most 50 options and says how many more there are", async () => {
    const many = Array.from({ length: 1284 }, (_, i) => ({ value: `Tag ${String(i).padStart(4, "0")}` }));
    const user = userEvent.setup();
    render(<Harness suggestions={many} />);
    const field = screen.getByRole("combobox");
    await user.type(field, "tag");

    expect(screen.getAllByRole("option")).toHaveLength(50);
    const list = screen.getByRole("listbox");
    expect(list).toHaveTextContent("Type to narrow 1,234 more");
    expect(within(list).queryByText(/Type to narrow/)?.closest('[role="option"]')).toBeNull();

    // The arrows stop at the last option shown, not the note.
    await user.keyboard("{ArrowUp}");
    for (let i = 0; i < 60; i += 1) await user.keyboard("{ArrowDown}");
    expect(field).toHaveAttribute("aria-activedescendant", screen.getAllByRole("option")[49]!.id);
  });

  it("drops the active option when the matches change under it", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Harness suggestions={ITEMS} />);
    const field = screen.getByRole("combobox");
    await user.type(field, "e");
    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(field).toHaveAttribute("aria-activedescendant");

    // Same number of matches, different ones: the option "on" is no longer the one that was.
    rerender(<Harness suggestions={[{ value: "Ambient" }, { value: "Breaks" }, { value: "Electro" }]} />);
    expect(field).not.toHaveAttribute("aria-activedescendant");
    await user.keyboard("{Enter}");
    expect(screen.queryByRole("listbox")).not.toBeNull();
  });

  it("clamps the active option when fewer matches are left", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Harness suggestions={ITEMS} />);
    const field = screen.getByRole("combobox");
    await user.type(field, "e");
    await user.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}");
    rerender(<Harness suggestions={[{ value: "Electro" }, { value: "Deep" }]} />);
    const active = field.getAttribute("aria-activedescendant");
    if (active) expect(document.getElementById(active)).not.toBeNull();
  });
});
