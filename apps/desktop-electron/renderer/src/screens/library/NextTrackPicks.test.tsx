import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  LibraryTrackDetail,
  LibraryTrackRow,
  PlayerSnapshot,
  SimilarReason,
  SimilarTrack,
} from "../../api/cuepointBridge.types";
import { EMPTY_AUDIO_STATE } from "../../components/player/playerFormat";
import { markPlayed, resetPlayedTracksForTests } from "../../components/player/playedTracks";
import { resetPlayerStore } from "../../components/player/playerStore";
import { NextTrackPicks } from "./NextTrackPicks";

function row(id: number, over: Partial<LibraryTrackRow> = {}): LibraryTrackRow {
  return {
    id,
    rekordbox_track_id: String(id),
    title: `Track ${id}`,
    artist: `Artist ${id}`,
    remixer: null,
    album: null,
    label: null,
    genre: null,
    key: "8A",
    effective_key: "8A",
    bpm: 128,
    year: null,
    duration_seconds: 300,
    rating: null,
    play_count: 0,
    colour: null,
    date_added: null,
    comment: null,
    bitrate: null,
    file_path: `/music/${id}.mp3`,
    effective_rating: null,
    rating_source: null,
    favorite: false,
    ...over,
  };
}

const keyStep: SimilarReason = { component: "key", detail: "adjacent", points: 1, from: "8A", to: "9A" };
const tempo: SimilarReason = { component: "tempo", detail: "close", points: 1, from: 128, to: 126 };
const genre: SimilarReason = { component: "genre", detail: "same", points: 1, name: "Techno" };

const suggestion = (id: number): SimilarTrack => ({ track_id: id, score: 90, reasons: [keyStep, tempo, genre] });

function snapshot(currentTrackId: number | null, length = 1, currentIndex = 0): PlayerSnapshot {
  return {
    status: { available: true, running: true, reconnecting: false, restartAttempts: 0 },
    playback: {
      filePath: "/music/a.flac",
      playing: true,
      paused: false,
      positionSeconds: 0,
      durationSeconds: 100,
      volume: 80,
      muted: false,
    },
    queue: {
      length,
      currentId: currentTrackId === null ? null : "q1",
      currentIndex: currentTrackId === null ? -1 : currentIndex,
      currentItem:
        currentTrackId === null
          ? null
          : {
              id: "q1",
              trackId: currentTrackId,
              filePath: "/music/a.flac",
              title: "A",
              artist: "B",
              key: null,
              bpm: null,
              durationSeconds: 100,
              status: "playing",
            },
      shuffle: false,
      repeat: "off",
    },
    audio: EMPTY_AUDIO_STATE,
  };
}

interface Setup {
  suggestions?: SimilarTrack[];
  /** Tracks after the playing one (or the whole queue when nothing plays). */
  queued?: number[];
  /** Tracks before the playing one, already behind it in the queue. */
  before?: number[];
  playing?: number | null;
  /** Gate for the first getSimilarTracks answer. */
  holdFirstAnswer?: Promise<void>;
  /** Fail reading these library rows. */
  failRows?: boolean;
  refusal?: boolean;
  fail?: boolean;
}

