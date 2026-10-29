import { describe, expect, it, vi } from "vitest";

import { Backups, validBackupName, withUnchanged, type BackupsDeps, type RestoreEvent } from "./backups";
import type { EngineJobList } from "./engineClient";
import type { EngineRunResult, EngineStatus } from "./engineSupervisor";

const UP: EngineStatus = { connected: true };
const TOKEN = { maintenance: true };
const DOWN: EngineStatus = { connected: false, error: "Engine not running" };

function jobs(...states: string[]): EngineJobList {
  return {
    jobs: states.map((state, i) => ({
      id: `job-${i}`,
      type: "import",
      state: state as "running",
      created_at: "",
      updated_at: "",
    })),
    active_count: states.length,
  };
}

function ran(partial: Partial<EngineRunResult> = {}): EngineRunResult {
  return { code: 0, stdout: "", stderr: "", timedOut: false, ...partial };
}

/** A fake engine that records the order of everything done to it. */
function harness(options: { active?: string[][]; run?: () => Promise<EngineRunResult>; status?: EngineStatus } = {}) {
  const calls: string[] = [];
  const events: RestoreEvent[] = [];
  const queue = [...(options.active ?? [[]])];
  let status = options.status ?? UP;
  const deps: BackupsDeps = {
    engine: {
      getStatus: () => status,
      listBackups: async () => ({ backups: [], folder: "/lib/backups" }),
      createBackup: async () => {
        calls.push("create");
        return { name: "b.db", createdAt: "", reason: "manual", appVersion: null, bytes: 1 };
      },
      listJobs: async () => {
        calls.push("listJobs");
        const next = queue.length > 1 ? queue.shift()! : (queue[0] ?? []);
        return jobs(...next);
      },
      cancelJob: async (id) => {
        calls.push(`cancel:${id}`);
      },
      stopForMaintenance: async () => {
        calls.push("stop");
        status = DOWN;
        return TOKEN;
      },
      runOnce: async (args, timeout) => {
        calls.push(`run:${args.join(" ")}:${timeout > 0}`);
        return (options.run ?? (async () => ran()))();
      },
      start: async (token) => {
        calls.push(token === TOKEN ? "start" : "start:no-token");
        status = UP;
        return UP;
      },
    },
    shell: {
      openPath: vi.fn(async () => ""),
      showItemInFolder: vi.fn(),
    },
    join: (folder, name) => `${folder}/${name}`,
    notify: (event) => events.push(event),
    sleep: async () => undefined,
    cancelWaitMs: 2000,
  };
  return { deps, calls, events, backups: new Backups(deps) };
}

