/**
 * Naming a filter and putting it in the tree (ORG-12).
 *
 * The property that matters: **what is saved is what the bar has.** The rules
 * handed to this dialog are handed back untouched, because a Smart Collection
 * is a saved filter rather than something derived from one (DEC-016).
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

import type { FilterRuleSet, LibraryFilterVocabulary } from "../../api/cuepointBridge.types";
import { SaveSmartDialog } from "./SaveSmartDialog";
import { SMART_NAME_MAX_LENGTH } from "./smartFilter";

const VOCABULARY: LibraryFilterVocabulary = {
  fields: [
    {
      name: "genre",
      type: "text",
      label: "Genre",
      facetable: true,
      integer: false,
      unit: null,
      operators: ["is"],
    },
    {
      name: "tag",
      type: "tag",
      label: "Tag",
      facetable: true,
      integer: false,
      unit: null,
      operators: ["has_tag"],
    },
  ],
  operators: { is: { arity: "single" }, has_tag: { arity: "single" } },
  facetable: ["genre", "tag"],
  sortable: ["artist"],
};

const RULES: FilterRuleSet = {
  match: "all",
  rules: [
    { field: "genre", operator: "is", value: "House" },
    { field: "tag", operator: "has_tag", value: 7 },
  ],
};

const FOLDERS = [
  { id: 2, name: "Sets", depth: 0 },
  { id: 5, name: "2026", depth: 1 },
];

function show(props: Partial<React.ComponentProps<typeof SaveSmartDialog>> = {}) {
  const onSave = vi.fn<(name: string, parentId: number | null) => void>();
  const onClose = vi.fn();
  render(
    <SaveSmartDialog
      open
      rules={RULES}
      vocabulary={VOCABULARY}
      names={{ tag: new Map([[7, "Peak-time"]]) }}
      folders={FOLDERS}
      onSave={onSave}
      onClose={onClose}
      {...props}
    />,
  );
  return { onSave, onClose };
}

function type(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe("saving a filter", () => {
  it("saves under the name that was typed", () => {
    const { onSave } = show();
    type("Name", "  Peak-time openers  ");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith("Peak-time openers", null);
  });

  it("saves at the top level when no folder was chosen", () => {
    const { onSave } = show();
    type("Name", "Openers");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith("Openers", null);
  });

  it("saves into the folder that was chosen", () => {
    // A Collection lives somewhere in a tree, and a dialog that did not ask
    // would be choosing for them.
    const { onSave } = show();
    type("Name", "Openers");
    fireEvent.change(screen.getByLabelText("In"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith("Openers", 5);
  });

  it("opens on the folder the tree is pointing at", () => {
    show({ defaultParentId: 2 });
    expect((screen.getByLabelText("In") as HTMLSelectElement).value).toBe("2");
  });

  it("saves on Enter, because a one-field form is a one-key form", () => {
    const { onSave } = show();
    const name = screen.getByLabelText("Name");
    fireEvent.change(name, { target: { value: "Openers" } });
    fireEvent.keyDown(name, { key: "Enter" });
    expect(onSave).toHaveBeenCalledWith("Openers", null);
  });

  it("refuses a name of nothing, and says so", () => {
    const { onSave } = show();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Give it a name");
  });

  it("does not let a name longer than the engine takes be typed", () => {
    show();
    expect(screen.getByLabelText("Name")).toHaveAttribute(
      "maxlength",
      String(SMART_NAME_MAX_LENGTH),
    );
  });
});

describe("what is being saved", () => {
  it("shows the rules in the words the chips use", () => {
    show();
    const list = screen.getByRole("list", { name: "Rules being saved" });
    expect(within(list).getByText("Genre is House")).toBeInTheDocument();
  });

  it("names a tag rather than showing the id the rule carries", () => {
    // The rule holds `7` because a rule has to survive a rename. Nobody has
    // ever known a tag by its id.
    show();
    const list = screen.getByRole("list", { name: "Rules being saved" });
    expect(within(list).getByText("Tag has Peak-time")).toBeInTheDocument();
  });

  it("says it keeps answering, because that is what makes it smart", () => {
    show();
    expect(screen.getByText(/keeps answering/i)).toBeInTheDocument();
  });
});

describe("what cannot be saved", () => {
  it("refuses an empty rule set, which would be the whole library", () => {
    show({ rules: null });
    expect(screen.getByRole("alert")).toHaveTextContent("Add a filter first");
  });

  it("will not let a name be typed for one", () => {
    show({ rules: null });
    expect(screen.getByLabelText("Name")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });
});

describe("when the engine refuses", () => {
  it("shows what it said rather than closing as though it worked", () => {
    show({ error: "A Collection here is already called “Openers”" });
    expect(screen.getByRole("alert")).toHaveTextContent("already called");
  });

  it("says it is working while it works", () => {
    show({ busy: true });
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
  });
});
