/**
 * The Clean page (CLEAN-12).
 *
 * The specification's tests, against the real page over a faked bridge:
 * - the Match tab opens on Playlists, and the header's Match N playlists on
 *   Beatport starts a match under a name (C22; the Match area's own tests are in `match/`);
 * - the page has three tabs, and the header holds that button on Match ▸ Playlists only (K3, K4);
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
  CleanPlaylists,
  LibraryHealth,
  LibrarySearchResponse,
  LibraryTrackRow,
  ListedDuplicateGroup,
} from "../../api/cuepointBridge.types";
import { announceLibraryChange } from "../../api/libraryChanges";
import { ToastProvider } from "../../components";
import { getSelectedTrack, setSelectedTrack } from "../../components/shell/selectedTrack";
import { libraryRefreshState } from "../library/libraryLink";
import { InspectorSlotOutlet, InspectorSlotProvider } from "../../components/shell";
import { ScaleProvider } from "../../tokens/ScaleContext";
import { IMPORT_COLLECTION_LABEL } from "../../components/EmptyState";
import { importOpening } from "../library/libraryLink";
import { CleanScreen } from "./CleanScreen";
import fixture from "./cleanEmpty.fixture.json";
import { CLEAN_SECTION_STORAGE_KEY } from "./cleanSections";
import {
  CANDIDATES,
  browseAnswer,
  matchesFor,
  run,
  ruleOf,
  stateFor,
  track,
} from "../../test/matchFixtures";
import { MATCH_TAB_STORAGE_KEY } from "./match/MatchArea";
import {
  cleanMatchOpening,
  cleanMatchState,
  cleanOpening,
  cleanSectionOpening,
  cleanSectionState,
  cleanTrackState,
} from "./cleanLink";

const UNTOUCHED = fixture.untouched.health as LibraryHealth;

const MATCHED = fixture.matched.health as LibraryHealth;

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

const COUNTS = {
  track_count: 10,
  not_matched: 10,
  waiting: 0,
  accepted: 0,
  rejected: 0,
  no_match: 0,
  unsaved: 0,
  running: null,
};

/** Five playlists: one already matched (Closing), the rest not, for the label and rematch cases. */
const PLAYLISTS: CleanPlaylists = {
  whole_library: { ...COUNTS, track_count: 50 },
  playlists: [
    { id: 10, name: "Peak time", path: "Techno", ...COUNTS },
    { id: 11, name: "Closing", path: "", ...COUNTS, not_matched: 0, accepted: 10 },
    { id: 12, name: "Warmup", path: "", ...COUNTS },
    { id: 13, name: "hj", path: "", ...COUNTS },
    { id: 14, name: "all", path: "", ...COUNTS, not_matched: 0, waiting: 4 },
  ],
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
      if (rule?.field === "match_state" || rule?.field === "match_disputed") {
        return browseAnswer(
          params,
          queue.filter((row) =>
            rule.field === "match_state" ? row.match_state === rule.value : row.match_disputed,
          ),
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
    getMatchJobs: vi.fn().mockResolvedValue({ jobs: [], total: 0 }),
    getCleanPlaylists: vi.fn().mockResolvedValue(PLAYLISTS),
    correctMatch: vi.fn().mockResolvedValue({
      match: stateFor(1),
      track: track(1),
      batch_id: "batch-1",
      changed: true,
      applied: ["bpm"],
      skipped: [],
      unchanged: [],
      key: null,
    }),
    revertBatch: vi.fn().mockResolvedValue({}),
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
    setTrackOverrides: vi.fn().mockResolvedValue({}),
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

/** `tab` is the Match sub-tab to open on: the tests of the lists open on One at a time; Playlists is the default (C22). */
function renderClean(section?: string, tab: string | null = "one") {
  if (section) localStorage.setItem(CLEAN_SECTION_STORAGE_KEY, section);
  if (tab && localStorage.getItem(MATCH_TAB_STORAGE_KEY) === null) localStorage.setItem(MATCH_TAB_STORAGE_KEY, tab);
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

/** Press a playlist's own Match button (C22): no ticks, no header button. */
async function startMatching(name = "Whole library") {
  fireEvent.click(await screen.findByRole("button", { name: `Match ${name}` }));
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
  it("opens on Match with the three parts as tabs, on Playlists (K3, C22)", async () => {
    renderClean(undefined, null);
    const tabs = await screen.findAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      "Match",
      "Missing files",
      "Duplicates",
      // The Match area's own sub-tabs.
      "Playlists",
      "One at a time",
      "Table",
      "Past searches",
    ]);
    expect(screen.getByRole("tab", { name: "Match" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Playlists" })).toHaveAttribute("aria-selected", "true");
    expect(await screen.findByRole("table", { name: /Your playlists/ })).toBeInTheDocument();
    expect(await screen.findByText("Peak time")).toBeInTheDocument();
  });

  it("shows where work waits on the tabs, and nothing for a check never run (CLN-3)", async () => {
    const ran = "2026-10-01T10:00:00Z";
    const counts = (entries: Record<string, number>) =>
      MATCHED.counts.map((count) => ({ ...count, count: entries[count.id] ?? count.count }));
    bridge.getLibraryHealth!.mockResolvedValue({
      ...MATCHED,
      counts: counts({ needs_review: 40, disputed: 2, missing_files: 3, duplicates: 5 }),
      detections: MATCHED.detections.map((run) =>
        run.id === "files" ? { ...run, last_run_at: ran } : { ...run, last_run_at: null },
      ),
    });
    renderClean();
    const tabs = await screen.findAllByRole("tab");
    await waitFor(() =>
      expect(tabs.map((tab) => tab.textContent)).toEqual([
        "Match (42)",
        "Missing files (3)",
        "Duplicates",
        "Playlists",
        "One at a time",
        "Table",
        "Past searches",
      ]),
    );
  });

  it("opens no part with a paragraph: the tab names and the buttons say what it is for (C15b)", async () => {
    renderClean();
    await screen.findByRole("region", { name: "One at a time" });
    expect(screen.queryByText(/CuePoint looks each track up on Beatport\./)).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "Missing files" }));
    await screen.findByText("Track 9");
    expect(screen.queryByText(/CuePoint finds files that are not where Rekordbox says/)).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "Duplicates" }));
    await screen.findByRole("list", { name: "Possible duplicate groups" });
    expect(screen.queryByText(/Possible duplicates are grouped by what they share/)).toBeNull();
  });

  it("remembers the part last used", async () => {
    renderClean("missing");
    expect(await screen.findByRole("tab", { name: "Missing files" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    fireEvent.click(screen.getByRole("tab", { name: "Duplicates" }));
    expect(localStorage.getItem(CLEAN_SECTION_STORAGE_KEY)).toBe("duplicates");
    expect(await screen.findByRole("list", { name: "Possible duplicate groups" })).toBeVisible();
  });

  it.each(["fix", "health"])("opens on Match when %s, a part K3 removed, was stored", async (old) => {
    renderClean(old);
    expect(await screen.findByRole("tab", { name: "Match" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("has no header button and no tick boxes: every playlist has its own Match (K4, C22)", async () => {
    renderClean(undefined, "playlists");
    const header = await screen.findByTestId("clean-header");
    expect(within(header).getByRole("heading", { level: 1, name: "Clean" })).toBeInTheDocument();
    await screen.findByText("Peak time");
    expect(within(header).queryByRole("button")).toBeNull();
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(screen.queryByText("Tick one or more playlists.")).toBeNull();
    for (const name of ["Whole library", "Peak time", "Closing", "Warmup", "hj", "all"]) {
      expect(screen.getByRole("button", { name: `Match ${name}` })).toBeEnabled();
    }
    expect(screen.queryByRole("button", { name: "Match tracks…" })).toBeNull();
  });

  it("asks for an import before there is a library", async () => {
    bridge.getLibrarySummary!.mockResolvedValue({
      track_count: 0,
      playlist_count: 0,
      playlist_entry_count: 0,
      library_empty: true,
      source: null,
    });
    const { container } = renderClean();
    // The shared empty state, with the one label for filling an empty Library.
    await screen.findByText("No collection imported yet");
    expect(container.querySelector(".cp-empty-state")).not.toBeNull();
    expect(screen.queryByRole("tab")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: IMPORT_COLLECTION_LABEL }));
    // To the Library, asking it to start an import.
    const where = JSON.parse((await screen.findByTestId("location")).textContent ?? "{}");
    expect(where.pathname).toBe("/library");
    expect(importOpening({ state: where.state, key: "k" })).toBe("k");
  });
});

describe("the Match tab", () => {
  it("lists the queue by Show and From, the Library's way (the area's tests are in match/)", async () => {
    renderClean();
    await screen.findByText("1 of 3");
    expect(lastBrowse().filters).toEqual(fixture.rules.needs_review);
    expect(lastBrowse()).toMatchObject({ offset: 0, limit: 100, sort: "artist" });
    expect(screen.queryByLabelText("In")).toBeNull();
  });

  it("holds Save review list as a file… beside each past search, not in the header (CLN-11, K12)", async () => {
    renderClean();
    await screen.findByText("1 of 3");
    const header = screen.getByTestId("clean-header");
    expect(within(header).queryByRole("button", { name: /Save review list/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Export review list/ })).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "Table" }));
    await act(async () => {});
    expect(screen.queryByRole("button", { name: /Save review list/ })).toBeNull();

    bridge.getMatchJobs!.mockResolvedValue({
      jobs: [run({ job_id: "job-1", label: 'Playlist "all"' })],
      total: 1,
    });
    fireEvent.click(screen.getByRole("tab", { name: "Past searches" }));
    expect(
      await screen.findByRole("button", { name: 'Save review list of Playlist "all" as a file…' }),
    ).toBeInTheDocument();
  });

  it("matches the chosen tracks as a job, names the run, and says what it left out", async () => {
    renderClean(undefined, "playlists");
    await startMatching();

    await waitFor(() =>
      expect(bridge.startCleanMatch).toHaveBeenCalledWith({
        selection: { query: {} },
        rematch: false,
        label: "Whole library",
      }),
    );
    expect(
      await screen.findByText(
        "Matching 2 tracks on Beatport. 1 already matched or decided is left out.",
      ),
    ).toBeInTheDocument();
  });

  it("reads Health and the playlists again once a match ends", async () => {
    renderClean(undefined, "playlists");
    await screen.findByText("Peak time");
    const health = bridge.getLibraryHealth!.mock.calls.length;
    const playlists = bridge.getCleanPlaylists!.mock.calls.length;
    await startMatching();
    await waitFor(() => expect(bridge.getLibraryHealth!.mock.calls.length).toBeGreaterThan(health));
    await waitFor(() => expect(bridge.getCleanPlaylists!.mock.calls.length).toBeGreaterThan(playlists));
  });

  it("says a running match in one line, with its name, on the tabs without the rows (CLN-7, C22)", async () => {
    // The job never ends until released, so the note can be read while it runs.
    let release: (() => void) | undefined;
    bridge.getJob!.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ id: "job", state: "succeeded" });
        }),
    );
    renderClean(undefined, "playlists");
    await screen.findByText("Peak time");
    expect(screen.queryByRole("region", { name: "Matching" })).toBeNull();
    await startMatching("Peak time");

    // On Playlists the row says it; the old line above the tabs is gone.
    await waitFor(() => expect(bridge.startCleanMatch).toHaveBeenCalled());
    expect(screen.queryByRole("region", { name: "Matching" })).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "Past searches" }));
    const note = await screen.findByRole("region", { name: "Matching" });
    expect(note).toHaveTextContent(/^Matching Peak time…$/);
    expect(note).not.toHaveTextContent(/bar at the bottom|keep working/i);
    await waitFor(() => expect(release).toBeDefined());
    act(() => release?.());
    await waitFor(() => expect(screen.queryByRole("region", { name: "Matching" })).toBeNull());
  });

  it("says how far a match already running has got, with a bar, when the page is opened (CLN-7, C22)", async () => {
    bridge.listJobs = vi.fn().mockResolvedValue({
      jobs: [
        {
          id: "job-1",
          type: "clean_match",
          state: "running",
          progress: { completed_tracks: 108, total_tracks: 180 },
        },
      ],
      active_count: 1,
    });
    renderClean(undefined, "one");
    const note = await screen.findByRole("region", { name: "Matching" });
    expect(note).toHaveTextContent(/^Matching · 108 of 180$/);
    const bar = within(note).getByRole("progressbar", { name: "Matching progress" });
    expect(bar).toHaveAttribute("value", "108");
    expect(bar).toHaveAttribute("max", "180");
    // One run at a time: on the rows every Match waits for it.
    fireEvent.click(screen.getByRole("tab", { name: "Playlists" }));
    expect(await screen.findByRole("button", { name: "Match Peak time" })).toBeDisabled();
  });

  it("says why the engine refused a match", async () => {
    bridge.startCleanMatch!.mockRejectedValue(new Error("Every track here is already matched"));
    renderClean(undefined, "playlists");
    await startMatching();
    expect(await screen.findByText("Every track here is already matched")).toBeInTheDocument();
  });

  it("searches one track again, even one already matched, and names the run for it", async () => {
    renderClean();
    await screen.findByText("1 of 3");
    fireEvent.click(await screen.findByRole("button", { name: "Search again" }));
    await waitFor(() =>
      expect(bridge.startCleanMatch).toHaveBeenCalledWith({
        selection: { track_ids: [1] },
        rematch: true,
        label: '1 track: "Track 1"',
      }),
    );
  });

  it("offers to match every track on a first visit, and what it will do (CLN-2)", async () => {
    bridge.getLibraryHealth!.mockResolvedValue(UNTOUCHED);
    bridge.browseLibrary!.mockImplementation(async (params: Record<string, unknown>) =>
      ruleOf(params)?.value === "needs_review"
        ? (fixture.untouched.needs_review as LibrarySearchResponse)
        : browseAnswer(params, queue),
    );
    renderClean();
    expect(await screen.findByText("Match your library on Beatport")).toBeInTheDocument();
    expect(
      screen.getByText(/CuePoint searches Beatport for each of your 3 tracks to find the right release, key and label\./),
    ).toBeInTheDocument();

    // The offer opens the match window with "Not looked up yet" chosen (FLW-13).
    fireEvent.click(screen.getByRole("button", { name: "Match all 3 tracks…" }));
    const dialog = await screen.findByRole("dialog", { name: "Match tracks" });
    expect(within(dialog).getByRole("radio", { name: /^Tracks not looked up yet/ })).toBeChecked();
    expect(bridge.startCleanMatch).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: /^Match / }));
    await waitFor(() =>
      expect(bridge.startCleanMatch).toHaveBeenCalledWith({
        selection: {
          query: {
            filters: {
              match: "all",
              rules: [{ field: "match_state", operator: "is", value: "not_matched" }],
            },
          },
        },
        rematch: false,
        label: "Not looked up yet",
      }),
    );
  });

  it("offers to resume a search that stopped, and resumes only what was left (CLEAN-14)", async () => {
    const stopped = run({
      job_id: "job-old",
      label: "Whole library",
      planned: 5,
      done: 3,
      found: 3,
      waiting: 0,
      not_found: 0,
      status: "stopped",
      resume_job_id: "job-old-2",
    });
    bridge.getMatchJobs!.mockResolvedValue({ jobs: [stopped], total: 1 });
    bridge.resumeCleanMatch = vi.fn().mockResolvedValue({
      job_id: "job-resumed",
      id: "job-resumed",
      state: "queued",
      selected: 2,
      excluded: 0,
      planned: 2,
      resumed_from: "job-old",
    });
    localStorage.setItem(MATCH_TAB_STORAGE_KEY, "past");
    renderClean();
    fireEvent.click(await screen.findByRole("button", { name: "Resume Whole library" }));

    await waitFor(() =>
      expect(bridge.resumeCleanMatch).toHaveBeenCalledWith({ job_id: "job-old-2" }),
    );
    expect(bridge.startCleanMatch).not.toHaveBeenCalled();
    expect(await screen.findByText("Matching 2 tracks on Beatport.")).toBeInTheDocument();
    await screen.findByText("Matching finished.");
  });

  it("matches a past search again, under its own name", async () => {
    bridge.getMatchJobs!.mockResolvedValue({
      jobs: [run({ job_id: "job-1", label: 'Playlist "Friday"' })],
      total: 1,
    });
    localStorage.setItem(MATCH_TAB_STORAGE_KEY, "past");
    renderClean();
    fireEvent.click(await screen.findByRole("button", { name: 'Match Playlist "Friday" again' }));
    await waitFor(() =>
      expect(bridge.startCleanMatch).toHaveBeenCalledWith({
        selection: {
          query: {
            filters: { match: "all", rules: [{ field: "match_run", operator: "is", value: "job-1" }] },
          },
        },
        rematch: true,
        label: 'Playlist "Friday"',
      }),
    );
  });

  it("keeps a run's name within the engine's 200 characters", async () => {
    bridge.getMatchJobs!.mockResolvedValue({
      jobs: [run({ job_id: "job-long", label: "p".repeat(300) })],
      total: 1,
    });
    localStorage.setItem(MATCH_TAB_STORAGE_KEY, "past");
    renderClean();
    fireEvent.click(await screen.findByRole("button", { name: /^Match p+ again$/ }));
    await waitFor(() => expect(bridge.startCleanMatch).toHaveBeenCalled());
    const sent = bridge.startCleanMatch!.mock.calls[0]![0] as { label: string };
    expect(sent.label).toBe(`${"p".repeat(199)}…`);
    expect(sent.label).toHaveLength(200);
  });

  it("says nothing needs review once everything is settled", async () => {
    bridge.browseLibrary!.mockResolvedValue(fixture.matched.needs_review as LibrarySearchResponse);
    renderClean();
    expect(await screen.findByText("Nothing is waiting for you.")).toBeInTheDocument();
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
    expect(await screen.findByText(/right-click the track/)).toBeInTheDocument();
    expect(
      await screen.findByText("At the last check: 4,812 tracks on E:\\ — the drive is not connected."),
    ).toBeInTheDocument();
    expect(await screen.findByText("E:\\gone\\9.mp3")).toBeInTheDocument();
    expect(lastBrowse().filters).toEqual(fixture.rules.missing_files);
  });

  it("gives the fix in steps, with a link to check Rekordbox for changes (CLN-8)", async () => {
    renderClean("missing");
    const steps = await screen.findByRole("list", { name: "How to fix a missing file" });
    const items = within(steps).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent("In Rekordbox, right-click the track, choose Relocate and point it at the file.");
    expect(items[1]).toHaveTextContent("In Rekordbox, choose File, then Export Collection in xml format.");
    expect(items[2]).toHaveTextContent("Here, Check for changes.");

    fireEvent.click(within(items[2]!).getByRole("button", { name: "Check for changes" }));
    const location = JSON.parse((await screen.findByTestId("location")).textContent ?? "{}");
    expect(location).toEqual({ pathname: "/library", state: libraryRefreshState() });
  });

  it("sets the selected track, with its Camelot key or none (PAGES-03)", async () => {
    setSelectedTrack(null);
    renderClean("missing");
    fireEvent.click(await screen.findByText("Track 9"));
    await waitFor(() => expect(getSelectedTrack()?.id).toBe(9));
    expect(getSelectedTrack()?.key ?? null).toBe(null);
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

  it("checks every file again, and reads the table again after (K4)", async () => {
    renderClean("missing");
    await screen.findByText("Track 9");
    const before = bridge.browseLibrary!.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Check again" }));
    await waitFor(() =>
      expect(bridge.startFileCheck).toHaveBeenCalledWith({ selection: { query: {} } }),
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
    fireEvent.click(screen.getByRole("button", { name: "Check every file" }));
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
    expect(await screen.findByText(/^All 3 files found/)).toBeInTheDocument();
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

  it.each([
    ["tag", "Tag these tracks…", /Peak-time/, "Tag 1,001 tracks", /^Tag 1,001 tracks “Peak-time”\?$/],
  ])(
    "asks a big %s batch in words that carry the verb and the count (R3-2)",
    async (_name, open, option, button, title) => {
      const many = Array.from({ length: 1001 }, (_, index) => index + 1);
      bridge.getDuplicateGroups!.mockResolvedValue({
        groups: [{ ...GROUP, track_ids: many }],
        total: 1,
        limit: 50,
        offset: 0,
      });
      renderClean("duplicates");
      fireEvent.click(await screen.findByRole("button", { name: open }));
      fireEvent.click(await screen.findByRole("option", { name: option }));
      const dialog = await screen.findByRole("dialog", { name: title });
      expect(within(dialog).getByRole("button", { name: button })).toBeInTheDocument();
      expect(within(dialog).queryByRole("button", { name: "Apply" })).toBeNull();
      expect(bridge.applyBatch).not.toHaveBeenCalled();
    },
  );

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

describe("opening one track from the Library (CLEAN-13)", () => {
  function Opened() {
    const location = useLocation();
    return <CleanScreen openWith={cleanOpening(location)} />;
  }

  function renderOpened(trackId: number) {
    return render(
      <ScaleProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={[{ pathname: "/clean", state: cleanTrackState(trackId) }]}>
            <Routes>
              <Route path="/clean" element={<Opened />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </ScaleProvider>,
    );
  }

  beforeEach(() => {
    install();
    queue = [track(1), track(2, { match_state: "accepted" }), track(3, { match_state: "accepted" })];
  });

  it("opens the Match area on the track's own state, with the track in the cards", async () => {
    bridge.getTrackMatches!.mockImplementation(async ({ trackId }: { trackId: number }) =>
      matchesFor(trackId, stateFor(trackId, { state: "accepted", decided_by: "user" })),
    );
    // Whatever part was last used, and whatever sub-tab, a link to a track opens One at a time.
    localStorage.setItem(CLEAN_SECTION_STORAGE_KEY, "missing");
    localStorage.setItem(MATCH_TAB_STORAGE_KEY, "past");
    renderOpened(2);

    const scope = await screen.findByRole("combobox", { name: "Show" });
    await waitFor(() => expect(scope).toHaveValue("accepted"));
    await waitFor(() =>
      expect(lastBrowse()).toMatchObject({
        filters: { match: "all", rules: [{ field: "match_state", operator: "is", value: "accepted" }] },
      }),
    );
    expect(screen.getByRole("tab", { name: "Match", selected: true })).toBeInTheDocument();
    const one = await screen.findByRole("region", { name: "One at a time" });
    expect(await within(one).findByRole("heading", { name: "Track 2" })).toBeInTheDocument();
    expect(bridge.getLibraryTrack).toHaveBeenCalledWith({ trackId: 2 });
    expect(bridge.getTrackMatches).toHaveBeenCalledWith({ trackId: 2 });
  });

  it("opens a disputed track in the disputed list", async () => {
    queue = [track(2, { match_state: "rejected", match_disputed: true })];
    renderOpened(2);
    const scope = await screen.findByRole("combobox", { name: "Show" });
    await waitFor(() => expect(scope).toHaveValue("disputed"));
  });

  it("lets go of the track once the reviewer moves on", async () => {
    renderOpened(2);
    const one = await screen.findByRole("region", { name: "One at a time" });
    expect(await within(one).findByRole("heading", { name: "Track 2" })).toBeInTheDocument();
    fireEvent.click(within(one).getByRole("button", { name: /^Skip for now/ }));
    // Skipping goes on from where the link put the cursor; the link is not applied again.
    expect(await within(one).findByRole("heading", { name: "Track 3" })).toBeInTheDocument();
    expect(screen.getByLabelText("Show")).toHaveValue("accepted");
  });

  it("ignores a location that carries no track", () => {
    expect(cleanOpening({ state: { cuepointCleanTrack: "2" }, key: "k" })).toBeNull();
    expect(cleanOpening({ state: { cuepointCleanTrack: 0 }, key: "k" })).toBeNull();
    expect(cleanOpening({ state: null, key: "k" })).toBeNull();
    expect(cleanOpening({ state: cleanTrackState(4), key: "k" })).toEqual({ trackId: 4, token: "k" });
  });
});

describe("a playlist's own Match (C22)", () => {
  it("starts one run over that playlist, named by it, and says it started", async () => {
    renderClean(undefined, "playlists");
    await startMatching("Peak time");
    await waitFor(() => expect(bridge.startCleanMatch).toHaveBeenCalledTimes(1));
    expect(bridge.startCleanMatch).toHaveBeenCalledWith({
      selection: {
        query: {
          filters: {
            match: "all",
            rules: [{ field: "in_playlist", operator: "any_of", value: [{ kind: "playlist", id: 10 }] }],
          },
        },
      },
      rematch: false,
      label: "Peak time",
    });
    expect(await screen.findByText(/^Matching 2 tracks on Beatport/)).toBeInTheDocument();
  });

  it("matches again, as a rematch, a playlist with nothing left to look up", async () => {
    renderClean(undefined, "playlists");
    await startMatching("Closing");
    await waitFor(() =>
      expect(bridge.startCleanMatch).toHaveBeenCalledWith({
        selection: {
          query: {
            filters: {
              match: "all",
              rules: [{ field: "in_playlist", operator: "any_of", value: [{ kind: "playlist", id: 11 }] }],
            },
          },
        },
        rematch: true,
        label: "Closing",
      }),
    );
  });

  it("matches the whole library as the empty question, called Whole library", async () => {
    renderClean(undefined, "playlists");
    await startMatching();
    await waitFor(() =>
      expect(bridge.startCleanMatch).toHaveBeenCalledWith({
        selection: { query: {} },
        rematch: false,
        label: "Whole library",
      }),
    );
  });

  it("keeps Match available when the engine refuses it, and says why", async () => {
    bridge.startCleanMatch!.mockRejectedValue(new Error("Every track here is already matched"));
    renderClean(undefined, "playlists");
    await startMatching("Peak time");
    await screen.findByText("Every track here is already matched");
    expect(screen.getByRole("button", { name: "Match Peak time" })).toBeEnabled();
  });

  it("reads the rows again as the run starts, so its row shows the bar", async () => {
    renderClean(undefined, "playlists");
    await screen.findByText("Peak time");
    const reads = bridge.getCleanPlaylists!.mock.calls.length;
    await startMatching("Peak time");
    await waitFor(() => expect(bridge.getCleanPlaylists!.mock.calls.length).toBeGreaterThan(reads));
  });

  it("shows a running row's bar and a Stop that cancels its job", async () => {
    bridge.getCleanPlaylists!.mockResolvedValue({
      ...PLAYLISTS,
      playlists: PLAYLISTS.playlists.map((playlist) =>
        playlist.id === 13 ? { ...playlist, running: { job_id: "job-9", done: 12, total: 24 } } : playlist,
      ),
    });
    bridge.cancelJob = vi.fn().mockResolvedValue({ id: "job-9", state: "cancelled" });
    renderClean(undefined, "playlists");
    expect(await screen.findByText("Matching 12 of 24")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "hj progress" })).toHaveAttribute("value", "12");
    fireEvent.click(screen.getByRole("button", { name: "Stop matching hj" }));
    expect(bridge.cancelJob).toHaveBeenCalledWith("job-9");
  });

  it("opens Review N on One at a time, on that playlist's tracks to check", async () => {
    renderClean(undefined, "playlists");
    fireEvent.click(await screen.findByRole("button", { name: "Review 4 › for all" }));
    expect(await screen.findByRole("tab", { name: /^One at a time/ })).toHaveAttribute("aria-selected", "true");
    await waitFor(() => expect(lastBrowse()).toMatchObject({ playlistId: 14 }));
    expect(screen.getByRole("group", { name: "Reviewing" })).toHaveTextContent("Reviewing all");
  });

  it("opens Review N on the run the row's Match started, when it did in this session", async () => {
    const run = {
      job_id: "job-match",
      created_at: "2026-10-14T10:00:00Z",
      label: "Warmup",
      rematch: false,
      selected: 10,
      excluded: 0,
      planned: 10,
      done: 10,
      found: 6,
      waiting: 4,
      not_found: 0,
      rejected: 0,
      disputed: 0,
      status: "done",
      finished_at: "2026-10-14T10:01:00Z",
      latest_job_id: "job-match",
      resume_job_id: null,
    };
    bridge.getMatchJobs!.mockResolvedValue({ jobs: [run], total: 1 });
    // What the engine would say once the run has ended: Warmup has 4 to check and 6 sure.
    bridge.getCleanPlaylists!.mockResolvedValue({
      ...PLAYLISTS,
      playlists: PLAYLISTS.playlists.map((playlist) =>
        playlist.id === 12 ? { ...playlist, not_matched: 0, waiting: 4, accepted: 6 } : playlist,
      ),
    });
    renderClean(undefined, "playlists");
    await startMatching("Warmup");
    await waitFor(() => expect(bridge.startCleanMatch).toHaveBeenCalled());
    fireEvent.click(await screen.findByRole("button", { name: "Review 4 › for Warmup" }));
    await waitFor(() => expect(JSON.stringify(lastBrowse())).toContain("job-match"));
    expect(screen.getByRole("group", { name: "Reviewing" })).toHaveTextContent("Reviewing Warmup");
    expect(screen.getByRole("group", { name: "Reviewing" })).toHaveTextContent("6 already confirmed");
  });
});

describe("when a playlist's match ends somewhere else (C22)", () => {
  const RUN = {
    job_id: "job-match",
    created_at: "2026-10-14T10:00:00Z",
    label: "hj",
    rematch: false,
    selected: 24,
    excluded: 0,
    planned: 24,
    done: 24,
    found: 15,
    waiting: 9,
    not_found: 0,
    rejected: 0,
    disputed: 0,
    status: "done",
    finished_at: "2026-10-14T10:01:00Z",
    latest_job_id: "job-match",
    resume_job_id: null,
  };

  it("says it in a toast with Review 9, which opens One at a time on that run", async () => {
    bridge.getMatchJobs!.mockResolvedValue({ jobs: [RUN], total: 1 });
    renderClean(undefined, "playlists");
    await startMatching("hj");
    // The person leaves the rows for another tab while it runs.
    fireEvent.click(screen.getByRole("tab", { name: "Past searches" }));
    expect(await screen.findByText("hj matched · 15 confirmed · 9 to check")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Review 9" }));
    expect(await screen.findByRole("group", { name: "Reviewing" })).toHaveTextContent("Reviewing hj");
    await waitFor(() => expect(JSON.stringify(lastBrowse())).toContain("job-match"));
  });

  it("does not repeat in a toast what the row already says, when the rows are in view", async () => {
    bridge.getMatchJobs!.mockResolvedValue({ jobs: [RUN], total: 1 });
    renderClean(undefined, "playlists");
    await startMatching("hj");
    await waitFor(() => expect(bridge.getJob).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByText(/matched ·/)).toBeNull();
    expect(screen.queryByText("Matching finished.")).toBeNull();
  });
});

describe("Save to files (C23)", () => {
  const UNSAVED_RULE = { field: "unsaved_values", operator: "is", value: true };

  function withSaving(unsaved: number) {
    bridge.getUnsavedValues = vi.fn().mockResolvedValue({ tracks: unsaved, fields: {} });
    bridge.previewTagWrite = vi.fn(() => new Promise(() => {}));
    bridge.startTagWrite = vi.fn();
  }

  it("draws no bar when every value is in the files", async () => {
    withSaving(0);
    renderClean(undefined, "playlists");
    await waitFor(() => expect(bridge.getUnsavedValues).toHaveBeenCalled());
    // Let the answer land before asking whether a bar was drawn for it.
    await act(async () => {});
    expect(screen.queryByRole("region", { name: "Save to files" })).toBeNull();
  });

  it("opens See changes on the list of changes", async () => {
    withSaving(47);
    renderClean(undefined, "playlists");
    const bar = await screen.findByRole("region", { name: "Save to files" });
    fireEvent.click(within(bar).getByRole("button", { name: "See changes" }));
    const dialog = await screen.findByRole("dialog", { name: "Save 47 tracks to your files" });
    expect(within(dialog).getByRole("button", { name: /Back/ })).toBeInTheDocument();
  });

  it("opens the Whole library row's Save on every unsaved track", async () => {
    withSaving(47);
    bridge.getCleanPlaylists!.mockResolvedValue({
      ...PLAYLISTS,
      whole_library: { ...PLAYLISTS.whole_library, not_matched: 0, accepted: 50, unsaved: 47 },
    });
    renderClean(undefined, "playlists");
    fireEvent.click(await screen.findByRole("button", { name: "Save 47 to files… for Whole library" }));
    expect(await screen.findByRole("dialog", { name: "Save 47 tracks to your files" })).toBeInTheDocument();
    await waitFor(() =>
      expect(bridge.previewTagWrite).toHaveBeenCalledWith(
        expect.objectContaining({
          selection: { query: { filters: { match: "all", rules: [UNSAVED_RULE] } } },
        }),
      ),
    );
  });

  it.each(["review", "missing", "duplicates"])("shows the bar on %s and opens the window on every unsaved track", async (section) => {
    withSaving(47);
    renderClean(section);
    const bar = await screen.findByRole("region", { name: "Save to files" });
    fireEvent.click(within(bar).getByRole("button", { name: "Save to files…" }));
    expect(await screen.findByRole("dialog", { name: "Save 47 tracks to your files" })).toBeInTheDocument();
    await waitFor(() =>
      expect(bridge.previewTagWrite).toHaveBeenCalledWith(
        expect.objectContaining({
          selection: { query: { filters: { match: "all", rules: [UNSAVED_RULE] } } },
        }),
      ),
    );
  });

  it("opens a playlist's Save N to files… on that playlist's unsaved tracks", async () => {
    withSaving(47);
    bridge.getCleanPlaylists!.mockResolvedValue({
      ...PLAYLISTS,
      playlists: PLAYLISTS.playlists.map((entry) =>
        entry.id === 11 ? { ...entry, unsaved: 6 } : entry.id === 14 ? { ...entry, waiting: 0, unsaved: 2 } : entry,
      ),
    });
    renderClean(undefined, "playlists");
    fireEvent.click(await screen.findByRole("button", { name: "Save 6 to files… for Closing" }));
    expect(await screen.findByRole("dialog", { name: "Save 6 tracks to your files" })).toBeInTheDocument();
    await waitFor(() =>
      expect(bridge.previewTagWrite).toHaveBeenCalledWith(
        expect.objectContaining({
          selection: {
            query: {
              filters: {
                match: "all",
                rules: [
                  UNSAVED_RULE,
                  { field: "in_playlist", operator: "any_of", value: [{ kind: "playlist", id: 11 }] },
                ],
              },
            },
          },
        }),
      ),
    );

    // Closed and opened on another playlist: a new window, reading that playlist's files.
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Save 2 to files… for all" }));
    expect(await screen.findByRole("dialog", { name: "Save 2 tracks to your files" })).toBeInTheDocument();
    await waitFor(() => expect(bridge.previewTagWrite).toHaveBeenCalledTimes(2));
    expect(bridge.previewTagWrite.mock.calls[1]![0].selection.query.filters.rules[1].value).toEqual([
      { kind: "playlist", id: 14 },
    ]);
  });
});

describe("the match window, opened from elsewhere (FLW-13)", () => {
  function Opened() {
    const location = useLocation();
    return <CleanScreen matchWith={cleanMatchOpening(location)} />;
  }

  function renderOpened(state: unknown) {
    return render(
      <ScaleProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={[{ pathname: "/clean", state }]}>
            <Routes>
              <Route path="/clean" element={<Opened />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </ScaleProvider>,
    );
  }

  it("opens the match window with the tracks the Library passed, chosen", async () => {
    renderOpened(cleanMatchState([1, 2]));
    const dialog = await screen.findByRole("dialog", { name: "Match tracks" });
    expect(within(dialog).getByRole("radio", { name: /^The 2 tracks you chose/ })).toBeChecked();
    fireEvent.click(within(dialog).getByRole("button", { name: /^Match / }));
    await waitFor(() =>
      expect(bridge.startCleanMatch).toHaveBeenCalledWith({
        selection: { track_ids: [1, 2] },
        rematch: false,
        label: "2 chosen tracks",
      }),
    );
  });

  it("opens it on the tracks not looked up yet when no tracks come with the link", async () => {
    bridge.getLibraryHealth!.mockResolvedValue(UNTOUCHED);
    renderOpened(cleanMatchState());
    const dialog = await screen.findByRole("dialog", { name: "Match tracks" });
    expect(within(dialog).getByRole("radio", { name: /^Tracks not looked up yet/ })).toBeChecked();
  });
});

describe("opening a part from somewhere else (EXPORT-07)", () => {
  function Opened() {
    const location = useLocation();
    return <CleanScreen openSection={cleanSectionOpening(location)} />;
  }

  function renderOpened() {
    return render(
      <ScaleProvider>
        <ToastProvider>
          <MemoryRouter
            initialEntries={[{ pathname: "/clean", state: cleanSectionState("missing") }]}
          >
            <Routes>
              <Route path="/clean" element={<Opened />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </ScaleProvider>,
    );
  }

  it("opens Missing files, whatever part was used last, and does not remember it", async () => {
    localStorage.setItem(CLEAN_SECTION_STORAGE_KEY, "duplicates");
    renderOpened();

    expect(await screen.findByRole("tab", { name: "Missing files", selected: true })).toBeInTheDocument();
    expect(await screen.findByText(/right-click the track/)).toBeInTheDocument();
    expect(localStorage.getItem(CLEAN_SECTION_STORAGE_KEY)).toBe("duplicates");
  });

  it("ignores a location that carries no part, or one that is not a part", () => {
    expect(cleanSectionOpening({ state: { cuepointCleanSection: "exports" }, key: "k" })).toBeNull();
    // The two parts K3 removed are not parts here; `cleanRedirect` sends them elsewhere.
    expect(cleanSectionOpening({ state: { cuepointCleanSection: "health" }, key: "k" })).toBeNull();
    expect(cleanSectionOpening({ state: { cuepointCleanSection: "fix" }, key: "k" })).toBeNull();
    expect(cleanSectionOpening({ state: { cuepointCleanSection: 2 }, key: "k" })).toBeNull();
    expect(cleanSectionOpening({ state: null, key: "k" })).toBeNull();
    expect(cleanSectionOpening({ state: cleanTrackState(4), key: "k" })).toBeNull();
    expect(cleanSectionOpening({ state: cleanSectionState("missing"), key: "k" })).toEqual({
      section: "missing",
      token: "k",
    });
  });
});

describe("the Inspector's links to the pages (DISCOVER-11)", () => {
  const CREDITS = {
    artists: [
      { kind: "artist", name: "Artist 1", role: "artist", ref: "name:artist 1", identity: "name" },
    ],
    remixers: [],
    label: null,
  };

  function renderWithInspector(section: string) {
    if (localStorage.getItem(MATCH_TAB_STORAGE_KEY) === null) localStorage.setItem(MATCH_TAB_STORAGE_KEY, "one");
    localStorage.setItem(CLEAN_SECTION_STORAGE_KEY, section);
    return render(
      <ScaleProvider>
        <ToastProvider>
          <InspectorSlotProvider>
            <MemoryRouter initialEntries={["/clean"]}>
              <Routes>
                <Route path="/clean" element={<CleanScreen />} />
                <Route path="*" element={<LocationProbe />} />
              </Routes>
            </MemoryRouter>
            <aside aria-label="Inspector">
              <InspectorSlotOutlet />
            </aside>
          </InspectorSlotProvider>
        </ToastProvider>
      </ScaleProvider>,
    );
  }

  it.each([
    ["review", null],
    ["missing", "Track 9"],
  ])("opens an artist's page from the %s Inspector", async (section, title) => {
    // The queue's own detail, with credits and CuePoint's layer added.
    const read = bridge.getLibraryTrack!.getMockImplementation() as (params: {
      trackId: number;
    }) => Promise<{ track: Record<string, unknown> } & Record<string, unknown>>;
    bridge.getLibraryTrack!.mockImplementation(async (params: { trackId: number }) => {
      const detail = await read(params);
      return {
        ...detail,
        track: { ...detail.track, artist: "Artist 1" },
        // The Inspector draws CuePoint's own layer, which the queue never needed.
        metadata: {
          track_id: params.trackId,
          rating: null,
          rekordbox_rating: null,
          effective_rating: null,
          rating_source: null,
          favorite: false,
          notes: null,
          created_at: null,
          updated_at: null,
        },
        credits: CREDITS,
      };
    });
    renderWithInspector(section);
    // One at a time shows the first track by itself; Missing files needs a row chosen.
    if (title) fireEvent.click(await screen.findByText(title));
    const inspector = screen.getByRole("complementary", { name: "Inspector" });
    fireEvent.click(await within(inspector).findByRole("button", { name: "Artist 1" }));
    const probe = await screen.findByTestId("location");
    expect(JSON.parse(probe.textContent ?? "{}").pathname).toBe("/discover/artist/name%3Aartist%201");
  });
});

describe("revisiting the page (C19d)", () => {
  it("revisit shows the old value immediately and refetches after an announce", async () => {
    const first = renderClean(undefined, "playlists");
    await screen.findByText("Peak time");
    await waitFor(() => expect(bridge.getLibraryHealth!).toHaveBeenCalled());
    first.unmount();

    const reads = () => ({
      summary: bridge.getLibrarySummary!.mock.calls.length,
      health: bridge.getLibraryHealth!.mock.calls.length,
      playlists: bridge.getCleanPlaylists!.mock.calls.length,
    });
    const before = reads();

    renderClean(undefined, "playlists");
    // The first render: no "Reading your library…", the rows are already there.
    expect(screen.queryByText("Reading your library…")).toBeNull();
    expect(screen.getByText("Peak time")).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(reads()).toEqual(before);

    bridge.getCleanPlaylists!.mockResolvedValue({
      ...PLAYLISTS,
      playlists: [{ id: 10, name: "Peak hour", path: "Techno", ...COUNTS }],
    });
    act(() => announceLibraryChange());
    expect(await screen.findByText("Peak hour")).toBeInTheDocument();
    await waitFor(() =>
      expect(reads()).toEqual({
        summary: before.summary + 1,
        health: before.health + 1,
        playlists: before.playlists + 1,
      }),
    );
  });
});
