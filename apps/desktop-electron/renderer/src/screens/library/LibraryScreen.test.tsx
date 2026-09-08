/**
 * The Library page (LIBRARY-11, then LIBUI-10 / DEC-039).
 *
 * LIBRARY-11's acceptance criterion is a sentence about a user: they can
 * import a collection, see it, refresh it, and **cancel a refresh at the
 * preview without anything changing**. Those tests are all still here, because
 * DEC-039 changed what the page shows and not what it does to a library. The
 * ones that matter most are still the ones that assert nothing happened.
 *
 * LIBUI-10 adds the second half: the page is the browser now, so it is tested
 * as one — the three empty states, scoping by playlist, select-all and Escape,
 * the Inspector it fills, and the double-click that deliberately still does
 * nothing (DEC-046).
 *
 * The bridge is faked at `window.cuepoint`, which is where the renderer's only
 * contact with the engine lives. Jobs are followed the way the real page
 * follows them — start, then wait for a terminal state — so a page that forgot
 * to wait would show its "done" toast against a job still running and fail
 * here. The browse fake echoes back what it was asked (LIBUI-03), because a
 * response that does not is one the page is right to throw away.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { LibraryScreen } from "./LibraryScreen";
import { ToastProvider } from "../../components";
import { InspectorSlotProvider, useInspectorContent } from "../../components/shell";
import { ScaleProvider } from "../../tokens/ScaleContext";
import type {
  CollectionNode,
  LibraryFilterVocabulary,
  LibraryPlaylistNode,
  LibrarySearchResponse,
  LibrarySummary,
  LibraryTrackDetail,
  LibraryTrackRow,
  RefreshDiff,
} from "../../api/cuepointBridge.types";

function category<T>(count = 0, items: T[] = []) {
  return { count, items, truncated: count > items.length };
}

const EMPTY_SUMMARY: LibrarySummary = {
  track_count: 0,
  playlist_count: 0,
  playlist_entry_count: 0,
  library_empty: true,
  source: null,
};

function loadedSummary(overrides: Partial<LibrarySummary> = {}): LibrarySummary {
  return {
    track_count: 3880,
    playlist_count: 234,
    playlist_entry_count: 13870,
    library_empty: false,
    source: {
      xml_path: "C:\\Users\\dj\\Downloads\\collection.xml",
      imported_at: "2026-09-03T10:00:00Z",
      xml_modified_at: "2026-09-03T09:00:00Z",
      xml_size_bytes: 2048,
      track_count: 3880,
      playlist_count: 234,
      exists: true,
      changed: false,
    },
    ...overrides,
  };
}

function diff(overrides: Partial<RefreshDiff> = {}): RefreshDiff {
  return {
    diff_id: "diff-1",
    xml_path: "C:\\Users\\dj\\Downloads\\collection.xml",
    is_empty: false,
    contents_compared: true,
    duration_seconds: 0.5,
    computed_at: "2026-09-03T11:00:00Z",
    xml_modified_at: "2026-09-03T10:30:00Z",
    xml_size_bytes: 2048,
    tracks: {
      added: category(3),
      changed: category(10),
      removed: category(2, [
        {
          rekordbox_track_id: "7",
          title: "Gone Track",
          artist: "Departed",
          file_path: "/m/7.mp3",
        },
        {
          rekordbox_track_id: "8",
          title: "Also Gone",
          artist: "Departed",
          file_path: "/m/8.mp3",
        },
      ]),
      relinked: category(),
      notable_changed_count: 10,
    },
    playlists: { added: category(), changed: category(4), removed: category() },
    references: {
      collection_count: 0,
      set_count: 0,
      referenced_track_count: 0,
      referenced_track_ids: [],
      has_references: false,
    },
    ...overrides,
  };
}

const APPLIED = {
  diff_id: "diff-1",
  xml_path: "C:\\Users\\dj\\Downloads\\collection.xml",
  track_count: 3881,
  tracks_inserted: 3,
  tracks_updated: 3878,
  tracks_deleted: 2,
  relinked_count: 0,
  playlists: { nodes: 234, playlists: 206, folders: 28, entries: 13800 },
  references: {
    collection_count: 0,
    set_count: 0,
    referenced_track_count: 0,
    referenced_track_ids: [],
    has_references: false,
  },
  duration_seconds: 0.6,
  summary_line: "Library refreshed",
};

/** A row with every field present, so a column that reads one has something. */
function track(id: number, overrides: Partial<LibraryTrackRow> = {}): LibraryTrackRow {
  return {
    id,
    rekordbox_track_id: String(id),
    title: `Track ${id}`,
    artist: `Artist ${id}`,
    remixer: null,
    album: "An Album",
    label: "A Label",
    genre: "Techno",
    key: "8A",
    bpm: 128 + id,
    year: 2024,
    duration_seconds: 300 + id,
    rating: 4,
    play_count: 2,
    colour: null,
    date_added: "2026-01-01",
    comment: "a comment",
    bitrate: 320,
    file_path: `C:\\music\\${id}.mp3`,
    effective_rating: 4,
    rating_source: "rekordbox",
    favorite: false,
    ...overrides,
  };
}

const TRACKS = [track(1), track(2), track(3)];

const PLAYLISTS: LibraryPlaylistNode[] = [
  {
    id: 10,
    parent_id: null,
    name: "Friday",
    kind: "playlist",
    depth: 0,
    position: 0,
    path: "Friday",
    track_count: 2,
  },
];

const VOCABULARY: LibraryFilterVocabulary = {
  fields: [
    {
      name: "genre",
      type: "text",
      label: "Genre",
      facetable: true,
      integer: false,
      operators: ["is", "contains"],
    },
  ],
  operators: { is: { arity: "single" }, contains: { arity: "single" } },
  facetable: ["genre"],
  sortable: ["artist", "title", "bpm", "playlist_position"],
};

/**
 * What the engine would answer, echoed (LIBUI-03).
 *
 * `rows` is the whole result and the window is sliced out of it here, the way
 * the engine slices it out of SQLite — so an offset the page gets wrong shows
 * up as the wrong rows rather than as the same three every time.
 */
function browseAnswer(
  params: Record<string, unknown>,
  rows: LibraryTrackRow[],
): LibrarySearchResponse {
  const offset = Number(params.offset ?? 0);
  const limit = Number(params.limit ?? 100);
  const page = rows.slice(offset, offset + limit);
  const ids = params.fields === "id";
  return {
    query: (params.q as string) ?? "",
    total: rows.length,
    limit,
    offset,
    tracks: ids ? [] : page,
    track_ids: ids ? page.map((row) => row.id ?? 0) : undefined,
    library_empty: false,
    mode: "browse",
    scope: (params.playlistId as number | null) ?? null,
    // ORG-08 echoes CuePoint's scope under its own names, and the page checks
    // both before it accepts a response as current.
    collection_scope: (params.scope as "collection" | "smart" | undefined) ?? null,
    collection_id: (params.collectionId as number | null) ?? null,
    sort: params.sort as string,
    dir: params.dir as "asc" | "desc",
    filters: (params.filters as LibrarySearchResponse["filters"]) ?? null,
  };
}

