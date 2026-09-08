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
 *
 * ORG-10 added a second zone above these fields and made *it* editable. The
 * tests below are unchanged except where that is the point: the imported zone
 * is still read-only, field for field, and the check that it is now names the
 * zone rather than the panel — because "the panel offers nothing to type into"
 * stopped being true the moment CuePoint had something of its own to say.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from "@testing-library/react";

import type {
  LibraryTrackDetail,
  LibraryTrackRow,
} from "../../api/cuepointBridge.types";
import type { TrackColumnDef } from "../../components/table";
import { SelectionActions } from "./SelectionActions";
import { TrackDetailPanel } from "./TrackDetailPanel";
import { copySummary, tracksAsText, writeClipboard } from "./trackClipboard";
import { useTrackDetail } from "./useTrackDetail";
import { HISTORY_LIMIT } from "./useTrackHistory";

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
  effective_rating: null,
  rating_source: null,
  favorite: false,
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
  metadata: {
    track_id: 900,
    rating: null,
    rekordbox_rating: null,
    effective_rating: null,
    rating_source: null,
    favorite: false,
    notes: null,
    created_at: null,
    updated_at: null,
  },
  tags: [],
  collections: [],
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

describe("the imported zone is still read-only (DEC-047, ORG-10)", () => {
  /** The imported fields, which is what DEC-047's promise was about. */
  function imported(): HTMLElement {
    return document.querySelector(".cp-track-detail__fields") as HTMLElement;
  }

  it("offers nothing to type into", () => {
    render(<TrackDetailPanel detail={DETAIL} />);
    expect(within(imported()).queryByRole("textbox")).not.toBeInTheDocument();
    expect(within(imported()).queryByRole("spinbutton")).not.toBeInTheDocument();
  });

  it("offers nothing to click at all", () => {
    render(<TrackDetailPanel detail={DETAIL} />);
    expect(within(imported()).queryAllByRole("button")).toHaveLength(0);
    expect(within(imported()).queryAllByRole("radio")).toHaveLength(0);
  });

  it("says whose these fields are, so the two zones are never one", () => {
    render(<TrackDetailPanel detail={DETAIL} />);
    expect(screen.getByText("From Rekordbox")).toBeInTheDocument();
    expect(screen.getByText("Yours")).toBeInTheDocument();
  });

  it("keeps showing Rekordbox's rating whatever yours says (DEC-057)", () => {
    // The one row that could quietly become a resolved value. It must not:
    // Phase 8 can only choose whose rating to export while both are visible.
    render(
      <TrackDetailPanel
        detail={{
          ...DETAIL,
          metadata: {
            ...DETAIL.metadata,
            rating: 1,
            rekordbox_rating: 4,
            effective_rating: 1,
            rating_source: "cuepoint",
          },
        }}
      />,
    );
    expect(within(rowFor("Rating")).getByText("★★★★")).toBeInTheDocument();
  });
});

