/**
 * The Rekordbox export in Settings (EXPORT-07, DEC-087).
 *
 * Over the engine's own history answers (`rekordboxExport.fixture.json`):
 * where the next save dialog opens, the notation it starts in, and the recent
 * exports by how each ended. And the one thing it must not do — offer a way to
 * start an export, which DEC-087 keeps where the scope is in view.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { RekordboxExportHistory } from "../api/cuepointBridge.types";
import fixture from "./library/rekordboxExport.fixture.json";
import { RekordboxExportSettingsPanel, SETTINGS_HISTORY_LIMIT } from "./RekordboxExportSettingsPanel";

const HISTORY = fixture.history as unknown as RekordboxExportHistory;
const EMPTY = fixture.history_empty as unknown as RekordboxExportHistory;

let read: ReturnType<typeof vi.fn>;

beforeEach(() => {
  read = vi.fn().mockResolvedValue(HISTORY);
  (window as unknown as { cuepoint?: unknown }).cuepoint = { getRekordboxExportHistory: read };
});

afterEach(() => {
  delete (window as unknown as { cuepoint?: unknown }).cuepoint;
});

describe("the Rekordbox export in Settings", () => {
  it("shows the folder and notation the last written export used", async () => {
    render(<RekordboxExportSettingsPanel />);

    expect(await screen.findByTestId("export-remembered-folder")).toHaveTextContent(
      "C:\\Users\\dj\\Music\\Exports",
    );
    expect(screen.getByTestId("export-remembered-notation")).toHaveTextContent("Camelot (8A, 12B)");
    expect(read).toHaveBeenCalledWith({ limit: SETTINGS_HISTORY_LIMIT });
  });

  it("lists recent exports newest first, each by how it ended", async () => {
    render(<RekordboxExportSettingsPanel />);

    const list = await screen.findByRole("list");
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveAttribute("data-outcome", "cancelled");
    expect(items[0]).toHaveTextContent("Stopped — nothing was written");
    expect(items[1]).toHaveAttribute("data-outcome", "written");
    expect(items[1]).toHaveTextContent("CuePoint Export 2026-09-21.xml");
    expect(items[1]).toHaveTextContent("4 tracks · 3 rewritten · 4 playlists · Camelot (8A)");
  });

  it("says where the first export will go when there has been none", async () => {
    read.mockResolvedValue(EMPTY);
    render(<RekordboxExportSettingsPanel />);

    expect(await screen.findByTestId("export-remembered-folder")).toHaveTextContent(
      "Nothing exported yet",
    );
    expect(screen.getByTestId("export-remembered-notation")).toHaveTextContent(
      "As Rekordbox writes it (Am, C#)",
    );
    expect(screen.getByText("No exports yet.")).toBeInTheDocument();
  });

  it("offers no way to start an export, and says where export lives (DEC-087)", async () => {
    render(<RekordboxExportSettingsPanel />);
    await screen.findByRole("list");

    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.getByText(/Export from the Library/)).toBeInTheDocument();
  });

  it("offers editing neither value: both change by exporting", async () => {
    render(<RekordboxExportSettingsPanel />);
    await screen.findByRole("list");

    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByText(/exporting somewhere else, or in another notation, changes them/)).toBeInTheDocument();
  });

  it("says why it cannot read the history, and reads it again when asked", async () => {
    const user = userEvent.setup();
    read.mockRejectedValueOnce(new Error("The library is unavailable"));
    render(<RekordboxExportSettingsPanel />);

    expect(await screen.findByRole("alert")).toHaveTextContent("The library is unavailable");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByTestId("export-remembered-folder")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("says the desktop app is needed without a bridge", () => {
    delete (window as unknown as { cuepoint?: unknown }).cuepoint;
    render(<RekordboxExportSettingsPanel />);
    expect(screen.getByText(/Open CuePoint as a desktop app/)).toBeInTheDocument();
  });
});
