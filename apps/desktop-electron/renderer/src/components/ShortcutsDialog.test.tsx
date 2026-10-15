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
    await userEvent.type(screen.getByRole("searchbox", { name: "Search" }), "volume");
    const rows = screen.getAllByRole("row");
    // The header, the Player heading, and its two volume rows.
    expect(rows).toHaveLength(4);
    expect(screen.queryByRole("heading", { name: "Library" })).toBeNull();
  });

  it("groups rows under a heading per context, with no Context column", () => {
    render(<ShortcutsDialog open onClose={vi.fn()} />);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).queryByRole("columnheader", { name: "Context" })).toBeNull();
    const headings = within(dialog).getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(headings.slice(0, 3)).toEqual(["Everywhere", "Library", "Keys"]);
    expect(headings).toContain("Player");
  });

  it("shows key caps in the body font, so Ctrl+O and Ctrl+0 differ", () => {
    render(<ShortcutsDialog open onClose={vi.fn()} />);
    expect(screen.getByText("Ctrl+O")).toHaveClass("shortcuts-dialog__key");
  });
});
