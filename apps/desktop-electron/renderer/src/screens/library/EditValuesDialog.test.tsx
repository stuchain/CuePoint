/**
 * The edit dialog shows a track's current values when it is given them
 * (PAGES-07B, for Track details).
 */
import { useLayoutEffect } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

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
    expect(screen.getAllByText("Now: none")).toHaveLength(3);
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

  it("asks with the shared text above the threshold", () => {
    expect(BATCH_RECORDED_NOTE).toMatch(/^It runs in the background; you can keep working\./);
  });
});
