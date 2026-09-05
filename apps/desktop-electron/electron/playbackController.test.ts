import { describe, expect, it, vi } from "vitest";

import { PlaybackController } from "./playbackController";
import type { PlayerSupervisor } from "./playerSupervisor";

/**
 * Queue meeting mpv (PLAYER-04).
 *
 * The supervisor is faked, so what is under test is the *policy*: which file is
 * loaded with `replace`, which is appended for gapless, and what happens when
 * mpv advances on its own. The same behaviour against the real binary lives in
 * `playbackController.integration.test.ts`.
 */

interface FakeCall {
  kind: "play" | "enqueue" | "stop" | "seek";
  file?: string;
  seconds?: number;
}

function fakePlayer() {
  const calls: FakeCall[] = [];
  let entryId = 0;
  let startFile: ((info: { playlistEntryId: number | null }) => void) | null = null;
  let endFile: ((info: { reason: string; playlistEntryId?: number }) => void) | null = null;
  let position: number | null = 0;

  const player = {
    isRunning: true,
    getSnapshot: () => ({
      status: {
        available: true,
        running: true,
        reconnecting: false,
        restartAttempts: 0,
      },
      playback: {
        filePath: null,
        playing: true,
        paused: false,
        positionSeconds: position,
        durationSeconds: null,
        volume: 100,
        muted: false,
      },
    }),
    onSnapshot: () => () => undefined,
    onStartFile: (listener: (info: { playlistEntryId: number | null }) => void) => {
      startFile = listener;
      return () => undefined;
    },
    onEndFile: (listener: (info: { reason: string; playlistEntryId?: number }) => void) => {
      endFile = listener;
      return () => undefined;
    },
    play: async (file: string) => {
      calls.push({ kind: "play", file });
      entryId += 1;
      return entryId;
    },
    enqueue: async (file: string) => {
      calls.push({ kind: "enqueue", file });
      entryId += 1;
      return entryId;
    },
    stopPlayback: async () => {
      calls.push({ kind: "stop" });
    },
    seek: async (seconds: number) => {
      calls.push({ kind: "seek", seconds });
    },
    pause: async () => undefined,
    resume: async () => undefined,
    togglePause: async () => undefined,
    setVolume: async () => undefined,
    setMuted: async () => undefined,
  };

  return {
    player: player as unknown as PlayerSupervisor,
    calls,
    /** Pretend mpv moved to a playlist entry by itself. */
    advanceTo: (id: number) => startFile?.({ playlistEntryId: id }),
    finish: (reason = "eof", id?: number) => endFile?.({ reason, playlistEntryId: id }),
    setPosition: (seconds: number | null) => {
      position = seconds;
    },
  };
}

const tracks = (...names: string[]) =>
  names.map((name) => ({ filePath: `/music/${name}.flac`, title: name }));

const played = (calls: FakeCall[]) =>
  calls.filter((c) => c.kind === "play").map((c) => c.file);
const enqueued = (calls: FakeCall[]) =>
  calls.filter((c) => c.kind === "enqueue").map((c) => c.file);

