/**
 * Clean in the Library (CLEAN-13, DEC-072, then FLW-8 and FLW-12).
 *
 * Over a faked bridge that has Clean's routes:
 *
 * - **One operations list** carries Play, Organize, Beatport and More,
 *   in the row menu and the selection bar's buttons alike.
 * - **Each entry does what it says**: Beatport ▸ opens Clean with the
 *   selected tracks (the match window, Review) rather than running anything
 *   here; Beatport's values and Edit values open their dialogs in
 *   place (K4); More ▸ holds Edit values, and syncing into the files is per playlist, on Clean.
 * - **The toolbar row** is one row above the table: the bar (with a selection), the count,
 *   Columns… is the table header's corner; Select all is in the selection bar.
 * - **Overridden cells are marked** and name their source, and a copy reads the
 *   value shown.
 * - **The Clean columns** are hidden by default and offered in the picker.
 * - **A change announced elsewhere** — Activity's revert — reloads the table.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type {
  LibrarySearchResponse,
  LibrarySummary,
  LibraryTrackDetail,
  LibraryTrackRow,
} from "../../api/cuepointBridge.types";
import { announceLibraryChange } from "../../api/libraryChanges";
import { ToastProvider } from "../../components";
import { InspectorSlotOutlet, InspectorSlotProvider } from "../../components/shell";
import { ScaleProvider } from "../../tokens/ScaleContext";
import { LIBRARY_COLUMNS } from "./libraryColumns";
import { LibraryScreen } from "./LibraryScreen";
import { findMenuItem, menuItem } from "./menuPick.test.util";

const SUMMARY: LibrarySummary = {
  track_count: 3,
  playlist_count: 0,
  playlist_entry_count: 0,
  library_empty: false,
  source: {
    xml_path: "C:\\x\\collection.xml",
    imported_at: "2026-09-03T10:00:00Z",
    xml_modified_at: null,
    xml_size_bytes: null,
    track_count: 3,
    playlist_count: 0,
    exists: true,
    changed: false,
  },
};

function track(id: number, overrides: Partial<LibraryTrackRow> = {}): LibraryTrackRow {
  return {
    id,
    rekordbox_track_id: String(id),
    title: `Track ${id}`,
    artist: `Artist ${id}`,
    remixer: null,
    album: null,
    label: "A Label",
    genre: "Techno",
    key: "8A",
    bpm: 128,
    year: 2024,
    duration_seconds: 300,
    rating: null,
    play_count: null,
    colour: null,
    date_added: null,
    comment: null,
    bitrate: null,
    file_path: `C:\\music\\${id}.mp3`,
    effective_rating: null,
    rating_source: null,
    favorite: false,
    effective_key: "8A",
    effective_bpm: 128,
    effective_genre: "Techno",
    effective_label: "A Label",
    effective_year: 2024,
    overridden: [],
    override_sources: {},
    match_state: "needs_review",
    match_disputed: false,
    match_score: 81,
    file_status: "present",
    artwork: "none",
    ...overrides,
  };
}

const TRACKS = [
  track(1, {
    effective_bpm: 126,
    overridden: ["bpm"],
    override_sources: { bpm: "cuepoint" },
  }),
  track(2, {
    effective_genre: "House",
    overridden: ["genre"],
    override_sources: { genre: "beatport" },
  }),
  track(3),
];

function answer(params: Record<string, unknown>): LibrarySearchResponse {
  return {
    query: "",
    total: TRACKS.length,
    limit: Number(params.limit ?? 100),
    offset: Number(params.offset ?? 0),
    tracks: params.fields === "id" ? [] : TRACKS,
    track_ids: params.fields === "id" ? TRACKS.map((row) => row.id!) : undefined,
    library_empty: false,
    mode: "browse",
    scope: (params.playlistId as number | null) ?? null,
    collection_scope: null,
    collection_id: null,
    sort: params.sort as string,
    dir: params.dir as "asc" | "desc",
    filters: (params.filters as LibrarySearchResponse["filters"]) ?? null,
  };
}

function detail(id: number): LibraryTrackDetail {
  return {
    track: TRACKS[id - 1]!,
    playlists: [],
    playlist_count: 0,
    metadata: {
      track_id: id,
      rating: null,
      rekordbox_rating: null,
      effective_rating: null,
      rating_source: null,
      favorite: false,
      notes: null,
      created_at: null,
      updated_at: null,
    },
    tags: [],
    collections: [],
  };
}

const APPLIED = {
  applied: {
    batch_id: "b",
    operation: "x",
    target: "x",
    total: 1,
    changed: 1,
    unchanged: 0,
    failed: 0,
    cancelled: false,
  },
};

type Mock = ReturnType<typeof vi.fn>;
let bridge: Record<string, Mock | Record<string, Mock>>;

function mock(name: string): Mock {
  return bridge[name] as Mock;
}

function player(): Record<string, Mock> {
  return bridge.player as Record<string, Mock>;
}

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", { configurable: true, get: () => 1200 });
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", { configurable: true, get: () => 600 });
});

afterAll(() => {
  Reflect.deleteProperty(HTMLElement.prototype, "offsetWidth");
  Reflect.deleteProperty(HTMLElement.prototype, "offsetHeight");
});

beforeEach(() => {
  localStorage.clear();
  bridge = {
    getLibrarySummary: vi.fn().mockResolvedValue(SUMMARY),
    browseLibrary: vi.fn(async (params: Record<string, unknown>) => answer(params)),
    getLibraryPlaylists: vi.fn().mockResolvedValue({ playlists: [], total: 0 }),
    getCollections: vi.fn().mockResolvedValue({ collections: [], total: 0 }),
    getLibraryFilterFields: vi.fn().mockResolvedValue({ fields: [], operators: {}, facetable: [], sortable: [] }),
    getLibraryTrack: vi.fn(async ({ trackId }: { trackId: number }) => detail(trackId)),
    getTrackHistory: vi.fn().mockResolvedValue({ track_id: 1, changes: [], limit: 50 }),
    getTags: vi.fn().mockResolvedValue({ tags: [], categories: [] }),
    applyBatch: vi.fn().mockResolvedValue(APPLIED),
    getJob: vi.fn(async (id: string) => ({ id, state: "succeeded" })),
    getJobResults: vi.fn(async (id: string) => ({ id, state: "succeeded" })),
    showItemInFolder: vi.fn().mockResolvedValue(undefined),
    getTrackFolder: vi.fn(async ({ trackId }: { trackId: number }) => ({
      track_id: trackId,
      file_path: `C:\\music\\${trackId}.mp3`,
      file_exists: false,
      folder: "C:\\music",
    })),
    // Clean's routes (CLEAN-11), which is what makes the build offer Clean.
    startCleanMatch: vi.fn().mockResolvedValue({
      job_id: "m-1",
      id: "m-1",
      state: "queued",
      selected: 1,
      excluded: 0,
      planned: 1,
      resumed_from: null,
    }),
    decideMatch: vi.fn(),
    applyMatch: vi.fn(),
    setTrackOverrides: vi.fn().mockResolvedValue({ track: TRACKS[0] }),
    startFileCheck: vi.fn().mockResolvedValue({ job_id: "c-1", id: "c-1", state: "queued", tracks: 1 }),
    previewTagWrite: vi.fn(),
    startTagWrite: vi.fn(),
    player: {
      playView: vi.fn().mockResolvedValue({ ok: true }),
      playQueue: vi.fn().mockResolvedValue({ ok: true }),
      playNext: vi.fn().mockResolvedValue(undefined),
      addToQueue: vi.fn().mockResolvedValue(undefined),
    },
  };
  (window as unknown as { cuepoint?: unknown }).cuepoint = bridge;
});

afterEach(() => {
  delete (window as unknown as { cuepoint?: unknown }).cuepoint;
  vi.restoreAllMocks();
});

const OPEN_MATCH = vi.fn();
const OPEN_IN_CLEAN = vi.fn();

function renderScreen() {
  return render(
    <ScaleProvider>
      <ToastProvider>
        <LibraryScreen onOpenMatch={OPEN_MATCH} onOpenInClean={OPEN_IN_CLEAN} />
      </ToastProvider>
    </ScaleProvider>,
  );
}

async function tableReady() {
  await screen.findByRole("table", { name: "Library tracks" });
  await screen.findByText("Track 1");
}

async function openMenuOn(text: string) {
  const row = screen.getByText(text).closest("[role=row]")!;
  fireEvent.contextMenu(row, { clientX: 100, clientY: 100 });
  return screen.findByRole("menu");
}

const BETWEEN = [
  "Play",
  "Play next",
  "Add to queue",
  "Add to a Collection…",
  "Add tag…",
  "Remove tag…",
  "Rate",
  "Add to favorites",
  "Remove from favorites",
  "Match on Beatport…",
  "Review these matches",
  "Use Beatport values…",
  "Edit values…",
  "Copy as text",
  "Show in folder",
];

function labelsOf(menu: HTMLElement): string[] {
  // The stars row (M299) draws stars, not words: its name is its label.
  return within(menu)
    .getAllByRole("menuitem")
    .map((node) => node.textContent || node.getAttribute("aria-label") || "");
}

async function openGroup(name: string) {
  await userEvent.click(screen.getByRole("button", { name }));
  return screen.findByRole("menu");
}

async function select(...texts: string[]) {
  await userEvent.click(screen.getByText(texts[0]!));
  for (const text of texts.slice(1)) fireEvent.click(screen.getByText(text), { ctrlKey: true });
}

describe("the operations list", () => {
  it("is the bar's groups as submenus: Play on top, then Organize, Beatport, More", async () => {
    renderScreen();
    await tableReady();
    const menu = await openMenuOn("Track 2");
    // M299: Rate is the inline stars row, a group of five stars and a clear button.
    expect(within(menu).getByRole("group", { name: "Rate" })).toBeInTheDocument();
    expect(labelsOf(menu)).toEqual([
      "Play",
      "Play next",
      "Add to queue",
      "Clear rating",
      "Add to favorites",
      "Organize",
      "Beatport",
      "More",
    ]);
    // Each parent opens exactly the entries the bar's button for it opens; Rate and the favorites
    // are lifted to the menu's top level (D26), so Organize's submenu lacks them.
    const lifted = ["Rate", "Add to favorites", "Remove from favorites"];
    const seen = BETWEEN.slice(0, 3);
    for (const name of ["Organize", "Beatport", "More"]) {
      await userEvent.click(within(menu).getByRole("menuitem", { name: new RegExp(`^${name}`) }));
      seen.push(...labelsOf(screen.getByRole("menu", { name })));
    }
    expect(seen).toEqual(BETWEEN.filter((label) => !lifted.includes(label)));
  });

  it("is the same list behind the bar's buttons, group by group", async () => {
    renderScreen();
    await tableReady();
    await userEvent.click(screen.getByText("Track 1"));
    const seen: string[] = [];
    for (const name of ["Play", "Organize", "Beatport", "More"]) {
      seen.push(...labelsOf(await openGroup(name)));
      await userEvent.keyboard("{Escape}");
    }
    // M299: Rate and the favorites are the right-click menu's top level; the bar's Organize has
    // seven or fewer entries without them.
    const lifted = ["Rate", "Add to favorites", "Remove from favorites"];
    expect(seen).toEqual(BETWEEN.filter((label) => !lifted.includes(label)));
  });

  it("has no Accept, Reject or Actions… any more", async () => {
    renderScreen();
    await tableReady();
    await userEvent.click(screen.getByText("Track 1"));
    expect(screen.queryByRole("button", { name: "Actions…" })).toBeNull();
    const menu = await openMenuOn("Track 1");
    expect(labelsOf(menu)).not.toContain("Accept match");
    expect(labelsOf(menu)).not.toContain("Reject match");
  });
});

describe("what the entries do", () => {
  beforeEach(() => {
    OPEN_MATCH.mockClear();
    OPEN_IN_CLEAN.mockClear();
  });

  it("opens the match window with the selected tracks", async () => {
    renderScreen();
    await tableReady();
    await select("Track 1", "Track 3");
    await userEvent.click((await menuItem("Match on Beatport…", await openGroup("Beatport"))));
    expect(OPEN_MATCH).toHaveBeenCalledTimes(1);
    expect(OPEN_MATCH.mock.calls[0]![0]).toEqual({ ids: expect.arrayContaining([1, 3]) });
    expect(mock("startCleanMatch")).not.toHaveBeenCalled();
  });

  it("opens the match window on a question when everything matching is selected", async () => {
    renderScreen();
    await tableReady();
    await userEvent.click(screen.getByText("Track 1"));
    fireEvent.keyDown(screen.getByRole("table", { name: "Library tracks" }), { key: "a", ctrlKey: true });
    await screen.findByText(/everything matching/);
    await userEvent.click((await menuItem("Match on Beatport…", await openGroup("Beatport"))));
    expect(OPEN_MATCH.mock.calls[0]![0]).toEqual({ query: expect.any(Object), count: 3 });
  });

  it("opens Review on the first selected track", async () => {
    renderScreen();
    await tableReady();
    await select("Track 2", "Track 3");
    await userEvent.click(
      (await menuItem("Review these matches", await openGroup("Beatport"))),
    );
    await waitFor(() => expect(OPEN_IN_CLEAN).toHaveBeenCalledWith(2));
  });

  it.each([
    ["Beatport", "Use Beatport values…", "Use Beatport values"],
    ["More", "Edit values…", "Edit values"],
  ] as const)(
    "opens the dialog for %s ▸ %s here, not on Clean (K4)",
    async (group, entry, title) => {
      renderScreen();
      await tableReady();
      await select("Track 1", "Track 2");
      await userEvent.click(await menuItem(entry, await openGroup(group)));
      expect(await screen.findByRole("dialog", { name: title })).toBeInTheDocument();
      // Nothing is sent to Clean, and nothing is changed until the dialog is answered.
      expect(OPEN_MATCH).not.toHaveBeenCalled();
      expect(OPEN_IN_CLEAN).not.toHaveBeenCalled();
      expect(mock("applyBatch")).not.toHaveBeenCalled();
    },
  );

  it("does not offer Save changes into the files in More", async () => {
    renderScreen();
    await tableReady();
    await select("Track 1", "Track 2");
    const more = await openGroup("More");
    expect(within(more).queryByRole("menuitem", { name: "Sync to files…" })).toBeNull();
    expect(within(more).getByRole("menuitem", { name: "Edit values…" })).toBeInTheDocument();
  });

  it("applies the edit to exactly the selected tracks", async () => {
    renderScreen();
    await tableReady();
    await select("Track 1", "Track 3");
    await userEvent.click(await menuItem("Edit values…", await openGroup("More")));
    const dialog = await screen.findByRole("dialog", { name: "Edit values" });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "BPM value" }), { target: { value: "126" } });
    await userEvent.click(within(dialog).getByRole("button", { name: /^Change \d+ tracks?$/ }));
    await waitFor(() => expect(mock("applyBatch")).toHaveBeenCalledTimes(1));
    const call = mock("applyBatch").mock.calls[0]![0];
    expect([...call.selection.track_ids].sort()).toEqual([1, 3]);
    expect(call.operation.kind).toBe("set_override");
  });

  it("opens Edit values from the right-click menu too, on the one row", async () => {
    renderScreen();
    await tableReady();
    await userEvent.click(await menuItem("Edit values…", await openMenuOn("Track 3")));
    expect(await screen.findByRole("dialog", { name: "Edit values" })).toBeInTheDocument();
  });

  it("opens Edit values for the whole selection from Track details", async () => {
    render(
      <ScaleProvider>
        <ToastProvider>
          <InspectorSlotProvider>
            <LibraryScreen onOpenMatch={OPEN_MATCH} onOpenInClean={OPEN_IN_CLEAN} />
            <aside aria-label="Inspector">
              <InspectorSlotOutlet />
            </aside>
          </InspectorSlotProvider>
        </ToastProvider>
      </ScaleProvider>,
    );
    await tableReady();
    await select("Track 1", "Track 2");
    await userEvent.click(await screen.findByRole("button", { name: "Edit values for 2 tracks" } /* M405 (P3) */));
    expect(await screen.findByRole("dialog", { name: "Edit values" })).toBeInTheDocument();
    expect(OPEN_IN_CLEAN).not.toHaveBeenCalled();
  });

  it("no longer offers a file check: that is Clean's Missing files", async () => {
    renderScreen();
    await tableReady();
    expect(await findMenuItem("Check the files are still there", await openMenuOn("Track 3"))).toBeNull();
    expect(mock("startFileCheck")).not.toHaveBeenCalled();
    // Proving an entry absent opens every submenu in turn, which is slow under a loaded run.
  }, 40_000);

  it("shows a moved file's nearest folder", async () => {
    renderScreen();
    await tableReady();
    await userEvent.click((await menuItem("Show in folder", await openMenuOn("Track 2"))));
    await waitFor(() => expect(mock("getTrackFolder")).toHaveBeenCalledWith({ trackId: 2 }));
    await waitFor(() => expect(mock("showItemInFolder")).toHaveBeenCalledWith("C:\\music"));
    expect(await screen.findByText(/nearest folder/)).toBeInTheDocument();
  });

  it("shows it from the bar's More ▸ for one track", async () => {
    renderScreen();
    await tableReady();
    await userEvent.click(screen.getByText("Track 2"));
    await userEvent.click((await menuItem("Show in folder", await openGroup("More"))));
    await waitFor(() => expect(mock("getTrackFolder")).toHaveBeenCalledWith({ trackId: 2 }));
  });

  it("disables Show in folder for several tracks: one file, one folder", async () => {
    renderScreen();
    await tableReady();
    await select("Track 1", "Track 2");
    await openGroup("More");
    expect((await menuItem("Show in folder"))).toHaveAttribute("aria-disabled", "true");
    await userEvent.keyboard("{Escape}");
    // Copy is More's now (M412), and says what it copies.
    await openGroup("More");
    expect((await menuItem("Copy 2 tracks as text"))).toBeInTheDocument();
  });
});

