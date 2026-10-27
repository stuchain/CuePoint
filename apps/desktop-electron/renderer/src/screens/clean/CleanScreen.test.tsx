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
import { Activity } from "react";
import { announceLibraryChange } from "../../api/libraryChanges";
import { ToastProvider } from "../../components";
import { getSelectedTrack, setSelectedTrack } from "../../components/shell/selectedTrack";
import { InspectorSlotOutlet, InspectorSlotProvider } from "../../components/shell";
import { ScaleProvider } from "../../tokens/ScaleContext";
import { quoted } from "../../format/words";
import { IMPORT_COLLECTION_LABEL } from "../../components/EmptyState";
import { importOpening } from "../library/libraryLink";
import { CleanScreen } from "./CleanScreen";
import fixture from "./cleanEmpty.fixture.json";
import { CLEAN_SECTION_STORAGE_KEY } from "./cleanSections";
import {
  CANDIDATES,
  browseAnswer,
  matchesFor,
  reviewOf,
  reviewTrack,
  run,
  ruleOf,
  stateFor,
  track,
} from "../../test/matchFixtures";
import { MATCH_TAB_STORAGE_KEY } from "./match/matchTab";
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
    { id: 10, name: "Peak time", path: "Techno", ...COUNTS, synced: false, synced_at: null },
    {
      id: 11,
      name: "Closing",
      path: "",
      ...COUNTS,
      not_matched: 0,
      accepted: 10,
      synced: true,
      synced_at: "2020-03-04T10:00:00",
    },
    { id: 12, name: "Warmup", path: "", ...COUNTS, synced: false, synced_at: null },
    { id: 13, name: "hj", path: "", ...COUNTS, synced: false, synced_at: null },
    { id: 14, name: "all", path: "", ...COUNTS, not_matched: 0, waiting: 4, synced: false, synced_at: null },
  ],
};

type Fn = ReturnType<typeof vi.fn>;
let bridge: Record<string, Fn>;
let queue: LibraryTrackRow[];
let missing: LibraryTrackRow[];
/** What the Review list holds: every track of the run being reviewed. */
let review: ReturnType<typeof reviewTrack>[];