describe("starting a queue", () => {
  it("plays the track the user picked (DEC-012)", async () => {
    const { player, calls } = fakePlayer();
    const controller = new PlaybackController(player);

    await controller.playQueue(tracks("a", "b", "c"), 1);

    expect(played(calls)).toEqual(["/music/b.flac"]);
    expect(controller.snapshot().queue.currentId).not.toBeNull();
  });

  it("preloads the next track so the transition is gapless (DEC-056)", async () => {
    // The whole reason this class exists: `--gapless-audio` only removes the
    // gap inside mpv's own playlist, so the next file has to be there before
    // the current one ends.
    const { player, calls } = fakePlayer();
    const controller = new PlaybackController(player);

    await controller.playQueue(tracks("a", "b", "c"), 0);

    expect(enqueued(calls)).toEqual(["/music/b.flac"]);
  });

  it("does not preload anything once the queue has finished", async () => {
    // Nothing is playing, so nothing comes next. Preloading here would hand
    // mpv a track to play that nobody asked for.
    const { player, calls, finish } = fakePlayer();
    const controller = new PlaybackController(player);
    await controller.playQueue(tracks("only"), 0);
    finish("eof");
    calls.length = 0;

    await controller.addToQueue(tracks("later"));

    expect(enqueued(calls)).toEqual([]);
  });

  it("preloads nothing when there is no next track", async () => {
    const { player, calls } = fakePlayer();
    const controller = new PlaybackController(player);

    await controller.playQueue(tracks("only"), 0);

    expect(enqueued(calls)).toEqual([]);
  });

  it("preloads the first track again under repeat-one", async () => {
    const { player, calls } = fakePlayer();
    const controller = new PlaybackController(player);
    await controller.playQueue(tracks("a", "b"), 0);
    calls.length = 0;

    await controller.setRepeat("one");

    expect(enqueued(calls)).toEqual(["/music/a.flac"]);
  });

  it("wraps the preload under repeat-all at the end of the queue", async () => {
    const { player, calls } = fakePlayer();
    const controller = new PlaybackController(player);
    await controller.playQueue(tracks("a", "b"), 1);
    calls.length = 0;

    await controller.setRepeat("all");

    expect(enqueued(calls)).toEqual(["/music/a.flac"]);
  });

  it("stops when asked to play an empty list", async () => {
    const { player, calls } = fakePlayer();
    const controller = new PlaybackController(player);

    await controller.playQueue([], 0);

    expect(calls.some((c) => c.kind === "stop")).toBe(true);
  });
});

describe("mpv advancing by itself", () => {
  it("follows mpv into the preloaded track", async () => {
    const { player, advanceTo } = fakePlayer();
    const controller = new PlaybackController(player);
    await controller.playQueue(tracks("a", "b", "c"), 0);
    // entry 1 = a (play), entry 2 = b (enqueue)

    advanceTo(2);

    expect(controller.queueWindow(0, 1_000).items[1].status).toBe("playing");
  });

  it("preloads the one after it, without reloading what is playing", async () => {
    const { player, calls, advanceTo } = fakePlayer();
    const controller = new PlaybackController(player);
    await controller.playQueue(tracks("a", "b", "c"), 0);
    calls.length = 0;

    advanceTo(2);
    await vi.waitFor(() => expect(enqueued(calls)).toEqual(["/music/c.flac"]));

    // Crucially no `play`: mpv is already playing it, and reloading would both
    // restart the track and reintroduce the gap.
    expect(played(calls)).toEqual([]);
  });

  it("ignores a start-file for the track already playing", async () => {
    const { player, calls, advanceTo } = fakePlayer();
    const controller = new PlaybackController(player);
    await controller.playQueue(tracks("a", "b"), 0);
    calls.length = 0;

    advanceTo(1); // the entry that is already current

    expect(calls).toEqual([]);
  });

  it("ignores an entry id it does not recognise", async () => {
    // A stale entry from a playlist that was replaced.
    const { player, advanceTo } = fakePlayer();
    const controller = new PlaybackController(player);
    await controller.playQueue(tracks("a", "b"), 0);
    const before = controller.snapshot().queue.currentId;

    advanceTo(999);

    expect(controller.snapshot().queue.currentId).toBe(before);
  });

  it("plays a whole queue through without ever calling play again", async () => {
    // Three tracks, one `play` and two gapless transitions.
    const { player, calls, advanceTo } = fakePlayer();
    const controller = new PlaybackController(player);
    await controller.playQueue(tracks("a", "b", "c"), 0);

    advanceTo(2);
    await vi.waitFor(() => expect(enqueued(calls)).toContain("/music/c.flac"));
    advanceTo(3);

    expect(played(calls)).toEqual(["/music/a.flac"]);
    expect(enqueued(calls)).toEqual(["/music/b.flac", "/music/c.flac"]);
  });
});

describe("the end of the queue", () => {
  it("stops when the last track finishes", async () => {
    const { player, finish } = fakePlayer();
    const controller = new PlaybackController(player);
    await controller.playQueue(tracks("only"), 0);

    finish("eof");

    expect(controller.snapshot().queue.currentId).toBeNull();
  });

  it("keeps the queue so the panel still shows it", async () => {
    const { player, finish } = fakePlayer();
    const controller = new PlaybackController(player);
    await controller.playQueue(tracks("a", "b"), 1);

    finish("eof");

    expect(controller.queueWindow(0, 1_000).items).toHaveLength(2);
  });

  it("does not stop when more tracks follow", async () => {
    const { player, finish } = fakePlayer();
    const controller = new PlaybackController(player);
    await controller.playQueue(tracks("a", "b"), 0);

    finish("eof"); // a ended, b is preloaded

    expect(controller.snapshot().queue.currentId).not.toBeNull();
  });
});

