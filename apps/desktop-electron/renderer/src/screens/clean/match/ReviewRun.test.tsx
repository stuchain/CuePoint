/**
 * The review of a run (the Review tab): every track of one search, one click to decide each.
 *
 * Against the real list over a faked bridge: what each row says and offers by its status, the chips
 * and the bar, deciding (Correct, Not this, Leave unmatched, Undo, Confirm all) and the rows that
 * move to the bottom, the details and search panels beside the list with their keys, and the
 * screen when every row is decided.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ComponentProps } from "react";

import { ToastProvider } from "../../../components";
import { ScaleProvider } from "../../../tokens/ScaleContext";
import { installMatchBridge, newWorld, removeMatchBridge, type MatchWorld } from "../../../test/matchHarness";
import { matchesFor, reviewTrack } from "../../../test/matchFixtures";
import { MATCH_TICKS_STORAGE_KEY } from "./useMatchTicks";
import { ReviewRun } from "./ReviewRun";

type Fn = ReturnType<typeof vi.fn>;
type Props = ComponentProps<typeof ReviewRun>;

const LOADED = { timeout: 3000 };

let bridge: Record<string, Fn>;
let world: MatchWorld;

function rows() {
  return [
    reviewTrack(1, "to_check"),
    reviewTrack(2, "to_check", { differing: ["title"] }),
    reviewTrack(3, "not_found"),
    reviewTrack(4, "matched"),
    reviewTrack(5, "done"),
    reviewTrack(6, "search_failed"),
  ];
}

function element(props: Props) {
  return (
    <ScaleProvider>
      <ToastProvider>
        <ReviewRun {...props} />
      </ToastProvider>
    </ScaleProvider>
  );
}

function renderReview(overrides: Partial<Props> = {}) {
  const props: Props = {
    source: { jobId: "job-1" },
    name: "hJ",
    version: 0,
    matching: false,
    saveCount: 0,
    onBack: vi.fn(),
    onChanged: vi.fn(),
    onSearchAgain: vi.fn(),
    ...overrides,
  };
  return { props, ...render(element(props)) };
}

/** The table's rows in the order drawn, by track id. */
function order(): number[] {
  return screen
    .getAllByRole("row")
    .slice(1)
    .map((row) => Number(row.getAttribute("data-track-id")));
}

function rowOf(id: number): HTMLElement {
  const row = screen.getAllByRole("row").find((entry) => entry.getAttribute("data-track-id") === String(id));
  if (!row) throw new Error(`no row for track ${id}`);
  return row;
}

async function loaded() {
  await screen.findByRole("table", undefined, LOADED);
}

function press(key: string, init: KeyboardEventInit = {}) {
  act(() => {
    fireEvent.keyDown(window, { key, ...init });
  });
}

beforeEach(() => {
  localStorage.clear();
  world = newWorld();
  world.review = rows();
  bridge = installMatchBridge(world);
});

afterEach(() => {
  removeMatchBridge();
  vi.restoreAllMocks();
});

