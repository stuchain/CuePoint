/**
 * The Inspector's first content (LIBUI-09, DEC-047), the clipboard format, and
 * the selection actions.
 *
 * DEC-024 built the Inspector container empty in Phase 2 and left each later
 * phase to fill it. This is that content: everything imported, read-only, plus
 * where the track sits in the collection.
 *
 * The property worth the most here is **absent is absent**. A field Rekordbox
 * did not supply must not read as a zero — unrated and rated-zero are
 * different facts, which is why LIBRARY-01 made those columns nullable.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react";

import type {
  LibraryTrackDetail,
  LibraryTrackRow,
} from "../../api/cuepointBridge.types";
import type { TrackColumnDef } from "../../components/table";
import { SelectionActions } from "./SelectionActions";
import { TrackDetailPanel } from "./TrackDetailPanel";
import { copySummary, tracksAsText, writeClipboard } from "./trackClipboard";
import { useTrackDetail } from "./useTrackDetail";

const TRACK: LibraryTrackRow = {
  id: 12,
  rekordbox_track_id: "900",
  title: "Strobe",
  artist: "deadmau5",
  remixer: null,
  album: "For Lack of a Better Name",
  label: "mau5trap",
  genre: "Progressive House",
  key: "8A",
  bpm: 128,
  year: 2009,
  duration_seconds: 634,
  rating: 4,
  play_count: 0,
  colour: null,
  date_added: "2020-01-05",
  comment: null,
  bitrate: 320,
  file_path: "/music/strobe.mp3",
};

const DETAIL: LibraryTrackDetail = {
  track: TRACK,
  playlists: [
    {
      id: 2,
      parent_id: 1,
      name: "warmup",
      kind: "playlist",
      depth: 1,
      position: 0,
      path: "SETS/warmup",
      track_count: 12,
    },
  ],
  playlist_count: 1,
};

function rowFor(label: string): HTMLElement {
  return screen.getByText(label).closest(".cp-track-detail__row") as HTMLElement;
}

describe("what the panel shows", () => {
  it("names the track and the artist", () => {
    render(<TrackDetailPanel detail={DETAIL} />);
    expect(screen.getByRole("heading", { name: "Strobe" })).toBeInTheDocument();
    expect(screen.getByText("deadmau5")).toBeInTheDocument();
  });

  it("shows every field the import captured (DEC-034)", () => {
    render(<TrackDetailPanel detail={DETAIL} />);
    for (const label of [
      "Remixer",
      "Album",
      "Label",
      "Genre",
      "Key",
      "BPM",
      "Year",
      "Length",
      "Rating",
      "Plays",
      "Colour",
      "Added",
      "Bitrate",
      "Comment",
      "File",
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("shows a rating as stars", () => {
    // The parser converted Rekordbox's 0/51/…/255 at import, so what is
    // stored is already a star count.
    render(<TrackDetailPanel detail={DETAIL} />);
    expect(within(rowFor("Rating")).getByText("★★★★")).toBeInTheDocument();
  });

  it("reads a missing field as absent, not as zero", () => {
    render(<TrackDetailPanel detail={DETAIL} />);
    expect(within(rowFor("Remixer")).getByText("—")).toBeInTheDocument();
    expect(within(rowFor("Colour")).getByText("—")).toBeInTheDocument();
  });

  it("reads a real zero as a zero", () => {
    // Never played is not the same as no play count recorded.
    render(<TrackDetailPanel detail={DETAIL} />);
    expect(within(rowFor("Plays")).getByText("0")).toBeInTheDocument();
  });

  it("reads a missing rating as absent rather than unrated", () => {
    render(
      <TrackDetailPanel detail={{ ...DETAIL, track: { ...TRACK, rating: null } }} />,
    );
    expect(within(rowFor("Rating")).getByText("—")).toBeInTheDocument();
  });

  it("shows a length in minutes and seconds", () => {
    render(<TrackDetailPanel detail={DETAIL} />);
    expect(within(rowFor("Length")).getByText("10:34")).toBeInTheDocument();
  });

  it("shows the file path", () => {
    render(<TrackDetailPanel detail={DETAIL} />);
    expect(within(rowFor("File")).getByText("/music/strobe.mp3")).toBeInTheDocument();
  });

  it("says what to do before anything is selected", () => {
    render(<TrackDetailPanel detail={null} />);
    expect(screen.getByText(/select a track/i)).toBeInTheDocument();
  });

  it("says it is reading while it reads", () => {
    render(<TrackDetailPanel detail={null} loading />);
    expect(screen.getByText(/reading the track/i)).toBeInTheDocument();
  });

  it("says when the track could not be read", () => {
    render(<TrackDetailPanel detail={null} error="Engine offline" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Engine offline");
  });
});

describe("it is read-only (DEC-047)", () => {
  it("offers nothing to type into", () => {
    render(<TrackDetailPanel detail={DETAIL} />);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
  });

  it("offers no rating to click", () => {
    render(<TrackDetailPanel detail={DETAIL} />);
    const buttons = screen.getAllByRole("button").map((b) => b.textContent ?? "");
    expect(buttons.some((text) => text.includes("★"))).toBe(false);
  });
});

describe("where the track sits in the collection", () => {
  it("lists the playlists holding it", () => {
    render(<TrackDetailPanel detail={DETAIL} />);
    expect(screen.getByText("In 1 playlist")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /warmup/ })).toBeInTheDocument();
  });

  it("says when it is in none", () => {
    render(
      <TrackDetailPanel detail={{ ...DETAIL, playlists: [], playlist_count: 0 }} />,
    );
    expect(screen.getByText("In no playlists")).toBeInTheDocument();
  });

  it("scopes the table to a playlist that is clicked", () => {
    const onSelectPlaylist = vi.fn();
    render(<TrackDetailPanel detail={DETAIL} onSelectPlaylist={onSelectPlaylist} />);

    fireEvent.click(screen.getByRole("button", { name: /warmup/ }));

    expect(onSelectPlaylist).toHaveBeenCalledWith(
      expect.objectContaining({ id: 2, name: "warmup" }),
    );
  });

  it("shows the file when asked", () => {
    const onReveal = vi.fn();
    render(<TrackDetailPanel detail={DETAIL} onReveal={onReveal} />);

    fireEvent.click(screen.getByRole("button", { name: "Show in folder" }));

    expect(onReveal).toHaveBeenCalledWith("/music/strobe.mp3");
  });
});

describe("with several tracks selected", () => {
  it("shows the last one clicked, and how many there are", () => {
    render(<TrackDetailPanel detail={DETAIL} selectionCount={7} />);
    expect(screen.getByRole("heading", { name: "Strobe" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("7 tracks selected");
  });

  it("says nothing about a selection of one", () => {
    render(<TrackDetailPanel detail={DETAIL} selectionCount={1} />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});

describe("the actions", () => {
  function actions(props: Partial<React.ComponentProps<typeof SelectionActions>> = {}) {
    const handlers = {
      onCopy: vi.fn(),
      onReveal: vi.fn(),
      onClear: vi.fn(),
      onSelectAll: vi.fn(),
    };
    render(
      <SelectionActions
        count={2}
        describedByQuery={false}
        revealPath={null}
        total={50_000}
        {...handlers}
        {...props}
      />,
    );
    return handlers;
  }

  it("counts what is selected", () => {
    actions({ count: 1_204 });
    expect(screen.getByRole("status")).toHaveTextContent("1,204 tracks selected");
  });

  it("says when the selection is the query rather than a list", () => {
    actions({ count: 47_913, describedByQuery: true });
    expect(screen.getByRole("status")).toHaveTextContent("everything matching");
  });

  it("offers the library's count when nothing is selected", () => {
    actions({ count: 0, total: 3_880 });
    expect(screen.getByText("3,880 tracks")).toBeInTheDocument();
  });

  it("offers select-all when nothing is selected", () => {
    const handlers = actions({ count: 0 });

    fireEvent.click(screen.getByRole("button", { name: "Select all" }));

    expect(handlers.onSelectAll).toHaveBeenCalled();
  });

  it("copies", () => {
    const handlers = actions();
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    expect(handlers.onCopy).toHaveBeenCalled();
  });

  it("clears", () => {
    const handlers = actions();
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(handlers.onClear).toHaveBeenCalled();
  });

  it("reveals one file", () => {
    const handlers = actions({ count: 1, revealPath: "/music/strobe.mp3" });

    fireEvent.click(screen.getByRole("button", { name: "Show in folder" }));

    expect(handlers.onReveal).toHaveBeenCalledWith("/music/strobe.mp3");
  });

  it("offers no reveal for several tracks", () => {
    // One track, one file: revealing five folders at once is not a thing
    // anyone asked for.
    actions({ count: 5, revealPath: null });
    expect(screen.getByRole("button", { name: "Show in folder" })).toBeDisabled();
  });
});

describe("copying tracks", () => {
  const columns: TrackColumnDef<LibraryTrackRow>[] = [
    { id: "title", header: "Title", render: (t) => t.title },
    { id: "artist", header: "Artist", render: (t) => t.artist },
    { id: "bpm", header: "BPM", render: (t) => (t.bpm == null ? "" : t.bpm.toFixed(1)) },
  ];

  it("writes the visible columns, in the order they are shown", () => {
    const text = tracksAsText(columns, [TRACK]);
    expect(text.split("\n")[0]).toBe("Title\tArtist\tBPM");
    expect(text.split("\n")[1]).toBe("Strobe\tdeadmau5\t128.0");
  });

  it("writes what the table shows, not the raw field", () => {
    const text = tracksAsText(columns, [TRACK]);
    expect(text).toContain("128.0");
  });

  it("falls back to the field when a column renders something else", () => {
    const iconColumn: TrackColumnDef<LibraryTrackRow>[] = [
      { id: "title", header: "Title", render: () => ({}) as never },
    ];
    expect(tracksAsText(iconColumn, [TRACK]).split("\n")[1]).toBe("Strobe");
  });

  it("keeps tabs and newlines out of a tab-separated shape", () => {
    const messy = { ...TRACK, title: "Strobe\t(live)\nversion" };
    expect(tracksAsText(columns, [messy]).split("\n")).toHaveLength(2);
  });

  it("copies nothing for nothing", () => {
    expect(tracksAsText(columns, [])).toBe("");
  });

  it("says what was copied", () => {
    expect(copySummary(3, 3)).toBe("Copied 3 tracks");
    expect(copySummary(1, 1)).toBe("Copied 1 track");
  });

  it("says so when it could not copy everything", () => {
    expect(copySummary(5_000, 47_913)).toBe("Copied the first 5,000 of 47,913 tracks");
  });

  it("says when there was nothing to copy", () => {
    expect(copySummary(0, 0)).toBe("Nothing to copy");
  });

  it("reports a clipboard that refuses", async () => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error("Denied")) },
    });
    expect(await writeClipboard("x")).toBe(false);
  });

  it("reports a clipboard that accepts", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    expect(await writeClipboard("x")).toBe(true);
    expect(writeText).toHaveBeenCalledWith("x");
  });
});

describe("reading one track", () => {
  let getLibraryTrack: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    getLibraryTrack = vi.fn(async () => DETAIL);
    (window as unknown as { cuepoint?: unknown }).cuepoint = { getLibraryTrack };
  });

  afterEach(() => {
    delete (window as unknown as { cuepoint?: unknown }).cuepoint;
    vi.restoreAllMocks();
  });

  it("asks for the selected track", async () => {
    const { result } = renderHook(() => useTrackDetail(12));

    await waitFor(() => expect(result.current.detail).not.toBeNull());
    expect(getLibraryTrack).toHaveBeenCalledWith({ trackId: 12 });
  });

  it("asks for nothing when nothing is selected", () => {
    renderHook(() => useTrackDetail(null));
    expect(getLibraryTrack).not.toHaveBeenCalled();
  });

  it("forgets the track when the selection is cleared", async () => {
    const { result, rerender } = renderHook(({ id }) => useTrackDetail(id), {
      initialProps: { id: 12 as number | null },
    });
    await waitFor(() => expect(result.current.detail).not.toBeNull());

    rerender({ id: null });

    expect(result.current.detail).toBeNull();
  });

  it("asks again when a different track is selected", async () => {
    const { rerender } = renderHook(({ id }) => useTrackDetail(id), {
      initialProps: { id: 12 as number | null },
    });
    await waitFor(() => expect(getLibraryTrack).toHaveBeenCalledTimes(1));

    rerender({ id: 13 });

    await waitFor(() => expect(getLibraryTrack).toHaveBeenCalledTimes(2));
  });

  it("says when the track could not be read", async () => {
    getLibraryTrack.mockRejectedValueOnce(new Error("No track with id 99"));

    const { result } = renderHook(() => useTrackDetail(99));

    await waitFor(() => expect(result.current.error).toBe("No track with id 99"));
    expect(result.current.loading).toBe(false);
  });

  it("says when there is no bridge", async () => {
    delete (window as unknown as { cuepoint?: unknown }).cuepoint;

    const { result } = renderHook(() => useTrackDetail(12));

    await waitFor(() => expect(result.current.error).toMatch(/not available/i));
  });
});
