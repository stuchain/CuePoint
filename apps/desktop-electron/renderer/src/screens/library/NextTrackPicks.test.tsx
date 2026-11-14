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
import { reportUnexpected } from "../../reporting/reporting";
import { NextTrackPicks } from "./NextTrackPicks";

vi.mock("../../reporting/reporting", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../reporting/reporting")>()),
  reportUnexpected: vi.fn(() => null),
}));

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

function snapshot(currentTrackId: number | null, length = 1, currentIndex = 0, repeat: "off" | "all" = "off"): PlayerSnapshot {
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
      repeat,
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
  repeat?: "off" | "all";
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
  repeat = "off",
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
  const state = snapshot(playing, lay(queued).length, indexOfPlaying, repeat);
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
    push?.(snapshot(playing, queue.length, indexOfPlaying, repeat));
  };
  /** Reorder with no change to the length, the playing track or its place, and no push: what a drag in the queue panel does. */
  const reorder = (ids: number[]) => {
    queue = lay(ids);
  };
  return { playNext, skipNext, playQueue, getSimilarTracks, getLibraryTrack, queueWindow, setQueue, reorder };
}

afterEach(() => {
  vi.mocked(reportUnexpected).mockClear();
  resetPlayedTracksForTests();
  resetPlayerStore();
  delete (window as { cuepoint?: unknown }).cuepoint;
});

beforeEach(() => {
  resetPlayerStore();
});

