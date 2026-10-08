/**
 * The Library opened on one track, from search (HDR-1).
 *
 * `trackWith` is `libraryTrackState` applied the way `openWith` applies rules: once per
 * navigation, over the whole library (nothing filtered out of sight), with that track
 * selected so Track details show it.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import type {
  FilterRuleSet,
  LibrarySearchResponse,
  LibrarySummary,
  LibraryTrackDetail,
  LibraryTrackRow,
} from "../../api/cuepointBridge.types";
import { ToastProvider } from "../../components";
import { InspectorSlotOutlet, InspectorSlotProvider } from "../../components/shell";
import { getSelectedTrack, setSelectedTrack } from "../../components/shell/selectedTrack";
import { ScaleProvider } from "../../tokens/ScaleContext";
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
  setSelectedTrack(null);
  delete (window as unknown as { cuepoint?: unknown }).cuepoint;
  vi.restoreAllMocks();
});

const RULES: FilterRuleSet = { match: "all", rules: [{ field: "key", operator: "is", value: "8A" }] };

function renderScreen(props: Record<string, unknown> = {}) {
  const tree = (extra: Record<string, unknown>) => (
    <ScaleProvider>
      <ToastProvider>
        <InspectorSlotProvider>
          <LibraryScreen {...extra} />
          <InspectorSlotOutlet />
        </InspectorSlotProvider>
      </ToastProvider>
    </ScaleProvider>
  );
  const view = render(tree(props));
  return { ...view, again: (extra: Record<string, unknown>) => view.rerender(tree(extra)) };
}

// Within the table: Track details repeats the title of the selected track.
const rowFor = (text: string) =>
  within(screen.getByRole("table", { name: "Library tracks" }))
    .getByText(text)
    .closest("[role=row]")!;

describe("the Library opened on a track", () => {
  it("shows that track selected, with its details", async () => {
    renderScreen({ trackWith: { trackId: 3, token: "nav-1" } });

    await screen.findByRole("table", { name: "Library tracks" });
    await waitFor(() => expect(rowFor("Track 3")).toHaveAttribute("aria-selected", "true"));
    expect(rowFor("Track 1")).toHaveAttribute("aria-selected", "false");
    await waitFor(() => expect(mock("getLibraryTrack")).toHaveBeenCalledWith({ trackId: 3 }));
  });

  it("opens the whole library: filters and search left over are cleared", async () => {
    const view = renderScreen({ openWith: { rules: RULES, token: "rules-1" } });
    await screen.findByText("Track 1");
    expect(JSON.stringify(mock("browseLibrary").mock.calls.at(-1)![0])).toContain("filters");

    view.again({ openWith: { rules: RULES, token: "rules-1" }, trackWith: { trackId: 2, token: "nav-2" } });

    await waitFor(() => expect(rowFor("Track 2")).toHaveAttribute("aria-selected", "true"));
    const last = mock("browseLibrary").mock.calls.at(-1)![0] as Record<string, unknown>;
    expect(last.filters ?? null).toBeNull();
    expect(last.playlistId ?? null).toBeNull();
    expect(last.q ?? "").toBe("");
  });

  it("is applied once per navigation, so the reader's own click is not undone", async () => {
    const view = renderScreen({ trackWith: { trackId: 3, token: "nav-1" } });
    await waitFor(() => expect(rowFor("Track 3")).toHaveAttribute("aria-selected", "true"));

    fireEvent.click(rowFor("Track 1"));
    await waitFor(() => expect(rowFor("Track 1")).toHaveAttribute("aria-selected", "true"));

    view.again({ trackWith: { trackId: 3, token: "nav-1" } });
    expect(rowFor("Track 1")).toHaveAttribute("aria-selected", "true");

    view.again({ trackWith: { trackId: 3, token: "nav-2" } });
    await waitFor(() => expect(rowFor("Track 3")).toHaveAttribute("aria-selected", "true"));
  });

  it("selects nothing, and says so, when the track is not in the library any more", async () => {
    renderScreen({ trackWith: { trackId: 99, token: "nav-1" } });
    await screen.findByText("Track 1");
    expect(await screen.findByText("That track is no longer in your library.")).toBeInTheDocument();
    for (const name of ["Track 1", "Track 2", "Track 3"]) {
      expect(rowFor(name)).toHaveAttribute("aria-selected", "false");
    }
  });

  it("tells the caller once the opening is applied, so history can drop it", async () => {
    const onOpeningApplied = vi.fn();
    renderScreen({ trackWith: { trackId: 3, token: "nav-1" }, onOpeningApplied });
    await waitFor(() => expect(rowFor("Track 3")).toHaveAttribute("aria-selected", "true"));
    expect(onOpeningApplied).toHaveBeenCalledTimes(1);
  });
});

describe("the Library tells the header's wheel which track is selected (PAGES-10, DEC-157)", () => {
  it("reports the selected track's id, key and title, and clears it with the selection", async () => {
    const view = renderScreen({ trackWith: { trackId: 3, token: "nav-1" } });
    await waitFor(() =>
      expect(getSelectedTrack()).toEqual({ id: 3, key: "8A", title: "Track 3" }),
    );
    fireEvent.click(rowFor("Track 1"));
    await waitFor(() => expect(getSelectedTrack()).toMatchObject({ id: 1, title: "Track 1" }));
    view.unmount();
    expect(getSelectedTrack()).toBeNull();
  });

  it("reports the clicked row at once, before its details load and when they fail", async () => {
    renderScreen();
    await waitFor(() => expect(rowFor("Track 1")).toBeTruthy());
    // The details never come: the row alone is enough for the wheel.
    mock("getLibraryTrack").mockImplementation(() => new Promise(() => {}));
    fireEvent.click(rowFor("Track 1"));
    expect(getSelectedTrack()).toEqual({ id: 1, key: "8A", title: "Track 1" });
    mock("getLibraryTrack").mockRejectedValue(new Error("no details"));
    fireEvent.click(rowFor("Track 2"));
    await waitFor(() => expect(mock("getLibraryTrack")).toHaveBeenCalledWith({ trackId: 2 }));
    expect(getSelectedTrack()).toMatchObject({ id: 2, title: "Track 2" });
  });
});
