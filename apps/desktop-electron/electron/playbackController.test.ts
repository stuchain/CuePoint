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
  kind: "play" | "enqueue" | "stop" | "seek" | "audio";
  file?: string;
  seconds?: number;
  settings?: { device?: string; exclusive?: boolean };
  remember?: boolean;
}

function fakePlayer() {
  const calls: FakeCall[] = [];
  let entryId = 0;
  let startFile: ((info: { playlistEntryId: number | null }) => void) | null = null;
  let endFile:
    | ((info: { reason: string; playlistEntryId?: number; error?: string }) => void)
    | null = null;
  let idle: (() => void) | null = null;
  let position: number | null = 0;
  // What the user asked for, and what is actually in use (PLAYER-11).
  const audio = {
    device: "auto",
    exclusive: false,
    activeDevice: "auto",
    activeExclusive: false,
    exclusiveSupported: true,
  };

  const player = {
    isRunning: true,
    isIdle: false,
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
      audio: { ...audio },
    }),
    onSnapshot: () => () => undefined,
    onStartFile: (listener: (info: { playlistEntryId: number | null }) => void) => {
      startFile = listener;
      return () => undefined;
    },
    onEndFile: (
      listener: (info: { reason: string; playlistEntryId?: number; error?: string }) => void,
    ) => {
      endFile = listener;
      return () => undefined;
    },
    onIdle: (listener: () => void) => {
      idle = listener;
      return () => undefined;
    },
    play: async (file: string) => {
      calls.push({ kind: "play", file });
      player.isIdle = false;
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
    listAudioDevices: async () => [{ name: "auto", description: "Autoselect device" }],
    setAudioSettings: async (
      settings: { device?: string; exclusive?: boolean },
      options: { remember?: boolean } = {},
    ) => {
      calls.push({ kind: "audio", settings: { ...settings }, remember: options.remember ?? true });
      if (settings.device !== undefined) {
        audio.activeDevice = settings.device;
        if (options.remember !== false) audio.device = settings.device;
      }
      if (settings.exclusive !== undefined) {
        audio.activeExclusive = settings.exclusive;
        if (options.remember !== false) audio.exclusive = settings.exclusive;
      }
    },
  };

  return {
    player: player as unknown as PlayerSupervisor,
    calls,
    /** Pretend mpv moved to a playlist entry by itself. */
    advanceTo: (id: number) => startFile?.({ playlistEntryId: id }),
    finish: (reason = "eof", id?: number, error?: string) =>
      endFile?.({ reason, playlistEntryId: id, error }),
    /**
     * Pretend mpv ran out of playlist and went idle (PLAYER-10).
     *
     * The real player reports this through `idle-active`, which is both a
     * level and an edge — so the fake sets the level and fires the edge, in
     * that order, exactly as the supervisor does.
     */
    goIdle: () => {
      player.isIdle = true;
      idle?.();
    },
    /**
     * Pretend mpv reported itself idle *before* the failure that explains it.
     *
     * Both are messages on the same socket and either can arrive first. In this
     * order there is no second edge to react to — an observed property only
     * fires on change — so only the level is left to notice it.
     */
    goIdleSilently: () => {
      player.isIdle = true;
    },
    setPosition: (seconds: number | null) => {
      position = seconds;
    },
    /** Put the player into a given audio state, as the user's settings would. */
    setAudio: (next: Partial<typeof audio>) => Object.assign(audio, next),
    audio,
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

/**
 * Files that will not play (PLAYER-10, DEC-054).
 *
 * Two things have to be true at once and they pull against each other: nothing
 * may stall — a failed track must not leave the queue sitting in silence — and
 * nothing may run away, because a disconnected drive fails every track in the
 * queue as fast as mpv can try them.
 */
describe("recovering from a failure (PLAYER-10)", () => {
  /** Collect the notices a controller emits, the way main forwards them. */
  function watch(controller: PlaybackController) {
    const notices: Array<{ kind: string; message: string; count: number; stopped: boolean }> = [];
    controller.onNotice((notice) => notices.push(notice));
    return notices;
  }

  it("leaves the advance to mpv when there is something preloaded", async () => {
    // mpv walks past a broken entry into the one appended behind it, without a
    // gap. Loading it again here would play the same track twice.
    const { player, calls, finish } = fakePlayer();
    const controller = new PlaybackController(player, { failureWindowMs: 5 });
    await controller.playQueue(tracks("a", "b"), 0);
    calls.length = 0;

    finish("error", 1, "loading failed");
    await vi.waitFor(() => expect(controller.queueWindow(0, 1_000).items[0].status).toBe("failed"));

    expect(played(calls)).toEqual([]);
  });

  it("takes over when mpv goes idle instead of advancing", async () => {
    // The stall this step exists to prevent: the append lost the race with the
    // failure, so mpv has nothing to walk into and simply stops. Without this
    // the queue sits in silence with tracks still in it.
    const { player, calls, finish, goIdle } = fakePlayer();
    const controller = new PlaybackController(player, { failureWindowMs: 5 });
    await controller.playQueue(tracks("a", "b"), 0);
    calls.length = 0;

    finish("error", 1, "loading failed");
    goIdle();

    await vi.waitFor(() => expect(played(calls)).toEqual(["/music/b.flac"]));
  });

  it("ignores an idle player when nothing failed", async () => {
    // mpv is idle before the first track, after the queue ends, and whenever
    // playback is stopped. Starting something on any of those would be an app
    // that plays music nobody asked for.
    const { player, calls, goIdle } = fakePlayer();
    const controller = new PlaybackController(player, { failureWindowMs: 5 });
    await controller.playQueue(tracks("a", "b"), 0);
    calls.length = 0;

    goIdle();
    goIdle();

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(calls).toEqual([]);
  });

  it("ignores an idle player once mpv has already moved on", async () => {
    const { player, calls, finish, advanceTo, goIdle } = fakePlayer();
    const controller = new PlaybackController(player, { failureWindowMs: 5 });
    await controller.playQueue(tracks("a", "b", "c"), 0);

    finish("error", 1, "loading failed");
    advanceTo(2); // mpv walked into the preloaded entry after all
    calls.length = 0;
    goIdle();

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(played(calls)).toEqual([]);
  });

  it("says once that a track would not play, and names it", async () => {
    const { player, finish } = fakePlayer();
    const controller = new PlaybackController(player, { failureWindowMs: 5 });
    const notices = watch(controller);
    await controller.playQueue(tracks("a", "b"), 0);

    finish("error", 1, "loading failed");

    await vi.waitFor(() => expect(notices).toHaveLength(1));
    expect(notices[0]).toMatchObject({
      kind: "track-failed",
      count: 1,
      stopped: false,
      message: "Could not play “a” (loading failed)",
    });
  });

  it("says one thing about a whole queue of broken files", async () => {
    // Three failures in a row, walked by mpv, are one message and not three.
    const { player, finish, advanceTo, goIdle } = fakePlayer();
    const controller = new PlaybackController(player, { failureWindowMs: 20 });
    const notices = watch(controller);
    await controller.playQueue(tracks("a", "b", "c"), 0);

    finish("error", 1, "loading failed");
    advanceTo(2);
    finish("error", 2, "loading failed");
    advanceTo(3);
    finish("error", 3, "loading failed");
    // Nothing is left, so mpv stops.
    goIdle();

    await vi.waitFor(() => expect(notices).toHaveLength(1), { timeout: 1_000 });
    expect(notices[0]).toMatchObject({ count: 3, kind: "track-failed" });
  });

  it("stops rather than spinning when every track in the queue fails", async () => {
    // The disconnected-drive case. Each failure must not hand mpv another file
    // to fail on for ever — with repeat on, that never ends by itself.
    const { player, calls, finish, goIdle } = fakePlayer();
    // A window long enough that the run is genuinely one run, which is what a
    // dead drive produces: mpv fails a file it cannot open in milliseconds.
    const controller = new PlaybackController(player, { failureWindowMs: 1_000 });
    const notices = watch(controller);
    await controller.playQueue(tracks("a", "b", "c"), 0);
    await controller.setRepeat("all");
    calls.length = 0;

    // mpv fails whatever it is handed and goes idle, over and over. The loop
    // ends when the player says something — and if it never does, the count
    // below is what fails, which is the runaway this test is here to catch.
    for (let round = 0; round < 10 && notices.length === 0; round += 1) {
      finish("error", undefined, "loading failed");
      goIdle();
      await new Promise((resolve) => setTimeout(resolve, 5));
    }

    expect(notices).toEqual([
      expect.objectContaining({ stopped: true, count: 3, kind: "track-failed" }),
    ]);
    expect(calls.some((call) => call.kind === "stop")).toBe(true);
    // Repeat-all did not send it round the queue again.
    expect(played(calls).length).toBeLessThanOrEqual(3);
  });

  it("stops handing mpv new files once the whole queue has failed", async () => {
    // The disconnected drive as it actually happens: mpv walks its *own*
    // playlist, and every `start-file` is what makes CuePoint append the entry
    // behind it. Nothing in that loop ends by itself — with repeat on it laps
    // for ever, and mpv fails a file it cannot open far faster than it plays
    // one, so it laps at speed.
    const { player, calls, finish, advanceTo, goIdle } = fakePlayer();
    const controller = new PlaybackController(player, { failureWindowMs: 1_000 });
    const notices = watch(controller);
    await controller.playQueue(tracks("a", "b", "c", "d"), 0);
    await controller.setRepeat("all");

    let entry = 1;
    let rounds = 0;
    for (; rounds < 25; rounds += 1) {
      finish("error", entry, "loading failed");
      const before = enqueued(calls).length;
      entry += 1;
      advanceTo(entry);
      await new Promise((resolve) => setTimeout(resolve, 0));
      // mpv was handed nothing, so its playlist is about to run dry.
      if (enqueued(calls).length === before) break;
    }

    expect(rounds).toBeLessThan(25);
    // Four tracks, plus the one appended before the first failure was counted.
    expect(enqueued(calls).length).toBeLessThanOrEqual(5);

    // mpv started that last entry and it fails too — and this time there is
    // nothing behind it, so mpv runs dry and goes idle.
    finish("error", entry, "loading failed");
    goIdle();

    await vi.waitFor(() => expect(notices).toHaveLength(1));
    expect(notices[0]).toMatchObject({ stopped: true, kind: "track-failed" });
    expect(notices[0]!.count).toBeGreaterThanOrEqual(4);
  });

  it("recovers when mpv reports itself idle before the failure", async () => {
    // Found by the end-to-end test, not by reasoning: with eight missing files
    // the real player sometimes sends `idle-active` ahead of the `end-file`
    // that explains it, and an observed property fires only on change — so
    // nothing else ever arrives to prompt a recovery. The queue stalled in
    // silence with tracks still in it, and the only symptom was a message that
    // counted four failures out of eight.
    const { player, calls, finish, goIdleSilently } = fakePlayer();
    const controller = new PlaybackController(player, { failureWindowMs: 5 });
    await controller.playQueue(tracks("a", "b"), 0);
    calls.length = 0;

    goIdleSilently();
    finish("error", 1, "loading failed");

    await vi.waitFor(() => expect(played(calls)).toEqual(["/music/b.flac"]));
  });

  it("stops and says so when the only track fails", async () => {
    const { player, calls, finish, goIdle } = fakePlayer();
    const controller = new PlaybackController(player, { failureWindowMs: 5_000 });
    const notices = watch(controller);
    await controller.playQueue(tracks("a"), 0);

    finish("error", 1, "loading failed");
    goIdle();

    // Reported immediately rather than after the window: the silence is the
    // thing being explained.
    await vi.waitFor(() => expect(notices).toHaveLength(1));
    expect(notices[0]).toMatchObject({
      stopped: true,
      count: 1,
      message: "Could not play “a” (loading failed) — playback stopped",
    });
    expect(calls.some((call) => call.kind === "stop")).toBe(true);
  });

  it("plays a track that failed before, when it is asked for again", async () => {
    // DEC-054 makes failure transient; the drive may well be back.
    const { player, calls, finish, goIdle } = fakePlayer();
    const controller = new PlaybackController(player, { failureWindowMs: 5 });
    await controller.playQueue(tracks("a", "b"), 0);
    finish("error", 1, "loading failed");
    goIdle();
    await vi.waitFor(() => expect(played(calls)).toContain("/music/b.flac"));
    calls.length = 0;

    await controller.jumpTo(0);

    expect(played(calls)).toEqual(["/music/a.flac"]);
    expect(controller.queueWindow(0, 1_000).items[0].status).toBe("playing");
  });

  it("fails an item with no file path without asking mpv about it", async () => {
    const { player, calls, goIdle } = fakePlayer();
    const controller = new PlaybackController(player, { failureWindowMs: 5 });
    const notices = watch(controller);

    await controller.playQueue(
      [{ filePath: "", title: "nowhere" }, { filePath: "/music/b.flac", title: "b" }],
      0,
    );

    expect(played(calls)).toEqual(["/music/b.flac"]);
    expect(controller.queueWindow(0, 1_000).items[0].status).toBe("failed");
    await vi.waitFor(() => expect(notices).toHaveLength(1));
    expect(notices[0]!.message).toBe("Could not play “nowhere” (no file path)");
    goIdle();
  });

  it("stops when every item has no path, without recursing through the queue", async () => {
    const { player, calls } = fakePlayer();
    const controller = new PlaybackController(player, { failureWindowMs: 5 });
    const notices = watch(controller);

    await controller.playQueue(
      Array.from({ length: 2_000 }, (_, index) => ({ filePath: "  ", title: `t${index}` })),
      0,
    );

    expect(played(calls)).toEqual([]);
    expect(calls.some((call) => call.kind === "stop")).toBe(true);
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({ count: 2_000, stopped: true });
  });

  it("tells a dead player apart from a dead file", async () => {
    // PLAYER-03 flagged this: "there is no audio player" and "this file will
    // not play" are different problems and must not share a message.
    const { player, finish, goIdle } = fakePlayer();
    const controller = new PlaybackController(player, { failureWindowMs: 5 });
    const notices = watch(controller);
    await controller.playQueue(tracks("a", "b"), 0);
    (player as unknown as { play: () => Promise<number> }).play = () => {
      throw new Error("There is no audio player.");
    };

    finish("error", 1, "loading failed");
    goIdle();

    await vi.waitFor(() => expect(notices.length).toBeGreaterThanOrEqual(2));
    expect(notices.map((notice) => notice.kind)).toContain("player-unavailable");
    expect(notices.find((notice) => notice.kind === "player-unavailable")!.message).toBe(
      "There is no audio player.",
    );
  });

  it("gives every notice a rising id, so a repeat is not mistaken for a resend", async () => {
    const { player, finish } = fakePlayer();
    const controller = new PlaybackController(player, { failureWindowMs: 5 });
    const notices: Array<{ id: number }> = [];
    controller.onNotice((notice) => notices.push(notice));
    await controller.playQueue(tracks("a", "b", "c"), 0);

    finish("error", 1, "loading failed");
    await vi.waitFor(() => expect(notices).toHaveLength(1));
    finish("error", 2, "loading failed");
    await vi.waitFor(() => expect(notices).toHaveLength(2));

    expect(notices.map((notice) => notice.id)).toEqual([1, 2]);
  });

  it("stops reporting once disposed", async () => {
    const { player, finish } = fakePlayer();
    const controller = new PlaybackController(player, { failureWindowMs: 5 });
    const notices = watch(controller);
    await controller.playQueue(tracks("a", "b"), 0);

    finish("error", 1, "loading failed");
    controller.dispose();

    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(notices).toHaveLength(0);
  });
});


/**
 * When the audio output is the problem (PLAYER-11, DEC-055).
 *
 * mpv reports a device it cannot open with the same `end-file` and the same
 * reason as a file it cannot read. Only the text tells them apart, and getting
 * that wrong is expensive in both directions: treat an unplugged interface as a
 * broken file and a whole queue of perfectly good music is marked failed and
 * skipped; treat a broken file as a device problem and the player quietly
 * stops being bit-perfect for the rest of the session.
 */
describe("falling back when the audio output fails (PLAYER-11)", () => {
  const AUDIO_FAILURE = "audio output initialization failed";

  function watch(controller: PlaybackController) {
    const notices: Array<{ kind: string; message: string; stopped: boolean }> = [];
    controller.onNotice((notice) => notices.push(notice));
    return notices;
  }

  it("drops exclusive output and plays the same track again", async () => {
    const { player, calls, finish, setAudio } = fakePlayer();
    const controller = new PlaybackController(player, { failureWindowMs: 5 });
    const notices = watch(controller);
    await controller.playQueue(tracks("a", "b"), 0);
    setAudio({ exclusive: true, activeExclusive: true });
    calls.length = 0;

    finish("error", 1, AUDIO_FAILURE);

    await vi.waitFor(() => expect(played(calls)).toEqual(["/music/a.flac"]));
    expect(calls.find((call) => call.kind === "audio")).toMatchObject({
      settings: { exclusive: false },
      remember: false,
    });
    expect(notices).toEqual([
      expect.objectContaining({
        kind: "audio-fallback",
        stopped: false,
        message: "Exclusive output was not available — playing through the shared device.",
      }),
    ]);
  });

  it("does not blame the track, or count it as one that failed", async () => {
    // The file was never the problem. Marking it failed would show a broken
    // badge on a track that plays perfectly, and counting it would eventually
    // stop the queue for a reason that has nothing to do with it (PLAYER-10).
    const { player, finish, setAudio } = fakePlayer();
    const controller = new PlaybackController(player, { failureWindowMs: 5 });
    const notices = watch(controller);
    await controller.playQueue(tracks("a", "b"), 0);
    setAudio({ exclusive: true, activeExclusive: true });

    finish("error", 1, AUDIO_FAILURE);
    await vi.waitFor(() => expect(notices).toHaveLength(1));

    expect(controller.queueWindow(0, 1_000).items[0]!.status).not.toBe("failed");
    expect(notices.some((notice) => notice.kind === "track-failed")).toBe(false);
  });

  it("falls back to the system default when the chosen device is gone", async () => {
    const { player, calls, finish, setAudio } = fakePlayer();
    const controller = new PlaybackController(player, { failureWindowMs: 5 });
    const notices = watch(controller);
    await controller.playQueue(tracks("a", "b"), 0);
    setAudio({ device: "wasapi/{gone}", activeDevice: "wasapi/{gone}" });
    calls.length = 0;

    finish("error", 1, AUDIO_FAILURE);

    await vi.waitFor(() => expect(played(calls)).toEqual(["/music/a.flac"]));
    expect(calls.find((call) => call.kind === "audio")).toMatchObject({
      settings: { device: "auto" },
      remember: false,
    });
    expect(notices[0]!.message).toBe(
      "The selected audio device is not available — playing through the system default.",
    );
  });

  it("takes one rung at a time: exclusive first, then the device", async () => {
    const { player, calls, finish, setAudio } = fakePlayer();
    const controller = new PlaybackController(player, { failureWindowMs: 5 });
    const notices = watch(controller);
    await controller.playQueue(tracks("a", "b"), 0);
    setAudio({
      device: "wasapi/{gone}",
      activeDevice: "wasapi/{gone}",
      exclusive: true,
      activeExclusive: true,
    });

    finish("error", 1, AUDIO_FAILURE);
    await vi.waitFor(() => expect(notices).toHaveLength(1));
    finish("error", undefined, AUDIO_FAILURE);
    await vi.waitFor(() => expect(notices).toHaveLength(2));

    expect(notices.map((notice) => notice.kind)).toEqual(["audio-fallback", "audio-fallback"]);
    expect(
      calls.filter((call) => call.kind === "audio").map((call) => call.settings),
    ).toEqual([{ exclusive: false }, { device: "auto" }]);
  });

  it("gives up and skips the track once there is nothing left to try", async () => {
    // Shared output on the system default already failed, so this is not a
    // configuration problem any more — it is a track that will not play, and
    // PLAYER-10 takes it from here.
    const { player, finish, goIdle } = fakePlayer();
    const controller = new PlaybackController(player, { failureWindowMs: 5 });
    const notices = watch(controller);
    await controller.playQueue(tracks("a", "b"), 0);

    finish("error", 1, AUDIO_FAILURE);
    goIdle();

    await vi.waitFor(() => expect(notices).toHaveLength(1));
    expect(notices[0]!.kind).toBe("track-failed");
    expect(controller.queueWindow(0, 1_000).items[0]!.status).toBe("failed");
  });

  it("leaves a file that will not load to PLAYER-10", async () => {
    const { player, calls, finish } = fakePlayer();
    const controller = new PlaybackController(player, { failureWindowMs: 5 });
    const notices = watch(controller);
    await controller.playQueue(tracks("a", "b"), 0);
    calls.length = 0;

    finish("error", 1, "loading failed");

    await vi.waitFor(() => expect(notices).toHaveLength(1));
    expect(notices[0]!.kind).toBe("track-failed");
    // Skipped, not retried: the track really is the problem.
    expect(played(calls)).toEqual([]);
    expect(calls.some((call) => call.kind === "audio")).toBe(false);
  });

  it("remembers a device the user chose", async () => {
    const { player, calls } = fakePlayer();
    const controller = new PlaybackController(player);

    await controller.setAudioSettings({ device: "wasapi/{interface}", exclusive: true });

    expect(calls.find((call) => call.kind === "audio")).toMatchObject({
      settings: { device: "wasapi/{interface}", exclusive: true },
      remember: true,
    });
  });

  it("hands the device list straight through", async () => {
    const { player } = fakePlayer();
    const controller = new PlaybackController(player);

    await expect(controller.listAudioDevices()).resolves.toEqual([
      { name: "auto", description: "Autoselect device" },
    ]);
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
