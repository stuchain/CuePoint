import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ShortcutsDialog } from "./ShortcutsDialog";

describe("ShortcutsDialog", () => {
  it("lists the menu's keys and Prepare's, and says Cmd stands in for Ctrl on a Mac", () => {
    render(<ShortcutsDialog open onClose={vi.fn()} />);
    const dialog = screen.getByRole("dialog");
    for (const key of ["Ctrl+O", "Ctrl+,", "Ctrl+=", "Ctrl+-", "Ctrl+0"]) {
      expect(within(dialog).getByText(key)).toBeInTheDocument();
    }
    expect(within(dialog).getAllByText("Prepare").length).toBeGreaterThan(0);
    expect(within(dialog).getByText(/On a Mac, use Cmd where a shortcut says Ctrl/)).toBeInTheDocument();
  });

  it("no longer lists keys that do nothing", () => {
    render(<ShortcutsDialog open onClose={vi.fn()} />);
    const dialog = screen.getByRole("dialog");
    for (const key of ["Ctrl+E", "F5", "Ctrl+R", "Ctrl+H"]) {
      expect(within(dialog).queryByText(key)).not.toBeInTheDocument();
    }
  });

  it("filters by what is typed", async () => {
    render(<ShortcutsDialog open onClose={vi.fn()} />);
    await userEvent.type(screen.getByRole("textbox", { name: "Search" }), "volume");
    const rows = screen.getAllByRole("row");
    expect(rows).toHaveLength(3);
  });
});