const DETAIL: LibraryTrackDetail = {
  track: track(1),
  playlists: PLAYLISTS,
  playlist_count: 1,
  metadata: {
    track_id: 1,
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

/** CuePoint's own tree (ORG-09): a folder, a Collection, a saved filter. */
const COLLECTIONS: CollectionNode[] = [
  {
    id: 11,
    parent_id: null,
    kind: "folder",
    name: "Sets",
    position: 0,
    depth: 0,
    rules: null,
    sort: null,
    dir: null,
    frozen_from_id: null,
    frozen_at: null,
    entry_count: 0,
    track_count: 0,
    broken: false,
    problem: null,
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
  },
  {
    id: 12,
    parent_id: 11,
    kind: "collection",
    name: "Warmups",
    position: 0,
    depth: 1,
    rules: null,
    sort: null,
    dir: null,
    frozen_from_id: null,
    frozen_at: null,
    entry_count: 2,
    track_count: 2,
    broken: false,
    problem: null,
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
  },
  {
    id: 13,
    parent_id: null,
    kind: "smart",
    name: "Recent techno",
    position: 1,
    depth: 0,
    rules: { match: "all", rules: [{ field: "genre", operator: "is", value: "Techno" }] },
    sort: "date_added",
    dir: "desc",
    frozen_from_id: null,
    frozen_at: null,
    entry_count: 0,
    track_count: 0,
    broken: false,
    problem: null,
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
  },
];

interface Bridge {
  getLibrarySummary: ReturnType<typeof vi.fn>;
  startLibraryImport: ReturnType<typeof vi.fn>;
  startLibraryRefreshPreview: ReturnType<typeof vi.fn>;
  startLibraryRefreshApply: ReturnType<typeof vi.fn>;
  getJob: ReturnType<typeof vi.fn>;
  getJobResults: ReturnType<typeof vi.fn>;
  openXmlFileDialog: ReturnType<typeof vi.fn>;
  browseLibrary: ReturnType<typeof vi.fn>;
  getLibraryPlaylists: ReturnType<typeof vi.fn>;
  getCollections: ReturnType<typeof vi.fn>;
  createCollection: ReturnType<typeof vi.fn>;
  addTracksToCollection: ReturnType<typeof vi.fn>;
  getLibraryFilterFields: ReturnType<typeof vi.fn>;
  getLibraryFacet: ReturnType<typeof vi.fn>;
  getLibraryTrack: ReturnType<typeof vi.fn>;
  /** CuePoint's own layer, editable from the Inspector (ORG-10). */
  setTrackMetadata: ReturnType<typeof vi.fn>;
  getTrackHistory: ReturnType<typeof vi.fn>;
  getTags: ReturnType<typeof vi.fn>;
  /** The one entry point every organization action goes through (ORG-11). */
  applyBatch: ReturnType<typeof vi.fn>;
  createTag: ReturnType<typeof vi.fn>;
  getCollectionEntries: ReturnType<typeof vi.fn>;
  reorderCollectionEntry: ReturnType<typeof vi.fn>;
  showItemInFolder: ReturnType<typeof vi.fn>;
  /** The player namespace (PLAYER-09); the same shape preload exposes. */
  player: {
    playView: ReturnType<typeof vi.fn>;
    playQueue: ReturnType<typeof vi.fn>;
    playNext: ReturnType<typeof vi.fn>;
    addToQueue: ReturnType<typeof vi.fn>;
  };
}

let bridge: Bridge;

function install(overrides: Partial<Bridge> = {}) {
  bridge = {
    getLibrarySummary: vi.fn().mockResolvedValue(EMPTY_SUMMARY),
    startLibraryImport: vi.fn().mockResolvedValue({ job_id: "job-import" }),
    startLibraryRefreshPreview: vi.fn().mockResolvedValue({ job_id: "job-preview" }),
    startLibraryRefreshApply: vi.fn().mockResolvedValue({ job_id: "job-apply" }),
    // No `subscribeJobEvents` on purpose: the page must work through the poll
    // fallback too, and polling is the path a browser-lab render takes.
    getJob: vi.fn().mockResolvedValue({ id: "job", state: "succeeded" }),
    getJobResults: vi.fn().mockResolvedValue({ id: "job", state: "succeeded" }),
    openXmlFileDialog: vi
      .fn()
      .mockResolvedValue({ canceled: false, filePath: "C:\\new\\collection.xml" }),
    browseLibrary: vi.fn(async (params: Record<string, unknown>) =>
      browseAnswer(params, TRACKS),
    ),
    getLibraryPlaylists: vi
      .fn()
      .mockResolvedValue({ playlists: PLAYLISTS, total: PLAYLISTS.length }),
    getCollections: vi
      .fn()
      .mockResolvedValue({ collections: COLLECTIONS, total: COLLECTIONS.length }),
    createCollection: vi
      .fn()
      .mockResolvedValue({ collection: COLLECTIONS[0] }),
    addTracksToCollection: vi.fn().mockResolvedValue({
      added: 1,
      skipped: 0,
      added_track_ids: [1],
      skipped_track_ids: [],
    }),
    getLibraryFilterFields: vi.fn().mockResolvedValue(VOCABULARY),
    getLibraryFacet: vi.fn().mockResolvedValue({
      field: "genre",
      values: [],
      truncated: false,
      total_values: 0,
      range: null,
    }),
    getLibraryTrack: vi.fn().mockResolvedValue(DETAIL),
    setTrackMetadata: vi.fn().mockResolvedValue({ metadata: DETAIL.metadata }),
    getTrackHistory: vi.fn().mockResolvedValue({ track_id: 1, changes: [], limit: 50 }),
    getTags: vi.fn().mockResolvedValue({
      tags: [
        {
          id: 21,
          name: "Peak-time",
          category: "energy",
          colour: null,
          created_at: "2026-01-01",
          track_count: 9,
        },
      ],
      categories: ["energy"],
    }),
    applyBatch: vi.fn().mockResolvedValue({
      applied: {
        batch_id: "b1",
        operation: "set_rating",
        target: "4",
        total: 1,
        changed: 1,
        unchanged: 0,
        failed: 0,
        cancelled: false,
      },
    }),
    createTag: vi.fn().mockResolvedValue({
      tag: { id: 22, name: "Closer", category: null, colour: null, created_at: "2026-09-08" },
    }),
    getCollectionEntries: vi.fn().mockResolvedValue({
      collection_id: 12,
      entries: [
        { id: 500, collection_id: 12, track_id: 1, position: 0, added_at: "2026-01-01" },
      ],
      entry_count: 2,
      track_count: 2,
      offset: 0,
    }),
    reorderCollectionEntry: vi.fn().mockResolvedValue({
      entry: { id: 500, collection_id: 12, track_id: 1, position: 2, added_at: "2026-01-01" },
    }),
    showItemInFolder: vi.fn().mockResolvedValue(undefined),
    player: {
      playView: vi.fn().mockResolvedValue({ ok: true }),
      playQueue: vi.fn().mockResolvedValue({ ok: true }),
      playNext: vi.fn().mockResolvedValue(undefined),
      addToQueue: vi.fn().mockResolvedValue(undefined),
    },
    ...overrides,
  };
  (window as unknown as { cuepoint?: unknown }).cuepoint = bridge;
}

function renderScreen(props: { onOpenRekordboxInstructions?: () => void } = {}) {
  return render(
    <ScaleProvider>
      <ToastProvider>
        <LibraryScreen {...props} />
      </ToastProvider>
    </ScaleProvider>,
  );
}

/** The table holding rows is what "the first window landed" looks like. */
async function tableReady() {
  await screen.findByRole("table", { name: "Library tracks" });
  await screen.findByText("Track 1");
}

/** The most recent browse request, which is the question the page is asking. */
function lastBrowse(): Record<string, unknown> {
  const calls = bridge.browseLibrary.mock.calls;
  return calls[calls.length - 1][0] as Record<string, unknown>;
}

beforeAll(() => {
  // jsdom lays nothing out and has no ResizeObserver, so a virtualized table
  // rendered here would show no rows at all. Both are supplied and nothing
  // else is; the same fake `TrackTable.test.tsx` uses, for the same reason.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;

  Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
    configurable: true,
    get: () => 1200,
  });
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    get: () => 600,
  });
});

afterAll(() => {
  // Reflect, because the properties are declared read-only: `delete` on them
  // is a type error even though it is exactly what has to happen.
  Reflect.deleteProperty(HTMLElement.prototype, "offsetWidth");
  Reflect.deleteProperty(HTMLElement.prototype, "offsetHeight");
});

beforeEach(() => {
  install();
  // The column layout is persisted (DEC-042), so a test that reordered or
  // hid a column would otherwise decide what the next one opens on.
  localStorage.clear();
});

afterEach(() => {
  delete (window as unknown as { cuepoint?: unknown }).cuepoint;
  vi.restoreAllMocks();
});

describe("the empty state", () => {
  it("says what to do rather than showing zeroes", async () => {
    renderScreen();

    expect(await screen.findByText(/No collection imported yet/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Import a collection/i })).toBeInTheDocument();
    // Zeroes would read as "your library is empty", which is a different
    // problem from "you have not imported anything".
    expect(screen.queryByTestId("library-track-count")).not.toBeInTheDocument();
  });

  it("offers the export instructions when the shell supplies them", async () => {
    const onOpen = vi.fn();
    renderScreen({ onOpenRekordboxInstructions: onOpen });

    await userEvent.click(await screen.findByRole("button", { name: /How do I export/i }));

    expect(onOpen).toHaveBeenCalled();
  });

  it("omits the instructions button when the shell has none to offer", async () => {
    renderScreen();
    await screen.findByText(/No collection imported yet/i);

    expect(screen.queryByRole("button", { name: /How do I export/i })).not.toBeInTheDocument();
  });
});

describe("importing", () => {
  it("picks a file, runs the job, and shows what landed", async () => {
    bridge.getLibrarySummary
      .mockResolvedValueOnce(EMPTY_SUMMARY)
      .mockResolvedValue(loadedSummary());
    renderScreen();

    await userEvent.click(await screen.findByRole("button", { name: /Import a collection/i }));

    await waitFor(() => expect(bridge.startLibraryImport).toHaveBeenCalled());
    expect(bridge.startLibraryImport).toHaveBeenCalledWith({
      xml_path: "C:\\new\\collection.xml",
    });
    expect(await screen.findByTestId("library-track-count")).toHaveTextContent("3,880");
    // Both the name and the full path say "collection.xml", deliberately: the
    // name is what a user recognises, the path is what they check when a file
    // has moved.
    expect(screen.getAllByText(/collection\.xml/).length).toBeGreaterThan(0);
  });

  it("starts nothing when the file dialog is cancelled", async () => {
    bridge.openXmlFileDialog.mockResolvedValue({ canceled: true });
    renderScreen();

    await userEvent.click(await screen.findByRole("button", { name: /Import a collection/i }));

    expect(bridge.startLibraryImport).not.toHaveBeenCalled();
  });

  it("explains a failed import instead of leaving the page silent", async () => {
    bridge.getJob.mockResolvedValue({
      id: "job-import",
      state: "failed",
      error: { code: "LIBRARY_XML_NO_COLLECTION", message: "no COLLECTION" },
    });
    renderScreen();

    await userEvent.click(await screen.findByRole("button", { name: /Import a collection/i }));

    expect(await screen.findByText(/Export Collection/i)).toBeInTheDocument();
  });

  it("reports a refusal that happens before a job exists", async () => {
    bridge.startLibraryImport.mockRejectedValue(new Error("No such file: /gone.xml"));
    renderScreen();

    await userEvent.click(await screen.findByRole("button", { name: /Import a collection/i }));

    expect(await screen.findByText(/No such file/i)).toBeInTheDocument();
  });
});

describe("an imported library", () => {
  beforeEach(() => {
    bridge.getLibrarySummary.mockResolvedValue(loadedSummary());
  });

  it("shows the counts and where they came from", async () => {
    renderScreen();

    expect(await screen.findByTestId("library-track-count")).toHaveTextContent("3,880");
    expect(screen.getByText(/234 playlists/)).toBeInTheDocument();
    expect(screen.getByText(/13,870 entries/)).toBeInTheDocument();
    expect(screen.getByText("C:\\Users\\dj\\Downloads\\collection.xml")).toBeInTheDocument();
  });

  it("says the export is unchanged when it is", async () => {
    renderScreen();

    expect(await screen.findByText(/Unchanged since your last import/i)).toBeInTheDocument();
    expect(screen.getByText("Up to date")).toBeInTheDocument();
  });

  it("flags an export that has moved on", async () => {
    bridge.getLibrarySummary.mockResolvedValue(
      loadedSummary({ source: { ...loadedSummary().source!, changed: true } }),
    );
    renderScreen();

    expect(await screen.findByText(/has changed since your last import/i)).toBeInTheDocument();
    expect(screen.getByText("Out of date")).toBeInTheDocument();
  });

  it("flags an export that is no longer there", async () => {
    bridge.getLibrarySummary.mockResolvedValue(
      loadedSummary({
        source: { ...loadedSummary().source!, exists: false, changed: null },
      }),
    );
    renderScreen();

    expect(await screen.findByText(/no longer where it was/i)).toBeInTheDocument();
  });

  /**
   * This assertion is inverted from LIBRARY-11, deliberately and in one place.
   *
   * LIBRARY-11 asserted `queryByRole("table")` was **not** in the document and
   * called it "the scope boundary this step is most likely to be eroded at" —
   * correct then, because Phase 3 was to import and refresh a collection and
   * nothing more. DEC-039 moved that boundary: the Library page *is* the
   * browser, so the same query now has to find a table. Inverted rather than
   * deleted, so the change of mind stays visible to whoever reads this next.
   */
  it("lists tracks — DEC-039 made this page the browser", async () => {
    renderScreen();
    await screen.findByTestId("library-track-count");

    expect(await screen.findByRole("table", { name: "Library tracks" })).toBeInTheDocument();
  });
});

