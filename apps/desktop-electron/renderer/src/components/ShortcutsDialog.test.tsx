import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ShortcutsDialog } from "./ShortcutsDialog";

describe("ShortcutsDialog", () => {
  it("lists the menu's keys and Prepare's", () => {
    render(<ShortcutsDialog open onClose={vi.fn()} />);
    const dialog = screen.getByRole("dialog");
    // One cap per key (M265): "Ctrl" and "O" are two caps, so the row is read by its action.
    for (const action of ["Import a Rekordbox file…", "Settings", "Larger text", "Smaller text", "Default text size"]) {
      expect(within(dialog).getByText(action)).toBeInTheDocument();
    }
    const row = within(dialog).getByText("Import a Rekordbox file…").closest("tr")!;
    expect([...row.querySelectorAll("kbd")].map((cap) => cap.textContent)).toEqual(["Ctrl", "O"]);
    expect(within(dialog).getAllByText("Prepare").length).toBeGreaterThan(0);
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

  it("shows key caps in the body font with a slashed zero, so O and 0 differ", async () => {
    render(<ShortcutsDialog open onClose={vi.fn()} />);
    const caps = [...screen.getByRole("dialog").querySelectorAll("kbd")];
    expect(caps.length).toBeGreaterThan(0);
    for (const cap of caps) expect(cap).toHaveClass("shortcuts-dialog__key");
    const css = (await import("./ShortcutsDialog.css?raw")).default;
    expect(css).toMatch(/\.shortcuts-dialog__key\s*\{[^}]*font-family:\s*var\(--font-data\)[^}]*slashed-zero/);
  });

  it("is a medium dialog, and draws two ways to one thing as separate caps with 'or' between", () => {
    render(<ShortcutsDialog open onClose={vi.fn()} />);
    expect(screen.getByRole("dialog")).toHaveClass("cp-modal--medium");
    const row = screen.getByText("Move the selected track up or down in a Collection").closest("tr")!;
    expect([...row.querySelectorAll("kbd")].map((cap) => cap.textContent)).toEqual(["Alt", "Up", "Alt", "Down"]);
    expect(row).toHaveTextContent("or");
  });

  it("insets a group's heading like the Action header and the rows (M266)", async () => {
    const css = (await import("./ShortcutsDialog.css?raw")).default;
    expect(css).toMatch(/th\.shortcuts-dialog__group\s*\{[^}]*padding:\s*0 var\(--space-sm\)/);
  });

  it("has no Ctrl-to-Cmd note: each platform's list shows its own keys", () => {
    render(<ShortcutsDialog open onClose={vi.fn()} />);
    expect(screen.queryByText(/use Cmd where a shortcut says Ctrl/i)).toBeNull();
  });

  it("shows the Command sign on a Mac and no note about Ctrl", () => {
    const platform = vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel");
    try {
      render(<ShortcutsDialog open onClose={vi.fn()} />);
      const dialog = screen.getByRole("dialog");
      const row = within(dialog).getByText("Import a Rekordbox file…").closest("tr")!;
      expect([...row.querySelectorAll("kbd")].map((cap) => cap.textContent)).toEqual(["\u2318", "O"]);
      expect(within(dialog).queryByText(/Ctrl/)).toBeNull();
    } finally {
      platform.mockRestore();
    }
  });
});

describe("the fixed head and the shared table look (C58, C72, C119)", () => {
  it("keeps the search and the result count outside the part that scrolls", () => {
    render(<ShortcutsDialog open onClose={vi.fn()} />);
    const dialog = screen.getByRole("dialog");
    const scroller = dialog.querySelector(".shortcuts-dialog__table-wrap")!;
    const search = within(dialog).getByRole("searchbox", { name: "Search" });
    const count = within(dialog).getByTestId("shortcuts-count");
    expect(scroller.contains(search)).toBe(false);
    expect(scroller.contains(count)).toBe(false);
    expect(count).toHaveClass("cp-count");
  });

  it("counts what is shown, and says when nothing is", async () => {
    render(<ShortcutsDialog open onClose={vi.fn()} />);
    await userEvent.type(screen.getByRole("searchbox", { name: "Search" }), "volume");
    expect(screen.getByTestId("shortcuts-count")).toHaveTextContent("2 shortcuts");
    await userEvent.type(screen.getByRole("searchbox", { name: "Search" }), "zzzz");
    expect(screen.getByTestId("shortcuts-count")).toHaveTextContent("No shortcuts");
  });

  it("draws the list with the shared table class and the group headings in the sub-heading style", () => {
    render(<ShortcutsDialog open onClose={vi.fn()} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog.querySelector("table")).toHaveClass("cp-data-table");
    for (const heading of within(dialog).getAllByRole("heading", { level: 3 })) {
      expect(heading).toHaveClass("cp-text-subhead");
    }
  });
});
