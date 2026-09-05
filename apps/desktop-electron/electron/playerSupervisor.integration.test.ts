import { spawn as nodeSpawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import { PlayerSupervisor } from "./playerSupervisor";
import { resolvePlayerBinary } from "./playerLaunch";

/**
 * The player supervisor against the **real mpv binary** (PLAYER-03).
 *
 * PLAYER-02 found a protocol bug its unit tests could not: the fake server
 * produced the shape the implementation assumed, so passing against it proved
 * only self-consistency. That was caught by driving the real binary once, by
 * hand. This file is that check made permanent — and this is the step where it
 * belongs, because PLAYER-03 is the one that legitimately spawns a process.
 *
 * Skips when the sidecar has not been fetched, so a clean checkout stays green.
 * CI fetches it on Windows and macOS, which is where it matters; Linux pins no
 * binary at all (PLAYER-01) and skips.
 *
 * `--ao=null` throughout: CI runners have no sound card, and these tests are
 * about process lifecycle and state, not audibility. Whether audio actually
 * reaches a device is a manual check, and it is on the macOS pass.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(here, "../../..");
const FIXTURES = path.join(REPO_ROOT, "src", "tests", "fixtures", "audio");

const binary = resolvePlayerBinary({
  packaged: false,
  repoRoot: REPO_ROOT,
  env: process.env,
});

const describeWithMpv = binary ? describe : describe.skip;

interface Harness {
  supervisor: PlayerSupervisor;
  children: ChildProcess[];
}

const active: PlayerSupervisor[] = [];

function makeSupervisor(): Harness {
  const children: ChildProcess[] = [];
  const supervisor = new PlayerSupervisor({
    packaged: false,
    repoRoot: REPO_ROOT,
    env: process.env,
    // Silent output: CI has no audio device, and a real one would make the
    // suite audible on a developer's machine.
    mpvArgs: ["--ao=null"],
    restartBackoffMs: [50, 50, 50],
    positionPushIntervalMs: 20,
    spawn: ((command: string, args: string[], options: object) => {
      const child = nodeSpawn(command, args, options as never);
      children.push(child);
      return child;
    }) as never,
  });
  active.push(supervisor);
  return { supervisor, children };
}

/** Wait for a condition, polling — real processes settle on their own schedule. */
async function waitFor(
  predicate: () => boolean,
  { timeoutMs = 10_000, intervalMs = 25 } = {},
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error("timed out waiting for condition");
}

/** Is this pid still alive? */
function isAlive(pid: number | undefined): boolean {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

afterEach(async () => {
  for (const supervisor of active.splice(0)) await supervisor.dispose();
});

describeWithMpv("the real player sidecar", () => {
  it("starts nothing until something is played", () => {
    const { supervisor, children } = makeSupervisor();
    expect(supervisor.getStatus().available).toBe(true);
    expect(supervisor.getStatus().running).toBe(false);
    expect(children).toHaveLength(0);
  });

  it("starts mpv on the first play and reports it running", async () => {
    const { supervisor, children } = makeSupervisor();

    await supervisor.play(path.join(FIXTURES, "tone.flac"));

    expect(children).toHaveLength(1);
    expect(supervisor.getStatus().running).toBe(true);
    expect(supervisor.getSnapshot().playback.filePath).toContain("tone.flac");
  });

  it("mirrors real playback state from mpv", async () => {
    // Recorded from the stream rather than polled afterwards: the fixture is a
    // quarter of a second long, so it finishes and mpv drops `duration` back to
    // null long before a poll could catch it. What matters is that the real
    // duration reached the supervisor at all.
    const { supervisor } = makeSupervisor();
    const durations: number[] = [];
    supervisor.onSnapshot(({ playback }) => {
      if (typeof playback.durationSeconds === "number") durations.push(playback.durationSeconds);
    });

    await supervisor.play(path.join(FIXTURES, "tone.flac"));
    await waitFor(() => durations.length > 0);

    expect(durations[0]).toBeGreaterThan(0);
    expect(durations[0]).toBeLessThan(5); // the fixture, not something else
  });

  it("pushes state to listeners as playback progresses", async () => {
    const { supervisor } = makeSupervisor();
    const snapshots: unknown[] = [];
    supervisor.onSnapshot((snapshot) => snapshots.push(snapshot));

    await supervisor.play(path.join(FIXTURES, "tone.flac"));
    await waitFor(() => snapshots.length > 1);

    expect(snapshots.length).toBeGreaterThan(1);
  });

  it("getSnapshot agrees with the last pushed snapshot", async () => {
    // The acceptance criterion in the step: what a caller reads must match what
    // the stream last said.
    const { supervisor } = makeSupervisor();
    let last: ReturnType<PlayerSupervisor["getSnapshot"]> | null = null;
    supervisor.onSnapshot((snapshot) => {
      last = snapshot;
    });

    await supervisor.play(path.join(FIXTURES, "tone.flac"));
    await waitFor(() => last !== null);

    expect(supervisor.getSnapshot().status.running).toBe(last!.status.running);
    expect(supervisor.getSnapshot().playback.filePath).toBe(last!.playback.filePath);
  });

  it("reaches the end of a track and says so", async () => {
    const { supervisor } = makeSupervisor();
    const reasons: string[] = [];
    supervisor.onEndFile((info) => reasons.push(info.reason));

    await supervisor.play(path.join(FIXTURES, "tone.flac"));
    await waitFor(() => reasons.length > 0);

    expect(reasons[0]).toBe("eof");
  });

  it("reports a file that will not play, with mpv's reason", async () => {
    // What DEC-054 and PLAYER-10 are built on, verified against the real
    // decoder rather than a fake that echoes our assumptions.
    const { supervisor } = makeSupervisor();
    const failures: Array<{ reason: string; error?: string }> = [];
    supervisor.onEndFile((info) => failures.push(info));

    await supervisor.play(path.join(FIXTURES, "definitely-missing.flac"));
    await waitFor(() => failures.length > 0);

    expect(failures[0].reason).toBe("error");
    expect(failures[0].error).toBeTruthy();
  });

  it("pauses and resumes a real stream", async () => {
    const { supervisor } = makeSupervisor();
    await supervisor.play(path.join(FIXTURES, "tone.flac"));

    await supervisor.pause();
    expect(supervisor.getSnapshot().playback.paused).toBe(true);

    await supervisor.resume();
    expect(supervisor.getSnapshot().playback.paused).toBe(false);
  });

  it("sets volume on a running player", async () => {
    const { supervisor } = makeSupervisor();
    await supervisor.play(path.join(FIXTURES, "tone.flac"));

    await supervisor.setVolume(42);

    expect(supervisor.getSnapshot().playback.volume).toBe(42);
  });

  it("brings the player back when the process is killed underneath it", async () => {
    const { supervisor, children } = makeSupervisor();
    await supervisor.play(path.join(FIXTURES, "tone.flac"));
    const firstPid = children[0].pid;

    children[0].kill("SIGKILL");

    await waitFor(() => children.length > 1 && supervisor.getStatus().running);
    expect(children[1].pid).not.toBe(firstPid);
    expect(supervisor.getStatus().running).toBe(true);
  });

  it("leaves no process behind when disposed", async () => {
    // The worst bug this phase could ship: a leaked mpv still holding an audio
    // device after CuePoint is gone. Asserted against the real pid, not assumed.
    const { supervisor, children } = makeSupervisor();
    await supervisor.play(path.join(FIXTURES, "tone.flac"));
    const pid = children[0].pid;
    expect(isAlive(pid)).toBe(true);

    await supervisor.dispose();
    await waitFor(() => !isAlive(pid), { timeoutMs: 8000 });

    expect(isAlive(pid)).toBe(false);
  });

  it("leaves no process behind when stopped and started again", async () => {
    const { supervisor, children } = makeSupervisor();
    await supervisor.play(path.join(FIXTURES, "tone.flac"));
    const firstPid = children[0].pid;

    await supervisor.stop();
    await waitFor(() => !isAlive(firstPid), { timeoutMs: 8000 });
    await supervisor.play(path.join(FIXTURES, "tone.flac"));

    expect(children).toHaveLength(2);
    expect(isAlive(firstPid)).toBe(false);
    expect(isAlive(children[1].pid)).toBe(true);
  });

  it("plays a second track without restarting the process", async () => {
    const { supervisor, children } = makeSupervisor();
    await supervisor.play(path.join(FIXTURES, "tone.flac"));
    await supervisor.play(path.join(FIXTURES, "tone.wav"));

    expect(children).toHaveLength(1);
    expect(supervisor.getSnapshot().playback.filePath).toContain("tone.wav");
  });
});

describe("without a player installed", () => {
  it("reports unavailable rather than throwing at construction", () => {
    // PLAYER-01's cross-cutting fact 4: a build with no mpv still runs.
    const supervisor = new PlayerSupervisor({
      packaged: false,
      repoRoot: REPO_ROOT,
      env: {},
      exists: () => false,
    });
    const status = supervisor.getStatus();
    expect(status.available).toBe(false);
    expect(status.error).toBeTruthy();
  });
});
