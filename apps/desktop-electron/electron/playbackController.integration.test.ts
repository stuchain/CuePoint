import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import { PlaybackController } from "./playbackController";
import { resolvePlayerBinary } from "./playerLaunch";
import { PlayerSupervisor } from "./playerSupervisor";

/**
 * The queue driving the **real mpv** (PLAYER-04, DEC-056).
 *
 * The unit tests prove the policy against a fake: which file is loaded with
 * `replace` and which is appended. Only the real binary can prove the thing the
 * policy exists for — that mpv, given an appended entry, walks into it by
 * itself when the current track ends.
 *
 * That auto-advance *is* the evidence of gapless playback here: mpv cannot
 * start a file it was never given, so a queue that advances without CuePoint
 * calling `play` again is a queue whose next track was already loaded and
 * decoding. Whether the seam is audible is a listening test, and it is on the
 * macOS pass.
 *
 * Skips when the sidecar was never fetched; CI fetches it on Windows and macOS.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(here, "../../..");
const FIXTURES = path.join(REPO_ROOT, "src", "tests", "fixtures", "audio");
const fixture = (name: string) => path.join(FIXTURES, name);

const binary = resolvePlayerBinary({ packaged: false, repoRoot: REPO_ROOT, env: process.env });
const describeWithMpv = binary ? describe : describe.skip;

const supervisors: PlayerSupervisor[] = [];
const controllers: PlaybackController[] = [];

function makeController(options: { failureWindowMs?: number } = {}) {
  const player = new PlayerSupervisor({
    packaged: false,
    repoRoot: REPO_ROOT,
    env: process.env,
    mpvArgs: ["--ao=null"],
    positionPushIntervalMs: 20,
  });
  const controller = new PlaybackController(player, options);
  supervisors.push(player);
  controllers.push(controller);
  // Everything the user would be told, in the order it was said (PLAYER-10).
  const notices: Array<{ kind: string; message: string; count: number; stopped: boolean }> = [];
  controller.onNotice((notice) => notices.push(notice));
  return { player, controller, notices };
}

async function waitFor(
  predicate: () => boolean,
  { timeoutMs = 12_000, intervalMs = 25 } = {},
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error("timed out waiting for condition");
}

afterEach(async () => {
  for (const controller of controllers.splice(0)) controller.dispose();
  for (const player of supervisors.splice(0)) await player.dispose();
});

describeWithMpv("a queue playing through real mpv", () => {
  it("advances to the next track by itself", async () => {
    // No `next()` anywhere in this test: mpv reaches the appended entry on its
    // own, which is only possible because it was preloaded.
    const { controller } = makeController();
    await controller.playQueue(
      [{ filePath: fixture("tone.flac"), title: "one" }, { filePath: fixture("tone.wav"), title: "two" }],
      0,
    );

    await waitFor(() => controller.queueWindow(0, 1_000).items[1].status === "playing");

    expect(controller.snapshot().queue.currentId).toBe(controller.queueWindow(0, 1_000).items[1].id);
  });

  it("plays a three-track queue end to end unattended", async () => {
    const { controller } = makeController();
    await controller.playQueue(
      [
        { filePath: fixture("tone.flac"), title: "one" },
        { filePath: fixture("tone.wav"), title: "two" },
        { filePath: fixture("tone.aiff"), title: "three" },
      ],
      0,
    );

    await waitFor(() => controller.queueWindow(0, 1_000).items[2].status === "playing");

    expect(controller.queueWindow(0, 1_000).items.map((i) => i.title)).toEqual([
      "one",
      "two",
      "three",
    ]);
  });

  it("stops at the end of the queue", async () => {
    const { controller } = makeController();
    await controller.playQueue([{ filePath: fixture("tone.flac"), title: "only" }], 0);

    await waitFor(() => controller.snapshot().queue.currentId === null);

    expect(controller.queueWindow(0, 1_000).items).toHaveLength(1);
  });

  it("repeats one track without stopping", async () => {
    const { controller } = makeController();
    await controller.playQueue([{ filePath: fixture("tone.flac"), title: "loop" }], 0);
    await controller.setRepeat("one");

    // Give it long enough to have ended several times over.
    await new Promise((resolve) => setTimeout(resolve, 2500));

    expect(controller.snapshot().queue.currentId).not.toBeNull();
  });

  it("wraps to the start under repeat-all", async () => {
    const { controller } = makeController();
    await controller.playQueue(
      [{ filePath: fixture("tone.flac"), title: "one" }, { filePath: fixture("tone.wav"), title: "two" }],
      1,
    );
    await controller.setRepeat("all");

    await waitFor(() => controller.queueWindow(0, 1_000).items[0].status === "playing");

    expect(controller.snapshot().queue.currentId).toBe(controller.queueWindow(0, 1_000).items[0].id);
  });

  it("skips to the next track on demand", async () => {
    const { controller } = makeController();
    await controller.playQueue(
      [{ filePath: fixture("tone.flac"), title: "one" }, { filePath: fixture("tone.wav"), title: "two" }],
      0,
    );

    await controller.next();

    expect(controller.queueWindow(0, 1_000).items[1].status).toBe("playing");
  });

  it("records a track that will not play, and carries on (DEC-054)", async () => {
    // Watched through the snapshot stream rather than sampled afterwards. The
    // fixtures are a quarter of a second long, so the good track plays *and
    // finishes* almost immediately — by the time a poll looked, nothing would
    // be playing any more, which says nothing about whether it ever did.
    const { controller } = makeController();
    const everPlayed = new Set<string>();
    controller.onSnapshot(({ queue }) => {
      // The snapshot names the playing entry directly now (PLAYER-08); the
      // contents live behind a window.
      if (queue.currentItem?.status === "playing") everPlayed.add(queue.currentItem.title);
    });

    await controller.playQueue(
      [
        { filePath: fixture("definitely-missing.flac"), title: "gone" },
        { filePath: fixture("tone.flac"), title: "fine" },
      ],
      0,
    );

    await waitFor(() => controller.queueWindow(0, 1_000).items[0].status === "failed");
    // mpv walks past the broken entry into the preloaded one by itself.
    await waitFor(() => everPlayed.has("fine"));

    expect(controller.queueWindow(0, 1_000).items[0].status).toBe("failed");
    expect(everPlayed.has("fine")).toBe(true);
  });

  it("crosses into the next track without a gap (PLAYER-12, DEC-056)", async () => {
    // A phase that decided not to crossfade should at least prove it is
    // gapless. "Gapless" here is measured rather than asserted by shape: the
    // time between mpv finishing one file and starting the next, with the real
    // binary and real files.
    //
    // The mechanism is what makes it possible at all — the next file is
    // appended while the current one is still decoding, so mpv walks into it
    // from its own playlist and never waits for CuePoint. If anything ever
    // reverted to loading on `end-file`, the round trip through the IPC socket
    // would show up here as tens of milliseconds.
    const { player, controller } = makeController();
    const marks: Array<{ what: string; at: number }> = [];
    player.onEndFile(() => marks.push({ what: "end", at: Date.now() }));
    player.onStartFile(() => marks.push({ what: "start", at: Date.now() }));

    await controller.playQueue(
      [
        { filePath: fixture("tone.flac"), title: "one" },
        { filePath: fixture("tone.wav"), title: "two" },
      ],
      0,
    );

    await waitFor(() => controller.queueWindow(0, 1_000).items[1].status === "playing");

    const firstEnd = marks.find((mark) => mark.what === "end");
    // The second start: the first is the file this test asked for by hand.
    const secondStart = marks.filter((mark) => mark.what === "start")[1];
    expect(firstEnd).toBeDefined();
    expect(secondStart).toBeDefined();
    // mpv reports both from the same playback loop, so the interval is the
    // hand-off itself and not a round trip to CuePoint and back.
    expect(Math.abs(secondStart!.at - firstEnd!.at)).toBeLessThan(120);
  });

  it("never asks mpv to load the track it already gave it (PLAYER-12)", async () => {
    // The other half of the same claim, and the one that would still hold if
    // the machine were too loaded for the timing above to mean anything: the
    // second track is reached without a second `loadfile … replace`.
    const { player, controller } = makeController();
    const loaded: string[] = [];
    const originalPlay = player.play.bind(player);
    player.play = async (file: string) => {
      loaded.push(file);
      return originalPlay(file);
    };

    await controller.playQueue(
      [
        { filePath: fixture("tone.flac"), title: "one" },
        { filePath: fixture("tone.wav"), title: "two" },
        { filePath: fixture("tone.aiff"), title: "three" },
      ],
      0,
    );

    await waitFor(() => controller.queueWindow(0, 1_000).items[2].status === "playing");

    expect(loaded).toEqual([fixture("tone.flac")]);
  });

  it("says one thing about a whole queue of missing files (DEC-054)", async () => {
    // The disconnected drive, against the real player. Every path is missing,
    // so mpv fails each one as fast as it can open and close a file — which is
    // exactly the situation a toast per failure would turn into a wall of them.
    const { controller, notices } = makeController({ failureWindowMs: 250 });

    await controller.playQueue(
      Array.from({ length: 6 }, (_, index) => ({
        filePath: fixture(`missing-${index}.flac`),
        title: `gone ${index}`,
      })),
      0,
    );

    await waitFor(() => notices.length > 0);
    // Long enough that a second message would have arrived if one were coming.
    await new Promise((resolve) => setTimeout(resolve, 600));

    expect(notices).toHaveLength(1);
    expect(notices[0]!.kind).toBe("track-failed");
    expect(notices[0]!.count).toBeGreaterThan(1);
    expect(notices[0]!.stopped).toBe(true);
    expect(notices[0]!.message).toMatch(/tracks could not be played — playback stopped$/);
    // Nothing is playing and every item carries the mark the panel shows.
    expect(controller.snapshot().playback.playing).toBe(false);
    expect(
      controller.queueWindow(0, 1_000).items.every((item) => item.status === "failed"),
    ).toBe(true);
  });

  it("names the one track that would not play, and keeps going", async () => {
    const { controller, notices } = makeController({ failureWindowMs: 150 });

    await controller.playQueue(
      [
        { filePath: fixture("definitely-missing.flac"), title: "gone" },
        { filePath: fixture("tone.flac"), title: "fine" },
      ],
      0,
    );

    await waitFor(() => notices.length > 0);

    expect(notices[0]!.count).toBe(1);
    expect(notices[0]!.message).toContain("Could not play “gone”");
    // It carried on rather than stopping: the good track is what played.
    expect(notices[0]!.stopped).toBe(false);
  });

  it("plays a track that failed once the file is there again", async () => {
    // DEC-054's transience, end to end: the same queue item, first pointed at
    // nothing and then at a real file, plays the second time.
    const { controller } = makeController({ failureWindowMs: 5_000 });

    await controller.playQueue([{ filePath: fixture("missing-retry.flac"), title: "gone" }], 0);
    await waitFor(() => controller.queueWindow(0, 1_000).items[0].status === "failed");

    await controller.playQueue([{ filePath: fixture("tone.flac"), title: "back" }], 0);

    await waitFor(() => controller.snapshot().queue.currentItem?.status === "playing");
    expect(controller.queueWindow(0, 1_000).items[0].status).toBe("playing");
  });

  it("takes over immediately when the playing track is removed", async () => {
    const { controller } = makeController();
    await controller.playQueue(
      [{ filePath: fixture("tone.flac"), title: "one" }, { filePath: fixture("tone.wav"), title: "two" }],
      0,
    );
    const playingId = controller.snapshot().queue.currentId!;

    await controller.removeFromQueue(playingId);

    expect(controller.queueWindow(0, 1_000).items).toHaveLength(1);
    expect(controller.queueWindow(0, 1_000).items[0].status).toBe("playing");
  });

  it("keeps playing while the queue is edited around it", async () => {
    const { controller } = makeController();
    await controller.playQueue(
      [
        { filePath: fixture("tone.flac"), title: "one" },
        { filePath: fixture("tone.wav"), title: "two" },
      ],
      0,
    );
    const playingId = controller.snapshot().queue.currentId!;

    await controller.addToQueue([{ filePath: fixture("tone.aiff"), title: "three" }]);
    await controller.playNextItems([{ filePath: fixture("tone.m4a"), title: "urgent" }]);

    expect(controller.snapshot().queue.currentId).toBe(playingId);
    expect(controller.queueWindow(0, 1_000).items).toHaveLength(4);
  });

  it("shuffles without interrupting the current track", async () => {
    const { controller } = makeController();
    await controller.playQueue(
      [
        { filePath: fixture("tone.flac"), title: "one" },
        { filePath: fixture("tone.wav"), title: "two" },
        { filePath: fixture("tone.aiff"), title: "three" },
      ],
      0,
    );
    const playingId = controller.snapshot().queue.currentId!;

    await controller.setShuffle(true);

    expect(controller.snapshot().queue.currentId).toBe(playingId);
    expect(controller.snapshot().queue.shuffle).toBe(true);
  });
});
