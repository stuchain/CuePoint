/**
 * Choosing columns without a mouse (LIBUI-06, DEC-042).
 *
 * Dragging a header is the quick path and the one a keyboard cannot take, so
 * everything a drag can do is here as a button. The tests that matter are the
 * refusals: the last visible column cannot be hidden, and a move that would
 * put a scrolling column ahead of a pinned one is not offered at all — a
 * control that looks pressable and does nothing is worse than a disabled one.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

import { ColumnPicker } from "./ColumnPicker";
import { defaultLayout, toggleHidden, type ColumnLayout } from "./columnLayout";
import type { TrackColumnDef } from "./trackTableLayout";

interface Row {
  title: string;
}

const COLUMNS: TrackColumnDef<Row>[] = [
  { id: "title", header: "Title", sticky: true, render: (r) => r.title },
  { id: "artist", header: "Artist", render: () => null },
  { id: "bpm", header: "BPM", render: () => null },
];

function show(layout: ColumnLayout = defaultLayout(COLUMNS, 1), props = {}) {
  const handlers = {
    onToggle: vi.fn(),
    onNudge: vi.fn(),
    onReset: vi.fn(),
    onClose: vi.fn(),
    ...props,
  };
  render(
    <ColumnPicker
      open
      columns={COLUMNS}
      layout={layout}
      onToggle={handlers.onToggle}
      onNudge={handlers.onNudge}
      onReset={handlers.onReset}
      onClose={handlers.onClose}
    />,
  );
  return handlers;
}

function rowFor(header: string): HTMLElement {
  return screen.getByText(header).closest("li") as HTMLElement;
}

describe("the list", () => {
  it("shows every column, hidden ones included", () => {
    show(toggleHidden(defaultLayout(COLUMNS, 1), "artist"));

    expect(screen.getByText("Title")).toBeInTheDocument();
    expect(screen.getByText("Artist")).toBeInTheDocument();
    expect(screen.getByText("BPM")).toBeInTheDocument();
  });

  it("shows them in layout order, not registry order", () => {
    const layout: ColumnLayout = [
      { id: "title", width: 100, hidden: false },
      { id: "bpm", width: 100, hidden: false },
      { id: "artist", width: 100, hidden: false },
    ];
    show(layout);

    const labels = screen.getAllByRole("listitem").map((item) => item.textContent);
    expect(labels[1]).toContain("BPM");
    expect(labels[2]).toContain("Artist");
  });

  it("ticks what is shown and unticks what is hidden", () => {
    show(toggleHidden(defaultLayout(COLUMNS, 1), "artist"));

    expect(within(rowFor("Title")).getByRole("checkbox")).toBeChecked();
    expect(within(rowFor("Artist")).getByRole("checkbox")).not.toBeChecked();
  });

  it("says which column is pinned", () => {
    show();
    expect(within(rowFor("Title")).getByText("pinned")).toBeInTheDocument();
  });

  it("renders nothing when closed", () => {
    render(
      <ColumnPicker
        open={false}
        columns={COLUMNS}
        layout={defaultLayout(COLUMNS, 1)}
        onToggle={vi.fn()}
        onNudge={vi.fn()}
        onReset={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByText("Columns")).not.toBeInTheDocument();
  });
});

describe("hiding and showing", () => {
  it("asks to hide a column", () => {
    const handlers = show();

    fireEvent.click(within(rowFor("Artist")).getByRole("checkbox"));

    expect(handlers.onToggle).toHaveBeenCalledWith("artist");
  });

  it("will not offer to hide the last visible one", () => {
    let layout = defaultLayout(COLUMNS, 1);
    layout = toggleHidden(layout, "artist");
    layout = toggleHidden(layout, "bpm");
    show(layout);

    expect(within(rowFor("Title")).getByRole("checkbox")).toBeDisabled();
  });
});

describe("moving", () => {
  it("asks to move a column left", () => {
    const handlers = show();

    fireEvent.click(screen.getByRole("button", { name: "Move BPM left" }));

    expect(handlers.onNudge).toHaveBeenCalledWith("bpm", -1);
  });

  it("asks to move a column right", () => {
    const handlers = show();

    fireEvent.click(screen.getByRole("button", { name: "Move Artist right" }));

    expect(handlers.onNudge).toHaveBeenCalledWith("artist", 1);
  });

  it("does not offer a move past the pinned column", () => {
    show();
    expect(screen.getByRole("button", { name: "Move Artist left" })).toBeDisabled();
  });

  it("does not offer a move past the end", () => {
    show();
    expect(screen.getByRole("button", { name: "Move BPM right" })).toBeDisabled();
  });

  it("does not offer to move the only pinned column", () => {
    show();
    expect(screen.getByRole("button", { name: "Move Title left" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move Title right" })).toBeDisabled();
  });
});

describe("reset", () => {
  it("is offered", () => {
    const handlers = show();

    fireEvent.click(screen.getByRole("button", { name: "Reset columns" }));

    expect(handlers.onReset).toHaveBeenCalled();
  });
});