describe("the toolbar row", () => {
  it("is one row directly above the table, with the count and Select all; Columns… is the header's corner", async () => {
    renderScreen();
    await tableReady();
    const table = screen.getByRole("table", { name: "Library tracks" });
    const row = document.querySelector<HTMLElement>(".cp-filter-bar")!;
    // Document order: the filter row, then the table. Select all is at the end of the row (C215).
    expect(row.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(row).queryByRole("button", { name: "Columns" })).toBeNull();
    expect(within(table).getByRole("button", { name: "Columns" })).toBeInTheDocument();
    // The facts line says "3 tracks"; the row repeats it only while a filter narrows the view (A3).
    expect(within(row).queryByRole("status")).toBeNull();
    // Select all is the selection bar's now (M116, D15), not the filter row's.
    expect(within(row).queryByRole("button", { name: /^Select all/ })).toBeNull();
    // No selection, so no bar between the filter row and the table.
    expect(screen.queryByRole("toolbar", { name: "Selection" })).toBeNull();
  });

  it("shows no group buttons until something is selected, then four and the selected-count button", async () => {
    renderScreen();
    await tableReady();
    expect(screen.queryByRole("toolbar", { name: "Selection" })).toBeNull();
    for (const name of ["Play", "Organize", "Beatport", "More"]) {
      expect(screen.queryByRole("button", { name })).toBeNull();
    }
    expect(screen.queryByRole("button", { name: /^Clear selection/ })).toBeNull();
    await userEvent.click(screen.getByText("Track 1"));
    const bar = screen.getByRole("toolbar", { name: "Selection" });
    for (const name of ["Play", "Organize", "Beatport", "More"]) {
      expect(within(bar).getByRole("button", { name })).not.toHaveAttribute("aria-disabled");
    }
    expect(bar).toHaveTextContent("1 selected");
    expect(within(bar).getByRole("button", { name: "Clear selection" })).toBeInTheDocument();
  });

  it("draws the selection bar over the table's bottom rows, never above the table (option 1A)", async () => {
    renderScreen();
    await tableReady();
    const room = document.querySelector(".library-screen__table .track-table__bottom-room");
    // The end room is there before anything is selected, so selecting moves nothing.
    expect(room).not.toBeNull();
    await userEvent.click(screen.getByText("Track 1"));
    const bar = screen.getByRole("toolbar", { name: "Selection" });
    expect(bar).toHaveClass("cp-selection-bar--overlay");
    expect(bar.closest(".track-table__bottom-bar")).not.toBeNull();
    expect(document.querySelector(".library-screen__table .track-table__bottom-room")).toBe(room);
    // Nothing between the filter row and the table: the table is the next part of the column.
    const filter = document.querySelector<HTMLElement>(".cp-filter-bar")!;
    const main = filter.closest(".library-screen__main")!;
    expect([...main.children].some((child) => child.contains(bar) && !child.classList.contains("library-screen__table"))).toBe(false);
  });

  it("clears the selection with the bar's close button", async () => {
    renderScreen();
    await tableReady();
    await select("Track 1", "Track 2");
    await userEvent.click(await screen.findByRole("button", { name: "Clear selection" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: /^Clear selection/ })).toBeNull());
  });

  it("plays the selected tracks in table order from Play ▸", async () => {
    renderScreen();
    await tableReady();
    await select("Track 3", "Track 1");
    await userEvent.click((await menuItem("Play 2 tracks", await openGroup("Play"))));
    await waitFor(() => expect(player().playQueue).toHaveBeenCalled());
    const items = (player().playQueue as Mock).mock.calls[0]![0] as { trackId: number }[];
    expect(items.map((item) => item.trackId)).toEqual([1, 3]);
  });

  it("plays the track that is left selected, not the row just un-ticked", async () => {
    // Ctrl-click Track 1, Track 2, Track 2: the anchor is Track 2's row, but
    // only Track 1 is selected, so only Track 1 plays.
    renderScreen();
    await tableReady();
    await userEvent.click(screen.getByText("Track 1"));
    fireEvent.click(screen.getByText("Track 2"), { ctrlKey: true });
    fireEvent.click(screen.getByText("Track 2"), { ctrlKey: true });
    await screen.findByText(/1 selected/);
    await userEvent.click((await menuItem("Play", await openGroup("Play"))));
    await waitFor(() => expect(player().playQueue).toHaveBeenCalled());
    const items = (player().playQueue as Mock).mock.calls[0]![0] as { trackId: number }[];
    expect(items.map((item) => item.trackId)).toEqual([1]);
    expect(player().playView).not.toHaveBeenCalled();
  });

  it("queues the selection from Play ▸ without interrupting", async () => {
    renderScreen();
    await tableReady();
    await select("Track 1", "Track 2");
    await userEvent.click((await menuItem("Add to queue", await openGroup("Play"))));
    await waitFor(() => expect(player().addToQueue).toHaveBeenCalled());
    expect(player().playQueue).not.toHaveBeenCalled();
  });
});