describe("failures", () => {
  it("marks the failed track without removing it (DEC-054)", async () => {
    const { player, finish } = fakePlayer();
    const controller = new PlaybackController(player);
    await controller.playQueue(tracks("a", "b"), 0);

    finish("error", 1);

    expect(controller.queueWindow(0, 1_000).items[0].status).toBe("failed");
    expect(controller.queueWindow(0, 1_000).items).toHaveLength(2);
  });

  it("marks the preloaded track when it is the one that failed", async () => {
    const { player, finish } = fakePlayer();
    const controller = new PlaybackController(player);
    await controller.playQueue(tracks("a", "b"), 0);

    finish("error", 2); // the appended entry

    expect(controller.queueWindow(0, 1_000).items[1].status).toBe("failed");
  });
});

describe("manual transport", () => {
  it("next loads the following track immediately", async () => {
    // A gap here is not a defect: the user asked for the change and expects it
    // now, so `replace` is right even though it is not gapless.
    const { player, calls } = fakePlayer();
    const controller = new PlaybackController(player);
    await controller.playQueue(tracks("a", "b", "c"), 0);
    calls.length = 0;

    await controller.next();

    expect(played(calls)).toEqual(["/music/b.flac"]);
  });

  it("next at the end of the queue stops", async () => {
    const { player, calls } = fakePlayer();
    const controller = new PlaybackController(player);
    await controller.playQueue(tracks("a"), 0);
    calls.length = 0;

    await controller.next();

    expect(calls.some((c) => c.kind === "stop")).toBe(true);
  });

  it("previous restarts the track when past the threshold", async () => {
    const { player, calls, setPosition } = fakePlayer();
    const controller = new PlaybackController(player);
    await controller.playQueue(tracks("a", "b"), 1);
    setPosition(30);
    calls.length = 0;

    await controller.previous();

    expect(calls).toEqual([{ kind: "seek", seconds: 0 }]);
  });

  it("previous goes back when pressed early", async () => {
    const { player, calls, setPosition } = fakePlayer();
    const controller = new PlaybackController(player);
    await controller.playQueue(tracks("a", "b"), 1);
    setPosition(1);
    calls.length = 0;

    await controller.previous();

    expect(played(calls)).toEqual(["/music/a.flac"]);
  });

  it("jumping plays the chosen track", async () => {
    const { player, calls } = fakePlayer();
    const controller = new PlaybackController(player);
    await controller.playQueue(tracks("a", "b", "c"), 0);
    calls.length = 0;

    await controller.jumpTo(2);

    expect(played(calls)).toEqual(["/music/c.flac"]);
  });

  it("jumping past the end changes nothing", async () => {
    const { player, calls } = fakePlayer();
    const controller = new PlaybackController(player);
    await controller.playQueue(tracks("a", "b"), 0);
    calls.length = 0;

    await controller.jumpTo(9);

    expect(calls).toEqual([]);
  });
});