describe("restore", () => {
  it("stops the engine, runs the restore with the backup's name, starts the engine, in that order", async () => {
    const h = harness();
    const result = await h.backups.restore("2025-launch.db");

    expect(result).toEqual({ ok: true, engineRunning: true });
    expect(h.calls.filter((c) => c !== "listJobs")).toEqual(["stop", "run:--restore 2025-launch.db:true", "start"]);
    expect(h.events.map((e) => e.phase)).toEqual(["stopping", "restoring", "starting", "restored"]);
  });

  it("names the copy the restore kept", async () => {
    const h = harness({ run: async () => ran({ stdout: '{"safety_backup": "x-pre-restore.db"}\n' }) });
    expect(await h.backups.restore("a.db")).toEqual({ ok: true, safetyBackup: "x-pre-restore.db", engineRunning: true });
    expect(h.events.at(-1)).toEqual({ phase: "restored", safetyBackup: "x-pre-restore.db" });
  });

  it("uses the maintenance stop, which counts nothing as a crash, and never the plain one", async () => {
    const h = harness();
    await h.backups.restore("a.db");
    expect(h.calls).toContain("stop");
    expect("stop" in h.deps.engine).toBe(false);
    expect("restart" in h.deps.engine).toBe(false);
  });

  it("parses the failure line and still starts the engine", async () => {
    const h = harness({
      run: async () =>
        ran({
          code: 1,
          stderr: 'warming up\n{"error_code": "BACKUP_CORRUPT", "message": "That backup is damaged."}\n',
        }),
    });
    const result = await h.backups.restore("a.db");

    expect(result).toEqual({
      ok: false,
      errorCode: "BACKUP_CORRUPT",
      message: "That backup is damaged. Your library was not changed.",
    });
    expect(h.calls.at(-1)).toBe("start");
    expect(h.events.map((e) => e.phase)).toEqual(["stopping", "restoring", "starting", "failed"]);
  });

  it("gives a plain failure when stderr is not the expected line, without claiming the library is unchanged", async () => {
    const h = harness({ run: async () => ran({ code: 3, stderr: "Traceback..." }) });
    const result = await h.backups.restore("a.db");
    expect(result).toMatchObject({ ok: false, errorCode: "RESTORE_FAILED" });
    expect((result as { message: string }).message).toContain("checked your library when it opened again");
    expect((result as { message: string }).message).not.toContain("was not changed");
    expect(h.calls.at(-1)).toBe("start");
  });

  it("starts the engine when the spawn throws", async () => {
    const h = harness({
      run: async () => {
        throw new Error("spawn EACCES");
      },
    });
    const result = await h.backups.restore("a.db");
    expect(result).toMatchObject({ ok: false, errorCode: "RESTORE_FAILED" });
    expect(h.calls.at(-1)).toBe("start");
  });

  it("starts the engine when the spawn fails", async () => {
    const h = harness({ run: async () => ran({ code: null, spawnError: "ENOENT" }) });
    expect(await h.backups.restore("a.db")).toMatchObject({ ok: false, errorCode: "RESTORE_FAILED" });
    expect(h.calls.at(-1)).toBe("start");
  });

  it("starts the engine when the restore times out", async () => {
    const h = harness({ run: async () => ran({ code: null, timedOut: true }) });
    expect(await h.backups.restore("a.db")).toMatchObject({ ok: false, errorCode: "RESTORE_TIMED_OUT" });
    expect(h.calls.at(-1)).toBe("start");
  });

  it("reports a restore that worked but an engine that did not come back", async () => {
    const h = harness();
    h.deps.engine.start = async () => {
      h.calls.push("start");
      return DOWN;
    };
    expect(await h.backups.restore("a.db")).toEqual({ ok: true, engineRunning: false });
  });

  it("restores when the engine is already down, without asking it about work", async () => {
    const h = harness({ status: DOWN });
    expect((await h.backups.restore("a.db")).ok).toBe(true);
    expect(h.calls).not.toContain("listJobs");
  });

  it("refuses a name that is not a file name, touching nothing", async () => {
    const h = harness();
    for (const bad of ["", "../x.db", "a/b.db", "a\\b.db", ".hidden", 7, null, undefined]) {
      expect(await h.backups.restore(bad)).toMatchObject({ ok: false, errorCode: "BACKUP_INVALID_NAME" });
    }
    expect(h.calls).toEqual([]);
  });

  it("words nothing for the person with database, schema or engine", async () => {
    const h = harness({ run: async () => ran({ code: null, timedOut: true }) });
    const results = [
      await h.backups.restore("a.db"),
      await harness({ run: async () => ran({ code: null, spawnError: "x" }) }).backups.restore("a.db"),
      await harness({ active: [["running"]] }).backups.restore("a.db"),
    ];
    for (const result of results) {
      if (!result.ok) expect(result.message).not.toMatch(/database|schema|engine/i);
    }
  });
});

describe("work that is running", () => {
  it("returns WORK_RUNNING and stops nothing", async () => {
    const h = harness({ active: [["running", "queued"]] });
    const result = await h.backups.restore("a.db");

    expect(result).toMatchObject({
      ok: false,
      errorCode: "WORK_RUNNING",
      running: [
        { id: "job-0", type: "import", state: "running" },
        { id: "job-1", type: "import", state: "queued" },
      ],
    });
    expect(h.calls).toEqual(["listJobs"]);
    expect(h.events).toEqual([]);
  });

  it("cancels through the job API, waits until it is done, then proceeds", async () => {
    const h = harness({ active: [["running"], ["running"], []] });
    const result = await h.backups.restore("a.db", { cancelRunning: true });

    expect(result.ok).toBe(true);
    const steps = h.calls;
    expect(steps.indexOf("cancel:job-0")).toBeGreaterThan(-1);
    expect(steps.indexOf("cancel:job-0")).toBeLessThan(steps.indexOf("stop"));
    // the check, two waits, and the look right before stopping
    expect(steps.filter((c) => c === "listJobs").length).toBe(4);
    expect(steps.at(-1)).toBe("start");
  });

  it("does not stop the engine when the work will not stop", async () => {
    const h = harness({ active: [["running"]] });
    h.deps.cancelWaitMs = 1500;
    const result = await h.backups.restore("a.db", { cancelRunning: true });

    expect(result).toMatchObject({ ok: false, errorCode: "WORK_NOT_STOPPED" });
    expect(h.calls).not.toContain("stop");
    expect(h.calls).not.toContain("start");
  });

  it("looks again right before stopping and refuses if work started meanwhile", async () => {
    const h = harness({ active: [["running"], [], ["running"]] });
    const result = await h.backups.restore("a.db", { cancelRunning: true });
    expect(result).toMatchObject({ ok: false, errorCode: "WORK_RUNNING" });
    expect(h.calls).not.toContain("stop");
  });

  it("will not restore when it cannot tell whether work is running", async () => {
    const h = harness();
    h.deps.engine.listJobs = async () => {
      throw new Error("down");
    };
    expect(await h.backups.restore("a.db")).toMatchObject({ ok: false, errorCode: "WORK_UNKNOWN" });
    expect(h.calls).toEqual([]);
  });
});

