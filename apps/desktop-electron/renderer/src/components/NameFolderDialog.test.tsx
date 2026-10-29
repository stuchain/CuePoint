/**
 * The shared "name it and give it a place" dialog (C109): medium width, the Modal footer, a
 * muted lead, the first field focused, and a refusal under the name.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { NameFolderDialog } from "./NameFolderDialog";
import { expectNoAxeViolations } from "../test/axe";

const FOLDERS = [
  { id: 2, name: "Sets", depth: 0 },
  { id: 5, name: "2026", depth: 1 },
];

function show(props: Partial<React.ComponentProps<typeof NameFolderDialog>> = {}) {
  const onSubmit = vi.fn<(name: string, parentId: number | null) => void>();
  const onClose = vi.fn();
  render(
    <NameFolderDialog
      open
      title="New Set"
      folders={FOLDERS}
      submitLabel="Create the Set"
      onSubmit={onSubmit}
      onClose={onClose}
      {...props}
    />,
  );
  return { onSubmit, onClose };
}

describe("the shape", () => {
  it("is medium, with its buttons in the Modal footer", () => {
    show();
    const dialog = screen.getByRole("dialog", { name: "New Set" });
    expect(dialog).toHaveClass("cp-modal--medium");
    const footer = dialog.querySelector(".cp-modal__footer") as HTMLElement;
    expect(within(footer).getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(within(footer).getByRole("button", { name: "Create the Set" })).toBeInTheDocument();
  });

  it("puts a muted lead above the fields", () => {
    show({ lead: "It keeps answering this question." });
    expect(screen.getByText("It keeps answering this question.")).toHaveClass("cp-modal__lead");
  });

  it("puts focus in the name field when it opens", () => {
    show();
    expect(screen.getByRole("textbox", { name: "Name" })).toHaveFocus();
  });
});

describe("naming", () => {
  it("makes it under the trimmed name at the top level", async () => {
    const { onSubmit } = show();
    await userEvent.type(screen.getByRole("textbox", { name: "Name" }), "  Friday  ");
    await userEvent.click(screen.getByRole("button", { name: "Create the Set" }));
    expect(onSubmit).toHaveBeenCalledWith("Friday", null);
  });

  it("files it into the folder chosen, or the one it opened on", async () => {
    const { onSubmit } = show({ initialName: "Warm-up", initialParentId: 2 });
    expect(screen.getByRole("combobox", { name: "In" })).toHaveValue("2");
    fireEvent.change(screen.getByRole("combobox", { name: "In" }), { target: { value: "5" } });
    await userEvent.click(screen.getByRole("button", { name: "Create the Set" }));
    expect(onSubmit).toHaveBeenCalledWith("Warm-up", 5);
  });

  it("makes it on Enter in the name, once", async () => {
    const { onSubmit } = show();
    await userEvent.type(screen.getByRole("textbox", { name: "Name" }), "Friday{Enter}");
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("refuses a blank name under the field", async () => {
    const { onSubmit } = show();
    await userEvent.click(screen.getByRole("button", { name: "Create the Set" }));
    expect(onSubmit).not.toHaveBeenCalled();
    const field = screen.getByRole("textbox", { name: "Name" });
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field).toHaveAccessibleDescription(/Give it a name/);
  });

  it("shows the engine's refusal in the same place", () => {
    show({ error: "A Set here is already called “Friday”" });
    expect(screen.getByRole("textbox", { name: "Name" })).toHaveAccessibleDescription(/already called/);
  });
});

describe("working and greyed", () => {
  it("greys the fields and the button, and says why", () => {
    show({ disabled: true, disabledReason: "Add a filter first" });
    expect(screen.getByRole("textbox", { name: "Name" })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "In" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Create the Set" })).toBeDisabled();
    expect(screen.getByText("Add a filter first")).toBeInTheDocument();
  });

  it("shows the button working while it works", () => {
    show({ busy: true });
    expect(screen.getByRole("button", { name: "Create the Set" })).toBeDisabled();
  });
});

describe("NameFolderDialog accessibility (HARDEN-08)", () => {
  it("has no WCAG 2.2 A or AA violations", async () => {
    show();
    await expectNoAxeViolations();
  });

  it("has none with a refusal showing under the name", async () => {
    show();
    await userEvent.click(screen.getByRole("button", { name: "Create the Set" }));
    await expectNoAxeViolations();
  });
});