describe("editing the queue while it plays", () => {
  it("Play Next re-points the preload without interrupting (DEC-013)", async () => {
    const { player, calls } = fakePlayer();
    const controller = new PlaybackController(player);
    await controller.playQueue(tracks("a", "b"), 0);
    calls.length = 0;

    await controller.playNextItems(tracks("x"));

    expect(enqueued(calls)).toEqual(["/music/x.flac"]);
    expect(played(calls)).toEqual([]);
  });

  it("Add to Queue does not disturb a running track", async () => {
    const { player, calls } = fakePlayer();
    const controller = new PlaybackController(player);
    await controller.playQueue(tracks("a", "b"), 0);
    calls.length = 0;

    await controller.addToQueue(tracks("z"));

    expect(played(calls)).toEqual([]);
    expect(controller.queueWindow(0, 1_000).items).toHaveLength(3);
  });

  it("removing the playing track moves to the next one", async () => {
    const { player, calls } = fakePlayer();
    const controller = new PlaybackController(player);
    await controller.playQueue(tracks("a", "b", "c"), 0);
    const playingId = controller.snapshot().queue.currentId!;
    calls.length = 0;

    await controller.removeFromQueue(playingId);

    expect(played(calls)).toEqual(["/music/b.flac"]);
  });

  it("removing another track leaves playback alone", async () => {
    const { player, calls } = fakePlayer();
    const controller = new PlaybackController(player);
    await controller.playQueue(tracks("a", "b", "c"), 0);
    const thirdId = controller.queueWindow(0, 1_000).items[2].id;
    calls.length = 0;

    await controller.removeFromQueue(thirdId);

    expect(played(calls)).toEqual([]);
  });

  it("removing the next track re-points the preload", async () => {
    const { player, calls } = fakePlayer();
    const controller = new PlaybackController(player);
    await controller.playQueue(tracks("a", "b", "c"), 0);
    const secondId = controller.queueWindow(0, 1_000).items[1].id;
    calls.length = 0;

    await controller.removeFromQueue(secondId);

    expect(enqueued(calls)).toEqual(["/music/c.flac"]);
  });

  it("emptying the queue stops playback", async () => {
    const { player, calls } = fakePlayer();
    const controller = new PlaybackController(player);
    await controller.playQueue(tracks("a"), 0);
    calls.length = 0;

    await controller.removeFromQueue(controller.snapshot().queue.currentId!);

    expect(calls.some((c) => c.kind === "stop")).toBe(true);
  });

  it("reordering re-points the preload", async () => {
    const { player, calls } = fakePlayer();
    const controller = new PlaybackController(player);
    await controller.playQueue(tracks("a", "b", "c"), 0);
    calls.length = 0;

    await controller.moveInQueue(2, 1); // c now follows a

    expect(enqueued(calls)).toEqual(["/music/c.flac"]);
  });

  it("clearing stops and empties", async () => {
    const { player, calls } = fakePlayer();
    const controller = new PlaybackController(player);
    await controller.playQueue(tracks("a", "b"), 0);
    calls.length = 0;

    await controller.clearQueue();

    expect(controller.queueWindow(0, 1_000).items).toEqual([]);
    expect(calls.some((c) => c.kind === "stop")).toBe(true);
  });
});

describe("shuffle and repeat while playing", () => {
  it("shuffling re-points the preload without interrupting (DEC-052)", async () => {
    const { player, calls } = fakePlayer();
    const controller = new PlaybackController(player, { random: () => 0 });
    await controller.playQueue(tracks("a", "b", "c", "d"), 0);
    calls.length = 0;

    await controller.setShuffle(true);

    expect(played(calls)).toEqual([]);
    expect(enqueued(calls)).toHaveLength(1);
  });

  it("keeps the same track playing through shuffle and back", async () => {
    const { player } = fakePlayer();
    const controller = new PlaybackController(player, { random: () => 0 });
    await controller.playQueue(tracks("a", "b", "c"), 1);
    const playing = controller.snapshot().queue.currentId;

    await controller.setShuffle(true);
    await controller.setShuffle(false);

    expect(controller.snapshot().queue.currentId).toBe(playing);
  });
});

describe("snapshots", () => {
  it("carries the queue alongside player state", async () => {
    const { player } = fakePlayer();
    const controller = new PlaybackController(player);
    await controller.playQueue(tracks("a", "b"), 0);

    const snapshot = controller.snapshot();
    expect(snapshot.status.running).toBe(true);
    expect(snapshot.queue.length).toBe(2);
  });

  it("notifies listeners when the queue changes", async () => {
    const { player } = fakePlayer();
    const controller = new PlaybackController(player);
    const seen: number[] = [];
    controller.onSnapshot((s) => seen.push(s.queue.length));

    await controller.playQueue(tracks("a"), 0);
    await controller.addToQueue(tracks("b"));

    expect(seen.at(-1)).toBe(2);
  });

  it("stops notifying after unsubscribe", async () => {
    const { player } = fakePlayer();
    const controller = new PlaybackController(player);
    const seen: unknown[] = [];
    const off = controller.onSnapshot((s) => seen.push(s));
    off();

    await controller.playQueue(tracks("a"), 0);

    expect(seen).toHaveLength(0);
  });
});
