/**
 * The Clean page (CLEAN-12).
 *
 * The specification's tests, against the real page over a faked bridge:
 * - the review scope changes the rule set, not the source;
 * - the comparison marks differences and shows rejection reasons;
 * - keyboard review moves and decides;
 * - each Health link produces the rules the engine returned;
 * - the duplicates view has no delete affordance;
 * - empty states render from recorded engine responses.
 *
 * The browse fake echoes what it was asked, as the Library's tests' does,
 * because the window drops an answer that does not.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

import type {
  FilterRuleSet,
  LibraryHealth,
  LibrarySearchResponse,
  LibraryTrackRow,
  ListedDuplicateGroup,
  MatchCandidate,
  TrackMatches,
  TrackMatchState,
} from "../../api/cuepointBridge.types";
import { ToastProvider } from "../../components";
import { ScaleProvider } from "../../tokens/ScaleContext";
import { CleanScreen } from "./CleanScreen";
import fixture from "./cleanEmpty.fixture.json";
import { CLEAN_SECTION_STORAGE_KEY } from "./cleanSections";

const UNTOUCHED = fixture.untouched.health as LibraryHealth;
const MATCHED = fixture.matched.health as LibraryHealth;

function track(id: number, overrides: Partial<LibraryTrackRow> = {}): LibraryTrackRow {
  return {
    id,
    rekordbox_track_id: String(id),
    title: `Track ${id}`,
    artist: `Artist ${id}`,
    remixer: null,
    album: null,
    label: "Label One",
    genre: "Techno",
    key: "8A",
    bpm: 128,
    year: null,
    duration_seconds: 300 + id,
    rating: null,
    play_count: null,
    colour: null,
    date_added: null,
    comment: null,
    bitrate: 320,
    file_path: `C:\\music\\${id}.mp3`,
    effective_rating: null,
    rating_source: null,
    favorite: false,
    match_state: "needs_review",
    match_disputed: false,
    file_status: "present",
    artwork: "unknown",
    ...overrides,
  };
}

function candidate(id: number, overrides: Partial<MatchCandidate> = {}): MatchCandidate {
  return {
    id,
    attempt_id: 100,
    rank: id - 1001,
    is_winner: id === 1001,
    guard_ok: true,
    reject_reason: null,
    score: 92 - (id - 1001) * 10,
    base_score: 90,
    title_sim: 95,
    artist_sim: 90,
    bonus_year: 0,
    bonus_key: 2,
    beatport_track_id: String(id),
    url: `https://www.beatport.com/track/x/${id}`,
    title: "Track",
    artists: "Artist",
    remixers: null,
    label: "Label Two",
    genre: "Techno",
    subgenre: null,
    key: "A Minor",
    bpm: 128,
    release_name: "Release",
    release_date: null,
    release_year: 2020,
    artwork_url: null,
    preview_url: null,
    query_index: 1,
    query_text: "track artist",
    candidate_index: 1,
    elapsed_ms: 5,
    mix: null,
    differs: {
      title: false,
      artists: false,
      mix: null,
      remixers: null,
      label: true,
      genre: false,
      key: false,
      bpm: false,
      year: null,
    },
    ...overrides,
  };
}

const CANDIDATES = [
  candidate(1001),
  candidate(1002, { guard_ok: false, reject_reason: "guard_artist_sim_no_overlap" }),
];

function stateFor(trackId: number, overrides: Partial<TrackMatchState> = {}): TrackMatchState {
  return {
    track_id: trackId,
    state: "needs_review",
    decided_by: null,
    attempt_id: 100,
    candidate_id: 1001,
    newer_attempt_id: null,
    disputed: false,
    decided_at: null,
    ...overrides,
  };
}

function matchesFor(trackId: number, state = stateFor(trackId)): TrackMatches {
  return {
    track_id: trackId,
    track: {
      title: `Track ${trackId}`,
      artist: `Artist ${trackId}`,
      mix: null,
      remixer: null,
      album: null,
      label: "Label One",
      genre: "Techno",
      key: "8A",
      bpm: 128,
      year: null,
    },
    state,
    candidate: CANDIDATES.find((c) => c.id === state.candidate_id) ?? null,
    attempts: [
      {
        id: 100,
        track_id: trackId,
        job_id: "job-match",
        outcome: "matched",
        score: 92,
        best_candidate_id: 1001,
        error: null,
        input: {},
        queries: [],
        matcher_version: "1",
        started_at: "2026-09-15T10:00:00Z",
        finished_at: "2026-09-15T10:00:05Z",
      },
    ],
    total: 1,
  };
}

function ruleOf(params: Record<string, unknown>) {
  return (params.filters as FilterRuleSet | null)?.rules[0];
}

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
    collection_scope: (params.scope as "collection" | "smart" | undefined) ?? null,
    collection_id: (params.collectionId as number | null) ?? null,
    sort: params.sort as string,
    dir: params.dir as "asc" | "desc",
    filters: (params.filters as LibrarySearchResponse["filters"]) ?? null,
  };
}

const MEMBERS = [track(7, { title: "Twin" }), track(8, { title: "Twin", bitrate: 256 })];

const GROUP: ListedDuplicateGroup = {
  id: 55,
  signal: "text",
  group_key: "artist|twin",
  computed_at: "2026-09-15T10:00:00Z",
  track_ids: [7, 8],
  dismissed: false,
  members: MEMBERS,
};

type Fn = ReturnType<typeof vi.fn>;
let bridge: Record<string, Fn>;
let queue: LibraryTrackRow[];
let missing: LibraryTrackRow[];

function install(overrides: Record<string, Fn> = {}) {
  queue = [track(1), track(2), track(3)];
  missing = [track(9, { file_status: "missing", file_path: "E:\\gone\\9.mp3" })];
  bridge = {
    getLibrarySummary: vi.fn().mockResolvedValue({
      track_count: 3,
      playlist_count: 1,
      playlist_entry_count: 1,
      library_empty: false,
      source: {
        xml_path: "C:\\collection.xml",
        imported_at: "2026-09-15T10:00:00Z",
        xml_modified_at: null,
        xml_size_bytes: 1,
        track_count: 3,
        playlist_count: 1,
        exists: true,
        changed: false,
      },
    }),
    getLibraryHealth: vi.fn().mockResolvedValue(MATCHED),
    browseLibrary: vi.fn(async (params: Record<string, unknown>) => {
      const rule = ruleOf(params);
      if (rule?.field === "file_status") return browseAnswer(params, missing);
      if (rule?.field === "match_state") {
        return browseAnswer(
          params,
          queue.filter((row) => row.match_state === rule.value),
        );
      }
      return browseAnswer(params, []);
    }),
    getLibraryPlaylists: vi.fn().mockResolvedValue({
      playlists: [
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
      ],
      total: 1,
    }),
    getCollections: vi.fn().mockResolvedValue({ collections: [], total: 0 }),
    getLibraryTrack: vi.fn(async ({ trackId }: { trackId: number }) => ({
      track: queue.find((row) => row.id === trackId) ?? track(trackId),
      playlists: [],
      playlist_count: 0,
      metadata: null,
      tags: [],
      collections: [],
    })),
    getTrackHistory: vi.fn().mockResolvedValue({ track_id: 1, changes: [], limit: 50 }),
    getTrackMatches: vi.fn(async ({ trackId }: { trackId: number }) => matchesFor(trackId)),
    getMatchCandidates: vi.fn(async ({ attemptId }: { attemptId: number }) => ({
      attempt_id: attemptId,
      track_id: 1,
      candidates: CANDIDATES,
      total: CANDIDATES.length,
    })),
    decideMatch: vi.fn(async (params: { track_id: number; decision: string }) => {
      queue = queue.map((row) =>
        row.id === params.track_id
          ? { ...row, match_state: params.decision === "reject" ? "rejected" : "accepted" }
          : row,
      );
      return { match: stateFor(params.track_id) };
    }),
    applyMatch: vi.fn().mockResolvedValue({ track: track(1) }),
    startCleanMatch: vi.fn().mockResolvedValue({
      job_id: "job-match",
      id: "job-match",
      state: "queued",
      selected: 3,
      excluded: 1,
      planned: 2,
      resumed_from: null,
    }),
    startFileCheck: vi.fn().mockResolvedValue({
      job_id: "job-check",
      id: "job-check",
      state: "queued",
      tracks: 1,
    }),
    startDuplicateScan: vi.fn().mockResolvedValue({
      job_id: "job-scan",
      id: "job-scan",
      state: "queued",
      signals: ["path", "beatport", "text"],
    }),
    startArtworkScan: vi.fn().mockResolvedValue({
      job_id: "job-art",
      id: "job-art",
      state: "queued",
      tracks: 3,
      fetch_beatport: false,
    }),
    getJob: vi.fn().mockResolvedValue({ id: "job", state: "succeeded" }),
    getJobResults: vi.fn().mockResolvedValue({ id: "job", state: "succeeded" }),
    getDuplicateGroups: vi.fn().mockResolvedValue({
      groups: [GROUP],
      total: 1,
      limit: 50,
      offset: 0,
    }),
    dismissDuplicateGroup: vi.fn().mockResolvedValue({
      group: { ...GROUP, members: undefined, dismissed: true },
    }),
    restoreDuplicateGroup: vi.fn(),
    getTags: vi.fn().mockResolvedValue({
      tags: [
        {
          id: 21,
          name: "Peak-time",
          category: null,
          colour: null,
          created_at: "2026-01-01",
          track_count: 9,
        },
      ],
      categories: [],
    }),
    createTag: vi.fn(),
    applyBatch: vi.fn().mockResolvedValue({
      applied: {
        batch_id: "b1",
        operation: "add_tag",
        target: "Peak-time",
        total: 2,
        changed: 2,
        unchanged: 0,
        failed: 0,
        cancelled: false,
      },
    }),
    getTrackFolder: vi.fn().mockResolvedValue({
      track_id: 9,
      file_path: "E:\\gone\\9.mp3",
      file_exists: false,
      folder: "E:\\",
    }),
    showItemInFolder: vi.fn().mockResolvedValue(undefined),
    saveExportFileDialog: vi
      .fn()
      .mockResolvedValue({ canceled: false, filePath: "C:\\out\\review-list.xlsx" }),
    exportReviewList: vi.fn().mockResolvedValue({
      file_path: "C:\\out\\review-list.xlsx",
      format: "excel",
      count: 3,
      columns: [],
    }),
    ...overrides,
  };
  (window as unknown as { cuepoint?: unknown }).cuepoint = bridge;
}

function LocationProbe() {
  const location = useLocation();
  return (
    <pre data-testid="location">
      {JSON.stringify({ pathname: location.pathname, state: location.state })}
    </pre>
  );
}

function renderClean(section?: string) {
  if (section) localStorage.setItem(CLEAN_SECTION_STORAGE_KEY, section);
  return render(
    <ScaleProvider>
      <ToastProvider>
        <MemoryRouter initialEntries={["/clean"]}>
          <Routes>
            <Route path="/clean" element={<CleanScreen />} />
            <Route path="/library" element={<LocationProbe />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </ScaleProvider>,
  );
}

function lastBrowse(): Record<string, unknown> {
  const calls = bridge.browseLibrary!.mock.calls;
  return calls[calls.length - 1]![0] as Record<string, unknown>;
}

function press(key: string) {
  act(() => {
    fireEvent.keyDown(window, { key });
  });
}

beforeAll(() => {
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
  // The virtualizer scrolls a row into view; jsdom has no layout to scroll.
  Element.prototype.scrollTo ??= function scrollTo() {};
});

afterAll(() => {
  Reflect.deleteProperty(HTMLElement.prototype, "offsetWidth");
  Reflect.deleteProperty(HTMLElement.prototype, "offsetHeight");
});

beforeEach(() => {
  localStorage.clear();
  install();
});

afterEach(() => {
  delete (window as unknown as { cuepoint?: unknown }).cuepoint;
  vi.restoreAllMocks();
});

describe("the page", () => {
  it("opens on Review with the four parts as tabs", async () => {
    renderClean();
    const tabs = await screen.findAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      "Review",
      "Missing files",
      "Duplicates",
      "Health",
    ]);
    expect(screen.getByRole("tab", { name: "Review" })).toHaveAttribute("aria-selected", "true");
    expect(await screen.findByRole("table", { name: "Review queue" })).toBeInTheDocument();
  });

  it("remembers the part last used", async () => {
    renderClean("health");
    expect(await screen.findByRole("tab", { name: "Health" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    fireEvent.click(screen.getByRole("tab", { name: "Duplicates" }));
    expect(localStorage.getItem(CLEAN_SECTION_STORAGE_KEY)).toBe("duplicates");
    expect(await screen.findByRole("list", { name: "Possible duplicate groups" })).toBeVisible();
  });

  it("asks for an import before there is a library", async () => {
    bridge.getLibrarySummary!.mockResolvedValue({
      track_count: 0,
      playlist_count: 0,
      playlist_entry_count: 0,
      library_empty: true,
      source: null,
    });
    renderClean();
    fireEvent.click(await screen.findByRole("button", { name: "Go to the Library" }));
    expect(await screen.findByTestId("location")).toHaveTextContent('"/library"');
  });
});

describe("the review queue", () => {
  it("changes its rule set, not its source, when the scope changes", async () => {
    renderClean();
    await screen.findByText("Track 1");
    expect(lastBrowse().filters).toEqual(fixture.rules.needs_review);

    fireEvent.change(screen.getByLabelText("Show"), { target: { value: "disputed" } });
    await waitFor(() =>
      expect(lastBrowse().filters).toEqual({
        match: "all",
        rules: [{ field: "match_disputed", operator: "is", value: true }],
      }),
    );
    // The same one query path: the Library's browse, asked a window at a time.
    expect(lastBrowse()).toMatchObject({ offset: 0, limit: 100, sort: "artist" });
  });

  it("scopes to a playlist the Library's way", async () => {
    renderClean();
    await screen.findByText("Track 1");
    await screen.findByRole("option", { name: "Friday" });
    fireEvent.change(screen.getByLabelText("In"), { target: { value: "playlist:10" } });
    await waitFor(() => expect(lastBrowse()).toMatchObject({ playlistId: 10 }));
    expect(lastBrowse().filters).toEqual(fixture.rules.needs_review);
  });

  it("puts a selected track beside its candidates, differences marked", async () => {
    renderClean();
    fireEvent.click(await screen.findByText("Track 1"));

    const panel = await screen.findByRole("region", { name: "Comparison" });
    expect(await within(panel).findByText("This track")).toBeInTheDocument();
    const differing = panel.querySelectorAll('[data-differs="true"]');
    // Label differs for each candidate; the key, in another notation, does not.
    expect([...differing].map((cell) => cell.textContent)).toEqual([
      "≠ Label Two (differs from this track)",
      "≠ Label Two (differs from this track)",
    ]);
    expect(within(panel).getByText("Refused: no artist in common")).toBeInTheDocument();
    expect(within(panel).getByTestId("decision")).toHaveTextContent("Needs review");
  });

  it("is reviewed from the keyboard: move, choose, accept, and on to the next", async () => {
    renderClean();
    await screen.findByText("Track 1");

    press("ArrowDown");
    await waitFor(() => expect(bridge.getTrackMatches).toHaveBeenCalledWith({ trackId: 1 }));
    const panel = await screen.findByRole("region", { name: "Comparison" });
    await within(panel).findByRole("button", { name: "Accept #1" });

    press("ArrowRight");
    await within(panel).findByRole("button", { name: "Accept #2" });

    press("a");
    await waitFor(() =>
      expect(bridge.decideMatch).toHaveBeenCalledWith({
        decision: "accept",
        track_id: 1,
        candidate_id: 1002,
      }),
    );
    // Track 1 has left the queue; the cursor stayed put and Track 2 moved in.
    await waitFor(() => expect(bridge.getTrackMatches).toHaveBeenLastCalledWith({ trackId: 2 }));
    expect(await screen.findByText("Accepted a match for “Track 1”.")).toHaveAttribute(
      "role",
      "status",
    );

    press("r");
    await waitFor(() =>
      expect(bridge.decideMatch).toHaveBeenLastCalledWith({ decision: "reject", track_id: 2 }),
    );
    await waitFor(() => expect(bridge.getTrackMatches).toHaveBeenLastCalledWith({ trackId: 3 }));

    press("ArrowUp");
    press("n");
    expect(bridge.decideMatch).toHaveBeenCalledTimes(2);
  });

  it("ignores the keys while typing", async () => {
    renderClean();
    await screen.findByText("Track 1");
    const show = screen.getByLabelText("Show");
    fireEvent.keyDown(show, { key: "ArrowDown" });
    expect(bridge.getTrackMatches).not.toHaveBeenCalled();
  });

  it("leaves its keys alone while one of its dialogs is open", async () => {
    renderClean();
    fireEvent.click(await screen.findByText("Track 1"));
    await screen.findByRole("button", { name: "Accept #1" });
    fireEvent.click(screen.getByRole("button", { name: "Export review list…" }));
    await screen.findByRole("dialog");

    // Pressed where the window hears it, not inside the dialog: the page has
    // to know its own dialog is open, not only where focus happens to be.
    press("a");
    press("ArrowDown");
    expect(bridge.decideMatch).not.toHaveBeenCalled();
    expect(bridge.getTrackMatches).not.toHaveBeenCalledWith({ trackId: 2 });
  });

  it("leaves a key alone that something else already handled", async () => {
    renderClean();
    fireEvent.click(await screen.findByText("Track 1"));
    await screen.findByRole("button", { name: "Accept #1" });

    const handled = new KeyboardEvent("keydown", { key: "a", cancelable: true, bubbles: true });
    handled.preventDefault();
    act(() => {
      window.dispatchEvent(handled);
    });
    expect(bridge.decideMatch).not.toHaveBeenCalled();

    press("a");
    await waitFor(() => expect(bridge.decideMatch).toHaveBeenCalledTimes(1));
  });

  it("applies only once a match is accepted, and only the fields chosen", async () => {
    bridge.getTrackMatches!.mockImplementation(async ({ trackId }: { trackId: number }) =>
      matchesFor(trackId, stateFor(trackId, { state: "accepted", decided_by: "user" })),
    );
    renderClean();
    fireEvent.click(await screen.findByText("Track 1"));

    const apply = await screen.findByRole("group", { name: "Apply from the accepted match" });
    fireEvent.click(within(apply).getByRole("checkbox", { name: /BPM/ }));
    fireEvent.click(within(apply).getByRole("button", { name: "Apply 4 fields" }));

    await waitFor(() =>
      expect(bridge.applyMatch).toHaveBeenCalledWith({
        fields: ["key", "genre", "label", "year"],
        track_id: 1,
      }),
    );
    expect(
      await screen.findByText("Applied Key, Genre, Label, Year to “Track 1”."),
    ).toHaveAttribute("role", "status");
    // A person's decision can be cleared; the matcher's could not.
    expect(screen.getByRole("button", { name: "Clear decision" })).toBeEnabled();
  });

  it("offers no apply before a match is accepted", async () => {
    renderClean();
    fireEvent.click(await screen.findByText("Track 1"));
    await screen.findByRole("button", { name: "Accept #1" });
    expect(screen.queryByRole("group", { name: "Apply from the accepted match" })).toBeNull();
    expect(screen.getByRole("button", { name: "Clear decision" })).toBeDisabled();
  });

  it("matches everything shown as a job, and says what it left out", async () => {
    renderClean();
    await screen.findByText("Track 1");
    fireEvent.click(screen.getByRole("button", { name: "Match all 3" }));

    await waitFor(() =>
      expect(bridge.startCleanMatch).toHaveBeenCalledWith({
        selection: {
          query: {
            q: undefined,
            playlist_id: null,
            collection_id: null,
            filters: fixture.rules.needs_review,
          },
        },
        rematch: false,
      }),
    );
    expect(
      await screen.findByText(
        "Matching 2 tracks on Beatport. 1 already matched or decided is left out.",
      ),
    ).toBeInTheDocument();
    await screen.findByText("Matching finished.");
  });

  it("re-matches one track, even one already matched", async () => {
    renderClean();
    fireEvent.click(await screen.findByText("Track 2"));
    fireEvent.click(await screen.findByRole("button", { name: "Re-match" }));
    await waitFor(() =>
      expect(bridge.startCleanMatch).toHaveBeenCalledWith({
        selection: { track_ids: [2] },
        rematch: true,
      }),
    );
  });

  it("says why the engine refused a match", async () => {
    bridge.startCleanMatch!.mockRejectedValue(new Error("Every track here is already matched"));
    renderClean();
    await screen.findByText("Track 1");
    fireEvent.click(screen.getByRole("button", { name: "Match all 3" }));
    expect(await screen.findByText("Every track here is already matched")).toBeInTheDocument();
  });

  it("exports the review list where the save dialog chose", async () => {
    renderClean();
    await screen.findByText("Track 1");
    fireEvent.click(screen.getByRole("button", { name: "Export review list…" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Format"), { target: { value: "excel" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Choose where to save…" }));

    await waitFor(() =>
      expect(bridge.exportReviewList).toHaveBeenCalledWith({
        selection: {
          query: {
            q: undefined,
            playlist_id: null,
            collection_id: null,
            filters: fixture.rules.needs_review,
          },
        },
        format: "excel",
        file_path: "C:\\out\\review-list.xlsx",
        overwrite: true,
      }),
    );
    expect(bridge.saveExportFileDialog).toHaveBeenCalledWith({
      defaultPath: "review-list.xlsx",
      format: "xlsx",
    });
    expect(await screen.findByText("Exported 3 tracks to review-list.xlsx.")).toBeInTheDocument();
  });

  it("writes nothing when the save dialog is cancelled", async () => {
    bridge.saveExportFileDialog!.mockResolvedValue({ canceled: true });
    renderClean();
    await screen.findByText("Track 1");
    fireEvent.click(screen.getByRole("button", { name: "Export review list…" }));
    fireEvent.click(await screen.findByRole("button", { name: "Choose where to save…" }));
    await waitFor(() => expect(bridge.saveExportFileDialog).toHaveBeenCalled());
    expect(bridge.exportReviewList).not.toHaveBeenCalled();
  });

  it("says nothing is matched yet, from the engine's own answer", async () => {
    bridge.getLibraryHealth!.mockResolvedValue(UNTOUCHED);
    bridge.browseLibrary!.mockImplementation(async (params: Record<string, unknown>) =>
      ruleOf(params)?.value === "needs_review"
        ? (fixture.untouched.needs_review as LibrarySearchResponse)
        : browseAnswer(params, queue),
    );
    renderClean();
    expect(await screen.findByText("Nothing is matched yet.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Show what is not matched" }));
    await waitFor(() => expect(ruleOf(lastBrowse())?.value).toBe("not_matched"));
  });

  it("says nothing needs review once everything is settled", async () => {
    bridge.browseLibrary!.mockResolvedValue(fixture.matched.needs_review as LibrarySearchResponse);
    renderClean();
    expect(await screen.findByText("Nothing needs review.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Match all 0" })).toBeDisabled();
  });
});

describe("missing files", () => {
  it("says a fix happens in Rekordbox, and shows a disconnected drive as one line", async () => {
    bridge.getLibraryHealth!.mockResolvedValue({
      ...MATCHED,
      unavailable_roots: [
        { root: "E:\\", tracks: 4812, summary: "4,812 tracks on E:\\ — the drive is not connected" },
      ],
    });
    renderClean("missing");
    expect(await screen.findByText(/use Relocate in Rekordbox/)).toBeInTheDocument();
    expect(
      await screen.findByText("At the last check: 4,812 tracks on E:\\ — the drive is not connected."),
    ).toBeInTheDocument();
    expect(await screen.findByText("E:\\gone\\9.mp3")).toBeInTheDocument();
    expect(lastBrowse().filters).toEqual(fixture.rules.missing_files);
  });

  it("shows the nearest folder that still exists", async () => {
    renderClean("missing");
    fireEvent.click(await screen.findByText("Track 9"));
    fireEvent.click(screen.getByRole("button", { name: "Show in folder" }));
    await waitFor(() => expect(bridge.getTrackFolder).toHaveBeenCalledWith({ trackId: 9 }));
    await waitFor(() => expect(bridge.showItemInFolder).toHaveBeenCalledWith("E:\\"));
    expect(await screen.findByText(/nearest folder that is: E:\\/)).toBeInTheDocument();
  });

  it("says plainly when nothing on the path exists", async () => {
    bridge.getTrackFolder!.mockResolvedValue({
      track_id: 9,
      file_path: "E:\\gone\\9.mp3",
      file_exists: false,
      folder: null,
    });
    renderClean("missing");
    fireEvent.click(await screen.findByText("Track 9"));
    fireEvent.click(screen.getByRole("button", { name: "Show in folder" }));
    expect(await screen.findByText(/The drive may not be connected/)).toBeInTheDocument();
    expect(bridge.showItemInFolder).not.toHaveBeenCalled();
  });

  it("checks what is shown again, and reads the table again after", async () => {
    renderClean("missing");
    await screen.findByText("Track 9");
    const before = bridge.browseLibrary!.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Check these again" }));
    await waitFor(() =>
      expect(bridge.startFileCheck).toHaveBeenCalledWith({
        selection: {
          query: {
            q: undefined,
            playlist_id: null,
            collection_id: null,
            filters: fixture.rules.missing_files,
          },
        },
      }),
    );
    expect(await screen.findByText("Checking 1 track.")).toBeInTheDocument();
    await waitFor(() => expect(bridge.browseLibrary!.mock.calls.length).toBeGreaterThan(before));
  });

  it("says files were never checked, from the engine's own answer", async () => {
    bridge.getLibraryHealth!.mockResolvedValue(UNTOUCHED);
    bridge.browseLibrary!.mockResolvedValue(
      fixture.untouched.missing_files as LibrarySearchResponse,
    );
    renderClean("missing");
    expect(await screen.findByText("Files have not been checked yet.")).toBeInTheDocument();
    const table = screen.getByRole("table", { name: "Missing files" });
    fireEvent.click(within(table).getByRole("button", { name: "Check every file" }));
    await waitFor(() =>
      expect(bridge.startFileCheck).toHaveBeenCalledWith({ selection: { query: {} } }),
    );
  });

  it("says no file is missing after a check found them all", async () => {
    bridge.getLibraryHealth!.mockResolvedValue(fixture.checked.health as LibraryHealth);
    bridge.browseLibrary!.mockResolvedValue(
      fixture.checked.missing_files as LibrarySearchResponse,
    );
    renderClean("missing");
    expect(await screen.findByText("No missing files.")).toBeInTheDocument();
  });
});

describe("duplicates", () => {
  it("lists each group with its signal and its tracks", async () => {
    renderClean("duplicates");
    const group = await screen.findByRole("listitem", { name: /Same artist and title · 2 tracks/ });
    expect(within(group).getAllByText("Twin")).toHaveLength(2);
    expect(within(group).getByText(/256 kbps/)).toBeInTheDocument();
    expect(within(group).getByText(/within two seconds/)).toBeInTheDocument();
    expect(bridge.getDuplicateGroups).toHaveBeenCalledWith({
      includeDismissed: false,
      limit: 50,
      offset: 0,
    });
  });

  it("offers no way to delete anything", async () => {
    renderClean("duplicates");
    await screen.findByRole("list", { name: "Possible duplicate groups" });
    const offered = [...screen.queryAllByRole("button"), ...screen.queryAllByRole("menuitem")];
    expect(offered.length).toBeGreaterThan(0);
    for (const control of offered) {
      expect(control.textContent ?? "").not.toMatch(/delete|remove|trash/i);
      expect(control.getAttribute("aria-label") ?? "").not.toMatch(/delete|remove|trash/i);
    }
  });

  it("marks a group not duplicates", async () => {
    renderClean("duplicates");
    fireEvent.click(await screen.findByRole("button", { name: "Not duplicates" }));
    await waitFor(() =>
      expect(bridge.dismissDuplicateGroup).toHaveBeenCalledWith({ group_id: 55 }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("list", { name: "Possible duplicate groups" })).toBeNull(),
    );
    expect(await screen.findByText(/comes back if these tracks change/)).toBeInTheDocument();
  });

  it("tags a group's tracks through the one batch entry point", async () => {
    renderClean("duplicates");
    fireEvent.click(await screen.findByRole("button", { name: "Tag these tracks…" }));
    fireEvent.click(await screen.findByRole("option", { name: /Peak-time/ }));
    await waitFor(() =>
      expect(bridge.applyBatch).toHaveBeenCalledWith({
        selection: { track_ids: [7, 8] },
        operation: { kind: "add_tag", value: 21 },
      }),
    );
  });

  it("shows a member's file", async () => {
    bridge.getTrackFolder!.mockResolvedValue({
      track_id: 8,
      file_path: "C:\\music\\8.mp3",
      file_exists: true,
      folder: "C:\\music",
    });
    renderClean("duplicates");
    const reveals = await screen.findAllByRole("button", { name: "Show Twin in its folder" });
    fireEvent.click(reveals[1]!);
    await waitFor(() => expect(bridge.showItemInFolder).toHaveBeenCalledWith("C:\\music\\8.mp3"));
  });

  it("says duplicates were never looked for, from the engine's own answer", async () => {
    bridge.getLibraryHealth!.mockResolvedValue(UNTOUCHED);
    bridge.getDuplicateGroups!.mockResolvedValue(fixture.untouched.duplicates);
    renderClean("duplicates");
    expect(await screen.findByText("Duplicates have not been looked for yet.")).toBeInTheDocument();
    const offers = screen.getAllByRole("button", { name: "Find duplicates" });
    fireEvent.click(offers[offers.length - 1]!);
    await waitFor(() => expect(bridge.startDuplicateScan).toHaveBeenCalledWith({}));
    await waitFor(() => expect(bridge.getDuplicateGroups).toHaveBeenCalledTimes(2));
  });

  it("says none were found after a scan", async () => {
    bridge.getLibraryHealth!.mockResolvedValue(fixture.scanned.health as LibraryHealth);
    bridge.getDuplicateGroups!.mockResolvedValue(fixture.scanned.duplicates);
    renderClean("duplicates");
    expect(await screen.findByText("No possible duplicates.")).toBeInTheDocument();
  });
});

describe("Health", () => {
  it("opens the Library on exactly the rules each count came with", async () => {
    bridge.getLibraryHealth!.mockResolvedValue(UNTOUCHED);
    renderClean("health");
    const count = UNTOUCHED.counts.find((entry) => entry.id === "not_matched")!;
    fireEvent.click(
      await screen.findByRole("button", { name: "3 Not matched: open in the Library" }),
    );
    const location = JSON.parse((await screen.findByTestId("location")).textContent ?? "{}");
    expect(location).toEqual({
      pathname: "/library",
      state: { cuepointLibraryRules: count.rules },
    });
  });

  it.each(UNTOUCHED.counts.map((count) => [count.id, count] as const))(
    "links %s to its own rules",
    async (_id, count) => {
      bridge.getLibraryHealth!.mockResolvedValue(UNTOUCHED);
      renderClean("health");
      fireEvent.click(
        await screen.findByRole("button", {
          name: `${count.count.toLocaleString()} ${count.label}: open in the Library`,
        }),
      );
      const location = JSON.parse((await screen.findByTestId("location")).textContent ?? "{}");
      expect(location.state.cuepointLibraryRules).toEqual(count.rules);
    },
  );

  it("says each check never ran, and runs one", async () => {
    bridge.getLibraryHealth!.mockResolvedValue(UNTOUCHED);
    renderClean("health");
    const checks = await screen.findByRole("list", { name: "Checks" });
    expect(within(checks).getAllByText("Never run")).toHaveLength(3);

    const before = bridge.getLibraryHealth!.mock.calls.length;
    fireEvent.click(within(checks).getByRole("button", { name: "Read artwork" }));
    await waitFor(() =>
      expect(bridge.startArtworkScan).toHaveBeenCalledWith({ selection: { query: {} } }),
    );
    expect(await screen.findByText("Finished reading artwork.")).toBeInTheDocument();
    expect(bridge.getLibraryHealth!.mock.calls.length).toBeGreaterThan(before);
  });

  it("says when a check last ran and what it found", async () => {
    bridge.getLibraryHealth!.mockResolvedValue({
      ...MATCHED,
      detections: MATCHED.detections.map((run) =>
        run.id === "files" ? { ...run, last_run_at: "2026-09-15T10:00:00Z" } : run,
      ),
    });
    renderClean("health");
    const checks = await screen.findByRole("list", { name: "Checks" });
    // The duplicates run is recorded too; the files run is the one given a time.
    expect(within(checks).getAllByText(/^Last run /)).toHaveLength(2);
    expect(within(checks).getByText("Checked 3 files: 3 present, 0 missing")).toBeInTheDocument();
  });

  it("says why it cannot count", async () => {
    bridge.getLibraryHealth!.mockRejectedValue(new Error("The library is unavailable"));
    renderClean("health");
    expect(await screen.findByRole("alert")).toHaveTextContent("The library is unavailable");
  });
});