describe("the refresh preview (DEC-032)", () => {
  beforeEach(() => {
    bridge.getLibrarySummary.mockResolvedValue(loadedSummary());
    bridge.getJobResults.mockResolvedValue({
      id: "job-preview",
      state: "succeeded",
      result: diff(),
    });
  });

  async function openPreview() {
    renderScreen();
    await userEvent.click(await screen.findByRole("button", { name: /Check for changes/i }));
    return screen.findByRole("dialog");
  }

  it("shows the counts a user is being asked to confirm", async () => {
    const dialog = await openPreview();

    expect(within(dialog).getByTestId("count-added")).toHaveTextContent("3");
    expect(within(dialog).getByTestId("count-changed")).toHaveTextContent("10");
    expect(within(dialog).getByTestId("count-removed")).toHaveTextContent("2");
  });

  it("puts the removals in front of the user, and names what goes with them", async () => {
    const dialog = await openPreview();

    const alert = within(dialog).getAllByRole("alert")[0]!;
    expect(alert).toHaveTextContent(/2 tracks/);
    expect(alert).toHaveTextContent(/cannot be undone/i);
    expect(within(dialog).getByText("Gone Track")).toBeInTheDocument();
    // And the number is on the button being pressed, not only in the paragraph.
    expect(
      within(dialog).getByRole("button", { name: /Remove 2 tracks and refresh/i }),
    ).toBeInTheDocument();
  });

  it("applies nothing until it is confirmed", async () => {
    await openPreview();

    expect(bridge.startLibraryRefreshApply).not.toHaveBeenCalled();
  });

  it("applies the previewed diff by its id when confirmed", async () => {
    const dialog = await openPreview();
    bridge.getJobResults.mockResolvedValue({
      id: "job-apply",
      state: "succeeded",
      result: APPLIED,
    });

    await userEvent.click(
      within(dialog).getByRole("button", { name: /Remove 2 tracks and refresh/i }),
    );

    await waitFor(() =>
      expect(bridge.startLibraryRefreshApply).toHaveBeenCalledWith({
        diff_id: "diff-1",
        confirm_references: false,
      }),
    );
    expect(await screen.findByText(/3,881 tracks in your library/)).toBeInTheDocument();
  });

  it("changes nothing when the preview is cancelled", async () => {
    // The acceptance criterion, stated as a test.
    const dialog = await openPreview();

    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(bridge.startLibraryRefreshApply).not.toHaveBeenCalled();
  });

  it("changes nothing when the preview is dismissed with Escape", async () => {
    // SHELL-10 gave every dialog Escape; here it has to mean "no" rather than
    // "yes, quietly".
    await openPreview();

    await userEvent.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(bridge.startLibraryRefreshApply).not.toHaveBeenCalled();
  });

  it("says so plainly when there is nothing to do", async () => {
    bridge.getJobResults.mockResolvedValue({
      id: "job-preview",
      state: "succeeded",
      result: diff({
        is_empty: true,
        tracks: {
          added: category(),
          changed: category(),
          removed: category(),
          relinked: category(),
          notable_changed_count: 0,
        },
        playlists: { added: category(), changed: category(), removed: category() },
      }),
    });
    const dialog = await openPreview();

    expect(within(dialog).getByText(/already matches this export/i)).toBeInTheDocument();
    // Nothing to confirm, so there is no confirm button to press by mistake.
    expect(
      within(dialog).queryByRole("button", { name: /refresh|Apply/i }),
    ).not.toBeInTheDocument();
  });

  it("explains a preview that failed rather than opening an empty dialog", async () => {
    bridge.getJob.mockResolvedValue({
      id: "job-preview",
      state: "failed",
      error: { code: "LIBRARY_NOT_IMPORTED" },
    });
    renderScreen();

    await userEvent.click(await screen.findByRole("button", { name: /Check for changes/i }));

    expect(await screen.findByText(/Import a Rekordbox collection first/i)).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("reports a stale diff rather than applying it", async () => {
    const dialog = await openPreview();
    bridge.startLibraryRefreshApply.mockRejectedValue(
      new Error("collection.xml has changed since this preview was computed"),
    );

    await userEvent.click(
      within(dialog).getByRole("button", { name: /Remove 2 tracks and refresh/i }),
    );

    expect(await screen.findByText(/has changed since this preview/i)).toBeInTheDocument();
  });
});

describe("the reference warning (DEC-011)", () => {
  // Zero in every library this build can produce — Collections arrive in Phase
  // 6 — so the path is exercised with a diff that answers non-zero. What is
  // being pinned is that the confirmation exists and gates the apply, so Phase
  // 6 inherits a flow that has been used rather than only written.
  const withReferences = diff({
    references: {
      collection_count: 2,
      set_count: 1,
      referenced_track_count: 2,
      referenced_track_ids: [7, 8],
      has_references: true,
    },
  });

  beforeEach(() => {
    bridge.getLibrarySummary.mockResolvedValue(loadedSummary());
    bridge.getJobResults.mockResolvedValue({
      id: "job-preview",
      state: "succeeded",
      result: withReferences,
    });
  });

  async function openPreview() {
    renderScreen();
    await userEvent.click(await screen.findByRole("button", { name: /Check for changes/i }));
    return screen.findByRole("dialog");
  }

  it("names the Collections and Sets that would change", async () => {
    const dialog = await openPreview();

    expect(within(dialog).getByText(/2 Collections and 1 Set/)).toBeInTheDocument();
  });

  it("will not apply until the extra warning is acknowledged", async () => {
    const dialog = await openPreview();
    const confirm = within(dialog).getByRole("button", {
      name: /Remove 2 tracks and refresh/i,
    });

    expect(confirm).toBeDisabled();
    await userEvent.click(confirm);
    expect(bridge.startLibraryRefreshApply).not.toHaveBeenCalled();
  });

  it("passes the confirmation through once it is given", async () => {
    const dialog = await openPreview();

    await userEvent.click(within(dialog).getByRole("checkbox"));
    await userEvent.click(
      within(dialog).getByRole("button", { name: /Remove 2 tracks and refresh/i }),
    );

    await waitFor(() =>
      expect(bridge.startLibraryRefreshApply).toHaveBeenCalledWith({
        diff_id: "diff-1",
        confirm_references: true,
      }),
    );
  });
});

describe("without an engine", () => {
  it("says so instead of failing silently", async () => {
    delete (window as unknown as { cuepoint?: unknown }).cuepoint;
    renderScreen();

    // No summary to show, and no crash: the browser-lab render is a supported
    // way to work on this page.
    expect(await screen.findByText(/No collection imported yet/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Import a collection/i }));
    expect(await screen.findByText(/needs the desktop app/i)).toBeInTheDocument();
  });
});

describe("the browser (LIBUI-10, DEC-039)", () => {
  beforeEach(() => {
    bridge.getLibrarySummary.mockResolvedValue(loadedSummary());
  });

  it("opens on the whole library, sorted by artist", async () => {
    renderScreen();
    await tableReady();

    expect(lastBrowse()).toMatchObject({ playlistId: null, sort: "artist", dir: "asc" });
    // The nine columns a DJ reads, and not the eight that are theirs to turn
    // on (DEC-042) — a default of "everything" is unreadable at this width.
    const table = screen.getByRole("table", { name: "Library tracks" });
    expect(within(table).getByRole("columnheader", { name: /Title/ })).toBeInTheDocument();
    expect(within(table).queryByRole("columnheader", { name: /Comment/ })).toBeNull();
  });

  it("re-asks the engine when a column header is clicked", async () => {
    renderScreen();
    await tableReady();

    await userEvent.click(within(screen.getByRole("table", { name: "Library tracks" })).getByRole("button", { name: "Title" }));

    await waitFor(() => expect(lastBrowse()).toMatchObject({ sort: "title", dir: "asc" }));
    // Sorting is a new question, not a re-render of the rows in hand.
    expect(bridge.browseLibrary.mock.calls.length).toBeGreaterThan(1);
  });

  it("scopes to a playlist and opens it in the order it was arranged", async () => {
    renderScreen();
    await tableReady();

    const tree = await screen.findByRole("tree", { name: "Playlists" });
    await userEvent.click(within(tree).getByText("Friday"));

    // DEC-044: a set list is an order, so scoping to one changes the sort as
    // well as the scope. Both, or the user sees the right tracks in the wrong
    // order and has no way to know that is what happened.
    await waitFor(() =>
      expect(lastBrowse()).toMatchObject({ playlistId: 10, sort: "playlist_position" }),
    );
  });

  it("goes back to artist order when the scope goes back to the library", async () => {
    renderScreen();
    await tableReady();

    const tree = await screen.findByRole("tree", { name: "Playlists" });
    await userEvent.click(within(tree).getByText("Friday"));
    await waitFor(() => expect(lastBrowse()).toMatchObject({ sort: "playlist_position" }));

    // "All tracks" is the pane's own row rather than the playlist tree's
    // (ORG-09): everything is not something Rekordbox gave you.
    await userEvent.click(screen.getByText(/All tracks/i));

    // Position means nothing outside a playlist; leaving one behind would sort
    // the whole library by a column that is not there.
    await waitFor(() =>
      expect(lastBrowse()).toMatchObject({ playlistId: null, sort: "artist" }),
    );
  });

  it("narrows to what was typed", async () => {
    renderScreen();
    await tableReady();

    await userEvent.type(screen.getByLabelText("Search"), "acid");

    await waitFor(() => expect(lastBrowse()).toMatchObject({ q: "acid" }));
  });
});

describe("nothing to show (LIBUI-10)", () => {
  beforeEach(() => {
    bridge.getLibrarySummary.mockResolvedValue(loadedSummary());
    bridge.browseLibrary.mockImplementation(async (params: Record<string, unknown>) =>
      browseAnswer(params, []),
    );
  });

  /*
   * Three different problems, three different sentences. "No tracks" over a
   * filtered view sends a user looking for a broken import, and "no matches"
   * over an empty playlist sends them looking for a filter they never set.
   */

  it("says the library is empty when nothing is asked of it", async () => {
    renderScreen();

    expect(await screen.findByText("No tracks yet.")).toBeInTheDocument();
  });

  it("says the playlist is empty when one is in scope", async () => {
    renderScreen();
    await screen.findByText("No tracks yet.");

    const tree = await screen.findByRole("tree", { name: "Playlists" });
    await userEvent.click(within(tree).getByText("Friday"));

    expect(await screen.findByText("This playlist is empty.")).toBeInTheDocument();
  });

  it("blames the search, not the playlist, when both are in play", async () => {
    // The case that tells the two answers apart. Scoped *and* searching, the
    // honest sentence is about the search: the playlist may well have tracks,
    // and "this playlist is empty" would send a user to look at the wrong
    // thing. Without this the two branches could be in either order.
    renderScreen();
    await screen.findByText("No tracks yet.");

    const tree = await screen.findByRole("tree", { name: "Playlists" });
    await userEvent.click(within(tree).getByText("Friday"));
    await screen.findByText("This playlist is empty.");

    await userEvent.type(await screen.findByLabelText("Search"), "zz");

    expect(await screen.findByText("No tracks match this search.")).toBeInTheDocument();
    expect(screen.queryByText("This playlist is empty.")).toBeNull();
  });

  it("says nothing matched when there is a search to blame", async () => {
    renderScreen();
    await screen.findByText("No tracks yet.");

    await userEvent.type(await screen.findByLabelText("Search"), "zz");

    expect(await screen.findByText("No tracks match this search.")).toBeInTheDocument();
  });
});

describe("selecting (LIBUI-10, DEC-045)", () => {
  beforeEach(() => {
    bridge.getLibrarySummary.mockResolvedValue(loadedSummary());
  });

  it("selects a row when it is clicked", async () => {
    renderScreen();
    await tableReady();

    await userEvent.click(screen.getByText("Track 2"));

    expect(await screen.findByText("1 track selected")).toBeInTheDocument();
  });

  it("selects everything matching on Ctrl+A, and lets go on Escape", async () => {
    renderScreen();
    await tableReady();

    await userEvent.keyboard("{Control>}a{/Control}");

    // "Everything matching" is a description of the query, not a list — the
    // count comes from the total, which is why it can be said at all.
    expect(await screen.findByText(/3 tracks selected/)).toBeInTheDocument();

    await userEvent.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByText(/tracks selected/)).toBeNull());
  });

  it("leaves Ctrl+A to the text box while a search is being typed", async () => {
    renderScreen();
    await tableReady();

    const search = screen.getByLabelText("Search");
    search.focus();
    await userEvent.keyboard("{Control>}a{/Control}");

    // Select-all inside a search box means the text, not the library.
    expect(screen.queryByText(/tracks selected/)).toBeNull();
  });

  it("puts the focus in the search box on Ctrl+F", async () => {
    renderScreen();
    await tableReady();

    await userEvent.keyboard("{Control>}f{/Control}");

    expect(screen.getByLabelText("Search")).toHaveFocus();
  });

  it("leaves Escape to the dialog on top of it", async () => {
    bridge.getJobResults.mockResolvedValue({
      id: "job-preview",
      state: "succeeded",
      result: diff(),
    });
    renderScreen();
    await tableReady();

    await userEvent.click(screen.getByText("Track 2"));
    await screen.findByText("1 track selected");

    await userEvent.click(screen.getByRole("button", { name: /Check for changes/i }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(dialog, "{Escape}");

    // The dialog closes and the selection stays: one press, one thing. A page
    // that clears regardless would take the selection away as a side effect of
    // declining a refresh.
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByText("1 track selected")).toBeInTheDocument();
  });

  it("forgets the selection when the question changes", async () => {
    renderScreen();
    await tableReady();

    await userEvent.click(screen.getByText("Track 2"));
    await screen.findByText("1 track selected");

    await userEvent.click(within(screen.getByRole("table", { name: "Library tracks" })).getByRole("button", { name: "Title" }));

    // What was selected under the old sort is not a subset of the new one.
    await waitFor(() => expect(screen.queryByText(/track selected/)).toBeNull());
  });

  it("plays the row and the view behind it on a double-click (DEC-012)", async () => {
    // DEC-046 left this seam empty through Phase 4 and PLAYER-09 fills it. The
    // queue is the *view*, so what goes over the bridge is the query with no
    // limit — not the three rows the table happens to hold.
    renderScreen();
    await tableReady();

    await userEvent.dblClick(screen.getByText("Track 2"));

    await waitFor(() => expect(bridge.player.playView).toHaveBeenCalledTimes(1));
    const [params, index] = bridge.player.playView.mock.calls[0]!;
    expect(index).toBe(1);
    expect(params).toMatchObject({ sort: "artist", dir: "asc", limit: 0, offset: 0 });
  });

  it("plays the row the view is sorted into, not the row's id", async () => {
    // The queue's order is the view's order, so the index has to be the row's
    // position in *this* question — a table sorted differently plays a
    // different track from the same row.
    renderScreen();
    await tableReady();

    await userEvent.click(
      within(screen.getByRole("table", { name: "Library tracks" })).getByRole("button", {
        name: "Title",
      }),
    );
    await waitFor(() => expect(lastBrowse().sort).toBe("title"));

    await userEvent.dblClick(await screen.findByText("Track 3"));

    await waitFor(() => expect(bridge.player.playView).toHaveBeenCalled());
    const [params, index] = bridge.player.playView.mock.calls.at(-1)!;
    expect(params).toMatchObject({ sort: "title", limit: 0 });
    expect(index).toBe(2);
  });

  it("says so when the player refuses", async () => {
    renderScreen();
    await tableReady();
    bridge.player.playView.mockResolvedValue({ ok: false, error: "The player is not running" });

    await userEvent.dblClick(screen.getByText("Track 2"));

    expect(await screen.findByText("The player is not running")).toBeInTheDocument();
  });
});