describe("the list", () => {
  it("reads every track of the run, decided ones last", async () => {
    renderReview();
    await loaded();
    expect(bridge.getMatchReview).toHaveBeenCalledWith({ jobId: "job-1", limit: 2000 });
    expect(order()).toEqual([1, 2, 3, 4, 6, 5]);
  });

  it("says what each row is: its status, your track, the Beatport match and what differs", async () => {
    renderReview();
    await loaded();
    const first = within(rowOf(1));
    expect(first.getByText("To check")).toBeInTheDocument();
    expect(first.getByText("Track 1 · Artist 1")).toBeInTheDocument();
    expect(first.getByText("Track 1 (Extended Mix) · Beatport Artist 1")).toBeInTheDocument();
    expect(first.getByText("remix")).toBeInTheDocument();
    expect(within(rowOf(2)).getByText("title")).toBeInTheDocument();
    // A match where nothing differs gets a tick; one not found has a dash and nothing differing.
    expect(within(rowOf(4)).getByText("✓")).toBeInTheDocument();
    expect(within(rowOf(3)).getByText("—")).toBeInTheDocument();
    expect(within(rowOf(3)).getByText("Not found")).toBeInTheDocument();
    expect(within(rowOf(6)).getByText("Search failed")).toBeInTheDocument();
    expect(within(rowOf(4)).getByText("Matched")).toBeInTheDocument();
    expect(within(rowOf(5)).getByText("Done")).toBeInTheDocument();
  });

  it("dims a decided row", async () => {
    renderReview();
    await loaded();
    expect(rowOf(5)).toHaveClass("review-row--done");
    expect(rowOf(1)).not.toHaveClass("review-row--done");
  });

  it("names the run and how many tracks, with ‹ Playlists going back", async () => {
    const { props } = renderReview();
    await loaded();
    expect(screen.getByText("hJ · 6 tracks")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Playlists" }));
    expect(props.onBack).toHaveBeenCalledTimes(1);
  });

  it("says why when it cannot be read", async () => {
    bridge.getMatchReview!.mockRejectedValueOnce(new Error("The engine is not running."));
    renderReview();
    expect(await screen.findByRole("alert", undefined, LOADED)).toBeInTheDocument();
  });
});

describe("the chips and the bar", () => {
  it("count each status, and filter by it", async () => {
    renderReview();
    await loaded();
    const group = screen.getByRole("group", { name: "Show" });
    expect(within(group).getByRole("button", { name: "All 6" })).toHaveAttribute("aria-pressed", "true");
    expect(within(group).getByRole("button", { name: "To check 2" })).toBeInTheDocument();
    expect(within(group).getByRole("button", { name: "Not found 1" })).toBeInTheDocument();
    expect(within(group).getByRole("button", { name: "Search failed 1" })).toBeInTheDocument();
    expect(within(group).getByRole("button", { name: "Matched 1" })).toBeInTheDocument();
    expect(within(group).getByRole("button", { name: "Done 1" })).toBeInTheDocument();

    fireEvent.click(within(group).getByRole("button", { name: "To check 2" }));
    expect(order()).toEqual([1, 2]);
    expect(within(group).getByRole("button", { name: "To check 2" })).toHaveAttribute("aria-pressed", "true");
    // The engine does the filtering, so it holds for a run bigger than the page.
    await waitFor(() => expect(bridge.getMatchReview).toHaveBeenLastCalledWith(expect.objectContaining({ filter: "to_check" })));
    fireEvent.click(within(group).getByRole("button", { name: "Not found 1" }));
    await waitFor(() => expect(order()).toEqual([3]));
    fireEvent.click(within(group).getByRole("button", { name: "All 6" }));
    await waitFor(() => expect(order()).toHaveLength(6));
  });

  it("draws one coloured segment for each status that holds tracks", async () => {
    renderReview();
    await loaded();
    expect(screen.getByRole("img", { name: "2 to check, 1 not found, 1 search failed, 1 matched, 1 done" })).toBeInTheDocument();
    expect(document.querySelectorAll(".review-band__segment")).toHaveLength(5);
  });

  it("opens on the chip it was asked to", async () => {
    renderReview({ initialFilter: "not_found" });
    await loaded();
    expect(order()).toEqual([3]);
  });
});

describe("what each status offers", () => {
  it("to check: Correct, Not this and Details", async () => {
    renderReview();
    await loaded();
    const row = within(rowOf(1));
    expect(row.getByRole("button", { name: "Correct: Track 1" })).toBeEnabled();
    expect(row.getByRole("button", { name: "Not this: Track 1" })).toBeEnabled();
    expect(row.getByRole("button", { name: "Details of Track 1" })).toBeEnabled();
    expect(row.getAllByRole("button")).toHaveLength(4); // and the preview
  });

  it("not found: Search and Leave unmatched", async () => {
    renderReview();
    await loaded();
    const row = within(rowOf(3));
    expect(row.getByRole("button", { name: "Search for Track 3" })).toBeInTheDocument();
    expect(row.getByRole("button", { name: "Leave unmatched: Track 3" })).toBeInTheDocument();
    expect(row.getAllByRole("button")).toHaveLength(2);
  });

  it("search failed: Search and Match again, which waits while a match runs and says why", async () => {
    const { props, unmount } = renderReview();
    await loaded();
    const row = within(rowOf(6));
    expect(row.getByRole("button", { name: "Search for Track 6" })).toBeInTheDocument();
    fireEvent.click(row.getByRole("button", { name: "Match again: Track 6" }));
    expect(props.onSearchAgain).toHaveBeenCalledWith({ id: 6, title: "Track 6" });
    unmount();

    renderReview({ matching: true });
    await loaded();
    const waiting = within(rowOf(6)).getByRole("button", { name: "Match again: Track 6" });
    expect(waiting).toBeDisabled();
    expect(waiting).toHaveAttribute("title", "One match at a time: wait for the one that is running.");
  });

  it("matched: Not this and Details", async () => {
    renderReview();
    await loaded();
    const row = within(rowOf(4));
    expect(row.getByRole("button", { name: "Not this: Track 4" })).toBeInTheDocument();
    expect(row.getByRole("button", { name: "Details of Track 4" })).toBeInTheDocument();
    expect(row.queryByRole("button", { name: /^Correct/ })).toBeNull();
  });

  it("done: Undo only", async () => {
    renderReview();
    await loaded();
    const row = within(rowOf(5));
    expect(row.getByRole("button", { name: "Undo: Track 5" })).toBeInTheDocument();
    expect(row.queryByRole("button", { name: /Details/ })).toBeNull();
  });
});

describe("deciding from a row", () => {
  it("Correct accepts the match with the ticked values, then the row is done and moves to the bottom", async () => {
    const { props } = renderReview();
    await loaded();
    fireEvent.click(within(rowOf(1)).getByRole("button", { name: "Correct: Track 1" }));

    await waitFor(() =>
      expect(bridge.correctMatch).toHaveBeenCalledWith({
        track_id: 1,
        candidate_id: 1001,
        fields: ["bpm", "genre", "label", "year"],
      }),
    );
    await waitFor(() => expect(order()).toEqual([2, 3, 4, 6, 1, 5]), LOADED);
    expect(within(rowOf(1)).getByText("Done")).toBeInTheDocument();
    expect(props.onChanged).toHaveBeenCalled();
  });

  it("Correct sends the values the person ticked, and replaces the key only when asked", async () => {
    localStorage.setItem(MATCH_TICKS_STORAGE_KEY, JSON.stringify(["key", "bpm"]));
    renderReview();
    await loaded();
    fireEvent.click(within(rowOf(1)).getByRole("button", { name: "Correct: Track 1" }));
    await waitFor(() =>
      expect(bridge.correctMatch).toHaveBeenCalledWith({
        track_id: 1,
        candidate_id: 1001,
        fields: ["bpm"],
        replace_key: true,
      }),
    );
  });

  it("Not this refuses the match", async () => {
    renderReview();
    await loaded();
    fireEvent.click(within(rowOf(4)).getByRole("button", { name: "Not this: Track 4" }));
    await waitFor(() => expect(bridge.decideMatch).toHaveBeenCalledWith({ decision: "reject", track_id: 4 }));
    await waitFor(() => expect(within(rowOf(4)).getByText("Done")).toBeInTheDocument(), LOADED);
  });

  it("Leave unmatched refuses it too, and the row is done", async () => {
    renderReview();
    await loaded();
    fireEvent.click(within(rowOf(3)).getByRole("button", { name: "Leave unmatched: Track 3" }));
    await waitFor(() => expect(bridge.decideMatch).toHaveBeenCalledWith({ decision: "reject", track_id: 3 }));
    await waitFor(() => expect(order()).toEqual([1, 2, 4, 6, 3, 5]), LOADED);
  });

  it("Undo takes back the batch Correct just made", async () => {
    renderReview();
    await loaded();
    fireEvent.click(within(rowOf(1)).getByRole("button", { name: "Correct: Track 1" }));
    await waitFor(() => expect(within(rowOf(1)).getByText("Done")).toBeInTheDocument(), LOADED);
    fireEvent.click(within(rowOf(1)).getByRole("button", { name: "Undo: Track 1" }));
    await waitFor(() => expect(bridge.revertBatch).toHaveBeenCalledWith({ batch_id: "batch-1", track_id: 1 }));
    await waitFor(() => expect(within(rowOf(1)).getByText("To check")).toBeInTheDocument(), LOADED);
  });

  it("Undo on a row decided in an earlier visit reverts the batch the engine names, values included", async () => {
    // A new mount knows nothing of this session: the engine says which batch is behind the decision.
    renderReview();
    await loaded();
    fireEvent.click(within(rowOf(5)).getByRole("button", { name: "Undo: Track 5" }));
    await waitFor(() => expect(bridge.revertBatch).toHaveBeenCalledWith({ batch_id: "batch-5", track_id: 5 }));
    expect(bridge.decideMatch).not.toHaveBeenCalled();
    await waitFor(() => expect(within(rowOf(5)).getByText("To check")).toBeInTheDocument(), LOADED);
  });

  it("Undo on a refusal, which has no batch, clears it and goes back to what the search said", async () => {
    world.review = [reviewTrack(5, "done", { decision: "rejected", undo_batch: null }), reviewTrack(6, "to_check")];
    renderReview();
    await loaded();
    fireEvent.click(within(rowOf(5)).getByRole("button", { name: "Undo: Track 5" }));
    await waitFor(() => expect(bridge.decideMatch).toHaveBeenCalledWith({ decision: "clear", track_id: 5 }));
    expect(bridge.revertBatch).not.toHaveBeenCalled();
    await waitFor(() => expect(within(rowOf(5)).getByText("To check")).toBeInTheDocument(), LOADED);
  });

  it("says in words when a decision fails, and keeps the row as it was", async () => {
    bridge.decideMatch!.mockRejectedValueOnce(new Error("The engine is not running."));
    renderReview();
    await loaded();
    fireEvent.click(within(rowOf(4)).getByRole("button", { name: "Not this: Track 4" }));
    await waitFor(() => expect(bridge.decideMatch).toHaveBeenCalled());
    await waitFor(() => expect(within(rowOf(4)).getByText("Matched")).toBeInTheDocument());
  });
});

describe("Confirm all matched", () => {
  it("asks first, naming the values it will copy, and sends nothing until you say so", async () => {
    world.review = [reviewTrack(1, "matched"), reviewTrack(2, "matched"), reviewTrack(3, "to_check")];
    renderReview();
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: "Confirm all 2 matched" }));
    const question = screen.getByRole("group", { name: "Confirm" });
    expect(question).toHaveTextContent("Confirm 2 and update BPM, Genre, Label, Year?");
    expect(bridge.correctMatches).not.toHaveBeenCalled();
    fireEvent.click(within(question).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("group", { name: "Confirm" })).toBeNull();
    expect(bridge.correctMatches).not.toHaveBeenCalled();
  });

  it("accepts every matched track in one batch once confirmed, and offers Undo for that batch", async () => {
    world.review = [reviewTrack(1, "matched"), reviewTrack(2, "matched"), reviewTrack(3, "to_check")];
    renderReview();
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: "Confirm all 2 matched" }));
    fireEvent.click(within(screen.getByRole("group", { name: "Confirm" })).getByRole("button", { name: "Confirm" }));
    await waitFor(() =>
      expect(bridge.correctMatches).toHaveBeenCalledWith({
        selection: { track_ids: [1, 2] },
        fields: ["bpm", "genre", "label", "year"],
      }),
    );
    // Every id of the filter comes from the engine, not from the rows the page happens to hold.
    expect(bridge.getMatchReview).toHaveBeenCalledWith(
      expect.objectContaining({ filter: "matched", idsOnly: true }),
    );
    const undo = await screen.findByRole("button", { name: "Undo confirming 2" }, LOADED);
    fireEvent.click(undo);
    await waitFor(() => expect(bridge.revertBatch).toHaveBeenCalledWith({ batch_id: "batch-many" }));
  });

  it("says in words when the batch job failed, instead of saying nothing", async () => {
    world.review = [reviewTrack(1, "matched")];
    bridge.correctMatches!.mockResolvedValueOnce({ job_id: "big", id: "big", state: "queued" });
    bridge.getJob!.mockResolvedValue({ id: "big", state: "failed", error: { message: "The library is busy." } });
    renderReview();
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: "Confirm all 1 matched" }));
    fireEvent.click(within(screen.getByRole("group", { name: "Confirm" })).getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(document.querySelector(".cp-toast--warning, .cp-toast[data-variant='warning']")).not.toBeNull(), LOADED);
  });

  it("says in words when an undo job failed", async () => {
    bridge.revertBatch!.mockResolvedValueOnce({ job_id: "rev", id: "rev", state: "queued" });
    bridge.getJob!.mockResolvedValue({ id: "rev", state: "failed", error: { message: "A file changed." } });
    renderReview();
    await loaded();
    fireEvent.click(within(rowOf(5)).getByRole("button", { name: "Undo: Track 5" }));
    await waitFor(() => expect(document.querySelector(".cp-toast--warning, .cp-toast[data-variant='warning']")).not.toBeNull(), LOADED);
  });

  it("is not offered when nothing is matched", async () => {
    world.review = [reviewTrack(1, "to_check")];
    renderReview();
    await loaded();
    expect(screen.queryByRole("button", { name: /^Confirm all/ })).toBeNull();
  });
});

