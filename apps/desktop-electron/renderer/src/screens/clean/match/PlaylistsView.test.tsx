/**
 * The Playlists view (C22): the filter box, the whole library first, and the
 * buttons in the Next column: a Match on every row, Stop while it matches,
 * Review N › and Save N to files….
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
    { id: 4, name: "Closing", path: "", ...COUNTS, unsaved: 39 },
    { id: 5, name: "hj", path: "", ...COUNTS, running: { job_id: "j", done: 108, total: 180 } },
    { id: 6, name: "Spare", path: "", ...COUNTS, track_count: 0 },
    { id: 7, name: "Found nothing", path: "", ...COUNTS, track_count: 24, accepted: 0, no_match: 24 },
  ],
};

function renderView(overrides: Partial<Props> = {}) {
  const props: Props = {
    data: DATA,
    onMatch: vi.fn(),
    onStop: vi.fn(),
    onReview: vi.fn(),
    onSee: vi.fn(),
    ...overrides,
  };
  return { props, ...render(<PlaylistsView {...props} />) };
}

function bodyRows(): HTMLElement[] {
  return screen.getAllByRole("row").slice(1);
}

describe("the Playlists view", () => {
  it("lists the whole library first, then the playlists, each with its tracks and status", () => {
    renderView();
    const rows = bodyRows();
    expect(rows).toHaveLength(8);
    expect(within(rows[0]!).getByText("Whole library")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("1,234")).toBeInTheDocument();
    // The folder path is muted before the name.
    const peak = rows[1]!;
    expect(peak).toHaveTextContent("Techno / Peak time");
    expect(within(peak).getByText("Techno /", { exact: false })).toHaveClass("playlists__path");
    expect(within(peak).getByText("Done")).toHaveClass("cp-status--done");
    expect(within(rows[2]!).getByText("Not matched")).toHaveClass("cp-status--problem");
    expect(within(rows[3]!).getByText("18 to check")).toHaveClass("cp-status--action");
    expect(within(rows[3]!).getByText("22 confirmed")).toHaveClass("cp-status--done");
    expect(within(rows[4]!).getByText("39 ready to save")).toBeInTheDocument();
    expect(within(rows[5]!).getByText("Matching 108 of 180")).toBeInTheDocument();
    expect(within(rows[6]!).getByText("Empty")).toBeInTheDocument();
    expect(within(rows[7]!).getByText("24 not found")).toHaveClass("cp-status--problem");
  });

  it("has no tick boxes and no table column for them", () => {
    renderView();
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(screen.getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual([
      "Playlist",
      "Tracks",
      "Beatport",
      "Next",
    ]);
  });

  it("filters by name and by folder, ignoring case", () => {
    renderView();
    fireEvent.change(screen.getByLabelText("Filter playlists"), { target: { value: "TECHNO" } });
    expect(screen.getByText("Peak time")).toBeInTheDocument();
    expect(screen.queryByText("Warmup")).toBeNull();
    // The whole library is always there.
    expect(screen.getByText("Whole library")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Filter playlists"), { target: { value: "warm" } });
    expect(screen.getByText("Warmup")).toBeInTheDocument();
    expect(screen.queryByText("Peak time")).toBeNull();

    fireEvent.change(screen.getByLabelText("Filter playlists"), { target: { value: "zzz" } });
    expect(screen.getByText("No playlist has that in its name or folder.")).toBeInTheDocument();
  });

  it("draws a bar for a running playlist, and a Stop for its job instead of a Match", () => {
    const { props } = renderView();
    const bar = screen.getByRole("progressbar", { name: "hj progress" });
    expect(bar).toHaveAttribute("value", "108");
    expect(bar).toHaveAttribute("max", "180");
    expect(screen.queryByRole("button", { name: "Match hj" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Stop matching hj" }));
    expect(props.onStop).toHaveBeenCalledWith("j");
  });

  it("gives every row with tracks its own Match, and an empty playlist none", () => {
    const { props } = renderView();
    expect(screen.getByRole("button", { name: "Match Peak time" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Match Spare" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Match Warmup" }));
    expect(props.onMatch).toHaveBeenLastCalledWith(DATA.playlists[1]);
    // The whole library is a row like the others: null is the library.
    fireEvent.click(screen.getByRole("button", { name: "Match Whole library" }));
    expect(props.onMatch).toHaveBeenLastCalledWith(null);
  });

  it("waits every Match while a match runs, here or elsewhere, and says why on each row", () => {
    renderView({ matching: true });
    expect(screen.getByRole("button", { name: "Match Warmup" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Match Whole library" })).toBeDisabled();
    const warmup = bodyRows()[2]!;
    expect(within(warmup).getByText("one match at a time")).toBeInTheDocument();
    // A row that is being matched has its Stop, not the reason.
    expect(within(bodyRows()[5]!).queryByText("one match at a time")).toBeNull();
    // Nothing says it while nothing runs.
    expect(screen.getAllByText("one match at a time").length).toBeGreaterThan(0);
  });

  it("does not say one at a time while no match runs", () => {
    renderView();
    expect(screen.queryByText("one match at a time")).toBeNull();
  });

  it("offers Match again and See them › on a row whose search found nothing", () => {
    const { props } = renderView();
    const row = bodyRows()[7]!;
    expect(within(row).getByRole("button", { name: "Match Found nothing again" })).toHaveTextContent("Match again");
    fireEvent.click(within(row).getByRole("button", { name: "Match Found nothing again" }));
    expect(props.onMatch).toHaveBeenLastCalledWith(DATA.playlists[6]);
    fireEvent.click(within(row).getByRole("button", { name: "See them › for Found nothing" }));
    expect(props.onSee).toHaveBeenCalledWith(DATA.playlists[6]);
  });

  it("offers Review N › as the row's primary button, and calls onReview with the playlist", () => {
    const { props } = renderView();
    const review = screen.getByRole("button", { name: "Review 18 › for all" });
    expect(review).toHaveClass("cp-btn--primary");
    fireEvent.click(review);
    expect(props.onReview).toHaveBeenCalledWith(DATA.playlists[2]);
  });

  it("shows Save N to files… only when the page can save", () => {
    const { unmount } = renderView();
    expect(screen.queryByRole("button", { name: /^Save 39/ })).toBeNull();
    unmount();
    const onSave = vi.fn();
    renderView({ onSave });
    fireEvent.click(screen.getByRole("button", { name: "Save 39 to files… for Closing" }));
    expect(onSave).toHaveBeenCalledWith(DATA.playlists[3]);
  });

  it("puts Match beside Save N to files… in the same Next cell", () => {
    renderView({ onSave: vi.fn() });
    const closing = bodyRows()[4]!;
    const cell = within(closing).getByRole("button", { name: "Match Closing" }).closest("td")!;
    expect(within(cell).getByRole("button", { name: "Save 39 to files… for Closing" })).toBeInTheDocument();
  });

  it("draws the whole library row with a line under it when there are no playlists", () => {
    const { unmount } = renderView({ data: { whole_library: COUNTS, playlists: [] } });
    expect(screen.getByRole("button", { name: "Match Whole library" })).toBeEnabled();
    expect(screen.getByText("No playlists yet")).toBeInTheDocument();
    unmount();
    renderView({ data: null, error: "This needs the CuePoint desktop app." });
    expect(screen.getByRole("alert")).toHaveTextContent("This needs the CuePoint desktop app.");
  });
});