describe("the track context menu (PLAYER-09, DEC-013, DEC-045)", () => {
  beforeEach(() => {
    bridge.getLibrarySummary.mockResolvedValue(loadedSummary());
  });

  async function openMenu(text: string) {
    const row = screen.getByText(text).closest("[role=row]")!;
    fireEvent.contextMenu(row, { clientX: 100, clientY: 100 });
    return screen.findByRole("menu");
  }

  /** A shift-range over all three rows: an explicit set of ids, not "all". */
  async function selectAllThree() {
    await userEvent.click(screen.getByText("Track 1"));
    fireEvent.click(screen.getByText("Track 3"), { shiftKey: true });
    await screen.findByText(/3 tracks selected/);
  }

  it("acts on the row under the pointer when nothing is selected", async () => {
    renderScreen();
    await tableReady();

    const menu = await openMenu("Track 2");
    await userEvent.click(within(menu).getByRole("menuitem", { name: "Add to queue" }));

    await waitFor(() => expect(bridge.player.addToQueue).toHaveBeenCalledTimes(1));
    expect(bridge.player.addToQueue.mock.calls[0]![0]).toEqual([
      expect.objectContaining({ trackId: 2, title: "Track 2" }),
    ]);
    expect(await screen.findByText("1 track added to the queue")).toBeInTheDocument();
  });

  it("acts on the whole selection when the clicked row is in it", async () => {
    renderScreen();
    await tableReady();
    await selectAllThree();

    const menu = await openMenu("Track 2");
    await userEvent.click(within(menu).getByRole("menuitem", { name: "Play next" }));

    await waitFor(() => expect(bridge.player.playNext).toHaveBeenCalledTimes(1));
    // In the view's order, which is the order the selection gathers in.
    expect(
      bridge.player.playNext.mock.calls[0]![0].map((item: { trackId: number }) => item.trackId),
    ).toEqual([1, 2, 3]);
    expect(await screen.findByText("3 tracks queued to play next")).toBeInTheDocument();
  });

  it("acts on the clicked row alone when it is outside the selection", async () => {
    // The convention every file manager follows, and the one a user assumes
    // when they right-click somewhere other than what they just selected.
    renderScreen();
    await tableReady();

    await userEvent.click(screen.getByText("Track 1"));
    await screen.findByText("1 track selected");

    const menu = await openMenu("Track 3");
    await userEvent.click(within(menu).getByRole("menuitem", { name: "Add to queue" }));

    await waitFor(() => expect(bridge.player.addToQueue).toHaveBeenCalled());
    expect(bridge.player.addToQueue.mock.calls[0]![0]).toEqual([
      expect.objectContaining({ trackId: 3 }),
    ]);
  });

  it("plays a selection as the queue, and a lone row as the view", async () => {
    renderScreen();
    await tableReady();

    // One row: DEC-012, the view is the queue.
    let menu = await openMenu("Track 2");
    await userEvent.click(within(menu).getByRole("menuitem", { name: "Play" }));
    await waitFor(() => expect(bridge.player.playView).toHaveBeenCalledTimes(1));
    expect(bridge.player.playQueue).not.toHaveBeenCalled();

    // Three rows: the selection is the queue, because that is what was picked.
    await selectAllThree();
    menu = await openMenu("Track 2");
    await userEvent.click(within(menu).getByRole("menuitem", { name: "Play 3 tracks" }));

    await waitFor(() => expect(bridge.player.playQueue).toHaveBeenCalledTimes(1));
    expect(bridge.player.playQueue.mock.calls[0]![1]).toBe(0);
    expect(bridge.player.playView).toHaveBeenCalledTimes(1);
  });

  it("copies what the menu points at, not the selection", async () => {
    // jsdom has no clipboard at all, so one is supplied; without it the copy
    // reports a refusal and the test would prove nothing about what it copied.
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    renderScreen();
    await tableReady();

    await userEvent.click(screen.getByText("Track 1"));
    await screen.findByText("1 track selected");

    const menu = await openMenu("Track 3");
    await userEvent.click(within(menu).getByRole("menuitem", { name: "Copy" }));

    expect(await screen.findByText("Copied 1 track")).toBeInTheDocument();
    // The clicked row, not the selected one.
    expect(writeText.mock.calls[0]![0]).toContain("Track 3");
    expect(writeText.mock.calls[0]![0]).not.toContain("Track 1");
    Reflect.deleteProperty(navigator, "clipboard");
  });

  it("reveals a single row and offers nothing to reveal for many", async () => {
    renderScreen();
    await tableReady();

    let menu = await openMenu("Track 2");
    await userEvent.click(within(menu).getByRole("menuitem", { name: "Show in folder" }));
    expect(bridge.showItemInFolder).toHaveBeenCalledWith(track(2).file_path);

    await selectAllThree();
    menu = await openMenu("Track 2");
    expect(within(menu).getByRole("menuitem", { name: "Show in folder" })).toBeDisabled();
  });

  it("closes on Escape without letting go of the selection", async () => {
    // Escape belongs to whatever is on top. The page clears the selection on
    // Escape, and a menu that let it through would take the selection with it
    // every time one was dismissed.
    renderScreen();
    await tableReady();
    await selectAllThree();

    const menu = await openMenu("Track 2");
    await userEvent.type(menu, "{Escape}");

    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    expect(screen.getByText(/3 tracks selected/)).toBeInTheDocument();
    expect(bridge.player.playQueue).not.toHaveBeenCalled();
  });

  it("opens from the keyboard on the last row clicked", async () => {
    renderScreen();
    await tableReady();

    await userEvent.click(screen.getByText("Track 2"));
    await screen.findByText("1 track selected");

    fireEvent.keyDown(screen.getByRole("table", { name: "Library tracks" }), {
      key: "F10",
      shiftKey: true,
    });

    const menu = await screen.findByRole("menu");
    await userEvent.click(within(menu).getByRole("menuitem", { name: "Play next" }));

    await waitFor(() => expect(bridge.player.playNext).toHaveBeenCalled());
    expect(bridge.player.playNext.mock.calls[0]![0]).toEqual([
      expect.objectContaining({ trackId: 2 }),
    ]);
  });

  it("acts on a select-all-matching selection too", async () => {
    // Ctrl+A is stored as "everything except these", not as a list of ids, so
    // the menu reads the selection through a different branch entirely.
    renderScreen();
    await tableReady();

    await userEvent.keyboard("{Control>}a{/Control}");
    await screen.findByText(/3 tracks selected/);

    const menu = await openMenu("Track 2");
    await userEvent.click(within(menu).getByRole("menuitem", { name: "Add to queue" }));

    await waitFor(() => expect(bridge.player.addToQueue).toHaveBeenCalled());
    expect(
      bridge.player.addToQueue.mock.calls[0]![0].map((item: { trackId: number }) => item.trackId),
    ).toEqual([1, 2, 3]);
  });

  it("plays the selected row on Enter, without a mouse", async () => {
    renderScreen();
    await tableReady();

    await userEvent.click(screen.getByText("Track 2"));
    await screen.findByText("1 track selected");

    fireEvent.keyDown(screen.getByRole("table", { name: "Library tracks" }), { key: "Enter" });

    await waitFor(() => expect(bridge.player.playView).toHaveBeenCalledTimes(1));
    expect(bridge.player.playView.mock.calls[0]![1]).toBe(1);
  });

  it("shows one menu at a time", async () => {
    renderScreen();
    await tableReady();

    await openMenu("Track 1");
    await openMenu("Track 3");

    expect(screen.getAllByRole("menu")).toHaveLength(1);
  });
});

