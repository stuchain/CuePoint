import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { SetChapterPlan } from "../../api/cuepointBridge.types";
import { ScaleProvider } from "../../tokens/ScaleContext";
import { ChapterDialog } from "./ChapterDialog";

const CHAPTER = {
  id: 2,
  position: 1,
  name: "Peak",
  target_seconds: null,
  bpm_min: null,
  bpm_max: null,
  notes: null,
  entry_ids: [],
} as unknown as SetChapterPlan;

function renderDialog(props: Partial<React.ComponentProps<typeof ChapterDialog>> = {}) {
  const handlers = { onSave: vi.fn(), onClose: vi.fn(), onMove: vi.fn(), onDelete: vi.fn() };
  const draw = (extra: Partial<React.ComponentProps<typeof ChapterDialog>>) => (
    <ScaleProvider>
      <ChapterDialog chapter={CHAPTER} canMoveUp canMoveDown canDelete {...handlers} {...props} {...extra} />
    </ScaleProvider>
  );
  const view = render(draw({}));
  return { ...handlers, rerender: (extra: Partial<React.ComponentProps<typeof ChapterDialog>>) => view.rerender(draw(extra)) };
}

describe("ChapterDialog's place and delete buttons", () => {
  it("move the chapter up and down, and ask to delete it", () => {
    const { onMove, onDelete } = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Move up" }));
    expect(onMove).toHaveBeenLastCalledWith(-1);
    fireEvent.click(screen.getByRole("button", { name: "Move down" }));
    expect(onMove).toHaveBeenLastCalledWith(1);
    fireEvent.click(screen.getByRole("button", { name: "Delete chapter…" }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("cannot move the first chapter up, the last down, or delete the only one", () => {
    const { onMove, onDelete } = renderDialog({ canMoveUp: false, canMoveDown: false, canDelete: false });
    for (const name of ["Move up", "Move down", "Delete chapter…"]) {
      const button = screen.getByRole("button", { name });
      expect(button).toBeDisabled();
      fireEvent.click(button);
    }
    expect(onMove).not.toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("are all disabled unless the page says the chapter can go", () => {
    renderDialog({ canMoveUp: undefined, canMoveDown: undefined, canDelete: undefined });
    expect(screen.getByRole("button", { name: "Move up" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move down" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Delete chapter…" })).toBeDisabled();
  });

  it("moves focus to the other move button when the one pressed can go no further", () => {
    const view = renderDialog();
    const up = screen.getByRole("button", { name: "Move up" });
    up.focus();
    view.rerender({ canMoveUp: false });
    expect(screen.getByRole("button", { name: "Move down" })).toHaveFocus();
  });

  it("keeps what was typed when the chapter moves under the dialog", () => {
    const view = renderDialog();
    fireEvent.change(screen.getByRole("textbox", { name: /^Name/ }), { target: { value: "Drop" } });
    view.rerender({ chapter: { ...CHAPTER, position: 0 } });
    expect(screen.getByRole("textbox", { name: /^Name/ })).toHaveValue("Drop");
  });
});

describe("ChapterDialog's footer and errors (areas 75, 77, 92)", () => {
  it("is titled with the action's words and the chapter's name in curly quotes", () => {
    renderDialog();
    expect(screen.getByRole("dialog", { name: "Edit chapter “Peak”" })).toBeInTheDocument();
  });

  it("keeps the place and delete buttons in the footer, beside Save, not in the body", () => {
    renderDialog();
    const dialog = screen.getByRole("dialog");
    const footer = dialog.querySelector(".cp-modal__footer")!;
    for (const name of ["Move up", "Move down", "Delete chapter…", "Save"]) {
      expect(footer).toContainElement(screen.getByRole("button", { name }));
    }
  });

  it("puts the engine's reason under the target length, on the field", () => {
    renderDialog({ error: "Not a time: soon" });
    const field = screen.getByRole("textbox", { name: /^Target length/ });
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field).toHaveAccessibleDescription(/Not a time: soon/);
  });

  it("puts a BPM that is not a number on that BPM field before asking", () => {
    const { onSave } = renderDialog();
    fireEvent.change(screen.getByRole("textbox", { name: "Highest BPM" }), { target: { value: "fast" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("textbox", { name: "Highest BPM" })).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("textbox", { name: "Lowest BPM" })).not.toHaveAttribute("aria-invalid", "true");
    expect(onSave).not.toHaveBeenCalled();
  });

  it("asks for the notes in the one Textarea, with its label above", () => {
    renderDialog();
    expect(screen.getByRole("textbox", { name: "Notes" }).tagName).toBe("TEXTAREA");
  });
});
