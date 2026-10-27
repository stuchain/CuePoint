/**
 * Past matches (C14, DEC-065): every match run, one row each, with its buttons.
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
import { quoted } from "../../../format/words";
import matchCss from "./match.css?raw";
import { declarations, parseRules, selectorList, stripComments } from "../../../test/cssRules";

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

/** Opens a run's More menu and picks an item, as the row's one action slot works (M151). */
function pickMore(named: string, item: string) {
  fireEvent.click(screen.getByRole("button", { name: `More for ${named}` }));
  fireEvent.click(screen.getByRole("menuitem", { name: item }));
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

// A name someone chose is quoted in every label that names the run (C164).
const ALL = quoted('Playlist "all"');
const WHOLE = quoted("All tracks");

const RUNS = [
  run({ job_id: "job-1", label: 'Playlist "all"', created_at: "2026-10-12T13:42:00" }),
  run({
    job_id: "job-2",
    label: "All tracks",
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
  it("lets the middle column give way, so the date, the counts and the status show whole (new H)", async () => {
    renderPast();
    await screen.findByRole("table", { name: /Every match run/ }, LOADED);
    const [head, first] = screen.getAllByRole("row");
    const cells = [...first!.querySelectorAll("td")];
    // When, Results and Status fit their words; What was matched takes what is left (no Tracks column).
    expect(cells.map((cell) => cell.classList.contains("match-past__fit"))).toEqual([true, false, true, true, false]);
    expect([...head!.querySelectorAll("th")].map((cell) => cell.classList.contains("match-past__fit"))).toEqual([
      true,
      false,
      true,
      true,
      false,
    ]);
    const rules = parseRules(stripComments(matchCss));
    const fit = rules.find((rule) => selectorList(rule.selector).includes(".cp-data-table td.match-past__fit"))!;
    const props = new Map(declarations(fit.body));
    expect(props.get("width")).toBe("1%");
    expect(props.get("max-width")).toBe("none");
    expect(props.get("text-overflow")).toBe("clip");
  });

  it("is one row per run, with what was matched and what became of it", async () => {
    renderPast();
    await screen.findByRole("table", { name: /Every match run/ }, LOADED);
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows).toHaveLength(3);

    const first = within(rows[0]!);
    expect(first.getByText('Playlist "all"')).toBeInTheDocument();
    expect(first.queryByText("179")).toBeNull();
    // The same words a track's state has everywhere (D2).
    expect(first.getByText(/131 confirmed/)).toBeInTheDocument();
    expect(first.getByText(/42 to check/)).toBeInTheDocument();
    expect(first.getByText(/6 no match/)).toBeInTheDocument();
    expect(first.getByText("Done")).toBeInTheDocument();

    const second = within(rows[1]!);
    expect(second.getByText("Stopped")).toBeInTheDocument();
    expect(second.getByText(/160 not reached/)).toBeInTheDocument();

    // A run with no label is named by how many tracks it had.
    expect(within(rows[2]!).getByText("1 track")).toBeInTheDocument();
    expect(within(rows[2]!).getByText("Running")).toBeInTheDocument();
  });

  it("offers Resume only on a run that stopped, and one More on every row", async () => {
    renderPast();
    await screen.findByRole("table", { name: /Every match run/ }, LOADED);
    expect(screen.getAllByRole("button", { name: /^Resume / })).toHaveLength(1);
    expect(screen.getByRole("button", { name: `Resume ${WHOLE}` })).toBeEnabled();
    // The row is the way in: no Open button (C230).
    expect(screen.queryByRole("button", { name: /^Open / })).toBeNull();
    expect(screen.getAllByRole("row", { name: /^Open / })).toHaveLength(3);
    expect(screen.getAllByRole("button", { name: /^More for / })).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: "More for 1 track" }));
    expect(screen.getByRole("menuitem", { name: "Match again" })).toHaveAttribute("aria-disabled", "true");
  });

  it("says why a run stopped after its Stopped status, on the same row", async () => {
    world.runs = [RUNS[0]!, { ...RUNS[1]!, stop_reason: "Beatport did not answer" }];
    renderPast();
    await screen.findByRole("table", { name: /Every match run/ }, LOADED);
    const row = screen.getAllByRole("row")[2]!;
    expect(within(row).getAllByText(/Stopped/)).toHaveLength(1);
    expect(within(row).getByText(/Beatport did not answer/)).toHaveClass("match-past__why");
    expect(within(row).getByText(/Beatport did not answer/).textContent).not.toMatch(/\.$/);
    expect(within(row).getByRole("button", { name: `Resume ${WHOLE}` })).toBeEnabled();
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
    expect(await screen.findByText("No past matches yet", undefined, LOADED)).toBeInTheDocument();
    expect(screen.getByText("Each match on Beatport is kept here, so you can see what it found.")).toBeInTheDocument();
    // The full empty state with its icon, as the other tabs show (C140).
    const state = screen.getByText("No past matches yet").closest(".cp-empty-state");
    expect(state).not.toHaveClass("cp-empty-state--compact");
    expect(state?.querySelector(".cp-empty-state__icon")).not.toBeNull();
    // The button goes to the Playlists sub-tab.
    fireEvent.click(screen.getByRole("button", { name: "Go to Playlists" }));
    expect(screen.getByRole("tab", { name: "Playlists" })).toHaveAttribute("aria-selected", "true");
    unmount();

    world.runs = RUNS;
    renderPast();
    await screen.findByRole("table", { name: /Every match run/ }, LOADED);
    world.runs = [];
    fireEvent.change(screen.getByLabelText("Search past matches"), { target: { value: "zzz" } });
    expect(await screen.findByText("Nothing matches \u201czzz\u201d", undefined, LOADED)).toBeInTheDocument();
  });

  it("asks the engine to search, after a pause in typing", async () => {
    renderPast();
    await screen.findByRole("table", { name: /Every match run/ }, LOADED);
    fireEvent.change(screen.getByLabelText("Search past matches"), { target: { value: "friday" } });
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

describe("Opening a run", () => {
  it("opens the review of that run: every track of it, in a tab named for it", async () => {
    world.review = [reviewTrack(1, "to_check"), reviewTrack(2, "not_found"), reviewTrack(3, "matched")];
    renderPast();
    await screen.findByRole("table", { name: /Every match run/ }, LOADED);
    fireEvent.click(screen.getByRole("row", { name: `Open ${ALL}` }));

    expect(await screen.findByRole("region", { name: 'Review Playlist "all"' })).toBeInTheDocument();
    // No Review tab: the one row keeps its sub-tabs and offers a way back (D13).
    expect(screen.queryByRole("tab", { name: /^Review/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Playlists" })).toBeInTheDocument();
    expect(bridge.getMatchReview).toHaveBeenCalledWith({ jobId: "job-1", limit: 2000 });
    expect(await screen.findAllByText("Track 2 · Artist 2", undefined, LOADED)).not.toHaveLength(0);
  });

  it("names a run with no label by how many tracks it had", async () => {
    renderPast();
    await screen.findByRole("table", { name: /Every match run/ }, LOADED);
    fireEvent.click(screen.getByRole("row", { name: `Open ${WHOLE}` }));
    expect(await screen.findByRole("region", { name: "Review All tracks" })).toBeInTheDocument();
    expect(bridge.getMatchReview).toHaveBeenCalledWith({ jobId: "job-2", limit: 2000 });
  });

  it("marks the run that is open", async () => {
    renderPast();
    await screen.findByRole("table", { name: /Every match run/ }, LOADED);
    fireEvent.click(screen.getByRole("row", { name: `Open ${ALL}` }));
    await screen.findByRole("region", { name: 'Review Playlist "all"' });
    // The list stays mounted behind the review, with the open run marked.
    expect(document.querySelectorAll('tr[data-open="true"]')).toHaveLength(1);
  });

  it("opens on Enter on the row, and not on a click inside one of its buttons", async () => {
    renderPast();
    await screen.findByRole("table", { name: /Every match run/ }, LOADED);
    fireEvent.click(screen.getByRole("button", { name: `More for ${WHOLE}` }));
    expect(screen.queryByRole("region", { name: "Review All tracks" })).toBeNull();
    fireEvent.keyDown(screen.getByRole("row", { name: `Open ${WHOLE}` }), { key: "Enter" });
    expect(await screen.findByRole("region", { name: "Review All tracks" })).toBeInTheDocument();
  });
});

describe("Resume and Match again", () => {
  it("resumes the job the engine named, and nothing else", async () => {
    const { props } = renderPast();
    await screen.findByRole("table", { name: /Every match run/ }, LOADED);
    fireEvent.click(screen.getByRole("button", { name: `Resume ${WHOLE}` }));
    expect(props.match.resume).toHaveBeenCalledWith("job-2b");
    expect(props.match.start).not.toHaveBeenCalled();
  });

  it("matches a run again with the run's own rule, looking up even what is matched, under its label", async () => {
    const { props } = renderPast();
    await screen.findByRole("table", { name: /Every match run/ }, LOADED);
    pickMore(ALL, "Match again");
    expect(props.match.start).toHaveBeenCalledWith(
      "rematch-run",
      { query: { filters: { match: "all", rules: [{ field: "match_run", operator: "is", value: "job-1" }] } } },
      true,
      'Playlist "all"',
    );
  });

  it("queues Match again behind a running match, but will not resume into one", async () => {
    const { props } = renderPast({ match: stubMatch({ matching: true }) });
    await screen.findByRole("table", { name: /Every match run/ }, LOADED);
    pickMore(ALL, "Match again");
    expect(props.match.start).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: `Resume ${WHOLE}` })).toBeDisabled();
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
    pickMore(ALL, "Save review list…");

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
    expect(screen.getAllByRole("button", { name: /^More for / })).toHaveLength(RUNS.length);
    pickMore(WHOLE, "Save review list…");
    fireEvent.click(await screen.findByRole("button", { name: "Choose where to save…" }));
    await waitFor(() => expect(bridge.exportReviewList).toHaveBeenCalled());
    const selection = bridge.exportReviewList!.mock.calls[0]![0].selection;
    expect(JSON.stringify(selection)).toContain("job-2");
  });

  it("writes nothing when the save dialog is cancelled", async () => {
    install(vi.fn().mockResolvedValue({ canceled: true }));
    renderPast();
    await screen.findByRole("table", { name: /Every match run/ }, LOADED);
    pickMore(ALL, "Save review list…");
    fireEvent.click(await screen.findByRole("button", { name: "Choose where to save…" }));
    await waitFor(() => expect(bridge.saveExportFileDialog).toHaveBeenCalled());
    expect(bridge.exportReviewList).not.toHaveBeenCalled();
  });
});
