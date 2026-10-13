/**
 * The Match area (C14): three sub-tabs over one list.
 *
 * Against the real area over a faked bridge: which tab opens and is
 * remembered; Show and From make one rule set (From is the `match_run` rule);
 * a decision keeps the cursor in place and says what it did; Undo reverts the
 * batch; the area opens on a track the Library asked for (CLEAN-13); and the
 * choice of result survives a match ending (CLEAN-14).
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ComponentProps } from "react";

import type { CleanPlaylists, LibraryHealth } from "../../../api/cuepointBridge.types";
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
import { proposed, run, ruleOf, track } from "../../../test/matchFixtures";
import fixture from "../cleanEmpty.fixture.json";
import { DISPUTED_HINT } from "../cleanFormat";
import type { CleanMatch } from "../useCleanMatch";
import { MATCH_TAB_STORAGE_KEY, MatchArea } from "./MatchArea";

type Fn = ReturnType<typeof vi.fn>;
type Props = ComponentProps<typeof MatchArea>;

const MATCHED = fixture.matched.health as LibraryHealth;
const UNTOUCHED = fixture.untouched.health as LibraryHealth;
const LOADED = { timeout: 3000 };

let bridge: Record<string, Fn>;
let world: MatchWorld;

function stubMatch(overrides: Partial<CleanMatch> = {}): CleanMatch {
  return {
    matching: false,
    running: null,
    note: null,
    progress: null,
    ended: 0,
    started: 0,
    start: vi.fn(),
    resume: vi.fn(),
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

const COUNTS = {
  track_count: 40,
  not_matched: 0,
  waiting: 0,
  accepted: 40,
  rejected: 0,
  no_match: 0,
  unsaved: 0,
  running: null,
};

const PLAYLISTS: CleanPlaylists = {
  whole_library: { ...COUNTS, track_count: 100, waiting: 18 },
  playlists: [
    { id: 7, name: "Peak time", path: "Techno", ...COUNTS, waiting: 18 },
    { id: 8, name: "Closing", path: "", ...COUNTS, unsaved: 5 },
  ],
};

/** The other sub-tabs' tests open on One at a time: Playlists is the default (C22). */
function renderArea(overrides: Partial<Props> = {}) {
  if (localStorage.getItem(MATCH_TAB_STORAGE_KEY) === null) localStorage.setItem(MATCH_TAB_STORAGE_KEY, "one");
  const props: Props = {
    health: MATCHED,
    onHealthChanged: vi.fn(),
    match: stubMatch(),
    onMatchTracks: vi.fn(),
    playlists: { data: null, error: null, loading: false, reload: vi.fn() },
    ticked: new Set<string>(),
    onTick: vi.fn(),
    ...overrides,
  };
  const view = render(element(props));
  return { props, ...view, update: (next: Partial<Props>) => view.rerender(element({ ...props, ...next })) };
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

/** One at a time has drawn the track under the cursor. */
async function onTrack(id: number) {
  await waitFor(() => expect(bridge.getTrackMatches).toHaveBeenLastCalledWith({ trackId: id }), LOADED);
  await screen.findByTestId("likelihood", undefined, LOADED);
}

beforeAll(installTableEnvironment);
afterAll(removeTableEnvironment);

beforeEach(() => {
  localStorage.clear();
  world = newWorld();
  bridge = installMatchBridge(world);
});

afterEach(() => {
  removeMatchBridge();
  vi.restoreAllMocks();
});

describe("the sub-tabs", () => {
  it("are Playlists, One at a time, Table and Past searches, opening on Playlists (C22)", async () => {
    localStorage.setItem(MATCH_TAB_STORAGE_KEY, "playlists");
    renderArea({ playlists: { data: PLAYLISTS, error: null, loading: false, reload: vi.fn() } });
    const tabs = await screen.findAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual(["Playlists", "One at a time", "Table", "Past searches"]);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("table", { name: /Your playlists/ })).toBeInTheDocument();
    // The Show and From toolbar belongs to the list, not to the playlists.
    expect(screen.queryByLabelText("Show")).toBeNull();
  });

  it("remember the one last used", async () => {
    const { unmount } = renderArea();
    fireEvent.click(await screen.findByRole("tab", { name: "Table" }));
    expect(localStorage.getItem(MATCH_TAB_STORAGE_KEY)).toBe("table");
    expect(await screen.findByRole("region", { name: "Table" })).toBeInTheDocument();
    unmount();

    renderArea();
    expect(await screen.findByRole("tab", { name: "Table" })).toHaveAttribute("aria-selected", "true");
  });

  it("still read a stored One at a time, and fall back to Playlists when what was remembered is not a tab", async () => {
    localStorage.setItem(MATCH_TAB_STORAGE_KEY, "nonsense");
    const { unmount } = renderArea();
    expect(await screen.findByRole("tab", { name: "Playlists" })).toHaveAttribute("aria-selected", "true");
    unmount();
    localStorage.setItem(MATCH_TAB_STORAGE_KEY, "one");
    renderArea();
    expect(await screen.findByRole("tab", { name: "One at a time" })).toHaveAttribute("aria-selected", "true");
  });

  it("say which one is open, so the page can show its header action only on Playlists", async () => {
    localStorage.setItem(MATCH_TAB_STORAGE_KEY, "playlists");
    const onTabChange = vi.fn();
    renderArea({ onTabChange });
    await waitFor(() => expect(onTabChange).toHaveBeenLastCalledWith("playlists"));
    fireEvent.click(await screen.findByRole("tab", { name: "Table" }));
    expect(onTabChange).toHaveBeenLastCalledWith("table");
  });
});

