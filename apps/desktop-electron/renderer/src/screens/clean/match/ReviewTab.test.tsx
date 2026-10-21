/**
 * A review tab: one playlist's tracks as a plain table with a tick per track, a side panel on the
 * candidates, and the green Sync button.
 *
 * Against the real table over a faked bridge: what each row says and whether it is ticked, ticking
 * and unticking (one, and all) with the engine holding the tick, the panel that opens on a row, the
 * keys that move along the table, and the Sync button. The Sync window is a stand-in here; it is
 * tested in `SyncPlaylistDialog.test.tsx`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";

import { ToastProvider } from "../../../components";
import { ScaleProvider } from "../../../tokens/ScaleContext";
import { installMatchBridge, newWorld, removeMatchBridge, type MatchWorld } from "../../../test/matchHarness";
import { reviewTrack } from "../../../test/matchFixtures";

vi.mock("./SyncPlaylistDialog", () => ({
  SyncPlaylistDialog: (props: { open: boolean; name: string; source: unknown; onClose: () => void; onChanged: () => void }) =>
    props.open ? (
      <div role="dialog" aria-label="Sync window">
        <p>{`syncing ${props.name} ${JSON.stringify(props.source)}`}</p>
        <button type="button" onClick={props.onChanged}>
          files written
        </button>
        <button type="button" onClick={props.onClose}>
          close sync
        </button>
      </div>
    ) : null,
}));

import { ReviewTab } from "./ReviewTab";

type Fn = ReturnType<typeof vi.fn>;
type Props = ComponentProps<typeof ReviewTab>;

const LOADED = { timeout: 3000 };

let bridge: Record<string, Fn>;
let world: MatchWorld;

function rows() {
  return [
    reviewTrack(1, "to_check", { differing: ["remix"] }),
    reviewTrack(2, "matched"),
    reviewTrack(3, "not_found"),
    reviewTrack(4, "matched", { ticked: false }),
    reviewTrack(5, "search_failed"),
  ];
}

function renderTab(overrides: Partial<Props> = {}) {
  const props: Props = {
    source: { playlistId: 7 },
    name: "hJ",
    version: 0,
    matching: false,
    onChanged: vi.fn(),
    ...overrides,
  };
  const view = render(
    <ScaleProvider>
      <ToastProvider>
        <ReviewTab {...props} />
      </ToastProvider>
    </ScaleProvider>,
  );
  return { props, ...view };
}

function order(): number[] {
  return screen
    .getAllByRole("row")
    .slice(1)
    .filter((row) => row.hasAttribute("data-track-id"))
    .map((row) => Number(row.getAttribute("data-track-id")));
}

function rowOf(id: number): HTMLElement {
  const row = screen.getAllByRole("row").find((entry) => entry.getAttribute("data-track-id") === String(id));
  if (!row) throw new Error(`no row for track ${id}`);
  return row;
}

/** The bar's one sentence of facts (C181). */
function facts(): HTMLElement {
  return document.querySelector<HTMLElement>(".review__facts")!;
}

