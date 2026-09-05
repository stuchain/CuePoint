import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { PlayerSnapshot } from "../../api/cuepointBridge.types";
import { LibraryScreen } from "../../screens/library";
import { ScaleProvider } from "../../tokens/ScaleContext";
import { ToastProvider } from "../Toast";
import { PlayerBar } from "./PlayerBar";
import { resetPlayerStore } from "./playerStore";

/**
 * Shuffle reorders the queue, not the view (PLAYER-07, DEC-052).
 *
 * This is the acceptance criterion the step names explicitly, and it needs the
 * real table rather than a stand-in: the claim is that toggling shuffle does
 * not reorder, refetch or scroll what the user is looking at.
 *
 * The failure it guards against is a plausible one. Shuffle *is* an ordering,
 * and an implementation that reached for the table's ordering — or simply
 * re-ran the query "to be safe" — would scramble the rows under the pointer,
 * lose the scroll position, and turn a queue setting into a table setting.
 * DEC-052 says the queue reorders and the view does not.
 */

const TRACKS = Array.from({ length: 6 }, (_, index) => ({
  id: index + 1,
  rekordbox_track_id: String(index + 1),
  title: `Track ${index + 1}`,
  artist: `Artist ${index + 1}`,
  remixer: null,
  album: null,
  label: null,
  genre: "House",
  key: "8A",
  bpm: 120 + index,
  year: 2024,
  duration_seconds: 300,
  rating: null,
  play_count: null,
  colour: null,
  date_added: null,
  comment: null,
  bitrate: null,
  file_path: `/music/${index + 1}.flac`,
}));

function playerSnapshot(shuffle: boolean): PlayerSnapshot {
  return {
    status: { available: true, running: true, reconnecting: false, restartAttempts: 0 },
    playback: {
      filePath: "/music/1.flac",
      playing: true,
      paused: false,
      positionSeconds: 5,
      durationSeconds: 300,
      volume: 100,
      muted: false,
    },
    queue: {
      items: [
        {
          id: "q1",
          trackId: 1,
          filePath: "/music/1.flac",
          title: "Now Playing",
          artist: "Someone Else",
          key: "8A",
          bpm: 120,
          durationSeconds: 300,
          status: "playing",
        },
      ],
      playOrder: ["q1"],
      currentId: "q1",
      currentIndex: 0,
      shuffle,
      repeat: "off",
    },
  };
}

let browseLibrary: ReturnType<typeof vi.fn>;
let setShuffle: ReturnType<typeof vi.fn>;
let pushPlayer: (state: PlayerSnapshot) => void;

function install() {
  let push: ((state: PlayerSnapshot) => void) | null = null;
  browseLibrary = vi.fn(async () => ({
    query: "",
    total: TRACKS.length,
    limit: 100,
    offset: 0,
    tracks: TRACKS,
    library_empty: false,
    mode: "browse" as const,
    scope: null,
    sort: "artist",
    dir: "asc" as const,
    filters: { match: "all" as const, rules: [] },
  }));
  setShuffle = vi.fn().mockResolvedValue(undefined);

  window.cuepoint = {
    getLibrarySummary: vi.fn().mockResolvedValue({
      track_count: TRACKS.length,
      playlist_count: 0,
      playlist_entry_count: 0,
      library_empty: false,
      // A non-null source is what tells the page a library has been imported.
      // With none it renders the import prompt and there is no table to leave
      // alone, which is a test that would pass while proving nothing.
      source: {
        xml_path: "C:/music/collection.xml",
        imported_at: "2026-09-03T10:00:00Z",
        xml_modified_at: "2026-09-03T09:00:00Z",
        xml_size_bytes: 2048,
        track_count: TRACKS.length,
        playlist_count: 0,
        exists: true,
        changed: false,
      },
    }),
    browseLibrary,
    getLibraryPlaylists: vi.fn().mockResolvedValue({ playlists: [], total: 0 }),
    getLibraryFilterFields: vi.fn().mockResolvedValue({ fields: [] }),
    getLibraryFacet: vi.fn().mockResolvedValue({
      field: "genre",
      values: [],
      truncated: false,
      total_values: 0,
      range: null,
    }),
    getLibraryTrack: vi.fn().mockResolvedValue(null),
    getJob: vi.fn().mockResolvedValue({ id: "job", state: "succeeded" }),
    showItemInFolder: vi.fn(),
    player: {
      getState: vi.fn().mockResolvedValue(playerSnapshot(false)),
      subscribeState: vi.fn((onState: (state: PlayerSnapshot) => void) => {
        push = onState;
        onState(playerSnapshot(false));
        return vi.fn();
      }),
      setShuffle,
      setRepeat: vi.fn().mockResolvedValue(undefined),
      toggle: vi.fn(),
      next: vi.fn(),
      previous: vi.fn(),
      seek: vi.fn(),
      setVolume: vi.fn(),
      setMuted: vi.fn(),
    },
  } as unknown as typeof window.cuepoint;

  pushPlayer = (state) => push?.(state);
}

