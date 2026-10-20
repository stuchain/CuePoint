import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ScaleProvider } from "../../tokens/ScaleContext";
import { SetNotesDialog } from "./SetNotesDialog";

function dialog(set: { name: string; notes: string | null } | null, onSave = vi.fn()) {
  return (
    <ScaleProvider>
      <SetNotesDialog set={set} onSave={onSave} onClose={vi.fn()} />
    </ScaleProvider>
  );
}

describe("SetNotesDialog", () => {
  it("opens with the saved notes", () => {
    render(dialog({ name: "Friday", notes: "The Loft" }));
    expect(screen.getByLabelText("Notes")).toHaveValue("The Loft");
  });

  it("keeps what was typed when the page redraws with a fresh Set object (PREP-12)", () => {
    const onSave = vi.fn();
    const { rerender } = render(dialog({ name: "Friday", notes: null }, onSave));
    fireEvent.change(screen.getByLabelText("Notes"), { target: { value: "The Loft, 23:00 to 01:00" } });
    rerender(dialog({ name: "Friday", notes: null }, onSave));
    expect(screen.getByLabelText("Notes")).toHaveValue("The Loft, 23:00 to 01:00");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith("The Loft, 23:00 to 01:00");
  });

  it("starts again from the saved notes when reopened", () => {
    const { rerender } = render(dialog({ name: "Friday", notes: "Old" }));
    fireEvent.change(screen.getByLabelText("Notes"), { target: { value: "Unsaved" } });
    rerender(dialog(null));
    rerender(dialog({ name: "Friday", notes: "Old" }));
    expect(screen.getByLabelText("Notes")).toHaveValue("Old");
  });
});