describe("the table", () => {
  it("marks overridden values and names their source", async () => {
    renderScreen();
    await tableReady();
    const first = screen.getByText("Track 1").closest("[role=row]") as HTMLElement;
    const typed = within(first).getByRole("img", { name: "BPM typed by you. In Rekordbox it is 128." });
    expect(typed.closest(".library-cell__overridden")).toHaveTextContent("126");
    const second = screen.getByText("Track 2").closest("[role=row]") as HTMLElement;
    // M36: the Beatport mark is the pixel "B" glyph.
    expect(
      within(second).getByRole("img", { name: "Genre applied from Beatport. In Rekordbox it is Techno." }).querySelector(".cp-pixel-icon"),
    ).not.toBeNull();
    const third = screen.getByText("Track 3").closest("[role=row]") as HTMLElement;
    expect(third.querySelector(".library-cell__mark")).toBeNull();
  });

  it("copies the value shown, not the imported one", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    renderScreen();
    await tableReady();
    await userEvent.click((await menuItem("Copy as text", await openMenuOn("Track 1"))));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    const [header, row] = (writeText.mock.calls[0]![0] as string).split("\n");
    const bpm = header!.split("\t").indexOf("BPM");
    expect(row!.split("\t")[bpm]).toBe("126");
    Reflect.deleteProperty(navigator, "clipboard");
  });

  it("offers the Clean columns, hidden until asked for, each sortable", () => {
    const clean = LIBRARY_COLUMNS.filter((column) =>
      ["match_state", "match_score", "file_status", "artwork"].includes(column.id),
    );
    expect(clean.map((column) => [column.id, column.header, column.hiddenByDefault, column.sortKey])).toEqual([
      ["match_state", "Match", true, "match_state"],
      ["match_score", "Score", true, "match_score"],
      ["file_status", "File status", true, "file_status"],
      ["artwork", "Artwork", true, undefined],
    ]);
    const row = TRACKS[0]!;
    const text = (id: string) => {
      const column = LIBRARY_COLUMNS.find((entry) => entry.id === id)!;
      return column.text ? column.text(row) : column.render(row);
    };
    expect(text("match_state")).toBe("To check");
    expect(text("match_score")).toBe("81.0");
    expect(text("file_status")).toBe("Present");
    expect(text("artwork")).toBe("—");
  });

  it("draws the Clean columns once they are chosen", async () => {
    renderScreen();
    await tableReady();
    await userEvent.click(screen.getByRole("button", { name: "Columns" }));
    const picker = await screen.findByRole("dialog");
    for (const name of ["Match", "Score", "File status", "Artwork"]) {
      await userEvent.click(within(picker).getByRole("checkbox", { name }));
    }
    await userEvent.keyboard("{Escape}");
    const table = screen.getByRole("table", { name: "Library tracks" });
    expect(within(table).getByRole("columnheader", { name: /Match/ })).toBeInTheDocument();
    expect(within(table).getAllByText("To check").length).toBe(3);
    expect(within(table).getAllByText("81.0").length).toBe(3);
  });

  it("is read again when a change is announced elsewhere", async () => {
    renderScreen();
    await tableReady();
    const before = mock("browseLibrary").mock.calls.length;
    announceLibraryChange();
    await waitFor(() => expect(mock("browseLibrary").mock.calls.length).toBeGreaterThan(before));
  });
});

describe("no save bar on the Library", () => {
  it("draws no Save to files bar, even with unsaved tracks (syncing is per playlist, on Clean)", async () => {
    bridge.getUnsavedValues = vi.fn().mockResolvedValue({ tracks: 2, fields: {} });
    renderScreen();
    await tableReady();
    expect(screen.queryByRole("region", { name: "Save to files" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Sync to files…" })).toBeNull();
  });
});