describe("the Inspector (LIBUI-10, DEC-024, DEC-047)", () => {
  function renderWithInspector() {
    function Slot() {
      return <section aria-label="Inspector">{useInspectorContent()}</section>;
    }
    return render(
      <ScaleProvider>
        <ToastProvider>
          <InspectorSlotProvider>
            <LibraryScreen />
            <Slot />
          </InspectorSlotProvider>
        </ToastProvider>
      </ScaleProvider>,
    );
  }

  beforeEach(() => {
    bridge.getLibrarySummary.mockResolvedValue(loadedSummary());
  });

  it("fills the shell's Inspector with whatever is selected", async () => {
    renderWithInspector();
    await tableReady();

    await userEvent.click(screen.getByText("Track 1"));

    const inspector = await screen.findByRole("region", { name: "Inspector" });
    await waitFor(() => expect(bridge.getLibraryTrack).toHaveBeenCalledWith({ trackId: 1 }));
    expect(await within(inspector).findByText("Track 1")).toBeInTheDocument();
    // Still read-only where DEC-047 said so (ORG-10): the imported fields
    // offer nothing to type into. The zone above them is CuePoint's own and is
    // editable, which is why this names the zone rather than the panel.
    const imported = inspector.querySelector(".cp-track-detail__fields") as HTMLElement;
    expect(within(imported).queryByRole("textbox")).toBeNull();
    expect(within(imported).queryByRole("spinbutton")).toBeNull();
    // "Show in folder" is the one control in there, and it reads a field
    // rather than writing one.
    expect(
      within(imported)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["Show in folder"]);
  });

  it("opens a Collection the track is in, from the Inspector (ORG-10)", async () => {
    // The detail read names a Collection by id, kind and name; the node the
    // scope needs — with its saved sort — lives in the tree, so the page looks
    // it up rather than rebuilding one from three fields.
    bridge.getLibraryTrack.mockResolvedValue({
      ...DETAIL,
      collections: [{ id: 12, name: "Warmups", kind: "collection" }],
    });
    renderWithInspector();
    await tableReady();
    await userEvent.click(screen.getByText("Track 1"));
    const inspector = await screen.findByRole("region", { name: "Inspector" });
    await within(inspector).findByText("Warmups");

    await userEvent.click(within(inspector).getByRole("button", { name: /Warmups/ }));

    await waitFor(() =>
      expect(bridge.browseLibrary).toHaveBeenCalledWith(
        expect.objectContaining({ scope: "collection", collectionId: 12 }),
      ),
    );
  });

  it("says so when the engine refuses an edit made in the Inspector (ORG-10)", async () => {
    // The panel is optimistic, so a refusal that went nowhere would leave a
    // rating on screen that the library does not have.
    bridge.setTrackMetadata.mockRejectedValue(new Error("No track with id 1"));
    renderWithInspector();
    await tableReady();
    await userEvent.click(screen.getByText("Track 1"));
    const inspector = await screen.findByRole("region", { name: "Inspector" });
    await within(inspector).findByText("Track 1");

    await userEvent.click(within(inspector).getByRole("radio", { name: "4 stars" }));

    expect(await screen.findByText("No track with id 1")).toBeInTheDocument();
    expect(
      within(inspector).getByRole("radio", { name: "4 stars" }),
    ).toHaveAttribute("aria-checked", "false");
  });

  it("takes its content away when the page unmounts", async () => {
    const view = renderWithInspector();
    await tableReady();
    await userEvent.click(screen.getByText("Track 1"));
    const inspector = await screen.findByRole("region", { name: "Inspector" });
    await within(inspector).findByText("Track 1");

    view.rerender(
      <ScaleProvider>
        <ToastProvider>
          <InspectorSlotProvider>
            <section aria-label="Inspector" />
          </InspectorSlotProvider>
        </ToastProvider>
      </ScaleProvider>,
    );

    // Otherwise the Inspector keeps describing a track from a screen the user
    // has left.
    expect(screen.queryByText("Track 1")).toBeNull();
  });
});

describe("after a refresh (LIBUI-10)", () => {
  it("asks the library again rather than showing what it held", async () => {
    bridge.getLibrarySummary.mockResolvedValue(loadedSummary());
    bridge.getJobResults.mockImplementation(async (jobId: string) =>
      jobId === "job-preview"
        ? { id: jobId, state: "succeeded", result: diff() }
        : { id: jobId, state: "succeeded", result: APPLIED },
    );
    renderScreen();
    await tableReady();

    const browsesBefore = bridge.browseLibrary.mock.calls.length;
    const treesBefore = bridge.getLibraryPlaylists.mock.calls.length;

    await userEvent.click(screen.getByRole("button", { name: /Check for changes/i }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: /Remove 2 tracks and refresh/i }));

    // A refresh replaces the tree row for row and the rows behind the table
    // belong to a different library now; keeping either would show tracks that
    // no longer exist.
    await waitFor(() =>
      expect(bridge.getLibraryPlaylists.mock.calls.length).toBeGreaterThan(treesBefore),
    );
    expect(bridge.browseLibrary.mock.calls.length).toBeGreaterThan(browsesBefore);
  });
});

