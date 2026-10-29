import { describe, expect, it } from "vitest";

import { PlaybackController, samePath, type PlaybackRelease } from "./playbackController";
import type { PlayerSupervisor } from "./playerSupervisor";
import { TagWriteRelease, type ReleasablePlayback } from "./tagWriteRelease";

/**
 * The player lets go of a file a tag write replaces (HARDEN-04), with fakes: a stateful
 * stand-in for mpv under the real controller, and a recording stand-in for the controller
 * under the release policy.
 */

function statefulPlayer(initial: { filePath: string | null; position: number | null; paused: boolean }) {
  const calls: string[] = [];
  let playback = { ...initial };
  let entry = 0;
  const player = {
    isRunning: true,
    isIdle: false,
    getSnapshot: () => ({
      status: { available: true, running: true, reconnecting: false, restartAttempts: 0 },
      playback: {
        filePath: playback.filePath,
        playing: playback.filePath !== null && !playback.paused,
        paused: playback.paused,
        positionSeconds: playback.position,
        durationSeconds: null,
        volume: 100,
        muted: false,
      },
      audio: {},
    }),
    onSnapshot: () => () => undefined,
    onStartFile: () => () => undefined,
    onEndFile: () => () => undefined,
    onIdle: () => () => undefined,
    play: async (file: string) => {
      calls.push(`play ${file}`);
      playback = { filePath: file, position: null, paused: false };
      entry += 1;
      return entry;
    },
    enqueue: async (file: string) => {
      calls.push(`enqueue ${file}`);
      entry += 1;
      return entry;
    },
    stopPlayback: async () => {
      calls.push("stop");
      playback = { filePath: null, position: null, paused: false };
    },
    seek: async (seconds: number) => {
      calls.push(`seek ${seconds}`);
    },
    pause: async () => {
      calls.push("pause");
      playback.paused = true;
    },
  };
  return {
    player: player as unknown as PlayerSupervisor,
    calls,
    set: (next: Partial<typeof playback>) => Object.assign(playback, next),
  };
}

const track = (name: string) => ({ filePath: `/music/${name}.flac`, title: name });

describe("the controller letting go of a file", () => {
  it("does nothing when the loaded file is not one being written", async () => {
    const { player, calls } = statefulPlayer({ filePath: "/music/a.flac", position: 10, paused: false });
    const controller = new PlaybackController(player);
    await controller.playQueue([track("a")], 0);
    calls.length = 0;

    const release = await controller.releaseFiles(new Set([samePath("/music/other.flac")]));

    expect(release).toBeNull();
    expect(calls).toEqual([]);
  });

  it("stops the loaded file, and loads it again where it was, still paused", async () => {
    const { player, calls, set } = statefulPlayer({ filePath: "/music/a.flac", position: 0, paused: false });
    const controller = new PlaybackController(player);
    await controller.playQueue([track("a"), track("b")], 0);
    set({ position: 42.5, paused: true });
    calls.length = 0;

    const release = await controller.releaseFiles(new Set([samePath("/music/a.flac")]));

    expect(release).toEqual({ filePath: "/music/a.flac", positionSeconds: 42.5, paused: true });
    expect(calls).toEqual(["stop"]);

    calls.length = 0;
    await controller.reacquire(release as PlaybackRelease);

    expect(calls[0]).toBe("play /music/a.flac");
    expect(calls).toContain("seek 42.5");
    expect(calls[calls.length - 1]).toBe("pause");
  });

  it("does not bring the track back when the person has played something else", async () => {
    const { player, calls } = statefulPlayer({ filePath: "/music/a.flac", position: 5, paused: false });
    const controller = new PlaybackController(player);
    await controller.playQueue([track("a"), track("b")], 0);
    const release = (await controller.releaseFiles(new Set([samePath("/music/a.flac")]))) as PlaybackRelease;

    await controller.playQueue([track("b")], 0);
    calls.length = 0;
    await controller.reacquire(release);

    expect(calls).toEqual([]);
  });
});

