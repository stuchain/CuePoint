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
import pickerCss from "./ColumnPicker.css?raw";
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

  it("says a pinned column is always shown, and does not offer to hide it (M256)", () => {
    show();
    expect(within(rowFor("Title")).getByText("· always shown")).toBeInTheDocument();
    expect(within(rowFor("Title")).getByRole("checkbox")).toBeDisabled();
    expect(screen.queryByText("Pinned")).toBeNull();
  });

  it("lists the shown columns first and the hidden ones under them as ticks alone, with nothing to move (M256)", () => {
    show(toggleHidden(defaultLayout(COLUMNS, 1), "artist"));
    const lists = screen.getAllByRole("list");
    expect(lists).toHaveLength(2);
    expect(within(lists[0]!).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      expect.stringContaining("Title"),
      expect.stringContaining("BPM"),
    ]);
    const waiting = within(screen.getByRole("list", { name: "Columns not shown" }));
    expect(waiting.getByText("Artist")).toBeInTheDocument();
    expect(waiting.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("button", { name: "Move Artist up" })).toBeNull();
  });

  it("draws no second list when every column is shown", () => {
    show();
    expect(screen.getAllByRole("list")).toHaveLength(1);
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
  it("orders the vertical list with up and down arrows, not left and right", () => {
    show();
    expect(screen.queryByRole("button", { name: /Move .* (left|right)$/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Move BPM up" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Move BPM down" })).toBeInTheDocument();
  });

  it("asks to move a column up", () => {
    const handlers = show();

    fireEvent.click(screen.getByRole("button", { name: "Move BPM up" }));

    expect(handlers.onNudge).toHaveBeenCalledWith("bpm", -1);
  });

  it("asks to move a column down", () => {
    const handlers = show();

    fireEvent.click(screen.getByRole("button", { name: "Move Artist down" }));

    expect(handlers.onNudge).toHaveBeenCalledWith("artist", 1);
  });

  it("does not offer a move past the pinned column", () => {
    show();
    expect(screen.getByRole("button", { name: "Move Artist up" })).toBeDisabled();
  });

  it("does not offer a move past the end", () => {
    show();
    expect(screen.getByRole("button", { name: "Move BPM down" })).toBeDisabled();
  });

  it("does not offer to move the only pinned column", () => {
    show();
    expect(screen.getByRole("button", { name: "Move Title up" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move Title down" })).toBeDisabled();
  });
});

describe("moving from the keyboard and by drag (M256)", () => {
  it("moves a column with Alt and Up or Down on its tick", () => {
    const handlers = show();
    const tick = within(rowFor("BPM")).getByRole("checkbox");
    fireEvent.keyDown(tick, { key: "ArrowUp", altKey: true });
    expect(handlers.onNudge).toHaveBeenCalledWith("bpm", -1);
    // BPM is last: down is not offered, and nothing is asked.
    handlers.onNudge.mockClear();
    fireEvent.keyDown(tick, { key: "ArrowDown", altKey: true });
    expect(handlers.onNudge).not.toHaveBeenCalled();
    // Without Alt the arrows are the browser's own.
    fireEvent.keyDown(tick, { key: "ArrowUp" });
    expect(handlers.onNudge).not.toHaveBeenCalled();
  });

  it("moves a column to where it is dropped, one step at a time", () => {
    const layout: ColumnLayout = [
      { id: "title", width: 100, hidden: false },
      { id: "artist", width: 100, hidden: false },
      { id: "bpm", width: 100, hidden: false },
    ];
    const handlers = show(layout);
    const data = { setData: vi.fn(), getData: vi.fn() };
    fireEvent.dragStart(rowFor("BPM"), { dataTransfer: data });
    fireEvent.drop(rowFor("Artist"), { dataTransfer: data });
    expect(handlers.onNudge).toHaveBeenCalledTimes(1);
    expect(handlers.onNudge).toHaveBeenCalledWith("bpm", -1);
  });

  it("does not drag a pinned column", () => {
    show();
    expect(rowFor("Title")).toHaveAttribute("draggable", "false");
    expect(rowFor("Artist")).toHaveAttribute("draggable", "true");
  });

  it("attaches the pair of arrows: no gap between them", () => {
    const moves = /\.cp-column-picker__moves\s*\{([^}]*)\}/.exec(pickerCss)![1]!;
    expect(moves).toMatch(/gap:\s*0/);
  });
});

describe("reset", () => {
  it("is offered", () => {
    const handlers = show();

    fireEvent.click(screen.getByRole("button", { name: "Reset columns" }));

    expect(handlers.onReset).toHaveBeenCalled();
  });
});

describe("the note under the list (LIB-9)", () => {
  const note = "A dot marks a value you changed in CuePoint; a B marks one taken from Beatport.";

  it("says what the marks mean when the table has some", () => {
    render(
      <ColumnPicker
        open
        columns={COLUMNS}
        layout={defaultLayout(COLUMNS, 1)}
        onToggle={vi.fn()}
        onNudge={vi.fn()}
        onReset={vi.fn()}
        onClose={vi.fn()}
        note={note}
      />,
    );
    expect(screen.getByText(note)).toBeInTheDocument();
  });

  it("is absent for a table without any", () => {
    show();
    expect(screen.queryByText(/marks a value/)).toBeNull();
  });
});

describe("reset with Undo", () => {
  it("puts the previous layout back from the toast", async () => {
    const { ToastProvider } = await import("../Toast");
    const onRestore = vi.fn();
    const layout = toggleHidden(defaultLayout(COLUMNS, 1), "bpm");
    render(
      <ToastProvider>
        <ColumnPicker
          open
          columns={COLUMNS}
          layout={layout}
          onToggle={vi.fn()}
          onNudge={vi.fn()}
          onReset={vi.fn()}
          onRestore={onRestore}
          onClose={vi.fn()}
        />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Reset columns" }));
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));

    expect(onRestore).toHaveBeenCalledWith(layout);
  });
});

describe("the moves column (item 13)", () => {
  it("lines every row's up and down arrows up at the right, whatever the name's length", () => {
    // The label is as wide as its name; the moves push themselves to the row's end, so the arrows
    // form one right-hand column instead of trailing each name.
    const moves = /\.cp-column-picker__moves\s*\{([^}]*)\}/.exec(pickerCss)![1]!;
    expect(moves).toMatch(/margin-inline-start:\s*auto/);
    expect(moves).toMatch(/flex-shrink:\s*0/);
  });
});

describe("the verification round (M11, M254)", () => {
  it("M254: has the × alone, with no footer Close beside it", () => {
    show();
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).queryAllByRole("button", { name: "Close" })).toHaveLength(1);
  });

  it("M11: draws its ticks as the pixel check, as every other list of ticks does", () => {
    show();
    const labels = document.querySelectorAll(".cp-column-picker__label");
    expect(labels.length).toBeGreaterThan(0);
    for (const label of labels) expect(label).toHaveClass("cp-check--pixel");
  });
});