function renderBoth() {
  return render(
    <ScaleProvider>
      <ToastProvider>
        <LibraryScreen />
        <PlayerBar />
      </ToastProvider>
    </ScaleProvider>,
  );
}

/**
 * The rows the table is showing, top to bottom, as their full text.
 *
 * Whole rows rather than one column: the claim is that the *view* did not
 * change, and comparing a single cell would miss a reorder that happened to
 * preserve it.
 */
function visibleRows(): string[] {
  const table = screen.getByRole("table", { name: "Library tracks" });
  return within(table)
    .getAllByRole("row")
    .slice(1)
    .map((row) => row.textContent?.trim() ?? "")
    .filter(Boolean);
}

beforeAll(() => {
  // jsdom lays nothing out and has no ResizeObserver, so a virtualized table
  // rendered here shows no rows at all — and a test comparing "the rows before"
  // with "the rows after" would then compare two empty lists and pass while
  // proving nothing. The same fake `LibraryScreen.test.tsx` uses, for the same
  // reason.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;

  Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
    configurable: true,
    get: () => 1200,
  });
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    get: () => 600,
  });
});

afterAll(() => {
  Reflect.deleteProperty(HTMLElement.prototype, "offsetWidth");
  Reflect.deleteProperty(HTMLElement.prototype, "offsetHeight");
});

beforeEach(() => {
  resetPlayerStore();
  install();
});

afterEach(() => {
  resetPlayerStore();
  localStorage.clear();
  vi.restoreAllMocks();
  delete (window as { cuepoint?: unknown }).cuepoint;
});

describe("toggling shuffle leaves the table alone", () => {
  it("does not reorder the rows", async () => {
    renderBoth();
    await screen.findByRole("table", { name: "Library tracks" });
    await screen.findByText("Track 1");
    const before = visibleRows();
    // Guard the guard: an empty table would make the comparison below pass
    // while proving nothing at all. (It did, until jsdom was given a layout.)
    expect(before).toHaveLength(TRACKS.length);
    expect(before[0]).toContain("Track 1");
    expect(before.at(-1)).toContain("Track 6");

    fireEvent.click(screen.getByRole("button", { name: "Shuffle off" }));
    await waitFor(() => expect(setShuffle).toHaveBeenCalledWith(true));
    // Even once main reports the queue as shuffled, the view is unchanged.
    pushPlayer(playerSnapshot(true));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Shuffle on" })).toBeInTheDocument(),
    );
    expect(visibleRows()).toEqual(before);
  });

  it("does not re-run the table's query", async () => {
    // Shuffle is a queue setting. Refetching would cost a round trip per press
    // and, at 50,000 rows, is exactly the thing DEC-040 windowing exists to
    // avoid.
    renderBoth();
    await screen.findByText("Track 1");
    await waitFor(() => expect(browseLibrary).toHaveBeenCalled());
    const before = browseLibrary.mock.calls.length;

    fireEvent.click(screen.getByRole("button", { name: "Shuffle off" }));
    await waitFor(() => expect(setShuffle).toHaveBeenCalled());
    pushPlayer(playerSnapshot(true));

    expect(browseLibrary.mock.calls.length).toBe(before);
  });

  it("does not scroll the table", async () => {
    renderBoth();
    await screen.findByText("Track 1");
    const scroller = document.querySelector(".track-table__scroll") as HTMLElement | null;
    if (scroller) scroller.scrollTop = 120;
    const before = scroller?.scrollTop ?? 0;

    fireEvent.click(screen.getByRole("button", { name: "Shuffle off" }));
    await waitFor(() => expect(setShuffle).toHaveBeenCalled());
    pushPlayer(playerSnapshot(true));

    expect(scroller?.scrollTop ?? 0).toBe(before);
  });

  it("leaves the sort the table is showing untouched", async () => {
    renderBoth();
    await screen.findByText("Track 1");
    const lastQuery = browseLibrary.mock.calls.at(-1)?.[0] as Record<string, unknown>;

    fireEvent.click(screen.getByRole("button", { name: "Shuffle off" }));
    await waitFor(() => expect(setShuffle).toHaveBeenCalled());
    pushPlayer(playerSnapshot(true));

    expect(browseLibrary.mock.calls.at(-1)?.[0]).toEqual(lastQuery);
  });
});