describe("CuePoint's own Collections in the pane (ORG-09, DEC-062)", () => {
  beforeEach(() => {
    bridge.getLibrarySummary.mockResolvedValue(loadedSummary());
  });

  it("draws both sections in one pane", async () => {
    renderScreen();
    await tableReady();

    expect(await screen.findByRole("tree", { name: "Collections" })).toBeInTheDocument();
    expect(await screen.findByRole("tree", { name: "Playlists" })).toBeInTheDocument();
    // Everything belongs to neither of them, so it has a row of its own.
    expect(screen.getByRole("tree", { name: "Everything" })).toBeInTheDocument();
  });

  it("scopes the table to a Collection, in the order it was arranged", async () => {
    renderScreen();
    await tableReady();

    // From a playlist, so the assertion below says the playlist scope was
    // *cleared* rather than that it happened to start empty.
    const playlists = await screen.findByRole("tree", { name: "Playlists" });
    await userEvent.click(within(playlists).getByText("Friday"));
    await waitFor(() => expect(lastBrowse()).toMatchObject({ playlistId: 10 }));

    const tree = await screen.findByRole("tree", { name: "Collections" });
    await userEvent.click(within(tree).getByRole("button", { name: "Expand Sets" }));
    await userEvent.click(within(tree).getByText("Warmups"));

    // ORG-09: inside a Collection the default sort is the Collection's own
    // order, which is what the user arranged and not what the alphabet says.
    await waitFor(() =>
      expect(lastBrowse()).toMatchObject({
        scope: "collection",
        collectionId: 12,
        sort: "collection_position",
        playlistId: null,
      }),
    );
  });

  it("scopes to a Smart Collection with the sort it was saved with", async () => {
    renderScreen();
    await tableReady();

    const tree = await screen.findByRole("tree", { name: "Collections" });
    await userEvent.click(within(tree).getByText("Recent techno"));

    await waitFor(() =>
      expect(lastBrowse()).toMatchObject({
        scope: "smart",
        collectionId: 13,
        sort: "date_added",
        dir: "desc",
      }),
    );
  });

  it("asks once for a scope, not once per section", async () => {
    renderScreen();
    await tableReady();
    const before = bridge.browseLibrary.mock.calls.length;

    const tree = await screen.findByRole("tree", { name: "Collections" });
    await userEvent.click(within(tree).getByText("Recent techno"));
    await waitFor(() => expect(lastBrowse()).toMatchObject({ scope: "smart" }));

    // One question, one window: the count and the rows come from the same
    // request the table pages (DEC-040), so a scope change is not a burst.
    expect(bridge.browseLibrary.mock.calls.length - before).toBeLessThanOrEqual(2);
  });

  it("selecting a playlist clears the Collection scope", async () => {
    renderScreen();
    await tableReady();

    const collections = await screen.findByRole("tree", { name: "Collections" });
    await userEvent.click(within(collections).getByText("Recent techno"));
    await waitFor(() => expect(lastBrowse()).toMatchObject({ scope: "smart" }));

    const playlists = await screen.findByRole("tree", { name: "Playlists" });
    await userEvent.click(within(playlists).getByText("Friday"));

    // One scope at a time in the pane: the engine would AND the two, and a
    // Collection still highlighted beside a playlist would be a lie about
    // what the table is showing.
    await waitFor(() =>
      expect(lastBrowse()).toMatchObject({
        scope: undefined,
        collectionId: null,
        playlistId: 10,
      }),
    );
  });

  it("selecting a folder moves the highlight and leaves the table alone", async () => {
    renderScreen();
    await tableReady();
    const before = lastBrowse();

    const tree = await screen.findByRole("tree", { name: "Collections" });
    await userEvent.click(within(tree).getByText("Sets"));

    // A folder holds nodes, not tracks and not a question. Scoping to one
    // would show an empty table for a thing that is not empty.
    expect(lastBrowse()).toEqual(before);
  });

  it("says a Collection is empty differently from a search that found nothing", async () => {
    install({
      browseLibrary: vi.fn(async (params: Record<string, unknown>) =>
        browseAnswer(params, []),
      ),
      getLibrarySummary: vi.fn().mockResolvedValue(loadedSummary()),
    });
    renderScreen();
    await screen.findByRole("table", { name: "Library tracks" });

    const tree = await screen.findByRole("tree", { name: "Collections" });
    await userEvent.click(within(tree).getByRole("button", { name: "Expand Sets" }));
    await userEvent.click(within(tree).getByText("Warmups"));

    expect(await screen.findByText(/This Collection is empty/i)).toBeInTheDocument();
  });
});


/**
 * Acting on a selection (ORG-11, DEC-045, DEC-063).
 *
 * The property this whole step turns on: **a selection of everything matching
 * never becomes a list of ids**. The renderer sends the question and the
 * handful of tracks taken back out of it, and the assertions below say so by
 * looking at what crossed the bridge rather than at what happened afterwards.
 */