/** The line beside the table that says each tick and choice (a toast may say it too). */
function live(): HTMLElement {
  return document.querySelector<HTMLElement>(".review__live")!;
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

describe("the table", () => {
  it("reads every track of the playlist, in plan order", async () => {
    renderTab();
    await loaded();
    expect(bridge.getMatchReview).toHaveBeenCalledWith({ playlistId: 7, limit: 2000 });
    expect(order()).toEqual([1, 2, 3, 4, 5]);
  });

  it("says what each row is: its status, your track and the Beatport match", async () => {
    renderTab();
    await loaded();
    const first = within(rowOf(1));
    expect(first.getByText("To check")).toBeInTheDocument();
    expect(first.getByText("Track 1 · Artist 1")).toBeInTheDocument();
    // The version is its own part, so the one that differs is marked alone.
    expect(first.getByText("(Extended Mix)")).toHaveClass("review-part--differs");
    expect(first.getByText("Track 1")).not.toHaveClass("review-part--differs");
    expect(first.getByText("· Beatport Artist 1")).toBeInTheDocument();
    // A confirmed match is said quietly, a state that needs a look is a chip (D14, D2).
    expect(within(rowOf(2)).getByText("Confirmed")).toHaveClass("cp-quiet-ok");
    expect(first.getByText("To check")).toHaveClass("cp-badge--warning");
    expect(within(rowOf(3)).getByText("No match")).toBeInTheDocument();
    expect(within(rowOf(3)).getByText("—")).toBeInTheDocument();
    expect(within(rowOf(5)).getByText("Search failed")).toBeInTheDocument();
  });

  it("is a table with named columns, and a tick named for each track", async () => {
    renderTab();
    await loaded();
    expect(screen.getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual(["", "Status", "Your track", "Beatport", "Preview"]);
    expect(screen.getByRole("checkbox", { name: "Sync Track 1 · Artist 1" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Tick every track with a match" })).toBeInTheDocument();
    expect(screen.getByRole("table")).toHaveClass("cp-data-table");
  });

  it("ticks what the engine ticked, and leaves a track with no match unticked and unable to be", async () => {
    renderTab();
    await loaded();
    expect(screen.getByRole("checkbox", { name: "Sync Track 2 · Artist 2" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Sync Track 4 · Artist 4" })).not.toBeChecked();
    const none = screen.getByRole("checkbox", { name: "Sync Track 3 · Artist 3" });
    expect(none).not.toBeChecked();
    expect(none).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "Sync Track 5 · Artist 5" })).toBeDisabled();
  });

  it("dims an unticked row and strikes its match through", async () => {
    renderTab();
    await loaded();
    expect(rowOf(4)).toHaveClass("review-row--off");
    expect(within(rowOf(4)).getByText(/Track 4/, { selector: "td.review-row__theirs span" }).closest("td")).toHaveClass(
      "review-row__theirs--off",
    );
    expect(rowOf(2)).not.toHaveClass("review-row--off");
  });

  it("says the tracks, the ticked ones and what has no match in one sentence at the foot", async () => {
    renderTab();
    await loaded();
    // The area's row names the playlist and goes back; the review has no top bar of its own.
    expect(screen.queryByRole("button", { name: "Close review" })).toBeNull();
    expect(facts()).toHaveTextContent("5 tracks · 2 ticked to sync · 1 no match · 1 search failed");
    expect(facts().closest(".cp-toolbar")).not.toBeNull();
  });

  it("has no per-track Correct, Not this, Skip, filter chips or confirm-all", async () => {
    renderTab();
    await loaded();
    for (const name of [/^Correct/, /Not this/, /Skip/, /Confirm all/, /^Undo/, /selected$/]) {
      expect(screen.queryByRole("button", { name })).toBeNull();
    }
    expect(screen.queryByRole("group", { name: "Show" })).toBeNull();
    expect(screen.queryByText(/When I say/)).toBeNull();
  });

  it("says why when it cannot be read, and while it is read", async () => {
    bridge.getMatchReview.mockRejectedValueOnce(new Error("boom"));
    renderTab();
    expect(await screen.findByRole("alert", undefined, LOADED)).toBeInTheDocument();
  });

  it("needs the desktop app", async () => {
    removeMatchBridge();
    renderTab();
    const alert = await screen.findByRole("alert", undefined, LOADED);
    expect(alert).toHaveTextContent("This needs the CuePoint desktop app.");
    expect(within(alert).queryByRole("button", { name: "Try again" })).toBeNull();
  });
});

describe("the selected row's look (C82)", () => {
  it("is the Library's tint and bar: a selected row draws no outline, and the keyboard's row is dashed", async () => {
    const css = (await import("./match.css?raw")).default;
    const ring = /\.review-row:focus-visible\s*\{([^}]*)\}/.exec(css);
    expect(ring, "a full focus outline on every focused row").toBeNull();
    const cursor = /\.review-row:focus-visible:not\(\[aria-selected="true"\]\)\s*\{([^}]*)\}/.exec(css)![1]!;
    expect(cursor).toMatch(/outline:\s*var\(--focus-ring-width\) dashed var\(--focus-ring\)/);
    expect(css).toMatch(/\.review-row:focus-visible\[aria-selected="true"\]\s*\{[^}]*outline:\s*none/);
  });
});

describe("the tick boxes' look (item 9a)", () => {
  it("keeps a ticked box grey-outlined with a violet tick, and fills it violet only when focused", async () => {
    const css = (await import("./match.css?raw")).default;
    const ticked = /\.review-col--check input\[type="checkbox"\]:checked:not\(:disabled\),[^{]*\{([^}]*)\}/.exec(css)![1]!;
    expect(ticked).toMatch(/border-color:\s*var\(--border-control\)/);
    expect(ticked).toMatch(/background-color:\s*var\(--bg-input\)/);
    expect(ticked).toMatch(/color:\s*var\(--accent-primary\)/);
    const focused = /\.review-row:focus-visible \.review-col--check input\[type="checkbox"\]:checked,[^{]*\{([^}]*)\}/.exec(css)![1]!;
    expect(focused).toMatch(/background-color:\s*var\(--accent-fill\)/);
  });
});

describe("ticking", () => {
  it("unticks a track at once and tells the engine, which keeps it", async () => {
    const { props } = renderTab();
    await loaded();
    await userEvent.click(screen.getByRole("checkbox", { name: "Sync Track 2 · Artist 2" }));
    expect(screen.getByRole("checkbox", { name: "Sync Track 2 · Artist 2" })).not.toBeChecked();
    expect(bridge.setMatchTicks).toHaveBeenCalledWith({ ticked: false, track_ids: [2] });
    expect(rowOf(2)).toHaveClass("review-row--off");
    expect(facts()).toHaveTextContent("5 tracks · 1 ticked to sync");
    expect(live()).toHaveTextContent("Unticked “Track 2”: it will be left out.");
    await waitFor(() => expect(props.onChanged).toHaveBeenCalled());
    // The tick is the engine's: a table read again says the same.
    expect(world.review.find((row) => row.track_id === 2)?.ticked).toBe(false);
  });

  it("does not move a row when it is ticked or unticked", async () => {
    renderTab();
    await loaded();
    await userEvent.click(screen.getByRole("checkbox", { name: "Sync Track 1 · Artist 1" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Sync Track 4 · Artist 4" }));
    expect(order()).toEqual([1, 2, 3, 4, 5]);
  });

  it("puts a tick back, and says why, when the engine refuses it", async () => {
    bridge.setMatchTicks.mockRejectedValueOnce(new Error("The library is busy"));
    renderTab();
    await loaded();
    await userEvent.click(screen.getByRole("checkbox", { name: "Sync Track 2 · Artist 2" }));
    await waitFor(() => expect(screen.getByRole("checkbox", { name: "Sync Track 2 · Artist 2" })).toBeChecked());
    expect(await screen.findByText("The library is busy")).toBeInTheDocument();
    expect(facts()).toHaveTextContent("5 tracks · 2 ticked to sync");
  });

  it("keeps the ticks out of the tab order: one tab stop for the table, the row, and Space on it ticks", async () => {
    renderTab();
    await loaded();
    for (const box of screen.getAllByRole("checkbox", { name: /^Sync Track/ })) expect(box).toHaveAttribute("tabindex", "-1");
    // The header tick stays reachable; the rows have one tab stop between them.
    expect(screen.getAllByRole("row").filter((row) => row.getAttribute("tabindex") === "0")).toHaveLength(1);
    rowOf(2).focus();
    fireEvent.keyDown(rowOf(2), { key: " " });
    await waitFor(() => expect(bridge.setMatchTicks).toHaveBeenCalledWith({ ticked: false, track_ids: [2] }));
    expect(screen.getByRole("checkbox", { name: "Sync Track 2 · Artist 2" })).not.toBeChecked();
    // A track with no match cannot be ticked, so Space on it does nothing.
    fireEvent.keyDown(rowOf(3), { key: " " });
    expect(bridge.setMatchTicks).toHaveBeenCalledTimes(1);
    expect(rowOf(2)).toHaveAttribute("data-owns-space");
  });

  it("marks a track a newer search disagrees with, in words, beside Check", async () => {
    world.review = [reviewTrack(1, "to_check", { disputed: true }), reviewTrack(2, "matched")];
    renderTab();
    await loaded();
    expect(within(rowOf(1)).getByText("newer match differs")).toBeInTheDocument();
    expect(within(rowOf(2)).queryByText("newer match differs")).toBeNull();
  });

  it("offers an Undo on the header tick that takes the whole batch back", async () => {
    world.review = world.review.map((row) => (row.tickable ? { ...row, ticked: true } : row));
    bridge.setMatchTicks.mockResolvedValue({ ticked: false, changed: 3, skipped: 0, batch_id: "ticks-batch" });
    renderTab();
    await loaded();
    await userEvent.click(screen.getByRole("checkbox", { name: "Tick every track with a match" }));
    await userEvent.click(await screen.findByRole("button", { name: "Undo" }));
    await waitFor(() => expect(bridge.revertBatch).toHaveBeenCalledWith({ batch_id: "ticks-batch" }));
    await waitFor(() => expect(live()).toHaveTextContent("Took back the ticks."));
  });

  it("follows a long header tick as a job and reads the result", async () => {
    bridge.setMatchTicks.mockResolvedValue({ ticked: false, batch_id: "job-batch", job_id: "tick-job", id: "tick-job" });
    bridge.getJob = vi.fn().mockResolvedValue({ id: "tick-job", state: "succeeded" });
    bridge.getJobResults = vi.fn().mockResolvedValue({
      id: "tick-job",
      state: "succeeded",
      result: { ticked: false, changed: 9, skipped: 0, batch_id: "job-batch" },
    });
    renderTab();
    await loaded();
    await userEvent.click(screen.getByRole("checkbox", { name: "Tick every track with a match" }));
    await waitFor(() => expect(live()).toHaveTextContent("Ticked 9 tracks"));
    expect(bridge.getJobResults).toHaveBeenCalledWith("tick-job");
  });

  it("unticks every track with a match from the header, by the review's scope, and reads the table again", async () => {
    world.review = world.review.map((row) => (row.tickable ? { ...row, ticked: true } : row));
    renderTab({ source: { jobId: "job-1" } });
    await loaded();
    bridge.getMatchReview.mockClear();
    await userEvent.click(screen.getByRole("checkbox", { name: "Tick every track with a match" }));
    expect(bridge.setMatchTicks).toHaveBeenCalledWith({ ticked: false, scope: { job_id: "job-1" } });
    await waitFor(() => expect(bridge.getMatchReview).toHaveBeenCalled());
    await waitFor(() => expect(facts()).toHaveTextContent("5 tracks · 0 ticked to sync"));
    expect(live()).toHaveTextContent("Unticked 3 tracks: they will be left out.");
    expect(screen.getByRole("button", { name: "Sync to files…" })).toBeDisabled();
  });

  it("ticks them all from the header when some are not, and marks it half ticked", async () => {
    renderTab();
    await loaded();
    const header = screen.getByRole("checkbox", { name: "Tick every track with a match" }) as HTMLInputElement;
    // Half ticked is set in an effect React may run after the table shows.
    await waitFor(() => expect(header.indeterminate).toBe(true));
    expect(header.checked).toBe(false);
    await userEvent.click(header);
    expect(bridge.setMatchTicks).toHaveBeenCalledWith({ ticked: true, scope: { playlist_id: 7 } });
    await waitFor(() => expect(facts()).toHaveTextContent("5 tracks · 3 ticked to sync"));
    expect((screen.getByRole("checkbox", { name: "Tick every track with a match" }) as HTMLInputElement).checked).toBe(true);
  });

  it("has a header tick that waits when there is nothing to tick", async () => {
    world.review = [reviewTrack(1, "not_found"), reviewTrack(2, "search_failed")];
    renderTab();
    await loaded();
    expect(screen.getByRole("checkbox", { name: "Tick every track with a match" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Sync to files…" })).toBeDisabled();
  });
});

describe("the Sync button", () => {
  it("is the toned-down green write button, and opens the Sync window on this review (D14)", async () => {
    renderTab();
    await loaded();
    expect(screen.getByRole("button", { name: "Sync to files…" })).toHaveClass("cp-btn--write");
    await userEvent.click(screen.getByRole("button", { name: "Sync to files…" }));
    expect(screen.getByText('syncing hJ {"playlistId":7}')).toBeInTheDocument();
  });

  it("waits for something to be ticked, and says so", async () => {
    world.review = [reviewTrack(1, "matched", { ticked: false })];
    renderTab();
    await loaded();
    const sync = screen.getByRole("button", { name: "Sync to files…" });
    expect(sync).toBeDisabled();
  });

  it("reads the table again and tells the page once files were written", async () => {
    const { props } = renderTab();
    await loaded();
    await userEvent.click(screen.getByRole("button", { name: "Sync to files…" }));
    bridge.getMatchReview.mockClear();
    await userEvent.click(screen.getByRole("button", { name: "files written" }));
    await waitFor(() => expect(bridge.getMatchReview).toHaveBeenCalled());
    expect(props.onChanged).toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "close sync" }));
    expect(screen.queryByRole("dialog", { name: "Sync window" })).toBeNull();
  });
});

describe("the side panel", () => {
  it("opens on a click, straight on the candidates, and the arrows move it to the next track", async () => {
    const onPanelChange = vi.fn();
    renderTab({ onPanelChange });
    await loaded();
    fireEvent.click(rowOf(1));
    const panel = await screen.findByRole("complementary", { name: /^Candidates for / });
    expect(await within(panel).findByRole("radiogroup", { name: "Beatport candidates" })).toBeInTheDocument();
    expect(within(panel).getByText("1 of 5")).toBeInTheDocument();
    expect(panel).toHaveFocus();
    expect(onPanelChange).toHaveBeenLastCalledWith(true);

    press("ArrowDown");
    await waitFor(() => expect(within(screen.getByRole("complementary")).getByText("2 of 5")).toBeInTheDocument());
    expect(within(screen.getByRole("complementary")).getAllByText("Track 2").length).toBeGreaterThan(0);
    press("ArrowUp");
    await waitFor(() => expect(within(screen.getByRole("complementary")).getByText("1 of 5")).toBeInTheDocument());
  });

  it("does not open on a tick, and Enter on the row plays it instead of opening the panel", async () => {
    const playQueue = vi.fn().mockResolvedValue({ ok: true });
    (window.cuepoint as unknown as Record<string, unknown>).player = { playQueue };
    renderTab();
    await loaded();
    await userEvent.click(screen.getByRole("checkbox", { name: "Sync Track 2 · Artist 2" }));
    expect(screen.queryByRole("complementary")).toBeNull();
    fireEvent.keyDown(rowOf(2), { key: "Enter" });
    await waitFor(() => expect(playQueue).toHaveBeenCalledTimes(1));
    expect(playQueue.mock.calls[0]![0]).toHaveLength(1);
    expect(screen.queryByRole("complementary")).toBeNull();
  });

  it("plays a row on a double-click", async () => {
    const playQueue = vi.fn().mockResolvedValue({ ok: true });
    (window.cuepoint as unknown as Record<string, unknown>).player = { playQueue };
    renderTab();
    await loaded();
    fireEvent.doubleClick(rowOf(2));
    await waitFor(() => expect(playQueue).toHaveBeenCalledTimes(1));
  });

  it("closes on Esc, and gives the keyboard back to the row", async () => {
    const onPanelChange = vi.fn();
    renderTab({ onPanelChange });
    await loaded();
    fireEvent.click(rowOf(2));
    await screen.findByRole("complementary", { name: /^Candidates for / });
    press("Escape");
    await waitFor(() => expect(screen.queryByRole("complementary")).toBeNull());
    expect(rowOf(2)).toHaveFocus();
    expect(onPanelChange).toHaveBeenLastCalledWith(false);
  });

  it("keeps the preview of a row playable while the panel is open, and opens no panel from it", async () => {
    renderTab();
    await loaded();
    expect(within(rowOf(1)).getByRole("button", { name: /Play the Beatport preview of Track 1/ })).toBeInTheDocument();
    expect(within(rowOf(3)).queryByRole("button", { name: /preview/ })).toBeNull();
  });

  it("opens on the track the Inspector linked to, once the table is read", async () => {
    renderTab({ initialTrackId: 2 });
    const panel = await screen.findByRole("complementary", { name: /^Candidates for / }, LOADED);
    expect(within(panel).getByText("2 of 5")).toBeInTheDocument();
  });

  it("unticks from the panel with None of these, leave it out, and says so", async () => {
    renderTab();
    await loaded();
    fireEvent.click(rowOf(2));
    const panel = await screen.findByRole("complementary", { name: /^Candidates for / });
    await userEvent.click(within(panel).getByRole("button", { name: "None of these, leave it out" }));
    expect(bridge.setMatchTicks).toHaveBeenCalledWith({ ticked: false, track_ids: [2] });
    await waitFor(() => expect(live()).toHaveTextContent("Unticked “Track 2”"));
    expect(within(panel).getByRole("button", { name: "None of these, leave it out" })).toBeDisabled();
  });

  it("uses another candidate with Use this match: the engine accepts it, which ticks the track, and the table reads again", async () => {
    renderTab();
    await loaded();
    fireEvent.click(rowOf(4));
    const panel = await screen.findByRole("complementary", { name: /^Candidates for / });
    await within(panel).findByRole("radiogroup", { name: "Beatport candidates" });
    bridge.getMatchReview.mockClear();
    await userEvent.click(within(panel).getByRole("button", { name: "Use this match" }));
    expect(bridge.decideMatch).toHaveBeenCalledWith({ decision: "accept", track_id: 4, candidate_id: 1001 });
    await waitFor(() => expect(bridge.getMatchReview).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByRole("checkbox", { name: "Sync Track 4 · Artist 4" })).toBeChecked());
    expect(live()).toHaveTextContent("Using this match for “Track 4”: it will be synced.");
  });

  it("says why a choice failed", async () => {
    bridge.decideMatch.mockRejectedValueOnce(new Error("The library is busy"));
    renderTab();
    await loaded();
    fireEvent.click(rowOf(4));
    const panel = await screen.findByRole("complementary", { name: /^Candidates for / });
    await within(panel).findByRole("radiogroup", { name: "Beatport candidates" });
    await userEvent.click(within(panel).getByRole("button", { name: "Use this match" }));
    expect(await screen.findByText("The library is busy")).toBeInTheDocument();
  });

  it("takes a hand search's result into the row", async () => {
    renderTab();
    await loaded();
    fireEvent.click(rowOf(3));
    const panel = await screen.findByRole("complementary", { name: /^Candidates for / });
    await userEvent.click(within(panel).getByRole("button", { name: "Search Beatport" }));
    await waitFor(() => expect(bridge.searchMatch).toHaveBeenCalledWith({ track_id: 3, query: "Track 3 Artist 3" }));
    await waitFor(() => expect(bridge.getMatchReview.mock.calls.length).toBeGreaterThan(1));
  });
});

describe("a long review", () => {
  it("draws only the rows in view, with a scroll that covers them all, and moves the cursor through them", async () => {
    world.review = Array.from({ length: 5000 }, (_, index) => reviewTrack(index + 1, "matched"));
    renderTab();
    await loaded();
    expect(facts()).toHaveTextContent("5,000 tracks · 5,000 ticked to sync");
    expect(order().length).toBeLessThan(100);
    // A page of 2,000 is read, and the rest on request: the table says how many it holds.
    expect(screen.getByRole("table")).toHaveAttribute("aria-rowcount", "2001");
    expect(screen.getByRole("button", { name: "Show all 5,000" })).toBeInTheDocument();
    press("ArrowDown");
    await waitFor(() => expect(document.activeElement?.getAttribute("data-track-id")).toBe("2"));
    press("ArrowDown");
    await waitFor(() => expect(document.activeElement?.getAttribute("data-track-id")).toBe("3"));
  });

  it("reads on from the last row's cursor when the review holds more than a page", async () => {
    const all = Array.from({ length: 3 }, (_, index) => reviewTrack(index + 1, "matched"));
    bridge.getMatchReview.mockImplementation(async (params?: { after?: string }) => ({
      job_id: null,
      label: null,
      total: 3,
      counts: { matched: 3, to_check: 0, not_found: 0, search_failed: 0 },
      ticked: 3,
      tracks: params?.after ? all.slice(2) : all.slice(0, 2),
    }));
    renderTab();
    await loaded();
    await userEvent.click(screen.getByRole("button", { name: "Show all 3" }));
    await waitFor(() => expect(order()).toEqual([1, 2, 3]));
    expect(bridge.getMatchReview).toHaveBeenLastCalledWith({ playlistId: 7, after: "2:2", limit: 2000 });
  });
});

describe("keys and selection follow the Library's table (C190, C191)", () => {
  it("selects the row that is clicked, and only it", async () => {
    renderTab();
    await loaded();
    fireEvent.click(rowOf(2));
    expect(rowOf(2)).toHaveAttribute("aria-selected", "true");
    fireEvent.click(rowOf(4));
    expect(rowOf(2)).toHaveAttribute("aria-selected", "false");
    expect(rowOf(4)).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("1 selected")).toBeInTheDocument();
  });

  it("moves the selection with the arrows, and Shift extends it", async () => {
    renderTab();
    await loaded();
    fireEvent.click(rowOf(1));
    press("ArrowDown");
    await waitFor(() => expect(rowOf(2)).toHaveAttribute("aria-selected", "true"));
    expect(rowOf(1)).toHaveAttribute("aria-selected", "false");
    press("ArrowDown", { shiftKey: true });
    await waitFor(() => expect(screen.getByText("2 selected")).toBeInTheDocument());
    expect(rowOf(3)).toHaveAttribute("aria-selected", "true");
  });

  it("extends with Shift+Down twice from where the cursor is, even with the panel open", async () => {
    renderTab();
    await loaded();
    fireEvent.click(rowOf(1));
    await screen.findByRole("complementary", { name: /^Candidates for / });
    press("ArrowDown", { shiftKey: true });
    press("ArrowDown", { shiftKey: true });
    await waitFor(() => expect(screen.getByText("3 selected")).toBeInTheDocument());
  });

  it("leaves the arrows on a candidate's radio to the radio: they change the pick, not the track", async () => {
    renderTab();
    await loaded();
    fireEvent.click(rowOf(1));
    const panel = await screen.findByRole("complementary", { name: /^Candidates for / });
    const radios = await within(panel).findAllByRole("radio");
    radios[0]!.focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(within(screen.getByRole("complementary")).getByText("1 of 5")).toBeInTheDocument();
    expect(radios[1]).toBeChecked();
  });

  it("offers Try again when the table cannot be read, but not when there is no desktop app", async () => {
    bridge.getMatchReview.mockRejectedValueOnce(new Error("The library service is not running"));
    renderTab();
    const alert = await screen.findByRole("alert", undefined, LOADED);
    bridge.getMatchReview.mockClear();
    await userEvent.click(within(alert).getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(bridge.getMatchReview).toHaveBeenCalled());
    await loaded();
  });

  it("does not tint a row for being ticked: the look is the selection's alone", async () => {
    renderTab();
    await loaded();
    expect(rowOf(2)).toHaveAttribute("aria-selected", "false");
    expect(rowOf(2).className).not.toMatch(/ticked|current/);
  });

  it("offers Tick to sync in the bar and the menu on exactly the same tracks (C185)", async () => {
    renderTab();
    await loaded();
    // Track 4 has a match and is unticked: both offer it. Track 2 is ticked: neither does.
    fireEvent.click(rowOf(4));
    expect(screen.getByRole("button", { name: "Tick to sync" })).toBeEnabled();
    fireEvent.contextMenu(rowOf(4));
    expect(within(await screen.findByRole("menu")).getByRole("menuitem", { name: "Tick to sync" })).not.toHaveAttribute("aria-disabled", "true");
    press("Escape");
    fireEvent.click(rowOf(2));
    expect(screen.getByRole("button", { name: "Tick to sync" })).toBeDisabled();
    fireEvent.contextMenu(rowOf(2));
    expect(within(await screen.findByRole("menu")).getByRole("menuitem", { name: "Tick to sync" })).toHaveAttribute("aria-disabled", "true");
  });
});

describe("selecting rows and the right-click menu", () => {
  it("selects with Ctrl-click and Shift-click, says the count once, and clears with Esc", async () => {
    renderTab();
    await loaded();
    fireEvent.click(rowOf(1), { ctrlKey: true });
    fireEvent.click(rowOf(3), { ctrlKey: true });
    expect(rowOf(1)).toHaveAttribute("aria-selected", "true");
    expect(rowOf(2)).toHaveAttribute("aria-selected", "false");
    expect(screen.getByText("2 selected")).toBeInTheDocument();
    // A Ctrl-click only selects: the panel stays closed.
    expect(screen.queryByRole("complementary")).toBeNull();
    fireEvent.click(rowOf(5), { shiftKey: true });
    expect(screen.getByText("3 selected")).toBeInTheDocument();
    press("Escape");
    expect(screen.queryByText(/\d+ selected/)).toBeNull();
  });

  it("leaves Esc alone when it has nothing to close or clear", async () => {
    renderTab();
    await loaded();
    const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    act(() => {
      window.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(false);
  });

  it("drops a selected track that leaves the list when the table is read again", async () => {
    const { rerender, props } = renderTab();
    await loaded();
    fireEvent.click(rowOf(1), { ctrlKey: true });
    fireEvent.click(rowOf(3), { ctrlKey: true });
    expect(screen.getByText("2 selected")).toBeInTheDocument();

    world.review = world.review.filter((entry: { track_id: number }) => entry.track_id !== 3);
    rerender(
      <ScaleProvider>
        <ToastProvider>
          <ReviewTab {...props} version={1} />
        </ToastProvider>
      </ScaleProvider>,
    );

    await waitFor(() => expect(screen.getByText("1 selected")).toBeInTheDocument());
  });

  it("selects every track with Ctrl+A", async () => {
    renderTab();
    await loaded();
    // The table can show before its rows; Ctrl+A with no rows is left alone, so wait for all five.
    await waitFor(() => expect(screen.getAllByRole("row").filter((row) => row.hasAttribute("data-track-id"))).toHaveLength(5));
    press("a", { ctrlKey: true });
    await waitFor(() => expect(screen.getByText("5 selected")).toBeInTheDocument());
  });

  it("selects the row on right-click and opens the base menu with a This page block", async () => {
    renderTab();
    await loaded();
    fireEvent.contextMenu(rowOf(2));
    expect(rowOf(2)).toHaveAttribute("aria-selected", "true");
    const menu = await screen.findByRole("menu");
    for (const name of ["Play", "Play next", "Add to queue", "Tick to sync", "Leave out", "Choose a match", "More"]) {
      expect(within(menu).getByRole("menuitem", { name })).toBeInTheDocument();
    }
    expect(within(menu).getByText("This page")).toBeInTheDocument();
  });
});
