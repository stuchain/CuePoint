/**
 * The edit dialog shows a track's current values when it is given them
 * (PAGES-07B, for Track details).
 */
import { useLayoutEffect } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { EditValuesDialog } from "./EditValuesDialog";
import { BATCH_RECORDED_NOTE } from "./libraryBatch";

describe("EditValuesDialog", () => {
  it("shows the track's current values, and none for a field without one", () => {
    render(
      <EditValuesDialog
        open
        count={1}
        onClose={vi.fn()}
        onEdit={vi.fn()}
        current={{ key: "8A", bpm: "128", genre: null }}
      />,
    );
    expect(screen.getByText("Now: 8A")).toBeInTheDocument();
    expect(screen.getByText("Now: 128")).toBeInTheDocument();
    // Genre, Label and Year have none.
    expect(screen.getAllByText("Now: not set")).toHaveLength(3);
  });

  it("shows no current values for many tracks", () => {
    render(<EditValuesDialog open count={5} onClose={vi.fn()} onEdit={vi.fn()} />);
    expect(screen.queryByText(/^Now:/)).toBeNull();
  });

  it("keeps a value typed as soon as it is on screen", () => {
    // A value typed in the commit that shows the dialog, before passive effects
    // run (a fast typist, or a test driving the real app). The empty form must
    // already be in place, and must not wipe what was typed after it.
    function TypeAtOnce({ open }: { open: boolean }) {
      useLayoutEffect(() => {
        if (!open) return;
        fireEvent.change(screen.getByRole("textbox", { name: "BPM value" }), {
          target: { value: "126" },
        });
      }, [open]);
      return null;
    }
    const tree = (open: boolean) => (
      <>
        <EditValuesDialog open={open} count={3} onClose={vi.fn()} onEdit={vi.fn()} />
        <TypeAtOnce open={open} />
      </>
    );
    const { rerender } = render(tree(false));
    rerender(tree(true));
    expect(screen.getByRole("textbox", { name: "BPM value" })).toHaveValue("126");
  });

  it("says what is kept and what is not touched", () => {
    render(<EditValuesDialog open count={3} onClose={vi.fn()} onEdit={vi.fn()} />);
    expect(
      screen.getByText(
        "Changes are kept in CuePoint and can be undone. Rekordbox\u2019s own values are not touched.",
      ),
    ).toBeInTheDocument();
  });

  it("names the tracks on the button and greys it, with the reason, until a value is set or cleared", () => {
    render(<EditValuesDialog open count={3} onClose={vi.fn()} onEdit={vi.fn()} />);
    const button = screen.getByRole("button", { name: "Change 3 tracks" });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription("Set or clear at least one value.");
    // In the body, as a Notice, not floating right-aligned over the footer (new C, as Sync and Export).
    const note = screen.getByText("Set or clear at least one value.");
    expect(note.closest(".cp-notice")).not.toBeNull();
    expect(note.closest(".cp-modal__body")).not.toBeNull();
    expect(document.querySelector(".cp-modal__reason")?.textContent ?? "").toBe("");

    fireEvent.change(screen.getByRole("textbox", { name: "BPM value" }), {
      target: { value: "126" },
    });
    expect(screen.getByRole("button", { name: "Change 3 tracks" })).toBeEnabled();
    expect(screen.queryByText("Set or clear at least one value.")).toBeNull();

    fireEvent.change(screen.getByRole("textbox", { name: "BPM value" }), {
      target: { value: "" },
    });
    expect(screen.getByRole("button", { name: "Change 3 tracks" })).toBeDisabled();
  });

  it("clearing a field counts as a change", () => {
    render(<EditValuesDialog open count={1} onClose={vi.fn()} onEdit={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Change 1 track" })).toBeDisabled();
    fireEvent.change(screen.getByRole("combobox", { name: "Genre" }), {
      target: { value: "clear" },
    });
    expect(screen.getByRole("button", { name: "Change 1 track" })).toBeEnabled();
  });

  it("keeps the same label in the asking stage above the threshold", async () => {
    const onEdit = vi.fn().mockResolvedValue(null);
    render(<EditValuesDialog open count={4213} onClose={vi.fn()} onEdit={onEdit} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Genre value" }), {
      target: { value: "House" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Change 4,213 tracks" }));
    expect(onEdit).not.toHaveBeenCalled();
    expect(screen.getByText("Change 4,213 tracks?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Change 4,213 tracks" }));
    await waitFor(() => expect(onEdit).toHaveBeenCalledTimes(1));
  });

  it("asks with the shared text above the threshold", () => {
    expect(BATCH_RECORDED_NOTE).toMatch(/^It runs in the background; you can keep working\./);
  });
});