describe("organizing a selection (ORG-11)", () => {
  beforeEach(() => {
    bridge.getLibrarySummary.mockResolvedValue(loadedSummary());
  });

  async function openMenuOn(text: string) {
    const row = screen.getByText(text).closest("[role=row]")!;
    fireEvent.contextMenu(row, { clientX: 100, clientY: 100 });
    return screen.findByRole("menu");
  }

  async function openCollection() {
    const tree = await screen.findByRole("tree", { name: "Collections" });
    await userEvent.click(within(tree).getByRole("button", { name: "Expand Sets" }));
    await userEvent.click(within(tree).getByText("Warmups"));
    await waitFor(() => expect(lastBrowse()).toMatchObject({ collectionId: 12 }));
  }

  /** The payload of the one batch that was asked for. */
  function lastBatch(): Record<string, unknown> {
    const calls = bridge.applyBatch.mock.calls;
    return calls[calls.length - 1][0] as Record<string, unknown>;
  }

  describe("what the menu offers", () => {
    it("offers every organization operation below the playback ones", async () => {
      renderScreen();
      await tableReady();

      const menu = await openMenuOn("Track 2");

      const labels = within(menu)
        .getAllByRole("menuitem")
        .map((node) => node.textContent);
      // Playback first: DEC-013 made it the first-class gesture.
      expect(labels.slice(0, 3)).toEqual(["Play", "Play next", "Add to queue"]);
      expect(labels).toContain("Add to Collection…");
      expect(labels).toContain("Add tag…");
      expect(labels).toContain("Favorite");
    });

    it("offers removing from a Collection only inside one", async () => {
      renderScreen();
      await tableReady();

      const outside = await openMenuOn("Track 2");
      expect(
        within(outside).queryByRole("menuitem", { name: /Remove from/ }),
      ).not.toBeInTheDocument();
      await userEvent.keyboard("{Escape}");

      await openCollection();
      const inside = await openMenuOn("Track 2");
      expect(
        within(inside).getByRole("menuitem", { name: "Remove from “Warmups”" }),
      ).toBeInTheDocument();
    });

    it("offers no membership operations inside a Smart Collection (DEC-061)", async () => {
      // ORG-06 refuses them; a menu entry whose only outcome is an error is
      // not an offer.
      renderScreen();
      await tableReady();
      const tree = await screen.findByRole("tree", { name: "Collections" });
      await userEvent.click(within(tree).getByText("Recent techno"));
      await waitFor(() => expect(lastBrowse()).toMatchObject({ scope: "smart" }));

      const menu = await openMenuOn("Track 2");

      expect(
        within(menu).queryByRole("menuitem", { name: /Remove from/ }),
      ).not.toBeInTheDocument();
    });
  });

  describe("the payload that crosses the bridge", () => {
    it("sends the ids when the user picked tracks", async () => {
      renderScreen();
      await tableReady();
      await userEvent.click(screen.getByText("Track 1"));
      fireEvent.click(screen.getByText("Track 3"), { shiftKey: true });
      await screen.findByText(/3 tracks selected/);

      const menu = await openMenuOn("Track 2");
      await userEvent.click(within(menu).getByRole("menuitem", { name: "Favorite" }));

      await waitFor(() => expect(bridge.applyBatch).toHaveBeenCalled());
      expect(lastBatch()).toEqual({
        selection: { track_ids: [1, 2, 3] },
        operation: { kind: "set_favorite", value: true },
      });
    });

    it("sends the question when the selection is everything matching", async () => {
      renderScreen();
      await tableReady();
      await userEvent.keyboard("{Control>}a{/Control}");
      await screen.findByText(/everything matching/);

      const menu = await openMenuOn("Track 2");
      await userEvent.click(within(menu).getByRole("menuitem", { name: "Favorite" }));

      await waitFor(() => expect(bridge.applyBatch).toHaveBeenCalled());
      const payload = lastBatch().selection as Record<string, unknown>;
      expect(payload.track_ids).toBeUndefined();
      expect(payload.query).toMatchObject({ playlist_id: null, collection_id: null });
    });

    it("sends the tracks taken back out of everything matching", async () => {
      // The toolbar says "2 tracks selected"; the batch has to mean two.
      renderScreen();
      await tableReady();
      await userEvent.keyboard("{Control>}a{/Control}");
      await screen.findByText(/everything matching/);
      fireEvent.click(screen.getByText("Track 3"), { ctrlKey: true });
      await screen.findByText(/2 tracks selected/);

      const menu = await openMenuOn("Track 2");
      await userEvent.click(within(menu).getByRole("menuitem", { name: "Favorite" }));

      await waitFor(() => expect(bridge.applyBatch).toHaveBeenCalled());
      expect((lastBatch().selection as Record<string, unknown>).exclude_track_ids).toEqual([3]);
    });

    it("acts on the row under the pointer when it is outside the selection", async () => {
      renderScreen();
      await tableReady();
      await userEvent.click(screen.getByText("Track 1"));
      await screen.findByText("1 track selected");

      const menu = await openMenuOn("Track 3");
      await userEvent.click(within(menu).getByRole("menuitem", { name: "Favorite" }));

      await waitFor(() => expect(bridge.applyBatch).toHaveBeenCalled());
      expect(lastBatch().selection).toEqual({ track_ids: [3] });
    });

    it("carries the Collection scope into the batch's query", async () => {
      renderScreen();
      await tableReady();
      await openCollection();
      await userEvent.keyboard("{Control>}a{/Control}");
      await screen.findByText(/everything matching/);

      const menu = await openMenuOn("Track 2");
      await userEvent.click(within(menu).getByRole("menuitem", { name: "Favorite" }));

      await waitFor(() => expect(bridge.applyBatch).toHaveBeenCalled());
      expect((lastBatch().selection as Record<string, unknown>).query).toMatchObject({
        scope: "collection",
        collection_id: 12,
      });
    });
  });

  describe("the operations themselves", () => {
    it("rates from the submenu", async () => {
      renderScreen();
      await tableReady();

      const menu = await openMenuOn("Track 2");
      await userEvent.click(within(menu).getByRole("menuitem", { name: /Rate/ }));
      await userEvent.click(screen.getByRole("menuitem", { name: "★★★★" }));

      await waitFor(() => expect(bridge.applyBatch).toHaveBeenCalled());
      expect(lastBatch().operation).toEqual({ kind: "set_rating", value: 4 });
    });

    it("clears a rating rather than setting it to zero (DEC-057)", async () => {
      renderScreen();
      await tableReady();

      const menu = await openMenuOn("Track 2");
      await userEvent.click(within(menu).getByRole("menuitem", { name: /Rate/ }));
      await userEvent.click(screen.getByRole("menuitem", { name: "Clear rating" }));

      await waitFor(() => expect(bridge.applyBatch).toHaveBeenCalled());
      expect(lastBatch().operation).toEqual({ kind: "set_rating", value: null });
    });

    it("removes from the Collection the table is showing", async () => {
      renderScreen();
      await tableReady();
      await openCollection();

      const menu = await openMenuOn("Track 2");
      await userEvent.click(
        within(menu).getByRole("menuitem", { name: "Remove from “Warmups”" }),
      );

      await waitFor(() => expect(bridge.applyBatch).toHaveBeenCalled());
      expect(lastBatch().operation).toEqual({
        kind: "remove_from_collection",
        value: 12,
      });
    });

    it("adds to a Collection chosen from the picker", async () => {
      renderScreen();
      await tableReady();

      const menu = await openMenuOn("Track 2");
      await userEvent.click(
        within(menu).getByRole("menuitem", { name: "Add to Collection…" }),
      );
      await userEvent.click(await screen.findByRole("option", { name: /Warmups/ }));

      await waitFor(() => expect(bridge.applyBatch).toHaveBeenCalled());
      expect(lastBatch().operation).toEqual({ kind: "add_to_collection", value: 12 });
    });

    it("will not add tracks to a folder or a Smart Collection", async () => {
      renderScreen();
      await tableReady();

      const menu = await openMenuOn("Track 2");
      await userEvent.click(
        within(menu).getByRole("menuitem", { name: "Add to Collection…" }),
      );

      expect(await screen.findByRole("option", { name: /Sets/ })).toBeDisabled();
      expect(screen.getByRole("option", { name: /Recent techno/ })).toBeDisabled();
    });

    it("tags with an existing tag", async () => {
      renderScreen();
      await tableReady();

      const menu = await openMenuOn("Track 2");
      await userEvent.click(within(menu).getByRole("menuitem", { name: "Add tag…" }));
      await userEvent.click(await screen.findByRole("option", { name: /Peak-time/ }));

      await waitFor(() => expect(bridge.applyBatch).toHaveBeenCalled());
      expect(lastBatch().operation).toEqual({ kind: "add_tag", value: 21 });
    });

    it("makes a tag by typing a name, and tags with the one it got back", async () => {
      // `create_or_get`: a name that already exists in another capitalization
      // comes back as the tag that exists, and that decision stays in the
      // engine where the unique index enforces it.
      renderScreen();
      await tableReady();

      const menu = await openMenuOn("Track 2");
      await userEvent.click(within(menu).getByRole("menuitem", { name: "Add tag…" }));
      const filter = await screen.findByRole("textbox", { name: "Type to narrow the list" });
      fireEvent.change(filter, { target: { value: "Closer" } });
      await userEvent.click(screen.getByRole("button", { name: /Create “Closer”/ }));

      await waitFor(() => expect(bridge.createTag).toHaveBeenCalledWith({ name: "Closer" }));
      await waitFor(() => expect(bridge.applyBatch).toHaveBeenCalled());
      expect(lastBatch().operation).toEqual({ kind: "add_tag", value: 22 });
    });

    it("says what happened, in the counts the engine answered with", async () => {
      bridge.applyBatch.mockResolvedValue({
        applied: {
          batch_id: "b1",
          operation: "add_tag",
          target: "Peak-time",
          total: 52,
          changed: 40,
          unchanged: 12,
          failed: 0,
          cancelled: false,
        },
      });
      renderScreen();
      await tableReady();

      const menu = await openMenuOn("Track 2");
      await userEvent.click(within(menu).getByRole("menuitem", { name: "Add tag…" }));
      await userEvent.click(await screen.findByRole("option", { name: /Peak-time/ }));

      expect(await screen.findByText(/40 tracks .* 12 already had it/)).toBeInTheDocument();
    });

    it("says so when the engine refuses", async () => {
      bridge.applyBatch.mockRejectedValue(new Error("No tag with id 21"));
      renderScreen();
      await tableReady();

      const menu = await openMenuOn("Track 2");
      await userEvent.click(within(menu).getByRole("menuitem", { name: "Favorite" }));

      expect(await screen.findByText("No tag with id 21")).toBeInTheDocument();
    });

    it("re-reads the table and the tree afterwards", async () => {
      // The DoD: the table and the pane agree about what happened without a
      // manual refresh.
      renderScreen();
      await tableReady();
      const browses = bridge.browseLibrary.mock.calls.length;
      const trees = bridge.getCollections.mock.calls.length;

      const menu = await openMenuOn("Track 2");
      await userEvent.click(within(menu).getByRole("menuitem", { name: "Favorite" }));

      await waitFor(() =>
        expect(bridge.browseLibrary.mock.calls.length).toBeGreaterThan(browses),
      );
      expect(bridge.getCollections.mock.calls.length).toBeGreaterThan(trees);
    });
  });

  describe("a batch big enough to be a job", () => {
    beforeEach(() => {
      bridge.getLibrarySummary.mockResolvedValue(loadedSummary());
      bridge.browseLibrary.mockImplementation(async (params: Record<string, unknown>) => ({
        ...browseAnswer(params, TRACKS),
        total: 47_913,
      }));
    });

    it("asks before it starts, naming the count and the operation", async () => {
      renderScreen();
      await tableReady();
      await userEvent.keyboard("{Control>}a{/Control}");
      await screen.findByText(/everything matching/);

      const menu = await openMenuOn("Track 2");
      await userEvent.click(within(menu).getByRole("menuitem", { name: "Favorite" }));

      expect(await screen.findByText("Favorite 47,913 tracks?")).toBeInTheDocument();
      expect(bridge.applyBatch).not.toHaveBeenCalled();
    });

    it("says there is no undo, because there is not (DEC-008)", async () => {
      renderScreen();
      await tableReady();
      await userEvent.keyboard("{Control>}a{/Control}");
      await screen.findByText(/everything matching/);
      const menu = await openMenuOn("Track 2");
      await userEvent.click(within(menu).getByRole("menuitem", { name: "Favorite" }));

      expect(await screen.findByText(/no undo/i)).toBeInTheDocument();
    });

    it("does it once it is confirmed", async () => {
      renderScreen();
      await tableReady();
      await userEvent.keyboard("{Control>}a{/Control}");
      await screen.findByText(/everything matching/);
      const menu = await openMenuOn("Track 2");
      await userEvent.click(within(menu).getByRole("menuitem", { name: "Favorite" }));
      await screen.findByText("Favorite 47,913 tracks?");

      await userEvent.click(screen.getByRole("button", { name: "Apply" }));

      await waitFor(() => expect(bridge.applyBatch).toHaveBeenCalled());
    });

    it("does nothing when it is refused", async () => {
      renderScreen();
      await tableReady();
      await userEvent.keyboard("{Control>}a{/Control}");
      await screen.findByText(/everything matching/);
      const menu = await openMenuOn("Track 2");
      await userEvent.click(within(menu).getByRole("menuitem", { name: "Favorite" }));
      await screen.findByText("Favorite 47,913 tracks?");

      await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

      expect(bridge.applyBatch).not.toHaveBeenCalled();
      expect(screen.queryByText("Favorite 47,913 tracks?")).not.toBeInTheDocument();
    });
  });

  describe("the toolbar", () => {
    it("offers the same operations as the menu, for the selection", async () => {
      renderScreen();
      await tableReady();
      await userEvent.click(screen.getByText("Track 1"));
      await screen.findByText("1 track selected");

      await userEvent.click(screen.getByRole("button", { name: "Actions…" }));
      const menu = await screen.findByRole("menu");

      const labels = within(menu)
        .getAllByRole("menuitem")
        .map((node) => node.textContent);
      expect(labels).toEqual([
        "Add to Collection…",
        "Add tag…",
        "Remove tag…",
        "Rate▸",
        "Favorite",
        "Remove favorite",
      ]);
      // Two dividers, between the three groups — not three, which would draw
      // a line along the top of a menu with nothing above it.
      expect(within(menu).getAllByRole("separator")).toHaveLength(2);
    });

    it("acts on the selection, not on a row", async () => {
      renderScreen();
      await tableReady();
      await userEvent.click(screen.getByText("Track 1"));
      fireEvent.click(screen.getByText("Track 3"), { shiftKey: true });
      await screen.findByText(/3 tracks selected/);

      await userEvent.click(screen.getByRole("button", { name: "Actions…" }));
      const menu = await screen.findByRole("menu");
      await userEvent.click(within(menu).getByRole("menuitem", { name: "Favorite" }));

      await waitFor(() => expect(bridge.applyBatch).toHaveBeenCalled());
      expect(lastBatch().selection).toEqual({ track_ids: [1, 2, 3] });
    });
  });
});

/**
 * Dragging rows (ORG-11).
 *
 * The table becomes the source ORG-09 built its drop target for, and the two
 * halves are finally exercised together.
 */
