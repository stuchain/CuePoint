/**
 * The Playlists view (C22): a tick on every playlist, the whole library as its own choice, one
 * Match N playlists button, and a Review button on what has been matched.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";

import type { CleanPlaylistCounts, CleanPlaylists } from "../../../api/cuepointBridge.types";
import { PlaylistsView } from "./PlaylistsView";

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

const DATA: CleanPlaylists = {
  whole_library: { ...COUNTS, track_count: 1234 },
  playlists: [
    { id: 1, name: "Peak time", path: "Techno", ...COUNTS },
    { id: 2, name: "Warmup", path: "", ...COUNTS, not_matched: 40, accepted: 0 },
    { id: 3, name: "all", path: "", ...COUNTS, waiting: 18, accepted: 22 },
    { id: 5, name: "hj", path: "", ...COUNTS, running: { job_id: "j", done: 108, total: 180 } },
    { id: 6, name: "Spare", path: "", ...COUNTS, track_count: 0 },
    { id: 7, name: "Found nothing", path: "", ...COUNTS, track_count: 24, accepted: 0, no_match: 24 },
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
  it("lists the whole library first, then the playlists, each with its tracks and status", () => {
    renderView();
    const rows = bodyRows();
    expect(rows).toHaveLength(7);
    expect(within(rows[0]!).getByText("Whole library")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("1,234")).toBeInTheDocument();
    const peak = rows[1]!;
    expect(peak).toHaveTextContent("Techno / Peak time");
    expect(within(peak).getByText("Techno /", { exact: false })).toHaveClass("playlists__path");
    expect(within(peak).getByText("Matched · 40")).toHaveClass("cp-status--done");
    expect(within(rows[2]!).getByText("Not matched yet")).toBeInTheDocument();
    expect(within(rows[3]!).getByText("Matched · 40")).toBeInTheDocument();
    expect(within(rows[4]!).getByText("Matching 108 of 180")).toBeInTheDocument();
    expect(within(rows[5]!).getByText("Empty")).toBeInTheDocument();
    expect(within(rows[6]!).getByText("24 not found")).toHaveClass("cp-status--problem");
  });

  it("has a tick column, and the columns Playlist, Tracks and Status", () => {
    renderView();
    expect(screen.getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual([
      "Match",
      "Playlist",
      "Tracks",
      "Status",
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
    renderView();
    fireEvent.change(screen.getByLabelText("Filter playlists"), { target: { value: "TECHNO" } });
    expect(screen.getByText("Peak time")).toBeInTheDocument();
    expect(screen.queryByText("Warmup")).toBeNull();
    expect(screen.getByText("Whole library")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Filter playlists"), { target: { value: "zzz" } });
    expect(screen.getByText("No playlist has that in its name or folder.")).toBeInTheDocument();
  });

  it("draws a bar for a running playlist, which cannot be ticked", () => {
    renderView();
    const bar = screen.getByRole("progressbar", { name: "hj progress" });
    expect(bar).toHaveAttribute("value", "108");
    expect(bar).toHaveAttribute("max", "180");
    expect(screen.getByRole("checkbox", { name: "Match hj" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "Match Spare" })).toBeDisabled();
  });
});

describe("matching what is ticked", () => {
  it("waits for a tick, saying what it will match", () => {
    renderView();
    expect(screen.getByRole("button", { name: "Match playlists" })).toBeDisabled();
    tick("Peak time");
    expect(screen.getByRole("button", { name: "Match 1 playlist" })).toBeEnabled();
    tick("Warmup");
    expect(screen.getByRole("button", { name: "Match 2 playlists" })).toBeEnabled();
  });

  it("matches the ticked playlists as one choice, then clears the ticks", () => {
    const { props } = renderView();
    tick("Peak time");
    tick("Warmup");
    fireEvent.click(screen.getByRole("button", { name: "Match 2 playlists" }));
    expect(props.onMatch).toHaveBeenCalledWith({ whole: false, playlists: [DATA.playlists[0], DATA.playlists[1]] });
    expect(screen.getByRole("checkbox", { name: "Match Peak time" })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Match playlists" })).toBeDisabled();
  });

  it("makes the whole library exclusive: ticking it unticks and disables the playlists", () => {
    const { props } = renderView();
    tick("Peak time");
    tick("Whole library");
    expect(screen.getByRole("checkbox", { name: "Match Peak time" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Match Peak time" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "Match Warmup" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Match whole library" }));
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
    expect(screen.getByRole("button", { name: "Match 1 playlist" })).toBeDisabled();
    expect(screen.getByText("One match at a time: wait for the one that is running.")).toBeInTheDocument();
  });

  it("does not say one at a time while no match runs", () => {
    renderView();
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
});