function fakeRelease() {
  const events: string[] = [];
  let loaded: string | null = "/music/a.flac";
  const playback: ReleasablePlayback = {
    releaseFiles: async (paths) => {
      if (loaded && paths.has(samePath(loaded))) {
        events.push("released");
        return { filePath: loaded, positionSeconds: 3, paused: false };
      }
      return null;
    },
    reacquire: async () => {
      events.push("reacquired");
    },
  };
  return { playback, events };
}

describe("a tag write", () => {
  const previewAnswer = {
    preview: { preview_id: "p1", changes: [{ file_path: "/music/a.flac" }, { file_path: "/music/b.flac" }] },
  };

  it("releases the loaded file before the job starts and takes it back after it ends", async () => {
    const { playback, events } = fakeRelease();
    const states = ["running", "running", "succeeded"];
    const release = new TagWriteRelease({
      playback,
      jobState: async () => states.shift() ?? "succeeded",
      jobFiles: async () => ({}),
      wait: async () => undefined,
    });
    release.notePreview(previewAnswer);

    const started = await release.startFromPreview("p1", async () => {
      events.push("started");
      return { job_id: "j1" };
    });
    expect(started).toEqual({ job_id: "j1" });
    expect(events).toEqual(["released", "started"]);

    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(events).toEqual(["released", "started", "reacquired"]);
  });

  it("takes the file back at once when the job could not start", async () => {
    const { playback, events } = fakeRelease();
    const release = new TagWriteRelease({
      playback,
      jobState: async () => "succeeded",
      jobFiles: async () => ({}),
    });
    release.notePreview(previewAnswer);

    await expect(
      release.startFromPreview("p1", async () => {
        throw new Error("engine said no");
      }),
    ).rejects.toThrow("engine said no");

    expect(events).toEqual(["released", "reacquired"]);
  });

  it("leaves the player alone when the job does not touch the loaded file", async () => {
    const { playback, events } = fakeRelease();
    const release = new TagWriteRelease({ playback, jobState: async () => "succeeded", jobFiles: async () => ({}) });
    release.notePreview({ preview: { preview_id: "p2", changes: [{ file_path: "/music/zzz.flac" }] } });

    await release.startFromPreview("p2", async () => ({ job_id: "j2" }));

    expect(events).toEqual([]);
  });

  it("leaves the player alone for a preview it never saw", async () => {
    const { playback, events } = fakeRelease();
    const release = new TagWriteRelease({ playback, jobState: async () => "succeeded", jobFiles: async () => ({}) });

    await release.startFromPreview("unknown", async () => ({ job_id: "j3" }));

    expect(events).toEqual([]);
  });

  it("releases for a restore by reading the write job's record", async () => {
    const { playback, events } = fakeRelease();
    const release = new TagWriteRelease({
      playback,
      jobState: async () => "failed",
      jobFiles: async () => ({ writes: [{ file_path: "/music/a.flac" }] }),
      wait: async () => undefined,
    });

    await release.startRestore("old-job", async () => ({ job_id: "r1" }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(events).toEqual(["released", "reacquired"]);
  });

  it("starts anyway when releasing fails", async () => {
    const reports: string[] = [];
    const release = new TagWriteRelease({
      playback: {
        releaseFiles: async () => {
          throw new Error("mpv gone");
        },
        reacquire: async () => undefined,
      },
      jobState: async () => "succeeded",
      jobFiles: async () => ({}),
      report: (message) => reports.push(message),
    });
    release.notePreview({ preview: { preview_id: "p4", changes: [{ file_path: "/music/a.flac" }] } });

    const started = await release.startFromPreview("p4", async () => ({ job_id: "j4" }));

    expect(started.job_id).toBe("j4");
    expect(reports).toHaveLength(1);
  });
});