describe("dragging rows out of the table (ORG-11)", () => {
  beforeEach(() => {
    bridge.getLibrarySummary.mockResolvedValue(loadedSummary());
  });

  /** A DataTransfer that remembers what was put on it, as the real one does. */
  function transfer(initial: Record<string, string> = {}) {
    const data: Record<string, string> = { ...initial };
    return {
      dropEffect: "none",
      effectAllowed: "none",
      get types() {
        return Object.keys(data);
      },
      getData: (format: string) => data[format] ?? "",
      setData: (format: string, value: string) => {
        data[format] = value;
      },
    } as unknown as DataTransfer;
  }

  function rowFor(text: string): HTMLElement {
    return screen.getByText(text).closest("[role=row]") as HTMLElement;
  }

  it("carries the row it started on when nothing is selected", async () => {
    renderScreen();
    await tableReady();

    const dataTransfer = transfer();
    fireEvent.dragStart(rowFor("Track 2"), { dataTransfer });

    expect(dataTransfer.getData("application/x-cuepoint-track-ids")).toBe("[2]");
  });

  it("carries the whole selection when the row belongs to it", async () => {
    renderScreen();
    await tableReady();
    await userEvent.click(screen.getByText("Track 1"));
    fireEvent.click(screen.getByText("Track 3"), { shiftKey: true });
    await screen.findByText(/3 tracks selected/);

    const dataTransfer = transfer();
    fireEvent.dragStart(rowFor("Track 2"), { dataTransfer });

    expect(dataTransfer.getData("application/x-cuepoint-track-ids")).toBe("[1,2,3]");
  });

  it("carries only the row it started on when that row is outside the selection", async () => {
    // The same rule the context menu follows: right-clicking — or dragging —
    // outside a selection acts on what is under the pointer.
    renderScreen();
    await tableReady();
    await userEvent.click(screen.getByText("Track 1"));
    fireEvent.click(screen.getByText("Track 2"), { ctrlKey: true });
    await screen.findByText(/2 tracks selected/);

    const dataTransfer = transfer();
    fireEvent.dragStart(rowFor("Track 3"), { dataTransfer });

    expect(dataTransfer.getData("application/x-cuepoint-track-ids")).toBe("[3]");
  });

  it("carries a described selection as a question, never as ids (DEC-045)", async () => {
    renderScreen();
    await tableReady();
    await userEvent.keyboard("{Control>}a{/Control}");
    await screen.findByText(/everything matching/);

    const dataTransfer = transfer();
    fireEvent.dragStart(rowFor("Track 2"), { dataTransfer });

    expect(dataTransfer.getData("application/x-cuepoint-track-ids")).toBe("");
    expect(dataTransfer.getData("application/x-cuepoint-selection-query")).toBe("3");
  });

  it("adds the dropped tracks to the Collection they landed on", async () => {
    renderScreen();
    await tableReady();
    const tree = await screen.findByRole("tree", { name: "Collections" });
    await userEvent.click(within(tree).getByRole("button", { name: "Expand Sets" }));

    const dataTransfer = transfer();
    fireEvent.dragStart(rowFor("Track 2"), { dataTransfer });
    fireEvent.drop(within(tree).getByText("Warmups").closest("[role=treeitem]")!, {
      dataTransfer,
    });

    await waitFor(() =>
      expect(bridge.addTracksToCollection).toHaveBeenCalledWith({
        collection_id: 12,
        track_ids: [2],
      }),
    );
  });

  it("sends a described selection through the batch path instead", async () => {
    // `addTracksToCollection` takes ids and only the batch path takes a query,
    // so a 47,913-track drop cannot go the same way a three-track one does.
    renderScreen();
    await tableReady();
    await userEvent.keyboard("{Control>}a{/Control}");
    await screen.findByText(/everything matching/);
    const tree = await screen.findByRole("tree", { name: "Collections" });
    await userEvent.click(within(tree).getByRole("button", { name: "Expand Sets" }));

    const dataTransfer = transfer();
    fireEvent.dragStart(rowFor("Track 2"), { dataTransfer });
    fireEvent.drop(within(tree).getByText("Warmups").closest("[role=treeitem]")!, {
      dataTransfer,
    });

    await waitFor(() => expect(bridge.applyBatch).toHaveBeenCalled());
    expect(bridge.addTracksToCollection).not.toHaveBeenCalled();
    // And the pane says nothing: the batch reports its own counts, and an
    // "Added 0 tracks" beside them would be an outcome the pane invented.
    expect(screen.queryByText(/Added 0 tracks/)).not.toBeInTheDocument();
    const payload = bridge.applyBatch.mock.calls[0]![0] as Record<string, unknown>;
    expect((payload.selection as Record<string, unknown>).track_ids).toBeUndefined();
    expect(payload.operation).toEqual({ kind: "add_to_collection", value: 12 });
  });
});

/**
 * Rearranging a Collection (ORG-11, DEC-058).
 *
 * A reorder writes a position, and a position only means something in the
 * Collection's own order. Everything else is refused out loud, because a user
 * dragging a row inside a Collection has said plainly what they meant.
 */
describe("rearranging a Collection (ORG-11)", () => {
  beforeEach(() => {
    bridge.getLibrarySummary.mockResolvedValue(loadedSummary());
  });

  function transfer(initial: Record<string, string> = {}) {
    const data: Record<string, string> = { ...initial };
    return {
      dropEffect: "none",
      effectAllowed: "none",
      get types() {
        return Object.keys(data);
      },
      getData: (format: string) => data[format] ?? "",
      setData: (format: string, value: string) => {
        data[format] = value;
      },
    } as unknown as DataTransfer;
  }

  function rowFor(text: string): HTMLElement {
    return screen.getByText(text).closest("[role=row]") as HTMLElement;
  }

  function drag(
    type: "dragover" | "drop",
    element: Element,
    dataTransfer: DataTransfer,
    clientY = 0,
  ) {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientY });
    Object.defineProperty(event, "dataTransfer", { value: dataTransfer });
    fireEvent(element, event);
  }

  async function openWarmups() {
    const tree = await screen.findByRole("tree", { name: "Collections" });
    await userEvent.click(within(tree).getByRole("button", { name: "Expand Sets" }));
    await userEvent.click(within(tree).getByText("Warmups"));
    await waitFor(() => expect(lastBrowse()).toMatchObject({ collectionId: 12 }));
  }

  it("moves the entry the row came from, to the gap it was dropped in", async () => {
    renderScreen();
    await tableReady();
    await openWarmups();

    const dataTransfer = transfer();
    // The second row, not the first: an offset that is zero either way would
    // not say the entry read is the one the drag started on.
    fireEvent.dragStart(rowFor("Track 2"), { dataTransfer });
    drag("dragover", rowFor("Track 3"), dataTransfer, 5);
    drag("drop", rowFor("Track 3"), dataTransfer, 5);

    await waitFor(() =>
      expect(bridge.getCollectionEntries).toHaveBeenCalledWith({
        collectionId: 12,
        offset: 1,
        limit: 1,
      }),
    );
    // Dropped past the third row from the second: taking it out moved the rest
    // up one, so it lands at 2 rather than 3.
    expect(bridge.reorderCollectionEntry).toHaveBeenCalledWith({
      entry_id: 500,
      position: 2,
    });
  });

  it("re-reads the table and the tree once it has moved", async () => {
    renderScreen();
    await tableReady();
    await openWarmups();
    const browses = bridge.browseLibrary.mock.calls.length;

    const dataTransfer = transfer();
    fireEvent.dragStart(rowFor("Track 1"), { dataTransfer });
    drag("dragover", rowFor("Track 3"), dataTransfer, 5);
    drag("drop", rowFor("Track 3"), dataTransfer, 5);

    await waitFor(() =>
      expect(bridge.browseLibrary.mock.calls.length).toBeGreaterThan(browses),
    );
  });

  it("refuses, out loud, while the table is sorted by something else", async () => {
    renderScreen();
    await tableReady();
    await openWarmups();
    await userEvent.click(screen.getByRole("button", { name: /^BPM/ }));
    await waitFor(() => expect(lastBrowse()).toMatchObject({ sort: "bpm" }));

    const dataTransfer = transfer();
    fireEvent.dragStart(rowFor("Track 1"), { dataTransfer });
    drag("dragover", rowFor("Track 3"), dataTransfer, 5);
    drag("drop", rowFor("Track 3"), dataTransfer, 5);

    expect(await screen.findByText(/own order/)).toBeInTheDocument();
    expect(bridge.reorderCollectionEntry).not.toHaveBeenCalled();
  });

  it("refuses a drag of several tracks, and says why", async () => {
    // The position a row came from is the only one the renderer knows without
    // reading the whole membership.
    renderScreen();
    await tableReady();
    await openWarmups();
    await userEvent.click(screen.getByText("Track 1"));
    fireEvent.click(screen.getByText("Track 3"), { shiftKey: true });
    await screen.findByText(/3 tracks selected/);

    const dataTransfer = transfer();
    fireEvent.dragStart(rowFor("Track 1"), { dataTransfer });
    drag("dragover", rowFor("Track 3"), dataTransfer, 5);
    drag("drop", rowFor("Track 3"), dataTransfer, 5);

    expect(await screen.findByText(/one at a time/)).toBeInTheDocument();
    expect(bridge.reorderCollectionEntry).not.toHaveBeenCalled();
  });

  it("offers no reorder outside a Collection at all", async () => {
    // Not a refusal: there is nothing to rearrange, so the table never marks a
    // place a drop could land.
    renderScreen();
    await tableReady();

    const dataTransfer = transfer();
    fireEvent.dragStart(rowFor("Track 1"), { dataTransfer });
    drag("dragover", rowFor("Track 3"), dataTransfer, 5);

    expect(rowFor("Track 3")).not.toHaveAttribute("data-drop");
  });

  it("marks the gap a drop would land in, inside one", async () => {
    renderScreen();
    await tableReady();
    await openWarmups();

    const dataTransfer = transfer();
    fireEvent.dragStart(rowFor("Track 1"), { dataTransfer });
    drag("dragover", rowFor("Track 3"), dataTransfer, 5);

    expect(rowFor("Track 3")).toHaveAttribute("data-drop", "after");
  });
});