describe("Review N on a playlist (C22)", () => {
  it("opens One at a time on that playlist's waiting tracks, From naming it", async () => {
    localStorage.setItem(MATCH_TAB_STORAGE_KEY, "playlists");
    renderArea({ playlists: { data: PLAYLISTS, error: null, loading: false, reload: vi.fn() } });
    fireEvent.click(await screen.findByRole("button", { name: "Review 18 for Peak time" }));

    expect(await screen.findByRole("tab", { name: "One at a time" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByLabelText("Show")).toHaveValue("needs_review");
    expect(screen.getByLabelText("From")).toHaveValue("playlist:7");
    expect(screen.getByRole("option", { name: "This playlist: Peak time" })).toBeInTheDocument();
    await waitFor(() => expect(lastBrowse()).toMatchObject({ playlistId: 7 }));
    expect(lastBrowse().filters).toEqual(fixture.rules.needs_review);

    // Another From drops the playlist, and its option.
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "" } });
    await waitFor(() => expect(lastBrowse().playlistId).toBeNull());
    expect(screen.queryByRole("option", { name: /This playlist/ })).toBeNull();
  });

  it("looks at the decisions a newer match disagrees with when a playlist's waiting tracks are all of those", async () => {
    // Track 1 is a decision a newer match disagrees with; nothing is waiting as a new match.
    world.tracks = [
      proposed(1, { match_state: "accepted", match_disputed: true }),
      proposed(2, { match_state: "accepted", match_disputed: false }),
      proposed(3, { match_state: "accepted", match_disputed: false }),
    ];
    localStorage.setItem(MATCH_TAB_STORAGE_KEY, "playlists");
    renderArea({
      playlists: {
        data: { ...PLAYLISTS, playlists: [{ id: 9, name: "Old decisions", path: "", ...COUNTS, waiting: 1 }] },
        error: null,
        loading: false,
        reload: vi.fn(),
      },
    });
    fireEvent.click(await screen.findByRole("button", { name: "Review 1 for Old decisions" }));
    await waitFor(() => expect(screen.getByLabelText("Show")).toHaveValue("disputed"), LOADED);
    expect(screen.getByLabelText("From")).toHaveValue("playlist:9");
    await waitFor(() => expect(lastBrowse()).toMatchObject({ playlistId: 9 }));
    expect(lastBrowse().filters).toEqual({
      match: "all",
      rules: [{ field: "match_disputed", operator: "is", value: true }],
    });
    await onTrack(1);
  });

  it("stays on Waiting for you when the playlist has tracks waiting as new matches", async () => {
    localStorage.setItem(MATCH_TAB_STORAGE_KEY, "playlists");
    renderArea({ playlists: { data: PLAYLISTS, error: null, loading: false, reload: vi.fn() } });
    fireEvent.click(await screen.findByRole("button", { name: "Review 18 for Peak time" }));
    await onTrack(1);
    expect(screen.getByLabelText("Show")).toHaveValue("needs_review");
  });

  it("opens on the whole library's waiting tracks for the Whole library row", async () => {
    localStorage.setItem(MATCH_TAB_STORAGE_KEY, "playlists");
    renderArea({ playlists: { data: PLAYLISTS, error: null, loading: false, reload: vi.fn() } });
    fireEvent.click(await screen.findByRole("button", { name: "Review 18 for Whole library" }));
    await onTrack(1);
    // No playlist as the source, and no past search to choose between: From is not offered.
    expect(screen.queryByLabelText("From")).toBeNull();
    await waitFor(() => expect(lastBrowse().playlistId).toBeNull());
  });
});