describe("Plays well next", () => {
  it("shows three rows with the key, BPM and reason marks, asking the engine for 50", async () => {
    const { getSimilarTracks } = install({ suggestions: [2, 3, 4, 5, 6].map(suggestion) });
    render(<NextTrackPicks track={row(1)} />);
    expect(await screen.findByText("Track 2")).toBeInTheDocument();
    expect(getSimilarTracks).toHaveBeenCalledWith({ track_id: 1, limit: 50 });
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

  it("excludes only the upcoming 10 of a queue larger than the pick list", async () => {
    // Behind the playing track: 2. Upcoming: 100..109. Past the 10: 3. A view queued by a double-click.
    const upcoming = Array.from({ length: 10 }, (_, i) => 100 + i);
    const { queueWindow } = install({
      suggestions: [2, 3, 100, 4, 5, 6].map(suggestion),
      before: [2],
      playing: 99,
      queued: [...upcoming, 3, 4],
    });
    render(<NextTrackPicks track={row(1)} />);
    expect(await screen.findByText("Track 2")).toBeInTheDocument();
    // 100 is upcoming and excluded; 2 (already played through) and 3, 4 (beyond 10) are offered.
    expect(screen.getByText("Track 3")).toBeInTheDocument();
    expect(screen.getByText("Track 4")).toBeInTheDocument();
    expect(screen.queryByText("Track 100")).not.toBeInTheDocument();
    expect(queueWindow).toHaveBeenCalledWith(2, 10);
    expect(queueWindow.mock.calls.every(([, limit]) => limit <= 10)).toBe(true);
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

  it("a real double-click on Play next (click, click, dblclick) queues once and plays nothing now", async () => {
    const { playQueue, playNext, skipNext } = install({ suggestions: [2, 3, 4].map(suggestion) });
    render(<NextTrackPicks track={row(1)} />);
    await screen.findByText("Track 2");
    const button = screen.getAllByRole("button", { name: /Play next/ })[0];
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.doubleClick(button);
    await waitFor(() => expect(playNext).toHaveBeenCalledTimes(1));
    await act(async () => {});
    expect(playNext).toHaveBeenCalledTimes(1);
    expect(skipNext).not.toHaveBeenCalled();
    expect(playQueue).not.toHaveBeenCalled();
  });

  it("ignores a second click while the first request is pending", async () => {
    const { playNext } = install({ suggestions: [2, 3, 4].map(suggestion) });
    let release: () => void = () => {};
    playNext.mockImplementation(() => new Promise<void>((resolve) => { release = resolve; }));
    render(<NextTrackPicks track={row(1)} />);
    await screen.findByText("Track 2");
    const button = screen.getAllByRole("button", { name: /Play next/ })[0];
    fireEvent.click(button);
    expect(button).toBeDisabled();
    fireEvent.click(button);
    await act(async () => release());
    expect(playNext).toHaveBeenCalledTimes(1);
  });

  it("keeps a queued pick in its place as Queued, so the next row does not move under the pointer", async () => {
    const { setQueue, playNext } = install({ suggestions: [2, 3, 4, 5].map(suggestion) });
    render(<NextTrackPicks track={row(1)} />);
    await screen.findByText("Track 2");
    fireEvent.click(screen.getAllByRole("button", { name: /Play next/ })[0]);
    await waitFor(() => expect(playNext).toHaveBeenCalledTimes(1));
    act(() => setQueue([2]));
    await act(async () => {});
    await act(async () => {});
    const items = screen.getAllByRole("listitem");
    expect(items.map((item) => within(item).getByText(/^Track \d$/).textContent)).toEqual(["Track 2", "Track 3", "Track 4"]);
    expect(within(items[0]).getByRole("button", { name: /Queued/ })).toBeDisabled();
    expect(within(items[1]).getByRole("button", { name: /Play next/ })).toBeEnabled();
  });

  it("a real double-click on a row (click, click, dblclick) plays it now once", async () => {
    const { playNext, skipNext } = install({ suggestions: [2, 3, 4].map(suggestion) });
    render(<NextTrackPicks track={row(1)} />);
    await screen.findByText("Track 2");
    const title = screen.getByText("Track 2");
    fireEvent.click(title);
    fireEvent.click(title);
    fireEvent.doubleClick(title);
    fireEvent.doubleClick(title);
    await waitFor(() => expect(skipNext).toHaveBeenCalledTimes(1));
    await act(async () => {});
    expect(playNext).toHaveBeenCalledTimes(1);
    expect(skipNext).toHaveBeenCalledTimes(1);
  });

  it("keeps keyboard focus in the section after Play next", async () => {
    const { playNext } = install({ suggestions: [2, 3, 4].map(suggestion) });
    render(<NextTrackPicks track={row(1)} />);
    await screen.findByText("Track 2");
    const buttons = screen.getAllByRole("button", { name: /Play next/ });
    buttons[0].focus();
    fireEvent.click(buttons[0]);
    await waitFor(() => expect(playNext).toHaveBeenCalledTimes(1));
    await act(async () => {});
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Play next: Track 3" }));
  });

  it("moves focus to the heading when no pick is left to press", async () => {
    install({ suggestions: [2].map(suggestion) });
    render(<NextTrackPicks track={row(1)} />);
    await screen.findByText("Track 2");
    const button = screen.getByRole("button", { name: /Play next/ });
    button.focus();
    fireEvent.click(button);
    await act(async () => {});
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Plays well next" }));
  });

  it("plays a focused row now with Enter", async () => {
    const { playNext, skipNext } = install({ suggestions: [2, 3, 4].map(suggestion) });
    render(<NextTrackPicks track={row(1)} />);
    await screen.findByText("Track 2");
    const item = screen.getAllByRole("listitem")[1];
    expect(item).toHaveAttribute("tabindex", "0");
    fireEvent.keyDown(item, { key: "Enter" });
    await waitFor(() => expect(skipNext).toHaveBeenCalledTimes(1));
    expect((playNext.mock.calls[0][0] as Array<{ trackId: number }>)[0].trackId).toBe(3);
  });

  it("does not play the row when Enter is pressed on its Play next button", async () => {
    const { skipNext, playNext } = install({ suggestions: [2, 3, 4].map(suggestion) });
    render(<NextTrackPicks track={row(1)} />);
    await screen.findByText("Track 2");
    fireEvent.keyDown(screen.getAllByRole("button", { name: /Play next/ })[0], { key: "Enter" });
    await act(async () => {});
    expect(skipNext).not.toHaveBeenCalled();
    expect(playNext).not.toHaveBeenCalled();
  });

  it("holds the height of three rows while loading, with the same row layout", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const { getSimilarTracks } = install({ suggestions: [2, 3, 4].map(suggestion) });
    getSimilarTracks.mockImplementationOnce(async () => {
      await gate;
      return { value: { seed_id: 1, notation: "camelot", unused: [], considered: 3, duplicates_excluded: 0, index_current: true, suggestions: [2, 3, 4].map(suggestion) }, refusal: null };
    });
    const { container } = render(<NextTrackPicks track={row(1)} />);
    expect(container.querySelectorAll(".cp-next-picks__row--ghost")).toHaveLength(3);
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    await act(async () => release());
    expect(await screen.findByText("Track 2")).toBeInTheDocument();
    expect(container.querySelectorAll(".cp-next-picks__row--ghost")).toHaveLength(0);
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
    await waitFor(() => expect(window.cuepoint!.getSimilarTracks).toHaveBeenCalledTimes(1));
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
    expect(getSimilarTracks).toHaveBeenLastCalledWith({ track_id: 9, limit: 50 });
  });

  it("says so when the track has neither a key nor a BPM, and does not ask", () => {
    const { getSimilarTracks } = install({ suggestions: [2].map(suggestion) });
    render(<NextTrackPicks track={row(1, { effective_key: null, bpm: null })} />);
    expect(screen.getByText("Needs a key or BPM to suggest a next track.")).toBeInTheDocument();
    expect(getSimilarTracks).not.toHaveBeenCalled();
  });

  it("says every match is queued or played when the only one is queued", async () => {
    install({ suggestions: [2].map(suggestion), queued: [2] });
    render(<NextTrackPicks track={row(1)} />);
    expect(await screen.findByText("Every close match is already queued or played.")).toBeInTheDocument();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });

  it("says every match is queued or played, not that nothing matches, when all candidates were excluded", async () => {
    markPlayed(2);
    install({ suggestions: [2, 3].map(suggestion), queued: [3] });
    render(<NextTrackPicks track={row(1)} />);
    expect(await screen.findByText("Every close match is already queued or played.")).toBeInTheDocument();
    expect(screen.queryByText("No close matches in your library.")).not.toBeInTheDocument();
  });

  it("says no close matches when the engine had none", async () => {
    install({ suggestions: [] });
    render(<NextTrackPicks track={row(1)} />);
    expect(await screen.findByText("No close matches in your library.")).toBeInTheDocument();
  });

  it("uses the effective BPM for the gate and for the BPM shown", async () => {
    const { getLibraryTrack } = install({ suggestions: [2].map(suggestion) });
    getLibraryTrack.mockImplementation(async ({ trackId }: { trackId: number }) => ({
      track: row(trackId, { bpm: 128, effective_bpm: 130 }),
    }) as LibraryTrackDetail);
    render(<NextTrackPicks track={row(1, { effective_key: null, bpm: null, effective_bpm: 126 })} />);
    expect(await screen.findByText("Track 2")).toBeInTheDocument();
    expect(within(screen.getAllByRole("listitem")[0]).getByText("130")).toBeInTheDocument();
    expect(screen.queryByText("Needs a key or BPM to suggest a next track.")).not.toBeInTheDocument();
  });

  it("joins the sentences of one mark with a middle dot", async () => {
    install({ suggestions: [{ track_id: 2, score: 9, reasons: [keyStep, { ...keyStep, detail: "same" } as SimilarReason] }] });
    render(<NextTrackPicks track={row(1)} />);
    await screen.findByText("Track 2");
    const mark = within(screen.getAllByRole("listitem")[0]).getAllByRole("img")[0];
    expect(mark.getAttribute("aria-label")).toContain(" · ");
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

  it("re-reads the upcoming tracks when the pointer or focus comes to the section after a reorder", async () => {
    const { reorder } = install({ suggestions: [2, 3, 4, 5].map(suggestion), queued: [6, 7] });
    const { container } = render(<NextTrackPicks track={row(1)} />);
    expect(await screen.findByText("Track 2")).toBeInTheDocument();
    // A drag in the queue panel keeps the length and the playing track: the player pushes nothing new.
    reorder([2, 7]);
    fireEvent.pointerEnter(container.querySelector("section")!);
    await waitFor(() => expect(screen.queryByText("Track 2")).not.toBeInTheDocument());
    expect(screen.getByText("Track 3")).toBeInTheDocument();
  });

  it("counts the tracks a repeat-all queue wraps to as upcoming", async () => {
    // Playing the last track (9) of [2, 3, 9] with repeat all: 2 and 3 come next.
    install({ suggestions: [2, 3, 4, 5, 6].map(suggestion), before: [2, 3], playing: 9, repeat: "all" });
    render(<NextTrackPicks track={row(1)} />);
    expect(await screen.findByText("Track 4")).toBeInTheDocument();
    expect(screen.queryByText("Track 2")).not.toBeInTheDocument();
    expect(screen.queryByText("Track 3")).not.toBeInTheDocument();
  });

  it("does not count tracks behind the playing one as upcoming without repeat-all", async () => {
    install({ suggestions: [2, 3, 4].map(suggestion), before: [2, 3], playing: 9 });
    render(<NextTrackPicks track={row(1)} />);
    expect(await screen.findByText("Track 2")).toBeInTheDocument();
    expect(screen.getByText("Track 3")).toBeInTheDocument();
  });

  it("waits for the shown track to settle before asking, so a quick pass over tracks asks once", async () => {
    const { getSimilarTracks } = install({ suggestions: [2, 3, 4].map(suggestion) });
    const { rerender } = render(<NextTrackPicks track={row(1)} />);
    rerender(<NextTrackPicks track={row(8)} />);
    rerender(<NextTrackPicks track={row(9)} />);
    expect(await screen.findByText("Track 2")).toBeInTheDocument();
    expect(getSimilarTracks).toHaveBeenCalledTimes(1);
    expect(getSimilarTracks).toHaveBeenCalledWith({ track_id: 9, limit: 50 });
  });

  it("does not ask while its tab is hidden, and asks once when it is shown", async () => {
    const { getSimilarTracks } = install({ suggestions: [2, 3, 4].map(suggestion) });
    const { rerender } = render(<NextTrackPicks track={row(1)} active={false} />);
    await new Promise((resolve) => setTimeout(resolve, 350));
    expect(getSimilarTracks).not.toHaveBeenCalled();
    rerender(<NextTrackPicks track={row(1)} active />);
    expect(await screen.findByText("Track 2")).toBeInTheDocument();
    expect(getSimilarTracks).toHaveBeenCalledTimes(1);
  });

  it("does not ask again for the same seed when the tab is shown again", async () => {
    const { getSimilarTracks } = install({ suggestions: [2, 3, 4].map(suggestion) });
    const { rerender } = render(<NextTrackPicks track={row(1)} />);
    await screen.findByText("Track 2");
    rerender(<NextTrackPicks track={row(1)} active={false} />);
    rerender(<NextTrackPicks track={row(1)} active />);
    await new Promise((resolve) => setTimeout(resolve, 350));
    expect(screen.getByText("Track 2")).toBeInTheDocument();
    expect(getSimilarTracks).toHaveBeenCalledTimes(1);
  });

  it("does not report an engine outage or refusal as unexpected, but reports a real failure", async () => {
    const { getSimilarTracks } = install({ fail: true });
    getSimilarTracks.mockRejectedValue(new Error("Engine not running"));
    const first = render(<NextTrackPicks track={row(1)} />);
    expect(await screen.findByText(/Could not load/)).toBeInTheDocument();
    expect(reportUnexpected).not.toHaveBeenCalled();
    first.unmount();
    getSimilarTracks.mockRejectedValue(new Error("boom"));
    render(<NextTrackPicks track={row(1)} />);
    expect(await screen.findByText(/Could not load/)).toBeInTheDocument();
    expect(reportUnexpected).toHaveBeenCalledTimes(1);
  });
});
