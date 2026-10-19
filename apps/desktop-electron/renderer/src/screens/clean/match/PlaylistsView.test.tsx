/**
 * The Playlists view (C22): a tick on every playlist, the whole library as its own choice, one
 * Match N playlists button, and a Review button on what has been matched.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";

import type { CleanPlaylistCounts, CleanPlaylists } from "../../../api/cuepointBridge.types";
import { PlaylistsView, rowTimeLeft } from "./PlaylistsView";
import css from "./playlists.css?raw";

type Props = ComponentProps<typeof PlaylistsView>;

const COUNTS: CleanPlaylistCounts = {
  track_count: 40,
  not_matched: 0,
  waiting: 0,
  accepted: 40,
  rejected: 0,
  no_match: 0,
  unsaved: 0,
  running: null,
};

const NOT_SYNCED = { synced: false, synced_at: null };

const DATA: CleanPlaylists = {
  whole_library: { ...COUNTS, track_count: 1234 },
  playlists: [
    { id: 1, name: "Peak time", path: "Techno", ...COUNTS, synced: true, synced_at: "2020-03-04T10:00:00" },
    { id: 2, name: "Warmup", path: "", ...COUNTS, not_matched: 40, accepted: 0, ...NOT_SYNCED },
    { id: 3, name: "all", path: "", ...COUNTS, waiting: 18, accepted: 22, ...NOT_SYNCED },
    { id: 5, name: "hj", path: "", ...COUNTS, running: { job_id: "j", done: 108, total: 180 }, ...NOT_SYNCED },
    { id: 8, name: "Queued one", path: "", ...COUNTS, queued: true, ...NOT_SYNCED },
    { id: 6, name: "Spare", path: "", ...COUNTS, track_count: 0, ...NOT_SYNCED },
    { id: 7, name: "Found nothing", path: "", ...COUNTS, track_count: 24, accepted: 0, no_match: 24, ...NOT_SYNCED },
  ],
};

function renderView(overrides: Partial<Props> = {}) {
  const props: Props = { data: DATA, onMatch: vi.fn(), onReview: vi.fn(), ...overrides };
  return { props, ...render(<PlaylistsView {...props} />) };
}

function bodyRows(): HTMLElement[] {
  return screen.getAllByRole("row").slice(1);
}

function tick(name: string) {
  fireEvent.click(screen.getByRole("checkbox", { name: `Match ${name}` }));
}

describe("the list", () => {
  it("lists the whole library first, then the playlists, each with its tracks", () => {
    renderView();
    const rows = bodyRows();
    expect(rows).toHaveLength(8);
    expect(within(rows[0]!).getByText("Whole library")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("1,234")).toBeInTheDocument();
    const peak = rows[1]!;
    expect(peak).toHaveTextContent("Techno / Peak time");
    expect(within(peak).getByText("Techno /", { exact: false })).toHaveClass("playlists__path");
  });

  it("says only 'Synced <day>', in green, for a playlist whose values are in the files", () => {
    renderView();
    const rows = bodyRows();
    const badge = within(rows[1]!).getByText(/^Synced /);
    expect(badge).toHaveClass("cp-badge--success");
    expect(badge).toHaveTextContent("Synced Mar 4, 2020");
    // Nothing else is said about where a playlist stands: no Matched, not found or not matched yet.
    expect(screen.queryByText(/Matched/)).toBeNull();
    expect(screen.queryByText(/not found/)).toBeNull();
    expect(screen.queryByText(/not matched yet/i)).toBeNull();
    expect(screen.queryByText("Empty")).toBeNull();
    expect(screen.getAllByText(/^Synced /)).toHaveLength(1);
  });

  it("says a muted 'Not yet' for a playlist no sync has written, and nothing for the whole library", () => {
    renderView();
    const rows = bodyRows();
    expect(within(rows[1]!).queryByText("Not yet")).toBeNull();
    const notYet = screen.getAllByText("Not yet");
    expect(notYet.length).toBeGreaterThan(0);
    expect(notYet[0]).toHaveClass("playlists__not-yet");
    expect(within(rows[0]!).queryByText("Not yet")).toBeNull();
  });

  it("says Synced alone when a playlist is synced but no date came", () => {
    renderView({
      data: { whole_library: COUNTS, playlists: [{ id: 9, name: "x", path: "", ...COUNTS, synced: true, synced_at: null }] },
    });
    expect(screen.getByText("Synced")).toHaveClass("cp-badge--success");
  });

  it("has no steps list of its own: the area's caption says the step (D13)", () => {
    renderView();
    expect(screen.queryByRole("list", { name: "The steps" })).toBeNull();
  });

  it("draws the whole library's In your files cell as the muted dash (C182)", () => {
    renderView();
    const cell = within(bodyRows()[0]!).getAllByRole("cell")[3]!;
    expect(cell).toHaveTextContent("\u2014");
  });

  it("is the shared data table, with its numbers in the shared number class", () => {
    renderView();
    expect(screen.getByRole("table")).toHaveClass("cp-data-table");
    expect(within(bodyRows()[0]!).getByText("1,234")).toHaveClass("num");
  });

  it("highlights a clicked row without ticking it (C195)", () => {
    renderView();
    const row = screen.getByText("Warmup").closest("tr")!;
    fireEvent.click(row);
    expect(row).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("checkbox", { name: "Match Warmup" })).not.toBeChecked();
  });

  it("ticks and unticks every playlist on show from the header", () => {
    renderView();
    const header = screen.getByRole("checkbox", { name: "Tick every playlist" });
    fireEvent.click(header);
    expect(screen.getByRole("checkbox", { name: "Match Peak time" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Match Warmup" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Match hj" })).not.toBeChecked();
    fireEvent.click(header);
    expect(screen.getByRole("checkbox", { name: "Match Peak time" })).not.toBeChecked();
  });

  it("has a tick column, and the columns Playlist, Tracks and In your files", () => {
    renderView();
    expect(screen.getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual([
      "",
      "Playlist",
      "Tracks",
      "In your files",
      "Review",
    ]);
  });

  it("has no Match, Stop or Save button on a row: ticking and one button start a match", () => {
    renderView();
    expect(screen.queryByRole("button", { name: /^Match (Peak|Warmup|Whole)/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Stop/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Save/ })).toBeNull();
  });

  it("filters by name and by folder, ignoring case", () => {
    // The area's one search holds the text; the view narrows its rows by it.
    const { rerender, props } = renderView({ filter: "TECHNO" });
    expect(screen.getByText("Peak time")).toBeInTheDocument();
    expect(screen.queryByText("Warmup")).toBeNull();
    expect(screen.getByText("Whole library")).toBeInTheDocument();
    rerender(<PlaylistsView {...props} filter="zzz" />);
    expect(screen.getByText("Nothing matches \u201czzz\u201d")).toBeInTheDocument();
  });

  it("gives only the running playlist a bar, its count, the time left and a Stop; a queued one says Waiting", () => {
    const onStop = vi.fn();
    // The job has twice the running playlist's 72 tracks left, so the row has half its time.
    renderView({ secondsLeft: 120, progress: { done: 108, total: 252 }, onStop });
    const row = screen.getByText("hj").closest("tr")!;
    expect(within(row).getByText(/108 of 180 · about 1 minute left/)).toBeInTheDocument();
    expect(screen.getAllByRole("progressbar")).toHaveLength(1);
    expect(within(row).getByRole("progressbar")).toHaveAttribute("value", "108");
    fireEvent.click(within(row).getByRole("button", { name: "Stop matching hj" }));
    expect(onStop).toHaveBeenCalledWith("j");
    const queued = screen.getByText("Queued one").closest("tr")!;
    expect(within(queued).getByText("Waiting")).toBeInTheDocument();
    expect(within(queued).queryByRole("progressbar")).toBeNull();
    expect(within(queued).queryByRole("button", { name: /Stop/ })).toBeNull();
    expect(screen.getByRole("checkbox", { name: "Match Queued one" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "Match hj" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "Match Spare" })).toBeDisabled();
  });
});

describe("a playlist's time left", () => {
  it("is its share of the job's by tracks left, never more than the job's", () => {
    expect(rowTimeLeft(300, { done: 0, total: 100 }, { done: 0, total: 25 })).toBe(75);
    expect(rowTimeLeft(300, { done: 50, total: 100 }, { done: 10, total: 20 })).toBe(60);
    expect(rowTimeLeft(300, { done: 90, total: 100 }, { done: 0, total: 50 })).toBe(300);
    expect(rowTimeLeft(null, { done: 0, total: 100 }, { done: 0, total: 25 })).toBeNull();
    expect(rowTimeLeft(300, null, { done: 0, total: 25 })).toBeNull();
    expect(rowTimeLeft(300, { done: 100, total: 100 }, { done: 0, total: 25 })).toBeNull();
  });
});

describe("the bar under the list", () => {
  it("says to tick something while nothing is ticked", () => {
    renderView();
    expect(screen.getByText("Tick one or more playlists")).toBeInTheDocument();
  });

  it("counts the ticked playlists and their tracks", () => {
    renderView();
    tick("Peak time");
    tick("Warmup");
    expect(screen.getByText("2 playlists \u00b7 80 tracks")).toBeInTheDocument();
    expect(screen.queryByText("Tick one or more playlists")).toBeNull();
  });

  it("counts the whole library by its tracks", () => {
    renderView();
    tick("Whole library");
    expect(screen.getByText("Whole library \u00b7 1,234 tracks")).toBeInTheDocument();
  });
});

describe("matching what is ticked", () => {
  it("waits for a tick, saying what it will match", () => {
    renderView();
    // One label that never changes, so the button's width does not (the count is beside it).
    expect(screen.getByRole("button", { name: "Match ticked playlists" })).toBeDisabled();
    tick("Peak time");
    expect(screen.getByRole("button", { name: "Match ticked playlists" })).toBeEnabled();
    tick("Warmup");
    expect(screen.getByRole("button", { name: "Match ticked playlists" })).toBeEnabled();
  });

  it("matches the ticked playlists as one choice, then clears the ticks", () => {
    const { props } = renderView();
    tick("Peak time");
    tick("Warmup");
    fireEvent.click(screen.getByRole("button", { name: "Match ticked playlists" }));
    expect(props.onMatch).toHaveBeenCalledWith({ whole: false, playlists: [DATA.playlists[0], DATA.playlists[1]] });
    expect(screen.getByRole("checkbox", { name: "Match Peak time" })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Match ticked playlists" })).toBeDisabled();
  });

  it("makes the whole library exclusive: ticking it unticks and disables the playlists", () => {
    const { props } = renderView();
    tick("Peak time");
    tick("Whole library");
    expect(screen.getByRole("checkbox", { name: "Match Peak time" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Match Peak time" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "Match Warmup" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Match ticked playlists" }));
    expect(props.onMatch).toHaveBeenCalledWith({ whole: true });
  });

  it("gives the playlists back when the whole library is unticked", () => {
    renderView();
    tick("Whole library");
    tick("Whole library");
    expect(screen.getByRole("checkbox", { name: "Match Peak time" })).toBeEnabled();
  });

  it("waits while a match runs, and says why", () => {
    renderView({ matching: true });
    tick("Peak time");
    expect(screen.getByRole("button", { name: "Match ticked playlists" })).toBeDisabled();
    // The reason is a hint on the button now, not a line in the bar.
    expect(screen.queryByText(/One match at a time/)).toBeNull();
  });
});

describe("Review", () => {
  it("is offered on what has been matched, and opens that playlist", () => {
    const { props } = renderView();
    fireEvent.click(screen.getByRole("button", { name: "Review all" }));
    expect(props.onReview).toHaveBeenCalledWith(DATA.playlists[2]);
    expect(screen.queryByRole("button", { name: "Review Warmup" })).toBeNull();
  });

  it("opens the whole library with null", () => {
    const { props } = renderView();
    fireEvent.click(screen.getByRole("button", { name: "Review Whole library" }));
    expect(props.onReview).toHaveBeenCalledWith(null);
  });

  it("is offered on a playlist the search found nothing for", () => {
    renderView();
    expect(screen.getByRole("button", { name: "Review Found nothing" })).toBeInTheDocument();
  });
});

describe("with nothing to show", () => {
  it("draws the whole library row with a line under it when there are no playlists, and the problem when unread", () => {
    const { unmount } = renderView({ data: { whole_library: COUNTS, playlists: [] } });
    expect(screen.getByRole("checkbox", { name: "Match Whole library" })).toBeEnabled();
    expect(screen.getByText("No playlists yet")).toBeInTheDocument();
    unmount();
    renderView({ data: null, error: "This needs the CuePoint desktop app." });
    expect(screen.getByRole("alert")).toHaveTextContent("This needs the CuePoint desktop app.");
  });

  it("offers Try again on a failed read, in a red notice (C142)", () => {
    const onRetry = vi.fn();
    renderView({ data: null, error: "The library service is not running", onRetry });
    expect(screen.getByRole("alert")).toHaveClass("cp-notice--danger");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe("the rows stay one line", () => {
  it("cuts a long name with an ellipsis and keeps the running bar beside it", () => {
    expect(css).toMatch(/\.playlists__label\s*\{[^}]*text-overflow:\s*ellipsis/);
    expect(css).toMatch(/\.playlists__name-cell\s*\{[^}]*white-space:\s*nowrap/);
    expect(css).not.toMatch(/overflow-wrap:\s*anywhere/);
    renderView();
    const row = screen.getByText("hj").closest("tr")!;
    expect(row.querySelector(".playlists__name-line > progress")).not.toBeNull();
    expect(row.querySelector(".playlists__label")).toHaveAttribute("data-cut-hint");
  });

  it("keeps the footer's status at the left, beside the Match button at the right", () => {
    expect(css).toMatch(/\.playlists__choice\s*\{[^}]*margin-inline-end:\s*auto/);
    expect(css).toMatch(/\.playlists__next\s*\{[^}]*margin-inline-end:\s*auto/);
  });
});

describe("the number column's alignment", () => {
  it("is set by a rule that outweighs the table's left-aligned cells", () => {
    // The shared table sets the number column once (`.num`); this sheet must not set it again.
    expect(css).not.toMatch(/playlists__number/);
    expect(css).not.toMatch(/\.num\s*\{[^}]*text-align:\s*left/);
  });
});
