import { describe, expect, it } from "vitest";

import type { PlayerSnapshot, QueueItem } from "../../api/cuepointBridge.types";
import {
  formatBpm,
  formatTime,
  formatTrackMeta,
  progressFraction,
  sameItem,
  selectCurrentItem,
  selectHasPlayed,
  selectPlaying,
} from "./playerFormat";

/**
 * What the player bar says (PLAYER-06).
 *
 * Pure rules, tested without rendering: the awkward cases here are all about
 * *absent* values, because a track whose duration has not arrived yet is the
 * normal state for the first moment of every track, and a bar that renders
 * "0:00" or a stranded separator in that moment looks broken several times a
 * session.
 */

function item(overrides: Partial<QueueItem> = {}): QueueItem {
  return {
    id: "q1",
    trackId: 1,
    filePath: "/music/a.flac",
    title: "Strobe",
    artist: "deadmau5",
    key: "8A",
    bpm: 128,
    durationSeconds: 600,
    status: "playing",
    ...overrides,
  };
}

function snapshot(overrides: Partial<PlayerSnapshot> = {}): PlayerSnapshot {
  return {
    status: {
      available: true,
      running: true,
      reconnecting: false,
      restartAttempts: 0,
    },
    playback: {
      filePath: null,
      playing: false,
      paused: false,
      positionSeconds: null,
      durationSeconds: null,
      volume: 100,
      muted: false,
    },
    queue: {
      items: [],
      playOrder: [],
      currentId: null,
      currentIndex: -1,
      shuffle: false,
      repeat: "off",
    },
    ...overrides,
  };
}

describe("times", () => {
  it("formats minutes and seconds", () => {
    expect(formatTime(0)).toBe("0:00");
    expect(formatTime(9)).toBe("0:09");
    expect(formatTime(75)).toBe("1:15");
    expect(formatTime(599)).toBe("9:59");
  });

  it("adds hours only when there are some", () => {
    expect(formatTime(3600)).toBe("1:00:00");
    expect(formatTime(3661)).toBe("1:01:01");
    expect(formatTime(3599)).toBe("59:59");
  });

  it("rounds down rather than up", () => {
    // Rounding up shows a track ending a second before it does.
    expect(formatTime(59.9)).toBe("0:59");
  });

  it("shows a dash for anything unknown", () => {
    // Not "0:00": a duration that has not arrived is not a duration of zero,
    // and showing one makes the bar look full at the start of every track.
    expect(formatTime(null)).toBe("–:––");
    expect(formatTime(undefined)).toBe("–:––");
    expect(formatTime(Number.NaN)).toBe("–:––");
    expect(formatTime(-5)).toBe("–:––");
  });
});

describe("bpm", () => {
  it("keeps one decimal, the way Rekordbox writes it", () => {
    expect(formatBpm(128)).toBe("128.0");
    expect(formatBpm(122.53)).toBe("122.5");
  });

  it("says nothing when there is no tempo", () => {
    expect(formatBpm(null)).toBe("");
    expect(formatBpm(0)).toBe("");
    expect(formatBpm(undefined)).toBe("");
  });
});

describe("the line under the title", () => {
  it("joins artist, key and tempo", () => {
    expect(formatTrackMeta(item())).toBe("deadmau5 · 8A · 128.0 BPM");
  });

  it("leaves no stranded separators when a value is missing", () => {
    // A track with no key must not read "deadmau5 ·  · 128.0 BPM".
    expect(formatTrackMeta(item({ key: null }))).toBe("deadmau5 · 128.0 BPM");
    expect(formatTrackMeta(item({ bpm: null }))).toBe("deadmau5 · 8A");
    expect(formatTrackMeta(item({ artist: "" }))).toBe("8A · 128.0 BPM");
  });

  it("says nothing for a track with nothing to say", () => {
    expect(formatTrackMeta(item({ artist: "", key: null, bpm: null }))).toBe("");
  });

  it("says nothing when nothing is playing", () => {
    expect(formatTrackMeta(null)).toBe("");
  });
});

describe("whether a track is actually playing", () => {
  it("is false when nothing is loaded", () => {
    // Idle is not paused: `paused` is false with nothing playing, and a
    // transport button derived from it would offer to pause silence.
    expect(selectPlaying(null)).toBe(false);
    expect(selectPlaying(snapshot())).toBe(false);
  });

  it("is true while a track runs", () => {
    expect(
      selectPlaying(snapshot({ playback: { ...snapshot().playback, playing: true } })),
    ).toBe(true);
  });

  it("is false while paused", () => {
    expect(
      selectPlaying(
        snapshot({ playback: { ...snapshot().playback, playing: true, paused: true } }),
      ),
    ).toBe(false);
  });
});

describe("progress", () => {
  it("is the fraction played", () => {
    expect(progressFraction(30, 120)).toBe(0.25);
  });

  it("is zero when either end is unknown", () => {
    expect(progressFraction(null, 120)).toBe(0);
    expect(progressFraction(30, null)).toBe(0);
    expect(progressFraction(30, 0)).toBe(0);
  });

  it("never leaves 0..1 even if the position overshoots", () => {
    expect(progressFraction(200, 120)).toBe(1);
  });
});

describe("selectors", () => {
  it("finds the playing track", () => {
    const playing = item({ id: "q2" });
    const state = snapshot({
      queue: {
        items: [item({ id: "q1" }), playing],
        playOrder: ["q1", "q2"],
        currentId: "q2",
        currentIndex: 1,
        shuffle: false,
        repeat: "off",
      },
    });
    expect(selectCurrentItem(state)?.id).toBe("q2");
  });

  it("finds nothing when the queue has stopped", () => {
    expect(selectCurrentItem(snapshot())).toBeNull();
    expect(selectCurrentItem(null)).toBeNull();
  });

  it("treats the same queue entry as unchanged", () => {
    // What keeps the bar from repainting its track text four times a second.
    expect(sameItem(item(), item({ durationSeconds: 601 }))).toBe(true);
    expect(sameItem(item(), item({ id: "q9" }))).toBe(false);
    expect(sameItem(null, null)).toBe(true);
  });
});

describe("whether anything has played (DEC-053)", () => {
  it("is false before the first play", () => {
    expect(selectHasPlayed(null)).toBe(false);
    expect(selectHasPlayed(snapshot())).toBe(false);
  });

  it("is true once a queue exists", () => {
    const state = snapshot({
      queue: {
        items: [item()],
        playOrder: ["q1"],
        currentId: "q1",
        currentIndex: 0,
        shuffle: false,
        repeat: "off",
      },
    });
    expect(selectHasPlayed(state)).toBe(true);
  });

  it("stays true after the queue finishes", () => {
    // The bar must not vanish when a queue ends; the items are still there.
    const state = snapshot({
      queue: {
        items: [item({ status: "pending" })],
        playOrder: ["q1"],
        currentId: null,
        currentIndex: -1,
        shuffle: false,
        repeat: "off",
      },
    });
    expect(selectHasPlayed(state)).toBe(true);
  });
});