describe("Details", () => {
  async function openDetails(id = 1) {
    fireEvent.click(within(rowOf(id)).getByRole("button", { name: `Details of Track ${id}` }));
    return within(await screen.findByRole("complementary", { name: "Track details" }, LOADED));
  }

  it("opens beside the list: your file next to Beatport, with the position and the keys", async () => {
    renderReview();
    await loaded();
    const panel = await openDetails();
    expect(panel.getByText("To check")).toBeInTheDocument();
    expect(panel.getByText("1 of 6")).toBeInTheDocument();
    expect(panel.getByRole("region", { name: "Your file" })).toBeInTheDocument();
    expect(panel.getByRole("region", { name: "Beatport" })).toBeInTheDocument();
    await waitFor(() => expect(bridge.getTrackMatches).toHaveBeenCalledWith({ trackId: 1 }));
    expect(await panel.findByTestId("likelihood", undefined, LOADED)).toHaveTextContent("92% likely");
    expect(panel.getByRole("button", { name: /^Correct/ })).toBeEnabled();
    expect(panel.getByRole("button", { name: /^Not this track/ })).toBeEnabled();
    expect(panel.getByRole("button", { name: /^Skip/ })).toBeEnabled();
    expect(panel.getByText(/Esc closes/)).toBeInTheDocument();
    // The list stays on the left.
    expect(screen.getByRole("table")).toBeInTheDocument();
  });

  it("hides the other results behind show ›", async () => {
    renderReview();
    await loaded();
    const panel = await openDetails();
    await panel.findByTestId("likelihood", undefined, LOADED);
    expect(panel.queryByRole("group", { name: "Other results" })).toBeNull();
    fireEvent.click(panel.getByRole("button", { name: "show ›" }));
    expect(panel.getByRole("group", { name: "Other results" })).toBeInTheDocument();
    expect(panel.getAllByRole("button", { pressed: false }).length).toBeGreaterThan(0);
  });

  it("Enter corrects, and the panel moves straight to the next undecided track", async () => {
    renderReview();
    await loaded();
    const panel = await openDetails();
    await panel.findByTestId("likelihood", undefined, LOADED);
    press("Enter");
    await waitFor(() => expect(bridge.correctMatch).toHaveBeenCalledWith(expect.objectContaining({ track_id: 1, candidate_id: 1001 })));
    await waitFor(() => expect(bridge.getTrackMatches).toHaveBeenLastCalledWith({ trackId: 2 }), LOADED);
    await waitFor(() =>
      expect(document.querySelector(".review-panel__title")).toHaveTextContent("Track 2"),
    );
  });

  it("N refuses the match and moves on; S skips without deciding", async () => {
    renderReview();
    await loaded();
    const panel = await openDetails();
    await panel.findByTestId("likelihood", undefined, LOADED);
    press("s");
    await waitFor(() => expect(bridge.getTrackMatches).toHaveBeenLastCalledWith({ trackId: 2 }), LOADED);
    expect(bridge.correctMatch).not.toHaveBeenCalled();
    expect(bridge.decideMatch).not.toHaveBeenCalled();
    await within(screen.getByRole("complementary", { name: "Track details" })).findByTestId("likelihood", undefined, LOADED);
    press("n");
    await waitFor(() => expect(bridge.decideMatch).toHaveBeenCalledWith({ decision: "reject", track_id: 2 }));
  });

  it("a held key decides once: Enter, N and S ignore the repeats", async () => {
    renderReview();
    await loaded();
    const panel = await openDetails();
    await panel.findByTestId("likelihood", undefined, LOADED);
    press("Enter", { repeat: true });
    press("n", { repeat: true });
    press("s", { repeat: true });
    expect(bridge.correctMatch).not.toHaveBeenCalled();
    expect(bridge.decideMatch).not.toHaveBeenCalled();
    expect(bridge.getTrackMatches).toHaveBeenLastCalledWith({ trackId: 1 });
  });

  it("Enter pressed on a button presses that button, not Correct", async () => {
    renderReview();
    await loaded();
    const panel = await openDetails();
    await panel.findByTestId("likelihood", undefined, LOADED);
    const skip = panel.getByRole("button", { name: /^Skip/ });
    act(() => {
      fireEvent.keyDown(skip, { key: "Enter" });
    });
    expect(bridge.correctMatch).not.toHaveBeenCalled();
  });

  it("↑ and ↓ move between tracks, and Esc closes", async () => {
    renderReview();
    await loaded();
    const panel = await openDetails(2);
    expect(panel.getByText("2 of 6")).toBeInTheDocument();
    // Down reaches a track that was not found, whose panel is the search.
    press("ArrowDown");
    await waitFor(() => expect(screen.getByRole("complementary")).toHaveTextContent("3 of 6"));
    expect(screen.getByRole("complementary")).toHaveAccessibleName("Search for this track");
    press("ArrowUp");
    press("ArrowUp");
    await waitFor(() => expect(screen.getByRole("complementary")).toHaveTextContent("1 of 6"));
    expect(screen.getByRole("complementary")).toHaveAccessibleName("Track details");
    press("Escape");
    await waitFor(() => expect(screen.queryByRole("complementary")).toBeNull());
  });

  it("moves along the list with the arrows once a row is current, and Enter on a row opens it", async () => {
    renderReview();
    await loaded();
    // The cursor starts on the first row, the one in the tab order.
    press("ArrowDown");
    expect(rowOf(2)).toHaveClass("review-row--current");
    press("ArrowDown");
    expect(rowOf(3)).toHaveClass("review-row--current");
    press("ArrowUp");
    expect(rowOf(2)).toHaveClass("review-row--current");
    act(() => {
      fireEvent.keyDown(rowOf(2), { key: "Enter" });
    });
    expect(await screen.findByRole("complementary", { name: "Track details" }, LOADED)).toHaveTextContent("Track 2");
  });

  it("opens on a track when asked to, as the Inspector's link does", async () => {
    renderReview({ initialTrackId: 4 });
    expect(await screen.findByRole("complementary", { name: "Track details" }, LOADED)).toHaveTextContent("Track 4");
  });

  it("keeps the matcher's own scoring one click away, under Why this score?", async () => {
    renderReview();
    await loaded();
    const panel = await openDetails();
    await panel.findByTestId("likelihood", undefined, LOADED);
    expect(panel.queryByRole("table")).toBeNull();
    fireEvent.click(panel.getByRole("button", { name: "Why this score?" }));
    const table = panel.getByRole("table", { name: "How the matcher scored this result" });
    expect(within(table).getByText("Guards")).toBeInTheDocument();
    expect(within(table).getByText("Passed")).toBeInTheDocument();
  });

  it("offers the attempts when a track has more than one, and reads the one chosen", async () => {
    bridge.getTrackMatches!.mockImplementation(async ({ trackId }: { trackId: number }) => {
      const matches = matchesFor(trackId);
      return { ...matches, attempts: [...matches.attempts, { ...matches.attempts[0]!, id: 999, outcome: "no_match" as const }] };
    });
    renderReview();
    await loaded();
    const panel = await openDetails();
    const picker = await panel.findByRole("combobox", { name: "Attempt" }, LOADED);
    fireEvent.change(picker, { target: { value: "999" } });
    await waitFor(() => expect(bridge.getMatchCandidates).toHaveBeenCalledWith({ attemptId: 999 }));
  });

  it("the Close button closes it", async () => {
    renderReview();
    await loaded();
    const panel = await openDetails();
    fireEvent.click(panel.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("complementary", { name: "Track details" })).toBeNull();
  });
});

