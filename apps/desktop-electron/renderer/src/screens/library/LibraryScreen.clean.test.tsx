/**
 * Clean in the Library (CLEAN-13, DEC-072).
 *
 * Over a faked bridge that has Clean's routes:
 *
 * - **One operations list** carries the Clean entries, in the row menu and the
 *   Actions button alike.
 * - **Each entry does what it says**: decisions, applying and typed values go
 *   through the batch path; matching and checking files start jobs; writing
 *   tags opens its dialog.
 * - **A typed value's refusal** is shown in the dialog in the engine's words.
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
    effective_key: "9A",
    overridden: ["key"],
    override_sources: { key: "beatport" },
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

function renderScreen() {
  return render(
    <ScaleProvider>
      <ToastProvider>
        <LibraryScreen />
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

function lastBatch(): Record<string, unknown> {
  const calls = mock("applyBatch").mock.calls;
  return calls[calls.length - 1]![0] as Record<string, unknown>;
}

const CLEAN_ENTRIES = [
  "Match on Beatport",
  "Re-match",
  "Accept match",
  "Reject match",
  "Apply Beatport values…",
  "Edit metadata…",
  "Check files",
  "Write tags to files…",
];

describe("the operations list", () => {
  it("carries the Clean entries after the organization ones, in the row menu", async () => {
    renderScreen();
    await tableReady();
    const menu = await openMenuOn("Track 2");
    const labels = within(menu).getAllByRole("menuitem").map((node) => node.textContent);
    expect(labels.slice(-CLEAN_ENTRIES.length)).toEqual(CLEAN_ENTRIES);
    expect(labels).toContain("Show in folder");
  });

  it("is the same list behind the Actions button", async () => {
    renderScreen();
    await tableReady();
    await userEvent.click(screen.getByText("Track 1"));
    await userEvent.click(screen.getByRole("button", { name: "Actions…" }));
    const menu = await screen.findByRole("menu");
    const labels = within(menu).getAllByRole("menuitem").map((node) => node.textContent);
    expect(labels).toEqual([
      "Add to Collection…",
      "Add tag…",
      "Remove tag…",
      "Rate▸",
      "Favorite",
      "Remove favorite",
      ...CLEAN_ENTRIES,
    ]);
  });
});

describe("what the entries do", () => {
  it("accepts and rejects through the batch path", async () => {
    renderScreen();
    await tableReady();
    await userEvent.click(within(await openMenuOn("Track 2")).getByRole("menuitem", { name: "Accept match" }));
    await waitFor(() =>
      expect(lastBatch()).toEqual({ selection: { track_ids: [2] }, operation: { kind: "accept_match" } }),
    );
    expect(await screen.findByText("Accepted the match on 1 track.")).toBeInTheDocument();

    await userEvent.click(within(await openMenuOn("Track 3")).getByRole("menuitem", { name: "Reject match" }));
    await waitFor(() =>
      expect(lastBatch()).toEqual({ selection: { track_ids: [3] }, operation: { kind: "reject_match" } }),
    );
  });

  it("matches, and matches again, as jobs", async () => {
    renderScreen();
    await tableReady();
    await userEvent.click(within(await openMenuOn("Track 1")).getByRole("menuitem", { name: "Match on Beatport" }));
    await waitFor(() =>
      expect(mock("startCleanMatch")).toHaveBeenCalledWith({ selection: { track_ids: [1] }, rematch: false }),
    );
    expect(await screen.findByText("Matching 1 track on Beatport.")).toBeInTheDocument();
    expect(await screen.findByText("Matching finished.")).toBeInTheDocument();

    await userEvent.click(within(await openMenuOn("Track 1")).getByRole("menuitem", { name: "Re-match" }));
    await waitFor(() =>
      expect(mock("startCleanMatch")).toHaveBeenLastCalledWith({ selection: { track_ids: [1] }, rematch: true }),
    );
  });

  it("checks files as a job, and reads the table again when it ends", async () => {
    renderScreen();
    await tableReady();
    const before = mock("browseLibrary").mock.calls.length;
    await userEvent.click(within(await openMenuOn("Track 3")).getByRole("menuitem", { name: "Check files" }));
    await waitFor(() => expect(mock("startFileCheck")).toHaveBeenCalledWith({ selection: { track_ids: [3] } }));
    expect(await screen.findByText("File check finished.")).toBeInTheDocument();
    await waitFor(() => expect(mock("browseLibrary").mock.calls.length).toBeGreaterThan(before));
  });

  it("applies the chosen Beatport fields as one batch", async () => {
    renderScreen();
    await tableReady();
    await userEvent.click(
      within(await openMenuOn("Track 2")).getByRole("menuitem", { name: "Apply Beatport values…" }),
    );
    const dialog = await screen.findByRole("dialog", { name: "Apply Beatport values" });
    const apply = within(dialog).getByRole("button", { name: "Apply" });
    expect(apply).toBeDisabled();
    await userEvent.click(within(dialog).getByRole("checkbox", { name: "Year" }));
    await userEvent.click(within(dialog).getByRole("checkbox", { name: "Key" }));
    await userEvent.click(apply);
    await waitFor(() =>
      expect(lastBatch()).toEqual({
        selection: { track_ids: [2] },
        operation: { kind: "apply_match", value: ["key", "year"] },
      }),
    );
    expect(await screen.findByText("Applied Beatport's key and year to 1 track.")).toBeInTheDocument();
  });

  it("edits one track through its own route", async () => {
    renderScreen();
    await tableReady();
    await userEvent.click(within(await openMenuOn("Track 3")).getByRole("menuitem", { name: "Edit metadata…" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit metadata" });
    await userEvent.type(within(dialog).getByRole("textbox", { name: "Genre value" }), "House");
    await userEvent.click(within(dialog).getByRole("button", { name: "Apply" }));
    await waitFor(() => expect(mock("setTrackOverrides")).toHaveBeenCalledWith({ trackId: 3, genre: "House" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Edit metadata" })).toBeNull());
    expect(mock("applyBatch")).not.toHaveBeenCalled();
  });

  it("edits a selection through the batch path, and shows a refusal in the dialog", async () => {
    mock("applyBatch").mockRejectedValueOnce(new Error("bpm must be between 20 and 300, not 400"));
    renderScreen();
    await tableReady();
    await userEvent.click(screen.getByText("Track 1"));
    fireEvent.click(screen.getByText("Track 3"), { shiftKey: true });
    await screen.findByText(/3 tracks selected/);
    await userEvent.click(within(await openMenuOn("Track 2")).getByRole("menuitem", { name: "Edit metadata…" }));

    const dialog = await screen.findByRole("dialog", { name: "Edit metadata" });
    expect(within(dialog).getByText(/Your values for 3 tracks/)).toBeInTheDocument();
    await userEvent.type(within(dialog).getByRole("textbox", { name: "BPM value" }), "400");
    await userEvent.selectOptions(within(dialog).getByRole("combobox", { name: "Year" }), "clear");
    await userEvent.click(within(dialog).getByRole("button", { name: "Apply" }));

    const refusal = await within(dialog).findByRole("alert");
    expect(refusal).toHaveTextContent("bpm must be between 20 and 300, not 400");
    expect(within(dialog).getByRole("textbox", { name: "BPM value" })).toHaveAttribute("aria-invalid", "true");
    // Refused before anything was written, so the year was never sent.
    expect(mock("applyBatch")).toHaveBeenCalledTimes(1);

    await userEvent.clear(within(dialog).getByRole("textbox", { name: "BPM value" }));
    await userEvent.type(within(dialog).getByRole("textbox", { name: "BPM value" }), "126");
    await userEvent.click(within(dialog).getByRole("button", { name: "Apply" }));
    await waitFor(() => expect(mock("applyBatch")).toHaveBeenCalledTimes(3));
    expect(mock("applyBatch").mock.calls.slice(1).map((call) => call[0])).toEqual([
      { selection: { track_ids: [1, 2, 3] }, operation: { kind: "set_override", value: { field: "bpm", value: 126 } } },
      { selection: { track_ids: [1, 2, 3] }, operation: { kind: "set_override", value: { field: "year", value: null } } },
    ]);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Edit metadata" })).toBeNull());
  });

  it("opens the tag write dialog on the target", async () => {
    mock("previewTagWrite").mockResolvedValue({
      preview: {
        preview_id: "p",
        options: {},
        total: 1,
        files: 0,
        fields: {},
        skipped: {},
        field_skipped: {},
        changes: [],
        cancelled: false,
        computed_at: "",
        duration_seconds: 0,
        summary_line: "",
      },
    });
    renderScreen();
    await tableReady();
    await userEvent.click(
      within(await openMenuOn("Track 2")).getByRole("menuitem", { name: "Write tags to files…" }),
    );
    const dialog = await screen.findByRole("dialog", { name: "Write tags to files" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Preview" }));
    await waitFor(() =>
      expect(mock("previewTagWrite")).toHaveBeenCalledWith(
        expect.objectContaining({ selection: { track_ids: [2] } }),
      ),
    );
    expect(mock("startTagWrite")).not.toHaveBeenCalled();
  });

  it("shows a moved file's nearest folder", async () => {
    renderScreen();
    await tableReady();
    await userEvent.click(within(await openMenuOn("Track 2")).getByRole("menuitem", { name: "Show in folder" }));
    await waitFor(() => expect(mock("getTrackFolder")).toHaveBeenCalledWith({ trackId: 2 }));
    await waitFor(() => expect(mock("showItemInFolder")).toHaveBeenCalledWith("C:\\music"));
    expect(await screen.findByText(/nearest folder/)).toBeInTheDocument();
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
    expect(within(second).getByRole("img", { name: "Key applied from Beatport. Rekordbox has 8A." })).toHaveTextContent("B");
    const third = screen.getByText("Track 3").closest("[role=row]") as HTMLElement;
    expect(third.querySelector(".library-cell__mark")).toBeNull();
  });

  it("copies the value shown, not the imported one", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    renderScreen();
    await tableReady();
    await userEvent.click(within(await openMenuOn("Track 1")).getByRole("menuitem", { name: "Copy" }));
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
    expect(text("match_state")).toBe("Needs review");
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
    expect(within(table).getAllByText("Needs review").length).toBe(3);
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