describe("From shows only when there is something to choose (K12)", () => {
  it("is hidden with no past search", async () => {
    renderArea();
    await onTrack(1);
    await waitFor(() => expect(bridge.getMatchJobs).toHaveBeenCalled());
    expect(screen.queryByLabelText("From")).toBeNull();
    expect(screen.getByLabelText("Show")).toBeInTheDocument();
  });

  it("is hidden with one past search", async () => {
    world.runs = [run({ job_id: "job-9" })];
    renderArea();
    await onTrack(1);
    await waitFor(() => expect(bridge.getMatchJobs).toHaveBeenCalled());
    expect(screen.queryByLabelText("From")).toBeNull();
  });

  it("shows with two past searches", async () => {
    world.runs = [run({ job_id: "job-9" }), run({ job_id: "job-8", label: "Older" })];
    renderArea();
    await onTrack(1);
    expect(await screen.findByLabelText("From")).toHaveValue("");
  });

  it("shows while a playlist is the source, so it can be cleared", async () => {
    localStorage.setItem(MATCH_TAB_STORAGE_KEY, "playlists");
    renderArea({ playlists: { data: PLAYLISTS, error: null, loading: false, reload: vi.fn() } });
    fireEvent.click(await screen.findByRole("button", { name: "Review 18 for Peak time" }));
    await onTrack(1);
    expect(screen.getByLabelText("From")).toHaveValue("playlist:7");
  });

  it("moves focus to Show when From goes away under it", async () => {
    localStorage.setItem(MATCH_TAB_STORAGE_KEY, "playlists");
    renderArea({ playlists: { data: PLAYLISTS, error: null, loading: false, reload: vi.fn() } });
    fireEvent.click(await screen.findByRole("button", { name: "Review 18 for Peak time" }));
    await onTrack(1);
    const from = screen.getByLabelText("From");
    from.focus();
    fireEvent.change(from, { target: { value: "" } });
    await waitFor(() => expect(screen.queryByLabelText("From")).toBeNull());
    expect(screen.getByLabelText("Show")).toHaveFocus();
  });

  it("shows while one past search is open, so it can be cleared", async () => {
    world.runs = [run({ job_id: "job-9" })];
    localStorage.setItem(MATCH_TAB_STORAGE_KEY, "past");
    renderArea();
    fireEvent.click(await screen.findByRole("button", { name: /^Open / }));
    await screen.findByRole("region", { name: "One at a time" });
    expect(screen.getByLabelText("From")).toHaveValue("job-9");
  });
});