describe("one restore at a time", () => {
  it("refuses a second while the first is going on, and allows one after it", async () => {
    let release: (value: EngineRunResult) => void = () => undefined;
    let held = true;
    const h = harness({
      run: () => (held ? new Promise<EngineRunResult>((resolve) => (release = resolve)) : Promise.resolve(ran())),
    });

    const first = h.backups.restore("a.db");
    await vi.waitFor(() => expect(h.calls.some((c) => c.startsWith("run:"))).toBe(true));
    expect(h.backups.isRestoring()).toBe(true);

    expect(await h.backups.restore("b.db")).toMatchObject({ ok: false, errorCode: "RESTORE_IN_PROGRESS" });
    await expect(h.backups.createBackup()).rejects.toThrow(/restored/);
    expect(h.calls.filter((c) => c.startsWith("run:")).length).toBe(1);

    held = false;
    release(ran());
    expect((await first).ok).toBe(true);
    expect(h.backups.isRestoring()).toBe(false);
    expect((await h.backups.restore("b.db")).ok).toBe(true);
  });

  it("lets the next restore run after a failed one", async () => {
    const h = harness({ run: async () => ran({ code: 1 }) });
    expect((await h.backups.restore("a.db")).ok).toBe(false);
    expect(h.backups.isRestoring()).toBe(false);
  });
});

describe("quitting during a restore", () => {
  it("waits for the restore, and does not start the engine behind the quit", async () => {
    let release: (value: EngineRunResult) => void = () => undefined;
    const h = harness({ run: () => new Promise<EngineRunResult>((resolve) => (release = resolve)) });
    const restoring = h.backups.restore("a.db");
    await vi.waitFor(() => expect(h.calls.some((c) => c.startsWith("run:"))).toBe(true));

    h.backups.beginQuit();
    let settled = false;
    void h.backups.settled().then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);

    release(ran());
    expect((await restoring).ok).toBe(true);
    await h.backups.settled();
    expect(settled).toBe(true);
    expect(h.calls).not.toContain("start");
    expect(h.calls).not.toContain("start:no-token");
  });

  it("begins no restore once quitting", async () => {
    const h = harness();
    h.backups.beginQuit();
    expect(await h.backups.restore("a.db")).toMatchObject({ ok: false, errorCode: "APP_QUITTING" });
    expect(h.calls).toEqual([]);
  });
});

describe("list, create, show in folder", () => {
  it("lists and creates through the engine", async () => {
    const h = harness();
    expect((await h.backups.listBackups()).folder).toBe("/lib/backups");
    expect((await h.backups.createBackup()).name).toBe("b.db");
  });

  it("opens the folder, or shows one backup in it", async () => {
    const h = harness();
    expect(await h.backups.showInFolder()).toBe(true);
    expect(h.deps.shell.openPath).toHaveBeenCalledWith("/lib/backups");
    expect(await h.backups.showInFolder("a.db")).toBe(true);
    expect(h.deps.shell.showItemInFolder).toHaveBeenCalledWith("/lib/backups/a.db");
  });

  it("falls back to showing the folder when it cannot be opened, and says no when it is not known", async () => {
    const h = harness();
    h.deps.shell.openPath = vi.fn(async () => "no such folder");
    await h.backups.showInFolder();
    expect(h.deps.shell.showItemInFolder).toHaveBeenCalledWith("/lib/backups");

    h.deps.engine.listBackups = async () => {
      throw new Error("down");
    };
    expect(await h.backups.showInFolder()).toBe(false);
    expect(await h.backups.showInFolder("../x")).toBe(false);
  });
});

describe("validBackupName", () => {
  it("accepts a file name and nothing else", () => {
    expect(validBackupName("cuepoint-20251007-140200-manual.db")).toBe(true);
    for (const bad of ["", "..", "a/b", "a\\b", "a\0b", ".x", "x".repeat(256), 3]) expect(validBackupName(bad)).toBe(false);
  });
});

describe("withUnchanged", () => {
  it("ends with a full stop and says the library was not changed once", () => {
    expect(withUnchanged("That backup is damaged")).toBe("That backup is damaged. Your library was not changed.");
    expect(withUnchanged("That backup is damaged. Your library was not changed.")).toBe(
      "That backup is damaged. Your library was not changed.",
    );
    expect(withUnchanged("Nothing was changed.")).toBe("Nothing was changed.");
  });
});
