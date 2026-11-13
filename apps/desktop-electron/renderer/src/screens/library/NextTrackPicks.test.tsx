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
import { resetPlayedTracksForTests } from "../../components/player/playedTracks";
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

function snapshot(currentTrackId: number | null, length = 1): PlayerSnapshot {
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
      currentIndex: 0,
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
  queued?: number[];
  playing?: number | null;
  refusal?: boolean;
  fail?: boolean;
}

function install({ suggestions = [], queued = [], playing = null, refusal, fail }: Setup = {}) {
  const playNext = vi.fn().mockResolvedValue(undefined);
  const playQueue = vi.fn().mockResolvedValue({ ok: true });
  const getSimilarTracks = vi.fn(async () => {
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
  const getLibraryTrack = vi.fn(async ({ trackId }: { trackId: number }) => ({ track: row(trackId) }) as LibraryTrackDetail);
  const state = snapshot(playing, queued.length);
  let queue = queued;
  let push: ((next: PlayerSnapshot) => void) | null = null;
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
      queueWindow: vi.fn(async () => ({
        offset: 0,
        total: queue.length,
        items: queue.map((trackId, i) => ({
          id: `q${i}`,
          trackId,
          filePath: `/music/${trackId}.mp3`,
          title: "",
          artist: "",
          key: null,
          bpm: null,
          durationSeconds: null,
          status: "queued",
        })),
      })),
      playNext,
      playQueue,
    },
  };
  const setQueue = (ids: number[]) => {
    queue = ids;
    push?.(snapshot(playing, ids.length));
  };
  return { playNext, playQueue, getSimilarTracks, getLibraryTrack, setQueue };
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

  it("double-clicking a row plays it now", async () => {
    const { playQueue, playNext } = install({ suggestions: [2, 3, 4].map(suggestion) });
    render(<NextTrackPicks track={row(1)} />);
    await screen.findByText("Track 2");
    fireEvent.doubleClick(screen.getAllByRole("listitem")[0]);
    await waitFor(() => expect(playQueue).toHaveBeenCalledTimes(1));
    expect((playQueue.mock.calls[0][0] as Array<{ trackId: number }>)[0].trackId).toBe(2);
    expect(playNext).not.toHaveBeenCalled();
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
