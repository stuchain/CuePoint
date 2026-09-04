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
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { LibraryScreen } from "./LibraryScreen";
import { ToastProvider } from "../../components";
import { InspectorSlotProvider, useInspectorContent } from "../../components/shell";
import { ScaleProvider } from "../../tokens/ScaleContext";
import type {
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
    sort: params.sort as string,
    dir: params.dir as "asc" | "desc",
    filters: (params.filters as LibrarySearchResponse["filters"]) ?? null,
  };
}

const DETAIL: LibraryTrackDetail = {
  track: track(1),
  playlists: PLAYLISTS,
  playlist_count: 1,
};

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
  getLibraryFilterFields: ReturnType<typeof vi.fn>;
  getLibraryFacet: ReturnType<typeof vi.fn>;
  getLibraryTrack: ReturnType<typeof vi.fn>;
  showItemInFolder: ReturnType<typeof vi.fn>;
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
    getLibraryFilterFields: vi.fn().mockResolvedValue(VOCABULARY),
    getLibraryFacet: vi.fn().mockResolvedValue({
      field: "genre",
      values: [],
      truncated: false,
      total_values: 0,
      range: null,
    }),
    getLibraryTrack: vi.fn().mockResolvedValue(DETAIL),
    showItemInFolder: vi.fn().mockResolvedValue(undefined),
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

    await userEvent.click(within(tree).getByText(/All tracks/i));

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

  it("does nothing on a double-click — that is Phase 5's (DEC-046)", async () => {
    renderScreen();
    await tableReady();

    const before = bridge.browseLibrary.mock.calls.length;
    await userEvent.dblClick(screen.getByText("Track 2"));

    // The seam exists on the table and the page deliberately wires nothing to
    // it. When Phase 5 opens a match run from here, this is the test to change
    // — until then a double-click must not quietly do half of one.
    expect(bridge.browseLibrary.mock.calls.length).toBe(before);
    expect(screen.getByText("1 track selected")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
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
    // Read-only (DEC-047): the Inspector describes a track, it does not edit
    // one, so it offers no way to type into it.
    expect(within(inspector).queryByRole("textbox")).toBeNull();
    expect(within(inspector).queryByRole("spinbutton")).toBeNull();
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
