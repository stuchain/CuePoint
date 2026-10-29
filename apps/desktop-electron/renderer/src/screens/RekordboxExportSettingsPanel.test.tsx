/**
 * The Rekordbox export in Settings (EXPORT-07, DEC-087).
 *
 * Over the engine's own history answers (`rekordboxExport.fixture.json`):
 * where the next save dialog opens, the notation it starts in, and the recent
 * exports by how each ended. And the one thing it must not do — offer a way to
 * start an export, which DEC-087 keeps where the scope is in view.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
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
  it("offers Change file\u2026, which opens the Library on its import", async () => {
    renderPanel();
    expect(
      screen.getByText("Read a different Rekordbox file in place of the current one."),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Change file\u2026" }));
    expect(arrived?.pathname).toBe("/library");
    expect(arrived?.state).toEqual(libraryImportState());
    expect(importOpening({ state: arrived?.state, key: arrived?.key ?? "" })).not.toBeNull();
  });

  it("says where to export from, outright and with no fold or \"Remembers\" line (M237, M438)", async () => {
    renderPanel();
    expect(
      await screen.findByText("To export, use \u201cExport to Rekordbox\u2026\u201d in the Library or on a Collection's menu."),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "More about this" })).toBeNull();
    expect(screen.queryByText("Remembers your last export.")).toBeNull();
  });

  it("writes the notation as a sentence, not as a second setting (M437)", async () => {
    renderPanel();
    expect(await screen.findByTestId("export-remembered-notation")).toHaveTextContent("Exports write keys as Camelot, like 8A.");
    expect(read).toHaveBeenCalledWith({ limit: SETTINGS_HISTORY_LIMIT });
    expect(screen.queryByText("Key notation")).toBeNull();
    expect(screen.queryByText("Keys written as")).toBeNull();
  });

  it("puts the label above the folder, in the computer's separators with ~ for home (M231, M500)", async () => {
    renderPanel();
    const folder = await screen.findByTestId("export-remembered-folder");
    expect(folder).toHaveTextContent("~\\Music\\Exports");
    expect(folder.previousElementSibling).toHaveTextContent("Save dialog opens in");
    expect(document.querySelector("dl")).toBeNull();
  });

  it("lists recent exports newest first, each by how it ended", async () => {
    renderPanel();

    const list = await screen.findByRole("list");
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveAttribute("data-outcome", "cancelled");
    expect(items[0]).toHaveTextContent("Stopped - nothing was written");
    expect(items[1]).toHaveAttribute("data-outcome", "written");
    expect(items[1]).toHaveTextContent("CuePoint Export 2026-09-21.xml");
    expect(items[1]).toHaveTextContent("4 tracks · 3 with new tags · 4 playlists · Camelot (8A)");
  });

  it("says once that there has been no export, and where the first goes (M438)", async () => {
    read.mockResolvedValue(EMPTY);
    renderPanel();

    expect(await screen.findByText("No exports yet. The first one is saved in Documents.")).toBeInTheDocument();
    expect(screen.queryByTestId("export-remembered-folder")).toBeNull();
    expect(screen.queryByText(/Nothing exported yet/)).toBeNull();
    expect(screen.getByTestId("export-remembered-notation")).toHaveTextContent("in Rekordbox\u2019s own notation, like Am or C#");
  });

  it("offers no way to start an export, and says where export lives (DEC-087)", async () => {
    renderPanel();
    await screen.findByRole("list");

    // Nothing starts an export: the one button is the file change.
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["Change file\u2026"]);
    expect(screen.getByText(/To export, use .Export to Rekordbox.. in the Library/)).toBeInTheDocument();
  });

  it("offers editing neither value: both change by exporting", async () => {
    renderPanel();
    await screen.findByRole("list");

    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
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
    expect(screen.getByText(/needs the CuePoint desktop app/)).toBeInTheDocument();
  });
});

describe("revisiting Settings (C19d)", () => {
  it("revisit shows the old value immediately and refetches after an announce", async () => {
    read.mockResolvedValue(EMPTY);
    const first = renderPanel();
    expect(await screen.findByText("No exports yet. The first one is saved in Documents.")).toBeInTheDocument();
    first.unmount();
    const before = read.mock.calls.length;

    renderPanel();
    // The first render: no "Loading past exports…", the history is already there.
    expect(screen.queryByText("Loading past exports…")).toBeNull();
    expect(screen.getByText("No exports yet. The first one is saved in Documents.")).toBeInTheDocument();
    await act(async () => {});
    expect(read.mock.calls.length).toBe(before);

    read.mockResolvedValue(HISTORY);
    act(() => announceLibraryChange());
    expect(await screen.findByRole("list")).toBeInTheDocument();
    expect(read.mock.calls.length).toBe(before + 1);
  });
});