function install({
  suggestions = [],
  queued = [],
  before = [],
  playing = null,
  refusal,
  fail,
  holdFirstAnswer,
  failRows,
}: Setup = {}) {
  const playNext = vi.fn().mockResolvedValue(undefined);
  const skipNext = vi.fn().mockResolvedValue(undefined);
  const playQueue = vi.fn().mockResolvedValue({ ok: true });
  let asked = 0;
  const getSimilarTracks = vi.fn(async () => {
    asked += 1;
    if (asked === 1 && holdFirstAnswer) {
      await holdFirstAnswer;
      // The slow answer is for the first track and names other tracks.
      return {
        value: { seed_id: 1, notation: "camelot", unused: [], considered: 3, duplicates_excluded: 0, index_current: true, suggestions: [7, 8, 9].map(suggestion) },
        refusal: null,
      };
    }
    if (fail) throw new Error("down");
    if (refusal) return { value: null, refusal: { code: "x", message: "no" } };
    return {
      value: {
        seed_id: 1,
        notation: "camelot",
        unused: [],
        considered: 10,
        duplicates_excluded: 0,
        index_current: true,
        suggestions,
      },
      refusal: null,
    };
  });
  const getLibraryTrack = vi.fn(async ({ trackId }: { trackId: number }) => {
    if (failRows) throw new Error("down");
    return { track: row(trackId) } as LibraryTrackDetail;
  });
  const lay = (upcoming: number[]) => (playing === null ? upcoming : [...before, playing, ...upcoming]);
  const indexOfPlaying = before.length;
  const state = snapshot(playing, lay(queued).length, indexOfPlaying);
  let queue = lay(queued);
  let push: ((next: PlayerSnapshot) => void) | null = null;
  const queueWindow = vi.fn(async (offset: number, limit: number) => ({
    offset,
    total: queue.length,
    items: queue.slice(offset, offset + limit).map((trackId, i) => ({
      id: `q${offset + i}`,
      trackId,
      filePath: `/music/${trackId}.mp3`,
      title: "",
      artist: "",
      key: null,
      bpm: null,
      durationSeconds: null,
      status: "queued" as const,
    })),
  }));
  (window as unknown as { cuepoint?: unknown }).cuepoint = {
    getSimilarTracks,
    getLibraryTrack,
    player: {
      getState: () => Promise.resolve(state),
      subscribeState: (on: (next: PlayerSnapshot) => void) => {
        push = on;
        on(state);
        return () => {};
      },
      queueWindow,
      playNext,
      next: skipNext,
      playQueue,
    },
  };
  const setQueue = (ids: number[]) => {
    queue = lay(ids);
    push?.(snapshot(playing, queue.length, indexOfPlaying));
  };
  return { playNext, skipNext, playQueue, getSimilarTracks, getLibraryTrack, queueWindow, setQueue };
}

afterEach(() => {
  resetPlayedTracksForTests();
  resetPlayerStore();
  delete (window as { cuepoint?: unknown }).cuepoint;
});

beforeEach(() => {
  resetPlayerStore();
});

