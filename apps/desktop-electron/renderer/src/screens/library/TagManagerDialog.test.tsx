/**
 * The tag vocabulary, tended where it is used (ORG-12).
 *
 * Two properties:
 *
 * **Nothing destructive happens on one click.** Delete and merge both confirm,
 * and both confirmations carry the engine's usage count — the number is what
 * makes them decisions rather than clicks.
 *
 * **A save writes what changed and nothing else.** The engine's update route
 * applies a field when its key is present, so sending all three every time
 * would record history for two columns nobody touched.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

import type { TagUsage } from "../../api/cuepointBridge.types";
import { TagManagerDialog } from "./TagManagerDialog";

function tag(over: Partial<TagUsage> = {}): TagUsage {
  return {
    id: 1,
    name: "Peak-time",
    category: "Energy",
    colour: "danger",
    created_at: "2026-01-01T00:00:00Z",
    track_count: 412,
    ...over,
  };
}

const TAGS: TagUsage[] = [
  tag(),
  tag({ id: 2, name: "Peak Time", category: "Energy", colour: null, track_count: 40 }),
  tag({ id: 3, name: "Closer", category: null, colour: "info", track_count: 8 }),
];

function show(props: Partial<React.ComponentProps<typeof TagManagerDialog>> = {}) {
  const onSave = vi.fn();
  const onDelete = vi.fn();
  const onMerge = vi.fn();
  const onClose = vi.fn();
  const view = render(
    <TagManagerDialog
      open
      tags={TAGS}
      onSave={onSave}
      onDelete={onDelete}
      onMerge={onMerge}
      onClose={onClose}
      {...props}
    />,
  );
  return { onSave, onDelete, onMerge, onClose, view };
}

function choose(name: string) {
  fireEvent.click(screen.getByRole("button", { name: new RegExp(name) }));
}

describe("the vocabulary", () => {
  it("shows every tag with what carries it", () => {
    show();
    const list = screen.getByRole("list", { name: "Tags" });
    expect(within(list).getByText("Peak-time")).toBeInTheDocument();
    expect(within(list).getByText("Energy · 412 tracks")).toBeInTheDocument();
  });

  it("groups by category and puts the uncategorized last", () => {
    show();
    const rows = within(screen.getByRole("list", { name: "Tags" })).getAllByRole("button");
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining("Peak Time"),
      expect.stringContaining("Peak-time"),
      expect.stringContaining("Closer"),
    ]);
  });

  it("says so when there are none, rather than showing an empty box", () => {
    show({ tags: [] });
    expect(screen.getByText(/No tags yet/)).toBeInTheDocument();
  });

  it("asks for a tag before it offers fields to edit", () => {
    show();
    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
    expect(screen.getByText(/Choose a tag/)).toBeInTheDocument();
  });
});

describe("editing one", () => {
  it("opens on what the tag actually is", () => {
    show();
    choose("Peak-time");
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Peak-time");
    expect((screen.getByLabelText("Category") as HTMLInputElement).value).toBe("Energy");
    expect((screen.getByLabelText("Colour") as HTMLSelectElement).value).toBe("danger");
  });

  it("saves only the field that changed", () => {
    const { onSave } = show();
    choose("Peak-time");
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Peak time" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith(1, { name: "Peak time" });
  });

  it("clears a category with null rather than with an empty name", () => {
    const { onSave } = show();
    choose("Peak-time");
    fireEvent.change(screen.getByLabelText("Category"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith(1, { category: null });
  });

  it("clears a colour with null", () => {
    const { onSave } = show();
    choose("Peak-time");
    fireEvent.change(screen.getByLabelText("Colour"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith(1, { colour: null });
  });

  it("writes nothing when nothing changed, and says why", () => {
    const { onSave } = show();
    choose("Peak-time");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Nothing has changed");
  });

  it("refuses a name of nothing before it asks the engine", () => {
    const { onSave } = show();
    choose("Peak-time");
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "  " } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("needs a name");
  });

  it("shows what the engine said when it refused", () => {
    show({ error: "A tag is already called “Closer”" });
    choose("Peak-time");
    expect(screen.getByRole("alert")).toHaveTextContent("already called");
  });
});

describe("deleting one", () => {
  it("asks first, with the number of tracks it comes off", () => {
    const { onDelete } = show();
    choose("Peak-time");
    fireEvent.click(screen.getByRole("button", { name: "Delete…" }));
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog")).toHaveTextContent("comes off 412 tracks");
  });

  it("deletes once it is confirmed", () => {
    const { onDelete } = show();
    choose("Peak-time");
    fireEvent.click(screen.getByRole("button", { name: "Delete…" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }));
  });

  it("does nothing when the question is answered no", () => {
    const { onDelete } = show();
    choose("Peak-time");
    fireEvent.click(screen.getByRole("button", { name: "Delete…" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
});

describe("merging two", () => {
  it("will not merge a tag into itself", () => {
    // The engine refuses it, and offering it would be offering a mistake.
    show();
    choose("Peak-time");
    const into = screen.getByLabelText("Merge into") as HTMLSelectElement;
    expect([...into.options].map((option) => option.textContent)).not.toContain("Peak-time");
  });

  it("asks first, naming what moves and what is deleted", () => {
    const { onMerge } = show();
    choose("Peak Time");
    fireEvent.change(screen.getByLabelText("Merge into"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Merge…" }));
    expect(onMerge).not.toHaveBeenCalled();
    const asked = screen.getByRole("alertdialog");
    expect(asked).toHaveTextContent("40 tracks move across");
    expect(asked).toHaveTextContent("“Peak Time” is deleted");
  });

  it("merges the chosen one into the chosen one, in that order", () => {
    const { onMerge } = show();
    choose("Peak Time");
    fireEvent.change(screen.getByLabelText("Merge into"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Merge…" }));
    fireEvent.click(screen.getByRole("button", { name: "Merge" }));
    expect(onMerge).toHaveBeenCalledWith(
      expect.objectContaining({ id: 2 }),
      expect.objectContaining({ id: 1 }),
    );
  });

  it("cannot be asked for until a destination is chosen", () => {
    show();
    choose("Peak-time");
    expect(screen.getByRole("button", { name: "Merge…" })).toBeDisabled();
  });
});

describe("after a write", () => {
  it("lets go of a tag the write removed", () => {
    // A merged or deleted tag is gone from the next read. An editor still
    // showing its fields would be offering to save a row that is not there.
    const { view } = show();
    choose("Peak-time");
    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    view.rerender(
      <TagManagerDialog
        open
        tags={TAGS.filter((entry) => entry.id !== 1)}
        onSave={vi.fn()}
        onDelete={vi.fn()}
        onMerge={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
  });

  it("shows the renamed tag rather than what was typed at it", () => {
    const { view } = show();
    choose("Peak-time");
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "typed" } });
    view.rerender(
      <TagManagerDialog
        open
        tags={TAGS.map((entry) => (entry.id === 1 ? { ...entry, name: "Peak time" } : entry))}
        onSave={vi.fn()}
        onDelete={vi.fn()}
        onMerge={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Peak time");
  });
});