describe("Search", () => {
  async function openSearch(id = 3) {
    fireEvent.click(within(rowOf(id)).getByRole("button", { name: `Search for Track ${id}` }));
    return within(await screen.findByRole("complementary", { name: "Search for this track" }, LOADED));
  }

  it("opens beside the list with the box filled with the title and the artist", async () => {
    renderReview();
    await loaded();
    const panel = await openSearch();
    expect(panel.getByRole("textbox", { name: "Search Beatport for" })).toHaveValue("Track 3 Artist 3");
    expect(panel.getByText("Not found")).toBeInTheDocument();
    expect(panel.getByRole("button", { name: /^Leave unmatched/ })).toBeInTheDocument();
    expect(panel.getByRole("button", { name: /^Skip/ })).toBeInTheDocument();
  });

  it("lists what the matcher scored, each with Use this, which accepts that result", async () => {
    renderReview();
    await loaded();
    const panel = await openSearch();
    const list = await panel.findByRole("list", { name: "Results" }, LOADED);
    const uses = within(list).getAllByRole("button", { name: "Use this" });
    expect(uses).toHaveLength(2);
    fireEvent.click(uses[0]!);
    await waitFor(() =>
      expect(bridge.correctMatch).toHaveBeenCalledWith(expect.objectContaining({ track_id: 3, candidate_id: 1001 })),
    );
  });

  it("searches Beatport with the words in the box, opened in the browser", async () => {
    const open = vi.fn().mockResolvedValue(true);
    (window.cuepoint as unknown as Record<string, unknown>).openBeatportPage = open;
    renderReview();
    await loaded();
    const panel = await openSearch();
    fireEvent.change(panel.getByRole("textbox", { name: "Search Beatport for" }), { target: { value: "glue bicep" } });
    fireEvent.click(panel.getByRole("button", { name: "Search Beatport myself…" }));
    await waitFor(() => expect(open).toHaveBeenCalledWith("https://www.beatport.com/search?q=glue%20bicep"));
  });

  it("Leave unmatched (N) refuses it; Search again starts a match of this one track", async () => {
    const { props } = renderReview();
    await loaded();
    const panel = await openSearch();
    fireEvent.click(panel.getByRole("button", { name: "Search again" }));
    expect(props.onSearchAgain).toHaveBeenCalledWith({ id: 3, title: "Track 3" });
    press("n");
    await waitFor(() => expect(bridge.decideMatch).toHaveBeenCalledWith({ decision: "reject", track_id: 3 }));
  });

  it("keys typed in the box are text, not decisions", async () => {
    renderReview();
    await loaded();
    const panel = await openSearch();
    const box = panel.getByRole("textbox", { name: "Search Beatport for" });
    act(() => {
      fireEvent.keyDown(box, { key: "n" });
      fireEvent.keyDown(box, { key: "s" });
      fireEvent.keyDown(box, { key: "Enter" });
    });
    expect(bridge.decideMatch).not.toHaveBeenCalled();
    expect(bridge.correctMatch).not.toHaveBeenCalled();
  });

  it("waits Search again while a match runs, and says why", async () => {
    renderReview({ matching: true });
    await loaded();
    const panel = await openSearch();
    expect(panel.getByRole("button", { name: "Search again" })).toBeDisabled();
    expect(panel.getByText("one match at a time")).toBeInTheDocument();
  });

  it("opens from a track whose search failed, with Search ›", async () => {
    renderReview();
    await loaded();
    const panel = await openSearch(6);
    expect(panel.getByText("Search failed")).toBeInTheDocument();
  });
});