function install(overrides: Record<string, Fn> = {}) {
  queue = [track(1), track(2), track(3)];
  review = [reviewTrack(1, "to_check"), reviewTrack(2, "matched"), reviewTrack(3, "not_found")];
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
    getMatchReview: vi.fn(async () => reviewOf(review)),
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

function lastBrowse(): Record<string, unknown> {
  const calls = bridge.browseLibrary!.mock.calls;
  return calls[calls.length - 1]![0] as Record<string, unknown>;
}

function LocationProbe() {
  const location = useLocation();
  return (
    <pre data-testid="location">
      {JSON.stringify({ pathname: location.pathname, state: location.state })}
    </pre>
  );
}

/** `tab` is the Match sub-tab to open on; Playlists is the default (C22). */
function renderClean(section?: string, tab: string | null = null) {
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

/** Tick a playlist (or the whole library) and press Match (C22): the only way to start a match. */
async function startMatching(name = "All tracks") {
  fireEvent.click(await screen.findByRole("checkbox", { name: `Match ${name}` }));
  fireEvent.click(screen.getByRole("button", { name: "Match ticked playlists" }));
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
      // The Match area's own sub-tabs: no One at a time and no Table, the review list is their job.
      "Playlists",
      "Past matches",
    ]);
    expect(screen.getByRole("tab", { name: "Match" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Playlists" })).toHaveAttribute("aria-selected", "true");
    expect(await screen.findByRole("table", { name: /Your playlists/ })).toBeInTheDocument();
    expect(await screen.findByText("Peak time")).toBeInTheDocument();
    // The page's strip is named and controls the panel under it (M474).
    expect(screen.getByRole("tablist", { name: "Clean views" })).toBeInTheDocument();
    const match = screen.getByRole("tab", { name: "Match" });
    expect(document.getElementById(match.getAttribute("aria-controls")!)).toHaveAttribute("aria-labelledby", match.id);
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
      expect(tabs.map((tab) => tab.getAttribute("aria-label") ?? tab.textContent)).toEqual([
        "Match, 42",
        "Missing files, 3",
        "Duplicates",
        "Playlists",
        "Past matches",
      ]),
    );
  });

  it("opens no part with a paragraph: the tab names and the buttons say what it is for (C15b)", async () => {
    renderClean();
    await screen.findByRole("table", { name: /Your playlists/ });
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

  it("has no header button and no save bar: a tick per playlist and one Match button start a match (K4, C22)", async () => {
    renderClean(undefined, "playlists");
    const header = await screen.findByTestId("clean-header");
    expect(within(header).getByRole("heading", { level: 1, name: "Clean" })).toBeInTheDocument();
    await screen.findByText("Peak time");
    expect(within(header).queryByRole("button")).toBeNull();
    for (const name of ["All tracks", "Peak time", "Closing", "Warmup", "hj", "all"]) {
      expect(screen.getByRole("checkbox", { name: `Match ${name}` })).toBeEnabled();
      expect(screen.queryByRole("button", { name: `Match ${name}` })).toBeNull();
    }
    expect(screen.getByRole("button", { name: "Match ticked playlists" })).toBeDisabled();
    expect(screen.queryByRole("region", { name: "Save to files" })).toBeNull();
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
    await screen.findByText("No library yet");
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
  it("holds Save review list as a file… beside each past search, not in the header (CLN-11, K12)", async () => {
    renderClean();
    await screen.findByText("Peak time");
    const header = screen.getByTestId("clean-header");
    expect(within(header).queryByRole("button", { name: /Save review list/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Export review list/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Save review list/ })).toBeNull();

    bridge.getMatchJobs!.mockResolvedValue({
      jobs: [run({ job_id: "job-1", label: 'Playlist "all"' })],
      total: 1,
    });
    fireEvent.click(screen.getByRole("tab", { name: "Past matches" }));
    fireEvent.click(await screen.findByRole("button", { name: `More for ${quoted('Playlist "all"')}` }));
    expect(screen.getByRole("menuitem", { name: "Save review list…" })).toBeInTheDocument();
  });

  it("matches the chosen tracks as a job, names the run, and says what it left out", async () => {
    renderClean(undefined, "playlists");
    await startMatching();

    await waitFor(() =>
      expect(bridge.startCleanMatch).toHaveBeenCalledWith({
        selection: { query: {} },
        rematch: false,
        label: "All tracks",
      }),
    );
    // The started message ("Matching 2 tracks on Beatport. 1 …left out.", see cleanFormat.test.ts) is
    // closed as the match ends, which here is at once.
    await waitFor(() => expect(screen.queryByText(/^Matching 2 tracks on Beatport/)).toBeNull());
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

  it("shows a running match in the playlist's row, not in a line above the tabs (CLN-7, C22)", async () => {
    // The job never ends until released, so the row can be read while it runs.
    const releases: Array<() => void> = [];
    bridge.getJob!.mockImplementation(
      () =>
        new Promise((resolve) => {
          releases.push(() => resolve({ id: "job", state: "succeeded" }));
        }),
    );
    bridge.cancelJob = vi.fn().mockResolvedValue({ id: "job-match", state: "cancelled" });
    renderClean(undefined, "playlists");
    await screen.findByText("Peak time");
    await startMatching("Peak time");

    await waitFor(() => expect(releases.length).toBeGreaterThan(1));
    expect(screen.queryByRole("region", { name: "Matching" })).toBeNull();
    act(() => releases.forEach((release) => release()));
  });

  it("says how far a match already running has got, and for what, when the page is opened (CLN-7, C22)", async () => {
    bridge.listJobs = vi.fn().mockResolvedValue({
      jobs: [
        {
          id: "job-1",
          type: "clean_match",
          state: "running",
          progress: { completed_tracks: 11, total_tracks: 24, elapsed_time: 110 },
        },
      ],
      active_count: 1,
    });
    // The engine puts the job on the hj row: that is its name, though this page did not start it.
    bridge.getCleanPlaylists!.mockResolvedValue({
      ...PLAYLISTS,
      playlists: PLAYLISTS.playlists.map((playlist) =>
        playlist.id === 13 ? { ...playlist, running: { job_id: "job-1", done: 11, total: 24 } } : playlist,
      ),
    });
    renderClean(undefined, "past");
    // Progress is in the hj row (its own bar, count and time left), not in a line above the tabs.
    fireEvent.click(await screen.findByRole("tab", { name: "Playlists" }));
    const row = (await screen.findByText("hj")).closest("tr")!;
    await waitFor(() => expect(row).toHaveTextContent("11 of 24"));
    expect(row).toHaveTextContent("about 2 minutes left");
    expect(within(row).getByRole("button", { name: "Stop matching hj" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Matching" })).toBeNull();

    // A second match queues behind the running one (M510): Match stays available.
    fireEvent.click(await screen.findByRole("checkbox", { name: "Match Peak time" }));
    expect(screen.getByRole("button", { name: "Match ticked playlists" })).toBeEnabled();
  });

  it("says why the engine refused a match", async () => {
    bridge.startCleanMatch!.mockRejectedValue(new Error("Every track here is already matched"));
    renderClean(undefined, "playlists");
    await startMatching();
    expect(await screen.findByText("Every track here is already matched")).toBeInTheDocument();
  });

  it("offers to resume a search that stopped, and resumes only what was left (CLEAN-14)", async () => {
    const stopped = run({
      job_id: "job-old",
      label: "All tracks",
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
    // Resume is in the run's one menu (M150).
    fireEvent.click(await screen.findByRole("button", { name: `More for ${quoted("All tracks")}` }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Resume" }));

    await waitFor(() =>
      expect(bridge.resumeCleanMatch).toHaveBeenCalledWith({ job_id: "job-old-2" }),
    );
    expect(bridge.startCleanMatch).not.toHaveBeenCalled();
    await screen.findByText("Matching finished");
    // The started message goes by itself when the match ends (it used to stay until closed).
    await waitFor(() => expect(screen.queryByText("Matching 2 tracks on Beatport")).toBeNull());
  });

  it("matches a past search again, under its own name", async () => {
    bridge.getMatchJobs!.mockResolvedValue({
      jobs: [run({ job_id: "job-1", label: 'Playlist "Friday"' })],
      total: 1,
    });
    localStorage.setItem(MATCH_TAB_STORAGE_KEY, "past");
    renderClean();
    fireEvent.click(await screen.findByRole("button", { name: `More for ${quoted('Playlist "Friday"')}` }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Match again" }));
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
    fireEvent.click(await screen.findByRole("button", { name: /^More for \u201cp+\u201d$/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Match again" }));
    await waitFor(() => expect(bridge.startCleanMatch).toHaveBeenCalled());
    const sent = bridge.startCleanMatch!.mock.calls[0]![0] as { label: string };
    expect(sent.label).toBe(`${"p".repeat(199)}…`);
    expect(sent.label).toHaveLength(200);
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

  it("gives the fix in steps, and checks Rekordbox for changes here, without leaving (CLN-8, M157)", async () => {
    renderClean("missing");
    const steps = await screen.findByRole("list", { name: "How to fix a missing file" });
    const items = within(steps).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent("In Rekordbox, right-click the track, choose Relocate and point it at the file.");
    expect(items[1]).toHaveTextContent("In Rekordbox, choose File, then Export Collection in XML format, saving over");
    expect(items[2]).toHaveTextContent("Here, Check for changes.");

    bridge.startLibraryRefreshPreview = vi.fn().mockResolvedValue({ job_id: "job-preview", id: "job-preview", state: "queued" });
    fireEvent.click(within(items[2]!).getByRole("button", { name: "Check for changes" }));
    await waitFor(() => expect(bridge.startLibraryRefreshPreview).toHaveBeenCalledWith({}));
    expect(screen.getByRole("list", { name: "How to fix a missing file" })).toBeInTheDocument();
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
    expect(await screen.findByText("Checking 1 track")).toBeInTheDocument();
    await waitFor(() => expect(bridge.browseLibrary!.mock.calls.length).toBeGreaterThan(before));
  });

  it("says files were never checked, from the engine's own answer", async () => {
    bridge.getLibraryHealth!.mockResolvedValue(UNTOUCHED);
    bridge.browseLibrary!.mockResolvedValue(
      fixture.untouched.missing_files as LibrarySearchResponse,
    );
    renderClean("missing");
    expect(await screen.findByText("Files have not been checked yet")).toBeInTheDocument();
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
    expect(await screen.findByText("No missing files at the last check")).toBeInTheDocument();
    expect(screen.getByText(/^All 3 files were where your library says/)).toBeInTheDocument();
  });
});

describe("duplicates", () => {
  it("lists each group with its signal and its tracks", async () => {
    renderClean("duplicates");
    const group = await screen.findByRole("listitem", { name: /Twin.*2 tracks/ });
    // Titled by its first track; each member is a row of its own (D18).
    expect(within(group).getByRole("heading", { name: /^Twin \u00b7 Artist/ })).toBeInTheDocument();
    expect(within(group).getAllByRole("listitem")).toHaveLength(2);
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

  it("keeps one track of a group without deleting anything, and can undo it (M153)", async () => {
    bridge.keepDuplicateTrack = vi.fn().mockResolvedValue({ group: { ...GROUP, dismissed: true }, kept_track_id: 7 });
    renderClean("duplicates");
    fireEvent.click((await screen.findAllByRole("button", { name: /^Keep Twin/ }))[0]!);
    await waitFor(() => expect(bridge.keepDuplicateTrack).toHaveBeenCalledWith({ group_id: 55, track_id: 7 }));
    expect(await screen.findByText(/Nothing was deleted/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Undo" })).toBeInTheDocument();
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
    expect(await screen.findByText("Duplicates have not been looked for yet")).toBeInTheDocument();
    const offers = screen.getAllByRole("button", { name: "Check for duplicates" });
    fireEvent.click(offers[offers.length - 1]!);
    await waitFor(() => expect(bridge.startDuplicateScan).toHaveBeenCalledWith({}));
    await waitFor(() => expect(bridge.getDuplicateGroups).toHaveBeenCalledTimes(2));
  });

  it("says none were found after a scan", async () => {
    bridge.getLibraryHealth!.mockResolvedValue(fixture.scanned.health as LibraryHealth);
    bridge.getDuplicateGroups!.mockResolvedValue(fixture.scanned.duplicates);
    renderClean("duplicates");
    expect(await screen.findByText("No duplicates found")).toBeInTheDocument();
    // The full empty state with its icon, as Missing files shows (C140).
    const state = screen.getByText("No duplicates found").closest(".cp-empty-state");
    expect(state).not.toHaveClass("cp-empty-state--compact");
    expect(state?.querySelector(".cp-empty-state__icon")).not.toBeNull();
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

  it("opens the library's review on that track's details, whatever part and sub-tab was last used", async () => {
    review = [reviewTrack(1, "to_check"), reviewTrack(2, "matched"), reviewTrack(3, "to_check")];
    localStorage.setItem(CLEAN_SECTION_STORAGE_KEY, "missing");
    localStorage.setItem(MATCH_TAB_STORAGE_KEY, "past");
    renderOpened(2);

    expect(await screen.findByRole("tab", { name: "Match", selected: true })).toBeInTheDocument();
    expect(await screen.findByRole("region", { name: "Review All tracks" })).toBeInTheDocument();
    const panel = await screen.findByRole("complementary", { name: /^Candidates for / });
    expect(panel).toHaveTextContent("Track 2");
    expect(bridge.getMatchReview).toHaveBeenCalledWith({ limit: 2000 });
    await waitFor(() => expect(bridge.getTrackMatches).toHaveBeenCalledWith({ trackId: 2 }));
  });

  it("ignores a location that carries no track", () => {
    expect(cleanOpening({ state: { cuepointCleanTrack: "2" }, key: "k" })).toBeNull();
    expect(cleanOpening({ state: { cuepointCleanTrack: 0 }, key: "k" })).toBeNull();
    expect(cleanOpening({ state: null, key: "k" })).toBeNull();
    expect(cleanOpening({ state: cleanTrackState(4), key: "k" })).toEqual({ trackId: 4, token: "k" });
  });
});

describe("matching what is ticked (C22)", () => {
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
    await waitFor(() => expect(screen.queryByText(/^Matching 2 tracks on Beatport/)).toBeNull());
  });

  it("starts one run over several ticked playlists, named by how many", async () => {
    renderClean(undefined, "playlists");
    fireEvent.click(await screen.findByRole("checkbox", { name: "Match Peak time" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Match Warmup" }));
    fireEvent.click(screen.getByRole("button", { name: "Match ticked playlists" }));
    await waitFor(() => expect(bridge.startCleanMatch).toHaveBeenCalledTimes(1));
    expect(bridge.startCleanMatch).toHaveBeenCalledWith({
      selection: {
        query: {
          filters: {
            match: "all",
            rules: [
              {
                field: "in_playlist",
                operator: "any_of",
                value: [
                  { kind: "playlist", id: 10 },
                  { kind: "playlist", id: 12 },
                ],
              },
            ],
          },
        },
      },
      rematch: false,
      label: "2 playlists",
    });
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

  it("matches the whole library as the empty question, called All tracks, and only it", async () => {
    renderClean(undefined, "playlists");
    fireEvent.click(await screen.findByRole("checkbox", { name: "Match Peak time" }));
    await startMatching();
    await waitFor(() =>
      expect(bridge.startCleanMatch).toHaveBeenCalledWith({
        selection: { query: {} },
        rematch: false,
        label: "All tracks",
      }),
    );
  });

  it("keeps the playlists tickable when the engine refuses it, and says why", async () => {
    bridge.startCleanMatch!.mockRejectedValue(new Error("Every track here is already matched"));
    renderClean(undefined, "playlists");
    await startMatching("Peak time");
    await screen.findByText("Every track here is already matched");
    expect(screen.getByRole("checkbox", { name: "Match Peak time" })).toBeEnabled();
  });

  it("reads the rows again as the run starts, so its row shows the bar", async () => {
    renderClean(undefined, "playlists");
    await screen.findByText("Peak time");
    const reads = bridge.getCleanPlaylists!.mock.calls.length;
    await startMatching("Peak time");
    await waitFor(() => expect(bridge.getCleanPlaylists!.mock.calls.length).toBeGreaterThan(reads));
  });

  it("gives the running row its own bar, count and Stop", async () => {
    bridge.getCleanPlaylists!.mockResolvedValue({
      ...PLAYLISTS,
      playlists: PLAYLISTS.playlists.map((playlist) =>
        playlist.id === 13 ? { ...playlist, running: { job_id: "job-9", done: 12, total: 24 } } : playlist,
      ),
    });
    renderClean(undefined, "playlists");
    expect(await screen.findByText(/12 of 24/)).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Matching hj" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Stop matching hj" })).toBeInTheDocument();
  });

  it("opens Review on that playlist's tracks, all of them, in a tab named for it", async () => {
    renderClean(undefined, "playlists");
    fireEvent.click(await screen.findByRole("button", { name: /^Review all/ }));
    expect(await screen.findByRole("region", { name: /^Review all/ })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /^Review/ })).toBeNull();
    await waitFor(() => expect(bridge.getMatchReview).toHaveBeenCalledWith({ playlistId: 14, limit: 2000 }));
    expect(await screen.findByRole("region", { name: /^Review all/ })).toHaveTextContent(/3 tracks \u00b7 2 ticked to sync/);
    // Every track, not only the ones to check.
    expect(await screen.findByText("Track 3 · Artist 3")).toBeInTheDocument();
  });

  it("opens the whole library's review, to sync every ticked track of the collection", async () => {
    // The whole library row says "4 to check", the way to its review, once anything waits (M146).
    bridge.getCleanPlaylists!.mockResolvedValue({
      ...PLAYLISTS,
      whole_library: { ...PLAYLISTS.whole_library, not_matched: 0, accepted: 46, waiting: 4 },
    });
    renderClean(undefined, "playlists");
    fireEvent.click(await screen.findByRole("button", { name: /^Review All tracks/ }));
    expect(await screen.findByRole("region", { name: "Review All tracks" })).toBeInTheDocument();
    await waitFor(() => expect(bridge.getMatchReview).toHaveBeenCalledWith({ limit: 2000 }));
    bridge.correctMatches = vi.fn().mockResolvedValue({ applied: { batch_id: "values", changed: 2 } });
    fireEvent.click(await screen.findByRole("button", { name: "Sync to files…" }));
    // The Sync window reads the ticked tracks of the whole collection, with no playlist or run named.
    await waitFor(() => expect(bridge.getMatchReview).toHaveBeenCalledWith({ tickedIds: true }));
  });
});

describe("when a match ends (C22)", () => {
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
    search_failed: 0,
    status: "done",
    finished_at: "2026-10-14T10:01:00Z",
    latest_job_id: "job-match",
    resume_job_id: null,
  };

  it("lands on a review of each playlist matched when the person is on Clean, saying nothing in a toast", async () => {
    bridge.getMatchJobs!.mockResolvedValue({ jobs: [RUN], total: 1 });
    renderClean(undefined, "playlists");
    fireEvent.click(await screen.findByRole("checkbox", { name: "Match hj" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Match Warmup" }));
    fireEvent.click(screen.getByRole("button", { name: "Match ticked playlists" }));
    // The first of them is opened.
    expect(await screen.findByRole("region", { name: "Review Warmup" }, { timeout: 3000 })).toBeInTheDocument();
    // One review at a time (D13): the first playlist, with no tab for any.
    expect(screen.queryByRole("tab", { name: /^Review/ })).toBeNull();
    expect(bridge.getMatchReview).toHaveBeenCalledWith({ playlistId: 12, limit: 2000 });
    expect(screen.queryByText(/matched ·/)).toBeNull();
    expect(screen.queryByText("Matching finished")).toBeNull();
  });

  it("lands on only the whole library's review for a whole-library match", async () => {
    bridge.getMatchJobs!.mockResolvedValue({ jobs: [{ ...RUN, label: "All tracks" }], total: 1 });
    renderClean(undefined, "playlists");
    await startMatching();
    expect(await screen.findByRole("region", { name: "Review All tracks" }, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /^Review/ })).toBeNull();
  });

  it("does not land over a review whose panel is open: a toast says it instead", async () => {
    bridge.getMatchJobs!.mockResolvedValue({ jobs: [RUN], total: 1 });
    const releases: Array<() => void> = [];
    bridge.getJob!.mockImplementation(
      () =>
        new Promise((resolve) => {
          releases.push(() => resolve({ id: "job", state: "succeeded" }));
        }),
    );
    renderClean(undefined, "playlists");
    await startMatching("hj");
    // While it runs, the person reviews another playlist and opens a track's panel.
    fireEvent.click(await screen.findByRole("button", { name: /^Review all/ }));
    await screen.findByRole("region", { name: /^Review all/ });
    const row = (await screen.findAllByRole("row")).find((entry) => entry.getAttribute("data-track-id") === "1")!;
    fireEvent.click(row);
    await screen.findByRole("complementary", { name: /^Candidates for / });

    await waitFor(() => expect(releases.length).toBeGreaterThan(1));
    act(() => releases.forEach((release) => release()));
    expect(await screen.findByText("hj matched · 15 confirmed · 9 to check")).toBeInTheDocument();
    // What is being read stays; Review on the toast is the way to the new one.
    expect(screen.getByRole("region", { name: /^Review all/ })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Review hj" })).toBeNull();
    expect(screen.getByRole("complementary", { name: /^Candidates for / })).toBeInTheDocument();
  });

  it("says it in a toast with Review from another part of Clean, which opens the playlist's review", async () => {
    bridge.getMatchJobs!.mockResolvedValue({ jobs: [RUN], total: 1 });
    // The job ends only when released, so the person can leave first.
    const releases: Array<() => void> = [];
    bridge.getJob!.mockImplementation(
      () =>
        new Promise((resolve) => {
          releases.push(() => resolve({ id: "job", state: "succeeded" }));
        }),
    );
    renderClean(undefined, "playlists");
    await startMatching("hj");
    fireEvent.click(await screen.findByRole("tab", { name: "Missing files" }));
    await waitFor(() => expect(releases.length).toBeGreaterThan(1));
    act(() => releases.forEach((release) => release()));
    expect(await screen.findByText("hj matched · 15 confirmed · 9 to check")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    expect(await screen.findByRole("region", { name: "Review hj" })).toBeInTheDocument();
    await waitFor(() => expect(bridge.getMatchReview).toHaveBeenCalledWith({ playlistId: 13, limit: 2000 }));
  });
});

describe("a match that finds nothing", () => {
  const NOTHING = {
    job_id: "job-match",
    created_at: "2026-10-14T10:00:00Z",
    label: "hj",
    rematch: false,
    selected: 24,
    excluded: 0,
    planned: 24,
    done: 24,
    found: 0,
    waiting: 0,
    not_found: 24,
    rejected: 0,
    disputed: 0,
    search_failed: 0,
    status: "done",
    finished_at: "2026-10-14T10:01:00Z",
    latest_job_id: "job-match",
    resume_job_id: null,
  };

  it("shows a red note with the count and a way to see them, instead of landing on an empty review", async () => {
    bridge.getMatchJobs!.mockResolvedValue({ jobs: [NOTHING], total: 1 });
    renderClean(undefined, "playlists");
    await startMatching("hj");
    const note = await screen.findByRole("alert", undefined, { timeout: 3000 });
    expect(note).toHaveTextContent("hj: no Beatport match for 24 tracks");
    expect(note).toHaveTextContent("This usually means the search failed, not that the tracks are missing from Beatport.");
    expect(screen.queryByRole("tab", { name: /^Review/ })).toBeNull();

    // See the 24: the review of that playlist, where they show as not found.
    review = Array.from({ length: 24 }, (_, index) => reviewTrack(index + 1, "not_found"));
    fireEvent.click(within(note).getByRole("button", { name: "See the 24" }));
    expect(await screen.findByRole("region", { name: "Review hj" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/24 no match/)).toBeInTheDocument());
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("says failed searches as failed, and See them opens the review where they show as failed", async () => {
    const failed = { ...NOTHING, not_found: 0, search_failed: 24 };
    bridge.getMatchJobs!.mockResolvedValue({ jobs: [failed], total: 1 });
    renderClean(undefined, "playlists");
    await startMatching("hj");
    const note = await screen.findByRole("alert", undefined, { timeout: 3000 });
    expect(note).toHaveTextContent("hj: 24 searches failed");
    expect(note).not.toHaveTextContent("no Beatport match");

    review = Array.from({ length: 24 }, (_, index) => reviewTrack(index + 1, "search_failed"));
    fireEvent.click(within(note).getByRole("button", { name: "See the 24" }));
    expect(await screen.findByRole("region", { name: "Review hj" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/24 search failed/)).toBeInTheDocument());
  });

  it("is dismissed with Dismiss, and gone when the next match starts", async () => {
    bridge.getMatchJobs!.mockResolvedValue({ jobs: [NOTHING], total: 1 });
    renderClean(undefined, "playlists");
    await startMatching("hj");
    await screen.findByRole("alert", undefined, { timeout: 3000 });
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("alert")).toBeNull();

    // Another match that finds nothing says so again, but not before it has ended.
    const releases: Array<() => void> = [];
    bridge.getJob!.mockImplementation(
      () =>
        new Promise((resolve) => {
          releases.push(() => resolve({ id: "job", state: "succeeded" }));
        }),
    );
    await startMatching("Peak time");
    await waitFor(() => expect(bridge.startCleanMatch).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("alert")).toBeNull();
    await waitFor(() => expect(releases.length).toBeGreaterThan(1));
    act(() => releases.forEach((release) => release()));
    expect(await screen.findByRole("alert")).toHaveTextContent("Peak time: no Beatport match for 24 tracks");
  });

  it("keeps the note, with no toast saying it again, from another part of Clean", async () => {
    bridge.getMatchJobs!.mockResolvedValue({ jobs: [NOTHING], total: 1 });
    const releases: Array<() => void> = [];
    bridge.getJob!.mockImplementation(
      () =>
        new Promise((resolve) => {
          releases.push(() => resolve({ id: "job", state: "succeeded" }));
        }),
    );
    renderClean(undefined, "playlists");
    await startMatching("hj");
    fireEvent.click(await screen.findByRole("tab", { name: "Missing files" }));
    await waitFor(() => expect(releases.length).toBeGreaterThan(1));
    act(() => releases.forEach((release) => release()));
    const note = await screen.findByRole("alert");
    expect(note).toHaveTextContent("hj: no Beatport match for 24 tracks");
    // One place says it: the note above every part, not a toast beside it.
    expect(screen.getAllByText("hj: no Beatport match for 24 tracks")).toHaveLength(1);
    fireEvent.click(within(note).getByRole("button", { name: "See the 24" }));
    expect(await screen.findByRole("region", { name: "Review hj" })).toBeInTheDocument();
  });

  it("is not said on the row, which has a dash with nothing to check: where it stands is for Review", async () => {
    bridge.getCleanPlaylists!.mockResolvedValue({
      ...PLAYLISTS,
      playlists: PLAYLISTS.playlists.map((playlist) =>
        playlist.id === 13 ? { ...playlist, not_matched: 0, no_match: 10, accepted: 0 } : playlist,
      ),
    });
    renderClean(undefined, "playlists");
    const row = (await screen.findByText("hj")).closest("tr")!;
    expect(within(row).getAllByRole("cell")[4]).toHaveTextContent("—");
    expect(screen.queryByText("10 not found")).toBeNull();
    // The list says only what is in the files: Closing was synced.
    expect(screen.getByText("Synced Mar 4, 2020")).toBeInTheDocument();
  });
});

describe("after leaving the page and coming back", () => {
  it("says no match runs, when the run ended while the page was away", async () => {
    // The job's own follower never sees its end: the page was hidden, as another page is shown.
    bridge.getJob!.mockResolvedValue({ id: "job-match", state: "running" });
    const page = (mode: "visible" | "hidden") => (
      <ScaleProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={["/clean"]}>
            <Activity mode={mode}>
              <CleanScreen />
            </Activity>
          </MemoryRouter>
        </ToastProvider>
      </ScaleProvider>
    );
    localStorage.setItem(MATCH_TAB_STORAGE_KEY, "playlists");
    const view = render(page("visible"));
    await startMatching("Peak time");
    fireEvent.click(screen.getByRole("checkbox", { name: "Match Warmup" }));
    // While it runs, a second match is queued, not refused (M510).
    expect(screen.getByRole("button", { name: "Match ticked playlists" })).toBeEnabled();

    // Away, and the match ends there: the engine lists no running job.
    view.rerender(page("hidden"));
    view.rerender(page("visible"));

    expect(await screen.findByRole("button", { name: "Match ticked playlists" })).toBeEnabled();
  });
});

describe("no save bar on this page", () => {
  it("draws none on any part, whatever the files hold: syncing is per playlist, from its review", async () => {
    for (const section of ["review", "missing", "duplicates"]) {
      localStorage.clear();
      const view = renderClean(section);
      await screen.findByRole("tab", { name: "Match" });
      await act(async () => {});
      expect(screen.queryByRole("region", { name: "Save to files" })).toBeNull();
      view.unmount();
    }
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
    const dialog = await screen.findByRole("dialog", { name: "Match on Beatport" });
    expect(within(dialog).getByRole("radio", { name: /^The 2 tracks you chose/ })).toBeChecked();
    fireEvent.click(within(dialog).getByRole("button", { name: /^Match / }));
    await waitFor(() =>
      expect(bridge.startCleanMatch).toHaveBeenCalledWith({
        selection: { track_ids: [1, 2] },
        rematch: false,
        label: "2 selected tracks",
      }),
    );
  });

  it("opens it on the tracks not looked up yet when no tracks come with the link", async () => {
    bridge.getLibraryHealth!.mockResolvedValue(UNTOUCHED);
    renderOpened(cleanMatchState());
    const dialog = await screen.findByRole("dialog", { name: "Match on Beatport" });
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

  it.each([["missing", "Track 9"]])("opens an artist's page from the %s Inspector", async (section, title) => {
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
    // Missing files needs a row chosen.
    fireEvent.click(await screen.findByText(title));
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
