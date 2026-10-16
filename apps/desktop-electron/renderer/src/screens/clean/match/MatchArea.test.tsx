/**
 * The Match area (C14, C22): Playlists, one Review tab per playlist, and Past searches.
 *
 * Against the real area over a faked bridge: which tab opens and is remembered, how reviews are
 * opened (Review on a row, a match that finished for several playlists, Past searches, the
 * Inspector's link), that each playlist has its own tab and the whole library only its own, and the
 * way back.
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
    { id: 8, name: "Closing", path: "", ...COUNTS },
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

  it("are Playlists and Past searches, opening on Playlists", async () => {
    renderArea();
    expect(tabNames()).toEqual(["Playlists", "Past searches"]);
    expect(screen.getByRole("tab", { name: "Playlists" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("table", { name: /Your playlists/ })).toBeInTheDocument();
  });

  it("remember Past searches, and open on it again", () => {
    const { unmount } = renderArea();
    fireEvent.click(screen.getByRole("tab", { name: "Past searches" }));
    expect(localStorage.getItem(MATCH_TAB_STORAGE_KEY)).toBe("past");
    unmount();
    renderArea();
    expect(screen.getByRole("tab", { name: "Past searches" })).toHaveAttribute("aria-selected", "true");
  });

  it("open on Playlists when a tab that no longer exists was remembered", () => {
    localStorage.setItem(MATCH_TAB_STORAGE_KEY, "review");
    renderArea();
    expect(screen.getByRole("tab", { name: "Playlists" })).toHaveAttribute("aria-selected", "true");
  });
});

describe("Review on a row", () => {
  it("opens a tab named for the playlist, reading that playlist's tracks", async () => {
    renderArea();
    fireEvent.click(screen.getByRole("button", { name: "Review Peak time" }));
    expect(tabNames()).toEqual(["Playlists", "Review Peak time", "Past searches"]);
    expect(screen.getByRole("tab", { name: "Review Peak time" })).toHaveAttribute("aria-selected", "true");
    await screen.findByRole("table", { name: /Every track of this playlist/ }, LOADED);
    expect(bridge.getMatchReview).toHaveBeenCalledWith({ playlistId: 7, limit: 2000 });
  });

  it("reads the whole library's matched tracks for its row, in a tab of its own", async () => {
    renderArea();
    fireEvent.click(screen.getByRole("button", { name: "Review Whole library" }));
    expect(tabNames()).toContain("Review Whole library");
    await screen.findByRole("table", { name: /Every track of this playlist/ }, LOADED);
    expect(bridge.getMatchReview).toHaveBeenCalledWith({ limit: 2000 });
  });

  it("gives each playlist its own tab, and brings an open one forward instead of opening it twice", async () => {
    renderArea();
    fireEvent.click(screen.getByRole("button", { name: "Review Peak time" }));
    fireEvent.click(screen.getByRole("tab", { name: "Playlists" }));
    fireEvent.click(screen.getByRole("button", { name: "Review Closing" }));
    expect(tabNames()).toEqual(["Playlists", "Review Peak time", "Review Closing", "Past searches"]);
    fireEvent.click(screen.getByRole("tab", { name: "Playlists" }));
    fireEvent.click(screen.getByRole("button", { name: "Review Peak time" }));
    expect(tabNames()).toHaveLength(4);
    expect(screen.getByRole("tab", { name: "Review Peak time" })).toHaveAttribute("aria-selected", "true");
  });

  it("closes the tab with ‹ Playlists, and lands on Playlists", async () => {
    renderArea();
    fireEvent.click(screen.getByRole("button", { name: "Review Peak time" }));
    await screen.findByRole("table", { name: /Every track of this playlist/ }, LOADED);
    fireEvent.click(screen.getByRole("button", { name: "Close review" }));
    expect(tabNames()).toEqual(["Playlists", "Past searches"]);
    expect(screen.getByRole("tab", { name: "Playlists" })).toHaveAttribute("aria-selected", "true");
  });
});

describe("Match", () => {
  it("passes what is ticked up to the page, which starts the run", () => {
    const { props } = renderArea();
    fireEvent.click(screen.getByRole("checkbox", { name: "Match Peak time" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Match Closing" }));
    fireEvent.click(screen.getByRole("button", { name: "Match 2 playlists" }));
    expect(props.onMatch).toHaveBeenCalledWith({ whole: false, playlists: [PLAYLISTS.playlists[0], PLAYLISTS.playlists[1]] });
  });
});

describe("a review opened from the page", () => {
  it("opens a tab for each playlist a match finished on, once per opening", async () => {
    const opening = {
      token: "a",
      targets: [
        { playlistId: 7, name: "Peak time" },
        { playlistId: 8, name: "Closing" },
      ],
    };
    const onReviewOpened = vi.fn();
    const { update } = renderArea({ reviewOpening: opening, onReviewOpened });
    expect(tabNames()).toEqual(["Playlists", "Review Peak time", "Review Closing", "Past searches"]);
    expect(screen.getByRole("tab", { name: "Review Peak time" })).toHaveAttribute("aria-selected", "true");
    expect(onReviewOpened).toHaveBeenCalledTimes(1);
    // Used once: coming back to the area does not open them again.
    fireEvent.click(await screen.findByRole("button", { name: "Close review" }, LOADED));
    update({ reviewOpening: opening });
    expect(tabNames()).toEqual(["Playlists", "Review Closing", "Past searches"]);
    await waitFor(() => expect(onReviewOpened).toHaveBeenCalledTimes(1));
  });

  it("opens only the whole library's tab for a whole-library match", () => {
    renderArea({ reviewOpening: { token: "w", targets: [{ playlistId: null, name: "Whole library" }] } });
    expect(tabNames()).toEqual(["Playlists", "Review Whole library", "Past searches"]);
  });
});

describe("Past searches", () => {
  it("opens a run's review in its own tab, all of its tracks", async () => {
    world.runs = [run({ job_id: "job-9", label: "Peak time" })];
    renderArea();
    fireEvent.click(screen.getByRole("tab", { name: "Past searches" }));
    fireEvent.click(await screen.findByRole("button", { name: /^Open/ }, LOADED));
    expect(screen.getByRole("tab", { name: "Review Peak time" })).toHaveAttribute("aria-selected", "true");
    await screen.findByRole("table", { name: /Every track of this playlist/ }, LOADED);
    expect(bridge.getMatchReview).toHaveBeenCalledWith({ jobId: "job-9", limit: 2000 });
  });
});

describe("the Inspector's link", () => {
  it("opens the library's review with that track's panel", async () => {
    renderArea({ focus: { token: "t", trackId: 3 } });
    expect(tabNames()).toContain("Review Whole library");
    const panel = await screen.findByRole("complementary", { name: /^Candidates for / }, LOADED);
    expect(within(panel).getByText("3 of 3")).toBeInTheDocument();
  });
});

describe("what the page is told", () => {
  it("says which tab is open, and whether a review's panel is", async () => {
    const onViewChange = vi.fn();
    renderArea({ onViewChange });
    expect(onViewChange).toHaveBeenLastCalledWith({ tab: "playlists", panelOpen: false });
    fireEvent.click(screen.getByRole("button", { name: "Review Peak time" }));
    expect(onViewChange).toHaveBeenLastCalledWith({ tab: "review", panelOpen: false });
    const row = (await screen.findAllByRole("row", undefined, LOADED)).find((entry) => entry.hasAttribute("data-track-id"))!;
    fireEvent.click(row);
    await waitFor(() => expect(onViewChange).toHaveBeenLastCalledWith({ tab: "review", panelOpen: true }));
  });
});
