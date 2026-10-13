/**
 * The Rekordbox export in Settings (EXPORT-07, DEC-087).
 *
 * Over the engine's own history answers (`rekordboxExport.fixture.json`):
 * where the next save dialog opens, the notation it starts in, and the recent
 * exports by how each ended. And the one thing it must not do — offer a way to
 * start an export, which DEC-087 keeps where the scope is in view.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";

import { announceLibraryChange } from "../api/libraryChanges";
import type { RekordboxExportHistory } from "../api/cuepointBridge.types";
import fixture from "./library/rekordboxExport.fixture.json";
import { libraryImportState, importOpening } from "./library/libraryLink";
import { RekordboxExportSettingsPanel, SETTINGS_HISTORY_LIMIT } from "./RekordboxExportSettingsPanel";

const HISTORY = fixture.history as unknown as RekordboxExportHistory;
const EMPTY = fixture.history_empty as unknown as RekordboxExportHistory;

let read: ReturnType<typeof vi.fn>;
let arrived: { pathname: string; state: unknown; key: string } | null = null;

function Where() {
  const location = useLocation();
  arrived = { pathname: location.pathname, state: location.state, key: location.key };
  return null;
}

function renderPanel() {
  return render(
    <MemoryRouter initialEntries={["/settings"]}>
      <RekordboxExportSettingsPanel />
      <Where />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  read = vi.fn().mockResolvedValue(HISTORY);
  (window as unknown as { cuepoint?: unknown }).cuepoint = { getRekordboxExportHistory: read };
});

afterEach(() => {
  delete (window as unknown as { cuepoint?: unknown }).cuepoint;
});

describe("the Rekordbox export in Settings", () => {
  it("offers Import a Rekordbox file\u2026, which opens the Library on its import", async () => {
    renderPanel();
    expect(
      screen.getByText("Read a different Rekordbox file in place of the current one."),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Import a Rekordbox file\u2026" }));
    expect(arrived?.pathname).toBe("/library");
    expect(arrived?.state).toEqual(libraryImportState());
    expect(importOpening({ state: arrived?.state, key: arrived?.key ?? "" })).not.toBeNull();
  });

  it("says it remembers the last export, and where to export from under More about this", async () => {
    renderPanel();
    expect(await screen.findByText("Remembers your last export.")).toBeInTheDocument();
    const where = screen.getByText(
      "To export, use “Export to Rekordbox…” in the Library or on a Collection's menu.",
    );
    expect(where).not.toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "More about this" }));
    expect(where).toBeVisible();
  });

  it("calls the notation Keys written as", async () => {
    renderPanel();
    expect(await screen.findByText("Keys written as")).toBeInTheDocument();
    expect(screen.queryByText("Key notation")).toBeNull();
  });

  it("shows the folder and notation the last written export used", async () => {
    renderPanel();

    expect(await screen.findByTestId("export-remembered-folder")).toHaveTextContent(
      "C:\\Users\\dj\\Music\\Exports",
    );
    expect(screen.getByTestId("export-remembered-notation")).toHaveTextContent("Camelot (8A, 12B)");
    expect(read).toHaveBeenCalledWith({ limit: SETTINGS_HISTORY_LIMIT });
  });

  it("lists recent exports newest first, each by how it ended", async () => {
    renderPanel();

    const list = await screen.findByRole("list");
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveAttribute("data-outcome", "cancelled");
    expect(items[0]).toHaveTextContent("Stopped — nothing was written");
    expect(items[1]).toHaveAttribute("data-outcome", "written");
    expect(items[1]).toHaveTextContent("CuePoint Export 2026-09-21.xml");
    expect(items[1]).toHaveTextContent("4 tracks · 3 with new tags · 4 playlists · Camelot (8A)");
  });

  it("says where the first export will go when there has been none", async () => {
    read.mockResolvedValue(EMPTY);
    renderPanel();

    expect(await screen.findByTestId("export-remembered-folder")).toHaveTextContent(
      "Nothing exported yet",
    );
    expect(screen.getByTestId("export-remembered-notation")).toHaveTextContent(
      "As Rekordbox writes it (Am, C#)",
    );
    expect(screen.getByText("No exports yet.")).toBeInTheDocument();
  });

  it("offers no way to start an export, and says where export lives (DEC-087)", async () => {
    renderPanel();
    await screen.findByRole("list");

    // Nothing starts an export: the buttons are the import and "More about this".
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Import a Rekordbox file…",
      "More about this",
    ]);
    expect(screen.getByText(/To export, use “Export to Rekordbox…” in the Library/)).toBeInTheDocument();
  });

  it("offers editing neither value: both change by exporting", async () => {
    renderPanel();
    await screen.findByRole("list");

    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByText("Remembers your last export.")).toBeInTheDocument();
  });

  it("says why it cannot read the history, and reads it again when asked", async () => {
    const user = userEvent.setup();
    read.mockRejectedValueOnce(new Error("The library is unavailable"));
    renderPanel();

    expect(await screen.findByRole("alert")).toHaveTextContent("The library is unavailable");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByTestId("export-remembered-folder")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("says the desktop app is needed without a bridge", () => {
    delete (window as unknown as { cuepoint?: unknown }).cuepoint;
    renderPanel();
    expect(screen.getByText(/Open CuePoint as a desktop app/)).toBeInTheDocument();
  });
});

describe("revisiting Settings (C19d)", () => {
  it("revisit shows the old value immediately and refetches after an announce", async () => {
    read.mockResolvedValue(EMPTY);
    const first = renderPanel();
    expect(await screen.findByText("No exports yet.")).toBeInTheDocument();
    first.unmount();
    const before = read.mock.calls.length;

    renderPanel();
    // The first render: no "Reading past exports…", the history is already there.
    expect(screen.queryByText("Reading past exports…")).toBeNull();
    expect(screen.getByText("No exports yet.")).toBeInTheDocument();
    await act(async () => {});
    expect(read.mock.calls.length).toBe(before);

    read.mockResolvedValue(HISTORY);
    act(() => announceLibraryChange());
    expect(await screen.findByRole("list")).toBeInTheDocument();
    expect(read.mock.calls.length).toBe(before + 1);
  });
});
