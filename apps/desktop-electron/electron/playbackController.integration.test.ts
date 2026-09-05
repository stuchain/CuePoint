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

function makeController() {
  const player = new PlayerSupervisor({
    packaged: false,
    repoRoot: REPO_ROOT,
    env: process.env,
    mpvArgs: ["--ao=null"],
    positionPushIntervalMs: 20,
  });
  const controller = new PlaybackController(player);
  supervisors.push(player);
  controllers.push(controller);
  return { player, controller };
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

    await waitFor(() => controller.snapshot().queue.items[1].status === "playing");

    expect(controller.snapshot().queue.currentId).toBe(controller.snapshot().queue.items[1].id);
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

    await waitFor(() => controller.snapshot().queue.items[2].status === "playing");

    expect(controller.snapshot().queue.items.map((i) => i.title)).toEqual([
      "one",
      "two",
      "three",
    ]);
  });

  it("stops at the end of the queue", async () => {
    const { controller } = makeController();
    await controller.playQueue([{ filePath: fixture("tone.flac"), title: "only" }], 0);

    await waitFor(() => controller.snapshot().queue.currentId === null);

    expect(controller.snapshot().queue.items).toHaveLength(1);
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

    await waitFor(() => controller.snapshot().queue.items[0].status === "playing");

    expect(controller.snapshot().queue.currentId).toBe(controller.snapshot().queue.items[0].id);
  });

  it("skips to the next track on demand", async () => {
    const { controller } = makeController();
    await controller.playQueue(
      [{ filePath: fixture("tone.flac"), title: "one" }, { filePath: fixture("tone.wav"), title: "two" }],
      0,
    );

    await controller.next();

    expect(controller.snapshot().queue.items[1].status).toBe("playing");
  });

  it("records a track that will not play, and carries on (DEC-054)", async () => {
    // Watched through the snapshot stream rather than sampled afterwards. The
    // fixtures are a quarter of a second long, so the good track plays *and
    // finishes* almost immediately — by the time a poll looked, nothing would
    // be playing any more, which says nothing about whether it ever did.
    const { controller } = makeController();
    const everPlayed = new Set<string>();
    controller.onSnapshot(({ queue }) => {
      for (const item of queue.items) {
        if (item.status === "playing") everPlayed.add(item.title);
      }
    });

    await controller.playQueue(
      [
        { filePath: fixture("definitely-missing.flac"), title: "gone" },
        { filePath: fixture("tone.flac"), title: "fine" },
      ],
      0,
    );

    await waitFor(() => controller.snapshot().queue.items[0].status === "failed");
    // mpv walks past the broken entry into the preloaded one by itself.
    await waitFor(() => everPlayed.has("fine"));

    expect(controller.snapshot().queue.items[0].status).toBe("failed");
    expect(everPlayed.has("fine")).toBe(true);
  });

  it("takes over immediately when the playing track is removed", async () => {
    const { controller } = makeController();
    await controller.playQueue(
      [{ filePath: fixture("tone.flac"), title: "one" }, { filePath: fixture("tone.wav"), title: "two" }],
      0,
    );
    const playingId = controller.snapshot().queue.currentId!;

    await controller.removeFromQueue(playingId);

    expect(controller.snapshot().queue.items).toHaveLength(1);
    expect(controller.snapshot().queue.items[0].status).toBe("playing");
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
    expect(controller.snapshot().queue.items).toHaveLength(4);
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