describe("Show and From", () => {
  it("change the rule set, not the source, when Show changes", async () => {
    renderArea();
    await onTrack(1);
    expect(lastBrowse().filters).toEqual(fixture.rules.needs_review);
    expect(screen.getByLabelText("Show")).toHaveValue("needs_review");

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

  it("add the match_run rule, with the run's root job, when From is a past search", async () => {
    world.runs = [run({ job_id: "job-9", label: 'Playlist "Friday"' }), run({ job_id: "job-8", label: "Older" })];
    world.runTracks = { "job-9": [2, 3] };
    renderArea();
    await onTrack(1);
    const from = await screen.findByLabelText("From");
    expect(from).toHaveValue("");
    await screen.findByRole("option", { name: /Playlist "Friday"/ });
    // Without a run there is no "Everything in this search".
    expect(screen.queryByRole("option", { name: "Everything in this search" })).toBeNull();

    fireEvent.change(from, { target: { value: "job-9" } });
    await waitFor(() =>
      expect((lastBrowse().filters as { rules: unknown[] }).rules).toEqual([
        { field: "match_state", operator: "is", value: "needs_review" },
        { field: "match_run", operator: "is", value: "job-9" },
      ]),
    );
    expect(screen.getByRole("option", { name: "Everything in this search" })).toBeInTheDocument();

    // Everything in that search asks only for the run.
    fireEvent.change(screen.getByLabelText("Show"), { target: { value: "everything" } });
    await waitFor(() =>
      expect(lastBrowse().filters).toEqual({
        match: "all",
        rules: [{ field: "match_run", operator: "is", value: "job-9" }],
      }),
    );

    // Back to All searches: the run's rule goes, and so does the option that needed it.
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "" } });
    await waitFor(() => expect(lastBrowse().filters).toEqual(fixture.rules.needs_review));
    expect(screen.getByLabelText("Show")).toHaveValue("needs_review");
  });

  it("says how many are checked, only for the list that waits for a yes or no", async () => {
    renderArea();
    await onTrack(1);
    expect(screen.getByText("0 of 3 checked")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Checked so far" })).toHaveAttribute(
      "aria-valuenow",
      "0",
    );

    fireEvent.change(screen.getByLabelText("Show"), { target: { value: "accepted" } });
    await waitFor(() => expect(screen.queryByText(/checked$/)).toBeNull());
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("explains what \"Changed since you decided\" means under Show", async () => {
    world.tracks = [proposed(1, { match_state: "accepted", match_disputed: true })];
    renderArea();
    await onTrack(1).catch(() => undefined);
    expect(screen.queryByText(DISPUTED_HINT)).toBeNull();
    fireEvent.change(screen.getByLabelText("Show"), { target: { value: "disputed" } });
    await waitFor(() => expect(screen.getByText(DISPUTED_HINT)).toBeInTheDocument());
  });

  it("leaves the keys alone while typing in Show", async () => {
    renderArea();
    await onTrack(1);
    const calls = bridge.getTrackMatches!.mock.calls.length;
    fireEvent.keyDown(screen.getByLabelText("Show"), { key: "ArrowDown" });
    expect(bridge.getTrackMatches!.mock.calls.length).toBe(calls);
    expect(screen.getByText("1 of 3")).toBeInTheDocument();
  });
});

describe("deciding in One at a time", () => {
  it("Correct sends the ticked values as one act, says so, and stays in place", async () => {
    const { props } = renderArea();
    await onTrack(1);

    press("a");
    await waitFor(() =>
      expect(bridge.correctMatch).toHaveBeenCalledWith({
        track_id: 1,
        candidate_id: 1001,
        fields: ["bpm", "label", "year"],
      }),
    );
    expect(await screen.findByText("Corrected “Track 1”.")).toBeInTheDocument();
    // Track 1 has left "Waiting for you"; the cursor stayed put and Track 2 moved in.
    await onTrack(2);
    expect(screen.getByText("1 of 3 checked")).toBeInTheDocument();
    expect(props.onHealthChanged).toHaveBeenCalled();
    expect(bridge.decideMatch).not.toHaveBeenCalled();
  });

  it("Undo reverts the batch of the last act, and the track is back", async () => {
    renderArea();
    await onTrack(1);
    press("a");
    const undo = await screen.findByRole("button", { name: "Undo" });
    await onTrack(2);

    world.tracks = world.tracks.map((row) =>
      row.id === 1 ? proposed(1) : row,
    );
    fireEvent.click(undo);
    await waitFor(() => expect(bridge.revertBatch).toHaveBeenCalledWith({ batch_id: "batch-1" }));
    expect(await screen.findByText("Undid the change to “Track 1”.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
    await waitFor(() => expect(screen.getByText("0 of 3 checked")).toBeInTheDocument());
  });

  it("offers no Undo when Correct changed nothing", async () => {
    bridge.correctMatch!.mockResolvedValue({
      match: {},
      track: track(1),
      batch_id: null,
      changed: false,
      applied: [],
      skipped: [],
      unchanged: ["bpm"],
      key: null,
    });
    renderArea();
    await onTrack(1);
    press("a");
    expect(await screen.findByText("Nothing to change for “Track 1”.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
  });

  it("R says not this track, and leaves the undoing to Track details", async () => {
    renderArea();
    await onTrack(1);
    press("r");
    await waitFor(() =>
      expect(bridge.decideMatch).toHaveBeenCalledWith({ decision: "reject", track_id: 1 }),
    );
    expect(await screen.findByText("Marked “Track 1” as not this track.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
    await onTrack(2);
  });

  it("N and the arrows move without deciding anything", async () => {
    renderArea();
    await onTrack(1);
    press("n");
    await onTrack(2);
    expect(screen.getByText("2 of 3")).toBeInTheDocument();
    press("ArrowDown");
    await onTrack(3);
    press("ArrowDown");
    expect(screen.getByText("3 of 3")).toBeInTheDocument();
    press("ArrowUp");
    await onTrack(2);
    expect(bridge.correctMatch).not.toHaveBeenCalled();
    expect(bridge.decideMatch).not.toHaveBeenCalled();
  });

  it("moves on instead when the track is still in the list it came from", async () => {
    // Another Show: the corrected track stays in "Accepted", so the cursor goes on.
    world.tracks = [
      proposed(1, { match_state: "accepted" }),
      proposed(2, { match_state: "accepted" }),
    ];
    bridge.correctMatch!.mockImplementation(async ({ track_id }: { track_id: number }) => ({
      match: {},
      track: track(track_id),
      batch_id: `batch-${track_id}`,
      changed: true,
      applied: ["bpm"],
      skipped: [],
      unchanged: [],
      key: null,
    }));
    renderArea();
    await screen.findByLabelText("Show");
    fireEvent.change(screen.getByLabelText("Show"), { target: { value: "accepted" } });
    await onTrack(1);
    press("a");
    await waitFor(() => expect(bridge.correctMatch).toHaveBeenCalledTimes(1));
    await onTrack(2);
    expect(screen.getByText("2 of 2")).toBeInTheDocument();
  });

  it("says why a decision failed, and lets it be tried again", async () => {
    bridge.correctMatch!.mockRejectedValueOnce(new Error("The engine is busy"));
    renderArea();
    await onTrack(1);
    press("a");
    expect(await screen.findByText("The engine is busy")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: /^Correct/ })).toBeEnabled());
    press("a");
    await waitFor(() => expect(bridge.correctMatch).toHaveBeenCalledTimes(2));
  });

  it("keeps the reviewer's choice of result when a match ends (CLEAN-14)", async () => {
    // A match ending reads the track's candidates again. The choice made with
    // Right must survive that, or A corrects a result nobody chose.
    const { update } = renderArea();
    await onTrack(1);
    press("ArrowRight");
    expect(screen.getByRole("button", { name: /^2 ·/ })).toHaveAttribute("aria-pressed", "true");
    const reads = bridge.getMatchCandidates!.mock.calls.length;

    update({ match: stubMatch({ ended: 1 }) });
    await waitFor(() =>
      expect(bridge.getMatchCandidates!.mock.calls.length).toBeGreaterThan(reads),
    );
    await screen.findByTestId("likelihood", undefined, LOADED);
    expect(screen.getByRole("button", { name: /^2 ·/ })).toHaveAttribute("aria-pressed", "true");

    press("a");
    await waitFor(() =>
      expect(bridge.correctMatch).toHaveBeenCalledWith(
        expect.objectContaining({ track_id: 1, candidate_id: 1002 }),
      ),
    );
  });

  it("plays the track's file with the whole list behind it", async () => {
    const playView = vi.fn().mockResolvedValue({ ok: true });
    bridge.player = { playView } as unknown as Fn;
    renderArea();
    await onTrack(1);
    press("n");
    await onTrack(2);
    press("y");
    await waitFor(() => expect(playView).toHaveBeenCalledTimes(1));
    expect(playView.mock.calls[0]![1]).toBe(1);
  });

  it("searches this track again, naming it for Past searches", async () => {
    const { props } = renderArea();
    await onTrack(1);
    fireEvent.click(screen.getByRole("button", { name: "Search again" }));
    expect(props.match.start).toHaveBeenCalledWith(
      "rematch",
      { track_ids: [1] },
      true,
      '1 track: "Track 1"',
    );
  });

  it("has no Back to Table: the Table tab is right above (K12)", async () => {
    renderArea();
    await onTrack(1);
    expect(screen.queryByRole("button", { name: "Back to Table" })).toBeNull();
    expect(screen.getByRole("tab", { name: "Table" })).toBeInTheDocument();
  });
});

describe("a cursor that moves to a row not read yet", () => {
  /** Holds back every window but the first, until released. */
  function holdLaterWindows() {
    const original = bridge.browseLibrary!.getMockImplementation() as (p: Record<string, unknown>) => Promise<unknown>;
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    bridge.browseLibrary!.mockImplementation(async (params: Record<string, unknown>) => {
      if (Number(params.offset ?? 0) > 0 && params.fields !== "id") await gate;
      return original(params);
    });
    return release;
  }

  it("does not let A correct the previous track across a page edge", async () => {
    world.tracks = Array.from({ length: 150 }, (_, index) => proposed(index + 1));
    const release = holdLaterWindows();
    renderArea();
    await onTrack(1);

    for (let step = 0; step < 100; step += 1) press("ArrowDown");
    expect(await screen.findByText("Reading the next track…", undefined, LOADED)).toBeInTheDocument();
    press("a");
    press("r");
    expect(bridge.correctMatch).not.toHaveBeenCalled();
    expect(bridge.decideMatch).not.toHaveBeenCalled();

    release();
    await onTrack(101);
    press("a");
    await waitFor(() => expect(bridge.correctMatch).toHaveBeenCalledTimes(1));
    expect(bridge.correctMatch).toHaveBeenCalledWith(expect.objectContaining({ track_id: 101 }));
  }, 30000);
});

describe("progress", () => {
  it("does not count a decided track twice while the list is read again", async () => {
    const original = bridge.browseLibrary!.getMockImplementation() as (p: Record<string, unknown>) => Promise<unknown>;
    let hold = false;
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    bridge.browseLibrary!.mockImplementation(async (params: Record<string, unknown>) => {
      if (hold && params.fields !== "id") await gate;
      return original(params);
    });
    renderArea();
    await onTrack(1);
    expect(screen.getByText("0 of 3 checked")).toBeInTheDocument();

    hold = true;
    press("a");
    expect(await screen.findByText("Corrected “Track 1”.")).toBeInTheDocument();
    // The list still holds Track 1 until it is read again: 1 checked of 3, not of 4.
    expect(screen.getByText("1 of 3 checked")).toBeInTheDocument();

    release();
    await onTrack(2);
    expect(screen.getByText("1 of 3 checked")).toBeInTheDocument();
  });

  it("reads the list again only once an Undo that runs as a job has finished", async () => {
    bridge.revertBatch!.mockResolvedValue({ job_id: "job-u", id: "job-u", state: "queued" });
    let finish: () => void = () => undefined;
    bridge.getJob!.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = () => resolve({ id: "job-u", state: "succeeded" });
        }),
    );
    renderArea();
    await onTrack(1);
    press("a");
    const undo = await screen.findByRole("button", { name: "Undo" });
    await onTrack(2);
    const reads = bridge.browseLibrary!.mock.calls.length;

    fireEvent.click(undo);
    expect(
      await screen.findByText("Undoing in the background. The bar at the bottom shows progress."),
    ).toBeInTheDocument();
    // Nothing is read again while the job runs: the tracks are not back yet.
    await waitFor(() => expect(finish).not.toBe(undefined));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(bridge.browseLibrary!.mock.calls.length).toBe(reads);
    act(() => finish());
    expect(await screen.findByText("Undid the change to “Track 1”.", undefined, LOADED)).toBeInTheDocument();
    await waitFor(() => expect(bridge.browseLibrary!.mock.calls.length).toBeGreaterThan(reads));
  });
});

describe("empty lists", () => {
  it("say nothing is waiting once everything is settled", async () => {
    world.tracks = [];
    renderArea();
    expect(await screen.findByText("Nothing is waiting for you.", undefined, LOADED)).toBeInTheDocument();
  });

  it("offer to match every track on a first visit, and what it will do (CLN-2)", async () => {
    world.tracks = [];
    const { props } = renderArea({ health: UNTOUCHED });
    expect(await screen.findByText("Match your library on Beatport", undefined, LOADED)).toBeInTheDocument();
    expect(
      screen.getByText(/CuePoint searches Beatport for each of your 3 tracks to find the right release, key and label\./),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Match all 3 tracks…" }));
    expect(props.onMatchTracks).toHaveBeenCalledWith();
  });

  it("disable that offer while a match is running", async () => {
    world.tracks = [];
    renderArea({ health: UNTOUCHED, match: stubMatch({ matching: true }) });
    expect(await screen.findByRole("button", { name: "Match all 3 tracks…" }, LOADED)).toBeDisabled();
  });

  it("say why the list could not be read", async () => {
    bridge.browseLibrary!.mockRejectedValue(new Error("The library service is not running"));
    renderArea();
    expect(
      await screen.findByText("The library service is not running", undefined, LOADED),
    ).toBeInTheDocument();
  });
});

describe("opened on a track from the Library (CLEAN-13)", () => {
  it("opens One at a time on the track's own state, with the track in the cards", async () => {
    world.tracks = [proposed(1), proposed(2), proposed(3, { match_state: "accepted" })];
    localStorage.setItem(MATCH_TAB_STORAGE_KEY, "past");
    renderArea({ focus: { trackId: 3, token: "t1" } });

    await waitFor(() => expect(screen.getByLabelText("Show")).toHaveValue("accepted"), LOADED);
    await onTrack(3);
    expect(screen.getByRole("tab", { name: "One at a time" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("heading", { name: "Track 3" })).toBeInTheDocument();
    expect(screen.getByText("1 of 1")).toBeInTheDocument();
  });

  it("opens a disputed track in the disputed list", async () => {
    world.tracks = [proposed(1), proposed(2, { match_state: "accepted", match_disputed: true })];
    renderArea({ focus: { trackId: 2, token: "t2" } });
    await waitFor(() => expect(screen.getByLabelText("Show")).toHaveValue("disputed"), LOADED);
    await onTrack(2);
  });

  it("ignores a link it has already opened", async () => {
    world.tracks = [proposed(1), proposed(2, { match_state: "accepted" })];
    const { update } = renderArea({ focus: { trackId: 2, token: "t3" } });
    await waitFor(() => expect(screen.getByLabelText("Show")).toHaveValue("accepted"), LOADED);
    fireEvent.change(screen.getByLabelText("Show"), { target: { value: "needs_review" } });
    await waitFor(() => expect(screen.getByLabelText("Show")).toHaveValue("needs_review"));
    update({ focus: { trackId: 2, token: "t3" } });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(screen.getByLabelText("Show")).toHaveValue("needs_review");
  });
});

describe("the Inspector", () => {
  it("reports the track in the cards as the selected track, with its key", async () => {
    const { getSelectedTrack, setSelectedTrack } = await import("../../../components/shell/selectedTrack");
    setSelectedTrack(null);
    world.tracks = [proposed(1, { effective_key: "8A" }), proposed(2)];
    const { unmount } = renderArea();
    await onTrack(1);
    await waitFor(() => expect(getSelectedTrack()).toEqual({ id: 1, key: "8A" }));
    press("n");
    await waitFor(() => expect(getSelectedTrack()).toEqual({ id: 2, key: null }));
    unmount();
    expect(getSelectedTrack()).toBeNull();
  });
});

describe("filters stay one question", () => {
  it("asks the Library's browse for both views with the same rules", async () => {
    renderArea();
    await onTrack(1);
    const one = lastBrowse();
    fireEvent.click(screen.getByRole("tab", { name: "Table" }));
    await screen.findByRole("region", { name: "Table" });
    await waitFor(() => expect(ruleOf(lastBrowse())).toEqual(ruleOf(one)));
    expect(lastBrowse().filters).toEqual(one.filters);
  });

  it("does not read the library at all on Past searches", async () => {
    localStorage.setItem(MATCH_TAB_STORAGE_KEY, "past");
    renderArea();
    await screen.findByRole("region", { name: "Past searches" });
    expect(within(screen.getByRole("region", { name: "Past searches" })).getByLabelText("Search")).toBeInTheDocument();
    expect(screen.queryByLabelText("Show")).toBeNull();
    expect(screen.queryByLabelText("From")).toBeNull();
  });
});
