/**
 * The Playlists view (C22): the filter box, the whole library first, ticking,
 * and the buttons in the Next column.
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
    { id: 3, name: "all", path: "", ...COUNTS, waiting: 18 },
    { id: 4, name: "Closing", path: "", ...COUNTS, unsaved: 39 },
    { id: 5, name: "hj", path: "", ...COUNTS, running: { job_id: "j", done: 108, total: 180 } },
    { id: 6, name: "Spare", path: "", ...COUNTS, track_count: 0 },
  ],
};

function renderView(overrides: Partial<Props> = {}) {
  const props: Props = {
    data: DATA,
    ticked: new Set<string>(),
    onTick: vi.fn(),
    onReview: vi.fn(),
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
    expect(rows).toHaveLength(7);
    expect(within(rows[0]!).getByText("Whole library")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("1,234")).toBeInTheDocument();
    // The folder path is muted before the name.
    const peak = rows[1]!;
    expect(peak).toHaveTextContent("Techno / Peak time");
    expect(within(peak).getByText("Techno /", { exact: false })).toHaveClass("playlists__path");
    expect(within(peak).getByText("Done")).toHaveClass("cp-status--done");
    expect(within(rows[2]!).getByText("Not matched")).toHaveClass("cp-status--problem");
    expect(within(rows[3]!).getByText("18 waiting for you")).toHaveClass("cp-status--action");
    expect(within(rows[4]!).getByText("39 ready to save")).toBeInTheDocument();
    expect(within(rows[5]!).getByText("Matching 108 of 180")).toBeInTheDocument();
    expect(within(rows[5]!).getByText("You can keep working")).toBeInTheDocument();
    expect(within(rows[6]!).getByText("Empty")).toBeInTheDocument();
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

  it("keeps a ticked row in view whatever the filter says", () => {
    renderView({ ticked: new Set(["playlist:2"]) });
    fireEvent.change(screen.getByLabelText("Filter playlists"), { target: { value: "peak" } });
    expect(screen.getByText("Peak time")).toBeInTheDocument();
    expect(screen.getByText("Warmup")).toBeInTheDocument();
    expect(screen.queryByText("hj")).toBeNull();
  });

  it("draws a bar for a running playlist", () => {
    renderView();
    const bar = screen.getByRole("progressbar", { name: "hj progress" });
    expect(bar).toHaveAttribute("value", "108");
    expect(bar).toHaveAttribute("max", "180");
  });

  it("disables the playlists' ticks while the whole library is ticked, and says why", () => {
    renderView({ ticked: new Set(["library"]) });
    expect(screen.getByText("Whole library includes every playlist.")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Match Whole library" })).toBeEnabled();
    expect(screen.getByRole("checkbox", { name: "Match Warmup" })).toBeDisabled();
  });

  it("reports a tick, for the whole library and for a playlist", () => {
    const { props } = renderView({ ticked: new Set(["playlist:2"]) });
    expect(screen.getByRole("checkbox", { name: "Match Warmup" })).toBeChecked();
    fireEvent.click(screen.getByRole("checkbox", { name: "Match Whole library" }));
    expect(props.onTick).toHaveBeenLastCalledWith("library", true);
    fireEvent.click(screen.getByRole("checkbox", { name: "Match Warmup" }));
    expect(props.onTick).toHaveBeenLastCalledWith("playlist:2", false);
  });

  it("calls onReview with the playlist when Review N is pressed", () => {
    const { props } = renderView();
    fireEvent.click(screen.getByRole("button", { name: "Review 18 for all" }));
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

  it("draws the whole library row with a line under it when there are no playlists", () => {
    const { props, unmount } = renderView({ data: { whole_library: COUNTS, playlists: [] } });
    expect(screen.getByRole("checkbox", { name: "Match Whole library" })).toBeEnabled();
    expect(screen.getByText("No playlists yet")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "Match Whole library" }));
    expect(props.onTick).toHaveBeenCalledWith("library", true);
    unmount();
    renderView({ data: null, error: "This needs the CuePoint desktop app." });
    expect(screen.getByRole("alert")).toHaveTextContent("This needs the CuePoint desktop app.");
  });
});