describe("when every row is decided", () => {
  it("says it is reviewed, with Save N to files… and a way back", async () => {
    world.review = [reviewTrack(1, "done"), reviewTrack(2, "done", { decision: "rejected" }), reviewTrack(3, "done")];
    const onSave = vi.fn();
    const { props } = renderReview({ saveCount: 7, onSave });
    expect(await screen.findByText("hJ is reviewed", undefined, LOADED)).toBeInTheDocument();
    expect(screen.getByText("2 confirmed · 1 left unmatched")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save 7 to files…" }));
    expect(onSave).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Back to playlists" }));
    expect(props.onBack).toHaveBeenCalledTimes(1);
    expect(bridge.correctMatch).not.toHaveBeenCalled();
  });

  it("offers no Save when there is nothing to save, and can show the list again", async () => {
    world.review = [reviewTrack(1, "done")];
    renderReview({ saveCount: 0, onSave: vi.fn() });
    await screen.findByText("hJ is reviewed", undefined, LOADED);
    expect(screen.queryByRole("button", { name: /^Save/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Look through them again" }));
    expect(screen.getByRole("table")).toBeInTheDocument();
  });

  it("arrives there by deciding the last one", async () => {
    world.review = [reviewTrack(1, "to_check"), reviewTrack(2, "done")];
    renderReview();
    await loaded();
    fireEvent.click(within(rowOf(1)).getByRole("button", { name: "Correct: Track 1" }));
    expect(await screen.findByText("hJ is reviewed", undefined, LOADED)).toBeInTheDocument();
  });

  it("tells the page the run is reviewed, once", async () => {
    world.review = [reviewTrack(1, "done")];
    const onReviewed = vi.fn();
    const { rerender, props } = renderReview({ onReviewed });
    await screen.findByText("hJ is reviewed", undefined, LOADED);
    rerender(element({ ...props, version: 1 }));
    await waitFor(() => expect(bridge.getMatchReview).toHaveBeenCalledTimes(2));
    expect(onReviewed).toHaveBeenCalledTimes(1);
  });
});


describe("a decision is said, and patched in place", () => {
  it("says it in a live region with an Undo that reverts that batch", async () => {
    renderReview();
    await loaded();
    const live = screen.getByRole("status");
    expect(live).toHaveTextContent("");
    fireEvent.click(within(rowOf(1)).getByRole("button", { name: "Correct: Track 1" }));
    await waitFor(() => expect(live).toHaveTextContent("Corrected “Track 1”."), LOADED);
    fireEvent.click(within(live).getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(bridge.revertBatch).toHaveBeenCalledWith({ batch_id: "batch-1", track_id: 1 }));
    await waitFor(() => expect(live).toHaveTextContent("Undid the decision on “Track 1”."), LOADED);
  });

  it("moves the row and the counts without reading the whole list again", async () => {
    renderReview();
    await loaded();
    const reads = bridge.getMatchReview!.mock.calls.length;
    fireEvent.click(within(rowOf(1)).getByRole("button", { name: "Correct: Track 1" }));
    await waitFor(() => expect(within(rowOf(1)).getByText("Done")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "To check 1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Done 2" })).toBeInTheDocument();
    expect(bridge.getMatchReview!.mock.calls.length).toBe(reads);
  });
});

describe("rows and keys", () => {
  it("clicking a row opens its details, and so does Enter on it; a button in it keeps its own click", async () => {
    renderReview();
    await loaded();
    fireEvent.click(within(rowOf(2)).getByText("Track 2 · Artist 2"));
    expect(await screen.findByRole("complementary", { name: "Track details" }, LOADED)).toHaveTextContent("Track 2");
    press("Escape");
    await waitFor(() => expect(screen.queryByRole("complementary")).toBeNull());

    act(() => {
      fireEvent.keyDown(rowOf(1), { key: "Enter" });
    });
    expect(await screen.findByRole("complementary", { name: "Track details" }, LOADED)).toHaveTextContent("Track 1");
    press("Escape");

    fireEvent.click(within(rowOf(4)).getByRole("button", { name: "Not this: Track 4" }));
    await waitFor(() => expect(bridge.decideMatch).toHaveBeenCalled());
    expect(screen.queryByRole("complementary")).toBeNull();
  });

  it("puts the keyboard in the panel when it opens, and back on the row when it closes", async () => {
    renderReview();
    await loaded();
    fireEvent.click(within(rowOf(1)).getByRole("button", { name: "Details of Track 1" }));
    const panel = await screen.findByRole("complementary", { name: "Track details" }, LOADED);
    await waitFor(() => expect(panel).toHaveFocus());
    press("Escape");
    await waitFor(() => expect(rowOf(1)).toHaveFocus());
  });

  it("keeps the preview column while the panel is open, so a sample is not cut off", async () => {
    renderReview();
    await loaded();
    fireEvent.click(within(rowOf(1)).getByRole("button", { name: "Details of Track 1" }));
    await screen.findByRole("complementary", { name: "Track details" }, LOADED);
    expect(within(rowOf(2)).getByRole("button", { name: "Play the Beatport preview of Track 2" })).toBeInTheDocument();
    // The columns the panel makes room by are the Differs and Quick decision ones.
    expect(screen.queryByRole("columnheader", { name: "Differs" })).toBeNull();
  });

  it("tells the page when the details are open", async () => {
    const onPanelChange = vi.fn();
    renderReview({ onPanelChange });
    await loaded();
    fireEvent.click(within(rowOf(1)).getByRole("button", { name: "Details of Track 1" }));
    await waitFor(() => expect(onPanelChange).toHaveBeenLastCalledWith(true));
    press("Escape");
    await waitFor(() => expect(onPanelChange).toHaveBeenLastCalledWith(false));
  });

  it("links the artist and label to their pages from the details", async () => {
    const onOpenEntity = vi.fn();
    bridge.getLibraryTrack!.mockImplementation(async ({ trackId }: { trackId: number }) => ({
      track: { ...world.tracks[0]!, id: trackId, artist: "Artist 1" },
      playlists: [],
      playlist_count: 0,
      metadata: null,
      tags: [],
      collections: [],
      credits: {
        artists: [{ kind: "artist", name: "Artist 1", role: "artist", ref: "name:artist 1", identity: "name" }],
        remixers: [],
        label: { kind: "label", name: "Label One", role: null, ref: "name:label one", identity: "name" },
      },
    }));
    renderReview({ onOpenEntity });
    await loaded();
    fireEvent.click(within(rowOf(1)).getByRole("button", { name: "Details of Track 1" }));
    const panel = within(await screen.findByRole("complementary", { name: "Track details" }, LOADED));
    fireEvent.click(await panel.findByRole("button", { name: "Artist 1" }, LOADED));
    expect(onOpenEntity).toHaveBeenCalledWith("artist", "name:artist 1");
    fireEvent.click(panel.getByRole("button", { name: "Label One" }));
    expect(onOpenEntity).toHaveBeenLastCalledWith("label", "name:label one");
  });
});

describe("Rejected and Changed since you decided", () => {
  it("are chips of their own, with the tracks the person refused and those a newer search disagrees with", async () => {
    world.review = [
      reviewTrack(1, "done", { decision: "rejected", undo_batch: null }),
      reviewTrack(2, "done"),
      reviewTrack(3, "to_check", { disputed: true }),
    ];
    renderReview();
    await loaded();
    const group = screen.getByRole("group", { name: "Show" });
    fireEvent.click(within(group).getByRole("button", { name: "Rejected 1" }));
    await waitFor(() => expect(order()).toEqual([1]));
    fireEvent.click(within(group).getByRole("button", { name: "Changed since you decided 1" }));
    await waitFor(() => expect(order()).toEqual([3]));
    // A disputed decision is to check again, never Done.
    expect(within(rowOf(3)).getByText("To check")).toBeInTheDocument();
  });
});

describe("correcting a selection", () => {
  it("ticks rows with a match, asks which values, and corrects exactly those", async () => {
    renderReview();
    await loaded();
    expect(within(rowOf(3)).getByRole("checkbox", { name: "Tick Track 3" })).toBeDisabled();
    fireEvent.click(within(rowOf(1)).getByRole("checkbox", { name: "Tick Track 1" }));
    fireEvent.click(within(rowOf(4)).getByRole("checkbox", { name: "Tick Track 4" }));
    fireEvent.click(screen.getByRole("button", { name: "Correct 2 selected" }));
    const question = screen.getByRole("group", { name: "Confirm" });
    expect(question).toHaveTextContent("Correct 2 and update BPM, Genre, Label, Year?");
    fireEvent.click(within(question).getByRole("button", { name: "Correct" }));
    await waitFor(() =>
      expect(bridge.correctMatches).toHaveBeenCalledWith({
        selection: { track_ids: [1, 4] },
        fields: ["bpm", "genre", "label", "year"],
      }),
    );
    await waitFor(() => expect(screen.queryByRole("button", { name: /selected$/ })).toBeNull());
  });

  it("ticks every track with a match from the header", async () => {
    renderReview();
    await loaded();
    fireEvent.click(screen.getByRole("checkbox", { name: "Tick every track with a match" }));
    expect(screen.getByRole("button", { name: "Correct 3 selected" })).toBeInTheDocument();
  });
});

describe("a list of thousands", () => {
  function many(count: number) {
    return Array.from({ length: count }, (_, index) => reviewTrack(index + 1, index % 2 ? "matched" : "to_check"));
  }

  it("draws only the rows in view, with a spacer for the rest, and says how many there are", async () => {
    world.review = many(1500);
    renderReview();
    await loaded();
    const drawn = screen.getAllByRole("row").length - 1;
    expect(drawn).toBeGreaterThan(5);
    expect(drawn).toBeLessThan(120);
    expect(screen.getByRole("table")).toHaveAttribute("aria-rowcount", "1501");
    expect(rowOf(1)).toHaveAttribute("aria-rowindex", "2");
  });

  it("keeps one row in the tab order, and the arrows move it and the keyboard with it", async () => {
    world.review = many(300);
    renderReview();
    await loaded();
    const stops = () => screen.getAllByRole("row").filter((row) => row.getAttribute("tabindex") === "0");
    expect(stops()).toHaveLength(1);
    expect(stops()[0]).toBe(rowOf(1));
    press("ArrowDown");
    await waitFor(() => expect(rowOf(2)).toHaveFocus());
    expect(stops()).toHaveLength(1);
    expect(stops()[0]).toBe(rowOf(2));
  });

  it("reads on when the run holds more than a page", async () => {
    world.review = many(2100);
    renderReview();
    await loaded();
    expect(screen.getByRole("button", { name: "Show more (100 more)" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show more (100 more)" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: /^Show more/ })).toBeNull(), LOADED);
    expect(bridge.getMatchReview).toHaveBeenLastCalledWith(expect.objectContaining({ after: "0:2000" }));
  });
});

describe("saving from a past search", () => {
  it("offers Save with the count the page worked out for the run's own tracks", async () => {
    world.review = [reviewTrack(1, "done"), reviewTrack(2, "done")];
    const onSave = vi.fn();
    renderReview({ saveCount: 7, onSave });
    await screen.findByText("hJ is reviewed", undefined, LOADED);
    fireEvent.click(screen.getByRole("button", { name: "Save 7 to files…" }));
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("offers no Save while the page has not counted, rather than guessing from the tracks accepted here", async () => {
    world.review = [reviewTrack(1, "done"), reviewTrack(2, "done")];
    renderReview({ saveCount: undefined, onSave: vi.fn() });
    await screen.findByText("hJ is reviewed", undefined, LOADED);
    expect(screen.queryByRole("button", { name: /^Save/ })).toBeNull();
  });
});

describe("one row of a batch that covered many", () => {
  it("Undo on a row takes back only that track, with the batch and the track named", async () => {
    world.review = [
      reviewTrack(1, "done", { undo_batch: "batch-many" }),
      reviewTrack(2, "done", { undo_batch: "batch-many" }),
      reviewTrack(3, "to_check"),
    ];
    renderReview();
    await loaded();
    fireEvent.click(within(rowOf(1)).getByRole("button", { name: "Undo: Track 1" }));
    await waitFor(() => expect(bridge.revertBatch).toHaveBeenCalledWith({ batch_id: "batch-many", track_id: 1 }));
    await waitFor(() => expect(within(rowOf(1)).getByText("To check")).toBeInTheDocument(), LOADED);
    // The other track the batch covered keeps what it did to it.
    expect(within(rowOf(2)).getByText("Done")).toBeInTheDocument();
  });

  it("the note after Confirm all undoes the whole batch, and says how many", async () => {
    world.review = [reviewTrack(1, "matched"), reviewTrack(2, "matched")];
    renderReview();
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: "Confirm all 2 matched" }));
    fireEvent.click(within(screen.getByRole("group", { name: "Confirm" })).getByRole("button", { name: "Confirm" }));
    fireEvent.click(await screen.findByRole("button", { name: "Undo confirming 2" }, LOADED));
    await waitFor(() => expect(bridge.revertBatch).toHaveBeenCalledWith({ batch_id: "batch-many" }));
    // Every track the batch covered goes back.
    await waitFor(() => expect(within(rowOf(1)).getByText("To check")).toBeInTheDocument(), LOADED);
    expect(within(rowOf(2)).getByText("To check")).toBeInTheDocument();
  });

  it("a big batch that ran as a job is as undoable: its batch is read from its result", async () => {
    world.review = [reviewTrack(1, "matched")];
    bridge.correctMatches!.mockResolvedValueOnce({ job_id: "big", id: "big", state: "queued" });
    bridge.getJob!.mockResolvedValue({ id: "big", state: "succeeded" });
    bridge.getJobResults = vi.fn().mockResolvedValue({ id: "big", state: "succeeded", result: { batch_id: "batch-job", changed: 5 } });
    renderReview();
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: "Confirm all 1 matched" }));
    fireEvent.click(within(screen.getByRole("group", { name: "Confirm" })).getByRole("button", { name: "Confirm" }));
    fireEvent.click(await screen.findByRole("button", { name: "Undo confirming 5" }, LOADED));
    await waitFor(() => expect(bridge.revertBatch).toHaveBeenCalledWith({ batch_id: "batch-job" }));
  });
});

describe("ticks that went stale", () => {
  it("drop out of the selection when the track is decided another way, and are not sent", async () => {
    renderReview();
    await loaded();
    fireEvent.click(within(rowOf(1)).getByRole("checkbox", { name: "Tick Track 1" }));
    fireEvent.click(within(rowOf(4)).getByRole("checkbox", { name: "Tick Track 4" }));
    expect(screen.getByRole("button", { name: "Correct 2 selected" })).toBeInTheDocument();
    // Track 1 is decided with its own button: it is not a candidate for the selection any more.
    fireEvent.click(within(rowOf(1)).getByRole("button", { name: "Not this: Track 1" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Correct 1 selected" })).toBeInTheDocument(), LOADED);
    fireEvent.click(screen.getByRole("button", { name: "Correct 1 selected" }));
    expect(screen.getByRole("group", { name: "Confirm" })).toHaveTextContent("Correct 1 and update");
    fireEvent.click(within(screen.getByRole("group", { name: "Confirm" })).getByRole("button", { name: "Correct" }));
    await waitFor(() =>
      expect(bridge.correctMatches).toHaveBeenCalledWith(expect.objectContaining({ selection: { track_ids: [4] } })),
    );
  });
});

describe("when the matched tracks cannot be read", () => {
  it("sends nothing and says so, instead of confirming only the rows that happen to be loaded", async () => {
    world.review = [reviewTrack(1, "matched"), reviewTrack(2, "matched")];
    renderReview();
    await loaded();
    bridge.getMatchReview!.mockRejectedValueOnce(new Error("The engine is not running."));
    fireEvent.click(screen.getByRole("button", { name: "Confirm all 2 matched" }));
    fireEvent.click(within(screen.getByRole("group", { name: "Confirm" })).getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(document.querySelector(".cp-toast")).not.toBeNull(), LOADED);
    expect(bridge.correctMatches).not.toHaveBeenCalled();
  });
});

describe("a long list's tab stop", () => {
  it("is the first row drawn when the cursor's row has scrolled out of the window", async () => {
    world.review = Array.from({ length: 600 }, (_, index) => reviewTrack(index + 1, "to_check"));
    renderReview();
    await loaded();
    press("ArrowDown");
    const stops = () => screen.getAllByRole("row").filter((row) => row.getAttribute("tabindex") === "0");
    expect(stops()).toHaveLength(1);
    const scroller = document.querySelector(".review__table") as HTMLElement;
    act(() => {
      scroller.scrollTop = 42 * 400;
      fireEvent.scroll(scroller);
    });
    await waitFor(() => expect(screen.queryByRole("row", { name: /Track 2 ·/ })).toBeNull());
    expect(stops()).toHaveLength(1);
  });
});

describe("Search, in the app", () => {
  async function openSearch(id = 3) {
    fireEvent.click(within(rowOf(id)).getByRole("button", { name: `Search for Track ${id}` }));
    return within(await screen.findByRole("complementary", { name: "Search for this track" }, LOADED));
  }

  it("searches Beatport from CuePoint with the words in the box, and lists what it found with Use this", async () => {
    renderReview();
    await loaded();
    const panel = await openSearch();
    fireEvent.change(panel.getByRole("textbox", { name: "Search Beatport for" }), { target: { value: "glue bicep" } });
    fireEvent.click(panel.getByRole("button", { name: "Search" }));
    await waitFor(() => expect(bridge.searchMatch).toHaveBeenCalledWith({ track_id: 3, query: "glue bicep" }));
    const list = await panel.findByRole("list", { name: "Results" }, LOADED);
    fireEvent.click(within(list).getAllByRole("button", { name: "Use this" })[0]!);
    await waitFor(() =>
      expect(bridge.correctMatch).toHaveBeenCalledWith(expect.objectContaining({ track_id: 3, candidate_id: 1001 })),
    );
  });

  it("tells the page, since the search stored an attempt, without reading the whole list again", async () => {
    const { props } = renderReview();
    await loaded();
    const panel = await openSearch();
    const reads = bridge.getMatchReview!.mock.calls.length;
    const told = (props.onChanged as ReturnType<typeof vi.fn>).mock.calls.length;
    fireEvent.click(panel.getByRole("button", { name: "Search" }));
    await waitFor(() => expect(bridge.searchMatch).toHaveBeenCalled());
    await waitFor(() => expect((props.onChanged as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(told));
    expect(bridge.getMatchReview!.mock.calls.length).toBe(reads);
  });

  it("says so, and points to the browser, when there is no Beatport sign-in", async () => {
    const refusal = Object.assign(new Error("Sign in to Beatport."), { code: "BEATPORT_SIGN_IN_NEEDED", status: 409 });
    bridge.searchMatch!.mockRejectedValueOnce(refusal);
    renderReview();
    await loaded();
    const panel = await openSearch();
    fireEvent.click(panel.getByRole("button", { name: "Search" }));
    expect(await panel.findByRole("alert", undefined, LOADED)).toHaveTextContent("Sign in to Beatport in Settings");
    expect(panel.getByRole("button", { name: "Search Beatport myself…" })).toBeInTheDocument();
  });

  it("says a failed search failed, in the engine's words, and not that Beatport had nothing", async () => {
    bridge.searchMatch!.mockResolvedValueOnce({
      attempt_id: 1,
      track_id: 3,
      candidates: [],
      total: 0,
      query: "glue",
      failure: "network",
      failure_message: "Beatport could not be reached.",
      state: { track_id: 3 },
    });
    renderReview();
    await loaded();
    const panel = await openSearch();
    fireEvent.click(panel.getByRole("button", { name: "Search" }));
    expect(await panel.findByRole("alert", undefined, LOADED)).toHaveTextContent("Beatport could not be reached.");
    expect(panel.queryByText(/found nothing/)).toBeNull();
  });

  it("says Beatport found nothing when the search answered with no results", async () => {
    bridge.searchMatch!.mockResolvedValueOnce({
      attempt_id: 1,
      track_id: 3,
      candidates: [],
      total: 0,
      query: "zzz",
      failure: null,
      failure_message: null,
      state: { track_id: 3 },
    });
    renderReview();
    await loaded();
    const panel = await openSearch();
    fireEvent.click(panel.getByRole("button", { name: "Search" }));
    expect(await panel.findByText("Beatport found nothing for “zzz”.", undefined, LOADED)).toBeInTheDocument();
  });
});

describe("a search made from a filtered list", () => {
  async function openSearch(id = 3) {
    fireEvent.click(within(rowOf(id)).getByRole("button", { name: `Search for Track ${id}` }));
    return within(await screen.findByRole("complementary", { name: "Search for this track" }, LOADED));
  }

  it("keeps the panel and its results open when what it found moves the row out of the filter", async () => {
    renderReview({ initialFilter: "not_found" });
    await loaded();
    const panel = await openSearch();
    const reads = bridge.getMatchReview!.mock.calls.length;
    fireEvent.click(panel.getByRole("button", { name: "Search" }));
    const list = await panel.findByRole("list", { name: "Results" }, LOADED);
    // The track is To check now, so the Not found list no longer holds it, and still the panel stays.
    await waitFor(() => expect(order()).not.toContain(3));
    expect(screen.getByRole("complementary", { name: "Search for this track" })).toBeInTheDocument();
    expect(within(list).getAllByRole("button", { name: "Use this" })).toHaveLength(2);
    // And the list was patched in place, not read again.
    expect(bridge.getMatchReview!.mock.calls.length).toBe(reads);
    fireEvent.click(within(list).getAllByRole("button", { name: "Use this" })[0]!);
    await waitFor(() => expect(bridge.correctMatch).toHaveBeenCalledWith(expect.objectContaining({ track_id: 3 })));
  });

  it("takes what the search found into the row: To check, with the match it points at", async () => {
    renderReview();
    await loaded();
    const panel = await openSearch();
    fireEvent.click(panel.getByRole("button", { name: "Search" }));
    await panel.findByRole("list", { name: "Results" }, LOADED);
    await waitFor(() => expect(within(rowOf(3)).getByText("To check")).toBeInTheDocument());
  });

  it("drops the answer to a search made on another track", async () => {
    let answer: (value: unknown) => void = () => undefined;
    bridge.searchMatch!.mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)));
    renderReview();
    await loaded();
    const panel = await openSearch(3);
    fireEvent.click(panel.getByRole("button", { name: "Search" }));
    await waitFor(() => expect(bridge.searchMatch).toHaveBeenCalledWith(expect.objectContaining({ track_id: 3 })));
    // On to the next track whose panel is a search (Track 6 failed), while the answer is out.
    press("ArrowDown");
    press("ArrowDown");
    await waitFor(() => expect(screen.getByRole("complementary")).toHaveTextContent("Track 6"));
    await act(async () => {
      answer({
        attempt_id: 1,
        track_id: 3,
        candidates: [{ id: 1001, title: "Late", differing: [] }],
        total: 1,
        query: "late",
        failure: null,
        failure_message: null,
        state: { track_id: 3, state: "needs_review", candidate_id: 1001 },
      });
    });
    // What the late answer found is not shown on the track the panel is on now.
    expect(within(screen.getByRole("complementary")).queryByText(/Late/)).toBeNull();
    // It did reach the row of the track it was made for.
    expect(within(rowOf(3)).getByText(/Late/)).toBeInTheDocument();
    expect(screen.queryByText(/found nothing for/)).toBeNull();
    // Search on the new track is still available: the late answer did not leave it searching.
    expect(screen.getByRole("button", { name: "Search" })).toBeEnabled();
  });

  it("waits while a match runs: Search is off and says why", async () => {
    renderReview({ matching: true });
    await loaded();
    const panel = await openSearch();
    expect(panel.getByRole("button", { name: "Search" })).toBeDisabled();
    expect(panel.getByText("one match at a time")).toBeInTheDocument();
  });
});
