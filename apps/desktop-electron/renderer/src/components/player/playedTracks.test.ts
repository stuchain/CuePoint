import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { PlayerSnapshot } from "../../api/cuepointBridge.types";
import { EMPTY_AUDIO_STATE } from "./playerFormat";
import {
  markPlayed,
  resetPlayedTracksForTests,
  usePlayedTracks,
  usePlayingTrackId,
  useTrackPlayMarks,
} from "./playedTracks";
import { resetPlayerStore } from "./playerStore";

/**
 * The playing and played marks (R4-6, DEC-014).
 *
 * The played set is session only, so there is no storage to test; what matters
 * is that a track marked twice does not wake every table, and that the playing
 * id follows the player's own state rather than anything the click implied.
 */

afterEach(() => {
  resetPlayedTracksForTests();
  resetPlayerStore();
  delete (window as { cuepoint?: unknown }).cuepoint;
});

function snapshot(trackId: number | null): PlayerSnapshot {
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
      length: 1,
      currentId: trackId === null ? null : "q1",
      currentIndex: 0,
      currentItem:
        trackId === null
          ? null
          : {
              id: "q1",
              trackId,
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

/** A bridge that hands out one state and never changes it; the store reads it on first use. */
function installPlayer(state: PlayerSnapshot): (next: PlayerSnapshot) => void {
  let push: ((next: PlayerSnapshot) => void) | null = null;
  (window as unknown as { cuepoint?: unknown }).cuepoint = {
    player: {
      getState: () => Promise.resolve(state),
      subscribeState: (onState: (next: PlayerSnapshot) => void) => {
        push = onState;
        onState(state);
        return () => {};
      },
    },
  };
  return (next) => push?.(next);
}

describe("the played set", () => {
  it("starts empty", () => {
    const { result } = renderHook(() => usePlayedTracks());
    expect(result.current.size).toBe(0);
  });

  it("holds a track once it is marked", () => {
    const { result } = renderHook(() => usePlayedTracks());
    act(() => markPlayed(7));
    expect(result.current.has(7)).toBe(true);
  });

  it("keeps the same set when the same track is marked again", () => {
    const { result } = renderHook(() => usePlayedTracks());
    act(() => markPlayed(7));
    const before = result.current;
    act(() => markPlayed(7));
    expect(result.current).toBe(before);
  });

  it("hands out a new set when another track is marked", () => {
    const { result } = renderHook(() => usePlayedTracks());
    act(() => markPlayed(7));
    const before = result.current;
    act(() => markPlayed(8));
    expect(result.current).not.toBe(before);
    expect([...result.current].sort()).toEqual([7, 8]);
  });

  it("forgets everything on reset", () => {
    const { result } = renderHook(() => usePlayedTracks());
    act(() => markPlayed(7));
    act(() => resetPlayedTracksForTests());
    expect(result.current.size).toBe(0);
  });
});

describe("the playing track", () => {
  it("is null with no player", () => {
    const { result } = renderHook(() => usePlayingTrackId());
    expect(result.current).toBeNull();
  });

  it("follows the track in the player", () => {
    const push = installPlayer(snapshot(3));
    const { result } = renderHook(() => usePlayingTrackId());
    expect(result.current).toBe(3);

    act(() => push(snapshot(4)));
    expect(result.current).toBe(4);

    act(() => push(snapshot(null)));
    expect(result.current).toBeNull();
  });
});

describe("the row marks", () => {
  interface Row {
    id: number | null;
  }
  const idOf = (row: Row) => row.id;

  it("tells the playing row from a played one", () => {
    installPlayer(snapshot(3));
    const { result } = renderHook(() => useTrackPlayMarks(idOf));
    act(() => markPlayed(3));
    act(() => markPlayed(5));

    expect(result.current.isPlayingRow({ id: 3 })).toBe(true);
    // The table, not the hook, keeps a playing row from also reading as played.
    expect(result.current.wasPlayedRow({ id: 3 })).toBe(true);
    expect(result.current.isPlayingRow({ id: 5 })).toBe(false);
    expect(result.current.wasPlayedRow({ id: 5 })).toBe(true);
  });

  it("marks a row with no track id as neither", () => {
    installPlayer(snapshot(3));
    const { result } = renderHook(() => useTrackPlayMarks(idOf));
    expect(result.current.isPlayingRow({ id: null })).toBe(false);
    expect(result.current.wasPlayedRow({ id: null })).toBe(false);
  });
});
