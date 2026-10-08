/**
 * The edit dialog shows a track's current values when it is given them
 * (PAGES-07B, for Track details).
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

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

  it("asks with the shared text above the threshold", () => {
    expect(BATCH_RECORDED_NOTE).toMatch(/^It runs in the background; you can keep working\./);
  });
});
