/**
 * The Match area (C14, C22, D13): one row of Playlists and Past matches, a step caption and the
 * search; a review takes the body below that row and has a ‹ Playlists link back.
 *
 * Against the real area over a faked bridge: which tab opens and is remembered, how reviews are
 * opened (Review on a row, a match that finished for several playlists, Past matches, the
 * Inspector's link), that there is no Review tab, and the way back.
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
    { id: 8, name: "Closing", path: "", ...COUNTS, waiting: 3 },
    { id: 9, name: "Not yet", path: "", ...COUNTS, accepted: 0, not_matched: 40 },
  ],
};

function renderArea(overrides: Partial<Props> = {}) {
  const props: Props = {
    onHealthChanged: vi.fn(),
    match: stubMatch(),
    playlists: { data: PLAYLISTS, error: null, loading: false, reload: vi.fn() },
    onMatch: vi.fn(),
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

function tabNames() {
  return screen.getAllByRole("tab").map((tab) => tab.textContent);
}

describe("the sub-tabs", () => {
  it("are the small sub-tab row, not the page's big tab strip", () => {
    renderArea();
    expect(screen.getByRole("tablist")).toHaveClass("cp-tabs--sub");
  });

  it("are named, and wired to the panel they show (M474)", () => {
    renderArea();
    expect(screen.getByRole("tablist", { name: "Match views" })).toBeInTheDocument();
    const tab = screen.getByRole("tab", { name: "Playlists" });
    const panel = document.getElementById(tab.getAttribute("aria-controls")!);
    expect(panel).toHaveAttribute("role", "tabpanel");
    expect(panel).toHaveAttribute("aria-labelledby", tab.id);
  });

  it("are Playlists and Past matches, opening on Playlists", async () => {
    renderArea();
    expect(tabNames()).toEqual(["Playlists", "Past matches"]);
    expect(screen.getByRole("tab", { name: "Playlists" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("table", { name: /Your playlists/ })).toBeInTheDocument();
  });

  it("remember Past matches, and open on it again", () => {
    const { unmount } = renderArea();
    fireEvent.click(screen.getByRole("tab", { name: "Past matches" }));
    expect(localStorage.getItem(MATCH_TAB_STORAGE_KEY)).toBe("past");
    unmount();
    renderArea();
    expect(screen.getByRole("tab", { name: "Past matches" })).toHaveAttribute("aria-selected", "true");
  });

  it("open on Playlists when a tab that no longer exists was remembered", () => {
    localStorage.setItem(MATCH_TAB_STORAGE_KEY, "review");
    renderArea();
    expect(screen.getByRole("tab", { name: "Playlists" })).toHaveAttribute("aria-selected", "true");
  });
});

describe("the one row (D13)", () => {
  it("says the step and holds the search, on the same row as the sub-tabs", () => {
    renderArea();
    const row = screen.getByRole("tablist").parentElement!;
    expect(row).toHaveClass("match-area__row");
    expect(within(row).getByText("Step 1 of 3 \u00b7 Tick playlists")).toBeInTheDocument();
    expect(within(row).getByLabelText("Filter playlists")).toBeInTheDocument();
  });

  it("puts the search at the left, straight after the sub-tabs, where the Library's sits (C223)", async () => {
    renderArea();
    const row = screen.getByRole("tablist").parentElement!;
    const children = Array.from(row.children);
    const search = screen.getByLabelText("Filter playlists").closest(".match-area__search")!;
    expect(children.indexOf(search)).toBe(1);
    const css = (await import("./match.css?raw")).default;
    const rule = /\.match-area__search\s*\{([^}]*)\}/.exec(css)![1]!;
    expect(rule).not.toMatch(/margin-inline-start:\s*auto/);
  });

  it("filters the playlists with that one search", () => {
    renderArea();
    fireEvent.change(screen.getByLabelText("Filter playlists"), { target: { value: "peak" } });
    expect(screen.getByText("Peak time")).toBeInTheDocument();
    expect(screen.queryByText("Closing")).toBeNull();
  });

  it("says Matching while a match runs, and nothing on Past matches", () => {
    renderArea({ match: stubMatch({ matching: true }) });
    expect(screen.getByText("Step 2 of 3 \u00b7 Matching")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Past matches" }));
    expect(screen.queryByText(/^Step /)).toBeNull();
  });
});

describe("Review on a row", () => {
  it("opens the playlist's tracks in place of the tabs' body, with no Review tab", async () => {
    renderArea();
    fireEvent.click(screen.getByRole("button", { name: /^Review Peak time/ }));
    expect(tabNames()).toEqual(["Playlists", "Past matches"]);
    expect(screen.getByText("Step 3 of 3 \u00b7 Check and sync Peak time")).toBeInTheDocument();
    // The search belongs to the lists; a review has its own selection.
    expect(screen.queryByLabelText("Filter playlists")).toBeNull();
    await screen.findByRole("table", { name: /Every track of this playlist/ }, LOADED);
    expect(bridge.getMatchReview).toHaveBeenCalledWith({ playlistId: 7, limit: 2000 });
  });

  it("reads the whole library's matched tracks for its row", async () => {
    renderArea();
    fireEvent.click(screen.getByRole("button", { name: /^Review All tracks/ }));
    await screen.findByRole("table", { name: /Every track of this playlist/ }, LOADED);
    expect(bridge.getMatchReview).toHaveBeenCalledWith({ limit: 2000 });
  });

  it("shows one review at a time: opening another replaces it", async () => {
    renderArea();
    fireEvent.click(screen.getByRole("button", { name: /^Review Peak time/ }));
    await screen.findByRole("region", { name: "Review Peak time" }, LOADED);
    fireEvent.click(screen.getByRole("button", { name: "Playlists" }));
    fireEvent.click(screen.getByRole("button", { name: /^Review Closing/ }));
    expect(screen.getAllByRole("region", { name: /^Review / })).toHaveLength(1);
    expect(screen.getByRole("region", { name: "Review Closing" })).toBeInTheDocument();
  });

  it("puts ‹ Playlists on a line of its own below the row of tabs (D13)", async () => {
    renderArea();
    fireEvent.click(screen.getByRole("button", { name: /^Review Peak time/ }));
    const back = screen.getByRole("button", { name: "Playlists" });
    const row = screen.getByRole("tablist").parentElement!;
    expect(row.contains(back)).toBe(false);
    expect(back.closest(".match-area__back")).not.toBeNull();
  });

  it("goes back with ‹ Playlists, and lands on Playlists", async () => {
    renderArea();
    fireEvent.click(screen.getByRole("button", { name: /^Review Peak time/ }));
    await screen.findByRole("table", { name: /Every track of this playlist/ }, LOADED);
    fireEvent.click(screen.getByRole("button", { name: "Playlists" }));
    expect(screen.queryByRole("region", { name: /^Review / })).toBeNull();
    expect(screen.getByRole("tab", { name: "Playlists" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Step 1 of 3 \u00b7 Tick playlists")).toBeInTheDocument();
  });

  it("goes back by choosing either sub-tab", async () => {
    renderArea();
    fireEvent.click(screen.getByRole("button", { name: /^Review Peak time/ }));
    await screen.findByRole("region", { name: "Review Peak time" }, LOADED);
    fireEvent.click(screen.getByRole("tab", { name: "Past matches" }));
    expect(screen.queryByRole("region", { name: /^Review / })).toBeNull();
    expect(screen.getByRole("tab", { name: "Past matches" })).toHaveAttribute("aria-selected", "true");
  });
});

describe("Match", () => {
  it("passes what is ticked up to the page, which starts the run", () => {
    const { props } = renderArea();
    fireEvent.click(screen.getByRole("checkbox", { name: "Match Peak time" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Match Closing" }));
    fireEvent.click(screen.getByRole("button", { name: "Match ticked playlists" }));
    expect(props.onMatch).toHaveBeenCalledWith({ whole: false, playlists: [PLAYLISTS.playlists[0], PLAYLISTS.playlists[1]] });
  });
});

describe("a review opened from the page", () => {
  it("opens the first playlist a match finished on, once per opening", async () => {
    const opening = {
      token: "a",
      targets: [
        { playlistId: 7, name: "Peak time" },
        { playlistId: 8, name: "Closing" },
      ],
    };
    const onReviewOpened = vi.fn();
    const { update } = renderArea({ reviewOpening: opening, onReviewOpened });
    expect(await screen.findByRole("region", { name: "Review Peak time" }, LOADED)).toBeInTheDocument();
    expect(tabNames()).toEqual(["Playlists", "Past matches"]);
    expect(onReviewOpened).toHaveBeenCalledTimes(1);
    // Used once: going back and coming back to the area does not open it again.
    fireEvent.click(screen.getByRole("button", { name: "Playlists" }));
    update({ reviewOpening: opening });
    expect(screen.queryByRole("region", { name: /^Review / })).toBeNull();
    await waitFor(() => expect(onReviewOpened).toHaveBeenCalledTimes(1));
  });

  it("opens the whole library's review for a whole-library match", async () => {
    renderArea({ reviewOpening: { token: "w", targets: [{ playlistId: null, name: "All tracks" }] } });
    expect(await screen.findByRole("region", { name: "Review All tracks" }, LOADED)).toBeInTheDocument();
  });
});

describe("Past matches", () => {
  it("opens a run's review from its row, all of its tracks", async () => {
    world.runs = [run({ job_id: "job-9", label: "Peak time" })];
    renderArea();
    fireEvent.click(screen.getByRole("tab", { name: "Past matches" }));
    fireEvent.click(await screen.findByRole("button", { name: /^Open/ }, LOADED));
    expect(await screen.findByRole("region", { name: "Review Peak time" }, LOADED)).toBeInTheDocument();
    await screen.findByRole("table", { name: /Every track of this playlist/ }, LOADED);
    expect(bridge.getMatchReview).toHaveBeenCalledWith({ jobId: "job-9", limit: 2000 });
  });

  it("has its own search on the shared row", async () => {
    world.runs = [run({ job_id: "job-9", label: "Peak time" })];
    renderArea();
    fireEvent.click(screen.getByRole("tab", { name: "Past matches" }));
    expect(screen.getByLabelText("Search past matches")).toBeInTheDocument();
    expect(screen.queryByLabelText("Filter playlists")).toBeNull();
  });
});

describe("the Inspector's link", () => {
  it("opens the library's review with that track's panel", async () => {
    renderArea({ focus: { token: "t", trackId: 3 } });
    expect(await screen.findByRole("region", { name: "Review All tracks" }, LOADED)).toBeInTheDocument();
    const panel = await screen.findByRole("complementary", { name: /^Candidates for / }, LOADED);
    expect(within(panel).getByText("3 of 3")).toBeInTheDocument();
  });
});

describe("what the page is told", () => {
  it("says which tab is open, and whether a review's panel is", async () => {
    const onViewChange = vi.fn();
    renderArea({ onViewChange });
    expect(onViewChange).toHaveBeenLastCalledWith({ tab: "playlists", panelOpen: false });
    fireEvent.click(screen.getByRole("button", { name: /^Review Peak time/ }));
    expect(onViewChange).toHaveBeenLastCalledWith({ tab: "review", panelOpen: false });
    const row = (await screen.findAllByRole("row", undefined, LOADED)).find((entry) => entry.hasAttribute("data-track-id"))!;
    fireEvent.click(row);
    await waitFor(() => expect(onViewChange).toHaveBeenLastCalledWith({ tab: "review", panelOpen: true }));
  });
});

describe("opening on the tracks to check (D17)", () => {
  it("opens the whole library's review on To check only when tracks wait, and only once", async () => {
    const { update } = renderArea({ toCheck: 5 });
    expect(await screen.findByRole("region", { name: "Review All tracks" }, LOADED)).toBeInTheDocument();
    expect(await screen.findByRole("checkbox", { name: /^To check only/ }, LOADED)).toBeChecked();
    // Back to the list: it does not jump into the review again.
    fireEvent.click(screen.getByRole("button", { name: "Playlists" }));
    update({ toCheck: 6 });
    expect(screen.queryByRole("region", { name: /^Review / })).toBeNull();
  });

  it("stays on the playlists when nothing waits", async () => {
    renderArea({ toCheck: 0 });
    await screen.findByText("Peak time");
    expect(screen.queryByRole("region", { name: /^Review / })).toBeNull();
  });

  it("waits for Health: nothing opens while the count is not known", async () => {
    renderArea({ toCheck: null });
    await screen.findByText("Peak time");
    expect(screen.queryByRole("region", { name: /^Review / })).toBeNull();
  });
});
