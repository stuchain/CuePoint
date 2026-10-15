/**
 * Past searches (C14, DEC-065): every match run, one row each, with its buttons.
 *
 * Opened inside the real area so that "Open sets From" and "Match again sends
 * the run's own rule" are tested where they happen. The engine's counts are
 * what the tracks are now; the page only words them.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ComponentProps } from "react";

import { ToastProvider } from "../../../components";
import { ScaleProvider } from "../../../tokens/ScaleContext";
import {
  installMatchBridge,
  installTableEnvironment,
  newWorld,
  removeMatchBridge,
  removeTableEnvironment,
  type MatchWorld,
} from "../../../test/matchHarness";
import { reviewTrack, run } from "../../../test/matchFixtures";
import type { CleanMatch } from "../useCleanMatch";
import { MatchArea } from "./MatchArea";
import { MATCH_TAB_STORAGE_KEY } from "./matchTab";

type Fn = ReturnType<typeof vi.fn>;
type Props = ComponentProps<typeof MatchArea>;

const LOADED = { timeout: 3000 };

let bridge: Record<string, Fn>;
let world: MatchWorld;

function stubMatch(overrides: Partial<CleanMatch> = {}): CleanMatch {
  return {
    matching: false,
    running: null,
    jobId: null,
    label: null,
    progress: null,
    secondsLeft: null,
    ended: 0,
    started: 0,
    start: vi.fn(),
    resume: vi.fn(),
    stop: vi.fn(),
    ...overrides,
  };
}

function element(props: Props) {
  return (
    <ScaleProvider>
      <ToastProvider>
        <MemoryRouter>
          <MatchArea {...props} />
        </MemoryRouter>
      </ToastProvider>
    </ScaleProvider>
  );
}

function renderPast(overrides: Partial<Props> = {}) {
  localStorage.setItem(MATCH_TAB_STORAGE_KEY, "past");
  const props: Props = {
    onHealthChanged: vi.fn(),
    match: stubMatch(),
    playlists: { data: null, error: null, loading: false, reload: vi.fn() },
    onMatch: vi.fn(),
    ...overrides,
  };
  const view = render(element(props));
  return { props, ...view, update: (next: Partial<Props>) => view.rerender(element({ ...props, ...next })) };
}

const RUNS = [
  run({ job_id: "job-1", label: 'Playlist "all"', created_at: "2026-10-12T13:42:00" }),
  run({
    job_id: "job-2",
    label: "Whole library",
    created_at: "2026-10-10T18:31:00",
    planned: 1200,
    done: 1040,
    found: 800,
    waiting: 0,
    not_found: 12,
    status: "stopped",
    resume_job_id: "job-2b",
  }),
  run({ job_id: "job-3", label: null, planned: 1, done: 0, found: 0, waiting: 0, not_found: 0, status: "running" }),
];

beforeAll(installTableEnvironment);
afterAll(removeTableEnvironment);

beforeEach(() => {
  localStorage.clear();
  world = newWorld();
  world.runs = RUNS;
  world.runTracks = { "job-1": [1, 2, 3], "job-2": [1] };
  bridge = installMatchBridge(world, { resumeCleanMatch: vi.fn() });
});

afterEach(() => {
  removeMatchBridge();
  vi.restoreAllMocks();
});

describe("the list", () => {
  it("is one row per run, with what was matched and what became of it", async () => {
    renderPast();
    await screen.findByRole("table", { name: /Every match run/ }, LOADED);
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows).toHaveLength(3);

    const first = within(rows[0]!);
    expect(first.getByText('Playlist "all"')).toBeInTheDocument();
    expect(first.getByText("179")).toBeInTheDocument();
    expect(first.getByText(/131 found/)).toBeInTheDocument();
    expect(first.getByText(/42 waiting for you/)).toBeInTheDocument();
    expect(first.getByText(/6 not found/)).toBeInTheDocument();
    expect(first.getByText("Done")).toBeInTheDocument();

    const second = within(rows[1]!);
    expect(second.getByText("Stopped at 1,040")).toBeInTheDocument();
    expect(second.getByText(/160 not reached/)).toBeInTheDocument();

    // A run with no label is named by how many tracks it had.
    expect(within(rows[2]!).getByText("1 track")).toBeInTheDocument();
    expect(within(rows[2]!).getByText("Running")).toBeInTheDocument();
  });

  it("offers Resume only on a run that stopped, and Match again on none that is running", async () => {
    renderPast();
    await screen.findByRole("table", { name: /Every match run/ }, LOADED);
    expect(screen.getAllByRole("button", { name: /^Resume / })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Resume Whole library" })).toBeEnabled();
    expect(screen.getAllByRole("button", { name: /^Open / })).toHaveLength(3);
    expect(screen.getAllByRole("button", { name: /again$/ })).toHaveLength(2);
  });

  it("offers no Resume in a build that cannot resume", async () => {
    delete bridge.resumeCleanMatch;
    renderPast();
    await screen.findByRole("table", { name: /Every match run/ }, LOADED);
    expect(screen.queryByRole("button", { name: /^Resume / })).toBeNull();
  });

  it("says nothing has been matched yet, and that a search found nothing", async () => {
    world.runs = [];
    const { unmount } = renderPast();
    expect(await screen.findByText("Nothing has been matched on Beatport yet.", undefined, LOADED)).toBeInTheDocument();
    unmount();

    world.runs = RUNS;
    renderPast();
    await screen.findByRole("table", { name: /Every match run/ }, LOADED);
    world.runs = [];
    fireEvent.change(screen.getByLabelText("Search"), { target: { value: "zzz" } });
    expect(await screen.findByText("Nothing matches \u201czzz\u201d.", undefined, LOADED)).toBeInTheDocument();
  });

  it("asks the engine to search, after a pause in typing", async () => {
    renderPast();
    await screen.findByRole("table", { name: /Every match run/ }, LOADED);
    fireEvent.change(screen.getByLabelText("Search"), { target: { value: "friday" } });
    await waitFor(() => expect(bridge.getMatchJobs).toHaveBeenLastCalledWith({ limit: 20, q: "friday" }), LOADED);
  });

  it("says when the engine cannot list them", async () => {
    delete bridge.getMatchJobs;
    renderPast();
    expect(
      await screen.findByText("This needs the CuePoint desktop app."),
    ).toBeInTheDocument();
  });

  it("says why they could not be read", async () => {
    bridge.getMatchJobs!.mockRejectedValue(new Error("The library service is not running"));
    renderPast();
    expect(await screen.findByRole("alert", undefined, LOADED)).toHaveTextContent(
      "The library service is not running",
    );
  });

  it("says how many more there are than are shown", async () => {
    bridge.getMatchJobs!.mockResolvedValue({ jobs: RUNS, total: 57 });
    renderPast();
    expect(
      await screen.findByText(/Showing the newest 3 of 57\. Search to find an older one\./, undefined, LOADED),
    ).toBeInTheDocument();
  });

  it("is read again when a match starts or resumes, not only when one ends", async () => {
    const { update } = renderPast();
    await screen.findByRole("table", { name: /Every match run/ }, LOADED);
    const reads = bridge.getMatchJobs!.mock.calls.length;
    update({ match: stubMatch({ started: 1 }) });
    await waitFor(() => expect(bridge.getMatchJobs!.mock.calls.length).toBeGreaterThan(reads));
  });

  it("is read again when a match ends", async () => {
    const { update } = renderPast();
    await screen.findByRole("table", { name: /Every match run/ }, LOADED);
    const reads = bridge.getMatchJobs!.mock.calls.length;
    update({ match: stubMatch({ ended: 1 }) });
    await waitFor(() => expect(bridge.getMatchJobs!.mock.calls.length).toBeGreaterThan(reads));
  });
});

describe("Open", () => {
  it("opens the review of that run: every track of it, in a tab named for it", async () => {
    world.review = [reviewTrack(1, "to_check"), reviewTrack(2, "not_found"), reviewTrack(3, "matched")];
    renderPast();
    await screen.findByRole("table", { name: /Every match run/ }, LOADED);
    fireEvent.click(screen.getByRole("button", { name: 'Open Playlist "all"' }));

    expect(await screen.findByRole("region", { name: 'Review Playlist "all"' })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: 'Review Playlist "all"' })).toHaveAttribute("aria-selected", "true");
    expect(bridge.getMatchReview).toHaveBeenCalledWith({ jobId: "job-1", limit: 2000 });
    expect(await screen.findAllByText("Track 2 · Artist 2", undefined, LOADED)).not.toHaveLength(0);
  });

  it("names a run with no label by how many tracks it had", async () => {
    renderPast();
    await screen.findByRole("table", { name: /Every match run/ }, LOADED);
    fireEvent.click(screen.getByRole("button", { name: "Open Whole library" }));
    expect(await screen.findByRole("tab", { name: "Review Whole library" })).toBeInTheDocument();
    expect(bridge.getMatchReview).toHaveBeenCalledWith({ jobId: "job-2", limit: 2000 });
  });

  it("marks the run that is open", async () => {
    renderPast();
    await screen.findByRole("table", { name: /Every match run/ }, LOADED);
    fireEvent.click(screen.getByRole("button", { name: 'Open Playlist "all"' }));
    await screen.findByRole("region", { name: 'Review Playlist "all"' });
    fireEvent.click(screen.getByRole("tab", { name: "Past searches" }));
    await screen.findByRole("table", { name: /Every match run/ });
    expect(screen.getAllByRole("row").filter((row) => row.getAttribute("data-open") === "true")).toHaveLength(1);
  });
});

describe("Resume and Match again", () => {
  it("resumes the job the engine named, and nothing else", async () => {
    const { props } = renderPast();
    await screen.findByRole("table", { name: /Every match run/ }, LOADED);
    fireEvent.click(screen.getByRole("button", { name: "Resume Whole library" }));
    expect(props.match.resume).toHaveBeenCalledWith("job-2b");
    expect(props.match.start).not.toHaveBeenCalled();
  });

  it("matches a run again with the run's own rule, looking up even what is matched, under its label", async () => {
    const { props } = renderPast();
    await screen.findByRole("table", { name: /Every match run/ }, LOADED);
    fireEvent.click(screen.getByRole("button", { name: 'Match Playlist "all" again' }));
    expect(props.match.start).toHaveBeenCalledWith(
      "rematch-run",
      { query: { filters: { match: "all", rules: [{ field: "match_run", operator: "is", value: "job-1" }] } } },
      true,
      'Playlist "all"',
    );
  });

  it("will not start another search while one is running", async () => {
    renderPast({ match: stubMatch({ matching: true }) });
    await screen.findByRole("table", { name: /Every match run/ }, LOADED);
    expect(screen.getByRole("button", { name: 'Match Playlist "all" again' })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Resume Whole library" })).toBeDisabled();
    // Looking is not starting.
    expect(screen.getByRole("button", { name: 'Open Playlist "all"' })).toBeEnabled();
  });
});

describe("Save review list (K12)", () => {
  function install(pick: Fn) {
    bridge.saveExportFileDialog = pick;
    bridge.exportReviewList = vi.fn().mockResolvedValue({
      file_path: "C:\\out\\review-list.xlsx",
      format: "excel",
      count: 179,
      columns: [],
    });
  }

  it("saves that run's own list, saying what it holds", async () => {
    install(vi.fn().mockResolvedValue({ canceled: false, filePath: "C:\\out\\review-list.xlsx" }));
    renderPast();
    await screen.findByRole("table", { name: /Every match run/ }, LOADED);
    fireEvent.click(screen.getByRole("button", { name: 'Save review list of Playlist "all" as a file…' }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Saves the tracks of this search");
    fireEvent.change(within(dialog).getByLabelText("Format"), { target: { value: "excel" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Choose where to save…" }));

    await waitFor(() =>
      expect(bridge.exportReviewList).toHaveBeenCalledWith({
        selection: {
          query: { filters: { match: "all", rules: [{ field: "match_run", operator: "is", value: "job-1" }] } },
        },
        format: "excel",
        file_path: "C:\\out\\review-list.xlsx",
        overwrite: true,
      }),
    );
    expect(bridge.saveExportFileDialog).toHaveBeenCalledWith({
      defaultPath: "review-list-Playlist-all-2026-10-12.xlsx",
      format: "xlsx",
    });
    expect(dialog).not.toHaveTextContent(/\d tracks/);
    expect(await screen.findByText("Exported 179 tracks to review-list.xlsx.")).toBeInTheDocument();
  });

  it("is on every run, each saving its own", async () => {
    install(vi.fn().mockResolvedValue({ canceled: false, filePath: "C:\\out\\review-list.csv" }));
    renderPast();
    await screen.findByRole("table", { name: /Every match run/ }, LOADED);
    expect(screen.getAllByRole("button", { name: /^Save review list of/ })).toHaveLength(RUNS.length);
    fireEvent.click(screen.getByRole("button", { name: "Save review list of Whole library as a file…" }));
    fireEvent.click(await screen.findByRole("button", { name: "Choose where to save…" }));
    await waitFor(() => expect(bridge.exportReviewList).toHaveBeenCalled());
    const selection = bridge.exportReviewList!.mock.calls[0]![0].selection;
    expect(JSON.stringify(selection)).toContain("job-2");
  });

  it("writes nothing when the save dialog is cancelled", async () => {
    install(vi.fn().mockResolvedValue({ canceled: true }));
    renderPast();
    await screen.findByRole("table", { name: /Every match run/ }, LOADED);
    fireEvent.click(screen.getByRole("button", { name: 'Save review list of Playlist "all" as a file…' }));
    fireEvent.click(await screen.findByRole("button", { name: "Choose where to save…" }));
    await waitFor(() => expect(bridge.saveExportFileDialog).toHaveBeenCalled());
    expect(bridge.exportReviewList).not.toHaveBeenCalled();
  });
});
