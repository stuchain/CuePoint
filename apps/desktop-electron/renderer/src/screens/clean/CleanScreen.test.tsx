/**
 * The Clean page (CLEAN-12).
 *
 * The specification's tests, against the real page over a faked bridge:
 * - the Match tab opens on One at a time, and the header's Match tracks… starts
 *   a match under a name (the Match area's own tests are in `match/`);
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
  LibraryHealth,
  LibrarySearchResponse,
  LibraryTrackRow,
  ListedDuplicateGroup,
} from "../../api/cuepointBridge.types";
import { ToastProvider } from "../../components";
import { getSelectedTrack, setSelectedTrack } from "../../components/shell/selectedTrack";
import { libraryRefreshState } from "../library/libraryLink";
import { InspectorSlotOutlet, InspectorSlotProvider } from "../../components/shell";
import { ScaleProvider } from "../../tokens/ScaleContext";
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
  cleanFixOpening,
  cleanFixState,
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

/** The header's Match tracks… opens the match window (CLN-10, FLW-13); this answers it. */
async function startMatching(choice: RegExp | string = /^All tracks/) {
  fireEvent.click(screen.getByRole("button", { name: "Match tracks…" }));
  const dialog = await screen.findByRole("dialog", { name: "Match tracks" });
  fireEvent.click(within(dialog).getByRole("radio", { name: choice }));
  // These libraries have been looked up already, so there is only something to do when told to look up again.
  fireEvent.click(
    within(dialog).getByRole("checkbox", { name: "Look up tracks that already have a match again" }),
  );
  fireEvent.click(within(dialog).getByRole("button", { name: "Start matching" }));
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
  it("opens on Match with the five parts as tabs", async () => {
    renderClean();
    const tabs = await screen.findAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      "Match",
      "Fix values",
      "Missing files",
      "Duplicates",
      "Health",
      // The Match area's own sub-tabs.
      "One at a time",
      "Table",
      "Past searches",
    ]);
    expect(screen.getByRole("tab", { name: "Match" })).toHaveAttribute("aria-selected", "true");
    expect(await screen.findByRole("region", { name: "One at a time" })).toBeInTheDocument();
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
        "Fix values",
        "Missing files (3)",
        "Duplicates",
        "Health",
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

    fireEvent.click(screen.getByRole("tab", { name: "Health" }));
    await screen.findByRole("tabpanel", { name: "Health" });
    expect(screen.queryByText(/Each number opens the list that fixes it/)).toBeNull();
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

describe("the Match tab", () => {
  it("lists the queue by Show and From, the Library's way (the area's tests are in match/)", async () => {
    renderClean();
    await screen.findByText("1 of 3");
    expect(lastBrowse().filters).toEqual(fixture.rules.needs_review);
    expect(lastBrowse()).toMatchObject({ offset: 0, limit: 100, sort: "artist" });
    expect(screen.queryByLabelText("In")).toBeNull();
  });

  it("holds Save review list as a file… in the Table, not in the header (CLN-11)", async () => {
    renderClean();
    await screen.findByText("1 of 3");
    const header = screen.getByTestId("clean-header");
    expect(within(header).queryByRole("button", { name: /Save review list/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Export review list/ })).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "Table" }));
    expect(await screen.findByRole("button", { name: "Save review list as a file…" })).toBeInTheDocument();
  });

  it("matches the chosen tracks as a job, names the run, and says what it left out", async () => {
    renderClean();
    await screen.findByText("1 of 3");
    await startMatching();

    await waitFor(() =>
      expect(bridge.startCleanMatch).toHaveBeenCalledWith({
        selection: { query: {} },
        rematch: true,
        label: "Whole library",
      }),
    );
    expect(
      await screen.findByText(
        "Matching 2 tracks on Beatport. 1 already matched or decided is left out.",
      ),
    ).toBeInTheDocument();
    await screen.findByText("Matching finished.");
  });

  it("reads Health and the list again once a match ends", async () => {
    renderClean();
    await screen.findByText("1 of 3");
    const health = bridge.getLibraryHealth!.mock.calls.length;
    const browses = bridge.browseLibrary!.mock.calls.length;
    await startMatching();
    await screen.findByText("Matching finished.");
    await waitFor(() => expect(bridge.getLibraryHealth!.mock.calls.length).toBeGreaterThan(health));
    await waitFor(() => expect(bridge.browseLibrary!.mock.calls.length).toBeGreaterThan(browses));
  });

  it("looks tracks up again only when the checkbox in the match window says so (CLN-10)", async () => {
    renderClean();
    await screen.findByText("1 of 3");
    // The Match area carries no Match all / Match selection: the header does.
    expect(screen.queryByRole("button", { name: /^Match all/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Match selection" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Match tracks…" }));
    const dialog = await screen.findByRole("dialog", { name: "Match tracks" });
    fireEvent.click(within(dialog).getByRole("radio", { name: /^All tracks/ }));
    fireEvent.click(
      within(dialog).getByRole("checkbox", { name: "Look up tracks that already have a match again" }),
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Start matching" }));
    await waitFor(() =>
      expect(bridge.startCleanMatch).toHaveBeenCalledWith(
        expect.objectContaining({ rematch: true, label: "Whole library" }),
      ),
    );
  });

  it("explains a running match on the page (CLN-7)", async () => {
    // The job never ends until released, so the note can be read while it runs.
    let release: (() => void) | undefined;
    bridge.getJob!.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ id: "job", state: "succeeded" });
        }),
    );
    renderClean();
    await screen.findByText("1 of 3");
    expect(screen.queryByRole("region", { name: "Matching" })).toBeNull();
    await startMatching();

    const note = await screen.findByRole("region", { name: "Matching" });
    expect(note).toHaveTextContent(/Matching 2 tracks on Beatport\./);
    expect(note).toHaveTextContent(/the bar at the bottom shows progress/i);
    expect(note).toHaveTextContent(/you can keep working/i);
    await waitFor(() => expect(release).toBeDefined());
    act(() => release?.());
    await waitFor(() => expect(screen.queryByRole("region", { name: "Matching" })).toBeNull());
  });

  it("explains a match already running when the page is opened (CLN-7)", async () => {
    bridge.listJobs = vi.fn().mockResolvedValue({
      jobs: [{ id: "job-1", type: "clean_match", state: "running", progress: null }],
      active_count: 1,
    });
    renderClean();
    await screen.findByText("1 of 3");
    const note = await screen.findByRole("region", { name: "Matching" });
    expect(note).toHaveTextContent(/A match is running on Beatport\./);
    expect(note).toHaveTextContent(/the list updates when it finishes/i);
    expect(screen.getByRole("button", { name: "Match tracks…" })).toBeDisabled();
  });

  it("says why the engine refused a match", async () => {
    bridge.startCleanMatch!.mockRejectedValue(new Error("Every track here is already matched"));
    renderClean();
    await screen.findByText("1 of 3");
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
    fireEvent.click(within(dialog).getByRole("button", { name: "Start matching" }));
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

  it("opens the header's Match tracks… on the rows ticked in the Table, and on none in One at a time", async () => {
    renderClean();
    await screen.findByText("1 of 3");
    fireEvent.click(screen.getByRole("button", { name: "Match tracks…" }));
    let dialog = await screen.findByRole("dialog", { name: "Match tracks" });
    expect(within(dialog).queryByRole("radio", { name: /you chose/ })).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    fireEvent.click(screen.getByRole("tab", { name: "Table" }));
    fireEvent.click(await screen.findByRole("checkbox", { name: "Take Track 1" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Take ticked values (1 track)" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Match tracks…" }));
    dialog = await screen.findByRole("dialog", { name: "Match tracks" });
    await waitFor(() =>
      expect(within(dialog).getByRole("radio", { name: /^The 1 track you chose/ })).toBeChecked(),
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Start matching" }));
    await waitFor(() =>
      expect(bridge.startCleanMatch).toHaveBeenCalledWith(
        expect.objectContaining({ selection: { track_ids: [1] }, label: "1 chosen track" }),
      ),
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
    expect(items[2]).toHaveTextContent("Here, Check Rekordbox for changes.");

    fireEvent.click(within(items[2]!).getByRole("button", { name: "Check Rekordbox for changes" }));
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

  it.each([
    ["missing_files", "Missing files"],
    ["duplicates", "Duplicates"],
    ["needs_review", "Match"],
  ])("opens %s on its own tab, not the Library (FLW-14)", async (id, tab) => {
    bridge.getLibraryHealth!.mockResolvedValue(UNTOUCHED);
    renderClean("health");
    const count = UNTOUCHED.counts.find((entry) => entry.id === id)!;
    fireEvent.click(
      await screen.findByRole("button", {
        name: new RegExp(`^${count.count.toLocaleString()} ${count.label}:`),
      }),
    );
    expect(await screen.findByRole("tab", { name: new RegExp(`^${tab}`), selected: true })).toBeInTheDocument();
    expect(screen.queryByTestId("location")).toBeNull();
  });

  it.each(
    UNTOUCHED.counts
      .filter((count) => !["missing_files", "duplicates", "needs_review"].includes(count.id))
      .map((count) => [count.id, count] as const),
  )(
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
    // Files, duplicates, artwork and the waveform analysis (WAVE-03).
    expect(within(checks).getAllByText("Not done yet")).toHaveLength(4);

    const before = bridge.getLibraryHealth!.mock.calls.length;
    fireEvent.click(within(checks).getByRole("button", { name: "Read cover art" }));
    await waitFor(() =>
      expect(bridge.startArtworkScan).toHaveBeenCalledWith({ selection: { query: {} } }),
    );
    expect(await screen.findByText("Finished reading cover art.")).toBeInTheDocument();
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
    localStorage.setItem(CLEAN_SECTION_STORAGE_KEY, "health");
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

describe("the match window and Fix values, opened from elsewhere (FLW-12, FLW-13)", () => {
  function Opened() {
    const location = useLocation();
    return (
      <CleanScreen
        matchWith={cleanMatchOpening(location)}
        fixWith={cleanFixOpening(location)}
      />
    );
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
    fireEvent.click(within(dialog).getByRole("button", { name: "Start matching" }));
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

  it("opens Fix values with the tracks chosen, and the action asked for", async () => {
    localStorage.setItem(CLEAN_SECTION_STORAGE_KEY, "health");
    renderOpened(cleanFixState([1, 2, 3], "edit"));
    expect(await screen.findByRole("tab", { name: "Fix values", selected: true })).toBeInTheDocument();
    expect(await screen.findByRole("dialog", { name: "Edit values" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "The 3 tracks you chose" })).toBeChecked();
    // A link is not a choice: the part last used stays the one remembered.
    expect(localStorage.getItem(CLEAN_SECTION_STORAGE_KEY)).toBe("health");
  });

  it("opens Match tracks… from the header without tracks", async () => {
    renderClean();
    await screen.findByText("Track 1");
    fireEvent.click(screen.getByRole("button", { name: "Match tracks…" }));
    expect(await screen.findByRole("dialog", { name: "Match tracks" })).toBeInTheDocument();
  });

  it("says on the Fix values tab how to choose tracks, with no paragraph before it (C15b)", async () => {
    renderClean("fix");
    expect(screen.queryByText(/Change many tracks at once/)).toBeNull();
    expect(
      await screen.findByText(
        "Choose tracks: pick playlists here, or select tracks in the Library and use Fix ▸.",
      ),
    ).toBeInTheDocument();
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
    localStorage.setItem(CLEAN_SECTION_STORAGE_KEY, "health");
    renderOpened();

    expect(await screen.findByRole("tab", { name: "Missing files", selected: true })).toBeInTheDocument();
    expect(await screen.findByText(/right-click the track/)).toBeInTheDocument();
    expect(localStorage.getItem(CLEAN_SECTION_STORAGE_KEY)).toBe("health");
  });

  it("ignores a location that carries no part, or one that is not a part", () => {
    expect(cleanSectionOpening({ state: { cuepointCleanSection: "exports" }, key: "k" })).toBeNull();
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