describe("Plays well next", () => {
  it("shows three rows with the key, BPM and reason marks, asking the engine for 12", async () => {
    const { getSimilarTracks } = install({ suggestions: [2, 3, 4, 5, 6].map(suggestion) });
    render(<NextTrackPicks track={row(1)} />);
    expect(await screen.findByText("Track 2")).toBeInTheDocument();
    expect(getSimilarTracks).toHaveBeenCalledWith({ track_id: 1, limit: 12 });
    expect(screen.getByRole("heading", { name: "Plays well next" })).toBeInTheDocument();
    expect(screen.getByText("from your library")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    const first = screen.getAllByRole("listitem")[0];
    expect(within(first).getByText("128")).toBeInTheDocument();
    expect(within(first).getByText("+1")).toBeInTheDocument();
    expect(within(first).getByText("−2")).toBeInTheDocument();
    expect(within(first).getByText("G")).toBeInTheDocument();
    expect(screen.queryByText("Track 5")).not.toBeInTheDocument();
  });

  it("skips the queued and the playing tracks", async () => {
    install({ suggestions: [2, 3, 4, 5, 6].map(suggestion), queued: [2, 3], playing: 4 });
    render(<NextTrackPicks track={row(1)} />);
    expect(await screen.findByText("Track 5")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("Track 2")).not.toBeInTheDocument());
    expect(screen.queryByText("Track 3")).not.toBeInTheDocument();
    expect(screen.queryByText("Track 4")).not.toBeInTheDocument();
    expect(screen.getByText("Track 6")).toBeInTheDocument();
  });

  it("excludes only the upcoming 50 of a queue larger than the pick list", async () => {
    // Behind the playing track: 2. Upcoming: 100..149. Past the 50: 3. A view queued by a double-click.
    const upcoming = Array.from({ length: 50 }, (_, i) => 100 + i);
    const { queueWindow } = install({
      suggestions: [2, 3, 100, 4, 5, 6].map(suggestion),
      before: [2],
      playing: 99,
      queued: [...upcoming, 3, 4],
    });
    render(<NextTrackPicks track={row(1)} />);
    expect(await screen.findByText("Track 2")).toBeInTheDocument();
    // 100 is upcoming and excluded; 2 (already played through) and 3, 4 (beyond 50) are offered.
    expect(screen.getByText("Track 3")).toBeInTheDocument();
    expect(screen.getByText("Track 4")).toBeInTheDocument();
    expect(screen.queryByText("Track 100")).not.toBeInTheDocument();
    expect(queueWindow).toHaveBeenCalledWith(2, 50);
    expect(queueWindow.mock.calls.every(([, limit]) => limit <= 50)).toBe(true);
  });

  it("skips tracks played this session", async () => {
    markPlayed(2);
    markPlayed(3);
    install({ suggestions: [2, 3, 4, 5, 6].map(suggestion) });
    render(<NextTrackPicks track={row(1)} />);
    expect(await screen.findByText("Track 4")).toBeInTheDocument();
    expect(screen.queryByText("Track 2")).not.toBeInTheDocument();
    expect(screen.queryByText("Track 3")).not.toBeInTheDocument();
    expect(screen.getByText("Track 6")).toBeInTheDocument();
  });

  it("Play next puts that track next in the queue", async () => {
    const { playNext } = install({ suggestions: [2, 3, 4].map(suggestion) });
    const onMessage = vi.fn();
    render(<NextTrackPicks track={row(1)} onMessage={onMessage} />);
    await screen.findByText("Track 3");
    fireEvent.click(screen.getAllByRole("button", { name: /Play next/ })[1]);
    await waitFor(() => expect(playNext).toHaveBeenCalledTimes(1));
    const items = playNext.mock.calls[0][0] as Array<{ trackId: number; filePath: string }>;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ trackId: 3, filePath: "/music/3.mp3" });
    await waitFor(() => expect(onMessage).toHaveBeenCalledWith("1 track queued to play next"));
  });

  it("double-clicking a row plays it now by inserting it next and skipping to it, keeping the queue", async () => {
    const { playQueue, playNext, skipNext } = install({ suggestions: [2, 3, 4].map(suggestion) });
    render(<NextTrackPicks track={row(1)} />);
    await screen.findByText("Track 2");
    fireEvent.doubleClick(screen.getAllByRole("listitem")[0]);
    await waitFor(() => expect(skipNext).toHaveBeenCalledTimes(1));
    expect(playNext).toHaveBeenCalledTimes(1);
    expect((playNext.mock.calls[0][0] as Array<{ trackId: number }>)[0].trackId).toBe(2);
    expect(playNext.mock.invocationCallOrder[0]).toBeLessThan(skipNext.mock.invocationCallOrder[0]);
    expect(playQueue).not.toHaveBeenCalled();
  });

  it("double-clicking the Play next button runs Play next once and does not play now", async () => {
    const { playQueue, playNext, skipNext } = install({ suggestions: [2, 3, 4].map(suggestion) });
    render(<NextTrackPicks track={row(1)} />);
    await screen.findByText("Track 2");
    fireEvent.doubleClick(screen.getAllByRole("button", { name: /Play next/ })[0]);
    fireEvent.click(screen.getAllByRole("button", { name: /Play next/ })[0]);
    await waitFor(() => expect(playNext).toHaveBeenCalledTimes(1));
    expect(skipNext).not.toHaveBeenCalled();
    expect(playQueue).not.toHaveBeenCalled();
  });

  it("double-clicking a reason mark or the cover does not play the row", async () => {
    const { playNext, skipNext } = install({ suggestions: [2, 3, 4].map(suggestion) });
    const { container } = render(<NextTrackPicks track={row(1)} />);
    await screen.findByText("Track 2");
    fireEvent.doubleClick(screen.getAllByText("G")[0]);
    fireEvent.doubleClick(container.querySelector(".cp-next-picks__cover")!);
    expect(playNext).not.toHaveBeenCalled();
    expect(skipNext).not.toHaveBeenCalled();
  });

  it("reads only three library rows when nothing is excluded", async () => {
    const { getLibraryTrack } = install({ suggestions: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map(suggestion) });
    render(<NextTrackPicks track={row(1)} />);
    await screen.findByText("Track 4");
    expect(getLibraryTrack).toHaveBeenCalledTimes(3);
  });

  it("reads rows only for suggestions that pass the filter, and a queue change reuses the cached ones", async () => {
    const { getLibraryTrack, setQueue } = install({
      suggestions: [2, 3, 4, 5, 6, 7].map(suggestion),
      queued: [2],
    });
    render(<NextTrackPicks track={row(1)} />);
    await screen.findByText("Track 5");
    expect(getLibraryTrack.mock.calls.map((c) => c[0].trackId).sort()).toEqual([3, 4, 5]);
    act(() => setQueue([]));
    expect(await screen.findByText("Track 2")).toBeInTheDocument();
    // 2 is read now; 3 and 4 came from the cache.
    expect(getLibraryTrack.mock.calls.map((c) => c[0].trackId).sort()).toEqual([2, 3, 4, 5]);
  });

  it("ignores a slow answer that arrives after the shown track changed", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    install({ suggestions: [2, 3, 4].map(suggestion), holdFirstAnswer: gate });
    const { rerender } = render(<NextTrackPicks track={row(1)} />);
    rerender(<NextTrackPicks track={row(9)} />);
    expect(await screen.findByText("Track 2")).toBeInTheDocument();
    await act(async () => {
      release();
      await gate;
    });
    // The first answer (tracks 7 to 9) is for track 1 and must not replace track 9's rows.
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByText("Track 2")).toBeInTheDocument();
    expect(screen.queryByText("Track 7")).not.toBeInTheDocument();
  });

  it("asks again for another track, not for a queue change", async () => {
    const { getSimilarTracks } = install({ suggestions: [2, 3, 4].map(suggestion) });
    const { rerender } = render(<NextTrackPicks track={row(1)} />);
    await screen.findByText("Track 2");
    rerender(<NextTrackPicks track={row(9)} />);
    await waitFor(() => expect(getSimilarTracks).toHaveBeenCalledTimes(2));
    expect(getSimilarTracks).toHaveBeenLastCalledWith({ track_id: 9, limit: 12 });
  });

  it("says so when the track has neither a key nor a BPM, and does not ask", () => {
    const { getSimilarTracks } = install({ suggestions: [2].map(suggestion) });
    render(<NextTrackPicks track={row(1, { effective_key: null, bpm: null })} />);
    expect(screen.getByText("Needs a key or BPM to suggest a next track.")).toBeInTheDocument();
    expect(getSimilarTracks).not.toHaveBeenCalled();
  });

  it("says so when no close matches remain", async () => {
    install({ suggestions: [2].map(suggestion), queued: [2] });
    render(<NextTrackPicks track={row(1)} />);
    expect(await screen.findByText("No close matches in your library.")).toBeInTheDocument();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });

  it("says it could not load when every row read fails, not that nothing matches", async () => {
    install({ suggestions: [2, 3, 4].map(suggestion), failRows: true });
    render(<NextTrackPicks track={row(1)} />);
    expect(await screen.findByText(/Could not load/)).toBeInTheDocument();
    expect(screen.queryByText("No close matches in your library.")).not.toBeInTheDocument();
  });

  it("names each reason mark for a screen reader", async () => {
    install({ suggestions: [2].map(suggestion) });
    render(<NextTrackPicks track={row(1)} />);
    await screen.findByText("Track 2");
    const marks = within(screen.getAllByRole("listitem")[0]).getAllByRole("img");
    expect(marks.length).toBeGreaterThanOrEqual(3);
    marks.forEach((mark) => expect(mark).toHaveAccessibleName());
  });

  it("says it could not load when the bridge fails or refuses", async () => {
    install({ fail: true });
    const { unmount } = render(<NextTrackPicks track={row(1)} />);
    expect(await screen.findByText(/Could not load/)).toBeInTheDocument();
    unmount();
    install({ refusal: true });
    render(<NextTrackPicks track={row(1)} />);
    expect(await screen.findByText(/Could not load/)).toBeInTheDocument();
  });

  it("draws nothing without the bridge call", () => {
    (window as unknown as { cuepoint?: unknown }).cuepoint = {};
    const { container } = render(<NextTrackPicks track={row(1)} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("re-filters when the queue changes without asking the engine again", async () => {
    const { getSimilarTracks, setQueue } = install({ suggestions: [2, 3, 4, 5].map(suggestion) });
    render(<NextTrackPicks track={row(1)} />);
    await screen.findByText("Track 2");
    act(() => setQueue([2]));
    await waitFor(() => expect(screen.queryByText("Track 2")).not.toBeInTheDocument());
    expect(screen.getByText("Track 5")).toBeInTheDocument();
    expect(getSimilarTracks).toHaveBeenCalledTimes(1);
  });
});
