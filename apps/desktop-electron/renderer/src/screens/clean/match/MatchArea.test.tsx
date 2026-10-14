/**
 * The Match area (C14, C22): Playlists, the Review of a run, and Past searches.
 *
 * Against the real area over a faked bridge: which tab opens and is remembered, how a review is
 * opened (Review N ›, See them ›, a match that finished, Past searches, the Inspector's link), what
 * it is a review of (a run, or the playlist when the run holds less than the row waits on), and
 * the way back.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ComponentProps } from "react";

import type { CleanPlaylists } from "../../../api/cuepointBridge.types";
import { ToastProvider } from "../../../components";
import { ScaleProvider } from "../../../tokens/ScaleContext";
import { installMatchBridge, newWorld, removeMatchBridge, type MatchWorld } from "../../../test/matchHarness";
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
    { id: 9, name: "Found nothing", path: "", ...COUNTS, track_count: 24, accepted: 0, no_match: 24 },
  ],
};

function renderArea(overrides: Partial<Props> = {}) {
  const props: Props = {
    onHealthChanged: vi.fn(),
    match: stubMatch(),
    playlists: { data: PLAYLISTS, error: null, loading: false, reload: vi.fn() },
    onMatchPlaylist: vi.fn(),
    ...overrides,
  };
  const view = render(element(props));
  return { props, ...view, update: (next: Partial<Props>) => view.rerender(element({ ...props, ...next })) };
}

beforeEach(() => {
  localStorage.clear();
  world = newWorld();
  world.review = [reviewTrack(1, "to_check"), reviewTrack(2, "not_found"), reviewTrack(3, "matched")];
  bridge = installMatchBridge(world);
});

afterEach(() => {
  removeMatchBridge();
  vi.restoreAllMocks();
});

describe("the sub-tabs", () => {
  it("are Playlists and Past searches, opening on Playlists, with no One at a time and no Table", async () => {
    renderArea();
    const tabs = await screen.findAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual(["Playlists", "Past searches"]);
    expect(screen.getByRole("tab", { name: "Playlists" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("table", { name: /Your playlists/ })).toBeInTheDocument();
  });

  it("remembers Past searches, and opens on Playlists for a tab that no longer exists", async () => {
    localStorage.setItem(MATCH_TAB_STORAGE_KEY, "past");
    const first = renderArea();
    expect(await screen.findByRole("tab", { name: "Past searches" })).toHaveAttribute("aria-selected", "true");
    first.unmount();

    for (const gone of ["one", "table", "review", "nonsense"]) {
      localStorage.setItem(MATCH_TAB_STORAGE_KEY, gone);
      const view = renderArea();
      expect(await screen.findByRole("tab", { name: "Playlists" })).toHaveAttribute("aria-selected", "true");
      view.unmount();
    }
  });

  it("says up which tab is open, and whether a review's details are", async () => {
    const onViewChange = vi.fn();
    renderArea({ onViewChange });
    await waitFor(() => expect(onViewChange).toHaveBeenLastCalledWith({ tab: "playlists", panelOpen: false }));
    fireEvent.click(screen.getByRole("tab", { name: "Past searches" }));
    expect(onViewChange).toHaveBeenLastCalledWith({ tab: "past", panelOpen: false });
    expect(localStorage.getItem(MATCH_TAB_STORAGE_KEY)).toBe("past");
  });

  it("says a review's details are open, so a match that ends does not land over them", async () => {
    const onViewChange = vi.fn();
    renderArea({ onViewChange, focus: { trackId: 3, token: "f1" } });
    await screen.findByRole("complementary", { name: "Track details" }, LOADED);
    await waitFor(() => expect(onViewChange).toHaveBeenLastCalledWith({ tab: "review", panelOpen: true }));
  });
});

describe("Review N ›", () => {
  it("opens the review of the playlist, in a tab named for it", async () => {
    renderArea();
    fireEvent.click(screen.getByRole("button", { name: "Review 18 › for Peak time" }));
    expect(await screen.findByRole("tab", { name: "Review Peak time" }, LOADED)).toHaveAttribute("aria-selected", "true");
    expect(bridge.getMatchReview).toHaveBeenCalledWith({ playlistId: 7, limit: 2000 });
    expect(await screen.findByRole("region", { name: "Review Peak time" }, LOADED)).toBeInTheDocument();
    // Review is not a tab to come back to: the area still opens on Playlists.
    expect(localStorage.getItem(MATCH_TAB_STORAGE_KEY)).not.toBe("review");
  });

  it("opens the review of the whole library from its row", async () => {
    renderArea();
    fireEvent.click(screen.getByRole("button", { name: "Review 18 › for Whole library" }));
    expect(await screen.findByRole("tab", { name: "Review Whole library" }, LOADED)).toBeInTheDocument();
    expect(bridge.getMatchReview).toHaveBeenCalledWith({ limit: 2000 });
  });

  it("opens on the run the row's last Match started, when that run holds what the row waits on", async () => {
    world.runs = [run({ job_id: "job-9", waiting: 18, not_found: 0 })];
    renderArea({ runFor: (playlist) => (playlist?.id === 7 ? "job-9" : undefined) });
    fireEvent.click(screen.getByRole("button", { name: "Review 18 › for Peak time" }));
    await waitFor(() => expect(bridge.getMatchReview).toHaveBeenCalledWith({ jobId: "job-9", limit: 2000 }), LOADED);
  });

  it("opens on the playlist, and forgets the run, when the run holds less than the row waits on", async () => {
    world.runs = [run({ job_id: "job-9", waiting: 3, not_found: 0 })];
    const onRunSpent = vi.fn();
    renderArea({ runFor: () => "job-9", onRunSpent });
    fireEvent.click(screen.getByRole("button", { name: "Review 18 › for Peak time" }));
    await waitFor(() => expect(bridge.getMatchReview).toHaveBeenCalledWith({ playlistId: 7, limit: 2000 }), LOADED);
    expect(onRunSpent).toHaveBeenCalledWith(7);
  });

  it("goes back to the rows with ‹ Playlists, and the Review tab goes", async () => {
    renderArea();
    fireEvent.click(screen.getByRole("button", { name: "Review 18 › for Peak time" }));
    await screen.findByRole("region", { name: "Review Peak time" }, LOADED);
    fireEvent.click(await screen.findByRole("button", { name: "Playlists" }, LOADED));
    expect(await screen.findByRole("table", { name: /Your playlists/ })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Review Peak time" })).toBeNull();
  });

  it("saves that playlist's values from the end screen, and nothing before", async () => {
    world.review = [reviewTrack(1, "done")];
    const onSavePlaylist = vi.fn();
    renderArea({
      onSavePlaylist,
      reviewOpening: { token: "t", run: run({ job_id: "job-8" }), playlistId: 8, name: "Closing" },
    });
    await screen.findByText("Closing is reviewed", undefined, LOADED);
    expect(onSavePlaylist).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Save 5 to files…" }));
    expect(onSavePlaylist).toHaveBeenCalledWith(PLAYLISTS.playlists[1]);
  });
});

describe("saving a past search's review", () => {
  it("counts the run's own unsaved tracks for the Save button, and saves that run", async () => {
    world.review = [reviewTrack(1, "done")];
    const countRunUnsaved = vi.fn().mockResolvedValue(7);
    const onSaveRun = vi.fn();
    renderArea({
      countRunUnsaved,
      onSaveRun,
      reviewOpening: { token: "t", run: run({ job_id: "job-5" }), playlistId: null, name: "Whole library" },
    });
    await screen.findByText("Whole library is reviewed", undefined, LOADED);
    await waitFor(() => expect(countRunUnsaved).toHaveBeenCalledWith("job-5"));
    fireEvent.click(await screen.findByRole("button", { name: "Save 7 to files…" }));
    expect(onSaveRun).toHaveBeenCalledWith("job-5");
  });
});

describe("See them ›", () => {
  it("opens the review on the tracks that were not found", async () => {
    renderArea();
    fireEvent.click(screen.getByRole("button", { name: "See them › for Found nothing" }));
    await screen.findByRole("region", { name: "Review Found nothing" }, LOADED);
    expect(bridge.getMatchReview).toHaveBeenCalledWith({ playlistId: 9, filter: "not_found", limit: 2000 });
    await waitFor(() => expect(screen.getByRole("button", { name: "Not found 1" })).toHaveAttribute("aria-pressed", "true"));
  });
});

describe("a review opened from the page", () => {
  const opening = {
    token: "t1",
    run: run({ job_id: "job-7", label: "hJ" }),
    playlistId: 7,
    name: "hJ",
  };

  it("opens the run's review once, and says it was used", async () => {
    const onReviewOpened = vi.fn();
    const { update } = renderArea({ reviewOpening: opening, onReviewOpened });
    expect(await screen.findByRole("tab", { name: "Review hJ" }, LOADED)).toHaveAttribute("aria-selected", "true");
    expect(bridge.getMatchReview).toHaveBeenCalledWith({ jobId: "job-7", limit: 2000 });
    expect(onReviewOpened).toHaveBeenCalledTimes(1);

    // Leaving, and the same opening arriving again, does not reopen it.
    fireEvent.click(await screen.findByRole("button", { name: "Playlists" }, LOADED));
    update({ reviewOpening: opening, onReviewOpened });
    expect(screen.queryByRole("tab", { name: "Review hJ" })).toBeNull();
  });

  it("opens on a chip when asked to: the run that found nothing opens on Not found", async () => {
    world.review = [reviewTrack(1, "not_found"), reviewTrack(2, "not_found")];
    renderArea({ reviewOpening: { ...opening, filter: "not_found" } });
    await waitFor(() => expect(screen.getByRole("button", { name: "Not found 2" })).toHaveAttribute("aria-pressed", "true"), LOADED);
  });

  it("reads the list again when a match ends", async () => {
    const { update } = renderArea({ reviewOpening: opening });
    await screen.findByRole("region", { name: "Review hJ" }, LOADED);
    const reads = bridge.getMatchReview!.mock.calls.length;
    update({ match: stubMatch({ ended: 1 }) });
    await waitFor(() => expect(bridge.getMatchReview!.mock.calls.length).toBeGreaterThan(reads));
  });
});

describe("the Inspector's link", () => {
  it("opens the library's review on that track's details", async () => {
    renderArea({ focus: { trackId: 3, token: "f1" } });
    expect(await screen.findByRole("tab", { name: "Review Whole library" }, LOADED)).toBeInTheDocument();
    const panel = await screen.findByRole("complementary", { name: "Track details" }, LOADED);
    expect(panel).toHaveTextContent("Track 3");
    expect(bridge.getMatchReview).toHaveBeenCalledWith({ limit: 2000 });
  });
});

describe("a track searched again from the review", () => {
  it("starts a match of that one track, under its own name", async () => {
    world.review = [reviewTrack(6, "search_failed")];
    const start = vi.fn();
    renderArea({ match: stubMatch({ start }), reviewOpening: { token: "t", run: run(), playlistId: 7, name: "hJ" } });
    const row = await screen.findByRole("row", { name: /Track 6/ }, LOADED);
    fireEvent.click(within(row).getByRole("button", { name: "Match again: Track 6" }));
    expect(start).toHaveBeenCalledWith("rematch", { track_ids: [6] }, true, '1 track: "Track 6"');
  });
});
