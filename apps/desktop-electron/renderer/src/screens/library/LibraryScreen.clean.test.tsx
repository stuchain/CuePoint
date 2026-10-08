/**
 * Clean in the Library (CLEAN-13, DEC-072, then FLW-8 and FLW-12).
 *
 * Over a faked bridge that has Clean's routes:
 *
 * - **One operations list** carries Play, Organize, Beatport, Fix and More,
 *   in the row menu and the selection bar's buttons alike.
 * - **Each entry does what it says**: Beatport ▸ and Fix ▸ open Clean with the
 *   selected tracks (the match window, Review, or Fix values with an action)
 *   rather than running anything here; checking files is a job the status strip
 *   follows.
 * - **The toolbar row** is one row above the table: the bar, the count, Columns….
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
import { ScaleProvider } from "../../tokens/ScaleContext";
import { LIBRARY_COLUMNS } from "./libraryColumns";
import { LibraryScreen } from "./LibraryScreen";
import { menuItem } from "./menuPick.test.util";

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

const OPEN_FIX = vi.fn();
const OPEN_MATCH = vi.fn();
const OPEN_IN_CLEAN = vi.fn();

function renderScreen() {
  return render(
    <ScaleProvider>
      <ToastProvider>
        <LibraryScreen onOpenFix={OPEN_FIX} onOpenMatch={OPEN_MATCH} onOpenInClean={OPEN_IN_CLEAN} />
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
  "Add to Collection…",
  "Add tag…",
  "Remove tag…",
  "Rate▸",
  "Favorite",
  "Remove favorite",
  "Match tracks…",
  "Review these matches",
  "Use Beatport's values…",
  "Edit values…",
  "Save changes into the files…",
  "Check the files are still there",
  "Copy",
  "Show in folder",
];

function labelsOf(menu: HTMLElement): string[] {
  return within(menu).getAllByRole("menuitem").map((node) => node.textContent ?? "");
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
  it("is the bar's groups as submenus: Play on top, then Organize, Beatport, Fix, More", async () => {
    renderScreen();
    await tableReady();
    const menu = await openMenuOn("Track 2");
    expect(labelsOf(menu)).toEqual([
      "Play",
      "Play next",
      "Add to queue",
      "Organize▸",
      "Beatport▸",
      "Fix▸",
      "More▸",
    ]);
    // Each parent opens exactly the entries the bar's button for it opens.
    const seen = BETWEEN.slice(0, 3);
    for (const name of ["Organize", "Beatport", "Fix", "More"]) {
      await userEvent.click(within(menu).getByRole("menuitem", { name: new RegExp(`^${name}`) }));
      seen.push(...labelsOf(screen.getByRole("menu", { name })));
    }
    expect(seen).toEqual(BETWEEN);
  });

  it("is the same list behind the bar's buttons, group by group", async () => {
    renderScreen();
    await tableReady();
    await userEvent.click(screen.getByText("Track 1"));
    const seen: string[] = [];
    for (const name of ["Play", "Organize", "Beatport", "Fix", "More"]) {
      seen.push(...labelsOf(await openGroup(name)));
      await userEvent.keyboard("{Escape}");
    }
    expect(seen).toEqual(BETWEEN);
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
    OPEN_FIX.mockClear();
    OPEN_MATCH.mockClear();
    OPEN_IN_CLEAN.mockClear();
  });

  it("opens the match window with the selected tracks", async () => {
    renderScreen();
    await tableReady();
    await select("Track 1", "Track 3");
    await userEvent.click((await menuItem("Match tracks…", await openGroup("Beatport"))));
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
    await userEvent.click((await menuItem("Match tracks…", await openGroup("Beatport"))));
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
    ["Beatport", "Use Beatport's values…", "beatport"],
    ["Fix", "Edit values…", "edit"],
    ["Fix", "Save changes into the files…", "save"],
  ] as const)("opens Fix values from %s ▸ %s with the selection and the action", async (group, entry, action) => {
    renderScreen();
    await tableReady();
    await select("Track 1", "Track 2");
    await userEvent.click((await menuItem(entry, await openGroup(group))));
    expect(OPEN_FIX).toHaveBeenCalledWith({ ids: expect.arrayContaining([1, 2]) }, action);
    // Nothing is edited or written here: Clean owns the dialogs.
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(mock("applyBatch")).not.toHaveBeenCalled();
  });

  it("opens from the right-click menu too", async () => {
    renderScreen();
    await tableReady();
    await userEvent.click((await menuItem("Edit values…", await openMenuOn("Track 3"))));
    expect(OPEN_FIX).toHaveBeenCalledWith({ ids: [3] }, "edit");
  });

  it("checks files as a job, and reads the table again when it ends", async () => {
    renderScreen();
    await tableReady();
    const before = mock("browseLibrary").mock.calls.length;
    await userEvent.click(
      (await menuItem("Check the files are still there", await openMenuOn("Track 3"))),
    );
    await waitFor(() => expect(mock("startFileCheck")).toHaveBeenCalledWith({ selection: { track_ids: [3] } }));
    expect(await screen.findByText("File check finished.")).toBeInTheDocument();
    await waitFor(() => expect(mock("browseLibrary").mock.calls.length).toBeGreaterThan(before));
  });

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
    expect((await menuItem("Copy 2 tracks"))).toBeInTheDocument();
  });
});

describe("the toolbar row", () => {
  it("is one row directly above the table, with the selection bar, the count and Columns…", async () => {
    renderScreen();
    await tableReady();
    const bar = screen.getByRole("toolbar", { name: "Selected tracks" });
    const table = screen.getByRole("table", { name: "Library tracks" });
    // Document order: the bar, then the table. Nothing else stacks between.
    expect(bar.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const row = bar.closest(".library-toolbar")!;
    expect(within(row as HTMLElement).getByRole("button", { name: "Columns…" })).toBeInTheDocument();
    expect(within(row as HTMLElement).getByRole("status")).toHaveTextContent("3 tracks");
    expect(row.nextElementSibling?.contains(table)).toBe(true);
  });

  it("is there before anything is selected, disabled with the reason, and never moves", async () => {
    renderScreen();
    await tableReady();
    const bar = screen.getByRole("toolbar", { name: "Selected tracks" });
    for (const name of ["Play", "Organize", "Explore", "Beatport", "Fix", "More"]) {
      const button = within(bar).getByRole("button", { name });
      expect(button).toHaveAttribute("aria-disabled", "true");
      expect(button).toHaveAttribute("title", "Select tracks first");
    }
    await userEvent.click(screen.getByText("Track 1"));
    expect(screen.getByRole("toolbar", { name: "Selected tracks" })).toBe(bar);
    expect(within(bar).getByRole("button", { name: "Play" })).not.toHaveAttribute("aria-disabled");
    expect(screen.getByRole("status", { name: "" })).toHaveTextContent("3 tracks · 1 selected");
  });

  it("clears the selection with Clear selection", async () => {
    renderScreen();
    await tableReady();
    await select("Track 1", "Track 2");
    await screen.findByText("2 selected");
    await userEvent.click(screen.getByRole("button", { name: "Clear selection" }));
    await waitFor(() => expect(screen.queryByText(/\d selected/)).toBeNull());
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
    const typed = within(first).getByRole("img", { name: "BPM typed by you. Rekordbox has 128.0." });
    expect(typed.closest(".library-cell__overridden")).toHaveTextContent("126.0");
    const second = screen.getByText("Track 2").closest("[role=row]") as HTMLElement;
    expect(within(second).getByRole("img", { name: "Genre applied from Beatport. Rekordbox has Techno." })).toHaveTextContent("B");
    const third = screen.getByText("Track 3").closest("[role=row]") as HTMLElement;
    expect(third.querySelector(".library-cell__mark")).toBeNull();
  });

  it("copies the value shown, not the imported one", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    renderScreen();
    await tableReady();
    await userEvent.click((await menuItem("Copy", await openMenuOn("Track 1"))));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    const [header, row] = (writeText.mock.calls[0]![0] as string).split("\n");
    const bpm = header!.split("\t").indexOf("BPM");
    expect(row!.split("\t")[bpm]).toBe("126.0");
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
    expect(text("match_state")).toBe("Waiting for you");
    expect(text("match_score")).toBe("81.0");
    expect(text("file_status")).toBe("Present");
    expect(text("artwork")).toBe("None");
  });

  it("draws the Clean columns once they are chosen", async () => {
    renderScreen();
    await tableReady();
    await userEvent.click(screen.getByRole("button", { name: "Columns…" }));
    const picker = await screen.findByRole("dialog");
    for (const name of ["Match", "Score", "File status", "Artwork"]) {
      await userEvent.click(within(picker).getByRole("checkbox", { name }));
    }
    await userEvent.keyboard("{Escape}");
    const table = screen.getByRole("table", { name: "Library tracks" });
    expect(within(table).getByRole("columnheader", { name: /Match/ })).toBeInTheDocument();
    expect(within(table).getAllByText("Waiting for you").length).toBe(3);
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