describe("the editable zone (ORG-10)", () => {
  it("offers the four things CuePoint owns", () => {
    render(<TrackDetailPanel detail={DETAIL} />);
    expect(screen.getByRole("radiogroup", { name: "Your rating" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Favorite" })).toBeInTheDocument();
    expect(screen.getByLabelText("Your notes")).toBeInTheDocument();
    expect(screen.getByLabelText("Add a tag")).toBeInTheDocument();
  });

  it("shows the resolved rating, with its source beside it", () => {
    render(
      <TrackDetailPanel
        detail={{
          ...DETAIL,
          metadata: {
            ...DETAIL.metadata,
            rekordbox_rating: 4,
            effective_rating: 4,
            rating_source: "rekordbox",
          },
        }}
      />,
    );
    expect(screen.getByRole("radio", { name: "4 stars" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByText("Rekordbox's")).toBeInTheDocument();
  });

  it("shows Rekordbox's comment and your notes as two labelled things", () => {
    render(
      <TrackDetailPanel
        detail={{
          ...DETAIL,
          track: { ...TRACK, comment: "from the CDJ" },
          metadata: { ...DETAIL.metadata, notes: "intro is long" },
        }}
      />,
    );
    expect(within(rowFor("Comment")).getByText("from the CDJ")).toBeInTheDocument();
    expect(screen.getByLabelText("Your notes")).toHaveValue("intro is long");
  });

  it("starts over when the panel moves to another track", async () => {
    // Every scrap of local state — a half-typed tag name, which star has focus
    // — belongs to the track it was typed against. Keeping the editor across a
    // change of track would carry it onto the next one.
    const view = render(<TrackDetailPanel detail={DETAIL} />);
    fireEvent.change(screen.getByLabelText("Add a tag"), { target: { value: "Closer" } });
    expect(screen.getByLabelText("Add a tag")).toHaveValue("Closer");

    await act(async () => {
      view.rerender(
        <TrackDetailPanel
          detail={{ ...DETAIL, track: { ...TRACK, id: 13, title: "Ghosts" } }}
        />,
      );
    });

    expect(screen.getByLabelText("Add a tag")).toHaveValue("");
  });

  it("offers nothing to edit on a track with no id to address", () => {
    render(
      <TrackDetailPanel detail={{ ...DETAIL, track: { ...TRACK, id: null } }} />,
    );
    expect(screen.queryByRole("radiogroup", { name: "Your rating" })).not.toBeInTheDocument();
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

describe("the Collections holding it (ORG-09, ORG-10)", () => {
  const COLLECTIONS = [
    { id: 4, name: "Closers", kind: "collection" as const },
    { id: 5, name: "Over 128", kind: "smart" as const },
  ];

  it("lists them", () => {
    render(<TrackDetailPanel detail={{ ...DETAIL, collections: COLLECTIONS }} />);
    expect(screen.getByText("In 2 Collections")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Closers/ })).toBeInTheDocument();
  });

  it("counts one as one", () => {
    render(
      <TrackDetailPanel detail={{ ...DETAIL, collections: [COLLECTIONS[0]!] }} />,
    );
    expect(screen.getByText("In 1 Collection")).toBeInTheDocument();
  });

  it("says when it is in none", () => {
    render(<TrackDetailPanel detail={DETAIL} />);
    expect(screen.getByText("In no Collections")).toBeInTheDocument();
  });

  it("scopes the table to one that is clicked", () => {
    const onSelectCollection = vi.fn();
    render(
      <TrackDetailPanel
        detail={{ ...DETAIL, collections: COLLECTIONS }}
        onSelectCollection={onSelectCollection}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Over 128/ }));

    expect(onSelectCollection).toHaveBeenCalledWith(
      expect.objectContaining({ id: 5, kind: "smart" }),
    );
  });

  it("keeps them apart from the Rekordbox playlists", () => {
    // Two lists, two headings. One list would say Rekordbox gave the user
    // something they made themselves.
    render(<TrackDetailPanel detail={{ ...DETAIL, collections: COLLECTIONS }} />);
    expect(screen.getByText("In 2 Collections")).toBeInTheDocument();
    expect(screen.getByText("In 1 playlist")).toBeInTheDocument();
  });
});

describe("the history (DEC-008)", () => {
  let getTrackHistory: ReturnType<typeof vi.fn>;

  const IMPORTED = {
    id: 2,
    track_id: 12,
    field: "bpm",
    old_value: 127,
    new_value: 128,
    source: "rekordbox",
    changed_at: "2026-09-01T10:00:00Z",
    batch_id: null,
  };
  const MINE = {
    id: 3,
    track_id: 12,
    field: "cuepoint_rating",
    old_value: null,
    new_value: 5,
    source: "cuepoint",
    changed_at: "2026-09-08T10:00:00Z",
    batch_id: null,
  };

  let setTrackMetadata: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    getTrackHistory = vi.fn(async () => ({
      track_id: 12,
      changes: [MINE, IMPORTED],
      limit: 50,
    }));
    setTrackMetadata = vi.fn(async () => ({ metadata: DETAIL.metadata }));
    (window as unknown as { cuepoint?: unknown }).cuepoint = {
      getTrackHistory,
      setTrackMetadata,
    };
  });

  afterEach(() => {
    delete (window as unknown as { cuepoint?: unknown }).cuepoint;
  });

  /** The history list, once the read has come back. */
  async function entries(container: HTMLElement): Promise<HTMLElement> {
    // Scoped rather than searched for by text: "BPM" is also an imported
    // field's label and "Your rating" is also the editable zone's, which is
    // the point — an entry and a field are two different things named alike.
    return await waitFor(() => {
      const list = container.querySelector(".cp-track-history__list") as HTMLElement;
      expect(list.children.length).toBeGreaterThan(0);
      return list;
    });
  }

  it("lists what has happened to the track", async () => {
    const { container } = render(<TrackDetailPanel detail={DETAIL} />);

    const list = await entries(container);

    expect(within(list).getByText("Your rating")).toBeInTheDocument();
    expect(within(list).getByText("BPM")).toBeInTheDocument();
    expect(list.textContent).toContain("— → ★★★★★");
  });

  it("tells a change of yours from one an import made", async () => {
    // The question the history exists to answer in a two-layer library.
    const { container } = render(<TrackDetailPanel detail={DETAIL} />);

    const rows = [...(await entries(container)).children];
    expect(rows[0]!.className).toContain("--mine");
    expect(rows[0]!.textContent).toContain("You");
    expect(rows[1]!.className).not.toContain("--mine");
    expect(rows[1]!.textContent).toContain("Rekordbox");
  });

  it("says when nothing has happened yet", async () => {
    getTrackHistory.mockResolvedValueOnce({ track_id: 12, changes: [], limit: 50 });
    render(<TrackDetailPanel detail={DETAIL} />);

    expect(
      await screen.findByText("Nothing has changed about this track yet."),
    ).toBeInTheDocument();
  });

  it("says when it could not be read", async () => {
    getTrackHistory.mockRejectedValueOnce(new Error("Engine offline"));
    render(<TrackDetailPanel detail={DETAIL} />);

    expect(await screen.findByText("Engine offline")).toBeInTheDocument();
  });

  it("asks for a page rather than a life story", async () => {
    render(<TrackDetailPanel detail={DETAIL} />);

    await waitFor(() => expect(getTrackHistory).toHaveBeenCalled());
    expect(getTrackHistory).toHaveBeenCalledWith({ trackId: 12, limit: HISTORY_LIMIT });
  });

  it("re-reads after an edit rather than guessing what was recorded", async () => {
    // The engine decides what counts as a change: re-saving the same note
    // records nothing at all, so an entry appended here would be one that does
    // not exist.
    render(<TrackDetailPanel detail={DETAIL} />);
    await waitFor(() => expect(getTrackHistory).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("radio", { name: "4 stars" }));

    await waitFor(() => expect(getTrackHistory).toHaveBeenCalledTimes(2));
  });

  it("offers no revert, because CuePoint's fields have none yet", async () => {
    const { container } = render(<TrackDetailPanel detail={DETAIL} />);

    await entries(container);
    expect(screen.queryByRole("button", { name: /revert/i })).not.toBeInTheDocument();
  });

  it("shows nothing at all when the build has no history route", () => {
    delete (window as unknown as { cuepoint?: unknown }).cuepoint;
    render(<TrackDetailPanel detail={DETAIL} />);
    expect(screen.queryByText("History")).not.toBeInTheDocument();
  });
});

describe("with several tracks selected", () => {
  it("shows the last one clicked, and how many there are", () => {
    render(<TrackDetailPanel detail={DETAIL} selectionCount={7} />);
    expect(screen.getByRole("heading", { name: "Strobe" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("7 tracks selected");
  });

  it("says the edits apply to the one shown, rather than letting it be found out", () => {
    // DEC-045: editing all of them is ORG-11's toolbar. A rating control that
    // looks like it covers a selection of twelve thousand and covers one is
    // the worst version of this panel.
    render(<TrackDetailPanel detail={DETAIL} selectionCount={7} />);
    expect(screen.getByRole("status")).toHaveTextContent("edits here change this one");
  });

  it("offers one editor, for the one track it is showing", () => {
    // Editing twelve thousand tracks at once is ORG-11's toolbar. Nothing here
    // may look like it does that, because a control that quietly applies to one
    // when a user believed it applied to all is unrecoverable (DEC-008).
    render(<TrackDetailPanel detail={DETAIL} selectionCount={7} />);
    expect(screen.getAllByRole("radiogroup")).toHaveLength(1);
    expect(
      screen.queryByRole("button", { name: /all selected|apply to/i }),
    ).not.toBeInTheDocument();
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

  it("opens the organization menu, anchored under the button (ORG-11)", () => {
    // The toolbar does not carry its own set of buttons: it opens the same
    // menu the rows do, built from the same array, so "one vocabulary for both
    // surfaces" is a fact rather than two lists kept in step by hand.
    const onActions = vi.fn();
    actions({ onActions });

    fireEvent.click(screen.getByRole("button", { name: "Actions…" }));

    expect(onActions).toHaveBeenCalledWith(
      expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }),
    );
  });

  it("says the button opens a menu", () => {
    actions({ onActions: vi.fn() });
    expect(screen.getByRole("button", { name: "Actions…" })).toHaveAttribute(
      "aria-haspopup",
      "menu",
    );
  });

  it("offers no actions when the build has none", () => {
    // A browser-lab render with no engine behind it: a button whose only
    // outcome is an error message is worse than no button.
    actions();
    expect(screen.queryByRole("button", { name: "Actions…" })).not.toBeInTheDocument();
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
